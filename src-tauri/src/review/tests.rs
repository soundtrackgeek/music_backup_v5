use super::*;
use rusqlite::params;

fn catalog() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    crate::db::configure(&conn).unwrap();
    crate::db::migrate(&conn).unwrap();
    conn.execute_batch("INSERT INTO import_runs(id,source_path,started_at,status) VALUES(1,'fixture','2025-01-01','completed');
        INSERT INTO albums(id,import_run_id,album,album_artist_display,canonical_genre,total_tracks,rated_tracks,rating_completeness,total_seconds,loved_tracks,tmoe_seconds,ae_ratio)
        VALUES('a',1,'Album A','Artist A','Pop',10,5,0.5,100,0,0,0),('b',1,'Album B','Artist A','Rock',10,5,0.5,100,0,0,0);") .unwrap();
    conn
}
fn timestamp(date: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(date)
        .unwrap()
        .timestamp()
}
fn request() -> ReviewRequest {
    ReviewRequest {
        start_at: timestamp("2026-02-01T00:00:00Z"),
        end_at: timestamp("2026-03-01T00:00:00Z"),
        previous_start_at: timestamp("2026-01-01T00:00:00Z"),
    }
}
fn event(conn: &Connection, date: &str, album: &str, before: Option<i64>, after: Option<i64>) {
    conn.execute("INSERT INTO rating_events(import_run_id,created_at,event_type,album_id,album,album_artist_display,
        previous_effective_album_rating,current_effective_album_rating,previous_rated_tracks,current_rated_tracks)
        VALUES(1,?1,'ratingChanged',?2,?2,'Artist A',?3,?4,2,4)",params![date,album,before,after]).unwrap();
}
fn addition(conn: &Connection, date: &str, album: &str) {
    conn.execute("INSERT INTO library_updates(created_at,change_kind,category,album_id,album_artist_display,description,source_kind,source_label)
        VALUES(?1,'new','albums',?2,'Artist A','Added','import','Fixture')",params![date,album]).unwrap();
}

#[test]
fn review_counts_first_introductions_and_net_rating_changes_with_exclusive_end() {
    let c = catalog();
    addition(&c, "2026-01-01T00:00:00Z", "a");
    addition(&c, "2026-02-01T00:00:00Z", "b");
    addition(&c, "2026-02-02T00:00:00Z", "b");
    event(&c, "2026-02-01T00:00:00Z", "a", Some(60), Some(100));
    event(&c, "2026-02-20T00:00:00Z", "a", Some(100), Some(80));
    event(&c, "2026-03-01T00:00:00Z", "b", Some(20), Some(100));
    c.execute_batch(
        "INSERT INTO rating_snapshots(import_run_id,created_at,track_count,rated_tracks) VALUES
        (1,'2026-01-31T23:59:59Z',100,40),(1,'2026-02-28T23:59:59Z',100,60);",
    )
    .unwrap();
    let r = report(&c, &request(), request().end_at).unwrap();
    assert_eq!(r.current.albums_added, 1);
    assert_eq!(r.previous.albums_added, 1);
    assert_eq!(r.current.new_artists, 0);
    assert_eq!(r.current.album_ratings_given, 2);
    assert_eq!(r.current.newly_rated_tracks, 4);
    assert!((r.current.completion_change.unwrap() - 0.2).abs() < 0.00001);
    assert_eq!(r.rating_changes.len(), 1);
    assert_eq!(
        (r.rating_changes[0].previous, r.rating_changes[0].current),
        (60, 80)
    );
    assert_eq!(r.top_genres[0].genre, "Rock");
}

#[test]
fn review_handles_empty_history_missing_baseline_and_rejects_invalid_or_future_ranges() {
    let c = catalog();
    let r = report(&c, &request(), request().end_at).unwrap();
    assert_eq!(r.current.albums_added, 0);
    assert!(r.activity_since.is_none());
    assert!(r.current.completion_change.is_none());
    assert!(r.taste_drift.is_empty());
    assert!(report(&c, &request(), request().start_at - 1).is_err());
    assert!(report(
        &c,
        &ReviewRequest {
            previous_start_at: request().start_at,
            ..request()
        },
        request().end_at
    )
    .is_err());
    let r = report(&c, &request(), request().start_at + 100).unwrap();
    assert_eq!(r.end_at, request().start_at + 101);
}

#[test]
fn taste_drift_reconstructs_year_end_favorites_without_future_rating_leakage() {
    let c = catalog();
    event(&c, "2024-01-01T00:00:00Z", "a", None, Some(100));
    event(&c, "2025-01-01T00:00:00Z", "b", None, Some(80));
    event(&c, "2026-02-01T00:00:00Z", "a", Some(100), Some(60));
    event(&c, "2026-04-01T00:00:00Z", "b", Some(80), None);
    let r = report(&c, &request(), request().end_at).unwrap();
    assert_eq!(
        r.taste_drift.iter().map(|y| y.total).collect::<Vec<_>>(),
        vec![1, 2, 1]
    );
    assert_eq!(r.taste_drift[2].genres[0].genre, "Rock");
    assert_eq!(
        r.taste_drift[1]
            .genres
            .iter()
            .map(|g| g.albums)
            .sum::<i64>(),
        2
    );
}
