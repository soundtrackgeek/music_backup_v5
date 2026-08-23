use crate::importer::REQUIRED_COLUMNS;
use crate::soulseek::soundcheck;
use anyhow::{anyhow, bail, Context, Result};
use csv::{QuoteStyle, Terminator, WriterBuilder};
use id3::{Tag, TagLike};
use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::UNIX_EPOCH;

const SNAPSHOT_DIRECTORY: &str = "album-folder-imports";
const SNAPSHOT_FORMAT_VERSION: u32 = 1;
const MAX_FOLDER_DEPTH: usize = 8;
const MAX_ALBUM_TRACKS: usize = 5_000;
const MAX_SCAN_ENTRIES: usize = 20_000;
const MUSICBEE_POPM_OWNER: &str = "MusicBee";
const DISPLAY_ARTIST_DESCRIPTION: &str = "DISPLAY ARTIST";
const LOVE_RATING_DESCRIPTION: &str = "LOVE RATING";
const RELEASE_TIME_DESCRIPTION: &str = "TDRL";
const MUSICBEE_RATINGS: [(u8, f64); 10] = [
    (13, 0.5),
    (1, 1.0),
    (54, 1.5),
    (64, 2.0),
    (118, 2.5),
    (128, 3.0),
    (186, 3.5),
    (196, 4.0),
    (242, 4.5),
    (255, 5.0),
];
const SAFE_SIDECAR_EXTENSIONS: &[&str] = &[
    "accurip", "avif", "bmp", "cue", "db", "doc", "docx", "gif", "heic", "htm", "html", "ini",
    "jpeg", "jpg", "json", "log", "lrc", "m3u", "m3u8", "md", "md5", "nfo", "par2", "pdf", "pls",
    "png", "rtf", "sfv", "sha1", "sha256", "tif", "tiff", "torrent", "txt", "url", "webp", "xmp",
    "yaml", "yml",
];
const SAFE_SIDECAR_FILENAMES: [&str; 3] = [".ds_store", "license", "readme"];

const CATALOG_TRACK_SNAPSHOT_SQL: &str = r#"
    SELECT t.display_artist,
           COALESCE(t.album_rating_raw, r.album_rating, CAST(t.album_rating AS TEXT)),
           COALESCE(r.disc_number, CAST(t.disc_number AS TEXT)),
           t.album, t.genre, t.love, t.publisher,
           COALESCE(
             t.rating_raw,
             r.rating,
             CASE
               WHEN t.normalized_rating IS NULL THEN NULL
               WHEN t.normalized_rating % 20 = 0 THEN CAST(t.normalized_rating / 20 AS TEXT)
               ELSE printf('%.1f', t.normalized_rating / 20.0)
             END
           ),
           t.title, COALESCE(r.track_number, CAST(t.track_number AS TEXT)),
           COALESCE(r.year_value, CAST(t.year AS TEXT)),
           COALESCE(r.release_year, CAST(t.release_year AS TEXT)),
           t.album_unique_id, t.file_path, t.filename, t.album_artist_display,
           COALESCE(r.time_value, CAST(t.time_seconds AS TEXT))
    FROM tracks AS t
    LEFT JOIN raw_tracks AS r
      ON r.id = t.id
     AND COALESCE(r.file_path, '') = COALESCE(t.file_path, '')
     AND COALESCE(r.filename, '') = COALESCE(t.filename, '')
    ORDER BY t.id
