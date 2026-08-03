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

/** What each vendor actually serves, measured on 2026-08-03 rather than assumed.
 *
 *  These are the numbers that decide whether extraction from a given county can be trusted, and they
 *  differ by a factor of eight across vendors we treat identically everywhere else.
 *
 *  ── AVENU: fixed, and it was the alarming one ─────────────────────────────────────────────────
 *
 *  Its viewer painted a letter page at **304×561** at an ordinary browser size — about 36 DPI, where
 *  a 0.07" bearing is **2.5 px**. Not marginal: the digits were not in the image. The render size is
 *  signed into the image token and cannot be edited, but it TRACKS THE VIEWPORT, so opening the
 *  capture tab at 2400×3200 yields **1712×3162**.
 *
 *  That is a large improvement and it is **still only marginal**, which is worth being precise about
 *  because the tempting number is the wrong one. The render is fitted to HEIGHT
 *  (`FITTYPE=Height`), so the height axis reads ~287 DPI — but the WIDTH is 1712 px across 8.5", which
 *  is **201 DPI**, and legibility is set by the worse axis. A bearing is ~14 px: over the floor, under
 *  comfortable.
 *
 *  Reaching 20 px needs ~286 DPI, i.e. ~2430 px of image width, which means a taller viewport still.
 *  **Untested** — a headed browser cannot be sized past the screen, and whether this portal will
 *  render that large is unknown. A headless worker has no such limit, so it is worth trying there.
 *
 *  ── TYLER EAGLE: "DEGRADED" costs real resolution, and lands in the dangerous band ────────────
 *
 *  Its free copy is served as `DEGRADED-<docId>`. Reading the PDF's image XObjects directly:
 *  **1699×2220 px** against a `MediaBox` of 611×799 pt (8.49"×11.1") — **200 DPI**, putting a bearing
 *  at **14 px**.
 *
 *  That clears the 13 px floor and misses the 20 px comfort mark, which is precisely the band where
 *  OCR does not fail but guesses. Nine counties. Whether a 14 px bearing is read correctly or
 *  confidently wrong is the one thing here that arithmetic cannot settle — it needs a plat whose
 *  values are known, and it is the sharpest reason to want one. */
export const OBSERVED_CAPTURES = {
  /** Before the viewport fix. Kept so a regression is recognisable. */
  avenuDefaultViewer: { widthIn: 8.5, heightIn: 11, pixelWidth: 304, pixelHeight: 561 },
  /** After: capture tab opened at 2400×3200. */
  avenuLargeViewport: { widthIn: 8.5, heightIn: 11, pixelWidth: 1712, pixelHeight: 3162 },
  /** Tyler Eagle's free DEGRADED rendering, read out of the PDF itself. */
  tylerEagleDegraded: { widthIn: 8.49, heightIn: 11.1, pixelWidth: 1699, pixelHeight: 2220 },
  /** Kofile's free signed page image — the best of the lot, and 22 counties. */
  kofileSignedPage: { widthIn: 8.5, heightIn: 11, pixelWidth: 2550, pixelHeight: 3300 },
} as const;

/** Kofile — 22 counties, and the BEST resolution of any vendor here. Measured 2026-08-03.
 *
 *  Bell instrument 2020032310 serves `files/documents/99280747/images/94926355_1.png` at
 *  **2550×3300** — exactly **300 DPI** for a letter page, putting a 0.07" bearing at **21 px**.
 *  Comfortably readable, free, and anonymous.
 *
 *  ── AND THE FIRST ATTEMPT AT THIS MEASUREMENT WAS WRONG ───────────────────────────────────────
 *
 *  It concluded Kofile served no free image at all, because the document page was inspected for
 *  `<img>`/`<canvas>`/`<iframe>` elements and has none of a useful size. The image is fetched as a
 *  **signed network request** (`?exp=…&sig=…`) rather than sitting in the DOM where it was looked
 *  for, and it only fires when the viewer is reached the way `bell-clerk.ts` reaches it: search, then
 *  CLICK the result row. Navigating straight to `/doc/<id>` loads the metadata and never requests the
 *  image.
 *
 *  Worth keeping because the failure was in the METHOD, not the portal: looking in the DOM for
 *  something delivered over the network produced a confident "no free preview" about the vendor
 *  carrying most of this platform's coverage. The right instrument was the network log. */
