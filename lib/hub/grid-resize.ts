// lib/hub/grid-resize.ts
//
// Pure math for the resize handle. Given a widget's current grid size,
// the pointer's pixel delta since the resize started, and the active
// cell dimensions, returns the new (w, h) clamped to the widget
// definition's min/max envelope.
//
// Keeping this pure means the handle component (lib/hub/components/
// WidgetResizeHandle.tsx) stays a thin wrapper around pointer events
// and the snap math is exhaustively unit-testable.
//
// Slice 99 of customizable-hub-and-work-mode-2026-05-28.md.

export interface GridSize {
  w: number;
  h: number;
}

export interface CellDimensions {
  /** Width of one grid column, in pixels. */
  cellW: number;
  /** Height of one grid row, in pixels. */
  cellH: number;
  /** Gap between cells, in pixels. */
  gap: number;
}

/** Convert a pixel delta from the drag start to a new grid size,
 *  clamping to the widget definition's envelope and snapping to integer
 *  cells. Negative deltas shrink; positive grow.
 *
 *  The conversion accounts for gaps: a delta equal to one cell-width
 *  plus one gap-width counts as +1 column. This matches the visual
 *  expectation — the handle reaches the next column boundary at
 *  `cellW + gap` of pointer travel. */
export function computeResize(
  current: GridSize,
  deltaPx: { dx: number; dy: number },
  cell: CellDimensions,
  minSize: GridSize,
  maxSize: GridSize,
): GridSize {
  // When an axis is unmeasured (cellW or cellH = 0, e.g., the grid
  // hasn't laid out yet) skip resizing on that axis. The +gap step
  // matches the visual cell-to-cell stride.
  const deltaCols = cell.cellW > 0 ? Math.round(deltaPx.dx / (cell.cellW + cell.gap)) : 0;
  const deltaRows = cell.cellH > 0 ? Math.round(deltaPx.dy / (cell.cellH + cell.gap)) : 0;

  const rawW = current.w + deltaCols;
  const rawH = current.h + deltaRows;

  return {
    w: clamp(rawW, minSize.w, maxSize.w),
    h: clamp(rawH, minSize.h, maxSize.h),
  };
}

/** Pixel size of a widget at the given grid size. Inverse of the
 *  cells-per-delta math; used by the live target indicator. */
export function gridSizeToPixels(size: GridSize, cell: CellDimensions): { px: number; py: number } {
  return {
    px: size.w * cell.cellW + Math.max(0, size.w - 1) * cell.gap,
    py: size.h * cell.cellH + Math.max(0, size.h - 1) * cell.gap,
  };
}

/** Returns true when a target size is strictly different from the
 *  current — used to decide whether onResize should fire on
 *  pointer-up. */
export function isDifferentSize(a: GridSize, b: GridSize): boolean {
  return a.w !== b.w || a.h !== b.h;
}

function clamp(n: number, lo: number, hi: number): number {
  const low = Math.min(lo, hi);
  const high = Math.max(lo, hi);
  if (n < low) return low;
  if (n > high) return high;
  return n;
}
