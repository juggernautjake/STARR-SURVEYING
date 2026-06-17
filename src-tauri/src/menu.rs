// cad-desktop-tauri-and-perf Slice T7 — native app menu.
//
// Installs a real OS menu bar (top of screen on macOS, top of window
// on Windows / Linux) on app boot. Each clickable item identifies
// itself via a stable string id (e.g. `"file.open"`). The
// `on_menu_event` handler emits a `cad:menu` event to every webview
// with the id as the payload; the TS bridge in
// `lib/cad/platform/menu-bridge.ts` subscribes and dispatches the
// corresponding `cad:*` window event the existing CAD app already
// listens for.
//
// Predefined items (Quit, Cut, Copy, Paste) come from Tauri's
// PredefinedMenuItem helpers so the OS handles them natively —
// Cmd+C inside an `<input>` etc. works the way every macOS / Win
// user expects.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu},
    App, AppHandle, Emitter, Manager, Runtime,
};

/// Menu item IDs. Stable strings — the TS bridge depends on these.
pub const ID_FILE_OPEN: &str = "file.open";
pub const ID_FILE_SAVE: &str = "file.save";
pub const ID_FILE_SAVE_AS: &str = "file.saveAs";
pub const ID_FILE_RECENT: &str = "file.recent";
pub const ID_FILE_CLEAR_RECENT: &str = "file.clearRecent";
pub const ID_EDIT_UNDO: &str = "edit.undo";
pub const ID_EDIT_REDO: &str = "edit.redo";
pub const ID_EDIT_SELECT_ALL: &str = "edit.selectAll";
pub const ID_VIEW_ZOOM_EXTENTS: &str = "view.zoomExtents";
pub const ID_VIEW_REFRESH: &str = "view.regenerate";
pub const ID_HELP_SHORTCUTS: &str = "help.shortcuts";

/// Prefix for the dynamic Recent Files items. The full id is
/// `recent.<index>`; index is the position in the recent.json
/// list at the time `rebuild_menu` ran.
pub const RECENT_ID_PREFIX: &str = "recent.";

/// Shared state mirroring the recent files we last installed into the
/// File submenu. Read by `on_menu_event` when a `recent.<N>` item
/// fires, so the path lookup doesn't need a roundtrip to disk.
#[derive(Default)]
pub struct RecentFilesState(pub Mutex<Vec<RecentFileEntry>>);

/// What each Recent Files menu item carries. Mirrors the TS-side
/// `RecentFile` shape minus the `savedAt` (we don't render
/// timestamps on the menu).
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct RecentFileEntry {
    pub path: String,
    pub name: String,
}

/// Wire the menu bar onto the running app. Called from
/// `tauri::Builder::default().setup(...)`.
pub fn install_app_menu<R: Runtime>(app: &mut App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();
    let menu = build_menu(handle, &[])?;
    app.set_menu(menu)?;
    Ok(())
}

/// Discriminated payload for `cad:menu`. Non-recent clicks send the
/// `id` only (matches the Slice T7 contract); `recent.<N>` clicks
/// additionally carry the resolved path so the TS bridge doesn't
/// have to re-read recent.json.
#[derive(Serialize)]
struct MenuEventPayload<'a> {
    id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "recentPath")]
    recent_path: Option<String>,
}

/// Forward the menu click to every webview as a `cad:menu` event.
/// For `recent.<N>` ids the payload includes the resolved path
/// looked up from `RecentFilesState`. Called from
/// `on_menu_event(...)` on the builder.
pub fn on_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref().to_string();
    let recent_path = recent_index_from(&id).and_then(|idx| {
        let state = app.state::<RecentFilesState>();
        let guard = state.0.lock().ok()?;
        guard.get(idx).map(|e| e.path.clone())
    });
    let _ = app.emit(
        "cad:menu",
        MenuEventPayload {
            id: &id,
            recent_path,
        },
    );
}

fn recent_index_from(id: &str) -> Option<usize> {
    id.strip_prefix(RECENT_ID_PREFIX)?.parse::<usize>().ok()
}

/// Rebuild the entire menu using the supplied recent files list and
/// update the shared state. Called from the TS side after every
/// successful `addRecentFile` / `clearRecentFiles` so the File
/// submenu's Recent Files block always matches recent.json.
#[tauri::command]
pub fn rebuild_menu<R: Runtime>(
    app: AppHandle<R>,
    recent: Vec<RecentFileEntry>,
) -> Result<(), String> {
    let menu = build_menu(&app, &recent).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    if let Some(state) = app.try_state::<RecentFilesState>() {
        if let Ok(mut guard) = state.0.lock() {
            *guard = recent;
        }
    }
    Ok(())
}

