//! Calendar reviews use existing, immutable activity evidence. No schema or source-tag writes.
use crate::listening::review::ReviewListening;
use anyhow::{bail, Result};
use chrono::{Datelike, TimeZone, Utc};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRequest {
    pub start_at: i64,
    pub end_at: i64,
    pub previous_start_at: i64,
}

#[derive(Debug, Clone, Default, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReviewMetrics {
    pub albums_added: i64,
    pub new_artists: i64,
    pub album_ratings_given: i64,
    pub newly_rated_tracks: i64,
    pub completion_change: Option<f64>,
    pub listening: ReviewListening,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReviewGenre {
    pub genre: String,
    pub albums: i64,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRatingChange {
    pub album_id: Option<String>,
    pub album: String,
    pub artist: String,
    pub previous: i64,
    pub current: i64,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReviewDriftYear {
    pub year: i32,
    pub total: i64,
    pub genres: Vec<ReviewGenre>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReviewReport {
    pub start_at: i64,
    pub end_at: i64,
    pub previous_start_at: i64,
    pub activity_since: Option<i64>,
    pub current: ReviewMetrics,
    pub previous: ReviewMetrics,
    pub top_genres: Vec<ReviewGenre>,
    pub rating_changes: Vec<ReviewRatingChange>,
    pub taste_drift: Vec<ReviewDriftYear>,
}

fn metrics(conn: &Connection, start: i64, end: i64, highlights: bool) -> Result<ReviewMetrics> {
    // Count first recorded introductions, so re-additions and multi-row update records count once.
    let albums_added = conn.query_row(
        "SELECT COUNT(*) FROM (
        SELECT album_id,MIN(unixepoch(created_at)) first_at FROM library_updates
        WHERE change_kind='new' GROUP BY album_id) WHERE first_at>=?1 AND first_at<?2",
        [start, end],
        |r| r.get(0),
    )?;
    let key = crate::identity::artist_key_sql("u.album_artist_display");
    let new_artists = conn.query_row(
        &format!(
            "SELECT COUNT(*) FROM (
        SELECT COALESCE(aa.artist_id,{key}) artist,MIN(unixepoch(u.created_at)) first_at
        FROM library_updates u LEFT JOIN artist_album_assignments aa ON aa.album_id=u.album_id
        WHERE u.change_kind='new' AND TRIM(COALESCE(u.album_artist_display,''))<>''
        GROUP BY artist) WHERE first_at>=?1 AND first_at<?2"
        ),
        [start, end],
        |r| r.get(0),
    )?;
    let (album_ratings_given, newly_rated_tracks) = conn.query_row(
        "SELECT
        COUNT(CASE WHEN current_effective_album_rating IS NOT NULL
          AND current_effective_album_rating IS NOT previous_effective_album_rating THEN 1 END),
        COALESCE(SUM(CASE WHEN previous_rated_tracks IS NOT NULL
          THEN MAX(0,COALESCE(current_rated_tracks,0)-previous_rated_tracks) ELSE 0 END),0)
        FROM rating_events WHERE unixepoch(created_at)>=?1 AND unixepoch(created_at)<?2",
        [start, end],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let snapshot = |cutoff: i64| -> Result<Option<f64>> {
        Ok(conn
            .query_row(
                "SELECT CAST(rated_tracks AS REAL)/NULLIF(track_count,0)
            FROM rating_snapshots WHERE unixepoch(created_at)<?1
            ORDER BY unixepoch(created_at) DESC,id DESC LIMIT 1",
                [cutoff],
                |r| r.get(0),
            )
            .optional()?
            .flatten())
    };
    let completion_change = snapshot(start)?
        .zip(snapshot(end)?)
        .map(|(before, after)| after - before);
    Ok(ReviewMetrics {
        albums_added,
        new_artists,
        album_ratings_given,
        newly_rated_tracks,
        completion_change,
        listening: crate::listening::review::summarize(conn, start, end, highlights)?,
    })
}

fn sorted_genres(counts: HashMap<String, i64>) -> Vec<ReviewGenre> {
    let mut rows: Vec<_> = counts
        .into_iter()
        .map(|(genre, albums)| ReviewGenre { genre, albums })
        .collect();
    rows.sort_by(|a, b| b.albums.cmp(&a.albums).then(a.genre.cmp(&b.genre)));
    rows
}

fn drift(conn: &Connection, end: i64) -> Result<Vec<ReviewDriftYear>> {
    // Reconstruct the latest recorded album rating at each year end, carrying earlier ratings forward.
    // Genre is the CURRENT catalog genre; historical genre labels were not snapshotted.
    let end_year = Utc.timestamp_opt(end - 1, 0).single().unwrap().year();
    let first: Option<i32> = conn.query_row(
        "SELECT MIN(CAST(strftime('%Y',created_at) AS INTEGER)) FROM rating_events
        WHERE unixepoch(created_at)<?1",
        [end],
        |r| r.get(0),
    )?;
    let Some(first) = first else {
        return Ok(vec![]);
    };
    let mut statement = conn.prepare(
        "SELECT e.album_id,unixepoch(e.created_at),e.current_effective_album_rating,
        COALESCE(NULLIF(a.canonical_genre,''),'Unknown / no longer in catalog')
        FROM rating_events e LEFT JOIN albums a ON a.id=e.album_id
        WHERE unixepoch(e.created_at)<?1 ORDER BY unixepoch(e.created_at),e.id",
    )?;
    let mut events = statement.query([end])?;
    let mut next = events.next()?;
    let mut ratings: HashMap<String, (Option<i64>, String)> = HashMap::new();
    let mut result = Vec::new();
    for year in first.max(end_year - 11)..=end_year {
        let cutoff = end.min(
            Utc.with_ymd_and_hms(year + 1, 1, 1, 0, 0, 0)
                .single()
                .unwrap()
                .timestamp(),
        );
        while let Some(event) = next {
            if event.get::<_, i64>(1)? >= cutoff {
                break;
            }
            ratings.insert(event.get(0)?, (event.get(2)?, event.get(3)?));
            next = events.next()?;
        }
        let mut counts = HashMap::new();
        for (rating, genre) in ratings.values() {
            if rating.is_some_and(|rating| rating >= 80) {
                *counts.entry(genre.clone()).or_insert(0) += 1;
            }
        }
        let total = counts.values().sum();
        result.push(ReviewDriftYear {
            year,
            total,
            genres: sorted_genres(counts),
        });
    }
    Ok(result)
}

pub(crate) fn report(conn: &Connection, request: &ReviewRequest, now: i64) -> Result<ReviewReport> {
    if request.previous_start_at < 0
        || request.previous_start_at >= request.start_at
        || request.start_at >= request.end_at
        || request.end_at - request.start_at > 367 * 86400
        || request.start_at - request.previous_start_at > 367 * 86400
        || Utc.timestamp_opt(request.end_at, 0).single().is_none()
        || request.end_at
            > Utc
                .with_ymd_and_hms(9999, 1, 1, 0, 0, 0)
                .single()
                .unwrap()
                .timestamp()
    {
        bail!("Choose a valid review period of at most twelve months after 1970.");
    }
    let end = request.end_at.min(now.saturating_add(1));
    if end <= request.start_at {
        bail!("Choose a period that has already started.");
    }
    let start = request.start_at;
    // One SQLite read transaction keeps all sections on the same catalog/history snapshot.
    let tx = conn.unchecked_transaction()?;
    let current = metrics(&tx, start, end, true)?;
    let previous = metrics(&tx, request.previous_start_at, start, false)?;
    let activity_since = tx.query_row("SELECT MIN(ts) FROM (
        SELECT unixepoch(created_at) ts FROM library_updates UNION ALL
        SELECT unixepoch(created_at) FROM rating_events UNION ALL SELECT unixepoch(created_at) FROM rating_snapshots)",
        [], |r| r.get(0))?;
    let mut statement = tx.prepare("SELECT COALESCE(NULLIF(a.canonical_genre,''),'Unknown / no longer in catalog'),COUNT(*)
        FROM (SELECT album_id,MIN(unixepoch(created_at)) first_at FROM library_updates WHERE change_kind='new' GROUP BY album_id) u
        LEFT JOIN albums a ON a.id=u.album_id WHERE first_at>=?1 AND first_at<?2 GROUP BY 1 ORDER BY 2 DESC,1")?;
    let top_genres = statement
        .query_map([start, end], |r| {
            Ok(ReviewGenre {
                genre: r.get(0)?,
                albums: r.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<_>>()?;
    let mut statement = tx.prepare("SELECT e.album_id,e.album,e.album_artist_display,e.previous_effective_album_rating,
        e.current_effective_album_rating,a.id FROM rating_events e LEFT JOIN albums a ON a.id=e.album_id
        WHERE unixepoch(e.created_at)>=?1 AND unixepoch(e.created_at)<?2 ORDER BY unixepoch(e.created_at),e.id")?;
    let mut changes = BTreeMap::<String, ReviewRatingChange>::new();
    for row in statement.query_map([start, end], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, Option<String>>(1)?,
            r.get::<_, Option<String>>(2)?,
            r.get::<_, Option<i64>>(3)?,
            r.get::<_, Option<i64>>(4)?,
            r.get::<_, Option<String>>(5)?,
        ))
    })? {
        let (id, album, artist, before, after, live_id) = row?;
        // A newly rated or removed album is not a numeric before/after change.
        let change = changes.entry(id).or_insert(ReviewRatingChange {
            album_id: live_id,
            album: album.unwrap_or_default(),
            artist: artist.unwrap_or_default(),
            previous: before.unwrap_or(-1),
            current: -1,
        });
        change.current = after.unwrap_or(-1);
    }
    let mut rating_changes: Vec<_> = changes
        .into_values()
        .filter(|c| c.previous >= 0 && c.current >= 0 && c.previous != c.current)
        .collect();
    rating_changes.sort_by(|a, b| {
        (b.current - b.previous)
            .abs()
            .cmp(&(a.current - a.previous).abs())
            .then(a.album.cmp(&b.album))
    });
    rating_changes.truncate(10);
    let taste_drift = drift(&tx, end)?;
    Ok(ReviewReport {
        start_at: start,
        end_at: end,
        previous_start_at: request.previous_start_at,
        activity_since,
        current,
        previous,
        top_genres,
        rating_changes,
        taste_drift,
    })
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn review_report(
    app: tauri::AppHandle,
    request: ReviewRequest,
) -> Result<ReviewReport, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<ReviewReport> {
        crate::listening::ensure_links(&app)?;
        let (conn, _) = crate::db::open_read(&app)?;
        report(&conn, &request, Utc::now().timestamp())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn review_export_png(app: tauri::AppHandle, png: Vec<u8>) -> Result<String, String> {
    use tauri::Manager;
    tauri::async_runtime::spawn_blocking(move || -> Result<String> {
        if png.len() > 4_000_000 {
            bail!("The review card is too large.");
        }
        let decoder =
            image::ImageReader::with_format(std::io::Cursor::new(&png), image::ImageFormat::Png);
        let (width, height) = decoder.into_dimensions()?;
        if width > 2400 || height > 2400 || width == 0 || height == 0 {
            bail!("Invalid review card dimensions.");
        }
        let directory = app.path().app_data_dir()?.join("exports");
        std::fs::create_dir_all(&directory)?;
        let path = directory.join(format!(
            "music-review-{}.png",
            Utc::now().format("%Y%m%d-%H%M%S-%f")
        ));
        std::fs::write(&path, png)?;
        Ok(path.display().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))
}

#[cfg(test)]
mod tests;
