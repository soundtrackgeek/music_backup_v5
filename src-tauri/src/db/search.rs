use super::*;

pub fn musicbrainz_origin_country_options(
    conn: &Connection,
) -> Result<Vec<MusicBrainzOriginCountryOption>> {
    if !schema_table_exists(conn, "musicbrainz_origin_countries")?
        || !schema_table_exists(conn, "musicbrainz_artist_origin_countries")?
    {
        return Ok(Vec::new());
    }

    let mut stmt = conn
        .prepare(
            "
            SELECT
                countries.country_code,
                countries.country_name,
                COUNT(artist.local_artist_key) AS artist_count
            FROM musicbrainz_origin_countries countries
            LEFT JOIN musicbrainz_artist_origin_countries artist
              ON artist.country_code = countries.country_code
            GROUP BY countries.country_code, countries.country_name
            HAVING artist_count > 0
            ORDER BY LOWER(countries.country_name), countries.country_code
            ",
        )
        .context("Could not prepare MusicBrainz origin-country options")?;
    let rows = stmt
        .query_map([], |row| {
            Ok(MusicBrainzOriginCountryOption {
                code: row.get(0)?,
                name: row.get(1)?,
                artist_count: row.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not read MusicBrainz origin-country options")?;

    Ok(rows)
}

pub fn rebuild_search_indexes(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        DELETE FROM album_search_fts;
        DELETE FROM track_search_fts;

        INSERT INTO album_search_fts (
            album_id, album, album_artist_display, canonical_genre, publisher
        )
        SELECT
            id,
            COALESCE(album, ''),
            COALESCE(album_artist_display, ''),
            COALESCE(canonical_genre, ''),
            COALESCE(publisher, '')
        FROM albums;

        INSERT INTO track_search_fts (
            track_id, album_id, title, display_artist, album, album_artist_display,
            canonical_genre, publisher, file_path, filename
        )
        SELECT
            id,
            album_id,
            COALESCE(title, ''),
            COALESCE(display_artist, ''),
            COALESCE(album, ''),
            COALESCE(album_artist_display, ''),
            COALESCE(canonical_genre, ''),
            COALESCE(publisher, ''),
            COALESCE(file_path, ''),
            COALESCE(filename, '')
        FROM tracks;
        ",
    )
    .context("Could not rebuild search indexes")?;
    Ok(())
}

#[cfg(not(test))]
pub fn search_library_for_app(app: &AppHandle, request: BrowseRequest) -> Result<BrowseResponse> {
    let (conn, _) = open_search(app)?;
    search_library(&conn, request, COMPLETE_SEARCH_RESULT_LIMIT)
}

pub(super) const COMPLETE_SEARCH_RESULT_LIMIT: u32 = u32::MAX;

#[cfg(not(test))]
pub fn inspect_current_view_for_app(
    app: &AppHandle,
    request: &BrowseRequest,
    scope_limit: Option<u32>,
    inspection: &ViewInspectionRequest,
) -> Result<ViewInspectionResult> {
    let (conn, _) = open_search(app)?;
    inspect_current_view(&conn, request, scope_limit, inspection)
}

#[cfg(not(test))]
pub fn inspect_music_research_context_for_app(
    app: &AppHandle,
    context: &AiMusicResearchContext,
    inspection: &MusicResearchInspectionRequest,
) -> Result<MusicResearchInspectionResult> {
    let (conn, _) = open_search(app)?;
    inspect_music_research_context(&conn, context, inspection)
}

#[cfg(not(test))]
pub fn list_artists_for_app(
    app: &AppHandle,
    request: ArtistListRequest,
) -> Result<ArtistListResponse> {
    let (conn, _) = open_read(app)?;
    list_artists(&conn, request, 500)
}

#[cfg(not(test))]
pub fn artist_track_highlights_for_app(
    app: &AppHandle,
    artist_id: &str,
) -> Result<ArtistTrackHighlights> {
    let (conn, _) = open_read(app)?;
    artist_track_highlights(&conn, artist_id)
}

#[cfg(not(test))]
pub fn list_genres_for_app(
    app: &AppHandle,
    request: GenreListRequest,
) -> Result<GenreListResponse> {
    let (conn, _) = open_read(app)?;
    list_genres(&conn, request, 2000)
}

#[cfg(not(test))]
pub fn genre_timeline_for_app(
    app: &AppHandle,
    request: GenreTimelineRequest,
) -> Result<GenreTimelineResponse> {
    let (conn, _) = open_read(app)?;
    genre_timeline(&conn, request)
}

#[cfg(not(test))]
pub fn artist_timeline_for_app(
    app: &AppHandle,
    request: ArtistTimelineRequest,
) -> Result<ArtistTimelineResponse> {
    let (conn, _) = open_read(app)?;
    artist_timeline(&conn, request)
}

#[cfg(not(test))]
pub fn genre_suggestion_names_for_app(app: &AppHandle) -> Result<Vec<String>> {
    let (conn, _) = open_read(app)?;
    genre_suggestion_names(&conn)
}

pub(super) fn search_library(
    conn: &Connection,
    request: BrowseRequest,
    max_limit: u32,
) -> Result<BrowseResponse> {
    let view = normalize_view(&request.view);
    let is_tracks = view == "tracks";
    let limit = request.limit.clamp(1, max_limit);
    let offset = request.offset;
    let filters = &request.filters;

    let select_sql = if is_tracks {
        "
        SELECT
            CAST(t.id AS TEXT),
            t.id,
            t.album_id,
            t.album,
            t.album_artist_display,
            t.display_artist,
            t.title,
            t.canonical_genre,
            COALESCE(t.publisher, a.publisher),
            t.year,
            t.release_year,
            a.total_tracks,
            a.rated_tracks,
            a.rating_completeness,
            a.total_seconds,
            a.loved_tracks,
            a.tmoe_seconds,
            a.ae_ratio,
            a.effective_album_rating,
            a.album_score,
            a.billboard_rank,
            a.billboard_year,
            a.billboard_debut_year,
            a.billboard_debut_month,
            a.billboard_debut_week,
            a.billboard_debut_week_key,
            t.billboard_single_rank,
            t.billboard_single_year,
            t.billboard_single_debut_date,
            t.billboard_single_debut_year,
            t.billboard_single_debut_month,
            t.billboard_single_debut_week,
            t.billboard_single_debut_week_key,
            t.vg_lista_rank,
            t.vg_lista_year,
            t.vg_lista_debut_year,
            t.vg_lista_debut_month,
            t.vg_lista_debut_week,
            t.vg_lista_debut_week_key,
            t.official_uk_rank,
            t.official_uk_year,
            t.official_uk_debut_year,
            t.official_uk_debut_month,
            t.official_uk_debut_week,
            t.official_uk_debut_week_key,
            t.ti_i_skuddet_rank,
            t.ti_i_skuddet_year,
            t.ti_i_skuddet_debut_date,
            t.ti_i_skuddet_debut_year,
            t.ti_i_skuddet_debut_month,
            t.ti_i_skuddet_debut_week,
            t.ti_i_skuddet_debut_week_key,
            t.norsktoppen_rank,
            t.norsktoppen_year,
            t.norsktoppen_debut_date,
            t.norsktoppen_debut_year,
            t.norsktoppen_debut_month,
            t.norsktoppen_debut_week,
            t.norsktoppen_debut_week_key,
            t.time_seconds,
            t.normalized_rating,
            t.disc_number,
            t.track_number,
            t.love,
            t.file_path,
            t.filename,
            c.cache_path,
            c.mime_type,
            origin.country_code,
            origin.country_name,
            origin.raw_area_name,
            origin.review_state,
            q.format,
            q.bitrate_kbps,
            q.size_bytes,
            q.duration_ms,
            aq.matched_tracks,
            aq.min_bitrate_kbps,
            aq.avg_bitrate_kbps,
            aq.max_bitrate_kbps,
            aq.below_320_tracks,
            aq.mixed_quality
        "
    } else {
        "
        SELECT
            a.id,
            NULL,
            a.id,
            a.album,
            a.album_artist_display,
            NULL,
            NULL,
            a.canonical_genre,
            a.publisher,
            a.year,
            a.release_year,
            a.total_tracks,
            a.rated_tracks,
            a.rating_completeness,
            a.total_seconds,
            a.loved_tracks,
            a.tmoe_seconds,
            a.ae_ratio,
            a.effective_album_rating,
            a.album_score,
            a.billboard_rank,
            a.billboard_year,
            a.billboard_debut_year,
            a.billboard_debut_month,
            a.billboard_debut_week,
            a.billboard_debut_week_key,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            a.vg_lista_rank,
            a.vg_lista_year,
            a.vg_lista_debut_year,
            a.vg_lista_debut_month,
            a.vg_lista_debut_week,
            a.vg_lista_debut_week_key,
            a.official_uk_rank,
            a.official_uk_year,
            a.official_uk_debut_year,
            a.official_uk_debut_month,
            a.official_uk_debut_week,
            a.official_uk_debut_week_key,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            (
                SELECT MIN(NULLIF(TRIM(tx.file_path), ''))
                FROM tracks tx
                WHERE tx.album_id = a.id
            ),
            (
                SELECT MIN(NULLIF(TRIM(tx.filename), ''))
                FROM tracks tx
                WHERE tx.album_id = a.id
            ),
            c.cache_path,
            c.mime_type,
            origin.country_code,
            origin.country_name,
            origin.raw_area_name,
            origin.review_state,
            aq.formats,
            NULL,
            aq.total_size_bytes,
            NULL,
            aq.matched_tracks,
            aq.min_bitrate_kbps,
            aq.avg_bitrate_kbps,
            aq.max_bitrate_kbps,
            aq.below_320_tracks,
            aq.mixed_quality
        "
    };

    let from_sql = if is_tracks {
        let origin_key_sql = artist_key_sql("a.album_artist_display");
        format!(
            "FROM tracks t LEFT JOIN albums a ON a.id = t.album_id LEFT JOIN album_covers c ON c.album_id = t.album_id LEFT JOIN musicbrainz_artist_origin_countries origin ON origin.local_artist_key = {origin_key_sql} LEFT JOIN musicbrainz_artist_infos info ON info.local_artist_key = {origin_key_sql} LEFT JOIN music_doctor_track_quality q ON q.file_path = t.file_path AND q.filename = t.filename LEFT JOIN music_doctor_album_quality aq ON aq.album_id = a.id"
        )
    } else {
        let origin_key_sql = artist_key_sql("a.album_artist_display");
        format!(
            "FROM albums a LEFT JOIN album_covers c ON c.album_id = a.id LEFT JOIN musicbrainz_artist_origin_countries origin ON origin.local_artist_key = {origin_key_sql} LEFT JOIN musicbrainz_artist_infos info ON info.local_artist_key = {origin_key_sql} LEFT JOIN music_doctor_album_quality aq ON aq.album_id = a.id"
        )
    };

    let (where_sql, values) = build_where_clause(is_tracks, &request.search_text, filters);
    let count_sql = format!("SELECT COUNT(*) {from_sql} {where_sql}");
    let total = conn
        .query_row(&count_sql, params_from_iter(values.iter()), |row| {
            row.get(0)
        })
        .context("Could not count browse results")?;

    let order_sql = order_clause(is_tracks, &request.sort);
    let sql = format!("{select_sql} {from_sql} {where_sql} {order_sql} LIMIT ? OFFSET ?");
    let mut row_values = values;
    row_values.push(Value::Integer(i64::from(limit)));
    row_values.push(Value::Integer(i64::from(offset)));

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(params_from_iter(row_values.iter()), browse_row_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load browse results")?;

    Ok(BrowseResponse {
        view,
        rows,
        total,
        limit,
        offset,
    })
}

pub(super) fn browse_row_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<BrowseRow> {
    Ok(BrowseRow {
        id: row.get(0)?,
        track_id: row.get(1)?,
        album_id: row.get(2)?,
        album: row.get(3)?,
        album_artist_display: row.get(4)?,
        display_artist: row.get(5)?,
        title: row.get(6)?,
        canonical_genre: row.get(7)?,
        publisher: row.get(8)?,
        year: row.get(9)?,
        release_year: row.get(10)?,
        total_tracks: row.get(11)?,
        rated_tracks: row.get(12)?,
        rating_completeness: row.get(13)?,
        total_seconds: row.get(14)?,
        loved_tracks: row.get(15)?,
        tmoe_seconds: row.get(16)?,
        ae_ratio: row.get(17)?,
        effective_album_rating: row.get(18)?,
        album_score: row.get(19)?,
        billboard_rank: row.get(20)?,
        billboard_year: row.get(21)?,
        billboard_debut_year: row.get(22)?,
        billboard_debut_month: row.get(23)?,
        billboard_debut_week: row.get(24)?,
        billboard_debut_week_key: row.get(25)?,
        billboard_single_rank: row.get(26)?,
        billboard_single_year: row.get(27)?,
        billboard_single_debut_date: row.get(28)?,
        billboard_single_debut_year: row.get(29)?,
        billboard_single_debut_month: row.get(30)?,
        billboard_single_debut_week: row.get(31)?,
        billboard_single_debut_week_key: row.get(32)?,
        vg_lista_rank: row.get(33)?,
        vg_lista_year: row.get(34)?,
        vg_lista_debut_year: row.get(35)?,
        vg_lista_debut_month: row.get(36)?,
        vg_lista_debut_week: row.get(37)?,
        vg_lista_debut_week_key: row.get(38)?,
        official_uk_rank: row.get(39)?,
        official_uk_year: row.get(40)?,
        official_uk_debut_year: row.get(41)?,
        official_uk_debut_month: row.get(42)?,
        official_uk_debut_week: row.get(43)?,
        official_uk_debut_week_key: row.get(44)?,
        ti_i_skuddet_rank: row.get(45)?,
        ti_i_skuddet_year: row.get(46)?,
        ti_i_skuddet_debut_date: row.get(47)?,
        ti_i_skuddet_debut_year: row.get(48)?,
        ti_i_skuddet_debut_month: row.get(49)?,
        ti_i_skuddet_debut_week: row.get(50)?,
        ti_i_skuddet_debut_week_key: row.get(51)?,
        norsktoppen_rank: row.get(52)?,
        norsktoppen_year: row.get(53)?,
        norsktoppen_debut_date: row.get(54)?,
        norsktoppen_debut_year: row.get(55)?,
        norsktoppen_debut_month: row.get(56)?,
        norsktoppen_debut_week: row.get(57)?,
        norsktoppen_debut_week_key: row.get(58)?,
        track_seconds: row.get(59)?,
        normalized_rating: row.get(60)?,
        disc_number: row.get(61)?,
        track_number: row.get(62)?,
        love: row.get(63)?,
        file_path: row.get(64)?,
        filename: row.get(65)?,
        cover_path: row.get(66)?,
        cover_mime_type: row.get(67)?,
        origin_country_code: row.get(68)?,
        origin_country_name: row.get(69)?,
        origin_country_raw_area: row.get(70)?,
        origin_country_review_state: row.get(71)?,
        file_format: row.get(72)?,
        bitrate_kbps: row.get(73)?,
        quality_file_size_bytes: row.get(74)?,
        doctor_duration_ms: row.get(75)?,
        quality_track_count: row.get(76)?,
        min_bitrate_kbps: row.get(77)?,
        avg_bitrate_kbps: row.get(78)?,
        max_bitrate_kbps: row.get(79)?,
        below_320_tracks: row.get(80)?,
        mixed_audio_quality: row.get::<_, Option<i64>>(81)?.map(|value| value != 0),
    })
}

pub(super) fn build_where_clause(
    is_tracks: bool,
    search_text: &str,
    filters: &BrowseFilters,
) -> (String, Vec<Value>) {
    let mut conditions = Vec::new();
    let mut values = Vec::new();

    if let Some(query) = fts_query(search_text) {
        if is_tracks {
            conditions.push(
                "t.id IN (
                    SELECT CAST(track_id AS INTEGER)
                    FROM track_search_fts
                    WHERE track_search_fts MATCH ?
                )"
                .to_string(),
            );
        } else {
            conditions.push(
                "a.id IN (
                    SELECT album_id
                    FROM album_search_fts
                    WHERE album_search_fts MATCH ?
                )"
                .to_string(),
            );
        }
        values.push(Value::Text(query));
    }

    add_album_id_condition(
        &mut conditions,
        &mut values,
        if is_tracks { "t.album_id" } else { "a.id" },
        &filters.album_ids,
    );
    if is_tracks {
        add_track_id_condition(&mut conditions, &mut values, "t.id", &filters.track_ids);
    }
    let artist_key_field = if is_tracks {
        artist_key_sql("t.album_artist_display")
    } else {
        artist_key_sql("a.album_artist_display")
    };
    add_artist_key_condition(
        &mut conditions,
        &mut values,
        &artist_key_field,
        &filters.artist_keys,
    );

    if is_tracks {
        add_text_condition(
            &mut conditions,
            &mut values,
            "t.album",
            &filters.album_title,
        );
        add_text_condition(
            &mut conditions,
            &mut values,
            "t.title",
            &filters.track_title,
        );
        add_text_condition(
            &mut conditions,
            &mut values,
            "t.album_artist_display",
            &filters.album_artist,
        );
        add_text_condition(
            &mut conditions,
            &mut values,
            "t.display_artist",
            &filters.display_artist,
        );
        add_text_condition(
            &mut conditions,
            &mut values,
            "t.publisher",
            &filters.publisher,
        );
        add_text_condition(
            &mut conditions,
            &mut values,
            "t.file_path",
            &filters.file_path,
        );
        add_text_condition(
            &mut conditions,
            &mut values,
            "t.filename",
            &filters.filename,
        );
    } else {
        add_text_condition(
            &mut conditions,
            &mut values,
            "a.album",
            &filters.album_title,
        );
        add_exists_text_condition(
            &mut conditions,
            &mut values,
            "tx.title",
            &filters.track_title,
            "a.id",
        );
        add_text_condition(
            &mut conditions,
            &mut values,
            "a.album_artist_display",
            &filters.album_artist,
        );
        add_exists_text_condition(
            &mut conditions,
            &mut values,
            "tx.display_artist",
            &filters.display_artist,
            "a.id",
        );
        add_text_condition(
            &mut conditions,
            &mut values,
            "a.publisher",
            &filters.publisher,
        );
        add_exists_text_condition(
            &mut conditions,
            &mut values,
            "tx.file_path",
            &filters.file_path,
            "a.id",
        );
        add_exists_text_condition(
            &mut conditions,
            &mut values,
            "tx.filename",
            &filters.filename,
            "a.id",
        );
    }
    add_i32_range(
        &mut conditions,
        &mut values,
        if is_tracks {
            "t.vg_lista_rank"
        } else {
            "a.vg_lista_rank"
        },
        filters.vg_lista_rank_min,
        filters.vg_lista_rank_max,
    );
    add_iso_week_range(
        &mut conditions,
        &mut values,
        if is_tracks {
            "t.vg_lista_debut_week_key"
        } else {
            "a.vg_lista_debut_week_key"
        },
        filters.vg_lista_debut_week_from.as_deref(),
        filters.vg_lista_debut_week_to.as_deref(),
    );
    add_i32_range(
        &mut conditions,
        &mut values,
        if is_tracks {
            "t.official_uk_rank"
        } else {
            "a.official_uk_rank"
        },
        filters.official_uk_rank_min,
        filters.official_uk_rank_max,
    );
    add_iso_week_range(
        &mut conditions,
        &mut values,
        if is_tracks {
            "t.official_uk_debut_week_key"
        } else {
            "a.official_uk_debut_week_key"
        },
        filters.official_uk_debut_week_from.as_deref(),
        filters.official_uk_debut_week_to.as_deref(),
    );
    if is_tracks {
        add_i32_range(
            &mut conditions,
            &mut values,
            "t.ti_i_skuddet_rank",
            filters.ti_i_skuddet_rank_min,
            filters.ti_i_skuddet_rank_max,
        );
        add_iso_week_range(
            &mut conditions,
            &mut values,
            "t.ti_i_skuddet_debut_week_key",
            filters.ti_i_skuddet_debut_week_from.as_deref(),
            filters.ti_i_skuddet_debut_week_to.as_deref(),
        );
        add_i32_range(
            &mut conditions,
            &mut values,
            "t.norsktoppen_rank",
            filters.norsktoppen_rank_min,
            filters.norsktoppen_rank_max,
        );
        add_iso_week_range(
            &mut conditions,
            &mut values,
            "t.norsktoppen_debut_week_key",
            filters.norsktoppen_debut_week_from.as_deref(),
            filters.norsktoppen_debut_week_to.as_deref(),
        );
    }

    if let Some(query) = fts_query(&filters.has_track_text) {
        let album_ref = if is_tracks { "t.album_id" } else { "a.id" };
        conditions.push(format!(
            "EXISTS (
                SELECT 1
                FROM track_search_fts
                WHERE album_id = {album_ref}
                  AND track_search_fts MATCH ?
            )"
        ));
        values.push(Value::Text(query));
    }

    let genre_field = if is_tracks {
        "COALESCE(t.genre_normalized, a.genre_normalized)"
    } else {
        "a.genre_normalized"
    };
    add_text_list_condition(
        &mut conditions,
        &mut values,
        genre_field,
        &filters.genres,
        false,
    );
    add_text_list_condition(
        &mut conditions,
        &mut values,
        genre_field,
        &filters.excluded_genres,
        true,
    );

    add_i32_range(
        &mut conditions,
        &mut values,
        "a.billboard_rank",
        filters.billboard_rank_min,
        filters.billboard_rank_max,
    );
    add_iso_week_range(
        &mut conditions,
        &mut values,
        "a.billboard_debut_week_key",
        filters.billboard_debut_week_from.as_deref(),
        filters.billboard_debut_week_to.as_deref(),
    );
    if is_tracks {
        add_i32_range(
            &mut conditions,
            &mut values,
            "t.billboard_single_rank",
            filters.billboard_single_rank_min,
            filters.billboard_single_rank_max,
        );
        add_iso_date_range(
            &mut conditions,
            &mut values,
            "t.billboard_single_debut_date",
            filters.billboard_single_debut_date_from.as_deref(),
            filters.billboard_single_debut_date_to.as_deref(),
        );
    }

    let year_field = if is_tracks { "t.year" } else { "a.year" };
    let release_year_field = if is_tracks {
        "t.release_year"
    } else {
        "a.release_year"
    };
    add_i32_range(
        &mut conditions,
        &mut values,
        year_field,
        filters.year_from,
        filters.year_to,
    );
    add_i32_range(
        &mut conditions,
        &mut values,
        release_year_field,
        filters.release_year_from,
        filters.release_year_to,
    );

    add_seconds_range(
        &mut conditions,
        &mut values,
        if is_tracks {
            "t.time_seconds"
        } else {
            "a.total_seconds"
        },
        filters.total_minutes_min,
        filters.total_minutes_max,
    );
    add_i64_range(
        &mut conditions,
        &mut values,
        "a.total_tracks",
        filters.track_count_min,
        filters.track_count_max,
    );
    add_i64_range(
        &mut conditions,
        &mut values,
        "a.rated_tracks",
        filters.rated_tracks_min,
        filters.rated_tracks_max,
    );
    add_i32_range(
        &mut conditions,
        &mut values,
        "a.effective_album_rating",
        filters.album_rating_min,
        filters.album_rating_max,
    );

    if is_tracks {
        add_track_rating_range(
            &mut conditions,
            &mut values,
            "t.normalized_rating",
            filters.track_rating_min,
            filters.track_rating_max,
        );
    } else {
        add_album_track_rating_range(
            &mut conditions,
            &mut values,
            filters.track_rating_min,
            filters.track_rating_max,
        );
    }

    if let Some(minimum) = filters.rating_completeness_min {
        conditions.push("a.rating_completeness >= ?".to_string());
        values.push(Value::Real(normalize_percentage(minimum)));
    }
    if let Some(maximum) = filters.rating_completeness_max {
        conditions.push("a.rating_completeness <= ?".to_string());
        values.push(Value::Real(normalize_percentage(maximum)));
    }
    if filters.not_fully_rated {
        conditions.push("a.rating_completeness < 1.0".to_string());
    }

    add_i64_range(
        &mut conditions,
        &mut values,
        if is_tracks {
            "(CASE WHEN t.love = 'L' THEN 1 ELSE 0 END)"
        } else {
            "a.loved_tracks"
        },
        filters.loved_tracks_min,
        filters.loved_tracks_max,
    );

    add_i32_range(
        &mut conditions,
        &mut values,
        if is_tracks {
            "q.bitrate_kbps"
        } else {
            "aq.min_bitrate_kbps"
        },
        filters.bitrate_kbps_min,
        filters.bitrate_kbps_max,
    );
    if filters.mixed_audio_quality {
        conditions.push("aq.mixed_quality = 1".to_string());
    }

    add_origin_country_conditions(
        &mut conditions,
        &mut values,
        &filters.origin_country_codes,
        &filters.excluded_origin_country_codes,
        filters.missing_origin_country,
    );
    add_artist_info_conditions(&mut conditions, &mut values, filters);

    add_missing_field_conditions(
        &mut conditions,
        is_tracks,
        filters.missing_fields.as_slice(),
    );

    let where_sql = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    (where_sql, values)
}

pub(super) fn add_album_id_condition(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    album_ids: &[String],
) {
    let normalized = album_ids
        .iter()
        .map(|album_id| album_id.trim())
        .filter(|album_id| !album_id.is_empty())
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();

    if normalized.is_empty() {
        return;
    }

    let placeholders = std::iter::repeat("?")
        .take(normalized.len())
        .collect::<Vec<_>>()
        .join(", ");
    conditions.push(format!("{field} IN ({placeholders})"));
    values.extend(normalized.into_iter().map(Value::Text));
}

pub(super) fn add_track_id_condition(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    track_ids: &[i64],
) {
    if track_ids.is_empty() {
        return;
    }

    let placeholders = std::iter::repeat("?")
        .take(track_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    conditions.push(format!("{field} IN ({placeholders})"));
    values.extend(track_ids.iter().copied().map(Value::Integer));
}

pub(super) fn add_artist_key_condition(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    artist_keys: &[String],
) {
    let normalized = artist_keys
        .iter()
        .map(|artist_key| identity::artist_key(artist_key))
        .filter(|artist_key| !artist_key.is_empty())
        .collect::<Vec<_>>();

    if normalized.is_empty() {
        return;
    }

    let placeholders = std::iter::repeat("?")
        .take(normalized.len())
        .collect::<Vec<_>>()
        .join(", ");
    conditions.push(format!("{field} IN ({placeholders})"));
    values.extend(normalized.into_iter().map(Value::Text));
}

pub(super) fn add_origin_country_conditions(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    country_codes: &[String],
    excluded_country_codes: &[String],
    missing_origin_country: bool,
) {
    let normalized = country_codes
        .iter()
        .map(|code| normalize_country_code(code))
        .filter(|code| !code.is_empty())
        .collect::<Vec<_>>();

    if !normalized.is_empty() {
        let placeholders = std::iter::repeat("?")
            .take(normalized.len())
            .collect::<Vec<_>>()
            .join(", ");
        conditions.push(format!(
            "UPPER(COALESCE(origin.country_code, '')) IN ({placeholders})"
        ));
        values.extend(normalized.into_iter().map(Value::Text));
    }

    let excluded = excluded_country_codes
        .iter()
        .map(|code| normalize_country_code(code))
        .filter(|code| !code.is_empty())
        .collect::<Vec<_>>();

    if !excluded.is_empty() {
        let placeholders = std::iter::repeat("?")
            .take(excluded.len())
            .collect::<Vec<_>>()
            .join(", ");
        conditions.push(format!(
            "UPPER(COALESCE(origin.country_code, '')) NOT IN ({placeholders})"
        ));
        values.extend(excluded.into_iter().map(Value::Text));
    }

    if missing_origin_country {
        conditions.push("NULLIF(TRIM(COALESCE(origin.country_code, '')), '') IS NULL".to_string());
    }
}

pub(super) fn add_artist_info_conditions(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    filters: &BrowseFilters,
) {
    if let Some(artist_type) =
        normalized_artist_info_option(&filters.artist_type, &["person", "group"])
    {
        add_artist_type_condition(conditions, values, &artist_type);
    }
    if let Some(gender) = normalized_artist_info_option(&filters.artist_gender, &["male", "female"])
    {
        conditions.push("LOWER(COALESCE(info.gender, '')) = ?".to_string());
        values.push(Value::Text(gender));
    }

    if filters.artist_born_year_from.is_some() || filters.artist_born_year_to.is_some() {
        add_artist_type_condition(conditions, values, "person");
        add_i32_range(
            conditions,
            values,
            "info.life_begin_year",
            filters.artist_born_year_from,
            filters.artist_born_year_to,
        );
    }

    if filters.artist_died
        || filters.artist_died_year_from.is_some()
        || filters.artist_died_year_to.is_some()
    {
        add_artist_type_condition(conditions, values, "person");
        if filters.artist_died {
            conditions.push(artist_ended_condition());
        }
        add_i32_range(
            conditions,
            values,
            "info.life_end_year",
            filters.artist_died_year_from,
            filters.artist_died_year_to,
        );
    }

    if filters.artist_founded_year_from.is_some() || filters.artist_founded_year_to.is_some() {
        add_artist_type_condition(conditions, values, "group");
        add_i32_range(
            conditions,
            values,
            "info.life_begin_year",
            filters.artist_founded_year_from,
            filters.artist_founded_year_to,
        );
    }

    if filters.artist_dissolved
        || filters.artist_dissolved_year_from.is_some()
        || filters.artist_dissolved_year_to.is_some()
    {
        add_artist_type_condition(conditions, values, "group");
        if filters.artist_dissolved {
            conditions.push(artist_ended_condition());
        }
        add_i32_range(
            conditions,
            values,
            "info.life_end_year",
            filters.artist_dissolved_year_from,
            filters.artist_dissolved_year_to,
        );
    }
}

pub(super) fn normalized_artist_info_option(
    value: &str,
    allowed_values: &[&str],
) -> Option<String> {
    let normalized = value.trim().to_lowercase();
    if allowed_values.contains(&normalized.as_str()) {
        Some(normalized)
    } else {
        None
    }
}

pub(super) fn add_artist_type_condition(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    artist_type: &str,
) {
    conditions.push("LOWER(COALESCE(info.artist_type, '')) = ?".to_string());
    values.push(Value::Text(artist_type.to_string()));
}

pub(super) fn artist_ended_condition() -> String {
    "(COALESCE(info.life_ended, 0) = 1 OR info.life_end_year IS NOT NULL OR NULLIF(TRIM(COALESCE(info.life_end_date, '')), '') IS NOT NULL)".to_string()
}

pub(super) fn add_text_condition(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    filter: &TextFilter,
) {
    if let Some(condition) = text_condition(field, filter, values) {
        conditions.push(condition);
    }
}

pub(super) fn add_exists_text_condition(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    filter: &TextFilter,
    album_ref: &str,
) {
    let excludes_match = filter.operator == "doesNotContain";
    let inner_filter = if excludes_match {
        TextFilter {
            operator: "contains".to_string(),
            value: filter.value.clone(),
        }
    } else {
        filter.clone()
    };

    if let Some(condition) = text_condition(field, &inner_filter, values) {
        let exists_operator = if excludes_match {
            "NOT EXISTS"
        } else {
            "EXISTS"
        };
        conditions.push(format!(
            "{exists_operator} (SELECT 1 FROM tracks tx WHERE tx.album_id = {album_ref} AND {condition})"
        ));
    }
}

pub(super) fn text_condition(
    field: &str,
    filter: &TextFilter,
    values: &mut Vec<Value>,
) -> Option<String> {
    let value = filter.value.trim();
    if value.is_empty() {
        return None;
    }

    let normalized = value.to_lowercase();
    match filter.operator.as_str() {
        "equals" => {
            values.push(Value::Text(normalized));
            Some(format!("LOWER(COALESCE({field}, '')) = ?"))
        }
        "doesNotContain" => {
            values.push(Value::Text(format!("%{}%", escape_like(&normalized))));
            Some(format!(
                "LOWER(COALESCE({field}, '')) NOT LIKE ? ESCAPE '\\'"
            ))
        }
        "startsWith" => {
            values.push(Value::Text(format!("{}%", escape_like(&normalized))));
            Some(format!("LOWER(COALESCE({field}, '')) LIKE ? ESCAPE '\\'"))
        }
        _ => {
            values.push(Value::Text(format!("%{}%", escape_like(&normalized))));
            Some(format!("LOWER(COALESCE({field}, '')) LIKE ? ESCAPE '\\'"))
        }
    }
}

pub(super) fn add_text_list_condition(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    items: &[String],
    exclude: bool,
) {
    let normalized = expanded_genre_filter_values(items);

    if normalized.is_empty() {
        return;
    }

    let placeholders = std::iter::repeat("?")
        .take(normalized.len())
        .collect::<Vec<_>>()
        .join(", ");
    let operator = if exclude { "NOT IN" } else { "IN" };
    conditions.push(format!("COALESCE({field}, '') {operator} ({placeholders})"));
    values.extend(normalized.into_iter().map(Value::Text));
}

pub(super) fn expanded_genre_filter_values(items: &[String]) -> Vec<String> {
    let mut normalized = Vec::new();
    for item in items {
        let value = identity::display_key(item);
        if value.is_empty() {
            continue;
        }
        if is_score_genre_group_alias(&value) {
            for genre in SCORE_GENRE_GROUP {
                push_unique(&mut normalized, *genre);
            }
        } else {
            push_unique(&mut normalized, value);
        }
    }
    normalized
}

pub(super) fn is_score_genre_group_alias(value: &str) -> bool {
    matches!(value, "score" | "scores")
}

pub(super) fn push_unique(values: &mut Vec<String>, value: impl Into<String>) {
    let value = value.into();
    if !values.contains(&value) {
        values.push(value);
    }
}

pub(super) fn add_i32_range(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    minimum: Option<i32>,
    maximum: Option<i32>,
) {
    if let Some(minimum) = minimum {
        conditions.push(format!("{field} >= ?"));
        values.push(Value::Integer(i64::from(minimum)));
    }
    if let Some(maximum) = maximum {
        conditions.push(format!("{field} <= ?"));
        values.push(Value::Integer(i64::from(maximum)));
    }
}

pub(super) fn add_iso_week_range(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    minimum: Option<&str>,
    maximum: Option<&str>,
) {
    if let Some(minimum) = minimum.and_then(normalize_iso_week_key) {
        conditions.push(format!("{field} >= ?"));
        values.push(Value::Text(minimum));
    }
    if let Some(maximum) = maximum.and_then(normalize_iso_week_key) {
        conditions.push(format!("{field} <= ?"));
        values.push(Value::Text(maximum));
    }
}

pub(super) fn add_iso_date_range(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    minimum: Option<&str>,
    maximum: Option<&str>,
) {
    if let Some(minimum) = minimum.and_then(normalize_iso_date) {
        conditions.push(format!("{field} >= ?"));
        values.push(Value::Text(minimum));
    }
    if let Some(maximum) = maximum.and_then(normalize_iso_date) {
        conditions.push(format!("{field} <= ?"));
        values.push(Value::Text(maximum));
    }
}

pub(super) fn normalize_iso_date(value: &str) -> Option<String> {
    NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
        .ok()
        .map(|date| date.format("%Y-%m-%d").to_string())
}

pub(super) fn normalize_iso_week_key(value: &str) -> Option<String> {
    let normalized = value.trim().to_uppercase();
    let (year, week) = normalized.split_once("-W")?;
    if year.len() != 4 || week.is_empty() || week.len() > 2 {
        return None;
    }
    let year = year.parse::<i32>().ok()?;
    let week = week.parse::<u32>().ok()?;
    NaiveDate::from_isoywd_opt(year, week, Weekday::Mon)?;
    Some(format!("{year:04}-W{week:02}"))
}

pub(super) fn add_i64_range(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    minimum: Option<i64>,
    maximum: Option<i64>,
) {
    if let Some(minimum) = minimum {
        conditions.push(format!("{field} >= ?"));
        values.push(Value::Integer(minimum));
    }
    if let Some(maximum) = maximum {
        conditions.push(format!("{field} <= ?"));
        values.push(Value::Integer(maximum));
    }
}

pub(super) fn add_seconds_range(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    minimum_minutes: Option<f64>,
    maximum_minutes: Option<f64>,
) {
    if let Some(minimum) = minimum_minutes {
        conditions.push(format!("{field} >= ?"));
        values.push(Value::Integer((minimum * 60.0).round() as i64));
    }
    if let Some(maximum) = maximum_minutes {
        conditions.push(format!("{field} <= ?"));
        values.push(Value::Integer((maximum * 60.0).round() as i64));
    }
}

pub(super) fn add_track_rating_range(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    minimum: Option<f64>,
    maximum: Option<f64>,
) {
    if let Some(minimum) = minimum {
        conditions.push(format!("{field} >= ?"));
        values.push(Value::Integer(track_rating_points(minimum)));
    }
    if let Some(maximum) = maximum {
        conditions.push(format!("{field} <= ?"));
        values.push(Value::Integer(track_rating_points(maximum)));
    }
}

pub(super) fn add_album_track_rating_range(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    minimum: Option<f64>,
    maximum: Option<f64>,
) {
    if minimum.is_none() && maximum.is_none() {
        return;
    }

    let mut track_conditions = Vec::new();
    if let Some(minimum) = minimum {
        track_conditions.push("tx.normalized_rating >= ?".to_string());
        values.push(Value::Integer(track_rating_points(minimum)));
    }
    if let Some(maximum) = maximum {
        track_conditions.push("tx.normalized_rating <= ?".to_string());
        values.push(Value::Integer(track_rating_points(maximum)));
    }
    conditions.push(format!(
        "EXISTS (
            SELECT 1
            FROM tracks tx
            WHERE tx.album_id = a.id
              AND {}
        )",
        track_conditions.join(" AND ")
    ));
}

pub(super) fn add_missing_field_conditions(
    conditions: &mut Vec<String>,
    is_tracks: bool,
    fields: &[String],
) {
    for field in fields {
        let condition = match field.as_str() {
            "album" => Some(if is_tracks {
                "NULLIF(TRIM(COALESCE(t.album, '')), '') IS NULL"
            } else {
                "NULLIF(TRIM(COALESCE(a.album, '')), '') IS NULL"
            }),
            "albumArtist" => Some(if is_tracks {
                "NULLIF(TRIM(COALESCE(t.album_artist_display, '')), '') IS NULL"
            } else {
                "NULLIF(TRIM(COALESCE(a.album_artist_display, '')), '') IS NULL"
            }),
            "genre" => Some(if is_tracks {
                "NULLIF(TRIM(COALESCE(t.canonical_genre, a.canonical_genre, '')), '') IS NULL"
            } else {
                "NULLIF(TRIM(COALESCE(a.canonical_genre, '')), '') IS NULL"
            }),
            "year" => Some(if is_tracks {
                "t.year IS NULL"
            } else {
                "a.year IS NULL"
            }),
            "releaseYear" => Some("a.release_year IS NULL"),
            "publisher" => Some("NULLIF(TRIM(COALESCE(a.publisher, '')), '') IS NULL"),
            "trackTitle" => Some(if is_tracks {
                "NULLIF(TRIM(COALESCE(t.title, '')), '') IS NULL"
            } else {
                "EXISTS (
                    SELECT 1 FROM tracks missing_track
                    WHERE missing_track.album_id = a.id
                      AND NULLIF(TRIM(COALESCE(missing_track.title, '')), '') IS NULL
                )"
            }),
            "displayArtist" => Some(if is_tracks {
                "NULLIF(TRIM(COALESCE(t.display_artist, '')), '') IS NULL"
            } else {
                "EXISTS (
                    SELECT 1 FROM tracks missing_track
                    WHERE missing_track.album_id = a.id
                      AND NULLIF(TRIM(COALESCE(missing_track.display_artist, '')), '') IS NULL
                )"
            }),
            "trackNumber" => Some(if is_tracks {
                "(t.track_number IS NULL OR t.track_number <= 0)"
            } else {
                "EXISTS (
                    SELECT 1 FROM tracks missing_track
                    WHERE missing_track.album_id = a.id
                      AND (missing_track.track_number IS NULL OR missing_track.track_number <= 0)
                )"
            }),
            "discNumber" => Some(if is_tracks {
                "(t.disc_number IS NULL OR t.disc_number <= 0)"
            } else {
                "EXISTS (
                    SELECT 1 FROM tracks missing_track
                    WHERE missing_track.album_id = a.id
                      AND (missing_track.disc_number IS NULL OR missing_track.disc_number <= 0)
                )"
            }),
            "filename" => Some(if is_tracks {
                "NULLIF(TRIM(COALESCE(t.filename, '')), '') IS NULL"
            } else {
                "EXISTS (
                    SELECT 1 FROM tracks missing_track
                    WHERE missing_track.album_id = a.id
                      AND NULLIF(TRIM(COALESCE(missing_track.filename, '')), '') IS NULL
                )"
            }),
            "coverArt" => Some(
                "NOT EXISTS (
                    SELECT 1 FROM album_covers missing_cover
                    WHERE missing_cover.album_id = a.id
                )",
            ),
            "billboard" => Some("a.billboard_rank IS NULL"),
            "billboardDebut" => Some("a.billboard_debut_week_key IS NULL"),
            "billboardSingle" if is_tracks => Some("t.billboard_single_rank IS NULL"),
            "billboardSingleDebut" if is_tracks => Some("t.billboard_single_debut_date IS NULL"),
            "vgLista" => Some(if is_tracks {
                "t.vg_lista_rank IS NULL"
            } else {
                "a.vg_lista_rank IS NULL"
            }),
            "vgListaDebut" => Some(if is_tracks {
                "t.vg_lista_debut_week_key IS NULL"
            } else {
                "a.vg_lista_debut_week_key IS NULL"
            }),
            "officialUk" => Some(if is_tracks {
                "t.official_uk_rank IS NULL"
            } else {
                "a.official_uk_rank IS NULL"
            }),
            "officialUkDebut" => Some(if is_tracks {
                "t.official_uk_debut_week_key IS NULL"
            } else {
                "a.official_uk_debut_week_key IS NULL"
            }),
            "tiISkuddet" if is_tracks => Some("t.ti_i_skuddet_rank IS NULL"),
            "tiISkuddetDebut" if is_tracks => Some("t.ti_i_skuddet_debut_week_key IS NULL"),
            "norsktoppen" if is_tracks => Some("t.norsktoppen_rank IS NULL"),
            "norsktoppenDebut" if is_tracks => Some("t.norsktoppen_debut_week_key IS NULL"),
            "rating" => Some(if is_tracks {
                "t.normalized_rating IS NULL"
            } else {
                "a.effective_album_rating IS NULL"
            }),
            "time" => Some(if is_tracks {
                "t.time_seconds IS NULL"
            } else {
                "a.total_seconds <= 0"
            }),
            _ => None,
        };

        if let Some(condition) = condition {
            conditions.push(condition.to_string());
        }
    }
}

