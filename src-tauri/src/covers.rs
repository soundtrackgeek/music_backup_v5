use crate::db;
use crate::models::{CoverImportProgress, CoverImportRequest, CoverImportSummary};
use anyhow::{anyhow, bail, Context, Result};
use chrono::Utc;
use id3::frame::PictureType;
use id3::Tag;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

const SUPPORTED_ARCHIVE_EXTENSIONS: [&str; 5] = ["jpg", "jpeg", "png", "gif", "bmp"];

#[derive(Debug, Clone)]
struct AlbumCoverCandidate {
    album_id: String,
    file_path: Option<String>,
    filename: Option<String>,
}

#[derive(Debug, Clone)]
struct ArchiveCover {
    path: PathBuf,
    extension: String,
    mime_type: String,
}

#[derive(Debug, Clone)]
struct ExistingCover {
    cache_path: String,
}

#[derive(Debug, Clone)]
enum CoverPayload {
    ArchiveFile {
        path: PathBuf,
        extension: String,
        mime_type: String,
    },
    EmbeddedBytes {
        source_path: PathBuf,
        extension: String,
        mime_type: String,
        bytes: Vec<u8>,
    },
}

#[derive(Debug, Clone, Default)]
struct CoverCounters {
    total_albums: u64,
    scanned_albums: u64,
    new_covers_found: u64,
    imported_covers: u64,
    skipped_existing: u64,
    missing_covers: u64,
}

pub fn import_album_covers(
    app: AppHandle,
    request: CoverImportRequest,
) -> Result<CoverImportSummary> {
    let started = Instant::now();
    let result = run_cover_import(&app, request, started);
    if let Err(error) = &result {
        emit_progress(
            &app,
            "failed",
            &CoverCounters::default(),
            0.0,
            &format!("Cover import failed: {error}"),
        );
    }
    result
}

fn run_cover_import(
    app: &AppHandle,
    request: CoverImportRequest,
    started: Instant,
) -> Result<CoverImportSummary> {
    let source_dir = resolve_source_dir(&request.source_path)?;
    let archive_index = build_archive_index(&source_dir)?;
    let cache_dir = cover_cache_dir(app)?;
    fs::create_dir_all(&cache_dir)
        .with_context(|| format!("Could not create cover cache {}", cache_dir.display()))?;

    let (mut conn, _) = db::open(app)?;
    let albums = load_album_cover_candidates(&conn)?;
    let existing_covers = load_existing_covers(&conn)?;

    let mut counters = CoverCounters {
        total_albums: albums.len() as u64,
        ..CoverCounters::default()
    };

    emit_progress(
        app,
        "running",
        &counters,
        0.0,
        "Scanning album folders for cover art.",
    );

    let tx = conn
        .transaction()
        .context("Could not start cover import transaction")?;
    let mut upsert_cover = tx.prepare(
        "
        INSERT INTO album_covers (
            album_id, source, source_path, cache_path, mime_type, extension,
            file_size_bytes, imported_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
        )
        ON CONFLICT(album_id) DO UPDATE SET
            source = excluded.source,
            source_path = excluded.source_path,
            cache_path = excluded.cache_path,
            mime_type = excluded.mime_type,
            extension = excluded.extension,
            file_size_bytes = excluded.file_size_bytes,
            imported_at = excluded.imported_at
        ",
    )?;

    for album in albums {
        counters.scanned_albums += 1;

        if !request.replace_existing && has_valid_existing_cover(&album.album_id, &existing_covers)
        {
            counters.skipped_existing += 1;
            maybe_emit_running_progress(app, &counters);
            continue;
        }

        match find_cover_for_album(&album, &archive_index, request.extract_embedded_fallback)? {
            Some(payload) => {
                counters.new_covers_found += 1;
                let imported = import_cover_payload(&cache_dir, &album.album_id, payload)?;
                upsert_cover.execute(params![
                    &album.album_id,
                    imported.source,
                    imported.source_path,
                    imported.cache_path,
                    imported.mime_type,
                    imported.extension,
                    imported.file_size_bytes,
                    Utc::now().to_rfc3339(),
                ])?;
                counters.imported_covers += 1;
            }
            None => {
                counters.missing_covers += 1;
            }
        }

        maybe_emit_running_progress(app, &counters);
    }

    drop(upsert_cover);
    tx.commit()
        .context("Could not commit cover import transaction")?;

    let duration_ms = started.elapsed().as_millis();
    emit_progress(
        app,
        "completed",
        &counters,
        100.0,
        "Cover import completed.",
    );

    Ok(CoverImportSummary {
        total_albums: counters.total_albums,
        scanned_albums: counters.scanned_albums,
        new_covers_found: counters.new_covers_found,
        imported_covers: counters.imported_covers,
        skipped_existing: counters.skipped_existing,
        missing_covers: counters.missing_covers,
        duration_ms,
    })
}

