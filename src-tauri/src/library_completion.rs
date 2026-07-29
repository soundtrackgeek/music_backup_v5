#[cfg(not(test))]
use crate::db;
#[cfg(not(test))]
use crate::discogs;
use crate::wishlist::{self, AddWishListItemRequest};
use anyhow::{bail, Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
#[cfg(not(test))]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(not(test))]
use tauri::AppHandle;

const MAX_RETURNED_CANDIDATES: usize = 5_000;
const MAX_CANDIDATE_KEY_LENGTH: usize = 800;
const MAX_TEXT_LENGTH: usize = 300;
const MAX_VERIFICATION_SELECTION: usize = 5_000;
const RECENT_VERIFICATION_ITEMS: usize = 8;
#[cfg(not(test))]
static VERIFICATION_WORKER_RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCompletionEvidence {
    pub source: String,
    pub label: String,
    pub best_rank: i32,
    pub first_year: i32,
    pub last_year: i32,
    pub appearances: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCompletionCandidate {
    pub id: String,
    pub artist: String,
    pub title: String,
    pub chart_year: i32,
    pub confidence: String,
    pub status: String,
    pub wish_list_item_id: Option<i64>,
    pub musicbrainz_id: Option<String>,
    pub musicbrainz_url: Option<String>,
    pub cover_url: Option<String>,
    pub cover_status: Option<String>,
    pub cover_provider: Option<String>,
    pub cover_message: Option<String>,
    pub cover_checked_at: Option<String>,
    pub verification_status: String,
    pub verification_provider: Option<String>,
    pub verification_message: Option<String>,
    pub verification_checked_at: Option<String>,
    pub musicbrainz_verification_status: Option<String>,
    pub musicbrainz_verification_message: Option<String>,
    pub discogs_verification_status: Option<String>,
    pub discogs_verification_message: Option<String>,
    pub discogs_master_id: Option<String>,
    pub discogs_url: Option<String>,
    pub evidence: Vec<LibraryCompletionEvidence>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCompletionAtlasCell {
    pub source: String,
    pub label: String,
    pub decade: i32,
    pub owned: i64,
    pub candidates: i64,
    pub verified: i64,
    pub wanted: i64,
    pub needs_review: i64,
    pub excluded: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCompletionResponse {
    pub generated_at: String,
    pub total_chart_albums: usize,
    pub total_candidates: usize,
    pub returned_candidates: usize,
    pub truncated: bool,
    pub candidates: Vec<LibraryCompletionCandidate>,
    pub atlas: Vec<LibraryCompletionAtlasCell>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCompletionRequest {
    pub source: Option<String>,
    pub decade: Option<i32>,
    pub year_from: Option<i32>,
    pub year_to: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLibraryCompletionDecisionRequest {
    pub candidate_id: String,
    pub artist: String,
    pub title: String,
    pub chart_year: i32,
    pub source: String,
    pub status: String,
    pub wish_list_item_id: Option<i64>,
    pub musicbrainz_id: Option<String>,
    pub musicbrainz_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCompletionDecision {
    pub candidate_id: String,
    pub status: String,
    pub wish_list_item_id: Option<i64>,
    pub musicbrainz_id: Option<String>,
    pub musicbrainz_url: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartLibraryCompletionVerificationRequest {
    pub scope: String,
    #[serde(default)]
    pub candidate_ids: Vec<String>,
    pub source: Option<String>,
    pub decade: Option<i32>,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLibraryCompletionVerificationStateRequest {
    pub batch_id: i64,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCompletionVerificationItemSummary {
    pub candidate_id: String,
    pub artist: String,
    pub title: String,
    pub state: String,
    pub provider: String,
    pub message: Option<String>,
    pub musicbrainz_id: Option<String>,
    pub musicbrainz_url: Option<String>,
    pub musicbrainz_verification_status: Option<String>,
    pub musicbrainz_verification_message: Option<String>,
    pub discogs_verification_status: Option<String>,
    pub discogs_verification_message: Option<String>,
    pub discogs_master_id: Option<String>,
    pub discogs_url: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCompletionVerificationBatch {
    pub id: i64,
    pub label: String,
    pub source: Option<String>,
    pub decade: Option<i32>,
    pub state: String,
    pub total_count: i64,
    pub queued_count: i64,
    pub checking_count: i64,
    pub verified_count: i64,
    pub discogs_verified_count: i64,
    pub no_match_count: i64,
    pub ambiguous_count: i64,
    pub failed_count: i64,
    pub cached_count: i64,
    pub completed_count: i64,
    pub estimated_seconds_remaining: i64,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCompletionVerificationStatus {
    pub batch: Option<LibraryCompletionVerificationBatch>,
    pub recent_items: Vec<LibraryCompletionVerificationItemSummary>,
}

#[derive(Debug, Clone)]
struct SourceAlbumRow {
    source: String,
    artist_key: String,
    title_key: String,
    artist: String,
    title: String,
    first_year: i32,
    last_year: i32,
    best_rank: i32,
    appearances: i64,
    owned: bool,
}

#[derive(Debug, Clone, Default)]
struct AlbumAggregate {
    artist: String,
    title: String,
    first_year: i32,
    owned: bool,
    evidence: Vec<LibraryCompletionEvidence>,
}

#[derive(Debug, Clone, Default)]
struct AtlasCounts {
    owned: i64,
    candidates: i64,
    verified: i64,
    wanted: i64,
    needs_review: i64,
    excluded: i64,
}

#[derive(Debug, Clone)]
struct StoredDecision {
    status: String,
    wish_list_item_id: Option<i64>,
    musicbrainz_id: Option<String>,
    musicbrainz_url: Option<String>,
}

#[derive(Debug, Clone)]
struct StoredVerification {
    outcome: String,
    provider: String,
    musicbrainz_id: Option<String>,
    musicbrainz_url: Option<String>,
    musicbrainz_outcome: Option<String>,
    musicbrainz_message: Option<String>,
    discogs_outcome: Option<String>,
    discogs_message: Option<String>,
    discogs_master_id: Option<String>,
    discogs_url: Option<String>,
    cover_state: Option<String>,
    cover_provider: Option<String>,
    cover_message: Option<String>,
    cover_checked_at: Option<String>,
    message: String,
    checked_at: String,
}

#[derive(Debug, Clone)]
struct VerificationQueueItem {
    id: i64,
    batch_id: i64,
    candidate_id: String,
    artist: String,
    title: String,
    chart_year: i32,
}

#[derive(Debug, Clone)]
struct VerificationResult {
    outcome: String,
    provider: String,
    message: String,
    musicbrainz_id: Option<String>,
    musicbrainz_url: Option<String>,
    matched_artist: Option<String>,
    matched_title: Option<String>,
    matched_year: Option<i32>,
    score: Option<i32>,
    musicbrainz_outcome: Option<String>,
    musicbrainz_message: Option<String>,
    discogs_outcome: Option<String>,
    discogs_message: Option<String>,
    discogs_master_id: Option<String>,
    discogs_url: Option<String>,
}

fn source_label(source: &str) -> &'static str {
    match source {
        "billboard" => "Billboard 200",
        "officialUk" => "Official UK Albums",
        "vgLista" => "VG Lista",
        _ => "Imported chart",
    }
}

fn source_order(source: &str) -> usize {
    match source {
        "billboard" => 0,
        "officialUk" => 1,
        "vgLista" => 2,
        _ => 3,
    }
}

fn load_source_rows(conn: &Connection) -> Result<Vec<SourceAlbumRow>> {
    let mut statement = conn.prepare(
        "
        WITH chart_rows AS (
            SELECT
                'billboard' AS source,
                artist_key,
                album_key AS title_key,
                artist,
                album AS title,
                COALESCE(first_appearance_year, year) AS chart_year,
                rank,
                matched_album_id
            FROM billboard_chart_entries
            UNION ALL
            SELECT
                'officialUk' AS source,
                artist_key,
                title_key,
                artist,
                title,
                year AS chart_year,
                rank,
                matched_album_id
            FROM official_uk_album_chart_entries
            UNION ALL
            SELECT
                'vgLista' AS source,
                artist_key,
                title_key,
                artist,
                title,
                year AS chart_year,
                rank,
                matched_album_id
            FROM vg_lista_album_chart_entries
        )
        SELECT
            source,
            artist_key,
            title_key,
            MIN(artist) AS artist,
            MIN(title) AS title,
            MIN(chart_year) AS first_year,
            MAX(chart_year) AS last_year,
            MIN(rank) AS best_rank,
            COUNT(*) AS appearances,
            MAX(CASE WHEN matched_album_id IS NOT NULL THEN 1 ELSE 0 END) AS owned
        FROM chart_rows
        WHERE TRIM(artist_key) <> '' AND TRIM(title_key) <> ''
        GROUP BY source, artist_key, title_key
        ",
    )?;

    let rows = statement.query_map([], |row| {
        Ok(SourceAlbumRow {
            source: row.get(0)?,
            artist_key: row.get(1)?,
            title_key: row.get(2)?,
            artist: row.get(3)?,
            title: row.get(4)?,
            first_year: row.get(5)?,
            last_year: row.get(6)?,
            best_rank: row.get(7)?,
            appearances: row.get(8)?,
            owned: row.get::<_, i64>(9)? != 0,
        })
    })?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load album chart coverage rows")
}

fn load_decisions(conn: &Connection) -> Result<HashMap<String, StoredDecision>> {
    let mut statement = conn.prepare(
        "
        SELECT candidate_key, status, wish_list_item_id, musicbrainz_id, musicbrainz_url
        FROM library_completion_decisions
        ",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            StoredDecision {
                status: row.get(1)?,
                wish_list_item_id: row.get(2)?,
                musicbrainz_id: row.get(3)?,
                musicbrainz_url: row.get(4)?,
            },
        ))
    })?;
    Ok(rows.collect::<rusqlite::Result<HashMap<_, _>>>()?)
}

fn load_verifications(conn: &Connection) -> Result<HashMap<String, StoredVerification>> {
    let mut statement = conn.prepare(
        "
        SELECT candidate_key, outcome, verification_provider, musicbrainz_id,
               musicbrainz_url, musicbrainz_outcome, musicbrainz_message,
               discogs_outcome, discogs_message, discogs_master_id, discogs_url,
               cover_state, cover_provider, cover_message, cover_checked_at,
               message, checked_at
        FROM library_completion_verifications
        ",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            StoredVerification {
                outcome: row.get(1)?,
                provider: row.get(2)?,
                musicbrainz_id: row.get(3)?,
                musicbrainz_url: row.get(4)?,
                musicbrainz_outcome: row.get(5)?,
                musicbrainz_message: row.get(6)?,
                discogs_outcome: row.get(7)?,
                discogs_message: row.get(8)?,
                discogs_master_id: row.get(9)?,
                discogs_url: row.get(10)?,
                cover_state: row.get(11)?,
                cover_provider: row.get(12)?,
                cover_message: row.get(13)?,
                cover_checked_at: row.get(14)?,
                message: row.get(15)?,
                checked_at: row.get(16)?,
            },
        ))
    })?;
    Ok(rows.collect::<rusqlite::Result<HashMap<_, _>>>()?)
}

fn load_pending_verification_states(conn: &Connection) -> Result<HashMap<String, String>> {
    let mut statement = conn.prepare(
        "
        SELECT item.candidate_key, item.state
        FROM library_completion_verification_items item
        JOIN library_completion_verification_batches batch ON batch.id = item.batch_id
        WHERE batch.state IN ('running', 'paused')
          AND item.state IN ('queued', 'checking')
        ORDER BY batch.id DESC, item.id
        ",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut states = HashMap::new();
    for row in rows {
        let (candidate_id, state) = row?;
        states.entry(candidate_id).or_insert(state);
    }
    Ok(states)
}

fn confidence_for(aggregate: &AlbumAggregate) -> String {
    let best_rank = aggregate
        .evidence
        .iter()
        .map(|evidence| evidence.best_rank)
        .min()
        .unwrap_or(i32::MAX);
    let appearances = aggregate
        .evidence
        .iter()
        .map(|evidence| evidence.appearances)
        .sum::<i64>();
    let normalized_artist = aggregate.artist.trim().to_lowercase();
    if normalized_artist.contains("various") || normalized_artist == "v/a" {
        "needsReview".to_string()
    } else if aggregate.evidence.len() >= 2 || best_rank <= 40 {
        "best".to_string()
    } else if best_rank <= 100 || appearances >= 4 {
        "good".to_string()
    } else {
        "low".to_string()
    }
}

fn confidence_order(confidence: &str) -> usize {
    match confidence {
        "best" => 0,
        "good" => 1,
        "needsReview" => 2,
        _ => 3,
    }
}

fn decision_order(status: &str) -> usize {
    match status {
        "wanted" => 0,
        "needsReview" => 1,
        "candidate" => 2,
        "notForMe" => 3,
        _ => 4,
    }
}

fn normalize_request(
    request: Option<LibraryCompletionRequest>,
) -> Result<Option<LibraryCompletionRequest>> {
    let Some(mut request) = request else {
        return Ok(None);
    };
    request.source = request
        .source
        .take()
        .map(|source| source.trim().to_string())
        .filter(|source| !source.is_empty());
    if let Some(source) = request.source.as_deref() {
        if !matches!(source, "billboard" | "officialUk" | "vgLista") {
            bail!("The Library Completion chart source is not supported.")
        }
    }
    if let Some(decade) = request.decade {
        if request.source.is_none() {
            bail!("Choose a chart source for a Library Completion decade campaign.")
        }
        if !(1000..=3000).contains(&decade) || decade % 10 != 0 {
            bail!("The Library Completion decade is outside the supported range.")
        }
    }
    for year in [request.year_from, request.year_to].into_iter().flatten() {
        if !(1000..=3000).contains(&year) {
            bail!("The Library Completion year filter is outside the supported range.")
        }
    }
    if request
        .year_from
        .zip(request.year_to)
        .is_some_and(|(from, to)| from > to)
    {
        bail!("The Library Completion start year must not be later than the end year.")
    }
    if request.source.is_none()
        && request.decade.is_none()
        && request.year_from.is_none()
        && request.year_to.is_none()
    {
        Ok(None)
    } else {
        Ok(Some(request))
    }
}

fn get_for_connection(
    conn: &Connection,
    request: Option<LibraryCompletionRequest>,
) -> Result<LibraryCompletionResponse> {
    get_for_connection_inner(conn, request, true)
}

fn get_for_connection_inner(
    conn: &Connection,
    request: Option<LibraryCompletionRequest>,
    truncate_unscoped_candidates: bool,
) -> Result<LibraryCompletionResponse> {
    let request = normalize_request(request)?;
    let source_rows = load_source_rows(conn)?;
    let decisions = load_decisions(conn)?;
    let verifications = load_verifications(conn)?;
    let pending_verifications = load_pending_verification_states(conn)?;
    let mut albums = HashMap::<String, AlbumAggregate>::new();

    for row in source_rows {
        let candidate_id = format!("{}\u{1f}{}", row.artist_key, row.title_key);
        let aggregate = albums.entry(candidate_id).or_default();
        if aggregate.artist.is_empty() || row.first_year < aggregate.first_year {
            aggregate.artist = row.artist.clone();
            aggregate.title = row.title.clone();
            aggregate.first_year = row.first_year;
        }
        aggregate.owned |= row.owned;
        aggregate.evidence.push(LibraryCompletionEvidence {
            source: row.source.clone(),
            label: source_label(&row.source).to_string(),
            best_rank: row.best_rank,
            first_year: row.first_year,
            last_year: row.last_year,
            appearances: row.appearances,
        });
    }

    let total_chart_albums = albums.len();
    let mut atlas_counts = BTreeMap::<(String, i32), AtlasCounts>::new();
    let mut candidates = Vec::new();

    for (candidate_id, mut aggregate) in albums {
        aggregate
            .evidence
            .sort_by_key(|evidence| source_order(&evidence.source));
        let decision = decisions.get(&candidate_id);
        let verification = verifications.get(&candidate_id);
        let verification_status = pending_verifications
            .get(&candidate_id)
            .cloned()
            .or_else(|| verification.map(|value| value.outcome.clone()))
            .unwrap_or_else(|| "unverified".to_string());
        let status = decision
            .map(|value| value.status.clone())
            .unwrap_or_else(|| "candidate".to_string());

        for evidence in &aggregate.evidence {
            let decade = evidence.first_year.div_euclid(10) * 10;
            let counts = atlas_counts
                .entry((evidence.source.clone(), decade))
                .or_default();
            if aggregate.owned {
                counts.owned += 1;
            } else {
                match status.as_str() {
                    "wanted" => counts.wanted += 1,
                    "needsReview" => counts.needs_review += 1,
                    "notForMe" => counts.excluded += 1,
                    _ if verification_status == "verified" => counts.verified += 1,
                    _ if matches!(verification_status.as_str(), "noMatch" | "ambiguous") => {
                        counts.needs_review += 1
                    }
                    _ => counts.candidates += 1,
                }
            }
        }

        if aggregate.owned {
            continue;
        }

        candidates.push(LibraryCompletionCandidate {
            id: candidate_id,
            artist: aggregate.artist.clone(),
            title: aggregate.title.clone(),
            chart_year: aggregate.first_year,
            confidence: confidence_for(&aggregate),
            status,
            wish_list_item_id: decision.and_then(|value| value.wish_list_item_id),
            musicbrainz_id: decision
                .and_then(|value| value.musicbrainz_id.clone())
                .or_else(|| verification.and_then(|value| value.musicbrainz_id.clone())),
            musicbrainz_url: decision
                .and_then(|value| value.musicbrainz_url.clone())
                .or_else(|| verification.and_then(|value| value.musicbrainz_url.clone())),
            cover_url: None,
            cover_status: verification.and_then(|value| value.cover_state.clone()),
            cover_provider: verification.and_then(|value| value.cover_provider.clone()),
            cover_message: verification.and_then(|value| value.cover_message.clone()),
            cover_checked_at: verification.and_then(|value| value.cover_checked_at.clone()),
            verification_status,
            verification_provider: verification.map(|value| value.provider.clone()),
            verification_message: verification.map(|value| value.message.clone()),
            verification_checked_at: verification.map(|value| value.checked_at.clone()),
            musicbrainz_verification_status: verification
                .and_then(|value| value.musicbrainz_outcome.clone()),
            musicbrainz_verification_message: verification
                .and_then(|value| value.musicbrainz_message.clone()),
            discogs_verification_status: verification
                .and_then(|value| value.discogs_outcome.clone()),
            discogs_verification_message: verification
                .and_then(|value| value.discogs_message.clone()),
            discogs_master_id: verification.and_then(|value| value.discogs_master_id.clone()),
            discogs_url: verification.and_then(|value| value.discogs_url.clone()),
            evidence: aggregate.evidence,
        });
    }

    let total_candidates = candidates
        .iter()
        .filter(|candidate| candidate.status != "notForMe")
        .count();

    if let Some(request) = &request {
        candidates.retain(|candidate| {
            candidate.evidence.iter().any(|evidence| {
                request
                    .source
                    .as_deref()
                    .is_none_or(|source| evidence.source == source)
                    && request
                        .decade
                        .is_none_or(|decade| evidence.first_year.div_euclid(10) * 10 == decade)
                    && request
                        .year_from
                        .is_none_or(|year_from| evidence.last_year >= year_from)
                    && request
                        .year_to
                        .is_none_or(|year_to| evidence.first_year <= year_to)
            })
        });
    }

    candidates.sort_by(|left, right| {
        confidence_order(&left.confidence)
            .cmp(&confidence_order(&right.confidence))
            .then_with(|| decision_order(&left.status).cmp(&decision_order(&right.status)))
            .then_with(|| right.evidence.len().cmp(&left.evidence.len()))
            .then_with(|| {
                left.evidence
                    .iter()
                    .map(|evidence| evidence.best_rank)
                    .min()
                    .cmp(
                        &right
                            .evidence
                            .iter()
                            .map(|evidence| evidence.best_rank)
                            .min(),
                    )
            })
            .then_with(|| left.artist.to_lowercase().cmp(&right.artist.to_lowercase()))
            .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase()))
    });

    let is_atlas_campaign = request
        .as_ref()
        .is_some_and(|request| request.decade.is_some());
    let should_truncate = truncate_unscoped_candidates && !is_atlas_campaign;
    let truncated = should_truncate && candidates.len() > MAX_RETURNED_CANDIDATES;
    if should_truncate {
        candidates.truncate(MAX_RETURNED_CANDIDATES);
    }
    let returned_candidates = candidates.len();

    let mut atlas = atlas_counts
        .into_iter()
        .map(|((source, decade), counts)| LibraryCompletionAtlasCell {
            label: source_label(&source).to_string(),
            source,
            decade,
            owned: counts.owned,
            candidates: counts.candidates,
            verified: counts.verified,
            wanted: counts.wanted,
            needs_review: counts.needs_review,
            excluded: counts.excluded,
            total: counts.owned
                + counts.candidates
                + counts.verified
                + counts.wanted
                + counts.needs_review
                + counts.excluded,
        })
        .collect::<Vec<_>>();
    atlas.sort_by(|left, right| {
        source_order(&left.source)
            .cmp(&source_order(&right.source))
            .then_with(|| left.decade.cmp(&right.decade))
    });

    Ok(LibraryCompletionResponse {
        generated_at: Utc::now().to_rfc3339(),
        total_chart_albums,
        total_candidates,
        returned_candidates,
        truncated,
        candidates,
        atlas,
    })
}

fn trimmed(value: String, limit: usize) -> String {
    value.trim().chars().take(limit).collect()
}

fn validate_decision_request(request: &mut SetLibraryCompletionDecisionRequest) -> Result<()> {
    request.candidate_id = trimmed(
        std::mem::take(&mut request.candidate_id),
        MAX_CANDIDATE_KEY_LENGTH,
    );
    request.artist = trimmed(std::mem::take(&mut request.artist), MAX_TEXT_LENGTH);
    request.title = trimmed(std::mem::take(&mut request.title), MAX_TEXT_LENGTH);
    request.source = trimmed(std::mem::take(&mut request.source), 80);
    if request.candidate_id.is_empty() || request.artist.is_empty() || request.title.is_empty() {
        bail!("The Library Completion candidate is incomplete.")
    }
    if !(1000..=3000).contains(&request.chart_year) {
        bail!("The Library Completion chart year is outside the supported range.")
    }
    if !matches!(
        request.status.as_str(),
        "candidate" | "wanted" | "notForMe" | "needsReview"
    ) {
        bail!("The Library Completion decision is not supported.")
    }
    request.musicbrainz_id = request
        .musicbrainz_id
        .take()
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty());
    request.musicbrainz_url = request
        .musicbrainz_url
        .take()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    Ok(())
}

fn save_verification_result(
    conn: &Connection,
    candidate_id: &str,
    artist: &str,
    title: &str,
    chart_year: i32,
    result: &VerificationResult,
) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "
        INSERT INTO library_completion_verifications (
            candidate_key, outcome, artist, title, chart_year, musicbrainz_id,
            musicbrainz_url, matched_artist, matched_title, matched_year, score,
            message, verification_provider, musicbrainz_outcome, musicbrainz_message,
            discogs_outcome, discogs_message, discogs_master_id, discogs_url,
            attempt_count, checked_at, updated_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
            ?14, ?15, ?16, ?17, ?18, ?19, 1, ?20, ?20
        )
        ON CONFLICT(candidate_key) DO UPDATE SET
            outcome = excluded.outcome,
            artist = excluded.artist,
            title = excluded.title,
            chart_year = excluded.chart_year,
            musicbrainz_id = excluded.musicbrainz_id,
            musicbrainz_url = excluded.musicbrainz_url,
            matched_artist = excluded.matched_artist,
            matched_title = excluded.matched_title,
            matched_year = excluded.matched_year,
            score = excluded.score,
            message = excluded.message,
            verification_provider = excluded.verification_provider,
            musicbrainz_outcome = excluded.musicbrainz_outcome,
            musicbrainz_message = excluded.musicbrainz_message,
            discogs_outcome = excluded.discogs_outcome,
            discogs_message = excluded.discogs_message,
            discogs_master_id = excluded.discogs_master_id,
            discogs_url = excluded.discogs_url,
            attempt_count = library_completion_verifications.attempt_count + 1,
            checked_at = excluded.checked_at,
            updated_at = excluded.updated_at
        ",
        params![
            candidate_id,
            result.outcome,
            artist,
            title,
            chart_year,
            result.musicbrainz_id,
            result.musicbrainz_url,
            result.matched_artist,
            result.matched_title,
            result.matched_year,
            result.score,
            result.message,
            result.provider,
            result.musicbrainz_outcome,
            result.musicbrainz_message,
            result.discogs_outcome,
            result.discogs_message,
            result.discogs_master_id,
            result.discogs_url,
            now,
        ],
    )?;
    Ok(())
}

