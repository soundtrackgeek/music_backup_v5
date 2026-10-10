use super::*;
use serde_json::json;

const ARTIST: &str = "a74b1b7f-71a5-4011-9441-d0b5e4122711";
const OTHER: &str = "6d7b7cd4-254b-4c25-83f6-dd20f98ceacd";
const RELEASE: &str = "00000000-0000-4000-8000-000000000001";
fn catalog() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    crate::db::configure(&conn).unwrap();
    crate::db::migrate(&conn).unwrap();
    conn.execute_batch("INSERT INTO import_runs(source_path,started_at,status) VALUES('fixture','2026-10-10','completed');
        INSERT INTO albums(id,import_run_id,album,album_artist_display,total_tracks,rated_tracks,rating_completeness,total_seconds,loved_tracks,tmoe_seconds,ae_ratio)
        VALUES('owned',1,'Earlier music','Radiohead',1,0,0,200,0,0,0);").unwrap();
    conn
}
fn artists() -> Vec<RadarArtist> {
    vec![RadarArtist {
        id: "radiohead".into(),
        name: "Radiohead".into(),
        musicbrainz_id: Some(ARTIST.into()),
    }]
}
fn release(date: &str, id: &str) -> FreshRelease {
    FreshRelease {
        artist_credit_name: "Radiohead".into(),
        artist_mbids: vec![ARTIST.into()],
        release_date: date.into(),
        release_group_mbid: id.into(),
        release_name: "Tomorrow".into(),
        release_group_primary_type: Some("Album".into()),
        release_group_secondary_type: None,
    }
}
fn date() -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 10, 10).unwrap()
}