export const KOFILE_RESOLUTION_UNMEASURED = false;

// ── Assessing a real capture, where the physical size is often unknown ──────────────────────────
//
// `assessLegibility` needs the page's size in INCHES, and a scanned image does not carry one. Three
// sources, in descending order of trust:
//
//   1. A PDF's `MediaBox` — the physical size in points, exact. This is how Tyler was measured.
//   2. The image's embedded DPI (`density`), when the scanner wrote one. Often absent or wrong.
//   3. Assuming US Letter.
//
// The third is a guess and is marked as one, because it is wrong in the case that matters most: a
// 36×48 plat assumed to be 8.5×11 reports **four times** its true DPI, turning an unreadable capture
// into a comfortable-looking one. That is the precise failure this module exists to prevent, so an
// assumed size never yields a `good` verdict without saying what it assumed.

export type SizeSource = 'pdf_mediabox' | 'image_density' | 'assumed_letter';

export interface CaptureAssessment extends LegibilityReport {
  sizeSource: SizeSource;
  /** True when the physical page size was guessed rather than read. */
  sizeAssumed: boolean;
  /** The statement, plus what was assumed when anything was. */
  fullStatement: string;
}

export const US_LETTER = { widthIn: 8.5, heightIn: 11 } as const;

/** Assess a capture, being explicit about where the physical size came from. */
export function assessCapture(
  pixelWidth: number,
  pixelHeight: number,
  tiles: TileSpec,
  physical?: { widthIn: number; heightIn: number; source: SizeSource } | null,
): CaptureAssessment {
  const source: SizeSource = physical?.source ?? 'assumed_letter';
  const size = physical ?? { widthIn: US_LETTER.widthIn, heightIn: US_LETTER.heightIn };
  const report = assessLegibility({ ...size, pixelWidth, pixelHeight }, tiles);
  const assumed = source === 'assumed_letter';

  const caveat = assumed
    ? ' Page size was ASSUMED to be US Letter — nothing stated it. If this is a plat (36×48 is common) ' +
      'the real DPI is roughly a QUARTER of the figure above, which would move this from readable to ' +
      'unreadable. Treat the verdict as provisional until the sheet size is known.'
    : source === 'image_density'
      ? ' Page size came from the image\'s embedded DPI, which scanners often set wrongly.'
      : '';

  return {
    ...report,
    sizeSource: source,
    sizeAssumed: assumed,
    fullStatement: report.statement + caveat,
  };
}

// ── Choosing the grid, rather than reporting on it afterwards (plan R18) ─────────────────────────
//
// Everything above answers "was the tiling enough?" — and until now that answer arrived AFTER the
// tiling had already happened. `document.service.ts` called `assessCapture()` at the end of its OCR
// pass, printed the verdict, stored it with the segments, and had already cut the page into a
// constant grid. `recommendedTiles` was computed on every single document and acted on by nothing.
//
// That is the R18 remainder: two paths tile and they do not agree. `adaptive-vision.ts` computes its
// grid; `document.service.ts` uses 3×3 for PDFs and 2×2 for images whether the page is an 8.5×11
// deed or a 36×48 plat. This function is the one policy both can call, so the disagreement stops
// being a fact about which file you happen to be in.

/** Most tiles we will cut a page into.
 *
 *  Every tile is a separate vision call, so the grid is a COST as well as a quality setting: 6×6 is
 *  36 calls for one page. The cap is high enough for a 36×48 plat at 300 DPI (which wants 2×2 to
 *  clear the API limit) and for the deep grids a large scan can ask for, and low enough that a
 *  pathological page cannot bill for a hundred calls. When it binds, it is stated — a silently
 *  capped grid would look like a considered choice. */
export const MAX_TILES_PER_AXIS = 6;

