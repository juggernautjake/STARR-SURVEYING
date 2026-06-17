// __tests__/cad/ui/canvas-viewport-tool-selectors.test.ts
//
// cad-desktop-tauri-and-perf Slice P6j (tool half) — the final
// of the four CanvasViewport store cuts. Drop `useToolStore()`
// in favor of per-field selectors for the three render-time
// reads (`activeTool` for the cursor-swap useEffect dep + the
// floating-panel JSX conditionals, `perpStartPoint` for the
// PERPENDICULAR tool's panel, `offsetSourceId` for the OFFSET
// tool's panel). The remaining ~140 callback + rAF call sites
// SED-converted to `useToolStore.getState().X`.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
  'utf8',
);

describe('CanvasViewport — P6j tool sub', () => {
  it('drops `const toolStore = useToolStore();`', () => {
    expect(SRC).not.toMatch(/const toolStore = useToolStore\(\);/);
  });

  it('reads `activeTool` / `perpStartPoint` / `offsetSourceId` via per-field selectors', () => {
    expect(SRC).toMatch(/const activeTool = useToolStore\(\(s\) => s\.state\.activeTool\);/);
    expect(SRC).toMatch(/const perpStartPoint = useToolStore\(\(s\) => s\.state\.perpStartPoint\);/);
    expect(SRC).toMatch(/const offsetSourceId = useToolStore\(\(s\) => s\.state\.offsetSourceId\);/);
  });

  it('the floating panels read off the per-field selectors, not the dropped local', () => {
    expect(SRC).toMatch(/activeTool === 'PERPENDICULAR' && perpStartPoint/);
    expect(SRC).toMatch(/activeTool === 'OFFSET' && offsetSourceId/);
  });

  it('no bare `toolStore.X` member access leftover', () => {
    expect(SRC).not.toMatch(/(?:^|[^a-zA-Z_.])toolStore\.[a-zA-Z]/);
  });

  it('callbacks read tool actions via `useToolStore.getState().X`', () => {
    expect(SRC).toMatch(/useToolStore\.getState\(\)\.clearDrawingPoints/);
    expect(SRC).toMatch(/useToolStore\.getState\(\)\.addDrawingPoint/);
    expect(SRC).toMatch(/useToolStore\.getState\(\)\.setOffsetSourceId/);
    expect(SRC).toMatch(/useToolStore\.getState\(\)\.clearPerp/);
  });
});
