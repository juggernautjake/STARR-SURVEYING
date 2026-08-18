// lib/receipts/vision-geometry.ts — exactly what the model sees, in pixels.
//
// A port of Anthropic's reference implementation from the Vision and "Coordinates and bounding
// boxes" docs. Everything in the deep receipt reader is built on top of this, for two reasons:
//
//   1. **Deciding whether a band will be downscaled.** The whole point of cutting a receipt into
//      bands is that each band keeps its native resolution. A band that is silently resized on the
//      way in defeats the exercise while looking exactly like a band that was not.
//   2. **Mapping a bounding box back onto the photo.** Claude returns pixel coordinates in the image
//      it SAW — i.e. after its own resize. Cropping the original using those numbers without
//      converting cuts the wrong rectangle.
//
// ── THE TRAP THIS FILE EXISTS TO AVOID ──────────────────────────────────────────────────────────
//
// The obvious mental model — "images bigger than 1568px on the long edge get shrunk" — is wrong, and
// wrong in the direction that produces silent damage. There are TWO limits and the second one is
// usually the binding one:
//
//   * edge:   neither side may exceed 1568px (standard tier), and
//   * tokens: ⌈w/28⌉ × ⌈h/28⌉ must not exceed 1568 visual tokens.
//
// Anthropic's own example: an A4 page scanned at 130 DPI is 1075×1520. Both sides are comfortably
// under 1568 — so the naive rule says "fits, no resize" — but it costs 39 × 55 = 2145 tokens, and it
// is resized to 924×1307. A tiling planner using the naive rule would hand the model a band it
// believed was pixel-perfect while a seventh of the detail had already been thrown away.
//
// The docs name this directly: *"The token limit can also trigger a resize when neither side exceeds
// the edge limit. Overlooking this is the most common cause of misaligned coordinates."*
//
// Pure arithmetic. No I/O, no `sharp`, no network.

/** The two resolution tiers. Which one applies is a property of the MODEL, not of the image. */
export interface ResolutionTier {
  name: 'standard' | 'high';
  maxEdge: number;
  maxTokens: number;
}

export const STANDARD_TIER: ResolutionTier = { name: 'standard', maxEdge: 1568, maxTokens: 1568 };
export const HIGH_TIER: ResolutionTier = { name: 'high', maxEdge: 2576, maxTokens: 4784 };

/**
 * Which tier a model id belongs to.
 *
 * High resolution is Claude 4.7 and later. Defaulting UNKNOWN models to standard is deliberate and
 * is the safe direction: assuming standard on a high-tier model wastes some available detail, while
 * assuming high on a standard model produces bands that are quietly downscaled — the exact failure
 * this module exists to prevent. Be pessimistic; the cost of being wrong is asymmetric.
 */
export function tierForModel(model: string): ResolutionTier {
  const m = model.toLowerCase();
  // Families known to be high-resolution. Matched loosely because model ids carry date suffixes.
  if (/claude-(opus|sonnet|haiku)-([5-9]|\d{2,})/.test(m)) return HIGH_TIER;
  const four7 = /claude-[a-z]+-4-(\d+)/.exec(m);
  if (four7 && Number(four7[1]) >= 7) return HIGH_TIER;
  return STANDARD_TIER;
}

/** Visual tokens an image costs: one per 28×28 patch. */
export function countImageTokens(width: number, height: number): number {
  return Math.ceil(width / 28) * Math.ceil(height / 28);
}

/**
 * Does this image pass through untouched?
 *
 * Note the `ceil(x/28)*28 <= maxEdge` form rather than a plain `x <= maxEdge`: the edge is measured
 * AFTER padding up to the next multiple of 28, so a 1560-wide image is treated as 1568 and a
 * 1569-wide one as 1596. Copied from the reference implementation rather than simplified, because
 * the simplification is wrong by one patch at exactly the sizes a tiler aims for.
 */
