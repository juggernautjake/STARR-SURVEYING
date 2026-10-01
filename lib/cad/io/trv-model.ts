// lib/cad/io/trv-model.ts
//
// trv-full-support — one resolved, renderable picture of a parsed
// Traverse PC file. The parser (`trv-parser.ts`) keeps every record and
// its raw fields; this module answers "what does the drawing look
// like": which layers exist, where every point / line / TRUE ARC /
// closed shape / label / symbol sits in world coordinates, and how many
// of each there are.
//
// Two consumers share it so they can never disagree:
//   - the file viewer's TRV preview (app/admin/components/files/TrvPreview.tsx)
//   - the Forge importer (`trv-to-drawing.ts`), for true arcs, layers,
//     labels and symbols.
//
// World frame: x = Easting, y = Northing (Y-up). Point records store
// N,E (swapped here); drawing elements store E,N. See
// docs/cad/trv-format.md for every record this reads.
//
// Pure: no DOM, no React, no store, no heavy CAD imports (the viewer
// lazy-loads this).

import type { TrvDocument, TrvDrawingElement, TrvPoint, TrvTraverse, TrvTraverseRef } from './trv-parser';
import { cleanLabelText } from './trv-drawing-elements';
import { decodeTrvLineStyle } from './trv-line-style';
import {
  arcFromChordAndRadius, arcSegmentSignedArea, signedPolygonArea, emptyBounds, extendBounds,
  extendBoundsArc, boundsValid, type TrvArc, type XY, type Bounds,
} from './trv-geometry';

// ── Model types ─────────────────────────────────────────────────────────

export type TrvLayerRole = 'points' | 'lines' | 'labels' | 'symbols' | 'drawing' | 'construction';

export interface TrvModelLayer {
  /** Stable key entities reference (`points`, `lines`, `dl:<id>` …). */
  key: string;
  /** Friendly display name ("Lines", "Point Labels", a user layer's own name). */
  name: string;
  /** The layer's name inside the TRV (`TPCLines`), or null for synthetic layers. */
  sourceName: string | null;
  /** TRV drawing-layer id, or null for synthetic layers. */
  trvId: string | null;
  /** CSS colour, or null = default ink. */
  color: string | null;
  /** Visible by default. */
  visible: boolean;
  role: TrvLayerRole;
  /** Number of entities on this layer. */
  count: number;
}

/** TPC line-type code (`51` field 1 / `29,2` field 5): 1 = solid, -43 =
 *  fence wire; others (2, 6, 10, 12, 39, 40, 75, -19 …) are dashed /
 *  patterned types whose exact pattern is not confirmed. */
export type TrvStrokeKind = 'solid' | 'dashed' | 'fence';

export function strokeKindForCode(code: number | null | undefined): TrvStrokeKind {
  if (code === null || code === undefined || code === 1 || code === 0) return 'solid';
  if (code === -43) return 'fence';
  return 'dashed';
}

interface EntityBase {
  layerKey: string;
  /** Hidden in Traverse PC's plot (construction copies, etc.). */
  hidden: boolean;
  /** Source line of the record that produced the entity. */
  sourceLine: number;
}

export interface TrvModelPoint extends EntityBase {
  kind: 'point';
  /** Point id as written in the file. */
  id: string;
  x: number;
  y: number;
  z: number | null;
  description: string | null;
  /** TPC symbol number from a `28,11` placement on this point. */
  symbolId: string | null;
  methodCode: string | null;
}

export type TrvPathSegment =
  | { kind: 'line'; from: XY; to: XY; fromId: string; toId: string; drawn: boolean }
  | { kind: 'arc'; arc: TrvArc; signedRadius: number; fromId: string; toId: string; drawn: boolean };

export interface TrvModelPath extends EntityBase {
  kind: 'path';
  /** Traverse name (`30`). */
  name: string | null;
  /** TPC traverse id (`31` field 1). */
  trvId: string | null;
  /** Ordered resolved vertices (closing duplicate dropped when closed). */
  vertices: XY[];
  pointIds: string[];
  /** One entry per consecutive vertex pair (+ the closing edge when closed). */
  segments: TrvPathSegment[];
  closed: boolean;
  /** TPC's own area (`33`) when present, else the arc-corrected area of a closed path. */
  area: number | null;
  /** Arc-corrected area computed from the geometry (closed paths only). */
  computedArea: number | null;
  stroke: TrvStrokeKind;
  bold: boolean;
  /** TPC fill name when the traverse is filled (`71`), else null. */
  fill: string | null;
  construction: boolean;
}

export interface TrvModelLine extends EntityBase {
  kind: 'line';
  from: XY;
  to: XY;
  source: 'element' | 'connector';
  stroke: TrvStrokeKind;
  /** `29,2` element sequence number (labels can reference it as `@n`). */
  seq: string | null;
}