fn cover_cache_dir(app: &AppHandle) -> Result<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .context("Could not resolve the app data directory")?
        .join("covers"))
}

fn resolve_source_dir(source_path: &str) -> Result<PathBuf> {
    let trimmed = source_path.trim();
    if trimmed.is_empty() {
        bail!("Choose a cover source folder before starting cover import");
    }

    let provided = PathBuf::from(trimmed);
    let candidates = if provided.is_absolute() {
        vec![provided]
    } else {
        let cwd = std::env::current_dir().context("Could not read current working directory")?;
        let mut candidates = vec![cwd.join(&provided)];
        if let Some(parent) = cwd.parent() {
            candidates.push(parent.join(&provided));
        }
        candidates
    };

    let source_dir = candidates
        .into_iter()
        .find(|candidate| candidate.is_dir())
        .map(|candidate| candidate.canonicalize().unwrap_or(candidate))
        .ok_or_else(|| anyhow!("Could not find cover source folder: {source_path}"))?;

    Ok(source_dir)
}

fn build_archive_index(source_dir: &Path) -> Result<HashMap<String, ArchiveCover>> {
    let mut index = HashMap::new();
    for entry in fs::read_dir(source_dir).with_context(|| {
        format!(
            "Could not read cover source folder {}",
            source_dir.display()
        )
    })? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }

        let path = entry.path();
        let Some(extension) = normalized_extension(&path) else {
            continue;
        };
        if !SUPPORTED_ARCHIVE_EXTENSIONS.contains(&extension.as_str()) {
            continue;
        }

        let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        let Some(mime_type) = mime_type_for_extension(&extension) else {
            continue;
        };

        index
            .entry(normalize_cover_key(stem))
            .or_insert(ArchiveCover {
                path,
                extension: canonical_image_extension(&extension).to_string(),
                mime_type: mime_type.to_string(),
            });
    }
    Ok(index)
}

fn load_album_cover_candidates(conn: &Connection) -> Result<Vec<AlbumCoverCandidate>> {
    let mut stmt = conn.prepare(
        "
        SELECT
            a.id,
            t.file_path,
            t.filename
        FROM albums a
        LEFT JOIN tracks t ON t.id = (
            SELECT tx.id
            FROM tracks tx
            WHERE tx.album_id = a.id
            ORDER BY
                COALESCE(tx.disc_number, 999999),
                COALESCE(tx.track_number, 999999),
                tx.id
            LIMIT 1
        )
        ORDER BY
            a.album_artist_display COLLATE NOCASE,
            a.year,
            a.album COLLATE NOCASE,
            a.id
        ",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(AlbumCoverCandidate {
            album_id: row.get(0)?,
            file_path: row.get(1)?,
            filename: row.get(2)?,
        })
    })?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load albums for cover import")
}

fn load_existing_covers(conn: &Connection) -> Result<HashMap<String, ExistingCover>> {
    let mut stmt = conn.prepare(
        "
        SELECT album_id, cache_path
        FROM album_covers
        ",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            ExistingCover {
                cache_path: row.get(1)?,
            },
        ))
    })?;

    rows.collect::<rusqlite::Result<HashMap<_, _>>>()
        .context("Could not load existing cover metadata")
}

