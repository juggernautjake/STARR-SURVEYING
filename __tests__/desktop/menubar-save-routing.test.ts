// __tests__/desktop/menubar-save-routing.test.ts
//
// cad-desktop-tauri-and-perf Slice T5b — MenuBar's `saveLocalCopy`
// now branches on `isTauri()`: under Tauri it routes through the
// native Save-As dialog (or `saveCadFileToPath` for a silent Save
// when the SaveTarget remembered a path), and on the web it falls
// through to the existing URL-blob + anchor-click download. The
// SaveTarget store learned an optional `path` field on the local
// variant so the silent-save loop has a destination to remember.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('SaveTarget store — Slice T5b local-path field', () => {
  const SRC = read('lib/cad/store/save-target-store.ts');

  it("extends the `local` variant with `path?: string | null`", () => {
    expect(SRC).toMatch(/kind: 'local'; name: string; path\?: string \| null \}/);
  });

  it('setLocalTarget accepts an optional path that defaults to null', () => {
    expect(SRC).toMatch(/setLocalTarget: \(docId: string, name: string, path\?: string \| null\) => void/);
    expect(SRC).toMatch(/path: path \?\? null/);
  });
});

describe('MenuBar — Slice T5b imports', () => {
  const SRC = read('app/admin/cad/components/MenuBar.tsx');

  it('pulls in saveCadFileViaPlatform + saveCadFileToPath from native-save', () => {
    expect(SRC).toMatch(
      /import \{ saveCadFileViaPlatform, saveCadFileToPath \} from '@\/lib\/cad\/persistence\/native-save'/,
    );
  });
});

describe('MenuBar — saveLocalCopy branches on isTauri()', () => {
  const SRC = read('app/admin/cad/components/MenuBar.tsx');

  it('saveLocalCopy is now async (the Tauri path awaits IPC)', () => {
    expect(SRC).toMatch(/async function saveLocalCopy\(silentName\?: string\) \{/);
  });

  it('checks isTauri() at the top + still serializes contents through the existing payload shape', () => {
    expect(SRC).toMatch(/const payload = \{ version: '1\.0', application: 'starr-cad', document: doc \};/);
    expect(SRC).toMatch(/const contents = JSON\.stringify\(payload, null, 2\);/);
    // Tauri branch sits AFTER contents are prepared (so it can be
    // passed straight to the native save helper).
    const tauriIdx = SRC.indexOf('if (isTauri()) {');
    const contentsIdx = SRC.indexOf("const contents = JSON.stringify(payload");
    expect(contentsIdx).toBeGreaterThan(0);
    expect(tauriIdx).toBeGreaterThan(contentsIdx);
  });

  it('silent Save + a remembered path writes straight back via saveCadFileToPath', () => {
    expect(SRC).toMatch(
      /silentName && rememberedPath\s*\n\s*\? await saveCadFileToPath\(rememberedPath, contents\)/,
    );
  });

  it('Save-As (no silentName / no remembered path) prompts via saveCadFileViaPlatform with `${name}.starr`', () => {
    expect(SRC).toMatch(
      /: await saveCadFileViaPlatform\(\{ defaultPath: `\$\{name\}\.starr` \}, contents\)/,
    );
  });

  it('persists the returned path on the SaveTarget store so the next Save is silent', () => {
    expect(SRC).toMatch(
      /setLocalTarget\(doc\.id, baseName, result\.path\)/,
    );
  });

  it('strips the `.starr` extension before storing the display name', () => {
    expect(SRC).toMatch(/result\.name\.replace\(\/\\\.starr\$\/i, ''\)/);
  });

  it('returns silently when the user cancels the Save dialog (no clean / target writes)', () => {
    expect(SRC).toMatch(/if \(!result\) return;[\s\S]*?drawingStore\.markClean\(\);/);
  });

  it('the web branch is preserved verbatim — URL-blob + anchor click + markClean + setLocalTarget(name)', () => {
    expect(SRC).toMatch(/const blob = new Blob\(\[contents\], \{ type: 'application\/json' \}\);/);
    expect(SRC).toMatch(/const a = Object\.assign\(document\.createElement\('a'\), \{ href: url, download: `\$\{name\}\.starr` \}\);/);
    // Web path keeps the two-arg setLocalTarget — no path persisted
    // because the browser download has no persistent destination.
    expect(SRC).toMatch(/useSaveTargetStore\.getState\(\)\.setLocalTarget\(doc\.id, name\);/);
  });
});
