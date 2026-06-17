// cad-desktop-tauri-and-perf Slice T2 — Tauri 2 stub entrypoint.
//
// Production builds on Windows need this guard so the second binary
// the OS spawns for the embedded webview doesn't pop a console
// window. On macOS / Linux the attribute is a no-op.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    starr_cad_lib::run();
}
