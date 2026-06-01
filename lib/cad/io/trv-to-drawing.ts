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
import { detectCurvedRuns, fitArcThroughPoints } from '../geometry/curve-fit';
// cad-trv-element-coverage Slice 2 — drawing-element subtype-12
// point labels feed into the mapped POINT features so the
// descriptive text (e.g. "309 inside 315 1in") shows next to
// each point on import.
import { extractPointLabels } from './trv-drawing-elements';
// cad-trv-element-coverage Slice 4 — partial decoder for the
// per-traverse fill styling records (51 / 70 / 71).
import { extractTrvFillSummary } from './trv-fill-styling';

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
    // cad-trv-element-coverage Slice 3a — opacity is FULLY VISIBLE
    // by default. The user's "not be hidden or fully opaque" ask:
    // hidden = opacity 0 (we don't do that); fully-opaque-blocking
    // refers to filled polygons that block underlying features.
    // Below we explicitly set fillColor / fillPattern to a no-fill
    // configuration so a closed polygon imports as an OUTLINE
    // ONLY — no opaque area to hide other features behind. The
    // user can opt into a fill via the property panel.
    opacity: 1,
    lineTypeId: null,
    symbolId: null,
    symbolSize: null,
    symbolRotation: 0,
    labelVisible: null,
    labelFormat: null,
    labelOffset: { x: 0, y: 0 },
    fillColor: null,
    fillPattern: 'NONE',
    fillOpacity: 1,
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
  // cad-trv-import-display Slice 1 — Traverse PC uses `2,0,0,0`
  // as a placeholder "reserve this id" record (the source Garland
  // sample has many of these for point ids 1-4 + several `:2`
  // duplicates). Skipping them is required so they don't render
  // as features piled up at the origin, miles from the real
  // survey data — that's the symptom the user reported ("nothing
  // on the page"). The original record is preserved verbatim in
  // sourceTrv for round-trip; we only skip the FEATURE creation.
  if (p.north === 0 && p.east === 0 && (p.elevation === 0 || p.elevation === null)) {
    notes.push(`Skipped placeholder point "${p.id}" (2,0,0,0 — reserved id without coords)`);
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
    // cad-trv-import-display Slice 1 — same placeholder skip as
    // mapPoint: a 10/11 ref to a `2,0,0,0` point would yank the
    // polyline through the origin, miles away from the rest of
    // the survey, and produce visible spaghetti lines once the
    // view auto-fits.
    if (p.north === 0 && p.east === 0 && (p.elevation === 0 || p.elevation === null)) continue;
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
      // True circular arc — emit an editable ARC feature
      // alongside the polyline (the polyline still passes through
      // the same vertices but the ARC gives the surveyor center +
      // radius handles).
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
      // cad-trv-import-polish Slice 1 — Spline fallback emission
      // REMOVED. The Garland sample produces 126 spline features
      // alongside its 11 polylines/polygons, all drawing through
      // the same vertices — the user sees doubled-up scribbled
      // curves. The polyline already faithfully follows every
      // vertex in the source, so the spline was visually
      // redundant. We still RECORD the detected run in
      // properties.trvCurveRuns so a future "Convert polyline
      // segment to spline" tool can read the metadata; we just
      // don't emit a SPLINE feature that double-draws.
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
  // cad-trv-element-coverage Slice 4 — surface fill-bearing
  // traverses. The user asked us to "map the infill patterns
  // from the trv" — without Traverse PC docs we can't pick a
  // specific Starr fillPattern subtype, but the binary signal
  // for "this traverse has fill" (71 field 0 > 0) is clean.
  // Stamping these properties so:
  //   (a) the user knows which traverses came with fill specs;
  //   (b) the existing PropertyPanel infill picker can be
  //       opened on the feature + the user can manually pick a
  //       Starr pattern that matches their drawing intent.
  // Raw subtype / scale / rotation values preserved verbatim
  // so a future semantic decoder can use them as input.
  const fill = extractTrvFillSummary(t.stylingRecords);
  if (fill.hasFill) {
    properties.trvHasFillSpec = true;
    if (fill.fillKindCode !== null) properties.trvFillKindCode = fill.fillKindCode;
    if (fill.subtypeIndex !== null) properties.trvFillSubtypeIndex = fill.subtypeIndex;
    if (fill.scale !== null) properties.trvFillScale = fill.scale;
    if (fill.param170 !== null) properties.trvFillParam170 = fill.param170;
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

/** cad-trv-import-polish Slice 3 — synthetic destination layers
 *  for a TRV import. Two layers per import:
 *
 *    - `${prefix} — Drawing` holds every POLYLINE / POLYGON /
 *      ARC traverse feature.
 *    - `${prefix} — Points` holds every POINT feature, so the
 *      surveyor can toggle the layer-preference panel options
 *      (point labels, point codes, etc.) without affecting the
 *      drawing strokes.
 *
 *  Each feature additionally carries `properties.trvOriginalLayer`
 *  with the name of the source TRV layer (Boundaries / Topo /
 *  Easements / etc.) for filter / colour-by / audit. The source
 *  layer ids stay accessible via the TrvDocument's `layers`
 *  table so a future round-trip can re-emit them. */
const trvDrawingLayerKey = (prefix: string) => `trv-drawing:${slugify(prefix)}`;
const trvPointsLayerKey = (prefix: string) => `trv-points:${slugify(prefix)}`;
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'import';
}

/** Project a parsed `TrvDocument` into the layers + features the
 *  drawing store consumes. Pure: no I/O, no zustand. */
export function trvToDrawing(doc: TrvDocument): TrvMappingResult {
  const notes: string[] = [];
  // Internal scratch maps for the per-feature stamping below.
  // layerIdByTrvId continues to map "TRV layer id → Starr layer
  // id" the way mapPoint / mapTraverse expect; we use the
  // OLD-style layerKey(...) so existing tests + the smart-merge
  // serializer keep working. After all features are mapped we
  // REWRITE feature.layerId to point at the synthetic Drawing
  // or Points layer, and stamp `properties.trvOriginalLayer`
  // with the source layer NAME for filter / audit.
  const trvLayerNameById = new Map<string, string>();
  for (const l of doc.layers) trvLayerNameById.set(l.id, l.name || `Layer ${l.id}`);
  const layerIdByTrvId = new Map<string, string>();
  for (const l of doc.layers) layerIdByTrvId.set(l.id, layerKey(l.id));

  const pointById = new Map<string, TrvPoint>();
  for (const p of doc.points) pointById.set(p.id, p);

  const pointFeatures: Feature[] = [];
  for (const p of doc.points) {
    const feat = mapPoint(p, layerIdByTrvId, notes);
    if (feat) pointFeatures.push(feat);
  }

  // cad-trv-element-coverage Slice 2 — enrich POINT features
  // with the descriptive labels TRV's 28/29 drawing elements
  // attached to them. Subtype-12 elements (`28,12,<pointId>`)
  // carry the multi-line label text the surveyor expected to
  // see next to their point on the plot. We use the LABEL
  // (multi-line, joined with `\n`) as `properties.label` when
  // the point doesn't already have a description (point's own
  // `1,<description>` line wins when both exist). Falls back
  // silently when no labels are present.
  const labels = extractPointLabels(doc.drawingElements);
  if (labels.length > 0) {
    const featByTrvId = new Map<string, Feature>();
    for (const f of pointFeatures) {
      const tid = f.properties.trvPointId;
      if (typeof tid === 'string') featByTrvId.set(tid, f);
    }
    let attached = 0;
    for (const lbl of labels) {
      const feat = featByTrvId.get(lbl.trvPointId);
      if (!feat) continue;
      const existing = feat.properties.label;
      if (typeof existing === 'string' && existing.trim().length > 0) continue;
      feat.properties.label = lbl.label;
      feat.properties.trvLabelSourceLine = lbl.sourceLine;
      attached++;
    }
    if (attached > 0) notes.push(`Attached ${attached} descriptive label(s) from drawing-element subtype 12`);
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

  // cad-trv-import-polish Slice 3 — build the two synthetic
  // destination layers + re-stamp every feature's layerId. The
  // ORIGINAL TRV layer name lands on `properties.trvOriginalLayer`
  // so the surveyor can filter / colour-by / audit by source
  // layer; the source TRV layer ids are still preserved in the
  // round-trip data (the parser keeps `doc.layers`).
  const prefix = trvLayerPrefix(doc);
  const drawingLayerId = trvDrawingLayerKey(prefix);
  const pointsLayerId = trvPointsLayerKey(prefix);
  const layers: Layer[] = [
    makeLayer(drawingLayerId, `${prefix} — Drawing`, 1000),
    makeLayer(pointsLayerId, `${prefix} — Points`, 1001),
  ];
  for (const f of pointFeatures) {
    const originalLayerId = f.layerId;
    f.layerId = pointsLayerId;
    const originalName = trvLayerNameByStarrId(originalLayerId, trvLayerNameById);
    if (originalName) f.properties.trvOriginalLayer = originalName;
  }
  for (const f of traverseFeatures) {
    const originalLayerId = f.layerId;
    f.layerId = drawingLayerId;
    const originalName = trvLayerNameByStarrId(originalLayerId, trvLayerNameById);
    if (originalName) f.properties.trvOriginalLayer = originalName;
  }
  return {
    layers,
    features: [...pointFeatures, ...traverseFeatures],
    notes,
  };
}

/** Build a human-friendly prefix for the two synthetic layers
 *  from the TRV project metadata. Falls back to "TRV Import"
 *  when the source has no project name. */
function trvLayerPrefix(doc: TrvDocument): string {
  const m = doc.metadata;
  const name = (m.projectName ?? '').trim();
  return name.length > 0 ? `TRV: ${name}` : 'TRV Import';
}

/** Reverse-look-up: given the Starr layer id the mapPoint /
 *  mapTraverse helpers stamped onto a feature (something like
 *  `trv-layer:3`), return the source TRV layer NAME (e.g.
 *  `Boundaries`). Used to stamp `properties.trvOriginalLayer`
 *  on each feature for filter / audit. */
function trvLayerNameByStarrId(starrLayerId: string, trvLayerNameById: Map<string, string>): string | null {
  // The helpers stamped `layerKey(trvId)` = `trv-layer:${trvId}`.
  const match = /^trv-layer:(.+)$/.exec(starrLayerId);
  if (!match) return null;
  return trvLayerNameById.get(match[1]) ?? null;
}
