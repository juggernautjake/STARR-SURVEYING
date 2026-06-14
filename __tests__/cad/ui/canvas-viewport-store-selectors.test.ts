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

  it('drops both the toolStore and drawingStore whole-store subs (P6j + P6k)', () => {
    // P6j dropped `useToolStore()`; P6k dropped `useDrawingStore()`.
    // After both land, CanvasViewport holds zero whole-store
    // subscriptions — every store read is per-field or
    // `useXStore.getState()` at call time.
    expect(SRC).not.toMatch(/const drawingStore = useDrawingStore\(\);/);
    expect(SRC).not.toMatch(/const toolStore = useToolStore\(\);/);
  });
});
