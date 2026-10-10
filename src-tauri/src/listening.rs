//! Listening history: plays imported from Last.fm, ListenBrainz, and Aurora.
//!
//! Plays are stored by name identity (`identity::loose_key` artist,
//! `identity::edition_title_key` title and album) because catalog track ids
//! change on every import. `listening_identity_links` maps each distinct play
//! identity to the best current track and is rebuilt whenever the catalog
//! revision or the set of plays changes. All insight queries join through it.
//!
//! The same play can arrive from two sources (Aurora also scrobbles to
//! Last.fm). A play is skipped when another source already holds the same
//! identity within [`CROSS_SOURCE_WINDOW_SECONDS`].

use crate::identity::{credit_keys, edition_title_key, loose_key};
use anyhow::{bail, Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;

pub(crate) const CROSS_SOURCE_WINDOW_SECONDS: i64 = 600;
const REDISCOVER_AFTER_SECONDS: i64 = 3 * 365 * 24 * 60 * 60;
const FAVORITE_TRACK_RATING: i64 = 100;
const LIKED_ALBUM_RATING: i64 = 80;
const MAX_LIST_LIMIT: u32 = 500;
const MAX_BRIDGE_PLAYS: usize = 5000;
const LASTFM_PAGE_SIZE: u32 = 200;
const LISTENBRAINZ_PAGE_SIZE: u32 = 1000;
const LISTENBRAINZ_API_BASE: &str = "https://api.listenbrainz.org/1";
const LISTENBRAINZ_KEYRING_SERVICE: &str = "com.local.musiclibrary.listenbrainz";
const LISTENBRAINZ_KEYRING_USER: &str = "user-token";
const SOURCES: [(&str, &str); 3] = [
    ("lastfm", "Last.fm"),
    ("listenbrainz", "ListenBrainz"),
    ("aurora", "Aurora"),
];

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ListeningSourceStatus {
    #[specta(type = crate::wire_enums::ListeningSource)]
    pub source: String,
    pub label: String,
    pub username: String,
    pub token_configured: bool,
    pub plays: i64,
    pub newest_played_at: Option<i64>,
    pub last_synced_at: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ListeningMonth {
    pub month: String,
    pub plays: i64,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ListeningOverview {
    pub sources: Vec<ListeningSourceStatus>,
    pub total_plays: i64,
    pub matched_plays: i64,
    pub played_tracks: i64,
    pub first_played_at: Option<i64>,
    pub last_played_at: Option<i64>,
    pub plays_last_30_days: i64,
    pub plays_last_365_days: i64,
    pub months: Vec<ListeningMonth>,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ListeningListRequest {
    #[specta(type = crate::wire_enums::ListeningList)]
    pub list: String,
    #[serde(default)]
    pub period_days: Option<u32>,
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, PartialEq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ListeningRow {
    pub key: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub album_id: Option<String>,
    pub track_id: Option<i64>,
    pub rating: Option<i64>,
    pub plays: i64,
    pub last_played_at: Option<i64>,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ListeningSourceRequest {
    #[specta(type = crate::wire_enums::ListeningSource)]
    pub source: String,
    pub username: String,
    #[serde(default)]
    pub token: Option<String>,
    #[serde(default)]
    pub clear_token: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ListeningSyncResult {
    #[specta(type = crate::wire_enums::ListeningSource)]
    pub source: String,
    pub fetched: i64,
    pub inserted: i64,
    pub duplicates: i64,
    pub total_plays: i64,
    pub matched_plays: i64,
    pub message: String,
}

/// One play as received from a provider, before identity keys are computed.
#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct PlayInput {
    pub artist: String,
    pub title: String,
    pub album: Option<String>,
    pub played_at: i64,
    pub recording_mbid: Option<String>,
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct InsertSummary {
    pub inserted: i64,
    pub duplicates: i64,
    pub skipped: i64,
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

pub(crate) fn install_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS listening_plays (
            id INTEGER PRIMARY KEY,
            source TEXT NOT NULL,
            played_at INTEGER NOT NULL,
            artist TEXT NOT NULL,
            title TEXT NOT NULL,
            album TEXT,
            artist_key TEXT NOT NULL,
            title_key TEXT NOT NULL,
            album_key TEXT NOT NULL DEFAULT '',
            path_key TEXT NOT NULL DEFAULT '',
            recording_mbid TEXT,
            imported_at TEXT NOT NULL,
            UNIQUE (source, played_at, artist_key, title_key)
        );
        CREATE INDEX IF NOT EXISTS idx_listening_plays_identity
            ON listening_plays(artist_key, title_key, album_key, path_key, played_at);
        CREATE INDEX IF NOT EXISTS idx_listening_plays_played_at
            ON listening_plays(played_at);
        CREATE TABLE IF NOT EXISTS listening_sources (
            source TEXT PRIMARY KEY,
            username TEXT NOT NULL DEFAULT '',
            newest_played_at INTEGER,
            last_synced_at TEXT,
            last_error TEXT
        );
        CREATE TABLE IF NOT EXISTS listening_identity_links (
            artist_key TEXT NOT NULL,
            title_key TEXT NOT NULL,
            album_key TEXT NOT NULL,
            path_key TEXT NOT NULL,
            track_id INTEGER NOT NULL,
            PRIMARY KEY (artist_key, title_key, album_key, path_key)
        ) WITHOUT ROWID;
        CREATE INDEX IF NOT EXISTS idx_listening_identity_links_track
            ON listening_identity_links(track_id);
        CREATE TABLE IF NOT EXISTS listening_link_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            revision TEXT NOT NULL,
            refreshed_at TEXT NOT NULL
        );
        ",
    )
    .context("Could not create the listening history tables")
}

pub(crate) fn schema_exists(conn: &Connection) -> Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN
         ('listening_plays', 'listening_sources', 'listening_identity_links', 'listening_link_state')",
        [],
        |row| row.get(0),
    )?;
    Ok(count == 4)
}

// ---------------------------------------------------------------------------
// Identity keys and inserts
// ---------------------------------------------------------------------------

fn path_key(value: &str) -> String {
    value
        .trim()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_lowercase()
}

fn track_path_key(directory: &str, filename: &str) -> String {
    if filename.trim().is_empty() {
        return String::new();
    }
    format!("{}/{}", path_key(directory), filename.trim().to_lowercase())
}

fn known_source(source: &str) -> Result<&'static str> {
    SOURCES
        .iter()
        .find(|(id, _)| *id == source)
        .map(|(id, _)| *id)
        .with_context(|| format!("Unknown listening source {source:?}"))
}

pub(crate) fn insert_plays(
    conn: &Connection,
    source: &str,
    plays: &[PlayInput],
) -> Result<InsertSummary> {
    let source = known_source(source)?;
    let imported_at = Utc::now().to_rfc3339();
    let mut summary = InsertSummary::default();
    let tx = rusqlite::Transaction::new_unchecked(conn, rusqlite::TransactionBehavior::Immediate)?;
    {
        let mut cross_source = tx.prepare_cached(
            "SELECT 1 FROM listening_plays
             WHERE artist_key = ?1 AND title_key = ?2 AND source <> ?3
               AND played_at BETWEEN ?4 - ?5 AND ?4 + ?5
             LIMIT 1",
        )?;
        let mut insert = tx.prepare_cached(
            "INSERT OR IGNORE INTO listening_plays (
                source, played_at, artist, title, album, artist_key, title_key,
                album_key, path_key, recording_mbid, imported_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        )?;
        for play in plays {
            let artist = play.artist.trim();
            let title = play.title.trim();
            let artist_key = loose_key(artist);
            let title_key = edition_title_key(title);
            if artist_key.is_empty() || title_key.is_empty() || play.played_at <= 0 {
                summary.skipped += 1;
                continue;
            }
            if cross_source.exists(params![
                artist_key,
                title_key,
                source,
                play.played_at,
                CROSS_SOURCE_WINDOW_SECONDS
            ])? {
                summary.duplicates += 1;
                continue;
            }
            let album = play
                .album
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty());
            let album_key = album.map(edition_title_key).unwrap_or_default();
            let file_path_key = play.file_path.as_deref().map(path_key).unwrap_or_default();
            let mbid = play
                .recording_mbid
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty());
            let changed = insert.execute(params![
                source,
                play.played_at,
                artist,
                title,
                album,
                artist_key,
                title_key,
                album_key,
                file_path_key,
                mbid,
                imported_at
            ])?;
            if changed == 0 {
                summary.duplicates += 1;
            } else {
                summary.inserted += 1;
            }
        }
    }
    tx.commit()?;
    Ok(summary)
}

