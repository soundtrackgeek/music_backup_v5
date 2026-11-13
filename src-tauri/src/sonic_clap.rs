//! Sound search: "Describe a sound" with LAION CLAP text–audio embeddings.
//!
//! After the Bliss and timeline step of an analysis job, every analyzed MP3
//! gets one 512-value CLAP embedding: the mean of up to three ten-second
//! windows, chosen from the loud parts of its per-second timeline. A text query
//! goes through the CLAP text encoder into the same space, so the closest
//! embeddings are the tracks that sound most like the description.
//!
//! The model runs in `music-clap-worker`, a separate sidecar, because ONNX
//! Runtime on Windows links DirectML.dll at load time and a missing or broken
//! GPU stack must never stop the Bliss analyzer from starting. The model files
//! (about 475 MB on Windows) download on first use from a pinned Hugging Face
//! revision and are checked against their SHA-256.
//!
//! Embeddings live in `music-clap.sqlite3`, keyed by audio hash like
//! `sonic_audio`, as 1 KB half-float blobs (about 1.3 GB for a million tracks).
//! A track whose audio cannot be decoded gets a row with `error` set, so it is
//! not retried until the model identity changes.
use anyhow::{bail, Context, Result};
use base64::Engine;
use music_sonic_core::{file_is_current, PROFILE};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashSet, VecDeque},
    fs,
    io::{self, BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{mpsc, Arc, Mutex},
    time::{Duration, Instant},
};

/// Changes whenever the model, its revision or the window rule changes, so
/// every track is embedded again with the new identity.
pub(crate) const MODEL: &str = "clap-lmas-e9fd5ac-3x10s-v1";
pub(crate) const FILE: &str = "music-clap.sqlite3";
pub(crate) const DIMENSIONS: usize = 512;
const REVISION: &str = "e9fd5ac1dbf3280936a7fc3ec8a020453ff184db";
const REPOSITORY: &str = "Xenova/larger_clap_music_and_speech";
const MODEL_FOLDER: &str = "clap-model/larger_clap_music_and_speech-e9fd5ac";
/// Tracks per worker request. Two requests stay in flight so the worker reads
/// the next files from disk while the model runs on the current ones.
const BATCH: usize = 8;
const IN_FLIGHT: usize = 2;
/// A batch of eight files that cannot seek may need a full read each.
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(300);
const READY_TIMEOUT: Duration = Duration::from_secs(180);
/// Consecutive worker crashes without one good response before the job stops.
const MAX_RESTARTS: u32 = 3;
const MAX_ERROR: usize = 2000;
const MAX_QUERY: usize = 300;
/// Candidates scored before artist balancing.
const CANDIDATES: usize = 400;
const PER_ARTIST: usize = 3;

pub(crate) struct ModelFile {
    pub name: &'static str,
    remote: &'static str,
    pub size: u64,
    sha256: &'static str,
    /// The fp16 audio model runs on DirectML only.
    windows_only: bool,
}

pub(crate) const FILES: [ModelFile; 4] = [
    ModelFile {
        name: "audio_model_fp16.onnx",
        remote: "onnx/audio_model_fp16.onnx",
        size: 143_432_227,
        sha256: "7445c5f85f6be805b535c216b928490549abfb92658dfbd1b12856bde0bf2842",
        windows_only: true,
    },
    ModelFile {
        name: "audio_model_quantized.onnx",
        remote: "onnx/audio_model_quantized.onnx",
        size: 78_155_433,
        sha256: "021dd4fb962b4ed20cc3a6730b09e0ccf9f9c49931047032118a3b64828513a6",
        windows_only: false,
    },
    ModelFile {
        name: "text_model_fp16.onnx",
        remote: "onnx/text_model_fp16.onnx",
        size: 251_029_088,
        sha256: "79da753839b7fd22afc3fa2076cb75ffb5729c24b3249042cf3ec6a4e2c924b3",
        windows_only: false,
    },
    ModelFile {
        name: "tokenizer.json",
        remote: "tokenizer.json",
        size: 2_108_774,
        sha256: "dc239041d98de27ffc3975473a1a23e3db4c937b23c138c38bbc66588bd247e5",
        windows_only: false,
    },
];

fn needed() -> impl Iterator<Item = &'static ModelFile> {
    FILES.iter().filter(|f| cfg!(windows) || !f.windows_only)
}

pub(crate) fn model_dir(dir: &Path) -> PathBuf {
    dir.join(MODEL_FOLDER)
}

/// Downloaded files are verified before they get their final name, so a
/// present file with the right size is a verified file.
pub(crate) fn model_ready(dir: &Path) -> bool {
    let folder = model_dir(dir);
    needed().all(|f| fs::metadata(folder.join(f.name)).is_ok_and(|m| m.len() == f.size))
}

pub(crate) fn model_bytes() -> u64 {
    needed().map(|f| f.size).sum()
}

