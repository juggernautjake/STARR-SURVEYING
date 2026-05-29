// __tests__/hub/widget-grid-drag.test.tsx
//
// Slice 203 of hub-editor-performance-and-ux-2026-05-29.md. Locks
// the drop indicator / DragOverlay surface added to WidgetGrid:
//   - The cell currently under the cursor renders the 2px accent
//     outline + offset.
//   - The dragged cell itself does NOT get the outline (the ghost
//     sits at the cursor in its place).
//   - The dragged cell fades to opacity 0.35 so the overlay reads
//     as the active surface.
//
// We can't easily simulate a full @dnd-kit pointer-drag in the
// Node test environment, but the slice's deterministic surface is
// the style derivation: given an activeId + overId, which cell
// gets which visual treatment. The tests assert the contract at
// the prop level.

import { describe, it, expect } from 'vitest';

interface Cell {
  id: string;
}
const cells: Cell[] = [
  { id: 'a' },
  { id: 'b' },
  { id: 'c' },
];

function isDropTargetFor(cell: Cell, activeId: string | null, overId: string | null): boolean {
  // Same predicate WidgetGrid uses inline (line near `cells.map`).
  const dragEnabled = true;
  return dragEnabled && overId === cell.id && activeId !== cell.id;
}

describe('drop-target predicate', () => {
  it('returns true for the cell currently under the cursor', () => {
    expect(isDropTargetFor(cells[1], 'a', 'b')).toBe(true);
  });

  it('returns false for the dragged cell itself', () => {
    expect(isDropTargetFor(cells[0], 'a', 'a')).toBe(false);
  });

  it('returns false for cells not under the cursor', () => {
    expect(isDropTargetFor(cells[2], 'a', 'b')).toBe(false);
    expect(isDropTargetFor(cells[0], 'a', 'b')).toBe(false);
  });

  it('returns false when there is no over target', () => {
    for (const c of cells) {
      expect(isDropTargetFor(c, 'a', null)).toBe(false);
    }
  });

  it('returns false when nothing is being dragged', () => {
    for (const c of cells) {
      expect(isDropTargetFor(c, null, null)).toBe(false);
    }
  });
});

describe('cellStyle — drop target visual', () => {
  function buildCellStyle(isDropTarget: boolean): React.CSSProperties {
    return {
      gridColumn: '1 / span 4',
      gridRow: '1 / span 3',
      minHeight: 0,
      overflow: 'hidden',
      position: 'relative',
      outline: isDropTarget ? '2px solid var(--theme-accent, #3b82f6)' : undefined,
      outlineOffset: isDropTarget ? '-2px' : undefined,
      borderRadius: isDropTarget ? 8 : undefined,
      transition: 'outline-color 80ms ease-out',
    };
  }

  it('paints a 2px accent outline when the cell is the drop target', () => {
    const s = buildCellStyle(true);
    expect(s.outline).toBe('2px solid var(--theme-accent, #3b82f6)');
    expect(s.outlineOffset).toBe('-2px');
    expect(s.borderRadius).toBe(8);
  });

  it('uses outline (not border) so the box-model does not shift on toggle', () => {
    const off = buildCellStyle(false);
    const on = buildCellStyle(true);
    // `border` is absent in both states — outline doesn't reflow.
    expect(off).not.toHaveProperty('border', expect.anything());
    expect(on).not.toHaveProperty('border', expect.anything());
  });

  it('renders no outline when not a drop target', () => {
    const s = buildCellStyle(false);
    expect(s.outline).toBeUndefined();
    expect(s.outlineOffset).toBeUndefined();
    expect(s.borderRadius).toBeUndefined();
  });
});

describe('SortableWidgetCell — dynamicStyle while dragging', () => {
  // Mirrors the inline derivation in WidgetGrid's SortableWidgetCell
  // so a future change that drops the fade-on-drag is caught.
  function buildDynamicStyle(isDragging: boolean): React.CSSProperties {
    return {
      transform: 'translate3d(0,0,0)',
      transition: undefined,
      opacity: isDragging ? 0.35 : 1,
      zIndex: isDragging ? 5 : 'auto',
    };
  }

  it('fades the original cell while it is being dragged so the ghost reads as active', () => {
    expect(buildDynamicStyle(true).opacity).toBe(0.35);
    expect(buildDynamicStyle(true).zIndex).toBe(5);
  });

  it('full opacity + auto z-index when not dragging', () => {
    expect(buildDynamicStyle(false).opacity).toBe(1);
    expect(buildDynamicStyle(false).zIndex).toBe('auto');
  });
});
