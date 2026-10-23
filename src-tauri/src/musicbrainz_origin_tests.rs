use super::*;
use std::cell::{Cell, RefCell};
use std::sync::{atomic::AtomicUsize, Arc};

const BLUEBEARD_MBID: &str = "cf34c8f8-141e-4a3e-a728-cafd97bf40c6";

thread_local! {
    static BLOCKING_WRITER: RefCell<Option<Connection>> = const { RefCell::new(None) };
    static BUSY_CALLS: Cell<usize> = const { Cell::new(0) };
}

fn seed_origin(conn: &Connection) {
    db::configure(conn).expect("configure catalog");
    db::ensure_musicbrainz_origin_country_tables(conn).expect("origin schema");
    // The reported artist has an unresolved origin, a valid MBID and an existing
    // US reference row. Keep that shape, including the reference's provenance.
    conn.execute_batch(
        "INSERT INTO musicbrainz_origin_countries
             (country_code, country_name, iso_source, created_at, updated_at)
         VALUES ('US', 'United States', 'artist-country', 'before', 'before');",
    )
    .unwrap();
    conn.execute(
        "INSERT INTO musicbrainz_artist_origin_countries
             (local_artist_key, display_artist, mbid, created_at, updated_at)
         VALUES ('bluebeard', 'Bluebeard', ?1, 'before', 'before')",
        [BLUEBEARD_MBID],
    )
    .unwrap();
}

fn origin_request(code: &str) -> MusicBrainzArtistOriginCountryRequest {
    MusicBrainzArtistOriginCountryRequest {
        artist_key: "bluebeard".to_string(),
        artist_name: "Bluebeard".to_string(),
        // Exercise lookup of the existing unresolved row's MBID inside the save.
        musicbrainz_mbid: None,
        country_code: code.to_string(),
        country_name: None,
    }
}

#[test]
fn manual_origin_retries_a_writer_and_persists_bluebeard_after_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("library.sqlite3");
    let mut conn = Connection::open(&path).unwrap();
    seed_origin(&conn);
    let writer = Connection::open(&path).unwrap();
    writer.execute_batch("BEGIN IMMEDIATE").unwrap();
    BLOCKING_WRITER.with(|slot| *slot.borrow_mut() = Some(writer));
    BUSY_CALLS.with(|calls| calls.set(0));
    conn.busy_handler(Some(|_| {
        BUSY_CALLS.with(|calls| calls.set(calls.get() + 1));
        BLOCKING_WRITER.with(|slot| {
            slot.borrow_mut()
                .take()
                .expect("competing writer")
                .execute_batch("ROLLBACK")
                .unwrap();
        });
        // Fail this attempt even though the lock is now released. Success must
        // come from a fresh save attempt, without scheduling or sleep races.
        false
    }))
    .unwrap();

    let saved = set_artist_origin_country_for_connection(&mut conn, origin_request("us"))
        .expect("retry temporary write contention");
    BUSY_CALLS.with(|calls| assert_eq!(calls.get(), 1));
    assert!(conn.is_autocommit());
    assert_eq!(saved.artist_key, "bluebeard");
    assert_eq!(saved.musicbrainz_mbid.as_deref(), Some(BLUEBEARD_MBID));
    assert_eq!(saved.origin_country_code.as_deref(), Some("US"));
    assert_eq!(saved.origin_country_name.as_deref(), Some("United States"));
    assert_eq!(saved.origin_country_review_state.as_deref(), Some("manual"));
    drop(conn);

    let reopened = Connection::open(&path).unwrap();
    let stored = artist_origin_country_update_for_connection(&reopened, "bluebeard", "Bluebeard")
        .unwrap()
        .unwrap();
    assert_eq!(stored.origin_country_code, saved.origin_country_code);
    assert_eq!(stored.musicbrainz_mbid, saved.musicbrainz_mbid);
    let provenance: (String, String) = reopened
        .query_row(
            "SELECT a.derived_from, c.iso_source
             FROM musicbrainz_artist_origin_countries a
             JOIN musicbrainz_origin_countries c ON c.country_code = a.country_code
             WHERE a.local_artist_key = 'bluebeard'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(provenance, ("manual".into(), "manual".into()));
}

