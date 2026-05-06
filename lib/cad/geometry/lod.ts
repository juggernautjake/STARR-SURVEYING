// lib/cad/geometry/lod.ts
//
// Phase 7 §19 — Level-of-Detail + viewport-culling helpers.
// Pure, no-dep utilities the canvas render loop calls before
// drawing so big drawings (5k+ features) stay at 60 FPS.
//
// Three concerns covered here:
//   1. Per-feature bounding-box cache — `computeFeatureBBox`
//      walks every geometry shape and returns a world-space
//      bbox. Stable across renders so callers can memoize.
//   2. Frustum culling — `cullFeaturesToViewport` and the
//      annotation variant filter to features whose bbox
//      overlaps the current viewport bbox.
//   3. LOD decisions — `shouldUseLOD(viewportScale)` for the
//      render-as-dots threshold + `simplifyPolyline` (Douglas
//      –Peucker) for ultra-cheap polyline decimation when LOD
//      is active.
//
// The R-tree path the spec calls out (RBush) lands as a
// follow-up once feature counts justify it; for now a flat
// bbox scan is plenty fast and stays dep-free.

import type {
  AnnotationBase,
  BearingDistanceDimension,
  CurveDataAnnotation,
  MonumentLabel,
  AreaAnnotation,
  TextAnnotation,
  LeaderAnnotation,
} from '../labels/annotation-types';
import type { Feature, Point2D } from '../types';
import {
  createSpatialIndex,
  type SpatialIndex,
  type SpatialItem,
} from './spatial-index';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const EMPTY_BBOX: BoundingBox = {
  minX: Number.POSITIVE_INFINITY,
  minY: Number.POSITIVE_INFINITY,
  maxX: Number.NEGATIVE_INFINITY,
  maxY: Number.NEGATIVE_INFINITY,
};

export function isEmptyBBox(bbox: BoundingBox): boolean {
  return (
    bbox.minX > bbox.maxX ||
    bbox.minY > bbox.maxY ||
    !Number.isFinite(bbox.minX) ||
    !Number.isFinite(bbox.minY) ||
    !Number.isFinite(bbox.maxX) ||
    !Number.isFinite(bbox.maxY)
  );
}

export function bboxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  if (isEmptyBBox(a) || isEmptyBBox(b)) return false;
  return !(
    a.maxX < b.minX ||
    a.minX > b.maxX ||
    a.maxY < b.minY ||
    a.minY > b.maxY
  );
}

/**
 * Expand a bbox by a fractional padding (0.05 = +5% on each
 * side). Used by callers to keep features just outside the
 * viewport from popping during pan.
 */
export function expandBBox(
  bbox: BoundingBox,
  fraction: number
): BoundingBox {
  if (isEmptyBBox(bbox) || fraction <= 0) return bbox;
  const dx = (bbox.maxX - bbox.minX) * fraction;
  const dy = (bbox.maxY - bbox.minY) * fraction;
  return {
    minX: bbox.minX - dx,
    minY: bbox.minY - dy,
    maxX: bbox.maxX + dx,
    maxY: bbox.maxY + dy,
  };
}

// ────────────────────────────────────────────────────────────
// Feature bboxes
// ────────────────────────────────────────────────────────────

/**
 * Compute the world-space bounding box for a feature. Returns
 * an empty box (min > max) when the feature has no concrete
 * geometry yet so callers can drop it.
 */
