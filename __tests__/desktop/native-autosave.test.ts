// __tests__/desktop/native-autosave.test.ts
//
// cad-desktop-tauri-and-perf Slice T6 — filesystem-backed autosave
// for the Tauri shell. Mirrors the IndexedDB autosave public API
// shape so callers don't branch on the runtime. Tests inject a
// fake invoke that traces every IPC call.

import './setup-window-stub';
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { __unsafeSetTauriInternalsForTests } from '@/lib/cad/platform/runtime';
import {
  ensureNativeAutosaveDir,
  resolveNativeAutosavePath,
  writeNativeAutosave,
  readNativeAutosave,
  clearNativeAutosave,
  listNativeAutosaves,
} from '@/lib/cad/persistence/native-autosave';
import type { AutosavePayload } from '@/lib/cad/persistence/autosave';

const fakeInvoke = vi.fn();

afterEach(() => {
  __unsafeSetTauriInternalsForTests(undefined);
  fakeInvoke.mockReset();
});

function setupTauri() {
  __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
}

const SAMPLE: AutosavePayload = {
  version: '1.0',
  application: 'starr-cad',
  savedAt: '2026-06-14T07:00:00.000Z',
  document: { id: 'doc-1', name: 'Garland', layers: { L1: {} }, features: { F1: {}, F2: {} } },
};

describe('resolveNativeAutosavePath — joins appData + autosaves/ + <docId>.starr', () => {
  it('uses forward slashes and the docId-named .starr file', async () => {
    fakeInvoke.mockResolvedValueOnce('/home/jake/.local/share/starr-cad');
    const p = await resolveNativeAutosavePath('doc-1', fakeInvoke);
    expect(p).toBe('/home/jake/.local/share/starr-cad/autosaves/doc-1.starr');
  });

  it('trims trailing separators on the appData segment', async () => {
    fakeInvoke.mockResolvedValueOnce('/home/jake/.local/share/starr-cad/');
    const p = await resolveNativeAutosavePath('doc-1', fakeInvoke);
    expect(p).toBe('/home/jake/.local/share/starr-cad/autosaves/doc-1.starr');
  });
});

describe('ensureNativeAutosaveDir — idempotent mkdir', () => {
  it('issues `plugin:fs|mkdir` with recursive: true', async () => {
    fakeInvoke.mockResolvedValueOnce('/appdata');
    fakeInvoke.mockResolvedValueOnce(undefined);
    await ensureNativeAutosaveDir(fakeInvoke);
    expect(fakeInvoke).toHaveBeenNthCalledWith(2, 'plugin:fs|mkdir', {
      path: '/appdata/autosaves',
      options: { recursive: true },
    });
  });
});

describe('writeNativeAutosave — ensure dir + write payload JSON', () => {
  it('returns silently on the web build (no Tauri runtime)', async () => {
    await writeNativeAutosave('doc-1', SAMPLE);
    expect(fakeInvoke).not.toHaveBeenCalled();
  });

  it('ensures the autosaves dir then writes the payload as JSON (atomic via temp + rename)', async () => {
    // QA hardening — the write is now two-step: write to `<path>.tmp`
    // then `rename` to the real path so a crash mid-write can't leave
    // a torn autosave on disk. The test follows the new mock sequence.
    setupTauri();
    fakeInvoke
      .mockResolvedValueOnce('/appdata')             // ensure: appDataDir
      .mockResolvedValueOnce(undefined)              // ensure: mkdir
      .mockResolvedValueOnce('/appdata')             // resolveNativeAutosavePath: appDataDir
      .mockResolvedValueOnce(undefined)              // write_text_file (tmp)
      .mockResolvedValueOnce(undefined);             // rename tmp → path
    await writeNativeAutosave('doc-1', SAMPLE);
    expect(fakeInvoke).toHaveBeenNthCalledWith(4, 'plugin:fs|write_text_file', {
      path: '/appdata/autosaves/doc-1.starr.tmp',
      contents: JSON.stringify(SAMPLE),
    });
    expect(fakeInvoke).toHaveBeenLastCalledWith('plugin:fs|rename', {
      oldPath: '/appdata/autosaves/doc-1.starr.tmp',
      newPath: '/appdata/autosaves/doc-1.starr',
    });
  });

  it('falls back to a direct write when the rename plugin is missing', async () => {
    setupTauri();
    fakeInvoke
      .mockResolvedValueOnce('/appdata')               // ensure: appDataDir
      .mockResolvedValueOnce(undefined)                // ensure: mkdir
      .mockResolvedValueOnce('/appdata')               // resolveNativeAutosavePath: appDataDir
      .mockResolvedValueOnce(undefined)                // write tmp succeeds
      .mockRejectedValueOnce(new Error('rename not registered'))  // rename plugin missing
      .mockResolvedValueOnce(undefined)                // fallback direct write
      .mockResolvedValueOnce(undefined);               // best-effort tmp remove
    await writeNativeAutosave('doc-1', SAMPLE);
    // Fallback DID land — the canonical path got the payload written
    // directly even though the rename plugin was absent.
    expect(fakeInvoke).toHaveBeenCalledWith('plugin:fs|write_text_file', {
      path: '/appdata/autosaves/doc-1.starr',
      contents: JSON.stringify(SAMPLE),
    });
  });
});