pub(crate) fn open(dir: &Path) -> Result<Connection> {
    let c = Connection::open(dir.join(FILE))?;
    c.busy_timeout(Duration::from_secs(5))?;
    let version: i32 = c.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version > 1 {
        bail!("This sound search database needs a newer Music Library version");
    }
    c.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
        CREATE TABLE IF NOT EXISTS clap_audio(
            audio_hash TEXT NOT NULL,
            model TEXT NOT NULL,
            embedding BLOB,
            windows TEXT,
            error TEXT,
            analyzed_at TEXT NOT NULL,
            PRIMARY KEY(audio_hash, model));
        CREATE TABLE IF NOT EXISTS clap_queries(
            query TEXT NOT NULL,
            model TEXT NOT NULL,
            embedding BLOB NOT NULL,
            PRIMARY KEY(query, model));
        CREATE TABLE IF NOT EXISTS clap_state(
            id INTEGER PRIMARY KEY CHECK(id=1),
            device TEXT NOT NULL,
            updated_at TEXT NOT NULL);
        PRAGMA user_version=1;",
    )?;
    Ok(c)
}

/// Attach the sound search database (through the caller's connection) as `clap`.
pub(crate) fn attach(c: &Connection, dir: &Path) -> Result<bool> {
    let path = dir.join(FILE);
    if !path.exists() {
        return Ok(false);
    }
    c.execute(
        "ATTACH DATABASE ?1 AS clap",
        [path.to_string_lossy().as_ref()],
    )?;
    Ok(true)
}

fn to_f16(values: &[f32]) -> Vec<u8> {
    values
        .iter()
        .flat_map(|v| half::f16::from_f32(*v).to_le_bytes())
        .collect()
}

fn from_f16(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(2)
        .map(|b| half::f16::from_le_bytes([b[0], b[1]]).to_f32())
        .collect()
}

fn decode_embedding(base64: &str) -> Result<Vec<f32>> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64)
        .context("The sound search worker returned an unreadable embedding")?;
    if bytes.len() != DIMENSIONS * 4 {
        bail!("The sound search worker returned an embedding of the wrong size");
    }
    let values: Vec<f32> = bytes
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect();
    if values.iter().any(|v| !v.is_finite()) {
        bail!("The sound search worker returned non-finite values");
    }
    Ok(values)
}

// ---------------------------------------------------------------------------
// Model download

fn agent() -> ureq::Agent {
    // Hugging Face answers with a redirect to its CDN, which the shared
    // provider agent deliberately does not follow.
    ureq::AgentBuilder::new()
        .redirects(5)
        .timeout_connect(Duration::from_secs(30))
        .timeout_read(Duration::from_secs(60))
        .user_agent("MusicLibrary")
        .build()
}

fn sha256_file(path: &Path) -> Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hash = Sha256::new();
    let mut buffer = vec![0; 1 << 20];
    loop {
        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hash.update(&buffer[..n]);
    }
    Ok(hex::encode(hash.finalize()))
}

/// Gives a finished `.part` file its final name only when size and hash match.
fn verify_part(part: &Path, target: &Path, file: &ModelFile) -> Result<()> {
    let size = fs::metadata(part)?.len();
    if size != file.size || sha256_file(part)? != file.sha256 {
        let _ = fs::remove_file(part);
        bail!(
            "The downloaded sound search file {} did not match its checksum. Retry the job to download it again.",
            file.name
        );
    }
    fs::rename(part, target)?;
    Ok(())
}

/// Downloads any missing model file, resuming partial downloads.
pub(crate) fn download_model(
    dir: &Path,
    stop: &dyn Fn() -> bool,
    report: &dyn Fn(&str),
) -> Result<PathBuf> {
    let folder = model_dir(dir);
    fs::create_dir_all(&folder)?;
    let total = model_bytes();
    let mut done: u64 = needed()
        .filter(|f| fs::metadata(folder.join(f.name)).is_ok_and(|m| m.len() == f.size))
        .map(|f| f.size)
        .sum();
    let agent = agent();
    for file in needed() {
        let target = folder.join(file.name);
        if fs::metadata(&target).is_ok_and(|m| m.len() == file.size) {
            continue;
        }
        let _ = fs::remove_file(&target);
        let part = folder.join(format!("{}.part", file.name));
        let mut offset = fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
        if offset > file.size {
            fs::remove_file(&part)?;
            offset = 0;
        }
        if offset < file.size {
            let url = format!(
                "https://huggingface.co/{REPOSITORY}/resolve/{REVISION}/{}",
                file.remote
            );
            let mut request = agent.get(&url);
            if offset > 0 {
                request = request.set("Range", &format!("bytes={offset}-"));
            }
            let response = request
                .call()
                .with_context(|| format!("Could not download the sound search model ({})", file.name))?;
            let mut out = if response.status() == 206 {
                fs::OpenOptions::new().append(true).open(&part)?
            } else {
                offset = 0;
                fs::File::create(&part)?
            };
            let mut body = response.into_reader().take(file.size - offset);
            let mut buffer = vec![0; 256 * 1024];
            let mut reported = Instant::now() - Duration::from_secs(5);
            loop {
                if stop() {
                    out.flush()?;
                    bail!("Analysis stopped at a durable checkpoint");
                }
                let n = match body.read(&mut buffer) {
                    Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
                    r => r.with_context(|| {
                        format!("The sound search model download was interrupted ({})", file.name)
                    })?,
                };
                if n == 0 {
                    break;
                }
                out.write_all(&buffer[..n])?;
                offset += n as u64;
                if reported.elapsed() >= Duration::from_secs(1) {
                    report(&format!(
                        "Step 2 of 2 · Downloading the sound search model: {} of {} MB",
                        (done + offset) / 1_000_000,
                        total / 1_000_000
                    ));
                    reported = Instant::now();
                }
            }
            out.sync_all()?;
        }
        report(&format!("Step 2 of 2 · Checking {}", file.name));
        verify_part(&part, &target, file)?;
        done += file.size;
    }
    Ok(folder)
}

