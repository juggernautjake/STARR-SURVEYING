// lib/hub/widgets/quick-actions/capacity.ts
//
// hub-widget-excellence-15 — quick-actions overhaul. Pure capacity math
// that derives how many action tiles fit the *rendered* widget body so
// the widget "fills the widget size" (the user's ask) instead of a hard
// per-bucket cap. The widget measures its own container with
// `useElementSize` and passes the contentRect px in here.
//
// Dependency-free + pure → unit-tested in node (no DOM).

export interface CapacityResult {
  cols: number;
  rows: number;
  /** cols × rows for a grid; rows for a list. */
  cap: number;
}

/** Default gaps mirror the widget's CSS `--hub-spc-3 / --hub-spc-2`. */
const GRID_GAP = 12;
const LIST_GAP = 8;

/**
 * How many tiles fit a grid of `widthPx × heightPx`, given a per-tile
 * minimum footprint. Uses the standard "n tiles + (n-1) gaps fit the
 * track" inversion: n ≤ (available + gap) / (tile + gap). Always yields
 * at least a 1×1 so the widget never renders zero tiles.
 */
export function gridCapacity(
  widthPx: number,
  heightPx: number,
  opts: { minTileW: number; minTileH: number; gap?: number },
): CapacityResult {
  const gap = opts.gap ?? GRID_GAP;
  if (widthPx <= 0 || heightPx <= 0) return { cols: 1, rows: 1, cap: 1 };
  const cols = Math.max(1, Math.floor((widthPx + gap) / (opts.minTileW + gap)));
  const rows = Math.max(1, Math.floor((heightPx + gap) / (opts.minTileH + gap)));
  return { cols, rows, cap: cols * rows };
}

/** How many rows fit a vertical list of `heightPx`. */
export function listCapacity(
  heightPx: number,
  opts: { rowH: number; gap?: number },
): CapacityResult {
  const gap = opts.gap ?? LIST_GAP;
  if (heightPx <= 0) return { cols: 1, rows: 1, cap: 1 };
  const rows = Math.max(1, Math.floor((heightPx + gap) / (opts.rowH + gap)));
  return { cols: 1, rows, cap: rows };
}

/**
 * Split an ordered action list into the slice that renders + the
 * overflow count, reserving one cell for a "+N more" indicator when the
 * list genuinely overflows the capacity. When everything fits, `overflow`
 * is 0 and all actions render.
 *
 *  - total ≤ cap        → show all, overflow 0
 *  - total > cap, cap≥2 → show cap-1 tiles + a "+N" tile (N = remainder)
 *  - total > cap, cap=1 → show 0 tiles + a "+N" tile (the whole set is
 *                         hidden behind the indicator)
 */
export function splitForCapacity<T>(
  items: readonly T[],
  cap: number,
): { visible: T[]; overflow: number } {
  const total = items.length;
  if (cap <= 0) return { visible: [], overflow: total };
  if (total <= cap) return { visible: items.slice(), overflow: 0 };
  const shown = Math.max(0, cap - 1);
  return { visible: items.slice(0, shown), overflow: total - shown };
}