export interface TrvModelArc extends EntityBase {
  kind: 'arc';
  arc: TrvArc;
  signedRadius: number;
  source: 'element' | 'lines';
  stroke: TrvStrokeKind;
  seq: string | null;
}

export interface TrvModelPolyline extends EntityBase {
  kind: 'polyline';
  vertices: XY[];
  closed: boolean;
  source: 'element' | 'leader';
  stroke: TrvStrokeKind;
  seq: string | null;
}

export type TrvTextRole = 'note' | 'pointLabel' | 'segmentLabel' | 'areaLabel';

export interface TrvModelText extends EntityBase {
  kind: 'text';
  x: number;
  y: number;
  text: string;
  /** Size in points on the plot. */
  sizePt: number;
  /** World height of one line (sizePt at the sheet scale). */
  height: number;
  /** Degrees, counter-clockwise from +x. */
  rotationDeg: number;
  hAlign: 'start' | 'middle';
  vAlign: 'baseline' | 'middle';
  role: TrvTextRole;
  /** The point / traverse / pair the label belongs to, when known. */
  ref: string | null;
}

export interface TrvModelSymbol extends EntityBase {
  kind: 'symbol';
  x: number;
  y: number;
  symbolId: string;
  pointId: string | null;
  rotationDeg: number;
}

export type TrvModelEntity =
  | TrvModelPoint | TrvModelPath | TrvModelLine | TrvModelArc | TrvModelPolyline | TrvModelText | TrvModelSymbol;

export interface TrvModelSummary {
  points: number;
  /** Straight drawn segments (traverse edges, element lines, connectors). */
  lines: number;
  /** True arcs (traverse curves, element arcs, standalone curves). */
  curves: number;
  /** Closed figures (closed traverses + closed element polylines). */
  shapes: number;
  /** Open traverses + open element polylines + leaders. */
  polylines: number;
  texts: number;
  labels: number;
  symbols: number;
  /** Layers that hold at least one entity. */
  layers: number;
  /** Survey (point) layers from the `86` table. */
  surveyLayers: number;
  /** Paper-space (title-block / sheet) items not drawn in world space. */
  paperItems: number;
  /** Lines whose record code this parser does not know. */
  unknownRecordLines: number;
}

export interface TrvModel {
  layers: TrvModelLayer[];
  entities: TrvModelEntity[];
  /** Bounds of everything drawn (hidden entities excluded). */
  bounds: Bounds | null;
  /** Bounds to fit the view to: linework when there is any, else the
   *  points with far outliers (e.g. a distant base station) trimmed. */
  fitBounds: Bounds | null;
  /** Plot scale, feet per paper inch (sheet `28,0`, else 40). */
  scale: number;
  summary: TrvModelSummary;
  notes: string[];
}

export interface BuildTrvModelOptions {
  /** Override the plot scale used to size text (feet per inch). */
  scale?: number;
  /** Which sheet's drawing elements to use (index into `doc.sheets`).
   *  Defaults to the primary sheet. */
  sheetIndex?: number;
}

/** The drawing elements of one sheet. Elements before any `28,0` (none
 *  in real files) are kept with every sheet. */
export function sheetElements(doc: TrvDocument, sheetIndex: number = doc.primarySheetIndex ?? -1): TrvDrawingElement[] {
  if ((doc.sheets ?? []).length <= 1 || sheetIndex < 0) return doc.drawingElements;
  return doc.drawingElements.filter((e) => e.sheetIndex === undefined || e.sheetIndex === sheetIndex);
}

// ── Helpers ─────────────────────────────────────────────────────────────

const DEFAULT_SCALE = 40;

const FRIENDLY_LAYER_NAMES: Record<string, string> = {
  '0': 'Drawing',
  TPCLines: 'Lines',
  TPCPointLabels: 'Point Labels',
  TPCSymbols: 'Symbols',
  TPCLineLabels: 'Line Labels',
  TPCLotLabels: 'Lot Labels',
  TPCLotAreas: 'Lot Areas',
  TPCFills: 'Fills',
  TPCLotSetbackLines: 'Setback Lines',
  TPCContourMinor: 'Contours (minor)',
  TPCContourMajor: 'Contours (major)',
};

export function friendlyLayerName(sourceName: string): string {
  return FRIENDLY_LAYER_NAMES[sourceName] ?? sourceName;
}

/** TPC construction / duplicate traverses it does not plot. Mirrors
 *  `isConstructionTraverse` in trv-to-drawing.ts. */
export function isConstructionTraverseName(name: string | null): boolean {
  if (!name) return false;
  const n = name.trim();
  return /^(copy|dup)-/i.test(n)
    || /^(right|left)\s+[\d.]+\s*f(?:ee|oo)?t-/i.test(n)
    || /\boffsets?$/i.test(n);
}

