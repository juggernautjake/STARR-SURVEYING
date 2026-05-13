// worker/src/services/subdivision-lot-isolator.ts
// Subdivision Lot Isolator — Phase 4 Image Intelligence
//
// For subdivision plats containing multiple lots, this service:
//   1. Sends the full plat image to Claude Vision to identify lot bounding regions
//   2. Crops each lot into a standalone image with padding
//   3. Upscales the cropped image for maximum OCR accuracy
//   4. Runs per-lot Vision extraction on the isolated, upscaled image
//
// This dramatically improves extraction accuracy for dense subdivision plats
// where individual lot labels, bearings, and distances are too small or too
// tightly packed for the standard grid-based OCR to reliably separate.
//
// Spec: docs/planning/in-progress/STARR_RECON/PHASE_04_SUBDIVISION.md §4.6

import Anthropic from '@anthropic-ai/sdk';
import type { PipelineLogger } from '../lib/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A bounding region for a single lot identified by AI */
export interface LotRegion {
  lotName: string;
  /** Percentage-based bounding box (0-100) relative to full image */
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

/** Result of analyzing a single isolated lot image */
export interface IsolatedLotResult {
  lotName: string;
  /** Raw OCR text extracted from the isolated, upscaled lot image */
  extractedText: string;
  /** Confidence score from scoreConfidence() */
  confidence: number;
  /** Dimensions of the cropped image */
  cropWidth: number;
  cropHeight: number;
  /** Upscale factor applied */
  upscaleFactor: number;
}

/** Full result from the lot isolation pipeline */
export interface LotIsolationResult {
  /** Per-lot extraction results */
  lots: IsolatedLotResult[];
  /** Lots that could not be isolated (too small, overlapping, etc.) */
  failedLots: { lotName: string; reason: string }[];
  /** Total API calls made */
  totalApiCalls: number;
  /** Analysis limitations detected during isolation */
  limitations: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AI_MODEL = process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-6';

/** Minimum cropped lot dimension (px) — below this the lot is too small to extract */
const MIN_LOT_DIMENSION = 100;

/** Target minimum dimension for upscaled lot images (px) */
const TARGET_UPSCALE_DIM = 2000;

/** Maximum upscale factor to avoid blurry interpolation artifacts */
const MAX_UPSCALE_FACTOR = 4;

/** Padding around each lot region as percentage of its dimensions */
const LOT_PADDING_PCT = 0.10;

/** Anthropic Vision API hard limit */
const MAX_IMAGE_BYTES = 4_718_592;

// ── Lot Region Detection ──────────────────────────────────────────────────────

const LOT_DETECTION_PROMPT = `You are a professional land surveyor analyzing a subdivision plat image.

Identify the bounding region of EVERY individual lot, reserve, and common area visible on this plat.

For each lot/reserve/common area, provide its approximate bounding box as a percentage of the total image dimensions.

RULES:
- Include ALL lots, even small ones
- Each bounding box should encompass the lot boundary, its label, and any bearing/distance text along its edges
- Add 5-10% padding to ensure text at the edges is captured
- Use percentage coordinates (0-100) relative to the full image
- If lots overlap or share boundaries, it's OK for bounding boxes to overlap
- If a lot's boundary data is in a line/curve table elsewhere on the sheet, note that

Return ONLY valid JSON, no markdown fences:
{
  "lots": [
    {
      "lotName": "Lot 1",
      "xPct": 10.0,
      "yPct": 20.0,
      "widthPct": 25.0,
      "heightPct": 30.0
    }
  ],
  "hasLineTable": true,
  "hasCommonAreas": false,
  "platDensity": "high|medium|low",
  "limitations": ["Any limitations noticed about the plat image quality"]
}`;

/**
 * Use Claude Vision to detect the bounding regions of all lots in a plat image.
 */
async function detectLotRegions(
  imageBuffer: Buffer,
  mediaType: 'image/png' | 'image/jpeg',
  apiKey: string,
  logger: PipelineLogger,
): Promise<{ regions: LotRegion[]; limitations: string[] }> {
  const client = new Anthropic({ apiKey });
  const base64 = imageBuffer.toString('base64');

  try {
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 4096,
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: LOT_DETECTION_PROMPT },
        ],
      }],
    });

    const textBlock = response.content.find((c: { type: string }) => c.type === 'text');
    const raw = textBlock?.type === 'text' ? textBlock.text : '{}';
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      logger.warn('LotIsolator', 'Could not parse lot detection JSON — falling back to grid');
      return { regions: [], limitations: ['AI lot detection returned unparseable response'] };
    }

    const limitations: string[] = [];
    if (Array.isArray(parsed.limitations)) {
      for (const l of parsed.limitations) {
        if (typeof l === 'string') limitations.push(l);
      }
    }

    if (parsed.platDensity === 'high') {
      limitations.push('Dense subdivision plat — lot boundaries are tightly packed, some text may overlap between adjacent lots');
    }

    if (parsed.hasLineTable) {
      limitations.push('Boundary data references a line/curve table — lot isolation may not capture table entries that are located elsewhere on the sheet');
    }

    const regions: LotRegion[] = [];
    if (Array.isArray(parsed.lots)) {
      for (const lot of parsed.lots) {
        const o = lot as Record<string, unknown>;
        if (typeof o.lotName === 'string' &&
            typeof o.xPct === 'number' &&
            typeof o.yPct === 'number' &&
            typeof o.widthPct === 'number' &&
            typeof o.heightPct === 'number') {
          regions.push({
            lotName: o.lotName,
            xPct: o.xPct,
            yPct: o.yPct,
            widthPct: o.widthPct,
            heightPct: o.heightPct,
          });
        }
      }
    }

    return { regions, limitations };
  } catch (err) {
    logger.warn('LotIsolator', `Lot detection failed: ${err instanceof Error ? err.message : String(err)}`);
    return { regions: [], limitations: ['AI lot detection call failed — falling back to standard grid OCR'] };
  }
}

