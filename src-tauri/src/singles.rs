//! Official singles for album tracks, so Aurora and Tonehavn can badge them.
//!
//! Evidence comes from MusicBrainz only. Per artist we browse the `Single`
//! release groups (one request for most artists) and, when the album's release
//! group is already cached, ask for its `single from` relationships. Results
//! are written to `track_singles` in the shared catalog, keyed exactly like
//! `lastfm_track_popularity` (`lower(trim(album_artist_display))`,
//! `lower(trim(title))`) so readers need no extra normalisation.
//!
//! Confidence is explicit. `confirmed` rows are shown to users; `possible`
//! rows (a title match outside the album's release window) are kept for review
//! but readers must not badge them.

use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

const RELEASE_GROUPS_URL: &str = "https://musicbrainz.org/ws/2/release-group";
const PAGE_LIMIT: usize = 100;
/// How long an artist's result is trusted before the job looks again.
const REFRESH_AFTER_DAYS: i64 = 90;
/// A single counts as "from" an album when first released this many years
/// before or after the album. Lead singles precede albums; others trail them.
const WINDOW_YEARS_BEFORE: i32 = 1;
const WINDOW_YEARS_AFTER: i32 = 3;
/// Per-artist ceiling on relationship lookups; each is one rate-limited request.
const MAX_RELATIONSHIP_LOOKUPS: usize = 25;
/// Secondary types that mean the group is not the song's official single.
const EXCLUDED_SECONDARY_TYPES: &[&str] = &[
    "live",
    "remix",
    "demo",
    "dj-mix",
    "mixtape/street",
    "spokenword",
    "interview",
    "audiobook",
    "audio drama",
    "field recording",
    "compilation",
];
/// Words that only describe a version of a song, never a different song.
const VERSION_WORDS: &[&str] = &[
    "version", "edit", "mix", "remaster", "remastered", "mono", "stereo", "single", "radio",
    "album", "extended", "original",
];

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct SingleRelease {
    pub mbid: String,
    pub title: String,
    pub year: Option<i32>,
    pub secondary_types: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct AlbumContext {
    pub title: String,
    pub year: Option<i32>,
    pub tracks: Vec<String>,
    /// MusicBrainz release group, when the cache already resolved this album.
    pub release_group_mbid: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Confidence {
    Confirmed,
    Possible,
}

impl Confidence {
    fn as_str(self) -> &'static str {
        match self {
            Self::Confirmed => "confirmed",
            Self::Possible => "possible",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Source {
    Relationship,
    TitleMatch,
}

impl Source {
    fn as_str(self) -> &'static str {
        match self {
            Self::Relationship => "musicbrainz-relationship",
            Self::TitleMatch => "musicbrainz-title",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct TrackSingle {
    pub track_title: String,
    pub single_mbid: String,
    pub single_title: String,
    pub single_year: Option<i32>,
    pub confidence: Confidence,
    pub source: Source,
}

#[derive(Debug, Clone, Serialize, PartialEq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackSinglesRefreshSummary {
    pub requested: u32,
    pub artists_checked: u32,
    pub singles_found: u32,
    pub failed: u32,
    pub remaining: i64,
    pub message: String,
}

/// Title identity for single/track matching: version decorations such as
/// "(Single Version)" or "- 2011 Remaster" are dropped, then the library's
/// loose key folds case, accents and punctuation.
pub(crate) fn title_key(title: &str) -> String {
    crate::identity::loose_key(&strip_version_suffix(title))
}

fn has_version_word(text: &str) -> bool {
    text.to_lowercase()
        .split(|character: char| !character.is_alphanumeric())
        .any(|word| VERSION_WORDS.contains(&word))
}

fn strip_version_suffix(title: &str) -> String {
    let mut text = title.trim().to_string();
    loop {
        let trimmed = text.trim_end();
        let bracket = match trimmed.chars().last() {
            Some(')') => trimmed.rfind('('),
            Some(']') => trimmed.rfind('['),
            _ => None,
        };
        match bracket {
            Some(start) if has_version_word(&trimmed[start..]) && start > 0 => {
                text = trimmed[..start].to_string();
            }
            _ => break,
        }
    }
    if let Some(index) = text.rfind(" - ") {
        if has_version_word(&text[index + 3..]) {
            text.truncate(index);
        }
    }
    text
}

fn is_excluded(single: &SingleRelease) -> bool {
    single.secondary_types.iter().any(|kind| {
        EXCLUDED_SECONDARY_TYPES.contains(&kind.trim().to_lowercase().as_str())
    })
}

fn within_release_window(album_year: Option<i32>, single_year: Option<i32>) -> bool {
    match (album_year, single_year) {
        (Some(album), Some(single)) => {
            single >= album - WINDOW_YEARS_BEFORE && single <= album + WINDOW_YEARS_AFTER
        }
        _ => false,
    }
}

fn earliest<'a>(items: &mut [&'a SingleRelease]) -> Option<&'a SingleRelease> {
    items.sort_by_key(|single| (single.year.unwrap_or(i32::MAX), single.mbid.clone()));
    items.first().copied()
}

/// Matches an album's tracks to an artist's single release groups by title.
/// Only in-window matches are confirmed; the earliest in-window single wins.
pub(crate) fn match_by_title(album: &AlbumContext, singles: &[SingleRelease]) -> Vec<TrackSingle> {
    let mut by_key: HashMap<String, Vec<&SingleRelease>> = HashMap::new();
    for single in singles.iter().filter(|single| !is_excluded(single)) {
        let key = title_key(&single.title);
        if !key.is_empty() {
            by_key.entry(key).or_default().push(single);
        }
    }
    let mut matches = Vec::new();
    for track in &album.tracks {
        let Some(candidates) = by_key.get(&title_key(track)) else {
            continue;
        };
        let mut in_window = candidates
            .iter()
            .copied()
            .filter(|single| within_release_window(album.year, single.year))
            .collect::<Vec<_>>();
        let (chosen, confidence) = match earliest(&mut in_window) {
            Some(single) => (single, Confidence::Confirmed),
            None => {
                let mut all = candidates.clone();
                match earliest(&mut all) {
                    Some(single) => (single, Confidence::Possible),
                    None => continue,
                }
            }
        };
        matches.push(TrackSingle {
            track_title: track.clone(),
            single_mbid: chosen.mbid.clone(),
            single_title: chosen.title.clone(),
            single_year: chosen.year,
            confidence,
            source: Source::TitleMatch,
        });
    }
    matches
}

/// Singles that MusicBrainz itself links to the album with `single from`.
/// A link is authoritative, so it needs no release-window check.
pub(crate) fn match_by_relationship(
    album: &AlbumContext,
    linked: &[SingleRelease],
) -> Vec<TrackSingle> {
    let tracks = album
        .tracks
        .iter()
        .map(|track| (title_key(track), track))
        .collect::<Vec<_>>();
    let mut matches = Vec::new();
    for single in linked.iter().filter(|single| !is_excluded(single)) {
        let key = title_key(&single.title);
        if key.is_empty() {
            continue;
        }
        for (_, track) in tracks.iter().filter(|(track_key, _)| *track_key == key) {
            matches.push(TrackSingle {
                track_title: (*track).clone(),
                single_mbid: single.mbid.clone(),
                single_title: single.title.clone(),
                single_year: single.year,
                confidence: Confidence::Confirmed,
                source: Source::Relationship,
            });
        }
    }
    matches
}

fn strength(single: &TrackSingle) -> u8 {
    match (single.confidence, single.source) {
        (Confidence::Confirmed, Source::Relationship) => 3,
        (Confidence::Confirmed, Source::TitleMatch) => 2,
        (Confidence::Possible, _) => 1,
    }
}

/// One row per track title: the strongest evidence wins.
pub(crate) fn merge(groups: impl IntoIterator<Item = Vec<TrackSingle>>) -> Vec<TrackSingle> {
    let mut best: HashMap<String, TrackSingle> = HashMap::new();
    for single in groups.into_iter().flatten() {
        let key = single.track_title.trim().to_lowercase();
        match best.get(&key) {
            Some(current) if strength(current) >= strength(&single) => {}
            _ => {
                best.insert(key, single);
            }
        }
    }
    let mut rows = best.into_values().collect::<Vec<_>>();
    rows.sort_by(|left, right| left.track_title.cmp(&right.track_title));
    rows
}

pub(crate) fn install_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS track_singles (
            artist_key TEXT NOT NULL,
            track_key TEXT NOT NULL,
            artist_name TEXT NOT NULL,
            track_name TEXT NOT NULL,
            single_mbid TEXT NOT NULL,
            single_title TEXT NOT NULL,
            single_year INTEGER,
            confidence TEXT NOT NULL CHECK(confidence IN ('confirmed', 'possible')),
            source TEXT NOT NULL,
            fetched_at TEXT NOT NULL,
            PRIMARY KEY (artist_key, track_key)
        );
        CREATE INDEX IF NOT EXISTS idx_track_singles_artist ON track_singles(artist_key);
        CREATE TABLE IF NOT EXISTS track_singles_checks (
            local_artist_key TEXT PRIMARY KEY,
            artist_mbid TEXT NOT NULL,
            single_count INTEGER NOT NULL,
            checked_at TEXT NOT NULL
        );",
    )
    .context("Could not create the track singles schema")
}

