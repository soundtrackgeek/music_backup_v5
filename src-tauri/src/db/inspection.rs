use super::*;

pub(super) fn inspect_current_view(
    conn: &Connection,
    request: &BrowseRequest,
    scope_limit: Option<u32>,
    inspection: &ViewInspectionRequest,
) -> Result<ViewInspectionResult> {
    if inspection.requests.is_empty() || inspection.requests.len() > 3 {
        bail!("Current-view inspection requires one to three bounded requests.")
    }
    let requested_named_rows = inspection
        .requests
        .iter()
        .filter(|item| item.operation == "list")
        .map(|item| item.limit.min(50))
        .sum::<u32>();
    if requested_named_rows > 50 {
        bail!("Current-view inspection cannot request more than 50 named rows in total.")
    }

    let scoped_request = if let Some(scope_limit) = scope_limit {
        let scope_limit = scope_limit.clamp(1, 500);
        let mut cohort_request = request.clone();
        cohort_request.offset = 0;
        cohort_request.limit = scope_limit;
        let cohort = search_library(conn, cohort_request, scope_limit)
            .context("Could not resolve the ranked chart scope for Luna")?;
        let mut scoped = request.clone();
        scoped.limit = scope_limit;
        if normalize_view(&request.view) == "tracks" {
            scoped.filters.track_ids = cohort.rows.iter().filter_map(|row| row.track_id).collect();
        } else {
            scoped.filters.album_ids = cohort.rows.iter().map(|row| row.album_id.clone()).collect();
        }
        Some(scoped)
    } else {
        None
    };
    let request = scoped_request.as_ref().unwrap_or(request);
    let view = normalize_view(&request.view);
    let is_tracks = view == "tracks";
    let from_sql = current_view_from_sql(is_tracks);
    let (where_sql, values) = build_where_clause(is_tracks, &request.search_text, &request.filters);
    let count_sql = format!("SELECT COUNT(*) {from_sql} {where_sql}");
    let matching_rows = conn
        .query_row(&count_sql, params_from_iter(values.iter()), |row| {
            row.get(0)
        })
        .context("Could not count the current view for Luna")?;

    let mut analyses = Vec::with_capacity(inspection.requests.len());
    let mut named_rows_shared = 0usize;
    for item in &inspection.requests {
        let analysis = match item.operation.as_str() {
            "overview" => current_view_overview(conn, is_tracks, &from_sql, &where_sql, &values)?,
            "group" => current_view_groups(conn, is_tracks, &from_sql, &where_sql, &values, item)?,
            "list" => {
                let (analysis, row_count) = current_view_list(conn, request, item)?;
                named_rows_shared += row_count;
                analysis
            }
            _ => bail!("Luna requested an unsupported current-view inspection operation."),
        };
        analyses.push(analysis);
    }

    Ok(ViewInspectionResult {
        payload: serde_json::json!({
            "scope": {
                "view": view,
                "matchingRows": matching_rows,
                "mode": if scope_limit.is_some() { "rankedLimit" } else { "allMatches" },
                "resultLimit": scope_limit,
                "note": "All filters and SQLite queries remained local. This payload contains only the requested compact inspection."
            },
            "analyses": analyses
        }),
        matching_rows,
        analysis_count: inspection.requests.len(),
        named_rows_shared,
    })
}

pub(super) fn current_view_from_sql(is_tracks: bool) -> String {
    let origin_key_sql = artist_key_sql("a.album_artist_display");
    if is_tracks {
        format!(
            "FROM tracks t LEFT JOIN albums a ON a.id = t.album_id LEFT JOIN musicbrainz_artist_origin_countries origin ON origin.local_artist_key = {origin_key_sql} LEFT JOIN musicbrainz_artist_infos info ON info.local_artist_key = {origin_key_sql}"
        )
    } else {
        format!(
            "FROM albums a LEFT JOIN musicbrainz_artist_origin_countries origin ON origin.local_artist_key = {origin_key_sql} LEFT JOIN musicbrainz_artist_infos info ON info.local_artist_key = {origin_key_sql}"
        )
    }
}

