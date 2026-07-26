use anyhow::{bail, Context, Result};
use chrono::Utc;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};
use zeroize::Zeroizing;

const KEYRING_SERVICE: &str = "com.local.musiclibrary.deemix";
const KEYRING_USER: &str = "arl";
const DEEZER_GATEWAY_URL: &str = "https://www.deezer.com/ajax/gw-light.php";
const DEEZER_ALBUM_SEARCH_URL: &str = "https://api.deezer.com/search/album";
const DEEMIX_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 MusicLibrary/0.81";
const MAX_SEARCH_LENGTH: usize = 300;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeemixCredentialStatus {
    pub configured: bool,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeemixConnectionTest {
    pub account_name: String,
    pub user_id: String,
    pub country: Option<String>,
    pub can_stream_hq: bool,
    pub can_stream_lossless: bool,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeemixAlbumSearchRequest {
    pub title: String,
    pub artist: String,
    pub year: Option<i32>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeemixAlbumMatch {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub year: Option<i32>,
    pub track_count: Option<u32>,
    pub record_type: Option<String>,
    pub explicit: bool,
    pub deezer_url: String,
    pub match_score: u8,
    pub match_level: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeemixAlbumSearchResponse {
    pub query: String,
    pub total: usize,
    pub matches: Vec<DeemixAlbumMatch>,
    pub searched_at: String,
}

fn credential_entry() -> Result<Entry> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .context("Could not open Windows Credential Manager for Deemix")
}

fn stored_arl() -> Result<Option<Zeroizing<String>>> {
    match credential_entry()?.get_password() {
        Ok(value) if !value.trim().is_empty() => Ok(Some(Zeroizing::new(value))),
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => {
            Err(error).context("Could not read the Deemix ARL from Windows Credential Manager")
        }
    }
}

fn require_stored_arl() -> Result<Zeroizing<String>> {
    stored_arl()?.context("No Deemix ARL is configured. Add it in Settings > Providers.")
}

pub(crate) fn stored_arl_for_download() -> Result<Zeroizing<String>> {
    require_stored_arl()
}

fn normalize_arl(value: String) -> Result<Zeroizing<String>> {
    let source = Zeroizing::new(value);
    let normalized = Zeroizing::new(
        source
            .chars()
            .filter(|character| !character.is_whitespace())
            .collect::<String>(),
    );
    if !(32..=512).contains(&normalized.len())
        || !normalized
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        bail!("Enter a valid Deezer ARL cookie value.")
    }
    Ok(normalized)
}

fn http_agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(30))
        .redirects(0)
        .build()
}

fn response_json(response: ureq::Response, context: &str) -> Result<Value> {
    response
        .into_json::<Value>()
        .with_context(|| format!("{context} returned an unreadable response"))
}

fn gateway_profile_with_arl(arl: &str) -> Result<DeemixConnectionTest> {
    let cookie = Zeroizing::new(format!("arl={arl}"));
    let response = http_agent()
        .post(DEEZER_GATEWAY_URL)
        .query("api_version", "1.0")
        .query("api_token", "null")
        .query("input", "3")
        .query("method", "deezer.getUserData")
        .set("Accept", "application/json")
        .set("Content-Type", "application/json")
        .set("Cookie", cookie.as_str())
        .set("User-Agent", DEEMIX_USER_AGENT)
        .send_json(json!({}))
        .map_err(|error| match error {
            ureq::Error::Status(status, _) => {
                anyhow::anyhow!("Deezer rejected the ARL validation request ({status}).")
            }
            ureq::Error::Transport(_) => {
                anyhow::anyhow!("Could not reach Deezer to validate the ARL.")
            }
        })?;
    let payload = response_json(response, "Deezer ARL validation")?;
    profile_from_gateway(&payload)
}