// ---------------------------------------------------------------------------
// Worker client

pub(crate) struct TrackJob {
    pub path: PathBuf,
    pub windows: Vec<u32>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum Embedded {
    Ready { embedding: Vec<f32>, windows: Vec<u32> },
    Failed(String),
}

/// A running audio encoder that answers requests in the order they were sent.
pub(crate) trait Encoder {
    fn device(&self) -> String;
    fn submit(&mut self, tracks: &[TrackJob]) -> Result<()>;
    fn receive(&mut self) -> Result<Vec<Embedded>>;
}

/// Starts an encoder, or returns None when this computer cannot run CLAP.
pub(crate) type Launch<'a> =
    dyn Fn(&Path, &dyn Fn() -> bool, &dyn Fn(&str)) -> Result<Option<Box<dyn Encoder>>> + 'a;

fn worker_path() -> Result<PathBuf> {
    let name = if cfg!(windows) {
        "music-clap-worker.exe"
    } else {
        "music-clap-worker"
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
                    .is_some_and(|n| n.to_string_lossy().starts_with("music-clap-worker-"))
                    && p.is_file()
                {
                    return Ok(p);
                }
            }
        }
    }
    bail!("The sound search worker is missing. Install the current Music Library release (developers: npm run sonic:prepare).")
}

fn command(path: &Path) -> Command {
    let mut cmd = Command::new(path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // No console window, below-normal priority like the analyzer.
        cmd.creation_flags(0x0800_0000 | 0x0000_4000);
    }
    cmd
}

/// The last few KB of the worker's diagnostics, for error messages.
fn drain_stderr(pipe: impl Read + Send + 'static) -> Arc<Mutex<String>> {
    let tail = Arc::new(Mutex::new(String::new()));
    let keep = tail.clone();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(pipe);
        let mut line = String::new();
        while reader.read_line(&mut line).is_ok_and(|n| n > 0) {
            if let Ok(mut t) = keep.lock() {
                t.push_str(&line);
                if t.len() > 4096 {
                    let cut = t.len() - 4096;
                    let cut = (cut..t.len()).find(|&i| t.is_char_boundary(i)).unwrap_or(0);
                    t.drain(..cut);
                }
            }
            line.clear();
        }
    });
    tail
}

struct Worker {
    child: Child,
    stdin: Option<ChildStdin>,
    lines: mpsc::Receiver<io::Result<String>>,
    stderr: Arc<Mutex<String>>,
    device: String,
}

impl Drop for Worker {
    fn drop(&mut self) {
        drop(self.stdin.take());
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Deserialize)]
#[serde(untagged)]
enum WireResult {
    Ready {
        embedding: String,
        windows: Vec<u32>,
        #[allow(dead_code)]
        seconds: f64,
    },
    Failed {
        error: String,
    },
}

impl Worker {
    fn start(model: &Path) -> Result<Self> {
        let mut child = command(&worker_path()?)
            .arg("--serve")
            .arg(model)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .context("Could not start the sound search worker")?;
        let stdout = child.stdout.take().context("Worker stdout missing")?;
        let stderr = drain_stderr(child.stderr.take().context("Worker stderr missing")?);
        let (send, lines) = mpsc::channel();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut line = String::new();
                match (&mut reader).take(8 << 20).read_line(&mut line) {
                    Ok(0) => return,
                    Ok(_) => {
                        if send.send(Ok(line)).is_err() {
                            return;
                        }
                    }
                    Err(e) => {
                        let _ = send.send(Err(e));
                        return;
                    }
                }
            }
        });
        let mut worker = Self {
            stdin: child.stdin.take(),
            child,
            lines,
            stderr,
            device: String::new(),
        };
        let ready: serde_json::Value = serde_json::from_str(&worker.line(READY_TIMEOUT)?)
            .context("The sound search worker sent an unreadable ready line")?;
        if ready["ready"] != true || ready["dimensions"] != DIMENSIONS {
            bail!("The sound search worker does not match this Music Library version");
        }
        worker.device = ready["device"].as_str().unwrap_or("CPU").into();
        Ok(worker)
    }

    fn failure(&mut self, what: &str) -> anyhow::Error {
        let _ = self.child.kill();
        let _ = self.child.wait();
        std::thread::sleep(Duration::from_millis(100));
        let tail = self.stderr.lock().map(|t| t.trim().to_string()).unwrap_or_default();
        let last = tail.lines().last().unwrap_or_default();
        anyhow::anyhow!(
            "The sound search worker {what}{}",
            if last.is_empty() { String::new() } else { format!(": {last}") }
        )
    }

    fn line(&mut self, timeout: Duration) -> Result<String> {
        match self.lines.recv_timeout(timeout) {
            Ok(Ok(line)) if line.ends_with('\n') => Ok(line),
            Ok(Ok(_)) => Err(self.failure("sent an oversized response")),
            Ok(Err(e)) => Err(anyhow::Error::new(e).context("Could not read the sound search worker")),
            Err(mpsc::RecvTimeoutError::Timeout) => Err(self.failure("stopped responding")),
            Err(mpsc::RecvTimeoutError::Disconnected) => Err(self.failure("stopped")),
        }
    }
}

