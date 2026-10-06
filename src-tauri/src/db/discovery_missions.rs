use super::*;

pub(super) fn discovery_heatmap(conn: &Connection) -> Result<Vec<DiscoveryHeatmapCell>> {
    let mut stmt = conn.prepare(
        "
        WITH album_projection AS (
            SELECT
                COALESCE(NULLIF(TRIM(LOWER(genre_normalized)), ''), 'unknown') AS genre_id,
                COALESCE(NULLIF(TRIM(canonical_genre), ''), 'Unknown') AS genre,
                year,
                rating_completeness,
                album_score,
                total_tracks,
                loved_tracks
            FROM albums
            WHERE year IS NOT NULL
              AND NULLIF(TRIM(COALESCE(genre_normalized, '')), '') IS NOT NULL
        ),
        top_genres AS (
            SELECT
                genre_id
            FROM album_projection
            GROUP BY genre_id
            ORDER BY COUNT(*) DESC, LOWER(MIN(genre)) ASC
            LIMIT 100
        )
        SELECT
            genre_id,
            MIN(genre),
            year,
            COUNT(*),
            SUM(CASE WHEN rating_completeness >= 1.0 THEN 1 ELSE 0 END),
            SUM(CASE WHEN rating_completeness > 0.0 AND rating_completeness < 1.0 THEN 1 ELSE 0 END),
            SUM(CASE WHEN rating_completeness = 0.0 THEN 1 ELSE 0 END),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(loved_tracks), 0),
            AVG(rating_completeness),
            AVG(album_score)
        FROM album_projection
        WHERE genre_id IN (SELECT genre_id FROM top_genres)
        GROUP BY genre_id, year
        ORDER BY LOWER(MIN(genre)), year ASC
        ",
    )?;

    let rows = stmt
        .query_map([], |row| {
            Ok(DiscoveryHeatmapCell {
                genre_id: row.get(0)?,
                genre: row.get(1)?,
                year: row.get(2)?,
                album_count: row.get(3)?,
                rated_album_count: row.get(4)?,
                partial_album_count: row.get(5)?,
                unrated_album_count: row.get(6)?,
                track_count: row.get(7)?,
                loved_tracks: row.get(8)?,
                average_rating_completeness: row.get(9)?,
                average_album_score: row.get(10)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load discovery heatmap")?;
    Ok(rows)
}

pub(super) fn discovery_backlog_missions(conn: &Connection) -> Result<Vec<DiscoveryMission>> {
    let mut missions = Vec::new();

    push_discovery_mission(
        &mut missions,
        discovery_global_mission(
            conn,
            "finish-high-score-partials",
            "Finish high-score partials",
            "Partially rated albums with the strongest Album Score signals.",
            "Open top partials",
            "rating_completeness > 0.0 AND rating_completeness < 1.0 AND album_score IS NOT NULL",
            Some(1),
            None,
            Some(99.0),
            None,
            "albumScore",
            20,
        )?,
    );
    push_discovery_mission(
        &mut missions,
        discovery_decade_mission(
            conn,
            "neglected-decade",
            "Rate a neglected decade",
            "The decade with the largest unfinished album pile.",
            "Open decade backlog",
            "
            SELECT
                CAST((year / 10) * 10 AS INTEGER) AS decade,
                COUNT(*),
                COALESCE(SUM(total_tracks), 0),
                COALESCE(SUM(loved_tracks), 0),
                AVG(album_score),
                AVG(rating_completeness)
            FROM albums
            WHERE year IS NOT NULL AND rating_completeness < 1.0
            GROUP BY decade
            HAVING COUNT(*) >= 5
            ORDER BY COUNT(*) DESC, COALESCE(AVG(album_score), 0) DESC
            LIMIT 1
            ",
            Some(99.0),
            "albumScore",
            50,
        )?,
    );
    push_discovery_mission(&mut missions, discovery_high_potential_genre_mission(conn)?);
    push_discovery_mission(
        &mut missions,
        discovery_global_mission(
            conn,
            "loved-tracks-waiting",
            "Loved tracks waiting",
            "Albums with loved tracks that still are not fully rated.",
            "Open loved backlog",
            "loved_tracks > 0 AND rating_completeness < 1.0",
            None,
            None,
            Some(99.0),
            Some(1),
            "lovedTracks",
            30,
        )?,
    );
    push_discovery_mission(&mut missions, discovery_artist_backlog_mission(conn)?);
    push_discovery_mission(
        &mut missions,
        discovery_global_mission(
            conn,
            "unfinished-time-monsters",
            "Unfinished time monsters",
            "Long, high-TMOE albums that deserve a deliberate pass.",
            "Open time monsters",
            "rating_completeness < 1.0 AND tmoe_seconds > 0",
            None,
            None,
            Some(99.0),
            None,
            "tmoe",
            25,
        )?,
    );

    Ok(missions)
}

pub(super) fn discovery_smart_missions(conn: &Connection) -> Result<Vec<DiscoveryMission>> {
    let mut missions = Vec::new();

    push_discovery_mission(
        &mut missions,
        discovery_high_score_partial_decade_mission(conn)?,
    );
    push_discovery_mission(
        &mut missions,
        discovery_loved_incomplete_genre_mission(conn)?,
    );
    push_discovery_mission(
        &mut missions,
        discovery_unrated_high_potential_genre_mission(conn)?,
    );
    push_discovery_mission(&mut missions, discovery_loved_decade_mission(conn)?);
    push_discovery_mission(&mut missions, discovery_artist_partial_score_mission(conn)?);
    push_discovery_mission(
        &mut missions,
        discovery_global_mission(
            conn,
            "smart-loved-score-outliers",
            "Loved outliers to inspect",
            "Loved albums sorted by the biggest score signals.",
            "Open loved outliers",
            "loved_tracks > 0 AND album_score IS NOT NULL",
            None,
            None,
            None,
            Some(1),
            "albumScore",
            20,
        )?,
    );

    Ok(missions)
}

pub(super) fn push_discovery_mission(
    missions: &mut Vec<DiscoveryMission>,
    mission: Option<DiscoveryMission>,
) {
    if let Some(mission) = mission {
        missions.push(mission);
    }
}

pub(super) fn discovery_global_mission(
    conn: &Connection,
    id: &str,
    title: &str,
    description: &str,
    action_label: &str,
    where_sql: &str,
    rated_tracks_min: Option<i64>,
    rating_completeness_min: Option<f64>,
    rating_completeness_max: Option<f64>,
    loved_tracks_min: Option<i64>,
    sort_field: &str,
    limit: u32,
) -> Result<Option<DiscoveryMission>> {
    let sql = format!(
        "
        SELECT
            COUNT(*),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(loved_tracks), 0),
            AVG(album_score),
            AVG(rating_completeness)
        FROM albums
        WHERE {where_sql}
        "
    );
    let stats = conn
        .query_row(&sql, [], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, Option<f64>>(3)?,
                row.get::<_, Option<f64>>(4)?,
            ))
        })
        .with_context(|| format!("Could not load discovery mission {id}"))?;

    let (album_count, track_count, loved_tracks, average_album_score, average_rating_completeness) =
        stats;
    if album_count == 0 {
        return Ok(None);
    }

    Ok(Some(DiscoveryMission {
        id: id.to_string(),
        title: title.to_string(),
        description: description.to_string(),
        action_label: action_label.to_string(),
        album_count,
        track_count,
        loved_tracks,
        average_album_score,
        average_rating_completeness,
        genre_id: None,
        genre: None,
        artist_id: None,
        artist: None,
        year_from: None,
        year_to: None,
        rated_tracks_min,
        rating_completeness_min,
        rating_completeness_max,
        loved_tracks_min,
        sort_field: sort_field.to_string(),
        sort_direction: "desc".to_string(),
        limit,
    }))
}

