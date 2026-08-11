use crate::db;
use crate::discogs;
use crate::models::{CoverImportProgress, CoverImportRequest, CoverImportSummary};
use anyhow::{anyhow, bail, Context, Result};
use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use id3::frame::PictureType;
use id3::Tag;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Read as _;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use url::Url;

const SUPPORTED_ARCHIVE_EXTENSIONS: [&str; 5] = ["jpg", "jpeg", "png", "gif", "bmp"];
const COMPLETION_COVER_MAX_BYTES: usize = 5 * 1024 * 1024;
const COMPLETION_COVER_REQUEST_INTERVAL: Duration = Duration::from_millis(1_200);
const COMPLETION_COVER_USER_AGENT: &str =
    "music-backup-v5/0.115.0 (local desktop cover enrichment)";

static COMPLETION_COVER_REQUEST_GATE: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCompletionCoverEnrichment {
    pub candidate_id: String,
    pub state: String,
    pub provider: Option<String>,
    pub message: String,
    pub has_cover: bool,
    pub checked_at: String,
}

struct CompletionCoverSource {
    provider: String,
    source_id: String,
}

struct DownloadedCompletionCover {
    source_url: String,
    mime_type: String,
    extension: String,
    bytes: Vec<u8>,
}

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
    source: String,
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
        destination_path: PathBuf,
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
    relinked_covers: u64,
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

pub fn album_cover_data_url(app: AppHandle, album_id: String) -> Result<Option<String>> {
    let (conn, _) = db::open(&app)?;
    let cover = conn
        .query_row(
            "
            SELECT cache_path, mime_type
            FROM album_covers
            WHERE album_id = ?1
            ",
            params![album_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .context("Could not load album cover metadata")?;

    let Some((cover_path, mime_type)) = cover else {
        return Ok(None);
    };

    let path = PathBuf::from(&cover_path);
    if !path.is_file() {
        return Ok(None);
    }

    let bytes = fs::read(&path)
        .with_context(|| format!("Could not read cover image {}", path.display()))?;
    let encoded = general_purpose::STANDARD.encode(bytes);
    Ok(Some(format!("data:{mime_type};base64,{encoded}")))
}

pub fn library_completion_cover_data_url(
    app: AppHandle,
    candidate_id: String,
) -> Result<Option<String>> {
    let candidate_id = validated_candidate_id(candidate_id)?;
    let (conn, _) = db::open(&app)?;
    let cover = conn
        .query_row(
            "
            SELECT cover_cache_path, cover_mime_type
            FROM library_completion_verifications
            WHERE candidate_key = ?1 AND cover_state = 'available'
            ",
            params![candidate_id],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                ))
            },
        )
        .optional()
        .context("Could not load Library Completion cover metadata")?;
    let Some((Some(cover_path), Some(mime_type))) = cover else {
        return Ok(None);
    };
    let path = PathBuf::from(&cover_path);
    if !path.is_file() {
        return Ok(None);
    }
    let bytes = fs::read(&path)
        .with_context(|| format!("Could not read enriched cover {}", path.display()))?;
    Ok(Some(format!(
        "data:{mime_type};base64,{}",
        general_purpose::STANDARD.encode(bytes)
    )))
}

