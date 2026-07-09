use super::{
    configure, count_rows, migrate, BackupMetadata, LATEST_SCHEMA_VERSION, MIGRATION_LOCK,
};
#[cfg(not(test))]
use super::{database_path, open};
use crate::models::{DatabaseBackup, DatabaseRestoreSummary};
use anyhow::{anyhow, bail, Context, Result};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OpenFlags};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
#[cfg(not(test))]
use tauri::AppHandle;

#[cfg(not(test))]
pub fn list_database_backups_for_app(app: &AppHandle) -> Result<Vec<DatabaseBackup>> {
    let (conn, db_path) = open(app)?;
    list_database_backups(&conn, &db_path)
}

#[cfg(not(test))]
pub fn restore_database_backup_for_app(
    app: &AppHandle,
    backup_path: String,
) -> Result<DatabaseRestoreSummary> {
    let db_path = database_path(app)?;
    restore_database_backup(&db_path, &backup_path)
}

pub fn list_database_backups(conn: &Connection, db_path: &Path) -> Result<Vec<DatabaseBackup>> {
    let backup_dir = backup_directory_for_db_path(db_path)?;
    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    let metadata_by_path = database_backup_metadata(conn)?;
    let mut backups = fs::read_dir(&backup_dir)
        .with_context(|| format!("Could not read backup directory {}", backup_dir.display()))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| sqlite_file_path(&entry.path()))
        .map(|entry| {
            let path = entry.path();
            let key = backup_path_key(&path);
            let metadata = metadata_by_path.get(&key);
            database_backup_from_file(&path, metadata)
        })
        .collect::<Result<Vec<_>>>()?;

    backups.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(backups)
}

pub fn restore_database_backup(
    db_path: &Path,
    backup_path: &str,
) -> Result<DatabaseRestoreSummary> {
    let source_path = resolve_database_backup_path(db_path, backup_path)?;
    let source_schema = read_database_schema_version(&source_path).with_context(|| {
        format!(
            "Could not read backup schema version from {}",
            source_path.display()
        )
    })?;

    if !schema_version_can_restore(source_schema) {
        bail!("Backup schema version {source_schema} cannot be restored by this app version");
    }

    let metadata_by_path = if db_path.exists() {
        match Connection::open(db_path) {
            Ok(conn) => database_backup_metadata(&conn).unwrap_or_default(),
            Err(_) => HashMap::new(),
        }
    } else {
        HashMap::new()
    };
    let source_key = backup_path_key(&source_path);
    let restored_backup =
        database_backup_from_file(&source_path, metadata_by_path.get(&source_key))?;

    let pre_restore_backup_path = {
        let _restore_guard = MIGRATION_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let pre_restore_backup_path = create_database_file_backup(db_path, "restore")?;

        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).with_context(|| {
                format!("Could not create database directory {}", parent.display())
            })?;
        }

        remove_sqlite_sidecars(db_path)?;
        fs::copy(&source_path, db_path).with_context(|| {
            format!(
                "Could not restore backup {} to {}",
                source_path.display(),
                db_path.display()
            )
        })?;
        remove_sqlite_sidecars(db_path)?;

        pre_restore_backup_path
    };

    let conn = Connection::open(db_path)
        .with_context(|| format!("Could not open restored database at {}", db_path.display()))?;
    configure(&conn)?;
    migrate(&conn)?;

    if let Some(pre_restore_backup_path) = &pre_restore_backup_path {
        let source_size_bytes = fs::metadata(&source_path)
            .map(|metadata| metadata.len() as i64)
            .unwrap_or_default();
        conn.execute(
            "
            INSERT INTO database_backups (
                created_at, operation, source_path, source_size_bytes, backup_path
            ) VALUES (?1, 'restore', ?2, ?3, ?4)
            ",
            params![
                Utc::now().to_rfc3339(),
                source_path.display().to_string(),
                source_size_bytes,
                pre_restore_backup_path.display().to_string()
            ],
        )
        .context("Could not record pre-restore backup metadata")?;
    }

    let schema_version = conn
        .query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
        .context("Could not read restored database schema version")?;
    let track_count = count_rows(&conn, "tracks")?;
    let album_count = count_rows(&conn, "albums")?;

    Ok(DatabaseRestoreSummary {
        restored_backup,
        pre_restore_backup_path: pre_restore_backup_path
            .as_ref()
            .map(|path| path.display().to_string()),
        track_count,
        album_count,
        schema_version,
    })
}

pub(super) fn backup_directory_for_db_path(db_path: &Path) -> Result<PathBuf> {
    Ok(db_path
        .parent()
        .ok_or_else(|| anyhow!("Database path has no parent directory"))?
        .join("backups"))
}

