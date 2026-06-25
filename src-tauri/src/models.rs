use serde::Serialize;

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
