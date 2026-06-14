// __tests__/desktop/native-file-open.test.ts
//
// cad-desktop-tauri-and-perf Slice T4 — native file-open helper.
// The TS-side helper wraps Tauri's `plugin:dialog|open` +
// `plugin:fs|read_text_file` IPCs in the same async shape the
// existing web `<input type="file">` → `file.text()` flow uses, so
// a caller can branch on `isTauri()` without otherwise touching its
// logic. Tests inject a fake `invoke` so they don't need a real
// shell.

import './setup-window-stub';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { __unsafeSetTauriInternalsForTests } from '@/lib/cad/platform/runtime';
import {
  DEFAULT_CAD_FILTERS,
  openCadFileViaPlatform,
  openFileViaTauri,
} from '@/lib/cad/persistence/native-file';

const fakeInvoke = vi.fn();

afterEach(() => {
  __unsafeSetTauriInternalsForTests(undefined);
  fakeInvoke.mockReset();
});

describe('DEFAULT_CAD_FILTERS — survey-file shape', () => {
  it('leads with the .starr / .trv / .csv catch-all so the default selection is most useful', () => {
    expect(DEFAULT_CAD_FILTERS[0]).toEqual({
      name: 'Survey files',
      extensions: ['starr', 'trv', 'csv'],
    });
  });

  it('offers each individual format as a separate filter', () => {
    const names = DEFAULT_CAD_FILTERS.map((f) => f.name);
    expect(names).toContain('STARR document');
    expect(names).toContain('Traverse PC');
    expect(names).toContain('Comma-separated values');
  });

  it('ends with an "All files" escape hatch', () => {
    const last = DEFAULT_CAD_FILTERS[DEFAULT_CAD_FILTERS.length - 1];
    expect(last.name).toBe('All files');
    expect(last.extensions).toEqual(['*']);
  });

  it('every extension is lowercase + no leading dot (Tauri shape)', () => {
    for (const filter of DEFAULT_CAD_FILTERS) {
      for (const ext of filter.extensions) {
        if (ext === '*') continue;
        expect(ext).toBe(ext.toLowerCase());
        expect(ext.startsWith('.')).toBe(false);
      }
    }
  });
});

describe('openCadFileViaPlatform — boundary', () => {
  it('returns null when no Tauri runtime is present (web build)', async () => {
    __unsafeSetTauriInternalsForTests(undefined);
    const result = await openCadFileViaPlatform();
    expect(result).toBeNull();
  });

  it('throws when Tauri is detected but invoke is missing (broken bootstrap)', async () => {
    // Cast through unknown so the test can simulate a half-injected
    // global the way `runtime.ts` does in its own coverage.
    __unsafeSetTauriInternalsForTests({} as never);
    await expect(openCadFileViaPlatform()).rejects.toThrow(
      /__TAURI_INTERNALS__\.invoke is missing/,
    );
  });

  it('round-trips dialog → fs through __TAURI_INTERNALS__.invoke', async () => {
    // QA hardening — the helper now sniffs the file size via
    // `plugin:fs|stat` between the dialog reply and the text read so
    // a hasty pick of a 200 MB+ file errors loudly instead of OOMing
    // the WebView. The size-sniff slot lands at call #2.
    fakeInvoke
      .mockResolvedValueOnce('/tmp/survey/garland.trv')   // dialog returns the path
      .mockResolvedValueOnce({ size: 32 })                // fs stat (sniff size)
      .mockResolvedValueOnce('999,begin\n#,POINTS\n');    // fs returns the contents
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    const result = await openCadFileViaPlatform();
    expect(result).toEqual({
      path: '/tmp/survey/garland.trv',
      name: 'garland.trv',
      contents: '999,begin\n#,POINTS\n',
    });
    expect(fakeInvoke).toHaveBeenNthCalledWith(1, 'plugin:dialog|open', expect.any(Object));
    expect(fakeInvoke).toHaveBeenLastCalledWith('plugin:fs|read_text_file', {
      path: '/tmp/survey/garland.trv',
    });
  });

  it('throws when the picked file exceeds NATIVE_FILE_MAX_BYTES', async () => {
    fakeInvoke
      .mockResolvedValueOnce('/tmp/huge.csv')
      .mockResolvedValueOnce({ size: 250 * 1024 * 1024 });   // 250 MB > cap
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    await expect(openCadFileViaPlatform()).rejects.toThrow(
      /tops out at .* MB/,
    );
    // The text read MUST NOT fire when the size sniff already failed.
    const calls = fakeInvoke.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain('plugin:fs|read_text_file');
  });

  it('proceeds when the stat plugin is missing (graceful degradation)', async () => {
    fakeInvoke
      .mockResolvedValueOnce('/tmp/survey/garland.trv')
      .mockRejectedValueOnce(new Error('stat plugin not registered'))
      .mockResolvedValueOnce('999,begin\n');
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    const result = await openCadFileViaPlatform();
    expect(result?.contents).toBe('999,begin\n');
  });

  it('returns null when the user cancels the dialog', async () => {
    fakeInvoke.mockResolvedValueOnce(null);
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    const result = await openCadFileViaPlatform();
    expect(result).toBeNull();
    // fs read MUST NOT fire when the dialog was cancelled.
    expect(fakeInvoke).toHaveBeenCalledTimes(1);
  });

  it('treats non-string dialog replies as a cancellation (defensive)', async () => {
    fakeInvoke.mockResolvedValueOnce(['/tmp/a', '/tmp/b'] as never);
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    expect(await openCadFileViaPlatform()).toBeNull();
    expect(fakeInvoke).toHaveBeenCalledTimes(1);
  });
});

