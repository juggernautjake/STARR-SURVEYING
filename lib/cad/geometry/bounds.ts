// lib/cad/geometry/bounds.ts — Bounding box utilities
import type { Point2D, BoundingBox, Feature } from '../types';

/** Compute bounding box of a set of points */
export function computeBounds(points: Point2D[]): BoundingBox {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Get bounding box of a feature */
export function featureBounds(feature: Feature): BoundingBox {
  const geom = feature.geometry;
  switch (geom.type) {
    case 'POINT':
      return {
        minX: geom.point!.x,
        minY: geom.point!.y,
        maxX: geom.point!.x,
        maxY: geom.point!.y,
      };
    case 'LINE':
      return computeBounds([geom.start!, geom.end!]);
    case 'POLYLINE':
    case 'POLYGON':
      return computeBounds(geom.vertices!);
    default:
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
}

/** Compute the merged bounding box of a set of features, or null if empty */
export function computeFeaturesBounds(features: Feature[]): BoundingBox | null {
  if (features.length === 0) return null;
  const boxes = features.map(featureBounds);
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

/** Expand a bounding box by a margin (in world units) */
export function expandBounds(bounds: BoundingBox, margin: number): BoundingBox {
  return {
    minX: bounds.minX - margin,
    minY: bounds.minY - margin,
    maxX: bounds.maxX + margin,
    maxY: bounds.maxY + margin,
  };
}
