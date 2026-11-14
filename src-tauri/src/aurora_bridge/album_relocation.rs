//! Renames one cataloged album folder, and optionally its MP3 files, in place.
//!
//! Every path-keyed record follows the files: the catalog rows keep their ids (so
//! ratings, playlists and listening links stay attached), and listening history,
//! sonic analysis, hidden favorites and rating missions are re-keyed to the new paths.
//! A journal written before the first rename lets an interrupted relocation either
//! finish (catalog committed) or roll its files back (catalog untouched).

use super::{
    atomic_write_json, display_path, ensure_destination_available, normalized_path, open_database,
    resolve_catalog_album_folder, ResolvedAlbumFolder, BRIDGE_DIRECTORY,
};
use crate::importer::{self, CatalogPathMove};
use anyhow::{anyhow, bail, Context, Result};
use chrono::Utc;
use music_sonic_core::track_key;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

const JOURNAL_FORMAT_VERSION: u32 = 1;
const MAX_RELOCATED_FILES: usize = 500;
const MAX_NAME_CHARS: usize = 200;

/// File name, label, and `(table, has directory/filename columns)` pairs.
type SatelliteStore = (&'static str, &'static str, &'static [(&'static str, bool)]);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RelocateAlbumRequest {
    album_id: String,
    folder_name: String,
    #[serde(default)]
    files: Vec<RelocateFileRequest>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RelocateFileRequest {
    from_path: String,
    to_filename: String,
}

/// One MP3 renamed inside the album folder before the folder itself is renamed.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct JournalFile {
    old_path: String,
    staged_path: String,
    renamed_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct JournalMove {
    old_directory: String,
    old_filename: String,
    new_directory: String,
    new_filename: String,
}

/// The on-disk step that was running. Each value is journaled before its step starts
/// and only after the previous step finished, so recovery knows where every file is.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum RelocationPhase {
    /// Files move from their old names to staging names; none has its new name yet.
    Staging,
    /// Every file was staged and staging names now become the new names.
    Placing,
    /// Every file has its new name and the folder is being renamed.
    Folder,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RelocationJournal {
    phase: RelocationPhase,
    format_version: u32,
    album_id: String,
    source_folder: String,
    destination_folder: String,
    files: Vec<JournalFile>,
    moves: Vec<JournalMove>,
    created_at: String,
}

impl From<&JournalMove> for CatalogPathMove {
    fn from(item: &JournalMove) -> Self {
        Self {
            old_directory: item.old_directory.clone(),
            old_filename: item.old_filename.clone(),
            new_directory: item.new_directory.clone(),
            new_filename: item.new_filename.clone(),
        }
    }
}

fn journal_directory(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(BRIDGE_DIRECTORY).join("relocations")
}

/// Validates one folder or file name component the same way Windows would accept it.
pub(super) fn validate_name_component(value: &str, label: &str) -> Result<()> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed != value {
        bail!("The new {label} must not be empty or start or end with spaces");
    }
    if value.chars().count() > MAX_NAME_CHARS {
        bail!("The new {label} is longer than {MAX_NAME_CHARS} characters");
    }
    if value == "." || value == ".." || value.ends_with('.') {
        bail!("The new {label} must not end with a period");
    }
    if value.chars().any(|c| {
        c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
    }) {
        bail!("The new {label} contains a character Windows does not allow: {value}");
    }
    let stem = value
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.len() == 4
            && stem.as_bytes()[3].is_ascii_digit());
    if reserved {
        bail!("The new {label} uses a reserved Windows device name: {value}");
    }
    Ok(())
}

fn is_mp3_name(name: &str) -> bool {
    Path::new(name)
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("mp3"))
}

/// Splits a path on both separators. Catalog paths are Windows paths on every platform, and
/// `Path` treats `\` as an ordinary character on macOS and Linux, so this splits by hand.
fn path_parts(path: &str) -> Vec<&str> {
    path.split(['\\', '/'])
        .filter(|part| !part.is_empty())
        .collect()
}

