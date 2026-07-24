use crate::db;
use crate::models::{ImportPreview, ImportSuspiciousAlbum};
#[cfg(not(test))]
use crate::models::{ImportProgress, ImportSummary};
use crate::wishlist;
use anyhow::{anyhow, bail, Context, Result};
use chrono::Utc;
use csv::{Position, StringRecord};
use rusqlite::{params, Connection, InterruptHandle, OptionalExtension, Transaction};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use std::time::Instant;
use std::time::UNIX_EPOCH;
#[cfg(not(test))]
use tauri::{AppHandle, Emitter};

const IMPORT_STAGE_BATCH_SIZE: usize = 5_000;
const IMPORT_SUSPICIOUS_EXAMPLE_LIMIT: i64 = 12;
const IMPORT_STAGE_VACUUM_THRESHOLD_BYTES: i64 = 128 * 1024 * 1024;
const ADDED_TRACKS_SQL: &str = "
    SELECT COUNT(*)
    FROM import_stage_tracks staged
    LEFT JOIN tracks current
      ON current.file_path IS NULLIF(staged.file_path, '')
     AND current.filename IS NULLIF(staged.filename, '')
    WHERE staged.session_id = ?1 AND current.id IS NULL
";
const CHANGED_TRACKS_SQL: &str = "
    SELECT COUNT(*)
    FROM import_stage_tracks staged
    JOIN tracks current
      ON current.file_path IS NULLIF(staged.file_path, '')
     AND current.filename IS NULLIF(staged.filename, '')
    WHERE staged.session_id = ?1 AND current.row_hash != staged.row_hash
";
const REMOVED_TRACKS_SQL: &str = "
    SELECT COUNT(*)
    FROM tracks current
    LEFT JOIN import_stage_tracks staged
      ON staged.session_id = ?1
     AND staged.file_path = COALESCE(current.file_path, '')
     AND staged.filename = COALESCE(current.filename, '')
    WHERE staged.row_number IS NULL
";
static IMPORT_CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);
static IMPORT_WORKFLOW_RUNNING: AtomicBool = AtomicBool::new(false);
static IMPORT_INTERRUPT_HANDLE: Mutex<Option<InterruptHandle>> = Mutex::new(None);

const REQUIRED_COLUMNS: [&str; 17] = [
    "Display Artist",
    "Album Rating",
    "Disc#",
    "Album",
    "Genre",
    "Love",
    "Publisher",
    "Rating",
    "Title",
    "Track#",
    "Year",
    "Release Year",
    "<Album Unique Id>",
    "<File Path>",
    "<Filename>",
    "Album Artist (display)",
    "Time",
];

#[derive(Debug, Clone)]
struct HeaderMap {
    display_artist: usize,
    album_rating: usize,
    disc_number: usize,
    album: usize,
    genre: usize,
    love: usize,
    publisher: usize,
    rating: usize,
    title: usize,
    track_number: usize,
    year: usize,
    release_year: usize,
    album_unique_id: usize,
    file_path: usize,
    filename: usize,
    album_artist_display: usize,
    time: usize,
}

#[derive(Debug, Clone)]
struct TrackRow {
    display_artist: String,
    album_rating_raw: String,
    disc_number_raw: String,
    album: String,
    genre: String,
    canonical_genre: String,
    genre_normalized: String,
    love: String,
    publisher: String,
    rating_raw: String,
    title: String,
    track_number_raw: String,
    year_raw: String,
    release_year_raw: String,
    album_unique_id: String,
    file_path: String,
    filename: String,
    album_artist_display: String,
    time_raw: String,
    normalized_rating: Option<i32>,
    track_rating_value: Option<i32>,
    album_rating: Option<i32>,
    disc_number: Option<i32>,
    track_number: Option<i32>,
    year: Option<i32>,
    release_year: Option<i32>,
    time_seconds: Option<i64>,
    album_id: String,
    row_hash: String,
}

#[derive(Debug, Clone)]
struct AlbumAggregate {
    album_id: String,
    album_unique_id: Option<String>,
    album: Option<String>,
    album_artist_display: Option<String>,
    single_display_artist: Option<String>,
    single_display_artist_key: Option<String>,
    has_multiple_display_artists: bool,
    canonical_genre: Option<String>,
    genre_normalized: Option<String>,
    publisher: Option<String>,
    year: Option<i32>,
    release_year: Option<i32>,
    album_rating: Option<i32>,
    total_tracks: u32,
    rated_tracks: u32,
    normalized_rating_sum: i64,
    total_seconds: i64,
    loved_tracks: u32,
    tmoe_seconds: i64,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
struct FinalAlbum {
    album_id: String,
    album_unique_id: Option<String>,
    album: Option<String>,
    album_artist_display: Option<String>,
    canonical_genre: Option<String>,
    genre_normalized: Option<String>,
    publisher: Option<String>,
    year: Option<i32>,
    release_year: Option<i32>,
    total_tracks: u32,
    rated_tracks: u32,
    rating_completeness: f64,
    total_seconds: i64,
    loved_tracks: u32,
    tmoe_seconds: i64,
    ae_ratio: f64,
    album_rating: Option<i32>,
    calculated_album_rating: Option<i32>,
    effective_album_rating: Option<i32>,
    album_score: Option<f64>,
    album_artist_display_inferred: bool,
}

#[derive(Debug, Clone)]
struct PreviousAlbum {
    album_id: String,
    album: Option<String>,
    album_artist_display: Option<String>,
    year: Option<i32>,
    total_tracks: u32,
    rated_tracks: u32,
    rating_completeness: f64,
    total_seconds: i64,
    loved_tracks: u32,
    tmoe_seconds: i64,
    ae_ratio: f64,
    effective_album_rating: Option<i32>,
    album_score: Option<f64>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Default)]
struct ImportChanges {
    added_tracks: i64,
    changed_tracks: i64,
    removed_tracks: i64,
    added_albums: i64,
    changed_albums: i64,
    removed_albums: i64,
    rating_events_count: i64,
}

#[derive(Debug, Clone)]
struct RatingEventRecord {
    event_type: String,
    album_id: String,
    album: Option<String>,
    album_artist_display: Option<String>,
    year: Option<i32>,
    previous_rated_tracks: Option<i64>,
    current_rated_tracks: Option<i64>,
    previous_rating_completeness: Option<f64>,
    current_rating_completeness: Option<f64>,
    previous_effective_album_rating: Option<i32>,
    current_effective_album_rating: Option<i32>,
}

#[derive(Debug, Clone)]
struct ImportSessionRecord {
    id: i64,
    source_path: String,
    source_size_bytes: i64,
    source_modified_ms: i64,
    status: String,
    processed_rows: i64,
    processed_bytes: i64,
    track_rows: i64,
    album_count: i64,
    added_tracks: i64,
    changed_tracks: i64,
    removed_tracks: i64,
    added_albums: i64,
    changed_albums: i64,
    removed_albums: i64,
    suspicious_album_count: i64,
    created_at: String,
    updated_at: String,
    completed_at: Option<String>,
    import_run_id: Option<i64>,
    error_message: Option<String>,
}

#[derive(Debug, Clone)]
struct SourceFingerprint {
    path: PathBuf,
    path_text: String,
    size_bytes: i64,
    modified_ms: i64,
}

struct ImportWorkflowGuard;
struct ImportInterruptGuard;

impl ImportWorkflowGuard {
    fn acquire() -> Result<Self> {
        if IMPORT_WORKFLOW_RUNNING
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            bail!("Another library import workflow is already running");
        }
        Ok(Self)
    }
}

impl Drop for ImportWorkflowGuard {
    fn drop(&mut self) {
        IMPORT_WORKFLOW_RUNNING.store(false, Ordering::SeqCst);
    }
}

impl ImportInterruptGuard {
    fn register(conn: &Connection) -> Self {
        let mut handle = IMPORT_INTERRUPT_HANDLE
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *handle = Some(conn.get_interrupt_handle());
        Self
    }
}

impl Drop for ImportInterruptGuard {
    fn drop(&mut self) {
        let mut handle = IMPORT_INTERRUPT_HANDLE
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        handle.take();
    }
}

#[cfg(not(test))]
pub fn get_import_preview(app: &AppHandle, source_path: String) -> Result<Option<ImportPreview>> {
    let (conn, _) = db::open(app)?;
    let fingerprint = source_fingerprint(&source_path).ok();
    latest_import_preview(&conn, source_path.trim(), fingerprint.as_ref())
}

#[cfg(not(test))]
pub fn prepare_import_preview(app: AppHandle, source_path: String) -> Result<ImportPreview> {
    let _workflow_guard = ImportWorkflowGuard::acquire()?;
    IMPORT_CANCEL_REQUESTED.store(false, Ordering::SeqCst);
    let (mut conn, _) = db::open(&app)?;
    let _interrupt_guard = ImportInterruptGuard::register(&conn);
    let fingerprint = source_fingerprint(&source_path)?;
    let progress = |status: &str,
                    session_id: Option<i64>,
                    processed_rows: u64,
                    processed_bytes: u64,
                    album_count: u64,
                    message: &str| {
        emit_progress(
            &app,
            status,
            session_id,
            processed_rows,
            processed_bytes,
            fingerprint.size_bytes.max(0) as u64,
            album_count,
            message,
        );
    };
    prepare_import_preview_for_connection(
        &mut conn,
        &fingerprint,
        &IMPORT_CANCEL_REQUESTED,
        &progress,
    )
}

pub fn cancel_import_preview() {
    IMPORT_CANCEL_REQUESTED.store(true, Ordering::SeqCst);
    let handle = IMPORT_INTERRUPT_HANDLE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(handle) = handle.as_ref() {
        handle.interrupt();
    }
}

