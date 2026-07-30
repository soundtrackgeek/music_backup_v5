use anyhow::{bail, Context, Result};
use rusqlite::{params, Connection};

#[cfg(not(test))]
use tauri::AppHandle;

use crate::{
    db,
    models::{LibraryUpdate, LibraryUpdateRequest, LibraryUpdateResponse, LibraryUpdateSummary},
};

#[cfg(not(test))]
pub fn list_for_app(
    app: &AppHandle,
    request: LibraryUpdateRequest,
) -> Result<LibraryUpdateResponse> {
    let (conn, _) = db::open(app)?;
    list_for_connection(&conn, request)
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

    let search_where = "
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

    let summary_sql = format!(
        "
        SELECT
            COUNT(*),
            COALESCE(SUM(CASE WHEN change_kind = 'new' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN change_kind = 'changed' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN change_kind = 'removed' THEN 1 ELSE 0 END), 0)
        FROM library_updates
        WHERE {search_where}
        "
    );
    let summary = conn
        .query_row(&summary_sql, params![&query, date_from.as_deref()], |row| {
            Ok(LibraryUpdateSummary {
                all: row.get(0)?,
                new: row.get(1)?,
                changed: row.get(2)?,
                removed: row.get(3)?,
            })
        })
        .context("Could not summarize library update history")?;

    let total_sql = format!(
        "
        SELECT COUNT(*)
        FROM library_updates
        WHERE {search_where}
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
        WHERE {search_where}
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
}
