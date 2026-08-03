// worker/src/services/ocr-legibility.ts — can the model actually READ this, before we ask it.
//
// Phase I / S8 asks whether the OCR tiling is right for a 36×48 plat. Most of that question is not a
// measurement at all — it is arithmetic, and it can be settled before spending a single API call.
//
// A bearing on a Texas plat is typeset around **6 point**, roughly 0.07" tall. Whether a model can
// read it depends on one number: how many PIXELS OF THE ORIGINAL that 0.07" survives as, in the image
// the model is finally shown. Every step between the courthouse and the prompt shrinks it —
//
//     scan resolution        the county scanned at 200 or 300 DPI, and it is rarely stated
//     viewer rendering       a portal that paints a 304 px-wide page has already lost the battle
//     tiling                 cutting a page into N tiles multiplies what survives, per tile
//     API downscale          anything over ~8000 px on a side is resized before the model sees it
//
// ── WHY THIS IS WORTH ITS OWN MODULE ────────────────────────────────────────────────────────────
//
// Two paths in this codebase tile documents, and they do not agree.
//
//   worker/adaptive-vision.ts   COMPUTES the grid — it estimates DPI, works out the fine-text pixel
//                               height, and adds tiles until that clears a threshold.
//   lib/document.service.ts     FIXED at 3×3 for PDFs and a constant grid for images, regardless of
//                               whether the page is an 8.5×11 deed or a 36×48 plat.
//
// The second is the path that actually processes `research_documents` and writes the facts. So the
// document a surveyor's numbers come from is tiled by a constant, and nothing anywhere reports
// whether that constant was enough. An OCR that cannot resolve a bearing does not fail — it returns
// a *plausible* bearing, and this platform's whole design is about not letting that happen quietly.

/** A bearing/distance label on a Texas plat, in inches. */
export const FINE_TEXT_HEIGHT_IN = 0.07;
/** Below this many pixels of height, fine text stops being reliably readable. */
export const MIN_FINE_TEXT_PX = 13;
/** Comfortable rather than marginal. */
export const GOOD_FINE_TEXT_PX = 20;
/** Anthropic resizes images longer than this on a side before the model sees them. */
export const API_MAX_PIXELS = 8_000;

export interface PageSpec {
  /** Physical page size in inches — 8.5×11 for a deed, 36×48 for a plat. */
  widthIn: number;
  heightIn: number;
  /** Pixel size of the image we actually hold. */
  pixelWidth: number;
  pixelHeight: number;
}

export interface TileSpec {
  rows: number;
  cols: number;
}

export type Legibility = 'good' | 'marginal' | 'unreadable';

export interface LegibilityReport {
  /** Effective DPI of the image we hold, against the physical page. */
  effectiveDpi: number;
  /** Pixel height of 0.07" text in the image we hold. */
  fineTextPxAtSource: number;
  /** …and in the tile the model is finally shown, after any API downscale. */
  fineTextPxAtModel: number;
  tilePixelWidth: number;
  tilePixelHeight: number;
  /** True when a tile still exceeds the API's limit and will be downscaled. */
  apiWillDownscale: boolean;
  verdict: Legibility;
  /** The grid that WOULD make fine text readable, when the given one does not. */
  recommendedTiles: TileSpec | null;
  statement: string;
}

/** Effective DPI of an image against the physical page it depicts.
 *
 *  Uses the smaller of the two axes, because a page scanned or rendered anisotropically is limited by
 *  its worst direction — and fine text is as likely to run one way as the other on a plat. */
export function effectiveDpi(page: PageSpec): number {
  const dx = page.widthIn > 0 ? page.pixelWidth / page.widthIn : 0;
  const dy = page.heightIn > 0 ? page.pixelHeight / page.heightIn : 0;
  return Math.min(dx || Infinity, dy || Infinity);
}

