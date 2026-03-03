// lib/cad/geometry/snap.ts — Snap engine
import type { Point2D, Feature, SnapResult, SnapType } from '../types';
import { distance, midpoint, closestPointOnSegment } from './point';
import { segmentSegmentIntersection } from './intersection';

/** Get all line segments from a feature as [start, end] pairs */
function getSegments(feature: Feature): Array<[Point2D, Point2D]> {
  const geom = feature.geometry;
  const segments: Array<[Point2D, Point2D]> = [];
  switch (geom.type) {
    case 'LINE':
      if (geom.start && geom.end) segments.push([geom.start, geom.end]);
      break;
    case 'POLYLINE':
      if (geom.vertices) {
        for (let i = 0; i < geom.vertices.length - 1; i++) {
          segments.push([geom.vertices[i], geom.vertices[i + 1]]);
        }
      }
      break;
    case 'POLYGON':
      if (geom.vertices && geom.vertices.length >= 2) {
        for (let i = 0; i < geom.vertices.length; i++) {
          segments.push([
            geom.vertices[i],
            geom.vertices[(i + 1) % geom.vertices.length],
          ]);
        }
      }
      break;
  }
  return segments;
}

/** Get all endpoint vertices from a feature */
function getEndpoints(feature: Feature): Array<{ point: Point2D; vertexIndex: number }> {
  const geom = feature.geometry;
  const pts: Array<{ point: Point2D; vertexIndex: number }> = [];
  switch (geom.type) {
    case 'POINT':
      if (geom.point) pts.push({ point: geom.point, vertexIndex: 0 });
      break;
    case 'LINE':
      if (geom.start) pts.push({ point: geom.start, vertexIndex: 0 });
      if (geom.end) pts.push({ point: geom.end, vertexIndex: 1 });
      break;
    case 'POLYLINE':
    case 'POLYGON':
      if (geom.vertices) {
        geom.vertices.forEach((v, i) => pts.push({ point: v, vertexIndex: i }));
      }
      break;
  }
  return pts;
}

/**
 * Find the best snap point near the cursor.
 * Priority: ENDPOINT > MIDPOINT > INTERSECTION > NEAREST > GRID
 */
export function findSnapPoint(
  cursor: Point2D,
  features: Feature[],
  snapRadius: number,
  zoom: number,
  snapTypes: SnapType[],
  gridSpacing: number,
): SnapResult | null {
  const worldRadius = snapRadius / zoom;

  // ENDPOINT
  if (snapTypes.includes('ENDPOINT')) {
    let best: SnapResult | null = null;
    for (const feature of features) {
      for (const { point, vertexIndex } of getEndpoints(feature)) {
        const d = distance(cursor, point);
        if (d <= worldRadius && (!best || d < best.distance)) {
          best = {
            point,
            type: 'ENDPOINT',
            featureId: feature.id,
            vertexIndex,
            distance: d * zoom,
          };
        }
      }
    }
    if (best) return best;
  }

  // MIDPOINT
  if (snapTypes.includes('MIDPOINT')) {
    let best: SnapResult | null = null;
    for (const feature of features) {
      for (const [a, b] of getSegments(feature)) {
        const mp = midpoint(a, b);
        const d = distance(cursor, mp);
        if (d <= worldRadius && (!best || d < best.distance)) {
          best = {
            point: mp,
            type: 'MIDPOINT',
            featureId: feature.id,
            distance: d * zoom,
          };
        }
      }
    }
    if (best) return best;
  }

  // INTERSECTION
  if (snapTypes.includes('INTERSECTION')) {
    let best: SnapResult | null = null;
    const allSegments: Array<{ seg: [Point2D, Point2D]; featureId: string }> = [];
    for (const feature of features) {
      for (const seg of getSegments(feature)) {
        allSegments.push({ seg, featureId: feature.id });
      }
    }
    for (let i = 0; i < allSegments.length; i++) {
      for (let j = i + 1; j < allSegments.length; j++) {
        const [a, b] = allSegments[i].seg;
        const [c, d] = allSegments[j].seg;
        const pt = segmentSegmentIntersection(a, b, c, d);
        if (pt) {
          const dist = distance(cursor, pt);
          if (dist <= worldRadius && (!best || dist < best.distance)) {
            best = {
              point: pt,
              type: 'INTERSECTION',
              featureId: allSegments[i].featureId,
              distance: dist * zoom,
            };
          }
        }
      }
    }
    if (best) return best;
  }

  // NEAREST
  if (snapTypes.includes('NEAREST')) {
    let best: SnapResult | null = null;
    for (const feature of features) {
      const segs = getSegments(feature);
      for (const [a, b] of segs) {
        const { point } = closestPointOnSegment(cursor, a, b);
        const d = distance(cursor, point);
        if (d <= worldRadius && (!best || d < best.distance)) {
          best = {
            point,
            type: 'NEAREST',
            featureId: feature.id,
            distance: d * zoom,
          };
        }
      }
      // For point features
      if (feature.geometry.type === 'POINT' && feature.geometry.point) {
        const d = distance(cursor, feature.geometry.point);
        if (d <= worldRadius && (!best || d < best.distance)) {
          best = {
            point: feature.geometry.point,
            type: 'NEAREST',
            featureId: feature.id,
            distance: d * zoom,
          };
        }
      }
    }
    if (best) return best;
  }

  // GRID
  if (snapTypes.includes('GRID')) {
    const gx = Math.round(cursor.x / gridSpacing) * gridSpacing;
    const gy = Math.round(cursor.y / gridSpacing) * gridSpacing;
    const gridPoint = { x: gx, y: gy };
    const d = distance(cursor, gridPoint);
    if (d <= worldRadius) {
      return {
        point: gridPoint,
        type: 'GRID',
        featureId: null,
        distance: d * zoom,
      };
    }
  }

  return null;
}
