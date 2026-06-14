// __tests__/cad/ui/canvas-viewport-drawing-selectors.test.ts
//
// cad-desktop-tauri-and-perf Slice P6k — the LAST whole-store
// sub in CanvasViewport. `useDrawingStore()` had the biggest
// blast radius: every feature add / update fired through it,
// and AI runs + bulk imports do that many ticks per second.
// Subscribe to the narrow render-time fields via per-field
// selectors; route the ~172 callback + rAF call sites through
// `useDrawingStore.getState().X`.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
  'utf8',
);

describe('CanvasViewport — P6k drawing sub gone', () => {
  it('drops `const drawingStore = useDrawingStore();`', () => {
    expect(SRC).not.toMatch(/const drawingStore = useDrawingStore\(\);/);
  });

  it('subscribes to the four narrow render-time fields via per-field selectors', () => {
    expect(SRC).toMatch(/const codeDisplayMode = useDrawingStore\(\(s\) => s\.document\.settings\.codeDisplayMode\);/);
    expect(SRC).toMatch(/const displayPreferences = useDrawingStore\(\(s\) => s\.document\.settings\.displayPreferences\);/);
    expect(SRC).toMatch(/const drawingRotationDeg = useDrawingStore\(\(s\) => s\.document\.settings\.drawingRotationDeg \?\? 0\);/);
    expect(SRC).toMatch(/const layerOrderLen = useDrawingStore\(\(s\) => s\.document\.layerOrder\.length\);/);
  });

  it('the JSX-level reads bind to the per-field selectors, not the dropped local', () => {
    expect(SRC).toMatch(/const hasNoLayers = layerOrderLen === 0;/);
    expect(SRC).toMatch(/displayPrefs=\{displayPreferences \?\? DEFAULT_DISPLAY_PREFERENCES\}/);
    expect(SRC).toMatch(/const rotDeg = drawingRotationDeg;/);
  });

  it('no bare `drawingStore.X` member access leftover', () => {
    expect(SRC).not.toMatch(/(?:^|[^a-zA-Z_.])drawingStore\.[a-zA-Z]/);
  });

  it('callbacks read drawing-store actions via `useDrawingStore.getState().X`', () => {
    expect(SRC).toMatch(/useDrawingStore\.getState\(\)\.getFeature/);
    expect(SRC).toMatch(/useDrawingStore\.getState\(\)\.getVisibleFeatures/);
    expect(SRC).toMatch(/useDrawingStore\.getState\(\)\.updateFeature/);
    expect(SRC).toMatch(/useDrawingStore\.getState\(\)\.addFeature/);
  });
});
