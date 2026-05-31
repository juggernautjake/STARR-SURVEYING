// lib/cad/io/trv-paper-fit.ts
//
// cad-trv-import-display Slice 3 — pure helper that picks the
// smallest standard paper + engineering scale that fits a given
// world-coordinate bbox, plus the paper-origin needed to center
// the paper on the bbox. Called by the TRV import flow after
// addFeatures so a state-plane survey lands on a sensibly-sized
// sheet at a standard 1" = N' scale.
//
// Pure module: no React, no DOM, no store access. Safe to unit-
// test against synthetic bboxes.

/** The five paper sizes the canvas + render path already recognize.
 *  Numbers are paper inches (width × height) in PORTRAIT. */
export const PAPER_SIZES_IN: Record<PaperSize, [number, number]> = {
  LETTER: [8.5, 11],
  TABLOID: [11, 17],
  ARCH_C: [18, 24],
  ARCH_D: [24, 36],
  ARCH_E: [36, 48],
};

export type PaperSize = 'LETTER' | 'TABLOID' | 'ARCH_C' | 'ARCH_D' | 'ARCH_E';
export type PaperOrientation = 'PORTRAIT' | 'LANDSCAPE';

/** Standard engineering scales (feet per paper inch). The picker
 *  walks these in ascending order and takes the smallest that
 *  fits the bbox on the chosen paper + a margin. */
export const ENGINEERING_SCALES: number[] = [
  1, 5, 10, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500,
  750, 1000, 1500, 2000, 3000, 5000, 10000,
];

/** Axis-aligned bbox in world (screen-y-down) coordinates, matching
 *  what `lib/cad/geometry/bounds.ts` returns. */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PaperFit {
  paperSize: PaperSize;
  paperOrientation: PaperOrientation;
  /** Engineering scale in feet per paper inch (e.g. 50 ⇒ 1" = 50'). */
  drawingScale: number;
  /** World-coordinate bottom-left corner of the paper sheet so the
   *  bbox is centered on it. The canvas's `paperOriginWorld`
   *  setting accepts this verbatim. */
  paperOriginWorld: { x: number; y: number };
  /** Suggested `1" = N'` label for the title block's scaleLabel. */
  scaleLabel: string;
}

export interface FitPaperOpts {
  /** Candidate paper sizes (ordered smallest → largest). Defaults
   *  to the full 5-paper list. */
  candidateSizes?: PaperSize[];
  /** Both orientations are evaluated; supply one to lock the pick. */
  candidateOrientations?: PaperOrientation[];
  /** Margin (paper inches) inside each edge — the bbox must fit
   *  WITHIN paper - 2 * margin on each axis. Default 1" all around
   *  matches the ANSI/ARCH borders we draw. */
  marginIn?: number;
  /** Custom scales. Defaults to ENGINEERING_SCALES. */
  candidateScales?: number[];
}

/** Pick the smallest standard paper + smallest engineering scale
 *  that fits the bbox inside the printable area (paper minus
 *  margins on every edge), with the bbox centered on the sheet.
 *
 *  Returns null when no candidate fits the largest paper at the
 *  largest scale — the caller should fall back to leaving the
 *  paper settings alone + relying on viewport zoom-to-extents. */
export function fitPaperToBounds(bounds: Bounds, opts: FitPaperOpts = {}): PaperFit | null {
  const sizes = opts.candidateSizes ?? (['LETTER', 'TABLOID', 'ARCH_C', 'ARCH_D', 'ARCH_E'] as PaperSize[]);
  const orientations = opts.candidateOrientations ?? (['LANDSCAPE', 'PORTRAIT'] as PaperOrientation[]);
  const margin = opts.marginIn ?? 1;
  const scales = opts.candidateScales ?? ENGINEERING_SCALES;
  const widthWorld = bounds.maxX - bounds.minX;
  const heightWorld = bounds.maxY - bounds.minY;
  if (widthWorld <= 0 || heightWorld <= 0) return null;

  for (const size of sizes) {
    for (const orient of orientations) {
      const [pwBase, phBase] = PAPER_SIZES_IN[size];
      const [paperW, paperH] = orient === 'LANDSCAPE'
        ? [Math.max(pwBase, phBase), Math.min(pwBase, phBase)]
        : [Math.min(pwBase, phBase), Math.max(pwBase, phBase)];
      const printableW = paperW - 2 * margin;
      const printableH = paperH - 2 * margin;
      if (printableW <= 0 || printableH <= 0) continue;
      for (const scale of scales) {
        // Convert printable area to world units at this scale.
        const printableWorldW = printableW * scale;
        const printableWorldH = printableH * scale;
        if (printableWorldW >= widthWorld && printableWorldH >= heightWorld) {
          // Fits — center the bbox on the paper.
          const paperWorldW = paperW * scale;
          const paperWorldH = paperH * scale;
          const centerX = (bounds.minX + bounds.maxX) / 2;
          const centerY = (bounds.minY + bounds.maxY) / 2;
          return {
            paperSize: size,
            paperOrientation: orient,
            drawingScale: scale,
            paperOriginWorld: {
              x: centerX - paperWorldW / 2,
              y: centerY - paperWorldH / 2,
            },
            scaleLabel: `1" = ${scale}'`,
          };
        }
      }
    }
  }
  return null;
}

/** Compute the bbox of a feature set's POINT coords + polyline
 *  vertices + arc/spline control points. A lighter version of
 *  CanvasViewport's onZoomExtents handler — returns null when no
 *  feature has any geometric data. */
export function bboxOfFeaturePoints(
  features: ReadonlyArray<{ geometry: { type: string; point?: { x: number; y: number }; vertices?: Array<{ x: number; y: number }>; spline?: { controlPoints: Array<{ x: number; y: number }> }; arc?: { center: { x: number; y: number }; radius: number }; circle?: { center: { x: number; y: number }; radius: number } } }>,
): Bounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const consume = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const f of features) {
    const g = f.geometry;
    if (g.type === 'POINT' && g.point) consume(g.point.x, g.point.y);
    if ((g.type === 'POLYLINE' || g.type === 'POLYGON' || g.type === 'LINE' || g.type === 'MIXED_GEOMETRY') && g.vertices) {
      for (const v of g.vertices) consume(v.x, v.y);
    }
    if (g.type === 'SPLINE' && g.spline) {
      for (const cp of g.spline.controlPoints) consume(cp.x, cp.y);
    }
    if (g.type === 'ARC' && g.arc) {
      consume(g.arc.center.x - g.arc.radius, g.arc.center.y - g.arc.radius);
      consume(g.arc.center.x + g.arc.radius, g.arc.center.y + g.arc.radius);
    }
    if (g.type === 'CIRCLE' && g.circle) {
      consume(g.circle.center.x - g.circle.radius, g.circle.center.y - g.circle.radius);
      consume(g.circle.center.x + g.circle.radius, g.circle.center.y + g.circle.radius);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}
