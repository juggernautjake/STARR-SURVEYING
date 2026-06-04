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
  Layer,
  Point2D,
  SplineGeometry,
} from '../types';
import { PAPER_DIMENSIONS } from '../templates/types';
import { resolveLineTypeWithFallback } from '../styles/linetype-library';

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
  // cad-survey-print-pdf Slice 1 — always plot at a measured scale: the
  // user's FIXED scale, or (FIT_TO_PAGE) the nearest ROUND engineering
  // scale that fits, so the PDF measures to a clean 1"=N' like a real
  // plat. Both paths center the drawing in the drawable area.
  const effectiveScale =
    scaleMode === 'FIXED' ? fixedScale : roundPlotScale(extents, drawWidth, drawHeight);
  const xform = fixedScalePaper(
    extents, drawWidth, drawHeight, margin, margin + titleStripHeight, effectiveScale,
  );

  // ── Render features ──────────────────────────────────────
  pdf.setLineWidth(0.005);
  for (const f of features) {
    drawFeature(pdf, f, doc, xform, samples, plotStyle);
  }
  // Reset to solid so the framing/title furniture below isn't dashed.
  pdf.setLineDashPattern([], 0);

  // ── Title strip ──────────────────────────────────────────
  drawTitleStrip(pdf, doc, pageWidth, margin, titleStripHeight, effectiveScale);

  // ── Seal block (top-left of title strip) ─────────────────
  drawSealBlock(pdf, doc, pageWidth, margin, titleStripHeight);

  // ── North arrow (top-right) + graphic scale bar (bottom-left) ─
  // Honor the on-screen title-block visibility toggles so a hidden
  // element doesn't reappear in the PDF.
  const tb = doc.settings.titleBlock;
  if (tb?.northArrowVisible !== false) {
    drawNorthArrow(
      pdf,
      pageWidth - margin - 0.55,
      margin + 0.6,
      Math.max(0.5, tb?.northArrowSizeIn ?? 0.9),
      doc.settings.drawingRotationDeg ?? 0,
    );
  }
  if (tb?.scaleBarVisible !== false) {
    drawScaleBar(pdf, margin + 0.35, pageHeight - margin - titleStripHeight - 0.4, effectiveScale);
  }

  // ── Heavy frame border (drawn last so it sits on top) ────
  drawBorder(pdf, pageWidth, pageHeight, margin);

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

// cad-survey-print-pdf Slice 1 — classic plats are plotted at a ROUND
// engineering scale (1"=10/20/.../200'), never an odd fit ratio. Given
// the drawable area + data extents, pick the smallest standard scale at
// which the drawing still fits. Returns world-units (ft) per paper inch.
const ENGINEERING_SCALES = [
  10, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 1000, 2000,
];
export function roundPlotScale(
  extents: { min: Point2D; max: Point2D },
  drawWidth: number,
  drawHeight: number,
): number {
  const worldW = Math.max(0.001, extents.max.x - extents.min.x);
  const worldH = Math.max(0.001, extents.max.y - extents.min.y);
  // paper-inches per world-unit that would exactly fit:
  const fitScale = Math.min(drawWidth / worldW, drawHeight / worldH);
  const needed = 1 / fitScale; // world-units per paper inch to just fit
  for (const s of ENGINEERING_SCALES) if (s >= needed) return s;
  return Math.ceil(needed / 1000) * 1000;
}

/** cad-survey-print-pdf Slice 1 — heavy frame border inset from the
 *  sheet trim edge (classic plat look). */
function drawBorder(pdf: jsPDF, pageWidth: number, pageHeight: number, inset: number): void {
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.02); // ~0.5mm heavy frame
  pdf.rect(inset, inset, pageWidth - inset * 2, pageHeight - inset * 2);
}

/** cad-survey-print-pdf Slice 2 — a slim filled north arrow + "N",
 *  pointing to true north (up, minus the drawing's plot rotation).
 *  Centered at (cx, cy) in paper inches; `sizeIn` is the arrow height. */
