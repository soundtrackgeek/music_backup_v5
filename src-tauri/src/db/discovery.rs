use super::*;

#[cfg(not(test))]
pub fn discovery_for_app(
    app: &AppHandle,
    refresh_daily_edition: bool,
) -> Result<DiscoveryResponse> {
    let (conn, _) = open(app)?;
    discovery(&conn, refresh_daily_edition)
}

#[cfg(not(test))]
pub fn discovery_daily_edition_for_app(
    app: &AppHandle,
    date: &str,
) -> Result<DiscoveryDailyEditionSnapshotResponse> {
    let (conn, _) = open(app)?;
    let today = Local::now().date_naive();
    let requested_date = NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .context("Daily Edition date must use YYYY-MM-DD")?;
    discovery_daily_edition_snapshot(&conn, requested_date, today, false)
}

#[cfg(not(test))]
pub fn discovery_source_health_for_app(
    app: &AppHandle,
    date: &str,
) -> Result<DiscoverySourceHealthResponse> {
    let (conn, _) = open(app)?;
    let requested_date = NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .context("Daily Edition source-health date must use YYYY-MM-DD")?;
    discovery_source_health(&conn, requested_date, Utc::now())
}

#[cfg(not(test))]
pub fn rebuild_discovery_chart_matches_for_app(
    app: &AppHandle,
    date: &str,
) -> Result<DiscoverySourceHealthResponse> {
    let (conn, _) = open(app)?;
    let requested_date = NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .context("Daily Edition source-health date must use YYYY-MM-DD")?;
    let transaction = conn
        .unchecked_transaction()
        .context("Could not start chart match rebuild")?;
    reconcile_album_chart_matches(&transaction)?;
    reconcile_track_chart_matches(&transaction)?;
    transaction
        .commit()
        .context("Could not commit chart match rebuild")?;
    discovery_source_health(&conn, requested_date, Utc::now())
}

#[cfg(not(test))]
pub fn discovery_anniversaries_for_app(
    app: &AppHandle,
    anniversary_years: i32,
) -> Result<Vec<DiscoveryAnniversaryStory>> {
    let (conn, _) = open(app)?;
    discovery_anniversaries(
        &conn,
        Local::now().date_naive(),
        anniversary_years.clamp(1, 100),
    )
}

#[cfg(not(test))]
pub fn discovery_chart_snapshot_for_app(
    app: &AppHandle,
    request: DiscoveryChartSnapshotRequest,
) -> Result<DiscoveryChartSnapshot> {
    let (conn, _) = open(app)?;
    discovery_chart_snapshot(&conn, &request)
}

#[cfg(not(test))]
pub fn discovery_deep_cut_snapshot_for_app(
    app: &AppHandle,
    request: DiscoveryDeepCutSnapshotRequest,
) -> Result<DiscoveryDeepCutSnapshot> {
    let (conn, _) = open(app)?;
    discovery_deep_cut_snapshot(&conn, &request)
}

#[cfg(not(test))]
pub fn discovery_completion_snapshot_for_app(
    app: &AppHandle,
    request: DiscoveryCompletionSnapshotRequest,
) -> Result<DiscoveryCompletionSnapshot> {
    let (conn, _) = open(app)?;
    discovery_completion_snapshot(&conn, &request)
}

#[cfg(not(test))]
pub fn discovery_recommendation_snapshot_for_app(
    app: &AppHandle,
    request: DiscoveryRecommendationSnapshotRequest,
) -> Result<DiscoveryRecommendationSnapshot> {
    let (conn, _) = open(app)?;
    discovery_recommendation_snapshot(&conn, &request)
}

#[cfg(not(test))]
pub fn discovery_mixer_seed_options_for_app(
    app: &AppHandle,
    request: DiscoveryMixerSeedSearchRequest,
) -> Result<Vec<DiscoveryMixerSeedOption>> {
    let (conn, _) = open(app)?;
    discovery_mixer_seed_options(&conn, &request)
}

#[cfg(not(test))]
pub fn discovery_mixer_for_app(
    app: &AppHandle,
    request: DiscoveryMixerRequest,
) -> Result<DiscoveryMixerResponse> {
    let (conn, _) = open(app)?;
    discovery_mixer(&conn, &request)
}

#[cfg(not(test))]
pub fn discovery_shelf_explorer_for_app(
    app: &AppHandle,
    request: DiscoveryShelfExplorerRequest,
) -> Result<DiscoveryShelfExplorerResponse> {
    let (conn, _) = open(app)?;
    discovery_shelf_explorer(&conn, &request)
}

pub(super) fn discovery(
    conn: &Connection,
    refresh_daily_edition: bool,
) -> Result<DiscoveryResponse> {
    let generated_at = list_import_runs(conn, 1)?
        .into_iter()
        .next()
        .map(|run| run.completed_at.unwrap_or(run.started_at));
    let today = Local::now().date_naive();
    let daily_edition =
        discovery_daily_edition_snapshot(conn, today, today, refresh_daily_edition)?;

    Ok(DiscoveryResponse {
        daily_edition: daily_edition.daily_edition,
        daily_edition_archive: daily_edition.archive,
        heatmap: discovery_heatmap(conn)?,
        backlog_missions: discovery_backlog_missions(conn)?,
        smart_missions: discovery_smart_missions(conn)?,
        love_rating_points: discovery_love_rating_points(conn)?,
        genre_points: discovery_genre_points(conn)?,
        artist_points: discovery_artist_points(conn)?,
        generated_at,
    })
}

pub(super) fn discovery_daily_edition_snapshot(
    conn: &Connection,
    requested_date: NaiveDate,
    today: NaiveDate,
    refresh: bool,
) -> Result<DiscoveryDailyEditionSnapshotResponse> {
    if requested_date > today {
        bail!("Daily Edition snapshots cannot be opened for a future date");
    }
    if refresh && requested_date != today {
        bail!("Archived Daily Editions are immutable");
    }

    prune_daily_edition_snapshots(conn, today)?;
    let requested_key = requested_date.format("%Y-%m-%d").to_string();
    let stored = if refresh {
        None
    } else {
        load_daily_edition_snapshot(conn, &requested_key)?
    };

    let (daily_edition, snapshot_created_at) = match stored {
        Some((payload_version, edition_json, created_at))
            if (MIN_DAILY_EDITION_SNAPSHOT_PAYLOAD_VERSION
                ..=DAILY_EDITION_SNAPSHOT_PAYLOAD_VERSION)
                .contains(&payload_version) =>
        {
            match serde_json::from_str::<DiscoveryDailyEdition>(&edition_json) {
                Ok(edition)
                    if edition.date == requested_key
                        && (requested_date != today
                            || payload_version == DAILY_EDITION_SNAPSHOT_PAYLOAD_VERSION) =>
                {
                    (edition, created_at)
                }
                Ok(edition) if edition.date == requested_key => {
                    persist_daily_edition_snapshot(conn, requested_date)?
                }
                Ok(_) | Err(_) if requested_date == today => {
                    persist_daily_edition_snapshot(conn, requested_date)?
                }
                Ok(_) => bail!("Archived Daily Edition date does not match its snapshot"),
                Err(error) => {
                    return Err(error).context("Could not read the archived Daily Edition snapshot")
                }
            }
        }
        Some(_) if requested_date != today => {
            bail!("Archived Daily Edition uses an unsupported snapshot format")
        }
        _ if requested_date == today => persist_daily_edition_snapshot(conn, requested_date)?,
        _ => bail!("No saved Daily Edition is available for {requested_key}"),
    };

    let available_dates = daily_edition_snapshot_dates(conn, today)?;
    Ok(DiscoveryDailyEditionSnapshotResponse {
        daily_edition,
        archive: DiscoveryDailyEditionArchive {
            available_dates,
            snapshot_created_at,
            retention_days: DAILY_EDITION_RETENTION_DAYS,
            is_archived: requested_date != today,
            today: today.format("%Y-%m-%d").to_string(),
        },
    })
}

