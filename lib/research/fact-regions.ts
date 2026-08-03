// lib/research/fact-regions.ts — giving a fact a place on the page (plan R17).
//
// ── THE COORDINATES WERE ALREADY BEING PRODUCED, AND THROWN AWAY ────────────────────────────────
//
// R17's remaining item was recorded as blocked: *"text extraction has no coordinates to give —
// unlocked by R18's vision path"*. R18 shipped. `adaptive-vision.ts` tiles a page into quadrants,
// OCRs each one, and returns `SegmentResult.boundingBox` in pixels for every segment — and
// `ai-extraction.ts` keeps `avResult.mergedText` and discards `avResult.segments`.
//
// So `extracted_data_points.source_bounding_box` has never held a value, not because nothing could
// produce one, but because the one thing that could was dropping it on the floor two files earlier.
//
// ── A SEGMENT IS A QUADRANT, NOT A WORD ─────────────────────────────────────────────────────────
//
// This is the honest limit of the method and it is stated rather than smoothed over. The box that
// comes back is the region the text was READ FROM — a quadrant of the page, or a zoom sub-quadrant
// where the pipeline escalated. It is not a glyph box.
//
// That is still worth a great deal: "scroll to this sixth of the page" beats "open this document and
// find it", which is what a reviewer has today. But a region this coarse must not be sold as
// precision, so `precision` travels with the box and the UI can say which it has.
//
// ── AND WHEN IT IS AMBIGUOUS, THERE IS NO BOX ───────────────────────────────────────────────────
//
// If a fact's text appears in more than one segment, we do not know which one it was read from.
// Picking the first would scroll a reviewer to a plausible-looking wrong place and let them believe
// it — which is exactly what `isNormalisedBox`'s own comment says the contract exists to prevent.
// An ambiguous fact gets NO box and keeps whatever weaker evidence it already had.

/** A vision segment as `adaptive-vision.ts` produces it, reduced to what locating needs. */
export interface OcrRegion {
  segmentId: string;
  /** PIXELS, as measured on the page image the OCR ran against. */
  boundingBox: { x: number; y: number; w: number; h: number };
  text: string;
  /** 0 = primary quadrant, 1 = zoom sub-segment. Deeper is finer. */
  depth: number;
  /** Which page of the document this segment belongs to. */
  page?: number;
}

/** The page image the pixel boxes were measured against. Without it there is nothing to divide by,
 *  and a box cannot be normalised — so no box is produced. */
export interface PageSize {
  width: number;
  height: number;
}

export type RegionPrecision = 'segment' | 'zoom_segment';

export interface LocatedRegion {
  box: { x: number; y: number; width: number; height: number };
  precision: RegionPrecision;
  segmentId: string;
  page?: number;
  /** What the UI may honestly say about this region. */
  statement: string;
}

export type LocateFailure =
  | 'no_excerpt'
  | 'no_regions'
  | 'no_page_size'
  | 'not_found'
  | 'ambiguous';

export interface LocateResult {
  region: LocatedRegion | null;
  failure: LocateFailure | null;
  /** Why there is no box, when there is none. Never silently empty. */
  reason: string;
}

/** Normalise for matching: OCR inserts line breaks and doubled spaces that the model's excerpt does
 *  not reproduce, and a literal comparison would miss almost every real quote. Case is dropped for
 *  the same reason — plats are typeset in caps and the model quotes them in mixed case. */
