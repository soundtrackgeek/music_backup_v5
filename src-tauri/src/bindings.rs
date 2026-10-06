//! Generated TypeScript bindings (tauri-specta).
//!
//! Commands listed in `specta_commands!` are dispatched by tauri-specta and
//! exported to `src/bindings.ts`. All other commands still go through
//! `tauri::generate_handler!` in `lib.rs`; `compose_invoke_handler` routes each
//! call by command name, so domains can migrate one at a time.

use std::path::Path;

use tauri::ipc::Invoke;
use tauri::Wry;
use tauri_specta::{Builder, ErrorHandlingMode};

use super::{
    get_ai_key_status,
    save_openai_api_key,
    delete_openai_api_key,
    test_openai_connection,
    compile_natural_language_query,
    ask_current_view,
    research_music,
    analyze_library,
    list_ai_snapshots,
    save_ai_snapshot,
    delete_ai_snapshot,
    build_playlist,
    get_jev_key_status,
    save_openrouter_api_key,
    delete_openrouter_api_key,
    test_jev_connection,
    export_ai_markdown,
    list_saved_playlists,
    save_playlist,
    delete_saved_playlist,
    set_playlist_automation,
    refresh_smart_playlist,
    discover_outside_library,
    export_playlist
};

macro_rules! specta_commands {
    ($($name:ident),* $(,)?) => {
        (
            tauri_specta::collect_commands![$($name),*],
            &[$(stringify!($name)),*] as &[&str],
        )
    };
}

fn builder() -> (Builder<Wry>, &'static [&'static str]) {
    let (commands, names) = specta_commands![
        get_ai_key_status,
        save_openai_api_key,
        delete_openai_api_key,
        test_openai_connection,
        compile_natural_language_query,
        ask_current_view,
        research_music,
        analyze_library,
        list_ai_snapshots,
        save_ai_snapshot,
        delete_ai_snapshot,
        build_playlist,
        get_jev_key_status,
        save_openrouter_api_key,
        delete_openrouter_api_key,
        test_jev_connection,
        export_ai_markdown,
        list_saved_playlists,
        save_playlist,
        delete_saved_playlist,
        set_playlist_automation,
        refresh_smart_playlist,
        discover_outside_library,
        export_playlist
    ];
    (
        Builder::<Wry>::new()
            .commands(commands)
            // Keep the existing contract: command errors reject the promise.
            .error_handling(ErrorHandlingMode::Throw)
            // Row ids and counts stay far below 2^53, as with the hand-written types.
            .dangerously_cast_bigints_to_number(),
        names,
    )
}

pub fn export(path: &Path) -> Result<(), String> {
    let (builder, _) = builder();
    builder
        .export(specta_typescript::Typescript::default(), path)
        .map_err(|error| error.to_string())
}

/// Routes migrated commands to tauri-specta and everything else to `legacy`.
pub fn compose_invoke_handler(
    legacy: impl Fn(Invoke<Wry>) -> bool + Send + Sync + 'static,
) -> impl Fn(Invoke<Wry>) -> bool + Send + Sync + 'static {
    let (builder, names) = builder();
    // The handler borrows the builder; it lives for the whole process anyway.
    let builder: &'static Builder<Wry> = Box::leak(Box::new(builder));
    let migrated = builder.invoke_handler();
    move |invoke| {
        if names.contains(&invoke.message.command()) {
            migrated(invoke)
        } else {
            legacy(invoke)
        }
    }
}
