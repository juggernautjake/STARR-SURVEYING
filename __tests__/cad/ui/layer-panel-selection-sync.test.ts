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
    expect(SRC).toMatch(/selectionStore\.select\(featureId, mode\)/);
  });

  it('auto-expands the selected feature\'s layer + group ancestry on selection change', () => {
    expect(SRC).toMatch(/useEffect\(\(\) => \{[\s\S]*?selectedIds\.size === 0[\s\S]*?\}, \[selectionKey\]\)/);
    expect(SRC).toMatch(/layersToOpen\.add\(f\.layerId\)/);
    // Walks the feature-group parent chain so nested sublayers all open.
    expect(SRC).toMatch(/gid = groupById\[gid\]\.parentGroupId \?\? null/);
    expect(SRC).toMatch(/setExpandedLayers\(\(prev\) => new Set\(\[\.\.\.prev, \.\.\.layersToOpen\]\)\)/);
    expect(SRC).toMatch(/setExpandedGroups\(\(prev\) => new Set\(\[\.\.\.prev, \.\.\.groupsToOpen\]\)\)/);
  });

  it('scrolls the selected feature row into view', () => {
    expect(SRC).toMatch(/data-feature-row="\$\{sel\}"/);
    expect(SRC).toMatch(/scrollIntoView\(\{ block: 'nearest' \}\)/);
  });

  it('the layer + group rows highlight when a contained feature is selected', () => {
    expect(SRC).toMatch(/layerFeatures\.some\(\(f\) => selectedIds\.has\(f\.id\)\)/);
    expect(SRC).toMatch(/groupFeatures\.some\(\(f\) => selectedIds\.has\(f\.id\)\)/);
  });
});