impl Encoder for Worker {
    fn device(&self) -> String {
        self.device.clone()
    }

    fn submit(&mut self, tracks: &[TrackJob]) -> Result<()> {
        let request = serde_json::json!({
            "tracks": tracks.iter().map(|t| serde_json::json!({
                "path": t.path, "windows": t.windows
            })).collect::<Vec<_>>()
        });
        let mut line = serde_json::to_vec(&request)?;
        line.push(b'\n');
        let written = self
            .stdin
            .as_mut()
            .context("Worker stdin closed")?
            .write_all(&line)
            .and_then(|_| self.stdin.as_mut().map_or(Ok(()), |s| s.flush()));
        written.map_err(|_| self.failure("stopped"))
    }

    fn receive(&mut self) -> Result<Vec<Embedded>> {
        #[derive(Deserialize)]
        struct Response {
            results: Vec<WireResult>,
        }
        let line = self.line(RESPONSE_TIMEOUT)?;
        let response: Response = serde_json::from_str(&line)
            .context("The sound search worker sent an unreadable response")?;
        response
            .results
            .into_iter()
            .map(|r| {
                Ok(match r {
                    WireResult::Ready {
                        embedding, windows, ..
                    } => Embedded::Ready {
                        embedding: decode_embedding(&embedding)?,
                        windows,
                    },
                    WireResult::Failed { error } => Embedded::Failed(error),
                })
            })
            .collect()
    }
}

/// The real launcher: report availability, download the model, start the worker.
pub(crate) fn launch(
    dir: &Path,
    stop: &dyn Fn() -> bool,
    report: &dyn Fn(&str),
) -> Result<Option<Box<dyn Encoder>>> {
    if !available()? {
        return Ok(None);
    }
    let model = download_model(dir, stop, report)?;
    report("Step 2 of 2 · Starting the sound search model");
    Ok(Some(Box::new(Worker::start(&model)?)))
}

/// False on Intel Macs, where ONNX Runtime has no build.
fn available() -> Result<bool> {
    let output = command(&worker_path()?)
        .arg("--info")
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .context("Could not start the sound search worker")?;
    let info: serde_json::Value = serde_json::from_slice(&output.stdout)
        .context("The sound search worker sent unreadable information")?;
    Ok(info["available"] == true)
}

// ---------------------------------------------------------------------------
// Window choice

const WINDOW: usize = 10;

/// Window starts (whole seconds) from a track's per-second levels in dBFS.
/// Quiet stretches (intros, fades, hidden-track silence) are skipped: windows
/// whose mean level is more than 10 dB under the track's median window are
/// left out, then up to three are spread evenly through what remains. The
/// worker uses the same spread when there is no timeline.
pub(crate) fn choose_windows(levels: &[f32]) -> Vec<u32> {
    let seconds = levels.len();
    if seconds <= WINDOW {
        return vec![0];
    }
    let means: Vec<(u32, f32)> = (0..=seconds - WINDOW)
        .step_by(5)
        .map(|s| {
            let slice = &levels[s..s + WINDOW];
            (s as u32, slice.iter().sum::<f32>() / WINDOW as f32)
        })
        .collect();
    let mut sorted: Vec<f32> = means.iter().map(|m| m.1).collect();
    sorted.sort_by(f32::total_cmp);
    let median = sorted[sorted.len() / 2];
    let mut kept: Vec<u32> = means
        .iter()
        .filter(|m| m.1 >= median - 10.0)
        .map(|m| m.0)
        .collect();
    if kept.is_empty() {
        kept = means.iter().map(|m| m.0).collect();
    }
    let count = (seconds / WINDOW).clamp(1, 3);
    let mut picks: Vec<u32> = (0..count)
        .map(|i| {
            let at = (2 * i + 1) as f64 / (2 * count) as f64;
            kept[((at * kept.len() as f64) as usize).min(kept.len() - 1)]
        })
        .collect();
    picks.dedup();
    picks
}

fn timeline_levels(timeline: &Connection, hash: &str) -> Result<Option<Vec<f32>>> {
    let data: Option<Vec<u8>> = timeline
        .query_row(
            "SELECT data FROM timelines WHERE audio_hash=?1 AND version=?2 AND error IS NULL",
            params![hash, crate::sonic_timeline::VERSION],
            |r| r.get(0),
        )
        .optional()?
        .flatten();
    let columns = crate::sonic_timeline::COLUMNS;
    Ok(data.map(|bytes| {
        bytes
            .chunks_exact(columns * 2)
            .map(|row| half::f16::from_le_bytes([row[26], row[27]]).to_f32())
            .collect()
    }))
}

// ---------------------------------------------------------------------------
// Queue stage

struct Pending {
    hash: String,
    job: TrackJob,
}

fn save(c: &Connection, hash: &str, outcome: &Embedded) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    match outcome {
        Embedded::Ready { embedding, windows } => c.execute(
            "INSERT OR REPLACE INTO clap_audio VALUES(?1,?2,?3,?4,NULL,?5)",
            params![hash, MODEL, to_f16(embedding), serde_json::to_string(windows)?, now],
        )?,
        Embedded::Failed(error) => c.execute(
            "INSERT OR REPLACE INTO clap_audio VALUES(?1,?2,NULL,NULL,?3,?4)",
            params![hash, MODEL, error.chars().take(MAX_ERROR).collect::<String>(), now],
        )?,
    };
    Ok(())
}