pub(super) fn order_clause(is_tracks: bool, sort: &BrowseSort) -> String {
    if sort.field == "random" {
        return "ORDER BY RANDOM()".to_string();
    }

    let direction = if sort.direction.eq_ignore_ascii_case("desc") {
        "DESC"
    } else {
        "ASC"
    };

    let field = if is_tracks {
        match sort.field.as_str() {
            "title" => "LOWER(COALESCE(t.title, ''))",
            "added" => "t.import_run_id",
            "releaseYear" => "t.release_year",
            "displayArtist" => "LOWER(COALESCE(t.display_artist, ''))",
            "artist" => "LOWER(COALESCE(t.album_artist_display, ''))",
            "year" => "t.year",
            "genre" => "LOWER(COALESCE(t.genre_normalized, ''))",
            "originCountry" => "LOWER(COALESCE(origin.country_name, origin.country_code, ''))",
            "billboardRank" => "a.billboard_rank",
            "billboardDebut" => "a.billboard_debut_week_key",
            "billboardSingleRank" => "t.billboard_single_rank",
            "billboardSingleDebut" => "t.billboard_single_debut_date",
            "vgListaRank" => "t.vg_lista_rank",
            "vgListaDebut" => "t.vg_lista_debut_week_key",
            "officialUkRank" => "t.official_uk_rank",
            "officialUkDebut" => "t.official_uk_debut_week_key",
            "tiISkuddetRank" => "t.ti_i_skuddet_rank",
            "tiISkuddetDebut" => "t.ti_i_skuddet_debut_week_key",
            "norsktoppenRank" => "t.norsktoppen_rank",
            "norsktoppenDebut" => "t.norsktoppen_debut_week_key",
            "trackRating" => "t.normalized_rating",
            "time" => "t.time_seconds",
            "albumRating" => "a.effective_album_rating",
            "ratingCompleteness" => "a.rating_completeness",
            "lovedTracks" => "(CASE WHEN t.love = 'L' THEN 1 ELSE 0 END)",
            "albumScore" => "a.album_score",
            "bitrate" => "q.bitrate_kbps",
            "trackNumber" => "t.disc_number",
            _ => "LOWER(COALESCE(t.album, ''))",
        }
    } else {
        match sort.field.as_str() {
            "artist" => "LOWER(COALESCE(a.album_artist_display, ''))",
            "added" => "a.import_run_id",
            "releaseYear" => "a.release_year",
            "year" => "a.year",
            "genre" => "LOWER(COALESCE(a.genre_normalized, ''))",
            "originCountry" => "LOWER(COALESCE(origin.country_name, origin.country_code, ''))",
            "billboardRank" => "a.billboard_rank",
            "billboardDebut" => "a.billboard_debut_week_key",
            "vgListaRank" => "a.vg_lista_rank",
            "vgListaDebut" => "a.vg_lista_debut_week_key",
            "officialUkRank" => "a.official_uk_rank",
            "officialUkDebut" => "a.official_uk_debut_week_key",
            "totalMinutes" => "a.total_seconds",
            "trackCount" => "a.total_tracks",
            "albumRating" => "a.effective_album_rating",
            "ratingCompleteness" => "a.rating_completeness",
            "lovedTracks" => "a.loved_tracks",
            "ae" => "a.ae_ratio",
            "tmoe" => "a.tmoe_seconds",
            "albumScore" => "a.album_score",
            "bitrate" => "aq.min_bitrate_kbps",
            _ => "LOWER(COALESCE(a.album, ''))",
        }
    };

    if is_tracks && sort.field == "trackNumber" {
        return format!(
            "ORDER BY {field} {direction}, t.track_number {direction}, t.title ASC, t.id ASC"
        );
    }

    if is_tracks {
        format!(
            "ORDER BY {field} {direction}, LOWER(COALESCE(t.album, '')) ASC, t.disc_number ASC, t.track_number ASC, t.id ASC"
        )
    } else {
        format!("ORDER BY {field} {direction}, LOWER(COALESCE(a.album_artist_display, '')) ASC, a.id ASC")
    }
}