// ---------------------------------------------------------------------------
// Track links
// ---------------------------------------------------------------------------

fn plays_revision(conn: &Connection) -> Result<String> {
    let catalog = crate::db::catalog_revision(conn)?;
    let (count, max_id): (i64, i64) = conn.query_row(
        "SELECT COUNT(*), COALESCE(MAX(id), 0) FROM listening_plays",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let tracks: i64 = conn.query_row("SELECT COALESCE(MAX(id), 0) FROM tracks", [], |row| {
        row.get(0)
    })?;
    Ok(format!("{catalog}|{tracks}|{count}:{max_id}"))
}

pub(crate) fn links_current(conn: &Connection) -> Result<bool> {
    let stored: Option<String> = conn
        .query_row(
            "SELECT revision FROM listening_link_state WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    Ok(stored.as_deref() == Some(plays_revision(conn)?.as_str()))
}

struct PlayGroup {
    artist_key: String,
    title_key: String,
    album_key: String,
    path_key: String,
    best: Option<(u8, i64)>,
}

/// Rebuilds `listening_identity_links`. Each play identity links to at most
/// one track: an exact file path wins, then a matching album, then the
/// track's own (non album-artist) credit, then the lowest track id.
pub(crate) fn refresh_links(conn: &Connection) -> Result<i64> {
    let mut groups = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT DISTINCT artist_key, title_key, album_key, path_key FROM listening_plays",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(PlayGroup {
                artist_key: row.get(0)?,
                title_key: row.get(1)?,
                album_key: row.get(2)?,
                path_key: row.get(3)?,
                best: None,
            })
        })?;
        for row in rows {
            groups.push(row?);
        }
    }
    let mut by_title: HashMap<String, Vec<usize>> = HashMap::new();
    let mut by_path: HashMap<String, Vec<usize>> = HashMap::new();
    for (index, group) in groups.iter().enumerate() {
        by_title
            .entry(group.title_key.clone())
            .or_default()
            .push(index);
        if !group.path_key.is_empty() {
            by_path
                .entry(group.path_key.clone())
                .or_default()
                .push(index);
        }
    }

    if !groups.is_empty() {
        let mut stmt = conn.prepare(
            "SELECT id, COALESCE(display_artist, ''), COALESCE(album_artist_display, ''),
                    COALESCE(album, ''), COALESCE(title, ''), COALESCE(file_path, ''),
                    COALESCE(filename, '')
             FROM tracks ORDER BY id",
        )?;
        let mut rows = stmt.query([])?;
        while let Some(row) = rows.next()? {
            let track_id: i64 = row.get(0)?;
            let display_artist: String = row.get(1)?;
            let album_artist: String = row.get(2)?;
            let album: String = row.get(3)?;
            let title: String = row.get(4)?;
            let directory: String = row.get(5)?;
            let filename: String = row.get(6)?;

            if !by_path.is_empty() {
                let key = track_path_key(&directory, &filename);
                if let Some(indexes) = by_path.get(&key) {
                    for &index in indexes {
                        offer(&mut groups[index], 8, track_id);
                    }
                }
            }
            let Some(indexes) = by_title.get(&edition_title_key(&title)) else {
                continue;
            };
            let own_key = loose_key(&display_artist);
            let mut artist_keys = vec![own_key.clone(), loose_key(&album_artist)];
            artist_keys.extend(credit_keys(&display_artist));
            artist_keys.retain(|key| !key.is_empty());
            let mut album_key: Option<String> = None;
            for &index in indexes {
                let group = &groups[index];
                if !artist_keys.contains(&group.artist_key) {
                    continue;
                }
                let mut score = 1;
                if !group.album_key.is_empty()
                    && *album_key.get_or_insert_with(|| edition_title_key(&album))
                        == group.album_key
                {
                    score += 4;
                }
                if group.artist_key == own_key {
                    score += 2;
                }
                offer(&mut groups[index], score, track_id);
            }
        }
    }

    let tx = rusqlite::Transaction::new_unchecked(conn, rusqlite::TransactionBehavior::Immediate)?;
    tx.execute("DELETE FROM listening_identity_links", [])?;
    let mut linked = 0;
    {
        let mut insert = tx.prepare(
            "INSERT INTO listening_identity_links
                (artist_key, title_key, album_key, path_key, track_id)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )?;
        for group in &groups {
            if let Some((_, track_id)) = group.best {
                insert.execute(params![
                    group.artist_key,
                    group.title_key,
                    group.album_key,
                    group.path_key,
                    track_id
                ])?;
                linked += 1;
            }
        }
    }
    tx.execute(
        "INSERT INTO listening_link_state (id, revision, refreshed_at) VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET revision = excluded.revision,
                                       refreshed_at = excluded.refreshed_at",
        params![plays_revision(&tx)?, Utc::now().to_rfc3339()],
    )?;
    tx.commit()?;
    Ok(linked)
}

