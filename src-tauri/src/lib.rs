#![cfg_attr(test, allow(dead_code, unused_imports))]

mod ai;
#[cfg(not(test))]
mod covers;
mod db;
mod importer;
mod models;
mod musicbrainz;
mod musicbrainz_sync;

#[cfg(not(test))]
use models::{
    AppSettings, ArtistListRequest, ArtistListResponse, BillboardImportSummary,
    BillboardSinglesImportSummary, BrowseRequest, BrowseResponse, CoverImportRequest,
    CoverImportSummary, DatabaseBackup, DatabaseRestoreSummary, DiscoveryResponse,
    ExportMusicToolRequest, ExportResult, ExportSearchRequest, GenreListRequest, GenreListResponse,
    MusicBrainzArtistDiscographyRequest, MusicBrainzArtistDiscographyResponse,
    MusicBrainzArtistExportRequest, MusicBrainzArtistInfoImportRequest,
    MusicBrainzArtistInfoImportSummary, MusicBrainzArtistInfoPreview, MusicBrainzArtistInfoStatus,
    MusicBrainzArtistLinkRequest, MusicBrainzArtistOriginCountryRequest,
    MusicBrainzArtistOriginCountryUpdate, MusicBrainzArtistRefreshRequest,
    MusicBrainzArtistRefreshResult, MusicBrainzCacheStatus, MusicBrainzOriginCountryImportRequest,
    MusicBrainzOriginCountryImportSummary, MusicBrainzOriginCountryPreview,
    MusicBrainzOriginCountryStatus, MusicBrainzOverlaySyncLogEntry, MusicBrainzOverlaySyncResult,
    MusicBrainzReleaseDecisionRequest, MusicToolFixRequest, MusicToolFixSummary,
    MusicToolIssueRequest, MusicToolIssueResponse, MusicToolSummary, PerformanceProbeResponse,
    SaveChartRequest, SaveSearchRequest, SavedChart, SavedSearch, StatisticsResponse,
};
#[cfg(not(test))]
use models::{ImportRun, ImportSummary, LibraryStatus};
#[cfg(not(test))]
use tauri::AppHandle;
#[cfg(not(test))]
use tauri_plugin_window_state::StateFlags;

