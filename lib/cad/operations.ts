// lib/cad/operations.ts — Shared CAD operations (rotate, flip, duplicate, clipboard)
// Used by FeatureContextMenu, ToolBar variants, and keyboard shortcuts.

import { generateId } from './types';
import type { Feature, OffsetMode, Point2D } from './types';
import { rotate, mirror, scale, transformFeature, translate } from './geometry/transform';
import { computeBounds } from './geometry/bounds';
import { closestPointOnSegment } from './geometry/point';
import { segmentSegmentIntersection, lineLineIntersection } from './geometry/intersection';
import { fitPointsToBezier } from './geometry/curve-render';
import { simplifyPolyline } from './geometry/simplify';
import {
  offsetPolyline,
  offsetArc,
  offsetCircle,
  offsetEllipse,
  offsetSpline,
  scaleArcAroundCenter,
  scaleCircleAroundCenter,
  scaleEllipseAroundCenter,
  scalePolylineAroundCentroid,
  scaleSplineAroundCentroid,
  resolveScaleFactor,
  getSegmentEndpoints,
  isSegmentableFeature,
  pointsCentroid,
} from './geometry/offset';
import { useDrawingStore } from './store/drawing-store';
import { useSelectionStore } from './store/selection-store';
import { useUndoStore, makeBatchEntry, makeAddFeatureEntry, makeRemoveFeatureEntry } from './store/undo-store';
import { useTraverseStore } from './store/traverse-store';
import { findLinkedFeatureIds } from './operations/find-linked-geometry';
import { useViewportStore } from './store/viewport-store';

// ─────────────────────────────────────────────
// Clipboard
// ─────────────────────────────────────────────
let _clipboard: Feature[] = [];
/** Phase 8 §11.7 Slice 11 — layer-id → { name, color } map
 *  captured at copy time so cross-drawing paste can resolve
 *  layer references against the destination drawing's layer
 *  table by name. Empty when copy happened without layer
 *  snapshots (old call sites). */
let _clipboardLayers: Record<string, { name: string; color: string }> = {};
/** Drawing id the clipboard contents came from. Used to
 *  fast-path same-drawing pastes (no resolution needed). */
let _clipboardSourceDocId: string | null = null;

export function copyToClipboard(
  features: Feature[],
  layerSnapshots?: Record<string, { name: string; color: string }>,
  sourceDocumentId?: string,
): void {
  _clipboard = features.map((f) => ({ ...f }));
  _clipboardLayers = layerSnapshots ? { ...layerSnapshots } : {};
  _clipboardSourceDocId = sourceDocumentId ?? null;
}

/**
 * Translate raw clipboard features. Used by same-drawing
 * pastes where layer ids are guaranteed valid.
 */
export function pasteFromClipboard(
  offsetX = 10,
  offsetY = -10,
): Feature[] {
  if (_clipboard.length === 0) return [];
  return _clipboard.map((f) => {
    const newF: Feature = JSON.parse(JSON.stringify(f));
    newF.id = generateId();
    // Offset geometry
    const geom = newF.geometry;
    if (geom.type === 'POINT' && geom.point) {
      geom.point = { x: geom.point.x + offsetX, y: geom.point.y + offsetY };
    } else if (geom.type === 'LINE') {
      if (geom.start) geom.start = { x: geom.start.x + offsetX, y: geom.start.y + offsetY };
      if (geom.end) geom.end = { x: geom.end.x + offsetX, y: geom.end.y + offsetY };
    } else if (geom.type === 'IMAGE' && geom.image) {
      geom.image = {
        ...geom.image,
        position: { x: geom.image.position.x + offsetX, y: geom.image.position.y + offsetY },
      };
    } else if (geom.vertices) {
      geom.vertices = geom.vertices.map((v) => ({ x: v.x + offsetX, y: v.y + offsetY }));
    }
    return newF;
  });
}

export function hasClipboard(): boolean {
  return _clipboard.length > 0;
}

export function getClipboardCount(): number {
  return _clipboard.length;
}

/**
 * Read the source-drawing id of the current clipboard. Null
 * when no clipboard exists or the copier didn't tag it.
 */
export function getClipboardSourceDocId(): string | null {
  return _clipboardSourceDocId;
}

/**
 * Read a snapshot of every layer the clipboard contents
 * reference. Used by the cross-drawing paste path to resolve
 * source layer ids against the destination drawing.
 */
export function getClipboardLayerSnapshots(): Record<string, { name: string; color: string }> {
  return { ..._clipboardLayers };
}

// ─────────────────────────────────────────────
// Centroid helpers
// ─────────────────────────────────────────────

/** Get world-space vertices for a feature (for centroid calc) */
export function getFeaturePoints(feature: Feature): Point2D[] {
  const g = feature.geometry;
  if (g.type === 'POINT' && g.point) return [g.point];
  if (g.type === 'LINE') return [g.start!, g.end!].filter(Boolean);
  return g.vertices ?? [];
}

/** Compute bounding-box centroid of a set of features */
export function computeSelectionCentroid(featureIds: string[]): Point2D {
  const drawingStore = useDrawingStore.getState();
  const allPts: Point2D[] = [];
  for (const id of featureIds) {
    const f = drawingStore.getFeature(id);
    if (f) allPts.push(...getFeaturePoints(f));
  }
  if (allPts.length === 0) return { x: 0, y: 0 };
  const bounds = computeBounds(allPts);
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

// ─────────────────────────────────────────────
// Arc helpers — used by split / divide / reverse /
// pointAtDistanceAlong so every arc-edit tool shares the
// same parameterisation. `t` is the normalised arc-length
// parameter in [0, 1] from startAngle towards endAngle in
// the arc's traversal direction (anticlockwise toggle).
// ─────────────────────────────────────────────

/** Signed angular span of an arc, in radians. Positive when
 *  the arc traverses counter-clockwise, negative when it
 *  traverses clockwise. Always in (-2π, 2π). */
function arcSweep(arc: { startAngle: number; endAngle: number; anticlockwise: boolean }): number {
  const TAU = 2 * Math.PI;
  const raw = arc.endAngle - arc.startAngle;
  // Normalise to the traversal direction: CCW arcs have a
  // positive signed sweep, CW arcs have a negative one.
  if (arc.anticlockwise) {
    let s = raw;
    while (s <= 0) s += TAU;
    while (s > TAU) s -= TAU;
    return s;
  }
  let s = raw;
  while (s >= 0) s -= TAU;
  while (s < -TAU) s += TAU;
  return s;
}

function arcLength(arc: { radius: number; startAngle: number; endAngle: number; anticlockwise: boolean }): number {
  return Math.abs(arc.radius * arcSweep(arc));
}

function pointAtArcParam(
  arc: { center: Point2D; radius: number; startAngle: number; endAngle: number; anticlockwise: boolean },
  t: number,
): Point2D {
  const tt = Math.max(0, Math.min(1, t));
  const sweep = arcSweep(arc);
  const a = arc.startAngle + tt * sweep;
  return {
    x: arc.center.x + arc.radius * Math.cos(a),
    y: arc.center.y + arc.radius * Math.sin(a),
  };
}

/** Closest-point projection: returns the parameter t in
 *  [0, 1] of the arc point closest to `worldPt`, plus the
 *  projected world coords. When `worldPt` projects outside
 *  the arc's angular span, t is clamped to 0 or 1 and the
 *  point lands on the nearer endpoint. */
function arcParamFromPoint(
  arc: { center: Point2D; radius: number; startAngle: number; endAngle: number; anticlockwise: boolean },
  worldPt: Point2D,
): { t: number; point: Point2D } {
  const TAU = 2 * Math.PI;
  const dx = worldPt.x - arc.center.x;
  const dy = worldPt.y - arc.center.y;
  const angle = Math.atan2(dy, dx);
  const sweep = arcSweep(arc);
  // Express the candidate angle as a delta from startAngle in
  // the traversal direction so it can be compared against
  // sweep to decide inside-vs-outside.
  let delta = angle - arc.startAngle;
  if (arc.anticlockwise) {
    while (delta < 0) delta += TAU;
    while (delta > TAU) delta -= TAU;
  } else {
    while (delta > 0) delta -= TAU;
    while (delta < -TAU) delta += TAU;
  }
  const sweepAbs = Math.abs(sweep);
  const deltaAbs = Math.abs(delta);
  let t: number;
  if (deltaAbs <= sweepAbs) {
    t = sweepAbs === 0 ? 0 : deltaAbs / sweepAbs;
  } else {
    // Outside the angular span — pick whichever endpoint is
    // closer by comparing the wrap-around distance.
    const fromStart = deltaAbs;
    const fromEnd = Math.abs(TAU - deltaAbs);
    t = fromStart <= fromEnd ? 0 : 1;
  }
  return { t, point: pointAtArcParam(arc, t) };
}

// ─────────────────────────────────────────────
// Spline helpers — used by divideFeatureBy /
// pointAtDistanceAlong / explodeFeature so each operation
// shares the same arc-length parameterisation. A spline's
// `controlPoints` array carries 3N+1 points for N cubic
// bezier segments. We sample each segment uniformly in t,
// build a cumulative arc-length table, and let callers
// project a normalised parameter back into world space.
// ─────────────────────────────────────────────

/** Evaluate a cubic bezier segment at parameter t ∈ [0,1]. */
function cubicBezierPoint(
  p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number,
): Point2D {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
  };
}

/**
 * Sample a spline into `samplesPerSegment` evenly-t-spaced
 * points per cubic segment. With the default of 32 samples
 * a typical 3–5 segment surveyor spline yields 100-200 points
 * — plenty for arc-length integration error well under a
 * hundredth of a foot at survey scales. Returns the full
 * polyline including a final point on the last segment.
 */
function sampleSpline(
  controlPoints: Point2D[],
  samplesPerSegment: number = 32,
): Point2D[] {
  const numSegments = Math.floor((controlPoints.length - 1) / 3);
  if (numSegments < 1) return controlPoints.slice();
  const out: Point2D[] = [];
  for (let seg = 0; seg < numSegments; seg += 1) {
    const idx = seg * 3;
    const p0 = controlPoints[idx];
    const p1 = controlPoints[idx + 1];
    const p2 = controlPoints[idx + 2];
    const p3 = controlPoints[idx + 3];
    // Skip the t=0 sample on every segment except the first
    // so we don't duplicate the segment-boundary vertex.
    const startStep = seg === 0 ? 0 : 1;
    for (let s = startStep; s <= samplesPerSegment; s += 1) {
      const t = s / samplesPerSegment;
      out.push(cubicBezierPoint(p0, p1, p2, p3, t));
    }
  }
  return out;
}

/** Total arc-length and cumulative table for a sampled spline. */
function splineArcLengthTable(samples: Point2D[]): { total: number; cum: number[] } {
  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < samples.length; i += 1) {
    total += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
    cum.push(total);
  }
  return { total, cum };
}

/** Walk the cumulative arc-length table to find the world-
 *  space point at parameter t ∈ [0, 1] along the spline. */
function pointAlongSpline(samples: Point2D[], t: number): Point2D {
  if (samples.length === 0) return { x: 0, y: 0 };
  if (samples.length === 1) return { ...samples[0] };
  const { total, cum } = splineArcLengthTable(samples);
  if (total < 1e-12) return { ...samples[0] };
  const target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < cum.length; i += 1) {
    if (cum[i] >= target) {
      const segLen = cum[i] - cum[i - 1];
      const localT = segLen > 1e-12 ? (target - cum[i - 1]) / segLen : 0;
      const a = samples[i - 1];
      const b = samples[i];
      return {
        x: a.x + (b.x - a.x) * localT,
        y: a.y + (b.y - a.y) * localT,
      };
    }
  }
  return { ...samples[samples.length - 1] };
}

// ─────────────────────────────────────────────
// Transform operations
// ─────────────────────────────────────────────

export function rotateSelection(angleDeg: number, center?: Point2D): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0) return;

  const pivot = center ?? computeSelectionCentroid(ids);
  const angleRad = (angleDeg * Math.PI) / 180;

  const ops = ids
    .map((id) => {
      const f = drawingStore.getFeature(id);
      if (!f) return null;
      const newF = transformFeature(f, (p) => rotate(p, pivot, angleRad));
      drawingStore.updateFeature(id, { geometry: newF.geometry });
      return { type: 'MODIFY_FEATURE' as const, data: { id, before: f, after: newF } };
    })
    .filter(Boolean) as { type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }[];

  if (ops.length > 0) {
    undoStore.pushUndo(makeBatchEntry(`Rotate ${angleDeg}°`, ops));
  }
}

export function flipSelectionHorizontal(): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0) return;

  const centroid = computeSelectionCentroid(ids);
  // Mirror line: vertical line through centroid (from centroid going straight up)
  const lineA: Point2D = { x: centroid.x, y: centroid.y - 1 };
  const lineB: Point2D = { x: centroid.x, y: centroid.y + 1 };

  const ops = ids
    .map((id) => {
      const f = drawingStore.getFeature(id);
      if (!f) return null;
      const newF = transformFeature(f, (p) => mirror(p, lineA, lineB));
      drawingStore.updateFeature(id, { geometry: newF.geometry });
      return { type: 'MODIFY_FEATURE' as const, data: { id, before: f, after: newF } };
    })
    .filter(Boolean) as { type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }[];

  if (ops.length > 0) {
    undoStore.pushUndo(makeBatchEntry('Flip Horizontal', ops));
  }
}

/**
 * Flip the selection through one of four axes — H, V, or the
 * two diagonals D1 (y=x, NE↔SW) and D2 (y=-x, NW↔SE) — all
 * passing through the selection's centroid. Honours `copy`:
 * when true the originals are preserved and the flipped
 * features are added as new entities (returned in selection).
 */
/**
 * Build a rectangular array of the current selection.
 * `rows` × `cols` copies are placed at world-unit offsets
 * `(col * colSpacing, row * rowSpacing)` from the original.
 * The original selection (row 0, col 0) stays in place; the
 * remaining `rows*cols - 1` cells are added as new features
 * and recorded in a single batch undo entry. polylineGroupId
 * properties are remapped so each copy gets its own group,
 * matching the duplicate-selection convention.
 */
export function arraySelectionRectangular(
  rows: number,
  cols: number,
  rowSpacing: number,
  colSpacing: number,
): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0) return;
  const totalCells = Math.max(1, Math.floor(rows)) * Math.max(1, Math.floor(cols));
  if (totalCells <= 1) return;
  if (!Number.isFinite(rowSpacing) || !Number.isFinite(colSpacing)) return;

  const sourceFeatures = ids
    .map((id) => drawingStore.getFeature(id))
    .filter(Boolean) as Feature[];
  if (sourceFeatures.length === 0) return;

  // For every (row, col) pair that isn't (0, 0), clone every
  // selected feature and translate by (col * colSpacing,
  // row * rowSpacing). polylineGroupIds collapse per-cell
  // so each copy is its own group, preventing accidental
  // co-selection later.
  const newFeatures: Feature[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (r === 0 && c === 0) continue; // original
      const dx = c * colSpacing;
      const dy = r * rowSpacing;
      const cellGroupMap = new Map<string, string>();
      for (const f of sourceFeatures) {
        const cloned: Feature = JSON.parse(JSON.stringify(f));
        cloned.id = generateId();
        const translated = transformFeature(cloned, (p) => translate(p, dx, dy));
        const oldGroupId = f.properties.polylineGroupId as string | undefined;
        if (oldGroupId) {
          if (!cellGroupMap.has(oldGroupId)) cellGroupMap.set(oldGroupId, generateId());
          translated.properties = {
            ...translated.properties,
            polylineGroupId: cellGroupMap.get(oldGroupId)!,
          };
        }
        newFeatures.push(translated);
      }
    }
  }

  if (newFeatures.length === 0) return;
  drawingStore.addFeatures(newFeatures);
  const ops = newFeatures.map((f) => ({ type: 'ADD_FEATURE' as const, data: f }));
  undoStore.pushUndo(makeBatchEntry(`Array ${rows}×${cols}`, ops));
  // Replace the selection with the original + every copy so
  // the user can chain ops on the whole grid.
  selectionStore.selectMultiple(
    [...ids, ...newFeatures.map((f) => f.id)],
    'REPLACE',
  );
}

/**
 * Extend a LINE or POLYLINE feature so that the endpoint
 * nearest `worldPt` is lengthened along its tangent
 * direction until it meets the closest target feature. The
 * tangent comes from the segment incident to that endpoint,
 * pointing outward. Targets can be LINE / POLYLINE / POLYGON
 * / MIXED_GEOMETRY (curved targets are out of scope for this
 * slice — same as TRIM).
 *
 * If no target is found in the extension direction the
 * operation is a no-op (the surveyor just clicked into space
 * with no feature in front of the line). Returns true on a
 * successful mutation.
 */
export function extendFeatureTo(featureId: string, worldPt: Point2D): boolean {
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const f = drawingStore.getFeature(featureId);
  if (!f) return false;
  const g = f.geometry;

  let chain: Point2D[] | null = null;
  if (g.type === 'LINE' && g.start && g.end) chain = [g.start, g.end];
  else if (g.type === 'POLYLINE' && g.vertices && g.vertices.length >= 2) chain = g.vertices.slice();
  else return false;
  if (!chain) return false;

  // Decide which endpoint to extend — the one closer to the
  // cursor. Tangent direction points OUT of the chain at
  // that endpoint (i.e. continues the last segment beyond
  // its endpoint). The extended-from "anchor" is the chain's
  // current endpoint; the extended-to point is the closest
  // target intersection along the ray.
  const startPt = chain[0];
  const endPt = chain[chain.length - 1];
  const dStart = Math.hypot(worldPt.x - startPt.x, worldPt.y - startPt.y);
  const dEnd = Math.hypot(worldPt.x - endPt.x, worldPt.y - endPt.y);
  const extendStart = dStart < dEnd;
  const anchor = extendStart ? startPt : endPt;
  const tangentSrc = extendStart ? chain[1] : chain[chain.length - 2];
  // Tangent unit vector pointing AWAY from the chain (i.e.
  // start → out-of-chain for the start case, end → out-of-
  // chain for the end case).
  const tx0 = anchor.x - tangentSrc.x;
  const ty0 = anchor.y - tangentSrc.y;
  const tlen = Math.hypot(tx0, ty0);
  if (tlen < 1e-10) return false;
  const tx = tx0 / tlen;
  const ty = ty0 / tlen;

  // Ray-segment intersections: solve anchor + s*(tx,ty) on
  // line (c, d) for s >= 0 (along extension direction) and
  // u in [0, 1] (within target segment). Pick the smallest
  // positive s. We exclude any hit at s ≈ 0 because that's
  // the existing endpoint already touching another feature
  // (no real extension to perform).
  //
  // Canonical 2D ray-segment derivation:
  //   anchor + s*T = c + u*(d - c)
  //   denom = Tx*(dy-cy) - Ty*(dx-cx)
  //   s     = ((cx-Ax)*(dy-cy) - (cy-Ay)*(dx-cx)) / denom
  //   u     = ((cx-Ax)*Ty     - (cy-Ay)*Tx)        / denom
  const targets = drawingStore.getAllFeatures().filter((t) => t.id !== featureId && getFeatureSegments(t) !== null);
  let bestS = Infinity;
  let bestPt: Point2D | null = null;
  for (const t of targets) {
    const segs = getFeatureSegments(t);
    if (!segs) continue;
    for (const [c, d] of segs) {
      const dxCd = d.x - c.x;
      const dyCd = d.y - c.y;
      const denom = tx * dyCd - ty * dxCd;
      if (Math.abs(denom) < 1e-10) continue;
      const cxAx = c.x - anchor.x;
      const cyAy = c.y - anchor.y;
      const s = (cxAx * dyCd - cyAy * dxCd) / denom;
      const u = (cxAx * ty - cyAy * tx) / denom;
      if (s <= 1e-6) continue; // skip backwards or zero hits
      if (u < -1e-6 || u > 1 + 1e-6) continue;
      if (s < bestS) {
        bestS = s;
        bestPt = { x: anchor.x + s * tx, y: anchor.y + s * ty };
      }
    }
  }
  if (!bestPt) return false;

  // Build the new geometry — replace the relevant endpoint.
  let newGeom: Feature['geometry'];
  if (g.type === 'LINE' && g.start && g.end) {
    newGeom = {
      type: 'LINE',
      start: extendStart ? bestPt : g.start,
      end: extendStart ? g.end : bestPt,
    };
  } else if (g.type === 'POLYLINE' && g.vertices) {
    const newVerts = g.vertices.slice();
    if (extendStart) newVerts[0] = bestPt;
    else newVerts[newVerts.length - 1] = bestPt;
    newGeom = { type: 'POLYLINE', vertices: newVerts };
  } else {
    return false;
  }

  const before = f;
  drawingStore.updateFeatureGeometry(featureId, newGeom);
  const after = drawingStore.getFeature(featureId);
  if (!after) return false;
  undoStore.pushUndo(makeBatchEntry('Extend', [
    { type: 'MODIFY_FEATURE', data: { id: featureId, before, after } },
  ]));
  return true;
}