export function normaliseForMatch(s: string): string {
  return (s ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

/** Convert a pixel box to fractions of the page, or null when it cannot be trusted.
 *
 *  Rejects boxes that fall outside the page rather than clamping them. A box that needed clamping
 *  was measured against a different image than the one supplied, and silently squashing it to fit
 *  produces a plausible box pointing at the wrong place — the one outcome the 0–1 contract exists to
 *  prevent. */
export function normaliseBox(
  px: { x: number; y: number; w: number; h: number },
  page: PageSize,
): { x: number; y: number; width: number; height: number } | null {
  if (!page || !(page.width > 0) || !(page.height > 0)) return null;
  const vals = [px?.x, px?.y, px?.w, px?.h];
  if (vals.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null;
  if (px.w <= 0 || px.h <= 0) return null;

  const box = {
    x: px.x / page.width,
    y: px.y / page.height,
    width: px.w / page.width,
    height: px.h / page.height,
  };
  const within =
    box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0 &&
    box.x + box.width <= 1.001 && box.y + box.height <= 1.001;
  return within ? box : null;
}

/** Which segment was this fact read from?
 *
 *  Prefers a zoom sub-segment over the primary quadrant that contains it: the pipeline escalated
 *  that area precisely because it was dense or unclear, so the finer box is both more useful and
 *  more likely to be where the value actually is. A primary quadrant that merely CONTAINS a matching
 *  zoom segment is therefore not counted as a competing match — otherwise every escalated region
 *  would read as ambiguous and lose its box.
 */
export function locateFactRegion(
  excerpt: string | null | undefined,
  regions: OcrRegion[],
  pageSize: PageSize | null | undefined,
): LocateResult {
  const needle = normaliseForMatch(excerpt ?? '');
  if (needle.length < 4) {
    return {
      region: null, failure: 'no_excerpt',
      reason: 'No usable quote was captured for this value, so there is nothing to find on the page.',
    };
  }
  if (!regions || regions.length === 0) {
    return {
      region: null, failure: 'no_regions',
      reason: 'This document has no OCR regions recorded — it was not read through the vision pipeline, so no part of the page can be pointed at.',
    };
  }
  if (!pageSize || !(pageSize.width > 0) || !(pageSize.height > 0)) {
    return {
      region: null, failure: 'no_page_size',
      reason: 'The page dimensions the regions were measured against are not recorded, so a pixel box cannot be converted to a page fraction. A pixel box would be wrong at every other zoom level.',
    };
  }

  const matches = regions.filter((r) => normaliseForMatch(r.text).includes(needle));
  if (matches.length === 0) {
    return {
      region: null, failure: 'not_found',
      reason: 'The quoted text was not found in any OCR region — it may have been paraphrased, or read from a part of the page the segmentation did not cover.',
    };
  }

  // Deepest first: a zoom sub-segment is finer than the quadrant enclosing it.
  const deepest = Math.max(...matches.map((m) => m.depth ?? 0));
  const finest = matches.filter((m) => (m.depth ?? 0) === deepest);

  if (finest.length > 1) {
    return {
      region: null, failure: 'ambiguous',
      reason:
        `The quoted text appears in ${finest.length} separate regions of the page, so which one it was read from ` +
        `is unknown. No region is recorded rather than scrolling to a plausible wrong one.`,
    };
  }

  const chosen = finest[0]!;
  const box = normaliseBox(chosen.boundingBox, pageSize);
  if (!box) {
    return {
      region: null, failure: 'no_page_size',
      reason:
        'The recorded region does not fit the page dimensions given, so it was measured against a different rendering. ' +
        'No box is recorded rather than one pointing at the wrong part of the page.',
    };
  }

  const precision: RegionPrecision = (chosen.depth ?? 0) > 0 ? 'zoom_segment' : 'segment';
  return {
    region: {
      box,
      precision,
      segmentId: chosen.segmentId,
      page: chosen.page,
      statement:
        precision === 'zoom_segment'
          ? 'Marks the zoomed region this value was read from — finer than a quadrant, but not a word-level box.'
          : 'Marks the region of the page this value was read from. It is a quadrant, not a word — expect to scan within it.',
    },
    failure: null,
    reason: '',
  };
}

/** Locate a batch, and say how it went.
 *
 *  The summary leads with how many facts got NO region and why, because "37 of 210 facts located"
 *  reads as progress while "173 facts still have no place on the page, 41 of them because the quote
 *  was ambiguous" reads as the work list it is. */
export function summariseLocations(results: LocateResult[]): string {
  if (results.length === 0) return 'No facts to locate.';
  const located = results.filter((r) => r.region).length;
  const by: Record<LocateFailure, number> = {
    no_excerpt: 0, no_regions: 0, no_page_size: 0, not_found: 0, ambiguous: 0,
  };
  for (const r of results) if (r.failure) by[r.failure]++;

  const parts = [`${located} of ${results.length} fact(s) located on the page.`];
  if (by.ambiguous > 0) parts.push(`${by.ambiguous} quote(s) appear in more than one region and were deliberately left unlocated.`);
  if (by.not_found > 0) parts.push(`${by.not_found} quote(s) were not found in any region.`);
  if (by.no_excerpt > 0) parts.push(`${by.no_excerpt} fact(s) carry no quote to search for.`);
  if (by.no_regions > 0) parts.push(`${by.no_regions} came from documents with no OCR regions recorded.`);
  if (by.no_page_size > 0) parts.push(`${by.no_page_size} could not be converted to page fractions.`);
  return parts.join(' ');
}
