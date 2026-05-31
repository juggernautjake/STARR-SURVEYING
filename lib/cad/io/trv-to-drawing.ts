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

/** Map a TrvTraverse → POLYLINE / POLYGON Feature. Closed traverses
 *  (first ref === last ref) become POLYGON; the duplicate closing
 *  vertex is dropped. Returns null when fewer than 2 referenced
 *  points have resolvable coordinates. */
function mapTraverse(
  t: TrvTraverse,
  pointById: Map<string, TrvPoint>,
  layerIdByTrvId: Map<string, string>,
  notes: string[],
): Feature | null {
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
    return null;
  }
  // Detect closed: first ref id === last ref id.
  const closed = resolved.length >= 3 && resolved[0].id === resolved[resolved.length - 1].id;
  const vertices = closed ? resolved.slice(0, -1) : resolved;
  const type: FeatureType = closed ? 'POLYGON' : 'POLYLINE';
  const layerId = t.layerId !== null ? layerIdByTrvId.get(t.layerId) ?? '' : '';
  const properties: Record<string, string | number | boolean> = {
    trvSourceLine: t.sourceLine,
    trvPointRefs: t.pointIds.join(','),
  };
  if (t.name !== null) properties.name = t.name;
  return {
    id: traverseKey(t.sourceLine),
    type,
    geometry: {
      type,
      vertices: vertices.map((v) => ({ x: v.x, y: v.y })),
    } as Feature['geometry'],
    layerId,
    style: defaultStyle(),
    properties,
  } as Feature;
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
    const feat = mapTraverse(t, pointById, layerIdByTrvId, notes);
    if (feat) traverseFeatures.push(feat);
  }

  return {
    layers,
    features: [...pointFeatures, ...traverseFeatures],
    notes,
  };
}