pub(super) fn load_daily_edition_snapshot(
    conn: &Connection,
    edition_date: &str,
) -> Result<Option<(i64, String, String)>> {
    conn.query_row(
        "SELECT payload_version, edition_json, created_at
         FROM daily_edition_snapshots
         WHERE edition_date = ?1",
        [edition_date],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .optional()
    .context("Could not load the Daily Edition snapshot")
}

pub(super) fn persist_daily_edition_snapshot(
    conn: &Connection,
    date: NaiveDate,
) -> Result<(DiscoveryDailyEdition, String)> {
    let edition = discovery_daily_edition(conn, date)?;
    let edition_json = serde_json::to_string(&edition)
        .context("Could not serialize the Daily Edition snapshot")?;
    let created_at = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO daily_edition_snapshots (
             edition_date, payload_version, edition_json, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(edition_date) DO UPDATE SET
             payload_version = excluded.payload_version,
             edition_json = excluded.edition_json,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at",
        params![
            edition.date,
            DAILY_EDITION_SNAPSHOT_PAYLOAD_VERSION,
            edition_json,
            created_at
        ],
    )
    .context("Could not save the Daily Edition snapshot")?;
    Ok((edition, created_at))
}

pub(super) fn prune_daily_edition_snapshots(conn: &Connection, today: NaiveDate) -> Result<()> {
    let cutoff = today - chrono::Duration::days(i64::from(DAILY_EDITION_RETENTION_DAYS - 1));
    conn.execute(
        "DELETE FROM daily_edition_snapshots WHERE edition_date < ?1",
        [cutoff.format("%Y-%m-%d").to_string()],
    )
    .context("Could not prune expired Daily Edition snapshots")?;
    Ok(())
}

pub(super) fn daily_edition_snapshot_dates(
    conn: &Connection,
    today: NaiveDate,
) -> Result<Vec<String>> {
    let today_key = today.format("%Y-%m-%d").to_string();
    conn.prepare(
        "SELECT edition_date
         FROM daily_edition_snapshots
         WHERE payload_version BETWEEN ?1 AND ?2 AND edition_date <= ?3
         ORDER BY edition_date DESC",
    )?
    .query_map(
        params![
            MIN_DAILY_EDITION_SNAPSHOT_PAYLOAD_VERSION,
            DAILY_EDITION_SNAPSHOT_PAYLOAD_VERSION,
            today_key
        ],
        |row| row.get(0),
    )?
    .collect::<rusqlite::Result<Vec<_>>>()
    .context("Could not list Daily Edition snapshot dates")
}

pub(super) fn discovery_health_latest(conn: &Connection, sql: &str) -> Result<Option<String>> {
    conn.query_row(sql, [], |row| row.get(0))
        .context("Could not read Daily Edition source freshness")
}

pub(super) fn discovery_health_freshness(
    value: Option<&str>,
    now: chrono::DateTime<Utc>,
) -> (String, bool) {
    let Some(value) = value else {
        return ("Never updated".to_string(), true);
    };
    let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(value) else {
        return ("Update time unavailable".to_string(), true);
    };
    let days = now
        .signed_duration_since(parsed.with_timezone(&Utc))
        .num_days()
        .max(0);
    let label = match days {
        0 => "Updated today".to_string(),
        1 => "Updated 1 day ago".to_string(),
        _ => format!("Updated {days} days ago"),
    };
    (label, false)
}

#[allow(clippy::too_many_arguments)]
pub(super) fn discovery_health_item(
    id: &str,
    label: &str,
    coverage_count: i64,
    total_count: i64,
    coverage_label: String,
    last_successful_update: Option<String>,
    stale_after_days: i64,
    now: chrono::DateTime<Utc>,
    shelves: &[&str],
    details: Vec<String>,
    sparse_reasons: Vec<String>,
    action: &str,
    action_label: &str,
    force_stale: bool,
) -> DiscoverySourceHealthItem {
    let (freshness_label, timestamp_missing) =
        discovery_health_freshness(last_successful_update.as_deref(), now);
    let is_stale = force_stale
        || timestamp_missing
        || last_successful_update.as_deref().is_some_and(|value| {
            chrono::DateTime::parse_from_rfc3339(value)
                .map(|parsed| {
                    now.signed_duration_since(parsed.with_timezone(&Utc))
                        .num_days()
                        > stale_after_days
                })
                .unwrap_or(true)
        });
    let state = if total_count == 0 || coverage_count == 0 {
        "missing"
    } else if is_stale {
        "stale"
    } else {
        "healthy"
    };
    let coverage_percent = if total_count > 0 {
        (coverage_count as f64 / total_count as f64).clamp(0.0, 1.0)
    } else {
        0.0
    };
    DiscoverySourceHealthItem {
        id: id.to_string(),
        label: label.to_string(),
        state: state.to_string(),
        coverage_count,
        total_count,
        coverage_percent,
        coverage_label,
        last_successful_update,
        freshness_label,
        shelves: shelves.iter().map(|value| (*value).to_string()).collect(),
        details,
        sparse_reasons,
        action: action.to_string(),
        action_label: action_label.to_string(),
    }
}

pub(super) fn discovery_source_health(
    conn: &Connection,
    edition_date: NaiveDate,
    now: chrono::DateTime<Utc>,
) -> Result<DiscoverySourceHealthResponse> {
    let (album_count, track_count, rated_tracks, loved_tracks) = conn.query_row(
        "SELECT COUNT(*),
                COALESCE((SELECT COUNT(*) FROM tracks), 0),
                COALESCE((SELECT COUNT(*) FROM tracks WHERE normalized_rating IS NOT NULL), 0),
                COALESCE((SELECT COUNT(*) FROM tracks WHERE UPPER(TRIM(COALESCE(love, ''))) = 'L'), 0)
         FROM albums",
        [],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?, row.get::<_, i64>(3)?)),
    )?;
    let latest_library = discovery_health_latest(
        conn,
        "SELECT completed_at FROM import_runs
         WHERE status = 'completed' AND completed_at IS NOT NULL
         ORDER BY id DESC LIMIT 1",
    )?;
    let rating_events: i64 =
        conn.query_row("SELECT COUNT(*) FROM rating_events", [], |row| row.get(0))?;
    let deep_cut_count: i64 = conn.query_row(
        "SELECT COUNT(DISTINCT a.id)
         FROM tracks t JOIN albums a ON a.id = t.album_id
         WHERE a.effective_album_rating >= 85
           AND t.normalized_rating IS NULL
           AND NULLIF(TRIM(COALESCE(t.love, '')), '') IS NULL
           AND t.billboard_single_rank IS NULL
           AND t.vg_lista_rank IS NULL
           AND t.official_uk_rank IS NULL
           AND t.ti_i_skuddet_rank IS NULL
           AND t.norsktoppen_rank IS NULL
           AND COALESCE(t.track_number, 2) > 1",
        [],
        |row| row.get(0),
    )?;
    let mut rating_reasons = Vec::new();
    if track_count == 0 {
        rating_reasons
            .push("No imported tracks are available to build rating-led stories.".to_string());
    } else if rated_tracks == 0 {
        rating_reasons.push(
            "No tracks are rated, so Played, Loved, and Deep Cuts have no listening evidence."
                .to_string(),
        );
    }
    if rating_events == 0 && rated_tracks > 0 {
        rating_reasons.push("No rating-change history has been captured yet; Because You Played must use current album ratings instead of recent changes.".to_string());
    }
    if deep_cut_count == 0 && album_count > 0 {
        rating_reasons.push("Deep Cuts found no highly rated album with an unrated track that also avoids imported singles charts.".to_string());
    }
    let ratings = discovery_health_item(
        "ratings",
        "Ratings & listening signals",
        rated_tracks,
        track_count,
        format!("{rated_tracks} of {track_count} tracks rated"),
        latest_library.clone(),
        30,
        now,
        &[
            "Deep Cuts",
            "Because You Played / Loved",
            "anniversary tie-breaks",
        ],
        vec![
            format!("{album_count} owned albums"),
            format!("{rating_events} recorded rating changes"),
            format!("{loved_tracks} loved tracks"),
        ],
        rating_reasons,
        "open-imports",
        "Import ratings",
        false,
    );

    let chart_rows = [
        ("Billboard", "billboard_chart_entries"),
        ("Official UK", "official_uk_album_chart_entries"),
        ("VG-lista", "vg_lista_album_chart_entries"),
    ]
    .into_iter()
    .map(|(label, table)| {
        let sql =
            format!("SELECT COUNT(*), COUNT(matched_album_id), MAX(imported_at) FROM {table}");
        conn.query_row(&sql, [], |row| {
            Ok((
                label.to_string(),
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
    })
    .collect::<rusqlite::Result<Vec<_>>>()?;
    let chart_total = chart_rows.iter().map(|row| row.1).sum::<i64>();
    let chart_matched = chart_rows.iter().map(|row| row.2).sum::<i64>();
    let latest_charts = chart_rows.iter().filter_map(|row| row.3.clone()).max();
    let mut chart_reasons = Vec::new();
    for (label, total, matched, _) in &chart_rows {
        if *total == 0 {
            chart_reasons.push(format!("The {label} album corpus has not been imported."));
        } else if *matched == 0 {
            chart_reasons.push(format!(
                "{label} has {total} rows but none link to an owned album."
            ));
        }
    }
    let charts = discovery_health_item(
        "charts",
        "Album charts",
        chart_matched,
        chart_total,
        format!("{chart_matched} of {chart_total} chart rows linked"),
        latest_charts,
        365,
        now,
        &["50 Years Ago", "Chart Toppers", "Deep Cuts"],
        chart_rows
            .iter()
            .map(|(label, total, matched, _)| format!("{label}: {matched} of {total} rows linked"))
            .collect(),
        chart_reasons,
        if chart_total > 0 {
            "rebuild-chart-matches"
        } else {
            "open-imports"
        },
        if chart_total > 0 {
            "Rebuild matches"
        } else {
            "Import charts"
        },
        chart_rows.iter().any(|row| row.1 == 0),
    );

    let album_artist_key = artist_key_sql("album_artist_display");
    let identity_sql = format!(
        "WITH local_artists AS (
             SELECT DISTINCT {album_artist_key} AS artist_key FROM albums
             WHERE NULLIF(TRIM(COALESCE(album_artist_display, '')), '') IS NOT NULL
         )
         SELECT COUNT(*), COALESCE(SUM(CASE WHEN EXISTS(
             SELECT 1 FROM musicbrainz_artist_infos info
             WHERE info.local_artist_key = local_artists.artist_key AND NULLIF(TRIM(info.mbid), '') IS NOT NULL
         ) OR EXISTS(
             SELECT 1 FROM musicbrainz_artist_links link
             WHERE link.local_artist_key = local_artists.artist_key AND link.ignored = 0 AND NULLIF(TRIM(link.mbid), '') IS NOT NULL
         ) OR EXISTS(
             SELECT 1 FROM musicbrainz_artist_origin_countries origin
             WHERE origin.local_artist_key = local_artists.artist_key AND NULLIF(TRIM(origin.mbid), '') IS NOT NULL
         ) THEN 1 ELSE 0 END), 0) FROM local_artists"
    );
    let (local_artists, identified_artists) = conn.query_row(&identity_sql, [], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
    })?;
    let latest_identities = discovery_health_latest(
        conn,
        "SELECT MAX(updated_at) FROM (
             SELECT fetched_at AS updated_at FROM musicbrainz_artist_infos
             UNION ALL SELECT updated_at FROM musicbrainz_artist_links
             UNION ALL SELECT fetched_at FROM musicbrainz_artist_origin_countries
         ) WHERE updated_at IS NOT NULL",
    )?;
    let mut identity_reasons = Vec::new();
    if identified_artists == 0 {
        identity_reasons.push("No local album artist has a MusicBrainz identity.".to_string());
    } else if identified_artists < local_artists {
        identity_reasons.push(format!(
            "{} local artists still lack a MusicBrainz identity.",
            local_artists - identified_artists
        ));
    }
    let identities = discovery_health_item(
        "musicbrainz-identities",
        "MusicBrainz identities",
        identified_artists,
        local_artists,
        format!("{identified_artists} of {local_artists} album artists identified"),
        latest_identities.clone(),
        180,
        now,
        &["Birthdays & Memorials", "Complete the Artist"],
        vec!["Verified links, artist-info imports, and origin links are combined.".to_string()],
        identity_reasons,
        "open-musicbrainz",
        "Refresh identities",
        false,
    );

    let release_rows: i64 = conn.query_row(
        "SELECT COUNT(*) FROM musicbrainz_artist_release_groups WHERE status = 'Official'",
        [],
        |row| row.get(0),
    )?;
    let release_coverage_sql = format!(
        "WITH local_artists AS (
             SELECT DISTINCT {album_artist_key} AS artist_key FROM albums
             WHERE NULLIF(TRIM(COALESCE(album_artist_display, '')), '') IS NOT NULL
         ), identity_mbids AS (
             SELECT local_artist_key, LOWER(mbid) AS mbid FROM musicbrainz_artist_infos
             WHERE NULLIF(TRIM(mbid), '') IS NOT NULL
             UNION SELECT local_artist_key, LOWER(mbid) FROM musicbrainz_artist_links
             WHERE ignored = 0 AND NULLIF(TRIM(mbid), '') IS NOT NULL
             UNION SELECT local_artist_key, LOWER(mbid) FROM musicbrainz_artist_origin_countries
             WHERE NULLIF(TRIM(mbid), '') IS NOT NULL
         ), release_artists AS (
             SELECT DISTINCT LOWER(artist_mbid) AS mbid
             FROM musicbrainz_artist_release_groups WHERE status = 'Official'
         )
         SELECT COUNT(DISTINCT local_artists.artist_key)
         FROM local_artists
         JOIN identity_mbids identity ON identity.local_artist_key = local_artists.artist_key
         JOIN release_artists releases ON releases.mbid = identity.mbid"
    );
    let release_artists: i64 = conn.query_row(&release_coverage_sql, [], |row| row.get(0))?;
    let latest_releases = discovery_health_latest(
        conn,
        "SELECT MAX(fetched_at) FROM musicbrainz_artist_release_groups",
    )?;
    let mut release_reasons = Vec::new();
    if release_rows == 0 {
        release_reasons
            .push("No official MusicBrainz release groups have been cached.".to_string());
    } else if release_artists < identified_artists {
        release_reasons.push(format!(
            "{} identified artists have no cached official release groups.",
            identified_artists - release_artists
        ));
    }
    let releases = discovery_health_item(
        "musicbrainz-releases",
        "MusicBrainz releases",
        release_artists.min(identified_artists),
        identified_artists,
        format!(
            "{} of {identified_artists} identified artists have releases",
            release_artists.min(identified_artists)
        ),
        latest_releases,
        180,
        now,
        &["Complete the Artist"],
        vec![format!("{release_rows} official release groups cached")],
        release_reasons,
        "open-musicbrainz",
        "Open MusicBrainz tools",
        false,
    );

    let lastfm_artist_key = artist_key_sql("a.album_artist_display");
    let lastfm_sql = format!(
        "SELECT COUNT(*), COALESCE(SUM(CASE WHEN EXISTS(
             SELECT 1 FROM lastfm_album_relationships relation WHERE relation.album_id = a.id
         ) OR EXISTS(
             SELECT 1 FROM lastfm_artist_similarity similarity WHERE similarity.artist_key = {lastfm_artist_key}
         ) THEN 1 ELSE 0 END), 0) FROM albums a"
    );
    let (lastfm_total, lastfm_covered) = conn.query_row(&lastfm_sql, [], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
    })?;
    let (lastfm_cache_rows, lastfm_active_rows): (i64, i64) = conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(CASE WHEN datetime(expires_at) > datetime('now') THEN 1 ELSE 0 END), 0)
         FROM (
             SELECT expires_at FROM lastfm_album_relationships
             UNION ALL SELECT expires_at FROM lastfm_artist_similarity
         )",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let latest_lastfm = discovery_health_latest(
        conn,
        "SELECT MAX(fetched_at) FROM (
             SELECT fetched_at FROM lastfm_album_relationships
             UNION ALL SELECT fetched_at FROM lastfm_artist_similarity
         )",
    )?;
    let mut lastfm_reasons = Vec::new();
    if lastfm_cache_rows == 0 {
        lastfm_reasons
            .push("No related-album or similar-artist cache has been built yet.".to_string());
    } else {
        if lastfm_active_rows == 0 {
            lastfm_reasons.push("Every Last.fm relationship cache entry is expired.".to_string());
        }
        if lastfm_covered * 5 < lastfm_total {
            lastfm_reasons.push(format!(
                "{} owned albums have no album or artist relationship cache.",
                lastfm_total - lastfm_covered
            ));
        }
    }
    let lastfm = discovery_health_item(
        "lastfm",
        "Last.fm relationships",
        lastfm_covered,
        lastfm_total,
        format!("{lastfm_covered} of {lastfm_total} albums have relationship evidence"),
        latest_lastfm,
        30,
        now,
        &["Because You Played / Loved"],
        vec![
            format!("{lastfm_cache_rows} relationship cache records"),
            format!("{lastfm_active_rows} unexpired records"),
        ],
        lastfm_reasons,
        "open-lastfm",
        "Open Last.fm settings",
        lastfm_cache_rows > 0 && lastfm_active_rows == 0,
    );

    let genre_covered: i64 = conn.query_row(
        "SELECT COUNT(*) FROM albums
         WHERE NULLIF(TRIM(COALESCE(genre_normalized, canonical_genre, '')), '') IS NOT NULL",
        [],
        |row| row.get(0),
    )?;
    let genre_count: i64 = conn.query_row(
        "SELECT COUNT(DISTINCT LOWER(TRIM(COALESCE(genre_normalized, canonical_genre)))) FROM albums
         WHERE NULLIF(TRIM(COALESCE(genre_normalized, canonical_genre, '')), '') IS NOT NULL",
        [],
        |row| row.get(0),
    )?;
    let mut genre_reasons = Vec::new();
    if genre_covered == 0 {
        genre_reasons.push("No owned album has a usable genre.".to_string());
    } else if genre_covered < album_count {
        genre_reasons.push(format!(
            "{} albums have no genre and disappear from genre filters.",
            album_count - genre_covered
        ));
    }
    let genres = discovery_health_item(
        "genres",
        "Genres",
        genre_covered,
        album_count,
        format!("{genre_covered} of {album_count} albums have genres"),
        latest_library.clone(),
        30,
        now,
        &[
            "Deep Cuts",
            "Complete the Collection",
            "Because You Played / Loved",
        ],
        vec![format!("{genre_count} distinct normalized genres")],
        genre_reasons,
        "open-imports",
        "Import genres",
        false,
    );

    let life_dated: i64 = conn.query_row(
        "SELECT COUNT(DISTINCT info.local_artist_key)
         FROM musicbrainz_artist_infos info
         WHERE LOWER(COALESCE(info.artist_type, '')) = 'person'
           AND (LENGTH(info.life_begin_date) = 10 OR LENGTH(info.life_end_date) = 10)",
        [],
        |row| row.get(0),
    )?;
    let month_day = edition_date.format("%m-%d").to_string();
    let life_events_today: i64 = conn.query_row(
        "SELECT COUNT(*) FROM musicbrainz_artist_infos
         WHERE LOWER(COALESCE(artist_type, '')) = 'person'
           AND ((LENGTH(life_begin_date) = 10 AND SUBSTR(life_begin_date, 6, 5) = ?1)
             OR (LENGTH(life_end_date) = 10 AND SUBSTR(life_end_date, 6, 5) = ?1))",
        params![month_day],
        |row| row.get(0),
    )?;
    let mut life_reasons = Vec::new();
    if life_dated == 0 {
        life_reasons.push("No MusicBrainz person has an exact birth or death date.".to_string());
    } else if life_events_today == 0 {
        life_reasons.push(format!(
            "No imported person has an exact birthday or memorial on {}.",
            edition_date.format("%B %-d")
        ));
    }
    let life_dates = discovery_health_item(
        "life-dates",
        "Artist life dates",
        life_dated.min(local_artists),
        local_artists,
        format!(
            "{} of {local_artists} album artists have an exact life date",
            life_dated.min(local_artists)
        ),
        latest_identities,
        180,
        now,
        &["Birthdays & Memorials"],
        vec![format!(
            "{life_events_today} exact events match this edition date"
        )],
        life_reasons,
        "open-musicbrainz",
        "Refresh life dates",
        false,
    );

    let cover_count: i64 = conn.query_row(
        "SELECT COUNT(*)
         FROM albums a
         JOIN album_covers c ON c.album_id = a.id
         WHERE NULLIF(TRIM(COALESCE(c.cache_path, '')), '') IS NOT NULL",
        [],
        |row| row.get(0),
    )?;
    let latest_covers = discovery_health_latest(
        conn,
        "SELECT MAX(c.imported_at)
         FROM albums a
         JOIN album_covers c ON c.album_id = a.id",
    )?;
    let mut cover_reasons = Vec::new();
    if cover_count == 0 {
        cover_reasons.push("No owned album has cached cover art.".to_string());
    } else if cover_count < album_count {
        cover_reasons.push(format!(
            "{} albums will render without cached cover art.",
            album_count - cover_count
        ));
    }
    let covers = discovery_health_item(
        "covers",
        "Cover art",
        cover_count,
        album_count,
        format!("{} of {album_count} albums have covers", cover_count),
        latest_covers,
        180,
        now,
        &["All visual shelves"],
        Vec::new(),
        cover_reasons,
        "open-covers",
        "Scan covers",
        false,
    );

    let sources = vec![
        ratings, charts, identities, releases, lastfm, genres, life_dates, covers,
    ];
    let healthy_count = sources
        .iter()
        .filter(|source| source.state == "healthy")
        .count() as i64;
    let stale_count = sources
        .iter()
        .filter(|source| source.state == "stale")
        .count() as i64;
    let missing_count = sources
        .iter()
        .filter(|source| source.state == "missing")
        .count() as i64;
    let overall_state = if missing_count > 0 {
        "missing"
    } else if stale_count > 0 {
        "stale"
    } else {
        "healthy"
    };
    Ok(DiscoverySourceHealthResponse {
        checked_at: now.to_rfc3339(),
        edition_date: edition_date.format("%Y-%m-%d").to_string(),
        overall_state: overall_state.to_string(),
        healthy_count,
        stale_count,
        missing_count,
        sources,
    })
}

