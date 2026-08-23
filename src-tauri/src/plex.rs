use crate::db;
use anyhow::{anyhow, bail, Context, Result};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use keyring::Entry;
use rusqlite::{params, params_from_iter, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use unicode_normalization::UnicodeNormalization;
use url::Url;
use zeroize::Zeroizing;

const KEYRING_SERVICE: &str = "com.local.musiclibrary.plex";
const KEYRING_USER: &str = "token";
const PROFILE_FILE: &str = "plex.json";
const DEFAULT_BASE_URL: &str = "http://localhost:32400";
const DEFAULT_LIBRARY_NAME: &str = "Music";
const DEFAULT_AUTO_SYNC_MINUTES: u32 = 360;
const MIN_AUTO_SYNC_MINUTES: u32 = 15;
const MAX_AUTO_SYNC_MINUTES: u32 = 1_440;
const TRACK_LOOKUP_BATCH_SIZE: usize = 25;
const PLAYLIST_PAGE_SIZE: u32 = 1_000;
const PLEX_PRODUCT: &str = "Music Library";
const PLEX_VERSION: &str = "0.142.0";

static SYNC_GATE: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredPlexProfile {
    base_url: String,
    library_name: String,
    auto_sync_enabled: bool,
    auto_sync_minutes: u32,
    client_identifier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlexProfile {
    pub base_url: String,
    pub library_name: String,
    pub auto_sync_enabled: bool,
    pub auto_sync_minutes: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePlexProfileRequest {
    pub base_url: String,
    pub library_name: String,
    pub auto_sync_enabled: bool,
    pub auto_sync_minutes: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlexCredentialStatus {
    pub configured: bool,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlexScheduleStatus {
    pub next_auto_sync_at: Option<String>,
    pub last_attempt_at: Option<String>,
    pub last_success_at: Option<String>,
    pub last_error: Option<String>,
    pub cache_track_count: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlexBootstrap {
    pub profile: PlexProfile,
    pub credential: PlexCredentialStatus,
    pub schedule: PlexScheduleStatus,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlexConnectionTest {
    pub connected: bool,
    pub server_name: String,
    pub server_version: String,
    pub machine_identifier: String,
    pub library_name: String,
    pub library_section_key: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlexPlaylistSyncResult {
    pub saved_playlist_id: i64,
    pub playlist_name: String,
    pub status: String,
    pub desired_count: i64,
    pub matched_count: i64,
    pub missing_count: i64,
    pub added_count: usize,
    pub removed_count: usize,
    pub moved_count: usize,
    pub plex_playlist_rating_key: Option<String>,
    pub synced_at: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlexSyncSummary {
    pub trigger: String,
    pub playlist_count: usize,
    pub synced_count: usize,
    pub failed_count: usize,
    pub desired_count: i64,
    pub matched_count: i64,
    pub missing_count: i64,
    pub cache_refreshed: bool,
    pub cache_track_count: i64,
    pub completed_at: String,
    pub message: String,
    pub playlists: Vec<PlexPlaylistSyncResult>,
}

#[derive(Debug, Clone)]
struct PlexIdentity {
    machine_identifier: String,
    server_name: String,
    version: String,
}

#[derive(Debug, Clone)]
struct PlexLibrary {
    key: String,
    title: String,
    scanned_at: String,
}

#[derive(Debug, Clone)]
struct PlexTrack {
    rating_key: String,
    file: String,
}

#[derive(Debug, Clone)]
struct CacheState {
    library_key: String,
    library_scanned_at: String,
    cache_run: String,
    track_count: i64,
}

#[derive(Debug, Clone)]
struct PlexPlaylist {
    rating_key: String,
    summary: String,
}

#[derive(Debug, Clone)]
struct PlexPlaylistItem {
    rating_key: String,
    playlist_item_id: String,
}

struct PlexClient {
    profile: StoredPlexProfile,
    token: Zeroizing<String>,
    agent: ureq::Agent,
}

impl PlexClient {
    fn new(profile: StoredPlexProfile, token: Zeroizing<String>) -> Self {
        Self {
            profile,
            token,
            agent: ureq::AgentBuilder::new()
                .timeout_connect(Duration::from_secs(10))
                .timeout_read(Duration::from_secs(60))
                .timeout_write(Duration::from_secs(30))
                .build(),
        }
    }

    fn url(&self, path: &str) -> Result<Url> {
        let base = format!("{}/", self.profile.base_url.trim_end_matches('/'));
        Url::parse(&base)?
            .join(path.trim_start_matches('/'))
            .context("Could not create a Plex server URL")
    }

    fn request(&self, method: &str, url: &Url) -> Result<ureq::Response> {
        self.agent
            .request(method, url.as_str())
            .set("Accept", "application/json")
            .set("X-Plex-Token", self.token.as_str())
            .set("X-Plex-Client-Identifier", &self.profile.client_identifier)
            .set("X-Plex-Product", PLEX_PRODUCT)
            .set("X-Plex-Version", PLEX_VERSION)
            .set("X-Plex-Platform", "Windows")
            .set("X-Plex-Pms-Api-Version", "1.2.2")
            .call()
            .map_err(plex_request_error)
    }

    fn json(&self, method: &str, url: &Url) -> Result<Value> {
        self.request(method, url)?
            .into_json::<Value>()
            .context("Plex returned an unreadable JSON response")
    }

    fn call(&self, method: &str, url: &Url) -> Result<()> {
        self.request(method, url).map(|_| ())
    }

    fn identity(&self) -> Result<PlexIdentity> {
        let payload = self.json("GET", &self.url("/")?)?;
        let container = media_container(&payload)?;
        let machine_identifier = string_field(container, "machineIdentifier")?;
        Ok(PlexIdentity {
            machine_identifier,
            server_name: optional_string_field(container, "friendlyName")
                .unwrap_or_else(|| "Plex Media Server".to_string()),
            version: optional_string_field(container, "version").unwrap_or_default(),
        })
    }

    fn library(&self) -> Result<PlexLibrary> {
        let payload = self.json("GET", &self.url("/library/sections")?)?;
        let container = media_container(&payload)?;
        let directories = array_field(container, "Directory");
        let wanted = self.profile.library_name.trim();
        let matches = directories
            .iter()
            .filter(|directory| {
                optional_string_field(directory, "title")
                    .is_some_and(|title| title.eq_ignore_ascii_case(wanted))
                    && optional_string_field(directory, "type").is_some_and(|kind| kind == "artist")
            })
            .collect::<Vec<_>>();
        if matches.is_empty() {
            let available = directories
                .iter()
                .filter(|directory| {
                    optional_string_field(directory, "type").is_some_and(|kind| kind == "artist")
                })
                .filter_map(|directory| optional_string_field(directory, "title"))
                .collect::<Vec<_>>()
                .join(", ");
            if available.is_empty() {
                bail!("Plex has no music libraries available to this token")
            }
            bail!(
                "Plex music library ‘{}’ was not found. Available music libraries: {}",
                wanted,
                available
            )
        }
        if matches.len() > 1 {
            bail!("More than one Plex music library is named ‘{wanted}’")
        }
        let directory = matches[0];
        Ok(PlexLibrary {
            key: string_field(directory, "key")?,
            title: string_field(directory, "title")?,
            scanned_at: scalar_string_field(directory, "scannedAt").unwrap_or_default(),
        })
    }

    fn local_database_tracks(
        &self,
        library: &PlexLibrary,
        paths: &[String],
    ) -> Result<Option<Vec<PlexTrack>>> {
        let profile_url = Url::parse(&self.profile.base_url)?;
        let is_loopback = profile_url.host_str().is_some_and(|host| {
            host.eq_ignore_ascii_case("localhost") || host == "127.0.0.1" || host == "::1"
        });
        if !is_loopback {
            return Ok(None);
        }
        let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") else {
            return Ok(None);
        };
        let database_path = PathBuf::from(local_app_data)
            .join("Plex Media Server")
            .join("Plug-in Support")
            .join("Databases")
            .join("com.plexapp.plugins.library.db");
        if !database_path.is_file() {
            return Ok(None);
        }
        let conn = Connection::open_with_flags(
            database_path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .context("Could not open the local Plex database read-only")?;
        conn.busy_timeout(Duration::from_secs(5))?;
        conn.execute_batch("PRAGMA query_only = ON;")?;
        let mut tracks = Vec::new();
        for chunk in paths.chunks(400) {
            let placeholders = std::iter::repeat_n("?", chunk.len())
                .collect::<Vec<_>>()
                .join(",");
            let sql = format!(
                "
                SELECT CAST(metadata_items.id AS TEXT), media_parts.file
                FROM media_parts
                JOIN media_items ON media_items.id = media_parts.media_item_id
                JOIN metadata_items ON metadata_items.id = media_items.metadata_item_id
                WHERE metadata_items.library_section_id = ?
                  AND metadata_items.metadata_type = 10
                  AND metadata_items.deleted_at IS NULL
                  AND media_items.deleted_at IS NULL
                  AND media_parts.deleted_at IS NULL
                  AND media_parts.file IN ({placeholders})
                ORDER BY metadata_items.id, media_parts.id
                "
            );
            let mut values = Vec::with_capacity(chunk.len() + 1);
            values.push(library.key.clone());
            values.extend(chunk.iter().cloned());
            let mut statement = conn.prepare(&sql)?;
            let rows = statement.query_map(params_from_iter(values), |row| {
                Ok(PlexTrack {
                    rating_key: row.get(0)?,
                    file: row.get(1)?,
                })
            })?;
            for row in rows {
                tracks.push(row?);
            }
        }
        Ok(Some(tracks))
    }

    fn tracks_for_paths(&self, library: &PlexLibrary, paths: &[String]) -> Result<Vec<PlexTrack>> {
        let mut tracks = self
            .local_database_tracks(library, paths)
            .unwrap_or(None)
            .unwrap_or_default();
        let found = tracks
            .iter()
            .map(|track| normalize_media_path(&track.file))
            .collect::<HashSet<_>>();
        let unresolved = paths
            .iter()
            .filter(|path| !found.contains(&normalize_media_path(path)))
            .cloned()
            .collect::<Vec<_>>();
        for chunk in unresolved.chunks(TRACK_LOOKUP_BATCH_SIZE) {
            let mut url = self.url(&format!("/library/sections/{}/all", library.key))?;
            {
                let mut query = url.query_pairs_mut();
                query
                    .append_pair("type", "10")
                    .append_pair("includeFields", "ratingKey,file")
                    .append_pair("includeElements", "Media,Part")
                    .append_pair("limit", &chunk.len().to_string());
                if chunk.len() > 1 {
                    query.append_pair("push", "1");
                }
                for (index, path) in chunk.iter().enumerate() {
                    if index > 0 {
                        query.append_pair("or", "1");
                    }
                    query.append_pair("file", path);
                }
                if chunk.len() > 1 {
                    query.append_pair("pop", "1");
                }
            }
            let payload = self.json("GET", &url)?;
            let container = media_container(&payload)?;
            for item in array_field(container, "Metadata") {
                let Some(rating_key) = scalar_string_field(item, "ratingKey") else {
                    continue;
                };
                for media in array_field(item, "Media") {
                    for part in array_field(media, "Part") {
                        if let Some(file) = optional_string_field(part, "file") {
                            if !file.trim().is_empty() {
                                tracks.push(PlexTrack {
                                    rating_key: rating_key.clone(),
                                    file,
                                });
                            }
                        }
                    }
                }
            }
        }
        Ok(tracks)
    }

    fn playlists(&self) -> Result<Vec<PlexPlaylist>> {
        let mut offset = 0_u32;
        let mut playlists = Vec::new();
        loop {
            let mut url = self.url("/playlists")?;
            url.query_pairs_mut()
                .append_pair("playlistType", "audio")
                .append_pair("smart", "0");
            let response = self
                .agent
                .get(url.as_str())
                .set("Accept", "application/json")
                .set("X-Plex-Token", self.token.as_str())
                .set("X-Plex-Client-Identifier", &self.profile.client_identifier)
                .set("X-Plex-Product", PLEX_PRODUCT)
                .set("X-Plex-Version", PLEX_VERSION)
                .set("X-Plex-Pms-Api-Version", "1.2.2")
                .set("X-Plex-Container-Start", &offset.to_string())
                .set("X-Plex-Container-Size", &PLAYLIST_PAGE_SIZE.to_string())
                .call()
                .map_err(plex_request_error)?;
            let payload = response
                .into_json::<Value>()
                .context("Plex returned an unreadable playlist page")?;
            let container = media_container(&payload)?;
            let metadata = array_field(container, "Metadata");
            let page_size = metadata.len() as u32;
            playlists.extend(metadata.iter().filter_map(|item| {
                Some(PlexPlaylist {
                    rating_key: scalar_string_field(item, "ratingKey")?,
                    summary: optional_string_field(item, "summary").unwrap_or_default(),
                })
            }));
            if page_size == 0 {
                break;
            }
            offset = offset.saturating_add(page_size);
            let total = u32_field(container, "totalSize");
            if total.is_some_and(|total| offset >= total)
                || (total.is_none() && page_size < PLAYLIST_PAGE_SIZE)
            {
                break;
            }
        }
        Ok(playlists)
    }

    fn playlist_items(&self, playlist_id: &str) -> Result<Vec<PlexPlaylistItem>> {
        let mut offset = 0_u32;
        let mut items = Vec::new();
        loop {
            let url = self.url(&format!("/playlists/{playlist_id}/items"))?;
            let response = self
                .agent
                .get(url.as_str())
                .set("Accept", "application/json")
                .set("X-Plex-Token", self.token.as_str())
                .set("X-Plex-Client-Identifier", &self.profile.client_identifier)
                .set("X-Plex-Product", PLEX_PRODUCT)
                .set("X-Plex-Version", PLEX_VERSION)
                .set("X-Plex-Pms-Api-Version", "1.2.2")
                .set("X-Plex-Container-Start", &offset.to_string())
                .set("X-Plex-Container-Size", &PLAYLIST_PAGE_SIZE.to_string())
                .call()
                .map_err(plex_request_error)?;
            let payload = response
                .into_json::<Value>()
                .context("Plex returned unreadable playlist contents")?;
            let container = media_container(&payload)?;
            let metadata = array_field(container, "Metadata");
            let page_size = metadata.len() as u32;
            for item in metadata {
                let Some(rating_key) = scalar_string_field(item, "ratingKey") else {
                    continue;
                };
                let Some(playlist_item_id) = scalar_string_field(item, "playlistItemID") else {
                    continue;
                };
                items.push(PlexPlaylistItem {
                    rating_key,
                    playlist_item_id,
                });
            }
            if page_size == 0 {
                break;
            }
            offset = offset.saturating_add(page_size);
            let total = u32_field(container, "totalSize");
            if total.is_some_and(|total| offset >= total)
                || (total.is_none() && page_size < PLAYLIST_PAGE_SIZE)
            {
                break;
            }
        }
        Ok(items)
    }

    fn create_playlist(
        &self,
        identity: &PlexIdentity,
        title: &str,
        rating_keys: &[String],
    ) -> Result<String> {
        let initial = rating_keys.iter().take(100).cloned().collect::<Vec<_>>();
        let mut url = self.url("/playlists")?;
        url.query_pairs_mut()
            .append_pair("type", "audio")
            .append_pair("title", title)
            .append_pair("smart", "0")
            .append_pair("uri", &playlist_uri(&identity.machine_identifier, &initial));
        let payload = self.json("POST", &url)?;
        let container = media_container(&payload)?;
        let playlist = array_field(container, "Metadata")
            .first()
            .copied()
            .context("Plex created a playlist without returning its ID")?;
        scalar_string_field(playlist, "ratingKey")
            .context("Plex created a playlist without returning its rating key")
    }

    fn edit_playlist(&self, playlist_id: &str, title: &str, marker: &str) -> Result<()> {
        let mut url = self.url(&format!("/playlists/{playlist_id}"))?;
        url.query_pairs_mut()
            .append_pair("title.value", title)
            .append_pair("title.locked", "1")
            .append_pair("summary.value", marker)
            .append_pair("summary.locked", "1");
        self.call("PUT", &url)
    }

    fn add_items(
        &self,
        identity: &PlexIdentity,
        playlist_id: &str,
        rating_keys: &[String],
    ) -> Result<()> {
        for chunk in rating_keys.chunks(100) {
            let mut url = self.url(&format!("/playlists/{playlist_id}/items"))?;
            url.query_pairs_mut()
                .append_pair("uri", &playlist_uri(&identity.machine_identifier, chunk));
            self.call("PUT", &url)?;
        }
        Ok(())
    }

    fn delete_item(&self, playlist_id: &str, playlist_item_id: &str) -> Result<()> {
        self.call(
            "DELETE",
            &self.url(&format!(
                "/playlists/{playlist_id}/items/{playlist_item_id}"
            ))?,
        )
    }

    fn move_item(
        &self,
        playlist_id: &str,
        playlist_item_id: &str,
        after: Option<&str>,
    ) -> Result<()> {
        let mut url = self.url(&format!(
            "/playlists/{playlist_id}/items/{playlist_item_id}/move"
        ))?;
        if let Some(after) = after {
            url.query_pairs_mut().append_pair("after", after);
        }
        self.call("PUT", &url)
    }
}

fn plex_request_error(error: ureq::Error) -> anyhow::Error {
    match error {
        ureq::Error::Status(401, _) => anyhow!(
            "Plex rejected the configured token. Copy a current X-Plex-Token and save it in Settings"
        ),
        ureq::Error::Status(403, _) => {
            anyhow!("This Plex token does not have permission to manage the selected server")
        }
        ureq::Error::Status(404, _) => anyhow!("The requested Plex resource was not found"),
        ureq::Error::Status(status, _) => {
            anyhow!("Plex returned HTTP status {status}")
        }
        ureq::Error::Transport(_) => anyhow!("Could not reach the configured Plex server"),
    }
}

fn media_container(payload: &Value) -> Result<&Value> {
    payload
        .get("MediaContainer")
        .context("Plex returned a response without MediaContainer")
}

fn array_field<'a>(value: &'a Value, field: &str) -> Vec<&'a Value> {
    match value.get(field) {
        Some(Value::Array(items)) => items.iter().collect(),
        Some(Value::Object(_)) => vec![&value[field]],
        _ => Vec::new(),
    }
}

fn optional_string_field(value: &Value, field: &str) -> Option<String> {
    value.get(field)?.as_str().map(ToString::to_string)
}

fn scalar_string_field(value: &Value, field: &str) -> Option<String> {
    value.get(field).and_then(|item| match item {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    })
}

fn string_field(value: &Value, field: &str) -> Result<String> {
    scalar_string_field(value, field)
        .filter(|value| !value.trim().is_empty())
        .with_context(|| format!("Plex response is missing {field}"))
}

fn u32_field(value: &Value, field: &str) -> Option<u32> {
    value
        .get(field)
        .and_then(|item| item.as_u64().or_else(|| item.as_str()?.parse().ok()))
        .and_then(|item| u32::try_from(item).ok())
}

fn normalize_server_url(value: &str) -> Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        bail!("Enter the Plex server URL")
    }
    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };
    let mut url = Url::parse(&candidate).context("Enter a valid Plex server URL")?;
    if !matches!(url.scheme(), "http" | "https") {
        bail!("The Plex server URL must use HTTP or HTTPS")
    }
    if !url.username().is_empty() || url.password().is_some() {
        bail!("Do not put credentials in the Plex server URL")
    }
    if url.query().is_some() || url.fragment().is_some() {
        bail!("The Plex server URL cannot contain a query or fragment")
    }
    let host = url.host_str().context("The Plex server URL needs a host")?;
    let loopback = host.eq_ignore_ascii_case("localhost") || host == "127.0.0.1" || host == "::1";
    if url.scheme() == "http" && !loopback {
        bail!("Use HTTPS when the Plex server is not on this computer")
    }
    if url.path() != "/" && !url.path().is_empty() {
        bail!("The Plex server URL cannot contain a path")
    }
    url.set_path("");
    Ok(url.as_str().trim_end_matches('/').to_string())
}

fn normalize_profile(
    request: SavePlexProfileRequest,
    client_identifier: String,
) -> Result<StoredPlexProfile> {
    let library_name = request.library_name.trim();
    if library_name.is_empty() || library_name.chars().count() > 120 {
        bail!("Enter a Plex music library name of no more than 120 characters")
    }
    Ok(StoredPlexProfile {
        base_url: normalize_server_url(&request.base_url)?,
        library_name: library_name.to_string(),
        auto_sync_enabled: request.auto_sync_enabled,
        auto_sync_minutes: request
            .auto_sync_minutes
            .clamp(MIN_AUTO_SYNC_MINUTES, MAX_AUTO_SYNC_MINUTES),
        client_identifier,
    })
}

fn public_profile(profile: &StoredPlexProfile) -> PlexProfile {
    PlexProfile {
        base_url: profile.base_url.clone(),
        library_name: profile.library_name.clone(),
        auto_sync_enabled: profile.auto_sync_enabled,
        auto_sync_minutes: profile.auto_sync_minutes,
    }
}

fn new_client_identifier() -> String {
    let seed = format!(
        "{}:{}:{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        PLEX_PRODUCT
    );
    let digest = Sha256::digest(seed.as_bytes());
    format!("music-library-{}", hex::encode(&digest[..12]))
}

fn profile_path(app: &AppHandle) -> Result<PathBuf> {
    let directory = app
        .path()
        .app_config_dir()
        .context("Could not resolve the application configuration directory")?;
    fs::create_dir_all(&directory)
        .context("Could not create the application configuration directory")?;
    Ok(directory.join(PROFILE_FILE))
}

fn default_stored_profile() -> StoredPlexProfile {
    StoredPlexProfile {
        base_url: DEFAULT_BASE_URL.to_string(),
        library_name: DEFAULT_LIBRARY_NAME.to_string(),
        auto_sync_enabled: true,
        auto_sync_minutes: DEFAULT_AUTO_SYNC_MINUTES,
        client_identifier: new_client_identifier(),
    }
}

fn load_profile(app: &AppHandle) -> Result<StoredPlexProfile> {
    let path = profile_path(app)?;
    if !path.exists() {
        let profile = default_stored_profile();
        save_stored_profile(app, &profile)?;
        return Ok(profile);
    }
    let text = fs::read_to_string(&path)
        .with_context(|| format!("Could not read Plex settings from {}", path.display()))?;
    let decoded = serde_json::from_str::<StoredPlexProfile>(&text)
        .context("The saved Plex settings are invalid")?;
    normalize_profile(
        SavePlexProfileRequest {
            base_url: decoded.base_url,
            library_name: decoded.library_name,
            auto_sync_enabled: decoded.auto_sync_enabled,
            auto_sync_minutes: decoded.auto_sync_minutes,
        },
        if decoded.client_identifier.trim().is_empty() {
            new_client_identifier()
        } else {
            decoded.client_identifier
        },
    )
}

fn save_stored_profile(app: &AppHandle, profile: &StoredPlexProfile) -> Result<()> {
    let path = profile_path(app)?;
    let text = serde_json::to_string_pretty(profile).context("Could not encode Plex settings")?;
    fs::write(&path, text)
        .with_context(|| format!("Could not save Plex settings to {}", path.display()))
}

fn credential_entry() -> Result<Entry> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .context("Could not open Windows Credential Manager for Plex")
}

fn stored_token() -> Result<Option<Zeroizing<String>>> {
    match credential_entry()?.get_password() {
        Ok(value) if !value.trim().is_empty() => Ok(Some(Zeroizing::new(value))),
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => {
            Err(error).context("Could not read the Plex token from Windows Credential Manager")
        }
    }
}

fn environment_token() -> Option<Zeroizing<String>> {
    #[cfg(debug_assertions)]
    {
        let _ = dotenvy::dotenv();
        return std::env::var("PLEX_TOKEN")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .map(Zeroizing::new);
    }
    #[allow(unreachable_code)]
    None
}

fn active_token() -> Result<Zeroizing<String>> {
    stored_token()?
        .or_else(environment_token)
        .context("No Plex token is configured. Add one in Settings")
}

pub fn credential_status() -> Result<PlexCredentialStatus> {
    let source = if stored_token()?.is_some() {
        "windowsCredentialManager"
    } else if environment_token().is_some() {
        "environment"
    } else {
        "none"
    };
    Ok(PlexCredentialStatus {
        configured: source != "none",
        source: source.to_string(),
    })
}

pub fn save_token(token: String) -> Result<PlexCredentialStatus> {
    let token = Zeroizing::new(token.trim().to_string());
    if token.len() < 10 || token.len() > 1_024 {
        bail!("Enter a valid Plex token")
    }
    credential_entry()?
        .set_password(token.as_str())
        .context("Could not store the Plex token in Windows Credential Manager")?;
    credential_status()
}

pub fn delete_token() -> Result<PlexCredentialStatus> {
    match credential_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => credential_status(),
        Err(error) => {
            Err(error).context("Could not remove the Plex token from Windows Credential Manager")
        }
    }
}

fn schedule_status(conn: &Connection) -> Result<PlexScheduleStatus> {
    conn.query_row(
        "
        SELECT next_auto_sync_at, last_attempt_at, last_success_at,
               last_error, cache_track_count
        FROM plex_sync_state WHERE id = 1
        ",
        [],
        |row| {
            Ok(PlexScheduleStatus {
                next_auto_sync_at: row.get(0)?,
                last_attempt_at: row.get(1)?,
                last_success_at: row.get(2)?,
                last_error: row.get(3)?,
                cache_track_count: row.get(4)?,
            })
        },
    )
    .context("Could not load Plex synchronization status")
}

pub fn bootstrap(app: &AppHandle) -> Result<PlexBootstrap> {
    let profile = load_profile(app)?;
    let (conn, _) = db::open(app)?;
    Ok(PlexBootstrap {
        profile: public_profile(&profile),
        credential: credential_status()?,
        schedule: schedule_status(&conn)?,
    })
}

pub fn save_profile(app: &AppHandle, request: SavePlexProfileRequest) -> Result<PlexBootstrap> {
    let current = load_profile(app)?;
    let profile = normalize_profile(request, current.client_identifier)?;
    save_stored_profile(app, &profile)?;
    let (conn, _) = db::open(app)?;
    let next = Utc::now() + ChronoDuration::minutes(i64::from(profile.auto_sync_minutes));
    conn.execute(
        "UPDATE plex_sync_state SET next_auto_sync_at = ?1 WHERE id = 1",
        params![next.to_rfc3339()],
    )?;
    bootstrap(app)
}

pub fn test_connection(app: &AppHandle) -> Result<PlexConnectionTest> {
    let profile = load_profile(app)?;
    let client = PlexClient::new(profile, active_token()?);
    let identity = client.identity()?;
    let library = client.library()?;
    Ok(PlexConnectionTest {
        connected: true,
        server_name: identity.server_name.clone(),
        server_version: identity.version.clone(),
        machine_identifier: identity.machine_identifier,
        library_name: library.title,
        library_section_key: library.key,
        message: format!(
            "Connected to {} {} and found the Plex music library.",
            identity.server_name, identity.version
        ),
    })
}

fn normalize_media_path(value: &str) -> String {
    let mut normalized = value
        .trim()
        .replace('/', "\\")
        .nfkc()
        .flat_map(char::to_lowercase)
        .collect::<String>();
    while normalized.contains("\\\\") {
        normalized = normalized.replace("\\\\", "\\");
    }
    let mut parts = Vec::new();
    for part in normalized.split('\\') {
        match part {
            "" if parts.is_empty() => parts.push(String::new()),
            "" | "." => {}
            ".." if parts.len() > 1 => {
                parts.pop();
            }
            _ => parts.push(part.to_string()),
        }
    }
    parts.join("\\").trim_end_matches('\\').to_string()
}

fn playlist_uri(machine_identifier: &str, rating_keys: &[String]) -> String {
    format!(
        "server://{machine_identifier}/com.plexapp.plugins.library/library/metadata/{}",
        rating_keys.join(",")
    )
}

fn cache_state(conn: &Connection) -> Result<Option<CacheState>> {
    conn.query_row(
        "
        SELECT library_key, library_scanned_at, cache_run, cache_track_count
        FROM plex_sync_state WHERE id = 1
        ",
        [],
        |row| {
            let library_key: Option<String> = row.get(0)?;
            let scanned_at: Option<String> = row.get(1)?;
            let cache_run: Option<String> = row.get(2)?;
            let track_count: i64 = row.get(3)?;
            Ok(library_key.zip(scanned_at).zip(cache_run).map(
                |((library_key, library_scanned_at), cache_run)| CacheState {
                    library_key,
                    library_scanned_at,
                    cache_run,
                    track_count,
                },
            ))
        },
    )
    .context("Could not inspect the Plex track cache")
}

fn prepare_track_cache(
    conn: &Connection,
    identity: &PlexIdentity,
    library: &PlexLibrary,
) -> Result<CacheState> {
    let library_key = format!("{}:{}", identity.machine_identifier, library.key);
    if let Some(mut state) = cache_state(conn)? {
        let scan_changed =
            !library.scanned_at.is_empty() && state.library_scanned_at != library.scanned_at;
        if state.library_key == library_key && !scan_changed {
            state.track_count = conn.query_row(
                "
                SELECT COUNT(DISTINCT normalized_file_path)
                FROM plex_track_cache
                WHERE library_key = ?1 AND cache_run = ?2
                ",
                params![state.library_key, state.cache_run],
                |row| row.get(0),
            )?;
            conn.execute(
                "
                UPDATE plex_sync_state
                SET library_scanned_at = ?1, cache_track_count = ?2
                WHERE id = 1
                ",
                params![state.library_scanned_at, state.track_count],
            )?;
            return Ok(state);
        }
    }

    let cache_run = format!("{}-{}", Utc::now().timestamp_millis(), std::process::id());
    let scanned_at = if library.scanned_at.is_empty() {
        Utc::now().to_rfc3339()
    } else {
        library.scanned_at.clone()
    };
    conn.execute("DELETE FROM plex_track_cache", [])?;
    conn.execute(
        "
        UPDATE plex_sync_state
        SET library_key = ?1, library_scanned_at = ?2,
            cache_run = ?3, cache_track_count = 0
        WHERE id = 1
        ",
        params![library_key, scanned_at, cache_run],
    )?;
    Ok(CacheState {
        library_key,
        library_scanned_at: scanned_at,
        cache_run,
        track_count: 0,
    })
}

fn map_cached_paths(
    conn: &Connection,
    state: &CacheState,
    desired_paths: &[String],
) -> Result<HashMap<String, String>> {
    let normalized = desired_paths
        .iter()
        .map(|path| normalize_media_path(path))
        .filter(|path| !path.is_empty())
        .collect::<HashSet<_>>();
    let mut mapped = HashMap::new();
    for chunk in normalized.iter().collect::<Vec<_>>().chunks(400) {
        let placeholders = std::iter::repeat_n("?", chunk.len())
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "
            SELECT normalized_file_path, plex_track_rating_key
            FROM plex_track_cache
            WHERE library_key = ? AND cache_run = ?
              AND normalized_file_path IN ({placeholders})
            ORDER BY plex_track_rating_key
            "
        );
        let mut values = Vec::with_capacity(chunk.len() + 2);
        values.push(state.library_key.clone());
        values.push(state.cache_run.clone());
        values.extend(chunk.iter().map(|value| (*value).clone()));
        let mut statement = conn.prepare(&sql)?;
        let rows = statement.query_map(params_from_iter(values), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (path, rating_key) = row?;
            mapped.entry(path).or_insert(rating_key);
        }
    }
    Ok(mapped)
}

fn lookup_and_cache_paths(
    conn: &Connection,
    client: &PlexClient,
    library: &PlexLibrary,
    state: &mut CacheState,
    desired_paths: &[String],
    checked_paths: &mut HashSet<String>,
) -> Result<(HashMap<String, String>, bool)> {
    let mut original_by_normalized = HashMap::new();
    for path in desired_paths {
        let normalized = normalize_media_path(path);
        if !normalized.is_empty() {
            original_by_normalized
                .entry(normalized)
                .or_insert_with(|| path.clone());
        }
    }
    let mut mapped = map_cached_paths(conn, state, desired_paths)?;
    let lookup_paths = original_by_normalized
        .iter()
        .filter_map(|(normalized, original)| {
            (!mapped.contains_key(normalized) && checked_paths.insert(normalized.clone()))
                .then_some(original.clone())
        })
        .collect::<Vec<_>>();
    if lookup_paths.is_empty() {
        return Ok((mapped, false));
    }

    let wanted = original_by_normalized.keys().collect::<HashSet<_>>();
    let tracks = client.tracks_for_paths(library, &lookup_paths)?;
    let transaction = conn
        .unchecked_transaction()
        .context("Could not start the Plex path-cache transaction")?;
    {
        let mut statement = transaction.prepare_cached(
            "
            INSERT OR IGNORE INTO plex_track_cache (
                library_key, cache_run, plex_track_rating_key,
                normalized_file_path
            ) VALUES (?1, ?2, ?3, ?4)
            ",
        )?;
        for track in tracks {
            let normalized = normalize_media_path(&track.file);
            if wanted.contains(&normalized) {
                statement.execute(params![
                    state.library_key,
                    state.cache_run,
                    track.rating_key,
                    normalized
                ])?;
            }
        }
    }
    transaction.commit()?;
    state.track_count = conn.query_row(
        "
        SELECT COUNT(DISTINCT normalized_file_path)
        FROM plex_track_cache
        WHERE library_key = ?1 AND cache_run = ?2
        ",
        params![state.library_key, state.cache_run],
        |row| row.get(0),
    )?;
    conn.execute(
        "UPDATE plex_sync_state SET cache_track_count = ?1 WHERE id = 1",
        params![state.track_count],
    )?;
    mapped = map_cached_paths(conn, state, desired_paths)?;
    Ok((mapped, true))
}

fn marker_for(saved_playlist_id: i64) -> String {
    format!("Managed by Music Library smart playlist {saved_playlist_id}")
}

fn record_playlist_failure(conn: &Connection, id: i64, message: &str) -> Result<()> {
    conn.execute(
        "
        UPDATE playlist_automations
        SET last_plex_attempt_at = ?1, last_plex_error = ?2
        WHERE saved_playlist_id = ?3
        ",
        params![Utc::now().to_rfc3339(), message, id],
    )?;
    Ok(())
}

fn sync_playlist_with_context(
    conn: &Connection,
    client: &PlexClient,
    identity: &PlexIdentity,
    library: &PlexLibrary,
    cache: &mut CacheState,
    checked_paths: &mut HashSet<String>,
    cache_refreshed: &mut bool,
    available_playlists: &mut Vec<PlexPlaylist>,
    id: i64,
) -> Result<PlexPlaylistSyncResult> {
    let attempted_at = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE playlist_automations SET last_plex_attempt_at = ?1, last_plex_error = NULL WHERE saved_playlist_id = ?2",
        params![attempted_at, id],
    )?;
    let evaluation = db::evaluate_smart_playlist_for_connection(conn, id)?;
    let saved = evaluation.playlist;
    let desired_count = saved.automation.desired_count;
    let (mapped, queried_plex) = lookup_and_cache_paths(
        conn,
        client,
        library,
        cache,
        &evaluation.desired_paths,
        checked_paths,
    )?;
    *cache_refreshed |= queried_plex;
    let mut desired_rating_keys = Vec::new();
    let mut seen_rating_keys = HashSet::new();
    for path in &evaluation.desired_paths {
        if let Some(rating_key) = mapped.get(&normalize_media_path(path)) {
            if seen_rating_keys.insert(rating_key.clone()) {
                desired_rating_keys.push(rating_key.clone());
            }
        }
    }
    let matched_count = desired_rating_keys.len() as i64;
    let missing_count = desired_count.saturating_sub(matched_count);
    let marker = marker_for(id);
    let persisted_rating_key = saved.automation.plex_playlist_rating_key.as_deref();
    let mut plex_playlist_id = persisted_rating_key
        .and_then(|rating_key| {
            available_playlists
                .iter()
                .find(|playlist| playlist.rating_key == rating_key)
        })
        .or_else(|| {
            available_playlists
                .iter()
                .find(|playlist| playlist.summary == marker)
        })
        .map(|playlist| playlist.rating_key.clone());

    if desired_count > 0 && matched_count == 0 {
        let message = format!(
            "No local tracks could be mapped to Plex, so the existing playlist was left unchanged; {missing_count} tracks are waiting for Plex"
        );
        conn.execute(
            "
            UPDATE playlist_automations
            SET matched_count = 0, missing_count = ?1,
                last_plex_success_at = ?2, last_plex_error = NULL
            WHERE saved_playlist_id = ?3
            ",
            params![missing_count, attempted_at, id],
        )?;
        return Ok(PlexPlaylistSyncResult {
            saved_playlist_id: id,
            playlist_name: saved.name,
            status: "waitingForPlex".to_string(),
            desired_count,
            matched_count,
            missing_count,
            added_count: 0,
            removed_count: 0,
            moved_count: 0,
            plex_playlist_rating_key: plex_playlist_id,
            synced_at: attempted_at,
            message,
        });
    }

    let mut added_count = 0_usize;
    let mut removed_count = 0_usize;
    let mut moved_count = 0_usize;
    if plex_playlist_id.is_none() && !desired_rating_keys.is_empty() {
        let created = client.create_playlist(identity, &saved.name, &desired_rating_keys)?;
        client.edit_playlist(&created, &saved.name, &marker)?;
        added_count = desired_rating_keys.len().min(100);
        plex_playlist_id = Some(created.clone());
        available_playlists.push(PlexPlaylist {
            rating_key: created,
            summary: marker.clone(),
        });
    }

    if let Some(playlist_id) = plex_playlist_id.as_deref() {
        client.edit_playlist(playlist_id, &saved.name, &marker)?;
        let mut current = client.playlist_items(playlist_id)?;
        let desired_set = desired_rating_keys.iter().cloned().collect::<HashSet<_>>();
        let mut retained = HashSet::new();
        let remove_ids = current
            .iter()
            .filter(|item| {
                !desired_set.contains(&item.rating_key) || !retained.insert(item.rating_key.clone())
            })
            .map(|item| item.playlist_item_id.clone())
            .collect::<Vec<_>>();
        for item_id in &remove_ids {
            client.delete_item(playlist_id, item_id)?;
            removed_count += 1;
        }
        if !remove_ids.is_empty() {
            current = client.playlist_items(playlist_id)?;
        }
        let current_set = current
            .iter()
            .map(|item| item.rating_key.clone())
            .collect::<HashSet<_>>();
        let missing_keys = desired_rating_keys
            .iter()
            .filter(|key| !current_set.contains(*key))
            .cloned()
            .collect::<Vec<_>>();
        if !missing_keys.is_empty() {
            client.add_items(identity, playlist_id, &missing_keys)?;
            added_count += missing_keys.len();
            current = client.playlist_items(playlist_id)?;
        }

        for (target_index, target_key) in desired_rating_keys.iter().enumerate() {
            let Some(current_index) = current
                .iter()
                .position(|item| &item.rating_key == target_key)
            else {
                bail!("Plex did not retain a track that was just added to the playlist")
            };
            if current_index == target_index {
                continue;
            }
            let item = current.remove(current_index);
            let after = target_index
                .checked_sub(1)
                .and_then(|index| current.get(index))
                .map(|previous| previous.playlist_item_id.as_str());
            client.move_item(playlist_id, &item.playlist_item_id, after)?;
            current.insert(target_index, item);
            moved_count += 1;
        }
    }

    let content_hash = hex::encode(Sha256::digest(desired_rating_keys.join(",").as_bytes()));
    conn.execute(
        "
        UPDATE playlist_automations
        SET plex_playlist_rating_key = ?1, last_plex_success_at = ?2,
            last_plex_error = NULL, desired_count = ?3,
            matched_count = ?4, missing_count = ?5, last_content_hash = ?6
        WHERE saved_playlist_id = ?7
        ",
        params![
            plex_playlist_id,
            attempted_at,
            desired_count,
            matched_count,
            missing_count,
            content_hash,
            id
        ],
    )?;
    let status = if missing_count > 0 {
        "partial"
    } else if added_count == 0 && removed_count == 0 && moved_count == 0 {
        "unchanged"
    } else {
        "synced"
    };
    let message = if missing_count > 0 {
        format!("Synced {matched_count} tracks; {missing_count} are waiting for Plex to scan them")
    } else if status == "unchanged" {
        format!("Plex already had all {matched_count} tracks in the correct order")
    } else {
        format!(
            "Synced {matched_count} tracks to Plex: {added_count} added, {removed_count} removed, {moved_count} reordered"
        )
    };
    Ok(PlexPlaylistSyncResult {
        saved_playlist_id: id,
        playlist_name: saved.name,
        status: status.to_string(),
        desired_count,
        matched_count,
        missing_count,
        added_count,
        removed_count,
        moved_count,
        plex_playlist_rating_key: plex_playlist_id,
        synced_at: attempted_at,
        message,
    })
}

