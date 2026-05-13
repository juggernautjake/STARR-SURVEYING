// lib/cad/delivery/pdf-writer.ts
//
// Phase 7 §10 — PDF exporter (sealed final-quality output).
//
// Renders the active `DrawingDocument` to a single-page PDF
// using jsPDF. The page size + orientation come from
// `doc.settings.paperSize` / `paperOrientation`; the world →
// paper transform fits the entire drawing extent into the
// drawable area with a configurable margin.
//
// Coverage:
//   * Geometry — POINT / LINE / POLYLINE / POLYGON / CIRCLE /
//     ELLIPSE / ARC / SPLINE (sampled) / MIXED_GEOMETRY.
//   * Layer colors — group code 420 / hex stripped to RGB.
//   * Title-block strip — surveyor name + license, project,
//     scale, date, sheet ref pulled from `titleBlock`.
//   * Seal — when `sealData.sealImage` is a base64 PNG we
//     embed it at the seal placeholder; otherwise we stamp
//     the seal hash + RPLS license + sealed-at as a text block
//     so the recipient still has the integrity reference.
//
// Pure (per the jsPDF Promise API). Returns the produced
// `Blob` so the caller can stream / download / hand to a
// server route. Throws when invoked outside the browser.
//
// Out of scope this slice (follow-ups):
//   * Per-feature line-style mapping (dashed / dotted / inline
//     symbols). Today every stroke is solid.
//   * Per-feature fill (POLYGON exterior fill colors).
//   * Title-block boxed border + north arrow rendering.
//   * Multi-page support for very large drawings.

import jsPDF from 'jspdf';

import type {
  ArcGeometry,
  CircleGeometry,
  DrawingDocument,
  EllipseGeometry,
  Feature,
  Point2D,
  SplineGeometry,
} from '../types';
import { PAPER_DIMENSIONS } from '../templates/types';

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Plot-style mapping applied to every stroke color the writer
 * emits. Mirrors `PrintConfig.plotStyle` so the print dialog's
 * choice flows through to the exporter without the exporter
 * having to know about the template-store type. Default
 * `AS_DISPLAYED` preserves prior behavior when callers omit it.
 */
export type PdfPlotStyle = 'AS_DISPLAYED' | 'MONOCHROME' | 'GRAYSCALE';

export type PdfScaleMode = 'FIXED' | 'FIT_TO_PAGE';

export interface PdfExportOptions {
  /** Margin around the drawing area, in inches. Default 0.5". */
  marginIn?: number;
  /** Sample density for SPLINE / ARC / ELLIPSE / CIRCLE
   *  approximations. Default 64 segments per curve. */
  curveSamples?: number;
  /** When true, hidden features still emit. Default false. */
  includeHidden?: boolean;
  /** How layer colors are mapped to PDF ink. Default
   *  `'AS_DISPLAYED'` (raw layer hex). `'MONOCHROME'` flattens
   *  every stroke to pure black for plotters that print bitmap
   *  black-and-white. `'GRAYSCALE'` converts each color to its
   *  luminance equivalent so visual hierarchy survives without
   *  ink. */
  plotStyle?: PdfPlotStyle;
  /** `'FIT_TO_PAGE'` (default) auto-scales the drawing to fill
   *  the drawable area. `'FIXED'` honors `scale` (world units
   *  per paper inch — i.e. `50` means `1"=50'`) so the PDF
   *  measures correct footage when checked with a scale. */
  scaleMode?: PdfScaleMode;
  /** World units per paper inch — only consulted when
   *  `scaleMode === 'FIXED'`. Defaults to 50. */
  scale?: number;
}

export interface PdfExportResult {
  blob:     Blob;
  filename: string;
  byteSize: number;
}

