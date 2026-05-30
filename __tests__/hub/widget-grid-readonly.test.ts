// __tests__/hub/widget-grid-readonly.test.ts
//
// Slice 3 of employee-hub-overhaul-2026-05-30.md. Locks the view-only
// shape of WidgetGrid now that the GridEditor modal owns the
// authoring flow. Source-regex assertions on WidgetGrid.tsx +
// HubCanvas.tsx since the SSR snapshot-caching limitation rules out
// interactive store-mutation render assertions.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const GRID_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'WidgetGrid.tsx'),
  'utf8',
);

const CANVAS_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'HubCanvas.tsx'),
  'utf8',
);

describe('Slice 3 — WidgetGrid is view-only (no dnd-kit imports)', () => {
  it('drops the @dnd-kit/core import entirely', () => {
    expect(GRID_SRC).not.toMatch(/from '@dnd-kit\/core'/);
  });

  it('drops the @dnd-kit/sortable import entirely', () => {
    expect(GRID_SRC).not.toMatch(/from '@dnd-kit\/sortable'/);
  });

  it('drops the @dnd-kit/utilities import entirely', () => {
    expect(GRID_SRC).not.toMatch(/from '@dnd-kit\/utilities'/);
  });

  it('no longer imports the resize-handle component', () => {
    expect(GRID_SRC).not.toMatch(/import WidgetResizeHandle/);
    expect(GRID_SRC).not.toMatch(/<WidgetResizeHandle/);
  });

  it('no longer imports compactLayout (no in-canvas resize commits)', () => {
    expect(GRID_SRC).not.toMatch(/compactLayout/);
  });
});

describe('Slice 3 — WidgetGridProps is the slim view-only contract', () => {
  it('drops editMode from WidgetGridProps', () => {
    const propsMatch = GRID_SRC.match(/export interface WidgetGridProps \{[\s\S]*?\n\}/);
    expect(propsMatch).not.toBeNull();
    expect(propsMatch![0]).not.toMatch(/editMode/);
  });

  it('drops onReorder from the prop interface', () => {
    expect(GRID_SRC).not.toMatch(/onReorder\?:/);
  });

  it('drops onResize from the prop interface', () => {
    expect(GRID_SRC).not.toMatch(/onResize\?:/);
  });

  it('keeps widgets + rowHeight + gap as the only documented props', () => {
    expect(GRID_SRC).toMatch(/widgets: WidgetInstance\[\];/);
    expect(GRID_SRC).toMatch(/rowHeight\?:\s*number;/);
    expect(GRID_SRC).toMatch(/gap\?:\s*number;/);
  });
});

describe('Slice 3 — in-cell edit chrome is gone', () => {
  it('no DragGhost component', () => {
    expect(GRID_SRC).not.toMatch(/function DragGhost/);
  });

  it('no SortableWidgetCell component', () => {
    expect(GRID_SRC).not.toMatch(/SortableWidgetCell/);
  });

  it('no CellEditActions / DragHandle / RemoveButton components', () => {
    expect(GRID_SRC).not.toMatch(/CellEditActions/);
    expect(GRID_SRC).not.toMatch(/function DragHandle/);
    expect(GRID_SRC).not.toMatch(/function RemoveButton/);
  });

  it('cells render with overflow hidden (no dashed edit-mode outline)', () => {
    expect(GRID_SRC).toMatch(/overflow:\s*'hidden'/);
    expect(GRID_SRC).not.toMatch(/outline:\s*isDropTarget/);
  });
});

describe('Slice 3 — kept exports the memo + customization specs rely on', () => {
  it('still exports EMPTY_CUSTOMIZATION', () => {
    expect(GRID_SRC).toMatch(/export const EMPTY_CUSTOMIZATION/);
  });

  it('still re-exports MemoWidgetRender as __MemoWidgetRender (perf spec hook)', () => {
    expect(GRID_SRC).toMatch(/export \{ MemoWidgetRender as __MemoWidgetRender \}/);
  });
});

describe('Slice 3 — HubCanvas no longer wires edit handlers into the grid', () => {
  it('drops handleReorder', () => {
    expect(CANVAS_SRC).not.toMatch(/handleReorder/);
  });

  it('drops handleResize', () => {
    expect(CANVAS_SRC).not.toMatch(/handleResize/);
  });

  it('drops the compactLayout + GridSize imports (now-unused)', () => {
    expect(CANVAS_SRC).not.toMatch(/import \{ compactLayout \} from '@\/lib\/hub\/grid-math'/);
    expect(CANVAS_SRC).not.toMatch(/import type \{ GridSize \}/);
  });

  it('renders WidgetGrid with only the widgets prop', () => {
    expect(CANVAS_SRC).toMatch(/<WidgetGrid widgets=\{displayWidgets\}\s*\/>/);
  });

  it('no longer pulls setDraftWidgets from useHubActions (the modal owns drafts)', () => {
    // Extract just the destructuring substring so the explanatory
    // comment can legitimately name the action it removed without
    // tripping the assertion.
    const destructure = CANVAS_SRC.match(/const \{([^}]+)\} = useHubActions\(\)/);
    expect(destructure).not.toBeNull();
    expect(destructure![1]).not.toMatch(/setDraftWidgets/);
  });
});
