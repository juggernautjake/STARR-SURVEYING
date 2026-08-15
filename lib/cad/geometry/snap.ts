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

/** Centre of a feature that HAS one. Circles, ellipses and arcs carry it parametrically; every
 *  other geometry returns null rather than a bounding-box middle, because "centre of a polyline"
 *  is a different osnap (AutoCAD's Geometric Center) and this product's own UI promises only
 *  "the center of a circle, arc, or ellipse". C17. */
function getCenter(feature: Feature): Point2D | null {
  const g = feature.geometry;
  return g.circle?.center ?? g.ellipse?.center ?? g.arc?.center ?? null;
}

/** Is `theta` inside the arc's swept span? Angles are normalised to [0, 2π) before comparing, so a
 *  span that crosses east (0 rad) still reads correctly. */
function angleWithinArc(theta: number, arc: { startAngle: number; endAngle: number; anticlockwise: boolean }): boolean {
  const TAU = Math.PI * 2;
  const norm = (a: number) => ((a % TAU) + TAU) % TAU;
  const t = norm(theta);
  const from = norm(arc.anticlockwise ? arc.startAngle : arc.endAngle);
  const to = norm(arc.anticlockwise ? arc.endAngle : arc.startAngle);
  const span = norm(to - from);
  return norm(t - from) <= span + 1e-9;
}

/**
 * Find the best snap point near the cursor.
 *
 * Priority: ENDPOINT > MIDPOINT > CENTER > INTERSECTION > PERPENDICULAR > NEAREST > GRID.
 * That order is AutoCAD's: the snaps that name an exact, unambiguous feature of the geometry beat
 * the ones that merely land somewhere on it, and NEAREST — which always succeeds if anything is in
 * range — stays last so it can never mask a better answer.
 *
 * `fromPoint` is the point an in-progress command has already placed (the last drawing point).
 * PERPENDICULAR is meaningless without it — perpendicular *to what?* — so with no `fromPoint` that
 * branch yields nothing rather than guessing.
 */
export function findSnapPoint(
  cursor: Point2D,
  features: Feature[],
  snapRadius: number,
  zoom: number,
  snapTypes: SnapType[],
  gridSpacing: number,
  fromPoint?: Point2D | null,
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

  // CENTER — C17. Offered by the status-bar popover and the settings dialog since forever; this
  // engine had no branch for it, so ticking the box did nothing, for any drawing, ever.
  if (snapTypes.includes('CENTER')) {
    let best: SnapResult | null = null;
    for (const feature of features) {
      const c = getCenter(feature);
      if (!c) continue;
      const d = distance(cursor, c);
      if (d <= worldRadius && (!best || d < best.distance)) {
        best = { point: c, type: 'CENTER', featureId: feature.id, distance: d * zoom };
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

  // PERPENDICULAR — C17. The other box that did nothing. The settings dialog calls it "essential
  // for creating right-angle connections"; nothing in the engine produced this type.
  //
  // The candidate is the FOOT of the perpendicular dropped from the point already placed — not
  // from the cursor. That distinction is the whole snap: the surveyor is drawing a line from a
  // known point and wants it to meet this feature square. The cursor only chooses WHICH foot, by
  // being near it.
  if (snapTypes.includes('PERPENDICULAR') && fromPoint) {
    let best: SnapResult | null = null;
    const consider = (point: Point2D, featureId: string) => {
      const d = distance(cursor, point);
      if (d <= worldRadius && (!best || d < best.distance)) {
        best = { point, type: 'PERPENDICULAR', featureId, distance: d * zoom };
      }
    };
    for (const feature of features) {
      for (const [a, b] of getSegments(feature)) {
        // Clamped to the segment: a foot out past the end would put the point on a line that does
        // not exist there, which is a worse answer than no snap.
        const { point } = closestPointOnSegment(fromPoint, a, b);
        consider(point, feature.id);
      }
      // A radius always meets its circle at a right angle, so the foot is where the ray from the
      // centre through `fromPoint` crosses the curve.
      const g = feature.geometry;
      const round = g.circle ?? g.arc;
      if (round) {
        const dx = fromPoint.x - round.center.x;
        const dy = fromPoint.y - round.center.y;
        const len = Math.hypot(dx, dy);
        if (len > 1e-9) {
          const theta = Math.atan2(dy, dx);
          // Both crossings — the near side and the far side — are genuine perpendicular feet.
          for (const t of [theta, theta + Math.PI]) {
            if (g.arc && !angleWithinArc(t, g.arc)) continue;
            consider(
              {
                x: round.center.x + Math.cos(t) * round.radius,
                y: round.center.y + Math.sin(t) * round.radius,
              },
              feature.id,
            );
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
