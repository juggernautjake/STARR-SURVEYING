// lib/receipts/tiling.ts — where to cut a receipt photo so the AI can actually read it.
//
// Owner, 2026-08-18: *"We need the AI to break down the receipt into smaller images and have OCR
// review it all and very carefully capture everything … We need it to be better at reviewing digits
// and numbers and getting totals right."*
//
// ── THE REASON ONE-SHOT READING IS BAD, AND IT IS NOT THE PROMPT ────────────────────────────────
//
// A receipt is a tall narrow strip. A phone photo of one is commonly 1200×3600. Claude resizes any
// image that exceeds its limits before the model ever sees it, and that photo arrives as 522×1568 —
// the width cut to a THIRD. Body text that was 30px tall on the paper is now 10px, and the last four
// of a card number, already the smallest and faintest print on the slip, lands at four or five
// pixels per digit.
//
// At that size an 8 really is a 3. No prompt fixes it, because the strokes are no longer in the
// image. Every "the AI misread the total" complaint starts here.
//
// Cutting the same photo into horizontal bands and sending each one separately means each band
// arrives at its NATIVE resolution — the text keeps every pixel it had. Same photo, same model,
// three times the effective resolution on the characters that matter. Anthropic's own coordinate
// guidance says the same thing for the same reason: *"for fine targets, crop the region of interest
// and send the crop."*
//
// ── WHY HORIZONTAL BANDS, AND WHY THEY OVERLAP ──────────────────────────────────────────────────
//
// Receipt text runs in horizontal lines, so a horizontal cut crosses the fewest of them, and a
// vertical cut would sever every single line. Bands still overlap because a cut placed exactly
// through "TOTAL 42.18" would otherwise give one band the word and the other the number, and neither
// reader could tell that a line had been cut at all. With overlap, every line appears whole in at
// least one band, and the assembler stitches on the repeated text.
//
// ── WHAT "FITS" MEANS ───────────────────────────────────────────────────────────────────────────
//
// Delegated entirely to `vision-geometry.ts`, which ports Anthropic's reference implementation. The
// intuitive rule — "under 1568 on the long edge" — is wrong often enough to matter: an image can sit
// well inside both edges and still be resized because it exceeds the visual-TOKEN budget. Getting
// that wrong here would mean confidently shipping bands that are quietly downscaled, which is the
// precise failure this file exists to prevent.
//
// Pure geometry, no `sharp`, no I/O — the same split this repo already keeps between
// `lib/media/image-format.ts` and `lib/media/normalise-image.ts`.

import { STANDARD_TIER, fitsNatively, retainedScale, type ResolutionTier } from './vision-geometry';

/** Fraction of a band's height repeated in the next band. A fifth is enough for two or three whole
 *  text lines at typical receipt resolutions, which is what the assembler needs to find its anchor. */
export const OVERLAP_FRACTION = 0.2;

export interface BandPlan {
  /** 0-based, top to bottom. */
  index: number;
  /** Source pixel row this band starts at, inclusive. */
  top: number;
  /** Height in source pixels. */
  height: number;
  /** Where this band sits in the whole, 0..1, for describing it to the reader and to a person. */
  startFraction: number;
  endFraction: number;
}

export interface TilePlan {
  /** Width every band is rendered at. May be an UPSCALE of the source — see `planTiles`. */
  outputWidth: number;
  /** Scale factor from source pixels to output pixels. */
  scale: number;
  bands: BandPlan[];
  /** How much of the original detail a single whole-image read would have kept, 0..1. The argument
   *  for banding, as a number, kept so the audit trail can show it rather than assert it. */
  wholeImageRetainedScale: number;
  /**
   * Why this many bands, in one sentence, so a person reading the receipt's audit trail can see
   * what the machine decided and disagree with it.
   */
  rationale: string;
}