"#;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderFingerprint {
    digest: String,
    file_count: usize,
    total_bytes: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderSnapshotManifest {
    format_version: u32,
    folder_path: String,
    folder_fingerprint: FolderFingerprint,
    catalog_fingerprint: CatalogFingerprint,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct CatalogFingerprint {
    digest: String,
    track_count: u64,
    completed_import_revision: i64,
}

#[derive(Clone, Debug)]
pub(crate) struct SourceApplyGuard {
    data_version: i64,
    folder_path: String,
    folder_fingerprint: FolderFingerprint,
}

#[derive(Clone, Debug)]
struct ScannedTrack {
    display_artist: String,
    album: String,
    genre: String,
    love: String,
    publisher: String,
    rating: Option<f64>,
    title: String,
    disc_number: Option<u32>,
    track_number: Option<u32>,
    year: String,
    release_year: String,
    file_path: String,
    filename: String,
    album_artist: String,
    time: String,
}

#[derive(Clone, Debug)]
struct FolderScan {
    canonical_folder: PathBuf,
    fingerprint: FolderFingerprint,
    tracks: Vec<ScannedTrack>,
}

pub(crate) fn snapshot_path(app_data_dir: &Path, folder: &Path) -> PathBuf {
    let normalized = normalized_path(folder);
    let digest = hex::encode(Sha256::digest(normalized.as_bytes()));
    app_data_dir
        .join(SNAPSHOT_DIRECTORY)
        .join(format!("album-folder-{}.tsv", &digest[..20]))
}

pub(crate) fn ensure_source_root_is_not_linked(folder: &Path) -> Result<()> {
    for ancestor in folder.ancestors() {
        let metadata = fs::symlink_metadata(ancestor).with_context(|| {
            format!(
                "Could not inspect album folder path component {}",
                ancestor.display()
            )
        })?;
        if metadata.file_type().is_symlink() || is_reparse_point(ancestor)? {
            bail!(
                "The selected album folder passes through a linked or redirected directory: {}. Choose its real folder path so existing catalog rows can be matched safely",
                ancestor.display()
            );
        }
    }
    Ok(())
}

pub(crate) fn source_is_unchanged(conn: &Connection, snapshot: &Path) -> Result<bool> {
    let manifest = read_manifest(snapshot)?;
    let folder = PathBuf::from(&manifest.folder_path);
    if !folder.is_dir() {
        return Ok(false);
    }
    ensure_source_root_is_not_linked(&folder)?;
    let (current, _) = fingerprint_folder(&folder)?;
    if current != manifest.folder_fingerprint {
        return Ok(false);
    }
    Ok(catalog_fingerprint(conn)? == manifest.catalog_fingerprint)
}

pub(crate) fn prepare_source_apply_guard(
    conn: &Connection,
    snapshot_source: &str,
) -> Result<Option<SourceApplyGuard>> {
    let snapshot = Path::new(snapshot_source);
    if !is_generated_snapshot(snapshot) {
        return Ok(None);
    }
    let manifest = read_manifest(snapshot)?;
    let folder = PathBuf::from(&manifest.folder_path);
    if !folder.is_dir() {
        bail!(
            "The tagged album folder or active catalog changed after its delta was prepared. Prepare a new delta before importing"
        );
    }
    ensure_source_root_is_not_linked(&folder)?;
    let (folder_fingerprint, _) = fingerprint_folder(&folder)?;
    if folder_fingerprint != manifest.folder_fingerprint {
        bail!(
            "The tagged album folder or active catalog changed after its delta was prepared. Prepare a new delta before importing"
        );
    }
    let (catalog_fingerprint, data_version) = catalog_fingerprint_with_data_version(conn)?;
    if catalog_fingerprint != manifest.catalog_fingerprint {
        bail!(
            "The tagged album folder or active catalog changed after its delta was prepared. Prepare a new delta before importing"
        );
    }
    Ok(Some(SourceApplyGuard {
        data_version,
        folder_path: manifest.folder_path,
        folder_fingerprint,
    }))
}

pub(crate) fn ensure_source_apply_guard(
    conn: &Connection,
    guard: Option<&SourceApplyGuard>,
) -> Result<()> {
    let Some(guard) = guard else {
        return Ok(());
    };
    if sqlite_data_version(conn)? != guard.data_version {
        bail!(
            "The active catalog changed while the prepared import was waiting to apply. Prepare a new delta before importing"
        );
    }
    let folder = Path::new(&guard.folder_path);
    if !folder.is_dir() {
        bail!(
            "The tagged album folder changed while the prepared import was waiting to apply. Prepare a new delta before importing"
        );
    }
    ensure_source_root_is_not_linked(folder)?;
    if fingerprint_folder(folder)?.0 != guard.folder_fingerprint {
        bail!(
            "The tagged album folder changed while the prepared import was waiting to apply. Prepare a new delta before importing"
        );
    }
    Ok(())
}

pub(crate) fn original_folder_path(snapshot_source: &str) -> Option<String> {
    let snapshot = Path::new(snapshot_source);
    if !is_generated_snapshot(snapshot) {
        return None;
    }
    read_manifest(snapshot)
        .ok()
        .map(|manifest| manifest.folder_path)
}

pub(crate) fn cleanup_generated_snapshot(snapshot_source: &str) {
    let snapshot = Path::new(snapshot_source);
    if !is_generated_snapshot(snapshot) || read_manifest(snapshot).is_err() {
        return;
    }
    let _ = fs::remove_file(snapshot);
    let _ = fs::remove_file(manifest_path(snapshot));
}

pub(crate) fn build_snapshot(
    conn: &Connection,
    folder: &Path,
    output: &Path,
    cancel_requested: &AtomicBool,
    progress: &mut dyn FnMut(u64, u64, &str),
) -> Result<()> {
    ensure_not_cancelled(cancel_requested)?;
    progress(0, 0, "Reading tags from the selected album folder.");
    let scan = scan_folder(folder, cancel_requested)?;
    validate_single_album(&scan.tracks)?;
    let total_catalog_rows = conn
        .query_row("SELECT COUNT(*) FROM tracks", [], |row| {
            row.get::<_, i64>(0)
        })?
        .max(0) as u64;
    let total_rows = total_catalog_rows.saturating_add(scan.tracks.len() as u64);

    let parent = output
        .parent()
        .ok_or_else(|| anyhow!("Generated album snapshot has no parent directory"))?;
    fs::create_dir_all(parent)
        .with_context(|| format!("Could not create snapshot directory {}", parent.display()))?;
    let temporary = output.with_extension("tsv.building");
    if temporary.exists() {
        fs::remove_file(&temporary).with_context(|| {
            format!(
                "Could not remove stale snapshot work file {}",
                temporary.display()
            )
        })?;
    }

    let result = (|| -> Result<()> {
        let file = File::create(&temporary).with_context(|| {
            format!(
                "Could not create generated snapshot {}",
                temporary.display()
            )
        })?;
        let mut writer = WriterBuilder::new()
            .delimiter(b'\t')
            .has_headers(false)
            .quote_style(QuoteStyle::Never)
            .terminator(Terminator::Any(b'\n'))
            .from_writer(file);
        write_record(&mut writer, REQUIRED_COLUMNS.iter().copied())?;

        let initial_data_version = sqlite_data_version(conn)?;
        let mut catalog_hasher = Sha256::new();
        let mut catalog_track_count = 0_u64;
        let mut touched_rows = 0_u64;
        let mut existing_unique_ids = BTreeSet::new();
        let mut written_rows = 0_u64;
        let mut statement = conn.prepare(CATALOG_TRACK_SNAPSHOT_SQL)?;
        let mut rows = statement.query([])?;
        while let Some(row) = rows.next()? {
            ensure_not_cancelled(cancel_requested)?;
            let values = catalog_track_record(row)?;
            hash_record(&mut catalog_hasher, &values);
            catalog_track_count += 1;
            if path_is_within_folder(&values[13], &scan.canonical_folder) {
                touched_rows += 1;
                let extension = Path::new(&values[14])
                    .extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default();
                if !extension.eq_ignore_ascii_case("mp3") {
                    bail!(
                        "The selected folder already contains cataloged non-MP3 audio: {}. This first folder-sync release is MP3-only",
                        values[14]
                    );
                }
                if let Some(unique_id) = nonempty(&values[12]) {
                    existing_unique_ids.insert(unique_id.to_owned());
                }
            } else {
                write_record(&mut writer, values.iter().map(String::as_str))?;
                written_rows += 1;
            }
            if (written_rows + touched_rows).is_multiple_of(10_000) {
                progress(
                    written_rows + touched_rows,
                    total_rows,
                    "Building a complete catalog snapshot while the active library stays live.",
                );
            }
        }
        drop(rows);
        drop(statement);
        if sqlite_data_version(conn)? != initial_data_version {
            bail!("The active catalog changed while its safe snapshot was being built. Try again");
        }
        let catalog_fingerprint = CatalogFingerprint {
            digest: hex::encode(catalog_hasher.finalize()),
            track_count: catalog_track_count,
            completed_import_revision: completed_import_revision(conn)?,
        };

        if existing_unique_ids.len() > 1 {
            bail!(
                "The selected folder currently belongs to more than one catalog album. Select one complete album folder"
            );
        }
        let album_unique_id = existing_unique_ids
            .into_iter()
            .next()
            .or_else(|| (touched_rows == 0).then(|| generated_album_id(&scan.canonical_folder)));
        let album_rating = calculated_album_rating(&scan.tracks);
        for track in &scan.tracks {
            ensure_not_cancelled(cancel_requested)?;
            let values = scanned_track_record(track, album_unique_id.as_deref(), album_rating);
            write_record(&mut writer, values.iter().map(String::as_str))?;
            written_rows += 1;
        }
        writer
            .flush()
            .context("Could not flush the generated album snapshot")?;
        writer
            .get_ref()
            .sync_all()
            .context("Could not synchronize the generated album snapshot")?;
        drop(writer);

        let (final_fingerprint, _) = fingerprint_folder(&scan.canonical_folder)?;
        if final_fingerprint != scan.fingerprint {
            bail!("The selected album folder changed while it was being scanned. Try again");
        }
        replace_generated_file(&temporary, output)?;
        write_manifest(
            output,
            &FolderSnapshotManifest {
                format_version: SNAPSHOT_FORMAT_VERSION,
                folder_path: display_path(&scan.canonical_folder),
                folder_fingerprint: final_fingerprint,
                catalog_fingerprint,
            },
        )?;
        progress(
            written_rows,
            written_rows,
            "Tagged album snapshot built. Preparing the reviewable delta.",
        );
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn catalog_fingerprint(conn: &Connection) -> Result<CatalogFingerprint> {
    catalog_fingerprint_with_data_version(conn).map(|(fingerprint, _)| fingerprint)
}

fn catalog_fingerprint_with_data_version(conn: &Connection) -> Result<(CatalogFingerprint, i64)> {
    let initial_data_version = sqlite_data_version(conn)?;
    let mut hasher = Sha256::new();
    let mut track_count = 0_u64;
    let mut statement = conn.prepare(CATALOG_TRACK_SNAPSHOT_SQL)?;
    let mut rows = statement.query([])?;
    while let Some(row) = rows.next()? {
        let values = catalog_track_record(row)?;
        hash_record(&mut hasher, &values);
        track_count += 1;
    }
    drop(rows);
    drop(statement);
    let completed_import_revision = completed_import_revision(conn)?;
    if sqlite_data_version(conn)? != initial_data_version {
        bail!("The active catalog changed while it was being verified. Try again");
    }
    Ok((
        CatalogFingerprint {
            digest: hex::encode(hasher.finalize()),
            track_count,
            completed_import_revision,
        },
        initial_data_version,
    ))
}

fn catalog_track_record(row: &Row<'_>) -> rusqlite::Result<[String; 17]> {
    let text = |index| {
        row.get::<_, Option<String>>(index)
            .map(|value| value.unwrap_or_default())
    };
    let raw_time = text(16)?;
    let time = if raw_time.contains(':') {
        raw_time
    } else {
        raw_time
            .parse::<f64>()
            .ok()
            .map(format_duration)
            .unwrap_or_default()
    };
    Ok([
        text(0)?,
        text(1)?,
        text(2)?,
        text(3)?,
        text(4)?,
        text(5)?,
        text(6)?,
        text(7)?,
        text(8)?,
        text(9)?,
        text(10)?,
        text(11)?,
        text(12)?,
        text(13)?,
        text(14)?,
        text(15)?,
        time,
    ])
}

fn hash_record(hasher: &mut Sha256, values: &[String]) {
    for value in values {
        hasher.update((value.len() as u64).to_le_bytes());
        hasher.update(value.as_bytes());
    }
}

fn completed_import_revision(conn: &Connection) -> Result<i64> {
    conn.query_row(
        "SELECT COALESCE(MAX(id), 0) FROM import_runs WHERE status = 'completed'",
        [],
        |row| row.get(0),
    )
    .context("Could not identify the active catalog revision")
}

fn sqlite_data_version(conn: &Connection) -> Result<i64> {
    conn.query_row("PRAGMA data_version", [], |row| row.get(0))
        .context("Could not identify concurrent catalog changes")
}

fn scan_folder(folder: &Path, cancel_requested: &AtomicBool) -> Result<FolderScan> {
    let canonical_folder = folder
        .canonicalize()
        .with_context(|| format!("Could not resolve album folder {}", folder.display()))?;
    let (fingerprint, paths) = fingerprint_folder(&canonical_folder)?;
    if paths.is_empty() {
        bail!("The selected folder does not contain any MP3 files");
    }
    let mut tracks = Vec::with_capacity(paths.len());
    for path in paths {
        ensure_not_cancelled(cancel_requested)?;
        tracks.push(read_track(&path)?);
    }
    Ok(FolderScan {
        canonical_folder,
        fingerprint,
        tracks,
    })
}

fn fingerprint_folder(folder: &Path) -> Result<(FolderFingerprint, Vec<PathBuf>)> {
    let mut paths = Vec::new();
    let mut scanned_entries = 0;
    collect_mp3_paths(folder, 0, &mut scanned_entries, &mut paths)?;
    paths.sort_by_key(|path| normalized_path(path));
    let mut hasher = Sha256::new();
    let mut total_bytes = 0_u64;
    for path in &paths {
        let metadata = fs::metadata(path)
            .with_context(|| format!("Could not inspect MP3 {}", path.display()))?;
        let relative = path.strip_prefix(folder).unwrap_or(path);
        let modified_ns = metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        total_bytes = total_bytes.saturating_add(metadata.len());
        hasher.update(display_path(relative).replace('/', "\\").as_bytes());
        hasher.update([0]);
        hasher.update(metadata.len().to_le_bytes());
        hasher.update(modified_ns.to_le_bytes());
        hash_id3_regions(path, metadata.len(), &mut hasher)?;
    }
    Ok((
        FolderFingerprint {
            digest: hex::encode(hasher.finalize()),
            file_count: paths.len(),
            total_bytes,
        },
        paths,
    ))
}

fn hash_id3_regions(path: &Path, file_len: u64, hasher: &mut Sha256) -> Result<()> {
    let mut file = File::open(path)
        .with_context(|| format!("Could not fingerprint MP3 tags in {}", path.display()))?;
    let mut header = [0_u8; 10];
    let header_len = file
        .read(&mut header)
        .with_context(|| format!("Could not read MP3 tag header in {}", path.display()))?;
    let leading_len = if header_len == header.len() && &header[..3] == b"ID3" {
        let size_bytes = &header[6..10];
        if size_bytes.iter().any(|value| value & 0x80 != 0) {
            bail!("{} has an invalid ID3 tag size", path.display());
        }
        let body_len = size_bytes
            .iter()
            .fold(0_u64, |size, value| (size << 7) | u64::from(*value));
        let footer_len = if header[5] & 0x10 != 0 { 10 } else { 0 };
        (10_u64.saturating_add(body_len).saturating_add(footer_len)).min(file_len)
    } else {
        header_len as u64
    };
    file.seek(SeekFrom::Start(0))?;
    hash_file_region(&mut file, leading_len, hasher)?;

    let trailing_len = file_len.min(128);
    if trailing_len > 0 {
        file.seek(SeekFrom::Start(file_len - trailing_len))?;
        hash_file_region(&mut file, trailing_len, hasher)?;
    }
    Ok(())
}

fn hash_file_region(file: &mut File, mut remaining: u64, hasher: &mut Sha256) -> Result<()> {
    let mut buffer = [0_u8; 64 * 1024];
    while remaining > 0 {
        let requested = usize::try_from(remaining.min(buffer.len() as u64)).unwrap_or(buffer.len());
        let read = file.read(&mut buffer[..requested])?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        remaining -= read as u64;
    }
    Ok(())
}

fn collect_mp3_paths(
    folder: &Path,
    depth: usize,
    scanned_entries: &mut usize,
    paths: &mut Vec<PathBuf>,
) -> Result<()> {
    if depth > MAX_FOLDER_DEPTH {
        bail!("The selected album folder is nested more than {MAX_FOLDER_DEPTH} levels deep");
    }
    let entries = fs::read_dir(folder)
        .with_context(|| format!("Could not read album folder {}", folder.display()))?;
    for entry in entries {
        let entry = entry?;
        *scanned_entries += 1;
        if *scanned_entries > MAX_SCAN_ENTRIES {
            bail!(
                "The selected folder contains more than {MAX_SCAN_ENTRIES} entries. Select one complete album folder, not a library root"
            );
        }
        let file_type = entry.file_type()?;
        if file_type.is_symlink() || is_reparse_point(&entry.path())? {
            bail!(
                "The selected album folder contains a linked file or folder: {}",
                entry.path().display()
            );
        }
        if file_type.is_dir() {
            collect_mp3_paths(&entry.path(), depth + 1, scanned_entries, paths)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        let extension = entry
            .path()
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if extension == "mp3" {
            paths.push(entry.path());
            if paths.len() > MAX_ALBUM_TRACKS {
                bail!(
                    "The selected folder contains more than {MAX_ALBUM_TRACKS} MP3s. Select one complete album folder, not a library root"
                );
            }
        } else if !is_safe_sidecar(&entry.path(), &extension) {
            bail!(
                "The selected folder contains an unsupported non-MP3 file: {}. Keep only MP3 audio and recognized artwork, playlist, checksum, or liner-note sidecars in the album folder",
                entry.path().display()
            );
        }
    }
    Ok(())
}

fn is_safe_sidecar(path: &Path, extension: &str) -> bool {
    if SAFE_SIDECAR_EXTENSIONS.contains(&extension) {
        return true;
    }
    path.file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|value| {
            SAFE_SIDECAR_FILENAMES
                .iter()
                .any(|allowed| value.eq_ignore_ascii_case(allowed))
        })
}

#[cfg(windows)]
fn is_reparse_point(path: &Path) -> Result<bool> {
    use std::os::windows::fs::MetadataExt;

    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
    let metadata = fs::symlink_metadata(path)
        .with_context(|| format!("Could not inspect album entry {}", path.display()))?;
    Ok(metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0)
}

#[cfg(not(windows))]
fn is_reparse_point(_path: &Path) -> Result<bool> {
    Ok(false)
}

fn read_track(path: &Path) -> Result<ScannedTrack> {
    let tag = Tag::read_from_path(path)
        .with_context(|| format!("Could not read ID3 tags from {}", path.display()))?;
    let artist = required_tag(path, "artist", tag.artist())?;
    let display_artist = unique_extended_text(&tag, DISPLAY_ARTIST_DESCRIPTION)?
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| artist.clone());
    let album = required_tag(path, "album", tag.album())?;
    let title = required_tag(path, "title", tag.title())?;
    let album_artist = tag
        .album_artist()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(&artist)
        .trim()
        .to_owned();
    let publisher = tag
        .get("TPUB")
        .and_then(|frame| frame.content().text())
        .unwrap_or_default()
        .trim()
        .to_owned();
    let year = tag
        .get("TDRC")
        .and_then(|frame| frame.content().text())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .or_else(|| tag.year().map(|value| value.to_string()))
        .unwrap_or_default();
    let release_year = tag
        .get("TDRL")
        .and_then(|frame| frame.content().text())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .or(unique_extended_text(&tag, RELEASE_TIME_DESCRIPTION)?)
        .unwrap_or_default();
    let rating = musicbee_rating(&tag, path)?;
    let love = unique_extended_text(&tag, LOVE_RATING_DESCRIPTION)?.unwrap_or_default();
    if !matches!(love.as_str(), "" | "L" | "B") {
        bail!(
            "{} has unsupported LOVE RATING value {love:?}",
            path.display()
        );
    }
    let duration_seconds = tag
        .duration()
        .filter(|value| *value > 0)
        .map(|value| f64::from(value) / 1_000.0)
        .or_else(|| {
            soundcheck::inspect_file(path, false, 0).and_then(|result| result.duration_seconds)
        });
    let parent = path
        .parent()
        .ok_or_else(|| anyhow!("MP3 has no parent directory: {}", path.display()))?;
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| anyhow!("MP3 filename is not valid Unicode: {}", path.display()))?;
    Ok(ScannedTrack {
        display_artist,
        album,
        genre: tag.genre().unwrap_or_default().trim().to_owned(),
        love,
        publisher,
        rating,
        title,
        disc_number: tag.disc(),
        track_number: tag.track(),
        year,
        release_year,
        file_path: display_path(parent),
        filename: filename.to_owned(),
        album_artist,
        time: duration_seconds.map(format_duration).unwrap_or_default(),
    })
}

fn required_tag(path: &Path, name: &str, value: Option<&str>) -> Result<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| anyhow!("{} is missing its {name} tag", path.display()))
}

