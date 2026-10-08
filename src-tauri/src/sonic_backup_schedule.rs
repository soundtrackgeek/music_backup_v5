//! Device-local automatic backup settings and durable deadlines/ownership receipts.
use crate::sonic_backup::{self, AnalysisBackup};
use anyhow::{bail, Context, Result};
use chrono::{TimeZone, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    path::{Path, PathBuf},
    time::Duration,
};

const RETRY_MS: i64 = 5 * 60 * 1000;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackupSchedule {
    pub enabled: bool,
    pub interval_hours: u32,
    pub backups_to_keep: u32,
    pub folder: String,
}

impl Default for BackupSchedule {
    fn default() -> Self {
        Self {
            enabled: false,
            interval_hours: 6,
            backups_to_keep: 7,
            folder: sonic_backup::default_folder()
                .map(|p| p.to_string_lossy().into())
                .unwrap_or_default(),
        }
    }
}

impl BackupSchedule {
    fn validate(&self) -> Result<()> {
        if !(1..=168).contains(&self.interval_hours) || !(1..=1000).contains(&self.backups_to_keep)
        {
            bail!("Choose a backup interval of 1–168 hours and keep 1–1000 automatic backups");
        }
        if self.enabled && !Path::new(&self.folder).is_absolute() {
            bail!("Choose an absolute backup folder before enabling automatic backups");
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BackupStatus {
    pub schedule: BackupSchedule,
    pub last_backup: Option<AnalysisBackup>,
    pub next_backup_at: Option<String>,
    pub last_error: Option<String>,
    pub running: bool,
}

struct State {
    device: String,
    schedule: BackupSchedule,
    revision: i64,
    next: i64,
    last: Option<AnalysisBackup>,
    error: Option<String>,
}

fn store(dir: &Path) -> Result<Connection> {
    let c = Connection::open(dir.join("sonic-backup-state.sqlite3"))?;
    c.busy_timeout(Duration::from_secs(5))?;
    let version: i32 = c.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version > 1 {
        bail!("Automatic backup settings require a newer Music Library version");
    }
    c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS sonic_backup_state(id INTEGER PRIMARY KEY CHECK(id=1),device TEXT NOT NULL,schedule TEXT NOT NULL,revision INTEGER NOT NULL,next_at INTEGER NOT NULL,last_backup TEXT,last_error TEXT);
        CREATE TABLE IF NOT EXISTS sonic_auto_archives(path TEXT PRIMARY KEY,folder TEXT NOT NULL,sha256 TEXT NOT NULL,created_at TEXT NOT NULL);
        PRAGMA user_version=1;")?;
    let exists: bool = c.query_row("SELECT EXISTS(SELECT 1 FROM sonic_backup_state)", [], |r| {
        r.get(0)
    })?;
    if !exists {
        let token = tempfile::Builder::new()
            .prefix("device-")
            .rand_bytes(24)
            .tempfile_in(dir)?;
        let device = token
            .path()
            .file_name()
            .context("Device token has no name")?
            .to_string_lossy()
            .into_owned();
        c.execute(
            "INSERT OR IGNORE INTO sonic_backup_state VALUES(1,?1,?2,0,0,NULL,NULL)",
            params![device, serde_json::to_string(&BackupSchedule::default())?],
        )?;
    }
    Ok(c)
}

fn read(c: &Connection) -> Result<State> {
    let (device, schedule, revision, next, last, error): (String, String, i64, i64, Option<String>, Option<String>) =
        c.query_row("SELECT device,schedule,revision,next_at,last_backup,last_error FROM sonic_backup_state WHERE id=1", [], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?)))?;
    let schedule: BackupSchedule = serde_json::from_str(&schedule)?;
    schedule.validate()?;
    if !device
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        bail!("Invalid backup device identity");
    }
    Ok(State {
        device,
        schedule,
        revision,
        next,
        last: last.map(|json| serde_json::from_str(&json)).transpose()?,
        error,
    })
}

fn lock(dir: &Path) -> Result<File> {
    let guard = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(dir.join("sonic-autobackup.lock"))?;
    guard
        .try_lock()
        .context("Automatic analysis backup is already running")?;
    Ok(guard)
}

