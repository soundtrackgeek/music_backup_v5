use super::*;

#[cfg(not(test))]
pub(super) fn ensure_music_tool_data_for_request(
    app: &AppHandle,
    conn: &mut Connection,
    request: &MusicToolIssueRequest,
) -> Result<()> {
    match request.tool_id.as_str() {
        "missing-chart-albums" => {
            let settings = settings_for_connection(conn)?;

            if count_rows(conn, "billboard_chart_entries")? == 0 {
                if let Ok(source_path) =
                    resolve_billboard_source_path(&settings.billboard_source_path)
                {
                    emit_music_tool_progress(
                        Some(app),
                        &request.tool_id,
                        &request.request_id,
                        "loading",
                        8,
                        "Preparing Billboard album chart rows.",
                    );
                    import_billboard_charts(conn, &source_path)
                        .context("Could not prepare Billboard album chart data")?;
                }
            }

            if count_rows(conn, "official_uk_album_chart_entries")? == 0 {
                if let Ok(source_path) =
                    resolve_official_uk_source_path(&settings.official_uk_album_source_path)
                {
                    emit_music_tool_progress(
                        Some(app),
                        &request.tool_id,
                        &request.request_id,
                        "loading",
                        12,
                        "Preparing Official UK album chart rows.",
                    );
                    import_official_uk_albums(conn, &source_path)
                        .context("Could not prepare Official UK album chart data")?;
                }
            }

            if count_rows(conn, "vg_lista_album_chart_entries")? == 0 {
                if let Ok(source_path) =
                    resolve_vg_lista_source_path(&settings.vg_lista_album_source_path)
                {
                    emit_music_tool_progress(
                        Some(app),
                        &request.tool_id,
                        &request.request_id,
                        "loading",
                        16,
                        "Preparing VG Lista album chart rows.",
                    );
                    import_vg_lista_albums(conn, &source_path)
                        .context("Could not prepare VG Lista album chart data")?;
                }
            }
        }
        "missing-chart-singles" => {
            let settings = settings_for_connection(conn)?;

            if count_rows(conn, "billboard_single_chart_entries")? == 0 {
                if let Ok(source_path) =
                    resolve_billboard_source_path(&settings.billboard_singles_source_path)
                {
                    emit_music_tool_progress(
                        Some(app),
                        &request.tool_id,
                        &request.request_id,
                        "loading",
                        7,
                        "Preparing Billboard singles chart rows.",
                    );
                    import_billboard_singles(conn, &source_path)
                        .context("Could not prepare Billboard singles chart data")?;
                }
            }

            if count_rows(conn, "official_uk_single_chart_entries")? == 0 {
                if let Ok(source_path) =
                    resolve_official_uk_source_path(&settings.official_uk_singles_source_path)
                {
                    emit_music_tool_progress(
                        Some(app),
                        &request.tool_id,
                        &request.request_id,
                        "loading",
                        10,
                        "Preparing Official UK singles chart rows.",
                    );
                    import_official_uk_singles(conn, &source_path)
                        .context("Could not prepare Official UK singles chart data")?;
                }
            }

            if count_rows(conn, "vg_lista_single_chart_entries")? == 0 {
                if let Ok(source_path) =
                    resolve_vg_lista_source_path(&settings.vg_lista_singles_source_path)
                {
                    emit_music_tool_progress(
                        Some(app),
                        &request.tool_id,
                        &request.request_id,
                        "loading",
                        13,
                        "Preparing VG Lista singles chart rows.",
                    );
                    import_vg_lista_singles(conn, &source_path)
                        .context("Could not prepare VG Lista singles chart data")?;
                }
            }

            if count_rows(conn, "ti_i_skuddet_chart_entries")? == 0 {
                if let Ok(source_path) =
                    resolve_ti_i_skuddet_source_path(&settings.ti_i_skuddet_source_path)
                {
                    emit_music_tool_progress(
                        Some(app),
                        &request.tool_id,
                        &request.request_id,
                        "loading",
                        16,
                        "Preparing Ti i Skuddet chart rows.",
                    );
                    import_ti_i_skuddet_singles(conn, &source_path)
                        .context("Could not prepare Ti i Skuddet chart data")?;
                }
            }

            if count_rows(conn, "norsktoppen_chart_entries")? == 0 {
                if let Ok(source_path) =
                    resolve_norsktoppen_source_path(&settings.norsktoppen_source_path)
                {
                    emit_music_tool_progress(
                        Some(app),
                        &request.tool_id,
                        &request.request_id,
                        "loading",
                        19,
                        "Preparing Norsktoppen chart rows.",
                    );
                    import_norsktoppen_singles(conn, &source_path)
                        .context("Could not prepare Norsktoppen chart data")?;
                }
            }
        }
        "artists-without-musicbrainz-data"
        | "high-confidence-missing-musicbrainz-albums"
        | "albums-not-on-musicbrainz-official-list"
        | "owned-musicbrainz-special-releases" => {
            let preparation_cap = if matches!(
                request.tool_id.as_str(),
                "albums-not-on-musicbrainz-official-list" | "owned-musicbrainz-special-releases"
            ) {
                88
            } else {
                50
            };
            emit_music_tool_progress(
                Some(app),
                &request.tool_id,
                &request.request_id,
                "loading",
                15,
                "Preparing MusicBrainz collection comparison.",
            );
            let settings = settings_for_connection(conn)?;
            prepare_missing_musicbrainz_artist_tool_with_progress(
                conn,
                &settings.musicbrainz_cache_path,
                Some(app),
                &request.tool_id,
                &request.request_id,
                preparation_cap,
            )
            .context("Could not prepare MusicBrainz collection coverage data")?;
        }
        _ => {}
    }

    Ok(())
}

#[derive(Debug)]
pub(super) struct MissingMusicBrainzLocalArtist {
    pub(super) artist_key: String,
    pub(super) display_artist: String,
    pub(super) album_count: i64,
    pub(super) track_count: i64,
    pub(super) first_year: Option<i32>,
    pub(super) last_year: Option<i32>,
    pub(super) sample_album: Option<String>,
    pub(super) top_genre: Option<String>,
}

#[derive(Debug)]
pub(super) struct MissingMusicBrainzLocalAlbum {
    pub(super) artist_key: String,
    pub(super) album_id: String,
    pub(super) title: String,
    pub(super) year: Option<i32>,
}

#[derive(Debug)]
pub(super) struct MissingMusicBrainzCacheArtist {
    pub(super) name: String,
    pub(super) mbid: String,
    pub(super) cached_name_count: i64,
    pub(super) release_group_count: i64,
}

#[derive(Debug)]
pub(super) struct MissingMusicBrainzReleaseGroup {
    pub(super) artist_mbid: String,
    pub(super) release_mbid: String,
    pub(super) title: String,
    pub(super) year: Option<i32>,
    pub(super) primary_type: String,
    pub(super) secondary_types: String,
    pub(super) track_count: Option<i64>,
    pub(super) source: String,
}