fn offer(group: &mut PlayGroup, score: u8, track_id: i64) {
    // Tracks are scanned in id order, so a tie keeps the lowest id.
    if group.best.is_none_or(|(best, _)| score > best) {
        group.best = Some((score, track_id));
    }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const PLAY_LINK_JOIN: &str = "listening_identity_links l
    ON l.artist_key = p.artist_key AND l.title_key = p.title_key
   AND l.album_key = p.album_key AND l.path_key = p.path_key";

fn played_cte() -> String {
    format!(
        "WITH played AS (
            SELECT l.track_id, COUNT(*) AS plays, MAX(p.played_at) AS last_played
            FROM listening_plays p JOIN {PLAY_LINK_JOIN}
            WHERE p.played_at >= ?1
            GROUP BY l.track_id
        )"
    )
}

fn source_statuses(conn: &Connection) -> Result<Vec<ListeningSourceStatus>> {
    let token_configured = listenbrainz_token().ok().flatten().is_some();
    let mut statuses = Vec::new();
    for (source, label) in SOURCES {
        let stored = conn
            .query_row(
                "SELECT username, newest_played_at, last_synced_at, last_error
                 FROM listening_sources WHERE source = ?1",
                [source],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<i64>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                    ))
                },
            )
            .optional()?;
        let plays: i64 = conn.query_row(
            "SELECT COUNT(*) FROM listening_plays WHERE source = ?1",
            [source],
            |row| row.get(0),
        )?;
        let (username, newest_played_at, last_synced_at, last_error) = stored.unwrap_or_default();
        statuses.push(ListeningSourceStatus {
            source: source.to_string(),
            label: label.to_string(),
            username,
            token_configured: source == "listenbrainz" && token_configured,
            plays,
            newest_played_at,
            last_synced_at,
            last_error,
        });
    }
    Ok(statuses)
}

