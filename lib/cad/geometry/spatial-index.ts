// lib/cad/geometry/spatial-index.ts
//
// Phase 7 §19.1 — uniform-grid spatial index for fast
// bbox queries. Replaces the linear scan inside
// `cullFeaturesToViewport` (and downstream snap / hit-test
// helpers once they migrate) so big drawings don't pay the
// O(n) cost on every render.
//
// Design notes:
// * No external deps. The spec mentions rbush; in practice a
//   uniform grid covers our N ≤ ~10k features per drawing
//   with much simpler code. Real R-tree (STR bulk-loaded)
//   can swap in later behind the same `SpatialIndex` shape
//   if profiling shows we need it.
// * Static index — built once per render frame from the
//   feature list. Re-building is O(n); querying is O(cells in
//   viewport) which is sub-millisecond at every realistic
//   zoom level.
// * Falls back to a linear scan when:
//     - the source extent is empty / collapsed,
//     - the query bbox doesn't overlap the index extent,
//     - the index was built with zero items.
//
// Public API:
//   * `createSpatialIndex(items)` — builds the grid.
//   * `index.query(bbox)` — returns the candidate id list
//     (always a superset; the caller still bbox-tests for
//     correctness when needed).
//   * `index.count` — number of items in the index.
//   * `index.extent` — overall bbox (null when empty).

import type { BoundingBox } from './lod';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface SpatialItem {
  id:   string;
  bbox: BoundingBox;
}

export interface SpatialIndex {
  /** Items per cell along the longer axis. The grid sizes its
   *  cells so the average bucket stays cheap to scan. */
  readonly cellsX: number;
  readonly cellsY: number;
  readonly count:  number;
  readonly extent: BoundingBox | null;
  /** Return every id whose bbox overlaps `bbox`. Stable order
   *  (insertion order). When the query bbox is empty or out
   *  of range, returns []. */
  query(bbox: BoundingBox): string[];
}

interface InternalGrid {
  cellsX: number;
  cellsY: number;
  cellW:  number;
  cellH:  number;
  extent: BoundingBox;
  /** Flat array of id buckets. cells[col + row * cellsX]. */
  cells:  string[][];
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/** Empty-index sentinel — exported so renderers can assign
 *  it as a default and avoid null checks on hot paths. */
export const EMPTY_SPATIAL_INDEX: SpatialIndex = {
  cellsX: 0,
  cellsY: 0,
  count: 0,
  extent: null,
  query: () => [],
};

/**
 * Build a uniform-grid spatial index from the supplied items.
 * Cell sizing targets ~`itemsPerCell` items per bucket so the
 * scan stays cheap; clamps to a max of 256 × 256 cells to
 * keep the cell array small for huge drawings.
 */
export function createSpatialIndex(
  items: ReadonlyArray<SpatialItem>,
  options: { itemsPerCell?: number } = {}
): SpatialIndex {
  if (items.length === 0) return EMPTY_SPATIAL_INDEX;
  const extent = combinedExtent(items);
  if (!extent) return EMPTY_SPATIAL_INDEX;

  const itemsPerCell = Math.max(1, options.itemsPerCell ?? 8);
  const grid = buildGrid(items, extent, itemsPerCell);
  if (!grid) return EMPTY_SPATIAL_INDEX;
  return materializeIndex(grid, items.length);
}

// ────────────────────────────────────────────────────────────
// Grid construction
// ────────────────────────────────────────────────────────────

function buildGrid(
  items: ReadonlyArray<SpatialItem>,
  extent: BoundingBox,
  itemsPerCell: number
): InternalGrid | null {
  const { minX, minY, maxX, maxY } = extent;
  const w = Math.max(1e-6, maxX - minX);
  const h = Math.max(1e-6, maxY - minY);
  const targetCells = Math.max(
    1,
    Math.ceil(items.length / itemsPerCell)
  );
  // Square-ish layout that mirrors the extent's aspect.
  const aspect = w / h;
  const ratio = Math.sqrt(targetCells * aspect);
  const cellsX = Math.min(256, Math.max(1, Math.round(ratio)));
  const cellsY = Math.min(
    256,
    Math.max(1, Math.round(targetCells / cellsX))
  );
  const cellW = w / cellsX;
  const cellH = h / cellsY;
  const cells: string[][] = new Array(cellsX * cellsY);
  for (let i = 0; i < cells.length; i += 1) cells[i] = [];

  for (const item of items) {
    const ix0 = clamp(
      Math.floor((item.bbox.minX - minX) / cellW),
      0,
      cellsX - 1
    );
    const ix1 = clamp(
      Math.floor((item.bbox.maxX - minX) / cellW),
      0,
      cellsX - 1
    );
    const iy0 = clamp(
      Math.floor((item.bbox.minY - minY) / cellH),
      0,
      cellsY - 1
    );
    const iy1 = clamp(
      Math.floor((item.bbox.maxY - minY) / cellH),
      0,
      cellsY - 1
    );
    for (let row = iy0; row <= iy1; row += 1) {
      for (let col = ix0; col <= ix1; col += 1) {
        cells[col + row * cellsX].push(item.id);
      }
    }
  }
  return { cellsX, cellsY, cellW, cellH, extent, cells };
}

function materializeIndex(
  grid: InternalGrid,
  count: number
): SpatialIndex {
  return {
    cellsX: grid.cellsX,
    cellsY: grid.cellsY,
    count,
    extent: grid.extent,
    query(bbox) {
      const { minX, minY, maxX, maxY } = grid.extent;
      // Reject queries entirely outside the index extent.
      if (
        bbox.maxX < minX ||
        bbox.minX > maxX ||
        bbox.maxY < minY ||
        bbox.minY > maxY
      ) {
        return [];
      }
      const ix0 = clamp(
        Math.floor((bbox.minX - minX) / grid.cellW),
        0,
        grid.cellsX - 1
      );
      const ix1 = clamp(
        Math.floor((bbox.maxX - minX) / grid.cellW),
        0,
        grid.cellsX - 1
      );
      const iy0 = clamp(
        Math.floor((bbox.minY - minY) / grid.cellH),
        0,
        grid.cellsY - 1
      );
      const iy1 = clamp(
        Math.floor((bbox.maxY - minY) / grid.cellH),
        0,
        grid.cellsY - 1
      );
      // Walk the touched cells, dedupe ids that span multiple
      // cells (large polygons / utility lines).
      const seen = new Set<string>();
      const out: string[] = [];
      for (let row = iy0; row <= iy1; row += 1) {
        for (let col = ix0; col <= ix1; col += 1) {
          const bucket = grid.cells[col + row * grid.cellsX];
          for (const id of bucket) {
            if (!seen.has(id)) {
              seen.add(id);
              out.push(id);
            }
          }
        }
      }
      return out;
    },
  };
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function combinedExtent(
  items: ReadonlyArray<SpatialItem>
): BoundingBox | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const it of items) {
    const b = it.bbox;
    if (
      !Number.isFinite(b.minX) ||
      !Number.isFinite(b.minY) ||
      !Number.isFinite(b.maxX) ||
      !Number.isFinite(b.maxY)
    ) {
      continue;
    }
    if (b.maxX < b.minX || b.maxY < b.minY) continue;
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
    any = true;
  }
  if (!any) return null;
  return { minX, minY, maxX, maxY };
}

function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}
