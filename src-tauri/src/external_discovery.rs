use crate::ai::AiExternalDiscoveryPlan;
#[cfg(not(test))]
use crate::db;
use anyhow::{anyhow, bail, Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
#[cfg(not(test))]
use tauri::AppHandle;
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

const MUSICBRAINZ_ARTIST_SEARCH_URL: &str = "https://musicbrainz.org/ws/2/artist";
const MUSICBRAINZ_RELEASE_GROUP_SEARCH_URL: &str = "https://musicbrainz.org/ws/2/release-group";
const MUSICBRAINZ_RECORDING_SEARCH_URL: &str = "https://musicbrainz.org/ws/2/recording";
const MUSICBRAINZ_USER_AGENT: &str =
    "music-backup-v5/0.58.0 (https://github.com/soundtrackgeek/music_backup_v5)";
const MAX_CATALOG_CANDIDATES: usize = 100;
const MAX_SAVED_RESPONSE_BYTES: usize = 1_000_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExternalDiscoveryItem {
    pub id: String,
    pub entity: String,
    pub title: String,
    pub artist: String,
    pub anchor: Option<String>,
    pub year: Option<i32>,
    pub country: Option<String>,
    pub item_type: Option<String>,
    pub tags: Vec<String>,
    pub score: i32,
    pub evidence: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalDiscoveryResponse {
    pub prompt: String,
    pub title: String,
    pub summary: String,
    pub plan: AiExternalDiscoveryPlan,
    pub items: Vec<ExternalDiscoveryItem>,
    pub source: String,
    pub fetched_at: String,
    pub catalog_candidate_count: usize,
    pub excluded_owned_count: usize,
    pub limitations: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveExternalDiscoveryRequest {
    pub id: Option<i64>,
    pub name: String,
    pub response: ExternalDiscoveryResponse,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedExternalDiscovery {
    pub id: i64,
    pub name: String,
    pub response: ExternalDiscoveryResponse,
    pub library_import_run_id: Option<i64>,
    pub library_imported_at: Option<String>,
    pub library_album_count: i64,
    pub library_track_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Default)]
struct OwnedLibrary {
    artist_mbids: HashSet<String>,
    artist_names: HashSet<String>,
    albums: HashSet<String>,
    release_group_mbids: HashSet<String>,
}

#[derive(Debug, Deserialize)]
struct CatalogTag {
    name: String,
    #[serde(default)]
    count: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct CatalogLifeSpan {
    begin: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct CatalogArtist {
    id: String,
    name: String,
    #[serde(default)]
    disambiguation: String,
    country: Option<String>,
    #[serde(rename = "type")]
    artist_type: Option<String>,
    #[serde(default)]
    life_span: Option<CatalogLifeSpan>,
    #[serde(default)]
    tags: Vec<CatalogTag>,
    #[serde(default)]
    score: Value,
}

#[derive(Debug, Deserialize)]
struct ArtistCredit {
    #[serde(default)]
    name: String,
    #[serde(default)]
    joinphrase: String,
    artist: CatalogArtist,
}

#[derive(Debug, Deserialize)]
struct ArtistSearchResponse {
    #[serde(default)]
    artists: Vec<CatalogArtist>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct CatalogReleaseGroup {
    id: String,
    title: String,
    #[serde(default)]
    disambiguation: String,
    first_release_date: Option<String>,
    primary_type: Option<String>,
    #[serde(default)]
    artist_credit: Vec<ArtistCredit>,
    #[serde(default)]
    tags: Vec<CatalogTag>,
    #[serde(default)]
    score: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct ReleaseGroupSearchResponse {
    #[serde(default)]
    release_groups: Vec<CatalogReleaseGroup>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct CatalogRecording {
    id: String,
    title: String,
    #[serde(default)]
    disambiguation: String,
    first_release_date: Option<String>,
    #[serde(default)]
    artist_credit: Vec<ArtistCredit>,
    #[serde(default)]
    tags: Vec<CatalogTag>,
    #[serde(default)]
    score: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct RecordingSearchResponse {
    #[serde(default)]
    recordings: Vec<CatalogRecording>,
}

#[cfg(not(test))]
pub fn discover_for_app(
    app: &AppHandle,
    plan: AiExternalDiscoveryPlan,
) -> Result<ExternalDiscoveryResponse> {
    let (conn, _) = db::open(app)?;
    discover_for_connection(&conn, plan)
}

fn discover_for_connection(
    conn: &Connection,
    plan: AiExternalDiscoveryPlan,
) -> Result<ExternalDiscoveryResponse> {
    let candidates = fetch_catalog_candidates(&plan)?;
    build_discovery_response(conn, plan, candidates)
}

fn build_discovery_response(
    conn: &Connection,
    plan: AiExternalDiscoveryPlan,
    candidates: Vec<ExternalDiscoveryItem>,
) -> Result<ExternalDiscoveryResponse> {
    let owned = load_owned_library(conn)?;
    let catalog_candidate_count = candidates.len();
    let mut excluded_owned_count = 0;
    let mut seen = HashSet::new();
    let mut items = Vec::new();
    for item in candidates {
        if !seen.insert(item.id.clone()) {
            continue;
        }
        if owned.contains(conn, &item)? {
            excluded_owned_count += 1;
            continue;
        }
        if items.len() < plan.count as usize {
            items.push(item);
        }
    }

    let mut limitations = Vec::new();
    if !plan.countries.is_empty()
        && matches!(plan.entity.as_str(), "artist" | "album")
        && plan.year_meaning == "releaseYear"
    {
        limitations.push(
            "MusicBrainz release-group search cannot apply artist country directly; the country filter was not used."
                .to_string(),
        );
    }
    if items.len() < plan.count as usize {
        limitations.push(format!(
            "MusicBrainz returned {} unowned result{} from the bounded candidate set, fewer than the requested {}.",
            items.len(),
            if items.len() == 1 { "" } else { "s" },
            plan.count
        ));
    }

    Ok(ExternalDiscoveryResponse {
        prompt: plan.prompt.clone(),
        title: plan.title.clone(),
        summary: plan.summary.clone(),
        plan,
        items,
        source: "MusicBrainz".to_string(),
        fetched_at: Utc::now().to_rfc3339(),
        catalog_candidate_count,
        excluded_owned_count,
        limitations,
    })
}

impl OwnedLibrary {
    fn contains(&self, conn: &Connection, item: &ExternalDiscoveryItem) -> Result<bool> {
        Ok(match item.entity.as_str() {
            "artist" => {
                self.artist_mbids.contains(&item.id)
                    || self.artist_names.contains(&normalize_key(&item.title))
            }
            "album" => {
                self.release_group_mbids.contains(&item.id)
                    || self.albums.contains(&pair_key(&item.artist, &item.title))
            }
            "song" => song_is_owned(conn, &item.artist, &item.title)?,
            _ => false,
        })
    }
}

fn load_owned_library(conn: &Connection) -> Result<OwnedLibrary> {
    let mut owned = OwnedLibrary::default();
    {
        let mut stmt = conn.prepare(
            "SELECT album_artist_display, album FROM albums WHERE TRIM(COALESCE(album, '')) <> ''",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
            ))
        })?;
        for row in rows {
            let (artist, album) = row?;
            let artist = artist.unwrap_or_default();
            let album = album.unwrap_or_default();
            if !artist.trim().is_empty() {
                owned.artist_names.insert(normalize_key(&artist));
            }
            owned.albums.insert(pair_key(&artist, &album));
        }
    }
    {
        let mut stmt = conn.prepare(
            "SELECT DISTINCT display_artist FROM tracks WHERE TRIM(COALESCE(display_artist, '')) <> ''",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for row in rows {
            owned.artist_names.insert(normalize_key(&row?));
        }
    }
    if table_exists(conn, "musicbrainz_artist_links")? {
        let mut stmt = conn.prepare(
            "SELECT mbid FROM musicbrainz_artist_links WHERE ignored = 0 AND TRIM(COALESCE(mbid, '')) <> ''",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for row in rows {
            owned.artist_mbids.insert(row?);
        }
    }
    if table_exists(conn, "musicbrainz_release_decisions")? {
        let mut stmt = conn.prepare(
            "SELECT release_mbid FROM musicbrainz_release_decisions WHERE local_album_id IS NOT NULL AND TRIM(local_album_id) <> ''",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for row in rows {
            owned.release_group_mbids.insert(row?);
        }
    }
    Ok(owned)
}

fn song_is_owned(conn: &Connection, artist: &str, title: &str) -> Result<bool> {
    let by_display_artist = conn
        .query_row(
            "SELECT 1 FROM tracks WHERE display_artist = ?1 COLLATE NOCASE AND title = ?2 COLLATE NOCASE LIMIT 1",
            params![artist.trim(), title.trim()],
            |_| Ok(()),
        )
        .optional()?
        .is_some();
    if by_display_artist {
        return Ok(true);
    }
    let by_album_artist = conn
        .query_row(
            "SELECT 1 FROM tracks WHERE album_artist_display = ?1 COLLATE NOCASE AND title = ?2 COLLATE NOCASE LIMIT 1",
            params![artist.trim(), title.trim()],
            |_| Ok(()),
        )
        .optional()?
        .is_some();
    if by_album_artist || !table_exists(conn, "track_search_fts")? {
        return Ok(by_album_artist);
    }

    let query = format!(
        "title:{} AND (display_artist:{} OR album_artist_display:{})",
        fts_phrase(title),
        fts_phrase(artist),
        fts_phrase(artist)
    );
    let expected = pair_key(artist, title);
    let mut stmt = conn.prepare(
        "SELECT display_artist, album_artist_display, title FROM track_search_fts WHERE track_search_fts MATCH ?1 LIMIT 20",
    )?;
    let rows = stmt.query_map(params![query], |row| {
        Ok((
            row.get::<_, Option<String>>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, Option<String>>(2)?,
        ))
    })?;
    for row in rows {
        let (display_artist, album_artist, local_title) = row?;
        let local_title = local_title.unwrap_or_default();
        for local_artist in [display_artist, album_artist].into_iter().flatten() {
            if pair_key(&local_artist, &local_title) == expected {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn fts_phrase(value: &str) -> String {
    format!("\"{}\"", value.trim().replace('"', "\"\""))
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

fn normalize_key(value: &str) -> String {
    let expanded = value.replace('&', " and ");
    let mut normalized = String::new();
    let mut pending_space = false;
    for ch in expanded
        .nfkd()
        .filter(|ch| !is_combining_mark(*ch))
        .flat_map(char::to_lowercase)
    {
        if ch.is_alphanumeric() {
            if pending_space && !normalized.is_empty() {
                normalized.push(' ');
            }
            normalized.push(ch);
            pending_space = false;
        } else {
            pending_space = true;
        }
    }
    normalized
}

fn pair_key(artist: &str, title: &str) -> String {
    format!("{}\u{1f}{}", normalize_key(artist), normalize_key(title))
}

fn fetch_catalog_candidates(plan: &AiExternalDiscoveryPlan) -> Result<Vec<ExternalDiscoveryItem>> {
    let limit = ((plan.count as usize).saturating_mul(12))
        .max(25)
        .min(MAX_CATALOG_CANDIDATES);
    match (plan.entity.as_str(), plan.year_meaning.as_str(), plan.year) {
        ("artist", "formedYear", _) | ("artist", _, 0) => fetch_artists(plan, limit),
        ("artist", _, _) => fetch_artists_by_release(plan, limit),
        ("album", _, _) => fetch_albums(plan, limit),
        ("song", _, _) => fetch_songs(plan, limit),
        _ => bail!("The external-discovery recipe is not supported."),
    }
}

fn fetch_artists(
    plan: &AiExternalDiscoveryPlan,
    limit: usize,
) -> Result<Vec<ExternalDiscoveryItem>> {
    let mut clauses = Vec::new();
    if plan.year_meaning == "formedYear" && plan.year > 0 {
        clauses.push(format!("begin:{}", plan.year));
        clauses.push("type:group".to_string());
    }
    append_common_clauses(&mut clauses, plan, true);
    if clauses.is_empty() {
        clauses.push("type:group".to_string());
    }
    let payload: ArtistSearchResponse =
        musicbrainz_search(MUSICBRAINZ_ARTIST_SEARCH_URL, &clauses.join(" AND "), limit)?;
    Ok(payload
        .artists
        .into_iter()
        .map(|artist| {
            let year = artist
                .life_span
                .as_ref()
                .and_then(|span| year_from_date(span.begin.as_deref()));
            let evidence = if let Some(year) = year {
                format!("MusicBrainz identifies this artist as beginning in {year}.")
            } else if !artist.disambiguation.trim().is_empty() {
                format!("MusicBrainz artist: {}.", artist.disambiguation.trim())
            } else {
                "Verified MusicBrainz artist result.".to_string()
            };
            ExternalDiscoveryItem {
                id: artist.id.clone(),
                entity: "artist".to_string(),
                title: artist.name.clone(),
                artist: artist.name,
                anchor: None,
                year,
                country: artist.country,
                item_type: artist.artist_type,
                tags: tag_names(artist.tags),
                score: score_value(&artist.score),
                evidence,
                url: format!("https://musicbrainz.org/artist/{}", artist.id),
            }
        })
        .collect())
}

fn fetch_artists_by_release(
    plan: &AiExternalDiscoveryPlan,
    limit: usize,
) -> Result<Vec<ExternalDiscoveryItem>> {
    let mut clauses = vec!["status:official".to_string()];
    if plan.year > 0 {
        clauses.push(format!("firstreleasedate:{}", plan.year));
    }
    append_common_clauses(&mut clauses, plan, false);
    let payload: ReleaseGroupSearchResponse = musicbrainz_search(
        MUSICBRAINZ_RELEASE_GROUP_SEARCH_URL,
        &clauses.join(" AND "),
        limit,
    )?;
    let mut seen_artists = HashSet::new();
    let mut results = Vec::new();
    for release in payload.release_groups {
        let release_title = release.title.clone();
        let release_year = year_from_date(release.first_release_date.as_deref());
        let score = score_value(&release.score);
        let tags = tag_names(release.tags);
        for credit in release.artist_credit {
            let artist = credit.artist;
            if artist.name.eq_ignore_ascii_case("Various Artists")
                || !seen_artists.insert(artist.id.clone())
            {
                continue;
            }
            let evidence = match release_year {
                Some(year) => format!(
                    "MusicBrainz verifies the {} release “{}” in {year}.",
                    release.primary_type.as_deref().unwrap_or("release"),
                    release_title
                ),
                None => format!("MusicBrainz verifies the release “{}”.", release_title),
            };
            results.push(ExternalDiscoveryItem {
                id: artist.id.clone(),
                entity: "artist".to_string(),
                title: artist.name.clone(),
                artist: artist.name,
                anchor: Some(release_title.clone()),
                year: release_year,
                country: artist.country,
                item_type: artist.artist_type,
                tags: if tags.is_empty() {
                    tag_names(artist.tags)
                } else {
                    tags.clone()
                },
                score,
                evidence,
                url: format!("https://musicbrainz.org/artist/{}", artist.id),
            });
        }
    }
    Ok(results)
}

fn fetch_albums(
    plan: &AiExternalDiscoveryPlan,
    limit: usize,
) -> Result<Vec<ExternalDiscoveryItem>> {
    let mut clauses = vec![
        "primarytype:album".to_string(),
        "status:official".to_string(),
    ];
    if plan.year > 0 {
        clauses.push(format!("firstreleasedate:{}", plan.year));
    }
    append_common_clauses(&mut clauses, plan, false);
    let payload: ReleaseGroupSearchResponse = musicbrainz_search(
        MUSICBRAINZ_RELEASE_GROUP_SEARCH_URL,
        &clauses.join(" AND "),
        limit,
    )?;
    Ok(payload
        .release_groups
        .into_iter()
        .map(|release| {
            let artist = artist_credit_name(&release.artist_credit);
            let year = year_from_date(release.first_release_date.as_deref());
            let evidence = match year {
                Some(year) => format!("MusicBrainz verifies this album's first release in {year}."),
                None => "Verified MusicBrainz album release group.".to_string(),
            };
            ExternalDiscoveryItem {
                id: release.id.clone(),
                entity: "album".to_string(),
                title: release.title,
                artist,
                anchor: None,
                year,
                country: None,
                item_type: release.primary_type,
                tags: tag_names(release.tags),
                score: score_value(&release.score),
                evidence: append_disambiguation(evidence, &release.disambiguation),
                url: format!("https://musicbrainz.org/release-group/{}", release.id),
            }
        })
        .collect())
}

fn fetch_songs(plan: &AiExternalDiscoveryPlan, limit: usize) -> Result<Vec<ExternalDiscoveryItem>> {
    let mut clauses = vec!["status:official".to_string(), "-video:true".to_string()];
    if plan.year > 0 {
        clauses.push(format!("firstreleasedate:{}", plan.year));
    }
    append_common_clauses(&mut clauses, plan, true);
    let payload: RecordingSearchResponse = musicbrainz_search(
        MUSICBRAINZ_RECORDING_SEARCH_URL,
        &clauses.join(" AND "),
        limit,
    )?;
    Ok(payload
        .recordings
        .into_iter()
        .map(|recording| {
            let artist = artist_credit_name(&recording.artist_credit);
            let year = year_from_date(recording.first_release_date.as_deref());
            let evidence = match year {
                Some(year) => {
                    format!("MusicBrainz verifies this recording's first release in {year}.")
                }
                None => "Verified MusicBrainz recording result.".to_string(),
            };
            ExternalDiscoveryItem {
                id: recording.id.clone(),
                entity: "song".to_string(),
                title: recording.title,
                artist,
                anchor: None,
                year,
                country: None,
                item_type: Some("Recording".to_string()),
                tags: tag_names(recording.tags),
                score: score_value(&recording.score),
                evidence: append_disambiguation(evidence, &recording.disambiguation),
                url: format!("https://musicbrainz.org/recording/{}", recording.id),
            }
        })
        .collect())
}

fn append_common_clauses(
    clauses: &mut Vec<String>,
    plan: &AiExternalDiscoveryPlan,
    supports_country: bool,
) {
    clauses.extend(
        plan.genres
            .iter()
            .map(|genre| format!("tag:{}", lucene_phrase(genre))),
    );
    if supports_country {
        clauses.extend(
            plan.countries
                .iter()
                .map(|country| format!("country:{}", lucene_phrase(country))),
        );
    }
    if !plan.keywords.trim().is_empty() {
        clauses.push(lucene_phrase(&plan.keywords));
    }
}

fn lucene_phrase(value: &str) -> String {
    let mut escaped = String::new();
    for ch in value.trim().chars() {
        if matches!(
            ch,
            '+' | '-'
                | '&'
                | '|'
                | '!'
                | '('
                | ')'
                | '{'
                | '}'
                | '['
                | ']'
                | '^'
                | '"'
                | '~'
                | '*'
                | '?'
                | ':'
                | '\\'
                | '/'
        ) {
            escaped.push('\\');
        }
        escaped.push(ch);
    }
    format!("\"{escaped}\"")
}

fn musicbrainz_search<T>(endpoint: &str, query: &str, limit: usize) -> Result<T>
where
    T: for<'de> Deserialize<'de>,
{
    let limit = limit.clamp(1, MAX_CATALOG_CANDIDATES).to_string();
    let response = ureq::get(endpoint)
        .query("query", query)
        .query("fmt", "json")
        .query("limit", &limit)
        .set("User-Agent", MUSICBRAINZ_USER_AGENT)
        .set("Accept", "application/json")
        .call()
        .map_err(|error| anyhow!("MusicBrainz search failed: {error}"))?;
    response
        .into_json::<T>()
        .context("MusicBrainz returned an unreadable search response")
}

fn artist_credit_name(credits: &[ArtistCredit]) -> String {
    let mut result = String::new();
    for credit in credits {
        let name = if credit.name.trim().is_empty() {
            credit.artist.name.as_str()
        } else {
            credit.name.as_str()
        };
        result.push_str(name);
        result.push_str(&credit.joinphrase);
    }
    result.trim().to_string()
}

fn year_from_date(value: Option<&str>) -> Option<i32> {
    let value = value?.trim();
    if value.len() < 4 {
        return None;
    }
    value[..4].parse::<i32>().ok()
}

fn score_value(value: &Value) -> i32 {
    value
        .as_i64()
        .and_then(|score| i32::try_from(score).ok())
        .or_else(|| value.as_str()?.parse::<i32>().ok())
        .unwrap_or_default()
}

fn tag_names(mut tags: Vec<CatalogTag>) -> Vec<String> {
    tags.sort_by(|left, right| right.count.cmp(&left.count));
    tags.into_iter()
        .map(|tag| tag.name.trim().to_string())
        .filter(|tag| !tag.is_empty())
        .take(5)
        .collect()
}

fn append_disambiguation(mut evidence: String, disambiguation: &str) -> String {
    let disambiguation = disambiguation.trim();
    if !disambiguation.is_empty() {
        evidence.push(' ');
        evidence.push_str(disambiguation);
        evidence.push('.');
    }
    evidence
}

fn current_library_state(conn: &Connection) -> Result<(Option<i64>, Option<String>, i64, i64)> {
    let latest = conn
        .query_row(
            "SELECT id, completed_at, album_count, track_rows FROM import_runs WHERE status = 'completed' ORDER BY COALESCE(completed_at, started_at) DESC, id DESC LIMIT 1",
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        )
        .optional()?;
    if let Some(state) = latest {
        return Ok((Some(state.0), state.1, state.2, state.3));
    }
    Ok((
        None,
        None,
        conn.query_row("SELECT COUNT(*) FROM albums", [], |row| row.get(0))?,
        conn.query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))?,
    ))
}

fn validate_response(response: &mut ExternalDiscoveryResponse) -> Result<()> {
    if response.prompt.trim().is_empty() || response.prompt.chars().count() > 2_000 {
        bail!("A saved discovery requires its original prompt.")
    }
    if response.items.is_empty() || response.items.len() > 25 {
        bail!("A saved discovery must contain between 1 and 25 results.")
    }
    if response.source != "MusicBrainz"
        || response
            .items
            .iter()
            .any(|item| !is_allowed_musicbrainz_url(&item.url))
    {
        bail!("A saved discovery contains an unsupported source.")
    }
    response.prompt = response.prompt.trim().to_string();
    response.title = response.title.trim().chars().take(120).collect();
    response.summary = response.summary.trim().chars().take(500).collect();
    Ok(())
}

fn is_allowed_musicbrainz_url(url: &str) -> bool {
    [
        "https://musicbrainz.org/artist/",
        "https://musicbrainz.org/release-group/",
        "https://musicbrainz.org/recording/",
    ]
    .iter()
    .any(|prefix| url.starts_with(prefix) && url.len() > prefix.len())
}

fn saved_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SavedExternalDiscovery> {
    let response_json: String = row.get(3)?;
    let response =
        serde_json::from_str::<ExternalDiscoveryResponse>(&response_json).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                3,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?;
    Ok(SavedExternalDiscovery {
        id: row.get(0)?,
        name: row.get(1)?,
        response,
        library_import_run_id: row.get(4)?,
        library_imported_at: row.get(5)?,
        library_album_count: row.get(6)?,
        library_track_count: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn load_saved(conn: &Connection, id: i64) -> Result<SavedExternalDiscovery> {
    conn.query_row(
        "SELECT id, name, prompt, response_json, library_import_run_id, library_imported_at, library_album_count, library_track_count, created_at, updated_at FROM saved_external_discoveries WHERE id = ?1",
        params![id],
        saved_from_row,
    )
    .with_context(|| format!("Could not load saved discovery {id}"))
}

fn list_saved(conn: &Connection) -> Result<Vec<SavedExternalDiscovery>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, prompt, response_json, library_import_run_id, library_imported_at, library_album_count, library_track_count, created_at, updated_at FROM saved_external_discoveries ORDER BY updated_at DESC, id DESC",
    )?;
    let saved = stmt
        .query_map([], saved_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(saved)
}

fn save(
    conn: &Connection,
    mut input: SaveExternalDiscoveryRequest,
) -> Result<SavedExternalDiscovery> {
    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > 120 {
        bail!("Name the discovery list with no more than 120 characters.")
    }
    validate_response(&mut input.response)?;
    let response_json = serde_json::to_string(&input.response)?;
    if response_json.len() > MAX_SAVED_RESPONSE_BYTES {
        bail!("The discovery list is too large to save.")
    }
    let state = current_library_state(conn)?;
    let now = Utc::now().to_rfc3339();
    let id = if let Some(id) = input.id {
        let changed = conn.execute(
            "UPDATE saved_external_discoveries SET name = ?1, prompt = ?2, response_json = ?3, library_import_run_id = ?4, library_imported_at = ?5, library_album_count = ?6, library_track_count = ?7, updated_at = ?8 WHERE id = ?9",
            params![name, input.response.prompt, response_json, state.0, state.1, state.2, state.3, now, id],
        )?;
        if changed == 0 {
            bail!("The saved discovery list no longer exists.")
        }
        id
    } else {
        conn.execute(
            "INSERT INTO saved_external_discoveries (name, prompt, response_json, library_import_run_id, library_imported_at, library_album_count, library_track_count, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
            params![name, input.response.prompt, response_json, state.0, state.1, state.2, state.3, now],
        )?;
        conn.last_insert_rowid()
    };
    load_saved(conn, id)
}

fn delete_saved(conn: &Connection, id: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM saved_external_discoveries WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

#[cfg(not(test))]
pub fn list_saved_for_app(app: &AppHandle) -> Result<Vec<SavedExternalDiscovery>> {
    let (conn, _) = db::open(app)?;
    list_saved(&conn)
}

#[cfg(not(test))]
pub fn save_for_app(
    app: &AppHandle,
    input: SaveExternalDiscoveryRequest,
) -> Result<SavedExternalDiscovery> {
    let (conn, _) = db::open(app)?;
    save(&conn, input)
}

#[cfg(not(test))]
pub fn delete_saved_for_app(app: &AppHandle, id: i64) -> Result<()> {
    let (conn, _) = db::open(app)?;
    delete_saved(&conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::AiUsage;

    fn plan(entity: &str, count: u32) -> AiExternalDiscoveryPlan {
        AiExternalDiscoveryPlan {
            prompt: format!("Find {count} {entity}s from 1992 that I don't have"),
            entity: entity.to_string(),
            count,
            year: 1992,
            year_meaning: "releaseYear".to_string(),
            genres: Vec::new(),
            countries: Vec::new(),
            keywords: String::new(),
            title: "Missing music from 1992".to_string(),
            summary: "Verified music from 1992 outside the local library.".to_string(),
            model: "gpt-5.6-luna".to_string(),
            usage: AiUsage {
                input_tokens: Some(100),
                cached_input_tokens: Some(25),
                output_tokens: Some(40),
            },
        }
    }

    fn candidate(id: &str, entity: &str, title: &str, artist: &str) -> ExternalDiscoveryItem {
        let path = match entity {
            "album" => "release-group",
            "song" => "recording",
            _ => "artist",
        };
        ExternalDiscoveryItem {
            id: id.to_string(),
            entity: entity.to_string(),
            title: title.to_string(),
            artist: artist.to_string(),
            anchor: None,
            year: Some(1992),
            country: None,
            item_type: None,
            tags: Vec::new(),
            score: 100,
            evidence: "Verified by MusicBrainz.".to_string(),
            url: format!("https://musicbrainz.org/{path}/{id}"),
        }
    }

    #[test]
    fn excludes_owned_artists_albums_and_songs_locally() {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::configure(&conn).unwrap();
        crate::db::migrate(&conn).unwrap();
        conn.execute(
            "INSERT INTO import_runs (source_path, started_at, status) VALUES ('test', '2026-07-16', 'running')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO albums (id, import_run_id, album, album_artist_display, total_tracks, rated_tracks, rating_completeness, total_seconds, loved_tracks, tmoe_seconds, ae_ratio) VALUES ('album-1', 1, 'Owned Album', 'Owned Artist', 1, 0, 0, 180, 0, 0, 0)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tracks (import_run_id, album_id, display_artist, title, row_hash) VALUES (1, 'album-1', 'Owned Artist', 'Owned Song', 'track-1')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tracks (import_run_id, album_id, display_artist, title, row_hash) VALUES (1, 'album-1', 'Beyoncé', 'Déjà Vu', 'track-2')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO track_search_fts (track_id, album_id, title, display_artist, album, album_artist_display, canonical_genre, publisher, file_path, filename) VALUES (2, 'album-1', 'Déjà Vu', 'Beyoncé', 'Owned Album', 'Owned Artist', '', '', '', '')",
            [],
        )
        .unwrap();

        let artist_response = build_discovery_response(
            &conn,
            plan("artist", 2),
            vec![
                candidate("a1", "artist", "Owned Artist", "Owned Artist"),
                candidate("a2", "artist", "New Artist", "New Artist"),
            ],
        )
        .unwrap();
        assert_eq!(artist_response.items[0].title, "New Artist");
        assert_eq!(artist_response.excluded_owned_count, 1);

        let album_response = build_discovery_response(
            &conn,
            plan("album", 2),
            vec![
                candidate("rg1", "album", "Owned Album", "Owned Artist"),
                candidate("rg2", "album", "New Album", "Owned Artist"),
            ],
        )
        .unwrap();
        assert_eq!(album_response.items[0].title, "New Album");

        let song_response = build_discovery_response(
            &conn,
            plan("song", 2),
            vec![
                candidate("r1", "song", "Owned Song", "Owned Artist"),
                candidate("r-accent", "song", "Deja Vu", "Beyonce"),
                candidate("r2", "song", "New Song", "Owned Artist"),
            ],
        )
        .unwrap();
        assert_eq!(song_response.items[0].title, "New Song");
        assert_eq!(song_response.excluded_owned_count, 2);
    }

    #[test]
    fn saves_and_reopens_the_exact_discovery_without_network_access() {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::configure(&conn).unwrap();
        crate::db::migrate(&conn).unwrap();
        let response = build_discovery_response(
            &conn,
            plan("album", 1),
            vec![candidate(
                "release-group-1",
                "album",
                "New Album",
                "New Artist",
            )],
        )
        .unwrap();
        let saved = save(
            &conn,
            SaveExternalDiscoveryRequest {
                id: None,
                name: "1992 discoveries".to_string(),
                response: response.clone(),
            },
        )
        .unwrap();

        let reopened = list_saved(&conn).unwrap().remove(0);
        assert_eq!(reopened.id, saved.id);
        assert_eq!(reopened.response.items, response.items);
        assert_eq!(reopened.response.fetched_at, response.fetched_at);
        delete_saved(&conn, reopened.id).unwrap();
        assert!(list_saved(&conn).unwrap().is_empty());
    }

    #[test]
    fn lucene_values_are_escaped_and_quoted() {
        assert_eq!(lucene_phrase("AC/DC: live"), "\"AC\\/DC\\: live\"");
        assert_eq!(fts_phrase("He said \"go\""), "\"He said \"\"go\"\"\"");
    }

    #[test]
    #[ignore = "makes one live MusicBrainz network request"]
    fn live_musicbrainz_release_search_is_bounded() {
        let candidates = fetch_catalog_candidates(&plan("album", 5)).unwrap();
        assert!(!candidates.is_empty());
        assert!(candidates.len() <= 60);
        assert!(candidates.iter().all(|item| item
            .url
            .starts_with("https://musicbrainz.org/release-group/")));
    }

    #[test]
    #[ignore = "makes one live MusicBrainz network request"]
    fn live_musicbrainz_artist_release_search_has_release_evidence() {
        let candidates = fetch_catalog_candidates(&plan("artist", 5)).unwrap();
        assert!(!candidates.is_empty());
        assert!(candidates.iter().all(|item| item.entity == "artist"));
        assert!(candidates.iter().all(|item| item.anchor.is_some()));
    }

    #[test]
    #[ignore = "makes one live MusicBrainz network request"]
    fn live_musicbrainz_song_search_is_bounded() {
        let candidates = fetch_catalog_candidates(&plan("song", 5)).unwrap();
        assert!(!candidates.is_empty());
        assert!(candidates.len() <= 60);
        assert!(candidates
            .iter()
            .all(|item| item.url.starts_with("https://musicbrainz.org/recording/")));
    }
}
