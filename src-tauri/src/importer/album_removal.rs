//! Album-sized removal plans. Retained tracks never enter import staging.
use super::*;
use rusqlite::types::ValueRef;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AlbumRemovalScope {
    pub album_id: String,
    pub source_path: String,
    pub destination_path: String,
    pub digest: String,
    pub track_ids: Vec<i64>,
    pub artist: String,
    pub album: String,
    pub year: String,
    pub rated_tracks: u32,
    pub loved_tracks: u32,
}

// Hash complete stored rows, including NULLs and types, rather than trusting row_hash alone.
fn hash_rows(
    conn: &Connection,
    sql: &str,
    parameter: impl rusqlite::ToSql,
    digest: &mut Sha256,
) -> Result<usize> {
    digest.update(sql.as_bytes());
    let mut statement = conn.prepare(sql)?;
    let columns = statement.column_count();
    let mut rows = statement.query([parameter])?;
    let mut count = 0;
    while let Some(row) = rows.next()? {
        count += 1;
        digest.update([0xff]);
        for column in 0..columns {
            match row.get_ref(column)? {
                ValueRef::Null => digest.update([0]),
                ValueRef::Integer(value) => {
                    digest.update([1]);
                    digest.update(value.to_le_bytes());
                }
                ValueRef::Real(value) => {
                    digest.update([2]);
                    digest.update(value.to_bits().to_le_bytes());
                }
                ValueRef::Text(value) | ValueRef::Blob(value) => {
                    digest.update([if matches!(row.get_ref(column)?, ValueRef::Text(_)) {
                        3
                    } else {
                        4
                    }]);
                    digest.update((value.len() as u64).to_le_bytes());
                    digest.update(value);
                }
            }
        }
    }
    digest.update((count as u64).to_le_bytes());
    Ok(count)
}

fn read_scope(
    conn: &Connection,
    album_id: &str,
    source: &str,
    destination: &str,
) -> Result<AlbumRemovalScope> {
    let album = load_scoped_album(conn, album_id)?.previous;
    let mut digest = Sha256::new();
    if hash_rows(
        conn,
        "SELECT * FROM albums WHERE id = ?1",
        album_id,
        &mut digest,
    )? != 1
    {
        bail!("The selected album is no longer present in Music Library");
    }
    let track_count = hash_rows(
        conn,
        "SELECT * FROM tracks WHERE album_id = ?1 ORDER BY id",
        album_id,
        &mut digest,
    )?;
    let tracks = conn
        .prepare("SELECT id, file_path, filename FROM tracks WHERE album_id = ?1 ORDER BY id")?
        .query_map([album_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if tracks.is_empty()
        || tracks.len() != track_count
        || track_count != album.total_tracks as usize
    {
        bail!("The selected album's catalog track count is inconsistent");
    }
    for (id, directory, filename) in &tracks {
        if !scoped_path_is_within_folder(directory, Path::new(source)) {
            bail!("The selected album has tracks outside its reviewed source folder");
        }
        let identity_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM tracks WHERE file_path=?1 AND filename=?2",
            params![directory, filename],
            |row| row.get(0),
        )?;
        if identity_count != 1 {
            bail!("The selected album shares a duplicate file identity in the catalog");
        }
        // Raw/normalized identity alignment is checked before using the primary-key delete.
        let matches: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM raw_tracks WHERE id=?1 AND file_path IS ?2 AND filename IS ?3)",
            params![id, directory, filename], |row| row.get(0))?;
        if !matches {
            bail!("The selected album's raw catalog identities need repair before removal");
        }
        hash_rows(
            conn,
            "SELECT * FROM raw_tracks WHERE id = ?1",
            *id,
            &mut digest,
        )?;
    }
    Ok(AlbumRemovalScope {
        album_id: album_id.to_owned(),
        source_path: source.to_owned(),
        destination_path: destination.to_owned(),
        digest: hex::encode(digest.finalize()),
        track_ids: tracks.into_iter().map(|track| track.0).collect(),
        artist: album.album_artist_display.unwrap_or_default(),
        album: album.album.unwrap_or_default(),
        year: album.year.map(|year| year.to_string()).unwrap_or_default(),
        rated_tracks: album.rated_tracks,
        loved_tracks: album.loved_tracks,
    })
}

