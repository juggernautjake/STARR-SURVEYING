// __tests__/desktop/menubar-open-routing.test.ts
//
// cad-desktop-tauri-and-perf Slice T4b — MenuBar's `openFileDialog`
// now branches on `isTauri()` and feeds both the native + web paths
// through a shared `processOpenedCadFile(name, text)` helper. This
// test source-locks the wiring so a future refactor of MenuBar
// can't silently drop the Tauri path or duplicate the loader chain.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
  'utf8',
);

describe('MenuBar — Slice T4b imports', () => {
  it('pulls in isTauri + openCadFileViaPlatform from the platform / persistence modules', () => {
    expect(SRC).toMatch(/import \{ isTauri \} from '@\/lib\/cad\/platform\/runtime'/);
    expect(SRC).toMatch(
      /import \{ openCadFileViaPlatform \} from '@\/lib\/cad\/persistence\/native-file'/,
    );
  });
});

describe('MenuBar — processOpenedCadFile extraction', () => {
  it('declares an async helper that takes (name, text)', () => {
    expect(SRC).toMatch(/async function processOpenedCadFile\(name: string, text: string\)/);
  });

  it('the dispatch chain reads `name` + `text` parameters (no `file.name` / `file.text()` references inside)', () => {
    // Grab the body of processOpenedCadFile by slicing from its
    // declaration to the next top-level function (`openFileDialog`).
    const start = SRC.indexOf('async function processOpenedCadFile');
    expect(start).toBeGreaterThan(-1);
    const end = SRC.indexOf('function openFileDialog()', start);
    expect(end).toBeGreaterThan(start);
    const body = SRC.slice(start, end);
    expect(body).not.toMatch(/file\.text\(\)/);
    expect(body).not.toMatch(/file\.name/);
    expect(body).toMatch(/importTrvFromText\(text, \{ fileName: name \}\)/);
    expect(body).toMatch(/detectFileFormat\(name, text\)/);
    expect(body).toMatch(/Open \$\{name\} as a Traverse PC TRV\?/);
  });

  it('still calls setFileLoading(false) in its outer finally', () => {
    expect(SRC).toMatch(
      /async function processOpenedCadFile[\s\S]*?\} finally \{\s*\n\s*setFileLoading\(false\);\s*\n\s*\}/,
    );
  });
});

describe('MenuBar — openFileDialog routes through both branches', () => {
  it('checks isTauri() at the top and dispatches openCadFileViaPlatform', () => {
    expect(SRC).toMatch(
      /function openFileDialog\(\) \{[\s\S]*?if \(isTauri\(\)\) \{[\s\S]*?openCadFileViaPlatform\(\)/,
    );
  });

  it('the Tauri branch calls setFileLoading(true) only after the dialog returned a result', () => {
    // Setting the overlay BEFORE the dialog opens would block the
    // user from seeing the native file picker. Match the order:
    // result = openCadFileViaPlatform → if (!result) return →
    // setFileLoading(true) → processOpenedCadFile.
    expect(SRC).toMatch(
      /result = await openCadFileViaPlatform\(\)[\s\S]*?if \(!result\) return;[\s\S]*?setFileLoading\(true\);[\s\S]*?await processOpenedCadFile\(result\.name, result\.contents\)/,
    );
  });

  it('the Tauri dialog error path surfaces through the existing file-load diagnostic pipeline', () => {
    expect(SRC).toMatch(
      /catch \(err\) \{[\s\S]*?buildFileLoadDiagnostic\('', '', err, 'sniff'\)[\s\S]*?reportFileLoadError\(diag\)/,
    );
  });

  it('the web branch still creates an <input type="file"> and ends with input.click()', () => {
    // Make sure the original behavior didn't get amputated when we
    // extracted the dispatch body.
    expect(SRC).toMatch(/document\.createElement\('input'\)[\s\S]*?accept: '\.starr,\.TRV,\.trv'/);
    expect(SRC).toMatch(/input\.click\(\);\s*\n\s*\}/);
  });

  it('the web branch routes its loaded text through the same processOpenedCadFile helper', () => {
    expect(SRC).toMatch(
      /text = await file\.text\(\)[\s\S]*?await processOpenedCadFile\(file\.name, text\)/,
    );
  });
});
