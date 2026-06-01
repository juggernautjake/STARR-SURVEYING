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
// (north, east, elevation). Starr's WORLD space is Y-UP (north =
// +y), matching the native field-data importer
// (`linework-features.ts` uses `{ x: easting, y: northing }`) and
// the AI coord helper. So the mapping is `x = east, y = +north`.
// (Earlier this negated north, which vertically MIRRORED the
// survey relative to the north arrow + paper — the user caught
// the flip.) The original survey coords are stashed on
// `feature.properties` (`surveyNorth` / `surveyEast` /
// `surveyElevation`) so the serializer can invert losslessly on
// export.
//
// Pure module: no DOM, no zustand. Safe to unit-test.

import type {
  Feature,
  FeatureGeometry,
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
import { extractPointLabels, extractLineLabels, extractAreaLabels, extractConnectors, extractElementShapes, extractTextElements } from './trv-drawing-elements';
// cad-trv-fidelity Slice 7 — assign a monument/utility symbol to an
// imported point when its feature code matches a symbol's assignedCodes.
import { getSymbolsByAssignedCode } from '../styles/symbol-library';
// cad-trv-element-coverage Slice 4 — partial decoder for the
// per-traverse fill styling records (51 / 70 / 71).
import { extractTrvFillSummary } from './trv-fill-styling';
// cad-trv-straight-line-styling Slice 1 — decode 51/71 → line
// type + weight + fill.
import { decodeTrvLineStyle } from './trv-line-style';

/** Output of the mapper. Caller writes layers + features into the
 *  store; `notes` collects non-fatal mapping issues (missing point
 *  refs in a traverse, points with no coords, etc.) for surfacing
 *  in the Slice-4 import confirmation modal. */
export interface TrvMappingResult {
  layers: Layer[];
  features: Feature[];
  notes: string[];
}

/** cad-trv-fidelity Slice 5 — recognise TPC's construction/duplicate
 *  traverse naming so they import HIDDEN (they're working artifacts TPC
 *  doesn't plot): `Copy-…`, `DUP-…`, parallel offsets `Right/Left N
 *  Feet-…`, and `… offsets`. CSV master-lists are handled separately in
 *  mapTraverse (rendered as points only). */
function isConstructionTraverse(name: string | null): boolean {
  if (!name) return false;
  const n = name.trim();
  return /^(copy|dup)-/i.test(n)
    || /^(right|left)\s+[\d.]+\s*f(?:ee|oo)?t-/i.test(n)
    || /\boffsets?$/i.test(n);
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

/** cad-trv-dual-layer-filename Slice 2 — deep clone a POINT
 *  feature's geometry so the Drawing-layer copy and the Points-
 *  layer original share no object references. Without this the
 *  inner `{ x, y }` `point` is aliased + editing one layer would
 *  bleed into the other on any in-place mutation. */
function clonePointGeometry(g: FeatureGeometry): FeatureGeometry {
  if (g.type !== 'POINT' || !g.point) return { ...g };
  return { ...g, point: { x: g.point.x, y: g.point.y } };
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
  // cad-trv-import-polish Slice 4 — stamp the standard Starr
  // property names (pointName, description) IN ADDITION to the
  // TRV-specific ones. The layer-preference panel's "Show point
  // names" + "Show point descriptions" toggles read these
  // standard fields via `generate-labels.ts`; without them the
  // toggles silently no-op on imported features.
  const properties: Record<string, string | number | boolean> = {
    trvPointId: p.id,
    surveyNorth: p.north,
    surveyEast: p.east,
    // Standard Starr fields so the layer-preference panel works
    // out of the box on imported points.
    pointName: p.id,
  };
  if (p.elevation !== null) properties.elevation = p.elevation;
  if (p.description !== null) {
    // cad-trv-drawing-parsing Slice 2 — also stamp `code` so the
    // layer-prefs "Show point descriptions" branch finds a value
    // when the description doesn't resolve to a known code-library
    // alpha+numeric pair (the common case for TRV imports —
    // descriptions are free-form text like "309 inside 315 1in").
    // The label generator falls back to `properties.code` when no
    // recognized code is present.
    properties.code = p.description;
    properties.label = p.description;
    properties.description = p.description;
  }
  if (p.methodCode !== null) properties.trvMethodCode = p.methodCode;
  // cad-trv-fidelity Slice 7 — assign a point symbol when the TRV
  // feature code (the first token of the description) EXACTLY matches a
  // symbol's assignedCodes (e.g. "309" → its monument glyph). Exact
  // match only, so a free-form description never mis-assigns; points
  // with no matching code keep the default crosshair.
  const style = defaultStyle();
  if (p.description) {
    const token = p.description.trim().split(/\s+/)[0];
    if (token) {
      const matches = getSymbolsByAssignedCode(token);
      if (matches.length > 0) style.symbolId = matches[0].id;
    }
  }
  return {
    id: pointKey(p.id),
    type: 'POINT',
    geometry: {
      type: 'POINT',
      point: { x: p.east, y: p.north },
    } as Feature['geometry'],
    layerId: layerId ?? '',
    style,
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
  // cad-trv-drawing-parsing Slice 1 — Traverse PC names
  // master point lists from a CSV / TXT import with the import
  // source filename (e.g. `26074.csv`, `Copy-26074.csv`,
  // `DUP-26074.csv`). Traverse PC renders these as POINT
  // SYMBOLS only — they're NOT drawing polylines. Our mapper
  // would otherwise connect 200+ unrelated survey shots in row
  // order, producing the "all over the place" visual mess the
  // user reported. Skip the polyline; the member points still
  // come through the points pass as native POINT features.
  // Case-insensitive `.csv` suffix is the strongest signal —
  // `.txt` would be ambiguous so we keep that conservative.
  if (t.name && /\.csv\b/i.test(t.name)) {
    notes.push(`Skipped CSV master-list traverse "${t.name}" (${t.pointIds.length} points, rendered as POINT symbols only)`);
    return [];
  }
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
    resolved.push({ id: ref, x: p.east, y: p.north });
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
  // cad-trv-straight-line-styling Slice 1 — decode the cracked
  // 51 / 71 line-style records into the polyline's style so
  // imported straight lines render with the right line type
  // (fence wire vs solid), weight (bold boundary), and fill
  // (DECK diagonal hatch, ROAD percent screen) — matching TPC.
  const lineStyle = decodeTrvLineStyle(t.stylingRecords);
  const style = defaultStyle();
  style.lineTypeId = lineStyle.lineTypeId;
  if (lineStyle.isBold) style.lineWeight = 0.5;
  if (lineStyle.fillPattern !== 'NONE') {
    style.fillPattern = lineStyle.fillPattern;
    style.patternRotation = lineStyle.fillRotation;
    style.patternDensity = lineStyle.fillDensity;
    // Fill renders need a pattern color + a non-zero fill opacity
    // (the import default is outline-only). Black @ full opacity
    // matches TPC's dark-gray hatch closely enough; the surveyor
    // can recolor via the infill panel.
    style.patternColor = '#000000';
    style.fillOpacity = 1;
    if (typeof lineStyle.tpcFillName === 'string') {
      properties.trvFillName = lineStyle.tpcFillName;
    }
  }
  const polyline: Feature = {
    id: traverseId,
    type,
    geometry: {
      type,
      vertices: vertices.map((v) => ({ x: v.x, y: v.y })),
    } as Feature['geometry'],
    layerId,
    style,
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

/** Options for {@link trvToDrawing}. */
export interface TrvToDrawingOptions {
  /** cad-trv-dual-layer-filename Slice 1 — when set, use this string
   *  verbatim as the synthetic layer-name prefix (the surveyor wants
   *  the imported FILE's name on the layers, e.g. "Smith Boundary —
   *  Drawing"). Falls back to the project-name prefix when omitted. */
  layerPrefix?: string;
}

/** Project a parsed `TrvDocument` into the layers + features the
 *  drawing store consumes. Pure: no I/O, no zustand. */
export function trvToDrawing(doc: TrvDocument, opts: TrvToDrawingOptions = {}): TrvMappingResult {
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
      // cad-trv-import-polish Slice 4 — mirror onto the standard
      // Starr `description` field so the layer-preference panel's
      // "Show point descriptions" toggle picks it up.
      feat.properties.description = lbl.label;
      feat.properties.trvLabelSourceLine = lbl.sourceLine;
      attached++;
    }
    if (attached > 0) notes.push(`Attached ${attached} descriptive label(s) from drawing-element subtype 12`);
  }

  const traverseFeatures: Feature[] = [];
  let hiddenConstruction = 0;
  for (const t of doc.traverses) {
    // Pass 7 — mapTraverse returns an array (1 polyline + N
    // optional ARC/SPLINE curve features) so each detected curve
    // run becomes an editable native curve alongside the
    // boundary polyline.
    const feats = mapTraverse(t, pointById, layerIdByTrvId, notes);
    // cad-trv-fidelity Slice 5 — TPC working COPIES / DUPLICATES /
    // parallel OFFSET traverses are construction artifacts it doesn't
    // plot. Import them HIDDEN so they don't show as stray lines
    // (parity with TPC) but stay in the doc + Layers panel for the
    // surveyor to unhide. CSV master-lists are handled separately.
    const construction = isConstructionTraverse(t.name);
    for (const f of feats) {
      if (construction) {
        f.hidden = true;
        f.properties.trvConstruction = true;
      }
      traverseFeatures.push(f);
    }
    if (construction && feats.length > 0) hiddenConstruction++;
  }
  if (hiddenConstruction > 0) {
    notes.push(`Hid ${hiddenConstruction} construction/duplicate/offset traverse(s) (copies, DUPs, parallel offsets) to match TPC — unhide them in the Layers panel if needed`);
  }

  // cad-trv-line-curve-fidelity Slice 2 — attach TPC's verbatim
  // segment labels (28,15) + area annotations (28,14) onto the
  // matching traverse polyline. The label text is TPC's exact
  // rendered string ("N 73°34'00" W 299.62'"), so using it
  // guarantees a pixel-match where present; segments without an
  // explicit 28,15 still get our computed bearing (which already
  // matches TPC to the second). Stored as JSON on the polyline
  // so the render + round-trip paths can consume + re-emit them.
  const lineLabels = extractLineLabels(doc.drawingElements);
  const areaLabels = extractAreaLabels(doc.drawingElements);
  if (lineLabels.length > 0 || areaLabels.length > 0) {
    const polylineFeatures = traverseFeatures.filter(
      (f) => f.type === 'POLYLINE' || f.type === 'POLYGON',
    );
    // Attach each line label to the polyline whose ordered point
    // refs contain the from→to (or to→from) consecutive pair.
    for (const lbl of lineLabels) {
      const owner = polylineFeatures.find((f) => {
        const refs = String(f.properties.trvPointRefs ?? '').split(',');
        for (let i = 0; i < refs.length - 1; i++) {
          if ((refs[i] === lbl.fromId && refs[i + 1] === lbl.toId) ||
              (refs[i] === lbl.toId && refs[i + 1] === lbl.fromId)) {
            return true;
          }
        }
        return false;
      });
      if (!owner) continue;
      const existing = owner.properties.trvSegmentLabels;
      const arr: Array<{ fromId: string; toId: string; text: string }> =
        typeof existing === 'string' ? JSON.parse(existing) : [];
      arr.push({ fromId: lbl.fromId, toId: lbl.toId, text: lbl.text });
      owner.properties.trvSegmentLabels = JSON.stringify(arr);
    }
    // Attach the FIRST area label to the largest closed polygon
    // (closed traverses carry the lot area). When multiple
    // polygons exist we pick the one with the most vertices as
    // the boundary heuristic.
    if (areaLabels.length > 0) {
      const polygons = polylineFeatures.filter((f) => f.type === 'POLYGON');
      const boundary = polygons.sort(
        (a, b) => (b.geometry.vertices?.length ?? 0) - (a.geometry.vertices?.length ?? 0),
      )[0];
      if (boundary) boundary.properties.trvAreaLabel = areaLabels[0].text;
    }
    notes.push(`Attached ${lineLabels.length} segment label(s) + ${areaLabels.length} area label(s) from drawing elements`);
  }

  // cad-trv-import-polish Slice 3 — build the two synthetic
  // destination layers + re-stamp every feature's layerId. The
  // ORIGINAL TRV layer name lands on `properties.trvOriginalLayer`
  // so the surveyor can filter / colour-by / audit by source
  // layer; the source TRV layer ids are still preserved in the
  // round-trip data (the parser keeps `doc.layers`).
  // cad-trv-dual-layer-filename Slice 1 — prefer the imported FILE
  // name (threaded via opts.layerPrefix) over the TRV project name.
  const prefix = (opts.layerPrefix ?? '').trim() || trvLayerPrefix(doc);
  const drawingLayerId = trvDrawingLayerKey(prefix);
  const pointsLayerId = trvPointsLayerKey(prefix);
  // cad-trv-label-prefs-off Slice 1 — imported layers come in with
  // ALL display-preference toggles OFF (no seeded displayPreferences
  // → the label generator falls back to DEFAULT_LAYER_DISPLAY_
  // PREFERENCES, everything false). The user explicitly wants
  // anything IMPORTED (TRV / field data) to start with every
  // toggle off; only `.starr` / saved files carry their stored
  // preferences. (Previously we seeded showBearings / showPoint-
  // Names true — but seeding the PREF without generating the
  // textLabels left an inconsistent "toggle looks on, nothing
  // renders" state. With no seeding, flipping a toggle in the
  // panel is a real false→true change that regenerates + shows
  // the labels.)
  const drawingLayer = makeLayer(drawingLayerId, `${prefix} — Drawing`, 1000);
  const pointsLayer = makeLayer(pointsLayerId, `${prefix} — Points`, 1001);
  const layers: Layer[] = [drawingLayer, pointsLayer];
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
  // cad-trv-drawing-element-rendering Slice 1 — render `28,16`
  // connector segments (point-id pairs) as LINE features on the
  // Drawing layer. These are the plotted linework TPC draws between
  // shots (pavement edges, building lines, fences) and are a major
  // part of the drawing we previously dropped. Two safeguards:
  //   - DEDUP against traverse edges: many connectors echo a
  //     boundary the traverse already draws, so we skip any pair
  //     that is a consecutive edge of a rendered traverse polyline
  //     (else the plat shows doubled lines).
  //   - `trvDerived` marks them as render echoes of the verbatim
  //     `28` block so the round-trip serializer never re-emits them.
  const connectorFeatures: Feature[] = [];
  {
    const connectors = extractConnectors(doc.drawingElements);
    if (connectors.length > 0) {
      const featByTrvId = new Map<string, Feature>();
      for (const f of pointFeatures) {
        const tid = f.properties.trvPointId;
        if (typeof tid === 'string') featByTrvId.set(tid, f);
      }
      // Build the set of undirected point-pair edges the traverses
      // already draw, so coincident connectors don't double up.
      const traverseEdges = new Set<string>();
      const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
      for (const f of traverseFeatures) {
        const refs = String(f.properties.trvPointRefs ?? '')
          .split(',')
          .filter((s) => s.length > 0);
        for (let i = 0; i < refs.length - 1; i++) traverseEdges.add(edgeKey(refs[i], refs[i + 1]));
        // Closed traverses also draw the implicit last→first edge.
        if (f.type === 'POLYGON' && refs.length > 2) traverseEdges.add(edgeKey(refs[refs.length - 1], refs[0]));
      }
      let rendered = 0;
      let deduped = 0;
      let missing = 0;
      const seen = new Set<string>();
      for (const c of connectors) {
        const key = edgeKey(c.fromId, c.toId);
        if (traverseEdges.has(key)) { deduped++; continue; }
        if (seen.has(key)) continue; // collapse duplicate 28,16 records
        seen.add(key);
        const a = featByTrvId.get(c.fromId);
        const b = featByTrvId.get(c.toId);
        const pa = a?.geometry.point;
        const pb = b?.geometry.point;
        if (!pa || !pb) { missing++; continue; }
        connectorFeatures.push({
          id: `trv-connector:${c.sourceLine}`,
          type: 'LINE',
          geometry: { type: 'LINE', start: { x: pa.x, y: pa.y }, end: { x: pb.x, y: pb.y } },
          layerId: drawingLayerId,
          style: defaultStyle(),
          properties: {
            trvDerived: true,
            trvElementKind: 'CONNECTOR',
            trvElementSourceLine: c.sourceLine,
            trvPointRefs: `${c.fromId},${c.toId}`,
          },
        });
        rendered++;
      }
      if (rendered > 0 || deduped > 0 || missing > 0) {
        const bits = [`Subtype-16 connectors: rendered ${rendered} line(s)`];
        if (deduped > 0) bits.push(`${deduped} already drawn by traverses (deduped)`);
        if (missing > 0) bits.push(`${missing} skipped (missing point ref)`);
        notes.push(bits.join('; '));
      }
    }
  }
  // cad-trv-drawing-element-rendering Slice 2 — render `28,30`
  // polylines + `28,4` line segments (coords carried inline in the
  // header, NOT via point refs) as geometry on the Drawing layer.
  // These are footprints / structures / reference lines TPC plotted
  // that we previously dropped. Element coords are (E,N) → Starr
  // {x:E,y:N}. Tagged `trvDerived` so the verbatim `28` block stays
  // the round-trip source of truth.
  const elementShapeFeatures: Feature[] = [];
  {
    const shapes = extractElementShapes(doc.drawingElements);
    let nPoly = 0;
    let nLine = 0;
    for (const s of shapes) {
      if (s.kind === 'LINE') {
        elementShapeFeatures.push({
          id: `trv-shape:${s.sourceLine}`,
          type: 'LINE',
          geometry: { type: 'LINE', start: { ...s.vertices[0] }, end: { ...s.vertices[1] } },
          layerId: drawingLayerId,
          style: defaultStyle(),
          properties: {
            trvDerived: true,
            trvElementKind: 'ELEMENT_LINE',
            trvElementSourceLine: s.sourceLine,
          },
        });
        nLine++;
      } else {
        const ftype: FeatureType = s.closed ? 'POLYGON' : 'POLYLINE';
        elementShapeFeatures.push({
          id: `trv-shape:${s.sourceLine}`,
          type: ftype,
          geometry: { type: ftype, vertices: s.vertices.map((v) => ({ x: v.x, y: v.y })) },
          layerId: drawingLayerId,
          style: defaultStyle(),
          properties: {
            trvDerived: true,
            trvElementKind: 'ELEMENT_POLYLINE',
            trvElementSourceLine: s.sourceLine,
            trvElementClosed: s.closed ? 1 : 0,
          },
        });
        nPoly++;
      }
    }
    if (nPoly > 0 || nLine > 0) {
      notes.push(`Rendered ${nPoly} polyline(s) + ${nLine} line(s) from drawing elements (subtypes 30 / 4)`);
    }
  }
  // cad-trv-drawing-element-rendering Slice 3 — render `28,5`
  // WORLD-placed text annotations (site descriptions like "conc." /
  // "asphalt parking", deed calls, etc.) as TEXT features at their
  // survey coordinates. Paper-space `28,5` (title block) is handled
  // in Slice 4. Coords are (E,N) → Starr {x:E,y:N}; the TPC point
  // size lands on `properties.fontSize` (what the renderer reads).
  const textFeatures: Feature[] = [];
  {
    let nText = 0;
    for (const t of extractTextElements(doc.drawingElements)) {
      if (t.space !== 'WORLD') continue;
      textFeatures.push({
        id: `trv-text:${t.sourceLine}`,
        type: 'TEXT',
        geometry: { type: 'TEXT', point: { x: t.x, y: t.y }, textContent: t.text },
        layerId: drawingLayerId,
        style: defaultStyle(),
        properties: {
          trvDerived: true,
          trvElementKind: 'ELEMENT_TEXT',
          trvElementSourceLine: t.sourceLine,
          fontSize: t.fontSize > 0 ? t.fontSize : 6,
        },
      });
      nText++;
    }
    if (nText > 0) notes.push(`Rendered ${nText} map text annotation(s) from drawing-element subtype 5`);
  }
  // cad-trv-dual-layer-filename Slice 2 — the surveyor wants two
  // INDEPENDENT layers that happen to start with the same points:
  // the Points layer holds just the points, the Drawing layer holds
  // points + lines + everything. Editing one layer must not affect
  // the other, so each Drawing-layer point is a deep clone of its
  // Points-layer twin with no shared references. The trvPointMirror
  // flag is purely a "don't double-export" marker for the TRV round-
  // trip — the canonical (Points-layer) point owns the TRV slot.
  const pointMirrors: Feature[] = pointFeatures.map((f) => ({
    ...f,
    id: `${f.id}:draw`,
    layerId: drawingLayerId,
    geometry: clonePointGeometry(f.geometry),
    style: { ...f.style },
    properties: { ...f.properties, trvPointMirror: true },
  }));
  return {
    layers,
    features: [...pointFeatures, ...pointMirrors, ...traverseFeatures, ...connectorFeatures, ...elementShapeFeatures, ...textFeatures],
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