function drawNorthArrow(pdf: jsPDF, cx: number, cy: number, sizeIn: number, rotationDeg: number): void {
  const h = sizeIn;
  const w = sizeIn * 0.42;
  const rot = (-rotationDeg * Math.PI) / 180; // CW-on-screen → CCW math, north = up
  const rotate = (dx: number, dy: number) => ({
    // dy negative = up; PDF y is down so we add the rotated dy.
    x: cx + dx * Math.cos(rot) - dy * Math.sin(rot),
    y: cy + dx * Math.sin(rot) + dy * Math.cos(rot),
  });
  const tip = rotate(0, -h / 2);
  const bl = rotate(-w / 2, h / 2);
  const br = rotate(w / 2, h / 2);
  const mid = rotate(0, h * 0.18); // notch so the two halves read distinctly
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.008);
  // Left half filled black, right half outline — the classic two-tone arrow.
  pdf.setFillColor(0, 0, 0);
  pdf.triangle(tip.x, tip.y, bl.x, bl.y, mid.x, mid.y, 'F');
  pdf.triangle(tip.x, tip.y, br.x, br.y, mid.x, mid.y, 'S');
  // "N" above the tip.
  const label = rotate(0, -h / 2 - 0.14);
  pdf.setFontSize(11);
  pdf.setTextColor(0, 0, 0);
  pdf.text('N', label.x, label.y, { align: 'center' });
}

/** cad-survey-print-pdf Slice 2 — checkered graphic bar scale + tick
 *  labels + the written scale. `plotScale` = world-ft per paper inch. */
function drawScaleBar(pdf: jsPDF, x: number, y: number, plotScale: number): void {
  const barLenIn = 2.0;
  const segs = 4;
  const segIn = barLenIn / segs;
  const segFt = segIn * plotScale; // feet per segment
  const barH = 0.09;
  pdf.setDrawColor(0, 0, 0);
  pdf.setTextColor(0, 0, 0);
  // Written scale above the bar.
  pdf.setFontSize(9);
  pdf.text(`1" = ${plotScale}'`, x, y - 0.08);
  // Checkered segments.
  pdf.setLineWidth(0.006);
  for (let i = 0; i < segs; i++) {
    const sx = x + i * segIn;
    if (i % 2 === 0) {
      pdf.setFillColor(0, 0, 0);
      pdf.rect(sx, y, segIn, barH, 'F');
    } else {
      pdf.rect(sx, y, segIn, barH, 'S');
    }
  }
  pdf.rect(x, y, barLenIn, barH, 'S'); // outer border
  // Tick labels under each boundary.
  pdf.setFontSize(7);
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(0));
  for (let i = 0; i <= segs; i++) {
    pdf.text(fmt(i * segFt), x + i * segIn, y + barH + 0.12, { align: 'center' });
  }
  pdf.setFontSize(7);
  pdf.text('FEET', x + barLenIn + 0.1, y + barH);
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

// cad-survey-print-pdf Slice 4 — line-weight hierarchy + line types.
// Layer/feature `lineWeight` is authored in MILLIMETRES (classic CAD
// convention: border ~0.70, boundary ~0.50, buildings ~0.35, interior
// /tie ~0.18–0.25), so the PDF maps mm → paper inches and the plat reads
// with the same emphasis the surveyor set on screen. Dash patterns are
// authored in WORLD FEET, so they convert to paper inches through the
// plot scale (`xform.scale` = paper-inches per world-unit).
const MM_PER_INCH = 25.4;
// ~0.13mm floor so the lightest tie line still prints as a crisp hairline.
const MIN_PLOT_WEIGHT_IN = 0.005;

/** Resolve a feature's plotted stroke width in paper inches from the
 *  feature override → layer weight hierarchy (millimetres). */
function resolvePlotWeightIn(feature: Feature, layer: Layer | undefined): number {
  const mm = feature.style.lineWeight ?? layer?.lineWeight ?? 0.5;
  return Math.max(MIN_PLOT_WEIGHT_IN, mm / MM_PER_INCH);
}

/** Resolve a feature's dash pattern (paper inches) from its effective
 *  line type, or null when it plots solid. Inline-symbol line types
 *  (fences/utilities) that carry no dash plot solid here — their glyphs
 *  are a later slice; the legend names them. */
