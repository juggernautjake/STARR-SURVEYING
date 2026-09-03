// worker/src/services/adaptive-vision.ts
// Adaptive Vision System v2 — 6-Phase Quadrant-Based OCR
//
// Implements the pipeline from Starr Software Spec v2.0 §5.
// Replaces the deprecated single-image approach for large plat documents
// (subdivision plats scanned at 200-300 DPI are 7,000-12,000px on the long
// dimension — well above Claude Vision's 8,000px maximum).
//
// Six phases:
//   1. IMAGE ANALYSIS   — dimensions, DPI estimation, sheet-size matching
//   2. GRID SELECTION   — smallest 2×2/2×4/4×4/4×8 grid where fine text ≥ 13px
//   3. CROP             — sharp.extract() with 5% overlap between segments
//   4. VISION EXTRACTION — per-segment Claude Vision call
//   5. CONFIDENCE SCORING — regex-based data-point vs uncertainty signal counting
//   6. ESCALATION        — low-confidence (<60) segments split 2×2 with 8% overlap

import type { PipelineLogger } from '../lib/logger.js';
import Anthropic from '@anthropic-ai/sdk';
import { recordAmbientAiCall } from '../infra/usage.js';
import { samplingFor } from '../infra/model-sampling.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Confidence scoring breakdown for a single segment (exported for testing). */
export interface SegmentScore {
  confidence: number;
  dataPoints: number;
  uncertaintyScore: number;
  /** Number of [?] markers found — each carries weight 3 in the uncertainty score */
  uncertainMarkers: number;
  /** Number of uncertainty-phrase words (obscured, watermark, etc.) — weight 2 */
  uncertainWords: number;
  bearings: number;
  distances: number;
  lotRefs: number;
  curveData: number;
  lineTable: number;
  needsZoom: boolean;
  needsManualReview: boolean;
}

export interface SegmentResult {
  segmentId: string;
  row: number;
  col: number;
  /** 0 = primary quadrant; 1 = zoom sub-segment */
  depth: number;
  boundingBox: { x: number; y: number; w: number; h: number };
  text: string;
  confidence: number;
  dataPoints: number;
  uncertaintyScore: number;
  bearings: number;
  distances: number;
  flaggedForZoom: boolean;
  flaggedForManualReview: boolean;
  /** Zoom sub-segments (populated when flaggedForZoom was true) */
  zoomResults?: SegmentResult[];
}

