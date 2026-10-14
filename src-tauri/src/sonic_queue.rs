//! Reuse unfinished work and bound historical queue storage without losing audio results.
use anyhow::{bail, Context, Result};
use rusqlite::{Connection, OpenFlags, TransactionBehavior};
use std::{collections::HashSet, path::Path, time::Duration};

use crate::{jobs, sonic::AnalyzeRequest};

fn identity(kind: &str, request: &AnalyzeRequest) -> (String, String, Option<String>) {
    (
        kind.into(),
        request.scope.clone(),
        if request.scope == "album" {
            request.album_id.clone()
        } else {
            None
        },
    )
}

fn active(state: &str) -> bool {
    matches!(
        state,
        "queued" | "running" | "pausing" | "paused" | "cancelling"
    )
}

/// The immediate transaction closes the gap between finding a resumable job and
/// enqueueing one, including requests arriving from another app connection.
pub(crate) fn enqueue(c: &Connection, kind: &str, request: &AnalyzeRequest) -> Result<i64> {
    let tx = rusqlite::Transaction::new_unchecked(c, TransactionBehavior::Immediate)?;
    let mut q = tx.prepare(
        "SELECT id FROM jobs WHERE kind IN ('sonicAnalysis','sonicReuse') ORDER BY id DESC",
    )?;
    let ids = q
        .query_map([], |r| r.get::<_, i64>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(q);
    let existing = ids
        .into_iter()
        .map(|id| jobs::get(&tx, id))
        .collect::<Result<Vec<_>>>()?;
    let wanted = identity(kind, request);
    let matching = |job: &jobs::Job| {
        serde_json::from_str::<AnalyzeRequest>(&job.payload_json)
            .ok()
            .is_some_and(|saved| identity(&job.kind, &saved) == wanted)
    };
    let candidate = if let Some(job) = existing.iter().find(|j| active(&j.state)) {
        if !matching(job) {
            bail!("Continue or finish the current audio analysis before starting a different analysis scope.");
        }
        Some(job)
    } else {
        // A completed newer scan supersedes older failed/cancelled scans.
        existing.iter().find(|j| matching(j))
    };
    let id = if let Some(job) = candidate.filter(|j| {
        active(&j.state) || j.can_retry && matches!(j.state.as_str(), "failed" | "cancelled")
    }) {
        match job.state.as_str() {
            "paused" => {
                jobs::control(&tx, job.id, "resume")?;
            }
            "failed" | "cancelled" if job.can_retry => {
                jobs::control(&tx, job.id, "retry")?;
            }
            "queued" | "running" => {}
            "pausing" | "cancelling" => bail!("Wait for audio analysis to stop, then continue it."),
            _ => bail!("This saved analysis cannot be continued. Review it in Activity Center."),
        }
        job.id
    } else {
        jobs::enqueue(
            &tx,
            kind,
            if kind == "sonicReuse" {
                "Verify reused analysis"
            } else {
                "Audio analysis"
            },
            &serde_json::to_string(request)?,
            true,
            true,
            true,
            None,
        )?
    };
    tx.commit()?;
    Ok(id)
}

/// Keep all live queues and the newest queue for each scope/album. Historical
/// jobs keep their identity and payload; prepared=0 makes a later Retry rebuild
/// their snapshot and reuse the independently saved, current audio features.
fn obsolete(dir: &Path, current: &str) -> Result<Vec<String>> {
    let path = dir.join("jobs.sqlite3");
    if !path.is_file() {
        return Ok(vec![]);
    }
    let c = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    c.busy_timeout(Duration::from_secs(5))?;
    let mut seen = HashSet::new();
    let mut keep = HashSet::from([current.to_owned()]);
    let mut remove = HashSet::new();
    let mut q = c.prepare("SELECT kind,state,payload_json FROM jobs WHERE kind IN ('sonicAnalysis','sonicReuse') ORDER BY id DESC")?;
    let rows = q.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
        ))
    })?;
    for row in rows {
        let (kind, state, payload) = row?;
        let Ok(request) = serde_json::from_str::<AnalyzeRequest>(&payload) else {
            continue;
        };
        let newest = seen.insert(identity(&kind, &request));
        let Some(batch) = request.batch_id else {
            continue;
        };
        if newest || active(&state) {
            keep.insert(batch);
        } else {
            remove.insert(batch);
        }
    }
    Ok(remove.difference(&keep).cloned().collect())
}

