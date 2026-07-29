#[cfg(not(test))]
use crate::db;
use anyhow::{bail, Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
#[cfg(not(test))]
use std::{
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, Instant},
};
#[cfg(not(test))]
use tauri::AppHandle;
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};
#[cfg(not(test))]
use url::Url;

const MAX_TITLE_LENGTH: usize = 300;
const MAX_ARTIST_LENGTH: usize = 300;
const MAX_ARTIST_DISCOVERY_ALBUMS: usize = 100;
const MAX_MUSICBRAINZ_SEARCH_QUERY_LENGTH: usize = 200;
#[cfg(not(test))]
const MUSICBRAINZ_SEARCH_LIMIT: usize = 8;
#[cfg(not(test))]
const MUSICBRAINZ_USER_AGENT: &str = "music-backup-v5/0.98.1 (local desktop app)";
#[cfg(not(test))]
const MUSICBRAINZ_REQUEST_INTERVAL: Duration = Duration::from_millis(1_100);
#[cfg(not(test))]
static MUSICBRAINZ_LAST_REQUEST: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();

#[cfg(not(test))]
fn wait_for_musicbrainz_request_slot() {
    let mut last_request = MUSICBRAINZ_LAST_REQUEST
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(last_request_at) = *last_request {
        let elapsed = last_request_at.elapsed();
        if elapsed < MUSICBRAINZ_REQUEST_INTERVAL {
            thread::sleep(MUSICBRAINZ_REQUEST_INTERVAL - elapsed);
        }
    }
    *last_request = Some(Instant::now());
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddWishListItemRequest {
    pub entity: String,
    pub title: String,
    #[serde(default)]
    pub artist: String,
    pub year: Option<i32>,
    pub musicbrainz_id: Option<String>,
    pub musicbrainz_url: Option<String>,
    #[serde(default = "default_source")]
    pub source: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WishListItem {
    pub id: i64,
    pub entity: String,
    pub title: String,
    pub artist: String,
    pub year: Option<i32>,
    pub musicbrainz_id: Option<String>,
    pub musicbrainz_url: Option<String>,
    pub source: String,
    pub created_at: String,
    pub downloaded_deezer_album_id: Option<String>,
    pub downloaded_path: Option<String>,
    pub downloaded_at: Option<String>,
    pub artist_album_summary: Option<WishListArtistAlbumSummary>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WishListMissingAlbum {
    pub release_group_id: String,
    pub title: String,
    pub year: Option<i32>,
    pub musicbrainz_url: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WishListArtistAlbumSummary {
    pub official_album_count: usize,
    pub owned_album_count: usize,
    pub missing_album_count: usize,
    pub missing_albums: Vec<WishListMissingAlbum>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WishListResponse {
    pub items: Vec<WishListItem>,
    pub auto_removed_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WishListMusicBrainzSearchRequest {
    pub entity: String,
    pub query: String,
    #[serde(default)]
    pub artist: String,
    pub year: Option<i32>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WishListMusicBrainzCandidate {
    pub entity: String,
    pub title: String,
    pub artist: String,
    pub year: Option<i32>,
    pub musicbrainz_id: String,
    pub musicbrainz_url: String,
    pub disambiguation: Option<String>,
    pub country: Option<String>,
    pub score: i32,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WishListMusicBrainzSearchResponse {
    pub entity: String,
    pub query: String,
    pub candidates: Vec<WishListMusicBrainzCandidate>,
    pub searched_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddWishListMusicBrainzCandidateRequest {
    pub candidate: WishListMusicBrainzCandidate,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AddWishListMusicBrainzCandidateResponse {
    pub added: bool,
    pub item: Option<WishListItem>,
    pub message: String,
    pub artist_album_summary: Option<WishListArtistAlbumSummary>,
}

#[derive(Debug, Deserialize)]
struct MusicBrainzArtistSearchPayload {
    #[serde(default)]
    artists: Vec<MusicBrainzArtistSearchRow>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct MusicBrainzArtistSearchRow {
    id: String,
    name: String,
    #[serde(default)]
    score: i32,
    disambiguation: Option<String>,
    country: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct MusicBrainzReleaseGroupSearchPayload {
    #[serde(default)]
    release_groups: Vec<MusicBrainzReleaseGroupSearchRow>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct MusicBrainzReleaseGroupSearchRow {
    id: String,
    title: String,
    #[serde(default)]
    score: i32,
    first_release_date: Option<String>,
    primary_type: Option<String>,
    #[serde(default)]
    secondary_types: Vec<String>,
    disambiguation: Option<String>,
    #[serde(default)]
    artist_credit: Vec<MusicBrainzArtistCredit>,
    #[serde(default)]
    releases: Vec<MusicBrainzReleaseSummary>,
}

#[derive(Debug, Deserialize)]
struct MusicBrainzReleaseSummary {
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MusicBrainzArtistCredit {
    name: String,
    #[serde(default)]
    joinphrase: String,
}

fn musicbrainz_year(value: Option<&str>) -> Option<i32> {
    value?.trim().get(0..4)?.parse::<i32>().ok()
}

fn musicbrainz_artist_credit(credits: &[MusicBrainzArtistCredit]) -> String {
    credits.iter().fold(String::new(), |mut display, credit| {
        display.push_str(credit.name.trim());
        display.push_str(&credit.joinphrase);
        display
    })
}

fn artist_search_candidates(
    payload: MusicBrainzArtistSearchPayload,
) -> Vec<WishListMusicBrainzCandidate> {
    payload
        .artists
        .into_iter()
        .filter(|artist| !artist.id.trim().is_empty() && !artist.name.trim().is_empty())
        .map(|artist| WishListMusicBrainzCandidate {
            entity: "artist".to_string(),
            title: artist.name.trim().to_string(),
            artist: String::new(),
            year: None,
            musicbrainz_url: format!("https://musicbrainz.org/artist/{}", artist.id),
            musicbrainz_id: artist.id.to_lowercase(),
            disambiguation: artist
                .disambiguation
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
            country: artist
                .country
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
            score: artist.score,
        })
        .collect()
}

fn album_search_candidates(
    payload: MusicBrainzReleaseGroupSearchPayload,
) -> Vec<WishListMusicBrainzCandidate> {
    payload
        .release_groups
        .into_iter()
        .filter(|album| {
            album
                .primary_type
                .as_deref()
                .is_some_and(|value| value.eq_ignore_ascii_case("album"))
                && album.secondary_types.is_empty()
        })
        .filter_map(|album| {
            let artist = musicbrainz_artist_credit(&album.artist_credit);
            if album.id.trim().is_empty() || album.title.trim().is_empty() || artist.is_empty() {
                return None;
            }
            Some(WishListMusicBrainzCandidate {
                entity: "album".to_string(),
                title: album.title.trim().to_string(),
                artist,
                year: musicbrainz_year(album.first_release_date.as_deref()),
                musicbrainz_url: format!("https://musicbrainz.org/release-group/{}", album.id),
                musicbrainz_id: album.id.to_lowercase(),
                disambiguation: album
                    .disambiguation
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty()),
                country: None,
                score: album.score,
            })
        })
        .collect()
}

fn normalize_musicbrainz_search_request(
    mut request: WishListMusicBrainzSearchRequest,
) -> Result<WishListMusicBrainzSearchRequest> {
    request.entity = request.entity.trim().to_lowercase();
    if !matches!(request.entity.as_str(), "artist" | "album") {
        bail!("Choose whether to search MusicBrainz for an artist or album.")
    }
    request.query = request
        .query
        .trim()
        .chars()
        .take(MAX_MUSICBRAINZ_SEARCH_QUERY_LENGTH)
        .collect();
    if request.query.chars().count() < 2 {
        bail!("Enter at least two characters to search MusicBrainz.")
    }
    request.artist = request
        .artist
        .trim()
        .chars()
        .take(MAX_ARTIST_LENGTH)
        .collect();
    if request
        .year
        .is_some_and(|year| !(1000..=3000).contains(&year))
    {
        bail!("The MusicBrainz search year is outside the supported range.")
    }
    Ok(request)
}

#[cfg(not(test))]
fn musicbrainz_search_url(request: &WishListMusicBrainzSearchRequest) -> Result<Url> {
    let endpoint = if request.entity == "artist" {
        "https://musicbrainz.org/ws/2/artist"
    } else {
        "https://musicbrainz.org/ws/2/release-group"
    };
    let escaped_query = request.query.replace('\\', "\\\\").replace('"', "\\\"");
    let escaped_artist = request.artist.replace('\\', "\\\\").replace('"', "\\\"");
    let search_query = if request.entity == "artist" {
        format!("artist:\"{escaped_query}\"")
    } else if escaped_artist.is_empty() {
        format!("releasegroup:\"{escaped_query}\" AND primarytype:album")
    } else {
        format!(
            "releasegroup:\"{escaped_query}\" AND artist:\"{escaped_artist}\" AND primarytype:album"
        )
    };
    let mut url = Url::parse(endpoint).context("Could not create the MusicBrainz search URL")?;
    url.query_pairs_mut()
        .append_pair("query", &search_query)
        .append_pair("fmt", "json")
        .append_pair("limit", &MUSICBRAINZ_SEARCH_LIMIT.to_string());
    Ok(url)
}

#[cfg(not(test))]
pub fn search_musicbrainz_for_wishlist(
    request: WishListMusicBrainzSearchRequest,
) -> Result<WishListMusicBrainzSearchResponse> {
    let request = normalize_musicbrainz_search_request(request)?;
    let url = musicbrainz_search_url(&request)?;
    wait_for_musicbrainz_request_slot();
    let response = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .get(url.as_str())
        .set("User-Agent", MUSICBRAINZ_USER_AGENT)
        .call()
        .context("Could not search MusicBrainz for this Wish List item")?;
    let mut candidates = if request.entity == "artist" {
        artist_search_candidates(
            response
                .into_json::<MusicBrainzArtistSearchPayload>()
                .context("MusicBrainz returned an unreadable artist search response")?,
        )
    } else {
        album_search_candidates(
            response
                .into_json::<MusicBrainzReleaseGroupSearchPayload>()
                .context("MusicBrainz returned an unreadable album search response")?,
        )
    };
    if let Some(year) = request.year {
        candidates.sort_by(|left, right| {
            left.year
                .map(|candidate_year| (candidate_year - year).abs())
                .unwrap_or(i32::MAX)
                .cmp(
                    &right
                        .year
                        .map(|candidate_year| (candidate_year - year).abs())
                        .unwrap_or(i32::MAX),
                )
                .then_with(|| right.score.cmp(&left.score))
        });
    }
    Ok(WishListMusicBrainzSearchResponse {
        entity: request.entity,
        query: request.query,
        candidates,
        searched_at: Utc::now().to_rfc3339(),
    })
}

#[cfg(not(test))]
pub(crate) fn validate_musicbrainz_album_candidate(
    candidate: WishListMusicBrainzCandidate,
) -> Result<WishListMusicBrainzCandidate> {
    let validated_input = candidate_add_request(candidate.clone())?;
    if validated_input.entity != "album" {
        return Ok(candidate);
    }
    let musicbrainz_id = validated_input
        .musicbrainz_id
        .context("The selected MusicBrainz album has no identifier.")?;
    let mut url = Url::parse("https://musicbrainz.org/ws/2/release-group/")
        .context("Could not create the MusicBrainz album validation URL")?
        .join(&musicbrainz_id)
        .context("Could not address the selected MusicBrainz album")?;
    url.query_pairs_mut()
        .append_pair("inc", "artist-credits+releases")
        .append_pair("fmt", "json");
    wait_for_musicbrainz_request_slot();
    let response = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .get(url.as_str())
        .set("User-Agent", MUSICBRAINZ_USER_AGENT)
        .call()
        .context("MusicBrainz could not confirm that the selected album still exists")?;
    let row = response
        .into_json::<MusicBrainzReleaseGroupSearchRow>()
        .context("MusicBrainz returned an unreadable album validation response")?;
    if !row.secondary_types.is_empty() {
        bail!(
            "The selected MusicBrainz release group is classified as {} rather than a studio album.",
            row.secondary_types.join(", ")
        )
    }
    if !row.releases.iter().any(|release| {
        release
            .status
            .as_deref()
            .is_some_and(|status| status.eq_ignore_ascii_case("official"))
    }) {
        bail!("The selected MusicBrainz release group has no official release.")
    }
    let score = candidate.score;
    let mut confirmed = album_search_candidates(MusicBrainzReleaseGroupSearchPayload {
        release_groups: vec![row],
    });
    let mut confirmed = confirmed
        .pop()
        .context("The selected MusicBrainz release group is not an Album.")?;
    if confirmed.musicbrainz_id != musicbrainz_id {
        bail!("MusicBrainz returned a different album than the selected result.")
    }
    confirmed.score = score;
    Ok(confirmed)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WishListArtistAlbumDiscoveryRequest {
    pub wish_list_item_id: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WishListArtistAlbumDiscoveryRow {
    pub release_group_id: String,
    pub title: String,
    pub year: Option<i32>,
    pub secondary_types: Vec<String>,
    pub musicbrainz_url: String,
    pub deemix_matches: Vec<crate::deemix::DeemixAlbumMatch>,
    pub deemix_error: Option<String>,
    pub downloaded_deezer_album_id: Option<String>,
    pub downloaded_path: Option<String>,
    pub downloaded_at: Option<String>,
    pub in_library: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WishListArtistAlbumDiscoveryResponse {
    pub wish_list_item_id: i64,
    pub artist: String,
    pub musicbrainz_id: String,
    pub official_album_count: usize,
    pub searched_album_count: usize,
    pub matched_album_count: usize,
    pub truncated: bool,
    pub albums: Vec<WishListArtistAlbumDiscoveryRow>,
    pub album_summary: WishListArtistAlbumSummary,
    pub searched_at: String,
}

#[derive(Debug, Clone)]
struct DownloadReceiptSummary {
    deezer_album_id: String,
    destination_path: String,
    completed_at: String,
}

#[derive(Debug, Default)]
struct OwnedLibrary {
    album_ids: HashSet<String>,
    albums: HashSet<String>,
}

fn default_source() -> String {
    "MusicBrainz".to_string()
}

pub(crate) fn normalize_key(value: &str) -> String {
    let expanded = value.replace('&', " and ");
    let mut normalized = String::new();
    let mut pending_space = false;
    for character in expanded
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

fn album_key(artist: &str, title: &str) -> String {
    format!("{}\u{1f}{}", normalize_key(artist), normalize_key(title))
}

fn table_exists(conn: &Connection, table: &str) -> Result<bool> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1",
            params![table],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

fn load_owned_library(conn: &Connection) -> Result<OwnedLibrary> {
    let mut owned = OwnedLibrary::default();
    let mut album_statement = conn.prepare(
        "SELECT album_artist_display, album FROM albums WHERE TRIM(COALESCE(album, '')) <> ''",
    )?;
    let albums = album_statement.query_map([], |row| {
        Ok((
            row.get::<_, Option<String>>(0)?.unwrap_or_default(),
            row.get::<_, Option<String>>(1)?.unwrap_or_default(),
        ))
    })?;
    for album in albums {
        let (artist, title) = album?;
        owned.albums.insert(album_key(&artist, &title));
    }
    drop(album_statement);

    if table_exists(conn, "musicbrainz_release_decisions")? {
        let mut statement = conn.prepare(
            "SELECT release_mbid FROM musicbrainz_release_decisions WHERE local_album_id IS NOT NULL AND TRIM(local_album_id) <> ''",
        )?;
        let ids = statement.query_map([], |row| row.get::<_, String>(0))?;
        for id in ids {
            owned.album_ids.insert(id?.to_lowercase());
        }
    }
    Ok(owned)
}

impl OwnedLibrary {
    fn contains(&self, item: &WishListItem) -> bool {
        match item.entity.as_str() {
            "album" => {
                item.musicbrainz_id
                    .as_deref()
                    .is_some_and(|id| self.album_ids.contains(&id.to_lowercase()))
                    || self.albums.contains(&album_key(&item.artist, &item.title))
            }
            _ => false,
        }
    }
}

fn item_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<WishListItem> {
    Ok(WishListItem {
        id: row.get(0)?,
        entity: row.get(1)?,
        title: row.get(2)?,
        artist: row.get(3)?,
        year: row.get(4)?,
        musicbrainz_id: row.get(5)?,
        musicbrainz_url: row.get(6)?,
        source: row.get(7)?,
        created_at: row.get(8)?,
        downloaded_deezer_album_id: row.get(9)?,
        downloaded_path: row.get(10)?,
        downloaded_at: row.get(11)?,
        artist_album_summary: None,
    })
}

fn load_item(conn: &Connection, id: i64) -> Result<WishListItem> {
    conn.query_row(
        "
        SELECT wish.id, wish.entity, wish.title, wish.artist, wish.year,
               wish.musicbrainz_id, wish.musicbrainz_url, wish.source, wish.created_at,
               download.deezer_album_id, download.destination_path, download.completed_at
        FROM wish_list_items wish
        LEFT JOIN deemix_downloads download ON download.id = (
            SELECT latest.id
            FROM deemix_downloads latest
            WHERE latest.wish_list_item_id = wish.id
               OR (
                    wish.entity = 'album'
                    AND wish.musicbrainz_id IS NOT NULL
                    AND latest.musicbrainz_release_group_id = wish.musicbrainz_id
               )
            ORDER BY latest.completed_at DESC, latest.id DESC
            LIMIT 1
        )
        WHERE wish.id = ?1
        ",
        params![id],
        item_from_row,
    )
    .with_context(|| format!("Could not load wish list item {id}"))
}

fn all_items(conn: &Connection) -> Result<Vec<WishListItem>> {
    let mut statement = conn.prepare(
        "
        SELECT wish.id, wish.entity, wish.title, wish.artist, wish.year,
               wish.musicbrainz_id, wish.musicbrainz_url, wish.source, wish.created_at,
               download.deezer_album_id, download.destination_path, download.completed_at
        FROM wish_list_items wish
        LEFT JOIN deemix_downloads download ON download.id = (
            SELECT latest.id
            FROM deemix_downloads latest
            WHERE latest.wish_list_item_id = wish.id
               OR (
                    wish.entity = 'album'
                    AND wish.musicbrainz_id IS NOT NULL
                    AND latest.musicbrainz_release_group_id = wish.musicbrainz_id
               )
            ORDER BY latest.completed_at DESC, latest.id DESC
            LIMIT 1
        )
        ORDER BY wish.created_at DESC, wish.id DESC
        ",
    )?;
    let items = statement
        .query_map([], item_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(items)
}

fn downloaded_release_group_ids(conn: &Connection) -> Result<HashSet<String>> {
    if !table_exists(conn, "deemix_downloads")? {
        return Ok(HashSet::new());
    }
    let mut statement = conn.prepare(
        "
        SELECT DISTINCT musicbrainz_release_group_id
        FROM deemix_downloads
        WHERE TRIM(COALESCE(musicbrainz_release_group_id, '')) <> ''
        ",
    )?;
    let ids = statement.query_map([], |row| row.get::<_, String>(0))?;
    let mut downloaded = HashSet::new();
    for id in ids {
        downloaded.insert(id?.to_lowercase());
    }
    Ok(downloaded)
}

fn album_is_in_library(
    owned: &OwnedLibrary,
    artist: &str,
    album: &crate::musicbrainz::WishListOfficialAlbum,
) -> bool {
    owned.album_ids.contains(&album.release_mbid.to_lowercase())
        || owned.albums.contains(&album_key(artist, &album.title))
}

fn build_artist_album_summary(
    item: &WishListItem,
    albums: &[crate::musicbrainz::WishListOfficialAlbum],
    updated_at: String,
    owned: &OwnedLibrary,
    downloaded: &HashSet<String>,
) -> WishListArtistAlbumSummary {
    let missing_albums = albums
        .iter()
        .filter(|album| {
            !album_is_in_library(&owned, &item.title, album)
                && !downloaded.contains(&album.release_mbid.to_lowercase())
        })
        .map(|album| WishListMissingAlbum {
            release_group_id: album.release_mbid.clone(),
            title: album.title.clone(),
            year: album.year,
            musicbrainz_url: format!(
                "https://musicbrainz.org/release-group/{}",
                album.release_mbid
            ),
        })
        .collect::<Vec<_>>();
    let official_album_count = albums.len();
    let missing_album_count = missing_albums.len();

    WishListArtistAlbumSummary {
        official_album_count,
        owned_album_count: official_album_count.saturating_sub(missing_album_count),
        missing_album_count,
        missing_albums,
        updated_at,
    }
}

fn cached_artist_album_summary(
    conn: &Connection,
    item: &WishListItem,
    owned: &OwnedLibrary,
    downloaded: &HashSet<String>,
) -> Result<Option<WishListArtistAlbumSummary>> {
    if item.entity != "artist" {
        return Ok(None);
    }
    let Some(musicbrainz_id) = item.musicbrainz_id.as_deref() else {
        return Ok(None);
    };
    let Some((albums, updated_at)) =
        crate::musicbrainz::cached_official_album_release_groups_for_wishlist(
            conn,
            musicbrainz_id,
        )?
    else {
        return Ok(None);
    };
    Ok(Some(build_artist_album_summary(
        item, &albums, updated_at, owned, downloaded,
    )))
}

fn attach_cached_artist_album_summaries(
    conn: &Connection,
    items: &mut [WishListItem],
) -> Result<()> {
    let owned = load_owned_library(conn)?;
    let downloaded = downloaded_release_group_ids(conn)?;
    for item in items.iter_mut().filter(|item| item.entity == "artist") {
        item.artist_album_summary = cached_artist_album_summary(conn, item, &owned, &downloaded)?;
    }
    Ok(())
}

pub(crate) fn reconcile_for_connection(conn: &Connection) -> Result<usize> {
    if !table_exists(conn, "wish_list_items")? {
        return Ok(0);
    }
    let owned = load_owned_library(conn)?;
    let removed_ids = all_items(conn)?
        .into_iter()
        .filter(|item| owned.contains(item))
        .map(|item| item.id)
        .collect::<Vec<_>>();
    for id in &removed_ids {
        conn.execute("DELETE FROM wish_list_items WHERE id = ?1", params![id])?;
    }
    Ok(removed_ids.len())
}

fn list(conn: &Connection) -> Result<WishListResponse> {
    let auto_removed_count = reconcile_for_connection(conn)?;
    let mut items = all_items(conn)?;
    attach_cached_artist_album_summaries(conn, &mut items)?;
    Ok(WishListResponse {
        items,
        auto_removed_count,
    })
}

fn validate_request(input: &mut AddWishListItemRequest) -> Result<()> {
    input.entity = input.entity.trim().to_lowercase();
    if !matches!(input.entity.as_str(), "artist" | "album") {
        bail!("Wish list items must be an artist or album.")
    }
    input.title = input.title.trim().chars().take(MAX_TITLE_LENGTH).collect();
    input.artist = input
        .artist
        .trim()
        .chars()
        .take(MAX_ARTIST_LENGTH)
        .collect();
    if input.title.is_empty() {
        bail!("A wish list item needs a title.")
    }
    if input.entity == "album" && input.artist.is_empty() {
        bail!("A wish list album needs an artist.")
    }
    if let Some(year) = input.year {
        if !(1000..=3000).contains(&year) {
            bail!("The wish list year is outside the supported range.")
        }
    }
    input.source = input.source.trim().to_string();
    if input.source.is_empty() || input.source.chars().count() > 80 {
        bail!("A wish list item needs a valid source.")
    }
    input.musicbrainz_id = input
        .musicbrainz_id
        .take()
        .map(|id| id.trim().to_lowercase())
        .filter(|id| !id.is_empty());
    input.musicbrainz_url = input
        .musicbrainz_url
        .take()
        .map(|url| url.trim().to_string())
        .filter(|url| !url.is_empty());
    if let Some(url) = &input.musicbrainz_url {
        let prefix = if input.entity == "artist" {
            "https://musicbrainz.org/artist/"
        } else {
            "https://musicbrainz.org/release-group/"
        };
        if !url.starts_with(prefix) || url.len() <= prefix.len() {
            bail!("The wish list MusicBrainz link is not valid for this item.")
        }
    }
    Ok(())
}

fn identity_key(input: &AddWishListItemRequest) -> String {
    if let Some(musicbrainz_id) = &input.musicbrainz_id {
        return format!("{}\u{1f}mbid\u{1f}{}", input.entity, musicbrainz_id);
    }
    format!(
        "{}\u{1f}name\u{1f}{}",
        input.entity,
        album_key(&input.artist, &input.title)
    )
}

fn valid_musicbrainz_id(value: &str) -> bool {
    value.len() == 36
        && value.chars().enumerate().all(|(index, character)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                character == '-'
            } else {
                character.is_ascii_hexdigit()
            }
        })
}

fn candidate_add_request(
    mut candidate: WishListMusicBrainzCandidate,
) -> Result<AddWishListItemRequest> {
    candidate.entity = candidate.entity.trim().to_lowercase();
    if !matches!(candidate.entity.as_str(), "artist" | "album") {
        bail!("MusicBrainz returned an unsupported Wish List item type.")
    }
    let musicbrainz_id = candidate.musicbrainz_id.trim().to_lowercase();
    if !valid_musicbrainz_id(&musicbrainz_id) {
        bail!("MusicBrainz returned an invalid identifier for this item.")
    }
    let musicbrainz_url = if candidate.entity == "artist" {
        format!("https://musicbrainz.org/artist/{musicbrainz_id}")
    } else {
        format!("https://musicbrainz.org/release-group/{musicbrainz_id}")
    };
    let mut input = AddWishListItemRequest {
        entity: candidate.entity,
        title: candidate.title,
        artist: candidate.artist,
        year: candidate.year,
        musicbrainz_id: Some(musicbrainz_id),
        musicbrainz_url: Some(musicbrainz_url),
        source: "MusicBrainz search".to_string(),
    };
    validate_request(&mut input)?;
    Ok(input)
}

fn add_validated_musicbrainz_candidate(
    conn: &Connection,
    candidate: WishListMusicBrainzCandidate,
    artist_albums: Option<(Vec<crate::musicbrainz::WishListOfficialAlbum>, String)>,
) -> Result<AddWishListMusicBrainzCandidateResponse> {
    let input = candidate_add_request(candidate)?;
    let existing_id = conn
        .query_row(
            "SELECT id FROM wish_list_items WHERE identity_key = ?1",
            params![identity_key(&input)],
            |row| row.get::<_, i64>(0),
        )
        .optional()?;

    if input.entity == "artist" {
        let (albums, updated_at) = artist_albums
            .context("MusicBrainz artist albums must be checked before adding this artist.")?;
        let proposed = WishListItem {
            id: existing_id.unwrap_or_default(),
            entity: input.entity.clone(),
            title: input.title.clone(),
            artist: input.artist.clone(),
            year: input.year,
            musicbrainz_id: input.musicbrainz_id.clone(),
            musicbrainz_url: input.musicbrainz_url.clone(),
            source: input.source.clone(),
            created_at: String::new(),
            downloaded_deezer_album_id: None,
            downloaded_path: None,
            downloaded_at: None,
            artist_album_summary: None,
        };
        let summary = build_artist_album_summary(
            &proposed,
            &albums,
            updated_at,
            &load_owned_library(conn)?,
            &downloaded_release_group_ids(conn)?,
        );
        if summary.official_album_count == 0 {
            return Ok(AddWishListMusicBrainzCandidateResponse {
                added: false,
                item: None,
                message: format!(
                    "MusicBrainz has no official album releases for {}. The artist was not added.",
                    input.title
                ),
                artist_album_summary: Some(summary),
            });
        }
        if summary.missing_album_count == 0 {
            return Ok(AddWishListMusicBrainzCandidateResponse {
                added: false,
                item: None,
                message: format!(
                    "You already have all {} official {} by {}. The artist was not added.",
                    summary.official_album_count,
                    if summary.official_album_count == 1 {
                        "album"
                    } else {
                        "albums"
                    },
                    input.title
                ),
                artist_album_summary: Some(summary),
            });
        }

        let mut item = add(conn, input)?;
        item.artist_album_summary = Some(summary.clone());
        let added = existing_id.is_none();
        return Ok(AddWishListMusicBrainzCandidateResponse {
            added,
            item: Some(item),
            message: if added {
                format!(
                    "Added {} with {}.",
                    proposed.title,
                    missing_album_label(summary.missing_album_count)
                )
            } else {
                format!(
                    "{} is already being tracked with {}.",
                    proposed.title,
                    missing_album_label(summary.missing_album_count)
                )
            },
            artist_album_summary: Some(summary),
        });
    }

    let item = add(conn, input)?;
    let added = existing_id.is_none();
    Ok(AddWishListMusicBrainzCandidateResponse {
        added,
        message: if added {
            format!("Added {} by {}.", item.title, item.artist)
        } else {
            format!(
                "{} by {} is already on the Wish List.",
                item.title, item.artist
            )
        },
        item: Some(item),
        artist_album_summary: None,
    })
}

fn missing_album_label(count: usize) -> String {
    format!(
        "{count} {} missing",
        if count == 1 { "album" } else { "albums" }
    )
}

fn add(conn: &Connection, mut input: AddWishListItemRequest) -> Result<WishListItem> {
    validate_request(&mut input)?;
    reconcile_for_connection(conn)?;
    let proposed = WishListItem {
        id: 0,
        entity: input.entity.clone(),
        title: input.title.clone(),
        artist: input.artist.clone(),
        year: input.year,
        musicbrainz_id: input.musicbrainz_id.clone(),
        musicbrainz_url: input.musicbrainz_url.clone(),
        source: input.source.clone(),
        created_at: String::new(),
        downloaded_deezer_album_id: None,
        downloaded_path: None,
        downloaded_at: None,
        artist_album_summary: None,
    };
    if load_owned_library(conn)?.contains(&proposed) {
        bail!("This item is already in your library.")
    }

    let identity_key = identity_key(&input);
    if let Some(id) = conn
        .query_row(
            "SELECT id FROM wish_list_items WHERE identity_key = ?1",
            params![identity_key],
            |row| row.get::<_, i64>(0),
        )
        .optional()?
    {
        return load_item(conn, id);
    }

    let created_at = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO wish_list_items (entity, title, artist, year, musicbrainz_id, musicbrainz_url, source, identity_key, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![input.entity, input.title, input.artist, input.year, input.musicbrainz_id, input.musicbrainz_url, input.source, identity_key, created_at],
    )?;
    load_item(conn, conn.last_insert_rowid())
}

pub(crate) fn add_for_connection(
    conn: &Connection,
    input: AddWishListItemRequest,
) -> Result<WishListItem> {
    add(conn, input)
}

fn remove(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM wish_list_items WHERE id = ?1", params![id])?;
    Ok(())
}

fn download_receipt_for_release(
    conn: &Connection,
    release_group_id: &str,
) -> Result<Option<DownloadReceiptSummary>> {
    conn.query_row(
        "
        SELECT deezer_album_id, destination_path, completed_at
        FROM deemix_downloads
        WHERE musicbrainz_release_group_id = ?1
        ORDER BY completed_at DESC, id DESC
        LIMIT 1
        ",
        params![release_group_id],
        |row| {
            Ok(DownloadReceiptSummary {
                deezer_album_id: row.get(0)?,
                destination_path: row.get(1)?,
                completed_at: row.get(2)?,
            })
        },
    )
    .optional()
    .context("Could not load the Deemix download receipt")
}

#[cfg(not(test))]
pub fn discover_artist_albums_for_app(
    app: &AppHandle,
    request: WishListArtistAlbumDiscoveryRequest,
) -> Result<WishListArtistAlbumDiscoveryResponse> {
    if request.wish_list_item_id <= 0 {
        bail!("The Wish List artist selection is invalid.")
    }
    let (mut conn, _) = db::open(app)?;
    let item = load_item(&conn, request.wish_list_item_id)?;
    if item.entity != "artist" {
        bail!("Artist album discovery requires an artist Wish List item.")
    }
    let musicbrainz_id = item
        .musicbrainz_id
        .clone()
        .context("This artist has no MusicBrainz ID to verify official albums.")?;

    crate::deemix::validate_search_connection()?;
    let (official_albums, searched_at) =
        crate::musicbrainz::official_album_release_groups_for_wishlist(&mut conn, &musicbrainz_id)?;
    let owned = load_owned_library(&conn)?;
    let downloaded = downloaded_release_group_ids(&conn)?;
    let album_summary = build_artist_album_summary(
        &item,
        &official_albums,
        searched_at.clone(),
        &owned,
        &downloaded,
    );
    let official_album_count = official_albums.len();
    let truncated = official_album_count > MAX_ARTIST_DISCOVERY_ALBUMS;
    let selected_albums = official_albums
        .into_iter()
        .take(MAX_ARTIST_DISCOVERY_ALBUMS)
        .collect::<Vec<_>>();
    let searched_album_count = selected_albums.len();
    let mut rows = Vec::with_capacity(searched_album_count);

    for album in selected_albums {
        let in_library = album_is_in_library(&owned, &item.title, &album);
        let receipt = download_receipt_for_release(&conn, &album.release_mbid)?;
        let search = crate::deemix::search_albums_after_validation(
            crate::deemix::DeemixAlbumSearchRequest {
                title: album.title.clone(),
                artist: item.title.clone(),
                year: album.year,
                limit: Some(4),
            },
        );
        let (mut matches, deemix_error) = match search {
            Ok(response) => (response.matches, None),
            Err(error) => (Vec::new(), Some(error.to_string())),
        };
        if let Some(receipt) = &receipt {
            for album_match in &mut matches {
                if album_match.id == receipt.deezer_album_id {
                    album_match.downloaded_at = Some(receipt.completed_at.clone());
                    album_match.downloaded_path = Some(receipt.destination_path.clone());
                }
            }
        }
        rows.push(WishListArtistAlbumDiscoveryRow {
            release_group_id: album.release_mbid.clone(),
            title: album.title,
            year: album.year,
            secondary_types: album.secondary_types,
            musicbrainz_url: format!(
                "https://musicbrainz.org/release-group/{}",
                album.release_mbid
            ),
            deemix_matches: matches,
            deemix_error,
            downloaded_deezer_album_id: receipt.as_ref().map(|value| value.deezer_album_id.clone()),
            downloaded_path: receipt.as_ref().map(|value| value.destination_path.clone()),
            downloaded_at: receipt.map(|value| value.completed_at),
            in_library,
        });
    }

    let matched_album_count = rows
        .iter()
        .filter(|album| !album.deemix_matches.is_empty())
        .count();
    Ok(WishListArtistAlbumDiscoveryResponse {
        wish_list_item_id: item.id,
        artist: item.title,
        musicbrainz_id,
        official_album_count,
        searched_album_count,
        matched_album_count,
        truncated,
        albums: rows,
        album_summary,
        searched_at,
    })
}

#[cfg(not(test))]
pub fn refresh_artist_album_summary_for_app(
    app: &AppHandle,
    request: WishListArtistAlbumDiscoveryRequest,
) -> Result<WishListArtistAlbumSummary> {
    if request.wish_list_item_id <= 0 {
        bail!("The Wish List artist selection is invalid.")
    }
    let (mut conn, _) = db::open(app)?;
    let item = load_item(&conn, request.wish_list_item_id)?;
    if item.entity != "artist" {
        bail!("Artist album summaries require an artist Wish List item.")
    }
    let musicbrainz_id = item
        .musicbrainz_id
        .clone()
        .context("This artist has no MusicBrainz ID to verify official albums.")?;
    let (albums, updated_at) =
        crate::musicbrainz::official_album_release_groups_for_wishlist(&mut conn, &musicbrainz_id)?;
    let owned = load_owned_library(&conn)?;
    let downloaded = downloaded_release_group_ids(&conn)?;
    Ok(build_artist_album_summary(
        &item,
        &albums,
        updated_at,
        &owned,
        &downloaded,
    ))
}

#[cfg(not(test))]
pub fn list_for_app(app: &AppHandle) -> Result<WishListResponse> {
    let (conn, _) = db::open(app)?;
    list(&conn)
}

#[cfg(not(test))]
pub fn add_for_app(app: &AppHandle, input: AddWishListItemRequest) -> Result<WishListItem> {
    let (conn, _) = db::open(app)?;
    add(&conn, input)
}

#[cfg(not(test))]
pub fn add_musicbrainz_candidate_for_app(
    app: &AppHandle,
    request: AddWishListMusicBrainzCandidateRequest,
) -> Result<AddWishListMusicBrainzCandidateResponse> {
    let (mut conn, _) = db::open(app)?;
    let candidate = if request.candidate.entity.eq_ignore_ascii_case("album") {
        validate_musicbrainz_album_candidate(request.candidate)?
    } else {
        request.candidate
    };
    let artist_albums = if candidate.entity.eq_ignore_ascii_case("artist") {
        Some(
            crate::musicbrainz::official_album_release_groups_for_wishlist(
                &mut conn,
                &candidate.musicbrainz_id,
            )?,
        )
    } else {
        None
    };
    add_validated_musicbrainz_candidate(&conn, candidate, artist_albums)
}

#[cfg(not(test))]
pub fn remove_for_app(app: &AppHandle, id: i64) -> Result<()> {
    let (conn, _) = db::open(app)?;
    remove(&conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn connection() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        crate::db::configure(&conn).expect("configure database");
        crate::db::migrate(&conn).expect("migrate database");
        conn.execute(
            "INSERT INTO import_runs (source_path, started_at, status) VALUES ('test', '2026-07-19', 'running')",
            [],
        )
        .expect("create import run");
        conn
    }

    fn album_request(id: &str, title: &str, artist: &str) -> AddWishListItemRequest {
        AddWishListItemRequest {
            entity: "album".to_string(),
            title: title.to_string(),
            artist: artist.to_string(),
            year: Some(1992),
            musicbrainz_id: Some(id.to_string()),
            musicbrainz_url: Some(format!("https://musicbrainz.org/release-group/{id}")),
            source: "MusicBrainz".to_string(),
        }
    }

    #[test]
    fn adds_lists_deduplicates_and_removes_items() {
        let conn = connection();
        let first = add(&conn, album_request("release-1", "Wish", "The Artist")).expect("add item");
        let duplicate =
            add(&conn, album_request("release-1", "Wish", "The Artist")).expect("deduplicate item");
        assert_eq!(first.id, duplicate.id);
        assert_eq!(list(&conn).expect("list items").items.len(), 1);

        remove(&conn, first.id).expect("remove item");
        assert!(list(&conn).expect("list empty").items.is_empty());
    }

    #[test]
    fn reconciliation_removes_acquired_albums_but_keeps_artist_trackers() {
        let conn = connection();
        add(&conn, album_request("release-2", "Déjà Vu", "Beyoncé")).expect("add album");
        add(
            &conn,
            AddWishListItemRequest {
                entity: "artist".to_string(),
                title: "New Artist".to_string(),
                artist: String::new(),
                year: None,
                musicbrainz_id: Some("artist-1".to_string()),
                musicbrainz_url: Some("https://musicbrainz.org/artist/artist-1".to_string()),
                source: "MusicBrainz".to_string(),
            },
        )
        .expect("add artist");
        conn.execute(
            "INSERT INTO albums (id, import_run_id, album, album_artist_display, total_tracks, rated_tracks, rating_completeness, total_seconds, loved_tracks, tmoe_seconds, ae_ratio) VALUES ('album-1', 1, 'Deja Vu', 'Beyonce', 1, 0, 0, 180, 0, 0, 0)",
            [],
        )
        .expect("insert acquired album");
        conn.execute(
            "INSERT INTO tracks (import_run_id, album_id, display_artist, title, row_hash) VALUES (1, 'album-1', 'New Artist', 'Track', 'hash')",
            [],
        )
        .expect("insert acquired artist");

        let response = list(&conn).expect("reconcile list");
        assert_eq!(response.auto_removed_count, 1);
        assert_eq!(response.items.len(), 1);
        assert_eq!(response.items[0].entity, "artist");
        assert_eq!(response.items[0].title, "New Artist");
    }

    #[test]
    fn artist_summary_counts_library_and_downloaded_albums_as_owned() {
        let conn = connection();
        let artist = add(
            &conn,
            AddWishListItemRequest {
                entity: "artist".to_string(),
                title: "Engine Alley".to_string(),
                artist: String::new(),
                year: None,
                musicbrainz_id: Some("engine-alley-mbid".to_string()),
                musicbrainz_url: Some(
                    "https://musicbrainz.org/artist/engine-alley-mbid".to_string(),
                ),
                source: "MusicBrainz".to_string(),
            },
        )
        .expect("add artist tracker");
        for (release_mbid, title, year) in [
            ("engine-release-1", "A Sonic Holiday", 1992),
            ("engine-release-2", "Shot in the Light", 1995),
            ("engine-release-3", "Engine Alley", 1998),
            ("engine-release-4", "Showroom", 2018),
        ] {
            conn.execute(
                "
                INSERT INTO musicbrainz_artist_release_groups (
                    artist_mbid, release_mbid, title, year, type,
                    secondary_types, status, source, fetched_at
                ) VALUES (
                    'engine-alley-mbid', ?1, ?2, ?3, 'Album', '',
                    'Official', 'musicbrainz-live', '2026-07-27T10:00:00Z'
                )
                ",
                params![release_mbid, title, year],
            )
            .expect("insert artist release group");
            conn.execute(
                "
                INSERT INTO musicbrainz_release_status_cache (
                    artist_mbid, release_mbid, has_official_release, checked_at
                ) VALUES (
                    'engine-alley-mbid', ?1, 1, '2026-07-27T10:00:00Z'
                )
                ",
                params![release_mbid],
            )
            .expect("insert official release status");
        }
        conn.execute(
            "
            INSERT INTO musicbrainz_artist_release_groups (
                artist_mbid, release_mbid, title, year, type,
                secondary_types, status, source, fetched_at
            ) VALUES (
                'engine-alley-mbid', 'engine-live-release', 'Live at the Olympia',
                1996, 'Album', 'Live', 'Official', 'musicbrainz-live',
                '2026-07-27T10:00:00Z'
            )
            ",
            [],
        )
        .expect("insert secondary-type album");
        conn.execute(
            "
            INSERT INTO musicbrainz_release_status_cache (
                artist_mbid, release_mbid, has_official_release, checked_at
            ) VALUES (
                'engine-alley-mbid', 'engine-live-release', 1,
                '2026-07-27T10:00:00Z'
            )
            ",
            [],
        )
        .expect("insert secondary-type official status");
        conn.execute(
            "
            INSERT INTO albums (
                id, import_run_id, album, album_artist_display, total_tracks,
                rated_tracks, rating_completeness, total_seconds, loved_tracks,
                tmoe_seconds, ae_ratio
            ) VALUES (
                'engine-local-1', 1, 'A Sonic Holiday', 'Engine Alley', 10,
                0, 0, 1800, 0, 0, 0
            )
            ",
            [],
        )
        .expect("insert acquired library album");
        conn.execute(
            "
            INSERT INTO deemix_downloads (
                deezer_album_id, wish_list_item_id, musicbrainz_release_group_id,
                artist, album, year, quality, destination_path, cover_path,
                track_count, completed_at, source
            ) VALUES (
                'engine-deezer-2', ?1, 'engine-release-2', 'Engine Alley',
                'Shot in the Light', 1995, 'mp3_320',
                'D:\\Music\\Engine Alley - Shot in the Light (1995)', NULL,
                10, '2026-07-27T11:00:00Z', 'download'
            )
            ",
            params![artist.id],
        )
        .expect("insert acquired download receipt");

        let response = list(&conn).expect("list partial artist tracker");
        assert_eq!(response.auto_removed_count, 0);
        assert_eq!(response.items.len(), 1);
        let summary = response.items[0]
            .artist_album_summary
            .as_ref()
            .expect("artist album summary");
        assert_eq!(summary.official_album_count, 4);
        assert_eq!(summary.owned_album_count, 2);
        assert_eq!(summary.missing_album_count, 2);
        assert_eq!(
            summary
                .missing_albums
                .iter()
                .map(|album| album.title.as_str())
                .collect::<Vec<_>>(),
            vec!["Engine Alley", "Showroom"]
        );
    }

    #[test]
    fn lists_the_latest_download_receipt_on_an_album_wish() {
        let conn = connection();
        let item =
            add(&conn, album_request("release-3", "Wish", "The Artist")).expect("add album wish");
        conn.execute(
            "
            INSERT INTO deemix_downloads (
                deezer_album_id, wish_list_item_id, musicbrainz_release_group_id,
                artist, album, year, quality, destination_path, cover_path,
                track_count, completed_at, source
            ) VALUES (
                '123', ?1, 'release-3', 'The Artist', 'Wish', 1992, 'mp3_320',
                'D:\\Music\\The Artist - Wish (1992)', NULL, 10,
                '2026-07-26T12:00:00Z', 'download'
            )
            ",
            params![item.id],
        )
        .expect("insert download receipt");

        let response = list(&conn).expect("list wish with receipt");
        assert_eq!(
            response.items[0].downloaded_deezer_album_id.as_deref(),
            Some("123")
        );
        assert_eq!(
            response.items[0].downloaded_path.as_deref(),
            Some(r"D:\Music\The Artist - Wish (1992)")
        );
        assert_eq!(
            response.items[0].downloaded_at.as_deref(),
            Some("2026-07-26T12:00:00Z")
        );
    }

    #[test]
    fn parses_musicbrainz_artist_and_album_search_candidates() {
        let artists = artist_search_candidates(
            serde_json::from_str(
                r#"{
                    "artists": [{
                        "id": "11111111-1111-4111-8111-111111111111",
                        "name": "Engine Alley",
                        "score": 100,
                        "country": "IE",
                        "disambiguation": "Irish alternative rock band"
                    }]
                }"#,
            )
            .expect("parse artist search payload"),
        );
        assert_eq!(artists.len(), 1);
        assert_eq!(artists[0].title, "Engine Alley");
        assert_eq!(artists[0].country.as_deref(), Some("IE"));

        let albums = album_search_candidates(
            serde_json::from_str(
                r#"{
                    "release-groups": [{
                        "id": "22222222-2222-4222-8222-222222222222",
                        "title": "Release",
                        "score": 99,
                        "first-release-date": "2002-04-01",
                        "primary-type": "Album",
                        "artist-credit": [{"name": "Pet Shop Boys", "joinphrase": ""}]
                    }, {
                        "id": "33333333-3333-4333-8333-333333333333",
                        "title": "Single",
                        "score": 95,
                        "primary-type": "Single",
                        "artist-credit": [{"name": "Pet Shop Boys", "joinphrase": ""}]
                    }, {
                        "id": "44444444-4444-4444-8444-444444444444",
                        "title": "PopArt",
                        "score": 93,
                        "primary-type": "Album",
                        "secondary-types": ["Compilation"],
                        "artist-credit": [{"name": "Pet Shop Boys", "joinphrase": ""}]
                    }]
                }"#,
            )
            .expect("parse album search payload"),
        );
        assert_eq!(albums.len(), 1);
        assert_eq!(albums[0].title, "Release");
        assert_eq!(albums[0].artist, "Pet Shop Boys");
        assert_eq!(albums[0].year, Some(2002));
    }

    #[test]
    fn does_not_add_musicbrainz_artist_when_no_official_albums_are_missing() {
        let conn = connection();
        for (index, release_id) in [
            "33333333-3333-4333-8333-333333333333",
            "44444444-4444-4444-8444-444444444444",
        ]
        .into_iter()
        .enumerate()
        {
            conn.execute(
                "
                INSERT INTO deemix_downloads (
                    deezer_album_id, wish_list_item_id, musicbrainz_release_group_id,
                    artist, album, year, quality, destination_path, cover_path,
                    track_count, completed_at, source
                ) VALUES (
                    ?1, NULL, ?2, 'Complete Artist', ?3, 2000, 'mp3_320',
                    ?4, NULL, 10, '2026-07-26T12:00:00Z', 'download'
                )
                ",
                params![
                    format!("deezer-{index}"),
                    release_id,
                    format!("Album {}", index + 1),
                    format!(r"D:\Music\Complete Artist - Album {}", index + 1),
                ],
            )
            .expect("insert completed album");
        }
        let candidate = WishListMusicBrainzCandidate {
            entity: "artist".to_string(),
            title: "Complete Artist".to_string(),
            artist: String::new(),
            year: None,
            musicbrainz_id: "11111111-1111-4111-8111-111111111111".to_string(),
            musicbrainz_url: "https://musicbrainz.org/artist/11111111-1111-4111-8111-111111111111"
                .to_string(),
            disambiguation: None,
            country: None,
            score: 100,
        };
        let albums = vec![
            crate::musicbrainz::WishListOfficialAlbum {
                release_mbid: "33333333-3333-4333-8333-333333333333".to_string(),
                title: "Album 1".to_string(),
                year: Some(2000),
                secondary_types: Vec::new(),
            },
            crate::musicbrainz::WishListOfficialAlbum {
                release_mbid: "44444444-4444-4444-8444-444444444444".to_string(),
                title: "Album 2".to_string(),
                year: Some(2001),
                secondary_types: Vec::new(),
            },
        ];

        let response = add_validated_musicbrainz_candidate(
            &conn,
            candidate,
            Some((albums, "2026-07-26T13:00:00Z".to_string())),
        )
        .expect("validate fully owned artist");

        assert!(!response.added);
        assert!(response.item.is_none());
        assert!(response
            .message
            .contains("already have all 2 official albums"));
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM wish_list_items", [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("count wish list items"),
            0
        );
    }
}