fn set_decision_for_connection(
    conn: &Connection,
    mut request: SetLibraryCompletionDecisionRequest,
) -> Result<LibraryCompletionDecision> {
    validate_decision_request(&mut request)?;
    if request.status == "candidate" {
        conn.execute(
            "DELETE FROM library_completion_decisions WHERE candidate_key = ?1",
            params![request.candidate_id],
        )?;
        return Ok(LibraryCompletionDecision {
            candidate_id: request.candidate_id,
            status: request.status,
            wish_list_item_id: None,
            musicbrainz_id: request.musicbrainz_id,
            musicbrainz_url: request.musicbrainz_url,
            updated_at: Utc::now().to_rfc3339(),
        });
    }

    let wish_list_item_id = if request.status == "wanted" {
        if let Some(id) = request.wish_list_item_id {
            let exists = conn
                .query_row(
                    "SELECT id FROM wish_list_items WHERE id = ?1",
                    params![id],
                    |row| row.get::<_, i64>(0),
                )
                .optional()?;
            Some(exists.context("The selected Wish List item no longer exists.")?)
        } else {
            Some(
                wishlist::add_for_connection(
                    conn,
                    AddWishListItemRequest {
                        entity: "album".to_string(),
                        title: request.title.clone(),
                        artist: request.artist.clone(),
                        year: Some(request.chart_year),
                        musicbrainz_id: request.musicbrainz_id.clone(),
                        musicbrainz_url: request.musicbrainz_url.clone(),
                        source: format!(
                            "Library Completion · {}",
                            if request.source.is_empty() {
                                "Chart scan"
                            } else {
                                request.source.as_str()
                            }
                        ),
                    },
                )?
                .id,
            )
        }
    } else {
        None
    };

    if request.musicbrainz_id.is_some() {
        save_verification_result(
            conn,
            &request.candidate_id,
            &request.artist,
            &request.title,
            request.chart_year,
            &VerificationResult {
                outcome: "verified".to_string(),
                provider: "musicbrainz".to_string(),
                message: "MusicBrainz confirmed an official studio-album release group."
                    .to_string(),
                musicbrainz_id: request.musicbrainz_id.clone(),
                musicbrainz_url: request.musicbrainz_url.clone(),
                matched_artist: Some(request.artist.clone()),
                matched_title: Some(request.title.clone()),
                matched_year: Some(request.chart_year),
                score: None,
                musicbrainz_outcome: Some("verified".to_string()),
                musicbrainz_message: Some(
                    "MusicBrainz confirmed an official studio-album release group.".to_string(),
                ),
                discogs_outcome: None,
                discogs_message: None,
                discogs_master_id: None,
                discogs_url: None,
            },
        )?;
    }

    let updated_at = Utc::now().to_rfc3339();
    conn.execute(
        "
        INSERT INTO library_completion_decisions (
            candidate_key, status, artist, title, chart_year, wish_list_item_id,
            musicbrainz_id, musicbrainz_url, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        ON CONFLICT(candidate_key) DO UPDATE SET
            status = excluded.status,
            artist = excluded.artist,
            title = excluded.title,
            chart_year = excluded.chart_year,
            wish_list_item_id = excluded.wish_list_item_id,
            musicbrainz_id = COALESCE(excluded.musicbrainz_id, library_completion_decisions.musicbrainz_id),
            musicbrainz_url = COALESCE(excluded.musicbrainz_url, library_completion_decisions.musicbrainz_url),
            updated_at = excluded.updated_at
        ",
        params![
            request.candidate_id,
            request.status,
            request.artist,
            request.title,
            request.chart_year,
            wish_list_item_id,
            request.musicbrainz_id,
            request.musicbrainz_url,
            updated_at,
        ],
    )?;

    Ok(LibraryCompletionDecision {
        candidate_id: request.candidate_id,
        status: request.status,
        wish_list_item_id,
        musicbrainz_id: request.musicbrainz_id,
        musicbrainz_url: request.musicbrainz_url,
        updated_at,
    })
}

fn normalize_verification_request(
    mut request: StartLibraryCompletionVerificationRequest,
) -> Result<StartLibraryCompletionVerificationRequest> {
    request.scope = request.scope.trim().to_string();
    if !matches!(
        request.scope.as_str(),
        "candidate" | "selection" | "campaign"
    ) {
        bail!("Choose a candidate, selection, or Coverage Atlas campaign to verify.")
    }
    if request.candidate_ids.len() > MAX_VERIFICATION_SELECTION {
        bail!("A verification selection can contain at most {MAX_VERIFICATION_SELECTION} albums.")
    }
    let mut seen = HashSet::new();
    request.candidate_ids = request
        .candidate_ids
        .into_iter()
        .map(|candidate_id| trimmed(candidate_id, MAX_CANDIDATE_KEY_LENGTH))
        .filter(|candidate_id| !candidate_id.is_empty() && seen.insert(candidate_id.clone()))
        .collect();
    request.source = request
        .source
        .take()
        .map(|source| source.trim().to_string())
        .filter(|source| !source.is_empty());
    request.label = request
        .label
        .take()
        .map(|label| trimmed(label, 120))
        .filter(|label| !label.is_empty());

    match request.scope.as_str() {
        "campaign" => {
            normalize_request(Some(LibraryCompletionRequest {
                source: request.source.clone(),
                decade: request.decade,
                ..Default::default()
            }))?;
        }
        _ if request.candidate_ids.is_empty() => {
            bail!("Select at least one Library Completion candidate to verify.")
        }
        _ => {}
    }
    Ok(request)
}

fn active_verification_batch_id(conn: &Connection) -> Result<Option<i64>> {
    conn.query_row(
        "
        SELECT id
        FROM library_completion_verification_batches
        WHERE state IN ('running', 'paused')
        ORDER BY id DESC
        LIMIT 1
        ",
        [],
        |row| row.get(0),
    )
    .optional()
    .context("Could not inspect the active Library Completion verification batch")
}

fn candidates_for_verification(
    conn: &Connection,
    request: &StartLibraryCompletionVerificationRequest,
) -> Result<Vec<LibraryCompletionCandidate>> {
    let completion_request = (request.scope == "campaign").then(|| LibraryCompletionRequest {
        source: request.source.clone(),
        decade: request.decade,
        ..Default::default()
    });
    let mut candidates = get_for_connection_inner(conn, completion_request, false)?.candidates;
    if request.scope != "campaign" {
        let selected = request.candidate_ids.iter().collect::<HashSet<_>>();
        candidates.retain(|candidate| selected.contains(&candidate.id));
    }
    candidates.retain(|candidate| {
        (if request.scope == "campaign" {
            candidate.status == "candidate"
        } else {
            candidate.status != "notForMe"
        }) && (matches!(
            candidate.verification_status.as_str(),
            "unverified" | "failed"
        ) || (matches!(
            candidate.verification_status.as_str(),
            "noMatch" | "ambiguous"
        ) && candidate.discogs_verification_status.is_none()))
    });
    Ok(candidates)
}

fn start_verification_for_connection(
    conn: &mut Connection,
    request: StartLibraryCompletionVerificationRequest,
) -> Result<LibraryCompletionVerificationStatus> {
    let request = normalize_verification_request(request)?;
    if active_verification_batch_id(conn)?.is_some() {
        bail!("Finish the current verification batch before starting another one.")
    }
    let candidates = candidates_for_verification(conn, &request)?;
    if candidates.is_empty() {
        bail!("Every album in this scope is already checked or no longer open for verification.")
    }

    let label = request
        .label
        .clone()
        .unwrap_or_else(|| match request.scope.as_str() {
            "campaign" => format!(
                "{} · {}s",
                source_label(request.source.as_deref().unwrap_or_default()),
                request.decade.unwrap_or_default()
            ),
            "candidate" => format!("{} — {}", candidates[0].artist, candidates[0].title),
            _ => format!("Selected albums ({})", candidates.len()),
        });
    let now = Utc::now().to_rfc3339();
    let transaction = conn.transaction()?;
    transaction.execute(
        "
        INSERT INTO library_completion_verification_batches (
            label, source, decade, state, total_count, cached_count,
            created_at, started_at, updated_at
        ) VALUES (?1, ?2, ?3, 'running', ?4, 0, ?5, ?5, ?5)
        ",
        params![
            request.label.as_deref().unwrap_or(&label),
            request.source,
            request.decade,
            candidates.len() as i64,
            now
        ],
    )?;
    let batch_id = transaction.last_insert_rowid();
    for candidate in candidates {
        transaction.execute(
            "
            INSERT INTO library_completion_verification_items (
                batch_id, candidate_key, artist, title, chart_year, source,
                state, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'queued', ?7)
            ",
            params![
                batch_id,
                candidate.id,
                candidate.artist,
                candidate.title,
                candidate.chart_year,
                candidate
                    .evidence
                    .iter()
                    .map(|evidence| evidence.label.as_str())
                    .collect::<Vec<_>>()
                    .join(", "),
                now,
            ],
        )?;
    }
    transaction.commit()?;
    verification_status_for_connection(conn, Some(batch_id))
}

fn verification_batch_for_connection(
    conn: &Connection,
    batch_id: Option<i64>,
) -> Result<Option<LibraryCompletionVerificationBatch>> {
    let selected_id = match batch_id {
        Some(batch_id) => Some(batch_id),
        None => conn
            .query_row(
                "
                SELECT id
                FROM library_completion_verification_batches
                ORDER BY CASE WHEN state IN ('running', 'paused') THEN 0 ELSE 1 END, id DESC
                LIMIT 1
                ",
                [],
                |row| row.get(0),
            )
            .optional()?,
    };
    let Some(selected_id) = selected_id else {
        return Ok(None);
    };

    conn.query_row(
        "
        SELECT
            batch.id,
            batch.label,
            batch.source,
            batch.decade,
            batch.state,
            batch.total_count,
            SUM(CASE WHEN item.state = 'queued' THEN 1 ELSE 0 END),
            SUM(CASE WHEN item.state = 'checking' THEN 1 ELSE 0 END),
            SUM(CASE WHEN item.state = 'verified' THEN 1 ELSE 0 END),
            SUM(CASE WHEN item.state = 'verified' AND verification.verification_provider = 'discogs' THEN 1 ELSE 0 END),
            SUM(CASE WHEN item.state = 'noMatch' THEN 1 ELSE 0 END),
            SUM(CASE WHEN item.state = 'ambiguous' THEN 1 ELSE 0 END),
            SUM(CASE WHEN item.state = 'failed' THEN 1 ELSE 0 END),
            batch.cached_count,
            batch.created_at,
            batch.updated_at,
            batch.completed_at
        FROM library_completion_verification_batches batch
        LEFT JOIN library_completion_verification_items item ON item.batch_id = batch.id
        LEFT JOIN library_completion_verifications verification
            ON verification.candidate_key = item.candidate_key
        WHERE batch.id = ?1
        GROUP BY batch.id
        ",
        params![selected_id],
        |row| {
            let total_count = row.get::<_, i64>(5)?;
            let queued_count = row.get::<_, i64>(6)?;
            let checking_count = row.get::<_, i64>(7)?;
            let verified_count = row.get::<_, i64>(8)?;
            let discogs_verified_count = row.get::<_, i64>(9)?;
            let no_match_count = row.get::<_, i64>(10)?;
            let ambiguous_count = row.get::<_, i64>(11)?;
            let failed_count = row.get::<_, i64>(12)?;
            Ok(LibraryCompletionVerificationBatch {
                id: row.get(0)?,
                label: row.get(1)?,
                source: row.get(2)?,
                decade: row.get(3)?,
                state: row.get(4)?,
                total_count,
                queued_count,
                checking_count,
                verified_count,
                discogs_verified_count,
                no_match_count,
                ambiguous_count,
                failed_count,
                cached_count: row.get(13)?,
                completed_count: total_count - queued_count - checking_count,
                estimated_seconds_remaining: (queued_count + checking_count) * 6,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
                completed_at: row.get(16)?,
            })
        },
    )
    .optional()
    .context("Could not load the Library Completion verification batch")
}

fn verification_status_for_connection(
    conn: &Connection,
    batch_id: Option<i64>,
) -> Result<LibraryCompletionVerificationStatus> {
    let batch = verification_batch_for_connection(conn, batch_id)?;
    let Some(batch_id) = batch.as_ref().map(|batch| batch.id) else {
        return Ok(LibraryCompletionVerificationStatus {
            batch: None,
            recent_items: Vec::new(),
        });
    };
    let mut statement = conn.prepare(
        "
        SELECT
            item.candidate_key,
            item.artist,
            item.title,
            item.state,
            item.provider,
            CASE WHEN item.state = 'failed' THEN item.last_error ELSE verification.message END,
            verification.musicbrainz_id,
            verification.musicbrainz_url,
            verification.musicbrainz_outcome,
            verification.musicbrainz_message,
            verification.discogs_outcome,
            verification.discogs_message,
            verification.discogs_master_id,
            verification.discogs_url,
            COALESCE(item.finished_at, item.started_at, item.created_at)
        FROM library_completion_verification_items item
        LEFT JOIN library_completion_verifications verification
            ON verification.candidate_key = item.candidate_key
        WHERE item.batch_id = ?1
        ORDER BY CASE WHEN item.state = 'checking' THEN 0 ELSE 1 END,
                 COALESCE(item.finished_at, item.started_at, item.created_at) DESC,
                 item.id DESC
        LIMIT ?2
        ",
    )?;
    let rows = statement.query_map(params![batch_id, RECENT_VERIFICATION_ITEMS as i64], |row| {
        Ok(LibraryCompletionVerificationItemSummary {
            candidate_id: row.get(0)?,
            artist: row.get(1)?,
            title: row.get(2)?,
            state: row.get(3)?,
            provider: row.get(4)?,
            message: row.get(5)?,
            musicbrainz_id: row.get(6)?,
            musicbrainz_url: row.get(7)?,
            musicbrainz_verification_status: row.get(8)?,
            musicbrainz_verification_message: row.get(9)?,
            discogs_verification_status: row.get(10)?,
            discogs_verification_message: row.get(11)?,
            discogs_master_id: row.get(12)?,
            discogs_url: row.get(13)?,
            updated_at: row.get(14)?,
        })
    })?;
    Ok(LibraryCompletionVerificationStatus {
        batch,
        recent_items: rows.collect::<rusqlite::Result<Vec<_>>>()?,
    })
}

fn set_verification_state_for_connection(
    conn: &Connection,
    request: SetLibraryCompletionVerificationStateRequest,
) -> Result<LibraryCompletionVerificationStatus> {
    let state = request.state.trim();
    if !matches!(state, "running" | "paused") {
        bail!("A verification batch can only be running or paused.")
    }
    let changed = conn.execute(
        "
        UPDATE library_completion_verification_batches
        SET state = ?1, updated_at = ?2
        WHERE id = ?3 AND state IN ('running', 'paused')
        ",
        params![state, Utc::now().to_rfc3339(), request.batch_id],
    )?;
    if changed == 0 {
        bail!("The selected verification batch is already complete or no longer exists.")
    }
    verification_status_for_connection(conn, Some(request.batch_id))
}

fn retry_verification_failures_for_connection(
    conn: &mut Connection,
    batch_id: i64,
) -> Result<LibraryCompletionVerificationStatus> {
    let now = Utc::now().to_rfc3339();
    let transaction = conn.transaction()?;
    transaction.execute(
        "
        DELETE FROM library_completion_verifications
        WHERE outcome = 'failed'
          AND candidate_key IN (
              SELECT candidate_key
              FROM library_completion_verification_items
              WHERE batch_id = ?1 AND state = 'failed'
          )
        ",
        params![batch_id],
    )?;
    let changed = transaction.execute(
        "
        UPDATE library_completion_verification_items
        SET state = 'queued', provider = 'musicbrainz', last_error = NULL,
            started_at = NULL, finished_at = NULL
        WHERE batch_id = ?1 AND state = 'failed'
        ",
        params![batch_id],
    )?;
    if changed == 0 {
        bail!("This verification batch has no failed checks to retry.")
    }
    transaction.execute(
        "
        UPDATE library_completion_verification_batches
        SET state = 'running', updated_at = ?1, completed_at = NULL
        WHERE id = ?2
        ",
        params![now, batch_id],
    )?;
    transaction.commit()?;
    verification_status_for_connection(conn, Some(batch_id))
}

fn recover_interrupted_verifications(conn: &Connection) -> Result<()> {
    conn.execute(
        "
        UPDATE library_completion_verification_items
        SET state = 'queued', provider = 'musicbrainz', started_at = NULL
        WHERE state = 'checking'
          AND batch_id IN (
              SELECT id FROM library_completion_verification_batches WHERE state = 'running'
          )
        ",
        [],
    )?;
    Ok(())
}

fn claim_next_verification(conn: &mut Connection) -> Result<Option<VerificationQueueItem>> {
    loop {
        let batch_id = conn
            .query_row(
                "
                SELECT id
                FROM library_completion_verification_batches
                WHERE state = 'running'
                ORDER BY id
                LIMIT 1
                ",
                [],
                |row| row.get::<_, i64>(0),
            )
            .optional()?;
        let Some(batch_id) = batch_id else {
            return Ok(None);
        };
        let transaction = conn.transaction()?;
        let item = transaction
            .query_row(
                "
                SELECT id, batch_id, candidate_key, artist, title, chart_year
                FROM library_completion_verification_items
                WHERE batch_id = ?1 AND state = 'queued'
                ORDER BY id
                LIMIT 1
                ",
                params![batch_id],
                |row| {
                    Ok(VerificationQueueItem {
                        id: row.get(0)?,
                        batch_id: row.get(1)?,
                        candidate_id: row.get(2)?,
                        artist: row.get(3)?,
                        title: row.get(4)?,
                        chart_year: row.get(5)?,
                    })
                },
            )
            .optional()?;
        let Some(item) = item else {
            transaction.execute(
                "
                UPDATE library_completion_verification_batches
                SET state = 'completed', completed_at = ?1, updated_at = ?1
                WHERE id = ?2 AND NOT EXISTS (
                    SELECT 1 FROM library_completion_verification_items
                    WHERE batch_id = ?2 AND state IN ('queued', 'checking')
                )
                ",
                params![Utc::now().to_rfc3339(), batch_id],
            )?;
            transaction.commit()?;
            continue;
        };
        let now = Utc::now().to_rfc3339();
        transaction.execute(
            "
            UPDATE library_completion_verification_items
            SET state = 'checking', attempt_count = attempt_count + 1, started_at = ?1
            WHERE id = ?2
            ",
            params![now, item.id],
        )?;
        transaction.execute(
            "UPDATE library_completion_verification_batches SET updated_at = ?1 WHERE id = ?2",
            params![now, batch_id],
        )?;
        transaction.commit()?;
        return Ok(Some(item));
    }
}

fn complete_verification_item(
    conn: &mut Connection,
    item: &VerificationQueueItem,
    result: &VerificationResult,
) -> Result<()> {
    let transaction = conn.transaction()?;
    save_verification_result(
        &transaction,
        &item.candidate_id,
        &item.artist,
        &item.title,
        item.chart_year,
        result,
    )?;
    let now = Utc::now().to_rfc3339();
    transaction.execute(
        "
        UPDATE library_completion_verification_items
        SET state = ?1, provider = ?2, last_error = ?3, finished_at = ?4
        WHERE id = ?5
        ",
        params![
            result.outcome,
            result.provider,
            (result.outcome == "failed").then_some(result.message.as_str()),
            now,
            item.id,
        ],
    )?;
    transaction.execute(
        "
        UPDATE library_completion_verification_batches
        SET
            state = CASE WHEN NOT EXISTS (
                SELECT 1 FROM library_completion_verification_items
                WHERE batch_id = ?1 AND state IN ('queued', 'checking')
            ) THEN 'completed' ELSE state END,
            completed_at = CASE WHEN NOT EXISTS (
                SELECT 1 FROM library_completion_verification_items
                WHERE batch_id = ?1 AND state IN ('queued', 'checking')
            ) THEN ?2 ELSE completed_at END,
            updated_at = ?2
        WHERE id = ?1
        ",
        params![item.batch_id, now],
    )?;
    transaction.commit()?;
    Ok(())
}

#[cfg(not(test))]
fn set_checking_provider(conn: &Connection, item_id: i64, provider: &str) -> Result<()> {
    conn.execute(
        "UPDATE library_completion_verification_items SET provider = ?1 WHERE id = ?2 AND state = 'checking'",
        params![provider, item_id],
    )?;
    Ok(())
}

#[cfg(not(test))]
fn verify_with_musicbrainz(item: &VerificationQueueItem) -> VerificationResult {
    let response = match wishlist::search_musicbrainz_for_wishlist(
        wishlist::WishListMusicBrainzSearchRequest {
            entity: "album".to_string(),
            query: item.title.clone(),
            artist: item.artist.clone(),
            year: Some(item.chart_year),
        },
    ) {
        Ok(response) => response,
        Err(error) => {
            return VerificationResult {
                outcome: "failed".to_string(),
                provider: "musicbrainz".to_string(),
                message: format!("MusicBrainz search failed: {error}"),
                musicbrainz_id: None,
                musicbrainz_url: None,
                matched_artist: None,
                matched_title: None,
                matched_year: None,
                score: None,
                musicbrainz_outcome: Some("failed".to_string()),
                musicbrainz_message: Some(format!("MusicBrainz search failed: {error}")),
                discogs_outcome: None,
                discogs_message: None,
                discogs_master_id: None,
                discogs_url: None,
            };
        }
    };

    let exact_matches = response
        .candidates
        .into_iter()
        .filter(|candidate| {
            wishlist::normalize_key(&candidate.artist) == wishlist::normalize_key(&item.artist)
                && wishlist::normalize_key(&candidate.title) == wishlist::normalize_key(&item.title)
        })
        .collect::<Vec<_>>();
    if exact_matches.is_empty() {
        return VerificationResult {
            outcome: "noMatch".to_string(),
            provider: "musicbrainz".to_string(),
            message: "MusicBrainz returned no exact artist and primary Album title match."
                .to_string(),
            musicbrainz_id: None,
            musicbrainz_url: None,
            matched_artist: None,
            matched_title: None,
            matched_year: None,
            score: None,
            musicbrainz_outcome: Some("noMatch".to_string()),
            musicbrainz_message: Some(
                "MusicBrainz returned no exact artist and primary Album title match.".to_string(),
            ),
            discogs_outcome: None,
            discogs_message: None,
            discogs_master_id: None,
            discogs_url: None,
        };
    }
    if exact_matches.len() > 1 {
        return VerificationResult {
            outcome: "ambiguous".to_string(),
            provider: "musicbrainz".to_string(),
            message: format!(
                "MusicBrainz returned {} exact studio-album candidates; choose the correct release group manually.",
                exact_matches.len()
            ),
            musicbrainz_id: None,
            musicbrainz_url: None,
            matched_artist: None,
            matched_title: None,
            matched_year: None,
            score: None,
            musicbrainz_outcome: Some("ambiguous".to_string()),
            musicbrainz_message: Some(format!(
                "MusicBrainz returned {} exact studio-album candidates; choose the correct release group manually.",
                exact_matches.len()
            )),
            discogs_outcome: None,
            discogs_message: None,
            discogs_master_id: None,
            discogs_url: None,
        };
    }

    let candidate = exact_matches.into_iter().next().expect("one exact match");
    match wishlist::validate_musicbrainz_album_candidate(candidate.clone()) {
        Ok(confirmed) => VerificationResult {
            outcome: "verified".to_string(),
            provider: "musicbrainz".to_string(),
            message: "MusicBrainz confirmed a primary Album release group without secondary types and with an official release.".to_string(),
            musicbrainz_id: Some(confirmed.musicbrainz_id),
            musicbrainz_url: Some(confirmed.musicbrainz_url),
            matched_artist: Some(confirmed.artist),
            matched_title: Some(confirmed.title),
            matched_year: confirmed.year,
            score: Some(confirmed.score),
            musicbrainz_outcome: Some("verified".to_string()),
            musicbrainz_message: Some("MusicBrainz confirmed a primary Album release group without secondary types and with an official release.".to_string()),
            discogs_outcome: None,
            discogs_message: None,
            discogs_master_id: None,
            discogs_url: None,
        },
        Err(error) => {
            let message = error.to_string();
            let normalized = message.to_lowercase();
            let outcome = if normalized.contains("no official release")
                || normalized.contains("rather than a studio album")
                || normalized.contains("is not an album")
            {
                "noMatch"
            } else {
                "failed"
            };
            VerificationResult {
                outcome: outcome.to_string(),
                provider: "musicbrainz".to_string(),
                message: message.clone(),
                musicbrainz_id: None,
                musicbrainz_url: None,
                matched_artist: Some(candidate.artist),
                matched_title: Some(candidate.title),
                matched_year: candidate.year,
                score: Some(candidate.score),
                musicbrainz_outcome: Some(outcome.to_string()),
                musicbrainz_message: Some(message.clone()),
                discogs_outcome: None,
                discogs_message: None,
                discogs_master_id: None,
                discogs_url: None,
            }
        }
    }
}

#[cfg(not(test))]
fn discogs_failure_result(
    musicbrainz: &VerificationResult,
    error: impl std::fmt::Display,
) -> VerificationResult {
    let message = format!("Discogs fallback failed: {error}");
    VerificationResult {
        outcome: "failed".to_string(),
        provider: "discogs".to_string(),
        message: message.clone(),
        musicbrainz_id: musicbrainz.musicbrainz_id.clone(),
        musicbrainz_url: musicbrainz.musicbrainz_url.clone(),
        matched_artist: musicbrainz.matched_artist.clone(),
        matched_title: musicbrainz.matched_title.clone(),
        matched_year: musicbrainz.matched_year,
        score: musicbrainz.score,
        musicbrainz_outcome: musicbrainz.musicbrainz_outcome.clone(),
        musicbrainz_message: musicbrainz.musicbrainz_message.clone(),
        discogs_outcome: Some("failed".to_string()),
        discogs_message: Some(message),
        discogs_master_id: None,
        discogs_url: None,
    }
}

#[cfg(not(test))]
fn verify_with_discogs(
    item: &VerificationQueueItem,
    musicbrainz: &VerificationResult,
) -> VerificationResult {
    match discogs::verify_album(&item.artist, &item.title, item.chart_year) {
        Ok(verification) => VerificationResult {
            outcome: verification.outcome.clone(),
            provider: "discogs".to_string(),
            message: verification.message.clone(),
            musicbrainz_id: musicbrainz.musicbrainz_id.clone(),
            musicbrainz_url: musicbrainz.musicbrainz_url.clone(),
            matched_artist: verification.matched_artist,
            matched_title: verification.matched_title,
            matched_year: verification.matched_year,
            score: None,
            musicbrainz_outcome: musicbrainz.musicbrainz_outcome.clone(),
            musicbrainz_message: musicbrainz.musicbrainz_message.clone(),
            discogs_outcome: Some(verification.outcome),
            discogs_message: Some(verification.message),
            discogs_master_id: verification.master_id,
            discogs_url: verification.discogs_url,
        },
        Err(error) => discogs_failure_result(musicbrainz, error),
    }
}

#[cfg(not(test))]
fn verification_worker_loop(app: &AppHandle) -> Result<()> {
    {
        let (conn, _) = db::open(app)?;
        recover_interrupted_verifications(&conn)?;
    }
    loop {
        let item = {
            let (mut conn, _) = db::open(app)?;
            claim_next_verification(&mut conn)?
        };
        let Some(item) = item else {
            return Ok(());
        };
        let musicbrainz_result = verify_with_musicbrainz(&item);
        let should_fallback =
            matches!(musicbrainz_result.outcome.as_str(), "noMatch" | "ambiguous");
        let result = if should_fallback {
            match discogs::is_configured() {
                Ok(true) => {
                    let (conn, _) = db::open(app)?;
                    set_checking_provider(&conn, item.id, "discogs")?;
                    drop(conn);
                    verify_with_discogs(&item, &musicbrainz_result)
                }
                Ok(false) => musicbrainz_result,
                Err(error) => discogs_failure_result(&musicbrainz_result, error),
            }
        } else {
            musicbrainz_result
        };
        let (mut conn, _) = db::open(app)?;
        complete_verification_item(&mut conn, &item, &result)?;
    }
}

#[cfg(not(test))]
fn has_running_verification_for_app(app: &AppHandle) -> bool {
    db::open(app)
        .and_then(|(conn, _)| active_verification_batch_id(&conn))
        .ok()
        .flatten()
        .is_some_and(|batch_id| {
            db::open(app)
                .and_then(|(conn, _)| verification_batch_for_connection(&conn, Some(batch_id)))
                .ok()
                .flatten()
                .is_some_and(|batch| batch.state == "running")
        })
}

#[cfg(not(test))]
pub fn resume_verification_worker(app: AppHandle) {
    if VERIFICATION_WORKER_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = verification_worker_loop(&app) {
            eprintln!("Library Completion verification worker stopped: {error:#}");
        }
        VERIFICATION_WORKER_RUNNING.store(false, Ordering::SeqCst);
        if has_running_verification_for_app(&app) {
            resume_verification_worker(app);
        }
    });
}