/// Build the menu tree. `recent` is the (already-capped) list of
/// recent files to surface in the File submenu — pass `&[]` on app
/// boot for the static fallback. Split out from `install_app_menu`
/// so `rebuild_menu` can drive it after each Recent Files write.
fn build_menu<R: Runtime>(
    app: &AppHandle<R>,
    recent: &[RecentFileEntry],
) -> tauri::Result<Menu<R>> {
    let recent_submenu = build_recent_submenu(app, recent)?;

    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &MenuItem::with_id(app, ID_FILE_OPEN, "Open…", true, Some("CmdOrCtrl+O"))?,
            &MenuItem::with_id(app, ID_FILE_SAVE, "Save", true, Some("CmdOrCtrl+S"))?,
            &MenuItem::with_id(app, ID_FILE_SAVE_AS, "Save As…", true, Some("CmdOrCtrl+Shift+S"))?,
            &PredefinedMenuItem::separator(app)?,
            &recent_submenu,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some("Quit"))?,
        ],
    )?;

    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &MenuItem::with_id(app, ID_EDIT_UNDO, "Undo", true, Some("CmdOrCtrl+Z"))?,
            &MenuItem::with_id(app, ID_EDIT_REDO, "Redo", true, Some("CmdOrCtrl+Y"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, ID_EDIT_SELECT_ALL, "Select All", true, Some("CmdOrCtrl+A"))?,
        ],
    )?;

    let view = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &MenuItem::with_id(app, ID_VIEW_ZOOM_EXTENTS, "Zoom Extents", true, None::<&str>)?,
            &MenuItem::with_id(app, ID_VIEW_REFRESH, "Refresh Canvas", true, Some("F5"))?,
        ],
    )?;

    let help = Submenu::with_items(
        app,
        "Help",
        true,
        &[&MenuItem::with_id(
            app,
            ID_HELP_SHORTCUTS,
            "Keyboard Shortcuts",
            true,
            Some("CmdOrCtrl+/"),
        )?],
    )?;

    Menu::with_items(app, &[&file, &edit, &view, &help])
}

/// Build the "Recent Files" submenu. When `recent` is empty we
/// render a single disabled "No recent files" entry so the menu
/// still telegraphs that the feature exists; otherwise each entry
/// gets a `recent.<index>` id keyed by its position in the list,
/// and a "Clear Recent Files" entry sits at the bottom.
fn build_recent_submenu<R: Runtime>(
    app: &AppHandle<R>,
    recent: &[RecentFileEntry],
) -> tauri::Result<Submenu<R>> {
    if recent.is_empty() {
        return Submenu::with_items(
            app,
            "Recent Files",
            true,
            &[&MenuItem::with_id(
                app,
                ID_FILE_RECENT,
                "No recent files",
                false,
                None::<&str>,
            )?],
        );
    }

    // Build owned MenuItem instances first so the slice we pass to
    // `Submenu::with_items` can borrow them.
    let mut owned_items: Vec<MenuItem<R>> = Vec::with_capacity(recent.len() + 1);
    for (idx, entry) in recent.iter().enumerate() {
        let id = format!("{}{}", RECENT_ID_PREFIX, idx);
        // Strip the `.starr` extension on the visible label so the
        // menu reads cleanly; full path stays in the payload.
        let label = entry
            .name
            .strip_suffix(".starr")
            .or_else(|| entry.name.strip_suffix(".STARR"))
            .unwrap_or(&entry.name)
            .to_string();
        owned_items.push(MenuItem::with_id(app, &id, &label, true, None::<&str>)?);
    }
    let clear_item = MenuItem::with_id(
        app,
        ID_FILE_CLEAR_RECENT,
        "Clear Recent Files",
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;

    // Now collect references into the trait-object slice the API needs.
    let mut item_refs: Vec<&dyn tauri::menu::IsMenuItem<R>> =
        owned_items.iter().map(|i| i as &dyn tauri::menu::IsMenuItem<R>).collect();
    item_refs.push(&separator);
    item_refs.push(&clear_item);

    Submenu::with_items(app, "Recent Files", true, &item_refs)
}
