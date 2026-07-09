#[cfg(not(test))]
use super::open;
use super::{
    DEFAULT_BACKUP_RETENTION, DEFAULT_BILLBOARD_SINGLES_SOURCE_PATH, DEFAULT_BILLBOARD_SOURCE_PATH,
    DEFAULT_COUNTRY_FLAG_DISPLAY, DEFAULT_COVER_SOURCE_PATH, DEFAULT_IMPORT_SOURCE_PATH,
    DEFAULT_MUSICBRAINZ_CACHE_PATH, DEFAULT_MUSICBRAINZ_OVERLAY_SYNC_PATH, MAX_BACKUP_RETENTION,
    MAX_MUSICBRAINZ_OVERLAY_AUTO_SYNC_MINUTES, MAX_UPDATE_AUTO_CHECK_MINUTES, MIN_BACKUP_RETENTION,
};
use crate::models::AppSettings;
use anyhow::{Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
#[cfg(not(test))]
use tauri::AppHandle;

#[cfg(not(test))]
pub fn settings_for_app(app: &AppHandle) -> Result<AppSettings> {
    let (conn, _) = open(app)?;
    settings_for_connection(&conn)
}

#[cfg(not(test))]
pub fn save_settings_for_app(app: &AppHandle, settings: AppSettings) -> Result<AppSettings> {
    let (conn, _) = open(app)?;
    save_settings_for_connection(&conn, settings)
}

pub fn settings_for_connection(conn: &Connection) -> Result<AppSettings> {
    let settings = conn
        .query_row(
            "
            SELECT backup_retention, dark_mode, country_flag_display,
                   left_sidebar_default, right_sidebar_default,
                   import_source_path, cover_source_path, billboard_source_path,
                   billboard_singles_source_path, musicbrainz_cache_path,
                   musicbrainz_overlay_sync_path, musicbrainz_overlay_auto_sync_minutes,
                   update_auto_check_minutes, updated_at
            FROM app_settings
            WHERE id = 1
            ",
            [],
            settings_from_row,
        )
        .optional()
        .context("Could not load settings")?;

    match settings {
        Some(settings) => Ok(normalize_settings(settings)),
        None => save_settings_for_connection(
            conn,
            AppSettings {
                backup_retention: DEFAULT_BACKUP_RETENTION,
                dark_mode: false,
                country_flag_display: DEFAULT_COUNTRY_FLAG_DISPLAY.to_string(),
                left_sidebar_default: "expanded".to_string(),
                right_sidebar_default: "expanded".to_string(),
                import_source_path: DEFAULT_IMPORT_SOURCE_PATH.to_string(),
                cover_source_path: DEFAULT_COVER_SOURCE_PATH.to_string(),
                billboard_source_path: DEFAULT_BILLBOARD_SOURCE_PATH.to_string(),
                billboard_singles_source_path: DEFAULT_BILLBOARD_SINGLES_SOURCE_PATH.to_string(),
                musicbrainz_cache_path: DEFAULT_MUSICBRAINZ_CACHE_PATH.to_string(),
                musicbrainz_overlay_sync_path: DEFAULT_MUSICBRAINZ_OVERLAY_SYNC_PATH.to_string(),
                musicbrainz_overlay_auto_sync_minutes: 0,
                update_auto_check_minutes: 0,
                updated_at: None,
            },
        ),
    }
}

pub(super) fn save_settings_for_connection(
    conn: &Connection,
    settings: AppSettings,
) -> Result<AppSettings> {
    let settings = normalize_settings(settings);
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "
        INSERT INTO app_settings (
            id, backup_retention, dark_mode, country_flag_display, left_sidebar_default, right_sidebar_default,
            import_source_path, cover_source_path, billboard_source_path,
            billboard_singles_source_path, musicbrainz_cache_path, musicbrainz_overlay_sync_path,
            musicbrainz_overlay_auto_sync_minutes, update_auto_check_minutes, updated_at
        )
        VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        ON CONFLICT(id) DO UPDATE SET
            backup_retention = excluded.backup_retention,
            dark_mode = excluded.dark_mode,
            country_flag_display = excluded.country_flag_display,
            left_sidebar_default = excluded.left_sidebar_default,
            right_sidebar_default = excluded.right_sidebar_default,
            import_source_path = excluded.import_source_path,
            cover_source_path = excluded.cover_source_path,
            billboard_source_path = excluded.billboard_source_path,
            billboard_singles_source_path = excluded.billboard_singles_source_path,
            musicbrainz_cache_path = excluded.musicbrainz_cache_path,
            musicbrainz_overlay_sync_path = excluded.musicbrainz_overlay_sync_path,
            musicbrainz_overlay_auto_sync_minutes = excluded.musicbrainz_overlay_auto_sync_minutes,
            update_auto_check_minutes = excluded.update_auto_check_minutes,
            updated_at = excluded.updated_at
        ",
        params![
            i64::from(settings.backup_retention),
            if settings.dark_mode { 1 } else { 0 },
            settings.country_flag_display,
            settings.left_sidebar_default,
            settings.right_sidebar_default,
            settings.import_source_path,
            settings.cover_source_path,
            settings.billboard_source_path,
            settings.billboard_singles_source_path,
            settings.musicbrainz_cache_path,
            settings.musicbrainz_overlay_sync_path,
            i64::from(settings.musicbrainz_overlay_auto_sync_minutes),
            i64::from(settings.update_auto_check_minutes),
            now
        ],
    )
    .context("Could not save settings")?;

    settings_for_connection(conn)
}

