#[cfg(not(test))]
use crate::db;
#[cfg(not(test))]
use crate::discogs;
use crate::wishlist;
use anyhow::{bail, Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
#[cfg(not(test))]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(not(test))]
use std::thread;
#[cfg(not(test))]
use std::time::Duration;
#[cfg(not(test))]
use tauri::AppHandle;

const MAX_RETURNED_ARTISTS: usize = 5_000;
const MAX_VERIFICATION_SELECTION: usize = 5_000;
const MAX_ARTIST_KEY_LENGTH: usize = 400;
const MAX_TEXT_LENGTH: usize = 300;
const RECENT_VERIFICATION_ITEMS: usize = 8;
#[cfg(not(test))]
static ARTIST_VERIFICATION_WORKER_RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCompletionArtistEvidence {
    pub source: String,
    pub chart_kind: String,
    pub label: String,
    pub best_rank: i32,
    pub first_year: i32,
    pub last_year: i32,
    pub appearances: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCompletionArtistCandidate {
    pub id: String,
    pub artist: String,
    pub first_chart_year: i32,
    pub confidence: String,
    pub status: String,
    pub wish_list_item_id: Option<i64>,
    pub verification_status: String,
    pub verification_message: Option<String>,
    pub verification_checked_at: Option<String>,
    pub musicbrainz_verification_status: Option<String>,
    pub musicbrainz_verification_message: Option<String>,
    pub musicbrainz_id: Option<String>,
    pub musicbrainz_url: Option<String>,
    pub official_album_count: usize,
    pub discogs_verification_status: Option<String>,
    pub discogs_verification_message: Option<String>,
    pub discogs_master_id: Option<String>,
    pub discogs_url: Option<String>,
    pub discogs_studio_album_title: Option<String>,
    pub evidence: Vec<LibraryCompletionArtistEvidence>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCompletionArtistResponse {
    pub generated_at: String,
    pub total_chart_artists: usize,
    pub owned_artist_count: usize,
    pub total_candidates: usize,
    pub returned_candidates: usize,
    pub truncated: bool,
    pub candidates: Vec<LibraryCompletionArtistCandidate>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartLibraryCompletionArtistVerificationRequest {
    #[serde(default)]
    pub artist_ids: Vec<String>,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLibraryCompletionArtistVerificationStateRequest {
    pub batch_id: i64,
    pub state: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmLibraryCompletionArtistMatchRequest {
    pub artist_id: String,
    pub candidate: wishlist::WishListMusicBrainzCandidate,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLibraryCompletionArtistDecisionRequest {
    pub artist_id: String,
    pub artist: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCompletionArtistDecision {
    pub artist_id: String,
    pub status: String,
    pub wish_list_item_id: Option<i64>,
    pub missing_album_count: Option<usize>,
    pub message: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCompletionArtistVerificationItemSummary {
    pub artist_id: String,
    pub artist: String,
    pub state: String,
    pub provider: String,
    pub message: Option<String>,
    pub official_album_count: usize,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCompletionArtistVerificationBatch {
    pub id: i64,
    pub label: String,
    pub state: String,
    pub total_count: i64,
    pub queued_count: i64,
    pub checking_count: i64,
    pub verified_count: i64,
    pub no_match_count: i64,
    pub ambiguous_count: i64,
    pub failed_count: i64,
    pub completed_count: i64,
    pub estimated_seconds_remaining: i64,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCompletionArtistVerificationStatus {
    pub batch: Option<LibraryCompletionArtistVerificationBatch>,
    pub recent_items: Vec<LibraryCompletionArtistVerificationItemSummary>,
}

#[derive(Debug, Clone)]
struct SourceArtistRow {
    source: String,
    chart_kind: String,
    artist: String,
    first_year: i32,
    last_year: i32,
    best_rank: i32,
    appearances: i64,
}

#[derive(Debug, Clone, Default)]
struct ArtistAggregate {
    artist: String,
    first_year: i32,
    evidence: Vec<LibraryCompletionArtistEvidence>,
}

#[derive(Debug, Clone)]
struct StoredVerification {
    outcome: String,
    message: String,
    musicbrainz_outcome: Option<String>,
    musicbrainz_message: Option<String>,
    musicbrainz_id: Option<String>,
    musicbrainz_url: Option<String>,
    official_album_count: usize,
    discogs_outcome: Option<String>,
    discogs_message: Option<String>,
    discogs_master_id: Option<String>,
    discogs_url: Option<String>,
    discogs_studio_album_title: Option<String>,
    checked_at: String,
}

#[derive(Debug, Clone)]
struct StoredDecision {
    status: String,
    wish_list_item_id: Option<i64>,
}

#[derive(Debug, Clone)]
struct ArtistVerificationQueueItem {
    id: i64,
    batch_id: i64,
    artist_id: String,
    artist: String,
}

#[derive(Debug, Clone)]
struct ArtistVerificationResult {
    outcome: String,
    message: String,
    musicbrainz_outcome: Option<String>,
    musicbrainz_message: Option<String>,
    musicbrainz_id: Option<String>,
    musicbrainz_url: Option<String>,
    official_album_count: usize,
    discogs_outcome: Option<String>,
    discogs_message: Option<String>,
    discogs_master_id: Option<String>,
    discogs_url: Option<String>,
    discogs_studio_album_title: Option<String>,
}

fn source_label(source: &str, chart_kind: &str) -> &'static str {
    match (source, chart_kind) {
        ("billboard", "albums") => "Billboard 200",
        ("billboard", "singles") => "Billboard Hot 100",
        ("officialUk", "albums") => "Official UK Albums",
        ("officialUk", "singles") => "Official UK Singles",
        ("vgLista", "albums") => "VG Lista Albums",
        ("vgLista", "singles") => "VG Lista Singles",
        _ => "Imported chart",
    }
}

fn evidence_order(evidence: &LibraryCompletionArtistEvidence) -> usize {
    match (evidence.source.as_str(), evidence.chart_kind.as_str()) {
        ("billboard", "albums") => 0,
        ("billboard", "singles") => 1,
        ("officialUk", "albums") => 2,
        ("officialUk", "singles") => 3,
        ("vgLista", "albums") => 4,
        ("vgLista", "singles") => 5,
        _ => 6,
    }
}

fn load_source_rows(conn: &Connection) -> Result<Vec<SourceArtistRow>> {
    let mut statement = conn.prepare(
        "
        WITH chart_rows AS (
            SELECT 'billboard' AS source, 'albums' AS chart_kind, artist_key, artist,
                   COALESCE(first_appearance_year, year) AS chart_year, rank
            FROM billboard_chart_entries
            UNION ALL
            SELECT 'billboard', 'singles', artist_key, artist,
                   COALESCE(date_entered_year, year), rank
            FROM billboard_single_chart_entries
            UNION ALL
            SELECT 'officialUk', 'albums', artist_key, artist, year, rank
            FROM official_uk_album_chart_entries
            UNION ALL
            SELECT 'officialUk', 'singles', artist_key, artist, year, rank
            FROM official_uk_single_chart_entries
            UNION ALL
            SELECT 'vgLista', 'albums', artist_key, artist, year, rank
            FROM vg_lista_album_chart_entries
            UNION ALL
            SELECT 'vgLista', 'singles', artist_key, artist, year, rank
            FROM vg_lista_single_chart_entries
        )
        SELECT source, chart_kind, MIN(artist), MIN(chart_year), MAX(chart_year),
               MIN(rank), COUNT(*)
        FROM chart_rows
        WHERE TRIM(artist_key) <> '' AND TRIM(artist) <> ''
        GROUP BY source, chart_kind, artist_key
        ",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(SourceArtistRow {
            source: row.get(0)?,
            chart_kind: row.get(1)?,
            artist: row.get(2)?,
            first_year: row.get(3)?,
            last_year: row.get(4)?,
            best_rank: row.get(5)?,
            appearances: row.get(6)?,
        })
    })?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load chart artist coverage")
}

fn load_owned_artist_keys(conn: &Connection) -> Result<HashSet<String>> {
    let mut statement = conn.prepare(
        "
        SELECT album_artist_display FROM albums
        UNION
        SELECT album_artist_display FROM tracks
        UNION
        SELECT display_artist FROM tracks
        ",
    )?;
    let rows = statement.query_map([], |row| row.get::<_, Option<String>>(0))?;
    let mut keys = HashSet::new();
    for value in rows {
        let key = wishlist::normalize_key(value?.as_deref().unwrap_or_default());
        if !key.is_empty() && key != "unknown" {
            keys.insert(key);
        }
    }
    Ok(keys)
}

fn load_verifications(conn: &Connection) -> Result<HashMap<String, StoredVerification>> {
    let mut statement = conn.prepare(
        "
        SELECT artist_key, outcome, message, musicbrainz_outcome, musicbrainz_message,
               musicbrainz_id, musicbrainz_url, official_album_count, discogs_outcome,
               discogs_message, discogs_master_id, discogs_url,
               discogs_studio_album_title, checked_at
        FROM library_completion_artist_verifications
        ",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            StoredVerification {
                outcome: row.get(1)?,
                message: row.get(2)?,
                musicbrainz_outcome: row.get(3)?,
                musicbrainz_message: row.get(4)?,
                musicbrainz_id: row.get(5)?,
                musicbrainz_url: row.get(6)?,
                official_album_count: row.get::<_, i64>(7)?.max(0) as usize,
                discogs_outcome: row.get(8)?,
                discogs_message: row.get(9)?,
                discogs_master_id: row.get(10)?,
                discogs_url: row.get(11)?,
                discogs_studio_album_title: row.get(12)?,
                checked_at: row.get(13)?,
            },
        ))
    })?;
    Ok(rows.collect::<rusqlite::Result<HashMap<_, _>>>()?)
}

fn load_decisions(conn: &Connection) -> Result<HashMap<String, StoredDecision>> {
    let mut statement = conn.prepare(
        "SELECT artist_key, status, wish_list_item_id FROM library_completion_artist_decisions",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            StoredDecision {
                status: row.get(1)?,
                wish_list_item_id: row.get(2)?,
            },
        ))
    })?;
    Ok(rows.collect::<rusqlite::Result<HashMap<_, _>>>()?)
}

