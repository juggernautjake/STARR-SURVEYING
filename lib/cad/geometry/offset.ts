// lib/cad/geometry/offset.ts — Parallel offset engine
import type { Point2D, OffsetConfig, ArcDefinition, CircleGeometry, ArcGeometry, Feature } from '../types';
import { lineLineIntersection } from './intersection';
import { tessellateArc } from './arc-render';
import { pointToSegmentDistance } from './point';

export const OFFSET_PRESETS: { id: string; label: string; config: Partial<OffsetConfig> }[] = [
  { id: 'UE_7.5',     label: "Utility Easement (7.5')",   config: { distance: 7.5,  cornerHandling: 'ROUND' } },
  { id: 'UE_10',      label: "Utility Easement (10')",    config: { distance: 10,   cornerHandling: 'ROUND' } },
  { id: 'DE_15',      label: "Drainage Easement (15')",   config: { distance: 15,   cornerHandling: 'ROUND' } },
  { id: 'DE_20',      label: "Drainage Easement (20')",   config: { distance: 20,   cornerHandling: 'ROUND' } },
  { id: 'SB_FRONT',   label: "Front Setback (25')",       config: { distance: 25,   cornerHandling: 'MITER' } },
  { id: 'SB_SIDE_5',  label: "Side Setback (5')",         config: { distance: 5,    cornerHandling: 'MITER' } },
  { id: 'SB_SIDE_7',  label: "Side Setback (7.5')",       config: { distance: 7.5,  cornerHandling: 'MITER' } },
  { id: 'SB_REAR',    label: "Rear Setback (10')",        config: { distance: 10,   cornerHandling: 'MITER' } },
  { id: 'ROW_25',     label: "ROW from CL (25')",         config: { distance: 25,   cornerHandling: 'ROUND' } },
  { id: 'ROW_30',     label: "ROW from CL (30')",         config: { distance: 30,   cornerHandling: 'ROUND' } },
  { id: 'CURB_0.5',   label: "Curb Face (0.5')",          config: { distance: 0.5,  cornerHandling: 'ROUND' } },
  { id: 'GUTTER_1.5', label: "Curb & Gutter (1.5')",      config: { distance: 1.5,  cornerHandling: 'ROUND' } },
];

export function offsetPolyline(
  vertices: Point2D[],
  config: OffsetConfig,
): Point2D[] {
  if (vertices.length < 2) return [];

  const d = config.distance * (config.side === 'LEFT' ? 1 : -1);
  const result: Point2D[] = [];
  const miterLimit = config.miterLimit ?? 4;

  // Offset each segment
  const offsetSegs: [Point2D, Point2D][] = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const p0 = vertices[i], p1 = vertices[i + 1];
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-10) continue;

    const nx = -dy / len * d, ny = dx / len * d;
    offsetSegs.push([
      { x: p0.x + nx, y: p0.y + ny },
      { x: p1.x + nx, y: p1.y + ny },
    ]);
  }

  if (offsetSegs.length === 0) return [];

  result.push(offsetSegs[0][0]);

  for (let i = 0; i < offsetSegs.length - 1; i++) {
    const end1 = offsetSegs[i][1];
    const start2 = offsetSegs[i + 1][0];

    const inter = lineLineIntersection(
      offsetSegs[i][0], offsetSegs[i][1],
      offsetSegs[i + 1][0], offsetSegs[i + 1][1],
    );

    if (!inter) {
      result.push(end1);
      result.push(start2);
      continue;
    }

    const miterDist = Math.sqrt((inter.x - end1.x) ** 2 + (inter.y - end1.y) ** 2);

    switch (config.cornerHandling) {
      case 'MITER':
        if (miterDist < Math.abs(d) * miterLimit) {
          result.push(inter);
        } else {
          result.push(end1);
          result.push(start2);
        }
        break;

      case 'ROUND': {
        const center = vertices[i + 1];
        const startAngle = Math.atan2(end1.y - center.y, end1.x - center.x);
        const endAngle = Math.atan2(start2.y - center.y, start2.x - center.x);
        const arcPts = tessellateArc({
          center, radius: Math.abs(d),
          startAngle, endAngle,
          direction: d > 0 ? 'CCW' : 'CW',
          pc: end1, pt: start2, mpc: center, pi: center,
        }, 0.5);
        for (const p of arcPts) result.push(p);
        break;
      }

      case 'CHAMFER':
        result.push(end1);
        result.push(start2);
        break;
    }
  }

  result.push(offsetSegs[offsetSegs.length - 1][1]);

  return result;
}