/// Step 2 of an analysis job: embed every checked queue entry whose audio has
/// no embedding yet. Progress is durable per batch of eight; a restarted job
/// only skips what is already saved. `allowed` is the job's schedule.
pub(crate) fn run_batch(
    dir: &Path,
    batch: &str,
    launch: &Launch<'_>,
    stop: &dyn Fn() -> bool,
    report: &dyn Fn(i64, i64, &str, Option<i64>),
    allowed: &dyn Fn() -> bool,
) -> Result<()> {
    let c = open(dir)?;
    c.execute(
        "ATTACH DATABASE ?1 AS work",
        [dir.join("sonic-work.sqlite3").to_string_lossy().as_ref()],
    )?;
    c.execute(
        "ATTACH DATABASE ?1 AS sonic",
        [dir.join("music-analysis.sqlite3").to_string_lossy().as_ref()],
    )?;
    let timeline = crate::sonic_timeline::open(dir)?;
    const ELIGIBLE: &str = "FROM work.sonic_items i JOIN sonic.sonic_tracks s ON s.track_key=i.track_key AND s.profile=?2 WHERE i.batch_id=?1 AND i.state='done' AND NOT EXISTS(SELECT 1 FROM clap_audio a WHERE a.audio_hash=s.audio_hash AND a.model=?3)";
    report(0, 0, "Step 2 of 2 · Finding tracks for sound search", None);
    let total: i64 = c.query_row(
        &format!("SELECT count(*) {ELIGIBLE}"),
        params![batch, PROFILE, MODEL],
        |r| r.get(0),
    )?;
    if total == 0 {
        return Ok(());
    }
    let progress = |done: i64, message: &str| report(done, total, message, None);
    let Some(mut encoder) = launch(dir, stop, &|m| progress(0, m))? else {
        progress(total, "Sound search needs a Windows PC or an Apple silicon Mac");
        return Ok(());
    };
    let remember_device = |device: &str| {
        c.execute(
            "INSERT OR REPLACE INTO clap_state VALUES(1,?1,?2)",
            params![device, chrono::Utc::now().to_rfc3339()],
        )
    };
    remember_device(&encoder.device())?;
    let mut next = c.prepare(&format!(
        "SELECT i.track_key,i.directory,i.filename,s.audio_hash,s.size,s.modified {ELIGIBLE} AND i.track_key>?4 ORDER BY i.track_key LIMIT ?5"
    ))?;
    let mut cursor = String::new();
    let mut exhausted = false;
    let mut in_flight: VecDeque<Vec<Pending>> = VecDeque::new();
    // After a crash, the lost tracks are retried one per request to find the
    // file that brings the worker down.
    let mut isolate: VecDeque<Pending> = VecDeque::new();
    // Tracks that crashed the worker on their own. They are recorded as
    // failed only once the restarted worker proves it works on other files.
    let mut suspects: Vec<(String, String)> = Vec::new();
    let mut restarts = 0;
    let mut completed: i64 = 0;
    let mut active = Duration::ZERO;
    let mut last_name = String::new();
    let mut reported = Instant::now() - Duration::from_secs(5);
    let mut waiting = false;
    loop {
        if stop() {
            bail!("Analysis stopped at a durable checkpoint");
        }
        let permitted = allowed();
        if !permitted && in_flight.is_empty() {
            if !waiting || reported.elapsed() >= Duration::from_secs(30) {
                progress(completed, "Step 2 of 2 · Waiting for idle time / scheduled hours");
                reported = Instant::now();
            }
            waiting = true;
            std::thread::sleep(Duration::from_secs(1));
            continue;
        }
        waiting = false;
        let tick = Instant::now();
        // Keep the worker fed.
        while permitted && in_flight.len() < IN_FLIGHT {
            let request: Vec<Pending> = if !isolate.is_empty() {
                if !in_flight.is_empty() {
                    break;
                }
                isolate.pop_front().into_iter().collect()
            } else if exhausted {
                break;
            } else {
                let sent: HashSet<&str> = in_flight
                    .iter()
                    .flatten()
                    .map(|p| p.hash.as_str())
                    .collect();
                let rows = next
                    .query_map(
                        params![batch, PROFILE, MODEL, cursor, BATCH as i64],
                        |r| {
                            Ok((
                                r.get::<_, String>(0)?,
                                r.get::<_, String>(1)?,
                                r.get::<_, String>(2)?,
                                r.get::<_, String>(3)?,
                                r.get::<_, i64>(4)?,
                                r.get::<_, String>(5)?,
                            ))
                        },
                    )?
                    .collect::<rusqlite::Result<Vec<_>>>()?;
                if rows.len() < BATCH {
                    exhausted = true;
                }
                let mut request = Vec::new();
                let mut hashes = HashSet::new();
                for (key, directory, filename, hash, size, modified) in rows {
                    cursor = key;
                    // Same audio already on its way, or a file changed since its
                    // Bliss analysis (the next analysis run re-hashes it).
                    if sent.contains(hash.as_str())
                        || !hashes.insert(hash.clone())
                        || !file_is_current(&directory, &filename, size as u64, &modified)
                    {
                        completed += 1;
                        continue;
                    }
                    let windows = timeline_levels(&timeline, &hash)?
                        .map(|levels| choose_windows(&levels))
                        .unwrap_or_default();
                    last_name = filename.clone();
                    request.push(Pending {
                        hash,
                        job: TrackJob {
                            path: Path::new(&directory).join(&filename),
                            windows,
                        },
                    });
                }
                if request.is_empty() {
                    continue;
                }
                request
            };
            let jobs: Vec<TrackJob> = request
                .iter()
                .map(|p| TrackJob {
                    path: p.job.path.clone(),
                    windows: p.job.windows.clone(),
                })
                .collect();
            in_flight.push_back(request);
            if encoder.submit(&jobs).is_err() {
                break; // receive() reports the crash below.
            }
        }
        let Some(sent) = in_flight.pop_front() else {
            if exhausted && isolate.is_empty() {
                break;
            }
            continue;
        };
        match encoder.receive() {
            Ok(results) if results.len() == sent.len() => {
                restarts = 0;
                let tx = c.unchecked_transaction()?;
                for (hash, error) in suspects.drain(..) {
                    save(&tx, &hash, &Embedded::Failed(error))?;
                }
                for (pending, outcome) in sent.iter().zip(&results) {
                    save(&tx, &pending.hash, outcome)?;
                }
                tx.commit()?;
                completed += sent.len() as i64;
            }
            Ok(_) => bail!("The sound search worker answered with the wrong number of tracks"),
            Err(error) => {
                restarts += 1;
                if restarts > MAX_RESTARTS {
                    return Err(error.context(
                        "Sound search stopped after the worker failed repeatedly. Bliss and timeline results are saved; fix the reported problem, then retry this job",
                    ));
                }
                let mut lost: Vec<Pending> = Vec::new();
                if sent.len() == 1 && in_flight.is_empty() {
                    let pending = sent.into_iter().next().unwrap();
                    suspects.push((
                        pending.hash,
                        format!("The sound search worker stopped on this file: {error:#}"),
                    ));
                    completed += 1;
                } else {
                    lost.extend(sent);
                }
                lost.extend(in_flight.drain(..).flatten());
                isolate.extend(lost);
                drop(encoder);
                progress(completed, "Step 2 of 2 · Restarting the sound search model");
                encoder = launch(dir, stop, &|m| progress(completed, m))?
                    .context("The sound search worker is no longer available")?;
                remember_device(&encoder.device())?;
            }
        }
        active += tick.elapsed();
        if reported.elapsed() >= Duration::from_secs(2) {
            let rate = completed as f64 / active.as_secs_f64().max(1.0);
            let eta = (rate > 0.0 && completed >= 16)
                .then(|| ((total - completed).max(0) as f64 / rate).round() as i64);
            report(
                completed.min(total),
                total,
                &format!("Step 2 of 2 · Sound search ({}) {last_name}", encoder.device()),
                eta,
            );
            reported = Instant::now();
        }
    }
    // Suspects left here were never followed by a good response, so they may
    // be innocent; the next run tries them again.
    report(total, total, "Step 2 of 2 · Sound search is up to date", Some(0));
    Ok(())
}

