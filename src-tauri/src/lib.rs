mod menu;

// cad-desktop-tauri-and-perf Slice T2 — Tauri 2 application bootstrap.
//
// Phase-1 deliberately minimal: one builder, default runtime, no
// custom commands. Subsequent slices register the platform IPCs
// (file open / save / autosave path, native menu, recent files).
// Anything more than scaffolding stays out of this file so the slice
// audit boundary is clear.

/// Tauri-CLI-mobile uses this for the mobile entry point. We keep the
/// attribute for forward-compatibility even though Starr CAD targets
/// desktop today.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // cad-desktop-tauri-and-perf Slice T4 — native file dialog
        // and file-system reads. The TS helper at
        // `lib/cad/persistence/native-file.ts` calls these via
        // `plugin:dialog|open` + `plugin:fs|read_text_file`.
        // Capabilities are granted per-window in
        // `capabilities/default.json`.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(menu::install_app_menu)
        .on_menu_event(menu::on_menu_event)
        .invoke_handler(tauri::generate_handler![ping])
        .run(tauri::generate_context!())
        .expect("error while running Starr CAD desktop shell");
}

/// Smoke-test IPC the front-end can call to confirm the shell is
/// actually Tauri (not a stray browser tab pointed at the dev server).
/// Slice T3 wraps this in a typed helper.
#[tauri::command]
fn ping() -> &'static str {
    "pong:starr-cad"
}
