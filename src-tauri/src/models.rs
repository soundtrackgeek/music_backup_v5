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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryStatus {
    pub db_path: String,
    pub has_database: bool,
    pub track_count: i64,
    pub album_count: i64,
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
    pub normalized_rating: Option<i32>,
    pub disc_number: Option<i32>,
    pub track_number: Option<i32>,
    pub love: Option<String>,
    pub file_path: Option<String>,
    pub filename: Option<String>,
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSearchRequest {
    pub request: BrowseRequest,
    pub format: String,
    #[serde(default)]
    pub include_calculated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub format: String,
    pub row_count: usize,
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