fn unique_extended_text(tag: &Tag, description: &str) -> Result<Option<String>> {
    let values = tag
        .extended_texts()
        .filter(|value| value.description.eq_ignore_ascii_case(description))
        .map(|value| value.value.trim().to_owned())
        .collect::<Vec<_>>();
    if values.len() > 1 {
        bail!("The MP3 has duplicate {description} text frames");
    }
    Ok(values.into_iter().next())
}

fn musicbee_rating(tag: &Tag, path: &Path) -> Result<Option<f64>> {
    let values = tag
        .frames()
        .filter(|frame| frame.id() == "POPM")
        .filter_map(|frame| frame.content().popularimeter())
        .filter(|value| value.user == MUSICBEE_POPM_OWNER)
        .map(|value| value.rating)
        .collect::<Vec<_>>();
    if values.len() > 1 {
        bail!("{} has duplicate MusicBee rating frames", path.display());
    }
    let Some(value) = values.first().copied() else {
        return Ok(None);
    };
    if value == 0 {
        return Ok(None);
    }
    MUSICBEE_RATINGS
        .iter()
        .find(|(byte, _)| *byte == value)
        .map(|(_, rating)| Some(*rating))
        .ok_or_else(|| {
            anyhow!(
                "{} has unsupported MusicBee rating byte {value}",
                path.display()
            )
        })
}