export function computeFeatureBBox(f: Feature): BoundingBox {
  const g = f.geometry;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  function visit(p: Point2D): void {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  if (g.point) visit(g.point);
  if (g.start) visit(g.start);
  if (g.end) visit(g.end);
  if (g.vertices) for (const v of g.vertices) visit(v);
  if (g.circle) {
    visit({
      x: g.circle.center.x - g.circle.radius,
      y: g.circle.center.y - g.circle.radius,
    });
    visit({
      x: g.circle.center.x + g.circle.radius,
      y: g.circle.center.y + g.circle.radius,
    });
  }
  if (g.ellipse) {
    // Conservative axis-aligned envelope (ignores rotation;
    // overshoot is harmless for culling).
    const r = Math.max(g.ellipse.radiusX, g.ellipse.radiusY);
    visit({ x: g.ellipse.center.x - r, y: g.ellipse.center.y - r });
    visit({ x: g.ellipse.center.x + r, y: g.ellipse.center.y + r });
  }
  if (g.arc) {
    visit({
      x: g.arc.center.x - g.arc.radius,
      y: g.arc.center.y - g.arc.radius,
    });
    visit({
      x: g.arc.center.x + g.arc.radius,
      y: g.arc.center.y + g.arc.radius,
    });
  }
  if (g.spline) for (const v of g.spline.controlPoints) visit(v);
  if (g.image) {
    const w = g.image.width;
    const h = g.image.height;
    visit(g.image.position);
    visit({ x: g.image.position.x + w, y: g.image.position.y + h });
  }

  if (minX === Number.POSITIVE_INFINITY) {
    return { ...EMPTY_BBOX };
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Filter features down to those whose bbox overlaps the
 * viewport. Stable order (input order preserved). Callers
 * pass an already-padded viewport bbox if they want a
 * pre-pop hysteresis margin.
 *
 * Linear scan — O(n). For drawings with thousands of
 * features, prefer `cullFeaturesWithIndex` once a spatial
 * index has been built.
 */
export function cullFeaturesToViewport(
  features: Iterable<Feature>,
  viewport: BoundingBox
): Feature[] {
  const out: Feature[] = [];
  for (const f of features) {
    if (f.hidden) continue;
    const bbox = computeFeatureBBox(f);
    if (bboxesOverlap(bbox, viewport)) out.push(f);
  }
  return out;
}

/**
 * Build a spatial index keyed by feature id over the
 * supplied list. Hidden features are skipped and empty
 * bboxes are dropped so the index extent stays tight.
 */
export function buildFeatureIndex(
  features: Iterable<Feature>
): { index: SpatialIndex; bboxByFeatureId: Map<string, BoundingBox> } {
  const items: SpatialItem[] = [];
  const bboxByFeatureId = new Map<string, BoundingBox>();
  for (const f of features) {
    if (f.hidden) continue;
    const bbox = computeFeatureBBox(f);
    if (isEmptyBBox(bbox)) continue;
    items.push({ id: f.id, bbox });
    bboxByFeatureId.set(f.id, bbox);
  }
  return { index: createSpatialIndex(items), bboxByFeatureId };
}

/**
 * Index-accelerated viewport cull. The caller passes the
 * spatial index + the bbox cache produced by
 * `buildFeatureIndex` so we can do precise bbox-vs-viewport
 * intersection per candidate without re-walking each
 * feature's geometry.
 *
 * Falls back to the linear `cullFeaturesToViewport` when the
 * index is empty (e.g. after `clear()`-style rebuilds), so
 * callers don't need branch logic.
 */
export function cullFeaturesWithIndex(
  features: ReadonlyArray<Feature>,
  index: SpatialIndex,
  bboxByFeatureId: Map<string, BoundingBox>,
  viewport: BoundingBox
): Feature[] {
  if (index.count === 0) {
    return cullFeaturesToViewport(features, viewport);
  }
  const candidateIds = new Set(index.query(viewport));
  if (candidateIds.size === 0) return [];
  const out: Feature[] = [];
  for (const f of features) {
    if (f.hidden) continue;
    if (!candidateIds.has(f.id)) continue;
    const bbox = bboxByFeatureId.get(f.id);
    if (!bbox) continue;
    if (bboxesOverlap(bbox, viewport)) out.push(f);
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Annotations
// ────────────────────────────────────────────────────────────

/**
 * Bounding box for an annotation. Per-type since annotations
 * don't share a single anchor field.
 */
export function computeAnnotationBBox(a: AnnotationBase): BoundingBox {
  switch (a.type) {
    case 'BEARING_DISTANCE': {
      const b = a as BearingDistanceDimension;
      return bboxFromPoints([b.startPoint, b.endPoint]);
    }
    case 'CURVE_DATA': {
      const c = a as CurveDataAnnotation;
      const p = c.customPosition;
      if (!p) return { ...EMPTY_BBOX };
      const w = Math.max(...c.textLines.map((l) => l.length)) * c.fontSize * 0.6;
      const h = c.textLines.length * c.fontSize * c.lineSpacing;
      return { minX: p.x, minY: p.y - h, maxX: p.x + w, maxY: p.y };
    }
    case 'MONUMENT_LABEL': {
      const m = a as MonumentLabel;
      const w = m.text.length * m.fontSize * 0.6;
      const h = m.fontSize;
      return {
        minX: m.position.x,
        minY: m.position.y,
        maxX: m.position.x + w,
        maxY: m.position.y + h,
      };
    }
    case 'AREA_LABEL': {
      const ar = a as AreaAnnotation;
      const w = ar.text.length * ar.fontSize * 0.6;
      const h = ar.fontSize;
      return {
        minX: ar.position.x - w / 2,
        minY: ar.position.y - h / 2,
        maxX: ar.position.x + w / 2,
        maxY: ar.position.y + h / 2,
      };
    }
    case 'TEXT': {
      const t = a as TextAnnotation;
      const w = Math.max(t.text.length, 1) * t.fontSize * 0.6;
      const h = t.fontSize;
      return {
        minX: t.position.x,
        minY: t.position.y,
        maxX: t.position.x + w,
        maxY: t.position.y + h,
      };
    }
    case 'LEADER': {
      const l = a as LeaderAnnotation;
      const pts = [
        ...l.vertices,
        l.arrowPoint,
        l.textPosition,
      ];
      return bboxFromPoints(pts);
    }
    default:
      return { ...EMPTY_BBOX };
  }
}

export function cullAnnotationsToViewport(
  annotations: Iterable<AnnotationBase>,
  viewport: BoundingBox
): AnnotationBase[] {
  const out: AnnotationBase[] = [];
  for (const a of annotations) {
    if (!a.visible) continue;
    const bbox = computeAnnotationBBox(a);
    if (bboxesOverlap(bbox, viewport)) out.push(a);
  }
  return out;
}

function bboxFromPoints(points: Point2D[]): BoundingBox {
  if (points.length === 0) return { ...EMPTY_BBOX };
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

// ────────────────────────────────────────────────────────────
// LOD thresholds + polyline simplification
// ────────────────────────────────────────────────────────────

/**
 * `viewportScale` is world-units-per-pixel. When the camera
 * is zoomed out far enough that one pixel covers more than
 * ~0.5 world units, we drop into LOD mode (point symbols
 * collapse to dots, ultra-fine geometry is decimated).
 */
export function shouldUseLOD(viewportScale: number): boolean {
  if (!Number.isFinite(viewportScale) || viewportScale <= 0) return false;
  return viewportScale > 0.5;
}

/**
 * Threshold (in world units) below which Douglas-Peucker
 * collapses two consecutive vertices. The renderer should
 * scale this with viewportScale: the formula
 *   threshold = viewportScale * 0.5
 * gives a half-pixel epsilon so simplification is invisible
 * to the eye.
 */
export function lodSimplificationThreshold(viewportScale: number): number {
  if (!Number.isFinite(viewportScale) || viewportScale <= 0) return 0;
  return Math.max(0, viewportScale * 0.5);
}

/**
 * Douglas-Peucker polyline simplification. Returns the input
 * unchanged when fewer than 3 vertices are present or the
 * threshold is non-positive (caller stays cheap on the no-op
 * path).
 */
export function simplifyPolyline(
  vertices: Point2D[],
  threshold: number
): Point2D[] {
  if (vertices.length < 3 || threshold <= 0) return vertices;
  const keep = new Uint8Array(vertices.length);
  keep[0] = 1;
  keep[vertices.length - 1] = 1;
  simplifyRange(vertices, 0, vertices.length - 1, threshold, keep);
  const out: Point2D[] = [];
  for (let i = 0; i < vertices.length; i += 1) {
    if (keep[i]) out.push(vertices[i]);
  }
  return out;
}

function simplifyRange(
  vertices: Point2D[],
  start: number,
  end: number,
  threshold: number,
  keep: Uint8Array
): void {
  if (end <= start + 1) return;
  let maxDist = 0;
  let maxIndex = -1;
  const a = vertices[start];
  const b = vertices[end];
  for (let i = start + 1; i < end; i += 1) {
    const d = perpendicularDistance(vertices[i], a, b);
    if (d > maxDist) {
      maxDist = d;
      maxIndex = i;
    }
  }
  if (maxDist > threshold && maxIndex >= 0) {
    keep[maxIndex] = 1;
    simplifyRange(vertices, start, maxIndex, threshold, keep);
    simplifyRange(vertices, maxIndex, end, threshold, keep);
  }
}

function perpendicularDistance(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  const num = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x);
  const den = Math.hypot(dx, dy);
  return num / den;
}
