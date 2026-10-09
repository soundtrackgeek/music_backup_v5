//! Unresolved analysis failures, independent of a particular job's queue.
use anyhow::{bail, Result};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::{io::Write, path::Path};

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FailedTrack {
    pub track_key: String,
    pub directory: String,
    pub filename: String,
    pub error: String,
    pub last_failed_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FailedTracksPage {
    pub rows: Vec<FailedTrack>,
    pub total: i64,
    pub next_cursor: Option<String>,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FailedTracksExport {
    pub path: String,
    pub row_count: i64,
}

pub(crate) fn install(c: &Connection) -> Result<()> {
    if c.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))? >= 1 {
        return Ok(());
    }
    let tx = rusqlite::Transaction::new_unchecked(c, rusqlite::TransactionBehavior::Immediate)?;
    if tx.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))? >= 1 {
        tx.commit()?;
        return Ok(());
    }
    tx.execute_batch(
        "CREATE TABLE IF NOT EXISTS sonic_failures (
        track_key TEXT PRIMARY KEY, directory TEXT NOT NULL, filename TEXT NOT NULL,
        error TEXT NOT NULL, last_failed_at TEXT);
        CREATE INDEX IF NOT EXISTS sonic_failures_path ON sonic_failures(directory,filename);",
    )?;
    let batches = tx
        .prepare("SELECT id FROM sonic_batches ORDER BY rowid")?
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    // Use the existing batch/state index. Only unresolved candidates are checked
    // against later completed checkpoints; never scan a million completed rows.
    for batch in batches {
        tx.execute(
            "INSERT INTO sonic_failures(track_key,directory,filename,error)
            SELECT track_key,directory,filename,COALESCE(error,'No failure reason was recorded')
            FROM sonic_items WHERE batch_id=?1 AND state='failed'
            ON CONFLICT(track_key) DO UPDATE SET directory=excluded.directory,
                filename=excluded.filename,error=excluded.error",
            [&batch],
        )?;
        tx.execute(
            "DELETE FROM sonic_failures WHERE EXISTS (
            SELECT 1 FROM sonic_items i WHERE i.batch_id=?1
            AND i.track_key=sonic_failures.track_key AND i.state='done')",
            [&batch],
        )?;
    }
    tx.execute_batch("PRAGMA user_version=1;")?;
    tx.commit()?;
    Ok(())
}

pub(crate) fn record(
    c: &Connection,
    key: &str,
    directory: &str,
    filename: &str,
    error: Option<&str>,
    ready: bool,
) -> Result<()> {
    if let Some(error) = error {
        c.execute("INSERT INTO sonic_failures VALUES(?1,?2,?3,?4,?5)
            ON CONFLICT(track_key) DO UPDATE SET directory=excluded.directory,
                filename=excluded.filename,error=excluded.error,last_failed_at=excluded.last_failed_at",
            params![key, directory, filename, error, chrono::Utc::now().to_rfc3339()])?;
    } else if ready {
        c.execute("DELETE FROM sonic_failures WHERE track_key=?1", [key])?;
    }
    Ok(())
}

pub(crate) fn prepare_retry(c: &Connection, batch: &str) -> Result<()> {
    let count = c.execute(
        "INSERT OR IGNORE INTO sonic_items(batch_id,track_key,directory,filename)
        SELECT ?1,track_key,directory,filename FROM sonic_failures",
        [batch],
    )?;
    if count == 0 {
        bail!("No failed tracks to retry.");
    }
    c.execute("UPDATE sonic_batches SET prepared=1 WHERE id=?1", [batch])?;
    Ok(())
}

fn read(r: &rusqlite::Row<'_>) -> rusqlite::Result<FailedTrack> {
    Ok(FailedTrack {
        track_key: r.get(0)?,
        directory: r.get(1)?,
        filename: r.get(2)?,
        error: r.get(3)?,
        last_failed_at: r.get(4)?,
    })
}
const COLUMNS: &str = "track_key,directory,filename,error,last_failed_at";