pub(crate) fn overview(conn: &Connection, now: i64) -> Result<ListeningOverview> {
    let (total_plays, first_played_at, last_played_at, last_30, last_365): (
        i64,
        Option<i64>,
        Option<i64>,
        i64,
        i64,
    ) = conn.query_row(
        "SELECT COUNT(*), MIN(played_at), MAX(played_at),
                COALESCE(SUM(played_at >= ?1), 0), COALESCE(SUM(played_at >= ?2), 0)
         FROM listening_plays",
        params![now - 30 * 86_400, now - 365 * 86_400],
        |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        },
    )?;
    let (matched_plays, played_tracks): (i64, i64) = conn.query_row(
        &format!(
            "SELECT COUNT(*), COUNT(DISTINCT l.track_id)
             FROM listening_plays p JOIN {PLAY_LINK_JOIN}
             JOIN tracks t ON t.id = l.track_id"
        ),
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let mut stmt = conn.prepare(
        "SELECT strftime('%Y-%m', played_at, 'unixepoch', 'localtime') AS month, COUNT(*)
         FROM listening_plays WHERE played_at >= ?1
         GROUP BY month ORDER BY month",
    )?;
    let months = stmt
        .query_map([now - 730 * 86_400], |row| {
            Ok(ListeningMonth {
                month: row.get(0)?,
                plays: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(ListeningOverview {
        sources: source_statuses(conn)?,
        total_plays,
        matched_plays,
        played_tracks,
        first_played_at,
        last_played_at,
        plays_last_30_days: last_30,
        plays_last_365_days: last_365,
        months,
    })
}

fn row_from_sql(row: &rusqlite::Row<'_>) -> rusqlite::Result<ListeningRow> {
    Ok(ListeningRow {
        key: row.get(0)?,
        title: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
        artist: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
        album: row.get(3)?,
        album_id: row.get(4)?,
        track_id: row.get(5)?,
        rating: row.get(6)?,
        plays: row.get(7)?,
        last_played_at: row.get(8)?,
        source: row.get(9)?,
    })
}

pub(crate) fn list(
    conn: &Connection,
    request: &ListeningListRequest,
    now: i64,
) -> Result<Vec<ListeningRow>> {
    let limit = request.limit.unwrap_or(50).clamp(1, MAX_LIST_LIMIT);
    let since = request
        .period_days
        .filter(|days| *days > 0)
        .map(|days| now - i64::from(days) * 86_400)
        .unwrap_or(0);
    let played = played_cte();
    let track_columns = "CAST(t.id AS TEXT), t.title,
        COALESCE(NULLIF(t.display_artist, ''), t.album_artist_display), t.album, t.album_id,
        t.id, t.normalized_rating";
    let sql = match request.list.as_str() {
        "topTracks" => format!(
            "{played} SELECT {track_columns}, played.plays, played.last_played, NULL
             FROM played JOIN tracks t ON t.id = played.track_id
             ORDER BY played.plays DESC, played.last_played DESC, t.id LIMIT ?2"
        ),
        "topAlbums" => format!(
            "{played} SELECT a.id, a.album, a.album_artist_display, a.album, a.id, NULL,
                    a.effective_album_rating, SUM(played.plays), MAX(played.last_played), NULL
             FROM played JOIN tracks t ON t.id = played.track_id
             JOIN albums a ON a.id = t.album_id
             GROUP BY a.id ORDER BY 8 DESC, 9 DESC, a.id LIMIT ?2"
        ),
        "topArtists" => format!(
            // Rank the track's own Artist so compilations do not collapse
            // into their Album Artist ("Various Artists").
            "{played}, artist_plays AS (
                SELECT COALESCE(NULLIF(t.display_artist, ''), t.album_artist_display, '') AS artist,
                       played.plays, played.last_played
                FROM played JOIN tracks t ON t.id = played.track_id
             )
             SELECT artist, artist, artist, NULL, NULL, NULL, NULL,
                    SUM(plays), MAX(last_played), NULL
             FROM artist_plays
             GROUP BY artist ORDER BY 8 DESC, 9 DESC LIMIT ?2"
        ),
        "recent" => format!(
            "SELECT CAST(p.id AS TEXT), p.title, p.artist, p.album, t.album_id, t.id,
                    t.normalized_rating, 1, p.played_at, p.source
             FROM listening_plays p LEFT JOIN {PLAY_LINK_JOIN}
             LEFT JOIN tracks t ON t.id = l.track_id
             WHERE p.played_at >= ?1
             ORDER BY p.played_at DESC, p.id DESC LIMIT ?2"
        ),
        "rediscover" => format!(
            "{played} SELECT {track_columns}, played.plays, played.last_played, NULL
             FROM played JOIN tracks t ON t.id = played.track_id
             WHERE t.normalized_rating >= {FAVORITE_TRACK_RATING} AND played.last_played < ?3
             ORDER BY played.plays DESC, played.last_played, t.id LIMIT ?2"
        ),
        "neverPlayedFavorites" => format!(
            "SELECT {track_columns}, 0, NULL, NULL
             FROM tracks t
             WHERE t.normalized_rating >= {FAVORITE_TRACK_RATING} AND ?1 >= 0
               AND NOT EXISTS (SELECT 1 FROM listening_identity_links l WHERE l.track_id = t.id)
             ORDER BY t.album_artist_display, t.album, t.disc_number, t.track_number, t.id
             LIMIT ?2"
        ),
        "leastPlayedAlbums" => format!(
            "{played}, album_plays AS (
                SELECT t.album_id, SUM(played.plays) AS plays, MAX(played.last_played) AS last_played
                FROM played JOIN tracks t ON t.id = played.track_id GROUP BY t.album_id
             )
             SELECT a.id, a.album, a.album_artist_display, a.album, a.id, NULL,
                    a.effective_album_rating, COALESCE(ap.plays, 0), ap.last_played, NULL
             FROM albums a LEFT JOIN album_plays ap ON ap.album_id = a.id
             WHERE a.effective_album_rating >= {LIKED_ALBUM_RATING}
             ORDER BY COALESCE(ap.plays, 0), ap.last_played IS NOT NULL, ap.last_played,
                      a.effective_album_rating DESC, a.id
             LIMIT ?2"
        ),
        "unmatched" => format!(
            "SELECT p.artist_key || char(31) || p.title_key, MAX(p.title), MAX(p.artist),
                    MAX(p.album), NULL, NULL, NULL, COUNT(*), MAX(p.played_at), NULL
             FROM listening_plays p LEFT JOIN {PLAY_LINK_JOIN}
             LEFT JOIN tracks t ON t.id = l.track_id
             WHERE p.played_at >= ?1 AND t.id IS NULL
             GROUP BY p.artist_key, p.title_key
             ORDER BY 8 DESC, 9 DESC LIMIT ?2"
        ),
        other => bail!("Unknown listening list {other:?}"),
    };
    let mut stmt = conn.prepare(&sql)?;
    let rows = if request.list == "rediscover" {
        stmt.query_map(
            params![0, limit, now - REDISCOVER_AFTER_SECONDS],
            row_from_sql,
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?
    } else {
        stmt.query_map(params![since, limit], row_from_sql)?
            .collect::<rusqlite::Result<Vec<_>>>()?
    };
    Ok(rows)
}

// ---------------------------------------------------------------------------
// Sources and credentials
// ---------------------------------------------------------------------------

fn listenbrainz_entry() -> Result<keyring::Entry> {
    keyring::Entry::new(LISTENBRAINZ_KEYRING_SERVICE, LISTENBRAINZ_KEYRING_USER)
        .context("Could not open the system keychain for ListenBrainz")
}

pub(crate) fn listenbrainz_token() -> Result<Option<zeroize::Zeroizing<String>>> {
    match listenbrainz_entry()?.get_password() {
        Ok(value) if !value.trim().is_empty() => Ok(Some(zeroize::Zeroizing::new(value))),
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error).context("Could not read the ListenBrainz token"),
    }
}

fn normalize_username(value: &str) -> Result<String> {
    let value = value.trim();
    if value.len() > 64 || value.chars().any(|c| c.is_whitespace() || c.is_control()) {
        bail!("Enter a valid user name without spaces.");
    }
    Ok(value.to_string())
}

pub(crate) fn configure_source(conn: &Connection, request: &ListeningSourceRequest) -> Result<()> {
    let source = known_source(&request.source)?;
    if source == "aurora" {
        bail!("Aurora sends plays through the bridge and needs no account.");
    }
    let username = normalize_username(&request.username)?;
    let previous: Option<String> = conn
        .query_row(
            "SELECT username FROM listening_sources WHERE source = ?1",
            [source],
            |row| row.get(0),
        )
        .optional()?;
    // A different account starts its own history from the beginning.
    let reset_cursor = previous.is_some_and(|previous| !previous.eq_ignore_ascii_case(&username));
    conn.execute(
        "INSERT INTO listening_sources (source, username) VALUES (?1, ?2)
         ON CONFLICT(source) DO UPDATE SET username = excluded.username,
             newest_played_at = CASE WHEN ?3 THEN NULL ELSE newest_played_at END,
             last_error = NULL",
        params![source, username, reset_cursor],
    )?;
    Ok(())
}

fn save_listenbrainz_token(request: &ListeningSourceRequest) -> Result<()> {
    if request.source != "listenbrainz" {
        return Ok(());
    }
    if request.clear_token {
        match listenbrainz_entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(error) => return Err(error).context("Could not remove the ListenBrainz token"),
        }
    } else if let Some(token) = request.token.as_deref().map(str::trim) {
        if !token.is_empty() {
            if token.len() > 128 || token.chars().any(|c| c.is_whitespace() || c.is_control()) {
                bail!("Enter a valid ListenBrainz user token.");
            }
            listenbrainz_entry()?
                .set_password(token)
                .context("Could not store the ListenBrainz token")?;
        }
    }
    Ok(())
}

pub(crate) fn clear_source(conn: &Connection, source: &str) -> Result<()> {
    let source = known_source(source)?;
    conn.execute("DELETE FROM listening_plays WHERE source = ?1", [source])?;
    conn.execute(
        "UPDATE listening_sources SET newest_played_at = NULL, last_synced_at = NULL,
             last_error = NULL WHERE source = ?1",
        [source],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Provider payloads
// ---------------------------------------------------------------------------

fn text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.trim().to_string()).filter(|text| !text.is_empty()),
        Value::Object(map) => map.get("#text").and_then(text),
        _ => None,
    }
}

