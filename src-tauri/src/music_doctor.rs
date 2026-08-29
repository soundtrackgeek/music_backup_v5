use crate::db;
use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

static SYNC_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicDoctorSource {
    pub path: String,
    pub enabled: bool,
    pub last_scan_at: Option<String>,
    pub file_count: i64,
    pub total_bytes: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicDoctorFormatStat {
    pub format: String,
    pub file_count: i64,
    pub total_bytes: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicDoctorBitrateStat {
    pub band: String,
    pub sort_order: i64,
    pub file_count: i64,
    pub total_bytes: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicDoctorStatus {
    pub database_path: String,
    pub resolved_path: String,
    pub exists: bool,
    pub valid: bool,
    pub state: String,
    pub message: String,
    pub schema_version: Option<i32>,
    pub file_size_bytes: i64,
    pub latest_scan_id: Option<i64>,
    pub latest_scan_status: Option<String>,
    pub latest_scan_completed_at: Option<String>,
    pub source_count: i64,
    pub total_files: i64,
    pub audio_files: i64,
    pub audio_albums: i64,
    pub matched_tracks: i64,
    pub unmatched_library_tracks: i64,
    pub unmatched_doctor_audio: i64,
    pub file_issue_count: i64,
    pub last_synced_at: Option<String>,
    pub needs_sync: bool,
    pub sync_in_progress: bool,
    pub sources: Vec<MusicDoctorSource>,
    pub format_stats: Vec<MusicDoctorFormatStat>,
    pub bitrate_stats: Vec<MusicDoctorBitrateStat>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicDoctorSyncResult {
    pub sync_run_id: i64,
    pub database_path: String,
    pub scan_id: i64,
    pub scan_completed_at: Option<String>,
    pub total_files: i64,
    pub audio_files: i64,
    pub audio_albums: i64,
    pub matched_tracks: i64,
    pub unmatched_library_tracks: i64,
    pub unmatched_doctor_audio: i64,
    pub file_issue_count: i64,
    pub duration_ms: i64,
    pub completed_at: String,
}

#[derive(Debug, Clone)]
pub(crate) struct IntakeTrackQuality {
    pub path: PathBuf,
    pub source_path: PathBuf,
    pub relative_path: PathBuf,
    pub extension: String,
    pub format: String,
    pub size_bytes: i64,
    pub modified_ns: i64,
    pub bitrate_kbps: Option<i64>,
    pub duration_ms: Option<i64>,
    pub properties_checked_ns: i64,
    pub scan_error: Option<String>,
    pub updated_at: String,
}

pub(crate) fn cache_aurora_intake_quality(
    local: &Connection,
    records: &[IntakeTrackQuality],
) -> Result<()> {
    if records.is_empty() {
        return Ok(());
    }

    let transaction = local
        .unchecked_transaction()
        .context("Could not start Aurora intake quality caching")?;
    let mut resolved = Vec::with_capacity(records.len());
    for record in records {
        let input_key = normalized_file_key(&record.path);
        let ordinary_input_key = input_key
            .strip_prefix(r"\\?\")
            .unwrap_or(&input_key)
            .to_owned();
        let track = transaction
            .query_row(
                "
                SELECT album_id, file_path, filename
                FROM tracks
                WHERE unicode_lower(
                    replace(rtrim(file_path, char(92) || '/'), '/', char(92))
                    || char(92) || filename
                ) IN (unicode_lower(?1), unicode_lower(?2))
                LIMIT 1
                ",
                params![input_key, ordinary_input_key],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()?
            .ok_or_else(|| {
                anyhow!(
                    "The imported track was not found in the catalog: {}",
                    record.path.display()
                )
            })?;
        resolved.push((record, track.0, track.1, track.2));
    }

    let mut album_ids = resolved
        .iter()
        .map(|(_, album_id, _, _)| album_id.clone())
        .collect::<Vec<_>>();
    album_ids.sort();
    album_ids.dedup();
    for album_id in &album_ids {
        transaction.execute(
            "DELETE FROM music_doctor_track_quality WHERE album_id = ?1",
            [album_id],
        )?;
        transaction.execute(
            "DELETE FROM music_doctor_album_quality WHERE album_id = ?1",
            [album_id],
        )?;
    }

    for (record, album_id, file_path, filename) in resolved {
        let file_key = normalized_file_key(Path::new(&file_path).join(&filename).as_path());
        transaction.execute(
            "
            INSERT OR REPLACE INTO music_doctor_track_quality (
                file_key, file_path, filename, album_id, source_path, relative_path,
                extension, format, file_type, size_bytes, modified_ns, bitrate_kbps,
                duration_ms, properties_checked_ns, scan_error, missing,
                doctor_updated_at, sync_run_id
            ) VALUES (
                unicode_lower(?1), ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'Audio', ?9,
                ?10, ?11, ?12, ?13, ?14, 0, ?15, 0
            )
            ",
            params![
                file_key,
                file_path,
                filename,
                album_id,
                record.source_path.to_string_lossy(),
                record.relative_path.to_string_lossy(),
                record.extension,
                record.format,
                record.size_bytes,
                record.modified_ns,
                record.bitrate_kbps,
                record.duration_ms,
                record.properties_checked_ns,
                record.scan_error,
                record.updated_at,
            ],
        )?;
    }

    for album_id in &album_ids {
        transaction.execute(
            "
            INSERT INTO music_doctor_album_quality (
                album_id, matched_tracks, total_size_bytes, min_bitrate_kbps,
                avg_bitrate_kbps, max_bitrate_kbps, below_128_tracks,
                below_192_tracks, below_320_tracks, at_least_320_tracks,
                mixed_quality, formats, sync_run_id
            )
            SELECT
                album_id, COUNT(*), COALESCE(SUM(size_bytes), 0), MIN(bitrate_kbps),
                AVG(bitrate_kbps), MAX(bitrate_kbps),
                SUM(CASE WHEN bitrate_kbps < 128 THEN 1 ELSE 0 END),
                SUM(CASE WHEN bitrate_kbps < 192 THEN 1 ELSE 0 END),
                SUM(CASE WHEN bitrate_kbps < 320 THEN 1 ELSE 0 END),
                SUM(CASE WHEN bitrate_kbps >= 320 THEN 1 ELSE 0 END),
                CASE WHEN MIN(bitrate_kbps) <> MAX(bitrate_kbps) THEN 1 ELSE 0 END,
                COALESCE(GROUP_CONCAT(DISTINCT format), ''), 0
            FROM music_doctor_track_quality
            WHERE album_id = ?1
            GROUP BY album_id
            ",
            [album_id],
        )?;
    }
    transaction
        .commit()
        .context("Could not cache Aurora intake quality")
}

fn normalized_file_key(path: &Path) -> String {
    path.to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_string()
}

#[derive(Debug)]
struct ExternalSnapshot {
    resolved_path: PathBuf,
    schema_version: i32,
    file_size_bytes: i64,
    modified_ns: Option<i64>,
    latest_scan_id: i64,
    latest_scan_status: String,
    latest_scan_completed_at: Option<String>,
    source_count: i64,
    total_files: i64,
    audio_files: i64,
    audio_albums: i64,
    sources: Vec<MusicDoctorSource>,
    format_stats: Vec<MusicDoctorFormatStat>,
    bitrate_stats: Vec<MusicDoctorBitrateStat>,
}

#[derive(Debug, Default)]
struct CachedSync {
    scan_id: Option<i64>,
    local_import_run_id: Option<i64>,
    matched_tracks: i64,
    unmatched_library_tracks: i64,
    unmatched_doctor_audio: i64,
    file_issue_count: i64,
    completed_at: Option<String>,
}

#[cfg(not(test))]
pub fn status_for_app(app: &tauri::AppHandle) -> Result<MusicDoctorStatus> {
    let (conn, _) = db::open(app)?;
    let settings = db::settings_for_connection(&conn)?;
    status_for_connection(&conn, &settings.music_doctor_database_path)
}

#[cfg(not(test))]
pub fn sync_for_app(app: &tauri::AppHandle) -> Result<MusicDoctorSyncResult> {
    let (conn, _) = db::open(app)?;
    let settings = db::settings_for_connection(&conn)?;
    sync_for_connection(&conn, &settings.music_doctor_database_path)
}

pub fn status_for_connection(
    local: &Connection,
    configured_path: &str,
) -> Result<MusicDoctorStatus> {
    let resolved_path = resolve_database_path(configured_path)?;
    let resolved_path_text = resolved_path.to_string_lossy().to_string();
    let cached = cached_sync(local)?;
    let local_import_run_id = latest_local_import_run_id(local)?;
    let sync_in_progress = SYNC_IN_PROGRESS.load(Ordering::Relaxed);

    if !resolved_path.is_file() {
        return Ok(MusicDoctorStatus {
            database_path: configured_path.to_string(),
            resolved_path: resolved_path_text,
            exists: false,
            valid: false,
            state: "unavailable".to_string(),
            message: "Music Doctor database was not found.".to_string(),
            schema_version: None,
            file_size_bytes: 0,
            latest_scan_id: None,
            latest_scan_status: None,
            latest_scan_completed_at: None,
            source_count: 0,
            total_files: 0,
            audio_files: 0,
            audio_albums: 0,
            matched_tracks: cached.matched_tracks,
            unmatched_library_tracks: cached.unmatched_library_tracks,
            unmatched_doctor_audio: cached.unmatched_doctor_audio,
            file_issue_count: cached.file_issue_count,
            last_synced_at: cached.completed_at,
            needs_sync: false,
            sync_in_progress,
            sources: Vec::new(),
            format_stats: cached_format_stats(local)?,
            bitrate_stats: cached_bitrate_stats(local)?,
        });
    }

    let snapshot = match inspect_external_database(&resolved_path) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            return Ok(MusicDoctorStatus {
                database_path: configured_path.to_string(),
                resolved_path: resolved_path_text,
                exists: true,
                valid: false,
                state: "invalid".to_string(),
                message: error.to_string(),
                schema_version: None,
                file_size_bytes: fs::metadata(&resolved_path)
                    .map(|metadata| metadata.len() as i64)
                    .unwrap_or_default(),
                latest_scan_id: None,
                latest_scan_status: None,
                latest_scan_completed_at: None,
                source_count: 0,
                total_files: 0,
                audio_files: 0,
                audio_albums: 0,
                matched_tracks: cached.matched_tracks,
                unmatched_library_tracks: cached.unmatched_library_tracks,
                unmatched_doctor_audio: cached.unmatched_doctor_audio,
                file_issue_count: cached.file_issue_count,
                last_synced_at: cached.completed_at,
                needs_sync: false,
                sync_in_progress,
                sources: Vec::new(),
                format_stats: cached_format_stats(local)?,
                bitrate_stats: cached_bitrate_stats(local)?,
            });
        }
    };

    let needs_sync = cached.scan_id != Some(snapshot.latest_scan_id)
        || cached.local_import_run_id != local_import_run_id;
    let ready = snapshot.latest_scan_status == "completed";
    let state = if !ready {
        "scanning"
    } else if needs_sync {
        "stale"
    } else {
        "available"
    };
    let message = if !ready {
        "Music Doctor is still scanning; synchronization will wait for completion.".to_string()
    } else if needs_sync {
        "A newer Music Doctor scan or Music Library import is ready to synchronize.".to_string()
    } else {
        "Music Doctor quality data is synchronized.".to_string()
    };

    Ok(MusicDoctorStatus {
        database_path: configured_path.to_string(),
        resolved_path: snapshot.resolved_path.to_string_lossy().to_string(),
        exists: true,
        valid: true,
        state: state.to_string(),
        message,
        schema_version: Some(snapshot.schema_version),
        file_size_bytes: snapshot.file_size_bytes,
        latest_scan_id: Some(snapshot.latest_scan_id),
        latest_scan_status: Some(snapshot.latest_scan_status),
        latest_scan_completed_at: snapshot.latest_scan_completed_at,
        source_count: snapshot.source_count,
        total_files: snapshot.total_files,
        audio_files: snapshot.audio_files,
        audio_albums: snapshot.audio_albums,
        matched_tracks: cached.matched_tracks,
        unmatched_library_tracks: cached.unmatched_library_tracks,
        unmatched_doctor_audio: cached.unmatched_doctor_audio,
        file_issue_count: cached.file_issue_count,
        last_synced_at: cached.completed_at,
        needs_sync,
        sync_in_progress,
        sources: snapshot.sources,
        format_stats: snapshot.format_stats,
        bitrate_stats: snapshot.bitrate_stats,
    })
}

pub fn sync_for_connection(
    local: &Connection,
    configured_path: &str,
) -> Result<MusicDoctorSyncResult> {
    let _guard = SyncGuard::acquire()?;
    let started = Instant::now();
    let started_at = Utc::now().to_rfc3339();
    let resolved_path = resolve_database_path(configured_path)?;
    let snapshot = inspect_external_database(&resolved_path)?;
    if snapshot.latest_scan_status != "completed" {
        return Err(anyhow!(
            "Music Doctor scan {} is {}; wait for it to complete",
            snapshot.latest_scan_id,
            snapshot.latest_scan_status
        ));
    }

    let source_uri = sqlite_read_only_uri(&snapshot.resolved_path);
    let _ = local.execute_batch("DETACH DATABASE music_doctor_source;");
    local
        .execute("ATTACH DATABASE ?1 AS music_doctor_source", [source_uri])
        .with_context(|| {
            format!(
                "Could not attach Music Doctor database read-only at {}",
                snapshot.resolved_path.display()
            )
        })?;

    let sync_result = (|| -> Result<MusicDoctorSyncResult> {
        let local_import_run_id = latest_local_import_run_id(local)?;
        let transaction = local
            .unchecked_transaction()
            .context("Could not start Music Doctor synchronization")?;

        transaction
            .execute_batch(
                "
            DROP TABLE IF EXISTS temp.music_doctor_local_tracks;
            CREATE TEMP TABLE music_doctor_local_tracks (
                file_key TEXT PRIMARY KEY,
                track_id INTEGER NOT NULL,
                album_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                filename TEXT NOT NULL
            ) WITHOUT ROWID;

            INSERT OR REPLACE INTO music_doctor_local_tracks (
                file_key, track_id, album_id, file_path, filename
            )
            SELECT
                unicode_lower(
                    replace(rtrim(file_path, char(92) || '/'), '/', char(92))
                    || char(92) || filename
                ),
                id,
                album_id,
                file_path,
                filename
            FROM tracks
            WHERE NULLIF(TRIM(COALESCE(file_path, '')), '') IS NOT NULL
              AND NULLIF(TRIM(COALESCE(filename, '')), '') IS NOT NULL;
            ",
            )
            .context("Could not index local track paths for Music Doctor")?;

        let completed_at = Utc::now().to_rfc3339();
        transaction.execute(
            "
            INSERT INTO music_doctor_sync_runs (
                database_path, database_size_bytes, database_modified_ns,
                external_schema_version, external_scan_id, external_scan_completed_at,
                local_import_run_id, source_count, total_files, audio_files,
                audio_albums, matched_tracks, unmatched_library_tracks,
                unmatched_doctor_audio, file_issue_count, started_at, completed_at,
                duration_ms
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
                0, 0, 0, 0, ?12, ?13, 0
            )
            ",
            params![
                snapshot.resolved_path.to_string_lossy(),
                snapshot.file_size_bytes,
                snapshot.modified_ns,
                snapshot.schema_version,
                snapshot.latest_scan_id,
                snapshot.latest_scan_completed_at,
                local_import_run_id,
                snapshot.source_count,
                snapshot.total_files,
                snapshot.audio_files,
                snapshot.audio_albums,
                started_at,
                completed_at,
            ],
        )?;
        let sync_run_id = transaction.last_insert_rowid();

        transaction.execute_batch(
            "
            DELETE FROM music_doctor_track_quality
            WHERE sync_run_id = 0
              AND NOT EXISTS (
                  SELECT 1 FROM temp.music_doctor_local_tracks local
                  WHERE local.file_key = music_doctor_track_quality.file_key
              );
            DELETE FROM music_doctor_track_quality WHERE sync_run_id <> 0;
            DELETE FROM music_doctor_album_quality;
            DELETE FROM music_doctor_unmatched_files;
            DELETE FROM music_doctor_file_issues;
            DELETE FROM music_doctor_format_stats;
            DELETE FROM music_doctor_bitrate_stats;
            ",
        )?;

        transaction
            .execute(
                "
            INSERT OR REPLACE INTO music_doctor_track_quality (
                file_key, file_path, filename, album_id, source_path, relative_path,
                extension, format, file_type, size_bytes, modified_ns, bitrate_kbps,
                duration_ms, properties_checked_ns, scan_error, missing,
                doctor_updated_at, sync_run_id
            )
            SELECT
                s.path_key || char(92) || f.path_key,
                local.file_path,
                local.filename,
                local.album_id,
                s.path,
                f.relative_path,
                f.extension,
                f.format,
                f.file_type,
                f.size_bytes,
                f.modified_ns,
                f.bitrate_kbps,
                f.duration_ms,
                f.properties_checked_ns,
                f.scan_error,
                f.missing,
                f.updated_at,
                ?1
            FROM music_doctor_source.files f
            JOIN music_doctor_source.sources s ON s.id = f.source_id
            JOIN temp.music_doctor_local_tracks local
              ON local.file_key = s.path_key || char(92) || f.path_key
            WHERE f.file_type = 'Audio' AND f.missing = 0
            ",
                [sync_run_id],
            )
            .context("Could not cache matched Music Doctor audio")?;

        transaction
            .execute(
                "
            INSERT INTO music_doctor_unmatched_files (
                file_key, source_path, relative_path, file_name, album_folder,
                artist, album, album_year, extension, format, size_bytes,
                bitrate_kbps, duration_ms, doctor_updated_at, sync_run_id
            )
            SELECT
                s.path_key || char(92) || f.path_key,
                s.path,
                f.relative_path,
                f.file_name,
                f.album_folder,
                f.artist,
                f.album,
                f.album_year,
                f.extension,
                f.format,
                f.size_bytes,
                f.bitrate_kbps,
                f.duration_ms,
                f.updated_at,
                ?1
            FROM music_doctor_source.files f
            JOIN music_doctor_source.sources s ON s.id = f.source_id
            LEFT JOIN temp.music_doctor_local_tracks local
              ON local.file_key = s.path_key || char(92) || f.path_key
            WHERE f.file_type = 'Audio' AND f.missing = 0 AND local.track_id IS NULL
            ",
                [sync_run_id],
            )
            .context("Could not cache unmatched Music Doctor audio")?;

        transaction
            .execute(
                "
            INSERT INTO music_doctor_file_issues (
                file_key, source_path, relative_path, file_name, album_folder,
                artist, album, album_year, format, file_type, size_bytes,
                scan_error, missing, issue_kind, sync_run_id
            )
            SELECT
                s.path_key || char(92) || f.path_key,
                s.path,
                f.relative_path,
                f.file_name,
                f.album_folder,
                f.artist,
                f.album,
                f.album_year,
                f.format,
                f.file_type,
                f.size_bytes,
                f.scan_error,
                f.missing,
                CASE
                    WHEN f.missing <> 0 THEN 'missing'
                    WHEN NULLIF(TRIM(COALESCE(f.scan_error, '')), '') IS NOT NULL THEN 'scan-error'
                    ELSE 'empty-file'
                END,
                ?1
            FROM music_doctor_source.files f
            JOIN music_doctor_source.sources s ON s.id = f.source_id
            WHERE f.missing <> 0
               OR f.size_bytes = 0
               OR NULLIF(TRIM(COALESCE(f.scan_error, '')), '') IS NOT NULL
            ",
                [sync_run_id],
            )
            .context("Could not cache Music Doctor file problems")?;

        transaction
            .execute(
                "
            INSERT INTO music_doctor_album_quality (
                album_id, matched_tracks, total_size_bytes, min_bitrate_kbps,
                avg_bitrate_kbps, max_bitrate_kbps, below_128_tracks,
                below_192_tracks, below_320_tracks, at_least_320_tracks,
                mixed_quality, formats, sync_run_id
            )
            SELECT
                album_id,
                COUNT(*),
                COALESCE(SUM(size_bytes), 0),
                MIN(bitrate_kbps),
                AVG(bitrate_kbps),
                MAX(bitrate_kbps),
                SUM(CASE WHEN bitrate_kbps < 128 THEN 1 ELSE 0 END),
                SUM(CASE WHEN bitrate_kbps < 192 THEN 1 ELSE 0 END),
                SUM(CASE WHEN bitrate_kbps < 320 THEN 1 ELSE 0 END),
                SUM(CASE WHEN bitrate_kbps >= 320 THEN 1 ELSE 0 END),
                CASE WHEN MIN(bitrate_kbps) <> MAX(bitrate_kbps) THEN 1 ELSE 0 END,
                COALESCE(GROUP_CONCAT(DISTINCT format), ''),
                ?1
            FROM music_doctor_track_quality
            GROUP BY album_id
            ",
                [sync_run_id],
            )
            .context("Could not calculate Music Doctor album quality")?;

        transaction.execute(
            "
            INSERT INTO music_doctor_format_stats (format, file_count, total_bytes, sync_run_id)
            SELECT format, file_count, total_bytes, ?1
            FROM music_doctor_source.format_stats
            ",
            [sync_run_id],
        )?;
        transaction.execute(
            "
            INSERT INTO music_doctor_bitrate_stats (
                band, sort_order, file_count, total_bytes, sync_run_id
            )
            SELECT band, sort_order, file_count, total_bytes, ?1
            FROM music_doctor_source.bitrate_stats
            ",
            [sync_run_id],
        )?;

        let matched_tracks = transaction.query_row(
            "SELECT COUNT(*) FROM music_doctor_track_quality",
            [],
            |row| row.get::<_, i64>(0),
        )?;
        let local_tracks = transaction.query_row("SELECT COUNT(*) FROM tracks", [], |row| {
            row.get::<_, i64>(0)
        })?;
        let unmatched_doctor_audio = transaction.query_row(
            "SELECT COUNT(*) FROM music_doctor_unmatched_files",
            [],
            |row| row.get::<_, i64>(0),
        )?;
        let file_issue_count =
            transaction.query_row("SELECT COUNT(*) FROM music_doctor_file_issues", [], |row| {
                row.get::<_, i64>(0)
            })?;
        let unmatched_library_tracks = (local_tracks - matched_tracks).max(0);
        let duration_ms = started.elapsed().as_millis().min(i64::MAX as u128) as i64;

        transaction.execute(
            "
            UPDATE music_doctor_sync_runs
            SET matched_tracks = ?1,
                unmatched_library_tracks = ?2,
                unmatched_doctor_audio = ?3,
                file_issue_count = ?4,
                completed_at = ?5,
                duration_ms = ?6
            WHERE id = ?7
            ",
            params![
                matched_tracks,
                unmatched_library_tracks,
                unmatched_doctor_audio,
                file_issue_count,
                completed_at,
                duration_ms,
                sync_run_id,
            ],
        )?;

        transaction
            .commit()
            .context("Could not commit Music Doctor sync")?;

        Ok(MusicDoctorSyncResult {
            sync_run_id,
            database_path: snapshot.resolved_path.to_string_lossy().to_string(),
            scan_id: snapshot.latest_scan_id,
            scan_completed_at: snapshot.latest_scan_completed_at.clone(),
            total_files: snapshot.total_files,
            audio_files: snapshot.audio_files,
            audio_albums: snapshot.audio_albums,
            matched_tracks,
            unmatched_library_tracks,
            unmatched_doctor_audio,
            file_issue_count,
            duration_ms,
            completed_at,
        })
    })();

    let detach_result = local
        .execute_batch("DETACH DATABASE music_doctor_source;")
        .context("Could not detach Music Doctor database");
    let result = sync_result?;
    detach_result?;
    Ok(result)
}

fn inspect_external_database(path: &Path) -> Result<ExternalSnapshot> {
    let metadata = fs::metadata(path).with_context(|| {
        format!(
            "Could not inspect Music Doctor database at {}",
            path.display()
        )
    })?;
    if !metadata.is_file() {
        return Err(anyhow!("Music Doctor path is not a file"));
    }

    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .with_context(|| format!("Could not open Music Doctor database at {}", path.display()))?;
    conn.busy_timeout(std::time::Duration::from_secs(15))?;
    validate_external_schema(&conn)?;

    let schema_version = conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))?;
    let (latest_scan_id, latest_scan_status, latest_scan_completed_at) = conn
        .query_row(
            "SELECT id, status, completed_at FROM scans ORDER BY id DESC LIMIT 1",
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| anyhow!("Music Doctor database has no scan history"))?;
    let source_count = conn.query_row("SELECT COUNT(*) FROM sources", [], |row| row.get(0))?;
    let total_files = conn.query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0))?;
    let audio_files = conn.query_row(
        "SELECT COUNT(*) FROM files WHERE file_type = 'Audio' AND missing = 0",
        [],
        |row| row.get(0),
    )?;
    let audio_albums = conn.query_row(
        "SELECT COUNT(*) FROM albums WHERE avg_bitrate_kbps IS NOT NULL",
        [],
        |row| row.get(0),
    )?;

    let sources = {
        let mut stmt = conn.prepare(
            "SELECT path, enabled, last_scan_at, file_count, total_bytes FROM sources ORDER BY id",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(MusicDoctorSource {
                path: row.get(0)?,
                enabled: row.get::<_, i64>(1)? != 0,
                last_scan_at: row.get(2)?,
                file_count: row.get(3)?,
                total_bytes: row.get(4)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };
    let format_stats = read_format_stats(&conn, "format_stats")?;
    let bitrate_stats = read_bitrate_stats(&conn, "bitrate_stats")?;
    let modified_ns = metadata.modified().ok().and_then(|modified| {
        modified
            .duration_since(std::time::UNIX_EPOCH)
            .ok()
            .map(|duration| duration.as_nanos().min(i64::MAX as u128) as i64)
    });

    Ok(ExternalSnapshot {
        resolved_path: path.to_path_buf(),
        schema_version,
        file_size_bytes: metadata.len().min(i64::MAX as u64) as i64,
        modified_ns,
        latest_scan_id,
        latest_scan_status,
        latest_scan_completed_at,
        source_count,
        total_files,
        audio_files,
        audio_albums,
        sources,
        format_stats,
        bitrate_stats,
    })
}

fn validate_external_schema(conn: &Connection) -> Result<()> {
    for table in [
        "sources",
        "scans",
        "files",
        "albums",
        "format_stats",
        "bitrate_stats",
    ] {
        if !external_table_exists(conn, table)? {
            return Err(anyhow!("Music Doctor database is missing table {table}"));
        }
    }
    for column in [
        "source_id",
        "relative_path",
        "path_key",
        "file_name",
        "album_folder",
        "extension",
        "format",
        "file_type",
        "size_bytes",
        "modified_ns",
        "bitrate_kbps",
        "duration_ms",
        "properties_checked_ns",
        "scan_error",
        "missing",
        "updated_at",
    ] {
        if !external_column_exists(conn, "files", column)? {
            return Err(anyhow!(
                "Music Doctor files table is missing column {column}"
            ));
        }
    }
    Ok(())
}

fn external_table_exists(conn: &Connection, table: &str) -> Result<bool> {
    Ok(conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        [table],
        |row| row.get::<_, i64>(0),
    )? != 0)
}

fn external_column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        if row.get::<_, String>(1)? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

fn cached_sync(local: &Connection) -> Result<CachedSync> {
    local
        .query_row(
            "
            SELECT external_scan_id, local_import_run_id, matched_tracks,
                   unmatched_library_tracks, unmatched_doctor_audio,
                   file_issue_count, completed_at
            FROM music_doctor_sync_runs
            ORDER BY id DESC
            LIMIT 1
            ",
            [],
            |row| {
                Ok(CachedSync {
                    scan_id: row.get(0)?,
                    local_import_run_id: row.get(1)?,
                    matched_tracks: row.get(2)?,
                    unmatched_library_tracks: row.get(3)?,
                    unmatched_doctor_audio: row.get(4)?,
                    file_issue_count: row.get(5)?,
                    completed_at: row.get(6)?,
                })
            },
        )
        .optional()
        .map(|value| value.unwrap_or_default())
        .context("Could not load cached Music Doctor sync status")
}

fn cached_format_stats(local: &Connection) -> Result<Vec<MusicDoctorFormatStat>> {
    read_format_stats(local, "music_doctor_format_stats")
}

fn cached_bitrate_stats(local: &Connection) -> Result<Vec<MusicDoctorBitrateStat>> {
    read_bitrate_stats(local, "music_doctor_bitrate_stats")
}

fn read_format_stats(conn: &Connection, table: &str) -> Result<Vec<MusicDoctorFormatStat>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT format, file_count, total_bytes FROM {table} ORDER BY file_count DESC, format"
    ))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(MusicDoctorFormatStat {
                format: row.get(0)?,
                file_count: row.get(1)?,
                total_bytes: row.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn read_bitrate_stats(conn: &Connection, table: &str) -> Result<Vec<MusicDoctorBitrateStat>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT band, sort_order, file_count, total_bytes FROM {table} ORDER BY sort_order"
    ))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(MusicDoctorBitrateStat {
                band: row.get(0)?,
                sort_order: row.get(1)?,
                file_count: row.get(2)?,
                total_bytes: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn latest_local_import_run_id(local: &Connection) -> Result<Option<i64>> {
    local
        .query_row(
            "SELECT MAX(id) FROM import_runs WHERE status = 'completed'",
            [],
            |row| row.get(0),
        )
        .context("Could not inspect the latest Music Library import")
}

fn resolve_database_path(configured_path: &str) -> Result<PathBuf> {
    let configured = if configured_path.trim().is_empty() {
        db::DEFAULT_MUSIC_DOCTOR_DATABASE_PATH
    } else {
        configured_path.trim()
    };
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let expanded = if configured.to_ascii_uppercase().contains("%APPDATA%") {
        configured.replacen("%APPDATA%", &appdata, 1)
    } else {
        configured.to_string()
    };
    let path = PathBuf::from(expanded);
    if path.is_absolute() {
        Ok(path)
    } else {
        Ok(std::env::current_dir()
            .context("Could not resolve current directory")?
            .join(path))
    }
}

fn sqlite_read_only_uri(path: &Path) -> String {
    format!("file:{}?mode=ro", path.to_string_lossy().replace('\\', "/"))
}

struct SyncGuard;

impl SyncGuard {
    fn acquire() -> Result<Self> {
        SYNC_IN_PROGRESS
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
            .map_err(|_| anyhow!("Music Doctor synchronization is already running"))?;
        Ok(Self)
    }
}

impl Drop for SyncGuard {
    fn drop(&mut self) {
        SYNC_IN_PROGRESS.store(false, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_doctor_database(path: &Path) {
        let conn = Connection::open(path).expect("open Music Doctor fixture");
        conn.execute_batch(
            "
            PRAGMA user_version = 1;
            CREATE TABLE sources (
                id INTEGER PRIMARY KEY, path TEXT NOT NULL, path_key TEXT NOT NULL,
                enabled INTEGER NOT NULL, last_scan_at TEXT, file_count INTEGER NOT NULL,
                total_bytes INTEGER NOT NULL
            );
            CREATE TABLE scans (
                id INTEGER PRIMARY KEY, started_at TEXT NOT NULL, completed_at TEXT,
                status TEXT NOT NULL, check_ids TEXT NOT NULL, processed INTEGER NOT NULL,
                new_files INTEGER NOT NULL, changed_files INTEGER NOT NULL,
                missing_files INTEGER NOT NULL, errors INTEGER NOT NULL,
                duration_ms INTEGER, error_message TEXT
            );
            CREATE TABLE files (
                id INTEGER PRIMARY KEY, source_id INTEGER NOT NULL, relative_path TEXT NOT NULL,
                path_key TEXT NOT NULL, file_name TEXT NOT NULL, album_key TEXT NOT NULL,
                album_folder TEXT NOT NULL, artist TEXT, album TEXT, album_year INTEGER,
                album_parse_valid INTEGER NOT NULL, extension TEXT NOT NULL, format TEXT NOT NULL,
                file_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, modified_ns INTEGER NOT NULL,
                bitrate_kbps INTEGER, duration_ms INTEGER, properties_checked_ns INTEGER,
                scan_error TEXT, missing INTEGER NOT NULL, last_seen_scan_id INTEGER NOT NULL,
                updated_at TEXT NOT NULL, UNIQUE(source_id, path_key)
            );
            CREATE TABLE albums (
                id INTEGER PRIMARY KEY, source_id INTEGER NOT NULL, album_key TEXT NOT NULL,
                album_folder TEXT NOT NULL, artist TEXT, album TEXT, album_year INTEGER,
                parse_valid INTEGER NOT NULL, file_count INTEGER NOT NULL, total_bytes INTEGER NOT NULL,
                avg_bitrate_kbps INTEGER, lossless_files INTEGER NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE format_stats (format TEXT PRIMARY KEY, file_count INTEGER NOT NULL, total_bytes INTEGER NOT NULL);
            CREATE TABLE bitrate_stats (band TEXT PRIMARY KEY, sort_order INTEGER NOT NULL, file_count INTEGER NOT NULL, total_bytes INTEGER NOT NULL);
            INSERT INTO sources VALUES (1, 'D:\\MUSIC', 'd:\\music', 1, '2026-08-10T22:40:36Z', 3, 3000);
            INSERT INTO scans VALUES (1, '2026-08-10T15:39:13Z', '2026-08-10T22:40:46Z', 'completed', '[]', 3, 3, 0, 0, 0, 1000, NULL);
            INSERT INTO files VALUES
                (1, 1, 'KoЯn - Album (2010)\\01. KoЯn - Song.mp3', 'koяn - album (2010)\\01. koяn - song.mp3', '01. KoЯn - Song.mp3', 'koяn - album (2010)', 'KoЯn - Album (2010)', 'KoЯn', 'Album', 2010, 1, 'mp3', 'MP3', 'Audio', 1000, 1, 320, 180000, 1, NULL, 0, 1, '2026-08-10T22:40:46Z'),
                (2, 1, 'New Artist - New Album (2026)\\01 - New Song.mp3', 'new artist - new album (2026)\\01 - new song.mp3', '01 - New Song.mp3', 'new artist - new album (2026)', 'New Artist - New Album (2026)', 'New Artist', 'New Album', 2026, 1, 'mp3', 'MP3', 'Audio', 1500, 1, 128, 200000, 1, NULL, 0, 1, '2026-08-10T22:40:46Z'),
                (3, 1, 'New Artist - New Album (2026)\\empty.txt', 'new artist - new album (2026)\\empty.txt', 'empty.txt', 'new artist - new album (2026)', 'New Artist - New Album (2026)', 'New Artist', 'New Album', 2026, 1, 'txt', 'OTHER', 'Other', 0, 1, NULL, NULL, NULL, NULL, 0, 1, '2026-08-10T22:40:46Z');
            INSERT INTO albums VALUES
                (1, 1, 'koяn - album (2010)', 'KoЯn - Album (2010)', 'KoЯn', 'Album', 2010, 1, 1, 1000, 320, 0, '2026-08-10T22:40:46Z'),
                (2, 1, 'new artist - new album (2026)', 'New Artist - New Album (2026)', 'New Artist', 'New Album', 2026, 1, 2, 1500, 128, 0, '2026-08-10T22:40:46Z');
            INSERT INTO format_stats VALUES ('MP3', 2, 2500), ('OTHER', 1, 0);
            INSERT INTO bitrate_stats VALUES ('320 kbps+', 2, 1, 1000), ('128–191 kbps', 4, 1, 1500);
            ",
        )
        .expect("create Music Doctor fixture schema");
    }

    #[test]
    fn syncs_quality_by_unicode_normalized_full_path() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let doctor_path = directory.path().join("music-doctor.db");
        create_doctor_database(&doctor_path);

        let local = Connection::open_in_memory().expect("open local database");
        db::configure(&local).expect("configure local database");
        db::migrate(&local).expect("migrate local database");
        local
            .execute(
                "INSERT INTO import_runs (source_path, started_at, completed_at, status) VALUES ('fixture.tsv', '2026-08-01', '2026-08-01', 'completed')",
                [],
            )
            .expect("insert import run");
        local
            .execute(
                "INSERT INTO tracks (import_run_id, album_id, album, album_artist_display, title, file_path, filename, row_hash) VALUES (1, 'album-1', 'Album', 'KoЯn', 'Song', 'D:\\MUSIC\\KoЯn - Album (2010)', '01. KOЯN - SONG.mp3', 'hash')",
                [],
            )
            .expect("insert track");
        local
            .execute(
                "INSERT INTO tracks (import_run_id, album_id, album, album_artist_display, title, file_path, filename, row_hash) VALUES (1, 'album-2', 'Future Album', 'Future Artist', 'Future Song', 'D:\\MUSIC\\Future Artist - Future Album (2026)', '01 - Future Song.mp3', 'future-hash')",
                [],
            )
            .expect("insert future track");

        cache_aurora_intake_quality(
            &local,
            &[
                IntakeTrackQuality {
                    path: PathBuf::from("D:\\MUSIC\\KoЯn - Album (2010)\\01. KOЯN - SONG.mp3"),
                    source_path: PathBuf::from("D:\\MUSIC"),
                    relative_path: PathBuf::from("KoЯn - Album (2010)\\01. KOЯN - SONG.mp3"),
                    extension: "mp3".to_owned(),
                    format: "MP3".to_owned(),
                    size_bytes: 900,
                    modified_ns: 2,
                    bitrate_kbps: Some(192),
                    duration_ms: Some(180_000),
                    properties_checked_ns: 2,
                    scan_error: None,
                    updated_at: "2026-08-29T20:00:00Z".to_owned(),
                },
                IntakeTrackQuality {
                    path: PathBuf::from(
                        "D:\\MUSIC\\Future Artist - Future Album (2026)\\01 - Future Song.mp3",
                    ),
                    source_path: PathBuf::from("D:\\MUSIC"),
                    relative_path: PathBuf::from(
                        "Future Artist - Future Album (2026)\\01 - Future Song.mp3",
                    ),
                    extension: "mp3".to_owned(),
                    format: "MP3".to_owned(),
                    size_bytes: 1_200,
                    modified_ns: 2,
                    bitrate_kbps: Some(256),
                    duration_ms: Some(190_000),
                    properties_checked_ns: 2,
                    scan_error: None,
                    updated_at: "2026-08-29T20:00:00Z".to_owned(),
                },
            ],
        )
        .expect("cache Aurora intake quality");

        let result = sync_for_connection(&local, doctor_path.to_str().unwrap()).expect("sync");
        assert_eq!(result.matched_tracks, 2);
        assert_eq!(result.unmatched_library_tracks, 0);
        assert_eq!(result.unmatched_doctor_audio, 1);
        assert_eq!(result.file_issue_count, 1);

        let bitrate = local
            .query_row(
                "SELECT bitrate_kbps FROM music_doctor_track_quality WHERE album_id = 'album-1'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("cached bitrate");
        assert_eq!(bitrate, 320);
        let future_quality = local
            .query_row(
                "SELECT bitrate_kbps, sync_run_id FROM music_doctor_track_quality WHERE album_id = 'album-2'",
                [],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
            )
            .expect("preserved Aurora quality");
        assert_eq!(future_quality, (256, 0));

        let status = status_for_connection(&local, doctor_path.to_str().unwrap()).expect("status");
        assert!(!status.needs_sync);
        assert_eq!(status.state, "available");
        assert_eq!(status.matched_tracks, 2);
    }
}