fn validate_single_album(tracks: &[ScannedTrack]) -> Result<()> {
    let first = tracks
        .first()
        .ok_or_else(|| anyhow!("The selected folder does not contain any MP3 files"))?;
    let album = normalized_text(&first.album);
    let album_artist = normalized_text(&first.album_artist);
    if tracks.iter().any(|track| {
        normalized_text(&track.album) != album
            || normalized_text(&track.album_artist) != album_artist
    }) {
        bail!(
            "The selected folder contains more than one album or album artist. Select one complete album folder"
        );
    }
    Ok(())
}

fn calculated_album_rating(tracks: &[ScannedTrack]) -> Option<i32> {
    let ratings = tracks
        .iter()
        .filter_map(|track| track.rating)
        .map(|rating| (rating * 20.0).round() as i32)
        .collect::<Vec<_>>();
    (!ratings.is_empty()).then(|| ratings.iter().sum::<i32>() / ratings.len() as i32)
}

fn scanned_track_record(
    track: &ScannedTrack,
    album_unique_id: Option<&str>,
    album_rating: Option<i32>,
) -> [String; 17] {
    [
        track.display_artist.clone(),
        album_rating
            .map(|value| value.to_string())
            .unwrap_or_default(),
        track
            .disc_number
            .map(|value| value.to_string())
            .unwrap_or_default(),
        track.album.clone(),
        track.genre.clone(),
        track.love.clone(),
        track.publisher.clone(),
        track.rating.map(format_rating).unwrap_or_default(),
        track.title.clone(),
        track
            .track_number
            .map(|value| value.to_string())
            .unwrap_or_default(),
        track.year.clone(),
        track.release_year.clone(),
        album_unique_id.unwrap_or_default().to_owned(),
        track.file_path.clone(),
        track.filename.clone(),
        track.album_artist.clone(),
        track.time.clone(),
    ]
}