/// Plays and the page count from a Last.fm `user.getRecentTracks` response.
/// The "now playing" entry has no timestamp and is skipped.
pub(crate) fn parse_lastfm_recent(payload: &Value) -> (Vec<PlayInput>, u32) {
    let recent = &payload["recenttracks"];
    let total_pages = recent["@attr"]["totalPages"]
        .as_str()
        .and_then(|value| value.parse().ok())
        .or_else(|| recent["@attr"]["totalPages"].as_u64().map(|v| v as u32))
        .unwrap_or(0);
    let tracks = match &recent["track"] {
        Value::Array(tracks) => tracks.clone(),
        Value::Object(_) => vec![recent["track"].clone()],
        _ => Vec::new(),
    };
    let plays = tracks
        .iter()
        .filter_map(|track| {
            let played_at = track["date"]["uts"]
                .as_str()
                .and_then(|value| value.parse::<i64>().ok())?;
            Some(PlayInput {
                artist: text(&track["artist"]).or_else(|| text(&track["artist"]["name"]))?,
                title: text(&track["name"])?,
                album: text(&track["album"]),
                played_at,
                recording_mbid: text(&track["mbid"]),
                file_path: None,
            })
        })
        .collect();
    (plays, total_pages)
}

/// Plays from a ListenBrainz `/user/{user}/listens` response.
pub(crate) fn parse_listenbrainz_listens(payload: &Value) -> Vec<PlayInput> {
    payload["payload"]["listens"]
        .as_array()
        .map(|listens| {
            listens
                .iter()
                .filter_map(|listen| {
                    let metadata = &listen["track_metadata"];
                    Some(PlayInput {
                        artist: text(&metadata["artist_name"])?,
                        title: text(&metadata["track_name"])?,
                        album: text(&metadata["release_name"]),
                        played_at: listen["listened_at"].as_i64()?,
                        recording_mbid: text(&metadata["mbid_mapping"]["recording_mbid"])
                            .or_else(|| text(&metadata["additional_info"]["recording_mbid"])),
                        file_path: None,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn listenbrainz_get(path: &str, query: &[(&str, String)]) -> Result<Value> {
    let mut url = url::Url::parse(&format!("{LISTENBRAINZ_API_BASE}{path}"))?;
    for (name, value) in query {
        url.query_pairs_mut().append_pair(name, value);
    }
    let mut request = crate::http::get(url.as_str()).set("Accept", "application/json");
    let token = listenbrainz_token()?;
    if let Some(token) = token.as_ref() {
        request = request.set("Authorization", &format!("Token {}", token.as_str()));
    }
    let response = request.call().map_err(|error| match error {
        ureq::Error::Status(401, _) => anyhow::anyhow!("ListenBrainz rejected the user token."),
        ureq::Error::Status(404, _) => anyhow::anyhow!("ListenBrainz has no user with that name."),
        ureq::Error::Status(429, _) => {
            anyhow::anyhow!("ListenBrainz rate limit reached. Try again later.")
        }
        ureq::Error::Status(status, _) => {
            anyhow::anyhow!("ListenBrainz request failed with status {status}.")
        }
        ureq::Error::Transport(_) => anyhow::anyhow!("Could not reach ListenBrainz."),
    })?;
    response
        .into_json()
        .context("ListenBrainz returned an unreadable response")
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

struct SyncCounters {
    fetched: i64,
    inserted: i64,
    duplicates: i64,
    newest: Option<i64>,
}

impl SyncCounters {
    fn add(&mut self, plays: &[PlayInput], summary: InsertSummary) {
        self.fetched += plays.len() as i64;
        self.inserted += summary.inserted;
        self.duplicates += summary.duplicates;
        if let Some(newest) = plays.iter().map(|play| play.played_at).max() {
            self.newest = Some(self.newest.map_or(newest, |current| current.max(newest)));
        }
    }
}

fn sync_lastfm(
    conn: &Connection,
    username: &str,
    since: Option<i64>,
    counters: &mut SyncCounters,
) -> Result<()> {
    // A fixed upper bound keeps pages stable while new scrobbles arrive.
    let to = Utc::now().timestamp();
    let mut page = 1;
    loop {
        crate::jobs::checkpoint()?;
        let payload = crate::lastfm::recent_tracks_page(
            username,
            page,
            LASTFM_PAGE_SIZE,
            since.map(|since| since + 1),
            to,
        )?;
        let (plays, total_pages) = parse_lastfm_recent(&payload);
        let summary = insert_plays(conn, "lastfm", &plays)?;
        counters.add(&plays, summary);
        crate::jobs::progress(
            i64::from(page),
            i64::from(total_pages.max(page)),
            &format!("Last.fm page {page} of {}", total_pages.max(page)),
        );
        if page >= total_pages || plays.is_empty() {
            return Ok(());
        }
        page += 1;
    }
}

fn sync_listenbrainz(
    conn: &Connection,
    username: &str,
    since: Option<i64>,
    counters: &mut SyncCounters,
) -> Result<()> {
    let user_path = format!("/user/{}", urlencoding_path(username));
    let total = listenbrainz_get(&format!("{user_path}/listen-count"), &[])
        .ok()
        .and_then(|payload| payload["payload"]["count"].as_i64())
        .unwrap_or(0);
    let mut max_ts = Utc::now().timestamp() + 1;
    loop {
        crate::jobs::checkpoint()?;
        let payload = listenbrainz_get(
            &format!("{user_path}/listens"),
            &[
                ("count", LISTENBRAINZ_PAGE_SIZE.to_string()),
                ("max_ts", max_ts.to_string()),
            ],
        )?;
        let mut plays = parse_listenbrainz_listens(&payload);
        let Some(oldest) = plays.iter().map(|play| play.played_at).min() else {
            return Ok(());
        };
        let reached_cursor = since.is_some_and(|since| oldest <= since);
        if let Some(since) = since {
            plays.retain(|play| play.played_at > since);
        }
        let summary = insert_plays(conn, "listenbrainz", &plays)?;
        counters.add(&plays, summary);
        crate::jobs::progress(
            counters.fetched,
            if since.is_none() {
                total.max(counters.fetched)
            } else {
                0
            },
            &format!("ListenBrainz: {} listens read", counters.fetched),
        );
        if reached_cursor || oldest >= max_ts {
            return Ok(());
        }
        max_ts = oldest;
    }
}

fn urlencoding_path(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes())
        .collect::<String>()
        .replace('+', "%20")
}

fn total_and_matched(conn: &Connection) -> Result<(i64, i64)> {
    let total = conn.query_row("SELECT COUNT(*) FROM listening_plays", [], |row| row.get(0))?;
    let matched = conn.query_row(
        &format!(
            "SELECT COUNT(*) FROM listening_plays p JOIN {PLAY_LINK_JOIN}
             JOIN tracks t ON t.id = l.track_id"
        ),
        [],
        |row| row.get(0),
    )?;
    Ok((total, matched))
}

pub(crate) fn sync_source(conn: &Connection, source: &str) -> Result<ListeningSyncResult> {
    let source = known_source(source)?;
    if source == "aurora" {
        bail!("Aurora sends plays to Music Library on its own; there is nothing to sync.");
    }
    let (username, since): (String, Option<i64>) = conn
        .query_row(
            "SELECT username, newest_played_at FROM listening_sources WHERE source = ?1",
            [source],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
        .unwrap_or_default();
    if username.is_empty() {
        bail!("Add a user name for this source before syncing.");
    }
    let mut counters = SyncCounters {
        fetched: 0,
        inserted: 0,
        duplicates: 0,
        newest: since,
    };
    let outcome = match source {
        "lastfm" => sync_lastfm(conn, &username, since, &mut counters),
        _ => sync_listenbrainz(conn, &username, since, &mut counters),
    };
    let now = Utc::now().to_rfc3339();
    if let Err(error) = outcome {
        // The cursor stays put: a retry re-reads the gap and dedupes.
        conn.execute(
            "UPDATE listening_sources SET last_error = ?2 WHERE source = ?1",
            params![source, format!("{error:#}")],
        )?;
        if counters.inserted > 0 {
            refresh_links(conn)?;
        }
        return Err(error);
    }
    conn.execute(
        "UPDATE listening_sources SET newest_played_at = ?2, last_synced_at = ?3,
             last_error = NULL WHERE source = ?1",
        params![source, counters.newest, now],
    )?;
    crate::jobs::progress(1, 1, "Linking plays to library tracks");
    refresh_links(conn)?;
    let (total_plays, matched_plays) = total_and_matched(conn)?;
    let label = SOURCES
        .iter()
        .find(|(id, _)| *id == source)
        .map_or(source, |(_, label)| label);
    Ok(ListeningSyncResult {
        source: source.to_string(),
        fetched: counters.fetched,
        inserted: counters.inserted,
        duplicates: counters.duplicates,
        total_plays,
        matched_plays,
        message: format!(
            "{label}: {} new plays, {} already known. {matched_plays} of {total_plays} plays match library tracks.",
            counters.inserted, counters.duplicates
        ),
    })
}

// ---------------------------------------------------------------------------
// Aurora bridge
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgePlay {
    artist: String,
    title: String,
    #[serde(default)]
    album: Option<String>,
    played_at: Value,
    #[serde(default)]
    file_path: Option<String>,
    #[serde(default)]
    recording_mbid: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BridgePlays {
    plays: Vec<BridgePlay>,
}

fn bridge_timestamp(value: &Value) -> Option<i64> {
    match value {
        Value::Number(number) => number.as_i64(),
        Value::String(text) => chrono::DateTime::parse_from_rfc3339(text.trim())
            .ok()
            .map(|time| time.timestamp()),
        _ => None,
    }
}

pub(crate) fn record_bridge_plays(conn: &Connection, payload: Value) -> Result<Value> {
    let request: BridgePlays = serde_json::from_value(payload)
        .context("recordPlays payload must contain plays with artist, title, and playedAt")?;
    if request.plays.len() > MAX_BRIDGE_PLAYS {
        bail!("recordPlays accepts at most {MAX_BRIDGE_PLAYS} plays per request");
    }
    let mut invalid = 0;
    let plays = request
        .plays
        .into_iter()
        .filter_map(|play| {
            let played_at = bridge_timestamp(&play.played_at);
            if played_at.is_none() {
                invalid += 1;
            }
            Some(PlayInput {
                artist: play.artist,
                title: play.title,
                album: play.album,
                played_at: played_at?,
                recording_mbid: play.recording_mbid,
                file_path: play.file_path,
            })
        })
        .collect::<Vec<_>>();
    let summary = insert_plays(conn, "aurora", &plays)?;
    if let Some(newest) = plays.iter().map(|play| play.played_at).max() {
        conn.execute(
            "INSERT INTO listening_sources (source, newest_played_at, last_synced_at)
             VALUES ('aurora', ?1, ?2)
             ON CONFLICT(source) DO UPDATE SET
                 newest_played_at = MAX(COALESCE(newest_played_at, 0), excluded.newest_played_at),
                 last_synced_at = excluded.last_synced_at",
            params![newest, Utc::now().to_rfc3339()],
        )?;
    }
    Ok(serde_json::json!({
        "inserted": summary.inserted,
        "duplicates": summary.duplicates,
        "skipped": summary.skipped + invalid,
    }))
}

pub(crate) fn record_bridge_plays_at(app_data_dir: &Path, payload: Value) -> Result<Value> {
    let conn = crate::db::open_path(&app_data_dir.join("music-library.sqlite3"))?;
    record_bridge_plays(&conn, payload)
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[cfg(not(test))]
fn ensure_links(app: &tauri::AppHandle) -> Result<()> {
    let (reader, _) = crate::db::open_read(app)?;
    if links_current(&reader)? {
        return Ok(());
    }
    drop(reader);
    let (writer, _) = crate::db::open(app)?;
    if !links_current(&writer)? {
        refresh_links(&writer)?;
    }
    Ok(())
}

#[cfg(not(test))]
pub fn sync_for_app(app: &tauri::AppHandle, source: &str) -> Result<ListeningSyncResult> {
    let (conn, _) = crate::db::open(app)?;
    sync_source(&conn, source)
}

#[cfg(not(test))]
async fn blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T> + Send + 'static,
) -> std::result::Result<T, String> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| format!("{error:#}"))
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn listening_overview(
    app: tauri::AppHandle,
) -> std::result::Result<ListeningOverview, String> {
    blocking(move || {
        ensure_links(&app)?;
        let (conn, _) = crate::db::open_read(&app)?;
        overview(&conn, Utc::now().timestamp())
    })
    .await
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn listening_list(
    app: tauri::AppHandle,
    request: ListeningListRequest,
) -> std::result::Result<Vec<ListeningRow>, String> {
    blocking(move || {
        ensure_links(&app)?;
        let (conn, _) = crate::db::open_read(&app)?;
        list(&conn, &request, Utc::now().timestamp())
    })
    .await
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn listening_configure_source(
    app: tauri::AppHandle,
    request: ListeningSourceRequest,
) -> std::result::Result<ListeningOverview, String> {
    blocking(move || {
        save_listenbrainz_token(&request)?;
        let (conn, _) = crate::db::open(&app)?;
        configure_source(&conn, &request)?;
        overview(&conn, Utc::now().timestamp())
    })
    .await
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn listening_clear_source(
    app: tauri::AppHandle,
    source: String,
) -> std::result::Result<ListeningOverview, String> {
    blocking(move || {
        let (conn, _) = crate::db::open(&app)?;
        clear_source(&conn, &source)?;
        refresh_links(&conn)?;
        overview(&conn, Utc::now().timestamp())
    })
    .await
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn listening_sync(
    app: tauri::AppHandle,
    source: String,
) -> std::result::Result<crate::jobs::JobOutput<ListeningSyncResult>, String> {
    crate::jobs::execute_typed(
        app,
        "listeningSync",
        serde_json::json!({ "source": source }),
    )
    .await
}

#[cfg(test)]
mod tests;
