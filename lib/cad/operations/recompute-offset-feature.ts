// lib/cad/operations/recompute-offset-feature.ts
//
// Pure helper that re-runs the offset engine against a source
// feature with a new distance + unit + side + corner-handling, and
// returns the offset feature's new geometry + the metadata to stamp
// back onto it.
//
// Slice 5's PropertyPanel inputs (distance + unit) call this on
// commit, then write the result into the drawing store as a single
// undo entry. The store mutation is kept in the panel; this helper
// stays pure so it can be unit-tested without the store.
//
// Mirrors a subset of the geometry-type dispatch in
// `buildOffsetFeatures` (lib/cad/operations.ts) — but returns just
// a `FeatureGeometry` (no new id, no layer change) because we're
// modifying an existing offset feature in place, not creating a new
// one.
//
// Slice 5 of cad-offset-tool-2026-05-29.md.

import type { Feature, FeatureGeometry, LinearUnit, OffsetConfig, Point2D } from '@/lib/cad/types';
import {
  offsetPolyline,
  offsetCircle,
  offsetArc,
  offsetEllipse,
} from '@/lib/cad/geometry/offset';
import { distanceToFeet } from './apply-offset-from-panel';
import type { OffsetMetadata } from './offset-metadata';

export interface RecomputeOffsetInputs {
  /** The source feature the offset was originally built from. The
   *  recompute reads its geometry to know the curve to parallel. */
  sourceFeature: Feature;
  /** Distance the user just typed in the PropertyPanel input. */
  distance: number;
  /** Unit token from the PropertyPanel unit selector. */
  unit: LinearUnit;
  /** Side the offset was originally laid on. Preserved across edits. */
  side: 'LEFT' | 'RIGHT';
  /** Corner-handling mode the offset was originally created with.
   *  Preserved across edits so the shape stays consistent. */
  cornerHandling: 'MITER' | 'ROUND' | 'CHAMFER';
}

export interface RecomputeOffsetResult {
  /** The new geometry to write into the offset feature. */
  geometry: FeatureGeometry;
  /** The updated metadata to stamp back onto `properties` — same
   *  shape Slice 3 writes when the offset is first created. */
  metadata: OffsetMetadata;
}

/** Compute the new geometry + metadata for an offset feature after
 *  the user edited the distance or unit in the PropertyPanel.
 *
 *  Returns `null` on any failure — bad inputs (zero/negative/NaN
 *  distance), unsupported source geometry, or an offset that
 *  collapses (e.g. polyline degenerates below 2 vertices). The
 *  panel treats `null` as "leave the existing geometry alone". */
export function recomputeOffsetGeometry(
  inputs: RecomputeOffsetInputs,
): RecomputeOffsetResult | null {
  const distanceFeet = distanceToFeet(inputs.distance, inputs.unit);
  if (distanceFeet === null) return null;

  const config: OffsetConfig = {
    distance: distanceFeet,
    side: inputs.side,
    cornerHandling: inputs.cornerHandling,
    miterLimit: 4,
    maintainLink: false,
    targetLayerId: null,
    mode: 'PARALLEL',
  };

  const sourceGeom = inputs.sourceFeature.geometry;
  const geometry = computeGeometry(sourceGeom, config);
  if (!geometry) return null;

  return {
    geometry,
    metadata: {
      sourceId: inputs.sourceFeature.id,
      distance: inputs.distance,
      unit: inputs.unit,
      side: inputs.side,
      cornerHandling: inputs.cornerHandling,
    },
  };
}

function computeGeometry(g: FeatureGeometry, config: OffsetConfig): FeatureGeometry | null {
  // LINE / POLYLINE / POLYGON — vertex-chain offset.
  let verts: Point2D[] | null = null;
  if (g.type === 'LINE' && g.start && g.end) {
    verts = [g.start, g.end];
  } else if ((g.type === 'POLYLINE' || g.type === 'POLYGON') && g.vertices) {
    verts = g.vertices;
  }
  if (verts && verts.length >= 2) {
    const offsetVerts = offsetPolyline(verts, config);
    if (offsetVerts.length < 2) return null;
    if (g.type === 'LINE') {
      return { ...g, type: 'LINE', start: offsetVerts[0], end: offsetVerts[1] };
    }
    return { ...g, vertices: offsetVerts };
  }

  if (g.type === 'CIRCLE' && g.circle) {
    const newCircle = offsetCircle(g.circle, config);
    if (!newCircle) return null;
    return { ...g, circle: newCircle };
  }

  if (g.type === 'ARC' && g.arc) {
    const newArc = offsetArc(g.arc, config);
    if (!newArc) return null;
    return { ...g, arc: newArc };
  }

  if (g.type === 'ELLIPSE' && g.ellipse) {
    const newEllipse = offsetEllipse(g.ellipse, config);
    if (!newEllipse) return null;
    return { ...g, ellipse: newEllipse };
  }

  // SPLINE / MIXED_GEOMETRY: not supported by the in-place
  // recompute path yet — those geometry types have fallback
  // branches in `buildOffsetFeatures` that change the feature
  // type (e.g. SPLINE → POLYLINE), which doesn't fit a simple
  // distance edit. The PropertyPanel can still display the
  // metadata; recompute just returns null and the surveyor's
  // existing geometry stays put.
  return null;
}
