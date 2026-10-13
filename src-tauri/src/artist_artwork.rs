//! MBID-bound artwork, local files, and per-file Commons attribution.
use anyhow::{bail, Context, Result};
use chrono::{DateTime, Duration, Utc};
use keyring::Entry;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Cursor, Read, Write},
    path::Path,
    sync::Mutex,
};
use tauri::{AppHandle, Manager};
use url::Url;
use zeroize::Zeroizing;

use crate::{artist_biography, db};
static REFRESH: Mutex<()> = Mutex::new(());
const MAX_JSON: u64 = 4 * 1024 * 1024;
const MAX_IMAGE: u64 = 16 * 1024 * 1024;
const TEST_MBID: &str = "cc197bad-dc9c-440d-a5b5-d52ba2e14234"; // Coldplay

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkCredit {
    pub provider: String,
    pub source_url: String,
    pub author: Option<String>,
    pub license: Option<String>,
    pub license_url: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ArtistArtwork {
    pub artist_id: String,
    pub artist_name: String,
    pub musicbrainz_mbid: Option<String>,
    pub portrait: Option<ArtworkCredit>,
    pub logo: Option<ArtworkCredit>,
    pub background: Option<ArtworkCredit>,
    pub fetched_at: Option<String>,
    pub cached: bool,
    pub stale: bool,
    pub message: String,
}
#[derive(Clone, Serialize, Deserialize)]
struct CachedArtwork {
    artwork: ArtistArtwork,
    portrait_path: Option<String>,
    logo_path: Option<String>,
    background_path: Option<String>,
    linked_mbid: Option<String>,
    fanart_configured: bool,
    expires_at: String,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FanartCredentialStatus {
    pub configured: bool,
    pub personal_key_configured: bool,
    #[specta(type = crate::wire_enums::AiKeySource)]
    pub source: String,
}
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SaveFanartKeysRequest {
    pub api_key: String,
    pub personal_key: Option<String>,
}
#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FanartConnectionTest {
    pub message: String,
}
#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ArtistArtworkSyncSummary {
    pub checked: u32,
    pub downloaded: u32,
    pub unavailable: u32,
    pub failed: u32,
    pub remaining: i64,
    pub message: String,
}
#[derive(Serialize, Deserialize)]
struct Keys {
    api_key: String,
    personal_key: Option<String>,
}
impl Drop for Keys {
    fn drop(&mut self) {
        use zeroize::Zeroize;
        self.api_key.zeroize();
        if let Some(key) = &mut self.personal_key {
            key.zeroize();
        }
    }
}
fn entry() -> Result<Entry> {
    Entry::new("com.local.musiclibrary.fanart", "api-keys")
        .context("Could not open the fanart.tv credential store")
}
fn validate_key(value: &str) -> Result<String> {
    let value = value.trim();
    if value.len() != 32 || !value.bytes().all(|c| c.is_ascii_hexdigit()) {
        bail!("Enter a valid 32-character fanart.tv key.");
    }
    Ok(value.to_owned())
}
fn stored_keys() -> Result<Option<Zeroizing<String>>> {
    match entry()?.get_password() {
        Ok(value) => Ok(Some(Zeroizing::new(value))),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => bail!("Could not read the fanart.tv credential store."),
    }
}
fn environment_keys() -> Option<Zeroizing<String>> {
    #[cfg(debug_assertions)]
    {
        let mut values = std::collections::HashMap::new();
        // Read development configuration without mutating process environment.
        for path in [Path::new(".env"), Path::new("../.env")] {
            if let Ok(iter) = dotenvy::from_path_iter(path) {
                for (key, value) in iter.flatten() {
                    if matches!(
                        key.as_str(),
                        "FANART_TV" | "FANART_TV_API_KEY" | "FANART_TV_PERSONAL_KEY"
                    ) {
                        values.entry(key).or_insert(Zeroizing::new(value));
                    }
                }
            }
        }
        let read = |name: &str| {
            std::env::var(name)
                .ok()
                .map(Zeroizing::new)
                .or_else(|| values.get(name).cloned())
        };
        let api = read("FANART_TV_API_KEY").or_else(|| read("FANART_TV"))?;
        let keys = Keys {
            api_key: validate_key(&api).ok()?,
            personal_key: read("FANART_TV_PERSONAL_KEY").and_then(|key| validate_key(&key).ok()),
        };
        return serde_json::to_string(&keys).ok().map(Zeroizing::new);
    }
    #[cfg(not(debug_assertions))]
    {
        None
    }
}
fn keys() -> Result<Option<Zeroizing<String>>> {
    Ok(stored_keys()?.or_else(environment_keys))
}
pub fn credential_status() -> Result<FanartCredentialStatus> {
    let stored = stored_keys()?;
    let source = if stored.is_some() {
        "windowsCredentialManager"
    } else {
        "environment"
    };
    let value = stored.or_else(environment_keys);
    let personal = value
        .as_ref()
        .map(|v| serde_json::from_str::<Keys>(v))
        .transpose()?
        .is_some_and(|v| v.personal_key.is_some());
    Ok(FanartCredentialStatus {
        configured: value.is_some(),
        personal_key_configured: personal,
        source: if value.is_some() { source } else { "none" }.into(),
    })
}
pub fn save_keys(app: &AppHandle, input: SaveFanartKeysRequest) -> Result<FanartCredentialStatus> {
    let keys = Keys {
        api_key: validate_key(&input.api_key)?,
        personal_key: input
            .personal_key
            .filter(|v| !v.trim().is_empty())
            .map(|v| validate_key(&v))
            .transpose()?,
    };
    let value = Zeroizing::new(serde_json::to_string(&keys)?);
    fetch_fanart(TEST_MBID, &value)?.context("fanart.tv did not return the test artist.")?;
    entry()?
        .set_password(&value)
        .context("Could not save the fanart.tv keys securely")?;
    expire_cache(app)?;
    credential_status()
}
pub fn delete_keys(app: &AppHandle) -> Result<FanartCredentialStatus> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(_) => bail!("Could not remove the fanart.tv keys."),
    }
    expire_cache(app)?;
    credential_status()
}
pub fn test_connection() -> Result<FanartConnectionTest> {
    let value = keys()?.context("Add a fanart.tv project API key in Settings > Providers.")?;
    fetch_fanart(TEST_MBID, &value)?.context("fanart.tv did not return the test artist.")?;
    Ok(FanartConnectionTest {
        message: "fanart.tv connected. Artist portraits, logos, and backgrounds are ready.".into(),
    })
}
pub(crate) fn install_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS artist_artwork (artist_key TEXT PRIMARY KEY, payload_json TEXT NOT NULL, expires_at TEXT NOT NULL, logo_path TEXT, background_path TEXT, fetched_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_artist_artwork_expiry ON artist_artwork(expires_at);")?;
    Ok(())
}
pub(crate) fn schema_exists(conn: &Connection) -> Result<bool> {
    Ok(conn.query_row("SELECT COUNT(*)=2 FROM sqlite_master WHERE name IN ('artist_artwork','idx_artist_artwork_expiry')", [], |r| r.get(0))?)
}
fn expire_cache(app: &AppHandle) -> Result<()> {
    let (conn, _) = db::open(app)?;
    conn.execute("UPDATE artist_artwork SET expires_at = ''", [])?;
    Ok(())
}
fn load(conn: &Connection, id: &str) -> Result<Option<CachedArtwork>> {
    let record: Option<(String, String)> = conn
        .query_row(
            "SELECT payload_json, expires_at FROM artist_artwork WHERE artist_key=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    record
        .map(|(json, expiry)| {
            let mut cached: CachedArtwork = serde_json::from_str(&json)?;
            cached.expires_at = expiry;
            Ok(cached)
        })
        .transpose()
}
fn save(conn: &mut Connection, cached: &CachedArtwork) -> Result<()> {
    let tx = conn.transaction()?;
    tx.execute("INSERT INTO artist_artwork VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(artist_key) DO UPDATE SET payload_json=excluded.payload_json, expires_at=excluded.expires_at, logo_path=excluded.logo_path, background_path=excluded.background_path, fetched_at=excluded.fetched_at",
        params![cached.artwork.artist_id, serde_json::to_string(cached)?, cached.expires_at, cached.logo_path, cached.background_path, cached.artwork.fetched_at])?;
    if let (Some(credit), Some(path)) = (&cached.artwork.portrait, &cached.portrait_path) {
        tx.execute("INSERT INTO artist_images (artist_key,artist_name,source,source_url,cache_path,mime_type,state,message,fetched_at) VALUES (?1,?2,?3,?4,?5,'image/webp','available','Artist artwork cached',?6) ON CONFLICT(artist_key) DO UPDATE SET source=excluded.source, source_url=excluded.source_url, cache_path=excluded.cache_path, mime_type=excluded.mime_type, state=excluded.state, message=excluded.message, fetched_at=excluded.fetched_at",
            params![cached.artwork.artist_id,cached.artwork.artist_name,credit.provider,credit.source_url,path,cached.artwork.fetched_at])?;
    } else {
        tx.execute("DELETE FROM artist_images WHERE artist_key=?1 AND source IN ('fanart.tv','Wikimedia Commons')", [&cached.artwork.artist_id])?;
    }
    tx.commit()?;
    Ok(())
}
fn read_json(response: ureq::Response) -> Result<Value> {
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(MAX_JSON + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_JSON {
        bail!("Artwork response is too large.");
    }
    Ok(serde_json::from_slice(&bytes)?)
}
fn fetch_fanart(mbid: &str, secret: &str) -> Result<Option<Value>> {
    if !artist_biography::valid_mbid(mbid) {
        bail!("Invalid artist MBID.");
    }
    let keys: Keys = serde_json::from_str(secret)?;
    // Headers keep secrets out of URLs, transport errors, and cache metadata.
    let url = format!("https://webservice.fanart.tv/v3/music/{mbid}");
    let mut request = crate::http::get(&url).set("api-key", &keys.api_key);
    if let Some(personal) = &keys.personal_key {
        request = request.set("client-key", personal);
    }
    let response=match request.call() {
        Ok(response) => response,
        Err(ureq::Error::Status(404, _)) => return Ok(None),
        Err(ureq::Error::Status(code, _)) => bail!("fanart.tv request failed (HTTP {code}). Check the project and optional personal key in Settings > Providers."),
        Err(_) => bail!("Could not reach fanart.tv."),
    };
    let payload = read_json(response)?;
    if payload
        .get("mbid_id")
        .and_then(Value::as_str)
        .is_none_or(|id| !id.eq_ignore_ascii_case(mbid))
    {
        bail!("fanart.tv returned a different artist identity.");
    }
    Ok(Some(payload))
}
fn safe_url(value: &str, hosts: &[&str]) -> bool {
    Url::parse(value).is_ok_and(|url| {
        url.scheme() == "https"
            && url.port().is_none()
            && url.username().is_empty()
            && url.password().is_none()
            && url.host_str().is_some_and(|host| hosts.contains(&host))
    })
}
fn fanart_image(payload: &Value, kind: &str) -> Option<(String, ArtworkCredit)> {
    let image = payload
        .get(kind)?
        .as_array()?
        .iter()
        .filter(|v| {
            v.get("url")
                .and_then(Value::as_str)
                .is_some_and(|url| safe_url(url, &["assets.fanart.tv"]))
        })
        .max_by_key(|v| {
            v.get("likes")
                .and_then(Value::as_str)
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(0)
        })?;
    Some((
        image["url"].as_str()?.into(),
        ArtworkCredit {
            provider: "fanart.tv".into(),
            source_url: "https://fanart.tv/".into(),
            author: None,
            license: None,
            license_url: None,
        },
    ))
}
fn p18_file(payload: &Value, wikidata_id: &str) -> Option<String> {
    let claims = payload["entities"][wikidata_id]["claims"]["P18"].as_array()?;
    let claim = claims
        .iter()
        .filter(|v| v["rank"] != "deprecated")
        .max_by_key(|v| v["rank"] == "preferred")?;
    claim["mainsnak"]["datavalue"]["value"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}
fn plain_text(value: &str) -> String {
    let mut text = String::new();
    let mut in_tag = false;
    for c in value.chars().take(8000) {
        match c {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                text.push(' ');
            }
            _ if !in_tag => text.push(c),
            _ => {}
        }
    }
    text.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(1500)
        .collect()
}
fn commons_image(payload: &Value) -> Option<(String, ArtworkCredit)> {
    let info = payload["query"]["pages"]
        .as_object()?
        .values()
        .find_map(|page| page["imageinfo"].as_array()?.first())?;
    let url = info["thumburl"].as_str().or_else(|| info["url"].as_str())?;
    let source = info["descriptionurl"].as_str()?;
    if !safe_url(url, &["upload.wikimedia.org", "thumb.wikimedia.org"])
        || !safe_url(source, &["commons.wikimedia.org"])
    {
        return None;
    }
    let metadata = &info["extmetadata"];
    let license = plain_text(metadata["LicenseShortName"]["value"].as_str()?);
    let author = plain_text(
        metadata["Artist"]["value"]
            .as_str()
            .or_else(|| metadata["Credit"]["value"].as_str())
            .unwrap_or("Wikimedia Commons contributors"),
    );
    if license.is_empty() {
        return None;
    }
    let license_url = metadata["LicenseUrl"]["value"]
        .as_str()
        .filter(|url| {
            safe_url(
                url,
                &[
                    "creativecommons.org",
                    "www.creativecommons.org",
                    "www.gnu.org",
                    "gnu.org",
                ],
            )
        })
        .map(str::to_owned);
    Some((
        url.into(),
        ArtworkCredit {
            provider: "Wikimedia Commons".into(),
            source_url: source.into(),
            author: Some(author),
            license: Some(license),
            license_url,
        },
    ))
}
fn fetch_commons(wikidata_id: &str) -> Result<Option<(String, ArtworkCredit)>> {
    if !artist_biography::valid_wikidata_id(wikidata_id) {
        bail!("Invalid Wikidata ID.");
    }
    let payload = read_json(
        crate::http::get(&format!(
            "https://www.wikidata.org/wiki/Special:EntityData/{wikidata_id}.json"
        ))
        .call()
        .context("Could not fetch the Wikidata image")?,
    )?;
    let Some(file) = p18_file(&payload, wikidata_id) else {
        return Ok(None);
    };
    let response = crate::http::get("https://commons.wikimedia.org/w/api.php")
        .query("action", "query")
        .query("format", "json")
        .query("prop", "imageinfo")
        .query("titles", &format!("File:{file}"))
        .query("iiprop", "url|extmetadata")
        .query("iiurlwidth", "600")
        .query(
            "iiextmetadatafilter",
            "Artist|Credit|LicenseShortName|LicenseUrl",
        )
        .query("iiextmetadatalanguage", "en")
        .call()
        .context("Could not fetch Commons image attribution")?;
    Ok(commons_image(&read_json(response)?))
}
fn download(directory: &Path, artist_id: &str, kind: &str, url: &str) -> Result<String> {
    if !safe_url(
        url,
        &[
            "assets.fanart.tv",
            "upload.wikimedia.org",
            "thumb.wikimedia.org",
        ],
    ) {
        bail!("Unsupported artwork host.");
    }
    let response = crate::http::get(url)
        .call()
        .map_err(|_| anyhow::anyhow!("Could not download the artist {kind}."))?;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(MAX_IMAGE + 1)
        .read_to_end(&mut bytes)?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_IMAGE {
        bail!("Invalid or oversized artist image.");
    }
    let mut reader = image::ImageReader::new(Cursor::new(bytes)).with_guessed_format()?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let decoded = reader
        .decode()
        .context("Artist artwork is not a supported image")?;
    // Replace stable asset filenames atomically and preserve logo transparency.
    let hash = Sha256::digest(format!("{artist_id}:{kind}:{url}").as_bytes());
    fs::create_dir_all(directory)?;
    let path = directory.join(format!("{hash:x}.webp"));
    let mut temporary = tempfile::NamedTempFile::new_in(directory)?;
    decoded.write_to(&mut temporary, image::ImageFormat::WebP)?;
    temporary.flush()?;
    temporary.as_file().sync_all()?;
    crate::thumbnails::with_source_write(|| {
        temporary.persist(&path).map_err(|e| e.error)?;
        Ok(())
    })?;
    Ok(path.to_string_lossy().into_owned())
}
fn files_exist(cached: &CachedArtwork) -> bool {
    [
        &cached.portrait_path,
        &cached.logo_path,
        &cached.background_path,
    ]
    .iter()
    .all(|path| path.as_ref().is_none_or(|v| Path::new(v).is_file()))
}
fn cache_is_fresh(cached: &CachedArtwork, linked: &Option<String>, configured: bool) -> bool {
    cached.linked_mbid == *linked
        && cached.fanart_configured == configured
        && DateTime::parse_from_rfc3339(&cached.expires_at)
            .is_ok_and(|date| date.with_timezone(&Utc) > Utc::now())
        && files_exist(cached)
}
fn identity_marker(
    conn: &Connection,
    artist_id: &str,
    fallback: Option<String>,
) -> Result<Option<String>> {
    let blocked: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM musicbrainz_artist_link_tombstones WHERE local_artist_key=?1) OR EXISTS(SELECT 1 FROM musicbrainz_artist_links WHERE local_artist_key=?1 AND ignored=1)", [artist_id], |r| r.get(0))?;
    Ok(if blocked {
        Some("blocked".into())
    } else {
        fallback
    })
}
pub fn artwork(app: &AppHandle, artist_id: &str, force: bool) -> Result<ArtistArtwork> {
    let _guard = REFRESH.lock().unwrap_or_else(|e| e.into_inner());
    let id = crate::identity::artist_text_key(artist_id);
    let identity = db::lastfm_artist_identity_for_app(app, &id)?
        .context("Artist no longer exists in the library.")?;
    let (secret, credential_error) = match keys() {
        Ok(value) => (value, None),
        Err(_) => (
            None,
            Some("fanart.tv credentials could not be read; checking Commons instead.".to_string()),
        ),
    };
    let (conn, _) = db::open_read(app)?;
    let cached = load(&conn, &id)?;
    let linked = identity_marker(&conn, &id, identity.musicbrainz_mbid.clone())?;
    drop(conn);
    if let Some(mut value) = cached.clone().filter(|v| {
        !force && credential_error.is_none() && cache_is_fresh(v, &linked, secret.is_some())
    }) {
        value.artwork.cached = true;
        return Ok(value.artwork);
    }
    let mut warnings = credential_error.into_iter().collect::<Vec<_>>();
    let biography = db::artist_biography_cache_for_app(app, &id)?;
    let mut mbid = linked.clone().filter(|v| artist_biography::valid_mbid(v));
    if linked.is_none() && !identity.ambiguous_name {
        mbid = biography
            .as_ref()
            .and_then(|v| v.musicbrainz_mbid.clone())
            .filter(|v| artist_biography::valid_mbid(v));
        if mbid.is_none() {
            match artist_biography::fetch_musicbrainz_artist_mbid_by_name(&identity.artist_name) {
                Ok(value) => mbid = value,
                Err(_) => warnings.push("MusicBrainz identity lookup failed.".to_owned()),
            }
        }
    }
    let now = Utc::now();
    let mut next = CachedArtwork {
        artwork: ArtistArtwork {
            artist_id: id.clone(),
            artist_name: identity.artist_name,
            musicbrainz_mbid: mbid.clone(),
            portrait: None,
            logo: None,
            background: None,
            fetched_at: Some(now.to_rfc3339()),
            cached: false,
            stale: false,
            message: String::new(),
        },
        portrait_path: None,
        logo_path: None,
        background_path: None,
        linked_mbid: linked.clone(),
        fanart_configured: secret.is_some(),
        expires_at: String::new(),
    };
    let directory = app.path().app_data_dir()?.join("artist-images");
    if let (Some(mbid), Some(secret)) = (&mbid, &secret) {
        match fetch_fanart(mbid, secret) {
            Ok(Some(payload)) => {
                for (kind, provider_kind) in [
                    ("portrait", "artistthumb"),
                    ("logo", "hdmusiclogo"),
                    ("background", "artistbackground"),
                ] {
                    let image = fanart_image(&payload, provider_kind).or_else(|| {
                        if kind == "logo" {
                            fanart_image(&payload, "musiclogo")
                        } else {
                            None
                        }
                    });
                    if let Some((url, credit)) = image {
                        match download(&directory, &id, kind, &url) {
                            Ok(path) => match kind {
                                "portrait" => {
                                    next.artwork.portrait = Some(credit);
                                    next.portrait_path = Some(path)
                                }
                                "logo" => {
                                    next.artwork.logo = Some(credit);
                                    next.logo_path = Some(path)
                                }
                                _ => {
                                    next.artwork.background = Some(credit);
                                    next.background_path = Some(path)
                                }
                            },
                            Err(_) => warnings.push(format!("fanart.tv {kind} download failed.")),
                        }
                    }
                }
            }
            Ok(None) => {}
            Err(error) => warnings.push(error.to_string()),
        }
    }
    if next.artwork.portrait.is_none() {
        // A biography's Wikidata relation is usable only for the same MBID.
        let mut wikidata = biography
            .as_ref()
            .filter(|v| v.musicbrainz_mbid == mbid && mbid.is_some())
            .and_then(|v| v.wikidata_id.clone());
        if wikidata.is_none() {
            if let Some(mbid) = &mbid {
                match artist_biography::fetch_musicbrainz_targets(mbid) {
                    Ok((id, _)) => wikidata = id,
                    Err(_) => warnings.push("MusicBrainz image links could not be loaded.".into()),
                }
            }
        }
        if let Some(wikidata) = wikidata {
            match fetch_commons(&wikidata) {
                Ok(Some((url, credit))) => match download(&directory, &id, "portrait", &url) {
                    Ok(path) => {
                        next.artwork.portrait = Some(credit);
                        next.portrait_path = Some(path)
                    }
                    Err(_) => warnings.push("Commons portrait download failed.".into()),
                },
                Ok(None) => {}
                Err(_) => warnings.push("Wikimedia Commons image lookup failed.".into()),
            }
        }
    }
    // Keep earlier files through temporary outages, but never across a relink.
    if let Some(old) = cached
        .filter(|v| v.linked_mbid == linked && v.artwork.musicbrainz_mbid == mbid && files_exist(v))
    {
        if next.artwork.portrait.is_none() {
            next.artwork.portrait = old.artwork.portrait;
            next.portrait_path = old.portrait_path;
        }
        if next.artwork.logo.is_none() {
            next.artwork.logo = old.artwork.logo;
            next.logo_path = old.logo_path;
        }
        if next.artwork.background.is_none() {
            next.artwork.background = old.artwork.background;
            next.background_path = old.background_path;
        }
    }
    next.artwork.stale = !warnings.is_empty();
    next.artwork.message = if !warnings.is_empty() {
        warnings.join(" ")
    } else if mbid.is_none() {
        "No unambiguous MusicBrainz artist identity is available. Link the artist in MusicBrainz settings and refresh.".into()
    } else if next.artwork.portrait.is_none()
        && next.artwork.logo.is_none()
        && next.artwork.background.is_none()
    {
        "No artist artwork found. Album covers remain available as a fallback.".into()
    } else {
        "Artist artwork cached for use throughout the library.".into()
    };
    next.expires_at = (now
        + if warnings.is_empty() {
            Duration::days(7)
        } else {
            Duration::hours(1)
        })
    .to_rfc3339();
    let current = db::lastfm_artist_identity_for_app(app, &id)?
        .context("Artist no longer exists in the library.")?;
    let (check_conn, _) = db::open_read(app)?;
    let current_link = identity_marker(&check_conn, &id, current.musicbrainz_mbid)?;
    drop(check_conn);
    if current_link != linked {
        bail!("The artist identity changed while loading artwork. Refresh to load the new artist.");
    }
    let (mut conn, _) = db::open(app)?;
    save(&mut conn, &next)?;
    Ok(next.artwork)
}
pub fn sync(app: &AppHandle, limit: u32) -> Result<ArtistArtworkSyncSummary> {
    let (conn, _) = db::open_read(app)?;
    let key = crate::identity::catalog_artist_key_sql("a.album_artist_display");
    let sql=format!("SELECT {key} FROM albums a LEFT JOIN artist_artwork art ON art.artist_key={key} WHERE art.artist_key IS NULL OR art.expires_at < ?1 GROUP BY {key} ORDER BY COUNT(*) DESC, {key} LIMIT ?2");
    let ids = conn
        .prepare(&sql)?
        .query_map(params![Utc::now().to_rfc3339(), limit.clamp(1, 200)], |r| {
            r.get::<_, String>(0)
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(conn);
    let mut result = ArtistArtworkSyncSummary {
        checked: 0,
        downloaded: 0,
        unavailable: 0,
        failed: 0,
        remaining: 0,
        message: String::new(),
    };
    for id in &ids {
        crate::jobs::checkpoint()?;
        match artwork(app, id, false) {
            Ok(value) if value.stale => result.failed += 1,
            Ok(value)
                if value.portrait.is_some()
                    || value.logo.is_some()
                    || value.background.is_some() =>
            {
                result.downloaded += 1
            }
            Ok(_) => result.unavailable += 1,
            Err(_) => result.failed += 1,
        }
        result.checked += 1;
        crate::jobs::progress(
            i64::from(result.checked),
            ids.len() as i64,
            "Caching artist artwork",
        );
    }
    let (conn, _) = db::open_read(app)?;
    result.remaining=conn.query_row(&format!("SELECT COUNT(*) FROM (SELECT {key} FROM albums a LEFT JOIN artist_artwork art ON art.artist_key={key} WHERE art.artist_key IS NULL OR art.expires_at < ?1 GROUP BY {key})"),[Utc::now().to_rfc3339()],|r| r.get(0))?;
    result.message = format!(
        "Checked {} artists: {} with artwork, {} unavailable, {} failed; {} remaining.",
        result.checked, result.downloaded, result.unavailable, result.failed, result.remaining
    );
    Ok(result)
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn get_artist_portrait_credit(
    app: AppHandle,
    artist_id: String,
) -> Result<Option<ArtworkCredit>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Option<ArtworkCredit>> {
        let (conn, _) = db::open_read(&app)?;
        Ok(load(&conn, &crate::identity::artist_text_key(&artist_id))?
            .and_then(|v| v.artwork.portrait))
    })
    .await
    .map_err(|_| "Portrait credit task failed".to_string())?
    .map_err(|e| e.to_string())
}
#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn get_artist_artwork(
    app: AppHandle,
    artist_id: String,
    force_refresh: Option<bool>,
) -> Result<ArtistArtwork, String> {
    tauri::async_runtime::spawn_blocking(move || {
        artwork(&app, &artist_id, force_refresh.unwrap_or(false))
    })
    .await
    .map_err(|_| "Artist artwork task failed".to_string())?
    .map_err(|e| e.to_string())
}
#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn get_fanart_credential_status() -> Result<FanartCredentialStatus, String> {
    tauri::async_runtime::spawn_blocking(credential_status)
        .await
        .map_err(|_| "Credential task failed".to_string())?
        .map_err(|e| e.to_string())
}
#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn save_fanart_keys(
    app: AppHandle,
    input: SaveFanartKeysRequest,
) -> Result<FanartCredentialStatus, String> {
    tauri::async_runtime::spawn_blocking(move || save_keys(&app, input))
        .await
        .map_err(|_| "Credential task failed".to_string())?
        .map_err(|e| e.to_string())
}
#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn delete_fanart_keys(app: AppHandle) -> Result<FanartCredentialStatus, String> {
    tauri::async_runtime::spawn_blocking(move || delete_keys(&app))
        .await
        .map_err(|_| "Credential task failed".to_string())?
        .map_err(|e| e.to_string())
}
#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn test_fanart_connection() -> Result<FanartConnectionTest, String> {
    tauri::async_runtime::spawn_blocking(test_connection)
        .await
        .map_err(|_| "Connection task failed".to_string())?
        .map_err(|e| e.to_string())
}
#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sync_artist_artwork(
    app: AppHandle,
    limit: u32,
) -> Result<crate::jobs::JobOutput<ArtistArtworkSyncSummary>, String> {
    crate::jobs::execute_typed(app, "artistArtwork", serde_json::json!({"limit":limit})).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixture() -> CachedArtwork {
        CachedArtwork {
            artwork: ArtistArtwork {
                artist_id: "coldplay".into(),
                artist_name: "Coldplay".into(),
                musicbrainz_mbid: Some(TEST_MBID.into()),
                portrait: Some(ArtworkCredit {
                    provider: "Wikimedia Commons".into(),
                    source_url: "https://commons.wikimedia.org/wiki/File:Coldplay.jpg".into(),
                    author: Some("Photographer".into()),
                    license: Some("CC BY-SA 4.0".into()),
                    license_url: Some("https://creativecommons.org/licenses/by-sa/4.0/".into()),
                }),
                logo: None,
                background: None,
                fetched_at: Some(Utc::now().to_rfc3339()),
                cached: false,
                stale: false,
                message: "Cached".into(),
            },
            portrait_path: None,
            logo_path: None,
            background_path: None,
            linked_mbid: Some(TEST_MBID.into()),
            fanart_configured: false,
            expires_at: (Utc::now() + Duration::days(7)).to_rfc3339(),
        }
    }
    #[test]
    fn cache_expires_on_provider_change_relink_and_missing_files() {
        let mut value = fixture();
        assert!(cache_is_fresh(&value, &value.linked_mbid, false));
        assert!(!cache_is_fresh(&value, &None, false));
        assert!(!cache_is_fresh(&value, &Some("different".into()), false));
        assert!(!cache_is_fresh(&value, &value.linked_mbid, true));
        value.portrait_path = Some("nonexistent-portrait.webp".into());
        assert!(!cache_is_fresh(&value, &value.linked_mbid, false));
        value.portrait_path = None;
        value.expires_at = String::new();
        assert!(!cache_is_fresh(&value, &value.linked_mbid, false));
    }
    #[test]
    fn selects_valid_fanart_assets_by_numeric_likes() {
        let payload = json!({"artistthumb":[
            {"url":"https://assets.fanart.tv/ten.jpg","likes":"10"},
            {"url":"https://assets.fanart.tv/nine.jpg","likes":"9"},
            {"url":"https://evil.test/image.jpg","likes":"999"},
            {"url":"https://assets.fanart.tv.evil.test/image.jpg","likes":"1000"},
            {"url":"http://assets.fanart.tv/plain.jpg","likes":"1001"},
            {"url":"https://secret@assets.fanart.tv/image.jpg","likes":"1002"}
        ]});
        assert_eq!(
            fanart_image(&payload, "artistthumb").unwrap().0,
            "https://assets.fanart.tv/ten.jpg"
        );
        assert!(fanart_image(&payload, "hdmusiclogo").is_none());
    }
    #[test]
    fn commons_requires_source_and_license_and_sanitizes_attribution() {
        let mut payload = json!({"query":{"pages":{"1":{"imageinfo":[{
            "thumburl":"https://thumb.wikimedia.org/portrait.jpg",
            "descriptionurl":"https://commons.wikimedia.org/wiki/File:Portrait.jpg",
            "extmetadata":{"Artist":{"value":"<a href='https://example.com'>Jane &amp; John</a>"},"LicenseShortName":{"value":"CC BY-SA 4.0"},"LicenseUrl":{"value":"https://creativecommons.org/licenses/by-sa/4.0/"}}
        }]}}}});
        let (_, credit) = commons_image(&payload).unwrap();
        assert_eq!(credit.author.as_deref(), Some("Jane & John"));
        assert_eq!(credit.license.as_deref(), Some("CC BY-SA 4.0"));
        payload["query"]["pages"]["1"]["imageinfo"][0]["extmetadata"]["LicenseShortName"] =
            Value::Null;
        assert!(commons_image(&payload).is_none());
    }
    #[test]
    fn p18_prefers_current_image_and_ignores_deprecated_claims() {
        let claim =
            |rank: &str, file: &str| json!({"rank":rank,"mainsnak":{"datavalue":{"value":file}}});
        let payload = json!({"entities":{"Q1":{"claims":{"P18":[claim("deprecated","Old.jpg"),claim("normal","Normal.jpg"),claim("preferred","Preferred.jpg")]}}}});
        assert_eq!(p18_file(&payload, "Q1").as_deref(), Some("Preferred.jpg"));
        assert_eq!(p18_file(&payload, "Q2"), None);
    }
    #[test]
    fn persists_attribution_and_shared_portrait_atomically_then_clears_relinked_portrait() {
        let mut conn = Connection::open_in_memory().unwrap();
        install_schema(&conn).unwrap();
        install_schema(&conn).unwrap();
        assert!(schema_exists(&conn).unwrap());
        conn.execute_batch("CREATE TABLE artist_images (artist_key TEXT PRIMARY KEY, artist_name TEXT,source TEXT,source_url TEXT,cache_path TEXT,mime_type TEXT,state TEXT,message TEXT,fetched_at TEXT);").unwrap();
        let mut value = fixture();
        value.portrait_path = Some("portrait.webp".into());
        value.logo_path = Some("logo.webp".into());
        save(&mut conn, &value).unwrap();
        let loaded = load(&conn, "coldplay").unwrap().unwrap();
        assert_eq!(
            loaded.artwork.portrait.unwrap().author.as_deref(),
            Some("Photographer")
        );
        assert_eq!(loaded.logo_path.as_deref(), Some("logo.webp"));
        assert_eq!(
            conn.query_row("SELECT source FROM artist_images", [], |r| r
                .get::<_, String>(0))
                .unwrap(),
            "Wikimedia Commons"
        );
        conn.execute("UPDATE artist_artwork SET expires_at=''", [])
            .unwrap();
        assert!(!cache_is_fresh(
            &load(&conn, "coldplay").unwrap().unwrap(),
            &value.linked_mbid,
            false
        ));
        value.artwork.portrait = None;
        value.portrait_path = None;
        save(&mut conn, &value).unwrap();
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM artist_images", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    #[test]
    fn validates_project_and_personal_key_format() {
        assert!(validate_key("invalid").is_err());
        assert!(validate_key(&"z".repeat(32)).is_err());
        assert_eq!(
            validate_key(&format!(" {} ", "a".repeat(32))).unwrap(),
            "a".repeat(32)
        );
    }
    #[test]
    fn ignored_and_unlinked_artists_cannot_use_name_or_biography_fallbacks() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE musicbrainz_artist_links(local_artist_key TEXT PRIMARY KEY,ignored INTEGER); CREATE TABLE musicbrainz_artist_link_tombstones(local_artist_key TEXT PRIMARY KEY);").unwrap();
        let mbid = Some(TEST_MBID.to_string());
        assert_eq!(
            identity_marker(&conn, "coldplay", mbid.clone()).unwrap(),
            mbid
        );
        conn.execute(
            "INSERT INTO musicbrainz_artist_links VALUES ('coldplay',1)",
            [],
        )
        .unwrap();
        assert_eq!(
            identity_marker(&conn, "coldplay", mbid.clone())
                .unwrap()
                .as_deref(),
            Some("blocked")
        );
        conn.execute("DELETE FROM musicbrainz_artist_links", [])
            .unwrap();
        conn.execute(
            "INSERT INTO musicbrainz_artist_link_tombstones VALUES ('coldplay')",
            [],
        )
        .unwrap();
        assert_eq!(
            identity_marker(&conn, "coldplay", None).unwrap().as_deref(),
            Some("blocked")
        );
    }
    #[test]
    #[ignore = "Explicit live test using the developer's ignored .env key"]
    fn live_fanart_and_commons_artwork() {
        let secret = environment_keys().expect("A development fanart.tv project key is required");
        let payload = fetch_fanart(TEST_MBID, &secret).unwrap().unwrap();
        let directory = tempfile::tempdir().unwrap();
        for (kind, provider_kind) in [
            ("portrait", "artistthumb"),
            ("logo", "hdmusiclogo"),
            ("background", "artistbackground"),
        ] {
            let (url, _) = fanart_image(&payload, provider_kind)
                .expect("Coldplay artwork should be available");
            let path = download(directory.path(), "coldplay", kind, &url).unwrap();
            assert!(image::open(path).is_ok());
        }
        let (wikidata, _) = artist_biography::fetch_musicbrainz_targets(TEST_MBID).unwrap();
        let (url, credit) = fetch_commons(&wikidata.unwrap()).unwrap().unwrap();
        assert!(credit.author.is_some());
        assert!(credit.license.is_some());
        assert!(
            Path::new(&download(directory.path(), "coldplay", "commons", &url).unwrap()).is_file()
        );
        println!("Live fanart.tv portrait, HD logo, background, and attributed Commons portrait downloaded and decoded.");
    }
}
