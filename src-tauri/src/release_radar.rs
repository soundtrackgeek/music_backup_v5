//! One sitewide feed, projected against every catalog artist and Wish List artist.
//! Network work never holds a catalog connection or a write transaction.
use anyhow::{bail, Context, Result};
use chrono::{Duration, Local, Months, NaiveDate, Utc};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::sync::Mutex;

const MAX_RESPONSE_BYTES: u64 = 32 * 1024 * 1024;
const CACHE_HOURS: i64 = 24;
static REFRESH: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RadarArtist {
    pub id: String,
    pub name: String,
    pub musicbrainz_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RadarRelease {
    pub release_group_id: String,
    pub title: String,
    pub artist: String,
    pub artists: Vec<RadarArtist>,
    pub release_date: String,
    pub release_type: String,
    pub secondary_type: Option<String>,
    pub musicbrainz_url: String,
    pub owned: bool,
    pub on_wish_list: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseRadar {
    pub today: String,
    pub upcoming_until: String,
    pub recent_since: String,
    pub checked_at: Option<String>,
    pub stale: bool,
    pub warning: Option<String>,
    pub artist_count: usize,
    pub identified_artist_count: usize,
    pub unresolved_artist_ids: Vec<String>,
    pub releases: Vec<RadarRelease>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FreshRelease {
    artist_credit_name: String,
    artist_mbids: Vec<String>,
    release_date: String,
    release_group_mbid: String,
    release_name: String,
    release_group_primary_type: Option<String>,
    #[serde(default)]
    release_group_secondary_type: Option<String>,
}

#[derive(Deserialize)]
struct FreshPayload {
    releases: Vec<FreshRelease>,
    total_count: usize,
}
#[derive(Deserialize)]
struct FreshResponse {
    payload: FreshPayload,
}

pub(crate) fn install_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS release_radar_snapshot (
        id INTEGER PRIMARY KEY CHECK(id=1), pivot_date TEXT NOT NULL,
        checked_at TEXT NOT NULL, releases_json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS release_radar_identities (
        artist_key TEXT PRIMARY KEY, mbid TEXT, checked_at TEXT NOT NULL);",
    )?;
    Ok(())
}
pub(crate) fn schema_exists(conn: &Connection) -> Result<bool> {
    Ok(conn.query_row(
        "SELECT COUNT(*)=2 FROM sqlite_master WHERE type='table'
        AND name IN ('release_radar_snapshot','release_radar_identities')",
        [],
        |r| r.get(0),
    )?)
}

fn valid_mbid(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(i, c)| {
            if matches!(i, 8 | 13 | 18 | 23) {
                c == b'-'
            } else {
                c.is_ascii_hexdigit()
            }
        })
}

/// Exact name mappings only. Ambiguous cache names never choose the first MBID.
fn cache_identities(cache: &Connection) -> Result<HashMap<String, HashSet<String>>> {
    let mut result: HashMap<String, HashSet<String>> = HashMap::new();
    let mut stmt = cache.prepare("SELECT name, mbid FROM artist_cache WHERE mbid IS NOT NULL")?;
    for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))? {
        let (name, mbid) = row?;
        if valid_mbid(&mbid) {
            result
                .entry(crate::identity::artist_text_key(&name))
                .or_default()
                .insert(mbid.to_lowercase());
        }
    }
    Ok(result)
}

