use anyhow::{Context, Result};
use rusqlite::{params, Connection};

pub(super) const LATEST_SCHEMA_VERSION: i32 = 57;

pub(super) fn migrate_half_star_ratings(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        DROP TABLE IF EXISTS temp.migration_57_half_star_albums;
        CREATE TEMP TABLE migration_57_half_star_albums (
            album_id TEXT PRIMARY KEY
        ) WITHOUT ROWID;

        INSERT OR IGNORE INTO migration_57_half_star_albums (album_id)
        SELECT album_id
        FROM tracks
        WHERE normalized_rating IS NULL
          AND TRIM(COALESCE(rating_raw, '')) IN ('0.5', '1.5', '2.5', '3.5', '4.5');

        UPDATE tracks
        SET normalized_rating = CASE TRIM(rating_raw)
            WHEN '0.5' THEN 10
            WHEN '1.5' THEN 30
            WHEN '2.5' THEN 50
            WHEN '3.5' THEN 70
            WHEN '4.5' THEN 90
        END
        WHERE normalized_rating IS NULL
          AND album_id IN (SELECT album_id FROM migration_57_half_star_albums)
          AND TRIM(COALESCE(rating_raw, '')) IN ('0.5', '1.5', '2.5', '3.5', '4.5');

        UPDATE albums
        SET rated_tracks = (
                SELECT COUNT(*) FROM tracks WHERE tracks.album_id = albums.id
                  AND tracks.normalized_rating IS NOT NULL
            ),
            rating_completeness = CASE
                WHEN total_tracks = 0 THEN 0.0
                ELSE CAST((
                    SELECT COUNT(*) FROM tracks WHERE tracks.album_id = albums.id
                      AND tracks.normalized_rating IS NOT NULL
                ) AS REAL) / CAST(total_tracks AS REAL)
            END,
            calculated_album_rating = CASE
                WHEN total_tracks > 0 AND total_tracks = (
                    SELECT COUNT(*) FROM tracks WHERE tracks.album_id = albums.id
                      AND tracks.normalized_rating IS NOT NULL
                ) THEN CAST(ROUND((
                    SELECT AVG(normalized_rating) FROM tracks WHERE tracks.album_id = albums.id
                )) AS INTEGER)
                ELSE NULL
            END
        WHERE id IN (SELECT album_id FROM migration_57_half_star_albums);

        UPDATE albums
        SET effective_album_rating = COALESCE(album_rating, calculated_album_rating)
        WHERE id IN (SELECT album_id FROM migration_57_half_star_albums);

        UPDATE albums
        SET album_score = CASE
            WHEN effective_album_rating IS NULL THEN NULL
            ELSE ((effective_album_rating * 0.5) + (ae_ratio * 100.0)
                    + ((tmoe_seconds / 60.0) * 0.3)) / 10.0
                 + (loved_tracks * 100.0)
        END
        WHERE id IN (SELECT album_id FROM migration_57_half_star_albums);

        DROP TABLE migration_57_half_star_albums;
        ",
    )
    .context("Could not migrate legacy half-star ratings")?;
    Ok(())
}

