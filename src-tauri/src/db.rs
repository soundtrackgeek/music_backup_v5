//! SQLite access for the catalog. This file opens and configures connections and
//! re-exports the feature modules in `db/`; see `docs/backend-architecture.md`.

use crate::ai::{
    AiMarkdownExportRequest, AiMusicResearchContext, AiPlaylist, AiPlaylistPlan, AiPlaylistTrack,
    AiSnapshot, AiSnapshotContent, ExportPlaylistRequest, LibraryProfileRequest,
    LibraryProfileResult, MusicResearchInspectionRequest, MusicResearchInspectionResult,
    PlaylistAutomationStatus, SaveAiSnapshotRequest, SavePlaylistRequest, SavedPlaylist,
    SetPlaylistAutomationRequest, SmartPlaylistRefreshResult, ViewInspectionItem,
    ViewInspectionRequest, ViewInspectionResult,
};
use crate::identity::{self, artist_key_sql};
#[cfg(test)]
use crate::models::AppSettings;
use crate::models::{
    AlbumDebutTimelineAlbum, AlbumDebutTimelineResponse, AlbumDebutTimelineYear, ArtistChartTrack,
    ArtistListRequest, ArtistListResponse, ArtistLovedTrack, ArtistSummary, ArtistTimelineAlbum,
    ArtistTimelineArtist, ArtistTimelineRequest, ArtistTimelineResponse, ArtistTrackChartHistory,
    ArtistTrackHighlights, BillboardImportSummary, BillboardSinglesImportSummary, BrowseFilters,
    BrowseRequest, BrowseResponse, BrowseRow, BrowseSort, CatalogConcentrationStats, ChartConfig,
    ConcentrationPoint, CountryCatalogStats, DecadeProgressStats, DiscoveryAlbumCompletionStory,
    DiscoveryAlbumPoint, DiscoveryAnniversaryStory, DiscoveryArtistCompletionStory,
    DiscoveryArtistPoint, DiscoveryChartSnapshot, DiscoveryChartSnapshotRequest,
    DiscoveryChartStory, DiscoveryCompletionSnapshot, DiscoveryCompletionSnapshotRequest,
    DiscoveryDailyEdition, DiscoveryDailyEditionArchive, DiscoveryDailyEditionSnapshotResponse,
    DiscoveryDeepCutGenre, DiscoveryDeepCutSnapshot, DiscoveryDeepCutSnapshotRequest,
    DiscoveryDeepCutStory, DiscoveryGenrePoint, DiscoveryHeatmapCell, DiscoveryLifeEventStory,
    DiscoveryMission, DiscoveryMixerRecommendation, DiscoveryMixerRequest, DiscoveryMixerResponse,
    DiscoveryMixerSeedInput, DiscoveryMixerSeedOption, DiscoveryMixerSeedSearchRequest,
    DiscoveryRecommendationAnchor, DiscoveryRecommendationSnapshot,
    DiscoveryRecommendationSnapshotRequest, DiscoveryRecommendationStory, DiscoveryResponse,
    DiscoveryShelfExplorerRequest, DiscoveryShelfExplorerResponse, DiscoverySourceHealthItem,
    DiscoverySourceHealthResponse, DurationAlbumStat, DurationAnalyticsStats,
    ExportMusicToolRequest, ExportResult, ExportSearchRequest, GenreListRequest, GenreListResponse,
    GenreProgressRequest, GenreProgressStats, GenreSummary, GenreTimelineAlbumPoint,
    GenreTimelineGenre, GenreTimelineRequest, GenreTimelineResponse, GenreTimelineYearCount,
    ImportRun, LibraryHealthScore, LibraryOverviewStats, LibraryShapeStats, LibraryStatus,
    LovedDensityStat, LovedTrackStats, MetadataCoverageMetric, MusicBrainzOriginCountryOption,
    MusicToolFieldDiff, MusicToolFixDiff, MusicToolFixHistoryEntry, MusicToolFixRequest,
    MusicToolFixSummary, MusicToolIssueRequest, MusicToolIssueResponse, MusicToolIssueRow,
    MusicToolProgress, MusicToolSummary, MusicToolUndoSummary, NorsktoppenImportSummary,
    OfficialUkImportSummary, OutlierStat, PerformanceProbeOperation, PerformanceProbeResponse,
    RatingBucket, RatingEvent, RatingHistoryPoint, RatingProgressStats, SaveChartRequest,
    SaveSearchRequest, SavedChart, SavedSearch, StatisticsResponse, TextFilter,
    TiISkuddetImportSummary, TrackDebutTimelineResponse, TrackDebutTimelineTrack,
    TrackDebutTimelineYear, VgListaImportSummary, YearProgressRequest, YearProgressStats,
};
use anyhow::{anyhow, bail, Context, Result};
use chrono::{Datelike, Local, NaiveDate, Utc, Weekday};
use rusqlite::{
    functions::FunctionFlags, params, params_from_iter, types::Value, Connection, OpenFlags,
    OptionalExtension,
};
use rust_xlsxwriter::{Format, Workbook};
use serde_json::json;
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
use tauri::{AppHandle, Manager};