export interface TileOptions {
  /**
   * Narrow images get upscaled toward this before banding. A 700px-wide receipt has real detail that
   * is simply small; enlarging it adds no information, but it does stop the model from having to
   * resolve a digit that occupies six pixels. Above this width nothing is upscaled.
   */
  targetWidth?: number;
  /** Cap, so a pathological panorama cannot request four hundred calls. */
  maxBands?: number;
  /** Which model will read the bands. Decides the fit rule — see `vision-geometry.tierForModel`. */
  tier?: ResolutionTier;
  /**
   * Band even when the whole image would fit — the setting that matters for the receipts this firm
   * actually has.
   *
   * ── WHY "IT FITS" IS THE WRONG QUESTION ───────────────────────────────────────────────────────
   *
   * Every receipt in the live bucket on 2026-08-18 was 480×640, and at that size nothing is
   * downscaled: the whole photo costs 414 visual tokens against a budget of 1568. By the
   * no-downscaling rule there is nothing to fix, and one band is correct.
   *
   * The receipt still reads badly, because avoiding downscale was never the real goal. What
   * actually determines how well small print is read is how many 28×28 patches the model gets to
   * spend on the characters. A receipt occupying 215px of a 480px-wide frame is about eight patches
   * across. Cropped to the paper and split into three bands, each band renders at 1100px — forty
   * patches across, and roughly three times the total visual-token budget spent on the same ink.
   *
   * Upscaling invents no detail. It does let the model allocate far more of its representation to
   * the detail that is already there, and for small faint text that is the difference that shows.
   */
  thorough?: boolean;
  /** With `thorough`, aim for this many bands. Ignored when the receipt is too short to be worth it. */
  thoroughBands?: number;
}

const DEFAULT_TARGET_WIDTH = 1100;
const DEFAULT_MAX_BANDS = 10;

/** A band shorter than this is not worth a whole vision call, so the width is capped at whatever
 *  still leaves room for a band at least this tall. 448px is sixteen 28px patches. */
const MIN_BAND_OUTPUT_HEIGHT = 448;

/** The largest scale at which `width × minHeight` still passes through untouched. Binary search for
 *  the same reason as everywhere else here: the fit rule is a step function of two ceilings. */
