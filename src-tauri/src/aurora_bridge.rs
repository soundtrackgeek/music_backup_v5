use crate::folder_sync::{self, BatchAlbumInput};
use crate::{db, importer};
use anyhow::{anyhow, bail, Context, Result};
use rusqlite::Connection;
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
