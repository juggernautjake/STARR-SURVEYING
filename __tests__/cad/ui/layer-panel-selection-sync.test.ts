// __tests__/cad/ui/layer-panel-selection-sync.test.ts
//
// cad-trv-fidelity — clicking a feature on the canvas reveals it in the
// Layers panel: the feature's layer + the full ancestry of feature
// groups (sublayers) it belongs to auto-expand, its row scrolls into
// view, and the layer/group rows highlight off `selectedIds`. The
// reverse (panel row → canvas) already selects via selectionStore.
// Source-locked (the panel is a DOM/zustand component).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'LayerPanel.tsx'),
  'utf8',
);

describe('panel ↔ canvas selection sync', () => {
  it('a panel row click selects the feature in the selection store', () => {
    // P6d converted the LayerPanel's selection callback from the
    // whole-store `selectionStore.select(...)` form to
    // `useSelectionStore.getState().select(...)` so the panel no
    // longer subscribes to every selection-store field. Accept
    // either form.
    expect(SRC).toMatch(/(selectionStore|useSelectionStore\.getState\(\))\.select\(featureId, mode\)/);
  });

  it('auto-expands the selected feature\'s layer + group ancestry on selection change', () => {
    expect(SRC).toMatch(/useEffect\(\(\) => \{[\s\S]*?selectedIds\.size === 0[\s\S]*?\}, \[selectionKey\]\)/);
    expect(SRC).toMatch(/layersToOpen\.add\(f\.layerId\)/);
    // Walks the feature-group parent chain so nested sublayers all open.
    expect(SRC).toMatch(/gid = groupById\[gid\]\.parentGroupId \?\? null/);
  });

  it('scrolls the selected feature row into view only when it is offscreen', () => {
    expect(SRC).toMatch(/data-feature-row="\$\{sel\}"/);
    // cad-ux-cleanup-pass Slice 1 — visibility check before scrolling
    // so the surveyor's panel scroll doesn't jump while they navigate.
    expect(SRC).toMatch(/row\.getBoundingClientRect\(\)/);
    expect(SRC).toMatch(/if \(top < 0 \|\| bottom > viewportH\)/);
    expect(SRC).toMatch(/row\.scrollIntoView\(\{ block: 'nearest' \}\)/);
  });

  it('the layer + group rows highlight when a contained feature is selected', () => {
    expect(SRC).toMatch(/layerFeatures\.some\(\(f\) => selectedIds\.has\(f\.id\)\)/);
    expect(SRC).toMatch(/groupFeatures\.some\(\(f\) => selectedIds\.has\(f\.id\)\)/);
  });
});

describe('cad-ux-cleanup-pass Slice 1 — auto-expand only tracks our own opens', () => {
  it('two refs track the layers + groups WE opened automatically', () => {
    expect(SRC).toMatch(/autoOpenedLayersRef = useRef<Set<string>>\(new Set\(\)\)/);
    expect(SRC).toMatch(/autoOpenedGroupsRef = useRef<Set<string>>\(new Set\(\)\)/);
  });

  it('skips ids that are already expanded so user-opened rows are NOT tracked as auto', () => {
    expect(SRC).toMatch(/for \(const id of layersToOpen\) \{\s*\n\s*if \(next\.has\(id\)\) continue;[\s\S]*?autoOpenedLayersRef\.current\.add\(id\)/);
    expect(SRC).toMatch(/for \(const id of groupsToOpen\) \{\s*\n\s*if \(next\.has\(id\)\) continue;[\s\S]*?autoOpenedGroupsRef\.current\.add\(id\)/);
  });

  it('collapses ALL auto-opened ids when the selection clears', () => {
    expect(SRC).toMatch(
      /if \(selectedIds\.size === 0\) \{[\s\S]*?for \(const id of autoLayers\) next\.delete\(id\)[\s\S]*?for \(const id of autoGroups\) next\.delete\(id\)/,
    );
    // Refs are reset to a fresh set after collapsing so the next
    // selection starts from a clean state.
    expect(SRC).toMatch(/autoOpenedLayersRef\.current = new Set\(\)/);
    expect(SRC).toMatch(/autoOpenedGroupsRef\.current = new Set\(\)/);
  });

  it('toggle handlers hand control back to the user by dropping the id from the auto-set', () => {
    expect(SRC).toMatch(
      /function toggleLayerExpand\(layerId: string\) \{[\s\S]*?autoOpenedLayersRef\.current\.delete\(layerId\)/,
    );
    expect(SRC).toMatch(
      /function toggleGroupExpand\(groupId: string\) \{[\s\S]*?autoOpenedGroupsRef\.current\.delete\(groupId\)/,
    );
  });
});
