use crate::db::{self, ArtistBiographyCacheRecord, ArtistBiographyIdentity};
use anyhow::{anyhow, bail, Context, Result};
use chrono::{DateTime, Duration as ChronoDuration, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::AppHandle;
use unicode_normalization::UnicodeNormalization;
use url::Url;

const MUSICBRAINZ_ARTIST_API: &str = "https://musicbrainz.org/ws/2/artist/";
const WIKIDATA_ENTITY_API: &str = "https://www.wikidata.org/wiki/Special:EntityData/";
const PROVIDER_USER_AGENT: &str =
    "music-backup-v5/0.143.0 (artist biography; https://github.com/soundtrackgeek/music_backup_v5)";
const BIOGRAPHY_CACHE_DAYS: i64 = 30;
const UNAVAILABLE_CACHE_DAYS: i64 = 7;
const NAME_LOOKUP_UNAVAILABLE_MESSAGE: &str =
    "No English or Norwegian Wikipedia biography could be resolved through MusicBrainz or an exact artist-name match.";

static BIOGRAPHY_REFRESH_GATE: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArtistBiography {
    pub artist_id: String,
    pub artist_name: String,
    pub musicbrainz_mbid: Option<String>,
    pub wikidata_id: Option<String>,
    pub wikipedia_language: Option<String>,
    pub wikipedia_title: Option<String>,
    pub biography: Option<String>,
    pub source_url: Option<String>,
    pub fetched_at: Option<String>,
    pub cached: bool,
    pub stale: bool,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct MusicBrainzArtistRelations {
    #[serde(default)]
    relations: Vec<MusicBrainzUrlRelation>,
}

#[derive(Debug, Deserialize)]
struct MusicBrainzUrlRelation {
    #[serde(rename = "type", default)]
    relation_type: String,
    url: MusicBrainzRelationUrl,
}

#[derive(Debug, Deserialize)]
struct MusicBrainzRelationUrl {
    resource: String,
}

#[derive(Debug, Deserialize)]
struct MusicBrainzArtistSearchResponse {
    #[serde(default)]
    artists: Vec<MusicBrainzArtistSearchResult>,
}

#[derive(Debug, Deserialize)]
struct MusicBrainzArtistSearchResult {
    id: String,
    name: String,
    #[serde(default)]
    score: u8,
}

#[derive(Debug, Deserialize)]
struct WikidataEntityResponse {
    entities: HashMap<String, WikidataEntity>,
}

#[derive(Debug, Deserialize)]
struct WikidataEntity {
    #[serde(default)]
    sitelinks: HashMap<String, WikidataSitelink>,
}

#[derive(Debug, Deserialize)]
struct WikidataSitelink {
    title: String,
}

#[derive(Debug, Deserialize)]
struct WikipediaSummary {
    #[serde(rename = "type", default)]
    page_type: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    extract: String,
    content_urls: Option<WikipediaContentUrls>,
}

#[derive(Debug, Deserialize)]
struct WikipediaContentUrls {
    desktop: WikipediaDesktopUrl,
}

#[derive(Debug, Deserialize)]
struct WikipediaDesktopUrl {
    page: String,
}

#[derive(Debug, Clone, PartialEq)]
struct WikipediaTarget {
    language: String,
    title: String,
}

#[derive(Debug)]
struct ResolvedBiography {
    wikidata_id: Option<String>,
    target: WikipediaTarget,
    biography: String,
    source_url: String,
}

#[derive(Debug)]
struct BiographyResolution {
    biography: ResolvedBiography,
    used_name_fallback: bool,
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(20))
        .build()
}

fn valid_mbid(value: &str) -> bool {
    value.len() == 36
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
            })
}

fn valid_wikidata_id(value: &str) -> bool {
    value
        .strip_prefix('Q')
        .is_some_and(|digits| !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit()))
}