pub(super) fn normalize_view(view: &str) -> String {
    if view.eq_ignore_ascii_case("tracks") {
        "tracks".to_string()
    } else {
        "albums".to_string()
    }
}

pub(super) fn normalize_chart_config(mut config: ChartConfig) -> ChartConfig {
    let ranking_metric = normalize_ranking_metric(&config.ranking_metric);
    let sort_field = normalize_chart_sort_field(config.sort_field.as_deref(), &ranking_metric);
    let sort_direction = if config.sort_direction.eq_ignore_ascii_case("asc") {
        "asc".to_string()
    } else {
        "desc".to_string()
    };
    let result_limit = config.result_limit.clamp(10, 500);
    let minimum_source = config
        .rating_completeness_min
        .or(config.rating_completeness_threshold)
        .unwrap_or(100.0);
    let maximum_source = config.rating_completeness_max.unwrap_or(100.0);
    let mut minimum = normalize_percentage(minimum_source) * 100.0;
    let mut maximum = normalize_percentage(maximum_source) * 100.0;
    if minimum > maximum {
        std::mem::swap(&mut minimum, &mut maximum);
    }
    let grid_cover_size = config.grid_cover_size.clamp(96, 224);
    let view_mode = match config.view_mode.as_str() {
        "compact" | "grid" => config.view_mode.clone(),
        "timeline" => "grid".to_string(),
        _ => "table".to_string(),
    };

    config.request.view = "albums".to_string();
    config.request.offset = 0;
    config.request.limit = result_limit;
    config.request.sort = BrowseSort {
        field: ranking_metric.clone(),
        direction: sort_direction.clone(),
    };
    config.request.filters.rating_completeness_min =
        if minimum <= 0.0 { None } else { Some(minimum) };
    config.request.filters.rating_completeness_max = if maximum >= 100.0 {
        None
    } else {
        Some(maximum)
    };
    config.ranking_metric = ranking_metric;
    config.sort_field = Some(sort_field);
    config.sort_direction = sort_direction;
    config.result_limit = result_limit;
    config.rating_completeness_min = Some(minimum);
    config.rating_completeness_max = Some(maximum);
    config.rating_completeness_threshold = None;
    config.view_mode = view_mode;
    config.grid_cover_size = grid_cover_size;
    config
}

