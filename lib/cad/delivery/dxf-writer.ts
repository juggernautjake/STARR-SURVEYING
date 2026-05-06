// lib/cad/delivery/dxf-writer.ts
//
// Phase 7 §10 — minimal AutoCAD DXF (R2018 ASCII) writer.
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
} from '../types';
import type { AnnotationBase } from '../labels/annotation-types';
import type { SymbolDefinition } from '../styles/types';
import { findSymbol } from '../styles/symbol-library';

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
  const extents = computeExtents(features);

  const lines: string[] = [];
  emitHeader(lines, extents);
  emitTables(lines, layers);
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

  pushVar(lines, '$ACADVER', 1, 'AC1032'); // R2018
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
  pushVar(lines, '$INSUNITS', 70, 2); // 2 = US Feet

  push(lines, 0, 'ENDSEC');
}

function emitTables(lines: string[], layers: Layer[]): void {
  push(lines, 0, 'SECTION');
  push(lines, 2, 'TABLES');

  // ── LAYER table ───────────────────────────────────────────
  push(lines, 0, 'TABLE');
  push(lines, 2, 'LAYER');
  push(lines, 70, layers.length + 1); // +1 for the always-present "0"

  // AutoCAD always expects a layer named "0".
  emitLayerRow(lines, '0', '#FFFFFF');
  for (const layer of layers) {
    emitLayerRow(lines, dxfSafeName(layer.name || layer.id), layer.color);
  }

  push(lines, 0, 'ENDTAB');
  push(lines, 0, 'ENDSEC');
}

function emitLayerRow(lines: string[], name: string, hexColor: string): void {
  push(lines, 0, 'LAYER');
  push(lines, 2, name);
  push(lines, 70, 0); // flags: 0 = visible, unfrozen, unlocked
  push(lines, 62, hexToAci(hexColor)); // legacy ACI fallback
  push(lines, 6, 'CONTINUOUS'); // line type
  push(lines, 420, hexToTrueColor(hexColor)); // 32-bit true color
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
    emitFeature(lines, f, layerName, splineSamples);
    emitFeatureSymbol(lines, f, layerName, doc);
  }

  for (const a of annotations) {
    emitAnnotation(lines, a, doc);
  }

  push(lines, 0, 'ENDSEC');
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
  splineSamples: number
): void {
  const g = f.geometry;
  switch (f.type) {
    case 'POINT':
      if (g.point) emitPoint(lines, layerName, g.point);
      else if (g.start) emitPoint(lines, layerName, g.start);
      return;
    case 'LINE':
      if (g.start && g.end) emitLine(lines, layerName, g.start, g.end);
      return;
    case 'POLYLINE':
      if (g.vertices && g.vertices.length >= 2) {
        emitLwPolyline(lines, layerName, g.vertices, false);
      }
      return;
    case 'POLYGON':
      // Polygons sometimes carry a `circle` (the renderer's
      // "round polygon" trick); emit as CIRCLE in that case.
      if (g.circle) {
        emitCircle(lines, layerName, g.circle);
      } else if (g.vertices && g.vertices.length >= 3) {
        emitLwPolyline(lines, layerName, g.vertices, true);
      }
      return;
    case 'CIRCLE':
      if (g.circle) emitCircle(lines, layerName, g.circle);
      return;
    case 'ELLIPSE':
      if (g.ellipse) emitEllipse(lines, layerName, g.ellipse);
      return;
    case 'ARC':
      if (g.arc) emitArc(lines, layerName, g.arc);
      return;
    case 'SPLINE':
      if (g.spline) {
        const pts = sampleBezierSpline(g.spline, splineSamples);
        if (pts.length >= 2) {
          emitLwPolyline(lines, layerName, pts, g.spline.isClosed);
        }
      }
      return;
    case 'MIXED_GEOMETRY':
      if (g.vertices && g.vertices.length >= 2) {
        for (let i = 0; i < g.vertices.length - 1; i += 1) {
          emitLine(lines, layerName, g.vertices[i], g.vertices[i + 1]);
        }
      }
      return;
    case 'TEXT':
    case 'IMAGE':
      // §10.3 annotation slice — not in this slice.
      return;
    default:
      return;
  }
}

function emitPoint(lines: string[], layer: string, p: Point2D): void {
  push(lines, 0, 'POINT');
  push(lines, 8, layer);
  push(lines, 10, p.x);
  push(lines, 20, p.y);
  push(lines, 30, 0);
}

function emitLine(
  lines: string[],
  layer: string,
  a: Point2D,
  b: Point2D
): void {
  push(lines, 0, 'LINE');
  push(lines, 8, layer);
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
  closed: boolean
): void {
  push(lines, 0, 'LWPOLYLINE');
  push(lines, 8, layer);
  push(lines, 90, vertices.length);
  push(lines, 70, closed ? 1 : 0);
  for (const v of vertices) {
    push(lines, 10, v.x);
    push(lines, 20, v.y);
  }
}

function emitCircle(
  lines: string[],
  layer: string,
  c: CircleGeometry
): void {
  push(lines, 0, 'CIRCLE');
  push(lines, 8, layer);
  push(lines, 10, c.center.x);
  push(lines, 20, c.center.y);
  push(lines, 30, 0);
  push(lines, 40, c.radius);
}

function emitEllipse(
  lines: string[],
  layer: string,
  e: EllipseGeometry
): void {
  // DXF ELLIPSE wants the major-axis end relative to center.
  const cosR = Math.cos(e.rotation);
  const sinR = Math.sin(e.rotation);
  const majorEndX = e.radiusX * cosR;
  const majorEndY = e.radiusX * sinR;
  const ratio = e.radiusY / e.radiusX;

  push(lines, 0, 'ELLIPSE');
  push(lines, 8, layer);
  push(lines, 10, e.center.x);
  push(lines, 20, e.center.y);
  push(lines, 30, 0);
  push(lines, 11, majorEndX);
  push(lines, 21, majorEndY);
  push(lines, 31, 0);
  push(lines, 40, ratio);
  push(lines, 41, 0); // start parameter
  push(lines, 42, Math.PI * 2); // end parameter
}

function emitArc(lines: string[], layer: string, a: ArcGeometry): void {
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
// Color helpers
// ────────────────────────────────────────────────────────────

/** Pack #RRGGBB into a DXF 32-bit true color int (0xRRGGBB). */
function hexToTrueColor(hex: string): number {
  const cleaned = (hex ?? '').replace('#', '').trim();
  if (cleaned.length !== 6) return 0xffffff;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  if (
    !Number.isFinite(r) ||
    !Number.isFinite(g) ||
    !Number.isFinite(b)
  ) {
    return 0xffffff;
  }
  return (r << 16) | (g << 8) | b;
}

/** Map a hex color to the closest legacy AutoCAD Color Index.
 *  Coarse but good enough for layer-table fallback; downstream
 *  CAD applications honor the 420 true-color value when set. */
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
      emitText(lines, layerName, mid, combined, b.fontSize, rotDeg, 1, 1);
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
          0
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
        0
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
        1
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
        valign
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
          0
        );
      }
      return;
    }
    default:
      return;
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
  valign: number
): void {
  push(lines, 0, 'TEXT');
  push(lines, 8, layer);
  push(lines, 10, position.x);
  push(lines, 20, position.y);
  push(lines, 30, 0);
  push(lines, 40, Math.max(0.01, height));
  push(lines, 1, text);
  push(lines, 50, normalizeDeg(rotationDeg));
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