export interface TileDecision {
  tiles: TileSpec;
  /** True when this differs from the grid the caller proposed. */
  changed: boolean;
  /** True when `MAX_TILES_PER_AXIS` prevented the grid the arithmetic asked for. */
  capped: boolean;
  /** What the arithmetic wanted before the cap, when it wanted anything. */
  wanted: TileSpec | null;
  statement: string;
}

/** Decide how to tile a page, given the grid a caller would otherwise use by default.
 *
 *  Only ever INCREASES the grid. The existing constants were chosen for plats and a page can be hard
 *  to read for reasons this arithmetic does not model — faint ink, skew, a stamp across the text — so
 *  cutting below them to save calls would trade a known-good default for a guess. What this fixes is
 *  the opposite case: a page with the resolution whose fixed grid throws it away in the API
 *  downscale.
 *
 *  Returns the default unchanged, with a reason, when more tiles cannot help. That case is the one
 *  worth being careful about: a 150 DPI scan puts a bearing at 10.5 px and NO grid adds resolution
 *  the scan never had, so recommending 6×6 there would be advice that looks like a fix and changes
 *  nothing — while costing 36 vision calls to prove it. */
export function chooseTiles(
  pixelWidth: number,
  pixelHeight: number,
  fallback: TileSpec,
  physical?: { widthIn: number; heightIn: number; source: SizeSource } | null,
): TileDecision {
  const size = physical ?? { widthIn: US_LETTER.widthIn, heightIn: US_LETTER.heightIn };
  const page: PageSpec = { ...size, pixelWidth, pixelHeight };
  const at = assessLegibility(page, fallback);

  if (at.verdict === 'good') {
    return {
      tiles: fallback, changed: false, capped: false, wanted: null,
      statement:
        `Keeping the default ${fallback.rows}×${fallback.cols} grid: fine text already lands at ` +
        `${at.fineTextPxAtModel} px, which is comfortably readable.`,
    };
  }

  const wanted = recommendTiles(page);

  if (!wanted) {
    return {
      tiles: fallback, changed: false, capped: false, wanted: null,
      statement:
        `Keeping the default ${fallback.rows}×${fallback.cols} grid, because MORE TILES CANNOT HELP — ` +
        `at ${at.effectiveDpi} effective DPI a 0.07" bearing is only ${at.fineTextPxAtSource} px in the ` +
        `image we hold, and no grid adds resolution the capture never had. The page needs re-capturing ` +
        `at a higher resolution, not re-tiling.`,
    };
  }

  // Never below the caller's default — see the doc comment.
  const rawRows = Math.max(wanted.rows, fallback.rows);
  const rawCols = Math.max(wanted.cols, fallback.cols);
  const rows = Math.min(rawRows, MAX_TILES_PER_AXIS);
  const cols = Math.min(rawCols, MAX_TILES_PER_AXIS);
  const capped = rows < rawRows || cols < rawCols;
  const changed = rows !== fallback.rows || cols !== fallback.cols;

  if (!changed) {
    return {
      tiles: fallback, changed: false, capped, wanted: { rows: rawRows, cols: rawCols },
      statement:
        `Keeping the default ${fallback.rows}×${fallback.cols} grid: it already meets or exceeds what ` +
        `the arithmetic asks for, and fine text is ${at.fineTextPxAtModel} px.`,
    };
  }

  const after = assessLegibility(page, { rows, cols });
  return {
    tiles: { rows, cols },
    changed: true,
    capped,
    wanted: { rows: rawRows, cols: rawCols },
    statement:
      `Tiling ${rows}×${cols} instead of the default ${fallback.rows}×${fallback.cols}: the default ` +
      `would hand the model ${at.fineTextPxAtModel} px of bearing text after the API downscale, and this ` +
      `grid keeps ${after.fineTextPxAtModel} px. The resolution is in the image; the default throws it ` +
      `away.` +
      (capped
        ? ` CAPPED at ${MAX_TILES_PER_AXIS} per axis — the arithmetic asked for ${rawRows}×${rawCols}, ` +
          `so fine text is still below what this page could give.`
        : ''),
  };
}