pub fn enrich_library_completion_cover(
    app: AppHandle,
    candidate_id: String,
) -> Result<LibraryCompletionCoverEnrichment> {
    let candidate_id = validated_candidate_id(candidate_id)?;
    let (conn, _) = db::open(&app)?;
    let stored = conn
        .query_row(
            "
            SELECT outcome, musicbrainz_id, musicbrainz_outcome,
                   discogs_master_id, discogs_outcome, cover_state,
                   cover_provider, cover_cache_path, cover_message, cover_checked_at
            FROM library_completion_verifications
            WHERE candidate_key = ?1
            ",
            params![candidate_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                ))
            },
        )
        .optional()
        .context("Could not load the verified album for cover enrichment")?
        .context("Verify this album before enriching its cover.")?;

    if stored.0 != "verified" {
        bail!("Cover enrichment is available after the album is verified.")
    }
    if stored.5.as_deref() == Some("available") {
        if let Some(path) = stored.7.as_deref().map(Path::new) {
            if path.is_file() {
                return Ok(LibraryCompletionCoverEnrichment {
                    candidate_id,
                    state: "available".to_string(),
                    provider: stored.6,
                    message: stored
                        .8
                        .unwrap_or_else(|| "Provider artwork is cached locally.".to_string()),
                    has_cover: true,
                    checked_at: stored.9.unwrap_or_else(|| Utc::now().to_rfc3339()),
                });
            }
        }
    }

    let source = if stored.2.as_deref() == Some("verified") {
        stored.1.map(|source_id| CompletionCoverSource {
            provider: "musicbrainz".to_string(),
            source_id,
        })
    } else if stored.4.as_deref() == Some("verified") {
        stored.3.map(|source_id| CompletionCoverSource {
            provider: "discogs".to_string(),
            source_id,
        })
    } else {
        None
    }
    .context("The verified provider did not save an identifier for cover enrichment.")?;

    let checking_at = Utc::now().to_rfc3339();
    save_completion_cover_state(
        &conn,
        &candidate_id,
        "checking",
        Some(&source.provider),
        None,
        None,
        None,
        "Fetching provider artwork without changing album verification.",
        &checking_at,
    )?;
    drop(conn);

    let result = fetch_completion_cover(&source).and_then(|cover| match cover {
        Some(cover) => cache_completion_cover(&app, &candidate_id, cover).map(Some),
        None => Ok(None),
    });
    let (conn, _) = db::open(&app)?;
    let checked_at = Utc::now().to_rfc3339();
    match result {
        Ok(Some((source_url, cache_path, mime_type))) => {
            let message = match source.provider.as_str() {
                "musicbrainz" => "Cover Art Archive front artwork cached locally.",
                _ => "Discogs primary master artwork cached locally.",
            };
            save_completion_cover_state(
                &conn,
                &candidate_id,
                "available",
                Some(&source.provider),
                Some(&source_url),
                Some(&cache_path),
                Some(&mime_type),
                message,
                &checked_at,
            )?;
            Ok(LibraryCompletionCoverEnrichment {
                candidate_id,
                state: "available".to_string(),
                provider: Some(source.provider),
                message: message.to_string(),
                has_cover: true,
                checked_at,
            })
        }
        Ok(None) => {
            let message = match source.provider.as_str() {
                "musicbrainz" => {
                    "Cover Art Archive has no selected front image for this release group."
                }
                _ => "Discogs has no image attached to this master.",
            };
            save_completion_cover_state(
                &conn,
                &candidate_id,
                "unavailable",
                Some(&source.provider),
                None,
                None,
                None,
                message,
                &checked_at,
            )?;
            Ok(LibraryCompletionCoverEnrichment {
                candidate_id,
                state: "unavailable".to_string(),
                provider: Some(source.provider),
                message: message.to_string(),
                has_cover: false,
                checked_at,
            })
        }
        Err(error) => {
            let message = format!("Cover enrichment failed: {error}");
            save_completion_cover_state(
                &conn,
                &candidate_id,
                "failed",
                Some(&source.provider),
                None,
                None,
                None,
                &message,
                &checked_at,
            )?;
            Ok(LibraryCompletionCoverEnrichment {
                candidate_id,
                state: "failed".to_string(),
                provider: Some(source.provider),
                message,
                has_cover: false,
                checked_at,
            })
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn save_completion_cover_state(
    conn: &Connection,
    candidate_id: &str,
    state: &str,
    provider: Option<&str>,
    source_url: Option<&str>,
    cache_path: Option<&str>,
    mime_type: Option<&str>,
    message: &str,
    checked_at: &str,
) -> Result<()> {
    let changed = conn.execute(
        "
        UPDATE library_completion_verifications
        SET cover_state = ?2,
            cover_provider = ?3,
            cover_source_url = ?4,
            cover_cache_path = ?5,
            cover_mime_type = ?6,
            cover_message = ?7,
            cover_checked_at = ?8
        WHERE candidate_key = ?1
        ",
        params![
            candidate_id,
            state,
            provider,
            source_url,
            cache_path,
            mime_type,
            message,
            checked_at,
        ],
    )?;
    if changed != 1 {
        bail!("The verified album is no longer available for cover enrichment.")
    }
    Ok(())
}

fn validated_candidate_id(candidate_id: String) -> Result<String> {
    let candidate_id = candidate_id.trim().to_string();
    if candidate_id.is_empty() || candidate_id.chars().count() > 800 {
        bail!("The Library Completion candidate identifier is invalid.")
    }
    Ok(candidate_id)
}

fn fetch_completion_cover(
    source: &CompletionCoverSource,
) -> Result<Option<DownloadedCompletionCover>> {
    let url = match source.provider.as_str() {
        "musicbrainz" => {
            if !valid_musicbrainz_id(&source.source_id) {
                bail!("The MusicBrainz release-group identifier is invalid.")
            }
            format!(
                "https://coverartarchive.org/release-group/{}/front-500",
                source.source_id
            )
        }
        "discogs" => match discogs::master_cover_url(&source.source_id)? {
            Some(url) => url,
            None => return Ok(None),
        },
        _ => bail!("The cover provider is not supported."),
    };
    download_completion_cover(&url)
}

fn download_completion_cover(url: &str) -> Result<Option<DownloadedCompletionCover>> {
    validate_remote_cover_url(url)?;
    wait_for_completion_cover_request_slot();
    let response = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(30))
        .redirects(5)
        .build()
        .get(url)
        .set("Accept", "image/jpeg,image/png")
        .set("User-Agent", COMPLETION_COVER_USER_AGENT)
        .call();
    let response = match response {
        Ok(response) => response,
        Err(ureq::Error::Status(404, _)) => return Ok(None),
        Err(ureq::Error::Status(429 | 503, _)) => {
            bail!("the artwork provider is temporarily rate limited")
        }
        Err(ureq::Error::Status(status, _)) => {
            bail!("the artwork provider returned status {status}")
        }
        Err(ureq::Error::Transport(_)) => bail!("the artwork provider could not be reached"),
    };
    validate_remote_cover_url(response.get_url())?;
    if let Some(length) = response
        .header("Content-Length")
        .and_then(|value| value.parse::<usize>().ok())
    {
        if length > COMPLETION_COVER_MAX_BYTES {
            bail!("the provider image is larger than the 5 MB safety limit")
        }
    }
    let mime_type = response
        .header("Content-Type")
        .unwrap_or_default()
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    let extension = match mime_type.as_str() {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/png" => "png",
        _ => bail!("the provider returned an unsupported image type"),
    };
    let source_url = response.get_url().to_string();
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take((COMPLETION_COVER_MAX_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .context("Could not read the provider artwork")?;
    if bytes.is_empty() || bytes.len() > COMPLETION_COVER_MAX_BYTES {
        bail!("the provider image is empty or larger than the 5 MB safety limit")
    }
    Ok(Some(DownloadedCompletionCover {
        source_url,
        mime_type,
        extension: extension.to_string(),
        bytes,
    }))
}

fn cache_completion_cover(
    app: &AppHandle,
    candidate_id: &str,
    cover: DownloadedCompletionCover,
) -> Result<(String, String, String)> {
    let cache_dir = cover_cache_dir(app)?.join("library-completion");
    fs::create_dir_all(&cache_dir)
        .with_context(|| format!("Could not create cover cache {}", cache_dir.display()))?;
    let cache_stem = cover_cache_stem(candidate_id);
    let destination = cache_dir.join(format!("{cache_stem}.{}", cover.extension));
    remove_stale_cache_files(&cache_dir, &cache_stem, Some(&destination))?;
    fs::write(&destination, &cover.bytes)
        .with_context(|| format!("Could not cache cover {}", destination.display()))?;
    Ok((
        cover.source_url,
        destination.display().to_string(),
        cover.mime_type,
    ))
}

fn wait_for_completion_cover_request_slot() {
    let gate = COMPLETION_COVER_REQUEST_GATE.get_or_init(|| Mutex::new(None));
    let mut last_request = gate.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(last_request_at) = *last_request {
        let elapsed = last_request_at.elapsed();
        if elapsed < COMPLETION_COVER_REQUEST_INTERVAL {
            thread::sleep(COMPLETION_COVER_REQUEST_INTERVAL - elapsed);
        }
    }
    *last_request = Some(Instant::now());
}

fn validate_remote_cover_url(value: &str) -> Result<()> {
    let url = Url::parse(value).context("The provider returned an invalid artwork URL")?;
    if url.scheme() != "https" {
        bail!("The provider artwork URL is not secure.")
    }
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    let trusted = host == "coverartarchive.org"
        || host == "archive.org"
        || host.ends_with(".archive.org")
        || host == "i.discogs.com";
    if !trusted {
        bail!("The provider artwork URL uses an untrusted host.")
    }
    Ok(())
}

fn valid_musicbrainz_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && bytes.iter().enumerate().all(|(index, byte)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                *byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
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

        match find_cover_for_album(
            &album,
            &archive_index,
            &source_dir,
            request.extract_embedded_fallback,
        )? {
            Some(payload) => {
                let existing_cover = existing_covers.get(&album.album_id);
                if !request.replace_existing
                    && existing_cover_matches_payload(existing_cover, &payload)
                {
                    counters.skipped_existing += 1;
                    maybe_emit_running_progress(app, &counters);
                    continue;
                }

                if existing_cover
                    .map(has_valid_existing_cover)
                    .unwrap_or(false)
                {
                    counters.relinked_covers += 1;
                } else {
                    counters.new_covers_found += 1;
                }

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
                if !request.replace_existing
                    && existing_covers
                        .get(&album.album_id)
                        .map(has_valid_existing_cover)
                        .unwrap_or(false)
                {
                    counters.skipped_existing += 1;
                } else {
                    counters.missing_covers += 1;
                }
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
        relinked_covers: counters.relinked_covers,
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
        SELECT album_id, source, cache_path
        FROM album_covers
        ",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            ExistingCover {
                source: row.get(1)?,
                cache_path: row.get(2)?,
            },
        ))
    })?;

    rows.collect::<rusqlite::Result<HashMap<_, _>>>()
        .context("Could not load existing cover metadata")
}

