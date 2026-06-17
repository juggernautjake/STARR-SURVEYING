// __tests__/desktop/recent-menu-rebuild.test.ts
//
// cad-desktop-tauri-and-perf Slice T7c — dynamic Recent Files
// submenu. The Rust side rebuilds the menu on every successful
// recent-files write; the TS bridge handles the new payload shape
// (object with `id` + optional `recentPath`).

import './setup-window-stub';
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  dispatchMenuAction,
  normalizeMenuPayload,
} from '@/lib/cad/platform/menu-bridge';

describe('normalizeMenuPayload — accepts both string + object shapes', () => {
  it('a bare string is treated as the id (Slice T7 protocol)', () => {
    expect(normalizeMenuPayload('file.open')).toEqual({ id: 'file.open' });
  });

  it('an object with id + recentPath is normalized verbatim', () => {
    expect(normalizeMenuPayload({ id: 'recent.3', recentPath: '/tmp/a.starr' }))
      .toEqual({ id: 'recent.3', recentPath: '/tmp/a.starr' });
  });

  it('an object without `id` returns null (defensive)', () => {
    expect(normalizeMenuPayload({ recentPath: '/tmp/a.starr' })).toBeNull();
  });

  it('returns null on garbage inputs', () => {
    expect(normalizeMenuPayload(42)).toBeNull();
    expect(normalizeMenuPayload(null)).toBeNull();
    expect(normalizeMenuPayload(undefined)).toBeNull();
  });
});

describe('dispatchMenuAction — Recent Files routing', () => {
  it('a `recent.N` click + a recentPath fires cad:openRecentFile with the path', () => {
    const listener = vi.fn();
    (window as Window).addEventListener('cad:openRecentFile', listener);
    dispatchMenuAction('recent.0', '/tmp/a.starr');
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent<{ path: string }>;
    expect(event.detail).toEqual({ path: '/tmp/a.starr' });
    (window as Window).removeEventListener('cad:openRecentFile', listener);
  });

  it('a `recent.N` click WITHOUT a recentPath is silently ignored', () => {
    const listener = vi.fn();
    (window as Window).addEventListener('cad:openRecentFile', listener);
    dispatchMenuAction('recent.7');
    expect(listener).not.toHaveBeenCalled();
    (window as Window).removeEventListener('cad:openRecentFile', listener);
  });

  it('`file.clearRecent` fires cad:clearRecentFiles', () => {
    const listener = vi.fn();
    (window as Window).addEventListener('cad:clearRecentFiles', listener);
    dispatchMenuAction('file.clearRecent');
    expect(listener).toHaveBeenCalledTimes(1);
    (window as Window).removeEventListener('cad:clearRecentFiles', listener);
  });
});

describe('Rust menu.rs — recent files plumbing', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src-tauri', 'src', 'menu.rs'),
    'utf8',
  );

  it('declares RECENT_ID_PREFIX = "recent."', () => {
    expect(SRC).toMatch(/pub const RECENT_ID_PREFIX: &str = "recent\.";/);
  });

  it('declares the RecentFilesState managed state with a Mutex of RecentFileEntry', () => {
    expect(SRC).toMatch(/pub struct RecentFilesState\(pub Mutex<Vec<RecentFileEntry>>\)/);
    expect(SRC).toMatch(/pub struct RecentFileEntry \{\s*\n\s*pub path: String,\s*\n\s*pub name: String,/);
  });

  it('rebuild_menu is a #[tauri::command] that takes Vec<RecentFileEntry>', () => {
    expect(SRC).toMatch(
      /#\[tauri::command\][\s\S]*?pub fn rebuild_menu<R: Runtime>\([\s\S]*?recent: Vec<RecentFileEntry>/,
    );
  });

  it('on_menu_event resolves recent.<N> ids via RecentFilesState + emits MenuEventPayload', () => {
    expect(SRC).toMatch(/recent_index_from\(&id\)/);
    expect(SRC).toMatch(/app\.state::<RecentFilesState>\(\)/);
    expect(SRC).toMatch(/recent_path/);
  });

  it('build_recent_submenu falls back to a disabled "No recent files" entry when the list is empty', () => {
    expect(SRC).toMatch(/"No recent files"/);
    expect(SRC).toMatch(/false,\s*\n\s*None::<&str>/);
  });

  it('build_recent_submenu adds a "Clear Recent Files" entry under populated lists', () => {
    expect(SRC).toMatch(/"Clear Recent Files"/);
  });

  it('build_recent_submenu strips trailing `.starr` from the menu label', () => {
    expect(SRC).toMatch(/strip_suffix\("\.starr"\)/);
    expect(SRC).toMatch(/strip_suffix\("\.STARR"\)/);
  });
});

describe('lib.rs — wires RecentFilesState + rebuild_menu', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src-tauri', 'src', 'lib.rs'),
    'utf8',
  );

  it('manages the RecentFilesState default on the builder', () => {
    expect(SRC).toMatch(/\.manage\(menu::RecentFilesState::default\(\)\)/);
  });

  it('exposes both ping AND rebuild_menu in the invoke_handler chain', () => {
    expect(SRC).toMatch(/invoke_handler\(tauri::generate_handler!\[ping, menu::rebuild_menu\]\)/);
  });
});

describe('recent-files.ts — invokes rebuild_menu after every write', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'lib', 'cad', 'persistence', 'recent-files.ts'),
    'utf8',
  );

  it('writeRecentFiles ends with an invoke("rebuild_menu", { recent: ... })', () => {
    expect(SRC).toMatch(/invoke\('rebuild_menu', \{\s*\n\s*recent: files\.map/);
    expect(SRC).toMatch(/\(f\) => \(\{ path: f\.path, name: f\.name \}\)\)/);
  });

  it('the rebuild_menu call is wrapped in a try / catch (first-boot race tolerance)', () => {
    expect(SRC).toMatch(
      /try \{\s*\n\s*await invoke\('rebuild_menu'[\s\S]*?\} catch \{/,
    );
  });
});

describe('MenuBar — Slice T7c clearRecentFiles listener', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
    'utf8',
  );

  it('listens for cad:clearRecentFiles and calls the store helper', () => {
    expect(SRC).toMatch(/window\.addEventListener\('cad:clearRecentFiles', onClearRecent\)/);
    expect(SRC).toMatch(/const onClearRecent = \(\) => \{ void clearRecentFiles\(\); \}/);
  });

  it('removes the listener on unmount', () => {
    expect(SRC).toMatch(/window\.removeEventListener\('cad:clearRecentFiles', onClearRecent\)/);
  });
});