pub(super) fn current_view_overview(
    conn: &Connection,
    is_tracks: bool,
    from_sql: &str,
    where_sql: &str,
    values: &[Value],
) -> Result<serde_json::Value> {
    let year = if is_tracks { "t.year" } else { "a.year" };
    let duration = if is_tracks {
        "NULLIF(t.time_seconds, 0)"
    } else {
        "NULLIF(a.total_seconds, 0)"
    };
    let rating = if is_tracks {
        "t.normalized_rating"
    } else {
        "a.effective_album_rating"
    };
    let artist = if is_tracks {
        "COALESCE(NULLIF(TRIM(t.display_artist), ''), NULLIF(TRIM(t.album_artist_display), ''))"
    } else {
        "NULLIF(TRIM(a.album_artist_display), '')"
    };
    let genre = if is_tracks {
        "NULLIF(TRIM(COALESCE(t.canonical_genre, a.canonical_genre)), '')"
    } else {
        "NULLIF(TRIM(a.canonical_genre), '')"
    };
    let loved = if is_tracks {
        "CASE WHEN t.love = 'L' THEN 1 ELSE 0 END"
    } else {
        "COALESCE(a.loved_tracks, 0)"
    };
    let distinct_albums = if is_tracks {
        "COUNT(DISTINCT t.album_id)"
    } else {
        "COUNT(*)"
    };
    let unrated = format!("SUM(CASE WHEN {rating} IS NULL THEN 1 ELSE 0 END)");
    let partial = if is_tracks {
        "0".to_string()
    } else {
        "SUM(CASE WHEN a.effective_album_rating IS NOT NULL AND COALESCE(a.rating_completeness, 0) < 0.999999 THEN 1 ELSE 0 END)".to_string()
    };
    let sql = format!(
        "
        SELECT
            COUNT(*),
            {distinct_albums},
            COUNT(DISTINCT {artist}),
            COUNT(DISTINCT {genre}),
            MIN({year}),
            MAX({year}),
            AVG({year}),
            SUM({duration}) / 60.0,
            AVG({duration}) / 60.0,
            MIN({duration}) / 60.0,
            MAX({duration}) / 60.0,
            AVG({rating}),
            AVG(a.album_score),
            AVG(a.rating_completeness) * 100.0,
            SUM({loved}),
            {unrated},
            {partial}
        {from_sql} {where_sql}"
    );
    conn.query_row(&sql, params_from_iter(values.iter()), |row| {
        Ok(serde_json::json!({
            "operation": "overview",
            "entityCount": row.get::<_, i64>(0)?,
            "distinctAlbums": row.get::<_, i64>(1)?,
            "distinctArtists": row.get::<_, i64>(2)?,
            "distinctGenres": row.get::<_, i64>(3)?,
            "firstYear": row.get::<_, Option<i32>>(4)?,
            "lastYear": row.get::<_, Option<i32>>(5)?,
            "averageYear": row.get::<_, Option<f64>>(6)?,
            "totalMinutes": row.get::<_, Option<f64>>(7)?,
            "averageMinutes": row.get::<_, Option<f64>>(8)?,
            "shortestMinutes": row.get::<_, Option<f64>>(9)?,
            "longestMinutes": row.get::<_, Option<f64>>(10)?,
            "averageRating": row.get::<_, Option<f64>>(11)?,
            "averageAlbumScore": row.get::<_, Option<f64>>(12)?,
            "averageRatingCompletenessPercent": row.get::<_, Option<f64>>(13)?,
            "lovedCount": row.get::<_, Option<i64>>(14)?.unwrap_or(0),
            "unratedCount": row.get::<_, Option<i64>>(15)?.unwrap_or(0),
            "partiallyRatedAlbumCount": row.get::<_, Option<i64>>(16)?.unwrap_or(0)
        }))
    })
    .context("Could not summarize the current view for Luna")
}

