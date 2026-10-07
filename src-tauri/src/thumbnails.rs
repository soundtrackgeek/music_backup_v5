//! ID-only artwork protocol. Original images never cross IPC or enter JS memory.
use anyhow::{bail, Context, Result};
use fast_image_resize::{images::Image, PixelType, Resizer};
use image::{codecs::webp::WebPEncoder, ExtendedColorType, ImageEncoder, ImageReader, Limits};
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::http::{Request, Response, StatusCode};

const SIZES: [u32; 3] = [96, 300, 600];
// Bound decoded-image memory across requests and background prewarming.
static GENERATION: Mutex<()> = Mutex::new(());
static SOURCE_FILES: Mutex<()> = Mutex::new(());
const MAX_SOURCE_BYTES: u64 = 64 * 1024 * 1024;

// Windows archive replacement must not overlap our own source-file handles.
pub(crate) fn with_source_write<T>(write: impl FnOnce() -> Result<T>) -> Result<T> {
    let _guard = SOURCE_FILES.lock().unwrap_or_else(|e| e.into_inner());
    write()
}

struct Reader {
    connection: Connection,
    stamp: (u64, SystemTime),
}

pub struct ThumbnailService {
    database: PathBuf,
    directory: PathBuf,
    reader: Mutex<Option<Reader>>,
    redirect_aliases: bool,
}

#[derive(Debug)]
struct ArtworkRequest {
    kind: String,
    id: String,
    size: u32,
    version: Option<String>,
}

impl ArtworkRequest {
    fn parse(request: &Request<Vec<u8>>) -> Result<Self> {
        let url = url::Url::parse(&request.uri().to_string())?;
        // convertFileSrc encodes the entire path, including its slashes.
        let path = percent_encoding::percent_decode_str(url.path()).decode_utf8()?;
        let (kind, id) = path
            .trim_start_matches('/')
            .split_once('/')
            .context("Missing artwork ID")?;
        if !matches!(kind, "album" | "artist" | "completion")
            || id.is_empty()
            || id.len() > 1024
            || id.chars().any(char::is_control)
        {
            bail!("Invalid artwork ID");
        }
        let mut size = 300;
        let mut version = None;
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "size" => size = value.parse()?,
                "v" => version = Some(value.into_owned()),
                "r" => {} // frontend refresh token; never interpreted as a path
                _ => bail!("Invalid artwork parameter"),
            }
        }
        if !SIZES.contains(&size) {
            bail!("Unsupported thumbnail size");
        }
        Ok(Self {
            kind: kind.into(),
            id: if kind == "artist" {
                crate::identity::artist_text_key(id)
            } else {
                id.into()
            },
            size,
            version,
        })
    }

    fn identity(&self) -> String {
        format!("{}:{}", self.kind, self.id)
    }
}

impl ThumbnailService {
    pub fn new(database: PathBuf, directory: PathBuf) -> Self {
        Self {
            database,
            directory,
            reader: Mutex::new(None),
            // WKURLSchemeTask's response API does not perform HTTP redirects.
            redirect_aliases: cfg!(target_os = "windows"),
        }
    }

    pub(crate) fn with_catalog_replacement<T>(
        &self,
        replace: impl FnOnce() -> Result<T>,
    ) -> Result<T> {
        // Release SQLite/WAL handles and exclude new readers during restore.
        let mut reader = self.reader.lock().unwrap_or_else(|e| e.into_inner());
        *reader = None;
        replace()
    }