pub(super) fn discovery_decade_mission(
    conn: &Connection,
    id: &str,
    title: &str,
    description: &str,
    action_label: &str,
    sql: &str,
    rating_completeness_max: Option<f64>,
    sort_field: &str,
    limit: u32,
) -> Result<Option<DiscoveryMission>> {
    let row = conn
        .query_row(sql, [], |row| {
            Ok((
                row.get::<_, i32>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, Option<f64>>(4)?,
                row.get::<_, Option<f64>>(5)?,
            ))
        })
        .optional()
        .with_context(|| format!("Could not load discovery mission {id}"))?;

    let Some((
        decade,
        album_count,
        track_count,
        loved_tracks,
        average_album_score,
        average_rating_completeness,
    )) = row
    else {
        return Ok(None);
    };

    Ok(Some(DiscoveryMission {
        id: id.to_string(),
        title: title.to_string(),
        description: format!(
            "{description} {album_count} albums from the {decade}s are still open."
        ),
        action_label: action_label.to_string(),
        album_count,
        track_count,
        loved_tracks,
        average_album_score,
        average_rating_completeness,
        genre_id: None,
        genre: None,
        artist_id: None,
        artist: None,
        year_from: Some(decade),
        year_to: Some(decade + 9),
        rated_tracks_min: None,
        rating_completeness_min: None,
        rating_completeness_max,
        loved_tracks_min: None,
        sort_field: sort_field.to_string(),
        sort_direction: "desc".to_string(),
        limit,
    }))
}