function largestScaleFitting(sourceWidth: number, minHeight: number, tier: ResolutionTier): number {
  if (fitsNatively(Math.round(sourceWidth), minHeight, tier)) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (fitsNatively(Math.max(1, Math.round(sourceWidth * mid)), minHeight, tier)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** The tallest band of this width that still passes through untouched, in output pixels.
 *  Searched rather than derived: the token budget is a product of two ceilings, so the boundary is a
 *  step function and there is no closed form worth trusting. */
function tallestFittingHeight(width: number, tier: ResolutionTier): number {
  if (!fitsNatively(width, 28, tier)) return 28; // even a sliver of this width is too wide
  let lo = 28;
  let hi = tier.maxEdge + 28;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fitsNatively(width, mid, tier)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Decide how to cut one image.
 *
 * The shape of the answer is driven by aspect ratio and by the model's limits: a long till roll needs
 * many bands, a square card slip needs one. Nothing here knows about receipts specifically — it knows
 * that text must not be shrunk, and that is enough.
 */
export function planTiles(
  sourceWidth: number,
  sourceHeight: number,
  options: TileOptions = {},
): TilePlan {
  const tier = options.tier ?? STANDARD_TIER;
  const targetWidth = options.targetWidth ?? DEFAULT_TARGET_WIDTH;
  const maxBands = Math.max(1, options.maxBands ?? DEFAULT_MAX_BANDS);

  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)
      || sourceWidth <= 0 || sourceHeight <= 0) {
    // A zero-dimension image is a corrupt upload, not a tiling problem. One band, and the reader
    // will report what it sees — which is the honest outcome and keeps this function total.
    return {
      outputWidth: 1,
      scale: 1,
      bands: [{ index: 0, top: 0, height: 1, startFraction: 0, endFraction: 1 }],
      wholeImageRetainedScale: 1,
      rationale: 'Image dimensions unreadable — read as a single image.',
    };
  }

  const wholeImageRetainedScale = retainedScale(sourceWidth, sourceHeight, tier);

  // Upscale narrow photos; never downscale a wide one below its own detail.
  const desiredScale = sourceWidth < targetWidth ? targetWidth / sourceWidth : 1;

  // An upscale must never be what FORCES a split. A card slip that fits whole gains nothing from
  // being enlarged past the point where it has to be cut in two: enlargement invents no detail, so
  // the extra call is pure loss. Binary-search the largest scale that still fits whole.
  let fitWholeScale = 0;
  {
    let lo = 0;
    let hi = desiredScale + 1;
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      if (fitsNatively(Math.round(sourceWidth * mid), Math.round(sourceHeight * mid), tier)) lo = mid;
      else hi = mid;
    }
    fitWholeScale = lo;
  }

  // A source WIDER than the tier allows cannot be read at native width by any horizontal banding —
  // no band height helps, because the width alone breaks the limit. Cutting into columns as well
  // would preserve it, but a receipt is a narrow strip and a column cut severs every line on it, so
  // the honest answer for a genuinely wide document is to accept a width reduction and say so.
  //
  // Found by the invariant test on a 2000×2000 input: without this the planner produced bands that
  // every one of them would have been downscaled, while reporting a tidy plan.
  //
  // It is a CAP, not a target: when the native width already leaves room for a decent band there is
  // no constraint here at all, and returning 1 rather than Infinity would silently forbid the
  // upscale that small photos need. (It did, until the 600×900 test caught it.)
  const widthCapScale = fitsNatively(Math.round(sourceWidth), MIN_BAND_OUTPUT_HEIGHT, tier)
    ? Number.POSITIVE_INFINITY
    : largestScaleFitting(sourceWidth, MIN_BAND_OUTPUT_HEIGHT, tier);

  const fitsWholeAtNative = fitWholeScale >= 1;
  const scale = Math.min(
    fitsWholeAtNative ? Math.min(desiredScale, fitWholeScale) : desiredScale,
    widthCapScale,
  );
  const outputWidth = Math.max(1, Math.round(sourceWidth * scale));

  // A receipt tall enough to be worth splitting is split even when it would fit, because fitting is
  // not the goal — see `thorough` above. Short, squarish images (a card slip photographed close up)
  // are still left whole: there the text is already large in frame and a split buys nothing.
  const wantsThoroughSplit = Boolean(options.thorough) && sourceHeight >= sourceWidth * 1.5;

  if (!wantsThoroughSplit && fitsNatively(outputWidth, Math.round(sourceHeight * scale), tier)) {
    return {
      outputWidth,
      scale,
      bands: [{ index: 0, top: 0, height: sourceHeight, startFraction: 0, endFraction: 1 }],
      wholeImageRetainedScale,
      rationale:
        `Whole receipt fits in ${outputWidth}×${Math.round(sourceHeight * scale)} with no downscaling `
        + '— read as one image.',
    };
  }

  // In thorough mode the band count is chosen first and the geometry follows, so each band can be
  // enlarged to fill the model's budget. Otherwise the count is the minimum that avoids downscaling.
  let count: number;
  if (wantsThoroughSplit) {
    count = Math.min(Math.max(options.thoroughBands ?? 3, 2), maxBands);
  } else {
    const maxBandOutputHeight = tallestFittingHeight(outputWidth, tier);
    const maxBandSourceHeight = Math.max(1, maxBandOutputHeight / scale);
    // n bands of height h with a fractional overlap cover  h + (n-1)·h·(1-overlap). Solve for the
    // smallest n whose coverage reaches the full height at the tallest legal band.
    const stride = maxBandSourceHeight * (1 - OVERLAP_FRACTION);
    count = Math.ceil((sourceHeight - maxBandSourceHeight) / stride) + 1;
    count = Math.min(Math.max(count, 2), maxBands);
  }

  // Re-derive the band height from the FINAL count so the bands are evenly sized rather than a run
  // of full-height ones plus a sliver. An even split also keeps each band's context comparable,
  // which matters when their transcripts are compared against each other.
  const bandHeight = sourceHeight / (1 + (count - 1) * (1 - OVERLAP_FRACTION));
  const bandStride = bandHeight * (1 - OVERLAP_FRACTION);

  const bands: BandPlan[] = [];
  for (let i = 0; i < count; i += 1) {
    const rawTop = i * bandStride;
    const top = Math.floor(i === count - 1 ? Math.max(0, sourceHeight - bandHeight) : rawTop);
    // The last band takes ALL remaining rows rather than its computed height. Flooring the top and
    // rounding the height independently loses up to a pixel, and the row it loses is the last one on
    // the paper — where the total is. Measured, not hypothetical: a 1000×5000 plan finished at row
    // 4999 of 5000 before this line existed.
    const height = i === count - 1 ? sourceHeight - top : Math.min(bandHeight, sourceHeight - top);
    bands.push({
      index: i,
      top,
      height: Math.max(1, Math.round(height)),
      startFraction: top / sourceHeight,
      endFraction: Math.min(1, (top + height) / sourceHeight),
    });
  }

  // ── The scale is a property of the BAND, not of the whole image ────────────────────────────────
  //
  // Computed earlier, `scale` is whatever lets the ENTIRE receipt through. That is the wrong number
  // once the receipt is in pieces: a band is a fraction of the height, so it has budget to spare and
  // can be enlarged much further. On the 480×640 receipts in the live bucket this is the difference
  // between rendering the paper at its native 215px across and rendering it at 1100px — roughly
  // three times the visual tokens spent on the same ink.
  //
  // Solved against the TALLEST band that was actually produced, not the nominal band height. The
  // last band is pinned to the bottom edge and is therefore a pixel or two taller than nominal;
  // solving against the nominal height leaves it with no slack, and the maximal scale then tips
  // exactly that one band over the limit — silently downscaling the end of the receipt, where the
  // total is. The invariant test caught it on the first run.
  const tallestBand = bands.reduce((m, b) => Math.max(m, b.height), 1);
  let bandScale = scale;
  {
    let lo = 0;
    let hi = Math.max(scale, targetWidth / Math.max(1, sourceWidth)) + 4;
    for (let i = 0; i < 44; i += 1) {
      const mid = (lo + hi) / 2;
      if (fitsNatively(
        Math.max(1, Math.round(sourceWidth * mid)),
        Math.max(1, Math.round(tallestBand * mid)),
        tier,
      )) lo = mid;
      else hi = mid;
    }
    bandScale = Math.max(scale, lo);
  }
  const bandOutputWidth = Math.max(1, Math.round(sourceWidth * bandScale));

  const keptPct = Math.round(wholeImageRetainedScale * 100);
  const bandOutH = Math.round(bandHeight * bandScale);
  return {
    outputWidth: bandOutputWidth,
    scale: bandScale,
    bands,
    wholeImageRetainedScale,
    rationale:
      `${count} overlapping bands of ${bandOutputWidth}×${bandOutH}`
      + (bandScale > 1
        ? `, each enlarged ${bandScale.toFixed(1)}× so the model spends far more of its attention on the print.`
        : `. Read whole, this photo would have been downscaled to ${keptPct}% and the small print with it.`),
  };
}

