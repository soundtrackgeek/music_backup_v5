//! Per-second timelines (`timeline-v1`) in their own database.
//!
//! The analyzer writes one 29-value half-float row per second of audio (see
//! `Tools/sonic-analyzer/src/timeline.rs` for the columns). Rows are keyed by
//! audio hash, like `sonic_audio`, so identical files share one timeline.
//! They live in `music-timelines.sqlite3`, beside but separate from
//! `music-analysis.sqlite3`: a full library is about 12.6 GB, and analysis
//! backups stay small. A timeline can always be rebuilt from the MP3.
//!
//! A file whose timeline cannot be decoded gets a row with `error` set, so the
//! track is neither failed nor retried until the timeline version changes.
use anyhow::{bail, Context, Result};
use base64::Engine;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use std::{path::Path, time::Duration};

pub(crate) const VERSION: &str = "timeline-v1";
pub(crate) const COLUMNS: usize = 29;
pub(crate) const FILE: &str = "music-timelines.sqlite3";
/// Three hours, the analyzer's limit; longer audio arrives truncated.
const MAX_ROWS: usize = 3 * 60 * 60;
const MAX_ERROR: usize = 2000;

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub(crate) enum Payload {
    Ready(Ready),
    Failed(Failed),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Ready {
    version: String,
    rows: usize,
    columns: usize,
    channels: u32,
    sample_rate: u32,
    left_db: f64,
    right_db: Option<f64>,
    truncated: bool,
    data: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Failed {
    version: String,
    error: String,
}

pub(crate) fn open(dir: &Path) -> Result<Connection> {
    let c = Connection::open(dir.join(FILE))?;
    c.busy_timeout(Duration::from_secs(5))?;
    let version: i32 = c.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version > 1 {
        bail!("This timeline database needs a newer Music Library version");
    }
    c.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS timelines(
            audio_hash TEXT NOT NULL,
            version TEXT NOT NULL,
            rows INTEGER NOT NULL,
            channels INTEGER,
            sample_rate INTEGER,
            left_db REAL,
            right_db REAL,
            truncated INTEGER NOT NULL DEFAULT 0,
            data BLOB,
            error TEXT,
            created_at TEXT NOT NULL,
            PRIMARY KEY(audio_hash, version));
        PRAGMA user_version=1;",
    )?;
    Ok(c)
}

/// True when this audio already has a current timeline, including a recorded failure.
pub(crate) fn has(dir: &Path, hash: &str) -> Result<bool> {
    if !dir.join(FILE).exists() {
        return Ok(false);
    }
    Ok(open(dir)?
        .query_row(
            "SELECT 1 FROM timelines WHERE audio_hash=?1 AND version=?2",
            params![hash, VERSION],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

pub(crate) fn save(dir: &Path, hash: &str, payload: Payload) -> Result<()> {
    let c = open(dir)?;
    let now = chrono::Utc::now().to_rfc3339();
    match payload {
        Payload::Ready(t) => {
            if t.version != VERSION || t.columns != COLUMNS {
                bail!("The analyzer returned an incompatible timeline format");
            }
            if t.rows > MAX_ROWS || t.channels == 0 || t.sample_rate == 0 || !t.left_db.is_finite()
            {
                bail!("The analyzer returned an invalid timeline");
            }
            let data = base64::engine::general_purpose::STANDARD
                .decode(t.data.as_bytes())
                .context("The analyzer returned an unreadable timeline")?;
            if data.len() != t.rows * COLUMNS * 2 {
                bail!("The analyzer returned a timeline of the wrong size");
            }
            c.execute(
                "INSERT OR REPLACE INTO timelines VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,NULL,?10)",
                params![
                    hash,
                    VERSION,
                    t.rows as i64,
                    t.channels,
                    t.sample_rate,
                    t.left_db,
                    t.right_db.filter(|v| v.is_finite()),
                    t.truncated,
                    data,
                    now
                ],
            )?;
        }
        Payload::Failed(f) => {
            if f.version != VERSION {
                bail!("The analyzer returned an incompatible timeline format");
            }
            let error: String = f.error.chars().take(MAX_ERROR).collect();
            c.execute(
                "INSERT OR REPLACE INTO timelines VALUES(?1,?2,0,NULL,NULL,NULL,NULL,0,NULL,?3,?4)",
                params![hash, VERSION, error, now],
            )?;
        }
    }
    Ok(())
}

/// Attach the timeline database read-only (through the caller's connection) as `timeline`.
pub(crate) fn attach(c: &Connection, dir: &Path) -> Result<bool> {
    let path = dir.join(FILE);
    if !path.exists() {
        return Ok(false);
    }
    c.execute(
        "ATTACH DATABASE ?1 AS timeline",
        [path.to_string_lossy().as_ref()],
    )?;
    Ok(true)
}

/// Test helper: give fixture audio a one-row timeline so it counts as fully analyzed.
#[cfg(test)]
pub(crate) fn mark_done(dir: &Path, hash: &str) {
    let payload = serde_json::from_value(serde_json::json!({
        "version": VERSION, "rows": 1, "columns": COLUMNS, "channels": 2,
        "sampleRate": 44100, "leftDb": -12.0, "rightDb": -12.0, "truncated": false,
        "data": base64::engine::general_purpose::STANDARD.encode(vec![0u8; COLUMNS * 2]),
    }))
    .unwrap();
    save(dir, hash, payload).unwrap();
}

#[cfg(test)]
pub(crate) fn read(dir: &Path, hash: &str) -> Result<Option<(usize, Vec<f32>)>> {
    let row: Option<(i64, Option<Vec<u8>>)> = open(dir)?
        .query_row(
            "SELECT rows,data FROM timelines WHERE audio_hash=?1 AND version=?2",
            params![hash, VERSION],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    Ok(row.and_then(|(rows, data)| {
        data.map(|d| {
            let values = d
                .chunks_exact(2)
                .map(|b| half::f16::from_le_bytes([b[0], b[1]]).to_f32())
                .collect();
            (rows as usize, values)
        })
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ready(rows: usize, bytes: usize) -> Payload {
        serde_json::from_value(serde_json::json!({
            "version": VERSION, "rows": rows, "columns": COLUMNS, "channels": 2,
            "sampleRate": 44100, "leftDb": -12.5, "rightDb": -13.0, "truncated": false,
            "data": base64::engine::general_purpose::STANDARD.encode(vec![0u8; bytes]),
        }))
        .unwrap()
    }

    #[test]
    fn stores_reads_and_shares_timelines_by_audio_hash() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!has(dir.path(), "h1").unwrap());
        save(dir.path(), "h1", ready(3, 3 * COLUMNS * 2)).unwrap();
        assert!(has(dir.path(), "h1").unwrap());
        let (rows, values) = read(dir.path(), "h1").unwrap().unwrap();
        assert_eq!((rows, values.len()), (3, 3 * COLUMNS));
        assert!(!has(dir.path(), "h2").unwrap());
    }

    #[test]
    fn rejects_wrong_sizes_and_versions() {
        let dir = tempfile::tempdir().unwrap();
        assert!(save(dir.path(), "h", ready(3, 10)).is_err());
        let wrong: Payload = serde_json::from_value(serde_json::json!({
            "version": "timeline-v0", "error": "x"
        }))
        .unwrap();
        assert!(save(dir.path(), "h", wrong).is_err());
        assert!(!has(dir.path(), "h").unwrap());
        assert!(serde_json::from_value::<Payload>(serde_json::json!({
            "version": VERSION, "error": "x", "surprise": 1
        }))
        .is_err());
    }

    #[test]
    fn a_failed_timeline_is_recorded_so_it_is_not_retried() {
        let dir = tempfile::tempdir().unwrap();
        let failed: Payload = serde_json::from_value(serde_json::json!({
            "version": VERSION, "error": "e".repeat(5000)
        }))
        .unwrap();
        save(dir.path(), "h", failed).unwrap();
        assert!(has(dir.path(), "h").unwrap());
        assert!(read(dir.path(), "h").unwrap().is_none());
        let stored: String = open(dir.path())
            .unwrap()
            .query_row("SELECT error FROM timelines", [], |r| r.get(0))
            .unwrap();
        assert_eq!(stored.len(), MAX_ERROR);
    }
}