pub(crate) fn status_at(dir: &Path) -> Result<BackupStatus> {
    let state = read(&store(dir)?)?;
    let running = lock(dir).is_err();
    Ok(BackupStatus {
        next_backup_at: state
            .schedule
            .enabled
            .then(|| {
                Utc.timestamp_millis_opt(state.next)
                    .single()
                    .map(|d| d.to_rfc3339())
            })
            .flatten(),
        schedule: state.schedule,
        last_backup: state.last,
        last_error: state.error,
        running,
    })
}

pub(crate) fn save_at(dir: &Path, mut schedule: BackupSchedule, now: i64) -> Result<BackupStatus> {
    schedule.folder = schedule.folder.trim().into();
    schedule.validate()?;
    let c = store(dir)?;
    let old = read(&c)?;
    if schedule != old.schedule {
        let reset = schedule.enabled != old.schedule.enabled
            || schedule.interval_hours != old.schedule.interval_hours
            || schedule.folder != old.schedule.folder;
        let next = if !schedule.enabled {
            0
        } else if reset {
            now
        } else {
            old.next
        };
        c.execute("UPDATE sonic_backup_state SET schedule=?1,revision=revision+1,next_at=?2,last_error=NULL WHERE id=1",
            params![serde_json::to_string(&schedule)?,next])?;
    }
    status_at(dir)
}

pub(crate) fn run_due_at(dir: &Path, now: i64) -> Result<()> {
    run_due_with(dir, now, sonic_backup::export_named_at)
}

fn run_due_with(
    dir: &Path,
    now: i64,
    export: impl FnOnce(&Path, &Path, &str) -> Result<AnalysisBackup>,
) -> Result<()> {
    let mut c = store(dir)?;
    let state = read(&c)?;
    if !state.schedule.enabled || now < state.next {
        return Ok(());
    }
    // Only one automatic pass per process/device, including multiple app windows.
    let Ok(_guard) = lock(dir) else {
        return Ok(());
    };
    // Recheck after locking: a peer may have completed a backup or settings changed.
    let state = read(&c)?;
    if !state.schedule.enabled || now < state.next {
        return Ok(());
    }
    // A crash or failure cannot cause a tight retry loop after restart.
    if c.execute(
        "UPDATE sonic_backup_state SET next_at=?1 WHERE id=1 AND revision=?2",
        params![now + RETRY_MS, state.revision],
    )? == 0
    {
        return Ok(());
    }
    let folder = Path::new(&state.schedule.folder);
    let prefix = format!("automatic-{}", state.device);
    match export(dir, folder, &prefix) {
        Ok(info) => {
            // Receipt covers every archive byte, including descriptive manifest edits.
            let checksum = match sonic_backup::digest(Path::new(&info.path)) {
                Ok(checksum) => checksum,
                Err(error) => {
                    c.execute("UPDATE sonic_backup_state SET last_error=?1 WHERE id=1 AND revision=?2", params![format!("Backup published; could not record its ownership checksum: {error:#}"),state.revision])?;
                    return Err(error);
                }
            };
            let tx = c.transaction()?;
            tx.execute(
                "INSERT INTO sonic_auto_archives VALUES(?1,?2,?3,?4)",
                params![info.path, state.schedule.folder, checksum, info.created_at],
            )?;
            tx.execute("UPDATE sonic_backup_state SET last_backup=?1,last_error=NULL,next_at=CASE WHEN revision=?2 THEN ?3 ELSE next_at END WHERE id=1",
                params![serde_json::to_string(&info)?,state.revision,now + i64::from(state.schedule.interval_hours) * 3_600_000])?;
            tx.commit()?;
            // Retention runs only after a new, validated archive has been published.
            // Read current settings again so a mid-backup edit is respected.
            let current = read(&c)?;
            if current.revision != state.revision
                && current.schedule.enabled
                && current.schedule.folder == state.schedule.folder
                && current.schedule.interval_hours == state.schedule.interval_hours
            {
                // A retention-only edit must not leave the temporary retry deadline behind.
                c.execute(
                    "UPDATE sonic_backup_state SET next_at=?1 WHERE id=1 AND revision=?2",
                    params![
                        now + i64::from(current.schedule.interval_hours) * 3_600_000,
                        current.revision
                    ],
                )?;
            }
            if current.schedule.enabled && current.schedule.folder == state.schedule.folder {
                if let Err(error) = prune(dir, &c, &current) {
                    c.execute(
                        "UPDATE sonic_backup_state SET last_error=?1 WHERE id=1",
                        [format!(
                            "Backup saved; could not prune older automatic backups: {error:#}"
                        )],
                    )?;
                }
            }
            Ok(())
        }
        Err(error) => {
            c.execute(
                "UPDATE sonic_backup_state SET last_error=?1 WHERE id=1 AND revision=?2",
                params![format!("{error:#}"), state.revision],
            )?;
            Err(error)
        }
    }
}

