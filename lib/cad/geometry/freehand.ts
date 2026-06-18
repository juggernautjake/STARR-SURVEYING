// lib/cad/geometry/freehand.ts
//
// Slice W11 (hub-cad-roles-polish-2026-06-18) — pure helpers
// for the new DRAW_FREEHAND tool. Extracted so the smoothing
// and decimation passes are testable without dragging in the
// CanvasViewport / PixiJS runtime.

import type { Point2D } from '../types';

/** Drop points whose distance from the last accepted vertex is
 *  below `minSpacing` (in the same world units as the input
 *  coordinates — feet for STARR CAD). Always keeps the first
 *  and last points so the stroke endpoints are preserved.
 *  Pure + exported. */
export function decimateByMinSpacing(
  points: ReadonlyArray<Point2D>,
  minSpacing: number,
): Point2D[] {
  if (!points || points.length === 0) return [];
  if (points.length === 1) return [{ x: points[0].x, y: points[0].y }];
  if (!Number.isFinite(minSpacing) || minSpacing <= 0) {
    return points.map((p) => ({ x: p.x, y: p.y }));
  }
  const minSq = minSpacing * minSpacing;
  const out: Point2D[] = [{ x: points[0].x, y: points[0].y }];
  for (let i = 1; i < points.length - 1; i += 1) {
    const last = out[out.length - 1];
    const dx = points[i].x - last.x;
    const dy = points[i].y - last.y;
    if (dx * dx + dy * dy >= minSq) {
      out.push({ x: points[i].x, y: points[i].y });
    }
  }
  // Always preserve the final point.
  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (last.x !== tail.x || last.y !== tail.y) {
    out.push({ x: last.x, y: last.y });
  }
  return out;
}

/** One iteration of Chaikin's corner-cutting algorithm. Each
 *  segment AB becomes two new points at 1/4 and 3/4 along it,
 *  which rounds sharp corners into a smoother curve. The first
 *  and last input vertices are preserved so the stroke
 *  endpoints don't drift. Pure + exported. */
export function chaikinIteration(points: ReadonlyArray<Point2D>): Point2D[] {
  if (!points || points.length < 3) {
    return points ? points.map((p) => ({ x: p.x, y: p.y })) : [];
  }
  const out: Point2D[] = [{ x: points[0].x, y: points[0].y }];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
    out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  out.push({ x: points[points.length - 1].x, y: points[points.length - 1].y });
  return out;
}

/** Run `iterations` rounds of Chaikin's algorithm. Two
 *  iterations is the typical sweet spot — smoother than one,
 *  cheaper than three. Pure + exported. */
export function chaikinSmooth(
  points: ReadonlyArray<Point2D>,
  iterations: number = 2,
): Point2D[] {
  if (!points || points.length === 0) return [];
  const n = Math.max(0, Math.min(6, Math.floor(iterations)));
  let cur = points.map((p) => ({ x: p.x, y: p.y }));
  for (let i = 0; i < n; i += 1) {
    cur = chaikinIteration(cur);
  }
  return cur;
}