fn has_valid_existing_cover(
    album_id: &str,
    existing_covers: &HashMap<String, ExistingCover>,
) -> bool {
    existing_covers
        .get(album_id)
        .map(|cover| Path::new(&cover.cache_path).is_file())
        .unwrap_or(false)
}

fn find_cover_for_album(
    album: &AlbumCoverCandidate,
    archive_index: &HashMap<String, ArchiveCover>,
    extract_embedded_fallback: bool,
) -> Result<Option<CoverPayload>> {
    if let Some(folder_name) = album.file_path.as_deref().and_then(folder_name_from_path) {
        let key = normalize_cover_key(&folder_name);
        if let Some(archive_cover) = archive_index.get(&key) {
            return Ok(Some(CoverPayload::ArchiveFile {
                path: archive_cover.path.clone(),
                extension: archive_cover.extension.clone(),
                mime_type: archive_cover.mime_type.clone(),
            }));
        }
    }

    if extract_embedded_fallback {
        return extract_embedded_cover(album);
    }

    Ok(None)
}

fn folder_name_from_path(file_path: &str) -> Option<String> {
    let trimmed = file_path
        .trim()
        .trim_end_matches(|character| character == '\\' || character == '/');
    if trimmed.is_empty() {
        return None;
    }

    Path::new(trimmed)
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::to_string)
        .or_else(|| {
            trimmed
                .rsplit(|character| character == '\\' || character == '/')
                .next()
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
}

fn extract_embedded_cover(album: &AlbumCoverCandidate) -> Result<Option<CoverPayload>> {
    let Some(track_path) = representative_track_path(album) else {
        return Ok(None);
    };
    if normalized_extension(&track_path).as_deref() != Some("mp3") || !track_path.is_file() {
        return Ok(None);
    }

    let tag = match Tag::read_from_path(&track_path) {
        Ok(tag) => tag,
        Err(_) => return Ok(None),
    };

    let mut fallback_picture = None;
    let mut selected_picture = None;
    for picture in tag.pictures() {
        if fallback_picture.is_none() {
            fallback_picture = Some(picture);
        }
        if picture.picture_type == PictureType::CoverFront {
            selected_picture = Some(picture);
            break;
        }
    }

    let Some(picture) = selected_picture.or(fallback_picture) else {
        return Ok(None);
    };
    let Some((extension, mime_type)) =
        image_type_for_embedded_picture(&picture.mime_type, &picture.data)
    else {
        return Ok(None);
    };

    Ok(Some(CoverPayload::EmbeddedBytes {
        source_path: track_path,
        extension,
        mime_type,
        bytes: picture.data.clone(),
    }))
}

fn representative_track_path(album: &AlbumCoverCandidate) -> Option<PathBuf> {
    let file_path = album.file_path.as_deref()?.trim();
    let filename = album.filename.as_deref()?.trim();
    if file_path.is_empty() || filename.is_empty() {
        return None;
    }

    Some(PathBuf::from(file_path).join(filename))
}

struct ImportedCover {
    source: String,
    source_path: String,
    cache_path: String,
    mime_type: String,
    extension: String,
    file_size_bytes: i64,
}

fn import_cover_payload(
    cache_dir: &Path,
    album_id: &str,
    payload: CoverPayload,
) -> Result<ImportedCover> {
    let cache_stem = cover_cache_stem(album_id);
    let (source, source_path, extension, mime_type, destination) = match &payload {
        CoverPayload::ArchiveFile {
            path,
            extension,
            mime_type,
        } => (
            "archive".to_string(),
            path.display().to_string(),
            extension.clone(),
            mime_type.clone(),
            cache_dir.join(format!("{cache_stem}.{extension}")),
        ),
        CoverPayload::EmbeddedBytes {
            source_path,
            extension,
            mime_type,
            ..
        } => (
            "embedded".to_string(),
            source_path.display().to_string(),
            extension.clone(),
            mime_type.clone(),
            cache_dir.join(format!("{cache_stem}.{extension}")),
        ),
    };

    remove_stale_cache_files(cache_dir, &cache_stem, &destination)?;

    match payload {
        CoverPayload::ArchiveFile { path, .. } => {
            fs::copy(&path, &destination).with_context(|| {
                format!(
                    "Could not copy cover from {} to {}",
                    path.display(),
                    destination.display()
                )
            })?;
        }
        CoverPayload::EmbeddedBytes { bytes, .. } => {
            fs::write(&destination, bytes)
                .with_context(|| format!("Could not write cover {}", destination.display()))?;
        }
    }

    let file_size_bytes = fs::metadata(&destination)
        .with_context(|| format!("Could not read cover metadata {}", destination.display()))?
        .len() as i64;

    Ok(ImportedCover {
        source,
        source_path,
        cache_path: destination.display().to_string(),
        mime_type,
        extension,
        file_size_bytes,
    })
}

fn remove_stale_cache_files(cache_dir: &Path, cache_stem: &str, destination: &Path) -> Result<()> {
    for extension in SUPPORTED_ARCHIVE_EXTENSIONS {
        let extension = canonical_image_extension(extension);
        let stale_path = cache_dir.join(format!("{cache_stem}.{extension}"));
        if stale_path != destination && stale_path.is_file() {
            fs::remove_file(&stale_path).with_context(|| {
                format!("Could not remove stale cover {}", stale_path.display())
            })?;
        }
    }
    Ok(())
}

fn cover_cache_stem(album_id: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(album_id.as_bytes());
    hex::encode(hasher.finalize())
}

fn normalized_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.trim_start_matches('.').to_ascii_lowercase())
        .filter(|value| !value.is_empty())
}

