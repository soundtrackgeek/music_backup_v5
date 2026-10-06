use super::*;

#[cfg(not(test))]
pub fn list_import_runs_for_app(app: &AppHandle, limit: u32) -> Result<Vec<ImportRun>> {
    let (conn, _) = open_read(app)?;
    list_import_runs(&conn, limit)
}

#[cfg(not(test))]
pub fn catalog_revision_for_app(app: &AppHandle) -> Result<String> {
    let db_path = database_path(app)?;
    if !db_path.exists() {
        return Ok("0:0:".to_string());
    }

    let (conn, _) = open_read(app)?;
    conn.busy_timeout(Duration::from_millis(250))?;
    catalog_revision(&conn)
}

#[cfg(not(test))]
pub fn statistics_for_app(app: &AppHandle) -> Result<StatisticsResponse> {
    let (conn, _) = open_read(app)?;
    statistics(&conn)
}

#[cfg(not(test))]
pub fn year_progress_for_app(
    app: &AppHandle,
    request: YearProgressRequest,
) -> Result<Vec<YearProgressStats>> {
    let (conn, _) = open_read(app)?;
    year_progress_stats_filtered(&conn, &request)
}

#[cfg(not(test))]
pub fn genre_progress_for_app(
    app: &AppHandle,
    request: GenreProgressRequest,
) -> Result<Vec<GenreProgressStats>> {
    let (conn, _) = open_read(app)?;
    genre_progress_stats_filtered(&conn, &request)
}

#[cfg(not(test))]
pub fn library_profile_for_app(
    app: &AppHandle,
    request: &LibraryProfileRequest,
) -> Result<LibraryProfileResult> {
    let (conn, _) = open_read(app)?;
    library_profile(&conn, request)
}