#[cfg(test)]
pub(super) fn prepare_missing_musicbrainz_artist_tool(
    conn: &mut Connection,
    cache_path: &str,
) -> Result<()> {
    prepare_missing_musicbrainz_artist_tool_with_progress(conn, cache_path, None, "", "", 50)
}

pub(super) const MUSICBRAINZ_PREPARATION_START: u8 = 15;
pub(super) const MUSICBRAINZ_PREPARATION_STAGE_COUNT: u8 = 7;

pub(super) fn musicbrainz_preparation_percent(cap: u8, stage: u8) -> u8 {
    let cap = cap.clamp(MUSICBRAINZ_PREPARATION_START, 99);
    let stage = stage.min(MUSICBRAINZ_PREPARATION_STAGE_COUNT);
    let span = u16::from(cap - MUSICBRAINZ_PREPARATION_START);
    MUSICBRAINZ_PREPARATION_START
        + ((span * u16::from(stage)) / u16::from(MUSICBRAINZ_PREPARATION_STAGE_COUNT)) as u8
}

pub(super) fn emit_musicbrainz_preparation_stage(
    app: Option<ProgressApp<'_>>,
    tool_id: &str,
    request_id: &str,
    cap: u8,
    stage: u8,
    message: &str,
) {
    emit_music_tool_progress(
        app,
        tool_id,
        request_id,
        "loading",
        musicbrainz_preparation_percent(cap, stage),
        message,
    );
}