fn load_wish_list_artists(conn: &Connection) -> Result<HashMap<String, i64>> {
    let mut statement =
        conn.prepare("SELECT id, title FROM wish_list_items WHERE entity = 'artist'")?;
    let rows = statement.query_map([], |row| {
        Ok((
            wishlist::normalize_key(&row.get::<_, String>(1)?),
            row.get::<_, i64>(0)?,
        ))
    })?;
    Ok(rows.collect::<rusqlite::Result<HashMap<_, _>>>()?)
}

fn load_pending_states(conn: &Connection) -> Result<HashMap<String, String>> {
    let mut statement = conn.prepare(
        "
        SELECT item.artist_key, item.state
        FROM library_completion_artist_verification_items item
        JOIN library_completion_artist_verification_batches batch ON batch.id = item.batch_id
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
        let (artist_id, state) = row?;
        states.entry(artist_id).or_insert(state);
    }
    Ok(states)
}

fn artist_confidence(aggregate: &ArtistAggregate) -> String {
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
    let kinds = aggregate
        .evidence
        .iter()
        .map(|evidence| evidence.chart_kind.as_str())
        .collect::<HashSet<_>>();
    if aggregate.evidence.len() >= 3 || (kinds.len() == 2 && best_rank <= 40) || best_rank <= 10 {
        "best".to_string()
    } else if aggregate.evidence.len() >= 2 || best_rank <= 40 || appearances >= 8 {
        "good".to_string()
    } else {
        "low".to_string()
    }
}

fn confidence_order(value: &str) -> usize {
    match value {
        "best" => 0,
        "good" => 1,
        _ => 2,
    }
}

fn status_order(value: &str) -> usize {
    match value {
        "wanted" => 0,
        "needsReview" => 1,
        "candidate" => 2,
        "notForMe" => 3,
        _ => 4,
    }
}

fn ignored_artist(artist: &str) -> bool {
    matches!(
        wishlist::normalize_key(artist).as_str(),
        "various" | "various artists" | "v a" | "unknown"
    )
}

