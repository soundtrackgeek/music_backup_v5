use crate::db;
#[cfg(not(test))]
use crate::models::ImportProgress;
use crate::models::{ImportPreview, ImportSummary, ImportSuspiciousAlbum};
use crate::wishlist;
use anyhow::{anyhow, bail, Context, Result};
use chrono::Utc;
use csv::{Position, StringRecord};
use rusqlite::{
    params, Connection, InterruptHandle, OptionalExtension, Row, Transaction, TransactionBehavior,
};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
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
const SCOPED_TRACK_RECORD_SQL: &str = r#"
    SELECT t.id, r.id, t.album_id, t.row_hash,
           t.display_artist,
           COALESCE(t.album_rating_raw, r.album_rating, CAST(t.album_rating AS TEXT)),
           COALESCE(r.disc_number, CAST(t.disc_number AS TEXT)),
           t.album, t.genre, t.love, t.publisher,
           COALESCE(
             t.rating_raw,
             r.rating,
             CASE
               WHEN t.normalized_rating IS NULL THEN NULL
               WHEN t.normalized_rating % 20 = 0 THEN CAST(t.normalized_rating / 20 AS TEXT)
               ELSE printf('%.1f', t.normalized_rating / 20.0)
             END
           ),
           t.title, COALESCE(r.track_number, CAST(t.track_number AS TEXT)),
           COALESCE(r.year_value, CAST(t.year AS TEXT)),
           COALESCE(r.release_year, CAST(t.release_year AS TEXT)),
           t.album_unique_id, t.file_path, t.filename, t.album_artist_display,
           COALESCE(r.time_value, CAST(t.time_seconds AS TEXT)),
           r.row_hash
    FROM tracks AS t
    LEFT JOIN raw_tracks AS r
      ON r.id = t.id
     AND COALESCE(r.file_path, '') = COALESCE(t.file_path, '')
     AND COALESCE(r.filename, '') = COALESCE(t.filename, '')
    WHERE t.id = ?1
"#;
const SCOPED_ALBUM_TRACK_RECORD_SQL: &str = r#"
    SELECT t.id, r.id, t.album_id, t.row_hash,
           t.display_artist,
           COALESCE(t.album_rating_raw, r.album_rating, CAST(t.album_rating AS TEXT)),
           COALESCE(r.disc_number, CAST(t.disc_number AS TEXT)),
           t.album, t.genre, t.love, t.publisher,
           COALESCE(
             t.rating_raw,
             r.rating,
             CASE
               WHEN t.normalized_rating IS NULL THEN NULL
               WHEN t.normalized_rating % 20 = 0 THEN CAST(t.normalized_rating / 20 AS TEXT)
               ELSE printf('%.1f', t.normalized_rating / 20.0)
             END
           ),
           t.title, COALESCE(r.track_number, CAST(t.track_number AS TEXT)),
           COALESCE(r.year_value, CAST(t.year AS TEXT)),
           COALESCE(r.release_year, CAST(t.release_year AS TEXT)),
           t.album_unique_id, t.file_path, t.filename, t.album_artist_display,
           COALESCE(r.time_value, CAST(t.time_seconds AS TEXT)),
           r.row_hash
    FROM tracks AS t
    LEFT JOIN raw_tracks AS r
      ON r.id = t.id
     AND COALESCE(r.file_path, '') = COALESCE(t.file_path, '')
     AND COALESCE(r.filename, '') = COALESCE(t.filename, '')
    WHERE t.album_id = ?1
    ORDER BY t.id
"#;
static IMPORT_CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);
static IMPORT_WORKFLOW_RUNNING: AtomicBool = AtomicBool::new(false);
static BACKUP_FILENAME_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static IMPORT_INTERRUPT_HANDLE: Mutex<Option<InterruptHandle>> = Mutex::new(None);

