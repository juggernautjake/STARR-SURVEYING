// __tests__/desktop/native-file-save.test.ts
//
// cad-desktop-tauri-and-perf Slice T5 — native file-save helper.
// Symmetric to the Slice T4 open helper: wraps `plugin:dialog|save`
// + `plugin:fs|write_text_file` through the runtime-injected
// `__TAURI_INTERNALS__.invoke`. Tests inject a fake invoke so they
// don't need a real Tauri shell. The path-only `saveCadFileToPath`
// companion lets a plain "Save" reuse a remembered path without
// re-prompting.

import './setup-window-stub';
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { __unsafeSetTauriInternalsForTests } from '@/lib/cad/platform/runtime';
import {
  saveCadFileToPath,
  saveCadFileViaPlatform,
  saveFileViaTauri,
} from '@/lib/cad/persistence/native-save';
import { DEFAULT_CAD_FILTERS } from '@/lib/cad/persistence/native-file';

const fakeInvoke = vi.fn();

afterEach(() => {
  __unsafeSetTauriInternalsForTests(undefined);
  fakeInvoke.mockReset();
});

describe('saveCadFileViaPlatform — Save-As boundary', () => {
  it('returns null on the web build (no Tauri runtime)', async () => {
    __unsafeSetTauriInternalsForTests(undefined);
    const result = await saveCadFileViaPlatform({ defaultPath: 'x.starr' }, '{}');
    expect(result).toBeNull();
  });

  it('throws when Tauri is detected but invoke is missing', async () => {
    __unsafeSetTauriInternalsForTests({} as never);
    await expect(
      saveCadFileViaPlatform({ defaultPath: 'x.starr' }, '{}'),
    ).rejects.toThrow(/__TAURI_INTERNALS__\.invoke is missing/);
  });

  it('round-trips dialog → fs through __TAURI_INTERNALS__.invoke', async () => {
    fakeInvoke
      .mockResolvedValueOnce('/Users/jake/Documents/garland.starr') // dialog returns the path
      .mockResolvedValueOnce(undefined);                            // fs write resolves
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    const result = await saveCadFileViaPlatform(
      { defaultPath: 'garland.starr' },
      '{"document":{}}',
    );
    expect(result).toEqual({
      path: '/Users/jake/Documents/garland.starr',
      name: 'garland.starr',
    });
    expect(fakeInvoke).toHaveBeenNthCalledWith(1, 'plugin:dialog|save', {
      options: {
        filters: DEFAULT_CAD_FILTERS,
        title: undefined,
        defaultPath: 'garland.starr',
      },
    });
    expect(fakeInvoke).toHaveBeenNthCalledWith(2, 'plugin:fs|write_text_file', {
      path: '/Users/jake/Documents/garland.starr',
      contents: '{"document":{}}',
    });
  });

  it('returns null when the user cancels the Save dialog (no fs write fires)', async () => {
    fakeInvoke.mockResolvedValueOnce(null);
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    const result = await saveCadFileViaPlatform({ defaultPath: 'x.starr' }, '{}');
    expect(result).toBeNull();
    expect(fakeInvoke).toHaveBeenCalledTimes(1);
  });

  it('treats non-string dialog replies as a cancellation', async () => {
    fakeInvoke.mockResolvedValueOnce(0 as never);
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    expect(await saveCadFileViaPlatform({}, '{}')).toBeNull();
    expect(fakeInvoke).toHaveBeenCalledTimes(1);
  });
});

describe('saveFileViaTauri — direct invoke-only entry', () => {
  it('forwards filters / title / defaultPath through to the dialog plugin', async () => {
    fakeInvoke
      .mockResolvedValueOnce('C\\Users\\Jake\\Documents\\garland.starr')
      .mockResolvedValueOnce(undefined);
    const result = await saveFileViaTauri(
      {
        filters: [{ name: 'STARR only', extensions: ['starr'] }],
        title: 'Save drawing…',
        defaultPath: 'garland.starr',
      },
      '{}',
      fakeInvoke,
    );
    expect(result?.name).toBe('garland.starr');
    expect(result?.path).toBe('C\\Users\\Jake\\Documents\\garland.starr');
    expect(fakeInvoke.mock.calls[0]).toEqual([
      'plugin:dialog|save',
      {
        options: {
          filters: [{ name: 'STARR only', extensions: ['starr'] }],
          title: 'Save drawing…',
          defaultPath: 'garland.starr',
        },
      },
    ]);
  });

  it('uses DEFAULT_CAD_FILTERS when the caller omits filters', async () => {
    fakeInvoke
      .mockResolvedValueOnce('/tmp/x.starr')
      .mockResolvedValueOnce(undefined);
    await saveFileViaTauri({}, '{}', fakeInvoke);
    const call = fakeInvoke.mock.calls[0][1] as { options: { filters: typeof DEFAULT_CAD_FILTERS } };
    expect(call.options.filters).toBe(DEFAULT_CAD_FILTERS);
  });

  it('extracts the basename from both POSIX and Windows paths', async () => {
    fakeInvoke
      .mockResolvedValueOnce('/Users/jake/Documents/A B/garland.starr')
      .mockResolvedValueOnce(undefined);
    const posix = await saveFileViaTauri({}, '{}', fakeInvoke);
    expect(posix?.name).toBe('garland.starr');

    fakeInvoke.mockReset();
    fakeInvoke
      .mockResolvedValueOnce('C:\\survey\\garland.starr')
      .mockResolvedValueOnce(undefined);
    const win = await saveFileViaTauri({}, '{}', fakeInvoke);
    expect(win?.name).toBe('garland.starr');
  });
});

describe('saveCadFileToPath — plain "Save" companion', () => {
  it('returns null on the web build', async () => {
    __unsafeSetTauriInternalsForTests(undefined);
    expect(await saveCadFileToPath('/tmp/x.starr', '{}')).toBeNull();
  });

  it('skips the dialog entirely and writes straight to the given path', async () => {
    fakeInvoke.mockResolvedValueOnce(undefined);
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    const result = await saveCadFileToPath('/tmp/garland.starr', '{}');
    expect(result).toEqual({ path: '/tmp/garland.starr', name: 'garland.starr' });
    expect(fakeInvoke).toHaveBeenCalledTimes(1);
    expect(fakeInvoke).toHaveBeenCalledWith('plugin:fs|write_text_file', {
      path: '/tmp/garland.starr',
      contents: '{}',
    });
  });

  it('throws when Tauri is detected but invoke is missing', async () => {
    __unsafeSetTauriInternalsForTests({} as never);
    await expect(saveCadFileToPath('/tmp/x.starr', '{}')).rejects.toThrow(
      /__TAURI_INTERNALS__\.invoke is missing/,
    );
  });
});

describe('Rust shell — capability grants', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

  it('default capability now also grants dialog:allow-save + fs:allow-write-text-file', () => {
    const CAP = JSON.parse(read('src-tauri/capabilities/default.json'));
    expect(CAP.permissions).toContain('dialog:allow-save');
    expect(CAP.permissions).toContain('fs:allow-write-text-file');
    // T4 grants stay intact.
    expect(CAP.permissions).toContain('dialog:allow-open');
    expect(CAP.permissions).toContain('fs:allow-read-text-file');
  });

  it('does NOT widen fs scope further — broader path scopes land in T6', () => {
    const CAP = JSON.parse(read('src-tauri/capabilities/default.json'));
    expect(CAP.permissions).not.toContain('fs:default');
    expect(CAP.permissions).not.toContain('fs:scope-resource-recursive');
  });
});