#[cfg(not(test))]
pub fn apply_import_preview(app: AppHandle, session_id: i64) -> Result<ImportSummary> {
    let _workflow_guard = ImportWorkflowGuard::acquire()?;
    IMPORT_CANCEL_REQUESTED.store(false, Ordering::SeqCst);
    let started = Instant::now();
    let (mut conn, db_path) = db::open(&app)?;
    let session = load_import_session(&conn, session_id)?;
    if session.status != "ready" {
        bail!("Prepare the import delta before applying this import");
    }
    let fingerprint = source_fingerprint(&session.source_path)?;
    ensure_session_source_matches(&session, &fingerprint)?;
    let settings = db::settings_for_connection(&conn)?;

    emit_progress(
        &app,
        "applying",
        Some(session_id),
        session.track_rows.max(0) as u64,
        session.source_size_bytes.max(0) as u64,
        session.source_size_bytes.max(0) as u64,
        session.album_count.max(0) as u64,
        "Creating the rollback backup before the atomic apply.",
    );
    let backup_path = create_backup(
        &conn,
        &db_path,
        &fingerprint.path,
        fingerprint.size_bytes,
        settings.backup_retention as usize,
    )?;
    let backup_path_text = backup_path.as_ref().map(|path| path.display().to_string());

    let now = Utc::now().to_rfc3339();
    conn.execute(
        "
        INSERT INTO import_runs (
            source_path, source_size_bytes, started_at, status, backup_path,
            added_tracks, changed_tracks, removed_tracks,
            added_albums, changed_albums, removed_albums
        ) VALUES (?1, ?2, ?3, 'running', ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        ",
        params![
            &session.source_path,
            session.source_size_bytes,
            &now,
            &backup_path_text,
            session.added_tracks,
            session.changed_tracks,
            session.removed_tracks,
            session.added_albums,
            session.changed_albums,
            session.removed_albums,
        ],
    )
    .context("Could not create import run for the prepared delta")?;
    let import_run_id = conn.last_insert_rowid();

    let result = apply_staged_import(&mut conn, &session, import_run_id, started);
    match result {
        Ok((track_rows, album_count, rating_events_count)) => {
            let duration_ms = started.elapsed().as_millis();
            wishlist::reconcile_for_connection(&conn)
                .context("Could not reconcile the wish list after import")?;
            cleanup_completed_stage(&conn, session_id)?;
            match completed_stage_storage_should_be_reclaimed(&conn) {
                Ok(true) => {
                    emit_progress(
                        &app,
                        "optimizing",
                        Some(session_id),
                        track_rows,
                        session.source_size_bytes.max(0) as u64,
                        session.source_size_bytes.max(0) as u64,
                        album_count,
                        "Reclaiming temporary staging space from the SQLite file.",
                    );
                    if let Err(error) = reclaim_completed_stage_storage(&conn) {
                        eprintln!("Could not reclaim completed import staging space: {error:#}");
                    }
                }
                Ok(false) => {}
                Err(error) => {
                    eprintln!("Could not inspect completed import staging space: {error:#}");
                }
            }
            emit_progress(
                &app,
                "completed",
                Some(session_id),
                track_rows,
                session.source_size_bytes.max(0) as u64,
                session.source_size_bytes.max(0) as u64,
                album_count,
                "Import applied. The generated backup is ready for one-click rollback.",
            );
            let import_run = db::get_import_run(&conn, import_run_id)?;
            debug_assert_eq!(import_run.rating_events_count, rating_events_count);
            Ok(ImportSummary {
                import_run,
                track_rows,
                album_count,
                duration_ms,
                backup_path: backup_path_text,
            })
        }
        Err(error) => {
            let message = error.to_string();
            let _ = conn.execute(
                "
                UPDATE import_runs
                SET completed_at = ?1, status = 'failed', duration_ms = ?2, error_message = ?3
                WHERE id = ?4
                ",
                params![
                    Utc::now().to_rfc3339(),
                    started.elapsed().as_millis() as i64,
                    &message,
                    import_run_id
                ],
            );
            let _ = conn.execute(
                "UPDATE import_sessions SET status = 'ready', updated_at = ?1, error_message = ?2 WHERE id = ?3",
                params![Utc::now().to_rfc3339(), &message, session_id],
            );
            emit_progress(
                &app,
                "failed",
                Some(session_id),
                session.processed_rows.max(0) as u64,
                session.processed_bytes.max(0) as u64,
                session.source_size_bytes.max(0) as u64,
                session.album_count.max(0) as u64,
                "Atomic apply failed; the active library was left unchanged.",
            );
            Err(error)
        }
    }
}

#[cfg(not(test))]
pub fn rollback_import_run(
    app: &AppHandle,
    import_run_id: i64,
) -> Result<crate::models::DatabaseRestoreSummary> {
    let (conn, _) = db::open(app)?;
    let run = db::get_import_run(&conn, import_run_id)?;
    if run.status != "completed" {
        bail!("Only completed imports can be rolled back");
    }
    let backup_path = run
        .backup_path
        .ok_or_else(|| anyhow!("This import does not have a rollback backup"))?;
    drop(conn);
    db::restore_database_backup_for_app(app, backup_path)
}

fn source_fingerprint(source_path: &str) -> Result<SourceFingerprint> {
    let path = resolve_source_path(source_path)?;
    let metadata = fs::metadata(&path)
        .with_context(|| format!("Could not read metadata for {}", path.display()))?;
    let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or_default();
    Ok(SourceFingerprint {
        path_text: path.display().to_string(),
        path,
        size_bytes: metadata.len().min(i64::MAX as u64) as i64,
        modified_ms,
    })
}

fn ensure_session_source_matches(
    session: &ImportSessionRecord,
    fingerprint: &SourceFingerprint,
) -> Result<()> {
    if session.source_path != fingerprint.path_text
        || session.source_size_bytes != fingerprint.size_bytes
        || session.source_modified_ms != fingerprint.modified_ms
    {
        bail!("The TSV changed after its delta was prepared. Prepare a new delta before importing");
    }
    Ok(())
}

fn import_session_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ImportSessionRecord> {
    Ok(ImportSessionRecord {
        id: row.get(0)?,
        source_path: row.get(1)?,
        source_size_bytes: row.get(2)?,
        source_modified_ms: row.get(3)?,
        status: row.get(4)?,
        processed_rows: row.get(5)?,
        processed_bytes: row.get(6)?,
        track_rows: row.get(7)?,
        album_count: row.get(8)?,
        added_tracks: row.get(9)?,
        changed_tracks: row.get(10)?,
        removed_tracks: row.get(11)?,
        added_albums: row.get(12)?,
        changed_albums: row.get(13)?,
        removed_albums: row.get(14)?,
        suspicious_album_count: row.get(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
        completed_at: row.get(18)?,
        import_run_id: row.get(19)?,
        error_message: row.get(20)?,
    })
}

fn import_session_select_sql() -> &'static str {
    "
    SELECT id, source_path, source_size_bytes, source_modified_ms, status,
           processed_rows, processed_bytes, track_rows, album_count,
           added_tracks, changed_tracks, removed_tracks,
           added_albums, changed_albums, removed_albums,
           suspicious_album_count, created_at, updated_at, completed_at,
           import_run_id, error_message
    FROM import_sessions
    "
}

fn load_import_session(conn: &Connection, session_id: i64) -> Result<ImportSessionRecord> {
    let sql = format!("{} WHERE id = ?1", import_session_select_sql());
    conn.query_row(&sql, params![session_id], import_session_from_row)
        .with_context(|| format!("Could not load import session {session_id}"))
}

fn latest_import_session(
    conn: &Connection,
    source_path: &str,
) -> Result<Option<ImportSessionRecord>> {
    let sql = format!(
        "{} WHERE source_path = ?1 AND status != 'completed' ORDER BY id DESC LIMIT 1",
        import_session_select_sql()
    );
    conn.query_row(&sql, params![source_path], import_session_from_row)
        .optional()
        .context("Could not load the latest import session")
}

fn suspicious_albums_for_session(
    conn: &Connection,
    session_id: i64,
) -> Result<Vec<ImportSuspiciousAlbum>> {
    let mut stmt = conn.prepare(
        "
        SELECT album_id, album, album_artist_display, year, reason,
               previous_track_count, current_track_count
        FROM import_suspicious_albums
        WHERE session_id = ?1
        ORDER BY id
        LIMIT ?2
        ",
    )?;
    let rows = stmt.query_map(
        params![session_id, IMPORT_SUSPICIOUS_EXAMPLE_LIMIT],
        |row| {
            Ok(ImportSuspiciousAlbum {
                album_id: row.get(0)?,
                album: row.get(1)?,
                album_artist_display: row.get(2)?,
                year: row.get(3)?,
                reason: row.get(4)?,
                previous_track_count: row.get(5)?,
                current_track_count: row.get(6)?,
            })
        },
    )?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load suspicious import albums")
}

fn preview_from_session(
    conn: &Connection,
    session: ImportSessionRecord,
    fingerprint: Option<&SourceFingerprint>,
) -> Result<ImportPreview> {
    let source_changed = fingerprint
        .map(|current| {
            current.path_text != session.source_path
                || current.size_bytes != session.source_size_bytes
                || current.modified_ms != session.source_modified_ms
        })
        .unwrap_or(true);
    let can_resume = !source_changed
        && session.processed_rows > 0
        && matches!(
            session.status.as_str(),
            "cancelled" | "failed" | "preparing"
        );
    Ok(ImportPreview {
        session_id: session.id,
        source_path: session.source_path,
        source_size_bytes: session.source_size_bytes,
        source_modified_ms: session.source_modified_ms,
        status: session.status,
        processed_rows: session.processed_rows,
        processed_bytes: session.processed_bytes,
        track_rows: session.track_rows,
        album_count: session.album_count,
        added_tracks: session.added_tracks,
        changed_tracks: session.changed_tracks,
        removed_tracks: session.removed_tracks,
        added_albums: session.added_albums,
        changed_albums: session.changed_albums,
        removed_albums: session.removed_albums,
        suspicious_album_count: session.suspicious_album_count,
        suspicious_albums: suspicious_albums_for_session(conn, session.id)?,
        created_at: session.created_at,
        updated_at: session.updated_at,
        completed_at: session.completed_at,
        import_run_id: session.import_run_id,
        error_message: session.error_message,
        can_resume,
        source_changed,
    })
}

fn latest_import_preview(
    conn: &Connection,
    source_path: &str,
    fingerprint: Option<&SourceFingerprint>,
) -> Result<Option<ImportPreview>> {
    let lookup_path = fingerprint
        .map(|value| value.path_text.as_str())
        .unwrap_or(source_path);
    latest_import_session(conn, lookup_path)?
        .map(|session| preview_from_session(conn, session, fingerprint))
        .transpose()
}

type ImportProgressCallback<'a> = dyn Fn(&str, Option<i64>, u64, u64, u64, &str) + 'a;

fn prepare_import_preview_for_connection(
    conn: &mut Connection,
    fingerprint: &SourceFingerprint,
    cancel_requested: &AtomicBool,
    progress: &ImportProgressCallback<'_>,
) -> Result<ImportPreview> {
    match prepare_import_preview_inner(conn, fingerprint, cancel_requested, progress) {
        Ok(preview) => Ok(preview),
        Err(error) => {
            if cancel_requested.load(Ordering::SeqCst) {
                return finish_cancelled_preparation(conn, fingerprint, progress);
            }
            if let Ok(Some(session)) = latest_import_session(conn, &fingerprint.path_text) {
                let _ = conn.execute(
                    "
                    UPDATE import_sessions
                    SET status = 'failed', updated_at = ?1, error_message = ?2
                    WHERE id = ?3
                    ",
                    params![Utc::now().to_rfc3339(), error.to_string(), session.id],
                );
            }
            Err(error)
        }
    }
}

fn finish_cancelled_preparation(
    conn: &Connection,
    fingerprint: &SourceFingerprint,
    progress: &ImportProgressCallback<'_>,
) -> Result<ImportPreview> {
    let session = latest_import_session(conn, &fingerprint.path_text)?
        .ok_or_else(|| anyhow!("Could not find the cancelled import checkpoint"))?;
    conn.execute(
        "
        UPDATE import_sessions
        SET status = 'cancelled', updated_at = ?1, error_message = NULL
        WHERE id = ?2
        ",
        params![Utc::now().to_rfc3339(), session.id],
    )?;
    let session = load_import_session(conn, session.id)?;
    progress(
        "cancelled",
        Some(session.id),
        session.processed_rows.max(0) as u64,
        session.processed_bytes.max(0) as u64,
        session.album_count.max(0) as u64,
        "Preparation cancelled. The checkpoint is safe to resume.",
    );
    preview_from_session(conn, session, Some(fingerprint))
}

fn ensure_preparation_not_cancelled(cancel_requested: &AtomicBool) -> Result<()> {
    if cancel_requested.load(Ordering::SeqCst) {
        bail!("Import preparation cancelled");
    }
    Ok(())
}

fn prepare_import_preview_inner(
    conn: &mut Connection,
    fingerprint: &SourceFingerprint,
    cancel_requested: &AtomicBool,
    progress: &ImportProgressCallback<'_>,
) -> Result<ImportPreview> {
    let existing = latest_import_session(conn, &fingerprint.path_text)?;
    if let Some(session) = existing.as_ref() {
        if session.source_size_bytes == fingerprint.size_bytes
            && session.source_modified_ms == fingerprint.modified_ms
            && session.status == "ready"
        {
            return preview_from_session(conn, session.clone(), Some(fingerprint));
        }
    }

    let session_id = if let Some(session) = existing.filter(|session| {
        session.source_size_bytes == fingerprint.size_bytes
            && session.source_modified_ms == fingerprint.modified_ms
            && matches!(
                session.status.as_str(),
                "preparing" | "cancelled" | "failed"
            )
    }) {
        conn.execute(
            "
            UPDATE import_sessions
            SET status = 'preparing', updated_at = ?1, error_message = NULL
            WHERE id = ?2
            ",
            params![Utc::now().to_rfc3339(), session.id],
        )?;
        session.id
    } else {
        let cleanup = conn.transaction()?;
        cleanup.execute(
            "DELETE FROM import_sessions WHERE status != 'completed'",
            [],
        )?;
        let now = Utc::now().to_rfc3339();
        cleanup.execute(
            "
            INSERT INTO import_sessions (
                source_path, source_size_bytes, source_modified_ms, status,
                created_at, updated_at
            ) VALUES (?1, ?2, ?3, 'preparing', ?4, ?4)
            ",
            params![
                &fingerprint.path_text,
                fingerprint.size_bytes,
                fingerprint.modified_ms,
                &now
            ],
        )?;
        let id = cleanup.last_insert_rowid();
        cleanup.commit()?;
        id
    };

    let session = load_import_session(conn, session_id)?;
    progress(
        if session.processed_rows > 0 {
            "resuming"
        } else {
            "preparing"
        },
        Some(session_id),
        session.processed_rows.max(0) as u64,
        session.processed_bytes.max(0) as u64,
        session.album_count.max(0) as u64,
        if session.processed_rows > 0 {
            "Resuming from the last durable TSV checkpoint."
        } else {
            "Staging the TSV while the active library stays untouched."
        },
    );

    let mut reader = musicbee_tsv_reader_builder()
        .from_path(&fingerprint.path)
        .with_context(|| format!("Could not open TSV source {}", fingerprint.path.display()))?;
    let headers = reader
        .headers()
        .context("Could not read TSV header")?
        .clone();
    let header_map = HeaderMap::from_headers(&headers)?;
    if session.processed_bytes > 0 {
        let mut position = Position::new();
        position
            .set_byte(session.processed_bytes as u64)
            .set_record(session.processed_rows.max(0) as u64 + 1);
        reader
            .seek(position)
            .context("Could not seek to the saved TSV checkpoint")?;
    }

    let mut albums = load_stage_album_aggregates(conn, session_id)?;
    let mut processed_rows = session.processed_rows.max(0) as u64;
    let mut processed_bytes = session.processed_bytes.max(0) as u64;
    let mut reached_end = false;

    while !reached_end {
        let mut chunk = Vec::with_capacity(IMPORT_STAGE_BATCH_SIZE);
        let mut record = StringRecord::new();
        while chunk.len() < IMPORT_STAGE_BATCH_SIZE {
            if cancel_requested.load(Ordering::SeqCst) {
                break;
            }
            if !reader
                .read_record(&mut record)
                .context("Could not read TSV record")?
            {
                reached_end = true;
                break;
            }
            let track = TrackRow::from_record(&record, &header_map)?;
            processed_rows += 1;
            processed_bytes = reader.position().byte();
            chunk.push(track);
        }

        if !chunk.is_empty() {
            persist_stage_chunk(
                conn,
                session_id,
                processed_rows - chunk.len() as u64 + 1,
                &chunk,
                &mut albums,
                processed_rows,
                processed_bytes,
            )?;
            progress(
                "preparing",
                Some(session_id),
                processed_rows,
                processed_bytes,
                albums.len() as u64,
                "Staging rows and saving a resumable checkpoint.",
            );
        }

        if cancel_requested.load(Ordering::SeqCst) {
            return finish_cancelled_preparation(conn, fingerprint, progress);
        }
    }

    progress(
        "analyzing",
        Some(session_id),
        processed_rows,
        processed_bytes,
        albums.len() as u64,
        "Comparing the staged snapshot with the active library.",
    );
    ensure_preparation_not_cancelled(cancel_requested)?;
    let final_albums = albums
        .values()
        .map(AlbumAggregate::finalize)
        .collect::<Vec<_>>();
    ensure_preparation_not_cancelled(cancel_requested)?;
    persist_stage_final_albums(conn, session_id, &final_albums, cancel_requested)?;
    ensure_preparation_not_cancelled(cancel_requested)?;
    let changes = calculate_staged_changes(conn, session_id, &final_albums, cancel_requested)?;
    ensure_preparation_not_cancelled(cancel_requested)?;
    let suspicious = find_suspicious_albums(conn, &final_albums, cancel_requested)?;
    ensure_preparation_not_cancelled(cancel_requested)?;
    persist_import_delta(
        conn,
        session_id,
        processed_rows,
        albums.len() as u64,
        &changes,
        &suspicious,
        cancel_requested,
    )?;

    progress(
        "ready",
        Some(session_id),
        processed_rows,
        fingerprint.size_bytes.max(0) as u64,
        albums.len() as u64,
        "Delta ready. Review it before applying the atomic import.",
    );
    preview_from_session(
        conn,
        load_import_session(conn, session_id)?,
        Some(fingerprint),
    )
}

fn load_stage_album_aggregates(
    conn: &Connection,
    session_id: i64,
) -> Result<HashMap<String, AlbumAggregate>> {
    let mut stmt = conn.prepare(
        "
        SELECT album_id, album_unique_id, album, album_artist_display,
               single_display_artist, single_display_artist_key,
               has_multiple_display_artists, canonical_genre, genre_normalized,
               publisher, year, release_year, album_rating, total_tracks,
               rated_tracks, normalized_rating_sum, total_seconds, loved_tracks,
               tmoe_seconds
        FROM import_stage_albums
        WHERE session_id = ?1
        ",
    )?;
    let rows = stmt.query_map(params![session_id], |row| {
        let album_id: String = row.get(0)?;
        Ok((
            album_id.clone(),
            AlbumAggregate {
                album_id,
                album_unique_id: row.get(1)?,
                album: row.get(2)?,
                album_artist_display: row.get(3)?,
                single_display_artist: row.get(4)?,
                single_display_artist_key: row.get(5)?,
                has_multiple_display_artists: row.get(6)?,
                canonical_genre: row.get(7)?,
                genre_normalized: row.get(8)?,
                publisher: row.get(9)?,
                year: row.get(10)?,
                release_year: row.get(11)?,
                album_rating: row.get(12)?,
                total_tracks: row.get::<_, i64>(13)? as u32,
                rated_tracks: row.get::<_, i64>(14)? as u32,
                normalized_rating_sum: row.get(15)?,
                total_seconds: row.get(16)?,
                loved_tracks: row.get::<_, i64>(17)? as u32,
                tmoe_seconds: row.get(18)?,
            },
        ))
    })?;
    rows.collect::<rusqlite::Result<HashMap<_, _>>>()
        .context("Could not load staged album checkpoints")
}

fn persist_stage_chunk(
    conn: &mut Connection,
    session_id: i64,
    first_row_number: u64,
    chunk: &[TrackRow],
    albums: &mut HashMap<String, AlbumAggregate>,
    processed_rows: u64,
    processed_bytes: u64,
) -> Result<()> {
    let mut dirty_album_ids = HashSet::new();
    for track in chunk {
        albums
            .entry(track.album_id.clone())
            .or_insert_with(|| AlbumAggregate::new(track))
            .apply(track);
        dirty_album_ids.insert(track.album_id.clone());
    }

    let tx = conn
        .transaction()
        .context("Could not save import checkpoint")?;
    {
        let mut insert = tx.prepare(
            "
            INSERT INTO import_stage_tracks (
                session_id, row_number, display_artist, album_rating_raw,
                disc_number_raw, album, genre, canonical_genre, genre_normalized,
                love, publisher, rating_raw, title, track_number_raw, year_raw,
                release_year_raw, album_unique_id, file_path, filename,
                album_artist_display, time_raw, normalized_rating,
                track_rating_value, album_rating, disc_number, track_number,
                year, release_year, time_seconds, album_id, row_hash
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
                ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24,
                ?25, ?26, ?27, ?28, ?29, ?30, ?31
            )
            ",
        )?;
        for (index, track) in chunk.iter().enumerate() {
            insert.execute(params![
                session_id,
                (first_row_number + index as u64) as i64,
                &track.display_artist,
                &track.album_rating_raw,
                &track.disc_number_raw,
                &track.album,
                &track.genre,
                &track.canonical_genre,
                &track.genre_normalized,
                &track.love,
                &track.publisher,
                &track.rating_raw,
                &track.title,
                &track.track_number_raw,
                &track.year_raw,
                &track.release_year_raw,
                &track.album_unique_id,
                &track.file_path,
                &track.filename,
                &track.album_artist_display,
                &track.time_raw,
                track.normalized_rating,
                track.track_rating_value,
                track.album_rating,
                track.disc_number,
                track.track_number,
                track.year,
                track.release_year,
                track.time_seconds,
                &track.album_id,
                &track.row_hash,
            ])?;
        }
    }
    {
        let mut upsert = tx.prepare(
            "
            INSERT INTO import_stage_albums (
                session_id, album_id, album_unique_id, album,
                album_artist_display, single_display_artist,
                single_display_artist_key, has_multiple_display_artists,
                canonical_genre, genre_normalized, publisher, year, release_year,
                album_rating, total_tracks, rated_tracks, normalized_rating_sum,
                total_seconds, loved_tracks, tmoe_seconds
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20
            )
            ON CONFLICT(session_id, album_id) DO UPDATE SET
                album_unique_id = excluded.album_unique_id,
                album = excluded.album,
                album_artist_display = excluded.album_artist_display,
                single_display_artist = excluded.single_display_artist,
                single_display_artist_key = excluded.single_display_artist_key,
                has_multiple_display_artists = excluded.has_multiple_display_artists,
                canonical_genre = excluded.canonical_genre,
                genre_normalized = excluded.genre_normalized,
                publisher = excluded.publisher,
                year = excluded.year,
                release_year = excluded.release_year,
                album_rating = excluded.album_rating,
                total_tracks = excluded.total_tracks,
                rated_tracks = excluded.rated_tracks,
                normalized_rating_sum = excluded.normalized_rating_sum,
                total_seconds = excluded.total_seconds,
                loved_tracks = excluded.loved_tracks,
                tmoe_seconds = excluded.tmoe_seconds
            ",
        )?;
        for album_id in dirty_album_ids {
            let album = albums
                .get(&album_id)
                .ok_or_else(|| anyhow!("Missing staged album accumulator {album_id}"))?;
            upsert.execute(params![
                session_id,
                &album.album_id,
                &album.album_unique_id,
                &album.album,
                &album.album_artist_display,
                &album.single_display_artist,
                &album.single_display_artist_key,
                album.has_multiple_display_artists,
                &album.canonical_genre,
                &album.genre_normalized,
                &album.publisher,
                album.year,
                album.release_year,
                album.album_rating,
                album.total_tracks,
                album.rated_tracks,
                album.normalized_rating_sum,
                album.total_seconds,
                album.loved_tracks,
                album.tmoe_seconds,
            ])?;
        }
    }
    tx.execute(
        "
        UPDATE import_sessions
        SET status = 'preparing', processed_rows = ?1, processed_bytes = ?2,
            track_rows = ?1, album_count = ?3, updated_at = ?4,
            error_message = NULL
        WHERE id = ?5
        ",
        params![
            processed_rows as i64,
            processed_bytes as i64,
            albums.len() as i64,
            Utc::now().to_rfc3339(),
            session_id
        ],
    )?;
    tx.commit().context("Could not commit import checkpoint")?;
    Ok(())
}

fn persist_stage_final_albums(
    conn: &mut Connection,
    session_id: i64,
    albums: &[FinalAlbum],
    cancel_requested: &AtomicBool,
) -> Result<()> {
    let tx = conn
        .transaction()
        .context("Could not start staged album finalization")?;
    {
        let mut update = tx.prepare(
            "
            UPDATE import_stage_albums
            SET final_album_artist_display = ?1,
                rating_completeness = ?2,
                ae_ratio = ?3,
                calculated_album_rating = ?4,
                effective_album_rating = ?5,
                album_score = ?6,
                album_artist_display_inferred = ?7
            WHERE session_id = ?8 AND album_id = ?9
            ",
        )?;
        for album in albums {
            ensure_preparation_not_cancelled(cancel_requested)?;
            update.execute(params![
                &album.album_artist_display,
                album.rating_completeness,
                album.ae_ratio,
                album.calculated_album_rating,
                album.effective_album_rating,
                album.album_score,
                album.album_artist_display_inferred,
                session_id,
                &album.album_id,
            ])?;
        }
    }
    tx.commit()
        .context("Could not finalize staged album calculations")
}

fn calculate_staged_changes(
    conn: &Connection,
    session_id: i64,
    final_albums: &[FinalAlbum],
    cancel_requested: &AtomicBool,
) -> Result<ImportChanges> {
    ensure_preparation_not_cancelled(cancel_requested)?;
    let added_tracks = conn.query_row(ADDED_TRACKS_SQL, params![session_id], |row| row.get(0))?;
    ensure_preparation_not_cancelled(cancel_requested)?;
    let changed_tracks =
        conn.query_row(CHANGED_TRACKS_SQL, params![session_id], |row| row.get(0))?;
    ensure_preparation_not_cancelled(cancel_requested)?;
    let removed_tracks =
        conn.query_row(REMOVED_TRACKS_SQL, params![session_id], |row| row.get(0))?;
    ensure_preparation_not_cancelled(cancel_requested)?;

    let mut previous_albums = load_previous_albums(conn)?;
    let mut changes = ImportChanges {
        added_tracks,
        changed_tracks,
        removed_tracks,
        ..ImportChanges::default()
    };
    for album in final_albums {
        ensure_preparation_not_cancelled(cancel_requested)?;
        match previous_albums.remove(&album.album_id) {
            Some(previous) if album_changed(&previous, album) => changes.changed_albums += 1,
            Some(_) => {}
            None => changes.added_albums += 1,
        }
    }
    changes.removed_albums = previous_albums.len() as i64;
    Ok(changes)
}

fn find_suspicious_albums(
    conn: &Connection,
    final_albums: &[FinalAlbum],
    cancel_requested: &AtomicBool,
) -> Result<Vec<ImportSuspiciousAlbum>> {
    let mut previous_albums = load_previous_albums(conn)?;
    let mut suspicious = Vec::new();

    for album in final_albums {
        ensure_preparation_not_cancelled(cancel_requested)?;
        if let Some(previous) = previous_albums.remove(&album.album_id) {
            let missing_tracks = previous.total_tracks.saturating_sub(album.total_tracks);
            let material_drop = missing_tracks >= 3
                || (previous.total_tracks >= 4
                    && album.total_tracks * 4 < previous.total_tracks * 3);
            if material_drop {
                suspicious.push(ImportSuspiciousAlbum {
                    album_id: album.album_id.clone(),
                    album: album.album.clone(),
                    album_artist_display: album.album_artist_display.clone(),
                    year: album.year,
                    reason: format!(
                        "Track count falls from {} to {}",
                        previous.total_tracks, album.total_tracks
                    ),
                    previous_track_count: Some(i64::from(previous.total_tracks)),
                    current_track_count: Some(i64::from(album.total_tracks)),
                });
            } else if previous.album_artist_display.is_some()
                && album.album_artist_display.is_none()
            {
                suspicious.push(ImportSuspiciousAlbum {
                    album_id: album.album_id.clone(),
                    album: album.album.clone(),
                    album_artist_display: None,
                    year: album.year,
                    reason: "Album artist metadata would disappear".to_string(),
                    previous_track_count: Some(i64::from(previous.total_tracks)),
                    current_track_count: Some(i64::from(album.total_tracks)),
                });
            } else if previous.year.is_some() && album.year.is_none() {
                suspicious.push(ImportSuspiciousAlbum {
                    album_id: album.album_id.clone(),
                    album: album.album.clone(),
                    album_artist_display: album.album_artist_display.clone(),
                    year: None,
                    reason: "Release year metadata would disappear".to_string(),
                    previous_track_count: Some(i64::from(previous.total_tracks)),
                    current_track_count: Some(i64::from(album.total_tracks)),
                });
            }
        } else if album.album.is_none() || album.album_artist_display.is_none() {
            suspicious.push(ImportSuspiciousAlbum {
                album_id: album.album_id.clone(),
                album: album.album.clone(),
                album_artist_display: album.album_artist_display.clone(),
                year: album.year,
                reason: "New album has incomplete identity metadata".to_string(),
                previous_track_count: None,
                current_track_count: Some(i64::from(album.total_tracks)),
            });
        }
    }

    for previous in previous_albums.into_values() {
        ensure_preparation_not_cancelled(cancel_requested)?;
        if previous.rated_tracks > 0
            || previous.loved_tracks > 0
            || previous.effective_album_rating.is_some()
        {
            suspicious.push(ImportSuspiciousAlbum {
                album_id: previous.album_id,
                album: previous.album,
                album_artist_display: previous.album_artist_display,
                year: previous.year,
                reason: "Rated or loved album would be removed".to_string(),
                previous_track_count: Some(i64::from(previous.total_tracks)),
                current_track_count: Some(0),
            });
        }
    }
    suspicious.sort_by(|left, right| {
        left.reason
            .cmp(&right.reason)
            .then_with(|| left.album.cmp(&right.album))
    });
    Ok(suspicious)
}

fn persist_import_delta(
    conn: &mut Connection,
    session_id: i64,
    track_rows: u64,
    album_count: u64,
    changes: &ImportChanges,
    suspicious: &[ImportSuspiciousAlbum],
    cancel_requested: &AtomicBool,
) -> Result<()> {
    let tx = conn
        .transaction()
        .context("Could not save the prepared import delta")?;
    tx.execute(
        "DELETE FROM import_suspicious_albums WHERE session_id = ?1",
        params![session_id],
    )?;
    {
        let mut insert = tx.prepare(
            "
            INSERT INTO import_suspicious_albums (
                session_id, album_id, album, album_artist_display, year, reason,
                previous_track_count, current_track_count
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ",
        )?;
        for album in suspicious {
            ensure_preparation_not_cancelled(cancel_requested)?;
            insert.execute(params![
                session_id,
                &album.album_id,
                &album.album,
                &album.album_artist_display,
                album.year,
                &album.reason,
                album.previous_track_count,
                album.current_track_count,
            ])?;
        }
    }
    let now = Utc::now().to_rfc3339();
    tx.execute(
        "
        UPDATE import_sessions
        SET status = 'ready', processed_rows = ?1, processed_bytes = source_size_bytes,
            track_rows = ?1, album_count = ?2,
            added_tracks = ?3, changed_tracks = ?4, removed_tracks = ?5,
            added_albums = ?6, changed_albums = ?7, removed_albums = ?8,
            suspicious_album_count = ?9, updated_at = ?10, error_message = NULL
        WHERE id = ?11
        ",
        params![
            track_rows as i64,
            album_count as i64,
            changes.added_tracks,
            changes.changed_tracks,
            changes.removed_tracks,
            changes.added_albums,
            changes.changed_albums,
            changes.removed_albums,
            suspicious.len() as i64,
            &now,
            session_id,
        ],
    )?;
    tx.commit()
        .context("Could not commit the prepared import delta")
}

fn load_stage_final_albums(conn: &Connection, session_id: i64) -> Result<Vec<FinalAlbum>> {
    let mut stmt = conn.prepare(
        "
        SELECT album_id, album_unique_id, album, final_album_artist_display,
               canonical_genre, genre_normalized, publisher, year, release_year,
               total_tracks, rated_tracks, rating_completeness, total_seconds,
               loved_tracks, tmoe_seconds, ae_ratio, album_rating,
               calculated_album_rating, effective_album_rating, album_score,
               album_artist_display_inferred
        FROM import_stage_albums
        WHERE session_id = ?1
        ORDER BY album_id
        ",
    )?;
    let rows = stmt.query_map(params![session_id], |row| {
        Ok(FinalAlbum {
            album_id: row.get(0)?,
            album_unique_id: row.get(1)?,
            album: row.get(2)?,
            album_artist_display: row.get(3)?,
            canonical_genre: row.get(4)?,
            genre_normalized: row.get(5)?,
            publisher: row.get(6)?,
            year: row.get(7)?,
            release_year: row.get(8)?,
            total_tracks: row.get::<_, i64>(9)? as u32,
            rated_tracks: row.get::<_, i64>(10)? as u32,
            rating_completeness: row.get(11)?,
            total_seconds: row.get(12)?,
            loved_tracks: row.get::<_, i64>(13)? as u32,
            tmoe_seconds: row.get(14)?,
            ae_ratio: row.get(15)?,
            album_rating: row.get(16)?,
            calculated_album_rating: row.get(17)?,
            effective_album_rating: row.get(18)?,
            album_score: row.get(19)?,
            album_artist_display_inferred: row.get(20)?,
        })
    })?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load finalized staged albums")
}

fn apply_staged_import(
    conn: &mut Connection,
    session: &ImportSessionRecord,
    import_run_id: i64,
    started: Instant,
) -> Result<(u64, u64, i64)> {
    let final_albums = load_stage_final_albums(conn, session.id)?;
    let mut previous_albums = load_previous_albums(conn)?;
    let mut rating_events = Vec::new();
    for album in &final_albums {
        match previous_albums.remove(&album.album_id) {
            Some(previous) => {
                if let Some(event) = rating_event_for_changed_album(&previous, album) {
                    rating_events.push(event);
                }
            }
            None => {
                if let Some(event) = rating_event_for_added_album(album) {
                    rating_events.push(event);
                }
            }
        }
    }
    for previous in previous_albums.values() {
        if let Some(event) = rating_event_for_removed_album(previous) {
            rating_events.push(event);
        }
    }

    let tx = conn
        .transaction()
        .context("Could not start atomic staged import")?;
    tx.execute_batch(
        "
        DELETE FROM raw_tracks;
        DELETE FROM tracks;
        DELETE FROM albums;
        ",
    )
    .context("Could not clear the previous import tables")?;
    tx.execute(
        "
        INSERT INTO raw_tracks (
            import_run_id, row_number, display_artist, album_rating, disc_number,
            album, genre, love, publisher, rating, title, track_number,
            year_value, release_year, album_unique_id, file_path, filename,
            album_artist_display, time_value, row_hash
        )
        SELECT ?1, row_number, NULLIF(display_artist, ''),
               NULLIF(album_rating_raw, ''), NULLIF(disc_number_raw, ''),
               NULLIF(album, ''), NULLIF(genre, ''), NULLIF(love, ''),
               NULLIF(publisher, ''), NULLIF(rating_raw, ''), NULLIF(title, ''),
               NULLIF(track_number_raw, ''), NULLIF(year_raw, ''),
               NULLIF(release_year_raw, ''), NULLIF(album_unique_id, ''),
               NULLIF(file_path, ''), NULLIF(filename, ''),
               NULLIF(album_artist_display, ''), NULLIF(time_raw, ''), row_hash
        FROM import_stage_tracks
        WHERE session_id = ?2
        ORDER BY row_number
        ",
        params![import_run_id, session.id],
    )
    .context("Could not copy staged raw tracks")?;
    tx.execute(
        "
        INSERT INTO tracks (
            import_run_id, album_id, album_unique_id, display_artist,
            album_artist_display, album, title, genre, canonical_genre,
            genre_normalized, publisher, love, rating_raw, normalized_rating,
            album_rating_raw, album_rating, disc_number, track_number, year,
            release_year, time_seconds, file_path, filename, row_hash
        )
        SELECT ?1, album_id, NULLIF(album_unique_id, ''),
               NULLIF(display_artist, ''), NULLIF(album_artist_display, ''),
               NULLIF(album, ''), NULLIF(title, ''), NULLIF(genre, ''),
               NULLIF(canonical_genre, ''), NULLIF(genre_normalized, ''),
               NULLIF(publisher, ''), NULLIF(love, ''), NULLIF(rating_raw, ''),
               normalized_rating, NULLIF(album_rating_raw, ''), album_rating,
               disc_number, track_number, year, release_year, time_seconds,
               NULLIF(file_path, ''), NULLIF(filename, ''), row_hash
        FROM import_stage_tracks
        WHERE session_id = ?2
        ORDER BY row_number
        ",
        params![import_run_id, session.id],
    )
    .context("Could not copy staged normalized tracks")?;
    tx.execute(
        "
        UPDATE tracks
        SET album_artist_display = (
            SELECT staged.final_album_artist_display
            FROM import_stage_albums staged
            WHERE staged.session_id = ?1 AND staged.album_id = tracks.album_id
        )
        WHERE NULLIF(TRIM(COALESCE(album_artist_display, '')), '') IS NULL
          AND EXISTS (
              SELECT 1
              FROM import_stage_albums staged
              WHERE staged.session_id = ?1
                AND staged.album_id = tracks.album_id
                AND staged.album_artist_display_inferred = 1
          )
        ",
        params![session.id],
    )
    .context("Could not apply inferred album artists to staged tracks")?;
    tx.execute(
        "
        INSERT INTO albums (
            id, import_run_id, album_unique_id, album, album_artist_display,
            canonical_genre, genre_normalized, publisher, year, release_year,
            total_tracks, rated_tracks, rating_completeness, total_seconds,
            loved_tracks, tmoe_seconds, ae_ratio, album_rating,
            calculated_album_rating, effective_album_rating, album_score
        )
        SELECT album_id, ?1, album_unique_id, album, final_album_artist_display,
               canonical_genre, genre_normalized, publisher, year, release_year,
               total_tracks, rated_tracks, rating_completeness, total_seconds,
               loved_tracks, tmoe_seconds, ae_ratio, album_rating,
               calculated_album_rating, effective_album_rating, album_score
        FROM import_stage_albums
        WHERE session_id = ?2
        ",
        params![import_run_id, session.id],
    )
    .context("Could not copy staged albums")?;

    insert_rating_events(&tx, import_run_id, &rating_events)?;
    insert_rating_snapshot(&tx, import_run_id, &final_albums)?;
    db::rebuild_search_indexes(&tx)?;
    let completed_at = Utc::now().to_rfc3339();
    let duration_ms = started.elapsed().as_millis() as i64;
    tx.execute(
        "
        UPDATE import_runs
        SET completed_at = ?1, status = 'completed', track_rows = ?2,
            album_count = ?3, duration_ms = ?4, rating_events_count = ?5
        WHERE id = ?6
        ",
        params![
            &completed_at,
            session.track_rows,
            session.album_count,
            duration_ms,
            rating_events.len() as i64,
            import_run_id,
        ],
    )?;
    tx.execute(
        "
        UPDATE import_sessions
        SET status = 'completed', updated_at = ?1, completed_at = ?1,
            import_run_id = ?2, error_message = NULL
        WHERE id = ?3
        ",
        params![&completed_at, import_run_id, session.id],
    )?;
    tx.commit()
        .context("Could not commit the atomic staged import")?;
    Ok((
        session.track_rows.max(0) as u64,
        session.album_count.max(0) as u64,
        rating_events.len() as i64,
    ))
}

#[cfg(not(test))]
fn cleanup_completed_stage(conn: &Connection, session_id: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM import_stage_tracks WHERE session_id = ?1",
        params![session_id],
    )?;
    conn.execute(
        "DELETE FROM import_stage_albums WHERE session_id = ?1",
        params![session_id],
    )?;
    Ok(())
}

#[cfg(not(test))]
fn completed_stage_storage_should_be_reclaimed(conn: &Connection) -> Result<bool> {
    let page_size = conn.query_row("PRAGMA page_size", [], |row| row.get::<_, i64>(0))?;
    let free_pages = conn.query_row("PRAGMA freelist_count", [], |row| row.get::<_, i64>(0))?;
    Ok(page_size.saturating_mul(free_pages) >= IMPORT_STAGE_VACUUM_THRESHOLD_BYTES)
}

#[cfg(not(test))]
fn reclaim_completed_stage_storage(conn: &Connection) -> Result<()> {
    conn.execute_batch("VACUUM; PRAGMA wal_checkpoint(TRUNCATE);")
        .context("Could not compact SQLite after removing completed import staging rows")
}

#[cfg(not(test))]
#[allow(dead_code)]
pub fn import_musicbee_tsv(app: AppHandle, source_path: String) -> Result<ImportSummary> {
    let started = Instant::now();
    let (mut conn, db_path) = db::open(&app)?;
    let settings = db::settings_for_connection(&conn)?;
    let source_path = resolve_source_path(&source_path)?;
    let source_metadata = fs::metadata(&source_path)
        .with_context(|| format!("Could not read metadata for {}", source_path.display()))?;
    let source_size_bytes = source_metadata.len() as i64;

    emit_progress(
        &app,
        "starting",
        None,
        0,
        0,
        source_size_bytes.max(0) as u64,
        0,
        "Creating a database backup before import.",
    );
    let backup_path = create_backup(
        &conn,
        &db_path,
        &source_path,
        source_size_bytes,
        settings.backup_retention as usize,
    )?;
    let backup_path_text = backup_path.as_ref().map(|path| path.display().to_string());

    let now = Utc::now().to_rfc3339();
    conn.execute(
        "
        INSERT INTO import_runs (
            source_path, source_size_bytes, started_at, status, backup_path
        ) VALUES (?1, ?2, ?3, 'running', ?4)
        ",
        params![
            source_path.display().to_string(),
            source_size_bytes,
            now,
            backup_path_text
        ],
    )
    .context("Could not create import run")?;
    let import_run_id = conn.last_insert_rowid();

    let import_result = run_import(&app, &mut conn, import_run_id, &source_path);

    match import_result {
        Ok((track_rows, album_count, changes)) => {
            let duration_ms = started.elapsed().as_millis();
            let completed_at = Utc::now().to_rfc3339();
            conn.execute(
                "
                UPDATE import_runs
                SET completed_at = ?1,
                    status = 'completed',
                    track_rows = ?2,
                    album_count = ?3,
                    duration_ms = ?4,
                    added_tracks = ?5,
                    changed_tracks = ?6,
                    removed_tracks = ?7,
                    added_albums = ?8,
                    changed_albums = ?9,
                    removed_albums = ?10,
                    rating_events_count = ?11
                WHERE id = ?12
                ",
                params![
                    completed_at,
                    track_rows as i64,
                    album_count as i64,
                    duration_ms as i64,
                    changes.added_tracks,
                    changes.changed_tracks,
                    changes.removed_tracks,
                    changes.added_albums,
                    changes.changed_albums,
                    changes.removed_albums,
                    changes.rating_events_count,
                    import_run_id
                ],
            )
            .context("Could not update completed import run")?;
            wishlist::reconcile_for_connection(&conn)
                .context("Could not reconcile the wish list after import")?;

            emit_progress(
                &app,
                "completed",
                None,
                track_rows,
                source_size_bytes.max(0) as u64,
                source_size_bytes.max(0) as u64,
                album_count,
                "Import completed and album calculations refreshed.",
            );

            Ok(ImportSummary {
                import_run: db::get_import_run(&conn, import_run_id)?,
                track_rows,
                album_count,
                duration_ms,
                backup_path: backup_path_text,
            })
        }
        Err(error) => {
            let duration_ms = started.elapsed().as_millis() as i64;
            let message = error.to_string();
            let _ = conn.execute(
                "
                UPDATE import_runs
                SET completed_at = ?1,
                    status = 'failed',
                    duration_ms = ?2,
                    error_message = ?3
                WHERE id = ?4
                ",
                params![Utc::now().to_rfc3339(), duration_ms, message, import_run_id],
            );
            emit_progress(
                &app,
                "failed",
                None,
                0,
                0,
                source_size_bytes.max(0) as u64,
                0,
                "Import failed.",
            );
            Err(error)
        }
    }
}

#[cfg(not(test))]
#[allow(dead_code)]
fn run_import(
    app: &AppHandle,
    conn: &mut Connection,
    import_run_id: i64,
    source_path: &Path,
) -> Result<(u64, u64, ImportChanges)> {
    let mut previous_tracks = load_previous_track_hashes(conn)?;
    let mut previous_albums = load_previous_albums(conn)?;
    let mut changes = ImportChanges::default();

    let mut reader = musicbee_tsv_reader_builder()
        .from_path(source_path)
        .with_context(|| format!("Could not open TSV source {}", source_path.display()))?;

    let headers = reader
        .headers()
        .context("Could not read TSV header")?
        .clone();
    let header_map = HeaderMap::from_headers(&headers)?;

    let tx = conn
        .transaction()
        .context("Could not start import transaction")?;
    tx.execute_batch(
        "
        DELETE FROM raw_tracks;
        DELETE FROM tracks;
        DELETE FROM albums;
        ",
    )
    .context("Could not clear previous import tables")?;

    let mut albums: HashMap<String, AlbumAggregate> = HashMap::new();
    let mut processed_rows = 0_u64;

    {
        let mut insert_raw = tx.prepare(
            "
            INSERT INTO raw_tracks (
                import_run_id, row_number, display_artist, album_rating, disc_number,
                album, genre, love, publisher, rating, title, track_number, year_value,
                release_year, album_unique_id, file_path, filename, album_artist_display,
                time_value, row_hash
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20
            )
            ",
        )?;

        let mut insert_track = tx.prepare(
            "
            INSERT INTO tracks (
                import_run_id, album_id, album_unique_id, display_artist, album_artist_display,
                album, title, genre, canonical_genre, genre_normalized, publisher, love,
                rating_raw, normalized_rating, album_rating_raw, album_rating, disc_number,
                track_number, year, release_year, time_seconds, file_path, filename, row_hash
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24
            )
            ",
        )?;

        for result in reader.records() {
            let record = result.context("Could not read TSV record")?;
            processed_rows += 1;
            let track = TrackRow::from_record(&record, &header_map)?;
            let track_key = track_identity(&track.file_path, &track.filename);
            match previous_tracks.remove(&track_key) {
                Some(previous_hash) if previous_hash != track.row_hash => {
                    changes.changed_tracks += 1;
                }
                Some(_) => {}
                None => {
                    changes.added_tracks += 1;
                }
            }

            insert_raw.execute(params![
                import_run_id,
                processed_rows as i64,
                &track.display_artist,
                &track.album_rating_raw,
                &track.disc_number_raw,
                &track.album,
                &track.genre,
                &track.love,
                &track.publisher,
                &track.rating_raw,
                &track.title,
                &track.track_number_raw,
                &track.year_raw,
                &track.release_year_raw,
                &track.album_unique_id,
                &track.file_path,
                &track.filename,
                &track.album_artist_display,
                &track.time_raw,
                &track.row_hash,
            ])?;

            insert_track.execute(params![
                import_run_id,
                &track.album_id,
                empty_to_none(&track.album_unique_id),
                empty_to_none(&track.display_artist),
                empty_to_none(&track.album_artist_display),
                empty_to_none(&track.album),
                empty_to_none(&track.title),
                empty_to_none(&track.genre),
                empty_to_none(&track.canonical_genre),
                empty_to_none(&track.genre_normalized),
                empty_to_none(&track.publisher),
                empty_to_none(&track.love),
                empty_to_none(&track.rating_raw),
                track.normalized_rating,
                empty_to_none(&track.album_rating_raw),
                track.album_rating,
                track.disc_number,
                track.track_number,
                track.year,
                track.release_year,
                track.time_seconds,
                empty_to_none(&track.file_path),
                empty_to_none(&track.filename),
                &track.row_hash,
            ])?;

            albums
                .entry(track.album_id.clone())
                .or_insert_with(|| AlbumAggregate::new(&track))
                .apply(&track);

            if processed_rows % 10_000 == 0 {
                emit_progress(
                    app,
                    "running",
                    None,
                    processed_rows,
                    0,
                    0,
                    albums.len() as u64,
                    "Streaming TSV rows into SQLite.",
                );
            }
        }
    }

    changes.removed_tracks = previous_tracks.len() as i64;
    let final_albums = albums
        .values()
        .map(AlbumAggregate::finalize)
        .collect::<Vec<_>>();
    let mut rating_events = Vec::new();

    {
        let mut update_inferred_track_album_artist = tx.prepare(
            "
            UPDATE tracks
            SET album_artist_display = ?1
            WHERE album_id = ?2
              AND NULLIF(TRIM(COALESCE(album_artist_display, '')), '') IS NULL
            ",
        )?;
        for final_album in &final_albums {
            if final_album.album_artist_display_inferred {
                update_inferred_track_album_artist.execute(params![
                    &final_album.album_artist_display,
                    &final_album.album_id,
                ])?;
            }
        }
    }

    {
        let mut insert_album = tx.prepare(
            "
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, album_rating,
                calculated_album_rating, effective_album_rating, album_score
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
                ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21
            )
            ",
        )?;

        for final_album in &final_albums {
            match previous_albums.remove(&final_album.album_id) {
                Some(previous_album) => {
                    if album_changed(&previous_album, final_album) {
                        changes.changed_albums += 1;
                    }
                    if let Some(event) =
                        rating_event_for_changed_album(&previous_album, final_album)
                    {
                        rating_events.push(event);
                    }
                }
                None => {
                    changes.added_albums += 1;
                    if let Some(event) = rating_event_for_added_album(final_album) {
                        rating_events.push(event);
                    }
                }
            }

            insert_album.execute(params![
                &final_album.album_id,
                import_run_id,
                &final_album.album_unique_id,
                &final_album.album,
                &final_album.album_artist_display,
                &final_album.canonical_genre,
                &final_album.genre_normalized,
                &final_album.publisher,
                final_album.year,
                final_album.release_year,
                final_album.total_tracks,
                final_album.rated_tracks,
                final_album.rating_completeness,
                final_album.total_seconds,
                final_album.loved_tracks,
                final_album.tmoe_seconds,
                final_album.ae_ratio,
                final_album.album_rating,
                final_album.calculated_album_rating,
                final_album.effective_album_rating,
                final_album.album_score,
            ])?;
        }
    }

    for previous_album in previous_albums.values() {
        if let Some(event) = rating_event_for_removed_album(previous_album) {
            rating_events.push(event);
        }
    }
    changes.removed_albums = previous_albums.len() as i64;
    changes.rating_events_count = rating_events.len() as i64;
    insert_rating_events(&tx, import_run_id, &rating_events)?;
    insert_rating_snapshot(&tx, import_run_id, &final_albums)?;

    db::rebuild_search_indexes(&tx)?;
    tx.commit().context("Could not commit import transaction")?;
    Ok((processed_rows, albums.len() as u64, changes))
}