#[cfg(not(test))]
type ProgressApp<'a> = &'a AppHandle;
#[cfg(test)]
type ProgressApp<'a> = &'a ();

mod ai_snapshots;
mod artists_genres;
mod backups;
mod chart_imports;
mod chart_reconcile;
mod diagnostics;
mod discovery;
mod discovery_missions;
mod discovery_mixer;
mod discovery_snapshots;
mod discovery_sonic;
mod exports;
mod inspection;
mod lifecycle;
#[cfg(test)]
mod lifecycle_probe;
mod migrations;
mod playlists;
mod provider_cache;
mod saved_views;
mod schema;
mod search;
mod settings;
mod stats;
#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests;
mod timelines;
mod tools;
mod tools_fix;
mod tools_musicbrainz;
use backups::create_database_file_backup;
#[cfg(test)]
use backups::{backup_directory_for_db_path, list_database_backups, restore_database_backup};
#[cfg(not(test))]
pub(crate) use backups::{list_database_backups_for_app, restore_database_backup_for_app};
pub(crate) use lifecycle::{pool_for_path, CatalogConnection};
use migrations::LATEST_SCHEMA_VERSION;
use settings::normalize_musicbrainz_cache_path;
#[cfg(test)]
use settings::save_settings_for_connection;
pub(crate) use settings::settings_for_connection;
#[cfg(not(test))]
pub(crate) use settings::{save_settings_for_app, settings_for_app};

// Feature modules keep their original `db::` paths through these re-exports, so
// command call sites and `crate::db::...` imports are unchanged.
pub use ai_snapshots::*;
use artists_genres::*;
pub use chart_imports::*;
pub(crate) use chart_reconcile::*;
pub use diagnostics::*;
pub use discovery::*;
use discovery_missions::*;
use discovery_mixer::*;
use discovery_snapshots::*;
pub use exports::*;
use inspection::*;
pub use playlists::*;
pub(crate) use provider_cache::*;
pub use saved_views::*;
pub use schema::*;
pub use search::*;
pub use stats::*;
pub use timelines::*;
pub use tools::*;
use tools_fix::*;
use tools_musicbrainz::*;

