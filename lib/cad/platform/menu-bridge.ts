// lib/cad/platform/menu-bridge.ts
//
// cad-desktop-tauri-and-perf Slice T7 — subscribes to the
// `cad:menu` Tauri event the Rust menu handler emits (one per
// click), looks up the matching CAD action, and dispatches the
// existing `cad:*` window event (or calls the relevant store
// directly for the Undo / Redo path).
//
// Centralising the mapping here means the menu's IPC contract
// stays in ONE place — the canonical menu item ids in
// `src-tauri/src/menu.rs` (`file.open`, `file.save`, …). If a
// future slice adds a new menu item, it shows up here as a new
// case and nowhere else.

import { isTauri } from './runtime';

/** Lazy-import the Tauri event listener through a Function-built
 *  trampoline so TS doesn't trip on the absent
 *  `@tauri-apps/api/event` types (same pattern Slice T4c uses for
 *  `@tauri-apps/api/webview`). */
async function loadEventModule(): Promise<{
  listen: (event: string, cb: (e: { payload?: unknown }) => void) => Promise<() => void>;
} | null> {
  try {
    const dynImport = new Function('p', 'return import(p)') as (p: string) => Promise<unknown>;
    const mod = (await dynImport('@tauri-apps/api/event').catch(() => null)) as
      | { listen?: (e: string, cb: (e: { payload?: unknown }) => void) => Promise<() => void> }
      | null;
    return mod && typeof mod.listen === 'function'
      ? (mod as { listen: (e: string, cb: (e: { payload?: unknown }) => void) => Promise<() => void> })
      : null;
  } catch {
    return null;
  }
}

/** Map every menu item id → the window event the existing CAD app
 *  already listens for. Items that need a different kind of action
 *  (Undo / Redo go through the undo store directly) are handled in
 *  `dispatchMenuAction` below. Keys MUST stay in lockstep with the
 *  ID_* constants in `src-tauri/src/menu.rs`. */
export const MENU_EVENT_MAP: Readonly<Record<string, string>> = Object.freeze({
  'file.open': 'cad:openFileDialog',
  'file.save': 'cad:saveDocument',
  'file.saveAs': 'cad:saveDocumentAs',
  'file.recent': 'cad:openFileManager',
  'edit.selectAll': 'cad:selectAll',
  'view.zoomExtents': 'cad:zoomExtents',
  'view.regenerate': 'cad:regenerateCanvas',
  'help.shortcuts': 'cad:openShortcutHelp',
});

/** Dispatch a menu action by id. Exported so tests + future
 *  call sites can drive the bridge without the Tauri event
 *  subscription path. */
export function dispatchMenuAction(id: string): void {
  // Undo / Redo bypass the event bus because the existing hotkey
  // wiring calls the undo store directly. Going through a
  // `cad:undo` event would be a parallel surface to maintain.
  if (id === 'edit.undo') {
    void (async () => {
      const { useUndoStore } = await import('../store');
      useUndoStore.getState().undo();
    })();
    return;
  }
  if (id === 'edit.redo') {
    void (async () => {
      const { useUndoStore } = await import('../store');
      useUndoStore.getState().redo();
    })();
    return;
  }
  const eventName = MENU_EVENT_MAP[id];
  if (!eventName) return;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(eventName));
}

/** Subscribe to the Tauri `cad:menu` event and route each emitted
 *  payload through `dispatchMenuAction`. Returns an unlisten
 *  function the caller invokes on unmount. Returns null on the
 *  web build or when the event module can't be loaded (tests). */
export async function registerMenuBridge(): Promise<(() => void) | null> {
  if (!isTauri()) return null;
  const events = await loadEventModule();
  if (!events) return null;
  const unlisten = await events.listen('cad:menu', (event) => {
    const payload = event.payload;
    if (typeof payload === 'string') dispatchMenuAction(payload);
  });
  return unlisten;
}
