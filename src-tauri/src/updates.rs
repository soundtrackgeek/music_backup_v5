use anyhow::{bail, Context, Result};
use rusqlite::{params, Connection};

#[cfg(not(test))]
use tauri::AppHandle;

use crate::{
    db,
    models::{
        LibraryUpdate, LibraryUpdateArtistResponse, LibraryUpdateArtistSummary,
        LibraryUpdateRequest, LibraryUpdateResponse, LibraryUpdateSummary, NewLibraryArtist,
    },
};

const UPDATE_SEARCH_WHERE: &str = "
    (?1 = '' OR
        LOWER(COALESCE(album_artist_display, '')) LIKE '%' || LOWER(?1) || '%' OR
        LOWER(COALESCE(album, '')) LIKE '%' || LOWER(?1) || '%' OR
        LOWER(COALESCE(field_label, '')) LIKE '%' || LOWER(?1) || '%' OR
        LOWER(COALESCE(previous_value, '')) LIKE '%' || LOWER(?1) || '%' OR
        LOWER(COALESCE(current_value, '')) LIKE '%' || LOWER(?1) || '%' OR
        LOWER(description) LIKE '%' || LOWER(?1) || '%' OR
        LOWER(source_label) LIKE '%' || LOWER(?1) || '%')
    AND (?2 IS NULL OR created_at >= ?2)
";

#[cfg(not(test))]
pub fn list_for_app(
    app: &AppHandle,
    request: LibraryUpdateRequest,
) -> Result<LibraryUpdateResponse> {
    let (conn, _) = db::open(app)?;
    list_for_connection(&conn, request)
}

#[cfg(not(test))]
pub fn list_artists_for_app(
    app: &AppHandle,
    request: LibraryUpdateRequest,
) -> Result<LibraryUpdateArtistResponse> {
    let (conn, _) = db::open(app)?;
    list_artists_for_connection(&conn, request)
}

fn library_update_summary(
    conn: &Connection,
    query: &str,
    date_from: Option<&str>,
) -> Result<LibraryUpdateSummary> {
    let summary_sql = format!(
        "
        SELECT
            COUNT(*),
            COALESCE(SUM(CASE WHEN change_kind = 'new' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN change_kind = 'changed' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN change_kind = 'removed' THEN 1 ELSE 0 END), 0)
        FROM library_updates
        WHERE {UPDATE_SEARCH_WHERE}
        "
    );
    conn.query_row(&summary_sql, params![query, date_from], |row| {
        Ok(LibraryUpdateSummary {
            all: row.get(0)?,
            new: row.get(1)?,
            changed: row.get(2)?,
            removed: row.get(3)?,
        })
    })
    .context("Could not summarize library update history")
}