#[cfg(not(test))]
pub fn verification_status_for_app(app: &AppHandle) -> Result<LibraryCompletionVerificationStatus> {
    let (conn, _) = db::open(app)?;
    verification_status_for_connection(&conn, None)
}

#[cfg(not(test))]
pub fn start_verification_for_app(
    app: &AppHandle,
    request: StartLibraryCompletionVerificationRequest,
) -> Result<LibraryCompletionVerificationStatus> {
    let (mut conn, _) = db::open(app)?;
    let status = start_verification_for_connection(&mut conn, request)?;
    resume_verification_worker(app.clone());
    Ok(status)
}

#[cfg(not(test))]
pub fn set_verification_state_for_app(
    app: &AppHandle,
    request: SetLibraryCompletionVerificationStateRequest,
) -> Result<LibraryCompletionVerificationStatus> {
    let should_resume = request.state.trim() == "running";
    let (conn, _) = db::open(app)?;
    let status = set_verification_state_for_connection(&conn, request)?;
    if should_resume {
        resume_verification_worker(app.clone());
    }
    Ok(status)
}

#[cfg(not(test))]
pub fn retry_verification_failures_for_app(
    app: &AppHandle,
    batch_id: i64,
) -> Result<LibraryCompletionVerificationStatus> {
    let (mut conn, _) = db::open(app)?;
    let status = retry_verification_failures_for_connection(&mut conn, batch_id)?;
    resume_verification_worker(app.clone());
    Ok(status)
}

