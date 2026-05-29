// lib/cad/geometry/area.ts — Area by coordinate (shoelace) method
//
// Slice 227 of cad-area-calculation-multi-unit-2026-05-29.md added
// `computeFeatureArea(feature)` so every closed geometry (POLYGON,
// CIRCLE, ELLIPSE, closed POLYLINE / MIXED_GEOMETRY) gets a real
// area via the right formula. Open geometries (LINE, open
// POLYLINE, ARC) report 0.

import type { SurveyPoint, AreaResult, Feature, Point2D } from '../types';

export function computeArea(points: SurveyPoint[]): AreaResult {
  const n = points.length;
  if (n < 3) return { squareFeet: 0, acres: 0, method: 'COORDINATE' };

  let doubleArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    doubleArea += points[i].easting * points[j].northing;
    doubleArea -= points[j].easting * points[i].northing;
  }

  const sqft = Math.abs(doubleArea / 2);
  return {
    squareFeet: sqft,
    acres: sqft / 43560,
    method: 'COORDINATE',
  };
}

export function computeAreaFromPoints2D(points: { x: number; y: number }[]): AreaResult {
  const n = points.length;
  if (n < 3) return { squareFeet: 0, acres: 0, method: 'COORDINATE' };

  let doubleArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    doubleArea += points[i].x * points[j].y;
    doubleArea -= points[j].x * points[i].y;
  }

  const sqft = Math.abs(doubleArea / 2);
  return {
    squareFeet: sqft,
    acres: sqft / 43560,
    method: 'COORDINATE',
  };
}

/** Slice 227 — extended area result that also carries the
 *  geometry kind that produced it. The kind is `'NONE'` when the
 *  feature isn't closed / doesn't have a defined area. */
export interface FeatureAreaResult extends AreaResult {
  geometryKind: 'POLYGON' | 'CIRCLE' | 'ELLIPSE' | 'POLYLINE_CLOSED' | 'MIXED_CLOSED' | 'NONE';
}

const CLOSED_VERTEX_TOLERANCE_FT = 1e-6;

/** Slice 227 — within-tolerance match for two world points.
 *  Exported so the test suite can lock the tolerance value. */
export function isVertexLoopClosed(
  vertices: ReadonlyArray<Point2D>,
  tol: number = CLOSED_VERTEX_TOLERANCE_FT,
): boolean {
  if (!vertices || vertices.length < 3) return false;
  const a = vertices[0];
  const b = vertices[vertices.length - 1];
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
}

/** Slice 227 — dispatcher that picks the right formula for the
 *  feature's geometry. World coordinates are already feet so the
 *  result is canonical sq-ft. Returns `geometryKind === 'NONE'`
 *  (and zero values) for open shapes. */
export function computeFeatureArea(feature: Feature): FeatureAreaResult {
  const g = feature?.geometry;
  if (!g) return zeroResult('NONE');

  switch (g.type) {
    case 'POLYGON': {
      const verts = g.vertices ?? [];
      const r = computeAreaFromPoints2D(verts);
      return { ...r, geometryKind: 'POLYGON' };
    }
    case 'CIRCLE': {
      const c = g.circle;
      if (!c || !Number.isFinite(c.radius) || c.radius <= 0) return zeroResult('CIRCLE');
      const sqft = Math.PI * c.radius * c.radius;
      return { squareFeet: sqft, acres: sqft / 43560, method: 'COORDINATE', geometryKind: 'CIRCLE' };
    }
    case 'ELLIPSE': {
      const e = g.ellipse;
      if (!e
        || !Number.isFinite(e.radiusX)
        || !Number.isFinite(e.radiusY)
        || e.radiusX <= 0
        || e.radiusY <= 0) {
        return zeroResult('ELLIPSE');
      }
      const sqft = Math.PI * e.radiusX * e.radiusY;
      return { squareFeet: sqft, acres: sqft / 43560, method: 'COORDINATE', geometryKind: 'ELLIPSE' };
    }
    case 'POLYLINE': {
      const verts = g.vertices ?? [];
      // A POLYLINE only has an area if the surveyor closed it
      // (first vertex ≈ last vertex within `CLOSED_VERTEX_TOLERANCE_FT`).
      if (!isVertexLoopClosed(verts)) return zeroResult('NONE');
      const r = computeAreaFromPoints2D(verts);
      return { ...r, geometryKind: 'POLYLINE_CLOSED' };
    }
    case 'MIXED_GEOMETRY': {
      const verts = g.vertices ?? [];
      if (!isVertexLoopClosed(verts)) return zeroResult('NONE');
      const r = computeAreaFromPoints2D(verts);
      return { ...r, geometryKind: 'MIXED_CLOSED' };
    }
    // Open geometries (LINE, ARC, SPLINE, POINT, TEXT, IMAGE,
    // MIXED_GEOMETRY without a closed vertex loop) intentionally
    // fall through to the zero result.
    default:
      return zeroResult('NONE');
  }
}

function zeroResult(kind: FeatureAreaResult['geometryKind']): FeatureAreaResult {
  return { squareFeet: 0, acres: 0, method: 'COORDINATE', geometryKind: kind };
}