describe('readNativeAutosave — parse the on-disk JSON, or null', () => {
  it('returns null on the web build', async () => {
    expect(await readNativeAutosave('doc-1')).toBeNull();
  });

  it('returns the parsed payload when the file exists + is well-formed', async () => {
    setupTauri();
    fakeInvoke
      .mockResolvedValueOnce('/appdata')
      .mockResolvedValueOnce(JSON.stringify(SAMPLE));
    const result = await readNativeAutosave('doc-1');
    expect(result).toEqual(SAMPLE);
    expect(fakeInvoke).toHaveBeenNthCalledWith(2, 'plugin:fs|read_text_file', {
      path: '/appdata/autosaves/doc-1.starr',
    });
  });

  it('returns null when the file is missing (read throws)', async () => {
    setupTauri();
    fakeInvoke
      .mockResolvedValueOnce('/appdata')
      .mockRejectedValueOnce(new Error('ENOENT'));
    expect(await readNativeAutosave('doc-1')).toBeNull();
  });

  it('returns null when the file contents are not a valid AutosavePayload', async () => {
    setupTauri();
    fakeInvoke
      .mockResolvedValueOnce('/appdata')
      .mockResolvedValueOnce('{"junk":true}'); // no savedAt
    expect(await readNativeAutosave('doc-1')).toBeNull();
  });
});

describe('clearNativeAutosave — remove the file, swallow ENOENT', () => {
  it('returns silently on the web build', async () => {
    await clearNativeAutosave('doc-1');
    expect(fakeInvoke).not.toHaveBeenCalled();
  });

  it('issues plugin:fs|remove with the resolved path', async () => {
    setupTauri();
    fakeInvoke
      .mockResolvedValueOnce('/appdata')
      .mockResolvedValueOnce(undefined);
    await clearNativeAutosave('doc-1');
    expect(fakeInvoke).toHaveBeenLastCalledWith('plugin:fs|remove', {
      path: '/appdata/autosaves/doc-1.starr',
    });
  });

  it('does not throw when the file is missing', async () => {
    setupTauri();
    fakeInvoke
      .mockResolvedValueOnce('/appdata')
      .mockRejectedValueOnce(new Error('ENOENT'));
    await expect(clearNativeAutosave('doc-1')).resolves.toBeUndefined();
  });
});

