use crate::db::{self, ArtistImageCacheRecord};
use anyhow::{anyhow, bail, Context, Result};
use base64::{engine::general_purpose, Engine as _};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read as _;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use url::Url;
use zeroize::Zeroizing;

const KEYRING_SERVICE: &str = "com.local.musiclibrary.lastfm";
const KEYRING_USER: &str = "api-key";
const LASTFM_API_BASE: &str = "https://ws.audioscrobbler.com/2.0/";
const LASTFM_USER_AGENT: &str = "music-backup-v5/0.115.0 (local artist portrait enrichment)";
const REQUEST_INTERVAL: Duration = Duration::from_millis(350);
const MAX_IMAGE_BYTES: u64 = 8 * 1024 * 1024;
const LASTFM_PLACEHOLDER_HASH: &str = "2a96cbd8b46e442fc41c2b86b821562f";

static REQUEST_GATE: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LastFmCredentialStatus {
    pub configured: bool,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LastFmConnectionTest {
    pub authenticated: bool,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLastFmApiKeyRequest {
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LastFmArtistImageRefreshSummary {
    pub requested: u32,
    pub downloaded: u32,
    pub unavailable: u32,
    pub failed: u32,
    pub remaining: i64,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct ArtistInfoPayload {
    artist: LastFmArtist,
}

#[derive(Debug, Deserialize)]
struct LastFmArtist {
    name: String,
    #[serde(default)]
    image: Vec<LastFmImage>,
}

#[derive(Debug, Deserialize)]
struct LastFmImage {
    #[serde(rename = "#text", default)]
    url: String,
    #[allow(dead_code)]
    #[serde(default)]
    size: String,
}

struct DownloadedImage {
    source_url: String,
    bytes: Vec<u8>,
    mime_type: String,
    extension: String,
}

fn credential_entry() -> Result<Entry> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .context("Could not open Windows Credential Manager for Last.fm")
}

fn normalize_api_key(value: String) -> Result<String> {
    let value = value.trim().to_string();
    if !(8..=128).contains(&value.len())
        || value.chars().any(char::is_whitespace)
        || value.chars().any(char::is_control)
    {
        bail!("Enter a valid Last.fm API key.")
    }
    Ok(value)
}

fn stored_api_key() -> Result<Option<Zeroizing<String>>> {
    match credential_entry()?.get_password() {
        Ok(value) if !value.trim().is_empty() => Ok(Some(Zeroizing::new(value))),
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => {
            Err(error).context("Could not read the Last.fm API key from Windows Credential Manager")
        }
    }
}

fn require_api_key() -> Result<Zeroizing<String>> {
    stored_api_key()?
        .context("Last.fm portraits are not configured. Add the API key in Settings > Providers.")
}

fn wait_for_request_slot() {
    let gate = REQUEST_GATE.get_or_init(|| Mutex::new(None));
    let mut last_request = gate.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(last_request_at) = *last_request {
        let elapsed = last_request_at.elapsed();
        if elapsed < REQUEST_INTERVAL {
            thread::sleep(REQUEST_INTERVAL - elapsed);
        }
    }
    *last_request = Some(Instant::now());
}

fn artist_info(api_key: &str, artist: &str) -> Result<LastFmArtist> {
    wait_for_request_slot();
    let mut url = Url::parse(LASTFM_API_BASE).context("Could not create the Last.fm API URL")?;
    url.query_pairs_mut()
        .append_pair("method", "artist.getInfo")
        .append_pair("artist", artist)
        .append_pair("api_key", api_key)
        .append_pair("autocorrect", "1")
        .append_pair("format", "json");
    let response = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(30))
        .build()
        .get(url.as_str())
        .set("Accept", "application/json")
        .set("User-Agent", LASTFM_USER_AGENT)
        .call()
        .map_err(|error| match error {
            ureq::Error::Status(403, _) => anyhow!("Last.fm rejected the configured API key."),
            ureq::Error::Status(429, _) => {
                anyhow!("Last.fm rate limit reached. Try the portrait sync again later.")
            }
            ureq::Error::Status(status, _) => {
                anyhow!("Last.fm artist lookup failed with status {status}.")
            }
            ureq::Error::Transport(_) => anyhow!("Could not reach Last.fm."),
        })?;
    response
        .into_json::<ArtistInfoPayload>()
        .map(|payload| payload.artist)
        .context("Last.fm returned an unreadable artist response")
}

fn connection_test_with(api_key: &str) -> Result<LastFmConnectionTest> {
    let artist = artist_info(api_key, "Cher")?;
    if artist.name.trim().is_empty() {
        bail!("Last.fm did not return the expected artist response.")
    }
    Ok(LastFmConnectionTest {
        authenticated: true,
        message: "Last.fm connected. Artist portrait enrichment is ready.".to_string(),
    })
}

pub fn credential_status() -> Result<LastFmCredentialStatus> {
    let configured = stored_api_key()?.is_some();
    Ok(LastFmCredentialStatus {
        configured,
        source: if configured {
            "windowsCredentialManager".to_string()
        } else {
            "none".to_string()
        },
    })
}

pub fn save_api_key(request: SaveLastFmApiKeyRequest) -> Result<LastFmConnectionTest> {
    let api_key = Zeroizing::new(normalize_api_key(request.api_key)?);
    let test = connection_test_with(api_key.as_str())?;
    credential_entry()?
        .set_password(api_key.as_str())
        .context("Could not store the Last.fm API key in Windows Credential Manager")?;
    Ok(test)
}

pub fn delete_api_key() -> Result<LastFmCredentialStatus> {
    match credential_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(error) => {
            return Err(error)
                .context("Could not remove the Last.fm API key from Windows Credential Manager")
        }
    }
    credential_status()
}

pub fn test_connection() -> Result<LastFmConnectionTest> {
    let api_key = require_api_key()?;
    connection_test_with(api_key.as_str())
}

fn selected_image_url(images: &[LastFmImage]) -> Option<String> {
    images
        .iter()
        .rev()
        .map(|image| image.url.trim())
        .find(|url| {
            !url.is_empty()
                && !url.contains(LASTFM_PLACEHOLDER_HASH)
                && Url::parse(url).is_ok_and(|parsed| {
                    parsed.scheme() == "https"
                        && parsed.host_str().is_some_and(|host| {
                            host.eq_ignore_ascii_case("lastfm.freetls.fastly.net")
                                || host.eq_ignore_ascii_case("lastfm-img2.akamaized.net")
                                || host.ends_with(".last.fm")
                        })
                })
        })
        .map(str::to_string)
}

fn download_image(source_url: &str) -> Result<DownloadedImage> {
    wait_for_request_slot();
    let response = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(30))
        .build()
        .get(source_url)
        .set("Accept", "image/jpeg,image/png,image/webp")
        .set("User-Agent", LASTFM_USER_AGENT)
        .call()
        .map_err(|error| match error {
            ureq::Error::Status(status, _) => {
                anyhow!("Last.fm portrait download failed with status {status}.")
            }
            ureq::Error::Transport(_) => anyhow!("Could not download the Last.fm portrait."),
        })?;
    let mime_type = response
        .header("Content-Type")
        .and_then(|value| value.split(';').next())
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    let extension = match mime_type.as_str() {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        _ => bail!("Last.fm returned an unsupported portrait image type."),
    };
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(MAX_IMAGE_BYTES + 1)
        .read_to_end(&mut bytes)
        .context("Could not read the Last.fm portrait")?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_IMAGE_BYTES {
        bail!("Last.fm returned an invalid or oversized portrait image.")
    }
    Ok(DownloadedImage {
        source_url: source_url.to_string(),
        bytes,
        mime_type,
        extension: extension.to_string(),
    })
}