/** A traverse that is really a CSV point list (TPC shows symbols only). */
export function isPointListTraverseName(name: string | null): boolean {
  return !!name && /\.csv\b/i.test(name);
}

function isPlaceholder(p: TrvPoint): boolean {
  return p.north === 0 && p.east === 0 && (p.elevation === 0 || p.elevation === null);
}

const num = (s: string | undefined): number | null => {
  if (s === undefined) return null;
  const t = s.trim();
  if (t === '') return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
};

/** The `29,2` style record of a drawing element, decoded:
 *  `29,2,<attr>,<layerId>,<?>,<weight>,<lineType>,<flags>,<space?>,<?>,<seq>,…`. */
export interface TrvElementStyle {
  layerId: string | null;
  weight: number | null;
  lineType: number | null;
  /** Non-zero for most paper-space (sheet) items. */
  spaceHint: number | null;
  seq: string | null;
}

export function elementStyle(el: TrvDrawingElement): TrvElementStyle | null {
  const p = el.properties.find((r) => r[0] === '2');
  if (!p) return null;
  const lt = num(p[5]);
  const sp = num(p[7]);
  return {
    layerId: (p[2] ?? '').trim() || null,
    weight: num(p[4]),
    lineType: lt === null ? null : Math.trunc(lt),
    spaceHint: sp === null ? null : Math.trunc(sp),
    seq: (p[9] ?? '').trim() || null,
  };
}

/** A `29,5` text run: `29,5,<dx>,<dy>,<?>,<?>,<sizePt>,<rot×10>,<align>,<text…>`. */
export interface TrvTextRun { dx: number; dy: number; sizePt: number; rotationDeg: number; align: number; text: string }

export function elementTextRun(el: TrvDrawingElement): TrvTextRun | null {
  const p = el.properties.find((r) => r[0] === '5');
  if (!p) return null;
  const text = cleanLabelText(p.slice(8).join(','));
  if (!text) return null;
  return {
    dx: num(p[1]) ?? 0,
    dy: num(p[2]) ?? 0,
    sizePt: num(p[5]) ?? 8,
    rotationDeg: (num(p[6]) ?? 0) / 10,
    align: Math.trunc(num(p[7]) ?? 0),
    text,
  };
}

/** Alignment flags (inferred): bit 2 = centred horizontally, bit 4 =
 *  centred vertically; otherwise the anchor is the text's start /
 *  baseline. */