/// The catalog directory of a track with its album folder component replaced. Every
/// other component keeps the catalog's own spelling, such as its drive-letter case, and
/// disc folders below the album folder are kept.
fn relocated_directory(directory: &str, source: &Path, folder_name: &str) -> Result<String> {
    let source_text = display_path(source);
    let source_parts = path_parts(&source_text);
    let parts = path_parts(directory);
    let depth = source_parts.len();
    if depth == 0
        || parts.len() < depth
        || !parts
            .iter()
            .zip(&source_parts)
            .all(|(part, source_part)| part.to_lowercase() == source_part.to_lowercase())
    {
        bail!("Catalog folder {directory} is outside the album folder");
    }
    if parts[depth..]
        .iter()
        .any(|part| matches!(*part, "." | ".."))
    {
        bail!("Catalog folder {directory} contains an unsafe component");
    }
    let separator = if directory.contains('\\') { "\\" } else { "/" };
    let prefix_len = directory.len() - directory.trim_start_matches(['\\', '/']).len();
    let mut relocated = parts[..depth - 1].to_vec();
    relocated.push(folder_name);
    relocated.extend_from_slice(&parts[depth..]);
    Ok(format!(
        "{}{}",
        &directory[..prefix_len],
        relocated.join(separator)
    ))
}

fn catalog_album_rows(conn: &Connection, album_id: &str) -> Result<Vec<(String, String)>> {
    conn.prepare(
        "SELECT COALESCE(file_path, ''), COALESCE(filename, '')
         FROM tracks WHERE album_id = ?1 ORDER BY file_path, filename",
    )?
    .query_map([album_id], |row| Ok((row.get(0)?, row.get(1)?)))?
    .collect::<rusqlite::Result<Vec<_>>>()
    .map_err(Into::into)
}

/// Builds the journal for one validated request without touching any file.
fn plan_relocation(
    conn: &Connection,
    request: &RelocateAlbumRequest,
    resolved: &ResolvedAlbumFolder,
) -> Result<RelocationJournal> {
    let album_id = request.album_id.trim();
    validate_name_component(&request.folder_name, "album folder name")?;
    if request.files.len() > MAX_RELOCATED_FILES {
        bail!("Rename at most {MAX_RELOCATED_FILES} album files at once");
    }
    let source = &resolved.folder;
    let parent = source
        .parent()
        .ok_or_else(|| anyhow!("The album folder has no parent folder"))?;
    if !resolved
        .library_roots
        .iter()
        .any(|root| normalized_path(root) == normalized_path(parent))
    {
        bail!("Only album folders directly inside a Music Library root can be renamed");
    }
    let destination = parent.join(&request.folder_name);
    let folder_changes = display_path(&destination) != display_path(source);
    let case_only = folder_changes && normalized_path(&destination) == normalized_path(source);
    if folder_changes && !case_only {
        ensure_destination_available(parent, &destination)?;
    }

    let rows = catalog_album_rows(conn, album_id)?;
    let row_keys = rows
        .iter()
        .map(|(directory, filename)| track_key(directory, filename))
        .collect::<HashSet<_>>();
    if row_keys.len() != rows.len() {
        bail!("The album lists one file more than once in the catalog");
    }
    // Requested file renames, keyed by the file's current catalog path.
    let mut renames = HashMap::with_capacity(request.files.len());
    for file in &request.files {
        validate_name_component(&file.to_filename, "track file name")?;
        if !is_mp3_name(&file.to_filename) {
            bail!(
                "A renamed track must keep the .mp3 extension: {}",
                file.to_filename
            );
        }
        let from = Path::new(file.from_path.trim());
        let parent = from
            .parent()
            .ok_or_else(|| anyhow!("A renamed track has no folder: {}", file.from_path))?;
        let filename = from
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| anyhow!("A renamed track has no file name: {}", file.from_path))?;
        let key = track_key(&parent.display().to_string(), filename);
        if !row_keys.contains(&key) {
            bail!("{} is not a cataloged track of this album", file.from_path);
        }
        if renames.insert(key, file.to_filename.clone()).is_some() {
            bail!("The relocation renames {} more than once", file.from_path);
        }
    }

    let mut moves = Vec::with_capacity(rows.len());
    let mut files = Vec::new();
    let mut final_names = HashSet::with_capacity(rows.len());
    let mut renamed_by_directory: HashMap<String, Vec<(String, String)>> = HashMap::new();
    let token = format!("{}-{}", std::process::id(), Utc::now().timestamp_millis());
    for (index, (directory, filename)) in rows.iter().enumerate() {
        let key = track_key(directory, filename);
        let new_filename = renames
            .get(&key)
            .cloned()
            .unwrap_or_else(|| filename.clone());
        let new_directory = relocated_directory(directory, source, &request.folder_name)?;
        if !final_names.insert(track_key(&new_directory, &new_filename)) {
            bail!("Two album tracks would both be named {new_filename}");
        }
        if new_filename != *filename {
            let old_path = Path::new(directory).join(filename);
            if !old_path.is_file() {
                bail!(
                    "{} is missing; sync the album before renaming it",
                    old_path.display()
                );
            }
            files.push(JournalFile {
                old_path: old_path.display().to_string(),
                staged_path: Path::new(directory)
                    .join(format!(".music-library-relocate-{token}-{index}.tmp"))
                    .display()
                    .to_string(),
                renamed_path: Path::new(directory)
                    .join(&new_filename)
                    .display()
                    .to_string(),
            });
            renamed_by_directory
                .entry(normalized_path(Path::new(directory)))
                .or_default()
                .push((filename.to_lowercase(), new_filename.to_lowercase()));
        }
        moves.push(JournalMove {
            old_directory: directory.clone(),
            old_filename: filename.clone(),
            new_directory,
            new_filename,
        });
    }
    // A renamed track must not overwrite a file that is not part of this album.
    for file in &files {
        let target = Path::new(&file.renamed_path);
        let directory = target.parent().map(normalized_path).unwrap_or_default();
        let target_name = target
            .file_name()
            .map(|name| name.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let freed = renamed_by_directory
            .get(&directory)
            .is_some_and(|names| names.iter().any(|(old, _)| *old == target_name));
        if target.exists() && !freed {
            bail!("{} already exists in the album folder", target.display());
        }
    }
    if !folder_changes && files.is_empty() {
        return Ok(RelocationJournal {
            format_version: JOURNAL_FORMAT_VERSION,
            phase: RelocationPhase::Staging,
            album_id: album_id.to_owned(),
            source_folder: display_path(source),
            destination_folder: display_path(source),
            files,
            moves: Vec::new(),
            created_at: Utc::now().to_rfc3339(),
        });
    }
    Ok(RelocationJournal {
        format_version: JOURNAL_FORMAT_VERSION,
        phase: RelocationPhase::Staging,
        album_id: album_id.to_owned(),
        source_folder: display_path(source),
        destination_folder: display_path(&destination),
        files,
        moves,
        created_at: Utc::now().to_rfc3339(),
    })
}

