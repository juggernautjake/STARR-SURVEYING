// lib/cad/geometry/offset.ts — Parallel offset engine
import type {
  Point2D,
  OffsetConfig,
  CircleGeometry,
  EllipseGeometry,
  ArcGeometry,
  SplineGeometry,
  Feature,
} from '../types';
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
 * Create a parallel ellipse by adjusting both semi-axes by
 * the offset distance. The result is a true offset only when
 * the source is a circle; for a non-uniform ellipse this is
 * an approximation that's accurate to surveying tolerances
 * when `distance` is much smaller than `min(radiusX,
 * radiusY)`. The exact offset of an ellipse is a quartic
 * curve (not another ellipse) — stored as an ellipse here
 * so the result stays editable in the same tools that
 * created the source.
 *
 * LEFT = outward (axes grow), RIGHT = inward (axes shrink).
 * Returns null when shrinking would collapse either axis.
 */
export function offsetEllipse(
  ellipse: EllipseGeometry,
  config: OffsetConfig
): EllipseGeometry | null {
  const delta = config.side === 'LEFT' ? config.distance : -config.distance;
  const radiusX = ellipse.radiusX + delta;
  const radiusY = ellipse.radiusY + delta;
  if (radiusX <= 0 || radiusY <= 0) return null;
  return { ...ellipse, radiusX, radiusY };
}

/**
 * Create a parallel spline whose control points are
 * perpendicular-offset from the source. Implementation: the
 * Tiller-Hanson approximation — each control point is
 * displaced along the bisector of its neighbouring tangents
 * by the offset distance.
 *
 * Visual fidelity is excellent when curvature is moderate
 * (typical for survey curves); degrades for tight loops, in
 * which case the result is still a valid cubic-bezier chain
 * but may slightly over- or under-shoot the geometric
 * parallel. For extreme accuracy needs, callers can fall
 * back to the tessellate → `offsetPolyline` path that
 * `operations.ts` ships today.
 *
 * Returns null when the source has fewer than 4 control
 * points (no full cubic segment).
 */
export function offsetSpline(
  spline: SplineGeometry,
  config: OffsetConfig
): SplineGeometry | null {
  const cps = spline.controlPoints;
  if (cps.length < 4) return null;
  const sign = config.side === 'LEFT' ? 1 : -1;
  const d = config.distance * sign;
  const out: Point2D[] = new Array(cps.length);
  for (let i = 0; i < cps.length; i += 1) {
    // Compute the bisector tangent at this control point —
    // average of the segment leading in (i-1 → i) and
    // leading out (i → i+1). At endpoints, fall back to the
    // single available segment.
    const inDir = i > 0 ? subNorm(cps[i], cps[i - 1]) : null;
    const outDir =
      i < cps.length - 1 ? subNorm(cps[i + 1], cps[i]) : null;
    let tx: number;
    let ty: number;
    if (inDir && outDir) {
      tx = (inDir.x + outDir.x) / 2;
      ty = (inDir.y + outDir.y) / 2;
      const m = Math.hypot(tx, ty);
      if (m < 1e-10) {
        // Tangents cancel (cusp). Fall back to the leading-
        // out tangent so the offset stays meaningful.
        tx = outDir.x;
        ty = outDir.y;
      } else {
        tx /= m;
        ty /= m;
      }
    } else if (inDir) {
      tx = inDir.x;
      ty = inDir.y;
    } else if (outDir) {
      tx = outDir.x;
      ty = outDir.y;
    } else {
      // Single-point degenerate — keep the point.
      out[i] = { ...cps[i] };
      continue;
    }
    // Perpendicular: rotate +90° (CCW) for LEFT, -90° (CW)
    // for RIGHT. The `sign` baked into `d` flips the
    // direction.
    out[i] = {
      x: cps[i].x + (-ty) * d,
      y: cps[i].y + tx * d,
    };
  }
  return { ...spline, controlPoints: out };
}

function subNorm(a: Point2D, b: Point2D): Point2D | null {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const m = Math.hypot(dx, dy);
  if (m < 1e-10) return null;
  return { x: dx / m, y: dy / m };
}

