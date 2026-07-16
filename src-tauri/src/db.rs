#[cfg(test)]
use crate::models::AppSettings;
use crate::models::{
    ArtistListRequest, ArtistListResponse, ArtistSummary, BillboardImportSummary,
    BillboardSinglesImportSummary, BrowseFilters, BrowseRequest, BrowseResponse, BrowseRow,
    BrowseSort, CatalogConcentrationStats, ChartConfig, ConcentrationPoint, DecadeProgressStats,
    DiscoveryAlbumPoint, DiscoveryArtistPoint, DiscoveryGenrePoint, DiscoveryHeatmapCell,
    DiscoveryMission, DiscoveryResponse, DurationAlbumStat, DurationAnalyticsStats,
    ExportMusicToolRequest, ExportResult, ExportSearchRequest, GenreListRequest, GenreListResponse,
    GenreProgressStats, GenreSummary, ImportRun, LibraryHealthScore, LibraryOverviewStats,
    LibraryShapeStats, LibraryStatus, LovedDensityStat, LovedTrackStats, MetadataCoverageMetric,
    MusicBrainzOriginCountryOption, MusicToolFixRequest, MusicToolFixSummary,
    MusicToolIssueRequest, MusicToolIssueResponse, MusicToolIssueRow, MusicToolProgress,
    MusicToolSummary, OutlierStat, PerformanceProbeOperation, PerformanceProbeResponse,
    RatingBucket, RatingEvent, RatingHistoryPoint, RatingProgressStats, SaveChartRequest,
    SaveSearchRequest, SavedChart, SavedSearch, StatisticsResponse, TextFilter, YearProgressStats,
};
use anyhow::{anyhow, bail, Context, Result};
use chrono::{Datelike, Utc};
use rusqlite::{params, params_from_iter, types::Value, Connection, OpenFlags, OptionalExtension};
use rust_xlsxwriter::{Format, Workbook};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::thread;
use std::time::{Duration, Instant};
#[cfg(not(test))]
use tauri::{AppHandle, Emitter, Manager};

#[cfg(not(test))]
type ProgressApp<'a> = &'a AppHandle;
#[cfg(test)]
type ProgressApp<'a> = &'a ();
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

mod backups;
mod migrations;
mod settings;
use backups::create_database_file_backup;
#[cfg(test)]
use backups::{backup_directory_for_db_path, list_database_backups, restore_database_backup};
#[cfg(not(test))]
pub(crate) use backups::{list_database_backups_for_app, restore_database_backup_for_app};
use migrations::LATEST_SCHEMA_VERSION;
use settings::normalize_musicbrainz_cache_path;
#[cfg(test)]
use settings::save_settings_for_connection;
pub(crate) use settings::settings_for_connection;
#[cfg(not(test))]
pub(crate) use settings::{save_settings_for_app, settings_for_app};

const DB_FILE_NAME: &str = "music-library.sqlite3";
const DEFAULT_BACKUP_RETENTION: u32 = 3;
const DEFAULT_IMPORT_SOURCE_PATH: &str = "musicbee-library.tsv";
const DEFAULT_COVER_SOURCE_PATH: &str = "AlbumCovers";
const DEFAULT_BILLBOARD_SOURCE_PATH: &str = "CSV";
const DEFAULT_BILLBOARD_SINGLES_SOURCE_PATH: &str = "CSV_SINGLES";
const DEFAULT_MUSICBRAINZ_CACHE_PATH: &str = "MusicBrainz/musicbrainz_cache.db";
const DEFAULT_MUSICBRAINZ_OVERLAY_SYNC_PATH: &str = "";
const DEFAULT_COUNTRY_FLAG_DISPLAY: &str = "flagAndName";
const MUSICBRAINZ_SUSPICIOUS_RELEASE_GROUP_THRESHOLD: i64 = 150;
const MAX_MUSICBRAINZ_OVERLAY_AUTO_SYNC_MINUTES: u32 = 1440;
const MAX_UPDATE_AUTO_CHECK_MINUTES: u32 = 1440;
const MIN_BACKUP_RETENTION: u32 = 1;
const MAX_BACKUP_RETENTION: u32 = 50;
const SCORE_GENRE_GROUP: &[&str] = &[
    "action",
    "animation",
    "comedy",
    "documentary",
    "drama",
    "fantasy",
    "horror",
    "sci-fi",
    "thriller",
    "tv",
    "video game",
    "western",
    "anime",
];
static MIGRATION_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Copy)]
struct MusicToolDefinition {
    id: &'static str,
    label: &'static str,
    description: &'static str,
    severity: &'static str,
    scope: &'static str,
}

#[derive(Debug, Clone)]
struct BillboardChartEntry {
    source_file: String,
    artist: String,
    album: String,
    artist_key: String,
    album_key: String,
    rank: i32,
    year: i32,
}

#[derive(Debug, Clone)]
struct BillboardSingleChartEntry {
    source_file: String,
    artist: String,
    featured: String,
    display_artist: String,
    title: String,
    primary_artist_key: String,
    artist_key: String,
    title_key: String,
    rank: i32,
    year: i32,
}

#[derive(Debug, Clone)]
struct BackupMetadata {
    id: i64,
    created_at: String,
    operation: String,
    source_path: Option<String>,
    source_size_bytes: i64,
    backup_path: String,
    track_rows: Option<i64>,
    album_count: Option<i64>,
}

struct PerformanceProbeSample {
    total_count: Option<i64>,
    row_count: Option<usize>,
    detail: String,
}

const WHITESPACE_ANOMALY_CONDITION_SQL: &str = "
    COALESCE(t.album, '') GLOB '*  *' OR
    COALESCE(t.album_artist_display, '') GLOB '*  *' OR
    COALESCE(t.display_artist, '') GLOB '*  *' OR
    COALESCE(t.title, '') GLOB '*  *' OR
    COALESCE(t.genre, '') GLOB '*  *' OR
    COALESCE(t.canonical_genre, '') GLOB '*  *' OR
    COALESCE(t.publisher, '') GLOB '*  *' OR
    COALESCE(t.file_path, '') GLOB '*  *' OR
    COALESCE(t.filename, '') GLOB '*  *'
";

const MUSIC_TOOLS: &[MusicToolDefinition] = &[
    MusicToolDefinition {
        id: "duplicate-albums",
        label: "Duplicate albums",
        description: "Potential duplicate album versions with the same artist, title, and year.",
        severity: "medium",
        scope: "albums",
    },
    MusicToolDefinition {
        id: "albums-without-cover-image",
        label: "Albums without embedded cover image",
        description: "Albums missing an imported archive or embedded cover image record.",
        severity: "low",
        scope: "albums",
    },
    MusicToolDefinition {
        id: "missing-billboard-albums",
        label: "Missing Billboard Albums",
        description: "Imported Billboard chart albums that are not linked to any library album.",
        severity: "low",
        scope: "albums",
    },
    MusicToolDefinition {
        id: "missing-billboard-singles",
        label: "Missing Billboard Singles",
        description: "Imported Billboard chart singles that are not linked to any library track.",
        severity: "low",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "artists-without-musicbrainz-data",
        label: "Artists without MusicBrainz data",
        description:
            "Library album artists without a usable MusicBrainz cache or verified overlay match.",
        severity: "medium",
        scope: "artists",
    },
    MusicToolDefinition {
        id: "high-confidence-missing-musicbrainz-albums",
        label: "High-confidence missing MusicBrainz albums",
        description:
            "Collection-wide missing pure official MusicBrainz albums from trusted artist matches.",
        severity: "low",
        scope: "albums",
    },
    MusicToolDefinition {
        id: "duplicates-within-album",
        label: "Duplicates within album",
        description: "Tracks that repeat a title or disc/track position inside one album.",
        severity: "high",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "invalid-time-values",
        label: "Invalid time values",
        description: "Tracks where duration could not be parsed into seconds.",
        severity: "high",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "non-numeric-ratings",
        label: "Non-numeric ratings",
        description: "Track ratings that contain non-numeric text.",
        severity: "medium",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "missing-tags",
        label: "Missing tags",
        description: "Tracks missing required album, artist, title, genre, year, or file tags.",
        severity: "high",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "non-mp3-files",
        label: "Non-MP3 files",
        description: "Tracks whose filenames do not end in .mp3.",
        severity: "low",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "year-anomalies",
        label: "Year anomalies",
        description: "Tracks with missing or implausible canonical year values.",
        severity: "medium",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "ratings-out-of-range",
        label: "Ratings out of range",
        description: "Numeric ratings that are not whole-number values from 0 to 5.",
        severity: "high",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "track-disc-number-issues",
        label: "Track/disc number issues",
        description: "Tracks with missing, zero, or negative disc and track numbers.",
        severity: "medium",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "inconsistent-album-metadata",
        label: "Inconsistent album metadata",
        description: "Albums whose tracks disagree on title, genre, or publisher.",
        severity: "medium",
        scope: "albums",
    },
    MusicToolDefinition {
        id: "whitespace-anomalies",
        label: "Whitespace anomalies",
        description: "Track metadata with repeated internal spaces.",
        severity: "low",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "genre-normalization-issues",
        label: "Genre normalization issues",
        description:
            "Tracks with multi-value genre strings that were collapsed to one canonical genre.",
        severity: "low",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "conflicting-album-artists",
        label: "Conflicting album artists",
        description: "Albums whose tracks disagree on album artist.",
        severity: "high",
        scope: "albums",
    },
    MusicToolDefinition {
        id: "multiple-years-per-album",
        label: "Multiple years per album",
        description: "Albums containing tracks with more than one canonical year.",
        severity: "medium",
        scope: "albums",
    },
];

#[cfg(not(test))]
pub fn database_path(app: &AppHandle) -> Result<PathBuf> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .context("Could not resolve the app data directory")?;
    fs::create_dir_all(&app_data_dir).context("Could not create the app data directory")?;
    Ok(app_data_dir.join(DB_FILE_NAME))
}

#[cfg(not(test))]
pub fn open(app: &AppHandle) -> Result<(Connection, PathBuf)> {
    let db_path = database_path(app)?;
    let conn = Connection::open(&db_path)
        .with_context(|| format!("Could not open SQLite database at {}", db_path.display()))?;
    configure(&conn)?;
    migrate(&conn)?;
    Ok((conn, db_path))
}

pub fn configure(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        PRAGMA busy_timeout = 15000;
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA temp_store = MEMORY;
        ",
    )
    .context("Could not configure SQLite pragmas")?;
    Ok(())
}

pub fn migrate(conn: &Connection) -> Result<()> {
    let _migration_guard = MIGRATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let user_version = conn
        .query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
        .context("Could not read SQLite schema version")?;

    if user_version >= LATEST_SCHEMA_VERSION && migrations::phase_twenty_schema_exists(conn)? {
        return Ok(());
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS import_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_path TEXT NOT NULL,
            source_size_bytes INTEGER NOT NULL DEFAULT 0,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            status TEXT NOT NULL,
            track_rows INTEGER NOT NULL DEFAULT 0,
            album_count INTEGER NOT NULL DEFAULT 0,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            backup_path TEXT,
            error_message TEXT,
            added_tracks INTEGER NOT NULL DEFAULT 0,
            changed_tracks INTEGER NOT NULL DEFAULT 0,
            removed_tracks INTEGER NOT NULL DEFAULT 0,
            added_albums INTEGER NOT NULL DEFAULT 0,
            changed_albums INTEGER NOT NULL DEFAULT 0,
            removed_albums INTEGER NOT NULL DEFAULT 0,
            rating_events_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS database_backups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            operation TEXT NOT NULL,
            source_path TEXT,
            source_size_bytes INTEGER NOT NULL DEFAULT 0,
            backup_path TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS raw_tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_run_id INTEGER NOT NULL REFERENCES import_runs(id),
            row_number INTEGER NOT NULL,
            display_artist TEXT,
            album_rating TEXT,
            disc_number TEXT,
            album TEXT,
            genre TEXT,
            love TEXT,
            publisher TEXT,
            rating TEXT,
            title TEXT,
            track_number TEXT,
            year_value TEXT,
            release_year TEXT,
            album_unique_id TEXT,
            file_path TEXT,
            filename TEXT,
            album_artist_display TEXT,
            time_value TEXT,
            row_hash TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_run_id INTEGER NOT NULL REFERENCES import_runs(id),
            album_id TEXT NOT NULL,
            album_unique_id TEXT,
            display_artist TEXT,
            album_artist_display TEXT,
            album TEXT,
            title TEXT,
            genre TEXT,
            canonical_genre TEXT,
            genre_normalized TEXT,
            publisher TEXT,
            love TEXT,
            rating_raw TEXT,
            normalized_rating INTEGER,
            album_rating_raw TEXT,
            album_rating INTEGER,
            disc_number INTEGER,
            track_number INTEGER,
            year INTEGER,
            release_year INTEGER,
            time_seconds INTEGER,
            file_path TEXT,
            filename TEXT,
            billboard_single_rank INTEGER,
            billboard_single_year INTEGER,
            row_hash TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS albums (
            id TEXT PRIMARY KEY,
            import_run_id INTEGER NOT NULL REFERENCES import_runs(id),
            album_unique_id TEXT,
            album TEXT,
            album_artist_display TEXT,
            canonical_genre TEXT,
            genre_normalized TEXT,
            publisher TEXT,
            year INTEGER,
            release_year INTEGER,
            total_tracks INTEGER NOT NULL,
            rated_tracks INTEGER NOT NULL,
            rating_completeness REAL NOT NULL,
            total_seconds INTEGER NOT NULL,
            loved_tracks INTEGER NOT NULL,
            tmoe_seconds INTEGER NOT NULL,
            ae_ratio REAL NOT NULL,
            album_rating INTEGER,
            calculated_album_rating INTEGER,
            effective_album_rating INTEGER,
            album_score REAL,
            billboard_rank INTEGER,
            billboard_year INTEGER
        );

        CREATE TABLE IF NOT EXISTS album_covers (
            album_id TEXT PRIMARY KEY,
            source TEXT NOT NULL,
            source_path TEXT,
            cache_path TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            extension TEXT NOT NULL,
            file_size_bytes INTEGER NOT NULL DEFAULT 0,
            imported_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS billboard_chart_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            year INTEGER NOT NULL,
            rank INTEGER NOT NULL,
            artist TEXT NOT NULL,
            album TEXT NOT NULL,
            artist_key TEXT NOT NULL,
            album_key TEXT NOT NULL,
            matched_album_id TEXT REFERENCES albums(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS billboard_single_chart_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            year INTEGER NOT NULL,
            rank INTEGER NOT NULL,
            artist TEXT NOT NULL,
            featured TEXT,
            display_artist TEXT NOT NULL,
            title TEXT NOT NULL,
            artist_key TEXT NOT NULL,
            title_key TEXT NOT NULL,
            matched_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_tracks_album_id ON tracks(album_id);
        CREATE INDEX IF NOT EXISTS idx_tracks_year ON tracks(year);
        CREATE INDEX IF NOT EXISTS idx_tracks_rating ON tracks(normalized_rating);
        CREATE INDEX IF NOT EXISTS idx_tracks_love ON tracks(love);
        CREATE INDEX IF NOT EXISTS idx_tracks_file ON tracks(file_path, filename);
        CREATE INDEX IF NOT EXISTS idx_albums_unique_id ON albums(album_unique_id);
        CREATE INDEX IF NOT EXISTS idx_albums_year ON albums(year);
        CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(album_artist_display);
        CREATE INDEX IF NOT EXISTS idx_albums_genre ON albums(genre_normalized);
        CREATE INDEX IF NOT EXISTS idx_albums_total_seconds ON albums(total_seconds);
        CREATE INDEX IF NOT EXISTS idx_albums_rating_completeness ON albums(rating_completeness);
        CREATE INDEX IF NOT EXISTS idx_albums_album_score ON albums(album_score);
        CREATE INDEX IF NOT EXISTS idx_album_covers_imported_at ON album_covers(imported_at);
        CREATE INDEX IF NOT EXISTS idx_billboard_chart_entries_match
            ON billboard_chart_entries(matched_album_id);
        CREATE INDEX IF NOT EXISTS idx_billboard_chart_entries_year_rank
            ON billboard_chart_entries(year, rank);
        CREATE INDEX IF NOT EXISTS idx_billboard_single_chart_entries_match
            ON billboard_single_chart_entries(matched_track_id);
        CREATE INDEX IF NOT EXISTS idx_billboard_single_chart_entries_year_rank
            ON billboard_single_chart_entries(year, rank);

        CREATE VIRTUAL TABLE IF NOT EXISTS album_search_fts USING fts5(
            album_id UNINDEXED,
            album,
            album_artist_display,
            canonical_genre,
            publisher
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS track_search_fts USING fts5(
            track_id UNINDEXED,
            album_id UNINDEXED,
            title,
            display_artist,
            album,
            album_artist_display,
            canonical_genre,
            publisher,
            file_path,
            filename
        );

        CREATE TABLE IF NOT EXISTS saved_queries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            view TEXT NOT NULL,
            request_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS saved_charts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            config_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS exports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            view TEXT NOT NULL,
            format TEXT NOT NULL,
            row_count INTEGER NOT NULL,
            path TEXT NOT NULL,
            request_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS rating_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_run_id INTEGER NOT NULL REFERENCES import_runs(id),
            created_at TEXT NOT NULL,
            track_count INTEGER NOT NULL DEFAULT 0,
            album_count INTEGER NOT NULL DEFAULT 0,
            rated_tracks INTEGER NOT NULL DEFAULT 0,
            unrated_tracks INTEGER NOT NULL DEFAULT 0,
            fully_rated_albums INTEGER NOT NULL DEFAULT 0,
            partially_rated_albums INTEGER NOT NULL DEFAULT 0,
            unrated_albums INTEGER NOT NULL DEFAULT 0,
            albums_with_effective_rating INTEGER NOT NULL DEFAULT 0,
            average_album_rating REAL,
            average_album_score REAL
        );

        CREATE INDEX IF NOT EXISTS idx_rating_snapshots_import_run
            ON rating_snapshots(import_run_id);

        CREATE TABLE IF NOT EXISTS rating_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_run_id INTEGER NOT NULL REFERENCES import_runs(id),
            created_at TEXT NOT NULL,
            event_type TEXT NOT NULL,
            album_id TEXT NOT NULL,
            album TEXT,
            album_artist_display TEXT,
            year INTEGER,
            previous_rated_tracks INTEGER,
            current_rated_tracks INTEGER,
            previous_rating_completeness REAL,
            current_rating_completeness REAL,
            previous_effective_album_rating INTEGER,
            current_effective_album_rating INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_rating_events_import_run
            ON rating_events(import_run_id);
        CREATE INDEX IF NOT EXISTS idx_rating_events_created_at
            ON rating_events(created_at);

        CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            backup_retention INTEGER NOT NULL DEFAULT 3,
            dark_mode INTEGER NOT NULL DEFAULT 0,
            country_flag_display TEXT NOT NULL DEFAULT 'flagAndName',
            left_sidebar_default TEXT NOT NULL DEFAULT 'expanded',
            right_sidebar_default TEXT NOT NULL DEFAULT 'expanded',
            import_source_path TEXT NOT NULL DEFAULT 'musicbee-library.tsv',
            cover_source_path TEXT NOT NULL DEFAULT 'AlbumCovers',
            billboard_source_path TEXT NOT NULL DEFAULT 'CSV',
            billboard_singles_source_path TEXT NOT NULL DEFAULT 'CSV_SINGLES',
            musicbrainz_cache_path TEXT NOT NULL DEFAULT 'MusicBrainz/musicbrainz_cache.db',
            musicbrainz_overlay_sync_path TEXT NOT NULL DEFAULT '',
            musicbrainz_overlay_auto_sync_minutes INTEGER NOT NULL DEFAULT 0,
            update_auto_check_minutes INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_links (
            local_artist_key TEXT PRIMARY KEY,
            display_artist TEXT NOT NULL,
            mbid TEXT,
            canonical_name TEXT,
            match_method TEXT NOT NULL DEFAULT 'unverified',
            confidence REAL,
            verification_state TEXT NOT NULL DEFAULT 'unverified',
            ignored INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS musicbrainz_release_decisions (
            local_artist_key TEXT NOT NULL,
            release_mbid TEXT NOT NULL,
            decision TEXT NOT NULL,
            local_album_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (local_artist_key, release_mbid),
            FOREIGN KEY(local_artist_key) REFERENCES musicbrainz_artist_links(local_artist_key)
                ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_links_mbid
            ON musicbrainz_artist_links(mbid);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_release_decisions_decision
            ON musicbrainz_release_decisions(decision);

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_link_tombstones (
            local_artist_key TEXT PRIMARY KEY,
            display_artist TEXT,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS musicbrainz_release_decision_tombstones (
            local_artist_key TEXT NOT NULL,
            release_mbid TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (local_artist_key, release_mbid)
        );

        CREATE TABLE IF NOT EXISTS musicbrainz_overlay_sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            synced_at TEXT NOT NULL,
            sync_path TEXT NOT NULL,
            imported_count INTEGER NOT NULL DEFAULT 0,
            exported_count INTEGER NOT NULL DEFAULT 0,
            changed_count INTEGER NOT NULL DEFAULT 0,
            summary TEXT NOT NULL,
            artist_links_imported INTEGER NOT NULL DEFAULT 0,
            artist_links_exported INTEGER NOT NULL DEFAULT 0,
            artist_unlinks_imported INTEGER NOT NULL DEFAULT 0,
            artist_unlinks_exported INTEGER NOT NULL DEFAULT 0,
            release_decisions_imported INTEGER NOT NULL DEFAULT 0,
            release_decisions_exported INTEGER NOT NULL DEFAULT 0,
            release_decision_clears_imported INTEGER NOT NULL DEFAULT 0,
            release_decision_clears_exported INTEGER NOT NULL DEFAULT 0,
            release_statuses_imported INTEGER NOT NULL DEFAULT 0,
            release_statuses_exported INTEGER NOT NULL DEFAULT 0,
            release_groups_imported INTEGER NOT NULL DEFAULT 0,
            release_groups_exported INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_overlay_sync_log_synced
            ON musicbrainz_overlay_sync_log(synced_at);

        CREATE TABLE IF NOT EXISTS musicbrainz_release_status_cache (
            artist_mbid TEXT NOT NULL,
            release_mbid TEXT NOT NULL,
            has_official_release INTEGER NOT NULL,
            checked_at TEXT NOT NULL,
            PRIMARY KEY (artist_mbid, release_mbid)
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_release_status_cache_checked
            ON musicbrainz_release_status_cache(checked_at);

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_release_groups (
            artist_mbid TEXT NOT NULL,
            release_mbid TEXT NOT NULL,
            title TEXT NOT NULL,
            year INTEGER,
            type TEXT,
            secondary_types TEXT NOT NULL DEFAULT '',
            track_count INTEGER,
            status TEXT NOT NULL DEFAULT 'Official',
            source TEXT NOT NULL DEFAULT 'musicbrainz-live',
            fetched_at TEXT NOT NULL,
            PRIMARY KEY (artist_mbid, release_mbid)
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_release_groups_artist
            ON musicbrainz_artist_release_groups(artist_mbid);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_release_groups_fetched
            ON musicbrainz_artist_release_groups(fetched_at);

        CREATE TABLE IF NOT EXISTS musicbrainz_origin_countries (
            country_code TEXT PRIMARY KEY,
            country_name TEXT NOT NULL,
            area_mbid TEXT,
            iso_source TEXT NOT NULL DEFAULT 'musicbrainz',
            is_historical INTEGER NOT NULL DEFAULT 0,
            is_special INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_origin_countries (
            local_artist_key TEXT PRIMARY KEY,
            display_artist TEXT NOT NULL,
            mbid TEXT NOT NULL,
            country_code TEXT,
            country_name TEXT,
            raw_area_mbid TEXT,
            raw_area_name TEXT,
            raw_area_type TEXT,
            begin_area_mbid TEXT,
            begin_area_name TEXT,
            begin_area_type TEXT,
            derived_from TEXT NOT NULL DEFAULT 'unresolved',
            confidence REAL,
            review_state TEXT NOT NULL DEFAULT 'unresolved',
            source TEXT NOT NULL DEFAULT 'musicbrainz-live',
            fetched_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(country_code) REFERENCES musicbrainz_origin_countries(country_code)
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_origin_local_artist
            ON musicbrainz_artist_origin_countries(local_artist_key);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_origin_country
            ON musicbrainz_artist_origin_countries(country_code);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_origin_mbid
            ON musicbrainz_artist_origin_countries(mbid);

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_origin_import_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scope TEXT NOT NULL DEFAULT 'eligible',
            status TEXT NOT NULL,
            total_artists INTEGER NOT NULL DEFAULT 0,
            eligible_count INTEGER NOT NULL DEFAULT 0,
            fetched_count INTEGER NOT NULL DEFAULT 0,
            skipped_count INTEGER NOT NULL DEFAULT 0,
            unresolved_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            last_processed_artist_key TEXT,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            error_summary TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_origin_import_runs_started
            ON musicbrainz_artist_origin_import_runs(started_at);

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_infos (
            local_artist_key TEXT PRIMARY KEY,
            display_artist TEXT NOT NULL,
            mbid TEXT NOT NULL,
            sort_name TEXT,
            artist_type TEXT,
            gender TEXT,
            life_begin_date TEXT,
            life_begin_year INTEGER,
            life_end_date TEXT,
            life_end_year INTEGER,
            life_ended INTEGER,
            area_mbid TEXT,
            area_name TEXT,
            area_type TEXT,
            begin_area_mbid TEXT,
            begin_area_name TEXT,
            begin_area_type TEXT,
            end_area_mbid TEXT,
            end_area_name TEXT,
            end_area_type TEXT,
            review_state TEXT NOT NULL DEFAULT 'unresolved',
            source TEXT NOT NULL DEFAULT 'musicbrainz-live',
            fetched_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_mbid
            ON musicbrainz_artist_infos(mbid);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_type
            ON musicbrainz_artist_infos(artist_type);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_gender
            ON musicbrainz_artist_infos(gender);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_begin_year
            ON musicbrainz_artist_infos(life_begin_year);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_end_year
            ON musicbrainz_artist_infos(life_end_year);

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_info_import_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scope TEXT NOT NULL DEFAULT 'eligible',
            status TEXT NOT NULL,
            total_artists INTEGER NOT NULL DEFAULT 0,
            eligible_count INTEGER NOT NULL DEFAULT 0,
            fetched_count INTEGER NOT NULL DEFAULT 0,
            skipped_count INTEGER NOT NULL DEFAULT 0,
            unresolved_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            last_processed_artist_key TEXT,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            error_summary TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_info_import_runs_started
            ON musicbrainz_artist_info_import_runs(started_at);

        INSERT OR IGNORE INTO app_settings (
            id, backup_retention, dark_mode, updated_at
        ) VALUES (
            1, 3, 0, datetime('now')
        );
        ",
    )
    .map_err(|error| anyhow!("Could not run SQLite migrations: {error}"))?;
    ensure_import_run_change_columns(conn)?;
    ensure_app_settings_layout_columns(conn)?;
    ensure_app_settings_import_columns(conn)?;
    ensure_album_billboard_columns(conn)?;
    ensure_billboard_chart_entries_table(conn)?;
    ensure_track_billboard_single_columns(conn)?;
    ensure_billboard_single_chart_entries_table(conn)?;
    ensure_app_settings_musicbrainz_columns(conn)?;
    ensure_app_settings_musicbrainz_sync_columns(conn)?;
    ensure_app_settings_update_columns(conn)?;
    ensure_app_settings_country_flag_display_column(conn)?;
    ensure_musicbrainz_decision_tables(conn)?;
    ensure_musicbrainz_tombstone_tables(conn)?;
    ensure_musicbrainz_overlay_sync_log(conn)?;
    ensure_musicbrainz_release_status_cache(conn)?;
    ensure_musicbrainz_artist_release_groups(conn)?;
    ensure_musicbrainz_origin_country_tables(conn)?;
    ensure_musicbrainz_artist_info_tables(conn)?;
    migrations::migrate_portable_overlay_sync_default(conn)?;
    conn.execute_batch("PRAGMA user_version = 20;")
        .context("Could not update SQLite schema version")?;
    Ok(())
}

fn phase_nineteen_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_eighteen_schema_exists(conn)?
        && schema_table_exists(conn, "musicbrainz_artist_infos")?
        && schema_table_exists(conn, "musicbrainz_artist_info_import_runs")?)
}

fn phase_eighteen_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_seventeen_schema_exists(conn)?
        && schema_column_exists(conn, "app_settings", "country_flag_display")?)
}

fn phase_seventeen_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_sixteen_schema_exists(conn)?
        && schema_table_exists(conn, "musicbrainz_origin_countries")?
        && schema_table_exists(conn, "musicbrainz_artist_origin_countries")?
        && schema_table_exists(conn, "musicbrainz_artist_origin_import_runs")?)
}

fn phase_sixteen_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_fifteen_schema_exists(conn)?
        && schema_column_exists(conn, "app_settings", "import_source_path")?
        && schema_column_exists(conn, "app_settings", "cover_source_path")?
        && schema_column_exists(conn, "app_settings", "billboard_source_path")?
        && schema_column_exists(conn, "app_settings", "billboard_singles_source_path")?)
}

fn phase_fifteen_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_fourteen_schema_exists(conn)?
        && schema_column_exists(conn, "app_settings", "update_auto_check_minutes")?)
}

fn phase_fourteen_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirteen_schema_exists(conn)?
        && schema_column_exists(conn, "app_settings", "musicbrainz_overlay_sync_path")?
        && schema_column_exists(
            conn,
            "app_settings",
            "musicbrainz_overlay_auto_sync_minutes",
        )?
        && schema_table_exists(conn, "musicbrainz_artist_link_tombstones")?
        && schema_table_exists(conn, "musicbrainz_release_decision_tombstones")?
        && schema_table_exists(conn, "musicbrainz_overlay_sync_log")?)
}

fn phase_thirteen_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twelve_schema_exists(conn)?
        && schema_table_exists(conn, "musicbrainz_artist_release_groups")?)
}

fn phase_twelve_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_eleven_schema_exists(conn)?
        && schema_table_exists(conn, "musicbrainz_release_status_cache")?)
}

fn phase_eleven_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_ten_schema_exists(conn)?
        && schema_column_exists(conn, "app_settings", "musicbrainz_cache_path")?
        && schema_table_exists(conn, "musicbrainz_artist_links")?
        && schema_table_exists(conn, "musicbrainz_release_decisions")?)
}

fn phase_ten_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_nine_schema_exists(conn)?
        && schema_column_exists(conn, "tracks", "billboard_single_rank")?
        && schema_column_exists(conn, "tracks", "billboard_single_year")?
        && schema_table_exists(conn, "billboard_single_chart_entries")?
        && schema_column_exists(conn, "billboard_single_chart_entries", "matched_track_id")?)
}

fn phase_nine_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_eight_schema_exists(conn)?
        && schema_table_exists(conn, "billboard_chart_entries")?
        && schema_column_exists(conn, "billboard_chart_entries", "matched_album_id")?)
}

fn phase_eight_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_seven_schema_exists(conn)?
        && schema_column_exists(conn, "albums", "billboard_rank")?
        && schema_column_exists(conn, "albums", "billboard_year")?)
}

fn phase_seven_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_six_schema_exists(conn)?
        && schema_column_exists(conn, "app_settings", "left_sidebar_default")?
        && schema_column_exists(conn, "app_settings", "right_sidebar_default")?)
}