pub(crate) fn prepare_album_removal(
    conn: &mut Connection,
    album_id: &str,
    source: &str,
    destination: &str,
    marker: &Path,
) -> Result<(i64, AlbumRemovalScope)> {
    let _workflow_guard = ImportWorkflowGuard::acquire()?;
    let tx = conn.transaction()?;
    let scope = read_scope(&tx, album_id, source, destination)?;
    let bytes = serde_json::to_vec(&scope)?;
    if let Some(parent) = marker.parent() {
        fs::create_dir_all(parent)?;
    }
    use std::io::Write;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(marker)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    let fingerprint = source_fingerprint(marker.to_string_lossy().as_ref())?;
    let now = Utc::now().to_rfc3339();
    // Ordinary import APIs only accept 'ready'; they cannot apply this non-TSV session.
    tx.execute("INSERT INTO import_sessions (source_path,source_size_bytes,source_modified_ms,status,removed_tracks,removed_albums,created_at,updated_at) VALUES (?1,?2,?3,'removal-ready',?4,1,?5,?5)",
        params![marker.to_string_lossy(), fingerprint.size_bytes, fingerprint.modified_ms, scope.track_ids.len() as i64, now])?;
    let id = tx.last_insert_rowid();
    tx.commit()?;
    Ok((id, scope))
}

pub(crate) fn validate_album_removal(
    conn: &Connection,
    marker: &Path,
    expected: &AlbumRemovalScope,
) -> Result<()> {
    let stored: AlbumRemovalScope = serde_json::from_slice(&fs::read(marker)?)?;
    if &stored != expected
        || read_scope(
            conn,
            &expected.album_id,
            &expected.source_path,
            &expected.destination_path,
        )? != *expected
    {
        bail!("The selected album changed after preview. Prepare the removal again");
    }
    Ok(())
}

