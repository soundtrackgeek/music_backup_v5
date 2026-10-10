//! Derived, reproducible audio data. Never writes the catalog or music files.
use anyhow::{bail, Context, Result};
use music_sonic_core::{
    audio_range, file_is_current, file_signature, track_key, Analysis, Metric, PROFILE,
};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom},
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};
use tauri::AppHandle;

/// A problem with this file may be saved and skipped. Launch, protocol and
/// database failures must stop the job instead of poisoning the whole queue.
#[derive(Debug, thiserror::Error)]
#[error("{0}")]
struct TrackAnalysisError(String);

fn track_error(error: impl std::fmt::Display) -> anyhow::Error {
    TrackAnalysisError(error.to_string()).into()
}

fn analyzer_failure(code: Option<i32>, message: &str) -> anyhow::Error {
    let message = format!(
        "Analyzer failed: {}",
        message.chars().take(500).collect::<String>()
    );
    if code == Some(2) {
        track_error(message)
    } else {
        anyhow::anyhow!(message)
    }
}

#[derive(Clone, Debug, Default, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SonicStatus {
    pub analyzed: i64,
    pub pending: i64,
    pub failed: i64,
    pub total: i64,
    pub profile: String,
    pub schedule: SonicSchedule,
    pub idle_supported: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SonicSchedule {
    pub idle_only: bool,
    pub idle_minutes: u32,
    pub start_hour: Option<u32>,
    pub end_hour: Option<u32>,
}
impl Default for SonicSchedule {
    fn default() -> Self {
        Self {
            idle_only: cfg!(windows),
            idle_minutes: 5,
            start_hour: None,
            end_hour: None,
        }
    }
}
impl SonicSchedule {
    fn validate(&self) -> Result<()> {
        if !(1..=120).contains(&self.idle_minutes)
            || self.idle_only && !cfg!(windows)
            || self.start_hour.is_some() != self.end_hour.is_some()
            || self.start_hour.is_some_and(|h| h > 23)
            || self.end_hour.is_some_and(|h| h > 23)
            || self.start_hour.is_some() && self.start_hour == self.end_hour
        {
            bail!("Choose 1–120 idle minutes and two different hours from 0–23. Idle detection is available on Windows.");
        }
        Ok(())
    }
    fn allows(&self, hour: u32, idle_seconds: Option<u64>) -> bool {
        let in_window = match (self.start_hour, self.end_hour) {
            (Some(start), Some(end)) if start < end => hour >= start && hour < end,
            (Some(start), Some(end)) => hour >= start || hour < end,
            _ => true,
        };
        in_window
            && (!self.idle_only
                || idle_seconds.is_some_and(|n| n >= u64::from(self.idle_minutes) * 60))
    }
}
#[cfg(windows)]
fn idle_seconds() -> Option<u64> {
    use windows::Win32::{
        System::SystemInformation::GetTickCount,
        UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO},
    };
    let mut input = LASTINPUTINFO {
        cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    unsafe {
        GetLastInputInfo(&mut input)
            .as_bool()
            .then(|| u64::from(GetTickCount().wrapping_sub(input.dwTime)) / 1000)
    }
}
#[cfg(not(windows))]
fn idle_seconds() -> Option<u64> {
    None
}
fn schedule(w: &Connection) -> Result<SonicSchedule> {
    let value: Option<String> = w
        .query_row("SELECT value FROM sonic_settings WHERE id=1", [], |r| {
            r.get(0)
        })
        .optional()?;
    value
        .map(|json| serde_json::from_str(&json))
        .transpose()
        .map(|v| v.unwrap_or_default())
        .map_err(Into::into)
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalyzeRequest {
    /// all, favorites, album, or cache-only reuse. Checkpointed per local file.
    pub scope: String,
    pub album_id: Option<String>,
    pub batch_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SonicTrack {
    pub album_artist: String,
    pub track_id: i64,
    pub track_key: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_id: String,
    pub file_path: String,
    pub filename: String,
    pub genre: Option<String>,
    pub rating: Option<i32>,
    pub seconds: i64,
    pub loved: bool,
    pub distance: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SonicMatches {
    pub analyzed: i64,
    pub total: i64,
    pub seed_ready: bool,
    pub tracks: Vec<SonicTrack>,
}

pub(crate) fn directory(app: &AppHandle) -> Result<PathBuf> {
    Ok(crate::db::database_path(app)?
        .parent()
        .context("Catalog has no directory")?
        .to_path_buf())
}

pub(crate) fn results(dir: &Path) -> Result<Connection> {
    let c = Connection::open(dir.join("music-analysis.sqlite3"))?;
    c.busy_timeout(Duration::from_secs(5))?;
    let version: i32 = c.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version > 1 {
        bail!("This analysis database needs a newer Music Library version");
    }
    c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS sonic_profiles(profile TEXT PRIMARY KEY, weights TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sonic_audio(audio_hash TEXT NOT NULL,profile TEXT NOT NULL,features TEXT NOT NULL,PRIMARY KEY(audio_hash,profile));
      CREATE TABLE IF NOT EXISTS sonic_tracks(track_key TEXT PRIMARY KEY,directory TEXT NOT NULL,filename TEXT NOT NULL,audio_hash TEXT NOT NULL,profile TEXT NOT NULL,size INTEGER NOT NULL,modified TEXT NOT NULL,analyzed_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS sonic_tracks_path ON sonic_tracks(directory,filename);
      PRAGMA user_version=1;")?;
    crate::sonic_index::install_analysis(&c).map_err(anyhow::Error::msg)?;
    Ok(c)
}

pub(crate) fn work(dir: &Path) -> Result<Connection> {
    let c = Connection::open(dir.join("sonic-work.sqlite3"))?;
    c.busy_timeout(Duration::from_secs(5))?;
    c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS sonic_batches(id TEXT PRIMARY KEY,prepared INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sonic_items(batch_id TEXT NOT NULL,track_key TEXT NOT NULL,directory TEXT NOT NULL,filename TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',error TEXT,PRIMARY KEY(batch_id,track_key));
      CREATE INDEX IF NOT EXISTS sonic_items_next ON sonic_items(batch_id,state,track_key);
      CREATE TABLE IF NOT EXISTS sonic_settings(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);")?;
    crate::sonic_failures::install(&c)?;
    Ok(c)
}

fn catalog(dir: &Path) -> Result<Connection> {
    let c = Connection::open_with_flags(
        dir.join("music-library.sqlite3"),
        OpenFlags::SQLITE_OPEN_READ_ONLY,
    )?;
    c.busy_timeout(Duration::from_secs(5))?;
    c.execute_batch("PRAGMA query_only=ON;")?;
    Ok(c)
}

pub(crate) fn lock(dir: &Path) -> Result<File> {
    let f = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(dir.join("sonic-worker.lock"))?;
    f.try_lock().map_err(|_| {
        anyhow::anyhow!(
            "Audio analysis is already running. Use Activity Center or wait for the current track."
        )
    })?;
    Ok(f)
}

fn audio_path(directory: &str, filename: &str) -> Result<PathBuf> {
    let directory = Path::new(directory);
    let name = Path::new(filename);
    if !directory.is_absolute()
        || name.components().count() != 1
        || !matches!(name.components().next(), Some(Component::Normal(_)))
        || name
            .extension()
            .is_none_or(|e| !e.eq_ignore_ascii_case("mp3"))
    {
        bail!("Analysis requires a cataloged MP3 file");
    }
    Ok(directory.join(name))
}

fn signature(path: &Path) -> Result<(u64, String)> {
    let m = fs::metadata(path)?;
    if !m.is_file() || m.len() > 512 * 1024 * 1024 {
        bail!("MP3 is not a regular file or exceeds the 512 MiB analysis limit");
    }
    Ok(file_signature(path)?)
}

#[cfg(test)]
pub(crate) fn audio_hash(path: &Path) -> Result<String> {
    audio_hash_with_stop(path, &|| false)
}
fn audio_hash_with_stop(path: &Path, stop: &impl Fn() -> bool) -> Result<String> {
    let mut file = File::open(path)?;
    let length = file.metadata()?.len();
    let (start, end) = audio_range(&mut file, length)?;
    file.seek(SeekFrom::Start(start))?;
    let mut limited = file.take(end - start);
    let mut hash = Sha256::new();
    let mut buffer = [0; 65536];
    let mut checked = Instant::now() - Duration::from_millis(100);
    loop {
        if checked.elapsed() >= Duration::from_millis(100) {
            if stop() {
                bail!("Audio fingerprint verification stopped");
            }
            checked = Instant::now();
        }
        let n = limited.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hash.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

fn analyzer_path() -> Result<PathBuf> {
    let name = if cfg!(windows) {
        "music-sonic-analyzer.exe"
    } else {
        "music-sonic-analyzer"
    };
    let sibling = std::env::current_exe()?
        .parent()
        .context("Executable directory missing")?
        .join(name);
    if sibling.is_file() {
        return Ok(sibling);
    }
    #[cfg(debug_assertions)]
    {
        let binaries = Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries");
        if let Ok(entries) = fs::read_dir(binaries) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.file_name()
                    .is_some_and(|n| n.to_string_lossy().starts_with("music-sonic-analyzer-"))
                    && p.is_file()
                {
                    return Ok(p);
                }
            }
        }
    }
    bail!("The audio analyzer is missing. Install the current Music Library release (developers: npm run sonic:prepare).")
}

fn extract(path: &Path, stop: &impl Fn() -> bool) -> Result<Analysis> {
    let output = tempfile::NamedTempFile::new()?;
    let errors = tempfile::NamedTempFile::new()?;
    let mut cmd = Command::new(analyzer_path()?);
    cmd.arg(path)
        .stdin(Stdio::null())
        .stdout(output.reopen()?)
        .stderr(errors.reopen()?);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000 | 0x0000_4000);
    }
    let mut child = cmd.spawn()?;
    let started = Instant::now();
    let status = loop {
        if stop() || started.elapsed() > Duration::from_secs(180) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(track_error(
                "Analysis interrupted or exceeded the three-minute per-track limit",
            ));
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(e.into());
            }
        }
    };
    if !status.success() {
        let message = fs::read_to_string(errors.path()).unwrap_or_default();
        return Err(analyzer_failure(status.code(), &message));
    }
    if output.as_file().metadata()?.len() > 64 * 1024 {
        bail!("Analyzer response exceeded its limit");
    }
    let analysis: Analysis = serde_json::from_reader(output.reopen()?)?;
    if !analysis.valid() {
        bail!("Analyzer returned an incompatible or invalid feature profile");
    }
    Ok(analysis)
}

fn analyze_one(
    dir: &Path,
    directory: &str,
    filename: &str,
    stop: &impl Fn() -> bool,
) -> Result<()> {
    analyze_one_mode(dir, directory, filename, stop, false).map(|_| ())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AnalysisWork {
    Cached,
    Reused,
    Extracted,
    Unmatched,
}

/// Sample useful work in this run, never old checkpoints, cached skips, or failures.
#[derive(Default)]
struct AnalysisEstimate {
    samples: u64,
    active_time: Duration,
    healthy: bool,
}
impl AnalysisEstimate {
    fn observe(&mut self, work: Option<AnalysisWork>, elapsed: Duration, reuse_only: bool) {
        let Some(work) = work else {
            self.healthy = false;
            return;
        };
        if work == AnalysisWork::Extracted || reuse_only && work != AnalysisWork::Cached {
            self.samples += 1;
            self.active_time += elapsed;
            self.healthy = true;
        }
    }

    fn remaining(&self, queued: i64) -> Option<i64> {
        if !self.healthy || self.samples < 3 || queued <= 0 {
            return None;
        }
        // Remaining cached files can finish faster; assume decoding until checked.
        let nanos = self.active_time.as_nanos().saturating_mul(queued as u128);
        let seconds = nanos.div_ceil(u128::from(self.samples) * 1_000_000_000);
        Some(i64::try_from(seconds).unwrap_or(i64::MAX))
    }
}

fn analyze_one_mode(
    dir: &Path,
    directory: &str,
    filename: &str,
    stop: &impl Fn() -> bool,
    reuse_only: bool,
) -> Result<AnalysisWork> {
    // Re-resolve each checkpoint against the current catalog, not an old numeric ID.
    let c = catalog(dir)?;
    let exists: bool = c.query_row(
        "SELECT EXISTS(SELECT 1 FROM tracks WHERE file_path=?1 AND filename=?2)",
        params![directory, filename],
        |r| r.get(0),
    )?;
    drop(c);
    if !exists {
        return Err(track_error("The file is no longer in the catalog"));
    }
    let path = audio_path(directory, filename).map_err(track_error)?;
    let before = signature(&path).map_err(track_error)?;
    let store = results(dir)?;
    let saved: Option<(u64, String)> = store
        .query_row(
            "SELECT s.size,s.modified FROM sonic_tracks s JOIN sonic_audio a
                ON a.audio_hash=s.audio_hash AND a.profile=s.profile
                WHERE s.track_key=?1 AND s.profile=?2",
            params![track_key(directory, filename), PROFILE],
            |r| Ok((r.get::<_, i64>(0)? as u64, r.get(1)?)),
        )
        .optional()?;
    if saved.as_ref() == Some(&before) {
        return Ok(AnalysisWork::Cached);
    }
    let hash = audio_hash_with_stop(&path, stop).map_err(track_error)?;
    let existing: Option<String> = store
        .query_row(
            "SELECT features FROM sonic_audio WHERE audio_hash=?1 AND profile=?2",
            params![hash, PROFILE],
            |r| r.get(0),
        )
        .optional()?;
    if existing.is_none() {
        // A reuse scan never decodes unmatched files or publishes foreign paths.
        if reuse_only {
            return Ok(AnalysisWork::Unmatched);
        }
        let analysis = extract(&path, stop)?;
        if before != signature(&path).map_err(track_error)?
            || hash != audio_hash_with_stop(&path, stop).map_err(track_error)?
        {
            return Err(track_error(
                "The audio changed during analysis; retry the track",
            ));
        }
        let weights = serde_json::to_string(&analysis.weights)?;
        let prior: Option<String> = store
            .query_row(
                "SELECT weights FROM sonic_profiles WHERE profile=?1",
                [PROFILE],
                |r| r.get(0),
            )
            .optional()?;
        if prior.as_ref().is_some_and(|value| value != &weights) {
            bail!("The analyzer weights changed without a profile change");
        }
        store.execute(
            "INSERT OR IGNORE INTO sonic_profiles VALUES(?1,?2)",
            params![PROFILE, weights],
        )?;
        store.execute(
            "INSERT OR IGNORE INTO sonic_audio VALUES(?1,?2,?3)",
            params![hash, PROFILE, serde_json::to_string(&analysis.features)?],
        )?;
    }
    if stop() || before != signature(&path).map_err(track_error)? {
        return Err(track_error(
            "The track changed or analysis was stopped before publication",
        ));
    }
    let c = catalog(dir)?;
    if !c.query_row(
        "SELECT EXISTS(SELECT 1 FROM tracks WHERE file_path=?1 AND filename=?2)",
        params![directory, filename],
        |r| r.get::<_, bool>(0),
    )? {
        return Err(track_error("The track was removed during analysis"));
    }
    store.execute("INSERT INTO sonic_tracks VALUES(?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(track_key) DO UPDATE SET directory=excluded.directory,filename=excluded.filename,audio_hash=excluded.audio_hash,profile=excluded.profile,size=excluded.size,modified=excluded.modified,analyzed_at=excluded.analyzed_at",params![track_key(directory,filename),directory,filename,hash,PROFILE,before.0 as i64,before.1,chrono::Utc::now().to_rfc3339()])?;
    Ok(if existing.is_none() {
        AnalysisWork::Extracted
    } else {
        AnalysisWork::Reused
    })
}

pub(crate) fn analyze_headless(dir: &Path, key: &str) -> Result<serde_json::Value> {
    if key.is_empty() || key.len() > 4096 {
        bail!("Invalid seed identity");
    }
    let _lock = lock(dir)?;
    let c = catalog(dir)?;
    c.create_scalar_function(
        "sonic_key",
        2,
        rusqlite::functions::FunctionFlags::SQLITE_UTF8
            | rusqlite::functions::FunctionFlags::SQLITE_DETERMINISTIC,
        |ctx| Ok(track_key(&ctx.get::<String>(0)?, &ctx.get::<String>(1)?)),
    )?;
    let mut q = c.prepare(
        "SELECT file_path,filename FROM tracks WHERE sonic_key(file_path,filename)=?1 LIMIT 2",
    )?;
    let rows = q
        .query_map([key], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if rows.len() != 1 {
        bail!("The requested seed is absent or ambiguous in this catalog");
    }
    analyze_one(dir, &rows[0].0, &rows[0].1, &|| false)?;
    crate::sonic_failures::record(&work(dir)?, key, &rows[0].0, &rows[0].1, None, true)?;
    Ok(serde_json::json!({"analyzed":true}))
}

pub(crate) fn run(app: &AppHandle, payload: serde_json::Value) -> Result<serde_json::Value> {
    use chrono::Timelike;
    run_at(
        &directory(app)?,
        serde_json::from_value(payload)?,
        &crate::jobs::should_stop,
        &crate::jobs::progress_with_eta,
        &idle_seconds,
        &|| chrono::Local::now().hour(),
    )
}

fn run_at(
    dir: &Path,
    request: AnalyzeRequest,
    stop: &impl Fn() -> bool,
    report: &impl Fn(i64, i64, &str, Option<i64>),
    idle: &impl Fn() -> Option<u64>,
    hour: &impl Fn() -> u32,
) -> Result<serde_json::Value> {
    let _lock = lock(dir)?;
    if request.scope == "reuse" {
        let cache = Connection::open_with_flags(
            dir.join("music-analysis.sqlite3"),
            OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .context(
            "Restore an analysis backup or analyze some music before verifying reused results",
        )?;
        let has_features: bool = cache.query_row(
            "SELECT EXISTS(SELECT 1 FROM sonic_audio WHERE profile=?1)",
            [PROFILE],
            |r| r.get(0),
        )?;
        if !has_features {
            bail!(
                "Restore an analysis backup or analyze some music before verifying reused results"
            );
        }
    }
    let batch = request
        .batch_id
        .context("Analysis batch identity missing")?;
    let mut w = work(dir)?;
    w.execute(
        "INSERT OR IGNORE INTO sonic_batches(id) VALUES(?1)",
        [&batch],
    )?;
    let prepared: bool = w.query_row(
        "SELECT prepared FROM sonic_batches WHERE id=?1",
        [&batch],
        |r| r.get(0),
    )?;
    if !prepared && request.scope == "failed" {
        let tx = w.transaction()?;
        crate::sonic_failures::prepare_retry(&tx, &batch)?;
        tx.commit()?;
    } else if !prepared {
        let c = catalog(dir)?;
        let filter = match request.scope.as_str() {
            "all" | "reuse" => "1=1",
            "favorites" => "(love='L' OR normalized_rating>=80)",
            "album" => "album_id=?1",
            _ => bail!("Unknown analysis scope"),
        };
        if request.scope == "album" && request.album_id.as_ref().is_none_or(|id| id.is_empty()) {
            bail!("Select an album to analyze");
        }
        let sql=format!("SELECT file_path,filename FROM tracks WHERE {filter} AND lower(filename) LIKE '%.mp3' ORDER BY id");
        let mut q = c.prepare(&sql)?;
        let map = |r: &rusqlite::Row<'_>| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?));
        let rows = if request.scope == "album" {
            q.query_map([request.album_id.as_deref().unwrap_or("")], map)?
        } else {
            q.query_map([], map)?
        };
        let tx = w.transaction()?;
        for row in rows {
            if stop() {
                bail!("Analysis paused while preparing its queue");
            }
            let (directory, filename) = row?;
            tx.execute("INSERT OR IGNORE INTO sonic_items(batch_id,track_key,directory,filename) VALUES(?1,?2,?3,?4)",params![batch,track_key(&directory,&filename),directory,filename])?;
        }
        tx.execute("UPDATE sonic_batches SET prepared=1 WHERE id=?1", [&batch])?;
        tx.commit()?;
    }
    // Retry failed items without redoing completed work. Interrupted items stay pending.
    w.execute(
        "UPDATE sonic_items SET state='pending',error=NULL WHERE batch_id=?1 AND state='failed'",
        [&batch],
    )?;
    let total: i64 = w.query_row(
        "SELECT count(*) FROM sonic_items WHERE batch_id=?1",
        [&batch],
        |r| r.get(0),
    )?;
    let mut completed: i64 = w.query_row(
        "SELECT count(*) FROM sonic_items WHERE batch_id=?1 AND state!='pending'",
        [&batch],
        |r| r.get(0),
    )?;
    let mut reported = Instant::now() - Duration::from_secs(5);
    let mut waiting = false;
    let reuse_only = request.scope == "reuse";
    let mut estimate = AnalysisEstimate::default();
    let mut failed_this_run = 0;
    loop {
        if stop() {
            bail!("Analysis stopped at a durable checkpoint");
        }
        let item:Option<(String,String,String)>=w.query_row("SELECT track_key,directory,filename FROM sonic_items WHERE batch_id=?1 AND state='pending' ORDER BY track_key LIMIT 1",[&batch],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional()?;
        let Some((key, directory, filename)) = item else {
            break;
        };
        if !schedule(&w)?.allows(hour(), idle()) {
            if !waiting || reported.elapsed() >= Duration::from_secs(30) {
                report(
                    completed,
                    total,
                    "Waiting for idle time / scheduled hours",
                    None,
                );
                reported = Instant::now();
            }
            waiting = true;
            std::thread::sleep(Duration::from_secs(1));
            continue;
        }
        let action = if request.scope == "reuse" {
            "Checking reusable analysis"
        } else {
            "Analyzing"
        };
        if waiting || reported.elapsed() >= Duration::from_secs(2) {
            report(
                completed,
                total,
                &format!("{action} {filename}"),
                estimate.remaining(total - completed),
            );
            reported = Instant::now();
        }
        waiting = false;
        let started = Instant::now();
        let outcome = analyze_one_mode(dir, &directory, &filename, stop, reuse_only);
        if stop() {
            bail!("Analysis stopped at a durable checkpoint");
        }
        estimate.observe(
            outcome.as_ref().ok().copied(),
            started.elapsed(),
            reuse_only,
        );
        let ready = outcome
            .as_ref()
            .is_ok_and(|work| *work != AnalysisWork::Unmatched);
        let (state, error, fatal) = match outcome {
            Ok(_) => ("done", None, false),
            Err(e) => {
                failed_this_run += 1;
                let fatal = !e.is::<TrackAnalysisError>();
                ("failed", Some(format!("{e:#}")), fatal)
            }
        };
        let tx = w.transaction()?;
        tx.execute(
            "UPDATE sonic_items SET state=?3,error=?4 WHERE batch_id=?1 AND track_key=?2",
            params![batch, key, state, error],
        )?;
        crate::sonic_failures::record(&tx, &key, &directory, &filename, error.as_deref(), ready)?;
        tx.commit()?;
        completed += 1;
        if reported.elapsed() >= Duration::from_secs(2) || completed == total || fatal {
            let message = match &error {
                Some(error) => {
                    format!("{failed_this_run} files failed. Last file: {filename}. {error}")
                }
                None => format!("{action} {filename}"),
            };
            report(
                completed,
                total,
                &message,
                estimate.remaining(total - completed),
            );
            reported = Instant::now();
        }
        if fatal {
            bail!("Audio analysis stopped because the analyzer or its storage failed. Last file: {filename}. {} Completed analysis and remaining checkpoints are saved. Fix the reported problem, then retry this job.", error.as_deref().unwrap_or_default());
        }
    }
    let failed: i64 = w.query_row(
        "SELECT count(*) FROM sonic_items WHERE batch_id=?1 AND state='failed'",
        [&batch],
        |r| r.get(0),
    )?;
    Ok(serde_json::json!({"total":total,"failedCount":failed}))
}

pub(crate) fn attach(c: &Connection, dir: &Path) -> Result<bool> {
    let path = dir.join("music-analysis.sqlite3");
    if !path.exists() {
        return Ok(false);
    }
    // This connection is read-only; the attached database inherits read-only access.
    c.execute(
        "ATTACH DATABASE ?1 AS sonic",
        [path.to_string_lossy().as_ref()],
    )?;
    Ok(true)
}

fn row(r: &rusqlite::Row<'_>) -> rusqlite::Result<SonicTrack> {
    let directory: String = r.get(6)?;
    let filename: String = r.get(7)?;
    Ok(SonicTrack {
        album_artist: r.get::<_, Option<String>>(11)?.unwrap_or_default(),
        track_id: r.get(0)?,
        title: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
        artist: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
        album: r.get::<_, Option<String>>(3)?.unwrap_or_default(),
        album_id: r.get(4)?,
        genre: r.get(5)?,
        track_key: track_key(&directory, &filename),
        file_path: directory,
        filename,
        rating: r.get(8)?,
        seconds: r.get::<_, Option<i64>>(9)?.unwrap_or(0),
        loved: r.get::<_, Option<String>>(10)?.as_deref() == Some("L"),
        distance: None,
    })
}
const SELECT:&str="t.id,t.title,COALESCE(NULLIF(t.display_artist,''),t.album_artist_display),t.album,t.album_id,t.canonical_genre,t.file_path,t.filename,t.normalized_rating,t.time_seconds,t.love,t.album_artist_display";

fn active_sonic_batch(dir: &Path) -> Result<Option<String>> {
    let path = dir.join("jobs.sqlite3");
    if !path.is_file() {
        return Ok(None);
    }
    let c = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    c.busy_timeout(Duration::from_secs(5))?;
    let payload: Option<String> = c.query_row("SELECT payload_json FROM jobs WHERE kind IN ('sonicAnalysis','sonicReuse') AND state IN ('running','pausing','cancelling','queued','paused') ORDER BY CASE WHEN state IN ('running','pausing','cancelling') THEN 0 WHEN state='queued' THEN 1 ELSE 2 END,id DESC LIMIT 1", [], |r| r.get(0)).optional()?;
    Ok(payload
        .map(|json| serde_json::from_str::<AnalyzeRequest>(&json))
        .transpose()?
        .and_then(|r| r.batch_id))
}

pub(crate) fn status_at(dir: &Path) -> Result<SonicStatus> {
    let c = catalog(dir)?;
    let total = c.query_row(
        "SELECT count(*) FROM tracks WHERE lower(filename) LIKE '%.mp3'",
        [],
        |r| r.get(0),
    )?;
    let analyzed = if attach(&c, dir)? {
        c.query_row("SELECT count(*) FROM tracks t JOIN sonic.sonic_tracks s ON s.directory=t.file_path AND s.filename=t.filename WHERE s.profile=?1",[PROFILE],|r|r.get(0))?
    } else {
        0
    };
    let w = work(dir)?;
    let batch = active_sonic_batch(dir)?;
    let pending=w.query_row("SELECT count(*) FROM sonic_items WHERE batch_id=COALESCE(?1,(SELECT id FROM sonic_batches ORDER BY rowid DESC LIMIT 1)) AND state='pending'",[&batch],|r|r.get(0))?;
    let failed = w.query_row("SELECT count(*) FROM sonic_failures", [], |r| r.get(0))?;
    Ok(SonicStatus {
        analyzed,
        total,
        pending,
        failed,
        profile: PROFILE.into(),
        schedule: schedule(&w)?,
        idle_supported: cfg!(windows),
    })
}

fn seeds_at(dir: &Path) -> Result<Vec<SonicTrack>> {
    let c = catalog(dir)?;
    if !attach(&c, dir)? {
        return Ok(vec![]);
    }
    let mut q=c.prepare(&format!("SELECT {SELECT} FROM tracks t JOIN sonic.sonic_tracks s ON s.directory=t.file_path AND s.filename=t.filename WHERE s.profile=?1 AND COALESCE(t.love,'')!='B' ORDER BY s.analyzed_at DESC,t.id LIMIT 100"))?;
    let rows = q
        .query_map([PROFILE], row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub(crate) fn save_journey_at(
    dir: &Path,
    input: crate::sonic_journey::SaveJourneyRequest,
) -> Result<crate::ai::SavedPlaylist> {
    if input.name.trim().is_empty() || input.name.chars().count() > 120 {
        bail!("Name the journey with 1–120 characters");
    }
    input.journey.validate().map_err(anyhow::Error::msg)?;
    let c = crate::db::open_path(&dir.join("music-library.sqlite3"))?;
    if !attach(&c, dir)? {
        bail!("Analyze your chosen stops and more music before saving a journey");
    }
    let tx = c.unchecked_transaction()?;
    let tracks = crate::sonic_journey::reviewed(
        &tx,
        &input.journey,
        &input.track_keys,
        &std::collections::HashMap::new(),
    )
    .map_err(anyhow::Error::msg)?;
    let tracks = tracks
        .into_iter()
        .map(|t| crate::ai::AiPlaylistTrack {
            track_id: t.track_id,
            album_id: t.album_id,
            album: Some(t.album),
            album_artist: Some(t.album_artist),
            display_artist: Some(t.artist),
            title: Some(t.title),
            genre: t.genre,
            year: None,
            seconds: t.seconds,
            rating: t.rating,
            loved: t.loved,
            file_path: Some(t.file_path),
            filename: Some(t.filename),
        })
        .collect::<Vec<_>>();
    let count = tracks.len();
    let mut request = crate::models::BrowseRequest {
        view: "tracks".into(),
        ..Default::default()
    };
    // Exact identities also make the existing Smart-refresh guard apply.
    request.filters.track_ids = tracks.iter().map(|t| t.track_id).collect();
    let playlist = crate::ai::AiPlaylist {
        smart_settings: None,
        mixtape: None,
        prompt: format!("Sonic journey through {} chosen stops, in the reviewed order.", input.journey.stop_keys.len()),
        name: input.name.trim().into(),
        description: format!("Sonic journey through {} chosen stops with {} connecting tracks between stops. Profile {PROFILE}. Keep playlist order for the journey.", input.journey.stop_keys.len(), input.journey.connecting_tracks),
        request,
        strategy: "ranked".into(),
        target_track_count: count as u32,
        target_minutes: 0,
        max_tracks_per_artist: 10,
        max_tracks_per_album: 10,
        matching_track_count: count as i64,
        candidate_count: count,
        total_seconds: tracks.iter().map(|t| t.seconds).sum(),
        tracks,
        model: "Sonic Journey".into(),
        usage: crate::ai::AiUsage { input_tokens: None, cached_input_tokens: None, output_tokens: None },
    };
    let saved = crate::db::save_journey_playlist(
        &tx,
        crate::ai::SavePlaylistRequest {
            expected_updated_at: None,
            id: None,
            name: input.name.trim().into(),
            playlist,
        },
    )?;
    tx.commit()?;
    Ok(saved)
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_journey(
    app: AppHandle,
    request: crate::sonic_journey::JourneyRequest,
) -> Result<crate::sonic_journey::JourneyResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = directory(&app).map_err(|e| e.to_string())?;
        let c = catalog(&dir).map_err(|e| e.to_string())?;
        let has = attach(&c, &dir).map_err(|e| e.to_string())?;
        crate::sonic_journey::query(&c, has, &request, &std::collections::HashMap::new())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_journey_search(
    app: AppHandle,
    text: String,
) -> Result<Vec<crate::sonic_journey::JourneyTrack>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = directory(&app).map_err(|e| e.to_string())?;
        let c = catalog(&dir).map_err(|e| e.to_string())?;
        let has = attach(&c, &dir).map_err(|e| e.to_string())?;
        crate::sonic_journey::search(&c, has, &text, &std::collections::HashMap::new())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_save_journey(
    app: AppHandle,
    input: crate::sonic_journey::SaveJourneyRequest,
) -> Result<crate::ai::SavedPlaylist, String> {
    tauri::async_runtime::spawn_blocking(move || save_journey_at(&directory(&app)?, input))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

pub(crate) fn matches_at(dir: &Path, key: &str, limit: usize) -> Result<SonicMatches> {
    if !(1..=100).contains(&limit) || key.len() > 4096 {
        bail!("Similarity requests require a seed and a limit of 1–100");
    }
    let c = catalog(dir)?;
    matches_with_catalog(&c, dir, key, limit)
}

fn matches_with_catalog(
    c: &Connection,
    dir: &Path,
    key: &str,
    limit: usize,
) -> Result<SonicMatches> {
    let has_analysis = attach(&c, dir)?;
    matches_query(c, has_analysis, key, limit, true)
}
pub(crate) fn matches_query(
    c: &Connection,
    has_analysis: bool,
    key: &str,
    limit: usize,
    indexed: bool,
) -> Result<SonicMatches> {
    let source = c;
    let transaction = c.unchecked_transaction()?;
    let c = &*transaction;
    let total = crate::sonic_index::count(
        c,
        "mp3-total",
        "SELECT count(*) FROM tracks WHERE lower(filename) LIKE '%.mp3'",
        indexed,
    )?;
    let mut response = SonicMatches {
        analyzed: 0,
        total,
        seed_ready: false,
        tracks: vec![],
    };
    if !has_analysis {
        return Ok(response);
    }
    let seed:Option<(String,String,String,String,u64,String)>=c.query_row("SELECT a.features,p.weights,s.directory,s.filename,s.size,s.modified FROM sonic.sonic_tracks s JOIN sonic.sonic_audio a USING(audio_hash,profile) JOIN sonic.sonic_profiles p USING(profile) JOIN tracks t ON t.file_path=s.directory AND t.filename=s.filename WHERE s.track_key=?1 AND s.profile=?2",params![key,PROFILE],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get::<_,i64>(4)? as u64,r.get(5)?))).optional()?;
    let Some((features, weights, directory, filename, size, modified)) = seed else {
        return Ok(response);
    };
    if !file_is_current(&directory, &filename, size, &modified) {
        return Ok(response);
    }
    let seed = Analysis {
        profile: PROFILE.into(),
        features: serde_json::from_str(&features)?,
        weights: serde_json::from_str(&weights)?,
    };
    let metric = Metric::new(&seed).context("Incompatible analysis profile")?;
    response.seed_ready = true;
    let candidates = indexed
        .then(|| {
            crate::sonic_index::candidates(
                c,
                &seed,
                std::slice::from_ref(&seed.features),
                false,
                (limit * 16).max(1024),
                None,
                &Default::default(),
            )
        })
        .flatten();
    // Stream only identity and analysis; hydrate display metadata for the winners.
    let selection = candidates
        .as_ref()
        .map(|_| " AND s.track_key IN (SELECT value FROM json_each(?2))")
        .unwrap_or("");
    let mut q=c.prepare(&format!("SELECT t.id,t.file_path,t.filename,a.features,s.size,s.modified FROM sonic.sonic_tracks s CROSS JOIN tracks t ON s.directory=t.file_path AND s.filename=t.filename JOIN sonic.sonic_audio a USING(audio_hash,profile) WHERE s.profile=?1 AND COALESCE(t.love,'')!='B'{selection}"))?;
    let mut values = vec![rusqlite::types::Value::Text(PROFILE.into())];
    if let Some(candidates) = &candidates {
        values.push(rusqlite::types::Value::Text(candidates.keys.clone()));
        response.analyzed=crate::sonic_index::count(c,"tracks-unbanned","SELECT COUNT(*) FROM sonic.sonic_tracks s CROSS JOIN tracks t ON s.directory=t.file_path AND s.filename=t.filename JOIN sonic.sonic_audio a USING(audio_hash,profile) WHERE s.profile=?1 AND COALESCE(t.love,'')!='B'",true)?;
    }
    let rows = q.query_map(rusqlite::params_from_iter(values), |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, String>(3)?,
            r.get::<_, i64>(4)? as u64,
            r.get::<_, String>(5)?,
        ))
    })?;
    struct RankedTrack {
        id: i64,
        key: String,
        directory: String,
        filename: String,
        distance: f64,
        size: u64,
        modified: String,
    }
    fn compare(a: &RankedTrack, b: &RankedTrack) -> std::cmp::Ordering {
        a.distance.total_cmp(&b.distance).then(a.key.cmp(&b.key))
    }
    let mut ranked = Vec::new();
    for result in rows {
        let (id, directory, filename, features, size, modified) = result?;
        if candidates.is_none() {
            response.analyzed += 1;
        }
        let candidate_key = track_key(&directory, &filename);
        if candidate_key == key {
            continue;
        }
        let features: Vec<f32> = serde_json::from_str(&features)?;
        if let Some(d) = metric.distance(&features) {
            ranked.push(RankedTrack {
                id,
                key: candidate_key,
                directory,
                filename,
                distance: d,
                size,
                modified,
            });
            if ranked.len() > limit * 8 {
                ranked.sort_by(compare);
                ranked.truncate(limit * 4);
            }
        }
    }
    ranked.sort_by(compare);
    let mut metadata = c.prepare(&format!("SELECT {SELECT} FROM tracks t WHERE t.id=?1"))?;
    for candidate in ranked
        .into_iter()
        .filter(|t| file_is_current(&t.directory, &t.filename, t.size, &t.modified))
        .take(limit)
    {
        let mut track = metadata.query_row([candidate.id], row)?;
        track.distance = Some(candidate.distance);
        response.tracks.push(track);
    }
    if candidates.is_some() && response.tracks.len() < limit {
        crate::sonic_index::fallback();
        drop(metadata);
        drop(q);
        drop(transaction);
        return matches_query(source, has_analysis, key, limit, false);
    }
    Ok(response)
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_status(app: AppHandle) -> Result<SonicStatus, String> {
    tauri::async_runtime::spawn_blocking(move || status_at(&directory(&app)?))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_configure(
    app: AppHandle,
    schedule: SonicSchedule,
) -> Result<SonicStatus, String> {
    tauri::async_runtime::spawn_blocking(move||->Result<SonicStatus>{ schedule.validate()?;let dir=directory(&app)?;let w=work(&dir)?;w.execute("INSERT INTO sonic_settings VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET value=excluded.value",[serde_json::to_string(&schedule)?])?;status_at(&dir) }).await.map_err(|e|e.to_string())?.map_err(|e|e.to_string())
}
#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_seeds(app: AppHandle) -> Result<Vec<SonicTrack>, String> {
    tauri::async_runtime::spawn_blocking(move || seeds_at(&directory(&app)?))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_matches(
    app: AppHandle,
    track_key: String,
    limit: u32,
) -> Result<SonicMatches, String> {
    tauri::async_runtime::spawn_blocking(move || {
        matches_at(&directory(&app)?, &track_key, limit as usize)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}
#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_analyze(app: AppHandle, mut request: AnalyzeRequest) -> Result<i64, String> {
    if !matches!(
        request.scope.as_str(),
        "all" | "favorites" | "album" | "reuse" | "failed"
    ) {
        return Err("Unknown analysis scope".into());
    }
    request.batch_id = Some(format!(
        "{}-{}",
        std::process::id(),
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    let kind = if request.scope == "reuse" {
        "sonicReuse"
    } else {
        "sonicAnalysis"
    };
    crate::jobs::submit(
        &app,
        kind,
        serde_json::to_value(request).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_album_matches(
    app: AppHandle,
    request: crate::sonic_albums::SonicAlbumRequest,
) -> Result<crate::sonic_albums::SonicAlbumMatches, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = directory(&app).map_err(|e| e.to_string())?;
        let c = catalog(&dir).map_err(|e| e.to_string())?;
        let has_analysis = attach(&c, &dir).map_err(|e| e.to_string())?;
        crate::sonic_albums::query(
            &c,
            has_analysis,
            &request,
            &std::collections::HashMap::new(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_save_playlist(
    app: AppHandle,
    seed_key: String,
    name: String,
) -> Result<crate::ai::SavedPlaylist, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<crate::ai::SavedPlaylist> {
        if name.trim().is_empty() || name.len() > 200 {
            bail!("Choose a playlist name of 1–200 characters");
        }
        let matches = matches_at(&directory(&app)?, &seed_key, 100)?;
        if !matches.seed_ready || matches.tracks.is_empty() {
            bail!("Analyze the seed and more music before saving a similarity playlist");
        }
        let tracks = matches
            .tracks
            .into_iter()
            .map(|t| crate::ai::AiPlaylistTrack {
                track_id: t.track_id,
                album_id: t.album_id,
                album: Some(t.album),
                album_artist: Some(t.album_artist),
                display_artist: Some(t.artist),
                title: Some(t.title),
                genre: t.genre,
                year: None,
                seconds: t.seconds,
                rating: t.rating,
                loved: t.loved,
                file_path: Some(t.file_path),
                filename: Some(t.filename),
            })
            .collect::<Vec<_>>();
        let total_seconds = tracks.iter().map(|t| t.seconds).sum();
        let count = tracks.len();
        let playlist = crate::ai::AiPlaylist {
            smart_settings: None,
            mixtape: None,
            prompt: String::new(),
            name: name.trim().into(),
            description: format!(
                "Sounds like the selected track. {} analyzed library tracks; profile {PROFILE}.",
                matches.analyzed
            ),
            request: crate::models::BrowseRequest::default(),
            strategy: "balanced".into(),
            target_track_count: count as u32,
            target_minutes: 0,
            max_tracks_per_artist: 100,
            max_tracks_per_album: 100,
            matching_track_count: matches.analyzed,
            candidate_count: count,
            total_seconds,
            tracks,
            model: "local sonic analysis".into(),
            usage: crate::ai::AiUsage {
                input_tokens: None,
                cached_input_tokens: None,
                output_tokens: None,
            },
        };
        crate::db::save_playlist_for_app(
            &app,
            crate::ai::SavePlaylistRequest {
                expected_updated_at: None,
                id: None,
                name: name.trim().into(),
                playlist,
            },
        )
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failed_only_run_retains_the_library_queue_and_resolves_successful_retries() {
        let dir = fixture();
        let w = work(dir.path()).unwrap();
        let folder = dir.path().to_string_lossy();
        let key = track_key(&folder, "1.mp3");
        crate::sonic_failures::record(&w, &key, &folder, "1.mp3", Some("Old decoder error"), false)
            .unwrap();
        let missing_key = track_key(&folder, "missing.mp3");
        crate::sonic_failures::record(
            &w,
            &missing_key,
            &folder,
            "missing.mp3",
            Some("Old missing file error"),
            false,
        )
        .unwrap();
        w.execute_batch("INSERT INTO sonic_batches VALUES('library',1);
            INSERT INTO sonic_items VALUES('library','pending','folder','pending.mp3','pending',NULL);").unwrap();
        w.execute(
            "INSERT INTO sonic_settings VALUES(1,?1)",
            [serde_json::to_string(&SonicSchedule {
                idle_only: false,
                ..Default::default()
            })
            .unwrap()],
        )
        .unwrap();
        let result = run_at(
            dir.path(),
            AnalyzeRequest {
                scope: "failed".into(),
                album_id: None,
                batch_id: Some("retry".into()),
            },
            &|| false,
            &|_, _, _, _| {},
            &|| Some(0),
            &|| 12,
        )
        .unwrap();
        assert_eq!(result["total"], 2);
        assert_eq!(result["failedCount"], 1);
        assert_eq!(
            w.query_row(
                "SELECT state FROM sonic_items WHERE batch_id='library'",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "pending"
        );
        let failures = crate::sonic_failures::list_at(dir.path(), None).unwrap();
        assert_eq!(failures.total, 1);
        assert_eq!(failures.rows[0].filename, "missing.mp3");
        assert_ne!(failures.rows[0].error, "Old missing file error");
        assert!(failures.rows[0].last_failed_at.is_some());
        assert_eq!(status_at(dir.path()).unwrap().failed, 1);
        assert_eq!(status_at(dir.path()).unwrap().analyzed, 3);
        let key = track_key(&folder, "3.mp3");
        crate::sonic_failures::record(&w, &key, &folder, "3.mp3", Some("Earlier failure"), false)
            .unwrap();
        analyze_headless(dir.path(), &key).unwrap();
        assert_eq!(
            crate::sonic_failures::list_at(dir.path(), None)
                .unwrap()
                .total,
            1
        );
    }

    #[test]
    fn missing_audio_features_are_not_treated_as_completed_cached_analysis() {
        let dir = fixture();
        let s = results(dir.path()).unwrap();
        s.execute("DELETE FROM sonic_audio WHERE audio_hash='hash1'", [])
            .unwrap();
        assert_eq!(
            analyze_one_mode(
                dir.path(),
                &dir.path().to_string_lossy(),
                "1.mp3",
                &|| false,
                true
            )
            .unwrap(),
            AnalysisWork::Unmatched
        );
    }

    #[test]
    fn estimate_uses_new_successes_and_excludes_cache_failures_and_waits() {
        let mut estimate = AnalysisEstimate::default();
        for _ in 0..10_000 {
            estimate.observe(Some(AnalysisWork::Cached), Duration::from_millis(2), false);
        }
        estimate.observe(None, Duration::from_millis(5), false);
        assert_eq!(estimate.remaining(1_000_000), None);
        for _ in 0..3 {
            estimate.observe(Some(AnalysisWork::Extracted), Duration::from_secs(2), false);
        }
        assert_eq!(estimate.remaining(1_000_000), Some(2_000_000));
        estimate.observe(Some(AnalysisWork::Reused), Duration::from_millis(10), false);
        assert_eq!(estimate.remaining(1_000_000), Some(2_000_000));
        // An idle wait is never a sample; remaining() does not read wall time.
        assert_eq!(estimate.remaining(500_000), Some(1_000_000));
        estimate.observe(None, Duration::from_secs(180), false);
        estimate.observe(Some(AnalysisWork::Cached), Duration::from_millis(1), false);
        assert_eq!(estimate.remaining(500_000), None);
        estimate.observe(Some(AnalysisWork::Extracted), Duration::from_secs(2), false);
        assert_eq!(estimate.remaining(500_000), Some(1_000_000));
        assert_eq!(AnalysisEstimate::default().remaining(500_000), None);
        assert_eq!(estimate.remaining(0), None);
    }

    #[test]
    fn reuse_estimate_samples_verified_and_unmatched_files_without_decoding() {
        let mut estimate = AnalysisEstimate::default();
        for work in [
            AnalysisWork::Reused,
            AnalysisWork::Unmatched,
            AnalysisWork::Reused,
        ] {
            estimate.observe(Some(work), Duration::from_millis(100), true);
        }
        assert_eq!(estimate.remaining(1_000), Some(100));
    }

    #[test]
    fn file_failures_are_saved_without_stopping_remaining_tracks() {
        let dir = fixture();
        let w = work(dir.path()).unwrap();
        w.execute_batch("INSERT INTO sonic_batches VALUES('broken-decoder',1);")
            .unwrap();
        w.execute(
            "INSERT INTO sonic_settings VALUES(1,?1)",
            [serde_json::to_string(&SonicSchedule {
                idle_only: false,
                ..SonicSchedule::default()
            })
            .unwrap()],
        )
        .unwrap();
        for i in 0..12 {
            let filename = format!("missing-{i:02}.mp3");
            w.execute("INSERT INTO sonic_items(batch_id,track_key,directory,filename) VALUES('broken-decoder',?1,?2,?3)", params![filename, dir.path().to_string_lossy(), filename]).unwrap();
        }
        // A cluster of file failures must not prevent other tracks from finishing.
        for i in 1..=3 {
            w.execute("INSERT INTO sonic_items(batch_id,track_key,directory,filename) VALUES('broken-decoder',?1,?2,?3)", params![format!("missing-{:02}-cached", i * 2), dir.path().to_string_lossy(), format!("{i}.mp3")]).unwrap();
        }
        let reports = std::cell::RefCell::new(Vec::new());
        let result = run_at(
            dir.path(),
            AnalyzeRequest {
                scope: "all".into(),
                album_id: None,
                batch_id: Some("broken-decoder".into()),
            },
            &|| false,
            &|completed, _, message, eta| {
                reports
                    .borrow_mut()
                    .push((completed, message.to_string(), eta))
            },
            &|| None,
            &|| 12,
        )
        .unwrap();
        assert_eq!(result["failedCount"], 12);
        assert_eq!(
            w.query_row(
                "SELECT count(*) FROM sonic_items WHERE state='failed'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            12
        );
        assert_eq!(
            w.query_row(
                "SELECT count(*) FROM sonic_items WHERE state='pending'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
        assert!(reports.borrow().iter().all(|(_, _, eta)| eta.is_none()));
        assert_eq!(reports.borrow().last().unwrap().0, 15);
        assert!(reports
            .borrow()
            .last()
            .unwrap()
            .1
            .contains("12 files failed"));
        assert_eq!(status_at(dir.path()).unwrap().analyzed, 3);
        assert_eq!(
            crate::sonic_failures::list_at(dir.path(), None)
                .unwrap()
                .total,
            12
        );
    }

    #[test]
    fn database_failure_stops_immediately_and_preserves_remaining_queue() {
        let dir = fixture();
        let w = work(dir.path()).unwrap();
        w.execute_batch("INSERT INTO sonic_batches VALUES('storage-failure',1);")
            .unwrap();
        w.execute(
            "INSERT INTO sonic_settings VALUES(1,?1)",
            [serde_json::to_string(&SonicSchedule {
                idle_only: false,
                ..Default::default()
            })
            .unwrap()],
        )
        .unwrap();
        for key in ["a", "b"] {
            w.execute("INSERT INTO sonic_items(batch_id,track_key,directory,filename) VALUES('storage-failure',?1,'folder','track.mp3')", [key]).unwrap();
        }
        let catalog = Connection::open(dir.path().join("music-library.sqlite3")).unwrap();
        catalog
            .execute_batch("ALTER TABLE tracks RENAME COLUMN file_path TO old_file_path;")
            .unwrap();
        let error = run_at(
            dir.path(),
            AnalyzeRequest {
                scope: "all".into(),
                album_id: None,
                batch_id: Some("storage-failure".into()),
            },
            &|| false,
            &|_, _, _, _| {},
            &|| None,
            &|| 12,
        )
        .unwrap_err();
        assert!(error.to_string().contains("analyzer or its storage failed"));
        assert_eq!(
            w.query_row(
                "SELECT count(*) FROM sonic_items WHERE state='pending'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
        assert_eq!(
            crate::sonic_failures::list_at(dir.path(), None)
                .unwrap()
                .total,
            1
        );
    }

    #[test]
    fn analyzer_file_exit_is_distinct_from_crashes_and_protocol_failures() {
        assert!(analyzer_failure(Some(2), "Unsupported audio codec").is::<TrackAnalysisError>());
        assert!(!analyzer_failure(Some(1), "Missing argument").is::<TrackAnalysisError>());
        assert!(!analyzer_failure(None, "Process crashed").is::<TrackAnalysisError>());
    }

    #[test]
    fn decoder_failures_in_an_album_do_not_block_a_later_mpeg_layer_two_track() {
        let dir = tempfile::tempdir().unwrap();
        let catalog = Connection::open(dir.path().join("music-library.sqlite3")).unwrap();
        catalog
            .execute_batch("CREATE TABLE tracks(file_path TEXT,filename TEXT);")
            .unwrap();
        let w = work(dir.path()).unwrap();
        w.execute_batch("INSERT INTO sonic_batches VALUES('decode-errors',1);")
            .unwrap();
        w.execute(
            "INSERT INTO sonic_settings VALUES(1,?1)",
            [serde_json::to_string(&SonicSchedule {
                idle_only: false,
                ..Default::default()
            })
            .unwrap()],
        )
        .unwrap();
        let folder = dir.path().to_string_lossy();
        for i in 0..13 {
            let name = if i < 12 {
                format!("bad-{i:02}.mp3")
            } else {
                "z-layer-two.mp3".into()
            };
            let data: &[u8] = if i < 12 {
                b"Not an audio stream"
            } else {
                include_bytes!("../../Tools/sonic-analyzer/tests/fixtures/mpeg-layer2.mp3")
            };
            fs::write(dir.path().join(&name), data).unwrap();
            catalog
                .execute("INSERT INTO tracks VALUES(?1,?2)", params![folder, name])
                .unwrap();
            w.execute("INSERT INTO sonic_items(batch_id,track_key,directory,filename) VALUES('decode-errors',?1,?2,?3)", params![name, folder, name]).unwrap();
        }
        let result = run_at(
            dir.path(),
            AnalyzeRequest {
                scope: "all".into(),
                album_id: None,
                batch_id: Some("decode-errors".into()),
            },
            &|| false,
            &|_, _, _, _| {},
            &|| None,
            &|| 12,
        )
        .unwrap();
        assert_eq!(result["total"], 13);
        assert_eq!(result["failedCount"], 12);
        assert_eq!(status_at(dir.path()).unwrap().analyzed, 1);
        assert_eq!(
            crate::sonic_failures::list_at(dir.path(), None)
                .unwrap()
                .total,
            12
        );
        assert_eq!(
            w.query_row(
                "SELECT count(*) FROM sonic_items WHERE state='pending'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
    }

    #[test]
    fn cached_resumed_checkpoints_do_not_generate_an_analysis_estimate() {
        let dir = fixture();
        let w = work(dir.path()).unwrap();
        w.execute(
            "INSERT INTO sonic_settings VALUES(1,?1)",
            [serde_json::to_string(&SonicSchedule {
                idle_only: false,
                ..SonicSchedule::default()
            })
            .unwrap()],
        )
        .unwrap();
        let result = run_at(
            dir.path(),
            AnalyzeRequest {
                scope: "all".into(),
                album_id: None,
                batch_id: Some("cached-eta".into()),
            },
            &|| false,
            &|_, _, _, eta| assert_eq!(eta, None),
            &|| None,
            &|| 12,
        )
        .unwrap();
        assert_eq!(result["failedCount"], 0);
    }
    use music_sonic_core::DIMENSIONS;
    #[test]
    fn journey_save_preserves_the_exact_five_stop_preview_and_rejects_changed_files() {
        let dir = tempfile::tempdir().unwrap();
        let database = dir.path().join("music-library.sqlite3");
        let c = crate::db::open_path(&database).unwrap();
        c.execute("INSERT INTO import_runs(id,source_path,started_at,completed_at,status) VALUES(1,'test','now','now','completed')", []).unwrap();
        let s = results(dir.path()).unwrap();
        let mut weights = vec![0f32; DIMENSIONS * DIMENSIONS];
        weights[0] = 1.;
        s.execute(
            "INSERT INTO sonic_profiles VALUES(?1,?2)",
            params![PROFILE, serde_json::to_string(&weights).unwrap()],
        )
        .unwrap();
        let mut keys = Vec::new();
        for i in 0..9 {
            let filename = format!("{i}.mp3");
            let path = dir.path().join(&filename);
            fs::write(&path, [255; 256]).unwrap();
            let key = track_key(&dir.path().to_string_lossy(), &filename);
            c.execute("INSERT INTO tracks(id,import_run_id,album_id,title,display_artist,album_artist_display,album,file_path,filename,normalized_rating,time_seconds,row_hash) VALUES(?1,1,'album',?2,'Singer','Various Artists','Album',?3,?4,80,180,?5)", params![i+1,format!("Song {i}"),dir.path().to_string_lossy(),filename,key]).unwrap();
            let mut features = vec![0f32; DIMENSIONS];
            features[0] = i as f32;
            s.execute(
                "INSERT INTO sonic_audio VALUES(?1,?2,?3)",
                params![filename, PROFILE, serde_json::to_string(&features).unwrap()],
            )
            .unwrap();
            let (size, modified) = signature(&path).unwrap();
            s.execute(
                "INSERT INTO sonic_tracks VALUES(?1,?2,?3,?4,?5,?6,?7,'now')",
                params![
                    key,
                    dir.path().to_string_lossy(),
                    filename,
                    filename,
                    PROFILE,
                    size as i64,
                    modified
                ],
            )
            .unwrap();
            keys.push(key);
        }
        drop(c);
        drop(s);
        let input = crate::sonic_journey::SaveJourneyRequest {
            journey: crate::sonic_journey::JourneyRequest {
                stop_keys: keys.iter().step_by(2).cloned().collect(),
                connecting_tracks: 1,
                minimum_rating: None,
                same_genre: false,
            },
            track_keys: keys.clone(),
            name: "Five stop journey".into(),
        };
        let saved = save_journey_at(dir.path(), input.clone()).unwrap();
        assert_eq!(
            saved
                .playlist
                .tracks
                .iter()
                .map(|t| t.track_id)
                .collect::<Vec<_>>(),
            (1..=9).collect::<Vec<_>>()
        );
        assert_eq!(
            saved.playlist.tracks[0].album_artist.as_deref(),
            Some("Various Artists")
        );
        assert_eq!(
            saved.playlist.tracks[0].display_artist.as_deref(),
            Some("Singer")
        );
        assert!(!saved.automation.smart);
        assert_eq!(saved.playlist.model, "Sonic Journey");
        assert_eq!(
            saved.playlist.request.filters.track_ids,
            (1..=9).collect::<Vec<_>>()
        );
        fs::write(dir.path().join("1.mp3"), [255; 257]).unwrap();
        assert!(save_journey_at(dir.path(), input).is_err());
        let c = crate::db::open_path(&database).unwrap();
        assert_eq!(
            c.query_row("SELECT COUNT(*) FROM saved_playlists", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        drop(c);
        crate::db::pool_for_path(&database)
            .unwrap()
            .shutdown()
            .unwrap();
    }
    fn fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let c = Connection::open(dir.path().join("music-library.sqlite3")).unwrap();
        c.execute_batch("CREATE TABLE tracks(id INTEGER PRIMARY KEY,title TEXT,display_artist TEXT,album_artist_display TEXT,album TEXT,album_id TEXT,canonical_genre TEXT,file_path TEXT,filename TEXT,normalized_rating INTEGER,time_seconds INTEGER,love TEXT);").unwrap();
        let s = results(dir.path()).unwrap();
        let mut weights = vec![0f32; DIMENSIONS * DIMENSIONS];
        for i in 0..DIMENSIONS {
            weights[i * DIMENSIONS + i] = 1.;
        }
        s.execute(
            "INSERT INTO sonic_profiles VALUES(?1,?2)",
            params![PROFILE, serde_json::to_string(&weights).unwrap()],
        )
        .unwrap();
        for i in 1..=3 {
            let filename = format!("{i}.mp3");
            let path = dir.path().join(&filename);
            fs::write(&path, [255; 256]).unwrap();
            c.execute("INSERT INTO tracks VALUES(?1,'Song','Singer','Various Artists','Album','album','Pop',?2,?3,80,180,NULL)",params![i,dir.path().to_string_lossy(),filename]).unwrap();
            let hash = format!("hash{i}");
            let mut features = vec![0.; DIMENSIONS];
            features[0] = i as f32;
            s.execute(
                "INSERT INTO sonic_audio VALUES(?1,?2,?3)",
                params![hash, PROFILE, serde_json::to_string(&features).unwrap()],
            )
            .unwrap();
            let (size, modified) = signature(&path).unwrap();
            s.execute(
                "INSERT INTO sonic_tracks VALUES(?1,?2,?3,?4,?5,?6,?7,'now')",
                params![
                    track_key(&dir.path().to_string_lossy(), &filename),
                    dir.path().to_string_lossy(),
                    filename,
                    hash,
                    PROFILE,
                    size as i64,
                    modified
                ],
            )
            .unwrap();
        }
        dir
    }
    #[test]
    fn schedule_gates_input_and_midnight_hours() {
        let s = SonicSchedule {
            idle_only: true,
            idle_minutes: 5,
            start_hour: Some(22),
            end_hour: Some(8),
        };
        assert!(s.allows(23, Some(301)));
        assert!(s.allows(0, Some(300)));
        assert!(!s.allows(8, Some(900)));
        assert!(!s.allows(23, Some(299)));
        assert!(!s.allows(23, None));
        let mut invalid = s;
        invalid.end_hour = Some(22);
        assert!(invalid.validate().is_err());
    }
    #[test]
    fn partial_results_resolve_current_ids_and_reject_replacements() {
        let dir = fixture();
        let key = track_key(&dir.path().to_string_lossy(), "1.mp3");
        let c = Connection::open(dir.path().join("music-library.sqlite3")).unwrap();
        c.execute("UPDATE tracks SET id=900 WHERE id=2", [])
            .unwrap();
        c.execute("UPDATE tracks SET love='B' WHERE id=3", [])
            .unwrap();
        let matches = matches_at(dir.path(), &key, 10).unwrap();
        assert!(matches.seed_ready);
        assert_eq!(matches.tracks.len(), 1);
        assert_eq!(matches.tracks[0].track_id, 900);
        assert_eq!(matches.tracks[0].album_artist, "Various Artists");
        fs::write(dir.path().join("2.mp3"), [255; 257]).unwrap();
        assert!(matches_at(dir.path(), &key, 10).unwrap().tracks.is_empty());
        c.execute("DELETE FROM tracks WHERE id=1", []).unwrap();
        assert!(!matches_at(dir.path(), &key, 10).unwrap().seed_ready);
    }
    #[test]
    fn track_matching_reads_display_metadata_only_for_final_matches() {
        use std::sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        };
        let dir = fixture();
        let c = Connection::open(dir.path().join("music-library.sqlite3")).unwrap();
        c.execute_batch("WITH RECURSIVE n(x) AS (VALUES(4) UNION ALL SELECT x+1 FROM n WHERE x<1003)
            INSERT INTO tracks SELECT x,'Far song','Singer','Various Artists','Album','album','Pop',
                (SELECT file_path FROM tracks WHERE id=1),'far-'||x||'.mp3',80,180,NULL FROM n;
            ALTER TABLE tracks RENAME TO raw_tracks;
            CREATE VIEW tracks AS SELECT id,counted_title(title) AS title,display_artist,album_artist_display,
                album,album_id,canonical_genre,file_path,filename,normalized_rating,time_seconds,love FROM raw_tracks;").unwrap();
        let s = results(dir.path()).unwrap();
        s.execute_batch("WITH RECURSIVE n(x) AS (VALUES(4) UNION ALL SELECT x+1 FROM n WHERE x<1003)
            INSERT INTO sonic_tracks SELECT 'far-key-'||x,directory,'far-'||x||'.mp3',audio_hash,profile,size,modified,analyzed_at
                FROM n CROSS JOIN sonic_tracks WHERE filename='3.mp3';").unwrap();
        drop(s);
        // Use the production read-only adapter with a connection-local metadata probe.
        let calls = Arc::new(AtomicUsize::new(0));
        let counter = calls.clone();
        let reader = catalog(dir.path()).unwrap();
        reader
            .create_scalar_function(
                "counted_title",
                1,
                rusqlite::functions::FunctionFlags::SQLITE_UTF8,
                move |ctx| {
                    counter.fetch_add(1, Ordering::Relaxed);
                    ctx.get::<String>(0)
                },
            )
            .unwrap();
        let key = track_key(&dir.path().to_string_lossy(), "1.mp3");
        let matches = matches_with_catalog(&reader, dir.path(), &key, 2).unwrap();
        assert!(matches.seed_ready);
        assert_eq!(matches.total, 1003);
        assert_eq!(matches.analyzed, 1003);
        assert_eq!(
            matches
                .tracks
                .iter()
                .map(|t| t.track_id)
                .collect::<Vec<_>>(),
            vec![2, 3]
        );
        assert_eq!(calls.load(Ordering::Relaxed), 2);
        assert_eq!(matches.tracks[0].title, "Song");
        assert_eq!(matches.tracks[0].album_artist, "Various Artists");
    }
    #[test]
    fn tag_edits_reuse_audio_features_without_decoding() {
        let dir = fixture();
        let path = dir.path().join("1.mp3");
        let hash = audio_hash(&path).unwrap();
        let s = results(dir.path()).unwrap();
        s.execute(
            "UPDATE sonic_audio SET audio_hash=?1 WHERE audio_hash='hash1'",
            [&hash],
        )
        .unwrap();
        let mut tagged = b"ID3\x04\0\0\0\0\0\x03tag".to_vec();
        tagged.extend_from_slice(&[255; 256]);
        fs::write(&path, tagged).unwrap();
        assert_eq!(hash, audio_hash(&path).unwrap());
        // No analyzer is invoked: an existing audio hash reuses its features.
        analyze_one(dir.path(), &dir.path().to_string_lossy(), "1.mp3", &|| {
            false
        })
        .unwrap();
        let key = track_key(&dir.path().to_string_lossy(), "1.mp3");
        assert!(matches_at(dir.path(), &key, 10).unwrap().seed_ready);
        assert_eq!(
            s.query_row("SELECT count(*) FROM sonic_audio", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            3
        );
    }
    #[test]
    fn read_only_queries_and_process_lock_preserve_catalog() {
        let dir = fixture();
        let c = catalog(dir.path()).unwrap();
        assert!(attach(&c, dir.path()).unwrap());
        assert!(c.execute("DELETE FROM tracks", []).is_err());
        assert!(c.execute("DELETE FROM sonic.sonic_audio", []).is_err());
        let held = lock(dir.path()).unwrap();
        assert!(lock(dir.path()).is_err());
        drop(held);
        assert!(lock(dir.path()).is_ok());
        let w = work(dir.path()).unwrap();
        w.execute_batch("INSERT INTO sonic_batches VALUES('old',1);INSERT INTO sonic_items(batch_id,track_key,directory,filename) VALUES('old','old','x','x');INSERT INTO sonic_batches VALUES('new',1);").unwrap();
        assert_eq!(status_at(dir.path()).unwrap().pending, 0);
    }

    #[test]
    fn restored_features_bind_only_to_hash_verified_local_paths_with_new_catalog_ids() {
        let source = fixture();
        let s = results(source.path()).unwrap();
        // Use genuine payload identities; the archive never contains path observations.
        s.execute("DELETE FROM sonic_audio", []).unwrap();
        s.execute("DELETE FROM sonic_tracks", []).unwrap();
        for i in 1..=3 {
            let hash = audio_hash(&source.path().join(format!("{i}.mp3"))).unwrap();
            s.execute(
                "INSERT OR IGNORE INTO sonic_audio VALUES(?1,?2,?3)",
                params![
                    hash,
                    PROFILE,
                    serde_json::to_string(&vec![i as f32; DIMENSIONS]).unwrap()
                ],
            )
            .unwrap();
        }
        drop(s);
        let archive = crate::sonic_backup::export_at(
            source.path(),
            &source.path().join("OneDrive/sonic-analysis"),
        )
        .unwrap();
        let target = fixture();
        let s = results(target.path()).unwrap();
        s.execute("DELETE FROM sonic_tracks", []).unwrap();
        s.execute("DELETE FROM sonic_audio", []).unwrap();
        s.execute("DELETE FROM sonic_profiles", []).unwrap();
        drop(s);
        let c = Connection::open(target.path().join("music-library.sqlite3")).unwrap();
        c.execute("UPDATE tracks SET id=id+1000", []).unwrap();
        drop(c);
        // Tags and timestamps differ on the receiving computer; payload is the identity.
        let mut tagged = b"ID3\x04\0\0\0\0\0\x03tag".to_vec();
        tagged.extend_from_slice(&[255; 256]);
        fs::write(target.path().join("1.mp3"), tagged).unwrap();
        let imported = crate::sonic_backup::restore_at(
            target.path(),
            Path::new(&archive.path),
            &archive.sha256,
        )
        .unwrap();
        assert!(imported.added > 0);
        assert!(seeds_at(target.path()).unwrap().is_empty());
        analyze_one_mode(
            target.path(),
            &target.path().to_string_lossy(),
            "1.mp3",
            &|| false,
            true,
        )
        .unwrap();
        let key = track_key(&target.path().to_string_lossy(), "1.mp3");
        assert!(matches_at(target.path(), &key, 10).unwrap().seed_ready);
        assert_eq!(seeds_at(target.path()).unwrap()[0].track_id, 1001);
        // Changed audio has no reusable result, and a reuse scan never invokes extraction.
        fs::write(target.path().join("2.mp3"), [17; 256]).unwrap();
        analyze_one_mode(
            target.path(),
            &target.path().to_string_lossy(),
            "2.mp3",
            &|| false,
            true,
        )
        .unwrap();
        assert_eq!(seeds_at(target.path()).unwrap().len(), 1);
        assert!(audio_hash_with_stop(&target.path().join("1.mp3"), &|| true).is_err());
        let w = work(target.path()).unwrap();
        w.execute(
            "INSERT INTO sonic_settings VALUES(1,?1)",
            [serde_json::to_string(&SonicSchedule {
                idle_only: false,
                ..SonicSchedule::default()
            })
            .unwrap()],
        )
        .unwrap();
        let result = run_at(
            target.path(),
            AnalyzeRequest {
                scope: "reuse".into(),
                album_id: None,
                batch_id: Some("reuse-test".into()),
            },
            &|| false,
            &|_, _, _, _| {},
            &|| None,
            &|| 12,
        )
        .unwrap();
        assert_eq!(result["total"], 3);
        assert_eq!(result["failedCount"], 0);
        assert_eq!(seeds_at(target.path()).unwrap().len(), 2);
    }
    #[test]
    fn future_analysis_schema_is_preserved() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("music-analysis.sqlite3");
        let c = Connection::open(&path).unwrap();
        c.execute_batch("PRAGMA user_version=2; CREATE TABLE future(value); INSERT INTO future VALUES('preserve');").unwrap();
        assert!(results(dir.path()).is_err());
        assert_eq!(
            c.pragma_query_value(None, "user_version", |r| r.get::<_, i32>(0))
                .unwrap(),
            2
        );
    }

    #[test]
    fn coverage_reports_the_active_batch_after_resuming_older_analysis() {
        let dir = fixture();
        let w = work(dir.path()).unwrap();
        w.execute_batch("INSERT INTO sonic_batches VALUES('old',1); INSERT INTO sonic_items VALUES('old','old','x','x','pending',NULL); INSERT INTO sonic_batches VALUES('new',1); INSERT INTO sonic_items VALUES('new','new','x','x','done',NULL);").unwrap();
        assert_eq!(status_at(dir.path()).unwrap().pending, 0);
        let j = Connection::open(dir.path().join("jobs.sqlite3")).unwrap();
        crate::jobs::ensure_schema(&j).unwrap();
        crate::jobs::enqueue(
            &j,
            "sonicAnalysis",
            "Audio analysis",
            &serde_json::to_string(&AnalyzeRequest {
                scope: "all".into(),
                album_id: None,
                batch_id: Some("old".into()),
            })
            .unwrap(),
            true,
            true,
            true,
            None,
        )
        .unwrap();
        j.execute("UPDATE jobs SET state='running'", []).unwrap();
        assert_eq!(status_at(dir.path()).unwrap().pending, 1);
    }

    #[test]
    fn reuse_without_a_cache_does_not_prepare_a_million_file_queue() {
        let dir = tempfile::tempdir().unwrap();
        let result = run_at(
            dir.path(),
            AnalyzeRequest {
                scope: "reuse".into(),
                album_id: None,
                batch_id: Some("empty-cache".into()),
            },
            &|| false,
            &|_, _, _, _| {},
            &|| None,
            &|| 12,
        );
        assert!(result.is_err());
        assert!(!dir.path().join("sonic-work.sqlite3").exists());
        assert!(!dir.path().join("music-analysis.sqlite3").exists());
    }
    #[test]
    fn idle_wait_and_resume_keep_each_completed_checkpoint() {
        use std::sync::atomic::{AtomicBool, Ordering};
        let dir = fixture();
        let request = AnalyzeRequest {
            scope: "all".into(),
            album_id: None,
            batch_id: Some("resume-test".into()),
        };
        let w = work(dir.path()).unwrap();
        let settings = SonicSchedule {
            idle_only: true,
            idle_minutes: 5,
            start_hour: Some(22),
            end_hour: Some(8),
        };
        w.execute(
            "INSERT INTO sonic_settings VALUES(1,?1)",
            [serde_json::to_string(&settings).unwrap()],
        )
        .unwrap();
        let stop = AtomicBool::new(false);
        // Simulate active input: no checkpoint advances before the job stops.
        assert!(run_at(
            dir.path(),
            request.clone(),
            &|| stop.load(Ordering::SeqCst),
            &|_, _, message, _| {
                assert!(message.contains("Waiting"));
                stop.store(true, Ordering::SeqCst);
            },
            &|| Some(10),
            &|| 23
        )
        .is_err());
        assert_eq!(status_at(dir.path()).unwrap().pending, 3);
        stop.store(false, Ordering::SeqCst);
        // On return to idle, finish one track then pause at its saved boundary.
        assert!(run_at(
            dir.path(),
            request.clone(),
            &|| w.query_row("SELECT count(*) FROM sonic_items WHERE batch_id='resume-test' AND state='done'", [], |r| r.get::<_, i64>(0)).unwrap() == 1,
            &|_, _, _, _| {},
            &|| Some(301),
            &|| 23
        )
        .is_err());
        assert_eq!(status_at(dir.path()).unwrap().pending, 2);
        let result = run_at(
            dir.path(),
            request,
            &|| false,
            &|_, _, _, _| {},
            &|| Some(301),
            &|| 23,
        )
        .unwrap();
        assert_eq!(result["total"], 3);
        assert_eq!(result["failedCount"], 0);
        assert_eq!(status_at(dir.path()).unwrap().pending, 0);
    }

    #[test]
    fn disabling_schedule_reports_active_work_before_advancing_a_checkpoint() {
        let dir = fixture();
        let w = work(dir.path()).unwrap();
        let restricted = SonicSchedule {
            idle_only: true,
            idle_minutes: 5,
            start_hour: Some(22),
            end_hour: Some(8),
        };
        w.execute(
            "INSERT INTO sonic_settings VALUES(1,?1)",
            [serde_json::to_string(&restricted).unwrap()],
        )
        .unwrap();
        let saw_wait = std::cell::Cell::new(false);
        let saw_active = std::cell::Cell::new(false);
        let result = run_at(
            dir.path(),
            AnalyzeRequest { scope: "all".into(), album_id: None, batch_id: Some("schedule-change".into()) },
            &|| false,
            &|completed, _, message, _| {
                if message.contains("Waiting") {
                    saw_wait.set(true);
                    let unrestricted = SonicSchedule { idle_only: false, idle_minutes: 5, start_hour: None, end_hour: None };
                    w.execute("UPDATE sonic_settings SET value=?1 WHERE id=1", [serde_json::to_string(&unrestricted).unwrap()]).unwrap();
                } else if completed == 0 && message.starts_with("Analyzing ") {
                    assert!(saw_wait.get());
                    assert_eq!(w.query_row("SELECT count(*) FROM sonic_items WHERE batch_id='schedule-change' AND state='done'", [], |r| r.get::<_, i64>(0)).unwrap(), 0);
                    saw_active.set(true);
                }
            },
            &|| Some(0),
            &|| 12,
        ).unwrap();
        assert!(saw_wait.get());
        assert!(
            saw_active.get(),
            "Activity must stop saying Waiting before the first file is analyzed"
        );
        assert_eq!(result["failedCount"], 0);
        assert_eq!(status_at(dir.path()).unwrap().pending, 0);
    }
    #[test]
    fn indexed_track_matches_rebind_ids_and_exclude_bans_and_stale_files() {
        let (dir, c, _) = crate::sonic_index::tests::fixture();
        let key = track_key(&dir.path().to_string_lossy(), "00000.mp3");
        let same = || {
            let exact = matches_query(&c, true, &key, 50, false).unwrap();
            let indexed = matches_query(&c, true, &key, 50, true).unwrap();
            assert_eq!(
                serde_json::to_value(exact).unwrap(),
                serde_json::to_value(indexed).unwrap()
            );
        };
        same();
        c.execute("UPDATE tracks SET id=id+10000 WHERE id>100", [])
            .unwrap();
        c.execute("UPDATE tracks SET love='B' WHERE filename='00001.mp3'", [])
            .unwrap();
        c.execute("DELETE FROM tracks WHERE filename='00002.mp3'", [])
            .unwrap();
        fs::write(dir.path().join("00003.mp3"), [9; 257]).unwrap();
        same();
    }
}