pub(super) fn migrate_uk_origin_country_alias(conn: &Connection) -> Result<()> {
    if !super::schema_table_exists(conn, "musicbrainz_origin_countries")?
        || !super::schema_table_exists(conn, "musicbrainz_artist_origin_countries")?
    {
        return Ok(());
    }

    let artist_origin_alias_exists = conn
        .query_row(
            "SELECT EXISTS(
                SELECT 1
                FROM musicbrainz_origin_countries
                WHERE UPPER(TRIM(country_code)) = 'UK'
                   OR (
                       country_code = 'GB'
                       AND (
                           TRIM(country_name) = ''
                           OR UPPER(TRIM(country_name)) IN ('UK', 'GB')
                       )
                   )
                UNION ALL
                SELECT 1
                FROM musicbrainz_artist_origin_countries
                WHERE UPPER(TRIM(country_code)) = 'UK'
            )",
            [],
            |row| row.get::<_, bool>(0),
        )
        .context("Could not inspect artist origins for legacy UK country codes")?;
    let map_location_alias_exists = super::schema_table_exists(conn, "musicbrainz_map_locations")?
        && conn
            .query_row(
                "SELECT EXISTS(
                    SELECT 1
                    FROM musicbrainz_map_locations
                    WHERE UPPER(TRIM(country_code)) = 'UK'
                )",
                [],
                |row| row.get::<_, bool>(0),
            )
            .context("Could not inspect map locations for legacy UK country codes")?;

    if !artist_origin_alias_exists && !map_location_alias_exists {
        return Ok(());
    }

    conn.execute_batch(
        "
        INSERT OR IGNORE INTO musicbrainz_origin_countries (
            country_code, country_name, area_mbid, iso_source,
            is_historical, is_special, created_at, updated_at
        )
        SELECT
            'GB', 'United Kingdom', area_mbid, iso_source,
            is_historical, is_special, created_at, updated_at
        FROM musicbrainz_origin_countries
        WHERE UPPER(TRIM(country_code)) = 'UK'
        LIMIT 1;

        UPDATE musicbrainz_artist_origin_countries
        SET
            country_code = 'GB',
            country_name = CASE
                WHEN country_name IS NULL
                    OR TRIM(country_name) = ''
                    OR UPPER(TRIM(country_name)) IN ('UK', 'GB')
                THEN 'United Kingdom'
                ELSE country_name
            END
        WHERE UPPER(TRIM(country_code)) = 'UK';

        DELETE FROM musicbrainz_origin_countries
        WHERE UPPER(TRIM(country_code)) = 'UK';

        UPDATE musicbrainz_origin_countries
        SET country_name = 'United Kingdom'
        WHERE country_code = 'GB'
            AND (
                TRIM(country_name) = ''
                OR UPPER(TRIM(country_name)) IN ('UK', 'GB')
            );
        ",
    )
    .context("Could not canonicalize UK artist origins to GB")?;

    if super::schema_table_exists(conn, "musicbrainz_map_locations")? {
        conn.execute(
            "UPDATE musicbrainz_map_locations SET country_code = 'GB' WHERE UPPER(TRIM(country_code)) = 'UK'",
            [],
        )
        .context("Could not canonicalize UK map locations to GB")?;
    }

    Ok(())
}

pub(super) fn phase_fifty_six_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_fifty_five_schema_exists(conn)?
        && super::schema_table_exists(conn, "playlist_automations")?
        && super::schema_table_exists(conn, "plex_track_cache")?
        && super::schema_table_exists(conn, "plex_sync_state")?
        && super::schema_index_exists(conn, "idx_plex_track_cache_path")?)
}

pub(super) fn phase_fifty_five_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_fifty_four_schema_exists(conn)?
        && super::schema_table_exists(conn, "chart_album_match_state")?)
}

pub(super) fn phase_fifty_four_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_fifty_three_schema_exists(conn)?
        && super::schema_table_exists(conn, "daily_edition_snapshots")?
        && super::schema_index_exists(conn, "idx_daily_edition_snapshots_created")?)
}

pub(super) fn phase_fifty_three_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_fifty_two_schema_exists(conn)?
        && super::schema_table_exists(conn, "lastfm_album_relationships")?
        && super::schema_table_exists(conn, "lastfm_related_albums")?
        && super::schema_index_exists(conn, "idx_lastfm_related_albums_album_rank")?
        && super::schema_index_exists(conn, "idx_lastfm_related_albums_candidate_mbid")?
        && super::schema_index_exists(conn, "idx_lastfm_related_albums_expires")?)
}

pub(super) fn phase_fifty_two_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_fifty_one_schema_exists(conn)?
        && super::schema_table_exists(conn, "lastfm_artist_similarity")?
        && super::schema_table_exists(conn, "lastfm_similar_artists")?
        && super::schema_index_exists(conn, "idx_lastfm_similar_artists_artist_rank")?
        && super::schema_index_exists(conn, "idx_lastfm_similar_artists_target_mbid")?
        && super::schema_index_exists(conn, "idx_lastfm_similar_artists_expires")?)
}