fn wikidata_id_from_url(resource: &str) -> Option<String> {
    let url = Url::parse(resource).ok()?;
    let host = url.host_str()?.to_ascii_lowercase();
    if host != "www.wikidata.org" && host != "wikidata.org" {
        return None;
    }
    url.path_segments()?
        .rev()
        .find(|segment| valid_wikidata_id(segment))
        .map(ToOwned::to_owned)
}

fn decode_url_path_segment(value: &str) -> String {
    url::form_urlencoded::parse(format!("value={value}").as_bytes())
        .next()
        .map(|(_, value)| value.into_owned())
        .unwrap_or_else(|| value.to_string())
}

fn wikipedia_target_from_url(resource: &str) -> Option<WikipediaTarget> {
    let url = Url::parse(resource).ok()?;
    let host = url.host_str()?.to_ascii_lowercase();
    let language = host.strip_suffix(".wikipedia.org")?;
    if language.is_empty()
        || language.len() > 12
        || !language
            .chars()
            .all(|character| character.is_ascii_lowercase() || character == '-')
    {
        return None;
    }
    let encoded_title = url.path().strip_prefix("/wiki/")?;
    if encoded_title.is_empty() {
        return None;
    }
    Some(WikipediaTarget {
        language: language.to_string(),
        title: decode_url_path_segment(encoded_title).replace('_', " "),
    })
}

fn relation_targets(
    payload: &MusicBrainzArtistRelations,
) -> (Option<String>, Option<WikipediaTarget>) {
    let mut wikidata_id = None;
    let mut wikipedia_target = None;
    for relation in &payload.relations {
        if wikidata_id.is_none() && relation.relation_type.eq_ignore_ascii_case("wikidata") {
            wikidata_id = wikidata_id_from_url(&relation.url.resource);
        }
        if wikipedia_target.is_none() && relation.relation_type.eq_ignore_ascii_case("wikipedia") {
            wikipedia_target = wikipedia_target_from_url(&relation.url.resource);
        }
    }
    (wikidata_id, wikipedia_target)
}

