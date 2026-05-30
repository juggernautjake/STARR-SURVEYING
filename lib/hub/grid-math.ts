// lib/hub/grid-math.ts
//
// Pure grid math for the hub widget canvas. No React — these helpers
// just convert between the 8-column grid (or its collapsed
// breakpoints) and concrete pixel-grid positions.
//
// Two responsibilities:
//   1) collapseLayout(widgets, breakpoint) — when the viewport
//      narrows, halve widget widths and re-flow so nothing overflows.
//   2) layoutBounds(widgets) — compute the bottom-most row used, so
//      the grid container knows how many rows to render.
//
// Slice 209 of hub-grid-8x8-square-cells-2026-05-29.md (formerly
// 12 cols; widened cell + halved column count so a 1×1 widget
// renders as a literal square and the picker proportions match
// the on-page reality).

import type { WidgetInstance } from './types';

/** Three breakpoints the grid supports. */
export type GridBreakpoint = 8 | 4 | 1;

/** hub-mobile-build-out Slice 1 — base row height for the 1-col mobile
 *  layout. Decouples mobile row height from cell width (cellW = viewport
 *  on mobile, which would make a 1×1 widget viewport-tall — ~375px on
 *  a phone). 88px = a comfortable single-stat or list-row height; the
 *  grid uses `minmax(MOBILE_BASE_ROW_PX, max-content)` so taller widgets
 *  + content-driven heights still work. */
export const MOBILE_BASE_ROW_PX = 88;

/** hub-mobile-build-out Slice 2 — at breakpoint=1 every widget renders
 *  full-width (1 col) and `sizeBucket(1, h≤2) = 'tiny'`, so widgets fall
 *  into their stat-only render at full mobile width — a 375 px-wide
 *  tile showing one number, which reads as broken. The override bumps
 *  the size the widget body reads to `{w:2, h:max(h,2)}` so the bucket
 *  math picks `small` (or `medium` for taller widgets), unlocking the
 *  list / multi-row content per the per-bucket specs widgets already
 *  ship. Desktop + tablet pass through unchanged. Pure → unit-tested. */
export function mobileSizeOverride(
  size: { w: number; h: number },
  breakpoint: GridBreakpoint,
): { w: number; h: number } {
  if (breakpoint !== 1) return size;
  return { w: 2, h: Math.max(2, size.h) };
}

/** Returns the breakpoint corresponding to a container width.
 *  Matches the doc's responsive collapse rule:
 *    ≥ 1024px → 8 cols
 *    640–1023 → 4 cols
 *    < 640   → 1 col
 *  The thresholds shifted with the column count: 8 square cells
 *  at the desktop width keep the same minimum cell size the old
 *  12-col layout had (≈128px each). */
export function breakpointForWidth(viewportPx: number): GridBreakpoint {
  if (viewportPx >= 1024) return 8;
  if (viewportPx >= 640) return 4;
  return 1;
}

/** Collapse a layout to fit the given breakpoint. Idempotent — passing
 *  an 8-col layout with breakpoint=8 returns the input unchanged. */
export function collapseLayout(
  widgets: WidgetInstance[],
  breakpoint: GridBreakpoint,
): WidgetInstance[] {
  if (breakpoint === 8) return widgets;
  if (breakpoint === 1) {
    // Mobile: ignore custom widths + positions, render in saved order
    // with full-width 1×h widgets stacked top-to-bottom.
    let y = 0;
    return widgets.map((w) => {
      const collapsed: WidgetInstance = {
        ...w,
        x: 0,
        y,
        w: 1,
        h: w.h,
      };
      y += w.h;
      return collapsed;
    });
  }
  // breakpoint === 4: halve every width (8 → 4, 6 → 3, 4 → 2,
  // 3 → 2, etc.) and re-flow positions to avoid overlap.
  const scaled = widgets.map((w) => ({
    ...w,
    w: Math.max(1, Math.min(4, Math.ceil(w.w / 2))),
    x: Math.max(0, Math.min(4, Math.floor(w.x / 2))),
  }));
  return reflow(scaled, 4);
}

/** Find the total (cols, rows) of grid space the layout occupies.
 *  Used by `<WidgetGrid>` to size its container. */
export function layoutBounds(
  widgets: WidgetInstance[],
  breakpoint: GridBreakpoint,
): { cols: number; rows: number } {
  let maxRow = 0;
  for (const w of widgets) {
    const bottom = w.y + w.h;
    if (bottom > maxRow) maxRow = bottom;
  }
  return { cols: breakpoint, rows: Math.max(1, maxRow) };
}

/** Pack widgets in their array order into a grid, ignoring their
 *  current (x, y). Used after a drag-and-drop reorder so the new
 *  sequence flows top-to-bottom without overlap. Widget widths/heights
 *  are preserved; widths wider than the grid are clamped. The first
 *  cell scanned is (0, 0) — the result is auto-compacted (no holes
 *  except where a wider widget forces a gap). */
export function compactLayout(
  widgets: WidgetInstance[],
  cols: number,
): WidgetInstance[] {
  const placed: WidgetInstance[] = [];
  for (const w of widgets) {
    const width = Math.max(1, Math.min(cols, Math.floor(w.w)));
    const height = Math.max(1, Math.floor(w.h));
    let placedThis = false;
    for (let y = 0; !placedThis; y++) {
      for (let x = 0; x + width <= cols; x++) {
        const candidate: WidgetInstance = { ...w, x, y, w: width, h: height };
        if (!collidesWithAny(candidate, placed)) {
          placed.push(candidate);
          placedThis = true;
          break;
        }
      }
    }
  }
  return placed;
}

// ─── Internals ─────────────────────────────────────────────────────────

function reflow(widgets: WidgetInstance[], cols: number): WidgetInstance[] {
  const indexed = widgets.map((w, i) => ({ w, i }));
  indexed.sort((a, b) =>
    a.w.y !== b.w.y ? a.w.y - b.w.y :
    a.w.x !== b.w.x ? a.w.x - b.w.x :
    a.i - b.i,
  );
  const placed: WidgetInstance[] = [];
  for (const { w } of indexed) {
    let xCandidate = Math.min(w.x, cols - w.w);
    if (xCandidate < 0) xCandidate = 0;
    let yCandidate = 0;
    for (;;) {
      const candidate: WidgetInstance = { ...w, x: xCandidate, y: yCandidate };
      if (!collidesWithAny(candidate, placed)) {
        placed.push(candidate);
        break;
      }
      yCandidate++;
    }
  }
  return placed;
}

function collidesWithAny(a: WidgetInstance, others: WidgetInstance[]): boolean {
  for (const b of others) {
    if (rectanglesOverlap(a, b)) return true;
  }
  return false;
}

function rectanglesOverlap(a: WidgetInstance, b: WidgetInstance): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}
