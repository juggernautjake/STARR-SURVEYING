// __tests__/desktop/recent-files.test.ts
//
// cad-desktop-tauri-and-perf Slice T7b — Recent Files store +
// MenuBar wiring. Tests inject a fake invoke so they don't need a
// real Tauri shell.

import './setup-window-stub';
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { __unsafeSetTauriInternalsForTests } from '@/lib/cad/platform/runtime';
import {
  RECENT_FILES_LIMIT,
  addRecentFile,
  applyRecentFileAdd,
  clearRecentFiles,
  getRecentFiles,
  resolveRecentFilesPath,
  type RecentFile,
} from '@/lib/cad/persistence/recent-files';

const fakeInvoke = vi.fn();

afterEach(() => {
  __unsafeSetTauriInternalsForTests(undefined);
  fakeInvoke.mockReset();
});

function entry(p: string, name = path.basename(p)): RecentFile {
  return { path: p, name, savedAt: '2026-06-14T08:00:00.000Z' };
}

describe('RECENT_FILES_LIMIT — matches the typical OS Recent menu cap', () => {
  it('is 10 (the macOS convention)', () => {
    expect(RECENT_FILES_LIMIT).toBe(10);
  });
});

describe('resolveRecentFilesPath — joins appData + recent.json', () => {
  it('uses forward slashes and the canonical filename', async () => {
    fakeInvoke.mockResolvedValueOnce('/home/jake/.local/share/starr-cad');
    expect(await resolveRecentFilesPath(fakeInvoke)).toBe(
      '/home/jake/.local/share/starr-cad/recent.json',
    );
  });
});

describe('applyRecentFileAdd — pure prepend + dedup + cap', () => {
  it('prepends the new entry on an empty list', () => {
    const e = entry('/tmp/a.starr');
    expect(applyRecentFileAdd([], e)).toEqual([e]);
  });

  it('moves an existing entry to the top instead of duplicating', () => {
    const a = entry('/tmp/a.starr');
    const b = entry('/tmp/b.starr');
    const updated = applyRecentFileAdd([a, b], { ...a, savedAt: 'newer' });
    expect(updated.map((e) => e.path)).toEqual(['/tmp/a.starr', '/tmp/b.starr']);
    expect(updated[0].savedAt).toBe('newer');
  });

  it('caps the list at RECENT_FILES_LIMIT (drops the oldest)', () => {
    const existing = Array.from({ length: RECENT_FILES_LIMIT }, (_, i) => entry(`/tmp/${i}.starr`));
    const next = applyRecentFileAdd(existing, entry('/tmp/new.starr'));
    expect(next).toHaveLength(RECENT_FILES_LIMIT);
    expect(next[0].path).toBe('/tmp/new.starr');
    // The bottom-most existing entry dropped off.
    expect(next.map((e) => e.path)).not.toContain(`/tmp/${RECENT_FILES_LIMIT - 1}.starr`);
  });

  it('compares paths exactly (no case-fold) so "garland.starr" and "Garland.starr" both stay', () => {
    const lower = entry('/tmp/garland.starr');
    const upper = entry('/tmp/Garland.starr');
    expect(applyRecentFileAdd([lower], upper).map((e) => e.path)).toEqual([
      '/tmp/Garland.starr',
      '/tmp/garland.starr',
    ]);
  });
});

describe('getRecentFiles — read + tolerate', () => {
  it('returns [] on the web build', async () => {
    expect(await getRecentFiles()).toEqual([]);
    expect(fakeInvoke).not.toHaveBeenCalled();
  });

  it('returns [] when the file is missing (read throws)', async () => {
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    fakeInvoke
      .mockResolvedValueOnce('/appdata')
      .mockRejectedValueOnce(new Error('ENOENT'));
    expect(await getRecentFiles()).toEqual([]);
  });

  it('returns [] when the contents are not a JSON array', async () => {
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    fakeInvoke
      .mockResolvedValueOnce('/appdata')
      .mockResolvedValueOnce('{"not":"array"}');
    expect(await getRecentFiles()).toEqual([]);
  });

  it('returns the parsed list, filtering out malformed entries', async () => {
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    const stored = [
      entry('/tmp/a.starr'),
      { not: 'shaped' },
      entry('/tmp/b.starr'),
    ];
    fakeInvoke
      .mockResolvedValueOnce('/appdata')
      .mockResolvedValueOnce(JSON.stringify(stored));
    const result = await getRecentFiles();
    expect(result.map((e) => e.path)).toEqual(['/tmp/a.starr', '/tmp/b.starr']);
  });

  it('caps the returned list at RECENT_FILES_LIMIT even if recent.json is too long', async () => {
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    const stored = Array.from({ length: 25 }, (_, i) => entry(`/tmp/${i}.starr`));
    fakeInvoke
      .mockResolvedValueOnce('/appdata')
      .mockResolvedValueOnce(JSON.stringify(stored));
    const result = await getRecentFiles();
    expect(result).toHaveLength(RECENT_FILES_LIMIT);
  });
});

