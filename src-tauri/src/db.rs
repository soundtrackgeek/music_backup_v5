use crate::models::{
    BrowseFilters, BrowseRequest, BrowseResponse, BrowseRow, BrowseSort, ChartConfig, ExportResult,
    ExportSearchRequest, ImportRun, LibraryStatus, SaveChartRequest, SaveSearchRequest, SavedChart,
    SavedSearch, TextFilter,
};
use anyhow::{anyhow, bail, Context, Result};
use chrono::Utc;
use rusqlite::{params, params_from_iter, types::Value, Connection};
use rust_xlsxwriter::{Format, Workbook};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

const DB_FILE_NAME: &str = "music-library.sqlite3";
const LATEST_SCHEMA_VERSION: i32 = 3;
static MIGRATION_LOCK: Mutex<()> = Mutex::new(());

pub fn database_path(app: &AppHandle) -> Result<PathBuf> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .context("Could not resolve the app data directory")?;
    fs::create_dir_all(&app_data_dir).context("Could not create the app data directory")?;
    Ok(app_data_dir.join(DB_FILE_NAME))
}

pub fn open(app: &AppHandle) -> Result<(Connection, PathBuf)> {
    let db_path = database_path(app)?;
    let conn = Connection::open(&db_path)
        .with_context(|| format!("Could not open SQLite database at {}", db_path.display()))?;
    configure(&conn)?;
    migrate(&conn)?;
    Ok((conn, db_path))
}

pub fn configure(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        PRAGMA busy_timeout = 15000;
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA temp_store = MEMORY;
        ",
    )
    .context("Could not configure SQLite pragmas")?;
    Ok(())
}

pub fn migrate(conn: &Connection) -> Result<()> {
    let _migration_guard = MIGRATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let user_version = conn
        .query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
        .context("Could not read SQLite schema version")?;

    if user_version >= LATEST_SCHEMA_VERSION && phase_three_schema_exists(conn)? {
        return Ok(());
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS import_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_path TEXT NOT NULL,
            source_size_bytes INTEGER NOT NULL DEFAULT 0,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            status TEXT NOT NULL,
            track_rows INTEGER NOT NULL DEFAULT 0,
            album_count INTEGER NOT NULL DEFAULT 0,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            backup_path TEXT,
            error_message TEXT
        );

        CREATE TABLE IF NOT EXISTS database_backups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            operation TEXT NOT NULL,
            source_path TEXT,
            source_size_bytes INTEGER NOT NULL DEFAULT 0,
            backup_path TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS raw_tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_run_id INTEGER NOT NULL REFERENCES import_runs(id),
            row_number INTEGER NOT NULL,
            display_artist TEXT,
            album_rating TEXT,
            disc_number TEXT,
            album TEXT,
            genre TEXT,
            love TEXT,
            publisher TEXT,
            rating TEXT,
            title TEXT,
            track_number TEXT,
            year_value TEXT,
            release_year TEXT,
            album_unique_id TEXT,
            file_path TEXT,
            filename TEXT,
            album_artist_display TEXT,
            time_value TEXT,
            row_hash TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_run_id INTEGER NOT NULL REFERENCES import_runs(id),
            album_id TEXT NOT NULL,
            album_unique_id TEXT,
            display_artist TEXT,
            album_artist_display TEXT,
            album TEXT,
            title TEXT,
            genre TEXT,
            canonical_genre TEXT,
            genre_normalized TEXT,
            publisher TEXT,
            love TEXT,
            rating_raw TEXT,
            normalized_rating INTEGER,
            album_rating_raw TEXT,
            album_rating INTEGER,
            disc_number INTEGER,
            track_number INTEGER,
            year INTEGER,
            release_year INTEGER,
            time_seconds INTEGER,
            file_path TEXT,
            filename TEXT,
            row_hash TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS albums (
            id TEXT PRIMARY KEY,
            import_run_id INTEGER NOT NULL REFERENCES import_runs(id),
            album_unique_id TEXT,
            album TEXT,
            album_artist_display TEXT,
            canonical_genre TEXT,
            genre_normalized TEXT,
            publisher TEXT,
            year INTEGER,
            release_year INTEGER,
            total_tracks INTEGER NOT NULL,
            rated_tracks INTEGER NOT NULL,
            rating_completeness REAL NOT NULL,
            total_seconds INTEGER NOT NULL,
            loved_tracks INTEGER NOT NULL,
            tmoe_seconds INTEGER NOT NULL,
            ae_ratio REAL NOT NULL,
            album_rating INTEGER,
            calculated_album_rating INTEGER,
            effective_album_rating INTEGER,
            album_score REAL
        );

        CREATE INDEX IF NOT EXISTS idx_tracks_album_id ON tracks(album_id);
        CREATE INDEX IF NOT EXISTS idx_tracks_year ON tracks(year);
        CREATE INDEX IF NOT EXISTS idx_tracks_rating ON tracks(normalized_rating);
        CREATE INDEX IF NOT EXISTS idx_tracks_love ON tracks(love);
        CREATE INDEX IF NOT EXISTS idx_tracks_file ON tracks(file_path, filename);
        CREATE INDEX IF NOT EXISTS idx_albums_unique_id ON albums(album_unique_id);
        CREATE INDEX IF NOT EXISTS idx_albums_year ON albums(year);
        CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(album_artist_display);
        CREATE INDEX IF NOT EXISTS idx_albums_genre ON albums(genre_normalized);
        CREATE INDEX IF NOT EXISTS idx_albums_total_seconds ON albums(total_seconds);
        CREATE INDEX IF NOT EXISTS idx_albums_rating_completeness ON albums(rating_completeness);
        CREATE INDEX IF NOT EXISTS idx_albums_album_score ON albums(album_score);

        CREATE VIRTUAL TABLE IF NOT EXISTS album_search_fts USING fts5(
            album_id UNINDEXED,
            album,
            album_artist_display,
            canonical_genre,
            publisher
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS track_search_fts USING fts5(
            track_id UNINDEXED,
            album_id UNINDEXED,
            title,
            display_artist,
            album,
            album_artist_display,
            canonical_genre,
            publisher,
            file_path,
            filename
        );

        CREATE TABLE IF NOT EXISTS saved_queries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            view TEXT NOT NULL,
            request_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS saved_charts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            config_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS exports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            view TEXT NOT NULL,
            format TEXT NOT NULL,
            row_count INTEGER NOT NULL,
            path TEXT NOT NULL,
            request_json TEXT NOT NULL
        );

        PRAGMA user_version = 3;
        ",
    )
    .map_err(|error| anyhow!("Could not run SQLite migrations: {error}"))?;
    Ok(())
}

