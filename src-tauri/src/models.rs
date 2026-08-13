use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRun {
    pub id: i64,
    pub source_path: String,
    pub source_size_bytes: i64,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub status: String,
    pub track_rows: i64,
    pub album_count: i64,
    pub duration_ms: i64,
    pub backup_path: Option<String>,
    pub error_message: Option<String>,
    pub added_tracks: i64,
    pub changed_tracks: i64,
    pub removed_tracks: i64,
    pub added_albums: i64,
    pub changed_albums: i64,
    pub removed_albums: i64,
    pub rating_events_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryStatus {
    pub db_path: String,
    pub has_database: bool,
    pub track_count: i64,
    pub album_count: i64,
    pub cover_count: i64,
    pub import_run_count: i64,
    pub last_import: Option<ImportRun>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceProbeOperation {
    pub id: String,
    pub label: String,
    pub category: String,
    pub status: String,
    pub duration_ms: u128,
    pub total_count: Option<i64>,
    pub row_count: Option<usize>,
    pub detail: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceProbeResponse {
    pub generated_at: String,
    pub database_path: String,
    pub track_count: i64,
    pub album_count: i64,
    pub total_duration_ms: u128,
    pub slowest_operation_ms: u128,
    pub operations: Vec<PerformanceProbeOperation>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseBackup {
    pub id: Option<i64>,
    pub created_at: String,
    pub operation: String,
    pub source_path: Option<String>,
    pub source_size_bytes: i64,
    pub backup_path: String,
    pub file_size_bytes: i64,
    pub track_rows: Option<i64>,
    pub album_count: Option<i64>,
    pub schema_version: Option<i32>,
    pub exists: bool,
    pub can_restore: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseRestoreSummary {
    pub restored_backup: DatabaseBackup,
    pub pre_restore_backup_path: Option<String>,
    pub track_count: i64,
    pub album_count: i64,
    pub schema_version: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub status: String,
    pub session_id: Option<i64>,
    pub processed_rows: u64,
    pub processed_bytes: u64,
    pub total_bytes: u64,
    pub album_count: u64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSuspiciousAlbum {
    pub album_id: String,
    pub album: Option<String>,
    pub album_artist_display: Option<String>,
    pub year: Option<i32>,
    pub reason: String,
    pub previous_track_count: Option<i64>,
    pub current_track_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub session_id: i64,
    pub source_path: String,
    pub source_size_bytes: i64,
    pub source_modified_ms: i64,
    pub status: String,
    pub processed_rows: i64,
    pub processed_bytes: i64,
    pub track_rows: i64,
    pub album_count: i64,
    pub added_tracks: i64,
    pub changed_tracks: i64,
    pub removed_tracks: i64,
    pub added_albums: i64,
    pub changed_albums: i64,
    pub removed_albums: i64,
    pub suspicious_album_count: i64,
    pub suspicious_albums: Vec<ImportSuspiciousAlbum>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub import_run_id: Option<i64>,
    pub error_message: Option<String>,
    pub can_resume: bool,
    pub source_changed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub import_run: ImportRun,
    pub track_rows: u64,
    pub album_count: u64,
    pub duration_ms: u128,
    pub backup_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryUpdateRequest {
    #[serde(default)]
    pub query: String,
    pub change_kind: Option<String>,
    pub date_from: Option<String>,
    #[serde(default = "default_library_update_limit")]
    pub limit: u32,
    #[serde(default)]
    pub offset: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryUpdate {
    pub id: i64,
    pub import_run_id: Option<i64>,
    pub created_at: String,
    pub change_kind: String,
    pub category: String,
    pub album_id: String,
    pub album_artist_display: Option<String>,
    pub album: Option<String>,
    pub year: Option<i32>,
    pub field: Option<String>,
    pub field_label: Option<String>,
    pub previous_value: Option<String>,
    pub current_value: Option<String>,
    pub change_count: Option<i64>,
    pub description: String,
    pub source_kind: String,
    pub source_label: String,
    pub source_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryUpdateSummary {
    pub all: i64,
    pub new: i64,
    pub changed: i64,
    pub removed: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryUpdateResponse {
    pub rows: Vec<LibraryUpdate>,
    pub total: i64,
    pub summary: LibraryUpdateSummary,
    pub limit: u32,
    pub offset: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryUpdateArtistSummary {
    pub artist_key: String,
    pub artist_name: String,
    pub total_changes: i64,
    pub tracks_added: i64,
    pub tracks_removed: i64,
    pub other_changes: i64,
    pub albums_added: i64,
    pub albums_deleted: i64,
    pub last_updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewLibraryArtist {
    pub artist_key: String,
    pub artist_name: String,
    pub added_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryUpdateArtistResponse {
    pub rows: Vec<LibraryUpdateArtistSummary>,
    pub new_artists: Vec<NewLibraryArtist>,
    pub total: i64,
    pub summary: LibraryUpdateSummary,
    pub limit: u32,
    pub offset: u32,
}

fn default_library_update_limit() -> u32 {
    50
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverImportRequest {
    pub source_path: String,
    #[serde(default)]
    pub extract_embedded_fallback: bool,
    #[serde(default)]
    pub replace_existing: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverImportProgress {
    pub status: String,
    pub total_albums: u64,
    pub scanned_albums: u64,
    pub new_covers_found: u64,
    pub imported_covers: u64,
    pub relinked_covers: u64,
    pub skipped_existing: u64,
    pub missing_covers: u64,
    pub percent: f64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverImportSummary {
    pub total_albums: u64,
    pub scanned_albums: u64,
    pub new_covers_found: u64,
    pub imported_covers: u64,
    pub relinked_covers: u64,
    pub skipped_existing: u64,
    pub missing_covers: u64,
    pub duration_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BillboardImportSummary {
    pub source_path: String,
    pub files_scanned: usize,
    pub chart_entries: usize,
    pub matched_albums: i64,
    pub dated_albums: i64,
    pub duration_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BillboardSinglesImportSummary {
    pub source_path: String,
    pub files_scanned: usize,
    pub chart_entries: usize,
    pub matched_tracks: i64,
    pub dated_tracks: i64,
    pub exact_dates: usize,
    pub qualified_dates: usize,
    pub missing_dates: usize,
    pub invalid_dates: usize,
    pub duration_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VgListaImportSummary {
    pub source_path: String,
    pub files_scanned: usize,
    pub chart_entries: usize,
    pub matched_items: i64,
    pub dated_items: i64,
    pub duration_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialUkImportSummary {
    pub source_path: String,
    pub files_scanned: usize,
    pub chart_entries: usize,
    pub matched_items: i64,
    pub dated_items: i64,
    pub duration_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TiISkuddetImportSummary {
    pub source_path: String,
    pub files_scanned: usize,
    pub chart_entries: usize,
    pub matched_tracks: i64,
    pub dated_tracks: i64,
    pub skipped_rows: usize,
    pub duration_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NorsktoppenImportSummary {
    pub source_path: String,
    pub files_scanned: usize,
    pub chart_entries: usize,
    pub matched_tracks: i64,
    pub dated_tracks: i64,
    pub skipped_rows: usize,
    pub duration_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_backup_retention")]
    pub backup_retention: u32,
    #[serde(default)]
    pub dark_mode: bool,
    #[serde(default = "default_country_flag_display")]
    pub country_flag_display: String,
    #[serde(default = "default_left_sidebar_default")]
    pub left_sidebar_default: String,
    #[serde(default = "default_right_sidebar_default")]
    pub right_sidebar_default: String,
    #[serde(default = "default_import_source_path")]
    pub import_source_path: String,
    #[serde(default = "default_cover_source_path")]
    pub cover_source_path: String,
    #[serde(default = "default_billboard_source_path")]
    pub billboard_source_path: String,
    #[serde(default = "default_billboard_singles_source_path")]
    pub billboard_singles_source_path: String,
    #[serde(default = "default_vg_lista_album_source_path")]
    pub vg_lista_album_source_path: String,
    #[serde(default = "default_vg_lista_singles_source_path")]
    pub vg_lista_singles_source_path: String,
    #[serde(default = "default_official_uk_album_source_path")]
    pub official_uk_album_source_path: String,
    #[serde(default = "default_official_uk_singles_source_path")]
    pub official_uk_singles_source_path: String,
    #[serde(default = "default_ti_i_skuddet_source_path")]
    pub ti_i_skuddet_source_path: String,
    #[serde(default = "default_norsktoppen_source_path")]
    pub norsktoppen_source_path: String,
    #[serde(default = "default_deemix_download_path")]
    pub deemix_download_path: String,
    #[serde(default = "default_deemix_download_quality")]
    pub deemix_download_quality: String,
    #[serde(default = "default_deemix_download_fallback")]
    pub deemix_download_fallback: bool,
    #[serde(default = "default_deemix_download_organization")]
    pub deemix_download_organization: String,
    #[serde(
        default = "default_musicbrainz_cache_path",
        rename = "musicBrainzCachePath",
        alias = "musicbrainzCachePath"
    )]
    pub musicbrainz_cache_path: String,
    #[serde(
        default = "default_musicbrainz_overlay_sync_path",
        rename = "musicBrainzOverlaySyncPath",
        alias = "musicbrainzOverlaySyncPath"
    )]
    pub musicbrainz_overlay_sync_path: String,
    #[serde(
        default,
        rename = "musicBrainzOverlayAutoSyncMinutes",
        alias = "musicbrainzOverlayAutoSyncMinutes"
    )]
    pub musicbrainz_overlay_auto_sync_minutes: u32,
    #[serde(
        default = "default_music_doctor_database_path",
        rename = "musicDoctorDatabasePath"
    )]
    pub music_doctor_database_path: String,
    #[serde(
        default = "default_music_doctor_auto_sync",
        rename = "musicDoctorAutoSync"
    )]
    pub music_doctor_auto_sync: bool,
    #[serde(default)]
    pub update_auto_check_minutes: u32,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzOverlaySyncResult {
    pub sync_path: String,
    pub synced_at: String,
    pub imported_count: usize,
    pub exported_count: usize,
    pub changed_count: usize,
    pub summary: String,
    pub artist_links_imported: usize,
    pub artist_links_exported: usize,
    pub artist_unlinks_imported: usize,
    pub artist_unlinks_exported: usize,
    pub release_decisions_imported: usize,
    pub release_decisions_exported: usize,
    pub release_decision_clears_imported: usize,
    pub release_decision_clears_exported: usize,
    pub release_statuses_imported: usize,
    pub release_statuses_exported: usize,
    pub release_groups_imported: usize,
    pub release_groups_exported: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzOverlaySyncLogEntry {
    pub id: i64,
    pub synced_at: String,
    pub sync_path: String,
    pub imported_count: usize,
    pub exported_count: usize,
    pub changed_count: usize,
    pub summary: String,
    pub artist_links_imported: usize,
    pub artist_links_exported: usize,
    pub artist_unlinks_imported: usize,
    pub artist_unlinks_exported: usize,
    pub release_decisions_imported: usize,
    pub release_decisions_exported: usize,
    pub release_decision_clears_imported: usize,
    pub release_decision_clears_exported: usize,
    pub release_statuses_imported: usize,
    pub release_statuses_exported: usize,
    pub release_groups_imported: usize,
    pub release_groups_exported: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzOriginCountryOption {
    pub code: String,
    pub name: String,
    pub artist_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzArtistOriginImportRun {
    pub id: i64,
    pub scope: String,
    pub status: String,
    pub total_artists: i64,
    pub eligible_count: i64,
    pub fetched_count: i64,
    pub skipped_count: i64,
    pub unresolved_count: i64,
    pub failed_count: i64,
    pub last_processed_artist_key: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub error_summary: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzOriginCountryStatus {
    pub total_album_artists: i64,
    pub imported_origins: i64,
    pub country_count: i64,
    pub manual_origins: i64,
    pub unresolved_origins: i64,
    pub missing_origins: i64,
    pub last_run: Option<MusicBrainzArtistOriginImportRun>,
    pub countries: Vec<MusicBrainzOriginCountryOption>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzOriginCountryPreviewRow {
    pub local_artist_key: String,
    pub display_artist: String,
    pub album_count: i64,
    pub musicbrainz_mbid: Option<String>,
    pub matched_name: Option<String>,
    pub match_method: String,
    pub artist_link_state: String,
    pub suspect_mapping: bool,
    pub existing_country_code: Option<String>,
    pub existing_country_name: Option<String>,
    pub existing_review_state: Option<String>,
    pub status: String,
    pub skipped_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzOriginCountryPreview {
    pub total_album_artists: i64,
    pub eligible_count: i64,
    pub already_imported_count: i64,
    pub skipped_count: i64,
    pub unresolved_count: i64,
    pub estimated_seconds: i64,
    pub rows: Vec<MusicBrainzOriginCountryPreviewRow>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzOriginCountryImportRequest {
    #[serde(default)]
    pub artist_keys: Vec<String>,
    #[serde(default)]
    pub refetch: bool,
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzOriginCountryImportSummary {
    pub run: MusicBrainzArtistOriginImportRun,
    pub total_album_artists: i64,
    pub eligible_count: i64,
    pub fetched_count: i64,
    pub stored_count: i64,
    pub skipped_count: i64,
    pub unresolved_count: i64,
    pub failed_count: i64,
    pub cancelled: bool,
    pub rows: Vec<MusicBrainzOriginCountryPreviewRow>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzOriginCountryImportProgress {
    pub status: String,
    pub total_artists: i64,
    pub eligible_count: i64,
    pub processed_count: i64,
    pub remaining_count: i64,
    pub fetched_count: i64,
    pub stored_count: i64,
    pub skipped_count: i64,
    pub unresolved_count: i64,
    pub failed_count: i64,
    pub percent: f64,
    pub current_artist: Option<String>,
    pub current_artist_key: Option<String>,
    pub current_mbid: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzArtistInfoImportRun {
    pub id: i64,
    pub scope: String,
    pub status: String,
    pub total_artists: i64,
    pub eligible_count: i64,
    pub fetched_count: i64,
    pub skipped_count: i64,
    pub unresolved_count: i64,
    pub failed_count: i64,
    pub last_processed_artist_key: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub error_summary: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzArtistInfoStatus {
    pub total_album_artists: i64,
    pub imported_infos: i64,
    pub person_artists: i64,
    pub group_artists: i64,
    pub gendered_artists: i64,
    pub born_artists: i64,
    pub died_artists: i64,
    pub founded_artists: i64,
    pub dissolved_artists: i64,
    pub missing_infos: i64,
    pub last_run: Option<MusicBrainzArtistInfoImportRun>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzArtistInfoPreviewRow {
    pub local_artist_key: String,
    pub display_artist: String,
    pub album_count: i64,
    pub musicbrainz_mbid: Option<String>,
    pub matched_name: Option<String>,
    pub match_method: String,
    pub artist_link_state: String,
    pub suspect_mapping: bool,
    pub existing_sort_name: Option<String>,
    pub existing_artist_type: Option<String>,
    pub existing_gender: Option<String>,
    pub existing_begin_date: Option<String>,
    pub existing_begin_year: Option<i32>,
    pub existing_end_date: Option<String>,
    pub existing_end_year: Option<i32>,
    pub existing_ended: Option<bool>,
    pub existing_begin_area_name: Option<String>,
    pub existing_end_area_name: Option<String>,
    pub existing_review_state: Option<String>,
    pub status: String,
    pub skipped_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzArtistInfoPreview {
    pub total_album_artists: i64,
    pub eligible_count: i64,
    pub already_imported_count: i64,
    pub skipped_count: i64,
    pub unresolved_count: i64,
    pub estimated_seconds: i64,
    pub rows: Vec<MusicBrainzArtistInfoPreviewRow>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzArtistInfoImportRequest {
    #[serde(default)]
    pub artist_keys: Vec<String>,
    #[serde(default)]
    pub refetch: bool,
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzArtistInfoImportSummary {
    pub run: MusicBrainzArtistInfoImportRun,
    pub total_album_artists: i64,
    pub eligible_count: i64,
    pub fetched_count: i64,
    pub stored_count: i64,
    pub skipped_count: i64,
    pub unresolved_count: i64,
    pub failed_count: i64,
    pub cancelled: bool,
    pub rows: Vec<MusicBrainzArtistInfoPreviewRow>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzArtistInfoImportProgress {
    pub status: String,
    pub total_artists: i64,
    pub eligible_count: i64,
    pub processed_count: i64,
    pub remaining_count: i64,
    pub fetched_count: i64,
    pub stored_count: i64,
    pub skipped_count: i64,
    pub unresolved_count: i64,
    pub failed_count: i64,
    pub percent: f64,
    pub current_artist: Option<String>,
    pub current_artist_key: Option<String>,
    pub current_mbid: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzCacheWarningExample {
    pub mbid: String,
    pub cached_name_count: i64,
    pub release_group_count: i64,
    pub cached_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzCacheStatus {
    pub cache_path: String,
    pub resolved_path: String,
    pub exists: bool,
    pub valid: bool,
    pub state: String,
    pub message: String,
    pub file_size_bytes: i64,
    pub artist_count: i64,
    pub distinct_mbid_count: i64,
    pub duplicate_mbid_count: i64,
    pub suspicious_mapping_count: i64,
    pub release_group_count: i64,
    pub official_release_group_count: i64,
    pub pure_album_release_group_count: i64,
    pub release_year_min: Option<i32>,
    pub release_year_max: Option<i32>,
    pub cache_date_min: Option<String>,
    pub cache_date_max: Option<String>,
    pub warning_examples: Vec<MusicBrainzCacheWarningExample>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzArtistDiscographyRequest {
    #[serde(default)]
    pub artist_key: String,
    #[serde(default)]
    pub artist_name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzReleaseDecisionRequest {
    #[serde(default)]
    pub artist_key: String,
    #[serde(default)]
    pub artist_name: String,
    #[serde(default)]
    pub musicbrainz_mbid: Option<String>,
    #[serde(default)]
    pub release_mbid: String,
    #[serde(default)]
    pub decision: String,
    #[serde(default)]
    pub local_album_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzArtistLinkRequest {
    #[serde(default)]
    pub artist_key: String,
    #[serde(default)]
    pub artist_name: String,
    #[serde(default)]
    pub action: String,
    #[serde(default)]
    pub musicbrainz_mbid: Option<String>,
    #[serde(default)]
    pub canonical_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzArtistRefreshRequest {
    #[serde(default)]
    pub artist_key: String,
    #[serde(default)]
    pub artist_name: String,
    #[serde(default)]
    pub musicbrainz_mbid: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzArtistOriginCountryRequest {
    #[serde(default)]
    pub artist_key: String,
    #[serde(default)]
    pub artist_name: String,
    #[serde(default)]
    pub musicbrainz_mbid: Option<String>,
    #[serde(default)]
    pub country_code: String,
    #[serde(default)]
    pub country_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzArtistOriginCountryUpdate {
    pub artist_key: String,
    pub artist_name: String,
    pub musicbrainz_mbid: Option<String>,
    pub origin_country_code: Option<String>,
    pub origin_country_name: Option<String>,
    pub origin_country_raw_area: Option<String>,
    pub origin_country_review_state: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzArtistRefreshResult {
    pub artist_key: String,
    pub artist_name: String,
    pub musicbrainz_mbid: String,
    pub fetched_count: usize,
    pub stored_count: usize,
    pub fetched_at: String,
    pub origin: Option<MusicBrainzArtistOriginCountryUpdate>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzArtistReleaseRow {
    pub release_mbid: String,
    pub title: String,
    pub year: Option<i32>,
    pub track_count: Option<i64>,
    pub status: String,
    pub local_album_id: Option<String>,
    pub local_album_title: Option<String>,
    pub local_year: Option<i32>,
    pub match_method: String,
    pub confidence: f64,
    pub decision: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzArtistExportRow {
    #[serde(default)]
    pub release_mbid: String,
    #[serde(default)]
    pub title: String,
    pub year: Option<i32>,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub local_album_title: Option<String>,
    pub local_year: Option<i32>,
    #[serde(default)]
    pub match_method: String,
    #[serde(default)]
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzArtistExportRequest {
    #[serde(default)]
    pub artist_key: String,
    #[serde(default)]
    pub artist_name: String,
    #[serde(default)]
    pub musicbrainz_mbid: Option<String>,
    #[serde(default)]
    pub matched_cache_name: Option<String>,
    #[serde(default)]
    pub match_method: String,
    #[serde(default)]
    pub artist_link_state: String,
    #[serde(default)]
    pub artist_link_ignored: bool,
    #[serde(default)]
    pub rows: Vec<MusicBrainzArtistExportRow>,
    #[serde(default)]
    pub format: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzArtistCandidateRow {
    pub name: String,
    pub mbid: String,
    pub match_method: String,
    pub score: f64,
    pub cached_name_count: i64,
    pub total_release_group_count: i64,
    pub suspect_mapping: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzArtistDiscographyResponse {
    pub artist_key: String,
    pub artist_name: String,
    pub state: String,
    pub message: String,
    pub cache_path: String,
    pub resolved_path: String,
    pub musicbrainz_mbid: Option<String>,
    pub matched_cache_name: Option<String>,
    pub match_method: String,
    pub artist_link_state: String,
    pub artist_link_ignored: bool,
    pub suspect_mapping: bool,
    pub cached_name_count: i64,
    pub total_release_group_count: i64,
    pub pure_album_count: i64,
    pub owned_count: i64,
    pub missing_count: i64,
    pub excluded_count: i64,
    pub local_album_count: i64,
    pub completion: Option<f64>,
    pub release_group_source: String,
    pub release_group_updated_at: Option<String>,
    pub releases: Vec<MusicBrainzArtistReleaseRow>,
    pub candidates: Vec<MusicBrainzArtistCandidateRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFilter {
    #[serde(default = "default_text_operator")]
    pub operator: String,
    #[serde(default)]
    pub value: String,
}

impl Default for TextFilter {
    fn default() -> Self {
        Self {
            operator: default_text_operator(),
            value: String::new(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowseFilters {
    #[serde(default)]
    pub album_ids: Vec<String>,
    #[serde(default)]
    pub track_ids: Vec<i64>,
    #[serde(default)]
    pub artist_keys: Vec<String>,
    #[serde(default)]
    pub album_title: TextFilter,
    #[serde(default)]
    pub track_title: TextFilter,
    #[serde(default)]
    pub album_artist: TextFilter,
    #[serde(default)]
    pub display_artist: TextFilter,
    #[serde(default)]
    pub publisher: TextFilter,
    #[serde(default)]
    pub file_path: TextFilter,
    #[serde(default)]
    pub filename: TextFilter,
    #[serde(default)]
    pub has_track_text: String,
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default)]
    pub excluded_genres: Vec<String>,
    #[serde(default)]
    pub missing_fields: Vec<String>,
    #[serde(default)]
    pub billboard_rank_min: Option<i32>,
    #[serde(default)]
    pub billboard_rank_max: Option<i32>,
    #[serde(default)]
    pub billboard_single_rank_min: Option<i32>,
    #[serde(default)]
    pub billboard_single_rank_max: Option<i32>,
    #[serde(default)]
    pub billboard_single_debut_date_from: Option<String>,
    #[serde(default)]
    pub billboard_single_debut_date_to: Option<String>,
    #[serde(default)]
    pub billboard_debut_week_from: Option<String>,
    #[serde(default)]
    pub billboard_debut_week_to: Option<String>,
    #[serde(default)]
    pub vg_lista_rank_min: Option<i32>,
    #[serde(default)]
    pub vg_lista_rank_max: Option<i32>,
    #[serde(default)]
    pub vg_lista_debut_week_from: Option<String>,
    #[serde(default)]
    pub vg_lista_debut_week_to: Option<String>,
    #[serde(default)]
    pub official_uk_rank_min: Option<i32>,
    #[serde(default)]
    pub official_uk_rank_max: Option<i32>,
    #[serde(default)]
    pub official_uk_debut_week_from: Option<String>,
    #[serde(default)]
    pub official_uk_debut_week_to: Option<String>,
    #[serde(default)]
    pub ti_i_skuddet_rank_min: Option<i32>,
    #[serde(default)]
    pub ti_i_skuddet_rank_max: Option<i32>,
    #[serde(default)]
    pub ti_i_skuddet_debut_week_from: Option<String>,
    #[serde(default)]
    pub ti_i_skuddet_debut_week_to: Option<String>,
    #[serde(default)]
    pub norsktoppen_rank_min: Option<i32>,
    #[serde(default)]
    pub norsktoppen_rank_max: Option<i32>,
    #[serde(default)]
    pub norsktoppen_debut_week_from: Option<String>,
    #[serde(default)]
    pub norsktoppen_debut_week_to: Option<String>,
    #[serde(default)]
    pub year_from: Option<i32>,
    #[serde(default)]
    pub year_to: Option<i32>,
    #[serde(default)]
    pub release_year_from: Option<i32>,
    #[serde(default)]
    pub release_year_to: Option<i32>,
    #[serde(default)]
    pub total_minutes_min: Option<f64>,
    #[serde(default)]
    pub total_minutes_max: Option<f64>,
    #[serde(default)]
    pub track_count_min: Option<i64>,
    #[serde(default)]
    pub track_count_max: Option<i64>,
    #[serde(default)]
    pub rated_tracks_min: Option<i64>,
    #[serde(default)]
    pub rated_tracks_max: Option<i64>,
    #[serde(default)]
    pub album_rating_min: Option<i32>,
    #[serde(default)]
    pub album_rating_max: Option<i32>,
    #[serde(default)]
    pub track_rating_min: Option<i32>,
    #[serde(default)]
    pub track_rating_max: Option<i32>,
    #[serde(default)]
    pub rating_completeness_min: Option<f64>,
    #[serde(default)]
    pub rating_completeness_max: Option<f64>,
    #[serde(default)]
    pub not_fully_rated: bool,
    #[serde(default)]
    pub loved_tracks_min: Option<i64>,
    #[serde(default)]
    pub loved_tracks_max: Option<i64>,
    #[serde(default)]
    pub bitrate_kbps_min: Option<i32>,
    #[serde(default)]
    pub bitrate_kbps_max: Option<i32>,
    #[serde(default)]
    pub mixed_audio_quality: bool,
    #[serde(default)]
    pub origin_country_codes: Vec<String>,
    #[serde(default)]
    pub excluded_origin_country_codes: Vec<String>,
    #[serde(default)]
    pub missing_origin_country: bool,
    #[serde(default)]
    pub artist_type: String,
    #[serde(default)]
    pub artist_gender: String,
    #[serde(default)]
    pub artist_born_year_from: Option<i32>,
    #[serde(default)]
    pub artist_born_year_to: Option<i32>,
    #[serde(default)]
    pub artist_died: bool,
    #[serde(default)]
    pub artist_died_year_from: Option<i32>,
    #[serde(default)]
    pub artist_died_year_to: Option<i32>,
    #[serde(default)]
    pub artist_founded_year_from: Option<i32>,
    #[serde(default)]
    pub artist_founded_year_to: Option<i32>,
    #[serde(default)]
    pub artist_dissolved: bool,
    #[serde(default)]
    pub artist_dissolved_year_from: Option<i32>,
    #[serde(default)]
    pub artist_dissolved_year_to: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowseSort {
    #[serde(default = "default_sort_field")]
    pub field: String,
    #[serde(default = "default_sort_direction")]
    pub direction: String,
}

impl Default for BrowseSort {
    fn default() -> Self {
        Self {
            field: default_sort_field(),
            direction: default_sort_direction(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistListRequest {
    #[serde(default)]
    pub search_text: String,
    #[serde(default)]
    pub sort: BrowseSort,
    #[serde(default = "default_limit")]
    pub limit: u32,
    #[serde(default)]
    pub offset: u32,
}

impl Default for ArtistListRequest {
    fn default() -> Self {
        Self {
            search_text: String::new(),
            sort: BrowseSort {
                field: "name".to_string(),
                direction: default_sort_direction(),
            },
            limit: default_limit(),
            offset: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistSummary {
    pub id: String,
    pub name: String,
    pub album_count: i64,
    pub rated_album_count: i64,
    pub partial_album_count: i64,
    pub unrated_album_count: i64,
    pub track_count: i64,
    pub total_seconds: i64,
    pub loved_tracks: i64,
    pub tmoe_seconds: i64,
    pub average_rating_completeness: Option<f64>,
    pub average_album_rating: Option<f64>,
    pub average_album_score: Option<f64>,
    pub first_year: Option<i32>,
    pub last_year: Option<i32>,
    pub top_genre: Option<String>,
    pub music_brainz_mbid: Option<String>,
    pub music_brainz_sort_name: Option<String>,
    pub music_brainz_artist_type: Option<String>,
    pub music_brainz_gender: Option<String>,
    pub music_brainz_begin_date: Option<String>,
    pub music_brainz_begin_year: Option<i32>,
    pub music_brainz_end_date: Option<String>,
    pub music_brainz_end_year: Option<i32>,
    pub music_brainz_ended: Option<bool>,
    pub music_brainz_begin_area_name: Option<String>,
    pub music_brainz_end_area_name: Option<String>,
    pub music_brainz_info_review_state: Option<String>,
    pub music_brainz_info_fetched_at: Option<String>,
    pub origin_country_code: Option<String>,
    pub origin_country_name: Option<String>,
    pub origin_country_raw_area: Option<String>,
    pub origin_country_review_state: Option<String>,
    pub portrait_available: bool,
    pub representative_album_id: Option<String>,
    pub representative_album: Option<String>,
    pub representative_cover_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistListResponse {
    pub rows: Vec<ArtistSummary>,
    pub total: i64,
    pub limit: u32,
    pub offset: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistLovedTrack {
    pub track_id: i64,
    pub title: String,
    pub display_artist: String,
    pub album: Option<String>,
    pub year: Option<i32>,
    pub seconds: Option<i64>,
    pub rating: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistTrackChartHistory {
    pub chart: String,
    pub entry_date: Option<String>,
    pub end_date: Option<String>,
    pub weeks_on_chart: Option<i64>,
    pub peak: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistChartTrack {
    pub track_id: i64,
    pub title: String,
    pub display_artist: String,
    pub album: Option<String>,
    pub year: Option<i32>,
    pub charts: Vec<ArtistTrackChartHistory>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistTrackHighlights {
    pub artist_id: String,
    pub artist_name: String,
    pub loved_tracks: Vec<ArtistLovedTrack>,
    pub chart_tracks: Vec<ArtistChartTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenreListRequest {
    #[serde(default)]
    pub search_text: String,
    #[serde(default)]
    pub sort: BrowseSort,
    #[serde(default = "default_limit")]
    pub limit: u32,
    #[serde(default)]
    pub offset: u32,
}

impl Default for GenreListRequest {
    fn default() -> Self {
        Self {
            search_text: String::new(),
            sort: BrowseSort {
                field: "name".to_string(),
                direction: default_sort_direction(),
            },
            limit: default_limit(),
            offset: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenreSummary {
    pub id: String,
    pub name: String,
    pub album_count: i64,
    pub rated_album_count: i64,
    pub partial_album_count: i64,
    pub unrated_album_count: i64,
    pub track_count: i64,
    pub total_seconds: i64,
    pub loved_tracks: i64,
    pub tmoe_seconds: i64,
    pub average_rating_completeness: Option<f64>,
    pub average_album_rating: Option<f64>,
    pub average_album_score: Option<f64>,
    pub first_year: Option<i32>,
    pub last_year: Option<i32>,
    pub top_artist: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenreListResponse {
    pub rows: Vec<GenreSummary>,
    pub total: i64,
    pub limit: u32,
    pub offset: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenreTimelineRequest {
    #[serde(default)]
    pub year_from: Option<i32>,
    #[serde(default)]
    pub year_to: Option<i32>,
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default)]
    pub excluded_genres: Vec<String>,
    #[serde(default = "default_genre_timeline_limit")]
    pub genre_limit: u32,
    #[serde(default = "default_genre_timeline_album_point_limit")]
    pub album_point_limit: u32,
}

impl Default for GenreTimelineRequest {
    fn default() -> Self {
        Self {
            year_from: None,
            year_to: None,
            genres: Vec::new(),
            excluded_genres: Vec::new(),
            genre_limit: default_genre_timeline_limit(),
            album_point_limit: default_genre_timeline_album_point_limit(),
        }
    }
}

fn default_genre_timeline_limit() -> u32 {
    7
}

fn default_genre_timeline_album_point_limit() -> u32 {
    3600
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenreTimelineGenre {
    pub id: String,
    pub name: String,
    pub album_count: i64,
    pub first_year: i32,
    pub last_year: i32,
    pub peak_year: i32,
    pub peak_album_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenreTimelineYearCount {
    pub genre_id: String,
    pub year: i32,
    pub album_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenreTimelineAlbumPoint {
    pub album_id: String,
    pub album: Option<String>,
    pub album_artist_display: Option<String>,
    pub genre_id: String,
    pub genre: String,
    pub year: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenreTimelineResponse {
    pub genres: Vec<GenreTimelineGenre>,
    pub year_counts: Vec<GenreTimelineYearCount>,
    pub albums: Vec<GenreTimelineAlbumPoint>,
    pub matching_album_count: i64,
    pub matching_genre_count: i64,
    pub dated_album_count: i64,
    pub available_year_from: Option<i32>,
    pub available_year_to: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArtistTimelineRequest {
    #[serde(default)]
    pub year_from: Option<i32>,
    #[serde(default)]
    pub year_to: Option<i32>,
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default)]
    pub excluded_genres: Vec<String>,
    #[serde(default)]
    pub artists: Vec<String>,
    #[serde(default = "default_artist_timeline_limit")]
    pub artist_limit: u32,
    #[serde(default = "default_artist_timeline_metric")]
    pub metric: String,
}

fn default_artist_timeline_limit() -> u32 {
    7
}

fn default_artist_timeline_metric() -> String {
    "charts".to_string()
}

impl Default for ArtistTimelineRequest {
    fn default() -> Self {
        Self {
            year_from: None,
            year_to: None,
            genres: Vec::new(),
            excluded_genres: Vec::new(),
            artists: Vec::new(),
            artist_limit: default_artist_timeline_limit(),
            metric: default_artist_timeline_metric(),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArtistTimelineArtist {
    pub id: String,
    pub name: String,
    pub album_count: i64,
    pub first_year: i32,
    pub last_year: i32,
    pub average_album_score: Option<f64>,
    pub loved_tracks: i64,
    pub top_genre: Option<String>,
    pub portrait_available: bool,
    pub representative_album_id: Option<String>,
    pub representative_album: Option<String>,
    pub representative_cover_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArtistTimelineAlbum {
    pub album_id: String,
    pub album: Option<String>,
    pub artist_id: String,
    pub artist: String,
    pub year: i32,
    pub album_score: Option<f64>,
    pub loved_tracks: i64,
    pub billboard_rank: Option<i32>,
    pub official_uk_rank: Option<i32>,
    pub vg_lista_rank: Option<i32>,
    pub chart_peak: f64,
    pub cover_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArtistTimelineResponse {
    pub artists: Vec<ArtistTimelineArtist>,
    pub albums: Vec<ArtistTimelineAlbum>,
    pub matching_album_count: i64,
    pub matching_artist_count: i64,
    pub dated_album_count: i64,
    pub available_year_from: Option<i32>,
    pub available_year_to: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryResponse {
    pub daily_edition: DiscoveryDailyEdition,
    pub daily_edition_archive: DiscoveryDailyEditionArchive,
    pub heatmap: Vec<DiscoveryHeatmapCell>,
    pub backlog_missions: Vec<DiscoveryMission>,
    pub smart_missions: Vec<DiscoveryMission>,
    pub love_rating_points: Vec<DiscoveryAlbumPoint>,
    pub genre_points: Vec<DiscoveryGenrePoint>,
    pub artist_points: Vec<DiscoveryArtistPoint>,
    pub generated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryDailyEdition {
    pub date: String,
    pub anniversary_years: i32,
    pub anniversaries: Vec<DiscoveryAnniversaryStory>,
    pub life_events: Vec<DiscoveryLifeEventStory>,
    pub chart_snapshot: DiscoveryChartSnapshot,
    pub deep_cut_snapshot: DiscoveryDeepCutSnapshot,
    pub completion_snapshot: DiscoveryCompletionSnapshot,
    pub recommendation_snapshot: DiscoveryRecommendationSnapshot,
    pub listening_evidence_note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryDailyEditionArchive {
    pub available_dates: Vec<String>,
    pub snapshot_created_at: String,
    pub retention_days: i32,
    pub is_archived: bool,
    pub today: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryDailyEditionSnapshotResponse {
    pub daily_edition: DiscoveryDailyEdition,
    pub archive: DiscoveryDailyEditionArchive,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverySourceHealthResponse {
    pub checked_at: String,
    pub edition_date: String,
    pub overall_state: String,
    pub healthy_count: i64,
    pub stale_count: i64,
    pub missing_count: i64,
    pub sources: Vec<DiscoverySourceHealthItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverySourceHealthItem {
    pub id: String,
    pub label: String,
    pub state: String,
    pub coverage_count: i64,
    pub total_count: i64,
    pub coverage_percent: f64,
    pub coverage_label: String,
    pub last_successful_update: Option<String>,
    pub freshness_label: String,
    pub shelves: Vec<String>,
    pub details: Vec<String>,
    pub sparse_reasons: Vec<String>,
    pub action: String,
    pub action_label: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryShelfExplorerRequest {
    pub shelf: String,
    pub date: Option<String>,
    pub anniversary_years: Option<i32>,
    pub event_type: Option<String>,
    pub source: Option<String>,
    pub year: Option<i32>,
    pub week: Option<i32>,
    pub decade: Option<i32>,
    pub genre: Option<String>,
    pub mode: Option<String>,
    pub connection: Option<String>,
    pub query: Option<String>,
    pub sort: Option<String>,
    pub seed: Option<i64>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryShelfExplorerResponse {
    pub shelf: String,
    pub title: String,
    pub evidence_note: String,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
    pub seed: i64,
    pub anniversary_years: Option<i32>,
    pub event_type: Option<String>,
    pub source: Option<String>,
    pub source_label: Option<String>,
    pub year: Option<i32>,
    pub week: Option<i32>,
    pub decade: Option<i32>,
    pub genre: Option<String>,
    pub mode: Option<String>,
    pub connection: Option<String>,
    pub query: Option<String>,
    pub sort: String,
    pub available_years: Vec<i32>,
    pub available_weeks: Vec<i32>,
    pub available_genres: Vec<DiscoveryDeepCutGenre>,
    pub anniversaries: Vec<DiscoveryAnniversaryStory>,
    pub life_events: Vec<DiscoveryLifeEventStory>,
    pub chart_stories: Vec<DiscoveryChartStory>,
    pub deep_cuts: Vec<DiscoveryDeepCutStory>,
    pub artist_completions: Vec<DiscoveryArtistCompletionStory>,
    pub album_completions: Vec<DiscoveryAlbumCompletionStory>,
    pub recommendations: Vec<DiscoveryRecommendationStory>,
    pub anchors: Vec<DiscoveryRecommendationAnchor>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryRecommendationSnapshotRequest {
    pub mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryRecommendationSnapshot {
    pub mode: String,
    pub anchors: Vec<DiscoveryRecommendationAnchor>,
    pub matching_count: i64,
    pub lastfm_linked_count: i64,
    pub stories: Vec<DiscoveryRecommendationStory>,
    pub evidence: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryCompletionSnapshotRequest {
    pub mode: Option<String>,
    pub year: Option<i32>,
    pub decade: Option<i32>,
    pub genre: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryCompletionSnapshot {
    pub mode: String,
    pub year: Option<i32>,
    pub decade: Option<i32>,
    pub genre: Option<String>,
    pub available_years: Vec<i32>,
    pub available_genres: Vec<DiscoveryDeepCutGenre>,
    pub matching_count: i64,
    pub artist_stories: Vec<DiscoveryArtistCompletionStory>,
    pub album_stories: Vec<DiscoveryAlbumCompletionStory>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryDeepCutSnapshotRequest {
    pub year: Option<i32>,
    pub decade: Option<i32>,
    pub genre: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryDeepCutSnapshot {
    pub year: Option<i32>,
    pub decade: Option<i32>,
    pub genre: Option<String>,
    pub available_years: Vec<i32>,
    pub available_genres: Vec<DiscoveryDeepCutGenre>,
    pub matching_album_count: i64,
    pub stories: Vec<DiscoveryDeepCutStory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryDeepCutGenre {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryChartSnapshotRequest {
    pub source: Option<String>,
    pub year: Option<i32>,
    pub week: Option<i32>,
    #[serde(default)]
    pub random: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryChartSnapshot {
    pub source: String,
    pub source_label: String,
    pub year: Option<i32>,
    pub week: Option<i32>,
    pub available_years: Vec<i32>,
    pub available_weeks: Vec<i32>,
    pub stories: Vec<DiscoveryChartStory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryAnniversaryStory {
    pub album_id: String,
    pub album: String,
    pub artist: String,
    pub release_year: i32,
    pub years_ago: i32,
    pub cover_path: Option<String>,
    pub evidence: String,
    pub chart_evidence: Vec<String>,
    pub selection_reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryLifeEventStory {
    pub artist_id: String,
    pub artist: String,
    pub event_type: String,
    pub event_date: String,
    pub years: i32,
    pub day_offset: i32,
    pub album_count: i64,
    pub loved_tracks: i64,
    pub portrait_available: bool,
    pub representative_album_id: Option<String>,
    pub representative_album: Option<String>,
    pub representative_cover_path: Option<String>,
    pub evidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryChartStory {
    pub entity: String,
    pub album_id: String,
    pub track_id: Option<i64>,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub chart: String,
    pub rank: i32,
    pub chart_date: Option<String>,
    pub chart_year: i32,
    pub loved: bool,
    pub cover_path: Option<String>,
    pub evidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryDeepCutStory {
    pub track_id: i64,
    pub title: String,
    pub album_id: String,
    pub album: String,
    pub artist: String,
    pub track_number: Option<i32>,
    pub time_seconds: Option<i64>,
    pub album_rating: i32,
    pub release_year: Option<i32>,
    pub genre: String,
    pub cover_path: Option<String>,
    pub evidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryArtistCompletionStory {
    pub artist_id: String,
    pub artist: String,
    pub musicbrainz_mbid: String,
    pub owned_album_count: i64,
    pub official_album_count: i64,
    pub missing_album_count: i64,
    pub completion_percent: f64,
    pub missing_release_title: String,
    pub missing_release_year: Option<i32>,
    pub genre: String,
    pub portrait_available: bool,
    pub representative_album_id: Option<String>,
    pub representative_album: Option<String>,
    pub representative_cover_path: Option<String>,
    pub evidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryAlbumCompletionStory {
    pub album_id: String,
    pub album: String,
    pub artist: String,
    pub release_year: Option<i32>,
    pub genre: String,
    pub total_tracks: i64,
    pub rated_tracks: i64,
    pub unrated_tracks: i64,
    pub completion_percent: f64,
    pub cover_path: Option<String>,
    pub evidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryRecommendationAnchor {
    pub album_id: String,
    pub album: String,
    pub artist: String,
    pub signal: String,
    pub cover_path: Option<String>,
    pub evidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryRecommendationStory {
    pub album_id: String,
    pub album: String,
    pub artist: String,
    pub loved_tracks: i64,
    pub album_score: Option<f64>,
    pub rated_tracks: i64,
    pub total_tracks: i64,
    pub rating_completeness: f64,
    pub cover_path: Option<String>,
    pub reason: String,
    pub anchor_album_id: String,
    pub anchor_album: String,
    pub anchor_artist: String,
    pub evidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryMixerSeedOption {
    pub kind: String,
    pub id: String,
    pub title: String,
    pub subtitle: String,
    pub artist: Option<String>,
    pub cover_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryMixerSeedSearchRequest {
    pub query: Option<String>,
    pub kind: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryMixerSeedInput {
    pub kind: String,
    pub id: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryMixerRequest {
    pub seeds: Vec<DiscoveryMixerSeedInput>,
    pub explore_percent: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryMixerRecommendation {
    pub album_id: String,
    pub album: String,
    pub artist: String,
    pub release_year: Option<i32>,
    pub genre: String,
    pub cover_path: Option<String>,
    pub rating_completeness: f64,
    pub reason: String,
    pub seed_labels: Vec<String>,
    pub evidence: Vec<String>,
    pub ranking_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryMixerResponse {
    pub seeds: Vec<DiscoveryMixerSeedOption>,
    pub explore_percent: i64,
    pub matching_count: i64,
    pub lastfm_linked_count: i64,
    pub recommendations: Vec<DiscoveryMixerRecommendation>,
    pub evidence: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryHeatmapCell {
    pub genre_id: String,
    pub genre: String,
    pub year: i32,
    pub album_count: i64,
    pub rated_album_count: i64,
    pub partial_album_count: i64,
    pub unrated_album_count: i64,
    pub track_count: i64,
    pub loved_tracks: i64,
    pub average_rating_completeness: Option<f64>,
    pub average_album_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryMission {
    pub id: String,
    pub title: String,
    pub description: String,
    pub action_label: String,
    pub album_count: i64,
    pub track_count: i64,
    pub loved_tracks: i64,
    pub average_album_score: Option<f64>,
    pub average_rating_completeness: Option<f64>,
    pub genre_id: Option<String>,
    pub genre: Option<String>,
    pub artist_id: Option<String>,
    pub artist: Option<String>,
    pub year_from: Option<i32>,
    pub year_to: Option<i32>,
    pub rated_tracks_min: Option<i64>,
    pub rating_completeness_min: Option<f64>,
    pub rating_completeness_max: Option<f64>,
    pub loved_tracks_min: Option<i64>,
    pub sort_field: String,
    pub sort_direction: String,
    pub limit: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryAlbumPoint {
    pub album_id: String,
    pub album: Option<String>,
    pub album_artist_display: Option<String>,
    pub genre_id: Option<String>,
    pub genre: Option<String>,
    pub year: Option<i32>,
    pub loved_tracks: i64,
    pub album_score: Option<f64>,
    pub effective_album_rating: Option<i32>,
    pub rating_completeness: f64,
    pub total_seconds: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryGenrePoint {
    pub genre_id: String,
    pub genre: String,
    pub album_count: i64,
    pub track_count: i64,
    pub loved_tracks: i64,
    pub total_seconds: i64,
    pub partial_album_count: i64,
    pub unrated_album_count: i64,
    pub average_rating_completeness: Option<f64>,
    pub average_album_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryArtistPoint {
    pub artist_id: String,
    pub artist: String,
    pub album_count: i64,
    pub track_count: i64,
    pub loved_tracks: i64,
    pub total_seconds: i64,
    pub partial_album_count: i64,
    pub unrated_album_count: i64,
    pub average_rating_completeness: Option<f64>,
    pub average_album_score: Option<f64>,
    pub top_genre: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicToolSummary {
    pub id: String,
    pub label: String,
    pub description: String,
    pub severity: String,
    pub scope: String,
    pub issue_count: i64,
    pub album_count: i64,
    pub track_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicToolIssueRequest {
    #[serde(default = "default_music_tool_id")]
    pub tool_id: String,
    #[serde(default = "default_request_id")]
    pub request_id: String,
    #[serde(default)]
    pub search_text: String,
    #[serde(default)]
    pub sort: BrowseSort,
    #[serde(default = "default_limit")]
    pub limit: u32,
    #[serde(default)]
    pub offset: u32,
}

impl Default for MusicToolIssueRequest {
    fn default() -> Self {
        Self {
            tool_id: default_music_tool_id(),
            request_id: default_request_id(),
            search_text: String::new(),
            sort: BrowseSort {
                field: "album".to_string(),
                direction: default_sort_direction(),
            },
            limit: default_limit(),
            offset: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicToolProgress {
    pub tool_id: String,
    pub request_id: String,
    pub status: String,
    pub percent: u8,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicToolIssueRow {
    pub id: String,
    pub tool_id: String,
    pub severity: String,
    pub entity_type: String,
    pub album_id: String,
    pub track_id: Option<i64>,
    pub album: Option<String>,
    pub album_artist_display: Option<String>,
    pub title: Option<String>,
    pub canonical_genre: Option<String>,
    pub year: Option<i32>,
    pub detail: String,
    pub value: Option<String>,
    pub filename: Option<String>,
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicToolIssueResponse {
    pub tool: MusicToolSummary,
    pub rows: Vec<MusicToolIssueRow>,
    pub total: i64,
    pub limit: u32,
    pub offset: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicToolFixRequest {
    pub tool_id: String,
    #[serde(default)]
    pub issue_ids: Vec<String>,
    #[serde(default)]
    pub apply: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MusicToolFieldDiff {
    pub field: String,
    pub label: String,
    pub before: Option<String>,
    pub after: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MusicToolFixDiff {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub album_id: String,
    pub track_id: Option<i64>,
    pub label: String,
    pub context: Option<String>,
    pub confidence: String,
    pub source_warning: String,
    pub changes: Vec<MusicToolFieldDiff>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicToolFixSummary {
    pub repair_id: Option<i64>,
    pub tool_id: String,
    pub action: String,
    pub applied: bool,
    pub confidence: String,
    pub source_warning: String,
    pub requested_count: usize,
    pub fixable_count: usize,
    pub affected_album_count: usize,
    pub affected_track_count: usize,
    pub changed_album_count: usize,
    pub changed_track_count: usize,
    pub skipped_count: usize,
    pub backup_path: Option<String>,
    pub message: String,
    pub diffs: Vec<MusicToolFixDiff>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicToolFixHistoryEntry {
    pub id: i64,
    pub tool_id: String,
    pub tool_label: String,
    pub action: String,
    pub status: String,
    pub confidence: String,
    pub requested_count: usize,
    pub fixable_count: usize,
    pub affected_album_count: usize,
    pub affected_track_count: usize,
    pub changed_album_count: usize,
    pub changed_track_count: usize,
    pub diff_count: usize,
    pub backup_path: Option<String>,
    pub undo_backup_path: Option<String>,
    pub source_warning: String,
    pub message: String,
    pub created_at: String,
    pub undone_at: Option<String>,
    pub can_undo: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicToolUndoSummary {
    pub run: MusicToolFixHistoryEntry,
    pub restored_album_count: usize,
    pub restored_track_count: usize,
    pub backup_path: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowseRequest {
    #[serde(default = "default_browse_view")]
    pub view: String,
    #[serde(default)]
    pub search_text: String,
    #[serde(default)]
    pub filters: BrowseFilters,
    #[serde(default)]
    pub sort: BrowseSort,
    #[serde(default = "default_limit")]
    pub limit: u32,
    #[serde(default)]
    pub offset: u32,
}

impl Default for BrowseRequest {
    fn default() -> Self {
        Self {
            view: default_browse_view(),
            search_text: String::new(),
            filters: BrowseFilters::default(),
            sort: BrowseSort::default(),
            limit: default_limit(),
            offset: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowseRow {
    pub id: String,
    pub track_id: Option<i64>,
    pub album_id: String,
    pub album: Option<String>,
    pub album_artist_display: Option<String>,
    pub display_artist: Option<String>,
    pub title: Option<String>,
    pub canonical_genre: Option<String>,
    pub publisher: Option<String>,
    pub year: Option<i32>,
    pub release_year: Option<i32>,
    pub total_tracks: Option<i64>,
    pub rated_tracks: Option<i64>,
    pub rating_completeness: Option<f64>,
    pub total_seconds: Option<i64>,
    pub loved_tracks: Option<i64>,
    pub tmoe_seconds: Option<i64>,
    pub ae_ratio: Option<f64>,
    pub effective_album_rating: Option<i32>,
    pub album_score: Option<f64>,
    pub billboard_rank: Option<i32>,
    pub billboard_year: Option<i32>,
    pub billboard_debut_year: Option<i32>,
    pub billboard_debut_month: Option<i32>,
    pub billboard_debut_week: Option<i32>,
    pub billboard_debut_week_key: Option<String>,
    pub billboard_single_rank: Option<i32>,
    pub billboard_single_year: Option<i32>,
    pub billboard_single_debut_date: Option<String>,
    pub billboard_single_debut_year: Option<i32>,
    pub billboard_single_debut_month: Option<i32>,
    pub billboard_single_debut_week: Option<i32>,
    pub billboard_single_debut_week_key: Option<String>,
    pub vg_lista_rank: Option<i32>,
    pub vg_lista_year: Option<i32>,
    pub vg_lista_debut_year: Option<i32>,
    pub vg_lista_debut_month: Option<i32>,
    pub vg_lista_debut_week: Option<i32>,
    pub vg_lista_debut_week_key: Option<String>,
    pub official_uk_rank: Option<i32>,
    pub official_uk_year: Option<i32>,
    pub official_uk_debut_year: Option<i32>,
    pub official_uk_debut_month: Option<i32>,
    pub official_uk_debut_week: Option<i32>,
    pub official_uk_debut_week_key: Option<String>,
    pub ti_i_skuddet_rank: Option<i32>,
    pub ti_i_skuddet_year: Option<i32>,
    pub ti_i_skuddet_debut_date: Option<String>,
    pub ti_i_skuddet_debut_year: Option<i32>,
    pub ti_i_skuddet_debut_month: Option<i32>,
    pub ti_i_skuddet_debut_week: Option<i32>,
    pub ti_i_skuddet_debut_week_key: Option<String>,
    pub norsktoppen_rank: Option<i32>,
    pub norsktoppen_year: Option<i32>,
    pub norsktoppen_debut_date: Option<String>,
    pub norsktoppen_debut_year: Option<i32>,
    pub norsktoppen_debut_month: Option<i32>,
    pub norsktoppen_debut_week: Option<i32>,
    pub norsktoppen_debut_week_key: Option<String>,
    pub track_seconds: Option<i64>,
    pub normalized_rating: Option<i32>,
    pub disc_number: Option<i32>,
    pub track_number: Option<i32>,
    pub love: Option<String>,
    pub file_path: Option<String>,
    pub filename: Option<String>,
    pub cover_path: Option<String>,
    pub cover_mime_type: Option<String>,
    pub origin_country_code: Option<String>,
    pub origin_country_name: Option<String>,
    pub origin_country_raw_area: Option<String>,
    pub origin_country_review_state: Option<String>,
    pub file_format: Option<String>,
    pub bitrate_kbps: Option<i32>,
    pub quality_file_size_bytes: Option<i64>,
    pub doctor_duration_ms: Option<i64>,
    pub quality_track_count: Option<i64>,
    pub min_bitrate_kbps: Option<i32>,
    pub avg_bitrate_kbps: Option<f64>,
    pub max_bitrate_kbps: Option<i32>,
    pub below_320_tracks: Option<i64>,
    pub mixed_audio_quality: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowseResponse {
    pub view: String,
    pub rows: Vec<BrowseRow>,
    pub total: i64,
    pub limit: u32,
    pub offset: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumDebutTimelineAlbum {
    pub id: String,
    pub album_id: String,
    pub album: Option<String>,
    pub album_artist_display: Option<String>,
    pub canonical_genre: Option<String>,
    pub year: Option<i32>,
    pub album_score: Option<f64>,
    pub billboard_rank: Option<i32>,
    pub billboard_year: Option<i32>,
    pub billboard_debut_year: i32,
    pub billboard_debut_month: i32,
    pub billboard_debut_week: i32,
    pub billboard_debut_week_key: String,
    pub cover_path: Option<String>,
    pub cover_mime_type: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumDebutTimelineYear {
    pub year: i32,
    pub album_count: i64,
    pub representative_album: Option<AlbumDebutTimelineAlbum>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumDebutTimelineResponse {
    pub years: Vec<AlbumDebutTimelineYear>,
    pub selected_year: Option<i32>,
    pub albums: Vec<AlbumDebutTimelineAlbum>,
    pub dated_album_count: i64,
    pub undated_album_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackDebutTimelineTrack {
    pub id: String,
    pub track_id: i64,
    pub album_id: String,
    pub title: Option<String>,
    pub display_artist: Option<String>,
    pub album: Option<String>,
    pub album_artist_display: Option<String>,
    pub canonical_genre: Option<String>,
    pub year: Option<i32>,
    pub normalized_rating: Option<i32>,
    pub love: Option<String>,
    pub billboard_single_rank: Option<i32>,
    pub billboard_single_year: Option<i32>,
    pub billboard_single_debut_date: String,
    pub billboard_single_debut_year: i32,
    pub billboard_single_debut_month: i32,
    pub billboard_single_debut_week: i32,
    pub billboard_single_debut_week_key: String,
    pub cover_path: Option<String>,
    pub cover_mime_type: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackDebutTimelineYear {
    pub year: i32,
    pub track_count: i64,
    pub representative_track: Option<TrackDebutTimelineTrack>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackDebutTimelineResponse {
    pub years: Vec<TrackDebutTimelineYear>,
    pub selected_year: Option<i32>,
    pub tracks: Vec<TrackDebutTimelineTrack>,
    pub dated_track_count: i64,
    pub undated_track_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSearch {
    pub id: i64,
    pub name: String,
    pub view: String,
    pub request: BrowseRequest,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSearchRequest {
    pub name: String,
    pub request: BrowseRequest,
}

fn default_chart_grid_cover_size() -> u32 {
    144
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartConfig {
    pub request: BrowseRequest,
    pub ranking_metric: String,
    #[serde(default)]
    pub sort_field: Option<String>,
    #[serde(default)]
    pub rating_completeness_min: Option<f64>,
    #[serde(default)]
    pub rating_completeness_max: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rating_completeness_threshold: Option<f64>,
    pub sort_direction: String,
    pub result_limit: u32,
    pub visible_columns: Vec<String>,
    pub export_columns: Vec<String>,
    pub view_mode: String,
    #[serde(default = "default_chart_grid_cover_size")]
    pub grid_cover_size: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedChart {
    pub id: i64,
    pub name: String,
    pub config: ChartConfig,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveChartRequest {
    pub name: String,
    pub config: ChartConfig,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSearchRequest {
    pub request: BrowseRequest,
    pub format: String,
    #[serde(default)]
    pub include_calculated: bool,
    #[serde(default)]
    pub export_columns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportMusicToolRequest {
    pub request: MusicToolIssueRequest,
    pub format: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub format: String,
    pub row_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatisticsResponse {
    pub overview: LibraryOverviewStats,
    pub country_catalog: Vec<CountryCatalogStats>,
    pub health_score: LibraryHealthScore,
    pub library_shape: LibraryShapeStats,
    pub rating_progress: RatingProgressStats,
    pub decade_progress: Vec<DecadeProgressStats>,
    pub year_progress: Vec<YearProgressStats>,
    pub genre_progress: Vec<GenreProgressStats>,
    pub loved_density: Vec<LovedDensityStat>,
    pub catalog_concentration: CatalogConcentrationStats,
    pub duration_analytics: DurationAnalyticsStats,
    pub outlier_stats: Vec<OutlierStat>,
    pub track_rating_distribution: Vec<RatingBucket>,
    pub album_rating_distribution: Vec<RatingBucket>,
    pub metadata_coverage: Vec<MetadataCoverageMetric>,
    pub loved_tracks: LovedTrackStats,
    pub import_history: Vec<ImportRun>,
    pub rating_history: Vec<RatingHistoryPoint>,
    pub recent_rating_events: Vec<RatingEvent>,
    pub last_updated: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CountryCatalogStats {
    pub country_code: String,
    pub country_name: String,
    pub artist_count: i64,
    pub album_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryShapeStats {
    pub median_year: Option<i32>,
    pub most_represented_decade: Option<i32>,
    pub most_represented_decade_albums: i64,
    pub peak_year: Option<i32>,
    pub peak_year_albums: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryHealthScore {
    pub score: f64,
    pub rating_coverage: f64,
    pub album_completion: f64,
    pub metadata_coverage: f64,
    pub cover_coverage: f64,
    pub score_coverage: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryOverviewStats {
    pub track_count: i64,
    pub album_count: i64,
    pub album_artist_count: i64,
    pub genre_count: i64,
    pub year_count: i64,
    pub total_seconds: i64,
    pub average_album_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RatingProgressStats {
    pub fully_rated_albums: i64,
    pub partially_rated_albums: i64,
    pub unrated_albums: i64,
    pub albums_with_effective_rating: i64,
    pub rated_tracks: i64,
    pub unrated_tracks: i64,
    pub average_rating_completeness: Option<f64>,
    pub average_album_rating: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecadeProgressStats {
    pub decade: i32,
    pub album_count: i64,
    pub rated_album_count: i64,
    pub partial_album_count: i64,
    pub unrated_album_count: i64,
    pub track_count: i64,
    pub total_seconds: i64,
    pub loved_tracks: i64,
    pub average_album_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YearProgressStats {
    pub year: i32,
    pub album_count: i64,
    pub rated_album_count: i64,
    pub partial_album_count: i64,
    pub unrated_album_count: i64,
    pub track_count: i64,
    pub total_seconds: i64,
    pub loved_tracks: i64,
    pub average_album_score: Option<f64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YearProgressRequest {
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default)]
    pub excluded_genres: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenreProgressRequest {
    #[serde(default)]
    pub year_from: Option<i32>,
    #[serde(default)]
    pub year_to: Option<i32>,
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default)]
    pub excluded_genres: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenreProgressStats {
    pub genre: String,
    pub album_count: i64,
    pub rated_album_count: i64,
    pub partial_album_count: i64,
    pub unrated_album_count: i64,
    pub track_count: i64,
    pub total_seconds: i64,
    pub loved_tracks: i64,
    pub average_album_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RatingBucket {
    pub label: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LovedDensityStat {
    pub scope: String,
    pub label: String,
    pub album_count: i64,
    pub track_count: i64,
    pub loved_tracks: i64,
    pub loved_per_100_tracks: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogConcentrationStats {
    pub artist_points: Vec<ConcentrationPoint>,
    pub genre_points: Vec<ConcentrationPoint>,
    pub top_artist: Option<String>,
    pub top_artist_album_count: i64,
    pub top_genre: Option<String>,
    pub top_genre_album_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConcentrationPoint {
    pub top_n: i64,
    pub album_count: i64,
    pub share: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DurationAnalyticsStats {
    pub average_album_seconds: Option<f64>,
    pub average_track_seconds: Option<f64>,
    pub longest_albums: Vec<DurationAlbumStat>,
    pub shortest_albums: Vec<DurationAlbumStat>,
    pub track_count_buckets: Vec<RatingBucket>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DurationAlbumStat {
    pub album_id: String,
    pub album: Option<String>,
    pub album_artist_display: Option<String>,
    pub year: Option<i32>,
    pub total_tracks: i64,
    pub total_seconds: i64,
    pub rating_completeness: f64,
    pub album_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlierStat {
    pub id: String,
    pub label: String,
    pub value: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataCoverageMetric {
    pub id: String,
    pub label: String,
    pub scope: String,
    pub covered_count: i64,
    pub total_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LovedTrackStats {
    pub loved_tracks: i64,
    pub albums_with_loved_tracks: i64,
    pub average_loved_tracks_per_album: Option<f64>,
    pub top_loved_genre: Option<String>,
    pub top_loved_year: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RatingHistoryPoint {
    pub import_run_id: i64,
    pub created_at: String,
    pub track_count: i64,
    pub album_count: i64,
    pub rated_tracks: i64,
    pub unrated_tracks: i64,
    pub fully_rated_albums: i64,
    pub partially_rated_albums: i64,
    pub unrated_albums: i64,
    pub albums_with_effective_rating: i64,
    pub average_album_rating: Option<f64>,
    pub average_album_score: Option<f64>,
    pub rating_events_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RatingEvent {
    pub id: i64,
    pub import_run_id: i64,
    pub created_at: String,
    pub event_type: String,
    pub album_id: String,
    pub album: Option<String>,
    pub album_artist_display: Option<String>,
    pub year: Option<i32>,
    pub previous_rated_tracks: Option<i64>,
    pub current_rated_tracks: Option<i64>,
    pub previous_rating_completeness: Option<f64>,
    pub current_rating_completeness: Option<f64>,
    pub previous_effective_album_rating: Option<i32>,
    pub current_effective_album_rating: Option<i32>,
}

fn default_text_operator() -> String {
    "contains".to_string()
}

fn default_browse_view() -> String {
    "albums".to_string()
}

fn default_sort_field() -> String {
    "album".to_string()
}

fn default_sort_direction() -> String {
    "asc".to_string()
}

fn default_limit() -> u32 {
    50
}

fn default_backup_retention() -> u32 {
    3
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicMapSummary {
    pub total_artists: i64,
    pub mapped_artists: i64,
    pub precise_artist_count: i64,
    pub country_fallback_artist_count: i64,
    pub area_count: i64,
    pub country_count: i64,
    pub unresolved_artist_count: i64,
    pub candidate_area_count: i64,
    pub last_refreshed_at: Option<String>,
    pub needs_refresh: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicMapPoint {
    pub id: String,
    pub name: String,
    pub country_code: Option<String>,
    pub country_name: Option<String>,
    pub precision: String,
    pub latitude: f64,
    pub longitude: f64,
    pub artist_count: i64,
    pub album_count: i64,
    pub track_count: i64,
    pub loved_tracks: i64,
    pub top_genre: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicMapResponse {
    pub summary: MusicMapSummary,
    pub countries: Vec<MusicMapPoint>,
    pub areas: Vec<MusicMapPoint>,
    pub generated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicMapGenreStat {
    pub genre: String,
    pub album_count: i64,
    pub artist_count: i64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicMapArtist {
    pub artist_key: String,
    pub name: String,
    pub album_count: i64,
    pub track_count: i64,
    pub loved_tracks: i64,
    pub top_genre: String,
    pub representative_album_id: Option<String>,
    pub representative_album_title: Option<String>,
    pub cover_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicMapLocationDetails {
    pub point: MusicMapPoint,
    pub genres: Vec<MusicMapGenreStat>,
    pub artists: Vec<MusicMapArtist>,
    pub artist_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicMapRefreshSummary {
    pub candidate_areas: usize,
    pub resolved_areas: usize,
    pub candidate_countries: usize,
    pub resolved_countries: usize,
    pub unresolved_locations: usize,
    pub fetched_at: String,
}

fn default_left_sidebar_default() -> String {
    "expanded".to_string()
}

fn default_right_sidebar_default() -> String {
    "expanded".to_string()
}

fn default_import_source_path() -> String {
    "musicbee-library.tsv".to_string()
}

fn default_cover_source_path() -> String {
    "AlbumCovers".to_string()
}

fn default_billboard_source_path() -> String {
    "CSV_ALBUMS".to_string()
}

fn default_billboard_singles_source_path() -> String {
    "CSV_SINGLES".to_string()
}

fn default_vg_lista_album_source_path() -> String {
    "CSV_ALBUMS_NO".to_string()
}

fn default_vg_lista_singles_source_path() -> String {
    "CSV_SINGLES_NO".to_string()
}

fn default_official_uk_album_source_path() -> String {
    "CSV_ALBUMS_UK".to_string()
}

fn default_official_uk_singles_source_path() -> String {
    "CSV_SINGLES_UK".to_string()
}

fn default_ti_i_skuddet_source_path() -> String {
    "CSV_TIISKUDDET_NO".to_string()
}

fn default_norsktoppen_source_path() -> String {
    "CSV_NORSKTOPPEN_NO".to_string()
}

fn default_deemix_download_path() -> String {
    String::new()
}

fn default_deemix_download_quality() -> String {
    "mp3_320".to_string()
}

fn default_deemix_download_fallback() -> bool {
    true
}

fn default_deemix_download_organization() -> String {
    "flat_artist_album_year".to_string()
}

fn default_musicbrainz_cache_path() -> String {
    "MusicBrainz/musicbrainz_cache.db".to_string()
}

fn default_musicbrainz_overlay_sync_path() -> String {
    String::new()
}

fn default_music_doctor_database_path() -> String {
    r"%APPDATA%\com.musicdoctor.desktop\music-doctor.db".to_string()
}

fn default_music_doctor_auto_sync() -> bool {
    true
}

fn default_music_tool_id() -> String {
    "duplicate-albums".to_string()
}

fn default_request_id() -> String {
    String::new()
}

fn default_country_flag_display() -> String {
    "flagAndName".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn app_settings_use_ui_musicbrainz_field_casing() {
        let settings = AppSettings {
            backup_retention: 3,
            dark_mode: false,
            country_flag_display: "flagAndName".to_string(),
            left_sidebar_default: "expanded".to_string(),
            right_sidebar_default: "expanded".to_string(),
            import_source_path: r"D:\Exports\library.tsv".to_string(),
            cover_source_path: r"D:\Covers".to_string(),
            billboard_source_path: r"D:\Charts\Albums".to_string(),
            billboard_singles_source_path: r"D:\Charts\Singles".to_string(),
            vg_lista_album_source_path: r"D:\Charts\Norway\Albums".to_string(),
            vg_lista_singles_source_path: r"D:\Charts\Norway\Singles".to_string(),
            official_uk_album_source_path: r"D:\Charts\UK\Albums".to_string(),
            official_uk_singles_source_path: r"D:\Charts\UK\Singles".to_string(),
            ti_i_skuddet_source_path: r"D:\Charts\Norway\Ti i Skuddet".to_string(),
            norsktoppen_source_path: r"D:\Charts\Norway\Norsktoppen".to_string(),
            deemix_download_path: r"D:\Music\Incoming".to_string(),
            deemix_download_quality: "mp3_320".to_string(),
            deemix_download_fallback: true,
            deemix_download_organization: "flat_artist_album_year".to_string(),
            musicbrainz_cache_path: r"C:\Sync\musicbrainz_cache.db".to_string(),
            musicbrainz_overlay_sync_path: r"C:\Sync\musicbrainz-overlay-sync.sqlite3".to_string(),
            musicbrainz_overlay_auto_sync_minutes: 15,
            music_doctor_database_path: r"C:\Data\music-doctor.db".to_string(),
            music_doctor_auto_sync: true,
            update_auto_check_minutes: 30,
            updated_at: None,
        };
        let serialized = serde_json::to_value(&settings).expect("serialize settings");

        assert_eq!(
            serialized.get("musicBrainzCachePath"),
            Some(&json!(r"C:\Sync\musicbrainz_cache.db"))
        );
        assert_eq!(
            serialized.get("musicBrainzOverlaySyncPath"),
            Some(&json!(r"C:\Sync\musicbrainz-overlay-sync.sqlite3"))
        );
        assert_eq!(
            serialized.get("musicBrainzOverlayAutoSyncMinutes"),
            Some(&json!(15))
        );
        assert_eq!(
            serialized.get("musicDoctorDatabasePath"),
            Some(&json!(r"C:\Data\music-doctor.db"))
        );
        assert_eq!(serialized.get("musicDoctorAutoSync"), Some(&json!(true)));
        assert_eq!(serialized.get("updateAutoCheckMinutes"), Some(&json!(30)));
        assert_eq!(
            serialized.get("countryFlagDisplay"),
            Some(&json!("flagAndName"))
        );
        assert_eq!(
            serialized.get("importSourcePath"),
            Some(&json!(r"D:\Exports\library.tsv"))
        );
        assert_eq!(
            serialized.get("coverSourcePath"),
            Some(&json!(r"D:\Covers"))
        );
        assert_eq!(
            serialized.get("tiISkuddetSourcePath"),
            Some(&json!(r"D:\Charts\Norway\Ti i Skuddet"))
        );
        assert_eq!(
            serialized.get("norsktoppenSourcePath"),
            Some(&json!(r"D:\Charts\Norway\Norsktoppen"))
        );
        assert_eq!(
            serialized.get("billboardSourcePath"),
            Some(&json!(r"D:\Charts\Albums"))
        );
        assert_eq!(
            serialized.get("billboardSinglesSourcePath"),
            Some(&json!(r"D:\Charts\Singles"))
        );
        assert_eq!(
            serialized.get("deemixDownloadPath"),
            Some(&json!(r"D:\Music\Incoming"))
        );
        assert_eq!(
            serialized.get("deemixDownloadQuality"),
            Some(&json!("mp3_320"))
        );
        assert_eq!(serialized.get("deemixDownloadFallback"), Some(&json!(true)));
        assert_eq!(
            serialized.get("deemixDownloadOrganization"),
            Some(&json!("flat_artist_album_year"))
        );
        assert!(serialized
            .get("musicbrainzOverlayAutoSyncMinutes")
            .is_none());

        let decoded: AppSettings = serde_json::from_value(json!({
            "importSourcePath": r"D:\Exports\library.tsv",
            "coverSourcePath": r"D:\Covers",
            "billboardSourcePath": r"D:\Charts\Albums",
            "billboardSinglesSourcePath": r"D:\Charts\Singles",
            "deemixDownloadPath": r"D:\Music\Incoming",
            "deemixDownloadQuality": "mp3_128",
            "deemixDownloadFallback": false,
            "deemixDownloadOrganization": "artist_album_year_folders",
            "countryFlagDisplay": "flag",
            "musicBrainzCachePath": r"C:\Sync\musicbrainz_cache.db",
            "musicBrainzOverlaySyncPath": r"C:\Sync\musicbrainz-overlay-sync.sqlite3",
            "musicBrainzOverlayAutoSyncMinutes": 15,
            "updateAutoCheckMinutes": 30
        }))
        .expect("deserialize UI settings");
        assert_eq!(decoded.import_source_path, r"D:\Exports\library.tsv");
        assert_eq!(decoded.cover_source_path, r"D:\Covers");
        assert_eq!(decoded.billboard_source_path, r"D:\Charts\Albums");
        assert_eq!(decoded.billboard_singles_source_path, r"D:\Charts\Singles");
        assert_eq!(decoded.deemix_download_path, r"D:\Music\Incoming");
        assert_eq!(decoded.deemix_download_quality, "mp3_128");
        assert!(!decoded.deemix_download_fallback);
        assert_eq!(
            decoded.deemix_download_organization,
            "artist_album_year_folders"
        );
        assert_eq!(decoded.country_flag_display, "flag");
        assert_eq!(decoded.musicbrainz_overlay_auto_sync_minutes, 15);
        assert_eq!(decoded.update_auto_check_minutes, 30);

        let alias_decoded: AppSettings = serde_json::from_value(json!({
            "musicbrainzCachePath": "legacy-cache.db",
            "musicbrainzOverlaySyncPath": "legacy-sync.sqlite3",
            "musicbrainzOverlayAutoSyncMinutes": 20,
            "updateAutoCheckMinutes": 45
        }))
        .expect("deserialize alias settings");
        assert_eq!(alias_decoded.musicbrainz_cache_path, "legacy-cache.db");
        assert_eq!(
            alias_decoded.musicbrainz_overlay_sync_path,
            "legacy-sync.sqlite3"
        );
        assert_eq!(alias_decoded.musicbrainz_overlay_auto_sync_minutes, 20);
        assert_eq!(alias_decoded.update_auto_check_minutes, 45);
    }
}