fn journal_path(app_data_dir: &Path, journal: &RelocationJournal) -> PathBuf {
    let digest = track_key(&journal.album_id, &journal.created_at)
        .bytes()
        .fold(0xcbf29ce484222325_u64, |hash, byte| {
            (hash ^ u64::from(byte)).wrapping_mul(0x100000001b3)
        });
    journal_directory(app_data_dir).join(format!("relocation-{digest:016x}.json"))
}

/// Renames the files and the folder, journaling each phase before it starts. Undoes
/// every completed step on failure.
fn rename_on_disk(journal: &mut RelocationJournal, journal_file: Option<&Path>) -> Result<()> {
    let enter = |journal: &mut RelocationJournal, phase| -> Result<()> {
        journal.phase = phase;
        match journal_file {
            Some(path) => atomic_write_json(path, journal),
            None => Ok(()),
        }
    };
    enter(journal, RelocationPhase::Staging)?;
    for (index, file) in journal.files.iter().enumerate() {
        if let Err(error) = fs::rename(&file.old_path, &file.staged_path) {
            rollback_files(&journal.files[..index], 0);
            return Err(error)
                .with_context(|| format!("Could not prepare {} for renaming", file.old_path));
        }
    }
    if let Err(error) = enter(journal, RelocationPhase::Placing) {
        rollback_files(&journal.files, 0);
        return Err(error);
    }
    for (index, file) in journal.files.iter().enumerate() {
        if let Err(error) = fs::rename(&file.staged_path, &file.renamed_path) {
            rollback_files(&journal.files, index);
            return Err(error).with_context(|| format!("Could not rename {}", file.old_path));
        }
    }
    if let Err(error) = enter(journal, RelocationPhase::Folder) {
        rollback_files(&journal.files, journal.files.len());
        return Err(error);
    }
    if journal.source_folder != journal.destination_folder {
        if let Err(error) = fs::rename(&journal.source_folder, &journal.destination_folder) {
            rollback_files(&journal.files, journal.files.len());
            return Err(error).with_context(|| {
                format!(
                    "Could not rename the album folder; close any program that is using {}",
                    journal.source_folder
                )
            });
        }
    }
    Ok(())
}