#[test]
fn dates_are_bounded_calendar_month_and_never_invented() {
    let conn = catalog();
    let rows = vec![
        release("2026-09-10", RELEASE),
        release("2026-11-10", "00000000-0000-4000-8000-000000000002"),
        release("2026-11-11", "00000000-0000-4000-8000-000000000003"),
        release("2026-10", "00000000-0000-4000-8000-000000000004"),
    ];
    let radar = project(&conn, artists(), rows, date(), None, false, None).unwrap();
    assert_eq!(radar.releases.len(), 2);
    assert_eq!(radar.upcoming_until, "2026-11-10");
    assert_eq!(radar.recent_since, "2026-09-10");
    let end = project(
        &conn,
        artists(),
        vec![],
        NaiveDate::from_ymd_opt(2027, 1, 31).unwrap(),
        None,
        false,
        None,
    )
    .unwrap();
    assert_eq!(end.upcoming_until, "2027-02-28");
}
#[test]
fn matches_ids_and_collaborations_deduplicates_groups() {
    let conn = catalog();
    let mut unrelated = release("2026-10-11", RELEASE);
    unrelated.artist_mbids = vec![OTHER.into()];
    assert!(
        project(&conn, artists(), vec![unrelated], date(), None, false, None)
            .unwrap()
            .releases
            .is_empty()
    );
    let mut collaboration = release("2026-10-11", RELEASE);
    collaboration.artist_mbids.push(OTHER.into());
    collaboration.artist_credit_name = "Radiohead & M83".into();
    let mut variant = collaboration.clone();
    variant.release_date = "2026-10-12".into();
    let radar = project(
        &conn,
        artists(),
        vec![variant, collaboration],
        date(),
        None,
        false,
        None,
    )
    .unwrap();
    assert_eq!(radar.releases.len(), 1);
    assert_eq!(radar.releases[0].release_date, "2026-10-11");
    assert_eq!(radar.releases[0].artists[0].id, "radiohead");
}
#[test]
fn ownership_and_wishlist_use_existing_catalog_data() {
    let conn = catalog();
    conn.execute("UPDATE albums SET album='Tomorrow' WHERE id='owned'", [])
        .unwrap();
    let radar = project(
        &conn,
        artists(),
        vec![release("2026-10-11", RELEASE)],
        date(),
        None,
        false,
        None,
    )
    .unwrap();
    assert!(radar.releases[0].owned);
    conn.execute(
        "UPDATE albums SET album='Earlier music' WHERE id='owned'",
        [],
    )
    .unwrap();
    crate::wishlist::add_for_connection(
        &conn,
        crate::wishlist::AddWishListItemRequest {
            entity: "album".into(),
            title: "Tomorrow".into(),
            artist: "Radiohead".into(),
            year: Some(2026),
            musicbrainz_id: Some(RELEASE.into()),
            musicbrainz_url: Some(format!("https://musicbrainz.org/release-group/{RELEASE}")),
            source: "New-release radar".into(),
        },
    )
    .unwrap();
    let radar = project(
        &conn,
        artists(),
        vec![release("2026-10-11", RELEASE)],
        date(),
        None,
        false,
        None,
    )
    .unwrap();
    assert!(radar.releases[0].on_wish_list);
    assert!(!radar.releases[0].owned);
}
#[test]
fn all_catalog_artists_and_wish_artists_are_watched_manual_links_win_and_unlinks_block() {
    let conn = catalog();
    conn.execute_batch("INSERT INTO albums(id,import_run_id,album_artist_display,total_tracks,rated_tracks,rating_completeness,total_seconds,loved_tracks,tmoe_seconds,ae_ratio) VALUES('b',1,'M83',1,0,0,200,0,0,0);
        INSERT INTO wish_list_items(entity,title,artist,source,identity_key,created_at,musicbrainz_id) VALUES('artist','Kate Bush','','test','wish','today','4b585938-f271-45e2-b19a-91c634b5e396');").unwrap();
    let cache = HashMap::from([
        ("radiohead".into(), HashSet::from([ARTIST.into()])),
        ("m83".into(), HashSet::from([OTHER.into()])),
    ]);
    assert_eq!(watched_artists(&conn, &cache).unwrap().len(), 3);
    conn.execute("INSERT INTO musicbrainz_artist_links(local_artist_key,display_artist,mbid,verification_state,created_at,updated_at) VALUES('radiohead','Radiohead',?1,'verified','today','today')",[OTHER]).unwrap();
    assert_eq!(
        watched_artists(&conn, &cache)
            .unwrap()
            .iter()
            .find(|a| a.id == "radiohead")
            .unwrap()
            .musicbrainz_id
            .as_deref(),
        Some(OTHER)
    );
    conn.execute("INSERT INTO musicbrainz_artist_link_tombstones(local_artist_key,updated_at) VALUES('m83','today')",[]).unwrap();
    assert!(watched_artists(&conn, &cache)
        .unwrap()
        .iter()
        .find(|a| a.id == "m83")
        .unwrap()
        .musicbrainz_id
        .is_none());
}
#[test]
fn ambiguous_cache_names_remain_unresolved() {
    let cache = Connection::open_in_memory().unwrap();
    cache
        .execute_batch("CREATE TABLE artist_cache(name TEXT,mbid TEXT)")
        .unwrap();
    for (name, id) in [("Radiohead", ARTIST), ("RADIOHEAD", OTHER)] {
        cache
            .execute("INSERT INTO artist_cache VALUES(?1,?2)", params![name, id])
            .unwrap();
    }
    let identities = cache_identities(&cache).unwrap();
    assert_eq!(identities["radiohead"].len(), 2);
    assert!(watched_artists(&catalog(), &identities).unwrap()[0]
        .musicbrainz_id
        .is_none());
}
#[test]
fn stale_snapshots_remain_readable_and_incomplete_responses_cannot_replace_them() {
    let conn = catalog();
    let rows = vec![release("2026-10-11", RELEASE)];
    conn.execute(
        "INSERT INTO release_radar_snapshot VALUES(1,'2026-10-10','2026-10-10T08:00:00Z',?1)",
        [serde_json::to_string(&rows).unwrap()],
    )
    .unwrap();
    let (_, checked, saved) = read_snapshot(&conn).unwrap().unwrap();
    let stale = project(
        &conn,
        artists(),
        saved,
        date(),
        Some(checked),
        true,
        Some("Provider unavailable".into()),
    )
    .unwrap();
    assert!(stale.stale);
    assert_eq!(stale.releases.len(), 1);
    assert_eq!(stale.warning.as_deref(), Some("Provider unavailable"));
    assert!(decode_feed(
        &serde_json::to_vec(&json!({"payload":{"releases":rows,"total_count":2}})).unwrap()
    )
    .is_err());
    assert_eq!(read_snapshot(&conn).unwrap().unwrap().2.len(), 1);
    assert!(schema_exists(&conn).unwrap());
    assert!(!is_fresh("2026-10-09", "2026-10-10T08:00:00Z", date()));
}
#[test]
fn migration_repairs_missing_radar_tables() {
    let conn = catalog();
    conn.execute_batch("DROP TABLE release_radar_snapshot; DROP TABLE release_radar_identities")
        .unwrap();
    crate::db::migrate(&conn).unwrap();
    assert!(schema_exists(&conn).unwrap());
}