fn database_backup_metadata(conn: &Connection) -> Result<HashMap<String, BackupMetadata>> {
    let mut stmt = conn
        .prepare(
            "
            SELECT b.id, b.created_at, b.operation, b.source_path,
                   b.source_size_bytes, b.backup_path, i.track_rows, i.album_count
            FROM database_backups b
            LEFT JOIN import_runs i ON i.backup_path = b.backup_path
            ORDER BY b.id DESC
            ",
        )
        .context("Could not prepare database backup metadata query")?;

    let rows = stmt
        .query_map([], |row| {
            Ok(BackupMetadata {
                id: row.get(0)?,
                created_at: row.get(1)?,
                operation: row.get(2)?,
                source_path: row.get(3)?,
                source_size_bytes: row.get(4)?,
                backup_path: row.get(5)?,
                track_rows: row.get(6)?,
                album_count: row.get(7)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not read database backup metadata")?;

    let mut metadata_by_path = HashMap::new();
    for metadata in rows {
        metadata_by_path.insert(
            backup_path_key(Path::new(&metadata.backup_path)),
            metadata.clone(),
        );
        if let Ok(canonical) = PathBuf::from(&metadata.backup_path).canonicalize() {
            metadata_by_path.insert(backup_path_key(&canonical), metadata);
        }
    }

    Ok(metadata_by_path)
}

fn database_backup_from_file(
    path: &Path,
    metadata: Option<&BackupMetadata>,
) -> Result<DatabaseBackup> {
    let file_metadata = fs::metadata(path)
        .with_context(|| format!("Could not read backup metadata for {}", path.display()))?;
    let schema_version = read_database_schema_version(path).ok();
    let created_at = metadata
        .map(|metadata| metadata.created_at.clone())
        .or_else(|| {
            file_metadata
                .modified()
                .ok()
                .map(|time| DateTime::<Utc>::from(time).to_rfc3339())
        })
        .unwrap_or_else(|| Utc::now().to_rfc3339());
    let operation = metadata
        .map(|metadata| metadata.operation.clone())
        .unwrap_or_else(|| fallback_backup_operation(path));

    Ok(DatabaseBackup {
        id: metadata.map(|metadata| metadata.id),
        created_at,
        operation,
        source_path: metadata.and_then(|metadata| metadata.source_path.clone()),
        source_size_bytes: metadata
            .map(|metadata| metadata.source_size_bytes)
            .unwrap_or_default(),
        backup_path: path.display().to_string(),
        file_size_bytes: file_metadata.len() as i64,
        track_rows: metadata.and_then(|metadata| metadata.track_rows),
        album_count: metadata.and_then(|metadata| metadata.album_count),
        schema_version,
        exists: true,
        can_restore: schema_version
            .map(schema_version_can_restore)
            .unwrap_or(false),
    })
}

fn fallback_backup_operation(path: &Path) -> String {
    let filename = path
        .file_name()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    if filename.contains("before-restore") {
        "restore".to_string()
    } else if filename.contains("before-import") {
        "import".to_string()
    } else {
        "backup".to_string()
    }
}

fn sqlite_file_path(path: &Path) -> bool {
    path.extension()
        .map(|extension| extension.eq_ignore_ascii_case("sqlite3"))
        .unwrap_or(false)
}

fn backup_path_key(path: &Path) -> String {
    path.display().to_string().to_lowercase()
}

fn resolve_database_backup_path(db_path: &Path, backup_path: &str) -> Result<PathBuf> {
    let trimmed = backup_path.trim();
    if trimmed.is_empty() {
        bail!("Choose a database backup before restoring");
    }

    let backup_dir = backup_directory_for_db_path(db_path)?;
    fs::create_dir_all(&backup_dir)
        .with_context(|| format!("Could not create backup directory {}", backup_dir.display()))?;
    let backup_dir = backup_dir.canonicalize().with_context(|| {
        format!(
            "Could not resolve backup directory {}",
            backup_dir.display()
        )
    })?;

    let provided = PathBuf::from(trimmed);
    let candidate = if provided.is_absolute() {
        provided
    } else {
        backup_dir.join(provided)
    };

    if !candidate.exists() {
        bail!("Database backup does not exist: {}", candidate.display());
    }
    if !sqlite_file_path(&candidate) {
        bail!("Database backup must be a .sqlite3 file");
    }

    let candidate = candidate
        .canonicalize()
        .with_context(|| format!("Could not resolve database backup {}", candidate.display()))?;
    if !candidate.starts_with(&backup_dir) {
        bail!("Database backup must be inside the app backup directory");
    }

    Ok(candidate)
}

fn read_database_schema_version(path: &Path) -> Result<i32> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .with_context(|| format!("Could not open SQLite database {}", path.display()))?;
    conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
        .with_context(|| {
            format!(
                "Could not read SQLite schema version from {}",
                path.display()
            )
        })
}

fn schema_version_can_restore(schema_version: i32) -> bool {
    schema_version > 0 && schema_version <= LATEST_SCHEMA_VERSION
}

pub(super) fn create_database_file_backup(
    db_path: &Path,
    operation: &str,
) -> Result<Option<PathBuf>> {
    if !db_path.exists() {
        return Ok(None);
    }

    let conn = Connection::open(db_path)
        .with_context(|| format!("Could not open active database {}", db_path.display()))?;
    conn.execute_batch("PRAGMA wal_checkpoint(FULL);")
        .context("Could not checkpoint SQLite WAL before database backup")?;
    drop(conn);

    let backup_dir = backup_directory_for_db_path(db_path)?;
    fs::create_dir_all(&backup_dir)
        .with_context(|| format!("Could not create backup directory {}", backup_dir.display()))?;
    let backup_path = backup_dir.join(format!(
        "music-library-{}-before-{operation}.sqlite3",
        Utc::now().format("%Y%m%d-%H%M%S")
    ));

    fs::copy(db_path, &backup_path).with_context(|| {
        format!(
            "Could not create database backup from {} to {}",
            db_path.display(),
            backup_path.display()
        )
    })?;

    Ok(Some(backup_path))
}

fn remove_sqlite_sidecars(db_path: &Path) -> Result<()> {
    for suffix in ["-wal", "-shm"] {
        let sidecar = sqlite_sidecar_path(db_path, suffix);
        if sidecar.exists() {
            fs::remove_file(&sidecar).with_context(|| {
                format!("Could not remove SQLite sidecar {}", sidecar.display())
            })?;
        }
    }
    Ok(())
}

fn sqlite_sidecar_path(db_path: &Path, suffix: &str) -> PathBuf {
    let mut path = db_path.as_os_str().to_os_string();
    path.push(suffix);
    PathBuf::from(path)
}