/**
 * Result of attempting a `filletTwoLines`. Same convention
 * as JoinResult — `ok: false` carries a short user-facing
 * `reason` so the UI can surface the failure.
 */
export interface FilletResult {
  ok: boolean;
  arc?: Feature;
  trimmedIds?: string[];
  reason?: string;
}

/**
 * Remove the vertex closest to `worldPt` from a POLYLINE /
 * POLYGON / MIXED_GEOMETRY feature. The closest vertex must
 * be within `pickRadiusWorld` of the cursor; otherwise the
 * operation bails (so the surveyor doesn't accidentally
 * delete a far-away vertex when they meant something else).
 *
 * Won't remove a vertex if doing so would leave the feature
 * with too few vertices for its geometry type:
 *   - POLYLINE / MIXED_GEOMETRY → minimum 2 vertices
 *   - POLYGON → minimum 3 vertices
 *
 * Returns true on a successful mutation.
 */
export function removeVertexAt(
  featureId: string,
  worldPt: Point2D,
  pickRadiusWorld: number,
): boolean {
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const f = drawingStore.getFeature(featureId);
  if (!f) return false;
  const g = f.geometry;
  let isClosed = false;
  let chain: Point2D[] | null = null;
  if (g.type === 'POLYLINE' && g.vertices && g.vertices.length >= 2) chain = g.vertices.slice();
  else if (g.type === 'MIXED_GEOMETRY' && g.vertices && g.vertices.length >= 2) chain = g.vertices.slice();
  else if (g.type === 'POLYGON' && g.vertices && g.vertices.length >= 3) {
    chain = g.vertices.slice();
    isClosed = true;
  } else {
    return false;
  }

  // Find the closest vertex to the cursor.
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < chain.length; i += 1) {
    const v = chain[i];
    const d = Math.hypot(worldPt.x - v.x, worldPt.y - v.y);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return false;
  if (bestDist > pickRadiusWorld) return false;
  const minVerts = isClosed ? 3 : 2;
  if (chain.length <= minVerts) return false;

  const newVertices = [...chain.slice(0, bestIdx), ...chain.slice(bestIdx + 1)];
  const before = f;
  const newGeom: Feature['geometry'] = isClosed
    ? { ...g, type: 'POLYGON', vertices: newVertices }
    : { ...g, type: g.type, vertices: newVertices };
  drawingStore.updateFeatureGeometry(featureId, newGeom);
  const after = drawingStore.getFeature(featureId);
  if (!after) return false;
  undoStore.pushUndo(makeBatchEntry('Remove Vertex', [
    { type: 'MODIFY_FEATURE', data: { id: featureId, before, after } },
  ]));
  return true;
}

/**
 * Insert a new vertex into a POLYLINE / POLYGON /
 * MIXED_GEOMETRY feature at the closest point on its
 * geometry to `worldPt`. Useful when the surveyor wants to
 * add a corner where an imported polyline is missing one
 * (e.g. a property boundary that needs a new monument call-
 * out partway down a leg).
 *
 * - LINE sources are not supported — splitting a LINE adds a
 *   vertex by definition, but the result has to be a POLYLINE
 *   (since LINE has only start/end). Surveyors should use the
 *   SPLIT tool instead.
 * - The new vertex lands on the closest segment; existing
 *   vertices are kept in order.
 * - Endpoint-coincident clicks are no-ops to avoid creating
 *   degenerate adjacent duplicates.
 *
 * Returns true on a successful mutation.
 */
export function insertVertexAt(featureId: string, worldPt: Point2D): boolean {
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const f = drawingStore.getFeature(featureId);
  if (!f) return false;
  const g = f.geometry;
  let isClosed = false;
  let chain: Point2D[] | null = null;
  if (g.type === 'POLYLINE' && g.vertices && g.vertices.length >= 2) chain = g.vertices.slice();
  else if (g.type === 'MIXED_GEOMETRY' && g.vertices && g.vertices.length >= 2) chain = g.vertices.slice();
  else if (g.type === 'POLYGON' && g.vertices && g.vertices.length >= 2) {
    chain = g.vertices.slice();
    isClosed = true;
  } else {
    return false;
  }

  const eps = 1e-6;
  const segCount = isClosed ? chain.length : chain.length - 1;
  let bestIdx = 0;
  let bestPt: Point2D | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < segCount; i += 1) {
    const a = chain[i];
    const b = chain[(i + 1) % chain.length];
    const cp = closestPointOnSegment(worldPt, a, b);
    const d = Math.hypot(worldPt.x - cp.point.x, worldPt.y - cp.point.y);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
      bestPt = cp.point;
    }
  }
  if (!bestPt) return false;
  // Skip when the click lands exactly on an existing vertex.
  const segA = chain[bestIdx];
  const segB = chain[(bestIdx + 1) % chain.length];
  if (
    Math.hypot(bestPt.x - segA.x, bestPt.y - segA.y) < eps ||
    Math.hypot(bestPt.x - segB.x, bestPt.y - segB.y) < eps
  ) {
    return false;
  }

  // Build the new vertex array — bestPt slots in between
  // bestIdx and (bestIdx + 1).
  const newVertices = [
    ...chain.slice(0, bestIdx + 1),
    bestPt,
    ...chain.slice(bestIdx + 1),
  ];
  const before = f;
  const newGeom: Feature['geometry'] = isClosed
    ? { ...g, type: 'POLYGON', vertices: newVertices }
    : { ...g, type: g.type, vertices: newVertices };
  drawingStore.updateFeatureGeometry(featureId, newGeom);
  const after = drawingStore.getFeature(featureId);
  if (!after) return false;
  undoStore.pushUndo(makeBatchEntry('Insert Vertex', [
    { type: 'MODIFY_FEATURE', data: { id: featureId, before, after } },
  ]));
  return true;
}

/**
 * Reduce the vertex count of a POLYLINE / POLYGON feature
 * via Ramer-Douglas-Peucker, dropping any vertex whose
 * perpendicular distance to its kept neighbours is smaller
 * than `tolerance`. Useful for cleaning up noisy imports —
 * GPS traces, scanned-PDF traces, polygons-from-pixel-trace.
 *
 * Returns true on a successful mutation. No-op when the
 * tolerance produces no reduction (every vertex matters at
 * the chosen tolerance).
 */
export function simplifyPolylineFeature(
  featureId: string,
  tolerance: number,
): boolean {
  if (!Number.isFinite(tolerance) || tolerance <= 0) return false;
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const f = drawingStore.getFeature(featureId);
  if (!f) return false;
  const g = f.geometry;
  let isClosed = false;
  let verts: Point2D[] | null = null;
  if (g.type === 'POLYLINE' && g.vertices && g.vertices.length >= 3) verts = g.vertices.slice();
  else if (g.type === 'POLYGON' && g.vertices && g.vertices.length >= 3) {
    verts = g.vertices.slice();
    isClosed = true;
  } else {
    return false;
  }

  const reduced = simplifyPolyline(verts, tolerance, isClosed);
  // Reject no-op simplifications so the surveyor doesn't
  // log a meaningless undo entry.
  if (reduced.length === verts.length) return false;
  if (reduced.length < 2) return false;

  const before = f;
  const newGeom: Feature['geometry'] = isClosed
    ? { ...g, type: 'POLYGON', vertices: reduced }
    : { ...g, type: 'POLYLINE', vertices: reduced };
  drawingStore.updateFeatureGeometry(featureId, newGeom);
  const after = drawingStore.getFeature(featureId);
  if (!after) return false;
  undoStore.pushUndo(makeBatchEntry(`Simplify (${verts.length} → ${reduced.length})`, [
    { type: 'MODIFY_FEATURE', data: { id: featureId, before, after } },
  ]));
  return true;
}

/**
 * Convert a POLYLINE / POLYGON feature into a smooth SPLINE
 * by fitting cubic-bezier control points through the source's
 * vertices (Catmull-Rom-style interpolation via the existing
 * `fitPointsToBezier` helper). Useful when boundary lines come
 * in as linear segments and the surveyor wants curves —
 * imported topo lines, contour traces, road centerlines.
 *
 * Source must have ≥ 3 vertices to yield a meaningful spline.
 * The original feature is removed and replaced by the new
 * SPLINE; style + properties are cloned. Returns true on
 * success.
 */
export function smoothPolyline(featureId: string): boolean {
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const selectionStore = useSelectionStore.getState();
  const f = drawingStore.getFeature(featureId);
  if (!f) return false;
  const g = f.geometry;
  let vertices: Point2D[] | null = null;
  let isClosed = false;
  if (g.type === 'POLYLINE' && g.vertices && g.vertices.length >= 3) vertices = g.vertices.slice();
  else if (g.type === 'POLYGON' && g.vertices && g.vertices.length >= 3) {
    vertices = g.vertices.slice();
    isClosed = true;
  } else {
    return false;
  }
  const controlPoints = fitPointsToBezier(vertices, isClosed);
  if (controlPoints.length < 4) return false;

  const splineFeature: Feature = {
    ...f,
    id: generateId(),
    type: 'SPLINE',
    style: JSON.parse(JSON.stringify(f.style)),
    properties: JSON.parse(JSON.stringify(f.properties)),
    geometry: {
      type: 'SPLINE',
      spline: { controlPoints, isClosed },
    },
  };
  drawingStore.removeFeature(featureId);
  drawingStore.addFeature(splineFeature);
  undoStore.pushUndo(makeBatchEntry('Smooth Polyline', [
    { type: 'REMOVE_FEATURE', data: f },
    { type: 'ADD_FEATURE', data: splineFeature },
  ]));
  selectionStore.selectMultiple([splineFeature.id], 'REPLACE');
  return true;
}

/**
 * Drop a perpendicular from `sourcePoint` to the closest
 * point on the chosen segment of `targetFeatureId`. The
 * "foot of perpendicular" — the point on the target line
 * closest to the source — is computed by parametric
 * projection onto the target's nearest segment.
 *
 * Emits a new LINE feature from sourcePoint → foot. Style +
 * layer inherit from the target so the perpendicular reads
 * as belonging to the same drawing context.
 *
 * Targets must be vertex-chain features (LINE / POLYLINE /
 * POLYGON / MIXED_GEOMETRY); curved targets are out of
 * scope (they need a different parametric solve per type).
 *
 * `cursorHint` is an optional cursor world position that
 * disambiguates which segment of a multi-segment target to
 * project onto. When omitted, the closest segment to
 * `sourcePoint` itself is used.
 */
export function dropPerpendicular(
  sourcePoint: Point2D,
  targetFeatureId: string,
  cursorHint?: Point2D,
): boolean {
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const target = drawingStore.getFeature(targetFeatureId);
  if (!target) return false;
  const tg = target.geometry;
  let chain: Point2D[] | null = null;
  let isClosed = false;
  if (tg.type === 'LINE' && tg.start && tg.end) chain = [tg.start, tg.end];
  else if ((tg.type === 'POLYLINE' || tg.type === 'MIXED_GEOMETRY') && tg.vertices && tg.vertices.length >= 2) chain = tg.vertices.slice();
  else if (tg.type === 'POLYGON' && tg.vertices && tg.vertices.length >= 2) {
    chain = tg.vertices.slice();
    isClosed = true;
  } else {
    return false;
  }

  // Find the closest segment to the cursor hint (or to the
  // source point if no hint). Project the SOURCE onto that
  // segment to compute the perpendicular foot.
  const aimPoint = cursorHint ?? sourcePoint;
  const segCount = isClosed ? chain.length : chain.length - 1;
  let bestSegIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < segCount; i += 1) {
    const a = chain[i];
    const b = chain[(i + 1) % chain.length];
    const cp = closestPointOnSegment(aimPoint, a, b);
    const d = Math.hypot(aimPoint.x - cp.point.x, aimPoint.y - cp.point.y);
    if (d < bestDist) {
      bestDist = d;
      bestSegIdx = i;
    }
  }
  const segA = chain[bestSegIdx];
  const segB = chain[(bestSegIdx + 1) % chain.length];
  // Project the SOURCE onto the line through (segA, segB).
  // We allow t to fall outside [0, 1] so the perpendicular
  // hits the infinite line — surveyors typically want this
  // when projecting onto a centerline that doesn't quite
  // reach the source. Caller can clamp later if needed.
  const dxAB = segB.x - segA.x;
  const dyAB = segB.y - segA.y;
  const len2 = dxAB * dxAB + dyAB * dyAB;
  if (len2 < 1e-20) return false;
  const tParam = ((sourcePoint.x - segA.x) * dxAB + (sourcePoint.y - segA.y) * dyAB) / len2;
  const foot: Point2D = {
    x: segA.x + tParam * dxAB,
    y: segA.y + tParam * dyAB,
  };
  if (Math.hypot(foot.x - sourcePoint.x, foot.y - sourcePoint.y) < 1e-9) {
    return false; // source already lies on the line
  }

  const perpFeature: Feature = {
    id: generateId(),
    type: 'LINE',
    geometry: { type: 'LINE', start: sourcePoint, end: foot },
    layerId: target.layerId,
    style: JSON.parse(JSON.stringify(target.style)),
    properties: {
      perpendicularTargetId: targetFeatureId,
      perpendicularFootX: foot.x,
      perpendicularFootY: foot.y,
    },
  };
  drawingStore.addFeature(perpFeature);
  undoStore.pushUndo(makeAddFeatureEntry(perpFeature));
  return true;
}

/**
 * Drop a single POINT feature at exact arc-length `distance`
 * from one end of `featureId`. Single-shot version of
 * DIVIDE — surveyors use it for inserting a station marker
 * at a known offset (e.g. "set MAG nail at 47.5 ft from the
 * NE corner along the boundary").
 *
 * Distance > total length clamps to the far endpoint so the
 * marker lands on the geometry instead of vanishing into
 * empty space; distance ≤ 0 lands on the chosen end. POLYGON
 * sources are supported and walk the closing leg as part of
 * the arc-length budget.
 */