// ── Per-Lot Extraction ────────────────────────────────────────────────────────

const LOT_EXTRACTION_PROMPT = `You are a professional land surveyor analyzing an isolated, upscaled image of a single lot from a subdivision plat.

This image shows ONLY one lot (or reserve/common area). Extract ALL surveying data visible:

REQUIRED:
- LOT NAME/NUMBER
- ACREAGE and/or SQUARE FOOTAGE
- Every BEARING in exact DMS format: N/S ##°##'##" E/W
- Every DISTANCE in feet to hundredths
- CURVE DATA: R=, L=, chord bearing, chord distance, delta/central angle
- LINE TABLE references (L1, L2, etc.) and their values
- CURVE TABLE references (C1, C2, etc.) and their values
- MONUMENTS at corners ("fnd conc mon", "set 1/2 IR", etc.)
- EASEMENTS crossing or bordering this lot
- SETBACK LINES and distances
- ADJACENT LOT names visible along shared boundaries
- Any NOTES or text within or immediately around this lot

PRECISION RULES:
- If text is partially obscured, give your BEST reading and mark with [?]
- If a number could be two values, list BOTH: "532 [or possibly 132]"
- NEVER skip text because it is hard to read
- Distinguish between similar characters: 0/O, 1/l, 5/S, 8/B, 6/G

Output structured text with one data item per line.`;

/**
 * Extract survey data from a single isolated lot image.
 */
async function extractIsolatedLot(
  lotBuffer: Buffer,
  mediaType: 'image/png' | 'image/jpeg',
  lotName: string,
  apiKey: string,
  logger: PipelineLogger,
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const base64 = lotBuffer.toString('base64');

  try {
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 4096,
      temperature: 0,
      system: LOT_EXTRACTION_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `This is an isolated image of "${lotName}" from a subdivision plat. Extract all surveying data.` },
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        ],
      }],
    });

    const textBlock = response.content.find((c: { type: string }) => c.type === 'text');
    return textBlock?.type === 'text' ? textBlock.text : '';
  } catch (err) {
    logger.warn('LotIsolator', `[${lotName}] Extraction failed: ${err instanceof Error ? err.message : String(err)}`);
    return '';
  }
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Isolate individual lots from a subdivision plat image, upscale each,
 * and run dedicated AI extraction on every lot independently.
 *
 * @param imageBuffer  Full plat image (PNG or JPEG)
 * @param mediaType    MIME type of the image
 * @param apiKey       Anthropic API key
 * @param logger       Pipeline logger
 * @param knownLotNames  Lot names from prior plat analysis (used to validate detection)
 */