pub(crate) fn schema_exists(conn: &Connection) -> Result<bool> {
    Ok(conn.query_row(
        "SELECT COUNT(*) = 2 FROM sqlite_master WHERE
         (type = 'table' AND name IN ('track_singles', 'track_singles_checks'))",
        [],
        |row| row.get(0),
    )?)
}

/// Replaces the artist's singles. `display_artist` is the raw
/// `album_artist_display` text; the key is derived in SQL like Aurora's join.
pub(crate) fn save_artist_singles(
    conn: &mut Connection,
    local_artist_key: &str,
    display_artist: &str,
    artist_mbid: &str,
    singles: &[TrackSingle],
    checked_at: &str,
) -> Result<()> {
    let tx = conn.transaction()?;
    tx.execute(
        "DELETE FROM track_singles WHERE artist_key = lower(trim(?1))",
        [display_artist],
    )?;
    for single in singles {
        tx.execute(
            "INSERT INTO track_singles (
                artist_key, track_key, artist_name, track_name, single_mbid,
                single_title, single_year, confidence, source, fetched_at
             ) VALUES (lower(trim(?1)), lower(trim(?2)), ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(artist_key, track_key) DO UPDATE SET
                track_name = excluded.track_name,
                single_mbid = excluded.single_mbid,
                single_title = excluded.single_title,
                single_year = excluded.single_year,
                confidence = excluded.confidence,
                source = excluded.source,
                fetched_at = excluded.fetched_at",
            params![
                display_artist,
                single.track_title,
                single.single_mbid,
                single.single_title,
                single.single_year,
                single.confidence.as_str(),
                single.source.as_str(),
                checked_at,
            ],
        )?;
    }
    tx.execute(
        "INSERT INTO track_singles_checks (local_artist_key, artist_mbid, single_count, checked_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(local_artist_key) DO UPDATE SET
            artist_mbid = excluded.artist_mbid,
            single_count = excluded.single_count,
            checked_at = excluded.checked_at",
        params![local_artist_key, artist_mbid, singles.len() as i64, checked_at],
    )?;
    tx.commit()?;
    Ok(())
}