pub(super) fn phase_fifty_one_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_fifty_schema_exists(conn)?
        && super::schema_table_exists(conn, "album_reviews")?
        && super::schema_index_exists(conn, "idx_album_reviews_expires")?)
}

pub(super) fn phase_fifty_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_nine_schema_exists(conn)?
        && super::schema_table_exists(conn, "artist_biographies")?
        && super::schema_index_exists(conn, "idx_artist_biographies_expires")?)
}

pub(super) fn phase_forty_nine_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_eight_schema_exists(conn)?
        && super::schema_table_exists(conn, "lastfm_artist_popularity")?
        && super::schema_table_exists(conn, "lastfm_track_popularity")?
        && super::schema_index_exists(conn, "idx_lastfm_track_popularity_artist_rank")?
        && super::schema_index_exists(conn, "idx_lastfm_track_popularity_expires")?)
}

pub(super) fn phase_forty_eight_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_seven_schema_exists(conn)?
        && super::schema_column_exists(conn, "app_settings", "music_doctor_database_path")?
        && super::schema_column_exists(conn, "app_settings", "music_doctor_auto_sync")?
        && super::schema_table_exists(conn, "music_doctor_sync_runs")?
        && super::schema_table_exists(conn, "music_doctor_track_quality")?
        && super::schema_table_exists(conn, "music_doctor_album_quality")?
        && super::schema_table_exists(conn, "music_doctor_unmatched_files")?
        && super::schema_table_exists(conn, "music_doctor_file_issues")?)
}

pub(super) fn phase_forty_seven_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_six_schema_exists(conn)?
        && super::schema_index_exists(conn, "idx_albums_artist_key")?)
}

pub(super) fn phase_forty_six_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_five_schema_exists(conn)?
        && super::schema_table_exists(conn, "artist_images")?
        && super::schema_index_exists(conn, "idx_artist_images_state_fetched_at")?)
}

pub(super) fn phase_forty_five_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_four_schema_exists(conn)?
        && super::schema_table_exists(conn, "library_updates")?
        && super::schema_index_exists(conn, "idx_library_updates_created_at")?
        && super::schema_index_exists(conn, "idx_library_updates_kind_created_at")?)
}

pub(super) fn phase_forty_four_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_three_schema_exists(conn)?
        && super::schema_table_exists(conn, "library_completion_artist_verifications")?
        && super::schema_table_exists(conn, "library_completion_artist_decisions")?
        && super::schema_table_exists(conn, "library_completion_artist_verification_batches")?
        && super::schema_table_exists(conn, "library_completion_artist_verification_items")?
        && super::schema_index_exists(
            conn,
            "idx_library_completion_artist_verification_batches_one_active",
        )?)
}

pub(super) fn phase_forty_three_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_two_schema_exists(conn)?
        && super::schema_column_exists(conn, "library_completion_verifications", "cover_state")?
        && super::schema_column_exists(
            conn,
            "library_completion_verifications",
            "cover_cache_path",
        )?
        && super::schema_column_exists(conn, "library_completion_verifications", "cover_provider")?
        && super::schema_column_exists(
            conn,
            "library_completion_verifications",
            "cover_source_url",
        )?
        && super::schema_column_exists(
            conn,
            "library_completion_verifications",
            "cover_mime_type",
        )?
        && super::schema_column_exists(conn, "library_completion_verifications", "cover_message")?
        && super::schema_column_exists(
            conn,
            "library_completion_verifications",
            "cover_checked_at",
        )?)
}

pub(super) fn phase_forty_two_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_one_schema_exists(conn)?
        && super::schema_column_exists(
            conn,
            "library_completion_verifications",
            "verification_provider",
        )?
        && super::schema_column_exists(
            conn,
            "library_completion_verifications",
            "discogs_master_id",
        )?
        && super::schema_column_exists(conn, "library_completion_verification_items", "provider")?)
}

