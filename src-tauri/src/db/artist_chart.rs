//! Artist rankings for the Charts page: which artists have the most albums, tracks,
//! five-star tracks, loved tracks, charted albums or tracks, fully rated albums,
//! or the highest average album score.
//!
//! Albums and tracks are filtered through the same `build_where_clause` the Albums
//! and Tracks charts use, so genre, year, country and artist-info filters mean the
//! same thing here. Albums are credited to their Album Artist; tracks are credited to
//! the track's own Artist (`display_artist`), since a single is by the performer even
//! on a compilation. Each side is aggregated per artist and joined afterwards.

use super::search::{build_where_clause, browse_from_clause, escape_like};
use super::*;
use serde::{Deserialize, Serialize};

pub(crate) const ARTIST_CHART_METRICS: [&str; 8] = [
    "albums",
    "tracks",
    "fiveStarTracks",
    "lovedTracks",
    "chartedAlbums",
    "chartedTracks",
    "completeAlbums",
    "averageAlbumScore",
];

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ArtistChartRequest {
    #[serde(default = "default_artist_chart_metric")]
    pub metric: String,
    #[serde(default = "default_artist_chart_direction")]
    #[specta(type = crate::wire_enums::BrowseSortDirection)]
    pub direction: String,
    #[serde(default)]
    pub search_text: String,
    /// Genre, year, country and artist-info filters shared with the album and track charts.
    #[serde(default)]
    pub filters: BrowseFilters,
    /// Years to leave out. Either bound may be empty for an open-ended exclusion.
    #[serde(default)]
    pub excluded_year_from: Option<i32>,
    #[serde(default)]
    pub excluded_year_to: Option<i32>,
    /// Chart sources that make an album "charted": billboard, officialUk, vgLista.
    #[serde(default = "default_album_chart_sources")]
    pub album_chart_sources: Vec<String>,
    /// Chart sources that make a track "charted": billboard, officialUk, vgLista,
    /// tiISkuddet, norsktoppen.
    #[serde(default = "default_single_chart_sources")]
    pub single_chart_sources: Vec<String>,
    #[serde(default)]
    pub min_albums: Option<i64>,
    /// Percent of an album's tracks that must be rated for the album to count as
    /// "rated" in the rated-albums measure (default 100).
    #[serde(default)]
    pub rated_threshold_percent: Option<f64>,
    /// Hide artists with fewer rated albums than this.
    #[serde(default)]
    pub min_complete_albums: Option<i64>,
    #[serde(default)]
    pub include_various_artists: bool,
    #[serde(default = "default_artist_chart_limit")]
    pub limit: u32,
    #[serde(default)]
    pub offset: u32,
}

impl Default for ArtistChartRequest {
    fn default() -> Self {
        Self {
            metric: default_artist_chart_metric(),
            direction: default_artist_chart_direction(),
            search_text: String::new(),
            filters: BrowseFilters::default(),
            excluded_year_from: None,
            excluded_year_to: None,
            album_chart_sources: default_album_chart_sources(),
            single_chart_sources: default_single_chart_sources(),
            min_albums: None,
            rated_threshold_percent: None,
            min_complete_albums: None,
            include_various_artists: false,
            limit: default_artist_chart_limit(),
            offset: 0,
        }
    }
}

fn default_artist_chart_metric() -> String {
    "albums".to_string()
}

fn default_artist_chart_direction() -> String {
    "desc".to_string()
}

fn default_artist_chart_limit() -> u32 {
    50
}

fn default_album_chart_sources() -> Vec<String> {
    ["billboard", "officialUk", "vgLista"]
        .map(String::from)
        .to_vec()
}

