//! Which library tracks reached each Published Charts series (Mainstream Rock Tracks,
//! Modern Rock Tracks, Adult Contemporary, ...), for the Artists chart's "charted
//! tracks" measure.
//!
//! The Published Charts collection is far larger than the Billboard, UK and Norwegian
//! sources stored as rank columns on `tracks`, and matching a library track to a chart
//! row is fuzzy. So tracks are matched once with the same song matcher the artist
//! Chart Busters use, and the result is cached in memory until the library or the
//! published charts change. Nothing is written to the catalog.

use super::chart_imports::{billboard_single_artist_key_variants, billboard_single_title_key_variants};
use super::chart_reconcile::{
    build_track_song_index, chart_parenthetical_key, load_track_chart_reconciliation_rows,
};
use super::*;
use std::collections::{BTreeSet, HashMap, HashSet};
use std::sync::{Arc, Mutex, OnceLock};

/// Track ids per published chart name.
pub(super) type PublishedChartHits = HashMap<String, HashSet<i64>>;

type Signature = (i64, i64, i64, i64);

static CACHE: OnceLock<Mutex<Option<(Signature, Arc<PublishedChartHits>)>>> = OnceLock::new();

fn signature(conn: &Connection) -> Result<Signature> {
    let entries: (i64, i64) = conn.query_row(
        "SELECT COUNT(*), COALESCE(MAX(id), 0) FROM published_chart_entries",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let tracks: (i64, i64) = conn.query_row(
        "SELECT COUNT(*), COALESCE(MAX(id), 0) FROM tracks",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    Ok((entries.0, entries.1, tracks.0, tracks.1))
}

fn published_tables_exist(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('published_chart_entries', 'published_chart_books')",
        [],
        |row| row.get::<_, i64>(0),
    )
    .map(|count| count == 2)
    .unwrap_or(false)
}

/// Cached track ids per published chart, rebuilt when the library or the published
/// charts changed since the last build.
pub(super) fn published_chart_hits(conn: &Connection) -> Result<Arc<PublishedChartHits>> {
    if !published_tables_exist(conn) {
        return Ok(Arc::new(HashMap::new()));
    }
    // Tests open many unrelated in-memory catalogs in one process, so they never share the cache.
    #[cfg(test)]
    {
        return Ok(Arc::new(build_published_chart_hits(conn)?));
    }
    #[cfg(not(test))]
    cached_or_built(conn)
}

#[cfg(not(test))]
fn cached_or_built(conn: &Connection) -> Result<Arc<PublishedChartHits>> {
    let current = signature(conn)?;
    let cache = CACHE.get_or_init(Default::default);
    if let Some((cached, hits)) = cache.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
        if *cached == current {
            return Ok(hits.clone());
        }
    }
    let hits = Arc::new(build_published_chart_hits(conn)?);
    *cache.lock().unwrap_or_else(|e| e.into_inner()) = Some((current, hits.clone()));
    Ok(hits)
}

pub(super) fn build_published_chart_hits(conn: &Connection) -> Result<PublishedChartHits> {
    let tracks = load_track_chart_reconciliation_rows(conn)?;
    let index = build_track_song_index(&tracks);
    let mut statement = conn.prepare(
        "SELECT b.chart, e.artist, e.title
         FROM published_chart_entries e
         JOIN published_chart_books b ON b.id = e.book_id
         WHERE e.position > 0
         GROUP BY b.chart, e.artist, e.title",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    let mut hits = PublishedChartHits::new();
    for row in rows {
        let (chart, artist, title) = row?;
        let artist_key = crate::identity::loose_key(&artist);
        let title_key = crate::identity::loose_key(&title);
        if artist_key.is_empty() || title_key.is_empty() {
            continue;
        }
        let matched = index.resolve(
            &billboard_single_artist_key_variants(&artist_key),
            &crate::identity::credit_keys(&artist),
            &title_key,
            &billboard_single_title_key_variants(&title_key),
            chart_parenthetical_key(&title).as_deref(),
        );
        if matched.is_empty() {
            continue;
        }
        let ids = hits.entry(chart).or_default();
        ids.extend(matched.into_iter().map(|track| tracks[track].track_id));
    }
    Ok(hits)
}

/// The track ids that reached any of the named charts, as a JSON array for `json_each`.
pub(super) fn track_ids_json(hits: &PublishedChartHits, charts: &[String]) -> Option<String> {
    let selected: BTreeSet<&String> = charts.iter().collect();
    let mut ids = BTreeSet::<i64>::new();
    for chart in selected {
        if let Some(chart_ids) = hits.get(chart) {
            ids.extend(chart_ids.iter().copied());
        }
    }
    if ids.is_empty() {
        return None;
    }
    let body = ids
        .iter()
        .map(i64::to_string)
        .collect::<Vec<_>>()
        .join(",");
    Some(format!("[{body}]"))
}
