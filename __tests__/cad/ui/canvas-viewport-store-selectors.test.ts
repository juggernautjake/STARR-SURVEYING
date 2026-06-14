// __tests__/cad/ui/canvas-viewport-store-selectors.test.ts
//
// cad-desktop-tauri-and-perf Slice P6g — CanvasViewport React
// boundary audit, continued from P6f. Drop the two remaining
// PURE-callback whole-store subs (selection + undo). Both are
// only used from event handlers and the rAF render loop; the
// component never reads selection or undo state at React render
// time, so the subscriptions were pure wake-up cost.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
  'utf8',
);

describe('CanvasViewport — P6g selection + undo subs gone', () => {
  it('drops `const selectionStore = useSelectionStore();`', () => {
    expect(SRC).not.toMatch(/const selectionStore = useSelectionStore\(\);/);
  });

  it('drops `const undoStore = useUndoStore();`', () => {
    expect(SRC).not.toMatch(/const undoStore = useUndoStore\(\);/);
  });

  it('no bare `selectionStore.X` / `undoStore.X` member access leftover', () => {
    expect(SRC).not.toMatch(/(?:^|[^a-zA-Z_.])selectionStore\.[a-zA-Z]/);
    expect(SRC).not.toMatch(/(?:^|[^a-zA-Z_.])undoStore\.[a-zA-Z]/);
  });

  it('callbacks read selection + undo via `useXStore.getState()`', () => {
    expect(SRC).toMatch(/useSelectionStore\.getState\(\)\.select/);
    expect(SRC).toMatch(/useSelectionStore\.getState\(\)\.selectedIds/);
    expect(SRC).toMatch(/useUndoStore\.getState\(\)\.pushUndo/);
  });

  it('useCallback / useEffect dep arrays drop the dead store identifiers', () => {
    expect(SRC).not.toMatch(/\[[^\]]*\bselectionStore\b[^\]]*\]/);
    expect(SRC).not.toMatch(/\[[^\]]*\bundoStore\b[^\]]*\]/);
  });

  it('keeps the drawingStore sub for now (render-time reads — handled in P6j-drawing)', () => {
    // P6j dropped `useToolStore()` and replaced it with per-field
    // selectors; the drawingStore sub still lives at the top of
    // the component until the per-field conversion of its
    // render-time reads lands in a later slice.
    expect(SRC).toMatch(/const drawingStore = useDrawingStore\(\);/);
    expect(SRC).not.toMatch(/const toolStore = useToolStore\(\);/);
  });
});