pub(super) fn phase_forty_one_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_schema_exists(conn)?
        && super::schema_table_exists(conn, "library_completion_verifications")?
        && super::schema_table_exists(conn, "library_completion_verification_batches")?
        && super::schema_table_exists(conn, "library_completion_verification_items")?
        && super::schema_index_exists(
            conn,
            "idx_library_completion_verification_batches_one_active",
        )?)
}

pub(super) fn phase_forty_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_nine_schema_exists(conn)?
        && super::schema_table_exists(conn, "library_completion_decisions")?
        && super::schema_column_exists(conn, "library_completion_decisions", "musicbrainz_id")?
        && super::schema_column_exists(conn, "library_completion_decisions", "wish_list_item_id")?)
}

pub(super) fn phase_thirty_nine_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_eight_schema_exists(conn)?
        && super::schema_column_exists(conn, "albums", "official_uk_rank")?
        && super::schema_column_exists(conn, "albums", "official_uk_debut_week_key")?
        && super::schema_column_exists(conn, "tracks", "official_uk_rank")?
        && super::schema_column_exists(conn, "tracks", "official_uk_debut_week_key")?
        && super::schema_table_exists(conn, "official_uk_album_chart_entries")?
        && super::schema_table_exists(conn, "official_uk_single_chart_entries")?
        && super::schema_column_exists(conn, "app_settings", "official_uk_album_source_path")?
        && super::schema_column_exists(conn, "app_settings", "official_uk_singles_source_path")?)
}

pub(super) fn phase_thirty_eight_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_seven_schema_exists(conn)?
        && super::schema_column_exists(conn, "tracks", "norsktoppen_rank")?
        && super::schema_column_exists(conn, "tracks", "norsktoppen_debut_week_key")?
        && super::schema_table_exists(conn, "norsktoppen_chart_entries")?
        && super::schema_column_exists(conn, "app_settings", "norsktoppen_source_path")?)
}

pub(super) fn phase_thirty_seven_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_six_schema_exists(conn)?
        && super::schema_column_exists(conn, "tracks", "ti_i_skuddet_rank")?
        && super::schema_column_exists(conn, "tracks", "ti_i_skuddet_debut_week_key")?
        && super::schema_table_exists(conn, "ti_i_skuddet_chart_entries")?
        && super::schema_column_exists(conn, "app_settings", "ti_i_skuddet_source_path")?)
}

pub(super) fn phase_thirty_six_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_five_schema_exists(conn)?
        && super::schema_column_exists(conn, "albums", "vg_lista_rank")?
        && super::schema_column_exists(conn, "albums", "vg_lista_debut_week_key")?
        && super::schema_column_exists(conn, "tracks", "vg_lista_rank")?
        && super::schema_column_exists(conn, "tracks", "vg_lista_debut_week_key")?
        && super::schema_table_exists(conn, "vg_lista_album_chart_entries")?
        && super::schema_table_exists(conn, "vg_lista_single_chart_entries")?
        && super::schema_column_exists(conn, "app_settings", "vg_lista_album_source_path")?
        && super::schema_column_exists(conn, "app_settings", "vg_lista_singles_source_path")?)
}

pub(super) fn phase_thirty_five_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_four_schema_exists(conn)?
        && super::schema_column_exists(conn, "billboard_single_chart_entries", "album")?
        && super::schema_column_exists(conn, "billboard_single_chart_entries", "album_key")?)
}

pub(super) fn phase_thirty_four_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_three_schema_exists(conn)?
        && super::schema_column_exists(conn, "tracks", "billboard_single_debut_date")?
        && super::schema_column_exists(conn, "tracks", "billboard_single_debut_week_key")?
        && super::schema_column_exists(conn, "billboard_single_chart_entries", "date_entered")?
        && super::schema_column_exists(
            conn,
            "billboard_single_chart_entries",
            "date_entered_quality",
        )?)
}