#[cfg(not(test))]
#[tauri::command]
async fn get_library_status(app: AppHandle) -> Result<LibraryStatus, String> {
    tauri::async_runtime::spawn_blocking(move || db::library_status(&app))
        .await
        .map_err(|error| format!("Library status task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn run_performance_probe(app: AppHandle) -> Result<PerformanceProbeResponse, String> {
    tauri::async_runtime::spawn_blocking(move || db::performance_probe_for_app(&app))
        .await
        .map_err(|error| format!("Performance probe task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn list_import_runs(app: AppHandle, limit: Option<u32>) -> Result<Vec<ImportRun>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        db::list_import_runs_for_app(&app, limit.unwrap_or(8))
    })
    .await
    .map_err(|error| format!("Import run list task failed: {error}"))?
    .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn list_database_backups(app: AppHandle) -> Result<Vec<DatabaseBackup>, String> {
    tauri::async_runtime::spawn_blocking(move || db::list_database_backups_for_app(&app))
        .await
        .map_err(|error| format!("Database backup list task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn restore_database_backup(
    app: AppHandle,
    backup_path: String,
) -> Result<DatabaseRestoreSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        db::restore_database_backup_for_app(&app, backup_path)
    })
    .await
    .map_err(|error| format!("Database restore task failed: {error}"))?
    .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    tauri::async_runtime::spawn_blocking(move || db::settings_for_app(&app))
        .await
        .map_err(|error| format!("Settings task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn get_ai_key_status() -> Result<ai::AiKeyStatus, String> {
    tauri::async_runtime::spawn_blocking(ai::key_status)
        .await
        .map_err(|error| format!("AI key status task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn save_openai_api_key(api_key: String) -> Result<ai::AiKeyStatus, String> {
    tauri::async_runtime::spawn_blocking(move || ai::save_api_key(api_key))
        .await
        .map_err(|error| format!("AI key save task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn delete_openai_api_key() -> Result<ai::AiKeyStatus, String> {
    tauri::async_runtime::spawn_blocking(ai::delete_api_key)
        .await
        .map_err(|error| format!("AI key removal task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn test_openai_connection() -> Result<ai::AiConnectionTest, String> {
    tauri::async_runtime::spawn_blocking(ai::test_connection)
        .await
        .map_err(|error| format!("AI connection task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn compile_natural_language_query(
    input: ai::AiCompileRequest,
) -> Result<ai::AiCompiledQuery, String> {
    tauri::async_runtime::spawn_blocking(move || ai::compile_query(input))
        .await
        .map_err(|error| format!("Natural-language query task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn ask_current_view(
    app: AppHandle,
    input: ai::AiCurrentViewQuestion,
) -> Result<ai::AiCurrentViewAnswer, String> {
    tauri::async_runtime::spawn_blocking(move || {
        ai::ask_current_view(input, |request, inspection| {
            db::inspect_current_view_for_app(&app, request, inspection)
        })
    })
    .await
    .map_err(|error| format!("Current-view question task failed: {error}"))?
    .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn get_musicbrainz_cache_status(
    app: AppHandle,
    cache_path: Option<String>,
) -> Result<MusicBrainzCacheStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        musicbrainz::cache_status_for_app(&app, cache_path)
    })
    .await
    .map_err(|error| format!("MusicBrainz cache status task failed: {error}"))?
    .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn get_musicbrainz_origin_country_status(
    app: AppHandle,
) -> Result<MusicBrainzOriginCountryStatus, String> {
    tauri::async_runtime::spawn_blocking(move || musicbrainz::origin_country_status_for_app(&app))
        .await
        .map_err(|error| format!("MusicBrainz origin-country status task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn preview_musicbrainz_origin_country_import(
    app: AppHandle,
    request: MusicBrainzOriginCountryImportRequest,
) -> Result<MusicBrainzOriginCountryPreview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        musicbrainz::preview_origin_country_import_for_app(&app, request)
    })
    .await
    .map_err(|error| format!("MusicBrainz origin-country preview task failed: {error}"))?
    .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn import_musicbrainz_origin_countries(
    app: AppHandle,
    request: MusicBrainzOriginCountryImportRequest,
) -> Result<MusicBrainzOriginCountryImportSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        musicbrainz::import_origin_countries_for_app(&app, request)
    })
    .await
    .map_err(|error| format!("MusicBrainz origin-country import task failed: {error}"))?
    .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn cancel_musicbrainz_origin_country_import() -> Result<(), String> {
    musicbrainz::cancel_origin_country_import();
    Ok(())
}

#[cfg(not(test))]
#[tauri::command]
async fn get_musicbrainz_artist_info_status(
    app: AppHandle,
) -> Result<MusicBrainzArtistInfoStatus, String> {
    tauri::async_runtime::spawn_blocking(move || musicbrainz::artist_info_status_for_app(&app))
        .await
        .map_err(|error| format!("MusicBrainz artist-info status task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn preview_musicbrainz_artist_info_import(
    app: AppHandle,
    request: MusicBrainzArtistInfoImportRequest,
) -> Result<MusicBrainzArtistInfoPreview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        musicbrainz::preview_artist_info_import_for_app(&app, request)
    })
    .await
    .map_err(|error| format!("MusicBrainz artist-info preview task failed: {error}"))?
    .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn import_musicbrainz_artist_infos(
    app: AppHandle,
    request: MusicBrainzArtistInfoImportRequest,
) -> Result<MusicBrainzArtistInfoImportSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        musicbrainz::import_artist_infos_for_app(&app, request)
    })
    .await
    .map_err(|error| format!("MusicBrainz artist-info import task failed: {error}"))?
    .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn cancel_musicbrainz_artist_info_import() -> Result<(), String> {
    musicbrainz::cancel_artist_info_import();
    Ok(())
}

#[cfg(not(test))]
#[tauri::command]
async fn get_musicbrainz_artist_discography(
    app: AppHandle,
    request: MusicBrainzArtistDiscographyRequest,
) -> Result<MusicBrainzArtistDiscographyResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        musicbrainz::artist_discography_for_app(&app, request)
    })
    .await
    .map_err(|error| format!("MusicBrainz artist discography task failed: {error}"))?
    .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn set_musicbrainz_release_decision(
    app: AppHandle,
    request: MusicBrainzReleaseDecisionRequest,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        musicbrainz::set_release_decision_for_app(&app, request)
    })
    .await
    .map_err(|error| format!("MusicBrainz release decision task failed: {error}"))?
    .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn set_musicbrainz_artist_link(
    app: AppHandle,
    request: MusicBrainzArtistLinkRequest,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        musicbrainz::set_artist_link_for_app(&app, request)
    })
    .await
    .map_err(|error| format!("MusicBrainz artist link task failed: {error}"))?
    .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn refresh_musicbrainz_artist_releases(
    app: AppHandle,
    request: MusicBrainzArtistRefreshRequest,
) -> Result<MusicBrainzArtistRefreshResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        musicbrainz::refresh_artist_release_groups_for_app(&app, request)
    })
    .await
    .map_err(|error| format!("MusicBrainz artist refresh task failed: {error}"))?
    .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn set_musicbrainz_artist_origin_country(
    app: AppHandle,
    request: MusicBrainzArtistOriginCountryRequest,
) -> Result<MusicBrainzArtistOriginCountryUpdate, String> {
    tauri::async_runtime::spawn_blocking(move || {
        musicbrainz::set_artist_origin_country_for_app(&app, request)
    })
    .await
    .map_err(|error| format!("MusicBrainz artist origin-country task failed: {error}"))?
    .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn sync_musicbrainz_overlay(
    app: AppHandle,
    record_noop: Option<bool>,
) -> Result<MusicBrainzOverlaySyncResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        musicbrainz_sync::sync_for_app_with_options(&app, record_noop.unwrap_or(true))
    })
    .await
    .map_err(|error| format!("MusicBrainz overlay sync task failed: {error}"))?
    .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn list_musicbrainz_overlay_sync_log(
    app: AppHandle,
    limit: Option<u32>,
) -> Result<Vec<MusicBrainzOverlaySyncLogEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || musicbrainz_sync::sync_log_for_app(&app, limit))
        .await
        .map_err(|error| format!("MusicBrainz overlay sync log task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn save_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    tauri::async_runtime::spawn_blocking(move || db::save_settings_for_app(&app, settings))
        .await
        .map_err(|error| format!("Save settings task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn export_musicbrainz_artist_releases(
    app: AppHandle,
    input: MusicBrainzArtistExportRequest,
) -> Result<ExportResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        musicbrainz::export_artist_releases_for_app(&app, input)
    })
    .await
    .map_err(|error| format!("MusicBrainz artist export task failed: {error}"))?
    .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn get_statistics(app: AppHandle) -> Result<StatisticsResponse, String> {
    tauri::async_runtime::spawn_blocking(move || db::statistics_for_app(&app))
        .await
        .map_err(|error| format!("Statistics task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn get_discovery(app: AppHandle) -> Result<DiscoveryResponse, String> {
    tauri::async_runtime::spawn_blocking(move || db::discovery_for_app(&app))
        .await
        .map_err(|error| format!("Discovery task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn import_musicbee_tsv(app: AppHandle, source_path: String) -> Result<ImportSummary, String> {
    tauri::async_runtime::spawn_blocking(move || importer::import_musicbee_tsv(app, source_path))
        .await
        .map_err(|error| format!("Import task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
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

#[cfg(not(test))]
#[tauri::command]
async fn import_billboard_charts(
    app: AppHandle,
    source_path: String,
) -> Result<BillboardImportSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        db::import_billboard_charts_for_app(&app, source_path)
    })
    .await
    .map_err(|error| format!("Billboard import task failed: {error}"))?
    .map_err(|error| error.to_string())
}

#[cfg(not(test))]
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

#[cfg(not(test))]
#[tauri::command]
async fn import_billboard_singles(
    app: AppHandle,
    source_path: String,
) -> Result<BillboardSinglesImportSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        db::import_billboard_singles_for_app(&app, source_path)
    })
    .await
    .map_err(|error| format!("Billboard singles import task failed: {error}"))?
    .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn search_library(app: AppHandle, request: BrowseRequest) -> Result<BrowseResponse, String> {
    tauri::async_runtime::spawn_blocking(move || db::search_library_for_app(&app, request))
        .await
        .map_err(|error| format!("Search task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
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

#[cfg(not(test))]
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

#[cfg(not(test))]
#[tauri::command]
async fn list_genre_suggestions(app: AppHandle) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || db::genre_suggestion_names_for_app(&app))
        .await
        .map_err(|error| format!("Genre suggestion task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn list_music_tools(app: AppHandle) -> Result<Vec<MusicToolSummary>, String> {
    tauri::async_runtime::spawn_blocking(move || db::list_music_tools_for_app(&app))
        .await
        .map_err(|error| format!("Music tool list task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
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

#[cfg(not(test))]
#[tauri::command]
async fn fix_music_tool_issues(
    app: AppHandle,
    input: MusicToolFixRequest,
) -> Result<MusicToolFixSummary, String> {
    tauri::async_runtime::spawn_blocking(move || db::fix_music_tool_issues_for_app(&app, input))
        .await
        .map_err(|error| format!("Music tool fix task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn list_saved_searches(app: AppHandle) -> Result<Vec<SavedSearch>, String> {
    tauri::async_runtime::spawn_blocking(move || db::list_saved_searches_for_app(&app))
        .await
        .map_err(|error| format!("Saved search list task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn save_search(app: AppHandle, input: SaveSearchRequest) -> Result<SavedSearch, String> {
    tauri::async_runtime::spawn_blocking(move || db::save_search_for_app(&app, input))
        .await
        .map_err(|error| format!("Save search task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn delete_saved_search(app: AppHandle, id: i64) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || db::delete_saved_search_for_app(&app, id))
        .await
        .map_err(|error| format!("Delete saved search task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn list_saved_charts(app: AppHandle) -> Result<Vec<SavedChart>, String> {
    tauri::async_runtime::spawn_blocking(move || db::list_saved_charts_for_app(&app))
        .await
        .map_err(|error| format!("Saved chart list task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn save_chart(app: AppHandle, input: SaveChartRequest) -> Result<SavedChart, String> {
    tauri::async_runtime::spawn_blocking(move || db::save_chart_for_app(&app, input))
        .await
        .map_err(|error| format!("Save chart task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn delete_saved_chart(app: AppHandle, id: i64) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || db::delete_saved_chart_for_app(&app, id))
        .await
        .map_err(|error| format!("Delete saved chart task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
#[tauri::command]
async fn export_search(app: AppHandle, input: ExportSearchRequest) -> Result<ExportResult, String> {
    tauri::async_runtime::spawn_blocking(move || db::export_search_for_app(&app, input))
        .await
        .map_err(|error| format!("Export task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg(not(test))]
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

#[cfg(not(test))]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_library_status,
            run_performance_probe,
            list_import_runs,
            list_database_backups,
            restore_database_backup,
            get_settings,
            get_ai_key_status,
            save_openai_api_key,
            delete_openai_api_key,
            test_openai_connection,
            compile_natural_language_query,
            ask_current_view,
            get_musicbrainz_cache_status,
            get_musicbrainz_origin_country_status,
            preview_musicbrainz_origin_country_import,
            import_musicbrainz_origin_countries,
            cancel_musicbrainz_origin_country_import,
            get_musicbrainz_artist_info_status,
            preview_musicbrainz_artist_info_import,
            import_musicbrainz_artist_infos,
            cancel_musicbrainz_artist_info_import,
            get_musicbrainz_artist_discography,
            set_musicbrainz_artist_link,
            set_musicbrainz_release_decision,
            refresh_musicbrainz_artist_releases,
            set_musicbrainz_artist_origin_country,
            sync_musicbrainz_overlay,
            list_musicbrainz_overlay_sync_log,
            export_musicbrainz_artist_releases,
            save_settings,
            get_statistics,
            get_discovery,
            import_musicbee_tsv,
            import_album_covers,
            import_billboard_charts,
            import_billboard_singles,
            get_album_cover_data_url,
            search_library,
            list_artists,
            list_genres,
            list_genre_suggestions,
            list_music_tools,
            list_music_tool_issues,
            fix_music_tool_issues,
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