pub(super) fn current_view_groups(
    conn: &Connection,
    is_tracks: bool,
    from_sql: &str,
    where_sql: &str,
    values: &[Value],
    item: &ViewInspectionItem,
) -> Result<serde_json::Value> {
    let year = if is_tracks { "t.year" } else { "a.year" };
    let label = match item.group_by.as_str() {
        "artist" if is_tracks => "COALESCE(NULLIF(TRIM(t.display_artist), ''), NULLIF(TRIM(t.album_artist_display), ''), 'Unknown')".to_string(),
        "artist" => "COALESCE(NULLIF(TRIM(a.album_artist_display), ''), 'Unknown')".to_string(),
        "genre" if is_tracks => "COALESCE(NULLIF(TRIM(t.canonical_genre), ''), NULLIF(TRIM(a.canonical_genre), ''), 'Unknown')".to_string(),
        "genre" => "COALESCE(NULLIF(TRIM(a.canonical_genre), ''), 'Unknown')".to_string(),
        "year" => format!("COALESCE(CAST({year} AS TEXT), 'Unknown')"),
        "decade" => format!("CASE WHEN {year} IS NULL THEN 'Unknown' ELSE CAST(({year} / 10) * 10 AS TEXT) || 's' END"),
        "country" => "COALESCE(NULLIF(TRIM(origin.country_name), ''), NULLIF(TRIM(origin.country_code), ''), 'Unknown')".to_string(),
        "publisher" if is_tracks => "COALESCE(NULLIF(TRIM(t.publisher), ''), NULLIF(TRIM(a.publisher), ''), 'Unknown')".to_string(),
        "publisher" => "COALESCE(NULLIF(TRIM(a.publisher), ''), 'Unknown')".to_string(),
        "ratingStatus" if is_tracks => "CASE WHEN t.normalized_rating IS NULL THEN 'Unrated' ELSE 'Rated' END".to_string(),
        "ratingStatus" => "CASE WHEN a.effective_album_rating IS NULL THEN 'Unrated' WHEN COALESCE(a.rating_completeness, 0) < 0.999999 THEN 'Partially rated' ELSE 'Fully rated' END".to_string(),
        _ => bail!("Luna requested an unsupported current-view grouping."),
    };
    let duration = if is_tracks {
        "NULLIF(t.time_seconds, 0)"
    } else {
        "NULLIF(a.total_seconds, 0)"
    };
    let rating = if is_tracks {
        "t.normalized_rating"
    } else {
        "a.effective_album_rating"
    };
    let loved = if is_tracks {
        "CASE WHEN t.love = 'L' THEN 1 ELSE 0 END"
    } else {
        "COALESCE(a.loved_tracks, 0)"
    };
    let sort = match item.sort_by.as_str() {
        "label" => "label COLLATE NOCASE",
        "year" => "minimum_year",
        "duration" => "average_minutes",
        "rating" => "average_rating",
        "score" => "average_album_score",
        "completeness" => "average_completeness",
        "loved" => "loved_count",
        "current" | "count" => "item_count",
        _ => bail!("Luna requested an unsupported group sort."),
    };
    let direction = if item.direction.eq_ignore_ascii_case("asc") {
        "ASC"
    } else {
        "DESC"
    };
    let limit = item.limit.clamp(1, 20);
    let sql = format!(
        "
        SELECT
            {label} AS label,
            COUNT(*) AS item_count,
            AVG({rating}) AS average_rating,
            AVG(a.album_score) AS average_album_score,
            AVG({duration}) / 60.0 AS average_minutes,
            AVG(a.rating_completeness) * 100.0 AS average_completeness,
            SUM({loved}) AS loved_count,
            MIN({year}) AS minimum_year,
            MAX({year}) AS maximum_year
        {from_sql} {where_sql}
        GROUP BY {label}
        ORDER BY {sort} {direction}, label COLLATE NOCASE ASC
        LIMIT ?"
    );
    let mut query_values = values.to_vec();
    query_values.push(Value::Integer(i64::from(limit)));
    let mut statement = conn.prepare(&sql)?;
    let groups = statement
        .query_map(params_from_iter(query_values.iter()), |row| {
            let label = row.get::<_, String>(0)?;
            Ok(serde_json::json!({
                "label": bounded_view_text(Some(&label)).unwrap_or_else(|| "Unknown".to_string()),
                "count": row.get::<_, i64>(1)?,
                "averageRating": row.get::<_, Option<f64>>(2)?,
                "averageAlbumScore": row.get::<_, Option<f64>>(3)?,
                "averageMinutes": row.get::<_, Option<f64>>(4)?,
                "averageCompletenessPercent": row.get::<_, Option<f64>>(5)?,
                "lovedCount": row.get::<_, Option<i64>>(6)?.unwrap_or(0),
                "firstYear": row.get::<_, Option<i32>>(7)?,
                "lastYear": row.get::<_, Option<i32>>(8)?
            }))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not group the current view for Luna")?;

    Ok(serde_json::json!({
        "operation": "group",
        "groupBy": item.group_by,
        "sortBy": item.sort_by,
        "direction": direction.to_lowercase(),
        "limit": limit,
        "groups": groups
    }))
}

pub(super) fn current_view_list(
    conn: &Connection,
    request: &BrowseRequest,
    item: &ViewInspectionItem,
) -> Result<(serde_json::Value, usize)> {
    let is_tracks = normalize_view(&request.view) == "tracks";
    let mut list_request = request.clone();
    list_request.offset = 0;
    list_request.limit = item.limit.clamp(1, 50);
    list_request.sort = current_view_list_sort(is_tracks, &request.sort, item)?;
    let response = search_library(conn, list_request, 50)?;
    let rows = response
        .rows
        .iter()
        .map(|row| {
            serde_json::json!({
                "name": bounded_view_text(if is_tracks { row.title.as_deref() } else { row.album.as_deref() }),
                "album": bounded_view_text(row.album.as_deref()),
                "artist": bounded_view_text(if is_tracks { row.display_artist.as_deref().or(row.album_artist_display.as_deref()) } else { row.album_artist_display.as_deref() }),
                "albumArtist": bounded_view_text(row.album_artist_display.as_deref()),
                "year": row.year,
                "genre": bounded_view_text(row.canonical_genre.as_deref()),
                "minutes": if is_tracks { row.track_seconds.map(|value| value as f64 / 60.0) } else { row.total_seconds.map(|value| value as f64 / 60.0) },
                "rating": if is_tracks { row.normalized_rating } else { row.effective_album_rating },
                "albumScore": row.album_score,
                "ratingCompletenessPercent": row.rating_completeness.map(|value| value * 100.0),
                "lovedCount": if is_tracks { i64::from(row.love.as_deref() == Some("L")) } else { row.loved_tracks.unwrap_or(0) }
            })
        })
        .collect::<Vec<_>>();
    let row_count = rows.len();

    Ok((
        serde_json::json!({
            "operation": "list",
            "sortBy": item.sort_by,
            "direction": current_view_list_direction(item, &request.sort),
            "limit": item.limit.clamp(1, 50),
            "rows": rows
        }),
        row_count,
    ))
}

pub(super) fn current_view_list_sort(
    is_tracks: bool,
    current: &BrowseSort,
    item: &ViewInspectionItem,
) -> Result<BrowseSort> {
    if matches!(item.sort_by.as_str(), "current" | "count") {
        return Ok(current.clone());
    }
    let field = match item.sort_by.as_str() {
        "label" => {
            if is_tracks {
                "title"
            } else {
                "album"
            }
        }
        "year" => "year",
        "duration" => {
            if is_tracks {
                "time"
            } else {
                "totalMinutes"
            }
        }
        "rating" => {
            if is_tracks {
                "trackRating"
            } else {
                "albumRating"
            }
        }
        "score" => "albumScore",
        "completeness" => "ratingCompleteness",
        "loved" => "lovedTracks",
        _ => bail!("Luna requested an unsupported current-view list sort."),
    };
    Ok(BrowseSort {
        field: field.to_string(),
        direction: if item.direction.eq_ignore_ascii_case("asc") {
            "asc".to_string()
        } else {
            "desc".to_string()
        },
    })
}

pub(super) fn current_view_list_direction(
    item: &ViewInspectionItem,
    current: &BrowseSort,
) -> String {
    if item.sort_by == "current" {
        current.direction.clone()
    } else if item.direction.eq_ignore_ascii_case("asc") {
        "asc".to_string()
    } else {
        "desc".to_string()
    }
}

pub(super) fn bounded_view_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(160).collect())
}

