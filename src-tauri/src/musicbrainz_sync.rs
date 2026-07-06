use crate::db;
use crate::models::{MusicBrainzOverlaySyncLogEntry, MusicBrainzOverlaySyncResult};
use anyhow::{Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use std::fs;
use std::path::PathBuf;
#[cfg(not(test))]
use tauri::AppHandle;

const DEFAULT_OVERLAY_SYNC_PATH: &str =
    r"C:\Users\jtill\OneDrive\_musicbackup\musicbrainz-overlay-sync.sqlite3";

#[cfg(not(test))]
pub fn sync_for_app(app: &AppHandle) -> Result<MusicBrainzOverlaySyncResult> {
    sync_for_app_with_options(app, true)
}

#[cfg(not(test))]
pub fn sync_for_app_with_options(
    app: &AppHandle,
    record_noop: bool,
) -> Result<MusicBrainzOverlaySyncResult> {
    let (conn, _) = db::open(app)?;
    let settings = db::settings_for_connection(&conn)?;
    sync_for_connection_with_options(&conn, &settings.musicbrainz_overlay_sync_path, record_noop)
}

#[cfg(not(test))]
pub fn sync_log_for_app(
    app: &AppHandle,
    limit: Option<u32>,
) -> Result<Vec<MusicBrainzOverlaySyncLogEntry>> {
    let (conn, _) = db::open(app)?;
    sync_log_for_connection(&conn, limit.unwrap_or(12))
}

#[cfg(test)]
pub fn sync_for_connection(
    app_conn: &Connection,
    sync_path: &str,
) -> Result<MusicBrainzOverlaySyncResult> {
    sync_for_connection_with_options(app_conn, sync_path, true)
}

pub fn sync_for_connection_with_options(
    app_conn: &Connection,
    sync_path: &str,
    record_noop: bool,
) -> Result<MusicBrainzOverlaySyncResult> {
    ensure_overlay_schema(app_conn)
        .context("Could not prepare local MusicBrainz overlay tables")?;

    let sync_path = normalized_sync_path(sync_path);
    if let Some(parent) = sync_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent).with_context(|| {
            format!(
                "Could not create MusicBrainz overlay sync folder {}",
                parent.display()
            )
        })?;
    }

    let sync_conn = Connection::open(&sync_path).with_context(|| {
        format!(
            "Could not open MusicBrainz overlay sync database at {}",
            sync_path.display()
        )
    })?;
    configure_sync_connection(&sync_conn)?;
    ensure_overlay_schema(&sync_conn)
        .context("Could not prepare shared MusicBrainz overlay tables")?;

    let mut result = MusicBrainzOverlaySyncResult {
        sync_path: sync_path.display().to_string(),
        synced_at: Utc::now().to_rfc3339(),
        imported_count: 0,
        exported_count: 0,
        changed_count: 0,
        summary: String::new(),
        artist_links_imported: 0,
        artist_links_exported: 0,
        artist_unlinks_imported: 0,
        artist_unlinks_exported: 0,
        release_decisions_imported: 0,
        release_decisions_exported: 0,
        release_decision_clears_imported: 0,
        release_decision_clears_exported: 0,
        release_statuses_imported: 0,
        release_statuses_exported: 0,
        release_groups_imported: 0,
        release_groups_exported: 0,
    };

    result.artist_links_imported = copy_artist_links(&sync_conn, app_conn)?;
    result.release_decisions_imported = copy_release_decisions(&sync_conn, app_conn)?;
    result.release_statuses_imported = copy_release_statuses(&sync_conn, app_conn)?;
    result.release_groups_imported = copy_release_group_snapshots(&sync_conn, app_conn)?;
    result.release_decision_clears_imported =
        copy_release_decision_tombstones(&sync_conn, app_conn)?;
    result.artist_unlinks_imported = copy_artist_link_tombstones(&sync_conn, app_conn)?;

    result.artist_links_exported = copy_artist_links(app_conn, &sync_conn)?;
    result.release_decisions_exported = copy_release_decisions(app_conn, &sync_conn)?;
    result.release_statuses_exported = copy_release_statuses(app_conn, &sync_conn)?;
    result.release_groups_exported = copy_release_group_snapshots(app_conn, &sync_conn)?;
    result.release_decision_clears_exported =
        copy_release_decision_tombstones(app_conn, &sync_conn)?;
    result.artist_unlinks_exported = copy_artist_link_tombstones(app_conn, &sync_conn)?;

    finalize_result(&mut result);
    if record_noop || result.changed_count > 0 {
        record_sync_log(app_conn, &result)?;
    }

    Ok(result)
}

