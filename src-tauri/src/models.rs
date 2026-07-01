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
    #[serde(default)]
    pub updated_at: Option<String>,
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
    pub track_seconds: Option<i64>,
    pub normalized_rating: Option<i32>,
    pub disc_number: Option<i32>,
    pub track_number: Option<i32>,
    pub love: Option<String>,
    pub file_path: Option<String>,
    pub filename: Option<String>,
    pub cover_path: Option<String>,
    pub cover_mime_type: Option<String>,
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

fn default_music_tool_id() -> String {
    "duplicate-albums".to_string()
}

fn default_request_id() -> String {
    String::new()
}
