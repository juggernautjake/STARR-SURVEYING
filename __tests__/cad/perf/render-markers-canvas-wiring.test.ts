// __tests__/cad/perf/render-markers-canvas-wiring.test.ts
//
// cad-desktop-tauri-and-perf Slice N1b — the histogram helper
// ships in Slice N1, but we only get useful data once the
// renderer's hot phases call `measureRender`. This test
// source-locks the wiring inside `CanvasViewport.renderAll` so
// future refactors can't quietly drop the markers and silently
// blank out the Perf overlay.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    '..',
    '..',
    'app',
    'admin',
    'cad',
    'components',
    'CanvasViewport.tsx',
  ),
  'utf8',
);

describe('CanvasViewport — N1b measureRender wiring', () => {
  it("imports measureRender from the perf module", () => {
    expect(SRC).toMatch(
      /import \{ measureRender \} from '@\/lib\/cad\/perf\/render-markers'/,
    );
  });

  it('wraps the renderAll body in a top-level measureRender(\'renderAll\', …)', () => {
    expect(SRC).toMatch(/measureRender\('renderAll', \(\) => \{/);
  });

  it('measures the hot phases — features, image features, labels, selection', () => {
    expect(SRC).toMatch(/measureRender\('renderFeatures', renderFeatures\)/);
    expect(SRC).toMatch(/measureRender\('renderImageFeatures', renderImageFeatures\)/);
    expect(SRC).toMatch(/measureRender\('renderLabels', renderLabels\)/);
    expect(SRC).toMatch(/measureRender\('renderSelection', renderSelection\)/);
  });
});
