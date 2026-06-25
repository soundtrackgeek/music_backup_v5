mod db;
mod importer;
mod models;

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

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_library_status,
            list_import_runs,
            import_musicbee_tsv
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Music Library app");
}