fn portrait_path(app: &AppHandle, artist_key: &str, extension: &str) -> Result<PathBuf> {
    let directory = app
        .path()
        .app_data_dir()
        .context("Could not resolve the artist portrait cache directory")?
        .join("artist-images");
    fs::create_dir_all(&directory)
        .context("Could not create the artist portrait cache directory")?;
    let digest = Sha256::digest(artist_key.as_bytes());
    Ok(directory.join(format!("{:x}.{extension}", digest)))
}

pub fn refresh_artist_images(
    app: AppHandle,
    limit: u32,
) -> Result<LastFmArtistImageRefreshSummary> {
    let api_key = require_api_key()?;
    let candidates = db::artist_image_candidates_for_app(&app, limit)?;
    let requested = candidates.len() as u32;
    let mut downloaded = 0;
    let mut unavailable = 0;
    let mut failed = 0;

    for candidate in candidates {
        let record = match artist_info(api_key.as_str(), &candidate.artist_name) {
            Ok(artist) => match selected_image_url(&artist.image) {
                Some(source_url) => match download_image(&source_url) {
                    Ok(image) => {
                        let path = portrait_path(&app, &candidate.artist_key, &image.extension)?;
                        fs::write(&path, &image.bytes).with_context(|| {
                            format!("Could not cache the portrait for {}", candidate.artist_name)
                        })?;
                        downloaded += 1;
                        ArtistImageCacheRecord {
                            artist_key: candidate.artist_key,
                            artist_name: candidate.artist_name,
                            source_url: Some(image.source_url),
                            cache_path: Some(path.to_string_lossy().into_owned()),
                            mime_type: Some(image.mime_type),
                            state: "available".to_string(),
                            message: "Last.fm portrait cached.".to_string(),
                        }
                    }
                    Err(error) => {
                        failed += 1;
                        ArtistImageCacheRecord {
                            artist_key: candidate.artist_key,
                            artist_name: candidate.artist_name,
                            source_url: Some(source_url),
                            cache_path: None,
                            mime_type: None,
                            state: "failed".to_string(),
                            message: error.to_string(),
                        }
                    }
                },
                None => {
                    unavailable += 1;
                    ArtistImageCacheRecord {
                        artist_key: candidate.artist_key,
                        artist_name: candidate.artist_name,
                        source_url: None,
                        cache_path: None,
                        mime_type: None,
                        state: "unavailable".to_string(),
                        message: "Last.fm has no usable artist portrait.".to_string(),
                    }
                }
            },
            Err(error) => {
                failed += 1;
                ArtistImageCacheRecord {
                    artist_key: candidate.artist_key,
                    artist_name: candidate.artist_name,
                    source_url: None,
                    cache_path: None,
                    mime_type: None,
                    state: "failed".to_string(),
                    message: error.to_string(),
                }
            }
        };
        db::upsert_artist_image_for_app(&app, &record)?;
    }
    let remaining = db::artist_image_remaining_for_app(&app)?;
    Ok(LastFmArtistImageRefreshSummary {
        requested,
        downloaded,
        unavailable,
        failed,
        remaining,
        message: if requested == 0 {
            "Every artist has already been checked for a Last.fm portrait.".to_string()
        } else {
            format!("Portrait sync checked {requested} artists and cached {downloaded} images.")
        },
    })
}