pub(super) fn discovery_daily_edition(
    conn: &Connection,
    date: NaiveDate,
) -> Result<DiscoveryDailyEdition> {
    Ok(DiscoveryDailyEdition {
        date: date.format("%Y-%m-%d").to_string(),
        anniversary_years: 50,
        anniversaries: discovery_anniversaries(conn, date, 50)?,
        life_events: discovery_life_events(conn, date)?,
        chart_snapshot: discovery_chart_snapshot(
            conn,
            &DiscoveryChartSnapshotRequest {
                source: None,
                year: None,
                week: None,
                random: true,
            },
        )?,
        deep_cut_snapshot: discovery_deep_cut_snapshot(
            conn,
            &DiscoveryDeepCutSnapshotRequest::default(),
        )?,
        completion_snapshot: discovery_completion_snapshot(
            conn,
            &DiscoveryCompletionSnapshotRequest::default(),
        )?,
        recommendation_snapshot: discovery_recommendation_snapshot(
            conn,
            &DiscoveryRecommendationSnapshotRequest::default(),
        )?,
        listening_evidence_note: "Listening stories use recent rating activity and loved tracks."
            .to_string(),
    })
}

pub(super) fn discovery_anniversaries(
    conn: &Connection,
    date: NaiveDate,
    anniversary_years: i32,
) -> Result<Vec<DiscoveryAnniversaryStory>> {
    let mut stories = discovery_anniversaries_all(conn, date, anniversary_years)?;
    stories.truncate(5);
    Ok(stories)
}

