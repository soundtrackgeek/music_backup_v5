mod covers;
mod db;
mod importer;
mod models;

use models::{
    AppSettings, ArtistListRequest, ArtistListResponse, BrowseRequest, BrowseResponse,
    CoverImportRequest, CoverImportSummary, ExportMusicToolRequest, ExportResult,
    ExportSearchRequest, GenreListRequest, GenreListResponse, MusicToolIssueRequest,
    MusicToolIssueResponse, MusicToolSummary, SaveChartRequest, SaveSearchRequest, SavedChart,
    SavedSearch, StatisticsResponse,
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
async fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    tauri::async_runtime::spawn_blocking(move || db::settings_for_app(&app))
        .await
        .map_err(|error| format!("Settings task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    tauri::async_runtime::spawn_blocking(move || db::save_settings_for_app(&app, settings))
        .await
        .map_err(|error| format!("Save settings task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_statistics(app: AppHandle) -> Result<StatisticsResponse, String> {
    tauri::async_runtime::spawn_blocking(move || db::statistics_for_app(&app))
        .await
        .map_err(|error| format!("Statistics task failed: {error}"))?
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
async fn import_album_covers(
    app: AppHandle,
    request: CoverImportRequest,
) -> Result<CoverImportSummary, String> {
    tauri::async_runtime::spawn_blocking(move || covers::import_album_covers(app, request))
        .await
        .map_err(|error| format!("Cover import task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_album_cover_data_url(
    app: AppHandle,
    album_id: String,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || covers::album_cover_data_url(app, album_id))
        .await
        .map_err(|error| format!("Cover image task failed: {error}"))?
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
async fn list_artists(
    app: AppHandle,
    request: ArtistListRequest,
) -> Result<ArtistListResponse, String> {
    tauri::async_runtime::spawn_blocking(move || db::list_artists_for_app(&app, request))
        .await
        .map_err(|error| format!("Artist list task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_genres(
    app: AppHandle,
    request: GenreListRequest,
) -> Result<GenreListResponse, String> {
    tauri::async_runtime::spawn_blocking(move || db::list_genres_for_app(&app, request))
        .await
        .map_err(|error| format!("Genre list task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_music_tools(app: AppHandle) -> Result<Vec<MusicToolSummary>, String> {
    tauri::async_runtime::spawn_blocking(move || db::list_music_tools_for_app(&app))
        .await
        .map_err(|error| format!("Music tool list task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_music_tool_issues(
    app: AppHandle,
    request: MusicToolIssueRequest,
) -> Result<MusicToolIssueResponse, String> {
    tauri::async_runtime::spawn_blocking(move || db::list_music_tool_issues_for_app(&app, request))
        .await
        .map_err(|error| format!("Music tool issue list task failed: {error}"))?
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
async fn list_saved_charts(app: AppHandle) -> Result<Vec<SavedChart>, String> {
    tauri::async_runtime::spawn_blocking(move || db::list_saved_charts_for_app(&app))
        .await
        .map_err(|error| format!("Saved chart list task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_chart(app: AppHandle, input: SaveChartRequest) -> Result<SavedChart, String> {
    tauri::async_runtime::spawn_blocking(move || db::save_chart_for_app(&app, input))
        .await
        .map_err(|error| format!("Save chart task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn delete_saved_chart(app: AppHandle, id: i64) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || db::delete_saved_chart_for_app(&app, id))
        .await
        .map_err(|error| format!("Delete saved chart task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn export_search(app: AppHandle, input: ExportSearchRequest) -> Result<ExportResult, String> {
    tauri::async_runtime::spawn_blocking(move || db::export_search_for_app(&app, input))
        .await
        .map_err(|error| format!("Export task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn export_music_tool_issues(
    app: AppHandle,
    input: ExportMusicToolRequest,
) -> Result<ExportResult, String> {
    tauri::async_runtime::spawn_blocking(move || db::export_music_tool_issues_for_app(&app, input))
        .await
        .map_err(|error| format!("Music tool export task failed: {error}"))?
        .map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_library_status,
            list_import_runs,
            get_settings,
            save_settings,
            get_statistics,
            import_musicbee_tsv,
            import_album_covers,
            get_album_cover_data_url,
            search_library,
            list_artists,
            list_genres,
            list_music_tools,
            list_music_tool_issues,
            list_saved_searches,
            save_search,
            delete_saved_search,
            list_saved_charts,
            save_chart,
            delete_saved_chart,
            export_search,
            export_music_tool_issues
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Music Library app");
}
