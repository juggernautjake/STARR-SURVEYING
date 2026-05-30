// lib/hub/grid-reflow.ts
//
// Slice 8 of employee-hub-overhaul-2026-05-30.md. Pure helpers for
// the modal editor's "drag a widget around the grid" interaction
// (Slice 9 wires the pointer pipeline; this module is the math).
//
// Three jobs:
//
//   1. applyMoveWithPush(layout, movingId, target) — given a layout
//      and the rect the user is currently hovering with a moving
//      widget, compute a layout where:
//        - The moving widget sits at `target`.
//        - Every other widget that would overlap the target has been
//          pushed straight down (y++) until it no longer overlaps;
//          if its new position now overlaps a downstream neighbor,
//          THAT neighbor is pushed down too. Cascades stably without
//          leaving overlaps.
//      No compaction — the live preview should track the user's drag
//      direction, not silently re-pack on every pointer tick.
//
//   2. nearestAvailable(layout, movingId, hover) — Bridson-flavored
//      outward search: try the hovered rect first; if blocked, scan
//      neighbouring cells by increasing manhattan distance and
//      return the first one whose `target.w × target.h` rect fits
//      with no overlap (excluding the moving widget itself). Used by
//      the drop snap.
//
//   3. commitDrop(layout, movingId, target) — production drop:
//      apply the push, snap to nearestAvailable if the target is now
//      blocked (defensive), then compactLayout to remove gaps the
//      push left behind. Returns the final layout to write into the
//      draft.
//
// All three functions are deterministic + total: same input → same
// output, never throws. Widget identities + customization survive
// untouched — only x/y change.

import type { WidgetInstance } from './types';
import { compactLayout } from './grid-math';
import { HUB_GRID_COLS } from './grid-model';

export interface GridTarget {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RectLike {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: RectLike, b: RectLike): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function clampTargetToCols(target: GridTarget, cols: number): GridTarget {
  const w = Math.max(1, Math.min(cols, Math.floor(target.w)));
  const h = Math.max(1, Math.floor(target.h));
  const x = Math.max(0, Math.min(cols - w, Math.floor(target.x)));
  const y = Math.max(0, Math.floor(target.y));
  return { x, y, w, h };
}

/** Apply a live move: place `movingId` at `target` and push any
 *  widgets it would overlap straight down until they don't, cascading
 *  through downstream neighbors. Returns a new layout array with the
 *  moving widget last (so iteration order is moving → settled). */
export function applyMoveWithPush(
  layout: ReadonlyArray<WidgetInstance>,
  movingId: string,
  target: GridTarget,
  cols: number = HUB_GRID_COLS,
): WidgetInstance[] {
  const clampedTarget = clampTargetToCols(target, cols);
  const others = layout
    .filter((w) => w.id !== movingId)
    .map((w) => ({ ...w }));
  const moving = layout.find((w) => w.id === movingId);
  if (!moving) return [...layout];

  // Sort the others top-to-bottom, left-to-right so the cascade
  // visits earlier widgets first and pushes downstream rows
  // predictably. Sort is stable in modern JS engines.
  others.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

  const placed: WidgetInstance[] = [];
  const blocker: RectLike[] = [clampedTarget];

  for (const widget of others) {
    let y = widget.y;
    // Push down until this widget clears every previously-placed
    // blocker (target + already-pushed widgets) AND the moving widget
    // itself isn't a self-blocker (we excluded it from `others`).
    while (blocker.some((b) => overlaps({ x: widget.x, y, w: widget.w, h: widget.h }, b))) {
      y++;
    }
    const settled: WidgetInstance = { ...widget, y };
    placed.push(settled);
    blocker.push({ x: settled.x, y: settled.y, w: settled.w, h: settled.h });
  }

  const placedMoving: WidgetInstance = {
    ...moving,
    x: clampedTarget.x,
    y: clampedTarget.y,
    w: clampedTarget.w,
    h: clampedTarget.h,
  };
  return [...placed, placedMoving];
}

/** Find the closest free rect that fits the moving widget. Scans
 *  outward by increasing manhattan distance from `hover`. Returns
 *  the hovered rect itself if it already fits. Never returns out-of-
 *  bounds coordinates. Falls back to (0, maxY) where maxY puts the
 *  widget below every existing one if no nearby slot is found. */
export function nearestAvailable(
  layout: ReadonlyArray<WidgetInstance>,
  movingId: string,
  hover: GridTarget,
  cols: number = HUB_GRID_COLS,
): GridTarget {
  const clamped = clampTargetToCols(hover, cols);
  const others = layout.filter((w) => w.id !== movingId);

  const fits = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x + clamped.w > cols) return false;
    const rect: RectLike = { x, y, w: clamped.w, h: clamped.h };
    return !others.some((w) => overlaps(rect, w));
  };

  if (fits(clamped.x, clamped.y)) {
    return { x: clamped.x, y: clamped.y, w: clamped.w, h: clamped.h };
  }

  // BFS by manhattan distance. Bound the search to a reasonable
  // radius — anything beyond `cols * 2` rows away is effectively
  // "stick it at the bottom".
  const maxRadius = cols * 2 + Math.max(1, hover.y + clamped.h);
  for (let r = 1; r <= maxRadius; r++) {
    // Walk the diamond at radius r. Iterate dy from -r..+r and
    // pick dx so |dx| + |dy| === r.
    for (let dy = -r; dy <= r; dy++) {
      const dx = r - Math.abs(dy);
      const candidates = dx === 0
        ? [{ x: clamped.x, y: clamped.y + dy }]
        : [
            { x: clamped.x - dx, y: clamped.y + dy },
            { x: clamped.x + dx, y: clamped.y + dy },
          ];
      for (const c of candidates) {
        if (fits(c.x, c.y)) {
          return { x: c.x, y: c.y, w: clamped.w, h: clamped.h };
        }
      }
    }
  }

  // Final fallback: stick it below every existing widget.
  let maxRow = 0;
  for (const w of others) maxRow = Math.max(maxRow, w.y + w.h);
  return { x: 0, y: maxRow, w: clamped.w, h: clamped.h };
}

/** Commit a drop. Applies the push, then runs the existing
 *  `compactLayout` so gaps the push opened up close back down. The
 *  moving widget stays at the dropped position because compact walks
 *  array order and the push helper puts the moving widget last. */
export function commitDrop(
  layout: ReadonlyArray<WidgetInstance>,
  movingId: string,
  target: GridTarget,
  cols: number = HUB_GRID_COLS,
): WidgetInstance[] {
  const snap = nearestAvailable(layout, movingId, target, cols);
  const pushed = applyMoveWithPush(layout, movingId, snap, cols);
  return compactLayout(pushed, cols);
}
