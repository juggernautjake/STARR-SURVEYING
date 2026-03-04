// lib/cad/geometry/arc-render.ts — Arc → polyline tessellation for rendering
import type { Point2D, ArcDefinition } from '../types';

export function tessellateArc(
  arc: ArcDefinition,
  maxDeviation: number = 0.1,
  zoom: number = 1,
): Point2D[] {
  const radiusPx = arc.radius * zoom;

  const maxAnglePerSeg = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - maxDeviation / Math.max(radiusPx, 1))));
  const totalAngle = Math.abs(arc.endAngle - arc.startAngle);
  const segments = Math.max(8, Math.ceil(totalAngle / Math.max(maxAnglePerSeg, 0.001)));

  const points: Point2D[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = arc.startAngle + (arc.endAngle - arc.startAngle) * t;
    points.push({
      x: arc.center.x + arc.radius * Math.cos(angle),
      y: arc.center.y + arc.radius * Math.sin(angle),
    });
  }

  return points;
}