export function pointAtDistanceAlong(
  featureId: string,
  distance: number,
  fromEnd: boolean,
): boolean {
  if (!Number.isFinite(distance) || distance < 0) return false;
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const f = drawingStore.getFeature(featureId);
  if (!f) return false;
  const g = f.geometry;
  let chain: Point2D[] | null = null;
  let isClosed = false;
  let arcGeom: typeof g.arc | null = null;
  let splineSamples: Point2D[] | null = null;
  if (g.type === 'LINE' && g.start && g.end) chain = [g.start, g.end];
  else if (g.type === 'POLYLINE' && g.vertices && g.vertices.length >= 2) chain = g.vertices.slice();
  else if (g.type === 'POLYGON' && g.vertices && g.vertices.length >= 2) {
    chain = g.vertices.slice();
    isClosed = true;
  } else if (g.type === 'ARC' && g.arc) {
    arcGeom = g.arc;
  } else if (g.type === 'SPLINE' && g.spline && g.spline.controlPoints.length >= 4) {
    splineSamples = sampleSpline(g.spline.controlPoints, 32);
  } else {
    return false;
  }

  // Total arc-length used to convert the surveyor's distance
  // into a normalised parameter the geometry walker can use.
  let total: number;
  let pt: Point2D;
  let clamped: number;
  if (arcGeom) {
    total = arcLength(arcGeom);
    if (total < 1e-12) return false;
    clamped = Math.min(distance, total);
    const t = fromEnd ? 1 - clamped / total : clamped / total;
    pt = pointAtArcParam(arcGeom, t);
  } else if (splineSamples) {
    total = splineArcLengthTable(splineSamples).total;
    if (total < 1e-12) return false;
    clamped = Math.min(distance, total);
    const t = fromEnd ? 1 - clamped / total : clamped / total;
    pt = pointAlongSpline(splineSamples, t);
  } else {
    if (!chain) return false;
    const segCount = isClosed ? chain.length : chain.length - 1;
    total = 0;
    for (let i = 0; i < segCount; i += 1) {
      const a = chain[i];
      const b = chain[(i + 1) % chain.length];
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
    if (total < 1e-12) return false;
    clamped = Math.min(distance, total);
    const t = fromEnd ? 1 - clamped / total : clamped / total;
    pt = pointAlongChain(chain, t, isClosed);
  }

  const newPoint: Feature = {
    id: generateId(),
    type: 'POINT',
    geometry: { type: 'POINT', point: pt },
    layerId: f.layerId,
    style: JSON.parse(JSON.stringify(f.style)),
    properties: {
      pointAtDistanceSourceId: featureId,
      pointAtDistanceValue: clamped,
      pointAtDistanceFromEnd: fromEnd,
    },
  };
  drawingStore.addFeature(newPoint);
  undoStore.pushUndo(makeAddFeatureEntry(newPoint));
  return true;
}

/**
 * Copy the style + layer assignment from `sourceId` onto
 * `targetId`. Geometry is left intact. Surveyors use this
 * after cleanup to harmonise look-and-feel: pick one
 * "model" line that already has the right color / line
 * weight / line type / layer, then click each target line
 * to make it match.
 *
 * The clone is deep so subsequent edits to either feature's
 * style stay independent. Returns true on success.
 */
export function matchPropertiesTo(sourceId: string, targetId: string): boolean {
  if (sourceId === targetId) return false;
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const source = drawingStore.getFeature(sourceId);
  const target = drawingStore.getFeature(targetId);
  if (!source || !target) return false;
  const before = target;
  drawingStore.updateFeature(targetId, {
    style: JSON.parse(JSON.stringify(source.style)),
    layerId: source.layerId,
  });
  const after = drawingStore.getFeature(targetId);
  if (!after) return false;
  undoStore.pushUndo(makeBatchEntry('Match Properties', [
    { type: 'MODIFY_FEATURE', data: { id: targetId, before, after } },
  ]));
  return true;
}

/**
 * Reverse the vertex order of a LINE / POLYLINE / POLYGON /
 * MIXED_GEOMETRY feature. Useful when a direction-dependent
 * downstream operation (offset side, DIVIDE numbering, label
 * rotation) was set up against the import's direction and
 * the surveyor needs to flip it without redrawing.
 *
 * LINE swaps start and end. Vertex chains reverse the
 * `vertices[]` array. Curved sources are out of scope (their
 * parametric form encodes direction differently per type).
 * Returns true on success.
 */
export function reverseFeature(featureId: string): boolean {
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const f = drawingStore.getFeature(featureId);
  if (!f) return false;
  const g = f.geometry;
  let newGeom: Feature['geometry'];
  if (g.type === 'LINE' && g.start && g.end) {
    newGeom = { type: 'LINE', start: g.end, end: g.start };
  } else if (
    (g.type === 'POLYLINE' || g.type === 'POLYGON' || g.type === 'MIXED_GEOMETRY') &&
    g.vertices &&
    g.vertices.length >= 2
  ) {
    newGeom = { ...g, vertices: g.vertices.slice().reverse() };
  } else if (g.type === 'ARC' && g.arc) {
    // Swap start ↔ end angle and toggle the traversal
    // direction so the arc geometry traces the same
    // physical curve in the opposite direction.
    newGeom = {
      type: 'ARC',
      arc: {
        center: g.arc.center,
        radius: g.arc.radius,
        startAngle: g.arc.endAngle,
        endAngle: g.arc.startAngle,
        anticlockwise: !g.arc.anticlockwise,
      },
    };
  } else if (g.type === 'SPLINE' && g.spline && g.spline.controlPoints.length >= 2) {
    // Reverse the control-point list. For a closed cubic
    // spline (3N+1 points where last == first) the reversal
    // still terminates on the same vertex; for open splines
    // it just flips the direction of travel.
    newGeom = {
      type: 'SPLINE',
      spline: {
        controlPoints: g.spline.controlPoints.slice().reverse(),
        isClosed: g.spline.isClosed,
      },
    };
  } else {
    return false;
  }
  const before = f;
  drawingStore.updateFeatureGeometry(featureId, newGeom);
  const after = drawingStore.getFeature(featureId);
  if (!after) return false;
  undoStore.pushUndo(makeBatchEntry('Reverse', [
    { type: 'MODIFY_FEATURE', data: { id: featureId, before, after } },
  ]));
  return true;
}

/**
 * Burst a POLYLINE / POLYGON / MIXED_GEOMETRY feature into a
 * collection of individual LINE features — one per segment.
 * POLYGON includes the closing leg (vertex N-1 → vertex 0).
 * Source feature is removed and the new lines are recorded
 * in a single batch undo entry. Style + properties are
 * cloned to every new line so the visual result reads as
 * the same shape, just with editable per-segment handles.
 *
 * LINE sources are a no-op (already a single segment).
 * Curved sources (CIRCLE / ELLIPSE / ARC / SPLINE) are out
 * of scope — bursting them would lose the parametric
 * geometry. Returns true on a successful mutation.
 */
export function explodeFeature(featureId: string): boolean {
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const selectionStore = useSelectionStore.getState();
  const f = drawingStore.getFeature(featureId);
  if (!f) return false;
  const g = f.geometry;

  let chain: Point2D[] | null = null;
  let isClosed = false;
  if (g.type === 'POLYLINE' && g.vertices && g.vertices.length >= 2) {
    chain = g.vertices.slice();
  } else if (g.type === 'POLYGON' && g.vertices && g.vertices.length >= 2) {
    chain = g.vertices.slice();
    isClosed = true;
  } else if (g.type === 'MIXED_GEOMETRY' && g.vertices && g.vertices.length >= 2) {
    chain = g.vertices.slice();
  } else if (g.type === 'SPLINE' && g.spline && g.spline.controlPoints.length >= 4) {
    // Sample the spline densely so each cubic segment becomes
    // a chunk of the polyline. The new LINEs that come out of
    // the existing chain-walk below are then the per-sample
    // segments — same exploded-grip experience as POLYLINE.
    chain = sampleSpline(g.spline.controlPoints, 32);
    isClosed = g.spline.isClosed;
  } else {
    return false;
  }

  const segCount = isClosed ? chain.length : chain.length - 1;
  if (segCount < 1) return false;

  const newLines: Feature[] = [];
  for (let i = 0; i < segCount; i += 1) {
    const a = chain[i];
    const b = chain[(i + 1) % chain.length];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue; // skip degenerate
    newLines.push({
      ...f,
      id: generateId(),
      type: 'LINE',
      style: JSON.parse(JSON.stringify(f.style)),
      properties: JSON.parse(JSON.stringify(f.properties)),
      geometry: { type: 'LINE', start: a, end: b },
    });
  }
  if (newLines.length === 0) return false;

  drawingStore.removeFeature(featureId);
  drawingStore.addFeatures(newLines);
  const ops = [
    { type: 'REMOVE_FEATURE' as const, data: f },
    ...newLines.map((nl) => ({ type: 'ADD_FEATURE' as const, data: nl })),
  ];
  undoStore.pushUndo(makeBatchEntry(`Explode (${newLines.length} lines)`, ops));
  selectionStore.selectMultiple(newLines.map((nl) => nl.id), 'REPLACE');
  return true;
}

/**
 * Walk a vertex chain and return the world-space point at
 * `t * totalArcLength`, where `t ∈ [0, 1]`. Used by
 * `divideFeatureBy` to drop POINT features at equal
 * intervals along a LINE / POLYLINE / POLYGON. POLYGON
 * closes back to the first vertex; LINE / POLYLINE walk
 * once end-to-end.
 */
function pointAlongChain(chain: Point2D[], t: number, isClosed: boolean): Point2D {
  if (chain.length < 2) return chain[0] ? { ...chain[0] } : { x: 0, y: 0 };
  const segCount = isClosed ? chain.length : chain.length - 1;
  let total = 0;
  const segLens: number[] = [];
  for (let i = 0; i < segCount; i += 1) {
    const a = chain[i];
    const b = chain[(i + 1) % chain.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segLens.push(len);
    total += len;
  }
  if (total < 1e-12) return { ...chain[0] };
  const target = Math.max(0, Math.min(1, t)) * total;
  let acc = 0;
  for (let i = 0; i < segCount; i += 1) {
    const len = segLens[i];
    if (acc + len >= target || i === segCount - 1) {
      const localT = len > 1e-12 ? (target - acc) / len : 0;
      const a = chain[i];
      const b = chain[(i + 1) % chain.length];
      return {
        x: a.x + (b.x - a.x) * localT,
        y: a.y + (b.y - a.y) * localT,
      };
    }
    acc += len;
  }
  return { ...chain[chain.length - 1] };
}

/**
 * Divide a LINE / POLYLINE / POLYGON feature into `count`
 * equal arc-length segments by dropping `count - 1` POINT
 * features at the dividing positions. The source feature
 * stays untouched — DIVIDE never mutates geometry, it only
 * adds station markers. Surveyors use it for fence-post
 * layouts, station marks along centerlines, lot-frontage
 * segmentation, etc.
 *
 * For POLYGON sources the walk closes back through the
 * vertex 0 → vertex N-1 leg so the divisions stay evenly
 * spaced around the perimeter.
 */
export function divideFeatureBy(featureId: string, count: number): boolean {
  if (!Number.isFinite(count) || count < 2) return false;
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const f = drawingStore.getFeature(featureId);
  if (!f) return false;
  const g = f.geometry;
  let chain: Point2D[] | null = null;
  let isClosed = false;
  let arcGeom: typeof g.arc | null = null;
  let splineSamples: Point2D[] | null = null;
  if (g.type === 'LINE' && g.start && g.end) chain = [g.start, g.end];
  else if (g.type === 'POLYLINE' && g.vertices && g.vertices.length >= 2) chain = g.vertices.slice();
  else if (g.type === 'POLYGON' && g.vertices && g.vertices.length >= 2) {
    chain = g.vertices.slice();
    isClosed = true;
  } else if (g.type === 'ARC' && g.arc) {
    arcGeom = g.arc;
  } else if (g.type === 'SPLINE' && g.spline && g.spline.controlPoints.length >= 4) {
    splineSamples = sampleSpline(g.spline.controlPoints, 32);
  } else {
    return false;
  }

  // Drop count-1 markers at t = 1/N, 2/N, ..., (N-1)/N.
  const stationLayer = f.layerId;
  const newPoints: Feature[] = [];
  for (let i = 1; i < count; i += 1) {
    const t = i / count;
    const pt = arcGeom
      ? pointAtArcParam(arcGeom, t)
      : splineSamples
        ? pointAlongSpline(splineSamples, t)
        : pointAlongChain(chain!, t, isClosed);
    const pf: Feature = {
      id: generateId(),
      type: 'POINT',
      geometry: { type: 'POINT', point: pt },
      layerId: stationLayer,
      style: JSON.parse(JSON.stringify(f.style)),
      properties: {
        // Stamp station metadata so a future LIST tool can
        // show the surveyor exactly which leg + interval the
        // marker came from.
        divideSourceId: featureId,
        divideStationOf: count,
        divideStationIndex: i,
      },
    };
    newPoints.push(pf);
  }
  if (newPoints.length === 0) return false;
  drawingStore.addFeatures(newPoints);
  const ops = newPoints.map((p) => ({ type: 'ADD_FEATURE' as const, data: p }));
  undoStore.pushUndo(makeBatchEntry(`Divide ÷${count}`, ops));
  return true;
}

/** Result of attempting a `chamferTwoLines`. `bevel` is the
 *  new straight LINE that connects the two trim points. */
export interface ChamferResult {
  ok: boolean;
  bevel?: Feature;
  trimmedIds?: string[];
  reason?: string;
}

/**
 * Place a straight chamfer between two LINE features at
 * their (extended) intersection. `dist1` trims line1 back
 * from the intersection along its keep direction; `dist2`
 * trims line2. Setting them equal produces a symmetric
 * chamfer; unequal distances produce an asymmetric bevel —
 * useful for surveyors who need a specific corner cut to
 * match a road-design table.
 *
 * Algorithm — vastly simpler than fillet:
 * 1. Find infinite-line intersection P of the two lines.
 * 2. Compute unit "keep" directions u1, u2 from each click.
 * 3. Trim points: T1 = P + dist1*u1, T2 = P + dist2*u2.
 * 4. Trim each line so its end nearest P moves to T_i.
 * 5. Insert a new LINE feature connecting T1 → T2.
 *
 * Returns false with a `reason` for parallel lines, lines
 * shorter than the requested distance, or degenerate clicks.
 */
export function chamferTwoLines(
  line1Id: string,
  click1: Point2D,
  line2Id: string,
  click2: Point2D,
  dist1: number,
  dist2: number,
): ChamferResult {
  if (!Number.isFinite(dist1) || dist1 <= 0 || !Number.isFinite(dist2) || dist2 <= 0) {
    return { ok: false, reason: 'Chamfer distances must be > 0.' };
  }
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const selectionStore = useSelectionStore.getState();
  const f1 = drawingStore.getFeature(line1Id);
  const f2 = drawingStore.getFeature(line2Id);
  if (!f1 || !f2) return { ok: false, reason: 'Lines not found.' };
  if (f1.geometry.type !== 'LINE' || f2.geometry.type !== 'LINE') {
    return { ok: false, reason: 'CHAMFER currently supports LINE features only.' };
  }
  const a1 = f1.geometry.start!;
  const b1 = f1.geometry.end!;
  const a2 = f2.geometry.start!;
  const b2 = f2.geometry.end!;

  const P = lineLineIntersection(a1, b1, a2, b2);
  if (!P) return { ok: false, reason: 'Lines are parallel — no chamfer possible.' };

  // Unit "keep" direction from P toward whichever endpoint
  // the click is closer to. Same convention as fillet.
  const keepDir = (line: { start: Point2D; end: Point2D }, click: Point2D): { x: number; y: number } | null => {
    const dStart = Math.hypot(click.x - line.start.x, click.y - line.start.y);
    const dEnd = Math.hypot(click.x - line.end.x, click.y - line.end.y);
    const keepEnd = dEnd < dStart ? line.end : line.start;
    const dx = keepEnd.x - P.x;
    const dy = keepEnd.y - P.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-10) return null;
    return { x: dx / len, y: dy / len };
  };
  const u1 = keepDir({ start: a1, end: b1 }, click1);
  const u2 = keepDir({ start: a2, end: b2 }, click2);
  if (!u1 || !u2) {
    return { ok: false, reason: 'Click points are too close to the intersection — pick the leg you want to keep.' };
  }

  // Length of the keep leg from P. Validates the trim
  // distance is achievable.
  const lengthFromP = (line: { start: Point2D; end: Point2D }, click: Point2D): number => {
    const dStart = Math.hypot(click.x - line.start.x, click.y - line.start.y);
    const dEnd = Math.hypot(click.x - line.end.x, click.y - line.end.y);
    const keepEnd = dEnd < dStart ? line.end : line.start;
    return Math.hypot(keepEnd.x - P.x, keepEnd.y - P.y);
  };
  const len1 = lengthFromP({ start: a1, end: b1 }, click1);
  const len2 = lengthFromP({ start: a2, end: b2 }, click2);
  if (dist1 > len1 - 1e-6) {
    return { ok: false, reason: `Distance 1 (${dist1.toFixed(3)}) exceeds line 1 length (${len1.toFixed(3)} ft).` };
  }
  if (dist2 > len2 - 1e-6) {
    return { ok: false, reason: `Distance 2 (${dist2.toFixed(3)}) exceeds line 2 length (${len2.toFixed(3)} ft).` };
  }

  const T1: Point2D = { x: P.x + dist1 * u1.x, y: P.y + dist1 * u1.y };
  const T2: Point2D = { x: P.x + dist2 * u2.x, y: P.y + dist2 * u2.y };

  const trimLineToTangent = (line: Feature, tangent: Point2D, click: Point2D): Feature => {
    if (line.geometry.type !== 'LINE') return line;
    const ls = line.geometry.start!;
    const le = line.geometry.end!;
    const dStart = Math.hypot(click.x - ls.x, click.y - ls.y);
    const dEnd = Math.hypot(click.x - le.x, click.y - le.y);
    const swapStart = dStart > dEnd;
    return {
      ...line,
      id: generateId(),
      style: JSON.parse(JSON.stringify(line.style)),
      properties: JSON.parse(JSON.stringify(line.properties)),
      geometry: {
        type: 'LINE',
        start: swapStart ? tangent : ls,
        end: swapStart ? le : tangent,
      },
    };
  };
  const trimmed1 = trimLineToTangent(f1, T1, click1);
  const trimmed2 = trimLineToTangent(f2, T2, click2);

  const bevel: Feature = {
    ...f1,
    id: generateId(),
    type: 'LINE',
    style: JSON.parse(JSON.stringify(f1.style)),
    properties: JSON.parse(JSON.stringify(f1.properties)),
    geometry: { type: 'LINE', start: T1, end: T2 },
  };

  drawingStore.removeFeature(f1.id);
  drawingStore.removeFeature(f2.id);
  drawingStore.addFeature(trimmed1);
  drawingStore.addFeature(trimmed2);
  drawingStore.addFeature(bevel);
  const ops = [
    { type: 'REMOVE_FEATURE' as const, data: f1 },
    { type: 'REMOVE_FEATURE' as const, data: f2 },
    { type: 'ADD_FEATURE' as const, data: trimmed1 },
    { type: 'ADD_FEATURE' as const, data: trimmed2 },
    { type: 'ADD_FEATURE' as const, data: bevel },
  ];
  const label = dist1 === dist2 ? `Chamfer ${dist1}` : `Chamfer ${dist1}/${dist2}`;
  undoStore.pushUndo(makeBatchEntry(label, ops));
  selectionStore.selectMultiple([trimmed1.id, trimmed2.id, bevel.id], 'REPLACE');

  return { ok: true, bevel, trimmedIds: [trimmed1.id, trimmed2.id] };
}

/**
 * Place a circular fillet of `radius` between two LINE
 * features at their (extended) intersection. The two line
 * click points decide which side of each line is kept —
 * surveyors point at the leg they want to retain.
 *
 * Algorithm:
 * 1. Find the infinite-line intersection P of line1 + line2.
 * 2. For each line, compute a unit "keep" direction pointing
 *    from P toward the click. The keep direction also serves
 *    as the tangent direction at the fillet's tangent point.
 * 3. Half-angle θ between the two keep directions:
 *      cos(2θ) = u1 · u2
 *    Skip when the lines are parallel or aimed straight at
 *    each other (degenerate fillets).
 * 4. Tangent-point distance from P along each leg:
 *      t = radius / tan(θ)
 *    Tangent point on leg i = P + t * uᵢ.
 * 5. Arc center = (PT1 + PT2)/2 displaced along the bisector
 *    by `radius / sin(θ)` from P, on the side AWAY from the
 *    cusp (i.e. away from P, into the "keep" wedge).
 * 6. Trim each line so its endpoint nearest P moves to its
 *    tangent point; keep the half containing the click.
 * 7. Insert a new ARC feature spanning from PT1 to PT2,
 *    direction picked so the arc bulges toward P rather than
 *    away (sweeps through the "cut" wedge between the legs).
 */
export function filletTwoLines(
  line1Id: string,
  click1: Point2D,
  line2Id: string,
  click2: Point2D,
  radius: number,
): FilletResult {
  if (!Number.isFinite(radius) || radius <= 0) {
    return { ok: false, reason: 'Fillet radius must be > 0.' };
  }
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const selectionStore = useSelectionStore.getState();
  const f1 = drawingStore.getFeature(line1Id);
  const f2 = drawingStore.getFeature(line2Id);
  if (!f1 || !f2) return { ok: false, reason: 'Lines not found.' };
  if (f1.geometry.type !== 'LINE' || f2.geometry.type !== 'LINE') {
    return { ok: false, reason: 'FILLET currently supports LINE features only.' };
  }
  const a1 = f1.geometry.start!;
  const b1 = f1.geometry.end!;
  const a2 = f2.geometry.start!;
  const b2 = f2.geometry.end!;

  // Infinite-line intersection of the two source lines.
  const P = lineLineIntersection(a1, b1, a2, b2);
  if (!P) return { ok: false, reason: 'Lines are parallel — no fillet possible.' };

  // Unit "keep" direction for each line: from P toward whichever
  // endpoint the click is closer to. Surveyors aim at the leg
  // they want to retain.
  const keepDir = (line: { start: Point2D; end: Point2D }, click: Point2D): { x: number; y: number } | null => {
    const dStart = Math.hypot(click.x - line.start.x, click.y - line.start.y);
    const dEnd = Math.hypot(click.x - line.end.x, click.y - line.end.y);
    const keepEnd = dEnd < dStart ? line.end : line.start;
    const dx = keepEnd.x - P.x;
    const dy = keepEnd.y - P.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-10) return null;
    return { x: dx / len, y: dy / len };
  };
  const u1 = keepDir({ start: a1, end: b1 }, click1);
  const u2 = keepDir({ start: a2, end: b2 }, click2);
  if (!u1 || !u2) {
    return { ok: false, reason: 'Click points are too close to the intersection — pick the leg you want to keep.' };
  }

  // Half-angle θ between the keep directions. cos(2θ) = u1·u2.
  // We work with sin(θ), cos(θ), tan(θ) directly via the half-
  // angle identities so we never need atan and stay numerically
  // stable.
  let cos2t = u1.x * u2.x + u1.y * u2.y;
  cos2t = Math.max(-1, Math.min(1, cos2t));
  // Degenerate cases: lines run the same direction (angle 0,
  // can't fillet) or anti-parallel (angle 180°, also degenerate
  // for fillet — the legs continue through each other).
  if (cos2t > 1 - 1e-9) {
    return { ok: false, reason: 'Lines run in the same direction — no corner to fillet.' };
  }
  if (cos2t < -1 + 1e-9) {
    return { ok: false, reason: 'Lines are anti-parallel — no corner to fillet.' };
  }
  // sin(θ) > 0 and cos(θ) > 0 because θ is the half-angle of
  // the wedge the surveyor chose, always in (0, π/2).
  const sinT = Math.sqrt((1 - cos2t) / 2);
  const cosT = Math.sqrt((1 + cos2t) / 2);
  if (sinT < 1e-9 || cosT < 1e-9) {
    return { ok: false, reason: 'Wedge angle is degenerate.' };
  }
  const tanT = sinT / cosT;

  // Tangent point distance from P, along each keep direction.
  const t = radius / tanT;
  const PT1: Point2D = { x: P.x + t * u1.x, y: P.y + t * u1.y };
  const PT2: Point2D = { x: P.x + t * u2.x, y: P.y + t * u2.y };

  // Bisector direction (unit) pointing from P INTO the wedge
  // the surveyor kept. Adding u1 + u2 and normalising works
  // because sum-of-unit-vectors lies along the angular bisector.
  const bx = u1.x + u2.x;
  const by = u1.y + u2.y;
  const blen = Math.hypot(bx, by);
  if (blen < 1e-10) {
    return { ok: false, reason: 'Bisector is degenerate.' };
  }
  const ubx = bx / blen;
  const uby = by / blen;

  // Arc center distance from P. With the half-angle θ, distance
  // from P to center = radius / sin(θ).
  const centerDist = radius / sinT;
  const centerPt: Point2D = { x: P.x + centerDist * ubx, y: P.y + centerDist * uby };

  // Validate that each line is long enough to absorb the trim
  // (i.e. the tangent point must lie between P and the kept
  // endpoint, not beyond it). This guards against radii that
  // are larger than either line's length.
  const lengthFromP = (line: { start: Point2D; end: Point2D }, click: Point2D): number => {
    const dStart = Math.hypot(click.x - line.start.x, click.y - line.start.y);
    const dEnd = Math.hypot(click.x - line.end.x, click.y - line.end.y);
    const keepEnd = dEnd < dStart ? line.end : line.start;
    return Math.hypot(keepEnd.x - P.x, keepEnd.y - P.y);
  };
  const len1 = lengthFromP({ start: a1, end: b1 }, click1);
  const len2 = lengthFromP({ start: a2, end: b2 }, click2);
  if (t > len1 - 1e-6 || t > len2 - 1e-6) {
    return {
      ok: false,
      reason: `Radius too large for these lines — needs ≤ ${Math.min(len1, len2).toFixed(3)} ft (current ${t.toFixed(3)}).`,
    };
  }

  // Build the trimmed lines. Keep the half containing the click.
  const trimLineToTangent = (line: Feature, tangent: Point2D, click: Point2D): Feature => {
    if (line.geometry.type !== 'LINE') return line;
    const ls = line.geometry.start!;
    const le = line.geometry.end!;
    const dStart = Math.hypot(click.x - ls.x, click.y - ls.y);
    const dEnd = Math.hypot(click.x - le.x, click.y - le.y);
    // Move whichever endpoint is closer to P (the FAR one
    // from the click) onto the tangent point.
    const swapStart = dStart > dEnd;
    return {
      ...line,
      id: generateId(),
      style: JSON.parse(JSON.stringify(line.style)),
      properties: JSON.parse(JSON.stringify(line.properties)),
      geometry: {
        type: 'LINE',
        start: swapStart ? tangent : ls,
        end: swapStart ? le : tangent,
      },
    };
  };
  const trimmed1 = trimLineToTangent(f1, PT1, click1);
  const trimmed2 = trimLineToTangent(f2, PT2, click2);

  // Build the arc. anticlockwise flag picks the short arc
  // through the cusp side (between PT1 and PT2 the short way,
  // not the long way around). We compute startAngle from PT1
  // around centerPt, endAngle from PT2 around centerPt. The
  // arc should bulge toward P (the cusp), so its midpoint
  // sits on the bisector pointing FROM centerPt TOWARD P.
  const startAngle = Math.atan2(PT1.y - centerPt.y, PT1.x - centerPt.x);
  const endAngle = Math.atan2(PT2.y - centerPt.y, PT2.x - centerPt.x);
  // Pick anticlockwise so that the arc swept from start to end
  // bulges back toward P. We test by comparing the arc midpoint
  // for each direction and seeing which one is closer to P.
  const midForCcw = arcMidpoint(centerPt, radius, startAngle, endAngle, true);
  const midForCw = arcMidpoint(centerPt, radius, startAngle, endAngle, false);
  const distCcw = Math.hypot(midForCcw.x - P.x, midForCcw.y - P.y);
  const distCw = Math.hypot(midForCw.x - P.x, midForCw.y - P.y);
  const anticlockwise = distCcw < distCw;

  const arcFeature: Feature = {
    ...f1,
    id: generateId(),
    type: 'ARC',
    style: JSON.parse(JSON.stringify(f1.style)),
    properties: JSON.parse(JSON.stringify(f1.properties)),
    geometry: {
      type: 'ARC',
      arc: { center: centerPt, radius, startAngle, endAngle, anticlockwise },
    },
  };

  // Apply the mutation as a single batch.
  drawingStore.removeFeature(f1.id);
  drawingStore.removeFeature(f2.id);
  drawingStore.addFeature(trimmed1);
  drawingStore.addFeature(trimmed2);
  drawingStore.addFeature(arcFeature);
  const ops = [
    { type: 'REMOVE_FEATURE' as const, data: f1 },
    { type: 'REMOVE_FEATURE' as const, data: f2 },
    { type: 'ADD_FEATURE' as const, data: trimmed1 },
    { type: 'ADD_FEATURE' as const, data: trimmed2 },
    { type: 'ADD_FEATURE' as const, data: arcFeature },
  ];
  undoStore.pushUndo(makeBatchEntry(`Fillet R=${radius}`, ops));
  selectionStore.selectMultiple([trimmed1.id, trimmed2.id, arcFeature.id], 'REPLACE');

  return { ok: true, arc: arcFeature, trimmedIds: [trimmed1.id, trimmed2.id] };
}

