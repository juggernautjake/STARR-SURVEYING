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

// ── Types ─────────────────────────────────────────────────────────────────────

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

const CLAUDE_MAX_PIXELS = 8_000;
/** Minimum readable pixel height for fine surveying text (0.07" × estimated DPI) */
const MIN_FINE_TEXT_PX = 13;
/** Typical bearing/distance label height in Texas plat documents */
const FINE_TEXT_HEIGHT_IN = 0.07;
/** Normal inter-segment overlap (5%) */
const OVERLAP_PCT = 0.05;
/** Zoom escalation overlap (8%) */
const ZOOM_OVERLAP_PCT = 0.08;
/** Confidence below this triggers auto-zoom (provided the segment has data) */
const CONFIDENCE_ZOOM_THRESHOLD = 60;
/** Confidence below this flags for manual surveyor review */
const CONFIDENCE_MANUAL_THRESHOLD = 50;
/** Base64 byte threshold below which segmentation is skipped (~600 KB decoded) */
const SMALL_IMAGE_BYTES = 800_000;

/** Standard Texas plat sheet sizes (width × height in inches) */
const STANDARD_SIZES = [
  { name: '24×36',  widthIn: 24, heightIn: 36 },
  { name: '18×24',  widthIn: 18, heightIn: 24 },
  { name: '30×42',  widthIn: 30, heightIn: 42 },
  { name: '11×17',  widthIn: 11, heightIn: 17 },
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
- Output all findings in structured text format — one data item per line`;

// ── Phase 1: Image analysis ───────────────────────────────────────────────────

interface ImageInfo {
  width: number;
  height: number;
  estimatedDpi: number;
  sheetName: string;
}

function analyzeImageDimensions(width: number, height: number): ImageInfo {
  const aspectRatio = width / height;

  // Match to closest standard sheet by aspect ratio (portrait and landscape)
  let bestName = '24×36';
  let bestDiff = Infinity;

  for (const size of STANDARD_SIZES) {
    const sheetAspect = size.widthIn / size.heightIn;
    const diff = Math.min(
      Math.abs(aspectRatio - sheetAspect),
      Math.abs(aspectRatio - 1 / sheetAspect),
    );
    if (diff < bestDiff) {
      bestDiff = diff;
      bestName = size.name;
      const matched = size;
      const longerDim = Math.max(width, height);
      const longerSheetDim = Math.max(matched.widthIn, matched.heightIn);
      const estimatedDpi = Math.round(longerDim / longerSheetDim);
      return { width, height, estimatedDpi, sheetName: bestName };
    }
  }

  // Fallback: assume 200 DPI
  return { width, height, estimatedDpi: 200, sheetName: bestName };
}

// ── Phase 2: Grid selection ───────────────────────────────────────────────────

interface GridChoice {
  rows: number;
  cols: number;
  pieceWidth: number;
  pieceHeight: number;
  fineTextPx: number;
  totalPieces: number;
}

function selectOptimalGrid(info: ImageInfo): GridChoice {
  for (const grid of GRID_OPTIONS) {
    const pieceWidth  = Math.ceil(info.width  / grid.cols);
    const pieceHeight = Math.ceil(info.height / grid.rows);

    if (pieceWidth > CLAUDE_MAX_PIXELS || pieceHeight > CLAUDE_MAX_PIXELS) continue;

    // Fine text pixel height at this piece size (no API resize needed when ≤ 8000px)
    const fineTextPx = info.estimatedDpi * FINE_TEXT_HEIGHT_IN;
    if (fineTextPx >= MIN_FINE_TEXT_PX) {
      return { ...grid, pieceWidth, pieceHeight, fineTextPx, totalPieces: grid.rows * grid.cols };
    }
  }

  // Fallback: finest grid available
  const fallback = GRID_OPTIONS[GRID_OPTIONS.length - 1];
  return {
    ...fallback,
    pieceWidth:  Math.ceil(info.width  / fallback.cols),
    pieceHeight: Math.ceil(info.height / fallback.rows),
    fineTextPx:  info.estimatedDpi * FINE_TEXT_HEIGHT_IN,
    totalPieces: fallback.rows * fallback.cols,
  };
}

// ── Phase 3: Crop box computation ────────────────────────────────────────────

interface CropBox {
  left: number;
  top: number;
  width: number;
  height: number;
  segmentId: string;
  row: number;
  col: number;
}

function computeCropBoxes(
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

interface SegmentScore {
  confidence: number;
  dataPoints: number;
  uncertaintyScore: number;
  bearings: number;
  distances: number;
  lotRefs: number;
  curveData: number;
  lineTable: number;
  needsZoom: boolean;
  needsManualReview: boolean;
}

function scoreConfidence(text: string): SegmentScore {
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
    bearings, distances, lotRefs, curveData, lineTable,
    needsZoom:         confidence < CONFIDENCE_ZOOM_THRESHOLD && dataPoints > 0,
    needsManualReview: confidence < CONFIDENCE_MANUAL_THRESHOLD,
  };
}

// ── Phase 4: Per-segment Vision extraction ────────────────────────────────────

async function extractSegment(
  imageBuffer: Buffer,
  mediaType: 'image/png' | 'image/jpeg',
  segmentId: string,
  anthropicApiKey: string,
  logger: PipelineLogger,
): Promise<string> {
  const client = new Anthropic({ apiKey: anthropicApiKey });
  const base64 = imageBuffer.toString('base64');

  try {
    const response = await client.messages.create({
      model: process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      temperature: 0,
      system: EXTRACTION_PROMPT,
      messages: [{
        role: 'user',
        content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }],
      }],
    });

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
 * @param imageBuffer  Raw image bytes (PNG or JPEG)
 * @param mediaType    MIME type of the image
 * @param anthropicApiKey  Anthropic API key
 * @param logger       Pipeline logger
 * @param label        Human-readable label for log messages
 */
export async function adaptiveVisionOcr(
  imageBuffer: Buffer,
  mediaType: 'image/png' | 'image/jpeg',
  anthropicApiKey: string,
  logger: PipelineLogger,
  label = 'image',
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

  // ── Single-image fallback (sharp unavailable OR small image) ─────────────
  if (!sharpLib || imageBuffer.length < SMALL_IMAGE_BYTES) {
    const strategy = !sharpLib ? 'single (no sharp)' : 'single (small image)';
    logger.info('AdaptiveVision', `${label}: ${strategy}`);
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

  // ── Phase 2: Grid selection ───────────────────────────────────────────────
  const grid = selectOptimalGrid(info);
  logger.info('AdaptiveVision',
    `${label}: Grid ${grid.rows}×${grid.cols} (${grid.totalPieces} pieces, ` +
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

    // Phase 4: Extract
    const text = await extractSegment(cropBuffer, 'image/png', box.segmentId, anthropicApiKey, logger);
    totalApiCalls++;

    // Phase 5: Score
    const score = scoreConfidence(text);
    logger.info('AdaptiveVision',
      `${label} [${box.segmentId}]: confidence=${score.confidence}, ` +
      `dataPoints=${score.dataPoints}, zoom=${score.needsZoom}`);

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
        `${label} [${box.segmentId}]: confidence ${score.confidence} < ${CONFIDENCE_ZOOM_THRESHOLD} — escalating (4 sub-pieces, ${ZOOM_OVERLAP_PCT * 100}% overlap)`);

      const zoomBoxes   = computeCropBoxes(box.width, box.height, 2, 2, ZOOM_OVERLAP_PCT);
      const zoomResults: SegmentResult[] = [];

      for (const zbox of zoomBoxes) {
        const zBuf = await sharpLib(cropBuffer)
          .extract({ left: zbox.left, top: zbox.top, width: zbox.width, height: zbox.height })
          .png()
          .toBuffer();

        const zId   = `${box.segmentId}_z${zbox.segmentId}`;
        const zText = await extractSegment(zBuf, 'image/png', zId, anthropicApiKey, logger);
        totalApiCalls++;

        const zScore = scoreConfidence(zText);
        logger.info('AdaptiveVision',
          `${label} [${zId}]: zoom confidence=${zScore.confidence}, dataPoints=${zScore.dataPoints}`);

        zoomResults.push({
          segmentId:           zId,
          row:                 zbox.row,
          col:                 zbox.col,
          depth:               1,
          boundingBox:         { x: box.left + zbox.left, y: box.top + zbox.top, w: zbox.width, h: zbox.height },
          text:                zText,
          confidence:          zScore.confidence,
          dataPoints:          zScore.dataPoints,
          uncertaintyScore:    zScore.uncertaintyScore,
          bearings:            zScore.bearings,
          distances:           zScore.distances,
          flaggedForZoom:      false,  // no further escalation
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

  return {
    mergedText,
    overallConfidence,
    totalSegments:       segmentResults.length,
    escalatedSegments:   segmentResults.filter(s => s.flaggedForZoom).length,
    manualReviewSegments: segmentResults.filter(s => s.flaggedForManualReview).length,
    segments:            segmentResults,
    strategy:            'grid',
    gridUsed:            { rows: grid.rows, cols: grid.cols },
    totalApiCalls,
    durationMs:          Date.now() - startTime,
  };
}
