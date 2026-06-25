mod db;
mod importer;
mod models;

use models::{
    BrowseRequest, BrowseResponse, ExportResult, ExportSearchRequest, SaveSearchRequest,
    SavedSearch,
};
use models::{ImportRun, ImportSummary, LibraryStatus};
use tauri::AppHandle;

#[tauri::command]
async fn get_library_status(app: AppHandle) -> Result<LibraryStatus, String> {
    tauri::async_runtime::spawn_blocking(move || db::library_status(&app))
        .await
        .map_err(|error| format!("Library status task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_import_runs(app: AppHandle, limit: Option<u32>) -> Result<Vec<ImportRun>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        db::list_import_runs_for_app(&app, limit.unwrap_or(8))
    })
    .await
    .map_err(|error| format!("Import run list task failed: {error}"))?
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn import_musicbee_tsv(app: AppHandle, source_path: String) -> Result<ImportSummary, String> {
    tauri::async_runtime::spawn_blocking(move || importer::import_musicbee_tsv(app, source_path))
        .await
        .map_err(|error| format!("Import task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn search_library(app: AppHandle, request: BrowseRequest) -> Result<BrowseResponse, String> {
    tauri::async_runtime::spawn_blocking(move || db::search_library_for_app(&app, request))
        .await
        .map_err(|error| format!("Search task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_saved_searches(app: AppHandle) -> Result<Vec<SavedSearch>, String> {
    tauri::async_runtime::spawn_blocking(move || db::list_saved_searches_for_app(&app))
        .await
        .map_err(|error| format!("Saved search list task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_search(app: AppHandle, input: SaveSearchRequest) -> Result<SavedSearch, String> {
    tauri::async_runtime::spawn_blocking(move || db::save_search_for_app(&app, input))
        .await
        .map_err(|error| format!("Save search task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn delete_saved_search(app: AppHandle, id: i64) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || db::delete_saved_search_for_app(&app, id))
        .await
        .map_err(|error| format!("Delete saved search task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn export_search(app: AppHandle, input: ExportSearchRequest) -> Result<ExportResult, String> {
    tauri::async_runtime::spawn_blocking(move || db::export_search_for_app(&app, input))
        .await
        .map_err(|error| format!("Export task failed: {error}"))?
        .map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_library_status,
            list_import_runs,
            import_musicbee_tsv,
            search_library,
            list_saved_searches,
            save_search,
            delete_saved_search,
            export_search
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Music Library app");
}