// ---------------------------------------------------------------------------
// Status

#[derive(Clone, Debug, Default, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SoundSearchStatus {
    /// Catalog tracks whose audio has a sound search embedding.
    pub analyzed: i64,
    /// Catalog tracks whose audio could not be embedded.
    pub failed: i64,
    /// Size of the sound search database on disk.
    pub bytes: i64,
    pub model_ready: bool,
    pub model_bytes: i64,
    /// DirectML or CPU, from the last run.
    pub device: Option<String>,
}

/// `c` is the catalog with `sonic` attached.
pub(crate) fn status(c: &Connection, dir: &Path) -> Result<SoundSearchStatus> {
    let bytes = ["", "-wal"]
        .iter()
        .filter_map(|suffix| fs::metadata(dir.join(format!("{FILE}{suffix}"))).ok())
        .map(|m| i64::try_from(m.len()).unwrap_or(i64::MAX))
        .sum();
    let mut status = SoundSearchStatus {
        bytes,
        model_ready: model_ready(dir),
        model_bytes: model_bytes() as i64,
        ..Default::default()
    };
    if !attach(c, dir)? {
        return Ok(status);
    }
    let has_state: bool = c.query_row(
        "SELECT EXISTS(SELECT 1 FROM clap.sqlite_master WHERE name='clap_state')",
        [],
        |r| r.get(0),
    )?;
    if has_state {
        (status.analyzed, status.failed) = c.query_row(
            "SELECT count(a.embedding),count(a.error) FROM tracks t JOIN sonic.sonic_tracks s ON s.directory=t.file_path AND s.filename=t.filename JOIN clap.clap_audio a ON a.audio_hash=s.audio_hash AND a.model=?2 WHERE s.profile=?1",
            params![PROFILE, MODEL],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        status.device = c
            .query_row("SELECT device FROM clap.clap_state WHERE id=1", [], |r| r.get(0))
            .optional()?;
    }
    c.execute("DETACH DATABASE clap", [])?;
    Ok(status)
}

// ---------------------------------------------------------------------------
// Search

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SoundSearchResults {
    pub query: String,
    /// Tracks searched (audio with an embedding).
    pub searched: i64,
    pub tracks: Vec<crate::sonic::SonicTrack>,
}

fn normalize_query(query: &str) -> Result<String> {
    let query = query.split_whitespace().collect::<Vec<_>>().join(" ");
    if query.is_empty() || query.chars().count() > MAX_QUERY {
        bail!("Describe a sound in 1–{MAX_QUERY} characters");
    }
    Ok(query)
}

/// Runs the text encoder once for a query (about two seconds), then caches it.
fn text_embedding(dir: &Path, c: &Connection, query: &str) -> Result<Vec<f32>> {
    let key = query.to_lowercase();
    let cached: Option<Vec<u8>> = c
        .query_row(
            "SELECT embedding FROM clap_queries WHERE query=?1 AND model=?2",
            params![key, MODEL],
            |r| r.get(0),
        )
        .optional()?;
    if let Some(bytes) = cached.filter(|b| b.len() == DIMENSIONS * 2) {
        return Ok(from_f16(&bytes));
    }
    if !model_ready(dir) {
        bail!("Run audio analysis once so Music Library can download the sound search model");
    }
    let mut child = command(&worker_path()?)
        .arg("--text")
        .arg(model_dir(dir))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .context("Could not start the sound search worker")?;
    child
        .stdin
        .take()
        .context("Worker stdin missing")?
        .write_all(query.as_bytes())?;
    let (send, receive) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = send.send(child.wait_with_output());
    });
    let output = receive
        .recv_timeout(Duration::from_secs(120))
        .context("The sound search worker did not answer within two minutes")??;
    if !output.status.success() {
        bail!(
            "The sound search worker failed: {}",
            String::from_utf8_lossy(&output.stderr)
                .trim()
                .chars()
                .take(500)
                .collect::<String>()
        );
    }
    let reply: serde_json::Value = serde_json::from_slice(&output.stdout)
        .context("The sound search worker sent an unreadable answer")?;
    let embedding = decode_embedding(
        reply["embedding"]
            .as_str()
            .context("The sound search worker sent no embedding")?,
    )?;
    c.execute(
        "INSERT OR REPLACE INTO clap_queries VALUES(?1,?2,?3)",
        params![key, MODEL, to_f16(&embedding)],
    )?;
    Ok(embedding)
}