fn phase_three_schema_exists(conn: &Connection) -> Result<bool> {
    [
        "album_search_fts",
        "track_search_fts",
        "saved_queries",
        "saved_charts",
        "exports",
    ]
    .into_iter()
    .map(|name| schema_table_exists(conn, name))
    .try_fold(true, |all_exist, exists| {
        exists.map(|exists| all_exist && exists)
    })
}

fn schema_table_exists(conn: &Connection, name: &str) -> Result<bool> {
    conn.query_row(
        "
        SELECT EXISTS(
            SELECT 1
            FROM sqlite_master
            WHERE type = 'table' AND name = ?1
        )
        ",
        params![name],
        |row| row.get::<_, bool>(0),
    )
    .with_context(|| format!("Could not inspect SQLite schema object {name}"))
}

pub fn library_status(app: &AppHandle) -> Result<LibraryStatus> {
    let (conn, db_path) = open(app)?;
    let track_count = count_rows(&conn, "tracks")?;
    let album_count = count_rows(&conn, "albums")?;
    let import_run_count = count_rows(&conn, "import_runs")?;
    let last_import = list_import_runs(&conn, 1)?.into_iter().next();

    Ok(LibraryStatus {
        db_path: db_path.display().to_string(),
        has_database: db_path.exists(),
        track_count,
        album_count,
        import_run_count,
        last_import,
    })
}

pub fn list_import_runs_for_app(app: &AppHandle, limit: u32) -> Result<Vec<ImportRun>> {
    let (conn, _) = open(app)?;
    list_import_runs(&conn, limit)
}

pub fn list_import_runs(conn: &Connection, limit: u32) -> Result<Vec<ImportRun>> {
    let mut stmt = conn.prepare(
        "
        SELECT id, source_path, source_size_bytes, started_at, completed_at, status,
               track_rows, album_count, duration_ms, backup_path, error_message
        FROM import_runs
        ORDER BY id DESC
        LIMIT ?1
        ",
    )?;

    let runs = stmt
        .query_map(params![limit], import_run_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(runs)
}

pub fn get_import_run(conn: &Connection, id: i64) -> Result<ImportRun> {
    conn.query_row(
        "
        SELECT id, source_path, source_size_bytes, started_at, completed_at, status,
               track_rows, album_count, duration_ms, backup_path, error_message
        FROM import_runs
        WHERE id = ?1
        ",
        params![id],
        import_run_from_row,
    )
    .with_context(|| format!("Could not load import run {id}"))
}

pub fn rebuild_search_indexes(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        DELETE FROM album_search_fts;
        DELETE FROM track_search_fts;

        INSERT INTO album_search_fts (
            album_id, album, album_artist_display, canonical_genre, publisher
        )
        SELECT
            id,
            COALESCE(album, ''),
            COALESCE(album_artist_display, ''),
            COALESCE(canonical_genre, ''),
            COALESCE(publisher, '')
        FROM albums;

        INSERT INTO track_search_fts (
            track_id, album_id, title, display_artist, album, album_artist_display,
            canonical_genre, publisher, file_path, filename
        )
        SELECT
            id,
            album_id,
            COALESCE(title, ''),
            COALESCE(display_artist, ''),
            COALESCE(album, ''),
            COALESCE(album_artist_display, ''),
            COALESCE(canonical_genre, ''),
            COALESCE(publisher, ''),
            COALESCE(file_path, ''),
            COALESCE(filename, '')
        FROM tracks;
        ",
    )
    .context("Could not rebuild search indexes")?;
    Ok(())
}

pub fn search_library_for_app(app: &AppHandle, request: BrowseRequest) -> Result<BrowseResponse> {
    let (conn, _) = open(app)?;
    ensure_search_indexes(&conn)?;
    search_library(&conn, request, 500)
}

