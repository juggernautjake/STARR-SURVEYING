// lib/cad/geometry/segment-visibility.ts
//
// cad-fills Slice 2 — per-segment visibility for vertex-based features
// (POLYLINE / POLYGON). A feature can hide individual edges via
// `geometry.hiddenSegments` (an array of segment indices) without
// deleting the vertices, so the surveyor can drop a boundary line yet
// keep the shape + its area fill.
//
// Segment indexing convention (matches the render path):
//   - segment i connects vertex i → vertex (i + 1)
//   - an OPEN polyline of n vertices has n − 1 segments (0 … n−2)
//   - a CLOSED polygon of n vertices has n segments; the last
//     (index n − 1) is the closing edge vertex (n−1) → vertex 0
//
// Pure + dependency-free → unit-tested in node.

/** Number of stroke-able segments for a vertex run. */
export function segmentCount(vertexCount: number, closed: boolean): number {
  if (vertexCount < 2) return 0;
  return closed ? vertexCount : vertexCount - 1;
}

/** Normalize a raw hidden-segment list to a clean Set of in-range
 *  integer indices. */
export function normalizeHiddenSegments(
  hiddenSegments: ReadonlyArray<number> | null | undefined,
  segCount: number,
): Set<number> {
  const out = new Set<number>();
  if (!hiddenSegments) return out;
  for (const i of hiddenSegments) {
    if (Number.isInteger(i) && i >= 0 && i < segCount) out.add(i);
  }
  return out;
}

/**
 * Group the visible segments of a vertex run into continuous runs of
 * vertex indices, so the renderer can stroke each run as one polyline
 * (keeps line-type dashing continuous + minimizes draw calls).
 *
 * Returns an array of runs; each run is an ordered list of vertex
 * indices. For the all-visible closed case the single run ends back at
 * vertex 0 (the closing edge). When everything is hidden, returns [].
 */
export function visibleSegmentRuns(
  vertexCount: number,
  closed: boolean,
  hiddenSegments: ReadonlyArray<number> | null | undefined = [],
): number[][] {
  const n = vertexCount;
  const segCount = segmentCount(n, closed);
  if (segCount <= 0) return [];

  const hidden = normalizeHiddenSegments(hiddenSegments, segCount);

  // Fast path — nothing hidden: one continuous run (closed wraps to 0).
  if (hidden.size === 0) {
    const seq = Array.from({ length: n }, (_, i) => i);
    if (closed) seq.push(0);
    return [seq];
  }
  if (hidden.size >= segCount) return []; // every edge hidden

  const visible = (i: number) => !hidden.has(i);

  if (!closed) {
    const runs: number[][] = [];
    let cur: number[] | null = null;
    for (let i = 0; i < segCount; i++) {
      if (visible(i)) {
        if (!cur) cur = [i];
        cur.push(i + 1);
      } else if (cur) {
        runs.push(cur);
        cur = null;
      }
    }
    if (cur) runs.push(cur);
    return runs;
  }

  // Closed with ≥1 hidden edge: start walking just after a hidden
  // segment so a run never has to wrap across the seam.
  let startSeg = 0;
  for (let i = 0; i < segCount; i++) {
    if (!visible(i)) { startSeg = i; break; }
  }
  const runs: number[][] = [];
  let cur: number[] | null = null;
  for (let k = 0; k < segCount; k++) {
    const i = (startSeg + k) % segCount;
    const a = i;
    const b = (i + 1) % n;
    if (visible(i)) {
      if (!cur) cur = [a];
      cur.push(b);
    } else if (cur) {
      runs.push(cur);
      cur = null;
    }
  }
  if (cur) runs.push(cur);
  return runs;
}

/** Toggle a segment index in a hidden-segment list, returning a new
 *  normalized, sorted array (undefined when the result is empty so the
 *  field can be cleared off the geometry). */
export function toggleHiddenSegment(
  hiddenSegments: ReadonlyArray<number> | null | undefined,
  segIndex: number,
  segCount: number,
): number[] | undefined {
  const set = normalizeHiddenSegments(hiddenSegments, segCount);
  if (set.has(segIndex)) set.delete(segIndex);
  else if (Number.isInteger(segIndex) && segIndex >= 0 && segIndex < segCount) set.add(segIndex);
  if (set.size === 0) return undefined;
  return Array.from(set).sort((a, b) => a - b);
}
