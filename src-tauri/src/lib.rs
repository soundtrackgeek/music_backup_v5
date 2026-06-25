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
fn get_library_status(app: AppHandle) -> Result<LibraryStatus, String> {
    db::library_status(&app).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_import_runs(app: AppHandle, limit: Option<u32>) -> Result<Vec<ImportRun>, String> {
    db::list_import_runs_for_app(&app, limit.unwrap_or(8)).map_err(|error| error.to_string())
}

#[tauri::command]
async fn import_musicbee_tsv(app: AppHandle, source_path: String) -> Result<ImportSummary, String> {
    tauri::async_runtime::spawn_blocking(move || importer::import_musicbee_tsv(app, source_path))
        .await
        .map_err(|error| format!("Import task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn search_library(app: AppHandle, request: BrowseRequest) -> Result<BrowseResponse, String> {
    db::search_library_for_app(&app, request).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_saved_searches(app: AppHandle) -> Result<Vec<SavedSearch>, String> {
    db::list_saved_searches_for_app(&app).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_search(app: AppHandle, input: SaveSearchRequest) -> Result<SavedSearch, String> {
    db::save_search_for_app(&app, input).map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_saved_search(app: AppHandle, id: i64) -> Result<(), String> {
    db::delete_saved_search_for_app(&app, id).map_err(|error| error.to_string())
}

#[tauri::command]
fn export_search(app: AppHandle, input: ExportSearchRequest) -> Result<ExportResult, String> {
    db::export_search_for_app(&app, input).map_err(|error| error.to_string())
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