fn get_for_connection(
    conn: &Connection,
    truncate: bool,
) -> Result<LibraryCompletionArtistResponse> {
    let owned = load_owned_artist_keys(conn)?;
    let decisions = load_decisions(conn)?;
    let verifications = load_verifications(conn)?;
    let pending = load_pending_states(conn)?;
    let wish_list_artists = load_wish_list_artists(conn)?;
    let mut artists = HashMap::<String, ArtistAggregate>::new();

    for row in load_source_rows(conn)? {
        let artist_id = wishlist::normalize_key(&row.artist);
        if artist_id.is_empty() || ignored_artist(&row.artist) {
            continue;
        }
        let aggregate = artists.entry(artist_id).or_default();
        if aggregate.artist.is_empty() || row.first_year < aggregate.first_year {
            aggregate.artist = row.artist.clone();
            aggregate.first_year = row.first_year;
        }
        aggregate.evidence.push(LibraryCompletionArtistEvidence {
            label: source_label(&row.source, &row.chart_kind).to_string(),
            source: row.source,
            chart_kind: row.chart_kind,
            best_rank: row.best_rank,
            first_year: row.first_year,
            last_year: row.last_year,
            appearances: row.appearances,
        });
    }

    let total_chart_artists = artists.len();
    let owned_artist_count = artists.keys().filter(|key| owned.contains(*key)).count();
    let mut candidates = Vec::new();
    for (artist_id, mut aggregate) in artists {
        if owned.contains(&artist_id) {
            continue;
        }
        aggregate.evidence.sort_by_key(evidence_order);
        let decision = decisions.get(&artist_id);
        let verification = verifications.get(&artist_id);
        let wish_list_item_id = decision
            .and_then(|value| value.wish_list_item_id)
            .or_else(|| wish_list_artists.get(&artist_id).copied());
        let status = if wish_list_item_id.is_some() {
            "wanted".to_string()
        } else {
            decision
                .map(|value| value.status.clone())
                .unwrap_or_else(|| "candidate".to_string())
        };
        let verification_status = pending
            .get(&artist_id)
            .cloned()
            .or_else(|| verification.map(|value| value.outcome.clone()))
            .unwrap_or_else(|| "unverified".to_string());
        candidates.push(LibraryCompletionArtistCandidate {
            id: artist_id,
            artist: aggregate.artist.clone(),
            first_chart_year: aggregate.first_year,
            confidence: artist_confidence(&aggregate),
            status,
            wish_list_item_id,
            verification_status,
            verification_message: verification.map(|value| value.message.clone()),
            verification_checked_at: verification.map(|value| value.checked_at.clone()),
            musicbrainz_verification_status: verification
                .and_then(|value| value.musicbrainz_outcome.clone()),
            musicbrainz_verification_message: verification
                .and_then(|value| value.musicbrainz_message.clone()),
            musicbrainz_id: verification.and_then(|value| value.musicbrainz_id.clone()),
            musicbrainz_url: verification.and_then(|value| value.musicbrainz_url.clone()),
            official_album_count: verification
                .map(|value| value.official_album_count)
                .unwrap_or(0),
            discogs_verification_status: verification
                .and_then(|value| value.discogs_outcome.clone()),
            discogs_verification_message: verification
                .and_then(|value| value.discogs_message.clone()),
            discogs_master_id: verification.and_then(|value| value.discogs_master_id.clone()),
            discogs_url: verification.and_then(|value| value.discogs_url.clone()),
            discogs_studio_album_title: verification
                .and_then(|value| value.discogs_studio_album_title.clone()),
            evidence: aggregate.evidence,
        });
    }

    let total_candidates = candidates
        .iter()
        .filter(|candidate| candidate.status != "notForMe")
        .count();
    candidates.sort_by(|left, right| {
        confidence_order(&left.confidence)
            .cmp(&confidence_order(&right.confidence))
            .then_with(|| status_order(&left.status).cmp(&status_order(&right.status)))
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
    });
    let truncated = truncate && candidates.len() > MAX_RETURNED_ARTISTS;
    if truncate {
        candidates.truncate(MAX_RETURNED_ARTISTS);
    }
    let returned_candidates = candidates.len();
    Ok(LibraryCompletionArtistResponse {
        generated_at: Utc::now().to_rfc3339(),
        total_chart_artists,
        owned_artist_count,
        total_candidates,
        returned_candidates,
        truncated,
        candidates,
    })
}

fn trimmed(value: String, limit: usize) -> String {
    value.trim().chars().take(limit).collect()
}

fn save_verification_result(
    conn: &Connection,
    artist_id: &str,
    artist: &str,
    result: &ArtistVerificationResult,
) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "
        INSERT INTO library_completion_artist_verifications (
            artist_key, outcome, artist, message, musicbrainz_outcome,
            musicbrainz_message, musicbrainz_id, musicbrainz_url,
            official_album_count, discogs_outcome, discogs_message,
            discogs_master_id, discogs_url, discogs_studio_album_title,
            attempt_count, checked_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 1, ?15, ?15)
        ON CONFLICT(artist_key) DO UPDATE SET
            outcome = excluded.outcome,
            artist = excluded.artist,
            message = excluded.message,
            musicbrainz_outcome = excluded.musicbrainz_outcome,
            musicbrainz_message = excluded.musicbrainz_message,
            musicbrainz_id = excluded.musicbrainz_id,
            musicbrainz_url = excluded.musicbrainz_url,
            official_album_count = excluded.official_album_count,
            discogs_outcome = excluded.discogs_outcome,
            discogs_message = excluded.discogs_message,
            discogs_master_id = excluded.discogs_master_id,
            discogs_url = excluded.discogs_url,
            discogs_studio_album_title = excluded.discogs_studio_album_title,
            attempt_count = library_completion_artist_verifications.attempt_count + 1,
            checked_at = excluded.checked_at,
            updated_at = excluded.updated_at
        ",
        params![
            artist_id,
            result.outcome,
            artist,
            result.message,
            result.musicbrainz_outcome,
            result.musicbrainz_message,
            result.musicbrainz_id,
            result.musicbrainz_url,
            result.official_album_count as i64,
            result.discogs_outcome,
            result.discogs_message,
            result.discogs_master_id,
            result.discogs_url,
            result.discogs_studio_album_title,
            now,
        ],
    )?;
    Ok(())
}

fn active_batch_id(conn: &Connection) -> Result<Option<i64>> {
    conn.query_row(
        "SELECT id FROM library_completion_artist_verification_batches WHERE state IN ('running', 'paused') ORDER BY id DESC LIMIT 1",
        [],
        |row| row.get(0),
    )
    .optional()
    .context("Could not inspect the active chart artist verification batch")
}

fn running_batch_exists(conn: &Connection) -> Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM library_completion_artist_verification_batches WHERE state = 'running')",
        [],
        |row| row.get(0),
    )
    .context("Could not inspect running chart artist verification batches")
}