fn watched_artists(
    conn: &Connection,
    cache: &HashMap<String, HashSet<String>>,
) -> Result<Vec<RadarArtist>> {
    let key_sql = crate::identity::artist_key_sql("album_artist_display");
    let mut stmt = conn.prepare(&format!("WITH artists AS (
        SELECT {key_sql} AS artist_key, COALESCE(MIN(NULLIF(TRIM(album_artist_display),'')), 'Unknown Artist') AS name
        FROM albums GROUP BY artist_key)
        SELECT a.artist_key,a.name,l.mbid,l.verification_state,l.ignored,
            EXISTS(SELECT 1 FROM musicbrainz_artist_link_tombstones t WHERE t.local_artist_key=a.artist_key),
            i.mbid,i.review_state,r.mbid
        FROM artists a LEFT JOIN musicbrainz_artist_links l ON l.local_artist_key=a.artist_key
        LEFT JOIN musicbrainz_artist_infos i ON i.local_artist_key=a.artist_key
        LEFT JOIN release_radar_identities r ON r.artist_key=a.artist_key ORDER BY a.artist_key"))?;
    let mut artists = Vec::new();
    for row in stmt.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, Option<String>>(2)?,
            r.get::<_, Option<String>>(3)?,
            r.get::<_, Option<bool>>(4)?.unwrap_or(false),
            r.get::<_, bool>(5)?,
            r.get::<_, Option<String>>(6)?,
            r.get::<_, Option<String>>(7)?,
            r.get::<_, Option<String>>(8)?,
        ))
    })? {
        let (id, name, link, state, ignored, unlinked, info, review, radar) = row?;
        let mbid = if ignored || unlinked {
            None
        } else if state.as_deref() == Some("verified") {
            link
        } else if matches!(review.as_deref(), Some("imported" | "manual" | "reviewed")) {
            info
        } else {
            radar.or_else(|| {
                cache
                    .get(&id)
                    .filter(|ids| ids.len() == 1)
                    .and_then(|ids| ids.iter().next().cloned())
            })
        };
        artists.push(RadarArtist {
            id,
            name,
            musicbrainz_id: mbid.filter(|v| valid_mbid(v)).map(|v| v.to_lowercase()),
        });
    }
    // Wish List artists participate even when none of their albums are owned.
    let mut stmt =
        conn.prepare("SELECT title,musicbrainz_id FROM wish_list_items WHERE entity='artist'")?;
    for row in stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?))
    })? {
        let (name, mbid) = row?;
        let id = crate::identity::artist_text_key(&name);
        if !artists.iter().any(|a| a.id == id) {
            artists.push(RadarArtist {
                id,
                name,
                musicbrainz_id: mbid.filter(|v| valid_mbid(v)).map(|v| v.to_lowercase()),
            });
        }
    }
    Ok(artists)
}