pub(super) fn normalize_ranking_metric(metric: &str) -> String {
    match metric {
        "albumRating"
        | "ratingCompleteness"
        | "lovedTracks"
        | "ae"
        | "tmoe"
        | "totalMinutes"
        | "billboardRank"
        | "trackRating"
        | "billboardSingleRank"
        | "billboardSingleDebut"
        | "vgListaRank"
        | "vgListaDebut"
        | "tiISkuddetRank"
        | "tiISkuddetDebut" => metric.to_string(),
        _ => "albumScore".to_string(),
    }
}

pub(super) fn normalize_chart_sort_field(field: Option<&str>, fallback_metric: &str) -> String {
    match field.unwrap_or(fallback_metric) {
        "album"
        | "artist"
        | "year"
        | "genre"
        | "originCountry"
        | "albumRating"
        | "ratingCompleteness"
        | "lovedTracks"
        | "ae"
        | "tmoe"
        | "totalMinutes"
        | "albumScore"
        | "billboardRank"
        | "billboardDebut"
        | "trackRating"
        | "billboardSingleRank"
        | "billboardSingleDebut"
        | "vgListaRank"
        | "vgListaDebut"
        | "tiISkuddetRank"
        | "tiISkuddetDebut" => field.unwrap_or(fallback_metric).to_string(),
        _ => fallback_metric.to_string(),
    }
}