pub fn sync_log_for_connection(
    conn: &Connection,
    limit: u32,
) -> Result<Vec<MusicBrainzOverlaySyncLogEntry>> {
    ensure_sync_log_schema(conn)?;
    let limit = limit.clamp(1, 100);
    let mut stmt = conn
        .prepare(
            "
            SELECT id, synced_at, sync_path, imported_count, exported_count, changed_count,
                   summary, artist_links_imported, artist_links_exported,
                   artist_unlinks_imported, artist_unlinks_exported,
                   release_decisions_imported, release_decisions_exported,
                   release_decision_clears_imported, release_decision_clears_exported,
                   release_statuses_imported, release_statuses_exported,
                   release_groups_imported, release_groups_exported
            FROM musicbrainz_overlay_sync_log
            ORDER BY id DESC
            LIMIT ?1
            ",
        )
        .context("Could not prepare MusicBrainz overlay sync log query")?;
    let rows = stmt
        .query_map(params![i64::from(limit)], |row| {
            Ok(MusicBrainzOverlaySyncLogEntry {
                id: row.get(0)?,
                synced_at: row.get(1)?,
                sync_path: row.get(2)?,
                imported_count: row.get::<_, i64>(3)?.max(0) as usize,
                exported_count: row.get::<_, i64>(4)?.max(0) as usize,
                changed_count: row.get::<_, i64>(5)?.max(0) as usize,
                summary: row.get(6)?,
                artist_links_imported: row.get::<_, i64>(7)?.max(0) as usize,
                artist_links_exported: row.get::<_, i64>(8)?.max(0) as usize,
                artist_unlinks_imported: row.get::<_, i64>(9)?.max(0) as usize,
                artist_unlinks_exported: row.get::<_, i64>(10)?.max(0) as usize,
                release_decisions_imported: row.get::<_, i64>(11)?.max(0) as usize,
                release_decisions_exported: row.get::<_, i64>(12)?.max(0) as usize,
                release_decision_clears_imported: row.get::<_, i64>(13)?.max(0) as usize,
                release_decision_clears_exported: row.get::<_, i64>(14)?.max(0) as usize,
                release_statuses_imported: row.get::<_, i64>(15)?.max(0) as usize,
                release_statuses_exported: row.get::<_, i64>(16)?.max(0) as usize,
                release_groups_imported: row.get::<_, i64>(17)?.max(0) as usize,
                release_groups_exported: row.get::<_, i64>(18)?.max(0) as usize,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not read MusicBrainz overlay sync log")?;
    Ok(rows)
}

fn normalized_sync_path(sync_path: &str) -> PathBuf {
    let trimmed = sync_path.trim();
    if trimmed.is_empty() {
        PathBuf::from(DEFAULT_OVERLAY_SYNC_PATH)
    } else {
        PathBuf::from(trimmed)
    }
}

fn configure_sync_connection(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        PRAGMA busy_timeout = 15000;
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = DELETE;
        PRAGMA synchronous = FULL;
        PRAGMA temp_store = MEMORY;
        ",
    )
    .context("Could not configure MusicBrainz overlay sync database")?;
    Ok(())
}

fn ensure_overlay_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS musicbrainz_artist_links (
            local_artist_key TEXT PRIMARY KEY,
            display_artist TEXT NOT NULL,
            mbid TEXT,
            canonical_name TEXT,
            match_method TEXT NOT NULL DEFAULT 'unverified',
            confidence REAL,
            verification_state TEXT NOT NULL DEFAULT 'unverified',
            ignored INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS musicbrainz_release_decisions (
            local_artist_key TEXT NOT NULL,
            release_mbid TEXT NOT NULL,
            decision TEXT NOT NULL,
            local_album_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (local_artist_key, release_mbid),
            FOREIGN KEY(local_artist_key) REFERENCES musicbrainz_artist_links(local_artist_key)
                ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_links_mbid
            ON musicbrainz_artist_links(mbid);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_release_decisions_decision
            ON musicbrainz_release_decisions(decision);

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_link_tombstones (
            local_artist_key TEXT PRIMARY KEY,
            display_artist TEXT,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS musicbrainz_release_decision_tombstones (
            local_artist_key TEXT NOT NULL,
            release_mbid TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (local_artist_key, release_mbid)
        );

        CREATE TABLE IF NOT EXISTS musicbrainz_release_status_cache (
            artist_mbid TEXT NOT NULL,
            release_mbid TEXT NOT NULL,
            has_official_release INTEGER NOT NULL,
            checked_at TEXT NOT NULL,
            PRIMARY KEY (artist_mbid, release_mbid)
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_release_status_cache_checked
            ON musicbrainz_release_status_cache(checked_at);

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_release_groups (
            artist_mbid TEXT NOT NULL,
            release_mbid TEXT NOT NULL,
            title TEXT NOT NULL,
            year INTEGER,
            type TEXT,
            secondary_types TEXT NOT NULL DEFAULT '',
            track_count INTEGER,
            status TEXT NOT NULL DEFAULT 'Official',
            source TEXT NOT NULL DEFAULT 'musicbrainz-live',
            fetched_at TEXT NOT NULL,
            PRIMARY KEY (artist_mbid, release_mbid)
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_release_groups_artist
            ON musicbrainz_artist_release_groups(artist_mbid);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_release_groups_fetched
            ON musicbrainz_artist_release_groups(fetched_at);
        ",
    )
    .context("Could not create MusicBrainz overlay sync schema")?;
    Ok(())
}

fn ensure_sync_log_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS musicbrainz_overlay_sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            synced_at TEXT NOT NULL,
            sync_path TEXT NOT NULL,
            imported_count INTEGER NOT NULL DEFAULT 0,
            exported_count INTEGER NOT NULL DEFAULT 0,
            changed_count INTEGER NOT NULL DEFAULT 0,
            summary TEXT NOT NULL,
            artist_links_imported INTEGER NOT NULL DEFAULT 0,
            artist_links_exported INTEGER NOT NULL DEFAULT 0,
            artist_unlinks_imported INTEGER NOT NULL DEFAULT 0,
            artist_unlinks_exported INTEGER NOT NULL DEFAULT 0,
            release_decisions_imported INTEGER NOT NULL DEFAULT 0,
            release_decisions_exported INTEGER NOT NULL DEFAULT 0,
            release_decision_clears_imported INTEGER NOT NULL DEFAULT 0,
            release_decision_clears_exported INTEGER NOT NULL DEFAULT 0,
            release_statuses_imported INTEGER NOT NULL DEFAULT 0,
            release_statuses_exported INTEGER NOT NULL DEFAULT 0,
            release_groups_imported INTEGER NOT NULL DEFAULT 0,
            release_groups_exported INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_overlay_sync_log_synced
            ON musicbrainz_overlay_sync_log(synced_at);
        ",
    )
    .context("Could not create MusicBrainz overlay sync log")?;
    Ok(())
}

fn finalize_result(result: &mut MusicBrainzOverlaySyncResult) {
    result.imported_count = result.artist_links_imported
        + result.artist_unlinks_imported
        + result.release_decisions_imported
        + result.release_decision_clears_imported
        + result.release_statuses_imported
        + result.release_groups_imported;
    result.exported_count = result.artist_links_exported
        + result.artist_unlinks_exported
        + result.release_decisions_exported
        + result.release_decision_clears_exported
        + result.release_statuses_exported
        + result.release_groups_exported;
    result.changed_count = result.imported_count + result.exported_count;
    result.summary = if result.changed_count == 0 {
        "No MusicBrainz overlay changes.".to_string()
    } else {
        format!(
            "Imported {} and exported {} MusicBrainz overlay change{}.",
            result.imported_count,
            result.exported_count,
            if result.changed_count == 1 { "" } else { "s" }
        )
    };
}

fn record_sync_log(conn: &Connection, result: &MusicBrainzOverlaySyncResult) -> Result<()> {
    ensure_sync_log_schema(conn)?;
    conn.execute(
        "
        INSERT INTO musicbrainz_overlay_sync_log (
            synced_at, sync_path, imported_count, exported_count, changed_count, summary,
            artist_links_imported, artist_links_exported,
            artist_unlinks_imported, artist_unlinks_exported,
            release_decisions_imported, release_decisions_exported,
            release_decision_clears_imported, release_decision_clears_exported,
            release_statuses_imported, release_statuses_exported,
            release_groups_imported, release_groups_exported
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18
        )
        ",
        params![
            &result.synced_at,
            &result.sync_path,
            result.imported_count as i64,
            result.exported_count as i64,
            result.changed_count as i64,
            &result.summary,
            result.artist_links_imported as i64,
            result.artist_links_exported as i64,
            result.artist_unlinks_imported as i64,
            result.artist_unlinks_exported as i64,
            result.release_decisions_imported as i64,
            result.release_decisions_exported as i64,
            result.release_decision_clears_imported as i64,
            result.release_decision_clears_exported as i64,
            result.release_statuses_imported as i64,
            result.release_statuses_exported as i64,
            result.release_groups_imported as i64,
            result.release_groups_exported as i64,
        ],
    )
    .context("Could not record MusicBrainz overlay sync log entry")?;

    conn.execute(
        "
        DELETE FROM musicbrainz_overlay_sync_log
        WHERE id NOT IN (
            SELECT id
            FROM musicbrainz_overlay_sync_log
            ORDER BY id DESC
            LIMIT 100
        )
        ",
        [],
    )
    .context("Could not trim MusicBrainz overlay sync log")?;
    Ok(())
}

#[derive(Debug)]
struct ArtistLinkRow {
    local_artist_key: String,
    display_artist: String,
    mbid: Option<String>,
    canonical_name: Option<String>,
    match_method: String,
    confidence: Option<f64>,
    verification_state: String,
    ignored: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug)]
struct ReleaseDecisionRow {
    local_artist_key: String,
    release_mbid: String,
    decision: String,
    local_album_id: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug)]
struct ReleaseStatusRow {
    artist_mbid: String,
    release_mbid: String,
    has_official_release: i64,
    checked_at: String,
}

#[derive(Debug)]
struct ReleaseGroupRow {
    artist_mbid: String,
    release_mbid: String,
    title: String,
    year: Option<i32>,
    primary_type: Option<String>,
    secondary_types: String,
    track_count: Option<i64>,
    status: String,
    source: String,
    fetched_at: String,
}

#[derive(Debug)]
struct ArtistTombstoneRow {
    local_artist_key: String,
    display_artist: Option<String>,
    updated_at: String,
}

#[derive(Debug)]
struct ReleaseDecisionTombstoneRow {
    local_artist_key: String,
    release_mbid: String,
    updated_at: String,
}

#[derive(Debug)]
struct ReleaseGroupSnapshotMeta {
    artist_mbid: String,
    fetched_at: String,
    row_count: i64,
}

fn copy_artist_links(source: &Connection, dest: &Connection) -> Result<usize> {
    let mut copied = 0usize;
    for row in artist_links(source)? {
        if source_artist_tombstone_blocks_link(source, &row.local_artist_key, &row.updated_at)? {
            continue;
        }
        if dest_artist_tombstone_blocks_link(dest, &row.local_artist_key, &row.updated_at)? {
            continue;
        }
        if !artist_link_should_copy(dest, &row.local_artist_key, &row.updated_at)? {
            continue;
        }

        dest.execute(
            "
            INSERT INTO musicbrainz_artist_links (
                local_artist_key, display_artist, mbid, canonical_name, match_method,
                confidence, verification_state, ignored, created_at, updated_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
            )
            ON CONFLICT(local_artist_key) DO UPDATE SET
                display_artist = excluded.display_artist,
                mbid = excluded.mbid,
                canonical_name = excluded.canonical_name,
                match_method = excluded.match_method,
                confidence = excluded.confidence,
                verification_state = excluded.verification_state,
                ignored = excluded.ignored,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at
            ",
            params![
                row.local_artist_key,
                row.display_artist,
                row.mbid,
                row.canonical_name,
                row.match_method,
                row.confidence,
                row.verification_state,
                row.ignored,
                row.created_at,
                row.updated_at,
            ],
        )
        .context("Could not copy MusicBrainz artist link")?;
        dest.execute(
            "
            DELETE FROM musicbrainz_artist_link_tombstones
            WHERE local_artist_key = ?1 AND updated_at <= ?2
            ",
            params![row.local_artist_key, row.updated_at],
        )
        .context("Could not clear stale MusicBrainz artist unlink marker")?;
        copied += 1;
    }
    Ok(copied)
}

fn copy_artist_link_tombstones(source: &Connection, dest: &Connection) -> Result<usize> {
    let mut copied = 0usize;
    for row in artist_tombstones(source)? {
        let link_updated_at = artist_link_timestamp(dest, &row.local_artist_key)?;
        if timestamp_is_at_least(link_updated_at.as_deref(), &row.updated_at) {
            continue;
        }
        if !artist_tombstone_should_copy(dest, &row.local_artist_key, &row.updated_at)? {
            continue;
        }

        dest.execute(
            "
            INSERT INTO musicbrainz_artist_link_tombstones (
                local_artist_key, display_artist, updated_at
            ) VALUES (
                ?1, ?2, ?3
            )
            ON CONFLICT(local_artist_key) DO UPDATE SET
                display_artist = excluded.display_artist,
                updated_at = excluded.updated_at
            ",
            params![row.local_artist_key, row.display_artist, row.updated_at],
        )
        .context("Could not copy MusicBrainz artist unlink marker")?;
        dest.execute(
            "DELETE FROM musicbrainz_release_decisions WHERE local_artist_key = ?1",
            params![row.local_artist_key],
        )
        .context("Could not clear MusicBrainz release decisions for unlinked artist")?;
        dest.execute(
            "DELETE FROM musicbrainz_artist_links WHERE local_artist_key = ?1",
            params![row.local_artist_key],
        )
        .context("Could not apply MusicBrainz artist unlink marker")?;
        copied += 1;
    }
    Ok(copied)
}

fn copy_release_decisions(source: &Connection, dest: &Connection) -> Result<usize> {
    let mut copied = 0usize;
    for row in release_decisions(source)? {
        if source_release_decision_tombstone_blocks(
            source,
            &row.local_artist_key,
            &row.release_mbid,
            &row.updated_at,
        )? {
            continue;
        }
        if dest_artist_tombstone_blocks_link(dest, &row.local_artist_key, &row.updated_at)? {
            continue;
        }
        if dest_release_decision_tombstone_blocks(
            dest,
            &row.local_artist_key,
            &row.release_mbid,
            &row.updated_at,
        )? {
            continue;
        }
        if !release_decision_should_copy(
            dest,
            &row.local_artist_key,
            &row.release_mbid,
            &row.updated_at,
        )? {
            continue;
        }

        ensure_artist_link_for_release_decision(dest, &row.local_artist_key, &row.updated_at)?;
        dest.execute(
            "
            INSERT INTO musicbrainz_release_decisions (
                local_artist_key, release_mbid, decision, local_album_id, created_at, updated_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6
            )
            ON CONFLICT(local_artist_key, release_mbid) DO UPDATE SET
                decision = excluded.decision,
                local_album_id = excluded.local_album_id,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at
            ",
            params![
                row.local_artist_key,
                row.release_mbid,
                row.decision,
                row.local_album_id,
                row.created_at,
                row.updated_at,
            ],
        )
        .context("Could not copy MusicBrainz release decision")?;
        dest.execute(
            "
            DELETE FROM musicbrainz_release_decision_tombstones
            WHERE local_artist_key = ?1 AND release_mbid = ?2 AND updated_at <= ?3
            ",
            params![row.local_artist_key, row.release_mbid, row.updated_at],
        )
        .context("Could not clear stale MusicBrainz release-decision clear marker")?;
        copied += 1;
    }
    Ok(copied)
}

fn copy_release_decision_tombstones(source: &Connection, dest: &Connection) -> Result<usize> {
    let mut copied = 0usize;
    for row in release_decision_tombstones(source)? {
        let decision_updated_at =
            release_decision_timestamp(dest, &row.local_artist_key, &row.release_mbid)?;
        if timestamp_is_at_least(decision_updated_at.as_deref(), &row.updated_at) {
            continue;
        }
        if !release_decision_tombstone_should_copy(
            dest,
            &row.local_artist_key,
            &row.release_mbid,
            &row.updated_at,
        )? {
            continue;
        }

        dest.execute(
            "
            INSERT INTO musicbrainz_release_decision_tombstones (
                local_artist_key, release_mbid, updated_at
            ) VALUES (
                ?1, ?2, ?3
            )
            ON CONFLICT(local_artist_key, release_mbid) DO UPDATE SET
                updated_at = excluded.updated_at
            ",
            params![row.local_artist_key, row.release_mbid, row.updated_at],
        )
        .context("Could not copy MusicBrainz release-decision clear marker")?;
        dest.execute(
            "
            DELETE FROM musicbrainz_release_decisions
            WHERE local_artist_key = ?1 AND release_mbid = ?2
            ",
            params![row.local_artist_key, row.release_mbid],
        )
        .context("Could not apply MusicBrainz release-decision clear marker")?;
        copied += 1;
    }
    Ok(copied)
}

fn copy_release_statuses(source: &Connection, dest: &Connection) -> Result<usize> {
    let mut copied = 0usize;
    for row in release_statuses(source)? {
        if !release_status_should_copy(dest, &row.artist_mbid, &row.release_mbid, &row.checked_at)?
        {
            continue;
        }

        dest.execute(
            "
            INSERT INTO musicbrainz_release_status_cache (
                artist_mbid, release_mbid, has_official_release, checked_at
            ) VALUES (
                ?1, ?2, ?3, ?4
            )
            ON CONFLICT(artist_mbid, release_mbid) DO UPDATE SET
                has_official_release = excluded.has_official_release,
                checked_at = excluded.checked_at
            ",
            params![
                row.artist_mbid,
                row.release_mbid,
                row.has_official_release,
                row.checked_at,
            ],
        )
        .context("Could not copy MusicBrainz release-status cache row")?;
        copied += 1;
    }
    Ok(copied)
}

fn copy_release_group_snapshots(source: &Connection, dest: &Connection) -> Result<usize> {
    let mut copied = 0usize;
    for snapshot in release_group_snapshot_metas(source)? {
        if !release_group_snapshot_should_copy(
            dest,
            &snapshot.artist_mbid,
            &snapshot.fetched_at,
            snapshot.row_count,
        )? {
            continue;
        }

        let rows = release_group_rows(source, &snapshot.artist_mbid)?;
        dest.execute(
            "DELETE FROM musicbrainz_artist_release_groups WHERE artist_mbid = ?1",
            params![snapshot.artist_mbid],
        )
        .context("Could not clear older MusicBrainz release-group snapshot")?;
        for row in rows {
            dest.execute(
                "
                INSERT INTO musicbrainz_artist_release_groups (
                    artist_mbid, release_mbid, title, year, type, secondary_types,
                    track_count, status, source, fetched_at
                ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
                )
                ",
                params![
                    row.artist_mbid,
                    row.release_mbid,
                    row.title,
                    row.year,
                    row.primary_type,
                    row.secondary_types,
                    row.track_count,
                    row.status,
                    row.source,
                    row.fetched_at,
                ],
            )
            .context("Could not copy MusicBrainz release-group overlay row")?;
            copied += 1;
        }
    }
    Ok(copied)
}

fn artist_links(conn: &Connection) -> Result<Vec<ArtistLinkRow>> {
    let mut stmt = conn
        .prepare(
            "
            SELECT local_artist_key, display_artist, mbid, canonical_name, match_method,
                   confidence, verification_state, ignored, created_at, updated_at
            FROM musicbrainz_artist_links
            ",
        )
        .context("Could not prepare MusicBrainz artist-link sync query")?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ArtistLinkRow {
                local_artist_key: row.get(0)?,
                display_artist: row.get(1)?,
                mbid: row.get(2)?,
                canonical_name: row.get(3)?,
                match_method: row.get(4)?,
                confidence: row.get(5)?,
                verification_state: row.get(6)?,
                ignored: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not read MusicBrainz artist links for sync")?;
    Ok(rows)
}

fn artist_tombstones(conn: &Connection) -> Result<Vec<ArtistTombstoneRow>> {
    let mut stmt = conn
        .prepare(
            "
            SELECT local_artist_key, display_artist, updated_at
            FROM musicbrainz_artist_link_tombstones
            ",
        )
        .context("Could not prepare MusicBrainz artist unlink sync query")?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ArtistTombstoneRow {
                local_artist_key: row.get(0)?,
                display_artist: row.get(1)?,
                updated_at: row.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not read MusicBrainz artist unlink markers for sync")?;
    Ok(rows)
}

fn release_decisions(conn: &Connection) -> Result<Vec<ReleaseDecisionRow>> {
    let mut stmt = conn
        .prepare(
            "
            SELECT local_artist_key, release_mbid, decision, local_album_id, created_at, updated_at
            FROM musicbrainz_release_decisions
            ",
        )
        .context("Could not prepare MusicBrainz release-decision sync query")?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ReleaseDecisionRow {
                local_artist_key: row.get(0)?,
                release_mbid: row.get(1)?,
                decision: row.get(2)?,
                local_album_id: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not read MusicBrainz release decisions for sync")?;
    Ok(rows)
}

fn release_decision_tombstones(conn: &Connection) -> Result<Vec<ReleaseDecisionTombstoneRow>> {
    let mut stmt = conn
        .prepare(
            "
            SELECT local_artist_key, release_mbid, updated_at
            FROM musicbrainz_release_decision_tombstones
            ",
        )
        .context("Could not prepare MusicBrainz release-decision clear sync query")?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ReleaseDecisionTombstoneRow {
                local_artist_key: row.get(0)?,
                release_mbid: row.get(1)?,
                updated_at: row.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not read MusicBrainz release-decision clear markers for sync")?;
    Ok(rows)
}

fn release_statuses(conn: &Connection) -> Result<Vec<ReleaseStatusRow>> {
    let mut stmt = conn
        .prepare(
            "
            SELECT artist_mbid, release_mbid, has_official_release, checked_at
            FROM musicbrainz_release_status_cache
            ",
        )
        .context("Could not prepare MusicBrainz release-status sync query")?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ReleaseStatusRow {
                artist_mbid: row.get(0)?,
                release_mbid: row.get(1)?,
                has_official_release: row.get(2)?,
                checked_at: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not read MusicBrainz release-status cache for sync")?;
    Ok(rows)
}

fn release_group_snapshot_metas(conn: &Connection) -> Result<Vec<ReleaseGroupSnapshotMeta>> {
    let mut stmt = conn
        .prepare(
            "
            SELECT artist_mbid, MAX(fetched_at), COUNT(*)
            FROM musicbrainz_artist_release_groups
            GROUP BY artist_mbid
            ",
        )
        .context("Could not prepare MusicBrainz release-group snapshot sync query")?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ReleaseGroupSnapshotMeta {
                artist_mbid: row.get(0)?,
                fetched_at: row.get(1)?,
                row_count: row.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not read MusicBrainz release-group snapshots for sync")?;
    Ok(rows)
}

fn release_group_rows(conn: &Connection, artist_mbid: &str) -> Result<Vec<ReleaseGroupRow>> {
    let mut stmt = conn
        .prepare(
            "
            SELECT artist_mbid, release_mbid, title, year, type, secondary_types,
                   track_count, status, source, fetched_at
            FROM musicbrainz_artist_release_groups
            WHERE artist_mbid = ?1
            ORDER BY release_mbid
            ",
        )
        .context("Could not prepare MusicBrainz release-group row sync query")?;
    let rows = stmt
        .query_map(params![artist_mbid], |row| {
            Ok(ReleaseGroupRow {
                artist_mbid: row.get(0)?,
                release_mbid: row.get(1)?,
                title: row.get(2)?,
                year: row.get(3)?,
                primary_type: row.get(4)?,
                secondary_types: row.get(5)?,
                track_count: row.get(6)?,
                status: row.get(7)?,
                source: row.get(8)?,
                fetched_at: row.get(9)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not read MusicBrainz release-group rows for sync")?;
    Ok(rows)
}

fn artist_link_should_copy(
    conn: &Connection,
    local_artist_key: &str,
    updated_at: &str,
) -> Result<bool> {
    let existing = artist_link_timestamp(conn, local_artist_key)?;
    Ok(timestamp_is_newer(updated_at, existing.as_deref()))
}

fn artist_tombstone_should_copy(
    conn: &Connection,
    local_artist_key: &str,
    updated_at: &str,
) -> Result<bool> {
    let existing = artist_tombstone_timestamp(conn, local_artist_key)?;
    Ok(timestamp_is_newer(updated_at, existing.as_deref()))
}

fn release_decision_should_copy(
    conn: &Connection,
    local_artist_key: &str,
    release_mbid: &str,
    updated_at: &str,
) -> Result<bool> {
    let existing = release_decision_timestamp(conn, local_artist_key, release_mbid)?;
    Ok(timestamp_is_newer(updated_at, existing.as_deref()))
}

fn release_decision_tombstone_should_copy(
    conn: &Connection,
    local_artist_key: &str,
    release_mbid: &str,
    updated_at: &str,
) -> Result<bool> {
    let existing = release_decision_tombstone_timestamp(conn, local_artist_key, release_mbid)?;
    Ok(timestamp_is_newer(updated_at, existing.as_deref()))
}

fn release_status_should_copy(
    conn: &Connection,
    artist_mbid: &str,
    release_mbid: &str,
    checked_at: &str,
) -> Result<bool> {
    let existing = conn
        .query_row(
            "
            SELECT checked_at
            FROM musicbrainz_release_status_cache
            WHERE artist_mbid = ?1 AND release_mbid = ?2
            ",
            params![artist_mbid, release_mbid],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .context("Could not read MusicBrainz release-status timestamp")?;
    Ok(timestamp_is_newer(checked_at, existing.as_deref()))
}

fn release_group_snapshot_should_copy(
    conn: &Connection,
    artist_mbid: &str,
    fetched_at: &str,
    row_count: i64,
) -> Result<bool> {
    let existing = conn
        .query_row(
            "
            SELECT MAX(fetched_at), COUNT(*)
            FROM musicbrainz_artist_release_groups
            WHERE artist_mbid = ?1
            ",
            params![artist_mbid],
            |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, i64>(1)?)),
        )
        .context("Could not read MusicBrainz release-group snapshot timestamp")?;

    Ok(match existing.0 {
        None => true,
        Some(existing_fetched_at) => {
            fetched_at > existing_fetched_at.as_str()
                || fetched_at == existing_fetched_at && row_count != existing.1
        }
    })
}

fn source_artist_tombstone_blocks_link(
    conn: &Connection,
    local_artist_key: &str,
    updated_at: &str,
) -> Result<bool> {
    let tombstone = artist_tombstone_timestamp(conn, local_artist_key)?;
    Ok(timestamp_is_at_least(tombstone.as_deref(), updated_at))
}

fn dest_artist_tombstone_blocks_link(
    conn: &Connection,
    local_artist_key: &str,
    updated_at: &str,
) -> Result<bool> {
    let tombstone = artist_tombstone_timestamp(conn, local_artist_key)?;
    Ok(timestamp_is_at_least(tombstone.as_deref(), updated_at))
}

fn source_release_decision_tombstone_blocks(
    conn: &Connection,
    local_artist_key: &str,
    release_mbid: &str,
    updated_at: &str,
) -> Result<bool> {
    let tombstone = release_decision_tombstone_timestamp(conn, local_artist_key, release_mbid)?;
    Ok(timestamp_is_at_least(tombstone.as_deref(), updated_at))
}

fn dest_release_decision_tombstone_blocks(
    conn: &Connection,
    local_artist_key: &str,
    release_mbid: &str,
    updated_at: &str,
) -> Result<bool> {
    let tombstone = release_decision_tombstone_timestamp(conn, local_artist_key, release_mbid)?;
    Ok(timestamp_is_at_least(tombstone.as_deref(), updated_at))
}

fn artist_link_timestamp(conn: &Connection, local_artist_key: &str) -> Result<Option<String>> {
    conn.query_row(
        "
        SELECT updated_at
        FROM musicbrainz_artist_links
        WHERE local_artist_key = ?1
        ",
        params![local_artist_key],
        |row| row.get(0),
    )
    .optional()
    .context("Could not read MusicBrainz artist-link timestamp")
}

fn artist_tombstone_timestamp(conn: &Connection, local_artist_key: &str) -> Result<Option<String>> {
    conn.query_row(
        "
        SELECT updated_at
        FROM musicbrainz_artist_link_tombstones
        WHERE local_artist_key = ?1
        ",
        params![local_artist_key],
        |row| row.get(0),
    )
    .optional()
    .context("Could not read MusicBrainz artist unlink timestamp")
}

fn release_decision_timestamp(
    conn: &Connection,
    local_artist_key: &str,
    release_mbid: &str,
) -> Result<Option<String>> {
    conn.query_row(
        "
        SELECT updated_at
        FROM musicbrainz_release_decisions
        WHERE local_artist_key = ?1 AND release_mbid = ?2
        ",
        params![local_artist_key, release_mbid],
        |row| row.get(0),
    )
    .optional()
    .context("Could not read MusicBrainz release-decision timestamp")
}

fn release_decision_tombstone_timestamp(
    conn: &Connection,
    local_artist_key: &str,
    release_mbid: &str,
) -> Result<Option<String>> {
    conn.query_row(
        "
        SELECT updated_at
        FROM musicbrainz_release_decision_tombstones
        WHERE local_artist_key = ?1 AND release_mbid = ?2
        ",
        params![local_artist_key, release_mbid],
        |row| row.get(0),
    )
    .optional()
    .context("Could not read MusicBrainz release-decision clear timestamp")
}

fn ensure_artist_link_for_release_decision(
    conn: &Connection,
    local_artist_key: &str,
    updated_at: &str,
) -> Result<()> {
    if artist_link_timestamp(conn, local_artist_key)?.is_some() {
        return Ok(());
    }

    conn.execute(
        "
        INSERT INTO musicbrainz_artist_links (
            local_artist_key, display_artist, mbid, canonical_name, match_method,
            confidence, verification_state, ignored, created_at, updated_at
        ) VALUES (
            ?1, ?1, NULL, NULL, 'release-decision', NULL, 'unverified', 0, ?2, ?2
        )
        ON CONFLICT(local_artist_key) DO NOTHING
        ",
        params![local_artist_key, updated_at],
    )
    .context("Could not create placeholder MusicBrainz artist link for release decision")?;
    Ok(())
}

fn timestamp_is_newer(source: &str, existing: Option<&str>) -> bool {
    match existing {
        Some(existing) => source > existing,
        None => true,
    }
}

fn timestamp_is_at_least(candidate: Option<&str>, reference: &str) -> bool {
    candidate
        .map(|candidate| candidate >= reference)
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_copies_artist_link_and_release_decision_between_databases() {
        let source = test_app_connection();
        source
            .execute(
                "
                INSERT INTO musicbrainz_artist_links (
                    local_artist_key, display_artist, mbid, canonical_name, match_method,
                    confidence, verification_state, ignored, created_at, updated_at
                ) VALUES (
                    'pet shop boys', 'Pet Shop Boys',
                    '012151a8-0f9a-44c9-997f-ebd68b5389f9', 'Pet Shop Boys',
                    'manual-mbid', 1.0, 'verified', 0,
                    '2026-07-06T10:00:00Z', '2026-07-06T10:00:00Z'
                )
                ",
                [],
            )
            .expect("insert source artist link");
        source
            .execute(
                "
                INSERT INTO musicbrainz_release_decisions (
                    local_artist_key, release_mbid, decision, local_album_id, created_at, updated_at
                ) VALUES (
                    'pet shop boys', 'release-please', 'not-in-scope', NULL,
                    '2026-07-06T10:01:00Z', '2026-07-06T10:01:00Z'
                )
                ",
                [],
            )
            .expect("insert source release decision");

        let sync_path = temp_sync_path("copy");
        sync_for_connection(&source, &sync_path.display().to_string()).expect("export source");

        let dest = test_app_connection();
        let result =
            sync_for_connection(&dest, &sync_path.display().to_string()).expect("import dest");

        assert_eq!(result.artist_links_imported, 1);
        assert_eq!(result.release_decisions_imported, 1);
        assert_eq!(
            dest.query_row(
                "SELECT mbid FROM musicbrainz_artist_links WHERE local_artist_key = 'pet shop boys'",
                [],
                |row| row.get::<_, String>(0)
            )
            .expect("read copied artist link"),
            "012151a8-0f9a-44c9-997f-ebd68b5389f9"
        );
        assert_eq!(
            dest.query_row(
                "SELECT decision FROM musicbrainz_release_decisions WHERE local_artist_key = 'pet shop boys'",
                [],
                |row| row.get::<_, String>(0)
            )
            .expect("read copied release decision"),
            "not-in-scope"
        );
    }

    #[test]
    fn sync_copies_unlink_tombstones_and_deletes_stale_artist_links() {
        let sync_path = temp_sync_path("unlink");
        fs::create_dir_all(sync_path.parent().expect("sync path parent"))
            .expect("create sync parent");
        let sync_conn = Connection::open(&sync_path).expect("open sync db");
        configure_sync_connection(&sync_conn).expect("configure sync db");
        ensure_overlay_schema(&sync_conn).expect("sync schema");
        sync_conn
            .execute(
                "
                INSERT INTO musicbrainz_artist_links (
                    local_artist_key, display_artist, mbid, canonical_name, match_method,
                    confidence, verification_state, ignored, created_at, updated_at
                ) VALUES (
                    'pet shop boys', 'Pet Shop Boys',
                    '012151a8-0f9a-44c9-997f-ebd68b5389f9', 'Pet Shop Boys',
                    'manual-mbid', 1.0, 'verified', 0,
                    '2026-07-06T10:00:00Z', '2026-07-06T10:00:00Z'
                )
                ",
                [],
            )
            .expect("insert stale sync artist link");
        sync_conn
            .execute(
                "
                INSERT INTO musicbrainz_artist_link_tombstones (
                    local_artist_key, display_artist, updated_at
                ) VALUES (
                    'pet shop boys', 'Pet Shop Boys', '2026-07-06T10:05:00Z'
                )
                ",
                [],
            )
            .expect("insert sync unlink marker");

        let dest = test_app_connection();
        dest.execute(
            "
            INSERT INTO musicbrainz_artist_links (
                local_artist_key, display_artist, mbid, canonical_name, match_method,
                confidence, verification_state, ignored, created_at, updated_at
            ) VALUES (
                'pet shop boys', 'Pet Shop Boys',
                '012151a8-0f9a-44c9-997f-ebd68b5389f9', 'Pet Shop Boys',
                'manual-mbid', 1.0, 'verified', 0,
                '2026-07-06T10:00:00Z', '2026-07-06T10:00:00Z'
            )
            ",
            [],
        )
        .expect("insert stale local artist link");

        let result =
            sync_for_connection(&dest, &sync_path.display().to_string()).expect("sync tombstone");

        assert_eq!(result.artist_unlinks_imported, 1);
        let link_count: i64 = dest
            .query_row(
                "SELECT COUNT(*) FROM musicbrainz_artist_links WHERE local_artist_key = 'pet shop boys'",
                [],
                |row| row.get(0),
            )
            .expect("count artist links");
        assert_eq!(link_count, 0);
    }

    #[test]
    fn sync_can_skip_noop_log_entries() {
        let conn = test_app_connection();
        let sync_path = temp_sync_path("noop-log");

        let result =
            sync_for_connection_with_options(&conn, &sync_path.display().to_string(), false)
                .expect("sync without noop log");

        assert_eq!(result.changed_count, 0);
        let log_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM musicbrainz_overlay_sync_log",
                [],
                |row| row.get(0),
            )
            .expect("count sync log rows");
        assert_eq!(log_count, 0);
    }

    fn test_app_connection() -> Connection {
        let conn = Connection::open_in_memory().expect("open test app db");
        db::configure(&conn).expect("configure test app db");
        db::migrate(&conn).expect("migrate test app db");
        conn
    }

    fn temp_sync_path(label: &str) -> PathBuf {
        let unique = format!(
            "{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        );
        std::env::temp_dir()
            .join(format!("musicbrainz-overlay-sync-{label}-{unique}"))
            .join("sync.sqlite3")
    }
}
