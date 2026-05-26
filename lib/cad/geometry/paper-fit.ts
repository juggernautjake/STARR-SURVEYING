// lib/cad/geometry/paper-fit.ts
//
// Position + scale the paper sheet so a set of survey coordinates lands
// centered on the page. Survey features are stored at raw state-plane
// coordinates (easting/northing, often in the millions) while the paper
// frame defaults to world origin (0,0) — so freshly imported points
// render far off the sheet. After an import we recenter the paper under
// the points' bounding box and pick an engineering scale that fits them
// on the page with a margin.
//
// Pure + framework-free so it is unit-testable.
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md

import { PAPER_DIMENSIONS, type PaperSize } from '../templates/types';

export interface BoundsXY {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// Common US engineering scales (feet represented by one paper inch).
export const ENGINEERING_SCALES = [
  10, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 800, 1000,
  2000, 5000,
];

export interface PaperFit {
  drawingScale: number;
  paperOrigin: { x: number; y: number };
}

/**
 * Compute a paper origin + drawing scale that centers `bounds` on the
 * sheet with `marginFrac` clear on every edge.
 *
 * @param bounds      world-space bounding box of the content (feet)
 * @param paperSize   sheet size key
 * @param orientation PORTRAIT swaps to LANDSCAPE by transposing W/H
 * @param marginFrac  fraction of each paper dimension to keep clear
 *                    (0.15 ⇒ content uses the middle 70%)
 */
export function fitPaperToBounds(
  bounds: BoundsXY,
  paperSize: PaperSize,
  orientation: 'PORTRAIT' | 'LANDSCAPE',
  marginFrac = 0.15,
): PaperFit {
  const dim = PAPER_DIMENSIONS[paperSize] ?? PAPER_DIMENSIONS.TABLOID;
  let widthIn = dim.width;
  let heightIn = dim.height;
  if (orientation === 'LANDSCAPE') [widthIn, heightIn] = [heightIn, widthIn];

  const bw = Math.max(0, bounds.maxX - bounds.minX);
  const bh = Math.max(0, bounds.maxY - bounds.minY);

  const usableW = widthIn * (1 - 2 * marginFrac);
  const usableH = heightIn * (1 - 2 * marginFrac);

  // Feet-per-inch needed so the content fits the usable area on both axes.
  const needed = Math.max(bw / usableW, bh / usableH, 0);
  const drawingScale =
    needed <= 0
      ? ENGINEERING_SCALES[0]
      : ENGINEERING_SCALES.find((s) => s >= needed) ??
        Math.ceil(needed / 1000) * 1000;

  const paperW = widthIn * drawingScale;
  const paperH = heightIn * drawingScale;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;

  return {
    drawingScale,
    paperOrigin: { x: cx - paperW / 2, y: cy - paperH / 2 },
  };
}

/** Bounding box of a list of {easting, northing} points, or null if empty. */
export function boundsOfPoints(
  pts: Array<{ easting: number; northing: number }>,
): BoundsXY | null {
  if (pts.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.easting < minX) minX = p.easting;
    if (p.easting > maxX) maxX = p.easting;
    if (p.northing < minY) minY = p.northing;
    if (p.northing > maxY) maxY = p.northing;
  }
  return { minX, minY, maxX, maxY };
}
