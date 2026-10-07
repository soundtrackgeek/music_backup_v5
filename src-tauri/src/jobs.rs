//! Durable process-local work registry. Kept outside the catalog so progress and
//! controls never contend with a long catalog transaction or travel to another PC.
use anyhow::{bail, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[cfg(not(test))]
mod desktop;
#[cfg(not(test))]
pub use desktop::*;

#[cfg(test)]
pub fn checkpoint() -> Result<()> {
    Ok(())
}
#[cfg(test)]
pub fn cancel_requested() -> bool {
    false
}
#[cfg(test)]
pub fn progress(_: i64, _: i64, _: &str) {}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: i64,
    pub kind: String,
    pub label: String,
    pub state: String,
    pub progress: f64,
    pub completed: i64,
    pub total: i64,
    pub eta_seconds: Option<i64>,
    pub message: String,
    pub error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub resumable: bool,
    pub can_cancel: bool,
    pub can_retry: bool,
    #[serde(skip)]
    pub payload_json: String,
    #[serde(skip)]
    pub result_json: Option<String>,
}

pub fn ensure_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY, kind TEXT NOT NULL, label TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('queued','running','pausing','paused','cancelling','cancelled','failed','completed')),
        progress REAL NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0, eta_seconds INTEGER, message TEXT NOT NULL DEFAULT '',
        error TEXT, payload_json TEXT NOT NULL, result_json TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, resumable INTEGER NOT NULL,
        can_cancel INTEGER NOT NULL, can_retry INTEGER NOT NULL, external_key TEXT UNIQUE);
        CREATE INDEX IF NOT EXISTS jobs_state_id ON jobs(state,id);
        CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_kind ON jobs(kind)
          WHERE state IN ('queued','running','pausing','paused','cancelling');")?;
    Ok(())
}

fn read(row: &rusqlite::Row<'_>) -> rusqlite::Result<Job> {
    Ok(Job {
        id: row.get(0)?,
        kind: row.get(1)?,
        label: row.get(2)?,
        state: row.get(3)?,
        progress: row.get(4)?,
        completed: row.get(5)?,
        total: row.get(6)?,
        eta_seconds: row.get(7)?,
        message: row.get(8)?,
        error: row.get(9)?,
        payload_json: row.get(10)?,
        result_json: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
        resumable: row.get(14)?,
        can_cancel: row.get(15)?,
        can_retry: row.get(16)?,
    })
}
const COLUMNS: &str = "id,kind,label,state,progress,completed,total,eta_seconds,message,error,payload_json,result_json,created_at,updated_at,resumable,can_cancel,can_retry";

#[derive(Debug, thiserror::Error)]
#[error("The catalog's verification checkpoint changed. Start this work from Completion again.")]
pub struct CheckpointChanged;
pub fn validate_checkpoint(expected: &str, actual: Option<&str>) -> Result<()> {
    if expected.is_empty() || actual != Some(expected) {
        return Err(CheckpointChanged.into());
    }
    Ok(())
}

pub fn list(conn: &Connection) -> Result<Vec<Job>> {
    // Bound finished history, but always include all actionable jobs.
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM jobs WHERE state IN ('queued','running','pausing','paused','cancelling','failed') OR id IN (SELECT id FROM jobs ORDER BY id DESC LIMIT 100) ORDER BY id DESC LIMIT 300"))?;
    let rows = stmt
        .query_map([], read)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}
pub fn get(conn: &Connection, id: i64) -> Result<Job> {
    Ok(conn.query_row(
        &format!("SELECT {COLUMNS} FROM jobs WHERE id=?1"),
        [id],
        read,
    )?)
}

pub fn enqueue(
    conn: &Connection,
    kind: &str,
    label: &str,
    payload: &str,
    resumable: bool,
    cancel: bool,
    retry: bool,
    external_key: Option<&str>,
) -> Result<i64> {
    // Existing checkpoint runs keep the same identity, including across restart.
    if let Some(key) = external_key {
        if let Some(id) = conn
            .query_row("SELECT id FROM jobs WHERE external_key=?1", [key], |r| {
                r.get::<_, i64>(0)
            })
            .optional()?
        {
            return Ok(id);
        }
    }
    let now = Utc::now().to_rfc3339();
    conn.execute("INSERT INTO jobs(kind,label,state,payload_json,created_at,updated_at,resumable,can_cancel,can_retry,external_key) VALUES(?1,?2,'queued',?3,?4,?4,?5,?6,?7,?8)", params![kind,label,payload,now,resumable,cancel,retry,external_key])
        .map_err(|error| anyhow::anyhow!("Could not queue {label}; another job of this kind may still be active: {error}"))?;
    Ok(conn.last_insert_rowid())
}

pub fn claim(conn: &mut Connection) -> Result<Option<Job>> {
    let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
    let id = tx
        .query_row(
            "SELECT id FROM jobs WHERE state='queued' ORDER BY id LIMIT 1",
            [],
            |r| r.get::<_, i64>(0),
        )
        .optional()?;
    let Some(id) = id else {
        return Ok(None);
    };
    tx.execute(
        "UPDATE jobs SET state='running', updated_at=?2 WHERE id=?1",
        params![id, Utc::now().to_rfc3339()],
    )?;
    let job = get(&tx, id)?;
    tx.commit()?;
    Ok(Some(job))
}

