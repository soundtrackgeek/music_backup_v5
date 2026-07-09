use anyhow::{Context, Result};
use rusqlite::{params, Connection};

pub(super) const LATEST_SCHEMA_VERSION: i32 = 20;

const LEGACY_DEVELOPER_OVERLAY_SYNC_PATH: &str =
    r"C:\Users\jtill\OneDrive\_musicbackup\musicbrainz-overlay-sync.sqlite3";

pub(super) fn phase_twenty_schema_exists(conn: &Connection) -> Result<bool> {
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
