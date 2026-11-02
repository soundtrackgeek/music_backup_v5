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
//!
//! Two kinds of artist are checked. `verified` artists are the ones you linked
//! to MusicBrainz. `name` artists only have a MusicBrainz id because the shared
//! artist-name cache matched their name, which nobody confirmed, so their
//! results are shown only when your own albums back the match (see
//! [`gate_name_match`]); otherwise they are stored as `possible`.
//!
//! The refresh job is long-running, so it touches the catalog only in short
//! bursts (one read per artist, one small write per artist) and never while
//! waiting on MusicBrainz.

use anyhow::{Context, Result};
use rusqlite::{params, Connection, OpenFlags};
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
/// Without an album of yours matching the artist's discography, a name match
/// needs this many independent confirmed singles before it is believed.
const MIN_CONFIRMED_WITHOUT_ALBUM_EVIDENCE: usize = 2;
/// A name-matched artist with more singles than this is a catch-all entry
/// (compilations, "various"), not a band.
const MAX_SINGLES_FOR_NAME_MATCH: usize = 1000;
/// MusicBrainz's special entries for "Various Artists" and "[unknown]".
const SPECIAL_ARTIST_MBIDS: &[&str] = &[
    "89ad4ac3-39f7-470e-963a-56509c546377",
    "125ec42a-7229-4250-afc5-e057484327fe",
];
/// Catalog artist keys that are placeholders, never a real act.
const PLACEHOLDER_ARTIST_KEYS: &[&str] = &[
    "various artists",
    "various",
    "va",
    "v.a.",
    "unknown artist",
    "unknown",
    "[unknown]",
    "<unknown>",
    "soundtrack",
    "ost",
];
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
    "version",
    "edit",
    "mix",
    "remaster",
    "remastered",
    "mono",
    "stereo",
    "single",
    "radio",
    "album",
    "extended",
    "original",
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
    single
        .secondary_types
        .iter()
        .any(|kind| EXCLUDED_SECONDARY_TYPES.contains(&kind.trim().to_lowercase().as_str()))
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

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    Ok(conn.query_row(
        "SELECT COUNT(*) > 0 FROM pragma_table_info(?1) WHERE name = ?2",
        params![table, column],
        |row| row.get(0),
    )?)
}

/// Schema step 69: remember how many albums each artist had when it was
/// checked, so new music makes the artist due again. Existing checks are
/// credited with today's album count, which assumes they were current.
pub(crate) fn install_recheck_columns(conn: &Connection) -> Result<()> {
    if !column_exists(conn, "track_singles_checks", "album_count")? {
        conn.execute_batch("ALTER TABLE track_singles_checks ADD COLUMN album_count INTEGER")
            .context("Could not add the album count to the singles checks")?;
    }
    let has_albums: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type = 'table' AND name = 'albums'",
        [],
        |row| row.get(0),
    )?;
    if has_albums {
        let key_sql = crate::identity::catalog_artist_key_sql("album_artist_display");
        conn.execute_batch(&format!(
            "UPDATE track_singles_checks SET album_count = (
                SELECT COUNT(*) FROM albums
                WHERE {key_sql} = track_singles_checks.local_artist_key
                  AND NULLIF(TRIM(COALESCE(album, '')), '') IS NOT NULL)
             WHERE album_count IS NULL"
        ))
        .context("Could not record the album counts of earlier singles checks")?;
    }
    Ok(())
}

pub(crate) fn recheck_columns_exist(conn: &Connection) -> Result<bool> {
    column_exists(conn, "track_singles_checks", "album_count")
}

/// Schema step 70: the artist-name cache's matches (copied into the catalog so
/// the due query stays one SQL statement) and the basis each check was made on.
/// Earlier checks all came from linked artists, which `COALESCE` reads as `verified`.
pub(crate) fn install_name_matches(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS track_singles_name_matches (
            name_key TEXT PRIMARY KEY,
            mbid TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS track_singles_name_matches_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            stamp TEXT NOT NULL
        );",
    )
    .context("Could not create the singles name-match tables")?;
    if !column_exists(conn, "track_singles_checks", "basis")? {
        conn.execute_batch("ALTER TABLE track_singles_checks ADD COLUMN basis TEXT")
            .context("Could not add the basis to the singles checks")?;
    }
    Ok(())
}

pub(crate) fn name_matches_exist(conn: &Connection) -> Result<bool> {
    Ok(column_exists(conn, "track_singles_checks", "basis")?
        && conn.query_row(
            "SELECT COUNT(*) = 2 FROM sqlite_master WHERE type = 'table'
             AND name IN ('track_singles_name_matches', 'track_singles_name_matches_state')",
            [],
            |row| row.get(0),
        )?)
}

