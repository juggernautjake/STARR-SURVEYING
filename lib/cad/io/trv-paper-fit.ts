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

type FeatureLike = {
  geometry: {
    type: string;
    point?: { x: number; y: number };
    vertices?: Array<{ x: number; y: number }>;
    spline?: { controlPoints: Array<{ x: number; y: number }> };
    arc?: { center: { x: number; y: number }; radius: number };
    circle?: { center: { x: number; y: number }; radius: number };
  };
};

/** Collect every (x, y) point a feature contributes — POINT coord,
 *  POLYLINE / POLYGON / LINE / MIXED vertices, SPLINE control
 *  points, ARC / CIRCLE bbox corners. Returns the flat list so
 *  callers can compute a strict bbox OR a percentile-clipped
 *  robust bbox. */
function collectFeaturePoints(features: ReadonlyArray<FeatureLike>): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const f of features) {
    const g = f.geometry;
    if (g.type === 'POINT' && g.point) out.push({ x: g.point.x, y: g.point.y });
    if ((g.type === 'POLYLINE' || g.type === 'POLYGON' || g.type === 'LINE' || g.type === 'MIXED_GEOMETRY') && g.vertices) {
      for (const v of g.vertices) out.push({ x: v.x, y: v.y });
    }
    if (g.type === 'SPLINE' && g.spline) {
      for (const cp of g.spline.controlPoints) out.push({ x: cp.x, y: cp.y });
    }
    if (g.type === 'ARC' && g.arc) {
      out.push({ x: g.arc.center.x - g.arc.radius, y: g.arc.center.y - g.arc.radius });
      out.push({ x: g.arc.center.x + g.arc.radius, y: g.arc.center.y + g.arc.radius });
    }
    if (g.type === 'CIRCLE' && g.circle) {
      out.push({ x: g.circle.center.x - g.circle.radius, y: g.circle.center.y - g.circle.radius });
      out.push({ x: g.circle.center.x + g.circle.radius, y: g.circle.center.y + g.circle.radius });
    }
  }
  return out;
}

/** Strict bbox over every contributed point. Use this for
 *  zoom-extents (the user wants to see EVERY feature, including
 *  outliers). */
export function bboxOfFeaturePoints(features: ReadonlyArray<FeatureLike>): Bounds | null {
  const pts = collectFeaturePoints(features);
  if (pts.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Outlier-resistant bbox — drops points outside the [pLo, pHi]
 *  percentile of each axis before bounding. Use this for PAPER
 *  auto-fit so a single stray GPS shot doesn't blow the paper up
 *  to ARCH_E + 2000 ft/in to swallow it. Defaults: 1st-99th
 *  percentile (drops the top + bottom 1% per axis).
 *
 *  The Garland sample motivates this: 788 points, 786 cluster in
 *  a 619 ft × 273 ft survey, 2 stray points at ~13,000 ft from
 *  the median pull the strict bbox to 13,167 × 10,020 ft. The
 *  robust bbox keeps the paper at TABLOID ~50 ft/in instead of
 *  ARCH_E at 2000 ft/in. */
export function bboxOfFeaturePointsRobust(
  features: ReadonlyArray<FeatureLike>,
  opts: { pLo?: number; pHi?: number } = {},
): Bounds | null {
  const pLo = opts.pLo ?? 0.01;
  const pHi = opts.pHi ?? 0.99;
  const pts = collectFeaturePoints(features);
  if (pts.length === 0) return null;
  if (pts.length < 4) return bboxOfFeaturePoints(features);
  const xs = pts.map((p) => p.x).sort((a, b) => a - b);
  const ys = pts.map((p) => p.y).sort((a, b) => a - b);
  const pick = (arr: number[], q: number) => arr[Math.max(0, Math.min(arr.length - 1, Math.floor(q * (arr.length - 1))))];
  return {
    minX: pick(xs, pLo),
    maxX: pick(xs, pHi),
    minY: pick(ys, pLo),
    maxY: pick(ys, pHi),
  };
}
