// lib/cad/operations/find-linked-geometry.ts
//
// Phase 8 §11.7 Slice 7 — find every feature whose vertices
// are entirely defined by picked POINT features. Surveyors
// rely on this so duplicating "the corners of the building"
// also pulls in the polygon that sits on those corners
// without manually re-picking each linked shape.
//
// Matching rule (deliberately strict):
//   For every vertex / endpoint of a candidate feature,
//   there must be a picked POINT whose coordinates match
//   within `eps` (default 0.001 world feet). If even one
//   vertex doesn't match, the feature stays out of the
//   bring-along set. This avoids the surprise where picking
//   2 corners of a 12-vertex polyline drags the whole
//   polyline along.
//
// Geometry coverage:
//   POINT     — never matched as linked-from-itself
//   LINE      — both endpoints must match
//   POLYLINE  — every vertex must match
//   POLYGON   — every vertex must match
//   ARC       — endpoints must match (start & end of the
//               arc, computed from center + radius + angles)
//   CIRCLE    — never matched (no vertex tied to a POINT)
//   ELLIPSE   — never matched (same)
//   SPLINE    — first + last control point must match (the
//               on-curve endpoints; control handles are
//               independent of any POINT)
//   MIXED     — every vertex must match
//   TEXT/IMAGE — never matched
//
// Pure: caller passes the feature list + the picked-POINT
// coordinate set; no zustand, no DOM. Vitest-coverable.

import type { Feature, Point2D } from '../types';

export interface FindLinkedOpts {
  /** Coordinate-match tolerance in world feet. */
  eps?: number;
}

/**
 * Build a coordinate lookup keyed off picked POINT positions
 * (rounded to grid bins of `eps` so floating-point round-off
 * never makes us miss a match).
 */
function buildPointCoordSet(
  pickedFeatures: ReadonlyArray<Feature>,
  eps: number,
): Set<string> {
  const set = new Set<string>();
  for (const f of pickedFeatures) {
    if (f.geometry.type !== 'POINT' || !f.geometry.point) continue;
    const k = coordKey(f.geometry.point, eps);
    set.add(k);
  }
  return set;
}

function coordKey(p: Point2D, eps: number): string {
  // Bin to multiples of eps so two coordinates within `eps`
  // hash to the same key without storing every variation.
  const bin = (v: number) => Math.round(v / eps);
  return `${bin(p.x)}|${bin(p.y)}`;
}

/**
 * Coordinates a feature must touch a picked POINT at, in
 * order to qualify as "linked." Returns null when the
 * feature type isn't a candidate for bring-along (CIRCLE /
 * ELLIPSE / TEXT / IMAGE / POINT).
 */
function getRequiredCoords(feature: Feature): Point2D[] | null {
  const g = feature.geometry;
  switch (g.type) {
    case 'LINE':
      if (!g.start || !g.end) return null;
      return [g.start, g.end];
    case 'POLYLINE':
    case 'POLYGON':
    case 'MIXED_GEOMETRY':
      return g.vertices && g.vertices.length >= 2 ? [...g.vertices] : null;
    case 'ARC': {
      if (!g.arc) return null;
      const { center, radius, startAngle, endAngle } = g.arc;
      return [
        { x: center.x + radius * Math.cos(startAngle), y: center.y + radius * Math.sin(startAngle) },
        { x: center.x + radius * Math.cos(endAngle),   y: center.y + radius * Math.sin(endAngle) },
      ];
    }
    case 'SPLINE': {
      if (!g.spline || g.spline.controlPoints.length < 2) return null;
      const cps = g.spline.controlPoints;
      // First and last on-curve points only — control
      // handles between them are independent of any POINT.
      return [cps[0], cps[cps.length - 1]];
    }
    default:
      return null;
  }
}

/**
 * Walk the document's features and return ids of every
 * feature whose required coords ALL match a picked POINT.
 * Excludes the picked features themselves so the caller can
 * concat the result without dedup gymnastics.
 */
export function findLinkedFeatureIds(
  pickedIds: ReadonlySet<string>,
  allFeatures: ReadonlyArray<Feature>,
  opts: FindLinkedOpts = {},
): string[] {
  const eps = opts.eps ?? 0.001;
  const pickedFeatures = allFeatures.filter((f) => pickedIds.has(f.id));
  const pointCoords = buildPointCoordSet(pickedFeatures, eps);
  if (pointCoords.size === 0) return [];

  const linked: string[] = [];
  for (const f of allFeatures) {
    if (pickedIds.has(f.id)) continue;
    const req = getRequiredCoords(f);
    if (!req || req.length === 0) continue;
    let allMatch = true;
    for (const p of req) {
      if (!pointCoords.has(coordKey(p, eps))) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) linked.push(f.id);
  }
  return linked;
}
