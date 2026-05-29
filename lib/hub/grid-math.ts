// lib/hub/grid-math.ts
//
// Pure grid math for the hub widget canvas. No React — these helpers
// just convert between the 12-column grid (or its collapsed
// breakpoints) and concrete pixel-grid positions.
//
// Two responsibilities:
//   1) collapseLayout(widgets, breakpoint) — when the viewport
//      narrows, halve widget widths and re-flow so nothing overflows.
//   2) layoutBounds(widgets) — compute the bottom-most row used, so
//      the grid container knows how many rows to render.
//
// Slice 92 of customizable-hub-and-work-mode-2026-05-28.md.

import type { WidgetInstance } from './types';

/** Three breakpoints the grid supports. */
export type GridBreakpoint = 12 | 6 | 1;

/** Returns the breakpoint corresponding to a viewport width.
 *  Matches the doc's responsive collapse rule:
 *    ≥ 1280px → 12 cols
 *    768–1279 → 6 cols
 *    < 768   → 1 col
 */
export function breakpointForWidth(viewportPx: number): GridBreakpoint {
  if (viewportPx >= 1280) return 12;
  if (viewportPx >= 768) return 6;
  return 1;
}

/** Collapse a layout to fit the given breakpoint. Idempotent — passing
 *  a 12-col layout with breakpoint=12 returns the input unchanged. */
export function collapseLayout(
  widgets: WidgetInstance[],
  breakpoint: GridBreakpoint,
): WidgetInstance[] {
  if (breakpoint === 12) return widgets;
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
  // breakpoint === 6: halve every width (12 → 6, 8 → 6, 6 → 6, 4 → 3,
  // 3 → 3, etc.) and re-flow positions to avoid overlap.
  const scaled = widgets.map((w) => ({
    ...w,
    w: Math.max(1, Math.min(6, Math.ceil(w.w / 2))),
    x: Math.max(0, Math.min(6, Math.floor(w.x / 2))),
  }));
  return reflow(scaled, 6);
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

// ─── Internals ─────────────────────────────────────────────────────────

/** Greedy re-flow when widths or x's overlap. Walks widgets in
 *  (y, x, originalIndex) order, finds the lowest non-overlapping row
 *  for each, and re-assigns y. The relative order within the same row
 *  is preserved. */
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
    // Find the lowest y at this x where the widget doesn't collide.
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