// ---------------------------------------------------------------- MusicBrainz

#[derive(Debug, Deserialize)]
struct ReleaseGroupJson {
    id: String,
    #[serde(default)]
    title: String,
    #[serde(rename = "first-release-date", default)]
    first_release_date: Option<String>,
    #[serde(rename = "secondary-types", default)]
    secondary_types: Vec<String>,
}

impl From<ReleaseGroupJson> for SingleRelease {
    fn from(value: ReleaseGroupJson) -> Self {
        Self {
            year: value
                .first_release_date
                .as_deref()
                .and_then(|date| date.get(..4))
                .and_then(|year| year.parse().ok()),
            mbid: value.id,
            title: value.title,
            secondary_types: value.secondary_types,
        }
    }
}

#[derive(Debug, Deserialize)]
struct BrowseResponse {
    #[serde(rename = "release-groups", default)]
    release_groups: Vec<ReleaseGroupJson>,
    #[serde(rename = "release-group-count", default)]
    count: usize,
}

#[derive(Debug, Deserialize)]
struct LookupResponse {
    #[serde(default)]
    relations: Vec<RelationJson>,
}

#[derive(Debug, Deserialize)]
struct RelationJson {
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    release_group: Option<ReleaseGroupJson>,
}

fn fetch_artist_singles(artist_mbid: &str) -> Result<Vec<SingleRelease>> {
    let mut singles = Vec::new();
    let mut offset = 0usize;
    loop {
        let url = format!(
            "{RELEASE_GROUPS_URL}?artist={artist_mbid}&type=single&fmt=json&limit={PAGE_LIMIT}&offset={offset}"
        );
        let page = crate::http::musicbrainz()
            .get(&url)
            .timeout(Duration::from_secs(20))
            .call()
            .with_context(|| format!("Could not fetch MusicBrainz singles for {artist_mbid}"))?
            .into_json::<BrowseResponse>()
            .context("Could not parse the MusicBrainz singles response")?;
        let total = page.count;
        singles.extend(page.release_groups.into_iter().map(SingleRelease::from));
        offset += PAGE_LIMIT;
        if offset >= total {
            return Ok(singles);
        }
    }
}

