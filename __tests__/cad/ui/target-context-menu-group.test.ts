// __tests__/cad/ui/target-context-menu-group.test.ts
//
// cad-layer-grouping-and-context-menus Slice 5 — locks the unified
// TargetContextMenu component's GROUP target rendering + the
// LayerPanel wiring that opens it on a group row's right-click.
//
// Source-text assertions because the component renders against a
// live zustand store and would need a populated drawing to mount
// under jsdom — overkill for a 100-line JSX block. The store-level
// actions called by each menu item (selectMultiple,
// moveFeatureGroup, ungroupFeatures) are already covered by their
// own unit tests; this spec locks the WIRING.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const COMPONENT_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'TargetContextMenu.tsx'),
  'utf8',
);

const PANEL_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'LayerPanel.tsx'),
  'utf8',
);

describe('TargetContextMenu — discriminated-union target prop', () => {
  it('declares the ContextMenuTarget union with group / feature / layer / selection kinds', () => {
    expect(COMPONENT_SRC).toMatch(/export type ContextMenuTarget =\s*\|\s*\{\s*kind: 'group'; id: string \}\s*\|\s*\{\s*kind: 'feature'; id: string \}\s*\|\s*\{\s*kind: 'layer'; id: string \}\s*\|\s*\{\s*kind: 'selection' \};/);
  });

  it('exports a default component named TargetContextMenu with target/x/y/onClose props', () => {
    expect(COMPONENT_SRC).toMatch(/export default function TargetContextMenu\(/);
    expect(COMPONENT_SRC).toMatch(/target,\s*x,\s*y,\s*onClose,/);
  });
});

describe('TargetContextMenu — GROUP target menu items', () => {
  it('renders "Select all in group" wired to selectionStore.selectMultiple', () => {
    expect(COMPONENT_SRC).toMatch(
      /item\('Select all in group',\s*\(\) => \{\s*selectionStore\.selectMultiple\(group\.featureIds, 'REPLACE'\);/,
    );
  });

  it('renders "Rename" wired to the onRequestRename callback', () => {
    expect(COMPONENT_SRC).toMatch(/item\('Rename',\s*\(\) => onRequestRename\?\.\(group\.id\)/);
  });

  it('renders "Move to layer root" only when the group is nested', () => {
    expect(COMPONENT_SRC).toMatch(
      /isNested && item\('Move to layer root',\s*\(\) => \{\s*drawingStore\.moveFeatureGroup\(group\.id, null\);/,
    );
  });

  it('renders "Ungroup" as a danger action wired to drawingStore.ungroupFeatures', () => {
    expect(COMPONENT_SRC).toMatch(
      /item\('Ungroup',\s*\(\) => \{\s*drawingStore\.ungroupFeatures\(group\.id\);\s*\},\s*\{ danger: true \}\)/,
    );
  });

  it('renders an empty menu (null) when the group id is stale', () => {
    expect(COMPONENT_SRC).toMatch(/if \(!group\) \{[\s\S]*?return null;/);
  });
});

describe('TargetContextMenu — outside-click + Escape dismissal', () => {
  it('attaches mousedown / click / contextmenu listeners on mount and removes them on unmount', () => {
    expect(COMPONENT_SRC).toMatch(/document\.addEventListener\('mousedown', onDown\);/);
    expect(COMPONENT_SRC).toMatch(/document\.addEventListener\('click', onDown, true\);/);
    expect(COMPONENT_SRC).toMatch(/document\.addEventListener\('contextmenu', onDown, true\);/);
    expect(COMPONENT_SRC).toMatch(/if \(e\.key === 'Escape'\) onCloseRef\.current\(\);/);
  });
});

describe('LayerPanel — opens TargetContextMenu on a group row right-click', () => {
  it('imports TargetContextMenu + the ContextMenuTarget type', () => {
    expect(PANEL_SRC).toMatch(
      /import TargetContextMenu, \{ type ContextMenuTarget \} from '\.\/TargetContextMenu';/,
    );
  });

  it('tracks the open target menu in a `targetMenu` useState', () => {
    expect(PANEL_SRC).toMatch(
      /const \[targetMenu, setTargetMenu\] = useState<\{ target: ContextMenuTarget; x: number; y: number \} \| null>\(null\);/,
    );
  });

  it('attaches an onContextMenu handler to the group header row that opens a group-target menu', () => {
    expect(PANEL_SRC).toMatch(
      /onContextMenu=\{\(e\) => \{[\s\S]*?setTargetMenu\(\{ target: \{ kind: 'group', id: group\.id \}, x: e\.clientX, y: e\.clientY \}\);/,
    );
  });

  it('renders the TargetContextMenu component when targetMenu is set, wiring onRequestRename to startRenameGroup', () => {
    expect(PANEL_SRC).toMatch(
      /\{targetMenu && \(\s*<TargetContextMenu[\s\S]*?onRequestRename=\{\(groupId\) => startRenameGroup\(groupId\)\}[\s\S]*?onClose=\{\(\) => setTargetMenu\(null\)\}/,
    );
  });
});