pub(super) fn discovery_high_potential_genre_mission(
    conn: &Connection,
) -> Result<Option<DiscoveryMission>> {
    let sql = "
        SELECT
            COALESCE(NULLIF(TRIM(LOWER(genre_normalized)), ''), 'unknown') AS genre_id,
            COALESCE(MIN(NULLIF(TRIM(canonical_genre), '')), 'Unknown') AS genre,
            COUNT(*),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(loved_tracks), 0),
            AVG(album_score),
            AVG(rating_completeness)
        FROM albums
        WHERE rating_completeness < 1.0
          AND NULLIF(TRIM(COALESCE(genre_normalized, '')), '') IS NOT NULL
        GROUP BY genre_id
        HAVING COUNT(*) >= 5
        ORDER BY COALESCE(AVG(album_score), 0) DESC, COUNT(*) DESC
        LIMIT 1
    ";
    let row = conn
        .query_row(sql, [], discovery_group_mission_row)
        .optional()
        .context("Could not load high-potential genre mission")?;

    Ok(row.map(
        |(
            genre_id,
            genre,
            album_count,
            track_count,
            loved_tracks,
            average_album_score,
            average_rating_completeness,
        )| {
            DiscoveryMission {
                id: "high-potential-genre".to_string(),
                title: format!("High-potential {genre}"),
                description: "A genre backlog with unusually strong scored-album signals."
                    .to_string(),
                action_label: "Open genre backlog".to_string(),
                album_count,
                track_count,
                loved_tracks,
                average_album_score,
                average_rating_completeness,
                genre_id: Some(genre_id),
                genre: Some(genre),
                artist_id: None,
                artist: None,
                year_from: None,
                year_to: None,
                rated_tracks_min: None,
                rating_completeness_min: None,
                rating_completeness_max: Some(99.0),
                loved_tracks_min: None,
                sort_field: "albumScore".to_string(),
                sort_direction: "desc".to_string(),
                limit: 40,
            }
        },
    ))
}

