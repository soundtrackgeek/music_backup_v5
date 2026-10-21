//! A durable, one-entry-per-album view of the existing import rating journal.
//! Reads never invent completion timestamps or modify the catalog/source tags.
use anyhow::Result;
use rusqlite::Connection;
use serde::Serialize;

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RatedAlbum {
    pub album_id: String,
    pub album: String,
    pub artist: String,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub country: Option<String>,
    pub cover_path: Option<String>,
    pub tracks: i64,
    pub seconds: Option<i64>,
    pub album_rating: Option<i32>,
    pub score: Option<f64>,
    pub rated_at: Option<i64>,
    /// completed = observed transition; firstSeen = already complete; unknown = no evidence.
    pub date_kind: String,
    pub in_library: bool,
    pub currently_complete: bool,
}

pub(crate) fn history(conn: &Connection) -> Result<Vec<RatedAlbum>> {
    let artist_key = crate::identity::catalog_artist_key_sql("a.album_artist_display");
    // Rank BEFORE filtering or joining: subsequent score edits, reimports and
    // re-completions must not rewrite an album's first recorded milestone.
    // Keep removed albums using journal metadata, and include legacy complete
    // albums with no journal evidence without assigning today's date to them.
    let sql = format!(
        "WITH full_events AS (
            SELECT e.*, ROW_NUMBER() OVER (
                PARTITION BY album_id ORDER BY julianday(created_at),id) AS position
            FROM rating_events e
            WHERE current_rating_completeness>=1 AND current_rated_tracks>0
        ), first_full AS (SELECT * FROM full_events WHERE position=1),
        ids AS (
            SELECT album_id FROM first_full
            UNION SELECT id FROM albums WHERE rating_completeness>=1 AND total_tracks>0
        )
        SELECT ids.album_id,
            COALESCE(a.album,e.album,'Unknown album'),
            COALESCE(a.album_artist_display,e.album_artist_display,'Unknown artist'),
            COALESCE(a.year,e.year),a.canonical_genre,origin.country_name,c.cache_path,
            COALESCE(a.total_tracks,e.current_rated_tracks,0),a.total_seconds,
            CASE WHEN a.id IS NOT NULL THEN a.effective_album_rating
                 ELSE e.current_effective_album_rating END,a.album_score,
            unixepoch(e.created_at),
            CASE WHEN unixepoch(e.created_at) IS NULL THEN 'unknown'
                 WHEN e.previous_rating_completeness<1 THEN 'completed'
                 ELSE 'firstSeen' END,
            a.id IS NOT NULL,COALESCE(a.rating_completeness>=1 AND a.total_tracks>0,0)
        FROM ids LEFT JOIN first_full e ON e.album_id=ids.album_id
        LEFT JOIN albums a ON a.id=ids.album_id
        LEFT JOIN album_covers c ON c.album_id=a.id
        LEFT JOIN musicbrainz_artist_origin_countries origin ON origin.local_artist_key={artist_key}
        ORDER BY unixepoch(e.created_at) DESC, ids.album_id"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |r| {
        Ok(RatedAlbum {
            album_id: r.get(0)?,
            album: r.get(1)?,
            artist: r.get(2)?,
            year: r.get(3)?,
            genre: r.get(4)?,
            country: r.get(5)?,
            cover_path: r.get(6)?,
            tracks: r.get(7)?,
            seconds: r.get(8)?,
            album_rating: r.get(9)?,
            score: r.get(10)?,
            rated_at: r.get(11)?,
            date_kind: r.get(12)?,
            in_library: r.get(13)?,
            currently_complete: r.get(14)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn rated_album_history(app: tauri::AppHandle) -> Result<Vec<RatedAlbum>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<RatedAlbum>> {
        let (conn, _) = crate::db::open_read(&app)?;
        history(&conn)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn catalog() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::configure(&c).unwrap();
        crate::db::migrate(&c).unwrap();
        c.execute_batch("INSERT INTO import_runs(id,source_path,started_at,status) VALUES(1,'fixture','2026-01-01','completed');
            INSERT INTO albums(id,import_run_id,album,album_artist_display,year,release_year,canonical_genre,total_tracks,rated_tracks,rating_completeness,total_seconds,loved_tracks,tmoe_seconds,ae_ratio,effective_album_rating,album_score)
            VALUES('a',1,'Album A','Artist A',1984,2009,'Pop',10,10,1,2400,0,0,0,90,101.5),
                  ('b',1,'Album B','Artist B',1990,2010,'Rock',12,12,1,3000,0,0,0,80,92),
                  ('c',1,'Partial','Artist C',2000,2020,NULL,10,9,0.9,2700,0,0,0,80,80);").unwrap();
        c
    }
    fn event(c: &Connection, id: &str, at: &str, before: Option<f64>, after: f64) {
        c.execute("INSERT INTO rating_events(import_run_id,created_at,event_type,album_id,album,album_artist_display,
            previous_rating_completeness,current_rating_completeness,current_rated_tracks,current_effective_album_rating)
            VALUES(1,?1,'fixture',?2,'Historical album','Historical artist',?3,?4,10,80)",
            params![at,id,before,after]).unwrap();
    }

    #[test]
    fn first_completion_survives_rerating_reimport_and_removal() {
        let c = catalog();
        event(&c, "a", "2026-01-02T23:30:00Z", Some(0.9), 1.0);
        event(&c, "a", "2026-01-03T00:00:00Z", Some(1.0), 1.0);
        event(&c, "a", "2026-01-04T00:00:00Z", Some(1.0), 0.9);
        event(&c, "a", "2026-01-05T00:00:00Z", Some(0.9), 1.0);
        let rows = history(&c).unwrap();
        assert_eq!(rows.len(), 2); // Legacy B is included; partial C is not.
        let a = &rows[0];
        assert_eq!(a.date_kind, "completed");
        assert_eq!(a.year, Some(1984)); // Album year, never reissue/release year.
        assert_eq!(a.score, Some(101.5));
        assert_eq!(a.album_rating, Some(90));
        let first_at = a.rated_at;
        c.execute("UPDATE albums SET rating_completeness=0.9 WHERE id='a'", [])
            .unwrap();
        assert!(!history(&c).unwrap()[0].currently_complete);
        c.execute("DELETE FROM albums WHERE id='a'", []).unwrap();
        let removed = history(&c).unwrap().remove(0);
        assert_eq!(removed.rated_at, first_at);
        assert!(!removed.in_library);
        assert_eq!(removed.album, "Historical album");
        assert_eq!(removed.tracks, 10);
        assert_eq!(removed.seconds, None);
    }

    #[test]
    fn metadata_uses_reviewed_artist_identity() {
        let c = catalog();
        c.execute_batch("INSERT INTO artist_identities(id,name_key,display_artist)
            VALUES('artist:one','same name','Same Name'),('artist:two','same name','Same Name');
            INSERT INTO artist_album_assignments(album_id,artist_id,source_artist_key)
            VALUES('a','artist:one','same name'),('b','artist:two','same name');
            UPDATE albums SET album_artist_display='Same Name' WHERE id IN ('a','b');
            INSERT INTO musicbrainz_artist_origin_countries(local_artist_key,display_artist,mbid,country_name,created_at,updated_at)
            VALUES('artist:one','Same Name','one','Norway','2026-01-01','2026-01-01'),
                  ('artist:two','Same Name','two','Sweden','2026-01-01','2026-01-01');").unwrap();
        let rows = history(&c).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].country.as_deref(), Some("Norway"));
        assert_eq!(rows[1].country.as_deref(), Some("Sweden"));
    }

    #[test]
    fn already_rated_and_missing_history_never_claim_completion_dates() {
        let c = catalog();
        event(&c, "a", "2026-01-01T00:00:00Z", None, 1.0);
        event(&c, "a", "2026-02-01T00:00:00Z", Some(0.9), 1.0);
        event(&c, "c", "2026-02-01T00:00:00Z", Some(0.1), 0.9);
        let rows = history(&c).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].date_kind, "firstSeen");
        assert_eq!(rows[1].date_kind, "unknown");
        assert_eq!(rows[1].rated_at, None);
        c.execute_batch("DELETE FROM albums; DELETE FROM rating_events;")
            .unwrap();
        assert!(history(&c).unwrap().is_empty());
    }
}
