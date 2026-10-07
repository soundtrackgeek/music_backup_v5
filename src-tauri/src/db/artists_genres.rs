use super::*;

pub(super) fn chart_history_priority(chart: &str) -> usize {
    match chart {
        "billboard" => 0,
        "officialUk" => 1,
        "vgLista" => 2,
        "tiISkuddet" => 3,
        "norsktoppen" => 4,
        _ => usize::MAX,
    }
}

pub(super) fn earlier_optional_date(left: Option<String>, right: Option<String>) -> Option<String> {
    match (left, right) {
        (Some(left), Some(right)) => Some(left.min(right)),
        (Some(value), None) | (None, Some(value)) => Some(value),
        (None, None) => None,
    }
}

pub(super) fn later_optional_date(left: Option<String>, right: Option<String>) -> Option<String> {
    match (left, right) {
        (Some(left), Some(right)) => Some(left.max(right)),
        (Some(value), None) | (None, Some(value)) => Some(value),
        (None, None) => None,
    }
}

pub(super) fn merge_artist_chart_history(
    histories: &mut Vec<ArtistTrackChartHistory>,
    next: ArtistTrackChartHistory,
) {
    if let Some(existing) = histories
        .iter_mut()
        .find(|history| history.chart == next.chart)
    {
        existing.entry_date = earlier_optional_date(existing.entry_date.take(), next.entry_date);
        existing.end_date = later_optional_date(existing.end_date.take(), next.end_date);
        existing.weeks_on_chart = match (existing.weeks_on_chart, next.weeks_on_chart) {
            (Some(left), Some(right)) => Some(left + right),
            (Some(value), None) | (None, Some(value)) => Some(value),
            (None, None) => None,
        };
        existing.peak = existing.peak.min(next.peak);
        return;
    }

    histories.push(next);
}