function resolveDashPatternIn(
  feature: Feature,
  layer: Layer | undefined,
  doc: DrawingDocument,
  xform: XForm,
): number[] | null {
  const id = feature.style.lineTypeId ?? layer?.lineTypeId ?? 'SOLID';
  if (!id || id === 'SOLID') return null;
  const lt = resolveLineTypeWithFallback(id, doc.customLineTypes ?? []);
  if (!lt.dashPattern || lt.dashPattern.length === 0) return null;
  return lt.dashPattern.map((d) => Math.max(0.002, d * xform.scale));
}

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

  // cad-survey-print-pdf Slice 4 — set the plotted weight + dash per
  // feature so the plat reads with proper emphasis. Points draw solid
  // (a dashed monument dot is nonsensical); everything else honors the
  // line type's dash rhythm.
  pdf.setLineWidth(resolvePlotWeightIn(f, layer));
  const dash = f.type === 'POINT' ? null : resolveDashPatternIn(f, layer, doc, xform);
  pdf.setLineDashPattern(dash ?? [], 0);

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
  stripHeight: number,
  // cad-survey-print-pdf Slice 1 — the actual plotted scale (world-ft
  // per paper inch) so the title block shows the true "1\" = N'".
  plotScale?: number,
): void {
  const tb = doc.settings.titleBlock;
  const stripTop = pdf.internal.pageSize.getHeight() - margin - stripHeight;
  pdf.setDrawColor(0, 0, 0);
  pdf.setTextColor(0, 0, 0);
  pdf.setLineWidth(0.012);
  pdf.rect(margin, stripTop, pageWidth - margin * 2, stripHeight, 'S');

  // cad-survey-print-pdf Slice 3 — classic title block in the right
  // ~4.2in column (the seal block owns the left). Vertical divider so
  // it reads as a tombstone block.
  const blockW = 4.2;
  const blockX = pageWidth - margin - blockW;
  pdf.setLineWidth(0.006);
  pdf.line(blockX, stripTop, blockX, stripTop + stripHeight);
  const tx = blockX + 0.12;

  // Drawing title — ALL CAPS, largest text (the classic plat header).
  const surveyType = (tb.surveyType || 'BOUNDARY SURVEY').toUpperCase();
  const title = tb.projectName ? `${surveyType} OF ${tb.projectName.toUpperCase()}` : surveyType;
  pdf.setFontSize(11);
  pdf.text(title, tx, stripTop + 0.2, { maxWidth: blockW - 0.24 });
  // Underline under the title.
  pdf.setLineWidth(0.006);
  pdf.line(blockX, stripTop + 0.3, pageWidth - margin, stripTop + 0.3);

  // Firm + surveyor.
  let y = stripTop + 0.46;
  if (tb.firmName) {
    pdf.setFontSize(9);
    pdf.text(tb.firmName, tx, y);
    y += 0.15;
  }
  if (tb.surveyorName) {
    const license = tb.surveyorLicense ? `, RPLS #${tb.surveyorLicense}` : '';
    pdf.setFontSize(8);
    pdf.text(`${tb.surveyorName}${license}`, tx, y);
    y += 0.15;
  }

  // Bottom field grid: two label/value columns.
  const scaleText = plotScale ? `1" = ${plotScale}'` : (tb.scaleLabel || '');
  const sheet = tb.sheetNumber
    ? `${tb.sheetNumber}${tb.totalSheets ? ` OF ${tb.totalSheets}` : ''}`
    : '';
  const fields: Array<[string, string]> = [
    ['CLIENT', tb.clientName],
    ['JOB NO.', tb.projectNumber],
    ['DATE', tb.surveyDate],
    ['SCALE', scaleText],
    ['SHEET', sheet],
  ].filter(([, v]) => v && String(v).trim().length > 0) as Array<[string, string]>;
  pdf.setFontSize(6.5);
  const colW = (blockW - 0.24) / 2;
  fields.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const fx = tx + col * colW;
    const fy = y + row * 0.14;
    pdf.text(`${label}: ${value}`, fx, fy, { maxWidth: colW - 0.05 });
  });
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