describe('listNativeAutosaves — enumerate + parse, sort newest first', () => {
  it('returns [] on the web build', async () => {
    expect(await listNativeAutosaves()).toEqual([]);
  });

  it('returns [] when the autosaves directory does not exist', async () => {
    setupTauri();
    fakeInvoke
      .mockResolvedValueOnce('/appdata')
      .mockRejectedValueOnce(new Error('ENOENT'));
    expect(await listNativeAutosaves()).toEqual([]);
  });

  it('reads every .starr entry + skips unrelated files', async () => {
    setupTauri();
    const older: AutosavePayload = { ...SAMPLE, savedAt: '2026-06-13T00:00:00.000Z' };
    fakeInvoke
      .mockResolvedValueOnce('/appdata')              // listing: appDataDir
      .mockResolvedValueOnce([                        // listing: read_dir
        { name: 'doc-1.starr' },
        { name: 'doc-2.starr' },
        { name: 'misc.png' },
        { name: 'subdir' },
      ])
      // doc-1 read: appDataDir + read_text_file
      .mockResolvedValueOnce('/appdata').mockResolvedValueOnce(JSON.stringify(SAMPLE))
      // doc-2 read: appDataDir + read_text_file
      .mockResolvedValueOnce('/appdata').mockResolvedValueOnce(JSON.stringify(older));
    const entries = await listNativeAutosaves();
    // Newest-first ordering.
    expect(entries.map((e) => e.docId)).toEqual(['doc-1', 'doc-2']);
    expect(entries[0]).toEqual({
      docId: 'doc-1',
      savedAt: SAMPLE.savedAt,
      docName: 'Garland',
      layerCount: 1,
      featureCount: 2,
    });
  });

  it('one malformed entry doesn\'t hide the rest', async () => {
    setupTauri();
    fakeInvoke
      .mockResolvedValueOnce('/appdata')
      .mockResolvedValueOnce([
        { name: 'doc-1.starr' },
        { name: 'broken.starr' },
      ])
      .mockResolvedValueOnce('/appdata').mockResolvedValueOnce(JSON.stringify(SAMPLE))
      .mockResolvedValueOnce('/appdata').mockResolvedValueOnce('not json');
    const entries = await listNativeAutosaves();
    expect(entries.map((e) => e.docId)).toEqual(['doc-1']);
  });
});

describe('autosave.ts public API — branches on isTauri()', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'lib', 'cad', 'persistence', 'autosave.ts'),
    'utf8',
  );

  it('imports isTauri from the platform runtime', () => {
    expect(SRC).toMatch(/import \{ isTauri \} from '\.\.\/platform\/runtime'/);
  });

  it('writeAutosave dynamically imports native-autosave under Tauri', () => {
    expect(SRC).toMatch(
      /writeAutosave[\s\S]*?if \(isTauri\(\)\) \{\s*\n\s*const \{ writeNativeAutosave \} = await import\('\.\/native-autosave'\)/,
    );
  });

  it('readAutosave dynamically imports native-autosave under Tauri', () => {
    expect(SRC).toMatch(
      /readAutosave[\s\S]*?if \(isTauri\(\)\) \{\s*\n\s*const \{ readNativeAutosave \} = await import\('\.\/native-autosave'\)/,
    );
  });

  it('clearAutosave dynamically imports native-autosave under Tauri', () => {
    expect(SRC).toMatch(
      /clearAutosave[\s\S]*?if \(isTauri\(\)\) \{\s*\n\s*const \{ clearNativeAutosave \} = await import\('\.\/native-autosave'\)/,
    );
  });

  it('listAutosaves under Tauri merges native + web entries (native wins on conflicts)', () => {
    expect(SRC).toMatch(/Promise\.all\(\[\s*\n\s*listNativeAutosaves\(\),\s*\n\s*listWebAutosaves\(\),\s*\n\s*\]\)/);
    expect(SRC).toMatch(/const seenDocIds = new Set\(native\.map\(\(e\) => e\.docId\)\)/);
    expect(SRC).toMatch(/web\.filter\(\(e\) => !seenDocIds\.has\(e\.docId\)\)/);
  });
});

describe('Rust capability — Slice T6 grants', () => {
  const CAP = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '..', '..', 'src-tauri', 'capabilities', 'default.json'),
      'utf8',
    ),
  );

  it('grants mkdir / remove / read_dir + path:default for the autosave flow', () => {
    expect(CAP.permissions).toContain('fs:allow-mkdir');
    expect(CAP.permissions).toContain('fs:allow-remove');
    expect(CAP.permissions).toContain('fs:allow-read-dir');
    expect(CAP.permissions).toContain('path:default');
  });
});