const DB_FILE_NAME: &str = "music-library.sqlite3";
const DEFAULT_BACKUP_RETENTION: u32 = 3;
const DEFAULT_IMPORT_SOURCE_PATH: &str = "musicbee-library.tsv";
const DEFAULT_COVER_SOURCE_PATH: &str = "AlbumCovers";
const DEFAULT_BILLBOARD_SOURCE_PATH: &str = "CSV_ALBUMS";
const DEFAULT_BILLBOARD_SINGLES_SOURCE_PATH: &str = "CSV_SINGLES";
const DEFAULT_VG_LISTA_ALBUM_SOURCE_PATH: &str = "CSV_ALBUMS_NO";
const DEFAULT_VG_LISTA_SINGLES_SOURCE_PATH: &str = "CSV_SINGLES_NO";
const DEFAULT_TI_I_SKUDDET_SOURCE_PATH: &str = "CSV_TIISKUDDET_NO";
const DEFAULT_NORSKTOPPEN_SOURCE_PATH: &str = "CSV_NORSKTOPPEN_NO";
const DEFAULT_OFFICIAL_UK_ALBUM_SOURCE_PATH: &str = "CSV_ALBUMS_UK";
const DEFAULT_OFFICIAL_UK_SINGLES_SOURCE_PATH: &str = "CSV_SINGLES_UK";
const DEFAULT_DEEMIX_DOWNLOAD_PATH: &str = "";
const DEFAULT_DEEMIX_DOWNLOAD_QUALITY: &str = "mp3_320";
const DEFAULT_DEEMIX_DOWNLOAD_FALLBACK: bool = true;
const DEFAULT_DEEMIX_DOWNLOAD_ORGANIZATION: &str = "flat_artist_album_year";
const DEFAULT_MUSICBRAINZ_CACHE_PATH: &str = "MusicBrainz/musicbrainz_cache.db";
const DEFAULT_MUSICBRAINZ_OVERLAY_SYNC_PATH: &str = "";
pub(crate) const DEFAULT_MUSIC_DOCTOR_DATABASE_PATH: &str =
    r"%APPDATA%\com.musicdoctor.desktop\music-doctor.db";
const DEFAULT_MUSIC_DOCTOR_AUTO_SYNC: bool = true;
const DEFAULT_COUNTRY_FLAG_DISPLAY: &str = "flagAndName";
const MUSICBRAINZ_SUSPICIOUS_RELEASE_GROUP_THRESHOLD: i64 = 150;
const MAX_MUSICBRAINZ_OVERLAY_AUTO_SYNC_MINUTES: u32 = 1440;
const MAX_UPDATE_AUTO_CHECK_MINUTES: u32 = 1440;
const DAILY_EDITION_RETENTION_DAYS: i32 = 90;
const DAILY_EDITION_SNAPSHOT_PAYLOAD_VERSION: i64 = 3;
const MIN_DAILY_EDITION_SNAPSHOT_PAYLOAD_VERSION: i64 = 1;
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

pub fn database_path(app: &AppHandle) -> Result<PathBuf> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .context("Could not resolve the app data directory")?;
    fs::create_dir_all(&app_data_dir).context("Could not create the app data directory")?;
    Ok(app_data_dir.join(DB_FILE_NAME))
}

pub fn default_database_path() -> Result<PathBuf> {
    if let Some(value) = std::env::var_os("MUSIC_LIBRARY_BRIDGE_APP_DATA_DIR") {
        let value = PathBuf::from(value);
        if !value.is_absolute() {
            bail!("MUSIC_LIBRARY_BRIDGE_APP_DATA_DIR must be an absolute directory path");
        }
        fs::create_dir_all(&value)?;
        return Ok(value.join(DB_FILE_NAME));
    }
    #[cfg(target_os = "macos")]
    let app_data = std::env::var_os("HOME")
        .map(PathBuf::from)
        .map(|path| path.join("Library/Application Support"))
        .ok_or_else(|| anyhow!("HOME is unavailable"))?;
    #[cfg(not(target_os = "macos"))]
    let app_data = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .ok_or_else(|| anyhow!("APPDATA is unavailable"))?;
    let dir = app_data.join("com.local.musiclibrary");
    fs::create_dir_all(&dir)
        .with_context(|| format!("Could not create app data directory {}", dir.display()))?;
    Ok(dir.join(DB_FILE_NAME))
}