pub(crate) fn apply_album_removal(
    conn: &mut Connection,
    db_path: &Path,
    session_id: i64,
    scope: &AlbumRemovalScope,
    progress: &mut impl FnMut(&str, &str),
) -> Result<BridgeImportSummary> {
    let _workflow_guard = ImportWorkflowGuard::acquire()?;
    let started = Instant::now();
    let session = load_import_session(conn, session_id)?;
    if session.status != "removal-ready"
        || session.removed_tracks != scope.track_ids.len() as i64
        || session.removed_albums != 1
    {
        bail!("Prepare the album removal before applying it");
    }
    validate_album_removal(conn, Path::new(&session.source_path), scope)?;
    progress("backingUp", "Preserving the catalog recovery backup.");
    let settings = db::settings_for_connection(conn)?;
    // A complete checkpoint plus an unchanged data version under the acquired writer
    // lock makes a fast main-file copy a consistent snapshot, including committed WAL.
    let version = scoped_sync_data_version(conn)?;
    let (busy, frames, checkpointed): (i64, i64, i64) =
        conn.query_row("PRAGMA wal_checkpoint(FULL)", [], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;
    if busy != 0 || frames != checkpointed {
        bail!("Music Library database is locked by another operation; retry the removal after it finishes");
    }
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    if scoped_sync_data_version(&tx)? != version {
        bail!(
            "The catalog changed while its recovery backup was being prepared; retry the removal"
        );
    }
    validate_album_removal(&tx, Path::new(&session.source_path), scope)?;
    let backup = create_removal_backup(
        &tx,
        db_path,
        &scope.source_path,
        session.source_size_bytes,
        settings.backup_retention as usize,
    )?;
    let backup_path = backup.map(|path| path.display().to_string());
    progress(
        "cataloging",
        "Removing the selected album from the catalog atomically.",
    );
    // Repeat the complete album-sized comparison while holding SQLite's write lock.
    validate_album_removal(&tx, Path::new(&session.source_path), scope)?;
    let previous = load_scoped_album(&tx, &scope.album_id)?.previous;
    let now = Utc::now().to_rfc3339();
    tx.execute("INSERT INTO import_runs (source_path,source_size_bytes,started_at,status,backup_path,added_tracks,changed_tracks,removed_tracks,added_albums,changed_albums,removed_albums) VALUES (?1,?2,?3,'running',?4,0,0,?5,0,0,1)",
        params![scope.source_path, session.source_size_bytes, now, backup_path, scope.track_ids.len() as i64])?;
    let run_id = tx.last_insert_rowid();
    let (album_chart_links, track_chart_links, chart_cache_current) =
        db::album_removal_chart_state(&tx, &scope.album_id)?;
    progress(
        "searchIndex",
        "Removing the selected album's search entries.",
    );
    for id in &scope.track_ids {
        if tx.execute("DELETE FROM raw_tracks WHERE id=?1", [id])? != 1 {
            bail!("A reviewed raw track disappeared before removal");
        }
    }
    remove_track_search_rows(&tx, scope)?;
    tx.execute(
        "DELETE FROM album_search_fts WHERE album_id=?1",
        [&scope.album_id],
    )?;
    progress(
        "catalogRows",
        "Removing the selected album's catalog records.",
    );
    if tx.execute("DELETE FROM tracks WHERE album_id=?1", [&scope.album_id])?
        != scope.track_ids.len()
    {
        bail!("The removed track count changed");
    }
    if tx.execute("DELETE FROM albums WHERE id=?1", [&scope.album_id])? != 1 {
        bail!("The reviewed album disappeared before removal");
    }
    let events = rating_event_for_removed_album(&previous)
        .into_iter()
        .collect::<Vec<_>>();
    insert_rating_events(&tx, run_id, &events)?;
    insert_library_updates(
        &tx,
        run_id,
        &scope.source_path,
        &[library_update_for_removed_album(&previous)],
    )?;
    progress("statistics", "Updating library totals and rating history.");
    let (track_count, album_count) = insert_rating_snapshot_from_catalog(&tx, run_id)?;
    progress("charts", "Updating affected chart links.");
    if album_chart_links {
        db::reconcile_album_chart_matches(&tx)?;
    } else if chart_cache_current {
        db::record_album_chart_match_state(&tx)?;
    }
    // Unrelated stale chart state remains stale for the existing chart-rebuild flow;
    // removal must neither claim it is current nor rebuild the entire catalog for it.
    if track_chart_links {
        db::reconcile_track_chart_matches(&tx)?;
    }
    let completed = Utc::now().to_rfc3339();
    tx.execute("UPDATE import_runs SET status='completed',completed_at=?1,track_rows=?2,album_count=?3,duration_ms=?4,rating_events_count=?5 WHERE id=?6",
        params![completed,track_count,album_count,started.elapsed().as_millis() as i64,events.len() as i64,run_id])?;
    tx.execute("UPDATE import_sessions SET status='completed',updated_at=?1,completed_at=?1,import_run_id=?2,track_rows=?3,album_count=?4 WHERE id=?5",
        params![completed,run_id,track_count,album_count,session_id])?;
    progress("committing", "Committing the verified album removal.");
    tx.commit()?;
    // Removal cannot newly satisfy a wishlist entry. Smart playlist loading and Plex sync
    // already reevaluate their rules against the current catalog, so do not run every
    // playlist query synchronously before the source folder can be finalized.
    // Keep the small reviewed marker for durable session binding and idempotent recovery.
    Ok(BridgeImportSummary {
        import_run_id: run_id,
        backup_path,
    })
}

fn create_removal_backup(
    conn: &Transaction<'_>,
    db_path: &Path,
    source: &str,
    size: i64,
    retention: usize,
) -> Result<Option<PathBuf>> {
    if !db_path.exists() {
        return Ok(None);
    }
    let directory = db_path
        .parent()
        .ok_or_else(|| anyhow!("Database path has no parent"))?
        .join("backups");
    fs::create_dir_all(&directory)?;
    let sequence = BACKUP_FILENAME_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let path = directory.join(format!(
        "music-library-{}-{:08x}-{sequence:016x}-before-import.sqlite3",
        Utc::now().format("%Y%m%d-%H%M%S-%9f"),
        std::process::id()
    ));
    let temporary = path.with_extension("sqlite3.partial");
    let file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    let result = (|| -> Result<()> {
        // Use the platform's file-copy implementation (CopyFileEx on Windows), rather
        // than hundreds of thousands of small userspace reads and writes for large catalogs.
        fs::copy(db_path, &temporary)?;
        file.sync_all()?;
        Ok(())
    })();
    drop(file);
    if let Err(error) = result {
        let _ = fs::remove_file(&temporary);
        return Err(error.context("Could not preserve the album removal recovery backup"));
    }
    fs::rename(&temporary, &path).context("Could not publish the completed removal backup")?;
    conn.execute("INSERT INTO database_backups (created_at,operation,source_path,source_size_bytes,backup_path) VALUES (?1,'import',?2,?3,?4)",
        params![Utc::now().to_rfc3339(), source, size, path.to_string_lossy()])?;
    enforce_backup_retention(&directory, retention)?;
    Ok(Some(path))
}

fn remove_track_search_rows(conn: &Connection, scope: &AlbumRemovalScope) -> Result<()> {
    let titles = conn
        .prepare("SELECT DISTINCT COALESCE(album,'') FROM tracks WHERE album_id=?1")?
        .query_map([&scope.album_id], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut found = std::collections::BTreeMap::new();
    let mut indexed = !titles.is_empty();
    for title in titles {
        if title.contains('\0') || !title.chars().any(char::is_alphanumeric) {
            indexed = false;
            break;
        }
        let query = format!("album : \"{}\"", title.replace('"', "\"\""));
        let rows = conn.prepare("SELECT rowid,track_id FROM track_search_fts WHERE track_search_fts MATCH ?1 AND album_id=?2")?
            .query_map(params![query,scope.album_id], |row| Ok((row.get::<_,i64>(0)?,row.get::<_,i64>(1)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        found.extend(rows);
    }
    let ids = found.values().copied().collect::<HashSet<_>>();
    let expected = scope.track_ids.iter().copied().collect::<HashSet<_>>();
    if indexed && ids == expected {
        for rowid in found.keys() {
            conn.execute("DELETE FROM track_search_fts WHERE rowid=?1", [rowid])?;
        }
    } else {
        // Older or stale indexes (including names without searchable tokens) retain the
        // exhaustive path. Never assume that an FTS rowid equals its catalog track id.
        conn.execute(
            "DELETE FROM track_search_fts WHERE album_id=?1",
            [&scope.album_id],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture {
        _temp: tempfile::TempDir,
        conn: Connection,
        db: PathBuf,
        source: String,
        marker: PathBuf,
        album_id: String,
    }
    fn fixture() -> Fixture {
        let temp = tempfile::tempdir().unwrap();
        let db = temp.path().join("catalog.sqlite3");
        let mut conn = Connection::open(&db).unwrap();
        db::configure(&conn).unwrap();
        db::migrate(&conn).unwrap();
        let tsv = temp.path().join("seed.tsv");
        let row = |album: &str| {
            [
                "Artist",
                "",
                "1",
                album,
                "Rock",
                "L",
                "Label",
                "4",
                "Song",
                "1",
                "2026",
                "2026",
                album,
                temp.path().join(album).to_str().unwrap(),
                "01.mp3",
                "Artist",
                "3:00",
            ]
            .join("\t")
        };
        fs::write(
            &tsv,
            format!(
                "{}\n{}\n{}\n",
                REQUIRED_COLUMNS.join("\t"),
                row("Keep"),
                row("Remove")
            ),
        )
        .unwrap();
        let preview = prepare_bridge_import_preview(&mut conn, &tsv).unwrap();
        apply_bridge_import_preview(
            &mut conn,
            &temp.path().join("absent.sqlite3"),
            preview.session_id,
        )
        .unwrap();
        let album_id = conn
            .query_row("SELECT id FROM albums WHERE album='Remove'", [], |row| {
                row.get(0)
            })
            .unwrap();
        Fixture {
            source: temp.path().join("Remove").display().to_string(),
            marker: temp.path().join("removal.json"),
            _temp: temp,
            conn,
            db,
            album_id,
        }
    }
    fn preview(f: &mut Fixture) -> (i64, AlbumRemovalScope) {
        prepare_album_removal(
            &mut f.conn,
            &f.album_id,
            &f.source,
            "removed-destination",
            &f.marker,
        )
        .unwrap()
    }
    fn retained(conn: &Connection) -> String {
        let mut hash = Sha256::new();
        hash_rows(
            conn,
            "SELECT * FROM tracks WHERE album = ?1 ORDER BY id",
            "Keep",
            &mut hash,
        )
        .unwrap();
        hash_rows(
            conn,
            "SELECT * FROM raw_tracks WHERE album = ?1 ORDER BY id",
            "Keep",
            &mut hash,
        )
        .unwrap();
        hex::encode(hash.finalize())
    }

    #[test]
    fn scoped_removal_preserves_other_edits_and_creates_restorable_wal_backup() {
        let mut f = fixture();
        let (session, scope) = preview(&mut f);
        assert_eq!(
            f.conn
                .query_row::<i64, _, _>(
                    "SELECT COUNT(*) FROM import_stage_tracks WHERE session_id=?1",
                    [session],
                    |r| r.get(0)
                )
                .unwrap(),
            0
        );
        assert!(fs::metadata(&f.marker).unwrap().len() < 2048);
        // Unrelated edits need not invalidate a removal, and must survive it byte-for-byte.
        f.conn
            .execute(
                "UPDATE tracks SET title='New unrelated title' WHERE album='Keep'",
                [],
            )
            .unwrap();
        let before = retained(&f.conn);
        assert!(apply_bridge_import_preview(&mut f.conn, &f.db, session).is_err());
        let mut phases = Vec::new();
        let result = apply_album_removal(&mut f.conn, &f.db, session, &scope, &mut |stage, _| {
            phases.push(stage.to_owned())
        })
        .unwrap();
        assert_eq!(retained(&f.conn), before);
        assert_eq!(
            phases,
            [
                "backingUp",
                "cataloging",
                "searchIndex",
                "catalogRows",
                "statistics",
                "charts",
                "committing"
            ]
        );
        assert_eq!(
            f.conn
                .query_row::<i64, _, _>(
                    "SELECT COUNT(*) FROM tracks WHERE album='Remove'",
                    [],
                    |r| r.get(0)
                )
                .unwrap(),
            0
        );
        assert_eq!(
            f.conn
                .query_row::<i64, _, _>(
                    "SELECT COUNT(*) FROM track_search_fts WHERE album_id=?1",
                    [&f.album_id],
                    |r| r.get(0)
                )
                .unwrap(),
            0
        );
        assert_eq!(
            bridge_session_state(&f.conn, session)
                .unwrap()
                .import_run_id,
            Some(result.import_run_id)
        );
        let backup = Connection::open(result.backup_path.unwrap()).unwrap();
        db::configure(&backup).unwrap();
        assert_eq!(
            backup
                .query_row::<String, _, _>("PRAGMA integrity_check", [], |r| r.get(0))
                .unwrap(),
            "ok"
        );
        assert_eq!(
            backup
                .query_row::<i64, _, _>("SELECT COUNT(*) FROM tracks", [], |r| r.get(0))
                .unwrap(),
            2
        );
        assert_eq!(retained(&backup), before);
        assert!(apply_album_removal(&mut f.conn, &f.db, session, &scope, &mut |_, _| {}).is_err());
    }

    #[test]
    fn selected_row_changes_are_rejected_even_without_row_hash_changes() {
        let mut f = fixture();
        let (session, scope) = preview(&mut f);
        f.conn
            .execute(
                "UPDATE tracks SET title='Changed after review' WHERE album='Remove'",
                [],
            )
            .unwrap();
        assert!(validate_album_removal(&f.conn, &f.marker, &scope).is_err());
        assert!(apply_album_removal(&mut f.conn, &f.db, session, &scope, &mut |_, _| {}).is_err());
        assert_eq!(
            f.conn
                .query_row::<i64, _, _>("SELECT COUNT(*) FROM tracks", [], |r| r.get(0))
                .unwrap(),
            2
        );
    }

    #[test]
    fn transaction_failure_restores_all_rows_and_allows_safe_retry() {
        let mut f = fixture();
        let (session, scope) = preview(&mut f);
        f.conn.execute_batch("CREATE TRIGGER reject_removal BEFORE DELETE ON albums BEGIN SELECT RAISE(ABORT, 'injected failure'); END;").unwrap();
        assert!(apply_album_removal(&mut f.conn, &f.db, session, &scope, &mut |_, _| {}).is_err());
        validate_album_removal(&f.conn, &f.marker, &scope).unwrap();
        assert_eq!(
            bridge_session_state(&f.conn, session).unwrap().status,
            "removal-ready"
        );
        assert_eq!(
            f.conn
                .query_row::<i64, _, _>("SELECT COUNT(*) FROM track_search_fts", [], |r| r.get(0))
                .unwrap(),
            2
        );
        f.conn
            .execute_batch("DROP TRIGGER reject_removal;")
            .unwrap();
        apply_album_removal(&mut f.conn, &f.db, session, &scope, &mut |_, _| {}).unwrap();
    }

    #[test]
    fn scoped_removal_relinks_affected_charts_to_retained_recordings() {
        let mut f = fixture();
        f.conn.execute_batch("INSERT INTO vg_lista_single_chart_entries
            (source_file,year,week,rank,artist,title,artist_key,title_key,week_date,week_key,matched_track_id,imported_at)
            SELECT 'test',2026,1,1,'Artist','Song','artist','song','2026-01-01','2026-W01',id,'now' FROM tracks WHERE album='Remove';").unwrap();
        let keep_id: i64 = f
            .conn
            .query_row("SELECT id FROM tracks WHERE album='Keep'", [], |r| r.get(0))
            .unwrap();
        let (session, scope) = preview(&mut f);
        apply_album_removal(&mut f.conn, &f.db, session, &scope, &mut |_, _| {}).unwrap();
        assert_eq!(
            f.conn
                .query_row::<i64, _, _>(
                    "SELECT matched_track_id FROM vg_lista_single_chart_entries",
                    [],
                    |r| r.get(0)
                )
                .unwrap(),
            keep_id
        );
    }

    #[test]
    fn unrelated_stale_chart_state_is_not_marked_current() {
        let mut f = fixture();
        f.conn
            .execute(
                "UPDATE chart_album_match_state SET reconciled_import_run_id=-1",
                [],
            )
            .unwrap();
        let (session, scope) = preview(&mut f);
        apply_album_removal(&mut f.conn, &f.db, session, &scope, &mut |_, _| {}).unwrap();
        assert_eq!(f.conn.query_row::<i64,_,_>("SELECT COUNT(*) FROM chart_album_match_state WHERE reconciled_import_run_id=-1", [], |r|r.get(0)).unwrap(), 3);
    }

    #[test]
    fn stale_search_text_uses_safe_fallback_without_removing_other_search_rows() {
        let mut f = fixture();
        f.conn
            .execute(
                "UPDATE track_search_fts SET album='outdated title' WHERE album_id=?1",
                [&f.album_id],
            )
            .unwrap();
        let (session, scope) = preview(&mut f);
        apply_album_removal(&mut f.conn, &f.db, session, &scope, &mut |_, _| {}).unwrap();
        assert_eq!(
            f.conn
                .query_row::<i64, _, _>(
                    "SELECT COUNT(*) FROM track_search_fts WHERE album_id=?1",
                    [&f.album_id],
                    |r| r.get(0)
                )
                .unwrap(),
            0
        );
        assert_eq!(
            f.conn
                .query_row::<String, _, _>("SELECT album FROM track_search_fts", [], |r| r.get(0))
                .unwrap(),
            "Keep"
        );
    }

    #[test]
    fn writer_lock_protects_the_checkpointed_backup_and_removal() {
        let mut f = fixture();
        let (session, scope) = preview(&mut f);
        let other = Connection::open(&f.db).unwrap();
        db::configure(&other).unwrap();
        other
            .busy_timeout(std::time::Duration::from_millis(10))
            .unwrap();
        apply_album_removal(&mut f.conn, &f.db, session, &scope, &mut |stage, _| {
            if stage == "cataloging" {
                let error = other
                    .execute(
                        "UPDATE tracks SET title='Concurrent write' WHERE album='Keep'",
                        [],
                    )
                    .unwrap_err();
                assert_eq!(
                    error.sqlite_error_code(),
                    Some(rusqlite::ErrorCode::DatabaseBusy)
                );
            }
        })
        .unwrap();
        other
            .execute(
                "UPDATE tracks SET title='After removal' WHERE album='Keep'",
                [],
            )
            .unwrap();
    }

    #[test]
    fn changes_before_the_backup_lock_are_rechecked() {
        let mut f = fixture();
        let (session, scope) = preview(&mut f);
        let other = Connection::open(&f.db).unwrap();
        let error = apply_album_removal(&mut f.conn, &f.db, session, &scope, &mut |stage, _| {
            if stage == "backingUp" {
                other
                    .execute(
                        "UPDATE raw_tracks SET title='Concurrent raw edit' WHERE album='Remove'",
                        [],
                    )
                    .unwrap();
            }
        })
        .unwrap_err();
        assert!(error.to_string().contains("changed after preview"));
        assert_eq!(
            f.conn
                .query_row::<i64, _, _>("SELECT COUNT(*) FROM tracks", [], |r| r.get(0))
                .unwrap(),
            2
        );
    }

    #[test]
    #[ignore = "Requires an explicitly prepared disposable full-size catalog copy and album id"]
    fn benchmark_full_size_disposable_catalog() {
        let db = PathBuf::from(
            std::env::var_os("AURORA_REMOVAL_BENCH_DB").expect("disposable catalog copy"),
        );
        assert_eq!(
            db.file_name().unwrap(),
            "aurora-removal-benchmark.sqlite3",
            "Never benchmark by mutating a live catalog"
        );
        let album_id = std::env::var("AURORA_REMOVAL_BENCH_ALBUM").expect("album id in copy");
        let mut conn = Connection::open(&db).unwrap();
        db::configure(&conn).unwrap();
        let source: String = conn
            .query_row(
                "SELECT file_path FROM tracks WHERE album_id=?1 LIMIT 1",
                [&album_id],
                |r| r.get(0),
            )
            .unwrap();
        let marker = db.with_extension("removal.json");
        let started = Instant::now();
        let (session, scope) = prepare_album_removal(
            &mut conn,
            &album_id,
            &source,
            "benchmark-only-no-files-moved",
            &marker,
        )
        .unwrap();
        eprintln!(
            "REMOVAL BENCH preview {:?}, tracks {}",
            started.elapsed(),
            scope.track_ids.len()
        );
        let mut last = Instant::now();
        let mut previous_stage = "validation".to_owned();
        let result = apply_album_removal(&mut conn, &db, session, &scope, &mut |stage, _| {
            eprintln!("REMOVAL BENCH {previous_stage}: {:?}", last.elapsed());
            previous_stage = stage.to_owned();
            last = Instant::now();
        })
        .unwrap();
        eprintln!(
            "REMOVAL BENCH {previous_stage}: {:?}; total {:?}; backup {:?}",
            last.elapsed(),
            started.elapsed(),
            result.backup_path
        );
        assert_eq!(
            conn.query_row::<i64, _, _>(
                "SELECT COUNT(*) FROM tracks WHERE album_id=?1",
                [&album_id],
                |r| r.get(0)
            )
            .unwrap(),
            0
        );
    }
}
