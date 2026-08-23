#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if music_library_lib::run_aurora_bridge_from_args() {
        return;
    }
    music_library_lib::run();
}
