// lib/cad/delivery/dxf-writer.ts
//
// AutoCAD R12 (AC1009) ASCII DXF writer. R12 is the most universally
// importable DXF flavor — it needs no handles, CLASSES, OBJECTS, or
// BLOCK_RECORD/APPID symbol tables, which is exactly what older survey
// packages (e.g. Traverse PC) expect. Newer apps (Civil 3D, QGIS) read
// it fine too. Trade-off: no true color or lineweight (ACI color only).
//
// Walks `DrawingDocument.features` + `DrawingDocument.layers`
// and emits a self-contained DXF string the surveyor can hand
// to AutoCAD / Civil 3D / Land F/X / QGIS / FME.
//
// Coverage in this slice (entity mapping):
//   POINT          → POINT
//   LINE           → LINE
//   POLYLINE       → LWPOLYLINE (open)
//   POLYGON        → LWPOLYLINE (closed, flag 1) — except when
//                    `geometry.circle` is set, which emits a CIRCLE
//                    (mirrors how the renderer handles
//                    "circular polygon" features).
//   CIRCLE         → CIRCLE
//   ARC            → ARC
//   SPLINE         → LWPOLYLINE (sampled along the bezier);
//                    real SPLINE entity wiring lands in a
//                    follow-up slice once the ctrl-pt sampler
//                    matches AutoCAD's NURBS expectations.
//   ELLIPSE        → ELLIPSE
//   MIXED_GEOMETRY → expanded into per-vertex LINE entities
//   TEXT / IMAGE   → skipped this slice (text + INSERT entities
//                    come with the §10.3 annotation export
//                    slice).
//
// Layer table is emitted from `doc.layers`; each layer carries
// a name, ACI 7 (white/black default) and the true-color RGB
// pulled from `layer.color`.
//
// Pure: no I/O, no DOM. Returns a single `\r\n`-terminated DXF
// string the caller can stream as a file download or write to
// disk in a server export route.

import type {
  ArcGeometry,
  CircleGeometry,
  DrawingDocument,
  EllipseGeometry,
  Feature,
  FeatureGeometry,
  Layer,
  Point2D,
  SplineGeometry,
  TextLabel,
} from '../types';
import type { AnnotationBase } from '../labels/annotation-types';
import type { LineTypeDefinition, SymbolDefinition } from '../styles/types';
import { findSymbol } from '../styles/symbol-library';
import { findLineType } from '../styles/linetype-library';
import { collectDerivedPoints } from '../points/derived-points';

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

export interface DxfExportOptions {
  /** Sample density for SPLINE → LWPOLYLINE conversion.
   *  Higher = finer approximation. Default 32 segments per
   *  bezier curve. */
  splineSamples?: number;
  /** When true, hidden features still emit. Default false —
   *  hidden geometry mirrors the on-screen render. */
  includeHidden?: boolean;
  /** Annotations to emit as TEXT entities. Pass the live
   *  `useAnnotationStore.annotations` map. When omitted, no
   *  annotations are written (the entity-core slice's
   *  behaviour). */
  annotations?: Record<string, AnnotationBase>;
}

export function exportToDxf(
  doc: DrawingDocument,
  options: DxfExportOptions = {}
): string {
  const splineSamples = Math.max(2, options.splineSamples ?? 32);
  const includeHidden = !!options.includeHidden;
  const annotations = options.annotations
    ? Object.values(options.annotations).filter(
        (a) => includeHidden || a.visible !== false
      )
    : [];

  const features = Object.values(doc.features).filter((f) =>
    includeHidden ? true : !f.hidden
  );
  const layers = Object.values(doc.layers);
  const usedSymbols = collectUsedSymbols(features, doc);
  const usedLineTypes = collectUsedLineTypes(features, layers, doc);
  const usedStyles = collectUsedTextStyles(features, annotations);
  const extents = computeExtents(features);

  const blockNames = Array.from(usedSymbols.values()).map((b) => b.blockName);

  const lines: string[] = [];
  emitHeader(lines, extents);
  emitTables(lines, layers, usedLineTypes, usedStyles, blockNames);
  emitBlocks(lines, usedSymbols);
  emitEntities(lines, features, doc, splineSamples, annotations);
  emitEof(lines);
  return lines.join('\r\n') + '\r\n';
}

/**
 * Trigger a browser download of the DXF for `doc`. Filename
 * derives from `doc.name` (kebab-cased) with a `.dxf` suffix.
 * Returns the byte size of the produced file so the caller
 * can surface a toast.
 *
 * Throws when invoked outside a browser environment (no
 * `document`); call `exportToDxf` directly from the server.
 */