describe('addRecentFile — mkdir + write through invoke', () => {
  it('returns silently on the web build', async () => {
    await addRecentFile('/tmp/a.starr', 'a.starr');
    expect(fakeInvoke).not.toHaveBeenCalled();
  });

  it('first read returns [], then mkdir + write the new list', async () => {
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    // getRecentFiles round-trip: appDataDir + read_text_file (missing).
    fakeInvoke
      .mockResolvedValueOnce('/appdata')
      .mockRejectedValueOnce(new Error('ENOENT'));
    // writeRecentFiles: appDataDir + mkdir + write_text_file.
    fakeInvoke
      .mockResolvedValueOnce('/appdata')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    // writeRecentFiles also fires rebuild_menu at the end so the
    // native Rust menu reflects the new list (Slice T7c).
    fakeInvoke.mockResolvedValueOnce(undefined); // rebuild_menu
    await addRecentFile('/tmp/a.starr', 'a.starr');
    // Call sequence: getRecentFiles fires app_data_dir + read_text_file
    // (rejects); writeRecentFiles fires app_data_dir + mkdir +
    // write_text_file + rebuild_menu. Mkdir is therefore the 4th
    // invoke.
    expect(fakeInvoke).toHaveBeenNthCalledWith(4, 'plugin:fs|mkdir', {
      path: '/appdata',
      options: { recursive: true },
    });
    // The 5th call writes the JSON…
    expect(fakeInvoke.mock.calls[4][0]).toBe('plugin:fs|write_text_file');
    const written = JSON.parse((fakeInvoke.mock.calls[4][1] as { contents: string }).contents);
    expect(written).toHaveLength(1);
    expect(written[0].path).toBe('/tmp/a.starr');
    expect(written[0].name).toBe('a.starr');
    // …and the final call rebuilds the menu with the same list.
    const last = fakeInvoke.mock.calls[fakeInvoke.mock.calls.length - 1];
    expect(last[0]).toBe('rebuild_menu');
    expect((last[1] as { recent: Array<{ path: string }> }).recent).toEqual([
      { path: '/tmp/a.starr', name: 'a.starr' },
    ]);
  });
});

describe('clearRecentFiles — write an empty array', () => {
  it('returns silently on the web build', async () => {
    await clearRecentFiles();
    expect(fakeInvoke).not.toHaveBeenCalled();
  });

  it('writes [] to the canonical path', async () => {
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    fakeInvoke
      .mockResolvedValueOnce('/appdata')   // appDataDir for mkdir
      .mockResolvedValueOnce(undefined)    // mkdir
      .mockResolvedValueOnce(undefined)    // write_text_file
      .mockResolvedValueOnce(undefined);   // rebuild_menu
    await clearRecentFiles();
    // The write happens at position 3 (0-indexed: 2).
    expect(fakeInvoke.mock.calls[2][0]).toBe('plugin:fs|write_text_file');
    expect((fakeInvoke.mock.calls[2][1] as { contents: string }).contents).toBe('[]');
    // …and the menu rebuild fires with an empty list.
    const last = fakeInvoke.mock.calls[fakeInvoke.mock.calls.length - 1];
    expect(last[0]).toBe('rebuild_menu');
    expect((last[1] as { recent: unknown[] }).recent).toEqual([]);
  });
});

describe('MenuBar — Slice T7b wiring', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
    'utf8',
  );

  it('imports addRecentFile + clearRecentFiles from the recent-files store', () => {
    expect(SRC).toMatch(
      /import \{ addRecentFile, clearRecentFiles \} from '@\/lib\/cad\/persistence\/recent-files'/,
    );
  });

  it('open-dialog Tauri success path records the result via addRecentFile(path, name)', () => {
    expect(SRC).toMatch(
      /await processOpenedCadFile\(result\.name, result\.contents\);[\s\S]*?addRecentFile\(result\.path, result\.name\)/,
    );
  });

  it('drop-listener body records each file via addRecentFile(file.path, file.name)', () => {
    expect(SRC).toMatch(
      /await processOpenedCadFile\(file\.name, file\.contents\);[\s\S]*?addRecentFile\(file\.path, file\.name\)/,
    );
  });

  it('save Tauri success path records the saved file via addRecentFile(path, name)', () => {
    expect(SRC).toMatch(
      /setLocalTarget\(doc\.id, baseName, result\.path\);[\s\S]*?clearAutosave\(doc\.id\);[\s\S]*?addRecentFile\(result\.path, result\.name\)/,
    );
  });

  it('listens for cad:openRecentFile and reads the path via plugin:fs|read_text_file', () => {
    expect(SRC).toMatch(/window\.addEventListener\('cad:openRecentFile', onOpenRecent\)/);
    expect(SRC).toMatch(/invoke<string>\('plugin:fs\|read_text_file', \{ path: recentPath \}\)/);
    // After read, feeds through the same processOpenedCadFile helper.
    expect(SRC).toMatch(/await processOpenedCadFile\(name, contents\)/);
  });

  it('the cad:openRecentFile handler also moves the entry to the top of Recent Files', () => {
    expect(SRC).toMatch(
      /await processOpenedCadFile\(name, contents\);[\s\S]*?addRecentFile\(recentPath, name\)/,
    );
  });
});