fn normalize_cover_key(value: &str) -> String {
    value.trim().to_lowercase()
}

fn canonical_image_extension(extension: &str) -> &str {
    match extension {
        "jpeg" => "jpg",
        other => other,
    }
}

fn mime_type_for_extension(extension: &str) -> Option<&'static str> {
    match canonical_image_extension(extension) {
        "jpg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "gif" => Some("image/gif"),
        "bmp" => Some("image/bmp"),
        _ => None,
    }
}

fn image_type_for_embedded_picture(mime_type: &str, bytes: &[u8]) -> Option<(String, String)> {
    let normalized_mime = mime_type.trim().to_ascii_lowercase();
    match normalized_mime.as_str() {
        "image/jpeg" | "image/jpg" => Some(("jpg".to_string(), "image/jpeg".to_string())),
        "image/png" => Some(("png".to_string(), "image/png".to_string())),
        "image/gif" => Some(("gif".to_string(), "image/gif".to_string())),
        "image/bmp" => Some(("bmp".to_string(), "image/bmp".to_string())),
        _ if bytes.starts_with(&[0xff, 0xd8, 0xff]) => {
            Some(("jpg".to_string(), "image/jpeg".to_string()))
        }
        _ if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => {
            Some(("png".to_string(), "image/png".to_string()))
        }
        _ if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") => {
            Some(("gif".to_string(), "image/gif".to_string()))
        }
        _ if bytes.starts_with(b"BM") => Some(("bmp".to_string(), "image/bmp".to_string())),
        _ => None,
    }
}

fn maybe_emit_running_progress(app: &AppHandle, counters: &CoverCounters) {
    if counters.scanned_albums % 250 == 0 || counters.scanned_albums == counters.total_albums {
        emit_progress(
            app,
            "running",
            counters,
            progress_percent(counters),
            "Scanning album folders for cover art.",
        );
    }
}

fn progress_percent(counters: &CoverCounters) -> f64 {
    if counters.total_albums == 0 {
        100.0
    } else {
        counters.scanned_albums as f64 / counters.total_albums as f64 * 100.0
    }
}

fn emit_progress(
    app: &AppHandle,
    status: &str,
    counters: &CoverCounters,
    percent: f64,
    message: &str,
) {
    let _ = app.emit(
        "cover-import-progress",
        CoverImportProgress {
            status: status.to_string(),
            total_albums: counters.total_albums,
            scanned_albums: counters.scanned_albums,
            new_covers_found: counters.new_covers_found,
            imported_covers: counters.imported_covers,
            skipped_existing: counters.skipped_existing,
            missing_covers: counters.missing_covers,
            percent,
            message: message.to_string(),
        },
    );
}
