// cad-desktop-tauri-and-perf Slice T2 — Tauri build script.
//
// Runs at compile time. `tauri-build` reads `tauri.conf.json`,
// validates capabilities, and emits platform-specific code paths
// (Win32 manifest, macOS Info.plist fragments, etc.). No custom
// build logic for Slice T2.
fn main() {
    tauri_build::build()
}