pub(crate) fn list_at(dir: &Path, after: Option<&str>) -> Result<FailedTracksPage> {
    let c = super::sonic::work(dir)?;
    let tx = c.unchecked_transaction()?;
    let total = tx.query_row("SELECT count(*) FROM sonic_failures", [], |r| r.get(0))?;
    let mut rows = tx
        .prepare(&format!(
            "SELECT {COLUMNS} FROM sonic_failures
        WHERE track_key > ?1 ORDER BY track_key LIMIT 51"
        ))?
        .query_map([after.unwrap_or("")], read)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let next_cursor = if rows.len() > 50 {
        rows.truncate(50);
        rows.last().map(|r| r.track_key.clone())
    } else {
        None
    };
    tx.commit()?;
    Ok(FailedTracksPage {
        rows,
        total,
        next_cursor,
    })
}

pub(crate) fn csv_cell(value: &str) -> String {
    // Prevent spreadsheet formulas while retaining exact punctuation/newlines
    // through the CSV writer's quoting. The app displays the original reason.
    if value.trim_start().starts_with(['=', '+', '-', '@']) || value.starts_with(['\t', '\r', '\n'])
    {
        format!("'{value}")
    } else {
        value.to_owned()
    }
}

pub(crate) fn export_at(dir: &Path, path: &Path) -> Result<FailedTracksExport> {
    let c = super::sonic::work(dir)?;
    let tx = c.unchecked_transaction()?;
    let result = export_csv(
        path,
        &[
            "Filename",
            "Folder",
            "Failure reason",
            "Last failed (UTC)",
            "Track key",
        ],
        |csv| {
            let mut count = 0;
            let mut q = tx.prepare(&format!(
                "SELECT {COLUMNS} FROM sonic_failures ORDER BY track_key"
            ))?;
            for row in q.query_map([], read)? {
                let row = row?;
                csv.write_record([
                    csv_cell(&row.filename),
                    csv_cell(&row.directory),
                    csv_cell(&row.error),
                    row.last_failed_at.unwrap_or_default(),
                    row.track_key,
                ])?;
                count += 1;
            }
            Ok(count)
        },
    )?;
    tx.commit()?;
    Ok(result)
}