pub(crate) fn maintain(
    dir: &Path,
    w: &mut Connection,
    current: &str,
    stop: &impl Fn() -> bool,
    report: &impl Fn(&str),
) -> Result<()> {
    let mut announced = false;
    for batch in obsolete(dir, current)? {
        loop {
            if stop() {
                bail!("Analysis stopped at a durable checkpoint");
            }
            let tx = w.transaction()?;
            // Set this in the same transaction as every deletion. Partial cleanup
            // is restartable and can never leave a truncated queue marked ready.
            let removed = tx.execute(
                "DELETE FROM sonic_items WHERE rowid IN (SELECT rowid FROM sonic_items WHERE batch_id=?1 LIMIT 10000)",
                [&batch],
            )?;
            if removed > 0 {
                tx.execute("UPDATE sonic_batches SET prepared=0 WHERE id=?1", [&batch])?;
            }
            tx.commit()?;
            if removed == 0 {
                break;
            }
            if !announced {
                report("Reclaiming older audio analysis queues. Saved analysis is preserved.");
                announced = true;
            }
        }
    }
    compact(w, stop, report, 64 * 1024 * 1024)
}

fn compact(
    w: &Connection,
    stop: &impl Fn() -> bool,
    report: &impl Fn(&str),
    minimum_free: i64,
) -> Result<()> {
    let page_size: i64 = w.pragma_query_value(None, "page_size", |r| r.get(0))?;
    let free: i64 = w.pragma_query_value(None, "freelist_count", |r| r.get(0))?;
    if free * page_size < minimum_free {
        return Ok(());
    }
    if stop() {
        bail!("Analysis stopped at a durable checkpoint");
    }
    // A reader can defer disk reclamation; the free pages remain reusable.
    let busy: i64 = w.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |r| r.get(0))?;
    if busy != 0 {
        return Ok(());
    }
    report("Compacting audio analysis queue storage. Saved analysis is preserved.");
    let mode: i64 = w.pragma_query_value(None, "auto_vacuum", |r| r.get(0))?;
    if mode != 2 {
        w.execute_batch("PRAGMA auto_vacuum=INCREMENTAL; VACUUM;")
            .context("Could not compact analysis queues; completed analysis and current checkpoints are saved")?;
    } else {
        while w.pragma_query_value(None, "freelist_count", |r| r.get::<_, i64>(0))? > 0 {
            if stop() {
                bail!("Analysis stopped at a durable checkpoint");
            }
            w.execute_batch("PRAGMA incremental_vacuum(1000);")?;
        }
    }
    w.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    fn request(batch: &str) -> AnalyzeRequest {
        AnalyzeRequest {
            scope: "all".into(),
            album_id: None,
            batch_id: Some(batch.into()),
        }
    }
    fn registry() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        jobs::ensure_schema(&c).unwrap();
        c
    }
    #[test]
    fn repeated_starts_reuse_the_same_job_and_checkpoint_identity() {
        for state in ["queued", "running", "paused", "failed", "cancelled"] {
            let c = registry();
            let id = enqueue(&c, "sonicAnalysis", &request("original")).unwrap();
            c.execute(
                "UPDATE jobs SET state=?1,completed=250000,total=1100000 WHERE id=?2",
                params![state, id],
            )
            .unwrap();
            assert_eq!(
                enqueue(&c, "sonicAnalysis", &request("duplicate")).unwrap(),
                id
            );
            let job = jobs::get(&c, id).unwrap();
            assert_eq!(job.completed, 250000);
            assert!(job.payload_json.contains("original"));
            assert!(!job.payload_json.contains("duplicate"));
            assert_eq!(
                c.query_row("SELECT count(*) FROM jobs", [], |r| r.get::<_, i64>(0))
                    .unwrap(),
                1
            );
        }
    }
    #[test]
    fn completed_scans_allow_new_imports_and_different_active_scopes_do_not_overlap() {
        let c = registry();
        let old = enqueue(&c, "sonicAnalysis", &request("old")).unwrap();
        c.execute("UPDATE jobs SET state='completed' WHERE id=?1", [old])
            .unwrap();
        let new = enqueue(&c, "sonicAnalysis", &request("new")).unwrap();
        assert_ne!(new, old);
        let mut favorites = request("favorites");
        favorites.scope = "favorites".into();
        assert!(enqueue(&c, "sonicAnalysis", &favorites).is_err());
        assert!(enqueue(&c, "sonicReuse", &request("reuse")).is_err());
        assert_eq!(jobs::get(&c, new).unwrap().state, "queued");
    }
    #[test]
    fn a_catalog_replacement_allows_a_fresh_job_instead_of_reviving_an_invalid_checkpoint() {
        let c = registry();
        let old = enqueue(&c, "sonicAnalysis", &request("old-catalog")).unwrap();
        c.execute(
            "UPDATE jobs SET state='failed',can_retry=0 WHERE id=?1",
            [old],
        )
        .unwrap();
        assert_ne!(
            enqueue(&c, "sonicAnalysis", &request("new-catalog")).unwrap(),
            old
        );
    }
    #[test]
    fn cleanup_preserves_live_and_latest_queues_and_rebuilds_historical_retries() {
        let dir = tempfile::tempdir().unwrap();
        let j = Connection::open(dir.path().join("jobs.sqlite3")).unwrap();
        jobs::ensure_schema(&j).unwrap();
        let mut w = crate::sonic::work(dir.path()).unwrap();
        for (batch, state, scope) in [
            ("old", "cancelled", "all"),
            ("paused", "cancelled", "favorites"),
            ("latest", "failed", "all"),
        ] {
            let mut req = request(batch);
            req.scope = scope.into();
            let id = jobs::enqueue(
                &j,
                "sonicAnalysis",
                "Audio analysis",
                &serde_json::to_string(&req).unwrap(),
                true,
                true,
                true,
                None,
            )
            .unwrap();
            j.execute("UPDATE jobs SET state=?1 WHERE id=?2", params![state, id])
                .unwrap();
            w.execute("INSERT INTO sonic_batches VALUES(?1,1)", [batch])
                .unwrap();
            w.execute(
                "INSERT INTO sonic_items VALUES(?1,'key','folder','song.mp3','pending',NULL)",
                [batch],
            )
            .unwrap();
        }
        j.execute("UPDATE jobs SET state='paused' WHERE id=2", [])
            .unwrap();
        crate::sonic_failures::record(
            &w,
            "failed",
            "folder",
            "failed.mp3",
            Some("Missing file"),
            false,
        )
        .unwrap();
        maintain(dir.path(), &mut w, "latest", &|| false, &|_| {}).unwrap();
        assert_eq!(
            w.query_row("SELECT count(*) FROM sonic_items", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            2
        );
        assert_eq!(
            w.query_row(
                "SELECT prepared FROM sonic_batches WHERE id='old'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
        assert_eq!(
            w.query_row("SELECT count(*) FROM sonic_failures", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(jobs::get(&j, 1).unwrap().state, "cancelled");
        assert!(jobs::control(&j, 1, "retry").is_err()); // Another analysis is paused.
        jobs::control(&j, 2, "cancel").unwrap();
        assert_eq!(jobs::control(&j, 1, "retry").unwrap().state, "queued");
        assert!(obsolete(dir.path(), "old")
            .unwrap()
            .iter()
            .all(|b| b != "old"));
    }

    #[test]
    fn simultaneous_start_requests_create_one_job() {
        use std::sync::{Arc, Barrier};
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("jobs.sqlite3");
        let c = Connection::open(&path).unwrap();
        jobs::ensure_schema(&c).unwrap();
        let barrier = Arc::new(Barrier::new(2));
        let handles = (0..2)
            .map(|i| {
                let path = path.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    let c = Connection::open(path).unwrap();
                    c.busy_timeout(Duration::from_secs(5)).unwrap();
                    barrier.wait();
                    enqueue(&c, "sonicAnalysis", &request(&format!("request-{i}"))).unwrap()
                })
            })
            .collect::<Vec<_>>();
        let ids = handles
            .into_iter()
            .map(|h| h.join().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(ids[0], ids[1]);
        assert_eq!(
            c.query_row("SELECT count(*) FROM jobs", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
    }

    #[test]
    fn compaction_reclaims_disk_and_preserves_checkpoints_failures_and_settings() {
        for legacy in [false, true] {
            let dir = tempfile::tempdir().unwrap();
            let w = crate::sonic::work(dir.path()).unwrap();
            if legacy {
                w.execute_batch("PRAGMA auto_vacuum=NONE; VACUUM;").unwrap();
            }
            w.execute_batch("INSERT INTO sonic_batches VALUES('keep',1),('old',1);
                INSERT INTO sonic_items VALUES('keep','checkpoint','folder','song.mp3','done',NULL);
                INSERT INTO sonic_settings VALUES(1,'schedule');
                WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<4000)
                INSERT INTO sonic_items SELECT 'old',printf('%08d',x),hex(zeroblob(300)),'song.mp3','pending',NULL FROM n;
                DELETE FROM sonic_items WHERE batch_id='old';
                PRAGMA wal_checkpoint(TRUNCATE);").unwrap();
            crate::sonic_failures::record(
                &w,
                "bad",
                "folder",
                "bad.mp3",
                Some("Unreadable"),
                false,
            )
            .unwrap();
            let path = dir.path().join("sonic-work.sqlite3");
            let before = std::fs::metadata(&path).unwrap().len();
            compact(&w, &|| false, &|_| {}, 1).unwrap();
            assert!(std::fs::metadata(&path).unwrap().len() < before / 2);
            assert_eq!(
                w.pragma_query_value(None, "auto_vacuum", |r| r.get::<_, i64>(0))
                    .unwrap(),
                2
            );
            assert_eq!(
                w.query_row(
                    "SELECT state FROM sonic_items WHERE track_key='checkpoint'",
                    [],
                    |r| r.get::<_, String>(0)
                )
                .unwrap(),
                "done"
            );
            assert_eq!(
                w.query_row("SELECT value FROM sonic_settings", [], |r| r
                    .get::<_, String>(0))
                    .unwrap(),
                "schedule"
            );
            assert_eq!(
                w.query_row("SELECT error FROM sonic_failures", [], |r| r
                    .get::<_, String>(0))
                    .unwrap(),
                "Unreadable"
            );
            assert_eq!(
                w.query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0))
                    .unwrap(),
                "ok"
            );
            // Repeated maintenance is harmless once space has been reclaimed.
            compact(&w, &|| false, &|_| {}, 1).unwrap();
        }
    }

    #[test]
    fn interrupted_cleanup_is_restartable_and_marks_the_old_snapshot_for_rebuild() {
        use std::cell::Cell;
        let dir = tempfile::tempdir().unwrap();
        let j = Connection::open(dir.path().join("jobs.sqlite3")).unwrap();
        jobs::ensure_schema(&j).unwrap();
        for batch in ["old", "latest"] {
            let id = jobs::enqueue(
                &j,
                "sonicAnalysis",
                "Audio analysis",
                &serde_json::to_string(&request(batch)).unwrap(),
                true,
                true,
                true,
                None,
            )
            .unwrap();
            j.execute("UPDATE jobs SET state='cancelled' WHERE id=?1", [id])
                .unwrap();
        }
        let mut w = crate::sonic::work(dir.path()).unwrap();
        w.execute_batch("INSERT INTO sonic_batches VALUES('old',1),('latest',1);
            WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<20001)
            INSERT INTO sonic_items SELECT 'old',printf('%08d',x),'folder','song.mp3','pending',NULL FROM n;
            INSERT INTO sonic_items VALUES('latest','keep','folder','keep.mp3','pending',NULL);").unwrap();
        let calls = Cell::new(0);
        assert!(maintain(
            dir.path(),
            &mut w,
            "latest",
            &|| {
                let n = calls.get();
                calls.set(n + 1);
                n > 0
            },
            &|_| {}
        )
        .is_err());
        assert_eq!(
            w.query_row(
                "SELECT count(*) FROM sonic_items WHERE batch_id='old'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            10001
        );
        assert_eq!(
            w.query_row(
                "SELECT prepared FROM sonic_batches WHERE id='old'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
        maintain(dir.path(), &mut w, "latest", &|| false, &|_| {}).unwrap();
        assert_eq!(
            w.query_row("SELECT count(*) FROM sonic_items", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
    }
}