#[cfg(not(test))]
#[allow(dead_code)]
fn load_previous_track_hashes(conn: &Connection) -> Result<HashMap<String, String>> {
    let mut stmt = conn.prepare(
        "
        SELECT COALESCE(file_path, ''), COALESCE(filename, ''), row_hash
        FROM tracks
        ",
    )?;
    let rows = stmt
        .query_map([], |row| {
            let file_path: String = row.get(0)?;
            let filename: String = row.get(1)?;
            let row_hash: String = row.get(2)?;
            Ok((track_identity(&file_path, &filename), row_hash))
        })?
        .collect::<rusqlite::Result<HashMap<_, _>>>()?;
    Ok(rows)
}

fn load_previous_albums(conn: &Connection) -> Result<HashMap<String, PreviousAlbum>> {
    let mut stmt = conn.prepare(
        "
        SELECT
            id,
            album,
            album_artist_display,
            year,
            total_tracks,
            rated_tracks,
            rating_completeness,
            total_seconds,
            loved_tracks,
            tmoe_seconds,
            ae_ratio,
            effective_album_rating,
            album_score
        FROM albums
        ",
    )?;
    let rows = stmt
        .query_map([], |row| {
            let album_id: String = row.get(0)?;
            Ok((
                album_id.clone(),
                PreviousAlbum {
                    album_id,
                    album: row.get(1)?,
                    album_artist_display: row.get(2)?,
                    year: row.get(3)?,
                    total_tracks: row.get::<_, i64>(4)? as u32,
                    rated_tracks: row.get::<_, i64>(5)? as u32,
                    rating_completeness: row.get(6)?,
                    total_seconds: row.get(7)?,
                    loved_tracks: row.get::<_, i64>(8)? as u32,
                    tmoe_seconds: row.get(9)?,
                    ae_ratio: row.get(10)?,
                    effective_album_rating: row.get(11)?,
                    album_score: row.get(12)?,
                },
            ))
        })?
        .collect::<rusqlite::Result<HashMap<_, _>>>()?;
    Ok(rows)
}