pub(super) fn discovery_anniversaries_all(
    conn: &Connection,
    date: NaiveDate,
    anniversary_years: i32,
) -> Result<Vec<DiscoveryAnniversaryStory>> {
    let release_year = date.year() - anniversary_years;
    let mut stmt = conn.prepare(
        "
        SELECT
            a.id,
            COALESCE(NULLIF(TRIM(a.album), ''), 'Unknown Album'),
            COALESCE(NULLIF(TRIM(a.album_artist_display), ''), 'Unknown Artist'),
            COALESCE(a.release_year, a.year),
            c.cache_path,
            a.billboard_rank,
            a.official_uk_rank,
            a.vg_lista_rank,
            NULLIF(MIN(
                COALESCE(a.billboard_rank, 100000),
                COALESCE(a.official_uk_rank, 100000),
                COALESCE(a.vg_lista_rank, 100000)
            ), 100000),
            COALESCE(a.album_score, 0)
        FROM albums a
        LEFT JOIN album_covers c ON c.album_id = a.id
        WHERE COALESCE(a.release_year, a.year) = ?1
        ORDER BY
            CASE WHEN a.billboard_rank IS NOT NULL
                OR a.official_uk_rank IS NOT NULL
                OR a.vg_lista_rank IS NOT NULL THEN 0 ELSE 1 END,
            NULLIF(MIN(
                COALESCE(a.billboard_rank, 100000),
                COALESCE(a.official_uk_rank, 100000),
                COALESCE(a.vg_lista_rank, 100000)
            ), 100000),
            ((a.billboard_rank IS NOT NULL)
                + (a.official_uk_rank IS NOT NULL)
                + (a.vg_lista_rank IS NOT NULL)) DESC,
            CASE WHEN c.cache_path IS NULL THEN 1 ELSE 0 END,
            COALESCE(a.album_score, 0) DESC,
            COALESCE(a.loved_tracks, 0) DESC,
            LOWER(COALESCE(a.album_artist_display, '')),
            LOWER(COALESCE(a.album, ''))
        ",
    )?;
    let stories = stmt
        .query_map(params![release_year], |row| {
            let album: String = row.get(1)?;
            let artist: String = row.get(2)?;
            let year: i32 = row.get(3)?;
            let billboard_rank: Option<i32> = row.get(5)?;
            let official_uk_rank: Option<i32> = row.get(6)?;
            let vg_lista_rank: Option<i32> = row.get(7)?;
            let best_chart_rank: Option<i32> = row.get(8)?;
            let album_score: f64 = row.get(9)?;
            let chart_evidence = [
                billboard_rank.map(|rank| format!("Billboard #{rank}")),
                official_uk_rank.map(|rank| format!("Official UK #{rank}")),
                vg_lista_rank.map(|rank| format!("VG-lista #{rank}")),
            ]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();
            let evidence = if chart_evidence.is_empty() {
                format!("Released in {year} · owned album · local-rating fallback")
            } else {
                format!("{} · owned album", chart_evidence.join(" · "))
            };
            let selection_reason = if let Some(best_chart_rank) = best_chart_rank {
                format!(
                    "Selected from your owned {year} releases because its best imported album-chart position is #{best_chart_rank}. Matches: {}. Local Album Score and loved tracks only break chart ties.",
                    chart_evidence.join(", ")
                )
            } else {
                format!(
                    "Included because fewer than five owned {year} releases matched Billboard, Official UK, or VG-lista. Its local Album Score ({album_score:.0}) ranks it among the strongest remaining albums."
                )
            };
            Ok(DiscoveryAnniversaryStory {
                album_id: row.get(0)?,
                album,
                artist,
                release_year: year,
                years_ago: date.year() - year,
                cover_path: row.get(4)?,
                evidence,
                chart_evidence,
                selection_reason,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load discovery anniversary stories")?;
    Ok(stories)
}

pub(super) fn discovery_life_events(
    conn: &Connection,
    date: NaiveDate,
) -> Result<Vec<DiscoveryLifeEventStory>> {
    let mut stories = discovery_life_events_all(conn, date)?;
    let mut birthdays = stories
        .iter()
        .filter(|story| story.event_type == "birthday")
        .take(5)
        .cloned()
        .collect::<Vec<_>>();
    birthdays.extend(
        stories
            .drain(..)
            .filter(|story| story.event_type == "memorial")
            .take(5),
    );
    Ok(birthdays)
}

pub(super) fn discovery_life_events_all(
    conn: &Connection,
    date: NaiveDate,
) -> Result<Vec<DiscoveryLifeEventStory>> {
    let album_artist_key = artist_key_sql("album_artist_display");
    let month_day = date.format("%m-%d").to_string();
    let sql = format!(
        "
        WITH artist_stats AS (
            SELECT
                {album_artist_key} AS artist_id,
                COUNT(*) AS album_count,
                COALESCE(SUM(loved_tracks), 0) AS loved_tracks,
                MIN(NULLIF(TRIM(album_artist_display), '')) AS artist
            FROM albums
            WHERE NULLIF(TRIM(COALESCE(album_artist_display, '')), '') IS NOT NULL
            GROUP BY artist_id
        ),
        events AS (
            SELECT
                info.local_artist_key AS artist_id,
                COALESCE(NULLIF(TRIM(info.display_artist), ''), stats.artist) AS artist,
                'birthday' AS event_type,
                info.life_begin_date AS event_date,
                COALESCE(
                    info.life_begin_year,
                    CAST(SUBSTR(info.life_begin_date, 1, 4) AS INTEGER)
                ) AS event_year,
                stats.album_count,
                stats.loved_tracks
            FROM musicbrainz_artist_infos info
            JOIN artist_stats stats ON stats.artist_id = info.local_artist_key
            WHERE LOWER(COALESCE(info.artist_type, '')) = 'person'
              AND LENGTH(info.life_begin_date) = 10
              AND SUBSTR(info.life_begin_date, 6, 5) = ?1

            UNION ALL

            SELECT
                info.local_artist_key,
                COALESCE(NULLIF(TRIM(info.display_artist), ''), stats.artist),
                'memorial',
                info.life_end_date,
                COALESCE(
                    info.life_end_year,
                    CAST(SUBSTR(info.life_end_date, 1, 4) AS INTEGER)
                ),
                stats.album_count,
                stats.loved_tracks
            FROM musicbrainz_artist_infos info
            JOIN artist_stats stats ON stats.artist_id = info.local_artist_key
            WHERE LOWER(COALESCE(info.artist_type, '')) = 'person'
              AND LENGTH(info.life_end_date) = 10
              AND SUBSTR(info.life_end_date, 6, 5) = ?1
        )
        SELECT
            events.artist_id,
            events.artist,
            events.event_type,
            events.event_date,
            events.event_year,
            events.album_count,
            events.loved_tracks,
            EXISTS(
                SELECT 1
                FROM artist_images image
                WHERE image.artist_key = events.artist_id
                  AND image.state = 'available'
                  AND image.cache_path IS NOT NULL
            ) AS portrait_available,
            (
                SELECT a.id
                FROM albums a
                LEFT JOIN album_covers c ON c.album_id = a.id
                WHERE {album_artist_key} = events.artist_id
                ORDER BY c.cache_path IS NULL, COALESCE(a.album_score, 0) DESC
                LIMIT 1
            ) AS representative_album_id,
            (
                SELECT a.album
                FROM albums a
                LEFT JOIN album_covers c ON c.album_id = a.id
                WHERE {album_artist_key} = events.artist_id
                ORDER BY c.cache_path IS NULL, COALESCE(a.album_score, 0) DESC
                LIMIT 1
            ) AS representative_album,
            (
                SELECT c.cache_path
                FROM albums a
                JOIN album_covers c ON c.album_id = a.id
                WHERE {album_artist_key} = events.artist_id
                ORDER BY COALESCE(a.album_score, 0) DESC
                LIMIT 1
            ) AS representative_cover_path
        FROM events
        ORDER BY CASE events.event_type WHEN 'birthday' THEN 0 ELSE 1 END,
                 events.album_count DESC,
                 LOWER(events.artist)
        "
    );
    let mut stmt = conn.prepare(&sql)?;
    let stories = stmt
        .query_map(params![month_day], |row| {
            let event_type: String = row.get(2)?;
            let event_year: i32 = row.get(4)?;
            let album_count: i64 = row.get(5)?;
            let loved_tracks: i64 = row.get(6)?;
            let evidence = if event_type == "birthday" {
                format!("Born today · {album_count} albums in your library")
            } else {
                format!("Remembered today · {loved_tracks} loved tracks")
            };
            Ok(DiscoveryLifeEventStory {
                artist_id: row.get(0)?,
                artist: row.get(1)?,
                event_type,
                event_date: row.get(3)?,
                years: date.year() - event_year,
                day_offset: 0,
                album_count,
                loved_tracks,
                portrait_available: row.get::<_, i64>(7)? != 0,
                representative_album_id: row.get(8)?,
                representative_album: row.get(9)?,
                representative_cover_path: row.get(10)?,
                evidence,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load discovery artist life events")?;
    Ok(stories)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::*;

    #[test]
    fn discovery_source_health_reports_healthy_sources_with_concrete_coverage() {
        let conn = seeded_connection();
        conn.execute_batch(
            "
            UPDATE import_runs SET completed_at = '2026-08-13T08:00:00Z' WHERE id = 1;
            INSERT INTO album_covers (
                album_id, source, source_path, cache_path, mime_type, extension,
                file_size_bytes, imported_at
            ) VALUES (
                'mb:test', 'test', 'cover.jpg', 'cache/cover.jpg', 'image/jpeg',
                'jpg', 100, '2026-08-13T08:00:00Z'
            );
            INSERT INTO musicbrainz_artist_infos (
                local_artist_key, display_artist, mbid, artist_type,
                life_begin_date, life_begin_year, review_state, source,
                fetched_at, created_at, updated_at
            ) VALUES (
                'pet shop boys', 'Pet Shop Boys', 'mbid-psb', 'Person',
                '1959-08-13', 1959, 'imported', 'musicbrainz-live',
                '2026-08-13T08:00:00Z', '2026-08-13T08:00:00Z',
                '2026-08-13T08:00:00Z'
            );
            INSERT INTO musicbrainz_artist_release_groups (
                artist_mbid, release_mbid, title, year, type, secondary_types,
                track_count, status, source, fetched_at
            ) VALUES (
                'mbid-psb', 'release-1', 'Actually', 1987, 'Album', '', 10,
                'Official', 'musicbrainz-live', '2026-08-13T08:00:00Z'
            );
            INSERT INTO lastfm_artist_similarity (
                artist_key, artist_name, state, fetched_at, expires_at
            ) VALUES (
                'pet shop boys', 'Pet Shop Boys', 'available',
                '2026-08-13T08:00:00Z', '2026-09-13T08:00:00Z'
            );
            INSERT INTO billboard_chart_entries (
                source_file, year, rank, artist, album, artist_key, album_key,
                matched_album_id, imported_at
            ) VALUES (
                'billboard.csv', 1988, 1, 'Pet Shop Boys', 'Actually',
                'pet shop boys', 'actually', 'mb:test', '2026-08-13T08:00:00Z'
            );
            INSERT INTO official_uk_album_chart_entries (
                source_file, year, week, chart_date, rank, artist, title,
                artist_key, title_key, week_key, matched_album_id, imported_at
            ) VALUES (
                'uk.csv', 1987, 34, '1987-08-22', 1, 'Pet Shop Boys', 'Actually',
                'pet shop boys', 'actually', '1987-34', 'mb:test', '2026-08-13T08:00:00Z'
            );
            INSERT INTO vg_lista_album_chart_entries (
                source_file, year, week, rank, artist, title, artist_key,
                title_key, week_date, week_key, matched_album_id, imported_at
            ) VALUES (
                'vg.csv', 1987, 34, 1, 'Pet Shop Boys', 'Actually',
                'pet shop boys', 'actually', '1987-08-21', '1987-34',
                'mb:test', '2026-08-13T08:00:00Z'
            );
            ",
        )
        .expect("seed healthy source health");

        let health = discovery_source_health(
            &conn,
            NaiveDate::from_ymd_opt(2026, 8, 13).expect("valid date"),
            chrono::DateTime::parse_from_rfc3339("2026-08-13T12:00:00Z")
                .expect("valid timestamp")
                .with_timezone(&Utc),
        )
        .expect("load source health");

        for id in [
            "ratings",
            "charts",
            "musicbrainz-identities",
            "genres",
            "life-dates",
            "covers",
        ] {
            let source = health
                .sources
                .iter()
                .find(|source| source.id == id)
                .expect("source row");
            assert_eq!(source.state, "healthy", "expected {id} healthy");
            assert!(source.coverage_count > 0);
            assert!(source.last_successful_update.is_some());
        }
    }

    #[test]
    fn discovery_source_health_distinguishes_stale_and_missing_sources() {
        let conn = seeded_connection();
        conn.execute(
            "UPDATE import_runs SET completed_at = '2024-01-01T00:00:00Z'",
            [],
        )
        .expect("age library import");
        let health = discovery_source_health(
            &conn,
            NaiveDate::from_ymd_opt(2026, 8, 13).expect("valid date"),
            chrono::DateTime::parse_from_rfc3339("2026-08-13T12:00:00Z")
                .expect("valid timestamp")
                .with_timezone(&Utc),
        )
        .expect("load sparse source health");

        let ratings = health
            .sources
            .iter()
            .find(|source| source.id == "ratings")
            .expect("ratings");
        assert_eq!(ratings.state, "stale");
        assert!(ratings.freshness_label.contains("days ago"));

        for id in [
            "charts",
            "musicbrainz-identities",
            "musicbrainz-releases",
            "lastfm",
            "life-dates",
            "covers",
        ] {
            let source = health
                .sources
                .iter()
                .find(|source| source.id == id)
                .expect("source row");
            assert_eq!(source.state, "missing", "expected {id} missing");
            assert!(!source.sparse_reasons.is_empty());
        }
        assert!(health.stale_count > 0);
        assert!(health.missing_count > 0);
    }

    #[test]
    fn discovery_daily_edition_builds_stories_from_local_evidence() {
        let conn = seeded_connection();
        insert_test_album(
            &conn,
            "mb:anniversary",
            "Anniversary Artist",
            "Anniversary Album",
            1976,
            10,
        );
        insert_test_album(
            &conn,
            "mb:anniversary-uncharted",
            "Uncharted Artist",
            "High Score Fallback",
            1976,
            10,
        );
        insert_test_album(&conn, "mb:please", "Pet Shop Boys", "Please", 1986, 10);
        insert_test_album(
            &conn,
            "mb:behaviour",
            "Pet Shop Boys",
            "Behaviour",
            1990,
            10,
        );
        insert_test_album(
            &conn,
            "mb:birthday",
            "Birthday Artist",
            "Birthday Album",
            1992,
            9,
        );
        insert_test_album(
            &conn,
            "mb:memorial",
            "Memorial Artist",
            "Memorial Album",
            1988,
            8,
        );
        insert_test_artist_info(
            &conn,
            "Pet Shop Boys",
            "Group",
            None,
            Some(1981),
            None,
            false,
        );
        insert_test_artist_info(
            &conn,
            "Birthday Artist",
            "Person",
            None,
            Some(1969),
            None,
            false,
        );
        insert_test_artist_info(
            &conn,
            "Memorial Artist",
            "Person",
            None,
            Some(1950),
            Some(2001),
            false,
        );
        conn.execute_batch(
            "
            UPDATE albums
            SET effective_album_rating = 92, album_score = 140.0,
                billboard_rank = 12, official_uk_rank = 8, vg_lista_rank = 5
            WHERE id = 'mb:anniversary';

            UPDATE albums
            SET effective_album_rating = 100, album_score = 999.0
            WHERE id = 'mb:anniversary-uncharted';

            INSERT INTO tracks (
                import_run_id, album_id, album_unique_id, display_artist,
                album_artist_display, album, title, canonical_genre,
                genre_normalized, normalized_rating, track_number, year,
                release_year, time_seconds, row_hash
            ) VALUES (
                1, 'mb:anniversary', 'mb:anniversary', 'Anniversary Artist',
                'Anniversary Artist', 'Anniversary Album', 'Hidden Finale',
                'Rock', 'rock', NULL, 7, 1976, 1976, 241, 'deep-cut-hash'
            );

            UPDATE musicbrainz_artist_infos
            SET life_begin_date = '1969-08-11'
            WHERE local_artist_key = 'birthday artist';

            UPDATE musicbrainz_artist_infos
            SET life_end_date = '2001-08-11'
            WHERE local_artist_key = 'memorial artist';

            INSERT INTO musicbrainz_artist_release_groups (
                artist_mbid, release_mbid, title, year, type,
                secondary_types, status, source, fetched_at
            ) VALUES
                ('mbid-pet shop boys', 'release-actually', 'Actually', 1987,
                 'Album', '', 'Official', 'musicbrainz-live', '2026-08-11T00:00:00Z'),
                ('mbid-pet shop boys', 'release-please', 'Please', 1986,
                 'Album', '', 'Official', 'musicbrainz-live', '2026-08-11T00:00:00Z'),
                ('mbid-pet shop boys', 'release-behaviour', 'Behaviour', 1990,
                 'Album', '', 'Official', 'musicbrainz-live', '2026-08-11T00:00:00Z'),
                ('mbid-pet shop boys', 'release-missing', 'Very', 1993,
                 'Album', '', 'Official', 'musicbrainz-live', '2026-08-11T00:00:00Z');

            INSERT INTO rating_events (
                import_run_id, created_at, event_type, album_id, album,
                album_artist_display, year, current_rated_tracks,
                current_rating_completeness, current_effective_album_rating
            ) VALUES (
                1, '2026-08-11T08:00:00Z', 'ratingChanged', 'mb:test',
                'Actually', 'Pet Shop Boys', 1987, 10, 1.0, 86
            );

            INSERT INTO official_uk_album_chart_entries (
                source_file, year, week, chart_date, rank, artist, title,
                artist_key, title_key, week_key, matched_album_id, imported_at
            ) VALUES (
                'charts.csv', 1987, 32, '1987-08-11', 1, 'Anniversary Artist',
                'Anniversary Album', 'anniversary artist',
                'anniversary album', '1987-32', 'mb:anniversary',
                '2026-08-11T00:00:00Z'
            );
            ",
        )
        .expect("insert daily edition fixtures");

        let edition = discovery_daily_edition(
            &conn,
            NaiveDate::from_ymd_opt(2026, 8, 11).expect("valid edition date"),
        )
        .expect("load daily edition");

        assert_eq!(edition.anniversaries[0].album, "Anniversary Album");
        assert_eq!(
            edition.anniversaries[0].chart_evidence,
            vec!["Billboard #12", "Official UK #8", "VG-lista #5"]
        );
        assert!(edition.anniversaries[0]
            .selection_reason
            .contains("best imported album-chart position is #5"));
        assert_eq!(edition.anniversaries[1].album, "High Score Fallback");
        assert_eq!(edition.life_events[0].artist, "Birthday Artist");
        assert!(edition
            .life_events
            .iter()
            .any(|story| story.artist == "Memorial Artist" && story.event_type == "memorial"));
        assert_eq!(edition.chart_snapshot.source, "official-uk");
        assert_eq!(edition.chart_snapshot.year, Some(1987));
        assert_eq!(edition.chart_snapshot.week, Some(32));
        assert_eq!(edition.chart_snapshot.stories[0].rank, 1);
        assert_eq!(edition.deep_cut_snapshot.stories[0].title, "Hidden Finale");
        assert_eq!(
            edition.completion_snapshot.artist_stories[0].missing_release_title,
            "Very"
        );
        assert!(edition
            .recommendation_snapshot
            .anchors
            .iter()
            .any(|story| story.album == "Actually"));
        assert!(edition
            .listening_evidence_note
            .contains("recent rating activity"));
    }

    #[test]
    fn daily_edition_snapshot_survives_restart_and_source_changes_until_explicit_refresh() {
        let dir = temp_test_dir("daily-edition-snapshot");
        let db_path = dir.join("library.sqlite3");
        let date = NaiveDate::from_ymd_opt(2026, 8, 13).expect("valid snapshot date");
        let conn = seeded_file_database(&db_path, "snapshot-album", "Original Edition Album");
        conn.execute(
            "UPDATE albums SET year = 1976, release_year = 1976 WHERE id = 'snapshot-album'",
            [],
        )
        .expect("make anniversary fixture");

        let first = discovery_daily_edition_snapshot(&conn, date, date, false)
            .expect("create first Daily Edition snapshot");
        assert_eq!(
            first.daily_edition.anniversaries[0].album,
            "Original Edition Album"
        );
        assert!(!first.archive.is_archived);
        drop(conn);

        let restarted = Connection::open(&db_path).expect("reopen snapshot database");
        configure(&restarted).expect("configure restarted database");
        migrate(&restarted).expect("migrate restarted database");
        restarted
            .execute(
                "UPDATE albums SET album = 'Changed Source Album' WHERE id = 'snapshot-album'",
                [],
            )
            .expect("change source album after snapshot");

        let persisted = discovery_daily_edition_snapshot(&restarted, date, date, false)
            .expect("reload persisted Daily Edition snapshot");
        assert_eq!(
            persisted.daily_edition.anniversaries[0].album,
            "Original Edition Album"
        );
        assert_eq!(
            persisted.archive.snapshot_created_at,
            first.archive.snapshot_created_at
        );

        let refreshed = discovery_daily_edition_snapshot(&restarted, date, date, true)
            .expect("explicitly refresh today's snapshot");
        assert_eq!(
            refreshed.daily_edition.anniversaries[0].album,
            "Changed Source Album"
        );
        assert_ne!(
            refreshed.archive.snapshot_created_at,
            first.archive.snapshot_created_at
        );

        drop(restarted);
        fs::remove_dir_all(dir).expect("remove snapshot test directory");
    }

    #[test]
    fn daily_edition_snapshot_prunes_expired_rows_and_keeps_archives_immutable() {
        let conn = seeded_connection();
        let today = NaiveDate::from_ymd_opt(2026, 8, 13).expect("valid today");
        let archived = today - chrono::Duration::days(1);
        let expired = today - chrono::Duration::days(i64::from(DAILY_EDITION_RETENTION_DAYS));

        persist_daily_edition_snapshot(&conn, expired).expect("seed expired edition");
        persist_daily_edition_snapshot(&conn, archived).expect("seed archived edition");
        let response = discovery_daily_edition_snapshot(&conn, today, today, false)
            .expect("create today's edition and prune archive");

        assert_eq!(
            response.archive.available_dates,
            vec![
                today.format("%Y-%m-%d").to_string(),
                archived.format("%Y-%m-%d").to_string(),
            ]
        );
        let archived_response = discovery_daily_edition_snapshot(&conn, archived, today, false)
            .expect("open immutable archived edition");
        assert!(archived_response.archive.is_archived);
        assert!(discovery_daily_edition_snapshot(&conn, archived, today, true).is_err());
    }
}
