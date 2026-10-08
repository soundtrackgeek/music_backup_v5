//! Portable feature cache. Archives contain no catalog, paths, jobs or settings.
use anyhow::{bail, Context, Result};
use music_sonic_core::{Analysis, DIMENSIONS, PROFILE};
use rusqlite::{
    backup::{Backup, StepResult},
    params, Connection, OpenFlags, OptionalExtension,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

const MAGIC: &[u8; 8] = b"SONIC001";
const MAX_BYTES: u64 = 16 * 1024 * 1024 * 1024;
const MAX_ROWS: i64 = 20_000_000;
const PROFILES: &str =
    "CREATE TABLE sonic_profiles(profile TEXT PRIMARY KEY, weights TEXT NOT NULL)";
const AUDIO: &str = "CREATE TABLE sonic_audio(audio_hash TEXT NOT NULL, profile TEXT NOT NULL, features TEXT NOT NULL, PRIMARY KEY(audio_hash,profile))";
const APP_ID: i32 = 0x534f4e31;

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisBackup {
    pub path: String,
    pub created_at: String,
    pub archive_version: u32,
    pub profile: String,
    pub dimensions: u32,
    pub audio_count: i64,
    pub database_bytes: u64,
    pub sha256: String,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisRestore {
    pub added: i64,
    pub already_present: i64,
    pub safety_backup: Option<String>,
}

pub(crate) fn default_folder() -> Option<PathBuf> {
    for name in ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"] {
        if let Some(root) = std::env::var_os(name)
            .map(PathBuf::from)
            .filter(|p| p.is_absolute() && p.is_dir())
        {
            return Some(root.join("_musicbackup").join("sonic-analysis"));
        }
    }
    std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .map(|p| p.join("OneDrive"))
        .filter(|p| p.is_dir())
        .map(|p| p.join("_musicbackup").join("sonic-analysis"))
}

fn reader(path: &Path) -> Result<Connection> {
    let c = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    c.busy_timeout(Duration::from_secs(5))?;
    c.execute_batch("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;")?;
    Ok(c)
}

/// Pin the read view before copying. WAL writers cannot restart the backup.
fn snapshot(
    source: &Connection,
    destination: &mut Connection,
    mut report: impl FnMut(i64, i64) -> Result<()>,
) -> Result<()> {
    let read = source.unchecked_transaction()?;
    read.query_row("SELECT count(*) FROM sqlite_schema", [], |r| {
        r.get::<_, i64>(0)
    })?;
    {
        let backup = Backup::new(&read, destination)?;
        let start = Instant::now();
        let mut last = start;
        let mut most = 0;
        loop {
            let step = backup.step(256)?;
            let p = backup.progress();
            let copied = p.pagecount - p.remaining;
            if copied > most {
                most = copied;
                last = Instant::now();
            }
            report(i64::from(copied), i64::from(p.pagecount))?;
            if step == StepResult::Done {
                break;
            }
            if start.elapsed() > Duration::from_secs(1800)
                || last.elapsed() > Duration::from_secs(120)
            {
                bail!(
                    "Analysis snapshot exceeded its copy deadline ({copied}/{} pages)",
                    p.pagecount
                );
            }
            if matches!(step, StepResult::Busy | StepResult::Locked) {
                std::thread::sleep(Duration::from_millis(10));
            }
        }
    }
    drop(read);
    destination.execute_batch("PRAGMA journal_mode=DELETE;")?;
    integrity(destination)
}

fn integrity(c: &Connection) -> Result<()> {
    let value: String = c.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    if value != "ok" {
        bail!("Analysis archive failed SQLite integrity validation");
    }
    Ok(())
}

fn weights(c: &Connection) -> Result<Vec<f32>> {
    let json: String = c
        .query_row(
            "SELECT weights FROM sonic_profiles WHERE profile=?1 AND length(weights)<=65536",
            [PROFILE],
            |r| r.get(0),
        )
        .context("Archive has no compatible analysis profile")?;
    let weights: Vec<f32> = serde_json::from_str(&json)?;
    if weights.len() != DIMENSIONS * DIMENSIONS || weights.iter().any(|v| !v.is_finite()) {
        bail!("Invalid analysis weight matrix");
    }
    Ok(weights)
}

fn features(hash: &str, json: &str, weights: &[f32]) -> Result<Vec<f32>> {
    if hash.len() != 64
        || !hash
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        || json.len() > 65536
    {
        bail!("Invalid or oversized analysis fingerprint/features");
    }
    let values: Vec<f32> = serde_json::from_str(json)?;
    if !(Analysis {
        profile: PROFILE.into(),
        features: values.clone(),
        weights: weights.to_vec(),
    })
    .valid()
    {
        bail!("Invalid analysis feature vector");
    }
    Ok(values)
}

pub(crate) fn digest(path: &Path) -> Result<String> {
    let mut f = File::open(path)?;
    let mut hash = Sha256::new();
    let mut buffer = [0; 65536];
    loop {
        let n = f.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hash.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

pub(crate) fn export_at(dir: &Path, folder: &Path) -> Result<AnalysisBackup> {
    export_named_at(dir, folder, "analysis")
}

pub(crate) fn export_named_at(dir: &Path, folder: &Path, prefix: &str) -> Result<AnalysisBackup> {
    if prefix.is_empty()
        || !prefix
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        bail!("Invalid analysis backup name");
    }
    if !folder.is_absolute() {
        bail!("Choose an absolute backup folder, normally OneDrive/_musicbackup/sonic-analysis");
    }
    let guard = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(dir.join("sonic-backup.lock"))?;
    guard
        .try_lock()
        .context("An analysis backup is already being created; try again shortly")?;
    let source = reader(&dir.join("music-analysis.sqlite3"))
        .context("Analyze some music before backing up results")?;
    let file = tempfile::NamedTempFile::new_in(dir)?;
    let mut frozen = Connection::open(file.path())?;
    snapshot(&source, &mut frozen, |_, _| Ok(()))?;
    let version: i32 = frozen.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version != 1 {
        bail!("This analysis store needs a compatible Music Library version before export");
    }
    let w = weights(&frozen)?;
    let portable = tempfile::NamedTempFile::new_in(dir)?;
    let mut target = Connection::open(portable.path())?;
    target.execute_batch(&format!(
        "PRAGMA application_id={APP_ID}; PRAGMA user_version=1; {PROFILES}; {AUDIO};"
    ))?;
    let tx = target.transaction()?;
    tx.execute(
        "INSERT INTO sonic_profiles VALUES(?1,?2)",
        params![PROFILE, serde_json::to_string(&w)?],
    )?;
    let mut q = frozen.prepare(
        "SELECT audio_hash,features FROM sonic_audio WHERE profile=?1 ORDER BY audio_hash",
    )?;
    let mut rows = q.query([PROFILE])?;
    let mut count = 0;
    while let Some(row) = rows.next()? {
        let hash: String = row.get(0)?;
        let json: String = row.get(1)?;
        let f = features(&hash, &json, &w)?;
        tx.prepare_cached("INSERT INTO sonic_audio VALUES(?1,?2,?3)")?
            .execute(params![hash, PROFILE, serde_json::to_string(&f)?])?;
        count += 1;
        if count > MAX_ROWS {
            bail!("Analysis archive exceeds its result limit");
        }
    }
    if count == 0 {
        bail!("No completed compatible audio analysis to back up");
    }
    tx.commit()?;
    integrity(&target)?;
    drop(target);
    let size = portable.as_file().metadata()?.len();
    if size > MAX_BYTES {
        bail!("Analysis archive exceeds the 16 GiB limit");
    }
    let created = chrono::Utc::now();
    fs::create_dir_all(folder)?;
    let path = folder.join(format!(
        "{prefix}-{}-{}.sonic-backup",
        created.format("%Y%m%dT%H%M%S%.9fZ"),
        std::process::id()
    ));
    let info = AnalysisBackup {
        path: path.to_string_lossy().into(),
        created_at: created.to_rfc3339(),
        archive_version: 1,
        profile: PROFILE.into(),
        dimensions: DIMENSIONS as u32,
        audio_count: count,
        database_bytes: size,
        sha256: digest(portable.path())?,
    };
    // The published file is portable and does not record the source PC's path.
    let manifest = serde_json::to_vec(&AnalysisBackup {
        path: String::new(),
        ..info.clone()
    })?;
    let mut output = tempfile::NamedTempFile::new_in(folder)?;
    output.write_all(MAGIC)?;
    output.write_all(&(manifest.len() as u32).to_le_bytes())?;
    output.write_all(&manifest)?;
    std::io::copy(&mut portable.reopen()?, &mut output)?;
    output.as_file().sync_all()?;
    // Never overwrite an earlier or peer backup. Only a complete file is published.
    output.persist_noclobber(&path)?;
    Ok(info)
}

struct Staged {
    c: Connection,
    _file: tempfile::NamedTempFile,
    info: AnalysisBackup,
}
fn stage(dir: &Path, path: &Path) -> Result<Staged> {
    let mut source = File::open(path)
        .context("Could not open analysis backup; make it available offline in OneDrive")?;
    let length = source.metadata()?.len();
    let mut magic = [0; 8];
    source.read_exact(&mut magic)?;
    if &magic != MAGIC {
        bail!("This is not a version 1 sonic analysis backup");
    }
    let mut len = [0; 4];
    source.read_exact(&mut len)?;
    let len = u32::from_le_bytes(len) as usize;
    if len == 0 || len > 65536 {
        bail!("Invalid analysis archive manifest length");
    }
    let mut json = vec![0; len];
    source.read_exact(&mut json)?;
    let mut info: AnalysisBackup = serde_json::from_slice(&json)?;
    if info.archive_version != 1
        || info.profile != PROFILE
        || info.dimensions != DIMENSIONS as u32
        || !(1..=MAX_ROWS).contains(&info.audio_count)
        || !(1..=MAX_BYTES).contains(&info.database_bytes)
        || info.sha256.len() != 64
        || length != 12 + len as u64 + info.database_bytes
        || chrono::DateTime::parse_from_rfc3339(&info.created_at).is_err()
    {
        bail!("Incompatible, truncated or oversized analysis archive");
    }
    let mut local = tempfile::NamedTempFile::new_in(dir)?;
    let copied = std::io::copy(&mut source.take(info.database_bytes + 1), &mut local)?;
    if copied != info.database_bytes {
        bail!("Analysis archive changed while reading");
    }
    local.flush()?;
    if digest(local.path())? != info.sha256 {
        bail!("Analysis archive checksum mismatch; wait for OneDrive to finish syncing or choose another backup");
    }
    let c = reader(local.path())?;
    integrity(&c)?;
    let id: i32 = c.pragma_query_value(None, "application_id", |r| r.get(0))?;
    let version: i32 = c.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if id != APP_ID || version != 1 {
        bail!("Unsupported analysis archive database version");
    }
    let mut q = c.prepare(
        "SELECT name,sql FROM sqlite_schema WHERE type!='index' OR sql IS NOT NULL LIMIT 4",
    )?;
    let schema = q
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if schema.len() != 2
        || !schema.iter().all(|(name, sql)| match name.as_str() {
            "sonic_profiles" => sql == PROFILES,
            "sonic_audio" => sql == AUDIO,
            _ => false,
        })
    {
        bail!("Unsafe or unexpected analysis archive schema");
    }
    drop(q);
    let invalid: bool = c.query_row("SELECT EXISTS(SELECT 1 FROM sonic_audio WHERE profile!=?1 OR typeof(audio_hash)!='text' OR length(audio_hash)!=64 OR typeof(features)!='text' OR length(features)>65536) OR (SELECT count(*) FROM sonic_profiles)!=1 OR (SELECT count(*) FROM sonic_audio)!=?2", params![PROFILE, info.audio_count], |r| r.get(0))?;
    if invalid {
        bail!("Analysis archive counts or profile rows are invalid");
    }
    let w = weights(&c)?;
    let mut q = c.prepare("SELECT audio_hash,features FROM sonic_audio")?;
    let mut rows = q.query([])?;
    while let Some(r) = rows.next()? {
        features(&r.get::<_, String>(0)?, &r.get::<_, String>(1)?, &w)?;
    }
    drop(rows);
    drop(q);
    // The manifest's source path is descriptive only; never use it as a destination.
    info.path = path.to_string_lossy().into();
    Ok(Staged {
        c,
        _file: local,
        info,
    })
}

pub(crate) fn inspect_at(dir: &Path, path: &Path) -> Result<AnalysisBackup> {
    Ok(stage(dir, path)?.info)
}

pub(crate) fn restore_at(
    dir: &Path,
    path: &Path,
    expected_sha256: &str,
) -> Result<AnalysisRestore> {
    let staged = stage(dir, path)?;
    if staged.info.sha256 != expected_sha256 {
        bail!("The selected backup changed after review. Inspect it again before restoring");
    }
    let _guard = crate::sonic::lock(dir)
        .context("Pause audio analysis in Activity Center before restoring")?;
    let w = weights(&staged.c)?;
    let mut local = crate::sonic::results(dir)?;
    let prior: Option<String> = local
        .query_row(
            "SELECT weights FROM sonic_profiles WHERE profile=?1",
            [PROFILE],
            |r| r.get(0),
        )
        .optional()?;
    if let Some(prior) = prior.as_ref() {
        if serde_json::from_str::<Vec<f32>>(prior)? != w {
            bail!("Local and backup analysis weights conflict; local results were preserved");
        }
    }
    let local_count: i64 = local.query_row(
        "SELECT count(*) FROM sonic_audio WHERE profile=?1",
        [PROFILE],
        |r| r.get(0),
    )?;
    let safety_backup = if local_count > 0 {
        Some(export_at(dir, &dir.join("backups").join("sonic-analysis"))?.path)
    } else {
        None
    };
    let tx = local.transaction()?;
    tx.execute(
        "INSERT OR IGNORE INTO sonic_profiles VALUES(?1,?2)",
        params![PROFILE, serde_json::to_string(&w)?],
    )?;
    let mut q = staged
        .c
        .prepare("SELECT audio_hash,features FROM sonic_audio ORDER BY audio_hash")?;
    let mut rows = q.query([])?;
    let mut added = 0;
    let mut already_present = 0;
    while let Some(row) = rows.next()? {
        let hash: String = row.get(0)?;
        let json: String = row.get(1)?;
        let prior: Option<String> = tx
            .prepare_cached("SELECT features FROM sonic_audio WHERE audio_hash=?1 AND profile=?2")?
            .query_row(params![hash, PROFILE], |r| r.get(0))
            .optional()?;
        if let Some(prior) = prior {
            if serde_json::from_str::<Vec<f32>>(&prior)? != serde_json::from_str::<Vec<f32>>(&json)?
            {
                bail!("Conflicting features for the same audio fingerprint; restore rolled back and local results were preserved");
            }
            already_present += 1;
        } else {
            tx.prepare_cached("INSERT INTO sonic_audio VALUES(?1,?2,?3)")?
                .execute(params![hash, PROFILE, json])?;
            added += 1;
        }
    }
    tx.commit()?;
    Ok(AnalysisRestore {
        added,
        already_present,
        safety_backup,
    })
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub fn sonic_backup_folder() -> Option<String> {
    default_folder().map(|p| p.to_string_lossy().into())
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_backup_export(
    app: tauri::AppHandle,
    folder: String,
) -> Result<AnalysisBackup, String> {
    tauri::async_runtime::spawn_blocking(move || {
        export_at(&crate::sonic::directory(&app)?, Path::new(&folder))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_backup_inspect(
    app: tauri::AppHandle,
    path: String,
) -> Result<AnalysisBackup, String> {
    tauri::async_runtime::spawn_blocking(move || {
        inspect_at(&crate::sonic::directory(&app)?, Path::new(&path))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_backup_restore(
    app: tauri::AppHandle,
    path: String,
    sha256: String,
) -> Result<AnalysisRestore, String> {
    tauri::async_runtime::spawn_blocking(move || {
        restore_at(&crate::sonic::directory(&app)?, Path::new(&path), &sha256)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "opt-in round trip over an immutable analysis snapshot"]
    fn snapshot_cache_round_trip() {
        let source = PathBuf::from(
            std::env::var_os("SONIC_BACKUP_PROOF_SOURCE")
                .expect("Set SONIC_BACKUP_PROOF_SOURCE to a closed snapshot directory"),
        )
        .join("music-analysis.sqlite3");
        assert!(
            !source.with_file_name("music-analysis.sqlite3-wal").exists(),
            "Use a closed analysis snapshot"
        );
        let before = digest(&source).unwrap();
        let local = tempfile::tempdir().unwrap();
        fs::copy(&source, local.path().join("music-analysis.sqlite3")).unwrap();
        let started = Instant::now();
        let backup = export_at(
            local.path(),
            &local.path().join("OneDrive/_musicbackup/sonic-analysis"),
        )
        .unwrap();
        let export_seconds = started.elapsed().as_secs_f64();
        let receiver = tempfile::tempdir().unwrap();
        let started = Instant::now();
        let imported =
            restore_at(receiver.path(), Path::new(&backup.path), &backup.sha256).unwrap();
        let restore_seconds = started.elapsed().as_secs_f64();
        assert_eq!(imported.added, backup.audio_count);
        let c = crate::sonic::results(receiver.path()).unwrap();
        assert_eq!(
            c.query_row("SELECT count(*) FROM sonic_tracks", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        let again = restore_at(receiver.path(), Path::new(&backup.path), &backup.sha256).unwrap();
        assert_eq!(
            (again.added, again.already_present),
            (0, backup.audio_count)
        );
        assert!(again.safety_backup.is_some());
        assert_eq!(digest(&source).unwrap(), before);
        println!(
            "{}",
            serde_json::json!({"audioCount": backup.audio_count, "databaseBytes": backup.database_bytes, "exportSeconds": export_seconds, "restoreSeconds": restore_seconds, "sourceUnchanged": true})
        );
    }
    fn fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let c = crate::sonic::results(dir.path()).unwrap();
        let w = vec![1f32; DIMENSIONS * DIMENSIONS];
        c.execute(
            "INSERT INTO sonic_profiles VALUES(?1,?2)",
            params![PROFILE, serde_json::to_string(&w).unwrap()],
        )
        .unwrap();
        c.execute(
            "INSERT INTO sonic_audio VALUES(?1,?2,?3)",
            params![
                "b".repeat(64),
                PROFILE,
                serde_json::to_string(&vec![1f32; DIMENSIONS]).unwrap()
            ],
        )
        .unwrap();
        c.execute("INSERT INTO sonic_tracks VALUES('foreign-id','C:/source/music','source.mp3',?1,?2,42,'1','today')", params!["b".repeat(64), PROFILE]).unwrap();
        fs::write(
            dir.path().join("music-library.sqlite3"),
            b"untouched catalog",
        )
        .unwrap();
        fs::write(
            dir.path().join("sonic-work.sqlite3"),
            b"local schedule and jobs",
        )
        .unwrap();
        dir
    }
    fn backup(dir: &Path) -> AnalysisBackup {
        export_at(dir, &dir.join("OneDrive/_musicbackup/sonic-analysis")).unwrap()
    }
    fn rewrite(
        dir: &Path,
        original: &AnalysisBackup,
        change: impl FnOnce(&Connection),
    ) -> AnalysisBackup {
        let staged = stage(dir, Path::new(&original.path)).unwrap();
        let file = tempfile::NamedTempFile::new_in(dir).unwrap();
        let mut c = Connection::open(file.path()).unwrap();
        snapshot(&staged.c, &mut c, |_, _| Ok(())).unwrap();
        change(&c);
        drop(c);
        let mut info = original.clone();
        info.path = dir.join("changed.sonic-backup").to_string_lossy().into();
        info.sha256 = digest(file.path()).unwrap();
        info.database_bytes = file.as_file().metadata().unwrap().len();
        let json = serde_json::to_vec(&info).unwrap();
        let mut out = File::create(&info.path).unwrap();
        out.write_all(MAGIC).unwrap();
        out.write_all(&(json.len() as u32).to_le_bytes()).unwrap();
        out.write_all(&json).unwrap();
        std::io::copy(&mut file.reopen().unwrap(), &mut out).unwrap();
        info
    }
    #[test]
    fn export_is_standalone_portable_and_unique_even_with_live_writer() {
        let dir = fixture();
        let writer = crate::sonic::results(dir.path()).unwrap();
        let _lock = crate::sonic::lock(dir.path()).unwrap();
        let a = backup(dir.path());
        let b = backup(dir.path());
        assert_ne!(a.path, b.path);
        assert_eq!(a.audio_count, 1);
        let staged = stage(dir.path(), Path::new(&a.path)).unwrap();
        assert_eq!(
            staged
                .c
                .query_row("PRAGMA journal_mode", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "delete"
        );
        assert!(staged.c.prepare("SELECT * FROM sonic_tracks").is_err());
        assert_eq!(weights(&staged.c).unwrap().len(), DIMENSIONS * DIMENSIONS);
        assert_eq!(
            writer
                .query_row("SELECT count(*) FROM sonic_tracks", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
    }
    #[test]
    fn snapshot_does_not_restart_when_wal_writer_commits_each_step() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("source.db");
        let writer = Connection::open(&path).unwrap();
        writer.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE revision(n); INSERT INTO revision VALUES(0); CREATE TABLE payload(b); WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<900) INSERT INTO payload SELECT zeroblob(4096) FROM n;").unwrap();
        let source = reader(&path).unwrap();
        let mut target = Connection::open_in_memory().unwrap();
        let mut steps = 0;
        snapshot(&source, &mut target, |done, total| {
            steps += 1;
            assert!(steps <= (total + 255) / 256);
            assert!(done > 0);
            writer.execute("UPDATE revision SET n=n+1", [])?;
            Ok(())
        })
        .unwrap();
        assert!(steps > 2);
        assert_eq!(
            target
                .query_row("SELECT n FROM revision", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert!(source.is_autocommit());
    }
    #[test]
    fn merge_is_idempotent_and_preserves_paths_catalog_and_device_work() {
        let source = fixture();
        let a = backup(source.path());
        let target = fixture();
        let c = crate::sonic::results(target.path()).unwrap();
        c.execute("DELETE FROM sonic_audio", []).unwrap();
        drop(c);
        let first = restore_at(target.path(), Path::new(&a.path), &a.sha256).unwrap();
        assert_eq!(first.added, 1);
        let second = restore_at(target.path(), Path::new(&a.path), &a.sha256).unwrap();
        assert_eq!((second.added, second.already_present), (0, 1));
        assert!(second.safety_backup.is_some());
        let c = crate::sonic::results(target.path()).unwrap();
        assert_eq!(
            c.query_row("SELECT count(*) FROM sonic_tracks", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            fs::read(target.path().join("music-library.sqlite3")).unwrap(),
            b"untouched catalog"
        );
        assert_eq!(
            fs::read(target.path().join("sonic-work.sqlite3")).unwrap(),
            b"local schedule and jobs"
        );
    }
    #[test]
    fn corruption_and_truncation_are_rejected_before_creating_local_store() {
        let source = fixture();
        let a = backup(source.path());
        let target = tempfile::tempdir().unwrap();
        let mut bytes = fs::read(&a.path).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 1;
        let path = target.path().join("corrupt.sonic-backup");
        fs::write(&path, &bytes).unwrap();
        assert!(restore_at(target.path(), &path, &a.sha256)
            .unwrap_err()
            .to_string()
            .contains("checksum"));
        fs::write(&path, &bytes[..last]).unwrap();
        assert!(inspect_at(target.path(), &path).is_err());
        assert!(!target.path().join("music-analysis.sqlite3").exists());
    }
    #[test]
    fn unexpected_schema_invalid_vectors_and_wrong_profile_are_rejected_even_with_valid_checksum() {
        let source = fixture();
        let a = backup(source.path());
        for sql in [
            "CREATE VIEW unsafe AS SELECT * FROM sonic_audio",
            "UPDATE sonic_audio SET profile='old-profile'",
            "UPDATE sonic_audio SET features='[1]'",
            "PRAGMA user_version=2",
            "UPDATE sonic_profiles SET weights='[]'",
            "DELETE FROM sonic_audio",
        ] {
            let changed = rewrite(source.path(), &a, |c| c.execute_batch(sql).unwrap());
            assert!(
                inspect_at(source.path(), Path::new(&changed.path)).is_err(),
                "{sql}"
            );
        }
    }
    #[test]
    fn conflict_rolls_back_prior_additions_and_retains_safety_backup() {
        let source = fixture();
        let c = crate::sonic::results(source.path()).unwrap();
        c.execute(
            "INSERT INTO sonic_audio VALUES(?1,?2,?3)",
            params![
                "a".repeat(64),
                PROFILE,
                serde_json::to_string(&vec![2f32; DIMENSIONS]).unwrap()
            ],
        )
        .unwrap();
        drop(c);
        let a = backup(source.path());
        let target = fixture();
        let c = crate::sonic::results(target.path()).unwrap();
        c.execute(
            "UPDATE sonic_audio SET features=?1",
            [serde_json::to_string(&vec![3f32; DIMENSIONS]).unwrap()],
        )
        .unwrap();
        drop(c);
        assert!(restore_at(target.path(), Path::new(&a.path), &a.sha256)
            .unwrap_err()
            .to_string()
            .contains("Conflicting"));
        let c = crate::sonic::results(target.path()).unwrap();
        assert_eq!(
            c.query_row("SELECT count(*) FROM sonic_audio", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            fs::read_dir(target.path().join("backups/sonic-analysis"))
                .unwrap()
                .count(),
            1
        );
    }
    #[test]
    fn restore_respects_writer_lock_and_reviewed_digest_and_weight_profile() {
        let source = fixture();
        let a = backup(source.path());
        let target = fixture();
        let held = crate::sonic::lock(target.path()).unwrap();
        assert!(restore_at(target.path(), Path::new(&a.path), &a.sha256).is_err());
        drop(held);
        assert!(
            restore_at(target.path(), Path::new(&a.path), &"0".repeat(64))
                .unwrap_err()
                .to_string()
                .contains("changed after review")
        );
        let c = crate::sonic::results(target.path()).unwrap();
        c.execute(
            "UPDATE sonic_profiles SET weights=?1",
            [serde_json::to_string(&vec![2f32; DIMENSIONS * DIMENSIONS]).unwrap()],
        )
        .unwrap();
        assert!(restore_at(target.path(), Path::new(&a.path), &a.sha256)
            .unwrap_err()
            .to_string()
            .contains("weights conflict"));
    }
}