/** Return the world-space midpoint of an arc going from
 *  startAngle to endAngle around `center` with the given
 *  direction. Used by the FILLET picker to choose the
 *  anticlockwise flag that bulges toward the cusp. */
function arcMidpoint(
  center: Point2D,
  radius: number,
  startAngle: number,
  endAngle: number,
  anticlockwise: boolean,
): Point2D {
  let s = startAngle;
  let e = endAngle;
  if (anticlockwise) {
    if (e <= s) e += 2 * Math.PI;
  } else {
    if (s <= e) s += 2 * Math.PI;
    [s, e] = [e, s];
  }
  const mid = (s + e) / 2;
  return {
    x: center.x + radius * Math.cos(mid),
    y: center.y + radius * Math.sin(mid),
  };
}

/**
 * Round a polyline / polygon corner at a chosen vertex with
 * an arc of the given radius. The source feature is replaced
 * by up to three new features: the polyline-up-to-PT1, the
 * arc, and the polyline-from-PT2-onward (each may collapse
 * into a LINE when only two vertices remain).
 *
 * Closed polygons wrap the neighbour lookup so filleting any
 * vertex (including the first/last) works cleanly. The
 * polygon is opened at the filleted corner: it becomes a
 * single polyline that runs from the post-fillet PT2 around
 * the perimeter and back to the pre-fillet PT1, with the
 * fillet arc bridging the gap.
 *
 * Returns false (no-op) when:
 *  - vertexIndex is out of range
 *  - the corner is straight (anti-parallel neighbour edges)
 *  - either neighbour edge is shorter than the required
 *    tangent-point distance
 */
export function filletPolylineVertex(
  featureId: string,
  vertexIndex: number,
  radius: number,
): { ok: true; arcId: string; sideIds: string[] } | { ok: false; reason: string } {
  if (!Number.isFinite(radius) || radius <= 0) {
    return { ok: false, reason: 'Fillet radius must be > 0.' };
  }
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const selectionStore = useSelectionStore.getState();
  const f = drawingStore.getFeature(featureId);
  if (!f) return { ok: false, reason: 'Feature not found.' };
  const g = f.geometry;
  if ((g.type !== 'POLYLINE' && g.type !== 'POLYGON') || !g.vertices || g.vertices.length < 3) {
    return { ok: false, reason: 'Fillet vertex requires a polyline / polygon with ≥ 3 vertices.' };
  }
  const verts = g.vertices;
  const isClosed = g.type === 'POLYGON';
  const n = verts.length;
  if (vertexIndex < 0 || vertexIndex >= n) {
    return { ok: false, reason: 'Vertex index out of range.' };
  }
  // Endpoints of an open polyline have no neighbour on one
  // side, so no fillet is meaningful.
  if (!isClosed && (vertexIndex === 0 || vertexIndex === n - 1)) {
    return { ok: false, reason: 'Cannot fillet the endpoint of an open polyline.' };
  }
  const prevIdx = (vertexIndex - 1 + n) % n;
  const nextIdx = (vertexIndex + 1) % n;
  const P  = verts[vertexIndex];
  const A  = verts[prevIdx];
  const B  = verts[nextIdx];

  // Keep directions point from the corner P out toward each
  // neighbour. (Same convention `filletTwoLines` uses.)
  const u1x = A.x - P.x;
  const u1y = A.y - P.y;
  const u2x = B.x - P.x;
  const u2y = B.y - P.y;
  const len1 = Math.hypot(u1x, u1y);
  const len2 = Math.hypot(u2x, u2y);
  if (len1 < 1e-10 || len2 < 1e-10) {
    return { ok: false, reason: 'Adjacent vertices are coincident — no corner to fillet.' };
  }
  const u1 = { x: u1x / len1, y: u1y / len1 };
  const u2 = { x: u2x / len2, y: u2y / len2 };

  let cos2t = u1.x * u2.x + u1.y * u2.y;
  cos2t = Math.max(-1, Math.min(1, cos2t));
  if (cos2t > 1 - 1e-9) {
    return { ok: false, reason: 'Adjacent edges run in the same direction — no corner to fillet.' };
  }
  if (cos2t < -1 + 1e-9) {
    return { ok: false, reason: 'Adjacent edges are anti-parallel — corner is degenerate.' };
  }
  const sinT = Math.sqrt((1 - cos2t) / 2);
  const cosT = Math.sqrt((1 + cos2t) / 2);
  if (sinT < 1e-9 || cosT < 1e-9) {
    return { ok: false, reason: 'Wedge angle is degenerate.' };
  }
  const tanT = sinT / cosT;
  const t = radius / tanT;

  if (t > len1 - 1e-6 || t > len2 - 1e-6) {
    return {
      ok: false,
      reason: `Radius too large for these legs — needs ≤ ${Math.min(len1, len2).toFixed(3)} ft (current ${t.toFixed(3)}).`,
    };
  }

  const PT1: Point2D = { x: P.x + t * u1.x, y: P.y + t * u1.y };
  const PT2: Point2D = { x: P.x + t * u2.x, y: P.y + t * u2.y };

  const bx = u1.x + u2.x;
  const by = u1.y + u2.y;
  const blen = Math.hypot(bx, by);
  if (blen < 1e-10) return { ok: false, reason: 'Bisector is degenerate.' };
  const ub = { x: bx / blen, y: by / blen };
  const centerDist = radius / sinT;
  const centerPt: Point2D = { x: P.x + centerDist * ub.x, y: P.y + centerDist * ub.y };

  const startAngle = Math.atan2(PT1.y - centerPt.y, PT1.x - centerPt.x);
  const endAngle = Math.atan2(PT2.y - centerPt.y, PT2.x - centerPt.x);
  const midForCcw = arcMidpoint(centerPt, radius, startAngle, endAngle, true);
  const midForCw  = arcMidpoint(centerPt, radius, startAngle, endAngle, false);
  const distCcw = Math.hypot(midForCcw.x - P.x, midForCcw.y - P.y);
  const distCw  = Math.hypot(midForCw.x - P.x,  midForCw.y - P.y);
  const anticlockwise = distCcw < distCw;

  // Build the new feature list. For an OPEN polyline:
  //   side1 = verts[0..prevIdx] + PT1
  //   side2 = PT2 + verts[nextIdx..n-1]
  // For a CLOSED polygon: open it at the filleted corner —
  //   single side polyline = PT2 + verts[nextIdx..n-1] + verts[0..prevIdx] + PT1
  // (When prevIdx wraps backwards we walk the original ring
  // in order; we only ever drop the corner vertex P itself.)
  const cloneStyle = (): typeof f.style => JSON.parse(JSON.stringify(f.style));
  const cloneProps = (): typeof f.properties => JSON.parse(JSON.stringify(f.properties));
  const buildSide = (vertsList: Point2D[]): Feature => {
    if (vertsList.length === 2) {
      return {
        ...f,
        id: generateId(),
        type: 'LINE',
        style: cloneStyle(),
        properties: cloneProps(),
        geometry: { type: 'LINE', start: vertsList[0], end: vertsList[1] },
      };
    }
    return {
      ...f,
      id: generateId(),
      type: 'POLYLINE',
      style: cloneStyle(),
      properties: cloneProps(),
      geometry: { type: 'POLYLINE', vertices: vertsList },
    };
  };

  const sides: Feature[] = [];
  if (isClosed) {
    // Walk: nextIdx → wrap → prevIdx, dropping the corner.
    const walked: Point2D[] = [PT2];
    let i = nextIdx;
    while (i !== vertexIndex) {
      walked.push(verts[i]);
      i = (i + 1) % n;
      if (i === nextIdx) break; // safety
    }
    walked.push(PT1);
    if (walked.length >= 2) sides.push(buildSide(walked));
  } else {
    const before = verts.slice(0, vertexIndex).concat([PT1]);
    const after = [PT2].concat(verts.slice(vertexIndex + 1));
    if (before.length >= 2) sides.push(buildSide(before));
    if (after.length >= 2) sides.push(buildSide(after));
  }

  const arcFeature: Feature = {
    ...f,
    id: generateId(),
    type: 'ARC',
    style: cloneStyle(),
    properties: cloneProps(),
    geometry: { type: 'ARC', arc: { center: centerPt, radius, startAngle, endAngle, anticlockwise } },
  };

  const newFeatures = [...sides, arcFeature];
  drawingStore.removeFeature(featureId);
  drawingStore.addFeatures(newFeatures);
  undoStore.pushUndo(makeBatchEntry(`Fillet corner (r=${radius})`, [
    { type: 'REMOVE_FEATURE', data: f },
    ...newFeatures.map((nf) => ({ type: 'ADD_FEATURE' as const, data: nf })),
  ]));
  selectionStore.selectMultiple(newFeatures.map((nf) => nf.id), 'REPLACE');
  return { ok: true, arcId: arcFeature.id, sideIds: sides.map((s) => s.id) };
}

/**
 * Bevel a polyline / polygon corner at a chosen vertex.
 * Symmetric chamfer when dist1 === dist2; asymmetric
 * otherwise. Same wrap-around behaviour for closed polygons
 * as `filletPolylineVertex`. Source feature is replaced by
 * up to three new features: side1 + bevel LINE + side2.
 */
export function chamferPolylineVertex(
  featureId: string,
  vertexIndex: number,
  dist1: number,
  dist2: number,
): { ok: true; bevelId: string; sideIds: string[] } | { ok: false; reason: string } {
  if (!Number.isFinite(dist1) || dist1 <= 0 || !Number.isFinite(dist2) || dist2 <= 0) {
    return { ok: false, reason: 'Chamfer distances must be > 0.' };
  }
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const selectionStore = useSelectionStore.getState();
  const f = drawingStore.getFeature(featureId);
  if (!f) return { ok: false, reason: 'Feature not found.' };
  const g = f.geometry;
  if ((g.type !== 'POLYLINE' && g.type !== 'POLYGON') || !g.vertices || g.vertices.length < 3) {
    return { ok: false, reason: 'Chamfer vertex requires a polyline / polygon with ≥ 3 vertices.' };
  }
  const verts = g.vertices;
  const isClosed = g.type === 'POLYGON';
  const n = verts.length;
  if (vertexIndex < 0 || vertexIndex >= n) return { ok: false, reason: 'Vertex index out of range.' };
  if (!isClosed && (vertexIndex === 0 || vertexIndex === n - 1)) {
    return { ok: false, reason: 'Cannot chamfer the endpoint of an open polyline.' };
  }
  const prevIdx = (vertexIndex - 1 + n) % n;
  const nextIdx = (vertexIndex + 1) % n;
  const P = verts[vertexIndex];
  const A = verts[prevIdx];
  const B = verts[nextIdx];

  const u1x = A.x - P.x;
  const u1y = A.y - P.y;
  const u2x = B.x - P.x;
  const u2y = B.y - P.y;
  const len1 = Math.hypot(u1x, u1y);
  const len2 = Math.hypot(u2x, u2y);
  if (len1 < 1e-10 || len2 < 1e-10) {
    return { ok: false, reason: 'Adjacent vertices are coincident.' };
  }
  if (dist1 > len1 - 1e-6 || dist2 > len2 - 1e-6) {
    return {
      ok: false,
      reason: `Chamfer distances exceed leg lengths — leg 1 = ${len1.toFixed(3)}, leg 2 = ${len2.toFixed(3)}.`,
    };
  }
  const T1: Point2D = { x: P.x + (dist1 / len1) * u1x, y: P.y + (dist1 / len1) * u1y };
  const T2: Point2D = { x: P.x + (dist2 / len2) * u2x, y: P.y + (dist2 / len2) * u2y };

  const cloneStyle = (): typeof f.style => JSON.parse(JSON.stringify(f.style));
  const cloneProps = (): typeof f.properties => JSON.parse(JSON.stringify(f.properties));
  const buildSide = (vertsList: Point2D[]): Feature => {
    if (vertsList.length === 2) {
      return {
        ...f,
        id: generateId(),
        type: 'LINE',
        style: cloneStyle(),
        properties: cloneProps(),
        geometry: { type: 'LINE', start: vertsList[0], end: vertsList[1] },
      };
    }
    return {
      ...f,
      id: generateId(),
      type: 'POLYLINE',
      style: cloneStyle(),
      properties: cloneProps(),
      geometry: { type: 'POLYLINE', vertices: vertsList },
    };
  };

  const sides: Feature[] = [];
  if (isClosed) {
    const walked: Point2D[] = [T2];
    let i = nextIdx;
    while (i !== vertexIndex) {
      walked.push(verts[i]);
      i = (i + 1) % n;
      if (i === nextIdx) break;
    }
    walked.push(T1);
    if (walked.length >= 2) sides.push(buildSide(walked));
  } else {
    const before = verts.slice(0, vertexIndex).concat([T1]);
    const after  = [T2].concat(verts.slice(vertexIndex + 1));
    if (before.length >= 2) sides.push(buildSide(before));
    if (after.length >= 2) sides.push(buildSide(after));
  }

  const bevelFeature: Feature = {
    ...f,
    id: generateId(),
    type: 'LINE',
    style: cloneStyle(),
    properties: cloneProps(),
    geometry: { type: 'LINE', start: T1, end: T2 },
  };

  const newFeatures = [...sides, bevelFeature];
  drawingStore.removeFeature(featureId);
  drawingStore.addFeatures(newFeatures);
  const label = dist1 === dist2 ? `Chamfer corner (${dist1})` : `Chamfer corner (${dist1}/${dist2})`;
  undoStore.pushUndo(makeBatchEntry(label, [
    { type: 'REMOVE_FEATURE', data: f },
    ...newFeatures.map((nf) => ({ type: 'ADD_FEATURE' as const, data: nf })),
  ]));
  selectionStore.selectMultiple(newFeatures.map((nf) => nf.id), 'REPLACE');
  return { ok: true, bevelId: bevelFeature.id, sideIds: sides.map((s) => s.id) };
}

/**
 * Result of attempting a `joinSelection`. `joined` is the
 * new POLYLINE feature when the walk succeeded. When it
 * couldn't, `reason` carries a short user-facing message.
 */
export interface JoinResult {
  ok: boolean;
  joined?: Feature;
  removedIds?: string[];
  reason?: string;
}

/**
 * Merge two or more selected LINE / POLYLINE features into a
 * single POLYLINE by walking shared endpoints. Endpoints are
 * considered the same when they're within `tolerance` world
 * units of each other (default 0.01 ≈ 1/8" at survey foot
 * precision; tight enough to avoid false-positive joins,
 * loose enough to absorb floating-point drift from imports).
 *
 * The walk requires the selection to form a single Euler
 * path — i.e. exactly two "open" endpoints (used by one
 * feature) and every interior endpoint shared by exactly
 * two features. Branches or fragments bail out cleanly with
 * a `reason` string instead of guessing.
 *
 * Removes the source features and adds the joined POLYLINE
 * as a single batch undo entry. Selection is replaced with
 * the new feature so the surveyor can immediately keep
 * working.
 */