fn start_verification_for_connection(
    conn: &mut Connection,
    mut request: StartLibraryCompletionArtistVerificationRequest,
) -> Result<LibraryCompletionArtistVerificationStatus> {
    if request.artist_ids.len() > MAX_VERIFICATION_SELECTION {
        bail!("An artist verification selection can contain at most {MAX_VERIFICATION_SELECTION} artists.")
    }
    let mut seen = HashSet::new();
    request.artist_ids = request
        .artist_ids
        .into_iter()
        .map(|value| trimmed(value, MAX_ARTIST_KEY_LENGTH))
        .filter(|value| !value.is_empty() && seen.insert(value.clone()))
        .collect();
    if request.artist_ids.is_empty() {
        bail!("Select at least one chart artist to verify.")
    }
    if active_batch_id(conn)?.is_some() {
        bail!("Finish the current artist verification run before starting another one.")
    }
    let selected = request.artist_ids.iter().cloned().collect::<HashSet<_>>();
    let candidates = get_for_connection(conn, false)?
        .candidates
        .into_iter()
        .filter(|candidate| {
            selected.contains(&candidate.id)
                && candidate.status == "candidate"
                && matches!(
                    candidate.verification_status.as_str(),
                    "unverified" | "failed"
                )
        })
        .collect::<Vec<_>>();
    if candidates.is_empty() {
        bail!("Every selected artist is already checked or no longer open for verification.")
    }
    let now = Utc::now().to_rfc3339();
    let label = request
        .label
        .take()
        .map(|value| trimmed(value, 120))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            if candidates.len() == 1 {
                candidates[0].artist.clone()
            } else {
                format!("{} chart artists", candidates.len())
            }
        });
    let transaction = conn.transaction()?;
    transaction.execute(
        "INSERT INTO library_completion_artist_verification_batches (label, state, total_count, created_at, updated_at) VALUES (?1, 'running', ?2, ?3, ?3)",
        params![label, candidates.len() as i64, now],
    )?;
    let batch_id = transaction.last_insert_rowid();
    for candidate in &candidates {
        transaction.execute(
            "INSERT INTO library_completion_artist_verification_items (batch_id, artist_key, artist, state, created_at) VALUES (?1, ?2, ?3, 'queued', ?4)",
            params![batch_id, candidate.id, candidate.artist, now],
        )?;
    }
    transaction.commit()?;
    verification_status_for_connection(conn, Some(batch_id))
}

