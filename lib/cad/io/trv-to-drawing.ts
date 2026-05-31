// lib/cad/io/trv-to-drawing.ts
//
// cad-trv-import-export Slice 2 — pure mapper from a parsed
// `TrvDocument` into the shape our drawing store consumes: a list
// of `Layer` records + a list of `Feature` records. Designed to be
// composable with the Slice-4 file-menu Import UI:
//
//   const doc = parseTrv(text);
//   const { layers, features, notes } = trvToDrawing(doc);
//   for (const l of layers) drawingStore.addLayer(l);
//   drawingStore.addFeatures(features);
//
// Coordinate convention: TRV uses state-plane survey FEET with axes
// (north, east, elevation). Our drawing space is unitless screen-
// y-DOWN, so the natural mapping is `x = east, y = -north`. The
// original survey coords are stashed on `feature.properties` (as
// `surveyNorth` / `surveyEast` / `surveyElevation`) so Slice 5's
// serializer can invert the transform on export.
//
// Pure module: no DOM, no zustand. Safe to unit-test.

import type {
  Feature,
  FeatureStyle,
  Layer,
  FeatureType,
} from '../types';
import type { TrvDocument, TrvLayer, TrvPoint, TrvTraverse } from './trv-parser';
// cad-trv-import-export-deep-semantic Pass 7 — curve detection
// + best-fit ARC / SPLINE for traverses with curved geometry.
import { detectCurvedRuns, fitArcThroughPoints, fitSplineControlPoints } from '../geometry/curve-fit';

/** Output of the mapper. Caller writes layers + features into the
 *  store; `notes` collects non-fatal mapping issues (missing point
 *  refs in a traverse, points with no coords, etc.) for surfacing
 *  in the Slice-4 import confirmation modal. */
export interface TrvMappingResult {
  layers: Layer[];
  features: Feature[];
  notes: string[];
}

/** Default Layer fields. */
function makeLayer(id: string, name: string, sortOrder: number): Layer {
  return {
    id,
    name,
    visible: true,
    locked: false,
    frozen: false,
    color: '#000000',
    lineWeight: 0.5,
    lineTypeId: 'SOLID',
    opacity: 1,
    groupId: null,
    sortOrder,
    isDefault: false,
    isProtected: false,
    autoAssignCodes: [],
  };
}

/** Default Feature style. */
function defaultStyle(): FeatureStyle {
  return {
    color: '#000000',
    lineWeight: 0.5,
    opacity: 1,
    lineTypeId: null,
    symbolId: null,
    symbolSize: null,
    symbolRotation: 0,
    labelVisible: null,
    labelFormat: null,
    labelOffset: { x: 0, y: 0 },
  } as unknown as FeatureStyle;
}

/** Stable ID derivation — prefix TRV ids with `trv-` so they can't
 *  collide with our own runtime ids. Layer ids use the numeric TRV
 *  id; point ids use the TRV point id verbatim (which may be a
 *  string like `1`, `20fnd`, `1:1`). */
const layerKey = (trvId: string) => `trv-layer:${trvId}`;
const pointKey = (trvId: string) => `trv-point:${trvId}`;
const traverseKey = (sourceLine: number) => `trv-traverse:${sourceLine}`;

/** Map a TrvLayer → our Layer record. */
function mapLayer(l: TrvLayer, sortOrder: number): Layer {
  return makeLayer(layerKey(l.id), l.name || `Layer ${l.id}`, sortOrder);
}

/** Map a TrvPoint → POINT Feature. Returns null when the point has
 *  no usable coords. */
