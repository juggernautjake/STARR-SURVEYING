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

use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu},
    App, AppHandle, Emitter, Manager, Runtime,
};

/// Menu item IDs. Stable strings — the TS bridge depends on these.
pub const ID_FILE_OPEN: &str = "file.open";
pub const ID_FILE_SAVE: &str = "file.save";
pub const ID_FILE_SAVE_AS: &str = "file.saveAs";
pub const ID_FILE_RECENT: &str = "file.recent";
pub const ID_EDIT_UNDO: &str = "edit.undo";
pub const ID_EDIT_REDO: &str = "edit.redo";
pub const ID_EDIT_SELECT_ALL: &str = "edit.selectAll";
pub const ID_VIEW_ZOOM_EXTENTS: &str = "view.zoomExtents";
pub const ID_VIEW_REFRESH: &str = "view.regenerate";
pub const ID_HELP_SHORTCUTS: &str = "help.shortcuts";

/// Wire the menu bar onto the running app. Called from
/// `tauri::Builder::default().setup(...)`.
pub fn install_app_menu<R: Runtime>(app: &mut App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();
    let menu = build_menu(handle)?;
    app.set_menu(menu)?;
    Ok(())
}

/// Forward the menu click to every webview as a `cad:menu` event
/// carrying the item id. Called from `on_menu_event(...)` on the
/// builder.
pub fn on_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref().to_string();
    let _ = app.emit("cad:menu", id);
}

/// Build the menu tree. Split out so a future slice that needs to
/// rebuild the menu (e.g. dynamic Recent Files submenu) can call
/// this directly.
fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &MenuItem::with_id(app, ID_FILE_OPEN, "Open…", true, Some("CmdOrCtrl+O"))?,
            &MenuItem::with_id(app, ID_FILE_SAVE, "Save", true, Some("CmdOrCtrl+S"))?,
            &MenuItem::with_id(app, ID_FILE_SAVE_AS, "Save As…", true, Some("CmdOrCtrl+Shift+S"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, ID_FILE_RECENT, "Recent Files…", true, None::<&str>)?,
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