export interface AdaptiveVisionResult {
  /** All segment texts concatenated with segment headers */
  mergedText: string;
  /** Average confidence across all primary segments */
  overallConfidence: number;
  totalSegments: number;
  escalatedSegments: number;
  manualReviewSegments: number;
  segments: SegmentResult[];
  strategy: 'single' | 'grid';
  gridUsed: { rows: number; cols: number } | null;
  totalApiCalls: number;
  durationMs: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// ── THE SAME PHYSICS WAS WRITTEN DOWN TWICE ──────────────────────────────────────────────────
//
// `services/ocr-legibility.ts` has carried `FINE_TEXT_HEIGHT_IN = 0.07`, `MIN_FINE_TEXT_PX = 13`
// and `API_MAX_PIXELS = 8_000` since it was written — the same three numbers this module declared
// for itself. They happened to agree. Nothing made them agree, and a grid selector and a legibility
// rater disagreeing about how tall readable text is would be a very quiet way to be wrong.
//
// Imported from there because that is the module whose subject IS legibility; this one's subject is
// segmentation. `ocr-legibility.ts` imports nothing, deliberately, so the arrow only points one way.
import {
  FINE_TEXT_HEIGHT_IN, MIN_FINE_TEXT_PX, API_MAX_PIXELS as CLAUDE_MAX_PIXELS,
} from './ocr-legibility.js';
/** Normal inter-segment overlap (5%) */
export const OVERLAP_PCT = 0.05;
/** Zoom escalation overlap (8%) */
const ZOOM_OVERLAP_PCT = 0.08;
/** Confidence below this triggers auto-zoom (provided the segment has data) */
const CONFIDENCE_ZOOM_THRESHOLD = 60;
/** Confidence below this flags for manual surveyor review */
const CONFIDENCE_MANUAL_THRESHOLD = 50;
/** Base64 byte threshold below which segmentation is skipped (~600 KB decoded) */
const SMALL_IMAGE_BYTES = 800_000;
/** Anthropic Vision API hard limit: 5 MiB per image. Use 4.5 MiB as safety margin. */
const MAX_IMAGE_BYTES = 4_718_592; // 4.5 MiB

/** Standard sheet sizes (width × height in inches).
 *
 *  ── LETTER AND LEGAL WERE MISSING, AND MOST DOCUMENTS ARE LETTER ────────────────────────────
 *
 *  This list held plat sheets only, so an ordinary 8.5×11 deed page was measured against a 24×36
 *  sheet. A 2550×3300 scan — letter at a perfectly good 300 DPI — was therefore computed as
 *  3300/36 ≈ **92 DPI**, its fine text estimated at 6.4px against a 13px floor, and the grid
 *  selector fell through to its finest option: 4×8, **thirty-two Vision calls for one deed page**,
 *  each able to escalate to four more and those to four more again.
 *
 *  Deeds are the majority of what this system reads. */
const STANDARD_SIZES = [
  { name: '24×36',  widthIn: 24, heightIn: 36 },
  { name: '18×24',  widthIn: 18, heightIn: 24 },
  { name: '30×42',  widthIn: 30, heightIn: 42 },
  { name: '11×17',  widthIn: 11, heightIn: 17 },
  { name: 'legal',  widthIn: 8.5, heightIn: 14 },
  { name: 'letter', widthIn: 8.5, heightIn: 11 },
] as const;

/** Grid options evaluated in order — smallest satisfying grid wins */
const GRID_OPTIONS = [
  { rows: 2, cols: 2 },
  { rows: 2, cols: 4 },
  { rows: 4, cols: 4 },
  { rows: 4, cols: 8 },
] as const;

// ── Extraction prompt (spec §5, Phase 4) ─────────────────────────────────────

const EXTRACTION_PROMPT = `You are a professional land surveyor analyzing a high-resolution segment of a subdivision plat.

REQUIRED EXTRACTIONS:
LOT DATA: Lot numbers, square footage, acreage
BEARINGS: Every bearing in exact format N/S ##°##'##" E/W
DISTANCES: Every distance in feet, to hundredths
CURVE DATA: For every curve extract ALL of: R=, L= or A=, LC= or C=, chord bearing, delta/central angle
LINE TABLE: L1, L2, L3... entries with bearings and distances
CURVE TABLE: C1, C2, C3... entries with all parameters
MONUMENTS: "fnd conc mon", "set 1/2 IR", TxDOT monuments
EASEMENTS: Widths, types, recording references
ROAD INFO: Names, ROW widths, centerline data
SETBACKS: Building setback line distances
NOTES: Text blocks, dedications, certifications
ADJACENT OWNERS: Names, called acreages, instrument numbers

PRECISION RULES:
- If a character is partially obscured by a watermark, give your BEST reading and mark with [?]
- If a number could be two values, list BOTH: "532 [or possibly 132]"
- NEVER skip text because it is hard to read
- Preserve EXACT degree/minute/second notation: °, ', "
- Distinguish between similar characters: 0/O, 1/l, 5/S, 8/B, 6/G
- For bearings: verify the quadrant makes geometric sense for the line direction shown
- Include ALL text even if it seems redundant with other segments
- Output all findings in structured text format — one data item per line`;

// ── Phase 1: Image analysis ───────────────────────────────────────────────────

export interface ImageInfo {
  width: number;
  height: number;
  estimatedDpi: number;
  sheetName: string;
}

/**
 * Estimate the physical sheet and scan resolution behind a bitmap.
 *
 * ── THE LOOP RETURNED ON ITS FIRST ITERATION, ALWAYS ────────────────────────────────────────────
 *
 * This read as a search for the closest standard sheet by aspect ratio. It was not one.
 * `bestDiff` started at `Infinity`, so the FIRST candidate always satisfied `diff < bestDiff` — and
 * the body `return`ed. Every image ever measured was called a 24×36 sheet, because 24×36 is first
 * in the list. The remaining entries have never been reached, and `bestDiff` was assigned once and
 * read never.
 *
 * Combined with letter and legal being absent from that list (see above), the effect on cost was
 * severe: an ordinary 300 DPI letter deed page was scored at 92 DPI, failed the fine-text floor at
 * every grid, and fell through to a 4×8 split — 32 Vision calls per page, before escalation.
 *
 * The loop now finishes before it decides.
 */
export function analyzeImageDimensions(width: number, height: number): ImageInfo {
  const aspectRatio = width / height;

  let best: { name: string; widthIn: number; heightIn: number } = STANDARD_SIZES[0];
  let bestDiff = Infinity;

  for (const size of STANDARD_SIZES) {
    const sheetAspect = size.widthIn / size.heightIn;
    // Either orientation: a landscape plat and a portrait one are the same sheet.
    const diff = Math.min(
      Math.abs(aspectRatio - sheetAspect),
      Math.abs(aspectRatio - 1 / sheetAspect),
    );
    if (diff < bestDiff) {
      bestDiff = diff;
      best = size;
    }
  }

  const longerDim = Math.max(width, height);
  const longerSheetDim = Math.max(best.widthIn, best.heightIn);
  return {
    width,
    height,
    estimatedDpi: Math.round(longerDim / longerSheetDim),
    sheetName: best.name,
  };
}

// ── Phase 2: Grid selection ───────────────────────────────────────────────────
//
// ── EXPORTED SO THERE IS ONE SEGMENTATION RULE, NOT TWO ──────────────────────
//
// The owner asked that "each page should also be split up into quadrants and then enlarged and
// reviewed/analyzed individually". This module does that. Bell's deed analyzer did NOT — despite
// what the plan doc's first reading said, it does split, but into three fixed regions: the full
// image, the top half and the bottom half, at 15% overlap, with no grid selection, no per-segment
// confidence and no escalation.
//
// Two horizontal strips are not quadrants. On a 24×36 plat sheet a "half" is still eighteen inches
// of drawing in one Vision call, which is the resolution problem this module exists to solve.
//
// So the planner is exported rather than reimplemented: `selectOptimalGrid` and
// `computeCropBoxes` are pure functions over dimensions, and Bell can use the same rule while
// keeping its own deed-specific prompt for what each segment MEANS. Copying the rule is how the
// two would drift, which is the defect this whole plan keeps finding.

export interface GridChoice {
  rows: number;
  cols: number;
  pieceWidth: number;
  pieceHeight: number;
  fineTextPx: number;
  totalPieces: number;
}

/** Fine-text height, in pixels, as the API will actually SEE it at this piece size.
 *
 *  A piece larger than the Vision limit is downscaled on the way in, and that downscale is the only
 *  reason a finer grid helps: smaller pieces are shrunk less, so the same ink survives as more
 *  pixels. A piece already within the limit gains nothing from being cut further. */
function fineTextPxAt(info: ImageInfo, rows: number, cols: number): number {
  const pieceMaxDim = Math.max(Math.ceil(info.width / cols), Math.ceil(info.height / rows));
  const apiScale = pieceMaxDim > CLAUDE_MAX_PIXELS ? CLAUDE_MAX_PIXELS / pieceMaxDim : 1;
  return info.estimatedDpi * FINE_TEXT_HEIGHT_IN * apiScale;
}

/**
 * The smallest grid whose pieces keep fine surveying text legible.
 *
 * ── THE TEST WAS CONSTANT ACROSS EVERY GRID ─────────────────────────────────────────────────────
 *
 * The loop computed `fineTextPx = estimatedDpi × 0.07` — a value that does not mention `grid` at
 * all. So the condition was the same on every iteration, and the loop could only ever do one of two
 * things: return 2×2 on the first pass, or fail all four and fall through. **2×4 and 4×4 have never
 * been selected.** The choice was binary between the coarsest and the finest option, dressed as a
 * search over four.
 *
 * `fineTextPxAt` is the formula the surrounding log messages already used, and now the decision uses
 * it too — the log and the decision had been computing different numbers and printing one of them.
 *
 * ── AND THE FALLBACK WAS BACKWARDS ──────────────────────────────────────────────────────────────
 *
 * When no grid reached the floor it returned the FINEST — 4×8, thirty-two Vision calls. But a grid
 * only helps by avoiding downscale, so "no grid reaches the floor" means the scan simply does not
 * have the resolution: the ink is not there. Cutting a 120 DPI page into 32 pieces buys 32 calls to
 * read the same blur. The floor is 2×2 instead, which is the quadrant split the owner asked for,
 * and `ocr-legibility.ts` is the right place to say the paper cannot be read.
 */
export function selectOptimalGrid(info: ImageInfo): GridChoice {
  // At least 2×2 always: "each page should also be split up into quadrants".
  for (const grid of GRID_OPTIONS) {
    const pieceWidth  = Math.ceil(info.width  / grid.cols);
    const pieceHeight = Math.ceil(info.height / grid.rows);
    const fineTextPx  = fineTextPxAt(info, grid.rows, grid.cols);
    if (fineTextPx >= MIN_FINE_TEXT_PX) {
      return { ...grid, pieceWidth, pieceHeight, fineTextPx, totalPieces: grid.rows * grid.cols };
    }
  }

  // Nothing reached the floor — the scan is low-resolution, not badly divided.
  const floor = GRID_OPTIONS[0];
  return {
    ...floor,
    pieceWidth:  Math.ceil(info.width  / floor.cols),
    pieceHeight: Math.ceil(info.height / floor.rows),
    fineTextPx:  fineTextPxAt(info, floor.rows, floor.cols),
    totalPieces: floor.rows * floor.cols,
  };
}

// ── Phase 3: Crop box computation ────────────────────────────────────────────

export interface CropBox {
  left: number;
  top: number;
  width: number;
  height: number;
  segmentId: string;
  row: number;
  col: number;
}

export function computeCropBoxes(
  imgWidth: number,
  imgHeight: number,
  rows: number,
  cols: number,
  overlapPct: number,
): CropBox[] {
  const boxes: CropBox[] = [];
  const baseW = imgWidth  / cols;
  const baseH = imgHeight / rows;
  const overlapW = Math.round(baseW * overlapPct);
  const overlapH = Math.round(baseH * overlapPct);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const left   = Math.max(0, Math.round(col * baseW) - (col > 0 ? overlapW : 0));
      const top    = Math.max(0, Math.round(row * baseH) - (row > 0 ? overlapH : 0));
      const right  = Math.min(imgWidth,  Math.round((col + 1) * baseW) + (col < cols - 1 ? overlapW : 0));
      const bottom = Math.min(imgHeight, Math.round((row + 1) * baseH) + (row < rows - 1 ? overlapH : 0));

      boxes.push({
        left, top,
        width:  right - left,
        height: bottom - top,
        segmentId: `r${row}c${col}`,
        row, col,
      });
    }
  }
  return boxes;
}