#[cfg(not(test))]
pub fn get_for_app(
    app: &AppHandle,
    request: Option<LibraryCompletionRequest>,
) -> Result<LibraryCompletionResponse> {
    let (conn, _) = db::open(app)?;
    get_for_connection(&conn, request)
}

#[cfg(not(test))]
pub fn set_decision_for_app(
    app: &AppHandle,
    request: SetLibraryCompletionDecisionRequest,
) -> Result<LibraryCompletionDecision> {
    let (conn, _) = db::open(app)?;
    set_decision_for_connection(&conn, request)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn connection() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        crate::db::configure(&conn).expect("configure database");
        crate::db::migrate(&conn).expect("migrate database");
        conn
    }

    fn insert_billboard_candidate(conn: &Connection) {
        conn.execute(
            "
            INSERT INTO billboard_chart_entries (
                source_file, year, rank, artist, album, artist_key, album_key,
                first_appearance_year, matched_album_id, imported_at
            ) VALUES ('albums.csv', 1998, 31, 'Massive Attack', 'Mezzanine',
                      'massive attack', 'mezzanine', 1998, NULL, '2026-07-29')
            ",
            [],
        )
        .expect("insert candidate");
    }

    #[test]
    fn builds_candidates_and_atlas_from_unmatched_chart_rows() {
        let conn = connection();
        insert_billboard_candidate(&conn);

        let response = get_for_connection(&conn, None).expect("get completion data");

        assert_eq!(response.total_chart_albums, 1);
        assert_eq!(response.total_candidates, 1);
        assert_eq!(response.candidates[0].artist, "Massive Attack");
        assert_eq!(response.candidates[0].evidence[0].label, "Billboard 200");
        assert_eq!(response.atlas[0].decade, 1990);
        assert_eq!(response.atlas[0].candidates, 1);
    }

    #[test]
    fn wanted_decisions_persist_and_create_a_wish_list_item() {
        let conn = connection();
        insert_billboard_candidate(&conn);
        let candidate = get_for_connection(&conn, None)
            .expect("get completion data")
            .candidates
            .remove(0);

        let decision = set_decision_for_connection(
            &conn,
            SetLibraryCompletionDecisionRequest {
                candidate_id: candidate.id.clone(),
                artist: candidate.artist,
                title: candidate.title,
                chart_year: candidate.chart_year,
                source: candidate.evidence[0].label.clone(),
                status: "wanted".to_string(),
                wish_list_item_id: None,
                musicbrainz_id: None,
                musicbrainz_url: None,
            },
        )
        .expect("save wanted decision");

        assert!(decision.wish_list_item_id.is_some());
        let refreshed = get_for_connection(&conn, None).expect("refresh completion data");
        assert_eq!(refreshed.candidates[0].status, "wanted");
        assert_eq!(refreshed.atlas[0].wanted, 1);
    }

    #[test]
    fn campaign_returns_the_complete_source_decade_cohort() {
        let conn = connection();
        insert_billboard_candidate(&conn);
        conn.execute(
            "
            INSERT INTO billboard_chart_entries (
                source_file, year, rank, artist, album, artist_key, album_key,
                first_appearance_year, matched_album_id, imported_at
            ) VALUES ('albums.csv', 1984, 12, 'Prince', 'Purple Rain',
                      'prince', 'purple rain', 1984, NULL, '2026-07-29')
            ",
            [],
        )
        .expect("insert 1980s candidate");

        let response = get_for_connection(
            &conn,
            Some(LibraryCompletionRequest {
                source: Some("billboard".to_string()),
                decade: Some(1980),
                ..Default::default()
            }),
        )
        .expect("get scoped completion data");

        assert_eq!(response.candidates.len(), 1);
        assert_eq!(response.candidates[0].title, "Purple Rain");
        assert!(!response.truncated);
        assert_eq!(response.atlas.len(), 2);
        assert_eq!(response.total_candidates, 2);
    }

    #[test]
    fn source_and_year_filters_run_before_the_workbench_limit() {
        let mut conn = connection();
        {
            let transaction = conn.transaction().expect("start candidate transaction");
            let mut statement = transaction
                .prepare(
                    "INSERT INTO billboard_chart_entries
                        (source_file, year, rank, artist, album, artist_key, album_key,
                         first_appearance_year, imported_at)
                     VALUES ('billboard.csv', 1998, 1, ?1, ?2, ?3, ?4, 1998, 'now')",
                )
                .expect("prepare Billboard candidates");
            for index in 0..MAX_RETURNED_CANDIDATES {
                statement
                    .execute(params![
                        format!("Billboard Artist {index}"),
                        format!("Billboard Album {index}"),
                        format!("billboard artist {index}"),
                        format!("billboard album {index}"),
                    ])
                    .expect("insert Billboard candidate");
            }
            drop(statement);
            transaction.commit().expect("commit Billboard candidates");
        }
        conn.execute(
            "
            INSERT INTO vg_lista_album_chart_entries (
                source_file, year, week, rank, artist, title, artist_key, title_key,
                week_date, week_key, matched_album_id, imported_at
            ) VALUES ('vg-albums.csv', 1985, 1, 3, 'A-ha', 'Hunting High and Low',
                      'a ha', 'hunting high and low', '1985-01-01', '1985-01', NULL, '2026-07-29')
            ",
            [],
        )
        .expect("insert VG Lista candidate");

        let response = get_for_connection(
            &conn,
            Some(LibraryCompletionRequest {
                source: Some("vgLista".to_string()),
                year_from: Some(1980),
                year_to: Some(1989),
                ..Default::default()
            }),
        )
        .expect("filter completion data");

        assert_eq!(response.total_candidates, MAX_RETURNED_CANDIDATES + 1);
        assert_eq!(response.returned_candidates, 1);
        assert_eq!(response.candidates[0].artist, "A-ha");
        assert_eq!(response.candidates[0].evidence[0].source, "vgLista");
    }

    #[test]
    fn selected_verification_reaches_candidates_beyond_the_workbench_limit() {
        let mut conn = connection();
        {
            let transaction = conn.transaction().expect("start candidate transaction");
            let mut statement = transaction
                .prepare(
                    "
                    INSERT INTO billboard_chart_entries (
                        source_file, year, rank, artist, album, artist_key, album_key,
                        first_appearance_year, matched_album_id, imported_at
                    ) VALUES ('albums.csv', 1998, 1, ?1, ?2, ?3, ?4, 1998, NULL, '2026-07-29')
                    ",
                )
                .expect("prepare candidate insert");
            for index in 0..MAX_RETURNED_CANDIDATES {
                let artist = format!("A Artist {index:04}");
                let title = format!("Album {index:04}");
                statement
                    .execute(params![
                        artist,
                        title,
                        format!("a artist {index:04}"),
                        format!("album {index:04}"),
                    ])
                    .expect("insert visible candidate");
            }
            statement
                .execute(params![
                    "ZZZ Hidden Artist",
                    "Hidden Album",
                    "zzz hidden artist",
                    "hidden album",
                ])
                .expect("insert candidate beyond the Workbench limit");
            drop(statement);
            transaction.commit().expect("commit candidate transaction");
        }

        let workbench = get_for_connection(&conn, None).expect("load Workbench candidates");
        assert!(workbench.truncated);
        assert_eq!(workbench.candidates.len(), MAX_RETURNED_CANDIDATES);
        assert!(!workbench
            .candidates
            .iter()
            .any(|candidate| candidate.title == "Hidden Album"));

        let started = start_verification_for_connection(
            &mut conn,
            StartLibraryCompletionVerificationRequest {
                scope: "candidate".to_string(),
                candidate_ids: vec!["zzz hidden artist\u{1f}hidden album".to_string()],
                source: None,
                decade: None,
                label: None,
            },
        )
        .expect("start verification beyond the Workbench limit");

        let batch = started.batch.expect("verification batch");
        assert_eq!(batch.total_count, 1);
        assert_eq!(started.recent_items[0].title, "Hidden Album");
    }

    #[test]
    fn verification_batches_persist_results_and_update_the_atlas() {
        let mut conn = connection();
        insert_billboard_candidate(&conn);

        let started = start_verification_for_connection(
            &mut conn,
            StartLibraryCompletionVerificationRequest {
                scope: "campaign".to_string(),
                candidate_ids: Vec::new(),
                source: Some("billboard".to_string()),
                decade: Some(1990),
                label: None,
            },
        )
        .expect("start campaign verification");
        let batch = started.batch.expect("verification batch");
        assert_eq!(batch.total_count, 1);
        assert_eq!(batch.queued_count, 1);

        let item = claim_next_verification(&mut conn)
            .expect("claim verification")
            .expect("queued verification item");
        complete_verification_item(
            &mut conn,
            &item,
            &VerificationResult {
                outcome: "verified".to_string(),
                provider: "discogs".to_string(),
                message: "Discogs confirmed an accepted Album master.".to_string(),
                musicbrainz_id: None,
                musicbrainz_url: None,
                matched_artist: Some("Massive Attack".to_string()),
                matched_title: Some("Mezzanine".to_string()),
                matched_year: Some(1998),
                score: None,
                musicbrainz_outcome: Some("noMatch".to_string()),
                musicbrainz_message: Some("MusicBrainz returned no exact match.".to_string()),
                discogs_outcome: Some("verified".to_string()),
                discogs_message: Some("Discogs confirmed an accepted Album master.".to_string()),
                discogs_master_id: Some("12345".to_string()),
                discogs_url: Some("https://www.discogs.com/master/12345".to_string()),
            },
        )
        .expect("complete verification");

        let status = verification_status_for_connection(&conn, Some(batch.id))
            .expect("load completed status");
        let completed = status.batch.expect("completed batch");
        assert_eq!(completed.state, "completed");
        assert_eq!(completed.verified_count, 1);
        assert_eq!(completed.discogs_verified_count, 1);

        conn.execute(
            "
            UPDATE library_completion_verifications
            SET cover_state = 'available',
                cover_provider = 'discogs',
                cover_message = 'Discogs primary master artwork cached locally.',
                cover_checked_at = '2026-07-29T10:05:00Z'
            WHERE candidate_key = ?1
            ",
            params![item.candidate_id],
        )
        .expect("store cover enrichment state");

        let completion = get_for_connection(&conn, None).expect("refresh completion data");
        assert_eq!(completion.candidates[0].verification_status, "verified");
        assert_eq!(
            completion.candidates[0].verification_provider.as_deref(),
            Some("discogs")
        );
        assert_eq!(
            completion.candidates[0].discogs_master_id.as_deref(),
            Some("12345")
        );
        assert_eq!(
            completion.candidates[0].cover_status.as_deref(),
            Some("available")
        );
        assert_eq!(
            completion.candidates[0].cover_provider.as_deref(),
            Some("discogs")
        );
        assert_eq!(
            completion.candidates[0].cover_message.as_deref(),
            Some("Discogs primary master artwork cached locally.")
        );
        assert_eq!(completion.atlas[0].verified, 1);
        assert_eq!(completion.atlas[0].candidates, 0);
    }

    #[test]
    fn paused_and_failed_batches_can_be_resumed_and_retried() {
        let mut conn = connection();
        insert_billboard_candidate(&conn);
        let started = start_verification_for_connection(
            &mut conn,
            StartLibraryCompletionVerificationRequest {
                scope: "candidate".to_string(),
                candidate_ids: vec!["massive attack\u{1f}mezzanine".to_string()],
                source: None,
                decade: None,
                label: None,
            },
        )
        .expect("start candidate verification");
        let batch_id = started.batch.expect("batch").id;

        let paused = set_verification_state_for_connection(
            &conn,
            SetLibraryCompletionVerificationStateRequest {
                batch_id,
                state: "paused".to_string(),
            },
        )
        .expect("pause verification");
        assert_eq!(paused.batch.expect("paused batch").state, "paused");
        set_verification_state_for_connection(
            &conn,
            SetLibraryCompletionVerificationStateRequest {
                batch_id,
                state: "running".to_string(),
            },
        )
        .expect("resume verification");

        let item = claim_next_verification(&mut conn)
            .expect("claim verification")
            .expect("queued item");
        complete_verification_item(
            &mut conn,
            &item,
            &VerificationResult {
                outcome: "failed".to_string(),
                provider: "musicbrainz".to_string(),
                message: "Temporary MusicBrainz failure.".to_string(),
                musicbrainz_id: None,
                musicbrainz_url: None,
                matched_artist: None,
                matched_title: None,
                matched_year: None,
                score: None,
                musicbrainz_outcome: Some("failed".to_string()),
                musicbrainz_message: Some("Temporary MusicBrainz failure.".to_string()),
                discogs_outcome: None,
                discogs_message: None,
                discogs_master_id: None,
                discogs_url: None,
            },
        )
        .expect("store failed verification");

        let retried = retry_verification_failures_for_connection(&mut conn, batch_id)
            .expect("retry failures");
        let retried_batch = retried.batch.expect("retried batch");
        assert_eq!(retried_batch.state, "running");
        assert_eq!(retried_batch.queued_count, 1);
        assert_eq!(retried_batch.failed_count, 0);
    }
}