pub(super) fn inspect_music_research_context(
    conn: &Connection,
    context: &AiMusicResearchContext,
    inspection: &MusicResearchInspectionRequest,
) -> Result<MusicResearchInspectionResult> {
    let entity_type = context
        .selected_entity_type
        .as_deref()
        .context("No album, artist, or genre is selected for local inspection.")?;
    let entity_id = context
        .selected_entity_id
        .as_deref()
        .context("The selected local music context has no ID.")?;
    let label = context
        .selected_label
        .as_deref()
        .context("The selected local music context has no label.")?;
    let limit = inspection.limit.clamp(1, 20);
    let ordering = match inspection.ordering.as_str() {
        "chronology" | "rating" | "score" | "loved" => inspection.ordering.as_str(),
        _ => bail!("Luna requested an unsupported local-library research ordering."),
    };

    let (summary, mut request, item_kind) = match entity_type {
        "album" => {
            let summary = research_album_summary(conn, entity_id)?;
            let mut request = BrowseRequest {
                view: "tracks".to_string(),
                limit,
                ..BrowseRequest::default()
            };
            request.filters.album_ids = vec![entity_id.to_string()];
            request.sort = BrowseSort {
                field: match ordering {
                    "chronology" => "trackNumber",
                    _ => "trackRating",
                }
                .to_string(),
                direction: if ordering == "chronology" {
                    "asc"
                } else {
                    "desc"
                }
                .to_string(),
            };
            (summary, request, "tracks")
        }
        "artist" => {
            let summary = research_artist_summary(conn, entity_id)?;
            let mut request = BrowseRequest {
                view: "albums".to_string(),
                limit,
                ..BrowseRequest::default()
            };
            request.filters.artist_keys = vec![entity_id.to_string()];
            request.sort = research_album_ordering(ordering);
            (summary, request, "albums")
        }
        "genre" => {
            let summary = research_genre_summary(conn, entity_id)?;
            let mut request = BrowseRequest {
                view: "albums".to_string(),
                limit,
                ..BrowseRequest::default()
            };
            request.filters.genres = vec![entity_id.to_string()];
            request.sort = research_album_ordering(ordering);
            (summary, request, "albums")
        }
        _ => bail!("Unsupported selected local music context."),
    };
    request.offset = 0;
    let response = search_library(conn, request, 20)?;
    let items = response
        .rows
        .iter()
        .map(|row| research_context_item(row, item_kind))
        .collect::<Vec<_>>();
    let named_rows_shared = items.len();

    Ok(MusicResearchInspectionResult {
        payload: json!({
            "selected": {
                "type": entity_type,
                "label": label,
                "subtitle": context.selected_subtitle
            },
            "summary": summary,
            "itemKind": item_kind,
            "matchingItemCount": response.total,
            "returnedItemCount": named_rows_shared,
            "ordering": ordering,
            "items": items
        }),
        named_rows_shared,
    })
}

