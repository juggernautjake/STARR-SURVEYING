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
    case 'CIRCLE':
      if (geom.circle) {
        const newCenter = transformFn(geom.circle.center);
        // To determine scale factor, transform a point on the circle and measure the new radius
        const edgePt = { x: geom.circle.center.x + geom.circle.radius, y: geom.circle.center.y };
        const newEdge = transformFn(edgePt);
        const newRadius = Math.hypot(newEdge.x - newCenter.x, newEdge.y - newCenter.y);
        geom.circle = { center: newCenter, radius: newRadius };
      }
      break;
    case 'ELLIPSE':
      if (geom.ellipse) {
        const e = geom.ellipse;
        const newCenter = transformFn(e.center);
        // Transform axis endpoints to determine new radii and rotation
        const cosR = Math.cos(e.rotation);
        const sinR = Math.sin(e.rotation);
        const xAxisPt = { x: e.center.x + e.radiusX * cosR, y: e.center.y + e.radiusX * sinR };
        const yAxisPt = { x: e.center.x - e.radiusY * sinR, y: e.center.y + e.radiusY * cosR };
        const newXAxis = transformFn(xAxisPt);
        const newYAxis = transformFn(yAxisPt);
        const newRx = Math.hypot(newXAxis.x - newCenter.x, newXAxis.y - newCenter.y);
        const newRy = Math.hypot(newYAxis.x - newCenter.x, newYAxis.y - newCenter.y);
        const newRot = Math.atan2(newXAxis.y - newCenter.y, newXAxis.x - newCenter.x);
        geom.ellipse = { center: newCenter, radiusX: newRx, radiusY: newRy, rotation: newRot };
      }
      break;
    case 'ARC':
      if (geom.arc) {
        const a = geom.arc;
        const newCenter = transformFn(a.center);
        const startPt = { x: a.center.x + a.radius * Math.cos(a.startAngle), y: a.center.y + a.radius * Math.sin(a.startAngle) };
        const endPt = { x: a.center.x + a.radius * Math.cos(a.endAngle), y: a.center.y + a.radius * Math.sin(a.endAngle) };
        const newStart = transformFn(startPt);
        const newEnd = transformFn(endPt);
        const newRadius = Math.hypot(newStart.x - newCenter.x, newStart.y - newCenter.y);
        const newStartAngle = Math.atan2(newStart.y - newCenter.y, newStart.x - newCenter.x);
        const newEndAngle = Math.atan2(newEnd.y - newCenter.y, newEnd.x - newCenter.x);
        geom.arc = { center: newCenter, radius: newRadius, startAngle: newStartAngle, endAngle: newEndAngle, anticlockwise: a.anticlockwise };
      }
      break;
    case 'SPLINE':
      if (geom.spline) {
        geom.spline = {
          ...geom.spline,
          controlPoints: geom.spline.controlPoints.map(transformFn),
        };
      }
      break;
  }

  return { ...feature, geometry: geom };
}