fn profile_from_gateway(payload: &Value) -> Result<DeemixConnectionTest> {
    if has_gateway_error(payload.get("error")) {
        bail!("Deezer rejected the ARL validation request.")
    }
    let user = payload
        .pointer("/results/USER")
        .context("Deezer did not return an account for this ARL.")?;
    let user_id = scalar_string(user.get("USER_ID")).unwrap_or_default();
    if user_id.is_empty() || user_id == "0" {
        bail!("The Deezer ARL is invalid or expired.")
    }
    let account_name = user
        .get("BLOG_NAME")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Deezer account")
        .chars()
        .take(200)
        .collect::<String>();
    let options = user.get("OPTIONS").unwrap_or(&Value::Null);
    let can_stream_hq =
        flexible_bool(options.get("web_hq")) || flexible_bool(options.get("mobile_hq"));
    let can_stream_lossless =
        flexible_bool(options.get("web_lossless")) || flexible_bool(options.get("mobile_lossless"));
    let country = options
        .get("license_country")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| value.len() == 2 && value.chars().all(|c| c.is_ascii_alphabetic()))
        .map(|value| value.to_ascii_uppercase());
    let quality = if can_stream_lossless {
        "Lossless streaming is available."
    } else if can_stream_hq {
        "High-quality streaming is available."
    } else {
        "The account connected, but high-quality streaming was not reported."
    };
    Ok(DeemixConnectionTest {
        account_name,
        user_id,
        country,
        can_stream_hq,
        can_stream_lossless,
        message: format!("Connected to Deezer. {quality}"),
    })
}

fn has_gateway_error(error: Option<&Value>) -> bool {
    match error {
        None | Some(Value::Null) => false,
        Some(Value::Array(values)) => !values.is_empty(),
        Some(Value::Object(values)) => !values.is_empty(),
        Some(Value::String(value)) => !value.trim().is_empty(),
        Some(_) => true,
    }
}

fn scalar_string(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn flexible_bool(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Bool(value)) => *value,
        Some(Value::Number(value)) => value.as_i64().is_some_and(|value| value != 0),
        Some(Value::String(value)) => matches!(value.as_str(), "1" | "true" | "TRUE"),
        _ => false,
    }
}

fn normalize_match_key(value: &str) -> String {
    let mut normalized = String::new();
    let mut pending_space = false;
    for character in value
        .replace('&', " and ")
        .nfkd()
        .filter(|character| !is_combining_mark(*character))
        .flat_map(char::to_lowercase)
    {
        if character.is_alphanumeric() {
            if pending_space && !normalized.is_empty() {
                normalized.push(' ');
            }
            normalized.push(character);
            pending_space = false;
        } else {
            pending_space = true;
        }
    }
    normalized
}

fn match_score(
    requested_title: &str,
    requested_artist: &str,
    requested_year: Option<i32>,
    title: &str,
    artist: &str,
    year: Option<i32>,
) -> (u8, String) {
    let requested_title = normalize_match_key(requested_title);
    let requested_artist = normalize_match_key(requested_artist);
    let title = normalize_match_key(title);
    let artist = normalize_match_key(artist);
    let title_exact = !requested_title.is_empty() && requested_title == title;
    let artist_exact = !requested_artist.is_empty() && requested_artist == artist;
    let mut score = 0u8;
    if title_exact {
        score = score.saturating_add(55);
    } else if !requested_title.is_empty()
        && !title.is_empty()
        && (title.contains(&requested_title) || requested_title.contains(&title))
    {
        score = score.saturating_add(30);
    }
    if artist_exact {
        score = score.saturating_add(30);
    } else if !requested_artist.is_empty()
        && !artist.is_empty()
        && (artist.contains(&requested_artist) || requested_artist.contains(&artist))
    {
        score = score.saturating_add(15);
    }
    if requested_year.is_some() && requested_year == year {
        score = score.saturating_add(15);
    }
    let level =
        if title_exact && artist_exact && requested_year.is_none_or(|value| year == Some(value)) {
            "exact"
        } else if title_exact && artist_exact {
            "likely"
        } else {
            "possible"
        };
    (score.min(100), level.to_string())
}