fn phase_six_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_five_schema_exists(conn)?
        && schema_table_exists(conn, "album_covers")?
        && schema_column_exists(conn, "album_covers", "cache_path")?
        && schema_column_exists(conn, "album_covers", "mime_type")?)
}

fn phase_five_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_four_schema_exists(conn)?
        && schema_table_exists(conn, "app_settings")?
        && schema_column_exists(conn, "app_settings", "backup_retention")?
        && schema_column_exists(conn, "app_settings", "dark_mode")?
        && schema_column_exists(conn, "app_settings", "updated_at")?)
}

fn phase_four_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_three_schema_exists(conn)?
        && schema_table_exists(conn, "rating_snapshots")?
        && schema_table_exists(conn, "rating_events")?
        && schema_column_exists(conn, "import_runs", "rating_events_count")?)
}

fn phase_three_schema_exists(conn: &Connection) -> Result<bool> {
    [
        "album_search_fts",
        "track_search_fts",
        "saved_queries",
        "saved_charts",
        "exports",
    ]
    .into_iter()
    .map(|name| schema_table_exists(conn, name))
    .try_fold(true, |all_exist, exists| {
        exists.map(|exists| all_exist && exists)
    })
}

fn schema_table_exists(conn: &Connection, name: &str) -> Result<bool> {
    conn.query_row(
        "
        SELECT EXISTS(
            SELECT 1
            FROM sqlite_master
            WHERE type = 'table' AND name = ?1
        )
        ",
        params![name],
        |row| row.get::<_, bool>(0),
    )
    .with_context(|| format!("Could not inspect SQLite schema object {name}"))
}

fn ensure_import_run_change_columns(conn: &Connection) -> Result<()> {
    for (name, definition) in [
        ("added_tracks", "INTEGER NOT NULL DEFAULT 0"),
        ("changed_tracks", "INTEGER NOT NULL DEFAULT 0"),
        ("removed_tracks", "INTEGER NOT NULL DEFAULT 0"),
        ("added_albums", "INTEGER NOT NULL DEFAULT 0"),
        ("changed_albums", "INTEGER NOT NULL DEFAULT 0"),
        ("removed_albums", "INTEGER NOT NULL DEFAULT 0"),
        ("rating_events_count", "INTEGER NOT NULL DEFAULT 0"),
    ] {
        if !schema_column_exists(conn, "import_runs", name)? {
            let sql = format!("ALTER TABLE import_runs ADD COLUMN {name} {definition}");
            conn.execute_batch(&sql)
                .with_context(|| format!("Could not add import_runs.{name}"))?;
        }
    }

    Ok(())
}

fn ensure_app_settings_layout_columns(conn: &Connection) -> Result<()> {
    for (name, definition) in [
        ("left_sidebar_default", "TEXT NOT NULL DEFAULT 'expanded'"),
        ("right_sidebar_default", "TEXT NOT NULL DEFAULT 'expanded'"),
    ] {
        if !schema_column_exists(conn, "app_settings", name)? {
            let sql = format!("ALTER TABLE app_settings ADD COLUMN {name} {definition}");
            conn.execute_batch(&sql)
                .with_context(|| format!("Could not add app_settings.{name}"))?;
        }
    }

    Ok(())
}

fn ensure_app_settings_import_columns(conn: &Connection) -> Result<()> {
    for (name, definition) in [
        (
            "import_source_path",
            "TEXT NOT NULL DEFAULT 'musicbee-library.tsv'",
        ),
        ("cover_source_path", "TEXT NOT NULL DEFAULT 'AlbumCovers'"),
        ("billboard_source_path", "TEXT NOT NULL DEFAULT 'CSV'"),
        (
            "billboard_singles_source_path",
            "TEXT NOT NULL DEFAULT 'CSV_SINGLES'",
        ),
    ] {
        if !schema_column_exists(conn, "app_settings", name)? {
            let sql = format!("ALTER TABLE app_settings ADD COLUMN {name} {definition}");
            conn.execute_batch(&sql)
                .with_context(|| format!("Could not add app_settings.{name}"))?;
        }
    }

    Ok(())
}

fn ensure_app_settings_musicbrainz_columns(conn: &Connection) -> Result<()> {
    if !schema_column_exists(conn, "app_settings", "musicbrainz_cache_path")? {
        conn.execute_batch(
            "ALTER TABLE app_settings ADD COLUMN musicbrainz_cache_path TEXT NOT NULL DEFAULT 'MusicBrainz/musicbrainz_cache.db';",
        )
        .context("Could not add app_settings.musicbrainz_cache_path")?;
    }

    Ok(())
}

fn ensure_app_settings_musicbrainz_sync_columns(conn: &Connection) -> Result<()> {
    if !schema_column_exists(conn, "app_settings", "musicbrainz_overlay_sync_path")? {
        conn.execute_batch(
            "ALTER TABLE app_settings ADD COLUMN musicbrainz_overlay_sync_path TEXT NOT NULL DEFAULT '';",
        )
        .context("Could not add app_settings.musicbrainz_overlay_sync_path")?;
    }

    if !schema_column_exists(
        conn,
        "app_settings",
        "musicbrainz_overlay_auto_sync_minutes",
    )? {
        conn.execute_batch(
            "ALTER TABLE app_settings ADD COLUMN musicbrainz_overlay_auto_sync_minutes INTEGER NOT NULL DEFAULT 0;",
        )
        .context("Could not add app_settings.musicbrainz_overlay_auto_sync_minutes")?;
    }

    Ok(())
}

fn ensure_app_settings_update_columns(conn: &Connection) -> Result<()> {
    if !schema_column_exists(conn, "app_settings", "update_auto_check_minutes")? {
        conn.execute_batch(
            "ALTER TABLE app_settings ADD COLUMN update_auto_check_minutes INTEGER NOT NULL DEFAULT 0;",
        )
        .context("Could not add app_settings.update_auto_check_minutes")?;
    }

    Ok(())
}

fn ensure_app_settings_country_flag_display_column(conn: &Connection) -> Result<()> {
    if !schema_column_exists(conn, "app_settings", "country_flag_display")? {
        conn.execute_batch(
            "ALTER TABLE app_settings ADD COLUMN country_flag_display TEXT NOT NULL DEFAULT 'flagAndName';",
        )
        .context("Could not add app_settings.country_flag_display")?;
    }

    Ok(())
}

fn ensure_musicbrainz_decision_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS musicbrainz_artist_links (
            local_artist_key TEXT PRIMARY KEY,
            display_artist TEXT NOT NULL,
            mbid TEXT,
            canonical_name TEXT,
            match_method TEXT NOT NULL DEFAULT 'unverified',
            confidence REAL,
            verification_state TEXT NOT NULL DEFAULT 'unverified',
            ignored INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS musicbrainz_release_decisions (
            local_artist_key TEXT NOT NULL,
            release_mbid TEXT NOT NULL,
            decision TEXT NOT NULL,
            local_album_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (local_artist_key, release_mbid),
            FOREIGN KEY(local_artist_key) REFERENCES musicbrainz_artist_links(local_artist_key)
                ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_links_mbid
            ON musicbrainz_artist_links(mbid);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_release_decisions_decision
            ON musicbrainz_release_decisions(decision);
        ",
    )
    .context("Could not create MusicBrainz decision tables")?;

    Ok(())
}

fn ensure_musicbrainz_tombstone_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS musicbrainz_artist_link_tombstones (
            local_artist_key TEXT PRIMARY KEY,
            display_artist TEXT,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS musicbrainz_release_decision_tombstones (
            local_artist_key TEXT NOT NULL,
            release_mbid TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (local_artist_key, release_mbid)
        );
        ",
    )
    .context("Could not create MusicBrainz sync tombstone tables")?;

    Ok(())
}

fn ensure_musicbrainz_overlay_sync_log(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS musicbrainz_overlay_sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            synced_at TEXT NOT NULL,
            sync_path TEXT NOT NULL,
            imported_count INTEGER NOT NULL DEFAULT 0,
            exported_count INTEGER NOT NULL DEFAULT 0,
            changed_count INTEGER NOT NULL DEFAULT 0,
            summary TEXT NOT NULL,
            artist_links_imported INTEGER NOT NULL DEFAULT 0,
            artist_links_exported INTEGER NOT NULL DEFAULT 0,
            artist_unlinks_imported INTEGER NOT NULL DEFAULT 0,
            artist_unlinks_exported INTEGER NOT NULL DEFAULT 0,
            release_decisions_imported INTEGER NOT NULL DEFAULT 0,
            release_decisions_exported INTEGER NOT NULL DEFAULT 0,
            release_decision_clears_imported INTEGER NOT NULL DEFAULT 0,
            release_decision_clears_exported INTEGER NOT NULL DEFAULT 0,
            release_statuses_imported INTEGER NOT NULL DEFAULT 0,
            release_statuses_exported INTEGER NOT NULL DEFAULT 0,
            release_groups_imported INTEGER NOT NULL DEFAULT 0,
            release_groups_exported INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_overlay_sync_log_synced
            ON musicbrainz_overlay_sync_log(synced_at);
        ",
    )
    .context("Could not create MusicBrainz overlay sync log")?;

    Ok(())
}

fn ensure_musicbrainz_release_status_cache(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS musicbrainz_release_status_cache (
            artist_mbid TEXT NOT NULL,
            release_mbid TEXT NOT NULL,
            has_official_release INTEGER NOT NULL,
            checked_at TEXT NOT NULL,
            PRIMARY KEY (artist_mbid, release_mbid)
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_release_status_cache_checked
            ON musicbrainz_release_status_cache(checked_at);
        ",
    )
    .context("Could not create MusicBrainz release status cache")?;

    Ok(())
}

fn ensure_musicbrainz_artist_release_groups(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS musicbrainz_artist_release_groups (
            artist_mbid TEXT NOT NULL,
            release_mbid TEXT NOT NULL,
            title TEXT NOT NULL,
            year INTEGER,
            type TEXT,
            secondary_types TEXT NOT NULL DEFAULT '',
            track_count INTEGER,
            status TEXT NOT NULL DEFAULT 'Official',
            source TEXT NOT NULL DEFAULT 'musicbrainz-live',
            fetched_at TEXT NOT NULL,
            PRIMARY KEY (artist_mbid, release_mbid)
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_release_groups_artist
            ON musicbrainz_artist_release_groups(artist_mbid);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_release_groups_fetched
            ON musicbrainz_artist_release_groups(fetched_at);
        ",
    )
    .context("Could not create MusicBrainz artist release-group overlay")?;

    Ok(())
}

pub fn ensure_musicbrainz_origin_country_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS musicbrainz_origin_countries (
            country_code TEXT PRIMARY KEY,
            country_name TEXT NOT NULL,
            area_mbid TEXT,
            iso_source TEXT NOT NULL DEFAULT 'musicbrainz',
            is_historical INTEGER NOT NULL DEFAULT 0,
            is_special INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_origin_countries (
            local_artist_key TEXT PRIMARY KEY,
            display_artist TEXT NOT NULL,
            mbid TEXT NOT NULL,
            country_code TEXT,
            country_name TEXT,
            raw_area_mbid TEXT,
            raw_area_name TEXT,
            raw_area_type TEXT,
            begin_area_mbid TEXT,
            begin_area_name TEXT,
            begin_area_type TEXT,
            derived_from TEXT NOT NULL DEFAULT 'unresolved',
            confidence REAL,
            review_state TEXT NOT NULL DEFAULT 'unresolved',
            source TEXT NOT NULL DEFAULT 'musicbrainz-live',
            fetched_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(country_code) REFERENCES musicbrainz_origin_countries(country_code)
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_origin_local_artist
            ON musicbrainz_artist_origin_countries(local_artist_key);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_origin_country
            ON musicbrainz_artist_origin_countries(country_code);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_origin_mbid
            ON musicbrainz_artist_origin_countries(mbid);

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_origin_import_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scope TEXT NOT NULL DEFAULT 'eligible',
            status TEXT NOT NULL,
            total_artists INTEGER NOT NULL DEFAULT 0,
            eligible_count INTEGER NOT NULL DEFAULT 0,
            fetched_count INTEGER NOT NULL DEFAULT 0,
            skipped_count INTEGER NOT NULL DEFAULT 0,
            unresolved_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            last_processed_artist_key TEXT,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            error_summary TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_origin_import_runs_started
            ON musicbrainz_artist_origin_import_runs(started_at);
        ",
    )
    .context("Could not create MusicBrainz artist origin-country tables")?;

    Ok(())
}

pub fn ensure_musicbrainz_artist_info_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS musicbrainz_artist_infos (
            local_artist_key TEXT PRIMARY KEY,
            display_artist TEXT NOT NULL,
            mbid TEXT NOT NULL,
            sort_name TEXT,
            artist_type TEXT,
            gender TEXT,
            life_begin_date TEXT,
            life_begin_year INTEGER,
            life_end_date TEXT,
            life_end_year INTEGER,
            life_ended INTEGER,
            area_mbid TEXT,
            area_name TEXT,
            area_type TEXT,
            begin_area_mbid TEXT,
            begin_area_name TEXT,
            begin_area_type TEXT,
            end_area_mbid TEXT,
            end_area_name TEXT,
            end_area_type TEXT,
            review_state TEXT NOT NULL DEFAULT 'unresolved',
            source TEXT NOT NULL DEFAULT 'musicbrainz-live',
            fetched_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_mbid
            ON musicbrainz_artist_infos(mbid);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_type
            ON musicbrainz_artist_infos(artist_type);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_gender
            ON musicbrainz_artist_infos(gender);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_begin_year
            ON musicbrainz_artist_infos(life_begin_year);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_end_year
            ON musicbrainz_artist_infos(life_end_year);

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_info_import_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scope TEXT NOT NULL DEFAULT 'eligible',
            status TEXT NOT NULL,
            total_artists INTEGER NOT NULL DEFAULT 0,
            eligible_count INTEGER NOT NULL DEFAULT 0,
            fetched_count INTEGER NOT NULL DEFAULT 0,
            skipped_count INTEGER NOT NULL DEFAULT 0,
            unresolved_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            last_processed_artist_key TEXT,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            error_summary TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_info_import_runs_started
            ON musicbrainz_artist_info_import_runs(started_at);
        ",
    )
    .context("Could not create MusicBrainz artist-info tables")?;

    Ok(())
}

fn ensure_album_billboard_columns(conn: &Connection) -> Result<()> {
    for (name, definition) in [("billboard_rank", "INTEGER"), ("billboard_year", "INTEGER")] {
        if !schema_column_exists(conn, "albums", name)? {
            let sql = format!("ALTER TABLE albums ADD COLUMN {name} {definition}");
            conn.execute_batch(&sql)
                .with_context(|| format!("Could not add albums.{name}"))?;
        }
    }

    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_albums_billboard_rank ON albums(billboard_rank);",
    )
    .context("Could not create Billboard rank index")?;

    Ok(())
}

fn ensure_billboard_chart_entries_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS billboard_chart_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            year INTEGER NOT NULL,
            rank INTEGER NOT NULL,
            artist TEXT NOT NULL,
            album TEXT NOT NULL,
            artist_key TEXT NOT NULL,
            album_key TEXT NOT NULL,
            matched_album_id TEXT REFERENCES albums(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_billboard_chart_entries_match
            ON billboard_chart_entries(matched_album_id);
        CREATE INDEX IF NOT EXISTS idx_billboard_chart_entries_year_rank
            ON billboard_chart_entries(year, rank);
        ",
    )
    .context("Could not create Billboard chart entry table")?;

    Ok(())
}

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

fn ensure_track_billboard_single_columns(conn: &Connection) -> Result<()> {
    for (name, definition) in [
        ("billboard_single_rank", "INTEGER"),
        ("billboard_single_year", "INTEGER"),
    ] {
        if !schema_column_exists(conn, "tracks", name)? {
            let sql = format!("ALTER TABLE tracks ADD COLUMN {name} {definition}");
            conn.execute_batch(&sql)
                .with_context(|| format!("Could not add tracks.{name}"))?;
        }
    }

    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_tracks_billboard_single_rank ON tracks(billboard_single_rank);",
    )
    .context("Could not create Billboard singles rank index")?;

    Ok(())
}

fn ensure_billboard_single_chart_entries_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS billboard_single_chart_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            year INTEGER NOT NULL,
            rank INTEGER NOT NULL,
            artist TEXT NOT NULL,
            featured TEXT,
            display_artist TEXT NOT NULL,
            title TEXT NOT NULL,
            artist_key TEXT NOT NULL,
            title_key TEXT NOT NULL,
            matched_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_billboard_single_chart_entries_match
            ON billboard_single_chart_entries(matched_track_id);
        CREATE INDEX IF NOT EXISTS idx_billboard_single_chart_entries_year_rank
            ON billboard_single_chart_entries(year, rank);
        ",
    )
    .context("Could not create Billboard singles chart entry table")?;

    Ok(())
}

fn schema_column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let sql = format!("PRAGMA table_info({table})");
    let mut stmt = conn
        .prepare(&sql)
        .with_context(|| format!("Could not inspect SQLite table {table}"))?;
    let mut rows = stmt.query([])?;

    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == column {
            return Ok(true);
        }
    }

    Ok(false)
}

#[cfg(not(test))]
pub fn library_status(app: &AppHandle) -> Result<LibraryStatus> {
    let (conn, db_path) = open(app)?;
    let track_count = count_rows(&conn, "tracks")?;
    let album_count = count_rows(&conn, "albums")?;
    let cover_count = count_rows(&conn, "album_covers")?;
    let import_run_count = count_rows(&conn, "import_runs")?;
    let last_import = list_import_runs(&conn, 1)?.into_iter().next();

    Ok(LibraryStatus {
        db_path: db_path.display().to_string(),
        has_database: db_path.exists(),
        track_count,
        album_count,
        cover_count,
        import_run_count,
        last_import,
    })
}

#[cfg(not(test))]
pub fn performance_probe_for_app(app: &AppHandle) -> Result<PerformanceProbeResponse> {
    let (conn, db_path) = open(app)?;
    performance_probe(&conn, db_path.display().to_string())
}

#[cfg(not(test))]
pub fn import_billboard_charts_for_app(
    app: &AppHandle,
    source_path: String,
) -> Result<BillboardImportSummary> {
    let (mut conn, _) = open(app)?;
    let source_path = resolve_billboard_source_path(&source_path)?;
    import_billboard_charts(&mut conn, &source_path)
}

fn import_billboard_charts(
    conn: &mut Connection,
    source_path: &Path,
) -> Result<BillboardImportSummary> {
    let started = Instant::now();
    let csv_files = billboard_csv_files(source_path)?;
    if csv_files.is_empty() {
        bail!("No Billboard CSV files found in {}", source_path.display());
    }

    let mut files_scanned = 0_usize;
    let mut source_entry_count = 0_usize;
    let mut source_entries = Vec::new();
    let mut best_entries: HashMap<String, BillboardChartEntry> = HashMap::new();
    let mut entry_indexes_by_match_key: HashMap<String, Vec<usize>> = HashMap::new();
    for csv_file in csv_files {
        let year = billboard_year_from_path(&csv_file)?;
        let entries = read_billboard_chart_file(&csv_file, year)?;
        files_scanned += 1;
        source_entry_count += entries.len();
        for entry in entries {
            let entry_index = source_entries.len();
            for key in billboard_match_keys(&entry.artist_key, &entry.album_key) {
                entry_indexes_by_match_key
                    .entry(key.clone())
                    .or_default()
                    .push(entry_index);
                let should_replace = best_entries
                    .get(&key)
                    .map(|existing| {
                        entry.rank < existing.rank
                            || (entry.rank == existing.rank && entry.year < existing.year)
                    })
                    .unwrap_or(true);
                if should_replace {
                    best_entries.insert(key, entry.clone());
                }
            }
            source_entries.push(entry);
        }
    }

    let tx = conn
        .transaction()
        .context("Could not start Billboard chart import transaction")?;
    tx.execute(
        "UPDATE albums SET billboard_rank = NULL, billboard_year = NULL",
        [],
    )
    .context("Could not clear existing Billboard rankings")?;

    let mut matched_entry_album_ids = vec![None::<String>; source_entries.len()];
    let mut album_matches = Vec::new();
    {
        let mut stmt = tx.prepare(
            "
            SELECT id, album_artist_display, album
            FROM albums
            ",
        )?;
        let album_rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        for (album_id, artist, album) in album_rows {
            let artist_key = billboard_text_key(artist.as_deref().unwrap_or_default());
            let album_key = billboard_text_key(album.as_deref().unwrap_or_default());
            if artist_key.is_empty() || album_key.is_empty() {
                continue;
            }

            let mut best_match: Option<&BillboardChartEntry> = None;
            for key in billboard_match_keys(&artist_key, &album_key) {
                if let Some(indexes) = entry_indexes_by_match_key.get(&key) {
                    for &entry_index in indexes {
                        if matched_entry_album_ids[entry_index].is_none() {
                            matched_entry_album_ids[entry_index] = Some(album_id.clone());
                        }
                    }
                }

                if let Some(entry) = best_entries.get(&key) {
                    if best_match
                        .map(|existing| {
                            entry.rank < existing.rank
                                || (entry.rank == existing.rank && entry.year < existing.year)
                        })
                        .unwrap_or(true)
                    {
                        best_match = Some(entry);
                    }
                }
            }

            if let Some(entry) = best_match {
                album_matches.push((album_id, entry.rank, entry.year));
            }
        }
    }

    {
        let mut update_album = tx.prepare(
            "
            UPDATE albums
            SET billboard_rank = ?1,
                billboard_year = ?2
            WHERE id = ?3
            ",
        )?;
        for (album_id, rank, year) in &album_matches {
            update_album
                .execute(params![rank, year, album_id])
                .with_context(|| format!("Could not update Billboard ranking for {album_id}"))?;
        }
    }

    tx.execute("DELETE FROM billboard_chart_entries", [])
        .context("Could not clear existing Billboard chart entries")?;
    {
        let imported_at = Utc::now().to_rfc3339();
        let mut insert_entry = tx.prepare(
            "
            INSERT INTO billboard_chart_entries (
                source_file, year, rank, artist, album, artist_key, album_key,
                matched_album_id, imported_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
            )
            ",
        )?;
        for (index, entry) in source_entries.iter().enumerate() {
            insert_entry
                .execute(params![
                    &entry.source_file,
                    entry.year,
                    entry.rank,
                    &entry.artist,
                    &entry.album,
                    &entry.artist_key,
                    &entry.album_key,
                    matched_entry_album_ids[index].as_deref(),
                    &imported_at,
                ])
                .with_context(|| {
                    format!(
                        "Could not import Billboard chart entry #{} {} {}",
                        entry.rank, entry.artist, entry.album
                    )
                })?;
        }
    }

    tx.commit()
        .context("Could not commit Billboard chart import")?;

    Ok(BillboardImportSummary {
        source_path: source_path.display().to_string(),
        files_scanned,
        chart_entries: source_entry_count,
        matched_albums: album_matches.len() as i64,
        duration_ms: started.elapsed().as_millis(),
    })
}

#[cfg(not(test))]
pub fn import_billboard_singles_for_app(
    app: &AppHandle,
    source_path: String,
) -> Result<BillboardSinglesImportSummary> {
    let (mut conn, _) = open(app)?;
    let source_path = resolve_billboard_source_path(&source_path)?;
    import_billboard_singles(&mut conn, &source_path)
}

fn import_billboard_singles(
    conn: &mut Connection,
    source_path: &Path,
) -> Result<BillboardSinglesImportSummary> {
    let started = Instant::now();
    let csv_files = billboard_csv_files(source_path)?;
    if csv_files.is_empty() {
        bail!(
            "No Billboard singles CSV files found in {}",
            source_path.display()
        );
    }

    let mut files_scanned = 0_usize;
    let mut source_entry_count = 0_usize;
    let mut source_entries = Vec::new();
    let mut best_entries: HashMap<String, BillboardSingleChartEntry> = HashMap::new();
    let mut entry_indexes_by_match_key: HashMap<String, Vec<usize>> = HashMap::new();
    for csv_file in csv_files {
        let year = billboard_year_from_path(&csv_file)?;
        let entries = read_billboard_single_chart_file(&csv_file, year)?;
        files_scanned += 1;
        source_entry_count += entries.len();
        for entry in entries {
            let entry_index = source_entries.len();
            for key in billboard_single_entry_match_keys(&entry) {
                entry_indexes_by_match_key
                    .entry(key.clone())
                    .or_default()
                    .push(entry_index);
                let should_replace = best_entries
                    .get(&key)
                    .map(|existing| {
                        entry.rank < existing.rank
                            || (entry.rank == existing.rank && entry.year < existing.year)
                    })
                    .unwrap_or(true);
                if should_replace {
                    best_entries.insert(key, entry.clone());
                }
            }
            source_entries.push(entry);
        }
    }

    let tx = conn
        .transaction()
        .context("Could not start Billboard singles import transaction")?;
    tx.execute(
        "UPDATE tracks SET billboard_single_rank = NULL, billboard_single_year = NULL",
        [],
    )
    .context("Could not clear existing Billboard singles rankings")?;

    let mut matched_entry_track_ids = vec![None::<i64>; source_entries.len()];
    let mut track_matches = Vec::new();
    {
        let mut stmt = tx.prepare(
            "
            SELECT id, display_artist, title
            FROM tracks
            ",
        )?;
        let track_rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        for (track_id, display_artist, title) in track_rows {
            let artist_key = billboard_text_key(display_artist.as_deref().unwrap_or_default());
            let title_key = billboard_text_key(title.as_deref().unwrap_or_default());
            if artist_key.is_empty() || title_key.is_empty() {
                continue;
            }

            let mut best_match: Option<&BillboardSingleChartEntry> = None;
            for key in billboard_single_match_keys(&artist_key, &title_key) {
                if let Some(indexes) = entry_indexes_by_match_key.get(&key) {
                    for &entry_index in indexes {
                        if matched_entry_track_ids[entry_index].is_none() {
                            matched_entry_track_ids[entry_index] = Some(track_id);
                        }
                    }
                }

                if let Some(entry) = best_entries.get(&key) {
                    if best_match
                        .map(|existing| {
                            entry.rank < existing.rank
                                || (entry.rank == existing.rank && entry.year < existing.year)
                        })
                        .unwrap_or(true)
                    {
                        best_match = Some(entry);
                    }
                }
            }

            if let Some(entry) = best_match {
                track_matches.push((track_id, entry.rank, entry.year));
            }
        }
    }

    {
        let mut update_track = tx.prepare(
            "
            UPDATE tracks
            SET billboard_single_rank = ?1,
                billboard_single_year = ?2
            WHERE id = ?3
            ",
        )?;
        for (track_id, rank, year) in &track_matches {
            update_track
                .execute(params![rank, year, track_id])
                .with_context(|| {
                    format!("Could not update Billboard singles ranking for track {track_id}")
                })?;
        }
    }

    tx.execute("DELETE FROM billboard_single_chart_entries", [])
        .context("Could not clear existing Billboard singles chart entries")?;
    {
        let imported_at = Utc::now().to_rfc3339();
        let mut insert_entry = tx.prepare(
            "
            INSERT INTO billboard_single_chart_entries (
                source_file, year, rank, artist, featured, display_artist, title,
                artist_key, title_key, matched_track_id, imported_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11
            )
            ",
        )?;
        for (index, entry) in source_entries.iter().enumerate() {
            insert_entry
                .execute(params![
                    &entry.source_file,
                    entry.year,
                    entry.rank,
                    &entry.artist,
                    nonempty_str(&entry.featured),
                    &entry.display_artist,
                    &entry.title,
                    &entry.artist_key,
                    &entry.title_key,
                    matched_entry_track_ids[index],
                    &imported_at,
                ])
                .with_context(|| {
                    format!(
                        "Could not import Billboard singles chart entry #{} {} {}",
                        entry.rank, entry.display_artist, entry.title
                    )
                })?;
        }
    }

    tx.commit()
        .context("Could not commit Billboard singles import")?;

    Ok(BillboardSinglesImportSummary {
        source_path: source_path.display().to_string(),
        files_scanned,
        chart_entries: source_entry_count,
        matched_tracks: track_matches.len() as i64,
        duration_ms: started.elapsed().as_millis(),
    })
}

fn billboard_csv_files(source_path: &Path) -> Result<Vec<PathBuf>> {
    if source_path.is_file() {
        return Ok(vec![source_path.to_path_buf()]);
    }

    let mut files = fs::read_dir(source_path)
        .with_context(|| {
            format!(
                "Could not read Billboard CSV folder {}",
                source_path.display()
            )
        })?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| extension.eq_ignore_ascii_case("csv"))
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    files.sort();
    Ok(files)
}