fn has_valid_existing_cover(cover: &ExistingCover) -> bool {
    Path::new(&cover.cache_path).is_file()
}

fn existing_cover_matches_payload(
    existing_cover: Option<&ExistingCover>,
    payload: &CoverPayload,
) -> bool {
    let Some(existing_cover) = existing_cover else {
        return false;
    };
    if !has_valid_existing_cover(existing_cover) {
        return false;
    }

    match payload {
        CoverPayload::ArchiveFile { path, .. } => {
            existing_cover.source == "archive"
                && paths_equal(Path::new(&existing_cover.cache_path), path)
        }
        CoverPayload::EmbeddedBytes {
            destination_path, ..
        } => {
            existing_cover.source == "embedded"
                && paths_equal(Path::new(&existing_cover.cache_path), destination_path)
        }
    }
}

fn find_cover_for_album(
    album: &AlbumCoverCandidate,
    archive_index: &HashMap<String, ArchiveCover>,
    source_dir: &Path,
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
        return extract_embedded_cover(album, source_dir);
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

fn extract_embedded_cover(
    album: &AlbumCoverCandidate,
    cover_source_dir: &Path,
) -> Result<Option<CoverPayload>> {
    let Some(folder_name) = album.file_path.as_deref().and_then(folder_name_from_path) else {
        return Ok(None);
    };
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
        destination_path: cover_source_dir.join(format!("{folder_name}.{extension}")),
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
            path.clone(),
        ),
        CoverPayload::EmbeddedBytes {
            source_path,
            destination_path,
            extension,
            mime_type,
            ..
        } => (
            "embedded".to_string(),
            source_path.display().to_string(),
            extension.clone(),
            mime_type.clone(),
            destination_path.clone(),
        ),
    };

    remove_stale_cache_files(cache_dir, &cache_stem, Some(&destination))?;

    match payload {
        CoverPayload::ArchiveFile { .. } => {}
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

fn remove_stale_cache_files(
    cache_dir: &Path,
    cache_stem: &str,
    destination: Option<&Path>,
) -> Result<()> {
    for extension in SUPPORTED_ARCHIVE_EXTENSIONS {
        let extension = canonical_image_extension(extension);
        let stale_path = cache_dir.join(format!("{cache_stem}.{extension}"));
        let is_destination = destination
            .map(|destination| paths_equal(&stale_path, destination))
            .unwrap_or(false);
        if !is_destination && stale_path.is_file() {
            fs::remove_file(&stale_path).with_context(|| {
                format!("Could not remove stale cover {}", stale_path.display())
            })?;
        }
    }
    Ok(())
}

fn paths_equal(left: &Path, right: &Path) -> bool {
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => left == right,
    }
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
            relinked_covers: counters.relinked_covers,
            skipped_existing: counters.skipped_existing,
            missing_covers: counters.missing_covers,
            percent,
            message: message.to_string(),
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn completion_cover_urls_are_limited_to_provider_hosts() {
        assert!(validate_remote_cover_url(
            "https://coverartarchive.org/release-group/48140466-cff6-3222-bd55-63c27e43190d/front-500"
        )
        .is_ok());
        assert!(
            validate_remote_cover_url("https://ia801.example.us.archive.org/cover.jpg").is_ok()
        );
        assert!(validate_remote_cover_url("https://i.discogs.com/cover.jpeg").is_ok());
        assert!(validate_remote_cover_url("http://i.discogs.com/cover.jpeg").is_err());
        assert!(validate_remote_cover_url("https://evilarchive.org/cover.jpg").is_err());
    }

    #[test]
    fn completion_cover_release_group_ids_require_uuid_shape() {
        assert!(valid_musicbrainz_id("48140466-cff6-3222-bd55-63c27e43190d"));
        assert!(!valid_musicbrainz_id("../../cover.jpg"));
        assert!(!valid_musicbrainz_id(
            "48140466-cff6-3222-bd55-63c27e43190z"
        ));
    }
}