export function joinSelection(tolerance = 0.01): JoinResult {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length < 2) {
    return { ok: false, reason: 'Select at least 2 lines or polylines to join.' };
  }

  // Pull the source features as (id, vertices[]) tuples.
  // Reject anything that isn't a vertex-chain so a stray
  // POINT or CIRCLE in the selection doesn't blow up the walk.
  type Source = { id: string; verts: Point2D[]; feature: Feature };
  const sources: Source[] = [];
  for (const id of ids) {
    const f = drawingStore.getFeature(id);
    if (!f) continue;
    const g = f.geometry;
    let verts: Point2D[] | null = null;
    if (g.type === 'LINE' && g.start && g.end) verts = [g.start, g.end];
    else if (g.type === 'POLYLINE' && g.vertices && g.vertices.length >= 2) verts = g.vertices.slice();
    if (!verts) {
      return { ok: false, reason: `Feature "${f.id}" isn't a line or polyline; only those can be joined.` };
    }
    sources.push({ id, verts, feature: f });
  }
  if (sources.length < 2) {
    return { ok: false, reason: 'Select at least 2 lines or polylines to join.' };
  }

  // Cluster endpoints within `tolerance` so coincident
  // endpoints map to the same node id. We only care about
  // the two endpoints of each source — interior vertices of
  // a polyline are never used as join nodes (joining can't
  // attach to the middle of a polyline; that's what SPLIT
  // is for).
  type Endpoint = { sourceIdx: number; whichEnd: 'START' | 'END'; pt: Point2D };
  const endpoints: Endpoint[] = [];
  for (let i = 0; i < sources.length; i += 1) {
    endpoints.push({ sourceIdx: i, whichEnd: 'START', pt: sources[i].verts[0] });
    endpoints.push({ sourceIdx: i, whichEnd: 'END', pt: sources[i].verts[sources[i].verts.length - 1] });
  }

  const tolSq = tolerance * tolerance;
  // node[i] = canonical index for endpoints[i] (smallest j
  // such that endpoints[j] coincides with endpoints[i]).
  const node = new Array(endpoints.length).fill(0).map((_, i) => i);
  for (let i = 0; i < endpoints.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (node[j] !== j) continue;
      const dx = endpoints[i].pt.x - endpoints[j].pt.x;
      const dy = endpoints[i].pt.y - endpoints[j].pt.y;
      if (dx * dx + dy * dy <= tolSq) {
        node[i] = j;
        break;
      }
    }
  }

  // Build adjacency — nodeId → list of (sourceIdx, whichEnd).
  const adj = new Map<number, Array<{ sourceIdx: number; whichEnd: 'START' | 'END' }>>();
  for (let i = 0; i < endpoints.length; i += 1) {
    const n = node[i];
    if (!adj.has(n)) adj.set(n, []);
    adj.get(n)!.push({ sourceIdx: endpoints[i].sourceIdx, whichEnd: endpoints[i].whichEnd });
  }

  // Find the open endpoints (degree 1). For an Euler path
  // there must be exactly two, or zero (closed loop).
  const openNodes: number[] = [];
  for (const [n, list] of adj.entries()) {
    if (list.length === 1) openNodes.push(n);
    else if (list.length > 2) {
      return { ok: false, reason: 'Selection branches at one or more endpoints — joins must form a single chain.' };
    }
  }
  if (openNodes.length !== 0 && openNodes.length !== 2) {
    return { ok: false, reason: 'Selection has more than one disconnected piece; pick features that form one chain.' };
  }

  // Walk from one chain end (or any node, for a closed loop).
  const visited = new Set<number>();
  const startNode = openNodes.length === 2 ? openNodes[0] : (adj.keys().next().value as number);
  let currentNode = startNode;
  const orderedSources: Array<{ sourceIdx: number; reversed: boolean }> = [];

  while (orderedSources.length < sources.length) {
    const list = adj.get(currentNode) ?? [];
    const next = list.find((e) => !visited.has(e.sourceIdx));
    if (!next) break;
    visited.add(next.sourceIdx);
    orderedSources.push({ sourceIdx: next.sourceIdx, reversed: next.whichEnd === 'END' });
    // Move to the OTHER endpoint of this source.
    const otherEnd = next.whichEnd === 'START' ? 'END' : 'START';
    const otherEndpointIdx = next.sourceIdx * 2 + (otherEnd === 'START' ? 0 : 1);
    currentNode = node[otherEndpointIdx];
  }

  if (orderedSources.length !== sources.length) {
    return { ok: false, reason: 'Could not walk the full selection as a single chain.' };
  }

  // Concatenate vertices in walk order, reversing as needed.
  // Skip the first vertex of each subsequent source because
  // it coincides (within tolerance) with the previous
  // source's last vertex — keeping both would emit a
  // duplicate junction vertex.
  const merged: Point2D[] = [];
  for (let i = 0; i < orderedSources.length; i += 1) {
    const { sourceIdx, reversed } = orderedSources[i];
    const verts = sources[sourceIdx].verts;
    const seq = reversed ? [...verts].reverse() : verts;
    if (i === 0) {
      for (const v of seq) merged.push({ ...v });
    } else {
      for (let k = 1; k < seq.length; k += 1) merged.push({ ...seq[k] });
    }
  }
  if (merged.length < 2) {
    return { ok: false, reason: 'Walk produced fewer than 2 vertices.' };
  }

  // Build the joined feature. Inherit style + properties
  // from the first walked source so the result reads as
  // "extension of feature A".
  const baseFeature = sources[orderedSources[0].sourceIdx].feature;
  const joined: Feature = {
    ...baseFeature,
    id: generateId(),
    type: 'POLYLINE',
    style: JSON.parse(JSON.stringify(baseFeature.style)),
    properties: JSON.parse(JSON.stringify(baseFeature.properties)),
    geometry: { type: 'POLYLINE', vertices: merged },
  };
  // Strip any polylineGroupId since the merged feature is
  // standalone (its source group identity is gone).
  if (joined.properties.polylineGroupId) {
    delete (joined.properties as Record<string, unknown>).polylineGroupId;
  }

  // Apply: remove the sources, add the joined feature, push
  // one batch undo entry.
  const removedIds: string[] = [];
  for (const s of sources) {
    drawingStore.removeFeature(s.id);
    removedIds.push(s.id);
  }
  drawingStore.addFeature(joined);
  const ops = [
    ...sources.map((s) => ({ type: 'REMOVE_FEATURE' as const, data: s.feature })),
    { type: 'ADD_FEATURE' as const, data: joined },
  ];
  undoStore.pushUndo(makeBatchEntry(`Join ${sources.length}`, ops));
  selectionStore.selectMultiple([joined.id], 'REPLACE');

  return { ok: true, joined, removedIds };
}

// ─────────────────────────────────────────────
// Trim — remove the section of a vertex-chain feature between
// the two intersections adjacent to the cursor along the chain.
// Source must be LINE or POLYLINE; targets can be LINE,
// POLYLINE, or POLYGON. POLYGON sources are skipped because
// the wrap-around case would silently produce surprises (the
// "removed segment" of a closed loop is ambiguous when no
// intersection exists). Surveyors can SPLIT first to open the
// polygon, then TRIM.
// ─────────────────────────────────────────────

interface ChainIntersection {
  /** Index of the segment on the source chain that contains this intersection. */
  segIdx: number;
  /** Parameter along that segment, 0..1. */
  segT: number;
  /** Continuous chain parameter — segIdx + segT. Used for sorting. */
  chainParam: number;
  /** World-space coordinates of the intersection. */
  pt: Point2D;
}

/**
 * Extract every line segment of a feature's outline as
 * [from, to] pairs. Used by `trimFeatureAt` to find
 * intersections of the source against every other vertex-
 * chain feature in the drawing. Curved features (CIRCLE,
 * ELLIPSE, ARC, SPLINE) return null — segment-segment
 * intersection of curves needs a heavier algorithm and is
 * out of scope for this slice.
 */
function getFeatureSegments(f: Feature): Array<[Point2D, Point2D]> | null {
  const g = f.geometry;
  if (g.type === 'LINE' && g.start && g.end) return [[g.start, g.end]];
  if ((g.type === 'POLYLINE' || g.type === 'MIXED_GEOMETRY') && g.vertices && g.vertices.length >= 2) {
    const out: Array<[Point2D, Point2D]> = [];
    for (let i = 0; i + 1 < g.vertices.length; i += 1) {
      out.push([g.vertices[i], g.vertices[i + 1]]);
    }
    return out;
  }
  if (g.type === 'POLYGON' && g.vertices && g.vertices.length >= 2) {
    const out: Array<[Point2D, Point2D]> = [];
    for (let i = 0; i < g.vertices.length; i += 1) {
      out.push([g.vertices[i], g.vertices[(i + 1) % g.vertices.length]]);
    }
    return out;
  }
  return null;
}

/**
 * Walk every segment of `chain` against every segment of
 * every feature in `targets`, returning the sorted list of
 * intersections by continuous chain parameter. Endpoint-
 * coincident hits (segT = 0 or 1) are kept — they're valid
 * trim boundaries.
 */
function findChainIntersections(
  chain: Point2D[],
  targets: Feature[],
): ChainIntersection[] {
  const out: ChainIntersection[] = [];
  for (let i = 0; i + 1 < chain.length; i += 1) {
    const a = chain[i];
    const b = chain[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-20) continue;
    for (const t of targets) {
      const segs = getFeatureSegments(t);
      if (!segs) continue;
      for (const [c, d] of segs) {
        const pt = segmentSegmentIntersection(a, b, c, d);
        if (!pt) continue;
        const segT = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2;
        out.push({ segIdx: i, segT, chainParam: i + segT, pt });
      }
    }
  }
  return out.sort((a, b) => a.chainParam - b.chainParam);
}

/**
 * Compute the continuous chain parameter for the closest
 * point on `chain` to `worldPt`. Mirrors the math in
 * `findChainIntersections` so cursor and intersections share
 * the same parameter space.
 */
function chainParamFromPoint(chain: Point2D[], worldPt: Point2D): number {
  let bestParam = 0;
  let bestDist = Infinity;
  for (let i = 0; i + 1 < chain.length; i += 1) {
    const a = chain[i];
    const b = chain[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-20) continue;
    let t = ((worldPt.x - a.x) * dx + (worldPt.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const d = Math.hypot(worldPt.x - px, worldPt.y - py);
    if (d < bestDist) {
      bestDist = d;
      bestParam = i + t;
    }
  }
  return bestParam;
}

/**
 * Slice `chain` from chain parameter `pStart` (inclusive) to
 * `pEnd` (inclusive), returning the world-space vertex list.
 * Drops collinear duplicates at endpoints. Returns an empty
 * array when the slice is degenerate (length < 2).
 */
function sliceChain(chain: Point2D[], pStart: number, pEnd: number): Point2D[] {
  if (pEnd <= pStart) return [];
  const out: Point2D[] = [];

  const startSeg = Math.floor(pStart);
  const startT = pStart - startSeg;
  const endSeg = Math.floor(pEnd);
  const endT = pEnd - endSeg;

  // Start point — interpolated unless we're exactly on a vertex.
  const a0 = chain[Math.max(0, Math.min(chain.length - 1, startSeg))];
  if (startSeg + 1 < chain.length) {
    const b0 = chain[startSeg + 1];
    out.push({
      x: a0.x + startT * (b0.x - a0.x),
      y: a0.y + startT * (b0.y - a0.y),
    });
  } else {
    out.push({ ...a0 });
  }

  // Intermediate vertices — every chain[k] with startSeg < k <= endSeg.
  for (let k = startSeg + 1; k <= endSeg; k += 1) {
    if (k < 0 || k >= chain.length) continue;
    const v = chain[k];
    const last = out[out.length - 1];
    // Skip near-duplicates that can arise when the slice
    // boundary lands exactly on an existing vertex.
    if (!last || Math.hypot(v.x - last.x, v.y - last.y) > 1e-9) {
      out.push({ ...v });
    }
  }

  // End point — interpolated unless we're exactly on a vertex.
  if (endSeg + 1 < chain.length && endT > 0) {
    const a1 = chain[endSeg];
    const b1 = chain[endSeg + 1];
    const ep = {
      x: a1.x + endT * (b1.x - a1.x),
      y: a1.y + endT * (b1.y - a1.y),
    };
    const last = out[out.length - 1];
    if (!last || Math.hypot(ep.x - last.x, ep.y - last.y) > 1e-9) {
      out.push(ep);
    }
  }

  return out.length >= 2 ? out : [];
}

/**
 * Trim a LINE or POLYLINE feature at the cursor position,
 * removing the section between the two adjacent
 * intersections with other vertex-chain features. When only
 * one side has an intersection, the remainder on that side
 * stays and the other half is discarded. When no
 * intersections exist at all, the source is deleted entirely.
 *
 * Returns true on a successful mutation.
 */
export function trimFeatureAt(featureId: string, worldPt: Point2D): boolean {
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const selectionStore = useSelectionStore.getState();
  const f = drawingStore.getFeature(featureId);
  if (!f) return false;
  const g = f.geometry;

  // Resolve the source chain.
  let chain: Point2D[] | null = null;
  if (g.type === 'LINE' && g.start && g.end) chain = [g.start, g.end];
  else if (g.type === 'POLYLINE' && g.vertices && g.vertices.length >= 2) chain = g.vertices.slice();
  else return false;
  if (!chain) return false;

  // Collect intersections against every other vertex-chain feature.
  const targets = drawingStore.getAllFeatures().filter((t) => t.id !== featureId && getFeatureSegments(t) !== null);
  const ints = findChainIntersections(chain, targets);

  // No crossings — surveyor's intent is "remove this whole feature."
  if (ints.length === 0) {
    drawingStore.removeFeature(featureId);
    selectionStore.deselectAll();
    undoStore.pushUndo(makeRemoveFeatureEntry(f));
    return true;
  }

  // Find the cursor's chain parameter and the adjacent
  // intersections (one before, one after).
  const cursorParam = chainParamFromPoint(chain, worldPt);
  const eps = 1e-6;
  let leftInt: ChainIntersection | null = null;
  let rightInt: ChainIntersection | null = null;
  for (const it of ints) {
    if (it.chainParam <= cursorParam - eps) {
      if (!leftInt || it.chainParam > leftInt.chainParam) leftInt = it;
    } else if (it.chainParam >= cursorParam + eps) {
      if (!rightInt || it.chainParam < rightInt.chainParam) rightInt = it;
    }
  }

  // No intersection on either side — leave the feature alone.
  if (!leftInt && !rightInt) return false;

  const cloneStyle = (): typeof f.style => JSON.parse(JSON.stringify(f.style));
  const cloneProps = (): typeof f.properties => JSON.parse(JSON.stringify(f.properties));
  const buildFeature = (verts: Point2D[]): Feature => {
    if (verts.length === 2) {
      return {
        ...f,
        id: generateId(),
        type: 'LINE',
        style: cloneStyle(),
        properties: cloneProps(),
        geometry: { type: 'LINE', start: verts[0], end: verts[1] },
      };
    }
    return {
      ...f,
      id: generateId(),
      type: 'POLYLINE',
      style: cloneStyle(),
      properties: cloneProps(),
      geometry: { type: 'POLYLINE', vertices: verts },
    };
  };

  const newFeatures: Feature[] = [];
  // Left half — chain[0] up to leftInt
  if (leftInt) {
    const verts = sliceChain(chain, 0, leftInt.chainParam);
    if (verts.length >= 2) newFeatures.push(buildFeature(verts));
  }
  // Right half — rightInt to chain[end]
  if (rightInt) {
    const endParam = chain.length - 1;
    const verts = sliceChain(chain, rightInt.chainParam, endParam);
    if (verts.length >= 2) newFeatures.push(buildFeature(verts));
  }

  // If both halves collapsed (degenerate cursor right next
  // to a corner), bail without mutation.
  if (newFeatures.length === 0) {
    drawingStore.removeFeature(featureId);
    selectionStore.deselectAll();
    undoStore.pushUndo(makeRemoveFeatureEntry(f));
    return true;
  }

  drawingStore.removeFeature(featureId);
  drawingStore.addFeatures(newFeatures);
  const ops = [
    { type: 'REMOVE_FEATURE' as const, data: f },
    ...newFeatures.map((nf) => ({ type: 'ADD_FEATURE' as const, data: nf })),
  ];
  undoStore.pushUndo(makeBatchEntry('Trim', ops));
  selectionStore.selectMultiple(newFeatures.map((nf) => nf.id), 'REPLACE');
  return true;
}

/**
 * Split a LINE / POLYLINE / POLYGON / ARC feature at the
 * closest point on its geometry to `worldPt`. Emits two new
 * features (or one for POLYGON, since the split opens it into
 * a single polyline) and removes the original. Skips
 * geometry types we don't support (CIRCLE / ELLIPSE / SPLINE /
 * POINT / TEXT / IMAGE).
 *
 * - LINE: emits two LINEs (start → split, split → end). If
 *   the split point coincides with an endpoint within `eps`,
 *   the operation is a no-op so we don't create degenerate
 *   zero-length segments.
 * - POLYLINE: emits two POLYLINEs (vertices up to split
 *   inclusive, split through end). The split vertex is
 *   inserted on the chosen segment if it's not already an
 *   existing vertex.
 * - POLYGON: opens the polygon into one POLYLINE that starts
 *   at the split point and walks the perimeter back to the
 *   split point. (Splitting a closed shape yields a single
 *   open chain, not two separate ones — that's the expected
 *   CAD convention.)
 * - ARC: emits two ARCs that share the projected split
 *   point as endpoint. Both inherit the source's traversal
 *   direction (anticlockwise flag) so the curve matches
 *   visually pre/post split. No-op when the projection
 *   lands on an existing endpoint.
 */
export function splitFeatureAt(featureId: string, worldPt: Point2D): boolean {
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const selectionStore = useSelectionStore.getState();
  const f = drawingStore.getFeature(featureId);
  if (!f) return false;
  const g = f.geometry;
  const eps = 1e-6;

  // ARC — handled separately since the geometry is parametric
  // rather than a polyline chain.
  if (g.type === 'ARC' && g.arc) {
    const arc = g.arc;
    const proj = arcParamFromPoint(arc, worldPt);
    if (proj.t <= eps || proj.t >= 1 - eps) return false; // landed on an endpoint
    const sweep = arcSweep(arc);
    const splitAngle = arc.startAngle + proj.t * sweep;
    const cloneStyle = (): typeof f.style => JSON.parse(JSON.stringify(f.style));
    const cloneProps = (): typeof f.properties => JSON.parse(JSON.stringify(f.properties));
    const arcA: Feature = {
      ...f,
      id: generateId(),
      type: 'ARC',
      style: cloneStyle(),
      properties: cloneProps(),
      geometry: { type: 'ARC', arc: {
        center: arc.center,
        radius: arc.radius,
        startAngle: arc.startAngle,
        endAngle: splitAngle,
        anticlockwise: arc.anticlockwise,
      } },
    };
    const arcB: Feature = {
      ...f,
      id: generateId(),
      type: 'ARC',
      style: cloneStyle(),
      properties: cloneProps(),
      geometry: { type: 'ARC', arc: {
        center: arc.center,
        radius: arc.radius,
        startAngle: splitAngle,
        endAngle: arc.endAngle,
        anticlockwise: arc.anticlockwise,
      } },
    };
    drawingStore.removeFeature(featureId);
    drawingStore.addFeatures([arcA, arcB]);
    undoStore.pushUndo(makeBatchEntry('Split arc', [
      { type: 'REMOVE_FEATURE', data: f },
      { type: 'ADD_FEATURE', data: arcA },
      { type: 'ADD_FEATURE', data: arcB },
    ]));
    selectionStore.selectMultiple([arcA.id, arcB.id], 'REPLACE');
    return true;
  }

  // Resolve the closest segment + the world-space split point.
  let splitPt: Point2D | null = null;
  let segIdx = -1;
  let chain: Point2D[] | null = null;
  let isClosed = false;

  if (g.type === 'LINE' && g.start && g.end) {
    chain = [g.start, g.end];
  } else if ((g.type === 'POLYLINE' || g.type === 'POLYGON') && g.vertices && g.vertices.length >= 2) {
    chain = g.vertices.slice();
    isClosed = g.type === 'POLYGON';
  } else {
    return false;
  }

  // Walk every segment, find the closest point.
  let bestDist = Infinity;
  for (let i = 0; i + (isClosed ? 0 : 1) < chain.length; i += 1) {
    const a = chain[i];
    const b = chain[(i + 1) % chain.length];
    const cp = closestPointOnSegment(worldPt, a, b);
    const d = Math.hypot(worldPt.x - cp.point.x, worldPt.y - cp.point.y);
    if (d < bestDist) {
      bestDist = d;
      splitPt = cp.point;
      segIdx = i;
    }
  }
  if (!splitPt || segIdx < 0) return false;

  // No-op when the split lands exactly on an existing endpoint
  // — splitting a feature into "the whole thing + nothing" is
  // never what the surveyor meant.
  const endpointA = chain[segIdx];
  const endpointB = chain[(segIdx + 1) % chain.length];
  const onA = Math.hypot(splitPt.x - endpointA.x, splitPt.y - endpointA.y) < eps;
  const onB = Math.hypot(splitPt.x - endpointB.x, splitPt.y - endpointB.y) < eps;

  const cloneStyle = (): typeof f.style => JSON.parse(JSON.stringify(f.style));
  const cloneProps = (): typeof f.properties => JSON.parse(JSON.stringify(f.properties));

  const newFeatures: Feature[] = [];

  if (g.type === 'LINE' && g.start && g.end) {
    if (onA || onB) return false;
    newFeatures.push({
      ...f,
      id: generateId(),
      type: 'LINE',
      style: cloneStyle(),
      properties: cloneProps(),
      geometry: { type: 'LINE', start: g.start, end: splitPt },
    });
    newFeatures.push({
      ...f,
      id: generateId(),
      type: 'LINE',
      style: cloneStyle(),
      properties: cloneProps(),
      geometry: { type: 'LINE', start: splitPt, end: g.end },
    });
  } else if (g.type === 'POLYLINE' && chain) {
    // Build first half: vertices [0..segIdx] + splitPt (skip
    // splitPt if it's already endpoint A; skip the last
    // appended point if it's already endpoint B of the segment).
    const firstHalf: Point2D[] = chain.slice(0, segIdx + 1);
    if (!onA) firstHalf.push(splitPt);
    const secondHalf: Point2D[] = [];
    if (!onB) secondHalf.push(splitPt);
    secondHalf.push(...chain.slice(segIdx + 1));
    if (firstHalf.length < 2 || secondHalf.length < 2) return false;
    newFeatures.push({
      ...f,
      id: generateId(),
      type: 'POLYLINE',
      style: cloneStyle(),
      properties: cloneProps(),
      geometry: { type: 'POLYLINE', vertices: firstHalf },
    });
    newFeatures.push({
      ...f,
      id: generateId(),
      type: 'POLYLINE',
      style: cloneStyle(),
      properties: cloneProps(),
      geometry: { type: 'POLYLINE', vertices: secondHalf },
    });
  } else if (g.type === 'POLYGON' && chain) {
    // Open the polygon into one polyline starting at splitPt,
    // walking the perimeter (possibly wrapping the vertex
    // array), and ending back at splitPt.
    const N = chain.length;
    const opened: Point2D[] = [];
    if (!onB) opened.push(splitPt);
    // Walk from segIdx+1 forward (wrap) back to segIdx+1.
    for (let k = 0; k < N; k += 1) {
      const idx = (segIdx + 1 + k) % N;
      opened.push(chain[idx]);
    }
    if (!onA) opened.push(splitPt);
    if (opened.length < 2) return false;
    newFeatures.push({
      ...f,
      id: generateId(),
      type: 'POLYLINE',
      style: cloneStyle(),
      properties: cloneProps(),
      geometry: { type: 'POLYLINE', vertices: opened },
    });
  }

  if (newFeatures.length === 0) return false;

  drawingStore.removeFeature(featureId);
  drawingStore.addFeatures(newFeatures);
  const ops = [
    { type: 'REMOVE_FEATURE' as const, data: f },
    ...newFeatures.map((nf) => ({ type: 'ADD_FEATURE' as const, data: nf })),
  ];
  undoStore.pushUndo(makeBatchEntry('Split', ops));
  // Replace the selection with the new pieces so the user
  // can immediately operate on either half.
  selectionStore.selectMultiple(newFeatures.map((nf) => nf.id), 'REPLACE');
  return true;
}

/**
 * Build a polar array of the current selection. `count` is
 * the total number of copies including the original. Copies
 * are placed evenly across `angleSpanDeg` (CCW positive,
 * negative sweeps CW). When `rotateItems` is true (default),
 * each copy is rotated to match its radial position so it
 * stays radially aligned — matching CAD convention. When
 * false, copies keep the source orientation (useful for
 * symbols like manhole covers that should stay upright).
 *
 * The original (selection at angle 0) stays in place; the
 * remaining `count - 1` cells are added as new features.
 */
export function arraySelectionPolar(
  count: number,
  angleSpanDeg: number,
  center: Point2D,
  rotateItems = true,
): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0) return;
  if (!Number.isFinite(count) || count < 2) return;
  if (!Number.isFinite(angleSpanDeg)) return;

  const sourceFeatures = ids
    .map((id) => drawingStore.getFeature(id))
    .filter(Boolean) as Feature[];
  if (sourceFeatures.length === 0) return;

  // Full-circle (360°) arrays divide by `count` so copies
  // wrap evenly without doubling up at start/end. Partial
  // arcs divide by `count - 1` so the first copy sits at
  // angle 0 and the last copy at the full span.
  const isFull = Math.abs(Math.abs(angleSpanDeg) - 360) < 1e-9;
  const stepDeg = isFull ? angleSpanDeg / count : angleSpanDeg / (count - 1);

  const newFeatures: Feature[] = [];
  for (let i = 1; i < count; i += 1) {
    const angleRad = (stepDeg * i * Math.PI) / 180;
    const cellGroupMap = new Map<string, string>();
    for (const f of sourceFeatures) {
      const cloned: Feature = JSON.parse(JSON.stringify(f));
      cloned.id = generateId();
      // Step 1: rotate around center. If rotateItems is
      // false, we instead translate by the chord vector
      // between original and rotated centroid, keeping the
      // original orientation.
      let transformed: Feature;
      if (rotateItems) {
        transformed = transformFeature(cloned, (p) => rotate(p, center, angleRad));
      } else {
        const allPts = getFeaturePoints(cloned);
        let cx = 0, cy = 0;
        for (const p of allPts) { cx += p.x; cy += p.y; }
        if (allPts.length > 0) { cx /= allPts.length; cy /= allPts.length; }
        const rotated = rotate({ x: cx, y: cy }, center, angleRad);
        const dx = rotated.x - cx;
        const dy = rotated.y - cy;
        transformed = transformFeature(cloned, (p) => translate(p, dx, dy));
      }
      const oldGroupId = f.properties.polylineGroupId as string | undefined;
      if (oldGroupId) {
        if (!cellGroupMap.has(oldGroupId)) cellGroupMap.set(oldGroupId, generateId());
        transformed.properties = {
          ...transformed.properties,
          polylineGroupId: cellGroupMap.get(oldGroupId)!,
        };
      }
      newFeatures.push(transformed);
    }
  }

  if (newFeatures.length === 0) return;
  drawingStore.addFeatures(newFeatures);
  const ops = newFeatures.map((f) => ({ type: 'ADD_FEATURE' as const, data: f }));
  undoStore.pushUndo(makeBatchEntry(`Polar Array ×${count}`, ops));
  selectionStore.selectMultiple(
    [...ids, ...newFeatures.map((f) => f.id)],
    'REPLACE',
  );
}

