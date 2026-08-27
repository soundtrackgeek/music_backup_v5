use crate::folder_sync::{self, BatchAlbumInput};
use crate::{covers, db, importer};
use anyhow::{anyhow, bail, Context, Result};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const PROTOCOL_VERSION: u32 = 1;
const PLAN_FORMAT_VERSION: u32 = 1;
const BRIDGE_DIRECTORY: &str = "aurora-bridge";
const APP_DATA_OVERRIDE: &str = "MUSIC_LIBRARY_BRIDGE_APP_DATA_DIR";
const GENERAL_ROOT_OVERRIDE: &str = "MUSIC_LIBRARY_BRIDGE_GENERAL_ROOT";
const SCORES_ROOT_OVERRIDE: &str = "MUSIC_LIBRARY_BRIDGE_SCORES_ROOT";
const SYNTHWAVE_ROOT_OVERRIDE: &str = "MUSIC_LIBRARY_BRIDGE_SYNTHWAVE_ROOT";
const MAX_TRANSFER_ENTRIES: usize = 50_000;
const MAX_SYNC_FOLDERS: usize = 32;
const MAX_SYNC_TRACKS: usize = 50_000;
const SYNC_SNAPSHOT_PREFIX: &str = "album-folder-aurora-sync-";
const DEPRECATED_SYNC_BACKUP_PREFIX: &str = "music-library-aurora-sync-";
const DEPRECATED_SYNC_BACKUP_SUFFIX: &str = "-before-import.sqlite3";
const STAGING_OWNER_FILE: &str = ".aurora-intake-owner.json";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeRequest {
    protocol_version: u32,
    operation: String,
    #[serde(default)]
    payload: Value,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PreviewBatchRequest {
    source_path: String,
    category: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApplyBatchRequest {
    plan_id: String,
    session_id: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncExistingFoldersRequest {
    folder_paths: Vec<String>,
    #[serde(default)]
    changed_file_paths: Vec<String>,
}

#[derive(Clone, Debug)]
struct ExistingFolderScope {
    folder: PathBuf,
    album_id: String,
    track_count: usize,
}

#[derive(Clone, Copy, Debug)]
struct SyncDeltaCounts {
    added_tracks: i64,
    changed_tracks: i64,
    removed_tracks: i64,
    added_albums: i64,
    changed_albums: i64,
    removed_albums: i64,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
enum SyncedFolderStatus {
    Updated,
    Unchanged,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncedFolderReceipt {
    folder_path: String,
    status: SyncedFolderStatus,
    changed_tracks: i64,
    changed_albums: i64,
    import_run_id: Option<i64>,
    backup_path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncExistingFoldersResult {
    synced_folder_count: usize,
    updated_folder_count: usize,
    changed_tracks: i64,
    changed_albums: i64,
    import_run_ids: Vec<i64>,
    backup_paths: Vec<String>,
    folders: Vec<SyncedFolderReceipt>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CategoryCapability {
    id: String,
    label: String,
    destination_root: String,
    available: bool,
}

#[derive(Clone, Debug)]
struct CategoryDefinition {
    id: &'static str,
    label: &'static str,
    root: PathBuf,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredPlan {
    format_version: u32,
    plan_id: String,
    session_id: i64,
    source_path: String,
    category: String,
    category_label: String,
    destination_root: String,
    snapshot_path: String,
    albums: Vec<StoredAlbum>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredAlbum {
    source_path: String,
    destination_path: String,
    artist: String,
    album: String,
    year: String,
    track_count: usize,
    inventory: FolderInventory,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderInventory {
    digest: String,
    directories: Vec<String>,
    files: Vec<InventoryFile>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct InventoryFile {
    relative_path: String,
    size_bytes: u64,
    sha256: String,
}

#[derive(Clone, Debug)]
struct PublishedAlbum {
    destination: PathBuf,
    inventory: FolderInventory,
    plan_id: String,
    index: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApplyJournal {
    format_version: u32,
    plan_id: String,
    phase: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StagingOwner {
    plan_id: String,
    album_index: usize,
}

pub(crate) fn run_from_process_args() -> bool {
    let args = std::env::args_os().collect::<Vec<_>>();
    if args.get(1).and_then(|value| value.to_str()) != Some("--aurora-bridge") {
        return false;
    }
    let Some(response_path) = args.get(3).map(PathBuf::from) else {
        eprintln!(
            "Aurora bridge usage: music-library.exe --aurora-bridge <request.json> <response.json>"
        );
        return true;
    };
    let response = match args.get(2).map(PathBuf::from) {
        Some(request_path) if args.len() == 4 => match handle_request_file(&request_path) {
            Ok(result) => json!({
                "protocolVersion": PROTOCOL_VERSION,
                "ok": true,
                "result": result,
            }),
            Err(error) => json!({
                "protocolVersion": PROTOCOL_VERSION,
                "ok": false,
                "error": {
                    "code": bridge_error_code(&error),
                    "message": format!("{error:#}"),
                },
            }),
        },
        _ => json!({
            "protocolVersion": PROTOCOL_VERSION,
            "ok": false,
            "error": {
                "code": "invalidArguments",
                "message": "Usage: music-library.exe --aurora-bridge <request.json> <response.json>",
            },
        }),
    };
    if let Err(error) = atomic_write_json(&response_path, &response) {
        eprintln!("Could not write Aurora bridge response: {error:#}");
    }
    true
}

fn handle_request_file(request_path: &Path) -> Result<Value> {
    let bytes = fs::read(request_path)
        .with_context(|| format!("Could not read bridge request {}", request_path.display()))?;
    let request: BridgeRequest = serde_json::from_slice(&bytes)
        .with_context(|| format!("Could not parse bridge request {}", request_path.display()))?;
    if request.protocol_version != PROTOCOL_VERSION {
        bail!(
            "Unsupported Aurora bridge protocol version {}; expected {}",
            request.protocol_version,
            PROTOCOL_VERSION
        );
    }
    let app_data_dir = bridge_app_data_dir()?;
    match request.operation.as_str() {
        "capabilities" => capabilities(),
        "previewBatch" => {
            let _bridge_lock = BridgeProcessLock::acquire(&app_data_dir)?;
            let payload: PreviewBatchRequest = serde_json::from_value(request.payload)
                .context("previewBatch payload must contain sourcePath and category")?;
            preview_batch(&app_data_dir, payload)
        }
        "applyBatch" => {
            let _bridge_lock = BridgeProcessLock::acquire(&app_data_dir)?;
            let payload: ApplyBatchRequest = serde_json::from_value(request.payload)
                .context("applyBatch payload must contain planId and sessionId")?;
            apply_batch(&app_data_dir, payload)
        }
        "syncExistingFolders" => {
            let _bridge_lock = BridgeProcessLock::acquire(&app_data_dir)?;
            let payload: SyncExistingFoldersRequest = serde_json::from_value(request.payload)
                .context("syncExistingFolders payload must contain folderPaths")?;
            sync_existing_folders(&app_data_dir, payload)
        }
        operation => bail!("Unknown Aurora bridge operation {operation:?}"),
    }
}

struct BridgeProcessLock {
    _file: File,
    #[cfg(not(windows))]
    path: PathBuf,
}

impl BridgeProcessLock {
    fn acquire(app_data_dir: &Path) -> Result<Self> {
        let bridge_dir = app_data_dir.join(BRIDGE_DIRECTORY);
        fs::create_dir_all(&bridge_dir)?;
        let path = bridge_dir.join("workflow.lock");
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            let file = fs::OpenOptions::new()
                .read(true)
                .write(true)
                .create(true)
                .truncate(false)
                .share_mode(0)
                .open(&path)
                .with_context(|| "Another Aurora album intake is already running")?;
            Ok(Self { _file: file })
        }
        #[cfg(not(windows))]
        {
            let file = fs::OpenOptions::new()
                .read(true)
                .write(true)
                .create_new(true)
                .open(&path)
                .with_context(|| "Another Aurora album intake is already running")?;
            Ok(Self { _file: file, path })
        }
    }
}

#[cfg(not(windows))]
impl Drop for BridgeProcessLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn capabilities() -> Result<Value> {
    let categories = category_definitions()?
        .into_iter()
        .map(|category| CategoryCapability {
            id: category.id.to_owned(),
            label: category.label.to_owned(),
            destination_root: display_path(&category.root),
            available: category.root.is_dir(),
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "bridgeVersion": PROTOCOL_VERSION,
        "categories": categories,
        "supports": {
            "singleAlbum": true,
            "batchFolders": true,
            "crossVolumeCopy": true,
            "previewRequired": true,
            "syncExistingFolders": true,
            "targetedExistingFileSync": true,
            "defaultPopmRatingFallback": true,
            "serviceExistingFolderSync": true,
        },
    }))
}

fn preview_batch(app_data_dir: &Path, request: PreviewBatchRequest) -> Result<Value> {
    let category = category_definition(&request.category)?;
    let destination_root = canonical_destination_root(&category)?;
    let source = PathBuf::from(request.source_path.trim());
    if request.source_path.trim().is_empty() {
        bail!("Choose an album folder or a parent batch folder");
    }
    let source = source
        .canonicalize()
        .with_context(|| format!("Could not resolve intake folder {}", source.display()))?;
    let database_path = app_data_dir.join("music-library.sqlite3");
    let mut conn = open_database(&database_path)?;
    cleanup_abandoned_bridge_plans(&conn, app_data_dir)?;
    let album_sources = folder_sync::discover_batch_album_sources(&source)?;
    let inputs = resolve_destination_mappings(&source, &destination_root, album_sources)?;
    let plan_id = new_plan_id(&source, category.id);
    let plan_directory = plan_directory(app_data_dir, &plan_id)?;
    fs::create_dir_all(&plan_directory).with_context(|| {
        format!(
            "Could not create Aurora bridge plan directory {}",
            plan_directory.display()
        )
    })?;
    let snapshot_path = app_data_dir
        .join("album-folder-imports")
        .join(format!("album-folder-batch-{plan_id}.tsv"));
    let snapshot = match folder_sync::build_batch_snapshot(
        &conn,
        &source,
        &inputs,
        &snapshot_path,
        &std::sync::atomic::AtomicBool::new(false),
        &mut |_, _, _| {},
    ) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            remove_snapshot_artifacts(&snapshot_path);
            let _ = fs::remove_dir_all(&plan_directory);
            return Err(error);
        }
    };
    let preview = match importer::prepare_bridge_import_preview(&mut conn, &snapshot_path) {
        Ok(preview) => preview,
        Err(error) => {
            folder_sync::cleanup_generated_snapshot(snapshot_path.to_string_lossy().as_ref());
            let _ = fs::remove_dir_all(&plan_directory);
            return Err(error);
        }
    };
    if preview.added_tracks != snapshot.track_count as i64
        || preview.changed_tracks != 0
        || preview.removed_tracks != 0
        || preview.added_albums != snapshot.albums.len() as i64
        || preview.changed_albums != 0
        || preview.removed_albums != 0
    {
        let _ = importer::discard_bridge_import_preview(&conn, preview.session_id);
        folder_sync::cleanup_generated_snapshot(snapshot_path.to_string_lossy().as_ref());
        let _ = fs::remove_dir_all(&plan_directory);
        bail!(
            "Aurora intake must be add-only, but the prepared delta was +{}/~{}/-{} tracks and +{}/~{}/-{} albums",
            preview.added_tracks,
            preview.changed_tracks,
            preview.removed_tracks,
            preview.added_albums,
            preview.changed_albums,
            preview.removed_albums
        );
    }

    let stored_albums = (|| -> Result<Vec<StoredAlbum>> {
        let mut albums = Vec::with_capacity(snapshot.albums.len());
        for metadata in &snapshot.albums {
            albums.push(StoredAlbum {
                source_path: metadata.source_path.clone(),
                destination_path: metadata.destination_path.clone(),
                artist: metadata.artist.clone(),
                album: metadata.album.clone(),
                year: metadata.year.clone(),
                track_count: metadata.track_count,
                inventory: inventory_folder(Path::new(&metadata.source_path))?,
            });
        }
        Ok(albums)
    })();
    let stored_albums = match stored_albums {
        Ok(albums) => albums,
        Err(error) => {
            let _ = importer::discard_bridge_import_preview(&conn, preview.session_id);
            folder_sync::cleanup_generated_snapshot(snapshot_path.to_string_lossy().as_ref());
            let _ = fs::remove_dir_all(&plan_directory);
            return Err(error.context("Could not fingerprint the prepared album batch"));
        }
    };
    let plan = StoredPlan {
        format_version: PLAN_FORMAT_VERSION,
        plan_id: plan_id.clone(),
        session_id: preview.session_id,
        source_path: display_path(&source),
        category: category.id.to_owned(),
        category_label: category.label.to_owned(),
        destination_root: display_path(&destination_root),
        snapshot_path: display_path(&snapshot_path),
        albums: stored_albums,
    };
    if let Err(error) = atomic_write_json(&plan_directory.join("plan.json"), &plan) {
        let _ = importer::discard_bridge_import_preview(&conn, preview.session_id);
        folder_sync::cleanup_generated_snapshot(snapshot_path.to_string_lossy().as_ref());
        let _ = fs::remove_dir_all(&plan_directory);
        return Err(error.context("Could not persist the prepared Aurora intake plan"));
    }

    Ok(json!({
        "planId": plan.plan_id,
        "sessionId": plan.session_id,
        "sourcePath": plan.source_path,
        "category": {
            "id": plan.category,
            "label": plan.category_label,
            "destinationRoot": plan.destination_root,
        },
        "albumCount": plan.albums.len(),
        "trackCount": snapshot.track_count,
        "delta": {
            "addedTracks": preview.added_tracks,
            "changedTracks": preview.changed_tracks,
            "removedTracks": preview.removed_tracks,
            "addedAlbums": preview.added_albums,
            "changedAlbums": preview.changed_albums,
            "removedAlbums": preview.removed_albums,
        },
        "albums": plan.albums.iter().map(|album| json!({
            "sourcePath": album.source_path,
            "destinationPath": album.destination_path,
            "artist": album.artist,
            "album": album.album,
            "year": album.year,
            "trackCount": album.track_count,
        })).collect::<Vec<_>>(),
        "canApply": preview.status == "ready" && !preview.source_changed,
    }))
}

fn sync_existing_folders(
    app_data_dir: &Path,
    request: SyncExistingFoldersRequest,
) -> Result<Value> {
    if request.folder_paths.is_empty() {
        bail!("syncExistingFolders requires at least one album folder");
    }
    if request.folder_paths.len() > MAX_SYNC_FOLDERS {
        bail!("syncExistingFolders accepts at most {MAX_SYNC_FOLDERS} album folders per request");
    }

    let database_path = app_data_dir.join("music-library.sqlite3");
    prune_deprecated_sync_backups(&database_path, 1)?;
    let mut conn = open_database(&database_path)?;
    cleanup_abandoned_bridge_sync_sessions(&conn, app_data_dir)?;

    let library_roots = configured_library_roots_for_paths(&request.folder_paths)?;
    let folders = canonicalize_sync_folder_paths(request.folder_paths, &library_roots)?;
    let changed_file_target =
        canonicalize_changed_file_target(request.changed_file_paths, &folders, &library_roots)?;
    let mut scopes = Vec::with_capacity(folders.len());
    let mut seen_album_ids = BTreeSet::new();
    let mut total_tracks = 0_usize;
    for (folder_index, folder) in folders.into_iter().enumerate() {
        let candidate = if let Some((target_folder_index, target_path)) = &changed_file_target {
            if *target_folder_index == folder_index {
                match importer::prepare_existing_file_fast_sync(&conn, &folder, target_path)? {
                    Some(candidate) => candidate,
                    None => importer::prepare_existing_album_fast_sync(&conn, &folder)?,
                }
            } else {
                importer::prepare_existing_album_fast_sync(&conn, &folder)?
            }
        } else {
            importer::prepare_existing_album_fast_sync(&conn, &folder)?
        };
        let scope = ExistingFolderScope {
            folder: candidate.folder().to_path_buf(),
            album_id: candidate.album_id().to_owned(),
            track_count: candidate.track_count(),
        };
        if !seen_album_ids.insert(scope.album_id.clone()) {
            bail!(
                "Two requested folders belong to the same catalog album {}",
                scope.album_id
            );
        }
        total_tracks = total_tracks.saturating_add(scope.track_count);
        if total_tracks > MAX_SYNC_TRACKS {
            bail!(
                "syncExistingFolders accepts at most {MAX_SYNC_TRACKS} cataloged MP3 tracks per request"
            );
        }
        scopes.push((scope, candidate));
    }

    let mut folders = Vec::with_capacity(scopes.len());
    for (scope, candidate) in scopes {
        let receipt =
            sync_existing_folder(&mut conn, &database_path, app_data_dir, &scope, &candidate)
                .with_context(|| format!("Could not sync {}", scope.folder.display()))?;
        folders.push(receipt);
    }

    let updated_folder_count = folders
        .iter()
        .filter(|folder| matches!(folder.status, SyncedFolderStatus::Updated))
        .count();
    let result = SyncExistingFoldersResult {
        synced_folder_count: folders.len(),
        updated_folder_count,
        changed_tracks: folders.iter().map(|folder| folder.changed_tracks).sum(),
        changed_albums: folders.iter().map(|folder| folder.changed_albums).sum(),
        import_run_ids: folders
            .iter()
            .filter_map(|folder| folder.import_run_id)
            .collect(),
        backup_paths: folders
            .iter()
            .filter_map(|folder| folder.backup_path.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect(),
        folders,
    };
    serde_json::to_value(result).context("Could not encode syncExistingFolders result")
}

fn prune_deprecated_sync_backups(database_path: &Path, keep: usize) -> Result<usize> {
    let backup_directory = database_path
        .parent()
        .ok_or_else(|| anyhow!("Music Library database path has no parent directory"))?
        .join("backups");
    if !backup_directory.try_exists()? {
        return Ok(0);
    }
    let mut backups = fs::read_dir(&backup_directory)
        .with_context(|| {
            format!(
                "Could not inspect deprecated Aurora sync backups {}",
                backup_directory.display()
            )
        })?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry.file_type().is_ok_and(|file_type| file_type.is_file())
                && entry
                    .file_name()
                    .to_str()
                    .is_some_and(is_deprecated_sync_backup_name)
        })
        .collect::<Vec<_>>();
    backups.sort_by_key(|entry| {
        std::cmp::Reverse(
            entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .ok(),
        )
    });
    let stale = backups.into_iter().skip(keep).collect::<Vec<_>>();
    for entry in &stale {
        fs::remove_file(entry.path()).with_context(|| {
            format!(
                "Could not remove deprecated Aurora sync backup {}",
                entry.path().display()
            )
        })?;
    }
    Ok(stale.len())
}

fn is_deprecated_sync_backup_name(name: &str) -> bool {
    name.strip_prefix(DEPRECATED_SYNC_BACKUP_PREFIX)
        .and_then(|value| value.strip_suffix(DEPRECATED_SYNC_BACKUP_SUFFIX))
        .is_some_and(|token| {
            token.len() == 24 && token.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
}

fn configured_library_roots_for_paths(requested_paths: &[String]) -> Result<Vec<PathBuf>> {
    let categories = category_definitions()?;
    configured_library_roots_from_categories(requested_paths, &categories)
}

fn configured_library_roots_from_categories(
    requested_paths: &[String],
    categories: &[CategoryDefinition],
) -> Result<Vec<PathBuf>> {
    let requested_volumes = requested_paths
        .iter()
        .filter_map(|path| path_volume_key(Path::new(path.trim())))
        .collect::<BTreeSet<_>>();
    let mut roots = Vec::new();
    for category in categories {
        if !requested_volumes.is_empty()
            && path_volume_key(&category.root)
                .is_some_and(|volume| !requested_volumes.contains(&volume))
        {
            continue;
        }
        if !category.root.is_absolute()
            || category
                .root
                .components()
                .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
        {
            bail!(
                "The {} library root must be an absolute canonical path: {}",
                category.label,
                category.root.display()
            );
        }
        roots.push(category.root.clone());
    }
    if roots.is_empty() {
        bail!("No configured Music Library destination matches the requested album folders");
    }
    Ok(roots)
}

fn path_volume_key(path: &Path) -> Option<String> {
    if !path.is_absolute() {
        return None;
    }

    #[cfg(windows)]
    {
        use std::path::Prefix;

        let Component::Prefix(prefix) = path.components().next()? else {
            return None;
        };
        return match prefix.kind() {
            Prefix::Disk(drive) | Prefix::VerbatimDisk(drive) => {
                Some(format!("drive:{}", char::from(drive).to_ascii_lowercase()))
            }
            Prefix::UNC(server, share) | Prefix::VerbatimUNC(server, share) => Some(format!(
                "unc:{}\\{}",
                server.to_string_lossy().to_lowercase(),
                share.to_string_lossy().to_lowercase()
            )),
            _ => None,
        };
    }

    #[cfg(not(windows))]
    path.components()
        .next()
        .map(|component| component.as_os_str().to_string_lossy().to_lowercase())
}

fn canonicalize_sync_folder_paths(
    folder_paths: Vec<String>,
    library_roots: &[PathBuf],
) -> Result<Vec<PathBuf>> {
    let mut folders: Vec<PathBuf> = Vec::with_capacity(folder_paths.len());
    let mut seen = BTreeSet::new();
    for raw_path in folder_paths {
        let raw_path = raw_path.trim();
        if raw_path.is_empty() {
            bail!("syncExistingFolders contains an empty album folder path");
        }
        let requested = PathBuf::from(raw_path);
        if !requested.is_absolute() {
            bail!(
                "syncExistingFolders requires absolute album folder paths: {}",
                requested.display()
            );
        }
        if requested
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
        {
            bail!(
                "syncExistingFolders requires canonical album folder paths without . or .. components: {}",
                requested.display()
            );
        }
        folder_sync::ensure_source_root_is_not_linked(&requested)?;
        let canonical = requested.canonicalize().with_context(|| {
            format!(
                "Could not resolve existing album folder {}",
                requested.display()
            )
        })?;
        if !fs::metadata(&canonical)?.is_dir() {
            bail!(
                "The requested existing album path is not a folder: {}",
                canonical.display()
            );
        }
        folder_sync::ensure_source_root_is_not_linked(&canonical)?;
        if normalized_path(&requested) != normalized_path(&canonical) {
            bail!(
                "Use the canonical Music Library album folder path instead of {}",
                requested.display()
            );
        }
        if !library_roots
            .iter()
            .any(|root| path_is_strictly_within(&canonical, root))
        {
            bail!(
                "The requested folder is outside every configured Music Library destination: {}",
                canonical.display()
            );
        }

        let key = normalized_path(&canonical);
        if !seen.insert(key) {
            continue;
        }
        if folders
            .iter()
            .any(|existing| paths_overlap(existing, &canonical))
        {
            bail!(
                "syncExistingFolders cannot contain nested or overlapping album folders: {}",
                canonical.display()
            );
        }
        folders.push(canonical);
    }
    if folders.is_empty() {
        bail!("syncExistingFolders contains no unique album folders");
    }
    Ok(folders)
}

fn canonicalize_changed_file_target(
    changed_file_paths: Vec<String>,
    folders: &[PathBuf],
    library_roots: &[PathBuf],
) -> Result<Option<(usize, PathBuf)>> {
    if changed_file_paths.is_empty() {
        return Ok(None);
    }
    if changed_file_paths.len() > MAX_SYNC_TRACKS {
        bail!("syncExistingFolders accepts at most {MAX_SYNC_TRACKS} changed file paths");
    }

    let mut targets = Vec::new();
    let mut seen = BTreeSet::new();
    let mut all_targets_available = true;
    for raw_path in changed_file_paths {
        let raw_path = raw_path.trim();
        if raw_path.is_empty() {
            all_targets_available = false;
            continue;
        }
        let requested = PathBuf::from(raw_path);
        if !requested.is_absolute() {
            bail!(
                "syncExistingFolders requires absolute changed MP3 paths: {}",
                requested.display()
            );
        }
        if requested
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
        {
            bail!(
                "syncExistingFolders requires canonical changed MP3 paths without . or .. components: {}",
                requested.display()
            );
        }
        if !requested
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("mp3"))
        {
            bail!(
                "syncExistingFolders changedFilePaths only accepts MP3 files: {}",
                requested.display()
            );
        }
        let containing_folders = folders
            .iter()
            .enumerate()
            .filter(|(_, folder)| path_is_strictly_within(&requested, folder))
            .map(|(index, _)| index)
            .collect::<Vec<_>>();
        if containing_folders.len() != 1
            || !library_roots
                .iter()
                .any(|root| path_is_strictly_within(&requested, root))
        {
            bail!(
                "The changed MP3 is outside the requested album folders or configured Music Library destinations: {}",
                requested.display()
            );
        }
        if !requested
            .try_exists()
            .with_context(|| format!("Could not inspect changed MP3 {}", requested.display()))?
        {
            all_targets_available = false;
            continue;
        }
        folder_sync::ensure_source_root_is_not_linked(&requested)?;
        let metadata = fs::symlink_metadata(&requested)
            .with_context(|| format!("Could not inspect changed MP3 {}", requested.display()))?;
        if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
            bail!(
                "The changed Aurora path is not a regular unlinked MP3 file: {}",
                requested.display()
            );
        }
        let canonical = requested
            .canonicalize()
            .with_context(|| format!("Could not resolve changed MP3 {}", requested.display()))?;
        folder_sync::ensure_source_root_is_not_linked(&canonical)?;
        if normalized_path(&requested) != normalized_path(&canonical) {
            bail!(
                "Use the canonical changed MP3 path instead of {}",
                requested.display()
            );
        }
        let folder_index = containing_folders[0];
        if !path_is_strictly_within(&canonical, &folders[folder_index])
            || !library_roots
                .iter()
                .any(|root| path_is_strictly_within(&canonical, root))
        {
            bail!(
                "The changed MP3 resolves outside its requested album folder or Music Library destination: {}",
                canonical.display()
            );
        }
        if seen.insert(normalized_path(&canonical)) {
            targets.push((folder_index, canonical));
        }
    }

    if all_targets_available && targets.len() == 1 {
        Ok(targets.into_iter().next())
    } else {
        Ok(None)
    }
}

#[cfg(test)]
fn catalog_scope_for_existing_folder(
    conn: &Connection,
    folder: PathBuf,
) -> Result<ExistingFolderScope> {
    let mut statement = conn.prepare(
        "SELECT COALESCE(file_path, ''), COALESCE(filename, ''), COALESCE(album_id, '') FROM tracks",
    )?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut album_ids = BTreeSet::new();
    let mut track_count = 0_usize;
    for (file_path, filename, album_id) in &rows {
        if !path_text_is_within_folder(file_path, &folder) {
            continue;
        }
        if !filename_has_mp3_extension(filename) {
            bail!(
                "The cataloged folder contains non-MP3 audio and cannot be synced through Aurora: {}",
                folder.display()
            );
        }
        let album_id = album_id.trim();
        if album_id.is_empty() {
            bail!(
                "The cataloged folder has no stable album identity and cannot be synced safely: {}",
                folder.display()
            );
        }
        album_ids.insert(album_id.to_owned());
        track_count += 1;
    }
    if track_count == 0 {
        bail!(
            "The requested folder is not represented in the active Music Library catalog: {}",
            folder.display()
        );
    }
    if album_ids.len() != 1 {
        bail!(
            "The requested folder belongs to more than one catalog album and cannot be synced safely: {}",
            folder.display()
        );
    }
    let album_id = album_ids.into_iter().next().expect("one album id");
    if rows.iter().any(|(file_path, _, row_album_id)| {
        row_album_id.trim() == album_id && !path_text_is_within_folder(file_path, &folder)
    }) {
        bail!(
            "Catalog album {album_id} has tracks outside {}. Sync its complete album folder instead",
            folder.display()
        );
    }
    Ok(ExistingFolderScope {
        folder,
        album_id,
        track_count,
    })
}

fn sync_existing_folder(
    conn: &mut Connection,
    database_path: &Path,
    app_data_dir: &Path,
    scope: &ExistingFolderScope,
    candidate: &importer::ExistingAlbumSyncCandidate,
) -> Result<SyncedFolderReceipt> {
    match importer::apply_existing_album_fast_sync(conn, candidate)? {
        importer::ExistingAlbumFastSyncOutcome::Updated {
            import_run_id,
            changed_tracks,
            changed_albums,
        } => {
            return Ok(SyncedFolderReceipt {
                folder_path: display_path(&scope.folder),
                status: SyncedFolderStatus::Updated,
                changed_tracks,
                changed_albums,
                import_run_id: Some(import_run_id),
                backup_path: None,
            });
        }
        importer::ExistingAlbumFastSyncOutcome::Unchanged => {
            return Ok(SyncedFolderReceipt {
                folder_path: display_path(&scope.folder),
                status: SyncedFolderStatus::Unchanged,
                changed_tracks: 0,
                changed_albums: 0,
                import_run_id: None,
                backup_path: None,
            });
        }
        importer::ExistingAlbumFastSyncOutcome::Fallback => {}
    }

    let snapshot_id = new_plan_id(&scope.folder, "sync-existing");
    let snapshot_path = app_data_dir
        .join("album-folder-imports")
        .join(format!("{SYNC_SNAPSHOT_PREFIX}{snapshot_id}.tsv"));
    if let Err(error) = folder_sync::build_snapshot(
        conn,
        &scope.folder,
        &snapshot_path,
        &std::sync::atomic::AtomicBool::new(false),
        &mut |_, _, _| {},
    ) {
        return Err(with_sync_cleanup_context(
            error,
            cleanup_sync_snapshot_artifacts(app_data_dir, &snapshot_path),
        ));
    }

    let preview = match importer::prepare_bridge_import_preview(conn, &snapshot_path) {
        Ok(preview) => preview,
        Err(error) => {
            let cleanup = cleanup_abandoned_bridge_sync_sessions(conn, app_data_dir)
                .and_then(|_| cleanup_sync_snapshot_artifacts(app_data_dir, &snapshot_path));
            return Err(with_sync_cleanup_context(error, cleanup));
        }
    };
    if normalized_path(Path::new(&preview.source_path)) != normalized_path(&snapshot_path) {
        let error = anyhow!("The prepared folder sync is bound to the wrong snapshot");
        return Err(discard_invalid_sync_preview(
            conn,
            preview.session_id,
            app_data_dir,
            &snapshot_path,
            error,
        ));
    }
    if let Err(error) = validate_existing_folder_preview(conn, scope, &preview) {
        return Err(discard_invalid_sync_preview(
            conn,
            preview.session_id,
            app_data_dir,
            &snapshot_path,
            error,
        ));
    }

    let changed_tracks = preview.changed_tracks;
    let changed_albums = preview.changed_albums;
    if changed_tracks == 0 && changed_albums == 0 {
        importer::discard_bridge_import_preview(conn, preview.session_id)
            .context("Could not discard an unchanged Aurora folder-sync preview")?;
        checkpoint_discarded_sync_stage(conn)?;
        cleanup_sync_snapshot_artifacts(app_data_dir, &snapshot_path)?;
        return Ok(SyncedFolderReceipt {
            folder_path: display_path(&scope.folder),
            status: SyncedFolderStatus::Unchanged,
            changed_tracks,
            changed_albums,
            import_run_id: None,
            backup_path: None,
        });
    }

    let summary = apply_existing_folder_preview(
        conn,
        database_path,
        preview.session_id,
        app_data_dir,
        &snapshot_path,
    )?;
    if let Err(error) = cleanup_sync_snapshot_artifacts(app_data_dir, &snapshot_path) {
        eprintln!(
            "Could not remove completed Aurora folder-sync artifacts for {}: {error:#}",
            scope.folder.display()
        );
    }
    Ok(SyncedFolderReceipt {
        folder_path: display_path(&scope.folder),
        status: SyncedFolderStatus::Updated,
        changed_tracks,
        changed_albums,
        import_run_id: Some(summary.import_run_id),
        backup_path: summary.backup_path,
    })
}

fn validate_existing_folder_preview(
    conn: &Connection,
    scope: &ExistingFolderScope,
    preview: &crate::models::ImportPreview,
) -> Result<()> {
    if preview.session_id <= 0
        || preview.status != "ready"
        || preview.source_changed
        || preview.suspicious_album_count != 0
    {
        bail!("The existing-folder sync preview is not safe to apply");
    }
    let counts = SyncDeltaCounts {
        added_tracks: preview.added_tracks,
        changed_tracks: preview.changed_tracks,
        removed_tracks: preview.removed_tracks,
        added_albums: preview.added_albums,
        changed_albums: preview.changed_albums,
        removed_albums: preview.removed_albums,
    };
    validate_sync_delta_counts(&counts, scope.track_count)?;
    validate_staged_sync_scope(
        conn,
        preview.session_id,
        scope,
        counts.changed_tracks,
        counts.changed_albums,
    )
}

fn validate_sync_delta_counts(counts: &SyncDeltaCounts, scoped_track_count: usize) -> Result<()> {
    if counts.added_tracks < 0
        || counts.changed_tracks < 0
        || counts.removed_tracks < 0
        || counts.added_albums < 0
        || counts.changed_albums < 0
        || counts.removed_albums < 0
    {
        bail!("The existing-folder sync returned invalid negative delta counts");
    }
    if counts.added_tracks != 0
        || counts.removed_tracks != 0
        || counts.added_albums != 0
        || counts.removed_albums != 0
    {
        bail!(
            "Aurora existing-folder sync is metadata-only, but the prepared delta would add or remove catalog rows (added tracks: {}, removed tracks: {}, added albums: {}, removed albums: {})",
            counts.added_tracks,
            counts.removed_tracks,
            counts.added_albums,
            counts.removed_albums
        );
    }
    if counts.changed_tracks > scoped_track_count as i64 || counts.changed_albums > 1 {
        bail!(
            "The existing-folder sync delta exceeds its selected album scope: {} changed tracks for {} scoped tracks and {} changed albums",
            counts.changed_tracks,
            scoped_track_count,
            counts.changed_albums
        );
    }
    Ok(())
}

fn validate_staged_sync_scope(
    conn: &Connection,
    session_id: i64,
    scope: &ExistingFolderScope,
    expected_changed_tracks: i64,
    expected_changed_albums: i64,
) -> Result<()> {
    let mut staged_scope_count = 0_usize;
    let mut staged = conn.prepare(
        "SELECT COALESCE(file_path, ''), COALESCE(filename, ''), COALESCE(album_id, '') FROM import_stage_tracks WHERE session_id = ?1",
    )?;
    let staged_rows = staged.query_map(params![session_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    for row in staged_rows {
        let (file_path, filename, album_id) = row?;
        if path_text_is_within_folder(&file_path, &scope.folder) {
            if !filename_has_mp3_extension(&filename) || album_id.trim() != scope.album_id {
                bail!(
                    "The prepared folder sync changed the selected album identity or audio format"
                );
            }
            staged_scope_count += 1;
        } else if album_id.trim() == scope.album_id {
            bail!("The prepared folder sync moved the selected album identity outside its folder");
        }
    }
    if staged_scope_count != scope.track_count {
        bail!("The prepared folder sync does not contain the exact cataloged album track set");
    }

    let (catalog_track_count, staged_track_count, matched_track_count): (i64, i64, i64) = conn
        .query_row(
            "
            SELECT
                (SELECT COUNT(*) FROM tracks),
                (SELECT COUNT(*) FROM import_stage_tracks WHERE session_id = ?1),
                (
                    SELECT COUNT(*)
                    FROM import_stage_tracks AS staged
                    JOIN tracks AS current
                      ON current.file_path IS NULLIF(staged.file_path, '')
                     AND current.filename IS NULLIF(staged.filename, '')
                    WHERE staged.session_id = ?1
                )
            ",
            params![session_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
    if catalog_track_count != staged_track_count || matched_track_count != catalog_track_count {
        bail!("The prepared folder sync does not preserve the complete catalog track identity set");
    }

    let changed_track_identities: i64 = conn.query_row(
        "
        SELECT COUNT(*)
        FROM import_stage_tracks AS staged
        JOIN tracks AS current
          ON current.file_path IS NULLIF(staged.file_path, '')
         AND current.filename IS NULLIF(staged.filename, '')
        WHERE staged.session_id = ?1
          AND (
              current.album_id IS NOT staged.album_id
              OR current.album_unique_id IS NOT NULLIF(staged.album_unique_id, '')
          )
        ",
        params![session_id],
        |row| row.get(0),
    )?;
    if changed_track_identities != 0 {
        bail!("The prepared folder sync would change a catalog track or album identity");
    }

    let staged_album_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM import_stage_albums WHERE session_id = ?1 AND album_id = ?2",
        params![session_id, &scope.album_id],
        |row| row.get(0),
    )?;
    if staged_album_count != 1 {
        bail!("The prepared folder sync did not preserve the selected catalog album identity");
    }
    validate_staged_album_scope(conn, session_id, scope, expected_changed_albums)?;

    let mut changed_count = 0_i64;
    let mut changed = conn.prepare(
        "
        SELECT COALESCE(current.file_path, ''), COALESCE(current.filename, ''),
               COALESCE(current.album_id, ''), COALESCE(staged.file_path, ''),
               COALESCE(staged.filename, ''), COALESCE(staged.album_id, '')
        FROM import_stage_tracks AS staged
        JOIN tracks AS current
          ON current.file_path IS NULLIF(staged.file_path, '')
         AND current.filename IS NULLIF(staged.filename, '')
        WHERE staged.session_id = ?1 AND current.row_hash != staged.row_hash
        ",
    )?;
    let changed_rows = changed.query_map(params![session_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
        ))
    })?;
    for row in changed_rows {
        let (
            current_path,
            current_filename,
            current_album_id,
            staged_path,
            staged_filename,
            staged_album_id,
        ) = row?;
        if !path_text_is_within_folder(&current_path, &scope.folder)
            || !path_text_is_within_folder(&staged_path, &scope.folder)
        {
            bail!("The prepared folder sync would mutate a catalog track outside its folder");
        }
        if !filename_has_mp3_extension(&current_filename)
            || !filename_has_mp3_extension(&staged_filename)
            || current_album_id.trim() != scope.album_id
            || staged_album_id.trim() != scope.album_id
        {
            bail!("The prepared folder sync would change the selected album identity");
        }
        changed_count += 1;
    }
    if changed_count != expected_changed_tracks {
        bail!("The prepared folder sync changed-track count does not match its staged scope");
    }
    Ok(())
}

fn validate_staged_album_scope(
    conn: &Connection,
    session_id: i64,
    scope: &ExistingFolderScope,
    expected_changed_albums: i64,
) -> Result<()> {
    let (catalog_album_count, staged_album_count, matched_album_count): (i64, i64, i64) = conn
        .query_row(
            "
            SELECT
                (SELECT COUNT(*) FROM albums),
                (SELECT COUNT(*) FROM import_stage_albums WHERE session_id = ?1),
                (
                    SELECT COUNT(*)
                    FROM import_stage_albums AS staged
                    JOIN albums AS current ON current.id = staged.album_id
                    WHERE staged.session_id = ?1
                )
            ",
            params![session_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
    if catalog_album_count != staged_album_count || matched_album_count != catalog_album_count {
        bail!("The prepared folder sync does not preserve the complete catalog album identity set");
    }

    let selected_identity_changes: i64 = conn.query_row(
        "
        SELECT COUNT(*)
        FROM import_stage_albums AS staged
        JOIN albums AS current ON current.id = staged.album_id
        WHERE staged.session_id = ?1
          AND staged.album_id = ?2
          AND current.album_unique_id IS NOT staged.album_unique_id
        ",
        params![session_id, &scope.album_id],
        |row| row.get(0),
    )?;
    if selected_identity_changes != 0 {
        bail!("The prepared folder sync would change the selected catalog album identity");
    }

    let outside_album_changes: i64 = conn.query_row(
        "
        SELECT COUNT(*)
        FROM import_stage_albums AS staged
        JOIN albums AS current ON current.id = staged.album_id
        WHERE staged.session_id = ?1
          AND staged.album_id != ?2
          AND (
              current.album_unique_id IS NOT staged.album_unique_id
              OR current.album IS NOT staged.album
              OR current.album_artist_display IS NOT staged.final_album_artist_display
              OR current.canonical_genre IS NOT staged.canonical_genre
              OR current.genre_normalized IS NOT staged.genre_normalized
              OR current.publisher IS NOT staged.publisher
              OR current.year IS NOT staged.year
              OR current.release_year IS NOT staged.release_year
              OR current.total_tracks IS NOT staged.total_tracks
              OR current.rated_tracks IS NOT staged.rated_tracks
              OR current.rating_completeness IS NOT staged.rating_completeness
              OR current.total_seconds IS NOT staged.total_seconds
              OR current.loved_tracks IS NOT staged.loved_tracks
              OR current.tmoe_seconds IS NOT staged.tmoe_seconds
              OR current.ae_ratio IS NOT staged.ae_ratio
              OR current.album_rating IS NOT staged.album_rating
              OR current.calculated_album_rating IS NOT staged.calculated_album_rating
              OR current.effective_album_rating IS NOT staged.effective_album_rating
              OR current.album_score IS NOT staged.album_score
          )
        ",
        params![session_id, &scope.album_id],
        |row| row.get(0),
    )?;
    if outside_album_changes != 0 {
        bail!("The prepared folder sync would mutate a catalog album outside its folder");
    }

    let selected_changed_albums: i64 = conn.query_row(
        "
        SELECT COUNT(*)
        FROM import_stage_albums AS staged
        JOIN albums AS current ON current.id = staged.album_id
        WHERE staged.session_id = ?1
          AND staged.album_id = ?2
          AND (
              current.album IS NOT staged.album
              OR current.album_artist_display IS NOT staged.final_album_artist_display
              OR current.canonical_genre IS NOT staged.canonical_genre
              OR current.publisher IS NOT staged.publisher
              OR current.year IS NOT staged.year
              OR current.release_year IS NOT staged.release_year
              OR current.total_tracks IS NOT staged.total_tracks
              OR current.rated_tracks IS NOT staged.rated_tracks
              OR ABS(current.rating_completeness - staged.rating_completeness) > 0.000001
              OR current.total_seconds IS NOT staged.total_seconds
              OR current.loved_tracks IS NOT staged.loved_tracks
              OR current.tmoe_seconds IS NOT staged.tmoe_seconds
              OR ABS(current.ae_ratio - staged.ae_ratio) > 0.000001
              OR current.album_rating IS NOT staged.album_rating
              OR current.effective_album_rating IS NOT staged.effective_album_rating
              OR (current.album_score IS NULL) != (staged.album_score IS NULL)
              OR (
                  current.album_score IS NOT NULL
                  AND staged.album_score IS NOT NULL
                  AND ABS(current.album_score - staged.album_score) > 0.000001
              )
          )
        ",
        params![session_id, &scope.album_id],
        |row| row.get(0),
    )?;
    if selected_changed_albums != expected_changed_albums {
        bail!("The prepared folder sync changed-album count is outside its selected scope");
    }
    Ok(())
}

fn apply_existing_folder_preview(
    conn: &mut Connection,
    database_path: &Path,
    session_id: i64,
    app_data_dir: &Path,
    snapshot_path: &Path,
) -> Result<importer::BridgeImportSummary> {
    match importer::apply_bridge_import_preview(conn, database_path, session_id) {
        Ok(summary) => Ok(summary),
        Err(error) => match importer::bridge_session_state_optional(conn, session_id) {
            Ok(Some(state)) if state.status == "completed" => {
                let import_run_id = state.import_run_id.ok_or_else(|| {
                    error.context(
                        "The folder sync committed, but its completed session has no import run",
                    )
                })?;
                Ok(importer::BridgeImportSummary {
                    import_run_id,
                    backup_path: state.backup_path,
                })
            }
            Ok(Some(_)) => {
                let cleanup = importer::discard_bridge_import_preview(conn, session_id)
                    .and_then(|_| checkpoint_discarded_sync_stage(conn))
                    .and_then(|_| cleanup_sync_snapshot_artifacts(app_data_dir, snapshot_path));
                Err(with_sync_cleanup_context(error, cleanup))
            }
            Ok(None) => Err(with_sync_cleanup_context(
                error,
                cleanup_sync_snapshot_artifacts(app_data_dir, snapshot_path),
            )),
            Err(verification_error) => Err(error.context(format!(
                "Could not prove whether the existing-folder catalog commit completed; its session and snapshot were retained for retry: {verification_error:#}"
            ))),
        },
    }
}

fn discard_invalid_sync_preview(
    conn: &Connection,
    session_id: i64,
    app_data_dir: &Path,
    snapshot_path: &Path,
    error: anyhow::Error,
) -> anyhow::Error {
    let cleanup = importer::discard_bridge_import_preview(conn, session_id)
        .and_then(|_| checkpoint_discarded_sync_stage(conn))
        .and_then(|_| cleanup_sync_snapshot_artifacts(app_data_dir, snapshot_path));
    with_sync_cleanup_context(error, cleanup)
}

fn with_sync_cleanup_context(error: anyhow::Error, cleanup: Result<()>) -> anyhow::Error {
    match cleanup {
        Ok(()) => error,
        Err(cleanup_error) => error.context(format!(
            "Aurora retained folder-sync recovery artifacts because cleanup failed: {cleanup_error:#}"
        )),
    }
}

fn cleanup_abandoned_bridge_sync_sessions(conn: &Connection, app_data_dir: &Path) -> Result<()> {
    let snapshot_directory = app_data_dir.join("album-folder-imports");
    let mut discarded_session = false;
    for (session_id, source_path) in importer::noncompleted_bridge_sessions(conn)? {
        if is_bridge_sync_snapshot_path(app_data_dir, Path::new(&source_path)) {
            importer::discard_bridge_import_preview(conn, session_id).with_context(|| {
                format!("Could not discard abandoned Aurora folder-sync session {session_id}")
            })?;
            discarded_session = true;
        }
    }
    if discarded_session {
        checkpoint_discarded_sync_stage(conn)?;
    }
    if !snapshot_directory.try_exists()? {
        return Ok(());
    }
    for entry in fs::read_dir(&snapshot_directory).with_context(|| {
        format!(
            "Could not inspect Aurora folder-sync snapshots {}",
            snapshot_directory.display()
        )
    })? {
        let entry = entry?;
        if entry.file_type()?.is_file()
            && entry
                .file_name()
                .to_str()
                .is_some_and(is_bridge_sync_artifact_name)
        {
            fs::remove_file(entry.path()).with_context(|| {
                format!(
                    "Could not remove abandoned Aurora folder-sync artifact {}",
                    entry.path().display()
                )
            })?;
        }
    }
    Ok(())
}

fn checkpoint_discarded_sync_stage(conn: &Connection) -> Result<()> {
    let (busy, _, _): (i64, i64, i64) = conn
        .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .context("Could not reclaim discarded Aurora folder-sync staging space")?;
    if busy != 0 {
        eprintln!(
            "Music Library could not immediately reclaim every discarded Aurora staging page because another catalog reader is active"
        );
    }
    Ok(())
}

fn cleanup_sync_snapshot_artifacts(app_data_dir: &Path, snapshot_path: &Path) -> Result<()> {
    if !is_bridge_sync_snapshot_path(app_data_dir, snapshot_path) {
        bail!(
            "Refusing to clean an invalid Aurora folder-sync snapshot path: {}",
            snapshot_path.display()
        );
    }
    for artifact in [
        snapshot_path.to_path_buf(),
        snapshot_path.with_extension("manifest.json"),
        snapshot_path.with_extension("tsv.building"),
    ] {
        if artifact.try_exists()? {
            fs::remove_file(&artifact).with_context(|| {
                format!(
                    "Could not remove Aurora folder-sync artifact {}",
                    artifact.display()
                )
            })?;
        }
    }
    Ok(())
}

fn is_bridge_sync_snapshot_path(app_data_dir: &Path, path: &Path) -> bool {
    path.parent().map(normalized_path)
        == Some(normalized_path(&app_data_dir.join("album-folder-imports")))
        && path
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.ends_with(".tsv") && is_bridge_sync_artifact_name(value))
}

fn is_bridge_sync_artifact_name(name: &str) -> bool {
    let Some(rest) = name.strip_prefix(SYNC_SNAPSHOT_PREFIX) else {
        return false;
    };
    let token = [".tsv", ".manifest.json", ".tsv.building"]
        .into_iter()
        .find_map(|suffix| rest.strip_suffix(suffix));
    token.is_some_and(|value| {
        value.len() == 24 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}

fn path_is_strictly_within(path: &Path, root: &Path) -> bool {
    normalized_path(path).starts_with(&(normalized_path(root) + "\\"))
}

fn path_text_is_within_folder(path: &str, folder: &Path) -> bool {
    let path = normalized_path(Path::new(path));
    let folder = normalized_path(folder);
    path == folder || path.starts_with(&(folder + "\\"))
}

fn filename_has_mp3_extension(filename: &str) -> bool {
    Path::new(filename)
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("mp3"))
}

fn apply_batch(app_data_dir: &Path, request: ApplyBatchRequest) -> Result<Value> {
    validate_plan_id(&request.plan_id)?;
    let plan_directory = plan_directory(app_data_dir, &request.plan_id)?;
    let plan_path = plan_directory.join("plan.json");
    let bytes = fs::read(&plan_path)
        .with_context(|| format!("Could not read Aurora intake plan {}", plan_path.display()))?;
    let plan: StoredPlan = serde_json::from_slice(&bytes)
        .with_context(|| format!("Could not parse Aurora intake plan {}", plan_path.display()))?;
    validate_stored_plan(&plan, &request)?;
    let category = category_definition(&plan.category)?;
    let destination_root = canonical_destination_root(&category)?;
    if normalized_path(&destination_root) != normalized_path(Path::new(&plan.destination_root)) {
        bail!("The category destination changed after preview. Prepare the batch again");
    }

    let database_path = app_data_dir.join("music-library.sqlite3");
    let mut conn = open_database(&database_path)?;
    let session_state = importer::bridge_session_state(&conn, request.session_id)?;
    let existing_journal = load_apply_journal(&plan_directory)?;
    validate_plan_session_binding(&plan, &session_state)?;
    if session_state.status == "completed" {
        let import_run_id = session_state
            .import_run_id
            .ok_or_else(|| anyhow!("Completed Aurora import session has no import run"))?;
        return Ok(finish_committed_plan(
            &plan,
            &plan_directory,
            import_run_id,
            session_state.backup_path,
            Vec::new(),
        ));
    }

    let snapshot_path = PathBuf::from(&plan.snapshot_path);
    if !snapshot_path.try_exists()? || !folder_sync::source_is_unchanged(&conn, &snapshot_path)? {
        bail!("The source albums or active catalog changed after preview. Prepare the batch again");
    }
    validate_source_inventories(&plan)?;
    let can_reuse_published = existing_journal.as_ref().is_some_and(|journal| {
        journal.plan_id == plan.plan_id && matches!(journal.phase.as_str(), "copying" | "published")
    });
    validate_apply_destinations(&destination_root, &plan, can_reuse_published)?;
    let journal_path = plan_directory.join("apply-journal.json");
    write_apply_journal(&journal_path, &plan.plan_id, "copying")?;

    let published = match stage_and_publish(&plan, None) {
        Ok(published) => published,
        Err(error) => {
            return Err(error);
        }
    };
    if let Err(error) = validate_source_inventories(&plan) {
        return Err(compensate_precommit(
            error.context(
                "A source album changed while Aurora was copying; sources were not deleted",
            ),
            &published,
            &destination_root,
            &journal_path,
        ));
    }
    if let Err(error) = validate_published_inventories(&published) {
        return Err(compensate_precommit(
            error,
            &published,
            &destination_root,
            &journal_path,
        ));
    }
    if let Err(error) = write_apply_journal(&journal_path, &plan.plan_id, "published") {
        return Err(compensate_precommit(
            error,
            &published,
            &destination_root,
            &journal_path,
        ));
    }
    let import_summary = match importer::apply_bridge_import_preview(
        &mut conn,
        &database_path,
        request.session_id,
    ) {
        Ok(summary) => summary,
        Err(error) => {
            match importer::bridge_session_state(&conn, request.session_id) {
                Ok(state) if state.status == "completed" => {
                    let import_run_id = state.import_run_id.ok_or_else(|| {
                        anyhow!("Completed Aurora import session has no import run")
                    })?;
                    return Ok(finish_committed_plan(
                        &plan,
                        &plan_directory,
                        import_run_id,
                        state.backup_path,
                        vec![format!(
                            "The catalog commit completed, but post-commit reporting returned an error: {error:#}"
                        )],
                    ));
                }
                Ok(_) => {}
                Err(state_error) => {
                    return Err(error.context(format!(
                        "Could not verify the catalog commit outcome; published destinations and sources were retained for retry: {state_error:#}"
                    )));
                }
            }
            return Err(compensate_precommit(
                error.context("The catalog apply failed; sources remain"),
                &published,
                &destination_root,
                &journal_path,
            ));
        }
    };
    let mut postcommit_warnings = Vec::new();
    if let Err(error) = write_apply_journal(&journal_path, &plan.plan_id, "committed") {
        postcommit_warnings.push(format!(
            "The catalog committed, but Aurora could not update its recovery journal: {error:#}"
        ));
    }
    match db::settings_for_connection(&conn).and_then(|settings| {
        covers::import_added_album_covers_for_bridge(
            &mut conn,
            app_data_dir,
            &settings.cover_source_path,
            import_summary.import_run_id,
        )
    }) {
        Ok(_) => {}
        Err(error) => postcommit_warnings.push(format!(
            "The albums were cataloged, but their automatic cover import failed: {error:#}"
        )),
    }
    Ok(finish_committed_plan(
        &plan,
        &plan_directory,
        import_summary.import_run_id,
        import_summary.backup_path,
        postcommit_warnings,
    ))
}

fn validate_source_inventories(plan: &StoredPlan) -> Result<()> {
    for album in &plan.albums {
        let source = Path::new(&album.source_path);
        folder_sync::ensure_source_root_is_not_linked(source)?;
        if inventory_folder(source)? != album.inventory {
            bail!(
                "The source album changed after preview: {}",
                source.display()
            );
        }
    }
    Ok(())
}

fn validate_plan_session_binding(
    plan: &StoredPlan,
    state: &importer::BridgeSessionState,
) -> Result<()> {
    if normalized_path(Path::new(&state.source_path))
        != normalized_path(Path::new(&plan.snapshot_path))
    {
        bail!("The Aurora intake plan is bound to a different import session snapshot");
    }
    let expected_tracks = plan
        .albums
        .iter()
        .map(|album| album.track_count as i64)
        .sum::<i64>();
    if state.added_tracks != expected_tracks
        || state.changed_tracks != 0
        || state.removed_tracks != 0
        || state.added_albums != plan.albums.len() as i64
        || state.changed_albums != 0
        || state.removed_albums != 0
    {
        bail!("The Aurora intake session is no longer an exact add-only match for its plan");
    }
    let mappings = plan
        .albums
        .iter()
        .map(|album| BatchAlbumInput {
            source: PathBuf::from(&album.source_path),
            destination: PathBuf::from(&album.destination_path),
        })
        .collect::<Vec<_>>();
    folder_sync::ensure_batch_snapshot_bindings(
        Path::new(&plan.snapshot_path),
        Path::new(&plan.source_path),
        &mappings,
    )
}

fn validate_published_inventories(albums: &[PublishedAlbum]) -> Result<()> {
    for album in albums {
        if !published_album_is_owned_and_unchanged(album)? {
            bail!(
                "A copied destination changed or lost its Aurora ownership marker before catalog commit: {}",
                album.destination.display()
            );
        }
    }
    Ok(())
}

fn validate_apply_destinations(root: &Path, plan: &StoredPlan, can_reuse: bool) -> Result<()> {
    for (index, album) in plan.albums.iter().enumerate() {
        let destination = Path::new(&album.destination_path);
        ensure_direct_child(root, destination)?;
        if destination.try_exists().with_context(|| {
            format!(
                "Could not determine whether destination exists: {}",
                destination.display()
            )
        })? {
            if can_reuse {
                verify_owned_destination(destination, &plan.plan_id, index, &album.inventory)?;
            }
            if !can_reuse {
                bail!(
                    "The destination album folder is already occupied: {}",
                    destination.display()
                );
            }
        } else {
            ensure_destination_available(root, destination)?;
        }
    }
    Ok(())
}

fn compensate_precommit(
    error: anyhow::Error,
    published: &[PublishedAlbum],
    root: &Path,
    journal_path: &Path,
) -> anyhow::Error {
    let cleanup_errors = cleanup_published(published, root);
    if cleanup_errors.is_empty() {
        let _ = fs::remove_file(journal_path);
        error.context(
            "Copied destination folders were removed after exact verification; sources remain",
        )
    } else {
        error.context(format!(
            "Destination compensation retained changed or unverifiable folders: {}",
            cleanup_errors.join("; ")
        ))
    }
}

fn finish_committed_plan(
    plan: &StoredPlan,
    _plan_directory: &Path,
    import_run_id: i64,
    backup_path: Option<String>,
    mut cleanup_warnings: Vec<String>,
) -> Value {
    let mut album_results = Vec::with_capacity(plan.albums.len());
    let mut moved_album_count = 0_usize;
    for (index, album) in plan.albums.iter().enumerate() {
        let source = PathBuf::from(&album.source_path);
        let destination = PathBuf::from(&album.destination_path);
        let destination_is_safe = match finalize_committed_destination(
            &destination,
            &plan.plan_id,
            index,
            &album.inventory,
        ) {
            Ok(()) => true,
            Err(error) => {
                cleanup_warnings.push(format!(
                    "The catalog committed, but destination {} could not be safely finalized; source {} was retained: {error:#}",
                    destination.display(),
                    source.display()
                ));
                false
            }
        };
        let removed = destination_is_safe
            && cleanup_committed_source(plan, album, index, &mut cleanup_warnings);
        let cleanup_status = if removed {
            moved_album_count += 1;
            "removed"
        } else {
            "retained"
        };
        album_results.push(json!({
            "sourcePath": album.source_path,
            "destinationPath": album.destination_path,
            "cleanupStatus": cleanup_status,
        }));
    }
    json!({
        "planId": plan.plan_id,
        "sessionId": plan.session_id,
        "status": if cleanup_warnings.is_empty() { "completed" } else { "completedWithWarnings" },
        "albumCount": plan.albums.len(),
        "trackCount": plan.albums.iter().map(|album| album.track_count).sum::<usize>(),
        "movedAlbumCount": moved_album_count,
        "importRunId": import_run_id,
        "backupPath": backup_path,
        "albums": album_results,
        "cleanupWarnings": cleanup_warnings,
    })
}

fn cleanup_committed_source(
    plan: &StoredPlan,
    album: &StoredAlbum,
    index: usize,
    warnings: &mut Vec<String>,
) -> bool {
    let source = PathBuf::from(&album.source_path);
    let Some(parent) = source.parent() else {
        warnings.push(format!(
            "Source has no parent directory and was retained: {}",
            source.display()
        ));
        return false;
    };
    let Some(name) = source.file_name().and_then(|value| value.to_str()) else {
        warnings.push(format!(
            "Source folder name is not valid Unicode and was retained: {}",
            source.display()
        ));
        return false;
    };
    let quarantine = parent.join(format!(
        ".{name}.aurora-source-cleanup-{}-{index:03}",
        plan.plan_id
    ));
    let source_exists = match source.try_exists() {
        Ok(value) => value,
        Err(error) => {
            warnings.push(format!(
                "Could not determine whether source {} still exists; it was not counted as moved: {error}",
                source.display()
            ));
            return false;
        }
    };
    let quarantine_exists = match quarantine.try_exists() {
        Ok(value) => value,
        Err(error) => {
            warnings.push(format!(
                "Could not inspect source cleanup quarantine {}: {error}",
                quarantine.display()
            ));
            return false;
        }
    };
    if !source_exists && !quarantine_exists {
        return true;
    }
    if source_exists && quarantine_exists {
        warnings.push(format!(
            "Source {} and its cleanup quarantine both exist; neither was removed",
            source.display()
        ));
        return false;
    }
    if source_exists {
        let source_is_unchanged = folder_sync::ensure_source_root_is_not_linked(&source)
            .and_then(|_| inventory_folder(&source))
            .is_ok_and(|inventory| inventory == album.inventory);
        if !source_is_unchanged {
            warnings.push(format!(
                "Source {} changed during intake and was retained",
                source.display()
            ));
            return false;
        }
        if let Err(error) = fs::rename(&source, &quarantine) {
            warnings.push(format!(
                "Source {} was verified but could not be isolated for cleanup: {error}",
                source.display()
            ));
            return false;
        }
    }
    match inventory_folder(&quarantine) {
        Ok(inventory) if inventory == album.inventory => {}
        Ok(_) | Err(_) => {
            if source.try_exists().ok() == Some(false) {
                let _ = fs::rename(&quarantine, &source);
            }
            warnings.push(format!(
                "Source cleanup quarantine {} could not be verified and was retained",
                quarantine.display()
            ));
            return false;
        }
    }
    match fs::remove_dir_all(&quarantine) {
        Ok(()) => true,
        Err(error) => {
            warnings.push(format!(
                "Source was isolated from {}, but cleanup of quarantine {} is incomplete: {error}",
                source.display(),
                quarantine.display()
            ));
            false
        }
    }
}

fn category_definitions() -> Result<[CategoryDefinition; 3]> {
    Ok([
        CategoryDefinition {
            id: "general",
            label: "General music",
            root: bridge_root(GENERAL_ROOT_OVERRIDE, r"D:\MUSIC")?,
        },
        CategoryDefinition {
            id: "scores",
            label: "Movie / TV / game music",
            root: bridge_root(SCORES_ROOT_OVERRIDE, r"G:\_BACKUP\SCORES")?,
        },
        CategoryDefinition {
            id: "synthwave",
            label: "Synthwave",
            root: bridge_root(SYNTHWAVE_ROOT_OVERRIDE, r"H:\Synthwave")?,
        },
    ])
}

fn category_definition(id: &str) -> Result<CategoryDefinition> {
    category_definitions()?
        .into_iter()
        .find(|category| category.id == id)
        .ok_or_else(|| anyhow!("Unknown music category {id:?}"))
}

fn bridge_root(variable: &str, fallback: &str) -> Result<PathBuf> {
    if std::env::var_os(APP_DATA_OVERRIDE).is_none() {
        return Ok(PathBuf::from(fallback));
    }
    let value = std::env::var_os(variable).ok_or_else(|| {
        anyhow!("{variable} is required when {APP_DATA_OVERRIDE} isolates bridge mode")
    })?;
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        bail!("{variable} must be an absolute directory path");
    }
    Ok(path)
}

fn canonical_destination_root(category: &CategoryDefinition) -> Result<PathBuf> {
    if !category.root.try_exists()? || !fs::metadata(&category.root)?.is_dir() {
        bail!(
            "The {} destination is unavailable: {}",
            category.label,
            category.root.display()
        );
    }
    folder_sync::ensure_source_root_is_not_linked(&category.root)?;
    category.root.canonicalize().with_context(|| {
        format!(
            "Could not resolve destination root {}",
            category.root.display()
        )
    })
}

fn resolve_destination_mappings(
    selected_source: &Path,
    destination_root: &Path,
    album_sources: Vec<PathBuf>,
) -> Result<Vec<BatchAlbumInput>> {
    if album_sources.is_empty() {
        bail!("The selected folder does not contain any complete tagged albums");
    }
    let mut names = BTreeSet::new();
    let mut inputs = Vec::with_capacity(album_sources.len());
    for source in album_sources {
        let name = source
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| {
                anyhow!(
                    "Album folder name is not valid Unicode: {}",
                    source.display()
                )
            })?;
        if name.starts_with(".aurora-intake-") {
            bail!("Album folder name uses Aurora's reserved staging prefix: {name}");
        }
        if !names.insert(name.to_lowercase()) {
            bail!("Two source albums have the same destination folder name (case-insensitive): {name}");
        }
        let destination = destination_root.join(name);
        if paths_overlap(&source, &destination)
            || paths_overlap(selected_source, &destination)
            || paths_overlap(&source, destination_root)
        {
            bail!(
                "Source and destination overlap for {}. Choose an intake folder outside the library destination",
                source.display()
            );
        }
        ensure_destination_available(destination_root, &destination)?;
        inputs.push(BatchAlbumInput {
            source,
            destination,
        });
    }
    Ok(inputs)
}

fn ensure_destination_available(root: &Path, destination: &Path) -> Result<()> {
    ensure_direct_child(root, destination)?;
    let wanted = destination
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| anyhow!("Destination folder name is not valid Unicode"))?;
    for entry in fs::read_dir(root)
        .with_context(|| format!("Could not inspect destination root {}", root.display()))?
    {
        let entry = entry?;
        if entry
            .file_name()
            .to_string_lossy()
            .eq_ignore_ascii_case(wanted)
        {
            bail!(
                "The destination album folder is already occupied: {}",
                entry.path().display()
            );
        }
    }
    Ok(())
}

fn ensure_direct_child(root: &Path, path: &Path) -> Result<()> {
    if path.parent().map(normalized_path) != Some(normalized_path(root)) {
        bail!(
            "The planned path escapes its category root: {}",
            path.display()
        );
    }
    Ok(())
}

fn inventory_folder(folder: &Path) -> Result<FolderInventory> {
    folder_sync::ensure_source_root_is_not_linked(folder)?;
    let canonical = folder
        .canonicalize()
        .with_context(|| format!("Could not resolve source album {}", folder.display()))?;
    let mut directories = Vec::new();
    let mut files = Vec::new();
    collect_inventory(&canonical, &canonical, 0, &mut directories, &mut files)?;
    Ok(finish_inventory(directories, files))
}

fn finish_inventory(
    mut directories: Vec<String>,
    mut files: Vec<InventoryFile>,
) -> FolderInventory {
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    directories.sort();
    let mut hasher = Sha256::new();
    for directory in &directories {
        hash_framed(&mut hasher, b'd', directory.as_bytes());
    }
    for file in &files {
        hash_framed(&mut hasher, b'f', file.relative_path.as_bytes());
        hasher.update(file.size_bytes.to_le_bytes());
        hasher.update(file.sha256.as_bytes());
    }
    FolderInventory {
        digest: hex::encode(hasher.finalize()),
        directories,
        files,
    }
}

fn inventory_without_owner_marker(folder: &Path) -> Result<FolderInventory> {
    let inventory = inventory_folder(folder)?;
    let files = inventory
        .files
        .into_iter()
        .filter(|file| file.relative_path != STAGING_OWNER_FILE)
        .collect();
    Ok(finish_inventory(inventory.directories, files))
}

fn collect_inventory(
    root: &Path,
    folder: &Path,
    depth: usize,
    directories: &mut Vec<String>,
    files: &mut Vec<InventoryFile>,
) -> Result<()> {
    if depth > 16 {
        bail!("Album folder nesting exceeds the transfer safety limit");
    }
    for entry in fs::read_dir(folder)
        .with_context(|| format!("Could not read album folder {}", folder.display()))?
    {
        if directories.len() + files.len() >= MAX_TRANSFER_ENTRIES {
            bail!("The intake batch contains more than {MAX_TRANSFER_ENTRIES} filesystem entries");
        }
        let entry = entry?;
        folder_sync::ensure_path_entry_is_not_linked(&entry.path())?;
        let file_type = entry.file_type()?;
        let relative = entry
            .path()
            .strip_prefix(root)
            .map(display_path)
            .context("Could not create a safe relative transfer path")?;
        validate_relative_path(Path::new(&relative))?;
        if file_type.is_dir() {
            directories.push(relative);
            collect_inventory(root, &entry.path(), depth + 1, directories, files)?;
        } else if file_type.is_file() {
            let metadata = entry.metadata()?;
            files.push(InventoryFile {
                relative_path: relative,
                size_bytes: metadata.len(),
                sha256: hash_file(&entry.path())?,
            });
        } else {
            bail!(
                "Album folder contains an unsupported filesystem entry: {}",
                entry.path().display()
            );
        }
    }
    Ok(())
}

fn write_staging_owner(folder: &Path, plan_id: &str, index: usize) -> Result<()> {
    atomic_write_json(
        &folder.join(STAGING_OWNER_FILE),
        &StagingOwner {
            plan_id: plan_id.to_owned(),
            album_index: index,
        },
    )
}

fn has_staging_owner(folder: &Path, plan_id: &str, index: usize) -> Result<bool> {
    let marker = folder.join(STAGING_OWNER_FILE);
    if !marker.try_exists()? {
        return Ok(false);
    }
    let bytes = fs::read(&marker)?;
    let owner: StagingOwner = serde_json::from_slice(&bytes).with_context(|| {
        format!(
            "Could not parse Aurora ownership marker {}",
            marker.display()
        )
    })?;
    Ok(owner.plan_id == plan_id && owner.album_index == index)
}

fn verify_owned_destination(
    destination: &Path,
    plan_id: &str,
    index: usize,
    expected: &FolderInventory,
) -> Result<()> {
    if !has_staging_owner(destination, plan_id, index)?
        || inventory_without_owner_marker(destination)? != *expected
    {
        bail!(
            "A published Aurora destination contains an invalid ownership marker: {}",
            destination.display()
        );
    }
    Ok(())
}

fn finalize_committed_destination(
    destination: &Path,
    plan_id: &str,
    index: usize,
    expected: &FolderInventory,
) -> Result<()> {
    let marker = destination.join(STAGING_OWNER_FILE);
    if marker.try_exists().with_context(|| {
        format!(
            "Could not determine whether Aurora ownership marker exists at {}",
            destination.display()
        )
    })? {
        verify_owned_destination(destination, plan_id, index, expected)?;
        fs::remove_file(&marker).with_context(|| {
            format!(
                "Could not finalize published destination {}",
                destination.display()
            )
        })?;
    }
    if inventory_folder(destination)? != *expected {
        bail!(
            "The committed destination changed after its ownership marker was removed: {}",
            destination.display()
        );
    }
    Ok(())
}

fn stage_and_publish(
    plan: &StoredPlan,
    fail_after_publish: Option<usize>,
) -> Result<Vec<PublishedAlbum>> {
    let root = PathBuf::from(&plan.destination_root);
    let mut staging_paths = Vec::new();
    let mut published = Vec::new();
    let result = (|| -> Result<()> {
        for (index, album) in plan.albums.iter().enumerate() {
            let source = PathBuf::from(&album.source_path);
            let destination = PathBuf::from(&album.destination_path);
            ensure_direct_child(&root, &destination)?;
            if destination.try_exists().with_context(|| {
                format!(
                    "Could not determine whether destination exists: {}",
                    destination.display()
                )
            })? {
                verify_owned_destination(&destination, &plan.plan_id, index, &album.inventory)?;
                published.push(PublishedAlbum {
                    destination,
                    inventory: album.inventory.clone(),
                    plan_id: plan.plan_id.clone(),
                    index,
                });
                continue;
            }
            let staging = root.join(format!(".aurora-intake-{}-{index:03}", plan.plan_id));
            ensure_direct_child(&root, &staging)?;
            if staging.try_exists().with_context(|| {
                format!(
                    "Could not determine whether staging folder exists: {}",
                    staging.display()
                )
            })? {
                if !has_staging_owner(&staging, &plan.plan_id, index)?
                    || !inventory_is_safe_subset(&staging, &album.inventory)?
                {
                    bail!(
                        "A stale Aurora staging folder contains unexpected or changed files: {}",
                        staging.display()
                    );
                }
                remove_created_directory(&staging, &root)?;
            }
            fs::create_dir(&staging).with_context(|| {
                format!(
                    "Could not create hidden destination staging folder {}",
                    staging.display()
                )
            })?;
            staging_paths.push((staging.clone(), index));
            write_staging_owner(&staging, &plan.plan_id, index)?;
            set_hidden(&staging, true)?;
            copy_inventory(&source, &staging, &album.inventory)?;
            fs::rename(&staging, &destination).with_context(|| {
                format!(
                    "Could not publish copied album at {}",
                    destination.display()
                )
            })?;
            staging_paths.pop();
            published.push(PublishedAlbum {
                destination: destination.clone(),
                inventory: album.inventory.clone(),
                plan_id: plan.plan_id.clone(),
                index,
            });
            set_hidden(&destination, false)?;
            if !has_staging_owner(&destination, &plan.plan_id, index)? {
                bail!(
                    "Published album lost its Aurora ownership marker: {}",
                    destination.display()
                );
            }
            if inventory_without_owner_marker(&destination)? != album.inventory {
                bail!(
                    "Published album verification failed: {}",
                    destination.display()
                );
            }
            if fail_after_publish.is_some_and(|limit| published.len() > limit) {
                bail!("Injected transfer failure after publish");
            }
        }
        Ok(())
    })();
    if let Err(error) = result {
        let cleanup_errors = cleanup_published(&published, &root);
        for (staging, index) in staging_paths.iter().rev() {
            let album = &plan.albums[*index];
            let safe = has_staging_owner(staging, &plan.plan_id, *index)
                .and_then(|owned| {
                    if owned {
                        inventory_is_safe_subset(staging, &album.inventory)
                    } else {
                        Ok(false)
                    }
                })
                .unwrap_or(false);
            if !safe {
                eprintln!(
                    "Retained changed or unowned Aurora staging folder {}",
                    staging.display()
                );
                continue;
            }
            if let Err(cleanup_error) = remove_created_directory(staging, &root) {
                eprintln!("Could not remove failed Aurora staging folder: {cleanup_error:#}");
            }
        }
        if cleanup_errors.is_empty() {
            return Err(error);
        }
        return Err(error.context(format!(
            "Transfer compensation also failed: {}",
            cleanup_errors.join("; ")
        )));
    }
    Ok(published)
}

fn copy_inventory(source: &Path, staging: &Path, inventory: &FolderInventory) -> Result<()> {
    for relative in &inventory.directories {
        let relative = Path::new(relative);
        validate_relative_path(relative)?;
        fs::create_dir_all(staging.join(relative))?;
    }
    for file in &inventory.files {
        let relative = Path::new(&file.relative_path);
        validate_relative_path(relative)?;
        let source_file = source.join(relative);
        let destination_file = staging.join(relative);
        if let Some(parent) = destination_file.parent() {
            fs::create_dir_all(parent)?;
        }
        let copied = fs::copy(&source_file, &destination_file).with_context(|| {
            format!(
                "Could not copy {} to {}",
                source_file.display(),
                destination_file.display()
            )
        })?;
        if copied != file.size_bytes
            || fs::metadata(&destination_file)?.len() != file.size_bytes
            || hash_file(&destination_file)? != file.sha256
        {
            bail!(
                "Copied file verification failed: {}",
                destination_file.display()
            );
        }
    }
    if inventory_without_owner_marker(staging)? != *inventory {
        bail!(
            "Copied folder verification failed for {}",
            staging.display()
        );
    }
    Ok(())
}

fn cleanup_published(albums: &[PublishedAlbum], root: &Path) -> Vec<String> {
    let mut errors = Vec::new();
    for album in albums.iter().rev() {
        match published_album_is_owned_and_unchanged(album) {
            Ok(true) => {}
            Ok(false) => {
                errors.push(format!(
                    "{} was retained because it changed after Aurora published it",
                    album.destination.display()
                ));
                continue;
            }
            Err(error) => {
                match album.destination.try_exists() {
                    Ok(false) => continue,
                    Ok(true) => errors.push(format!(
                        "{} could not be verified before compensation: {error:#}",
                        album.destination.display()
                    )),
                    Err(existence_error) => errors.push(format!(
                        "{} existence could not be verified before compensation: {existence_error}",
                        album.destination.display()
                    )),
                }
                continue;
            }
        }
        if let Err(error) = remove_created_directory(&album.destination, root) {
            errors.push(format!("{}: {error:#}", album.destination.display()));
        }
    }
    errors
}

fn published_album_is_owned_and_unchanged(album: &PublishedAlbum) -> Result<bool> {
    Ok(
        has_staging_owner(&album.destination, &album.plan_id, album.index)?
            && inventory_without_owner_marker(&album.destination)? == album.inventory,
    )
}

fn inventory_is_safe_subset(folder: &Path, expected: &FolderInventory) -> Result<bool> {
    let actual = inventory_without_owner_marker(folder)?;
    let expected_directories = expected.directories.iter().collect::<BTreeSet<_>>();
    let expected_files = expected
        .files
        .iter()
        .map(|file| (&file.relative_path, file))
        .collect::<std::collections::BTreeMap<_, _>>();
    if actual
        .directories
        .iter()
        .any(|directory| !expected_directories.contains(directory))
    {
        return Ok(false);
    }
    for file in &actual.files {
        let Some(expected_file) = expected_files.get(&file.relative_path) else {
            return Ok(false);
        };
        if *expected_file != file {
            return Ok(false);
        }
    }
    Ok(true)
}

fn remove_created_directory(path: &Path, root: &Path) -> Result<()> {
    if path.parent().map(normalized_path) != Some(normalized_path(root)) {
        bail!(
            "Refusing to remove a path outside the category root: {}",
            path.display()
        );
    }
    if path.try_exists().with_context(|| {
        format!(
            "Could not determine whether app-created folder exists: {}",
            path.display()
        )
    })? {
        fs::remove_dir_all(path)
            .with_context(|| format!("Could not remove app-created folder {}", path.display()))?;
    }
    Ok(())
}

fn validate_stored_plan(plan: &StoredPlan, request: &ApplyBatchRequest) -> Result<()> {
    if plan.format_version != PLAN_FORMAT_VERSION
        || plan.plan_id != request.plan_id
        || plan.session_id != request.session_id
    {
        bail!("The Aurora intake plan does not match this apply request. Prepare the batch again");
    }
    if plan.albums.is_empty() {
        bail!("The Aurora intake plan contains no albums");
    }
    validate_plan_id(&plan.plan_id)
}

fn validate_plan_id(plan_id: &str) -> Result<()> {
    if plan_id.len() != 24 || !plan_id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        bail!("The Aurora intake plan id is invalid");
    }
    Ok(())
}

fn validate_relative_path(path: &Path) -> Result<()> {
    if path.as_os_str().is_empty()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        bail!(
            "Unsafe relative path in Aurora intake plan: {}",
            path.display()
        );
    }
    Ok(())
}

fn open_database(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)
        .with_context(|| format!("Could not open Music Library database {}", path.display()))?;
    db::configure(&conn)?;
    db::migrate(&conn)?;
    Ok(conn)
}

fn bridge_app_data_dir() -> Result<PathBuf> {
    let directory = if let Some(value) = std::env::var_os(APP_DATA_OVERRIDE) {
        let value = PathBuf::from(value);
        if !value.is_absolute() {
            bail!("{APP_DATA_OVERRIDE} must be an absolute directory path");
        }
        value
    } else {
        let app_data = std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .ok_or_else(|| anyhow!("APPDATA is unavailable"))?;
        app_data.join("com.local.musiclibrary")
    };
    fs::create_dir_all(&directory).with_context(|| {
        format!(
            "Could not create app data directory {}",
            directory.display()
        )
    })?;
    directory.canonicalize().with_context(|| {
        format!(
            "Could not resolve app data directory {}",
            directory.display()
        )
    })
}

fn plan_directory(app_data_dir: &Path, plan_id: &str) -> Result<PathBuf> {
    validate_plan_id(plan_id)?;
    Ok(app_data_dir
        .join(BRIDGE_DIRECTORY)
        .join("plans")
        .join(plan_id))
}

fn load_apply_journal(plan_directory: &Path) -> Result<Option<ApplyJournal>> {
    let path = plan_directory.join("apply-journal.json");
    if !path.try_exists()? {
        return Ok(None);
    }
    if !fs::metadata(&path)?.is_file() {
        bail!(
            "Aurora apply journal path is not a file: {}",
            path.display()
        );
    }
    let bytes = fs::read(&path)
        .with_context(|| format!("Could not read Aurora apply journal {}", path.display()))?;
    let journal: ApplyJournal = serde_json::from_slice(&bytes)
        .with_context(|| format!("Could not parse Aurora apply journal {}", path.display()))?;
    if journal.format_version != PLAN_FORMAT_VERSION {
        bail!("Aurora apply journal version is unsupported");
    }
    Ok(Some(journal))
}

fn write_apply_journal(path: &Path, plan_id: &str, phase: &str) -> Result<()> {
    atomic_write_json(
        path,
        &ApplyJournal {
            format_version: PLAN_FORMAT_VERSION,
            plan_id: plan_id.to_owned(),
            phase: phase.to_owned(),
        },
    )
}

fn cleanup_abandoned_bridge_plans(conn: &Connection, app_data_dir: &Path) -> Result<()> {
    let plans_root = app_data_dir.join(BRIDGE_DIRECTORY).join("plans");
    if !plans_root.try_exists()? {
        fs::create_dir_all(&plans_root)?;
    } else if !fs::metadata(&plans_root)?.is_dir() {
        bail!(
            "Aurora bridge plans path is not a directory: {}",
            plans_root.display()
        );
    }
    let mut planned_sessions = BTreeSet::new();
    for entry in fs::read_dir(&plans_root)
        .with_context(|| format!("Could not inspect bridge plans {}", plans_root.display()))?
    {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let plan_path = entry.path().join("plan.json");
        if !plan_path.try_exists()? {
            let removable = fs::read_dir(entry.path())?.all(|item| {
                item.ok()
                    .is_some_and(|item| item.file_name().to_string_lossy().ends_with(".writing"))
            });
            if removable {
                let _ = fs::remove_dir_all(entry.path());
            }
            continue;
        }
        if !fs::metadata(&plan_path)?.is_file() {
            bail!("Aurora plan path is not a file: {}", plan_path.display());
        }
        let bytes = fs::read(&plan_path)?;
        let plan: StoredPlan = serde_json::from_slice(&bytes).with_context(|| {
            format!("Could not parse prior Aurora plan {}", plan_path.display())
        })?;
        let directory_id = entry.file_name().to_string_lossy().to_string();
        if plan.plan_id != directory_id {
            bail!("Aurora recovery plan id does not match its plan directory");
        }
        planned_sessions.insert(plan.session_id);
        let state = match importer::bridge_session_state_optional(conn, plan.session_id)? {
            Some(state) => state,
            None => {
                if load_apply_journal(&entry.path())?.is_some() {
                    bail!(
                        "A prior journaled Aurora intake has no catalog session; its destinations and recovery plan were retained for manual retry"
                    );
                }
                remove_snapshot_artifacts(Path::new(&plan.snapshot_path));
                fs::remove_dir_all(entry.path())?;
                continue;
            }
        };
        if state.status == "completed" {
            continue;
        }
        validate_plan_session_binding(&plan, &state)?;
        compensate_abandoned_plan_files(&plan, &entry.path())?;
        importer::discard_bridge_import_preview(conn, plan.session_id)?;
        remove_snapshot_artifacts(Path::new(&plan.snapshot_path));
        fs::remove_dir_all(entry.path())?;
    }
    for (session_id, source_path) in importer::noncompleted_bridge_sessions(conn)? {
        if planned_sessions.contains(&session_id) || !is_bridge_batch_snapshot_path(&source_path) {
            continue;
        }
        importer::discard_bridge_import_preview(conn, session_id)?;
        remove_snapshot_artifacts(Path::new(&source_path));
    }
    Ok(())
}

fn compensate_abandoned_plan_files(plan: &StoredPlan, plan_directory: &Path) -> Result<()> {
    if load_apply_journal(plan_directory)?.is_none() {
        return Ok(());
    }
    let root = PathBuf::from(&plan.destination_root);
    let mut published = Vec::new();
    for (index, album) in plan.albums.iter().enumerate() {
        let destination = PathBuf::from(&album.destination_path);
        if destination.try_exists().with_context(|| {
            format!(
                "Could not determine whether prior destination exists: {}",
                destination.display()
            )
        })? {
            published.push(PublishedAlbum {
                destination,
                inventory: album.inventory.clone(),
                plan_id: plan.plan_id.clone(),
                index,
            });
        }
    }
    let cleanup_errors = cleanup_published(&published, &root);
    if !cleanup_errors.is_empty() {
        bail!(
            "A prior Aurora intake has changed destination files and cannot be discarded safely: {}",
            cleanup_errors.join("; ")
        );
    }
    for (index, album) in plan.albums.iter().enumerate() {
        let staging = root.join(format!(".aurora-intake-{}-{index:03}", plan.plan_id));
        if staging.try_exists().with_context(|| {
            format!(
                "Could not determine whether prior staging folder exists: {}",
                staging.display()
            )
        })? {
            if !has_staging_owner(&staging, &plan.plan_id, index)?
                || !inventory_is_safe_subset(&staging, &album.inventory)?
            {
                bail!(
                    "A prior Aurora staging folder changed and cannot be discarded safely: {}",
                    staging.display()
                );
            }
            remove_created_directory(&staging, &root)?;
        }
    }
    Ok(())
}

fn is_bridge_batch_snapshot_path(source_path: &str) -> bool {
    let path = Path::new(source_path);
    path.parent()
        .and_then(Path::file_name)
        .and_then(|value| value.to_str())
        == Some("album-folder-imports")
        && path
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|value| {
                value.starts_with("album-folder-batch-") && value.ends_with(".tsv")
            })
}

fn new_plan_id(source: &Path, category: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(normalized_path(source).as_bytes());
    hasher.update(category.as_bytes());
    hasher.update(std::process::id().to_le_bytes());
    hasher.update(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
            .to_le_bytes(),
    );
    hex::encode(hasher.finalize())[..24].to_owned()
}

fn remove_snapshot_artifacts(snapshot: &Path) {
    let valid_name = snapshot
        .file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.starts_with("album-folder-batch-") && value.ends_with(".tsv"));
    let valid_parent = snapshot
        .parent()
        .and_then(Path::file_name)
        .and_then(|value| value.to_str())
        == Some("album-folder-imports");
    if !valid_name || !valid_parent {
        return;
    }
    let _ = fs::remove_file(snapshot);
    let _ = fs::remove_file(snapshot.with_extension("manifest.json"));
    let _ = fs::remove_file(snapshot.with_extension("tsv.building"));
}

fn hash_file(path: &Path) -> Result<String> {
    let mut file = File::open(path)
        .with_context(|| format!("Could not read file for verification {}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn hash_framed(hasher: &mut Sha256, kind: u8, value: &[u8]) {
    hasher.update([kind]);
    hasher.update((value.len() as u64).to_le_bytes());
    hasher.update(value);
}

fn atomic_write_json(path: &Path, value: &impl Serialize) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| anyhow!("JSON output path has no parent directory"))?;
    fs::create_dir_all(parent).with_context(|| {
        format!(
            "Could not create JSON output directory {}",
            parent.display()
        )
    })?;
    let temporary = parent.join(format!(
        ".{}.{}.writing",
        path.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("bridge.json"),
        std::process::id()
    ));
    let bytes = serde_json::to_vec_pretty(value)?;
    let mut file = File::create(&temporary)
        .with_context(|| format!("Could not create JSON work file {}", temporary.display()))?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    drop(file);
    replace_file_atomically(&temporary, path)
}

#[cfg(windows)]
fn replace_file_atomically(temporary: &Path, destination: &Path) -> Result<()> {
    use std::os::windows::ffi::OsStrExt;
    const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x8;
    #[link(name = "Kernel32")]
    extern "system" {
        fn MoveFileExW(existing: *const u16, destination: *const u16, flags: u32) -> i32;
    }
    let source = temporary
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let target = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let success = unsafe {
        MoveFileExW(
            source.as_ptr(),
            target.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if success == 0 {
        return Err(std::io::Error::last_os_error()).with_context(|| {
            format!(
                "Could not atomically publish JSON output {}",
                destination.display()
            )
        });
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace_file_atomically(temporary: &Path, destination: &Path) -> Result<()> {
    fs::rename(temporary, destination).with_context(|| {
        format!(
            "Could not atomically publish JSON output {}",
            destination.display()
        )
    })
}

fn paths_overlap(left: &Path, right: &Path) -> bool {
    let left = normalized_path(left);
    let right = normalized_path(right);
    left == right || left.starts_with(&(right.clone() + "\\")) || right.starts_with(&(left + "\\"))
}

fn normalized_path(path: &Path) -> String {
    display_path(path)
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase()
}

fn display_path(path: &Path) -> String {
    let value = path.display().to_string();
    if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else {
        value.strip_prefix(r"\\?\").unwrap_or(&value).to_owned()
    }
}

fn bridge_error_code(error: &anyhow::Error) -> &'static str {
    let message = format!("{error:#}").to_lowercase();
    if message.contains("protocol version") {
        "unsupportedProtocol"
    } else if message.contains("unknown aurora bridge operation")
        || message.contains("payload must contain")
        || message.contains("could not parse bridge request")
    {
        "invalidRequest"
    } else if message.contains("category") && message.contains("unknown") {
        "invalidCategory"
    } else if message.contains("changed after preview") || message.contains("plan") {
        "stalePlan"
    } else if message.contains("copy")
        || message.contains("transfer")
        || message.contains("destination")
    {
        "transferFailed"
    } else if message.contains("import") || message.contains("catalog apply") {
        "importFailed"
    } else {
        "validationFailed"
    }
}

#[cfg(windows)]
fn set_hidden(path: &Path, hidden: bool) -> Result<()> {
    use std::os::windows::ffi::OsStrExt;
    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    const INVALID_FILE_ATTRIBUTES: u32 = u32::MAX;
    #[link(name = "Kernel32")]
    extern "system" {
        fn GetFileAttributesW(lp_file_name: *const u16) -> u32;
        fn SetFileAttributesW(lp_file_name: *const u16, file_attributes: u32) -> i32;
    }
    let wide = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let attributes = unsafe { GetFileAttributesW(wide.as_ptr()) };
    if attributes == INVALID_FILE_ATTRIBUTES {
        return Err(std::io::Error::last_os_error()).with_context(|| {
            format!(
                "Could not inspect staging attributes for {}",
                path.display()
            )
        });
    }
    let updated = if hidden {
        attributes | FILE_ATTRIBUTE_HIDDEN
    } else {
        attributes & !FILE_ATTRIBUTE_HIDDEN
    };
    let success = unsafe { SetFileAttributesW(wide.as_ptr(), updated) };
    if success == 0 {
        return Err(std::io::Error::last_os_error())
            .with_context(|| format!("Could not hide staging folder {}", path.display()));
    }
    Ok(())
}

#[cfg(not(windows))]
fn set_hidden(_path: &Path, _hidden: bool) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn test_plan(root: &Path, source: &Path, destinations: &[&str]) -> StoredPlan {
        let albums = destinations
            .iter()
            .enumerate()
            .map(|(index, name)| {
                let album_source = source.join(format!("Album {index}"));
                fs::create_dir_all(album_source.join("Disc 2")).expect("source directories");
                fs::write(album_source.join("01.mp3"), [0_u8, 1, 2, 3]).expect("track");
                fs::write(album_source.join("Disc 2").join("02.mp3"), [4_u8, 5, 6])
                    .expect("disc track");
                fs::write(album_source.join("cover.jpg"), [7_u8, 8]).expect("cover");
                StoredAlbum {
                    source_path: display_path(&album_source),
                    destination_path: display_path(&root.join(name)),
                    artist: "Artist".to_owned(),
                    album: format!("Album {index}"),
                    year: "2026".to_owned(),
                    track_count: 2,
                    inventory: inventory_folder(&album_source).expect("inventory"),
                }
            })
            .collect();
        StoredPlan {
            format_version: PLAN_FORMAT_VERSION,
            plan_id: "0123456789abcdef01234567".to_owned(),
            session_id: 1,
            source_path: display_path(source),
            category: "scores".to_owned(),
            category_label: "Movie / TV / game music".to_owned(),
            destination_root: display_path(root),
            snapshot_path: "snapshot.tsv".to_owned(),
            albums,
        }
    }

    fn sync_scope_database() -> Connection {
        let conn = Connection::open_in_memory().expect("sync scope database");
        conn.execute_batch(
            "
            CREATE TABLE tracks (
                file_path TEXT, filename TEXT, album_id TEXT,
                album_unique_id TEXT, row_hash TEXT
            );
            CREATE TABLE import_stage_tracks (
                session_id INTEGER, file_path TEXT, filename TEXT,
                album_id TEXT, album_unique_id TEXT, row_hash TEXT
            );
            CREATE TABLE albums (
                id TEXT PRIMARY KEY,
                album_unique_id TEXT,
                album TEXT,
                album_artist_display TEXT,
                canonical_genre TEXT,
                genre_normalized TEXT,
                publisher TEXT,
                year INTEGER,
                release_year INTEGER,
                total_tracks INTEGER NOT NULL DEFAULT 1,
                rated_tracks INTEGER NOT NULL DEFAULT 0,
                rating_completeness REAL NOT NULL DEFAULT 0,
                total_seconds INTEGER NOT NULL DEFAULT 0,
                loved_tracks INTEGER NOT NULL DEFAULT 0,
                tmoe_seconds INTEGER NOT NULL DEFAULT 0,
                ae_ratio REAL NOT NULL DEFAULT 0,
                album_rating INTEGER,
                calculated_album_rating INTEGER,
                effective_album_rating INTEGER,
                album_score REAL
            );
            CREATE TABLE import_stage_albums (
                session_id INTEGER,
                album_id TEXT,
                album_unique_id TEXT,
                album TEXT,
                final_album_artist_display TEXT,
                canonical_genre TEXT,
                genre_normalized TEXT,
                publisher TEXT,
                year INTEGER,
                release_year INTEGER,
                total_tracks INTEGER NOT NULL DEFAULT 1,
                rated_tracks INTEGER NOT NULL DEFAULT 0,
                rating_completeness REAL NOT NULL DEFAULT 0,
                total_seconds INTEGER NOT NULL DEFAULT 0,
                loved_tracks INTEGER NOT NULL DEFAULT 0,
                tmoe_seconds INTEGER NOT NULL DEFAULT 0,
                ae_ratio REAL NOT NULL DEFAULT 0,
                album_rating INTEGER,
                calculated_album_rating INTEGER,
                effective_album_rating INTEGER,
                album_score REAL
            );
            ",
        )
        .expect("sync scope schema");
        conn
    }

    #[test]
    fn sync_request_uses_bounded_deduplicated_absolute_library_folders() {
        let temp = tempdir().expect("tempdir");
        let root = temp.path().join("library");
        let album = root.join("Album");
        let outside = temp.path().join("outside");
        fs::create_dir_all(&album).expect("album folder");
        fs::create_dir(&outside).expect("outside folder");
        let root = root.canonicalize().expect("canonical root");
        let album = album.canonicalize().expect("canonical album");

        let request: SyncExistingFoldersRequest = serde_json::from_value(json!({
            "folderPaths": [display_path(&album), display_path(&album)]
        }))
        .expect("sync request");
        assert!(request.changed_file_paths.is_empty());
        let folders = canonicalize_sync_folder_paths(request.folder_paths, &[root])
            .expect("deduplicated folders");
        assert_eq!(folders, vec![album]);

        let relative = canonicalize_sync_folder_paths(vec!["Album".to_owned()], &folders)
            .expect_err("relative path");
        assert!(relative.to_string().contains("absolute"));
        let outside = canonicalize_sync_folder_paths(
            vec![display_path(
                &outside.canonicalize().expect("canonical outside"),
            )],
            &folders,
        )
        .expect_err("outside path");
        assert!(outside.to_string().contains("outside every configured"));
    }

    #[test]
    fn sync_request_accepts_additive_changed_file_paths_without_a_protocol_bump() {
        let request: SyncExistingFoldersRequest = serde_json::from_value(json!({
            "folderPaths": [r"G:\Scores\Album"],
            "changedFilePaths": [r"G:\Scores\Album\01.mp3"]
        }))
        .expect("additive exact-file request");

        assert_eq!(request.folder_paths, vec![r"G:\Scores\Album"]);
        assert_eq!(request.changed_file_paths, vec![r"G:\Scores\Album\01.mp3"]);
        assert_eq!(PROTOCOL_VERSION, 1);
    }

    #[test]
    fn changed_file_target_is_canonical_regular_mp3_inside_the_requested_folder() {
        let temp = tempdir().expect("tempdir");
        let root = temp.path().join("library");
        let album = root.join("Album");
        let outside = temp.path().join("outside.mp3");
        fs::create_dir_all(&album).expect("album folder");
        let target = album.join("01.mp3");
        fs::write(&target, b"mp3").expect("target mp3");
        fs::write(&outside, b"outside").expect("outside mp3");
        let root = root.canonicalize().expect("canonical root");
        let album = album.canonicalize().expect("canonical album");
        let target = target.canonicalize().expect("canonical target");

        let selected = canonicalize_changed_file_target(
            vec![display_path(&target), display_path(&target)],
            std::slice::from_ref(&album),
            std::slice::from_ref(&root),
        )
        .expect("valid exact-file target")
        .expect("one deduplicated target");
        assert_eq!(selected, (0, target));

        let relative = canonicalize_changed_file_target(
            vec!["01.mp3".to_owned()],
            std::slice::from_ref(&album),
            std::slice::from_ref(&root),
        )
        .expect_err("relative target");
        assert!(relative.to_string().contains("absolute"));
        let outside = canonicalize_changed_file_target(
            vec![display_path(
                &outside.canonicalize().expect("canonical outside"),
            )],
            std::slice::from_ref(&album),
            std::slice::from_ref(&root),
        )
        .expect_err("outside target");
        assert!(outside.to_string().contains("outside"));
        let non_mp3 = canonicalize_changed_file_target(
            vec![display_path(&album.join("cover.jpg"))],
            std::slice::from_ref(&album),
            std::slice::from_ref(&root),
        )
        .expect_err("non-MP3 target");
        assert!(non_mp3.to_string().contains("only accepts MP3"));
        assert!(canonicalize_changed_file_target(
            vec![display_path(&album.join("missing.mp3"))],
            std::slice::from_ref(&album),
            std::slice::from_ref(&root),
        )
        .expect("missing target falls back")
        .is_none());
    }

    #[test]
    fn sync_request_count_is_bounded_before_database_or_filesystem_work() {
        let temp = tempdir().expect("tempdir");
        let request = SyncExistingFoldersRequest {
            folder_paths: vec!["C:\\Music\\Album".to_owned(); MAX_SYNC_FOLDERS + 1],
            changed_file_paths: Vec::new(),
        };

        let error = sync_existing_folders(temp.path(), request).expect_err("bounded request");

        assert!(error.to_string().contains("at most"));
        assert!(!temp.path().join("music-library.sqlite3").exists());
    }

    #[test]
    fn capabilities_advertise_existing_folder_sync() {
        let result = capabilities().expect("capabilities");
        assert_eq!(result["supports"]["syncExistingFolders"], true);
        assert_eq!(result["supports"]["targetedExistingFileSync"], true);
        assert_eq!(result["supports"]["defaultPopmRatingFallback"], true);
        assert_eq!(result["supports"]["serviceExistingFolderSync"], true);
    }

    #[cfg(windows)]
    #[test]
    fn existing_folder_sync_matches_verbatim_paths_without_probing_the_parent_root() {
        let root = PathBuf::from(r"Z:\definitely-missing-music-library-root");
        let categories = [CategoryDefinition {
            id: "test",
            label: "Test music",
            root: root.clone(),
        }];
        let requested_paths =
            vec![r"\\?\Z:\definitely-missing-music-library-root\Artist - Album".to_owned()];

        let roots = configured_library_roots_from_categories(&requested_paths, &categories)
            .expect("verbatim drive paths should match without root enumeration");

        assert_eq!(roots, vec![root]);
    }

    #[test]
    fn sync_cleanup_ownership_is_bound_to_the_current_app_data_directory() {
        let temp = tempdir().expect("tempdir");
        let app_data = temp.path().join("current");
        let external = temp.path().join("external");
        let name = format!("{SYNC_SNAPSHOT_PREFIX}0123456789abcdef01234567.tsv");
        let owned = app_data.join("album-folder-imports").join(&name);
        let foreign = external.join("album-folder-imports").join(name);

        assert!(is_bridge_sync_snapshot_path(&app_data, &owned));
        assert!(!is_bridge_sync_snapshot_path(&app_data, &foreign));
    }

    #[test]
    fn deprecated_sync_backups_are_pruned_without_touching_regular_backups() {
        let temp = tempdir().expect("tempdir");
        let app_data = temp.path().join("app-data");
        let backup_directory = app_data.join("backups");
        fs::create_dir_all(&backup_directory).expect("backup directory");
        let database = app_data.join("music-library.sqlite3");
        let old = backup_directory.join(format!(
            "{DEPRECATED_SYNC_BACKUP_PREFIX}abcdef0123456789abcdef01{DEPRECATED_SYNC_BACKUP_SUFFIX}"
        ));
        let current = backup_directory.join(format!(
            "{DEPRECATED_SYNC_BACKUP_PREFIX}abcdef0123456789abcdef02{DEPRECATED_SYNC_BACKUP_SUFFIX}"
        ));
        let regular = backup_directory.join("music-library-20260824-before-import.sqlite3");
        fs::write(&old, b"old deprecated backup").expect("old backup");
        std::thread::sleep(std::time::Duration::from_millis(20));
        fs::write(&current, b"current deprecated backup").expect("current backup");
        fs::write(&regular, b"regular backup").expect("regular backup");

        assert_eq!(prune_deprecated_sync_backups(&database, 1).unwrap(), 1);
        assert!(!old.exists());
        assert!(current.is_file());
        assert!(regular.is_file());
    }

    #[test]
    fn existing_folder_delta_changes_only_its_album_and_preserves_identity() {
        let temp = tempdir().expect("tempdir");
        let album = temp.path().join("library").join("Album");
        let other = temp.path().join("library").join("Other");
        fs::create_dir_all(&album).expect("album folder");
        fs::create_dir_all(&other).expect("other folder");
        let album = album.canonicalize().expect("canonical album");
        let other = other.canonicalize().expect("canonical other");
        let conn = sync_scope_database();
        conn.execute(
            "INSERT INTO tracks VALUES (?1, '01.mp3', 'album-1', 'uid-1', 'old-inside')",
            [display_path(&album)],
        )
        .expect("inside track");
        conn.execute(
            "INSERT INTO tracks VALUES (?1, '01.mp3', 'album-2', 'uid-2', 'same-outside')",
            [display_path(&other)],
        )
        .expect("outside track");
        conn.execute(
            "INSERT INTO import_stage_tracks VALUES (7, ?1, '01.mp3', 'album-1', 'uid-1', 'new-inside')",
            [display_path(&album)],
        )
        .expect("staged inside track");
        conn.execute(
            "INSERT INTO import_stage_tracks VALUES (7, ?1, '01.mp3', 'album-2', 'uid-2', 'same-outside')",
            [display_path(&other)],
        )
        .expect("staged outside track");
        conn.execute(
            "INSERT INTO albums (id, album_unique_id, album) VALUES ('album-1', 'uid-1', 'Original'), ('album-2', 'uid-2', 'Other')",
            [],
        )
        .expect("catalog albums");
        conn.execute(
            "INSERT INTO import_stage_albums (session_id, album_id, album_unique_id, album) VALUES (7, 'album-1', 'uid-1', 'Updated'), (7, 'album-2', 'uid-2', 'Other')",
            [],
        )
        .expect("staged albums");

        let scope = catalog_scope_for_existing_folder(&conn, album).expect("catalog scope");
        assert_eq!(scope.album_id, "album-1");
        assert_eq!(scope.track_count, 1);
        let counts = SyncDeltaCounts {
            added_tracks: 0,
            changed_tracks: 1,
            removed_tracks: 0,
            added_albums: 0,
            changed_albums: 1,
            removed_albums: 0,
        };
        validate_sync_delta_counts(&counts, scope.track_count).expect("metadata-only delta");
        validate_staged_sync_scope(
            &conn,
            7,
            &scope,
            counts.changed_tracks,
            counts.changed_albums,
        )
        .expect("scoped staged delta");
    }

    #[test]
    fn existing_folder_delta_rejects_outside_changes_and_identity_churn() {
        let temp = tempdir().expect("tempdir");
        let album = temp.path().join("library").join("Album");
        let other = temp.path().join("library").join("Other");
        fs::create_dir_all(&album).expect("album folder");
        fs::create_dir_all(&other).expect("other folder");
        let album = album.canonicalize().expect("canonical album");
        let other = other.canonicalize().expect("canonical other");
        let conn = sync_scope_database();
        conn.execute(
            "INSERT INTO tracks VALUES (?1, '01.mp3', 'album-1', 'uid-1', 'old-inside')",
            [display_path(&album)],
        )
        .expect("inside track");
        conn.execute(
            "INSERT INTO tracks VALUES (?1, '01.mp3', 'album-2', 'uid-2', 'old-outside')",
            [display_path(&other)],
        )
        .expect("outside track");
        conn.execute(
            "INSERT INTO import_stage_tracks VALUES (8, ?1, '01.mp3', 'album-1', 'uid-1', 'new-inside')",
            [display_path(&album)],
        )
        .expect("staged inside track");
        conn.execute(
            "INSERT INTO import_stage_tracks VALUES (8, ?1, '01.mp3', 'album-2', 'uid-2', 'new-outside')",
            [display_path(&other)],
        )
        .expect("staged outside track");
        conn.execute(
            "INSERT INTO albums (id, album_unique_id, album) VALUES ('album-1', 'uid-1', 'Original'), ('album-2', 'uid-2', 'Other')",
            [],
        )
        .expect("catalog albums");
        conn.execute(
            "INSERT INTO import_stage_albums (session_id, album_id, album_unique_id, album) VALUES (8, 'album-1', 'uid-1', 'Original'), (8, 'album-2', 'uid-2', 'Other')",
            [],
        )
        .expect("staged albums");
        let scope = catalog_scope_for_existing_folder(&conn, album).expect("catalog scope");

        let outside_error =
            validate_staged_sync_scope(&conn, 8, &scope, 2, 0).expect_err("outside catalog change");
        assert!(outside_error.to_string().contains("outside its folder"));

        conn.execute(
            "UPDATE import_stage_tracks SET row_hash = 'old-outside' WHERE session_id = 8 AND album_id = 'album-2'",
            [],
        )
        .expect("restore outside row");
        conn.execute(
            "UPDATE import_stage_albums SET album = 'Changed other' WHERE session_id = 8 AND album_id = 'album-2'",
            [],
        )
        .expect("change outside album");
        let outside_album_error =
            validate_staged_sync_scope(&conn, 8, &scope, 1, 1).expect_err("outside album change");
        assert!(outside_album_error
            .to_string()
            .contains("album outside its folder"));
        conn.execute(
            "UPDATE import_stage_albums SET album = 'Other' WHERE session_id = 8 AND album_id = 'album-2'",
            [],
        )
        .expect("restore outside album");
        conn.execute(
            "UPDATE import_stage_tracks SET album_id = 'different-album' WHERE session_id = 8 AND file_path = ?1",
            [display_path(&scope.folder)],
        )
        .expect("change identity");
        let identity_error =
            validate_staged_sync_scope(&conn, 8, &scope, 1, 0).expect_err("identity churn");
        assert!(identity_error.to_string().contains("identity"));
    }

    #[test]
    fn existing_folder_delta_rejects_added_or_removed_rows_but_allows_retry_noop() {
        let invalid = SyncDeltaCounts {
            added_tracks: 1,
            changed_tracks: 0,
            removed_tracks: 0,
            added_albums: 0,
            changed_albums: 0,
            removed_albums: 0,
        };
        let error = validate_sync_delta_counts(&invalid, 1).expect_err("added track rejected");
        assert!(error
            .to_string()
            .contains("added tracks: 1, removed tracks: 0, added albums: 0, removed albums: 0"));

        let retry = SyncDeltaCounts {
            added_tracks: 0,
            changed_tracks: 0,
            removed_tracks: 0,
            added_albums: 0,
            changed_albums: 0,
            removed_albums: 0,
        };
        validate_sync_delta_counts(&retry, 1).expect("idempotent retry no-op");
    }

    #[test]
    fn copy_transfer_preserves_names_disc_paths_and_every_byte() {
        let temp = tempdir().expect("tempdir");
        let root = temp.path().join("library");
        let source = temp.path().join("inbox");
        fs::create_dir_all(&root).expect("root");
        fs::create_dir_all(&source).expect("source");
        let plan = test_plan(&root, &source, &["Final album"]);
        let before = plan.albums[0].inventory.clone();

        let published = stage_and_publish(&plan, None).expect("publish");

        assert_eq!(published.len(), 1);
        assert_eq!(
            inventory_without_owner_marker(&root.join("Final album"))
                .expect("destination inventory"),
            before
        );
        assert!(
            has_staging_owner(&root.join("Final album"), &plan.plan_id, 0).expect("owner marker"),
            "the owner marker remains until catalog commit"
        );
        assert!(root
            .join("Final album")
            .join("Disc 2")
            .join("02.mp3")
            .is_file());
        assert!(
            Path::new(&plan.albums[0].source_path).is_dir(),
            "source stays until DB commit"
        );
    }

    #[test]
    fn transfer_failure_compensates_published_destinations_and_keeps_sources() {
        let temp = tempdir().expect("tempdir");
        let root = temp.path().join("library");
        let source = temp.path().join("inbox");
        fs::create_dir_all(&root).expect("root");
        fs::create_dir_all(&source).expect("source");
        let plan = test_plan(&root, &source, &["First", "Second"]);

        let error = stage_and_publish(&plan, Some(0)).expect_err("injected failure");

        assert!(error.to_string().contains("Injected transfer failure"));
        assert!(!root.join("First").exists());
        assert!(!root.join("Second").exists());
        assert!(Path::new(&plan.albums[0].source_path).is_dir());
        assert!(Path::new(&plan.albums[1].source_path).is_dir());
    }

    #[test]
    fn source_mutation_after_copy_prevents_deletion_and_compensates_exact_copy() {
        let temp = tempdir().expect("tempdir");
        let root = temp.path().join("library");
        let source = temp.path().join("inbox");
        fs::create_dir_all(&root).expect("root");
        fs::create_dir_all(&source).expect("source");
        let plan = test_plan(&root, &source, &["Final"]);
        let published = stage_and_publish(&plan, None).expect("publish");
        fs::write(
            Path::new(&plan.albums[0].source_path).join("late-file.txt"),
            b"arrived during copy",
        )
        .expect("mutate source");

        assert!(validate_source_inventories(&plan).is_err());
        assert!(cleanup_published(&published, &root).is_empty());
        assert!(!root.join("Final").exists());
        assert!(Path::new(&plan.albums[0].source_path).is_dir());
    }

    #[test]
    fn compensation_never_removes_a_destination_changed_after_publish() {
        let temp = tempdir().expect("tempdir");
        let root = temp.path().join("library");
        let source = temp.path().join("inbox");
        fs::create_dir_all(&root).expect("root");
        fs::create_dir_all(&source).expect("source");
        let plan = test_plan(&root, &source, &["Final"]);
        let published = stage_and_publish(&plan, None).expect("publish");
        fs::write(root.join("Final").join("external.txt"), b"do not delete")
            .expect("external destination change");

        let errors = cleanup_published(&published, &root);

        assert_eq!(errors.len(), 1);
        assert!(root.join("Final").join("external.txt").is_file());
        assert!(Path::new(&plan.albums[0].source_path).is_dir());
    }

    #[test]
    fn identical_unowned_destination_is_never_reused_or_compensated() {
        let temp = tempdir().expect("tempdir");
        let root = temp.path().join("library");
        let source = temp.path().join("inbox");
        fs::create_dir_all(&root).expect("root");
        fs::create_dir_all(&source).expect("source");
        let plan = test_plan(&root, &source, &["Final"]);
        let destination = root.join("Final");
        fs::create_dir(&destination).expect("external destination");
        copy_inventory(
            Path::new(&plan.albums[0].source_path),
            &destination,
            &plan.albums[0].inventory,
        )
        .expect("identical external copy");

        assert!(validate_apply_destinations(&root, &plan, true).is_err());
        assert!(stage_and_publish(&plan, None).is_err());
        assert!(destination.is_dir(), "unowned destination must remain");
        assert_eq!(
            inventory_folder(&destination).expect("external inventory"),
            plan.albums[0].inventory
        );
    }

    #[test]
    fn abandoned_journal_recovery_removes_only_verified_destinations_and_stage_rows() {
        let temp = tempdir().expect("tempdir");
        let app_data = temp.path().join("app-data");
        let root = temp.path().join("library");
        let source = temp.path().join("inbox");
        fs::create_dir_all(&app_data).expect("app data");
        fs::create_dir_all(&root).expect("root");
        fs::create_dir_all(&source).expect("source");
        let mut plan = test_plan(&root, &source, &["Recovered"]);
        let snapshot = app_data
            .join("album-folder-imports")
            .join(format!("album-folder-batch-{}.tsv", plan.plan_id));
        fs::create_dir_all(snapshot.parent().unwrap()).expect("snapshot dir");
        fs::write(&snapshot, b"snapshot").expect("snapshot");
        plan.snapshot_path = display_path(&snapshot);
        let manifest = json!({
            "formatVersion": 2,
            "sourcePath": plan.source_path,
            "catalogFingerprint": {"digest": "test", "trackCount": 0, "completedImportRevision": 0},
            "albums": plan.albums.iter().map(|album| json!({
                "sourcePath": album.source_path,
                "sourceFingerprint": {"digest": "test", "fileCount": album.track_count, "totalBytes": 0},
                "destinationPath": album.destination_path,
            })).collect::<Vec<_>>(),
        });
        atomic_write_json(&snapshot.with_extension("manifest.json"), &manifest).expect("manifest");
        let conn = open_database(&app_data.join("music-library.sqlite3")).expect("database");
        conn.execute(
            "INSERT INTO import_sessions (source_path, source_size_bytes, source_modified_ms, status, added_tracks, added_albums, created_at, updated_at) VALUES (?1, 8, 0, 'ready', 2, 1, 'now', 'now')",
            [&plan.snapshot_path],
        )
        .expect("session");
        plan.session_id = conn.last_insert_rowid();
        let plan_dir = plan_directory(&app_data, &plan.plan_id).expect("plan dir");
        fs::create_dir_all(&plan_dir).expect("plan dir create");
        atomic_write_json(&plan_dir.join("plan.json"), &plan).expect("plan file");
        write_apply_journal(
            &plan_dir.join("apply-journal.json"),
            &plan.plan_id,
            "copying",
        )
        .expect("journal");
        stage_and_publish(&plan, None).expect("published before crash");
        assert!(root.join("Recovered").is_dir());

        cleanup_abandoned_bridge_plans(&conn, &app_data).expect("recover");

        assert!(!root.join("Recovered").exists());
        assert!(Path::new(&plan.albums[0].source_path).is_dir());
        assert!(!plan_dir.exists());
        let remaining: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM import_sessions WHERE id = ?1",
                [plan.session_id],
                |row| row.get(0),
            )
            .expect("session count");
        assert_eq!(remaining, 0);
    }

    #[test]
    fn committed_cleanup_retains_a_source_that_changed_after_catalog_commit() {
        let temp = tempdir().expect("tempdir");
        let root = temp.path().join("library");
        let source = temp.path().join("inbox");
        let plan_dir = temp.path().join("plan");
        fs::create_dir_all(&root).expect("root");
        fs::create_dir_all(&source).expect("source");
        fs::create_dir_all(&plan_dir).expect("plan dir");
        let plan = test_plan(&root, &source, &["Final"]);
        stage_and_publish(&plan, None).expect("publish");
        fs::write(
            Path::new(&plan.albums[0].source_path).join("late.txt"),
            b"keep me",
        )
        .expect("late source file");

        let response =
            finish_committed_plan(&plan, &plan_dir, 42, Some("backup.sqlite3".into()), vec![]);

        assert_eq!(response["status"], "completedWithWarnings");
        assert_eq!(response["movedAlbumCount"], 0);
        assert_eq!(response["albums"][0]["cleanupStatus"], "retained");
        assert!(Path::new(&plan.albums[0].source_path)
            .join("late.txt")
            .is_file());
        assert!(root.join("Final").is_dir());
    }

    #[test]
    fn committed_cleanup_quarantines_then_removes_an_unchanged_source_and_keeps_receipt() {
        let temp = tempdir().expect("tempdir");
        let root = temp.path().join("library");
        let source = temp.path().join("inbox");
        let plan_dir = temp.path().join("plan");
        fs::create_dir_all(&root).expect("root");
        fs::create_dir_all(&source).expect("source");
        fs::create_dir_all(&plan_dir).expect("plan dir");
        let plan = test_plan(&root, &source, &["Final"]);
        stage_and_publish(&plan, None).expect("publish");

        let response = finish_committed_plan(&plan, &plan_dir, 42, None, vec![]);

        assert_eq!(response["status"], "completed");
        assert_eq!(response["movedAlbumCount"], 1);
        assert!(!Path::new(&plan.albums[0].source_path).exists());
        assert!(
            plan_dir.is_dir(),
            "completed receipt remains durable for retry"
        );
    }

    #[test]
    fn destination_mapping_rejects_case_insensitive_album_collisions() {
        let temp = tempdir().expect("tempdir");
        let root = temp.path().join("library");
        let selected = temp.path().join("inbox");
        let first_parent = temp.path().join("one");
        let second_parent = temp.path().join("two");
        fs::create_dir_all(&root).expect("root");
        fs::create_dir_all(&selected).expect("selected");
        let first = first_parent.join("Album");
        let second = second_parent.join("ALBUM");
        fs::create_dir_all(&first).expect("first");
        fs::create_dir_all(&second).expect("second");

        let error = resolve_destination_mappings(&selected, &root, vec![first, second])
            .expect_err("case collision");

        assert!(error.to_string().contains("case-insensitive"));
    }

    #[test]
    fn inventory_detects_source_mutation() {
        let temp = tempdir().expect("tempdir");
        let album = temp.path().join("Album");
        fs::create_dir(&album).expect("album");
        let track = album.join("01.mp3");
        fs::write(&track, [1_u8, 2, 3]).expect("track");
        let before = inventory_folder(&album).expect("before");
        fs::write(&track, [1_u8, 2, 4]).expect("mutate");
        let after = inventory_folder(&album).expect("after");
        assert_ne!(before, after);
    }

    #[cfg(windows)]
    #[test]
    fn published_album_is_not_left_hidden() {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
        let temp = tempdir().expect("tempdir");
        let root = temp.path().join("library");
        let source = temp.path().join("inbox");
        fs::create_dir_all(&root).expect("root");
        fs::create_dir_all(&source).expect("source");
        let plan = test_plan(&root, &source, &["Visible album"]);
        stage_and_publish(&plan, None).expect("publish");
        let attributes = fs::metadata(root.join("Visible album"))
            .expect("metadata")
            .file_attributes();
        assert_eq!(attributes & FILE_ATTRIBUTE_HIDDEN, 0);
    }
}