/// The best-scoring audio hashes for a query embedding, best first.
fn rank(c: &Connection, query: &[f32], keep: usize) -> Result<(i64, Vec<(String, f32)>)> {
    let mut q = c.prepare(
        "SELECT audio_hash,embedding FROM clap_audio WHERE model=?1 AND embedding IS NOT NULL",
    )?;
    let mut rows = q.query([MODEL])?;
    let mut searched = 0;
    // A small sorted list beats a heap for a few hundred entries.
    let mut best: Vec<(String, f32)> = Vec::with_capacity(keep + 1);
    while let Some(row) = rows.next()? {
        let bytes = row.get_ref(1)?.as_blob()?;
        if bytes.len() != DIMENSIONS * 2 {
            continue;
        }
        searched += 1;
        let score: f32 = bytes
            .chunks_exact(2)
            .zip(query)
            .map(|(b, q)| half::f16::from_le_bytes([b[0], b[1]]).to_f32() * q)
            .sum();
        if best.len() == keep && best.last().is_some_and(|b| b.1 >= score) {
            continue;
        }
        let hash: String = row.get(0)?;
        let at = best.partition_point(|b| b.1 >= score);
        best.insert(at, (hash, score));
        best.truncate(keep);
    }
    Ok((searched, best))
}

pub(crate) fn describe_at(dir: &Path, query: &str, limit: usize) -> Result<SoundSearchResults> {
    if !(1..=200).contains(&limit) {
        bail!("Ask for 1–200 tracks");
    }
    let query = normalize_query(query)?;
    if !dir.join(FILE).exists() {
        bail!("Sound search is ready after audio analysis has embedded some tracks");
    }
    let clap = open(dir)?;
    let embedding = text_embedding(dir, &clap, &query)?;
    let (searched, best) = rank(&clap, &embedding, CANDIDATES)?;
    drop(clap);
    let c = crate::sonic::catalog(dir)?;
    if !crate::sonic::attach(&c, dir)? {
        bail!("Sound search is ready after audio analysis has embedded some tracks");
    }
    let mut lookup = c.prepare(&format!(
        "SELECT {} FROM sonic.sonic_tracks s JOIN tracks t ON t.file_path=s.directory AND t.filename=s.filename WHERE s.audio_hash=?1 AND s.profile=?2 AND COALESCE(t.love,'')!='B' ORDER BY t.id LIMIT 1",
        crate::sonic::SELECT
    ))?;
    let mut per_artist = std::collections::HashMap::<String, usize>::new();
    let mut tracks = Vec::new();
    for (hash, score) in best {
        let Some(mut track) = lookup
            .query_row(params![hash, PROFILE], crate::sonic::row)
            .optional()?
        else {
            continue;
        };
        let count = per_artist.entry(track.artist.to_lowercase()).or_default();
        if *count >= PER_ARTIST {
            continue;
        }
        *count += 1;
        track.distance = Some(f64::from(1.0 - score));
        tracks.push(track);
        if tracks.len() == limit {
            break;
        }
    }
    Ok(SoundSearchResults {
        query,
        searched,
        tracks,
    })
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_describe(
    app: tauri::AppHandle,
    query: String,
    limit: u32,
) -> Result<SoundSearchResults, String> {
    tauri::async_runtime::spawn_blocking(move || {
        describe_at(&crate::sonic::directory(&app)?, &query, limit as usize)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_save_described(
    app: tauri::AppHandle,
    query: String,
    name: String,
) -> Result<crate::ai::SavedPlaylist, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<crate::ai::SavedPlaylist> {
        if name.trim().is_empty() || name.len() > 200 {
            bail!("Choose a playlist name of 1–200 characters");
        }
        let found = describe_at(&crate::sonic::directory(&app)?, &query, 100)?;
        if found.tracks.is_empty() {
            bail!("No analyzed tracks match this description yet");
        }
        let playlist = crate::sonic::similarity_playlist(
            name.trim(),
            format!(
                "Sounds like “{}”. Sound search across {} analyzed tracks; model {MODEL}.",
                found.query, found.searched
            ),
            found.searched,
            found.tracks,
            "local sound search",
        );
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
pub(crate) mod tests {
    use super::*;

    #[test]
    fn windows_skip_quiet_parts_and_spread_through_the_rest() {
        assert_eq!(choose_windows(&[-20.0; 5]), vec![0]);
        assert_eq!(choose_windows(&[-20.0; 10]), vec![0]);
        // Even level: the same spread the worker uses without a timeline.
        assert_eq!(choose_windows(&[-20.0; 180]), vec![25, 85, 145]);
        assert_eq!(choose_windows(&[-20.0; 25]), vec![5, 15]);
        // A minute of near-silence before two loud minutes is skipped.
        let mut levels = vec![-80.0; 60];
        levels.extend(vec![-12.0; 120]);
        let picks = choose_windows(&levels);
        assert_eq!(picks.len(), 3);
        assert!(picks.iter().all(|&s| s >= 55), "{picks:?}");
        // All quiet: still three windows.
        assert_eq!(choose_windows(&[-90.0; 180]).len(), 3);
    }

    #[test]
    fn embeddings_round_trip_as_half_floats() {
        let values: Vec<f32> = (0..DIMENSIONS).map(|i| (i as f32 - 256.0) / 512.0).collect();
        let back = from_f16(&to_f16(&values));
        assert!(values.iter().zip(&back).all(|(a, b)| (a - b).abs() < 1e-3));
        let wire = base64::engine::general_purpose::STANDARD
            .encode(values.iter().flat_map(|v| v.to_le_bytes()).collect::<Vec<_>>());
        assert_eq!(decode_embedding(&wire).unwrap(), values);
        assert!(decode_embedding("AAAA").is_err());
    }

    #[test]
    fn a_download_must_match_its_checksum() {
        let dir = tempfile::tempdir().unwrap();
        let file = ModelFile {
            name: "x",
            remote: "x",
            size: 3,
            sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            windows_only: false,
        };
        let (part, target) = (dir.path().join("x.part"), dir.path().join("x"));
        fs::write(&part, b"abd").unwrap();
        assert!(verify_part(&part, &target, &file).is_err());
        assert!(!part.exists() && !target.exists());
        fs::write(&part, b"abc").unwrap();
        verify_part(&part, &target, &file).unwrap();
        assert!(target.exists() && !part.exists());
    }

    #[test]
    fn ranking_keeps_the_best_scores_in_order() {
        let dir = tempfile::tempdir().unwrap();
        let c = open(dir.path()).unwrap();
        for i in 0..20 {
            let mut e = vec![0.0f32; DIMENSIONS];
            e[0] = i as f32 / 20.0;
            save(&c, &format!("h{i}"), &Embedded::Ready { embedding: e, windows: vec![0] }).unwrap();
        }
        save(&c, "bad", &Embedded::Failed("x".into())).unwrap();
        let mut q = vec![0.0f32; DIMENSIONS];
        q[0] = 1.0;
        let (searched, best) = rank(&c, &q, 3).unwrap();
        assert_eq!(searched, 20);
        assert_eq!(
            best.iter().map(|b| b.0.as_str()).collect::<Vec<_>>(),
            ["h19", "h18", "h17"]
        );
    }

    /// Answers like the worker. A path containing "crash" kills it.
    pub(crate) struct Fake {
        pub queue: VecDeque<Vec<TrackJob>>,
        pub dead: bool,
    }

    impl Encoder for Fake {
        fn device(&self) -> String {
            "Fake".into()
        }
        fn submit(&mut self, tracks: &[TrackJob]) -> Result<()> {
            self.queue.push_back(
                tracks
                    .iter()
                    .map(|t| TrackJob { path: t.path.clone(), windows: t.windows.clone() })
                    .collect(),
            );
            Ok(())
        }
        fn receive(&mut self) -> Result<Vec<Embedded>> {
            let tracks = self.queue.pop_front().context("nothing sent")?;
            if self.dead || tracks.iter().any(|t| t.path.to_string_lossy().contains("crash")) {
                self.dead = true;
                bail!("worker crashed");
            }
            Ok(tracks
                .iter()
                .map(|t| {
                    let mut e = vec![0.0f32; DIMENSIONS];
                    e[t.path.to_string_lossy().len() % DIMENSIONS] = 1.0;
                    Embedded::Ready { embedding: e, windows: t.windows.clone() }
                })
                .collect())
        }
    }

    pub(crate) fn fake(
        _: &Path,
        _: &dyn Fn() -> bool,
        _: &dyn Fn(&str),
    ) -> Result<Option<Box<dyn Encoder>>> {
        Ok(Some(Box::new(Fake { queue: VecDeque::new(), dead: false })))
    }
}