fn project(
    conn: &Connection,
    artists: Vec<RadarArtist>,
    rows: Vec<FreshRelease>,
    today: NaiveDate,
    checked_at: Option<String>,
    stale: bool,
    warning: Option<String>,
) -> Result<ReleaseRadar> {
    let upcoming_until = today
        .checked_add_months(Months::new(1))
        .context("Invalid release window")?;
    let recent_since = today - Duration::days(30);
    let mut by_mbid: HashMap<String, Vec<RadarArtist>> = HashMap::new();
    let identified_artist_count = artists
        .iter()
        .filter(|a| a.musicbrainz_id.is_some())
        .count();
    for artist in &artists {
        if let Some(mbid) = &artist.musicbrainz_id {
            by_mbid
                .entry(mbid.clone())
                .or_default()
                .push(artist.clone());
        }
    }
    let mut owned_ids = HashSet::new();
    let mut owned_titles = HashSet::new();
    let mut stmt = conn.prepare("SELECT album_artist_display,album FROM albums")?;
    for row in stmt.query_map([], |r| {
        Ok((
            r.get::<_, Option<String>>(0)?,
            r.get::<_, Option<String>>(1)?,
        ))
    })? {
        let (artist, title) = row?;
        if let (Some(artist), Some(title)) = (artist, title) {
            owned_titles.insert((
                crate::identity::artist_text_key(&artist),
                crate::identity::edition_title_key(&title),
            ));
        }
    }
    let mut stmt=conn.prepare("SELECT release_mbid FROM musicbrainz_release_decisions WHERE decision='include' AND local_album_id IN (SELECT id FROM albums)")?;
    for row in stmt.query_map([], |r| r.get::<_, String>(0))? {
        owned_ids.insert(row?.to_lowercase());
    }
    let mut wish_ids = HashSet::new();
    let mut wish_titles = HashSet::new();
    let mut stmt = conn
        .prepare("SELECT musicbrainz_id,artist,title FROM wish_list_items WHERE entity='album'")?;
    for row in stmt.query_map([], |r| {
        Ok((
            r.get::<_, Option<String>>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
        ))
    })? {
        let (id, artist, title) = row?;
        if let Some(id) = id {
            wish_ids.insert(id.to_lowercase());
        }
        wish_titles.insert((
            crate::identity::artist_text_key(&artist),
            crate::identity::edition_title_key(&title),
        ));
    }
    let mut releases = HashMap::<String, RadarRelease>::new();
    for row in rows {
        // Partial/unknown dates do not become invented day-level announcements.
        let Ok(date) = NaiveDate::parse_from_str(&row.release_date, "%Y-%m-%d") else {
            continue;
        };
        if row.release_date.len() != 10
            || date < recent_since
            || date > upcoming_until
            || !valid_mbid(&row.release_group_mbid)
        {
            continue;
        }
        let matched: Vec<_> = row
            .artist_mbids
            .iter()
            .filter_map(|id| by_mbid.get(&id.to_lowercase()))
            .flatten()
            .cloned()
            .collect();
        if matched.is_empty() {
            continue;
        }
        let id = row.release_group_mbid.to_lowercase();
        let title_key = crate::identity::edition_title_key(&row.release_name);
        let owned = owned_ids.contains(&id)
            || owned_titles.contains(&(
                crate::identity::artist_text_key(&row.artist_credit_name),
                title_key.clone(),
            ))
            || (row.artist_mbids.len() == 1
                && matched
                    .iter()
                    .any(|a| owned_titles.contains(&(a.id.clone(), title_key.clone()))));
        let on_wish_list = wish_ids.contains(&id)
            || wish_titles.contains(&(
                crate::identity::artist_text_key(&row.artist_credit_name),
                title_key,
            ));
        let next = RadarRelease {
            release_group_id: id.clone(),
            title: row.release_name,
            artist: row.artist_credit_name,
            artists: matched,
            release_date: row.release_date,
            release_type: row
                .release_group_primary_type
                .unwrap_or_else(|| "Other".into()),
            secondary_type: row.release_group_secondary_type,
            musicbrainz_url: format!("https://musicbrainz.org/release-group/{id}"),
            owned,
            on_wish_list,
        };
        if let Some(existing) = releases.get_mut(&id) {
            if next.release_date < existing.release_date {
                existing.release_date = next.release_date;
            }
            for artist in next.artists {
                if !existing.artists.iter().any(|a| a.id == artist.id) {
                    existing.artists.push(artist);
                }
            }
            existing.owned |= next.owned;
            existing.on_wish_list |= next.on_wish_list;
        } else {
            releases.insert(id, next);
        }
    }
    let mut releases: Vec<_> = releases.into_values().collect();
    releases.sort_by(|a, b| {
        a.release_date
            .cmp(&b.release_date)
            .then_with(|| a.artist.cmp(&b.artist))
            .then_with(|| a.title.cmp(&b.title))
    });
    let unresolved_artist_ids = artists
        .iter()
        .filter(|a| a.musicbrainz_id.is_none())
        .map(|a| a.id.clone())
        .collect();
    Ok(ReleaseRadar {
        today: today.to_string(),
        upcoming_until: upcoming_until.to_string(),
        recent_since: recent_since.to_string(),
        checked_at,
        stale,
        warning,
        artist_count: artists.len(),
        identified_artist_count,
        unresolved_artist_ids,
        releases,
    })
}

