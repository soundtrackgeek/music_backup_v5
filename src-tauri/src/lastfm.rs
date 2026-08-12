use crate::db::{
    self, ArtistImageCacheRecord, LastFmArtistIdentity, LastFmArtistPopularityCacheRecord,
    LastFmLocalTrackCandidate, LastFmTrackPopularityCacheRecord,
};
use anyhow::{anyhow, bail, Context, Result};
use base64::{engine::general_purpose, Engine as _};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use keyring::Entry;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Read as _;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use unicode_normalization::UnicodeNormalization;
use url::Url;
use zeroize::Zeroizing;

const KEYRING_SERVICE: &str = "com.local.musiclibrary.lastfm";
const KEYRING_USER: &str = "api-key";
const LASTFM_API_BASE: &str = "https://ws.audioscrobbler.com/2.0/";
const LASTFM_USER_AGENT: &str = "music-backup-v5/0.123.0 (local music metadata enrichment)";
const REQUEST_INTERVAL: Duration = Duration::from_millis(350);
const POPULARITY_CACHE_DAYS: i64 = 7;
const UNAVAILABLE_CACHE_DAYS: i64 = 30;
const ARTIST_TOP_TRACK_LIMIT: usize = 50;
const POPULAR_TRACK_RESPONSE_LIMIT: usize = 10;
const ARTIST_TOP_TRACKS_MUSICBRAINZ_METHOD: &str = "artist-top-tracks-musicbrainz";
const ARTIST_TOP_TRACKS_NAME_METHOD: &str = "artist-top-tracks-name";
const ARTIST_NAME_EMPTY_MESSAGE: &str =
    "Last.fm returned no popular tracks after checking the artist name.";
const MAX_IMAGE_BYTES: u64 = 8 * 1024 * 1024;
const LASTFM_PLACEHOLDER_HASH: &str = "2a96cbd8b46e442fc41c2b86b821562f";

