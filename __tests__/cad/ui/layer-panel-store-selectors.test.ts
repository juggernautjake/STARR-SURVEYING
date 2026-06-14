// __tests__/cad/ui/layer-panel-store-selectors.test.ts
//
// cad-desktop-tauri-and-perf Slice P6d — LayerPanel React-boundary
// audit. Before this slice the panel called `useDrawingStore()`
// and `useSelectionStore()` with no selector, so every feature
// add / selection change / hover tick reconciled the entire
// tree (which paints hundreds of layer/feature rows on a real
// drawing). Convert to per-field selectors for the render-time
// reads + `useXStore.getState()` for the callback action calls.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'LayerPanel.tsx'),
  'utf8',
);

describe('LayerPanel — P6d per-field selectors', () => {
  it('drops the whole-store `useDrawingStore()` + `useSelectionStore()` subscriptions', () => {
    expect(SRC).not.toMatch(/const store = useDrawingStore\(\);/);
    expect(SRC).not.toMatch(/const selectionStore = useSelectionStore\(\);/);
  });

  it('reads `document` and `activeLayerId` via per-field selectors', () => {
    expect(SRC).toMatch(/const doc = useDrawingStore\(\(s\) => s\.document\);/);
    expect(SRC).toMatch(/const activeLayerId = useDrawingStore\(\(s\) => s\.activeLayerId\);/);
  });

  it('reads the four selection fields via per-field selectors', () => {
    expect(SRC).toMatch(/useSelectionStore\(\(s\) => s\.selectedIds\)/);
    expect(SRC).toMatch(/useSelectionStore\(\(s\) => s\.hoveredId\)/);
    expect(SRC).toMatch(/useSelectionStore\(\(s\) => s\.hoveredTBElem\)/);
    expect(SRC).toMatch(/useSelectionStore\(\(s\) => s\.selectedTBElem\)/);
  });

  it('routes every callback through `useXStore.getState()` so no stale local references remain', () => {
    // The whole-store locals `store` and `selectionStore` are gone,
    // so any leftover `store.X(...)` / `selectionStore.X(...)`
    // would now reference an undeclared identifier.
    expect(SRC).not.toMatch(/(?:^|[^a-zA-Z_.])selectionStore\.[a-zA-Z]/);
    // The standalone `store.X` token can't appear anymore (the
    // local binding is gone). The destructure `useDrawingStore`
    // identifier itself can match elsewhere; we're guarding the
    // bare local. Match boundary explicitly.
    expect(SRC).not.toMatch(/(?:^|[^a-zA-Z_.])store\.[a-zA-Z]/);
  });

  it('uses `useDrawingStore.getState().X` for at least the eye-toggle + rename + layer-mutation callbacks', () => {
    expect(SRC).toMatch(/useDrawingStore\.getState\(\)\.unhideFeature/);
    expect(SRC).toMatch(/useDrawingStore\.getState\(\)\.hideFeature/);
    expect(SRC).toMatch(/useDrawingStore\.getState\(\)\.updateLayer/);
    expect(SRC).toMatch(/useDrawingStore\.getState\(\)\.addLayer/);
  });
});