fn album_year(value: Option<&Value>) -> Option<i32> {
    let year = value?.as_str()?.get(0..4)?.parse::<i32>().ok()?;
    (1000..=3000).contains(&year).then_some(year)
}

fn parse_album_matches(
    payload: &Value,
    request: &DeemixAlbumSearchRequest,
    limit: usize,
) -> Result<(usize, Vec<DeemixAlbumMatch>)> {
    if has_gateway_error(payload.get("error")) {
        bail!("Deezer rejected the album search request.")
    }
    let data = payload
        .get("data")
        .and_then(Value::as_array)
        .context("Deezer returned an unreadable album search response")?;
    let total = payload
        .get("total")
        .and_then(Value::as_u64)
        .map(|value| value as usize)
        .unwrap_or(data.len());
    let mut matches = data
        .iter()
        .filter_map(|album| {
            let id = scalar_string(album.get("id"))?;
            if id.is_empty() || !id.chars().all(|character| character.is_ascii_digit()) {
                return None;
            }
            let title = album.get("title")?.as_str()?.trim().to_string();
            let artist = album.pointer("/artist/name")?.as_str()?.trim().to_string();
            if title.is_empty() || artist.is_empty() {
                return None;
            }
            let year = album_year(album.get("release_date"));
            let (match_score, match_level) = match_score(
                &request.title,
                &request.artist,
                request.year,
                &title,
                &artist,
                year,
            );
            Some(DeemixAlbumMatch {
                deezer_url: format!("https://www.deezer.com/album/{id}"),
                id,
                title,
                artist,
                year,
                track_count: album
                    .get("nb_tracks")
                    .and_then(Value::as_u64)
                    .and_then(|value| u32::try_from(value).ok()),
                record_type: album
                    .get("record_type")
                    .and_then(Value::as_str)
                    .map(|value| value.chars().take(80).collect()),
                explicit: flexible_bool(album.get("explicit_lyrics")),
                match_score,
                match_level,
            })
        })
        .collect::<Vec<_>>();
    matches.sort_by(|left, right| {
        right
            .match_score
            .cmp(&left.match_score)
            .then_with(|| left.title.cmp(&right.title))
            .then_with(|| left.id.cmp(&right.id))
    });
    matches.truncate(limit);
    Ok((total, matches))
}

fn validate_search_request(request: &mut DeemixAlbumSearchRequest) -> Result<usize> {
    request.title = request
        .title
        .trim()
        .chars()
        .take(MAX_SEARCH_LENGTH)
        .collect();
    request.artist = request
        .artist
        .trim()
        .chars()
        .take(MAX_SEARCH_LENGTH)
        .collect();
    if request.title.is_empty() || request.artist.is_empty() {
        bail!("A Deemix album search needs both an artist and album title.")
    }
    if let Some(year) = request.year {
        if !(1000..=3000).contains(&year) {
            bail!("The Deemix search year is outside the supported range.")
        }
    }
    Ok(request.limit.unwrap_or(8).clamp(1, 25))
}

pub fn credential_status() -> Result<DeemixCredentialStatus> {
    let configured = stored_arl()?.is_some();
    Ok(DeemixCredentialStatus {
        configured,
        source: if configured {
            "windowsCredentialManager".to_string()
        } else {
            "none".to_string()
        },
    })
}

pub fn save_arl(arl: String) -> Result<DeemixConnectionTest> {
    let arl = normalize_arl(arl)?;
    let profile = gateway_profile_with_arl(&arl)?;
    credential_entry()?
        .set_password(&arl)
        .context("Could not save the Deemix ARL in Windows Credential Manager")?;
    Ok(profile)
}

pub fn delete_arl() -> Result<DeemixCredentialStatus> {
    match credential_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => credential_status(),
        Err(error) => {
            Err(error).context("Could not remove the Deemix ARL from Windows Credential Manager")
        }
    }
}