pub fn list_import_runs(conn: &Connection, limit: u32) -> Result<Vec<ImportRun>> {
    let mut stmt = conn.prepare(
        "
        SELECT id, source_path, source_size_bytes, started_at, completed_at, status,
               track_rows, album_count, duration_ms, backup_path, error_message,
               added_tracks, changed_tracks, removed_tracks, added_albums,
               changed_albums, removed_albums, rating_events_count
        FROM import_runs
        ORDER BY id DESC
        LIMIT ?1
        ",
    )?;

    let runs = stmt
        .query_map(params![limit], import_run_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(runs)
}

pub fn catalog_revision(conn: &Connection) -> Result<String> {
    let (completed_count, latest_id, latest_completion): (i64, i64, String) = conn
        .query_row(
            "SELECT COUNT(*),
                    COALESCE(MAX(id), 0),
                    COALESCE(MAX(COALESCE(completed_at, started_at)), '')
             FROM import_runs
             WHERE status = 'completed'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .context("Could not read the completed catalog revision")?;

    Ok(format!("{completed_count}:{latest_id}:{latest_completion}"))
}

pub(super) fn statistics(conn: &Connection) -> Result<StatisticsResponse> {
    let overview = library_overview_stats(conn)?;
    let country_catalog = country_catalog_stats(conn)?;
    let rating_progress = rating_progress_stats(conn)?;
    let metadata_coverage = metadata_coverage_stats(conn)?;
    let health_score = library_health_score(conn, &overview, &rating_progress, &metadata_coverage)?;
    let decade_progress = decade_progress_stats(conn)?;
    let year_progress = year_progress_stats(conn)?;
    let genre_progress = genre_progress_stats(conn)?;
    let library_shape = library_shape_stats(&year_progress, &decade_progress);
    let loved_density = loved_density_stats(conn)?;
    let catalog_concentration = catalog_concentration_stats(conn, overview.album_count)?;
    let duration_analytics = duration_analytics_stats(conn)?;
    let outlier_stats = outlier_stats(conn)?;
    let track_rating_distribution = track_rating_distribution(conn)?;
    let album_rating_distribution = album_rating_distribution(conn)?;
    let loved_tracks = loved_track_stats(conn)?;
    let import_history = list_import_runs(conn, 16)?;
    let rating_history = rating_history(conn, &rating_progress, &overview)?;
    let recent_rating_events = recent_rating_events(conn, 10)?;
    let last_updated = import_history.first().and_then(|run| {
        run.completed_at
            .clone()
            .or_else(|| Some(run.started_at.clone()))
    });

    Ok(StatisticsResponse {
        overview,
        country_catalog,
        health_score,
        library_shape,
        rating_progress,
        decade_progress,
        year_progress,
        genre_progress,
        loved_density,
        catalog_concentration,
        duration_analytics,
        outlier_stats,
        track_rating_distribution,
        album_rating_distribution,
        metadata_coverage,
        loved_tracks,
        import_history,
        rating_history,
        recent_rating_events,
        last_updated,
    })
}

pub(super) fn country_catalog_stats(conn: &Connection) -> Result<Vec<CountryCatalogStats>> {
    if !schema_table_exists(conn, "musicbrainz_origin_countries")?
        || !schema_table_exists(conn, "musicbrainz_artist_origin_countries")?
    {
        return Ok(Vec::new());
    }

    let sql = country_catalog_stats_sql();
    let mut stmt = conn
        .prepare(&sql)
        .context("Could not prepare country catalog statistics")?;
    let rows = stmt
        .query_map([], |row| {
            Ok(CountryCatalogStats {
                country_code: row.get(0)?,
                country_name: row.get(1)?,
                artist_count: row.get(2)?,
                album_count: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not read country catalog statistics")?;

    Ok(rows)
}

pub(super) fn country_catalog_stats_sql() -> String {
    let album_artist_key = artist_key_sql("album_artist_display");
    format!(
        "
        WITH album_counts AS MATERIALIZED (
            SELECT
                {album_artist_key} AS local_artist_key,
                COUNT(*) AS album_count
            FROM albums INDEXED BY idx_albums_artist_key
            GROUP BY {album_artist_key}
        )
        SELECT
            country.country_code,
            country.country_name,
            COUNT(album_counts.local_artist_key) AS artist_count,
            COALESCE(SUM(album_counts.album_count), 0) AS album_count
        FROM musicbrainz_origin_countries country
        LEFT JOIN musicbrainz_artist_origin_countries origin
          ON origin.country_code = country.country_code
        LEFT JOIN album_counts
          ON album_counts.local_artist_key = origin.local_artist_key
        GROUP BY country.country_code, country.country_name
        ORDER BY LOWER(country.country_name), country.country_code
        "
    )
}

pub(super) fn library_profile(
    conn: &Connection,
    request: &LibraryProfileRequest,
) -> Result<LibraryProfileResult> {
    if request.sections.is_empty() || request.sections.len() > 4 {
        bail!("Library analysis requires one to four compact profile sections.")
    }
    let allowed = [
        "overview",
        "ratingProgress",
        "catalogShape",
        "tasteSignals",
        "metadataHealth",
        "recentChange",
    ];
    let mut seen = HashSet::new();
    for section in &request.sections {
        if !allowed.contains(&section.as_str()) {
            bail!("Luna requested an unsupported library profile section.")
        }
        if !seen.insert(section.as_str()) {
            bail!("Luna requested the same library profile section more than once.")
        }
    }

    let statistics = statistics(conn)?;
    let mut sections = serde_json::Map::new();
    let mut aggregate_points_shared = 0usize;
    for section in &request.sections {
        let (value, points) = match section.as_str() {
            "overview" => library_overview_profile(&statistics),
            "ratingProgress" => library_rating_profile(&statistics),
            "catalogShape" => library_catalog_profile(&statistics),
            "tasteSignals" => library_taste_profile(&statistics),
            "metadataHealth" => library_metadata_profile(&statistics),
            "recentChange" => library_recent_change_profile(&statistics),
            _ => unreachable!("validated library profile section"),
        };
        aggregate_points_shared += points;
        sections.insert(section.clone(), value);
    }

    Ok(LibraryProfileResult {
        payload: serde_json::json!({
            "scope": {
                "sectionCount": request.sections.len(),
                "aggregatePoints": aggregate_points_shared,
                "namedRows": 0,
                "note": "All calculations remained local. This payload contains only requested aggregate profile sections and no album, track, artist, path, or filename rows."
            },
            "sections": sections
        }),
        sections: request.sections.clone(),
        aggregate_points_shared,
    })
}

pub(super) fn library_overview_profile(
    statistics: &StatisticsResponse,
) -> (serde_json::Value, usize) {
    let overview = &statistics.overview;
    let health = &statistics.health_score;
    let progress = &statistics.rating_progress;
    (
        serde_json::json!({
            "tracks": overview.track_count,
            "albums": overview.album_count,
            "albumArtists": overview.album_artist_count,
            "genres": overview.genre_count,
            "distinctYears": overview.year_count,
            "totalDurationHours": overview.total_seconds as f64 / 3600.0,
            "averageAlbumScore": overview.average_album_score,
            "medianYear": statistics.library_shape.median_year,
            "peakYear": statistics.library_shape.peak_year,
            "peakYearAlbums": statistics.library_shape.peak_year_albums,
            "mostRepresentedDecade": statistics.library_shape.most_represented_decade,
            "mostRepresentedDecadeAlbums": statistics.library_shape.most_represented_decade_albums,
            "libraryHealthScorePercent": health.score,
            "ratingCoveragePercent": health.rating_coverage * 100.0,
            "albumCompletionPercent": health.album_completion * 100.0,
            "metadataCoveragePercent": health.metadata_coverage * 100.0,
            "coverCoveragePercent": health.cover_coverage * 100.0,
            "scoreCoveragePercent": health.score_coverage * 100.0,
            "fullyRatedAlbums": progress.fully_rated_albums,
            "partiallyRatedAlbums": progress.partially_rated_albums,
            "unratedAlbums": progress.unrated_albums,
            "ratedTracks": progress.rated_tracks,
            "unratedTracks": progress.unrated_tracks,
            "lastUpdated": statistics.last_updated
        }),
        1,
    )
}

pub(super) fn library_rating_profile(
    statistics: &StatisticsResponse,
) -> (serde_json::Value, usize) {
    let mut decade_backlog = statistics.decade_progress.iter().collect::<Vec<_>>();
    decade_backlog.sort_by(|left, right| {
        right
            .unrated_album_count
            .cmp(&left.unrated_album_count)
            .then_with(|| right.album_count.cmp(&left.album_count))
            .then_with(|| right.decade.cmp(&left.decade))
    });
    decade_backlog.truncate(8);
    let mut genre_backlog = statistics.genre_progress.iter().collect::<Vec<_>>();
    genre_backlog.sort_by(|left, right| {
        right
            .unrated_album_count
            .cmp(&left.unrated_album_count)
            .then_with(|| right.album_count.cmp(&left.album_count))
            .then_with(|| left.genre.to_lowercase().cmp(&right.genre.to_lowercase()))
    });
    genre_backlog.truncate(8);
    let points = 1 + decade_backlog.len() + genre_backlog.len();

    (
        serde_json::json!({
            "totals": {
                "fullyRatedAlbums": statistics.rating_progress.fully_rated_albums,
                "partiallyRatedAlbums": statistics.rating_progress.partially_rated_albums,
                "unratedAlbums": statistics.rating_progress.unrated_albums,
                "albumsWithEffectiveRating": statistics.rating_progress.albums_with_effective_rating,
                "ratedTracks": statistics.rating_progress.rated_tracks,
                "unratedTracks": statistics.rating_progress.unrated_tracks,
                "averageRatingCompletenessPercent": statistics.rating_progress.average_rating_completeness.map(|value| value * 100.0),
                "averageAlbumRating": statistics.rating_progress.average_album_rating
            },
            "decadesWithLargestUnratedBacklog": decade_backlog.into_iter().map(|row| serde_json::json!({
                "decade": row.decade,
                "albums": row.album_count,
                "fullyRatedAlbums": row.rated_album_count,
                "partiallyRatedAlbums": row.partial_album_count,
                "unratedAlbums": row.unrated_album_count
            })).collect::<Vec<_>>(),
            "genresWithLargestUnratedBacklog": genre_backlog.into_iter().map(|row| serde_json::json!({
                "genre": row.genre,
                "albums": row.album_count,
                "fullyRatedAlbums": row.rated_album_count,
                "partiallyRatedAlbums": row.partial_album_count,
                "unratedAlbums": row.unrated_album_count
            })).collect::<Vec<_>>()
        }),
        points,
    )
}

pub(super) fn library_catalog_profile(
    statistics: &StatisticsResponse,
) -> (serde_json::Value, usize) {
    let mut decades = statistics.decade_progress.iter().collect::<Vec<_>>();
    decades.sort_by(|left, right| {
        right
            .album_count
            .cmp(&left.album_count)
            .then_with(|| right.decade.cmp(&left.decade))
    });
    decades.truncate(8);
    let genres = statistics.genre_progress.iter().take(8).collect::<Vec<_>>();
    let points = decades.len()
        + genres.len()
        + statistics.catalog_concentration.artist_points.len()
        + statistics.catalog_concentration.genre_points.len();

    (
        serde_json::json!({
            "timeShape": {
                "medianYear": statistics.library_shape.median_year,
                "peakYear": statistics.library_shape.peak_year,
                "peakYearAlbums": statistics.library_shape.peak_year_albums,
                "mostRepresentedDecade": statistics.library_shape.most_represented_decade,
                "mostRepresentedDecadeAlbums": statistics.library_shape.most_represented_decade_albums
            },
            "largestDecades": decades.into_iter().map(|row| serde_json::json!({
                "decade": row.decade,
                "albums": row.album_count,
                "tracks": row.track_count,
                "durationHours": row.total_seconds as f64 / 3600.0
            })).collect::<Vec<_>>(),
            "largestGenres": genres.into_iter().map(|row| serde_json::json!({
                "genre": row.genre,
                "albums": row.album_count,
                "tracks": row.track_count,
                "durationHours": row.total_seconds as f64 / 3600.0
            })).collect::<Vec<_>>(),
            "anonymousArtistConcentration": statistics.catalog_concentration.artist_points.iter().map(|point| serde_json::json!({
                "topN": point.top_n,
                "albums": point.album_count,
                "sharePercent": point.share * 100.0
            })).collect::<Vec<_>>(),
            "genreConcentration": statistics.catalog_concentration.genre_points.iter().map(|point| serde_json::json!({
                "topN": point.top_n,
                "albums": point.album_count,
                "sharePercent": point.share * 100.0
            })).collect::<Vec<_>>()
        }),
        points,
    )
}

pub(super) fn library_taste_profile(statistics: &StatisticsResponse) -> (serde_json::Value, usize) {
    let loved_density = statistics
        .loved_density
        .iter()
        .filter(|row| row.scope == "Genre" || row.scope == "Decade")
        .take(12)
        .collect::<Vec<_>>();
    let mut score_genres = statistics
        .genre_progress
        .iter()
        .filter(|row| row.album_count >= 5 && row.average_album_score.is_some())
        .collect::<Vec<_>>();
    score_genres.sort_by(|left, right| {
        right
            .average_album_score
            .unwrap_or_default()
            .total_cmp(&left.average_album_score.unwrap_or_default())
            .then_with(|| right.album_count.cmp(&left.album_count))
    });
    score_genres.truncate(6);
    let mut score_decades = statistics
        .decade_progress
        .iter()
        .filter(|row| row.album_count >= 5 && row.average_album_score.is_some())
        .collect::<Vec<_>>();
    score_decades.sort_by(|left, right| {
        right
            .average_album_score
            .unwrap_or_default()
            .total_cmp(&left.average_album_score.unwrap_or_default())
            .then_with(|| right.album_count.cmp(&left.album_count))
    });
    score_decades.truncate(6);
    let points = 1
        + loved_density.len()
        + score_genres.len()
        + score_decades.len()
        + statistics.album_rating_distribution.len()
        + statistics.track_rating_distribution.len();

    (
        serde_json::json!({
            "lovedTotals": {
                "lovedTracks": statistics.loved_tracks.loved_tracks,
                "albumsWithLovedTracks": statistics.loved_tracks.albums_with_loved_tracks,
                "averageLovedTracksPerLovedAlbum": statistics.loved_tracks.average_loved_tracks_per_album,
                "topLovedGenre": statistics.loved_tracks.top_loved_genre,
                "topLovedYear": statistics.loved_tracks.top_loved_year
            },
            "lovedDensity": loved_density.into_iter().map(|row| serde_json::json!({
                "dimension": row.scope,
                "label": row.label,
                "albums": row.album_count,
                "tracks": row.track_count,
                "lovedTracks": row.loved_tracks,
                "lovedPer100Tracks": row.loved_per_100_tracks
            })).collect::<Vec<_>>(),
            "highestAverageScoreGenres": score_genres.into_iter().map(|row| serde_json::json!({
                "genre": row.genre,
                "albums": row.album_count,
                "averageAlbumScore": row.average_album_score
            })).collect::<Vec<_>>(),
            "highestAverageScoreDecades": score_decades.into_iter().map(|row| serde_json::json!({
                "decade": row.decade,
                "albums": row.album_count,
                "averageAlbumScore": row.average_album_score
            })).collect::<Vec<_>>(),
            "albumRatingDistribution": statistics.album_rating_distribution,
            "trackRatingDistribution": statistics.track_rating_distribution
        }),
        points,
    )
}

pub(super) fn library_metadata_profile(
    statistics: &StatisticsResponse,
) -> (serde_json::Value, usize) {
    (
        serde_json::json!({
            "health": {
                "libraryHealthScorePercent": statistics.health_score.score,
                "metadataCoveragePercent": statistics.health_score.metadata_coverage * 100.0,
                "coverCoveragePercent": statistics.health_score.cover_coverage * 100.0,
                "ratingCoveragePercent": statistics.health_score.rating_coverage * 100.0,
                "scoreCoveragePercent": statistics.health_score.score_coverage * 100.0
            },
            "coverage": statistics.metadata_coverage.iter().map(|metric| serde_json::json!({
                "field": metric.label,
                "scope": metric.scope,
                "covered": metric.covered_count,
                "missing": (metric.total_count - metric.covered_count).max(0),
                "total": metric.total_count,
                "coveragePercent": ratio(metric.covered_count, metric.total_count) * 100.0
            })).collect::<Vec<_>>()
        }),
        statistics.metadata_coverage.len(),
    )
}

pub(super) fn library_recent_change_profile(
    statistics: &StatisticsResponse,
) -> (serde_json::Value, usize) {
    let rating_snapshots = statistics
        .rating_history
        .iter()
        .rev()
        .take(6)
        .collect::<Vec<_>>();
    let import_deltas = statistics.import_history.iter().take(6).collect::<Vec<_>>();
    let points = rating_snapshots.len() + import_deltas.len();
    (
        serde_json::json!({
            "ratingSnapshotsNewestFirst": rating_snapshots.into_iter().map(|point| serde_json::json!({
                "createdAt": point.created_at,
                "tracks": point.track_count,
                "albums": point.album_count,
                "ratedTracks": point.rated_tracks,
                "unratedTracks": point.unrated_tracks,
                "fullyRatedAlbums": point.fully_rated_albums,
                "partiallyRatedAlbums": point.partially_rated_albums,
                "unratedAlbums": point.unrated_albums,
                "averageAlbumRating": point.average_album_rating,
                "averageAlbumScore": point.average_album_score,
                "ratingEvents": point.rating_events_count
            })).collect::<Vec<_>>(),
            "importDeltasNewestFirst": import_deltas.into_iter().map(|run| serde_json::json!({
                "startedAt": run.started_at,
                "completedAt": run.completed_at,
                "status": run.status,
                "trackRows": run.track_rows,
                "albumCount": run.album_count,
                "addedTracks": run.added_tracks,
                "changedTracks": run.changed_tracks,
                "removedTracks": run.removed_tracks,
                "addedAlbums": run.added_albums,
                "changedAlbums": run.changed_albums,
                "removedAlbums": run.removed_albums,
                "ratingEvents": run.rating_events_count
            })).collect::<Vec<_>>()
        }),
        points,
    )
}

pub(super) fn library_overview_stats(conn: &Connection) -> Result<LibraryOverviewStats> {
    let artist_key_sql = artist_key_sql("album_artist_display");
    let sql = format!(
        "
        SELECT
            (SELECT COUNT(*) FROM tracks),
            (SELECT COUNT(*) FROM albums),
            (SELECT COUNT(DISTINCT {artist_key_sql})
                FROM albums
                WHERE NULLIF(TRIM(COALESCE(album_artist_display, '')), '') IS NOT NULL),
            (SELECT COUNT(DISTINCT genre_normalized)
                FROM albums
                WHERE NULLIF(TRIM(COALESCE(genre_normalized, '')), '') IS NOT NULL),
            (SELECT COUNT(DISTINCT year)
                FROM albums
                WHERE year IS NOT NULL),
            COALESCE((SELECT SUM(total_seconds) FROM albums), 0),
            (SELECT AVG(album_score) FROM albums WHERE album_score IS NOT NULL)
        "
    );
    conn.query_row(&sql, [], |row| {
        Ok(LibraryOverviewStats {
            track_count: row.get(0)?,
            album_count: row.get(1)?,
            album_artist_count: row.get(2)?,
            genre_count: row.get(3)?,
            year_count: row.get(4)?,
            total_seconds: row.get(5)?,
            average_album_score: row.get(6)?,
        })
    })
    .context("Could not load library overview statistics")
}

pub(super) fn rating_progress_stats(conn: &Connection) -> Result<RatingProgressStats> {
    conn.query_row(
        "
        SELECT
            COALESCE(SUM(CASE WHEN rating_completeness >= 1.0 THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN rating_completeness > 0.0 AND rating_completeness < 1.0 THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN rating_completeness = 0.0 THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN effective_album_rating IS NOT NULL THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(rated_tracks), 0),
            COALESCE(SUM(total_tracks - rated_tracks), 0),
            AVG(rating_completeness),
            AVG(effective_album_rating)
        FROM albums
        ",
        [],
        |row| {
            Ok(RatingProgressStats {
                fully_rated_albums: row.get(0)?,
                partially_rated_albums: row.get(1)?,
                unrated_albums: row.get(2)?,
                albums_with_effective_rating: row.get(3)?,
                rated_tracks: row.get(4)?,
                unrated_tracks: row.get(5)?,
                average_rating_completeness: row.get(6)?,
                average_album_rating: row.get(7)?,
            })
        },
    )
    .context("Could not load rating progress statistics")
}

pub(super) fn ratio(part: i64, total: i64) -> f64 {
    if total <= 0 {
        0.0
    } else {
        (part as f64 / total as f64).clamp(0.0, 1.0)
    }
}

pub(super) fn library_health_score(
    conn: &Connection,
    overview: &LibraryOverviewStats,
    rating_progress: &RatingProgressStats,
    metadata_coverage: &[MetadataCoverageMetric],
) -> Result<LibraryHealthScore> {
    let cover_count = conn
        .query_row(
            "
            SELECT COUNT(DISTINCT a.id)
            FROM albums a
            JOIN album_covers c ON c.album_id = a.id
            ",
            [],
            |row| row.get::<_, i64>(0),
        )
        .context("Could not load cover coverage for health score")?;

    let metadata_values = metadata_coverage
        .iter()
        .filter(|metric| metric.scope == "Albums" || metric.scope == "Tracks")
        .filter(|metric| metric.total_count > 0)
        .map(|metric| ratio(metric.covered_count, metric.total_count))
        .collect::<Vec<_>>();
    let metadata_coverage_score = if metadata_values.is_empty() {
        0.0
    } else {
        metadata_values.iter().sum::<f64>() / metadata_values.len() as f64
    };

    let rating_coverage = ratio(rating_progress.rated_tracks, overview.track_count);
    let album_completion = ratio(rating_progress.fully_rated_albums, overview.album_count);
    let cover_coverage = ratio(cover_count, overview.album_count);
    let score_coverage = ratio(
        rating_progress.albums_with_effective_rating,
        overview.album_count,
    );
    let score = rating_coverage * 35.0
        + album_completion * 20.0
        + metadata_coverage_score * 25.0
        + cover_coverage * 10.0
        + score_coverage * 10.0;

    Ok(LibraryHealthScore {
        score,
        rating_coverage,
        album_completion,
        metadata_coverage: metadata_coverage_score,
        cover_coverage,
        score_coverage,
    })
}

pub(super) fn library_shape_stats(
    year_progress: &[YearProgressStats],
    decade_progress: &[DecadeProgressStats],
) -> LibraryShapeStats {
    let total_albums = year_progress.iter().map(|row| row.album_count).sum::<i64>();
    let median_target = (total_albums + 1) / 2;
    let mut cumulative = 0_i64;
    let mut years = year_progress.iter().collect::<Vec<_>>();
    years.sort_by_key(|row| row.year);
    let median_year = years.iter().find_map(|row| {
        cumulative += row.album_count;
        if cumulative >= median_target {
            Some(row.year)
        } else {
            None
        }
    });
    let peak_year = year_progress
        .iter()
        .max_by_key(|row| row.album_count)
        .map(|row| (row.year, row.album_count));
    let most_represented_decade = decade_progress
        .iter()
        .max_by_key(|row| row.album_count)
        .map(|row| (row.decade, row.album_count));

    LibraryShapeStats {
        median_year,
        most_represented_decade: most_represented_decade.map(|(decade, _)| decade),
        most_represented_decade_albums: most_represented_decade
            .map(|(_, albums)| albums)
            .unwrap_or_default(),
        peak_year: peak_year.map(|(year, _)| year),
        peak_year_albums: peak_year.map(|(_, albums)| albums).unwrap_or_default(),
    }
}

pub(super) fn decade_progress_stats(conn: &Connection) -> Result<Vec<DecadeProgressStats>> {
    let mut stmt = conn.prepare(
        "
        SELECT
            CAST((year / 10) * 10 AS INTEGER) AS decade,
            COUNT(*),
            SUM(CASE WHEN rating_completeness >= 1.0 THEN 1 ELSE 0 END),
            SUM(CASE WHEN rating_completeness > 0.0 AND rating_completeness < 1.0 THEN 1 ELSE 0 END),
            SUM(CASE WHEN rating_completeness = 0.0 THEN 1 ELSE 0 END),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(total_seconds), 0),
            COALESCE(SUM(loved_tracks), 0),
            AVG(album_score)
        FROM albums
        WHERE year IS NOT NULL
        GROUP BY decade
        ORDER BY decade ASC
        ",
    )?;

    let rows = stmt
        .query_map([], |row| {
            Ok(DecadeProgressStats {
                decade: row.get(0)?,
                album_count: row.get(1)?,
                rated_album_count: row.get(2)?,
                partial_album_count: row.get(3)?,
                unrated_album_count: row.get(4)?,
                track_count: row.get(5)?,
                total_seconds: row.get(6)?,
                loved_tracks: row.get(7)?,
                average_album_score: row.get(8)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub(super) fn loved_density_stats(conn: &Connection) -> Result<Vec<LovedDensityStat>> {
    let mut stats = Vec::new();

    let mut genre_stmt = conn.prepare(
        "
        SELECT
            'Genre',
            COALESCE(MIN(NULLIF(TRIM(canonical_genre), '')), 'Unknown'),
            COUNT(*),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(loved_tracks), 0),
            CAST(COALESCE(SUM(loved_tracks), 0) AS REAL) * 100.0 / MAX(1, COALESCE(SUM(total_tracks), 0))
        FROM albums
        WHERE NULLIF(TRIM(COALESCE(genre_normalized, '')), '') IS NOT NULL
        GROUP BY COALESCE(NULLIF(TRIM(LOWER(genre_normalized)), ''), 'unknown')
        HAVING COALESCE(SUM(total_tracks), 0) >= 100
        ORDER BY 6 DESC, 5 DESC, 3 DESC
        LIMIT 8
        ",
    )?;
    stats.extend(
        genre_stmt
            .query_map([], loved_density_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?,
    );

    let mut decade_stmt = conn.prepare(
        "
        SELECT
            'Decade',
            printf('%ds', CAST((year / 10) * 10 AS INTEGER)),
            COUNT(*),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(loved_tracks), 0),
            CAST(COALESCE(SUM(loved_tracks), 0) AS REAL) * 100.0 / MAX(1, COALESCE(SUM(total_tracks), 0))
        FROM albums
        WHERE year IS NOT NULL
        GROUP BY CAST((year / 10) * 10 AS INTEGER)
        HAVING COALESCE(SUM(total_tracks), 0) >= 100
        ORDER BY 6 DESC, 5 DESC, 3 DESC
        LIMIT 8
        ",
    )?;
    stats.extend(
        decade_stmt
            .query_map([], loved_density_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?,
    );

    let mut rating_stmt = conn.prepare(
        "
        SELECT
            'Rating bucket',
            CASE
                WHEN effective_album_rating IS NULL THEN 'Unrated'
                WHEN effective_album_rating = 100 THEN '100'
                ELSE printf('%d-%d', (effective_album_rating / 10) * 10, ((effective_album_rating / 10) * 10) + 9)
            END,
            COUNT(*),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(loved_tracks), 0),
            CAST(COALESCE(SUM(loved_tracks), 0) AS REAL) * 100.0 / MAX(1, COALESCE(SUM(total_tracks), 0))
        FROM albums
        GROUP BY
            CASE
                WHEN effective_album_rating IS NULL THEN -1
                WHEN effective_album_rating = 100 THEN 100
                ELSE (effective_album_rating / 10) * 10
            END
        HAVING COALESCE(SUM(total_tracks), 0) >= 100
        ORDER BY 6 DESC, 5 DESC, 3 DESC
        LIMIT 8
        ",
    )?;
    stats.extend(
        rating_stmt
            .query_map([], loved_density_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?,
    );

    Ok(stats)
}

pub(super) fn loved_density_from_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<LovedDensityStat> {
    Ok(LovedDensityStat {
        scope: row.get(0)?,
        label: row.get(1)?,
        album_count: row.get(2)?,
        track_count: row.get(3)?,
        loved_tracks: row.get(4)?,
        loved_per_100_tracks: row.get(5)?,
    })
}

pub(super) fn catalog_concentration_stats(
    conn: &Connection,
    total_albums: i64,
) -> Result<CatalogConcentrationStats> {
    let artist_key_sql = artist_key_sql("album_artist_display");
    let artist_groups = concentration_groups(
        conn,
        &format!(
            "
        SELECT
            COALESCE(MIN(NULLIF(TRIM(album_artist_display), '')), 'Unknown Artist') AS label,
            COUNT(*) AS album_count
        FROM albums
        GROUP BY {artist_key_sql}
        ORDER BY album_count DESC, LOWER(label) ASC
        "
        ),
    )?;
    let genre_groups = concentration_groups(
        conn,
        "
        SELECT
            COALESCE(MIN(NULLIF(TRIM(canonical_genre), '')), 'Unknown') AS label,
            COUNT(*) AS album_count
        FROM albums
        GROUP BY COALESCE(NULLIF(TRIM(LOWER(genre_normalized)), ''), 'unknown')
        ORDER BY album_count DESC, LOWER(label) ASC
        ",
    )?;

    let top_artist = artist_groups.first().map(|(label, _)| label.clone());
    let top_artist_album_count = artist_groups
        .first()
        .map(|(_, album_count)| *album_count)
        .unwrap_or_default();
    let top_genre = genre_groups.first().map(|(label, _)| label.clone());
    let top_genre_album_count = genre_groups
        .first()
        .map(|(_, album_count)| *album_count)
        .unwrap_or_default();

    Ok(CatalogConcentrationStats {
        artist_points: concentration_points(&artist_groups, total_albums),
        genre_points: concentration_points(&genre_groups, total_albums),
        top_artist,
        top_artist_album_count,
        top_genre,
        top_genre_album_count,
    })
}

pub(super) fn concentration_groups(conn: &Connection, sql: &str) -> Result<Vec<(String, i64)>> {
    let mut stmt = conn.prepare(sql)?;
    let groups = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load catalog concentration groups")?;
    Ok(groups)
}

pub(super) fn concentration_points(
    groups: &[(String, i64)],
    total_albums: i64,
) -> Vec<ConcentrationPoint> {
    [10_i64, 25, 50]
        .into_iter()
        .map(|top_n| {
            let album_count = groups
                .iter()
                .take(top_n as usize)
                .map(|(_, count)| *count)
                .sum::<i64>();
            ConcentrationPoint {
                top_n,
                album_count,
                share: ratio(album_count, total_albums),
            }
        })
        .collect()
}

pub(super) fn duration_analytics_stats(conn: &Connection) -> Result<DurationAnalyticsStats> {
    let (average_album_seconds, average_track_seconds) = conn
        .query_row(
            "
            SELECT
                (SELECT AVG(total_seconds) FROM albums WHERE total_seconds > 0),
                (SELECT CAST(SUM(total_seconds) AS REAL) / NULLIF(SUM(total_tracks), 0)
                 FROM albums
                 WHERE total_seconds > 0 AND total_tracks > 0)
            ",
            [],
            |row| Ok((row.get::<_, Option<f64>>(0)?, row.get::<_, Option<f64>>(1)?)),
        )
        .context("Could not load duration averages")?;

    Ok(DurationAnalyticsStats {
        average_album_seconds,
        average_track_seconds,
        longest_albums: duration_album_rows(conn, "DESC")?,
        shortest_albums: duration_album_rows(conn, "ASC")?,
        track_count_buckets: track_count_distribution(conn)?,
    })
}

pub(super) fn duration_album_rows(
    conn: &Connection,
    direction: &str,
) -> Result<Vec<DurationAlbumStat>> {
    let sql = format!(
        "
        SELECT
            id,
            album,
            album_artist_display,
            year,
            total_tracks,
            total_seconds,
            rating_completeness,
            album_score
        FROM albums
        WHERE total_seconds > 0
        ORDER BY total_seconds {direction}, total_tracks {direction}, LOWER(COALESCE(album, '')) ASC
        LIMIT 5
        "
    );
    let mut stmt = conn.prepare(&sql)?;
    duration_album_query(&mut stmt)
}

pub(super) fn duration_album_query(
    stmt: &mut rusqlite::Statement<'_>,
) -> Result<Vec<DurationAlbumStat>> {
    stmt.query_map([], |row| {
        Ok(DurationAlbumStat {
            album_id: row.get(0)?,
            album: row.get(1)?,
            album_artist_display: row.get(2)?,
            year: row.get(3)?,
            total_tracks: row.get(4)?,
            total_seconds: row.get(5)?,
            rating_completeness: row.get(6)?,
            album_score: row.get(7)?,
        })
    })?
    .collect::<rusqlite::Result<Vec<_>>>()
    .context("Could not load duration album rows")
}

pub(super) fn track_count_distribution(conn: &Connection) -> Result<Vec<RatingBucket>> {
    let mut stmt = conn.prepare(
        "
        SELECT
            CASE
                WHEN total_tracks <= 5 THEN '1-5'
                WHEN total_tracks <= 10 THEN '6-10'
                WHEN total_tracks <= 15 THEN '11-15'
                WHEN total_tracks <= 20 THEN '16-20'
                ELSE '21+'
            END AS bucket,
            COUNT(*),
            CASE
                WHEN total_tracks <= 5 THEN 1
                WHEN total_tracks <= 10 THEN 2
                WHEN total_tracks <= 15 THEN 3
                WHEN total_tracks <= 20 THEN 4
                ELSE 5
            END AS bucket_order
        FROM albums
        GROUP BY bucket_order, bucket
        ORDER BY bucket_order ASC
        ",
    )?;
    let buckets = stmt
        .query_map([], |row| {
            Ok(RatingBucket {
                label: row.get(0)?,
                count: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load track-count distribution")?;
    Ok(buckets)
}

pub(super) fn outlier_stats(conn: &Connection) -> Result<Vec<OutlierStat>> {
    let mut stats = Vec::new();

    if let Some(album) = outlier_album(
        conn,
        "
        SELECT id, album, album_artist_display, year, total_tracks, total_seconds, rating_completeness, album_score
        FROM albums
        WHERE rating_completeness = 0.0 AND total_seconds > 0
        ORDER BY total_seconds DESC
        LIMIT 1
        ",
    )? {
        stats.push(OutlierStat {
            id: "longest-unrated-album".to_string(),
            label: "Longest unrated album".to_string(),
            value: format!("{:.1}h", album.total_seconds as f64 / 3600.0),
            detail: format_album_detail(&album),
        });
    }

    if let Some(album) = outlier_album(
        conn,
        "
        SELECT id, album, album_artist_display, year, total_tracks, total_seconds, rating_completeness, album_score
        FROM albums
        WHERE rating_completeness > 0.0
          AND rating_completeness < 1.0
          AND album_score IS NOT NULL
        ORDER BY album_score DESC, total_seconds DESC
        LIMIT 1
        ",
    )? {
        stats.push(OutlierStat {
            id: "highest-score-incomplete-album".to_string(),
            label: "Highest-score incomplete album".to_string(),
            value: album
                .album_score
                .map(|score| format!("{score:.1}"))
                .unwrap_or_default(),
            detail: format_album_detail(&album),
        });
    }

    if let Some((label, density, loved_tracks, track_count)) = conn
        .query_row(
            "
            SELECT
                COALESCE(MIN(NULLIF(TRIM(canonical_genre), '')), 'Unknown') AS genre,
                CAST(COALESCE(SUM(loved_tracks), 0) AS REAL) * 100.0 / MAX(1, COALESCE(SUM(total_tracks), 0)),
                COALESCE(SUM(loved_tracks), 0),
                COALESCE(SUM(total_tracks), 0)
            FROM albums
            WHERE NULLIF(TRIM(COALESCE(genre_normalized, '')), '') IS NOT NULL
            GROUP BY COALESCE(NULLIF(TRIM(LOWER(genre_normalized)), ''), 'unknown')
            HAVING COALESCE(SUM(total_tracks), 0) >= 100
            ORDER BY 2 DESC, 3 DESC
            LIMIT 1
            ",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, f64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        )
        .optional()
        .context("Could not load loved-density genre outlier")?
    {
        stats.push(OutlierStat {
            id: "highest-loved-density-genre".to_string(),
            label: "Highest loved-density genre".to_string(),
            value: format!("{density:.2}/100"),
            detail: format!("{label}: {loved_tracks} loved tracks across {track_count} tracks"),
        });
    }

    if let Some((decade, completion, albums)) = conn
        .query_row(
            "
            SELECT
                CAST((year / 10) * 10 AS INTEGER) AS decade,
                AVG(rating_completeness),
                COUNT(*)
            FROM albums
            WHERE year IS NOT NULL
            GROUP BY decade
            HAVING COUNT(*) >= 5
            ORDER BY AVG(rating_completeness) ASC, COUNT(*) DESC
            LIMIT 1
            ",
            [],
            |row| {
                Ok((
                    row.get::<_, i32>(0)?,
                    row.get::<_, Option<f64>>(1)?.unwrap_or_default(),
                    row.get::<_, i64>(2)?,
                ))
            },
        )
        .optional()
        .context("Could not load low-completion decade outlier")?
    {
        stats.push(OutlierStat {
            id: "lowest-completion-decade".to_string(),
            label: "Lowest-completion decade".to_string(),
            value: format!("{:.0}%", completion * 100.0),
            detail: format!("{decade}s: {albums} albums with the lowest average completion"),
        });
    }

    if let Some(album) = outlier_album(
        conn,
        "
        SELECT id, album, album_artist_display, year, total_tracks, total_seconds, rating_completeness, album_score
        FROM albums
        ORDER BY total_tracks DESC, total_seconds DESC
        LIMIT 1
        ",
    )? {
        stats.push(OutlierStat {
            id: "largest-track-count-album".to_string(),
            label: "Largest track-count album".to_string(),
            value: format!("{} tracks", album.total_tracks),
            detail: format_album_detail(&album),
        });
    }

    Ok(stats)
}

pub(super) fn outlier_album(conn: &Connection, sql: &str) -> Result<Option<DurationAlbumStat>> {
    let mut stmt = conn.prepare(sql)?;
    Ok(duration_album_query(&mut stmt)?.into_iter().next())
}

pub(super) fn format_album_detail(album: &DurationAlbumStat) -> String {
    let mut parts = Vec::new();
    if let Some(artist) = &album.album_artist_display {
        parts.push(artist.clone());
    }
    if let Some(title) = &album.album {
        parts.push(title.clone());
    }
    if let Some(year) = album.year {
        parts.push(year.to_string());
    }
    parts.join(" / ")
}

pub(super) fn year_progress_stats(conn: &Connection) -> Result<Vec<YearProgressStats>> {
    year_progress_stats_filtered(conn, &YearProgressRequest::default())
}

pub(super) fn year_progress_stats_filtered(
    conn: &Connection,
    request: &YearProgressRequest,
) -> Result<Vec<YearProgressStats>> {
    let mut conditions = vec!["year IS NOT NULL".to_string()];
    let mut values = Vec::new();
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
    let sql = format!(
        "
        SELECT
            year,
            COUNT(*),
            SUM(CASE WHEN rating_completeness >= 1.0 THEN 1 ELSE 0 END),
            SUM(CASE WHEN rating_completeness > 0.0 AND rating_completeness < 1.0 THEN 1 ELSE 0 END),
            SUM(CASE WHEN rating_completeness = 0.0 THEN 1 ELSE 0 END),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(total_seconds), 0),
            COALESCE(SUM(loved_tracks), 0),
            AVG(album_score)
        FROM albums
        WHERE {}
        GROUP BY year
        ORDER BY year ASC
        ",
        conditions.join(" AND ")
    );
    let mut stmt = conn.prepare(&sql)?;

    let rows = stmt
        .query_map(params_from_iter(values.iter()), |row| {
            Ok(YearProgressStats {
                year: row.get(0)?,
                album_count: row.get(1)?,
                rated_album_count: row.get(2)?,
                partial_album_count: row.get(3)?,
                unrated_album_count: row.get(4)?,
                track_count: row.get(5)?,
                total_seconds: row.get(6)?,
                loved_tracks: row.get(7)?,
                average_album_score: row.get(8)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub(super) fn genre_progress_stats(conn: &Connection) -> Result<Vec<GenreProgressStats>> {
    genre_progress_stats_filtered(conn, &GenreProgressRequest::default())
}

pub(super) fn genre_progress_stats_filtered(
    conn: &Connection,
    request: &GenreProgressRequest,
) -> Result<Vec<GenreProgressStats>> {
    let mut conditions = vec!["1 = 1".to_string()];
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
    let sql = format!(
        "
        SELECT
            COALESCE(NULLIF(TRIM(canonical_genre), ''), 'Unknown'),
            COUNT(*),
            SUM(CASE WHEN rating_completeness >= 1.0 THEN 1 ELSE 0 END),
            SUM(CASE WHEN rating_completeness > 0.0 AND rating_completeness < 1.0 THEN 1 ELSE 0 END),
            SUM(CASE WHEN rating_completeness = 0.0 THEN 1 ELSE 0 END),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(total_seconds), 0),
            COALESCE(SUM(loved_tracks), 0),
            AVG(album_score)
        FROM albums
        WHERE {}
        GROUP BY COALESCE(NULLIF(TRIM(genre_normalized), ''), 'unknown')
        ORDER BY COUNT(*) DESC, LOWER(COALESCE(canonical_genre, '')) ASC
        ",
        conditions.join(" AND ")
    );
    let mut stmt = conn.prepare(&sql)?;

    let rows = stmt
        .query_map(params_from_iter(values.iter()), |row| {
            Ok(GenreProgressStats {
                genre: row.get(0)?,
                album_count: row.get(1)?,
                rated_album_count: row.get(2)?,
                partial_album_count: row.get(3)?,
                unrated_album_count: row.get(4)?,
                track_count: row.get(5)?,
                total_seconds: row.get(6)?,
                loved_tracks: row.get(7)?,
                average_album_score: row.get(8)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub(super) fn track_rating_distribution(conn: &Connection) -> Result<Vec<RatingBucket>> {
    let mut counts = [0_i64; 11];
    let mut stmt = conn.prepare(
        "
        SELECT normalized_rating / 10, COUNT(*)
        FROM tracks
        WHERE normalized_rating IS NOT NULL
        GROUP BY normalized_rating / 10
        ",
    )?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let rating: i64 = row.get(0)?;
        if (0..=10).contains(&rating) {
            counts[rating as usize] = row.get(1)?;
        }
    }

    Ok((0..=10)
        .rev()
        .map(|half_star_steps| RatingBucket {
            label: if half_star_steps % 2 == 0 {
                (half_star_steps / 2).to_string()
            } else {
                format!("{}.5", half_star_steps / 2)
            },
            count: counts[half_star_steps as usize],
        })
        .collect())
}

pub(super) fn album_rating_distribution(conn: &Connection) -> Result<Vec<RatingBucket>> {
    let mut stmt = conn.prepare(
        "
        SELECT
            CASE
                WHEN effective_album_rating = 100 THEN '100'
                ELSE printf('%d-%d', (effective_album_rating / 10) * 10, ((effective_album_rating / 10) * 10) + 9)
            END,
            COUNT(*),
            CASE
                WHEN effective_album_rating = 100 THEN 100
                ELSE (effective_album_rating / 10) * 10
            END AS bucket
        FROM albums
        WHERE effective_album_rating IS NOT NULL
        GROUP BY bucket
        ORDER BY bucket DESC
        ",
    )?;

    let rows = stmt
        .query_map([], |row| {
            Ok(RatingBucket {
                label: row.get(0)?,
                count: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub(super) fn coverage_metric(
    id: &str,
    label: &str,
    scope: &str,
    covered_count: i64,
    total_count: i64,
) -> MetadataCoverageMetric {
    MetadataCoverageMetric {
        id: id.to_string(),
        label: label.to_string(),
        scope: scope.to_string(),
        covered_count,
        total_count,
    }
}

pub(super) fn metadata_coverage_stats(conn: &Connection) -> Result<Vec<MetadataCoverageMetric>> {
    let (
        album_total,
        album_title_count,
        album_artist_count,
        genre_count,
        year_count,
        release_year_count,
        publisher_count,
        album_rating_count,
    ) = conn
        .query_row(
            "
            SELECT
                COUNT(*),
                COALESCE(SUM(CASE WHEN NULLIF(TRIM(COALESCE(album, '')), '') IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN NULLIF(TRIM(COALESCE(album_artist_display, '')), '') IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN NULLIF(TRIM(COALESCE(genre_normalized, '')), '') IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN year IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN release_year IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN NULLIF(TRIM(COALESCE(publisher, '')), '') IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN effective_album_rating IS NOT NULL THEN 1 ELSE 0 END), 0)
            FROM albums
            ",
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, i64>(7)?,
                ))
            },
        )
        .context("Could not load album metadata coverage")?;
    let (
        track_total,
        track_title_count,
        display_artist_count,
        track_number_count,
        disc_number_count,
        duration_count,
        filename_count,
        track_rating_count,
    ) = conn
        .query_row(
            "
            SELECT
                COUNT(*),
                COALESCE(SUM(CASE WHEN NULLIF(TRIM(COALESCE(title, '')), '') IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN NULLIF(TRIM(COALESCE(display_artist, '')), '') IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN track_number IS NOT NULL AND track_number > 0 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN disc_number IS NOT NULL AND disc_number > 0 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN time_seconds IS NOT NULL AND time_seconds > 0 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN NULLIF(TRIM(COALESCE(filename, '')), '') IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN normalized_rating IS NOT NULL THEN 1 ELSE 0 END), 0)
            FROM tracks
            ",
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, i64>(7)?,
                ))
            },
        )
        .context("Could not load track metadata coverage")?;
    let cover_count = conn
        .query_row(
            "
            SELECT COUNT(DISTINCT a.id)
            FROM albums a
            JOIN album_covers c ON c.album_id = a.id
            ",
            [],
            |row| row.get::<_, i64>(0),
        )
        .context("Could not load artwork metadata coverage")?;

    Ok(vec![
        coverage_metric(
            "album-title",
            "Album title",
            "Albums",
            album_title_count,
            album_total,
        ),
        coverage_metric(
            "album-artist",
            "Album artist",
            "Albums",
            album_artist_count,
            album_total,
        ),
        coverage_metric("genre", "Genre", "Albums", genre_count, album_total),
        coverage_metric("year", "Year", "Albums", year_count, album_total),
        coverage_metric(
            "release-year",
            "Release year",
            "Albums",
            release_year_count,
            album_total,
        ),
        coverage_metric(
            "publisher",
            "Publisher",
            "Albums",
            publisher_count,
            album_total,
        ),
        coverage_metric(
            "track-title",
            "Track title",
            "Tracks",
            track_title_count,
            track_total,
        ),
        coverage_metric(
            "display-artist",
            "Display artist",
            "Tracks",
            display_artist_count,
            track_total,
        ),
        coverage_metric(
            "track-number",
            "Track number",
            "Tracks",
            track_number_count,
            track_total,
        ),
        coverage_metric(
            "disc-number",
            "Disc number",
            "Tracks",
            disc_number_count,
            track_total,
        ),
        coverage_metric(
            "duration",
            "Duration",
            "Tracks",
            duration_count,
            track_total,
        ),
        coverage_metric(
            "filename",
            "Filename",
            "Tracks",
            filename_count,
            track_total,
        ),
        coverage_metric(
            "cover-art",
            "Cover art",
            "Artwork",
            cover_count,
            album_total,
        ),
        coverage_metric(
            "track-rating",
            "Track rating",
            "Ratings",
            track_rating_count,
            track_total,
        ),
        coverage_metric(
            "album-rating",
            "Album rating",
            "Ratings",
            album_rating_count,
            album_total,
        ),
    ])
}

pub(super) fn loved_track_stats(conn: &Connection) -> Result<LovedTrackStats> {
    let (loved_tracks, albums_with_loved_tracks, average_loved_tracks_per_album) = conn
        .query_row(
            "
            SELECT
                COALESCE(SUM(loved_tracks), 0),
                COALESCE(SUM(CASE WHEN loved_tracks > 0 THEN 1 ELSE 0 END), 0),
                AVG(CASE WHEN loved_tracks > 0 THEN loved_tracks END)
            FROM albums
            ",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .context("Could not load loved-track totals")?;

    let top_loved_genre = conn
        .query_row(
            "
            SELECT canonical_genre
            FROM albums
            WHERE loved_tracks > 0
              AND NULLIF(TRIM(COALESCE(canonical_genre, '')), '') IS NOT NULL
            GROUP BY genre_normalized, canonical_genre
            ORDER BY SUM(loved_tracks) DESC, COUNT(*) DESC
            LIMIT 1
            ",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .context("Could not load top loved genre")?;

    let top_loved_year = conn
        .query_row(
            "
            SELECT year
            FROM albums
            WHERE loved_tracks > 0 AND year IS NOT NULL
            GROUP BY year
            ORDER BY SUM(loved_tracks) DESC, COUNT(*) DESC
            LIMIT 1
            ",
            [],
            |row| row.get::<_, i32>(0),
        )
        .optional()
        .context("Could not load top loved year")?;

    Ok(LovedTrackStats {
        loved_tracks,
        albums_with_loved_tracks,
        average_loved_tracks_per_album,
        top_loved_genre,
        top_loved_year,
    })
}

pub(super) fn rating_history(
    conn: &Connection,
    current_progress: &RatingProgressStats,
    overview: &LibraryOverviewStats,
) -> Result<Vec<RatingHistoryPoint>> {
    let mut stmt = conn.prepare(
        "
        SELECT
            s.import_run_id,
            s.created_at,
            s.track_count,
            s.album_count,
            s.rated_tracks,
            s.unrated_tracks,
            s.fully_rated_albums,
            s.partially_rated_albums,
            s.unrated_albums,
            s.albums_with_effective_rating,
            s.average_album_rating,
            s.average_album_score,
            COALESCE(r.rating_events_count, 0)
        FROM rating_snapshots s
        LEFT JOIN import_runs r ON r.id = s.import_run_id
        ORDER BY s.created_at ASC, s.id ASC
        ",
    )?;

    let mut points = stmt
        .query_map([], |row| {
            Ok(RatingHistoryPoint {
                import_run_id: row.get(0)?,
                created_at: row.get(1)?,
                track_count: row.get(2)?,
                album_count: row.get(3)?,
                rated_tracks: row.get(4)?,
                unrated_tracks: row.get(5)?,
                fully_rated_albums: row.get(6)?,
                partially_rated_albums: row.get(7)?,
                unrated_albums: row.get(8)?,
                albums_with_effective_rating: row.get(9)?,
                average_album_rating: row.get(10)?,
                average_album_score: row.get(11)?,
                rating_events_count: row.get(12)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    if points.is_empty() {
        if let Some(run) = list_import_runs(conn, 1)?.into_iter().next() {
            points.push(RatingHistoryPoint {
                import_run_id: run.id,
                created_at: run.completed_at.unwrap_or(run.started_at),
                track_count: overview.track_count,
                album_count: overview.album_count,
                rated_tracks: current_progress.rated_tracks,
                unrated_tracks: current_progress.unrated_tracks,
                fully_rated_albums: current_progress.fully_rated_albums,
                partially_rated_albums: current_progress.partially_rated_albums,
                unrated_albums: current_progress.unrated_albums,
                albums_with_effective_rating: current_progress.albums_with_effective_rating,
                average_album_rating: current_progress.average_album_rating,
                average_album_score: overview.average_album_score,
                rating_events_count: run.rating_events_count,
            });
        }
    }

    Ok(points)
}

pub(super) fn recent_rating_events(conn: &Connection, limit: u32) -> Result<Vec<RatingEvent>> {
    let mut stmt = conn.prepare(
        "
        SELECT
            id,
            import_run_id,
            created_at,
            event_type,
            album_id,
            album,
            album_artist_display,
            year,
            previous_rated_tracks,
            current_rated_tracks,
            previous_rating_completeness,
            current_rating_completeness,
            previous_effective_album_rating,
            current_effective_album_rating
        FROM rating_events
        ORDER BY id DESC
        LIMIT ?1
        ",
    )?;

    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(RatingEvent {
                id: row.get(0)?,
                import_run_id: row.get(1)?,
                created_at: row.get(2)?,
                event_type: row.get(3)?,
                album_id: row.get(4)?,
                album: row.get(5)?,
                album_artist_display: row.get(6)?,
                year: row.get(7)?,
                previous_rated_tracks: row.get(8)?,
                current_rated_tracks: row.get(9)?,
                previous_rating_completeness: row.get(10)?,
                current_rating_completeness: row.get(11)?,
                previous_effective_album_rating: row.get(12)?,
                current_effective_album_rating: row.get(13)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub fn get_import_run(conn: &Connection, id: i64) -> Result<ImportRun> {
    conn.query_row(
        "
        SELECT id, source_path, source_size_bytes, started_at, completed_at, status,
               track_rows, album_count, duration_ms, backup_path, error_message,
               added_tracks, changed_tracks, removed_tracks, added_albums,
               changed_albums, removed_albums, rating_events_count
        FROM import_runs
        WHERE id = ?1
        ",
        params![id],
        import_run_from_row,
    )
    .with_context(|| format!("Could not load import run {id}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::*;

    #[test]
    fn builds_bounded_library_profiles_without_named_rows_or_paths() {
        let conn = seeded_connection();
        let request = LibraryProfileRequest {
            sections: vec![
                "overview".to_string(),
                "ratingProgress".to_string(),
                "catalogShape".to_string(),
                "recentChange".to_string(),
            ],
        };

        let profile = library_profile(&conn, &request).expect("build library profile");

        assert_eq!(profile.sections, request.sections);
        assert!(profile.aggregate_points_shared > 0);
        assert_eq!(profile.payload["scope"]["namedRows"], 0);
        assert_eq!(profile.payload["sections"]["overview"]["albums"], 1);
        assert!(
            profile.payload["sections"]["catalogShape"]["anonymousArtistConcentration"].is_array()
        );
        let serialized = serde_json::to_string(&profile.payload).unwrap();
        assert!(!serialized.contains("Pet Shop Boys"));
        assert!(!serialized.contains("Actually"));
        assert!(!serialized.contains("\"filePath\":"));
        assert!(!serialized.contains("\"filename\":"));
        assert!(!serialized.contains("D:\\\\Music"));
        assert!(!serialized.contains("02 What Have I Done.mp3"));
    }

    #[test]
    fn rejects_duplicate_or_unbounded_library_profile_sections() {
        let conn = seeded_connection();
        let duplicate = LibraryProfileRequest {
            sections: vec!["overview".to_string(), "overview".to_string()],
        };
        assert!(library_profile(&conn, &duplicate)
            .unwrap_err()
            .to_string()
            .contains("more than once"));

        let too_many = LibraryProfileRequest {
            sections: vec![
                "overview".to_string(),
                "ratingProgress".to_string(),
                "catalogShape".to_string(),
                "tasteSignals".to_string(),
                "metadataHealth".to_string(),
            ],
        };
        assert!(library_profile(&conn, &too_many)
            .unwrap_err()
            .to_string()
            .contains("one to four"));
    }

    #[test]
    fn filters_year_progress_by_genre_groups_and_orders_oldest_first() {
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
                'mb:year-score', 1, 'year-score', 'The Action Score', 'Example Composer',
                'Action', 'action', 'Example', 2026, 2026,
                12, 12, 1.0, 3600, 1, 900, 0.25, 90, 225.0
            ),
            (
                'mb:year-rock', 1, 'year-rock', 'Early Rock', 'Example Band',
                'Rock', 'rock', 'Example', 1970, 1970,
                10, 5, 0.5, 3000, 0, 0, 0.0, 70, 35.0
            )
            ",
            [],
        )
        .expect("insert year progress albums");

        let scores = year_progress_stats_filtered(
            &conn,
            &YearProgressRequest {
                genres: vec!["scores".to_string()],
                excluded_genres: Vec::new(),
            },
        )
        .expect("filter year progress to scores");
        assert_eq!(scores.len(), 1);
        assert_eq!(scores[0].year, 2026);
        assert_eq!(scores[0].rated_album_count, 1);

        let without_scores = year_progress_stats_filtered(
            &conn,
            &YearProgressRequest {
                genres: Vec::new(),
                excluded_genres: vec!["score".to_string()],
            },
        )
        .expect("exclude scores from year progress");
        assert_eq!(
            without_scores
                .iter()
                .map(|row| row.year)
                .collect::<Vec<_>>(),
            vec![1970, 1987]
        );
        assert_eq!(without_scores[0].partial_album_count, 1);
        assert_eq!(without_scores[1].rated_album_count, 1);
    }

    #[test]
    fn filters_genre_progress_by_year_and_score_genre_group() {
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
                'mb:genre-score', 1, 'genre-score', 'The Action Score', 'Example Composer',
                'Action', 'action', 'Example', 2026, 2026,
                12, 12, 1.0, 3600, 1, 900, 0.25, 90, 225.0
            ),
            (
                'mb:genre-rock', 1, 'genre-rock', 'Early Rock', 'Example Band',
                'Rock', 'rock', 'Example', 1970, 1970,
                10, 5, 0.5, 3000, 2, 0, 0.0, 70, 35.0
            )
            ",
            [],
        )
        .expect("insert genre progress albums");

        let twentieth_century = genre_progress_stats_filtered(
            &conn,
            &GenreProgressRequest {
                year_from: Some(1970),
                year_to: Some(1999),
                genres: Vec::new(),
                excluded_genres: Vec::new(),
            },
        )
        .expect("filter genre progress by year");
        assert_eq!(
            twentieth_century
                .iter()
                .map(|row| row.genre.as_str())
                .collect::<Vec<_>>(),
            vec!["Rock", "Synthpop"]
        );
        assert_eq!(twentieth_century[0].partial_album_count, 1);

        let scores = genre_progress_stats_filtered(
            &conn,
            &GenreProgressRequest {
                year_from: None,
                year_to: None,
                genres: vec!["scores".to_string()],
                excluded_genres: Vec::new(),
            },
        )
        .expect("filter genre progress to scores");
        assert_eq!(scores.len(), 1);
        assert_eq!(scores[0].genre, "Action");
        assert_eq!(scores[0].rated_album_count, 1);

        let without_scores = genre_progress_stats_filtered(
            &conn,
            &GenreProgressRequest {
                year_from: None,
                year_to: None,
                genres: Vec::new(),
                excluded_genres: vec!["score".to_string()],
            },
        )
        .expect("exclude scores from genre progress");
        assert!(without_scores.iter().all(|row| row.genre != "Action"));
    }

    #[test]
    fn loads_statistics_dashboard_payload() {
        let conn = seeded_connection();

        let stats = statistics(&conn).expect("load statistics");

        assert_eq!(stats.overview.album_count, 1);
        assert_eq!(stats.rating_progress.fully_rated_albums, 1);
        assert_eq!(stats.year_progress[0].year, 1987);
        assert_eq!(stats.track_rating_distribution[0].label, "5");
    }

    #[test]
    fn country_catalog_statistics_count_current_library_artists_and_albums() {
        let conn = seeded_connection();
        insert_test_album(
            &conn,
            "mb:pet-shop-boys-second",
            "Pet Shop Boys",
            "Behaviour",
            1990,
            10,
        );
        conn.execute_batch(
            "
            INSERT INTO musicbrainz_origin_countries (
                country_code, country_name, created_at, updated_at
            ) VALUES
                ('GB', 'United Kingdom', '2026-08-02T00:00:00Z', '2026-08-02T00:00:00Z'),
                ('NO', 'Norway', '2026-08-02T00:00:00Z', '2026-08-02T00:00:00Z');

            INSERT INTO musicbrainz_artist_origin_countries (
                local_artist_key, display_artist, mbid, country_code, country_name,
                created_at, updated_at
            ) VALUES (
                'pet shop boys', 'Pet Shop Boys', 'mbid-pet-shop-boys', 'GB',
                'United Kingdom', '2026-08-02T00:00:00Z', '2026-08-02T00:00:00Z'
            );
            ",
        )
        .expect("insert country catalog fixtures");

        let stats = statistics(&conn).expect("load country catalog statistics");

        assert_eq!(stats.country_catalog.len(), 2);
        assert_eq!(stats.country_catalog[0].country_code, "NO");
        assert_eq!(stats.country_catalog[0].artist_count, 0);
        assert_eq!(stats.country_catalog[0].album_count, 0);
        assert_eq!(stats.country_catalog[1].country_code, "GB");
        assert_eq!(stats.country_catalog[1].artist_count, 1);
        assert_eq!(stats.country_catalog[1].album_count, 2);

        let explain_sql = format!("EXPLAIN QUERY PLAN {}", country_catalog_stats_sql());
        let mut plan_statement = conn
            .prepare(&explain_sql)
            .expect("prepare country catalog query plan");
        let plan = plan_statement
            .query_map([], |row| row.get::<_, String>(3))
            .expect("read country catalog query plan")
            .collect::<rusqlite::Result<Vec<_>>>()
            .expect("collect country catalog query plan");
        assert!(
            plan.iter()
                .any(|detail| { detail.contains("SCAN albums USING INDEX idx_albums_artist_key") }),
            "unexpected country catalog query plan: {plan:#?}"
        );
        assert_eq!(
            plan.iter()
                .filter(|detail| detail.contains("SCAN albums"))
                .count(),
            1,
            "country catalog should scan albums once: {plan:#?}"
        );
    }

    #[test]
    fn catalog_revision_ignores_newer_incomplete_imports() {
        let conn = seeded_connection();
        let initial_revision = catalog_revision(&conn).expect("read initial revision");
        conn.execute_batch(
            "
            INSERT INTO import_runs (source_path, started_at, status)
            VALUES ('running.tsv', '2026-08-24T10:00:00Z', 'running');
            INSERT INTO import_runs (source_path, started_at, status)
            VALUES ('failed.tsv', '2026-08-24T10:01:00Z', 'failed');
            ",
        )
        .expect("insert incomplete imports");

        assert_eq!(
            catalog_revision(&conn).expect("read revision"),
            initial_revision
        );

        conn.execute(
            "INSERT INTO import_runs (source_path, started_at, status) VALUES (?1, ?2, 'completed')",
            params!["aurora://folder", "2026-08-24T10:02:00Z"],
        )
        .expect("insert completed Aurora import");

        assert_ne!(
            catalog_revision(&conn).expect("read revision"),
            initial_revision
        );
    }

    #[test]
    fn catalog_revision_changes_when_imports_complete_out_of_id_order() {
        let conn = seeded_connection();
        conn.execute_batch(
            "
            INSERT INTO import_runs (source_path, started_at, status)
            VALUES ('older-running.tsv', '2026-08-24T10:00:00Z', 'running');
            INSERT INTO import_runs (source_path, started_at, completed_at, status)
            VALUES (
                'newer-completed.tsv',
                '2026-08-24T10:01:00Z',
                '2026-08-24T10:02:00Z',
                'completed'
            );
            ",
        )
        .expect("insert overlapping imports");

        let revision_after_newer = catalog_revision(&conn).expect("read newer revision");
        let maximum_id_after_newer: i64 = conn
            .query_row(
                "SELECT MAX(id) FROM import_runs WHERE status = 'completed'",
                [],
                |row| row.get(0),
            )
            .expect("read maximum completed id");

        conn.execute(
            "UPDATE import_runs
             SET status = 'completed', completed_at = '2026-08-24T10:03:00Z'
             WHERE source_path = 'older-running.tsv'",
            [],
        )
        .expect("complete older import last");

        let maximum_id_after_older: i64 = conn
            .query_row(
                "SELECT MAX(id) FROM import_runs WHERE status = 'completed'",
                [],
                |row| row.get(0),
            )
            .expect("read unchanged maximum completed id");
        assert_eq!(maximum_id_after_older, maximum_id_after_newer);
        assert_ne!(
            catalog_revision(&conn).expect("read older completion revision"),
            revision_after_newer
        );
    }
}