/**
 * Does the plan actually cover every row of the source? Used by the tests and by the renderer.
 *
 * A gap here is invisible in the output — the assembled transcript simply would not contain the
 * missing lines, and nothing downstream can tell "the receipt did not say that" from "we never
 * looked". That is precisely the class of silent hole this repo keeps finding, so it is checked
 * rather than assumed.
 */
export function coversEveryRow(plan: TilePlan, sourceHeight: number): boolean {
  if (plan.bands.length === 0) return false;
  const sorted = [...plan.bands].sort((a, b) => a.top - b.top);
  if (sorted[0].top > 0) return false;
  let reach = sorted[0].top + sorted[0].height;
  for (const b of sorted.slice(1)) {
    if (b.top > reach) return false; // a hole
    reach = Math.max(reach, b.top + b.height);
  }
  return reach >= sourceHeight;
}

/** Every band passes through the model untouched — the invariant the whole module exists to hold. */
export function everyBandFitsNatively(plan: TilePlan, tier: ResolutionTier = STANDARD_TIER): boolean {
  return plan.bands.every((b) => fitsNatively(plan.outputWidth, Math.round(b.height * plan.scale), tier));
}

/** Human-readable position, for the prompt and for the audit trail: "the middle of the receipt". */
export function describeBand(band: BandPlan, total: number): string {
  if (total === 1) return 'the whole receipt';
  const mid = (band.startFraction + band.endFraction) / 2;
  if (band.index === 0) return 'the TOP of the receipt (the header — business name, address, phone)';
  if (band.index === total - 1) return 'the BOTTOM of the receipt (where the total, payment and card details usually are)';
  if (mid < 0.4) return 'the upper-middle of the receipt';
  if (mid > 0.6) return 'the lower-middle of the receipt (totals and payment often begin here)';
  return 'the middle of the receipt (usually the itemised lines)';
}