pub fn artist_image_data_url(app: AppHandle, artist_id: String) -> Result<Option<String>> {
    let Some((cache_path, mime_type)) = db::artist_image_file_for_app(&app, &artist_id)? else {
        return Ok(None);
    };
    let path = PathBuf::from(cache_path);
    if !path.is_file() {
        return Ok(None);
    }
    let bytes = fs::read(&path)
        .with_context(|| format!("Could not read artist portrait {}", path.display()))?;
    Ok(Some(format!(
        "data:{mime_type};base64,{}",
        general_purpose::STANDARD.encode(bytes)
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_placeholder_and_non_lastfm_portrait_urls() {
        let images = vec![
            LastFmImage {
                url: format!(
                    "https://lastfm.freetls.fastly.net/i/u/300x300/{LASTFM_PLACEHOLDER_HASH}.png"
                ),
                size: "extralarge".to_string(),
            },
            LastFmImage {
                url: "https://example.com/artist.jpg".to_string(),
                size: "mega".to_string(),
            },
        ];
        assert_eq!(selected_image_url(&images), None);
    }

    #[test]
    fn prefers_the_largest_usable_lastfm_portrait() {
        let images = vec![
            LastFmImage {
                url: "https://lastfm.freetls.fastly.net/i/u/64s/artist.jpg".to_string(),
                size: "small".to_string(),
            },
            LastFmImage {
                url: "https://lastfm.freetls.fastly.net/i/u/300x300/artist.jpg".to_string(),
                size: "extralarge".to_string(),
            },
        ];
        assert_eq!(
            selected_image_url(&images).as_deref(),
            Some("https://lastfm.freetls.fastly.net/i/u/300x300/artist.jpg")
        );
    }
}