#[cfg(not(test))]
#[allow(dead_code)]
fn track_identity(file_path: &str, filename: &str) -> String {
    format!("{file_path}\u{1f}{filename}")
}

fn album_changed(previous: &PreviousAlbum, current: &FinalAlbum) -> bool {
    previous.album != current.album
        || previous.album_artist_display != current.album_artist_display
        || previous.year != current.year
        || previous.total_tracks != current.total_tracks
        || previous.rated_tracks != current.rated_tracks
        || float_changed(previous.rating_completeness, current.rating_completeness)
        || previous.total_seconds != current.total_seconds
        || previous.loved_tracks != current.loved_tracks
        || previous.tmoe_seconds != current.tmoe_seconds
        || float_changed(previous.ae_ratio, current.ae_ratio)
        || previous.effective_album_rating != current.effective_album_rating
        || optional_float_changed(previous.album_score, current.album_score)
}

fn rating_event_for_changed_album(
    previous: &PreviousAlbum,
    current: &FinalAlbum,
) -> Option<RatingEventRecord> {
    let progress_changed = previous.rated_tracks != current.rated_tracks
        || float_changed(previous.rating_completeness, current.rating_completeness);
    let rating_changed = previous.effective_album_rating != current.effective_album_rating;

    if !progress_changed && !rating_changed {
        return None;
    }

    let event_type = if previous.rating_completeness < 1.0 && current.rating_completeness >= 1.0 {
        "completed"
    } else if previous.rated_tracks < current.rated_tracks {
        "ratedMore"
    } else if previous.rated_tracks > current.rated_tracks {
        "ratedLess"
    } else if rating_changed {
        "ratingChanged"
    } else {
        "ratingUpdated"
    };

    Some(RatingEventRecord {
        event_type: event_type.to_string(),
        album_id: current.album_id.clone(),
        album: current.album.clone(),
        album_artist_display: current.album_artist_display.clone(),
        year: current.year,
        previous_rated_tracks: Some(i64::from(previous.rated_tracks)),
        current_rated_tracks: Some(i64::from(current.rated_tracks)),
        previous_rating_completeness: Some(previous.rating_completeness),
        current_rating_completeness: Some(current.rating_completeness),
        previous_effective_album_rating: previous.effective_album_rating,
        current_effective_album_rating: current.effective_album_rating,
    })
}

