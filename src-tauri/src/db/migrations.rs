use anyhow::{Context, Result};
use rusqlite::{params, Connection};

pub(super) const LATEST_SCHEMA_VERSION: i32 = 27;

const LEGACY_DEVELOPER_OVERLAY_SYNC_PATH: &str =
    r"C:\Users\jtill\OneDrive\_musicbackup\musicbrainz-overlay-sync.sqlite3";

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
