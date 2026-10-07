use super::*;

#[cfg(not(test))]
pub fn album_debut_timeline_for_app(
    app: &AppHandle,
    selected_year: Option<i32>,
    chart_source: String,
) -> Result<AlbumDebutTimelineResponse> {
    let (conn, _) = open_read(app)?;
    album_debut_timeline_for_source(&conn, selected_year, &chart_source)
}

#[cfg(test)]
pub(super) fn album_debut_timeline(
    conn: &Connection,
    requested_year: Option<i32>,
) -> Result<AlbumDebutTimelineResponse> {
    album_debut_timeline_for_source(conn, requested_year, "US")
}

pub(super) fn album_debut_timeline_for_source(
    conn: &Connection,
    requested_year: Option<i32>,
    chart_source: &str,
) -> Result<AlbumDebutTimelineResponse> {
    if timeline_source_is_ti_i_skuddet(chart_source) || timeline_source_is_norsktoppen(chart_source)
    {
        bail!("The selected chart is a singles-only timeline source");
    }
    let (
        rank_field,
        year_field,
        debut_year_field,
        debut_month_field,
        debut_week_field,
        debut_week_key_field,
    ) = if timeline_source_is_official_uk(chart_source) {
        (
            "a.official_uk_rank",
            "a.official_uk_year",
            "a.official_uk_debut_year",
            "a.official_uk_debut_month",
            "a.official_uk_debut_week",
            "a.official_uk_debut_week_key",
        )
    } else if timeline_source_is_vg_lista(chart_source) {
        (
            "a.vg_lista_rank",
            "a.vg_lista_year",
            "a.vg_lista_debut_year",
            "a.vg_lista_debut_month",
            "a.vg_lista_debut_week",
            "a.vg_lista_debut_week_key",
        )
    } else {
        (
            "a.billboard_rank",
            "a.billboard_year",
            "a.billboard_debut_year",
            "a.billboard_debut_month",
            "a.billboard_debut_week",
            "a.billboard_debut_week_key",
        )
    };
    let sql = format!(
        "SELECT
            a.id,
            a.album,
            a.album_artist_display,
            a.canonical_genre,
            a.year,
            a.album_score,
            {rank_field},
            {year_field},
            {debut_year_field},
            {debut_month_field},
            {debut_week_field},
            {debut_week_key_field},
            c.cache_path,
            c.mime_type
         FROM albums a
         LEFT JOIN album_covers c ON c.album_id = a.id
         WHERE {debut_year_field} IS NOT NULL
           AND {debut_month_field} IS NOT NULL
           AND {debut_week_field} IS NOT NULL
           AND {debut_week_key_field} IS NOT NULL
         ORDER BY
            {debut_year_field} ASC,
            {debut_week_key_field} ASC,
            a.album COLLATE NOCASE ASC,
            a.id ASC"
    );
    let mut statement = conn.prepare(&sql)?;
    let album_rows = statement.query_map([], |row| {
        let id: String = row.get(0)?;
        Ok(AlbumDebutTimelineAlbum {
            album_id: id.clone(),
            id,
            album: row.get(1)?,
            album_artist_display: row.get(2)?,
            canonical_genre: row.get(3)?,
            year: row.get(4)?,
            album_score: row.get(5)?,
            billboard_rank: row.get(6)?,
            billboard_year: row.get(7)?,
            billboard_debut_year: row.get(8)?,
            billboard_debut_month: row.get(9)?,
            billboard_debut_week: row.get(10)?,
            billboard_debut_week_key: row.get(11)?,
            cover_path: row.get(12)?,
            cover_mime_type: row.get(13)?,
        })
    })?;
    let all_albums = album_rows.collect::<rusqlite::Result<Vec<_>>>()?;

    let mut grouped: HashMap<i32, AlbumDebutTimelineYear> = HashMap::new();
    for album in &all_albums {
        let year = grouped
            .entry(album.billboard_debut_year)
            .or_insert_with(|| AlbumDebutTimelineYear {
                year: album.billboard_debut_year,
                album_count: 0,
                representative_album: None,
            });
        year.album_count += 1;
        let should_replace = year
            .representative_album
            .as_ref()
            .map(|current| {
                let candidate_has_cover = album.cover_path.is_some();
                let current_has_cover = current.cover_path.is_some();
                (candidate_has_cover && !current_has_cover)
                    || (candidate_has_cover == current_has_cover
                        && album.album_score.unwrap_or(f64::NEG_INFINITY)
                            > current.album_score.unwrap_or(f64::NEG_INFINITY))
            })
            .unwrap_or(true);
        if should_replace {
            year.representative_album = Some(album.clone());
        }
    }

    let mut years = grouped.into_values().collect::<Vec<_>>();
    years.sort_by_key(|year| year.year);
    let selected_year = requested_year
        .filter(|requested| years.iter().any(|year| year.year == *requested))
        .or_else(|| {
            years
                .iter()
                .max_by(|left, right| {
                    left.album_count
                        .cmp(&right.album_count)
                        .then(left.year.cmp(&right.year))
                })
                .map(|year| year.year)
        });
    let albums = selected_year
        .map(|selected| {
            all_albums
                .iter()
                .filter(|album| album.billboard_debut_year == selected)
                .cloned()
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let undated_sql = format!(
        "SELECT COUNT(*)
         FROM albums a
         WHERE {debut_year_field} IS NULL
            OR {debut_month_field} IS NULL
            OR {debut_week_field} IS NULL
            OR {debut_week_key_field} IS NULL"
    );
    let undated_album_count = conn.query_row(&undated_sql, [], |row| row.get(0))?;

    Ok(AlbumDebutTimelineResponse {
        years,
        selected_year,
        albums,
        dated_album_count: all_albums.len() as i64,
        undated_album_count,
    })
}

#[cfg(not(test))]
pub fn track_debut_timeline_for_app(
    app: &AppHandle,
    selected_year: Option<i32>,
    chart_source: String,
) -> Result<TrackDebutTimelineResponse> {
    let (mut conn, _) = open(app)?;
    if timeline_source_is_billboard(&chart_source) {
        refresh_billboard_single_album_metadata_if_needed(&mut conn)?;
    }
    track_debut_timeline_for_source(&conn, selected_year, &chart_source)
}

#[cfg(not(test))]
pub(super) fn refresh_billboard_single_album_metadata_if_needed(
    conn: &mut Connection,
) -> Result<()> {
    let (entry_count, album_metadata_count): (i64, i64) = conn.query_row(
        "SELECT
            COUNT(*),
            COUNT(album)
         FROM billboard_single_chart_entries",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    if entry_count == 0 || album_metadata_count > 0 {
        return Ok(());
    }

    let settings = settings_for_connection(conn)?;
    let Ok(source_path) = resolve_billboard_source_path(&settings.billboard_singles_source_path)
    else {
        return Ok(());
    };
    import_billboard_singles(conn, &source_path)
        .context("Could not refresh Billboard singles album matching")?;
    Ok(())
}

pub(super) fn timeline_track_priority(
    track: &TrackDebutTimelineTrack,
) -> (bool, bool, i32, bool, bool, i32, std::cmp::Reverse<i64>) {
    let album_artist_key =
        crate::identity::loose_key(track.album_artist_display.as_deref().unwrap_or_default());
    let display_artist_key =
        crate::identity::loose_key(track.display_artist.as_deref().unwrap_or_default());
    (
        billboard_single_album_artist_matches(&album_artist_key, &display_artist_key),
        !billboard_single_is_compilation_artist(&album_artist_key),
        billboard_single_release_year_score(track.year, Some(track.billboard_single_debut_year)),
        track.cover_path.is_some(),
        track.love.as_deref() == Some("L"),
        track.normalized_rating.unwrap_or(i32::MIN),
        std::cmp::Reverse(track.track_id),
    )
}

#[cfg(test)]
pub(super) fn track_debut_timeline(
    conn: &Connection,
    requested_year: Option<i32>,
) -> Result<TrackDebutTimelineResponse> {
    track_debut_timeline_for_source(conn, requested_year, "US")
}

pub(super) fn track_debut_timeline_for_source(
    conn: &Connection,
    requested_year: Option<i32>,
    chart_source: &str,
) -> Result<TrackDebutTimelineResponse> {
    let (
        rank_field,
        year_field,
        debut_date_field,
        debut_year_field,
        debut_month_field,
        debut_week_field,
        debut_week_key_field,
    ) = if timeline_source_is_official_uk(chart_source) {
        (
            "t.official_uk_rank",
            "t.official_uk_year",
            "t.official_uk_debut_date",
            "t.official_uk_debut_year",
            "t.official_uk_debut_month",
            "t.official_uk_debut_week",
            "t.official_uk_debut_week_key",
        )
    } else if timeline_source_is_norsktoppen(chart_source) {
        (
            "t.norsktoppen_rank",
            "t.norsktoppen_year",
            "t.norsktoppen_debut_date",
            "t.norsktoppen_debut_year",
            "t.norsktoppen_debut_month",
            "t.norsktoppen_debut_week",
            "t.norsktoppen_debut_week_key",
        )
    } else if timeline_source_is_ti_i_skuddet(chart_source) {
        (
            "t.ti_i_skuddet_rank",
            "t.ti_i_skuddet_year",
            "t.ti_i_skuddet_debut_date",
            "t.ti_i_skuddet_debut_year",
            "t.ti_i_skuddet_debut_month",
            "t.ti_i_skuddet_debut_week",
            "t.ti_i_skuddet_debut_week_key",
        )
    } else if timeline_source_is_vg_lista(chart_source) {
        (
            "t.vg_lista_rank",
            "t.vg_lista_year",
            "t.vg_lista_debut_date",
            "t.vg_lista_debut_year",
            "t.vg_lista_debut_month",
            "t.vg_lista_debut_week",
            "t.vg_lista_debut_week_key",
        )
    } else {
        (
            "t.billboard_single_rank",
            "t.billboard_single_year",
            "t.billboard_single_debut_date",
            "t.billboard_single_debut_year",
            "t.billboard_single_debut_month",
            "t.billboard_single_debut_week",
            "t.billboard_single_debut_week_key",
        )
    };
    let sql = format!(
        "SELECT
            CAST(t.id AS TEXT),
            t.id,
            t.album_id,
            t.title,
            t.display_artist,
            t.album,
            t.album_artist_display,
            t.canonical_genre,
            t.year,
            t.normalized_rating,
            t.love,
            {rank_field},
            {year_field},
            {debut_date_field},
            {debut_year_field},
            {debut_month_field},
            {debut_week_field},
            {debut_week_key_field},
            c.cache_path,
            c.mime_type
         FROM tracks t
         LEFT JOIN album_covers c ON c.album_id = t.album_id
         WHERE {debut_date_field} IS NOT NULL
           AND {debut_year_field} IS NOT NULL
           AND {debut_month_field} IS NOT NULL
           AND {debut_week_field} IS NOT NULL
           AND {debut_week_key_field} IS NOT NULL
         ORDER BY
            {debut_date_field} ASC,
            t.title COLLATE NOCASE ASC,
            t.id ASC"
    );
    let mut statement = conn.prepare(&sql)?;
    let track_rows = statement.query_map([], |row| {
        Ok(TrackDebutTimelineTrack {
            id: row.get(0)?,
            track_id: row.get(1)?,
            album_id: row.get(2)?,
            title: row.get(3)?,
            display_artist: row.get(4)?,
            album: row.get(5)?,
            album_artist_display: row.get(6)?,
            canonical_genre: row.get(7)?,
            year: row.get(8)?,
            normalized_rating: row.get(9)?,
            love: row.get(10)?,
            billboard_single_rank: row.get(11)?,
            billboard_single_year: row.get(12)?,
            billboard_single_debut_date: row.get(13)?,
            billboard_single_debut_year: row.get(14)?,
            billboard_single_debut_month: row.get(15)?,
            billboard_single_debut_week: row.get(16)?,
            billboard_single_debut_week_key: row.get(17)?,
            cover_path: row.get(18)?,
            cover_mime_type: row.get(19)?,
        })
    })?;
    let raw_tracks = track_rows.collect::<rusqlite::Result<Vec<_>>>()?;
    let mut canonical_tracks: HashMap<String, TrackDebutTimelineTrack> = HashMap::new();
    for track in raw_tracks {
        let artist_key = crate::identity::loose_key(track.display_artist.as_deref().unwrap_or_default());
        let title_key = crate::identity::loose_key(track.title.as_deref().unwrap_or_default());
        let identity_key = format!(
            "{}\u{1f}{}\u{1f}{}",
            remove_artist_connector_tokens(&artist_key),
            strip_title_feature_suffix(&title_key).unwrap_or(title_key),
            track.billboard_single_debut_date
        );
        let should_replace = canonical_tracks
            .get(&identity_key)
            .map(|current| timeline_track_priority(&track) > timeline_track_priority(current))
            .unwrap_or(true);
        if should_replace {
            canonical_tracks.insert(identity_key, track);
        }
    }
    let mut all_tracks = canonical_tracks.into_values().collect::<Vec<_>>();
    all_tracks.sort_by(|left, right| {
        left.billboard_single_debut_date
            .cmp(&right.billboard_single_debut_date)
            .then_with(|| {
                crate::identity::loose_key(left.title.as_deref().unwrap_or_default()).cmp(
                    &crate::identity::loose_key(right.title.as_deref().unwrap_or_default()),
                )
            })
            .then(left.track_id.cmp(&right.track_id))
    });

    let mut grouped: HashMap<i32, TrackDebutTimelineYear> = HashMap::new();
    for track in &all_tracks {
        let year = grouped
            .entry(track.billboard_single_debut_year)
            .or_insert_with(|| TrackDebutTimelineYear {
                year: track.billboard_single_debut_year,
                track_count: 0,
                representative_track: None,
            });
        year.track_count += 1;
        let should_replace = year
            .representative_track
            .as_ref()
            .map(|current| {
                let candidate_has_cover = track.cover_path.is_some();
                let current_has_cover = current.cover_path.is_some();
                let candidate_loved = track.love.as_deref() == Some("L");
                let current_loved = current.love.as_deref() == Some("L");
                (candidate_has_cover && !current_has_cover)
                    || (candidate_has_cover == current_has_cover
                        && candidate_loved
                        && !current_loved)
                    || (candidate_has_cover == current_has_cover
                        && candidate_loved == current_loved
                        && track.normalized_rating.unwrap_or(i32::MIN)
                            > current.normalized_rating.unwrap_or(i32::MIN))
                    || (candidate_has_cover == current_has_cover
                        && candidate_loved == current_loved
                        && track.normalized_rating == current.normalized_rating
                        && track.billboard_single_rank.unwrap_or(i32::MAX)
                            < current.billboard_single_rank.unwrap_or(i32::MAX))
            })
            .unwrap_or(true);
        if should_replace {
            year.representative_track = Some(track.clone());
        }
    }

    let mut years = grouped.into_values().collect::<Vec<_>>();
    years.sort_by_key(|year| year.year);
    let selected_year = requested_year
        .filter(|requested| years.iter().any(|year| year.year == *requested))
        .or_else(|| {
            years
                .iter()
                .max_by(|left, right| {
                    left.track_count
                        .cmp(&right.track_count)
                        .then(left.year.cmp(&right.year))
                })
                .map(|year| year.year)
        });
    let tracks = selected_year
        .map(|selected| {
            all_tracks
                .iter()
                .filter(|track| track.billboard_single_debut_year == selected)
                .cloned()
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let undated_sql = format!(
        "SELECT COUNT(*)
         FROM tracks t
         WHERE {debut_date_field} IS NULL
            OR {debut_year_field} IS NULL
            OR {debut_month_field} IS NULL
            OR {debut_week_field} IS NULL
            OR {debut_week_key_field} IS NULL"
    );
    let undated_track_count = conn.query_row(&undated_sql, [], |row| row.get(0))?;

    Ok(TrackDebutTimelineResponse {
        years,
        selected_year,
        tracks,
        dated_track_count: all_tracks.len() as i64,
        undated_track_count,
    })
}

pub(super) fn timeline_source_is_billboard(value: &str) -> bool {
    value.eq_ignore_ascii_case("billboard") || value.eq_ignore_ascii_case("US")
}

pub(super) fn timeline_source_is_vg_lista(value: &str) -> bool {
    value.eq_ignore_ascii_case("vgLista") || value.eq_ignore_ascii_case("NO")
}

pub(super) fn timeline_source_is_official_uk(value: &str) -> bool {
    value.eq_ignore_ascii_case("officialUk")
        || value.eq_ignore_ascii_case("official_uk")
        || value.eq_ignore_ascii_case("UK")
}

pub(super) fn timeline_source_is_ti_i_skuddet(value: &str) -> bool {
    value.eq_ignore_ascii_case("tiISkuddet")
        || value.eq_ignore_ascii_case("ti_i_skuddet")
        || value.eq_ignore_ascii_case("Ti i Skuddet")
}

pub(super) fn timeline_source_is_norsktoppen(value: &str) -> bool {
    value.eq_ignore_ascii_case("norsktoppen")
}