/** Will the model be able to read a bearing off this, tiled this way? */
export function assessLegibility(page: PageSpec, tiles: TileSpec): LegibilityReport {
  const dpi = effectiveDpi(page);
  const fineAtSource = dpi * FINE_TEXT_HEIGHT_IN;

  const tileW = page.pixelWidth / Math.max(1, tiles.cols);
  const tileH = page.pixelHeight / Math.max(1, tiles.rows);

  // The API downscales a tile whose longest side exceeds the limit, and fine text shrinks with it.
  const longest = Math.max(tileW, tileH);
  const downscale = longest > API_MAX_PIXELS ? API_MAX_PIXELS / longest : 1;
  const fineAtModel = fineAtSource * downscale;

  const verdict: Legibility =
    fineAtModel >= GOOD_FINE_TEXT_PX ? 'good' : fineAtModel >= MIN_FINE_TEXT_PX ? 'marginal' : 'unreadable';

  // More tiles only help by avoiding the API downscale — they cannot add resolution that the image
  // never had. That distinction is the important one and is stated below.
  const recommended = verdict === 'good' ? null : recommendTiles(page);

  return {
    effectiveDpi: round(dpi, 1),
    fineTextPxAtSource: round(fineAtSource, 1),
    fineTextPxAtModel: round(fineAtModel, 1),
    tilePixelWidth: Math.round(tileW),
    tilePixelHeight: Math.round(tileH),
    apiWillDownscale: downscale < 1,
    verdict,
    recommendedTiles: recommended,
    statement: describe(dpi, fineAtSource, fineAtModel, downscale < 1, verdict, tiles, recommended),
  };
}

/** The smallest grid that keeps every tile under the API limit, so no resolution is thrown away.
 *
 *  Returns null when the image simply does not have the resolution — no grid can recover detail that
 *  was never captured, and saying "use 6×6" there would be advice that cannot work. */
export function recommendTiles(page: PageSpec): TileSpec | null {
  const fineAtSource = effectiveDpi(page) * FINE_TEXT_HEIGHT_IN;
  if (fineAtSource < MIN_FINE_TEXT_PX) return null;

  const cols = Math.max(1, Math.ceil(page.pixelWidth / API_MAX_PIXELS));
  const rows = Math.max(1, Math.ceil(page.pixelHeight / API_MAX_PIXELS));
  return { rows, cols };
}

function describe(
  dpi: number,
  atSource: number,
  atModel: number,
  downscaled: boolean,
  verdict: Legibility,
  tiles: TileSpec,
  recommended: TileSpec | null,
): string {
  const head =
    `At ${round(dpi, 0)} effective DPI, a 0.07" bearing label is ${round(atSource, 1)} px tall in the image we ` +
    `hold${downscaled ? `, and ${round(atModel, 1)} px after the API downscales a ${tiles.rows}×${tiles.cols} tile` : ''}.`;

  if (verdict === 'good') {
    return `${head} Comfortably readable (≥${GOOD_FINE_TEXT_PX} px).`;
  }

  if (verdict === 'marginal') {
    const fix = recommended && (recommended.rows > tiles.rows || recommended.cols > tiles.cols)
      ? ` A ${recommended.rows}×${recommended.cols} grid would avoid the downscale and keep it at ${round(atSource, 1)} px.`
      : '';
    return (
      `${head} MARGINAL — above the ${MIN_FINE_TEXT_PX} px floor but below comfortable, so a misread digit is ` +
      `likely and will look like a plausible bearing rather than an error.${fix}`
    );
  }

  if (recommended) {
    return (
      `${head} UNREADABLE for fine text. The image has the resolution but the tiling throws it away: a ` +
      `${recommended.rows}×${recommended.cols} grid keeps every tile under the API's ${API_MAX_PIXELS} px limit ` +
      `and preserves ${round(atSource, 1)} px.`
    );
  }

  return (
    `${head} UNREADABLE for fine text, and MORE TILES CANNOT FIX IT — the image never had the resolution. ` +
    `Re-fetch at a higher render size or scan; cutting it up further only makes smaller pictures of the same ` +
    `blur. Anything fine extracted from this should be treated as unverified.`
  );
}

function round(n: number, dp: number): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// ── The documents this platform actually fetches ────────────────────────────────────────────────

/** What a viewer served, measured on 2026-08-03, for judging whether a capture is worth OCRing.
 *
 *  Avenu is the alarming one. Its viewer paints a letter-size page at **304×561** by default — about
 *  36 DPI, where a 0.07" bearing is **2.5 px tall**. That is not marginal, it is nothing: the digits
 *  do not exist in the image. The capture code takes the image at its natural size, which is correct
 *  and still not enough, because the natural size IS the problem.
 *
 *  Its image URL carries `WIDTH`/`HEIGHT`/`FITTYPE`/`ZOOM` parameters, so a larger render can be
 *  requested — that is the fix, and it is a change to the request rather than to the capture. */
export const OBSERVED_CAPTURES = {
  avenuDefaultViewer: { widthIn: 8.5, heightIn: 11, pixelWidth: 304, pixelHeight: 561 },
} as const;