fn default_single_chart_sources() -> Vec<String> {
    [
        "billboard",
        "officialUk",
        "vgLista",
        "tiISkuddet",
        "norsktoppen",
    ]
    .map(String::from)
    .to_vec()
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ArtistChartRow {
    pub rank: i64,
    pub artist_key: String,
    pub artist_name: String,
    pub album_count: i64,
    pub track_count: i64,
    pub five_star_tracks: i64,
    pub loved_tracks: i64,
    pub charted_albums: i64,
    pub charted_tracks: i64,
    pub complete_albums: i64,
    pub average_album_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ArtistChartResponse {
    pub metric: String,
    pub rows: Vec<ArtistChartRow>,
    pub total: i64,
    pub limit: u32,
    pub offset: u32,
}

#[cfg(not(test))]
pub fn artist_chart_for_app(
    app: &AppHandle,
    request: ArtistChartRequest,
) -> Result<ArtistChartResponse> {
    let (conn, _) = open_read(app)?;
    artist_chart(&conn, request, 500)
}

pub(crate) fn artist_chart(
    conn: &Connection,
    request: ArtistChartRequest,
    max_limit: u32,
) -> Result<ArtistChartResponse> {
    let metric = request.metric.trim().to_string();
    let order_column = metric_column(&metric)
        .ok_or_else(|| anyhow!("Unknown artist chart ranking: {}", request.metric))?;
    let direction = if request.direction.eq_ignore_ascii_case("asc") {
        "ASC"
    } else {
        "DESC"
    };
    let limit = request.limit.clamp(1, max_limit);
    let offset = request.offset;

    let (album_where, mut album_values) =
        build_where_clause(false, "", &request.filters);
    let (track_where, track_values) = build_where_clause(true, "", &request.filters);
    let album_where = with_year_exclusion(
        album_where,
        &mut album_values,
        "a.year",
        request.excluded_year_from,
        request.excluded_year_to,
    );
    let mut track_values = track_values;
    let track_where = with_year_exclusion(
        track_where,
        &mut track_values,
        "t.year",
        request.excluded_year_from,
        request.excluded_year_to,
    );

    // Inlined (not bound) so the SELECT-list placeholder order stays unchanged; the
    // value is a clamped f64, never user text. The epsilon absorbs float rounding.
    let rated_threshold = request
        .rated_threshold_percent
        .filter(|value| value.is_finite())
        .unwrap_or(100.0)
        .clamp(1.0, 100.0)
        / 100.0
        - 1e-9;
    let album_key = catalog_artist_key_sql("a.album_artist_display");
    let track_artist = "COALESCE(NULLIF(TRIM(t.display_artist), ''), t.album_artist_display)";
    let track_key = artist_key_sql(track_artist);
    let album_charted = charted_sql(
        &request.album_chart_sources,
        &[
            ("billboard", "a.billboard_rank"),
            ("officialUk", "a.official_uk_rank"),
            ("vgLista", "a.vg_lista_rank"),
        ],
    );
    let track_charted = charted_sql(
        &request.single_chart_sources,
        &[
            ("billboard", "t.billboard_single_rank"),
            ("officialUk", "t.official_uk_rank"),
            ("vgLista", "t.vg_lista_rank"),
            ("tiISkuddet", "t.ti_i_skuddet_rank"),
            ("norsktoppen", "t.norsktoppen_rank"),
        ],
    );
    let album_from = browse_from_clause(false);
    // Same joins as the track browse query, but artist origin and info follow the
    // track's Artist so the artist-info filters judge the credited artist.
    let track_from = format!(
        "FROM tracks t LEFT JOIN albums a ON a.id = t.album_id LEFT JOIN album_covers c ON c.album_id = t.album_id LEFT JOIN musicbrainz_artist_origin_countries origin ON origin.local_artist_key = {track_key} LEFT JOIN musicbrainz_artist_infos info ON info.local_artist_key = {track_key} LEFT JOIN music_doctor_track_quality q ON q.file_path = t.file_path AND q.filename = t.filename LEFT JOIN music_doctor_album_quality aq ON aq.album_id = a.id"
    );

    let cte = format!(
        "
        WITH album_stats AS (
            SELECT
                {album_key} AS artist_key,
                COALESCE(MIN(NULLIF(TRIM(a.album_artist_display), '')), 'Unknown Artist') AS artist_name,
                COUNT(*) AS album_count,
                SUM(CASE WHEN a.rating_completeness >= {rated_threshold:.9} THEN 1 ELSE 0 END) AS complete_albums,
                SUM(CASE WHEN {album_charted} THEN 1 ELSE 0 END) AS charted_albums,
                AVG(a.album_score) AS average_album_score
            {album_from} {album_where}
            GROUP BY artist_key
        ),
        track_stats AS (
            SELECT
                {track_key} AS artist_key,
                COALESCE(MIN(NULLIF(TRIM({track_artist}), '')), 'Unknown Artist') AS artist_name,
                COUNT(*) AS track_count,
                SUM(CASE WHEN t.normalized_rating >= 100 THEN 1 ELSE 0 END) AS five_star_tracks,
                SUM(CASE WHEN t.love = 'L' THEN 1 ELSE 0 END) AS loved_tracks,
                SUM(CASE WHEN {track_charted} THEN 1 ELSE 0 END) AS charted_tracks
            {track_from} {track_where}
            GROUP BY artist_key
        ),
        combined AS (
            SELECT
                k.artist_key AS artist_key,
                COALESCE(al.artist_name, tr.artist_name) AS artist_name,
                COALESCE(al.album_count, 0) AS album_count,
                COALESCE(tr.track_count, 0) AS track_count,
                COALESCE(tr.five_star_tracks, 0) AS five_star_tracks,
                COALESCE(tr.loved_tracks, 0) AS loved_tracks,
                COALESCE(al.charted_albums, 0) AS charted_albums,
                COALESCE(tr.charted_tracks, 0) AS charted_tracks,
                COALESCE(al.complete_albums, 0) AS complete_albums,
                al.average_album_score AS average_album_score
            FROM (
                SELECT artist_key FROM album_stats
                UNION
                SELECT artist_key FROM track_stats
            ) k
            LEFT JOIN album_stats al ON al.artist_key = k.artist_key
            LEFT JOIN track_stats tr ON tr.artist_key = k.artist_key
        )"
    );

    let mut outer_conditions = Vec::new();
    let mut outer_values: Vec<Value> = Vec::new();
    let search = request.search_text.trim();
    if !search.is_empty() {
        outer_conditions.push("artist_name LIKE ? ESCAPE '\\'".to_string());
        outer_values.push(Value::Text(format!("%{}%", escape_like(search))));
    }
    if let Some(min_albums) = request.min_albums.filter(|value| *value > 0) {
        outer_conditions.push("album_count >= ?".to_string());
        outer_values.push(Value::Integer(min_albums));
    }
    if let Some(min_complete) = request.min_complete_albums.filter(|value| *value > 0) {
        outer_conditions.push("complete_albums >= ?".to_string());
        outer_values.push(Value::Integer(min_complete));
    }
    if !request.include_various_artists {
        outer_conditions.push(
            "LOWER(TRIM(artist_name)) NOT IN ('various artists', 'various', 'va', 'v.a.')"
                .to_string(),
        );
    }
    let outer_where = if outer_conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", outer_conditions.join(" AND "))
    };

    let mut count_values = album_values.clone();
    count_values.extend(track_values.iter().cloned());
    count_values.extend(outer_values.iter().cloned());
    let mut row_values = album_values;
    row_values.extend(track_values);
    row_values.extend(outer_values);
    row_values.push(Value::Integer(i64::from(limit)));
    row_values.push(Value::Integer(i64::from(offset)));
    let sql = format!(
        "{cte}
        SELECT
            artist_key, artist_name, album_count, track_count, five_star_tracks,
            loved_tracks, charted_albums, charted_tracks, complete_albums,
            average_album_score, COUNT(*) OVER () AS total_rows
        FROM combined {outer_where}
        ORDER BY ({order_column} IS NULL), {order_column} {direction},
            album_count DESC, track_count DESC, artist_name COLLATE NOCASE ASC
        LIMIT ? OFFSET ?"
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut position = i64::from(offset);
    // The window COUNT rides along with the page, so the aggregation runs once
    // instead of once for the page and again for the total.
    let mut total: Option<i64> = None;
    let rows = stmt
        .query_map(params_from_iter(row_values.iter()), |row| {
            position += 1;
            total = Some(row.get(10)?);
            Ok(ArtistChartRow {
                rank: position,
                artist_key: row.get(0)?,
                artist_name: row.get(1)?,
                album_count: row.get(2)?,
                track_count: row.get(3)?,
                five_star_tracks: row.get(4)?,
                loved_tracks: row.get(5)?,
                charted_albums: row.get(6)?,
                charted_tracks: row.get(7)?,
                complete_albums: row.get(8)?,
                average_album_score: row.get(9)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load artist chart results")?;

    // A page past the end has no rows to carry the total, so count separately.
    let total = match total {
        Some(total) => total,
        None if offset == 0 => 0,
        None => conn
            .query_row(
                &format!("{cte} SELECT COUNT(*) FROM combined {outer_where}"),
                params_from_iter(count_values.iter()),
                |row| row.get(0),
            )
            .context("Could not count artist chart results")?,
    };

    Ok(ArtistChartResponse {
        metric,
        rows,
        total,
        limit,
        offset,
    })
}

fn metric_column(metric: &str) -> Option<&'static str> {
    Some(match metric {
        "albums" => "album_count",
        "tracks" => "track_count",
        "fiveStarTracks" => "five_star_tracks",
        "lovedTracks" => "loved_tracks",
        "chartedAlbums" => "charted_albums",
        "chartedTracks" => "charted_tracks",
        "completeAlbums" => "complete_albums",
        "averageAlbumScore" => "average_album_score",
        _ => return None,
    })
}

/// SQL predicate that is true when any enabled source has a rank. No enabled source
/// means nothing counts as charted.
fn charted_sql(selected: &[String], sources: &[(&str, &str)]) -> String {
    let columns = sources
        .iter()
        .filter(|(name, _)| selected.iter().any(|item| item == name))
        .map(|(_, column)| format!("{column} IS NOT NULL"))
        .collect::<Vec<_>>();
    if columns.is_empty() {
        "0".to_string()
    } else {
        format!("({})", columns.join(" OR "))
    }
}

/// Appends "year is outside the excluded range" to a `build_where_clause` result.
/// Rows without a year are kept, since nothing places them inside the range.
fn with_year_exclusion(
    where_sql: String,
    values: &mut Vec<Value>,
    field: &str,
    from: Option<i32>,
    to: Option<i32>,
) -> String {
    let mut inside = Vec::new();
    if let Some(from) = from {
        inside.push(format!("{field} >= ?"));
        values.push(Value::Integer(i64::from(from)));
    }
    if let Some(to) = to {
        inside.push(format!("{field} <= ?"));
        values.push(Value::Integer(i64::from(to)));
    }
    if inside.is_empty() {
        return where_sql;
    }
    let condition = format!("NOT COALESCE(({}), 0)", inside.join(" AND "));
    if where_sql.is_empty() {
        format!("WHERE {condition}")
    } else {
        format!("{where_sql} AND {condition}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::*;

    /// Two artists with distinct album and track profiles on top of the seeded
    /// Pet Shop Boys album (1 album, 1 five-star loved track, no chart entries).
    fn artist_chart_connection() -> Connection {
        let conn = seeded_connection();
        insert_test_album(&conn, "a:1", "Alpha", "First", 1980, 3);
        insert_test_album(&conn, "a:2", "Alpha", "Second", 1990, 3);
        insert_test_album(&conn, "z:1", "Zulu", "Only", 2001, 3);
        conn.execute_batch(
            "UPDATE albums SET billboard_rank = 7 WHERE id = 'a:1';
             UPDATE albums SET vg_lista_rank = 3, rating_completeness = 0.5, album_score = 50 WHERE id = 'a:2';
             UPDATE albums SET genre_normalized = 'jazz', canonical_genre = 'Jazz', album_score = 300 WHERE id = 'z:1';",
        )
        .unwrap();
        for (album, artist, title, rating, love, norsktoppen) in [
            ("a:1", "Alpha", "A1", 100, "L", Some(4)),
            ("a:1", "Alpha", "A2", 100, "", None),
            ("a:2", "Alpha", "A3", 60, "L", None),
            ("z:1", "Zulu", "Z1", 100, "", Some(1)),
        ] {
            conn.execute(
                "INSERT INTO tracks (
                    import_run_id, album_id, album_unique_id, display_artist,
                    album_artist_display, album, title, canonical_genre, genre_normalized,
                    love, normalized_rating, year, release_year, time_seconds,
                    file_path, filename, row_hash, norsktoppen_rank
                ) SELECT 1, id, album_unique_id, ?2, ?2, album, ?3, canonical_genre,
                    genre_normalized, ?4, ?5, year, release_year, 200,
                    'D:\\Music', ?3 || '.mp3', ?3, ?6 FROM albums WHERE id = ?1",
                params![album, artist, title, love, rating, norsktoppen],
            )
            .unwrap();
        }
        conn
    }

    fn names(response: &ArtistChartResponse) -> Vec<&str> {
        response
            .rows
            .iter()
            .map(|row| row.artist_name.as_str())
            .collect()
    }

    fn request(metric: &str) -> ArtistChartRequest {
        ArtistChartRequest {
            metric: metric.to_string(),
            ..Default::default()
        }
    }

    fn row<'a>(response: &'a ArtistChartResponse, name: &str) -> &'a ArtistChartRow {
        response
            .rows
            .iter()
            .find(|row| row.artist_name == name)
            .unwrap_or_else(|| panic!("{name} missing from artist chart"))
    }

    #[test]
    fn ranks_artists_by_each_count_metric() {
        let conn = artist_chart_connection();
        let albums = artist_chart(&conn, request("albums"), 500).unwrap();
        assert_eq!(names(&albums)[0], "Alpha");
        assert_eq!(row(&albums, "Alpha").album_count, 2);
        assert_eq!(row(&albums, "Alpha").track_count, 3);
        assert_eq!(row(&albums, "Alpha").five_star_tracks, 2);
        assert_eq!(row(&albums, "Alpha").loved_tracks, 2);
        assert_eq!(row(&albums, "Alpha").complete_albums, 1);
        assert_eq!(albums.rows[0].rank, 1);

        let five_star = artist_chart(&conn, request("fiveStarTracks"), 500).unwrap();
        assert_eq!(names(&five_star)[0], "Alpha");
        let loved = artist_chart(&conn, request("lovedTracks"), 500).unwrap();
        assert_eq!(row(&loved, "Pet Shop Boys").loved_tracks, 1);
        assert_eq!(row(&loved, "Zulu").loved_tracks, 0);
    }

    #[test]
    fn charted_counts_follow_the_selected_sources() {
        let conn = artist_chart_connection();
        let defaults = artist_chart(&conn, request("chartedAlbums"), 500).unwrap();
        assert_eq!(row(&defaults, "Alpha").charted_albums, 2);
        assert_eq!(row(&defaults, "Alpha").charted_tracks, 1);
        assert_eq!(row(&defaults, "Zulu").charted_tracks, 1);

        let mut billboard_only = request("chartedAlbums");
        billboard_only.album_chart_sources = vec!["billboard".to_string()];
        billboard_only.single_chart_sources = vec!["vgLista".to_string()];
        let narrowed = artist_chart(&conn, billboard_only, 500).unwrap();
        assert_eq!(row(&narrowed, "Alpha").charted_albums, 1);
        assert_eq!(row(&narrowed, "Alpha").charted_tracks, 0);

        let mut none = request("chartedAlbums");
        none.album_chart_sources.clear();
        let nothing = artist_chart(&conn, none, 500).unwrap();
        assert_eq!(row(&nothing, "Alpha").charted_albums, 0);
    }

    #[test]
    fn average_album_score_ranks_by_mean_and_honours_minimum_albums() {
        let conn = artist_chart_connection();
        let ranked = artist_chart(&conn, request("averageAlbumScore"), 500).unwrap();
        assert_eq!(names(&ranked)[0], "Zulu");
        assert_eq!(row(&ranked, "Alpha").average_album_score, Some(75.0));

        let mut minimum = request("averageAlbumScore");
        minimum.min_albums = Some(2);
        let filtered = artist_chart(&conn, minimum, 500).unwrap();
        assert_eq!(names(&filtered), vec!["Alpha"]);
        assert_eq!(filtered.total, 1);
    }

    #[test]
    fn minimum_complete_albums_hides_artists_below_the_threshold() {
        let conn = artist_chart_connection();
        let mut any = request("completeAlbums");
        any.min_complete_albums = Some(1);
        let kept = artist_chart(&conn, any, 500).unwrap();
        assert!(kept.rows.iter().all(|row| row.complete_albums >= 1));
        assert_eq!(kept.total as usize, kept.rows.len());

        let mut impossible = request("completeAlbums");
        impossible.min_complete_albums = Some(1000);
        let none = artist_chart(&conn, impossible, 500).unwrap();
        assert!(none.rows.is_empty());
        assert_eq!(none.total, 0);
    }

    #[test]
    fn rated_threshold_changes_what_counts_as_a_rated_album() {
        let conn = artist_chart_connection();
        let strict = artist_chart(&conn, request("completeAlbums"), 500).unwrap();
        assert_eq!(row(&strict, "Alpha").complete_albums, 1);

        // Alpha's other album is 50% rated, so a 50% threshold counts both albums.
        let mut loose = request("completeAlbums");
        loose.rated_threshold_percent = Some(50.0);
        let loose = artist_chart(&conn, loose, 500).unwrap();
        assert_eq!(row(&loose, "Alpha").complete_albums, 2);

        let mut minimum = request("completeAlbums");
        minimum.rated_threshold_percent = Some(50.0);
        minimum.min_complete_albums = Some(2);
        let filtered = artist_chart(&conn, minimum, 500).unwrap();
        assert_eq!(names(&filtered), vec!["Alpha"]);
    }

    #[test]
    fn genre_and_year_filters_include_and_exclude() {
        let conn = artist_chart_connection();
        let mut jazz = request("albums");
        jazz.filters.genres = vec!["jazz".to_string()];
        assert_eq!(names(&artist_chart(&conn, jazz, 500).unwrap()), vec!["Zulu"]);

        let mut no_jazz = request("albums");
        no_jazz.filters.excluded_genres = vec!["jazz".to_string()];
        let without = artist_chart(&conn, no_jazz, 500).unwrap();
        assert!(!names(&without).contains(&"Zulu"));

        let mut year_range = request("albums");
        year_range.filters.year_from = Some(1985);
        year_range.filters.year_to = Some(1995);
        let included = artist_chart(&conn, year_range, 500).unwrap();
        assert_eq!(row(&included, "Alpha").album_count, 1);

        let mut excluded = request("albums");
        excluded.excluded_year_from = Some(1985);
        excluded.excluded_year_to = Some(1995);
        let outside = artist_chart(&conn, excluded, 500).unwrap();
        assert_eq!(row(&outside, "Alpha").album_count, 1);
        assert_eq!(row(&outside, "Alpha").track_count, 2);
    }

    #[test]
    fn searches_names_paginates_and_hides_various_artists() {
        let conn = artist_chart_connection();
        insert_test_album(&conn, "va:1", "Various Artists", "Hits", 1999, 3);
        let hidden = artist_chart(&conn, request("albums"), 500).unwrap();
        assert!(!names(&hidden).contains(&"Various Artists"));
        let mut shown = request("albums");
        shown.include_various_artists = true;
        assert!(names(&artist_chart(&conn, shown, 500).unwrap()).contains(&"Various Artists"));

        let mut search = request("albums");
        search.search_text = "alp".to_string();
        assert_eq!(names(&artist_chart(&conn, search, 500).unwrap()), vec!["Alpha"]);

        let mut page = request("albums");
        page.limit = 1;
        page.offset = 1;
        let second = artist_chart(&conn, page, 500).unwrap();
        assert_eq!(second.rows.len(), 1);
        assert_eq!(second.rows[0].rank, 2);
        assert_eq!(second.total, 3);
    }

    #[test]
    fn tracks_are_credited_to_their_artist_and_albums_to_the_album_artist() {
        let conn = artist_chart_connection();
        // A track on Alpha's album performed by Zulu counts for Zulu, not Alpha.
        conn.execute(
            "UPDATE tracks SET display_artist = 'Zulu' WHERE title = 'A3'",
            [],
        )
        .unwrap();
        let tracks = artist_chart(&conn, request("tracks"), 500).unwrap();
        assert_eq!(row(&tracks, "Alpha").track_count, 2);
        assert_eq!(row(&tracks, "Zulu").track_count, 2);
        assert_eq!(row(&tracks, "Zulu").loved_tracks, 1);
        assert_eq!(row(&tracks, "Alpha").album_count, 2);
        assert_eq!(row(&tracks, "Zulu").album_count, 1);
    }

    #[test]
    fn artist_info_filters_apply_and_unknown_metrics_are_rejected() {
        let conn = artist_chart_connection();
        insert_test_artist_info(&conn, "Alpha", "Person", Some("male"), Some(1950), None, false);
        let mut people = request("albums");
        people.filters.artist_type = "person".to_string();
        assert_eq!(names(&artist_chart(&conn, people, 500).unwrap()), vec!["Alpha"]);

        assert!(artist_chart(&conn, request("nonsense"), 500).is_err());
    }
}