pub(super) fn discovery_artist_backlog_mission(
    conn: &Connection,
) -> Result<Option<DiscoveryMission>> {
    let album_artist_key_sql = artist_key_sql("album_artist_display");
    let sql = format!(
        "
        SELECT
            {album_artist_key_sql} AS artist_id,
            COALESCE(MIN(NULLIF(TRIM(album_artist_display), '')), 'Unknown Artist') AS artist,
            COUNT(*),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(loved_tracks), 0),
            AVG(album_score),
            AVG(rating_completeness)
        FROM albums
        WHERE rating_completeness < 1.0
          AND NULLIF(TRIM(COALESCE(album_artist_display, '')), '') IS NOT NULL
        GROUP BY artist_id
        HAVING COUNT(*) >= 5
        ORDER BY COUNT(*) DESC, COALESCE(AVG(album_score), 0) DESC
        LIMIT 1
    "
    );
    let row = conn
        .query_row(&sql, [], discovery_group_mission_row)
        .optional()
        .context("Could not load artist backlog mission")?;

    Ok(row.map(
        |(
            artist_id,
            artist,
            album_count,
            track_count,
            loved_tracks,
            average_album_score,
            average_rating_completeness,
        )| {
            DiscoveryMission {
                id: "artist-deep-dive".to_string(),
                title: format!("{artist} deep dive"),
                description: "A large artist catalog with unfinished albums.".to_string(),
                action_label: "Open artist backlog".to_string(),
                album_count,
                track_count,
                loved_tracks,
                average_album_score,
                average_rating_completeness,
                genre_id: None,
                genre: None,
                artist_id: Some(artist_id),
                artist: Some(artist),
                year_from: None,
                year_to: None,
                rated_tracks_min: None,
                rating_completeness_min: None,
                rating_completeness_max: Some(99.0),
                loved_tracks_min: None,
                sort_field: "year".to_string(),
                sort_direction: "asc".to_string(),
                limit: 50,
            }
        },
    ))
}

pub(super) fn discovery_high_score_partial_decade_mission(
    conn: &Connection,
) -> Result<Option<DiscoveryMission>> {
    discovery_decade_mission(
        conn,
        "smart-high-score-partial-decade",
        "20 high-score partial albums",
        "Best partial-album cluster.",
        "Open partial decade",
        "
        SELECT
            CAST((year / 10) * 10 AS INTEGER) AS decade,
            COUNT(*),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(loved_tracks), 0),
            AVG(album_score),
            AVG(rating_completeness)
        FROM albums
        WHERE year IS NOT NULL
          AND rating_completeness > 0.0
          AND rating_completeness < 1.0
          AND album_score IS NOT NULL
        GROUP BY decade
        HAVING COUNT(*) >= 5
        ORDER BY COALESCE(AVG(album_score), 0) DESC, COUNT(*) DESC
        LIMIT 1
        ",
        Some(99.0),
        "albumScore",
        20,
    )
    .map(|mission| {
        mission.map(|mut mission| {
            if let Some(year_from) = mission.year_from {
                mission.title = format!("20 high-score partial albums from the {year_from}s");
            }
            mission.rated_tracks_min = Some(1);
            mission
        })
    })
}

pub(super) fn discovery_loved_incomplete_genre_mission(
    conn: &Connection,
) -> Result<Option<DiscoveryMission>> {
    let sql = "
        SELECT
            COALESCE(NULLIF(TRIM(LOWER(genre_normalized)), ''), 'unknown') AS genre_id,
            COALESCE(MIN(NULLIF(TRIM(canonical_genre), '')), 'Unknown') AS genre,
            COUNT(*),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(loved_tracks), 0),
            AVG(album_score),
            AVG(rating_completeness)
        FROM albums
        WHERE loved_tracks > 0
          AND rating_completeness < 1.0
          AND NULLIF(TRIM(COALESCE(genre_normalized, '')), '') IS NOT NULL
        GROUP BY genre_id
        HAVING COUNT(*) >= 3
        ORDER BY COALESCE(SUM(loved_tracks), 0) DESC, COUNT(*) DESC
        LIMIT 1
    ";
    discovery_genre_smart_mission(
        conn,
        sql,
        "smart-loved-incomplete-genre",
        |genre| format!("Loved but incomplete {genre} albums"),
        "A loved-track rich genre that still has unfinished albums.",
        "Open loved genre",
        Some(99.0),
        Some(1),
        "lovedTracks",
        20,
    )
}

