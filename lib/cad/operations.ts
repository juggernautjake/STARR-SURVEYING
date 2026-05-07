// lib/cad/operations.ts — Shared CAD operations (rotate, flip, duplicate, clipboard)
// Used by FeatureContextMenu, ToolBar variants, and keyboard shortcuts.

import { generateId } from './types';
import type { Feature, OffsetMode, Point2D } from './types';
import { rotate, mirror, scale, transformFeature, translate } from './geometry/transform';
import { computeBounds } from './geometry/bounds';
import { closestPointOnSegment } from './geometry/point';
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
import { useViewportStore } from './store/viewport-store';

// ─────────────────────────────────────────────
// Clipboard
// ─────────────────────────────────────────────
let _clipboard: Feature[] = [];

export function copyToClipboard(features: Feature[]): void {
  _clipboard = features.map((f) => ({ ...f }));
}

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
 * Split a LINE / POLYLINE / POLYGON feature at the closest
 * point on its geometry to `worldPt`. Emits two new features
 * (or one for POLYGON, since the split opens it into a
 * single polyline) and removes the original. Skips features
 * that are not vertex-chain shapes.
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
 */
export function splitFeatureAt(featureId: string, worldPt: Point2D): boolean {
  const drawingStore = useDrawingStore.getState();
  const undoStore = useUndoStore.getState();
  const selectionStore = useSelectionStore.getState();
  const f = drawingStore.getFeature(featureId);
  if (!f) return false;
  const g = f.geometry;
  const eps = 1e-6;

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

export function copyCadSelection(): void {
  const selectionStore = useSelectionStore.getState();
  const drawingStore = useDrawingStore.getState();
  const ids = Array.from(selectionStore.selectedIds);
  const features = ids.map((id) => drawingStore.getFeature(id)).filter(Boolean) as Feature[];
  copyToClipboard(features);
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

  const newFeatures = pasteFromClipboard(offsetX, offsetY);
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