pub fn checkpoint_truncate_path(db_path: &Path) -> Result<()> {
    if !db_path.exists() {
        return Ok(());
    }
    let conn = Connection::open(db_path)
        .with_context(|| format!("Could not open SQLite database at {}", db_path.display()))?;
    conn.execute_batch("PRAGMA busy_timeout = 5000;")
        .context("Could not configure SQLite busy timeout for checkpoint")?;
    let (busy, _log, _checkpointed): (i64, i64, i64) = conn
        .query_row("PRAGMA wal_checkpoint(TRUNCATE);", [], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .with_context(|| format!("Could not checkpoint SQLite WAL at {}", db_path.display()))?;
    if busy != 0 {
        bail!(
            "Could not truncate WAL at {}: database is busy",
            db_path.display()
        );
    }
    drop(conn);
    Ok(())
}

pub(crate) fn shutdown_for_app(app: &AppHandle) {
    if let Err(error) = database_path(app).and_then(|path| pool_for_path(&path)?.shutdown()) {
        eprintln!("Could not optimize and checkpoint SQLite on exit: {error:#}");
    }
}

pub fn open(app: &AppHandle) -> Result<(CatalogConnection, PathBuf)> {
    let db_path = database_path(app)?;
    let conn = open_path(&db_path)?;
    Ok((conn, db_path))
}

pub(crate) fn open_path(path: &Path) -> Result<CatalogConnection> {
    pool_for_path(path)?.checkout(lifecycle::Access::Write)
}

pub(crate) fn save_journey_playlist(
    conn: &Connection,
    input: SavePlaylistRequest,
) -> Result<SavedPlaylist> {
    playlists::save_playlist(conn, input)
}

pub(crate) fn open_read(app: &AppHandle) -> Result<(CatalogConnection, PathBuf)> {
    let path = database_path(app)?;
    let conn = pool_for_path(&path)?.checkout(lifecycle::Access::Read)?;
    Ok((conn, path))
}

#[cfg(not(test))]
fn open_search(app: &AppHandle) -> Result<(CatalogConnection, PathBuf)> {
    let (conn, path) = open_read(app)?;
    if search_indexes_current(&conn)? {
        return Ok((conn, path));
    }
    drop(conn);
    let writer = open_path(&path)?;
    ensure_search_indexes(&writer)?;
    drop(writer);
    open_read(app)
}

pub(super) fn configure_reader(conn: &Connection) -> Result<()> {
    conn.create_scalar_function(
        "unicode_lower",
        1,
        FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
        |context| {
            let value = context.get::<String>(0)?;
            Ok(value.to_lowercase())
        },
    )
    .context("Could not register Unicode lowercase support")?;
    conn.execute_batch(
        "
        PRAGMA busy_timeout = 15000;
        PRAGMA foreign_keys = ON;
        PRAGMA temp_store = MEMORY;
        PRAGMA cache_size = -32768;
        PRAGMA mmap_size = 268435456;
        ",
    )
    .context("Could not configure SQLite pragmas")?;
    Ok(())
}

pub fn configure(conn: &Connection) -> Result<()> {
    configure_reader(conn)?;
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;")
        .context("Could not configure SQLite writer pragmas")?;
    Ok(())
}

pub fn migrate(conn: &Connection) -> Result<()> {
    let _migration_guard = MIGRATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    migrations::run(conn)
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

fn search_indexes_current(conn: &Connection) -> Result<bool> {
    let album_count = count_rows(conn, "albums")?;
    let track_count = count_rows(conn, "tracks")?;
    let album_fts_count = count_rows(conn, "album_search_fts")?;
    let track_fts_count = count_rows(conn, "track_search_fts")?;

    Ok(album_count == album_fts_count && track_count == track_fts_count)
}

fn ensure_search_indexes(conn: &Connection) -> Result<()> {
    if !search_indexes_current(conn)? {
        rebuild_search_indexes(conn)?;
    }

    Ok(())
}
