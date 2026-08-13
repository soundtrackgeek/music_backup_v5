use anyhow::{Context, Result};
use rusqlite::{params, Connection};

pub(super) const LATEST_SCHEMA_VERSION: i32 = 55;

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
