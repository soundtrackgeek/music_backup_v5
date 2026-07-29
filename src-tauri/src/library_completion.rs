#[cfg(not(test))]
use crate::db;
use crate::wishlist::{self, AddWishListItemRequest};
use anyhow::{bail, Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
#[cfg(not(test))]
use tauri::AppHandle;

const MAX_RETURNED_CANDIDATES: usize = 5_000;
const MAX_CANDIDATE_KEY_LENGTH: usize = 800;
const MAX_TEXT_LENGTH: usize = 300;

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
    match (&request.source, request.decade) {
        (None, None) => Ok(None),
        (Some(source), Some(decade)) => {
            if !matches!(source.as_str(), "billboard" | "officialUk" | "vgLista") {
                bail!("The Library Completion chart source is not supported.")
            }
            if !(1000..=3000).contains(&decade) || decade % 10 != 0 {
                bail!("The Library Completion decade is outside the supported range.")
            }
            Ok(Some(request))
        }
        _ => bail!("Choose both a chart source and decade for a Library Completion campaign."),
    }
}

fn get_for_connection(
    conn: &Connection,
    request: Option<LibraryCompletionRequest>,
) -> Result<LibraryCompletionResponse> {
    let request = normalize_request(request)?;
    let source_rows = load_source_rows(conn)?;
    let decisions = load_decisions(conn)?;
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
            musicbrainz_id: decision.and_then(|value| value.musicbrainz_id.clone()),
            musicbrainz_url: decision.and_then(|value| value.musicbrainz_url.clone()),
            cover_url: None,
            evidence: aggregate.evidence,
        });
    }

    let total_candidates = candidates
        .iter()
        .filter(|candidate| candidate.status != "notForMe")
        .count();

    if let Some(request) = &request {
        let source = request.source.as_deref().unwrap_or_default();
        let decade = request.decade.unwrap_or_default();
        candidates.retain(|candidate| {
            candidate.evidence.iter().any(|evidence| {
                evidence.source == source && evidence.first_year.div_euclid(10) * 10 == decade
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

    let truncated = request.is_none() && candidates.len() > MAX_RETURNED_CANDIDATES;
    if request.is_none() {
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
            wanted: counts.wanted,
            needs_review: counts.needs_review,
            excluded: counts.excluded,
            total: counts.owned
                + counts.candidates
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
            }),
        )
        .expect("get scoped completion data");

        assert_eq!(response.candidates.len(), 1);
        assert_eq!(response.candidates[0].title, "Purple Rain");
        assert!(!response.truncated);
        assert_eq!(response.atlas.len(), 2);
        assert_eq!(response.total_candidates, 2);
    }
}
