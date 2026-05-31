// __tests__/cad/ui/layer-panel-nested-groups.test.ts
//
// cad-layer-grouping-and-context-menus Slice 3 — locks the recursive
// tree render in LayerPanel. Root-level groups are the only
// iteration source; nested groups are reached via `renderGroup`
// calling itself at `depth + 1`. Indentation is applied to the
// outer div via paddingLeft so all descendants stack cleanly.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'LayerPanel.tsx'),
  'utf8',
);

describe('LayerPanel — root-level filter for nested-group tree', () => {
  it('computes rootLayerGroups from layerGroups by parentGroupId == null', () => {
    expect(SRC).toMatch(
      /const rootLayerGroups = layerGroups\.filter\(\(g\) => \(g\.parentGroupId \?\? null\) === null\);/,
    );
  });

  it('iterates rootLayerGroups (not the flat layerGroups) for the tree render', () => {
    expect(SRC).toMatch(/rootLayerGroups\.map\(\(group\) => renderGroup\(group, 0\)\)/);
  });
});

describe('LayerPanel — recursive renderGroup helper', () => {
  it('declares renderGroup(group, depth) ⇒ React.ReactNode', () => {
    expect(SRC).toMatch(
      /const renderGroup = \(group: import\('@\/lib\/cad\/types'\)\.FeatureGroup, depth: number\): React\.ReactNode =>/,
    );
  });

  it('looks up child groups by matching parentGroupId === group.id', () => {
    expect(SRC).toMatch(
      /const childGroups = layerGroups\.filter\(\(g\) => \(g\.parentGroupId \?\? null\) === group\.id\);/,
    );
  });

  it('applies a per-depth indentation (12px per level) to the outer div via paddingLeft', () => {
    expect(SRC).toMatch(
      /style=\{depth > 0 \? \{ paddingLeft: `\$\{depth \* 0\.75\}rem` \} : undefined\}/,
    );
  });

  it('recurses into child groups at depth + 1 when the parent is expanded', () => {
    expect(SRC).toMatch(/childGroups\.map\(\(child\) => renderGroup\(child, depth \+ 1\)\)/);
  });

  it('renders child groups BEFORE member features (containers above leaves)', () => {
    // Match the expanded body — child groups first, then members.
    expect(SRC).toMatch(
      /isGroupExpanded && \(\s*<>\s*\{childGroups\.map[\s\S]*?\{groupFeatures\.map/,
    );
  });

  it('stamps data-group-depth on the outer div so a future regression test can read tree shape', () => {
    expect(SRC).toMatch(/data-group-depth=\{depth\}/);
  });
});
