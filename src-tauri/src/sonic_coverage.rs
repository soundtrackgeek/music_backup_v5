//! Read-only reconciliation against Music Library's master catalog.
use super::sonic_failures::{csv_cell, export_csv, FailedTracksExport};
use anyhow::Result;
use music_sonic_core::PROFILE;
use rusqlite::{params, Connection, OpenFlags};
use serde::Serialize;
use std::{path::Path, time::Duration};

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MissingAnalysis {
    pub track_id: i64,
    pub directory: String,
    pub filename: String,
    pub reason: String,
    pub failed: bool,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisCoverage {
    pub rows: Vec<MissingAnalysis>,
    pub total: i64,
    pub analyzed: i64,
    pub missing: i64,
    pub failed: i64,
    pub next_cursor: Option<i64>,
}

fn source(dir: &Path) -> Result<(Connection, String)> {
    // Initialize/import the device-local failure records before attaching them.
    drop(super::sonic::work(dir)?);
    let c = Connection::open_with_flags(
        dir.join("music-library.sqlite3"),
        OpenFlags::SQLITE_OPEN_READ_ONLY,
    )?;
    c.busy_timeout(Duration::from_secs(5))?;
    c.execute(
        "ATTACH DATABASE ?1 AS work",
        [dir.join("sonic-work.sqlite3").to_string_lossy().as_ref()],
    )?;
    let has_analysis = super::sonic::attach(&c, dir)?;
    c.execute_batch("PRAGMA query_only=ON;")?;
    let from = "FROM tracks t LEFT JOIN work.sonic_failures f ON f.directory=t.file_path AND f.filename=t.filename";
    let sql = if has_analysis {
        format!("SELECT t.id,t.file_path,t.filename,
            CASE WHEN f.track_key IS NOT NULL THEN f.error
                WHEN s.track_key IS NULL THEN 'No saved analysis'
                WHEN s.profile != ?1 THEN 'Analysis uses an older profile'
                ELSE 'Saved audio features are missing' END AS reason,
            f.track_key IS NOT NULL AS failed,
            (f.track_key IS NOT NULL OR s.track_key IS NULL OR s.profile != ?1 OR a.audio_hash IS NULL) AS missing
            {from} LEFT JOIN sonic.sonic_tracks s ON s.directory=t.file_path AND s.filename=t.filename
            LEFT JOIN sonic.sonic_audio a ON a.audio_hash=s.audio_hash AND a.profile=s.profile
            WHERE lower(t.filename) LIKE '%.mp3'")
    } else {
        format!(
            "SELECT t.id,t.file_path,t.filename,COALESCE(f.error,'No saved analysis') AS reason,
            f.track_key IS NOT NULL AS failed,1 AS missing {from}
            WHERE lower(t.filename) LIKE '%.mp3' AND ?1 IS NOT NULL"
        )
    };
    Ok((c, sql))
}

fn read(r: &rusqlite::Row<'_>) -> rusqlite::Result<MissingAnalysis> {
    Ok(MissingAnalysis {
        track_id: r.get(0)?,
        directory: r.get(1)?,
        filename: r.get(2)?,
        reason: r.get(3)?,
        failed: r.get(4)?,
    })
}

pub(crate) fn check_at(dir: &Path, after: Option<i64>) -> Result<AnalysisCoverage> {
    let (c, sql) = source(dir)?;
    let tx = c.unchecked_transaction()?;
    let (total, missing, failed): (i64, i64, i64) = tx.query_row(
        &format!("SELECT count(*),COALESCE(sum(missing),0),COALESCE(sum(failed),0) FROM ({sql})"),
        [PROFILE],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    let mut rows = tx.prepare(&format!("SELECT id,file_path,filename,reason,failed FROM ({sql}) WHERE missing AND id>?2 ORDER BY id LIMIT 51"))?
        .query_map(params![PROFILE, after.unwrap_or(0)], read)?.collect::<rusqlite::Result<Vec<_>>>()?;
    let next_cursor = if rows.len() > 50 {
        rows.truncate(50);
        rows.last().map(|r| r.track_id)
    } else {
        None
    };
    tx.commit()?;
    Ok(AnalysisCoverage {
        rows,
        total,
        analyzed: total - missing,
        missing,
        failed,
        next_cursor,
    })
}

pub(crate) fn export_at(dir: &Path, path: &Path) -> Result<FailedTracksExport> {
    let (c, sql) = source(dir)?;
    let tx = c.unchecked_transaction()?;
    let result = export_csv(
        path,
        &["Filename", "Folder", "Status", "Reason", "Catalog track ID"],
        |csv| {
            let mut q = tx.prepare(&format!(
                "SELECT id,file_path,filename,reason,failed FROM ({sql}) WHERE missing ORDER BY id"
            ))?;
            let mut count = 0;
            for row in q.query_map([PROFILE], read)? {
                let row = row?;
                csv.write_record([
                    csv_cell(&row.filename),
                    csv_cell(&row.directory),
                    if row.failed {
                        "Failed".into()
                    } else {
                        "Needs analysis".into()
                    },
                    csv_cell(&row.reason),
                    row.track_id.to_string(),
                ])?;
                count += 1;
            }
            Ok(count)
        },
    )?;
    tx.commit()?;
    Ok(result)
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_check_coverage(
    app: tauri::AppHandle,
    after: Option<i64>,
) -> Result<AnalysisCoverage, String> {
    tauri::async_runtime::spawn_blocking(move || check_at(&super::sonic::directory(&app)?, after))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_export_missing_analysis(
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
    fn master_reconciliation_distinguishes_failures_unanalyzed_and_incompatible_results() {
        let dir = tempfile::tempdir().unwrap();
        let master = Connection::open(dir.path().join("music-library.sqlite3")).unwrap();
        master.execute_batch("CREATE TABLE tracks(id INTEGER PRIMARY KEY,file_path TEXT,filename TEXT);
            INSERT INTO tracks VALUES(1,'folder','ready.mp3'),(2,'folder','failed.mp3'),
                (3,'folder','new.mp3'),(4,'folder','old.mp3'),(5,'folder','broken.mp3'),(6,'folder','ignore.flac');").unwrap();
        let w = super::super::sonic::work(dir.path()).unwrap();
        super::super::sonic_failures::record(
            &w,
            "failed",
            "folder",
            "failed.mp3",
            Some("File is missing"),
            false,
        )
        .unwrap();
        super::super::sonic_failures::record(
            &w,
            "removed",
            "folder",
            "removed.mp3",
            Some("Removed from catalog"),
            false,
        )
        .unwrap();
        let absent = check_at(dir.path(), None).unwrap();
        assert_eq!((absent.total, absent.missing, absent.failed), (5, 5, 1));
        let a = Connection::open(dir.path().join("music-analysis.sqlite3")).unwrap();
        a.execute_batch("CREATE TABLE sonic_tracks(track_key TEXT, directory TEXT, filename TEXT, profile TEXT, audio_hash TEXT);
            CREATE TABLE sonic_audio(audio_hash TEXT,profile TEXT);").unwrap();
        a.execute("INSERT INTO sonic_tracks VALUES('ready','folder','ready.mp3',?1,'good'),('broken','folder','broken.mp3',?1,'missing'),('old','folder','old.mp3','old-profile','old')", [PROFILE]).unwrap();
        a.execute("INSERT INTO sonic_audio VALUES('good',?1)", [PROFILE])
            .unwrap();
        let report = check_at(dir.path(), None).unwrap();
        assert_eq!(
            (report.total, report.analyzed, report.missing, report.failed),
            (5, 1, 4, 1)
        );
        assert_eq!(
            report
                .rows
                .iter()
                .map(|r| r.reason.as_str())
                .collect::<Vec<_>>(),
            vec![
                "File is missing",
                "No saved analysis",
                "Analysis uses an older profile",
                "Saved audio features are missing"
            ]
        );
        let path = dir.path().join("missing.csv");
        assert_eq!(export_at(dir.path(), &path).unwrap().row_count, 4);
        assert_eq!(
            master
                .query_row("SELECT count(*) FROM tracks", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            6
        );
        assert!(!dir.path().join("ready.mp3").exists()); // No decoding or filesystem probing.
    }
}