export function flipSelectionByDirection(
  direction: 'H' | 'V' | 'D1' | 'D2',
  copy = false,
): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0) return;
  const centroid = computeSelectionCentroid(ids);

  // Build the mirror-line endpoints for each direction.
  // Distance is arbitrary because `mirror` only uses the line
  // direction; we pick a unit vector for clarity.
  const D = 1;
  let lineA: Point2D;
  let lineB: Point2D;
  switch (direction) {
    case 'H':
      // Horizontal axis through centroid (flips top↔bottom).
      lineA = { x: centroid.x - D, y: centroid.y };
      lineB = { x: centroid.x + D, y: centroid.y };
      break;
    case 'V':
      // Vertical axis through centroid (flips left↔right).
      lineA = { x: centroid.x, y: centroid.y - D };
      lineB = { x: centroid.x, y: centroid.y + D };
      break;
    case 'D1':
      // Diagonal y=x — slope +1 through centroid.
      lineA = { x: centroid.x - D, y: centroid.y - D };
      lineB = { x: centroid.x + D, y: centroid.y + D };
      break;
    case 'D2':
      // Anti-diagonal y=-x — slope -1 through centroid.
      lineA = { x: centroid.x - D, y: centroid.y + D };
      lineB = { x: centroid.x + D, y: centroid.y - D };
      break;
  }
  const reflect = (p: Point2D): Point2D => mirror(p, lineA, lineB);

  if (copy) {
    const newFeatures: Feature[] = [];
    for (const id of ids) {
      const f = drawingStore.getFeature(id);
      if (!f) continue;
      const cloned: Feature = JSON.parse(JSON.stringify(f));
      cloned.id = generateId();
      const flipped = transformFeature(cloned, reflect);
      newFeatures.push({ ...cloned, geometry: flipped.geometry });
    }
    if (newFeatures.length > 0) {
      drawingStore.addFeatures(newFeatures);
      const ops = newFeatures.map((f) => ({ type: 'ADD_FEATURE' as const, data: f }));
      undoStore.pushUndo(makeBatchEntry(`Flip ${direction} (copy)`, ops));
      selectionStore.selectMultiple(newFeatures.map((f) => f.id), 'REPLACE');
    }
    return;
  }

  const ops = ids
    .map((id) => {
      const f = drawingStore.getFeature(id);
      if (!f) return null;
      const newF = transformFeature(f, reflect);
      drawingStore.updateFeature(id, { geometry: newF.geometry });
      return { type: 'MODIFY_FEATURE' as const, data: { id, before: f, after: newF } };
    })
    .filter(Boolean) as { type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }[];

  if (ops.length > 0) {
    undoStore.pushUndo(makeBatchEntry(`Flip ${direction}`, ops));
  }
}

/**
 * Invert the selection through `center` — point inversion,
 * equivalent to a 180° rotation around the center. Each
 * point P maps to P' such that center is the midpoint of PP'.
 * Honours `copy`: when true, originals stay and inverted
 * copies are added.
 */
export function invertSelection(center: Point2D, copy = false): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0) return;

  // Point inversion = rotate 180° around center.
  const invert = (p: Point2D): Point2D => rotate(p, center, Math.PI);

  if (copy) {
    const newFeatures: Feature[] = [];
    for (const id of ids) {
      const f = drawingStore.getFeature(id);
      if (!f) continue;
      const cloned: Feature = JSON.parse(JSON.stringify(f));
      cloned.id = generateId();
      const inverted = transformFeature(cloned, invert);
      newFeatures.push({ ...cloned, geometry: inverted.geometry });
    }
    if (newFeatures.length > 0) {
      drawingStore.addFeatures(newFeatures);
      const ops = newFeatures.map((f) => ({ type: 'ADD_FEATURE' as const, data: f }));
      undoStore.pushUndo(makeBatchEntry('Invert (copy)', ops));
      selectionStore.selectMultiple(newFeatures.map((f) => f.id), 'REPLACE');
    }
    return;
  }

  const ops = ids
    .map((id) => {
      const f = drawingStore.getFeature(id);
      if (!f) return null;
      const newF = transformFeature(f, invert);
      drawingStore.updateFeature(id, { geometry: newF.geometry });
      return { type: 'MODIFY_FEATURE' as const, data: { id, before: f, after: newF } };
    })
    .filter(Boolean) as { type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }[];

  if (ops.length > 0) {
    undoStore.pushUndo(makeBatchEntry('Invert', ops));
  }
}

export function flipSelectionVertical(): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0) return;

  const centroid = computeSelectionCentroid(ids);
  // Mirror line: horizontal line through centroid
  const lineA: Point2D = { x: centroid.x - 1, y: centroid.y };
  const lineB: Point2D = { x: centroid.x + 1, y: centroid.y };

  const ops = ids
    .map((id) => {
      const f = drawingStore.getFeature(id);
      if (!f) return null;
      const newF = transformFeature(f, (p) => mirror(p, lineA, lineB));
      drawingStore.updateFeature(id, { geometry: newF.geometry });
      return { type: 'MODIFY_FEATURE' as const, data: { id, before: f, after: newF } };
    })
    .filter(Boolean) as { type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }[];

  if (ops.length > 0) {
    undoStore.pushUndo(makeBatchEntry('Flip Vertical', ops));
  }
}

export function scaleSelection(factor: number): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0 || factor <= 0) return;

  const centroid = computeSelectionCentroid(ids);

  const ops = ids
    .map((id) => {
      const f = drawingStore.getFeature(id);
      if (!f) return null;
      const newF = transformFeature(f, (p) => scale(p, centroid, factor));
      drawingStore.updateFeature(id, { geometry: newF.geometry });
      return { type: 'MODIFY_FEATURE' as const, data: { id, before: f, after: newF } };
    })
    .filter(Boolean) as { type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }[];

  if (ops.length > 0) {
    undoStore.pushUndo(makeBatchEntry(`Scale ×${factor}`, ops));
  }
}

/**
 * Scale the selection non-uniformly (distort) around a pivot point.
 * scaleX and scaleY are independent multipliers for each axis.
 */
export function scaleSelectionXY(scaleX: number, scaleY: number, pivot?: Point2D): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0 || scaleX <= 0 || scaleY <= 0) return;

  const center = pivot ?? computeSelectionCentroid(ids);

  const distort = (p: Point2D): Point2D => ({
    x: center.x + (p.x - center.x) * scaleX,
    y: center.y + (p.y - center.y) * scaleY,
  });

  const ops = ids
    .map((id) => {
      const f = drawingStore.getFeature(id);
      if (!f) return null;
      const newF = transformFeature(f, distort);
      drawingStore.updateFeature(id, { geometry: newF.geometry });
      return { type: 'MODIFY_FEATURE' as const, data: { id, before: f, after: newF } };
    })
    .filter(Boolean) as { type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }[];

  if (ops.length > 0) {
    undoStore.pushUndo(makeBatchEntry(`Distort ×X${scaleX} ×Y${scaleY}`, ops));
  }
}

export function duplicateSelection(offsetX = 10, offsetY = -10): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0) return;

  // Build a mapping of old polylineGroupId → new polylineGroupId so that all
  // duplicated segments from the same polyline group share the same new group ID.
  const groupIdMap = new Map<string, string>();

  const newFeatures: Feature[] = [];
  for (const id of ids) {
    const f = drawingStore.getFeature(id);
    if (!f) continue;
    const newF: Feature = JSON.parse(JSON.stringify(f));
    newF.id = generateId();
    // Offset geometry
    const geom = newF.geometry;
    if (geom.type === 'POINT' && geom.point) {
      geom.point = { x: geom.point.x + offsetX, y: geom.point.y + offsetY };
    } else if (geom.type === 'LINE') {
      if (geom.start) geom.start = { x: geom.start.x + offsetX, y: geom.start.y + offsetY };
      if (geom.end) geom.end = { x: geom.end.x + offsetX, y: geom.end.y + offsetY };
    } else if (geom.vertices) {
      geom.vertices = geom.vertices.map((v) => ({ x: v.x + offsetX, y: v.y + offsetY }));
    }
    // Remap polylineGroupId: all duplicated segments from the same group share a new group ID
    const oldGroupId = f.properties.polylineGroupId as string | undefined;
    if (oldGroupId) {
      if (!groupIdMap.has(oldGroupId)) {
        groupIdMap.set(oldGroupId, generateId());
      }
      newF.properties = { ...newF.properties, polylineGroupId: groupIdMap.get(oldGroupId)! };
    }
    newFeatures.push(newF);
  }

  drawingStore.addFeatures(newFeatures);
  const ops = newFeatures.map((f) => ({ type: 'ADD_FEATURE' as const, data: f }));
  undoStore.pushUndo(makeBatchEntry('Duplicate', ops));

  // Select the new features
  selectionStore.selectMultiple(
    newFeatures.map((f) => f.id),
    'REPLACE',
  );
}

// ─────────────────────────────────────────────
// Phase 8 §11.7 — cross-layer transfer kernel
// ─────────────────────────────────────────────

export interface TransferToLayerOptions {
  /** When true (Duplicate), originals stay untouched and copies
   *  are stamped onto the target. When false (Move), originals
   *  are reassigned to the target layer in-place. */
  keepOriginals: boolean;
  /** When true the duplicates carry the same point numbers as
   *  their sources; when a number is given, point numbers are
   *  reassigned starting from that seed. null = preserve. */
  renumberStart: number | null;
  /** Drop the `code` property on duplicates whose code isn't
   *  in the target layer's autoAssignCodes. Geometry is
   *  preserved. */
  stripUnknownCodes: boolean;
  /** Optional remap table { sourceCode (uppercased) →
   *  targetCode }. Applied BEFORE stripUnknownCodes so a
   *  mapped code lands on the target with its new value and
   *  the strip step never sees a conflict. Surveyor builds
   *  the table via the conflict pre-pass in the dialog. */
  codeMap?: Record<string, string> | null;
  /** Optional: append duplicated POINTs to this traverse. */
  targetTraverseId: string | null;
  /** Optional translation applied to every duplicate (Duplicate
   *  only — Move never repositions). distanceFt is canonical
   *  feet; bearingDeg is decimal-degree azimuth (0 = North,
   *  clockwise, matching the rest of the survey math). When
   *  distance is 0 the offset is a no-op even if bearing is
   *  set. */
  offset?: { distanceFt: number; bearingDeg: number } | null;
  /** When true, the kernel walks the rest of the document and
   *  expands the source set with any feature whose vertices /
   *  endpoints are entirely defined by picked POINT features
   *  (every match within ε). Lets the surveyor pick "the
   *  corners of the building" and have the polygon come
   *  along. */
  bringAlongLinkedGeometry: boolean;
  /** When true, every duplicate carries linkedSourceId +
   *  linkedOffsetX/Y stamps so a background subscriber can
   *  regenerate the duplicate's geometry whenever the
   *  source's geometry changes. Opt-in; Move ignores. */
  linkDuplicatesToSource?: boolean;
  /** Stamp on every duplicate so a future audit can group
   *  features that came from the same operation. */
  transferOperationId: string;
}

export interface TransferResult {
  /** Number of features that landed on the target layer. */
  written: number;
  /** Number of source features removed (only > 0 for Move). */
  removed: number;
  /** Ids of the resulting features (the duplicates for Duplicate;
   *  the same source ids for Move). */
  resultIds: string[];
}

/**
 * Send a set of features to a target layer. Used by the
 * LayerTransferDialog's Confirm button.
 *
 * Slice 1+2 implementation: handles the core
 * Duplicate / Move semantics, optional renumber, optional
 * code-strip. Multi-target paste, bring-along-linked-geometry,
 * offset, and linked-instance flags land in later slices.
 */