fn verification_batch_for_connection(
    conn: &Connection,
    batch_id: Option<i64>,
) -> Result<Option<LibraryCompletionArtistVerificationBatch>> {
    let selected_id = if let Some(batch_id) = batch_id {
        batch_id
    } else {
        let Some(id) = conn
            .query_row(
                "SELECT id FROM library_completion_artist_verification_batches ORDER BY id DESC LIMIT 1",
                [],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
        else {
            return Ok(None);
        };
        id
    };
    conn.query_row(
        "
        SELECT batch.id, batch.label, batch.state, batch.total_count,
               SUM(CASE WHEN item.state = 'queued' THEN 1 ELSE 0 END),
               SUM(CASE WHEN item.state = 'checking' THEN 1 ELSE 0 END),
               SUM(CASE WHEN item.state = 'verified' THEN 1 ELSE 0 END),
               SUM(CASE WHEN item.state = 'noMatch' THEN 1 ELSE 0 END),
               SUM(CASE WHEN item.state = 'ambiguous' THEN 1 ELSE 0 END),
               SUM(CASE WHEN item.state = 'failed' THEN 1 ELSE 0 END),
               batch.created_at, batch.updated_at, batch.completed_at
        FROM library_completion_artist_verification_batches batch
        LEFT JOIN library_completion_artist_verification_items item ON item.batch_id = batch.id
        WHERE batch.id = ?1
        GROUP BY batch.id
        ",
        params![selected_id],
        |row| {
            let total_count = row.get::<_, i64>(3)?;
            let queued_count = row.get::<_, i64>(4)?;
            let checking_count = row.get::<_, i64>(5)?;
            Ok(LibraryCompletionArtistVerificationBatch {
                id: row.get(0)?,
                label: row.get(1)?,
                state: row.get(2)?,
                total_count,
                queued_count,
                checking_count,
                verified_count: row.get(6)?,
                no_match_count: row.get(7)?,
                ambiguous_count: row.get(8)?,
                failed_count: row.get(9)?,
                completed_count: total_count - queued_count - checking_count,
                estimated_seconds_remaining: (queued_count + checking_count) * 18,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                completed_at: row.get(12)?,
            })
        },
    )
    .optional()
    .context("Could not load the chart artist verification batch")
}

fn verification_status_for_connection(
    conn: &Connection,
    batch_id: Option<i64>,
) -> Result<LibraryCompletionArtistVerificationStatus> {
    let batch = verification_batch_for_connection(conn, batch_id)?;
    let Some(selected_id) = batch.as_ref().map(|value| value.id) else {
        return Ok(LibraryCompletionArtistVerificationStatus {
            batch: None,
            recent_items: Vec::new(),
        });
    };
    let mut statement = conn.prepare(
        "
        SELECT item.artist_key, item.artist, item.state, item.provider,
               CASE WHEN item.state = 'failed' THEN item.last_error ELSE verification.message END,
               COALESCE(verification.official_album_count, 0),
               COALESCE(item.finished_at, item.started_at, item.created_at)
        FROM library_completion_artist_verification_items item
        LEFT JOIN library_completion_artist_verifications verification
          ON verification.artist_key = item.artist_key
        WHERE item.batch_id = ?1
        ORDER BY CASE WHEN item.state = 'checking' THEN 0 ELSE 1 END,
                 COALESCE(item.finished_at, item.started_at, item.created_at) DESC, item.id DESC
        LIMIT ?2
        ",
    )?;
    let rows = statement.query_map(
        params![selected_id, RECENT_VERIFICATION_ITEMS as i64],
        |row| {
            Ok(LibraryCompletionArtistVerificationItemSummary {
                artist_id: row.get(0)?,
                artist: row.get(1)?,
                state: row.get(2)?,
                provider: row.get(3)?,
                message: row.get(4)?,
                official_album_count: row.get::<_, i64>(5)?.max(0) as usize,
                updated_at: row.get(6)?,
            })
        },
    )?;
    Ok(LibraryCompletionArtistVerificationStatus {
        batch,
        recent_items: rows.collect::<rusqlite::Result<Vec<_>>>()?,
    })
}

fn set_verification_state_for_connection(
    conn: &Connection,
    request: SetLibraryCompletionArtistVerificationStateRequest,
) -> Result<LibraryCompletionArtistVerificationStatus> {
    let state = request.state.trim();
    if !matches!(state, "running" | "paused") {
        bail!("An artist verification run can only be running or paused.")
    }
    let changed = conn.execute(
        "UPDATE library_completion_artist_verification_batches SET state = ?1, updated_at = ?2 WHERE id = ?3 AND state IN ('running', 'paused')",
        params![state, Utc::now().to_rfc3339(), request.batch_id],
    )?;
    if changed == 0 {
        bail!("The selected artist verification run is already complete or no longer exists.")
    }
    verification_status_for_connection(conn, Some(request.batch_id))
}

fn retry_failures_for_connection(
    conn: &mut Connection,
    batch_id: i64,
) -> Result<LibraryCompletionArtistVerificationStatus> {
    let now = Utc::now().to_rfc3339();
    let transaction = conn.transaction()?;
    transaction.execute(
        "DELETE FROM library_completion_artist_verifications WHERE outcome = 'failed' AND artist_key IN (SELECT artist_key FROM library_completion_artist_verification_items WHERE batch_id = ?1 AND state = 'failed')",
        params![batch_id],
    )?;
    let changed = transaction.execute(
        "UPDATE library_completion_artist_verification_items SET state = 'queued', provider = 'musicbrainz', last_error = NULL, started_at = NULL, finished_at = NULL WHERE batch_id = ?1 AND state = 'failed'",
        params![batch_id],
    )?;
    if changed == 0 {
        bail!("This artist verification run has no failed checks to retry.")
    }
    transaction.execute(
        "UPDATE library_completion_artist_verification_batches SET state = 'running', updated_at = ?1, completed_at = NULL WHERE id = ?2",
        params![now, batch_id],
    )?;
    transaction.commit()?;
    verification_status_for_connection(conn, Some(batch_id))
}

fn recover_interrupted_verifications(conn: &Connection) -> Result<()> {
    conn.execute(
        "UPDATE library_completion_artist_verification_items SET state = 'queued', provider = 'musicbrainz', started_at = NULL WHERE state = 'checking' AND batch_id IN (SELECT id FROM library_completion_artist_verification_batches WHERE state = 'running')",
        [],
    )?;
    Ok(())
}

fn claim_next_verification(conn: &mut Connection) -> Result<Option<ArtistVerificationQueueItem>> {
    loop {
        let batch_id = conn
            .query_row(
                "SELECT id FROM library_completion_artist_verification_batches WHERE state = 'running' ORDER BY id LIMIT 1",
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
                "SELECT id, batch_id, artist_key, artist FROM library_completion_artist_verification_items WHERE batch_id = ?1 AND state = 'queued' ORDER BY id LIMIT 1",
                params![batch_id],
                |row| {
                    Ok(ArtistVerificationQueueItem {
                        id: row.get(0)?,
                        batch_id: row.get(1)?,
                        artist_id: row.get(2)?,
                        artist: row.get(3)?,
                    })
                },
            )
            .optional()?;
        let Some(item) = item else {
            let now = Utc::now().to_rfc3339();
            transaction.execute(
                "UPDATE library_completion_artist_verification_batches SET state = 'completed', completed_at = ?1, updated_at = ?1 WHERE id = ?2 AND NOT EXISTS (SELECT 1 FROM library_completion_artist_verification_items WHERE batch_id = ?2 AND state IN ('queued', 'checking'))",
                params![now, batch_id],
            )?;
            transaction.commit()?;
            continue;
        };
        let now = Utc::now().to_rfc3339();
        transaction.execute(
            "UPDATE library_completion_artist_verification_items SET state = 'checking', provider = 'musicbrainz', attempt_count = attempt_count + 1, started_at = ?1 WHERE id = ?2",
            params![now, item.id],
        )?;
        transaction.execute(
            "UPDATE library_completion_artist_verification_batches SET updated_at = ?1 WHERE id = ?2",
            params![now, batch_id],
        )?;
        transaction.commit()?;
        return Ok(Some(item));
    }
}

fn complete_verification_item(
    conn: &mut Connection,
    item: &ArtistVerificationQueueItem,
    result: &ArtistVerificationResult,
) -> Result<()> {
    let transaction = conn.transaction()?;
    save_verification_result(&transaction, &item.artist_id, &item.artist, result)?;
    let now = Utc::now().to_rfc3339();
    transaction.execute(
        "UPDATE library_completion_artist_verification_items SET state = ?1, last_error = ?2, finished_at = ?3 WHERE id = ?4",
        params![
            result.outcome,
            (result.outcome == "failed").then_some(result.message.as_str()),
            now,
            item.id,
        ],
    )?;
    transaction.execute(
        "
        UPDATE library_completion_artist_verification_batches
        SET state = CASE WHEN NOT EXISTS (SELECT 1 FROM library_completion_artist_verification_items WHERE batch_id = ?1 AND state IN ('queued', 'checking')) THEN 'completed' ELSE state END,
            completed_at = CASE WHEN NOT EXISTS (SELECT 1 FROM library_completion_artist_verification_items WHERE batch_id = ?1 AND state IN ('queued', 'checking')) THEN ?2 ELSE completed_at END,
            updated_at = ?2
        WHERE id = ?1
        ",
        params![item.batch_id, now],
    )?;
    transaction.commit()?;
    Ok(())
}

fn set_decision_for_connection(
    conn: &Connection,
    mut request: SetLibraryCompletionArtistDecisionRequest,
) -> Result<LibraryCompletionArtistDecision> {
    request.artist_id = trimmed(request.artist_id, MAX_ARTIST_KEY_LENGTH);
    request.artist = trimmed(request.artist, MAX_TEXT_LENGTH);
    request.status = request.status.trim().to_string();
    if request.artist_id.is_empty() || request.artist.is_empty() {
        bail!("The chart artist candidate is incomplete.")
    }
    if !matches!(
        request.status.as_str(),
        "candidate" | "wanted" | "notForMe" | "needsReview"
    ) {
        bail!("The chart artist decision is not supported.")
    }
    if request.status == "candidate" {
        conn.execute(
            "DELETE FROM library_completion_artist_decisions WHERE artist_key = ?1",
            params![request.artist_id],
        )?;
        return Ok(LibraryCompletionArtistDecision {
            artist_id: request.artist_id,
            status: request.status,
            wish_list_item_id: None,
            missing_album_count: None,
            message: "Returned this artist to the discovery queue.".to_string(),
            updated_at: Utc::now().to_rfc3339(),
        });
    }

    let mut wish_list_item_id = None;
    let mut missing_album_count = None;
    let message = if request.status == "wanted" {
        let verification = conn
            .query_row(
                "SELECT outcome, musicbrainz_id FROM library_completion_artist_verifications WHERE artist_key = ?1",
                params![request.artist_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
            )
            .optional()?
            .context("Verify this chart artist before adding it to the Wish List.")?;
        if verification.0 != "verified" {
            bail!(
                "Only artists with confirmed official studio albums can be added to the Wish List."
            )
        }
        let musicbrainz_id = verification
            .1
            .context("The verified chart artist has no MusicBrainz identifier.")?;
        let response = wishlist::add_verified_chart_artist_for_connection(
            conn,
            &request.artist,
            &musicbrainz_id,
        )?;
        let item = response
            .item
            .context("The verified artist could not be added to the Wish List.")?;
        wish_list_item_id = Some(item.id);
        missing_album_count = response
            .artist_album_summary
            .as_ref()
            .map(|summary| summary.missing_album_count);
        response.message
    } else if request.status == "needsReview" {
        "Saved this chart artist for manual review.".to_string()
    } else {
        "Excluded this chart artist from the active discovery queue.".to_string()
    };

    let updated_at = Utc::now().to_rfc3339();
    conn.execute(
        "
        INSERT INTO library_completion_artist_decisions (artist_key, status, artist, wish_list_item_id, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(artist_key) DO UPDATE SET
            status = excluded.status,
            artist = excluded.artist,
            wish_list_item_id = excluded.wish_list_item_id,
            updated_at = excluded.updated_at
        ",
        params![
            request.artist_id,
            request.status,
            request.artist,
            wish_list_item_id,
            updated_at,
        ],
    )?;
    Ok(LibraryCompletionArtistDecision {
        artist_id: request.artist_id,
        status: request.status,
        wish_list_item_id,
        missing_album_count,
        message,
        updated_at,
    })
}

#[cfg(not(test))]
fn set_checking_provider(conn: &Connection, item_id: i64, provider: &str) -> Result<()> {
    conn.execute(
        "UPDATE library_completion_artist_verification_items SET provider = ?1 WHERE id = ?2 AND state = 'checking'",
        params![provider, item_id],
    )?;
    Ok(())
}

#[cfg(not(test))]
fn musicbrainz_result(
    conn: &mut Connection,
    artist: &str,
    selected: Option<wishlist::WishListMusicBrainzCandidate>,
) -> ArtistVerificationResult {
    let candidate = if let Some(candidate) = selected {
        if !candidate.entity.eq_ignore_ascii_case("artist") {
            return failed_musicbrainz_result("MusicBrainz returned a non-artist candidate.");
        }
        candidate
    } else {
        let response = match wishlist::search_musicbrainz_for_wishlist(
            wishlist::WishListMusicBrainzSearchRequest {
                entity: "artist".to_string(),
                query: artist.to_string(),
                artist: String::new(),
                year: None,
            },
        ) {
            Ok(response) => response,
            Err(error) => {
                return failed_musicbrainz_result(&format!("MusicBrainz search failed: {error}"));
            }
        };
        let exact = response
            .candidates
            .into_iter()
            .filter(|candidate| {
                wishlist::normalize_key(&candidate.title) == wishlist::normalize_key(artist)
            })
            .collect::<Vec<_>>();
        if exact.is_empty() {
            return ArtistVerificationResult {
                outcome: "noMatch".to_string(),
                message: "MusicBrainz returned no exact artist match.".to_string(),
                musicbrainz_outcome: Some("noMatch".to_string()),
                musicbrainz_message: Some(
                    "MusicBrainz returned no exact artist match.".to_string(),
                ),
                musicbrainz_id: None,
                musicbrainz_url: None,
                official_album_count: 0,
                discogs_outcome: None,
                discogs_message: None,
                discogs_master_id: None,
                discogs_url: None,
                discogs_studio_album_title: None,
            };
        }
        if exact.len() > 1 {
            return ArtistVerificationResult {
                outcome: "ambiguous".to_string(),
                message: format!(
                    "MusicBrainz returned {} exact artists; choose the correct identity manually.",
                    exact.len()
                ),
                musicbrainz_outcome: Some("ambiguous".to_string()),
                musicbrainz_message: Some(format!(
                    "MusicBrainz returned {} exact artists; choose the correct identity manually.",
                    exact.len()
                )),
                musicbrainz_id: None,
                musicbrainz_url: None,
                official_album_count: 0,
                discogs_outcome: None,
                discogs_message: None,
                discogs_master_id: None,
                discogs_url: None,
                discogs_studio_album_title: None,
            };
        }
        exact
            .into_iter()
            .next()
            .expect("one exact MusicBrainz artist")
    };

    match crate::musicbrainz::official_album_release_groups_for_wishlist(
        conn,
        &candidate.musicbrainz_id,
    ) {
        Ok((albums, _)) if albums.is_empty() => ArtistVerificationResult {
            outcome: "noMatch".to_string(),
            message: "MusicBrainz found the artist but no official studio-album release groups."
                .to_string(),
            musicbrainz_outcome: Some("noMatch".to_string()),
            musicbrainz_message: Some(
                "MusicBrainz found the artist but no official studio-album release groups."
                    .to_string(),
            ),
            musicbrainz_id: Some(candidate.musicbrainz_id),
            musicbrainz_url: Some(candidate.musicbrainz_url),
            official_album_count: 0,
            discogs_outcome: None,
            discogs_message: None,
            discogs_master_id: None,
            discogs_url: None,
            discogs_studio_album_title: None,
        },
        Ok((albums, _)) => {
            let count = albums.len();
            ArtistVerificationResult {
                outcome: "verified".to_string(),
                message: format!(
                    "MusicBrainz confirmed {count} official studio {} for this artist.",
                    if count == 1 { "album" } else { "albums" }
                ),
                musicbrainz_outcome: Some("verified".to_string()),
                musicbrainz_message: Some(format!(
                    "MusicBrainz confirmed {count} official studio {} for this artist.",
                    if count == 1 { "album" } else { "albums" }
                )),
                musicbrainz_id: Some(candidate.musicbrainz_id),
                musicbrainz_url: Some(candidate.musicbrainz_url),
                official_album_count: count,
                discogs_outcome: None,
                discogs_message: None,
                discogs_master_id: None,
                discogs_url: None,
                discogs_studio_album_title: None,
            }
        }
        Err(error) => {
            failed_musicbrainz_result(&format!("MusicBrainz official album check failed: {error}"))
        }
    }
}

#[cfg(not(test))]
fn failed_musicbrainz_result(message: &str) -> ArtistVerificationResult {
    ArtistVerificationResult {
        outcome: "failed".to_string(),
        message: message.to_string(),
        musicbrainz_outcome: Some("failed".to_string()),
        musicbrainz_message: Some(message.to_string()),
        musicbrainz_id: None,
        musicbrainz_url: None,
        official_album_count: 0,
        discogs_outcome: None,
        discogs_message: None,
        discogs_master_id: None,
        discogs_url: None,
        discogs_studio_album_title: None,
    }
}

#[cfg(not(test))]
fn add_discogs_result(
    mut result: ArtistVerificationResult,
    artist: &str,
) -> ArtistVerificationResult {
    match discogs::is_configured() {
        Ok(false) => {
            result.discogs_message = Some(
                "Discogs is not configured; MusicBrainz remains the primary official-album check."
                    .to_string(),
            );
        }
        Err(error) => {
            result.discogs_outcome = Some("failed".to_string());
            result.discogs_message = Some(format!("Discogs configuration check failed: {error}"));
        }
        Ok(true) => match discogs::verify_artist_has_studio_album(artist) {
            Ok(verification) => {
                result.discogs_outcome = Some(verification.outcome);
                result.discogs_message = Some(verification.message);
                result.discogs_master_id = verification.master_id;
                result.discogs_url = verification.discogs_url;
                result.discogs_studio_album_title = verification.studio_album_title;
            }
            Err(error) => {
                result.discogs_outcome = Some("failed".to_string());
                result.discogs_message = Some(format!("Discogs artist check failed: {error}"));
            }
        },
    }
    if result.outcome == "verified" {
        result.message = match result.discogs_outcome.as_deref() {
            Some("verified") => format!(
                "MusicBrainz confirmed {} official studio {}; Discogs independently corroborated the artist.",
                result.official_album_count,
                if result.official_album_count == 1 { "album" } else { "albums" }
            ),
            Some("noMatch") => format!(
                "MusicBrainz confirmed {} official studio {}; Discogs was inconclusive.",
                result.official_album_count,
                if result.official_album_count == 1 { "album" } else { "albums" }
            ),
            Some("failed") => format!(
                "MusicBrainz confirmed {} official studio {}; the Discogs cross-check can be retried later.",
                result.official_album_count,
                if result.official_album_count == 1 { "album" } else { "albums" }
            ),
            _ => result.message,
        };
    }
    result
}

#[cfg(not(test))]
fn run_verification(
    conn: &mut Connection,
    item_id: Option<i64>,
    artist: &str,
    selected: Option<wishlist::WishListMusicBrainzCandidate>,
) -> ArtistVerificationResult {
    let result = musicbrainz_result(conn, artist, selected);
    if let Some(item_id) = item_id {
        let _ = set_checking_provider(conn, item_id, "discogs");
    }
    add_discogs_result(result, artist)
}

#[cfg(not(test))]
fn run_worker(app: AppHandle) {
    loop {
        let next = (|| -> Result<Option<(Connection, ArtistVerificationQueueItem)>> {
            let (mut conn, _) = db::open(&app)?;
            let item = claim_next_verification(&mut conn)?;
            Ok(item.map(|item| (conn, item)))
        })();
        let Some((mut conn, item)) = (match next {
            Ok(value) => value,
            Err(_) => {
                thread::sleep(Duration::from_secs(1));
                continue;
            }
        }) else {
            break;
        };
        let result = run_verification(&mut conn, Some(item.id), &item.artist, None);
        let _ = complete_verification_item(&mut conn, &item, &result);
        thread::sleep(Duration::from_millis(250));
    }
    ARTIST_VERIFICATION_WORKER_RUNNING.store(false, Ordering::Release);
    if let Ok((conn, _)) = db::open(&app) {
        if running_batch_exists(&conn).unwrap_or(false) {
            spawn_verification_worker(app);
        }
    }
}

#[cfg(not(test))]
fn spawn_verification_worker(app: AppHandle) {
    if ARTIST_VERIFICATION_WORKER_RUNNING
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return;
    }
    tauri::async_runtime::spawn_blocking(move || run_worker(app));
}

#[cfg(not(test))]
pub fn resume_verification_worker(app: AppHandle) {
    if let Ok((conn, _)) = db::open(&app) {
        let _ = recover_interrupted_verifications(&conn);
        if running_batch_exists(&conn).unwrap_or(false) {
            spawn_verification_worker(app);
        }
    }
}

#[cfg(not(test))]
pub fn get_for_app(app: &AppHandle) -> Result<LibraryCompletionArtistResponse> {
    let (conn, _) = db::open(app)?;
    get_for_connection(&conn, true)
}

#[cfg(not(test))]
pub fn verification_status_for_app(
    app: &AppHandle,
) -> Result<LibraryCompletionArtistVerificationStatus> {
    let (conn, _) = db::open(app)?;
    verification_status_for_connection(&conn, None)
}

#[cfg(not(test))]
pub fn start_verification_for_app(
    app: &AppHandle,
    request: StartLibraryCompletionArtistVerificationRequest,
) -> Result<LibraryCompletionArtistVerificationStatus> {
    let (mut conn, _) = db::open(app)?;
    let status = start_verification_for_connection(&mut conn, request)?;
    spawn_verification_worker(app.clone());
    Ok(status)
}

#[cfg(not(test))]
pub fn set_verification_state_for_app(
    app: &AppHandle,
    request: SetLibraryCompletionArtistVerificationStateRequest,
) -> Result<LibraryCompletionArtistVerificationStatus> {
    let (conn, _) = db::open(app)?;
    let state = request.state.clone();
    let status = set_verification_state_for_connection(&conn, request)?;
    if state == "running" {
        spawn_verification_worker(app.clone());
    }
    Ok(status)
}

#[cfg(not(test))]
pub fn retry_failures_for_app(
    app: &AppHandle,
    batch_id: i64,
) -> Result<LibraryCompletionArtistVerificationStatus> {
    let (mut conn, _) = db::open(app)?;
    let status = retry_failures_for_connection(&mut conn, batch_id)?;
    spawn_verification_worker(app.clone());
    Ok(status)
}

#[cfg(not(test))]
pub fn confirm_match_for_app(
    app: &AppHandle,
    request: ConfirmLibraryCompletionArtistMatchRequest,
) -> Result<LibraryCompletionArtistCandidate> {
    let (mut conn, _) = db::open(app)?;
    let artist_id = trimmed(request.artist_id, MAX_ARTIST_KEY_LENGTH);
    let candidate = get_for_connection(&conn, false)?
        .candidates
        .into_iter()
        .find(|candidate| candidate.id == artist_id)
        .context("The selected chart artist is no longer missing from the library.")?;
    let result = run_verification(&mut conn, None, &candidate.artist, Some(request.candidate));
    save_verification_result(&conn, &candidate.id, &candidate.artist, &result)?;
    get_for_connection(&conn, false)?
        .candidates
        .into_iter()
        .find(|value| value.id == candidate.id)
        .context("Could not reload the verified chart artist.")
}

#[cfg(not(test))]
pub fn set_decision_for_app(
    app: &AppHandle,
    request: SetLibraryCompletionArtistDecisionRequest,
) -> Result<LibraryCompletionArtistDecision> {
    let (conn, _) = db::open(app)?;
    set_decision_for_connection(&conn, request)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn connection() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        db::configure(&conn).expect("configure database");
        db::migrate(&conn).expect("migrate database");
        conn.execute(
            "INSERT INTO import_runs (source_path, started_at, status) VALUES ('test.tsv', 'now', 'completed')",
            [],
        )
        .expect("insert import run");
        conn
    }

    fn insert_chart_artist(conn: &Connection, artist: &str, artist_key: &str) {
        conn.execute(
            "INSERT INTO billboard_chart_entries (source_file, year, rank, artist, album, artist_key, album_key, imported_at) VALUES ('albums.csv', 1992, 4, ?1, 'Chart Album', ?2, 'chart album', 'now')",
            params![artist, artist_key],
        )
        .expect("insert album chart artist");
        conn.execute(
            "INSERT INTO official_uk_single_chart_entries (source_file, year, week, chart_date, rank, artist, title, artist_key, title_key, week_key, imported_at) VALUES ('singles.csv', 1993, 1, '1993-01-01', 2, ?1, 'Chart Single', ?2, 'chart single', '1993-01', 'now')",
            params![artist, artist_key],
        )
        .expect("insert single chart artist");
    }

    #[test]
    fn discovers_absent_artists_across_album_and_single_charts() {
        let conn = connection();
        insert_chart_artist(&conn, "Missing Artist", "missing artist");
        insert_chart_artist(&conn, "Owned Artist", "owned artist");
        conn.execute(
            "INSERT INTO albums (id, import_run_id, album, album_artist_display, total_tracks, rated_tracks, rating_completeness, total_seconds, loved_tracks, tmoe_seconds, ae_ratio) VALUES ('owned', 1, 'Owned Album', 'Owned Artist', 1, 0, 0, 180, 0, 0, 0)",
            [],
        )
        .expect("insert owned artist");

        let response = get_for_connection(&conn, true).expect("discover chart artists");
        assert_eq!(response.total_chart_artists, 2);
        assert_eq!(response.owned_artist_count, 1);
        assert_eq!(response.candidates.len(), 1);
        assert_eq!(response.candidates[0].artist, "Missing Artist");
        assert_eq!(response.candidates[0].evidence.len(), 2);
        assert!(response.candidates[0]
            .evidence
            .iter()
            .any(|evidence| evidence.chart_kind == "singles"));
    }

    #[test]
    fn verified_artist_is_added_to_the_existing_wish_list_artist_section() {
        let conn = connection();
        insert_chart_artist(&conn, "Missing Artist", "missing artist");
        let artist_mbid = "11111111-1111-1111-1111-111111111111";
        let album_mbid = "22222222-2222-2222-2222-222222222222";
        conn.execute(
            "INSERT INTO musicbrainz_artist_release_groups (artist_mbid, release_mbid, title, year, type, secondary_types, status, source, fetched_at) VALUES (?1, ?2, 'First Album', 1992, 'Album', '', 'Official', 'test', 'now')",
            params![artist_mbid, album_mbid],
        )
        .expect("cache official album");
        conn.execute(
            "INSERT INTO musicbrainz_release_status_cache (artist_mbid, release_mbid, has_official_release, checked_at) VALUES (?1, ?2, 1, 'now')",
            params![artist_mbid, album_mbid],
        )
        .expect("cache official status");
        save_verification_result(
            &conn,
            "missing artist",
            "Missing Artist",
            &ArtistVerificationResult {
                outcome: "verified".to_string(),
                message: "Verified".to_string(),
                musicbrainz_outcome: Some("verified".to_string()),
                musicbrainz_message: Some("Verified".to_string()),
                musicbrainz_id: Some(artist_mbid.to_string()),
                musicbrainz_url: Some(format!("https://musicbrainz.org/artist/{artist_mbid}")),
                official_album_count: 1,
                discogs_outcome: Some("verified".to_string()),
                discogs_message: Some("Corroborated".to_string()),
                discogs_master_id: Some("42".to_string()),
                discogs_url: Some("https://www.discogs.com/master/42".to_string()),
                discogs_studio_album_title: Some("First Album".to_string()),
            },
        )
        .expect("save artist verification");

        let decision = set_decision_for_connection(
            &conn,
            SetLibraryCompletionArtistDecisionRequest {
                artist_id: "missing artist".to_string(),
                artist: "Missing Artist".to_string(),
                status: "wanted".to_string(),
            },
        )
        .expect("add artist to wish list");
        assert_eq!(decision.missing_album_count, Some(1));
        let entity: String = conn
            .query_row(
                "SELECT entity FROM wish_list_items WHERE id = ?1",
                params![decision.wish_list_item_id],
                |row| row.get(0),
            )
            .expect("load wish list item");
        assert_eq!(entity, "artist");
    }
}
