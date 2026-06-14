// __tests__/cad/ui/menu-bar-drawing-selection-selectors.test.ts
//
// cad-desktop-tauri-and-perf Slice P6h — MenuBar React boundary
// audit, continued. After P6c killed the tool + viewport
// subscriptions, the MenuBar still subscribed to `drawingStore`
// and `selectionStore` as whole stores. Both have tiny
// render-time read surfaces (isDirty / document.name for the
// title bar; selectedIds.size for three Export Selection
// disabled gates) and large callback surfaces (~50 mutations
// across both stores). Convert to per-field selectors for the
// render reads + `useXStore.getState()` for every callback.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
  'utf8',
);

describe('MenuBar — P6h per-field selectors (drawing + selection)', () => {
  it('drops the `useDrawingStore()` + `useSelectionStore()` whole-store subs', () => {
    expect(SRC).not.toMatch(/const drawingStore = useDrawingStore\(\);/);
    expect(SRC).not.toMatch(/const selectionStore = useSelectionStore\(\);/);
  });

  it('reads `isDirty` + `document` via per-field selectors', () => {
    expect(SRC).toMatch(/const isDirty = useDrawingStore\(\(s\) => s\.isDirty\);/);
    expect(SRC).toMatch(/const doc = useDrawingStore\(\(s\) => s\.document\);/);
  });

  it('reads selection ids via a per-field selector', () => {
    expect(SRC).toMatch(/const selectedIds = useSelectionStore\(\(s\) => s\.selectedIds\);/);
  });

  it('drops every bare `drawingStore.X` / `selectionStore.X` member access', () => {
    expect(SRC).not.toMatch(/(?:^|[^a-zA-Z_.])drawingStore\.[a-zA-Z]/);
    expect(SRC).not.toMatch(/(?:^|[^a-zA-Z_.])selectionStore\.[a-zA-Z]/);
  });

  it('callbacks route through `useDrawingStore.getState()` / `useSelectionStore.getState()`', () => {
    expect(SRC).toMatch(/useDrawingStore\.getState\(\)\.updateSettings/);
    expect(SRC).toMatch(/useDrawingStore\.getState\(\)\.addFeatures/);
    expect(SRC).toMatch(/useSelectionStore\.getState\(\)\.deselectAll/);
  });

  it('Export Selection disabled gates read off the per-field `selectedIds` selector', () => {
    expect(SRC).toMatch(/disabled: selectedIds\.size === 0/);
  });

  it('the dirty + name display reads off the per-field selectors', () => {
    expect(SRC).toMatch(/\{isDirty && \(/);
    expect(SRC).toMatch(/\{doc\.name\}/);
  });
});
