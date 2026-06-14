// __tests__/desktop/menu-bridge.test.ts
//
// cad-desktop-tauri-and-perf Slice T7 — native menu bridge.
//
// The Rust menu in `src-tauri/src/menu.rs` emits a `cad:menu` event
// per click with the item id as the payload. The TS bridge (this
// module's lib/cad/platform/menu-bridge.ts) routes each id to a
// pre-existing `cad:*` window event the CAD app already listens
// for. Tests verify the mapping table + the runtime dispatch.

import './setup-window-stub';
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  MENU_EVENT_MAP,
  dispatchMenuAction,
  registerMenuBridge,
} from '@/lib/cad/platform/menu-bridge';
import { __unsafeSetTauriInternalsForTests } from '@/lib/cad/platform/runtime';

afterEach(() => {
  __unsafeSetTauriInternalsForTests(undefined);
});

describe('MENU_EVENT_MAP — keys mirror src-tauri/src/menu.rs ID_* constants', () => {
  const RUST = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src-tauri', 'src', 'menu.rs'),
    'utf8',
  );
  const idLines = RUST.match(/pub const ID_[A-Z_]+: &str = "[^"]+";/g) ?? [];
  // Map each constant declaration to its string id literal.
  const rustIds = idLines.map((line) => /= "([^"]+)";/.exec(line)![1]);

  it('every menu id declared in Rust shows up in MENU_EVENT_MAP (except undo / redo / clearRecent which bypass)', () => {
    // edit.undo / edit.redo bypass to the undo store directly.
    // file.clearRecent fires `cad:clearRecentFiles` (Slice T7c) and
    // also doesn't sit on the map.
    const tsIds = Object.keys(MENU_EVENT_MAP).concat([
      'edit.undo',
      'edit.redo',
      'file.clearRecent',
    ]);
    for (const rustId of rustIds) {
      expect(tsIds).toContain(rustId);
    }
  });

  it('maps each known click to a `cad:*` window event', () => {
    for (const eventName of Object.values(MENU_EVENT_MAP)) {
      expect(eventName.startsWith('cad:')).toBe(true);
    }
  });

  it('canonical id → event mapping covers File / View / Edit / Help baselines', () => {
    expect(MENU_EVENT_MAP['file.open']).toBe('cad:openFileDialog');
    expect(MENU_EVENT_MAP['file.save']).toBe('cad:saveDocument');
    expect(MENU_EVENT_MAP['file.saveAs']).toBe('cad:saveDocumentAs');
    expect(MENU_EVENT_MAP['file.recent']).toBe('cad:openFileManager');
    expect(MENU_EVENT_MAP['edit.selectAll']).toBe('cad:selectAll');
    expect(MENU_EVENT_MAP['view.zoomExtents']).toBe('cad:zoomExtents');
    expect(MENU_EVENT_MAP['view.regenerate']).toBe('cad:regenerateCanvas');
    expect(MENU_EVENT_MAP['help.shortcuts']).toBe('cad:openShortcutHelp');
  });
});

describe('dispatchMenuAction — routes ids to cad:* window events', () => {
  it('dispatches the mapped cad:* event verbatim', () => {
    const listener = vi.fn();
    (window as Window).addEventListener('cad:openFileDialog', listener);
    dispatchMenuAction('file.open');
    expect(listener).toHaveBeenCalledTimes(1);
    (window as Window).removeEventListener('cad:openFileDialog', listener);
  });

  it('every mapping entry round-trips through window.dispatchEvent', () => {
    for (const [id, eventName] of Object.entries(MENU_EVENT_MAP)) {
      const listener = vi.fn();
      (window as Window).addEventListener(eventName, listener);
      dispatchMenuAction(id);
      expect(listener, `dispatchMenuAction(${id}) → ${eventName}`).toHaveBeenCalledTimes(1);
      (window as Window).removeEventListener(eventName, listener);
    }
  });

  it('unknown ids are silently ignored', () => {
    const listener = vi.fn();
    (window as Window).addEventListener('cad:openFileDialog', listener);
    dispatchMenuAction('bogus.action');
    expect(listener).not.toHaveBeenCalled();
    (window as Window).removeEventListener('cad:openFileDialog', listener);
  });

  it('edit.undo and edit.redo bypass the event bus (they go through the undo store)', async () => {
    const listener = vi.fn();
    (window as Window).addEventListener('cad:undo', listener);
    (window as Window).addEventListener('cad:redo', listener);
    dispatchMenuAction('edit.undo');
    dispatchMenuAction('edit.redo');
    // dispatchMenuAction for undo/redo lazy-imports the undo store
    // (`await import('../store')`). Resolve the imports explicitly
    // so the teardown phase doesn't catch them mid-load and surface
    // EnvironmentTeardownError. Awaiting the same module ref tracks
    // the dynamic import's promise chain rather than guessing at
    // event-loop timing.
    await import('@/lib/cad/store');
    await new Promise((r) => setTimeout(r, 10));
    expect(listener).not.toHaveBeenCalled();
    (window as Window).removeEventListener('cad:undo', listener);
    (window as Window).removeEventListener('cad:redo', listener);
  });
});

