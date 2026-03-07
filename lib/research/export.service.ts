// lib/research/export.service.ts — PNG, PDF, and DXF export for rendered drawings
// Implements Phase 12 export formats on top of the existing SVG renderer.
//
// PNG  — SVG → sharp (resvg-js for Node) → 300-DPI PNG
// PDF  — SVG embedded in jsPDF page with paper-size auto-detection
// DXF  — geometry elements mapped to AutoCAD layers via dxf-writer

import type { RenderedDrawing, DrawingElement, ViewMode, FeatureClass, ElementGeometry } from '@/types/research';
import { renderDrawingSVG } from './svg.renderer';

// ── DPI constant ────────────────────────────────────────────────────────────
const EXPORT_DPI = 300;
const POINTS_PER_INCH = 72; // PDF points

// ── PNG Export ──────────────────────────────────────────────────────────────

/**
 * Render a drawing as a 300-DPI PNG.
 * Uses @resvg/resvg-js which is already installed in the project.
 */
export async function renderToPng(
  drawing: RenderedDrawing,
  elements: DrawingElement[],
  viewMode: ViewMode = 'standard',
  showTitleBlock = true
): Promise<Buffer> {
  const svg = renderDrawingSVG(drawing, elements, viewMode, {
    showTitleBlock,
    showNorthArrow: true,
    showScaleBar: true,
    showLegend: viewMode === 'feature',
    showConfidenceBar: viewMode === 'confidence',
    interactive: false,
  });

  // Determine pixel dimensions at 300 DPI
  const { width, height } = drawing.canvas_config;
  // Canvas dimensions are in SVG user units — treat them as points at 1:1 mapping
  // then scale by DPI/72 for print resolution
  const scaleFactor = EXPORT_DPI / POINTS_PER_INCH;
  const pxWidth = Math.round(width * scaleFactor);
  const pxHeight = Math.round(height * scaleFactor);

  // @resvg/resvg-js is already in the dependency list and provides high-quality
  // SVG rasterization without needing a browser.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Resvg } = require('@resvg/resvg-js') as typeof import('@resvg/resvg-js');

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: pxWidth },
    font: { loadSystemFonts: false },
    dpi: EXPORT_DPI,
  });

  const rendered = resvg.render();
  const png = rendered.asPng();
  return Buffer.from(png);
}

// ── PDF Export ──────────────────────────────────────────────────────────────

/**
 * Render a drawing as a print-ready PDF.
 * Uses jsPDF with the SVG embedded as a vector page.
 */
export async function renderToPdf(
  drawing: RenderedDrawing,
  elements: DrawingElement[],
  viewMode: ViewMode = 'standard',
  showTitleBlock = true
): Promise<Buffer> {
  const svg = renderDrawingSVG(drawing, elements, viewMode, {
    showTitleBlock,
    showNorthArrow: true,
    showScaleBar: true,
    showLegend: viewMode === 'feature',
    showConfidenceBar: viewMode === 'confidence',
    interactive: false,
  });

  const { width, height } = drawing.canvas_config;

  // Convert SVG user units (assumed to be points) to inches, then to PDF points
  // jsPDF uses points (1/72 inch) internally.
  const pageWidth = width;
  const pageHeight = height;

  // Determine paper orientation
  const orientation: 'landscape' | 'portrait' = width >= height ? 'landscape' : 'portrait';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { jsPDF } = require('jspdf') as typeof import('jspdf');

  const doc = new jsPDF({
    orientation,
    unit: 'pt',
    format: [pageWidth, pageHeight],
    compress: true,
  });

  // jsPDF addSvgAsImage requires a PNG/JPEG — embed as SVG via addSvgAsImage
  // Alternatively, use the svg2pdf.js plugin. For maximum compatibility and
  // since we already have @resvg/resvg-js, rasterize the SVG first then embed.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Resvg } = require('@resvg/resvg-js') as typeof import('@resvg/resvg-js');

  const scaleFactor = EXPORT_DPI / POINTS_PER_INCH;
  const pxWidth = Math.round(width * scaleFactor);

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: pxWidth },
    font: { loadSystemFonts: false },
    dpi: EXPORT_DPI,
  });

  const rendered = resvg.render();
  const pngData = Buffer.from(rendered.asPng()).toString('base64');
  const pngDataUrl = `data:image/png;base64,${pngData}`;

  doc.addImage(pngDataUrl, 'PNG', 0, 0, pageWidth, pageHeight);

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

// ── DXF Export ──────────────────────────────────────────────────────────────