/// Moves renamed files back. `placed` files reached their new name; the rest are staged.
fn rollback_files(files: &[JournalFile], placed: usize) {
    for file in files[..placed].iter().rev() {
        let _ = fs::rename(&file.renamed_path, &file.staged_path);
    }
    for file in files.iter().rev() {
        if Path::new(&file.staged_path).exists() {
            let _ = fs::rename(&file.staged_path, &file.old_path);
        }
    }
}

/// Restores an interrupted relocation whose catalog change never committed.
fn restore_files(journal: &RelocationJournal) -> Result<()> {
    let source = Path::new(&journal.source_folder);
    let destination = Path::new(&journal.destination_folder);
    if journal.source_folder != journal.destination_folder {
        let case_only = normalized_path(source) == normalized_path(destination);
        if destination.is_dir() && (case_only || !source.exists()) {
            fs::rename(destination, source).with_context(|| {
                format!(
                    "Could not move {} back to {}",
                    destination.display(),
                    source.display()
                )
            })?;
        }
    }
    // A file without a staging copy still has its old name while staging, and already
    // has its new name afterwards. New names are staged first because two album files
    // may have swapped names.
    for file in &journal.files {
        let staged = Path::new(&file.staged_path);
        if staged.exists() || journal.phase == RelocationPhase::Staging {
            continue;
        }
        fs::rename(&file.renamed_path, staged).with_context(|| {
            format!(
                "{} is missing after an interrupted album rename",
                file.renamed_path
            )
        })?;
    }
    for file in journal.files.iter().rev() {
        let staged = Path::new(&file.staged_path);
        if staged.exists() {
            fs::rename(staged, &file.old_path)?;
        } else if !Path::new(&file.old_path).exists() {
            bail!(
                "{} is missing after an interrupted album rename",
                file.old_path
            );
        }
    }
    Ok(())
}

fn table_exists(conn: &Connection, schema: &str, table: &str) -> Result<bool> {
    conn.query_row(
        &format!(
            "SELECT EXISTS(SELECT 1 FROM {schema}.sqlite_master WHERE type='table' AND name=?1)"
        ),
        [table],
        |row| row.get(0),
    )
    .map_err(Into::into)
}

fn listening_path_key(directory: &str, filename: &str) -> String {
    format!(
        "{}/{}",
        directory
            .trim()
            .replace('\\', "/")
            .trim_end_matches('/')
            .to_lowercase(),
        filename.trim().to_lowercase()
    )
}

/// Rewrites saved playlist entries that point at the moved files.
fn relocate_saved_playlists(conn: &Connection, moves: &[JournalMove]) -> Result<usize> {
    if !table_exists(conn, "main", "saved_playlists")? {
        return Ok(0);
    }
    let by_key = moves
        .iter()
        .map(|item| (track_key(&item.old_directory, &item.old_filename), item))
        .collect::<HashMap<_, _>>();
    let playlists = conn
        .prepare("SELECT id, playlist_json FROM saved_playlists")?
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut changed = 0;
    for (id, payload) in playlists {
        let Ok(mut value) = serde_json::from_str::<Value>(&payload) else {
            continue;
        };
        let mut touched = false;
        if let Some(tracks) = value.get_mut("tracks").and_then(Value::as_array_mut) {
            for track in tracks {
                let (Some(directory), Some(filename)) = (
                    track.get("filePath").and_then(Value::as_str),
                    track.get("filename").and_then(Value::as_str),
                ) else {
                    continue;
                };
                if let Some(item) = by_key.get(&track_key(directory, filename)) {
                    track["filePath"] = json!(item.new_directory);
                    track["filename"] = json!(item.new_filename);
                    touched = true;
                }
            }
        }
        if touched {
            conn.execute(
                "UPDATE saved_playlists SET playlist_json = ?1 WHERE id = ?2",
                params![serde_json::to_string(&value)?, id],
            )?;
            changed += 1;
        }
    }
    Ok(changed)
}