fn read_snapshot(conn: &Connection) -> Result<Option<(String, String, Vec<FreshRelease>)>> {
    let stored = conn
        .query_row(
            "SELECT pivot_date,checked_at,releases_json FROM release_radar_snapshot WHERE id=1",
            [],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            },
        )
        .optional()?;
    stored
        .map(|(pivot, checked, json)| Ok((pivot, checked, serde_json::from_str(&json)?)))
        .transpose()
}
fn is_fresh(pivot: &str, checked: &str, today: NaiveDate) -> bool {
    pivot == today.to_string()
        && chrono::DateTime::parse_from_rfc3339(checked).is_ok_and(|t| {
            let age = Utc::now().signed_duration_since(t);
            age >= Duration::zero() && age < Duration::hours(CACHE_HOURS)
        })
}

#[cfg(not(test))]
fn fetch_feed(today: NaiveDate) -> Result<Vec<FreshRelease>> {
    let mut request = crate::http::get("https://api.listenbrainz.org/1/explore/fresh-releases/")
        .query("release_date", &today.to_string())
        .query("days", "31")
        .query("past", "true")
        .query("future", "true")
        .query("sort", "release_date");
    if let Some(token) = crate::listening::listenbrainz_token()? {
        request = request.set("Authorization", &format!("Token {}", token.as_str()));
    }
    let response = request.call().map_err(|error| match error {
        ureq::Error::Status(401 | 403, _) => anyhow::anyhow!(
            "ListenBrainz requires a valid token. Configure it in Settings → Listening history."
        ),
        _ => anyhow::anyhow!("ListenBrainz release feed could not be refreshed: {error}"),
    })?;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(MAX_RESPONSE_BYTES + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_RESPONSE_BYTES {
        bail!("ListenBrainz release feed exceeded the response limit")
    }
    decode_feed(&bytes)
}

fn decode_feed(bytes: &[u8]) -> Result<Vec<FreshRelease>> {
    let response: FreshResponse =
        serde_json::from_slice(bytes).context("Invalid ListenBrainz release feed")?;
    if response.payload.total_count != response.payload.releases.len() {
        bail!("ListenBrainz returned an incomplete release feed; the previous radar was retained")
    }
    Ok(response.payload.releases)
}

#[cfg(not(test))]
fn load_cache(app: &tauri::AppHandle) -> Result<HashMap<String, HashSet<String>>> {
    let path = {
        let (conn, _) = crate::db::open(app)?;
        crate::db::settings_for_connection(&conn)?.musicbrainz_cache_path
    };
    let status = crate::musicbrainz::cache_status_for_path(Some(path))?;
    if !status.valid {
        return Ok(HashMap::new());
    }
    let cache =
        Connection::open_with_flags(status.resolved_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    cache_identities(&cache)
}

/// Resolve only exact single-artist feed candidates, at most 20 per refresh.
/// This avoids thousands of artist lookups and never commits a guessed identity.
#[cfg(not(test))]
fn resolve_feed_candidates(
    app: &tauri::AppHandle,
    rows: &[FreshRelease],
    cache: &HashMap<String, HashSet<String>>,
) -> Result<()> {
    let candidates = {
        let (conn, _) = crate::db::open(app)?;
        let watched = watched_artists(&conn, cache)?;
        let feed_names: HashSet<_> = rows
            .iter()
            .filter(|r| r.artist_mbids.len() == 1)
            .map(|r| crate::identity::artist_text_key(&r.artist_credit_name))
            .collect();
        let mut candidates = Vec::new();
        for artist in watched
            .into_iter()
            .filter(|a| a.musicbrainz_id.is_none() && feed_names.contains(&a.id))
        {
            let blocked:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM musicbrainz_artist_links WHERE local_artist_key=?1 AND ignored=1)
                OR EXISTS(SELECT 1 FROM musicbrainz_artist_link_tombstones WHERE local_artist_key=?1)
                OR EXISTS(SELECT 1 FROM release_radar_identities WHERE artist_key=?1 AND checked_at>?2)",
                params![artist.id,(Utc::now()-Duration::hours(24)).to_rfc3339()],|r|r.get(0))?;
            if !blocked {
                candidates.push(artist);
            }
            if candidates.len() == 20 {
                break;
            }
        }
        candidates
    };
    for artist in candidates {
        // Query quoted names, escaping Lucene punctuation supplied by file tags.
        let escaped = artist.name.replace('\\', "\\\\").replace('"', "\\\"");
        let response = crate::http::musicbrainz()
            .get("https://musicbrainz.org/ws/2/artist")
            .query("query", &format!("artist:\"{escaped}\""))
            .query("fmt", "json")
            .query("limit", "100")
            .call()?;
        let mut bytes = Vec::new();
        response
            .into_reader()
            .take(1024 * 1024 + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() > 1024 * 1024 {
            bail!("MusicBrainz artist response exceeded the limit")
        }
        let payload: serde_json::Value = serde_json::from_slice(&bytes)?;
        let matches = payload["artists"]
            .as_array()
            .context("Invalid MusicBrainz artist response")?;
        let exact: HashSet<String> = matches
            .iter()
            .filter(|r| {
                r["name"]
                    .as_str()
                    .is_some_and(|name| crate::identity::artist_text_key(name) == artist.id)
            })
            .filter_map(|r| {
                r["id"]
                    .as_str()
                    .filter(|id| valid_mbid(id))
                    .map(|id| id.to_lowercase())
            })
            .collect();
        let complete = payload["count"]
            .as_u64()
            .is_some_and(|count| count <= matches.len() as u64);
        let mbid = if complete && exact.len() == 1 {
            exact.into_iter().next()
        } else {
            None
        };
        let (conn, _) = crate::db::open(app)?;
        conn.execute("INSERT INTO release_radar_identities VALUES(?1,?2,?3) ON CONFLICT(artist_key) DO UPDATE SET mbid=excluded.mbid,checked_at=excluded.checked_at",
            params![artist.id,mbid,Utc::now().to_rfc3339()])?;
    }
    Ok(())
}

#[cfg(not(test))]
fn radar_for_app(app: &tauri::AppHandle, refresh: bool) -> Result<ReleaseRadar> {
    let _guard = REFRESH
        .lock()
        .map_err(|_| anyhow::anyhow!("Release radar refresh was interrupted"))?;
    let today = Local::now().date_naive();
    let stored = {
        let (conn, _) = crate::db::open(app)?;
        read_snapshot(&conn)?
    };
    let cache = load_cache(app)?;
    let mut warning = None;
    let (checked_at, rows, stale) = if !refresh
        && stored
            .as_ref()
            .is_some_and(|(pivot, checked, _)| is_fresh(pivot, checked, today))
    {
        let (_, checked, rows) = stored.unwrap();
        (Some(checked), rows, false)
    } else {
        match fetch_feed(today) {
            Ok(rows) => {
                if let Err(error) = resolve_feed_candidates(app, &rows, &cache) {
                    warning = Some(format!(
                        "Some artist identities could not be checked: {error}"
                    ));
                }
                let checked = Utc::now().to_rfc3339();
                let (conn, _) = crate::db::open(app)?;
                conn.execute("INSERT INTO release_radar_snapshot VALUES(1,?1,?2,?3) ON CONFLICT(id) DO UPDATE SET pivot_date=excluded.pivot_date,checked_at=excluded.checked_at,releases_json=excluded.releases_json",
                    params![today.to_string(),checked,serde_json::to_string(&rows)?])?;
                (Some(checked), rows, false)
            }
            Err(error) => {
                warning = Some(error.to_string());
                match stored {
                    Some((_, checked, rows)) => (Some(checked), rows, true),
                    None => (None, Vec::new(), true),
                }
            }
        }
    };
    let (conn, _) = crate::db::open(app)?;
    project(
        &conn,
        watched_artists(&conn, &cache)?,
        rows,
        today,
        checked_at,
        stale,
        warning,
    )
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn get_release_radar(
    app: tauri::AppHandle,
    refresh: bool,
) -> Result<ReleaseRadar, String> {
    tauri::async_runtime::spawn_blocking(move || radar_for_app(&app, refresh))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests;