export function exportToPdf(
  doc: DrawingDocument,
  options: PdfExportOptions = {}
): PdfExportResult {
  if (typeof globalThis.document === 'undefined') {
    throw new Error('exportToPdf can only run in the browser.');
  }
  const margin = options.marginIn ?? 0.5;
  const samples = Math.max(8, options.curveSamples ?? 64);
  const includeHidden = !!options.includeHidden;
  const plotStyle: PdfPlotStyle = options.plotStyle ?? 'AS_DISPLAYED';
  const scaleMode: PdfScaleMode = options.scaleMode ?? 'FIT_TO_PAGE';
  const fixedScale = Math.max(0.0001, options.scale ?? 50);

  const settings = doc.settings;
  const orientation =
    settings.paperOrientation === 'PORTRAIT' ? 'p' : 'l';
  const paper = PAPER_DIMENSIONS[settings.paperSize];
  // jsPDF expects width × height in the chosen `format`. When
  // orientation is landscape it auto-swaps.
  const pdf = new jsPDF({
    unit: 'in',
    format: [paper.width, paper.height],
    orientation,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // ── World → paper transform ──────────────────────────────
  const features = Object.values(doc.features).filter((f) =>
    includeHidden ? true : !f.hidden
  );
  const extents = computeExtents(features);
  const drawWidth = pageWidth - margin * 2;
  // Reserve 1 inch at the bottom of the page for the title strip.
  const titleStripHeight = 1.0;
  const drawHeight = pageHeight - margin * 2 - titleStripHeight;
  const xform =
    scaleMode === 'FIXED'
      ? fixedScalePaper(extents, drawWidth, drawHeight, margin, margin + titleStripHeight, fixedScale)
      : fitToPaper(extents, drawWidth, drawHeight, margin, margin + titleStripHeight);

  // ── Render features ──────────────────────────────────────
  pdf.setLineWidth(0.005);
  for (const f of features) {
    drawFeature(pdf, f, doc, xform, samples, plotStyle);
  }

  // ── Title strip ──────────────────────────────────────────
  drawTitleStrip(pdf, doc, pageWidth, margin, titleStripHeight);

  // ── Seal block (top-left of title strip) ─────────────────
  drawSealBlock(pdf, doc, pageWidth, margin, titleStripHeight);

  const blob = pdf.output('blob');
  const filename = `${kebabCase(doc.name) || 'drawing'}.pdf`;
  return { blob, filename, byteSize: blob.size };
}

/**
 * Browser-side wrapper that triggers an anchor-click download.
 * Returns the same shape as `exportToPdf` so callers can log a
 * confirmation toast.
 */
export function downloadPdf(
  doc: DrawingDocument,
  options: PdfExportOptions = {}
): PdfExportResult {
  const result = exportToPdf(doc, options);
  const url = URL.createObjectURL(result.blob);
  const a = Object.assign(globalThis.document.createElement('a'), {
    href: url,
    download: result.filename,
  });
  a.click();
  URL.revokeObjectURL(url);
  return result;
}

// ────────────────────────────────────────────────────────────
// World → paper transform
// ────────────────────────────────────────────────────────────

interface XForm {
  scale:   number;
  offsetX: number;
  offsetY: number;
  pageHeight: number;
}

function fitToPaper(
  extents: { min: Point2D; max: Point2D },
  drawWidth: number,
  drawHeight: number,
  marginX: number,
  marginYBottom: number
): XForm {
  const worldW = Math.max(0.001, extents.max.x - extents.min.x);
  const worldH = Math.max(0.001, extents.max.y - extents.min.y);
  const scaleX = drawWidth / worldW;
  const scaleY = drawHeight / worldH;
  const scale = Math.min(scaleX, scaleY);
  const renderedW = worldW * scale;
  const renderedH = worldH * scale;
  // Center within the drawable area.
  const offsetX =
    marginX + (drawWidth - renderedW) / 2 - extents.min.x * scale;
  const offsetY =
    marginYBottom + (drawHeight - renderedH) / 2 + extents.min.y * scale;
  return { scale, offsetX, offsetY, pageHeight: 0 };
}

/**
 * Fixed-scale variant: a measured scale (e.g. 1"=50') instead of
 * auto-fit. `fixedScale` is world units per paper inch, so the
 * paper-inches-per-world-unit factor is `1 / fixedScale`. Centers
 * the drawing in the drawable area; the caller is responsible for
 * sizing the page (the writer doesn't split across pages today —
 * a drawing too large to fit at the requested scale simply clips
 * outside the page bounds).
 */
function fixedScalePaper(
  extents: { min: Point2D; max: Point2D },
  drawWidth: number,
  drawHeight: number,
  marginX: number,
  marginYBottom: number,
  fixedScale: number
): XForm {
  const worldW = Math.max(0.001, extents.max.x - extents.min.x);
  const worldH = Math.max(0.001, extents.max.y - extents.min.y);
  const scale = 1 / fixedScale;
  const renderedW = worldW * scale;
  const renderedH = worldH * scale;
  const offsetX =
    marginX + (drawWidth - renderedW) / 2 - extents.min.x * scale;
  const offsetY =
    marginYBottom + (drawHeight - renderedH) / 2 + extents.min.y * scale;
  return { scale, offsetX, offsetY, pageHeight: 0 };
}

function project(p: Point2D, x: XForm): { x: number; y: number } {
  // PDF coordinate origin is the top-left; world Y is up.
  // We compute in "math" space then flip via the page height
  // when drawing. jsPDF's API takes top-left origin, so we
  // convert below using the y-flip trick: yPdf = pageHeight -
  // (offsetY + p.y * scale). Stash that in pageHeight so we
  // don't re-thread it everywhere.
  return {
    x: x.offsetX + p.x * x.scale,
    y: x.pageHeight - (x.offsetY + p.y * x.scale),
  };
}

// ────────────────────────────────────────────────────────────
// Feature renderers
// ────────────────────────────────────────────────────────────

function drawFeature(
  pdf: jsPDF,
  f: Feature,
  doc: DrawingDocument,
  xform: XForm,
  samples: number,
  plotStyle: PdfPlotStyle
): void {
  // Lazy: stash page height once jsPDF is ready.
  if (xform.pageHeight === 0) {
    xform.pageHeight = pdf.internal.pageSize.getHeight();
  }
  const layer = doc.layers[f.layerId];
  applyStroke(pdf, layer?.color ?? '#000000', plotStyle);

  const g = f.geometry;
  switch (f.type) {
    case 'POINT':
      if (g.point) drawPoint(pdf, project(g.point, xform));
      else if (g.start) drawPoint(pdf, project(g.start, xform));
      return;
    case 'LINE':
      if (g.start && g.end) {
        drawLine(pdf, project(g.start, xform), project(g.end, xform));
      }
      return;
    case 'POLYLINE':
      if (g.vertices && g.vertices.length >= 2) {
        drawPolyline(pdf, g.vertices.map((v) => project(v, xform)));
      }
      return;
    case 'POLYGON':
      if (g.circle) {
        drawCircle(pdf, g.circle, xform);
      } else if (g.vertices && g.vertices.length >= 3) {
        drawPolyline(
          pdf,
          [...g.vertices, g.vertices[0]].map((v) => project(v, xform))
        );
      }
      return;
    case 'CIRCLE':
      if (g.circle) drawCircle(pdf, g.circle, xform);
      return;
    case 'ELLIPSE':
      if (g.ellipse) drawEllipse(pdf, g.ellipse, xform, samples);
      return;
    case 'ARC':
      if (g.arc) drawArc(pdf, g.arc, xform, samples);
      return;
    case 'SPLINE':
      if (g.spline) drawSpline(pdf, g.spline, xform, samples);
      return;
    case 'MIXED_GEOMETRY':
      if (g.vertices && g.vertices.length >= 2) {
        drawPolyline(pdf, g.vertices.map((v) => project(v, xform)));
      }
      return;
    default:
      return;
  }
}

function drawPoint(pdf: jsPDF, p: { x: number; y: number }): void {
  const r = 0.02;
  pdf.circle(p.x, p.y, r, 'S');
}

function drawLine(
  pdf: jsPDF,
  a: { x: number; y: number },
  b: { x: number; y: number }
): void {
  pdf.line(a.x, a.y, b.x, b.y);
}

function drawPolyline(
  pdf: jsPDF,
  pts: { x: number; y: number }[]
): void {
  for (let i = 0; i + 1 < pts.length; i += 1) {
    pdf.line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
  }
}

function drawCircle(pdf: jsPDF, c: CircleGeometry, x: XForm): void {
  const center = project(c.center, x);
  pdf.circle(center.x, center.y, c.radius * x.scale, 'S');
}

function drawEllipse(
  pdf: jsPDF,
  e: EllipseGeometry,
  x: XForm,
  samples: number
): void {
  const pts: Point2D[] = [];
  const cosR = Math.cos(e.rotation);
  const sinR = Math.sin(e.rotation);
  for (let i = 0; i <= samples; i += 1) {
    const t = (i / samples) * Math.PI * 2;
    const px = e.radiusX * Math.cos(t);
    const py = e.radiusY * Math.sin(t);
    pts.push({
      x: e.center.x + px * cosR - py * sinR,
      y: e.center.y + px * sinR + py * cosR,
    });
  }
  drawPolyline(pdf, pts.map((p) => project(p, x)));
}

function drawArc(
  pdf: jsPDF,
  a: ArcGeometry,
  x: XForm,
  samples: number
): void {
  let span = a.endAngle - a.startAngle;
  if (a.anticlockwise && span < 0) span += Math.PI * 2;
  if (!a.anticlockwise && span > 0) span -= Math.PI * 2;
  const pts: Point2D[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = a.startAngle + (span * i) / samples;
    pts.push({
      x: a.center.x + a.radius * Math.cos(t),
      y: a.center.y + a.radius * Math.sin(t),
    });
  }
  drawPolyline(pdf, pts.map((p) => project(p, x)));
}

function drawSpline(
  pdf: jsPDF,
  s: SplineGeometry,
  x: XForm,
  samples: number
): void {
  const samplesPerCurve = Math.max(2, Math.floor(samples / 2));
  const cps = s.controlPoints;
  const pts: Point2D[] = [];
  for (let i = 0; i + 3 < cps.length; i += 3) {
    const p0 = cps[i];
    const p1 = cps[i + 1];
    const p2 = cps[i + 2];
    const p3 = cps[i + 3];
    if (pts.length === 0) pts.push(p0);
    for (let j = 1; j <= samplesPerCurve; j += 1) {
      const t = j / samplesPerCurve;
      pts.push(cubicBezier(p0, p1, p2, p3, t));
    }
  }
  if (pts.length < 2) return;
  drawPolyline(pdf, pts.map((p) => project(p, x)));
}

// ────────────────────────────────────────────────────────────
// Title strip + seal
// ────────────────────────────────────────────────────────────

function drawTitleStrip(
  pdf: jsPDF,
  doc: DrawingDocument,
  pageWidth: number,
  margin: number,
  stripHeight: number
): void {
  const tb = doc.settings.titleBlock;
  const stripTop = pdf.internal.pageSize.getHeight() - margin - stripHeight;
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.01);
  pdf.rect(margin, stripTop, pageWidth - margin * 2, stripHeight, 'S');

  // Right-half: project / surveyor / scale / date
  const rightX = pageWidth - margin - 4;
  pdf.setFontSize(11);
  pdf.text(
    tb.projectName || doc.name || 'Drawing',
    rightX,
    stripTop + 0.25
  );
  pdf.setFontSize(8);
  let y = stripTop + 0.45;
  if (tb.firmName) {
    pdf.text(tb.firmName, rightX, y);
    y += 0.16;
  }
  if (tb.surveyorName) {
    const license = tb.surveyorLicense ? ` (RPLS #${tb.surveyorLicense})` : '';
    pdf.text(`${tb.surveyorName}${license}`, rightX, y);
    y += 0.16;
  }
  if (tb.scaleLabel) {
    pdf.text(`Scale: ${tb.scaleLabel}`, rightX, y);
    y += 0.16;
  }
  if (tb.surveyDate) {
    pdf.text(`Date: ${tb.surveyDate}`, rightX, y);
    y += 0.16;
  }
  if (tb.projectNumber) {
    pdf.text(`Job #: ${tb.projectNumber}`, rightX, y);
  }
}

function drawSealBlock(
  pdf: jsPDF,
  doc: DrawingDocument,
  pageWidth: number,
  margin: number,
  stripHeight: number
): void {
  const seal = doc.settings.sealData;
  if (!seal) return;
  const stripTop = pdf.internal.pageSize.getHeight() - margin - stripHeight;
  const blockX = margin + 0.1;
  const blockY = stripTop + 0.1;
  const blockW = 2.4;
  const blockH = stripHeight - 0.2;

  pdf.setLineWidth(0.005);
  pdf.rect(blockX, blockY, blockW, blockH, 'S');

  if (seal.sealImage && seal.sealImage.startsWith('data:image/')) {
    try {
      pdf.addImage(seal.sealImage, blockX + 0.1, blockY + 0.1, 1.0, 1.0);
    } catch {
      // Fall through to text-only seal if jsPDF can't decode.
    }
  }

  pdf.setFontSize(8);
  const textX = blockX + 1.2;
  let y = blockY + 0.25;
  pdf.text('OFFICIAL SEAL', textX, y);
  y += 0.16;
  pdf.text(seal.rplsName, textX, y);
  y += 0.14;
  pdf.text(`RPLS #${seal.rplsLicense} (${seal.state})`, textX, y);
  y += 0.14;
  pdf.text(`Sealed: ${seal.sealedAt.slice(0, 19)}`, textX, y);
  y += 0.14;
  pdf.setFontSize(6);
  pdf.text(`Hash: ${seal.signatureHash.slice(0, 16)}…`, textX, y);
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function applyStroke(
  pdf: jsPDF,
  hex: string,
  plotStyle: PdfPlotStyle = 'AS_DISPLAYED'
): void {
  const cleaned = (hex ?? '').replace('#', '').trim();
  if (cleaned.length !== 6) {
    pdf.setDrawColor(0, 0, 0);
    return;
  }
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  if (![r, g, b].every((n) => Number.isFinite(n))) {
    pdf.setDrawColor(0, 0, 0);
    return;
  }
  switch (plotStyle) {
    case 'MONOCHROME':
      // Pure black for plotters that print bitmap b/w. The
      // surveyor's intent: "ignore on-screen color hierarchy,
      // just give me ink-on-paper." We hard-clamp instead of
      // luminance-mapping because a faint yellow line on screen
      // (e.g. a TBM marker) should still print solidly visible.
      pdf.setDrawColor(0, 0, 0);
      return;
    case 'GRAYSCALE': {
      // ITU-R BT.601 luma coefficients — preserves the
      // perceived brightness hierarchy across hue changes so
      // major features (typically darker layer colors) stay
      // visually dominant in a black-only plot.
      const luma = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      pdf.setDrawColor(luma, luma, luma);
      return;
    }
    case 'AS_DISPLAYED':
    default:
      pdf.setDrawColor(r, g, b);
      return;
  }
}

function computeExtents(features: Feature[]): { min: Point2D; max: Point2D } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of features) {
    walkPoints(f, (p) => {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    });
  }
  if (!Number.isFinite(minX)) {
    return { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } };
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

function walkPoints(f: Feature, visit: (p: Point2D) => void): void {
  const g = f.geometry;
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

function kebabCase(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