fn prune(dir: &Path, c: &Connection, state: &State) -> Result<()> {
    let mut q = c.prepare("SELECT path,sha256 FROM sonic_auto_archives WHERE folder=?1 ORDER BY rowid DESC LIMIT -1 OFFSET ?2")?;
    let rows = q
        .query_map(
            params![state.schedule.folder, state.schedule.backups_to_keep],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut preserved = false;
    for (path, sha) in rows {
        let path = PathBuf::from(path);
        let prefix = format!("automatic-{}-", state.device);
        if path.parent() != Some(Path::new(&state.schedule.folder))
            || !path
                .file_name()
                .is_some_and(|n| n.to_string_lossy().starts_with(&prefix))
        {
            bail!("An automatic backup receipt has an unexpected path; it was preserved");
        }
        match fs::symlink_metadata(&path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
            Ok(metadata) => {
                if !metadata.file_type().is_file() {
                    bail!("An older backup is no longer a regular file; it was preserved");
                }
                if sonic_backup::inspect_at(dir, &path).is_ok()
                    && sonic_backup::digest(&path).is_ok_and(|checksum| checksum == sha)
                {
                    fs::remove_file(&path)?;
                } else {
                    // An edited archive becomes user-owned. Preserve it without
                    // allowing it to block retention of all future valid backups.
                    preserved = true;
                }
            }
        }
        c.execute(
            "DELETE FROM sonic_auto_archives WHERE path=?1",
            [path.to_string_lossy().as_ref()],
        )?;
    }
    if preserved {
        bail!("Changed or unreadable archives were preserved and removed from automatic retention");
    }
    Ok(())
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_backup_status(app: tauri::AppHandle) -> Result<BackupStatus, String> {
    tauri::async_runtime::spawn_blocking(move || status_at(&crate::sonic::directory(&app)?))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("{e:#}"))
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_backup_configure(
    app: tauri::AppHandle,
    schedule: BackupSchedule,
) -> Result<BackupStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        save_at(
            &crate::sonic::directory(&app)?,
            schedule,
            Utc::now().timestamp_millis(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use music_sonic_core::{DIMENSIONS, PROFILE};
    use std::cell::Cell;

    fn configuration(dir: &Path, keep: u32) -> BackupSchedule {
        BackupSchedule {
            enabled: true,
            interval_hours: 6,
            backups_to_keep: keep,
            folder: dir
                .join("OneDrive/_musicbackup/sonic-analysis")
                .to_string_lossy()
                .into(),
        }
    }

    fn fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let c = crate::sonic::results(dir.path()).unwrap();
        c.execute(
            "INSERT INTO sonic_profiles VALUES(?1,?2)",
            params![
                PROFILE,
                serde_json::to_string(&vec![1f32; DIMENSIONS * DIMENSIONS]).unwrap()
            ],
        )
        .unwrap();
        c.execute(
            "INSERT INTO sonic_audio VALUES(?1,?2,?3)",
            params![
                "a".repeat(64),
                PROFILE,
                serde_json::to_string(&vec![0f32; DIMENSIONS]).unwrap()
            ],
        )
        .unwrap();
        dir
    }

    fn fake(now: i64, folder: &Path, prefix: &str) -> AnalysisBackup {
        let info = AnalysisBackup {
            path: folder
                .join(format!("{prefix}-{now}.sonic-backup"))
                .to_string_lossy()
                .into(),
            created_at: Utc.timestamp_millis_opt(now).unwrap().to_rfc3339(),
            archive_version: 1,
            profile: PROFILE.into(),
            dimensions: DIMENSIONS as u32,
            audio_count: 1,
            database_bytes: 1,
            sha256: "a".repeat(64),
        };
        fs::create_dir_all(folder).unwrap();
        fs::write(&info.path, b"Fake archive for clock-only tests").unwrap();
        info
    }

    #[test]
    fn six_hour_deadlines_survive_restarts_and_skip_missed_intervals() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!status_at(dir.path()).unwrap().schedule.enabled);
        let schedule = configuration(dir.path(), 7);
        let start = 1_800_000_000_000;
        save_at(dir.path(), schedule.clone(), start).unwrap();
        let calls = Cell::new(0);
        let pass = |now| {
            run_due_with(dir.path(), now, |_, folder, prefix| {
                calls.set(calls.get() + 1);
                Ok(fake(now, folder, prefix))
            })
            .unwrap()
        };
        pass(start);
        pass(start + 6 * 3_600_000 - 1);
        assert_eq!(calls.get(), 1);
        // A fresh store connection models a restart; overdue time catches up once.
        pass(start + 20 * 3_600_000);
        pass(start + 20 * 3_600_000);
        assert_eq!(calls.get(), 2);
        let next = status_at(dir.path()).unwrap().next_backup_at;
        save_at(dir.path(), schedule, start + 21 * 3_600_000).unwrap();
        assert_eq!(status_at(dir.path()).unwrap().next_backup_at, next);
        let mut lowered = configuration(dir.path(), 3);
        save_at(dir.path(), lowered.clone(), start + 21 * 3_600_000).unwrap();
        assert_eq!(status_at(dir.path()).unwrap().next_backup_at, next);
        lowered.enabled = false;
        save_at(dir.path(), lowered, start).unwrap();
        pass(start + 50 * 3_600_000);
        assert_eq!(calls.get(), 2);
    }

    #[test]
    fn failure_preserves_last_success_and_retries_after_five_minutes() {
        let dir = tempfile::tempdir().unwrap();
        let start = 1_800_000_000_000;
        save_at(dir.path(), configuration(dir.path(), 7), start).unwrap();
        run_due_with(dir.path(), start, |_, f, p| Ok(fake(start, f, p))).unwrap();
        let before = status_at(dir.path()).unwrap().last_backup.unwrap().path;
        let due = start + 6 * 3_600_000;
        assert!(run_due_with(dir.path(), due, |_, _, _| bail!("Destination unavailable")).is_err());
        let status = status_at(dir.path()).unwrap();
        assert_eq!(status.last_backup.unwrap().path, before);
        assert_eq!(
            status.last_error.as_deref(),
            Some("Destination unavailable")
        );
        run_due_with(dir.path(), due + RETRY_MS - 1, |_, _, _| {
            panic!("Too early")
        })
        .unwrap();
        run_due_with(dir.path(), due + RETRY_MS, |_, f, p| {
            Ok(fake(due + RETRY_MS, f, p))
        })
        .unwrap();
        assert!(status_at(dir.path()).unwrap().last_error.is_none());
    }

    #[test]
    fn retention_preserves_manual_peer_changed_and_previous_folder_archives() {
        let dir = fixture();
        let start = Utc::now().timestamp_millis();
        let schedule = configuration(dir.path(), 2);
        let folder = Path::new(&schedule.folder);
        let manual = sonic_backup::export_at(dir.path(), folder).unwrap();
        let peer =
            sonic_backup::export_named_at(dir.path(), folder, "automatic-another-device").unwrap();
        save_at(dir.path(), schedule.clone(), start).unwrap();
        for i in 0..4 {
            run_due_at(dir.path(), start + i * 6 * 3_600_000).unwrap();
        }
        let own = |folder: &Path| {
            fs::read_dir(folder)
                .unwrap()
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| {
                    p.file_name()
                        .unwrap()
                        .to_string_lossy()
                        .starts_with("automatic-device-")
                })
                .collect::<Vec<_>>()
        };
        assert_eq!(own(folder).len(), 2);
        assert!(Path::new(&manual.path).exists() && Path::new(&peer.path).exists());
        // A modified archive is never deleted, even with a genuine ownership receipt.
        let c = store(dir.path()).unwrap();
        let oldest: String = c
            .query_row(
                "SELECT path FROM sonic_auto_archives ORDER BY rowid LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let bytes = fs::read(&oldest).unwrap();
        let manifest_end = 12 + u32::from_le_bytes(bytes[8..12].try_into().unwrap()) as usize;
        let mut manifest: AnalysisBackup =
            serde_json::from_slice(&bytes[12..manifest_end]).unwrap();
        manifest.created_at = "2026-10-08T00:00:00Z".into();
        let json = serde_json::to_vec(&manifest).unwrap();
        let mut changed = bytes[..8].to_vec();
        changed.extend((json.len() as u32).to_le_bytes());
        changed.extend(json);
        changed.extend(&bytes[manifest_end..]);
        fs::write(&oldest, &changed).unwrap();
        assert!(sonic_backup::inspect_at(dir.path(), Path::new(&oldest)).is_ok());
        run_due_at(dir.path(), start + 24 * 3_600_000).unwrap();
        assert_eq!(fs::read(&oldest).unwrap(), changed);
        assert!(status_at(dir.path())
            .unwrap()
            .last_error
            .unwrap()
            .contains("could not prune"));
        run_due_at(dir.path(), start + 30 * 3_600_000).unwrap();
        assert_eq!(own(folder).len(), 3); // Two managed backups plus the user's edited copy.
        let mut moved = schedule.clone();
        moved.folder = dir.path().join("another-folder").to_string_lossy().into();
        moved.backups_to_keep = 1;
        let previous = own(folder).len();
        save_at(dir.path(), moved.clone(), start + 31 * 3_600_000).unwrap();
        run_due_at(dir.path(), start + 31 * 3_600_000).unwrap();
        run_due_at(dir.path(), start + 37 * 3_600_000).unwrap();
        assert_eq!(own(Path::new(&moved.folder)).len(), 1);
        assert_eq!(own(folder).len(), previous);
    }

    #[test]
    fn settings_changed_during_export_keep_the_new_deadline_and_disable_retention() {
        let dir = tempfile::tempdir().unwrap();
        let start = 1_800_000_000_000;
        let mut schedule = configuration(dir.path(), 7);
        save_at(dir.path(), schedule.clone(), start).unwrap();
        schedule.backups_to_keep = 3;
        run_due_with(dir.path(), start, |_, f, p| {
            save_at(dir.path(), schedule.clone(), start + 10).unwrap();
            Ok(fake(start, f, p))
        })
        .unwrap();
        assert_eq!(
            status_at(dir.path()).unwrap().next_backup_at,
            Some(
                Utc.timestamp_millis_opt(start + 6 * 3_600_000)
                    .unwrap()
                    .to_rfc3339()
            )
        );
        schedule.enabled = false;
        run_due_with(dir.path(), start + 6 * 3_600_000, |_, f, p| {
            save_at(dir.path(), schedule, start + 10).unwrap();
            Ok(fake(start + 6 * 3_600_000, f, p))
        })
        .unwrap();
        let status = status_at(dir.path()).unwrap();
        assert!(!status.schedule.enabled);
        assert!(status.next_backup_at.is_none());
        assert!(status.last_backup.is_some());
    }

    #[test]
    fn locks_prevent_overlap_and_invalid_settings_are_rejected() {
        let dir = fixture();
        let start = Utc::now().timestamp_millis();
        let mut schedule = configuration(dir.path(), 7);
        save_at(dir.path(), schedule.clone(), start).unwrap();
        let guard = lock(dir.path()).unwrap();
        assert!(status_at(dir.path()).unwrap().running);
        run_due_with(dir.path(), start, |_, _, _| panic!("Must not overlap")).unwrap();
        drop(guard);
        let export_guard = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(dir.path().join("sonic-backup.lock"))
            .unwrap();
        export_guard.try_lock().unwrap();
        assert!(run_due_at(dir.path(), start).is_err());
        assert!(fs::read_dir(Path::new(&schedule.folder)).is_err());
        drop(export_guard);
        schedule.backups_to_keep = 0;
        assert!(save_at(dir.path(), schedule.clone(), start).is_err());
        schedule.backups_to_keep = 1001;
        assert!(save_at(dir.path(), schedule.clone(), start).is_err());
        schedule.backups_to_keep = 7;
        schedule.interval_hours = 0;
        assert!(save_at(dir.path(), schedule.clone(), start).is_err());
        schedule.interval_hours = 6;
        schedule.folder = "relative".into();
        assert!(save_at(dir.path(), schedule, start).is_err());
    }
}
