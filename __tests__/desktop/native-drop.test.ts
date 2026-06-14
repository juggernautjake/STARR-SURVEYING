// __tests__/desktop/native-drop.test.ts
//
// cad-desktop-tauri-and-perf Slice T4c — OS-level drag-and-drop of
// survey files onto the Tauri shell. Pure helpers tested with fakes;
// MenuBar wiring source-locked.

import './setup-window-stub';
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  NATIVE_DROP_EXTENSIONS,
  basenameOf,
  isCadFilePath,
  readPathsAsCadFiles,
  registerNativeDropListener,
} from '@/lib/cad/persistence/native-drop';
import { __unsafeSetTauriInternalsForTests } from '@/lib/cad/platform/runtime';

const fakeInvoke = vi.fn();

afterEach(() => {
  __unsafeSetTauriInternalsForTests(undefined);
  fakeInvoke.mockReset();
});

describe('NATIVE_DROP_EXTENSIONS — matches the file-open filter set', () => {
  it('includes .starr / .trv / .csv exactly (no PDFs / DXFs to avoid silent misroutes)', () => {
    expect([...NATIVE_DROP_EXTENSIONS].sort()).toEqual(['csv', 'starr', 'trv']);
  });
});

describe('basenameOf — path tail extraction', () => {
  it('handles POSIX paths', () => {
    expect(basenameOf('/Users/jake/survey/garland.trv')).toBe('garland.trv');
  });

  it('handles Windows backslash paths', () => {
    expect(basenameOf('C:\\survey\\garland.starr')).toBe('garland.starr');
  });

  it('returns the input unchanged when there is no separator', () => {
    expect(basenameOf('garland.csv')).toBe('garland.csv');
  });
});

describe('isCadFilePath — extension filter', () => {
  it('accepts every NATIVE_DROP_EXTENSIONS member, case-insensitive', () => {
    expect(isCadFilePath('/tmp/x.starr')).toBe(true);
    expect(isCadFilePath('/tmp/x.STARR')).toBe(true);
    expect(isCadFilePath('/tmp/x.trv')).toBe(true);
    expect(isCadFilePath('/tmp/x.TRV')).toBe(true);
    expect(isCadFilePath('/tmp/x.csv')).toBe(true);
  });

  it('rejects unrelated extensions (the canvas image drop stays for those)', () => {
    expect(isCadFilePath('/tmp/x.png')).toBe(false);
    expect(isCadFilePath('/tmp/x.dxf')).toBe(false);
    expect(isCadFilePath('/tmp/x.pdf')).toBe(false);
  });

  it('rejects paths without an extension at all', () => {
    expect(isCadFilePath('/tmp/no-extension')).toBe(false);
  });
});

describe('readPathsAsCadFiles — reads via plugin:fs|read_text_file', () => {
  it('drops non-CAD extensions BEFORE issuing an invoke', async () => {
    fakeInvoke.mockResolvedValue('contents');
    const files = await readPathsAsCadFiles(['/tmp/x.png', '/tmp/y.dxf'], fakeInvoke);
    expect(files).toEqual([]);
    expect(fakeInvoke).not.toHaveBeenCalled();
  });

  it('reads each recognised path via plugin:fs|read_text_file', async () => {
    fakeInvoke
      .mockResolvedValueOnce('999,begin\n')
      .mockResolvedValueOnce('{"document":{}}');
    const files = await readPathsAsCadFiles(
      ['/tmp/a.trv', '/tmp/b.starr'],
      fakeInvoke,
    );
    expect(files).toEqual([
      { path: '/tmp/a.trv', name: 'a.trv', contents: '999,begin\n' },
      { path: '/tmp/b.starr', name: 'b.starr', contents: '{"document":{}}' },
    ]);
    expect(fakeInvoke).toHaveBeenCalledTimes(2);
    expect(fakeInvoke).toHaveBeenNthCalledWith(1, 'plugin:fs|read_text_file', { path: '/tmp/a.trv' });
    expect(fakeInvoke).toHaveBeenNthCalledWith(2, 'plugin:fs|read_text_file', { path: '/tmp/b.starr' });
  });

  it('a read failure on one file does NOT kill the rest of the batch', async () => {
    fakeInvoke
      .mockRejectedValueOnce(new Error('EACCES'))
      .mockResolvedValueOnce('999,begin\n');
    const files = await readPathsAsCadFiles(['/tmp/locked.trv', '/tmp/ok.trv'], fakeInvoke);
    expect(files).toEqual([
      { path: '/tmp/ok.trv', name: 'ok.trv', contents: '999,begin\n' },
    ]);
  });

  it('preserves input order in the returned list', async () => {
    fakeInvoke.mockResolvedValue('x');
    const files = await readPathsAsCadFiles(
      ['/tmp/c.trv', '/tmp/a.starr', '/tmp/b.csv'],
      fakeInvoke,
    );
    expect(files.map((f) => f.name)).toEqual(['c.trv', 'a.starr', 'b.csv']);
  });
});

describe('registerNativeDropListener — Tauri boundary', () => {
  it('returns null on the web build (no Tauri runtime)', async () => {
    __unsafeSetTauriInternalsForTests(undefined);
    const handler = vi.fn();
    const result = await registerNativeDropListener(handler);
    expect(result).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns null when Tauri is detected but invoke is missing', async () => {
    // Simulate a broken bootstrap (no `.invoke` on the global).
    __unsafeSetTauriInternalsForTests({} as never);
    const handler = vi.fn();
    const result = await registerNativeDropListener(handler);
    expect(result).toBeNull();
  });

  it('returns null when the @tauri-apps/api/webview module fails to load (test env)', async () => {
    // Real Tauri injects the global; the dynamic import for the
    // webview package fails in the test environment because the
    // package isn't installed. `registerNativeDropListener` swallows
    // that and returns null instead of throwing.
    __unsafeSetTauriInternalsForTests({ invoke: fakeInvoke });
    const handler = vi.fn();
    const result = await registerNativeDropListener(handler);
    expect(result).toBeNull();
  });
});

describe('MenuBar — Slice T4c useEffect wires the listener', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
    'utf8',
  );

  it('imports registerNativeDropListener from the native-drop module', () => {
    expect(SRC).toMatch(
      /import \{ registerNativeDropListener \} from '@\/lib\/cad\/persistence\/native-drop'/,
    );
  });

  it('mounts a useEffect that subscribes and feeds files through processOpenedCadFile', () => {
    expect(SRC).toMatch(
      /useEffect\(\(\) => \{[\s\S]*?registerNativeDropListener\(async \(files\) => \{[\s\S]*?await processOpenedCadFile\(file\.name, file\.contents\)/,
    );
  });

  it('calls setFileLoading(true) once per dropped file (matches the open-dialog ordering)', () => {
    expect(SRC).toMatch(
      /for \(const file of files\) \{\s*\n\s*setFileLoading\(true\);\s*\n\s*await processOpenedCadFile/,
    );
  });

  it('cleans up via the listener\'s unsubscribe on component unmount', () => {
    expect(SRC).toMatch(/return \(\) => \{[\s\S]*?if \(unlisten\) unlisten\(\);[\s\S]*?\}/);
  });
});
