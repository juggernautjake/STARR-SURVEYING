// __tests__/cad/ui/menu-bar-undo-ui-selectors.test.ts
//
// cad-desktop-tauri-and-perf Slice P6i — MenuBar React boundary
// audit, last two subs. Drop `useUndoStore()` + `useUIStore()`.
// Both have small render-time read surfaces (Edit menu disabled
// gates + descriptions; View menu show/hide labels), so the
// conversion is per-field selectors for the render reads and
// `useXStore.getState()` for the callbacks.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
  'utf8',
);

describe('MenuBar — P6i per-field selectors (undo + UI)', () => {
  it('drops the `useUndoStore()` + `useUIStore()` whole-store subs', () => {
    expect(SRC).not.toMatch(/const undoStore = useUndoStore\(\);/);
    expect(SRC).not.toMatch(/const uiStore = useUIStore\(\);/);
  });

  it('subscribes to the stack lengths so push/pop triggers a re-render', () => {
    expect(SRC).toMatch(/const undoStackLen = useUndoStore\(\(s\) => s\.undoStack\.length\);/);
    expect(SRC).toMatch(/const redoStackLen = useUndoStore\(\(s\) => s\.redoStack\.length\);/);
  });

  it('subscribes to the two UI flags via per-field selectors', () => {
    expect(SRC).toMatch(/const showLayerPanel = useUIStore\(\(s\) => s\.showLayerPanel\);/);
    expect(SRC).toMatch(/const showPropertyPanel = useUIStore\(\(s\) => s\.showPropertyPanel\);/);
  });

  it('derives can/canRedo from the stack lengths, not from method calls on a stale snapshot', () => {
    expect(SRC).toMatch(/const canUndo = undoStackLen > 0;/);
    expect(SRC).toMatch(/const canRedo = redoStackLen > 0;/);
    expect(SRC).toMatch(/disabled: !canUndo/);
    expect(SRC).toMatch(/disabled: !canRedo/);
  });

  it('reads undo/redo descriptions via `useUndoStore.getState()` after the length selectors force the re-render', () => {
    expect(SRC).toMatch(/const undoDesc = useUndoStore\.getState\(\)\.undoDescription\(\);/);
    expect(SRC).toMatch(/const redoDesc = useUndoStore\.getState\(\)\.redoDescription\(\);/);
  });

  it('Edit menu undo/redo actions read off `useUndoStore.getState()`', () => {
    expect(SRC).toMatch(/action: \(\) => useUndoStore\.getState\(\)\.undo\(\)/);
    expect(SRC).toMatch(/action: \(\) => useUndoStore\.getState\(\)\.redo\(\)/);
    expect(SRC).toMatch(/useUndoStore\.getState\(\)\.clear\(\)/);
  });

  it('View menu show/hide actions read off `useUIStore.getState()`', () => {
    expect(SRC).toMatch(/action: \(\) => useUIStore\.getState\(\)\.toggleLayerPanel\(\)/);
    expect(SRC).toMatch(/action: \(\) => useUIStore\.getState\(\)\.togglePropertyPanel\(\)/);
  });

  it('View menu labels read the per-field show/hide selectors', () => {
    expect(SRC).toMatch(/label: showLayerPanel \? 'Hide Layer Panel' : 'Show Layer Panel'/);
    expect(SRC).toMatch(/label: showPropertyPanel \? 'Hide Properties' : 'Show Properties'/);
  });

  it('no bare `undoStore.X` / `uiStore.X` member access leftover', () => {
    expect(SRC).not.toMatch(/(?:^|[^a-zA-Z_.])undoStore\.[a-zA-Z]/);
    expect(SRC).not.toMatch(/(?:^|[^a-zA-Z_.])uiStore\.[a-zA-Z]/);
  });
});