pub(crate) fn export_csv(
    path: &Path,
    headers: &[&str],
    rows: impl FnOnce(&mut csv::Writer<&mut std::fs::File>) -> Result<i64>,
) -> Result<FailedTracksExport> {
    if path
        .extension()
        .and_then(|v| v.to_str())
        .is_none_or(|v| !v.eq_ignore_ascii_case("csv"))
    {
        bail!("Choose a .csv file for the failed-track export.");
    }
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let mut file = tempfile::NamedTempFile::new_in(parent)?;
    file.write_all(b"\xef\xbb\xbf")?; // Excel recognizes UTF-8 filenames and reasons.
    let count;
    {
        let mut csv = csv::WriterBuilder::new()
            .terminator(csv::Terminator::CRLF)
            .from_writer(file.as_file_mut());
        csv.write_record(headers)?;
        count = rows(&mut csv)?;
        csv.flush()?;
    }
    file.as_file().sync_all()?;
    file.persist(path)?;
    Ok(FailedTracksExport {
        path: path.to_string_lossy().into_owned(),
        row_count: count,
    })
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_failed_tracks(
    app: tauri::AppHandle,
    after: Option<String>,
) -> Result<FailedTracksPage, String> {
    tauri::async_runtime::spawn_blocking(move || {
        list_at(&super::sonic::directory(&app)?, after.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_export_failed_tracks(
    app: tauri::AppHandle,
    path: String,
) -> Result<FailedTracksExport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        export_at(&super::sonic::directory(&app)?, Path::new(&path))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn an_interrupted_export_preserves_the_existing_csv() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("failures.csv");
        std::fs::write(&path, "previous export").unwrap();
        let result = export_csv(&path, &["Filename"], |csv| {
            csv.write_record(["first.mp3"])?;
            bail!("Could not finish reading the report");
        });
        assert!(result.is_err());
        assert_eq!(std::fs::read_to_string(path).unwrap(), "previous export");
    }
    #[test]
    fn migration_keeps_latest_unresolved_reason_and_drops_later_success() {
        let dir = tempfile::tempdir().unwrap();
        let c = super::super::sonic::work(dir.path()).unwrap();
        c.execute_batch(
            "DROP TABLE sonic_failures; PRAGMA user_version=0;
            INSERT INTO sonic_batches VALUES('old',1),('new',1);
            INSERT INTO sonic_items VALUES('old','a','folder','a.mp3','failed','old reason'),
                ('old','b','folder','b.mp3','failed','fixed later'),
                ('new','a','folder','a.mp3','failed','latest reason'),
                ('new','b','folder','b.mp3','done',NULL);",
        )
        .unwrap();
        install(&c).unwrap();
        let page = list_at(dir.path(), None).unwrap();
        assert_eq!(page.total, 1);
        assert_eq!(page.rows[0].error, "latest reason");
        assert_eq!(page.rows[0].last_failed_at, None);
        install(&c).unwrap();
        assert_eq!(list_at(dir.path(), None).unwrap().total, 1);
    }

    #[test]
    fn retry_snapshot_is_failed_only_and_retains_reasons_until_success() {
        let dir = tempfile::tempdir().unwrap();
        let c = super::super::sonic::work(dir.path()).unwrap();
        record(&c, "a", "folder", "a.mp3", Some("Missing file"), false).unwrap();
        c.execute_batch(
            "INSERT INTO sonic_batches VALUES('old',1),('retry',0);
            INSERT INTO sonic_items VALUES('old','done','folder','done.mp3','done',NULL),
                ('old','pending','folder','pending.mp3','pending',NULL);",
        )
        .unwrap();
        let tx = c.unchecked_transaction().unwrap();
        prepare_retry(&tx, "retry").unwrap();
        tx.commit().unwrap();
        assert_eq!(
            c.query_row(
                "SELECT count(*) FROM sonic_items WHERE batch_id='retry'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
        assert_eq!(
            list_at(dir.path(), None).unwrap().rows[0].error,
            "Missing file"
        );
        record(&c, "a", "folder", "a.mp3", None, false).unwrap(); // unmatched reuse is not analysis
        assert_eq!(list_at(dir.path(), None).unwrap().total, 1);
        record(&c, "a", "folder", "a.mp3", None, true).unwrap();
        assert_eq!(list_at(dir.path(), None).unwrap().total, 0);
    }

    #[test]
    fn pages_are_bounded_but_csv_exports_every_failure_with_unicode_and_quoting() {
        let dir = tempfile::tempdir().unwrap();
        let c = super::super::sonic::work(dir.path()).unwrap();
        for i in 0..105 {
            record(
                &c,
                &format!("key-{i:03}"),
                "C:\\Música",
                "=song,\"one\".mp3",
                Some("@reason,\"bad\"\nnext line"),
                false,
            )
            .unwrap();
        }
        let first = list_at(dir.path(), None).unwrap();
        assert_eq!(first.total, 105);
        assert_eq!(first.rows.len(), 50);
        let second = list_at(dir.path(), first.next_cursor.as_deref()).unwrap();
        let third = list_at(dir.path(), second.next_cursor.as_deref()).unwrap();
        assert_eq!(third.rows.len(), 5);
        assert!(third.next_cursor.is_none());
        assert_ne!(first.rows[49].track_key, second.rows[0].track_key);
        let path = dir.path().join("failures.csv");
        let exported = export_at(dir.path(), &path).unwrap();
        assert_eq!(exported.row_count, 105);
        let bytes = std::fs::read(&path).unwrap();
        assert_eq!(&bytes[..3], b"\xef\xbb\xbf");
        let records = csv::Reader::from_reader(&bytes[3..])
            .records()
            .collect::<std::result::Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(records.len(), 105);
        assert_eq!(&records[0][0], "'=song,\"one\".mp3");
        assert_eq!(&records[0][1], "C:\\Música");
        assert_eq!(&records[0][2], "'@reason,\"bad\"\nnext line");
        assert!(export_at(dir.path(), &dir.path().join("music.mp3")).is_err());
    }
}