/// Replaces the stored name matches with the cache's `artist_name -> mbid` rows.
pub(crate) fn sync_name_matches(conn: &mut Connection, cache: &Connection, stamp: &str) -> Result<usize> {
    let rows = cache
        .prepare(
            "SELECT lower(trim(name)), trim(mbid) FROM artist_cache
             WHERE NULLIF(TRIM(COALESCE(mbid, '')), '') IS NOT NULL
               AND NULLIF(TRIM(COALESCE(name, '')), '') IS NOT NULL",
        )?
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM track_singles_name_matches", [])?;
    {
        let mut insert = tx.prepare(
            "INSERT OR IGNORE INTO track_singles_name_matches (name_key, mbid) VALUES (?1, ?2)",
        )?;
        for (name, mbid) in &rows {
            insert.execute(params![name, mbid])?;
        }
    }
    tx.execute(
        "INSERT INTO track_singles_name_matches_state (id, stamp) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET stamp = excluded.stamp",
        [stamp],
    )?;
    tx.commit()?;
    Ok(rows.len())
}

fn name_matches_stamp(conn: &Connection) -> Option<String> {
    conn.query_row(
        "SELECT stamp FROM track_singles_name_matches_state WHERE id = 1",
        [],
        |row| row.get(0),
    )
    .ok()
}

/// Copies the artist-name cache into the catalog when the cache file changed.
/// A missing or unreadable cache is not an error: only verified artists are checked then.
#[cfg(not(test))]
pub(crate) fn ensure_name_matches(app: &tauri::AppHandle) -> Result<()> {
    let path = crate::db::settings_for_app(app)?.musicbrainz_cache_path;
    let Ok(metadata) = std::fs::metadata(&path) else {
        return Ok(());
    };
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |elapsed| elapsed.as_secs());
    let stamp = format!("{}:{modified}", metadata.len());
    {
        let (conn, _) = crate::db::open_read(app)?;
        if name_matches_stamp(&conn).as_deref() == Some(stamp.as_str()) {
            return Ok(());
        }
    }
    let cache = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .context("Could not open the MusicBrainz artist cache")?;
    let (mut conn, _) = crate::db::open(app)?;
    sync_name_matches(&mut conn, &cache, &stamp)?;
    Ok(())
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
    album_count: i64,
    basis: &str,
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
        "INSERT INTO track_singles_checks (local_artist_key, artist_mbid, single_count, checked_at, album_count, basis)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(local_artist_key) DO UPDATE SET
            artist_mbid = excluded.artist_mbid,
            single_count = excluded.single_count,
            checked_at = excluded.checked_at,
            album_count = excluded.album_count,
            basis = excluded.basis",
        params![
            local_artist_key,
            artist_mbid,
            singles.len() as i64,
            checked_at,
            album_count,
            basis
        ],
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
    /// `verified` (you linked it) or `name` (only the artist-name cache matched).
    basis: String,
}

fn sql_list(items: &[&str]) -> String {
    items
        .iter()
        .map(|item| format!("'{}'", item.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(", ")
}

/// Albums per catalog artist and the artists worth checking, built once per
/// statement so a due check stays a single pass. The album filter matches
/// `local_albums`, so a stored count and a fresh count agree.
///
/// Candidates are the artists you linked, plus artists whose name the cache
/// matched, unless you linked, unlinked or ignored them (your decision wins) or
/// the name is a placeholder such as "Various Artists".
fn candidates_cte() -> String {
    let key_sql = crate::identity::catalog_artist_key_sql("album_artist_display");
    let placeholders = sql_list(PLACEHOLDER_ARTIST_KEYS);
    let special = sql_list(SPECIAL_ARTIST_MBIDS);
    format!(
        "WITH album_counts AS (
            SELECT {key_sql} AS artist_key, MIN(album_artist_display) AS display, COUNT(*) AS albums
            FROM albums
            WHERE NULLIF(TRIM(COALESCE(album, '')), '') IS NOT NULL
            GROUP BY artist_key),
         candidates AS (
            SELECT links.local_artist_key AS artist_key, links.display_artist AS display,
                   TRIM(links.mbid) AS mbid, 'verified' AS basis
            FROM musicbrainz_artist_links links
            WHERE links.ignored = 0 AND NULLIF(TRIM(COALESCE(links.mbid, '')), '') IS NOT NULL
            UNION ALL
            SELECT album_counts.artist_key, album_counts.display, matches.mbid, 'name'
            FROM album_counts
            JOIN track_singles_name_matches matches ON matches.name_key = album_counts.artist_key
            WHERE album_counts.artist_key <> ''
              AND album_counts.artist_key NOT IN ({placeholders})
              AND matches.mbid NOT IN ({special})
              AND NOT EXISTS (SELECT 1 FROM musicbrainz_artist_links links
                              WHERE links.local_artist_key = album_counts.artist_key)
              AND NOT EXISTS (SELECT 1 FROM musicbrainz_artist_link_tombstones gone
                              WHERE gone.local_artist_key = album_counts.artist_key))"
    )
}

const CANDIDATES_FROM: &str = "FROM candidates cand
     LEFT JOIN track_singles_checks checks ON checks.local_artist_key = cand.artist_key
     LEFT JOIN album_counts ON album_counts.artist_key = cand.artist_key
     WHERE 1 = 1";

/// An artist is due when it was never checked, the check is stale, its
/// MusicBrainz id or the basis for it changed since the check (for example a
/// name match you later confirmed), its album count changed (new music was
/// added or removed), or a forced run started after its last check.
/// `?1` is the force cut-off (NULL for a normal run).
fn due_condition() -> String {
    format!(
        "(checks.checked_at IS NULL
          OR checks.checked_at < datetime('now', '-{REFRESH_AFTER_DAYS} days')
          OR TRIM(COALESCE(checks.artist_mbid, '')) <> cand.mbid
          OR COALESCE(checks.basis, 'verified') <> cand.basis
          OR checks.album_count IS NOT COALESCE(album_counts.albums, 0)
          OR (?1 IS NOT NULL AND checks.checked_at < ?1))"
    )
}