describe('registerMenuBridge — Tauri-only subscription', () => {
  it('returns null on the web build (no Tauri runtime)', async () => {
    __unsafeSetTauriInternalsForTests(undefined);
    expect(await registerMenuBridge()).toBeNull();
  });

  it('returns null when @tauri-apps/api/event fails to load (test env)', async () => {
    __unsafeSetTauriInternalsForTests({ invoke: vi.fn() } as never);
    expect(await registerMenuBridge()).toBeNull();
  });
});

describe('MenuBar — Slice T7 wiring', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
    'utf8',
  );

  it('imports registerMenuBridge from the platform module', () => {
    expect(SRC).toMatch(
      /import \{ registerMenuBridge \} from '@\/lib\/cad\/platform\/menu-bridge'/,
    );
  });

  it('useEffect subscribes to cad:openFileDialog + cad:saveDocumentAs (MenuBar-owned closures)', () => {
    expect(SRC).toMatch(/window\.addEventListener\('cad:openFileDialog', onOpen\)/);
    expect(SRC).toMatch(/window\.addEventListener\('cad:saveDocumentAs', onSaveAs\)/);
  });

  it('mounts the menu bridge with the same disposed/unlisten guard the drop listener uses', () => {
    expect(SRC).toMatch(
      /void \(async \(\) => \{\s*\n\s*const stop = await registerMenuBridge\(\);/,
    );
    expect(SRC).toMatch(/if \(disposed && stop\) \{\s*\n\s*stop\(\);/);
  });
});

describe('Rust shell — menu module + on_menu_event wiring', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

  it('lib.rs declares `mod menu` + chains setup + on_menu_event on the builder', () => {
    const LIB = read('src-tauri/src/lib.rs');
    expect(LIB).toMatch(/mod menu;/);
    expect(LIB).toMatch(/\.setup\(menu::install_app_menu\)/);
    expect(LIB).toMatch(/\.on_menu_event\(menu::on_menu_event\)/);
  });

  it('menu.rs builds File / Edit / View / Help submenus with the canonical ids', () => {
    const MENU = read('src-tauri/src/menu.rs');
    expect(MENU).toMatch(/Submenu::with_items\(\s*app,\s*"File"/);
    expect(MENU).toMatch(/Submenu::with_items\(\s*app,\s*"Edit"/);
    expect(MENU).toMatch(/Submenu::with_items\(\s*app,\s*"View"/);
    expect(MENU).toMatch(/Submenu::with_items\(\s*app,\s*"Help"/);
    expect(MENU).toMatch(/PredefinedMenuItem::quit/);
    expect(MENU).toMatch(/PredefinedMenuItem::cut/);
    expect(MENU).toMatch(/PredefinedMenuItem::copy/);
    expect(MENU).toMatch(/PredefinedMenuItem::paste/);
  });

  it('on_menu_event forwards the click via app.emit("cad:menu", …)', () => {
    // cad-desktop-tauri-and-perf Slice T7c — payload is now a
    // struct (MenuEventPayload) so the recentPath can ride along.
    const MENU = read('src-tauri/src/menu.rs');
    expect(MENU).toMatch(/app\.emit\(\s*"cad:menu",\s*MenuEventPayload/);
  });

  it('default capability grants event:allow-listen so the TS bridge can subscribe', () => {
    const CAP = JSON.parse(read('src-tauri/capabilities/default.json'));
    expect(CAP.permissions).toContain('event:allow-listen');
  });
});