pub(super) fn prepare_missing_musicbrainz_artist_tool_with_progress(
    conn: &mut Connection,
    cache_path: &str,
    progress_app: Option<ProgressApp<'_>>,
    tool_id: &str,
    request_id: &str,
    progress_cap: u8,
) -> Result<()> {
    let transaction = conn
        .transaction()
        .context("Could not start MusicBrainz comparison preparation")?;
    transaction
        .execute_batch(
            "
        DROP TABLE IF EXISTS temp.musicbrainz_tool_local_artists;
        DROP TABLE IF EXISTS temp.musicbrainz_tool_local_albums;
        DROP TABLE IF EXISTS temp.musicbrainz_tool_artist_cache;
        DROP TABLE IF EXISTS temp.musicbrainz_tool_release_groups;
        DROP TABLE IF EXISTS temp.musicbrainz_tool_release_statuses;

        CREATE TEMP TABLE musicbrainz_tool_local_artists (
            artist_key TEXT PRIMARY KEY,
            display_artist TEXT NOT NULL,
            musicbrainz_name_key TEXT NOT NULL,
            album_count INTEGER NOT NULL,
            track_count INTEGER NOT NULL,
            first_year INTEGER,
            last_year INTEGER,
            sample_album TEXT,
            top_genre TEXT
        );

        CREATE TEMP TABLE musicbrainz_tool_local_albums (
            artist_key TEXT NOT NULL,
            album_id TEXT NOT NULL,
            title TEXT NOT NULL,
            title_key TEXT NOT NULL,
            year INTEGER
        );

        CREATE TEMP TABLE musicbrainz_tool_artist_cache (
            name TEXT NOT NULL,
            mbid TEXT NOT NULL,
            local_name_key TEXT NOT NULL,
            musicbrainz_name_key TEXT NOT NULL,
            cached_name_count INTEGER NOT NULL,
            release_group_count INTEGER NOT NULL
        );

        CREATE TEMP TABLE musicbrainz_tool_release_groups (
            artist_mbid TEXT NOT NULL,
            release_mbid TEXT NOT NULL,
            title TEXT NOT NULL,
            title_key TEXT NOT NULL,
            year INTEGER,
            primary_type TEXT NOT NULL,
            secondary_types_key TEXT NOT NULL,
            release_type TEXT NOT NULL,
            track_count INTEGER,
            source TEXT NOT NULL
        );

        CREATE TEMP TABLE musicbrainz_tool_release_statuses (
            artist_mbid TEXT NOT NULL,
            release_mbid TEXT NOT NULL,
            has_official_release INTEGER NOT NULL,
            PRIMARY KEY (artist_mbid, release_mbid)
        ) WITHOUT ROWID;

        INSERT OR REPLACE INTO musicbrainz_tool_release_statuses (
            artist_mbid, release_mbid, has_official_release
        )
        SELECT LOWER(TRIM(artist_mbid)), release_mbid, has_official_release
        FROM musicbrainz_release_status_cache
        WHERE NULLIF(TRIM(artist_mbid), '') IS NOT NULL
          AND NULLIF(TRIM(release_mbid), '') IS NOT NULL;

        CREATE INDEX temp.idx_musicbrainz_tool_local_albums_artist_title
            ON musicbrainz_tool_local_albums(artist_key, title_key);
        CREATE INDEX temp.idx_musicbrainz_tool_artist_cache_local
            ON musicbrainz_tool_artist_cache(local_name_key);
        CREATE INDEX temp.idx_musicbrainz_tool_artist_cache_musicbrainz
            ON musicbrainz_tool_artist_cache(musicbrainz_name_key);
        CREATE INDEX temp.idx_musicbrainz_tool_artist_cache_mbid
            ON musicbrainz_tool_artist_cache(mbid);
        CREATE INDEX temp.idx_musicbrainz_tool_release_groups_mbid
            ON musicbrainz_tool_release_groups(artist_mbid);
        CREATE INDEX temp.idx_musicbrainz_tool_release_groups_title
            ON musicbrainz_tool_release_groups(artist_mbid, title_key);
        CREATE INDEX temp.idx_musicbrainz_tool_release_groups_type
            ON musicbrainz_tool_release_groups(artist_mbid, primary_type, secondary_types_key);
        ",
        )
        .context("Could not create MusicBrainz artist tool temp tables")?;

    emit_musicbrainz_preparation_stage(
        progress_app,
        tool_id,
        request_id,
        progress_cap,
        1,
        "Scanning local artists and calculating top genres.",
    );
    let local_artists = musicbrainz_tool_local_artists(&transaction)?;
    {
        let mut stmt = transaction
            .prepare(
                "
                INSERT INTO musicbrainz_tool_local_artists (
                    artist_key, display_artist, musicbrainz_name_key, album_count,
                    track_count, first_year, last_year, sample_album, top_genre
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                ",
            )
            .context("Could not prepare local MusicBrainz artist temp insert")?;
        for artist in local_artists {
            let musicbrainz_name_key = crate::identity::loose_key(&artist.display_artist);
            stmt.execute(params![
                artist.artist_key,
                artist.display_artist,
                musicbrainz_name_key,
                artist.album_count,
                artist.track_count,
                artist.first_year,
                artist.last_year,
                artist.sample_album,
                artist.top_genre,
            ])
            .context("Could not insert local MusicBrainz artist temp row")?;
        }
    }

    emit_musicbrainz_preparation_stage(
        progress_app,
        tool_id,
        request_id,
        progress_cap,
        2,
        "Indexing local album identities.",
    );
    let local_albums = musicbrainz_tool_local_albums(&transaction)?;
    {
        let mut stmt = transaction
            .prepare(
                "
                INSERT INTO musicbrainz_tool_local_albums (
                    artist_key, album_id, title, title_key, year
                ) VALUES (?1, ?2, ?3, ?4, ?5)
                ",
            )
            .context("Could not prepare local MusicBrainz album temp insert")?;
        for album in local_albums {
            let title_key = crate::identity::loose_key(&album.title);
            stmt.execute(params![
                album.artist_key,
                album.album_id,
                album.title,
                title_key,
                album.year,
            ])
            .context("Could not insert local MusicBrainz album temp row")?;
        }
    }

    emit_musicbrainz_preparation_stage(
        progress_app,
        tool_id,
        request_id,
        progress_cap,
        3,
        "Reading the MusicBrainz artist cache.",
    );
    let cache_artists = musicbrainz_tool_cache_artists(cache_path)?;
    {
        let mut stmt = transaction
            .prepare(
                "
                INSERT INTO musicbrainz_tool_artist_cache (
                    name, mbid, local_name_key, musicbrainz_name_key,
                    cached_name_count, release_group_count
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                ",
            )
            .context("Could not prepare MusicBrainz cache artist temp insert")?;
        for artist in cache_artists {
            let local_name_key = identity::artist_key(&artist.name);
            let musicbrainz_name_key = crate::identity::loose_key(&artist.name);
            let normalized_mbid = artist.mbid.to_lowercase();
            stmt.execute(params![
                artist.name,
                normalized_mbid,
                local_name_key,
                musicbrainz_name_key,
                artist.cached_name_count,
                artist.release_group_count,
            ])
            .context("Could not insert MusicBrainz cache artist temp row")?;
        }
    }

    emit_musicbrainz_preparation_stage(
        progress_app,
        tool_id,
        request_id,
        progress_cap,
        4,
        "Resolving cached MusicBrainz artist identities.",
    );
    let matched_mbids = musicbrainz_tool_matched_mbids(&transaction)?;
    emit_musicbrainz_preparation_stage(
        progress_app,
        tool_id,
        request_id,
        progress_cap,
        5,
        "Loading cached MusicBrainz release groups.",
    );
    let release_groups = musicbrainz_tool_cache_release_groups(cache_path, &matched_mbids)?;
    insert_musicbrainz_tool_release_groups(&transaction, release_groups)?;
    emit_musicbrainz_preparation_stage(
        progress_app,
        tool_id,
        request_id,
        progress_cap,
        6,
        "Merging refreshed MusicBrainz release groups.",
    );
    let overlay_release_groups =
        musicbrainz_tool_overlay_release_groups(&transaction, &matched_mbids)?;
    insert_musicbrainz_tool_release_groups(&transaction, overlay_release_groups)?;

    transaction
        .commit()
        .context("Could not finish MusicBrainz comparison preparation")?;

    emit_musicbrainz_preparation_stage(
        progress_app,
        tool_id,
        request_id,
        progress_cap,
        7,
        "MusicBrainz collection comparison prepared.",
    );

    Ok(())
}

pub(super) fn musicbrainz_tool_local_artists(
    conn: &Connection,
) -> Result<Vec<MissingMusicBrainzLocalArtist>> {
    let album_artist_key_sql = artist_key_sql("album_artist_display");
    let sql = format!(
        "
        WITH album_artists AS (
            SELECT
                {album_artist_key_sql} AS artist_key,
                NULLIF(TRIM(album_artist_display), '') AS display_artist,
                id,
                NULLIF(TRIM(album), '') AS album,
                year,
                total_tracks,
                canonical_genre,
                genre_normalized
            FROM albums
            WHERE NULLIF(TRIM(COALESCE(album_artist_display, '')), '') IS NOT NULL
        ),
        ranked_names AS (
            SELECT
                artist_key,
                display_artist,
                ROW_NUMBER() OVER (
                    PARTITION BY artist_key
                    ORDER BY COUNT(*) DESC, LOWER(display_artist) ASC
                ) AS name_rank
            FROM album_artists
            WHERE display_artist IS NOT NULL
            GROUP BY artist_key, display_artist
        ),
        genre_counts AS (
            SELECT
                artist_key,
                COALESCE(MIN(NULLIF(TRIM(canonical_genre), '')), 'Unknown') AS genre,
                COUNT(*) AS album_count
            FROM album_artists
            GROUP BY
                artist_key,
                COALESCE(NULLIF(TRIM(LOWER(genre_normalized)), ''), 'unknown')
        ),
        ranked_genres AS (
            SELECT
                artist_key,
                genre,
                ROW_NUMBER() OVER (
                    PARTITION BY artist_key
                    ORDER BY album_count DESC, LOWER(genre) ASC
                ) AS genre_rank
            FROM genre_counts
        )
        SELECT
            aa.artist_key,
            rn.display_artist,
            COUNT(DISTINCT aa.id) AS album_count,
            SUM(COALESCE(aa.total_tracks, 0)) AS track_count,
            MIN(aa.year) AS first_year,
            MAX(aa.year) AS last_year,
            MIN(aa.album) AS sample_album,
            rg.genre AS top_genre
        FROM album_artists aa
        JOIN ranked_names rn
          ON rn.artist_key = aa.artist_key
         AND rn.name_rank = 1
        LEFT JOIN ranked_genres rg
          ON rg.artist_key = aa.artist_key
         AND rg.genre_rank = 1
        GROUP BY aa.artist_key, rn.display_artist, rg.genre
        "
    );
    let mut stmt = conn
        .prepare(&sql)
        .context("Could not prepare local MusicBrainz artist coverage query")?;
    let rows = stmt
        .query_map([], |row| {
            Ok(MissingMusicBrainzLocalArtist {
                artist_key: row.get(0)?,
                display_artist: row.get(1)?,
                album_count: row.get(2)?,
                track_count: row.get(3)?,
                first_year: row.get(4)?,
                last_year: row.get(5)?,
                sample_album: row.get(6)?,
                top_genre: row.get(7)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load local MusicBrainz artist coverage rows")?;
    Ok(rows)
}

pub(super) fn musicbrainz_tool_local_albums(
    conn: &Connection,
) -> Result<Vec<MissingMusicBrainzLocalAlbum>> {
    let artist_key_sql = artist_key_sql("album_artist_display");
    let sql = format!(
        "
        SELECT
            {artist_key_sql} AS artist_key,
            id,
            COALESCE(NULLIF(TRIM(album), ''), 'Untitled') AS title,
            year
        FROM albums
        WHERE NULLIF(TRIM(COALESCE(album_artist_display, '')), '') IS NOT NULL
          AND NULLIF(TRIM(COALESCE(album, '')), '') IS NOT NULL
        "
    );
    let mut stmt = conn
        .prepare(&sql)
        .context("Could not prepare local MusicBrainz album coverage query")?;
    let rows = stmt
        .query_map([], |row| {
            Ok(MissingMusicBrainzLocalAlbum {
                artist_key: row.get(0)?,
                album_id: row.get(1)?,
                title: row.get(2)?,
                year: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load local MusicBrainz album coverage rows")?;
    Ok(rows)
}

pub(super) fn musicbrainz_tool_cache_artists(
    cache_path: &str,
) -> Result<Vec<MissingMusicBrainzCacheArtist>> {
    let resolved_path = resolve_musicbrainz_cache_path(cache_path)?;
    let metadata = match fs::metadata(&resolved_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(error).with_context(|| {
                format!(
                    "Could not inspect MusicBrainz cache at {}",
                    resolved_path.display()
                )
            });
        }
    };
    if !metadata.is_file() {
        return Ok(Vec::new());
    }

    let cache_conn = Connection::open_with_flags(
        &resolved_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .with_context(|| {
        format!(
            "Could not open MusicBrainz cache read-only at {}",
            resolved_path.display()
        )
    })?;
    validate_musicbrainz_tool_cache_schema(&cache_conn)?;

    let mut stmt = cache_conn
        .prepare(
            "
            WITH name_stats AS (
                SELECT mbid, COUNT(DISTINCT name) AS cached_name_count
                FROM artist_cache
                WHERE mbid IS NOT NULL
                  AND TRIM(mbid) <> ''
                  AND NULLIF(TRIM(name), '') IS NOT NULL
                GROUP BY mbid
            ),
            release_stats AS (
                SELECT artist_mbid AS mbid, COUNT(release_mbid) AS release_group_count
                FROM release_groups
                GROUP BY artist_mbid
            )
            SELECT
                ac.name,
                ac.mbid,
                COALESCE(ns.cached_name_count, 1) AS cached_name_count,
                COALESCE(rs.release_group_count, 0) AS release_group_count
            FROM artist_cache ac
            LEFT JOIN name_stats ns ON ns.mbid = ac.mbid
            LEFT JOIN release_stats rs ON rs.mbid = ac.mbid
            WHERE ac.mbid IS NOT NULL
              AND TRIM(ac.mbid) <> ''
              AND NULLIF(TRIM(ac.name), '') IS NOT NULL
            ",
        )
        .context("Could not prepare MusicBrainz cache artist coverage query")?;
    let rows = stmt
        .query_map([], |row| {
            Ok(MissingMusicBrainzCacheArtist {
                name: row.get(0)?,
                mbid: row.get(1)?,
                cached_name_count: row.get(2)?,
                release_group_count: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load MusicBrainz cache artist coverage rows")?;
    Ok(rows)
}

pub(super) fn musicbrainz_tool_matched_mbids(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn
        .prepare(
            "
            WITH cache_matches AS (
                SELECT c.mbid
                FROM temp.musicbrainz_tool_local_artists l
                JOIN temp.musicbrainz_tool_artist_cache c
                  ON c.local_name_key = l.artist_key
                  OR (
                        l.musicbrainz_name_key <> ''
                    AND c.musicbrainz_name_key = l.musicbrainz_name_key
                  )
            ),
            verified_links AS (
                SELECT link.mbid
                FROM musicbrainz_artist_links link
                JOIN temp.musicbrainz_tool_local_artists l
                  ON l.artist_key = link.local_artist_key
                WHERE link.verification_state = 'verified'
                  AND link.ignored = 0
                  AND link.mbid IS NOT NULL
                  AND TRIM(link.mbid) <> ''
            )
            SELECT DISTINCT LOWER(mbid)
            FROM (
                SELECT mbid FROM cache_matches
                UNION ALL
                SELECT mbid FROM verified_links
            )
            WHERE mbid IS NOT NULL AND TRIM(mbid) <> ''
            ",
        )
        .context("Could not prepare MusicBrainz matched MBID query")?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load MusicBrainz matched MBIDs")?;
    Ok(rows)
}

pub(super) fn musicbrainz_tool_cache_release_groups(
    cache_path: &str,
    mbids: &[String],
) -> Result<Vec<MissingMusicBrainzReleaseGroup>> {
    if mbids.is_empty() {
        return Ok(Vec::new());
    }

    let resolved_path = resolve_musicbrainz_cache_path(cache_path)?;
    let metadata = match fs::metadata(&resolved_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(error).with_context(|| {
                format!(
                    "Could not inspect MusicBrainz cache at {}",
                    resolved_path.display()
                )
            });
        }
    };
    if !metadata.is_file() {
        return Ok(Vec::new());
    }

    let cache_conn = Connection::open_with_flags(
        &resolved_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .with_context(|| {
        format!(
            "Could not open MusicBrainz cache read-only at {}",
            resolved_path.display()
        )
    })?;
    validate_musicbrainz_tool_cache_schema(&cache_conn)?;

    let mut rows = Vec::new();
    for chunk in mbids.chunks(300) {
        let placeholders = std::iter::repeat("?")
            .take(chunk.len())
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "
            SELECT
                artist_mbid, release_mbid, title, year, type,
                COALESCE(secondary_types, ''), track_count
            FROM release_groups
            WHERE LOWER(artist_mbid) IN ({placeholders})
              AND status = 'Official'
              AND (
                    (
                        LOWER(TRIM(type)) = 'album'
                        AND LOWER(REPLACE(REPLACE(COALESCE(secondary_types, ''), '+', ','), ' ', ''))
                            IN ('', 'compilation', 'compilation,live', 'live,compilation', 'interview', 'live')
                    )
                 OR (
                        LOWER(TRIM(type)) = 'ep'
                        AND LOWER(REPLACE(REPLACE(COALESCE(secondary_types, ''), '+', ','), ' ', ''))
                            IN ('', 'compilation', 'compilation,live', 'live,compilation', 'live')
                    )
              )
              AND NULLIF(TRIM(release_mbid), '') IS NOT NULL
              AND NULLIF(TRIM(title), '') IS NOT NULL
            "
        );
        let values = chunk
            .iter()
            .map(|mbid| Value::Text(mbid.to_lowercase()))
            .collect::<Vec<_>>();
        let mut stmt = cache_conn
            .prepare(&sql)
            .context("Could not prepare MusicBrainz cache release-group query")?;
        let chunk_rows = stmt
            .query_map(params_from_iter(values.iter()), |row| {
                Ok(MissingMusicBrainzReleaseGroup {
                    artist_mbid: row.get(0)?,
                    release_mbid: row.get(1)?,
                    title: row.get(2)?,
                    year: row.get(3)?,
                    primary_type: row.get(4)?,
                    secondary_types: row.get(5)?,
                    track_count: row.get(6)?,
                    source: "cache".to_string(),
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()
            .context("Could not load MusicBrainz cache release-group rows")?;
        rows.extend(chunk_rows);
    }

    Ok(rows)
}

pub(super) fn musicbrainz_tool_overlay_release_groups(
    conn: &Connection,
    mbids: &[String],
) -> Result<Vec<MissingMusicBrainzReleaseGroup>> {
    if mbids.is_empty() || !schema_table_exists(conn, "musicbrainz_artist_release_groups")? {
        return Ok(Vec::new());
    }

    let matched_mbids = mbids
        .iter()
        .map(|mbid| mbid.to_lowercase())
        .collect::<HashSet<_>>();
    let mut stmt = conn
        .prepare(
            "
            SELECT
                artist_mbid, release_mbid, title, year, type,
                COALESCE(secondary_types, ''), track_count
            FROM musicbrainz_artist_release_groups
            WHERE status = 'Official'
              AND (
                    (
                        LOWER(TRIM(type)) = 'album'
                        AND LOWER(REPLACE(REPLACE(COALESCE(secondary_types, ''), '+', ','), ' ', ''))
                            IN ('', 'compilation', 'compilation,live', 'live,compilation', 'interview', 'live')
                    )
                 OR (
                        LOWER(TRIM(type)) = 'ep'
                        AND LOWER(REPLACE(REPLACE(COALESCE(secondary_types, ''), '+', ','), ' ', ''))
                            IN ('', 'compilation', 'compilation,live', 'live,compilation', 'live')
                    )
              )
              AND NULLIF(TRIM(release_mbid), '') IS NOT NULL
              AND NULLIF(TRIM(title), '') IS NOT NULL
            ",
        )
        .context("Could not prepare refreshed MusicBrainz release-group query")?;
    let rows = stmt
        .query_map([], |row| {
            Ok(MissingMusicBrainzReleaseGroup {
                artist_mbid: row.get(0)?,
                release_mbid: row.get(1)?,
                title: row.get(2)?,
                year: row.get(3)?,
                primary_type: row.get(4)?,
                secondary_types: row.get(5)?,
                track_count: row.get(6)?,
                source: "refreshed".to_string(),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load refreshed MusicBrainz release-group rows")?;

    Ok(rows
        .into_iter()
        .filter(|row| matched_mbids.contains(&row.artist_mbid.to_lowercase()))
        .collect())
}

pub(super) fn musicbrainz_tool_release_classification(
    primary_type: &str,
    secondary_types: &str,
) -> Option<(&'static str, &'static str, &'static str)> {
    let mut secondary_types = secondary_types
        .split([',', '+'])
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    secondary_types.sort();
    secondary_types.dedup();
    let secondary_types_key = secondary_types.join("|");

    match (
        primary_type.trim().to_lowercase().as_str(),
        secondary_types_key.as_str(),
    ) {
        ("album", "") => Some(("Album", "", "Album")),
        ("album", "compilation") => Some(("Album", "compilation", "Album + Compilation")),
        ("album", "compilation|live") => {
            Some(("Album", "compilation|live", "Album + Compilation + Live"))
        }
        ("album", "interview") => Some(("Album", "interview", "Album + Interview")),
        ("album", "live") => Some(("Album", "live", "Album + Live")),
        ("ep", "") => Some(("EP", "", "EP")),
        ("ep", "compilation") => Some(("EP", "compilation", "EP + Compilation")),
        ("ep", "compilation|live") => Some(("EP", "compilation|live", "EP + Compilation + Live")),
        ("ep", "live") => Some(("EP", "live", "EP + Live")),
        _ => None,
    }
}

pub(super) fn insert_musicbrainz_tool_release_groups(
    conn: &Connection,
    release_groups: Vec<MissingMusicBrainzReleaseGroup>,
) -> Result<()> {
    if release_groups.is_empty() {
        return Ok(());
    }

    let mut stmt = conn
        .prepare(
            "
            INSERT INTO musicbrainz_tool_release_groups (
                artist_mbid, release_mbid, title, title_key, year, primary_type,
                secondary_types_key, release_type, track_count, source
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ",
        )
        .context("Could not prepare MusicBrainz release-group temp insert")?;
    for release_group in release_groups {
        let Some((primary_type, secondary_types_key, release_type)) =
            musicbrainz_tool_release_classification(
                &release_group.primary_type,
                &release_group.secondary_types,
            )
        else {
            continue;
        };
        let title_key = crate::identity::loose_key(&release_group.title);
        let normalized_artist_mbid = release_group.artist_mbid.to_lowercase();
        stmt.execute(params![
            normalized_artist_mbid,
            release_group.release_mbid,
            release_group.title,
            title_key,
            release_group.year,
            primary_type,
            secondary_types_key,
            release_type,
            release_group.track_count,
            release_group.source,
        ])
        .context("Could not insert MusicBrainz release-group temp row")?;
    }

    Ok(())
}

pub(super) fn resolve_musicbrainz_cache_path(cache_path: &str) -> Result<PathBuf> {
    let cache_path = normalize_musicbrainz_cache_path(cache_path);
    let path = PathBuf::from(&cache_path);
    if path.is_absolute() {
        return Ok(path);
    }

    let cwd = std::env::current_dir().context("Could not read current working directory")?;
    let mut candidates = vec![cwd.join(&path)];
    if let Some(parent) = cwd.parent() {
        candidates.push(parent.join(&path));
    }

    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate
                .canonicalize()
                .unwrap_or_else(|_| candidate.to_path_buf()));
        }
    }

    Ok(candidates.remove(0))
}

pub(super) fn validate_musicbrainz_tool_cache_schema(conn: &Connection) -> Result<()> {
    for table in ["artist_cache", "release_groups"] {
        if !schema_table_exists(conn, table)? {
            bail!("MusicBrainz cache is missing the {table} table");
        }
    }

    for column in ["name", "mbid", "cached_at"] {
        if !schema_column_exists(conn, "artist_cache", column)? {
            bail!("MusicBrainz cache is missing artist_cache.{column}");
        }
    }

    for column in [
        "artist_mbid",
        "release_mbid",
        "title",
        "year",
        "type",
        "secondary_types",
        "track_count",
        "status",
        "cached_at",
    ] {
        if !schema_column_exists(conn, "release_groups", column)? {
            bail!("MusicBrainz cache is missing release_groups.{column}");
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::*;

    #[test]
    fn musicbrainz_preparation_progress_uses_distinct_monotonic_stages() {
        let standard = (1..=MUSICBRAINZ_PREPARATION_STAGE_COUNT)
            .map(|stage| musicbrainz_preparation_percent(50, stage))
            .collect::<Vec<_>>();
        assert_eq!(standard, vec![20, 25, 30, 35, 40, 45, 50]);
        assert!(standard.windows(2).all(|pair| pair[0] < pair[1]));
        assert_eq!(musicbrainz_preparation_percent(88, 7), 88);
    }

    #[test]
    fn musicbrainz_artist_tool_calculates_top_genres_in_one_grouped_pass() {
        let conn = seeded_connection();
        insert_test_album(&conn, "mb:genre-1", "Genre Artist", "First", 2001, 10);
        insert_test_album(&conn, "mb:genre-2", "Genre Artist", "Second", 2002, 10);
        insert_test_album(&conn, "mb:genre-3", "Genre Artist", "Third", 2003, 10);
        conn.execute(
            "
            UPDATE albums
            SET canonical_genre = 'Documentary', genre_normalized = 'documentary'
            WHERE id IN ('mb:genre-2', 'mb:genre-3')
            ",
            [],
        )
        .expect("set majority genre");

        let artists = musicbrainz_tool_local_artists(&conn).expect("group local artists");
        let artist = artists
            .iter()
            .find(|artist| artist.display_artist == "Genre Artist")
            .expect("genre artist");

        assert_eq!(artist.album_count, 3);
        assert_eq!(artist.top_genre.as_deref(), Some("Documentary"));
    }

    #[test]
    fn lists_artists_without_musicbrainz_cache_data() {
        let mut conn = seeded_connection();
        insert_test_album(&conn, "mb:korn", "Korn", "Follow the Leader", 1998, 13);
        let temp_dir = temp_test_dir("musicbrainz-tool-missing");
        let cache_path = temp_dir.join("musicbrainz_cache.db");
        create_musicbrainz_tool_cache(&cache_path, &[("Pet Shop Boys", "mbid-psb", 2)]);

        prepare_missing_musicbrainz_artist_tool(&mut conn, &cache_path.display().to_string())
            .expect("prepare MusicBrainz artist coverage");
        let mut request = MusicToolIssueRequest::default();
        request.tool_id = "artists-without-musicbrainz-data".to_string();
        let response = list_music_tool_issues(&conn, request, 50, None)
            .expect("list artists without MusicBrainz data");

        assert_eq!(response.tool.scope, "artists");
        assert_eq!(response.tool.issue_count, 1);
        assert_eq!(response.tool.album_count, 1);
        assert_eq!(response.tool.track_count, 0);
        assert_eq!(response.total, 1);
        assert_eq!(response.rows[0].entity_type, "artists");
        assert_eq!(response.rows[0].album.as_deref(), Some("Korn"));
        assert_eq!(
            response.rows[0].detail.as_str(),
            "No MusicBrainz artist cache match"
        );
        assert_eq!(
            response.rows[0].value.as_deref(),
            Some("1 albums / 13 tracks")
        );
        assert_eq!(response.rows[0].canonical_genre.as_deref(), Some("Rock"));

        let (headers, rows) = issue_export_table(&response.tool.id, &response.rows);
        assert_eq!(headers[7], "Top Genre");
        assert_eq!(rows[0][7], "Rock");

        fs::remove_dir_all(temp_dir).expect("remove MusicBrainz tool temp dir");
    }

    #[test]
    fn musicbrainz_artist_tool_matches_normalized_cache_names() {
        let mut conn = seeded_connection();
        insert_test_album(
            &conn,
            "mb:motley-local",
            "Mötley Crüe",
            "Dr. Feelgood",
            1989,
            11,
        );
        let temp_dir = temp_test_dir("musicbrainz-tool-normalized");
        let cache_path = temp_dir.join("musicbrainz_cache.db");
        create_musicbrainz_tool_cache(
            &cache_path,
            &[
                ("Pet Shop Boys", "mbid-psb", 2),
                ("Motley Crue", "mbid-motley", 1),
            ],
        );

        prepare_missing_musicbrainz_artist_tool(&mut conn, &cache_path.display().to_string())
            .expect("prepare normalized MusicBrainz artist coverage");
        let mut request = MusicToolIssueRequest::default();
        request.tool_id = "artists-without-musicbrainz-data".to_string();
        let response = list_music_tool_issues(&conn, request, 50, None)
            .expect("list normalized MusicBrainz artist coverage");

        assert_eq!(response.total, 0);

        fs::remove_dir_all(temp_dir).expect("remove MusicBrainz tool temp dir");
    }

    #[test]
    fn musicbrainz_artist_tool_counts_verified_overlay_release_groups() {
        let mut conn = seeded_connection();
        insert_test_album(&conn, "mb:korn", "Korn", "Follow the Leader", 1998, 13);
        conn.execute(
            "
            INSERT INTO musicbrainz_artist_links (
                local_artist_key, display_artist, mbid, canonical_name, match_method,
                confidence, verification_state, ignored, created_at, updated_at
            ) VALUES (
                'korn', 'Korn', 'mbid-korn', 'Korn', 'manual-mbid',
                NULL, 'verified', 0, '2026-07-06T00:00:00Z', '2026-07-06T00:00:00Z'
            )
            ",
            [],
        )
        .expect("insert verified MusicBrainz artist link");
        conn.execute(
            "
            INSERT INTO musicbrainz_artist_release_groups (
                artist_mbid, release_mbid, title, year, type, secondary_types,
                track_count, status, source, fetched_at
            ) VALUES (
                'mbid-korn', 'release-follow-the-leader', 'Follow the Leader',
                1998, 'Album', '', 13, 'Official', 'musicbrainz-live',
                '2026-07-06T00:00:00Z'
            )
            ",
            [],
        )
        .expect("insert refreshed MusicBrainz release group");
        let temp_dir = temp_test_dir("musicbrainz-tool-overlay");
        let cache_path = temp_dir.join("musicbrainz_cache.db");
        create_musicbrainz_tool_cache(&cache_path, &[("Pet Shop Boys", "mbid-psb", 2)]);

        prepare_missing_musicbrainz_artist_tool(&mut conn, &cache_path.display().to_string())
            .expect("prepare overlay MusicBrainz artist coverage");
        let mut request = MusicToolIssueRequest::default();
        request.tool_id = "artists-without-musicbrainz-data".to_string();
        let response = list_music_tool_issues(&conn, request, 50, None)
            .expect("list overlay MusicBrainz artist coverage");

        assert_eq!(response.total, 0);

        fs::remove_dir_all(temp_dir).expect("remove MusicBrainz tool temp dir");
    }

    #[test]
    fn lists_high_confidence_missing_musicbrainz_albums() {
        let mut conn = seeded_connection();
        let temp_dir = temp_test_dir("musicbrainz-tool-missing-albums");
        let cache_path = temp_dir.join("musicbrainz_cache.db");
        create_musicbrainz_tool_cache(&cache_path, &[("Pet Shop Boys", "mbid-psb", 0)]);
        insert_musicbrainz_tool_cache_release(
            &cache_path,
            "mbid-psb",
            "release-actually",
            "Actually",
            1987,
        );
        insert_musicbrainz_tool_cache_release(
            &cache_path,
            "mbid-psb",
            "release-please",
            "Please",
            1986,
        );
        insert_musicbrainz_tool_cache_release(
            &cache_path,
            "mbid-psb",
            "release-demo",
            "Demo Album",
            1985,
        );
        conn.execute(
            "
            INSERT INTO musicbrainz_release_status_cache (
                artist_mbid, release_mbid, has_official_release, checked_at
            ) VALUES (
                'MBID-PSB', 'release-demo', 0, '2026-07-06T00:00:00Z'
            )
            ",
            [],
        )
        .expect("insert non-official status cache row");

        prepare_missing_musicbrainz_artist_tool(&mut conn, &cache_path.display().to_string())
            .expect("prepare high-confidence MusicBrainz album coverage");
        let mut request = MusicToolIssueRequest::default();
        request.tool_id = "high-confidence-missing-musicbrainz-albums".to_string();
        let response = list_music_tool_issues(&conn, request, 50, None)
            .expect("list high-confidence missing MusicBrainz albums");

        assert_eq!(response.tool.scope, "albums");
        assert_eq!(response.tool.issue_count, 1);
        assert_eq!(response.tool.album_count, 1);
        assert_eq!(response.total, 1);
        assert_eq!(response.rows[0].album.as_deref(), Some("Please"));
        assert_eq!(
            response.rows[0].album_artist_display.as_deref(),
            Some("Pet Shop Boys")
        );
        assert_eq!(response.rows[0].year, Some(1986));
        assert_eq!(
            response.rows[0].detail.as_str(),
            "High-confidence MusicBrainz album missing from library"
        );
        assert_eq!(
            response.rows[0].value.as_deref(),
            Some("MBID mbid-psb / cache-name / cache / matched Pet Shop Boys")
        );

        fs::remove_dir_all(temp_dir).expect("remove MusicBrainz tool temp dir");
    }

    #[test]
    fn lists_local_albums_not_on_musicbrainz_official_list() {
        let mut conn = seeded_connection();
        insert_test_album(&conn, "mb:please", "Pet Shop Boys", "Please", 1986, 10);
        insert_test_album(
            &conn,
            "mb:no-snapshot",
            "Uncached Artist",
            "Private Press",
            1988,
            8,
        );
        let temp_dir = temp_test_dir("musicbrainz-tool-local-not-official");
        let cache_path = temp_dir.join("musicbrainz_cache.db");
        create_musicbrainz_tool_cache(
            &cache_path,
            &[
                ("Pet Shop Boys", "MBID-PSB", 0),
                ("Uncached Artist", "mbid-uncached", 0),
            ],
        );
        insert_musicbrainz_tool_cache_release(
            &cache_path,
            "MBID-PSB",
            "release-actually",
            "Actually",
            1987,
        );

        prepare_missing_musicbrainz_artist_tool(&mut conn, &cache_path.display().to_string())
            .expect("prepare local MusicBrainz official-list comparison");
        let mut request = MusicToolIssueRequest::default();
        request.tool_id = "albums-not-on-musicbrainz-official-list".to_string();
        let response = list_music_tool_issues(&conn, request, 50, None)
            .expect("list local albums absent from MusicBrainz official list");

        assert_eq!(response.tool.scope, "albums");
        assert_eq!(response.tool.issue_count, 1);
        assert_eq!(response.tool.album_count, 1);
        assert_eq!(response.total, 1);
        assert_eq!(response.rows[0].album_id, "mb:please");
        assert_eq!(response.rows[0].album.as_deref(), Some("Please"));
        assert_eq!(
            response.rows[0].album_artist_display.as_deref(),
            Some("Pet Shop Boys")
        );
        assert_eq!(response.rows[0].year, Some(1986));
        assert_eq!(
            response.rows[0].detail.as_str(),
            "Local album not found on MusicBrainz pure official album list"
        );
        assert_eq!(
            response.rows[0].value.as_deref(),
            Some("MBID mbid-psb / cache-name / cache / matched Pet Shop Boys")
        );

        fs::remove_dir_all(temp_dir).expect("remove MusicBrainz tool temp dir");
    }

    #[test]
    fn normalizes_supported_musicbrainz_special_release_types() {
        assert_eq!(
            musicbrainz_tool_release_classification("Album", "Live + Compilation"),
            Some(("Album", "compilation|live", "Album + Compilation + Live"))
        );
        assert_eq!(
            musicbrainz_tool_release_classification("EP", "Compilation,Live"),
            Some(("EP", "compilation|live", "EP + Compilation + Live"))
        );
        assert_eq!(
            musicbrainz_tool_release_classification("Album", "Remix"),
            None
        );
    }

    #[test]
    fn lists_owned_musicbrainz_special_releases_and_excludes_pure_album_titles() {
        let mut conn = seeded_connection();
        insert_test_album(&conn, "mb:live", "Def Leppard", "Live Only", 1993, 12);
        insert_test_album(&conn, "mb:ep", "Def Leppard", "Rare EP", 1995, 5);
        insert_test_album(&conn, "mb:hybrid", "Def Leppard", "Hybrid", 1996, 8);
        insert_test_album(&conn, "mb:dual", "Def Leppard", "Dual", 1997, 10);
        insert_test_album(&conn, "mb:remix", "Def Leppard", "Remix Only", 1998, 9);

        let temp_dir = temp_test_dir("musicbrainz-tool-owned-special-releases");
        let cache_path = temp_dir.join("musicbrainz_cache.db");
        create_musicbrainz_tool_cache(&cache_path, &[("Def Leppard", "mbid-def", 0)]);
        insert_musicbrainz_tool_cache_typed_release(
            &cache_path,
            "mbid-def",
            "release-live",
            "Live Only",
            1993,
            "Album",
            "Live",
        );
        insert_musicbrainz_tool_cache_typed_release(
            &cache_path,
            "mbid-def",
            "release-ep",
            "Rare EP",
            1995,
            "EP",
            "Compilation,Live",
        );
        insert_musicbrainz_tool_cache_typed_release(
            &cache_path,
            "mbid-def",
            "release-hybrid-live",
            "Hybrid",
            1996,
            "Album",
            "Live",
        );
        insert_musicbrainz_tool_cache_typed_release(
            &cache_path,
            "mbid-def",
            "release-hybrid-ep",
            "Hybrid",
            1996,
            "EP",
            "Compilation",
        );
        insert_musicbrainz_tool_cache_typed_release(
            &cache_path,
            "mbid-def",
            "release-dual-live",
            "Dual",
            1997,
            "Album",
            "Live",
        );
        insert_musicbrainz_tool_cache_release(
            &cache_path,
            "mbid-def",
            "release-dual-pure",
            "Dual",
            1997,
        );
        insert_musicbrainz_tool_cache_typed_release(
            &cache_path,
            "mbid-def",
            "release-remix",
            "Remix Only",
            1998,
            "Album",
            "Remix",
        );
        conn.execute_batch(
            "
            INSERT INTO musicbrainz_artist_release_groups (
                artist_mbid, release_mbid, title, year, type, secondary_types,
                track_count, status, source, fetched_at
            ) VALUES
                ('mbid-def', 'refreshed-live', 'Live Only', 1993, 'Album', 'Live', 12, 'Official', 'musicbrainz-live', '2026-08-11T00:00:00Z'),
                ('mbid-def', 'refreshed-hybrid', 'Hybrid', 1996, 'Album', 'Live', 8, 'Official', 'musicbrainz-live', '2026-08-11T00:00:00Z'),
                ('mbid-def', 'refreshed-dual-live', 'Dual', 1997, 'Album', 'Live', 10, 'Official', 'musicbrainz-live', '2026-08-11T00:00:00Z'),
                ('mbid-def', 'refreshed-dual-pure', 'Dual', 1997, 'Album', '', 10, 'Official', 'musicbrainz-live', '2026-08-11T00:00:00Z'),
                ('mbid-def', 'refreshed-remix', 'Remix Only', 1998, 'Album', 'Remix', 9, 'Official', 'musicbrainz-live', '2026-08-11T00:00:00Z');
            ",
        )
        .expect("insert refreshed MusicBrainz special release groups");

        prepare_missing_musicbrainz_artist_tool(&mut conn, &cache_path.display().to_string())
            .expect("prepare owned MusicBrainz special releases");
        let mut request = MusicToolIssueRequest::default();
        request.tool_id = "owned-musicbrainz-special-releases".to_string();
        let response = list_music_tool_issues(&conn, request, 50, None)
            .expect("list owned MusicBrainz special releases");

        assert_eq!(response.tool.issue_count, 3);
        assert_eq!(response.tool.album_count, 3);
        assert_eq!(response.total, 3);
        assert_eq!(
            response
                .rows
                .iter()
                .map(|row| (row.album.as_deref(), row.value.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                (Some("Hybrid"), Some("Album + Live / EP + Compilation")),
                (Some("Live Only"), Some("Album + Live")),
                (Some("Rare EP"), Some("EP + Compilation + Live")),
            ]
        );
        assert!(response
            .rows
            .iter()
            .all(|row| row.album.as_deref() != Some("Dual")));
        assert!(response
            .rows
            .iter()
            .all(|row| row.album.as_deref() != Some("Remix Only")));

        let (headers, _) = issue_export_table(&response.tool.id, &response.rows);
        assert!(headers.contains(&"MusicBrainz Type"));
        assert!(!headers.contains(&"Value"));

        fs::remove_dir_all(temp_dir).expect("remove MusicBrainz tool temp dir");
    }

    #[test]
    fn high_confidence_missing_musicbrainz_albums_skip_suspect_cache_mappings() {
        let mut conn = seeded_connection();
        let temp_dir = temp_test_dir("musicbrainz-tool-suspect-albums");
        let cache_path = temp_dir.join("musicbrainz_cache.db");
        create_musicbrainz_tool_cache(
            &cache_path,
            &[("Pet Shop Boys", "mbid-psb", 0), ("PSB", "mbid-psb", 0)],
        );
        insert_musicbrainz_tool_cache_release(
            &cache_path,
            "mbid-psb",
            "release-please",
            "Please",
            1986,
        );

        prepare_missing_musicbrainz_artist_tool(&mut conn, &cache_path.display().to_string())
            .expect("prepare suspect MusicBrainz album coverage");
        let mut request = MusicToolIssueRequest::default();
        request.tool_id = "high-confidence-missing-musicbrainz-albums".to_string();
        let response = list_music_tool_issues(&conn, request, 50, None)
            .expect("list high-confidence missing MusicBrainz albums");

        assert_eq!(response.total, 0);

        fs::remove_dir_all(temp_dir).expect("remove MusicBrainz tool temp dir");
    }

    #[test]
    fn high_confidence_missing_musicbrainz_albums_use_verified_overlay_rows() {
        let mut conn = seeded_connection();
        insert_test_album(&conn, "mb:korn", "Korn", "Follow the Leader", 1998, 13);
        conn.execute(
            "
            INSERT INTO musicbrainz_artist_links (
                local_artist_key, display_artist, mbid, canonical_name, match_method,
                confidence, verification_state, ignored, created_at, updated_at
            ) VALUES (
                'korn', 'Korn', 'mbid-korn', 'Korn', 'manual-mbid',
                NULL, 'verified', 0, '2026-07-06T00:00:00Z', '2026-07-06T00:00:00Z'
            )
            ",
            [],
        )
        .expect("insert verified MusicBrainz artist link");
        conn.execute_batch(
            "
            INSERT INTO musicbrainz_artist_release_groups (
                artist_mbid, release_mbid, title, year, type, secondary_types,
                track_count, status, source, fetched_at
            ) VALUES
                (
                    'mbid-korn', 'release-follow-the-leader', 'Follow the Leader',
                    1998, 'Album', '', 13, 'Official', 'musicbrainz-live',
                    '2026-07-06T00:00:00Z'
                ),
                (
                    'mbid-korn', 'release-issues', 'Issues',
                    1999, 'Album', '', 16, 'Official', 'musicbrainz-live',
                    '2026-07-06T00:00:00Z'
                );
            ",
        )
        .expect("insert refreshed MusicBrainz release groups");
        let temp_dir = temp_test_dir("musicbrainz-tool-overlay-albums");
        let cache_path = temp_dir.join("musicbrainz_cache.db");
        create_musicbrainz_tool_cache(&cache_path, &[]);

        prepare_missing_musicbrainz_artist_tool(&mut conn, &cache_path.display().to_string())
            .expect("prepare overlay MusicBrainz album coverage");
        let mut request = MusicToolIssueRequest::default();
        request.tool_id = "high-confidence-missing-musicbrainz-albums".to_string();
        let response = list_music_tool_issues(&conn, request, 50, None)
            .expect("list overlay missing MusicBrainz albums");

        assert_eq!(response.total, 1);
        assert_eq!(response.rows[0].album.as_deref(), Some("Issues"));
        assert_eq!(
            response.rows[0].album_artist_display.as_deref(),
            Some("Korn")
        );
        assert_eq!(response.rows[0].year, Some(1999));
        assert_eq!(
            response.rows[0].value.as_deref(),
            Some("MBID mbid-korn / verified-link / refreshed / matched Korn")
        );

        fs::remove_dir_all(temp_dir).expect("remove MusicBrainz tool temp dir");
    }
}
