use crate::db;
use crate::models::{
    MusicMapArtist, MusicMapGenreStat, MusicMapLocationDetails, MusicMapPoint,
    MusicMapRefreshSummary, MusicMapResponse, MusicMapSummary,
};
use anyhow::{bail, Context, Result};
use chrono::Utc;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
#[cfg(not(test))]
use std::time::Duration;
#[cfg(not(test))]
use tauri::AppHandle;

#[cfg(not(test))]
const WIKIDATA_SPARQL_URL: &str = "https://query.wikidata.org/sparql";
#[cfg(not(test))]
const MAP_USER_AGENT: &str = "music-backup-v5/0.143.0 (local desktop app)";
const UNKNOWN_GENRE: &str = "Unknown";

#[derive(Debug, Clone)]
struct LocatedArtist {
    artist_key: String,
    name: String,
    album_count: i64,
    track_count: i64,
    loved_tracks: i64,
    genre_counts: HashMap<String, i64>,
    top_genre: String,
    country_code: Option<String>,
    country_name: Option<String>,
    country_location: Option<CachedLocation>,
    area_location: Option<CachedLocation>,
}

#[derive(Debug, Clone)]
struct CachedLocation {
    id: String,
    label: String,
    latitude: f64,
    longitude: f64,
}

#[derive(Default)]
struct ArtistAccumulator {
    name: String,
    album_count: i64,
    track_count: i64,
    loved_tracks: i64,
    genre_counts: HashMap<String, i64>,
    country_code: Option<String>,
    country_name: Option<String>,
    country_location: Option<CachedLocation>,
    area_location: Option<CachedLocation>,
}

#[derive(Default)]
struct PointAccumulator {
    name: String,
    country_code: Option<String>,
    country_name: Option<String>,
    precision: String,
    latitude: f64,
    longitude: f64,
    artist_count: i64,
    album_count: i64,
    track_count: i64,
    loved_tracks: i64,
    genre_counts: HashMap<String, i64>,
}