pub(crate) fn list_for_connection(
    conn: &Connection,
    request: LibraryUpdateRequest,
) -> Result<LibraryUpdateResponse> {
    let query = request.query.trim().to_string();
    let change_kind = request
        .change_kind
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    if let Some(kind) = change_kind.as_deref() {
        if !matches!(kind, "new" | "changed" | "removed") {
            bail!("Unsupported library update kind: {kind}");
        }
    }
    let date_from = request
        .date_from
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let limit = request.limit.clamp(1, 200);
    let offset = request.offset;

    let summary = library_update_summary(conn, &query, date_from.as_deref())?;

    let total_sql = format!(
        "
        SELECT COUNT(*)
        FROM library_updates
        WHERE {UPDATE_SEARCH_WHERE}
          AND (?3 IS NULL OR change_kind = ?3)
        "
    );
    let total = conn
        .query_row(
            &total_sql,
            params![&query, date_from.as_deref(), change_kind.as_deref()],
            |row| row.get::<_, i64>(0),
        )
        .context("Could not count library update history")?;

    let rows_sql = format!(
        "
        SELECT
            id, import_run_id, created_at, change_kind, category, album_id,
            album_artist_display, album, year, field, field_label,
            previous_value, current_value, change_count, description,
            source_kind, source_label, source_path
        FROM library_updates
        WHERE {UPDATE_SEARCH_WHERE}
          AND (?3 IS NULL OR change_kind = ?3)
        ORDER BY created_at DESC, id DESC
        LIMIT ?4 OFFSET ?5
        "
    );
    let mut statement = conn
        .prepare(&rows_sql)
        .context("Could not prepare the library update history query")?;
    let rows = statement
        .query_map(
            params![
                &query,
                date_from.as_deref(),
                change_kind.as_deref(),
                i64::from(limit),
                i64::from(offset)
            ],
            |row| {
                Ok(LibraryUpdate {
                    id: row.get(0)?,
                    import_run_id: row.get(1)?,
                    created_at: row.get(2)?,
                    change_kind: row.get(3)?,
                    category: row.get(4)?,
                    album_id: row.get(5)?,
                    album_artist_display: row.get(6)?,
                    album: row.get(7)?,
                    year: row.get(8)?,
                    field: row.get(9)?,
                    field_label: row.get(10)?,
                    previous_value: row.get(11)?,
                    current_value: row.get(12)?,
                    change_count: row.get(13)?,
                    description: row.get(14)?,
                    source_kind: row.get(15)?,
                    source_label: row.get(16)?,
                    source_path: row.get(17)?,
                })
            },
        )
        .context("Could not read library update history")?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not collect library update history")?;

    Ok(LibraryUpdateResponse {
        rows,
        total,
        summary,
        limit,
        offset,
    })
}