    fn source(&self, request: &ArtworkRequest) -> Result<Option<(PathBuf, String)>> {
        let metadata = fs::metadata(&self.database)?;
        let stamp = (metadata.len(), metadata.modified()?);
        let mut reader = self.reader.lock().unwrap_or_else(|e| e.into_inner());
        // A restored catalog can replace the file underneath an open connection.
        if reader.as_ref().is_none_or(|reader| reader.stamp != stamp) {
            let connection =
                Connection::open_with_flags(&self.database, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
            connection.busy_timeout(Duration::from_secs(2))?;
            *reader = Some(Reader { connection, stamp });
        }
        let conn = &reader.as_ref().unwrap().connection;
        let sql = match request.kind.as_str() {
            "album" => "SELECT cache_path, imported_at FROM album_covers WHERE album_id = ?1",
            "artist" => "SELECT cache_path, fetched_at FROM artist_images WHERE artist_key = ?1 AND state = 'available'",
            "completion" => "SELECT cover_cache_path, cover_checked_at FROM library_completion_verifications WHERE candidate_key = ?1 AND cover_state = 'available'",
            _ => unreachable!(),
        };
        let id = if request.kind == "artist" {
            crate::identity::artist_text_key(&request.id)
        } else {
            request.id.clone()
        };
        let record = conn
            .prepare_cached(sql)?
            .query_row([id], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                ))
            })
            .optional()?;
        let Some((Some(path), revision)) = record else {
            return Ok(None);
        };
        let path = PathBuf::from(path);
        #[cfg(target_os = "macos")]
        let path = if request.kind == "album" && !path.is_file() {
            let root: String = conn.query_row(
                "SELECT cover_source_path FROM app_settings WHERE id = 1",
                [],
                |row| row.get(0),
            )?;
            crate::covers::mounted_archive_cover(&root, &path.to_string_lossy()).unwrap_or(path)
        } else {
            path
        };
        Ok(path
            .is_file()
            .then_some((path, revision.unwrap_or_default())))
    }

    pub fn respond(&self, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
        if request.method() != "GET" && request.method() != "HEAD" {
            return empty(StatusCode::METHOD_NOT_ALLOWED);
        }
        let artwork = match ArtworkRequest::parse(&request) {
            Ok(artwork) => artwork,
            Err(_) => return empty(StatusCode::BAD_REQUEST),
        };
        match self.deliver(&request, &artwork) {
            Ok(response) => response,
            Err(error) => {
                eprintln!("Thumbnail delivery failed: {error:#}");
                empty(StatusCode::NOT_FOUND)
            }
        }
    }

    fn deliver(
        &self,
        request: &Request<Vec<u8>>,
        artwork: &ArtworkRequest,
    ) -> Result<Response<Vec<u8>>> {
        let Some((source, revision)) = self.source(artwork)? else {
            return Ok(empty(StatusCode::NOT_FOUND));
        };
        let (path, version) = cache_entry(
            &self.directory,
            &artwork.identity(),
            &source,
            &revision,
            artwork.size,
        )?;
        let immutable = artwork.version.as_deref() == Some(&version);
        if !immutable && self.redirect_aliases {
            let mut url = url::Url::parse(&request.uri().to_string())?;
            // Wry translates Windows requests back to cover:// before dispatch.
            // Redirects must use the browser-visible WebView2 HTTP origin.
            #[cfg(target_os = "windows")]
            if url.scheme() == "cover" {
                url = url::Url::parse(&format!("http://cover.localhost{}", url.path()))?;
            }
            url.set_query(None);
            url.query_pairs_mut()
                .append_pair("size", &artwork.size.to_string())
                .append_pair("v", &version);
            // The ID alias must revalidate; only a source-versioned URL is immutable.
            return Ok(Response::builder()
                .status(StatusCode::TEMPORARY_REDIRECT)
                .header("Location", url.as_str())
                .header("Cache-Control", "no-store")
                .body(Vec::new())?);
        }
        generate(&path, &source, artwork.size)?;
        let (_, current_version) = cache_entry(
            &self.directory,
            &artwork.identity(),
            &source,
            &revision,
            artwork.size,
        )?;
        if current_version != version {
            bail!("Artwork changed before delivery");
        }
        let etag = format!("\"{version}\"");
        let not_modified = request
            .headers()
            .get("If-None-Match")
            .is_some_and(|value| value == etag.as_str());
        let bytes = if not_modified || request.method() == "HEAD" {
            Vec::new()
        } else {
            fs::read(path)?
        };
        Ok(Response::builder()
            .status(if not_modified {
                StatusCode::NOT_MODIFIED
            } else {
                StatusCode::OK
            })
            .header("Content-Type", "image/webp")
            .header("X-Content-Type-Options", "nosniff")
            .header(
                "Cache-Control",
                if immutable {
                    "public, max-age=31536000, immutable"
                } else {
                    "no-cache"
                },
            )
            .header("ETag", etag)
            .body(bytes)?)
    }
}

