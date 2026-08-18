// lib/receipts/render.ts — turn one photo into the images the deep reader actually looks at.
//
// Owner, 2026-08-18: *"I want it so that the AI determines what in the image is the actual receipt
// and what is the background, then it should crop the image to just the receipt, then it should
// break the receipt down into smaller sections, then it should thoroughly analyze each section."*
//
// This is the `sharp` half. The decisions live in `tiling.ts` and `vision-geometry.ts`, which are
// pure and heavily tested; this file only carries them out. Same split as
// `lib/media/image-format.ts` vs `lib/media/normalise-image.ts`, and for the same reason — a native
// binary in the module makes the interesting logic untestable.
//
// ── EVERY BAND IS SENT TWICE, AND THAT IS THE POINT ─────────────────────────────────────────────
//
// Once as photographed, once contrast-stretched. Thermal receipts fade unevenly, and a contrast
// stretch is the standard document-OCR remedy — but it is not a free win, because stretching a
// half-missing stroke can turn a genuinely ambiguous 8 into a confident 3. Sending both and asking
// the reader to compare them converts that risk into information: where the two renderings disagree,
// the character is exactly the kind a person should re-check, and the reader is told to say so.
//
// Enhancing in place and hoping would be the version that quietly costs somebody money.

import sharp from 'sharp';
import { planTiles, type TilePlan } from './tiling';
import { STANDARD_TIER, resizedSize, type Box, type ResolutionTier } from './vision-geometry';

export interface Dimensions {
  width: number;
  height: number;
}

/** PNG, not JPEG. The bands are re-encoded from an already-lossy phone photo, and Anthropic's own
 *  guidance warns that repeated lossy passes make text harder to read — *"heavy JPEG compression can
 *  make text difficult to read"*. A receipt band is small, so losslessness is nearly free. */
const PNG = { compressionLevel: 6 } as const;

/**
 * Decode, honour EXIF rotation, and report the true dimensions.
 *
 * `rotate()` with no argument applies the EXIF orientation and then STRIPS it. Skipping this is a
 * classic silent failure: a phone photo taken in portrait is stored landscape with an orientation
 * flag, so every crop box computed against the un-rotated pixels lands on the wrong part of the
 * paper — while the image still looks upright in every viewer a person would check it in.
 */
export async function loadUpright(input: Buffer): Promise<{ bytes: Buffer; dims: Dimensions }> {
  const img = sharp(input, { failOn: 'none' }).rotate();
  const bytes = await img.png(PNG).toBuffer();
  const meta = await sharp(bytes).metadata();
  return {
    bytes,
    dims: { width: meta.width ?? 0, height: meta.height ?? 0 },
  };
}

/**
 * The image used to ASK where the receipt is.
 *
 * Pre-resized to exactly what the model will see, so the pixel coordinates it returns map one to one
 * onto this image with no conversion. Anthropic recommends precisely this: *"The most reliable
 * approach is to resize your image yourself before uploading, so the image you have is exactly the
 * image Claude sees and the coordinates need no conversion."*
 *
 * The alternative — send the original and rescale the answer — works too, but it puts a second
 * chance to be wrong between the model and a crop rectangle, and a wrong crop silently discards part
 * of the receipt.
 */
export async function renderLocatorView(
  input: Buffer,
  dims: Dimensions,
  tier: ResolutionTier = STANDARD_TIER,
): Promise<{ bytes: Buffer; dims: Dimensions }> {
  const [w, h] = resizedSize(dims.width, dims.height, tier);
  if (w === dims.width && h === dims.height) {
    return { bytes: input, dims };
  }
  const bytes = await sharp(input).resize(w, h, { fit: 'fill' }).png(PNG).toBuffer();
  return { bytes, dims: { width: w, height: h } };
}

/**
 * Crop to the receipt, with a small margin.
 *
 * The margin is not politeness. Anthropic's own limitation note says spatial reasoning is
 * approximate, and a box drawn a few pixels inside the paper shaves the first character off a line —
 * which reads as a confident, wrong transcription rather than as a crop error. Erring outward costs
 * a strip of background and nothing else, so the asymmetry decides it.
 *
 * The box arrives in ORIGINAL pixel coordinates; converting from what the model saw is the caller's
 * job (`mapBoxToOriginal`), because only the caller knows which image it asked about.
 */
export async function cropToBox(
  input: Buffer,
  dims: Dimensions,
  box: Box,
  marginFraction = 0.02,
): Promise<{ bytes: Buffer; dims: Dimensions; applied: Box }> {
  const mx = (box.x2 - box.x1) * marginFraction;
  const my = (box.y2 - box.y1) * marginFraction;

  const left = Math.max(0, Math.floor(box.x1 - mx));
  const top = Math.max(0, Math.floor(box.y1 - my));
  const right = Math.min(dims.width, Math.ceil(box.x2 + mx));
  const bottom = Math.min(dims.height, Math.ceil(box.y2 + my));

  const width = right - left;
  const height = bottom - top;

  // A degenerate box means the locator failed, not that the receipt is two pixels wide. Returning
  // the original uncropped is the safe answer: reading the whole photo is worse than reading a tight
  // crop, and far better than reading a sliver of it.
  if (width < 32 || height < 32) {
    return { bytes: input, dims, applied: { x1: 0, y1: 0, x2: dims.width, y2: dims.height } };
  }

  const bytes = await sharp(input).extract({ left, top, width, height }).png(PNG).toBuffer();
  return {
    bytes,
    dims: { width, height },
    applied: { x1: left, y1: top, x2: right, y2: bottom },
  };
}