/**
 * Create a parallel arc offset by moving the radius inward or outward.
 * LEFT = outward (larger radius), RIGHT = inward (smaller radius).
 */
export function offsetArc(arc: ArcGeometry, config: OffsetConfig): ArcGeometry | null {
  const delta = config.side === 'LEFT' ? config.distance : -config.distance;
  const newRadius = arc.radius + delta;
  if (newRadius <= 0) return null;
  return { ...arc, radius: newRadius };
}

/**
 * Create a parallel circle by adjusting the radius.
 * LEFT = outward (larger), RIGHT = inward (smaller).
 */
export function offsetCircle(circle: CircleGeometry, config: OffsetConfig): CircleGeometry | null {
  const delta = config.side === 'LEFT' ? config.distance : -config.distance;
  const newRadius = circle.radius + delta;
  if (newRadius <= 0) return null;
  return { ...circle, radius: newRadius };
}

/**
 * Determine which side of a feature the cursor is on.
 * Returns 'LEFT' or 'RIGHT' based on cursor position relative to the feature geometry.
 */
export function computeSideFromCursor(feature: Feature, cursor: Point2D): 'LEFT' | 'RIGHT' {
  const g = feature.geometry;

  if (g.type === 'LINE' && g.start && g.end) {
    const dx = g.end.x - g.start.x;
    const dy = g.end.y - g.start.y;
    const cross = dx * (cursor.y - g.start.y) - dy * (cursor.x - g.start.x);
    return cross >= 0 ? 'LEFT' : 'RIGHT';
  }

  if ((g.type === 'POLYLINE' || g.type === 'POLYGON') && g.vertices && g.vertices.length >= 2) {
    // Find the closest segment and use its direction
    let minDist = Infinity;
    let bestIdx = 0;
    const len = g.type === 'POLYGON' ? g.vertices.length : g.vertices.length - 1;
    for (let i = 0; i < len; i++) {
      const j = (i + 1) % g.vertices.length;
      const d = pointToSegmentDistance(cursor, g.vertices[i], g.vertices[j]);
      if (d < minDist) { minDist = d; bestIdx = i; }
    }
    const j = (bestIdx + 1) % g.vertices.length;
    const v0 = g.vertices[bestIdx], v1 = g.vertices[j];
    const dx = v1.x - v0.x;
    const dy = v1.y - v0.y;
    const cross = dx * (cursor.y - v0.y) - dy * (cursor.x - v0.x);
    return cross >= 0 ? 'LEFT' : 'RIGHT';
  }

  if (g.type === 'CIRCLE' && g.circle) {
    const dist = Math.hypot(cursor.x - g.circle.center.x, cursor.y - g.circle.center.y);
    return dist >= g.circle.radius ? 'LEFT' : 'RIGHT';
  }

  if (g.type === 'ARC' && g.arc) {
    const dist = Math.hypot(cursor.x - g.arc.center.x, cursor.y - g.arc.center.y);
    return dist >= g.arc.radius ? 'LEFT' : 'RIGHT';
  }

  return 'LEFT';
}

/**
 * Compute the perpendicular distance from the cursor to the nearest point on a feature.
 * Returns 0 for unsupported geometry types.
 */
export function computeDistanceToFeature(feature: Feature, cursor: Point2D): number {
  const g = feature.geometry;

  if (g.type === 'LINE' && g.start && g.end) {
    return pointToSegmentDistance(cursor, g.start, g.end);
  }

  if ((g.type === 'POLYLINE' || g.type === 'POLYGON') && g.vertices && g.vertices.length >= 2) {
    let minDist = Infinity;
    const len = g.type === 'POLYGON' ? g.vertices.length : g.vertices.length - 1;
    for (let i = 0; i < len; i++) {
      const j = (i + 1) % g.vertices.length;
      const d = pointToSegmentDistance(cursor, g.vertices[i], g.vertices[j]);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  if (g.type === 'CIRCLE' && g.circle) {
    return Math.abs(Math.hypot(cursor.x - g.circle.center.x, cursor.y - g.circle.center.y) - g.circle.radius);
  }

  if (g.type === 'ARC' && g.arc) {
    return Math.abs(Math.hypot(cursor.x - g.arc.center.x, cursor.y - g.arc.center.y) - g.arc.radius);
  }

  return 0;
}

/**
 * Returns true if this feature type supports the offset operation.
 */
export function isOffsetableFeature(feature: Feature): boolean {
  const t = feature.geometry.type;
  return t === 'LINE' || t === 'POLYLINE' || t === 'POLYGON' || t === 'CIRCLE' || t === 'ARC' || t === 'SPLINE';
}