pub(super) fn research_album_ordering(ordering: &str) -> BrowseSort {
    BrowseSort {
        field: match ordering {
            "chronology" => "year",
            "rating" => "albumRating",
            "loved" => "lovedTracks",
            _ => "albumScore",
        }
        .to_string(),
        direction: if ordering == "chronology" {
            "asc"
        } else {
            "desc"
        }
        .to_string(),
    }
}

pub(super) fn research_album_summary(
    conn: &Connection,
    album_id: &str,
) -> Result<serde_json::Value> {
    let row = conn
        .query_row(
            "
            SELECT album, album_artist_display, canonical_genre, year, total_tracks,
                   rated_tracks, rating_completeness, total_seconds, loved_tracks,
                   effective_album_rating, album_score
            FROM albums
            WHERE id = ?1
            ",
            params![album_id],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<i32>>(3)?,
                    row.get::<_, Option<i64>>(4)?,
                    row.get::<_, Option<i64>>(5)?,
                    row.get::<_, Option<f64>>(6)?,
                    row.get::<_, Option<i64>>(7)?,
                    row.get::<_, Option<i64>>(8)?,
                    row.get::<_, Option<i32>>(9)?,
                    row.get::<_, Option<f64>>(10)?,
                ))
            },
        )
        .optional()
        .context("Could not inspect the selected album for music research")?;
    Ok(match row {
        Some((
            album,
            artist,
            genre,
            year,
            total_tracks,
            rated_tracks,
            completeness,
            total_seconds,
            loved_tracks,
            rating,
            score,
        )) => json!({
            "found": true,
            "album": album,
            "artist": artist,
            "genre": genre,
            "year": year,
            "trackCount": total_tracks,
            "ratedTrackCount": rated_tracks,
            "ratingCompletenessPercent": completeness.map(|value| value * 100.0),
            "durationMinutes": total_seconds.map(|value| value as f64 / 60.0),
            "lovedTrackCount": loved_tracks,
            "albumRating": rating,
            "albumScore": score
        }),
        None => json!({ "found": false }),
    })
}