static REQUEST_GATE: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();
static POPULARITY_GATE: OnceLock<Mutex<()>> = OnceLock::new();

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

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LastFmPopularTrack {
    pub rank: i64,
    pub track_id: i64,
    pub album_id: String,
    pub album: Option<String>,
    pub year: Option<i32>,
    pub title: String,
    pub artist: String,
    pub listeners: i64,
    pub play_count: i64,
    pub seconds: Option<i64>,
    pub source_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LastFmArtistPopularity {
    pub artist_id: String,
    pub artist_name: String,
    pub source_url: Option<String>,
    pub fetched_at: Option<String>,
    pub cached: bool,
    pub stale: bool,
    pub tracks: Vec<LastFmPopularTrack>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LastFmAlbumTrackPopularity {
    pub track_id: i64,
    pub title: String,
    pub listeners: i64,
    pub play_count: i64,
    pub album_rank: Option<u8>,
    pub source_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LastFmAlbumPopularity {
    pub artist_id: String,
    pub album_id: String,
    pub source_url: Option<String>,
    pub fetched_at: Option<String>,
    pub total_tracks: usize,
    pub resolved_tracks: usize,
    pub available_tracks: usize,
    pub stale: bool,
    pub tracks: Vec<LastFmAlbumTrackPopularity>,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct LastFmTopTracksPayload {
    toptracks: LastFmTopTracks,
}

#[derive(Debug, Deserialize)]
struct LastFmTopTracks {
    #[serde(default)]
    track: Vec<LastFmTopTrack>,
    #[serde(rename = "@attr", default)]
    attr: LastFmTopTracksAttr,
}

#[derive(Debug, Default, Deserialize)]
struct LastFmTopTracksAttr {
    #[serde(default)]
    artist: String,
}

#[derive(Debug, Deserialize)]
struct LastFmTopTrack {
    name: String,
    #[serde(default)]
    mbid: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    listeners: String,
    #[serde(default)]
    playcount: String,
    #[serde(rename = "@attr", default)]
    attr: LastFmTopTrackAttr,
}

#[derive(Debug, Default, Deserialize)]
struct LastFmTopTrackAttr {
    #[serde(default)]
    rank: String,
}

#[derive(Debug, Deserialize)]
struct LastFmTrackInfoPayload {
    track: LastFmTrackInfo,
}

#[derive(Debug, Deserialize)]
struct LastFmTrackInfo {
    name: String,
    #[serde(default)]
    mbid: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    listeners: String,
    #[serde(default)]
    playcount: String,
}

struct LastFmJsonResponse<T> {
    payload: T,
    fetched_at: String,
    expires_at: String,
    cacheable: bool,
}

#[derive(Clone)]
struct ArtistPopularitySnapshot {
    status: LastFmArtistPopularityCacheRecord,
    tracks: Vec<LastFmTrackPopularityCacheRecord>,
    cached: bool,
    stale: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ArtistTopTracksLookup {
    MusicBrainz(String),
    ArtistName(String),
}

impl ArtistTopTracksLookup {
    fn fetch_method(&self) -> &'static str {
        match self {
            Self::MusicBrainz(_) => ARTIST_TOP_TRACKS_MUSICBRAINZ_METHOD,
            Self::ArtistName(_) => ARTIST_TOP_TRACKS_NAME_METHOD,
        }
    }
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
        .context("Last.fm metadata is not configured. Add the API key in Settings > Providers.")
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

fn cache_control_max_age(value: &str) -> Option<i64> {
    value.split(',').find_map(|directive| {
        let (name, value) = directive.trim().split_once('=')?;
        name.trim()
            .eq_ignore_ascii_case("max-age")
            .then(|| value.trim().trim_matches('"').parse::<i64>().ok())
            .flatten()
    })
}

fn response_cache_policy(response: &ureq::Response, fallback_days: i64) -> (bool, String, String) {
    let fetched_at = Utc::now();
    let cache_control = response.header("Cache-Control").unwrap_or_default();
    let cacheable = !cache_control
        .split(',')
        .any(|directive| directive.trim().eq_ignore_ascii_case("no-store"));
    let seconds = if cache_control
        .split(',')
        .any(|directive| directive.trim().eq_ignore_ascii_case("no-cache"))
    {
        0
    } else {
        cache_control_max_age(cache_control)
            .unwrap_or_else(|| ChronoDuration::days(fallback_days).num_seconds())
            .max(0)
    };
    let expires_at = fetched_at + ChronoDuration::seconds(seconds);
    (cacheable, fetched_at.to_rfc3339(), expires_at.to_rfc3339())
}

fn lastfm_json(url: &Url, fallback_days: i64) -> Result<LastFmJsonResponse<serde_json::Value>> {
    wait_for_request_slot();
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
                anyhow!("Last.fm rate limit reached. Try again later.")
            }
            ureq::Error::Status(status, _) => {
                anyhow!("Last.fm metadata lookup failed with status {status}.")
            }
            ureq::Error::Transport(_) => anyhow!("Could not reach Last.fm."),
        })?;
    let (cacheable, fetched_at, expires_at) = response_cache_policy(&response, fallback_days);
    let payload = response
        .into_json::<serde_json::Value>()
        .context("Last.fm returned an unreadable metadata response")?;
    Ok(LastFmJsonResponse {
        payload,
        fetched_at,
        expires_at,
        cacheable,
    })
}

fn lastfm_error(value: &serde_json::Value) -> Option<(i64, String)> {
    let code = value.get("error")?.as_i64()?;
    let message = value
        .get("message")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("Last.fm could not resolve this metadata")
        .trim()
        .to_string();
    Some((code, message))
}

fn decode_lastfm_json<T: DeserializeOwned>(
    response: LastFmJsonResponse<serde_json::Value>,
) -> Result<LastFmJsonResponse<T>> {
    if let Some((code, message)) = lastfm_error(&response.payload) {
        bail!("Last.fm error {code}: {message}")
    }
    Ok(LastFmJsonResponse {
        payload: serde_json::from_value(response.payload)
            .context("Last.fm returned an unexpected metadata response")?,
        fetched_at: response.fetched_at,
        expires_at: response.expires_at,
        cacheable: response.cacheable,
    })
}

fn parse_lastfm_count(value: &str) -> i64 {
    value.trim().parse::<i64>().unwrap_or(0).max(0)
}

fn normalize_track_key(value: &str) -> String {
    value
        .nfkc()
        .flat_map(char::to_lowercase)
        .map(|character| match character {
            '\u{2010}' | '\u{2011}' | '\u{2012}' | '\u{2013}' | '\u{2014}' | '\u{2212}' => '-',
            '\u{2018}' | '\u{2019}' => '\'',
            other => other,
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn loose_track_key(value: &str) -> String {
    normalize_track_key(value)
        .chars()
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn nonempty(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn cache_record_is_fresh(record: &LastFmTrackPopularityCacheRecord) -> bool {
    record
        .expires_at
        .parse::<DateTime<Utc>>()
        .is_ok_and(|expires_at| expires_at > Utc::now())
}

fn artist_cache_is_fresh(record: &LastFmArtistPopularityCacheRecord) -> bool {
    record
        .expires_at
        .parse::<DateTime<Utc>>()
        .is_ok_and(|expires_at| expires_at > Utc::now())
}

fn lastfm_artist_tracks_url(artist_name: &str) -> Option<String> {
    let mut url = Url::parse("https://www.last.fm/music/").ok()?;
    url.path_segments_mut()
        .ok()?
        .push(artist_name.trim())
        .push("+tracks");
    Some(url.into())
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
        message: "Last.fm connected. Popularity and artist enrichment are ready.".to_string(),
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

fn artist_top_tracks_lookups(identity: &LastFmArtistIdentity) -> Vec<ArtistTopTracksLookup> {
    let mut lookups = Vec::with_capacity(2);
    if let Some(mbid) = identity.musicbrainz_mbid.as_deref().and_then(nonempty) {
        lookups.push(ArtistTopTracksLookup::MusicBrainz(mbid));
    }
    lookups.push(ArtistTopTracksLookup::ArtistName(
        identity.artist_name.clone(),
    ));
    lookups
}

fn artist_top_tracks_url(api_key: &str, lookup: &ArtistTopTracksLookup) -> Result<Url> {
    let mut url = Url::parse(LASTFM_API_BASE).context("Could not create the Last.fm API URL")?;
    {
        let mut query = url.query_pairs_mut();
        query
            .append_pair("method", "artist.getTopTracks")
            .append_pair("api_key", api_key)
            .append_pair("autocorrect", "1")
            .append_pair("limit", &ARTIST_TOP_TRACK_LIMIT.to_string())
            .append_pair("format", "json");
        match lookup {
            ArtistTopTracksLookup::MusicBrainz(mbid) => {
                query.append_pair("mbid", mbid);
            }
            ArtistTopTracksLookup::ArtistName(artist_name) => {
                query.append_pair("artist", artist_name);
            }
        }
    }
    Ok(url)
}

fn fetch_artist_top_tracks_once(
    api_key: &str,
    identity: &LastFmArtistIdentity,
    lookup: &ArtistTopTracksLookup,
) -> Result<(
    LastFmArtistPopularityCacheRecord,
    Vec<LastFmTrackPopularityCacheRecord>,
    bool,
)> {
    let url = artist_top_tracks_url(api_key, lookup)?;
    let response =
        decode_lastfm_json::<LastFmTopTracksPayload>(lastfm_json(&url, POPULARITY_CACHE_DAYS)?)?;
    let response_artist = nonempty(&response.payload.toptracks.attr.artist)
        .unwrap_or_else(|| identity.artist_name.clone());
    let source_url = lastfm_artist_tracks_url(&response_artist);
    let mut seen = HashSet::new();
    let tracks = response
        .payload
        .toptracks
        .track
        .into_iter()
        .enumerate()
        .filter_map(|(index, track)| {
            let track_name = nonempty(&track.name)?;
            let track_key = normalize_track_key(&track_name);
            if track_key.is_empty() || !seen.insert(track_key.clone()) {
                return None;
            }
            Some(LastFmTrackPopularityCacheRecord {
                artist_key: identity.artist_key.clone(),
                track_key,
                artist_name: response_artist.clone(),
                track_name,
                musicbrainz_recording_mbid: nonempty(&track.mbid),
                listeners: Some(parse_lastfm_count(&track.listeners)),
                play_count: Some(parse_lastfm_count(&track.playcount)),
                artist_rank: Some(
                    track
                        .attr
                        .rank
                        .trim()
                        .parse::<i64>()
                        .unwrap_or(index as i64 + 1)
                        .max(1),
                ),
                source_url: nonempty(&track.url),
                fetch_method: lookup.fetch_method().to_string(),
                state: "available".to_string(),
                fetched_at: response.fetched_at.clone(),
                expires_at: response.expires_at.clone(),
            })
        })
        .collect::<Vec<_>>();
    let state = if tracks.is_empty() {
        "unavailable"
    } else {
        "available"
    };
    let message = if tracks.is_empty() {
        match lookup {
            ArtistTopTracksLookup::ArtistName(_) => ARTIST_NAME_EMPTY_MESSAGE.to_string(),
            ArtistTopTracksLookup::MusicBrainz(_) => {
                "Last.fm returned no popular tracks for this MusicBrainz artist ID.".to_string()
            }
        }
    } else {
        format!("Last.fm returned {} popular tracks.", tracks.len())
    };
    let status = LastFmArtistPopularityCacheRecord {
        artist_key: identity.artist_key.clone(),
        artist_name: identity.artist_name.clone(),
        musicbrainz_mbid: identity.musicbrainz_mbid.clone(),
        source_url,
        state: state.to_string(),
        message,
        fetched_at: response.fetched_at,
        expires_at: response.expires_at,
    };
    Ok((status, tracks, response.cacheable))
}

fn fetch_artist_top_tracks(
    api_key: &str,
    identity: &LastFmArtistIdentity,
) -> Result<(
    LastFmArtistPopularityCacheRecord,
    Vec<LastFmTrackPopularityCacheRecord>,
    bool,
)> {
    let mut empty_result = None;
    let mut last_error = None;
    for lookup in artist_top_tracks_lookups(identity) {
        match fetch_artist_top_tracks_once(api_key, identity, &lookup) {
            Ok(result) if !result.1.is_empty() => return Ok(result),
            Ok(result) => empty_result = Some(result),
            Err(error) => last_error = Some(error),
        }
    }
    if let Some(result) = empty_result {
        return Ok(result);
    }
    Err(last_error.unwrap_or_else(|| anyhow!("Last.fm artist lookup did not run.")))
}

fn artist_popularity_snapshot(
    app: &AppHandle,
    identity: &LastFmArtistIdentity,
    force_refresh: bool,
) -> Result<ArtistPopularitySnapshot> {
    let cached_status = db::lastfm_artist_popularity_cache_for_app(app, &identity.artist_key)?;
    let cached_tracks = db::lastfm_track_popularity_cache_for_app(app, &identity.artist_key)?;
    if !force_refresh && cached_status.as_ref().is_some_and(artist_cache_is_fresh) {
        return Ok(ArtistPopularitySnapshot {
            status: cached_status.expect("fresh Last.fm artist cache status"),
            tracks: cached_tracks,
            cached: true,
            stale: false,
        });
    }

    let refresh = stored_api_key()?
        .context("Last.fm metadata is not configured. Add the API key in Settings > Providers.")
        .and_then(|api_key| fetch_artist_top_tracks(api_key.as_str(), identity));
    match refresh {
        Ok((status, tracks, cacheable)) => {
            if cacheable {
                db::replace_lastfm_artist_top_tracks_for_app(app, &status, &tracks)?;
            }
            Ok(ArtistPopularitySnapshot {
                status,
                tracks,
                cached: false,
                stale: false,
            })
        }
        Err(error) => {
            let Some(mut status) = cached_status else {
                return Err(error);
            };
            status.message = format!("Using cached popularity because refresh failed: {error}");
            Ok(ArtistPopularitySnapshot {
                status,
                tracks: cached_tracks,
                cached: true,
                stale: true,
            })
        }
    }
}

fn popularity_snapshot_used_name_lookup(snapshot: &ArtistPopularitySnapshot) -> bool {
    snapshot.status.message == ARTIST_NAME_EMPTY_MESSAGE
        || snapshot.tracks.iter().any(|track| {
            track.artist_rank.is_some() && track.fetch_method == ARTIST_TOP_TRACKS_NAME_METHOD
        })
}

fn artist_name_popularity_snapshot(
    app: &AppHandle,
    identity: &LastFmArtistIdentity,
) -> Result<ArtistPopularitySnapshot> {
    let api_key = require_api_key()?;
    let lookup = ArtistTopTracksLookup::ArtistName(identity.artist_name.clone());
    let (status, tracks, cacheable) =
        fetch_artist_top_tracks_once(api_key.as_str(), identity, &lookup)?;
    if cacheable {
        db::replace_lastfm_artist_top_tracks_for_app(app, &status, &tracks)?;
    }
    Ok(ArtistPopularitySnapshot {
        status,
        tracks,
        cached: false,
        stale: false,
    })
}

fn matching_record<'a>(
    records: &'a [LastFmTrackPopularityCacheRecord],
    title: &str,
) -> Option<&'a LastFmTrackPopularityCacheRecord> {
    let exact = normalize_track_key(title);
    if let Some(record) = records.iter().find(|record| record.track_key == exact) {
        return Some(record);
    }
    let loose = loose_track_key(title);
    let mut matches = records
        .iter()
        .filter(|record| loose_track_key(&record.track_name) == loose);
    let first = matches.next()?;
    matches.next().is_none().then_some(first)
}

fn matching_local_track<'a>(
    tracks: &'a [LastFmLocalTrackCandidate],
    record: &LastFmTrackPopularityCacheRecord,
    used_track_ids: &HashSet<i64>,
) -> Option<&'a LastFmLocalTrackCandidate> {
    if let Some(track) = tracks.iter().find(|track| {
        !used_track_ids.contains(&track.track_id)
            && normalize_track_key(&track.title) == record.track_key
    }) {
        return Some(track);
    }
    let loose = loose_track_key(&record.track_name);
    tracks.iter().find(|track| {
        !used_track_ids.contains(&track.track_id) && loose_track_key(&track.title) == loose
    })
}

fn artist_popularity_response(
    identity: &LastFmArtistIdentity,
    local_tracks: &[LastFmLocalTrackCandidate],
    mut snapshot: ArtistPopularitySnapshot,
) -> LastFmArtistPopularity {
    snapshot
        .tracks
        .sort_by_key(|track| track.artist_rank.unwrap_or(i64::MAX));
    let mut used_track_ids = HashSet::new();
    let mut tracks = Vec::new();
    for record in snapshot
        .tracks
        .iter()
        .filter(|record| record.state == "available" && record.artist_rank.is_some())
    {
        let Some(local) = matching_local_track(local_tracks, record, &used_track_ids) else {
            continue;
        };
        used_track_ids.insert(local.track_id);
        tracks.push(LastFmPopularTrack {
            rank: record.artist_rank.unwrap_or(tracks.len() as i64 + 1),
            track_id: local.track_id,
            album_id: local.album_id.clone(),
            album: local.album.clone(),
            year: local.year,
            title: local.title.clone(),
            artist: local
                .display_artist
                .clone()
                .or_else(|| local.album_artist.clone())
                .unwrap_or_else(|| identity.artist_name.clone()),
            listeners: record.listeners.unwrap_or(0),
            play_count: record.play_count.unwrap_or(0),
            seconds: local.seconds,
            source_url: record.source_url.clone(),
        });
        if tracks.len() == POPULAR_TRACK_RESPONSE_LIMIT {
            break;
        }
    }
    let message = if tracks.is_empty() && snapshot.status.state == "available" {
        "Last.fm returned popular tracks, but none matched tracks in this library.".to_string()
    } else {
        snapshot.status.message.clone()
    };
    LastFmArtistPopularity {
        artist_id: identity.artist_key.clone(),
        artist_name: identity.artist_name.clone(),
        source_url: snapshot.status.source_url,
        fetched_at: Some(snapshot.status.fetched_at),
        cached: snapshot.cached,
        stale: snapshot.stale,
        tracks,
        message,
    }
}

pub fn artist_popularity(
    app: AppHandle,
    artist_id: String,
    force_refresh: bool,
) -> Result<LastFmArtistPopularity> {
    let gate = POPULARITY_GATE.get_or_init(|| Mutex::new(()));
    let _guard = gate.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let identity = db::lastfm_artist_identity_for_app(&app, artist_id.trim())?
        .with_context(|| format!("Could not find artist {artist_id} in the local library"))?;
    let snapshot = artist_popularity_snapshot(&app, &identity, force_refresh)?;
    let local_tracks = db::lastfm_local_tracks_for_artist_for_app(&app, &identity.artist_key)?;
    let response = artist_popularity_response(&identity, &local_tracks, snapshot.clone());
    if response.tracks.is_empty()
        && identity
            .musicbrainz_mbid
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
        && !popularity_snapshot_used_name_lookup(&snapshot)
    {
        if let Ok(name_snapshot) = artist_name_popularity_snapshot(&app, &identity) {
            return Ok(artist_popularity_response(
                &identity,
                &local_tracks,
                name_snapshot,
            ));
        }
    }
    Ok(response)
}

fn fetch_track_info(
    api_key: &str,
    identity: &LastFmArtistIdentity,
    local: &LastFmLocalTrackCandidate,
) -> Result<(LastFmTrackPopularityCacheRecord, bool)> {
    let artist_name = local
        .display_artist
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(&identity.artist_name);
    let mut url = Url::parse(LASTFM_API_BASE).context("Could not create the Last.fm API URL")?;
    url.query_pairs_mut()
        .append_pair("method", "track.getInfo")
        .append_pair("artist", artist_name)
        .append_pair("track", &local.title)
        .append_pair("api_key", api_key)
        .append_pair("autocorrect", "1")
        .append_pair("format", "json");
    let response = lastfm_json(&url, POPULARITY_CACHE_DAYS)?;
    if let Some((code, message)) = lastfm_error(&response.payload) {
        if code == 6 || code == 7 {
            let fetched_at = response.fetched_at;
            let expires_at = fetched_at
                .parse::<DateTime<Utc>>()
                .map(|date| date + ChronoDuration::days(UNAVAILABLE_CACHE_DAYS))
                .unwrap_or_else(|_| Utc::now() + ChronoDuration::days(UNAVAILABLE_CACHE_DAYS))
                .to_rfc3339();
            return Ok((
                LastFmTrackPopularityCacheRecord {
                    artist_key: identity.artist_key.clone(),
                    track_key: normalize_track_key(&local.title),
                    artist_name: artist_name.to_string(),
                    track_name: local.title.clone(),
                    musicbrainz_recording_mbid: None,
                    listeners: None,
                    play_count: None,
                    artist_rank: None,
                    source_url: None,
                    fetch_method: "track-info".to_string(),
                    state: "unavailable".to_string(),
                    fetched_at,
                    expires_at,
                },
                response.cacheable,
            ));
        }
        bail!("Last.fm error {code}: {message}")
    }
    let response = decode_lastfm_json::<LastFmTrackInfoPayload>(response)?;
    let track = response.payload.track;
    Ok((
        LastFmTrackPopularityCacheRecord {
            artist_key: identity.artist_key.clone(),
            track_key: normalize_track_key(&local.title),
            artist_name: artist_name.to_string(),
            track_name: nonempty(&track.name).unwrap_or_else(|| local.title.clone()),
            musicbrainz_recording_mbid: nonempty(&track.mbid),
            listeners: Some(parse_lastfm_count(&track.listeners)),
            play_count: Some(parse_lastfm_count(&track.playcount)),
            artist_rank: None,
            source_url: nonempty(&track.url),
            fetch_method: "track-info".to_string(),
            state: "available".to_string(),
            fetched_at: response.fetched_at,
            expires_at: response.expires_at,
        },
        response.cacheable,
    ))
}

fn merge_popularity_record(
    records: &mut Vec<LastFmTrackPopularityCacheRecord>,
    next: LastFmTrackPopularityCacheRecord,
) {
    if let Some(index) = records
        .iter()
        .position(|record| record.track_key == next.track_key)
    {
        let artist_rank = records[index].artist_rank;
        records[index] = next;
        if records[index].artist_rank.is_none() {
            records[index].artist_rank = artist_rank;
        }
    } else {
        records.push(next);
    }
}

fn album_popularity_response(
    identity: &LastFmArtistIdentity,
    album_id: &str,
    local_tracks: &[LastFmLocalTrackCandidate],
    records: &[LastFmTrackPopularityCacheRecord],
    source_url: Option<String>,
    provider_failed: bool,
) -> LastFmAlbumPopularity {
    let mut resolved_tracks = 0;
    let mut available_tracks = 0;
    let mut stale = provider_failed;
    let mut fetched_at: Option<String> = None;
    let mut ranked = Vec::new();
    for local in local_tracks {
        let Some(record) = matching_record(records, &local.title) else {
            continue;
        };
        resolved_tracks += 1;
        stale |= !cache_record_is_fresh(record);
        if fetched_at
            .as_ref()
            .is_none_or(|current| record.fetched_at > *current)
        {
            fetched_at = Some(record.fetched_at.clone());
        }
        if record.state == "available" {
            available_tracks += 1;
            ranked.push((
                local,
                record,
                record.listeners.unwrap_or(0),
                record.play_count.unwrap_or(0),
            ));
        }
    }
    let mut popularity_order = ranked
        .iter()
        .filter(|(_, _, listeners, _)| *listeners > 0)
        .map(|(local, _, listeners, play_count)| {
            (
                local.track_id,
                *listeners,
                *play_count,
                local.disc_number.unwrap_or(1),
                local.track_number.unwrap_or(i32::MAX),
            )
        })
        .collect::<Vec<_>>();
    popularity_order.sort_by_key(|(track_id, listeners, play_count, disc, track)| {
        (
            std::cmp::Reverse(*listeners),
            std::cmp::Reverse(*play_count),
            *disc,
            *track,
            *track_id,
        )
    });
    let album_ranks = popularity_order
        .into_iter()
        .take(3)
        .enumerate()
        .map(|(index, (track_id, ..))| (track_id, index as u8 + 1))
        .collect::<HashMap<_, _>>();
    let tracks = ranked
        .into_iter()
        .map(
            |(local, record, listeners, play_count)| LastFmAlbumTrackPopularity {
                track_id: local.track_id,
                title: local.title.clone(),
                listeners,
                play_count,
                album_rank: album_ranks.get(&local.track_id).copied(),
                source_url: record.source_url.clone(),
            },
        )
        .collect::<Vec<_>>();
    let total_tracks = local_tracks.len();
    let message = if provider_failed {
        format!(
            "Popularity resolved for {resolved_tracks} of {total_tracks} tracks before Last.fm became unavailable."
        )
    } else {
        format!("Popularity resolved for {resolved_tracks} of {total_tracks} tracks.")
    };
    LastFmAlbumPopularity {
        artist_id: identity.artist_key.clone(),
        album_id: album_id.to_string(),
        source_url,
        fetched_at,
        total_tracks,
        resolved_tracks,
        available_tracks,
        stale,
        tracks,
        message,
    }
}

pub fn album_popularity(
    app: AppHandle,
    artist_id: String,
    album_id: String,
) -> Result<LastFmAlbumPopularity> {
    let gate = POPULARITY_GATE.get_or_init(|| Mutex::new(()));
    let _guard = gate.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let identity = db::lastfm_artist_identity_for_app(&app, artist_id.trim())?
        .with_context(|| format!("Could not find artist {artist_id} in the local library"))?;
    let local_tracks = db::lastfm_local_tracks_for_album_for_app(&app, album_id.trim())?;
    if local_tracks.is_empty() {
        bail!("Could not find tracks for album {album_id} in the local library")
    }
    if local_tracks
        .iter()
        .any(|track| track.artist_key != identity.artist_key)
    {
        bail!("The selected album does not belong to the selected artist.")
    }

    let snapshot = artist_popularity_snapshot(&app, &identity, false)?;
    let source_url = snapshot.status.source_url.clone();
    let mut records = snapshot.tracks;
    let api_key = stored_api_key()?;
    let mut provider_failed = false;
    let mut checked_titles = HashSet::new();
    for local in &local_tracks {
        let title_key = normalize_track_key(&local.title);
        if !checked_titles.insert(title_key) {
            continue;
        }
        if matching_record(&records, &local.title).is_some_and(cache_record_is_fresh) {
            continue;
        }
        let Some(api_key) = api_key.as_ref() else {
            continue;
        };
        match fetch_track_info(api_key.as_str(), &identity, local) {
            Ok((record, cacheable)) => {
                if cacheable {
                    db::upsert_lastfm_track_popularity_for_app(&app, &record)?;
                }
                merge_popularity_record(&mut records, record);
            }
            Err(_) => {
                provider_failed = true;
                break;
            }
        }
    }
    Ok(album_popularity_response(
        &identity,
        album_id.trim(),
        &local_tracks,
        &records,
        source_url,
        provider_failed,
    ))
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

    #[test]
    fn normalizes_common_track_title_variants_for_cache_matching() {
        assert_eq!(
            normalize_track_key("  Sabotage\u{2014}Live  "),
            "sabotage-live"
        );
        assert_eq!(normalize_track_key("The New Style"), "the new style");
        assert_eq!(
            loose_track_key("Fight for Your Right!"),
            "fight for your right"
        );
    }

    #[test]
    fn treats_invalid_or_negative_provider_counts_as_zero() {
        assert_eq!(parse_lastfm_count("1,000"), 0);
        assert_eq!(parse_lastfm_count("-3"), 0);
        assert_eq!(parse_lastfm_count(" 42 "), 42);
    }

    #[test]
    fn retries_musicbrainz_artist_lookups_with_the_library_name() {
        let identity = LastFmArtistIdentity {
            artist_key: "kiss".to_string(),
            artist_name: "KISS".to_string(),
            musicbrainz_mbid: Some("e1f1e33e-2e4c-4d43-b91b-7064068d3283".to_string()),
        };
        let lookups = artist_top_tracks_lookups(&identity);
        assert_eq!(
            lookups,
            vec![
                ArtistTopTracksLookup::MusicBrainz(
                    "e1f1e33e-2e4c-4d43-b91b-7064068d3283".to_string()
                ),
                ArtistTopTracksLookup::ArtistName("KISS".to_string()),
            ]
        );

        let url = artist_top_tracks_url("test-key", &lookups[1]).unwrap();
        let query = url.query_pairs().collect::<HashMap<_, _>>();
        assert_eq!(
            query.get("artist").map(|value| value.as_ref()),
            Some("KISS")
        );
        assert_eq!(
            query.get("autocorrect").map(|value| value.as_ref()),
            Some("1")
        );
        assert!(!query.contains_key("mbid"));
    }

    #[test]
    fn artist_popularity_response_returns_up_to_ten_owned_tracks() {
        let identity = LastFmArtistIdentity {
            artist_key: "kiss".to_string(),
            artist_name: "KISS".to_string(),
            musicbrainz_mbid: None,
        };
        let local_tracks = (1..=12)
            .map(|rank| LastFmLocalTrackCandidate {
                track_id: rank,
                artist_key: identity.artist_key.clone(),
                album_id: "destroyer".to_string(),
                album: Some("Destroyer".to_string()),
                album_artist: Some("KISS".to_string()),
                display_artist: None,
                title: format!("Popular track {rank}"),
                year: Some(1976),
                seconds: Some(180 + rank),
                disc_number: Some(1),
                track_number: Some(rank as i32),
            })
            .collect::<Vec<_>>();
        let provider_tracks = local_tracks
            .iter()
            .map(|track| LastFmTrackPopularityCacheRecord {
                artist_key: identity.artist_key.clone(),
                track_key: normalize_track_key(&track.title),
                artist_name: "Kiss".to_string(),
                track_name: track.title.clone(),
                musicbrainz_recording_mbid: None,
                listeners: Some(100_000 - track.track_id),
                play_count: Some(200_000 - track.track_id),
                artist_rank: Some(track.track_id),
                source_url: None,
                fetch_method: ARTIST_TOP_TRACKS_NAME_METHOD.to_string(),
                state: "available".to_string(),
                fetched_at: "2026-08-11T12:00:00Z".to_string(),
                expires_at: "2026-08-18T12:00:00Z".to_string(),
            })
            .collect();
        let snapshot = ArtistPopularitySnapshot {
            status: LastFmArtistPopularityCacheRecord {
                artist_key: identity.artist_key.clone(),
                artist_name: identity.artist_name.clone(),
                musicbrainz_mbid: None,
                source_url: lastfm_artist_tracks_url("Kiss"),
                state: "available".to_string(),
                message: "Last.fm returned 12 popular tracks.".to_string(),
                fetched_at: "2026-08-11T12:00:00Z".to_string(),
                expires_at: "2026-08-18T12:00:00Z".to_string(),
            },
            tracks: provider_tracks,
            cached: false,
            stale: false,
        };

        let response = artist_popularity_response(&identity, &local_tracks, snapshot);
        assert_eq!(response.tracks.len(), POPULAR_TRACK_RESPONSE_LIMIT);
        assert_eq!(response.tracks.first().map(|track| track.rank), Some(1));
        assert_eq!(response.tracks.last().map(|track| track.rank), Some(10));
    }
}