fn count_candidates(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row(
        &format!("{} SELECT COUNT(*) {CANDIDATES_FROM}", candidates_cte()),
        [],
        |row| row.get(0),
    )?)
}

fn count_name_matched(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row(
        &format!(
            "{} SELECT COUNT(*) {CANDIDATES_FROM} AND cand.basis = 'name'",
            candidates_cte()
        ),
        [],
        |row| row.get(0),
    )?)
}

fn count_due(conn: &Connection, force_before: Option<&str>) -> Result<i64> {
    Ok(conn.query_row(
        &format!(
            "{} SELECT COUNT(*) {CANDIDATES_FROM} AND {}",
            candidates_cte(),
            due_condition()
        ),
        [force_before],
        |row| row.get(0),
    )?)
}

/// Where the library stands, read from the catalog so it survives restarts.
#[derive(Debug, Clone, Serialize, PartialEq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackSinglesStatus {
    /// Artists that can be checked: linked to MusicBrainz, or matched by name.
    pub checkable_artists: i64,
    /// How many of those only have a name match (no link you confirmed).
    pub name_matched_artists: i64,
    /// Checkable artists whose result is up to date: checked within 90 days, with
    /// the same MusicBrainz id, basis and album count as when they were checked.
    pub checked_artists: i64,
    pub due_artists: i64,
    pub confirmed_singles: i64,
    pub possible_singles: i64,
    pub last_checked_at: Option<String>,
}

pub(crate) fn status_for_connection(conn: &Connection) -> Result<TrackSinglesStatus> {
    let count = |sql: String| -> Result<i64> { Ok(conn.query_row(&sql, [], |row| row.get(0))?) };
    let checkable = count_candidates(conn)?;
    let due = count_due(conn, None)?;
    let by_confidence = |confidence: &str| {
        count(format!(
            "SELECT COUNT(*) FROM track_singles WHERE confidence = '{confidence}'"
        ))
    };
    Ok(TrackSinglesStatus {
        checkable_artists: checkable,
        name_matched_artists: count_name_matched(conn)?,
        checked_artists: checkable - due,
        due_artists: due,
        confirmed_singles: by_confidence("confirmed")?,
        possible_singles: by_confidence("possible")?,
        last_checked_at: conn.query_row(
            "SELECT MAX(checked_at) FROM track_singles_checks",
            [],
            |row| row.get(0),
        )?,
    })
}