fn rating_event_for_added_album(current: &FinalAlbum) -> Option<RatingEventRecord> {
    if current.rated_tracks == 0 && current.effective_album_rating.is_none() {
        return None;
    }

    Some(RatingEventRecord {
        event_type: if current.rating_completeness >= 1.0 {
            "addedRated".to_string()
        } else {
            "addedPartial".to_string()
        },
        album_id: current.album_id.clone(),
        album: current.album.clone(),
        album_artist_display: current.album_artist_display.clone(),
        year: current.year,
        previous_rated_tracks: None,
        current_rated_tracks: Some(i64::from(current.rated_tracks)),
        previous_rating_completeness: None,
        current_rating_completeness: Some(current.rating_completeness),
        previous_effective_album_rating: None,
        current_effective_album_rating: current.effective_album_rating,
    })
}

fn rating_event_for_removed_album(previous: &PreviousAlbum) -> Option<RatingEventRecord> {
    if previous.rated_tracks == 0 && previous.effective_album_rating.is_none() {
        return None;
    }

    Some(RatingEventRecord {
        event_type: "removedRated".to_string(),
        album_id: previous.album_id.clone(),
        album: previous.album.clone(),
        album_artist_display: previous.album_artist_display.clone(),
        year: previous.year,
        previous_rated_tracks: Some(i64::from(previous.rated_tracks)),
        current_rated_tracks: None,
        previous_rating_completeness: Some(previous.rating_completeness),
        current_rating_completeness: None,
        previous_effective_album_rating: previous.effective_album_rating,
        current_effective_album_rating: None,
    })
}

fn insert_rating_events(
    tx: &Transaction<'_>,
    import_run_id: i64,
    events: &[RatingEventRecord],
) -> Result<()> {
    let created_at = Utc::now().to_rfc3339();
    let mut insert_event = tx.prepare(
        "
        INSERT INTO rating_events (
            import_run_id, created_at, event_type, album_id, album,
            album_artist_display, year, previous_rated_tracks, current_rated_tracks,
            previous_rating_completeness, current_rating_completeness,
            previous_effective_album_rating, current_effective_album_rating
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13
        )
        ",
    )?;

    for event in events {
        insert_event.execute(params![
            import_run_id,
            &created_at,
            &event.event_type,
            &event.album_id,
            &event.album,
            &event.album_artist_display,
            event.year,
            event.previous_rated_tracks,
            event.current_rated_tracks,
            event.previous_rating_completeness,
            event.current_rating_completeness,
            event.previous_effective_album_rating,
            event.current_effective_album_rating,
        ])?;
    }

    Ok(())
}