pub(super) fn discovery_unrated_high_potential_genre_mission(
    conn: &Connection,
) -> Result<Option<DiscoveryMission>> {
    let sql = "
        SELECT
            COALESCE(NULLIF(TRIM(LOWER(genre_normalized)), ''), 'unknown') AS genre_id,
            COALESCE(MIN(NULLIF(TRIM(canonical_genre), '')), 'Unknown') AS genre,
            SUM(CASE WHEN rating_completeness = 0.0 THEN 1 ELSE 0 END) AS unrated_album_count,
            COALESCE(SUM(CASE WHEN rating_completeness = 0.0 THEN total_tracks ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN rating_completeness = 0.0 THEN loved_tracks ELSE 0 END), 0),
            AVG(album_score),
            AVG(rating_completeness)
        FROM albums
        WHERE NULLIF(TRIM(COALESCE(genre_normalized, '')), '') IS NOT NULL
        GROUP BY genre_id
        HAVING unrated_album_count >= 5 AND AVG(album_score) IS NOT NULL
        ORDER BY COALESCE(AVG(album_score), 0) DESC, unrated_album_count DESC
        LIMIT 1
    ";
    discovery_genre_smart_mission(
        conn,
        sql,
        "smart-unrated-high-potential-genre",
        |genre| format!("Unrated {genre} waiting room"),
        "A fully unrated genre pocket whose rated neighbors score well.",
        "Open unrated genre",
        Some(0.0),
        None,
        "year",
        30,
    )
}

pub(super) fn discovery_loved_decade_mission(
    conn: &Connection,
) -> Result<Option<DiscoveryMission>> {
    discovery_decade_mission(
        conn,
        "smart-loved-decade-cleanup",
        "Loved-track decade cleanup",
        "Loved albums from one decade still need attention.",
        "Open loved decade",
        "
        SELECT
            CAST((year / 10) * 10 AS INTEGER) AS decade,
            COUNT(*),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(loved_tracks), 0),
            AVG(album_score),
            AVG(rating_completeness)
        FROM albums
        WHERE year IS NOT NULL
          AND loved_tracks > 0
          AND rating_completeness < 1.0
        GROUP BY decade
        HAVING COUNT(*) >= 3
        ORDER BY COALESCE(SUM(loved_tracks), 0) DESC, COUNT(*) DESC
        LIMIT 1
        ",
        Some(99.0),
        "lovedTracks",
        20,
    )
    .map(|mission| {
        mission.map(|mut mission| {
            if let Some(year_from) = mission.year_from {
                mission.title = format!("{year_from}s loved-track cleanup");
            }
            mission.loved_tracks_min = Some(1);
            mission
        })
    })
}

pub(super) fn discovery_artist_partial_score_mission(
    conn: &Connection,
) -> Result<Option<DiscoveryMission>> {
    let album_artist_key_sql = artist_key_sql("album_artist_display");
    let sql = format!(
        "
        SELECT
            {album_artist_key_sql} AS artist_id,
            COALESCE(MIN(NULLIF(TRIM(album_artist_display), '')), 'Unknown Artist') AS artist,
            COUNT(*),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(loved_tracks), 0),
            AVG(album_score),
            AVG(rating_completeness)
        FROM albums
        WHERE rating_completeness > 0.0
          AND rating_completeness < 1.0
          AND album_score IS NOT NULL
          AND NULLIF(TRIM(COALESCE(album_artist_display, '')), '') IS NOT NULL
        GROUP BY artist_id
        HAVING COUNT(*) >= 3
        ORDER BY COALESCE(AVG(album_score), 0) DESC, COUNT(*) DESC
        LIMIT 1
    "
    );
    let row = conn
        .query_row(&sql, [], discovery_group_mission_row)
        .optional()
        .context("Could not load artist partial score mission")?;

    Ok(row.map(
        |(
            artist_id,
            artist,
            album_count,
            track_count,
            loved_tracks,
            average_album_score,
            average_rating_completeness,
        )| {
            DiscoveryMission {
                id: "smart-artist-partial-score".to_string(),
                title: format!("{artist} partial-score sprint"),
                description: "A focused set of partial albums from a high-scoring artist pocket."
                    .to_string(),
                action_label: "Open artist sprint".to_string(),
                album_count,
                track_count,
                loved_tracks,
                average_album_score,
                average_rating_completeness,
                genre_id: None,
                genre: None,
                artist_id: Some(artist_id),
                artist: Some(artist),
                year_from: None,
                year_to: None,
                rated_tracks_min: Some(1),
                rating_completeness_min: None,
                rating_completeness_max: Some(99.0),
                loved_tracks_min: None,
                sort_field: "albumScore".to_string(),
                sort_direction: "desc".to_string(),
                limit: 20,
            }
        },
    ))
}