export async function isolateAndAnalyzeLots(
  imageBuffer: Buffer,
  mediaType: 'image/png' | 'image/jpeg',
  apiKey: string,
  logger: PipelineLogger,
  knownLotNames?: string[],
): Promise<LotIsolationResult> {
  let totalApiCalls = 0;
  const limitations: string[] = [];
  const failedLots: LotIsolationResult['failedLots'] = [];

  // ── Load sharp ────────────────────────────────────────────────────────────
  let sharpLib: typeof import('sharp') | null = null;
  try {
    sharpLib = (await import('sharp')).default;
  } catch {
    logger.warn('LotIsolator', 'sharp not available — cannot crop/upscale lot images');
    limitations.push('Image processing library (sharp) not available — lot isolation skipped');
    return { lots: [], failedLots: [], totalApiCalls: 0, limitations };
  }

  // ── Get image dimensions ──────────────────────────────────────────────────
  const meta = await sharpLib(imageBuffer).metadata();
  const imgWidth = meta.width ?? 1000;
  const imgHeight = meta.height ?? 1000;

  logger.info('LotIsolator', `Plat image: ${imgWidth}×${imgHeight}px — detecting lot regions...`);

  // ── Step 1: Detect lot regions via AI ──────────────────────────────────────
  const detection = await detectLotRegions(imageBuffer, mediaType, apiKey, logger);
  totalApiCalls++;
  limitations.push(...detection.limitations);

  if (detection.regions.length === 0) {
    logger.info('LotIsolator', 'No lot regions detected — lot isolation skipped');
    limitations.push('AI could not identify individual lot regions on the plat — standard grid OCR was used instead');
    return { lots: [], failedLots: [], totalApiCalls, limitations };
  }

  logger.info('LotIsolator', `Detected ${detection.regions.length} lot regions`);

  // Validate against known lot names if available
  if (knownLotNames && knownLotNames.length > 0) {
    const detectedNames = new Set(detection.regions.map(r => r.lotName.toUpperCase()));
    const missingFromDetection = knownLotNames.filter(n => !detectedNames.has(n.toUpperCase()));
    if (missingFromDetection.length > 0) {
      limitations.push(
        `${missingFromDetection.length} known lot(s) not detected in isolation pass: ${missingFromDetection.join(', ')} — ` +
        'these lots may be too small, unlabeled, or in an area not recognized by the AI'
      );
      logger.warn('LotIsolator',
        `${missingFromDetection.length} known lots missing from detection: ${missingFromDetection.join(', ')}`);
    }
  }

  // ── Step 2: Crop, upscale, and extract each lot ────────────────────────────
  const lots: IsolatedLotResult[] = [];

  for (const region of detection.regions) {
    const { lotName, xPct, yPct, widthPct, heightPct } = region;

    // Convert percentage coordinates to pixels with padding
    const padX = Math.round((widthPct / 100) * imgWidth * LOT_PADDING_PCT);
    const padY = Math.round((heightPct / 100) * imgHeight * LOT_PADDING_PCT);

    const left = Math.max(0, Math.round((xPct / 100) * imgWidth) - padX);
    const top = Math.max(0, Math.round((yPct / 100) * imgHeight) - padY);
    const right = Math.min(imgWidth, Math.round(((xPct + widthPct) / 100) * imgWidth) + padX);
    const bottom = Math.min(imgHeight, Math.round(((yPct + heightPct) / 100) * imgHeight) + padY);
    const cropW = right - left;
    const cropH = bottom - top;

    // Skip lots that are too small to extract meaningfully
    if (cropW < MIN_LOT_DIMENSION || cropH < MIN_LOT_DIMENSION) {
      failedLots.push({ lotName, reason: `Cropped region too small (${cropW}×${cropH}px)` });
      limitations.push(`${lotName}: cropped region too small (${cropW}×${cropH}px) for reliable extraction`);
      continue;
    }

    logger.info('LotIsolator',
      `[${lotName}] Cropping: ${left},${top} ${cropW}×${cropH}px`);

    try {
      // Crop the lot region
      let lotBuffer = await sharpLib(imageBuffer)
        .extract({ left, top, width: cropW, height: cropH })
        .png()
        .toBuffer();

      // Compute upscale factor
      const minDim = Math.min(cropW, cropH);
      let upscaleFactor = 1;
      if (minDim < TARGET_UPSCALE_DIM) {
        upscaleFactor = Math.min(MAX_UPSCALE_FACTOR, Math.ceil(TARGET_UPSCALE_DIM / minDim));
      }

      // Upscale if needed
      if (upscaleFactor > 1) {
        const newW = cropW * upscaleFactor;
        const newH = cropH * upscaleFactor;

        // Check that upscaled image won't exceed API limit
        const estimatedBytes = newW * newH * 4; // rough RGBA estimate
        if (estimatedBytes < MAX_IMAGE_BYTES * 3) { // PNG compresses well
          lotBuffer = await sharpLib(lotBuffer)
            .resize(newW, newH, { kernel: 'lanczos3' })
            .sharpen({ sigma: 0.8 }) // light sharpen after upscale
            .png()
            .toBuffer();

          logger.info('LotIsolator',
            `[${lotName}] Upscaled ${upscaleFactor}x → ${newW}×${newH}px`);
        } else {
          upscaleFactor = 1;
          logger.info('LotIsolator',
            `[${lotName}] Skipping upscale — result would exceed API size limit`);
        }
      }

      // Check final buffer size
      if (lotBuffer.length > MAX_IMAGE_BYTES) {
        // Compress as JPEG
        lotBuffer = await sharpLib(lotBuffer).jpeg({ quality: 85 }).toBuffer();
        if (lotBuffer.length > MAX_IMAGE_BYTES) {
          failedLots.push({ lotName, reason: `Image too large after compression (${(lotBuffer.length / 1024 / 1024).toFixed(1)} MiB)` });
          continue;
        }
      }

      // Extract data from the isolated lot
      const extractedText = await extractIsolatedLot(
        lotBuffer,
        lotBuffer.length > MAX_IMAGE_BYTES * 0.8 ? 'image/jpeg' : 'image/png',
        lotName,
        apiKey,
        logger,
      );
      totalApiCalls++;

      // Score confidence using the same function from adaptive-vision
      const { scoreConfidence } = await import('./adaptive-vision.js');
      const score = scoreConfidence(extractedText);

      logger.info('LotIsolator',
        `[${lotName}] Extraction: confidence=${score.confidence}, ` +
        `bearings=${score.bearings}, distances=${score.distances}, ` +
        `lots=${score.lotRefs}, uncertainty=${score.uncertaintyScore}`);

      lots.push({
        lotName,
        extractedText,
        confidence: score.confidence,
        cropWidth: cropW,
        cropHeight: cropH,
        upscaleFactor,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failedLots.push({ lotName, reason: msg });
      logger.warn('LotIsolator', `[${lotName}] Failed: ${msg}`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const avgConf = lots.length > 0
    ? Math.round(lots.reduce((s, l) => s + l.confidence, 0) / lots.length)
    : 0;

  if (failedLots.length > 0) {
    limitations.push(
      `${failedLots.length} lot(s) could not be isolated: ${failedLots.map(f => `${f.lotName} (${f.reason})`).join('; ')}`
    );
  }

  logger.info('LotIsolator',
    `Lot isolation complete: ${lots.length} lots extracted (avg confidence ${avgConf}%), ` +
    `${failedLots.length} failed, ${totalApiCalls} API calls, ` +
    `${limitations.length} limitation(s)`);

  return { lots, failedLots, totalApiCalls, limitations };
}