function alignFromFlags(align: number): { hAlign: 'start' | 'middle'; vAlign: 'baseline' | 'middle' } {
  return {
    hAlign: (align & 2) !== 0 ? 'middle' : 'start',
    vAlign: (align & 4) !== 0 ? 'middle' : 'baseline',
  };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// ── Builder ─────────────────────────────────────────────────────────────

/** Resolve a parsed TRV into a renderable model. Pure + deterministic. */
export function buildTrvModel(doc: TrvDocument, opts: BuildTrvModelOptions = {}): TrvModel {
  const notes: string[] = [];
  const sheetIndex = opts.sheetIndex ?? doc.primarySheetIndex ?? -1;
  const sheet = sheetIndex >= 0 ? (doc.sheets ?? [])[sheetIndex] ?? null : null;
  const elements = sheetElements(doc, sheetIndex);
  const scale = opts.scale ?? (sheet?.scale && sheet.scale > 0 ? sheet.scale : DEFAULT_SCALE);
  const ptToWorld = (pt: number) => (pt / 72) * scale;

  // ── Layers ──
  const layers = new Map<string, TrvModelLayer>();
  const addLayer = (l: Omit<TrvModelLayer, 'count'>): TrvModelLayer => {
    const existing = layers.get(l.key);
    if (existing) return existing;
    const made = { ...l, count: 0 };
    layers.set(l.key, made);
    return made;
  };
  const drawingLayerIds = new Set<string>();
  for (const dl of sheet?.layers ?? []) {
    drawingLayerIds.add(dl.id);
    addLayer({
      key: `dl:${dl.id}`,
      name: friendlyLayerName(dl.name),
      sourceName: dl.name,
      trvId: dl.id,
      color: dl.color,
      visible: dl.visible,
      role: dl.name === 'TPCPointLabels' || dl.name === 'TPCLineLabels' || dl.name === 'TPCLotLabels' || dl.name === 'TPCLotAreas'
        ? 'labels'
        : dl.name === 'TPCSymbols' ? 'symbols' : dl.name === 'TPCLines' ? 'lines' : 'drawing',
    });
  }
  const synthetic: Record<string, Omit<TrvModelLayer, 'count'>> = {
    points: { key: 'points', name: 'Points', sourceName: null, trvId: null, color: null, visible: true, role: 'points' },
    lines: { key: 'lines', name: 'Lines', sourceName: null, trvId: null, color: null, visible: true, role: 'lines' },
    labels: { key: 'labels', name: 'Labels', sourceName: null, trvId: null, color: null, visible: true, role: 'labels' },
    symbols: { key: 'symbols', name: 'Symbols', sourceName: null, trvId: null, color: null, visible: true, role: 'symbols' },
    drawing: { key: 'drawing', name: 'Drawing', sourceName: null, trvId: null, color: null, visible: true, role: 'drawing' },
    construction: { key: 'construction', name: 'Construction (not plotted)', sourceName: null, trvId: null, color: null, visible: false, role: 'construction' },
  };
  /** Layer key for a TRV drawing-layer id, falling back to a synthetic layer. */
  const layerFor = (trvLayerId: string | null | undefined, fallback: keyof typeof synthetic): string => {
    if (trvLayerId && drawingLayerIds.has(trvLayerId)) return `dl:${trvLayerId}`;
    addLayer(synthetic[fallback]);
    return fallback;
  };
  addLayer(synthetic.points);

  const entities: TrvModelEntity[] = [];
  const push = (e: TrvModelEntity) => {
    entities.push(e);
    const l = layers.get(e.layerKey);
    if (l) l.count += 1;
  };

  // ── Points ── (first usable occurrence of an id wins, like the importer)
  const pointById = new Map<string, TrvPoint>();
  let placeholders = 0;
  for (const p of doc.points) {
    if (p.north === null || p.east === null) continue;
    if (isPlaceholder(p)) { placeholders++; continue; }
    if (!pointById.has(p.id)) pointById.set(p.id, p);
  }
  if (placeholders > 0) notes.push(`${placeholders} placeholder point(s) (0,0,0) skipped`);
  const xyOf = (id: string): XY | null => {
    const p = pointById.get(id);
    return p && p.east !== null && p.north !== null ? { x: p.east, y: p.north } : null;
  };

  // Symbols placed on points (28,11) — attached to the point AND drawn.
  const symbolByPoint = new Map<string, string>();
  for (const el of elements) {
    if (el.header[0] !== '11') continue;
    const sym = (el.header[1] ?? '').trim();
    const pid = (el.header[2] ?? '').trim();
    if (sym && pid && !symbolByPoint.has(pid)) symbolByPoint.set(pid, sym);
  }

  for (const p of pointById.values()) {
    push({
      kind: 'point',
      id: p.id,
      x: p.east as number,
      y: p.north as number,
      z: p.elevation,
      description: p.description,
      symbolId: symbolByPoint.get(p.id) ?? null,
      methodCode: p.methodCode,
      layerKey: 'points',
      hidden: false,
      sourceLine: p.sourceLine,
    });
  }

  // Survey-extent box used to tell world drawing elements from paper ones.
  const xs = [...pointById.values()].map((p) => p.east as number).sort((a, b) => a - b);
  const ys = [...pointById.values()].map((p) => p.north as number).sort((a, b) => a - b);
  let surveyBox: Bounds | null = null;
  if (xs.length > 0) {
    const x0 = quantile(xs, 0.02), x1 = quantile(xs, 0.98), y0 = quantile(ys, 0.02), y1 = quantile(ys, 0.98);
    const pad = Math.max(x1 - x0, y1 - y0, 200) * 2;
    surveyBox = { minX: x0 - pad, minY: y0 - pad, maxX: x1 + pad, maxY: y1 + pad };
  }
  // A survey that itself sits near the origin can overlap paper inches.
  const surveyNearOrigin = xs.length > 0
    && Math.abs(quantile(xs, 0.5)) < 1000 && Math.abs(quantile(ys, 0.5)) < 1000;
  /** World (survey) vs paper (sheet inches) placement of an element.
   *  Paper coordinates are small (a sheet is under ~60" across); world
   *  coordinates sit within the survey's extents. When the two could
   *  overlap (a survey near 0,0) only an explicit model-space style
   *  (`29,2` field 7 = 0) makes a small coordinate world. */
  const isWorld = (x: number, y: number, style: TrvElementStyle | null): boolean => {
    const paperSized = Math.abs(x) < 60 && Math.abs(y) < 60;
    if (paperSized) return surveyNearOrigin && style?.spaceHint === 0;
    if (surveyBox) {
      if (x >= surveyBox.minX && x <= surveyBox.maxX && y >= surveyBox.minY && y <= surveyBox.maxY) return true;
      return (style?.spaceHint ?? 0) === 0;
    }
    return true;
  };
  let paperItems = 0;

  // ── #,LINES curves, keyed by "from>to" ──
  const curveByPair = new Map<string, { radius: number; sourceLine: number }>();
  for (const le of (doc.lineEntities ?? [])) {
    if (le.radius === null || le.radius === 0) continue;
    const k = `${le.fromId}>${le.toId}`;
    if (!curveByPair.has(k)) curveByPair.set(k, { radius: le.radius, sourceLine: le.sourceLine });
  }
  const usedCurvePairs = new Set<string>();
  /** Signed radius for travelling a→b, if a curve joins them. */
  const curveFor = (a: string, b: string): number | null => {
    const fw = curveByPair.get(`${a}>${b}`);
    if (fw) { usedCurvePairs.add(`${a}>${b}`); return fw.radius; }
    const bw = curveByPair.get(`${b}>${a}`);
    if (bw) { usedCurvePairs.add(`${b}>${a}`); return -bw.radius; }
    return null;
  };

  // ── Traverses → paths ──
  const pathByTrvId = new Map<string, TrvModelPath>();
  /** Arc keyed by unordered point pair, for placing segment labels. */
  const arcByPair = new Map<string, TrvArc>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  let skippedLists = 0;
  for (const t of doc.traverses) {
    if (isPointListTraverseName(t.name)) { skippedLists++; continue; }
    const path = buildPath(t, xyOf, curveFor, notes);
    if (!path) continue;
    const construction = isConstructionTraverseName(t.name);
    const firstLayer = (t.refs ?? []).find((r) => r.drawingLayerId !== null)?.drawingLayerId ?? null;
    path.layerKey = construction ? (addLayer(synthetic.construction), 'construction') : layerFor(firstLayer, 'lines');
    path.hidden = construction;
    path.construction = construction;
    push(path);
    if (path.trvId && !pathByTrvId.has(path.trvId)) pathByTrvId.set(path.trvId, path);
    if (!construction) {
      for (const s of path.segments) if (s.kind === 'arc') arcByPair.set(pairKey(s.fromId, s.toId), s.arc);
    }
  }
  if (skippedLists > 0) notes.push(`${skippedLists} CSV point-list traverse(s) shown as points only`);

  // Standalone #,LINES curves no traverse used.
  for (const le of (doc.lineEntities ?? [])) {
    const k = `${le.fromId}>${le.toId}`;
    if (usedCurvePairs.has(k) || le.radius === null) continue;
    usedCurvePairs.add(k);
    const a = xyOf(le.fromId);
    const b = xyOf(le.toId);
    if (!a || !b) continue;
    const arc = arcFromChordAndRadius(a, b, le.radius);
    if (!arc) { notes.push(`Curve ${le.fromId}→${le.toId}: radius ${le.radius} too small for its chord; skipped`); continue; }
    push({ kind: 'arc', arc, signedRadius: le.radius, source: 'lines', stroke: 'solid', seq: null, layerKey: layerFor(null, 'lines'), hidden: false, sourceLine: le.sourceLine });
    arcByPair.set(pairKey(le.fromId, le.toId), arc);
  }

  // ── Drawing elements ──
  const elementMidBySeq = new Map<string, XY>();
  const pendingLabels: TrvDrawingElement[] = [];
  for (const el of elements) {
    const sub = el.header[0];
    const style = elementStyle(el);
    const stroke = strokeKindForCode(style?.lineType);
    const seq = style?.seq ?? null;
    const h = el.header;
    if (sub === '4') {
      const v = h.slice(1, 5).map((s) => num(s));
      if (v.some((n) => n === null)) continue;
      const [x1, y1, x2, y2] = v as number[];
      if (!isWorld(x1, y1, style)) { paperItems++; continue; }
      if (Math.hypot(x2 - x1, y2 - y1) < 1e-9) continue;
      push({ kind: 'line', from: { x: x1, y: y1 }, to: { x: x2, y: y2 }, source: 'element', stroke, seq, layerKey: layerFor(style?.layerId, 'drawing'), hidden: false, sourceLine: el.sourceLine });
      if (seq) elementMidBySeq.set(seq, { x: (x1 + x2) / 2, y: (y1 + y2) / 2 });
    } else if (sub === '8') {
      const v = h.slice(1, 6).map((s) => num(s));
      if (v.some((n) => n === null)) continue;
      const [x1, y1, x2, y2, r] = v as number[];
      if (!isWorld(x1, y1, style)) { paperItems++; continue; }
      const arc = arcFromChordAndRadius({ x: x1, y: y1 }, { x: x2, y: y2 }, r);
      if (!arc) { notes.push(`Arc element on line ${el.sourceLine + 1}: radius too small for its chord; skipped`); continue; }
      push({ kind: 'arc', arc, signedRadius: r, source: 'element', stroke, seq, layerKey: layerFor(style?.layerId, 'drawing'), hidden: false, sourceLine: el.sourceLine });
      if (seq) elementMidBySeq.set(seq, arc.mid);
    } else if (sub === '30' || sub === '27') {
      // 28,30,<n>,E1,N1,… polyline · 28,27,<n>,E1,N1,…,<arrowSize>,… leader
      const n = Math.trunc(num(h[1]) ?? 0);
      if (n < 2) continue;
      const verts: XY[] = [];
      for (let i = 0; i < n; i++) {
        const x = num(h[2 + i * 2]);
        const y = num(h[3 + i * 2]);
        if (x === null || y === null) break;
        const last = verts[verts.length - 1];
        if (last && Math.abs(last.x - x) < 1e-9 && Math.abs(last.y - y) < 1e-9) continue;
        verts.push({ x, y });
      }
      if (verts.length < 2) continue;
      if (!isWorld(verts[0].x, verts[0].y, style)) { paperItems++; continue; }
      let closed = false;
      if (sub === '30' && verts.length > 2) {
        const f = verts[0], l = verts[verts.length - 1];
        if (Math.abs(f.x - l.x) < 1e-4 && Math.abs(f.y - l.y) < 1e-4) { closed = true; verts.pop(); }
      }
      push({ kind: 'polyline', vertices: verts, closed, source: sub === '27' ? 'leader' : 'element', stroke, seq, layerKey: layerFor(style?.layerId, 'drawing'), hidden: false, sourceLine: el.sourceLine });
      if (seq) elementMidBySeq.set(seq, verts[Math.floor(verts.length / 2)]);
    } else if (sub === '16') {
      const a = (h[1] ?? '').trim();
      const b = (h[2] ?? '').trim();
      const pa = xyOf(a);
      const pb = xyOf(b);
      if (!pa || !pb || a === b) continue;
      push({ kind: 'line', from: pa, to: pb, source: 'connector', stroke, seq, layerKey: layerFor(style?.layerId, 'lines'), hidden: false, sourceLine: el.sourceLine });
    } else if (sub === '5') {
      const x = num(h[1]);
      const y = num(h[2]);
      if (x === null || y === null) continue;
      if (!isWorld(x, y, style)) { paperItems++; continue; }
      const text = cleanLabelText(h.slice(8).join(','));
      if (!text) continue;
      const sizePt = num(h[5]) ?? 8;
      push({
        kind: 'text', x, y, text, sizePt: sizePt > 0 ? sizePt : 8, height: ptToWorld(sizePt > 0 ? sizePt : 8),
        rotationDeg: (num(h[6]) ?? 0) / 10, ...alignFromFlags(Math.trunc(num(h[7]) ?? 0)),
        role: 'note', ref: null, layerKey: layerFor(style?.layerId, 'drawing'), hidden: false, sourceLine: el.sourceLine,
      });
    } else if (sub === '11') {
      const loc = el.properties.find((p) => p[0] === '3');
      const x = num(loc?.[1]);
      const y = num(loc?.[2]);
      const symProps = el.properties.find((p) => p[0] === '32');
      const pid = (h[2] ?? '').trim() || null;
      const at = x !== null && y !== null ? { x, y } : pid ? xyOf(pid) : null;
      if (!at) continue;
      push({
        kind: 'symbol', x: at.x, y: at.y, symbolId: (h[1] ?? '').trim(), pointId: pid,
        rotationDeg: num(symProps?.[3]) ?? 0, layerKey: layerFor(style?.layerId, 'symbols'), hidden: false, sourceLine: el.sourceLine,
      });
    } else if (sub === '12' || sub === '14' || sub === '15') {
      pendingLabels.push(el);
    } else if (sub === '6' || sub === '7' || sub === '10' || sub === '20' || sub === '24' || sub === '31'
      || sub === '32' || sub === '33' || sub === '34' || sub === '45' || sub === '46' || sub === '66') {
      // Sheet furniture: borders, boxes, block definitions / inserts,
      // title-block text, line tables, images, legends. Paper space.
      paperItems++;
    }
  }

  // Labels last: they need points, paths and element midpoints.
  for (const el of pendingLabels) {
    const sub = el.header[0];
    const style = elementStyle(el);
    const run = elementTextRun(el);
    if (!run) continue;
    let anchor: XY | null = null;
    let ref: string | null = null;
    let role: TrvTextRole = 'note';
    if (sub === '12') {
      ref = (el.header[1] ?? '').trim();
      anchor = xyOf(ref);
      role = 'pointLabel';
    } else if (sub === '15') {
      const a = (el.header[1] ?? '').trim();
      const b = (el.header[2] ?? '').trim();
      role = 'segmentLabel';
      if (a.startsWith('@')) {
        ref = a;
        anchor = elementMidBySeq.get(a.slice(1)) ?? null;
      } else {
        ref = `${a}|${b}`;
        const arc = arcByPair.get(pairKey(a, b));
        const pa = xyOf(a);
        const pb = xyOf(b);
        anchor = arc ? arc.mid : pa && pb ? { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 } : null;
      }
    } else {
      ref = (el.header[1] ?? '').trim();
      role = 'areaLabel';
      const path = pathByTrvId.get(ref);
      if (path) anchor = centroid(path.vertices);
    }
    if (!anchor) continue;
    // Offsets are paper inches → world feet at the sheet scale.
    const a = alignFromFlags(run.align);
    push({
      kind: 'text',
      x: anchor.x + run.dx * scale,
      y: anchor.y + run.dy * scale,
      // Some TPC versions drop the break between the square feet and the
      // acreage ("347347 SqFt7.974 Acres").
      text: role === 'areaLabel' ? run.text.replace(/(SqFt|Sq\.?\s*Ft\.?)(?=\d)/i, '$1\n') : run.text,
      sizePt: run.sizePt,
      height: ptToWorld(run.sizePt),
      rotationDeg: run.rotationDeg,
      hAlign: role === 'pointLabel' ? a.hAlign : 'middle',
      vAlign: role === 'pointLabel' ? a.vAlign : 'middle',
      role,
      ref,
      layerKey: layerFor(style?.layerId, 'labels'),
      hidden: false,
      sourceLine: el.sourceLine,
    });
  }

  // ── Bounds ──
  const all = emptyBounds();
  for (const e of entities) if (!e.hidden) extendEntity(all, e);
  const fitBounds = robustBounds(entities);

  // ── Summary ──
  const summary: TrvModelSummary = {
    points: 0, lines: 0, curves: 0, shapes: 0, polylines: 0, texts: 0, labels: 0, symbols: 0,
    layers: 0, surveyLayers: doc.layers.length, paperItems,
    unknownRecordLines: (doc.unknownRecords ?? []).reduce((s, u) => s + u.count, 0),
  };
  // Counts describe what Traverse PC plots: hidden construction copies
  // are left out (they are still listed under their own layer).
  for (const e of entities) {
    if (e.hidden) continue;
    switch (e.kind) {
      case 'point': summary.points++; break;
      case 'line': summary.lines++; break;
      case 'arc': summary.curves++; break;
      case 'polyline':
        if (e.closed) summary.shapes++; else summary.polylines++;
        break;
      case 'path':
        if (e.closed) summary.shapes++; else summary.polylines++;
        for (const s of e.segments) {
          if (!s.drawn) continue;
          if (s.kind === 'arc') summary.curves++; else summary.lines++;
        }
        break;
      case 'text': if (e.role === 'note') summary.texts++; else summary.labels++; break;
      case 'symbol': summary.symbols++; break;
    }
  }
  const usedLayers = [...layers.values()].filter((l) => l.count > 0);
  summary.layers = usedLayers.length;
  if ((doc.unknownRecords ?? []).length > 0) {
    notes.push(`Unrecognised record code(s) preserved: ${(doc.unknownRecords ?? []).map((u) => `${u.code}×${u.count}`).join(', ')}`);
  }

  return {
    layers: usedLayers,
    entities,
    bounds: boundsValid(all) ? all : null,
    fitBounds,
    scale,
    summary,
    notes,
  };
}

/** Build one traverse path: resolve refs, close it, and make each edge a
 *  line or a TRUE arc (from `#,LINES`). Pen-up refs make undrawn edges. */
function buildPath(
  t: TrvTraverse,
  xyOf: (id: string) => XY | null,
  curveFor: (a: string, b: string) => number | null,
  notes: string[],
): TrvModelPath | null {
  const refs: Array<Pick<TrvTraverseRef, 'pointId' | 'penUp'>> = t.refs && t.refs.length === t.pointIds.length
    ? t.refs
    : t.pointIds.map((id) => ({ pointId: id, penUp: false }));
  const resolved: Array<{ id: string; xy: XY; penUp: boolean }> = [];
  for (const r of refs) {
    const xy = xyOf(r.pointId);
    if (!xy) continue;
    resolved.push({ id: r.pointId, xy, penUp: r.penUp });
  }
  if (resolved.length < 2) return null;
  const first = resolved[0];
  const last = resolved[resolved.length - 1];
  const sameId = resolved.length >= 3 && first.id === last.id;
  const sameCoord = resolved.length >= 4 && Math.abs(first.xy.x - last.xy.x) < 1e-4 && Math.abs(first.xy.y - last.xy.y) < 1e-4;
  const closed = sameId || sameCoord;
  // For a closed path the duplicate closing ref still DESCRIBES the
  // closing edge (its pen state + curve), so keep it for the edge walk.
  const verts = closed ? resolved.slice(0, -1) : resolved;
  const segments: TrvPathSegment[] = [];
  const edgeCount = closed ? verts.length : verts.length - 1;
  for (let i = 0; i < edgeCount; i++) {
    const a = resolved[i];
    const b = resolved[i + 1];
    const drawn = !b.penUp;
    const r = curveFor(a.id, b.id);
    if (r !== null) {
      const arc = arcFromChordAndRadius(a.xy, b.xy, r);
      if (arc) {
        segments.push({ kind: 'arc', arc, signedRadius: r, fromId: a.id, toId: b.id, drawn });
        continue;
      }
      notes.push(`Traverse "${t.name ?? 'unnamed'}": curve ${a.id}→${b.id} radius ${r} is too small for its chord; drawn straight`);
    }
    segments.push({ kind: 'line', from: a.xy, to: b.xy, fromId: a.id, toId: b.id, drawn });
  }
  let computedArea: number | null = null;
  if (closed && verts.length >= 3) {
    let a = signedPolygonArea(verts.map((v) => v.xy));
    for (const s of segments) if (s.kind === 'arc') a += arcSegmentSignedArea(s.arc);
    computedArea = Math.abs(a);
  }
  const style = decodeTrvLineStyle(t.stylingRecords);
  return {
    kind: 'path',
    name: t.name,
    trvId: t.trvId ?? null,
    vertices: verts.map((v) => v.xy),
    pointIds: verts.map((v) => v.id),
    segments,
    closed,
    area: t.area ?? computedArea,
    computedArea,
    stroke: style.lineTypeId === 'FENCE_BARBED_WIRE' ? 'fence' : strokeKindForCode(lineTypeCode(t)),
    bold: style.isBold,
    fill: style.fillPattern !== 'NONE' ? style.tpcFillName ?? 'fill' : null,
    construction: false,
    layerKey: 'lines',
    hidden: false,
    sourceLine: t.sourceLine,
  };
}

function lineTypeCode(t: TrvTraverse): number | null {
  const r51 = t.stylingRecords.find((r) => r.code === '51');
  if (!r51) return null;
  const n = parseInt(r51.fields[1] ?? '', 10);
  return Number.isFinite(n) ? n : null;
}

function centroid(vs: ReadonlyArray<XY>): XY | null {
  if (vs.length === 0) return null;
  // Area-weighted centroid; vertex average when degenerate.
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < vs.length; i++) {
    const p = vs[i];
    const q = vs[(i + 1) % vs.length];
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-9) {
    return { x: vs.reduce((s, v) => s + v.x, 0) / vs.length, y: vs.reduce((s, v) => s + v.y, 0) / vs.length };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** Bounds to fit the view to. A survey file often carries a far-away
 *  shot (a base station, a control monument miles off) and a traverse
 *  or connector that runs to it; fitting to the strict extents would
 *  shrink the drawing to a speck. So: take the 2nd-98th percentile box
 *  of every drawn vertex, widen it by half its size, and keep the true
 *  extents of everything inside that window. */
function robustBounds(entities: ReadonlyArray<TrvModelEntity>): Bounds | null {
  const vx: number[] = [];
  const vy: number[] = [];
  const add = (p: XY) => { vx.push(p.x); vy.push(p.y); };
  for (const e of entities) {
    if (e.hidden || e.kind === 'text') continue;
    if (e.kind === 'point' || e.kind === 'symbol') add(e);
    else if (e.kind === 'line') { add(e.from); add(e.to); }
    else if (e.kind === 'arc') { add(e.arc.start); add(e.arc.end); add(e.arc.mid); }
    else for (const v of e.vertices) add(v);
  }
  if (vx.length === 0) return null;
  const sx = [...vx].sort((a, b) => a - b);
  const sy = [...vy].sort((a, b) => a - b);
  const x0 = quantile(sx, 0.02), x1 = quantile(sx, 0.98), y0 = quantile(sy, 0.02), y1 = quantile(sy, 0.98);
  const padX = Math.max((x1 - x0) * 0.5, 50);
  const padY = Math.max((y1 - y0) * 0.5, 50);
  const b = emptyBounds();
  for (let i = 0; i < vx.length; i++) {
    if (vx[i] >= x0 - padX && vx[i] <= x1 + padX && vy[i] >= y0 - padY && vy[i] <= y1 + padY) extendBounds(b, { x: vx[i], y: vy[i] });
  }
  return boundsValid(b) ? b : null;
}

function extendEntity(b: Bounds, e: TrvModelEntity): void {
  switch (e.kind) {
    case 'point': case 'text': case 'symbol': extendBounds(b, e); break;
    case 'line': extendBounds(b, e.from); extendBounds(b, e.to); break;
    case 'arc': extendBoundsArc(b, e.arc); break;
    case 'polyline': for (const v of e.vertices) extendBounds(b, v); break;
    case 'path':
      for (const v of e.vertices) extendBounds(b, v);
      for (const s of e.segments) if (s.kind === 'arc') extendBoundsArc(b, s.arc);
      break;
  }
}