// Match complete artist/song identities using the established singles aliases.
// Only matching printed credits need weekly row reads, using the artist index.
pub(super) fn append_published_artist_histories(
    conn: &Connection,
    artist_id: &str,
    chart_tracks: &mut Vec<ArtistChartTrack>,
) -> Result<()> {
    let artist_key = artist_key_sql("COALESCE(t.album_artist_display, a.album_artist_display)");
    let mut stmt = conn.prepare(&format!(
        "SELECT t.id, t.title, COALESCE(NULLIF(TRIM(t.display_artist), ''), t.album_artist_display, a.album_artist_display),
                COALESCE(t.album, a.album), COALESCE(t.release_year, t.year, a.release_year, a.year)
         FROM tracks t LEFT JOIN albums a ON a.id = t.album_id
         WHERE {artist_key} = ?1 AND NULLIF(TRIM(t.title), '') IS NOT NULL ORDER BY t.id"
    ))?;
    let local = stmt
        .query_map([artist_id], |row| {
            Ok(ArtistChartTrack {
                track_id: row.get(0)?,
                title: row.get(1)?,
                display_artist: row.get(2)?,
                album: row.get(3)?,
                year: row.get(4)?,
                charts: Vec::new(),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if local.is_empty() {
        return Ok(());
    }
    let mut song_matches = crate::chart_song_match::SongIndex::default();
    let mut artist_keys = HashSet::<String>::new();
    let mut performers = HashSet::<String>::new();
    for (index, track) in local.iter().enumerate() {
        let artist = crate::identity::loose_key(&track.display_artist);
        artist_keys.extend(billboard_single_artist_key_variants(&artist));
        let credits = crate::identity::credit_keys(&track.display_artist);
        performers.extend(credits.iter().cloned());
        let title = crate::identity::loose_key(&track.title);
        song_matches.insert(
            index,
            &billboard_single_artist_key_variants(&artist),
            &credits,
            &title,
            &billboard_single_title_key_variants(&title),
            chart_parenthetical_key(&track.title).as_deref(),
        );
    }
    let mut credits = conn.prepare("SELECT DISTINCT artist FROM published_chart_entries")?;
    let credits = credits
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    // Do not inflate weeks for duplicate books, source rows, or printed aliases.
    let mut histories = HashMap::<(usize, String), (String, String, HashSet<String>, i32)>::new();
    let mut entries = conn.prepare(
        "SELECT b.chart, e.title, e.week_ending, e.position
         FROM published_chart_entries e JOIN published_chart_books b ON b.id = e.book_id
         WHERE e.artist = ?1 AND e.position > 0",
    )?;
    for credit in credits {
        let artist = crate::identity::loose_key(&credit);
        let credit_performers = crate::identity::credit_keys(&credit);
        if !billboard_single_artist_key_variants(&artist)
            .iter()
            .any(|key| artist_keys.contains(key))
            && !credit_performers
                .first()
                .is_some_and(|lead| performers.contains(lead))
        {
            continue;
        }
        let rows = entries.query_map([&credit], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i32>(3)?,
            ))
        })?;
        for row in rows {
            let (chart, title, week, peak) = row?;
            let full = crate::identity::loose_key(&title);
            let matched = song_matches
                .resolve(
                    &billboard_single_artist_key_variants(&artist),
                    &credit_performers,
                    &full,
                    &billboard_single_title_key_variants(&full),
                    chart_parenthetical_key(&title).as_deref(),
                )
                .into_iter()
                .min();
            let Some(index) = matched else {
                continue;
            };
            let history = histories
                .entry((index, chart))
                .or_insert_with(|| (week.clone(), week.clone(), HashSet::new(), peak));
            history.0 = history.0.clone().min(week.clone());
            history.1 = history.1.clone().max(week.clone());
            history.2.insert(week);
            history.3 = history.3.min(peak);
        }
    }
    for ((index, chart), (first, last, weeks, peak)) in histories {
        let local_track = &local[index];
        let identity = billboard_match_key(
            &crate::identity::loose_key(&local_track.display_artist),
            &crate::identity::loose_key(&local_track.title),
        );
        let target = chart_tracks
            .iter()
            .position(|track| {
                billboard_match_key(
                    &crate::identity::loose_key(&track.display_artist),
                    &crate::identity::loose_key(&track.title),
                ) == identity
            })
            .unwrap_or_else(|| {
                chart_tracks.push(local_track.clone());
                chart_tracks.len() - 1
            });
        chart_tracks[target].charts.push(ArtistTrackChartHistory {
            chart: format!("published:{chart}"),
            entry_date: Some(first),
            end_date: Some(last),
            weeks_on_chart: Some(weeks.len() as i64),
            peak,
        });
    }
    Ok(())
}

pub(super) fn artist_track_highlights(
    conn: &Connection,
    artist_id: &str,
) -> Result<ArtistTrackHighlights> {
    let artist_id = identity::artist_key(artist_id);
    let album_artist_key = artist_key_sql("album_artist_display");
    let track_artist_key =
        artist_key_sql("COALESCE(t.album_artist_display, a.album_artist_display)");
    let artist_name_sql = format!(
        "SELECT COALESCE(MIN(NULLIF(TRIM(album_artist_display), '')), ?1)
         FROM albums
         WHERE {album_artist_key} = ?1"
    );
    let artist_name = conn
        .query_row(&artist_name_sql, [&artist_id], |row| {
            row.get::<_, String>(0)
        })
        .context("Could not resolve artist name for track highlights")?;

    let loved_sql = format!(
        "
        SELECT
            t.id,
            COALESCE(NULLIF(TRIM(t.title), ''), 'Unknown track'),
            COALESCE(NULLIF(TRIM(t.display_artist), ''),
                     NULLIF(TRIM(t.album_artist_display), ''),
                     NULLIF(TRIM(a.album_artist_display), ''),
                     'Unknown artist'),
            COALESCE(t.album, a.album),
            COALESCE(t.release_year, t.year, a.release_year, a.year),
            t.time_seconds,
            t.normalized_rating
        FROM tracks t
        LEFT JOIN albums a ON a.id = t.album_id
        WHERE {track_artist_key} = ?1
          AND UPPER(TRIM(COALESCE(t.love, ''))) = 'L'
        ORDER BY COALESCE(t.release_year, t.year, a.release_year, a.year, 9999),
                 LOWER(COALESCE(t.title, '')), t.id
        "
    );
    let mut loved_stmt = conn
        .prepare(&loved_sql)
        .context("Could not prepare loved artist tracks")?;
    let loved_tracks = loved_stmt
        .query_map([&artist_id], |row| {
            Ok(ArtistLovedTrack {
                track_id: row.get(0)?,
                title: row.get(1)?,
                display_artist: row.get(2)?,
                album: row.get(3)?,
                year: row.get(4)?,
                seconds: row.get(5)?,
                rating: row.get(6)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load loved artist tracks")?;

    let chart_sql = format!(
        "
        WITH artist_tracks AS (
            SELECT
                t.id AS track_id,
                COALESCE(NULLIF(TRIM(t.title), ''), 'Unknown track') AS title,
                COALESCE(NULLIF(TRIM(t.display_artist), ''),
                         NULLIF(TRIM(t.album_artist_display), ''),
                         NULLIF(TRIM(a.album_artist_display), ''),
                         'Unknown artist') AS display_artist,
                COALESCE(t.album, a.album) AS album,
                COALESCE(t.release_year, t.year, a.release_year, a.year) AS release_year
            FROM tracks t
            LEFT JOIN albums a ON a.id = t.album_id
            WHERE {track_artist_key} = ?1
              AND NULLIF(TRIM(COALESCE(t.title, '')), '') IS NOT NULL
        ),
        chart_histories AS (
            SELECT
                'billboard' AS chart,
                entries.matched_track_id AS track_id,
                MIN(entries.date_entered) AS entry_date,
                NULL AS end_date,
                NULL AS weeks_on_chart,
                MIN(entries.rank) AS peak
            FROM billboard_single_chart_entries entries
            JOIN artist_tracks tracks ON tracks.track_id = entries.matched_track_id
            GROUP BY entries.matched_track_id

            UNION ALL

            SELECT
                'officialUk' AS chart,
                entries.matched_track_id AS track_id,
                MIN(entries.chart_date) AS entry_date,
                MAX(COALESCE(NULLIF(entries.chart_end_date, ''), entries.chart_date)) AS end_date,
                COUNT(DISTINCT entries.week_key) AS weeks_on_chart,
                MIN(entries.rank) AS peak
            FROM official_uk_single_chart_entries entries
            JOIN artist_tracks tracks ON tracks.track_id = entries.matched_track_id
            GROUP BY entries.matched_track_id

            UNION ALL

            SELECT
                'vgLista' AS chart,
                entries.matched_track_id AS track_id,
                MIN(entries.week_date) AS entry_date,
                MAX(entries.week_date) AS end_date,
                COUNT(DISTINCT entries.week_key) AS weeks_on_chart,
                MIN(entries.rank) AS peak
            FROM vg_lista_single_chart_entries entries
            JOIN artist_tracks tracks ON tracks.track_id = entries.matched_track_id
            GROUP BY entries.matched_track_id

            UNION ALL

            SELECT
                'tiISkuddet' AS chart,
                entries.matched_track_id AS track_id,
                MIN(entries.chart_date) AS entry_date,
                MAX(entries.chart_date) AS end_date,
                COUNT(DISTINCT printf('%04d-W%02d', entries.year, entries.week)) AS weeks_on_chart,
                MIN(entries.rank) AS peak
            FROM ti_i_skuddet_chart_entries entries
            JOIN artist_tracks tracks ON tracks.track_id = entries.matched_track_id
            GROUP BY entries.matched_track_id

            UNION ALL

            SELECT
                'norsktoppen' AS chart,
                entries.matched_track_id AS track_id,
                MIN(entries.chart_date) AS entry_date,
                MAX(entries.chart_date) AS end_date,
                COUNT(DISTINCT printf('%04d-W%02d', entries.year, entries.week)) AS weeks_on_chart,
                MIN(entries.rank) AS peak
            FROM norsktoppen_chart_entries entries
            JOIN artist_tracks tracks ON tracks.track_id = entries.matched_track_id
            GROUP BY entries.matched_track_id
        )
        SELECT
            histories.chart,
            tracks.track_id,
            tracks.title,
            tracks.display_artist,
            tracks.album,
            tracks.release_year,
            histories.entry_date,
            histories.end_date,
            histories.weeks_on_chart,
            histories.peak
        FROM chart_histories histories
        JOIN artist_tracks tracks ON tracks.track_id = histories.track_id
        ORDER BY tracks.track_id,
                 CASE histories.chart
                     WHEN 'billboard' THEN 0
                     WHEN 'officialUk' THEN 1
                     WHEN 'vgLista' THEN 2
                     WHEN 'tiISkuddet' THEN 3
                     WHEN 'norsktoppen' THEN 4
                     ELSE 5
                 END
        "
    );
    let mut chart_stmt = conn
        .prepare(&chart_sql)
        .context("Could not prepare artist chart histories")?;
    let chart_rows = chart_stmt
        .query_map([&artist_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<i32>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<i64>>(8)?,
                row.get::<_, i32>(9)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load artist chart histories")?;

    let mut song_indexes = HashMap::<String, usize>::new();
    let mut chart_tracks = Vec::<ArtistChartTrack>::new();
    for (
        chart,
        track_id,
        title,
        display_artist,
        album,
        year,
        entry_date,
        end_date,
        weeks_on_chart,
        peak,
    ) in chart_rows
    {
        let song_key = billboard_match_key(
            &crate::identity::loose_key(&display_artist),
            &crate::identity::loose_key(&title),
        );
        let track_index = match song_indexes.get(&song_key).copied() {
            Some(index) => index,
            None => {
                let index = chart_tracks.len();
                song_indexes.insert(song_key, index);
                chart_tracks.push(ArtistChartTrack {
                    track_id,
                    title,
                    display_artist,
                    album,
                    year,
                    charts: Vec::new(),
                });
                index
            }
        };
        merge_artist_chart_history(
            &mut chart_tracks[track_index].charts,
            ArtistTrackChartHistory {
                chart,
                entry_date,
                end_date,
                weeks_on_chart,
                peak,
            },
        );
    }

    append_published_artist_histories(conn, &artist_id, &mut chart_tracks)?;

    for track in &mut chart_tracks {
        track
            .charts
            .sort_by_key(|history| chart_history_priority(&history.chart));
    }

    Ok(ArtistTrackHighlights {
        artist_id,
        artist_name,
        loved_tracks,
        chart_tracks,
    })
}

pub(super) fn list_artists(
    conn: &Connection,
    request: ArtistListRequest,
    max_limit: u32,
) -> Result<ArtistListResponse> {
    let limit = request.limit.clamp(1, max_limit);
    let offset = request.offset;
    let (where_sql, values) = artist_search_where(&request.search_text);
    let album_artist_key_sql = artist_key_sql("album_artist_display");
    let album_artist_key_sql_a2 = artist_key_sql("a2.album_artist_display");
    let album_artist_key_sql_a3 = artist_key_sql("a3.album_artist_display");

    let count_sql = format!(
        "
        SELECT COUNT(*)
        FROM (
            SELECT {album_artist_key_sql} AS artist_key
            FROM albums
            {where_sql}
            GROUP BY artist_key
        )
        "
    );
    let total = conn
        .query_row(&count_sql, params_from_iter(values.iter()), |row| {
            row.get(0)
        })
        .context("Could not count artist results")?;

    let order_sql = artist_order_clause(&request.sort);
    let sql = format!(
        "
        WITH grouped AS (
            SELECT
                {album_artist_key_sql} AS artist_key,
                COALESCE(MIN(NULLIF(TRIM(album_artist_display), '')), 'Unknown Artist') AS artist_name,
                COUNT(*) AS album_count,
                SUM(CASE WHEN rating_completeness >= 1.0 THEN 1 ELSE 0 END) AS rated_album_count,
                SUM(CASE WHEN rating_completeness > 0.0 AND rating_completeness < 1.0 THEN 1 ELSE 0 END) AS partial_album_count,
                SUM(CASE WHEN rating_completeness = 0.0 THEN 1 ELSE 0 END) AS unrated_album_count,
                COALESCE(SUM(total_tracks), 0) AS track_count,
                COALESCE(SUM(total_seconds), 0) AS total_seconds,
                COALESCE(SUM(loved_tracks), 0) AS loved_tracks,
                COALESCE(SUM(tmoe_seconds), 0) AS tmoe_seconds,
                AVG(rating_completeness) AS average_rating_completeness,
                AVG(effective_album_rating) AS average_album_rating,
                AVG(album_score) AS average_album_score,
                MIN(year) AS first_year,
                MAX(year) AS last_year
            FROM albums
            {where_sql}
            GROUP BY artist_key
        )
        SELECT
            artist_key,
            artist_name,
            album_count,
            rated_album_count,
            partial_album_count,
            unrated_album_count,
            track_count,
            total_seconds,
            loved_tracks,
            tmoe_seconds,
            average_rating_completeness,
            average_album_rating,
            average_album_score,
            first_year,
            last_year,
            (
                SELECT COALESCE(NULLIF(TRIM(a2.canonical_genre), ''), 'Unknown')
                FROM albums a2
                WHERE {album_artist_key_sql_a2} = grouped.artist_key
                GROUP BY COALESCE(NULLIF(TRIM(LOWER(a2.genre_normalized)), ''), 'unknown')
                ORDER BY COUNT(*) DESC, LOWER(COALESCE(a2.canonical_genre, '')) ASC
                LIMIT 1
            ) AS top_genre,
            COALESCE(link.mbid, info.mbid) AS music_brainz_mbid,
            info.sort_name AS music_brainz_sort_name,
            info.artist_type AS music_brainz_artist_type,
            info.gender AS music_brainz_gender,
            info.life_begin_date AS music_brainz_begin_date,
            info.life_begin_year AS music_brainz_begin_year,
            info.life_end_date AS music_brainz_end_date,
            info.life_end_year AS music_brainz_end_year,
            info.life_ended AS music_brainz_ended,
            info.begin_area_name AS music_brainz_begin_area_name,
            info.end_area_name AS music_brainz_end_area_name,
            info.review_state AS music_brainz_info_review_state,
            info.fetched_at AS music_brainz_info_fetched_at,
            origin.country_code AS origin_country_code,
            origin.country_name AS origin_country_name,
            origin.raw_area_name AS origin_country_raw_area,
            origin.review_state AS origin_country_review_state,
            EXISTS(
                SELECT 1 FROM artist_images image
                WHERE image.artist_key = grouped.artist_key
                  AND image.state = 'available'
                  AND NULLIF(TRIM(COALESCE(image.cache_path, '')), '') IS NOT NULL
            ) AS portrait_available,
            (
                SELECT a3.id FROM albums a3
                LEFT JOIN album_covers c3 ON c3.album_id = a3.id
                WHERE {album_artist_key_sql_a3} = grouped.artist_key
                ORDER BY c3.cache_path IS NOT NULL DESC, a3.album_score DESC, a3.year ASC, a3.id ASC
                LIMIT 1
            ) AS representative_album_id,
            (
                SELECT a3.album FROM albums a3
                LEFT JOIN album_covers c3 ON c3.album_id = a3.id
                WHERE {album_artist_key_sql_a3} = grouped.artist_key
                ORDER BY c3.cache_path IS NOT NULL DESC, a3.album_score DESC, a3.year ASC, a3.id ASC
                LIMIT 1
            ) AS representative_album,
            (
                SELECT c3.cache_path FROM albums a3
                JOIN album_covers c3 ON c3.album_id = a3.id
                WHERE {album_artist_key_sql_a3} = grouped.artist_key
                ORDER BY a3.album_score DESC, a3.year ASC, a3.id ASC
                LIMIT 1
            ) AS representative_cover_path
        FROM grouped
        LEFT JOIN musicbrainz_artist_infos info
          ON info.local_artist_key = grouped.artist_key
        LEFT JOIN musicbrainz_artist_links link
          ON link.local_artist_key = grouped.artist_key
        LEFT JOIN musicbrainz_artist_origin_countries origin
          ON origin.local_artist_key = grouped.artist_key
        {order_sql}
        LIMIT ? OFFSET ?
        "
    );
    let mut row_values = values;
    row_values.push(Value::Integer(i64::from(limit)));
    row_values.push(Value::Integer(i64::from(offset)));

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(params_from_iter(row_values.iter()), artist_summary_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load artist results")?;

    Ok(ArtistListResponse {
        rows,
        total,
        limit,
        offset,
    })
}

pub(super) fn artist_summary_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ArtistSummary> {
    Ok(ArtistSummary {
        id: row.get(0)?,
        name: row.get(1)?,
        album_count: row.get(2)?,
        rated_album_count: row.get(3)?,
        partial_album_count: row.get(4)?,
        unrated_album_count: row.get(5)?,
        track_count: row.get(6)?,
        total_seconds: row.get(7)?,
        loved_tracks: row.get(8)?,
        tmoe_seconds: row.get(9)?,
        average_rating_completeness: row.get(10)?,
        average_album_rating: row.get(11)?,
        average_album_score: row.get(12)?,
        first_year: row.get(13)?,
        last_year: row.get(14)?,
        top_genre: row.get(15)?,
        music_brainz_mbid: row.get(16)?,
        music_brainz_sort_name: row.get(17)?,
        music_brainz_artist_type: row.get(18)?,
        music_brainz_gender: row.get(19)?,
        music_brainz_begin_date: row.get(20)?,
        music_brainz_begin_year: row.get(21)?,
        music_brainz_end_date: row.get(22)?,
        music_brainz_end_year: row.get(23)?,
        music_brainz_ended: row.get(24)?,
        music_brainz_begin_area_name: row.get(25)?,
        music_brainz_end_area_name: row.get(26)?,
        music_brainz_info_review_state: row.get(27)?,
        music_brainz_info_fetched_at: row.get(28)?,
        origin_country_code: row.get(29)?,
        origin_country_name: row.get(30)?,
        origin_country_raw_area: row.get(31)?,
        origin_country_review_state: row.get(32)?,
        portrait_available: row.get(33)?,
        representative_album_id: row.get(34)?,
        representative_album: row.get(35)?,
        representative_cover_path: row.get(36)?,
    })
}

pub(super) fn artist_search_where(search_text: &str) -> (String, Vec<Value>) {
    let search_text = search_text.trim();
    if search_text.is_empty() {
        return (String::new(), Vec::new());
    }

    let normalized = identity::artist_text_key(search_text);
    let artist_text_sql = identity::fold_dashes_sql("album_artist_display");
    (
        format!(
            "WHERE unicode_lower(COALESCE(NULLIF(TRIM({artist_text_sql}), ''), 'Unknown Artist')) LIKE ? ESCAPE '\\'"
        ),
        vec![Value::Text(format!("%{}%", escape_like(&normalized)))],
    )
}

pub(super) fn artist_order_clause(sort: &BrowseSort) -> String {
    let direction = if sort.direction.eq_ignore_ascii_case("desc") {
        "DESC"
    } else {
        "ASC"
    };

    let field = match sort.field.as_str() {
        "albumCount" => "album_count",
        "trackCount" => "track_count",
        "lovedTracks" => "loved_tracks",
        "totalMinutes" => "total_seconds",
        "averageCompleteness" => "average_rating_completeness",
        "averageRating" => "average_album_rating",
        "averageScore" => "average_album_score",
        "firstYear" => "first_year",
        "lastYear" => "last_year",
        "topGenre" => "top_genre",
        _ => "LOWER(artist_name)",
    };

    format!("ORDER BY {field} {direction}, LOWER(artist_name) ASC")
}

pub(super) fn list_genres(
    conn: &Connection,
    request: GenreListRequest,
    max_limit: u32,
) -> Result<GenreListResponse> {
    let limit = request.limit.clamp(1, max_limit);
    let offset = request.offset;
    let (where_sql, values) = genre_search_where(&request.search_text);

    let count_sql = format!(
        "
        SELECT COUNT(*)
        FROM (
            SELECT COALESCE(NULLIF(TRIM(LOWER(genre_normalized)), ''), 'unknown') AS genre_key
            FROM albums
            {where_sql}
            GROUP BY genre_key
        )
        "
    );
    let total = conn
        .query_row(&count_sql, params_from_iter(values.iter()), |row| {
            row.get(0)
        })
        .context("Could not count genre results")?;

    let order_sql = genre_order_clause(&request.sort);
    let album_artist_key_sql_a2 = artist_key_sql("a2.album_artist_display");
    let sql = format!(
        "
        WITH grouped AS (
            SELECT
                COALESCE(NULLIF(TRIM(LOWER(genre_normalized)), ''), 'unknown') AS genre_key,
                COALESCE(MIN(NULLIF(TRIM(canonical_genre), '')), 'Unknown') AS genre_name,
                COUNT(*) AS album_count,
                SUM(CASE WHEN rating_completeness >= 1.0 THEN 1 ELSE 0 END) AS rated_album_count,
                SUM(CASE WHEN rating_completeness > 0.0 AND rating_completeness < 1.0 THEN 1 ELSE 0 END) AS partial_album_count,
                SUM(CASE WHEN rating_completeness = 0.0 THEN 1 ELSE 0 END) AS unrated_album_count,
                COALESCE(SUM(total_tracks), 0) AS track_count,
                COALESCE(SUM(total_seconds), 0) AS total_seconds,
                COALESCE(SUM(loved_tracks), 0) AS loved_tracks,
                COALESCE(SUM(tmoe_seconds), 0) AS tmoe_seconds,
                AVG(rating_completeness) AS average_rating_completeness,
                AVG(effective_album_rating) AS average_album_rating,
                AVG(album_score) AS average_album_score,
                MIN(year) AS first_year,
                MAX(year) AS last_year
            FROM albums
            {where_sql}
            GROUP BY genre_key
        )
        SELECT
            genre_key,
            genre_name,
            album_count,
            rated_album_count,
            partial_album_count,
            unrated_album_count,
            track_count,
            total_seconds,
            loved_tracks,
            tmoe_seconds,
            average_rating_completeness,
            average_album_rating,
            average_album_score,
            first_year,
            last_year,
            (
                SELECT COALESCE(MIN(NULLIF(TRIM(a2.album_artist_display), '')), 'Unknown Artist')
                FROM albums a2
                WHERE COALESCE(NULLIF(TRIM(LOWER(a2.genre_normalized)), ''), 'unknown') = grouped.genre_key
                GROUP BY {album_artist_key_sql_a2}
                ORDER BY COUNT(*) DESC, LOWER(COALESCE(MIN(NULLIF(TRIM(a2.album_artist_display), '')), 'Unknown Artist')) ASC
                LIMIT 1
            ) AS top_artist
        FROM grouped
        {order_sql}
        LIMIT ? OFFSET ?
        "
    );
    let mut row_values = values;
    row_values.push(Value::Integer(i64::from(limit)));
    row_values.push(Value::Integer(i64::from(offset)));

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(params_from_iter(row_values.iter()), genre_summary_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load genre results")?;

    Ok(GenreListResponse {
        rows,
        total,
        limit,
        offset,
    })
}

pub(super) fn genre_timeline(
    conn: &Connection,
    request: GenreTimelineRequest,
) -> Result<GenreTimelineResponse> {
    let (dated_album_count, available_year_from, available_year_to) = conn
        .query_row(
            "SELECT COUNT(*), MIN(year), MAX(year) FROM albums WHERE year IS NOT NULL",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .context("Could not load genre timeline year extent")?;

    let mut conditions = vec![
        "year IS NOT NULL".to_string(),
        "NULLIF(TRIM(COALESCE(genre_normalized, '')), '') IS NOT NULL".to_string(),
    ];
    let mut values = Vec::new();
    add_i32_range(
        &mut conditions,
        &mut values,
        "year",
        request.year_from,
        request.year_to,
    );
    add_text_list_condition(
        &mut conditions,
        &mut values,
        "genre_normalized",
        &request.genres,
        false,
    );
    add_text_list_condition(
        &mut conditions,
        &mut values,
        "genre_normalized",
        &request.excluded_genres,
        true,
    );
    let where_sql = conditions.join(" AND ");

    let (matching_album_count, matching_genre_count) = conn
        .query_row(
            &format!(
                "SELECT COUNT(*), COUNT(DISTINCT LOWER(TRIM(genre_normalized))) FROM albums WHERE {where_sql}"
            ),
            params_from_iter(values.iter()),
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .context("Could not count genre timeline matches")?;

    let genre_limit = request.genre_limit.clamp(1, 24);
    let mut genre_values = values.clone();
    genre_values.push(Value::Integer(i64::from(genre_limit)));
    let mut genre_stmt = conn.prepare(&format!(
        "
        SELECT
            LOWER(TRIM(genre_normalized)) AS genre_id,
            COALESCE(MIN(NULLIF(TRIM(canonical_genre), '')), 'Unknown') AS genre,
            COUNT(*) AS album_count,
            MIN(year) AS first_year,
            MAX(year) AS last_year
        FROM albums
        WHERE {where_sql}
        GROUP BY LOWER(TRIM(genre_normalized))
        ORDER BY album_count DESC, LOWER(genre) ASC
        LIMIT ?
        "
    ))?;
    let mut genres = genre_stmt
        .query_map(params_from_iter(genre_values.iter()), |row| {
            let first_year = row.get(3)?;
            Ok(GenreTimelineGenre {
                id: row.get(0)?,
                name: row.get(1)?,
                album_count: row.get(2)?,
                first_year,
                last_year: row.get(4)?,
                peak_year: first_year,
                peak_album_count: 0,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load genre timeline genres")?;

    if genres.is_empty() {
        return Ok(GenreTimelineResponse {
            genres,
            year_counts: Vec::new(),
            albums: Vec::new(),
            matching_album_count,
            matching_genre_count,
            dated_album_count,
            available_year_from,
            available_year_to,
        });
    }

    let selected_genre_ids = genres
        .iter()
        .map(|genre| genre.id.clone())
        .collect::<HashSet<_>>();
    let genre_indexes = genres
        .iter()
        .enumerate()
        .map(|(index, genre)| (genre.id.clone(), index))
        .collect::<HashMap<_, _>>();

    let mut year_stmt = conn.prepare(&format!(
        "
        SELECT
            LOWER(TRIM(genre_normalized)) AS genre_id,
            year,
            COUNT(*) AS album_count
        FROM albums
        WHERE {where_sql}
        GROUP BY LOWER(TRIM(genre_normalized)), year
        ORDER BY year ASC, genre_id ASC
        "
    ))?;
    let mut year_counts = year_stmt
        .query_map(params_from_iter(values.iter()), |row| {
            Ok(GenreTimelineYearCount {
                genre_id: row.get(0)?,
                year: row.get(1)?,
                album_count: row.get(2)?,
            })
        })?
        .filter_map(|row| match row {
            Ok(count) if selected_genre_ids.contains(&count.genre_id) => Some(Ok(count)),
            Ok(_) => None,
            Err(error) => Some(Err(error)),
        })
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load genre timeline year counts")?;

    for count in &year_counts {
        if let Some(index) = genre_indexes.get(&count.genre_id) {
            let genre = &mut genres[*index];
            if count.album_count > genre.peak_album_count {
                genre.peak_album_count = count.album_count;
                genre.peak_year = count.year;
            }
        }
    }

    let selected_placeholders = std::iter::repeat("?")
        .take(selected_genre_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let mut album_values = values;
    let mut ordered_selected_ids = selected_genre_ids.into_iter().collect::<Vec<_>>();
    ordered_selected_ids.sort();
    album_values.extend(ordered_selected_ids.iter().cloned().map(Value::Text));
    let mut album_stmt = conn.prepare(&format!(
        "
        SELECT
            id,
            album,
            album_artist_display,
            LOWER(TRIM(genre_normalized)) AS genre_id,
            COALESCE(NULLIF(TRIM(canonical_genre), ''), 'Unknown') AS genre,
            year
        FROM albums
        WHERE {where_sql}
          AND LOWER(TRIM(genre_normalized)) IN ({selected_placeholders})
        ORDER BY year ASC, genre_id ASC, LOWER(COALESCE(album, '')) ASC, id ASC
        "
    ))?;
    let all_album_points = album_stmt
        .query_map(params_from_iter(album_values.iter()), |row| {
            Ok(GenreTimelineAlbumPoint {
                album_id: row.get(0)?,
                album: row.get(1)?,
                album_artist_display: row.get(2)?,
                genre_id: row.get(3)?,
                genre: row.get(4)?,
                year: row.get(5)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load genre timeline album points")?;

    let album_point_limit = request.album_point_limit.min(12_000) as usize;
    let albums = if album_point_limit == 0 {
        Vec::new()
    } else if all_album_points.len() <= album_point_limit {
        all_album_points
    } else {
        (0..album_point_limit)
            .map(|index| {
                let source_index = index * all_album_points.len() / album_point_limit;
                all_album_points[source_index].clone()
            })
            .collect()
    };

    year_counts.sort_by(|left, right| {
        left.year
            .cmp(&right.year)
            .then_with(|| left.genre_id.cmp(&right.genre_id))
    });

    Ok(GenreTimelineResponse {
        genres,
        year_counts,
        albums,
        matching_album_count,
        matching_genre_count,
        dated_album_count,
        available_year_from,
        available_year_to,
    })
}

pub(super) fn chart_rank_strength(rank: Option<i32>, chart_size: i32) -> f64 {
    let Some(rank) = rank else { return 0.0 };
    let maximum = chart_size.max(2) - 1;
    let clamped = rank.clamp(1, chart_size) - 1;
    1.0 - f64::from(clamped) / f64::from(maximum)
}

pub(super) fn artist_timeline(
    conn: &Connection,
    request: ArtistTimelineRequest,
) -> Result<ArtistTimelineResponse> {
    let (dated_album_count, available_year_from, available_year_to) = conn
        .query_row(
            "SELECT COUNT(*), MIN(year), MAX(year) FROM albums WHERE year IS NOT NULL",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .context("Could not load artist timeline year extent")?;

    let artist_key = artist_key_sql("a.album_artist_display");
    let artist_key_a2 = artist_key_sql("a2.album_artist_display");
    let mut conditions = vec!["a.year IS NOT NULL".to_string()];
    let mut values = Vec::new();
    add_i32_range(
        &mut conditions,
        &mut values,
        "a.year",
        request.year_from,
        request.year_to,
    );
    add_text_list_condition(
        &mut conditions,
        &mut values,
        "a.genre_normalized",
        &request.genres,
        false,
    );
    add_text_list_condition(
        &mut conditions,
        &mut values,
        "a.genre_normalized",
        &request.excluded_genres,
        true,
    );
    let requested_artists = request
        .artists
        .iter()
        .map(|artist| identity::artist_text_key(artist))
        .filter(|artist| !artist.is_empty())
        .collect::<HashSet<_>>();
    if !requested_artists.is_empty() {
        let placeholders = std::iter::repeat("?")
            .take(requested_artists.len())
            .collect::<Vec<_>>()
            .join(", ");
        conditions.push(format!("{artist_key} IN ({placeholders})"));
        let mut ordered = requested_artists.into_iter().collect::<Vec<_>>();
        ordered.sort();
        values.extend(ordered.into_iter().map(Value::Text));
    }
    let where_sql = conditions.join(" AND ");
    let (matching_album_count, matching_artist_count) = conn
        .query_row(
            &format!(
                "SELECT COUNT(*), COUNT(DISTINCT {artist_key}) FROM albums a WHERE {where_sql}"
            ),
            params_from_iter(values.iter()),
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .context("Could not count artist timeline matches")?;

    let artist_limit = request.artist_limit.clamp(1, 20);
    let mut artist_values = values.clone();
    artist_values.push(Value::Integer(i64::from(artist_limit)));
    let mut artist_stmt = conn.prepare(&format!(
        "
        WITH filtered AS (
            SELECT a.*,
                   {artist_key} AS artist_key,
                   COALESCE(NULLIF(TRIM(a.album_artist_display), ''), 'Unknown Artist') AS artist_name
            FROM albums a
            WHERE {where_sql}
        ), grouped AS (
            SELECT artist_key,
                   MIN(artist_name) AS artist_name,
                   COUNT(*) AS album_count,
                   MIN(year) AS first_year,
                   MAX(year) AS last_year,
                   AVG(album_score) AS average_album_score,
                   COALESCE(SUM(loved_tracks), 0) AS loved_tracks
            FROM filtered
            GROUP BY artist_key
        )
        SELECT
            grouped.artist_key,
            grouped.artist_name,
            grouped.album_count,
            grouped.first_year,
            grouped.last_year,
            grouped.average_album_score,
            grouped.loved_tracks,
            (
                SELECT COALESCE(NULLIF(TRIM(a2.canonical_genre), ''), 'Unknown')
                FROM albums a2
                WHERE {artist_key_a2} = grouped.artist_key
                GROUP BY COALESCE(NULLIF(TRIM(LOWER(a2.genre_normalized)), ''), 'unknown')
                ORDER BY COUNT(*) DESC, LOWER(COALESCE(a2.canonical_genre, '')) ASC
                LIMIT 1
            ) AS top_genre,
            EXISTS(
                SELECT 1 FROM artist_images image
                WHERE image.artist_key = grouped.artist_key
                  AND image.state = 'available'
                  AND NULLIF(TRIM(COALESCE(image.cache_path, '')), '') IS NOT NULL
            ) AS portrait_available,
            (
                SELECT f.id FROM filtered f
                LEFT JOIN album_covers c ON c.album_id = f.id
                WHERE f.artist_key = grouped.artist_key
                ORDER BY c.cache_path IS NOT NULL DESC, f.album_score DESC, f.year ASC, f.id ASC
                LIMIT 1
            ) AS representative_album_id,
            (
                SELECT f.album FROM filtered f
                LEFT JOIN album_covers c ON c.album_id = f.id
                WHERE f.artist_key = grouped.artist_key
                ORDER BY c.cache_path IS NOT NULL DESC, f.album_score DESC, f.year ASC, f.id ASC
                LIMIT 1
            ) AS representative_album,
            (
                SELECT c.cache_path FROM filtered f
                JOIN album_covers c ON c.album_id = f.id
                WHERE f.artist_key = grouped.artist_key
                ORDER BY f.album_score DESC, f.year ASC, f.id ASC
                LIMIT 1
            ) AS representative_cover_path
        FROM grouped
        ORDER BY grouped.album_count DESC, LOWER(grouped.artist_name) ASC
        LIMIT ?
        "
    ))?;
    let artists = artist_stmt
        .query_map(params_from_iter(artist_values.iter()), |row| {
            Ok(ArtistTimelineArtist {
                id: row.get(0)?,
                name: row.get(1)?,
                album_count: row.get(2)?,
                first_year: row.get(3)?,
                last_year: row.get(4)?,
                average_album_score: row.get(5)?,
                loved_tracks: row.get(6)?,
                top_genre: row.get(7)?,
                portrait_available: row.get(8)?,
                representative_album_id: row.get(9)?,
                representative_album: row.get(10)?,
                representative_cover_path: row.get(11)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load artist timeline artists")?;

    if artists.is_empty() {
        return Ok(ArtistTimelineResponse {
            artists,
            albums: Vec::new(),
            matching_album_count,
            matching_artist_count,
            dated_album_count,
            available_year_from,
            available_year_to,
        });
    }

    let selected_ids = artists
        .iter()
        .map(|artist| artist.id.clone())
        .collect::<Vec<_>>();
    let placeholders = std::iter::repeat("?")
        .take(selected_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let mut album_values = values;
    album_values.extend(selected_ids.iter().cloned().map(Value::Text));
    let mut album_stmt = conn.prepare(&format!(
        "
        SELECT
            a.id,
            a.album,
            {artist_key} AS artist_id,
            COALESCE(NULLIF(TRIM(a.album_artist_display), ''), 'Unknown Artist') AS artist,
            a.year,
            a.album_score,
            COALESCE(a.loved_tracks, 0),
            a.billboard_rank,
            a.official_uk_rank,
            a.vg_lista_rank,
            c.cache_path
        FROM albums a
        LEFT JOIN album_covers c ON c.album_id = a.id
        WHERE {where_sql}
          AND {artist_key} IN ({placeholders})
        ORDER BY a.year ASC, LOWER(COALESCE(a.album, '')) ASC, a.id ASC
        "
    ))?;
    let albums = album_stmt
        .query_map(params_from_iter(album_values.iter()), |row| {
            let billboard_rank = row.get(7)?;
            let official_uk_rank = row.get(8)?;
            let vg_lista_rank = row.get(9)?;
            let chart_peak = 0.42 * chart_rank_strength(billboard_rank, 200)
                + 0.42 * chart_rank_strength(official_uk_rank, 100)
                + 0.16 * chart_rank_strength(vg_lista_rank, 40);
            Ok(ArtistTimelineAlbum {
                album_id: row.get(0)?,
                album: row.get(1)?,
                artist_id: row.get(2)?,
                artist: row.get(3)?,
                year: row.get(4)?,
                album_score: row.get(5)?,
                loved_tracks: row.get(6)?,
                billboard_rank,
                official_uk_rank,
                vg_lista_rank,
                chart_peak,
                cover_path: row.get(10)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load artist timeline albums")?;

    Ok(ArtistTimelineResponse {
        artists,
        albums,
        matching_album_count,
        matching_artist_count,
        dated_album_count,
        available_year_from,
        available_year_to,
    })
}

pub(super) fn genre_summary_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<GenreSummary> {
    Ok(GenreSummary {
        id: row.get(0)?,
        name: row.get(1)?,
        album_count: row.get(2)?,
        rated_album_count: row.get(3)?,
        partial_album_count: row.get(4)?,
        unrated_album_count: row.get(5)?,
        track_count: row.get(6)?,
        total_seconds: row.get(7)?,
        loved_tracks: row.get(8)?,
        tmoe_seconds: row.get(9)?,
        average_rating_completeness: row.get(10)?,
        average_album_rating: row.get(11)?,
        average_album_score: row.get(12)?,
        first_year: row.get(13)?,
        last_year: row.get(14)?,
        top_artist: row.get(15)?,
    })
}

pub(super) fn genre_search_where(search_text: &str) -> (String, Vec<Value>) {
    let search_text = search_text.trim();
    if search_text.is_empty() {
        return (String::new(), Vec::new());
    }

    let normalized = search_text.to_lowercase();
    (
        "WHERE LOWER(COALESCE(NULLIF(TRIM(canonical_genre), ''), 'Unknown')) LIKE ? ESCAPE '\\'"
            .to_string(),
        vec![Value::Text(format!("%{}%", escape_like(&normalized)))],
    )
}

pub(super) fn genre_order_clause(sort: &BrowseSort) -> String {
    let direction = if sort.direction.eq_ignore_ascii_case("desc") {
        "DESC"
    } else {
        "ASC"
    };

    let field = match sort.field.as_str() {
        "albumCount" => "album_count",
        "trackCount" => "track_count",
        "lovedTracks" => "loved_tracks",
        "totalMinutes" => "total_seconds",
        "averageCompleteness" => "average_rating_completeness",
        "averageRating" => "average_album_rating",
        "averageScore" => "average_album_score",
        "firstYear" => "first_year",
        "lastYear" => "last_year",
        "topArtist" => "top_artist",
        _ => "LOWER(genre_name)",
    };

    format!("ORDER BY {field} {direction}, LOWER(genre_name) ASC")
}

pub(super) fn genre_suggestion_names(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "
        SELECT COALESCE(MIN(NULLIF(TRIM(canonical_genre), '')), 'Unknown') AS genre_name
        FROM albums
        WHERE NULLIF(TRIM(COALESCE(genre_normalized, '')), '') IS NOT NULL
        GROUP BY COALESCE(NULLIF(TRIM(LOWER(genre_normalized)), ''), 'unknown')
        ORDER BY LOWER(genre_name) ASC
        ",
    )?;

    let rows = stmt
        .query_map([], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<String>>>()
        .context("Could not load genre suggestion names")?;

    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::*;

    #[test]
    fn lists_artist_summaries_and_filters_albums_by_artist_key() {
        let conn = seeded_connection();
        let artists = list_artists(&conn, ArtistListRequest::default(), 50).expect("list artists");

        assert_eq!(artists.total, 1);
        assert_eq!(artists.rows[0].id, "pet shop boys");
        assert_eq!(artists.rows[0].name, "Pet Shop Boys");
        assert_eq!(artists.rows[0].album_count, 1);
        assert_eq!(artists.rows[0].track_count, 10);
        assert_eq!(artists.rows[0].top_genre.as_deref(), Some("Synthpop"));

        let mut request = BrowseRequest::default();
        request.filters.artist_keys = vec![artists.rows[0].id.clone()];
        let response = search_library(&conn, request, 50).expect("search artist albums");

        assert_eq!(response.total, 1);
        assert_eq!(
            response.rows[0].album_artist_display.as_deref(),
            Some("Pet Shop Boys")
        );
    }

    #[test]
    fn artist_highlights_include_all_published_series_without_duplicate_weeks() {
        let conn = seeded_connection();
        let title: String = conn
            .query_row("SELECT title FROM tracks LIMIT 1", [], |row| row.get(0))
            .unwrap();
        for (book, chart) in [
            (1, "Billboard Hot 100"),
            (2, "Hot Dance Club Play"),
            (3, "Billboard Hot 100"),
        ] {
            conn.execute("INSERT INTO published_chart_books (id, book, chart, first_week, last_week, weekly_charts, row_count, first_page, last_page) VALUES (?1, ?2, ?3, '1987-01-03', '1987-01-10', 2, 4, '', '')", params![book, format!("book{book}"), chart]).unwrap();
            for (row, week, position, artist, song) in [
                (1, "1987-01-03", 8, "PET SHOP BOYS", title.clone()),
                (
                    2,
                    "1987-01-10",
                    2,
                    "Pet Shop Boys",
                    format!("{title} (LP Version)"),
                ),
                (3, "1987-01-10", 2, "Pet Shop Boys", title.clone()),
                (4, "1987-01-17", 1, "Other Artist", title.clone()),
                (
                    5,
                    "1987-01-24",
                    1,
                    "Pet Shop Boys",
                    format!("{title} (Single Mix)"),
                ),
            ] {
                conn.execute("INSERT INTO published_chart_entries (book_id, source_row, week_ending, position, artist, title, last_week, weeks_on_chart, entry_status, movement, number_one_marker, label, format, catalogue_number, release_type, duration, peak_position, entry_date, peak_date, bpi_award, source_page) VALUES (?1, ?2, ?3, ?4, ?5, ?6, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '')", params![book, row, week, position, artist, song]).unwrap();
            }
        }
        let result = artist_track_highlights(&conn, "pet shop boys").unwrap();
        assert_eq!(result.chart_tracks.len(), 1);
        let charts = &result.chart_tracks[0].charts;
        assert_eq!(charts.len(), 2);
        assert!(charts
            .iter()
            .any(|chart| chart.chart == "published:Hot Dance Club Play"));
        for chart in charts {
            assert_eq!(chart.weeks_on_chart, Some(3));
            assert_eq!(chart.peak, 1);
            assert_eq!(chart.entry_date.as_deref(), Some("1987-01-03"));
            assert_eq!(chart.end_date.as_deref(), Some("1987-01-24"));
        }
        assert!(artist_track_highlights(&conn, "missing artist")
            .unwrap()
            .chart_tracks
            .is_empty());
    }

    #[test]
    fn loads_loved_tracks_and_one_chart_row_with_prioritized_histories() {
        let conn = seeded_connection();
        let track_id = conn
            .query_row("SELECT id FROM tracks LIMIT 1", [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("track id");
        conn.execute(
            "INSERT INTO billboard_single_chart_entries (
                source_file, year, rank, artist, display_artist, title, artist_key,
                title_key, date_entered, date_entered_quality, matched_track_id, imported_at
             ) VALUES (
                'billboard.csv', 1987, 10, 'Pet Shop Boys', 'Pet Shop Boys',
                'What Have I Done to Deserve This?', 'pet shop boys',
                'what have i done to deserve this', '1987-08-08', 'exact', ?1,
                '2026-08-11T00:00:00Z'
             )",
            [track_id],
        )
        .expect("insert Billboard chart row");
        for (week, chart_date, chart_end_date, rank) in [
            (42, "1987-10-16", "1987-10-22", 9),
            (43, "1987-10-23", "1987-10-29", 4),
        ] {
            conn.execute(
                "INSERT INTO official_uk_single_chart_entries (
                    source_file, year, week, chart_date, chart_end_date, rank,
                    artist, title, artist_key, title_key, week_key, matched_track_id,
                    imported_at
                 ) VALUES (
                    'uk.csv', 1987, ?1, ?2, ?3, ?4, 'Pet Shop Boys',
                    'What Have I Done to Deserve This?', 'pet shop boys',
                    'what have i done to deserve this', ?5, ?6,
                    '2026-08-11T00:00:00Z'
                 )",
                params![
                    week,
                    chart_date,
                    chart_end_date,
                    rank,
                    format!("1987-W{week:02}"),
                    track_id
                ],
            )
            .expect("insert UK chart row");
        }
        conn.execute(
            "INSERT INTO vg_lista_single_chart_entries (
                source_file, year, week, rank, artist, title, artist_key,
                title_key, week_date, week_key, matched_track_id, imported_at
             ) VALUES (
                'vg.csv', 1987, 45, 2, 'Pet Shop Boys',
                'What Have I Done to Deserve This?', 'pet shop boys',
                'what have i done to deserve this', '1987-11-02', '1987-W45', ?1,
                '2026-08-11T00:00:00Z'
             )",
            [track_id],
        )
        .expect("insert VG-lista chart row");
        conn.execute(
            "INSERT INTO ti_i_skuddet_chart_entries (
                source_file, year, week, chart_date, rank, rank_raw, artist,
                title, artist_key, title_key, matched_track_id, imported_at
             ) VALUES (
                'ti.csv', 1987, 46, '1987-11-09', 3, '3', 'Pet Shop Boys',
                'What Have I Done to Deserve This?', 'pet shop boys',
                'what have i done to deserve this', ?1, '2026-08-11T00:00:00Z'
             )",
            [track_id],
        )
        .expect("insert Ti i Skuddet chart row");
        conn.execute(
            "INSERT INTO norsktoppen_chart_entries (
                source_file, year, week, chart_date, rank, rank_raw, artist,
                title, artist_key, title_key, matched_track_id, imported_at
             ) VALUES (
                'norsk.csv', 1987, 47, '1987-11-16', 1, '1', 'Pet Shop Boys',
                'What Have I Done to Deserve This?', 'pet shop boys',
                'what have i done to deserve this', ?1, '2026-08-11T00:00:00Z'
             )",
            [track_id],
        )
        .expect("insert Norsktoppen chart row");

        let highlights =
            artist_track_highlights(&conn, "pet shop boys").expect("artist highlights");

        assert_eq!(highlights.loved_tracks.len(), 1);
        assert_eq!(highlights.chart_tracks.len(), 1);
        assert_eq!(
            highlights.chart_tracks[0]
                .charts
                .iter()
                .map(|history| history.chart.as_str())
                .collect::<Vec<_>>(),
            vec![
                "billboard",
                "officialUk",
                "vgLista",
                "tiISkuddet",
                "norsktoppen"
            ]
        );
        assert_eq!(highlights.chart_tracks[0].charts[0].weeks_on_chart, None);
        assert_eq!(highlights.chart_tracks[0].charts[1].weeks_on_chart, Some(2));
        assert_eq!(highlights.chart_tracks[0].charts[1].peak, 4);
        assert_eq!(
            highlights.chart_tracks[0].charts[1].end_date.as_deref(),
            Some("1987-10-29")
        );
    }

    #[test]
    fn normalizes_dash_variants_in_artist_summaries_and_filters() {
        let conn = seeded_connection();
        conn.execute(
            "
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score
            ) VALUES (
                'mb:rejects-old', 1, 'rejects-old', 'Move Along', 'The All-American Rejects',
                'Pop Punk', 'pop punk', 'Interscope', 2005, 2005,
                14, 14, 1.0, 2800, 4, 600, 0.214, 82, 413.0
            ),
            (
                'mb:rejects-new', 1, 'rejects-new', 'Kids in the Street', 'The All\u{2010}American Rejects',
                'Alternative Rock', 'alternative rock', 'Interscope', 2012, 2012,
                16, 0, 0.0, 3200, 0, 0, 0.0, NULL, NULL
            )
            ",
            [],
        )
        .expect("insert dash variant albums");

        let mut request = ArtistListRequest::default();
        request.search_text = "All-American".to_string();
        let artists = list_artists(&conn, request, 50).expect("list normalized artists");

        assert_eq!(artists.total, 1);
        assert_eq!(artists.rows[0].id, "the all-american rejects");
        assert_eq!(artists.rows[0].album_count, 2);
        assert_eq!(artists.rows[0].track_count, 30);
        assert_eq!(artists.rows[0].first_year, Some(2005));
        assert_eq!(artists.rows[0].last_year, Some(2012));

        let mut browse = BrowseRequest::default();
        browse.filters.artist_keys = vec!["The All\u{2010}American Rejects".to_string()];
        let response = search_library(&conn, browse, 50).expect("search normalized artist albums");

        assert_eq!(response.total, 2);
    }

    #[test]
    fn normalizes_unicode_case_in_artist_summaries_and_filters() {
        let conn = seeded_connection();
        conn.execute(
            "
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score
            ) VALUES (
                'mb:ostro-430', 1, 'ostro-430',
                'Keine Krise kann mich schocken: Die kompletten Studioaufnahmen 1981–1983',
                'Östro 430', 'New Wave', 'new wave', 'Tapete Records', 2020, 2020,
                24, 0, 0.0, 4128, 0, 0, 0.0, NULL, NULL
            )
            ",
            [],
        )
        .expect("insert Unicode artist album");

        let mut request = ArtistListRequest::default();
        request.search_text = "Östro 430".to_string();
        let artists = list_artists(&conn, request, 50).expect("list Unicode artist");

        assert_eq!(artists.total, 1);
        assert_eq!(artists.rows[0].id, "östro 430");
        assert_eq!(artists.rows[0].name, "Östro 430");
        assert_eq!(artists.rows[0].album_count, 1);

        let mut browse = BrowseRequest::default();
        browse.filters.artist_keys = vec![artists.rows[0].id.clone()];
        let response = search_library(&conn, browse, 50).expect("search Unicode artist albums");

        assert_eq!(response.total, 1);
        assert_eq!(
            response.rows[0].album.as_deref(),
            Some("Keine Krise kann mich schocken: Die kompletten Studioaufnahmen 1981–1983")
        );
    }

    #[test]
    fn lists_genre_summaries_and_filters_albums_by_genre_key() {
        let conn = seeded_connection();
        let genres = list_genres(&conn, GenreListRequest::default(), 50).expect("list genres");

        assert_eq!(genres.total, 1);
        assert_eq!(genres.rows[0].id, "synthpop");
        assert_eq!(genres.rows[0].name, "Synthpop");
        assert_eq!(genres.rows[0].album_count, 1);
        assert_eq!(genres.rows[0].track_count, 10);
        assert_eq!(genres.rows[0].top_artist.as_deref(), Some("Pet Shop Boys"));

        let mut request = BrowseRequest::default();
        request.filters.genres = vec![genres.rows[0].id.clone()];
        let response = search_library(&conn, request, 50).expect("search genre albums");

        assert_eq!(response.total, 1);
        assert_eq!(
            response.rows[0].canonical_genre.as_deref(),
            Some("Synthpop")
        );
    }

    #[test]
    fn lists_genre_suggestion_names() {
        let conn = seeded_connection();
        let genres = genre_suggestion_names(&conn).expect("list genre suggestion names");

        assert_eq!(genres, vec!["Synthpop"]);
    }

    #[test]
    fn builds_filtered_genre_timeline_with_album_points() {
        let conn = seeded_connection();
        conn.execute(
            "
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score
            ) VALUES
            (
                'mb:score-1', 1, 'score-1', 'Action One', 'Example Composer',
                'Action', 'action', 'Example', 2024, 2024,
                12, 12, 1.0, 3600, 0, 0, 0.0, 90, 90.0
            ),
            (
                'mb:score-2', 1, 'score-2', 'Action Two', 'Example Composer',
                'Action', 'action', 'Example', 2025, 2025,
                12, 12, 1.0, 3600, 0, 0, 0.0, 90, 90.0
            ),
            (
                'mb:score-3', 1, 'score-3', 'Action Three', 'Example Composer',
                'Action', 'action', 'Example', 2025, 2025,
                12, 12, 1.0, 3600, 0, 0, 0.0, 90, 90.0
            ),
            (
                'mb:score-4', 1, 'score-4', 'Action Four', 'Example Composer',
                'Action', 'action', 'Example', 2026, 2026,
                12, 12, 1.0, 3600, 0, 0, 0.0, 90, 90.0
            )
            ",
            [],
        )
        .expect("insert timeline score albums");

        let timeline = genre_timeline(
            &conn,
            GenreTimelineRequest {
                year_from: Some(2020),
                year_to: Some(2026),
                genres: vec!["scores".to_string()],
                excluded_genres: Vec::new(),
                genre_limit: 12,
                album_point_limit: 2,
            },
        )
        .expect("load score timeline");

        assert_eq!(timeline.matching_album_count, 4);
        assert_eq!(timeline.matching_genre_count, 1);
        assert_eq!(timeline.genres.len(), 1);
        assert_eq!(timeline.genres[0].id, "action");
        assert_eq!(timeline.genres[0].peak_year, 2025);
        assert_eq!(timeline.genres[0].peak_album_count, 2);
        assert_eq!(timeline.year_counts.len(), 3);
        assert_eq!(timeline.albums.len(), 2);
        assert_eq!(timeline.available_year_from, Some(1987));
        assert_eq!(timeline.available_year_to, Some(2026));

        let without_scores = genre_timeline(
            &conn,
            GenreTimelineRequest {
                excluded_genres: vec!["scores".to_string()],
                ..GenreTimelineRequest::default()
            },
        )
        .expect("load timeline without scores");
        assert_eq!(without_scores.matching_album_count, 1);
        assert_eq!(without_scores.genres[0].id, "synthpop");
    }

    #[test]
    fn builds_artist_career_peaks_with_weighted_chart_data() {
        let conn = seeded_connection();
        conn.execute(
            "
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score,
                billboard_rank, official_uk_rank, vg_lista_rank
            ) VALUES
            (
                'mb:kate-1', 1, 'kate-1', 'The Kick Inside', 'Kate Bush',
                'Art Pop', 'art pop', 'EMI', 1978, 1978,
                13, 13, 1.0, 2600, 2, 500, 0.2, 92, 140.0,
                30, 3, NULL
            ),
            (
                'mb:kate-2', 1, 'kate-2', 'Hounds of Love', 'Kate Bush',
                'Art Pop', 'art pop', 'EMI', 1985, 1985,
                12, 12, 1.0, 2800, 4, 800, 0.3, 96, 240.0,
                12, 1, 4
            )
            ",
            [],
        )
        .expect("insert artist timeline albums");

        let timeline = artist_timeline(
            &conn,
            ArtistTimelineRequest {
                year_from: Some(1970),
                year_to: Some(1990),
                artists: vec!["Kate Bush".to_string()],
                ..ArtistTimelineRequest::default()
            },
        )
        .expect("load artist timeline");

        assert_eq!(timeline.matching_artist_count, 1);
        assert_eq!(timeline.matching_album_count, 2);
        assert_eq!(timeline.artists[0].name, "Kate Bush");
        assert_eq!(timeline.artists[0].first_year, 1978);
        assert_eq!(timeline.albums.len(), 2);
        assert!(timeline.albums[1].chart_peak > timeline.albums[0].chart_peak);
        assert_eq!(timeline.albums[1].official_uk_rank, Some(1));
    }

    #[test]
    fn pooled_readers_support_catalog_browsing_and_provider_cache_reads() {
        let source = seeded_connection();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("catalog.sqlite3");
        source
            .execute("VACUUM INTO ?1", [path.to_str().unwrap()])
            .unwrap();
        let pool = pool_for_path(&path).unwrap();
        let conn = pool.checkout(lifecycle::Access::Read).unwrap();
        assert_eq!(
            search_library(&conn, BrowseRequest::default(), 50)
                .unwrap()
                .total,
            1
        );
        list_artists(&conn, ArtistListRequest::default(), 50).unwrap();
        list_genres(&conn, GenreListRequest::default(), 50).unwrap();
        statistics(&conn).unwrap();
        catalog_revision(&conn).unwrap();
        settings_for_connection(&conn).unwrap();
        artist_biography_cache(&conn, "pet shop boys").unwrap();
        album_review_cache(&conn, "mb:test").unwrap();
        assert!(conn.execute("DELETE FROM tracks", []).is_err());
    }
}
