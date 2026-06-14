// lib/cad/spatial/feature-index.ts
//
// cad-desktop-tauri-and-perf Slice P1 — spatial index keyed by
// feature id → AABB.
//
// Implementation: uniform grid with auto-tuned cell size. Each
// feature is bucketed into every grid cell its bounds overlap;
// queries enumerate the cells overlapping the query rect and
// return the union of their members. This is O(1) per cell hit
// (the typical case is a single cell), so hit-test / viewport
// culling go from the existing O(n) linear scan to O(query_cells
// × items_per_cell) — comfortably sub-linear at 10k+ features.
//
// Why not rbush? A real R-tree is the gold standard for general-
// purpose spatial indexes, but the surveying workload here is
// dominated by points + short line segments clustered in one
// survey area. A grid handles that distribution about as fast as
// rbush at a fraction of the code + zero new runtime deps. The
// trade-off — pathological huge bounds spanning many cells — is
// papered over with a "large bin" of features whose AABB exceeds
// the cell size; the bin is always returned in full on every
// query, but limited to features that actually warrant it.
//
// The index does NOT compute bounds itself. Callers pass a
// `featureBounds`-style lookup so the same module works for any
// AABB-typed payload (a future P3 dirty-region pass can wrap
// `computeFeatureBoundsCached` here).

import type { BoundingBox } from '../types';

/** Default cell size when no auto-tune data is available. Chosen
 *  for survey-scale drawings: roughly the dimension of one lot. */
export const DEFAULT_CELL_SIZE_FT = 100;

/** Features whose AABB diagonal exceeds this fraction of the
 *  current cell size go into the "large bin" instead of being
 *  bucketed across every overlapping cell. Keeps the per-feature
 *  cell footprint bounded. */
const LARGE_AABB_CELL_RATIO = 8;

export interface FeatureIndex {
  /** Number of features in the index — including the large bin. */
  size: () => number;
  /** Insert / replace `id` with the given AABB. Safe to call on an
   *  already-present id; the bucket membership is updated. */
  upsert: (id: string, bounds: BoundingBox) => void;
  /** Drop `id`. No-op when the id was never inserted. */
  remove: (id: string) => void;
  /** Return every feature id whose stored AABB intersects `query`,
   *  deduplicated. Order is unspecified — callers that need draw
   *  order sort by `feature.sortIndex` afterwards. */
  queryRect: (query: BoundingBox) => string[];
  /** Number of grid cells (debug + tests). */
  cellCount: () => number;
  /** Number of entries in the large-bin overflow (debug + tests). */
  largeBinSize: () => number;
}

interface IndexState {
  cellSize: number;
  // cellKey → set of feature ids
  cells: Map<string, Set<string>>;
  // id → list of cell keys it belongs to (for fast removal)
  cellsByFeature: Map<string, string[]>;
  // id → bounds (for fast queries against the large bin)
  largeBin: Map<string, BoundingBox>;
  // id → bounds (canonical AABB cache; used in queryRect to filter
  // false positives the grid produces — a cell contains every
  // feature whose AABB overlaps the cell, but the cell's extent is
  // wider than the feature itself, so the union we hand back must
  // be re-tested against the query rect).
  boundsById: Map<string, BoundingBox>;
}

function cellKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

function cellRange(bounds: BoundingBox, cellSize: number): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.floor(bounds.minX / cellSize),
    y0: Math.floor(bounds.minY / cellSize),
    x1: Math.floor(bounds.maxX / cellSize),
    y1: Math.floor(bounds.maxY / cellSize),
  };
}

function aabbDiagonal(b: BoundingBox): number {
  const dx = b.maxX - b.minX;
  const dy = b.maxY - b.minY;
  return Math.hypot(dx, dy);
}

function isAabbValid(b: BoundingBox): boolean {
  return (
    Number.isFinite(b.minX) &&
    Number.isFinite(b.minY) &&
    Number.isFinite(b.maxX) &&
    Number.isFinite(b.maxY) &&
    b.maxX >= b.minX &&
    b.maxY >= b.minY
  );
}

function aabbsIntersect(a: BoundingBox, b: BoundingBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** Build an empty spatial index. `cellSize` is the world-unit edge
 *  of each grid cell; defaults to `DEFAULT_CELL_SIZE_FT`. */
export function createFeatureIndex(cellSize: number = DEFAULT_CELL_SIZE_FT): FeatureIndex {
  const state: IndexState = {
    cellSize: Math.max(cellSize, 0.001),
    cells: new Map(),
    cellsByFeature: new Map(),
    largeBin: new Map(),
    boundsById: new Map(),
  };

  function removeInternal(id: string): void {
    const cells = state.cellsByFeature.get(id);
    if (cells) {
      for (const key of cells) {
        const bucket = state.cells.get(key);
        if (!bucket) continue;
        bucket.delete(id);
        if (bucket.size === 0) state.cells.delete(key);
      }
      state.cellsByFeature.delete(id);
    }
    state.largeBin.delete(id);
    state.boundsById.delete(id);
  }

  function upsert(id: string, bounds: BoundingBox): void {
    removeInternal(id);
    if (!isAabbValid(bounds)) return;
    state.boundsById.set(id, bounds);
    const diag = aabbDiagonal(bounds);
    if (diag > state.cellSize * LARGE_AABB_CELL_RATIO) {
      state.largeBin.set(id, bounds);
      return;
    }
    const { x0, y0, x1, y1 } = cellRange(bounds, state.cellSize);
    const keys: string[] = [];
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const key = cellKey(cx, cy);
        let bucket = state.cells.get(key);
        if (!bucket) {
          bucket = new Set();
          state.cells.set(key, bucket);
        }
        bucket.add(id);
        keys.push(key);
      }
    }
    state.cellsByFeature.set(id, keys);
  }

  function queryRect(query: BoundingBox): string[] {
    if (!isAabbValid(query)) return [];
    const candidates = new Set<string>();
    const { x0, y0, x1, y1 } = cellRange(query, state.cellSize);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = state.cells.get(cellKey(cx, cy));
        if (!bucket) continue;
        for (const id of bucket) candidates.add(id);
      }
    }
    // Always-on large-bin scan: features whose AABB exceeds the
    // cell threshold sit outside the grid and need an explicit
    // intersection test (these are pre-filtered).
    const result: string[] = [];
    for (const id of candidates) {
      const b = state.boundsById.get(id);
      if (b && aabbsIntersect(query, b)) result.push(id);
    }
    for (const [id, bounds] of state.largeBin) {
      if (aabbsIntersect(query, bounds)) result.push(id);
    }
    return result;
  }

  return {
    size: () => state.boundsById.size,
    upsert,
    remove: removeInternal,
    queryRect,
    cellCount: () => state.cells.size,
    largeBinSize: () => state.largeBin.size,
  };
}

/** Convenience — pre-populate an index from a feature map. Equivalent
 *  to calling `upsert` for each entry. Returns the index so the
 *  caller can chain or assign. */
export function buildFeatureIndex(
  features: ReadonlyArray<readonly [string, BoundingBox]>,
  cellSize?: number,
): FeatureIndex {
  const idx = createFeatureIndex(cellSize);
  for (const [id, bounds] of features) idx.upsert(id, bounds);
  return idx;
}
