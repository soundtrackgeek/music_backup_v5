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
    pub processed_rows: u64,
    pub album_count: u64,
    pub message: String,
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
    pub duration_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BillboardSinglesImportSummary {
    pub source_path: String,
    pub files_scanned: usize,
    pub chart_entries: usize,
    pub matched_tracks: i64,
    pub duration_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_backup_retention")]
    pub backup_retention: u32,
    #[serde(default)]
    pub dark_mode: bool,
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
    pub loved_tracks_min: Option<i64>,
    #[serde(default)]
    pub loved_tracks_max: Option<i64>,
    #[serde(default)]
    pub origin_country_codes: Vec<String>,
    #[serde(default)]
    pub excluded_origin_country_codes: Vec<String>,
    #[serde(default)]
    pub missing_origin_country: bool,
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
    pub origin_country_code: Option<String>,
    pub origin_country_name: Option<String>,
    pub origin_country_raw_area: Option<String>,
    pub origin_country_review_state: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistListResponse {
    pub rows: Vec<ArtistSummary>,
    pub total: i64,
    pub limit: u32,
    pub offset: u32,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryResponse {
    pub heatmap: Vec<DiscoveryHeatmapCell>,
    pub backlog_missions: Vec<DiscoveryMission>,
    pub smart_missions: Vec<DiscoveryMission>,
    pub love_rating_points: Vec<DiscoveryAlbumPoint>,
    pub genre_points: Vec<DiscoveryGenrePoint>,
    pub artist_points: Vec<DiscoveryArtistPoint>,
    pub generated_at: Option<String>,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicToolFixSummary {
    pub tool_id: String,
    pub action: String,
    pub applied: bool,
    pub requested_count: usize,
    pub fixable_count: usize,
    pub affected_album_count: usize,
    pub affected_track_count: usize,
    pub changed_album_count: usize,
    pub changed_track_count: usize,
    pub skipped_count: usize,
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
    pub billboard_single_rank: Option<i32>,
    pub billboard_single_year: Option<i32>,
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
    "CSV".to_string()
}

fn default_billboard_singles_source_path() -> String {
    "CSV_SINGLES".to_string()
}

fn default_musicbrainz_cache_path() -> String {
    "MusicBrainz/musicbrainz_cache.db".to_string()
}

fn default_musicbrainz_overlay_sync_path() -> String {
    r"C:\Users\jtill\OneDrive\_musicbackup\musicbrainz-overlay-sync.sqlite3".to_string()
}

fn default_music_tool_id() -> String {
    "duplicate-albums".to_string()
}

fn default_request_id() -> String {
    String::new()
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
            left_sidebar_default: "expanded".to_string(),
            right_sidebar_default: "expanded".to_string(),
            import_source_path: r"D:\Exports\library.tsv".to_string(),
            cover_source_path: r"D:\Covers".to_string(),
            billboard_source_path: r"D:\Charts\Albums".to_string(),
            billboard_singles_source_path: r"D:\Charts\Singles".to_string(),
            musicbrainz_cache_path: r"C:\Sync\musicbrainz_cache.db".to_string(),
            musicbrainz_overlay_sync_path: r"C:\Sync\musicbrainz-overlay-sync.sqlite3".to_string(),
            musicbrainz_overlay_auto_sync_minutes: 15,
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
        assert_eq!(serialized.get("updateAutoCheckMinutes"), Some(&json!(30)));
        assert_eq!(
            serialized.get("importSourcePath"),
            Some(&json!(r"D:\Exports\library.tsv"))
        );
        assert_eq!(
            serialized.get("coverSourcePath"),
            Some(&json!(r"D:\Covers"))
        );
        assert_eq!(
            serialized.get("billboardSourcePath"),
            Some(&json!(r"D:\Charts\Albums"))
        );
        assert_eq!(
            serialized.get("billboardSinglesSourcePath"),
            Some(&json!(r"D:\Charts\Singles"))
        );
        assert!(serialized
            .get("musicbrainzOverlayAutoSyncMinutes")
            .is_none());

        let decoded: AppSettings = serde_json::from_value(json!({
            "importSourcePath": r"D:\Exports\library.tsv",
            "coverSourcePath": r"D:\Covers",
            "billboardSourcePath": r"D:\Charts\Albums",
            "billboardSinglesSourcePath": r"D:\Charts\Singles",
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