pub fn list_saved_searches_for_app(app: &AppHandle) -> Result<Vec<SavedSearch>> {
    let (conn, _) = open(app)?;
    let mut stmt = conn.prepare(
        "
        SELECT id, name, view, request_json, created_at, updated_at
        FROM saved_queries
        ORDER BY updated_at DESC, id DESC
        ",
    )?;

    let searches = stmt
        .query_map([], |row| {
            let request_json: String = row.get(3)?;
            let request =
                serde_json::from_str::<BrowseRequest>(&request_json).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        3,
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?;

            Ok(SavedSearch {
                id: row.get(0)?,
                name: row.get(1)?,
                view: row.get(2)?,
                request,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(searches)
}

pub fn save_search_for_app(app: &AppHandle, input: SaveSearchRequest) -> Result<SavedSearch> {
    let (conn, _) = open(app)?;
    let name = input.name.trim();
    if name.is_empty() {
        bail!("Name the search before saving it");
    }

    let now = Utc::now().to_rfc3339();
    let request_json =
        serde_json::to_string(&input.request).context("Could not serialize search")?;
    conn.execute(
        "
        INSERT INTO saved_queries (name, view, request_json, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?4)
        ",
        params![name, input.request.view, request_json, now],
    )
    .context("Could not save search")?;

    let id = conn.last_insert_rowid();
    let saved = list_saved_searches_for_app(app)?
        .into_iter()
        .find(|search| search.id == id)
        .context("Could not reload saved search")?;
    Ok(saved)
}

pub fn delete_saved_search_for_app(app: &AppHandle, id: i64) -> Result<()> {
    let (conn, _) = open(app)?;
    conn.execute("DELETE FROM saved_queries WHERE id = ?1", params![id])
        .with_context(|| format!("Could not delete saved search {id}"))?;
    Ok(())
}

pub fn list_saved_charts_for_app(app: &AppHandle) -> Result<Vec<SavedChart>> {
    let (conn, _) = open(app)?;
    let mut stmt = conn.prepare(
        "
        SELECT id, name, config_json, created_at, updated_at
        FROM saved_charts
        ORDER BY updated_at DESC, id DESC
        ",
    )?;

    let charts = stmt
        .query_map([], |row| {
            let config_json: String = row.get(2)?;
            let config = serde_json::from_str::<ChartConfig>(&config_json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    2,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?;

            Ok(SavedChart {
                id: row.get(0)?,
                name: row.get(1)?,
                config,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(charts)
}

pub fn save_chart_for_app(app: &AppHandle, input: SaveChartRequest) -> Result<SavedChart> {
    let (conn, _) = open(app)?;
    let name = input.name.trim();
    if name.is_empty() {
        bail!("Name the chart before saving it");
    }

    let config = normalize_chart_config(input.config);
    let now = Utc::now().to_rfc3339();
    let config_json = serde_json::to_string(&config).context("Could not serialize chart")?;
    conn.execute(
        "
        INSERT INTO saved_charts (name, config_json, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?3)
        ",
        params![name, config_json, now],
    )
    .context("Could not save chart")?;

    let id = conn.last_insert_rowid();
    let saved = list_saved_charts_for_app(app)?
        .into_iter()
        .find(|chart| chart.id == id)
        .context("Could not reload saved chart")?;
    Ok(saved)
}

pub fn delete_saved_chart_for_app(app: &AppHandle, id: i64) -> Result<()> {
    let (conn, _) = open(app)?;
    conn.execute("DELETE FROM saved_charts WHERE id = ?1", params![id])
        .with_context(|| format!("Could not delete saved chart {id}"))?;
    Ok(())
}

pub fn export_search_for_app(app: &AppHandle, input: ExportSearchRequest) -> Result<ExportResult> {
    let format = input.format.trim().to_lowercase();
    if !matches!(format.as_str(), "csv" | "tsv" | "json" | "txt" | "xlsx") {
        bail!("Unsupported export format: {}", input.format);
    }

    let (conn, _) = open(app)?;
    ensure_search_indexes(&conn)?;

    let mut request = input.request.clone();
    request.offset = 0;
    request.limit = 100_000;
    let response = search_library(&conn, request.clone(), 100_000)?;

    let export_dir = app
        .path()
        .app_data_dir()
        .context("Could not resolve the app data directory")?
        .join("exports");
    fs::create_dir_all(&export_dir).context("Could not create export directory")?;

    let path = export_dir.join(format!(
        "music-library-{}-{}.{}",
        normalize_view(&request.view),
        Utc::now().format("%Y%m%d-%H%M%S"),
        format
    ));

    write_export_file(
        &path,
        &format,
        &request.view,
        &response.rows,
        input.include_calculated,
    )
    .with_context(|| format!("Could not write export {}", path.display()))?;

    let request_json =
        serde_json::to_string(&request).context("Could not serialize export query")?;
    conn.execute(
        "
        INSERT INTO exports (created_at, view, format, row_count, path, request_json)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ",
        params![
            Utc::now().to_rfc3339(),
            normalize_view(&request.view),
            &format,
            response.rows.len() as i64,
            path.display().to_string(),
            request_json
        ],
    )
    .context("Could not record export")?;

    Ok(ExportResult {
        path: path.display().to_string(),
        format,
        row_count: response.rows.len(),
    })
}

fn import_run_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ImportRun> {
    Ok(ImportRun {
        id: row.get(0)?,
        source_path: row.get(1)?,
        source_size_bytes: row.get(2)?,
        started_at: row.get(3)?,
        completed_at: row.get(4)?,
        status: row.get(5)?,
        track_rows: row.get(6)?,
        album_count: row.get(7)?,
        duration_ms: row.get(8)?,
        backup_path: row.get(9)?,
        error_message: row.get(10)?,
    })
}

fn count_rows(conn: &Connection, table: &str) -> Result<i64> {
    let sql = format!("SELECT COUNT(*) FROM {table}");
    conn.query_row(&sql, [], |row| row.get(0))
        .with_context(|| format!("Could not count rows in {table}"))
}

fn ensure_search_indexes(conn: &Connection) -> Result<()> {
    let album_count = count_rows(conn, "albums")?;
    let track_count = count_rows(conn, "tracks")?;
    let album_fts_count = count_rows(conn, "album_search_fts")?;
    let track_fts_count = count_rows(conn, "track_search_fts")?;

    if album_count != album_fts_count || track_count != track_fts_count {
        rebuild_search_indexes(conn)?;
    }

    Ok(())
}

fn search_library(
    conn: &Connection,
    request: BrowseRequest,
    max_limit: u32,
) -> Result<BrowseResponse> {
    let view = normalize_view(&request.view);
    let is_tracks = view == "tracks";
    let limit = request.limit.clamp(1, max_limit);
    let offset = request.offset;
    let filters = &request.filters;

    let select_sql = if is_tracks {
        "
        SELECT
            CAST(t.id AS TEXT),
            t.id,
            t.album_id,
            t.album,
            t.album_artist_display,
            t.display_artist,
            t.title,
            t.canonical_genre,
            COALESCE(t.publisher, a.publisher),
            t.year,
            t.release_year,
            a.total_tracks,
            a.rated_tracks,
            a.rating_completeness,
            a.total_seconds,
            a.loved_tracks,
            a.tmoe_seconds,
            a.ae_ratio,
            a.effective_album_rating,
            a.album_score,
            t.normalized_rating,
            t.disc_number,
            t.track_number,
            t.love,
            t.file_path,
            t.filename
        "
    } else {
        "
        SELECT
            a.id,
            NULL,
            a.id,
            a.album,
            a.album_artist_display,
            NULL,
            NULL,
            a.canonical_genre,
            a.publisher,
            a.year,
            a.release_year,
            a.total_tracks,
            a.rated_tracks,
            a.rating_completeness,
            a.total_seconds,
            a.loved_tracks,
            a.tmoe_seconds,
            a.ae_ratio,
            a.effective_album_rating,
            a.album_score,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL
        "
    };

    let from_sql = if is_tracks {
        "FROM tracks t LEFT JOIN albums a ON a.id = t.album_id"
    } else {
        "FROM albums a"
    };

    let (where_sql, values) = build_where_clause(is_tracks, &request.search_text, filters);
    let count_sql = format!("SELECT COUNT(*) {from_sql} {where_sql}");
    let total = conn
        .query_row(&count_sql, params_from_iter(values.iter()), |row| {
            row.get(0)
        })
        .context("Could not count browse results")?;

    let order_sql = order_clause(is_tracks, &request.sort);
    let sql = format!("{select_sql} {from_sql} {where_sql} {order_sql} LIMIT ? OFFSET ?");
    let mut row_values = values;
    row_values.push(Value::Integer(i64::from(limit)));
    row_values.push(Value::Integer(i64::from(offset)));

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(params_from_iter(row_values.iter()), browse_row_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load browse results")?;

    Ok(BrowseResponse {
        view,
        rows,
        total,
        limit,
        offset,
    })
}

fn browse_row_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<BrowseRow> {
    Ok(BrowseRow {
        id: row.get(0)?,
        track_id: row.get(1)?,
        album_id: row.get(2)?,
        album: row.get(3)?,
        album_artist_display: row.get(4)?,
        display_artist: row.get(5)?,
        title: row.get(6)?,
        canonical_genre: row.get(7)?,
        publisher: row.get(8)?,
        year: row.get(9)?,
        release_year: row.get(10)?,
        total_tracks: row.get(11)?,
        rated_tracks: row.get(12)?,
        rating_completeness: row.get(13)?,
        total_seconds: row.get(14)?,
        loved_tracks: row.get(15)?,
        tmoe_seconds: row.get(16)?,
        ae_ratio: row.get(17)?,
        effective_album_rating: row.get(18)?,
        album_score: row.get(19)?,
        normalized_rating: row.get(20)?,
        disc_number: row.get(21)?,
        track_number: row.get(22)?,
        love: row.get(23)?,
        file_path: row.get(24)?,
        filename: row.get(25)?,
    })
}

fn build_where_clause(
    is_tracks: bool,
    search_text: &str,
    filters: &BrowseFilters,
) -> (String, Vec<Value>) {
    let mut conditions = Vec::new();
    let mut values = Vec::new();

    if let Some(query) = fts_query(search_text) {
        if is_tracks {
            conditions.push(
                "t.id IN (
                    SELECT CAST(track_id AS INTEGER)
                    FROM track_search_fts
                    WHERE track_search_fts MATCH ?
                )"
                .to_string(),
            );
        } else {
            conditions.push(
                "a.id IN (
                    SELECT album_id
                    FROM album_search_fts
                    WHERE album_search_fts MATCH ?
                )"
                .to_string(),
            );
        }
        values.push(Value::Text(query));
    }

    if is_tracks {
        add_text_condition(
            &mut conditions,
            &mut values,
            "t.album",
            &filters.album_title,
        );
        add_text_condition(
            &mut conditions,
            &mut values,
            "t.title",
            &filters.track_title,
        );
        add_text_condition(
            &mut conditions,
            &mut values,
            "t.album_artist_display",
            &filters.album_artist,
        );
        add_text_condition(
            &mut conditions,
            &mut values,
            "t.display_artist",
            &filters.display_artist,
        );
        add_text_condition(
            &mut conditions,
            &mut values,
            "t.publisher",
            &filters.publisher,
        );
        add_text_condition(
            &mut conditions,
            &mut values,
            "t.file_path",
            &filters.file_path,
        );
        add_text_condition(
            &mut conditions,
            &mut values,
            "t.filename",
            &filters.filename,
        );
    } else {
        add_text_condition(
            &mut conditions,
            &mut values,
            "a.album",
            &filters.album_title,
        );
        add_exists_text_condition(
            &mut conditions,
            &mut values,
            "tx.title",
            &filters.track_title,
            "a.id",
        );
        add_text_condition(
            &mut conditions,
            &mut values,
            "a.album_artist_display",
            &filters.album_artist,
        );
        add_exists_text_condition(
            &mut conditions,
            &mut values,
            "tx.display_artist",
            &filters.display_artist,
            "a.id",
        );
        add_text_condition(
            &mut conditions,
            &mut values,
            "a.publisher",
            &filters.publisher,
        );
        add_exists_text_condition(
            &mut conditions,
            &mut values,
            "tx.file_path",
            &filters.file_path,
            "a.id",
        );
        add_exists_text_condition(
            &mut conditions,
            &mut values,
            "tx.filename",
            &filters.filename,
            "a.id",
        );
    }

    if let Some(query) = fts_query(&filters.has_track_text) {
        let album_ref = if is_tracks { "t.album_id" } else { "a.id" };
        conditions.push(format!(
            "EXISTS (
                SELECT 1
                FROM track_search_fts
                WHERE album_id = {album_ref}
                  AND track_search_fts MATCH ?
            )"
        ));
        values.push(Value::Text(query));
    }

    let genre_field = if is_tracks {
        "COALESCE(t.genre_normalized, a.genre_normalized)"
    } else {
        "a.genre_normalized"
    };
    add_text_list_condition(
        &mut conditions,
        &mut values,
        genre_field,
        &filters.genres,
        false,
    );
    add_text_list_condition(
        &mut conditions,
        &mut values,
        genre_field,
        &filters.excluded_genres,
        true,
    );

    let year_field = if is_tracks { "t.year" } else { "a.year" };
    let release_year_field = if is_tracks {
        "t.release_year"
    } else {
        "a.release_year"
    };
    add_i32_range(
        &mut conditions,
        &mut values,
        year_field,
        filters.year_from,
        filters.year_to,
    );
    add_i32_range(
        &mut conditions,
        &mut values,
        release_year_field,
        filters.release_year_from,
        filters.release_year_to,
    );

    add_seconds_range(
        &mut conditions,
        &mut values,
        "a.total_seconds",
        filters.total_minutes_min,
        filters.total_minutes_max,
    );
    add_i64_range(
        &mut conditions,
        &mut values,
        "a.total_tracks",
        filters.track_count_min,
        filters.track_count_max,
    );
    add_i32_range(
        &mut conditions,
        &mut values,
        "a.effective_album_rating",
        filters.album_rating_min,
        filters.album_rating_max,
    );

    if is_tracks {
        add_track_rating_range(
            &mut conditions,
            &mut values,
            "t.normalized_rating",
            filters.track_rating_min,
            filters.track_rating_max,
        );
    } else {
        add_album_track_rating_range(
            &mut conditions,
            &mut values,
            filters.track_rating_min,
            filters.track_rating_max,
        );
    }

    if let Some(minimum) = filters.rating_completeness_min {
        conditions.push("a.rating_completeness >= ?".to_string());
        values.push(Value::Real(normalize_percentage(minimum)));
    }

    add_i64_range(
        &mut conditions,
        &mut values,
        "a.loved_tracks",
        filters.loved_tracks_min,
        filters.loved_tracks_max,
    );

    add_missing_field_conditions(
        &mut conditions,
        is_tracks,
        filters.missing_fields.as_slice(),
    );

    let where_sql = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    (where_sql, values)
}

fn add_text_condition(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    filter: &TextFilter,
) {
    if let Some(condition) = text_condition(field, filter, values) {
        conditions.push(condition);
    }
}

fn add_exists_text_condition(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    filter: &TextFilter,
    album_ref: &str,
) {
    if let Some(condition) = text_condition(field, filter, values) {
        conditions.push(format!(
            "EXISTS (SELECT 1 FROM tracks tx WHERE tx.album_id = {album_ref} AND {condition})"
        ));
    }
}

fn text_condition(field: &str, filter: &TextFilter, values: &mut Vec<Value>) -> Option<String> {
    let value = filter.value.trim();
    if value.is_empty() {
        return None;
    }

    let normalized = value.to_lowercase();
    match filter.operator.as_str() {
        "equals" => {
            values.push(Value::Text(normalized));
            Some(format!("LOWER(COALESCE({field}, '')) = ?"))
        }
        "startsWith" => {
            values.push(Value::Text(format!("{}%", escape_like(&normalized))));
            Some(format!("LOWER(COALESCE({field}, '')) LIKE ? ESCAPE '\\'"))
        }
        _ => {
            values.push(Value::Text(format!("%{}%", escape_like(&normalized))));
            Some(format!("LOWER(COALESCE({field}, '')) LIKE ? ESCAPE '\\'"))
        }
    }
}

fn add_text_list_condition(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    items: &[String],
    exclude: bool,
) {
    let normalized = items
        .iter()
        .map(|item| normalize_text(item))
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();

    if normalized.is_empty() {
        return;
    }

    let placeholders = std::iter::repeat("?")
        .take(normalized.len())
        .collect::<Vec<_>>()
        .join(", ");
    let operator = if exclude { "NOT IN" } else { "IN" };
    conditions.push(format!("COALESCE({field}, '') {operator} ({placeholders})"));
    values.extend(normalized.into_iter().map(Value::Text));
}

fn add_i32_range(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    minimum: Option<i32>,
    maximum: Option<i32>,
) {
    if let Some(minimum) = minimum {
        conditions.push(format!("{field} >= ?"));
        values.push(Value::Integer(i64::from(minimum)));
    }
    if let Some(maximum) = maximum {
        conditions.push(format!("{field} <= ?"));
        values.push(Value::Integer(i64::from(maximum)));
    }
}

fn add_i64_range(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    minimum: Option<i64>,
    maximum: Option<i64>,
) {
    if let Some(minimum) = minimum {
        conditions.push(format!("{field} >= ?"));
        values.push(Value::Integer(minimum));
    }
    if let Some(maximum) = maximum {
        conditions.push(format!("{field} <= ?"));
        values.push(Value::Integer(maximum));
    }
}

fn add_seconds_range(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    minimum_minutes: Option<f64>,
    maximum_minutes: Option<f64>,
) {
    if let Some(minimum) = minimum_minutes {
        conditions.push(format!("{field} >= ?"));
        values.push(Value::Integer((minimum * 60.0).round() as i64));
    }
    if let Some(maximum) = maximum_minutes {
        conditions.push(format!("{field} <= ?"));
        values.push(Value::Integer((maximum * 60.0).round() as i64));
    }
}

fn add_track_rating_range(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    minimum: Option<i32>,
    maximum: Option<i32>,
) {
    if let Some(minimum) = minimum {
        conditions.push(format!("{field} >= ?"));
        values.push(Value::Integer(i64::from(track_rating_points(minimum))));
    }
    if let Some(maximum) = maximum {
        conditions.push(format!("{field} <= ?"));
        values.push(Value::Integer(i64::from(track_rating_points(maximum))));
    }
}

fn add_album_track_rating_range(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    minimum: Option<i32>,
    maximum: Option<i32>,
) {
    if minimum.is_none() && maximum.is_none() {
        return;
    }

    let mut track_conditions = Vec::new();
    if let Some(minimum) = minimum {
        track_conditions.push("tx.normalized_rating >= ?".to_string());
        values.push(Value::Integer(i64::from(track_rating_points(minimum))));
    }
    if let Some(maximum) = maximum {
        track_conditions.push("tx.normalized_rating <= ?".to_string());
        values.push(Value::Integer(i64::from(track_rating_points(maximum))));
    }
    conditions.push(format!(
        "EXISTS (
            SELECT 1
            FROM tracks tx
            WHERE tx.album_id = a.id
              AND {}
        )",
        track_conditions.join(" AND ")
    ));
}

fn add_missing_field_conditions(conditions: &mut Vec<String>, is_tracks: bool, fields: &[String]) {
    for field in fields {
        let condition = match field.as_str() {
            "album" => Some(if is_tracks {
                "NULLIF(TRIM(COALESCE(t.album, '')), '') IS NULL"
            } else {
                "NULLIF(TRIM(COALESCE(a.album, '')), '') IS NULL"
            }),
            "albumArtist" => Some(if is_tracks {
                "NULLIF(TRIM(COALESCE(t.album_artist_display, '')), '') IS NULL"
            } else {
                "NULLIF(TRIM(COALESCE(a.album_artist_display, '')), '') IS NULL"
            }),
            "genre" => Some(if is_tracks {
                "NULLIF(TRIM(COALESCE(t.canonical_genre, a.canonical_genre, '')), '') IS NULL"
            } else {
                "NULLIF(TRIM(COALESCE(a.canonical_genre, '')), '') IS NULL"
            }),
            "year" => Some(if is_tracks {
                "t.year IS NULL"
            } else {
                "a.year IS NULL"
            }),
            "rating" => Some(if is_tracks {
                "t.normalized_rating IS NULL"
            } else {
                "a.effective_album_rating IS NULL"
            }),
            "time" => Some(if is_tracks {
                "t.time_seconds IS NULL"
            } else {
                "a.total_seconds <= 0"
            }),
            _ => None,
        };

        if let Some(condition) = condition {
            conditions.push(condition.to_string());
        }
    }
}

fn order_clause(is_tracks: bool, sort: &BrowseSort) -> String {
    let direction = if sort.direction.eq_ignore_ascii_case("desc") {
        "DESC"
    } else {
        "ASC"
    };

    let field = if is_tracks {
        match sort.field.as_str() {
            "title" => "LOWER(COALESCE(t.title, ''))",
            "displayArtist" => "LOWER(COALESCE(t.display_artist, ''))",
            "artist" => "LOWER(COALESCE(t.album_artist_display, ''))",
            "year" => "t.year",
            "genre" => "LOWER(COALESCE(t.genre_normalized, ''))",
            "trackRating" => "t.normalized_rating",
            "time" => "t.time_seconds",
            "trackNumber" => "t.disc_number",
            _ => "LOWER(COALESCE(t.album, ''))",
        }
    } else {
        match sort.field.as_str() {
            "artist" => "LOWER(COALESCE(a.album_artist_display, ''))",
            "year" => "a.year",
            "genre" => "LOWER(COALESCE(a.genre_normalized, ''))",
            "totalMinutes" => "a.total_seconds",
            "trackCount" => "a.total_tracks",
            "albumRating" => "a.effective_album_rating",
            "ratingCompleteness" => "a.rating_completeness",
            "lovedTracks" => "a.loved_tracks",
            "ae" => "a.ae_ratio",
            "tmoe" => "a.tmoe_seconds",
            "albumScore" => "a.album_score",
            _ => "LOWER(COALESCE(a.album, ''))",
        }
    };

    if is_tracks && sort.field == "trackNumber" {
        return format!("ORDER BY {field} {direction}, t.track_number {direction}, t.title ASC");
    }

    if is_tracks {
        format!(
            "ORDER BY {field} {direction}, LOWER(COALESCE(t.album, '')) ASC, t.disc_number ASC, t.track_number ASC"
        )
    } else {
        format!("ORDER BY {field} {direction}, LOWER(COALESCE(a.album_artist_display, '')) ASC")
    }
}

fn normalize_view(view: &str) -> String {
    if view.eq_ignore_ascii_case("tracks") {
        "tracks".to_string()
    } else {
        "albums".to_string()
    }
}

fn normalize_chart_config(mut config: ChartConfig) -> ChartConfig {
    let ranking_metric = normalize_ranking_metric(&config.ranking_metric);
    let sort_direction = if config.sort_direction.eq_ignore_ascii_case("asc") {
        "asc".to_string()
    } else {
        "desc".to_string()
    };
    let result_limit = config.result_limit.clamp(10, 500);
    let threshold = normalize_percentage(config.rating_completeness_threshold) * 100.0;
    let view_mode = match config.view_mode.as_str() {
        "compact" | "grid" => config.view_mode.clone(),
        _ => "table".to_string(),
    };

    config.request.view = "albums".to_string();
    config.request.offset = 0;
    config.request.limit = result_limit;
    config.request.sort = BrowseSort {
        field: ranking_metric.clone(),
        direction: sort_direction.clone(),
    };
    config.request.filters.rating_completeness_min = Some(threshold);
    config.ranking_metric = ranking_metric;
    config.sort_direction = sort_direction;
    config.result_limit = result_limit;
    config.rating_completeness_threshold = threshold;
    config.view_mode = view_mode;
    config
}

fn normalize_ranking_metric(metric: &str) -> String {
    match metric {
        "albumRating" | "ratingCompleteness" | "lovedTracks" | "ae" | "tmoe" | "totalMinutes" => {
            metric.to_string()
        }
        _ => "albumScore".to_string(),
    }
}

fn normalize_percentage(value: f64) -> f64 {
    if value > 1.0 {
        (value / 100.0).clamp(0.0, 1.0)
    } else {
        value.clamp(0.0, 1.0)
    }
}

fn track_rating_points(value: i32) -> i32 {
    if value <= 5 {
        value * 20
    } else {
        value
    }
}

fn fts_query(value: &str) -> Option<String> {
    let terms = value
        .split(|character: char| !character.is_alphanumeric())
        .map(str::trim)
        .filter(|term| !term.is_empty())
        .map(|term| format!("{}*", term.to_lowercase()))
        .collect::<Vec<_>>();

    if terms.is_empty() {
        None
    } else {
        Some(terms.join(" AND "))
    }
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn normalize_text(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn write_export_file(
    path: &PathBuf,
    format: &str,
    view: &str,
    rows: &[BrowseRow],
    include_calculated: bool,
) -> Result<()> {
    let (headers, values) = export_table(view, rows, include_calculated);

    if format == "xlsx" {
        write_xlsx_file(path, &headers, &values)?;
        return Ok(());
    }

    let mut file = fs::File::create(path)?;

    match format {
        "json" => {
            let records = values
                .iter()
                .map(|row| {
                    headers
                        .iter()
                        .zip(row.iter())
                        .map(|(header, value)| {
                            (
                                (*header).to_string(),
                                serde_json::Value::String(value.clone()),
                            )
                        })
                        .collect::<serde_json::Map<_, _>>()
                })
                .collect::<Vec<_>>();
            file.write_all(serde_json::to_string_pretty(&records)?.as_bytes())?;
        }
        "tsv" => write_delimited(&mut file, '\t', &headers, &values)?,
        "txt" => write_delimited(&mut file, '\t', &headers, &values)?,
        _ => write_delimited(&mut file, ',', &headers, &values)?,
    }

    Ok(())
}

fn write_xlsx_file(path: &PathBuf, headers: &[&'static str], rows: &[Vec<String>]) -> Result<()> {
    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    let header_format = Format::new().set_bold();

    for (column, header) in headers.iter().enumerate() {
        worksheet.write_string_with_format(0, column as u16, *header, &header_format)?;
    }

    for (row_index, row) in rows.iter().enumerate() {
        for (column_index, value) in row.iter().enumerate() {
            worksheet.write_string((row_index + 1) as u32, column_index as u16, value)?;
        }
    }

    workbook.save(path)?;
    Ok(())
}

fn write_delimited(
    file: &mut fs::File,
    delimiter: char,
    headers: &[&'static str],
    rows: &[Vec<String>],
) -> Result<()> {
    let delimiter_text = delimiter.to_string();
    writeln!(
        file,
        "{}",
        headers
            .iter()
            .map(|header| escape_delimited(header, delimiter))
            .collect::<Vec<_>>()
            .join(&delimiter_text)
    )?;

    for row in rows {
        writeln!(
            file,
            "{}",
            row.iter()
                .map(|value| escape_delimited(value, delimiter))
                .collect::<Vec<_>>()
                .join(&delimiter_text)
        )?;
    }

    Ok(())
}

fn escape_delimited(value: &str, delimiter: char) -> String {
    let clean = value.replace('\r', " ").replace('\n', " ");
    if delimiter == '\t' {
        return clean.replace('\t', " ");
    }

    if clean.contains(delimiter) || clean.contains('"') {
        format!("\"{}\"", clean.replace('"', "\"\""))
    } else {
        clean
    }
}

fn export_table(
    view: &str,
    rows: &[BrowseRow],
    include_calculated: bool,
) -> (Vec<&'static str>, Vec<Vec<String>>) {
    let is_tracks = normalize_view(view) == "tracks";
    let mut headers = if is_tracks {
        vec![
            "Album Artist",
            "Album",
            "Disc",
            "Track",
            "Title",
            "Display Artist",
            "Year",
            "Rating",
            "Time",
            "Love",
            "Filename",
            "File Path",
        ]
    } else {
        vec![
            "Album Artist",
            "Album",
            "Year",
            "Release Year",
            "Genre",
            "Publisher",
            "Tracks",
            "Minutes",
            "Album Rating",
            "Rating Complete",
            "Loved Tracks",
        ]
    };

    if include_calculated {
        headers.extend(["TMOE Minutes", "AE Percent", "Album Score"]);
    }

    let values = rows
        .iter()
        .map(|row| {
            let mut values = if is_tracks {
                vec![
                    optional_text(&row.album_artist_display),
                    optional_text(&row.album),
                    optional_i32(row.disc_number),
                    optional_i32(row.track_number),
                    optional_text(&row.title),
                    optional_text(&row.display_artist),
                    optional_i32(row.year),
                    row.normalized_rating
                        .map(|rating| format!("{:.0}", f64::from(rating) / 20.0))
                        .unwrap_or_default(),
                    row.total_seconds
                        .map(format_seconds_as_minutes)
                        .unwrap_or_default(),
                    optional_text(&row.love),
                    optional_text(&row.filename),
                    optional_text(&row.file_path),
                ]
            } else {
                vec![
                    optional_text(&row.album_artist_display),
                    optional_text(&row.album),
                    optional_i32(row.year),
                    optional_i32(row.release_year),
                    optional_text(&row.canonical_genre),
                    optional_text(&row.publisher),
                    row.total_tracks
                        .map(|value| value.to_string())
                        .unwrap_or_default(),
                    row.total_seconds
                        .map(format_seconds_as_minutes)
                        .unwrap_or_default(),
                    optional_i32(row.effective_album_rating),
                    row.rating_completeness
                        .map(|value| format!("{:.1}%", value * 100.0))
                        .unwrap_or_default(),
                    row.loved_tracks
                        .map(|value| value.to_string())
                        .unwrap_or_default(),
                ]
            };

            if include_calculated {
                values.extend([
                    row.tmoe_seconds
                        .map(format_seconds_as_minutes)
                        .unwrap_or_default(),
                    row.ae_ratio
                        .map(|value| format!("{:.2}%", value * 100.0))
                        .unwrap_or_default(),
                    row.album_score
                        .map(|value| format!("{value:.3}"))
                        .unwrap_or_default(),
                ]);
            }

            values
        })
        .collect::<Vec<_>>();

    (headers, values)
}

fn optional_text(value: &Option<String>) -> String {
    value.clone().unwrap_or_default()
}

fn optional_i32(value: Option<i32>) -> String {
    value.map(|value| value.to_string()).unwrap_or_default()
}

fn format_seconds_as_minutes(seconds: i64) -> String {
    format!("{:.1}", seconds as f64 / 60.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seeded_connection() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("migrate database");
        conn.execute(
            "
            INSERT INTO import_runs (source_path, started_at, status)
            VALUES ('library.tsv', '2026-06-25T00:00:00Z', 'completed')
            ",
            [],
        )
        .expect("insert import run");
        conn.execute(
            "
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score
            ) VALUES (
                'mb:test', 1, 'test', 'Actually', 'Pet Shop Boys',
                'Synthpop', 'synthpop', 'Parlophone', 1987, 1987,
                10, 10, 1.0, 2880, 2, 840, 0.2916, 86, 207.62
            )
            ",
            [],
        )
        .expect("insert album");
        conn.execute(
            "
            INSERT INTO tracks (
                import_run_id, album_id, album_unique_id, display_artist,
                album_artist_display, album, title, canonical_genre, genre_normalized,
                publisher, love, normalized_rating, year, release_year, time_seconds,
                file_path, filename, row_hash
            ) VALUES (
                1, 'mb:test', 'test', 'Pet Shop Boys', 'Pet Shop Boys',
                'Actually', 'What Have I Done to Deserve This?', 'Synthpop',
                'synthpop', 'Parlophone', 'L', 100, 1987, 1987, 260,
                'D:\\Music\\Pet Shop Boys\\Actually', '02 What Have I Done.mp3', 'hash'
            )
            ",
            [],
        )
        .expect("insert track");
        rebuild_search_indexes(&conn).expect("rebuild search indexes");
        conn
    }

    #[test]
    fn searches_albums_with_fts_and_filters() {
        let conn = seeded_connection();
        let mut request = BrowseRequest::default();
        request.search_text = "Synthpop".to_string();
        request.filters.year_from = Some(1987);
        request.filters.year_to = Some(1987);

        let response = search_library(&conn, request, 50).expect("search albums");

        assert_eq!(response.total, 1);
        assert_eq!(response.rows[0].album.as_deref(), Some("Actually"));
    }

    #[test]
    fn searches_tracks_by_track_text() {
        let conn = seeded_connection();
        let mut request = BrowseRequest::default();
        request.view = "tracks".to_string();
        request.search_text = "Deserve".to_string();

        let response = search_library(&conn, request, 50).expect("search tracks");

        assert_eq!(response.total, 1);
        assert_eq!(
            response.rows[0].title.as_deref(),
            Some("What Have I Done to Deserve This?")
        );
    }

    #[test]
    fn skips_noop_migration_for_current_phase_three_schema() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        migrate(&conn).expect("noop migration");

        let user_version = conn
            .query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
            .expect("read user version");

        assert_eq!(user_version, LATEST_SCHEMA_VERSION);
        assert!(phase_three_schema_exists(&conn).expect("phase three schema exists"));
    }

    #[test]
    fn sorts_charts_by_ae_and_tmoe() {
        let ae_sort = BrowseSort {
            field: "ae".to_string(),
            direction: "desc".to_string(),
        };
        let tmoe_sort = BrowseSort {
            field: "tmoe".to_string(),
            direction: "desc".to_string(),
        };

        assert!(order_clause(false, &ae_sort).contains("a.ae_ratio DESC"));
        assert!(order_clause(false, &tmoe_sort).contains("a.tmoe_seconds DESC"));
    }

    #[test]
    fn writes_xlsx_exports() {
        let conn = seeded_connection();
        let mut request = BrowseRequest::default();
        request.sort = BrowseSort {
            field: "albumScore".to_string(),
            direction: "desc".to_string(),
        };
        let response = search_library(&conn, request, 50).expect("search albums");
        let path = std::env::temp_dir().join(format!(
            "music-library-export-test-{}.xlsx",
            Utc::now().timestamp_millis()
        ));

        write_export_file(&path, "xlsx", "albums", &response.rows, true).expect("write xlsx");

        let metadata = fs::metadata(&path).expect("xlsx metadata");
        assert!(metadata.len() > 0);
        fs::remove_file(path).expect("remove xlsx");
    }
}