// ── Phase 5: Confidence scoring (spec §5 scoreConfidence) ────────────────────

/**
 * Score the quality of text extracted from a plat segment.
 *
 * Returns the full breakdown of uncertainty signals so that callers can
 * log exactly WHY a segment was flagged for zoom or manual review.
 * Exported so it can be unit-tested independently of the full pipeline.
 */
export function scoreConfidence(text: string): SegmentScore {
  // Uncertainty indicators (negative signals)
  const uncertainMarkers = (text.match(/\[\?]/g) || []).length;
  const uncertainWords   = (text.match(
    /\b(uncertain|unclear|obscured|partially|illegible|hard to read|cannot read|not readable|watermark|blurr|faint)\b/gi
  ) || []).length;
  const possiblyWords    = (text.match(
    /\b(possibly|perhaps|might be|could be|or possibly|appears to be)\b/gi
  ) || []).length;

  // Useful data extracted (positive signals)
  const bearings  = (text.match(/[NS]\s*\d+[°\s]\s*\d+['"]/g)  || []).length;
  const distances = (text.match(/\d+\.\d+\s*['"`]|ft/g)         || []).length;
  const lotRefs   = (text.match(/\b(LOT|Lot|RESERVE)\s*\d/gi)   || []).length;
  const curveData = (text.match(/\b[RLA][\s=]+\d+/g)            || []).length;
  const lineTable = (text.match(/\bL\d+\b/g)                    || []).length;

  const dataPoints       = bearings + distances + lotRefs + curveData + lineTable;
  const uncertaintyScore = uncertainMarkers * 3 + uncertainWords * 2 + possiblyWords;

  let confidence: number;
  if (dataPoints === 0 && uncertaintyScore === 0) {
    confidence = 50; // text-only section (notes, dedications)
  } else if (dataPoints === 0) {
    confidence = 20; // tried to read numbers but couldn't
  } else {
    confidence = Math.max(10, Math.min(100,
      Math.round(70 + dataPoints * 2 - uncertaintyScore * 5)
    ));
  }

  return {
    confidence, dataPoints, uncertaintyScore,
    uncertainMarkers, uncertainWords,
    bearings, distances, lotRefs, curveData, lineTable,
    needsZoom:         confidence < CONFIDENCE_ZOOM_THRESHOLD && dataPoints > 0,
    needsManualReview: confidence < CONFIDENCE_MANUAL_THRESHOLD,
  };
}

// ── Phase 4: Per-segment Vision extraction ────────────────────────────────────

/**
 * Convert row/col/totalRows/totalCols into a human-readable position description
 * matching the vision-quadrants.js convention (TOP-LEFT, BOTTOM-RIGHT, etc.).
 *
 * For 2×2 grids: returns the canonical four quadrant names used by both
 * vision-quadrants.js and adaptive-vision-v2.js.
 *
 * For larger grids: rows follow the 4-row semantic names UPPER-MIDDLE /
 * LOWER-MIDDLE from adaptive-vision-v2.js.  4-col grids use the full
 * adaptive-vision-v2.js hNames array: FAR-LEFT / CENTER-LEFT / CENTER-RIGHT /
 * FAR-RIGHT — the "far" prefix signals that col=0 and col=3 are the extreme
 * outer columns of a 4-column grid, not merely "the left half".  All other
 * grid sizes fall back to ROW N / COL N with a segment counter.
 */
function describePosition(row: number, col: number, totalRows: number, totalCols: number): string {
  if (totalRows === 2 && totalCols === 2) {
    const rowName = row === 0 ? 'TOP' : 'BOTTOM';
    const colName = col === 0 ? 'LEFT' : 'RIGHT';
    return `${rowName}-${colName}`;
  }

  // Row label — corners are always TOP/BOTTOM; 4-row interior cells get
  // semantic labels from adaptive-vision-v2.js's getPositionDesc().
  let rowName: string;
  if (row === 0)               rowName = 'TOP';
  else if (row === totalRows - 1) rowName = 'BOTTOM';
  else if (totalRows === 4)    rowName = row === 1 ? 'UPPER-MIDDLE' : 'LOWER-MIDDLE';
  else                         rowName = `ROW ${row + 1}`;

  // Col label — matches adaptive-vision-v2.js's getPositionDesc() hNames for
  // 4-col grids: ["far-left", "center-left", "center-right", "far-right"].
  // FAR-LEFT/FAR-RIGHT for the extreme columns tells Claude it's the edge of a
  // 4-column grid (not just "the left half" of a 2-column split).
  let colName: string;
  if (totalCols === 4) {
    colName = col === 0 ? 'FAR-LEFT' : col === 1 ? 'CENTER-LEFT' : col === 2 ? 'CENTER-RIGHT' : 'FAR-RIGHT';
  } else if (col === 0)            colName = 'LEFT';
  else if (col === totalCols - 1)  colName = 'RIGHT';
  else                             colName = `COL ${col + 1}`;

  const segNum = row * totalCols + col + 1;
  const total  = totalRows * totalCols;
  return `${rowName}-${colName} (segment ${segNum} of ${total} in ${totalRows}×${totalCols} grid)`;
}

async function extractSegment(
  imageBuffer: Buffer,
  mediaType: 'image/png' | 'image/jpeg',
  segmentId: string,
  anthropicApiKey: string,
  logger: PipelineLogger,
  positionHint?: string,
  documentName?: string,
): Promise<string> {
  const client = new Anthropic({ apiKey: anthropicApiKey });
  const base64 = imageBuffer.toString('base64');

  // Build user message content.
  // Position-aware context (vision-quadrants.js / adaptive-vision-v2.js technique):
  // telling Claude which part of the plat it is viewing, and naming the specific
  // subdivision + county, helps it orient and apply spatial context. The document
  // name is placed before the image so Claude has full context before reading.
  type ContentBlock =
    | { type: 'image'; source: { type: 'base64'; media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'; data: string } }
    | { type: 'text'; text: string };
  const userContent: ContentBlock[] = [];
  if (positionHint) {
    // 'Bell County, Texas' is hardcoded here because the adaptive vision pipeline
    // is currently used exclusively for Bell County plat/deed documents.  If the
    // pipeline is extended to other counties in the future, pass the county as an
    // additional parameter (analogous to adaptive-vision-v2.js's `county` arg).
    const docContext = documentName
      ? `the subdivision plat for "${documentName}" in Bell County, Texas`
      : 'a subdivision plat';
    userContent.push({
      type: 'text',
      text: `This is the ${positionHint} section of ${docContext}. Extract all surveying data from this region.`,
    });
  }
  userContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } });

  try {
    const response = await client.messages.create({
      model: process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 8192,
      ...samplingFor(process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-6'),
      system: EXTRACTION_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });

    // R4b — priced against the ambient run established by `runPipeline`. Vision calls carry image
    // payloads, so their input token counts are among the largest this worker makes; leaving them
    // unrecorded skewed the ceiling in the direction that matters most.
    void recordAmbientAiCall('adaptive-vision', process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-6', {
      input:  response.usage?.input_tokens  ?? 0,
      output: response.usage?.output_tokens ?? 0,
    }, { segmentId });

    const textBlock = response.content.find(c => c.type === 'text');
    return (textBlock?.type === 'text' ? textBlock.text : '') ?? '';
  } catch (err) {
    logger.warn('AdaptiveVision', `Segment ${segmentId}: extraction error — ${err instanceof Error ? err.message : String(err)}`);
    return '';
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Run the 6-phase adaptive vision OCR pipeline on an image buffer.
 *
 * For small images (< SMALL_IMAGE_BYTES) or when sharp is unavailable, falls
 * back to a single full-image extraction.
 *
 * @param imageBuffer     Raw image bytes (PNG or JPEG)
 * @param mediaType       MIME type of the image
 * @param anthropicApiKey Anthropic API key
 * @param logger          Pipeline logger
 * @param label           Human-readable label for log messages (e.g. docLabel)
 * @param documentName    Subdivision/document name used in the Claude Vision
 *                        prompt for every segment, e.g.
 *                        "Ash Family Trust 12.358 Acre Addition".
 *                        When provided the per-segment position hint reads:
 *                        "…section of the subdivision plat for "${documentName}"
 *                        in Bell County, Texas."
 *                        Mirrors the adaptive-vision-v2.js subdivisionName param.
 */
export async function adaptiveVisionOcr(
  imageBuffer: Buffer,
  mediaType: 'image/png' | 'image/jpeg',
  anthropicApiKey: string,
  logger: PipelineLogger,
  label = 'image',
  documentName?: string,
): Promise<AdaptiveVisionResult> {
  const startTime = Date.now();
  let totalApiCalls = 0;

  // ── Attempt to load sharp ─────────────────────────────────────────────────
  let sharpLib: typeof import('sharp') | null = null;
  try {
    sharpLib = (await import('sharp')).default;
  } catch {
    logger.warn('AdaptiveVision', `${label}: sharp not available — falling back to single-image extraction`);
  }

  // ── Single-image fallback — ONLY when sharp is unavailable ───────────────
  // All images are now processed with grid segmentation (minimum 2x2) to
  // maximize data extraction from deeds and plats. The AI analyzes each
  // quadrant independently for thorough OCR coverage.
  if (!sharpLib) {
    logger.info('AdaptiveVision', `${label}: single (no sharp — library unavailable)`);
    const text = await extractSegment(imageBuffer, mediaType, 'full', anthropicApiKey, logger);
    totalApiCalls++;
    const score = scoreConfidence(text);

    return {
      mergedText: text,
      overallConfidence: score.confidence,
      totalSegments: 1,
      escalatedSegments: 0,
      manualReviewSegments: score.needsManualReview ? 1 : 0,
      segments: [],
      strategy: 'single',
      gridUsed: null,
      totalApiCalls,
      durationMs: Date.now() - startTime,
    };
  }

  // ── Phase 1: Image analysis ───────────────────────────────────────────────
  const meta = await sharpLib(imageBuffer).metadata();
  const imgWidth  = meta.width  ?? 1000;
  const imgHeight = meta.height ?? 1000;
  const info = analyzeImageDimensions(imgWidth, imgHeight);

  logger.info('AdaptiveVision',
    `${label}: ${imgWidth}×${imgHeight}px, ~${info.estimatedDpi} DPI, sheet ~${info.sheetName}`);

  // Log text-size analysis so the user can see exactly WHY a grid is needed.
  // Plat text typical heights: bearing/distance labels ~0.08", fine print ~0.06".
  const bearingTextAtScan = info.estimatedDpi * 0.08;
  const fineTextAtScan    = info.estimatedDpi * 0.06;
  const maxDim            = Math.max(imgWidth, imgHeight);
  const singleImageScale  = maxDim > CLAUDE_MAX_PIXELS ? CLAUDE_MAX_PIXELS / maxDim : 1.0;
  const bearingTextSingle = bearingTextAtScan * singleImageScale;
  const fineTextSingle    = fineTextAtScan    * singleImageScale;
  logger.info('AdaptiveVision',
    `${label}: Text sizes at scan DPI — bearing/dist: ~${bearingTextAtScan.toFixed(0)}px, ` +
    `fine print: ~${fineTextAtScan.toFixed(0)}px`);
  if (singleImageScale < 1.0) {
    logger.info('AdaptiveVision',
      `${label}: Single-image resize (${(singleImageScale * 100).toFixed(0)}%) would reduce to — ` +
      `bearing/dist: ~${bearingTextSingle.toFixed(0)}px, fine print: ~${fineTextSingle.toFixed(0)}px ` +
      `(need ≥${MIN_FINE_TEXT_PX}px for reliable OCR — segmentation required)`);
  } else {
    logger.info('AdaptiveVision',
      `${label}: Single-image fits API limit (no resize needed), fine print ~${fineTextSingle.toFixed(0)}px ≥ ${MIN_FINE_TEXT_PX}px`);
  }

  // ── Phase 2: Grid selection ───────────────────────────────────────────────
  // Log every grid option evaluated so the user can see why the chosen grid wins.
  for (const opt of GRID_OPTIONS) {
    const pW = Math.ceil(imgWidth  / opt.cols);
    const pH = Math.ceil(imgHeight / opt.rows);
    const pMax = Math.max(pW, pH);
    const fitsApi = pMax <= CLAUDE_MAX_PIXELS;
    const optFineText = info.estimatedDpi * FINE_TEXT_HEIGHT_IN * (fitsApi ? 1.0 : CLAUDE_MAX_PIXELS / pMax);
    const readable = optFineText >= MIN_FINE_TEXT_PX;
    logger.info('AdaptiveVision',
      `${label}: Grid option ${opt.rows}×${opt.cols} (${opt.rows * opt.cols} calls) — ` +
      `piece=${pW}×${pH}px${fitsApi ? '' : ` resize→${(CLAUDE_MAX_PIXELS / pMax * 100).toFixed(0)}%`}, ` +
      `fineText≈${optFineText.toFixed(0)}px — ${readable ? 'READABLE' : 'TOO SMALL'}`);
  }

  const grid = selectOptimalGrid(info);
  logger.info('AdaptiveVision',
    `${label}: Selected Grid ${grid.rows}×${grid.cols} (${grid.totalPieces} pieces, ` +
    `piece=${grid.pieceWidth}×${grid.pieceHeight}px, fineText≈${grid.fineTextPx.toFixed(1)}px)`);


  // ── Phase 3 + 4 + 5 + 6: Crop → Extract → Score → Escalate ──────────────
  const cropBoxes = computeCropBoxes(imgWidth, imgHeight, grid.rows, grid.cols, OVERLAP_PCT);
  const segmentResults: SegmentResult[] = [];

  for (const box of cropBoxes) {
    // Phase 3: Crop segment
    const cropBuffer = await sharpLib(imageBuffer)
      .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
      .png()
      .toBuffer();

    // Phase 4: Extract — pass position context so Claude knows which part of the
    // plat it's reading (vision-quadrants.js technique)
    const positionHint = describePosition(box.row, box.col, grid.rows, grid.cols);
    const segStart = Date.now();
    const text = await extractSegment(cropBuffer, 'image/png', box.segmentId, anthropicApiKey, logger, positionHint, documentName);
    const segElapsedSec = ((Date.now() - segStart) / 1000).toFixed(1);
    totalApiCalls++;

    // Phase 5: Score — log full breakdown so the user can see exactly why a
    // segment is flagged for zoom or manual review (not just a bare number).
    const score = scoreConfidence(text);
    logger.info('AdaptiveVision',
      `${label} [${box.segmentId}] (${segElapsedSec}s): confidence=${score.confidence}, ` +
      `dataPoints=${score.dataPoints} (bearings=${score.bearings}, dist=${score.distances}, ` +
      `lots=${score.lotRefs}, curves=${score.curveData}), ` +
      `uncertainty=${score.uncertaintyScore} ([?]×${score.uncertainMarkers}, words×${score.uncertainWords}), ` +
      `zoom=${score.needsZoom}, manualReview=${score.needsManualReview}`);

    const segResult: SegmentResult = {
      segmentId:           box.segmentId,
      row:                 box.row,
      col:                 box.col,
      depth:               0,
      boundingBox:         { x: box.left, y: box.top, w: box.width, h: box.height },
      text,
      confidence:          score.confidence,
      dataPoints:          score.dataPoints,
      uncertaintyScore:    score.uncertaintyScore,
      bearings:            score.bearings,
      distances:           score.distances,
      flaggedForZoom:      score.needsZoom,
      flaggedForManualReview: score.needsManualReview,
    };

    // Phase 6: Escalation — low-confidence segments get 2×2 sub-division
    if (score.needsZoom) {
      logger.info('AdaptiveVision',
        `${label} [${box.segmentId}]: escalating — confidence ${score.confidence} < ${CONFIDENCE_ZOOM_THRESHOLD} ` +
        `(${score.uncertainMarkers} [?] markers, ${score.uncertainWords} uncertainty words) — ` +
        `splitting into 4 sub-pieces with ${ZOOM_OVERLAP_PCT * 100}% overlap for higher resolution re-read`);

      const zoomBoxes   = computeCropBoxes(box.width, box.height, 2, 2, ZOOM_OVERLAP_PCT);
      const zoomResults: SegmentResult[] = [];

      for (const zbox of zoomBoxes) {
        const zBuf = await sharpLib(cropBuffer)
          .extract({ left: zbox.left, top: zbox.top, width: zbox.width, height: zbox.height })
          .png()
          .toBuffer();

        const zId   = `${box.segmentId}_z${zbox.segmentId}`;
        // Zoom position context: describe both the parent quadrant and sub-quadrant
        const zParentPos = describePosition(box.row, box.col, grid.rows, grid.cols);
        const zSubPos    = describePosition(zbox.row, zbox.col, 2, 2);
        const zPosHint   = `${zParentPos} (zoomed sub-segment: ${zSubPos})`;
        const zStart = Date.now();
        const zText = await extractSegment(zBuf, 'image/png', zId, anthropicApiKey, logger, zPosHint, documentName);
        const zElapsedSec = ((Date.now() - zStart) / 1000).toFixed(1);
        totalApiCalls++;

        const zScore = scoreConfidence(zText);
        logger.info('AdaptiveVision',
          `${label} [${zId}] (${zElapsedSec}s): zoom confidence=${zScore.confidence}, ` +
          `dataPoints=${zScore.dataPoints}, uncertainty=${zScore.uncertaintyScore} ` +
          `([?]×${zScore.uncertainMarkers}, words×${zScore.uncertainWords})`);

        // Level 3 escalation: if zoom sub-segment still has low confidence,
        // split it into 2x2 again for maximum extraction depth
        let finalText = zText;
        let finalConfidence = zScore.confidence;
        if (zScore.needsZoom && zbox.width > 200 && zbox.height > 200) {
          logger.info('AdaptiveVision',
            `${label} [${zId}]: depth-2 escalation — confidence ${zScore.confidence} still low, splitting again`);
          const z2Boxes = computeCropBoxes(zbox.width, zbox.height, 2, 2, ZOOM_OVERLAP_PCT);
          const z2Texts: string[] = [];
          let z2TotalConf = 0;
          for (const z2box of z2Boxes) {
            const z2Buf = await sharpLib(zBuf)
              .extract({ left: z2box.left, top: z2box.top, width: z2box.width, height: z2box.height })
              .png()
              .toBuffer();
            const z2Id = `${zId}_z${z2box.segmentId}`;
            const z2Text = await extractSegment(z2Buf, 'image/png', z2Id, anthropicApiKey, logger, `${zPosHint} (depth-2 zoom)`, documentName);
            totalApiCalls++;
            const z2Score = scoreConfidence(z2Text);
            z2Texts.push(z2Text);
            z2TotalConf += z2Score.confidence;
          }
          finalText = z2Texts.join('\n\n');
          finalConfidence = Math.round(z2TotalConf / z2Texts.length);
        }

        zoomResults.push({
          segmentId:           zId,
          row:                 zbox.row,
          col:                 zbox.col,
          depth:               1,
          boundingBox:         { x: box.left + zbox.left, y: box.top + zbox.top, w: zbox.width, h: zbox.height },
          text:                finalText,
          confidence:          finalConfidence,
          dataPoints:          zScore.dataPoints,
          uncertaintyScore:    zScore.uncertaintyScore,
          bearings:            zScore.bearings,
          distances:           zScore.distances,
          flaggedForZoom:      false,
          flaggedForManualReview: zScore.needsManualReview,
        });
      }

      // Replace parent segment text with merged zoom results (richer data)
      segResult.zoomResults          = zoomResults;
      segResult.text                 = zoomResults.map(z => z.text).join('\n\n---\n\n');
      segResult.confidence           = Math.round(
        zoomResults.reduce((s, z) => s + z.confidence, 0) / zoomResults.length,
      );
      segResult.flaggedForManualReview = zoomResults.every(z => z.flaggedForManualReview);
    }

    segmentResults.push(segResult);
  }

  // ── Result merging ────────────────────────────────────────────────────────
  const mergedText = segmentResults
    .map(s => `\n\n--- SEGMENT ${s.segmentId.toUpperCase()} ---\n${s.text}`)
    .join('')
    .trim();

  const overallConfidence = segmentResults.length > 0
    ? Math.round(segmentResults.reduce((s, r) => s + r.confidence, 0) / segmentResults.length)
    : 0;

  const escalated     = segmentResults.filter(s => s.flaggedForZoom).length;
  const manualReview  = segmentResults.filter(s => s.flaggedForManualReview).length;
  const durationMs    = Date.now() - startTime;

  logger.info('AdaptiveVision',
    `${label}: complete — ${grid.rows}×${grid.cols} grid, ${totalApiCalls} API calls, ` +
    `${(durationMs / 1000).toFixed(1)}s, overallConfidence=${overallConfidence}, ` +
    `escalated=${escalated}/${segmentResults.length}, manualReview=${manualReview}`);

  return {
    mergedText,
    overallConfidence,
    totalSegments:       segmentResults.length,
    escalatedSegments:   escalated,
    manualReviewSegments: manualReview,
    segments:            segmentResults,
    strategy:            'grid',
    gridUsed:            { rows: grid.rows, cols: grid.cols },
    totalApiCalls,
    durationMs,
  };
}