#[test]
fn manual_origin_rolls_back_new_and_existing_references_on_artist_failure() {
    let mut conn = Connection::open_in_memory().unwrap();
    seed_origin(&conn);
    let attempts = Arc::new(AtomicUsize::new(0));
    let observed = Arc::clone(&attempts);
    conn.create_scalar_function(
        "count_origin_attempt",
        0,
        rusqlite::functions::FunctionFlags::SQLITE_UTF8,
        move |_| Ok(observed.fetch_add(1, Ordering::SeqCst) as i64),
    )
    .unwrap();
    conn.execute_batch(
        "CREATE TRIGGER reject_origin BEFORE UPDATE ON musicbrainz_artist_origin_countries
         BEGIN SELECT count_origin_attempt(); SELECT RAISE(ABORT, 'injected artist failure'); END;",
    )
    .unwrap();

    for code in ["GB", "US"] {
        let error = set_artist_origin_country_for_connection(&mut conn, origin_request(code))
            .expect_err("artist write fails");
        assert!(!musicbrainz_database_is_busy(&error));
        let message = artist_origin_country_error(error);
        assert!(message.contains("manual MusicBrainz artist origin-country row"));
        assert!(message.contains("injected artist failure"));
        assert!(!message.contains("database is busy"));
        assert!(conn.is_autocommit());
    }
    assert_eq!(
        attempts.load(Ordering::SeqCst),
        2,
        "permanent failures are not retried"
    );
    let references: Vec<(String, String, String)> = conn
        .prepare("SELECT country_code, iso_source, updated_at FROM musicbrainz_origin_countries")
        .unwrap()
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap();
    assert_eq!(
        references,
        vec![("US".into(), "artist-country".into(), "before".into())]
    );
    let previous = artist_origin_country_update_for_connection(&conn, "bluebeard", "Bluebeard")
        .unwrap()
        .unwrap();
    assert_eq!(previous.origin_country_code, None);
    assert_eq!(
        previous.origin_country_review_state.as_deref(),
        Some("unresolved")
    );
    assert_eq!(previous.musicbrainz_mbid.as_deref(), Some(BLUEBEARD_MBID));
}

#[test]
fn manual_origin_reports_persistent_contention_and_can_be_saved_later() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("library.sqlite3");
    let mut conn = Connection::open(&path).unwrap();
    seed_origin(&conn);
    let writer = Connection::open(&path).unwrap();
    writer.execute_batch("BEGIN IMMEDIATE").unwrap();
    BUSY_CALLS.with(|calls| calls.set(0));
    conn.busy_handler(Some(|_| {
        BUSY_CALLS.with(|calls| calls.set(calls.get() + 1));
        false
    }))
    .unwrap();
    let error = set_artist_origin_country_for_connection(&mut conn, origin_request("US"))
        .expect_err("competing writer still holds the lock");
    BUSY_CALLS.with(|calls| assert_eq!(calls.get(), 3));
    let message = artist_origin_country_error(error);
    assert!(message.contains("library database is busy"));
    assert!(message.contains("try saving again"));
    assert!(message.contains("database is locked"));
    assert!(conn.is_autocommit());
    let unchanged = artist_origin_country_update_for_connection(&conn, "bluebeard", "Bluebeard")
        .unwrap()
        .unwrap();
    assert_eq!(unchanged.origin_country_code, None);

    writer.execute_batch("ROLLBACK").unwrap();
    let saved = set_artist_origin_country_for_connection(&mut conn, origin_request("US"))
        .expect("save after the library becomes available");
    assert_eq!(saved.origin_country_code.as_deref(), Some("US"));
}
