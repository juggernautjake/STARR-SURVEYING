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

/** Compute bounding box for an ellipse (accounts for rotation) */
function ellipseBounds(cx: number, cy: number, rx: number, ry: number, rotation: number): BoundingBox {
  // For a rotated ellipse, the bounding box extremes are:
  // x_extent = sqrt((rx*cos(θ))² + (ry*sin(θ))²)
  // y_extent = sqrt((rx*sin(θ))² + (ry*cos(θ))²)
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const extX = Math.sqrt((rx * cosR) ** 2 + (ry * sinR) ** 2);
  const extY = Math.sqrt((rx * sinR) ** 2 + (ry * cosR) ** 2);
  return { minX: cx - extX, minY: cy - extY, maxX: cx + extX, maxY: cy + extY };
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
      return computeBounds(geom.vertices ?? []);
    case 'CIRCLE': {
      if (geom.circle) {
        const { center, radius } = geom.circle;
        return { minX: center.x - radius, minY: center.y - radius, maxX: center.x + radius, maxY: center.y + radius };
      }
      return computeBounds(geom.vertices ?? []);
    }
    case 'ELLIPSE': {
      if (geom.ellipse) {
        const { center, radiusX, radiusY, rotation } = geom.ellipse;
        return ellipseBounds(center.x, center.y, radiusX, radiusY, rotation);
      }
      return computeBounds(geom.vertices ?? []);
    }
    case 'ARC': {
      if (geom.arc) {
        // Conservative: use the full circle bounds (tight arc bounds require checking quadrant crossings)
        const { center, radius } = geom.arc;
        return { minX: center.x - radius, minY: center.y - radius, maxX: center.x + radius, maxY: center.y + radius };
      }
      return computeBounds(geom.vertices ?? []);
    }
    case 'SPLINE': {
      if (geom.spline) {
        return computeBounds(geom.spline.controlPoints);
      }
      return computeBounds(geom.vertices ?? []);
    }
    case 'IMAGE':
      if (geom.image) {
        const { position: p, width: w, height: h } = geom.image;
        return { minX: p.x, minY: p.y, maxX: p.x + w, maxY: p.y + h };
      }
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    case 'TEXT':
      if (geom.point) {
        return { minX: geom.point.x, minY: geom.point.y, maxX: geom.point.x, maxY: geom.point.y };
      }
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
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