fn write_record<'a>(
    writer: &mut csv::Writer<File>,
    values: impl Iterator<Item = &'a str>,
) -> Result<()> {
    let sanitized = values.map(sanitize_tsv_field).collect::<Vec<_>>();
    writer
        .write_record(&sanitized)
        .context("Could not write generated album snapshot row")
}

fn sanitize_tsv_field(value: &str) -> String {
    value
        .chars()
        .map(|character| match character {
            '\t' | '\0' | '\r' | '\n' => ' ',
            other => other,
        })
        .collect()
}

fn generated_album_id(folder: &Path) -> String {
    let digest = hex::encode(Sha256::digest(normalized_path(folder).as_bytes()));
    format!("aurora:v1:{digest}")
}

fn format_rating(value: f64) -> String {
    if value.fract() == 0.0 {
        format!("{value:.0}")
    } else {
        format!("{value:.1}")
    }
}

fn format_duration(value: f64) -> String {
    let seconds = value.round().max(0.0) as u64;
    if seconds >= 3_600 {
        format!(
            "{}:{:02}:{:02}",
            seconds / 3_600,
            (seconds / 60) % 60,
            seconds % 60
        )
    } else {
        format!("{}:{:02}", seconds / 60, seconds % 60)
    }
}

fn path_is_within_folder(candidate: &str, folder: &Path) -> bool {
    let candidate = normalized_path(Path::new(candidate));
    let folder = normalized_path(folder).trim_end_matches('\\').to_owned();
    candidate == folder || candidate.starts_with(&(folder + "\\"))
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

fn normalized_text(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn nonempty(value: &str) -> Option<&str> {
    let value = value.trim();
    (!value.is_empty()).then_some(value)
}

fn ensure_not_cancelled(cancel_requested: &AtomicBool) -> Result<()> {
    if cancel_requested.load(Ordering::SeqCst) {
        bail!("Album folder snapshot preparation cancelled safely");
    }
    Ok(())
}

fn is_generated_snapshot(path: &Path) -> bool {
    path.parent()
        .and_then(Path::file_name)
        .and_then(|value| value.to_str())
        .is_some_and(|value| value == SNAPSHOT_DIRECTORY)
        && path
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.starts_with("album-folder-") && value.ends_with(".tsv"))
}

fn manifest_path(snapshot: &Path) -> PathBuf {
    snapshot.with_extension("manifest.json")
}

fn read_manifest(snapshot: &Path) -> Result<FolderSnapshotManifest> {
    let path = manifest_path(snapshot);
    let bytes = fs::read(&path)
        .with_context(|| format!("Could not read album snapshot manifest {}", path.display()))?;
    let manifest: FolderSnapshotManifest = serde_json::from_slice(&bytes)
        .with_context(|| format!("Could not parse album snapshot manifest {}", path.display()))?;
    if manifest.format_version != SNAPSHOT_FORMAT_VERSION {
        bail!("Album snapshot manifest version is unsupported");
    }
    Ok(manifest)
}

fn write_manifest(snapshot: &Path, manifest: &FolderSnapshotManifest) -> Result<()> {
    let path = manifest_path(snapshot);
    let temporary = path.with_extension("json.building");
    let bytes = serde_json::to_vec_pretty(manifest)?;
    fs::write(&temporary, bytes).with_context(|| {
        format!(
            "Could not write album snapshot manifest {}",
            temporary.display()
        )
    })?;
    replace_generated_file(&temporary, &path)
}

fn replace_generated_file(temporary: &Path, destination: &Path) -> Result<()> {
    if destination.exists() {
        fs::remove_file(destination).with_context(|| {
            format!(
                "Could not replace generated snapshot {}",
                destination.display()
            )
        })?;
    }
    fs::rename(temporary, destination).with_context(|| {
        format!(
            "Could not publish generated snapshot {} as {}",
            temporary.display(),
            destination.display()
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use id3::frame::{ExtendedText, Popularimeter};
    use id3::Version;
    use std::sync::atomic::AtomicBool;
    use tempfile::tempdir;

    fn create_catalog(conn: &Connection) {
        conn.execute_batch(
            "
            CREATE TABLE import_runs (id INTEGER PRIMARY KEY, status TEXT NOT NULL);
            INSERT INTO import_runs VALUES (1, 'completed');
            CREATE TABLE tracks (
                id INTEGER PRIMARY KEY, display_artist TEXT,
                album_rating_raw TEXT, album_rating INTEGER, disc_number INTEGER,
                album TEXT, genre TEXT, love TEXT, publisher TEXT, rating TEXT,
                rating_raw TEXT, normalized_rating INTEGER, title TEXT,
                track_number INTEGER, year INTEGER, release_year INTEGER,
                album_unique_id TEXT, file_path TEXT, filename TEXT,
                album_artist_display TEXT, time_seconds INTEGER
            );
            CREATE TABLE raw_tracks (
                id INTEGER PRIMARY KEY, album_rating TEXT, disc_number TEXT,
                rating TEXT, track_number TEXT, year_value TEXT,
                release_year TEXT, file_path TEXT, filename TEXT,
                time_value TEXT, title TEXT
            );
            ",
        )
        .expect("schema");
    }

    fn write_tagged_mp3(path: &Path, album: &str) {
        fs::write(path, [0xFF, 0xFB, 0x90, 0x64, 0, 0, 0, 0]).expect("seed mp3");
        let mut tag = Tag::new();
        tag.set_artist("Track Artist");
        tag.set_album_artist("Album Artist");
        tag.set_album(album);
        tag.set_title("Track Title");
        tag.set_genre("Score");
        tag.set_track(1);
        tag.set_disc(1);
        tag.set_year(2026);
        tag.set_duration(125_000);
        tag.set_text("TPUB", "Label");
        tag.set_text("TDRL", "2026");
        tag.add_frame(ExtendedText {
            description: DISPLAY_ARTIST_DESCRIPTION.to_owned(),
            value: "Track Artist; Guest".to_owned(),
        });
        tag.add_frame(ExtendedText {
            description: LOVE_RATING_DESCRIPTION.to_owned(),
            value: "L".to_owned(),
        });
        tag.add_frame(Popularimeter {
            user: MUSICBEE_POPM_OWNER.to_owned(),
            rating: 186,
            counter: 0,
        });
        tag.write_to_path(path, Version::Id3v24)
            .expect("write tags");
    }

    #[test]
    fn tagged_folder_snapshot_preserves_outside_rows_and_replaces_inside_rows() {
        let temp = tempdir().expect("tempdir");
        let album = temp.path().join("Album");
        fs::create_dir(&album).expect("album folder");
        let track = album.join("01 - Track.mp3");
        write_tagged_mp3(&track, "New Album");
        fs::write(album.join("cover.jpg"), [1, 2, 3]).expect("safe artwork sidecar");
        fs::write(album.join("back.webp"), [1, 2, 3]).expect("safe modern artwork sidecar");
        let conn = Connection::open_in_memory().expect("database");
        create_catalog(&conn);
        conn.execute(
            "INSERT INTO tracks (id, title, album_unique_id, file_path, filename) VALUES (1, 'Outside', '8', 'D:\\Music\\Other', 'outside.mp3')",
            [],
        )
        .expect("outside row");
        conn.execute(
            "INSERT INTO raw_tracks (id, title, file_path, filename) VALUES (1, 'Outside stale', 'D:\\Music\\Other', 'outside.mp3')",
            [],
        )
        .expect("outside raw row");
        conn.execute(
            "INSERT INTO tracks (id, title, album_unique_id, file_path, filename) VALUES (2, 'Old', '77', ?1, 'old.mp3')",
            [display_path(&album)],
        )
        .expect("inside row");
        conn.execute(
            "INSERT INTO raw_tracks (id, title, file_path, filename) VALUES (2, 'Old', ?1, 'old.mp3')",
            [display_path(&album)],
        )
        .expect("inside raw row");
        let output = temp
            .path()
            .join(SNAPSHOT_DIRECTORY)
            .join("album-folder-test.tsv");
        build_snapshot(
            &conn,
            &album,
            &output,
            &AtomicBool::new(false),
            &mut |_, _, _| {},
        )
        .expect("snapshot");

        let mut reader = csv::ReaderBuilder::new()
            .delimiter(b'\t')
            .quoting(false)
            .from_path(&output)
            .expect("read snapshot");
        let rows = reader
            .records()
            .collect::<csv::Result<Vec<_>>>()
            .expect("rows");
        assert_eq!(rows.len(), 2);
        assert_eq!(&rows[0][8], "Outside");
        assert_eq!(&rows[1][0], "Track Artist; Guest");
        assert_eq!(&rows[1][1], "70");
        assert_eq!(&rows[1][5], "L");
        assert_eq!(&rows[1][6], "Label");
        assert_eq!(&rows[1][7], "3.5");
        assert_eq!(&rows[1][11], "2026");
        assert_eq!(&rows[1][12], "77");
        assert_eq!(&rows[1][16], "2:05");
        assert!(source_is_unchanged(&conn, &output).expect("source check"));
        conn.execute("UPDATE tracks SET title = 'Outside fixed' WHERE id = 1", [])
            .expect("change active catalog");
        assert!(!source_is_unchanged(&conn, &output).expect("catalog change check"));
        build_snapshot(
            &conn,
            &album,
            &output,
            &AtomicBool::new(false),
            &mut |_, _, _| {},
        )
        .expect("rebuilt snapshot");
        fs::write(&track, [0xFF, 0xFB, 0x90, 0x64, 1, 2, 3, 4, 5]).expect("mutate source MP3");
        assert!(!source_is_unchanged(&conn, &output).expect("changed source check"));
    }

    #[test]
    fn rejects_multiple_album_identities() {
        let temp = tempdir().expect("tempdir");
        let album = temp.path().join("Album");
        fs::create_dir(&album).expect("album folder");
        write_tagged_mp3(&album.join("01.mp3"), "First Album");
        write_tagged_mp3(&album.join("02.mp3"), "Second Album");
        let error = scan_folder(&album, &AtomicBool::new(false))
            .and_then(|scan| validate_single_album(&scan.tracks))
            .expect_err("multiple albums should fail");
        assert!(error.to_string().contains("more than one album"));
    }

    #[test]
    fn rejects_cataloged_non_mp3_audio_before_it_can_be_removed() {
        let temp = tempdir().expect("tempdir");
        let album = temp.path().join("Album");
        fs::create_dir(&album).expect("album folder");
        write_tagged_mp3(&album.join("01.mp3"), "Album");
        let conn = Connection::open_in_memory().expect("database");
        create_catalog(&conn);
        conn.execute(
            "INSERT INTO tracks (id, title, album_unique_id, file_path, filename) VALUES (1, 'Lossless track', '77', ?1, '02.mpc')",
            [display_path(&album)],
        )
        .expect("cataloged non-MP3 row");
        conn.execute(
            "INSERT INTO raw_tracks (id, title, file_path, filename) VALUES (1, 'Lossless track', ?1, '02.mpc')",
            [display_path(&album)],
        )
        .expect("cataloged non-MP3 raw row");
        let output = temp
            .path()
            .join(SNAPSHOT_DIRECTORY)
            .join("album-folder-mixed.tsv");

        let error = build_snapshot(
            &conn,
            &album,
            &output,
            &AtomicBool::new(false),
            &mut |_, _, _| {},
        )
        .expect_err("mixed catalog audio should fail");

        assert!(error.to_string().contains("cataloged non-MP3 audio"));
        assert!(!output.exists());
    }

    #[test]
    fn rejects_unrecognized_files_before_a_partial_album_can_be_staged() {
        let temp = tempdir().expect("tempdir");
        let album = temp.path().join("Album");
        fs::create_dir(&album).expect("album folder");
        write_tagged_mp3(&album.join("01.mp3"), "Album");
        fs::write(album.join("02.webm"), [1, 2, 3]).expect("unsupported audio");

        let error = scan_folder(&album, &AtomicBool::new(false))
            .expect_err("unrecognized physical file should fail closed");

        assert!(error.to_string().contains("unsupported non-MP3 file"));
    }

    #[test]
    fn apply_guard_detects_an_external_catalog_commit() {
        let temp = tempdir().expect("tempdir");
        let album = temp.path().join("Album");
        fs::create_dir(&album).expect("album folder");
        write_tagged_mp3(&album.join("01.mp3"), "Album");
        let database = temp.path().join("catalog.sqlite3");
        let mut conn = Connection::open(&database).expect("database");
        create_catalog(&conn);
        conn.execute(
            "INSERT INTO tracks (id, title, album_unique_id, file_path, filename) VALUES (1, 'Outside', '8', 'D:\\Music\\Other', 'outside.mp3')",
            [],
        )
        .expect("outside track");
        conn.execute(
            "INSERT INTO raw_tracks (id, title, file_path, filename) VALUES (1, 'Outside', 'D:\\Music\\Other', 'outside.mp3')",
            [],
        )
        .expect("outside raw track");
        let output = temp
            .path()
            .join(SNAPSHOT_DIRECTORY)
            .join("album-folder-guard.tsv");
        build_snapshot(
            &conn,
            &album,
            &output,
            &AtomicBool::new(false),
            &mut |_, _, _| {},
        )
        .expect("snapshot");
        let guard = prepare_source_apply_guard(&conn, output.to_string_lossy().as_ref())
            .expect("prepare guard")
            .expect("folder guard");

        conn.execute("INSERT INTO import_runs VALUES (2, 'running')", [])
            .expect("same-connection bookkeeping write");
        ensure_source_apply_guard(&conn, Some(&guard))
            .expect("same-connection bookkeeping must not invalidate catalog guard");

        let other = Connection::open(&database).expect("second connection");
        other
            .execute(
                "UPDATE tracks SET title = 'Changed elsewhere' WHERE id = 1",
                [],
            )
            .expect("external catalog change");
        drop(other);
        let tx = conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .expect("immediate apply transaction");
        let error = ensure_source_apply_guard(&tx, Some(&guard))
            .expect_err("external catalog commit must invalidate apply guard");
        assert!(error.to_string().contains("active catalog changed"));
    }

    #[test]
    fn rejects_a_linked_ancestor_of_the_selected_folder() {
        let temp = tempdir().expect("tempdir");
        let real = temp.path().join("real");
        let album = real.join("Album");
        fs::create_dir_all(&album).expect("real album folder");
        let alias = temp.path().join("alias");

        #[cfg(windows)]
        let link_result = std::os::windows::fs::symlink_dir(&real, &alias);
        #[cfg(unix)]
        let link_result = std::os::unix::fs::symlink(&real, &alias);
        #[cfg(not(any(windows, unix)))]
        return;

        if link_result.is_err() {
            return;
        }
        let selected = alias.join("Album");
        let error = ensure_source_root_is_not_linked(&selected)
            .expect_err("linked ancestor should be rejected before canonicalization");
        assert!(error.to_string().contains("passes through a linked"));
    }

    #[test]
    fn rejects_a_source_folder_replaced_with_a_link_after_snapshot() {
        let temp = tempdir().expect("tempdir");
        let album = temp.path().join("Album");
        fs::create_dir(&album).expect("album folder");
        write_tagged_mp3(&album.join("01.mp3"), "Album");
        let conn = Connection::open_in_memory().expect("database");
        create_catalog(&conn);
        let output = temp
            .path()
            .join(SNAPSHOT_DIRECTORY)
            .join("album-folder-replaced-root.tsv");
        build_snapshot(
            &conn,
            &album,
            &output,
            &AtomicBool::new(false),
            &mut |_, _, _| {},
        )
        .expect("snapshot");
        let guard = prepare_source_apply_guard(&conn, output.to_string_lossy().as_ref())
            .expect("prepare guard")
            .expect("folder guard");

        let moved_album = temp.path().join("Moved album");
        fs::rename(&album, &moved_album).expect("move real album");
        #[cfg(windows)]
        let link_result = std::os::windows::fs::symlink_dir(&moved_album, &album);
        #[cfg(unix)]
        let link_result = std::os::unix::fs::symlink(&moved_album, &album);
        #[cfg(not(any(windows, unix)))]
        return;

        if link_result.is_err() {
            return;
        }
        let resume_error = source_is_unchanged(&conn, &output)
            .expect_err("resume check must reject a replacement link");
        assert!(resume_error.to_string().contains("passes through a linked"));
        let preflight_error = prepare_source_apply_guard(&conn, output.to_string_lossy().as_ref())
            .expect_err("apply preflight must reject a replacement link");
        assert!(preflight_error
            .to_string()
            .contains("passes through a linked"));
        let apply_error = ensure_source_apply_guard(&conn, Some(&guard))
            .expect_err("final apply guard must reject a replacement link");
        assert!(apply_error.to_string().contains("passes through a linked"));
    }

    #[test]
    fn path_matching_is_case_insensitive_and_directory_bounded() {
        let folder = Path::new(r"H:\Music\Album");
        assert!(path_is_within_folder(r"h:/music/album", folder));
        assert!(path_is_within_folder(r"H:\Music\Album\Disc 2", folder));
        assert!(!path_is_within_folder(r"H:\Music\Album Deluxe", folder));
    }

    #[test]
    fn partial_album_rating_uses_the_floored_musicbee_mean() {
        let fixture = |rating| ScannedTrack {
            display_artist: "Artist".to_owned(),
            album: "Album".to_owned(),
            genre: String::new(),
            love: String::new(),
            publisher: String::new(),
            rating,
            title: "Track".to_owned(),
            disc_number: Some(1),
            track_number: Some(1),
            year: "2026".to_owned(),
            release_year: "2026".to_owned(),
            file_path: r"H:\Music\Album".to_owned(),
            filename: "track.mp3".to_owned(),
            album_artist: "Artist".to_owned(),
            time: "3:00".to_owned(),
        };
        let tracks = vec![fixture(Some(5.0)), fixture(Some(5.0)), fixture(Some(4.0))];
        assert_eq!(calculated_album_rating(&tracks), Some(93));
    }

    #[test]
    fn cancellation_does_not_publish_a_partial_snapshot() {
        let temp = tempdir().expect("tempdir");
        let album = temp.path().join("Album");
        fs::create_dir(&album).expect("album folder");
        write_tagged_mp3(&album.join("01.mp3"), "Album");
        let conn = Connection::open_in_memory().expect("database");
        create_catalog(&conn);
        let output = temp
            .path()
            .join(SNAPSHOT_DIRECTORY)
            .join("album-folder-cancelled.tsv");
        let error = build_snapshot(
            &conn,
            &album,
            &output,
            &AtomicBool::new(true),
            &mut |_, _, _| {},
        )
        .expect_err("cancelled build");
        assert!(error.to_string().contains("cancelled safely"));
        assert!(!output.exists());
    }
}
