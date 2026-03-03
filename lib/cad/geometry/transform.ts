// lib/cad/geometry/transform.ts — Geometric transform utilities
import type { Point2D, Feature } from '../types';

/** Translate a point by dx, dy */
export function translate(p: Point2D, dx: number, dy: number): Point2D {
  return { x: p.x + dx, y: p.y + dy };
}

/** Rotate a point around a center by angle (radians, CCW) */
export function rotate(p: Point2D, center: Point2D, angleRad: number): Point2D {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/** Mirror a point across a line defined by two points */
export function mirror(p: Point2D, lineA: Point2D, lineB: Point2D): Point2D {
  const dx = lineB.x - lineA.x;
  const dy = lineB.y - lineA.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { ...p };

  const t = ((p.x - lineA.x) * dx + (p.y - lineA.y) * dy) / lenSq;
  const closestX = lineA.x + t * dx;
  const closestY = lineA.y + t * dy;

  return {
    x: 2 * closestX - p.x,
    y: 2 * closestY - p.y,
  };
}

/** Scale a point relative to a center */
export function scale(p: Point2D, center: Point2D, factor: number): Point2D {
  return {
    x: center.x + (p.x - center.x) * factor,
    y: center.y + (p.y - center.y) * factor,
  };
}

/** Apply transform to all geometry in a feature, returning a new Feature */
export function transformFeature(
  feature: Feature,
  transformFn: (p: Point2D) => Point2D,
): Feature {
  const geom = { ...feature.geometry };

  switch (geom.type) {
    case 'POINT':
      geom.point = transformFn(geom.point!);
      break;
    case 'LINE':
      geom.start = transformFn(geom.start!);
      geom.end = transformFn(geom.end!);
      break;
    case 'POLYLINE':
    case 'POLYGON':
      geom.vertices = geom.vertices!.map(transformFn);
      break;
  }

  return { ...feature, geometry: geom };
}