fn read_billboard_chart_file(path: &Path, year: i32) -> Result<Vec<BillboardChartEntry>> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_path(path)
        .with_context(|| format!("Could not open Billboard CSV {}", path.display()))?;
    let headers = reader
        .headers()
        .with_context(|| format!("Could not read Billboard CSV header {}", path.display()))?
        .clone();
    let rank_index = csv_header_index(&headers, "EOY Rank")?;
    let artist_index = csv_header_index(&headers, "Artist")?;
    let title_index = csv_header_index(&headers, "Title")?;
    let source_file = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string();

    let mut entries = Vec::new();
    for result in reader.records() {
        let record = result
            .with_context(|| format!("Could not read Billboard CSV row {}", path.display()))?;
        let rank = record
            .get(rank_index)
            .and_then(|value| value.trim().parse::<i32>().ok());
        let artist = record
            .get(artist_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let album = record
            .get(title_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let artist_key = billboard_text_key(&artist);
        let album_key = billboard_text_key(&album);
        if let Some(rank) = rank {
            if !artist_key.is_empty() && !album_key.is_empty() {
                entries.push(BillboardChartEntry {
                    source_file: source_file.clone(),
                    artist,
                    album,
                    artist_key,
                    album_key,
                    rank,
                    year,
                });
            }
        }
    }

    Ok(entries)
}

fn read_billboard_single_chart_file(
    path: &Path,
    year: i32,
) -> Result<Vec<BillboardSingleChartEntry>> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_path(path)
        .with_context(|| format!("Could not open Billboard singles CSV {}", path.display()))?;
    let headers = reader
        .headers()
        .with_context(|| {
            format!(
                "Could not read Billboard singles CSV header {}",
                path.display()
            )
        })?
        .clone();
    let rank_index = csv_header_index(&headers, "Yearly Rank")?;
    let artist_index = csv_header_index(&headers, "Artist")?;
    let featured_index = csv_header_index(&headers, "Featured")?;
    let title_index = csv_header_index(&headers, "Track")?;
    let source_file = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string();

    let mut entries = Vec::new();
    for result in reader.records() {
        let record = result.with_context(|| {
            format!(
                "Could not read Billboard singles CSV row {}",
                path.display()
            )
        })?;
        let rank = record
            .get(rank_index)
            .and_then(|value| value.trim().parse::<i32>().ok());
        let artist = record
            .get(artist_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let featured = record
            .get(featured_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let title = record
            .get(title_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let display_artist = billboard_single_display_artist(&artist, &featured);
        let primary_artist_key = billboard_text_key(&artist);
        let artist_key = billboard_text_key(&display_artist);
        let title_key = billboard_text_key(&title);
        if let Some(rank) = rank {
            if !artist_key.is_empty() && !title_key.is_empty() {
                entries.push(BillboardSingleChartEntry {
                    source_file: source_file.clone(),
                    artist,
                    featured,
                    display_artist,
                    primary_artist_key,
                    artist_key,
                    title,
                    title_key,
                    rank,
                    year,
                });
            }
        }
    }

    Ok(entries)
}

fn csv_header_index(headers: &csv::StringRecord, name: &str) -> Result<usize> {
    headers
        .iter()
        .position(|header| header.trim().eq_ignore_ascii_case(name))
        .ok_or_else(|| anyhow!("Missing required Billboard CSV column: {name}"))
}

fn billboard_year_from_path(path: &Path) -> Result<i32> {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .and_then(|stem| stem.trim().parse::<i32>().ok())
        .with_context(|| format!("Billboard CSV filename must be a year: {}", path.display()))
}

fn resolve_billboard_source_path(source_path: &str) -> Result<PathBuf> {
    let trimmed = source_path.trim();
    if trimmed.is_empty() {
        bail!("Choose a Billboard CSV folder before starting import");
    }

    let provided = PathBuf::from(trimmed);
    let candidates = if provided.is_absolute() {
        vec![provided]
    } else {
        let cwd = std::env::current_dir().context("Could not read current working directory")?;
        let mut candidates = vec![cwd.join(&provided)];
        if let Some(parent) = cwd.parent() {
            candidates.push(parent.join(&provided));
        }
        candidates
    };

    candidates
        .into_iter()
        .find(|candidate| candidate.exists())
        .map(|candidate| candidate.canonicalize().unwrap_or(candidate))
        .ok_or_else(|| anyhow!("Could not find Billboard CSV source path: {source_path}"))
}

fn billboard_match_key(artist_key: &str, album_key: &str) -> String {
    format!("{artist_key}\u{1f}{album_key}")
}

fn billboard_match_keys(artist_key: &str, album_key: &str) -> Vec<String> {
    let mut keys = Vec::new();
    for artist in billboard_key_variants(artist_key) {
        for album in billboard_key_variants(album_key) {
            let key = billboard_match_key(&artist, &album);
            if !keys.contains(&key) {
                keys.push(key);
            }
        }
    }
    keys
}

fn billboard_single_entry_match_keys(entry: &BillboardSingleChartEntry) -> Vec<String> {
    let mut keys = Vec::new();
    for artist_key in [&entry.artist_key, &entry.primary_artist_key] {
        for key in billboard_single_match_keys(artist_key, &entry.title_key) {
            if !keys.contains(&key) {
                keys.push(key);
            }
        }
    }
    keys
}

fn billboard_single_match_keys(artist_key: &str, title_key: &str) -> Vec<String> {
    let mut keys = Vec::new();
    for artist in billboard_single_artist_key_variants(artist_key) {
        for title in billboard_single_title_key_variants(title_key) {
            let key = billboard_match_key(&artist, &title);
            if !keys.contains(&key) {
                keys.push(key);
            }
        }
    }
    keys
}

fn billboard_single_artist_key_variants(key: &str) -> Vec<String> {
    let mut variants = Vec::new();
    for base in billboard_key_variants(key) {
        push_unique(&mut variants, base.clone());
        let without_connectors = remove_artist_connector_tokens(&base);
        if !without_connectors.is_empty() {
            push_unique(&mut variants, without_connectors);
        }
    }
    variants
}

fn billboard_single_title_key_variants(key: &str) -> Vec<String> {
    let mut variants = vec![key.to_string()];
    if let Some(stripped) = strip_title_feature_suffix(key) {
        push_unique(&mut variants, stripped);
    }
    variants
}

fn remove_artist_connector_tokens(key: &str) -> String {
    key.split_whitespace()
        .filter(|part| !matches!(*part, "feat" | "featuring" | "ft" | "with" | "and" | "x"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn strip_title_feature_suffix(key: &str) -> Option<String> {
    let parts = key.split_whitespace().collect::<Vec<_>>();
    let index = parts
        .iter()
        .position(|part| matches!(*part, "feat" | "featuring" | "ft"))?;
    if index == 0 {
        None
    } else {
        Some(parts[..index].join(" "))
    }
}

fn billboard_single_display_artist(artist: &str, featured: &str) -> String {
    let artist = artist.trim();
    let featured = featured
        .trim()
        .trim_start_matches(|character| matches!(character, ',' | ';'))
        .trim();
    if featured.is_empty() {
        artist.to_string()
    } else {
        compact_whitespace(&format!("{artist} {featured}"))
    }
}

fn billboard_key_variants(key: &str) -> Vec<String> {
    let mut variants = vec![key.to_string()];
    if let Some(stripped) = key.strip_prefix("the ") {
        if !stripped.is_empty() {
            variants.push(stripped.to_string());
        }
    }
    variants
}

fn compact_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn nonempty_str(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn billboard_text_key(value: &str) -> String {
    let lowercased = value.replace('&', " and ").to_lowercase();
    let folded = lowercased
        .nfd()
        .filter(|character| !is_combining_mark(*character))
        .fold(String::new(), |mut normalized, character| {
            match character {
                'æ' => normalized.push_str("ae"),
                'œ' => normalized.push_str("oe"),
                'ø' => normalized.push('o'),
                'ð' => normalized.push('d'),
                'þ' => normalized.push_str("th"),
                'ł' => normalized.push('l'),
                'ß' => normalized.push_str("ss"),
                _ => normalized.push(character),
            }
            normalized
        });

    folded
        .split(|character: char| !character.is_alphanumeric())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(not(test))]
pub fn list_import_runs_for_app(app: &AppHandle, limit: u32) -> Result<Vec<ImportRun>> {
    let (conn, _) = open(app)?;
    list_import_runs(&conn, limit)
}

#[cfg(not(test))]
pub fn statistics_for_app(app: &AppHandle) -> Result<StatisticsResponse> {
    let (conn, _) = open(app)?;
    statistics(&conn)
}

pub fn list_import_runs(conn: &Connection, limit: u32) -> Result<Vec<ImportRun>> {
    let mut stmt = conn.prepare(
        "
        SELECT id, source_path, source_size_bytes, started_at, completed_at, status,
               track_rows, album_count, duration_ms, backup_path, error_message,
               added_tracks, changed_tracks, removed_tracks, added_albums,
               changed_albums, removed_albums, rating_events_count
        FROM import_runs
        ORDER BY id DESC
        LIMIT ?1
        ",
    )?;

    let runs = stmt
        .query_map(params![limit], import_run_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(runs)
}

fn statistics(conn: &Connection) -> Result<StatisticsResponse> {
    let overview = library_overview_stats(conn)?;
    let rating_progress = rating_progress_stats(conn)?;
    let metadata_coverage = metadata_coverage_stats(conn)?;
    let health_score = library_health_score(conn, &overview, &rating_progress, &metadata_coverage)?;
    let decade_progress = decade_progress_stats(conn)?;
    let year_progress = year_progress_stats(conn)?;
    let genre_progress = genre_progress_stats(conn)?;
    let library_shape = library_shape_stats(&year_progress, &decade_progress);
    let loved_density = loved_density_stats(conn)?;
    let catalog_concentration = catalog_concentration_stats(conn, overview.album_count)?;
    let duration_analytics = duration_analytics_stats(conn)?;
    let outlier_stats = outlier_stats(conn)?;
    let track_rating_distribution = track_rating_distribution(conn)?;
    let album_rating_distribution = album_rating_distribution(conn)?;
    let loved_tracks = loved_track_stats(conn)?;
    let import_history = list_import_runs(conn, 16)?;
    let rating_history = rating_history(conn, &rating_progress, &overview)?;
    let recent_rating_events = recent_rating_events(conn, 10)?;
    let last_updated = import_history.first().and_then(|run| {
        run.completed_at
            .clone()
            .or_else(|| Some(run.started_at.clone()))
    });

    Ok(StatisticsResponse {
        overview,
        health_score,
        library_shape,
        rating_progress,
        decade_progress,
        year_progress,
        genre_progress,
        loved_density,
        catalog_concentration,
        duration_analytics,
        outlier_stats,
        track_rating_distribution,
        album_rating_distribution,
        metadata_coverage,
        loved_tracks,
        import_history,
        rating_history,
        recent_rating_events,
        last_updated,
    })
}

fn library_overview_stats(conn: &Connection) -> Result<LibraryOverviewStats> {
    let artist_key_sql = artist_key_sql("album_artist_display");
    let sql = format!(
        "
        SELECT
            (SELECT COUNT(*) FROM tracks),
            (SELECT COUNT(*) FROM albums),
            (SELECT COUNT(DISTINCT {artist_key_sql})
                FROM albums
                WHERE NULLIF(TRIM(COALESCE(album_artist_display, '')), '') IS NOT NULL),
            (SELECT COUNT(DISTINCT genre_normalized)
                FROM albums
                WHERE NULLIF(TRIM(COALESCE(genre_normalized, '')), '') IS NOT NULL),
            (SELECT COUNT(DISTINCT year)
                FROM albums
                WHERE year IS NOT NULL),
            COALESCE((SELECT SUM(total_seconds) FROM albums), 0),
            (SELECT AVG(album_score) FROM albums WHERE album_score IS NOT NULL)
        "
    );
    conn.query_row(&sql, [], |row| {
        Ok(LibraryOverviewStats {
            track_count: row.get(0)?,
            album_count: row.get(1)?,
            album_artist_count: row.get(2)?,
            genre_count: row.get(3)?,
            year_count: row.get(4)?,
            total_seconds: row.get(5)?,
            average_album_score: row.get(6)?,
        })
    })
    .context("Could not load library overview statistics")
}

fn rating_progress_stats(conn: &Connection) -> Result<RatingProgressStats> {
    conn.query_row(
        "
        SELECT
            COALESCE(SUM(CASE WHEN rating_completeness >= 1.0 THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN rating_completeness > 0.0 AND rating_completeness < 1.0 THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN rating_completeness = 0.0 THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN effective_album_rating IS NOT NULL THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(rated_tracks), 0),
            COALESCE(SUM(total_tracks - rated_tracks), 0),
            AVG(rating_completeness),
            AVG(effective_album_rating)
        FROM albums
        ",
        [],
        |row| {
            Ok(RatingProgressStats {
                fully_rated_albums: row.get(0)?,
                partially_rated_albums: row.get(1)?,
                unrated_albums: row.get(2)?,
                albums_with_effective_rating: row.get(3)?,
                rated_tracks: row.get(4)?,
                unrated_tracks: row.get(5)?,
                average_rating_completeness: row.get(6)?,
                average_album_rating: row.get(7)?,
            })
        },
    )
    .context("Could not load rating progress statistics")
}

fn ratio(part: i64, total: i64) -> f64 {
    if total <= 0 {
        0.0
    } else {
        (part as f64 / total as f64).clamp(0.0, 1.0)
    }
}

fn library_health_score(
    conn: &Connection,
    overview: &LibraryOverviewStats,
    rating_progress: &RatingProgressStats,
    metadata_coverage: &[MetadataCoverageMetric],
) -> Result<LibraryHealthScore> {
    let cover_count = conn
        .query_row(
            "
            SELECT COUNT(DISTINCT a.id)
            FROM albums a
            JOIN album_covers c ON c.album_id = a.id
            ",
            [],
            |row| row.get::<_, i64>(0),
        )
        .context("Could not load cover coverage for health score")?;

    let metadata_values = metadata_coverage
        .iter()
        .filter(|metric| metric.scope == "Albums" || metric.scope == "Tracks")
        .filter(|metric| metric.total_count > 0)
        .map(|metric| ratio(metric.covered_count, metric.total_count))
        .collect::<Vec<_>>();
    let metadata_coverage_score = if metadata_values.is_empty() {
        0.0
    } else {
        metadata_values.iter().sum::<f64>() / metadata_values.len() as f64
    };

    let rating_coverage = ratio(rating_progress.rated_tracks, overview.track_count);
    let album_completion = ratio(rating_progress.fully_rated_albums, overview.album_count);
    let cover_coverage = ratio(cover_count, overview.album_count);
    let score_coverage = ratio(
        rating_progress.albums_with_effective_rating,
        overview.album_count,
    );
    let score = rating_coverage * 35.0
        + album_completion * 20.0
        + metadata_coverage_score * 25.0
        + cover_coverage * 10.0
        + score_coverage * 10.0;

    Ok(LibraryHealthScore {
        score,
        rating_coverage,
        album_completion,
        metadata_coverage: metadata_coverage_score,
        cover_coverage,
        score_coverage,
    })
}

fn library_shape_stats(
    year_progress: &[YearProgressStats],
    decade_progress: &[DecadeProgressStats],
) -> LibraryShapeStats {
    let total_albums = year_progress.iter().map(|row| row.album_count).sum::<i64>();
    let median_target = (total_albums + 1) / 2;
    let mut cumulative = 0_i64;
    let mut years = year_progress.iter().collect::<Vec<_>>();
    years.sort_by_key(|row| row.year);
    let median_year = years.iter().find_map(|row| {
        cumulative += row.album_count;
        if cumulative >= median_target {
            Some(row.year)
        } else {
            None
        }
    });
    let peak_year = year_progress
        .iter()
        .max_by_key(|row| row.album_count)
        .map(|row| (row.year, row.album_count));
    let most_represented_decade = decade_progress
        .iter()
        .max_by_key(|row| row.album_count)
        .map(|row| (row.decade, row.album_count));

    LibraryShapeStats {
        median_year,
        most_represented_decade: most_represented_decade.map(|(decade, _)| decade),
        most_represented_decade_albums: most_represented_decade
            .map(|(_, albums)| albums)
            .unwrap_or_default(),
        peak_year: peak_year.map(|(year, _)| year),
        peak_year_albums: peak_year.map(|(_, albums)| albums).unwrap_or_default(),
    }
}

fn decade_progress_stats(conn: &Connection) -> Result<Vec<DecadeProgressStats>> {
    let mut stmt = conn.prepare(
        "
        SELECT
            CAST((year / 10) * 10 AS INTEGER) AS decade,
            COUNT(*),
            SUM(CASE WHEN rating_completeness >= 1.0 THEN 1 ELSE 0 END),
            SUM(CASE WHEN rating_completeness > 0.0 AND rating_completeness < 1.0 THEN 1 ELSE 0 END),
            SUM(CASE WHEN rating_completeness = 0.0 THEN 1 ELSE 0 END),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(total_seconds), 0),
            COALESCE(SUM(loved_tracks), 0),
            AVG(album_score)
        FROM albums
        WHERE year IS NOT NULL
        GROUP BY decade
        ORDER BY decade ASC
        ",
    )?;

    let rows = stmt
        .query_map([], |row| {
            Ok(DecadeProgressStats {
                decade: row.get(0)?,
                album_count: row.get(1)?,
                rated_album_count: row.get(2)?,
                partial_album_count: row.get(3)?,
                unrated_album_count: row.get(4)?,
                track_count: row.get(5)?,
                total_seconds: row.get(6)?,
                loved_tracks: row.get(7)?,
                average_album_score: row.get(8)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn loved_density_stats(conn: &Connection) -> Result<Vec<LovedDensityStat>> {
    let mut stats = Vec::new();

    let mut genre_stmt = conn.prepare(
        "
        SELECT
            'Genre',
            COALESCE(MIN(NULLIF(TRIM(canonical_genre), '')), 'Unknown'),
            COUNT(*),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(loved_tracks), 0),
            CAST(COALESCE(SUM(loved_tracks), 0) AS REAL) * 100.0 / MAX(1, COALESCE(SUM(total_tracks), 0))
        FROM albums
        WHERE NULLIF(TRIM(COALESCE(genre_normalized, '')), '') IS NOT NULL
        GROUP BY COALESCE(NULLIF(TRIM(LOWER(genre_normalized)), ''), 'unknown')
        HAVING COALESCE(SUM(total_tracks), 0) >= 100
        ORDER BY 6 DESC, 5 DESC, 3 DESC
        LIMIT 8
        ",
    )?;
    stats.extend(
        genre_stmt
            .query_map([], loved_density_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?,
    );

    let mut decade_stmt = conn.prepare(
        "
        SELECT
            'Decade',
            printf('%ds', CAST((year / 10) * 10 AS INTEGER)),
            COUNT(*),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(loved_tracks), 0),
            CAST(COALESCE(SUM(loved_tracks), 0) AS REAL) * 100.0 / MAX(1, COALESCE(SUM(total_tracks), 0))
        FROM albums
        WHERE year IS NOT NULL
        GROUP BY CAST((year / 10) * 10 AS INTEGER)
        HAVING COALESCE(SUM(total_tracks), 0) >= 100
        ORDER BY 6 DESC, 5 DESC, 3 DESC
        LIMIT 8
        ",
    )?;
    stats.extend(
        decade_stmt
            .query_map([], loved_density_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?,
    );

    let mut rating_stmt = conn.prepare(
        "
        SELECT
            'Rating bucket',
            CASE
                WHEN effective_album_rating IS NULL THEN 'Unrated'
                WHEN effective_album_rating = 100 THEN '100'
                ELSE printf('%d-%d', (effective_album_rating / 10) * 10, ((effective_album_rating / 10) * 10) + 9)
            END,
            COUNT(*),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(loved_tracks), 0),
            CAST(COALESCE(SUM(loved_tracks), 0) AS REAL) * 100.0 / MAX(1, COALESCE(SUM(total_tracks), 0))
        FROM albums
        GROUP BY
            CASE
                WHEN effective_album_rating IS NULL THEN -1
                WHEN effective_album_rating = 100 THEN 100
                ELSE (effective_album_rating / 10) * 10
            END
        HAVING COALESCE(SUM(total_tracks), 0) >= 100
        ORDER BY 6 DESC, 5 DESC, 3 DESC
        LIMIT 8
        ",
    )?;
    stats.extend(
        rating_stmt
            .query_map([], loved_density_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?,
    );

    Ok(stats)
}

fn loved_density_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LovedDensityStat> {
    Ok(LovedDensityStat {
        scope: row.get(0)?,
        label: row.get(1)?,
        album_count: row.get(2)?,
        track_count: row.get(3)?,
        loved_tracks: row.get(4)?,
        loved_per_100_tracks: row.get(5)?,
    })
}

fn catalog_concentration_stats(
    conn: &Connection,
    total_albums: i64,
) -> Result<CatalogConcentrationStats> {
    let artist_key_sql = artist_key_sql("album_artist_display");
    let artist_groups = concentration_groups(
        conn,
        &format!(
            "
        SELECT
            COALESCE(MIN(NULLIF(TRIM(album_artist_display), '')), 'Unknown Artist') AS label,
            COUNT(*) AS album_count
        FROM albums
        GROUP BY {artist_key_sql}
        ORDER BY album_count DESC, LOWER(label) ASC
        "
        ),
    )?;
    let genre_groups = concentration_groups(
        conn,
        "
        SELECT
            COALESCE(MIN(NULLIF(TRIM(canonical_genre), '')), 'Unknown') AS label,
            COUNT(*) AS album_count
        FROM albums
        GROUP BY COALESCE(NULLIF(TRIM(LOWER(genre_normalized)), ''), 'unknown')
        ORDER BY album_count DESC, LOWER(label) ASC
        ",
    )?;

    let top_artist = artist_groups.first().map(|(label, _)| label.clone());
    let top_artist_album_count = artist_groups
        .first()
        .map(|(_, album_count)| *album_count)
        .unwrap_or_default();
    let top_genre = genre_groups.first().map(|(label, _)| label.clone());
    let top_genre_album_count = genre_groups
        .first()
        .map(|(_, album_count)| *album_count)
        .unwrap_or_default();

    Ok(CatalogConcentrationStats {
        artist_points: concentration_points(&artist_groups, total_albums),
        genre_points: concentration_points(&genre_groups, total_albums),
        top_artist,
        top_artist_album_count,
        top_genre,
        top_genre_album_count,
    })
}

fn concentration_groups(conn: &Connection, sql: &str) -> Result<Vec<(String, i64)>> {
    let mut stmt = conn.prepare(sql)?;
    let groups = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load catalog concentration groups")?;
    Ok(groups)
}

fn concentration_points(groups: &[(String, i64)], total_albums: i64) -> Vec<ConcentrationPoint> {
    [10_i64, 25, 50]
        .into_iter()
        .map(|top_n| {
            let album_count = groups
                .iter()
                .take(top_n as usize)
                .map(|(_, count)| *count)
                .sum::<i64>();
            ConcentrationPoint {
                top_n,
                album_count,
                share: ratio(album_count, total_albums),
            }
        })
        .collect()
}

fn duration_analytics_stats(conn: &Connection) -> Result<DurationAnalyticsStats> {
    let (average_album_seconds, average_track_seconds) = conn
        .query_row(
            "
            SELECT
                (SELECT AVG(total_seconds) FROM albums WHERE total_seconds > 0),
                (SELECT CAST(SUM(total_seconds) AS REAL) / NULLIF(SUM(total_tracks), 0)
                 FROM albums
                 WHERE total_seconds > 0 AND total_tracks > 0)
            ",
            [],
            |row| Ok((row.get::<_, Option<f64>>(0)?, row.get::<_, Option<f64>>(1)?)),
        )
        .context("Could not load duration averages")?;

    Ok(DurationAnalyticsStats {
        average_album_seconds,
        average_track_seconds,
        longest_albums: duration_album_rows(conn, "DESC")?,
        shortest_albums: duration_album_rows(conn, "ASC")?,
        track_count_buckets: track_count_distribution(conn)?,
    })
}

fn duration_album_rows(conn: &Connection, direction: &str) -> Result<Vec<DurationAlbumStat>> {
    let sql = format!(
        "
        SELECT
            id,
            album,
            album_artist_display,
            year,
            total_tracks,
            total_seconds,
            rating_completeness,
            album_score
        FROM albums
        WHERE total_seconds > 0
        ORDER BY total_seconds {direction}, total_tracks {direction}, LOWER(COALESCE(album, '')) ASC
        LIMIT 5
        "
    );
    let mut stmt = conn.prepare(&sql)?;
    duration_album_query(&mut stmt)
}

fn duration_album_query(stmt: &mut rusqlite::Statement<'_>) -> Result<Vec<DurationAlbumStat>> {
    stmt.query_map([], |row| {
        Ok(DurationAlbumStat {
            album_id: row.get(0)?,
            album: row.get(1)?,
            album_artist_display: row.get(2)?,
            year: row.get(3)?,
            total_tracks: row.get(4)?,
            total_seconds: row.get(5)?,
            rating_completeness: row.get(6)?,
            album_score: row.get(7)?,
        })
    })?
    .collect::<rusqlite::Result<Vec<_>>>()
    .context("Could not load duration album rows")
}

fn track_count_distribution(conn: &Connection) -> Result<Vec<RatingBucket>> {
    let mut stmt = conn.prepare(
        "
        SELECT
            CASE
                WHEN total_tracks <= 5 THEN '1-5'
                WHEN total_tracks <= 10 THEN '6-10'
                WHEN total_tracks <= 15 THEN '11-15'
                WHEN total_tracks <= 20 THEN '16-20'
                ELSE '21+'
            END AS bucket,
            COUNT(*),
            CASE
                WHEN total_tracks <= 5 THEN 1
                WHEN total_tracks <= 10 THEN 2
                WHEN total_tracks <= 15 THEN 3
                WHEN total_tracks <= 20 THEN 4
                ELSE 5
            END AS bucket_order
        FROM albums
        GROUP BY bucket_order, bucket
        ORDER BY bucket_order ASC
        ",
    )?;
    let buckets = stmt
        .query_map([], |row| {
            Ok(RatingBucket {
                label: row.get(0)?,
                count: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load track-count distribution")?;
    Ok(buckets)
}

fn outlier_stats(conn: &Connection) -> Result<Vec<OutlierStat>> {
    let mut stats = Vec::new();

    if let Some(album) = outlier_album(
        conn,
        "
        SELECT id, album, album_artist_display, year, total_tracks, total_seconds, rating_completeness, album_score
        FROM albums
        WHERE rating_completeness = 0.0 AND total_seconds > 0
        ORDER BY total_seconds DESC
        LIMIT 1
        ",
    )? {
        stats.push(OutlierStat {
            id: "longest-unrated-album".to_string(),
            label: "Longest unrated album".to_string(),
            value: format!("{:.1}h", album.total_seconds as f64 / 3600.0),
            detail: format_album_detail(&album),
        });
    }

    if let Some(album) = outlier_album(
        conn,
        "
        SELECT id, album, album_artist_display, year, total_tracks, total_seconds, rating_completeness, album_score
        FROM albums
        WHERE rating_completeness > 0.0
          AND rating_completeness < 1.0
          AND album_score IS NOT NULL
        ORDER BY album_score DESC, total_seconds DESC
        LIMIT 1
        ",
    )? {
        stats.push(OutlierStat {
            id: "highest-score-incomplete-album".to_string(),
            label: "Highest-score incomplete album".to_string(),
            value: album
                .album_score
                .map(|score| format!("{score:.1}"))
                .unwrap_or_default(),
            detail: format_album_detail(&album),
        });
    }

    if let Some((label, density, loved_tracks, track_count)) = conn
        .query_row(
            "
            SELECT
                COALESCE(MIN(NULLIF(TRIM(canonical_genre), '')), 'Unknown') AS genre,
                CAST(COALESCE(SUM(loved_tracks), 0) AS REAL) * 100.0 / MAX(1, COALESCE(SUM(total_tracks), 0)),
                COALESCE(SUM(loved_tracks), 0),
                COALESCE(SUM(total_tracks), 0)
            FROM albums
            WHERE NULLIF(TRIM(COALESCE(genre_normalized, '')), '') IS NOT NULL
            GROUP BY COALESCE(NULLIF(TRIM(LOWER(genre_normalized)), ''), 'unknown')
            HAVING COALESCE(SUM(total_tracks), 0) >= 100
            ORDER BY 2 DESC, 3 DESC
            LIMIT 1
            ",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, f64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        )
        .optional()
        .context("Could not load loved-density genre outlier")?
    {
        stats.push(OutlierStat {
            id: "highest-loved-density-genre".to_string(),
            label: "Highest loved-density genre".to_string(),
            value: format!("{density:.2}/100"),
            detail: format!("{label}: {loved_tracks} loved tracks across {track_count} tracks"),
        });
    }

    if let Some((decade, completion, albums)) = conn
        .query_row(
            "
            SELECT
                CAST((year / 10) * 10 AS INTEGER) AS decade,
                AVG(rating_completeness),
                COUNT(*)
            FROM albums
            WHERE year IS NOT NULL
            GROUP BY decade
            HAVING COUNT(*) >= 5
            ORDER BY AVG(rating_completeness) ASC, COUNT(*) DESC
            LIMIT 1
            ",
            [],
            |row| {
                Ok((
                    row.get::<_, i32>(0)?,
                    row.get::<_, Option<f64>>(1)?.unwrap_or_default(),
                    row.get::<_, i64>(2)?,
                ))
            },
        )
        .optional()
        .context("Could not load low-completion decade outlier")?
    {
        stats.push(OutlierStat {
            id: "lowest-completion-decade".to_string(),
            label: "Lowest-completion decade".to_string(),
            value: format!("{:.0}%", completion * 100.0),
            detail: format!("{decade}s: {albums} albums with the lowest average completion"),
        });
    }

    if let Some(album) = outlier_album(
        conn,
        "
        SELECT id, album, album_artist_display, year, total_tracks, total_seconds, rating_completeness, album_score
        FROM albums
        ORDER BY total_tracks DESC, total_seconds DESC
        LIMIT 1
        ",
    )? {
        stats.push(OutlierStat {
            id: "largest-track-count-album".to_string(),
            label: "Largest track-count album".to_string(),
            value: format!("{} tracks", album.total_tracks),
            detail: format_album_detail(&album),
        });
    }

    Ok(stats)
}

fn outlier_album(conn: &Connection, sql: &str) -> Result<Option<DurationAlbumStat>> {
    let mut stmt = conn.prepare(sql)?;
    Ok(duration_album_query(&mut stmt)?.into_iter().next())
}

fn format_album_detail(album: &DurationAlbumStat) -> String {
    let mut parts = Vec::new();
    if let Some(artist) = &album.album_artist_display {
        parts.push(artist.clone());
    }
    if let Some(title) = &album.album {
        parts.push(title.clone());
    }
    if let Some(year) = album.year {
        parts.push(year.to_string());
    }
    parts.join(" / ")
}

fn year_progress_stats(conn: &Connection) -> Result<Vec<YearProgressStats>> {
    let mut stmt = conn.prepare(
        "
        SELECT
            year,
            COUNT(*),
            SUM(CASE WHEN rating_completeness >= 1.0 THEN 1 ELSE 0 END),
            SUM(CASE WHEN rating_completeness > 0.0 AND rating_completeness < 1.0 THEN 1 ELSE 0 END),
            SUM(CASE WHEN rating_completeness = 0.0 THEN 1 ELSE 0 END),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(total_seconds), 0),
            COALESCE(SUM(loved_tracks), 0),
            AVG(album_score)
        FROM albums
        WHERE year IS NOT NULL
        GROUP BY year
        ORDER BY year DESC
        ",
    )?;

    let rows = stmt
        .query_map([], |row| {
            Ok(YearProgressStats {
                year: row.get(0)?,
                album_count: row.get(1)?,
                rated_album_count: row.get(2)?,
                partial_album_count: row.get(3)?,
                unrated_album_count: row.get(4)?,
                track_count: row.get(5)?,
                total_seconds: row.get(6)?,
                loved_tracks: row.get(7)?,
                average_album_score: row.get(8)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn genre_progress_stats(conn: &Connection) -> Result<Vec<GenreProgressStats>> {
    let mut stmt = conn.prepare(
        "
        SELECT
            COALESCE(NULLIF(TRIM(canonical_genre), ''), 'Unknown'),
            COUNT(*),
            SUM(CASE WHEN rating_completeness >= 1.0 THEN 1 ELSE 0 END),
            SUM(CASE WHEN rating_completeness > 0.0 AND rating_completeness < 1.0 THEN 1 ELSE 0 END),
            SUM(CASE WHEN rating_completeness = 0.0 THEN 1 ELSE 0 END),
            COALESCE(SUM(total_tracks), 0),
            COALESCE(SUM(total_seconds), 0),
            COALESCE(SUM(loved_tracks), 0),
            AVG(album_score)
        FROM albums
        GROUP BY COALESCE(NULLIF(TRIM(genre_normalized), ''), 'unknown')
        ORDER BY COUNT(*) DESC, LOWER(COALESCE(canonical_genre, '')) ASC
        LIMIT 24
        ",
    )?;

    let rows = stmt
        .query_map([], |row| {
            Ok(GenreProgressStats {
                genre: row.get(0)?,
                album_count: row.get(1)?,
                rated_album_count: row.get(2)?,
                partial_album_count: row.get(3)?,
                unrated_album_count: row.get(4)?,
                track_count: row.get(5)?,
                total_seconds: row.get(6)?,
                loved_tracks: row.get(7)?,
                average_album_score: row.get(8)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn track_rating_distribution(conn: &Connection) -> Result<Vec<RatingBucket>> {
    let mut counts = [0_i64; 6];
    let mut stmt = conn.prepare(
        "
        SELECT normalized_rating / 20, COUNT(*)
        FROM tracks
        WHERE normalized_rating IS NOT NULL
        GROUP BY normalized_rating / 20
        ",
    )?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let rating: i64 = row.get(0)?;
        if (0..=5).contains(&rating) {
            counts[rating as usize] = row.get(1)?;
        }
    }

    Ok((0..=5)
        .rev()
        .map(|rating| RatingBucket {
            label: rating.to_string(),
            count: counts[rating as usize],
        })
        .collect())
}

fn album_rating_distribution(conn: &Connection) -> Result<Vec<RatingBucket>> {
    let mut stmt = conn.prepare(
        "
        SELECT
            CASE
                WHEN effective_album_rating = 100 THEN '100'
                ELSE printf('%d-%d', (effective_album_rating / 10) * 10, ((effective_album_rating / 10) * 10) + 9)
            END,
            COUNT(*),
            CASE
                WHEN effective_album_rating = 100 THEN 100
                ELSE (effective_album_rating / 10) * 10
            END AS bucket
        FROM albums
        WHERE effective_album_rating IS NOT NULL
        GROUP BY bucket
        ORDER BY bucket DESC
        ",
    )?;

    let rows = stmt
        .query_map([], |row| {
            Ok(RatingBucket {
                label: row.get(0)?,
                count: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn coverage_metric(
    id: &str,
    label: &str,
    scope: &str,
    covered_count: i64,
    total_count: i64,
) -> MetadataCoverageMetric {
    MetadataCoverageMetric {
        id: id.to_string(),
        label: label.to_string(),
        scope: scope.to_string(),
        covered_count,
        total_count,
    }
}

fn metadata_coverage_stats(conn: &Connection) -> Result<Vec<MetadataCoverageMetric>> {
    let (
        album_total,
        album_title_count,
        album_artist_count,
        genre_count,
        year_count,
        release_year_count,
        publisher_count,
        album_rating_count,
    ) = conn
        .query_row(
            "
            SELECT
                COUNT(*),
                COALESCE(SUM(CASE WHEN NULLIF(TRIM(COALESCE(album, '')), '') IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN NULLIF(TRIM(COALESCE(album_artist_display, '')), '') IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN NULLIF(TRIM(COALESCE(genre_normalized, '')), '') IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN year IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN release_year IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN NULLIF(TRIM(COALESCE(publisher, '')), '') IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN effective_album_rating IS NOT NULL THEN 1 ELSE 0 END), 0)
            FROM albums
            ",
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, i64>(7)?,
                ))
            },
        )
        .context("Could not load album metadata coverage")?;
    let (
        track_total,
        track_title_count,
        display_artist_count,
        track_number_count,
        disc_number_count,
        duration_count,
        filename_count,
        track_rating_count,
    ) = conn
        .query_row(
            "
            SELECT
                COUNT(*),
                COALESCE(SUM(CASE WHEN NULLIF(TRIM(COALESCE(title, '')), '') IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN NULLIF(TRIM(COALESCE(display_artist, '')), '') IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN track_number IS NOT NULL AND track_number > 0 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN disc_number IS NOT NULL AND disc_number > 0 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN time_seconds IS NOT NULL AND time_seconds > 0 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN NULLIF(TRIM(COALESCE(filename, '')), '') IS NOT NULL THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN normalized_rating IS NOT NULL THEN 1 ELSE 0 END), 0)
            FROM tracks
            ",
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, i64>(7)?,
                ))
            },
        )
        .context("Could not load track metadata coverage")?;
    let cover_count = conn
        .query_row(
            "
            SELECT COUNT(DISTINCT a.id)
            FROM albums a
            JOIN album_covers c ON c.album_id = a.id
            ",
            [],
            |row| row.get::<_, i64>(0),
        )
        .context("Could not load artwork metadata coverage")?;

    Ok(vec![
        coverage_metric(
            "album-title",
            "Album title",
            "Albums",
            album_title_count,
            album_total,
        ),
        coverage_metric(
            "album-artist",
            "Album artist",
            "Albums",
            album_artist_count,
            album_total,
        ),
        coverage_metric("genre", "Genre", "Albums", genre_count, album_total),
        coverage_metric("year", "Year", "Albums", year_count, album_total),
        coverage_metric(
            "release-year",
            "Release year",
            "Albums",
            release_year_count,
            album_total,
        ),
        coverage_metric(
            "publisher",
            "Publisher",
            "Albums",
            publisher_count,
            album_total,
        ),
        coverage_metric(
            "track-title",
            "Track title",
            "Tracks",
            track_title_count,
            track_total,
        ),
        coverage_metric(
            "display-artist",
            "Display artist",
            "Tracks",
            display_artist_count,
            track_total,
        ),
        coverage_metric(
            "track-number",
            "Track number",
            "Tracks",
            track_number_count,
            track_total,
        ),
        coverage_metric(
            "disc-number",
            "Disc number",
            "Tracks",
            disc_number_count,
            track_total,
        ),
        coverage_metric(
            "duration",
            "Duration",
            "Tracks",
            duration_count,
            track_total,
        ),
        coverage_metric(
            "filename",
            "Filename",
            "Tracks",
            filename_count,
            track_total,
        ),
        coverage_metric(
            "cover-art",
            "Cover art",
            "Artwork",
            cover_count,
            album_total,
        ),
        coverage_metric(
            "track-rating",
            "Track rating",
            "Ratings",
            track_rating_count,
            track_total,
        ),
        coverage_metric(
            "album-rating",
            "Album rating",
            "Ratings",
            album_rating_count,
            album_total,
        ),
    ])
}

fn loved_track_stats(conn: &Connection) -> Result<LovedTrackStats> {
    let (loved_tracks, albums_with_loved_tracks, average_loved_tracks_per_album) = conn
        .query_row(
            "
            SELECT
                COALESCE(SUM(loved_tracks), 0),
                COALESCE(SUM(CASE WHEN loved_tracks > 0 THEN 1 ELSE 0 END), 0),
                AVG(CASE WHEN loved_tracks > 0 THEN loved_tracks END)
            FROM albums
            ",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .context("Could not load loved-track totals")?;

    let top_loved_genre = conn
        .query_row(
            "
            SELECT canonical_genre
            FROM albums
            WHERE loved_tracks > 0
              AND NULLIF(TRIM(COALESCE(canonical_genre, '')), '') IS NOT NULL
            GROUP BY genre_normalized, canonical_genre
            ORDER BY SUM(loved_tracks) DESC, COUNT(*) DESC
            LIMIT 1
            ",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .context("Could not load top loved genre")?;

    let top_loved_year = conn
        .query_row(
            "
            SELECT year
            FROM albums
            WHERE loved_tracks > 0 AND year IS NOT NULL
            GROUP BY year
            ORDER BY SUM(loved_tracks) DESC, COUNT(*) DESC
            LIMIT 1
            ",
            [],
            |row| row.get::<_, i32>(0),
        )
        .optional()
        .context("Could not load top loved year")?;

    Ok(LovedTrackStats {
        loved_tracks,
        albums_with_loved_tracks,
        average_loved_tracks_per_album,
        top_loved_genre,
        top_loved_year,
    })
}

fn rating_history(
    conn: &Connection,
    current_progress: &RatingProgressStats,
    overview: &LibraryOverviewStats,
) -> Result<Vec<RatingHistoryPoint>> {
    let mut stmt = conn.prepare(
        "
        SELECT
            s.import_run_id,
            s.created_at,
            s.track_count,
            s.album_count,
            s.rated_tracks,
            s.unrated_tracks,
            s.fully_rated_albums,
            s.partially_rated_albums,
            s.unrated_albums,
            s.albums_with_effective_rating,
            s.average_album_rating,
            s.average_album_score,
            COALESCE(r.rating_events_count, 0)
        FROM rating_snapshots s
        LEFT JOIN import_runs r ON r.id = s.import_run_id
        ORDER BY s.created_at ASC, s.id ASC
        ",
    )?;

    let mut points = stmt
        .query_map([], |row| {
            Ok(RatingHistoryPoint {
                import_run_id: row.get(0)?,
                created_at: row.get(1)?,
                track_count: row.get(2)?,
                album_count: row.get(3)?,
                rated_tracks: row.get(4)?,
                unrated_tracks: row.get(5)?,
                fully_rated_albums: row.get(6)?,
                partially_rated_albums: row.get(7)?,
                unrated_albums: row.get(8)?,
                albums_with_effective_rating: row.get(9)?,
                average_album_rating: row.get(10)?,
                average_album_score: row.get(11)?,
                rating_events_count: row.get(12)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    if points.is_empty() {
        if let Some(run) = list_import_runs(conn, 1)?.into_iter().next() {
            points.push(RatingHistoryPoint {
                import_run_id: run.id,
                created_at: run.completed_at.unwrap_or(run.started_at),
                track_count: overview.track_count,
                album_count: overview.album_count,
                rated_tracks: current_progress.rated_tracks,
                unrated_tracks: current_progress.unrated_tracks,
                fully_rated_albums: current_progress.fully_rated_albums,
                partially_rated_albums: current_progress.partially_rated_albums,
                unrated_albums: current_progress.unrated_albums,
                albums_with_effective_rating: current_progress.albums_with_effective_rating,
                average_album_rating: current_progress.average_album_rating,
                average_album_score: overview.average_album_score,
                rating_events_count: run.rating_events_count,
            });
        }
    }

    Ok(points)
}

fn recent_rating_events(conn: &Connection, limit: u32) -> Result<Vec<RatingEvent>> {
    let mut stmt = conn.prepare(
        "
        SELECT
            id,
            import_run_id,
            created_at,
            event_type,
            album_id,
            album,
            album_artist_display,
            year,
            previous_rated_tracks,
            current_rated_tracks,
            previous_rating_completeness,
            current_rating_completeness,
            previous_effective_album_rating,
            current_effective_album_rating
        FROM rating_events
        ORDER BY id DESC
        LIMIT ?1
        ",
    )?;

    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(RatingEvent {
                id: row.get(0)?,
                import_run_id: row.get(1)?,
                created_at: row.get(2)?,
                event_type: row.get(3)?,
                album_id: row.get(4)?,
                album: row.get(5)?,
                album_artist_display: row.get(6)?,
                year: row.get(7)?,
                previous_rated_tracks: row.get(8)?,
                current_rated_tracks: row.get(9)?,
                previous_rating_completeness: row.get(10)?,
                current_rating_completeness: row.get(11)?,
                previous_effective_album_rating: row.get(12)?,
                current_effective_album_rating: row.get(13)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub fn get_import_run(conn: &Connection, id: i64) -> Result<ImportRun> {
    conn.query_row(
        "
        SELECT id, source_path, source_size_bytes, started_at, completed_at, status,
               track_rows, album_count, duration_ms, backup_path, error_message,
               added_tracks, changed_tracks, removed_tracks, added_albums,
               changed_albums, removed_albums, rating_events_count
        FROM import_runs
        WHERE id = ?1
        ",
        params![id],
        import_run_from_row,
    )
    .with_context(|| format!("Could not load import run {id}"))
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
    let (conn, _) = open(app)?;
    ensure_search_indexes(&conn)?;
    search_library(&conn, request, 500)
}

#[cfg(not(test))]
pub fn list_artists_for_app(
    app: &AppHandle,
    request: ArtistListRequest,
) -> Result<ArtistListResponse> {
    let (conn, _) = open(app)?;
    list_artists(&conn, request, 500)
}

#[cfg(not(test))]
pub fn list_genres_for_app(
    app: &AppHandle,
    request: GenreListRequest,
) -> Result<GenreListResponse> {
    let (conn, _) = open(app)?;
    list_genres(&conn, request, 2000)
}

#[cfg(not(test))]
pub fn genre_suggestion_names_for_app(app: &AppHandle) -> Result<Vec<String>> {
    let (conn, _) = open(app)?;
    genre_suggestion_names(&conn)
}

#[cfg(not(test))]
pub fn discovery_for_app(app: &AppHandle) -> Result<DiscoveryResponse> {
    let (conn, _) = open(app)?;
    discovery(&conn)
}

#[cfg(not(test))]
pub fn list_music_tools_for_app(app: &AppHandle) -> Result<Vec<MusicToolSummary>> {
    let (conn, _) = open(app)?;
    list_music_tools(&conn)
}

#[cfg(not(test))]
pub fn list_music_tool_issues_for_app(
    app: &AppHandle,
    request: MusicToolIssueRequest,
) -> Result<MusicToolIssueResponse> {
    let (mut conn, _) = open(app)?;
    let tool_id = request.tool_id.clone();
    let request_id = request.request_id.clone();
    ensure_music_tool_data_for_request(app, &mut conn, &request)?;
    let result = list_music_tool_issues(&conn, request, 500, Some(app));
    if result.is_err() {
        emit_music_tool_progress(
            Some(app),
            &tool_id,
            &request_id,
            "failed",
            100,
            "Validation count failed.",
        );
    }
    result
}

#[cfg(not(test))]
pub fn fix_music_tool_issues_for_app(
    app: &AppHandle,
    input: MusicToolFixRequest,
) -> Result<MusicToolFixSummary> {
    let (mut conn, db_path) = open(app)?;
    fix_music_tool_issues(&mut conn, Some(db_path.as_path()), input)
}

#[cfg(not(test))]
fn ensure_music_tool_data_for_request(
    app: &AppHandle,
    conn: &mut Connection,
    request: &MusicToolIssueRequest,
) -> Result<()> {
    match request.tool_id.as_str() {
        "missing-billboard-albums" => {
            if count_rows(conn, "billboard_chart_entries")? > 0 {
                return Ok(());
            }

            let Ok(source_path) = resolve_billboard_source_path("CSV") else {
                return Ok(());
            };

            emit_music_tool_progress(
                Some(app),
                &request.tool_id,
                &request.request_id,
                "loading",
                15,
                "Preparing Billboard chart rows from CSV.",
            );
            import_billboard_charts(conn, &source_path)
                .context("Could not prepare Missing Billboard Albums data from CSV")?;
        }
        "missing-billboard-singles" => {
            if count_rows(conn, "billboard_single_chart_entries")? > 0 {
                return Ok(());
            }

            let Ok(source_path) = resolve_billboard_source_path("CSV_SINGLES") else {
                return Ok(());
            };

            emit_music_tool_progress(
                Some(app),
                &request.tool_id,
                &request.request_id,
                "loading",
                15,
                "Preparing Billboard singles chart rows from CSV_SINGLES.",
            );
            import_billboard_singles(conn, &source_path)
                .context("Could not prepare Missing Billboard Singles data from CSV_SINGLES")?;
        }
        "artists-without-musicbrainz-data" | "high-confidence-missing-musicbrainz-albums" => {
            emit_music_tool_progress(
                Some(app),
                &request.tool_id,
                &request.request_id,
                "loading",
                15,
                "Preparing MusicBrainz collection comparison.",
            );
            let settings = settings_for_connection(conn)?;
            prepare_missing_musicbrainz_artist_tool(conn, &settings.musicbrainz_cache_path)
                .context("Could not prepare MusicBrainz collection coverage data")?;
        }
        _ => {}
    }

    Ok(())
}

#[derive(Debug)]
struct MissingMusicBrainzLocalArtist {
    artist_key: String,
    display_artist: String,
    album_count: i64,
    track_count: i64,
    first_year: Option<i32>,
    last_year: Option<i32>,
    sample_album: Option<String>,
}

#[derive(Debug)]
struct MissingMusicBrainzLocalAlbum {
    artist_key: String,
    album_id: String,
    title: String,
    year: Option<i32>,
}

#[derive(Debug)]
struct MissingMusicBrainzCacheArtist {
    name: String,
    mbid: String,
    cached_name_count: i64,
    release_group_count: i64,
}

#[derive(Debug)]
struct MissingMusicBrainzReleaseGroup {
    artist_mbid: String,
    release_mbid: String,
    title: String,
    year: Option<i32>,
    track_count: Option<i64>,
    source: String,
}

fn prepare_missing_musicbrainz_artist_tool(conn: &mut Connection, cache_path: &str) -> Result<()> {
    conn.execute_batch(
        "
        DROP TABLE IF EXISTS temp.musicbrainz_tool_local_artists;
        DROP TABLE IF EXISTS temp.musicbrainz_tool_local_albums;
        DROP TABLE IF EXISTS temp.musicbrainz_tool_artist_cache;
        DROP TABLE IF EXISTS temp.musicbrainz_tool_release_groups;

        CREATE TEMP TABLE musicbrainz_tool_local_artists (
            artist_key TEXT PRIMARY KEY,
            display_artist TEXT NOT NULL,
            musicbrainz_name_key TEXT NOT NULL,
            album_count INTEGER NOT NULL,
            track_count INTEGER NOT NULL,
            first_year INTEGER,
            last_year INTEGER,
            sample_album TEXT
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
            track_count INTEGER,
            source TEXT NOT NULL
        );

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
        ",
    )
    .context("Could not create MusicBrainz artist tool temp tables")?;

    let local_artists = musicbrainz_tool_local_artists(conn)?;
    {
        let mut stmt = conn
            .prepare(
                "
                INSERT INTO musicbrainz_tool_local_artists (
                    artist_key, display_artist, musicbrainz_name_key, album_count,
                    track_count, first_year, last_year, sample_album
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                ",
            )
            .context("Could not prepare local MusicBrainz artist temp insert")?;
        for artist in local_artists {
            let musicbrainz_name_key = musicbrainz_text_key(&artist.display_artist);
            stmt.execute(params![
                artist.artist_key,
                artist.display_artist,
                musicbrainz_name_key,
                artist.album_count,
                artist.track_count,
                artist.first_year,
                artist.last_year,
                artist.sample_album,
            ])
            .context("Could not insert local MusicBrainz artist temp row")?;
        }
    }

    let local_albums = musicbrainz_tool_local_albums(conn)?;
    {
        let mut stmt = conn
            .prepare(
                "
                INSERT INTO musicbrainz_tool_local_albums (
                    artist_key, album_id, title, title_key, year
                ) VALUES (?1, ?2, ?3, ?4, ?5)
                ",
            )
            .context("Could not prepare local MusicBrainz album temp insert")?;
        for album in local_albums {
            let title_key = musicbrainz_text_key(&album.title);
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

    let cache_artists = musicbrainz_tool_cache_artists(cache_path)?;
    {
        let mut stmt = conn
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
            let local_name_key = normalize_artist_key(&artist.name);
            let musicbrainz_name_key = musicbrainz_text_key(&artist.name);
            stmt.execute(params![
                artist.name,
                artist.mbid,
                local_name_key,
                musicbrainz_name_key,
                artist.cached_name_count,
                artist.release_group_count,
            ])
            .context("Could not insert MusicBrainz cache artist temp row")?;
        }
    }

    let matched_mbids = musicbrainz_tool_matched_mbids(conn)?;
    let release_groups = musicbrainz_tool_cache_release_groups(cache_path, &matched_mbids)?;
    insert_musicbrainz_tool_release_groups(conn, release_groups)?;
    let overlay_release_groups = musicbrainz_tool_overlay_release_groups(conn, &matched_mbids)?;
    insert_musicbrainz_tool_release_groups(conn, overlay_release_groups)?;

    Ok(())
}

fn musicbrainz_tool_local_artists(conn: &Connection) -> Result<Vec<MissingMusicBrainzLocalArtist>> {
    let artist_key_sql = artist_key_sql("album_artist_display");
    let sql = format!(
        "
        WITH album_artists AS (
            SELECT
                {artist_key_sql} AS artist_key,
                NULLIF(TRIM(album_artist_display), '') AS display_artist,
                id,
                NULLIF(TRIM(album), '') AS album,
                year,
                total_tracks
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
        )
        SELECT
            aa.artist_key,
            rn.display_artist,
            COUNT(DISTINCT aa.id) AS album_count,
            SUM(COALESCE(aa.total_tracks, 0)) AS track_count,
            MIN(aa.year) AS first_year,
            MAX(aa.year) AS last_year,
            MIN(aa.album) AS sample_album
        FROM album_artists aa
        JOIN ranked_names rn
          ON rn.artist_key = aa.artist_key
         AND rn.name_rank = 1
        GROUP BY aa.artist_key, rn.display_artist
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
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load local MusicBrainz artist coverage rows")?;
    Ok(rows)
}

fn musicbrainz_tool_local_albums(conn: &Connection) -> Result<Vec<MissingMusicBrainzLocalAlbum>> {
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

fn musicbrainz_tool_cache_artists(cache_path: &str) -> Result<Vec<MissingMusicBrainzCacheArtist>> {
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

fn musicbrainz_tool_matched_mbids(conn: &Connection) -> Result<Vec<String>> {
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

fn musicbrainz_tool_cache_release_groups(
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
            SELECT artist_mbid, release_mbid, title, year, track_count
            FROM release_groups
            WHERE LOWER(artist_mbid) IN ({placeholders})
              AND status = 'Official'
              AND type = 'Album'
              AND COALESCE(secondary_types, '') = ''
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
                    track_count: row.get(4)?,
                    source: "cache".to_string(),
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()
            .context("Could not load MusicBrainz cache release-group rows")?;
        rows.extend(chunk_rows);
    }

    Ok(rows)
}

fn musicbrainz_tool_overlay_release_groups(
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
            SELECT artist_mbid, release_mbid, title, year, track_count
            FROM musicbrainz_artist_release_groups
            WHERE status = 'Official'
              AND type = 'Album'
              AND COALESCE(secondary_types, '') = ''
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
                track_count: row.get(4)?,
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

fn insert_musicbrainz_tool_release_groups(
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
                artist_mbid, release_mbid, title, title_key, year, track_count, source
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ",
        )
        .context("Could not prepare MusicBrainz release-group temp insert")?;
    for release_group in release_groups {
        let title_key = musicbrainz_text_key(&release_group.title);
        stmt.execute(params![
            release_group.artist_mbid,
            release_group.release_mbid,
            release_group.title,
            title_key,
            release_group.year,
            release_group.track_count,
            release_group.source,
        ])
        .context("Could not insert MusicBrainz release-group temp row")?;
    }

    Ok(())
}

fn resolve_musicbrainz_cache_path(cache_path: &str) -> Result<PathBuf> {
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

fn validate_musicbrainz_tool_cache_schema(conn: &Connection) -> Result<()> {
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

#[cfg(not(test))]
pub fn list_saved_searches_for_app(app: &AppHandle) -> Result<Vec<SavedSearch>> {
    let (conn, _) = open(app)?;
    let mut stmt = conn.prepare(
        "
        SELECT id, name, view, request_json, created_at, updated_at
        FROM saved_queries
        ORDER BY updated_at DESC, id DESC
        ",
    )?;

    let searches = stmt
        .query_map([], |row| {
            let request_json: String = row.get(3)?;
            let request =
                serde_json::from_str::<BrowseRequest>(&request_json).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        3,
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?;

            Ok(SavedSearch {
                id: row.get(0)?,
                name: row.get(1)?,
                view: row.get(2)?,
                request,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(searches)
}

#[cfg(not(test))]
pub fn save_search_for_app(app: &AppHandle, input: SaveSearchRequest) -> Result<SavedSearch> {
    let (conn, _) = open(app)?;
    let name = input.name.trim();
    if name.is_empty() {
        bail!("Name the search before saving it");
    }

    let now = Utc::now().to_rfc3339();
    let request_json =
        serde_json::to_string(&input.request).context("Could not serialize search")?;
    conn.execute(
        "
        INSERT INTO saved_queries (name, view, request_json, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?4)
        ",
        params![name, input.request.view, request_json, now],
    )
    .context("Could not save search")?;

    let id = conn.last_insert_rowid();
    let saved = list_saved_searches_for_app(app)?
        .into_iter()
        .find(|search| search.id == id)
        .context("Could not reload saved search")?;
    Ok(saved)
}

#[cfg(not(test))]
pub fn delete_saved_search_for_app(app: &AppHandle, id: i64) -> Result<()> {
    let (conn, _) = open(app)?;
    conn.execute("DELETE FROM saved_queries WHERE id = ?1", params![id])
        .with_context(|| format!("Could not delete saved search {id}"))?;
    Ok(())
}

#[cfg(not(test))]
pub fn list_saved_charts_for_app(app: &AppHandle) -> Result<Vec<SavedChart>> {
    let (conn, _) = open(app)?;
    let mut stmt = conn.prepare(
        "
        SELECT id, name, config_json, created_at, updated_at
        FROM saved_charts
        ORDER BY updated_at DESC, id DESC
        ",
    )?;

    let charts = stmt
        .query_map([], |row| {
            let config_json: String = row.get(2)?;
            let config = serde_json::from_str::<ChartConfig>(&config_json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    2,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?;
            let config = normalize_chart_config(config);

            Ok(SavedChart {
                id: row.get(0)?,
                name: row.get(1)?,
                config,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(charts)
}

#[cfg(not(test))]
pub fn save_chart_for_app(app: &AppHandle, input: SaveChartRequest) -> Result<SavedChart> {
    let (conn, _) = open(app)?;
    let name = input.name.trim();
    if name.is_empty() {
        bail!("Name the chart before saving it");
    }

    let config = normalize_chart_config(input.config);
    let now = Utc::now().to_rfc3339();
    let config_json = serde_json::to_string(&config).context("Could not serialize chart")?;
    conn.execute(
        "
        INSERT INTO saved_charts (name, config_json, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?3)
        ",
        params![name, config_json, now],
    )
    .context("Could not save chart")?;

    let id = conn.last_insert_rowid();
    let saved = list_saved_charts_for_app(app)?
        .into_iter()
        .find(|chart| chart.id == id)
        .context("Could not reload saved chart")?;
    Ok(saved)
}

#[cfg(not(test))]
pub fn delete_saved_chart_for_app(app: &AppHandle, id: i64) -> Result<()> {
    let (conn, _) = open(app)?;
    conn.execute("DELETE FROM saved_charts WHERE id = ?1", params![id])
        .with_context(|| format!("Could not delete saved chart {id}"))?;
    Ok(())
}

#[cfg(not(test))]
pub fn export_search_for_app(app: &AppHandle, input: ExportSearchRequest) -> Result<ExportResult> {
    let format = input.format.trim().to_lowercase();
    if !matches!(format.as_str(), "csv" | "tsv" | "json" | "txt" | "xlsx") {
        bail!("Unsupported export format: {}", input.format);
    }

    let (conn, _) = open(app)?;
    ensure_search_indexes(&conn)?;

    let mut request = input.request.clone();
    request.offset = 0;
    request.limit = 100_000;
    let response = search_library(&conn, request.clone(), 100_000)?;

    let export_dir = app
        .path()
        .app_data_dir()
        .context("Could not resolve the app data directory")?
        .join("exports");
    fs::create_dir_all(&export_dir).context("Could not create export directory")?;

    let path = export_dir.join(format!(
        "music-library-{}-{}.{}",
        normalize_view(&request.view),
        Utc::now().format("%Y%m%d-%H%M%S"),
        format
    ));

    write_export_file(
        &path,
        &format,
        &request.view,
        &response.rows,
        input.include_calculated,
        &input.export_columns,
    )
    .with_context(|| format!("Could not write export {}", path.display()))?;

    let request_json =
        serde_json::to_string(&request).context("Could not serialize export query")?;
    conn.execute(
        "
        INSERT INTO exports (created_at, view, format, row_count, path, request_json)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ",
        params![
            Utc::now().to_rfc3339(),
            normalize_view(&request.view),
            &format,
            response.rows.len() as i64,
            path.display().to_string(),
            request_json
        ],
    )
    .context("Could not record export")?;

    Ok(ExportResult {
        path: path.display().to_string(),
        format,
        row_count: response.rows.len(),
    })
}

#[cfg(not(test))]
pub fn export_music_tool_issues_for_app(
    app: &AppHandle,
    input: ExportMusicToolRequest,
) -> Result<ExportResult> {
    let format = input.format.trim().to_lowercase();
    if !matches!(format.as_str(), "csv" | "tsv" | "json" | "txt" | "xlsx") {
        bail!("Unsupported export format: {}", input.format);
    }

    let (mut conn, _) = open(app)?;
    let mut request = input.request.clone();
    request.request_id = String::new();
    request.limit = 100_000;
    request.offset = 0;
    ensure_music_tool_data_for_request(app, &mut conn, &request)?;
    let response = list_music_tool_issues(&conn, request.clone(), 100_000, None)?;

    let export_dir = app
        .path()
        .app_data_dir()
        .context("Could not resolve the app data directory")?
        .join("exports");
    fs::create_dir_all(&export_dir).context("Could not create export directory")?;

    let path = export_dir.join(format!(
        "music-library-tools-{}-{}.{}",
        safe_file_segment(&response.tool.id),
        Utc::now().format("%Y%m%d-%H%M%S"),
        format
    ));

    write_issue_export_file(&path, &format, &response.rows)
        .with_context(|| format!("Could not write export {}", path.display()))?;

    let request_json =
        serde_json::to_string(&request).context("Could not serialize music tool export query")?;
    conn.execute(
        "
        INSERT INTO exports (created_at, view, format, row_count, path, request_json)
        VALUES (?1, 'tools', ?2, ?3, ?4, ?5)
        ",
        params![
            Utc::now().to_rfc3339(),
            &format,
            response.rows.len() as i64,
            path.display().to_string(),
            request_json
        ],
    )
    .context("Could not record music tool export")?;

    Ok(ExportResult {
        path: path.display().to_string(),
        format,
        row_count: response.rows.len(),
    })
}

fn import_run_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ImportRun> {
    Ok(ImportRun {
        id: row.get(0)?,
        source_path: row.get(1)?,
        source_size_bytes: row.get(2)?,
        started_at: row.get(3)?,
        completed_at: row.get(4)?,
        status: row.get(5)?,
        track_rows: row.get(6)?,
        album_count: row.get(7)?,
        duration_ms: row.get(8)?,
        backup_path: row.get(9)?,
        error_message: row.get(10)?,
        added_tracks: row.get(11)?,
        changed_tracks: row.get(12)?,
        removed_tracks: row.get(13)?,
        added_albums: row.get(14)?,
        changed_albums: row.get(15)?,
        removed_albums: row.get(16)?,
        rating_events_count: row.get(17)?,
    })
}

fn count_rows(conn: &Connection, table: &str) -> Result<i64> {
    let sql = format!("SELECT COUNT(*) FROM {table}");
    conn.query_row(&sql, [], |row| row.get(0))
        .with_context(|| format!("Could not count rows in {table}"))
}

fn ensure_search_indexes(conn: &Connection) -> Result<()> {
    let album_count = count_rows(conn, "albums")?;
    let track_count = count_rows(conn, "tracks")?;
    let album_fts_count = count_rows(conn, "album_search_fts")?;
    let track_fts_count = count_rows(conn, "track_search_fts")?;

    if album_count != album_fts_count || track_count != track_fts_count {
        rebuild_search_indexes(conn)?;
    }

    Ok(())
}

fn performance_probe(conn: &Connection, database_path: String) -> Result<PerformanceProbeResponse> {
    ensure_search_indexes(conn)?;

    let started = Instant::now();
    let track_count = count_rows(conn, "tracks")?;
    let album_count = count_rows(conn, "albums")?;
    let album_sample = performance_probe_sample_text(conn, "albums", "album")?;
    let track_sample = performance_probe_sample_text(conn, "tracks", "title")?;

    let mut operations = Vec::new();
    operations.push(measure_performance_operation(
        "search-albums-default",
        "Album search default page",
        "Search",
        || {
            let mut request = BrowseRequest::default();
            request.limit = 50;
            let response = search_library(conn, request, 500)?;
            Ok(performance_probe_sample(
                Some(response.total),
                Some(response.rows.len()),
                "Default album page, sorted by album.".to_string(),
            ))
        },
    ));
    operations.push(measure_performance_operation(
        "search-albums-sampled-text",
        "Album search sampled text",
        "Search",
        || {
            let mut request = BrowseRequest::default();
            request.search_text = album_sample.clone().unwrap_or_default();
            request.limit = 50;
            let response = search_library(conn, request, 500)?;
            Ok(performance_probe_sample(
                Some(response.total),
                Some(response.rows.len()),
                performance_probe_text_detail("album", album_sample.as_deref()),
            ))
        },
    ));
    operations.push(measure_performance_operation(
        "search-tracks-sampled-text",
        "Track search sampled text",
        "Search",
        || {
            let mut request = BrowseRequest::default();
            request.view = "tracks".to_string();
            request.search_text = track_sample.clone().unwrap_or_default();
            request.sort = BrowseSort {
                field: "title".to_string(),
                direction: "asc".to_string(),
            };
            request.limit = 50;
            let response = search_library(conn, request, 500)?;
            Ok(performance_probe_sample(
                Some(response.total),
                Some(response.rows.len()),
                performance_probe_text_detail("track", track_sample.as_deref()),
            ))
        },
    ));
    operations.push(measure_performance_operation(
        "chart-album-score",
        "Chart-style album score ranking",
        "Charts",
        || {
            let mut request = BrowseRequest::default();
            request.sort = BrowseSort {
                field: "albumScore".to_string(),
                direction: "desc".to_string(),
            };
            request.filters.rating_completeness_min = Some(100.0);
            request.limit = 50;
            let response = search_library(conn, request, 500)?;
            Ok(performance_probe_sample(
                Some(response.total),
                Some(response.rows.len()),
                "Fully rated albums sorted by Album Score.".to_string(),
            ))
        },
    ));
    operations.push(measure_performance_operation(
        "tools-missing-covers",
        "Music Tool missing covers",
        "Tools",
        || {
            let request = MusicToolIssueRequest {
                tool_id: "albums-without-cover-image".to_string(),
                request_id: String::new(),
                search_text: String::new(),
                sort: BrowseSort::default(),
                limit: 50,
                offset: 0,
            };
            let response = list_music_tool_issues(conn, request, 500, None)?;
            Ok(performance_probe_sample(
                Some(response.total),
                Some(response.rows.len()),
                "Albums without imported cover records.".to_string(),
            ))
        },
    ));
    operations.push(measure_performance_operation(
        "tools-whitespace",
        "Music Tool whitespace anomalies",
        "Tools",
        || {
            let request = MusicToolIssueRequest {
                tool_id: "whitespace-anomalies".to_string(),
                request_id: String::new(),
                search_text: String::new(),
                sort: BrowseSort::default(),
                limit: 50,
                offset: 0,
            };
            let response = list_music_tool_issues(conn, request, 500, None)?;
            Ok(performance_probe_sample(
                Some(response.total),
                Some(response.rows.len()),
                "Repeated whitespace validator.".to_string(),
            ))
        },
    ));
    operations.push(measure_performance_operation(
        "statistics-dashboard",
        "Statistics dashboard payload",
        "Statistics",
        || {
            let response = statistics(conn)?;
            Ok(performance_probe_sample(
                Some(response.overview.track_count),
                Some(response.import_history.len()),
                format!(
                    "{} albums / {} genres / {} import runs.",
                    response.overview.album_count,
                    response.overview.genre_count,
                    response.import_history.len()
                ),
            ))
        },
    ));
    operations.push(measure_performance_operation(
        "discovery-dashboard",
        "Discovery dashboard payload",
        "Discovery",
        || {
            let response = discovery(conn)?;
            let row_count = response.heatmap.len()
                + response.backlog_missions.len()
                + response.smart_missions.len()
                + response.love_rating_points.len()
                + response.genre_points.len()
                + response.artist_points.len();
            Ok(performance_probe_sample(
                Some(row_count as i64),
                Some(row_count),
                format!(
                    "{} heatmap cells / {} missions / {} discovery points.",
                    response.heatmap.len(),
                    response.backlog_missions.len() + response.smart_missions.len(),
                    response.love_rating_points.len()
                        + response.genre_points.len()
                        + response.artist_points.len()
                ),
            ))
        },
    ));

    let slowest_operation_ms = operations
        .iter()
        .map(|operation| operation.duration_ms)
        .max()
        .unwrap_or_default();

    Ok(PerformanceProbeResponse {
        generated_at: Utc::now().to_rfc3339(),
        database_path,
        track_count,
        album_count,
        total_duration_ms: started.elapsed().as_millis(),
        slowest_operation_ms,
        operations,
    })
}

fn measure_performance_operation<F>(
    id: &str,
    label: &str,
    category: &str,
    operation: F,
) -> PerformanceProbeOperation
where
    F: FnOnce() -> Result<PerformanceProbeSample>,
{
    let started = Instant::now();
    match operation() {
        Ok(sample) => PerformanceProbeOperation {
            id: id.to_string(),
            label: label.to_string(),
            category: category.to_string(),
            status: "ok".to_string(),
            duration_ms: started.elapsed().as_millis(),
            total_count: sample.total_count,
            row_count: sample.row_count,
            detail: sample.detail,
            error_message: None,
        },
        Err(error) => PerformanceProbeOperation {
            id: id.to_string(),
            label: label.to_string(),
            category: category.to_string(),
            status: "failed".to_string(),
            duration_ms: started.elapsed().as_millis(),
            total_count: None,
            row_count: None,
            detail: "Operation failed before producing counts.".to_string(),
            error_message: Some(error.to_string()),
        },
    }
}

fn performance_probe_sample(
    total_count: Option<i64>,
    row_count: Option<usize>,
    detail: String,
) -> PerformanceProbeSample {
    PerformanceProbeSample {
        total_count,
        row_count,
        detail,
    }
}

fn performance_probe_text_detail(entity: &str, sample: Option<&str>) -> String {
    match sample {
        Some(value) => format!("Sampled {entity} text: {value}"),
        None => format!("No {entity} sample found; measured an empty-text query."),
    }
}

fn performance_probe_sample_text(
    conn: &Connection,
    table: &str,
    column: &str,
) -> Result<Option<String>> {
    let sql = format!(
        "
        SELECT {column}
        FROM {table}
        WHERE NULLIF(TRIM(COALESCE({column}, '')), '') IS NOT NULL
        ORDER BY id
        LIMIT 1
        "
    );
    conn.query_row(&sql, [], |row| row.get::<_, String>(0))
        .optional()
        .with_context(|| format!("Could not select performance probe sample from {table}.{column}"))
}

fn list_artists(
    conn: &Connection,
    request: ArtistListRequest,
    max_limit: u32,
) -> Result<ArtistListResponse> {
    let limit = request.limit.clamp(1, max_limit);
    let offset = request.offset;
    let (where_sql, values) = artist_search_where(&request.search_text);
    let album_artist_key_sql = artist_key_sql("album_artist_display");
    let album_artist_key_sql_a2 = artist_key_sql("a2.album_artist_display");

    let count_sql = format!(
        "
        SELECT COUNT(*)
        FROM (
            SELECT {album_artist_key_sql} AS artist_key
            FROM albums
            {where_sql}
            GROUP BY artist_key
        )
        "
    );
    let total = conn
        .query_row(&count_sql, params_from_iter(values.iter()), |row| {
            row.get(0)
        })
        .context("Could not count artist results")?;

    let order_sql = artist_order_clause(&request.sort);
    let sql = format!(
        "
        WITH grouped AS (
            SELECT
                {album_artist_key_sql} AS artist_key,
                COALESCE(MIN(NULLIF(TRIM(album_artist_display), '')), 'Unknown Artist') AS artist_name,
                COUNT(*) AS album_count,
                SUM(CASE WHEN rating_completeness >= 1.0 THEN 1 ELSE 0 END) AS rated_album_count,
                SUM(CASE WHEN rating_completeness > 0.0 AND rating_completeness < 1.0 THEN 1 ELSE 0 END) AS partial_album_count,
                SUM(CASE WHEN rating_completeness = 0.0 THEN 1 ELSE 0 END) AS unrated_album_count,
                COALESCE(SUM(total_tracks), 0) AS track_count,
                COALESCE(SUM(total_seconds), 0) AS total_seconds,
                COALESCE(SUM(loved_tracks), 0) AS loved_tracks,
                COALESCE(SUM(tmoe_seconds), 0) AS tmoe_seconds,
                AVG(rating_completeness) AS average_rating_completeness,
                AVG(effective_album_rating) AS average_album_rating,
                AVG(album_score) AS average_album_score,
                MIN(year) AS first_year,
                MAX(year) AS last_year
            FROM albums
            {where_sql}
            GROUP BY artist_key
        )
        SELECT
            artist_key,
            artist_name,
            album_count,
            rated_album_count,
            partial_album_count,
            unrated_album_count,
            track_count,
            total_seconds,
            loved_tracks,
            tmoe_seconds,
            average_rating_completeness,
            average_album_rating,
            average_album_score,
            first_year,
            last_year,
            (
                SELECT COALESCE(NULLIF(TRIM(a2.canonical_genre), ''), 'Unknown')
                FROM albums a2
                WHERE {album_artist_key_sql_a2} = grouped.artist_key
                GROUP BY COALESCE(NULLIF(TRIM(LOWER(a2.genre_normalized)), ''), 'unknown')
                ORDER BY COUNT(*) DESC, LOWER(COALESCE(a2.canonical_genre, '')) ASC
                LIMIT 1
            ) AS top_genre,
            COALESCE(link.mbid, info.mbid) AS music_brainz_mbid,
            info.sort_name AS music_brainz_sort_name,
            info.artist_type AS music_brainz_artist_type,
            info.gender AS music_brainz_gender,
            info.life_begin_date AS music_brainz_begin_date,
            info.life_begin_year AS music_brainz_begin_year,
            info.life_end_date AS music_brainz_end_date,
            info.life_end_year AS music_brainz_end_year,
            info.life_ended AS music_brainz_ended,
            info.begin_area_name AS music_brainz_begin_area_name,
            info.end_area_name AS music_brainz_end_area_name,
            info.review_state AS music_brainz_info_review_state,
            info.fetched_at AS music_brainz_info_fetched_at,
            origin.country_code AS origin_country_code,
            origin.country_name AS origin_country_name,
            origin.raw_area_name AS origin_country_raw_area,
            origin.review_state AS origin_country_review_state
        FROM grouped
        LEFT JOIN musicbrainz_artist_infos info
          ON info.local_artist_key = grouped.artist_key
        LEFT JOIN musicbrainz_artist_links link
          ON link.local_artist_key = grouped.artist_key
        LEFT JOIN musicbrainz_artist_origin_countries origin
          ON origin.local_artist_key = grouped.artist_key
        {order_sql}
        LIMIT ? OFFSET ?
        "
    );
    let mut row_values = values;
    row_values.push(Value::Integer(i64::from(limit)));
    row_values.push(Value::Integer(i64::from(offset)));

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(params_from_iter(row_values.iter()), artist_summary_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load artist results")?;

    Ok(ArtistListResponse {
        rows,
        total,
        limit,
        offset,
    })
}

fn artist_summary_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ArtistSummary> {
    Ok(ArtistSummary {
        id: row.get(0)?,
        name: row.get(1)?,
        album_count: row.get(2)?,
        rated_album_count: row.get(3)?,
        partial_album_count: row.get(4)?,
        unrated_album_count: row.get(5)?,
        track_count: row.get(6)?,
        total_seconds: row.get(7)?,
        loved_tracks: row.get(8)?,
        tmoe_seconds: row.get(9)?,
        average_rating_completeness: row.get(10)?,
        average_album_rating: row.get(11)?,
        average_album_score: row.get(12)?,
        first_year: row.get(13)?,
        last_year: row.get(14)?,
        top_genre: row.get(15)?,
        music_brainz_mbid: row.get(16)?,
        music_brainz_sort_name: row.get(17)?,
        music_brainz_artist_type: row.get(18)?,
        music_brainz_gender: row.get(19)?,
        music_brainz_begin_date: row.get(20)?,
        music_brainz_begin_year: row.get(21)?,
        music_brainz_end_date: row.get(22)?,
        music_brainz_end_year: row.get(23)?,
        music_brainz_ended: row.get(24)?,
        music_brainz_begin_area_name: row.get(25)?,
        music_brainz_end_area_name: row.get(26)?,
        music_brainz_info_review_state: row.get(27)?,
        music_brainz_info_fetched_at: row.get(28)?,
        origin_country_code: row.get(29)?,
        origin_country_name: row.get(30)?,
        origin_country_raw_area: row.get(31)?,
        origin_country_review_state: row.get(32)?,
    })
}

fn artist_search_where(search_text: &str) -> (String, Vec<Value>) {
    let search_text = search_text.trim();
    if search_text.is_empty() {
        return (String::new(), Vec::new());
    }

    let normalized = normalize_artist_text(search_text);
    let artist_text_sql = normalized_artist_sql("album_artist_display");
    (
        format!(
            "WHERE LOWER(COALESCE(NULLIF(TRIM({artist_text_sql}), ''), 'Unknown Artist')) LIKE ? ESCAPE '\\'"
        ),
        vec![Value::Text(format!("%{}%", escape_like(&normalized)))],
    )
}

fn artist_order_clause(sort: &BrowseSort) -> String {
    let direction = if sort.direction.eq_ignore_ascii_case("desc") {
        "DESC"
    } else {
        "ASC"
    };

    let field = match sort.field.as_str() {
        "albumCount" => "album_count",
        "trackCount" => "track_count",
        "lovedTracks" => "loved_tracks",
        "totalMinutes" => "total_seconds",
        "averageCompleteness" => "average_rating_completeness",
        "averageRating" => "average_album_rating",
        "averageScore" => "average_album_score",
        "firstYear" => "first_year",
        "lastYear" => "last_year",
        "topGenre" => "top_genre",
        _ => "LOWER(artist_name)",
    };

    format!("ORDER BY {field} {direction}, LOWER(artist_name) ASC")
}

fn list_genres(
    conn: &Connection,
    request: GenreListRequest,
    max_limit: u32,
) -> Result<GenreListResponse> {
    let limit = request.limit.clamp(1, max_limit);
    let offset = request.offset;
    let (where_sql, values) = genre_search_where(&request.search_text);

    let count_sql = format!(
        "
        SELECT COUNT(*)
        FROM (
            SELECT COALESCE(NULLIF(TRIM(LOWER(genre_normalized)), ''), 'unknown') AS genre_key
            FROM albums
            {where_sql}
            GROUP BY genre_key
        )
        "
    );
    let total = conn
        .query_row(&count_sql, params_from_iter(values.iter()), |row| {
            row.get(0)
        })
        .context("Could not count genre results")?;

    let order_sql = genre_order_clause(&request.sort);
    let album_artist_key_sql_a2 = artist_key_sql("a2.album_artist_display");
    let sql = format!(
        "
        WITH grouped AS (
            SELECT
                COALESCE(NULLIF(TRIM(LOWER(genre_normalized)), ''), 'unknown') AS genre_key,
                COALESCE(MIN(NULLIF(TRIM(canonical_genre), '')), 'Unknown') AS genre_name,
                COUNT(*) AS album_count,
                SUM(CASE WHEN rating_completeness >= 1.0 THEN 1 ELSE 0 END) AS rated_album_count,
                SUM(CASE WHEN rating_completeness > 0.0 AND rating_completeness < 1.0 THEN 1 ELSE 0 END) AS partial_album_count,
                SUM(CASE WHEN rating_completeness = 0.0 THEN 1 ELSE 0 END) AS unrated_album_count,
                COALESCE(SUM(total_tracks), 0) AS track_count,
                COALESCE(SUM(total_seconds), 0) AS total_seconds,
                COALESCE(SUM(loved_tracks), 0) AS loved_tracks,
                COALESCE(SUM(tmoe_seconds), 0) AS tmoe_seconds,
                AVG(rating_completeness) AS average_rating_completeness,
                AVG(effective_album_rating) AS average_album_rating,
                AVG(album_score) AS average_album_score,
                MIN(year) AS first_year,
                MAX(year) AS last_year
            FROM albums
            {where_sql}
            GROUP BY genre_key
        )
        SELECT
            genre_key,
            genre_name,
            album_count,
            rated_album_count,
            partial_album_count,
            unrated_album_count,
            track_count,
            total_seconds,
            loved_tracks,
            tmoe_seconds,
            average_rating_completeness,
            average_album_rating,
            average_album_score,
            first_year,
            last_year,
            (
                SELECT COALESCE(MIN(NULLIF(TRIM(a2.album_artist_display), '')), 'Unknown Artist')
                FROM albums a2
                WHERE COALESCE(NULLIF(TRIM(LOWER(a2.genre_normalized)), ''), 'unknown') = grouped.genre_key
                GROUP BY {album_artist_key_sql_a2}
                ORDER BY COUNT(*) DESC, LOWER(COALESCE(MIN(NULLIF(TRIM(a2.album_artist_display), '')), 'Unknown Artist')) ASC
                LIMIT 1
            ) AS top_artist
        FROM grouped
        {order_sql}
        LIMIT ? OFFSET ?
        "
    );
    let mut row_values = values;
    row_values.push(Value::Integer(i64::from(limit)));
    row_values.push(Value::Integer(i64::from(offset)));

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(params_from_iter(row_values.iter()), genre_summary_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load genre results")?;

    Ok(GenreListResponse {
        rows,
        total,
        limit,
        offset,
    })
}

fn genre_summary_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<GenreSummary> {
    Ok(GenreSummary {
        id: row.get(0)?,
        name: row.get(1)?,
        album_count: row.get(2)?,
        rated_album_count: row.get(3)?,
        partial_album_count: row.get(4)?,
        unrated_album_count: row.get(5)?,
        track_count: row.get(6)?,
        total_seconds: row.get(7)?,
        loved_tracks: row.get(8)?,
        tmoe_seconds: row.get(9)?,
        average_rating_completeness: row.get(10)?,
        average_album_rating: row.get(11)?,
        average_album_score: row.get(12)?,
        first_year: row.get(13)?,
        last_year: row.get(14)?,
        top_artist: row.get(15)?,
    })
}

fn genre_search_where(search_text: &str) -> (String, Vec<Value>) {
    let search_text = search_text.trim();
    if search_text.is_empty() {
        return (String::new(), Vec::new());
    }

    let normalized = search_text.to_lowercase();
    (
        "WHERE LOWER(COALESCE(NULLIF(TRIM(canonical_genre), ''), 'Unknown')) LIKE ? ESCAPE '\\'"
            .to_string(),
        vec![Value::Text(format!("%{}%", escape_like(&normalized)))],
    )
}

fn genre_order_clause(sort: &BrowseSort) -> String {
    let direction = if sort.direction.eq_ignore_ascii_case("desc") {
        "DESC"
    } else {
        "ASC"
    };

    let field = match sort.field.as_str() {
        "albumCount" => "album_count",
        "trackCount" => "track_count",
        "lovedTracks" => "loved_tracks",
        "totalMinutes" => "total_seconds",
        "averageCompleteness" => "average_rating_completeness",
        "averageRating" => "average_album_rating",
        "averageScore" => "average_album_score",
        "firstYear" => "first_year",
        "lastYear" => "last_year",
        "topArtist" => "top_artist",
        _ => "LOWER(genre_name)",
    };

    format!("ORDER BY {field} {direction}, LOWER(genre_name) ASC")
}

fn genre_suggestion_names(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "
        SELECT COALESCE(MIN(NULLIF(TRIM(canonical_genre), '')), 'Unknown') AS genre_name
        FROM albums
        WHERE NULLIF(TRIM(COALESCE(genre_normalized, '')), '') IS NOT NULL
        GROUP BY COALESCE(NULLIF(TRIM(LOWER(genre_normalized)), ''), 'unknown')
        ORDER BY LOWER(genre_name) ASC
        ",
    )?;

    let rows = stmt
        .query_map([], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<String>>>()
        .context("Could not load genre suggestion names")?;

    Ok(rows)
}

fn discovery(conn: &Connection) -> Result<DiscoveryResponse> {
    let generated_at = list_import_runs(conn, 1)?
        .into_iter()
        .next()
        .map(|run| run.completed_at.unwrap_or(run.started_at));

    Ok(DiscoveryResponse {
        heatmap: discovery_heatmap(conn)?,
        backlog_missions: discovery_backlog_missions(conn)?,
        smart_missions: discovery_smart_missions(conn)?,
        love_rating_points: discovery_love_rating_points(conn)?,
        genre_points: discovery_genre_points(conn)?,
        artist_points: discovery_artist_points(conn)?,
        generated_at,
    })
}

fn discovery_heatmap(conn: &Connection) -> Result<Vec<DiscoveryHeatmapCell>> {
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
            LIMIT 12
        ),
        top_years AS (
            SELECT year
            FROM album_projection
            GROUP BY year
            ORDER BY COUNT(*) DESC, year DESC
            LIMIT 16
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
          AND year IN (SELECT year FROM top_years)
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

fn discovery_backlog_missions(conn: &Connection) -> Result<Vec<DiscoveryMission>> {
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

fn discovery_smart_missions(conn: &Connection) -> Result<Vec<DiscoveryMission>> {
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

fn push_discovery_mission(missions: &mut Vec<DiscoveryMission>, mission: Option<DiscoveryMission>) {
    if let Some(mission) = mission {
        missions.push(mission);
    }
}

fn discovery_global_mission(
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

fn discovery_decade_mission(
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

fn discovery_high_potential_genre_mission(conn: &Connection) -> Result<Option<DiscoveryMission>> {
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

fn discovery_artist_backlog_mission(conn: &Connection) -> Result<Option<DiscoveryMission>> {
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

fn discovery_high_score_partial_decade_mission(
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

fn discovery_loved_incomplete_genre_mission(conn: &Connection) -> Result<Option<DiscoveryMission>> {
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

fn discovery_unrated_high_potential_genre_mission(
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

fn discovery_loved_decade_mission(conn: &Connection) -> Result<Option<DiscoveryMission>> {
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

fn discovery_artist_partial_score_mission(conn: &Connection) -> Result<Option<DiscoveryMission>> {
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

fn discovery_genre_smart_mission(
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

fn discovery_group_mission_row(
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

fn discovery_love_rating_points(conn: &Connection) -> Result<Vec<DiscoveryAlbumPoint>> {
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

fn discovery_genre_points(conn: &Connection) -> Result<Vec<DiscoveryGenrePoint>> {
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

fn discovery_artist_points(conn: &Connection) -> Result<Vec<DiscoveryArtistPoint>> {
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

#[derive(Debug, Clone, PartialEq, Eq)]
struct MusicToolTrackTextFields {
    display_artist: Option<String>,
    album_artist_display: Option<String>,
    album: Option<String>,
    title: Option<String>,
    genre: Option<String>,
    canonical_genre: Option<String>,
    publisher: Option<String>,
    file_path: Option<String>,
    filename: Option<String>,
}

impl MusicToolTrackTextFields {
    fn compacted(&self) -> Self {
        Self {
            display_artist: compact_optional_whitespace(&self.display_artist),
            album_artist_display: compact_optional_whitespace(&self.album_artist_display),
            album: compact_optional_whitespace(&self.album),
            title: compact_optional_whitespace(&self.title),
            genre: compact_optional_whitespace(&self.genre),
            canonical_genre: compact_optional_whitespace(&self.canonical_genre),
            publisher: compact_optional_whitespace(&self.publisher),
            file_path: compact_optional_whitespace(&self.file_path),
            filename: compact_optional_whitespace(&self.filename),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct MusicToolAlbumTextFields {
    album: Option<String>,
    album_artist_display: Option<String>,
    canonical_genre: Option<String>,
    genre_normalized: Option<String>,
    publisher: Option<String>,
}

impl MusicToolAlbumTextFields {
    fn compacted(&self) -> Self {
        Self {
            album: compact_optional_whitespace(&self.album),
            album_artist_display: compact_optional_whitespace(&self.album_artist_display),
            canonical_genre: compact_optional_whitespace(&self.canonical_genre),
            genre_normalized: compact_optional_whitespace(&self.genre_normalized),
            publisher: compact_optional_whitespace(&self.publisher),
        }
    }
}

fn fix_music_tool_issues(
    conn: &mut Connection,
    db_path: Option<&Path>,
    input: MusicToolFixRequest,
) -> Result<MusicToolFixSummary> {
    let MusicToolFixRequest {
        tool_id,
        issue_ids,
        apply,
    } = input;

    music_tool_definition(&tool_id)?;
    if tool_id != "whitespace-anomalies" {
        bail!("No fix action is available for this music tool yet: {tool_id}");
    }

    let requested_issue_ids = issue_ids.into_iter().collect::<HashSet<_>>();
    let requested_count = requested_issue_ids.len();
    let action = "compact-whitespace".to_string();
    if requested_count == 0 {
        return Ok(MusicToolFixSummary {
            tool_id,
            action,
            applied: apply,
            requested_count,
            fixable_count: 0,
            affected_album_count: 0,
            affected_track_count: 0,
            changed_album_count: 0,
            changed_track_count: 0,
            skipped_count: 0,
            backup_path: None,
            message: "No visible issue rows were selected for fixing.".to_string(),
        });
    }

    let issue_prefix = format!("{tool_id}:");
    let selected_track_ids = requested_issue_ids
        .iter()
        .filter_map(|issue_id| {
            issue_id
                .strip_prefix(&issue_prefix)
                .and_then(|track_id| track_id.parse::<i64>().ok())
        })
        .collect::<HashSet<_>>();
    let (affected_track_ids, affected_album_ids) =
        whitespace_fix_targets(conn, &selected_track_ids)?;
    let fixable_count = affected_track_ids.len();
    let skipped_count = requested_count.saturating_sub(fixable_count);

    if !apply {
        return Ok(MusicToolFixSummary {
            tool_id,
            action,
            applied: false,
            requested_count,
            fixable_count,
            affected_album_count: affected_album_ids.len(),
            affected_track_count: affected_track_ids.len(),
            changed_album_count: 0,
            changed_track_count: 0,
            skipped_count,
            backup_path: None,
            message: format!(
                "Preview found {fixable_count} visible whitespace issue rows that can be compacted."
            ),
        });
    }

    let backup_path = if fixable_count > 0 {
        match db_path {
            Some(path) => create_database_file_backup(path, "music-tool-fix")?,
            None => None,
        }
    } else {
        None
    };

    let mut changed_track_count = 0_usize;
    let mut changed_album_count = 0_usize;
    {
        let tx = conn
            .transaction()
            .context("Could not start Music Tool fix transaction")?;

        for track_id in &affected_track_ids {
            if compact_track_whitespace(&tx, *track_id)? {
                changed_track_count += 1;
            }
        }

        for album_id in &affected_album_ids {
            if compact_album_whitespace(&tx, album_id)? {
                changed_album_count += 1;
            }
        }

        tx.commit()
            .context("Could not commit Music Tool whitespace fix")?;
    }

    if changed_track_count > 0 || changed_album_count > 0 {
        rebuild_search_indexes(conn)?;
    }

    Ok(MusicToolFixSummary {
        tool_id,
        action,
        applied: true,
        requested_count,
        fixable_count,
        affected_album_count: affected_album_ids.len(),
        affected_track_count: affected_track_ids.len(),
        changed_album_count,
        changed_track_count,
        skipped_count,
        backup_path: backup_path.map(|path| path.display().to_string()),
        message: format!(
            "Compacted whitespace for {changed_track_count} tracks and {changed_album_count} albums."
        ),
    })
}

fn whitespace_fix_targets(
    conn: &Connection,
    selected_track_ids: &HashSet<i64>,
) -> Result<(HashSet<i64>, HashSet<String>)> {
    let sql = format!(
        "
        SELECT album_id
        FROM tracks t
        WHERE t.id = ?1
          AND ({WHITESPACE_ANOMALY_CONDITION_SQL})
        "
    );
    let mut affected_track_ids = HashSet::new();
    let mut affected_album_ids = HashSet::new();

    for track_id in selected_track_ids {
        let album_id = conn
            .query_row(&sql, params![track_id], |row| row.get::<_, String>(0))
            .optional()
            .with_context(|| format!("Could not validate whitespace issue track {track_id}"))?;
        if let Some(album_id) = album_id {
            affected_track_ids.insert(*track_id);
            affected_album_ids.insert(album_id);
        }
    }

    Ok((affected_track_ids, affected_album_ids))
}

fn compact_track_whitespace(conn: &Connection, track_id: i64) -> Result<bool> {
    let current = conn
        .query_row(
            "
            SELECT
                display_artist,
                album_artist_display,
                album,
                title,
                genre,
                canonical_genre,
                publisher,
                file_path,
                filename
            FROM tracks
            WHERE id = ?1
            ",
            params![track_id],
            |row| {
                Ok(MusicToolTrackTextFields {
                    display_artist: row.get(0)?,
                    album_artist_display: row.get(1)?,
                    album: row.get(2)?,
                    title: row.get(3)?,
                    genre: row.get(4)?,
                    canonical_genre: row.get(5)?,
                    publisher: row.get(6)?,
                    file_path: row.get(7)?,
                    filename: row.get(8)?,
                })
            },
        )
        .optional()
        .with_context(|| format!("Could not load track {track_id} for whitespace fix"))?;

    let Some(current) = current else {
        return Ok(false);
    };
    let next = current.compacted();
    if current == next {
        return Ok(false);
    }

    conn.execute(
        "
        UPDATE tracks
        SET display_artist = ?1,
            album_artist_display = ?2,
            album = ?3,
            title = ?4,
            genre = ?5,
            canonical_genre = ?6,
            publisher = ?7,
            file_path = ?8,
            filename = ?9
        WHERE id = ?10
        ",
        params![
            next.display_artist.as_deref(),
            next.album_artist_display.as_deref(),
            next.album.as_deref(),
            next.title.as_deref(),
            next.genre.as_deref(),
            next.canonical_genre.as_deref(),
            next.publisher.as_deref(),
            next.file_path.as_deref(),
            next.filename.as_deref(),
            track_id
        ],
    )
    .with_context(|| format!("Could not compact whitespace for track {track_id}"))?;
    Ok(true)
}

fn compact_album_whitespace(conn: &Connection, album_id: &str) -> Result<bool> {
    let current = conn
        .query_row(
            "
            SELECT
                album,
                album_artist_display,
                canonical_genre,
                genre_normalized,
                publisher
            FROM albums
            WHERE id = ?1
            ",
            params![album_id],
            |row| {
                Ok(MusicToolAlbumTextFields {
                    album: row.get(0)?,
                    album_artist_display: row.get(1)?,
                    canonical_genre: row.get(2)?,
                    genre_normalized: row.get(3)?,
                    publisher: row.get(4)?,
                })
            },
        )
        .optional()
        .with_context(|| format!("Could not load album {album_id} for whitespace fix"))?;

    let Some(current) = current else {
        return Ok(false);
    };
    let next = current.compacted();
    if current == next {
        return Ok(false);
    }

    conn.execute(
        "
        UPDATE albums
        SET album = ?1,
            album_artist_display = ?2,
            canonical_genre = ?3,
            genre_normalized = ?4,
            publisher = ?5
        WHERE id = ?6
        ",
        params![
            next.album.as_deref(),
            next.album_artist_display.as_deref(),
            next.canonical_genre.as_deref(),
            next.genre_normalized.as_deref(),
            next.publisher.as_deref(),
            album_id
        ],
    )
    .with_context(|| format!("Could not compact whitespace for album {album_id}"))?;
    Ok(true)
}

fn compact_optional_whitespace(value: &Option<String>) -> Option<String> {
    value.as_deref().map(compact_whitespace)
}

fn list_music_tools(conn: &Connection) -> Result<Vec<MusicToolSummary>> {
    let _ = count_rows(conn, "tracks")?;
    Ok(MUSIC_TOOLS
        .iter()
        .map(|definition| music_tool_catalog_summary(*definition))
        .collect())
}

fn list_music_tool_issues(
    conn: &Connection,
    request: MusicToolIssueRequest,
    max_limit: u32,
    progress_app: Option<ProgressApp<'_>>,
) -> Result<MusicToolIssueResponse> {
    let definition = music_tool_definition(&request.tool_id)?;
    emit_music_tool_progress(
        progress_app,
        definition.id,
        &request.request_id,
        "starting",
        5,
        "Starting validation count.",
    );
    let summary_pulse = start_music_tool_progress_pulse(
        progress_app,
        definition.id,
        &request.request_id,
        "counting",
        5,
        58,
        "Counting selected validator issues.",
    );
    let tool_result = music_tool_summary(conn, definition);
    drop(summary_pulse);
    let tool = tool_result?;
    emit_music_tool_progress(
        progress_app,
        definition.id,
        &request.request_id,
        "counting",
        62,
        "Applying filters to the selected tool.",
    );

    let base_sql = music_tool_issue_sql(definition.id)?;
    let (where_sql, values) = music_tool_issue_search_where(&request.search_text);
    let limit = request.limit.clamp(1, max_limit);
    let offset = request.offset;

    let count_sql = format!("SELECT COUNT(*) FROM ({base_sql}) issue_rows {where_sql}");
    let count_pulse = start_music_tool_progress_pulse(
        progress_app,
        definition.id,
        &request.request_id,
        "counting",
        62,
        78,
        "Counting filtered issue rows.",
    );
    let total_result = conn
        .query_row(&count_sql, params_from_iter(values.iter()), |row| {
            row.get(0)
        })
        .with_context(|| format!("Could not count {} issues", definition.label));
    drop(count_pulse);
    let total = total_result?;
    emit_music_tool_progress(
        progress_app,
        definition.id,
        &request.request_id,
        "loading",
        82,
        "Loading issue rows.",
    );

    let order_sql = music_tool_issue_order_clause(&request.sort);
    let sql =
        format!("SELECT * FROM ({base_sql}) issue_rows {where_sql} {order_sql} LIMIT ? OFFSET ?");
    let mut row_values = values;
    row_values.push(Value::Integer(i64::from(limit)));
    row_values.push(Value::Integer(i64::from(offset)));

    let rows_pulse = start_music_tool_progress_pulse(
        progress_app,
        definition.id,
        &request.request_id,
        "loading",
        82,
        96,
        "Loading issue rows.",
    );
    let rows_result = (|| -> Result<Vec<MusicToolIssueRow>> {
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt
            .query_map(
                params_from_iter(row_values.iter()),
                music_tool_issue_from_row,
            )?
            .collect::<rusqlite::Result<Vec<_>>>()
            .with_context(|| format!("Could not load {} issues", definition.label))?;
        Ok(rows)
    })();
    drop(rows_pulse);
    let rows = rows_result?;
    emit_music_tool_progress(
        progress_app,
        definition.id,
        &request.request_id,
        "completed",
        100,
        "Validation count complete.",
    );

    Ok(MusicToolIssueResponse {
        tool,
        rows,
        total,
        limit,
        offset,
    })
}

fn music_tool_summary(
    conn: &Connection,
    definition: MusicToolDefinition,
) -> Result<MusicToolSummary> {
    let base_sql = music_tool_issue_sql(definition.id)?;
    let sql = format!(
        "
        SELECT
            COUNT(*),
            COUNT(DISTINCT album_id),
            COUNT(DISTINCT track_id)
        FROM ({base_sql}) issue_rows
        "
    );
    let (issue_count, album_count, track_count) = conn
        .query_row(&sql, [], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .with_context(|| format!("Could not count {} issues", definition.label))?;

    Ok(MusicToolSummary {
        id: definition.id.to_string(),
        label: definition.label.to_string(),
        description: definition.description.to_string(),
        severity: definition.severity.to_string(),
        scope: definition.scope.to_string(),
        issue_count,
        album_count,
        track_count,
    })
}

fn music_tool_catalog_summary(definition: MusicToolDefinition) -> MusicToolSummary {
    MusicToolSummary {
        id: definition.id.to_string(),
        label: definition.label.to_string(),
        description: definition.description.to_string(),
        severity: definition.severity.to_string(),
        scope: definition.scope.to_string(),
        issue_count: -1,
        album_count: -1,
        track_count: -1,
    }
}

#[cfg(not(test))]
fn emit_music_tool_progress(
    app: Option<ProgressApp<'_>>,
    tool_id: &str,
    request_id: &str,
    status: &str,
    percent: u8,
    message: &str,
) {
    if let Some(app) = app {
        let _ = app.emit(
            "music-tool-progress",
            MusicToolProgress {
                tool_id: tool_id.to_string(),
                request_id: request_id.to_string(),
                status: status.to_string(),
                percent: percent.min(100),
                message: message.to_string(),
            },
        );
    }
}

#[cfg(test)]
fn emit_music_tool_progress(
    _app: Option<ProgressApp<'_>>,
    _tool_id: &str,
    _request_id: &str,
    _status: &str,
    _percent: u8,
    _message: &str,
) {
}

struct MusicToolProgressPulse {
    stop: Arc<AtomicBool>,
    handle: Option<thread::JoinHandle<()>>,
}

impl Drop for MusicToolProgressPulse {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

#[cfg(not(test))]
fn start_music_tool_progress_pulse(
    app: Option<ProgressApp<'_>>,
    tool_id: &str,
    request_id: &str,
    status: &'static str,
    start: u8,
    cap: u8,
    message: &'static str,
) -> Option<MusicToolProgressPulse> {
    if cap <= start {
        return None;
    }

    let Some(app) = app else {
        return None;
    };

    let app = app.clone();
    let tool_id = tool_id.to_string();
    let request_id = request_id.to_string();
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);

    let handle = thread::spawn(move || {
        let mut percent = start;
        while !thread_stop.load(Ordering::Relaxed) && percent < cap {
            thread::sleep(Duration::from_millis(180));
            if thread_stop.load(Ordering::Relaxed) {
                break;
            }
            percent = percent.saturating_add(1).min(cap);
            let _ = app.emit(
                "music-tool-progress",
                MusicToolProgress {
                    tool_id: tool_id.clone(),
                    request_id: request_id.clone(),
                    status: status.to_string(),
                    percent,
                    message: message.to_string(),
                },
            );
        }
    });

    Some(MusicToolProgressPulse {
        stop,
        handle: Some(handle),
    })
}

#[cfg(test)]
fn start_music_tool_progress_pulse(
    _app: Option<ProgressApp<'_>>,
    _tool_id: &str,
    _request_id: &str,
    _status: &'static str,
    _start: u8,
    _cap: u8,
    _message: &'static str,
) -> Option<MusicToolProgressPulse> {
    None
}

fn music_tool_definition(tool_id: &str) -> Result<MusicToolDefinition> {
    MUSIC_TOOLS
        .iter()
        .copied()
        .find(|definition| definition.id == tool_id)
        .ok_or_else(|| anyhow!("Unknown music tool: {tool_id}"))
}

fn music_tool_issue_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<MusicToolIssueRow> {
    Ok(MusicToolIssueRow {
        id: row.get(0)?,
        tool_id: row.get(1)?,
        severity: row.get(2)?,
        entity_type: row.get(3)?,
        album_id: row.get(4)?,
        track_id: row.get(5)?,
        album: row.get(6)?,
        album_artist_display: row.get(7)?,
        title: row.get(8)?,
        canonical_genre: row.get(9)?,
        year: row.get(10)?,
        detail: row.get(11)?,
        value: row.get(12)?,
        filename: row.get(13)?,
        file_path: row.get(14)?,
    })
}

fn music_tool_issue_search_where(search_text: &str) -> (String, Vec<Value>) {
    let search_text = search_text.trim();
    if search_text.is_empty() {
        return (String::new(), Vec::new());
    }

    let normalized = search_text.to_lowercase();
    (
        "
        WHERE LOWER(
            COALESCE(album, '') || ' ' ||
            COALESCE(album_artist_display, '') || ' ' ||
            COALESCE(title, '') || ' ' ||
            COALESCE(canonical_genre, '') || ' ' ||
            COALESCE(detail, '') || ' ' ||
            COALESCE(value, '') || ' ' ||
            COALESCE(filename, '') || ' ' ||
            COALESCE(file_path, '')
        ) LIKE ? ESCAPE '\\'
        "
        .to_string(),
        vec![Value::Text(format!("%{}%", escape_like(&normalized)))],
    )
}

fn music_tool_issue_order_clause(sort: &BrowseSort) -> String {
    let direction = if sort.direction.eq_ignore_ascii_case("desc") {
        "DESC"
    } else {
        "ASC"
    };

    let field = match sort.field.as_str() {
        "artist" => "LOWER(COALESCE(album_artist_display, ''))",
        "year" => "year",
        "title" => "LOWER(COALESCE(title, ''))",
        "severity" => "severity",
        "value" => "LOWER(COALESCE(value, ''))",
        "filename" => "LOWER(COALESCE(filename, ''))",
        "detail" => "LOWER(COALESCE(detail, ''))",
        _ => "LOWER(COALESCE(album, ''))",
    };

    format!(
        "ORDER BY {field} {direction}, LOWER(COALESCE(album_artist_display, '')) ASC, LOWER(COALESCE(album, '')) ASC, COALESCE(track_id, 0) ASC"
    )
}

fn music_tool_issue_sql(tool_id: &str) -> Result<String> {
    match tool_id {
        "duplicate-albums" => {
            let album_artist_key_sql = artist_key_sql("album_artist_display");
            let album_artist_key_sql_a = artist_key_sql("a.album_artist_display");
            Ok(format!(
                "
            WITH duplicate_groups AS (
                SELECT
                    {album_artist_key_sql} AS artist_key,
                    COALESCE(NULLIF(TRIM(LOWER(album)), ''), 'unknown') AS album_key,
                    COALESCE(year, -1) AS year_key,
                    COUNT(*) AS version_count
                FROM albums
                GROUP BY artist_key, album_key, year_key
                HAVING COUNT(*) > 1
            )
            SELECT
                'duplicate-albums:' || a.id AS id,
                'duplicate-albums' AS tool_id,
                'medium' AS severity,
                'albums' AS entity_type,
                a.id AS album_id,
                NULL AS track_id,
                a.album,
                a.album_artist_display,
                NULL AS title,
                a.canonical_genre,
                a.year,
                'Potential duplicate album version' AS detail,
                printf('%d albums share artist/title/year', g.version_count) AS value,
                NULL AS filename,
                NULL AS file_path
            FROM albums a
            JOIN duplicate_groups g
              ON {album_artist_key_sql_a} = g.artist_key
             AND COALESCE(NULLIF(TRIM(LOWER(a.album)), ''), 'unknown') = g.album_key
             AND COALESCE(a.year, -1) = g.year_key
            "
            ))
        },
        "albums-without-cover-image" => Ok(
            "
            WITH representative_paths AS (
                SELECT
                    album_id,
                    MIN(NULLIF(TRIM(filename), '')) AS filename,
                    MIN(NULLIF(TRIM(file_path), '')) AS file_path
                FROM tracks
                GROUP BY album_id
            )
            SELECT
                'albums-without-cover-image:' || a.id AS id,
                'albums-without-cover-image' AS tool_id,
                'low' AS severity,
                'albums' AS entity_type,
                a.id AS album_id,
                NULL AS track_id,
                a.album,
                a.album_artist_display,
                NULL AS title,
                a.canonical_genre,
                a.year,
                'No imported cover image' AS detail,
                'Missing album cover record' AS value,
                p.filename,
                p.file_path
            FROM albums a
            LEFT JOIN album_covers c ON c.album_id = a.id
            LEFT JOIN representative_paths p ON p.album_id = a.id
            WHERE c.album_id IS NULL
            "
            .to_string(),
        ),
        "missing-billboard-albums" => Ok(
            "
            WITH ranked_missing AS (
                SELECT
                    b.*,
                    ROW_NUMBER() OVER (
                        PARTITION BY b.artist_key, b.album_key
                        ORDER BY b.year ASC, b.rank ASC, b.id ASC
                    ) AS duplicate_rank
                FROM billboard_chart_entries b
                WHERE b.matched_album_id IS NULL
            )
            SELECT
                'missing-billboard-albums:' || b.id AS id,
                'missing-billboard-albums' AS tool_id,
                'low' AS severity,
                'albums' AS entity_type,
                'billboard:' || b.artist_key || char(31) || b.album_key AS album_id,
                NULL AS track_id,
                b.album,
                b.artist AS album_artist_display,
                NULL AS title,
                NULL AS canonical_genre,
                b.year,
                'Billboard album missing from library' AS detail,
                printf('#%d / %d', b.rank, b.year) AS value,
                b.source_file AS filename,
                NULL AS file_path
            FROM ranked_missing b
            WHERE b.duplicate_rank = 1
            "
            .to_string(),
        ),
        "missing-billboard-singles" => Ok(
            "
            WITH ranked_missing AS (
                SELECT
                    b.*,
                    ROW_NUMBER() OVER (
                        PARTITION BY b.artist_key, b.title_key
                        ORDER BY b.rank ASC, b.year ASC, b.id ASC
                    ) AS duplicate_rank
                FROM billboard_single_chart_entries b
                WHERE b.matched_track_id IS NULL
            )
            SELECT
                'missing-billboard-singles:' || b.id AS id,
                'missing-billboard-singles' AS tool_id,
                'low' AS severity,
                'tracks' AS entity_type,
                'billboard-single:' || b.artist_key || char(31) || b.title_key AS album_id,
                NULL AS track_id,
                NULL AS album,
                b.display_artist AS album_artist_display,
                b.title,
                NULL AS canonical_genre,
                b.year,
                'Billboard single missing from library' AS detail,
                printf('#%d / %d', b.rank, b.year) AS value,
                b.source_file AS filename,
                NULL AS file_path
            FROM ranked_missing b
            WHERE b.duplicate_rank = 1
            "
            .to_string(),
        ),
        "artists-without-musicbrainz-data" => Ok(
            "
            WITH cache_matches AS (
                SELECT
                    l.artist_key,
                    c.name,
                    c.mbid,
                    c.release_group_count,
                    CASE
                        WHEN c.local_name_key = l.artist_key THEN 'cache-name'
                        ELSE 'normalized-cache-name'
                    END AS match_method,
                    ROW_NUMBER() OVER (
                        PARTITION BY l.artist_key
                        ORDER BY
                            CASE WHEN c.local_name_key = l.artist_key THEN 0 ELSE 1 END,
                            c.release_group_count DESC,
                            LOWER(c.name) ASC
                    ) AS match_rank
                FROM temp.musicbrainz_tool_local_artists l
                JOIN temp.musicbrainz_tool_artist_cache c
                  ON c.local_name_key = l.artist_key
                  OR (
                        l.musicbrainz_name_key <> ''
                    AND c.musicbrainz_name_key = l.musicbrainz_name_key
                  )
            ),
            best_cache_matches AS (
                SELECT artist_key, name, mbid, release_group_count, match_method
                FROM cache_matches
                WHERE match_rank = 1
            ),
            verified_links AS (
                SELECT
                    link.local_artist_key AS artist_key,
                    link.mbid,
                    COALESCE(NULLIF(TRIM(link.canonical_name), ''), MIN(cache.name)) AS matched_name,
                    COALESCE(MAX(cache.release_group_count), 0) AS cache_release_group_count
                FROM musicbrainz_artist_links link
                LEFT JOIN temp.musicbrainz_tool_artist_cache cache
                  ON LOWER(cache.mbid) = LOWER(link.mbid)
                WHERE link.verification_state = 'verified'
                  AND link.ignored = 0
                  AND link.mbid IS NOT NULL
                  AND TRIM(link.mbid) <> ''
                GROUP BY link.local_artist_key, link.mbid, link.canonical_name
            ),
            overlay_release_counts AS (
                SELECT artist_mbid AS mbid, COUNT(*) AS release_group_count
                FROM musicbrainz_artist_release_groups
                GROUP BY artist_mbid
            ),
            resolved_artists AS (
                SELECT
                    l.*,
                    COALESCE(verified.mbid, cache.mbid) AS mbid,
                    COALESCE(verified.matched_name, cache.name) AS matched_name,
                    COALESCE(verified.cache_release_group_count, cache.release_group_count, 0)
                        AS cache_release_group_count,
                    COALESCE(overlay.release_group_count, 0) AS overlay_release_group_count,
                    CASE
                        WHEN verified.mbid IS NOT NULL THEN 'verified-link'
                        WHEN cache.mbid IS NOT NULL THEN cache.match_method
                        ELSE 'none'
                    END AS match_method
                FROM temp.musicbrainz_tool_local_artists l
                LEFT JOIN verified_links verified
                  ON verified.artist_key = l.artist_key
                LEFT JOIN best_cache_matches cache
                  ON cache.artist_key = l.artist_key
                 AND verified.mbid IS NULL
                LEFT JOIN overlay_release_counts overlay
                  ON LOWER(overlay.mbid) = LOWER(COALESCE(verified.mbid, cache.mbid))
            )
            SELECT
                'artists-without-musicbrainz-data:' || r.artist_key AS id,
                'artists-without-musicbrainz-data' AS tool_id,
                'medium' AS severity,
                'artists' AS entity_type,
                r.artist_key AS album_id,
                NULL AS track_id,
                r.display_artist AS album,
                r.display_artist AS album_artist_display,
                r.sample_album AS title,
                NULL AS canonical_genre,
                r.first_year AS year,
                CASE
                    WHEN r.mbid IS NULL THEN 'No MusicBrainz artist cache match'
                    ELSE 'No cached MusicBrainz release groups'
                END AS detail,
                CASE
                    WHEN r.mbid IS NULL THEN printf('%d albums / %d tracks', r.album_count, r.track_count)
                    ELSE printf(
                        'MBID %s / %s / %d albums / %d tracks',
                        r.mbid,
                        r.match_method,
                        r.album_count,
                        r.track_count
                    )
                END AS value,
                NULL AS filename,
                NULL AS file_path
            FROM resolved_artists r
            WHERE r.mbid IS NULL
               OR (r.cache_release_group_count + r.overlay_release_group_count) = 0
            "
            .to_string(),
        ),
        "high-confidence-missing-musicbrainz-albums" => Ok(format!(
            "
            WITH cache_matches AS (
                SELECT
                    l.artist_key,
                    c.name,
                    c.mbid,
                    c.cached_name_count,
                    c.release_group_count,
                    CASE
                        WHEN c.local_name_key = l.artist_key THEN 'cache-name'
                        ELSE 'normalized-cache-name'
                    END AS match_method,
                    COUNT(*) OVER (PARTITION BY l.artist_key) AS candidate_count,
                    ROW_NUMBER() OVER (
                        PARTITION BY l.artist_key
                        ORDER BY
                            CASE WHEN c.local_name_key = l.artist_key THEN 0 ELSE 1 END,
                            c.cached_name_count ASC,
                            c.release_group_count DESC,
                            LOWER(c.name) ASC
                    ) AS match_rank
                FROM temp.musicbrainz_tool_local_artists l
                JOIN temp.musicbrainz_tool_artist_cache c
                  ON c.local_name_key = l.artist_key
                  OR (
                        l.musicbrainz_name_key <> ''
                    AND c.musicbrainz_name_key = l.musicbrainz_name_key
                  )
            ),
            best_cache_matches AS (
                SELECT
                    artist_key, name, mbid, cached_name_count, release_group_count,
                    match_method, candidate_count
                FROM cache_matches
                WHERE match_rank = 1
            ),
            verified_links AS (
                SELECT
                    link.local_artist_key AS artist_key,
                    link.mbid,
                    COALESCE(NULLIF(TRIM(link.canonical_name), ''), MIN(cache.name)) AS matched_name
                FROM musicbrainz_artist_links link
                LEFT JOIN temp.musicbrainz_tool_artist_cache cache
                  ON LOWER(cache.mbid) = LOWER(link.mbid)
                WHERE link.verification_state = 'verified'
                  AND link.ignored = 0
                  AND link.mbid IS NOT NULL
                  AND TRIM(link.mbid) <> ''
                GROUP BY link.local_artist_key, link.mbid, link.canonical_name
            ),
            ignored_links AS (
                SELECT local_artist_key AS artist_key
                FROM musicbrainz_artist_links
                WHERE ignored <> 0
            ),
            trusted_artists AS (
                SELECT
                    l.artist_key,
                    l.display_artist,
                    COALESCE(verified.mbid, cache.mbid) AS mbid,
                    COALESCE(verified.matched_name, cache.name, l.display_artist) AS matched_name,
                    CASE
                        WHEN verified.mbid IS NOT NULL THEN 'verified-link'
                        WHEN cache.mbid IS NOT NULL THEN cache.match_method
                        ELSE 'none'
                    END AS match_method,
                    CASE
                        WHEN verified.mbid IS NOT NULL THEN 1
                        WHEN cache.mbid IS NOT NULL
                         AND cache.candidate_count = 1
                         AND cache.cached_name_count <= 1
                         AND cache.release_group_count < {threshold}
                            THEN 1
                        ELSE 0
                    END AS high_confidence
                FROM temp.musicbrainz_tool_local_artists l
                LEFT JOIN verified_links verified
                  ON verified.artist_key = l.artist_key
                LEFT JOIN best_cache_matches cache
                  ON cache.artist_key = l.artist_key
                 AND verified.mbid IS NULL
                LEFT JOIN ignored_links ignored
                  ON ignored.artist_key = l.artist_key
                WHERE ignored.artist_key IS NULL
            ),
            overlay_counts AS (
                SELECT LOWER(artist_mbid) AS mbid, COUNT(*) AS release_group_count
                FROM temp.musicbrainz_tool_release_groups
                WHERE source = 'refreshed'
                GROUP BY LOWER(artist_mbid)
            ),
            artist_releases AS (
                SELECT
                    artist.artist_key,
                    artist.display_artist,
                    artist.mbid,
                    artist.matched_name,
                    artist.match_method,
                    releases.release_mbid,
                    releases.title,
                    releases.title_key,
                    releases.year,
                    releases.track_count,
                    releases.source
                FROM trusted_artists artist
                JOIN temp.musicbrainz_tool_release_groups releases
                  ON LOWER(releases.artist_mbid) = LOWER(artist.mbid)
                LEFT JOIN overlay_counts overlay
                  ON overlay.mbid = LOWER(artist.mbid)
                WHERE artist.high_confidence = 1
                  AND artist.mbid IS NOT NULL
                  AND releases.title_key <> ''
                  AND (
                        releases.source = 'refreshed'
                     OR COALESCE(overlay.release_group_count, 0) = 0
                  )
            )
            SELECT
                'high-confidence-missing-musicbrainz-albums:' || ar.artist_key || char(31) || ar.release_mbid AS id,
                'high-confidence-missing-musicbrainz-albums' AS tool_id,
                'low' AS severity,
                'albums' AS entity_type,
                'musicbrainz:' || ar.artist_key || char(31) || ar.release_mbid AS album_id,
                NULL AS track_id,
                ar.title AS album,
                ar.display_artist AS album_artist_display,
                NULL AS title,
                NULL AS canonical_genre,
                ar.year,
                'High-confidence MusicBrainz album missing from library' AS detail,
                printf(
                    'MBID %s / %s / %s / matched %s',
                    ar.mbid,
                    ar.match_method,
                    ar.source,
                    ar.matched_name
                ) AS value,
                NULL AS filename,
                NULL AS file_path
            FROM artist_releases ar
            LEFT JOIN temp.musicbrainz_tool_local_albums owned
              ON owned.artist_key = ar.artist_key
             AND owned.title_key = ar.title_key
            LEFT JOIN musicbrainz_release_decisions decisions
              ON decisions.local_artist_key = ar.artist_key
             AND decisions.release_mbid = ar.release_mbid
            LEFT JOIN musicbrainz_release_status_cache status
              ON LOWER(status.artist_mbid) = LOWER(ar.mbid)
             AND status.release_mbid = ar.release_mbid
            WHERE owned.album_id IS NULL
              AND COALESCE(decisions.decision, '') NOT IN ('not-in-scope', 'ignored')
              AND (
                    COALESCE(decisions.decision, '') = 'include'
                 OR COALESCE(status.has_official_release, 1) <> 0
              )
            ",
            threshold = MUSICBRAINZ_SUSPICIOUS_RELEASE_GROUP_THRESHOLD,
        )),
        "duplicates-within-album" => Ok(
            "
            WITH duplicate_titles AS (
                SELECT
                    album_id,
                    LOWER(TRIM(title)) AS title_key,
                    COUNT(*) AS match_count
                FROM tracks
                WHERE NULLIF(TRIM(COALESCE(title, '')), '') IS NOT NULL
                GROUP BY album_id, title_key
                HAVING COUNT(*) > 1
            ),
            duplicate_positions AS (
                SELECT
                    album_id,
                    disc_number AS disc_key,
                    track_number AS track_key,
                    COUNT(*) AS match_count
                FROM tracks
                WHERE disc_number IS NOT NULL
                  AND track_number IS NOT NULL
                GROUP BY album_id, disc_key, track_key
                HAVING COUNT(*) > 1
            )
            SELECT DISTINCT
                'duplicates-within-album:' || t.id AS id,
                'duplicates-within-album' AS tool_id,
                'high' AS severity,
                'tracks' AS entity_type,
                t.album_id,
                t.id AS track_id,
                t.album,
                t.album_artist_display,
                t.title,
                t.canonical_genre,
                t.year,
                CASE
                    WHEN dt.title_key IS NOT NULL AND dp.album_id IS NOT NULL THEN 'Duplicate title and track position'
                    WHEN dt.title_key IS NOT NULL THEN 'Duplicate title inside album'
                    ELSE 'Duplicate disc/track position'
                END AS detail,
                CASE
                    WHEN dp.album_id IS NOT NULL THEN printf('Disc %s track %s', COALESCE(CAST(t.disc_number AS TEXT), '?'), COALESCE(CAST(t.track_number AS TEXT), '?'))
                    ELSE t.title
                END AS value,
                t.filename,
                t.file_path
            FROM tracks t
            LEFT JOIN duplicate_titles dt
              ON dt.album_id = t.album_id
             AND dt.title_key = LOWER(TRIM(t.title))
            LEFT JOIN duplicate_positions dp
              ON dp.album_id = t.album_id
             AND dp.disc_key = t.disc_number
             AND dp.track_key = t.track_number
            WHERE dt.title_key IS NOT NULL
               OR dp.album_id IS NOT NULL
            "
            .to_string(),
        ),
        "invalid-time-values" => Ok(track_issue_sql(
            "invalid-time-values",
            "high",
            "Missing or invalid track time",
            "NULL",
            "t.time_seconds IS NULL",
        )),
        "non-numeric-ratings" => {
            let numeric = numeric_rating_condition("t.rating_raw");
            Ok(track_issue_sql(
                "non-numeric-ratings",
                "medium",
                "Track rating is not numeric",
                "t.rating_raw",
                &format!(
                    "NULLIF(TRIM(COALESCE(t.rating_raw, '')), '') IS NOT NULL AND NOT {numeric}"
                ),
            ))
        }
        "missing-tags" => Ok(track_issue_sql(
            "missing-tags",
            "high",
            "Missing required tag",
            "
            TRIM(
                CASE WHEN NULLIF(TRIM(COALESCE(t.album, '')), '') IS NULL THEN 'Album ' ELSE '' END ||
                CASE WHEN NULLIF(TRIM(COALESCE(t.album_artist_display, '')), '') IS NULL THEN 'Album artist ' ELSE '' END ||
                CASE WHEN NULLIF(TRIM(COALESCE(t.display_artist, '')), '') IS NULL THEN 'Display artist ' ELSE '' END ||
                CASE WHEN NULLIF(TRIM(COALESCE(t.title, '')), '') IS NULL THEN 'Title ' ELSE '' END ||
                CASE WHEN NULLIF(TRIM(COALESCE(t.canonical_genre, '')), '') IS NULL THEN 'Genre ' ELSE '' END ||
                CASE WHEN t.year IS NULL THEN 'Year ' ELSE '' END ||
                CASE WHEN NULLIF(TRIM(COALESCE(t.file_path, '')), '') IS NULL THEN 'File path ' ELSE '' END ||
                CASE WHEN NULLIF(TRIM(COALESCE(t.filename, '')), '') IS NULL THEN 'Filename ' ELSE '' END
            )
            ",
            "
            NULLIF(TRIM(COALESCE(t.album, '')), '') IS NULL OR
            NULLIF(TRIM(COALESCE(t.album_artist_display, '')), '') IS NULL OR
            NULLIF(TRIM(COALESCE(t.display_artist, '')), '') IS NULL OR
            NULLIF(TRIM(COALESCE(t.title, '')), '') IS NULL OR
            NULLIF(TRIM(COALESCE(t.canonical_genre, '')), '') IS NULL OR
            t.year IS NULL OR
            NULLIF(TRIM(COALESCE(t.file_path, '')), '') IS NULL OR
            NULLIF(TRIM(COALESCE(t.filename, '')), '') IS NULL
            ",
        )),
        "non-mp3-files" => Ok(track_issue_sql(
            "non-mp3-files",
            "low",
            "Filename is not MP3",
            "t.filename",
            "NULLIF(TRIM(COALESCE(t.filename, '')), '') IS NOT NULL AND LOWER(t.filename) NOT LIKE '%.mp3'",
        )),
        "year-anomalies" => {
            let max_year = Utc::now().year() + 1;
            Ok(track_issue_sql(
                "year-anomalies",
                "medium",
                "Missing or implausible year",
                "printf('Year %s / release %s', COALESCE(CAST(t.year AS TEXT), 'missing'), COALESCE(CAST(t.release_year AS TEXT), 'missing'))",
                &format!(
                    "t.year IS NULL OR t.year < 1900 OR t.year > {max_year} OR t.release_year < 1900 OR t.release_year > {max_year}"
                ),
            ))
        }
        "ratings-out-of-range" => {
            let numeric = numeric_rating_condition("t.rating_raw");
            Ok(track_issue_sql(
                "ratings-out-of-range",
                "high",
                "Rating is outside accepted whole-number 0-5 values",
                "t.rating_raw",
                &format!(
                    "NULLIF(TRIM(COALESCE(t.rating_raw, '')), '') IS NOT NULL AND {numeric} AND t.normalized_rating IS NULL"
                ),
            ))
        }
        "track-disc-number-issues" => Ok(track_issue_sql(
            "track-disc-number-issues",
            "medium",
            "Missing or invalid disc/track number",
            "
            TRIM(
                CASE WHEN t.disc_number IS NULL THEN 'Missing disc ' WHEN t.disc_number <= 0 THEN 'Disc <= 0 ' ELSE '' END ||
                CASE WHEN t.track_number IS NULL THEN 'Missing track ' WHEN t.track_number <= 0 THEN 'Track <= 0 ' ELSE '' END
            )
            ",
            "t.disc_number IS NULL OR t.disc_number <= 0 OR t.track_number IS NULL OR t.track_number <= 0",
        )),
        "inconsistent-album-metadata" => Ok(
            "
            WITH inconsistent AS (
                SELECT
                    album_id,
                    COUNT(DISTINCT NULLIF(TRIM(LOWER(album)), '')) AS album_names,
                    COUNT(DISTINCT NULLIF(TRIM(LOWER(canonical_genre)), '')) AS genres,
                    COUNT(DISTINCT NULLIF(TRIM(LOWER(publisher)), '')) AS publishers
                FROM tracks
                GROUP BY album_id
                HAVING COUNT(DISTINCT NULLIF(TRIM(LOWER(album)), '')) > 1
                    OR COUNT(DISTINCT NULLIF(TRIM(LOWER(canonical_genre)), '')) > 1
                    OR COUNT(DISTINCT NULLIF(TRIM(LOWER(publisher)), '')) > 1
            )
            SELECT
                'inconsistent-album-metadata:' || a.id AS id,
                'inconsistent-album-metadata' AS tool_id,
                'medium' AS severity,
                'albums' AS entity_type,
                a.id AS album_id,
                NULL AS track_id,
                a.album,
                a.album_artist_display,
                NULL AS title,
                a.canonical_genre,
                a.year,
                'Tracks disagree on album metadata' AS detail,
                printf('%d titles / %d genres / %d publishers', i.album_names, i.genres, i.publishers) AS value,
                NULL AS filename,
                NULL AS file_path
            FROM inconsistent i
            JOIN albums a ON a.id = i.album_id
            "
            .to_string(),
        ),
        "whitespace-anomalies" => Ok(track_issue_sql(
            "whitespace-anomalies",
            "low",
            "Repeated internal whitespace",
            "'Repeated spaces'",
            WHITESPACE_ANOMALY_CONDITION_SQL,
        )),
        "genre-normalization-issues" => Ok(track_issue_sql(
            "genre-normalization-issues",
            "low",
            "Multiple genre values collapsed to canonical genre",
            "t.genre",
            "COALESCE(t.genre, '') LIKE '%;%' OR COALESCE(t.genre, '') LIKE '%|%'",
        )),
        "conflicting-album-artists" => {
            let album_artist_key_sql = format!(
                "NULLIF(TRIM(LOWER({})), '')",
                normalized_artist_sql("album_artist_display")
            );
            Ok(format!(
                "
            WITH conflicting AS (
                SELECT
                    album_id,
                    COUNT(DISTINCT {album_artist_key_sql}) AS artist_count
                FROM tracks
                GROUP BY album_id
                HAVING COUNT(DISTINCT {album_artist_key_sql}) > 1
            )
            SELECT
                'conflicting-album-artists:' || a.id AS id,
                'conflicting-album-artists' AS tool_id,
                'high' AS severity,
                'albums' AS entity_type,
                a.id AS album_id,
                NULL AS track_id,
                a.album,
                a.album_artist_display,
                NULL AS title,
                a.canonical_genre,
                a.year,
                'Tracks disagree on album artist' AS detail,
                printf('%d album artists', c.artist_count) AS value,
                NULL AS filename,
                NULL AS file_path
            FROM conflicting c
            JOIN albums a ON a.id = c.album_id
            "
            ))
        },
        "multiple-years-per-album" => Ok(
            "
            WITH multiple_years AS (
                SELECT
                    album_id,
                    COUNT(DISTINCT year) AS year_count
                FROM tracks
                WHERE year IS NOT NULL
                GROUP BY album_id
                HAVING COUNT(DISTINCT year) > 1
            )
            SELECT
                'multiple-years-per-album:' || a.id AS id,
                'multiple-years-per-album' AS tool_id,
                'medium' AS severity,
                'albums' AS entity_type,
                a.id AS album_id,
                NULL AS track_id,
                a.album,
                a.album_artist_display,
                NULL AS title,
                a.canonical_genre,
                a.year,
                'Album contains multiple track years' AS detail,
                printf('%d years on tracks', y.year_count) AS value,
                NULL AS filename,
                NULL AS file_path
            FROM multiple_years y
            JOIN albums a ON a.id = y.album_id
            "
            .to_string(),
        ),
        _ => bail!("Unknown music tool: {tool_id}"),
    }
}

fn track_issue_sql(
    tool_id: &str,
    severity: &str,
    detail: &str,
    value_sql: &str,
    condition_sql: &str,
) -> String {
    format!(
        "
        SELECT
            '{tool_id}:' || t.id AS id,
            '{tool_id}' AS tool_id,
            '{severity}' AS severity,
            'tracks' AS entity_type,
            t.album_id,
            t.id AS track_id,
            t.album,
            t.album_artist_display,
            t.title,
            t.canonical_genre,
            t.year,
            '{detail}' AS detail,
            {value_sql} AS value,
            t.filename,
            t.file_path
        FROM tracks t
        WHERE {condition_sql}
        "
    )
}

fn numeric_rating_condition(field: &str) -> String {
    let trimmed = format!("TRIM(COALESCE({field}, ''))");
    let dot_count = format!("(LENGTH({trimmed}) - LENGTH(REPLACE({trimmed}, '.', '')))");
    let minus_count = format!("(LENGTH({trimmed}) - LENGTH(REPLACE({trimmed}, '-', '')))");

    format!(
        "({trimmed} <> '' AND {trimmed} NOT GLOB '*[^0-9.-]*' AND {dot_count} <= 1 AND {minus_count} <= 1 AND (INSTR({trimmed}, '-') = 0 OR INSTR({trimmed}, '-') = 1) AND {trimmed} NOT IN ('.', '-', '-.'))"
    )
}

fn search_library(
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
            t.billboard_single_rank,
            t.billboard_single_year,
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
            origin.review_state
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
            origin.review_state
        "
    };

    let from_sql = if is_tracks {
        let origin_key_sql = artist_key_sql("a.album_artist_display");
        format!(
            "FROM tracks t LEFT JOIN albums a ON a.id = t.album_id LEFT JOIN album_covers c ON c.album_id = t.album_id LEFT JOIN musicbrainz_artist_origin_countries origin ON origin.local_artist_key = {origin_key_sql} LEFT JOIN musicbrainz_artist_infos info ON info.local_artist_key = {origin_key_sql}"
        )
    } else {
        let origin_key_sql = artist_key_sql("a.album_artist_display");
        format!(
            "FROM albums a LEFT JOIN album_covers c ON c.album_id = a.id LEFT JOIN musicbrainz_artist_origin_countries origin ON origin.local_artist_key = {origin_key_sql} LEFT JOIN musicbrainz_artist_infos info ON info.local_artist_key = {origin_key_sql}"
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

fn browse_row_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<BrowseRow> {
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
        billboard_single_rank: row.get(22)?,
        billboard_single_year: row.get(23)?,
        track_seconds: row.get(24)?,
        normalized_rating: row.get(25)?,
        disc_number: row.get(26)?,
        track_number: row.get(27)?,
        love: row.get(28)?,
        file_path: row.get(29)?,
        filename: row.get(30)?,
        cover_path: row.get(31)?,
        cover_mime_type: row.get(32)?,
        origin_country_code: row.get(33)?,
        origin_country_name: row.get(34)?,
        origin_country_raw_area: row.get(35)?,
        origin_country_review_state: row.get(36)?,
    })
}

fn build_where_clause(
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
    if is_tracks {
        add_i32_range(
            &mut conditions,
            &mut values,
            "t.billboard_single_rank",
            filters.billboard_single_rank_min,
            filters.billboard_single_rank_max,
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

fn add_album_id_condition(
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

fn add_artist_key_condition(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    artist_keys: &[String],
) {
    let normalized = artist_keys
        .iter()
        .map(|artist_key| normalize_artist_key(artist_key))
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

fn add_origin_country_conditions(
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

fn add_artist_info_conditions(
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

fn normalized_artist_info_option(value: &str, allowed_values: &[&str]) -> Option<String> {
    let normalized = value.trim().to_lowercase();
    if allowed_values.contains(&normalized.as_str()) {
        Some(normalized)
    } else {
        None
    }
}

fn add_artist_type_condition(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    artist_type: &str,
) {
    conditions.push("LOWER(COALESCE(info.artist_type, '')) = ?".to_string());
    values.push(Value::Text(artist_type.to_string()));
}

fn artist_ended_condition() -> String {
    "(COALESCE(info.life_ended, 0) = 1 OR info.life_end_year IS NOT NULL OR NULLIF(TRIM(COALESCE(info.life_end_date, '')), '') IS NOT NULL)".to_string()
}

fn add_text_condition(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    filter: &TextFilter,
) {
    if let Some(condition) = text_condition(field, filter, values) {
        conditions.push(condition);
    }
}

fn add_exists_text_condition(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    filter: &TextFilter,
    album_ref: &str,
) {
    if let Some(condition) = text_condition(field, filter, values) {
        conditions.push(format!(
            "EXISTS (SELECT 1 FROM tracks tx WHERE tx.album_id = {album_ref} AND {condition})"
        ));
    }
}

fn text_condition(field: &str, filter: &TextFilter, values: &mut Vec<Value>) -> Option<String> {
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

fn add_text_list_condition(
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

fn expanded_genre_filter_values(items: &[String]) -> Vec<String> {
    let mut normalized = Vec::new();
    for item in items {
        let value = normalize_text(item);
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

fn is_score_genre_group_alias(value: &str) -> bool {
    matches!(value, "score" | "scores")
}

fn push_unique(values: &mut Vec<String>, value: impl Into<String>) {
    let value = value.into();
    if !values.contains(&value) {
        values.push(value);
    }
}

fn add_i32_range(
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

fn add_i64_range(
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

fn add_seconds_range(
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

fn add_track_rating_range(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    field: &str,
    minimum: Option<i32>,
    maximum: Option<i32>,
) {
    if let Some(minimum) = minimum {
        conditions.push(format!("{field} >= ?"));
        values.push(Value::Integer(i64::from(track_rating_points(minimum))));
    }
    if let Some(maximum) = maximum {
        conditions.push(format!("{field} <= ?"));
        values.push(Value::Integer(i64::from(track_rating_points(maximum))));
    }
}

fn add_album_track_rating_range(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    minimum: Option<i32>,
    maximum: Option<i32>,
) {
    if minimum.is_none() && maximum.is_none() {
        return;
    }

    let mut track_conditions = Vec::new();
    if let Some(minimum) = minimum {
        track_conditions.push("tx.normalized_rating >= ?".to_string());
        values.push(Value::Integer(i64::from(track_rating_points(minimum))));
    }
    if let Some(maximum) = maximum {
        track_conditions.push("tx.normalized_rating <= ?".to_string());
        values.push(Value::Integer(i64::from(track_rating_points(maximum))));
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

fn add_missing_field_conditions(conditions: &mut Vec<String>, is_tracks: bool, fields: &[String]) {
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
            "billboard" => Some("a.billboard_rank IS NULL"),
            "billboardSingle" if is_tracks => Some("t.billboard_single_rank IS NULL"),
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

fn order_clause(is_tracks: bool, sort: &BrowseSort) -> String {
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
            "displayArtist" => "LOWER(COALESCE(t.display_artist, ''))",
            "artist" => "LOWER(COALESCE(t.album_artist_display, ''))",
            "year" => "t.year",
            "genre" => "LOWER(COALESCE(t.genre_normalized, ''))",
            "originCountry" => "LOWER(COALESCE(origin.country_name, origin.country_code, ''))",
            "billboardRank" => "a.billboard_rank",
            "billboardSingleRank" => "t.billboard_single_rank",
            "trackRating" => "t.normalized_rating",
            "time" => "t.time_seconds",
            "trackNumber" => "t.disc_number",
            _ => "LOWER(COALESCE(t.album, ''))",
        }
    } else {
        match sort.field.as_str() {
            "artist" => "LOWER(COALESCE(a.album_artist_display, ''))",
            "year" => "a.year",
            "genre" => "LOWER(COALESCE(a.genre_normalized, ''))",
            "originCountry" => "LOWER(COALESCE(origin.country_name, origin.country_code, ''))",
            "billboardRank" => "a.billboard_rank",
            "totalMinutes" => "a.total_seconds",
            "trackCount" => "a.total_tracks",
            "albumRating" => "a.effective_album_rating",
            "ratingCompleteness" => "a.rating_completeness",
            "lovedTracks" => "a.loved_tracks",
            "ae" => "a.ae_ratio",
            "tmoe" => "a.tmoe_seconds",
            "albumScore" => "a.album_score",
            _ => "LOWER(COALESCE(a.album, ''))",
        }
    };

    if is_tracks && sort.field == "trackNumber" {
        return format!("ORDER BY {field} {direction}, t.track_number {direction}, t.title ASC");
    }

    if is_tracks {
        format!(
            "ORDER BY {field} {direction}, LOWER(COALESCE(t.album, '')) ASC, t.disc_number ASC, t.track_number ASC"
        )
    } else {
        format!("ORDER BY {field} {direction}, LOWER(COALESCE(a.album_artist_display, '')) ASC")
    }
}

fn normalize_view(view: &str) -> String {
    if view.eq_ignore_ascii_case("tracks") {
        "tracks".to_string()
    } else {
        "albums".to_string()
    }
}

fn normalize_chart_config(mut config: ChartConfig) -> ChartConfig {
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

fn normalize_ranking_metric(metric: &str) -> String {
    match metric {
        "albumRating" | "ratingCompleteness" | "lovedTracks" | "ae" | "tmoe" | "totalMinutes"
        | "billboardRank" => metric.to_string(),
        _ => "albumScore".to_string(),
    }
}

fn normalize_chart_sort_field(field: Option<&str>, fallback_metric: &str) -> String {
    match field.unwrap_or(fallback_metric) {
        "album" | "artist" | "year" | "genre" | "originCountry" | "albumRating"
        | "ratingCompleteness" | "lovedTracks" | "ae" | "tmoe" | "totalMinutes" | "albumScore"
        | "billboardRank" => field.unwrap_or(fallback_metric).to_string(),
        _ => fallback_metric.to_string(),
    }
}

fn normalize_percentage(value: f64) -> f64 {
    if value > 1.0 {
        (value / 100.0).clamp(0.0, 1.0)
    } else {
        value.clamp(0.0, 1.0)
    }
}

fn track_rating_points(value: i32) -> i32 {
    if value <= 5 {
        value * 20
    } else {
        value
    }
}

fn fts_query(value: &str) -> Option<String> {
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

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn normalize_text(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn normalize_country_code(value: &str) -> String {
    value.trim().to_uppercase()
}

fn normalize_artist_text(value: &str) -> String {
    normalize_text(&normalize_artist_dashes(value))
}

fn normalize_artist_key(value: &str) -> String {
    let normalized = normalize_artist_text(value);
    if normalized.is_empty() {
        "unknown".to_string()
    } else {
        normalized
    }
}

fn musicbrainz_text_key(value: &str) -> String {
    let lowercased = value.replace('&', " and ").to_lowercase();
    let folded = lowercased
        .nfd()
        .filter(|character| !is_combining_mark(*character))
        .fold(String::new(), |mut normalized, character| {
            match character {
                'æ' => normalized.push_str("ae"),
                'œ' => normalized.push_str("oe"),
                'ø' => normalized.push('o'),
                'ð' => normalized.push('d'),
                'þ' => normalized.push_str("th"),
                'ł' => normalized.push('l'),
                'ß' => normalized.push_str("ss"),
                _ => normalized.push(character),
            }
            normalized
        });

    folded
        .split(|character: char| !character.is_alphanumeric())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn normalize_artist_dashes(value: &str) -> String {
    value
        .chars()
        .map(|character| match character {
            '\u{2010}' | '\u{2011}' | '\u{2012}' | '\u{2013}' | '\u{2014}' | '\u{2212}' => '-',
            _ => character,
        })
        .collect()
}

pub(crate) fn artist_key_sql(field: &str) -> String {
    format!(
        "COALESCE(NULLIF(TRIM(LOWER({})), ''), 'unknown')",
        normalized_artist_sql(field)
    )
}

fn normalized_artist_sql(field: &str) -> String {
    [8208, 8209, 8210, 8211, 8212, 8722]
        .iter()
        .fold(format!("COALESCE({field}, '')"), |expression, codepoint| {
            format!("REPLACE({expression}, char({codepoint}), '-')")
        })
}

pub(crate) fn safe_file_segment(value: &str) -> String {
    let segment = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();

    if segment.is_empty() {
        "tools".to_string()
    } else {
        segment
    }
}

fn write_export_file(
    path: &PathBuf,
    format: &str,
    view: &str,
    rows: &[BrowseRow],
    include_calculated: bool,
    export_columns: &[String],
) -> Result<()> {
    let (headers, values) = export_table(view, rows, include_calculated, export_columns);

    if format == "xlsx" {
        write_xlsx_file(path, &headers, &values)?;
        return Ok(());
    }

    let mut file = fs::File::create(path)?;

    match format {
        "json" => {
            let records = values
                .iter()
                .map(|row| {
                    headers
                        .iter()
                        .zip(row.iter())
                        .map(|(header, value)| {
                            (
                                (*header).to_string(),
                                serde_json::Value::String(value.clone()),
                            )
                        })
                        .collect::<serde_json::Map<_, _>>()
                })
                .collect::<Vec<_>>();
            file.write_all(serde_json::to_string_pretty(&records)?.as_bytes())?;
        }
        "tsv" => write_delimited(&mut file, '\t', &headers, &values)?,
        "txt" => write_delimited(&mut file, '\t', &headers, &values)?,
        _ => write_delimited(&mut file, ',', &headers, &values)?,
    }

    Ok(())
}

fn write_issue_export_file(path: &PathBuf, format: &str, rows: &[MusicToolIssueRow]) -> Result<()> {
    let (headers, values) = issue_export_table(rows);

    if format == "xlsx" {
        write_xlsx_file(path, &headers, &values)?;
        return Ok(());
    }

    let mut file = fs::File::create(path)?;

    match format {
        "json" => {
            let records = values
                .iter()
                .map(|row| {
                    headers
                        .iter()
                        .zip(row.iter())
                        .map(|(header, value)| {
                            (
                                (*header).to_string(),
                                serde_json::Value::String(value.clone()),
                            )
                        })
                        .collect::<serde_json::Map<_, _>>()
                })
                .collect::<Vec<_>>();
            file.write_all(serde_json::to_string_pretty(&records)?.as_bytes())?;
        }
        "tsv" => write_delimited(&mut file, '\t', &headers, &values)?,
        "txt" => write_delimited(&mut file, '\t', &headers, &values)?,
        _ => write_delimited(&mut file, ',', &headers, &values)?,
    }

    Ok(())
}

pub(crate) fn write_xlsx_file(
    path: &PathBuf,
    headers: &[&'static str],
    rows: &[Vec<String>],
) -> Result<()> {
    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    let header_format = Format::new().set_bold();

    for (column, header) in headers.iter().enumerate() {
        worksheet.write_string_with_format(0, column as u16, *header, &header_format)?;
    }

    for (row_index, row) in rows.iter().enumerate() {
        for (column_index, value) in row.iter().enumerate() {
            worksheet.write_string((row_index + 1) as u32, column_index as u16, value)?;
        }
    }

    workbook.save(path)?;
    Ok(())
}

pub(crate) fn write_delimited(
    file: &mut fs::File,
    delimiter: char,
    headers: &[&'static str],
    rows: &[Vec<String>],
) -> Result<()> {
    let delimiter_text = delimiter.to_string();
    writeln!(
        file,
        "{}",
        headers
            .iter()
            .map(|header| escape_delimited(header, delimiter))
            .collect::<Vec<_>>()
            .join(&delimiter_text)
    )?;

    for row in rows {
        writeln!(
            file,
            "{}",
            row.iter()
                .map(|value| escape_delimited(value, delimiter))
                .collect::<Vec<_>>()
                .join(&delimiter_text)
        )?;
    }

    Ok(())
}

fn escape_delimited(value: &str, delimiter: char) -> String {
    let clean = value.replace('\r', " ").replace('\n', " ");
    if delimiter == '\t' {
        return clean.replace('\t', " ");
    }

    if clean.contains(delimiter) || clean.contains('"') {
        format!("\"{}\"", clean.replace('"', "\"\""))
    } else {
        clean
    }
}

fn export_table(
    view: &str,
    rows: &[BrowseRow],
    include_calculated: bool,
    export_columns: &[String],
) -> (Vec<&'static str>, Vec<Vec<String>>) {
    let is_tracks = normalize_view(view) == "tracks";
    let include_calculated = include_calculated || has_export_column(export_columns, "calculated");
    let include_ids = has_export_column(export_columns, "ids");
    let include_filename = !is_tracks && has_export_column(export_columns, "filename");
    let include_file_path = !is_tracks && has_export_column(export_columns, "filePath");
    let include_cover_info = has_export_column(export_columns, "coverInfo");
    let include_origin_country = has_export_column(export_columns, "originCountry");
    let mut headers = if is_tracks {
        vec![
            "Album Artist",
            "Album",
            "Disc",
            "Track",
            "Title",
            "Display Artist",
            "Year",
            "Album Billboard",
            "Single Billboard",
            "Rating",
            "Time",
            "Love",
            "Filename",
            "File Path",
        ]
    } else {
        vec![
            "Album Artist",
            "Album",
            "Year",
            "Billboard",
            "Release Year",
            "Genre",
            "Publisher",
            "Tracks",
            "Minutes",
            "Album Rating",
            "Rating Complete",
            "Loved Tracks",
        ]
    };

    if include_ids {
        headers.push("Album ID");
        if is_tracks {
            headers.push("Track ID");
        }
    }

    if include_filename {
        headers.push("Filename");
    }

    if include_file_path {
        headers.push("File Path");
    }

    if include_cover_info {
        headers.extend(["Cover Path", "Cover MIME"]);
    }

    if include_origin_country {
        headers.extend(["Origin Country", "Origin Country Code", "Origin Raw Area"]);
    }

    if include_calculated {
        headers.extend(["TMOE Minutes", "AE Percent", "Album Score"]);
    }

    let values = rows
        .iter()
        .map(|row| {
            let mut values = if is_tracks {
                vec![
                    optional_text(&row.album_artist_display),
                    optional_text(&row.album),
                    optional_i32(row.disc_number),
                    optional_i32(row.track_number),
                    optional_text(&row.title),
                    optional_text(&row.display_artist),
                    optional_i32(row.year),
                    format_billboard_rank(row.billboard_rank, row.billboard_year),
                    format_billboard_rank(row.billboard_single_rank, row.billboard_single_year),
                    row.normalized_rating
                        .map(|rating| format!("{:.0}", f64::from(rating) / 20.0))
                        .unwrap_or_default(),
                    row.track_seconds
                        .map(format_seconds_as_minutes)
                        .unwrap_or_default(),
                    optional_text(&row.love),
                    optional_text(&row.filename),
                    optional_text(&row.file_path),
                ]
            } else {
                vec![
                    optional_text(&row.album_artist_display),
                    optional_text(&row.album),
                    optional_i32(row.year),
                    format_billboard_rank(row.billboard_rank, row.billboard_year),
                    optional_i32(row.release_year),
                    optional_text(&row.canonical_genre),
                    optional_text(&row.publisher),
                    row.total_tracks
                        .map(|value| value.to_string())
                        .unwrap_or_default(),
                    row.total_seconds
                        .map(format_seconds_as_minutes)
                        .unwrap_or_default(),
                    optional_i32(row.effective_album_rating),
                    row.rating_completeness
                        .map(|value| format!("{:.1}%", value * 100.0))
                        .unwrap_or_default(),
                    row.loved_tracks
                        .map(|value| value.to_string())
                        .unwrap_or_default(),
                ]
            };

            if include_ids {
                values.push(row.album_id.clone());
                if is_tracks {
                    values.push(
                        row.track_id
                            .map(|value| value.to_string())
                            .unwrap_or_default(),
                    );
                }
            }

            if include_filename {
                values.push(optional_text(&row.filename));
            }

            if include_file_path {
                values.push(optional_text(&row.file_path));
            }

            if include_cover_info {
                values.extend([
                    optional_text(&row.cover_path),
                    optional_text(&row.cover_mime_type),
                ]);
            }

            if include_origin_country {
                values.extend([
                    optional_text(&row.origin_country_name),
                    optional_text(&row.origin_country_code),
                    optional_text(&row.origin_country_raw_area),
                ]);
            }

            if include_calculated {
                values.extend([
                    row.tmoe_seconds
                        .map(format_seconds_as_minutes)
                        .unwrap_or_default(),
                    row.ae_ratio
                        .map(|value| format!("{:.2}%", value * 100.0))
                        .unwrap_or_default(),
                    row.album_score
                        .map(|value| format!("{value:.3}"))
                        .unwrap_or_default(),
                ]);
            }

            values
        })
        .collect::<Vec<_>>();

    (headers, values)
}

fn has_export_column(columns: &[String], column: &str) -> bool {
    let normalized_column = normalize_export_column(column);
    columns
        .iter()
        .any(|value| normalize_export_column(value) == normalized_column)
}

fn normalize_export_column(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn issue_export_table(rows: &[MusicToolIssueRow]) -> (Vec<&'static str>, Vec<Vec<String>>) {
    let headers = vec![
        "Tool",
        "Severity",
        "Scope",
        "Album Artist",
        "Album",
        "Year",
        "Track",
        "Genre",
        "Issue",
        "Value",
        "Filename",
        "File Path",
    ];

    let values = rows
        .iter()
        .map(|row| {
            vec![
                row.tool_id.clone(),
                row.severity.clone(),
                row.entity_type.clone(),
                optional_text(&row.album_artist_display),
                optional_text(&row.album),
                optional_i32(row.year),
                optional_text(&row.title),
                optional_text(&row.canonical_genre),
                row.detail.clone(),
                optional_text(&row.value),
                optional_text(&row.filename),
                optional_text(&row.file_path),
            ]
        })
        .collect::<Vec<_>>();

    (headers, values)
}

fn optional_text(value: &Option<String>) -> String {
    value.clone().unwrap_or_default()
}

fn optional_i32(value: Option<i32>) -> String {
    value.map(|value| value.to_string()).unwrap_or_default()
}

fn format_billboard_rank(rank: Option<i32>, year: Option<i32>) -> String {
    match (rank, year) {
        (Some(rank), Some(year)) => format!("#{rank} {year}"),
        (Some(rank), None) => format!("#{rank}"),
        _ => String::new(),
    }
}

fn format_seconds_as_minutes(seconds: i64) -> String {
    format!("{:.1}", seconds as f64 / 60.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_test_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "music-library-{label}-{}",
            Utc::now().timestamp_millis()
        ));
        fs::create_dir_all(&dir).expect("create temp test directory");
        dir
    }

    fn create_musicbrainz_tool_cache(path: &Path, artists: &[(&str, &str, usize)]) {
        let conn = Connection::open(path).expect("open test MusicBrainz cache");
        conn.execute_batch(
            "
            CREATE TABLE artist_cache (
                name TEXT PRIMARY KEY,
                mbid TEXT,
                cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE release_groups (
                artist_mbid TEXT,
                release_mbid TEXT,
                title TEXT,
                year INTEGER,
                type TEXT,
                secondary_types TEXT,
                track_count INTEGER,
                status TEXT,
                cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (artist_mbid, release_mbid)
            );
            ",
        )
        .expect("create MusicBrainz tool cache schema");

        for (name, mbid, release_count) in artists {
            conn.execute(
                "INSERT INTO artist_cache (name, mbid, cached_at) VALUES (?1, ?2, '2026-02-01 12:00:00')",
                params![name, mbid],
            )
            .expect("insert MusicBrainz tool cache artist");
            for index in 0..*release_count {
                conn.execute(
                    "
                    INSERT INTO release_groups (
                        artist_mbid, release_mbid, title, year, type, secondary_types,
                        track_count, status, cached_at
                    ) VALUES (
                        ?1, ?2, ?3, 1987, 'Album', '', 10, 'Official',
                        '2026-02-01 12:03:00'
                    )
                    ",
                    params![
                        mbid,
                        format!("{mbid}-release-{index}"),
                        format!("{name} Release {index}")
                    ],
                )
                .expect("insert MusicBrainz tool cache release");
            }
        }
    }

    fn insert_musicbrainz_tool_cache_release(
        path: &Path,
        mbid: &str,
        release_mbid: &str,
        title: &str,
        year: i32,
    ) {
        let conn = Connection::open(path).expect("open test MusicBrainz cache");
        conn.execute(
            "
            INSERT INTO release_groups (
                artist_mbid, release_mbid, title, year, type, secondary_types,
                track_count, status, cached_at
            ) VALUES (
                ?1, ?2, ?3, ?4, 'Album', '', 10, 'Official', '2026-02-01 12:03:00'
            )
            ",
            params![mbid, release_mbid, title, year],
        )
        .expect("insert MusicBrainz tool cache release");
    }

    fn insert_test_album(
        conn: &Connection,
        album_id: &str,
        artist: &str,
        album: &str,
        year: i32,
        total_tracks: i64,
    ) {
        conn.execute(
            "
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score
            ) VALUES (
                ?1, 1, ?1, ?3, ?2, 'Rock', 'rock', 'Test', ?4, ?4,
                ?5, ?5, 1.0, 2400, 0, 0, 0.0, 80, 100.0
            )
            ",
            params![album_id, artist, album, year, total_tracks],
        )
        .expect("insert test album");
    }

    fn insert_test_artist_info(
        conn: &Connection,
        artist: &str,
        artist_type: &str,
        gender: Option<&str>,
        begin_year: Option<i32>,
        end_year: Option<i32>,
        ended: bool,
    ) {
        let artist_key = normalize_artist_key(artist);
        let mbid = format!("mbid-{artist_key}");
        let begin_date = begin_year.map(|year| year.to_string());
        let end_date = end_year.map(|year| year.to_string());
        conn.execute(
            "
            INSERT INTO musicbrainz_artist_infos (
                local_artist_key, display_artist, mbid, sort_name, artist_type, gender,
                life_begin_date, life_begin_year, life_end_date, life_end_year,
                life_ended, review_state, source, fetched_at, created_at, updated_at
            ) VALUES (
                ?1, ?2, ?3, ?2, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                'imported', 'musicbrainz-live', '2026-07-09T00:00:00Z',
                '2026-07-09T00:00:00Z', '2026-07-09T00:00:00Z'
            )
            ",
            params![
                artist_key,
                artist,
                mbid,
                artist_type,
                gender,
                begin_date,
                begin_year,
                end_date,
                end_year,
                if ended { 1 } else { 0 },
            ],
        )
        .expect("insert test artist info");
    }

    fn seeded_file_database(db_path: &Path, album_id: &str, album: &str) -> Connection {
        let conn = Connection::open(db_path).expect("open file database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("migrate database");
        conn.execute(
            "
            INSERT INTO import_runs (
                source_path, source_size_bytes, started_at, completed_at,
                status, track_rows, album_count, duration_ms
            )
            VALUES ('library.tsv', 123, '2026-07-04T00:00:00Z',
                    '2026-07-04T00:00:01Z', 'completed', 1, 1, 1)
            ",
            [],
        )
        .expect("insert import run");
        let import_run_id = conn.last_insert_rowid();
        conn.execute(
            "
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, year, total_tracks,
                rated_tracks, rating_completeness, total_seconds, loved_tracks,
                tmoe_seconds, ae_ratio, effective_album_rating, album_score
            ) VALUES (
                ?1, ?2, ?1, ?3, 'Restore Artist', 'Synthpop', 'synthpop',
                2026, 1, 1, 1.0, 180, 0, 180, 1.0, 100, 10.0
            )
            ",
            params![album_id, import_run_id, album],
        )
        .expect("insert album");
        conn.execute(
            "
            INSERT INTO tracks (
                import_run_id, album_id, album_unique_id, display_artist,
                album_artist_display, album, title, canonical_genre,
                genre_normalized, normalized_rating, year, time_seconds, row_hash
            ) VALUES (
                ?1, ?2, ?2, 'Restore Artist', 'Restore Artist', ?3,
                'Restore Track', 'Synthpop', 'synthpop', 100, 2026, 180, ?4
            )
            ",
            params![import_run_id, album_id, album, format!("{album_id}-hash")],
        )
        .expect("insert track");
        conn
    }

    fn seeded_connection() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("migrate database");
        conn.execute(
            "
            INSERT INTO import_runs (source_path, started_at, status)
            VALUES ('library.tsv', '2026-06-25T00:00:00Z', 'completed')
            ",
            [],
        )
        .expect("insert import run");
        conn.execute(
            "
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score
            ) VALUES (
                'mb:test', 1, 'test', 'Actually', 'Pet Shop Boys',
                'Synthpop', 'synthpop', 'Parlophone', 1987, 1987,
                10, 10, 1.0, 2880, 2, 840, 0.2916, 86, 207.62
            )
            ",
            [],
        )
        .expect("insert album");
        conn.execute(
            "
            INSERT INTO tracks (
                import_run_id, album_id, album_unique_id, display_artist,
                album_artist_display, album, title, canonical_genre, genre_normalized,
                publisher, love, normalized_rating, year, release_year, time_seconds,
                file_path, filename, row_hash
            ) VALUES (
                1, 'mb:test', 'test', 'Pet Shop Boys', 'Pet Shop Boys',
                'Actually', 'What Have I Done to Deserve This?', 'Synthpop',
                'synthpop', 'Parlophone', 'L', 100, 1987, 1987, 260,
                'D:\\Music\\Pet Shop Boys\\Actually', '02 What Have I Done.mp3', 'hash'
            )
            ",
            [],
        )
        .expect("insert track");
        rebuild_search_indexes(&conn).expect("rebuild search indexes");
        conn
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
    fn imports_billboard_csv_and_keeps_best_overlap_rank() {
        let mut conn = seeded_connection();
        let source_dir = std::env::temp_dir().join(format!(
            "music-library-billboard-test-{}",
            Utc::now().timestamp_millis()
        ));
        fs::create_dir_all(&source_dir).expect("create billboard csv dir");
        fs::write(
            source_dir.join("1987.csv"),
            "EOY Rank,Artist,Title\n1,WHITNEY HOUSTON,Whitney\n103,PET SHOP BOYS,Actually\n",
        )
        .expect("write 1987 chart");
        fs::write(
            source_dir.join("1988.csv"),
            "EOY Rank,Artist,Title\n7,WHITNEY HOUSTON,Whitney\n107,PET SHOP BOYS,Actually\n",
        )
        .expect("write 1988 chart");

        let summary =
            import_billboard_charts(&mut conn, &source_dir).expect("import billboard charts");
        let response = search_library(&conn, BrowseRequest::default(), 50).expect("search albums");

        assert_eq!(summary.files_scanned, 2);
        assert_eq!(summary.chart_entries, 4);
        assert_eq!(summary.matched_albums, 1);
        assert_eq!(response.rows[0].billboard_rank, Some(103));
        assert_eq!(response.rows[0].billboard_year, Some(1987));

        let mut request = MusicToolIssueRequest::default();
        request.tool_id = "missing-billboard-albums".to_string();
        let missing_response = list_music_tool_issues(&conn, request, 50, None)
            .expect("list missing Billboard albums");

        assert_eq!(missing_response.tool.issue_count, 1);
        assert_eq!(missing_response.tool.album_count, 1);
        assert_eq!(missing_response.total, 1);
        assert_eq!(missing_response.rows[0].album.as_deref(), Some("Whitney"));
        assert_eq!(
            missing_response.rows[0].album_artist_display.as_deref(),
            Some("WHITNEY HOUSTON")
        );
        assert_eq!(missing_response.rows[0].value.as_deref(), Some("#1 / 1987"));

        fs::remove_dir_all(source_dir).expect("remove billboard csv dir");
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
                'mbid-psb', 'release-demo', 0, '2026-07-06T00:00:00Z'
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

    #[test]
    fn imports_billboard_csv_with_diacritic_library_text() {
        let mut conn = seeded_connection();
        conn.execute(
            "
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score
            ) VALUES (
                'mb:motley', 1, 'motley', 'Dr. Feelgood', 'Mötley Crüe',
                'Hard Rock', 'hard rock', 'Elektra', 1989, 1989,
                11, 11, 1.0, 2720, 3, 960, 0.3529, 90, 245.13
            )
            ",
            [],
        )
        .expect("insert motley album");
        let source_dir = std::env::temp_dir().join(format!(
            "music-library-billboard-diacritic-test-{}",
            Utc::now().timestamp_millis()
        ));
        fs::create_dir_all(&source_dir).expect("create billboard csv dir");
        fs::write(
            source_dir.join("1989.csv"),
            "EOY Rank,Artist,Title\n5,MOTLEY CRUE,Dr. Feelgood\n",
        )
        .expect("write diacritic chart");

        let summary =
            import_billboard_charts(&mut conn, &source_dir).expect("import billboard charts");
        let (rank, year): (Option<i32>, Option<i32>) = conn
            .query_row(
                "
                SELECT billboard_rank, billboard_year
                FROM albums
                WHERE id = 'mb:motley'
                ",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("load motley billboard rank");

        assert_eq!(summary.files_scanned, 1);
        assert_eq!(summary.chart_entries, 1);
        assert_eq!(summary.matched_albums, 1);
        assert_eq!(rank, Some(5));
        assert_eq!(year, Some(1989));

        fs::remove_dir_all(source_dir).expect("remove billboard csv dir");
    }

    #[test]
    fn imports_billboard_singles_using_display_artist_and_best_rank() {
        let mut conn = seeded_connection();
        conn.execute(
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
            )
            ",
            [],
        )
        .expect("insert compilation album");
        conn.execute(
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
            )
            ",
            [],
        )
        .expect("insert compilation track");
        rebuild_search_indexes(&conn).expect("rebuild search indexes");

        let source_dir = std::env::temp_dir().join(format!(
            "music-library-billboard-singles-test-{}",
            Utc::now().timestamp_millis()
        ));
        fs::create_dir_all(&source_dir).expect("create billboard singles csv dir");
        fs::write(
            source_dir.join("1987.csv"),
            "Year,Yearly Rank,Artist,Featured,Track\n1987,2,Bon Jovi,,Livin' On A Prayer\n1987,7,Whitney Houston,,So Emotional\n",
        )
        .expect("write 1987 singles chart");
        fs::write(
            source_dir.join("1988.csv"),
            "Year,Yearly Rank,Artist,Featured,Track\n1988,1,Bon Jovi,,Livin' On A Prayer\n",
        )
        .expect("write 1988 singles chart");

        let summary =
            import_billboard_singles(&mut conn, &source_dir).expect("import billboard singles");
        let (rank, year): (Option<i32>, Option<i32>) = conn
            .query_row(
                "
                SELECT billboard_single_rank, billboard_single_year
                FROM tracks
                WHERE display_artist = 'Bon Jovi'
                ",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("load Bon Jovi singles rank");

        assert_eq!(summary.files_scanned, 2);
        assert_eq!(summary.chart_entries, 3);
        assert_eq!(summary.matched_tracks, 1);
        assert_eq!(rank, Some(1));
        assert_eq!(year, Some(1988));

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
            Some("Various Artists")
        );
        assert_eq!(response.rows[0].billboard_single_rank, Some(1));
        assert_eq!(response.rows[0].billboard_single_year, Some(1988));

        let mut tool_request = MusicToolIssueRequest::default();
        tool_request.tool_id = "missing-billboard-singles".to_string();
        let missing_response = list_music_tool_issues(&conn, tool_request, 50, None)
            .expect("list missing Billboard singles");
        assert_eq!(missing_response.total, 1);
        assert_eq!(
            missing_response.rows[0].title.as_deref(),
            Some("So Emotional")
        );

        fs::remove_dir_all(source_dir).expect("remove billboard singles csv dir");
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
    fn lists_artist_summaries_and_filters_albums_by_artist_key() {
        let conn = seeded_connection();
        let artists = list_artists(&conn, ArtistListRequest::default(), 50).expect("list artists");

        assert_eq!(artists.total, 1);
        assert_eq!(artists.rows[0].id, "pet shop boys");
        assert_eq!(artists.rows[0].name, "Pet Shop Boys");
        assert_eq!(artists.rows[0].album_count, 1);
        assert_eq!(artists.rows[0].track_count, 10);
        assert_eq!(artists.rows[0].top_genre.as_deref(), Some("Synthpop"));

        let mut request = BrowseRequest::default();
        request.filters.artist_keys = vec![artists.rows[0].id.clone()];
        let response = search_library(&conn, request, 50).expect("search artist albums");

        assert_eq!(response.total, 1);
        assert_eq!(
            response.rows[0].album_artist_display.as_deref(),
            Some("Pet Shop Boys")
        );
    }

    #[test]
    fn normalizes_dash_variants_in_artist_summaries_and_filters() {
        let conn = seeded_connection();
        conn.execute(
            "
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score
            ) VALUES (
                'mb:rejects-old', 1, 'rejects-old', 'Move Along', 'The All-American Rejects',
                'Pop Punk', 'pop punk', 'Interscope', 2005, 2005,
                14, 14, 1.0, 2800, 4, 600, 0.214, 82, 413.0
            ),
            (
                'mb:rejects-new', 1, 'rejects-new', 'Kids in the Street', 'The All\u{2010}American Rejects',
                'Alternative Rock', 'alternative rock', 'Interscope', 2012, 2012,
                16, 0, 0.0, 3200, 0, 0, 0.0, NULL, NULL
            )
            ",
            [],
        )
        .expect("insert dash variant albums");

        let mut request = ArtistListRequest::default();
        request.search_text = "All-American".to_string();
        let artists = list_artists(&conn, request, 50).expect("list normalized artists");

        assert_eq!(artists.total, 1);
        assert_eq!(artists.rows[0].id, "the all-american rejects");
        assert_eq!(artists.rows[0].album_count, 2);
        assert_eq!(artists.rows[0].track_count, 30);
        assert_eq!(artists.rows[0].first_year, Some(2005));
        assert_eq!(artists.rows[0].last_year, Some(2012));

        let mut browse = BrowseRequest::default();
        browse.filters.artist_keys = vec!["The All\u{2010}American Rejects".to_string()];
        let response = search_library(&conn, browse, 50).expect("search normalized artist albums");

        assert_eq!(response.total, 2);
    }

    #[test]
    fn lists_genre_summaries_and_filters_albums_by_genre_key() {
        let conn = seeded_connection();
        let genres = list_genres(&conn, GenreListRequest::default(), 50).expect("list genres");

        assert_eq!(genres.total, 1);
        assert_eq!(genres.rows[0].id, "synthpop");
        assert_eq!(genres.rows[0].name, "Synthpop");
        assert_eq!(genres.rows[0].album_count, 1);
        assert_eq!(genres.rows[0].track_count, 10);
        assert_eq!(genres.rows[0].top_artist.as_deref(), Some("Pet Shop Boys"));

        let mut request = BrowseRequest::default();
        request.filters.genres = vec![genres.rows[0].id.clone()];
        let response = search_library(&conn, request, 50).expect("search genre albums");

        assert_eq!(response.total, 1);
        assert_eq!(
            response.rows[0].canonical_genre.as_deref(),
            Some("Synthpop")
        );
    }

    #[test]
    fn lists_genre_suggestion_names() {
        let conn = seeded_connection();
        let genres = genre_suggestion_names(&conn).expect("list genre suggestion names");

        assert_eq!(genres, vec!["Synthpop"]);
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
    fn lists_music_tool_issues_and_export_rows() {
        let conn = seeded_connection();
        conn.execute(
            "UPDATE tracks SET filename = '02 What Have I Done.flac' WHERE id = 1",
            [],
        )
        .expect("make non-mp3 issue");

        let tools = list_music_tools(&conn).expect("list music tools");
        let non_mp3 = tools
            .iter()
            .find(|tool| tool.id == "non-mp3-files")
            .expect("non-mp3 tool");

        assert_eq!(non_mp3.issue_count, -1);

        let mut request = MusicToolIssueRequest::default();
        request.tool_id = "non-mp3-files".to_string();
        request.search_text = "flac".to_string();
        let response =
            list_music_tool_issues(&conn, request, 50, None).expect("list non-mp3 issues");
        let (headers, rows) = issue_export_table(&response.rows);

        assert_eq!(response.tool.issue_count, 1);
        assert_eq!(response.tool.album_count, 1);
        assert_eq!(response.tool.track_count, 1);
        assert_eq!(response.total, 1);
        assert_eq!(
            response.rows[0].filename.as_deref(),
            Some("02 What Have I Done.flac")
        );
        assert!(headers.contains(&"Issue"));
        assert_eq!(rows.len(), 1);
    }

    #[test]
    fn runs_performance_probe_with_representative_operations() {
        let conn = seeded_connection();
        let probe =
            performance_probe(&conn, "in-memory-test.sqlite3".to_string()).expect("run probe");

        assert_eq!(probe.track_count, 1);
        assert_eq!(probe.album_count, 1);
        assert_eq!(probe.database_path, "in-memory-test.sqlite3");
        assert!(probe.operations.len() >= 8);
        assert!(probe.slowest_operation_ms <= probe.total_duration_ms);
        assert!(probe
            .operations
            .iter()
            .all(|operation| operation.status == "ok"));
        assert!(probe
            .operations
            .iter()
            .any(|operation| operation.id == "search-albums-default"));
        assert!(probe
            .operations
            .iter()
            .any(|operation| operation.id == "statistics-dashboard"));
    }

    #[test]
    fn previews_and_applies_whitespace_music_tool_fix() {
        let mut conn = seeded_connection();
        conn.execute(
            "
            UPDATE tracks
            SET album = 'Actually  Deluxe',
                album_artist_display = 'Pet  Shop Boys',
                display_artist = 'Pet  Shop Boys',
                title = 'What  Have I Done?',
                genre = 'Synthpop  Dance',
                canonical_genre = 'Synthpop  Dance',
                publisher = 'Parlo  phone',
                file_path = 'D:\\Music\\Pet  Shop Boys\\Actually',
                filename = '02 What  Have I Done.mp3'
            WHERE id = 1
            ",
            [],
        )
        .expect("make track whitespace issue");
        conn.execute(
            "
            UPDATE albums
            SET album = 'Actually  Deluxe',
                album_artist_display = 'Pet  Shop Boys',
                canonical_genre = 'Synthpop  Dance',
                genre_normalized = 'synthpop  dance',
                publisher = 'Parlo  phone'
            WHERE id = 'mb:test'
            ",
            [],
        )
        .expect("make album whitespace issue");
        rebuild_search_indexes(&conn).expect("rebuild search indexes");

        let mut request = MusicToolIssueRequest::default();
        request.tool_id = "whitespace-anomalies".to_string();
        let response = list_music_tool_issues(&conn, request.clone(), 50, None)
            .expect("list whitespace issues");

        assert_eq!(response.tool.issue_count, 1);
        assert_eq!(response.total, 1);

        let issue_ids = response
            .rows
            .iter()
            .map(|row| row.id.clone())
            .collect::<Vec<_>>();
        let preview = fix_music_tool_issues(
            &mut conn,
            None,
            MusicToolFixRequest {
                tool_id: "whitespace-anomalies".to_string(),
                issue_ids: issue_ids.clone(),
                apply: false,
            },
        )
        .expect("preview whitespace fix");

        assert!(!preview.applied);
        assert_eq!(preview.fixable_count, 1);
        assert_eq!(preview.changed_track_count, 0);

        let still_dirty = list_music_tool_issues(&conn, request.clone(), 50, None)
            .expect("list whitespace issues after preview");
        assert_eq!(still_dirty.total, 1);

        let summary = fix_music_tool_issues(
            &mut conn,
            None,
            MusicToolFixRequest {
                tool_id: "whitespace-anomalies".to_string(),
                issue_ids,
                apply: true,
            },
        )
        .expect("apply whitespace fix");

        assert!(summary.applied);
        assert_eq!(summary.fixable_count, 1);
        assert_eq!(summary.changed_track_count, 1);
        assert_eq!(summary.changed_album_count, 1);
        assert!(summary.backup_path.is_none());

        let clean = list_music_tool_issues(&conn, request, 50, None)
            .expect("list whitespace issues after fix");
        assert_eq!(clean.total, 0);

        let (track_album, track_artist, track_title, track_genre, track_path, track_filename): (
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
        ) = conn
            .query_row(
                "
                SELECT album, album_artist_display, title, canonical_genre, file_path, filename
                FROM tracks
                WHERE id = 1
                ",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .expect("load compacted track");
        let (album_title, album_artist, album_genre): (
            Option<String>,
            Option<String>,
            Option<String>,
        ) = conn
            .query_row(
                "
                SELECT album, album_artist_display, canonical_genre
                FROM albums
                WHERE id = 'mb:test'
                ",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("load compacted album");

        assert_eq!(track_album.as_deref(), Some("Actually Deluxe"));
        assert_eq!(track_artist.as_deref(), Some("Pet Shop Boys"));
        assert_eq!(track_title.as_deref(), Some("What Have I Done?"));
        assert_eq!(track_genre.as_deref(), Some("Synthpop Dance"));
        assert_eq!(
            track_path.as_deref(),
            Some("D:\\Music\\Pet Shop Boys\\Actually")
        );
        assert_eq!(track_filename.as_deref(), Some("02 What Have I Done.mp3"));
        assert_eq!(album_title.as_deref(), Some("Actually Deluxe"));
        assert_eq!(album_artist.as_deref(), Some("Pet Shop Boys"));
        assert_eq!(album_genre.as_deref(), Some("Synthpop Dance"));
    }

    #[test]
    fn lists_albums_without_cover_image_records() {
        let conn = seeded_connection();
        let mut request = MusicToolIssueRequest::default();
        request.tool_id = "albums-without-cover-image".to_string();

        let response =
            list_music_tool_issues(&conn, request.clone(), 50, None).expect("list cover issues");

        assert_eq!(response.tool.issue_count, 1);
        assert_eq!(response.tool.album_count, 1);
        assert_eq!(response.tool.track_count, 0);
        assert_eq!(response.total, 1);
        assert_eq!(response.rows[0].album.as_deref(), Some("Actually"));
        assert_eq!(
            response.rows[0].file_path.as_deref(),
            Some("D:\\Music\\Pet Shop Boys\\Actually")
        );

        conn.execute(
            "
            INSERT INTO album_covers (
                album_id, source, source_path, cache_path, mime_type, extension,
                file_size_bytes, imported_at
            ) VALUES (
                'mb:test', 'archive', 'D:\\Music\\AlbumCovers\\Actually.jpg',
                'D:\\Music\\AlbumCovers\\Actually.jpg', 'image/jpeg', 'jpg',
                2048, '2026-06-30T00:00:00Z'
            )
            ",
            [],
        )
        .expect("insert album cover");

        let response = list_music_tool_issues(&conn, request, 50, None)
            .expect("list cover issues after import");

        assert_eq!(response.tool.issue_count, 0);
        assert_eq!(response.tool.album_count, 0);
        assert_eq!(response.total, 0);
    }

    #[test]
    fn skips_noop_migration_for_current_schema() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        migrate(&conn).expect("noop migration");

        let user_version = conn
            .query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
            .expect("read user version");

        assert_eq!(user_version, LATEST_SCHEMA_VERSION);
        assert!(phase_nineteen_schema_exists(&conn).expect("phase nineteen schema exists"));
        assert!(schema_table_exists(&conn, "musicbrainz_origin_countries")
            .expect("origin country table exists"));
        assert!(
            schema_table_exists(&conn, "musicbrainz_artist_origin_countries")
                .expect("artist origin country table exists")
        );
        assert!(
            schema_table_exists(&conn, "musicbrainz_artist_origin_import_runs")
                .expect("artist origin import run table exists")
        );
        assert!(schema_table_exists(&conn, "musicbrainz_artist_infos")
            .expect("artist info table exists"));
        assert!(
            schema_table_exists(&conn, "musicbrainz_artist_info_import_runs")
                .expect("artist info import run table exists")
        );
    }

    #[test]
    fn clears_legacy_developer_overlay_sync_default() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute(
            "UPDATE app_settings SET musicbrainz_overlay_sync_path = ?1 WHERE id = 1",
            params![r"C:\Users\jtill\OneDrive\_musicbackup\musicbrainz-overlay-sync.sqlite3"],
        )
        .expect("restore legacy developer default");
        conn.execute_batch("PRAGMA user_version = 19;")
            .expect("rewind schema version");

        migrate(&conn).expect("migrate portable overlay default");

        let sync_path: String = conn
            .query_row(
                "SELECT musicbrainz_overlay_sync_path FROM app_settings WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("read migrated overlay path");
        assert!(sync_path.is_empty());
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
    fn migrates_existing_album_table_before_billboard_index() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        conn.execute_batch(
            "
            CREATE TABLE albums (
                id TEXT PRIMARY KEY,
                import_run_id INTEGER NOT NULL,
                album_unique_id TEXT,
                album TEXT,
                album_artist_display TEXT,
                canonical_genre TEXT,
                genre_normalized TEXT,
                publisher TEXT,
                year INTEGER,
                release_year INTEGER,
                total_tracks INTEGER NOT NULL,
                rated_tracks INTEGER NOT NULL,
                rating_completeness REAL NOT NULL,
                total_seconds INTEGER NOT NULL,
                loved_tracks INTEGER NOT NULL,
                tmoe_seconds INTEGER NOT NULL,
                ae_ratio REAL NOT NULL,
                album_rating INTEGER,
                calculated_album_rating INTEGER,
                effective_album_rating INTEGER,
                album_score REAL
            );
            PRAGMA user_version = 7;
            ",
        )
        .expect("create pre-billboard albums table");

        migrate(&conn).expect("migrate pre-billboard schema");

        assert!(schema_column_exists(&conn, "albums", "billboard_rank")
            .expect("billboard rank column exists"));
        assert!(schema_column_exists(&conn, "albums", "billboard_year")
            .expect("billboard year column exists"));
        assert!(schema_table_exists(&conn, "billboard_chart_entries")
            .expect("billboard chart entry table exists"));
        assert!(
            schema_column_exists(&conn, "tracks", "billboard_single_rank")
                .expect("billboard single rank column exists")
        );
        assert!(
            schema_column_exists(&conn, "tracks", "billboard_single_year")
                .expect("billboard single year column exists")
        );
        assert!(schema_table_exists(&conn, "billboard_single_chart_entries")
            .expect("billboard single chart entry table exists"));
        assert!(phase_twelve_schema_exists(&conn).expect("phase twelve schema exists"));
    }

    #[test]
    fn migrates_existing_track_table_before_billboard_singles_index() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        conn.execute_batch(
            "
            CREATE TABLE tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                import_run_id INTEGER NOT NULL,
                album_id TEXT NOT NULL,
                album_unique_id TEXT,
                display_artist TEXT,
                album_artist_display TEXT,
                album TEXT,
                title TEXT,
                genre TEXT,
                canonical_genre TEXT,
                genre_normalized TEXT,
                publisher TEXT,
                love TEXT,
                rating_raw TEXT,
                normalized_rating INTEGER,
                album_rating_raw TEXT,
                album_rating INTEGER,
                disc_number INTEGER,
                track_number INTEGER,
                year INTEGER,
                release_year INTEGER,
                time_seconds INTEGER,
                file_path TEXT,
                filename TEXT,
                row_hash TEXT NOT NULL
            );
            PRAGMA user_version = 9;
            ",
        )
        .expect("create pre-singles tracks table");

        migrate(&conn).expect("migrate pre-singles schema");

        assert!(
            schema_column_exists(&conn, "tracks", "billboard_single_rank")
                .expect("billboard single rank column exists")
        );
        assert!(
            schema_column_exists(&conn, "tracks", "billboard_single_year")
                .expect("billboard single year column exists")
        );
        assert!(phase_twelve_schema_exists(&conn).expect("phase twelve schema exists"));
    }

    #[test]
    fn saves_and_clamps_app_settings() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("migrate database");

        let saved = save_settings_for_connection(
            &conn,
            AppSettings {
                backup_retention: 500,
                dark_mode: true,
                country_flag_display: "flag".to_string(),
                left_sidebar_default: "iconOnly".to_string(),
                right_sidebar_default: "hidden".to_string(),
                import_source_path: r"D:\Exports\musicbee-library.tsv".to_string(),
                cover_source_path: r"D:\Covers".to_string(),
                billboard_source_path: r"D:\Charts\Albums".to_string(),
                billboard_singles_source_path: r"D:\Charts\Singles".to_string(),
                musicbrainz_cache_path: "MusicBrainz/custom-cache.db".to_string(),
                musicbrainz_overlay_sync_path: r"C:\Sync\musicbrainz-overlay-sync.sqlite3"
                    .to_string(),
                musicbrainz_overlay_auto_sync_minutes: 2_000,
                update_auto_check_minutes: 2_000,
                updated_at: None,
            },
        )
        .expect("save settings");

        assert_eq!(saved.backup_retention, MAX_BACKUP_RETENTION);
        assert!(saved.dark_mode);
        assert_eq!(saved.country_flag_display, "flag");
        assert_eq!(saved.left_sidebar_default, "iconOnly");
        assert_eq!(saved.right_sidebar_default, "hidden");
        assert_eq!(saved.import_source_path, r"D:\Exports\musicbee-library.tsv");
        assert_eq!(saved.cover_source_path, r"D:\Covers");
        assert_eq!(saved.billboard_source_path, r"D:\Charts\Albums");
        assert_eq!(saved.billboard_singles_source_path, r"D:\Charts\Singles");
        assert_eq!(saved.musicbrainz_cache_path, "MusicBrainz/custom-cache.db");
        assert_eq!(
            saved.musicbrainz_overlay_sync_path,
            r"C:\Sync\musicbrainz-overlay-sync.sqlite3"
        );
        assert_eq!(
            saved.musicbrainz_overlay_auto_sync_minutes,
            MAX_MUSICBRAINZ_OVERLAY_AUTO_SYNC_MINUTES
        );
        assert_eq!(
            saved.update_auto_check_minutes,
            MAX_UPDATE_AUTO_CHECK_MINUTES
        );

        let loaded = settings_for_connection(&conn).expect("load settings");
        assert_eq!(loaded.backup_retention, MAX_BACKUP_RETENTION);
        assert!(loaded.dark_mode);
        assert_eq!(loaded.country_flag_display, "flag");
        assert_eq!(loaded.left_sidebar_default, "iconOnly");
        assert_eq!(loaded.right_sidebar_default, "hidden");
        assert_eq!(
            loaded.import_source_path,
            r"D:\Exports\musicbee-library.tsv"
        );
        assert_eq!(loaded.cover_source_path, r"D:\Covers");
        assert_eq!(loaded.billboard_source_path, r"D:\Charts\Albums");
        assert_eq!(loaded.billboard_singles_source_path, r"D:\Charts\Singles");
        assert_eq!(loaded.musicbrainz_cache_path, "MusicBrainz/custom-cache.db");
        assert_eq!(
            loaded.musicbrainz_overlay_sync_path,
            r"C:\Sync\musicbrainz-overlay-sync.sqlite3"
        );
        assert_eq!(
            loaded.musicbrainz_overlay_auto_sync_minutes,
            MAX_MUSICBRAINZ_OVERLAY_AUTO_SYNC_MINUTES
        );
        assert_eq!(
            loaded.update_auto_check_minutes,
            MAX_UPDATE_AUTO_CHECK_MINUTES
        );
        assert!(loaded.updated_at.is_some());
    }

    #[test]
    fn lists_database_backups_with_metadata_and_schema() {
        let temp_dir = temp_test_dir("backup-list");
        let db_path = temp_dir.join("music-library.sqlite3");
        let conn = seeded_file_database(&db_path, "active", "Active Album");
        let backup_dir = backup_directory_for_db_path(&db_path).expect("backup directory");
        fs::create_dir_all(&backup_dir).expect("create backup directory");
        let backup_path = backup_dir.join("music-library-test-before-import.sqlite3");
        drop(seeded_file_database(&backup_path, "backup", "Backup Album"));
        let backup_path_text = backup_path.display().to_string();

        conn.execute(
            "
            INSERT INTO database_backups (
                created_at, operation, source_path, source_size_bytes, backup_path
            )
            VALUES (
                '2026-07-04T10:00:00Z', 'import', 'library.tsv', 456, ?1
            )
            ",
            params![backup_path_text],
        )
        .expect("insert backup metadata");
        conn.execute(
            "
            INSERT INTO import_runs (
                source_path, source_size_bytes, started_at, completed_at,
                status, track_rows, album_count, duration_ms, backup_path
            )
            VALUES (
                'library.tsv', 456, '2026-07-04T10:00:00Z',
                '2026-07-04T10:00:01Z', 'completed', 42, 7, 1, ?1
            )
            ",
            params![backup_path.display().to_string()],
        )
        .expect("insert import run backup link");

        let backups = list_database_backups(&conn, &db_path).expect("list database backups");

        assert_eq!(backups.len(), 1);
        assert_eq!(backups[0].operation, "import");
        assert_eq!(backups[0].track_rows, Some(42));
        assert_eq!(backups[0].album_count, Some(7));
        assert_eq!(backups[0].schema_version, Some(LATEST_SCHEMA_VERSION));
        assert!(backups[0].can_restore);

        drop(conn);
        fs::remove_dir_all(temp_dir).expect("remove temp dir");
    }

    #[test]
    fn rejects_restore_paths_outside_backup_directory() {
        let temp_dir = temp_test_dir("backup-escape");
        let db_path = temp_dir.join("music-library.sqlite3");
        drop(seeded_file_database(&db_path, "active", "Active Album"));
        let outside_path = temp_dir.join("outside.sqlite3");
        drop(seeded_file_database(
            &outside_path,
            "outside",
            "Outside Album",
        ));

        let error = restore_database_backup(&db_path, &outside_path.display().to_string())
            .expect_err("reject outside backup path");

        assert!(error
            .to_string()
            .contains("inside the app backup directory"));

        fs::remove_dir_all(temp_dir).expect("remove temp dir");
    }

    #[test]
    fn restores_database_backup_and_creates_pre_restore_backup() {
        let temp_dir = temp_test_dir("backup-restore");
        let db_path = temp_dir.join("music-library.sqlite3");
        drop(seeded_file_database(&db_path, "active", "Active Album"));
        let backup_dir = backup_directory_for_db_path(&db_path).expect("backup directory");
        fs::create_dir_all(&backup_dir).expect("create backup directory");
        let backup_path = backup_dir.join("music-library-test-before-import.sqlite3");
        drop(seeded_file_database(
            &backup_path,
            "restored",
            "Restored Album",
        ));

        let summary = restore_database_backup(&db_path, &backup_path.display().to_string())
            .expect("restore database backup");

        assert_eq!(summary.track_count, 1);
        assert_eq!(summary.album_count, 1);
        assert_eq!(summary.schema_version, LATEST_SCHEMA_VERSION);
        assert!(summary.restored_backup.can_restore);
        let pre_restore_backup_path = summary
            .pre_restore_backup_path
            .expect("pre-restore backup path");
        assert!(PathBuf::from(&pre_restore_backup_path).exists());

        let restored_conn = Connection::open(&db_path).expect("open restored database");
        let album: String = restored_conn
            .query_row("SELECT album FROM albums", [], |row| row.get(0))
            .expect("read restored album");
        assert_eq!(album, "Restored Album");

        let backups =
            list_database_backups(&restored_conn, &db_path).expect("list backups after restore");
        assert!(backups
            .iter()
            .any(|backup| backup.operation == "restore"
                && backup.backup_path == pre_restore_backup_path));

        drop(restored_conn);
        fs::remove_dir_all(temp_dir).expect("remove temp dir");
    }

    #[test]
    fn loads_statistics_dashboard_payload() {
        let conn = seeded_connection();

        let stats = statistics(&conn).expect("load statistics");

        assert_eq!(stats.overview.album_count, 1);
        assert_eq!(stats.rating_progress.fully_rated_albums, 1);
        assert_eq!(stats.year_progress[0].year, 1987);
        assert_eq!(stats.track_rating_distribution[0].label, "5");
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