/** Straighten a receipt photographed at a slight angle. Small angles only — see `deskew`. */
export async function rotateBy(input: Buffer, degrees: number): Promise<{ bytes: Buffer; dims: Dimensions }> {
  if (!Number.isFinite(degrees) || Math.abs(degrees) < 0.5) {
    const meta = await sharp(input).metadata();
    return { bytes: input, dims: { width: meta.width ?? 0, height: meta.height ?? 0 } };
  }
  // Clamped hard. A confident small angle is a skewed photo; a large one usually means the model
  // read the receipt's orientation wrong, and rotating 40° on that guess destroys a readable image.
  const angle = Math.max(-15, Math.min(15, degrees));
  const bytes = await sharp(input)
    .rotate(angle, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png(PNG)
    .toBuffer();
  const meta = await sharp(bytes).metadata();
  return { bytes, dims: { width: meta.width ?? 0, height: meta.height ?? 0 } };
}

export interface RenderedBand {
  index: number;
  /** As photographed, at native resolution. */
  plain: Buffer;
  /** Contrast-stretched and sharpened, for faded thermal print. */
  enhanced: Buffer;
  /** Output pixel size of both. */
  dims: Dimensions;
  /** Where this band sits in the cropped receipt, 0..1. */
  startFraction: number;
  endFraction: number;
}

/**
 * Cut the receipt into bands, each rendered twice.
 *
 * The plan guarantees every row is covered and every band passes the model's size limits untouched;
 * this only executes it. Bands are produced sequentially — `sharp` is already threaded internally,
 * and running ten resizes concurrently on a serverless function competes for the same cores while
 * multiplying peak memory.
 */
export async function renderBands(
  input: Buffer,
  dims: Dimensions,
  plan: TilePlan,
): Promise<RenderedBand[]> {
  const out: RenderedBand[] = [];

  for (const band of plan.bands) {
    // Clamped to the image. A plan is arithmetic on reported dimensions, and `extract` throws rather
    // than clipping if those are off by a pixel — a hard failure of the whole extraction over a
    // rounding error at the bottom edge.
    const top = Math.max(0, Math.min(band.top, Math.max(0, dims.height - 1)));
    const height = Math.max(1, Math.min(band.height, dims.height - top));

    const region = sharp(input).extract({ left: 0, top, width: dims.width, height });
    const outHeight = Math.max(1, Math.round(height * plan.scale));

    const plain = await region
      .clone()
      .resize(plan.outputWidth, outHeight, { fit: 'fill', kernel: 'lanczos3' })
      .png(PNG)
      .toBuffer();

    const enhanced = await region
      .clone()
      .resize(plan.outputWidth, outHeight, { fit: 'fill', kernel: 'lanczos3' })
      .greyscale()
      // `normalise` stretches the histogram so the palest surviving ink reaches full black. This is
      // the single most effective thing that can be done to faded thermal paper.
      .normalise()
      // Gentle. A heavy unsharp mask on thermal print manufactures strokes that are not there, which
      // is worse than leaving a digit faint — a faint digit gets flagged, an invented one does not.
      .sharpen({ sigma: 1 })
      .png(PNG)
      .toBuffer();

    out.push({
      index: band.index,
      plain,
      enhanced,
      dims: { width: plan.outputWidth, height: outHeight },
      startFraction: band.startFraction,
      endFraction: band.endFraction,
    });
  }

  return out;
}

/**
 * A close crop of one region, for a targeted second look.
 *
 * Used by the verification passes: having read a total off the whole receipt, the reader is shown
 * ONLY the total block, enlarged, and asked what the digits are with no other context to lean on.
 * `fractions` are relative to the cropped receipt so the caller never handles pixels.
 */
export async function renderRegion(
  input: Buffer,
  dims: Dimensions,
  fractions: { top: number; bottom: number; left?: number; right?: number },
  tier: ResolutionTier = STANDARD_TIER,
): Promise<{ bytes: Buffer; dims: Dimensions } | null> {
  const left = Math.max(0, Math.floor((fractions.left ?? 0) * dims.width));
  const right = Math.min(dims.width, Math.ceil((fractions.right ?? 1) * dims.width));
  const top = Math.max(0, Math.floor(fractions.top * dims.height));
  const bottom = Math.min(dims.height, Math.ceil(fractions.bottom * dims.height));

  const width = right - left;
  const height = bottom - top;
  if (width < 16 || height < 16) return null;

  const region = await sharp(input).extract({ left, top, width, height }).toBuffer();

  // Enlarge the crop to fill the model's budget. A total block is a few hundred pixels tall; sending
  // it at native size wastes most of the resolution the model is willing to look at, and this is the
  // one call whose entire purpose is to resolve individual digits.
  const [tw, th] = resizedSize(width * 4, height * 4, tier);
  const bytes = await sharp(region)
    .resize(tw, th, { fit: 'fill', kernel: 'lanczos3' })
    .greyscale()
    .normalise()
    .sharpen({ sigma: 1 })
    .png(PNG)
    .toBuffer();

  return { bytes, dims: { width: tw, height: th } };
}

/** Plan and render in one step, for callers that do not need the plan separately. */
export async function prepareBands(
  input: Buffer,
  dims: Dimensions,
  tier: ResolutionTier = STANDARD_TIER,
): Promise<{ plan: TilePlan; bands: RenderedBand[] }> {
  const plan = planTiles(dims.width, dims.height, { tier });
  const bands = await renderBands(input, dims, plan);
  return { plan, bands };
}