/// Commits the catalog half of a relocation in one transaction.
fn commit_catalog(conn: &mut Connection, journal: &RelocationJournal) -> Result<i64> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .context("Could not start the album relocation")?;
    let moves = journal
        .moves
        .iter()
        .map(CatalogPathMove::from)
        .collect::<Vec<_>>();
    let (import_run_id, _) = importer::relocate_album_catalog_paths(
        &tx,
        &journal.album_id,
        &journal.destination_folder,
        &moves,
    )?;
    // Music Doctor rebuilds file quality from disk; drop the rows for the old paths.
    for item in &journal.moves {
        tx.execute(
            "DELETE FROM music_doctor_track_quality WHERE file_path = ?1 AND filename = ?2",
            params![item.old_directory, item.old_filename],
        )?;
    }
    tx.execute(
        "DELETE FROM music_doctor_album_quality WHERE album_id = ?1",
        [&journal.album_id],
    )?;
    let source_prefix = format!("{}\\", normalized_path(Path::new(&journal.source_folder)));
    let cover: Option<String> = tx
        .query_row(
            "SELECT source_path FROM album_covers WHERE album_id = ?1",
            [&journal.album_id],
            |row| row.get(0),
        )
        .optional()?
        .flatten();
    if let Some(cover) = cover {
        let normalized = normalized_path(Path::new(&cover));
        if let Some(rest) = normalized.strip_prefix(&source_prefix) {
            let relative = &cover[cover.len() - rest.len()..];
            let relocated = Path::new(&journal.destination_folder).join(relative);
            tx.execute(
                "UPDATE album_covers SET source_path = ?1 WHERE album_id = ?2",
                params![relocated.display().to_string(), journal.album_id],
            )?;
        }
    }
    if table_exists(&tx, "main", "listening_plays")? {
        for item in &journal.moves {
            let old = listening_path_key(&item.old_directory, &item.old_filename);
            let new = listening_path_key(&item.new_directory, &item.new_filename);
            if old == new {
                continue;
            }
            tx.execute(
                "UPDATE OR IGNORE listening_plays SET path_key = ?2 WHERE path_key = ?1",
                params![old, new],
            )?;
            if table_exists(&tx, "main", "listening_identity_links")? {
                tx.execute(
                    "UPDATE OR REPLACE listening_identity_links SET path_key = ?2 WHERE path_key = ?1",
                    params![old, new],
                )?;
            }
        }
    }
    relocate_saved_playlists(&tx, &journal.moves)?;
    tx.commit()
        .context("Could not commit the album relocation")?;
    Ok(import_run_id)
}

fn catalog_committed(conn: &Connection, journal: &RelocationJournal) -> Result<bool> {
    let Some(first) = journal.moves.first() else {
        return Ok(true);
    };
    let found: i64 = conn.query_row(
        "SELECT COUNT(*) FROM tracks WHERE album_id = ?1 AND file_path = ?2 AND filename = ?3",
        params![journal.album_id, first.new_directory, first.new_filename],
        |row| row.get(0),
    )?;
    Ok(found > 0)
}

/// Re-keys derived and personal stores outside the catalog. Each store is updated in
/// its own transaction; a failure is reported as a warning because the catalog and the
/// files already agree, and analysis can be recomputed.
fn relocate_satellite_stores(app_data_dir: &Path, moves: &[JournalMove]) -> Vec<String> {
    let rekeys = moves
        .iter()
        .map(|item| {
            (
                track_key(&item.old_directory, &item.old_filename),
                track_key(&item.new_directory, &item.new_filename),
                item,
            )
        })
        .filter(|(old, new, _)| old != new)
        .collect::<Vec<_>>();
    if rekeys.is_empty() {
        return Vec::new();
    }
    let stores: [SatelliteStore; 3] = [
        (
            "music-analysis.sqlite3",
            "sonic analysis",
            &[
                ("sonic_tracks", true),
                ("sonic_failures", true),
                ("sonic_items", true),
            ],
        ),
        (
            "hidden-favorites.sqlite3",
            "hidden favorites",
            &[
                ("kept", false),
                ("dismissed", false),
                ("shelf_audio", false),
            ],
        ),
        (
            "rating-missions.sqlite3",
            "rating missions",
            &[("audio", false)],
        ),
    ];
    let mut warnings = Vec::new();
    for (file, label, tables) in stores {
        let path = app_data_dir.join(file);
        if !path.is_file() {
            continue;
        }
        let result = (|| -> Result<()> {
            let mut conn = Connection::open(&path)?;
            conn.busy_timeout(std::time::Duration::from_secs(10))?;
            let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
            for (table, has_path_columns) in tables {
                if !table_exists(&tx, "main", table)? {
                    continue;
                }
                for (old, new, item) in &rekeys {
                    if *has_path_columns {
                        tx.execute(
                            &format!(
                                "UPDATE OR REPLACE {table} SET track_key = ?2, directory = ?3, filename = ?4 WHERE track_key = ?1"
                            ),
                            params![old, new, item.new_directory, item.new_filename],
                        )?;
                    } else {
                        tx.execute(
                            &format!(
                                "UPDATE OR REPLACE {table} SET track_key = ?2 WHERE track_key = ?1"
                            ),
                            params![old, new],
                        )?;
                    }
                }
            }
            tx.commit()?;
            Ok(())
        })();
        if let Err(error) = result {
            warnings.push(format!(
                "The album was renamed, but Music Library could not move its {label}: {error:#}"
            ));
        }
    }
    warnings
}