pub fn test_connection() -> Result<DeemixConnectionTest> {
    let arl = require_stored_arl()?;
    gateway_profile_with_arl(&arl)
}

pub fn search_albums(mut request: DeemixAlbumSearchRequest) -> Result<DeemixAlbumSearchResponse> {
    let limit = validate_search_request(&mut request)?;
    let arl = require_stored_arl()?;
    gateway_profile_with_arl(&arl)?;
    let query = format!("{} {}", request.artist, request.title);
    let limit_text = limit.to_string();
    let response = http_agent()
        .get(DEEZER_ALBUM_SEARCH_URL)
        .query("q", &query)
        .query("index", "0")
        .query("limit", &limit_text)
        .set("Accept", "application/json")
        .set("User-Agent", DEEMIX_USER_AGENT)
        .call()
        .map_err(|error| match error {
            ureq::Error::Status(status, _) => {
                anyhow::anyhow!("Deezer rejected the album search request ({status}).")
            }
            ureq::Error::Transport(_) => {
                anyhow::anyhow!("Could not reach Deezer for the album search.")
            }
        })?;
    let payload = response_json(response, "Deezer album search")?;
    let (total, matches) = parse_album_matches(&payload, &request, limit)?;
    Ok(DeemixAlbumSearchResponse {
        query,
        total,
        matches,
        searched_at: Utc::now().to_rfc3339(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_and_validates_arl_values() {
        let arl = normalize_arl(format!("  {}\n", "aB".repeat(40))).expect("valid ARL");
        assert_eq!(arl.as_str(), "aB".repeat(40));
        assert!(normalize_arl("not-a-cookie".to_string()).is_err());
        assert!(normalize_arl("ab12".to_string()).is_err());
    }

    #[test]
    fn parses_connected_account_without_exposing_credentials() {
        let payload = json!({
            "error": [],
            "results": {
                "USER": {
                    "USER_ID": 12345,
                    "BLOG_NAME": "Paid account",
                    "OPTIONS": {
                        "web_hq": true,
                        "web_lossless": 1,
                        "license_country": "no"
                    }
                }
            }
        });
        let profile = profile_from_gateway(&payload).expect("profile");
        assert_eq!(profile.account_name, "Paid account");
        assert_eq!(profile.user_id, "12345");
        assert_eq!(profile.country.as_deref(), Some("NO"));
        assert!(profile.can_stream_hq);
        assert!(profile.can_stream_lossless);
    }

    #[test]
    fn rejects_an_expired_account_session() {
        let payload = json!({
            "error": [],
            "results": { "USER": { "USER_ID": 0 } }
        });
        assert!(profile_from_gateway(&payload).is_err());
    }

    #[test]
    fn ranks_exact_album_matches_first() {
        let request = DeemixAlbumSearchRequest {
            title: "Meantime".to_string(),
            artist: "Helmet".to_string(),
            year: Some(1992),
            limit: Some(8),
        };
        let payload = json!({
            "error": {},
            "total": 2,
            "data": [
                {
                    "id": 11,
                    "title": "Meantime (Live)",
                    "release_date": "2020-01-01",
                    "nb_tracks": 10,
                    "record_type": "album",
                    "artist": { "name": "Helmet" }
                },
                {
                    "id": 22,
                    "title": "Meantime",
                    "release_date": "1992-06-23",
                    "nb_tracks": 10,
                    "record_type": "album",
                    "explicit_lyrics": true,
                    "artist": { "name": "Helmet" }
                }
            ]
        });
        let (total, matches) = parse_album_matches(&payload, &request, 8).expect("matches");
        assert_eq!(total, 2);
        assert_eq!(matches[0].id, "22");
        assert_eq!(matches[0].match_level, "exact");
        assert_eq!(matches[0].match_score, 100);
        assert!(matches[0].explicit);
        assert_eq!(matches[0].deezer_url, "https://www.deezer.com/album/22");
    }
}
