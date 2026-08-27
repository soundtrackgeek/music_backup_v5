use crate::db::{self, AlbumReviewCacheRecord, AlbumReviewIdentity};
use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Duration as ChronoDuration, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::cmp::Reverse;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::AppHandle;
use unicode_normalization::UnicodeNormalization;
use url::Url;

const MUSICBRAINZ_RELEASE_GROUP_API: &str = "https://musicbrainz.org/ws/2/release-group/";
const CRITIQUEBRAINZ_REVIEW_API: &str = "https://critiquebrainz.org/ws/1/review/";
const PROVIDER_USER_AGENT: &str =
    "music-backup-v5/0.144.7 (album reviews; https://github.com/soundtrackgeek/music_backup_v5)";
const REVIEW_CACHE_DAYS: i64 = 30;
const UNAVAILABLE_CACHE_DAYS: i64 = 7;

static REVIEW_REFRESH_GATE: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AlbumReview {
    pub album_id: String,
    pub album_artist: String,
    pub album_title: String,
    pub release_group_mbid: Option<String>,
    pub review_id: Option<String>,
    pub review: Option<String>,
    pub reviewer_name: Option<String>,
    pub rating: Option<i32>,
    pub language: Option<String>,
    pub review_source: Option<String>,
    pub source_url: Option<String>,
    pub license_id: Option<String>,
    pub license_name: Option<String>,
    pub license_url: Option<String>,
    pub fetched_at: Option<String>,
    pub cached: bool,
    pub stale: bool,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct MusicBrainzReleaseGroupSearchResponse {
    #[serde(rename = "release-groups", default)]
    release_groups: Vec<MusicBrainzReleaseGroupSearchResult>,
}

#[derive(Debug, Deserialize)]
struct MusicBrainzReleaseGroupSearchResult {
    id: String,
    title: String,
    #[serde(default)]
    score: u8,
    #[serde(rename = "first-release-date")]
    first_release_date: Option<String>,
    #[serde(rename = "primary-type")]
    primary_type: Option<String>,
    #[serde(rename = "secondary-types", default)]
    secondary_types: Vec<String>,
    #[serde(rename = "artist-credit", default)]
    artist_credit: Vec<MusicBrainzArtistCredit>,
}

#[derive(Debug, Deserialize)]
struct MusicBrainzArtistCredit {
    name: Option<String>,
    artist: MusicBrainzArtistCreditArtist,
}

#[derive(Debug, Deserialize)]
struct MusicBrainzArtistCreditArtist {
    id: String,
    name: String,
}

#[derive(Debug, Deserialize)]
struct CritiqueBrainzReviewResponse {
    #[serde(default)]
    reviews: Vec<CritiqueBrainzReview>,
}

#[derive(Debug, Deserialize)]
struct CritiqueBrainzReview {
    id: String,
    #[serde(default)]
    text: String,
    rating: Option<i32>,
    language: Option<String>,
    #[serde(default)]
    popularity: i64,
    source: Option<String>,
    user: Option<CritiqueBrainzUser>,
    license: Option<CritiqueBrainzLicense>,
    license_id: Option<String>,
    full_name: Option<String>,
    info_url: Option<String>,
    #[serde(default)]
    votes: Option<CritiqueBrainzVotes>,
    #[serde(default)]
    votes_positive_count: i64,
    #[serde(default)]
    votes_negative_count: i64,
}

#[derive(Debug, Deserialize)]
struct CritiqueBrainzUser {
    display_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CritiqueBrainzLicense {
    id: Option<String>,
    full_name: Option<String>,
    info_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CritiqueBrainzVotes {
    #[serde(default)]
    positive: i64,
    #[serde(default)]
    negative: i64,
}

#[derive(Debug)]
struct ResolvedReview {
    release_group_mbid: String,
    review_id: String,
    review_text: String,
    reviewer_name: Option<String>,
    rating: Option<i32>,
    language: Option<String>,
    review_source: Option<String>,
    source_url: String,
    license_id: Option<String>,
    license_name: Option<String>,
    license_url: Option<String>,
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(20))
        .build()
}

fn valid_uuid(value: &str) -> bool {
    value.len() == 36
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
            })
}