function mapPoint(
  p: TrvPoint,
  layerIdByTrvId: Map<string, string>,
  notes: string[],
): Feature | null {
  if (p.north === null || p.east === null) {
    notes.push(`Skipped point "${p.id}" — missing coordinates`);
    return null;
  }
  const layerId = p.layerId !== null ? layerIdByTrvId.get(p.layerId) ?? null : null;
  const properties: Record<string, string | number | boolean> = {
    trvPointId: p.id,
    surveyNorth: p.north,
    surveyEast: p.east,
  };
  if (p.elevation !== null) properties.elevation = p.elevation;
  if (p.description !== null) properties.label = p.description;
  if (p.methodCode !== null) properties.trvMethodCode = p.methodCode;
  return {
    id: pointKey(p.id),
    type: 'POINT',
    geometry: {
      type: 'POINT',
      point: { x: p.east, y: -p.north },
    } as Feature['geometry'],
    layerId: layerId ?? '',
    style: defaultStyle(),
    properties,
  } as Feature;
}

/** cad-trv-import-export-deep-semantic Pass 7 — fit residual
 *  threshold (in source units, typically feet) above which the
 *  mapper falls back from ARC to SPLINE for a curved run.
 *  Calibrated so an arc that's actually a circle stays an ARC;
 *  a free-form curve becomes a SPLINE the surveyor can still
 *  edit via spline-fit-point handles. */
const ARC_FIT_RESIDUAL_TOLERANCE = 0.05;

/** Map a TrvTraverse → POLYLINE / POLYGON Feature. Closed traverses
 *  (first ref === last ref) become POLYGON; the duplicate closing
 *  vertex is dropped. Returns null when fewer than 2 referenced
 *  points have resolvable coordinates. */