export function downloadDxf(
  doc: DrawingDocument,
  options: DxfExportOptions = {}
): { byteSize: number; filename: string } {
  if (typeof globalThis.document === 'undefined') {
    throw new Error('downloadDxf can only run in the browser.');
  }
  const dxf = exportToDxf(doc, options);
  const filename = `${kebabCase(doc.name) || 'drawing'}.dxf`;
  const blob = new Blob([dxf], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(globalThis.document.createElement('a'), {
    href: url,
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(url);
  return { byteSize: blob.size, filename };
}

function kebabCase(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ────────────────────────────────────────────────────────────
// Sections
// ────────────────────────────────────────────────────────────

function emitHeader(
  lines: string[],
  extents: { min: Point2D; max: Point2D }
): void {
  push(lines, 0, 'SECTION');
  push(lines, 2, 'HEADER');

  pushVar(lines, '$ACADVER', 1, 'AC1009'); // R12 — most compatible, no handles/objects required
  pushVar(lines, '$INSBASE', 10, 0);
  push(lines, 20, 0);
  push(lines, 30, 0);
  pushVar(lines, '$EXTMIN', 10, extents.min.x);
  push(lines, 20, extents.min.y);
  push(lines, 30, 0);
  pushVar(lines, '$EXTMAX', 10, extents.max.x);
  push(lines, 20, extents.max.y);
  push(lines, 30, 0);
  pushVar(lines, '$LIMMIN', 10, extents.min.x);
  push(lines, 20, extents.min.y);
  pushVar(lines, '$LIMMAX', 10, extents.max.x);
  push(lines, 20, extents.max.y);

  push(lines, 0, 'ENDSEC');
}

function emitTables(
  lines: string[],
  layers: Layer[],
  usedLineTypes: Map<string, LineTypeDefinition>,
  usedStyles: Map<string, string>,
  blockNames: string[]
): void {
  push(lines, 0, 'SECTION');
  push(lines, 2, 'TABLES');

  // ── VPORT table ───────────────────────────────────────────
  // Some readers (incl. Traverse PC) report "Missing Symbol Table"
  // when the standard symbol tables are absent. Emit a minimal but
  // complete set: VPORT, LTYPE, LAYER, STYLE, APPID, BLOCK_RECORD.
  push(lines, 0, 'TABLE');
  push(lines, 2, 'VPORT');
  push(lines, 70, 1);
  push(lines, 0, 'VPORT');
  push(lines, 2, '*ACTIVE');
  push(lines, 70, 0);
  push(lines, 0, 'ENDTAB');

  // ── LTYPE table ───────────────────────────────────────────
  // Linetypes must precede the LAYER table since layers reference
  // them by name. CONTINUOUS is always present; every dashed type
  // a layer or entity uses is emitted with its dash pattern so the
  // dashes survive the round-trip into Traverse PC / AutoCAD.
  push(lines, 0, 'TABLE');
  push(lines, 2, 'LTYPE');
  push(lines, 70, usedLineTypes.size + 1);
  emitContinuousLType(lines);
  for (const lt of usedLineTypes.values()) emitLTypeRow(lines, lt);
  push(lines, 0, 'ENDTAB');

  // ── LAYER table ───────────────────────────────────────────
  push(lines, 0, 'TABLE');
  push(lines, 2, 'LAYER');
  push(lines, 70, layers.length + 1); // +1 for the always-present "0"

  // AutoCAD always expects a layer named "0".
  emitLayerRow(lines, '0', '#FFFFFF', 'CONTINUOUS', 0.25);
  for (const layer of layers) {
    emitLayerRow(
      lines,
      dxfSafeName(layer.name || layer.id),
      layer.color,
      dxfLineTypeName(layer.lineTypeId),
      layer.lineWeight
    );
  }
  push(lines, 0, 'ENDTAB');

  // ── STYLE table ───────────────────────────────────────────
  // Text styles carry the font so labels render with the right
  // typeface after import rather than falling back to the default.
  push(lines, 0, 'TABLE');
  push(lines, 2, 'STYLE');
  push(lines, 70, usedStyles.size + 1);
  emitStyleRow(lines, 'STANDARD', 'Arial.ttf');
  for (const [styleName, fontFile] of usedStyles) {
    if (styleName === 'STANDARD') continue;
    emitStyleRow(lines, styleName, fontFile);
  }
  push(lines, 0, 'ENDTAB');

  // R12 (AC1009) needs no APPID / BLOCK_RECORD symbol tables — they
  // are R13+ constructs and including them can crash older readers.
  push(lines, 0, 'ENDSEC');
  void blockNames;
}

function emitContinuousLType(lines: string[]): void {
  push(lines, 0, 'LTYPE');
  push(lines, 2, 'CONTINUOUS');
  push(lines, 70, 0);
  push(lines, 3, 'Solid line');
  push(lines, 72, 65); // alignment code 'A'
  push(lines, 73, 0); // dash element count
  push(lines, 40, 0); // total pattern length
}

function emitLTypeRow(lines: string[], lt: LineTypeDefinition): void {
  // DXF dash pattern: positive = dash (pen down), negative = gap
  // (pen up). Our dashPattern alternates [dash, gap, dash, gap…].
  const elements = lt.dashPattern.map((len, i) =>
    i % 2 === 0 ? Math.abs(len) : -Math.abs(len)
  );
  const total = elements.reduce((s, e) => s + Math.abs(e), 0);
  push(lines, 0, 'LTYPE');
  push(lines, 2, dxfLineTypeName(lt.id));
  push(lines, 70, 0);
  push(lines, 3, lt.name);
  push(lines, 72, 65); // 'A' alignment
  push(lines, 73, elements.length);
  push(lines, 40, total);
  for (const e of elements) {
    push(lines, 49, e);
    push(lines, 74, 0);
  }
}

function emitStyleRow(lines: string[], name: string, fontFile: string): void {
  push(lines, 0, 'STYLE');
  push(lines, 2, name);
  push(lines, 70, 0);
  push(lines, 40, 0); // non-fixed text height
  push(lines, 41, 1); // width factor
  push(lines, 50, 0); // oblique angle
  push(lines, 71, 0);
  push(lines, 42, 0.2); // last height used
  push(lines, 3, fontFile); // primary font file (TrueType)
  push(lines, 4, ''); // big font file
}

function emitLayerRow(
  lines: string[],
  name: string,
  hexColor: string,
  lineTypeName: string,
  lineWeightMm: number
): void {
  push(lines, 0, 'LAYER');
  push(lines, 2, name);
  push(lines, 70, 0); // flags: 0 = visible, unfrozen, unlocked
  push(lines, 62, hexToAci(hexColor)); // ACI color (R12 has no true color)
  push(lines, 6, lineTypeName); // line type
  void lineWeightMm; // R12 has no lineweight (group 370)
}

function emitEntities(
  lines: string[],
  features: Feature[],
  doc: DrawingDocument,
  splineSamples: number,
  annotations: AnnotationBase[]
): void {
  push(lines, 0, 'SECTION');
  push(lines, 2, 'ENTITIES');

  for (const f of features) {
    const layerName = layerNameFor(f, doc);
    const attribs = entityAttribsFor(f, doc);
    emitFeature(lines, f, layerName, splineSamples, attribs);
    emitFeatureSymbol(lines, f, layerName, doc);
    emitFeatureLabels(lines, f, doc);
  }

  for (const a of annotations) {
    emitAnnotation(lines, a, doc);
  }

  // Created points that live only as linework vertex refs (minted names +
  // cross-layer `:N` derivatives) have no standalone POINT feature, so the
  // feature walk above misses them. Materialize each as a POINT entity +
  // a name TEXT on its layer so every created point lands in the DXF, the
  // same way it lands in CSV/PNEZD/LandXML.
  emitDerivedPoints(lines, doc);

  push(lines, 0, 'ENDSEC');
}

function emitDerivedPoints(lines: string[], doc: DrawingDocument): void {
  const derived = collectDerivedPoints(doc);
  if (derived.length === 0) return;
  const drawingScale = doc.settings.drawingScale ?? 50;
  const nameHeight = Math.max(0.01, (10 / 72) * drawingScale);
  for (const p of derived) {
    const layer = doc.layers[p.layerId];
    const layerName = layer ? dxfSafeName(layer.name || layer.id) : '0';
    const pos = { x: p.x, y: p.y };
    emitPoint(lines, layerName, pos);
    if (p.name) {
      emitText(lines, layerName, pos, p.name, nameHeight, 0, 0, 0);
    }
  }
}

// ────────────────────────────────────────────────────────────
// Per-entity style overrides (color / linetype / lineweight)
// ────────────────────────────────────────────────────────────

interface EntityAttribs {
  lineType?: string;
  aci?: number;
}

/** Resolve the group codes for a feature's style when it overrides
 *  its layer. R12 carries only ACI color (62) and linetype (6); true
 *  color and lineweight are R2000+ and are intentionally omitted for
 *  maximum reader compatibility. */
function entityAttribsFor(f: Feature, doc: DrawingDocument): EntityAttribs {
  const layer = doc.layers[f.layerId];
  const s = f.style;
  const out: EntityAttribs = {};
  if (s?.lineTypeId && s.lineTypeId !== layer?.lineTypeId) {
    out.lineType = dxfLineTypeName(s.lineTypeId);
  }
  if (s?.color) out.aci = hexToAci(s.color);
  return out;
}

/** Emit override group codes right after an entity's layer (8) code. */
function pushAttribs(lines: string[], attribs?: EntityAttribs): void {
  if (!attribs) return;
  if (attribs.lineType) push(lines, 6, attribs.lineType);
  if (attribs.aci != null) push(lines, 62, attribs.aci);
}

function emitEof(lines: string[]): void {
  push(lines, 0, 'EOF');
}

// ────────────────────────────────────────────────────────────
// Per-feature emitters
// ────────────────────────────────────────────────────────────

function emitFeature(
  lines: string[],
  f: Feature,
  layerName: string,
  splineSamples: number,
  attribs?: EntityAttribs
): void {
  const g = f.geometry;
  switch (f.type) {
    case 'POINT':
      if (g.point) emitPoint(lines, layerName, g.point, attribs);
      else if (g.start) emitPoint(lines, layerName, g.start, attribs);
      return;
    case 'LINE':
      if (g.start && g.end) emitLine(lines, layerName, g.start, g.end, attribs);
      return;
    case 'POLYLINE':
      if (g.vertices && g.vertices.length >= 2) {
        emitLwPolyline(lines, layerName, g.vertices, false, attribs);
      }
      return;
    case 'POLYGON':
      // Polygons sometimes carry a `circle` (the renderer's
      // "round polygon" trick); emit as CIRCLE in that case.
      if (g.circle) {
        emitCircle(lines, layerName, g.circle, attribs);
      } else if (g.vertices && g.vertices.length >= 3) {
        emitLwPolyline(lines, layerName, g.vertices, true, attribs);
      }
      return;
    case 'CIRCLE':
      if (g.circle) emitCircle(lines, layerName, g.circle, attribs);
      return;
    case 'ELLIPSE':
      if (g.ellipse) emitEllipse(lines, layerName, g.ellipse, attribs);
      return;
    case 'ARC':
      if (g.arc) emitArc(lines, layerName, g.arc, attribs);
      return;
    case 'SPLINE':
      if (g.spline) {
        const pts = sampleBezierSpline(g.spline, splineSamples);
        if (pts.length >= 2) {
          emitLwPolyline(lines, layerName, pts, g.spline.isClosed, attribs);
        }
      }
      return;
    case 'MIXED_GEOMETRY':
      if (g.vertices && g.vertices.length >= 2) {
        for (let i = 0; i < g.vertices.length - 1; i += 1) {
          emitLine(lines, layerName, g.vertices[i], g.vertices[i + 1], attribs);
        }
      }
      return;
    case 'TEXT':
      // Standalone text feature → TEXT entity at its anchor.
      if (g.textContent) {
        const pos = g.point ?? g.start ?? g.vertices?.[0];
        if (pos) {
          emitText(
            lines,
            layerName,
            pos,
            g.textContent,
            textHeightFor(f),
            ((g.textRotation ?? 0) * 180) / Math.PI,
            0,
            0
          );
        }
      }
      return;
    case 'IMAGE':
      return;
    default:
      return;
  }
}

/** World-unit text height for a standalone TEXT feature, derived
 *  the same way the canvas sizes label text. */
function textHeightFor(f: Feature): number {
  const ptSize =
    (f.properties?.fontSize as number | undefined) ??
    (f.textLabels?.[0]?.style?.fontSize as number | undefined) ??
    10;
  // Without a drawing scale here we fall back to the point size in
  // world units; standalone text features are rare and the surveyor
  // can rescale on import.
  return Math.max(0.01, ptSize);
}

function emitPoint(
  lines: string[],
  layer: string,
  p: Point2D,
  attribs?: EntityAttribs
): void {
  push(lines, 0, 'POINT');
  push(lines, 8, layer);
  pushAttribs(lines, attribs);
  push(lines, 10, p.x);
  push(lines, 20, p.y);
  push(lines, 30, 0);
}

function emitLine(
  lines: string[],
  layer: string,
  a: Point2D,
  b: Point2D,
  attribs?: EntityAttribs
): void {
  push(lines, 0, 'LINE');
  push(lines, 8, layer);
  pushAttribs(lines, attribs);
  push(lines, 10, a.x);
  push(lines, 20, a.y);
  push(lines, 30, 0);
  push(lines, 11, b.x);
  push(lines, 21, b.y);
  push(lines, 31, 0);
}

function emitLwPolyline(
  lines: string[],
  layer: string,
  vertices: Point2D[],
  closed: boolean,
  attribs?: EntityAttribs
): void {
  // R12 has no LWPOLYLINE — use the old-style POLYLINE + VERTEX + SEQEND.
  push(lines, 0, 'POLYLINE');
  push(lines, 8, layer);
  pushAttribs(lines, attribs);
  push(lines, 66, 1); // vertices-follow flag
  push(lines, 70, closed ? 1 : 0);
  push(lines, 10, 0);
  push(lines, 20, 0);
  push(lines, 30, 0);
  for (const v of vertices) {
    push(lines, 0, 'VERTEX');
    push(lines, 8, layer);
    push(lines, 10, v.x);
    push(lines, 20, v.y);
    push(lines, 30, 0);
  }
  push(lines, 0, 'SEQEND');
  push(lines, 8, layer);
}

function emitCircle(
  lines: string[],
  layer: string,
  c: CircleGeometry,
  attribs?: EntityAttribs
): void {
  push(lines, 0, 'CIRCLE');
  push(lines, 8, layer);
  pushAttribs(lines, attribs);
  push(lines, 10, c.center.x);
  push(lines, 20, c.center.y);
  push(lines, 30, 0);
  push(lines, 40, c.radius);
}

function emitEllipse(
  lines: string[],
  layer: string,
  e: EllipseGeometry,
  attribs?: EntityAttribs
): void {
  // R12 has no ELLIPSE entity — approximate as a closed polyline.
  const cosR = Math.cos(e.rotation);
  const sinR = Math.sin(e.rotation);
  const SEG = 64;
  const verts: Point2D[] = [];
  for (let i = 0; i < SEG; i += 1) {
    const t = (i / SEG) * Math.PI * 2;
    const x = e.radiusX * Math.cos(t);
    const y = e.radiusY * Math.sin(t);
    verts.push({
      x: e.center.x + x * cosR - y * sinR,
      y: e.center.y + x * sinR + y * cosR,
    });
  }
  emitLwPolyline(lines, layer, verts, true, attribs);
}

function emitArc(
  lines: string[],
  layer: string,
  a: ArcGeometry,
  attribs?: EntityAttribs
): void {
  // DXF ARC angles are in degrees, measured from east (X+),
  // CCW. Our internal angles use the same math convention but
  // are in radians, so convert. When the arc is clockwise we
  // swap start/end so the resulting CCW sweep covers the same
  // visible arc.
  const startDeg = (a.startAngle * 180) / Math.PI;
  const endDeg = (a.endAngle * 180) / Math.PI;
  const [s, e] = a.anticlockwise ? [startDeg, endDeg] : [endDeg, startDeg];
  push(lines, 0, 'ARC');
  push(lines, 8, layer);
  pushAttribs(lines, attribs);
  push(lines, 10, a.center.x);
  push(lines, 20, a.center.y);
  push(lines, 30, 0);
  push(lines, 40, a.radius);
  push(lines, 50, normalizeDeg(s));
  push(lines, 51, normalizeDeg(e));
}

// ────────────────────────────────────────────────────────────
// Spline → polyline sampler
// ────────────────────────────────────────────────────────────

function sampleBezierSpline(
  s: SplineGeometry,
  samplesPerCurve: number
): Point2D[] {
  const pts = s.controlPoints;
  const out: Point2D[] = [];
  for (let i = 0; i + 3 < pts.length; i += 3) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const p2 = pts[i + 2];
    const p3 = pts[i + 3];
    if (out.length === 0) out.push(p0);
    for (let j = 1; j <= samplesPerCurve; j += 1) {
      const t = j / samplesPerCurve;
      out.push(cubicBezier(p0, p1, p2, p3, t));
    }
  }
  return out;
}

function cubicBezier(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  t: number
): Point2D {
  const u = 1 - t;
  const c0 = u * u * u;
  const c1 = 3 * u * u * t;
  const c2 = 3 * u * t * t;
  const c3 = t * t * t;
  return {
    x: c0 * p0.x + c1 * p1.x + c2 * p2.x + c3 * p3.x,
    y: c0 * p0.y + c1 * p1.y + c2 * p2.y + c3 * p3.y,
  };
}

// ────────────────────────────────────────────────────────────
// Extents
// ────────────────────────────────────────────────────────────

function computeExtents(features: Feature[]): { min: Point2D; max: Point2D } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of features) {
    walkPoints(f.geometry, (p) => {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    });
  }
  if (!Number.isFinite(minX)) {
    return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

function walkPoints(g: FeatureGeometry, visit: (p: Point2D) => void): void {
  if (g.point) visit(g.point);
  if (g.start) visit(g.start);
  if (g.end) visit(g.end);
  if (g.vertices) for (const v of g.vertices) visit(v);
  if (g.circle) {
    visit({ x: g.circle.center.x - g.circle.radius, y: g.circle.center.y - g.circle.radius });
    visit({ x: g.circle.center.x + g.circle.radius, y: g.circle.center.y + g.circle.radius });
  }
  if (g.ellipse) {
    visit({ x: g.ellipse.center.x - g.ellipse.radiusX, y: g.ellipse.center.y - g.ellipse.radiusY });
    visit({ x: g.ellipse.center.x + g.ellipse.radiusX, y: g.ellipse.center.y + g.ellipse.radiusY });
  }
  if (g.arc) {
    visit({ x: g.arc.center.x - g.arc.radius, y: g.arc.center.y - g.arc.radius });
    visit({ x: g.arc.center.x + g.arc.radius, y: g.arc.center.y + g.arc.radius });
  }
  if (g.spline) for (const v of g.spline.controlPoints) visit(v);
}

// ────────────────────────────────────────────────────────────
// Linetype + lineweight + text-style helpers
// ────────────────────────────────────────────────────────────

/** Map an internal linetype id to a DXF linetype name. SOLID and
 *  unknown ids collapse to CONTINUOUS (DXF's built-in solid). */
function dxfLineTypeName(id: string | null | undefined): string {
  if (!id || id === 'SOLID') return 'CONTINUOUS';
  return dxfSafeName(id);
}

/** Gather every dashed linetype referenced by a used layer or by a
 *  feature override, keyed by DXF name. Solid lines need no entry. */
function collectUsedLineTypes(
  features: Feature[],
  layers: Layer[],
  doc: DrawingDocument
): Map<string, LineTypeDefinition> {
  const out = new Map<string, LineTypeDefinition>();
  const consider = (id: string | null | undefined) => {
    if (!id || id === 'SOLID') return;
    const name = dxfSafeName(id);
    if (out.has(name)) return;
    const def = findLineType(id, doc.customLineTypes ?? []);
    // Only patterns with real dashes can be expressed as a DXF
    // LTYPE; symbol/special-renderer linetypes fall back to solid
    // (their geometry still ports, just without the inline glyphs).
    if (def && def.dashPattern.length > 0) out.set(name, def);
  };
  for (const layer of layers) consider(layer.lineTypeId);
  for (const f of features) consider(f.style?.lineTypeId);
  return out;
}

/** Sanitised, unique DXF STYLE name for a font family. */
function fontStyleName(font: string | null | undefined): string {
  const f = (font ?? '').trim();
  if (!f) return 'STANDARD';
  return dxfSafeName(f.toUpperCase().replace(/\s+/g, '_'));
}

/** Map a font family to a TrueType file name for the STYLE table. */
function fontFileFor(font: string | null | undefined): string {
  const f = (font ?? '').trim();
  if (!f) return 'Arial.ttf';
  // Generic CSS families → a sensible TrueType default.
  const lower = f.toLowerCase();
  if (lower === 'serif') return 'Times New Roman.ttf';
  if (lower === 'monospace') return 'Consolas.ttf';
  if (lower === 'sans-serif') return 'Arial.ttf';
  return `${f}.ttf`;
}

/** Collect the text styles used by annotations + feature labels. */
function collectUsedTextStyles(
  features: Feature[],
  annotations: AnnotationBase[]
): Map<string, string> {
  const out = new Map<string, string>();
  out.set('STANDARD', 'Arial.ttf');
  const consider = (font: string | null | undefined) => {
    const name = fontStyleName(font);
    if (!out.has(name)) out.set(name, fontFileFor(font));
  };
  for (const a of annotations) {
    consider((a as { font?: string }).font);
  }
  for (const f of features) {
    for (const l of f.textLabels ?? []) consider(l.style?.fontFamily);
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Color helpers
// ────────────────────────────────────────────────────────────

/** Map a hex color to the closest legacy AutoCAD Color Index (ACI).
 *  R12 carries color only as ACI, so this is the color path. */
function hexToAci(hex: string): number {
  const cleaned = (hex ?? '').replace('#', '').trim();
  if (cleaned.length !== 6) return 7;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  if (r === 255 && g === 0 && b === 0) return 1; // red
  if (r === 255 && g === 255 && b === 0) return 2; // yellow
  if (r === 0 && g === 255 && b === 0) return 3; // green
  if (r === 0 && g === 255 && b === 255) return 4; // cyan
  if (r === 0 && g === 0 && b === 255) return 5; // blue
  if (r === 255 && g === 0 && b === 255) return 6; // magenta
  if (r > 200 && g > 200 && b > 200) return 7; // white / black
  if (r < 60 && g < 60 && b < 60) return 7;
  return 7;
}

// ────────────────────────────────────────────────────────────
// Group-code emitters
// ────────────────────────────────────────────────────────────

function push(lines: string[], code: number, value: string | number): void {
  // DXF group-code lines are space-padded right-aligned to 3
  // chars by spec, but most readers tolerate any whitespace;
  // keep it terse.
  lines.push(String(code));
  lines.push(formatValue(code, value));
}

function pushVar(
  lines: string[],
  name: string,
  code: number,
  value: string | number
): void {
  push(lines, 9, name);
  push(lines, code, value);
}

function formatValue(code: number, value: string | number): string {
  if (typeof value === 'string') return value;
  // Coordinate / float codes get a fixed precision so the file
  // is byte-stable across runs.
  if (
    (code >= 10 && code <= 59) ||
    (code >= 110 && code <= 139) ||
    (code >= 210 && code <= 239) ||
    code === 40 ||
    code === 41 ||
    code === 42 ||
    code === 50 ||
    code === 51
  ) {
    return value.toFixed(6);
  }
  return value.toString();
}

function normalizeDeg(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

// ────────────────────────────────────────────────────────────
// Symbol BLOCKS + per-feature INSERT
// ────────────────────────────────────────────────────────────

interface BlockRef {
  symbol: SymbolDefinition;
  blockName: string;
}

function collectUsedSymbols(
  features: Feature[],
  doc: DrawingDocument
): Map<string, BlockRef> {
  const out = new Map<string, BlockRef>();
  for (const f of features) {
    const symbolId = f.style?.symbolId;
    if (!symbolId || out.has(symbolId)) continue;
    const symbol = findSymbol(symbolId, doc.customSymbols ?? []);
    if (!symbol) continue;
    out.set(symbolId, { symbol, blockName: dxfSafeName(`STARR_${symbol.id}`) });
  }
  return out;
}

function emitBlocks(
  lines: string[],
  usedSymbols: Map<string, BlockRef>
): void {
  push(lines, 0, 'SECTION');
  push(lines, 2, 'BLOCKS');
  for (const { symbol, blockName } of usedSymbols.values()) {
    push(lines, 0, 'BLOCK');
    push(lines, 8, '0');
    push(lines, 2, blockName);
    push(lines, 70, 0);
    push(lines, 10, 0);
    push(lines, 20, 0);
    push(lines, 30, 0);
    push(lines, 3, blockName);
    push(lines, 1, '');
    emitSymbolPlaceholder(lines, symbol, blockName);
    push(lines, 0, 'ENDBLK');
    push(lines, 8, '0');
  }
  push(lines, 0, 'ENDSEC');
}

/**
 * Block-internal geometry for a symbol. We don't (yet) parse
 * the SymbolPath SVG `d` strings into DXF entities; instead we
 * land a placeholder circle of `defaultSize/2` plus a TEXT
 * label with the symbol name so downstream CAD tools can spot
 * the placement and the surveyor can swap in a real block
 * after import. Real path translation lands in a follow-up
 * slice once an SVG-to-DXF helper exists.
 */
function emitSymbolPlaceholder(
  lines: string[],
  symbol: SymbolDefinition,
  blockName: string
): void {
  const r = Math.max(0.05, (symbol.defaultSize ?? 1) / 2);
  push(lines, 0, 'CIRCLE');
  push(lines, 8, '0');
  push(lines, 10, 0);
  push(lines, 20, 0);
  push(lines, 30, 0);
  push(lines, 40, r);

  push(lines, 0, 'TEXT');
  push(lines, 8, '0');
  push(lines, 10, 0);
  push(lines, 20, -r * 1.5);
  push(lines, 30, 0);
  push(lines, 40, r * 0.6);
  push(lines, 1, blockName);
  push(lines, 72, 1); // center align
  push(lines, 11, 0);
  push(lines, 21, -r * 1.5);
}

function emitFeatureSymbol(
  lines: string[],
  f: Feature,
  layerName: string,
  doc: DrawingDocument
): void {
  const symbolId = f.style?.symbolId;
  if (!symbolId) return;
  const anchor = featureAnchor(f);
  if (!anchor) return;
  const symbol = findSymbol(symbolId, doc.customSymbols ?? []);
  const blockName = dxfSafeName(`STARR_${symbolId}`);
  const scale =
    f.style?.symbolSize !== null && f.style?.symbolSize !== undefined
      ? f.style.symbolSize
      : 1;
  const rotationDeg = ((f.style?.symbolRotation ?? 0) * 180) / Math.PI;

  push(lines, 0, 'INSERT');
  push(lines, 8, layerName);
  push(lines, 2, blockName);
  push(lines, 10, anchor.x);
  push(lines, 20, anchor.y);
  push(lines, 30, 0);
  push(lines, 41, scale);
  push(lines, 42, scale);
  push(lines, 43, scale);
  push(lines, 50, normalizeDeg(rotationDeg));

  // Reference the resolved symbol so the unused-arg lint stays
  // happy when the placeholder block is the only emission.
  void symbol;
}

function featureAnchor(f: Feature): Point2D | null {
  const g = f.geometry;
  if (g.point) return g.point;
  if (g.start) return g.start;
  if (g.vertices && g.vertices.length > 0) return g.vertices[0];
  if (g.circle) return g.circle.center;
  if (g.arc) return g.arc.center;
  if (g.ellipse) return g.ellipse.center;
  return null;
}

// ────────────────────────────────────────────────────────────
// Annotation TEXT emitters
// ────────────────────────────────────────────────────────────

function emitAnnotation(
  lines: string[],
  a: AnnotationBase,
  doc: DrawingDocument
): void {
  const layerName = a.layerId
    ? dxfSafeName(doc.layers[a.layerId]?.name ?? a.layerId)
    : 'ANNOTATIONS';
  const styleName = fontStyleName((a as { font?: string }).font);
  switch (a.type) {
    case 'BEARING_DISTANCE': {
      const b = a as import('../labels/annotation-types').BearingDistanceDimension;
      const mid = midpoint(b.startPoint, b.endPoint);
      const angleDeg = lineAngleDeg(b.startPoint, b.endPoint);
      const rotDeg =
        b.textRotation === 'HORIZONTAL'
          ? 0
          : b.textRotation === 'UPRIGHT'
            ? uprightAngle(angleDeg)
            : angleDeg;
      const combined =
        [b.bearingText, b.distanceText].filter(Boolean).join('  ') ||
        `${b.bearing.toFixed(2)}°  ${b.distance.toFixed(2)}'`;
      emitText(lines, layerName, mid, combined, b.fontSize, rotDeg, 1, 1, styleName);
      return;
    }
    case 'CURVE_DATA': {
      const c = a as import('../labels/annotation-types').CurveDataAnnotation;
      const anchor = c.customPosition ?? { x: 0, y: 0 };
      const lineSpacing = c.lineSpacing > 0 ? c.lineSpacing : 1;
      let cursorY = anchor.y;
      for (const text of c.textLines) {
        emitText(
          lines,
          layerName,
          { x: anchor.x, y: cursorY },
          text,
          c.fontSize,
          0,
          0,
          0,
          styleName
        );
        cursorY -= c.fontSize * lineSpacing;
      }
      return;
    }
    case 'MONUMENT_LABEL': {
      const m = a as import('../labels/annotation-types').MonumentLabel;
      const offsetX = m.offsetDistance * Math.cos(m.offsetAngle);
      const offsetY = m.offsetDistance * Math.sin(m.offsetAngle);
      emitText(
        lines,
        layerName,
        { x: m.position.x + offsetX, y: m.position.y + offsetY },
        m.text || m.abbreviatedText,
        m.fontSize,
        0,
        0,
        0,
        styleName
      );
      return;
    }
    case 'AREA_LABEL': {
      const ar = a as import('../labels/annotation-types').AreaAnnotation;
      emitText(
        lines,
        layerName,
        ar.position,
        ar.text,
        ar.fontSize,
        0,
        1,
        1,
        styleName
      );
      return;
    }
    case 'TEXT': {
      const t = a as import('../labels/annotation-types').TextAnnotation;
      const halign = t.alignment === 'CENTER' ? 1 : t.alignment === 'RIGHT' ? 2 : 0;
      const valign =
        t.verticalAlignment === 'TOP'
          ? 3
          : t.verticalAlignment === 'MIDDLE'
            ? 2
            : 0;
      emitText(
        lines,
        layerName,
        t.position,
        t.text,
        t.fontSize,
        (t.rotation * 180) / Math.PI,
        halign,
        valign,
        styleName
      );
      return;
    }
    case 'LEADER': {
      const l = a as import('../labels/annotation-types').LeaderAnnotation;
      if (l.vertices && l.vertices.length >= 2) {
        emitLwPolyline(lines, layerName, l.vertices, false);
      } else if (l.arrowPoint && l.textPosition) {
        emitLine(lines, layerName, l.arrowPoint, l.textPosition);
      }
      if (l.text) {
        emitText(
          lines,
          layerName,
          l.textPosition,
          l.text,
          l.fontSize,
          0,
          0,
          0,
          styleName
        );
      }
      return;
    }
    default:
      return;
  }
}

/**
 * Emit a feature's on-canvas text labels (point names, elevations,
 * descriptions, segment bearings/distances, area/perimeter) as TEXT
 * entities. World position + height mirror the canvas renderer so
 * the labels land in the same place and size after import.
 */
function emitFeatureLabels(
  lines: string[],
  f: Feature,
  doc: DrawingDocument
): void {
  const labels = f.textLabels;
  if (!labels || labels.length === 0) return;
  const layerName = layerNameFor(f, doc);
  const drawingScale = doc.settings.drawingScale ?? 50;
  const g = f.geometry;

  const bearingLabels = labels.filter((l) => l.kind === 'BEARING');
  const distLabels = labels.filter((l) => l.kind === 'DISTANCE');

  for (const label of labels) {
    if (!label.visible || !label.text) continue;

    const anchor = labelAnchor(label, g, bearingLabels, distLabels);
    if (!anchor) continue;

    const scale = label.userPositioned ? 1 : label.scale;
    let worldDx: number;
    let worldDy: number;
    if (label.rotation !== null && !label.userPositioned) {
      // Line-relative: x runs along the line, y perpendicular.
      const theta = label.rotation;
      const along = label.offset.x * scale;
      const perp = label.offset.y * scale;
      worldDx = Math.cos(theta) * along - Math.sin(theta) * perp;
      worldDy = Math.sin(theta) * along + Math.cos(theta) * perp;
    } else {
      worldDx = label.offset.x * scale;
      worldDy = label.offset.y * scale;
    }

    const pos = { x: anchor.x + worldDx, y: anchor.y + worldDy };
    const height = (label.style.fontSize / 72) * drawingScale * scale;
    const rotDeg = label.rotation !== null ? (label.rotation * 180) / Math.PI : 0;
    const styleName = fontStyleName(label.style.fontFamily);
    emitText(lines, layerName, pos, label.text, height, rotDeg, 1, 2, styleName);
  }
}

function labelAnchor(
  label: TextLabel,
  g: FeatureGeometry,
  bearingLabels: TextLabel[],
  distLabels: TextLabel[]
): Point2D | null {
  switch (label.kind) {
    case 'POINT_NAME':
    case 'POINT_DESCRIPTION':
    case 'POINT_ELEVATION':
    case 'POINT_COORDINATES':
      return g.point ?? g.start ?? null;
    case 'BEARING':
    case 'DISTANCE': {
      if (g.type === 'LINE' && g.start && g.end) return midpoint(g.start, g.end);
      if ((g.type === 'POLYLINE' || g.type === 'POLYGON') && g.vertices) {
        const idx =
          label.kind === 'BEARING'
            ? bearingLabels.indexOf(label)
            : distLabels.indexOf(label);
        const verts = g.vertices;
        const maxSeg = g.type === 'POLYGON' ? verts.length : verts.length - 1;
        if (idx >= 0 && idx < maxSeg) {
          return midpoint(verts[idx], verts[(idx + 1) % verts.length]);
        }
      }
      return null;
    }
    case 'AREA':
    case 'PERIMETER': {
      if (g.vertices && g.vertices.length >= 3) {
        const cx = g.vertices.reduce((s, v) => s + v.x, 0) / g.vertices.length;
        const cy = g.vertices.reduce((s, v) => s + v.y, 0) / g.vertices.length;
        return { x: cx, y: cy };
      }
      return null;
    }
    default:
      return null;
  }
}

function emitText(
  lines: string[],
  layer: string,
  position: Point2D,
  text: string,
  height: number,
  rotationDeg: number,
  halign: number,
  valign: number,
  styleName?: string
): void {
  push(lines, 0, 'TEXT');
  push(lines, 8, layer);
  push(lines, 10, position.x);
  push(lines, 20, position.y);
  push(lines, 30, 0);
  push(lines, 40, Math.max(0.01, height));
  push(lines, 1, text);
  push(lines, 50, normalizeDeg(rotationDeg));
  if (styleName && styleName !== 'STANDARD') push(lines, 7, styleName);
  push(lines, 72, halign);
  push(lines, 73, valign);
  // When halign/valign are non-zero, AutoCAD reads the alignment
  // point from group codes 11/21 instead of 10/20.
  push(lines, 11, position.x);
  push(lines, 21, position.y);
  push(lines, 31, 0);
}

function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function lineAngleDeg(a: Point2D, b: Point2D): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function uprightAngle(angleDeg: number): number {
  // Keep text right-side up: flip when the line points into the
  // bottom half of the circle.
  let d = normalizeDeg(angleDeg);
  if (d > 90 && d < 270) d -= 180;
  return d;
}

function dxfSafeName(name: string): string {
  // AutoCAD layer names disallow control chars + a few specials.
  return name.replace(/[<>/\\":;?*|=,'`]/g, '_').slice(0, 255);
}

function layerNameFor(f: Feature, doc: DrawingDocument): string {
  const layer = doc.layers[f.layerId];
  if (!layer) return '0';
  return dxfSafeName(layer.name || layer.id);
}
