// lib/cad/geometry/simplify.ts — Ramer-Douglas-Peucker
// polyline simplification.
//
// Given a vertex chain and a tolerance distance, returns a
// reduced chain where every removed vertex is within
// `tolerance` of the surviving polyline. Used by the
// SIMPLIFY_POLYLINE tool to clean up noisy imports (scanned
// PDFs, GPS traces, polygons-from-pixel-trace).
//
// Pure geometry — no engine / store / React dependencies.

import type { Point2D } from '../types';
import { pointToSegmentDistance } from './point';

/**
 * Reduce `vertices` using the iterative Ramer-Douglas-Peucker
 * algorithm. Endpoints are always preserved; interior
 * vertices are kept only when their perpendicular distance
 * to the line through their currently-relevant predecessor
 * and successor exceeds `tolerance`.
 *
 * For closed chains pass `isClosed = true` — the algorithm
 * runs twice (start → midpoint, midpoint → end → start) so
 * the wrap-around segment isn't lost.
 *
 * Returns the input unchanged when fewer than 3 vertices are
 * present, or when no vertex exceeds the tolerance.
 */
export function simplifyPolyline(
  vertices: ReadonlyArray<Point2D>,
  tolerance: number,
  isClosed = false,
): Point2D[] {
  if (vertices.length < 3 || !Number.isFinite(tolerance) || tolerance <= 0) {
    return vertices.map((v) => ({ ...v }));
  }

  if (!isClosed) {
    return rdpRecursive(vertices, 0, vertices.length - 1, tolerance);
  }

  // Closed chain — pick the two vertices with the longest
  // diagonal distance as the initial split so the algorithm
  // covers the loop in two halves. Concatenate the halves
  // (skipping the duplicated mid-vertex).
  let bestI = 0;
  let bestJ = 1;
  let bestDist = 0;
  for (let i = 0; i < vertices.length; i += 1) {
    for (let j = i + 1; j < vertices.length; j += 1) {
      const d = Math.hypot(vertices[i].x - vertices[j].x, vertices[i].y - vertices[j].y);
      if (d > bestDist) {
        bestDist = d;
        bestI = i;
        bestJ = j;
      }
    }
  }
  const half1 = vertices.slice(bestI, bestJ + 1);
  const half2 = [...vertices.slice(bestJ), ...vertices.slice(0, bestI + 1)];
  const r1 = rdpRecursive(half1, 0, half1.length - 1, tolerance);
  const r2 = rdpRecursive(half2, 0, half2.length - 1, tolerance);
  // Drop the shared seam vertex when concatenating
  return [...r1, ...r2.slice(1, -1)];
}

/**
 * Iterative RDP — uses an explicit stack to avoid recursion
 * limits on long chains (some imported polylines have 10k+
 * vertices). Marks the surviving vertex indices in a boolean
 * array, then materialises the result.
 */
function rdpRecursive(
  vertices: ReadonlyArray<Point2D>,
  startIdx: number,
  endIdx: number,
  tolerance: number,
): Point2D[] {
  const keep = new Array<boolean>(vertices.length).fill(false);
  keep[startIdx] = true;
  keep[endIdx] = true;

  const stack: Array<[number, number]> = [[startIdx, endIdx]];
  while (stack.length > 0) {
    const [s, e] = stack.pop()!;
    if (e - s < 2) continue;
    let maxDist = 0;
    let maxIdx = -1;
    const a = vertices[s];
    const b = vertices[e];
    for (let i = s + 1; i < e; i += 1) {
      const d = pointToSegmentDistance(vertices[i], a, b);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxIdx >= 0 && maxDist > tolerance) {
      keep[maxIdx] = true;
      stack.push([s, maxIdx], [maxIdx, e]);
    }
  }

  const result: Point2D[] = [];
  for (let i = 0; i < vertices.length; i += 1) {
    if (keep[i]) result.push({ ...vertices[i] });
  }
  return result;
}