pub(crate) const REQUIRED_COLUMNS: [&str; 17] = [
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

#[derive(Debug, Clone, PartialEq)]
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

#[derive(Debug, Clone, PartialEq)]
struct PreviousAlbum {
    album_id: String,
    album: Option<String>,
    album_artist_display: Option<String>,
    canonical_genre: Option<String>,
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
struct LibraryUpdateRecord {
    change_kind: &'static str,
    category: &'static str,
    album_id: String,
    album_artist_display: Option<String>,
    album: Option<String>,
    year: Option<i32>,
    field: Option<&'static str>,
    field_label: Option<&'static str>,
    previous_value: Option<String>,
    current_value: Option<String>,
    change_count: Option<i64>,
    description: String,
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

#[derive(Debug)]
pub(crate) struct ExistingAlbumSyncCandidate {
    folder: PathBuf,
    album_id: String,
    track_count: usize,
    prepared: Option<PreparedExistingAlbumSync>,
}

impl ExistingAlbumSyncCandidate {
    pub(crate) fn folder(&self) -> &Path {
        &self.folder
    }

    pub(crate) fn album_id(&self) -> &str {
        &self.album_id
    }

    pub(crate) fn track_count(&self) -> usize {
        self.track_count
    }
}

#[derive(Debug)]
struct PreparedExistingAlbumSync {
    source_guard: ExistingSyncSourceGuard,
    data_version: i64,
    tracks: Vec<ScopedTrackUpdate>,
    current_album: ScopedAlbumState,
    desired_album: FinalAlbum,
    changed_tracks: i64,
    changed_albums: i64,
}

#[derive(Debug)]
enum ExistingSyncSourceGuard {
    Album(crate::folder_sync::ExistingAlbumScan),
    Track(crate::folder_sync::ExistingTrackScan),
}

impl ExistingSyncSourceGuard {
    fn source_size_bytes(&self) -> u64 {
        match self {
            Self::Album(scan) => scan.source_size_bytes(),
            Self::Track(scan) => scan.source_size_bytes(),
        }
    }

    fn is_unchanged(&self) -> bool {
        match self {
            Self::Album(scan) => {
                crate::folder_sync::existing_album_scan_is_unchanged(scan).unwrap_or(false)
            }
            Self::Track(scan) => {
                crate::folder_sync::existing_track_scan_is_unchanged(scan).unwrap_or(false)
            }
        }
    }
}

#[derive(Debug)]
struct ScopedTrackUpdate {
    id: i64,
    raw_id: Option<i64>,
    previous_row_hash: String,
    current: TrackRow,
    desired: TrackRow,
}

#[derive(Debug, PartialEq)]
struct ScopedAlbumState {
    import_run_id: i64,
    album_unique_id: Option<String>,
    genre_normalized: Option<String>,
    calculated_album_rating: Option<i32>,
    previous: PreviousAlbum,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ExistingAlbumFastSyncOutcome {
    Updated {
        import_run_id: i64,
        changed_tracks: i64,
        changed_albums: i64,
    },
    Unchanged,
    Fallback,
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
    let (conn, db_path) = db::open(app)?;
    if let Ok(path) = resolve_source_path(&source_path) {
        if path.is_dir() {
            let app_data_dir = db_path
                .parent()
                .ok_or_else(|| anyhow!("Music Library database has no parent directory"))?;
            let snapshot = crate::folder_sync::snapshot_path(app_data_dir, &path);
            let fingerprint = source_fingerprint(snapshot.to_string_lossy().as_ref()).ok();
            let Some(mut preview) = latest_import_preview(
                &conn,
                snapshot.to_string_lossy().as_ref(),
                fingerprint.as_ref(),
            )?
            else {
                return Ok(None);
            };
            if !crate::folder_sync::source_is_unchanged(&conn, &snapshot).unwrap_or(false) {
                preview.source_changed = true;
                preview.can_resume = false;
            }
            return Ok(Some(preview));
        }
    }
    let fingerprint = source_fingerprint(&source_path).ok();
    latest_import_preview(&conn, source_path.trim(), fingerprint.as_ref())
}

#[cfg(not(test))]
pub fn prepare_import_preview(app: AppHandle, source_path: String) -> Result<ImportPreview> {
    let _workflow_guard = ImportWorkflowGuard::acquire()?;
    IMPORT_CANCEL_REQUESTED.store(false, Ordering::SeqCst);
    let (mut conn, db_path) = db::open(&app)?;
    let _interrupt_guard = ImportInterruptGuard::register(&conn);
    let resolved_source = resolve_source_path(&source_path)?;
    let fingerprint = if resolved_source.is_dir() {
        let app_data_dir = db_path
            .parent()
            .ok_or_else(|| anyhow!("Music Library database has no parent directory"))?;
        let snapshot = crate::folder_sync::snapshot_path(app_data_dir, &resolved_source);
        let can_reuse_snapshot = snapshot.is_file()
            && crate::folder_sync::source_is_unchanged(&conn, &snapshot).unwrap_or(false);
        if !can_reuse_snapshot {
            emit_progress(
                &app,
                "scanning",
                None,
                0,
                0,
                0,
                0,
                "Reading tags from the selected album folder.",
            );
            let build_result = crate::folder_sync::build_snapshot(
                &conn,
                &resolved_source,
                &snapshot,
                &IMPORT_CANCEL_REQUESTED,
                &mut |processed_rows, _total_rows, message| {
                    emit_progress(&app, "scanning", None, processed_rows, 0, 0, 0, message);
                },
            );
            if let Err(error) = build_result {
                if IMPORT_CANCEL_REQUESTED.load(Ordering::SeqCst) {
                    bail!("Album folder snapshot preparation cancelled safely");
                }
                return Err(error);
            }
        }
        source_fingerprint(snapshot.to_string_lossy().as_ref())?
    } else {
        source_fingerprint(&source_path)?
    };
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

pub(crate) fn prepare_bridge_import_preview(
    conn: &mut Connection,
    snapshot_path: &Path,
) -> Result<ImportPreview> {
    let _workflow_guard = ImportWorkflowGuard::acquire()?;
    let cancel_requested = AtomicBool::new(false);
    let fingerprint = source_fingerprint(snapshot_path.to_string_lossy().as_ref())?;
    prepare_import_preview_for_connection_scoped(
        conn,
        &fingerprint,
        &cancel_requested,
        &|_, _, _, _, _, _| {},
        false,
    )
}

#[derive(Debug)]
pub(crate) struct BridgeImportSummary {
    pub import_run_id: i64,
    pub backup_path: Option<String>,
}

#[derive(Debug)]
pub(crate) struct BridgeSessionState {
    pub status: String,
    pub source_path: String,
    pub import_run_id: Option<i64>,
    pub backup_path: Option<String>,
    pub added_tracks: i64,
    pub changed_tracks: i64,
    pub removed_tracks: i64,
    pub added_albums: i64,
    pub changed_albums: i64,
    pub removed_albums: i64,
}

pub(crate) fn bridge_session_state(
    conn: &Connection,
    session_id: i64,
) -> Result<BridgeSessionState> {
    bridge_session_state_optional(conn, session_id)?
        .ok_or_else(|| anyhow!("Could not find Aurora import session {session_id}"))
}

pub(crate) fn bridge_session_state_optional(
    conn: &Connection,
    session_id: i64,
) -> Result<Option<BridgeSessionState>> {
    conn.query_row(
        "
        SELECT sessions.status, sessions.source_path, sessions.import_run_id, runs.backup_path,
               sessions.added_tracks, sessions.changed_tracks, sessions.removed_tracks,
               sessions.added_albums, sessions.changed_albums, sessions.removed_albums
        FROM import_sessions AS sessions
        LEFT JOIN import_runs AS runs ON runs.id = sessions.import_run_id
        WHERE sessions.id = ?1
        ",
        params![session_id],
        |row| {
            Ok(BridgeSessionState {
                status: row.get(0)?,
                source_path: row.get(1)?,
                import_run_id: row.get(2)?,
                backup_path: row.get(3)?,
                added_tracks: row.get(4)?,
                changed_tracks: row.get(5)?,
                removed_tracks: row.get(6)?,
                added_albums: row.get(7)?,
                changed_albums: row.get(8)?,
                removed_albums: row.get(9)?,
            })
        },
    )
    .optional()
    .with_context(|| format!("Could not inspect Aurora import session {session_id}"))
}

pub(crate) fn discard_bridge_import_preview(conn: &Connection, session_id: i64) -> Result<()> {
    let session = load_import_session(conn, session_id)?;
    if session.status == "completed" {
        bail!("A completed import session cannot be discarded");
    }
    conn.execute(
        "DELETE FROM import_sessions WHERE id = ?1",
        params![session_id],
    )?;
    crate::folder_sync::cleanup_generated_snapshot(&session.source_path);
    Ok(())
}

pub(crate) fn noncompleted_bridge_sessions(conn: &Connection) -> Result<Vec<(i64, String)>> {
    let mut statement = conn.prepare(
        "SELECT id, source_path FROM import_sessions WHERE status != 'completed' ORDER BY id",
    )?;
    let rows = statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not list incomplete import sessions")
}

pub(crate) fn prepare_existing_album_fast_sync(
    conn: &Connection,
    folder: &Path,
) -> Result<ExistingAlbumSyncCandidate> {
    let scan = crate::folder_sync::scan_existing_album(folder)?;
    let folder = scan.folder().to_path_buf();
    let track_count = scan.track_count();
    let data_version = scoped_sync_data_version(conn)?;
    let identities = scan.track_identities();
    let mut matched_tracks = HashMap::with_capacity(identities.len());
    let mut album_ids = HashSet::new();
    let mut lookup = conn.prepare(
        "SELECT id, album_id, album_unique_id, row_hash
         FROM tracks
         WHERE file_path = ?1 AND filename = ?2",
    )?;
    for (file_path, filename) in &identities {
        let matches = lookup
            .query_map(params![file_path, filename], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        if matches.is_empty() {
            bail!(
                "The requested folder contains an MP3 that is not represented in the active Music Library catalog: {}",
                Path::new(file_path).join(filename).display()
            );
        }
        if matches.len() != 1 {
            bail!(
                "The active Music Library catalog contains a duplicate file identity for {}",
                Path::new(file_path).join(filename).display()
            );
        }
        let matched = matches.into_iter().next().expect("one catalog track");
        album_ids.insert(matched.1.clone());
        if matched_tracks
            .insert((file_path.clone(), filename.clone()), matched)
            .is_some()
        {
            bail!("The requested folder contains a duplicate MP3 file identity");
        }
    }
    drop(lookup);

    if album_ids.len() != 1 {
        bail!(
            "The requested folder belongs to more than one catalog album and cannot be synced safely: {}",
            folder.display()
        );
    }
    let album_id = album_ids.into_iter().next().expect("one album id");
    let catalog_album_tracks = conn
        .prepare(
            "SELECT id, COALESCE(file_path, ''), COALESCE(filename, '')
             FROM tracks WHERE album_id = ?1",
        )?
        .query_map(params![&album_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let matched_ids = matched_tracks
        .values()
        .map(|matched| matched.0)
        .collect::<HashSet<_>>();
    let catalog_ids = catalog_album_tracks
        .iter()
        .map(|track| track.0)
        .collect::<HashSet<_>>();
    if catalog_album_tracks.len() != track_count
        || matched_ids.len() != track_count
        || catalog_ids != matched_ids
    {
        bail!(
            "Catalog album {album_id} does not have the exact MP3 identity set in {}. Sync its complete album folder instead",
            folder.display()
        );
    }

    let current_album = load_scoped_album(conn, &album_id)?;
    let headers = StringRecord::from(REQUIRED_COLUMNS.to_vec());
    let header_map = HeaderMap::from_headers(&headers)?;
    let mut tracks = Vec::with_capacity(track_count);
    let mut fast_supported = true;
    for values in scan.records(current_album.album_unique_id.as_deref()) {
        let scanned_record = StringRecord::from(values.into_iter().collect::<Vec<_>>());
        let scanned = TrackRow::from_record(&scanned_record, &header_map)?;
        let identity = (scanned.file_path.clone(), scanned.filename.clone());
        let Some((id, stored_album_id, stored_unique_id, _)) = matched_tracks.get(&identity) else {
            bail!(
                "The scanned folder track identities changed while its catalog scope was prepared"
            );
        };
        let (raw_id, raw_row_hash, previous_row_hash, current) =
            load_scoped_track(conn, *id, &header_map)?;
        if stored_album_id != &album_id
            || scanned.album_id != album_id
            || stored_unique_id != &current_album.album_unique_id
            || current.album_unique_id != scanned.album_unique_id
            || current.row_hash != previous_row_hash
            || !fast_sync_track_changes_are_supported(&current, &scanned)
            || raw_id.is_none()
            || raw_row_hash.as_deref() != Some(previous_row_hash.as_str())
        {
            fast_supported = false;
        }
        let desired = fast_sync_desired_track(&current, &scanned);
        tracks.push(ScopedTrackUpdate {
            id: *id,
            raw_id,
            previous_row_hash,
            current,
            desired,
        });
    }
    if tracks.len() != track_count {
        bail!("The scanned folder changed while its catalog metadata was prepared");
    }

    let mut aggregate = AlbumAggregate::new(&tracks[0].desired);
    for track in &tracks {
        if track.desired.album_id != album_id {
            fast_supported = false;
        }
        aggregate.apply(&track.desired);
    }
    let desired_album = aggregate.finalize();
    if !fast_sync_album_changes_are_supported(&current_album, &desired_album)
        || scoped_sync_data_version(conn)? != data_version
    {
        fast_supported = false;
    }
    let changed_tracks = tracks
        .iter()
        .filter(|track| track.previous_row_hash != track.desired.row_hash)
        .count() as i64;
    let changed_albums = i64::from(scoped_album_changed(&current_album, &desired_album));
    let prepared = fast_supported.then_some(PreparedExistingAlbumSync {
        source_guard: ExistingSyncSourceGuard::Album(scan),
        data_version,
        tracks,
        current_album,
        desired_album,
        changed_tracks,
        changed_albums,
    });
    Ok(ExistingAlbumSyncCandidate {
        folder,
        album_id,
        track_count,
        prepared,
    })
}

pub(crate) fn prepare_existing_file_fast_sync(
    conn: &Connection,
    folder: &Path,
    target_path: &Path,
) -> Result<Option<ExistingAlbumSyncCandidate>> {
    let folder = folder.to_path_buf();
    let Some(target_parent) = target_path.parent() else {
        return Ok(None);
    };
    let Some(target_filename) = target_path.file_name().and_then(|value| value.to_str()) else {
        return Ok(None);
    };
    let target_file_path = display_scoped_path(target_parent);
    let data_version = scoped_sync_data_version(conn)?;
    let matches = conn
        .prepare(
            "SELECT id, COALESCE(album_id, '')
             FROM tracks
             WHERE file_path = ?1 AND filename = ?2",
        )?
        .query_map(params![&target_file_path, target_filename], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if matches.len() != 1 || matches[0].1.trim().is_empty() {
        return Ok(None);
    }
    let (target_id, album_id) = (matches[0].0, matches[0].1.clone());
    let current_album = load_scoped_album(conn, &album_id)?;
    let headers = StringRecord::from(REQUIRED_COLUMNS.to_vec());
    let header_map = HeaderMap::from_headers(&headers)?;
    let catalog_tracks = load_scoped_album_tracks(conn, &album_id, &header_map)?;
    if catalog_tracks.is_empty()
        || catalog_tracks
            .iter()
            .filter(|track| track.0 == target_id)
            .count()
            != 1
        || catalog_tracks.iter().any(|track| {
            !scoped_path_is_within_folder(&track.4.file_path, &folder)
                || !Path::new(&track.4.filename)
                    .extension()
                    .and_then(|value| value.to_str())
                    .is_some_and(|value| value.eq_ignore_ascii_case("mp3"))
        })
    {
        return Ok(None);
    }
    let mut identities = HashSet::with_capacity(catalog_tracks.len());
    if catalog_tracks.iter().any(|track| {
        !identities.insert((
            track.4.file_path.replace('/', "\\").to_lowercase(),
            track.4.filename.to_lowercase(),
        ))
    }) {
        return Ok(None);
    }

    let track_count = catalog_tracks.len();
    let fallback_candidate = || ExistingAlbumSyncCandidate {
        folder: folder.clone(),
        album_id: album_id.clone(),
        track_count,
        prepared: None,
    };
    let scan = match crate::folder_sync::scan_existing_track(target_path) {
        Ok(scan) => scan,
        Err(_) => return Ok(Some(fallback_candidate())),
    };
    if scan.identity() != (target_file_path.clone(), target_filename.to_owned()) {
        return Ok(Some(fallback_candidate()));
    }

    let scanned_record = StringRecord::from(
        scan.record(current_album.album_unique_id.as_deref(), None)
            .into_iter()
            .collect::<Vec<_>>(),
    );
    let scanned = match TrackRow::from_record(&scanned_record, &header_map) {
        Ok(scanned) => scanned,
        Err(_) => return Ok(Some(fallback_candidate())),
    };

    let mut tracks = Vec::with_capacity(track_count);
    let mut target_index = None;
    let mut fast_supported = true;
    for (id, raw_id, raw_row_hash, previous_row_hash, current) in catalog_tracks {
        if current.album_id != album_id
            || current.album_unique_id != current_album.album_unique_id.clone().unwrap_or_default()
            || current.row_hash != previous_row_hash
            || raw_id.is_none()
            || raw_row_hash.as_deref() != Some(previous_row_hash.as_str())
        {
            fast_supported = false;
        }
        if id == target_id {
            if current.file_path != scanned.file_path
                || current.filename != scanned.filename
                || scanned.album_id != album_id
                || !fast_sync_track_changes_are_supported(&current, &scanned)
            {
                fast_supported = false;
            }
            target_index = Some(tracks.len());
        }
        tracks.push(ScopedTrackUpdate {
            id,
            raw_id,
            previous_row_hash,
            desired: current.clone(),
            current,
        });
    }
    let Some(target_index) = target_index else {
        return Ok(None);
    };

    let mut target_desired = fast_sync_desired_track(&tracks[target_index].current, &scanned);
    let mut rating_sum = 0_i64;
    let mut rated_tracks = 0_i64;
    for (index, track) in tracks.iter().enumerate() {
        let normalized_rating = if index == target_index {
            target_desired.normalized_rating
        } else {
            track.current.normalized_rating
        };
        if let Some(rating) = normalized_rating {
            rating_sum += i64::from(rating);
            rated_tracks += 1;
        }
    }
    let album_rating = (rated_tracks > 0).then(|| (rating_sum / rated_tracks) as i32);
    set_fast_sync_album_rating(&mut target_desired, album_rating);
    tracks[target_index].desired = target_desired;

    let aggregate_tracks = tracks
        .iter()
        .map(|track| {
            let mut desired = track.desired.clone();
            desired.album_rating = album_rating;
            desired.album_rating_raw = album_rating
                .map(|value| value.to_string())
                .unwrap_or_default();
            desired
        })
        .collect::<Vec<_>>();
    let mut aggregate = AlbumAggregate::new(&aggregate_tracks[0]);
    for track in &aggregate_tracks {
        if track.album_id != album_id {
            fast_supported = false;
        }
        aggregate.apply(track);
    }
    let desired_album = aggregate.finalize();
    if !fast_sync_album_changes_are_supported(&current_album, &desired_album)
        || scoped_sync_data_version(conn)? != data_version
        || !crate::folder_sync::existing_track_scan_is_unchanged(&scan).unwrap_or(false)
    {
        fast_supported = false;
    }
    let changed_tracks = tracks
        .iter()
        .filter(|track| track.previous_row_hash != track.desired.row_hash)
        .count() as i64;
    let changed_albums = i64::from(scoped_album_changed(&current_album, &desired_album));
    let prepared = fast_supported.then_some(PreparedExistingAlbumSync {
        source_guard: ExistingSyncSourceGuard::Track(scan),
        data_version,
        tracks,
        current_album,
        desired_album,
        changed_tracks,
        changed_albums,
    });
    Ok(Some(ExistingAlbumSyncCandidate {
        folder,
        album_id,
        track_count,
        prepared,
    }))
}

fn scoped_sync_data_version(conn: &Connection) -> Result<i64> {
    conn.query_row("PRAGMA data_version", [], |row| row.get(0))
        .context("Could not identify concurrent catalog changes")
}

fn load_scoped_track(
    conn: &Connection,
    track_id: i64,
    header_map: &HeaderMap,
) -> Result<(Option<i64>, Option<String>, String, TrackRow)> {
    let (_, raw_id, raw_row_hash, row_hash, track) = conn
        .query_row(SCOPED_TRACK_RECORD_SQL, params![track_id], |row| {
            scoped_track_record(row, header_map)
        })
        .with_context(|| format!("Could not load catalog track {track_id} for Aurora tag sync"))?;
    Ok((raw_id, raw_row_hash, row_hash, track))
}

fn load_scoped_album_tracks(
    conn: &Connection,
    album_id: &str,
    header_map: &HeaderMap,
) -> Result<Vec<(i64, Option<i64>, Option<String>, String, TrackRow)>> {
    let mut statement = conn
        .prepare(SCOPED_ALBUM_TRACK_RECORD_SQL)
        .with_context(|| {
            format!("Could not prepare catalog album {album_id} for Aurora tag sync")
        })?;
    let rows = statement
        .query_map(params![album_id], |row| {
            scoped_track_record(row, header_map)
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .with_context(|| {
            format!("Could not load catalog album {album_id} tracks for Aurora tag sync")
        })?;
    Ok(rows)
}

fn scoped_track_record(
    row: &Row<'_>,
    header_map: &HeaderMap,
) -> rusqlite::Result<(i64, Option<i64>, Option<String>, String, TrackRow)> {
    let text = |index| {
        row.get::<_, Option<String>>(index)
            .map(|value| value.unwrap_or_default())
    };
    let raw_time = text(20)?;
    let time = if raw_time.contains(':') {
        raw_time
    } else {
        raw_time
            .parse::<f64>()
            .ok()
            .map(format_snapshot_duration)
            .unwrap_or_default()
    };
    let record = StringRecord::from(vec![
        text(4)?,
        text(5)?,
        text(6)?,
        text(7)?,
        text(8)?,
        text(9)?,
        text(10)?,
        text(11)?,
        text(12)?,
        text(13)?,
        text(14)?,
        text(15)?,
        text(16)?,
        text(17)?,
        text(18)?,
        text(19)?,
        time,
    ]);
    let track = TrackRow::from_record(&record, header_map).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(4, rusqlite::types::Type::Text, error.into())
    })?;
    Ok((
        row.get::<_, i64>(0)?,
        row.get::<_, Option<i64>>(1)?,
        row.get::<_, Option<String>>(21)?,
        row.get::<_, String>(3)?,
        track,
    ))
}

fn load_scoped_album(conn: &Connection, album_id: &str) -> Result<ScopedAlbumState> {
    conn.query_row(
        "SELECT import_run_id, album_unique_id, genre_normalized,
                calculated_album_rating, album, album_artist_display,
                canonical_genre, publisher, year, release_year, total_tracks,
                rated_tracks, rating_completeness, total_seconds, loved_tracks,
                tmoe_seconds, ae_ratio, album_rating, effective_album_rating,
                album_score
         FROM albums WHERE id = ?1",
        params![album_id],
        |row| {
            Ok(ScopedAlbumState {
                import_run_id: row.get(0)?,
                album_unique_id: row.get(1)?,
                genre_normalized: row.get(2)?,
                calculated_album_rating: row.get(3)?,
                previous: PreviousAlbum {
                    album_id: album_id.to_owned(),
                    album: row.get(4)?,
                    album_artist_display: row.get(5)?,
                    canonical_genre: row.get(6)?,
                    publisher: row.get(7)?,
                    year: row.get(8)?,
                    release_year: row.get(9)?,
                    total_tracks: row.get::<_, i64>(10)? as u32,
                    rated_tracks: row.get::<_, i64>(11)? as u32,
                    rating_completeness: row.get(12)?,
                    total_seconds: row.get(13)?,
                    loved_tracks: row.get::<_, i64>(14)? as u32,
                    tmoe_seconds: row.get(15)?,
                    ae_ratio: row.get(16)?,
                    album_rating: row.get(17)?,
                    effective_album_rating: row.get(18)?,
                    album_score: row.get(19)?,
                },
            })
        },
    )
    .with_context(|| format!("Could not load catalog album {album_id} for Aurora tag sync"))
}

fn fast_sync_track_changes_are_supported(current: &TrackRow, desired: &TrackRow) -> bool {
    current.display_artist == desired.display_artist
        && fast_sync_disc_numbers_are_equivalent(current.disc_number, desired.disc_number)
        && current.album == desired.album
        && current.genre == desired.genre
        && current.canonical_genre == desired.canonical_genre
        && current.genre_normalized == desired.genre_normalized
        && current.publisher == desired.publisher
        && current.title == desired.title
        && current.track_number_raw == desired.track_number_raw
        && current.year_raw == desired.year_raw
        && current.album_unique_id == desired.album_unique_id
        && current.file_path == desired.file_path
        && current.filename == desired.filename
        && current.album_artist_display == desired.album_artist_display
        && current.track_number == desired.track_number
        && current.year == desired.year
        && fast_sync_durations_are_equivalent(current.time_seconds, desired.time_seconds)
        && current.album_id == desired.album_id
}

fn fast_sync_disc_numbers_are_equivalent(current: Option<i32>, scanned: Option<i32>) -> bool {
    current == scanned || matches!((current, scanned), (None, Some(0)) | (Some(0), None))
}

fn fast_sync_durations_are_equivalent(current: Option<i64>, scanned: Option<i64>) -> bool {
    match (current, scanned) {
        (Some(current), Some(scanned)) => current.abs_diff(scanned) <= 1,
        (None, None) => true,
        _ => false,
    }
}

fn fast_sync_desired_track(current: &TrackRow, scanned: &TrackRow) -> TrackRow {
    let mut desired = current.clone();
    desired.album_rating_raw = scanned.album_rating_raw.clone();
    desired.album_rating = scanned.album_rating;
    desired.love = scanned.love.clone();
    desired.rating_raw = scanned.rating_raw.clone();
    desired.normalized_rating = scanned.normalized_rating;
    desired.track_rating_value = scanned.track_rating_value;
    desired.release_year_raw = scanned.release_year_raw.clone();
    desired.release_year = scanned.release_year;
    refresh_fast_sync_row_hash(&mut desired);
    desired
}

fn set_fast_sync_album_rating(track: &mut TrackRow, album_rating: Option<i32>) {
    track.album_rating = album_rating;
    track.album_rating_raw = album_rating
        .map(|value| value.to_string())
        .unwrap_or_default();
    refresh_fast_sync_row_hash(track);
}

fn refresh_fast_sync_row_hash(desired: &mut TrackRow) {
    desired.row_hash = row_hash(&[
        &desired.display_artist,
        &desired.album_rating_raw,
        &desired.disc_number_raw,
        &desired.album,
        &desired.genre,
        &desired.love,
        &desired.publisher,
        &desired.rating_raw,
        &desired.title,
        &desired.track_number_raw,
        &desired.year_raw,
        &desired.release_year_raw,
        &desired.album_unique_id,
        &desired.file_path,
        &desired.filename,
        &desired.album_artist_display,
        &desired.time_raw,
    ]);
}

fn fast_sync_album_changes_are_supported(current: &ScopedAlbumState, desired: &FinalAlbum) -> bool {
    current.album_unique_id == desired.album_unique_id
        && current.previous.album == desired.album
        && current.previous.album_artist_display == desired.album_artist_display
        && current.previous.canonical_genre == desired.canonical_genre
        && current.genre_normalized == desired.genre_normalized
        && current.previous.publisher == desired.publisher
        && current.previous.year == desired.year
        && current.previous.total_tracks == desired.total_tracks
        && current.previous.total_seconds == desired.total_seconds
}

fn scoped_album_changed(current: &ScopedAlbumState, desired: &FinalAlbum) -> bool {
    album_changed(&current.previous, desired)
        || current.album_unique_id != desired.album_unique_id
        || current.genre_normalized != desired.genre_normalized
        || current.calculated_album_rating != desired.calculated_album_rating
}

fn format_snapshot_duration(value: f64) -> String {
    let seconds = value.round().max(0.0) as u64;
    if seconds >= 3_600 {
        format!(
            "{}:{:02}:{:02}",
            seconds / 3_600,
            (seconds / 60) % 60,
            seconds % 60
        )
    } else {
        format!("{}:{:02}", seconds / 60, seconds % 60)
    }
}

pub(crate) fn apply_existing_album_fast_sync(
    conn: &mut Connection,
    candidate: &ExistingAlbumSyncCandidate,
) -> Result<ExistingAlbumFastSyncOutcome> {
    let Some(prepared) = candidate.prepared.as_ref() else {
        return Ok(ExistingAlbumFastSyncOutcome::Fallback);
    };
    let _workflow_guard = ImportWorkflowGuard::acquire()?;
    if scoped_sync_data_version(conn)? != prepared.data_version
        || !prepared.source_guard.is_unchanged()
    {
        return Ok(ExistingAlbumFastSyncOutcome::Fallback);
    }
    if prepared.changed_tracks == 0 && prepared.changed_albums == 0 {
        return Ok(ExistingAlbumFastSyncOutcome::Unchanged);
    }

    let started = Instant::now();
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .context("Could not start atomic Aurora album metadata sync")?;
    if scoped_sync_data_version(&tx)? != prepared.data_version
        || !prepared.source_guard.is_unchanged()
        || !scoped_album_catalog_is_unchanged(&tx, candidate, prepared)?
    {
        drop(tx);
        return Ok(ExistingAlbumFastSyncOutcome::Fallback);
    }

    let started_at = Utc::now().to_rfc3339();
    let source_path = display_scoped_path(candidate.folder());
    let source_size_bytes =
        i64::try_from(prepared.source_guard.source_size_bytes()).unwrap_or(i64::MAX);
    tx.execute(
        "INSERT INTO import_runs (
             source_path, source_size_bytes, started_at, status, backup_path,
             added_tracks, changed_tracks, removed_tracks,
             added_albums, changed_albums, removed_albums
         ) VALUES (?1, ?2, ?3, 'running', NULL, 0, ?4, 0, 0, ?5, 0)",
        params![
            &source_path,
            source_size_bytes,
            &started_at,
            prepared.changed_tracks,
            prepared.changed_albums,
        ],
    )
    .context("Could not create the targeted Aurora tag-sync import run")?;
    let import_run_id = tx.last_insert_rowid();

    for track in &prepared.tracks {
        update_scoped_raw_track(&tx, import_run_id, track)?;
        update_scoped_track(&tx, import_run_id, candidate.album_id(), track)?;
    }
    update_scoped_album(
        &tx,
        import_run_id,
        &prepared.current_album,
        &prepared.desired_album,
    )?;

    let mut library_updates = library_updates_for_changed_album(
        &prepared.current_album.previous,
        &prepared.desired_album,
    );
    if library_updates.is_empty() && prepared.changed_tracks > 0 {
        library_updates.push(scoped_track_history_update(
            &prepared.tracks,
            &prepared.desired_album,
        ));
    }
    let rating_events =
        rating_event_for_changed_album(&prepared.current_album.previous, &prepared.desired_album)
            .into_iter()
            .collect::<Vec<_>>();
    insert_rating_events(&tx, import_run_id, &rating_events)?;
    insert_library_updates(&tx, import_run_id, &source_path, &library_updates)?;
    let (track_rows, album_count) = insert_rating_snapshot_from_catalog(&tx, import_run_id)?;

    let completed_at = Utc::now().to_rfc3339();
    tx.execute(
        "UPDATE import_runs
         SET completed_at = ?1, status = 'completed', track_rows = ?2,
             album_count = ?3, duration_ms = ?4, rating_events_count = ?5
         WHERE id = ?6",
        params![
            &completed_at,
            track_rows,
            album_count,
            started.elapsed().as_millis() as i64,
            rating_events.len() as i64,
            import_run_id,
        ],
    )?;
    if scoped_sync_data_version(&tx)? != prepared.data_version
        || !prepared.source_guard.is_unchanged()
    {
        drop(tx);
        return Ok(ExistingAlbumFastSyncOutcome::Fallback);
    }
    tx.commit()
        .context("Could not commit the atomic Aurora album metadata sync")?;
    Ok(ExistingAlbumFastSyncOutcome::Updated {
        import_run_id,
        changed_tracks: prepared.changed_tracks,
        changed_albums: prepared.changed_albums,
    })
}

fn scoped_album_catalog_is_unchanged(
    conn: &Connection,
    candidate: &ExistingAlbumSyncCandidate,
    prepared: &PreparedExistingAlbumSync,
) -> Result<bool> {
    let album_track_count = conn.query_row(
        "SELECT COUNT(*) FROM tracks WHERE album_id = ?1",
        params![candidate.album_id()],
        |row| row.get::<_, i64>(0),
    )?;
    if album_track_count != prepared.tracks.len() as i64
        || load_scoped_album(conn, candidate.album_id())? != prepared.current_album
    {
        return Ok(false);
    }

    let headers = StringRecord::from(REQUIRED_COLUMNS.to_vec());
    let header_map = HeaderMap::from_headers(&headers)?;
    for expected in &prepared.tracks {
        let (raw_id, raw_row_hash, row_hash, current) =
            load_scoped_track(conn, expected.id, &header_map)?;
        if raw_id != expected.raw_id
            || raw_row_hash.as_deref() != Some(expected.previous_row_hash.as_str())
            || row_hash != expected.previous_row_hash
            || current != expected.current
        {
            return Ok(false);
        }
    }
    Ok(true)
}

fn update_scoped_raw_track(
    tx: &Transaction<'_>,
    import_run_id: i64,
    track: &ScopedTrackUpdate,
) -> Result<()> {
    let raw_id = track
        .raw_id
        .ok_or_else(|| anyhow!("The targeted Aurora track has no matching raw catalog row"))?;
    let desired = &track.desired;
    let updated = tx.execute(
        "UPDATE raw_tracks
         SET import_run_id = ?1,
             display_artist = NULLIF(?2, ''),
             album_rating = NULLIF(?3, ''),
             disc_number = NULLIF(?4, ''),
             album = NULLIF(?5, ''),
             genre = NULLIF(?6, ''),
             love = NULLIF(?7, ''),
             publisher = NULLIF(?8, ''),
             rating = NULLIF(?9, ''),
             title = NULLIF(?10, ''),
             track_number = NULLIF(?11, ''),
             year_value = NULLIF(?12, ''),
             release_year = NULLIF(?13, ''),
             album_unique_id = NULLIF(?14, ''),
             file_path = NULLIF(?15, ''),
             filename = NULLIF(?16, ''),
             album_artist_display = NULLIF(?17, ''),
             time_value = NULLIF(?18, ''),
             row_hash = ?19
         WHERE id = ?20
           AND row_hash = ?21
           AND COALESCE(file_path, '') = ?22
           AND COALESCE(filename, '') = ?23",
        params![
            import_run_id,
            &desired.display_artist,
            &desired.album_rating_raw,
            &desired.disc_number_raw,
            &desired.album,
            &desired.genre,
            &desired.love,
            &desired.publisher,
            &desired.rating_raw,
            &desired.title,
            &desired.track_number_raw,
            &desired.year_raw,
            &desired.release_year_raw,
            &desired.album_unique_id,
            &desired.file_path,
            &desired.filename,
            &desired.album_artist_display,
            &desired.time_raw,
            &desired.row_hash,
            raw_id,
            &track.previous_row_hash,
            &track.current.file_path,
            &track.current.filename,
        ],
    )?;
    if updated != 1 {
        bail!(
            "The raw catalog row for {} changed while Aurora tag sync was applying",
            Path::new(&track.current.file_path)
                .join(&track.current.filename)
                .display()
        );
    }
    Ok(())
}

fn update_scoped_track(
    tx: &Transaction<'_>,
    import_run_id: i64,
    album_id: &str,
    track: &ScopedTrackUpdate,
) -> Result<()> {
    let desired = &track.desired;
    let updated = tx.execute(
        "UPDATE tracks
         SET import_run_id = ?1,
             album_id = ?2,
             album_unique_id = NULLIF(?3, ''),
             display_artist = NULLIF(?4, ''),
             album_artist_display = NULLIF(?5, ''),
             album = NULLIF(?6, ''),
             title = NULLIF(?7, ''),
             genre = NULLIF(?8, ''),
             canonical_genre = NULLIF(?9, ''),
             genre_normalized = NULLIF(?10, ''),
             publisher = NULLIF(?11, ''),
             love = NULLIF(?12, ''),
             rating_raw = NULLIF(?13, ''),
             normalized_rating = ?14,
             album_rating_raw = NULLIF(?15, ''),
             album_rating = ?16,
             disc_number = ?17,
             track_number = ?18,
             year = ?19,
             release_year = ?20,
             time_seconds = ?21,
             file_path = NULLIF(?22, ''),
             filename = NULLIF(?23, ''),
             row_hash = ?24
         WHERE id = ?25
           AND album_id = ?26
           AND row_hash = ?27
           AND COALESCE(file_path, '') = ?28
           AND COALESCE(filename, '') = ?29",
        params![
            import_run_id,
            &desired.album_id,
            &desired.album_unique_id,
            &desired.display_artist,
            &desired.album_artist_display,
            &desired.album,
            &desired.title,
            &desired.genre,
            &desired.canonical_genre,
            &desired.genre_normalized,
            &desired.publisher,
            &desired.love,
            &desired.rating_raw,
            desired.normalized_rating,
            &desired.album_rating_raw,
            desired.album_rating,
            desired.disc_number,
            desired.track_number,
            desired.year,
            desired.release_year,
            desired.time_seconds,
            &desired.file_path,
            &desired.filename,
            &desired.row_hash,
            track.id,
            album_id,
            &track.previous_row_hash,
            &track.current.file_path,
            &track.current.filename,
        ],
    )?;
    if updated != 1 {
        bail!(
            "The catalog row for {} changed while Aurora tag sync was applying",
            Path::new(&track.current.file_path)
                .join(&track.current.filename)
                .display()
        );
    }
    Ok(())
}

fn update_scoped_album(
    tx: &Transaction<'_>,
    import_run_id: i64,
    current: &ScopedAlbumState,
    desired: &FinalAlbum,
) -> Result<()> {
    let updated = tx.execute(
        "UPDATE albums
         SET import_run_id = ?1,
             album_unique_id = ?2,
             album = ?3,
             album_artist_display = ?4,
             canonical_genre = ?5,
             genre_normalized = ?6,
             publisher = ?7,
             year = ?8,
             release_year = ?9,
             total_tracks = ?10,
             rated_tracks = ?11,
             rating_completeness = ?12,
             total_seconds = ?13,
             loved_tracks = ?14,
             tmoe_seconds = ?15,
             ae_ratio = ?16,
             album_rating = ?17,
             calculated_album_rating = ?18,
             effective_album_rating = ?19,
             album_score = ?20
         WHERE id = ?21 AND import_run_id = ?22",
        params![
            import_run_id,
            &desired.album_unique_id,
            &desired.album,
            &desired.album_artist_display,
            &desired.canonical_genre,
            &desired.genre_normalized,
            &desired.publisher,
            desired.year,
            desired.release_year,
            desired.total_tracks,
            desired.rated_tracks,
            desired.rating_completeness,
            desired.total_seconds,
            desired.loved_tracks,
            desired.tmoe_seconds,
            desired.ae_ratio,
            desired.album_rating,
            desired.calculated_album_rating,
            desired.effective_album_rating,
            desired.album_score,
            &desired.album_id,
            current.import_run_id,
        ],
    )?;
    if updated != 1 {
        bail!(
            "Catalog album {} changed while Aurora tag sync was applying",
            desired.album_id
        );
    }
    Ok(())
}

fn scoped_track_history_update(
    tracks: &[ScopedTrackUpdate],
    album: &FinalAlbum,
) -> LibraryUpdateRecord {
    let mut field_changes = Vec::new();
    let mut changed_track_ids = HashSet::new();
    for track in tracks {
        if track.previous_row_hash == track.desired.row_hash {
            continue;
        }
        changed_track_ids.insert(track.id);
        for (field, label, category, previous, current) in [
            (
                "track_rating",
                "Track rating",
                "ratings",
                update_value(empty_to_none(&track.current.rating_raw)),
                update_value(empty_to_none(&track.desired.rating_raw)),
            ),
            (
                "track_love",
                "Love",
                "ratings",
                love_update_value(&track.current.love),
                love_update_value(&track.desired.love),
            ),
            (
                "track_release_year",
                "Track release year",
                "metadata",
                update_value(empty_to_none(&track.current.release_year_raw)),
                update_value(empty_to_none(&track.desired.release_year_raw)),
            ),
        ] {
            if previous != current {
                field_changes.push((
                    field,
                    label,
                    category,
                    previous,
                    current,
                    track.desired.title.clone(),
                ));
            }
        }
    }
    if field_changes.len() == 1 {
        let (field, label, category, previous, current, title) =
            field_changes.into_iter().next().expect("one field change");
        return LibraryUpdateRecord {
            change_kind: "changed",
            category,
            album_id: album.album_id.clone(),
            album_artist_display: album.album_artist_display.clone(),
            album: album.album.clone(),
            year: album.year,
            field: Some(field),
            field_label: Some(label),
            previous_value: Some(previous.clone()),
            current_value: Some(current.clone()),
            change_count: Some(1),
            description: format!("{label} changed for {title} from {previous} to {current}"),
        };
    }

    let changed_tracks = changed_track_ids.len().max(1) as i64;
    let only_ratings =
        !field_changes.is_empty() && field_changes.iter().all(|change| change.2 == "ratings");
    LibraryUpdateRecord {
        change_kind: "changed",
        category: if only_ratings { "ratings" } else { "metadata" },
        album_id: album.album_id.clone(),
        album_artist_display: album.album_artist_display.clone(),
        album: album.album.clone(),
        year: album.year,
        field: Some("track_metadata"),
        field_label: Some("Track metadata"),
        previous_value: None,
        current_value: None,
        change_count: Some(changed_tracks),
        description: format!(
            "{} scoped track {} synchronized from Aurora",
            changed_tracks,
            if changed_tracks == 1 {
                "change"
            } else {
                "changes"
            }
        ),
    }
}

fn love_update_value(value: &str) -> String {
    match value {
        "L" => "loved".to_string(),
        "B" => "banned".to_string(),
        _ => "neutral".to_string(),
    }
}

fn insert_rating_snapshot_from_catalog(
    tx: &Transaction<'_>,
    import_run_id: i64,
) -> Result<(i64, i64)> {
    let (
        track_count,
        album_count,
        rated_tracks,
        fully_rated_albums,
        partially_rated_albums,
        unrated_albums,
        albums_with_effective_rating,
        average_album_rating,
        average_album_score,
    ): (i64, i64, i64, i64, i64, i64, i64, Option<f64>, Option<f64>) = tx.query_row(
        "SELECT
             (SELECT COUNT(*) FROM tracks),
             COUNT(*),
             COALESCE(SUM(rated_tracks), 0),
             COALESCE(SUM(CASE WHEN rating_completeness >= 1.0 THEN 1 ELSE 0 END), 0),
             COALESCE(SUM(CASE WHEN rating_completeness > 0.0 AND rating_completeness < 1.0 THEN 1 ELSE 0 END), 0),
             COALESCE(SUM(CASE WHEN rating_completeness = 0.0 THEN 1 ELSE 0 END), 0),
             COALESCE(SUM(CASE WHEN effective_album_rating IS NOT NULL THEN 1 ELSE 0 END), 0),
             AVG(effective_album_rating),
             AVG(album_score)
         FROM albums",
        [],
        |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
                row.get(8)?,
            ))
        },
    )?;
    tx.execute(
        "INSERT INTO rating_snapshots (
             import_run_id, created_at, track_count, album_count, rated_tracks,
             unrated_tracks, fully_rated_albums, partially_rated_albums,
             unrated_albums, albums_with_effective_rating, average_album_rating,
             average_album_score
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            import_run_id,
            Utc::now().to_rfc3339(),
            track_count,
            album_count,
            rated_tracks,
            track_count - rated_tracks,
            fully_rated_albums,
            partially_rated_albums,
            unrated_albums,
            albums_with_effective_rating,
            average_album_rating,
            average_album_score,
        ],
    )
    .context("Could not record the targeted Aurora rating snapshot")?;
    Ok((track_count, album_count))
}

fn display_scoped_path(path: &Path) -> String {
    let value = path.display().to_string();
    if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else {
        value.strip_prefix(r"\\?\").unwrap_or(&value).to_owned()
    }
}

fn scoped_path_is_within_folder(path: &str, folder: &Path) -> bool {
    let normalized = |value: &Path| {
        display_scoped_path(value)
            .replace('/', "\\")
            .trim_end_matches('\\')
            .to_lowercase()
    };
    let path = normalized(Path::new(path));
    let folder = normalized(folder);
    path == folder || path.starts_with(&(folder + "\\"))
}

pub(crate) fn apply_bridge_import_preview(
    conn: &mut Connection,
    db_path: &Path,
    session_id: i64,
) -> Result<BridgeImportSummary> {
    let _workflow_guard = ImportWorkflowGuard::acquire()?;
    let started = Instant::now();
    let session = load_import_session(conn, session_id)?;
    if session.status != "ready" {
        bail!("Prepare the import delta before applying this import");
    }
    let source_apply_guard =
        crate::folder_sync::prepare_source_apply_guard(conn, &session.source_path)?;
    let fingerprint = source_fingerprint(&session.source_path)?;
    ensure_session_source_matches(&session, &fingerprint)?;
    let reported_source_path = crate::folder_sync::original_folder_path(&session.source_path)
        .unwrap_or_else(|| session.source_path.clone());
    let settings = db::settings_for_connection(conn)?;
    let backup_path = create_backup(
        conn,
        db_path,
        Path::new(&reported_source_path),
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
            &reported_source_path,
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
    .context("Could not create import run for the prepared Aurora batch")?;
    let import_run_id = conn.last_insert_rowid();

    let result = apply_staged_import(
        conn,
        &session,
        import_run_id,
        started,
        &reported_source_path,
        source_apply_guard.as_ref(),
    );
    match result {
        Ok((_track_rows, _album_count, rating_events_count)) => {
            if let Err(error) = wishlist::reconcile_for_connection(conn) {
                eprintln!(
                    "Could not reconcile the wish list after committed Aurora import: {error:#}"
                );
            }
            if let Err(error) = db::refresh_all_smart_playlists_for_connection(conn) {
                eprintln!("Could not refresh smart playlists after import: {error:#}");
            }
            if let Err(error) = cleanup_completed_stage(conn, session_id) {
                eprintln!("Could not clean committed Aurora import staging rows: {error:#}");
            }
            if completed_stage_storage_should_be_reclaimed(conn).unwrap_or(false) {
                if let Err(error) = reclaim_completed_stage_storage(conn) {
                    eprintln!("Could not reclaim completed import staging space: {error:#}");
                }
            }
            debug_assert!(rating_events_count >= 0);
            crate::folder_sync::cleanup_generated_snapshot_file(&session.source_path);
            Ok(BridgeImportSummary {
                import_run_id,
                backup_path: backup_path_text,
            })
        }
        Err(error) => {
            match bridge_session_state(conn, session_id) {
                Ok(state)
                    if state.status == "completed"
                        && state.import_run_id == Some(import_run_id) =>
                {
                    eprintln!(
                        "Aurora import commit returned an ambiguous error, but the committed session was verified: {error:#}"
                    );
                    let _ = cleanup_completed_stage(conn, session_id);
                    crate::folder_sync::cleanup_generated_snapshot_file(&session.source_path);
                    return Ok(BridgeImportSummary {
                        import_run_id,
                        backup_path: backup_path_text,
                    });
                }
                Ok(_) => {}
                Err(verification_error) => {
                    return Err(error.context(format!(
                        "Could not prove whether the atomic catalog commit completed; published destinations and sources must be retained for retry: {verification_error:#}"
                    )));
                }
            }
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
            Err(error)
        }
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
    let source_apply_guard =
        crate::folder_sync::prepare_source_apply_guard(&conn, &session.source_path)?;
    let fingerprint = source_fingerprint(&session.source_path)?;
    ensure_session_source_matches(&session, &fingerprint)?;
    let reported_source_path = crate::folder_sync::original_folder_path(&session.source_path)
        .unwrap_or_else(|| session.source_path.clone());
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
        Path::new(&reported_source_path),
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
            &reported_source_path,
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

    let result = apply_staged_import(
        &mut conn,
        &session,
        import_run_id,
        started,
        &reported_source_path,
        source_apply_guard.as_ref(),
    );
    match result {
        Ok((track_rows, album_count, rating_events_count)) => {
            let duration_ms = started.elapsed().as_millis();
            wishlist::reconcile_for_connection(&conn)
                .context("Could not reconcile the wish list after import")?;
            if let Err(error) = db::refresh_all_smart_playlists_for_connection(&conn) {
                eprintln!("Could not refresh smart playlists after import: {error:#}");
            }
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
            crate::folder_sync::cleanup_generated_snapshot(&session.source_path);
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
    prepare_import_preview_for_connection_scoped(
        conn,
        fingerprint,
        cancel_requested,
        progress,
        true,
    )
}

fn prepare_import_preview_for_connection_scoped(
    conn: &mut Connection,
    fingerprint: &SourceFingerprint,
    cancel_requested: &AtomicBool,
    progress: &ImportProgressCallback<'_>,
    cleanup_other_sessions: bool,
) -> Result<ImportPreview> {
    match prepare_import_preview_inner(
        conn,
        fingerprint,
        cancel_requested,
        progress,
        cleanup_other_sessions,
    ) {
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
    cleanup_other_sessions: bool,
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
        if cleanup_other_sessions {
            cleanup.execute(
                "DELETE FROM import_sessions WHERE status != 'completed'",
                [],
            )?;
        }
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
    let previous_album_match_index = build_previous_album_match_index(&previous_albums);
    let mut changes = ImportChanges {
        added_tracks,
        changed_tracks,
        removed_tracks,
        ..ImportChanges::default()
    };
    for album in final_albums {
        ensure_preparation_not_cancelled(cancel_requested)?;
        match take_matching_previous_album(&mut previous_albums, &previous_album_match_index, album)
        {
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
    let previous_album_match_index = build_previous_album_match_index(&previous_albums);
    let mut suspicious = Vec::new();

    for album in final_albums {
        ensure_preparation_not_cancelled(cancel_requested)?;
        if let Some(previous) =
            take_matching_previous_album(&mut previous_albums, &previous_album_match_index, album)
        {
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
    reported_source_path: &str,
    source_apply_guard: Option<&crate::folder_sync::SourceApplyGuard>,
) -> Result<(u64, u64, i64)> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .context("Could not start atomic staged import")?;
    crate::folder_sync::ensure_source_apply_guard(&tx, source_apply_guard)?;
    let final_albums = load_stage_final_albums(&tx, session.id)?;
    let mut previous_albums = load_previous_albums(&tx)?;
    let previous_album_match_index = build_previous_album_match_index(&previous_albums);
    let mut rating_events = Vec::new();
    let mut library_updates = Vec::new();
    for album in &final_albums {
        match take_matching_previous_album(&mut previous_albums, &previous_album_match_index, album)
        {
            Some(previous) => {
                library_updates.extend(library_updates_for_changed_album(&previous, album));
                if let Some(event) = rating_event_for_changed_album(&previous, album) {
                    rating_events.push(event);
                }
            }
            None => {
                library_updates.push(library_update_for_added_album(album));
                if let Some(event) = rating_event_for_added_album(album) {
                    rating_events.push(event);
                }
            }
        }
    }
    for previous in previous_albums.values() {
        library_updates.push(library_update_for_removed_album(previous));
        if let Some(event) = rating_event_for_removed_album(previous) {
            rating_events.push(event);
        }
    }

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
    insert_library_updates(&tx, import_run_id, reported_source_path, &library_updates)?;
    insert_rating_snapshot(&tx, import_run_id, &final_albums)?;
    db::rebuild_search_indexes(&tx)?;
    db::reconcile_album_chart_matches(&tx)
        .context("Could not relink imported album charts after applying the library snapshot")?;
    db::reconcile_track_chart_matches(&tx)
        .context("Could not relink imported singles charts after applying the library snapshot")?;
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

fn completed_stage_storage_should_be_reclaimed(conn: &Connection) -> Result<bool> {
    let page_size = conn.query_row("PRAGMA page_size", [], |row| row.get::<_, i64>(0))?;
    let free_pages = conn.query_row("PRAGMA freelist_count", [], |row| row.get::<_, i64>(0))?;
    Ok(page_size.saturating_mul(free_pages) >= IMPORT_STAGE_VACUUM_THRESHOLD_BYTES)
}

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
    let previous_album_match_index = build_previous_album_match_index(&previous_albums);
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
    let mut library_updates = Vec::new();

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
            match take_matching_previous_album(
                &mut previous_albums,
                &previous_album_match_index,
                final_album,
            ) {
                Some(previous_album) => {
                    if album_changed(&previous_album, final_album) {
                        changes.changed_albums += 1;
                    }
                    library_updates.extend(library_updates_for_changed_album(
                        &previous_album,
                        final_album,
                    ));
                    if let Some(event) =
                        rating_event_for_changed_album(&previous_album, final_album)
                    {
                        rating_events.push(event);
                    }
                }
                None => {
                    changes.added_albums += 1;
                    library_updates.push(library_update_for_added_album(final_album));
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
        library_updates.push(library_update_for_removed_album(previous_album));
        if let Some(event) = rating_event_for_removed_album(previous_album) {
            rating_events.push(event);
        }
    }
    changes.removed_albums = previous_albums.len() as i64;
    changes.rating_events_count = rating_events.len() as i64;
    insert_rating_events(&tx, import_run_id, &rating_events)?;
    insert_library_updates(
        &tx,
        import_run_id,
        &source_path.display().to_string(),
        &library_updates,
    )?;
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
            canonical_genre,
            publisher,
            year,
            release_year,
            total_tracks,
            rated_tracks,
            rating_completeness,
            total_seconds,
            loved_tracks,
            tmoe_seconds,
            ae_ratio,
            album_rating,
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
                    canonical_genre: row.get(3)?,
                    publisher: row.get(4)?,
                    year: row.get(5)?,
                    release_year: row.get(6)?,
                    total_tracks: row.get::<_, i64>(7)? as u32,
                    rated_tracks: row.get::<_, i64>(8)? as u32,
                    rating_completeness: row.get(9)?,
                    total_seconds: row.get(10)?,
                    loved_tracks: row.get::<_, i64>(11)? as u32,
                    tmoe_seconds: row.get(12)?,
                    ae_ratio: row.get(13)?,
                    album_rating: row.get(14)?,
                    effective_album_rating: row.get(15)?,
                    album_score: row.get(16)?,
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

fn album_history_match_key(
    album_artist_display: &Option<String>,
    album: &Option<String>,
    year: Option<i32>,
) -> Option<String> {
    let artist = normalize_artist_text(album_artist_display.as_deref().unwrap_or_default());
    let title = normalize_text(album.as_deref().unwrap_or_default());
    if artist.is_empty() || title.is_empty() {
        return None;
    }
    Some(format!(
        "{artist}\u{1f}{title}\u{1f}{}",
        year.map(|value| value.to_string()).unwrap_or_default()
    ))
}

fn build_previous_album_match_index(
    previous_albums: &HashMap<String, PreviousAlbum>,
) -> HashMap<String, Option<String>> {
    let mut index = HashMap::new();
    for previous in previous_albums.values() {
        let Some(key) = album_history_match_key(
            &previous.album_artist_display,
            &previous.album,
            previous.year,
        ) else {
            continue;
        };
        index
            .entry(key)
            .and_modify(|album_id| *album_id = None)
            .or_insert_with(|| Some(previous.album_id.clone()));
    }
    index
}

fn take_matching_previous_album(
    previous_albums: &mut HashMap<String, PreviousAlbum>,
    match_index: &HashMap<String, Option<String>>,
    current: &FinalAlbum,
) -> Option<PreviousAlbum> {
    if let Some(previous) = previous_albums.remove(&current.album_id) {
        return Some(previous);
    }
    let key = album_history_match_key(&current.album_artist_display, &current.album, current.year)?;
    let previous_album_id = match_index.get(&key)?.as_ref()?.clone();
    previous_albums.remove(&previous_album_id)
}

fn album_changed(previous: &PreviousAlbum, current: &FinalAlbum) -> bool {
    previous.album != current.album
        || previous.album_artist_display != current.album_artist_display
        || previous.canonical_genre != current.canonical_genre
        || previous.publisher != current.publisher
        || previous.year != current.year
        || previous.release_year != current.release_year
        || previous.total_tracks != current.total_tracks
        || previous.rated_tracks != current.rated_tracks
        || float_changed(previous.rating_completeness, current.rating_completeness)
        || previous.total_seconds != current.total_seconds
        || previous.loved_tracks != current.loved_tracks
        || previous.tmoe_seconds != current.tmoe_seconds
        || float_changed(previous.ae_ratio, current.ae_ratio)
        || previous.album_rating != current.album_rating
        || previous.effective_album_rating != current.effective_album_rating
        || optional_float_changed(previous.album_score, current.album_score)
}

fn update_value(value: Option<&str>) -> String {
    value
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("blank")
        .to_string()
}

fn metadata_update(
    previous: &PreviousAlbum,
    current: &FinalAlbum,
    field: &'static str,
    field_label: &'static str,
    previous_value: Option<String>,
    current_value: Option<String>,
) -> Option<LibraryUpdateRecord> {
    if previous_value == current_value {
        return None;
    }
    let description = format!(
        "{field_label} changed from {} to {}",
        update_value(previous_value.as_deref()),
        update_value(current_value.as_deref())
    );
    Some(LibraryUpdateRecord {
        change_kind: "changed",
        category: "metadata",
        album_id: current.album_id.clone(),
        album_artist_display: current.album_artist_display.clone(),
        album: current.album.clone(),
        year: current.year.or(previous.year),
        field: Some(field),
        field_label: Some(field_label),
        previous_value,
        current_value,
        change_count: None,
        description,
    })
}

fn library_updates_for_changed_album(
    previous: &PreviousAlbum,
    current: &FinalAlbum,
) -> Vec<LibraryUpdateRecord> {
    let mut updates = Vec::new();
    for update in [
        metadata_update(
            previous,
            current,
            "album",
            "Album title",
            previous.album.clone(),
            current.album.clone(),
        ),
        metadata_update(
            previous,
            current,
            "album_artist_display",
            "Album artist",
            previous.album_artist_display.clone(),
            current.album_artist_display.clone(),
        ),
        metadata_update(
            previous,
            current,
            "canonical_genre",
            "Genre",
            previous.canonical_genre.clone(),
            current.canonical_genre.clone(),
        ),
        metadata_update(
            previous,
            current,
            "publisher",
            "Publisher",
            previous.publisher.clone(),
            current.publisher.clone(),
        ),
        metadata_update(
            previous,
            current,
            "year",
            "Year",
            previous.year.map(|value| value.to_string()),
            current.year.map(|value| value.to_string()),
        ),
        metadata_update(
            previous,
            current,
            "release_year",
            "Release year",
            previous.release_year.map(|value| value.to_string()),
            current.release_year.map(|value| value.to_string()),
        ),
        metadata_update(
            previous,
            current,
            "album_rating",
            "Album rating",
            previous.album_rating.map(|value| value.to_string()),
            current.album_rating.map(|value| value.to_string()),
        ),
    ]
    .into_iter()
    .flatten()
    {
        updates.push(update);
    }

    if previous.total_tracks != current.total_tracks {
        let added = current.total_tracks > previous.total_tracks;
        let change_count = i64::from(previous.total_tracks.abs_diff(current.total_tracks));
        updates.push(LibraryUpdateRecord {
            change_kind: "changed",
            category: "tracks",
            album_id: current.album_id.clone(),
            album_artist_display: current.album_artist_display.clone(),
            album: current.album.clone(),
            year: current.year.or(previous.year),
            field: Some("total_tracks"),
            field_label: Some("Tracks"),
            previous_value: Some(previous.total_tracks.to_string()),
            current_value: Some(current.total_tracks.to_string()),
            change_count: Some(change_count),
            description: format!(
                "{} {} {}",
                change_count,
                if change_count == 1 { "track" } else { "tracks" },
                if added { "added" } else { "removed" }
            ),
        });
    }

    if previous.rated_tracks != current.rated_tracks {
        let added = current.rated_tracks > previous.rated_tracks;
        let change_count = i64::from(previous.rated_tracks.abs_diff(current.rated_tracks));
        updates.push(LibraryUpdateRecord {
            change_kind: "changed",
            category: "ratings",
            album_id: current.album_id.clone(),
            album_artist_display: current.album_artist_display.clone(),
            album: current.album.clone(),
            year: current.year.or(previous.year),
            field: Some("rated_tracks"),
            field_label: Some("Track ratings"),
            previous_value: Some(previous.rated_tracks.to_string()),
            current_value: Some(current.rated_tracks.to_string()),
            change_count: Some(change_count),
            description: format!(
                "{} track {} {}",
                change_count,
                if change_count == 1 {
                    "rating"
                } else {
                    "ratings"
                },
                if added { "added" } else { "removed" }
            ),
        });
    }

    updates
}

fn library_update_for_added_album(current: &FinalAlbum) -> LibraryUpdateRecord {
    LibraryUpdateRecord {
        change_kind: "new",
        category: "album",
        album_id: current.album_id.clone(),
        album_artist_display: current.album_artist_display.clone(),
        album: current.album.clone(),
        year: current.year,
        field: None,
        field_label: None,
        previous_value: None,
        current_value: None,
        change_count: Some(i64::from(current.total_tracks)),
        description: "New album".to_string(),
    }
}

fn library_update_for_removed_album(previous: &PreviousAlbum) -> LibraryUpdateRecord {
    LibraryUpdateRecord {
        change_kind: "removed",
        category: "album",
        album_id: previous.album_id.clone(),
        album_artist_display: previous.album_artist_display.clone(),
        album: previous.album.clone(),
        year: previous.year,
        field: None,
        field_label: None,
        previous_value: None,
        current_value: None,
        change_count: Some(i64::from(previous.total_tracks)),
        description: "Removed album".to_string(),
    }
}

fn insert_library_updates(
    tx: &Transaction<'_>,
    import_run_id: i64,
    source_path: &str,
    updates: &[LibraryUpdateRecord],
) -> Result<()> {
    if updates.is_empty() {
        return Ok(());
    }
    let created_at = Utc::now().to_rfc3339();
    let source_label = format!("Library import #{import_run_id}");
    let mut insert = tx.prepare(
        "
        INSERT INTO library_updates (
            import_run_id, created_at, change_kind, category, album_id,
            album_artist_display, album, year, field, field_label,
            previous_value, current_value, change_count, description,
            source_kind, source_label, source_path
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
            ?14, 'library_import', ?15, ?16
        )
        ",
    )?;
    for update in updates {
        insert.execute(params![
            import_run_id,
            &created_at,
            update.change_kind,
            update.category,
            &update.album_id,
            &update.album_artist_display,
            &update.album,
            update.year,
            update.field,
            update.field_label,
            &update.previous_value,
            &update.current_value,
            update.change_count,
            &update.description,
            &source_label,
            source_path,
        ])?;
    }
    Ok(())
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
            if track.track_rating_value == Some(10) {
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

    let backup_path = copy_database_to_unique_backup(db_path, &backup_dir)?;

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

fn copy_database_to_unique_backup(db_path: &Path, backup_dir: &Path) -> Result<PathBuf> {
    for _ in 0..100 {
        let now = Utc::now();
        let sequence = BACKUP_FILENAME_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let backup_path = backup_dir.join(format!(
            "music-library-{}-{:08x}-{sequence:016x}-before-import.sqlite3",
            now.format("%Y%m%d-%H%M%S-%9f"),
            std::process::id(),
        ));
        let mut backup = match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&backup_path)
        {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(error).with_context(|| {
                    format!(
                        "Could not create database backup file {}",
                        backup_path.display()
                    )
                });
            }
        };
        let copy_result = (|| -> Result<()> {
            let mut source = fs::File::open(db_path).with_context(|| {
                format!(
                    "Could not open database backup source {}",
                    db_path.display()
                )
            })?;
            std::io::copy(&mut source, &mut backup).with_context(|| {
                format!(
                    "Could not copy database backup from {} to {}",
                    db_path.display(),
                    backup_path.display()
                )
            })?;
            backup.sync_all().with_context(|| {
                format!(
                    "Could not synchronize database backup {}",
                    backup_path.display()
                )
            })?;
            Ok(())
        })();
        if let Err(error) = copy_result {
            drop(backup);
            let _ = fs::remove_file(&backup_path);
            return Err(error);
        }
        return Ok(backup_path);
    }
    bail!("Could not reserve a unique database backup filename after 100 attempts")
}

fn enforce_backup_retention(backup_dir: &Path, backup_retention: usize) -> Result<()> {
    let mut backups = fs::read_dir(backup_dir)
        .with_context(|| format!("Could not read backup directory {}", backup_dir.display()))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            let path = entry.path();
            path.extension()
                .is_some_and(|extension| extension == "sqlite3")
                && !is_aurora_sync_batch_backup(&path)
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

fn is_aurora_sync_batch_backup(path: &Path) -> bool {
    path.file_name()
        .and_then(|value| value.to_str())
        .and_then(|name| name.strip_prefix("music-library-aurora-sync-"))
        .and_then(|value| value.strip_suffix("-before-import.sqlite3"))
        .is_some_and(|token| {
            token.len() == 24 && token.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
}

pub(crate) fn resolve_source_path(source_path: &str) -> Result<PathBuf> {
    let trimmed = source_path.trim();
    if trimmed.is_empty() {
        bail!("Choose a tagged album folder or MusicBee TSV before starting import");
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

    let candidate = candidates
        .into_iter()
        .find(|candidate| candidate.exists())
        .ok_or_else(|| anyhow!("Could not find import source path: {source_path}"))?;
    if candidate.is_dir() {
        crate::folder_sync::ensure_source_root_is_not_linked(&candidate)?;
    }
    Ok(candidate.canonicalize().unwrap_or(candidate))
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
    let rating = value.trim().parse::<f64>().ok()?;
    let half_star_steps = rating * 2.0;
    if rating.is_finite()
        && (0.0..=5.0).contains(&rating)
        && (half_star_steps - half_star_steps.round()).abs() < f64::EPSILON
    {
        Some(half_star_steps.round() as i32)
    } else {
        None
    }
}

fn normalize_track_rating(value: &str) -> Option<i32> {
    parse_track_rating(value).map(|half_star_steps| half_star_steps * 10)
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
        if unique_id.starts_with("aurora:") {
            return unique_id.to_owned();
        }
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
    use id3::frame::{ExtendedText, Popularimeter};
    use id3::{Tag, TagLike, Version};

    fn write_fast_sync_mp3(
        path: &Path,
        title: &str,
        rating_byte: Option<u8>,
        love: &str,
        release_year: i32,
    ) {
        fs::write(path, [0xFF, 0xFB, 0x90, 0x64, 0, 0, 0, 0]).expect("seed MP3");
        let mut tag = Tag::new();
        tag.set_artist("Track Artist");
        tag.set_album_artist("Album Artist");
        tag.set_album("Fast Album");
        tag.set_title(title);
        tag.set_genre("Score");
        tag.set_track(1);
        tag.set_disc(1);
        tag.set_year(2008);
        tag.set_duration(125_000);
        tag.set_text("TPUB", "Label");
        tag.set_text("TDRL", release_year.to_string());
        if !love.is_empty() {
            tag.add_frame(ExtendedText {
                description: "LOVE RATING".to_owned(),
                value: love.to_owned(),
            });
        }
        if let Some(rating) = rating_byte {
            tag.add_frame(Popularimeter {
                user: "MusicBee".to_owned(),
                rating,
                counter: 0,
            });
        }
        tag.write_to_path(path, Version::Id3v24)
            .expect("write fast-sync tags");
    }

    fn parse_fast_sync_record(values: Vec<String>) -> TrackRow {
        let headers = StringRecord::from(REQUIRED_COLUMNS.to_vec());
        let header_map = HeaderMap::from_headers(&headers).expect("fast-sync headers");
        TrackRow::from_record(&StringRecord::from(values), &header_map)
            .expect("parse fast-sync record")
    }

    fn seed_fast_sync_track(
        conn: &Connection,
        import_run_id: i64,
        row_number: i64,
        track: &TrackRow,
    ) -> i64 {
        conn.execute(
            "INSERT INTO raw_tracks (
                 import_run_id, row_number, display_artist, album_rating, disc_number,
                 album, genre, love, publisher, rating, title, track_number,
                 year_value, release_year, album_unique_id, file_path, filename,
                 album_artist_display, time_value, row_hash
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                       ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
            params![
                import_run_id,
                row_number,
                empty_to_none(&track.display_artist),
                empty_to_none(&track.album_rating_raw),
                empty_to_none(&track.disc_number_raw),
                empty_to_none(&track.album),
                empty_to_none(&track.genre),
                empty_to_none(&track.love),
                empty_to_none(&track.publisher),
                empty_to_none(&track.rating_raw),
                empty_to_none(&track.title),
                empty_to_none(&track.track_number_raw),
                empty_to_none(&track.year_raw),
                empty_to_none(&track.release_year_raw),
                empty_to_none(&track.album_unique_id),
                empty_to_none(&track.file_path),
                empty_to_none(&track.filename),
                empty_to_none(&track.album_artist_display),
                empty_to_none(&track.time_raw),
                &track.row_hash,
            ],
        )
        .expect("seed fast-sync raw track");
        let raw_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO tracks (
                 import_run_id, album_id, album_unique_id, display_artist,
                 album_artist_display, album, title, genre, canonical_genre,
                 genre_normalized, publisher, love, rating_raw, normalized_rating,
                 album_rating_raw, album_rating, disc_number, track_number, year,
                 release_year, time_seconds, file_path, filename, row_hash
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                       ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)",
            params![
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
            ],
        )
        .expect("seed fast-sync track");
        let track_id = conn.last_insert_rowid();
        assert_eq!(
            track_id, raw_id,
            "raw/normalized test identities must align"
        );
        track_id
    }

    fn seed_fast_sync_album(conn: &Connection, import_run_id: i64, tracks: &[TrackRow]) {
        let mut aggregate = AlbumAggregate::new(&tracks[0]);
        for track in tracks {
            aggregate.apply(track);
        }
        let album = aggregate.finalize();
        conn.execute(
            "INSERT INTO albums (
                 id, import_run_id, album_unique_id, album, album_artist_display,
                 canonical_genre, genre_normalized, publisher, year, release_year,
                 total_tracks, rated_tracks, rating_completeness, total_seconds,
                 loved_tracks, tmoe_seconds, ae_ratio, album_rating,
                 calculated_album_rating, effective_album_rating, album_score
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
                       ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
            params![
                &album.album_id,
                import_run_id,
                &album.album_unique_id,
                &album.album,
                &album.album_artist_display,
                &album.canonical_genre,
                &album.genre_normalized,
                &album.publisher,
                album.year,
                album.release_year,
                album.total_tracks,
                album.rated_tracks,
                album.rating_completeness,
                album.total_seconds,
                album.loved_tracks,
                album.tmoe_seconds,
                album.ae_ratio,
                album.album_rating,
                album.calculated_album_rating,
                album.effective_album_rating,
                album.album_score,
            ],
        )
        .expect("seed fast-sync album");
    }

    fn fast_sync_database(track: &TrackRow) -> (Connection, i64, i64, String) {
        let conn = Connection::open_in_memory().expect("fast-sync database");
        crate::db::configure(&conn).expect("configure fast-sync database");
        crate::db::migrate(&conn).expect("migrate fast-sync database");
        conn.execute(
            "INSERT INTO import_runs (
                 source_path, started_at, completed_at, status, track_rows, album_count
             ) VALUES ('initial.tsv', ?1, ?1, 'completed', 2, 2)",
            params![Utc::now().to_rfc3339()],
        )
        .expect("seed fast-sync import run");
        let old_run_id = conn.last_insert_rowid();
        let target_id = seed_fast_sync_track(&conn, old_run_id, 1, track);
        seed_fast_sync_album(&conn, old_run_id, std::slice::from_ref(track));

        let outside = parse_fast_sync_record(vec![
            "Other Artist".to_string(),
            String::new(),
            "1".to_string(),
            "Other Album".to_string(),
            "Rock".to_string(),
            String::new(),
            "Other Label".to_string(),
            String::new(),
            "Other Track".to_string(),
            "1".to_string(),
            "2020".to_string(),
            "2020".to_string(),
            "outside-album".to_string(),
            r"D:\Music\Outside Album".to_string(),
            "01.mp3".to_string(),
            "Other Artist".to_string(),
            "3:00".to_string(),
        ]);
        seed_fast_sync_track(&conn, old_run_id, 2, &outside);
        seed_fast_sync_album(&conn, old_run_id, std::slice::from_ref(&outside));
        (conn, old_run_id, target_id, outside.row_hash)
    }

    #[test]
    fn fast_sync_tolerates_duration_rounding_without_rewriting_catalog_time() {
        let values = |rating: &str, time: &str| {
            vec![
                "Track Artist",
                "80",
                "1",
                "Fast Album",
                "Score",
                "",
                "Label",
                rating,
                "Track Title",
                "1",
                "2008",
                "2008",
                "fast-album",
                r"G:\Scores\Fast Album",
                "01 - Track Title.mp3",
                "Album Artist",
                time,
            ]
            .into_iter()
            .map(str::to_owned)
            .collect::<Vec<_>>()
        };
        let current = parse_fast_sync_record(values("", "2:52"));
        let scanned = parse_fast_sync_record(values("4", "2:53"));

        assert!(fast_sync_track_changes_are_supported(&current, &scanned));
        let desired = fast_sync_desired_track(&current, &scanned);

        assert_eq!(desired.rating_raw, "4");
        assert_eq!(desired.normalized_rating, Some(80));
        assert_eq!(desired.time_raw, "2:52");
        assert_eq!(desired.time_seconds, Some(172));
        assert_ne!(desired.row_hash, current.row_hash);
    }

    #[test]
    fn fast_sync_treats_blank_and_zero_disc_numbers_as_equivalent() {
        let values = |disc_number: &str, rating: &str| {
            vec![
                "Track Artist",
                "",
                disc_number,
                "Fast Album",
                "Pop Rock",
                "",
                "Label",
                rating,
                "Track Title",
                "1",
                "2008",
                "",
                "fast-album",
                r"D:\Music\Fast Album",
                "01 - Track Title.mp3",
                "Album Artist",
                "2:05",
            ]
            .into_iter()
            .map(str::to_owned)
            .collect::<Vec<_>>()
        };
        let current = parse_fast_sync_record(values("", ""));
        let scanned = parse_fast_sync_record(values("0", "4"));

        assert!(fast_sync_track_changes_are_supported(&current, &scanned));
        let desired = fast_sync_desired_track(&current, &scanned);
        assert_eq!(desired.disc_number_raw, "");
        assert_eq!(desired.disc_number, None);
        assert_eq!(desired.normalized_rating, Some(80));
    }

    fn scanned_fast_sync_track(folder: &Path, album_unique_id: &str) -> TrackRow {
        scanned_fast_sync_tracks(folder, album_unique_id)
            .into_iter()
            .next()
            .expect("one scanned track")
    }

    fn scanned_fast_sync_tracks(folder: &Path, album_unique_id: &str) -> Vec<TrackRow> {
        let scan = crate::folder_sync::scan_existing_album(folder).expect("scan fast-sync album");
        scan.records(Some(album_unique_id))
            .into_iter()
            .map(|values| parse_fast_sync_record(values.into_iter().collect()))
            .collect()
    }

    #[test]
    fn existing_album_fast_sync_updates_both_track_tables_history_and_global_snapshot() {
        let temp = tempfile::tempdir().expect("tempdir");
        let folder = temp.path().join("Fast Album");
        fs::create_dir(&folder).expect("album folder");
        let folder = folder.canonicalize().expect("canonical album folder");
        let mp3 = folder.join("01 - Track.mp3");
        write_fast_sync_mp3(&mp3, "Track Title", None, "", 2008);
        let initial = scanned_fast_sync_track(&folder, "fast-album");
        let (mut conn, old_run_id, target_id, outside_hash) = fast_sync_database(&initial);

        write_fast_sync_mp3(&mp3, "Track Title", Some(242), "L", 2009);
        let candidate =
            prepare_existing_album_fast_sync(&conn, &folder).expect("prepare targeted sync");
        let outcome =
            apply_existing_album_fast_sync(&mut conn, &candidate).expect("apply targeted sync");
        let ExistingAlbumFastSyncOutcome::Updated {
            import_run_id,
            changed_tracks,
            changed_albums,
        } = outcome
        else {
            panic!("expected targeted update, got {outcome:?}");
        };
        assert_eq!(changed_tracks, 1);
        assert_eq!(changed_albums, 1);

        let normalized: (
            Option<String>,
            Option<i32>,
            Option<String>,
            Option<i32>,
            String,
            i64,
        ) = conn
            .query_row(
                "SELECT rating_raw, normalized_rating, love, release_year, row_hash, import_run_id
                 FROM tracks WHERE id = ?1",
                params![target_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .expect("updated normalized track");
        let raw: (Option<String>, Option<String>, Option<String>, String, i64) = conn
            .query_row(
                "SELECT rating, love, release_year, row_hash, import_run_id
                 FROM raw_tracks WHERE id = ?1",
                params![target_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .expect("updated raw track");
        assert_eq!(normalized.0.as_deref(), Some("4.5"));
        assert_eq!(normalized.1, Some(90));
        assert_eq!(normalized.2.as_deref(), Some("L"));
        assert_eq!(normalized.3, Some(2009));
        assert_eq!(normalized.4, raw.3);
        assert_eq!(normalized.5, import_run_id);
        assert_eq!(raw.0.as_deref(), Some("4.5"));
        assert_eq!(raw.1.as_deref(), Some("L"));
        assert_eq!(raw.2.as_deref(), Some("2009"));
        assert_eq!(raw.4, import_run_id);

        let album: (i64, i64, Option<i32>, Option<i32>, Option<f64>, i64) = conn
            .query_row(
                "SELECT rated_tracks, loved_tracks, release_year,
                        effective_album_rating, album_score, import_run_id
                 FROM albums WHERE id = ?1",
                params![initial.album_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .expect("updated album aggregate");
        assert_eq!(album.0, 1);
        assert_eq!(album.1, 1);
        assert_eq!(album.2, Some(2009));
        assert_eq!(album.3, Some(90));
        assert_eq!(album.4, Some(104.5));
        assert_eq!(album.5, import_run_id);

        let run: (String, i64, i64, i64, i64, Option<String>) = conn
            .query_row(
                "SELECT status, track_rows, album_count, changed_tracks,
                        changed_albums, backup_path
                 FROM import_runs WHERE id = ?1",
                params![import_run_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .expect("targeted import run");
        assert_eq!(run, ("completed".to_string(), 2, 2, 1, 1, None));
        let snapshot: (i64, i64, i64, i64) = conn
            .query_row(
                "SELECT track_count, album_count, rated_tracks,
                        albums_with_effective_rating
                 FROM rating_snapshots WHERE import_run_id = ?1",
                params![import_run_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("global targeted rating snapshot");
        assert_eq!(snapshot, (2, 2, 1, 1));
        assert!(
            conn.query_row(
                "SELECT COUNT(*) FROM library_updates WHERE import_run_id = ?1",
                params![import_run_id],
                |row| row.get::<_, i64>(0),
            )
            .expect("targeted updates")
                > 0
        );
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM rating_events WHERE import_run_id = ?1",
                params![import_run_id],
                |row| row.get::<_, i64>(0),
            )
            .expect("targeted rating event"),
            1
        );
        let outside: (i64, String) = conn
            .query_row(
                "SELECT import_run_id, row_hash FROM tracks WHERE album_id = 'mb:outside-album'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("untouched outside track");
        assert_eq!(outside, (old_run_id, outside_hash));

        let retry = prepare_existing_album_fast_sync(&conn, &folder).expect("prepare retry");
        assert_eq!(
            apply_existing_album_fast_sync(&mut conn, &retry).expect("idempotent retry"),
            ExistingAlbumFastSyncOutcome::Unchanged
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM import_runs", [], |row| row
                .get::<_, i64>(0))
                .expect("import run count"),
            2
        );
    }

    #[test]
    fn existing_file_fast_sync_reads_one_mp3_and_updates_album_history_and_snapshot() {
        let temp = tempfile::tempdir().expect("tempdir");
        let folder = temp.path().join("Fast Album");
        fs::create_dir(&folder).expect("album folder");
        let folder = folder.canonicalize().expect("canonical album folder");
        let target_mp3 = folder.join("01 - Target.mp3");
        let sibling_mp3 = folder.join("02 - Sibling.mp3");
        write_fast_sync_mp3(&target_mp3, "Target", None, "", 2008);
        write_fast_sync_mp3(&sibling_mp3, "Sibling", Some(196), "", 2008);
        let initial = scanned_fast_sync_tracks(&folder, "fast-album");

        let mut conn = Connection::open_in_memory().expect("fast-sync database");
        crate::db::configure(&conn).expect("configure fast-sync database");
        crate::db::migrate(&conn).expect("migrate fast-sync database");
        conn.execute(
            "INSERT INTO import_runs (
                 source_path, started_at, completed_at, status, track_rows, album_count
             ) VALUES ('initial.tsv', ?1, ?1, 'completed', 2, 1)",
            params![Utc::now().to_rfc3339()],
        )
        .expect("seed fast-sync import run");
        let old_run_id = conn.last_insert_rowid();
        let mut target_id = None;
        let mut sibling_id = None;
        let mut sibling_hash = String::new();
        for (index, track) in initial.iter().enumerate() {
            let id = seed_fast_sync_track(&conn, old_run_id, index as i64 + 1, track);
            if track.filename == "01 - Target.mp3" {
                target_id = Some(id);
            } else {
                sibling_id = Some(id);
                sibling_hash = track.row_hash.clone();
            }
        }
        seed_fast_sync_album(&conn, old_run_id, &initial);
        let target_id = target_id.expect("target id");
        let sibling_id = sibling_id.expect("sibling id");

        write_fast_sync_mp3(&target_mp3, "Target", Some(255), "L", 2009);
        let candidate = prepare_existing_file_fast_sync(&conn, &folder, &target_mp3)
            .expect("prepare exact-file sync")
            .expect("cataloged target candidate");
        let outcome =
            apply_existing_album_fast_sync(&mut conn, &candidate).expect("apply exact-file sync");
        let ExistingAlbumFastSyncOutcome::Updated {
            import_run_id,
            changed_tracks: 1,
            changed_albums: 1,
        } = outcome
        else {
            panic!("expected exact-file update, got {outcome:?}");
        };

        let target: (Option<i32>, Option<i32>, Option<String>, Option<i32>) = conn
            .query_row(
                "SELECT normalized_rating, album_rating, love, release_year
                 FROM tracks WHERE id = ?1",
                params![target_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("updated target");
        assert_eq!(
            target,
            (Some(100), Some(90), Some("L".to_owned()), Some(2009))
        );
        assert_eq!(
            conn.query_row(
                "SELECT row_hash FROM tracks WHERE id = ?1",
                params![sibling_id],
                |row| row.get::<_, String>(0),
            )
            .expect("unchanged sibling"),
            sibling_hash
        );
        let album: (i64, i64, Option<i32>, Option<i32>) = conn
            .query_row(
                "SELECT total_tracks, rated_tracks, album_rating, effective_album_rating
                 FROM albums WHERE id = ?1",
                params![&initial[0].album_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("updated aggregate");
        assert_eq!(album, (2, 2, Some(90), Some(90)));
        assert!(
            conn.query_row(
                "SELECT COUNT(*) FROM library_updates
                 WHERE import_run_id = ?1 AND category = 'ratings'
                   AND source_path = ?2 AND album_id = ?3",
                params![
                    import_run_id,
                    display_scoped_path(&folder),
                    &initial[0].album_id
                ],
                |row| row.get::<_, i64>(0),
            )
            .expect("targeted rating history")
                > 0
        );
        assert_eq!(
            conn.query_row(
                "SELECT rated_tracks FROM rating_snapshots WHERE import_run_id = ?1",
                params![import_run_id],
                |row| row.get::<_, i64>(0),
            )
            .expect("targeted global snapshot"),
            2
        );

        let retry = prepare_existing_file_fast_sync(&conn, &folder, &target_mp3)
            .expect("prepare idempotent retry")
            .expect("same target candidate");
        assert_eq!(
            apply_existing_album_fast_sync(&mut conn, &retry).expect("idempotent exact-file retry"),
            ExistingAlbumFastSyncOutcome::Unchanged
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM import_runs", [], |row| row
                .get::<_, i64>(0))
                .expect("no retry import run"),
            2
        );
    }

    #[test]
    fn existing_file_fast_sync_accepts_zero_disc_when_catalog_disc_is_blank() {
        let temp = tempfile::tempdir().expect("tempdir");
        let folder = temp.path().join("Fast Album");
        fs::create_dir(&folder).expect("album folder");
        let folder = folder.canonicalize().expect("canonical album folder");
        let mp3 = folder.join("01 - Track.mp3");
        write_fast_sync_mp3(&mp3, "Track Title", None, "", 2008);
        let mut initial = scanned_fast_sync_track(&folder, "fast-album");
        initial.disc_number_raw.clear();
        initial.disc_number = None;
        refresh_fast_sync_row_hash(&mut initial);
        let (mut conn, _, target_id, _) = fast_sync_database(&initial);

        write_fast_sync_mp3(&mp3, "Track Title", Some(196), "", 2008);
        let mut tag = Tag::read_from_path(&mp3).expect("read target MP3");
        tag.set_disc(0);
        tag.write_to_path(&mp3, Version::Id3v24)
            .expect("write zero disc number");

        let candidate = prepare_existing_file_fast_sync(&conn, &folder, &mp3)
            .expect("prepare zero-disc sync")
            .expect("cataloged target candidate");
        let outcome =
            apply_existing_album_fast_sync(&mut conn, &candidate).expect("apply zero-disc sync");
        assert!(matches!(
            outcome,
            ExistingAlbumFastSyncOutcome::Updated {
                changed_tracks: 1,
                ..
            }
        ));

        let updated: (Option<i32>, Option<i32>, Option<String>) = conn
            .query_row(
                "SELECT t.normalized_rating, t.disc_number, r.disc_number
                 FROM tracks AS t JOIN raw_tracks AS r ON r.id = t.id
                 WHERE t.id = ?1",
                params![target_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("updated zero-disc row");
        assert_eq!(updated, (Some(80), None, None));
    }

    #[test]
    fn existing_album_fast_sync_records_a_scoped_track_diff_when_aggregate_is_unchanged() {
        let temp = tempfile::tempdir().expect("tempdir");
        let folder = temp.path().join("Fast Album");
        fs::create_dir(&folder).expect("album folder");
        let folder = folder.canonicalize().expect("canonical album folder");
        let mp3 = folder.join("01 - Track.mp3");
        write_fast_sync_mp3(&mp3, "Track Title", None, "", 2008);
        let initial = scanned_fast_sync_track(&folder, "fast-album");
        let (mut conn, _, _, _) = fast_sync_database(&initial);

        write_fast_sync_mp3(&mp3, "Track Title", None, "B", 2008);
        let candidate =
            prepare_existing_album_fast_sync(&conn, &folder).expect("prepare Love sync");
        let outcome =
            apply_existing_album_fast_sync(&mut conn, &candidate).expect("apply Love sync");
        let ExistingAlbumFastSyncOutcome::Updated {
            import_run_id,
            changed_tracks: 1,
            changed_albums: 0,
        } = outcome
        else {
            panic!("expected scoped Love update, got {outcome:?}");
        };
        let (field, description): (String, String) = conn
            .query_row(
                "SELECT field, description FROM library_updates WHERE import_run_id = ?1",
                params![import_run_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("visible scoped track update");
        assert_eq!(field, "track_love");
        assert_eq!(
            description,
            "Love changed for Track Title from neutral to banned"
        );
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM rating_events WHERE import_run_id = ?1",
                params![import_run_id],
                |row| row.get::<_, i64>(0),
            )
            .expect("no aggregate rating event"),
            0
        );
    }

    #[test]
    fn existing_file_fast_sync_falls_back_for_unsupported_metadata_edits() {
        let temp = tempfile::tempdir().expect("tempdir");
        let folder = temp.path().join("Fast Album");
        fs::create_dir(&folder).expect("album folder");
        let folder = folder.canonicalize().expect("canonical album folder");
        let mp3 = folder.join("01 - Track.mp3");
        write_fast_sync_mp3(&mp3, "Track Title", None, "", 2008);
        let initial = scanned_fast_sync_track(&folder, "fast-album");
        let (mut conn, _, target_id, _) = fast_sync_database(&initial);

        write_fast_sync_mp3(&mp3, "Changed Title", None, "", 2008);
        let candidate = prepare_existing_file_fast_sync(&conn, &folder, &mp3)
            .expect("prepare unsupported sync")
            .expect("cataloged target candidate");
        assert_eq!(
            apply_existing_album_fast_sync(&mut conn, &candidate)
                .expect("unsupported edit routes to fallback"),
            ExistingAlbumFastSyncOutcome::Fallback
        );
        assert_eq!(
            conn.query_row(
                "SELECT title FROM tracks WHERE id = ?1",
                params![target_id],
                |row| row.get::<_, String>(0),
            )
            .expect("unchanged catalog title"),
            "Track Title"
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM import_runs", [], |row| row
                .get::<_, i64>(0))
                .expect("no targeted run"),
            1
        );
    }

    #[test]
    fn existing_file_fast_sync_cas_failure_rolls_back_every_targeted_write() {
        let temp = tempfile::tempdir().expect("tempdir");
        let folder = temp.path().join("Fast Album");
        fs::create_dir(&folder).expect("album folder");
        let folder = folder.canonicalize().expect("canonical album folder");
        let mp3 = folder.join("01 - Track.mp3");
        write_fast_sync_mp3(&mp3, "Track Title", None, "", 2008);
        let initial = scanned_fast_sync_track(&folder, "fast-album");
        let (mut conn, old_run_id, target_id, _) = fast_sync_database(&initial);

        write_fast_sync_mp3(&mp3, "Track Title", Some(242), "", 2008);
        let candidate = prepare_existing_file_fast_sync(&conn, &folder, &mp3)
            .expect("prepare CAS sync")
            .expect("cataloged target candidate");
        conn.execute_batch(&format!(
            "CREATE TRIGGER mutate_fast_sync_target
             AFTER INSERT ON import_runs
             WHEN NEW.status = 'running'
             BEGIN
                 UPDATE tracks SET row_hash = 'concurrent-change' WHERE id = {target_id};
             END;"
        ))
        .expect("install simulated concurrent-change trigger");
        let error = apply_existing_album_fast_sync(&mut conn, &candidate)
            .expect_err("CAS must reject stale catalog row");
        assert!(error.to_string().contains("changed while Aurora tag sync"));
        let raw: (Option<String>, i64) = conn
            .query_row(
                "SELECT rating, import_run_id FROM raw_tracks WHERE id = ?1",
                params![target_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("rolled-back raw track");
        assert_eq!(raw, (None, old_run_id));
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM import_runs", [], |row| row
                .get::<_, i64>(0))
                .expect("rolled-back import run"),
            1
        );
    }

    #[test]
    fn existing_file_fast_sync_falls_back_when_target_tags_change_after_prepare() {
        let temp = tempfile::tempdir().expect("tempdir");
        let folder = temp.path().join("Fast Album");
        fs::create_dir(&folder).expect("album folder");
        let folder = folder.canonicalize().expect("canonical album folder");
        let mp3 = folder.join("01 - Track.mp3");
        write_fast_sync_mp3(&mp3, "Track Title", None, "", 2008);
        let initial = scanned_fast_sync_track(&folder, "fast-album");
        let (mut conn, _, _, _) = fast_sync_database(&initial);

        write_fast_sync_mp3(&mp3, "Track Title", Some(196), "", 2008);
        let candidate = prepare_existing_file_fast_sync(&conn, &folder, &mp3)
            .expect("prepare exact-file sync")
            .expect("cataloged target candidate");
        write_fast_sync_mp3(&mp3, "Track Title", Some(242), "", 2008);

        assert_eq!(
            apply_existing_album_fast_sync(&mut conn, &candidate)
                .expect("mutation routes to safe fallback"),
            ExistingAlbumFastSyncOutcome::Fallback
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM import_runs", [], |row| row
                .get::<_, i64>(0))
                .expect("no stale targeted run"),
            1
        );
    }

    #[test]
    fn existing_file_fast_sync_requires_one_catalog_identity() {
        let temp = tempfile::tempdir().expect("tempdir");
        let folder = temp.path().join("Fast Album");
        fs::create_dir(&folder).expect("album folder");
        let folder = folder.canonicalize().expect("canonical album folder");
        let target = folder.join("01 - Track.mp3");
        let untracked = folder.join("02 - Untracked.mp3");
        write_fast_sync_mp3(&target, "Track Title", None, "", 2008);
        write_fast_sync_mp3(&untracked, "Untracked", None, "", 2008);
        fs::remove_file(&untracked).expect("hide untracked file from initial album scan");
        let initial = scanned_fast_sync_track(&folder, "fast-album");
        let (conn, _, _, _) = fast_sync_database(&initial);
        write_fast_sync_mp3(&untracked, "Untracked", None, "", 2008);

        assert!(prepare_existing_file_fast_sync(&conn, &folder, &untracked)
            .expect("untracked lookup")
            .is_none());

        conn.execute(
            "UPDATE tracks
             SET file_path = ?1, filename = ?2
             WHERE album_id = 'mb:outside-album'",
            params![display_scoped_path(&folder), "01 - Track.mp3"],
        )
        .expect("seed ambiguous catalog identity");
        assert!(prepare_existing_file_fast_sync(&conn, &folder, &target)
            .expect("ambiguous lookup")
            .is_none());
    }

    #[test]
    fn database_backup_copy_never_reuses_an_existing_filename() {
        let temp = tempfile::tempdir().expect("tempdir");
        let database = temp.path().join("music-library.sqlite3");
        let backups = temp.path().join("backups");
        fs::create_dir(&backups).expect("backup directory");
        fs::write(&database, b"database bytes").expect("database fixture");

        let first = copy_database_to_unique_backup(&database, &backups).expect("first backup");
        let second = copy_database_to_unique_backup(&database, &backups).expect("second backup");

        assert_ne!(first, second);
        assert_eq!(fs::read(first).expect("first bytes"), b"database bytes");
        assert_eq!(fs::read(second).expect("second bytes"), b"database bytes");
    }

    #[test]
    fn ordinary_import_retention_never_deletes_an_aurora_batch_backup() {
        let temp = tempfile::tempdir().expect("tempdir");
        let protected = temp
            .path()
            .join("music-library-aurora-sync-0123456789abcdef01234567-before-import.sqlite3");
        let ordinary = temp.path().join("music-library-test-before-import.sqlite3");
        fs::write(&protected, b"batch baseline").expect("protected backup");
        fs::write(&ordinary, b"ordinary backup").expect("ordinary backup");

        enforce_backup_retention(temp.path(), 0).expect("retention");

        assert!(protected.is_file());
        assert!(!ordinary.exists());
    }

    fn sample_final_album() -> FinalAlbum {
        FinalAlbum {
            album_id: "mb:head-east".to_string(),
            album_unique_id: Some("head-east".to_string()),
            album: Some("Gettin' Lucky".to_string()),
            album_artist_display: Some("Head East".to_string()),
            canonical_genre: Some("AOR".to_string()),
            genre_normalized: Some("aor".to_string()),
            publisher: Some("A&M".to_string()),
            year: Some(1977),
            release_year: Some(1977),
            total_tracks: 10,
            rated_tracks: 8,
            rating_completeness: 0.8,
            total_seconds: 2_400,
            loved_tracks: 1,
            tmoe_seconds: 300,
            ae_ratio: 0.125,
            album_rating: Some(80),
            calculated_album_rating: Some(78),
            effective_album_rating: Some(80),
            album_score: Some(96.0),
            album_artist_display_inferred: false,
        }
    }

    #[test]
    fn creates_readable_durable_updates_for_album_metadata_and_ratings() {
        let current = sample_final_album();
        let previous = PreviousAlbum {
            album_id: current.album_id.clone(),
            album: current.album.clone(),
            album_artist_display: current.album_artist_display.clone(),
            canonical_genre: Some("Pop Rock".to_string()),
            publisher: current.publisher.clone(),
            year: Some(1976),
            release_year: current.release_year,
            total_tracks: current.total_tracks,
            rated_tracks: 3,
            rating_completeness: 0.3,
            total_seconds: current.total_seconds,
            loved_tracks: current.loved_tracks,
            tmoe_seconds: current.tmoe_seconds,
            ae_ratio: current.ae_ratio,
            album_rating: current.album_rating,
            effective_album_rating: Some(74),
            album_score: Some(88.0),
        };

        let updates = library_updates_for_changed_album(&previous, &current);

        assert!(updates.iter().any(|update| {
            update.field == Some("canonical_genre")
                && update.description == "Genre changed from Pop Rock to AOR"
        }));
        assert!(updates.iter().any(|update| {
            update.field == Some("year") && update.description == "Year changed from 1976 to 1977"
        }));
        assert!(updates.iter().any(|update| {
            update.category == "ratings"
                && update.description == "5 track ratings added"
                && update.change_count == Some(5)
        }));

        let added = library_update_for_added_album(&current);
        let removed = library_update_for_removed_album(&previous);
        assert_eq!(added.change_count, Some(10));
        assert_eq!(removed.change_count, Some(10));
    }

    #[test]
    fn matches_unique_album_id_churn_by_unambiguous_album_identity() {
        let mut current = sample_final_album();
        current.album_id = "mb:new-musicbee-id".to_string();
        let previous = PreviousAlbum {
            album_id: "mb:old-musicbee-id".to_string(),
            album: current.album.clone(),
            album_artist_display: current.album_artist_display.clone(),
            canonical_genre: current.canonical_genre.clone(),
            publisher: current.publisher.clone(),
            year: current.year,
            release_year: current.release_year,
            total_tracks: current.total_tracks,
            rated_tracks: current.rated_tracks,
            rating_completeness: current.rating_completeness,
            total_seconds: current.total_seconds,
            loved_tracks: current.loved_tracks,
            tmoe_seconds: current.tmoe_seconds,
            ae_ratio: current.ae_ratio,
            album_rating: current.album_rating,
            effective_album_rating: current.effective_album_rating,
            album_score: current.album_score,
        };
        let mut previous_albums = HashMap::from([(previous.album_id.clone(), previous.clone())]);
        let index = build_previous_album_match_index(&previous_albums);

        let matched = take_matching_previous_album(&mut previous_albums, &index, &current)
            .expect("match regenerated MusicBee album id");

        assert_eq!(matched.album_id, previous.album_id);
        assert!(previous_albums.is_empty());
        assert!(library_updates_for_changed_album(&matched, &current).is_empty());
    }

    #[test]
    fn parses_musicbee_time_values() {
        assert_eq!(parse_time_seconds("4:05"), Some(245));
        assert_eq!(parse_time_seconds("1:02:03"), Some(3723));
        assert_eq!(parse_time_seconds("4:65"), None);
    }

    #[test]
    fn normalizes_musicbee_half_star_ratings() {
        assert_eq!(normalize_track_rating("5"), Some(100));
        assert_eq!(normalize_track_rating("5.0"), Some(100));
        assert_eq!(normalize_track_rating("0"), Some(0));
        assert_eq!(normalize_track_rating("3.5"), Some(70));
        assert_eq!(normalize_track_rating("3.25"), None);
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
        let error = apply_staged_import(
            &mut conn,
            &session,
            applying_run_id,
            Instant::now(),
            &session.source_path,
            None,
        )
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

    #[test]
    fn staged_import_relinks_every_single_chart_source() {
        let test_id = format!(
            "music-library-import-single-charts-{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        );
        let test_dir = std::env::temp_dir().join(test_id);
        fs::create_dir_all(&test_dir).expect("create singles chart import test directory");
        let source_path = test_dir.join("library.tsv");
        let values = [
            "Chart Artist",
            "",
            "1",
            "Chart Album",
            "Pop",
            "",
            "Label",
            "5",
            "Chart Song",
            "1",
            "2025",
            "2025",
            "chart-album",
            r"D:\Music\Chart Album",
            "01.mp3",
            "Chart Artist",
            "3:30",
        ];
        fs::write(
            &source_path,
            format!("{}\n{}\n", REQUIRED_COLUMNS.join("\t"), values.join("\t")),
        )
        .expect("write singles chart import TSV");

        let mut conn = Connection::open_in_memory().expect("open singles chart import database");
        crate::db::configure(&conn).expect("configure singles chart import database");
        crate::db::migrate(&conn).expect("migrate singles chart import database");
        let imported_at = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO import_runs (source_path, started_at, status) VALUES ('old.tsv', ?1, 'completed')",
            params![&imported_at],
        )
        .expect("seed previous import run");
        let old_run_id = conn.last_insert_rowid();
        conn.execute(
            "
            INSERT INTO tracks (
                import_run_id, album_id, album_unique_id, display_artist,
                album_artist_display, album, title, normalized_rating, year,
                file_path, filename, row_hash
            ) VALUES (
                ?1, 'mb:chart-album', 'chart-album', 'Chart Artist',
                'Chart Artist', 'Chart Album', 'Chart Song', 100, 2025,
                'D:\\Music\\Chart Album', '01.mp3', 'old-chart-hash'
            )
            ",
            params![old_run_id],
        )
        .expect("seed previously imported chart track");
        let old_track_id = conn.last_insert_rowid();

        conn.execute(
            "
            INSERT INTO billboard_single_chart_entries (
                source_file, year, rank, artist, display_artist, title,
                artist_key, title_key, album, album_key, date_entered,
                date_entered_year, date_entered_month, date_entered_week,
                date_entered_week_key, date_entered_quality, matched_track_id,
                imported_at
            ) VALUES (
                'billboard.csv', 2025, 7, 'Chart Artist', 'Chart Artist',
                'Chart Song', 'chart artist', 'chart song', 'Chart Album',
                'chart album', '2025-01-04', 2025, 1, 1, '2025-W01',
                'exact', ?1, ?2
            )
            ",
            params![old_track_id, &imported_at],
        )
        .expect("seed Billboard single entry");
        conn.execute(
            "
            INSERT INTO vg_lista_single_chart_entries (
                source_file, year, week, rank, artist, title, artist_key,
                title_key, week_date, week_key, matched_track_id, imported_at
            ) VALUES (
                'vg.csv', 2025, 2, 3, 'Chart Artist', 'Chart Song',
                'chart artist', 'chart song', '2025-01-06', '2025-W02', ?1, ?2
            )
            ",
            params![old_track_id, &imported_at],
        )
        .expect("seed VG Lista single entry");
        conn.execute(
            "
            INSERT INTO official_uk_single_chart_entries (
                source_file, year, week, chart_date, rank, artist, title,
                artist_key, title_key, week_key, matched_track_id, imported_at
            ) VALUES (
                'uk.csv', 2025, 3, '2025-01-13', 2, 'Chart Artist',
                'Chart Song', 'chart artist', 'chart song', '2025-W03', ?1, ?2
            )
            ",
            params![old_track_id, &imported_at],
        )
        .expect("seed Official UK single entry");
        conn.execute(
            "
            INSERT INTO ti_i_skuddet_chart_entries (
                source_file, year, week, chart_date, rank, rank_raw, artist,
                title, artist_key, title_key, matched_track_id, imported_at
            ) VALUES (
                'ti.csv', 2025, 4, '2025-01-20', 4, '4', 'Chart Artist',
                'Chart Song', 'chart artist', 'chart song', ?1, ?2
            )
            ",
            params![old_track_id, &imported_at],
        )
        .expect("seed Ti i Skuddet entry");
        conn.execute(
            "
            INSERT INTO norsktoppen_chart_entries (
                source_file, year, week, chart_date, rank, rank_raw, artist,
                title, artist_key, title_key, matched_track_id, imported_at
            ) VALUES (
                'norsktoppen.csv', 2025, 5, '2025-01-27', 1, '1',
                'Chart Artist', 'Chart Song', 'chart artist', 'chart song', ?1, ?2
            )
            ",
            params![old_track_id, &imported_at],
        )
        .expect("seed Norsktoppen entry");

        let fingerprint = source_fingerprint(&source_path.display().to_string())
            .expect("fingerprint singles chart import TSV");
        let ready = prepare_import_preview_for_connection(
            &mut conn,
            &fingerprint,
            &AtomicBool::new(false),
            &|_, _, _, _, _, _| {},
        )
        .expect("prepare singles chart import");
        conn.execute(
            "INSERT INTO import_runs (source_path, started_at, status) VALUES (?1, ?2, 'running')",
            params![&ready.source_path, Utc::now().to_rfc3339()],
        )
        .expect("seed applying singles chart import run");
        let applying_run_id = conn.last_insert_rowid();
        let session =
            load_import_session(&conn, ready.session_id).expect("load ready import session");
        apply_staged_import(
            &mut conn,
            &session,
            applying_run_id,
            Instant::now(),
            &session.source_path,
            None,
        )
        .expect("apply singles chart import");

        let new_track_id = conn
            .query_row("SELECT id FROM tracks", [], |row| row.get::<_, i64>(0))
            .expect("load reimported track id");
        assert_ne!(new_track_id, old_track_id);
        assert_eq!(
            conn.query_row(
                "
                SELECT billboard_single_rank, vg_lista_rank, official_uk_rank,
                       ti_i_skuddet_rank, norsktoppen_rank
                FROM tracks WHERE id = ?1
                ",
                params![new_track_id],
                |row| {
                    Ok((
                        row.get::<_, Option<i32>>(0)?,
                        row.get::<_, Option<i32>>(1)?,
                        row.get::<_, Option<i32>>(2)?,
                        row.get::<_, Option<i32>>(3)?,
                        row.get::<_, Option<i32>>(4)?,
                    ))
                },
            )
            .expect("load reimported singles chart rankings"),
            (Some(7), Some(3), Some(2), Some(4), Some(1))
        );
        for table in [
            "billboard_single_chart_entries",
            "vg_lista_single_chart_entries",
            "official_uk_single_chart_entries",
            "ti_i_skuddet_chart_entries",
            "norsktoppen_chart_entries",
        ] {
            let matched_track_id = conn
                .query_row(
                    &format!("SELECT matched_track_id FROM {table}"),
                    [],
                    |row| row.get::<_, Option<i64>>(0),
                )
                .expect("load reconciled singles chart entry");
            assert_eq!(matched_track_id, Some(new_track_id), "{table}");
        }

        fs::remove_dir_all(&test_dir).expect("remove singles chart import test directory");
    }
}