pub(super) fn research_artist_summary(
    conn: &Connection,
    artist_id: &str,
) -> Result<serde_json::Value> {
    let artist_key = artist_key_sql("album_artist_display");
    let sql = format!(
        "
        SELECT COUNT(*), COALESCE(SUM(total_tracks), 0), COALESCE(SUM(loved_tracks), 0),
               MIN(year), MAX(year), AVG(effective_album_rating), AVG(rating_completeness),
               AVG(album_score)
        FROM albums
        WHERE {artist_key} = ?1
        "
    );
    let (albums, tracks, loved, first_year, last_year, rating, completeness, score) = conn
        .query_row(&sql, params![artist_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, Option<i32>>(3)?,
                row.get::<_, Option<i32>>(4)?,
                row.get::<_, Option<f64>>(5)?,
                row.get::<_, Option<f64>>(6)?,
                row.get::<_, Option<f64>>(7)?,
            ))
        })
        .context("Could not inspect the selected artist for music research")?;
    Ok(json!({
        "albumCount": albums,
        "trackCount": tracks,
        "lovedTrackCount": loved,
        "firstAlbumYear": first_year,
        "lastAlbumYear": last_year,
        "averageAlbumRating": rating,
        "averageRatingCompletenessPercent": completeness.map(|value| value * 100.0),
        "averageAlbumScore": score
    }))
}

pub(super) fn research_genre_summary(
    conn: &Connection,
    genre_id: &str,
) -> Result<serde_json::Value> {
    let (albums, tracks, loved, first_year, last_year, rating, completeness, score) = conn
        .query_row(
            "
            SELECT COUNT(*), COALESCE(SUM(total_tracks), 0), COALESCE(SUM(loved_tracks), 0),
                   MIN(year), MAX(year), AVG(effective_album_rating), AVG(rating_completeness),
                   AVG(album_score)
            FROM albums
            WHERE COALESCE(NULLIF(TRIM(LOWER(genre_normalized)), ''), 'unknown') = ?1
            ",
            params![genre_id],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, Option<i32>>(3)?,
                    row.get::<_, Option<i32>>(4)?,
                    row.get::<_, Option<f64>>(5)?,
                    row.get::<_, Option<f64>>(6)?,
                    row.get::<_, Option<f64>>(7)?,
                ))
            },
        )
        .context("Could not inspect the selected genre for music research")?;
    Ok(json!({
        "albumCount": albums,
        "trackCount": tracks,
        "lovedTrackCount": loved,
        "firstAlbumYear": first_year,
        "lastAlbumYear": last_year,
        "averageAlbumRating": rating,
        "averageRatingCompletenessPercent": completeness.map(|value| value * 100.0),
        "averageAlbumScore": score
    }))
}