fn normalized_text(value: &str) -> String {
    value
        .nfkc()
        .flat_map(char::to_lowercase)
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

fn lucene_phrase(value: &str) -> String {
    value.trim().replace('\\', "\\\\").replace('"', "\\\"")
}

fn release_group_query(identity: &AlbumReviewIdentity) -> String {
    let title = lucene_phrase(&identity.album_title);
    if let Some(mbid) = identity
        .artist_mbid
        .as_deref()
        .filter(|value| valid_uuid(value))
    {
        format!("releasegroup:\"{title}\" AND arid:{mbid}")
    } else {
        let artist = lucene_phrase(&identity.album_artist);
        format!("releasegroup:\"{title}\" AND artist:\"{artist}\"")
    }
}

fn release_year(value: Option<&str>) -> Option<i32> {
    value?.get(0..4)?.parse().ok()
}

fn artist_credit_matches(
    candidate: &MusicBrainzReleaseGroupSearchResult,
    identity: &AlbumReviewIdentity,
) -> bool {
    if let Some(mbid) = identity
        .artist_mbid
        .as_deref()
        .filter(|value| valid_uuid(value))
    {
        return candidate
            .artist_credit
            .iter()
            .any(|credit| credit.artist.id.eq_ignore_ascii_case(mbid));
    }
    let artist = normalized_text(&identity.album_artist);
    candidate.artist_credit.iter().any(|credit| {
        normalized_text(&credit.artist.name) == artist
            || credit
                .name
                .as_deref()
                .is_some_and(|name| normalized_text(name) == artist)
    })
}

fn best_release_group(
    response: &MusicBrainzReleaseGroupSearchResponse,
    identity: &AlbumReviewIdentity,
) -> Option<String> {
    let title = normalized_text(&identity.album_title);
    let mut candidates = response
        .release_groups
        .iter()
        .filter(|candidate| {
            valid_uuid(&candidate.id)
                && candidate.score >= 95
                && normalized_text(&candidate.title) == title
                && artist_credit_matches(candidate, identity)
        })
        .collect::<Vec<_>>();
    candidates.sort_by_key(|candidate| {
        (
            Reverse(
                identity.album_year.is_some()
                    && release_year(candidate.first_release_date.as_deref()) == identity.album_year,
            ),
            Reverse(
                candidate
                    .primary_type
                    .as_deref()
                    .is_some_and(|value| value.eq_ignore_ascii_case("album")),
            ),
            Reverse(candidate.secondary_types.is_empty()),
            Reverse(candidate.score),
            candidate.id.as_str(),
        )
    });
    candidates.first().map(|candidate| candidate.id.clone())
}

fn fetch_release_group_mbid(identity: &AlbumReviewIdentity) -> Result<Option<String>> {
    if let Some(mbid) = identity
        .release_group_mbid
        .as_deref()
        .filter(|value| valid_uuid(value))
    {
        return Ok(Some(mbid.to_ascii_lowercase()));
    }
    let mut url = Url::parse(MUSICBRAINZ_RELEASE_GROUP_API)?;
    url.query_pairs_mut()
        .append_pair("query", &release_group_query(identity))
        .append_pair("limit", "10")
        .append_pair("fmt", "json");

    crate::musicbrainz::wait_for_musicbrainz_request_slot();
    let response = agent()
        .get(url.as_str())
        .set("User-Agent", PROVIDER_USER_AGENT)
        .call()
        .context("Could not search MusicBrainz for the album")?;
    let payload = response
        .into_json::<MusicBrainzReleaseGroupSearchResponse>()
        .context("Could not parse the MusicBrainz album search")?;
    Ok(best_release_group(&payload, identity))
}

fn review_vote_score(review: &CritiqueBrainzReview) -> i64 {
    review
        .votes
        .as_ref()
        .map(|votes| votes.positive - votes.negative)
        .unwrap_or(review.votes_positive_count - review.votes_negative_count)
}

fn language_priority(language: Option<&str>) -> u8 {
    match language.map(str::to_ascii_lowercase).as_deref() {
        Some("en") => 0,
        Some("no" | "nb" | "nn") => 1,
        None | Some("") => 2,
        Some(_) => 3,
    }
}

fn best_review(reviews: &[CritiqueBrainzReview]) -> Option<&CritiqueBrainzReview> {
    let mut candidates = reviews
        .iter()
        .filter(|review| valid_uuid(&review.id) && !review.text.trim().is_empty())
        .collect::<Vec<_>>();
    candidates.sort_by_key(|review| {
        (
            language_priority(review.language.as_deref()),
            Reverse(review.popularity),
            Reverse(review_vote_score(review)),
            Reverse(review.text.chars().count()),
            review.id.as_str(),
        )
    });
    candidates.first().copied()
}

fn trusted_license_url(value: &str) -> bool {
    Url::parse(value).is_ok_and(|url| {
        url.scheme() == "https"
            && url.host_str().is_some_and(|host| {
                host.eq_ignore_ascii_case("creativecommons.org")
                    || host.eq_ignore_ascii_case("www.creativecommons.org")
            })
            && url.path().starts_with("/licenses/")
    })
}

fn clean_optional(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn review_source_url(review_id: &str) -> Result<String> {
    if !valid_uuid(review_id) {
        return Err(anyhow!("CritiqueBrainz returned an invalid review ID"));
    }
    Ok(format!("https://critiquebrainz.org/review/{review_id}"))
}

fn resolved_review(
    release_group_mbid: &str,
    review: &CritiqueBrainzReview,
) -> Result<ResolvedReview> {
    let nested_license = review.license.as_ref();
    let license_id = clean_optional(
        review
            .license_id
            .as_deref()
            .or_else(|| nested_license.and_then(|license| license.id.as_deref())),
    );
    let license_name = clean_optional(
        review
            .full_name
            .as_deref()
            .or_else(|| nested_license.and_then(|license| license.full_name.as_deref())),
    );
    let license_url = clean_optional(
        review
            .info_url
            .as_deref()
            .or_else(|| nested_license.and_then(|license| license.info_url.as_deref())),
    )
    .filter(|value| trusted_license_url(value));

    Ok(ResolvedReview {
        release_group_mbid: release_group_mbid.to_string(),
        review_id: review.id.clone(),
        review_text: review.text.trim().to_string(),
        reviewer_name: review
            .user
            .as_ref()
            .and_then(|user| clean_optional(user.display_name.as_deref())),
        rating: review.rating.filter(|rating| (1..=5).contains(rating)),
        language: clean_optional(review.language.as_deref())
            .map(|value| value.to_ascii_lowercase()),
        review_source: clean_optional(review.source.as_deref()),
        source_url: review_source_url(&review.id)?,
        license_id,
        license_name,
        license_url,
    })
}

fn fetch_review(release_group_mbid: &str) -> Result<Option<ResolvedReview>> {
    let mut url = Url::parse(CRITIQUEBRAINZ_REVIEW_API)?;
    url.query_pairs_mut()
        .append_pair("entity_id", release_group_mbid)
        .append_pair("entity_type", "release_group")
        .append_pair("review_type", "review")
        .append_pair("sort", "popularity")
        .append_pair("sort_order", "desc")
        .append_pair("limit", "50");
    let response = agent()
        .get(url.as_str())
        .set("User-Agent", PROVIDER_USER_AGENT)
        .call()
        .context("Could not fetch CritiqueBrainz album reviews")?;
    let payload = response
        .into_json::<CritiqueBrainzReviewResponse>()
        .context("Could not parse the CritiqueBrainz album reviews")?;
    best_review(&payload.reviews)
        .map(|review| resolved_review(release_group_mbid, review))
        .transpose()
}

fn cache_matches_identity(record: &AlbumReviewCacheRecord, identity: &AlbumReviewIdentity) -> bool {
    record.album_artist == identity.album_artist
        && record.album_title == identity.album_title
        && record.album_year == identity.album_year
        && record.artist_mbid == identity.artist_mbid
        && identity
            .release_group_mbid
            .as_ref()
            .is_none_or(|mbid| record.release_group_mbid.as_ref() == Some(mbid))
}

fn cache_is_fresh(record: &AlbumReviewCacheRecord, identity: &AlbumReviewIdentity) -> bool {
    cache_matches_identity(record, identity)
        && DateTime::parse_from_rfc3339(&record.expires_at)
            .map(|value| value.with_timezone(&Utc) > Utc::now())
            .unwrap_or(false)
}

fn response_from_cache(
    identity: &AlbumReviewIdentity,
    record: &AlbumReviewCacheRecord,
    cached: bool,
    stale: bool,
    message: Option<String>,
) -> AlbumReview {
    AlbumReview {
        album_id: identity.album_id.clone(),
        album_artist: identity.album_artist.clone(),
        album_title: identity.album_title.clone(),
        release_group_mbid: record.release_group_mbid.clone(),
        review_id: record.review_id.clone(),
        review: record.review_text.clone(),
        reviewer_name: record.reviewer_name.clone(),
        rating: record.rating,
        language: record.language.clone(),
        review_source: record.review_source.clone(),
        source_url: record.source_url.clone(),
        license_id: record.license_id.clone(),
        license_name: record.license_name.clone(),
        license_url: record.license_url.clone(),
        fetched_at: Some(record.fetched_at.clone()),
        cached,
        stale,
        message: message.unwrap_or_else(|| record.message.clone()),
    }
}

fn unavailable_record(
    identity: &AlbumReviewIdentity,
    release_group_mbid: Option<String>,
    message: String,
) -> AlbumReviewCacheRecord {
    let fetched_at = Utc::now();
    AlbumReviewCacheRecord {
        album_id: identity.album_id.clone(),
        album_artist: identity.album_artist.clone(),
        album_title: identity.album_title.clone(),
        album_year: identity.album_year,
        artist_mbid: identity.artist_mbid.clone(),
        release_group_mbid,
        review_id: None,
        review_text: None,
        reviewer_name: None,
        rating: None,
        language: None,
        review_source: None,
        source_url: None,
        license_id: None,
        license_name: None,
        license_url: None,
        state: "unavailable".to_string(),
        message,
        fetched_at: fetched_at.to_rfc3339_opts(SecondsFormat::Secs, true),
        expires_at: (fetched_at + ChronoDuration::days(UNAVAILABLE_CACHE_DAYS))
            .to_rfc3339_opts(SecondsFormat::Secs, true),
    }
}

pub fn album_review(app: AppHandle, album_id: String, force_refresh: bool) -> Result<AlbumReview> {
    let identity = db::album_review_identity_for_app(&app, album_id.trim())?
        .ok_or_else(|| anyhow!("The selected album is no longer in the local library"))?;
    let cached = db::album_review_cache_for_app(&app, &identity.album_id)?;
    if !force_refresh {
        if let Some(record) = cached
            .as_ref()
            .filter(|record| cache_is_fresh(record, &identity))
        {
            return Ok(response_from_cache(&identity, record, true, false, None));
        }
    }

    let _refresh_guard = REVIEW_REFRESH_GATE
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let latest_cached = db::album_review_cache_for_app(&app, &identity.album_id)?;
    if !force_refresh {
        if let Some(record) = latest_cached
            .as_ref()
            .filter(|record| cache_is_fresh(record, &identity))
        {
            return Ok(response_from_cache(&identity, record, true, false, None));
        }
    }
    let fallback_cache = latest_cached.as_ref().or(cached.as_ref());

    let refresh_result = (|| -> Result<AlbumReviewCacheRecord> {
        let Some(release_group_mbid) = fetch_release_group_mbid(&identity)? else {
            return Ok(unavailable_record(
                &identity,
                None,
                "No exact MusicBrainz release group could be resolved for this album.".to_string(),
            ));
        };
        let Some(review) = fetch_review(&release_group_mbid)? else {
            return Ok(unavailable_record(
                &identity,
                Some(release_group_mbid),
                "No written CritiqueBrainz review is available for this album yet.".to_string(),
            ));
        };
        let fetched_at = Utc::now();
        Ok(AlbumReviewCacheRecord {
            album_id: identity.album_id.clone(),
            album_artist: identity.album_artist.clone(),
            album_title: identity.album_title.clone(),
            album_year: identity.album_year,
            artist_mbid: identity.artist_mbid.clone(),
            release_group_mbid: Some(review.release_group_mbid),
            review_id: Some(review.review_id),
            review_text: Some(review.review_text),
            reviewer_name: review.reviewer_name,
            rating: review.rating,
            language: review.language,
            review_source: review.review_source,
            source_url: Some(review.source_url),
            license_id: review.license_id,
            license_name: review.license_name,
            license_url: review.license_url,
            state: "available".to_string(),
            message: "Album review loaded from CritiqueBrainz.".to_string(),
            fetched_at: fetched_at.to_rfc3339_opts(SecondsFormat::Secs, true),
            expires_at: (fetched_at + ChronoDuration::days(REVIEW_CACHE_DAYS))
                .to_rfc3339_opts(SecondsFormat::Secs, true),
        })
    })();

    match refresh_result {
        Ok(record) => {
            db::upsert_album_review_for_app(&app, &record)?;
            Ok(response_from_cache(&identity, &record, false, false, None))
        }
        Err(error) => {
            if let Some(record) = fallback_cache.filter(|record| {
                record.state == "available"
                    && cache_matches_identity(record, &identity)
                    && record.review_text.is_some()
            }) {
                return Ok(response_from_cache(
                    &identity,
                    record,
                    true,
                    true,
                    Some(format!(
                        "Showing the cached album review because refresh failed: {error}"
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

    fn identity() -> AlbumReviewIdentity {
        AlbumReviewIdentity {
            album_id: "album-1".to_string(),
            album_artist: "Beastie Boys".to_string(),
            album_title: "Licensed to Ill".to_string(),
            album_year: Some(1986),
            artist_mbid: Some("9beb62b2-88db-4cea-801e-162cd344ee53".to_string()),
            release_group_mbid: None,
        }
    }

    #[test]
    fn builds_musicbrainz_query_from_linked_artist_identity() {
        assert_eq!(
            release_group_query(&identity()),
            "releasegroup:\"Licensed to Ill\" AND arid:9beb62b2-88db-4cea-801e-162cd344ee53"
        );
    }

    #[test]
    fn selects_exact_release_group_and_prefers_album_year() {
        let response = MusicBrainzReleaseGroupSearchResponse {
            release_groups: vec![
                MusicBrainzReleaseGroupSearchResult {
                    id: "11111111-1111-1111-1111-111111111111".to_string(),
                    title: "Licensed to Ill".to_string(),
                    score: 100,
                    first_release_date: Some("2000-01-01".to_string()),
                    primary_type: Some("Album".to_string()),
                    secondary_types: vec![],
                    artist_credit: vec![MusicBrainzArtistCredit {
                        name: Some("Beastie Boys".to_string()),
                        artist: MusicBrainzArtistCreditArtist {
                            id: "9beb62b2-88db-4cea-801e-162cd344ee53".to_string(),
                            name: "Beastie Boys".to_string(),
                        },
                    }],
                },
                MusicBrainzReleaseGroupSearchResult {
                    id: "57f5e7c8-2a6e-34a0-b4cd-0e77695bc36f".to_string(),
                    title: "Licensed to Ill".to_string(),
                    score: 100,
                    first_release_date: Some("1986-11-15".to_string()),
                    primary_type: Some("Album".to_string()),
                    secondary_types: vec![],
                    artist_credit: vec![MusicBrainzArtistCredit {
                        name: Some("Beastie Boys".to_string()),
                        artist: MusicBrainzArtistCreditArtist {
                            id: "9beb62b2-88db-4cea-801e-162cd344ee53".to_string(),
                            name: "Beastie Boys".to_string(),
                        },
                    }],
                },
            ],
        };

        assert_eq!(
            best_release_group(&response, &identity()).as_deref(),
            Some("57f5e7c8-2a6e-34a0-b4cd-0e77695bc36f")
        );
    }

    #[test]
    fn parses_current_critiquebrainz_license_shape() {
        let payload: CritiqueBrainzReviewResponse = serde_json::from_str(
            r#"{
                "reviews": [{
                    "id": "58496ed0-35c4-46b0-b87a-986ce03ce19d",
                    "text": "A flawed classic that remains impossible to ignore.",
                    "rating": 5,
                    "language": "en",
                    "license_id": "CC BY-SA 3.0",
                    "full_name": "Creative Commons Attribution-ShareAlike 3.0 Unported",
                    "info_url": "https://creativecommons.org/licenses/by-sa/3.0/",
                    "user": { "display_name": "smcamp1234" }
                }]
            }"#,
        )
        .expect("parse review response");
        let review = resolved_review(
            "57f5e7c8-2a6e-34a0-b4cd-0e77695bc36f",
            best_review(&payload.reviews).expect("review"),
        )
        .expect("resolve review");

        assert_eq!(review.reviewer_name.as_deref(), Some("smcamp1234"));
        assert_eq!(review.rating, Some(5));
        assert_eq!(review.license_id.as_deref(), Some("CC BY-SA 3.0"));
        assert_eq!(
            review.license_url.as_deref(),
            Some("https://creativecommons.org/licenses/by-sa/3.0/")
        );
    }

    #[test]
    fn chooses_english_review_before_other_languages() {
        let reviews = vec![
            CritiqueBrainzReview {
                id: "11111111-1111-1111-1111-111111111111".to_string(),
                text: "Una reseña suficientemente larga en español.".to_string(),
                rating: Some(5),
                language: Some("es".to_string()),
                popularity: 100,
                source: None,
                user: None,
                license: None,
                license_id: None,
                full_name: None,
                info_url: None,
                votes: None,
                votes_positive_count: 0,
                votes_negative_count: 0,
            },
            CritiqueBrainzReview {
                id: "22222222-2222-2222-2222-222222222222".to_string(),
                text: "An English review with enough substance to display.".to_string(),
                rating: Some(4),
                language: Some("en".to_string()),
                popularity: 0,
                source: None,
                user: None,
                license: None,
                license_id: None,
                full_name: None,
                info_url: None,
                votes: None,
                votes_positive_count: 0,
                votes_negative_count: 0,
            },
        ];

        assert_eq!(
            best_review(&reviews).map(|review| review.id.as_str()),
            Some("22222222-2222-2222-2222-222222222222")
        );
    }

    #[test]
    fn rejects_untrusted_license_links() {
        assert!(trusted_license_url(
            "https://creativecommons.org/licenses/by-sa/3.0/"
        ));
        assert!(!trusted_license_url(
            "https://example.com/licenses/by-sa/3.0/"
        ));
    }
}