pub(super) fn phase_thirty_three_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_two_schema_exists(conn)?
        && super::schema_column_exists(conn, "albums", "billboard_debut_year")?
        && super::schema_column_exists(conn, "albums", "billboard_debut_month")?
        && super::schema_column_exists(conn, "albums", "billboard_debut_week")?
        && super::schema_column_exists(conn, "albums", "billboard_debut_week_key")?
        && super::schema_column_exists(conn, "billboard_chart_entries", "first_appearance_week")?
        && super::schema_column_exists(conn, "billboard_chart_entries", "first_appearance_month")?)
}

pub(super) fn phase_thirty_two_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_one_schema_exists(conn)?
        && super::schema_column_exists(conn, "app_settings", "deemix_download_fallback")?)
}

pub(super) fn phase_thirty_one_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_schema_exists(conn)? && super::schema_table_exists(conn, "deemix_downloads")?)
}

pub(super) fn phase_thirty_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_nine_schema_exists(conn)?
        && super::schema_column_exists(conn, "app_settings", "deemix_download_quality")?
        && super::schema_column_exists(conn, "app_settings", "deemix_download_organization")?)
}

pub(super) fn phase_twenty_nine_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_eight_schema_exists(conn)?
        && super::schema_column_exists(conn, "app_settings", "deemix_download_path")?)
}

const LEGACY_DEVELOPER_OVERLAY_SYNC_PATH: &str =
    r"C:\Users\jtill\OneDrive\_musicbackup\musicbrainz-overlay-sync.sqlite3";

pub(super) fn phase_twenty_eight_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_seven_schema_exists(conn)?
        && super::schema_table_exists(conn, "musicbrainz_map_locations")?)
}

pub(super) fn phase_twenty_seven_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_six_schema_exists(conn)?
        && !super::schema_index_exists(conn, "idx_tracks_file_identity")?)
}

pub(super) fn phase_twenty_six_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_five_schema_exists(conn)?
        && super::schema_table_exists(conn, "music_tool_fix_runs")?)
}

pub(super) fn phase_twenty_five_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_four_schema_exists(conn)?
        && super::schema_table_exists(conn, "import_sessions")?
        && super::schema_table_exists(conn, "import_stage_tracks")?
        && super::schema_table_exists(conn, "import_stage_albums")?
        && super::schema_table_exists(conn, "import_suspicious_albums")?)
}

fn phase_twenty_four_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_three_schema_exists(conn)?
        && super::schema_table_exists(conn, "wish_list_items")?)
}

fn phase_twenty_three_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_two_schema_exists(conn)?
        && super::schema_table_exists(conn, "saved_external_discoveries")?)
}

fn phase_twenty_two_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_one_schema_exists(conn)?
        && super::schema_table_exists(conn, "saved_playlists")?)
}

fn phase_twenty_one_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_schema_exists(conn)? && super::schema_table_exists(conn, "ai_snapshots")?)
}

fn phase_twenty_schema_exists(conn: &Connection) -> Result<bool> {
    super::phase_nineteen_schema_exists(conn)
}

pub(super) fn migrate_portable_overlay_sync_default(conn: &Connection) -> Result<()> {
    conn.execute(
        "UPDATE app_settings SET musicbrainz_overlay_sync_path = '' WHERE musicbrainz_overlay_sync_path = ?1",
        params![LEGACY_DEVELOPER_OVERLAY_SYNC_PATH],
    )
    .context("Could not clear the legacy developer-specific overlay sync path")?;
    Ok(())
}

pub(super) fn migrate_billboard_album_source_default(conn: &Connection) -> Result<()> {
    conn.execute(
        "UPDATE app_settings SET billboard_source_path = 'CSV_ALBUMS' WHERE LOWER(TRIM(billboard_source_path)) = 'csv'",
        [],
    )
    .context("Could not migrate the Billboard album CSV source path")?;
    Ok(())
}