pub(super) fn discovery_genre_smart_mission(
    conn: &Connection,
    sql: &str,
    id: &str,
    title: impl FnOnce(&str) -> String,
    description: &str,
    action_label: &str,
    rating_completeness_max: Option<f64>,
    loved_tracks_min: Option<i64>,
    sort_field: &str,
    limit: u32,
) -> Result<Option<DiscoveryMission>> {
    let row = conn
        .query_row(sql, [], discovery_group_mission_row)
        .optional()
        .with_context(|| format!("Could not load discovery mission {id}"))?;

    Ok(row.map(
        |(
            genre_id,
            genre,
            album_count,
            track_count,
            loved_tracks,
            average_album_score,
            average_rating_completeness,
        )| {
            DiscoveryMission {
                id: id.to_string(),
                title: title(&genre),
                description: description.to_string(),
                action_label: action_label.to_string(),
                album_count,
                track_count,
                loved_tracks,
                average_album_score,
                average_rating_completeness,
                genre_id: Some(genre_id),
                genre: Some(genre),
                artist_id: None,
                artist: None,
                year_from: None,
                year_to: None,
                rated_tracks_min: None,
                rating_completeness_min: None,
                rating_completeness_max,
                loved_tracks_min,
                sort_field: sort_field.to_string(),
                sort_direction: "desc".to_string(),
                limit,
            }
        },
    ))
}

pub(super) fn discovery_group_mission_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<(String, String, i64, i64, i64, Option<f64>, Option<f64>)> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
    ))
}

