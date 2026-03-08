// lib/cad/templates/sheet-border.ts — Sheet border and drawable area calculations
import type { PaperSize, BorderTemplateConfig, TitleBlockTemplateConfig, DrawableArea } from './types';
import { PAPER_DIMENSIONS } from './types';

export const DEFAULT_BORDER_CONFIG: BorderTemplateConfig = {
  visible: true,
  style: 'DOUBLE',
  outerWeight: 0.5,
  innerWeight: 0.25,
  spacing: 0.125,
  tickMarks: false,
};

/**
 * Compute the bounds of the title block element in paper-inch coordinates
 * (origin at bottom-left of paper).
 */
export function computeTitleBlockBounds(
  config: TitleBlockTemplateConfig,
  paperSize: PaperSize,
  orientation: 'PORTRAIT' | 'LANDSCAPE',
): { x: number; y: number; width: number; height: number } {
  if (config.position === 'CUSTOM' && config.customBounds) {
    return config.customBounds;
  }

  const dims = PAPER_DIMENSIONS[paperSize];
  const pw = orientation === 'LANDSCAPE' ? dims.height : dims.width;
  const ph = orientation === 'LANDSCAPE' ? dims.width  : dims.height;

  switch (config.position) {
    case 'BOTTOM_RIGHT':
      return { x: pw - 3.5, y: 0, width: 3.5, height: 4.0 };

    case 'RIGHT_STRIP':
      return { x: pw - 2.0, y: 0, width: 2.0, height: ph };

    case 'BOTTOM_STRIP':
      return { x: 0, y: 0, width: pw, height: 2.0 };

    default:
      return { x: pw - 3.5, y: 0, width: 3.5, height: 4.0 };
  }
}

/**
 * Compute the drawable area (where survey content is placed) after accounting for
 * margins and the title block footprint.
 */
export function computeDrawableArea(
  paperSize: PaperSize,
  orientation: 'PORTRAIT' | 'LANDSCAPE',
  margins: { top: number; right: number; bottom: number; left: number },
  titleBlockBounds: { x: number; y: number; width: number; height: number } | null,
): DrawableArea {
  const dims = PAPER_DIMENSIONS[paperSize];
  const pw = orientation === 'LANDSCAPE' ? dims.height : dims.width;
  const ph = orientation === 'LANDSCAPE' ? dims.width  : dims.height;

  let x = margins.left;
  let y = margins.bottom;
  let width = pw - margins.left - margins.right;
  let height = ph - margins.bottom - margins.top;

  if (titleBlockBounds) {
    // Reduce the drawable area to avoid the title block
    const tbRight = titleBlockBounds.x + titleBlockBounds.width;
    const tbTop   = titleBlockBounds.y + titleBlockBounds.height;

    // Check if title block is on the right strip
    if (titleBlockBounds.x > pw / 2 && titleBlockBounds.height > ph * 0.5) {
      // Right strip — clip the right edge
      width = Math.max(0, titleBlockBounds.x - margins.left - 0.25);
    } else if (titleBlockBounds.y < ph * 0.25 && titleBlockBounds.width > pw * 0.5) {
      // Bottom strip — clip the bottom edge
      y = tbTop + 0.25;
      height = Math.max(0, ph - margins.top - y);
    } else if (titleBlockBounds.x > pw / 2) {
      // Bottom-right corner — clip the right edge
      width = Math.max(0, titleBlockBounds.x - margins.left - 0.25);
    }
  }

  return { x, y, width, height };
}