fn settings_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AppSettings> {
    let backup_retention: i64 = row.get(0)?;
    let dark_mode: i64 = row.get(1)?;
    Ok(AppSettings {
        backup_retention: backup_retention.max(0) as u32,
        dark_mode: dark_mode != 0,
        country_flag_display: row.get(2)?,
        left_sidebar_default: row.get(3)?,
        right_sidebar_default: row.get(4)?,
        import_source_path: row.get(5)?,
        cover_source_path: row.get(6)?,
        billboard_source_path: row.get(7)?,
        billboard_singles_source_path: row.get(8)?,
        musicbrainz_cache_path: row.get(9)?,
        musicbrainz_overlay_sync_path: row.get(10)?,
        musicbrainz_overlay_auto_sync_minutes: row.get::<_, i64>(11)?.max(0) as u32,
        update_auto_check_minutes: row.get::<_, i64>(12)?.max(0) as u32,
        updated_at: row.get(13)?,
    })
}

fn normalize_settings(mut settings: AppSettings) -> AppSettings {
    settings.backup_retention = settings
        .backup_retention
        .clamp(MIN_BACKUP_RETENTION, MAX_BACKUP_RETENTION);
    settings.country_flag_display = normalize_country_flag_display(&settings.country_flag_display);
    settings.left_sidebar_default = normalize_left_sidebar_default(&settings.left_sidebar_default);
    settings.right_sidebar_default =
        normalize_right_sidebar_default(&settings.right_sidebar_default);
    settings.import_source_path =
        normalize_import_path(&settings.import_source_path, DEFAULT_IMPORT_SOURCE_PATH);
    settings.cover_source_path =
        normalize_import_path(&settings.cover_source_path, DEFAULT_COVER_SOURCE_PATH);
    settings.billboard_source_path = normalize_import_path(
        &settings.billboard_source_path,
        DEFAULT_BILLBOARD_SOURCE_PATH,
    );
    settings.billboard_singles_source_path = normalize_import_path(
        &settings.billboard_singles_source_path,
        DEFAULT_BILLBOARD_SINGLES_SOURCE_PATH,
    );
    settings.musicbrainz_cache_path =
        normalize_musicbrainz_cache_path(&settings.musicbrainz_cache_path);
    settings.musicbrainz_overlay_sync_path =
        normalize_musicbrainz_overlay_sync_path(&settings.musicbrainz_overlay_sync_path);
    settings.musicbrainz_overlay_auto_sync_minutes = settings
        .musicbrainz_overlay_auto_sync_minutes
        .min(MAX_MUSICBRAINZ_OVERLAY_AUTO_SYNC_MINUTES);
    settings.update_auto_check_minutes = settings
        .update_auto_check_minutes
        .min(MAX_UPDATE_AUTO_CHECK_MINUTES);
    settings
}

fn normalize_country_flag_display(value: &str) -> String {
    match value {
        "flagAndName" | "name" | "flag" => value.to_string(),
        _ => DEFAULT_COUNTRY_FLAG_DISPLAY.to_string(),
    }
}

fn normalize_left_sidebar_default(value: &str) -> String {
    match value {
        "expanded" | "iconOnly" | "hidden" => value.to_string(),
        _ => "expanded".to_string(),
    }
}

fn normalize_right_sidebar_default(value: &str) -> String {
    match value {
        "expanded" | "hidden" => value.to_string(),
        _ => "expanded".to_string(),
    }
}

fn normalize_import_path(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

pub(super) fn normalize_musicbrainz_cache_path(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        DEFAULT_MUSICBRAINZ_CACHE_PATH.to_string()
    } else {
        trimmed.to_string()
    }
}

fn normalize_musicbrainz_overlay_sync_path(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        DEFAULT_MUSICBRAINZ_OVERLAY_SYNC_PATH.to_string()
    } else {
        trimmed.to_string()
    }
}
