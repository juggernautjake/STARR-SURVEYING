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
//      apply the push so the moving widget lands EXACTLY where the
//      surveyor dropped it (neighbors shifted out of the way), then
//      `trimLeadingRows` so a fully-empty top band collapses but
//      interior gaps + free tiles survive. Returns the final layout to
//      write into the draft.
//
//      Slice G1 of grid-editor-placement-resize-overhaul-2026-05-30.md
//      removed the old `compactLayout` call here — it re-packed every
//      widget toward (0,0) on every drop, which read as "upper-left
//      gravity / I can't move them" + erased the surveyor's
//      deliberately-empty tiles. Free placement is the whole point now.
//
// All functions are deterministic + total: same input → same output,
// never throws. Widget identities + customization survive untouched —
// only x/y change.

import type { WidgetInstance } from './types';
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

/** Apply a resize with directional flow-push. The resized widget is
 *  set to `newRect` (clamped to the columns); every OTHER widget that
 *  ends up overlapping is flowed out of the way — in the drag
 *  direction — until it fits, cascading through downstream neighbors.
 *
 *  Direction (matches the user's "move in the direction of the drag
 *  until there's no more room, then drop to the next row" model):
 *    - When width grew at least as much as height → HORIZONTAL flow:
 *      slide each conflicting widget right one cell at a time; when it
 *      would exceed `cols`, wrap it to x=0 of the next row down and
 *      keep going (potentially pushing widgets that were on that row).
 *    - Otherwise → VERTICAL flow: slide conflicting widgets straight
 *      down (rows are unbounded, so no wrap needed).
 *
 *  Shrinking moves nobody: a smaller `newRect` occupies a subset of
 *  the old footprint, so no previously-clear widget can newly overlap.
 *
 *  Pure + total. Only x/y of displaced widgets change; the resized
 *  widget also takes newRect's w/h. Reading-order traversal (y, then
 *  x) keeps the cascade deterministic. A safety iteration bound guards
 *  against pathological inputs. */
export function applyResizeWithPush(
  layout: ReadonlyArray<WidgetInstance>,
  resizingId: string,
  newRect: GridTarget,
  cols: number = HUB_GRID_COLS,
): WidgetInstance[] {
  const resizing = layout.find((w) => w.id === resizingId);
  if (!resizing) return layout.map((w) => ({ ...w }));

  const clamped = clampTargetToCols(newRect, cols);
  const grewW = clamped.w - resizing.w;
  const grewH = clamped.h - resizing.h;
  // Tie / width-dominant → horizontal flow (matches the user's
  // row-wrap description). Height-dominant grow → vertical push.
  const horizontalFlow = grewW >= grewH;

  const others = layout
    .filter((w) => w.id !== resizingId)
    .map((w) => ({ ...w }))
    .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

  const resizedRect: RectLike = { x: clamped.x, y: clamped.y, w: clamped.w, h: clamped.h };
  const placed: WidgetInstance[] = [];
  const blockers: RectLike[] = [resizedRect];

  const SAFETY = cols * 4096; // generous upper bound; never hit in practice
  for (const widget of others) {
    let x = widget.x;
    let y = widget.y;
    let guard = 0;
    while (
      blockers.some((b) => overlaps({ x, y, w: widget.w, h: widget.h }, b)) &&
      guard++ < SAFETY
    ) {
      if (horizontalFlow) {
        x += 1;
        if (x + widget.w > cols) {
          x = 0;
          y += 1;
        }
      } else {
        y += 1;
      }
    }
    const settled: WidgetInstance = { ...widget, x, y };
    placed.push(settled);
    blockers.push({ x: settled.x, y: settled.y, w: settled.w, h: settled.h });
  }

  const placedResized: WidgetInstance = {
    ...resizing,
    x: clamped.x,
    y: clamped.y,
    w: clamped.w,
    h: clamped.h,
  };
  return [...placed, placedResized];
}

/** Subtract the minimum `y` from every widget so a fully-empty top
 *  band collapses to row 0, WITHOUT touching interior gaps or the
 *  free tiles the surveyor deliberately left. This is the "trim only
 *  leading empty rows" rule: free-form placement everywhere, but the
 *  dashboard never opens with a blank band at the top. Pure; returns
 *  the input layout shifted up by `min(y)` (a no-op when some widget
 *  already sits on row 0 or the layout is empty). */
export function trimLeadingRows(
  layout: ReadonlyArray<WidgetInstance>,
): WidgetInstance[] {
  if (layout.length === 0) return [];
  let minY = Infinity;
  for (const w of layout) if (w.y < minY) minY = w.y;
  if (!Number.isFinite(minY) || minY <= 0) return layout.map((w) => ({ ...w }));
  return layout.map((w) => ({ ...w, y: w.y - minY }));
}

/** Commit a drop. The moving widget lands EXACTLY at its dropped
 *  target (clamped to the columns); overlapping neighbors are pushed
 *  down out of the way via `applyMoveWithPush`. Then `trimLeadingRows`
 *  collapses a fully-empty top band. No compaction — interior gaps +
 *  the surveyor's empty tiles are preserved (that's the whole point of
 *  free placement). */
export function commitDrop(
  layout: ReadonlyArray<WidgetInstance>,
  movingId: string,
  target: GridTarget,
  cols: number = HUB_GRID_COLS,
): WidgetInstance[] {
  const pushed = applyMoveWithPush(layout, movingId, target, cols);
  return trimLeadingRows(pushed);
}
