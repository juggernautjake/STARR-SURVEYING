// lib/hub/grid-model.ts
//
// Slice 7 of employee-hub-overhaul-2026-05-30.md. Single source of
// truth for the hub's grid coordinate system. Both the in-canvas
// renderer (WidgetGrid → grid-math.collapseLayout / layoutBounds) and
// the modal editor (GridEditor's painter) live in the same coordinate
// space; this module exports the constant + the pure helpers each
// surface needs so a future refactor can't silently drift them apart.
//
// Coordinate model:
//   - Saved layouts are 8-column. Top-left is (0, 0). x/y are integer
//     cell offsets; w/h are integer cell sizes (≥ 1).
//   - Rows are unbounded on the read-only canvas (the layout grows
//     downward as more widgets are added).
//   - The modal editor paints on a bounded 8×8 viewport so a
//     finite "canvas" reads as a deliberate authoring surface. Saved
//     widgets that sit below row 8 still load + render on the hub;
//     the modal just doesn't show that overflow region (Phase HB4
//     will revisit this if the user reports it).
//
// Earlier reference: hub-grid-8x8-square-cells-2026-05-29.md
// (Slice 209) widened the cell + halved the column count from 12 to
// 8 so a 1×1 widget renders as a literal square at desktop width.

import type { GridBreakpoint } from './grid-math';

/** Saved-layout column count. Also the modal editor's column count
 *  + the desktop breakpoint's column count. */
export const HUB_GRID_COLS = 8;

/** The modal editor's bounded row count. Saved layouts can exceed
 *  this; the read-only canvas renders all rows. */
export const HUB_EDITOR_ROWS = 8;

/** The desktop breakpoint produced by `breakpointForWidth`. Exported
 *  so a future tweak (e.g. 10 cols at ultra-wide) only has to touch
 *  this file + the corresponding `GridBreakpoint` enum. */
export const HUB_DESKTOP_BREAKPOINT: GridBreakpoint = HUB_GRID_COLS;

export interface GridRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Clamp a rect to the grid: width/height stay ≥ 1, x/y stay
 *  non-negative, and the rect's right/bottom edge stays inside
 *  (cols, rows). Useful both for paint placement (modal) + future
 *  reflow snaps (HB4). Pure; never throws. */
export function clampRectToGrid(
  rect: GridRect,
  cols: number = HUB_GRID_COLS,
  rows: number = HUB_EDITOR_ROWS,
): GridRect {
  const w = Math.max(1, Math.min(cols, Math.floor(rect.w)));
  const h = Math.max(1, Math.min(rows, Math.floor(rect.h)));
  const x = Math.max(0, Math.min(cols - w, Math.floor(rect.x)));
  const y = Math.max(0, Math.min(rows - h, Math.floor(rect.y)));
  return { x, y, w, h };
}

/** True when the rect fits entirely inside the grid bounds (no
 *  negative coords, no overflow off the right or bottom). */
export function isInsideGrid(
  rect: GridRect,
  cols: number = HUB_GRID_COLS,
  rows: number = HUB_EDITOR_ROWS,
): boolean {
  return (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.w >= 1 &&
    rect.h >= 1 &&
    rect.x + rect.w <= cols &&
    rect.y + rect.h <= rows
  );
}

/** Convert a hub-coordinate rect (cell offsets/sizes) to a pixel
 *  rect, given the rendered cell width + the gap between cells. The
 *  modal's painter + the canvas grid both lay out cells with this
 *  shape; centralizing the math here means a future "use the modal's
 *  preview math on the canvas" doesn't drift. */
export function gridRectToPixels(
  rect: GridRect,
  cellPx: number,
  gapPx = 0,
): { x: number; y: number; w: number; h: number } {
  return {
    x: rect.x * (cellPx + gapPx),
    y: rect.y * (cellPx + gapPx),
    w: rect.w * cellPx + Math.max(0, rect.w - 1) * gapPx,
    h: rect.h * cellPx + Math.max(0, rect.h - 1) * gapPx,
  };
}