fn remove_journal(path: &Path) {
    let _ = fs::remove_file(path);
}

/// Finishes or rolls back relocations that a crash or power loss interrupted.
pub(super) fn recover_interrupted_relocations(
    app_data_dir: &Path,
    conn: &Connection,
) -> Result<()> {
    let directory = journal_directory(app_data_dir);
    let Ok(entries) = fs::read_dir(&directory) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let journal: RelocationJournal = serde_json::from_slice(&fs::read(&path)?)
            .with_context(|| format!("Could not read album rename journal {}", path.display()))?;
        if catalog_committed(conn, &journal)? {
            for warning in relocate_satellite_stores(app_data_dir, &journal.moves) {
                eprintln!("{warning}");
            }
        } else {
            restore_files(&journal).with_context(|| {
                format!(
                    "An interrupted album rename needs attention; its journal is {}",
                    path.display()
                )
            })?;
        }
        remove_journal(&path);
    }
    Ok(())
}

pub(super) fn relocate_album(app_data_dir: &Path, request: RelocateAlbumRequest) -> Result<Value> {
    let album_id = request.album_id.trim();
    if album_id.is_empty() || album_id.chars().count() > 512 {
        bail!("Choose one library album to rename");
    }
    let database_path = app_data_dir.join("music-library.sqlite3");
    let mut conn = open_database(&database_path)?;
    recover_interrupted_relocations(app_data_dir, &conn)?;
    let resolved = resolve_catalog_album_folder(&conn, album_id)?;
    let journal = plan_relocation(&conn, &request, &resolved)?;
    if journal.moves.is_empty() {
        return Ok(json!({
            "albumId": album_id,
            "sourcePath": journal.source_folder,
            "destinationPath": journal.destination_folder,
            "folderRenamed": false,
            "renamedFiles": 0,
            "files": [],
            "importRunId": null,
            "warnings": [],
        }));
    }
    let mut journal = journal;
    let journal_file = journal_path(app_data_dir, &journal);
    if let Err(error) = rename_on_disk(&mut journal, Some(&journal_file)) {
        remove_journal(&journal_file);
        return Err(error);
    }
    let import_run_id = match commit_catalog(&mut conn, &journal) {
        Ok(id) => id,
        Err(error) => {
            return match restore_files(&journal) {
                Ok(()) => {
                    remove_journal(&journal_file);
                    Err(error.context("Music Library restored the album's original names"))
                }
                Err(restore_error) => Err(anyhow!(
                    "Music Library could not record the album rename ({error:#}) and could not undo it ({restore_error:#}). It retries from {} on its next Aurora request.",
                    journal_file.display()
                )),
            };
        }
    };
    let warnings = relocate_satellite_stores(app_data_dir, &journal.moves);
    remove_journal(&journal_file);
    let files = journal
        .moves
        .iter()
        .map(|item| {
            json!({
                "fromPath": Path::new(&item.old_directory).join(&item.old_filename).display().to_string(),
                "toPath": Path::new(&item.new_directory).join(&item.new_filename).display().to_string(),
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "albumId": album_id,
        "sourcePath": journal.source_folder,
        "destinationPath": journal.destination_folder,
        "folderRenamed": journal.source_folder != journal.destination_folder,
        "renamedFiles": journal.files.len(),
        "files": files,
        "importRunId": import_run_id,
        "warnings": warnings,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_names_windows_cannot_store() {
        for name in [
            "", " Album", "Album ", "Album.", "AC/DC", "What?", "CON", "com1.mp3", "a:b",
        ] {
            assert!(
                validate_name_component(name, "name").is_err(),
                "{name:?} must be rejected"
            );
        }
        for name in [
            "Artist - Album (1976)",
            "01 - Artist - Title.mp3",
            "Console",
        ] {
            assert!(
                validate_name_component(name, "name").is_ok(),
                "{name:?} must be accepted"
            );
        }
    }

    #[test]
    fn relocated_directory_keeps_catalog_spelling_and_disc_folders() {
        let source = Path::new(r"D:\MUSIC\Artist - Album (1978)");
        assert_eq!(
            relocated_directory(
                r"d:\MUSIC\artist - album (1978)",
                source,
                "Artist - Album (1976)"
            )
            .unwrap(),
            r"d:\MUSIC\Artist - Album (1976)"
        );
        assert_eq!(
            relocated_directory(
                r"D:\MUSIC\Artist - Album (1978)\CD2",
                source,
                "Artist - Album (1976)"
            )
            .unwrap(),
            r"D:\MUSIC\Artist - Album (1976)\CD2"
        );
        assert!(relocated_directory(r"D:\MUSIC\Other", source, "New").is_err());
        assert!(relocated_directory(r"D:\MUSIC\Artist - Album (1978)\..", source, "New").is_err());
        assert_eq!(
            relocated_directory(
                r"\\nas\music\Artist - Album (1978)",
                Path::new(r"\\NAS\Music\Artist - Album (1978)"),
                "Artist - Album (1976)"
            )
            .unwrap(),
            r"\\nas\music\Artist - Album (1976)"
        );
    }

    #[test]
    fn listening_keys_match_the_listening_history_format() {
        assert_eq!(
            listening_path_key(r"D:\Music\Album\", "01 - Song.MP3"),
            "d:/music/album/01 - song.mp3"
        );
    }

    fn journal_in(root: &Path) -> RelocationJournal {
        let source = root.join("Old Album");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("1.mp3"), b"one").unwrap();
        fs::write(source.join("2.mp3"), b"two").unwrap();
        let destination = root.join("New Album");
        let file = |index: usize, old: &str, new: &str| JournalFile {
            old_path: source.join(old).display().to_string(),
            staged_path: source
                .join(format!(".stage-{index}.tmp"))
                .display()
                .to_string(),
            renamed_path: source.join(new).display().to_string(),
        };
        RelocationJournal {
            format_version: JOURNAL_FORMAT_VERSION,
            phase: RelocationPhase::Staging,
            album_id: "mb:test".into(),
            source_folder: source.display().to_string(),
            destination_folder: destination.display().to_string(),
            // A swap: each file takes the other's name, which needs the staging step.
            files: vec![file(0, "1.mp3", "2.mp3"), file(1, "2.mp3", "1.mp3")],
            moves: Vec::new(),
            created_at: Utc::now().to_rfc3339(),
        }
    }

    #[test]
    fn renames_swapped_files_and_restores_them_after_an_interruption() {
        let temp = tempfile::tempdir().unwrap();
        let mut journal = journal_in(temp.path());
        let journal_file = temp.path().join("journal.json");
        rename_on_disk(&mut journal, Some(&journal_file)).unwrap();
        let saved: RelocationJournal =
            serde_json::from_slice(&fs::read(&journal_file).unwrap()).unwrap();
        assert_eq!(saved.phase, RelocationPhase::Folder);
        let destination = Path::new(&journal.destination_folder);
        assert!(!Path::new(&journal.source_folder).exists());
        assert_eq!(fs::read(destination.join("1.mp3")).unwrap(), b"two");
        assert_eq!(fs::read(destination.join("2.mp3")).unwrap(), b"one");

        restore_files(&journal).unwrap();
        let source = Path::new(&journal.source_folder);
        assert!(!destination.exists());
        assert_eq!(fs::read(source.join("1.mp3")).unwrap(), b"one");
        assert_eq!(fs::read(source.join("2.mp3")).unwrap(), b"two");
    }

    #[test]
    fn a_folder_rename_failure_puts_every_file_back() {
        let temp = tempfile::tempdir().unwrap();
        let mut journal = journal_in(temp.path());
        // A destination inside a missing parent makes the folder rename fail.
        journal.destination_folder = temp
            .path()
            .join("missing")
            .join("New")
            .display()
            .to_string();
        assert!(rename_on_disk(&mut journal, None).is_err());
        let source = Path::new(&journal.source_folder);
        assert_eq!(fs::read(source.join("1.mp3")).unwrap(), b"one");
        assert_eq!(fs::read(source.join("2.mp3")).unwrap(), b"two");
        assert_eq!(
            fs::read_dir(source).unwrap().count(),
            2,
            "no staged files remain"
        );
    }

    #[test]
    fn recovery_finishes_a_rollback_interrupted_while_placing_swapped_names() {
        let temp = tempfile::tempdir().unwrap();
        let mut journal = journal_in(temp.path());
        // Simulate a crash after staging both files and placing only the first.
        fs::rename(&journal.files[0].old_path, &journal.files[0].staged_path).unwrap();
        fs::rename(&journal.files[1].old_path, &journal.files[1].staged_path).unwrap();
        fs::rename(
            &journal.files[0].staged_path,
            &journal.files[0].renamed_path,
        )
        .unwrap();
        journal.phase = RelocationPhase::Placing;
        restore_files(&journal).unwrap();
        let source = Path::new(&journal.source_folder);
        assert_eq!(fs::read(source.join("1.mp3")).unwrap(), b"one");
        assert_eq!(fs::read(source.join("2.mp3")).unwrap(), b"two");
        assert_eq!(fs::read_dir(source).unwrap().count(), 2);
    }

    #[test]
    fn playlists_follow_relocated_tracks() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE saved_playlists(id INTEGER PRIMARY KEY, playlist_json TEXT NOT NULL);",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO saved_playlists(id, playlist_json) VALUES (1, ?1), (2, ?2)",
            params![
                json!({"tracks":[{"id":7,"filePath":r"D:\Music\Old","filename":"1.mp3"}]})
                    .to_string(),
                json!({"tracks":[{"id":8,"filePath":r"D:\Music\Other","filename":"1.mp3"}]})
                    .to_string(),
            ],
        )
        .unwrap();
        let moves = vec![JournalMove {
            old_directory: r"d:\music\old".into(),
            old_filename: "1.MP3".into(),
            new_directory: r"D:\Music\New".into(),
            new_filename: "01 - Song.mp3".into(),
        }];
        assert_eq!(relocate_saved_playlists(&conn, &moves).unwrap(), 1);
        let moved: String = conn
            .query_row(
                "SELECT playlist_json FROM saved_playlists WHERE id=1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let moved: Value = serde_json::from_str(&moved).unwrap();
        assert_eq!(moved["tracks"][0]["filePath"], r"D:\Music\New");
        assert_eq!(moved["tracks"][0]["filename"], "01 - Song.mp3");
        assert_eq!(moved["tracks"][0]["id"], 7);
    }

    #[test]
    fn satellite_stores_follow_relocated_tracks() {
        let temp = tempfile::tempdir().unwrap();
        let analysis = Connection::open(temp.path().join("music-analysis.sqlite3")).unwrap();
        analysis.execute_batch("CREATE TABLE sonic_tracks(track_key TEXT PRIMARY KEY,directory TEXT NOT NULL,filename TEXT NOT NULL,audio_hash TEXT NOT NULL);").unwrap();
        analysis
            .execute(
                "INSERT INTO sonic_tracks VALUES(?1,?2,?3,'hash')",
                params![
                    track_key(r"D:\Music\Old", "1.mp3"),
                    r"D:\Music\Old",
                    "1.mp3"
                ],
            )
            .unwrap();
        drop(analysis);
        let favorites = Connection::open(temp.path().join("hidden-favorites.sqlite3")).unwrap();
        favorites.execute_batch("CREATE TABLE kept(track_key TEXT PRIMARY KEY,payload TEXT NOT NULL,saved_at TEXT NOT NULL);").unwrap();
        favorites
            .execute(
                "INSERT INTO kept VALUES(?1,'{}','now')",
                [track_key(r"D:\Music\Old", "1.mp3")],
            )
            .unwrap();
        drop(favorites);
        let moves = vec![JournalMove {
            old_directory: r"D:\Music\Old".into(),
            old_filename: "1.mp3".into(),
            new_directory: r"D:\Music\New".into(),
            new_filename: "01 - Song.mp3".into(),
        }];
        assert!(relocate_satellite_stores(temp.path(), &moves).is_empty());
        let new_key = track_key(r"D:\Music\New", "01 - Song.mp3");
        let analysis = Connection::open(temp.path().join("music-analysis.sqlite3")).unwrap();
        let row: (String, String, String) = analysis
            .query_row(
                "SELECT track_key,directory,filename FROM sonic_tracks",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(
            row,
            (
                new_key.clone(),
                r"D:\Music\New".into(),
                "01 - Song.mp3".into()
            )
        );
        let favorites = Connection::open(temp.path().join("hidden-favorites.sqlite3")).unwrap();
        let kept: String = favorites
            .query_row("SELECT track_key FROM kept", [], |r| r.get(0))
            .unwrap();
        assert_eq!(kept, new_key);
    }
}
