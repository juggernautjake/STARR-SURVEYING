// __tests__/cad/ui/property-panel-store-selectors.test.ts
//
// cad-desktop-tauri-and-perf Slice P6e — PropertyPanel React-
// boundary audit. Before this slice both component bodies
// (`PropertyPanel` and the inner `OffsetSourceSection`) called
// `useDrawingStore()` + `useSelectionStore()` with no selector,
// so every feature add / selection change / hover tick
// reconciled both subtrees. Convert to per-field selectors for
// render-time reads + `useXStore.getState()` for callbacks.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'PropertyPanel.tsx'),
  'utf8',
);

describe('PropertyPanel — P6e per-field selectors', () => {
  it('drops every whole-store subscription in both component bodies', () => {
    expect(SRC).not.toMatch(/const drawingStore = useDrawingStore\(\);/);
    expect(SRC).not.toMatch(/const selectionStore = useSelectionStore\(\);/);
  });

  it('the main panel reads `document`, `getFeature`, and `selectedIds` via per-field selectors', () => {
    expect(SRC).toMatch(/const doc = useDrawingStore\(\(s\) => s\.document\);/);
    expect(SRC).toMatch(/const getFeature = useDrawingStore\(\(s\) => s\.getFeature\);/);
    expect(SRC).toMatch(/const selectedIdsSet = useSelectionStore\(\(s\) => s\.selectedIds\);/);
  });

  it('OffsetSourceSection subscribes only to the `getFeature` action ref', () => {
    expect(SRC).toMatch(
      /function OffsetSourceSection\(\{ feature \}: \{ feature: Feature \}\) \{[\s\S]*?const getFeature = useDrawingStore\(\(s\) => s\.getFeature\);/,
    );
  });

  it('routes every callback through `useXStore.getState()` so no bare locals remain', () => {
    expect(SRC).not.toMatch(/(?:^|[^a-zA-Z_.])drawingStore\.[a-zA-Z]/);
    expect(SRC).not.toMatch(/(?:^|[^a-zA-Z_.])selectionStore\.[a-zA-Z]/);
  });

  it('callback paths use `useDrawingStore.getState()` for the hot mutations', () => {
    expect(SRC).toMatch(/useDrawingStore\.getState\(\)\.updateFeature/);
    expect(SRC).toMatch(/useDrawingStore\.getState\(\)\.updateFeatureGeometry/);
    expect(SRC).toMatch(/useSelectionStore\.getState\(\)\.select/);
  });

  it('drops the stale `const { document: doc } = drawingStore` destructure mid-component', () => {
    expect(SRC).not.toMatch(/const \{ document: doc \} = drawingStore;/);
  });
});