pub(super) fn normalize_percentage(value: f64) -> f64 {
    if value > 1.0 {
        (value / 100.0).clamp(0.0, 1.0)
    } else {
        value.clamp(0.0, 1.0)
    }
}

pub(super) fn track_rating_points(value: f64) -> i64 {
    if value <= 5.0 {
        (value * 20.0).round() as i64
    } else {
        value.round() as i64
    }
}

pub(super) fn fts_query(value: &str) -> Option<String> {
    let terms = value
        .split(|character: char| !character.is_alphanumeric())
        .map(str::trim)
        .filter(|term| !term.is_empty())
        .map(|term| format!("{}*", term.to_lowercase()))
        .collect::<Vec<_>>();

    if terms.is_empty() {
        None
    } else {
        Some(terms.join(" AND "))
    }
}

pub(super) fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

pub(super) fn normalize_country_code(value: &str) -> String {
    let normalized = value.trim().to_uppercase();
    if normalized == "UK" {
        "GB".to_string()
    } else {
        normalized
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::*;

    #[test]
    fn discovery_mixer_is_deterministic_and_excludes_seeds_and_duplicates() {
        let conn = seeded_connection();
        insert_discovery_mixer_fixtures(&conn);
        let request = |explore_percent| DiscoveryMixerRequest {
            seeds: vec![
                DiscoveryMixerSeedInput {
                    kind: "album".to_string(),
                    id: "mix-seed-a".to_string(),
                },
                DiscoveryMixerSeedInput {
                    kind: "album".to_string(),
                    id: "mix-seed-b".to_string(),
                },
            ],
            explore_percent: Some(explore_percent),
            limit: Some(8),
        };

        let familiar = discovery_mixer(&conn, &request(0)).expect("build familiar mixer");
        let repeated = discovery_mixer(&conn, &request(0)).expect("repeat familiar mixer");
        let explore = discovery_mixer(&conn, &request(100)).expect("build explore mixer");

        assert_eq!(familiar, repeated);
        assert_eq!(familiar.recommendations[0].artist, "Familiar Artist");
        assert_eq!(explore.recommendations[0].artist, "Explore Artist");
        assert!(familiar.lastfm_linked_count >= 4);
        assert!(familiar
            .recommendations
            .iter()
            .all(|item| !["Seed Artist A", "Seed Artist B"].contains(&item.artist.as_str())));
        assert!(familiar
            .recommendations
            .iter()
            .all(|item| !item.evidence.is_empty() && !item.seed_labels.is_empty()));
        let identities = familiar
            .recommendations
            .iter()
            .map(|item| {
                (
                    identity::artist_key(&item.artist),
                    identity::display_key(&item.album),
                )
            })
            .collect::<HashSet<_>>();
        assert_eq!(identities.len(), familiar.recommendations.len());
    }

    #[test]
    fn searches_albums_with_fts_and_filters() {
        let conn = seeded_connection();
        let mut request = BrowseRequest::default();
        request.search_text = "Synthpop".to_string();
        request.filters.year_from = Some(1987);
        request.filters.year_to = Some(1987);

        let response = search_library(&conn, request, 50).expect("search albums");

        assert_eq!(response.total, 1);
        assert_eq!(response.rows[0].album.as_deref(), Some("Actually"));
    }

    #[test]
    fn filters_and_reports_music_doctor_quality() {
        let conn = seeded_connection();
        conn.execute_batch(
            "
            INSERT INTO music_doctor_track_quality (
                file_key, file_path, filename, album_id, source_path,
                relative_path, extension, format, file_type, size_bytes,
                modified_ns, bitrate_kbps, duration_ms, doctor_updated_at,
                sync_run_id
            ) VALUES (
                'd:/music/pet shop boys/actually/02 what have i done.mp3',
                'D:\\Music\\Pet Shop Boys\\Actually',
                '02 What Have I Done.mp3', 'mb:test', 'D:\\Music',
                'Pet Shop Boys\\Actually\\02 What Have I Done.mp3',
                'mp3', 'MP3', 'Audio', 9000000, 1, 256, 260000,
                '2026-08-10T00:00:00Z', 1
            );
            INSERT INTO music_doctor_album_quality (
                album_id, matched_tracks, total_size_bytes, min_bitrate_kbps,
                avg_bitrate_kbps, max_bitrate_kbps, below_128_tracks,
                below_192_tracks, below_320_tracks, at_least_320_tracks,
                mixed_quality, formats, sync_run_id
            ) VALUES (
                'mb:test', 10, 90000000, 256, 307.2, 320, 0, 0, 2, 8,
                1, 'MP3', 1
            );
            ",
        )
        .expect("seed Music Doctor quality");

        let mut album_request = BrowseRequest::default();
        album_request.filters.bitrate_kbps_max = Some(300);
        album_request.filters.mixed_audio_quality = true;
        let albums = search_library(&conn, album_request, 50).expect("filter quality albums");
        assert_eq!(albums.total, 1);
        assert_eq!(albums.rows[0].min_bitrate_kbps, Some(256));
        assert_eq!(albums.rows[0].max_bitrate_kbps, Some(320));
        assert_eq!(albums.rows[0].mixed_audio_quality, Some(true));

        let mut track_request = BrowseRequest::default();
        track_request.view = "tracks".to_string();
        track_request.filters.bitrate_kbps_max = Some(319);
        let tracks = search_library(&conn, track_request, 50).expect("filter quality tracks");
        assert_eq!(tracks.total, 1);
        assert_eq!(tracks.rows[0].bitrate_kbps, Some(256));
        assert_eq!(tracks.rows[0].file_format.as_deref(), Some("MP3"));

        let mut tool_request = MusicToolIssueRequest::default();
        tool_request.tool_id = "audio-below-320-kbps".to_string();
        let tool = list_music_tool_issues(&conn, tool_request, 50, None)
            .expect("list Music Doctor quality issues");
        assert_eq!(tool.total, 1);
        assert_eq!(tool.rows[0].track_id, Some(1));
        assert!(tool.rows[0]
            .value
            .as_deref()
            .is_some_and(|value| value.contains("256 kbps")));
    }

    #[test]
    fn searches_for_random_unrated_albums() {
        let conn = seeded_connection();
        conn.execute(
            "
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score
            ) VALUES (
                'mb:unrated', 1, 'unrated', 'Unrated 1989', 'Test Artist',
                'Rock', 'rock', 'Test', 1989, 1989,
                10, 0, 0.0, 2400, 0, 0, 0.0, NULL, NULL
            )
            ",
            [],
        )
        .expect("insert unrated album");

        let mut request = BrowseRequest::default();
        request.filters.year_from = Some(1989);
        request.filters.year_to = Some(1989);
        request.filters.missing_fields = vec!["rating".to_string()];
        request.sort = BrowseSort {
            field: "random".to_string(),
            direction: "asc".to_string(),
        };
        request.limit = 10;

        let response = search_library(&conn, request, 50).expect("search unrated albums");

        assert_eq!(response.total, 1);
        assert_eq!(response.rows[0].album.as_deref(), Some("Unrated 1989"));
        assert_eq!(
            order_clause(
                false,
                &BrowseSort {
                    field: "random".to_string(),
                    direction: "desc".to_string(),
                }
            ),
            "ORDER BY RANDOM()"
        );
    }

    #[test]
    fn filters_extended_missing_metadata_cohorts() {
        let conn = seeded_connection();

        let mut tracks = BrowseRequest::default();
        tracks.view = "tracks".to_string();
        tracks.filters.missing_fields = vec!["trackNumber".to_string()];
        let track_response =
            search_library(&conn, tracks, 50).expect("search missing track numbers");
        assert_eq!(track_response.total, 1);

        let mut albums = BrowseRequest::default();
        albums.filters.missing_fields = vec!["coverArt".to_string()];
        let album_response = search_library(&conn, albums, 50).expect("search missing cover art");
        assert_eq!(album_response.total, 1);
        assert_eq!(album_response.rows[0].album.as_deref(), Some("Actually"));
    }

    #[test]
    fn filters_every_album_below_full_rating_completeness() {
        let conn = seeded_connection();
        conn.execute_batch(
            "
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score
            ) VALUES
                ('mb:partial', 1, 'partial', 'Partially Rated', 'Test Artist',
                 'Rock', 'rock', 'Test', 1990, 1990, 10, 4, 0.4, 2400, 0, 0, 0.0, 80, 100.0),
                ('mb:empty', 1, 'empty', 'Entirely Unrated', 'Test Artist',
                 'Rock', 'rock', 'Test', 1991, 1991, 10, 0, 0.0, 2400, 0, 0, 0.0, NULL, NULL);
            ",
        )
        .expect("insert incomplete albums");

        let mut request = BrowseRequest::default();
        request.filters.not_fully_rated = true;
        request.sort = BrowseSort {
            field: "album".to_string(),
            direction: "asc".to_string(),
        };
        let response = search_library(&conn, request, 50).expect("filter incomplete albums");

        assert_eq!(response.total, 2);
        let names = response
            .rows
            .iter()
            .filter_map(|row| row.album.as_deref())
            .collect::<Vec<_>>();
        assert_eq!(names, vec!["Entirely Unrated", "Partially Rated"]);
    }

    #[test]
    fn imports_billboard_singles_once_using_the_official_album_then_a_compilation_fallback() {
        let mut conn = seeded_connection();
        conn.execute_batch(
            "
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score
            ) VALUES (
                'mb:va-rock', 1, 'va-rock', 'Rock Star', 'Various Artists',
                'Soundtrack', 'soundtrack', 'Posthuman', 2001, 2001,
                1, 1, 1.0, 248, 1, 248, 1.0, 100, 157.4
            );
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score
            ) VALUES (
                'mb:slippery', 1, 'slippery', 'Slippery When Wet', 'Bon Jovi',
                'Rock', 'rock', 'Mercury', 1986, 1986,
                1, 1, 1.0, 248, 1, 248, 1.0, 100, 180.0
            );
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score
            ) VALUES (
                'mb:va-pop', 1, 'va-pop', 'Now That''s Pop', 'Various Artists',
                'Pop', 'pop', 'Arista', 1990, 1990,
                1, 0, 0.0, 260, 0, 0, 0.0, NULL, NULL
            );
            ",
        )
        .expect("insert candidate albums");
        conn.execute_batch(
            "
            INSERT INTO tracks (
                import_run_id, album_id, album_unique_id, display_artist,
                album_artist_display, album, title, canonical_genre, genre_normalized,
                publisher, love, normalized_rating, year, release_year, time_seconds,
                file_path, filename, row_hash
            ) VALUES (
                1, 'mb:va-rock', 'va-rock', 'Bon Jovi', 'Various Artists',
                'Rock Star', 'Livin'' On A Prayer', 'Soundtrack',
                'soundtrack', 'Posthuman', 'L', 100, 2001, 2001, 248,
                'D:\\Music\\Various Artists\\Rock Star', '06 Bon Jovi.mp3', 'hash-bon-jovi'
            );
            INSERT INTO tracks (
                import_run_id, album_id, album_unique_id, display_artist,
                album_artist_display, album, title, canonical_genre, genre_normalized,
                publisher, love, normalized_rating, year, release_year, time_seconds,
                file_path, filename, row_hash
            ) VALUES (
                1, 'mb:slippery', 'slippery', 'Bon Jovi', 'Bon Jovi',
                'Slippery When Wet', 'Livin'' On A Prayer', 'Rock',
                'rock', 'Mercury', 'L', 80, 1986, 1986, 248,
                'D:\\Music\\Bon Jovi\\Slippery When Wet', '03 Livin On A Prayer.mp3',
                'hash-bon-jovi-official'
            );
            INSERT INTO tracks (
                import_run_id, album_id, album_unique_id, display_artist,
                album_artist_display, album, title, canonical_genre, genre_normalized,
                publisher, love, normalized_rating, year, release_year, time_seconds,
                file_path, filename, row_hash
            ) VALUES (
                1, 'mb:va-pop', 'va-pop', 'Whitney Houston', 'Various Artists',
                'Now That''s Pop', 'So Emotional', 'Pop', 'pop', 'Arista',
                NULL, NULL, 1990, 1990, 260,
                'D:\\Music\\Various Artists\\Now That''s Pop', '05 So Emotional.mp3',
                'hash-whitney-compilation'
            );
            ",
        )
        .expect("insert candidate tracks");
        rebuild_search_indexes(&conn).expect("rebuild search indexes");

        let source_dir = std::env::temp_dir().join(format!(
            "music-library-billboard-singles-test-{}",
            Utc::now().timestamp_millis()
        ));
        fs::create_dir_all(&source_dir).expect("create billboard singles csv dir");
        fs::write(
            source_dir.join("1987.csv"),
            "Year,Yearly Rank,Artist,Featured,Album,Track,Label/Number,Date Entered\n1987,2,Bon Jovi,,Slippery When Wet - Mercury 830 264-2,Livin' On A Prayer,Mercury 884953-7,1986-12-20\n1987,7,Whitney Houston,,single,So Emotional,Arista,11/14/1987\n",
        )
        .expect("write 1987 singles chart");
        fs::write(
            source_dir.join("1988.csv"),
            "Year,Yearly Rank,Artist,Featured,Album,Track,Label/Number,Date Entered\n1988,1,Bon Jovi,,Slippery When Wet,Livin' On A Prayer,Mercury,1988-01-09\n",
        )
        .expect("write 1988 singles chart");

        let summary =
            import_billboard_singles(&mut conn, &source_dir).expect("import billboard singles");
        let (rank, year, debut_date, debut_week): (
            Option<i32>,
            Option<i32>,
            Option<String>,
            Option<i32>,
        ) = conn
            .query_row(
                "
                SELECT billboard_single_rank, billboard_single_year,
                       billboard_single_debut_date, billboard_single_debut_week
                FROM tracks
                WHERE display_artist = 'Bon Jovi' AND album = 'Slippery When Wet'
                ",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("load Bon Jovi singles rank");

        assert_eq!(summary.files_scanned, 2);
        assert_eq!(summary.chart_entries, 3);
        assert_eq!(summary.matched_tracks, 2);
        assert_eq!(summary.dated_tracks, 2);
        assert_eq!(summary.exact_dates, 3);
        assert_eq!(rank, Some(1));
        assert_eq!(year, Some(1988));
        assert_eq!(debut_date.as_deref(), Some("1986-12-20"));
        assert_eq!(debut_week, Some(51));
        let compilation_rank: Option<i32> = conn
            .query_row(
                "SELECT billboard_single_rank FROM tracks WHERE album = 'Rock Star'",
                [],
                |row| row.get(0),
            )
            .expect("load compilation duplicate rank");
        assert_eq!(compilation_rank, None);
        let fallback_rank: Option<i32> = conn
            .query_row(
                "SELECT billboard_single_rank FROM tracks WHERE title = 'So Emotional'",
                [],
                |row| row.get(0),
            )
            .expect("load compilation fallback rank");
        assert_eq!(fallback_rank, Some(7));
        let source_album: (String, Option<String>) = conn
            .query_row(
                "SELECT album, album_key FROM billboard_single_chart_entries
                 WHERE title = 'Livin'' On A Prayer' AND year = 1987",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("load source album metadata");
        assert_eq!(source_album.0, "Slippery When Wet - Mercury 830 264-2");
        assert_eq!(source_album.1.as_deref(), Some("slippery when wet"));

        let mut request = BrowseRequest::default();
        request.view = "tracks".to_string();
        request.filters.billboard_single_rank_min = Some(1);
        request.filters.billboard_single_rank_max = Some(1);
        request.sort = BrowseSort {
            field: "billboardSingleRank".to_string(),
            direction: "asc".to_string(),
        };
        let response = search_library(&conn, request, 50).expect("search singles");
        assert_eq!(response.total, 1);
        assert_eq!(response.rows[0].display_artist.as_deref(), Some("Bon Jovi"));
        assert_eq!(
            response.rows[0].album_artist_display.as_deref(),
            Some("Bon Jovi")
        );
        assert_eq!(response.rows[0].billboard_single_rank, Some(1));
        assert_eq!(response.rows[0].billboard_single_year, Some(1988));
        assert_eq!(
            response.rows[0].billboard_single_debut_date.as_deref(),
            Some("1986-12-20")
        );

        let mut debut_request = BrowseRequest::default();
        debut_request.view = "tracks".to_string();
        debut_request.filters.billboard_single_debut_date_from = Some("1986-12-20".to_string());
        debut_request.filters.billboard_single_debut_date_to = Some("1986-12-20".to_string());
        debut_request.sort = BrowseSort {
            field: "billboardSingleDebut".to_string(),
            direction: "asc".to_string(),
        };
        let debut_response =
            search_library(&conn, debut_request, 50).expect("search singles by chart debut date");
        assert_eq!(debut_response.total, 1);

        let timeline = track_debut_timeline(&conn, Some(1986)).expect("build track debut timeline");
        assert_eq!(timeline.selected_year, Some(1986));
        assert_eq!(timeline.dated_track_count, 2);
        assert_eq!(timeline.years[0].track_count, 1);
        assert_eq!(
            timeline.tracks[0].title.as_deref(),
            Some("Livin' On A Prayer")
        );

        let mut tool_request = MusicToolIssueRequest::default();
        tool_request.tool_id = "missing-chart-singles".to_string();
        let missing_response = list_music_tool_issues(&conn, tool_request, 50, None)
            .expect("list missing chart singles");
        assert_eq!(missing_response.total, 0);

        fs::remove_dir_all(source_dir).expect("remove billboard singles csv dir");
    }

    #[test]
    fn imports_billboard_singles_with_archive_aliases_and_reconciles_them() {
        for (source_artist, source_title, library_artist, library_title, should_match) in [
            (
                "'Til Tuesday",
                "Looking Over My Shoulder (Single Mix)",
                "'Til Tuesday",
                "Looking Over My Shoulder",
                true,
            ),
            (
                "'Til Tuesday",
                "Looking Over My Shoulder",
                "'Til Tuesday",
                "Looking Over My Shoulder (Single Mix)",
                true,
            ),
            (
                "Bon Jovi",
                "In And Out Of Love (Edit)",
                "Bon Jovi",
                "In And Out Of Love",
                true,
            ),
            (
                "Bon Jovi",
                "In And Out Of Love",
                "Bon Jovi",
                "In And Out Of Love (Edit)",
                true,
            ),
            (
                "Jesse Johnson's Revue",
                "I Want My Girl (Specially Remixed Version)",
                "Jesse Johnson's Revue",
                "I Want My Girl",
                true,
            ),
            (
                "Jesse Johnson's Revue",
                "I Want My Girl",
                "Jesse Johnson's Revue",
                "I Want My Girl (Specially Remixed Version)",
                true,
            ),
            (
                "Y&T",
                "Summertime Girls (Studio Version)",
                "Y&T",
                "Summertime Girls",
                true,
            ),
            (
                "Y&T",
                "Summertime Girls",
                "Y&T",
                "Summertime Girls (Studio Version)",
                true,
            ),
            (
                "Kim Carnes",
                "Crazy In The Night (Barking At Airplanes)",
                "Kim Carnes",
                "Crazy In The Night",
                true,
            ),
            (
                "Kim Carnes",
                "Crazy In The Night",
                "Kim Carnes",
                "Crazy In The Night (Barking At Airplanes)",
                true,
            ),
            (
                "Tina Turner",
                "We Don't Need Another Hero (Thunderdome)",
                "Tina Turner",
                "We Don't Need Another Hero",
                true,
            ),
            (
                "Tina Turner",
                "We Don't Need Another Hero",
                "Tina Turner",
                "We Don't Need Another Hero (Thunderdome)",
                true,
            ),
            (
                "Spin Doctors",
                "Two Princes (Album Version)",
                "Spin Doctors",
                "Two Princes",
                true,
            ),
            (
                "Jade [USA]",
                "Don't Walk Away (Album Walk)",
                "Jade",
                "Don't Walk Away",
                true,
            ),
            (
                "Peabo Bryson & Regina Belle",
                "A Whole New World (Aladdin's Theme)",
                "Peabo Bryson & Regina Belle",
                "A Whole New World",
                true,
            ),
            (
                "Aerosmith",
                "Livin' On The Edge (LP)",
                "Aerosmith",
                "Livin' On The Edge",
                true,
            ),
            (
                "Sting",
                "If I Ever Lose My Faith In You - LP Version",
                "Sting",
                "If I Ever Lose My Faith In You",
                true,
            ),
            (
                "Spin Doctors",
                "Two Princes",
                "Spin Doctors",
                "Two Princes (Album Version)",
                true,
            ),
            (
                "Spin Doctors",
                "Two Princes (Live)",
                "Spin Doctors",
                "Two Princes",
                true,
            ),
            (
                "Spin Doctors",
                "Two Princes (Remix)",
                "Spin Doctors",
                "Two Princes",
                true,
            ),
            (
                "Spin Doctors",
                "Two Princes (Album Version)",
                "Other Artist",
                "Two Princes",
                false,
            ),
            ("Artist", "Song (Part Two)", "Artist", "Song", true),
        ] {
            let mut conn = seeded_connection();
            conn.execute(
                "UPDATE tracks SET display_artist = ?1, title = ?2",
                params![library_artist, library_title],
            )
            .unwrap();
            rebuild_search_indexes(&conn).unwrap();
            let directory = tempfile::tempdir().unwrap();
            let mut csv = csv::Writer::from_path(directory.path().join("1993.csv")).unwrap();
            csv.write_record(["Yearly Rank", "Artist", "Featured", "Track", "Date Entered"])
                .unwrap();
            csv.write_record(["8", source_artist, "", source_title, "1993-01-02"])
                .unwrap();
            csv.flush().unwrap();
            drop(csv);
            let summary = import_billboard_singles(&mut conn, directory.path()).unwrap();
            assert_eq!(
                summary.matched_tracks,
                i64::from(should_match),
                "{source_artist}: {source_title}"
            );
            let printed: (String, String) = conn
                .query_row(
                    "SELECT artist, title FROM billboard_single_chart_entries",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .unwrap();
            assert_eq!(
                printed,
                (source_artist.to_string(), source_title.to_string())
            );
            // Exercise the persisted-key path used after a library refresh too.
            conn.execute("UPDATE tracks SET billboard_single_rank = NULL", [])
                .unwrap();
            reconcile_track_chart_matches(&conn).unwrap();
            let mut request = BrowseRequest::default();
            request.view = "tracks".to_string();
            request.filters.billboard_single_rank_min = Some(8);
            request.filters.billboard_single_rank_max = Some(8);
            let found = search_library(&conn, request, 50).unwrap();
            assert_eq!(found.total, if should_match { 1 } else { 0 });
            if should_match {
                assert_eq!(found.rows[0].billboard_single_rank, Some(8));
                assert_eq!(found.rows[0].title.as_deref(), Some(library_title));
            }
        }
    }

    #[test]
    fn searches_tracks_by_track_text() {
        let conn = seeded_connection();
        let mut request = BrowseRequest::default();
        request.view = "tracks".to_string();
        request.search_text = "Deserve".to_string();

        let response = search_library(&conn, request, 50).expect("search tracks");

        assert_eq!(response.total, 1);
        assert_eq!(
            response.rows[0].title.as_deref(),
            Some("What Have I Done to Deserve This?")
        );
        assert_eq!(response.rows[0].track_seconds, Some(260));
    }

    #[test]
    fn excludes_tracks_and_albums_by_display_artist_substring() {
        let conn = seeded_connection();
        insert_test_album(&conn, "mb:korn", "Korn", "Issues", 1999, 1);
        conn.execute_batch(
            "
            INSERT INTO tracks (
                import_run_id, album_id, album_unique_id, display_artist,
                album_artist_display, album, title, canonical_genre, genre_normalized,
                normalized_rating, year, time_seconds, row_hash
            ) VALUES
                (
                    1, 'mb:test', 'test', 'Dusty Springfield', 'Pet Shop Boys',
                    'Actually', 'What Have I Done to Deserve This? (Duet)', 'Synthpop',
                    'synthpop', 100, 1987, 260, 'hash-duet'
                ),
                (
                    1, 'mb:korn', 'korn', 'Korn', 'Korn', 'Issues', 'Falling Away from Me',
                    'Rock', 'rock', 100, 1999, 270, 'hash-korn'
                );
            ",
        )
        .expect("insert display-artist exclusion tracks");

        let exclusion = TextFilter {
            operator: "doesNotContain".to_string(),
            value: "SHOP".to_string(),
        };

        let mut track_request = BrowseRequest::default();
        track_request.view = "tracks".to_string();
        track_request.filters.display_artist = exclusion.clone();
        let track_response =
            search_library(&conn, track_request, 50).expect("exclude matching tracks");

        assert_eq!(track_response.total, 2);
        assert!(track_response
            .rows
            .iter()
            .all(|row| row.display_artist.as_deref() != Some("Pet Shop Boys")));

        let mut album_request = BrowseRequest::default();
        album_request.filters.display_artist = exclusion;
        let album_response =
            search_library(&conn, album_request, 50).expect("exclude matching albums");

        assert_eq!(album_response.total, 1);
        assert_eq!(album_response.rows[0].album.as_deref(), Some("Issues"));
    }

    #[test]
    fn filters_track_search_minutes_by_track_duration() {
        let conn = seeded_connection();
        conn.execute(
            "
            INSERT INTO tracks (
                import_run_id, album_id, album_unique_id, display_artist,
                album_artist_display, album, title, canonical_genre, genre_normalized,
                publisher, love, normalized_rating, year, release_year, time_seconds,
                file_path, filename, row_hash
            ) VALUES (
                1, 'mb:test', 'test', 'Pet Shop Boys', 'Pet Shop Boys',
                'Actually', 'Twenty Minute Jam', 'Synthpop',
                'synthpop', 'Parlophone', '', 80, 1987, 1987, 1200,
                'D:\\Music\\Pet Shop Boys\\Actually', '10 Twenty Minute Jam.mp3', 'hash-long'
            )
            ",
            [],
        )
        .expect("insert long track");
        let mut request = BrowseRequest::default();
        request.view = "tracks".to_string();
        request.filters.total_minutes_min = Some(20.0);

        let response = search_library(&conn, request, 50).expect("search long tracks");

        assert_eq!(response.total, 1);
        assert_eq!(response.rows[0].title.as_deref(), Some("Twenty Minute Jam"));
        assert_eq!(response.rows[0].track_seconds, Some(1200));
    }

    #[test]
    fn filters_track_search_loved_min_by_track_love_marker() {
        let conn = seeded_connection();
        conn.execute(
            "
            INSERT INTO tracks (
                import_run_id, album_id, album_unique_id, display_artist,
                album_artist_display, album, title, canonical_genre, genre_normalized,
                publisher, love, normalized_rating, year, release_year, time_seconds,
                file_path, filename, row_hash
            ) VALUES (
                1, 'mb:test', 'test', 'Pet Shop Boys', 'Pet Shop Boys',
                'Actually', 'Shopping', 'Synthpop',
                'synthpop', 'Parlophone', '', 80, 1987, 1987, 210,
                'D:\\Music\\Pet Shop Boys\\Actually', '03 Shopping.mp3', 'hash-shopping'
            )
            ",
            [],
        )
        .expect("insert unloved track");
        let mut request = BrowseRequest::default();
        request.view = "tracks".to_string();
        request.filters.loved_tracks_min = Some(1);

        let response = search_library(&conn, request, 50).expect("search loved tracks");

        assert_eq!(response.total, 1);
        assert_eq!(
            response.rows[0].title.as_deref(),
            Some("What Have I Done to Deserve This?")
        );
        assert_eq!(response.rows[0].love.as_deref(), Some("L"));
    }

    #[test]
    fn filters_album_search_by_rated_track_count() {
        let conn = seeded_connection();
        conn.execute(
            "
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score
            ) VALUES (
                'mb:partial', 1, 'partial', 'Partly Rated', 'Example Artist',
                'Synthpop', 'synthpop', 'Example', 1990, 1990,
                10, 4, 0.4, 2400, 0, 0, 0.0, 80, 0.0
            )
            ",
            [],
        )
        .expect("insert partly rated album");
        let mut request = BrowseRequest::default();
        request.filters.rated_tracks_min = Some(3);
        request.filters.rated_tracks_max = Some(5);

        let response = search_library(&conn, request, 50).expect("search by rated tracks");

        assert_eq!(response.total, 1);
        assert_eq!(response.rows[0].album.as_deref(), Some("Partly Rated"));
        assert_eq!(response.rows[0].rated_tracks, Some(4));
    }

    #[test]
    fn filters_by_exact_album_id_and_exports_track_time() {
        let conn = seeded_connection();
        let mut request = BrowseRequest::default();
        request.view = "tracks".to_string();
        request.filters.album_ids = vec!["mb:test".to_string()];
        request.sort = BrowseSort {
            field: "trackNumber".to_string(),
            direction: "asc".to_string(),
        };

        let response = search_library(&conn, request, 50).expect("search album tracks");
        let (headers, rows) = export_table("tracks", &response.rows, false, &[]);
        let time_index = headers
            .iter()
            .position(|header| *header == "Time")
            .expect("time column");

        assert_eq!(response.total, 1);
        assert_eq!(rows[0][time_index], "4.3");

        let mut missing_request = BrowseRequest::default();
        missing_request.filters.album_ids = vec!["mb:missing".to_string()];
        let missing_response =
            search_library(&conn, missing_request, 50).expect("search missing album");

        assert_eq!(missing_response.total, 0);
    }

    #[test]
    fn exports_optional_album_file_columns() {
        let conn = seeded_connection();
        let response = search_library(&conn, BrowseRequest::default(), 50).expect("search albums");
        let columns = vec![
            "filename".to_string(),
            "filePath".to_string(),
            "ids".to_string(),
        ];
        let (headers, rows) = export_table("albums", &response.rows, false, &columns);
        let album_id_index = headers
            .iter()
            .position(|header| *header == "Album ID")
            .expect("album id column");
        let filename_index = headers
            .iter()
            .position(|header| *header == "Filename")
            .expect("filename column");
        let path_index = headers
            .iter()
            .position(|header| *header == "File Path")
            .expect("file path column");

        assert_eq!(rows[0][album_id_index], "mb:test");
        assert_eq!(rows[0][filename_index], "02 What Have I Done.mp3");
        assert_eq!(rows[0][path_index], "D:\\Music\\Pet Shop Boys\\Actually");
    }

    #[test]
    fn expands_scores_genre_group_for_include_and_exclude_filters() {
        let conn = seeded_connection();
        conn.execute(
            "
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score
            ) VALUES (
                'mb:score', 1, 'score', 'The Action Score', 'Example Composer',
                'Action', 'action', 'Example', 2026, 2026,
                12, 12, 1.0, 3600, 1, 900, 0.25, 90, 225.0
            )
            ",
            [],
        )
        .expect("insert score album");

        let mut include_request = BrowseRequest::default();
        include_request.filters.genres = vec!["scores".to_string()];
        let include_response =
            search_library(&conn, include_request, 50).expect("search scores albums");

        assert_eq!(include_response.total, 1);
        assert_eq!(
            include_response.rows[0].canonical_genre.as_deref(),
            Some("Action")
        );

        let mut exclude_request = BrowseRequest::default();
        exclude_request.filters.excluded_genres = vec!["scores".to_string()];
        let exclude_response =
            search_library(&conn, exclude_request, 50).expect("exclude scores albums");

        assert_eq!(exclude_response.total, 1);
        assert_eq!(
            exclude_response.rows[0].canonical_genre.as_deref(),
            Some("Synthpop")
        );
    }

    #[test]
    fn loads_more_than_five_hundred_tracks_for_complete_search_requests() {
        let conn = seeded_connection();
        conn.execute_batch(
            "
            WITH RECURSIVE sequence(track_number) AS (
                SELECT 2
                UNION ALL
                SELECT track_number + 1
                FROM sequence
                WHERE track_number < 750
            )
            INSERT INTO tracks (
                import_run_id, album_id, album_unique_id, display_artist,
                album_artist_display, album, title, canonical_genre, genre_normalized,
                publisher, love, normalized_rating, year, release_year, time_seconds,
                file_path, filename, row_hash
            )
            SELECT
                1, 'mb:test', 'test', 'Pet Shop Boys', 'Pet Shop Boys',
                'Actually', 'Track ' || track_number, 'Synthpop', 'synthpop',
                'Parlophone', NULL, NULL, 1987, 1987, 180,
                'D:\\Music\\Pet Shop Boys\\Actually',
                printf('%03d Track.mp3', track_number),
                'hash-' || track_number
            FROM sequence;
            ",
        )
        .expect("insert long playlist scope");
        rebuild_search_indexes(&conn).expect("rebuild long playlist search index");
        let mut request = BrowseRequest::default();
        request.view = "tracks".to_string();
        request.limit = COMPLETE_SEARCH_RESULT_LIMIT;

        let response = search_library(&conn, request, COMPLETE_SEARCH_RESULT_LIMIT)
            .expect("load complete playlist scope");

        assert_eq!(response.total, 750);
        assert_eq!(response.rows.len(), 750);
    }

    #[test]
    fn filters_browse_rows_by_musicbrainz_origin_country() {
        let conn = seeded_connection();
        insert_test_album(&conn, "mb:korn", "Korn", "Issues", 1999, 12);
        conn.execute(
            "
            INSERT INTO musicbrainz_origin_countries (
                country_code, country_name, area_mbid, iso_source, created_at, updated_at
            ) VALUES (
                'GB', 'United Kingdom', 'area-gb', 'artist-country',
                '2026-07-07T00:00:00Z', '2026-07-07T00:00:00Z'
            )
            ",
            [],
        )
        .expect("insert country");
        conn.execute(
            "
            INSERT INTO musicbrainz_artist_origin_countries (
                local_artist_key, display_artist, mbid, country_code, country_name,
                raw_area_mbid, raw_area_name, raw_area_type, derived_from, confidence,
                review_state, source, fetched_at, created_at, updated_at
            ) VALUES (
                'pet shop boys', 'Pet Shop Boys',
                '012151a8-0f9a-44c9-997f-ebd68b5389f9', 'GB',
                'United Kingdom', 'area-england', 'England', 'Subdivision',
                'artist-country', 1.0, 'imported', 'musicbrainz-live',
                '2026-07-07T00:00:00Z', '2026-07-07T00:00:00Z',
                '2026-07-07T00:00:00Z'
            )
            ",
            [],
        )
        .expect("insert artist origin");

        let mut country_request = BrowseRequest::default();
        country_request.filters.origin_country_codes = vec!["gb".to_string()];
        let country_response =
            search_library(&conn, country_request, 50).expect("filter by origin country");

        assert_eq!(country_response.total, 1);
        assert_eq!(
            country_response.rows[0].origin_country_name.as_deref(),
            Some("United Kingdom")
        );
        assert_eq!(
            country_response.rows[0].origin_country_raw_area.as_deref(),
            Some("England")
        );

        let mut missing_request = BrowseRequest::default();
        missing_request.filters.missing_origin_country = true;
        let missing_response =
            search_library(&conn, missing_request, 50).expect("filter missing origin country");

        assert_eq!(missing_response.total, 1);
        assert_eq!(
            missing_response.rows[0].album_artist_display.as_deref(),
            Some("Korn")
        );

        let mut excluded_request = BrowseRequest::default();
        excluded_request.filters.excluded_origin_country_codes = vec!["GB".to_string()];
        let excluded_response =
            search_library(&conn, excluded_request, 50).expect("exclude origin country");

        assert_eq!(excluded_response.total, 1);
        assert_eq!(
            excluded_response.rows[0].album_artist_display.as_deref(),
            Some("Korn")
        );
    }

    #[test]
    fn filters_browse_rows_by_musicbrainz_artist_info() {
        let conn = seeded_connection();
        insert_test_album(&conn, "mb:bowie", "David Bowie", "Low", 1977, 11);
        insert_test_album(&conn, "mb:madonna", "Madonna", "True Blue", 1986, 9);
        insert_test_album(
            &conn,
            "mb:chordettes",
            "The Chordettes",
            "The Chordettes",
            1957,
            12,
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
            "David Bowie",
            "Person",
            Some("Male"),
            Some(1947),
            Some(2016),
            true,
        );
        insert_test_artist_info(
            &conn,
            "Madonna",
            "Person",
            Some("Female"),
            Some(1958),
            None,
            false,
        );
        insert_test_artist_info(
            &conn,
            "The Chordettes",
            "Group",
            None,
            Some(1946),
            Some(1963),
            true,
        );

        let mut person_request = BrowseRequest::default();
        person_request.filters.artist_type = "Person".to_string();
        let person_response = search_library(&conn, person_request, 50).expect("filter people");
        assert_eq!(person_response.total, 2);

        let mut born_request = BrowseRequest::default();
        born_request.filters.artist_born_year_from = Some(1954);
        born_request.filters.artist_born_year_to = Some(1958);
        let born_response = search_library(&conn, born_request, 50).expect("filter born range");
        assert_eq!(born_response.total, 1);
        assert_eq!(
            born_response.rows[0].album_artist_display.as_deref(),
            Some("Madonna")
        );

        let mut gender_request = BrowseRequest::default();
        gender_request.filters.artist_gender = "Female".to_string();
        let gender_response = search_library(&conn, gender_request, 50).expect("filter gender");
        assert_eq!(gender_response.total, 1);
        assert_eq!(
            gender_response.rows[0].album_artist_display.as_deref(),
            Some("Madonna")
        );

        let mut died_request = BrowseRequest::default();
        died_request.filters.artist_died = true;
        died_request.filters.artist_died_year_from = Some(2010);
        died_request.filters.artist_died_year_to = Some(2020);
        let died_response = search_library(&conn, died_request, 50).expect("filter died range");
        assert_eq!(died_response.total, 1);
        assert_eq!(
            died_response.rows[0].album_artist_display.as_deref(),
            Some("David Bowie")
        );

        let mut founded_request = BrowseRequest::default();
        founded_request.filters.artist_founded_year_from = Some(1980);
        founded_request.filters.artist_founded_year_to = Some(1985);
        let founded_response =
            search_library(&conn, founded_request, 50).expect("filter founded range");
        assert_eq!(founded_response.total, 1);
        assert_eq!(
            founded_response.rows[0].album_artist_display.as_deref(),
            Some("Pet Shop Boys")
        );

        let mut dissolved_request = BrowseRequest::default();
        dissolved_request.filters.artist_dissolved = true;
        dissolved_request.filters.artist_dissolved_year_from = Some(1960);
        dissolved_request.filters.artist_dissolved_year_to = Some(1970);
        let dissolved_response =
            search_library(&conn, dissolved_request, 50).expect("filter dissolved range");
        assert_eq!(dissolved_response.total, 1);
        assert_eq!(
            dissolved_response.rows[0].album_artist_display.as_deref(),
            Some("The Chordettes")
        );
    }

    #[test]
    fn browse_filter_defaults_deserialize_without_origin_country_fields() {
        let filters: BrowseFilters =
            serde_json::from_value(serde_json::json!({})).expect("deserialize filters");

        assert!(filters.origin_country_codes.is_empty());
        assert!(filters.excluded_origin_country_codes.is_empty());
        assert!(!filters.missing_origin_country);
        assert!(!filters.not_fully_rated);
        assert!(filters.artist_type.is_empty());
        assert!(filters.artist_gender.is_empty());
        assert_eq!(filters.artist_born_year_from, None);
        assert_eq!(filters.artist_born_year_to, None);
        assert!(!filters.artist_died);
        assert_eq!(filters.artist_died_year_from, None);
        assert_eq!(filters.artist_died_year_to, None);
        assert_eq!(filters.artist_founded_year_from, None);
        assert_eq!(filters.artist_founded_year_to, None);
        assert!(!filters.artist_dissolved);
        assert_eq!(filters.artist_dissolved_year_from, None);
        assert_eq!(filters.artist_dissolved_year_to, None);
    }

    #[test]
    fn sorts_charts_by_ae_and_tmoe() {
        let ae_sort = BrowseSort {
            field: "ae".to_string(),
            direction: "desc".to_string(),
        };
        let tmoe_sort = BrowseSort {
            field: "tmoe".to_string(),
            direction: "desc".to_string(),
        };

        assert!(order_clause(false, &ae_sort).contains("a.ae_ratio DESC"));
        assert!(order_clause(false, &tmoe_sort).contains("a.tmoe_seconds DESC"));
    }

    #[test]
    fn writes_xlsx_exports() {
        let conn = seeded_connection();
        let mut request = BrowseRequest::default();
        request.sort = BrowseSort {
            field: "albumScore".to_string(),
            direction: "desc".to_string(),
        };
        let response = search_library(&conn, request, 50).expect("search albums");
        let path = std::env::temp_dir().join(format!(
            "music-library-export-test-{}.xlsx",
            Utc::now().timestamp_millis()
        ));

        write_export_file(&path, "xlsx", "albums", &response.rows, true, &[]).expect("write xlsx");

        let metadata = fs::metadata(&path).expect("xlsx metadata");
        assert!(metadata.len() > 0);
        fs::remove_file(path).expect("remove xlsx");
    }
}