/// Artists that are due (see [`due_condition`]), verified ones first, and how
/// many are due in all.
fn due_artists(
    conn: &Connection,
    limit: u32,
    force_before: Option<&str>,
) -> Result<(Vec<LocalArtist>, i64)> {
    let remaining = count_due(conn, force_before)?;
    let mut statement = conn.prepare(&format!(
        "{} SELECT cand.artist_key, cand.display, cand.mbid, cand.basis {CANDIDATES_FROM} AND {}
         ORDER BY (cand.basis = 'name'), cand.artist_key LIMIT ?2",
        candidates_cte(),
        due_condition()
    ))?;
    let artists = statement
        .query_map(params![force_before, limit], |row| {
            Ok(LocalArtist {
                local_artist_key: row.get(0)?,
                display_artist: row.get(1)?,
                mbid: row.get(2)?,
                basis: row.get(3)?,
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

/// True when one of your albums is also in the artist's MusicBrainz discography
/// (same title, and the same year give or take one when both are known).
fn albums_overlap(local: &[AlbumContext], remote: &[(String, Option<i32>)]) -> bool {
    local.iter().any(|album| {
        let wanted = crate::identity::loose_key(&album.title);
        !wanted.is_empty()
            && remote.iter().any(|(title, year)| {
                crate::identity::loose_key(title) == wanted
                    && match (album.year, year) {
                        (Some(left), Some(right)) => (left - right).abs() <= 1,
                        _ => true,
                    }
            })
    })
}

/// Albums and EPs the artist-name cache holds for this MusicBrainz id. Reading
/// fails soft: no cache just means no album evidence.
fn cached_discography(cache_path: &str, artist_mbid: &str) -> Vec<(String, Option<i32>)> {
    let read = || -> Result<Vec<(String, Option<i32>)>> {
        let cache = Connection::open_with_flags(cache_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let rows = cache
            .prepare(
                "SELECT title, year FROM release_groups
                 WHERE artist_mbid = ?1 AND type IN ('Album', 'EP')",
            )?
            .query_map([artist_mbid], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    };
    read().unwrap_or_default()
}

/// A name-matched artist may be the wrong act with the same name. Its singles
/// are believed only when something independent agrees: one of your albums is
/// in its discography, a `single from` link tied a single to one of your
/// albums, or at least two different tracks matched. Otherwise every row is
/// kept as `possible`, which readers never show.
pub(crate) fn gate_name_match(rows: Vec<TrackSingle>, album_evidence: bool) -> Vec<TrackSingle> {
    let confirmed = rows
        .iter()
        .filter(|row| row.confidence == Confidence::Confirmed)
        .count();
    let linked = rows
        .iter()
        .any(|row| row.confidence == Confidence::Confirmed && row.source == Source::Relationship);
    if album_evidence || linked || confirmed >= MIN_CONFIRMED_WITHOUT_ALBUM_EVIDENCE {
        return rows;
    }
    rows.into_iter()
        .map(|row| TrackSingle {
            confidence: Confidence::Possible,
            ..row
        })
        .collect()
}

/// `0` means every due artist; any other value is a batch size.
fn effective_limit(limit: u32) -> u32 {
    if limit == 0 {
        u32::MAX
    } else {
        limit
    }
}

/// Consecutive failures that mean MusicBrainz or the network is down, not one bad artist.
const MAX_CONSECUTIVE_FAILURES: u32 = 10;

fn progress_message(done: i64, total: i64, found: u32, failed: u32, current: Option<&str>) -> String {
    let mut message = format!("{done} of {total} artists checked · {found} singles found this run");
    if failed > 0 {
        message.push_str(&format!(" · {failed} failed (retried next run)"));
    }
    if let Some(artist) = current {
        message.push_str(&format!(" · now: {artist}"));
    }
    message
}

/// Background job body: refresh up to `limit` artists (`0` = all) whose singles
/// are unknown or stale. Each artist is saved as it finishes, so pausing,
/// cancelling or restarting loses nothing: a resumed job recomputes which
/// artists are still due and carries on. Progress is measured against every
/// linked artist so it reads the same across pauses and restarts.
#[cfg(not(test))]
pub fn refresh_track_singles(
    app: tauri::AppHandle,
    limit: u32,
    force_before: Option<String>,
) -> Result<TrackSinglesRefreshSummary> {
    // Never hold a catalog connection across network waits: each database step
    // below opens a connection, finishes in milliseconds and drops it, so the
    // app's own writes and other readers are not held up during a long run.
    let force_before = force_before.as_deref();
    // The cache copy is best effort: without it only verified artists are checked.
    let _ = ensure_name_matches(&app);
    let cache_path = crate::db::settings_for_app(&app)
        .map(|settings| settings.musicbrainz_cache_path)
        .unwrap_or_default();
    let (artists, remaining_before, total, checked_before) = {
        let (conn, _) = crate::db::open_read(&app)?;
        let (artists, remaining) = due_artists(&conn, effective_limit(limit), force_before)?;
        let total = count_candidates(&conn)?;
        (artists, remaining, total, total - remaining)
    };
    let requested = artists.len() as u32;
    let started = std::time::Instant::now();
    let (mut checked, mut found, mut failed, mut consecutive) = (0u32, 0u32, 0u32, 0u32);
    let mut paused = false;
    // Name variants ("the who", "who") often share one MusicBrainz id.
    let mut fetched: HashMap<String, Vec<SingleRelease>> = HashMap::new();
    for artist in artists {
        // Cancel ends the job here; a pause request just stops after the last saved artist.
        crate::jobs::checkpoint()?;
        if crate::jobs::should_stop() {
            paused = true;
            break;
        }
        let done = checked_before + i64::from(checked);
        let processed = i64::from(checked + failed);
        let eta = (processed > 0).then(|| {
            (started.elapsed().as_secs_f64() / processed as f64
                * (i64::from(requested) - processed) as f64)
                .ceil() as i64
        });
        crate::jobs::progress_with_eta(
            done,
            total,
            &progress_message(done, total, found, failed, Some(&artist.display_artist)),
            eta,
        );
        let by_name = artist.basis == "name";
        let albums = crate::db::open_read(&app).and_then(|(conn, _)| local_albums(&conn, &artist));
        let outcome = albums.and_then(|albums| {
            if !fetched.contains_key(&artist.mbid) {
                fetched.insert(artist.mbid.clone(), fetch_artist_singles(&artist.mbid)?);
            }
            let singles = &fetched[&artist.mbid];
            let rows = if by_name && singles.len() > MAX_SINGLES_FOR_NAME_MATCH {
                Vec::new()
            } else {
                singles_for_artist(singles, &albums, |group| {
                    fetch_single_from_links(group).unwrap_or_default()
                })
            };
            let rows = if by_name {
                let evidence =
                    albums_overlap(&albums, &cached_discography(&cache_path, &artist.mbid));
                gate_name_match(rows, evidence)
            } else {
                rows
            };
            Ok((rows, albums.len() as i64))
        });
        match outcome {
            Ok((rows, album_count)) => {
                found += rows
                    .iter()
                    .filter(|row| row.confidence == Confidence::Confirmed)
                    .count() as u32;
                let (mut conn, _) = crate::db::open(&app)?;
                save_artist_singles(
                    &mut conn,
                    &artist.local_artist_key,
                    &artist.display_artist,
                    &artist.mbid,
                    &rows,
                    &chrono::Utc::now().to_rfc3339(),
                    album_count,
                    &artist.basis,
                )?;
                drop(conn);
                checked += 1;
                consecutive = 0;
            }
            // Leave the artist unchecked so the next run retries it.
            Err(_) => {
                failed += 1;
                consecutive += 1;
                if consecutive >= MAX_CONSECUTIVE_FAILURES {
                    anyhow::bail!(
                        "MusicBrainz stopped answering after {consecutive} artists in a row failed. Progress is saved; use Continue to try again."
                    );
                }
            }
        }
    }
    let remaining = remaining_before - i64::from(checked);
    let done = checked_before + i64::from(checked);
    let mut message = progress_message(done, total, found, failed, None);
    if paused {
        message.push_str(" · paused");
    }
    crate::jobs::progress_with_eta(done, total, &message, None);
    Ok(TrackSinglesRefreshSummary {
        requested,
        artists_checked: checked,
        singles_found: found,
        failed,
        remaining,
        message,
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
        assert_eq!(
            title_key("Love (Is a Battlefield)"),
            "love is a battlefield"
        );
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
            &[
                single("late", "Take A Chance", 1993),
                single("early", "Take A Chance", 1991),
            ],
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
        install_recheck_columns(&conn).unwrap();
        install_name_matches(&conn).unwrap();
        assert!(schema_exists(&conn).unwrap());
        let rows = [TrackSingle {
            track_title: "  Take A Chance ".into(),
            single_mbid: "a".into(),
            single_title: "Take A Chance".into(),
            single_year: Some(1991),
            confidence: Confidence::Confirmed,
            source: Source::TitleMatch,
        }];
        save_artist_singles(
            &mut conn,
            "bob seger",
            " Bob Seger ",
            "mbid",
            &rows,
            "2026-11-02",
            1, "verified")
        .unwrap();
        save_artist_singles(
            &mut conn,
            "bob seger",
            " Bob Seger ",
            "mbid",
            &rows,
            "2026-11-03",
            1, "verified")
        .unwrap();
        let (artist, track, confidence): (String, String, String) = conn
            .query_row(
                "SELECT artist_key, track_key, confidence FROM track_singles",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(
            (artist.as_str(), track.as_str(), confidence.as_str()),
            ("bob seger", "take a chance", "confirmed")
        );
        let checks: i64 = conn
            .query_row("SELECT COUNT(*) FROM track_singles_checks", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(checks, 1);
    }

    fn in_memory() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.create_scalar_function(
            "unicode_lower",
            1,
            rusqlite::functions::FunctionFlags::SQLITE_UTF8
                | rusqlite::functions::FunctionFlags::SQLITE_DETERMINISTIC,
            |context| context.get::<String>(0).map(|value| value.to_lowercase()),
        )
        .unwrap();
        conn
    }

    /// Three linked artists with 2 / 1 / 0 albums, one unlinked and one ignored.
    fn linked_catalog() -> Connection {
        let conn = in_memory();
        conn.execute_batch(
            "CREATE TABLE musicbrainz_artist_links (
                local_artist_key TEXT PRIMARY KEY, display_artist TEXT NOT NULL, mbid TEXT,
                ignored INTEGER NOT NULL DEFAULT 0);
             INSERT INTO musicbrainz_artist_links VALUES
                ('a', 'A', 'mbid-a', 0), ('b', 'B', 'mbid-b', 0), ('c', 'C', 'mbid-c', 0),
                ('d', 'D', NULL, 0), ('e', 'E', 'mbid-e', 1);
             CREATE TABLE musicbrainz_artist_link_tombstones (local_artist_key TEXT PRIMARY KEY);
             CREATE TABLE albums (
                id TEXT PRIMARY KEY, album TEXT, album_artist_display TEXT, artist_identity_key TEXT,
                year INTEGER, release_year INTEGER);
             INSERT INTO albums VALUES
                ('a1', 'One', 'A', NULL, 1990, 1990), ('a2', 'Two', 'A', NULL, 1992, 1992),
                ('b1', 'Solo', 'B', NULL, 1990, 1990), ('x', '  ', 'A', NULL, NULL, NULL);",
        )
        .unwrap();
        install_schema(&conn).unwrap();
        install_recheck_columns(&conn).unwrap();
        install_name_matches(&conn).unwrap();
        conn
    }

    fn one_single() -> [TrackSingle; 1] {
        [TrackSingle {
            track_title: "Song".into(),
            single_mbid: "s".into(),
            single_title: "Song".into(),
            single_year: Some(1991),
            confidence: Confidence::Confirmed,
            source: Source::TitleMatch,
        }]
    }

    fn due_keys(conn: &Connection, force_before: Option<&str>) -> Vec<String> {
        due_artists(conn, u32::MAX, force_before)
            .unwrap()
            .0
            .into_iter()
            .map(|artist| artist.local_artist_key)
            .collect()
    }

    #[test]
    fn status_counts_only_linked_artists_and_what_is_still_due() {
        let mut conn = linked_catalog();
        let empty = status_for_connection(&conn).unwrap();
        assert_eq!(
            (empty.checkable_artists, empty.checked_artists, empty.due_artists),
            (3, 0, 3)
        );
        assert_eq!(empty.last_checked_at, None);

        save_artist_singles(&mut conn, "a", "A", "mbid-a", &one_single(), "2099-01-01T00:00:00Z", 2, "verified")
            .unwrap();
        // "b" was checked long ago, so it is due again; "c" never was.
        save_artist_singles(&mut conn, "b", "B", "mbid-b", &[], "2000-01-01T00:00:00Z", 1, "verified").unwrap();
        let status = status_for_connection(&conn).unwrap();
        assert_eq!(
            (status.checkable_artists, status.checked_artists, status.due_artists),
            (3, 1, 2)
        );
        assert_eq!((status.confirmed_singles, status.possible_singles), (1, 0));
        assert_eq!(status.last_checked_at.as_deref(), Some("2099-01-01T00:00:00Z"));
        let (_, remaining) = due_artists(&conn, u32::MAX, None).unwrap();
        assert_eq!(remaining, 2);
        assert_eq!(due_keys(&conn, None), ["b", "c"]);
    }

    #[test]
    fn new_music_makes_a_checked_artist_due_again() {
        let mut conn = linked_catalog();
        save_artist_singles(&mut conn, "a", "A", "mbid-a", &[], "2099-01-01T00:00:00Z", 2, "verified").unwrap();
        assert!(!due_keys(&conn, None).contains(&"a".to_string()));

        conn.execute(
            "INSERT INTO albums VALUES ('a3', 'Three', 'A', NULL, 1995, 1995)",
            [],
        )
        .unwrap();
        assert!(due_keys(&conn, None).contains(&"a".to_string()), "a new album");

        // Checking again records the new count, so the artist settles.
        save_artist_singles(&mut conn, "a", "A", "mbid-a", &[], "2099-01-02T00:00:00Z", 3, "verified").unwrap();
        assert!(!due_keys(&conn, None).contains(&"a".to_string()));

        conn.execute("DELETE FROM albums WHERE id = 'a1'", []).unwrap();
        assert!(due_keys(&conn, None).contains(&"a".to_string()), "a removed album");
    }

    #[test]
    fn a_changed_musicbrainz_link_makes_the_artist_due_again() {
        let mut conn = linked_catalog();
        save_artist_singles(&mut conn, "b", "B", "mbid-b", &[], "2099-01-01T00:00:00Z", 1, "verified").unwrap();
        assert!(!due_keys(&conn, None).contains(&"b".to_string()));
        conn.execute(
            "UPDATE musicbrainz_artist_links SET mbid = 'mbid-corrected' WHERE local_artist_key = 'b'",
            [],
        )
        .unwrap();
        assert!(due_keys(&conn, None).contains(&"b".to_string()));
    }

    #[test]
    fn a_newly_linked_artist_is_due_without_any_other_change() {
        let mut conn = linked_catalog();
        for key in ["a", "b", "c"] {
            save_artist_singles(&mut conn, key, key, &format!("mbid-{key}"), &[], "2099-01-01T00:00:00Z", if key == "a" { 2 } else if key == "b" { 1 } else { 0 }, "verified")
                .unwrap();
        }
        assert!(due_keys(&conn, None).is_empty());
        conn.execute("UPDATE musicbrainz_artist_links SET mbid = 'mbid-d' WHERE local_artist_key = 'd'", [])
            .unwrap();
        assert_eq!(due_keys(&conn, None), ["d"]);
    }

    #[test]
    fn a_forced_run_rechecks_everyone_once_and_can_resume() {
        let mut conn = linked_catalog();
        for (key, albums) in [("a", 2), ("b", 1), ("c", 0)] {
            save_artist_singles(&mut conn, key, key, &format!("mbid-{key}"), &[], "2026-11-02T10:00:00+00:00", albums, "verified")
                .unwrap();
        }
        assert!(due_keys(&conn, None).is_empty());
        let cutoff = "2026-11-02T12:00:00+00:00";
        assert_eq!(due_keys(&conn, Some(cutoff)), ["a", "b", "c"]);
        // After "a" is rechecked at 13:00 a resumed forced run carries on with the rest.
        save_artist_singles(&mut conn, "a", "a", "mbid-a", &[], "2026-11-02T13:00:00+00:00", 2, "verified").unwrap();
        assert_eq!(due_keys(&conn, Some(cutoff)), ["b", "c"]);
        assert_eq!(due_artists(&conn, u32::MAX, Some(cutoff)).unwrap().1, 2);
    }

    #[test]
    fn step_69_adds_the_column_and_credits_earlier_checks_with_todays_albums() {
        let conn = in_memory();
        conn.execute_batch(
            "CREATE TABLE albums (
                id TEXT PRIMARY KEY, album TEXT, album_artist_display TEXT, artist_identity_key TEXT,
                year INTEGER, release_year INTEGER);
             INSERT INTO albums VALUES ('a1', 'One', 'A', NULL, 1990, 1990), ('a2', 'Two', 'A', NULL, 1992, 1992);",
        )
        .unwrap();
        install_schema(&conn).unwrap();
        // A check written by 0.210.0 to 0.210.2, before the column existed.
        conn.execute(
            "INSERT INTO track_singles_checks (local_artist_key, artist_mbid, single_count, checked_at)
             VALUES ('a', 'mbid-a', 3, '2026-11-02T10:00:00+00:00')",
            [],
        )
        .unwrap();
        assert!(!recheck_columns_exist(&conn).unwrap());
        install_recheck_columns(&conn).unwrap();
        install_recheck_columns(&conn).unwrap();
        assert!(recheck_columns_exist(&conn).unwrap());
        let credited: i64 = conn
            .query_row("SELECT album_count FROM track_singles_checks WHERE local_artist_key = 'a'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(credited, 2);
    }

    #[test]
    fn progress_message_reads_the_same_after_a_resume() {
        assert_eq!(
            progress_message(1234, 3000, 56, 0, Some("Bob Seger")),
            "1234 of 3000 artists checked · 56 singles found this run · now: Bob Seger"
        );
        assert_eq!(
            progress_message(10, 20, 0, 3, None),
            "10 of 20 artists checked · 0 singles found this run · 3 failed (retried next run)"
        );
    }

    #[test]
    fn zero_means_every_due_artist() {
        assert_eq!(effective_limit(0), u32::MAX);
        assert_eq!(effective_limit(25), 25);
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

    fn confirmed(track: &str, source: Source) -> TrackSingle {
        TrackSingle {
            track_title: track.into(),
            single_mbid: format!("s-{track}"),
            single_title: track.into(),
            single_year: Some(1991),
            confidence: Confidence::Confirmed,
            source,
        }
    }

    fn name_match(conn: &Connection, key: &str, mbid: &str) {
        conn.execute(
            "INSERT INTO track_singles_name_matches (name_key, mbid) VALUES (?1, ?2)",
            [key, mbid],
        )
        .unwrap();
    }

    #[test]
    fn a_single_confirmed_track_is_not_believed_for_a_name_match_alone() {
        let rows = vec![confirmed("Song", Source::TitleMatch)];
        let gated = gate_name_match(rows, false);
        assert!(gated.iter().all(|row| row.confidence == Confidence::Possible));
    }

    #[test]
    fn name_matches_are_believed_with_album_link_or_two_tracks() {
        let one = || vec![confirmed("Song", Source::TitleMatch)];
        assert_eq!(gate_name_match(one(), true)[0].confidence, Confidence::Confirmed);
        let linked = vec![confirmed("Song", Source::Relationship)];
        assert_eq!(gate_name_match(linked, false)[0].confidence, Confidence::Confirmed);
        let two = vec![confirmed("One", Source::TitleMatch), confirmed("Two", Source::TitleMatch)];
        assert!(gate_name_match(two, false)
            .iter()
            .all(|row| row.confidence == Confidence::Confirmed));
        assert!(gate_name_match(Vec::new(), false).is_empty());
    }

    #[test]
    fn albums_overlap_needs_the_same_title_and_a_near_year() {
        let local = [album(1991, &[])];
        let remote = |title: &str, year| vec![(title.to_string(), year)];
        assert!(albums_overlap(&local, &remote("THE FIRE INSIDE", Some(1992))));
        assert!(albums_overlap(&local, &remote("The Fire Inside", None)));
        assert!(!albums_overlap(&local, &remote("The Fire Inside", Some(2005))));
        assert!(!albums_overlap(&local, &remote("Other", Some(1991))));
        assert!(!albums_overlap(&local, &[]));
    }

    #[test]
    fn name_matched_artists_are_candidates_unless_you_decided_otherwise() {
        let mut conn = linked_catalog();
        conn.execute_batch(
            "INSERT INTO albums VALUES
                ('n1', 'Alpha', 'Nina', NULL, 2000, 2000),
                ('n2', 'Beta', 'Various Artists', NULL, 2001, 2001),
                ('n3', 'Gamma', 'Tombed', NULL, 2002, 2002),
                ('n4', 'Delta', 'Special', NULL, 2003, 2003);
             INSERT INTO musicbrainz_artist_link_tombstones VALUES ('tombed');",
        )
        .unwrap();
        name_match(&conn, "nina", "mbid-nina");
        name_match(&conn, "various artists", "mbid-va");
        name_match(&conn, "tombed", "mbid-tombed");
        name_match(&conn, "special", SPECIAL_ARTIST_MBIDS[0]);
        // "a" is already linked, so its name match must not replace the link.
        name_match(&conn, "a", "mbid-wrong");
        // "e" was ignored by the user, "d" is a link with no mbid.
        name_match(&conn, "e", "mbid-ignored");
        name_match(&conn, "d", "mbid-unresolved");
        assert_eq!(due_keys(&conn, None), ["a", "b", "c", "nina"]);
        let status = status_for_connection(&conn).unwrap();
        assert_eq!((status.checkable_artists, status.name_matched_artists), (4, 1));
        let (artists, _) = due_artists(&conn, u32::MAX, None).unwrap();
        let basis: Vec<_> = artists
            .iter()
            .map(|artist| (artist.local_artist_key.as_str(), artist.mbid.as_str(), artist.basis.as_str()))
            .collect();
        assert_eq!(basis[0], ("a", "mbid-a", "verified"));
        assert_eq!(basis[3], ("nina", "mbid-nina", "name"));
    }

    #[test]
    fn confirming_a_name_match_checks_the_artist_again() {
        let mut conn = linked_catalog();
        conn.execute_batch("INSERT INTO albums VALUES ('n1', 'Alpha', 'Nina', NULL, 2000, 2000)")
            .unwrap();
        name_match(&conn, "nina", "mbid-nina");
        save_artist_singles(&mut conn, "nina", "Nina", "mbid-nina", &[], "2099-01-01T00:00:00Z", 1, "name")
            .unwrap();
        assert!(!due_keys(&conn, None).contains(&"nina".to_string()));
        // The user links the same MusicBrainz artist: same id, new basis.
        conn.execute(
            "INSERT INTO musicbrainz_artist_links VALUES ('nina', 'Nina', 'mbid-nina', 0)",
            [],
        )
        .unwrap();
        assert!(due_keys(&conn, None).contains(&"nina".to_string()));
    }

    #[test]
    fn name_matches_are_copied_from_the_cache_and_replaced_on_change() {
        let mut conn = linked_catalog();
        let cache = Connection::open_in_memory().unwrap();
        cache
            .execute_batch(
                "CREATE TABLE artist_cache (name TEXT, mbid TEXT, cached_at TEXT);
                 INSERT INTO artist_cache VALUES
                    (' Nina ', 'mbid-nina', ''), ('empty', '  ', ''), ('', 'mbid-x', ''),
                    ('dup', 'mbid-1', ''), ('dup', 'mbid-2', '');",
            )
            .unwrap();
        assert_eq!(sync_name_matches(&mut conn, &cache, "1:1").unwrap(), 3);
        assert_eq!(name_matches_stamp(&conn).as_deref(), Some("1:1"));
        let stored: i64 = conn
            .query_row("SELECT COUNT(*) FROM track_singles_name_matches WHERE name_key IN ('nina', 'dup')", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stored, 2);
        cache.execute("DELETE FROM artist_cache", []).unwrap();
        sync_name_matches(&mut conn, &cache, "2:2").unwrap();
        let left: i64 = conn
            .query_row("SELECT COUNT(*) FROM track_singles_name_matches", [], |row| row.get(0))
            .unwrap();
        assert_eq!((left, name_matches_stamp(&conn).as_deref()), (0, Some("2:2")));
    }

    #[test]
    fn step_70_is_idempotent_and_keeps_earlier_checks_verified() {
        let conn = in_memory();
        install_schema(&conn).unwrap();
        install_recheck_columns(&conn).unwrap();
        conn.execute(
            "INSERT INTO track_singles_checks (local_artist_key, artist_mbid, single_count, checked_at, album_count)
             VALUES ('a', 'mbid-a', 0, '2026-11-02T10:00:00+00:00', 1)",
            [],
        )
        .unwrap();
        assert!(!name_matches_exist(&conn).unwrap());
        install_name_matches(&conn).unwrap();
        install_name_matches(&conn).unwrap();
        assert!(name_matches_exist(&conn).unwrap());
        let basis: Option<String> = conn
            .query_row("SELECT basis FROM track_singles_checks", [], |row| row.get(0))
            .unwrap();
        assert_eq!(basis, None, "NULL reads as verified in the due query");
    }
}