pub(super) fn research_context_item(row: &BrowseRow, item_kind: &str) -> serde_json::Value {
    if item_kind == "tracks" {
        return json!({
            "title": bounded_view_text(row.title.as_deref()),
            "artist": bounded_view_text(
                row.display_artist.as_deref().or(row.album_artist_display.as_deref())
            ),
            "trackNumber": row.track_number,
            "durationSeconds": row.track_seconds,
            "rating": row.normalized_rating,
            "loved": row.love.as_deref().is_some_and(|value| value.trim().eq_ignore_ascii_case("L"))
        });
    }

    json!({
        "album": bounded_view_text(row.album.as_deref()),
        "artist": bounded_view_text(row.album_artist_display.as_deref()),
        "genre": bounded_view_text(row.canonical_genre.as_deref()),
        "year": row.year,
        "trackCount": row.total_tracks,
        "durationMinutes": row.total_seconds.map(|value| value as f64 / 60.0),
        "albumRating": row.effective_album_rating,
        "ratingCompletenessPercent": row.rating_completeness.map(|value| value * 100.0),
        "lovedTrackCount": row.loved_tracks,
        "albumScore": row.album_score
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::*;

    #[test]
    fn research_context_inspection_returns_only_bounded_safe_genre_rows() {
        let conn = seeded_connection();
        let context = AiMusicResearchContext {
            workspace: "Genres".to_string(),
            selected_entity_type: Some("genre".to_string()),
            selected_entity_id: Some("synthpop".to_string()),
            selected_label: Some("Synthpop".to_string()),
            selected_subtitle: Some("1 album in your library".to_string()),
        };
        let result = inspect_music_research_context(
            &conn,
            &context,
            &MusicResearchInspectionRequest {
                ordering: "score".to_string(),
                limit: 20,
            },
        )
        .expect("inspect selected genre");

        assert_eq!(result.named_rows_shared, 1);
        assert_eq!(result.payload["summary"]["albumCount"], 1);
        assert_eq!(result.payload["items"][0]["album"], "Actually");
        let serialized = result.payload.to_string();
        assert!(!serialized.contains("filePath"));
        assert!(!serialized.contains("filename"));
        assert!(!serialized.contains("D:\\\\Music"));
    }

    #[test]
    fn current_view_named_lists_can_return_more_than_twenty_rows_but_not_more_than_fifty() {
        let conn = seeded_connection();
        for index in 0..25 {
            insert_test_album(
                &conn,
                &format!("mb:list-{index}"),
                "List Artist",
                &format!("List Album {index:02}"),
                2000 + index,
                10,
            );
        }
        let inspection = ViewInspectionRequest {
            row_limit: None,
            requests: vec![ViewInspectionItem {
                operation: "list".to_string(),
                group_by: "artist".to_string(),
                sort_by: "label".to_string(),
                direction: "asc".to_string(),
                limit: 50,
            }],
        };

        let result = inspect_current_view(&conn, &BrowseRequest::default(), None, &inspection)
            .expect("inspect a bounded named list");

        assert_eq!(result.matching_rows, 26);
        assert_eq!(result.named_rows_shared, 26);
        assert_eq!(result.payload["analyses"][0]["limit"], 50);
        assert_eq!(
            result.payload["analyses"][0]["rows"]
                .as_array()
                .expect("named rows")
                .len(),
            26
        );

        let over_limit = ViewInspectionRequest {
            row_limit: None,
            requests: vec![
                ViewInspectionItem {
                    operation: "list".to_string(),
                    group_by: "artist".to_string(),
                    sort_by: "label".to_string(),
                    direction: "asc".to_string(),
                    limit: 30,
                },
                ViewInspectionItem {
                    operation: "list".to_string(),
                    group_by: "artist".to_string(),
                    sort_by: "year".to_string(),
                    direction: "asc".to_string(),
                    limit: 30,
                },
            ],
        };
        assert!(inspect_current_view(&conn, &BrowseRequest::default(), None, &over_limit).is_err());
    }

    #[test]
    fn inspects_the_filtered_view_with_bounded_local_aggregates_and_rows() {
        let conn = seeded_connection();
        conn.execute(
            "
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score
            ) VALUES (
                'mb:second', 1, 'second', 'Introspective', 'Pet Shop Boys',
                'Synthpop', 'synthpop', 'Parlophone', 1988, 1988,
                10, 0, 0.0, 3000, 0, 0, 0.0, NULL, NULL
            )
            ",
            [],
        )
        .expect("insert second album");
        let inspection = ViewInspectionRequest {
            row_limit: None,
            requests: vec![
                ViewInspectionItem {
                    operation: "overview".to_string(),
                    group_by: "artist".to_string(),
                    sort_by: "count".to_string(),
                    direction: "desc".to_string(),
                    limit: 10,
                },
                ViewInspectionItem {
                    operation: "group".to_string(),
                    group_by: "artist".to_string(),
                    sort_by: "count".to_string(),
                    direction: "desc".to_string(),
                    limit: 10,
                },
                ViewInspectionItem {
                    operation: "list".to_string(),
                    group_by: "artist".to_string(),
                    sort_by: "score".to_string(),
                    direction: "desc".to_string(),
                    limit: 1,
                },
            ],
        };

        let result = inspect_current_view(&conn, &BrowseRequest::default(), None, &inspection)
            .expect("inspect current album view");

        assert_eq!(result.matching_rows, 2);
        assert_eq!(result.analysis_count, 3);
        assert_eq!(result.named_rows_shared, 1);
        assert_eq!(result.payload["analyses"][0]["entityCount"], 2);
        assert_eq!(result.payload["analyses"][0]["unratedCount"], 1);
        assert_eq!(
            result.payload["analyses"][1]["groups"][0]["label"],
            "Pet Shop Boys"
        );
        assert_eq!(result.payload["analyses"][1]["groups"][0]["count"], 2);
        assert_eq!(result.payload["analyses"][2]["rows"][0]["name"], "Actually");
        let serialized = serde_json::to_string(&result.payload).unwrap();
        assert!(!serialized.contains("\"filePath\":"));
        assert!(!serialized.contains("\"filename\":"));
        assert!(!serialized.contains("D:\\\\Music"));
        assert!(!serialized.contains("02 What Have I Done.mp3"));

        let mut empty_request = BrowseRequest::default();
        empty_request.filters.year_from = Some(1900);
        empty_request.filters.year_to = Some(1900);
        let empty_inspection = ViewInspectionRequest {
            row_limit: None,
            requests: vec![ViewInspectionItem {
                operation: "overview".to_string(),
                group_by: "artist".to_string(),
                sort_by: "count".to_string(),
                direction: "desc".to_string(),
                limit: 10,
            }],
        };
        let empty = inspect_current_view(&conn, &empty_request, None, &empty_inspection)
            .expect("inspect empty current view");
        assert_eq!(empty.matching_rows, 0);
        assert_eq!(empty.payload["analyses"][0]["unratedCount"], 0);
        assert_eq!(empty.payload["analyses"][0]["partiallyRatedAlbumCount"], 0);
    }

    #[test]
    fn chart_current_view_inspection_stays_inside_the_ranked_result_limit() {
        let conn = seeded_connection();
        insert_test_album(
            &conn,
            "mb:chart-middle",
            "Middle Artist",
            "Middle Album",
            2020,
            10,
        );
        insert_test_album(
            &conn,
            "mb:chart-newest",
            "Newest Artist",
            "Newest Album",
            2025,
            10,
        );
        let mut request = BrowseRequest::default();
        request.limit = 2;
        request.sort = BrowseSort {
            field: "year".to_string(),
            direction: "desc".to_string(),
        };
        let inspection = ViewInspectionRequest {
            row_limit: Some(2),
            requests: vec![
                ViewInspectionItem {
                    operation: "overview".to_string(),
                    group_by: "artist".to_string(),
                    sort_by: "count".to_string(),
                    direction: "desc".to_string(),
                    limit: 10,
                },
                ViewInspectionItem {
                    operation: "group".to_string(),
                    group_by: "artist".to_string(),
                    sort_by: "label".to_string(),
                    direction: "asc".to_string(),
                    limit: 10,
                },
                ViewInspectionItem {
                    operation: "list".to_string(),
                    group_by: "artist".to_string(),
                    sort_by: "label".to_string(),
                    direction: "asc".to_string(),
                    limit: 10,
                },
            ],
        };

        let result = inspect_current_view(&conn, &request, Some(2), &inspection)
            .expect("inspect the ranked chart cohort");

        assert_eq!(result.matching_rows, 2);
        assert_eq!(result.payload["scope"]["mode"], "rankedLimit");
        assert_eq!(result.payload["scope"]["resultLimit"], 2);
        assert_eq!(result.payload["analyses"][0]["entityCount"], 2);
        let serialized = serde_json::to_string(&result.payload).unwrap();
        assert!(serialized.contains("Middle Artist"));
        assert!(serialized.contains("Newest Artist"));
        assert!(!serialized.contains("Pet Shop Boys"));
    }
}