fn fetch_single_from_links(album_release_group: &str) -> Result<Vec<SingleRelease>> {
    let url = format!("{RELEASE_GROUPS_URL}/{album_release_group}?inc=release-group-rels&fmt=json");
    let response = crate::http::musicbrainz()
        .get(&url)
        .timeout(Duration::from_secs(20))
        .call()
        .with_context(|| format!("Could not fetch MusicBrainz links for {album_release_group}"))?
        .into_json::<LookupResponse>()
        .context("Could not parse the MusicBrainz release-group links")?;
    // The album sits on one end of a `single from` link; the other end is the single.
    Ok(response
        .relations
        .into_iter()
        .filter(|relation| relation.kind == "single from")
        .filter_map(|relation| relation.release_group)
        .filter(|group| group.id != album_release_group)
        .map(SingleRelease::from)
        .collect())
}

// ------------------------------------------------------------------- catalog

struct LocalArtist {
    local_artist_key: String,
    display_artist: String,
    mbid: String,
}

/// Linked artists never checked, or checked before `REFRESH_AFTER_DAYS`.
fn due_artists(conn: &Connection, limit: u32) -> Result<(Vec<LocalArtist>, i64)> {
    let due = format!(
        "FROM musicbrainz_artist_links links
         LEFT JOIN track_singles_checks checks ON checks.local_artist_key = links.local_artist_key
         WHERE links.ignored = 0 AND NULLIF(TRIM(COALESCE(links.mbid, '')), '') IS NOT NULL
           AND (checks.checked_at IS NULL
                OR checks.checked_at < datetime('now', '-{REFRESH_AFTER_DAYS} days'))"
    );
    let remaining: i64 = conn.query_row(&format!("SELECT COUNT(*) {due}"), [], |row| row.get(0))?;
    let mut statement = conn.prepare(&format!(
        "SELECT links.local_artist_key, links.display_artist, links.mbid {due}
         ORDER BY links.local_artist_key LIMIT ?1"
    ))?;
    let artists = statement
        .query_map([limit], |row| {
            Ok(LocalArtist {
                local_artist_key: row.get(0)?,
                display_artist: row.get(1)?,
                mbid: row.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok((artists, remaining))
}

fn local_albums(conn: &Connection, artist: &LocalArtist) -> Result<Vec<AlbumContext>> {
    let key_sql = crate::identity::catalog_artist_key_sql("album_artist_display");
    let mut albums = conn.prepare(&format!(
        "SELECT id, album, COALESCE(release_year, year) FROM albums
         WHERE {key_sql} = ?1 AND NULLIF(TRIM(COALESCE(album, '')), '') IS NOT NULL"
    ))?;
    let rows = albums
        .query_map([&artist.local_artist_key], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<i32>>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut tracks = conn.prepare(
        "SELECT DISTINCT title FROM tracks WHERE album_id = ?1 AND NULLIF(TRIM(COALESCE(title, '')), '') IS NOT NULL",
    )?;
    let mut contexts = Vec::new();
    for (id, title, year) in rows {
        let titles = tracks
            .query_map([&id], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        contexts.push(AlbumContext {
            release_group_mbid: cached_album_release_group(conn, &artist.mbid, &title, year),
            title,
            year,
            tracks: titles,
        });
    }
    Ok(contexts)
}

/// Reuses the artist-discography cache; never spends a request on resolution.
fn cached_album_release_group(
    conn: &Connection,
    artist_mbid: &str,
    album_title: &str,
    album_year: Option<i32>,
) -> Option<String> {
    let wanted = crate::identity::loose_key(album_title);
    let mut statement = conn
        .prepare(
            "SELECT release_mbid, title, year FROM musicbrainz_artist_release_groups
             WHERE artist_mbid = ?1 AND type = 'Album'",
        )
        .ok()?;
    let rows = statement
        .query_map([artist_mbid], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<i32>>(2)?,
            ))
        })
        .ok()?
        .filter_map(Result::ok)
        .filter(|(_, title, year)| {
            crate::identity::loose_key(title) == wanted
                && match (album_year, year) {
                    (Some(left), Some(right)) => (left - right).abs() <= 1,
                    _ => true,
                }
        })
        .collect::<Vec<_>>();
    // Two equally good candidates is an identity question; do not guess.
    (rows.len() == 1).then(|| rows[0].0.clone())
}

fn singles_for_artist(
    artist_singles: &[SingleRelease],
    albums: &[AlbumContext],
    mut linked_singles: impl FnMut(&str) -> Vec<SingleRelease>,
) -> Vec<TrackSingle> {
    let mut lookups = 0;
    let mut groups = Vec::new();
    for album in albums {
        groups.push(match_by_title(album, artist_singles));
        if let Some(group) = album.release_group_mbid.as_deref() {
            if lookups < MAX_RELATIONSHIP_LOOKUPS {
                lookups += 1;
                groups.push(match_by_relationship(album, &linked_singles(group)));
            }
        }
    }
    merge(groups)
}

/// Background job body: refresh up to `limit` artists whose singles are unknown or stale.
#[cfg(not(test))]
pub fn refresh_track_singles(
    app: tauri::AppHandle,
    limit: u32,
) -> Result<TrackSinglesRefreshSummary> {
    let (mut conn, _) = crate::db::open(&app)?;
    let (artists, remaining_before) = due_artists(&conn, limit)?;
    let requested = artists.len() as u32;
    let (mut checked, mut found, mut failed) = (0u32, 0u32, 0u32);
    for artist in artists {
        crate::jobs::checkpoint()?;
        crate::jobs::progress(
            i64::from(checked + failed),
            i64::from(requested),
            &format!("Finding singles for {}", artist.display_artist),
        );
        let outcome = fetch_artist_singles(&artist.mbid).and_then(|singles| {
            let albums = local_albums(&conn, &artist)?;
            Ok(singles_for_artist(&singles, &albums, |group| {
                fetch_single_from_links(group).unwrap_or_default()
            }))
        });
        match outcome {
            Ok(rows) => {
                found += rows
                    .iter()
                    .filter(|row| row.confidence == Confidence::Confirmed)
                    .count() as u32;
                save_artist_singles(
                    &mut conn,
                    &artist.local_artist_key,
                    &artist.display_artist,
                    &artist.mbid,
                    &rows,
                    &chrono::Utc::now().to_rfc3339(),
                )?;
                checked += 1;
            }
            // Leave the artist unchecked so the next run retries it.
            Err(_) => failed += 1,
        }
    }
    let remaining = remaining_before - i64::from(checked);
    Ok(TrackSinglesRefreshSummary {
        requested,
        artists_checked: checked,
        singles_found: found,
        failed,
        remaining,
        message: format!(
            "Checked {checked} artists and found {found} singles; {remaining} artists still to check."
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn single(mbid: &str, title: &str, year: i32) -> SingleRelease {
        SingleRelease {
            mbid: mbid.into(),
            title: title.into(),
            year: Some(year),
            secondary_types: Vec::new(),
        }
    }

    fn album(year: i32, tracks: &[&str]) -> AlbumContext {
        AlbumContext {
            title: "The Fire Inside".into(),
            year: Some(year),
            tracks: tracks.iter().map(|track| track.to_string()).collect(),
            release_group_mbid: None,
        }
    }

    #[test]
    fn title_key_drops_version_decorations_only() {
        assert_eq!(title_key("Take A Chance (Single Version)"), "take a chance");
        assert_eq!(title_key("Heroes - 2017 Remaster"), "heroes");
        assert_eq!(title_key("Love (Is a Battlefield)"), "love is a battlefield");
        assert_eq!(title_key("Rock Me [Radio Edit] (Remastered)"), "rock me");
        // "Remix" is a different recording, not a decoration.
        assert_eq!(title_key("Rock Me (Remix)"), "rock me remix");
    }

    #[test]
    fn title_match_inside_the_release_window_is_confirmed() {
        let matches = match_by_title(
            &album(1991, &["Take A Chance", "Sightseeing"]),
            &[single("a", "Take a Chance (Edit)", 1991)],
        );
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].track_title, "Take A Chance");
        assert_eq!(matches[0].confidence, Confidence::Confirmed);
        assert_eq!(matches[0].source, Source::TitleMatch);
    }

    #[test]
    fn title_match_outside_the_window_is_only_possible() {
        let matches = match_by_title(
            &album(1991, &["Take A Chance"]),
            &[single("a", "Take A Chance", 2005)],
        );
        assert_eq!(matches[0].confidence, Confidence::Possible);
    }

    #[test]
    fn missing_years_never_confirm() {
        let mut undated = single("a", "Take A Chance", 1991);
        undated.year = None;
        let matches = match_by_title(&album(1991, &["Take A Chance"]), &[undated]);
        assert_eq!(matches[0].confidence, Confidence::Possible);
    }

    #[test]
    fn earliest_in_window_single_wins() {
        let matches = match_by_title(
            &album(1991, &["Take A Chance"]),
            &[single("late", "Take A Chance", 1993), single("early", "Take A Chance", 1991)],
        );
        assert_eq!(matches[0].single_mbid, "early");
    }

    #[test]
    fn live_and_remix_singles_are_ignored() {
        let mut live = single("a", "Take A Chance", 1991);
        live.secondary_types = vec!["Live".into()];
        assert!(match_by_title(&album(1991, &["Take A Chance"]), &[live]).is_empty());
    }

    #[test]
    fn relationship_ignores_the_release_window_and_beats_title_evidence() {
        let album = album(1995, &["I Will Remember"]);
        let singles = [single("title", "I Will Remember", 2010)];
        let linked = [single("linked", "I Will Remember", 2010)];
        let rows = merge([
            match_by_title(&album, &singles),
            match_by_relationship(&album, &linked),
        ]);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].single_mbid, "linked");
        assert_eq!(rows[0].confidence, Confidence::Confirmed);
        assert_eq!(rows[0].source, Source::Relationship);
    }

    #[test]
    fn schema_round_trip_keys_rows_like_the_lastfm_cache() {
        let mut conn = Connection::open_in_memory().unwrap();
        install_schema(&conn).unwrap();
        assert!(schema_exists(&conn).unwrap());
        let rows = [TrackSingle {
            track_title: "  Take A Chance ".into(),
            single_mbid: "a".into(),
            single_title: "Take A Chance".into(),
            single_year: Some(1991),
            confidence: Confidence::Confirmed,
            source: Source::TitleMatch,
        }];
        save_artist_singles(&mut conn, "bob seger", " Bob Seger ", "mbid", &rows, "2026-11-02").unwrap();
        save_artist_singles(&mut conn, "bob seger", " Bob Seger ", "mbid", &rows, "2026-11-03").unwrap();
        let (artist, track, confidence): (String, String, String) = conn
            .query_row(
                "SELECT artist_key, track_key, confidence FROM track_singles",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!((artist.as_str(), track.as_str(), confidence.as_str()), ("bob seger", "take a chance", "confirmed"));
        let checks: i64 = conn
            .query_row("SELECT COUNT(*) FROM track_singles_checks", [], |row| row.get(0))
            .unwrap();
        assert_eq!(checks, 1);
    }

    #[test]
    fn relationship_lookups_are_capped_per_artist() {
        let albums = (0..40)
            .map(|index| AlbumContext {
                release_group_mbid: Some(format!("rg{index}")),
                ..album(1991, &["Song"])
            })
            .collect::<Vec<_>>();
        let mut calls = 0;
        singles_for_artist(&[], &albums, |_| {
            calls += 1;
            Vec::new()
        });
        assert_eq!(calls, MAX_RELATIONSHIP_LOOKUPS);
    }
}
