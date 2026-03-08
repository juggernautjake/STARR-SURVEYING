// lib/cad/templates/print-engine.ts — Print transform and configuration
import type { PrintConfig, TitleBlockTemplateConfig, DrawableArea } from './types';
import type { CompanyInfo } from './types';

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  paperSize: 'TABLOID',
  orientation: 'LANDSCAPE',
  scale: 50,
  scaleMode: 'FIXED',
  printArea: 'EXTENTS',
  windowBounds: null,
  centerOnPage: true,
  plotStyle: 'AS_DISPLAYED',
  lineWeightScale: 1.0,
  layerOverrides: {},
  printBorder: true,
  printTitleBlock: true,
  printNorthArrow: true,
  printScaleBar: true,
  printLegend: false,
  printCertification: true,
  printNotes: true,
  output: 'PDF',
  dpi: 300,
  pdfCompression: true,
};

export interface FeatureExtents {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PrintTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

/**
 * Compute the world-to-paper transform so that the survey features fit inside
 * the drawable area at the requested scale, optionally centered on the page.
 *
 * Returns paper-space offset (in inches) and the effective scale factor
 * (paper inches per world unit).
 */
export function computePrintTransform(
  drawableArea: DrawableArea,
  featureExtents: FeatureExtents,
  scale: number,
  centerOnPage: boolean,
): PrintTransform {
  // scale = world units per paper inch  →  paperInches = worldUnits / scale
  const effectiveScale = 1 / scale; // paper inches per world unit

  const contentWidth  = (featureExtents.maxX - featureExtents.minX) * effectiveScale;
  const contentHeight = (featureExtents.maxY - featureExtents.minY) * effectiveScale;

  let offsetX = drawableArea.x;
  let offsetY = drawableArea.y;

  if (centerOnPage) {
    offsetX += (drawableArea.width  - contentWidth)  / 2;
    offsetY += (drawableArea.height - contentHeight) / 2;
  }

  return { offsetX, offsetY, scale: effectiveScale };
}

/**
 * Build the PDF/export title string from title block fields and company info.
 */
export function buildPrintTitle(
  config: TitleBlockTemplateConfig,
  company: CompanyInfo,
): string {
  const parts: string[] = [];
  if (company.name)                        parts.push(company.name);
  if (config.fields.projectName)           parts.push(config.fields.projectName);
  if (config.fields.sheetTitle)            parts.push(config.fields.sheetTitle);
  if (config.fields.sheetNumber)           parts.push(`Sheet ${config.fields.sheetNumber}`);
  return parts.join(' — ');
}