function mapTraverse(
  t: TrvTraverse,
  pointById: Map<string, TrvPoint>,
  layerIdByTrvId: Map<string, string>,
  notes: string[],
): Feature[] {
  // Resolve coords by point id; skip missing refs but record them.
  const resolved: Array<{ id: string; x: number; y: number }> = [];
  for (const ref of t.pointIds) {
    const p = pointById.get(ref);
    if (!p) {
      notes.push(`Traverse "${t.name ?? 'unnamed'}" — missing point "${ref}"`);
      continue;
    }
    if (p.north === null || p.east === null) continue;
    resolved.push({ id: ref, x: p.east, y: -p.north });
  }
  if (resolved.length < 2) {
    notes.push(`Traverse "${t.name ?? 'unnamed'}" — fewer than 2 resolvable points; skipped`);
    return [];
  }
  // Detect closed: first ref id === last ref id.
  const closed = resolved.length >= 3 && resolved[0].id === resolved[resolved.length - 1].id;
  const vertices = closed ? resolved.slice(0, -1) : resolved;
  const type: FeatureType = closed ? 'POLYGON' : 'POLYLINE';
  const layerId = t.layerId !== null ? layerIdByTrvId.get(t.layerId) ?? '' : '';

  // Pass 7 — detect curved runs in the resolved vertex chain.
  // For each run, fit an arc; if the residual is high, fall back
  // to a cubic-spline fit. Each detected curve becomes an
  // additional ARC / SPLINE feature ON THE SAME LAYER (with a
  // back-reference to the source traverse) so the surveyor can
  // edit it via the existing arc / spline tools. The original
  // polyline / polygon STAYS so the boundary + area stay intact.
  const traverseId = traverseKey(t.sourceLine);
  const curveFeatures: Feature[] = [];
  const detectedRuns: Array<{ startIndex: number; endIndex: number; kind: 'ARC' | 'SPLINE'; residual: number }> = [];
  const runs = detectCurvedRuns(vertices.map((v) => ({ x: v.x, y: v.y })));
  let curveIdx = 0;
  for (const run of runs) {
    const slice = vertices.slice(run.startIndex, run.endIndex + 1).map((v) => ({ x: v.x, y: v.y }));
    const arc = fitArcThroughPoints(slice);
    if (arc && arc.maxResidual <= ARC_FIT_RESIDUAL_TOLERANCE) {
      curveFeatures.push({
        id: `${traverseId}:arc:${curveIdx}`,
        type: 'ARC',
        geometry: { type: 'ARC', arc: { center: arc.center, radius: arc.radius, startAngle: arc.startAngle, endAngle: arc.endAngle, anticlockwise: arc.anticlockwise } } as Feature['geometry'],
        layerId,
        style: defaultStyle(),
        properties: {
          curveOfTraverse: traverseId,
          curveKind: 'ARC',
          curveRunStartIdx: run.startIndex,
          curveRunEndIdx: run.endIndex,
          arcResidual: arc.maxResidual,
        },
      } as Feature);
      detectedRuns.push({ startIndex: run.startIndex, endIndex: run.endIndex, kind: 'ARC', residual: arc.maxResidual });
    } else {
      const cp = fitSplineControlPoints(slice);
      curveFeatures.push({
        id: `${traverseId}:spline:${curveIdx}`,
        type: 'SPLINE',
        geometry: { type: 'SPLINE', spline: { controlPoints: cp, isClosed: false } } as Feature['geometry'],
        layerId,
        style: defaultStyle(),
        properties: {
          curveOfTraverse: traverseId,
          curveKind: 'SPLINE',
          curveRunStartIdx: run.startIndex,
          curveRunEndIdx: run.endIndex,
          arcResidual: arc?.maxResidual ?? -1,
        },
      } as Feature);
      detectedRuns.push({ startIndex: run.startIndex, endIndex: run.endIndex, kind: 'SPLINE', residual: arc?.maxResidual ?? -1 });
    }
    curveIdx++;
  }

  const properties: Record<string, string | number | boolean> = {
    trvSourceLine: t.sourceLine,
    trvPointRefs: t.pointIds.join(','),
  };
  if (t.name !== null) properties.name = t.name;
  // Pass 3 — preserve the traverse's full styling record sequence
  // (32-76, 159-162, 349-369, etc.) as JSON so the round-trip
  // re-emits it. Feature properties only accept primitives, so JSON-
  // encode the array of { code, fields } records.
  if (t.stylingRecords.length > 0) {
    properties.trvStylingRecords = JSON.stringify(t.stylingRecords);
  }
  // Pass 7 — record the detected curve runs so a downstream
  // serializer (or UI tool) can refer back to which segments
  // were curve-fit on import. The original polyline stays
  // intact so the area / boundary calc is unaffected.
  if (detectedRuns.length > 0) {
    properties.trvCurveRuns = JSON.stringify(detectedRuns);
  }
  const polyline: Feature = {
    id: traverseId,
    type,
    geometry: {
      type,
      vertices: vertices.map((v) => ({ x: v.x, y: v.y })),
    } as Feature['geometry'],
    layerId,
    style: defaultStyle(),
    properties,
  } as Feature;
  return [polyline, ...curveFeatures];
}

/** Project a parsed `TrvDocument` into the layers + features the
 *  drawing store consumes. Pure: no I/O, no zustand. */
export function trvToDrawing(doc: TrvDocument): TrvMappingResult {
  const notes: string[] = [];
  const layers: Layer[] = doc.layers.map((l, i) => mapLayer(l, i));
  const layerIdByTrvId = new Map<string, string>();
  for (const l of doc.layers) layerIdByTrvId.set(l.id, layerKey(l.id));

  const pointById = new Map<string, TrvPoint>();
  for (const p of doc.points) pointById.set(p.id, p);

  const pointFeatures: Feature[] = [];
  for (const p of doc.points) {
    const feat = mapPoint(p, layerIdByTrvId, notes);
    if (feat) pointFeatures.push(feat);
  }

  const traverseFeatures: Feature[] = [];
  for (const t of doc.traverses) {
    // Pass 7 — mapTraverse returns an array (1 polyline + N
    // optional ARC/SPLINE curve features) so each detected curve
    // run becomes an editable native curve alongside the
    // boundary polyline.
    const feats = mapTraverse(t, pointById, layerIdByTrvId, notes);
    for (const f of feats) traverseFeatures.push(f);
  }

  return {
    layers,
    features: [...pointFeatures, ...traverseFeatures],
    notes,
  };
}