export function transferSelectionToLayer(
  selectionIds: ReadonlyArray<string>,
  targetLayerId: string,
  opts: TransferToLayerOptions,
): TransferResult {
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const selectionStore = useSelectionStore.getState();

  if (selectionIds.length === 0) {
    return { written: 0, removed: 0, resultIds: [] };
  }
  const targetLayer = drawingStore.document.layers[targetLayerId];
  if (!targetLayer) {
    return { written: 0, removed: 0, resultIds: [] };
  }
  if (targetLayer.locked) {
    return { written: 0, removed: 0, resultIds: [] };
  }

  // Resolve the source features once (also lets us skip ids
  // that were deleted between the dialog opening and Confirm).
  const sourceFeatures: Feature[] = [];
  const sourceIdSet = new Set<string>();
  for (const id of selectionIds) {
    const f = drawingStore.getFeature(id);
    if (f) {
      sourceFeatures.push(f);
      sourceIdSet.add(id);
    }
  }
  if (sourceFeatures.length === 0) {
    return { written: 0, removed: 0, resultIds: [] };
  }

  // Bring-along walk — expand the source set with any
  // polyline / polygon / arc / spline / line whose vertices
  // are entirely defined by picked POINT features. Stays
  // off for Move (semantically odd to drag along linked
  // geometry that wasn't selected) and for Copy-to-clipboard.
  if (opts.bringAlongLinkedGeometry && opts.keepOriginals) {
    const allFeatures = drawingStore.getAllFeatures();
    const linkedIds = findLinkedFeatureIds(sourceIdSet, allFeatures);
    for (const lid of linkedIds) {
      const f = drawingStore.getFeature(lid);
      if (!f) continue;
      sourceFeatures.push(f);
      sourceIdSet.add(lid);
    }
  }

  const allowList = (targetLayer.autoAssignCodes ?? []).map((c) => c.toUpperCase());
  const codeAllowed = (rawCode: unknown): boolean => {
    if (allowList.length === 0) return true; // layer with no allow-list = anything goes
    const s = typeof rawCode === 'string' ? rawCode.toUpperCase() : '';
    if (!s) return true;
    return allowList.includes(s);
  };

  // ── DUPLICATE path ────────────────────────────────────────
  if (opts.keepOriginals) {
    // Resolve the optional offset into a (dx, dy) translation
    // in canonical world feet. Survey azimuth has 0 at North
    // and grows clockwise, so:
    //   dx (easting)  = distance * sin(azimuth)
    //   dy (northing) = distance * cos(azimuth)
    let dx = 0;
    let dy = 0;
    if (opts.offset && opts.offset.distanceFt > 0) {
      const az = (opts.offset.bearingDeg * Math.PI) / 180;
      dx = opts.offset.distanceFt * Math.sin(az);
      dy = opts.offset.distanceFt * Math.cos(az);
    }
    const translatePt = (p: Point2D): Point2D =>
      dx === 0 && dy === 0 ? { ...p } : { x: p.x + dx, y: p.y + dy };
    const translateFeatureGeom = (clone: Feature): void => {
      if (dx === 0 && dy === 0) return;
      const g = clone.geometry;
      if (g.type === 'POINT' && g.point) g.point = translatePt(g.point);
      else if (g.type === 'LINE') {
        if (g.start) g.start = translatePt(g.start);
        if (g.end)   g.end   = translatePt(g.end);
      } else if (g.type === 'CIRCLE' && g.circle) {
        g.circle = { ...g.circle, center: translatePt(g.circle.center) };
      } else if (g.type === 'ARC' && g.arc) {
        g.arc = { ...g.arc, center: translatePt(g.arc.center) };
      } else if (g.type === 'ELLIPSE' && g.ellipse) {
        g.ellipse = { ...g.ellipse, center: translatePt(g.ellipse.center) };
      } else if (g.type === 'SPLINE' && g.spline) {
        g.spline = { ...g.spline, controlPoints: g.spline.controlPoints.map(translatePt) };
      } else if (g.type === 'TEXT' && g.point) {
        g.point = translatePt(g.point);
      } else if (g.type === 'IMAGE' && g.image) {
        g.image = { ...g.image, position: translatePt(g.image.position) };
      } else if (g.vertices) {
        g.vertices = g.vertices.map(translatePt);
      }
    };
    let nextPointNo = opts.renumberStart;
    const newFeatures: Feature[] = [];
    for (const src of sourceFeatures) {
      const clone: Feature = JSON.parse(JSON.stringify(src));
      clone.id = generateId();
      clone.layerId = targetLayerId;
      clone.properties = { ...clone.properties };
      // Audit stamps so the LIST tool / history can trace
      // every duplicate back to its source + transfer op.
      clone.properties.duplicatedFrom = src.id;
      clone.properties.duplicatedAt = new Date().toISOString();
      clone.properties.transferOperationId = opts.transferOperationId;
      // Phase 8 §11.7 Slice 10 — stamp link metadata so
      // the background subscriber can re-propagate source
      // geometry changes onto this duplicate. dx/dy carry
      // the offset applied at duplicate-time so propagation
      // can re-apply it consistently.
      if (opts.linkDuplicatesToSource) {
        clone.properties.linkedSourceId = src.id;
        clone.properties.linkedOffsetX = dx;
        clone.properties.linkedOffsetY = dy;
      }

      // Optional remap — applied BEFORE the strip step so a
      // mapped code lands on the target with its new value
      // and the strip step never sees a conflict. Stamps the
      // original code into properties so audit can trace the
      // rename.
      if (opts.codeMap) {
        const cur = typeof clone.properties.code === 'string' ? clone.properties.code.toUpperCase() : '';
        if (cur && opts.codeMap[cur]) {
          clone.properties.codeBeforeRemap = clone.properties.code;
          clone.properties.code = opts.codeMap[cur];
        }
      }

      // Optional code strip when target layer's allow-list
      // doesn't accept this code.
      if (opts.stripUnknownCodes && !codeAllowed(clone.properties.code)) {
        delete clone.properties.code;
      }

      // Optional renumber for POINTs.
      if (nextPointNo != null && clone.geometry.type === 'POINT') {
        clone.properties.pointNo = nextPointNo;
        nextPointNo += 1;
      }

      // Apply translation last so audit stamps record the
      // pre-offset source id.
      translateFeatureGeom(clone);

      newFeatures.push(clone);
    }
    drawingStore.addFeatures(newFeatures);
    const ops = newFeatures.map((f) => ({ type: 'ADD_FEATURE' as const, data: f }));
    // Optional traverse append — POINT duplicates are
    // tacked onto the chosen traverse in surveyor-pick order.
    // Non-POINT duplicates are silently skipped here; a
    // future slice may add the "build polyline from duplicates"
    // workflow.
    if (opts.targetTraverseId) {
      const traverseStore = useTraverseStore.getState();
      const traverse = traverseStore.traverses[opts.targetTraverseId];
      if (traverse) {
        for (const f of newFeatures) {
          if (f.geometry.type !== 'POINT') continue;
          traverseStore.addPointToTraverse(opts.targetTraverseId, f.id);
        }
      }
    }
    undoStore.pushUndo(makeBatchEntry(`Duplicate to ${targetLayer.name}`, ops));
    selectionStore.selectMultiple(newFeatures.map((f) => f.id), 'REPLACE');

    return { written: newFeatures.length, removed: 0, resultIds: newFeatures.map((f) => f.id) };
  }

  // ── MOVE path ─────────────────────────────────────────────
  // Reassign each source's layerId. We don't change feature
  // ids so existing references (annotations, traverses) remain
  // valid. The undo entry captures the before/after pair.
  const ops: Array<{ type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }> = [];
  const resultIds: string[] = [];
  for (const src of sourceFeatures) {
    const before = src;
    const after: Feature = JSON.parse(JSON.stringify(src));
    after.layerId = targetLayerId;
    after.properties = { ...after.properties };
    after.properties.movedFromLayerId = src.layerId;
    after.properties.movedAt = new Date().toISOString();
    after.properties.transferOperationId = opts.transferOperationId;
    if (opts.codeMap) {
      const cur = typeof after.properties.code === 'string' ? after.properties.code.toUpperCase() : '';
      if (cur && opts.codeMap[cur]) {
        after.properties.codeBeforeRemap = after.properties.code;
        after.properties.code = opts.codeMap[cur];
      }
    }
    if (opts.stripUnknownCodes && !codeAllowed(after.properties.code)) {
      delete after.properties.code;
    }
    drawingStore.updateFeature(src.id, { layerId: after.layerId, properties: after.properties });
    ops.push({ type: 'MODIFY_FEATURE', data: { id: src.id, before, after } });
    resultIds.push(src.id);
  }
  undoStore.pushUndo(makeBatchEntry(`Move to ${targetLayer.name}`, ops));
  selectionStore.selectMultiple(resultIds, 'REPLACE');

  return { written: resultIds.length, removed: 0, resultIds };
}

export function copyCadSelection(): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  const features = ids.map((id) => drawingStore.getFeature(id)).filter(Boolean) as Feature[];
  // Snapshot the layers each copied feature references so a
  // cross-drawing paste can resolve / auto-create them later.
  const layerSnapshots: Record<string, { name: string; color: string }> = {};
  for (const f of features) {
    if (layerSnapshots[f.layerId]) continue;
    const lyr = drawingStore.document.layers[f.layerId];
    if (lyr) {
      layerSnapshots[f.layerId] = { name: lyr.name, color: lyr.color };
    }
  }
  copyToClipboard(features, layerSnapshots, drawingStore.document.id);
}

/**
 * Resolve every distinct layer id referenced by `_clipboard`
 * against the destination drawing. Returns a map of
 * (sourceLayerId → destinationLayerId), creating any
 * destination layers that don't exist yet by name. When the
 * destination already has a layer matching by name, that one
 * is reused regardless of color. Returns an empty map when
 * the clipboard didn't carry layer snapshots (old call
 * sites — falls back to the active layer in that case).
 */
function resolveClipboardLayers(): Record<string, string> {
  const drawingStore = useDrawingStore.getState();
  const destDoc = drawingStore.document;
  if (_clipboardSourceDocId && _clipboardSourceDocId === destDoc.id) {
    // Same drawing — every source id is still valid; identity map.
    const map: Record<string, string> = {};
    for (const lid of Object.keys(_clipboardLayers)) map[lid] = lid;
    return map;
  }
  // Cross-drawing — match by name; auto-create when missing.
  const byName = new Map<string, string>();
  for (const id of destDoc.layerOrder) {
    const lyr = destDoc.layers[id];
    if (lyr) byName.set(lyr.name.toLowerCase(), id);
  }
  const map: Record<string, string> = {};
  let createdCount = 0;
  for (const [srcLid, snap] of Object.entries(_clipboardLayers)) {
    const key = snap.name.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      map[srcLid] = existing;
      continue;
    }
    // Auto-create the destination layer with the source's
    // name + color. Surveyor can rename or recolor afterward.
    const newLayer: import('./types').Layer = {
      id: generateId(),
      name: snap.name,
      visible: true,
      locked: false,
      frozen: false,
      color: snap.color,
      lineWeight: 0.25,
      lineTypeId: 'SOLID',
      opacity: 1,
      groupId: null,
      sortOrder: destDoc.layerOrder.length + createdCount,
      isDefault: false,
      isProtected: false,
      autoAssignCodes: [],
    };
    drawingStore.addLayer(newLayer);
    byName.set(key, newLayer.id);
    map[srcLid] = newLayer.id;
    createdCount += 1;
  }
  if (createdCount > 0) {
    window.dispatchEvent(new CustomEvent('cad:commandOutput', {
      detail: { text: `Auto-created ${createdCount} layer${createdCount === 1 ? '' : 's'} in this drawing to match the clipboard source.` },
    }));
  }
  return map;
}

export function pasteCadClipboard(pasteWorldX?: number, pasteWorldY?: number): void {
  if (!hasClipboard()) return;
  const drawingStore = useDrawingStore.getState();
  const selectionStore = useSelectionStore.getState();
  const undoStore = useUndoStore.getState();

  // Compute clipboard centroid to offset paste to the right position
  let offsetX = 10;
  let offsetY = -10;
  if (pasteWorldX !== undefined && pasteWorldY !== undefined) {
    // Find clipboard centroid
    const clipPts: Point2D[] = [];
    for (const f of _clipboard) clipPts.push(...getFeaturePoints(f));
    if (clipPts.length > 0) {
      const bounds = computeBounds(clipPts);
      const clipCx = (bounds.minX + bounds.maxX) / 2;
      const clipCy = (bounds.minY + bounds.maxY) / 2;
      offsetX = pasteWorldX - clipCx;
      offsetY = pasteWorldY - clipCy;
    }
  }

  // Phase 8 §11.7 Slice 11 — resolve clipboard layer ids
  // against the destination drawing. Same-drawing pastes
  // resolve to identity; cross-drawing pastes auto-create
  // any missing layers from the snapshots captured at copy
  // time. Fall back to the active layer when a feature's
  // source layer wasn't snapshotted (older clipboard
  // contents).
  const layerMap = resolveClipboardLayers();
  const fallbackLayerId = drawingStore.activeLayerId;
  const newFeatures = pasteFromClipboard(offsetX, offsetY);
  for (const f of newFeatures) {
    const mapped = layerMap[f.layerId];
    if (mapped) {
      f.layerId = mapped;
    } else if (!drawingStore.document.layers[f.layerId]) {
      // Old-clipboard fallback: source layer id isn't valid
      // in this drawing and wasn't snapshotted. Land on the
      // active layer.
      f.layerId = fallbackLayerId;
    }
  }
  drawingStore.addFeatures(newFeatures);
  const ops = newFeatures.map((f) => ({ type: 'ADD_FEATURE' as const, data: f }));
  undoStore.pushUndo(makeBatchEntry('Paste', ops));
  selectionStore.selectMultiple(
    newFeatures.map((f) => f.id),
    'REPLACE',
  );
}

export function deleteSelection(): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0) return;
  const features = ids.map((id) => drawingStore.getFeature(id)).filter(Boolean) as Feature[];
  for (const f of features) drawingStore.removeFeature(f.id);
  selectionStore.deselectAll();
  if (features.length === 1) {
    undoStore.pushUndo(makeRemoveFeatureEntry(features[0]));
  } else if (features.length > 1) {
    const ops = features.map((f) => ({ type: 'REMOVE_FEATURE' as const, data: f }));
    undoStore.pushUndo(makeBatchEntry('Delete', ops));
  }
}

export function selectSimilarType(featureId: string): void {
  const drawingStore = useDrawingStore.getState();
  const selectionStore = useSelectionStore.getState();
  const feature = drawingStore.getFeature(featureId);
  if (!feature) return;
  // Select features of the same type on the same layer (matches AutoCAD "Select Similar" behaviour)
  const similarIds = drawingStore
    .getAllFeatures()
    .filter((f) => f.type === feature.type && f.layerId === feature.layerId)
    .map((f) => f.id);
  selectionStore.selectMultiple(similarIds, 'REPLACE');
}

export function zoomToSelection(): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const viewportStore = useViewportStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0) return;
  const features = ids.map((id) => drawingStore.getFeature(id)).filter(Boolean) as Feature[];
  const pts = features.flatMap(getFeaturePoints);
  if (pts.length === 0) return;
  const bounds = computeBounds(pts);
  viewportStore.zoomToExtents(bounds, 0.15);
}

// ─────────────────────────────────────────────
// Translate selection by exact world-unit offset
// ─────────────────────────────────────────────
export function translateSelection(dx: number, dy: number): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0) return;
  const ops = ids
    .map((id) => {
      const f = drawingStore.getFeature(id);
      if (!f) return null;
      const newF = transformFeature(f, (p) => translate(p, dx, dy));
      drawingStore.updateFeatureGeometry(id, newF.geometry);
      return { type: 'MODIFY_FEATURE' as const, data: { id, before: f, after: newF } };
    })
    .filter(Boolean) as { type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }[];
  if (ops.length > 0) undoStore.pushUndo(makeBatchEntry(`Move Δ(${dx.toFixed(2)}, ${dy.toFixed(2)})`, ops));
}

// ─────────────────────────────────────────────
// Offset selection (creates parallel copy for lines/polylines)
// ─────────────────────────────────────────────
export function offsetSelectionByDistance(distance: number): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length === 0 || distance === 0) return;

  const addOps: { type: 'ADD_FEATURE'; data: Feature }[] = [];
  const side: 'LEFT' | 'RIGHT' = distance >= 0 ? 'LEFT' : 'RIGHT';
  const absDist = Math.abs(distance);

  for (const id of ids) {
    const f = drawingStore.getFeature(id);
    if (!f) continue;

    const newFeatures = buildOffsetFeatures(f, absDist, side, 'MITER', false);
    for (const nf of newFeatures) {
      drawingStore.addFeature(nf);
      addOps.push({ type: 'ADD_FEATURE', data: nf });
    }
  }

  if (addOps.length > 0) {
    undoStore.pushUndo(makeBatchEntry(`Offset ${distance > 0 ? '+' : ''}${distance.toFixed(2)}`, addOps));
  }
}

/**
 * Apply an offset to a single feature and add the result to the drawing.
 * Supports both PARALLEL (perpendicular distance) and SCALE
 * (proportional resize around centroid) modes.
 *
 * @param sourceId       Feature to offset
 * @param distance       Offset distance for PARALLEL mode (must be > 0)
 * @param side           'LEFT' | 'RIGHT' | 'BOTH' — direction in PARALLEL mode, sign-flip toggle in SCALE mode
 * @param cornerHandling Corner join style (PARALLEL only)
 * @param opts           Optional bundle:
 *                         - `mode`: 'PARALLEL' (default) or 'SCALE'
 *                         - `scaleFactor`: multiplier for SCALE mode (>1 enlarges, <1 shrinks)
 *                         - `scaleLineWeight`: when true in SCALE mode, multiplies the offset
 *                           feature's line weight by `scaleFactor`. Default: false (line weight
 *                           unchanged).
 */
export function applyInteractiveOffset(
  sourceId: string,
  distance: number,
  side: 'LEFT' | 'RIGHT' | 'BOTH',
  cornerHandling: 'MITER' | 'ROUND' | 'CHAMFER',
  opts?: {
    mode?: OffsetMode;
    scaleFactor?: number;
    scaleLineWeight?: boolean;
    /**
     * When set, offset only the segment at this index (LINE
     * always 0; POLYLINE/POLYGON/MIXED_GEOMETRY 0-based). Emits
     * a single LINE feature parallel to that segment instead
     * of a whole-feature offset. Curved geometry ignores this
     * field and falls through to the whole-shape path.
     */
    segmentIndex?: number;
    /**
     * Azimuth in degrees (0 = North, clockwise) used by
     * TRANSLATE mode. Combined with `distance` it defines
     * the translation vector. Ignored in PARALLEL / SCALE
     * modes.
     */
    bearingDeg?: number;
  },
): void {
  const mode: OffsetMode = opts?.mode ?? 'PARALLEL';
  if (mode === 'PARALLEL' && distance <= 0) return;
  if (mode === 'SCALE') {
    const f = opts?.scaleFactor;
    if (typeof f !== 'number' || !Number.isFinite(f) || f <= 0) return;
  }
  if (mode === 'TRANSLATE') {
    if (distance <= 0) return;
    const b = opts?.bearingDeg;
    if (typeof b !== 'number' || !Number.isFinite(b)) return;
  }
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const f = drawingStore.getFeature(sourceId);
  if (!f) return;

  const addOps: { type: 'ADD_FEATURE'; data: Feature }[] = [];

  // TRANSLATE mode is direction-driven, not side-driven, so
  // we only run it once regardless of the `side` argument.
  // PARALLEL and SCALE keep the LEFT/RIGHT/BOTH semantics.
  const sides: Array<'LEFT' | 'RIGHT'> =
    mode === 'TRANSLATE' ? ['LEFT'] : side === 'BOTH' ? ['LEFT', 'RIGHT'] : [side];
  for (const s of sides) {
    const newFeatures = buildOffsetFeatures(f, distance, s, cornerHandling, false, {
      mode,
      scaleFactor: opts?.scaleFactor,
      scaleLineWeight: opts?.scaleLineWeight ?? false,
      segmentIndex: opts?.segmentIndex,
      bearingDeg: opts?.bearingDeg,
    });
    for (const nf of newFeatures) {
      drawingStore.addFeature(nf);
      addOps.push({ type: 'ADD_FEATURE', data: nf });
    }
  }

  if (addOps.length > 0) {
    const segSuffix = opts?.segmentIndex != null ? ' (segment)' : '';
    const label = mode === 'SCALE'
      ? `Offset ×${(opts?.scaleFactor ?? 1).toFixed(3)}${segSuffix}`
      : mode === 'TRANSLATE'
        ? `Offset ${distance.toFixed(2)} @ ${(opts?.bearingDeg ?? 0).toFixed(1)}°${segSuffix}`
        : `Offset ${distance.toFixed(2)}${segSuffix}`;
    undoStore.pushUndo(makeBatchEntry(label, addOps));
  }
}