/** Map feature classes to AutoCAD layer names (per PLAN.md §12.3) */
function featureClassToLayer(fc: FeatureClass): string {
  const map: Partial<Record<FeatureClass, string>> = {
    property_boundary: 'BOUNDARY',
    lot_line:          'BOUNDARY',
    easement:          'EASEMENT',
    setback:           'SETBACK',
    right_of_way:      'ROW',
    road:              'ROW',
    centerline:        'ROW',
    building:          'BUILDING',
    concrete:          'BUILDING',
    fence:             'FENCE',
    utility:           'UTILITY',
    water_feature:     'WATER',
    tree_line:         'VEGETATION',
    contour:           'CONTOUR',
    monument:          'MONUMENT',
    control_point:     'MONUMENT',
    annotation:        'LABELS',
    title_block:       'LABELS',
    other:             'MISC',
  };
  return map[fc] ?? 'MISC';
}

/** AutoCAD color indices for each layer (standard ACI color table) */
function layerColor(layer: string): number {
  const colors: Record<string, number> = {
    BOUNDARY:   7,  // white
    EASEMENT:   1,  // red
    SETBACK:    5,  // blue
    ROW:        8,  // gray
    BUILDING:   4,  // cyan
    FENCE:      3,  // green
    UTILITY:    6,  // magenta
    WATER:      5,  // blue
    VEGETATION: 3,  // green
    CONTOUR:    8,  // gray
    MONUMENT:   1,  // red
    LABELS:     7,  // white
    MISC:       8,  // gray
  };
  return colors[layer] ?? 7;
}

/**
 * Render a drawing as an AutoCAD-compatible DXF file.
 * Uses dxf-writer (already installed) with feature-class → layer mapping.
 */
export function renderToDxf(
  drawing: RenderedDrawing,
  elements: DrawingElement[]
): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DxfWriter = require('dxf-writer') as { new(): DxfWriterInstance };

  const dxf: DxfWriterInstance = new DxfWriter();

  // Register all layers up front
  const layers = [
    'BOUNDARY', 'EASEMENT', 'SETBACK', 'ROW', 'BUILDING',
    'FENCE', 'UTILITY', 'WATER', 'VEGETATION', 'CONTOUR',
    'MONUMENT', 'LABELS', 'MISC',
  ];
  for (const layer of layers) {
    dxf.addLayer(layer, layerColor(layer), 'CONTINUOUS');
  }

  const { origin } = drawing.canvas_config;
  const [ox, oy] = origin;

  for (const element of elements) {
    if (!element.visible) continue;

    const layer = featureClassToLayer(element.feature_class);
    const geo: ElementGeometry = element.geometry;

    switch (geo.type) {
      case 'line': {
        const [x0, y0] = geo.start;
        const [x1, y1] = geo.end;
        dxf.setActiveLayer(layer);
        dxf.drawLine(x0 - ox, y0 - oy, 0, x1 - ox, y1 - oy, 0);
        break;
      }

      case 'polygon': {
        const pts = geo.points;
        if (pts.length < 2) break;
        dxf.setActiveLayer(layer);
        for (let i = 0; i < pts.length; i++) {
          const [ax, ay] = pts[i];
          const [bx, by] = pts[(i + 1) % pts.length];
          dxf.drawLine(ax - ox, ay - oy, 0, bx - ox, by - oy, 0);
        }
        break;
      }

      case 'curve': {
        const [cx, cy] = geo.center;
        const r = geo.radius;
        const startDeg = (geo.startAngle * 180) / Math.PI;
        const endDeg = (geo.endAngle * 180) / Math.PI;
        dxf.setActiveLayer(layer);
        dxf.drawArc(cx - ox, cy - oy, 0, r, startDeg, endDeg);
        break;
      }

      case 'point': {
        const [px, py] = geo.position;
        dxf.setActiveLayer(layer);
        dxf.drawPoint(px - ox, py - oy, 0);
        break;
      }

      case 'label': {
        const [lx, ly] = geo.position;
        const text = String(element.attributes?.text ?? '');
        const fontSize = element.style?.fontSize ?? 12;
        if (text) {
          dxf.setActiveLayer('LABELS');
          dxf.drawText(lx - ox, ly - oy, 0, fontSize, 0, text);
        }
        break;
      }

      default:
        // Unsupported geometry type — skip silently
        break;
    }
  }

  const dxfString: string = dxf.toDxfString();
  return Buffer.from(dxfString, 'utf-8');
}

// ── Minimal DxfWriter type stubs (dxf-writer has no bundled @types) ─────────

interface DxfWriterInstance {
  addLayer(name: string, color: number, lineType?: string): this;
  setActiveLayer(name: string): this;
  drawLine(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): this;
  drawArc(cx: number, cy: number, cz: number, r: number, startAngle: number, endAngle: number): this;
  drawPoint(x: number, y: number, z: number): this;
  drawText(x: number, y: number, z: number, textHeight: number, textAngle: number, text: string): this;
  toDxfString(): string;
}