// ────────────────────────────────────────────────────────────
// Scale-offset path — proportional resize around the
// feature's centroid. Treats the offset operation as a
// uniform scale rather than a perpendicular distance, so the
// surveyor can blow a shape up or shrink it down while
// keeping the same proportions and orientation.
// ────────────────────────────────────────────────────────────

/** Centroid of an arbitrary point list (arithmetic mean).
 *  Returns `{ x: 0, y: 0 }` when the list is empty so the
 *  scale path stays defined for degenerate inputs. */
export function pointsCentroid(points: ReadonlyArray<Point2D>): Point2D {
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

function scalePointAround(
  p: Point2D,
  origin: Point2D,
  factor: number
): Point2D {
  return {
    x: origin.x + (p.x - origin.x) * factor,
    y: origin.y + (p.y - origin.y) * factor,
  };
}

/** Scale a polyline around its own centroid. The result is
 *  geometrically similar to the source (same angles, same
 *  proportions) but bigger / smaller per `factor`. */
export function scalePolylineAroundCentroid(
  vertices: ReadonlyArray<Point2D>,
  factor: number
): Point2D[] {
  if (vertices.length === 0 || factor <= 0) return [];
  const c = pointsCentroid(vertices);
  return vertices.map((v) => scalePointAround(v, c, factor));
}

export function scaleCircleAroundCenter(
  circle: CircleGeometry,
  factor: number
): CircleGeometry | null {
  if (factor <= 0) return null;
  return { ...circle, radius: circle.radius * factor };
}

export function scaleEllipseAroundCenter(
  ellipse: EllipseGeometry,
  factor: number
): EllipseGeometry | null {
  if (factor <= 0) return null;
  return {
    ...ellipse,
    radiusX: ellipse.radiusX * factor,
    radiusY: ellipse.radiusY * factor,
  };
}

export function scaleArcAroundCenter(
  arc: ArcGeometry,
  factor: number
): ArcGeometry | null {
  if (factor <= 0) return null;
  return { ...arc, radius: arc.radius * factor };
}

export function scaleSplineAroundCentroid(
  spline: SplineGeometry,
  factor: number
): SplineGeometry | null {
  if (factor <= 0 || spline.controlPoints.length === 0) return null;
  const c = pointsCentroid(spline.controlPoints);
  return {
    ...spline,
    controlPoints: spline.controlPoints.map((p) =>
      scalePointAround(p, c, factor)
    ),
  };
}

/**
 * Resolve the effective scale factor from an `OffsetConfig`
 * when the caller is in SCALE mode. Defaults to 1 (no-op)
 * when the field is omitted; treats `LEFT` as "blow up" and
 * `RIGHT` as "shrink" so the existing side toggle works as
 * a sign flip without surfacing a fresh control. The
 * shrink path inverts: factor=0.75 with side=RIGHT becomes
 * factor=1/0.75 with side=LEFT (so the "RIGHT 0.75" UX
 * shrinks to 75 %). The default sign convention assumes
 * the caller always passes a factor > 0; values ≤ 0
 * resolve to 1 to keep the operation well-defined.
 */
export function resolveScaleFactor(config: OffsetConfig): number {
  const raw = config.scaleFactor;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return 1;
  }
  // When the caller passed a factor <1 we leave it alone
  // (shrink). When factor >1 we leave it alone (blow up).
  // The `side` flag only matters when the surveyor toggled
  // it from LEFT (default) to RIGHT in the picker; in that
  // case we invert so RIGHT acts as the inverse operation
  // (RIGHT 1.5 = scale by 1/1.5 ≈ 0.667).
  if (config.side === 'RIGHT' && raw !== 1) return 1 / raw;
  return raw;
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

  if (g.type === 'ELLIPSE' && g.ellipse) {
    // Map the cursor into the ellipse's local axis-aligned
    // frame and compare against the unit circle.
    const e = g.ellipse;
    const cosR = Math.cos(-e.rotation);
    const sinR = Math.sin(-e.rotation);
    const dx = cursor.x - e.center.x;
    const dy = cursor.y - e.center.y;
    const lx = (dx * cosR - dy * sinR) / e.radiusX;
    const ly = (dx * sinR + dy * cosR) / e.radiusY;
    return Math.hypot(lx, ly) >= 1 ? 'LEFT' : 'RIGHT';
  }

  if (g.type === 'ARC' && g.arc) {
    const dist = Math.hypot(cursor.x - g.arc.center.x, cursor.y - g.arc.center.y);
    return dist >= g.arc.radius ? 'LEFT' : 'RIGHT';
  }

  if (g.type === 'SPLINE' && g.spline) {
    // Find the closest control-point segment and use its
    // direction. The tangent of a cubic-bezier segment
    // varies along the curve but the chord between
    // neighbouring control points is a good enough proxy
    // for which side the cursor sits on.
    const cps = g.spline.controlPoints;
    if (cps.length < 2) return 'LEFT';
    let minDist = Infinity;
    let bestI = 0;
    for (let i = 0; i + 1 < cps.length; i += 1) {
      const d = pointToSegmentDistance(cursor, cps[i], cps[i + 1]);
      if (d < minDist) {
        minDist = d;
        bestI = i;
      }
    }
    const a = cps[bestI];
    const b = cps[bestI + 1];
    const cross = (b.x - a.x) * (cursor.y - a.y) - (b.y - a.y) * (cursor.x - a.x);
    return cross >= 0 ? 'LEFT' : 'RIGHT';
  }

  if (g.type === 'MIXED_GEOMETRY' && g.vertices && g.vertices.length >= 2) {
    let minDist = Infinity;
    let bestI = 0;
    for (let i = 0; i + 1 < g.vertices.length; i += 1) {
      const d = pointToSegmentDistance(cursor, g.vertices[i], g.vertices[i + 1]);
      if (d < minDist) {
        minDist = d;
        bestI = i;
      }
    }
    const v0 = g.vertices[bestI];
    const v1 = g.vertices[bestI + 1];
    const cross =
      (v1.x - v0.x) * (cursor.y - v0.y) -
      (v1.y - v0.y) * (cursor.x - v0.x);
    return cross >= 0 ? 'LEFT' : 'RIGHT';
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

  if (g.type === 'ELLIPSE' && g.ellipse) {
    // Approximate by sampling 64 points on the ellipse and
    // taking the minimum distance — exact distance to an
    // ellipse needs an iterative root-finder, but for
    // cursor-side detection the sampled minimum is plenty
    // accurate at 5° resolution.
    const e = g.ellipse;
    const cosR = Math.cos(e.rotation);
    const sinR = Math.sin(e.rotation);
    let min = Infinity;
    for (let i = 0; i < 64; i += 1) {
      const t = (i / 64) * Math.PI * 2;
      const px = e.radiusX * Math.cos(t);
      const py = e.radiusY * Math.sin(t);
      const wx = e.center.x + px * cosR - py * sinR;
      const wy = e.center.y + px * sinR + py * cosR;
      const d = Math.hypot(cursor.x - wx, cursor.y - wy);
      if (d < min) min = d;
    }
    return min;
  }

  if (g.type === 'ARC' && g.arc) {
    return Math.abs(Math.hypot(cursor.x - g.arc.center.x, cursor.y - g.arc.center.y) - g.arc.radius);
  }

  if (g.type === 'SPLINE' && g.spline) {
    const cps = g.spline.controlPoints;
    if (cps.length < 2) return 0;
    let min = Infinity;
    for (let i = 0; i + 1 < cps.length; i += 1) {
      const d = pointToSegmentDistance(cursor, cps[i], cps[i + 1]);
      if (d < min) min = d;
    }
    return min;
  }

  if (g.type === 'MIXED_GEOMETRY' && g.vertices && g.vertices.length >= 2) {
    let min = Infinity;
    for (let i = 0; i + 1 < g.vertices.length; i += 1) {
      const d = pointToSegmentDistance(cursor, g.vertices[i], g.vertices[i + 1]);
      if (d < min) min = d;
    }
    return min;
  }

  return 0;
}

/**
 * Returns true if this feature type supports the offset
 * operation. Covers every shape kind the writer / reader
 * round-trip + the mixed-geometry container.
 */
export function isOffsetableFeature(feature: Feature): boolean {
  const t = feature.geometry.type;
  return (
    t === 'LINE' ||
    t === 'POLYLINE' ||
    t === 'POLYGON' ||
    t === 'CIRCLE' ||
    t === 'ELLIPSE' ||
    t === 'ARC' ||
    t === 'SPLINE' ||
    t === 'MIXED_GEOMETRY'
  );
}