fn insert_rating_snapshot(
    tx: &Transaction<'_>,
    import_run_id: i64,
    albums: &[FinalAlbum],
) -> Result<()> {
    let track_count = albums
        .iter()
        .map(|album| i64::from(album.total_tracks))
        .sum::<i64>();
    let rated_tracks = albums
        .iter()
        .map(|album| i64::from(album.rated_tracks))
        .sum::<i64>();
    let unrated_tracks = track_count - rated_tracks;
    let fully_rated_albums = albums
        .iter()
        .filter(|album| album.rating_completeness >= 1.0)
        .count() as i64;
    let partially_rated_albums = albums
        .iter()
        .filter(|album| album.rating_completeness > 0.0 && album.rating_completeness < 1.0)
        .count() as i64;
    let unrated_albums = albums
        .iter()
        .filter(|album| album.rating_completeness == 0.0)
        .count() as i64;
    let albums_with_effective_rating = albums
        .iter()
        .filter(|album| album.effective_album_rating.is_some())
        .count() as i64;
    let average_album_rating = average_i32(
        albums
            .iter()
            .filter_map(|album| album.effective_album_rating),
    );
    let average_album_score = average_f64(albums.iter().filter_map(|album| album.album_score));

    tx.execute(
        "
        INSERT INTO rating_snapshots (
            import_run_id, created_at, track_count, album_count, rated_tracks,
            unrated_tracks, fully_rated_albums, partially_rated_albums,
            unrated_albums, albums_with_effective_rating, average_album_rating,
            average_album_score
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        ",
        params![
            import_run_id,
            Utc::now().to_rfc3339(),
            track_count,
            albums.len() as i64,
            rated_tracks,
            unrated_tracks,
            fully_rated_albums,
            partially_rated_albums,
            unrated_albums,
            albums_with_effective_rating,
            average_album_rating,
            average_album_score,
        ],
    )
    .context("Could not record rating snapshot")?;

    Ok(())
}

fn float_changed(previous: f64, current: f64) -> bool {
    (previous - current).abs() > 0.000_001
}

fn optional_float_changed(previous: Option<f64>, current: Option<f64>) -> bool {
    match (previous, current) {
        (Some(previous), Some(current)) => float_changed(previous, current),
        (None, None) => false,
        _ => true,
    }
}

fn average_i32(values: impl Iterator<Item = i32>) -> Option<f64> {
    let mut count = 0_u64;
    let mut total = 0_i64;
    for value in values {
        count += 1;
        total += i64::from(value);
    }

    if count == 0 {
        None
    } else {
        Some(total as f64 / count as f64)
    }
}

fn average_f64(values: impl Iterator<Item = f64>) -> Option<f64> {
    let mut count = 0_u64;
    let mut total = 0.0;
    for value in values {
        count += 1;
        total += value;
    }

    if count == 0 {
        None
    } else {
        Some(total / count as f64)
    }
}

impl HeaderMap {
    fn from_headers(headers: &StringRecord) -> Result<Self> {
        for required in REQUIRED_COLUMNS {
            if !headers.iter().any(|header| header == required) {
                bail!("Missing required TSV column: {required}");
            }
        }

        Ok(Self {
            display_artist: header_index(headers, "Display Artist")?,
            album_rating: header_index(headers, "Album Rating")?,
            disc_number: header_index(headers, "Disc#")?,
            album: header_index(headers, "Album")?,
            genre: header_index(headers, "Genre")?,
            love: header_index(headers, "Love")?,
            publisher: header_index(headers, "Publisher")?,
            rating: header_index(headers, "Rating")?,
            title: header_index(headers, "Title")?,
            track_number: header_index(headers, "Track#")?,
            year: header_index(headers, "Year")?,
            release_year: header_index(headers, "Release Year")?,
            album_unique_id: header_index(headers, "<Album Unique Id>")?,
            file_path: header_index(headers, "<File Path>")?,
            filename: header_index(headers, "<Filename>")?,
            album_artist_display: header_index(headers, "Album Artist (display)")?,
            time: header_index(headers, "Time")?,
        })
    }
}

impl TrackRow {
    fn from_record(record: &StringRecord, headers: &HeaderMap) -> Result<Self> {
        let display_artist = clean_field(record.get(headers.display_artist));
        let album_rating_raw = clean_field(record.get(headers.album_rating));
        let disc_number_raw = clean_field(record.get(headers.disc_number));
        let album = clean_field(record.get(headers.album));
        let genre = clean_field(record.get(headers.genre));
        let love = clean_field(record.get(headers.love));
        let publisher = clean_field(record.get(headers.publisher));
        let rating_raw = clean_field(record.get(headers.rating));
        let title = clean_field(record.get(headers.title));
        let track_number_raw = clean_field(record.get(headers.track_number));
        let year_raw = clean_field(record.get(headers.year));
        let release_year_raw = clean_field(record.get(headers.release_year));
        let album_unique_id = clean_field(record.get(headers.album_unique_id));
        let file_path = clean_field(record.get(headers.file_path));
        let filename = clean_field(record.get(headers.filename));
        let album_artist_display = clean_field(record.get(headers.album_artist_display));
        let time_raw = clean_field(record.get(headers.time));

        let canonical_genre = canonical_genre(&genre);
        let genre_normalized = normalize_text(&canonical_genre);
        let normalized_rating = normalize_track_rating(&rating_raw);
        let track_rating_value = parse_track_rating(&rating_raw);
        let album_rating = parse_album_rating(&album_rating_raw);
        let disc_number = parse_whole_number(&disc_number_raw);
        let track_number = parse_whole_number(&track_number_raw);
        let year = parse_year_value(&year_raw);
        let release_year = parse_year_value(&release_year_raw);
        let time_seconds = parse_time_seconds(&time_raw);
        let album_id = album_identity(
            &album_unique_id,
            &album_artist_display,
            &album,
            year,
            &file_path,
        );
        let row_hash = row_hash(&[
            &display_artist,
            &album_rating_raw,
            &disc_number_raw,
            &album,
            &genre,
            &love,
            &publisher,
            &rating_raw,
            &title,
            &track_number_raw,
            &year_raw,
            &release_year_raw,
            &album_unique_id,
            &file_path,
            &filename,
            &album_artist_display,
            &time_raw,
        ]);

        Ok(Self {
            display_artist,
            album_rating_raw,
            disc_number_raw,
            album,
            genre,
            canonical_genre,
            genre_normalized,
            love,
            publisher,
            rating_raw,
            title,
            track_number_raw,
            year_raw,
            release_year_raw,
            album_unique_id,
            file_path,
            filename,
            album_artist_display,
            time_raw,
            normalized_rating,
            track_rating_value,
            album_rating,
            disc_number,
            track_number,
            year,
            release_year,
            time_seconds,
            album_id,
            row_hash,
        })
    }
}

impl AlbumAggregate {
    fn new(track: &TrackRow) -> Self {
        Self {
            album_id: track.album_id.clone(),
            album_unique_id: empty_to_none(&track.album_unique_id).map(str::to_string),
            album: empty_to_none(&track.album).map(str::to_string),
            album_artist_display: empty_to_none(&track.album_artist_display).map(str::to_string),
            single_display_artist: None,
            single_display_artist_key: None,
            has_multiple_display_artists: false,
            canonical_genre: empty_to_none(&track.canonical_genre).map(str::to_string),
            genre_normalized: empty_to_none(&track.genre_normalized).map(str::to_string),
            publisher: empty_to_none(&track.publisher).map(str::to_string),
            year: track.year,
            release_year: track.release_year,
            album_rating: track.album_rating,
            total_tracks: 0,
            rated_tracks: 0,
            normalized_rating_sum: 0,
            total_seconds: 0,
            loved_tracks: 0,
            tmoe_seconds: 0,
        }
    }

    fn apply(&mut self, track: &TrackRow) {
        self.total_tracks += 1;

        if self.album.is_none() {
            self.album = empty_to_none(&track.album).map(str::to_string);
        }
        if self.album_artist_display.is_none() {
            self.album_artist_display =
                empty_to_none(&track.album_artist_display).map(str::to_string);
        }
        if let Some(display_artist) = empty_to_none(&track.display_artist) {
            let display_artist_key = normalize_artist_key(display_artist);
            match &self.single_display_artist_key {
                Some(existing_key) if existing_key != &display_artist_key => {
                    self.has_multiple_display_artists = true;
                }
                None => {
                    self.single_display_artist = Some(display_artist.to_string());
                    self.single_display_artist_key = Some(display_artist_key);
                }
                _ => {}
            }
        }
        if self.canonical_genre.is_none() {
            self.canonical_genre = empty_to_none(&track.canonical_genre).map(str::to_string);
        }
        if self.genre_normalized.is_none() {
            self.genre_normalized = empty_to_none(&track.genre_normalized).map(str::to_string);
        }
        if self.publisher.is_none() {
            self.publisher = empty_to_none(&track.publisher).map(str::to_string);
        }
        if self.year.is_none() {
            self.year = track.year;
        }
        if self.release_year.is_none() {
            self.release_year = track.release_year;
        }
        if self.album_rating.is_none() {
            self.album_rating = track.album_rating;
        }

        if let Some(normalized_rating) = track.normalized_rating {
            self.rated_tracks += 1;
            self.normalized_rating_sum += i64::from(normalized_rating);
        }

        if let Some(time_seconds) = track.time_seconds {
            self.total_seconds += time_seconds;
            if track.track_rating_value == Some(5) {
                self.tmoe_seconds += time_seconds;
            }
        }

        if track.love == "L" {
            self.loved_tracks += 1;
        }
    }

    fn finalize(&self) -> FinalAlbum {
        let rating_completeness = if self.total_tracks == 0 {
            0.0
        } else {
            f64::from(self.rated_tracks) / f64::from(self.total_tracks)
        };

        let calculated_album_rating = if self.total_tracks > 0
            && self.total_tracks == self.rated_tracks
        {
            Some((self.normalized_rating_sum as f64 / f64::from(self.rated_tracks)).round() as i32)
        } else {
            None
        };

        let effective_album_rating = self.album_rating.or(calculated_album_rating);
        let ae_ratio = if self.total_seconds > 0 {
            self.tmoe_seconds as f64 / self.total_seconds as f64
        } else {
            0.0
        };
        let tmoe_minutes = self.tmoe_seconds as f64 / 60.0;
        let album_score = effective_album_rating.map(|rating| {
            ((rating as f64 * 0.5) + (ae_ratio * 100.0) + (tmoe_minutes * 0.3)) / 10.0
                + (f64::from(self.loved_tracks) * 100.0)
        });
        let inferred_album_artist_display =
            self.album_artist_display.is_none() && !self.has_multiple_display_artists;
        let album_artist_display = self.album_artist_display.clone().or_else(|| {
            if inferred_album_artist_display {
                self.single_display_artist.clone()
            } else {
                None
            }
        });

        FinalAlbum {
            album_id: self.album_id.clone(),
            album_unique_id: self.album_unique_id.clone(),
            album: self.album.clone(),
            album_artist_display,
            canonical_genre: self.canonical_genre.clone(),
            genre_normalized: self.genre_normalized.clone(),
            publisher: self.publisher.clone(),
            year: self.year,
            release_year: self.release_year,
            total_tracks: self.total_tracks,
            rated_tracks: self.rated_tracks,
            rating_completeness,
            total_seconds: self.total_seconds,
            loved_tracks: self.loved_tracks,
            tmoe_seconds: self.tmoe_seconds,
            ae_ratio,
            album_rating: self.album_rating,
            calculated_album_rating,
            effective_album_rating,
            album_score,
            album_artist_display_inferred: inferred_album_artist_display
                && self.single_display_artist.is_some(),
        }
    }
}

#[cfg(not(test))]
fn create_backup(
    conn: &Connection,
    db_path: &Path,
    source_path: &Path,
    source_size_bytes: i64,
    backup_retention: usize,
) -> Result<Option<PathBuf>> {
    conn.execute_batch("PRAGMA wal_checkpoint(FULL);")
        .context("Could not checkpoint SQLite WAL before backup")?;

    if !db_path.exists() {
        return Ok(None);
    }

    let backup_dir = db_path
        .parent()
        .ok_or_else(|| anyhow!("Database path has no parent directory"))?
        .join("backups");
    fs::create_dir_all(&backup_dir).context("Could not create backup directory")?;

    let backup_path = backup_dir.join(format!(
        "music-library-{}-before-import.sqlite3",
        Utc::now().format("%Y%m%d-%H%M%S")
    ));
    fs::copy(db_path, &backup_path).with_context(|| {
        format!(
            "Could not create database backup from {} to {}",
            db_path.display(),
            backup_path.display()
        )
    })?;

    conn.execute(
        "
        INSERT INTO database_backups (
            created_at, operation, source_path, source_size_bytes, backup_path
        ) VALUES (?1, 'import', ?2, ?3, ?4)
        ",
        params![
            Utc::now().to_rfc3339(),
            source_path.display().to_string(),
            source_size_bytes,
            backup_path.display().to_string()
        ],
    )
    .context("Could not record database backup metadata")?;

    enforce_backup_retention(&backup_dir, backup_retention)?;
    Ok(Some(backup_path))
}

#[cfg(not(test))]
fn enforce_backup_retention(backup_dir: &Path, backup_retention: usize) -> Result<()> {
    let mut backups = fs::read_dir(backup_dir)
        .with_context(|| format!("Could not read backup directory {}", backup_dir.display()))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .path()
                .extension()
                .map(|extension| extension == "sqlite3")
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();

    backups.sort_by_key(|entry| {
        entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .ok()
    });
    backups.reverse();

    for stale in backups.into_iter().skip(backup_retention) {
        fs::remove_file(stale.path())
            .with_context(|| format!("Could not remove stale backup {}", stale.path().display()))?;
    }

    Ok(())
}

fn resolve_source_path(source_path: &str) -> Result<PathBuf> {
    let trimmed = source_path.trim();
    if trimmed.is_empty() {
        bail!("Choose a TSV source path before starting import");
    }

    let provided = PathBuf::from(trimmed);
    let candidates = if provided.is_absolute() {
        vec![provided]
    } else {
        let cwd = std::env::current_dir().context("Could not read current working directory")?;
        let mut candidates = vec![cwd.join(&provided)];
        if let Some(parent) = cwd.parent() {
            candidates.push(parent.join(&provided));
        }
        candidates
    };

    candidates
        .into_iter()
        .find(|candidate| candidate.exists())
        .map(|candidate| candidate.canonicalize().unwrap_or(candidate))
        .ok_or_else(|| anyhow!("Could not find TSV source path: {source_path}"))
}

fn musicbee_tsv_reader_builder() -> csv::ReaderBuilder {
    let mut builder = csv::ReaderBuilder::new();
    builder.delimiter(b'\t').flexible(true).quoting(false);
    builder
}

fn header_index(headers: &StringRecord, name: &str) -> Result<usize> {
    headers
        .iter()
        .position(|header| header == name)
        .ok_or_else(|| anyhow!("Missing required TSV column: {name}"))
}

fn clean_field(value: Option<&str>) -> String {
    value.unwrap_or_default().trim().to_string()
}

fn empty_to_none(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn canonical_genre(genre: &str) -> String {
    genre
        .split(|character| character == ';' || character == '|')
        .next()
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn normalize_text(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn normalize_artist_text(value: &str) -> String {
    normalize_text(&normalize_artist_dashes(value))
}

fn normalize_artist_key(value: &str) -> String {
    let normalized = normalize_artist_text(value);
    if normalized.is_empty() {
        "unknown".to_string()
    } else {
        normalized
    }
}

fn normalize_artist_dashes(value: &str) -> String {
    value
        .chars()
        .map(|character| match character {
            '\u{2010}' | '\u{2011}' | '\u{2012}' | '\u{2013}' | '\u{2014}' | '\u{2212}' => '-',
            _ => character,
        })
        .collect()
}

fn parse_whole_number(value: &str) -> Option<i32> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let parsed = trimmed.parse::<f64>().ok()?;
    if parsed.is_finite() && parsed.fract() == 0.0 {
        Some(parsed as i32)
    } else {
        None
    }
}

fn parse_year_value(value: &str) -> Option<i32> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(year) = parse_whole_number(trimmed) {
        return Some(year);
    }

    let mut parts = trimmed.split('-');
    let (Some(year_part), Some(month_part), Some(day_part), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return None;
    };

    if year_part.len() != 4 || month_part.len() != 2 || day_part.len() != 2 {
        return None;
    }

    if !year_part
        .chars()
        .all(|character| character.is_ascii_digit())
        || !month_part
            .chars()
            .all(|character| character.is_ascii_digit())
        || !day_part.chars().all(|character| character.is_ascii_digit())
    {
        return None;
    }

    let year = year_part.parse::<i32>().ok()?;
    let month = month_part.parse::<i32>().ok()?;
    let day = day_part.parse::<i32>().ok()?;
    if (1..=12).contains(&month) && (1..=31).contains(&day) {
        Some(year)
    } else {
        None
    }
}

fn parse_track_rating(value: &str) -> Option<i32> {
    let rating = parse_whole_number(value)?;
    if (0..=5).contains(&rating) {
        Some(rating)
    } else {
        None
    }
}

fn normalize_track_rating(value: &str) -> Option<i32> {
    parse_track_rating(value).map(|rating| rating * 20)
}

fn parse_album_rating(value: &str) -> Option<i32> {
    let rating = parse_whole_number(value)?;
    if (0..=100).contains(&rating) {
        Some(rating)
    } else {
        None
    }
}

fn parse_time_seconds(value: &str) -> Option<i64> {
    let parts = value
        .trim()
        .split(':')
        .map(|part| part.parse::<i64>().ok())
        .collect::<Option<Vec<_>>>()?;

    match parts.as_slice() {
        [minutes, seconds] if (0..60).contains(seconds) => Some(minutes * 60 + seconds),
        [hours, minutes, seconds] if (0..60).contains(minutes) && (0..60).contains(seconds) => {
            Some(hours * 3600 + minutes * 60 + seconds)
        }
        _ => None,
    }
}

fn album_identity(
    album_unique_id: &str,
    album_artist: &str,
    album: &str,
    year: Option<i32>,
    file_path: &str,
) -> String {
    if let Some(unique_id) = empty_to_none(album_unique_id) {
        return format!("mb:{unique_id}");
    }

    format!(
        "fallback:{}::{}::{}::{}",
        normalize_artist_text(album_artist),
        normalize_text(album),
        year.map(|value| value.to_string()).unwrap_or_default(),
        normalize_text(&path_root(file_path))
    )
}

fn path_root(file_path: &str) -> String {
    let normalized = file_path.replace('/', "\\");
    let mut parts = normalized.split('\\').filter(|part| !part.is_empty());
    match (parts.next(), parts.next()) {
        (Some(drive), Some(first_dir)) if drive.ends_with(':') => format!("{drive}\\{first_dir}"),
        (Some(first), _) => first.to_string(),
        _ => String::new(),
    }
}

fn row_hash(values: &[&str]) -> String {
    let mut hasher = Sha256::new();
    for value in values {
        hasher.update(value.as_bytes());
        hasher.update([0]);
    }
    hex::encode(hasher.finalize())
}

#[cfg(not(test))]
fn emit_progress(
    app: &AppHandle,
    status: &str,
    session_id: Option<i64>,
    processed_rows: u64,
    processed_bytes: u64,
    total_bytes: u64,
    album_count: u64,
    message: &str,
) {
    let _ = app.emit(
        "import-progress",
        ImportProgress {
            status: status.to_string(),
            session_id,
            processed_rows,
            processed_bytes,
            total_bytes,
            album_count,
            message: message.to_string(),
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_musicbee_time_values() {
        assert_eq!(parse_time_seconds("4:05"), Some(245));
        assert_eq!(parse_time_seconds("1:02:03"), Some(3723));
        assert_eq!(parse_time_seconds("4:65"), None);
    }

    #[test]
    fn normalizes_only_whole_track_ratings() {
        assert_eq!(normalize_track_rating("5"), Some(100));
        assert_eq!(normalize_track_rating("5.0"), Some(100));
        assert_eq!(normalize_track_rating("0"), Some(0));
        assert_eq!(normalize_track_rating("3.5"), None);
        assert_eq!(normalize_track_rating("6"), None);
    }

    #[test]
    fn parses_musicbee_year_values() {
        assert_eq!(parse_year_value("2019"), Some(2019));
        assert_eq!(parse_year_value("2019.0"), Some(2019));
        assert_eq!(parse_year_value("2019-06-28"), Some(2019));
        assert_eq!(parse_year_value("1985-01-31"), Some(1985));
        assert_eq!(parse_year_value("2019-00-28"), None);
        assert_eq!(parse_year_value("2019-06"), None);
    }

    #[test]
    fn treats_musicbee_tsv_quotes_as_literal_text() {
        let tsv = [
            REQUIRED_COLUMNS.join("\t"),
            [
                "Artist",
                "",
                "1",
                "Album",
                "Genre",
                "",
                "Publisher",
                "4",
                "\"Unclosed Quote",
                "1",
                "2026",
                "2026",
                "album-1",
                "D:\\Music\\Artist - Album (2026)",
                "01 - Artist - Unclosed Quote.mp3",
                "Artist",
                "3:21",
            ]
            .join("\t"),
            [
                "Artist",
                "",
                "1",
                "Album",
                "Genre",
                "",
                "Publisher",
                "5",
                "Next Track",
                "2",
                "2026",
                "2026",
                "album-1",
                "D:\\Music\\Artist - Album (2026)",
                "02 - Artist - Next Track.mp3",
                "Artist",
                "2:34",
            ]
            .join("\t"),
        ]
        .join("\n");

        let mut reader = musicbee_tsv_reader_builder().from_reader(tsv.as_bytes());
        let headers = reader.headers().expect("read headers").clone();
        let header_map = HeaderMap::from_headers(&headers).expect("map headers");
        let rows = reader
            .records()
            .collect::<csv::Result<Vec<_>>>()
            .expect("read records");

        assert_eq!(rows.len(), 2);
        assert_eq!(
            TrackRow::from_record(&rows[0], &header_map)
                .expect("parse first row")
                .title,
            "\"Unclosed Quote"
        );
        assert_eq!(
            TrackRow::from_record(&rows[1], &header_map)
                .expect("parse second row")
                .title,
            "Next Track"
        );
    }

    #[test]
    fn stores_date_like_musicbee_year_fields_as_canonical_years() {
        let headers = StringRecord::from(REQUIRED_COLUMNS.to_vec());
        let header_map = HeaderMap::from_headers(&headers).expect("map headers");
        let record = StringRecord::from(vec![
            "Artist",
            "",
            "1",
            "Date Album",
            "Pop",
            "",
            "Publisher",
            "4",
            "Date Track",
            "1",
            "2019-06-28",
            "1985-01-31",
            "",
            "D:\\Music\\Artist - Date Album",
            "01 - Date Track.mp3",
            "Artist",
            "3:21",
        ]);

        let track = TrackRow::from_record(&record, &header_map).expect("parse date-like years");
        assert_eq!(track.year_raw, "2019-06-28");
        assert_eq!(track.year, Some(2019));
        assert_eq!(track.release_year, Some(1985));
        assert!(track.album_id.contains("::2019::"));

        let mut album = AlbumAggregate::new(&track);
        album.apply(&track);
        let final_album = album.finalize();
        assert_eq!(final_album.year, Some(2019));
        assert_eq!(final_album.release_year, Some(1985));
    }

    #[test]
    fn infers_album_artist_from_single_display_artist_when_album_artist_is_blank() {
        let first = TrackRow {
            display_artist: "The All-American Rejects".to_string(),
            album_rating_raw: String::new(),
            disc_number_raw: String::new(),
            album: "Sandbox".to_string(),
            genre: "Alternative Rock".to_string(),
            canonical_genre: "Alternative Rock".to_string(),
            genre_normalized: "alternative rock".to_string(),
            love: String::new(),
            publisher: String::new(),
            rating_raw: String::new(),
            title: "Easy Come, Easy Go".to_string(),
            track_number_raw: "1".to_string(),
            year_raw: "2026".to_string(),
            release_year_raw: String::new(),
            album_unique_id: "sandbox".to_string(),
            file_path: "D:\\Music\\The All-American Rejects - Sandbox (2026)".to_string(),
            filename: "01 - Easy Come, Easy Go.mp3".to_string(),
            album_artist_display: String::new(),
            time_raw: "2:34".to_string(),
            normalized_rating: None,
            track_rating_value: None,
            album_rating: None,
            disc_number: None,
            track_number: Some(1),
            year: Some(2026),
            release_year: None,
            time_seconds: Some(154),
            album_id: "mb:sandbox".to_string(),
            row_hash: "hash".to_string(),
        };
        let mut second = first.clone();
        second.display_artist = "The All\u{2010}American Rejects".to_string();
        second.title = "Get This".to_string();
        second.track_number_raw = "2".to_string();
        second.filename = "02 - Get This.mp3".to_string();
        second.track_number = Some(2);
        second.time_seconds = Some(199);
        second.row_hash = "hash-2".to_string();

        let mut album = AlbumAggregate::new(&first);
        album.apply(&first);
        album.apply(&second);

        let final_album = album.finalize();
        assert_eq!(
            final_album.album_artist_display.as_deref(),
            Some("The All-American Rejects")
        );
        assert!(final_album.album_artist_display_inferred);
        assert_eq!(final_album.total_tracks, 2);
    }

    #[test]
    fn leaves_album_artist_blank_when_blank_album_artist_has_multiple_display_artists() {
        let first = TrackRow {
            display_artist: "Artist One".to_string(),
            album_rating_raw: String::new(),
            disc_number_raw: String::new(),
            album: "Compilation".to_string(),
            genre: "Pop".to_string(),
            canonical_genre: "Pop".to_string(),
            genre_normalized: "pop".to_string(),
            love: String::new(),
            publisher: String::new(),
            rating_raw: String::new(),
            title: "One".to_string(),
            track_number_raw: "1".to_string(),
            year_raw: "2026".to_string(),
            release_year_raw: String::new(),
            album_unique_id: "compilation".to_string(),
            file_path: "D:\\Music\\Compilation".to_string(),
            filename: "01 - One.mp3".to_string(),
            album_artist_display: String::new(),
            time_raw: "3:00".to_string(),
            normalized_rating: None,
            track_rating_value: None,
            album_rating: None,
            disc_number: None,
            track_number: Some(1),
            year: Some(2026),
            release_year: None,
            time_seconds: Some(180),
            album_id: "mb:compilation".to_string(),
            row_hash: "hash".to_string(),
        };
        let mut second = first.clone();
        second.display_artist = "Artist Two".to_string();
        second.title = "Two".to_string();
        second.track_number = Some(2);
        second.row_hash = "hash-2".to_string();

        let mut album = AlbumAggregate::new(&first);
        album.apply(&first);
        album.apply(&second);

        let final_album = album.finalize();
        assert_eq!(final_album.album_artist_display, None);
        assert!(!final_album.album_artist_display_inferred);
    }

    #[test]
    fn calculates_album_score_with_spec_formula() {
        let album = AlbumAggregate {
            album_id: "mb:test".to_string(),
            album_unique_id: Some("test".to_string()),
            album: Some("Album".to_string()),
            album_artist_display: Some("Artist".to_string()),
            single_display_artist: Some("Artist".to_string()),
            single_display_artist_key: Some("artist".to_string()),
            has_multiple_display_artists: false,
            canonical_genre: Some("Synthpop".to_string()),
            genre_normalized: Some("synthpop".to_string()),
            publisher: None,
            year: Some(1987),
            release_year: Some(1987),
            album_rating: Some(65),
            total_tracks: 10,
            rated_tracks: 10,
            normalized_rating_sum: 650,
            total_seconds: 2820,
            loved_tracks: 2,
            tmoe_seconds: 840,
        };

        let final_album = album.finalize();
        assert_eq!(final_album.rating_completeness, 1.0);
        assert_eq!(final_album.effective_album_rating, Some(65));
        assert_eq!(final_album.tmoe_seconds, 840);
        assert_eq!(final_album.loved_tracks, 2);
        assert_eq!(
            final_album
                .album_score
                .map(|score| (score * 1000.0).round() / 1000.0),
            Some(206.649)
        );
    }

    #[test]
    fn cancelled_preparation_resumes_from_the_durable_checkpoint() {
        use std::sync::atomic::AtomicU64;

        let test_id = format!(
            "music-library-import-resume-{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        );
        let test_dir = std::env::temp_dir().join(test_id);
        fs::create_dir_all(&test_dir).expect("create import test directory");
        let source_path = test_dir.join("library.tsv");
        let mut tsv = String::new();
        tsv.push_str(&REQUIRED_COLUMNS.join("\t"));
        tsv.push('\n');
        for index in 0..5_001 {
            let values = [
                "Checkpoint Artist".to_string(),
                String::new(),
                "1".to_string(),
                format!("Checkpoint Album {index}"),
                "Rock".to_string(),
                String::new(),
                "Label".to_string(),
                "4".to_string(),
                format!("Track {index}"),
                "1".to_string(),
                "2026".to_string(),
                "2026".to_string(),
                format!("checkpoint-{index}"),
                format!(r"D:\Music\Checkpoint {index}"),
                format!("{index:05}.mp3"),
                "Checkpoint Artist".to_string(),
                "3:00".to_string(),
            ];
            tsv.push_str(&values.join("\t"));
            tsv.push('\n');
        }
        fs::write(&source_path, tsv).expect("write import test TSV");

        let mut conn = Connection::open_in_memory().expect("open import test database");
        crate::db::configure(&conn).expect("configure import test database");
        crate::db::migrate(&conn).expect("migrate import test database");
        let fingerprint =
            source_fingerprint(&source_path.display().to_string()).expect("fingerprint test TSV");
        let cancel = AtomicBool::new(false);
        let last_checkpoint = AtomicU64::new(0);
        let first_progress = |_: &str, _: Option<i64>, rows: u64, _: u64, _: u64, _: &str| {
            last_checkpoint.store(rows, Ordering::SeqCst);
            if rows >= IMPORT_STAGE_BATCH_SIZE as u64 {
                cancel.store(true, Ordering::SeqCst);
            }
        };

        let cancelled = prepare_import_preview_for_connection(
            &mut conn,
            &fingerprint,
            &cancel,
            &first_progress,
        )
        .expect("cancel staged import");
        assert_eq!(cancelled.status, "cancelled");
        assert_eq!(cancelled.processed_rows, IMPORT_STAGE_BATCH_SIZE as i64);
        assert!(cancelled.can_resume);
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM import_stage_tracks WHERE session_id = ?1",
                params![cancelled.session_id],
                |row| row.get::<_, i64>(0),
            )
            .expect("count checkpoint tracks"),
            IMPORT_STAGE_BATCH_SIZE as i64
        );

        cancel.store(false, Ordering::SeqCst);
        let resumed = prepare_import_preview_for_connection(
            &mut conn,
            &fingerprint,
            &cancel,
            &|_, _, _, _, _, _| {},
        )
        .expect("resume staged import");
        assert_eq!(resumed.status, "ready");
        assert_eq!(resumed.track_rows, 5_001);
        assert_eq!(resumed.album_count, 5_001);
        assert_eq!(resumed.added_tracks, 5_001);
        assert_eq!(resumed.added_albums, 5_001);
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM import_stage_tracks WHERE session_id = ?1",
                params![resumed.session_id],
                |row| row.get::<_, i64>(0),
            )
            .expect("count resumed tracks"),
            5_001
        );
        assert_eq!(
            last_checkpoint.load(Ordering::SeqCst),
            IMPORT_STAGE_BATCH_SIZE as u64
        );

        fs::remove_dir_all(&test_dir).expect("remove import test directory");
    }

    #[test]
    fn final_track_delta_uses_indexed_null_safe_identity_lookups() {
        let test_id = format!(
            "music-library-import-delta-{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        );
        let test_dir = std::env::temp_dir().join(test_id);
        fs::create_dir_all(&test_dir).expect("create delta test directory");
        let source_path = test_dir.join("library.tsv");
        let records = vec![
            vec![
                "Artist",
                "",
                "1",
                "Unchanged Album",
                "Rock",
                "",
                "Label",
                "4",
                "Unchanged Track",
                "1",
                "2026",
                "2026",
                "unchanged-album",
                r"D:\Music\Unchanged Album",
                "01.mp3",
                "Artist",
                "3:00",
            ],
            vec![
                "Artist",
                "",
                "1",
                "Null Identity Album",
                "Rock",
                "",
                "Label",
                "5",
                "Changed Null Identity",
                "1",
                "2026",
                "2026",
                "null-identity-album",
                "",
                "",
                "Artist",
                "3:01",
            ],
            vec![
                "Artist",
                "",
                "1",
                "Added Album",
                "Rock",
                "",
                "Label",
                "3",
                "Added Track",
                "1",
                "2026",
                "2026",
                "added-album",
                r"D:\Music\Added Album",
                "01.mp3",
                "Artist",
                "3:02",
            ],
        ];
        let mut tsv = format!("{}\n", REQUIRED_COLUMNS.join("\t"));
        for record in &records {
            tsv.push_str(&record.join("\t"));
            tsv.push('\n');
        }
        fs::write(&source_path, tsv).expect("write delta test TSV");

        let headers = StringRecord::from(REQUIRED_COLUMNS.to_vec());
        let header_map = HeaderMap::from_headers(&headers).expect("map delta test headers");
        let unchanged = TrackRow::from_record(&StringRecord::from(records[0].clone()), &header_map)
            .expect("parse unchanged track");

        let mut conn = Connection::open_in_memory().expect("open delta test database");
        crate::db::configure(&conn).expect("configure delta test database");
        crate::db::migrate(&conn).expect("migrate delta test database");
        conn.execute(
            "INSERT INTO import_runs (source_path, started_at, status) VALUES ('old.tsv', ?1, 'completed')",
            params![Utc::now().to_rfc3339()],
        )
        .expect("seed delta import run");
        let import_run_id = conn.last_insert_rowid();
        conn.execute(
            "
            INSERT INTO tracks (
                import_run_id, album_id, file_path, filename, row_hash
            ) VALUES (?1, ?2, ?3, ?4, ?5)
            ",
            params![
                import_run_id,
                &unchanged.album_id,
                &unchanged.file_path,
                &unchanged.filename,
                &unchanged.row_hash
            ],
        )
        .expect("seed unchanged track");
        conn.execute(
            "
            INSERT INTO tracks (
                import_run_id, album_id, file_path, filename, row_hash
            ) VALUES (?1, 'mb:null-identity-album', NULL, NULL, 'old-null-hash')
            ",
            params![import_run_id],
        )
        .expect("seed null identity track");
        conn.execute(
            "
            INSERT INTO tracks (
                import_run_id, album_id, file_path, filename, row_hash
            ) VALUES (?1, 'mb:removed-album', 'D:\\Music\\Removed', '01.mp3', 'removed-hash')
            ",
            params![import_run_id],
        )
        .expect("seed removed track");

        let fingerprint =
            source_fingerprint(&source_path.display().to_string()).expect("fingerprint delta TSV");
        let ready = prepare_import_preview_for_connection(
            &mut conn,
            &fingerprint,
            &AtomicBool::new(false),
            &|_, _, _, _, _, _| {},
        )
        .expect("prepare indexed delta");
        assert_eq!(ready.added_tracks, 1);
        assert_eq!(ready.changed_tracks, 1);
        assert_eq!(ready.removed_tracks, 1);

        for sql in [ADDED_TRACKS_SQL, CHANGED_TRACKS_SQL] {
            let explain = format!("EXPLAIN QUERY PLAN {sql}");
            let mut statement = conn.prepare(&explain).expect("prepare delta query plan");
            let details = statement
                .query_map(params![ready.session_id], |row| row.get::<_, String>(3))
                .expect("read delta query plan")
                .collect::<rusqlite::Result<Vec<_>>>()
                .expect("collect delta query plan");
            assert!(
                details
                    .iter()
                    .any(|detail| detail.contains("idx_tracks_file")),
                "expected indexed current-track lookup, got {details:?}"
            );
            assert!(
                details
                    .iter()
                    .all(|detail| !detail.starts_with("SCAN current")),
                "unexpected full current-track scan: {details:?}"
            );
        }

        fs::remove_dir_all(&test_dir).expect("remove delta test directory");
    }

    #[test]
    fn cancellation_during_final_analysis_returns_a_resumable_checkpoint() {
        let test_id = format!(
            "music-library-import-analysis-cancel-{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        );
        let test_dir = std::env::temp_dir().join(test_id);
        fs::create_dir_all(&test_dir).expect("create analysis cancellation directory");
        let source_path = test_dir.join("library.tsv");
        let values = [
            "Artist",
            "",
            "1",
            "Album",
            "Rock",
            "",
            "Label",
            "4",
            "Track",
            "1",
            "2026",
            "2026",
            "album",
            r"D:\Music\Album",
            "01.mp3",
            "Artist",
            "3:00",
        ];
        fs::write(
            &source_path,
            format!("{}\n{}\n", REQUIRED_COLUMNS.join("\t"), values.join("\t")),
        )
        .expect("write analysis cancellation TSV");

        let mut conn = Connection::open_in_memory().expect("open analysis cancellation database");
        crate::db::configure(&conn).expect("configure analysis cancellation database");
        crate::db::migrate(&conn).expect("migrate analysis cancellation database");
        let fingerprint = source_fingerprint(&source_path.display().to_string())
            .expect("fingerprint analysis cancellation TSV");
        let cancel = AtomicBool::new(false);
        let progress = |status: &str, _: Option<i64>, _: u64, _: u64, _: u64, _: &str| {
            if status == "analyzing" {
                cancel.store(true, Ordering::SeqCst);
            }
        };

        let cancelled =
            prepare_import_preview_for_connection(&mut conn, &fingerprint, &cancel, &progress)
                .expect("cancel final analysis");
        assert_eq!(cancelled.status, "cancelled");
        assert_eq!(cancelled.processed_rows, 1);
        assert!(cancelled.can_resume);

        cancel.store(false, Ordering::SeqCst);
        let resumed = prepare_import_preview_for_connection(
            &mut conn,
            &fingerprint,
            &cancel,
            &|_, _, _, _, _, _| {},
        )
        .expect("resume final analysis");
        assert_eq!(resumed.status, "ready");
        assert_eq!(resumed.track_rows, 1);

        fs::remove_dir_all(&test_dir).expect("remove analysis cancellation directory");
    }

    #[test]
    fn failed_atomic_apply_keeps_the_active_library_unchanged() {
        let test_id = format!(
            "music-library-import-atomic-{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        );
        let test_dir = std::env::temp_dir().join(test_id);
        fs::create_dir_all(&test_dir).expect("create atomic import test directory");
        let source_path = test_dir.join("library.tsv");
        let values = [
            "New Artist",
            "",
            "1",
            "New Album",
            "Rock",
            "",
            "Label",
            "4",
            "New Track",
            "1",
            "2026",
            "2026",
            "new-album",
            r"D:\Music\New Album",
            "01.mp3",
            "New Artist",
            "3:00",
        ];
        fs::write(
            &source_path,
            format!("{}\n{}\n", REQUIRED_COLUMNS.join("\t"), values.join("\t")),
        )
        .expect("write atomic import test TSV");

        let mut conn = Connection::open_in_memory().expect("open atomic import database");
        crate::db::configure(&conn).expect("configure atomic import database");
        crate::db::migrate(&conn).expect("migrate atomic import database");
        conn.execute(
            "INSERT INTO import_runs (source_path, started_at, status) VALUES ('old.tsv', ?1, 'completed')",
            params![Utc::now().to_rfc3339()],
        )
        .expect("seed old import run");
        let old_run_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO raw_tracks (import_run_id, row_number, row_hash) VALUES (?1, 1, 'old-hash')",
            params![old_run_id],
        )
        .expect("seed old raw track");
        conn.execute(
            "INSERT INTO tracks (import_run_id, album_id, title, row_hash) VALUES (?1, 'old-album', 'Old Track', 'old-hash')",
            params![old_run_id],
        )
        .expect("seed old track");
        conn.execute(
            "
            INSERT INTO albums (
                id, import_run_id, album, album_artist_display, total_tracks,
                rated_tracks, rating_completeness, total_seconds, loved_tracks,
                tmoe_seconds, ae_ratio
            ) VALUES ('old-album', ?1, 'Old Album', 'Old Artist', 1, 0, 0, 180, 0, 0, 0)
            ",
            params![old_run_id],
        )
        .expect("seed old album");

        let fingerprint =
            source_fingerprint(&source_path.display().to_string()).expect("fingerprint atomic TSV");
        let ready = prepare_import_preview_for_connection(
            &mut conn,
            &fingerprint,
            &AtomicBool::new(false),
            &|_, _, _, _, _, _| {},
        )
        .expect("prepare atomic import");
        assert_eq!(ready.status, "ready");

        conn.execute(
            "INSERT INTO import_runs (source_path, started_at, status) VALUES (?1, ?2, 'running')",
            params![&ready.source_path, Utc::now().to_rfc3339()],
        )
        .expect("seed applying import run");
        let applying_run_id = conn.last_insert_rowid();
        conn.execute_batch(
            "
            CREATE TRIGGER reject_new_album
            BEFORE INSERT ON albums
            WHEN NEW.album = 'New Album'
            BEGIN
                SELECT RAISE(ABORT, 'simulated apply failure');
            END;
            ",
        )
        .expect("create apply failure trigger");
        let session = load_import_session(&conn, ready.session_id).expect("load ready session");
        let error = apply_staged_import(&mut conn, &session, applying_run_id, Instant::now())
            .expect_err("atomic apply should fail");
        assert!(error.to_string().contains("Could not copy staged albums"));
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM tracks", [], |row| row
                .get::<_, i64>(0))
                .expect("count active tracks after failed apply"),
            1
        );
        assert_eq!(
            conn.query_row(
                "SELECT album FROM albums WHERE id = 'old-album'",
                [],
                |row| row.get::<_, String>(0),
            )
            .expect("load active album after failed apply"),
            "Old Album"
        );

        fs::remove_dir_all(&test_dir).expect("remove atomic import test directory");
    }
}