pub(super) fn discovery_love_rating_points(conn: &Connection) -> Result<Vec<DiscoveryAlbumPoint>> {
    let mut stmt = conn.prepare(
        "
        SELECT
            id,
            album,
            album_artist_display,
            NULLIF(TRIM(LOWER(genre_normalized)), ''),
            NULLIF(TRIM(canonical_genre), ''),
            year,
            loved_tracks,
            album_score,
            effective_album_rating,
            rating_completeness,
            total_seconds
        FROM albums
        WHERE album_score IS NOT NULL OR loved_tracks > 0
        ORDER BY loved_tracks DESC, album_score DESC, effective_album_rating DESC
        LIMIT 240
        ",
    )?;

    let rows = stmt
        .query_map([], |row| {
            Ok(DiscoveryAlbumPoint {
                album_id: row.get(0)?,
                album: row.get(1)?,
                album_artist_display: row.get(2)?,
                genre_id: row.get(3)?,
                genre: row.get(4)?,
                year: row.get(5)?,
                loved_tracks: row.get(6)?,
                album_score: row.get(7)?,
                effective_album_rating: row.get(8)?,
                rating_completeness: row.get(9)?,
                total_seconds: row.get(10)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load discovery love/rating points")?;
    Ok(rows)
}

pub(super) fn discovery_genre_points(conn: &Connection) -> Result<Vec<DiscoveryGenrePoint>> {
    let mut stmt = conn.prepare(
        "
        SELECT
            COALESCE(NULLIF(TRIM(LOWER(genre_normalized)), ''), 'unknown') AS genre_id,
            COALESCE(MIN(NULLIF(TRIM(canonical_genre), '')), 'Unknown') AS genre,
            COUNT(*),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(loved_tracks), 0),
            COALESCE(SUM(total_seconds), 0),
            SUM(CASE WHEN rating_completeness > 0.0 AND rating_completeness < 1.0 THEN 1 ELSE 0 END),
            SUM(CASE WHEN rating_completeness = 0.0 THEN 1 ELSE 0 END),
            AVG(rating_completeness),
            AVG(album_score)
        FROM albums
        WHERE NULLIF(TRIM(COALESCE(genre_normalized, '')), '') IS NOT NULL
        GROUP BY genre_id
        ORDER BY COUNT(*) DESC, COALESCE(AVG(album_score), 0) DESC
        LIMIT 42
        ",
    )?;

    let rows = stmt
        .query_map([], |row| {
            Ok(DiscoveryGenrePoint {
                genre_id: row.get(0)?,
                genre: row.get(1)?,
                album_count: row.get(2)?,
                track_count: row.get(3)?,
                loved_tracks: row.get(4)?,
                total_seconds: row.get(5)?,
                partial_album_count: row.get(6)?,
                unrated_album_count: row.get(7)?,
                average_rating_completeness: row.get(8)?,
                average_album_score: row.get(9)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load discovery genre points")?;
    Ok(rows)
}

pub(super) fn discovery_artist_points(conn: &Connection) -> Result<Vec<DiscoveryArtistPoint>> {
    let album_artist_key_sql = artist_key_sql("album_artist_display");
    let album_artist_key_sql_a2 = artist_key_sql("a2.album_artist_display");
    let sql = format!(
        "
        WITH grouped AS (
            SELECT
                {album_artist_key_sql} AS artist_id,
                COALESCE(MIN(NULLIF(TRIM(album_artist_display), '')), 'Unknown Artist') AS artist,
                COUNT(*) AS album_count,
                COALESCE(SUM(total_tracks), 0) AS track_count,
                COALESCE(SUM(loved_tracks), 0) AS loved_tracks,
                COALESCE(SUM(total_seconds), 0) AS total_seconds,
                SUM(CASE WHEN rating_completeness > 0.0 AND rating_completeness < 1.0 THEN 1 ELSE 0 END) AS partial_album_count,
                SUM(CASE WHEN rating_completeness = 0.0 THEN 1 ELSE 0 END) AS unrated_album_count,
                AVG(rating_completeness) AS average_rating_completeness,
                AVG(album_score) AS average_album_score
            FROM albums
            WHERE NULLIF(TRIM(COALESCE(album_artist_display, '')), '') IS NOT NULL
            GROUP BY artist_id
        )
        SELECT
            artist_id,
            artist,
            album_count,
            track_count,
            loved_tracks,
            total_seconds,
            partial_album_count,
            unrated_album_count,
            average_rating_completeness,
            average_album_score,
            (
                SELECT COALESCE(NULLIF(TRIM(a2.canonical_genre), ''), 'Unknown')
                FROM albums a2
                WHERE {album_artist_key_sql_a2} = grouped.artist_id
                GROUP BY COALESCE(NULLIF(TRIM(LOWER(a2.genre_normalized)), ''), 'unknown')
                ORDER BY COUNT(*) DESC, LOWER(COALESCE(a2.canonical_genre, '')) ASC
                LIMIT 1
            ) AS top_genre
        FROM grouped
        ORDER BY album_count DESC, loved_tracks DESC, LOWER(artist) ASC
        LIMIT 64
        "
    );
    let mut stmt = conn.prepare(&sql)?;

    let rows = stmt
        .query_map([], |row| {
            Ok(DiscoveryArtistPoint {
                artist_id: row.get(0)?,
                artist: row.get(1)?,
                album_count: row.get(2)?,
                track_count: row.get(3)?,
                loved_tracks: row.get(4)?,
                total_seconds: row.get(5)?,
                partial_album_count: row.get(6)?,
                unrated_album_count: row.get(7)?,
                average_rating_completeness: row.get(8)?,
                average_album_score: row.get(9)?,
                top_genre: row.get(10)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load discovery artist points")?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::*;

    #[test]
    fn discovery_heatmap_returns_every_populated_year_for_top_genres() {
        let conn = seeded_connection();
        for year in 1945..=1964 {
            insert_test_album(
                &conn,
                &format!("heatmap-rock-{year}"),
                "Heatmap Artist",
                &format!("Heatmap Album {year}"),
                year,
                10,
            );
        }

        let rows = discovery_heatmap(&conn).expect("load discovery heatmap");
        let rock_years = rows
            .iter()
            .filter(|cell| cell.genre_id == "rock")
            .map(|cell| cell.year)
            .collect::<Vec<_>>();

        assert_eq!(rock_years, (1945..=1964).collect::<Vec<_>>());
    }
}