describe('openFileViaTauri — direct invoke-only entry', () => {
  it('passes filters / title / defaultPath through to the dialog plugin', async () => {
    fakeInvoke
      .mockResolvedValueOnce('C\\Users\\survey\\garland.starr')
      .mockResolvedValueOnce('{"id":"d","name":"d"}');
    const result = await openFileViaTauri(
      {
        filters: [{ name: 'STARR only', extensions: ['starr'] }],
        title: 'Open survey…',
        defaultPath: 'C\\Users\\survey',
      },
      fakeInvoke,
    );
    expect(result?.name).toBe('garland.starr');
    expect(result?.path).toBe('C\\Users\\survey\\garland.starr');
    expect(fakeInvoke.mock.calls[0]).toEqual([
      'plugin:dialog|open',
      {
        options: {
          multiple: false,
          directory: false,
          filters: [{ name: 'STARR only', extensions: ['starr'] }],
          title: 'Open survey…',
          defaultPath: 'C\\Users\\survey',
        },
      },
    ]);
  });

  it('extracts the base name from POSIX and Windows paths', async () => {
    fakeInvoke
      .mockResolvedValueOnce('/Users/jake/Documents/A B/garland.trv')
      .mockResolvedValueOnce('999,begin\n');
    const posix = await openFileViaTauri({}, fakeInvoke);
    expect(posix?.name).toBe('garland.trv');

    fakeInvoke.mockReset();
    fakeInvoke
      .mockResolvedValueOnce('C:\\survey\\garland.starr')
      .mockResolvedValueOnce('{}');
    const win = await openFileViaTauri({}, fakeInvoke);
    expect(win?.name).toBe('garland.starr');
  });

  it('uses DEFAULT_CAD_FILTERS when the caller omits filters', async () => {
    fakeInvoke
      .mockResolvedValueOnce('/tmp/x.starr')
      .mockResolvedValueOnce('{}');
    await openFileViaTauri({}, fakeInvoke);
    const call = fakeInvoke.mock.calls[0][1] as { options: { filters: typeof DEFAULT_CAD_FILTERS } };
    expect(call.options.filters).toBe(DEFAULT_CAD_FILTERS);
  });
});

describe('Rust shell — plugin registration', () => {
  // Source-locks against `src-tauri/Cargo.toml`, `lib.rs`, and the
  // capability file so a refactor of the Rust side can't silently
  // drop the IPC plumbing without showing up in the suite.
  const fs = require('node:fs');
  const path = require('node:path');
  const repoRoot = path.join(__dirname, '..', '..');
  const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

  it('Cargo.toml depends on tauri-plugin-dialog + tauri-plugin-fs v2', () => {
    const SRC = read('src-tauri/Cargo.toml');
    expect(SRC).toMatch(/tauri-plugin-dialog = "2"/);
    expect(SRC).toMatch(/tauri-plugin-fs = "2"/);
  });

  it('lib.rs registers both plugins on the builder chain', () => {
    const SRC = read('src-tauri/src/lib.rs');
    expect(SRC).toMatch(/\.plugin\(tauri_plugin_dialog::init\(\)\)/);
    expect(SRC).toMatch(/\.plugin\(tauri_plugin_fs::init\(\)\)/);
  });

  it('default capability grants dialog:allow-open + fs:allow-read-text-file', () => {
    const CAP = JSON.parse(read('src-tauri/capabilities/default.json'));
    expect(CAP.permissions).toContain('dialog:allow-open');
    expect(CAP.permissions).toContain('fs:allow-read-text-file');
    // The unbounded `fs:default` permission must NOT appear — that
    // would scope every plugin command to the entire filesystem.
    // Specific allow-* / scope grants land slice-by-slice (T5 adds
    // write, T6 adds the autosave path scope).
    expect(CAP.permissions).not.toContain('fs:default');
  });
});