/**
 * Internal: produce 0 or more offset Feature objects from a source feature.
 * Returns an empty array if the geometry type is unsupported or offset is invalid.
 *
 * `extra.mode === 'SCALE'` swaps the perpendicular-distance
 * dispatch for a centroid-anchored proportional resize using
 * the helpers in `geometry/offset.ts`. When SCALE produces a
 * feature it optionally applies the same scale factor to the
 * source's line weight (`extra.scaleLineWeight`); when that
 * flag is false (the default) the offset feature inherits the
 * exact line weight of the source so the visual stroke stays
 * the same regardless of geometric scaling.
 */
function buildOffsetFeatures(
  f: Feature,
  distance: number,
  side: 'LEFT' | 'RIGHT',
  cornerHandling: 'MITER' | 'ROUND' | 'CHAMFER',
  maintainLink: boolean,
  extra?: {
    mode?: OffsetMode;
    scaleFactor?: number;
    scaleLineWeight?: boolean;
    segmentIndex?: number;
    bearingDeg?: number;
  },
): Feature[] {
  const g = f.geometry;
  const mode: OffsetMode = extra?.mode ?? 'PARALLEL';
  const baseConfig = {
    distance,
    side,
    cornerHandling,
    miterLimit: 4,
    maintainLink,
    targetLayerId: null,
    mode,
    scaleFactor: extra?.scaleFactor,
    bearingDeg: extra?.bearingDeg,
  };

  // ── Per-segment dispatch ────────────────────────────────
  // When `segmentIndex` is set on a segmentable source we emit
  // a single LINE parallel to that segment regardless of mode.
  // PARALLEL uses perpendicular distance + LEFT/RIGHT side.
  // SCALE scales the segment around the SOURCE FEATURE's
  // centroid (so partial offsets stay coherent with the rest
  // of the shape's geometry). TRANSLATE applies the
  // bearing-vector translation to the chosen segment only,
  // emitting a parallel LINE feature.
  if (extra?.segmentIndex != null && isSegmentableFeature(f)) {
    return buildSegmentOffsetFeatures(
      f,
      extra.segmentIndex,
      mode,
      baseConfig,
      extra?.scaleFactor,
      extra?.scaleLineWeight ?? false,
      extra?.bearingDeg,
    );
  }

  // ── SCALE mode dispatch ────────────────────────────────
  if (mode === 'SCALE') {
    const factor = resolveScaleFactor(baseConfig);
    if (factor <= 0 || factor === 1) return [];
    return buildScaledFeatures(f, factor, extra?.scaleLineWeight ?? false);
  }

  // ── TRANSLATE mode dispatch ───────────────────────────
  if (mode === 'TRANSLATE') {
    return buildTranslatedFeatures(f, distance, extra?.bearingDeg ?? 0);
  }

  // LINE / POLYLINE / POLYGON
  let verts: Point2D[] | null = null;
  if (g.type === 'LINE' && g.start && g.end) {
    verts = [g.start, g.end];
  } else if ((g.type === 'POLYLINE' || g.type === 'POLYGON') && g.vertices) {
    verts = g.vertices;
  }
  if (verts && verts.length >= 2) {
    const offsetVerts = offsetPolyline(verts, baseConfig);
    if (offsetVerts.length < 2) return [];
    const newFeature: Feature = {
      ...JSON.parse(JSON.stringify(f)),
      id: generateId(),
      geometry: {
        ...f.geometry,
        type: g.type === 'LINE' ? 'LINE' : g.type,
        ...(g.type === 'LINE'
          ? { start: offsetVerts[0], end: offsetVerts[1] }
          : { vertices: offsetVerts }),
      },
    };
    return [newFeature];
  }

  // CIRCLE
  if (g.type === 'CIRCLE' && g.circle) {
    const newCircle = offsetCircle(g.circle, baseConfig);
    if (!newCircle) return [];
    const newFeature: Feature = {
      ...JSON.parse(JSON.stringify(f)),
      id: generateId(),
      geometry: { ...f.geometry, circle: newCircle },
    };
    return [newFeature];
  }

  // ARC
  if (g.type === 'ARC' && g.arc) {
    const newArc = offsetArc(g.arc, baseConfig);
    if (!newArc) return [];
    const newFeature: Feature = {
      ...JSON.parse(JSON.stringify(f)),
      id: generateId(),
      geometry: { ...f.geometry, arc: newArc },
    };
    return [newFeature];
  }

  // ELLIPSE — radial axis adjustment (Tiller-Hanson-style
  // approximation; surveying tolerances are tight enough
  // that this is fine when distance ≪ min(radiusX, radiusY)).
  if (g.type === 'ELLIPSE' && g.ellipse) {
    const newEllipse = offsetEllipse(g.ellipse, baseConfig);
    if (!newEllipse) return [];
    const newFeature: Feature = {
      ...JSON.parse(JSON.stringify(f)),
      id: generateId(),
      geometry: { ...f.geometry, ellipse: newEllipse },
    };
    return [newFeature];
  }

  // SPLINE — native offset that returns a SPLINE (preserves
  // editability). Falls back to the tessellate → polyline
  // path when the bezier offset produced an invalid chain
  // (e.g. fewer than 4 control points after collapsing
  // duplicate fit points).
  if (g.type === 'SPLINE' && g.spline && g.spline.controlPoints.length >= 4) {
    const offsetSplineGeom = offsetSpline(g.spline, baseConfig);
    if (offsetSplineGeom && offsetSplineGeom.controlPoints.length >= 4) {
      const newFeature: Feature = {
        ...JSON.parse(JSON.stringify(f)),
        id: generateId(),
        geometry: { ...f.geometry, spline: offsetSplineGeom },
      };
      return [newFeature];
    }
    // Fallback — tessellate + polyline-offset path. The
    // result is faceted but never crashes.
    const pts = tessellateSpline(g.spline.controlPoints);
    if (pts.length < 2) return [];
    const offsetVerts = offsetPolyline(pts, baseConfig);
    if (offsetVerts.length < 2) return [];
    const newFeature: Feature = {
      ...JSON.parse(JSON.stringify(f)),
      id: generateId(),
      type: 'POLYLINE',
      geometry: { type: 'POLYLINE', vertices: offsetVerts },
    };
    return [newFeature];
  }

  // MIXED_GEOMETRY — treat the vertex chain as a polyline
  // for offset purposes (the AI engine emits these for
  // arc-segment-and-line-segment composites).
  if (
    g.type === 'MIXED_GEOMETRY' &&
    g.vertices &&
    g.vertices.length >= 2
  ) {
    const offsetVerts = offsetPolyline(g.vertices, baseConfig);
    if (offsetVerts.length < 2) return [];
    const newFeature: Feature = {
      ...JSON.parse(JSON.stringify(f)),
      id: generateId(),
      type: 'POLYLINE',
      geometry: { type: 'POLYLINE', vertices: offsetVerts },
    };
    return [newFeature];
  }

  return [];
}

/**
 * Convert a survey-style azimuth (degrees, 0 = North,
 * clockwise) and length into a world-space displacement
 * vector. World coordinates are math convention (+x East,
 * +y North), so:
 *   dx = length * sin(azimuth_rad)
 *   dy = length * cos(azimuth_rad)
 */
function bearingVector(azimuthDeg: number, length: number): { dx: number; dy: number } {
  const rad = (azimuthDeg * Math.PI) / 180;
  return {
    dx: length * Math.sin(rad),
    dy: length * Math.cos(rad),
  };
}

/**
 * Produce 1 feature from `f` by translating it by
 * (`distance`, `bearingDeg`). Emits the same geometry type
 * as the source so a translated POLYGON stays a POLYGON
 * (unlike SCALE / PARALLEL which sometimes have to fall
 * back). Always returns a fresh feature with a new id; the
 * source stays untouched.
 */
function buildTranslatedFeatures(
  f: Feature,
  distance: number,
  bearingDeg: number,
): Feature[] {
  if (distance <= 0 || !Number.isFinite(bearingDeg)) return [];
  const { dx, dy } = bearingVector(bearingDeg, distance);
  if (dx === 0 && dy === 0) return [];
  const cloned: Feature = JSON.parse(JSON.stringify(f));
  cloned.id = generateId();
  const translated = transformFeature(cloned, (p) => translate(p, dx, dy));
  return [{ ...cloned, geometry: translated.geometry }];
}

/**
 * Produce 0 or 1 features from a single segment of `f`.
 * Always emits a LINE feature parallel to the chosen segment
 * regardless of the source's geometry container, because the
 * surveyor's intent here is to break out one edge as a
 * standalone offset (not to recreate the whole polyline /
 * polygon shape).
 *
 * Mode handling:
 * - PARALLEL: standard perpendicular offset of the two
 *   endpoints by `distance` along the chosen `side`.
 * - SCALE: scale the segment endpoints around the source
 *   feature's centroid by `scaleFactor`. The result is the
 *   matching segment from a hypothetically-scaled copy of
 *   the whole shape, which keeps partial offsets coherent
 *   with neighbours in compound features.
 *
 * `scaleLineWeight` applies in both modes — when true the
 * new LINE feature's stroke is multiplied by `scaleFactor`
 * (SCALE) or kept unchanged (PARALLEL).
 */
function buildSegmentOffsetFeatures(
  f: Feature,
  segmentIndex: number,
  mode: OffsetMode,
  baseConfig: {
    distance: number;
    side: 'LEFT' | 'RIGHT';
    cornerHandling: 'MITER' | 'ROUND' | 'CHAMFER';
    miterLimit: number;
    maintainLink: boolean;
    targetLayerId: string | null;
    mode: OffsetMode;
    scaleFactor?: number;
    bearingDeg?: number;
  },
  scaleFactor: number | undefined,
  scaleLineWeight: boolean,
  bearingDeg: number | undefined,
): Feature[] {
  const ep = getSegmentEndpoints(f, segmentIndex);
  if (!ep) return [];

  let start: Point2D;
  let end: Point2D;

  if (mode === 'SCALE') {
    const factor = resolveScaleFactor(baseConfig);
    if (factor <= 0 || factor === 1) return [];
    const allPts = getFeaturePoints(f);
    const pivot = allPts.length > 0 ? pointsCentroid(allPts) : { x: 0, y: 0 };
    start = {
      x: pivot.x + (ep[0].x - pivot.x) * factor,
      y: pivot.y + (ep[0].y - pivot.y) * factor,
    };
    end = {
      x: pivot.x + (ep[1].x - pivot.x) * factor,
      y: pivot.y + (ep[1].y - pivot.y) * factor,
    };
  } else if (mode === 'TRANSLATE') {
    if (baseConfig.distance <= 0 || typeof bearingDeg !== 'number') return [];
    const { dx, dy } = bearingVector(bearingDeg, baseConfig.distance);
    start = { x: ep[0].x + dx, y: ep[0].y + dy };
    end = { x: ep[1].x + dx, y: ep[1].y + dy };
  } else {
    if (baseConfig.distance <= 0) return [];
    const verts = offsetPolyline([ep[0], ep[1]], baseConfig);
    if (verts.length < 2) return [];
    start = verts[0];
    end = verts[1];
  }

  const factorForWeight = mode === 'SCALE' && typeof scaleFactor === 'number' ? scaleFactor : 1;
  const cloneFeature = (): Feature => JSON.parse(JSON.stringify(f));
  const sourceWeight = f.style?.lineWeight ?? null;
  const weightedStyle =
    scaleLineWeight && sourceWeight != null && factorForWeight !== 1
      ? { ...f.style, lineWeight: sourceWeight * factorForWeight, isOverride: true }
      : { ...f.style };

  const newFeature: Feature = {
    ...cloneFeature(),
    id: generateId(),
    type: 'LINE',
    geometry: { type: 'LINE', start, end },
    style: weightedStyle,
  };
  // Strip group affiliation — the segment offset is a
  // standalone LINE, not a member of the source's polyline /
  // polygon group.
  newFeature.featureGroupId = null;
  if (newFeature.properties.polylineGroupId) {
    delete (newFeature.properties as Record<string, unknown>).polylineGroupId;
  }
  return [newFeature];
}

/**
 * Produce 0 or 1 features from `f` by uniformly scaling its
 * geometry by `factor` around the feature's own centroid (or
 * center, for shapes that have one). Honours the
 * `scaleLineWeight` flag — when true, the new feature's line
 * weight is multiplied by `factor` so the stroke grows or
 * shrinks together with the geometry; when false the source
 * weight is preserved exactly. Returns an empty array when
 * the geometry type is unsupported or the result would
 * collapse.
 */
function buildScaledFeatures(
  f: Feature,
  factor: number,
  scaleLineWeight: boolean,
): Feature[] {
  if (factor <= 0 || factor === 1) return [];
  const g = f.geometry;
  const cloneFeature = (): Feature => JSON.parse(JSON.stringify(f));
  const applyLineWeight = (nf: Feature): Feature => {
    if (!scaleLineWeight) return nf;
    const sourceWeight = nf.style?.lineWeight ?? null;
    if (sourceWeight == null) return nf;
    return {
      ...nf,
      style: { ...nf.style, lineWeight: sourceWeight * factor, isOverride: true },
    };
  };

  // LINE
  if (g.type === 'LINE' && g.start && g.end) {
    const verts = scalePolylineAroundCentroid([g.start, g.end], factor);
    if (verts.length < 2) return [];
    const newFeature: Feature = {
      ...cloneFeature(),
      id: generateId(),
      geometry: { ...g, start: verts[0], end: verts[1] },
    };
    return [applyLineWeight(newFeature)];
  }

  // POLYLINE / POLYGON
  if ((g.type === 'POLYLINE' || g.type === 'POLYGON') && g.vertices && g.vertices.length >= 2) {
    const verts = scalePolylineAroundCentroid(g.vertices, factor);
    if (verts.length < 2) return [];
    const newFeature: Feature = {
      ...cloneFeature(),
      id: generateId(),
      geometry: { ...g, vertices: verts },
    };
    return [applyLineWeight(newFeature)];
  }

  // CIRCLE
  if (g.type === 'CIRCLE' && g.circle) {
    const c = scaleCircleAroundCenter(g.circle, factor);
    if (!c) return [];
    const newFeature: Feature = {
      ...cloneFeature(),
      id: generateId(),
      geometry: { ...g, circle: c },
    };
    return [applyLineWeight(newFeature)];
  }

  // ELLIPSE
  if (g.type === 'ELLIPSE' && g.ellipse) {
    const e = scaleEllipseAroundCenter(g.ellipse, factor);
    if (!e) return [];
    const newFeature: Feature = {
      ...cloneFeature(),
      id: generateId(),
      geometry: { ...g, ellipse: e },
    };
    return [applyLineWeight(newFeature)];
  }

  // ARC
  if (g.type === 'ARC' && g.arc) {
    const a = scaleArcAroundCenter(g.arc, factor);
    if (!a) return [];
    const newFeature: Feature = {
      ...cloneFeature(),
      id: generateId(),
      geometry: { ...g, arc: a },
    };
    return [applyLineWeight(newFeature)];
  }

  // SPLINE
  if (g.type === 'SPLINE' && g.spline) {
    const s = scaleSplineAroundCentroid(g.spline, factor);
    if (!s) return [];
    const newFeature: Feature = {
      ...cloneFeature(),
      id: generateId(),
      geometry: { ...g, spline: s },
    };
    return [applyLineWeight(newFeature)];
  }

  // MIXED_GEOMETRY — scale the vertex chain like a polyline.
  if (g.type === 'MIXED_GEOMETRY' && g.vertices && g.vertices.length >= 2) {
    const verts = scalePolylineAroundCentroid(g.vertices, factor);
    if (verts.length < 2) return [];
    const newFeature: Feature = {
      ...cloneFeature(),
      id: generateId(),
      type: 'POLYLINE',
      geometry: { type: 'POLYLINE', vertices: verts },
    };
    return [applyLineWeight(newFeature)];
  }

  return [];
}

/**
 * Tessellate a cubic bezier spline into world-space points for approximate offsetting.
 *
 * The control points follow SplineGeometry layout: for N segments there are 3N+1 points.
 * Segment i uses controlPoints[3i], [3i+1], [3i+2], [3i+3] (adjacent segments share an
 * endpoint). Each segment is sampled at 24 uniformly-spaced t values using the standard
 * cubic Bernstein formula. The first point of each segment after the first is skipped to
 * avoid duplicate shared endpoints in the output polyline.
 */
function tessellateSpline(controlPoints: Point2D[]): Point2D[] {
  const pts: Point2D[] = [];
  const segCount = Math.floor((controlPoints.length - 1) / 3);
  for (let seg = 0; seg < segCount; seg++) {
    const p0 = controlPoints[seg * 3];
    const p1 = controlPoints[seg * 3 + 1];
    const p2 = controlPoints[seg * 3 + 2];
    const p3 = controlPoints[seg * 3 + 3];
    const steps = 24;
    for (let i = seg === 0 ? 0 : 1; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const x = mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x;
      const y = mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y;
      pts.push({ x, y });
    }
  }
  return pts;
}

// ─────────────────────────────────────────────
// Align selection
// ─────────────────────────────────────────────
type AlignMode = 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM' | 'CENTER_H' | 'CENTER_V';

export function alignSelection(mode: AlignMode): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  if (ids.length < 2) return;

  const features = ids.map((id) => drawingStore.getFeature(id)).filter(Boolean) as Feature[];
  const allPts = features.flatMap(getFeaturePoints);
  const bounds = computeBounds(allPts);

  let targetX: number | null = null;
  let targetY: number | null = null;

  switch (mode) {
    case 'LEFT':   targetX = bounds.minX; break;
    case 'RIGHT':  targetX = bounds.maxX; break;
    case 'TOP':    targetY = bounds.maxY; break;
    case 'BOTTOM': targetY = bounds.minY; break;
    case 'CENTER_H': targetX = (bounds.minX + bounds.maxX) / 2; break;
    case 'CENTER_V': targetY = (bounds.minY + bounds.maxY) / 2; break;
  }

  const ops = features
    .map((f) => {
      const pts = getFeaturePoints(f);
      if (pts.length === 0) return null;
      const fb = computeBounds(pts);
      let dx = 0, dy = 0;
      if (targetX !== null) {
        switch (mode) {
          case 'LEFT':     dx = targetX - fb.minX; break;
          case 'RIGHT':    dx = targetX - fb.maxX; break;
          case 'CENTER_H': dx = targetX - (fb.minX + fb.maxX) / 2; break;
        }
      }
      if (targetY !== null) {
        switch (mode) {
          case 'BOTTOM':   dy = targetY - fb.minY; break;
          case 'TOP':      dy = targetY - fb.maxY; break;
          case 'CENTER_V': dy = targetY - (fb.minY + fb.maxY) / 2; break;
        }
      }
      if (dx === 0 && dy === 0) return null;
      const newF = transformFeature(f, (p) => translate(p, dx, dy));
      drawingStore.updateFeatureGeometry(f.id, newF.geometry);
      return { type: 'MODIFY_FEATURE' as const, data: { id: f.id, before: f, after: newF } };
    })
    .filter(Boolean) as { type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }[];

  if (ops.length > 0) undoStore.pushUndo(makeBatchEntry(`Align ${mode}`, ops));
}