#[derive(Debug, Clone)]
struct ResolvedLocation {
    identifier: String,
    label: String,
    latitude: f64,
    longitude: f64,
    wikidata_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SparqlResponse {
    results: SparqlResults,
}

#[derive(Debug, Deserialize)]
struct SparqlResults {
    bindings: Vec<SparqlBinding>,
}

#[derive(Debug, Deserialize)]
struct SparqlBinding {
    #[serde(default)]
    mbid: Option<SparqlValue>,
    #[serde(default)]
    code: Option<SparqlValue>,
    #[serde(default, rename = "placeLabel")]
    place_label: Option<SparqlValue>,
    #[serde(default)]
    place: Option<SparqlValue>,
    #[serde(default)]
    coord: Option<SparqlValue>,
}

#[derive(Debug, Deserialize)]
struct SparqlValue {
    value: String,
}

#[cfg(not(test))]
pub fn music_map_for_app(app: &AppHandle) -> Result<MusicMapResponse> {
    let (conn, _) = db::open(app)?;
    music_map_for_connection(&conn)
}

#[cfg(not(test))]
pub fn music_map_location_details_for_app(
    app: &AppHandle,
    location_key: &str,
) -> Result<MusicMapLocationDetails> {
    let (conn, _) = db::open(app)?;
    music_map_location_details_for_connection(&conn, location_key)
}

#[cfg(not(test))]
pub fn refresh_music_map_locations_for_app(app: &AppHandle) -> Result<MusicMapRefreshSummary> {
    let (mut conn, _) = db::open(app)?;
    refresh_music_map_locations_for_connection(&mut conn)
}

pub fn music_map_for_connection(conn: &Connection) -> Result<MusicMapResponse> {
    db::ensure_musicbrainz_map_location_tables(conn)?;
    let artists = load_located_artists(conn)?;
    let mut country_accumulators = HashMap::<String, PointAccumulator>::new();
    let mut area_accumulators = HashMap::<String, PointAccumulator>::new();

    for artist in &artists {
        if let (Some(code), Some(location)) = (
            artist.country_code.as_deref(),
            artist.country_location.as_ref(),
        ) {
            add_artist_to_point(
                country_accumulators
                    .entry(location.id.clone())
                    .or_insert_with(|| PointAccumulator {
                        name: location.label.clone(),
                        country_code: Some(code.to_string()),
                        country_name: artist.country_name.clone(),
                        precision: "country".to_string(),
                        latitude: location.latitude,
                        longitude: location.longitude,
                        ..PointAccumulator::default()
                    }),
                artist,
            );
        }

        if let Some(location) = artist.area_location.as_ref() {
            add_artist_to_point(
                area_accumulators
                    .entry(location.id.clone())
                    .or_insert_with(|| PointAccumulator {
                        name: location.label.clone(),
                        country_code: artist.country_code.clone(),
                        country_name: artist.country_name.clone(),
                        precision: "area".to_string(),
                        latitude: location.latitude,
                        longitude: location.longitude,
                        ..PointAccumulator::default()
                    }),
                artist,
            );
        }
    }

    let countries = finish_points(country_accumulators);
    let areas = finish_points(area_accumulators);
    let total_artists = artists.len() as i64;
    let precise_artist_count = artists
        .iter()
        .filter(|artist| artist.area_location.is_some())
        .count() as i64;
    let country_fallback_artist_count = artists
        .iter()
        .filter(|artist| artist.area_location.is_none() && artist.country_location.is_some())
        .count() as i64;
    let mapped_artists = artists
        .iter()
        .filter(|artist| artist.area_location.is_some() || artist.country_location.is_some())
        .count() as i64;
    let candidate_area_count: i64 = conn.query_row(
        "SELECT COUNT(DISTINCT begin_area_mbid)
         FROM musicbrainz_artist_origin_countries
         WHERE NULLIF(TRIM(begin_area_mbid), '') IS NOT NULL",
        [],
        |row| row.get(0),
    )?;
    let candidate_country_count: i64 = conn.query_row(
        "SELECT COUNT(DISTINCT UPPER(country_code))
         FROM musicbrainz_artist_origin_countries
         WHERE NULLIF(TRIM(country_code), '') IS NOT NULL",
        [],
        |row| row.get(0),
    )?;
    let last_refreshed_at = conn
        .query_row(
            "SELECT MAX(fetched_at) FROM musicbrainz_map_locations",
            [],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()?
        .flatten();

    Ok(MusicMapResponse {
        summary: MusicMapSummary {
            total_artists,
            mapped_artists,
            precise_artist_count,
            country_fallback_artist_count,
            area_count: areas.len() as i64,
            country_count: countries.len() as i64,
            unresolved_artist_count: total_artists - mapped_artists,
            candidate_area_count,
            last_refreshed_at,
            needs_refresh: areas.len() as i64 != candidate_area_count
                || countries.len() as i64 != candidate_country_count,
        },
        countries,
        areas,
        generated_at: Utc::now().to_rfc3339(),
    })
}

pub fn music_map_location_details_for_connection(
    conn: &Connection,
    location_key: &str,
) -> Result<MusicMapLocationDetails> {
    db::ensure_musicbrainz_map_location_tables(conn)?;
    let mut matching = load_located_artists_for_location(conn, location_key)?;
    let sample = matching
        .first()
        .with_context(|| format!("Music map location {location_key} was not found"))?;
    let (location, precision) = if location_key.starts_with("area:") {
        (
            sample
                .area_location
                .as_ref()
                .with_context(|| format!("Music map area {location_key} was not found"))?,
            "area",
        )
    } else {
        (
            sample
                .country_location
                .as_ref()
                .with_context(|| format!("Music map country {location_key} was not found"))?,
            "country",
        )
    };
    let mut point_accumulator = PointAccumulator {
        name: location.label.clone(),
        country_code: sample.country_code.clone(),
        country_name: sample.country_name.clone(),
        precision: precision.to_string(),
        latitude: location.latitude,
        longitude: location.longitude,
        ..PointAccumulator::default()
    };
    for artist in &matching {
        add_artist_to_point(&mut point_accumulator, artist);
    }
    let point = finish_point(location_key.to_string(), point_accumulator);

    let mut genre_counts = HashMap::<String, (i64, HashSet<String>)>::new();
    for artist in &matching {
        for (genre, count) in &artist.genre_counts {
            let entry = genre_counts
                .entry(genre.clone())
                .or_insert_with(|| (0, HashSet::new()));
            entry.0 += count;
            entry.1.insert(artist.artist_key.clone());
        }
    }
    let total_albums = matching
        .iter()
        .map(|artist| artist.album_count)
        .sum::<i64>()
        .max(1);
    let artist_keys = matching
        .iter()
        .map(|artist| artist.artist_key.clone())
        .collect::<Vec<_>>();
    let mut genres = genre_counts
        .into_iter()
        .map(|(genre, (album_count, artist_keys))| MusicMapGenreStat {
            genre,
            album_count,
            artist_count: artist_keys.len() as i64,
            percentage: album_count as f64 * 100.0 / total_albums as f64,
        })
        .collect::<Vec<_>>();
    genres.sort_by(|left, right| {
        right
            .album_count
            .cmp(&left.album_count)
            .then_with(|| left.genre.cmp(&right.genre))
    });

    matching.sort_by(|left, right| {
        right
            .loved_tracks
            .cmp(&left.loved_tracks)
            .then_with(|| right.album_count.cmp(&left.album_count))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    matching.truncate(24);

    let artist_rows = matching
        .into_iter()
        .map(|artist| {
            let representative = representative_album(conn, &artist.artist_key)?;
            Ok(MusicMapArtist {
                artist_key: artist.artist_key,
                name: artist.name,
                album_count: artist.album_count,
                track_count: artist.track_count,
                loved_tracks: artist.loved_tracks,
                top_genre: artist.top_genre,
                representative_album_id: representative.as_ref().map(|value| value.0.clone()),
                representative_album_title: representative.as_ref().map(|value| value.1.clone()),
                cover_path: representative.and_then(|value| value.2),
            })
        })
        .collect::<Result<Vec<_>>>()?;

    Ok(MusicMapLocationDetails {
        point,
        genres,
        artists: artist_rows,
        artist_keys,
    })
}

fn load_located_artists(conn: &Connection) -> Result<Vec<LocatedArtist>> {
    load_located_artists_with_filter(conn, None)
}

fn load_located_artists_for_location(
    conn: &Connection,
    location_key: &str,
) -> Result<Vec<LocatedArtist>> {
    load_located_artists_with_filter(conn, Some(location_key))
}

fn load_located_artists_with_filter(
    conn: &Connection,
    location_key: Option<&str>,
) -> Result<Vec<LocatedArtist>> {
    let artist_key = db::artist_key_sql("a.album_artist_display");
    let location_filter = match location_key {
        None => "",
        Some(key) if key.starts_with("area:") => "WHERE area_location.location_key = ?1",
        Some(key) if key.starts_with("country:") => "WHERE country_location.location_key = ?1",
        Some(key) => bail!("Unknown music map location key: {key}"),
    };
    let sql = format!(
        "
        SELECT
            {artist_key} AS artist_key,
            MAX(COALESCE(NULLIF(TRIM(a.album_artist_display), ''), 'Unknown artist')),
            COALESCE(NULLIF(TRIM(a.canonical_genre), ''), '{UNKNOWN_GENRE}'),
            COUNT(*),
            SUM(COALESCE(a.total_tracks, 0)),
            SUM(COALESCE(a.loved_tracks, 0)),
            UPPER(origin.country_code),
            origin.country_name,
            country_location.location_key,
            country_location.label,
            country_location.latitude,
            country_location.longitude,
            area_location.location_key,
            area_location.label,
            area_location.latitude,
            area_location.longitude
        FROM albums a
        LEFT JOIN musicbrainz_artist_origin_countries origin
          ON origin.local_artist_key = {artist_key}
        LEFT JOIN musicbrainz_map_locations country_location
          ON country_location.location_key = 'country:' || UPPER(origin.country_code)
         AND country_location.resolution_status = 'resolved'
        LEFT JOIN musicbrainz_map_locations area_location
          ON area_location.location_key = 'area:' || origin.begin_area_mbid
         AND area_location.resolution_status = 'resolved'
        {location_filter}
        GROUP BY
            {artist_key},
            COALESCE(NULLIF(TRIM(a.canonical_genre), ''), '{UNKNOWN_GENRE}')
        ORDER BY artist_key
        "
    );
    let mut statement = conn.prepare(&sql)?;
    let rows = statement
        .query_map(params_from_iter(location_key), |row| {
            let country_id = row.get::<_, Option<String>>(8)?;
            let area_id = row.get::<_, Option<String>>(12)?;
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<String>>(7)?,
                country_id.map(|id| CachedLocation {
                    id,
                    label: row.get::<_, String>(9).unwrap_or_default(),
                    latitude: row.get::<_, f64>(10).unwrap_or_default(),
                    longitude: row.get::<_, f64>(11).unwrap_or_default(),
                }),
                area_id.map(|id| CachedLocation {
                    id,
                    label: row.get::<_, String>(13).unwrap_or_default(),
                    latitude: row.get::<_, f64>(14).unwrap_or_default(),
                    longitude: row.get::<_, f64>(15).unwrap_or_default(),
                }),
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut grouped = HashMap::<String, ArtistAccumulator>::new();
    for (
        key,
        name,
        genre,
        album_count,
        track_count,
        loved_tracks,
        country_code,
        country_name,
        country_location,
        area_location,
    ) in rows
    {
        let artist = grouped.entry(key).or_default();
        artist.name = name;
        artist.album_count += album_count;
        artist.track_count += track_count;
        artist.loved_tracks += loved_tracks;
        artist.genre_counts.insert(genre, album_count);
        artist.country_code = country_code;
        artist.country_name = country_name;
        artist.country_location = country_location;
        artist.area_location = area_location;
    }

    let mut artists = grouped
        .into_iter()
        .map(|(artist_key, artist)| {
            let top_genre = dominant_genre(&artist.genre_counts);
            LocatedArtist {
                artist_key,
                name: artist.name,
                album_count: artist.album_count,
                track_count: artist.track_count,
                loved_tracks: artist.loved_tracks,
                genre_counts: artist.genre_counts,
                top_genre,
                country_code: artist.country_code,
                country_name: artist.country_name,
                country_location: artist.country_location,
                area_location: artist.area_location,
            }
        })
        .collect::<Vec<_>>();
    artists.sort_by(|left, right| left.artist_key.cmp(&right.artist_key));
    Ok(artists)
}

fn add_artist_to_point(point: &mut PointAccumulator, artist: &LocatedArtist) {
    point.artist_count += 1;
    point.album_count += artist.album_count;
    point.track_count += artist.track_count;
    point.loved_tracks += artist.loved_tracks;
    for (genre, count) in &artist.genre_counts {
        *point.genre_counts.entry(genre.clone()).or_default() += count;
    }
}

fn finish_points(points: HashMap<String, PointAccumulator>) -> Vec<MusicMapPoint> {
    let mut values = points
        .into_iter()
        .map(|(id, point)| finish_point(id, point))
        .collect::<Vec<_>>();
    values.sort_by(|left, right| {
        right
            .artist_count
            .cmp(&left.artist_count)
            .then_with(|| left.name.cmp(&right.name))
    });
    values
}

fn finish_point(id: String, point: PointAccumulator) -> MusicMapPoint {
    MusicMapPoint {
        id,
        name: point.name,
        country_code: point.country_code,
        country_name: point.country_name,
        precision: point.precision,
        latitude: point.latitude,
        longitude: point.longitude,
        artist_count: point.artist_count,
        album_count: point.album_count,
        track_count: point.track_count,
        loved_tracks: point.loved_tracks,
        top_genre: dominant_genre(&point.genre_counts),
    }
}

fn dominant_genre(counts: &HashMap<String, i64>) -> String {
    counts
        .iter()
        .max_by(|(left_genre, left_count), (right_genre, right_count)| {
            left_count
                .cmp(right_count)
                .then_with(|| right_genre.cmp(left_genre))
        })
        .map(|(genre, _)| genre.clone())
        .unwrap_or_else(|| UNKNOWN_GENRE.to_string())
}

fn representative_album(
    conn: &Connection,
    artist_key: &str,
) -> Result<Option<(String, String, Option<String>)>> {
    let key_sql = db::artist_key_sql("a.album_artist_display");
    conn.query_row(
        &format!(
            "
            SELECT a.id, COALESCE(NULLIF(TRIM(a.album), ''), 'Untitled album'), c.cache_path
            FROM albums a
            LEFT JOIN album_covers c ON c.album_id = a.id
            WHERE {key_sql} = ?1
            ORDER BY
                CASE WHEN c.cache_path IS NULL THEN 1 ELSE 0 END,
                COALESCE(a.loved_tracks, 0) DESC,
                COALESCE(a.album_score, -1) DESC,
                LOWER(COALESCE(a.album, ''))
            LIMIT 1
            "
        ),
        [artist_key],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .optional()
    .context("Could not load a representative album for the music map")
}

#[cfg(not(test))]
fn refresh_music_map_locations_for_connection(
    conn: &mut Connection,
) -> Result<MusicMapRefreshSummary> {
    db::ensure_musicbrainz_map_location_tables(conn)?;
    let areas = load_area_candidates(conn)?;
    let countries = load_country_candidates(conn)?;
    let resolved_areas = fetch_wikidata_locations("area", &areas)?;
    let resolved_countries = fetch_wikidata_locations("country", &countries)?;
    save_resolved_locations(
        conn,
        &areas,
        &countries,
        &resolved_areas,
        &resolved_countries,
    )
}

fn load_area_candidates(conn: &Connection) -> Result<Vec<(String, String)>> {
    let mut statement = conn.prepare(
        "
        SELECT begin_area_mbid, MAX(COALESCE(NULLIF(TRIM(begin_area_name), ''), begin_area_mbid))
        FROM musicbrainz_artist_origin_countries
        WHERE NULLIF(TRIM(begin_area_mbid), '') IS NOT NULL
        GROUP BY begin_area_mbid
        ORDER BY begin_area_mbid
        ",
    )?;
    let candidates = statement
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load MusicBrainz area candidates")?;
    Ok(candidates)
}

fn load_country_candidates(conn: &Connection) -> Result<Vec<(String, String)>> {
    let mut statement = conn.prepare(
        "
        SELECT UPPER(country_code), MAX(COALESCE(NULLIF(TRIM(country_name), ''), UPPER(country_code)))
        FROM musicbrainz_artist_origin_countries
        WHERE NULLIF(TRIM(country_code), '') IS NOT NULL
        GROUP BY UPPER(country_code)
        ORDER BY UPPER(country_code)
        ",
    )?;
    let candidates = statement
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load country candidates")?;
    Ok(candidates)
}

#[cfg(not(test))]
fn fetch_wikidata_locations(
    precision: &str,
    candidates: &[(String, String)],
) -> Result<HashMap<String, ResolvedLocation>> {
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(45))
        .build();
    let mut resolved = HashMap::new();
    for batch in candidates.chunks(150) {
        let values = batch
            .iter()
            .map(|(identifier, _)| format!("\"{}\"", identifier.replace('"', "\\\"")))
            .collect::<Vec<_>>()
            .join(" ");
        let (variable, property) = if precision == "area" {
            ("mbid", "P982")
        } else {
            ("code", "P297")
        };
        let query = format!(
            "
            SELECT ?{variable} ?place ?placeLabel ?coord WHERE {{
              VALUES ?{variable} {{ {values} }}
              ?place wdt:{property} ?{variable};
                     wdt:P625 ?coord.
              SERVICE wikibase:label {{ bd:serviceParam wikibase:language \"en\". }}
            }}
            "
        );
        let response = agent
            .post(WIKIDATA_SPARQL_URL)
            .set("Accept", "application/sparql-results+json")
            .set("User-Agent", MAP_USER_AGENT)
            .send_form(&[("query", query.as_str()), ("format", "json")])
            .context("Could not resolve MusicBrainz map locations with Wikidata")?
            .into_json::<SparqlResponse>()
            .context("Could not parse Wikidata map locations")?;
        for binding in response.results.bindings {
            if let Some(location) = location_from_binding(binding, precision) {
                resolved
                    .entry(location.identifier.clone())
                    .or_insert(location);
            }
        }
    }
    Ok(resolved)
}

fn location_from_binding(binding: SparqlBinding, precision: &str) -> Option<ResolvedLocation> {
    let identifier = if precision == "area" {
        binding.mbid?.value
    } else {
        binding.code?.value.to_uppercase()
    };
    let (longitude, latitude) = parse_wikidata_point(&binding.coord?.value)?;
    let wikidata_id = binding
        .place
        .as_ref()
        .and_then(|value| value.value.rsplit('/').next())
        .map(str::to_string);
    Some(ResolvedLocation {
        identifier,
        label: binding
            .place_label
            .map(|value| value.value)
            .unwrap_or_default(),
        latitude,
        longitude,
        wikidata_id,
    })
}

fn parse_wikidata_point(value: &str) -> Option<(f64, f64)> {
    let coordinates = value.strip_prefix("Point(")?.strip_suffix(')')?;
    let mut parts = coordinates.split_whitespace();
    let longitude = parts.next()?.parse::<f64>().ok()?;
    let latitude = parts.next()?.parse::<f64>().ok()?;
    Some((longitude, latitude))
}

fn save_resolved_locations(
    conn: &mut Connection,
    areas: &[(String, String)],
    countries: &[(String, String)],
    resolved_areas: &HashMap<String, ResolvedLocation>,
    resolved_countries: &HashMap<String, ResolvedLocation>,
) -> Result<MusicMapRefreshSummary> {
    let fetched_at = Utc::now().to_rfc3339();
    let transaction = conn.transaction()?;
    for (precision, candidates, resolved) in [
        ("area", areas, resolved_areas),
        ("country", countries, resolved_countries),
    ] {
        for (identifier, candidate_label) in candidates {
            let location = resolved.get(identifier);
            let key = format!("{precision}:{identifier}");
            let label = location
                .map(|value| value.label.as_str())
                .filter(|value| !value.is_empty())
                .unwrap_or(candidate_label);
            transaction.execute(
                "
                INSERT INTO musicbrainz_map_locations (
                    location_key, area_mbid, country_code, label, latitude, longitude,
                    precision, resolution_status, source, wikidata_id, fetched_at, updated_at
                ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'wikidata', ?9, ?10, ?10
                )
                ON CONFLICT(location_key) DO UPDATE SET
                    label = excluded.label,
                    latitude = COALESCE(excluded.latitude, musicbrainz_map_locations.latitude),
                    longitude = COALESCE(excluded.longitude, musicbrainz_map_locations.longitude),
                    resolution_status = CASE
                        WHEN excluded.resolution_status = 'resolved' THEN 'resolved'
                        ELSE musicbrainz_map_locations.resolution_status
                    END,
                    wikidata_id = COALESCE(excluded.wikidata_id, musicbrainz_map_locations.wikidata_id),
                    fetched_at = excluded.fetched_at,
                    updated_at = excluded.updated_at
                ",
                params![
                    key,
                    (precision == "area").then_some(identifier.as_str()),
                    (precision == "country").then_some(identifier.as_str()),
                    label,
                    location.map(|value| value.latitude),
                    location.map(|value| value.longitude),
                    precision,
                    if location.is_some() {
                        "resolved"
                    } else {
                        "unresolved"
                    },
                    location.and_then(|value| value.wikidata_id.as_deref()),
                    fetched_at,
                ],
            )?;
        }
    }
    transaction.commit()?;
    Ok(MusicMapRefreshSummary {
        candidate_areas: areas.len(),
        resolved_areas: resolved_areas.len(),
        candidate_countries: countries.len(),
        resolved_countries: resolved_countries.len(),
        unresolved_locations: areas.len() + countries.len()
            - resolved_areas.len()
            - resolved_countries.len(),
        fetched_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn insert_album(
        conn: &Connection,
        id: &str,
        artist: &str,
        genre: &str,
        tracks: i64,
        loved: i64,
    ) {
        conn.execute(
            "
            INSERT INTO albums (
                id, import_run_id, album, album_artist_display, canonical_genre,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio
            ) VALUES (?1, 1, ?2, ?3, ?4, ?5, 0, 0, 0, ?6, 0, 0)
            ",
            params![id, id, artist, genre, tracks, loved],
        )
        .unwrap();
    }

    fn test_connection() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        db::configure(&conn).unwrap();
        db::migrate(&conn).unwrap();
        conn.execute(
            "
            INSERT INTO import_runs (id, source_path, started_at, status)
            VALUES (1, 'test.tsv', '2026-07-25T00:00:00Z', 'completed')
            ",
            [],
        )
        .unwrap();
        conn
    }

    fn insert_origin(
        conn: &Connection,
        artist_key: &str,
        display_artist: &str,
        country_code: &str,
        country_name: &str,
        area_mbid: Option<&str>,
        area_name: Option<&str>,
    ) {
        conn.execute(
            "
            INSERT OR IGNORE INTO musicbrainz_origin_countries (
                country_code, country_name, created_at, updated_at
            ) VALUES (?1, ?2, '2026-07-25T00:00:00Z', '2026-07-25T00:00:00Z')
            ",
            params![country_code, country_name],
        )
        .unwrap();
        conn.execute(
            "
            INSERT INTO musicbrainz_artist_origin_countries (
                local_artist_key, display_artist, mbid, country_code, country_name,
                begin_area_mbid, begin_area_name, derived_from, review_state, source,
                created_at, updated_at
            ) VALUES (
                ?1, ?2, ?1 || '-mbid', ?3, ?4, ?5, ?6, 'begin-area',
                'imported', 'musicbrainz-live', '2026-07-25T00:00:00Z',
                '2026-07-25T00:00:00Z'
            )
            ",
            params![
                artist_key,
                display_artist,
                country_code,
                country_name,
                area_mbid,
                area_name
            ],
        )
        .unwrap();
    }

    fn insert_location(
        conn: &Connection,
        key: &str,
        identifier: &str,
        label: &str,
        precision: &str,
        latitude: f64,
        longitude: f64,
    ) {
        conn.execute(
            "
            INSERT INTO musicbrainz_map_locations (
                location_key, area_mbid, country_code, label, latitude, longitude,
                precision, resolution_status, fetched_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'resolved', '2026-07-25', '2026-07-25')
            ",
            params![
                key,
                (precision == "area").then_some(identifier),
                (precision == "country").then_some(identifier),
                label,
                latitude,
                longitude,
                precision
            ],
        )
        .unwrap();
    }

    #[test]
    fn country_rollup_keeps_country_only_artists_and_area_rollup_stays_precise() {
        let conn = test_connection();
        insert_album(&conn, "a1", "A-ha", "Synthpop", 10, 4);
        insert_album(&conn, "a2", "A-ha", "Synthpop", 8, 2);
        insert_album(&conn, "b1", "Biosphere", "Ambient", 12, 1);
        insert_origin(
            &conn,
            "a-ha",
            "A-ha",
            "NO",
            "Norway",
            Some("oslo-mbid"),
            Some("Oslo"),
        );
        insert_origin(&conn, "biosphere", "Biosphere", "NO", "Norway", None, None);
        insert_location(&conn, "country:NO", "NO", "Norway", "country", 61.0, 8.0);
        insert_location(
            &conn,
            "area:oslo-mbid",
            "oslo-mbid",
            "Oslo",
            "area",
            59.91,
            10.75,
        );

        let map = music_map_for_connection(&conn).unwrap();
        assert_eq!(map.countries[0].artist_count, 2);
        assert_eq!(map.countries[0].album_count, 3);
        assert_eq!(map.countries[0].top_genre, "Synthpop");
        assert_eq!(map.areas[0].artist_count, 1);
        assert_eq!(map.areas[0].name, "Oslo");
        assert_eq!(map.summary.precise_artist_count, 1);
        assert_eq!(map.summary.country_fallback_artist_count, 1);
    }

    #[test]
    fn location_details_include_genres_and_representative_artists() {
        let conn = test_connection();
        insert_album(&conn, "a1", "A-ha", "Synthpop", 10, 4);
        insert_origin(
            &conn,
            "a-ha",
            "A-ha",
            "NO",
            "Norway",
            Some("oslo-mbid"),
            Some("Oslo"),
        );
        insert_location(&conn, "country:NO", "NO", "Norway", "country", 61.0, 8.0);
        insert_location(
            &conn,
            "area:oslo-mbid",
            "oslo-mbid",
            "Oslo",
            "area",
            59.91,
            10.75,
        );

        let details = music_map_location_details_for_connection(&conn, "area:oslo-mbid").unwrap();
        assert_eq!(details.genres[0].genre, "Synthpop");
        assert_eq!(details.artists[0].name, "A-ha");
        assert_eq!(details.artist_keys, vec!["a-ha"]);
        assert_eq!(
            details.artists[0].representative_album_id.as_deref(),
            Some("a1")
        );
    }

    #[test]
    fn location_details_rank_before_limiting_representative_artists() {
        let conn = test_connection();
        insert_location(
            &conn,
            "country:GB",
            "GB",
            "United Kingdom",
            "country",
            54.0,
            -2.0,
        );
        insert_location(
            &conn,
            "area:london-mbid",
            "london-mbid",
            "London",
            "area",
            51.5072,
            -0.1276,
        );
        for index in 0..30 {
            let artist = format!("London Artist {index:02}");
            let album_id = format!("london-album-{index:02}");
            let artist_key = format!("london artist {index:02}");
            insert_album(&conn, &album_id, &artist, "Rock", 10, index);
            insert_origin(
                &conn,
                &artist_key,
                &artist,
                "GB",
                "United Kingdom",
                Some("london-mbid"),
                Some("London"),
            );
        }

        let details = music_map_location_details_for_connection(&conn, "area:london-mbid").unwrap();
        assert_eq!(details.point.artist_count, 30);
        assert_eq!(details.artists.len(), 24);
        assert_eq!(details.artist_keys.len(), 30);
        assert_eq!(details.artists[0].name, "London Artist 29");
        assert_eq!(details.artists[23].name, "London Artist 06");
    }

    #[test]
    fn parses_wikidata_coordinates() {
        assert_eq!(
            parse_wikidata_point("Point(10.7522 59.9139)"),
            Some((10.7522, 59.9139))
        );
        assert_eq!(parse_wikidata_point("not-a-point"), None);
    }

    #[test]
    fn unresolved_refresh_does_not_erase_existing_coordinates() {
        let mut conn = test_connection();
        insert_location(&conn, "country:NO", "NO", "Norway", "country", 61.0, 8.0);
        let countries = vec![("NO".to_string(), "Norway".to_string())];
        let result =
            save_resolved_locations(&mut conn, &[], &countries, &HashMap::new(), &HashMap::new())
                .unwrap();
        let coordinates: (Option<f64>, Option<f64>, String) = conn
            .query_row(
                "SELECT latitude, longitude, resolution_status
                 FROM musicbrainz_map_locations WHERE location_key = 'country:NO'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(coordinates, (Some(61.0), Some(8.0), "resolved".to_string()));
        assert_eq!(result.unresolved_locations, 1);
    }
}