export function fitsNatively(width: number, height: number, tier: ResolutionTier = STANDARD_TIER): boolean {
  return (
    Math.ceil(width / 28) * 28 <= tier.maxEdge
    && Math.ceil(height / 28) * 28 <= tier.maxEdge
    && countImageTokens(width, height) <= tier.maxTokens
  );
}

/**
 * Round half to even, matching Python's `round()`.
 *
 * The live API resolves exact .5 ties toward the even neighbour. `Math.round` rounds them up, which
 * computes a different size for some images — and a size that is off by one pixel puts every
 * coordinate derived from it off target. Straight from the reference implementation.
 */
export function roundTiesToEven(value: number): number {
  const floor = Math.floor(value);
  if (value - floor !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * The size Claude resizes an image to, before padding. Images that already fit come back unchanged.
 *
 * Binary search along the long edge for the largest aspect-preserving size that satisfies both
 * limits — again the reference implementation, not an approximation. Scaling to the edge length by
 * hand gets 1920×1080 wrong: the real answer is 1456×819, not 1568×882.
 */
export function resizedSize(
  width: number,
  height: number,
  tier: ResolutionTier = STANDARD_TIER,
): [number, number] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return [Math.max(1, Math.round(width) || 1), Math.max(1, Math.round(height) || 1)];
  }
  const w = Math.round(width);
  const h = Math.round(height);

  if (fitsNatively(w, h, tier)) return [w, h];
  if (h > w) {
    const [rh, rw] = resizedSize(h, w, tier);
    return [rw, rh];
  }

  const aspectRatio = w / h;
  let lo = 1;   // always fits
  let hi = w;   // never fits
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fitsNatively(mid, Math.max(roundTiesToEven(mid / aspectRatio), 1), tier)) lo = mid;
    else hi = mid;
  }
  return [lo, Math.max(roundTiesToEven(lo / aspectRatio), 1)];
}

/** How much detail an image loses on the way in. 1 means none. */
export function retainedScale(
  width: number,
  height: number,
  tier: ResolutionTier = STANDARD_TIER,
): number {
  if (width < 1 || height < 1) return 1;
  const [rw] = resizedSize(width, height, tier);
  return rw / width;
}

/**
 * Map a pixel coordinate Claude returned back onto the image you actually hold.
 *
 * Claude answers in the coordinate space of the image it saw — your image after ITS resize. Using
 * those numbers directly against the original crops the wrong rectangle, and the error grows with
 * how much the image was shrunk, so it is largest on exactly the tall receipt photos that need
 * cropping most.
 *
 * Coordinates are clamped to the resized bounds first, so a box the model pushed slightly off the
 * edge cannot map outside the original. Padding is bottom/right only, so the origin does not move
 * and a per-axis linear rescale is enough.
 */
export function mapCoordinateToOriginal(
  x: number,
  y: number,
  originalWidth: number,
  originalHeight: number,
  tier: ResolutionTier = STANDARD_TIER,
): [number, number] {
  const [rw, rh] = resizedSize(originalWidth, originalHeight, tier);
  const cx = Math.min(Math.max(x, 0), rw);
  const cy = Math.min(Math.max(y, 0), rh);
  return [(cx / rw) * originalWidth, (cy / rh) * originalHeight];
}

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** The same mapping for a whole box, kept ordered (x1<x2, y1<y2) so a flipped answer cannot become
 *  a negative-size crop that `sharp` rejects at run time. */
export function mapBoxToOriginal(
  box: Box,
  originalWidth: number,
  originalHeight: number,
  tier: ResolutionTier = STANDARD_TIER,
): Box {
  const [ax, ay] = mapCoordinateToOriginal(box.x1, box.y1, originalWidth, originalHeight, tier);
  const [bx, by] = mapCoordinateToOriginal(box.x2, box.y2, originalWidth, originalHeight, tier);
  return {
    x1: Math.min(ax, bx),
    y1: Math.min(ay, by),
    x2: Math.max(ax, bx),
    y2: Math.max(ay, by),
  };
}