fn empty(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Cache-Control", "no-store")
        .body(Vec::new())
        .unwrap()
}

fn cache_entry(
    directory: &Path,
    identity: &str,
    source: &Path,
    revision: &str,
    size: u32,
) -> Result<(PathBuf, String)> {
    let metadata = fs::metadata(source)?;
    if !metadata.is_file() || metadata.len() > MAX_SOURCE_BYTES {
        bail!("Image exceeds the file limit");
    }
    let modified = metadata.modified()?.duration_since(UNIX_EPOCH)?.as_nanos();
    let folder = directory.join(hex::encode(Sha256::digest(identity.as_bytes())));
    let version = hex::encode(Sha256::digest(
        format!(
            "thumb-v1:{identity}:{}:{revision}:{}:{modified}:{size}",
            source.display(),
            metadata.len()
        )
        .as_bytes(),
    ));
    Ok((folder.join(format!("{size}-{version}.webp")), version))
}

fn generate(destination: &Path, source: &Path, size: u32) -> Result<()> {
    if destination.is_file() {
        return Ok(());
    }
    let _guard = GENERATION.lock().unwrap_or_else(|e| e.into_inner());
    if destination.is_file() {
        return Ok(());
    }
    let initial_metadata = fs::metadata(source)?;
    // Snapshot bounded bytes and close the source before slow image decoding.
    let bytes = {
        let _guard = SOURCE_FILES.lock().unwrap_or_else(|e| e.into_inner());
        let mut bytes = Vec::new();
        fs::File::open(source)?
            .take(MAX_SOURCE_BYTES + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_SOURCE_BYTES {
            bail!("Image exceeds the file limit");
        }
        bytes
    };
    let mut reader = ImageReader::new(Cursor::new(bytes)).with_guessed_format()?;
    let mut limits = Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode()?.to_rgba8();
    let scale = (size as f64 / f64::from(image.width().max(image.height()))).min(1.0);
    let width = (image.width() as f64 * scale).round().max(1.0) as u32;
    let height = (image.height() as f64 * scale).round().max(1.0) as u32;
    let mut resized = Image::new(width, height, PixelType::U8x4);
    Resizer::new().resize(&image, &mut resized, None)?;
    let mut bytes = Vec::new();
    WebPEncoder::new_lossless(&mut bytes).write_image(
        resized.buffer(),
        width,
        height,
        ExtendedColorType::Rgba8,
    )?;
    let final_metadata = fs::metadata(source)?;
    if initial_metadata.len() != final_metadata.len()
        || initial_metadata.modified()? != final_metadata.modified()?
    {
        bail!("Artwork changed while generating a thumbnail");
    }
    let directory = destination
        .parent()
        .context("Missing thumbnail directory")?;
    fs::create_dir_all(directory)?;
    let mut staged = tempfile::NamedTempFile::new_in(directory)?;
    staged.write_all(&bytes)?;
    staged.as_file().sync_all()?;
    staged.persist(destination).map_err(|error| error.error)?;
    // Keep one source revision per identity/size on disk.
    let stem = destination.file_stem().unwrap().to_string_lossy();
    let prefix = stem.rsplit_once('-').unwrap().0;
    for entry in fs::read_dir(directory)?.flatten() {
        let path = entry.path();
        if path != destination
            && entry
                .file_name()
                .to_string_lossy()
                .starts_with(&format!("{prefix}-"))
            && path.extension().is_some_and(|ext| ext == "webp")
        {
            let _ = fs::remove_file(path);
        }
    }
    Ok(())
}

type WarmBatch = (PathBuf, Vec<(String, PathBuf, String)>);
static PREWARM: OnceLock<std::sync::mpsc::SyncSender<WarmBatch>> = OnceLock::new();

/// Best-effort, bounded background work after a committed import or download.
pub fn prewarm(directory: PathBuf, sources: Vec<(String, PathBuf, String)>) {
    if sources.is_empty() {
        return;
    }
    let sender = PREWARM.get_or_init(|| {
        let (sender, receiver) = std::sync::mpsc::sync_channel::<WarmBatch>(4);
        std::thread::spawn(move || {
            while let Ok((directory, sources)) = receiver.recv() {
                for (identity, source, revision) in sources {
                    for size in SIZES {
                        if let Ok((destination, _)) =
                            cache_entry(&directory, &identity, &source, &revision, size)
                        {
                            let _ = generate(&destination, &source, size);
                        }
                        std::thread::yield_now();
                    }
                }
            }
        });
        sender
    });
    let _ = sender.try_send((directory, sources));
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GenericImageView, Rgba, RgbaImage};

    fn fixture() -> (tempfile::TempDir, ThumbnailService, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let database = temp.path().join("catalog.sqlite3");
        let source = temp.path().join("source.png");
        RgbaImage::from_pixel(1200, 800, Rgba([190, 20, 50, 180]))
            .save(&source)
            .unwrap();
        let conn = Connection::open(&database).unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL;
            CREATE TABLE album_covers (album_id TEXT PRIMARY KEY, cache_path TEXT, imported_at TEXT);
            CREATE TABLE artist_images (artist_key TEXT PRIMARY KEY, cache_path TEXT, fetched_at TEXT, state TEXT);
            CREATE TABLE library_completion_verifications (candidate_key TEXT PRIMARY KEY, cover_cache_path TEXT, cover_checked_at TEXT, cover_state TEXT);").unwrap();
        conn.execute(
            "INSERT INTO album_covers VALUES (?1, ?2, 'first')",
            rusqlite::params!["Björk / #?", source.to_str().unwrap()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO artist_images VALUES ('a-ha', ?1, 'first', 'available')",
            [source.to_str().unwrap()],
        )
        .unwrap();
        conn.execute("INSERT INTO library_completion_verifications VALUES ('candidate:1', ?1, 'first', 'available')", [source.to_str().unwrap()]).unwrap();
        let mut service = ThumbnailService::new(database, temp.path().join("thumbs"));
        service.redirect_aliases = true;
        (temp, service, source)
    }

    fn request(url: &str) -> Request<Vec<u8>> {
        Request::builder().uri(url).body(Vec::new()).unwrap()
    }

    fn alias(kind: &str, id: &str, size: u32) -> String {
        let encoded = percent_encoding::utf8_percent_encode(
            &format!("{kind}/{id}"),
            percent_encoding::NON_ALPHANUMERIC,
        )
        .to_string();
        format!("http://cover.localhost/{encoded}?size={size}")
    }

    fn follow(service: &ThumbnailService, url: &str) -> (String, Response<Vec<u8>>) {
        let redirect = service.respond(request(url));
        assert_eq!(redirect.status(), StatusCode::TEMPORARY_REDIRECT);
        assert_eq!(redirect.headers()["Cache-Control"], "no-store");
        let location = redirect.headers()["Location"].to_str().unwrap().to_string();
        let response = service.respond(request(&location));
        (location, response)
    }

    #[test]
    fn serves_all_sizes_as_cached_webp_without_changing_original() {
        let (_temp, service, source) = fixture();
        let original = fs::read(&source).unwrap();
        for size in SIZES {
            let (location, response) = follow(&service, &alias("album", "Björk / #?", size));
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(response.headers()["Content-Type"], "image/webp");
            assert_eq!(
                response.headers()["Cache-Control"],
                "public, max-age=31536000, immutable"
            );
            let image = image::load_from_memory(response.body()).unwrap();
            assert_eq!(
                image.dimensions(),
                (size, (size as f64 * 2.0 / 3.0).round() as u32)
            );
            assert_eq!(image.to_rgba8().get_pixel(0, 0)[3], 180);
            assert!(response.body().len() < original.len());
            let cached = service.respond(request(&location));
            assert_eq!(cached.body(), response.body());
            let conditional = Request::builder()
                .uri(&location)
                .header("If-None-Match", &response.headers()["ETag"])
                .body(Vec::new())
                .unwrap();
            assert_eq!(
                service.respond(conditional).status(),
                StatusCode::NOT_MODIFIED
            );
            let head = Request::builder()
                .method("HEAD")
                .uri(location)
                .body(Vec::new())
                .unwrap();
            assert!(service.respond(head).body().is_empty());
        }
        assert_eq!(fs::read(source).unwrap(), original);
    }

    #[test]
    fn observes_wal_changes_and_replaces_versioned_artwork() {
        let (_temp, service, source) = fixture();
        let alias = alias("album", "Björk / #?", 300);
        let (old_url, old) = follow(&service, &alias);
        let conn = Connection::open(&service.database).unwrap();
        RgbaImage::from_pixel(900, 900, Rgba([0, 240, 20, 255]))
            .save(&source)
            .unwrap();
        conn.execute("UPDATE album_covers SET imported_at = 'second'", [])
            .unwrap();
        let (new_url, new) = follow(&service, &alias);
        assert_ne!(old_url, new_url);
        assert_ne!(old.body(), new.body());
        assert_eq!(
            service.respond(request(&old_url)).status(),
            StatusCode::TEMPORARY_REDIRECT
        );
        let files = fs::read_dir(service.directory)
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert_eq!(fs::read_dir(files).unwrap().count(), 1);
    }

    #[test]
    fn detects_archive_replacement_without_catalog_changes_and_supports_legacy_formats() {
        let (temp, service, source) = fixture();
        let alias = alias("album", "Björk / #?", 96);
        let (old_url, _) = follow(&service, &alias);
        RgbaImage::from_pixel(40, 40, Rgba([20, 30, 200, 255]))
            .save(&source)
            .unwrap();
        let (new_url, image) = follow(&service, &alias);
        assert_ne!(old_url, new_url);
        assert_eq!(image.status(), StatusCode::OK);
        let conn = Connection::open(&service.database).unwrap();
        for extension in ["jpg", "gif", "bmp", "webp"] {
            let path = temp.path().join(format!("legacy.{extension}"));
            image::RgbImage::from_pixel(100, 50, image::Rgb([120, 90, 20]))
                .save(&path)
                .unwrap();
            conn.execute(
                "UPDATE album_covers SET cache_path = ?1",
                [path.to_str().unwrap()],
            )
            .unwrap();
            let (_, response) = follow(&service, &alias);
            assert_eq!(response.status(), StatusCode::OK, "{extension}");
        }
    }

    #[test]
    fn catalog_replacement_closes_reader_and_serves_the_restored_mapping() {
        let (_first, service, _source) = fixture();
        let (_second, restored, restored_source) = fixture();
        RgbaImage::from_pixel(100, 100, Rgba([10, 250, 90, 255]))
            .save(restored_source)
            .unwrap();
        let url = alias("album", "Björk / #?", 96);
        let (_, before) = follow(&service, &url);
        service
            .with_catalog_replacement(|| {
                fs::copy(&restored.database, &service.database)?;
                Ok(())
            })
            .unwrap();
        let (_, after) = follow(&service, &url);
        assert_eq!(after.status(), StatusCode::OK);
        assert_ne!(before.body(), after.body());
    }

    #[test]
    fn native_scheme_aliases_deliver_images_directly_with_revalidation() {
        let (_temp, mut service, source) = fixture();
        service.redirect_aliases = false;
        let url =
            alias("album", "Björk / #?", 96).replace("http://cover.localhost", "cover://localhost");
        let first = service.respond(request(&url));
        assert_eq!(first.status(), StatusCode::OK);
        assert_eq!(first.headers()["Cache-Control"], "no-cache");
        let conditional = Request::builder()
            .uri(&url)
            .header("If-None-Match", &first.headers()["ETag"])
            .body(Vec::new())
            .unwrap();
        assert_eq!(
            service.respond(conditional).status(),
            StatusCode::NOT_MODIFIED
        );
        RgbaImage::from_pixel(50, 50, Rgba([200, 10, 90, 255]))
            .save(source)
            .unwrap();
        let second = service.respond(request(&url));
        assert_eq!(second.status(), StatusCode::OK);
        assert_ne!(first.headers()["ETag"], second.headers()["ETag"]);
    }

    #[test]
    fn serves_artist_and_completion_from_ids_on_native_and_windows_origins() {
        let (_temp, service, _source) = fixture();
        let (_, artist) = follow(&service, &alias("artist", " A–Ha ", 96));
        assert_eq!(artist.status(), StatusCode::OK);
        let url = alias("completion", "candidate:1", 600)
            .replace("http://cover.localhost", "cover://localhost");
        let (_, completion) = follow(&service, &url);
        assert_eq!(completion.status(), StatusCode::OK);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn redirects_wrys_translated_uri_to_the_webview2_http_origin() {
        let (_temp, service, _source) = fixture();
        let url =
            alias("album", "Björk / #?", 96).replace("http://cover.localhost", "cover://localhost");
        let redirect = service.respond(request(&url));
        assert!(redirect.headers()["Location"]
            .to_str()
            .unwrap()
            .starts_with("http://cover.localhost/"));
        let (_, image) = follow(&service, &url);
        assert_eq!(image.status(), StatusCode::OK);
    }

    #[test]
    fn rejects_paths_sizes_methods_and_handles_missing_or_corrupt_sources() {
        let (_temp, service, source) = fixture();
        for url in [
            "http://cover.localhost/file/C:/secret",
            "http://cover.localhost/album/id?size=9999",
            "http://cover.localhost/album/id?path=C:/secret",
        ] {
            assert_eq!(
                service.respond(request(url)).status(),
                StatusCode::BAD_REQUEST
            );
        }
        assert_eq!(
            service
                .respond(request(&alias("album", "../../secret", 96)))
                .status(),
            StatusCode::NOT_FOUND
        );
        let post = Request::builder()
            .method("POST")
            .uri(alias("album", "Björk / #?", 96))
            .body(Vec::new())
            .unwrap();
        assert_eq!(
            service.respond(post).status(),
            StatusCode::METHOD_NOT_ALLOWED
        );
        fs::write(&source, b"not an image").unwrap();
        let (_, corrupt) = follow(&service, &alias("album", "Björk / #?", 96));
        assert_eq!(corrupt.status(), StatusCode::NOT_FOUND);
        fs::remove_file(source).unwrap();
        assert_eq!(
            service
                .respond(request(&alias("album", "Björk / #?", 96)))
                .status(),
            StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn never_upscales_small_sources_and_enforces_decode_limits() {
        let (_temp, service, source) = fixture();
        RgbaImage::from_pixel(20, 10, Rgba([0, 0, 0, 255]))
            .save(&source)
            .unwrap();
        let (_, response) = follow(&service, &alias("album", "Björk / #?", 600));
        assert_eq!(
            image::load_from_memory(response.body())
                .unwrap()
                .dimensions(),
            (20, 10)
        );
        RgbaImage::from_pixel(9000, 1, Rgba([0, 0, 0, 255]))
            .save(&source)
            .unwrap();
        let (_, response) = follow(&service, &alias("album", "Björk / #?", 600));
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
}