fn normalize_artist_name(value: &str) -> String {
    value
        .nfkc()
        .flat_map(char::to_lowercase)
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn musicbrainz_artist_name_query(artist_name: &str) -> String {
    let escaped = artist_name
        .trim()
        .replace('\\', "\\\\")
        .replace('"', "\\\"");
    format!("artist:\"{escaped}\"")
}

fn exact_musicbrainz_artist_mbid(
    response: &MusicBrainzArtistSearchResponse,
    artist_name: &str,
) -> Option<String> {
    let artist_key = normalize_artist_name(artist_name);
    let mut matches = response.artists.iter().filter(|artist| {
        artist.score == 100
            && valid_mbid(&artist.id)
            && normalize_artist_name(&artist.name) == artist_key
    });
    let first = matches.next()?;
    matches.next().is_none().then(|| first.id.clone())
}

fn fetch_musicbrainz_artist_mbid_by_name(artist_name: &str) -> Result<Option<String>> {
    let mut url = Url::parse(MUSICBRAINZ_ARTIST_API)?;
    url.query_pairs_mut()
        .append_pair("query", &musicbrainz_artist_name_query(artist_name))
        .append_pair("limit", "10")
        .append_pair("fmt", "json");

    crate::musicbrainz::wait_for_musicbrainz_request_slot();
    let response = agent()
        .get(url.as_str())
        .set("User-Agent", PROVIDER_USER_AGENT)
        .call()
        .context("Could not search MusicBrainz for the artist name")?;
    let payload = response
        .into_json::<MusicBrainzArtistSearchResponse>()
        .context("Could not parse the MusicBrainz artist-name search")?;
    Ok(exact_musicbrainz_artist_mbid(&payload, artist_name))
}

fn fetch_musicbrainz_targets(
    artist_mbid: &str,
) -> Result<(Option<String>, Option<WikipediaTarget>)> {
    if !valid_mbid(artist_mbid) {
        bail!("The linked MusicBrainz artist ID is invalid");
    }
    let mut url = Url::parse(MUSICBRAINZ_ARTIST_API)?;
    url.path_segments_mut()
        .map_err(|_| anyhow!("Could not build the MusicBrainz artist URL"))?
        .pop_if_empty()
        .push(artist_mbid);
    url.query_pairs_mut()
        .append_pair("inc", "url-rels")
        .append_pair("fmt", "json");

    crate::musicbrainz::wait_for_musicbrainz_request_slot();
    let response = agent()
        .get(url.as_str())
        .set("User-Agent", PROVIDER_USER_AGENT)
        .call()
        .context("Could not fetch the artist's MusicBrainz links")?;
    let payload = response
        .into_json::<MusicBrainzArtistRelations>()
        .context("Could not parse the artist's MusicBrainz links")?;
    Ok(relation_targets(&payload))
}

fn fetch_wikidata_target(wikidata_id: &str) -> Result<Option<WikipediaTarget>> {
    if !valid_wikidata_id(wikidata_id) {
        bail!("The linked Wikidata ID is invalid");
    }
    let url = format!("{WIKIDATA_ENTITY_API}{wikidata_id}.json?flavor=simple");
    let response = agent()
        .get(&url)
        .set("User-Agent", PROVIDER_USER_AGENT)
        .call()
        .context("Could not fetch the artist's Wikidata entity")?;
    let payload = response
        .into_json::<WikidataEntityResponse>()
        .context("Could not parse the artist's Wikidata entity")?;
    let Some(entity) = payload.entities.get(wikidata_id) else {
        return Ok(None);
    };
    for (site, language) in [("enwiki", "en"), ("nowiki", "no")] {
        if let Some(sitelink) = entity.sitelinks.get(site) {
            return Ok(Some(WikipediaTarget {
                language: language.to_string(),
                title: sitelink.title.clone(),
            }));
        }
    }
    Ok(None)
}

fn wikipedia_summary_url(target: &WikipediaTarget) -> Result<Url> {
    let mut url = Url::parse(&format!(
        "https://{}.wikipedia.org/api/rest_v1/page/summary/",
        target.language
    ))?;
    url.path_segments_mut()
        .map_err(|_| anyhow!("Could not build the Wikipedia summary URL"))?
        .pop_if_empty()
        .push(&target.title);
    Ok(url)
}

fn wikipedia_article_url(target: &WikipediaTarget, title: &str) -> Result<String> {
    let mut url = Url::parse(&format!("https://{}.wikipedia.org/wiki/", target.language))?;
    url.path_segments_mut()
        .map_err(|_| anyhow!("Could not build the Wikipedia article URL"))?
        .pop_if_empty()
        .push(title);
    Ok(url.to_string())
}

fn trusted_wikipedia_article_url(value: &str, language: &str) -> bool {
    Url::parse(value).is_ok_and(|url| {
        url.scheme() == "https"
            && url
                .host_str()
                .is_some_and(|host| host.eq_ignore_ascii_case(&format!("{language}.wikipedia.org")))
            && url.path().starts_with("/wiki/")
    })
}

fn fetch_wikipedia_summary(target: &WikipediaTarget) -> Result<Option<(String, String, String)>> {
    let url = wikipedia_summary_url(target)?;
    let response = match agent()
        .get(url.as_str())
        .set("User-Agent", PROVIDER_USER_AGENT)
        .call()
    {
        Ok(response) => response,
        Err(ureq::Error::Status(404, _)) => return Ok(None),
        Err(error) => return Err(error).context("Could not fetch the Wikipedia biography"),
    };
    let summary = response
        .into_json::<WikipediaSummary>()
        .context("Could not parse the Wikipedia biography")?;
    if summary.page_type.eq_ignore_ascii_case("disambiguation") {
        return Ok(None);
    }
    let biography = summary
        .extract
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if biography.is_empty() {
        return Ok(None);
    }
    let title = if summary.title.trim().is_empty() {
        target.title.clone()
    } else {
        summary.title
    };
    let source_url = summary
        .content_urls
        .map(|urls| urls.desktop.page)
        .filter(|value| trusted_wikipedia_article_url(value, &target.language))
        .map(Ok)
        .unwrap_or_else(|| wikipedia_article_url(target, &title))?;
    Ok(Some((title, biography, source_url)))
}

fn fetch_biography(artist_mbid: &str) -> Result<Option<ResolvedBiography>> {
    let (wikidata_id, direct_wikipedia) = fetch_musicbrainz_targets(artist_mbid)?;
    let wikidata_target = match wikidata_id.as_deref() {
        Some(id) => match fetch_wikidata_target(id) {
            Ok(target) => target,
            Err(_) if direct_wikipedia.is_some() => None,
            Err(error) => return Err(error),
        },
        None => None,
    };
    let Some(target) = wikidata_target.or(direct_wikipedia) else {
        return Ok(None);
    };
    let Some((title, biography, source_url)) = fetch_wikipedia_summary(&target)? else {
        return Ok(None);
    };
    Ok(Some(ResolvedBiography {
        wikidata_id,
        target: WikipediaTarget { title, ..target },
        biography,
        source_url,
    }))
}

fn fetch_biography_for_identity(
    identity: &ArtistBiographyIdentity,
) -> Result<Option<BiographyResolution>> {
    let linked_mbid = identity
        .musicbrainz_mbid
        .as_deref()
        .filter(|value| !value.trim().is_empty());
    let mut linked_error = None;
    if let Some(mbid) = linked_mbid {
        match fetch_biography(mbid) {
            Ok(Some(biography)) => {
                return Ok(Some(BiographyResolution {
                    biography,
                    used_name_fallback: false,
                }));
            }
            Ok(None) => {}
            Err(error) => linked_error = Some(error),
        }
    }

    let name_mbid = match fetch_musicbrainz_artist_mbid_by_name(&identity.artist_name) {
        Ok(mbid) => mbid,
        Err(error) => {
            return match linked_error {
                Some(linked) => {
                    Err(error.context(format!("The linked artist lookup also failed: {linked}")))
                }
                None => Err(error),
            };
        }
    };
    let Some(name_mbid) = name_mbid else {
        return linked_error.map(Err).unwrap_or(Ok(None));
    };
    if linked_mbid == Some(name_mbid.as_str()) {
        return linked_error.map(Err).unwrap_or(Ok(None));
    }

    match fetch_biography(&name_mbid) {
        Ok(Some(biography)) => Ok(Some(BiographyResolution {
            biography,
            used_name_fallback: true,
        })),
        Ok(None) => linked_error.map(Err).unwrap_or(Ok(None)),
        Err(error) => match linked_error {
            Some(linked) => {
                Err(error.context(format!("The linked artist lookup also failed: {linked}")))
            }
            None => Err(error),
        },
    }
}

fn cache_is_fresh(record: &ArtistBiographyCacheRecord, identity: &ArtistBiographyIdentity) -> bool {
    record.musicbrainz_mbid == identity.musicbrainz_mbid
        && (record.state != "unavailable" || record.message == NAME_LOOKUP_UNAVAILABLE_MESSAGE)
        && DateTime::parse_from_rfc3339(&record.expires_at)
            .map(|value| value.with_timezone(&Utc) > Utc::now())
            .unwrap_or(false)
}

fn response_from_cache(
    identity: &ArtistBiographyIdentity,
    record: &ArtistBiographyCacheRecord,
    cached: bool,
    stale: bool,
    message: Option<String>,
) -> ArtistBiography {
    ArtistBiography {
        artist_id: identity.artist_key.clone(),
        artist_name: identity.artist_name.clone(),
        musicbrainz_mbid: identity.musicbrainz_mbid.clone(),
        wikidata_id: record.wikidata_id.clone(),
        wikipedia_language: record.wikipedia_language.clone(),
        wikipedia_title: record.wikipedia_title.clone(),
        biography: record.biography_text.clone(),
        source_url: record.source_url.clone(),
        fetched_at: Some(record.fetched_at.clone()),
        cached,
        stale,
        message: message.unwrap_or_else(|| record.message.clone()),
    }
}

fn unavailable_record(
    identity: &ArtistBiographyIdentity,
    message: String,
) -> ArtistBiographyCacheRecord {
    let fetched_at = Utc::now();
    ArtistBiographyCacheRecord {
        artist_key: identity.artist_key.clone(),
        artist_name: identity.artist_name.clone(),
        musicbrainz_mbid: identity.musicbrainz_mbid.clone(),
        wikidata_id: None,
        wikipedia_language: None,
        wikipedia_title: None,
        biography_text: None,
        source_url: None,
        state: "unavailable".to_string(),
        message,
        fetched_at: fetched_at.to_rfc3339_opts(SecondsFormat::Secs, true),
        expires_at: (fetched_at + ChronoDuration::days(UNAVAILABLE_CACHE_DAYS))
            .to_rfc3339_opts(SecondsFormat::Secs, true),
    }
}

pub fn artist_biography(
    app: AppHandle,
    artist_id: String,
    force_refresh: bool,
) -> Result<ArtistBiography> {
    let identity = db::artist_biography_identity_for_app(&app, artist_id.trim())?
        .ok_or_else(|| anyhow!("The selected artist is no longer in the local library"))?;
    let cached = db::artist_biography_cache_for_app(&app, &identity.artist_key)?;
    if !force_refresh {
        if let Some(record) = cached
            .as_ref()
            .filter(|record| cache_is_fresh(record, &identity))
        {
            return Ok(response_from_cache(&identity, record, true, false, None));
        }
    }

    let _refresh_guard = BIOGRAPHY_REFRESH_GATE
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    let latest_cached = db::artist_biography_cache_for_app(&app, &identity.artist_key)?;
    if !force_refresh {
        if let Some(record) = latest_cached
            .as_ref()
            .filter(|record| cache_is_fresh(record, &identity))
        {
            return Ok(response_from_cache(&identity, record, true, false, None));
        }
    }
    let fallback_cache = latest_cached.as_ref().or(cached.as_ref());

    match fetch_biography_for_identity(&identity) {
        Ok(Some(resolution)) => {
            let resolved = resolution.biography;
            let fetched_at = Utc::now();
            let record = ArtistBiographyCacheRecord {
                artist_key: identity.artist_key.clone(),
                artist_name: identity.artist_name.clone(),
                musicbrainz_mbid: identity.musicbrainz_mbid.clone(),
                wikidata_id: resolved.wikidata_id,
                wikipedia_language: Some(resolved.target.language),
                wikipedia_title: Some(resolved.target.title),
                biography_text: Some(resolved.biography),
                source_url: Some(resolved.source_url),
                state: "available".to_string(),
                message: if resolution.used_name_fallback {
                    "Biography loaded from Wikipedia after an exact MusicBrainz artist-name match."
                        .to_string()
                } else {
                    "Biography loaded from Wikipedia.".to_string()
                },
                fetched_at: fetched_at.to_rfc3339_opts(SecondsFormat::Secs, true),
                expires_at: (fetched_at + ChronoDuration::days(BIOGRAPHY_CACHE_DAYS))
                    .to_rfc3339_opts(SecondsFormat::Secs, true),
            };
            db::upsert_artist_biography_for_app(&app, &record)?;
            Ok(response_from_cache(&identity, &record, false, false, None))
        }
        Ok(None) => {
            let record = unavailable_record(&identity, NAME_LOOKUP_UNAVAILABLE_MESSAGE.to_string());
            db::upsert_artist_biography_for_app(&app, &record)?;
            Ok(response_from_cache(&identity, &record, false, false, None))
        }
        Err(error) => {
            if let Some(record) = fallback_cache.filter(|record| {
                record.state == "available"
                    && record.musicbrainz_mbid == identity.musicbrainz_mbid
                    && record.biography_text.is_some()
            }) {
                return Ok(response_from_cache(
                    &identity,
                    record,
                    true,
                    true,
                    Some(format!(
                        "Showing the cached biography because refresh failed: {error}"
                    )),
                ));
            }
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_verified_provider_targets_from_musicbrainz_relations() {
        let payload = MusicBrainzArtistRelations {
            relations: vec![
                MusicBrainzUrlRelation {
                    relation_type: "wikidata".to_string(),
                    url: MusicBrainzRelationUrl {
                        resource: "https://www.wikidata.org/wiki/Q1299".to_string(),
                    },
                },
                MusicBrainzUrlRelation {
                    relation_type: "wikipedia".to_string(),
                    url: MusicBrainzRelationUrl {
                        resource: "https://en.wikipedia.org/wiki/The_Beatles".to_string(),
                    },
                },
            ],
        };

        assert_eq!(
            relation_targets(&payload),
            (
                Some("Q1299".to_string()),
                Some(WikipediaTarget {
                    language: "en".to_string(),
                    title: "The Beatles".to_string(),
                })
            )
        );
    }

    #[test]
    fn rejects_untrusted_wikipedia_and_wikidata_hosts() {
        assert_eq!(wikidata_id_from_url("https://example.com/wiki/Q1299"), None);
        assert_eq!(
            wikipedia_target_from_url("https://wikipedia.example/wiki/The_Beatles"),
            None
        );
        assert!(!trusted_wikipedia_article_url(
            "https://example.com/wiki/The_Beatles",
            "en"
        ));
    }

    #[test]
    fn builds_an_encoded_wikipedia_summary_url() {
        let url = wikipedia_summary_url(&WikipediaTarget {
            language: "en".to_string(),
            title: "AC/DC".to_string(),
        })
        .expect("build summary URL");

        assert_eq!(
            url.as_str(),
            "https://en.wikipedia.org/api/rest_v1/page/summary/AC%2FDC"
        );
    }

    #[test]
    fn selects_one_exact_case_insensitive_musicbrainz_artist_match() {
        let response = MusicBrainzArtistSearchResponse {
            artists: vec![
                MusicBrainzArtistSearchResult {
                    id: "e1f1e33e-2e4c-4d43-b91b-7064068d3283".to_string(),
                    name: "KISS".to_string(),
                    score: 100,
                },
                MusicBrainzArtistSearchResult {
                    id: "98b67ebc-5606-4cdb-9787-47b12cceb101".to_string(),
                    name: "KISS".to_string(),
                    score: 62,
                },
            ],
        };

        assert_eq!(
            exact_musicbrainz_artist_mbid(&response, "Kiss").as_deref(),
            Some("e1f1e33e-2e4c-4d43-b91b-7064068d3283")
        );
    }

    #[test]
    fn rejects_ambiguous_exact_musicbrainz_artist_matches() {
        let response = MusicBrainzArtistSearchResponse {
            artists: vec![
                MusicBrainzArtistSearchResult {
                    id: "e1f1e33e-2e4c-4d43-b91b-7064068d3283".to_string(),
                    name: "KISS".to_string(),
                    score: 100,
                },
                MusicBrainzArtistSearchResult {
                    id: "98b67ebc-5606-4cdb-9787-47b12cceb101".to_string(),
                    name: "Kiss".to_string(),
                    score: 100,
                },
            ],
        };

        assert_eq!(exact_musicbrainz_artist_mbid(&response, "KISS"), None);
        assert_eq!(
            musicbrainz_artist_name_query("KISS \"Alive\""),
            "artist:\"KISS \\\"Alive\\\"\""
        );
    }

    #[test]
    fn refreshes_legacy_unavailable_biography_cache_once_for_name_lookup() {
        let identity = ArtistBiographyIdentity {
            artist_key: "kiss".to_string(),
            artist_name: "KISS".to_string(),
            musicbrainz_mbid: None,
        };
        let mut record = unavailable_record(
            &identity,
            "Link this artist to MusicBrainz to find a biography.".to_string(),
        );
        assert!(!cache_is_fresh(&record, &identity));

        record.message = NAME_LOOKUP_UNAVAILABLE_MESSAGE.to_string();
        assert!(cache_is_fresh(&record, &identity));
    }
}