fn record_global_start(conn: &Connection) -> Result<()> {
    conn.execute(
        "UPDATE plex_sync_state SET last_attempt_at = ?1, last_error = NULL WHERE id = 1",
        params![Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

fn record_global_completion(
    conn: &Connection,
    profile: &StoredPlexProfile,
    error: Option<&str>,
) -> Result<()> {
    let now = Utc::now();
    let next = if error.is_some() {
        now + ChronoDuration::minutes(15)
    } else {
        now + ChronoDuration::minutes(i64::from(profile.auto_sync_minutes))
    };
    conn.execute(
        "
        UPDATE plex_sync_state
        SET last_success_at = CASE WHEN ?1 IS NULL THEN ?2 ELSE last_success_at END,
            last_error = ?1, next_auto_sync_at = ?3
        WHERE id = 1
        ",
        params![error, now.to_rfc3339(), next.to_rfc3339()],
    )?;
    Ok(())
}

fn sync_ids(app: &AppHandle, ids: Vec<i64>, trigger: &str) -> Result<PlexSyncSummary> {
    let profile = load_profile(app)?;
    let (conn, _) = db::open(app)?;
    record_global_start(&conn)?;
    if ids.is_empty() {
        record_global_completion(&conn, &profile, None)?;
        return Ok(PlexSyncSummary {
            trigger: trigger.to_string(),
            completed_at: Utc::now().to_rfc3339(),
            message: "No smart playlists are enabled for Plex auto-sync.".to_string(),
            ..PlexSyncSummary::empty()
        });
    }
    let client = PlexClient::new(profile.clone(), active_token()?);
    let identity = client.identity()?;
    let library = client.library()?;
    let mut cache = prepare_track_cache(&conn, &identity, &library)?;
    let mut checked_paths = HashSet::new();
    let mut cache_refreshed = false;
    let mut available_playlists = client.playlists()?;
    let mut results = Vec::new();
    let mut failures = Vec::new();
    for id in ids {
        match sync_playlist_with_context(
            &conn,
            &client,
            &identity,
            &library,
            &mut cache,
            &mut checked_paths,
            &mut cache_refreshed,
            &mut available_playlists,
            id,
        ) {
            Ok(result) => results.push(result),
            Err(error) => {
                let message = error.to_string();
                let _ = record_playlist_failure(&conn, id, &message);
                let saved = db::load_saved_playlist_for_connection(&conn, id).ok();
                results.push(PlexPlaylistSyncResult {
                    saved_playlist_id: id,
                    playlist_name: saved
                        .as_ref()
                        .map(|playlist| playlist.name.clone())
                        .unwrap_or_else(|| format!("Playlist {id}")),
                    status: "failed".to_string(),
                    desired_count: saved
                        .as_ref()
                        .map(|playlist| playlist.automation.desired_count)
                        .unwrap_or(0),
                    matched_count: 0,
                    missing_count: 0,
                    added_count: 0,
                    removed_count: 0,
                    moved_count: 0,
                    plex_playlist_rating_key: saved
                        .and_then(|playlist| playlist.automation.plex_playlist_rating_key),
                    synced_at: Utc::now().to_rfc3339(),
                    message: message.clone(),
                });
                failures.push(message);
            }
        }
    }
    let failed_count = failures.len();
    let playlist_count = results.len();
    let synced_count = playlist_count.saturating_sub(failed_count);
    let desired_count = results.iter().map(|result| result.desired_count).sum();
    let matched_count = results.iter().map(|result| result.matched_count).sum();
    let missing_count = results.iter().map(|result| result.missing_count).sum();
    let error = (!failures.is_empty()).then(|| failures.join("; "));
    record_global_completion(&conn, &profile, error.as_deref())?;
    let message = if failed_count > 0 {
        format!(
            "Synced {synced_count} of {playlist_count} Plex playlists; {failed_count} need attention"
        )
    } else {
        format!(
            "Synced {playlist_count} Plex playlists with {matched_count} matched tracks; {missing_count} waiting for Plex"
        )
    };
    Ok(PlexSyncSummary {
        trigger: trigger.to_string(),
        playlist_count,
        synced_count,
        failed_count,
        desired_count,
        matched_count,
        missing_count,
        cache_refreshed,
        cache_track_count: cache.track_count,
        completed_at: Utc::now().to_rfc3339(),
        message,
        playlists: results,
    })
}

impl PlexSyncSummary {
    fn empty() -> Self {
        Self {
            trigger: String::new(),
            playlist_count: 0,
            synced_count: 0,
            failed_count: 0,
            desired_count: 0,
            matched_count: 0,
            missing_count: 0,
            cache_refreshed: false,
            cache_track_count: 0,
            completed_at: String::new(),
            message: String::new(),
            playlists: Vec::new(),
        }
    }
}

fn record_sync_error(app: &AppHandle, error: &anyhow::Error) {
    if let Ok((conn, _)) = db::open(app) {
        if let Ok(profile) = load_profile(app) {
            let _ = record_global_completion(&conn, &profile, Some(&error.to_string()));
        }
    }
}

pub fn sync_all(app: &AppHandle, trigger: &str) -> Result<PlexSyncSummary> {
    let gate = SYNC_GATE.get_or_init(|| Mutex::new(()));
    let _guard = gate
        .try_lock()
        .map_err(|_| anyhow!("A Plex playlist sync is already running"))?;
    let (conn, _) = db::open(app)?;
    let ids = db::plex_enabled_smart_playlist_ids(&conn)?;
    drop(conn);
    let result = sync_ids(app, ids, trigger);
    if let Err(error) = &result {
        record_sync_error(app, error);
    }
    result
}

pub fn sync_playlist(app: &AppHandle, id: i64) -> Result<PlexPlaylistSyncResult> {
    let gate = SYNC_GATE.get_or_init(|| Mutex::new(()));
    let _guard = gate
        .try_lock()
        .map_err(|_| anyhow!("A Plex playlist sync is already running"))?;
    let result = sync_ids(app, vec![id], "manual");
    if let Err(error) = &result {
        record_sync_error(app, error);
    }
    let summary = result?;
    summary
        .playlists
        .into_iter()
        .next()
        .context("The Plex playlist sync returned no result")
}

fn automatic_sync_due(app: &AppHandle) -> Result<bool> {
    let profile = load_profile(app)?;
    if !profile.auto_sync_enabled {
        return Ok(false);
    }
    let (conn, _) = db::open(app)?;
    let next: Option<String> = conn.query_row(
        "SELECT next_auto_sync_at FROM plex_sync_state WHERE id = 1",
        [],
        |row| row.get(0),
    )?;
    let Some(next) = next else {
        let scheduled = Utc::now() + ChronoDuration::minutes(i64::from(profile.auto_sync_minutes));
        conn.execute(
            "UPDATE plex_sync_state SET next_auto_sync_at = ?1 WHERE id = 1",
            params![scheduled.to_rfc3339()],
        )?;
        return Ok(false);
    };
    Ok(DateTime::parse_from_rfc3339(&next)
        .map(|next| next.with_timezone(&Utc) <= Utc::now())
        .unwrap_or(true))
}

pub fn resume_sync_worker(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(15)).await;
        loop {
            let worker_app = app.clone();
            let _ = tauri::async_runtime::spawn_blocking(move || {
                if automatic_sync_due(&worker_app).unwrap_or(false) {
                    let _ = sync_all(&worker_app, "automatic");
                }
            })
            .await;
            tokio::time::sleep(Duration::from_secs(60)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn normalizes_loopback_server_urls_and_rejects_remote_plain_http() {
        assert_eq!(
            normalize_server_url("localhost:32400/").unwrap(),
            "http://localhost:32400"
        );
        assert_eq!(
            normalize_server_url("https://plex.example.test/").unwrap(),
            "https://plex.example.test"
        );
        assert!(normalize_server_url("http://plex.example.test:32400").is_err());
        assert!(normalize_server_url("ftp://localhost:32400").is_err());
    }

    #[test]
    fn normalizes_windows_paths_for_plex_matching() {
        assert_eq!(
            normalize_media_path(r"D:/MUSIC/Depeche Mode/./Violator/01 - World.mp3"),
            r"d:\music\depeche mode\violator\01 - world.mp3"
        );
        assert_eq!(
            normalize_media_path(r"D:\Music\Artist\Album\..\Track.flac"),
            r"d:\music\artist\track.flac"
        );
    }

    #[test]
    fn builds_server_playlist_item_uris_without_exposing_tokens() {
        assert_eq!(
            playlist_uri("machine", &["41".to_string(), "42".to_string()]),
            "server://machine/com.plexapp.plugins.library/library/metadata/41,42"
        );
    }

    #[test]
    fn maps_and_caches_only_exact_requested_plex_paths() {
        let conn = Connection::open_in_memory().expect("open app cache");
        conn.execute_batch(
            "
            CREATE TABLE plex_track_cache (
                library_key TEXT NOT NULL,
                cache_run TEXT NOT NULL,
                plex_track_rating_key TEXT NOT NULL,
                normalized_file_path TEXT NOT NULL,
                PRIMARY KEY (library_key, cache_run, plex_track_rating_key, normalized_file_path)
            );
            CREATE TABLE plex_sync_state (
                id INTEGER PRIMARY KEY,
                cache_track_count INTEGER NOT NULL DEFAULT 0
            );
            INSERT INTO plex_sync_state (id) VALUES (1);
            ",
        )
        .expect("create app cache schema");
        let mut state = CacheState {
            library_key: "machine:1".to_string(),
            library_scanned_at: "1".to_string(),
            cache_run: "run".to_string(),
            track_count: 0,
        };
        let desired_paths = vec![
            r"D:\Music\Artist\Album\01 Track.mp3".to_string(),
            r"D:\Music\Artist\Album\02 Missing.mp3".to_string(),
        ];
        let wanted = desired_paths
            .iter()
            .map(|path| normalize_media_path(path))
            .collect::<HashSet<_>>();
        let tracks = vec![
            PlexTrack {
                rating_key: "101".to_string(),
                file: desired_paths[0].clone(),
            },
            PlexTrack {
                rating_key: "999".to_string(),
                file: r"D:\Music\Other\Unexpected.mp3".to_string(),
            },
        ];
        let transaction = conn.unchecked_transaction().expect("start transaction");
        for track in tracks {
            let normalized = normalize_media_path(&track.file);
            if wanted.contains(&normalized) {
                transaction
                    .execute(
                        "INSERT INTO plex_track_cache VALUES (?1, ?2, ?3, ?4)",
                        params![
                            state.library_key,
                            state.cache_run,
                            track.rating_key,
                            normalized
                        ],
                    )
                    .expect("cache exact Plex track");
            }
        }
        transaction.commit().expect("commit cache");
        state.track_count = 1;
        let mapped = map_cached_paths(&conn, &state, &desired_paths).expect("map paths");
        assert_eq!(mapped.len(), 1);
        assert_eq!(
            mapped.get(&normalize_media_path(&desired_paths[0])),
            Some(&"101".to_string())
        );
        assert!(!mapped.contains_key(&normalize_media_path(&desired_paths[1])));
    }

    #[test]
    fn local_plex_database_query_stays_read_only_and_library_scoped() {
        let temp = tempdir().expect("create Plex database directory");
        let database_path = temp.path().join("plex.db");
        let conn = Connection::open(&database_path).expect("create Plex database");
        conn.execute_batch(
            "
            CREATE TABLE metadata_items (
                id INTEGER PRIMARY KEY, library_section_id INTEGER,
                metadata_type INTEGER, deleted_at INTEGER
            );
            CREATE TABLE media_items (
                id INTEGER PRIMARY KEY, metadata_item_id INTEGER,
                deleted_at INTEGER
            );
            CREATE TABLE media_parts (
                id INTEGER PRIMARY KEY, media_item_id INTEGER,
                file TEXT, deleted_at INTEGER
            );
            CREATE INDEX index_media_parts_on_file ON media_parts (file);
            INSERT INTO metadata_items VALUES (101, 1, 10, NULL);
            INSERT INTO metadata_items VALUES (202, 2, 10, NULL);
            INSERT INTO media_items VALUES (11, 101, NULL);
            INSERT INTO media_items VALUES (22, 202, NULL);
            INSERT INTO media_parts VALUES (1, 11, 'D:\\Music\\Exact.mp3', NULL);
            INSERT INTO media_parts VALUES (2, 22, 'D:\\Music\\Wrong Library.mp3', NULL);
            ",
        )
        .expect("seed Plex database");
        drop(conn);

        let conn = Connection::open_with_flags(
            &database_path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .expect("open Plex database read-only");
        conn.execute_batch("PRAGMA query_only = ON;")
            .expect("enable query only");
        let mut statement = conn
            .prepare(
                "
                SELECT CAST(metadata_items.id AS TEXT), media_parts.file
                FROM media_parts INDEXED BY index_media_parts_on_file
                JOIN media_items ON media_items.id = media_parts.media_item_id
                JOIN metadata_items ON metadata_items.id = media_items.metadata_item_id
                WHERE metadata_items.library_section_id = ?1
                  AND metadata_items.metadata_type = 10
                  AND media_parts.file = ?2
                ",
            )
            .expect("prepare local Plex query");
        let track = statement
            .query_row(params!["1", r"D:\Music\Exact.mp3"], |row| {
                Ok(PlexTrack {
                    rating_key: row.get(0)?,
                    file: row.get(1)?,
                })
            })
            .expect("read exact local Plex track");
        assert_eq!(track.rating_key, "101");
        assert!(conn.execute("DELETE FROM media_parts", []).is_err());
    }
}