pub fn recover(conn: &Connection) -> Result<()> {
    conn.execute("UPDATE jobs SET state=CASE WHEN state IN ('pausing','paused') THEN 'paused' WHEN state='cancelling' THEN 'cancelled' WHEN resumable=1 THEN 'queued' ELSE 'failed' END,
      error=CASE WHEN resumable=0 AND state='running' THEN 'Interrupted when the app closed. Review the previous outcome before retrying.' ELSE error END,
      message='Recovered after app restart',updated_at=?1 WHERE state IN ('running','pausing','paused','cancelling')", [Utc::now().to_rfc3339()])?;
    Ok(())
}

pub fn control(conn: &Connection, id: i64, action: &str) -> Result<Job> {
    let job = get(conn, id)?;
    let state = match (action, job.state.as_str()) {
        ("pause", "running") if job.resumable => "pausing",
        ("pause", "queued") if job.resumable => "paused",
        ("resume", "paused") => "queued",
        ("cancel", "queued" | "paused") => "cancelled",
        ("cancel", "running" | "pausing") if job.can_cancel => "cancelling",
        ("retry", "failed" | "cancelled") if job.can_retry => "queued",
        _ => bail!("This job cannot {action} while {}", job.state),
    };
    // Conditional write prevents a concurrent completion from being overwritten.
    let changed = conn.execute("UPDATE jobs SET state=?2, error=NULL,result_json=NULL,eta_seconds=NULL,updated_at=?3 WHERE id=?1 AND state=?4", params![id,state,Utc::now().to_rfc3339(),job.state])?;
    if changed == 0 {
        bail!("The job changed; refresh Activity and try again.");
    }
    get(conn, id)
}

pub fn finish(conn: &Connection, id: i64, result: &Result<serde_json::Value>) -> Result<Job> {
    let job = get(conn, id)?;
    let (state, error, result_json) = match job.state.as_str() {
        "pausing" => ("paused", None, None),
        "cancelling" | "cancelled" => (
            "cancelled",
            None,
            result.as_ref().ok().map(|value| value.to_string()),
        ),
        // Checkpoint projection may already have settled the state.
        "paused" | "failed" => (
            job.state.as_str(),
            job.error.clone(),
            result.as_ref().ok().map(|value| value.to_string()),
        ),
        _ => match result {
            Ok(value) if value.get("cancelled").and_then(|v| v.as_bool()) == Some(true) => {
                ("cancelled", None, Some(value.to_string()))
            }
            Ok(value)
                if value
                    .get("failedCount")
                    .or_else(|| value.get("failed"))
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0)
                    > 0 =>
            {
                (
                    "failed",
                    Some("Some items failed. Review the workspace results before retrying.".into()),
                    Some(value.to_string()),
                )
            }
            Ok(value) => ("completed", None, Some(value.to_string())),
            Err(error) => ("failed", Some(format!("{error:#}")), None),
        },
    };
    conn.execute("UPDATE jobs SET state=?2,error=?3,result_json=?4,progress=CASE WHEN ?2='completed' THEN 100 ELSE progress END,eta_seconds=NULL,updated_at=?5 WHERE id=?1",params![id,state,error,result_json,Utc::now().to_rfc3339()])?;
    get(conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        ensure_schema(&c).unwrap();
        c
    }
    #[test]
    fn claims_once_and_serializes_each_kind() {
        let mut c = db();
        let id = enqueue(&c, "covers", "Covers", "{}", false, false, true, None).unwrap();
        assert!(enqueue(&c, "covers", "Covers", "{}", false, false, true, None).is_err());
        assert_eq!(claim(&mut c).unwrap().unwrap().id, id);
        assert!(claim(&mut c).unwrap().is_none());
        finish(&c, id, &Ok(serde_json::json!({"done":true}))).unwrap();
        assert!(enqueue(&c, "covers", "Covers", "{}", false, false, true, None).is_ok());
    }
    #[test]
    fn restart_recovers_checkpoints_and_requires_review_for_interrupted_writes() {
        let mut c = db();
        for (kind, resume) in [("albums", true), ("covers", false)] {
            enqueue(&c, kind, kind, "{}", resume, true, true, None).unwrap();
            claim(&mut c).unwrap();
        }
        recover(&c).unwrap();
        assert_eq!(get(&c, 1).unwrap().state, "queued");
        assert_eq!(get(&c, 2).unwrap().state, "failed");
        assert!(get(&c, 2).unwrap().error.unwrap().contains("Interrupted"));
    }
    #[test]
    fn pause_cancel_and_retry_respect_capabilities_and_worker_acknowledgement() {
        let mut c = db();
        let id = enqueue(&c, "albums", "Albums", "{}", true, true, true, None).unwrap();
        claim(&mut c).unwrap();
        assert_eq!(control(&c, id, "pause").unwrap().state, "pausing");
        assert_eq!(
            finish(&c, id, &Ok(serde_json::Value::Null)).unwrap().state,
            "paused"
        );
        control(&c, id, "resume").unwrap();
        claim(&mut c).unwrap();
        control(&c, id, "cancel").unwrap();
        assert_eq!(
            finish(&c, id, &Ok(serde_json::Value::Null)).unwrap().state,
            "cancelled"
        );
        control(&c, id, "retry").unwrap();
        claim(&mut c).unwrap();
        finish(&c, id, &Ok(serde_json::Value::Null)).unwrap();
        let id = enqueue(&c, "atomic_write", "Atomic write", "{}", false, false, true, None).unwrap();
        claim(&mut c).unwrap();
        assert!(control(&c, id, "pause").is_err());
        assert!(control(&c, id, "cancel").is_err());
    }
    #[test]
    fn checkpoint_identity_and_private_payload_are_preserved() {
        let c = db();
        let id = enqueue(
            &c,
            "albums",
            "Albums",
            r#"{"batchId":2}"#,
            true,
            true,
            true,
            Some("albums:2"),
        )
        .unwrap();
        assert_eq!(
            enqueue(
                &c,
                "albums",
                "Albums",
                "{}",
                true,
                true,
                true,
                Some("albums:2")
            )
            .unwrap(),
            id
        );
        let json = serde_json::to_value(get(&c, id).unwrap()).unwrap();
        assert!(json.get("payloadJson").is_none());
    }
    #[test]
    fn paused_and_cancelled_jobs_do_not_restart() {
        let mut c = db();
        let id = enqueue(&c, "albums", "Albums", "{}", true, true, true, None).unwrap();
        control(&c, id, "pause").unwrap();
        recover(&c).unwrap();
        assert!(claim(&mut c).unwrap().is_none());
        control(&c, id, "cancel").unwrap();
        recover(&c).unwrap();
        assert_eq!(get(&c, id).unwrap().state, "cancelled");
    }
    #[test]
    fn workers_atomically_claim_durable_jobs_without_duplicates() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("jobs.sqlite3");
        let c = Connection::open(&path).unwrap();
        ensure_schema(&c).unwrap();
        c.execute_batch("PRAGMA journal_mode=WAL").unwrap();
        for index in 0..12 {
            enqueue(
                &c,
                &format!("kind{index}"),
                "Work",
                "{}",
                false,
                false,
                true,
                None,
            )
            .unwrap();
        }
        drop(c);
        let handles = (0..2)
            .map(|_| {
                let path = path.clone();
                std::thread::spawn(move || {
                    let mut c = Connection::open(path).unwrap();
                    c.busy_timeout(std::time::Duration::from_secs(5)).unwrap();
                    let mut claimed = Vec::new();
                    while let Some(job) = claim(&mut c).unwrap() {
                        claimed.push(job.id);
                        finish(&c, job.id, &Ok(serde_json::json!({"ok":true}))).unwrap();
                    }
                    claimed
                })
            })
            .collect::<Vec<_>>();
        let mut ids = handles
            .into_iter()
            .flat_map(|h| h.join().unwrap())
            .collect::<Vec<_>>();
        ids.sort();
        assert_eq!(ids, (1..=12).collect::<Vec<_>>());
        let c = Connection::open(path).unwrap();
        assert!(list(&c).unwrap().iter().all(|job| job.state == "completed"));
    }
    #[test]
    fn queued_cancellation_and_failed_retry_preserve_the_reviewed_payload() {
        let mut c = db();
        let id = enqueue(
            &c,
            "covers",
            "Covers",
            r#"{"sourcePath":"reviewed"}"#,
            false,
            true,
            true,
            None,
        )
        .unwrap();
        control(&c, id, "cancel").unwrap();
        assert!(claim(&mut c).unwrap().is_none());
        control(&c, id, "retry").unwrap();
        claim(&mut c).unwrap();
        finish(&c, id, &Err(anyhow::anyhow!("Unreadable source"))).unwrap();
        assert_eq!(
            get(&c, id).unwrap().error.as_deref(),
            Some("Unreadable source")
        );
        control(&c, id, "retry").unwrap();
        assert!(get(&c, id).unwrap().payload_json.contains("reviewed"));
    }
    #[test]
    fn partial_failure_keeps_summary_and_is_actionable() {
        let mut c = db();
        let id = enqueue(
            &c,
            "origins",
            "Origin countries",
            "{}",
            false,
            true,
            true,
            None,
        )
        .unwrap();
        claim(&mut c).unwrap();
        let job = finish(
            &c,
            id,
            &Ok(serde_json::json!({"storedCount":12,"failedCount":2})),
        )
        .unwrap();
        assert_eq!(job.state, "failed");
        assert!(job.result_json.unwrap().contains("storedCount"));
        assert_eq!(control(&c, id, "retry").unwrap().state, "queued");
    }
    #[test]
    fn copied_catalog_cannot_reuse_a_different_checkpoint_with_the_same_id() {
        assert!(validate_checkpoint("original", Some("original")).is_ok());
        assert!(validate_checkpoint("original", Some("copied"))
            .unwrap_err()
            .is::<CheckpointChanged>());
        assert!(validate_checkpoint("original", None).is_err());
    }
}
