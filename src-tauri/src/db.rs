use crate::models::{ImportRun, LibraryStatus};
use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const DB_FILE_NAME: &str = "music-library.sqlite3";

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

        PRAGMA user_version = 1;
        ",
    )
    .context("Could not run SQLite migrations")?;
    Ok(())
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