pub(crate) fn list_artists_for_connection(
    conn: &Connection,
    request: LibraryUpdateRequest,
) -> Result<LibraryUpdateArtistResponse> {
    let query = request.query.trim().to_string();
    let change_kind = request
        .change_kind
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    if let Some(kind) = change_kind.as_deref() {
        if !matches!(kind, "new" | "changed" | "removed") {
            bail!("Unsupported library update kind: {kind}");
        }
    }
    let date_from = request
        .date_from
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let limit = request.limit.clamp(1, 200);
    let offset = request.offset;
    let summary = library_update_summary(conn, &query, date_from.as_deref())?;
    let artist_key_sql = db::artist_key_sql("album_artist_display");

    let filtered_cte = format!(
        "
        WITH filtered AS (
            SELECT
                {artist_key_sql} AS artist_key,
                COALESCE(NULLIF(TRIM(album_artist_display), ''), 'Unknown artist') AS artist_name,
                created_at,
                change_kind,
                category,
                previous_value,
                current_value,
                change_count
            FROM library_updates
            WHERE {UPDATE_SEARCH_WHERE}
              AND (?3 IS NULL OR change_kind = ?3)
        ), impact AS (
            SELECT
                artist_key,
                artist_name,
                created_at,
                CASE
                    WHEN category = 'album' AND change_kind = 'new'
                        THEN COALESCE(change_count, 0)
                    WHEN category = 'tracks' AND change_kind = 'changed'
                         AND CAST(COALESCE(current_value, '0') AS INTEGER)
                             > CAST(COALESCE(previous_value, '0') AS INTEGER)
                        THEN COALESCE(change_count, 0)
                    ELSE 0
                END AS tracks_added,
                CASE
                    WHEN category = 'album' AND change_kind = 'removed'
                        THEN COALESCE(change_count, 0)
                    WHEN category = 'tracks' AND change_kind = 'changed'
                         AND CAST(COALESCE(current_value, '0') AS INTEGER)
                             < CAST(COALESCE(previous_value, '0') AS INTEGER)
                        THEN COALESCE(change_count, 0)
                    ELSE 0
                END AS tracks_removed,
                CASE
                    WHEN category = 'album' AND change_kind IN ('new', 'removed') THEN 0
                    WHEN category = 'tracks' AND change_kind = 'changed'
                         AND CAST(COALESCE(current_value, '0') AS INTEGER)
                             != CAST(COALESCE(previous_value, '0') AS INTEGER) THEN 0
                    WHEN category = 'ratings' THEN MAX(COALESCE(change_count, 1), 1)
                    ELSE 1
                END AS other_changes,
                CASE WHEN category = 'album' AND change_kind = 'new' THEN 1 ELSE 0 END
                    AS albums_added,
                CASE WHEN category = 'album' AND change_kind = 'removed' THEN 1 ELSE 0 END
                    AS albums_deleted
            FROM filtered
        ), grouped AS (
            SELECT
                artist_key,
                MAX(artist_name) AS artist_name,
                SUM(tracks_added) AS tracks_added,
                SUM(tracks_removed) AS tracks_removed,
                SUM(other_changes) AS other_changes,
                SUM(albums_added) AS albums_added,
                SUM(albums_deleted) AS albums_deleted,
                MAX(created_at) AS last_updated_at
            FROM impact
            GROUP BY artist_key
        )
        "
    );

    let total_sql = format!("{filtered_cte} SELECT COUNT(*) FROM grouped");
    let total = conn
        .query_row(
            &total_sql,
            params![&query, date_from.as_deref(), change_kind.as_deref()],
            |row| row.get::<_, i64>(0),
        )
        .context("Could not count artist update summaries")?;

    let rows_sql = format!(
        "
        {filtered_cte}
        SELECT
            artist_key,
            artist_name,
            tracks_added + tracks_removed + other_changes AS total_changes,
            tracks_added,
            tracks_removed,
            other_changes,
            albums_added,
            albums_deleted,
            last_updated_at
        FROM grouped
        ORDER BY total_changes DESC, last_updated_at DESC, artist_name COLLATE NOCASE
        LIMIT ?4 OFFSET ?5
        "
    );
    let mut statement = conn
        .prepare(&rows_sql)
        .context("Could not prepare the artist update summary query")?;
    let rows = statement
        .query_map(
            params![
                &query,
                date_from.as_deref(),
                change_kind.as_deref(),
                i64::from(limit),
                i64::from(offset)
            ],
            |row| {
                Ok(LibraryUpdateArtistSummary {
                    artist_key: row.get(0)?,
                    artist_name: row.get(1)?,
                    total_changes: row.get(2)?,
                    tracks_added: row.get(3)?,
                    tracks_removed: row.get(4)?,
                    other_changes: row.get(5)?,
                    albums_added: row.get(6)?,
                    albums_deleted: row.get(7)?,
                    last_updated_at: row.get(8)?,
                })
            },
        )
        .context("Could not read artist update summaries")?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not collect artist update summaries")?;

    let new_artists = if change_kind.as_deref().is_some_and(|kind| kind != "new") {
        Vec::new()
    } else {
        let update_artist_key_sql = db::artist_key_sql("album_artist_display");
        let album_artist_key_sql = db::artist_key_sql("album_artist_display");
        let new_artists_sql = format!(
            "
            WITH update_history AS (
                SELECT
                    {update_artist_key_sql} AS artist_key,
                    MAX(COALESCE(NULLIF(TRIM(album_artist_display), ''), 'Unknown artist'))
                        AS artist_name,
                    SUM(CASE WHEN category = 'album' AND change_kind = 'new' THEN 1 ELSE 0 END)
                        AS albums_added,
                    SUM(CASE WHEN category = 'album' AND change_kind = 'removed' THEN 1 ELSE 0 END)
                        AS albums_removed,
                    MIN(CASE WHEN category = 'album' AND change_kind = 'new' THEN created_at END)
                        AS added_at
                FROM library_updates
                GROUP BY {update_artist_key_sql}
            ), current_library AS (
                SELECT
                    {album_artist_key_sql} AS artist_key,
                    MAX(COALESCE(NULLIF(TRIM(album_artist_display), ''), 'Unknown artist'))
                        AS artist_name,
                    COUNT(*) AS current_albums
                FROM albums
                GROUP BY {album_artist_key_sql}
            ), first_appearances AS (
                SELECT
                    history.artist_key,
                    COALESCE(current_library.artist_name, history.artist_name) AS artist_name,
                    history.added_at
                FROM update_history history
                LEFT JOIN current_library USING (artist_key)
                WHERE history.albums_added > 0
                  AND COALESCE(current_library.current_albums, 0)
                      + history.albums_removed - history.albums_added = 0
            )
            SELECT artist_key, artist_name, added_at
            FROM first_appearances
            WHERE (?1 = '' OR LOWER(artist_name) LIKE '%' || LOWER(?1) || '%')
              AND (?2 IS NULL OR added_at >= ?2)
            ORDER BY added_at DESC, artist_name COLLATE NOCASE
            "
        );
        let mut statement = conn
            .prepare(&new_artists_sql)
            .context("Could not prepare the new artist history query")?;
        let artists = statement
            .query_map(params![&query, date_from.as_deref()], |row| {
                Ok(NewLibraryArtist {
                    artist_key: row.get(0)?,
                    artist_name: row.get(1)?,
                    added_at: row.get(2)?,
                })
            })
            .context("Could not read new artist history")?
            .collect::<rusqlite::Result<Vec<_>>>()
            .context("Could not collect new artist history")?;
        artists
    };

    Ok(LibraryUpdateArtistResponse {
        rows,
        new_artists,
        total,
        summary,
        limit,
        offset,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(query: &str, change_kind: Option<&str>) -> LibraryUpdateRequest {
        LibraryUpdateRequest {
            query: query.to_string(),
            change_kind: change_kind.map(str::to_string),
            date_from: None,
            limit: 50,
            offset: 0,
        }
    }

    #[test]
    fn searches_and_filters_durable_library_updates() {
        let conn = Connection::open_in_memory().expect("open test database");
        db::migrate(&conn).expect("migrate test database");
        conn.execute_batch(
            "
            INSERT INTO library_updates (
                created_at, change_kind, category, album_id,
                album_artist_display, album, year, field, field_label,
                previous_value, current_value, description,
                source_kind, source_label
            ) VALUES
                ('2026-07-30T12:00:00Z', 'new', 'album', 'album-1',
                 'Pepsi & Shirlie', 'All Right Now', 1987, NULL, NULL,
                 NULL, NULL, 'New album', 'library_import', 'Library import #1'),
                ('2026-07-30T12:01:00Z', 'changed', 'metadata', 'album-2',
                 'Head East', 'Gettin'' Lucky', 1977, 'canonical_genre', 'Genre',
                 'Pop Rock', 'AOR', 'Genre changed from Pop Rock to AOR',
                 'library_import', 'Library import #1'),
                ('2026-07-30T12:02:00Z', 'removed', 'album', 'album-3',
                 'Django Reinhardt', 'The Great Artistry Of Django Reinhardt',
                 1954, NULL, NULL, NULL, NULL, 'Removed album',
                 'library_import', 'Library import #1');
            ",
        )
        .expect("seed update history");

        let response =
            list_for_connection(&conn, request("AOR", None)).expect("search update history");
        assert_eq!(response.total, 1);
        assert_eq!(
            response.rows[0].album_artist_display.as_deref(),
            Some("Head East")
        );
        assert_eq!(response.rows[0].previous_value.as_deref(), Some("Pop Rock"));
        assert_eq!(response.summary.all, 1);

        let response = list_for_connection(&conn, request("", Some("removed")))
            .expect("filter update history");
        assert_eq!(response.total, 1);
        assert_eq!(response.rows[0].change_kind, "removed");
        assert_eq!(response.summary.all, 3);
        assert_eq!(response.summary.new, 1);
        assert_eq!(response.summary.changed, 1);
        assert_eq!(response.summary.removed, 1);
    }

    #[test]
    fn summarizes_track_impact_by_artist_and_finds_true_first_appearances() {
        let conn = Connection::open_in_memory().expect("open test database");
        db::migrate(&conn).expect("migrate test database");
        conn.execute_batch(
            "
            INSERT INTO import_runs (id, source_path, started_at, status)
            VALUES (1, 'library.tsv', '2026-07-31T12:00:00Z', 'completed');

            INSERT INTO albums (
                id, import_run_id, album, album_artist_display,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio
            ) VALUES
                ('bon-old', 1, 'Slippery When Wet', 'Bon Jovi', 10, 0, 0, 2400, 0, 0, 0),
                ('bon-new', 1, 'Forever', 'Bon Jovi', 12, 0, 0, 2800, 0, 0, 0),
                ('thorleifs-new', 1, 'Thorleifs', 'Thorleifs', 11, 0, 0, 2500, 0, 0, 0);

            INSERT INTO library_updates (
                created_at, change_kind, category, album_id,
                album_artist_display, album, year, field, field_label,
                previous_value, current_value, change_count, description,
                source_kind, source_label
            ) VALUES
                ('2026-07-31T10:00:00Z', 'removed', 'album', 'zimmer-1',
                 'Hans Zimmer', 'Score One', 2001, NULL, NULL,
                 NULL, NULL, 10, 'Removed album', 'library_import', 'Library import #1'),
                ('2026-07-31T10:00:00Z', 'removed', 'album', 'zimmer-2',
                 'Hans Zimmer', 'Score Two', 2002, NULL, NULL,
                 NULL, NULL, 12, 'Removed album', 'library_import', 'Library import #1'),
                ('2026-07-31T10:00:00Z', 'removed', 'album', 'zimmer-3',
                 'Hans Zimmer', 'Score Three', 2003, NULL, NULL,
                 NULL, NULL, 12, 'Removed album', 'library_import', 'Library import #1'),
                ('2026-07-31T10:01:00Z', 'new', 'album', 'bon-new',
                 'Bon Jovi', 'Forever', 2024, NULL, NULL,
                 NULL, NULL, 12, 'New album', 'library_import', 'Library import #1'),
                ('2026-07-31T10:02:00Z', 'changed', 'ratings', 'leppard-1',
                 'Def Leppard', 'Hysteria', 1987, 'rated_tracks', 'Track ratings',
                 '0', '27', 27, '27 track ratings added', 'library_import', 'Library import #1'),
                ('2026-07-31T10:03:00Z', 'new', 'album', 'thorleifs-new',
                 'Thorleifs', 'Thorleifs', 2026, NULL, NULL,
                 NULL, NULL, 11, 'New album', 'library_import', 'Library import #1');
            ",
        )
        .expect("seed artist update history");

        let response = list_artists_for_connection(&conn, request("", None))
            .expect("summarize artist update history");

        let hans = response
            .rows
            .iter()
            .find(|artist| artist.artist_name == "Hans Zimmer")
            .expect("Hans Zimmer summary");
        assert_eq!(hans.total_changes, 34);
        assert_eq!(hans.tracks_removed, 34);
        assert_eq!(hans.albums_deleted, 3);

        let bon_jovi = response
            .rows
            .iter()
            .find(|artist| artist.artist_name == "Bon Jovi")
            .expect("Bon Jovi summary");
        assert_eq!(bon_jovi.total_changes, 12);
        assert_eq!(bon_jovi.tracks_added, 12);
        assert_eq!(bon_jovi.albums_added, 1);

        let def_leppard = response
            .rows
            .iter()
            .find(|artist| artist.artist_name == "Def Leppard")
            .expect("Def Leppard summary");
        assert_eq!(def_leppard.total_changes, 27);
        assert_eq!(def_leppard.other_changes, 27);

        assert_eq!(response.new_artists.len(), 1);
        assert_eq!(response.new_artists[0].artist_name, "Thorleifs");
        assert_eq!(response.new_artists[0].added_at, "2026-07-31T10:03:00Z");
    }
}
