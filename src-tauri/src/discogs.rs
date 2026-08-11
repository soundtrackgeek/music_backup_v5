use anyhow::{bail, Context, Result};
use keyring::Entry;
use serde::{de::Error as _, Deserialize, Deserializer, Serialize};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};
use url::Url;
use zeroize::{Zeroize, Zeroizing};

const KEYRING_SERVICE: &str = "com.local.musiclibrary.discogs";
const KEYRING_USER: &str = "consumer-credentials";
const DISCOGS_API_BASE: &str = "https://api.discogs.com";
const DISCOGS_USER_AGENT: &str = "music-backup-v5/0.119.0 (local desktop Discogs verifier)";
const REQUEST_INTERVAL: Duration = Duration::from_millis(1_200);
const MAX_CREDENTIAL_LENGTH: usize = 256;

static REQUEST_GATE: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiscogsCredentialStatus {
    pub configured: bool,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiscogsConnectionTest {
    pub authenticated: bool,
    pub rate_limit: Option<u32>,
    pub rate_limit_remaining: Option<u32>,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDiscogsCredentialsRequest {
    pub consumer_key: String,
    pub consumer_secret: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DiscogsCredentials {
    consumer_key: String,
    consumer_secret: String,
}

impl Zeroize for DiscogsCredentials {
    fn zeroize(&mut self) {
        self.consumer_key.zeroize();
        self.consumer_secret.zeroize();
    }
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct DiscogsAlbumVerification {
    pub outcome: String,
    pub message: String,
    pub master_id: Option<String>,
    pub discogs_url: Option<String>,
    pub matched_artist: Option<String>,
    pub matched_title: Option<String>,
    pub matched_year: Option<i32>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct DiscogsArtistVerification {
    pub outcome: String,
    pub message: String,
    pub master_id: Option<String>,
    pub discogs_url: Option<String>,
    pub studio_album_title: Option<String>,
    pub studio_album_count: usize,
}

#[derive(Debug, Deserialize)]
struct SearchPayload {
    #[serde(default)]
    results: Vec<SearchResult>,
}

#[derive(Debug, Deserialize)]
struct SearchResult {
    id: i64,
    title: String,
    #[serde(default, deserialize_with = "deserialize_optional_year")]
    year: Option<i32>,
    #[serde(default)]
    format: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct MasterPayload {
    id: i64,
    title: String,
    #[serde(default, deserialize_with = "deserialize_optional_year")]
    year: Option<i32>,
    #[serde(default)]
    artists: Vec<DiscogsArtist>,
    #[serde(default)]
    main_release: Option<i64>,
    #[serde(default)]
    images: Vec<DiscogsImage>,
}

#[derive(Debug, Deserialize)]
struct ReleasePayload {
    title: String,
    #[serde(default, deserialize_with = "deserialize_optional_year")]
    year: Option<i32>,
    #[serde(default)]
    status: String,
    #[serde(default)]
    artists: Vec<DiscogsArtist>,
    #[serde(default)]
    formats: Vec<DiscogsFormat>,
}

#[derive(Debug, Deserialize)]
struct DiscogsArtist {
    name: String,
}

#[derive(Debug, Deserialize)]
struct DiscogsFormat {
    name: String,
    #[serde(default)]
    descriptions: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct DiscogsImage {
    #[serde(rename = "type", default)]
    image_type: String,
    uri: String,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum DiscogsYear {
    Number(i32),
    Text(String),
}

fn deserialize_optional_year<'de, D>(deserializer: D) -> std::result::Result<Option<i32>, D::Error>
where
    D: Deserializer<'de>,
{
    match Option::<DiscogsYear>::deserialize(deserializer)? {
        None => Ok(None),
        Some(DiscogsYear::Number(year)) => Ok(Some(year)),
        Some(DiscogsYear::Text(year)) if year.trim().is_empty() => Ok(None),
        Some(DiscogsYear::Text(year)) => year
            .trim()
            .parse::<i32>()
            .map(Some)
            .map_err(D::Error::custom),
    }
}

struct DiscogsResponse<T> {
    payload: T,
    rate_limit: Option<u32>,
    rate_limit_remaining: Option<u32>,
}

fn credential_entry() -> Result<Entry> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .context("Could not open Windows Credential Manager for Discogs")
}

fn normalize_credential(value: String, label: &str) -> Result<String> {
    let value = value.trim().to_string();
    if !(8..=MAX_CREDENTIAL_LENGTH).contains(&value.len())
        || value.chars().any(char::is_whitespace)
        || value.chars().any(char::is_control)
    {
        bail!("Enter a valid Discogs {label}.")
    }
    Ok(value)
}

fn normalized_credentials(request: SaveDiscogsCredentialsRequest) -> Result<DiscogsCredentials> {
    Ok(DiscogsCredentials {
        consumer_key: normalize_credential(request.consumer_key, "consumer key")?,
        consumer_secret: normalize_credential(request.consumer_secret, "consumer secret")?,
    })
}

fn stored_credentials() -> Result<Option<Zeroizing<DiscogsCredentials>>> {
    let raw = match credential_entry()?.get_password() {
        Ok(value) if !value.trim().is_empty() => Zeroizing::new(value),
        Ok(_) | Err(keyring::Error::NoEntry) => return Ok(None),
        Err(error) => {
            return Err(error)
                .context("Could not read the Discogs credentials from Windows Credential Manager")
        }
    };
    let credentials = serde_json::from_str::<DiscogsCredentials>(&raw)
        .context("The stored Discogs credentials are unreadable; remove and add them again")?;
    Ok(Some(Zeroizing::new(credentials)))
}

fn require_stored_credentials() -> Result<Zeroizing<DiscogsCredentials>> {
    stored_credentials()?
        .context("Discogs fallback is not configured. Add the consumer key and secret in Settings > Providers.")
}

pub(crate) fn is_configured() -> Result<bool> {
    Ok(stored_credentials()?.is_some())
}

pub fn credential_status() -> Result<DiscogsCredentialStatus> {
    let configured = is_configured()?;
    Ok(DiscogsCredentialStatus {
        configured,
        source: if configured {
            "windowsCredentialManager".to_string()
        } else {
            "none".to_string()
        },
    })
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

fn api_url(path: &str, query: &[(&str, &str)]) -> Result<Url> {
    let mut url = Url::parse(DISCOGS_API_BASE)
        .context("Could not create the Discogs API URL")?
        .join(path)
        .context("Could not address the Discogs API endpoint")?;
    url.query_pairs_mut().extend_pairs(query.iter().copied());
    Ok(url)
}

fn get_json<T: for<'de> Deserialize<'de>>(
    credentials: &DiscogsCredentials,
    path: &str,
    query: &[(&str, &str)],
    context: &str,
) -> Result<DiscogsResponse<T>> {
    wait_for_request_slot();
    let url = api_url(path, query)?;
    let authorization = Zeroizing::new(format!(
        "Discogs key={}, secret={}",
        credentials.consumer_key, credentials.consumer_secret
    ));
    let response = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(30))
        .build()
        .get(url.as_str())
        .set("Accept", "application/json")
        .set("Authorization", authorization.as_str())
        .set("User-Agent", DISCOGS_USER_AGENT)
        .call()
        .map_err(|error| match error {
            ureq::Error::Status(401 | 403, _) => {
                anyhow::anyhow!("Discogs rejected the configured consumer key or secret.")
            }
            ureq::Error::Status(429, _) => anyhow::anyhow!(
                "Discogs rate limit reached. The album can be retried after the limit resets."
            ),
            ureq::Error::Status(status, _) => {
                anyhow::anyhow!("{context} failed with Discogs status {status}.")
            }
            ureq::Error::Transport(_) => {
                anyhow::anyhow!("Could not reach Discogs for {context}.")
            }
        })?;
    let rate_limit = response
        .header("X-Discogs-Ratelimit")
        .and_then(|value| value.parse().ok());
    let rate_limit_remaining = response
        .header("X-Discogs-Ratelimit-Remaining")
        .and_then(|value| value.parse().ok());
    let payload = response
        .into_json::<T>()
        .with_context(|| format!("{context} returned an unreadable Discogs response"))?;
    Ok(DiscogsResponse {
        payload,
        rate_limit,
        rate_limit_remaining,
    })
}

fn connection_test_with(credentials: &DiscogsCredentials) -> Result<DiscogsConnectionTest> {
    let response = get_json::<SearchPayload>(
        credentials,
        "/database/search",
        &[
            ("artist", "Massive Attack"),
            ("release_title", "Mezzanine"),
            ("type", "master"),
            ("per_page", "1"),
        ],
        "credential test",
    )?;
    Ok(DiscogsConnectionTest {
        authenticated: true,
        rate_limit: response.rate_limit,
        rate_limit_remaining: response.rate_limit_remaining,
        message: "Discogs credentials connected. Database fallback is ready.".to_string(),
    })
}

pub fn save_credentials(request: SaveDiscogsCredentialsRequest) -> Result<DiscogsConnectionTest> {
    let credentials = Zeroizing::new(normalized_credentials(request)?);
    let connection = connection_test_with(&credentials)?;
    let encoded = Zeroizing::new(
        serde_json::to_string(&*credentials)
            .context("Could not prepare the Discogs credentials for secure storage")?,
    );
    credential_entry()?
        .set_password(&encoded)
        .context("Could not save the Discogs credentials in Windows Credential Manager")?;
    Ok(connection)
}

pub fn delete_credentials() -> Result<DiscogsCredentialStatus> {
    match credential_entry()?.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => credential_status(),
        Err(error) => Err(error)
            .context("Could not remove the Discogs credentials from Windows Credential Manager"),
    }
}

pub fn test_connection() -> Result<DiscogsConnectionTest> {
    let credentials = require_stored_credentials()?;
    connection_test_with(&credentials)
}

fn normalize_key(value: &str) -> String {
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
            pending_space = !normalized.is_empty();
        }
    }
    normalized
}

fn strip_discogs_artist_suffix(value: &str) -> &str {
    let Some(open) = value.rfind(" (") else {
        return value;
    };
    let suffix = &value[open + 2..];
    if suffix.ends_with(')')
        && suffix[..suffix.len() - 1]
            .chars()
            .all(|c| c.is_ascii_digit())
    {
        value[..open].trim_end()
    } else {
        value
    }
}

fn joined_artist(artists: &[DiscogsArtist]) -> String {
    artists
        .iter()
        .map(|artist| strip_discogs_artist_suffix(&artist.name))
        .collect::<Vec<_>>()
        .join(" & ")
}

fn exact_search_result(result: &SearchResult, artist: &str, title: &str) -> bool {
    let Some((result_artist, result_title)) = result.title.split_once(" - ") else {
        return false;
    };
    normalize_key(strip_discogs_artist_suffix(result_artist)) == normalize_key(artist)
        && normalize_key(result_title) == normalize_key(title)
}

fn exact_artist_search_result(result: &SearchResult, artist: &str) -> bool {
    let Some((result_artist, _)) = result.title.split_once(" - ") else {
        return false;
    };
    normalize_key(strip_discogs_artist_suffix(result_artist)) == normalize_key(artist)
}

fn search_result_looks_like_studio_album(result: &SearchResult) -> bool {
    let labels = result
        .format
        .iter()
        .map(|value| normalize_key(value))
        .collect::<Vec<_>>();
    labels.iter().any(|label| label == "album")
        && ![
            "compilation",
            "live",
            "mixtape",
            "unofficial release",
            "bootleg",
            "dj mix",
            "single",
            "ep",
        ]
        .iter()
        .any(|marker| labels.iter().any(|label| label == marker))
}

fn album_classification(formats: &[DiscogsFormat], search_formats: &[String]) -> Result<()> {
    let labels = formats
        .iter()
        .flat_map(|format| {
            std::iter::once(format.name.as_str())
                .chain(format.descriptions.iter().map(String::as_str))
        })
        .chain(search_formats.iter().map(String::as_str))
        .map(normalize_key)
        .collect::<Vec<_>>();
    if !labels.iter().any(|label| label == "album") {
        bail!("Discogs did not classify the key release as an Album.")
    }
    let rejected = [
        "compilation",
        "live",
        "mixtape",
        "unofficial release",
        "bootleg",
        "dj mix",
        "single",
        "ep",
    ];
    if let Some(marker) = rejected
        .iter()
        .find(|marker| labels.iter().any(|label| label == **marker))
    {
        bail!("Discogs classifies the key release as {marker}, not a studio album.")
    }
    Ok(())
}

pub(crate) fn verify_album(
    artist: &str,
    title: &str,
    _chart_year: i32,
) -> Result<DiscogsAlbumVerification> {
    let credentials = require_stored_credentials()?;
    let search = get_json::<SearchPayload>(
        &credentials,
        "/database/search",
        &[
            ("artist", artist),
            ("release_title", title),
            ("type", "master"),
            ("per_page", "10"),
        ],
        "album search",
    )?;
    let mut exact = search
        .payload
        .results
        .into_iter()
        .filter(|result| exact_search_result(result, artist, title))
        .collect::<Vec<_>>();
    exact.sort_by_key(|result| result.id);
    exact.dedup_by_key(|result| result.id);
    if exact.is_empty() {
        return Ok(DiscogsAlbumVerification {
            outcome: "noMatch".to_string(),
            message: "Discogs returned no exact artist and master-title match.".to_string(),
            master_id: None,
            discogs_url: None,
            matched_artist: None,
            matched_title: None,
            matched_year: None,
        });
    }
    if exact.len() > 1 {
        return Ok(DiscogsAlbumVerification {
            outcome: "ambiguous".to_string(),
            message: format!(
                "Discogs returned {} exact master matches; manual review is required.",
                exact.len()
            ),
            master_id: None,
            discogs_url: None,
            matched_artist: None,
            matched_title: None,
            matched_year: None,
        });
    }

    let search_result = exact.pop().expect("one exact Discogs master");
    let master = get_json::<MasterPayload>(
        &credentials,
        &format!("/masters/{}", search_result.id),
        &[],
        "master lookup",
    )?
    .payload;
    let master_artist = joined_artist(&master.artists);
    if normalize_key(&master_artist) != normalize_key(artist)
        || normalize_key(&master.title) != normalize_key(title)
    {
        return Ok(DiscogsAlbumVerification {
            outcome: "ambiguous".to_string(),
            message: "Discogs returned a master whose canonical artist or title differs from the chart candidate.".to_string(),
            master_id: Some(master.id.to_string()),
            discogs_url: Some(format!("https://www.discogs.com/master/{}", master.id)),
            matched_artist: Some(master_artist),
            matched_title: Some(master.title),
            matched_year: master.year,
        });
    }
    let main_release = master
        .main_release
        .context("The exact Discogs master has no key release to classify")?;
    let release = get_json::<ReleasePayload>(
        &credentials,
        &format!("/releases/{main_release}"),
        &[],
        "key release lookup",
    )?
    .payload;
    let release_artist = joined_artist(&release.artists);
    if normalize_key(&release_artist) != normalize_key(artist)
        || normalize_key(&release.title) != normalize_key(title)
    {
        return Ok(DiscogsAlbumVerification {
            outcome: "ambiguous".to_string(),
            message: "The Discogs key release does not preserve the exact artist and album title."
                .to_string(),
            master_id: Some(master.id.to_string()),
            discogs_url: Some(format!("https://www.discogs.com/master/{}", master.id)),
            matched_artist: Some(release_artist),
            matched_title: Some(release.title),
            matched_year: release.year.or(master.year),
        });
    }
    if !release.status.eq_ignore_ascii_case("accepted") {
        return Ok(DiscogsAlbumVerification {
            outcome: "noMatch".to_string(),
            message: "The Discogs key release is not accepted in the database.".to_string(),
            master_id: Some(master.id.to_string()),
            discogs_url: Some(format!("https://www.discogs.com/master/{}", master.id)),
            matched_artist: Some(release_artist),
            matched_title: Some(release.title),
            matched_year: release.year.or(master.year),
        });
    }
    if let Err(error) = album_classification(&release.formats, &search_result.format) {
        return Ok(DiscogsAlbumVerification {
            outcome: "noMatch".to_string(),
            message: error.to_string(),
            master_id: Some(master.id.to_string()),
            discogs_url: Some(format!("https://www.discogs.com/master/{}", master.id)),
            matched_artist: Some(release_artist),
            matched_title: Some(release.title),
            matched_year: release.year.or(master.year).or(search_result.year),
        });
    }

    Ok(DiscogsAlbumVerification {
        outcome: "verified".to_string(),
        message: "Discogs confirmed one exact master with an accepted key release classified Album and no live, compilation, EP, single, or unofficial markers.".to_string(),
        master_id: Some(master.id.to_string()),
        discogs_url: Some(format!("https://www.discogs.com/master/{}", master.id)),
        matched_artist: Some(release_artist),
        matched_title: Some(release.title),
        matched_year: release.year.or(master.year).or(search_result.year),
    })
}

pub(crate) fn verify_artist_has_studio_album(artist: &str) -> Result<DiscogsArtistVerification> {
    let credentials = require_stored_credentials()?;
    let search = get_json::<SearchPayload>(
        &credentials,
        "/database/search",
        &[
            ("artist", artist),
            ("type", "master"),
            ("format", "album"),
            ("per_page", "25"),
        ],
        "artist studio-album search",
    )?;
    let mut exact = search
        .payload
        .results
        .into_iter()
        .filter(|result| {
            exact_artist_search_result(result, artist)
                && search_result_looks_like_studio_album(result)
        })
        .collect::<Vec<_>>();
    exact.sort_by_key(|result| result.id);
    exact.dedup_by_key(|result| result.id);
    let studio_album_count = exact.len();
    if studio_album_count == 0 {
        return Ok(DiscogsArtistVerification {
            outcome: "noMatch".to_string(),
            message: "Discogs returned no exact accepted studio-album master for this artist."
                .to_string(),
            master_id: None,
            discogs_url: None,
            studio_album_title: None,
            studio_album_count: 0,
        });
    }

    for search_result in exact.into_iter().take(3) {
        let master = get_json::<MasterPayload>(
            &credentials,
            &format!("/masters/{}", search_result.id),
            &[],
            "artist master lookup",
        )?
        .payload;
        let master_artist = joined_artist(&master.artists);
        if normalize_key(&master_artist) != normalize_key(artist) {
            continue;
        }
        let Some(main_release) = master.main_release else {
            continue;
        };
        let release = get_json::<ReleasePayload>(
            &credentials,
            &format!("/releases/{main_release}"),
            &[],
            "artist key release lookup",
        )?
        .payload;
        let release_artist = joined_artist(&release.artists);
        if normalize_key(&release_artist) != normalize_key(artist)
            || normalize_key(&release.title) != normalize_key(&master.title)
            || !release.status.eq_ignore_ascii_case("accepted")
            || album_classification(&release.formats, &search_result.format).is_err()
        {
            continue;
        }
        return Ok(DiscogsArtistVerification {
            outcome: "verified".to_string(),
            message: format!(
                "Discogs corroborated this artist with the accepted studio-album master ‘{}’.",
                master.title
            ),
            master_id: Some(master.id.to_string()),
            discogs_url: Some(format!("https://www.discogs.com/master/{}", master.id)),
            studio_album_title: Some(master.title),
            studio_album_count,
        });
    }

    Ok(DiscogsArtistVerification {
        outcome: "noMatch".to_string(),
        message: "Discogs found album-shaped masters, but none of the first exact candidates had an accepted key release without live, compilation, EP, single, or unofficial markers.".to_string(),
        master_id: None,
        discogs_url: None,
        studio_album_title: None,
        studio_album_count,
    })
}

pub(crate) fn master_cover_url(master_id: &str) -> Result<Option<String>> {
    let master_id = master_id.trim();
    if master_id.is_empty()
        || !master_id
            .chars()
            .all(|character| character.is_ascii_digit())
    {
        bail!("The Discogs master identifier is invalid.")
    }
    let credentials = require_stored_credentials()?;
    let master = get_json::<MasterPayload>(
        &credentials,
        &format!("/masters/{master_id}"),
        &[],
        "cover master lookup",
    )?
    .payload;
    Ok(master
        .images
        .iter()
        .find(|image| image.image_type.eq_ignore_ascii_case("primary"))
        .or_else(|| master.images.first())
        .map(|image| image.uri.clone()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_discogs_artist_disambiguation_suffixes() {
        assert_eq!(strip_discogs_artist_suffix("Nirvana (2)"), "Nirvana");
        assert_eq!(strip_discogs_artist_suffix("blink-182"), "blink-182");
    }

    #[test]
    fn exact_search_match_normalizes_artist_and_title() {
        let result = SearchResult {
            id: 1,
            title: "R.E.M. - Automatic For The People".to_string(),
            year: Some(1992),
            format: vec!["Album".to_string()],
        };
        assert!(exact_search_result(
            &result,
            "R.E.M.",
            "Automatic for the People"
        ));
    }

    #[test]
    fn artist_search_requires_an_exact_artist_and_studio_album_markers() {
        let studio = SearchResult {
            id: 1,
            title: "R.E.M. - Murmur".to_string(),
            year: Some(1983),
            format: vec!["Vinyl".to_string(), "LP".to_string(), "Album".to_string()],
        };
        assert!(exact_artist_search_result(&studio, "R.E.M."));
        assert!(search_result_looks_like_studio_album(&studio));

        let live = SearchResult {
            id: 2,
            title: "R.E.M. - Live At The Olympia".to_string(),
            year: Some(2009),
            format: vec!["Album".to_string(), "Live".to_string()],
        };
        assert!(exact_artist_search_result(&live, "R.E.M."));
        assert!(!search_result_looks_like_studio_album(&live));
    }

    #[test]
    fn master_payload_prefers_primary_cover_images() {
        let master = serde_json::from_str::<MasterPayload>(
            r#"{
                "id": 23683,
                "title": "Mezzanine",
                "year": 1998,
                "artists": [{"name": "Massive Attack"}],
                "main_release": 6530,
                "images": [
                    {"type": "secondary", "uri": "https://i.discogs.com/back.jpeg"},
                    {"type": "primary", "uri": "https://i.discogs.com/front.jpeg"}
                ]
            }"#,
        )
        .expect("parse Discogs master response");

        let cover = master
            .images
            .iter()
            .find(|image| image.image_type.eq_ignore_ascii_case("primary"))
            .or_else(|| master.images.first())
            .map(|image| image.uri.as_str());
        assert_eq!(cover, Some("https://i.discogs.com/front.jpeg"));
    }

    #[test]
    fn classification_accepts_album_and_rejects_non_studio_markers() {
        let album = vec![DiscogsFormat {
            name: "Vinyl".to_string(),
            descriptions: vec!["LP".to_string(), "Album".to_string()],
        }];
        assert!(album_classification(&album, &[]).is_ok());

        let compilation = vec![DiscogsFormat {
            name: "CD".to_string(),
            descriptions: vec!["Album".to_string(), "Compilation".to_string()],
        }];
        assert!(album_classification(&compilation, &[]).is_err());
    }

    #[test]
    fn search_payload_accepts_discogs_string_years() {
        let payload = serde_json::from_str::<SearchPayload>(
            r#"{
                "results": [{
                    "id": 23683,
                    "title": "Massive Attack - Mezzanine",
                    "year": "1998",
                    "format": ["Vinyl", "LP", "Album"]
                }]
            }"#,
        )
        .expect("parse Discogs search response");

        assert_eq!(payload.results.len(), 1);
        assert_eq!(payload.results[0].year, Some(1998));
    }
}
