// lib/research/iterative-image-analyzer.service.ts — Iterative deep image analysis
//
// Implements a progressive tile-and-re-analyze pattern for thorough image analysis.
// Instead of sending a single full image to Claude Vision, this service:
//
//   1. Analyzes the full image to get an overview
//   2. Tiles the image into quadrants (2×2) with overlap
//   3. Analyzes each tile for fine detail (lot numbers, text, bearings, etc.)
//   4. If confidence is still low, tiles again at 3×3 for even more detail
//   5. Merges all findings, deduplicates, and reconciles conflicts
//   6. Optionally re-analyzes the full image WITH the tile context for a final pass
//
// This ensures that small text (lot numbers on plats, bearing labels, addresses)
// that the AI might miss on a full-size image is caught when zoomed in on tiles.
//
// Used by:
//   - visual-lot-identifier.service.ts (map screenshots, plats)
//   - visual-comparison.service.ts (all comparison images)
//   - deep-lot-analysis route (ensures every image is thoroughly analyzed)

import { callVision } from './ai-client';
import type { PipelineLogger } from './pipeline-logger';
import type { PromptKey } from './prompts';

// ── Configuration ────────────────────────────────────────────────────────────

/** Confidence threshold below which we tile for more detail */
const TILE_CONFIDENCE_THRESHOLD = 75;

/** Confidence threshold below which we do a 3×3 pass after 2×2 */
const DEEP_TILE_CONFIDENCE_THRESHOLD = 60;

/** Overlap fraction between tiles (8% prevents cutting text at boundaries) */
const TILE_OVERLAP = 0.08;

/** JPEG quality for tile extraction */
const JPEG_QUALITY = 92;

/** Maximum tiles per pass to control API costs */
const MAX_TILES_2x2 = 4;
const MAX_TILES_3x3 = 9;

// ── Types ────────────────────────────────────────────────────────────────────

export interface TileAnalysis {
  /** Which tile position (e.g., "top-left", "center", "bottom-right") */
  position: string;
  /** Row and column index */
  row: number;
  col: number;
  /** Extracted data from this tile */
  data: MapTileData;
  /** Confidence for this tile's analysis */
  confidence: number;
  /** Raw AI response */
  raw_response: Record<string, unknown>;
}

export interface MapTileData {
  /** Text visible in this tile */
  text_visible: string[];
  /** Lot/parcel numbers found */
  lot_numbers: string[];
  /** Block numbers found */
  block_numbers: string[];
  /** Street names found */
  street_names: string[];
  /** Subdivision names found */
  subdivision_names: string[];
  /** Addresses visible (e.g., "123 Oak St" — critical for lot-to-address mapping) */
  addresses_visible: string[];
  /** Property IDs visible */
  property_ids: string[];
  /** Owner names visible */
  owner_names: string[];
  /** Bearings and distances (for plats) */
  bearings: string[];
  distances: string[];
  /** Curve data (delta, radius, arc length, chord) */
  curve_data: string[];
  /** Area/acreage values */
  acreage_values: string[];
  /** Legal description fragments */
  legal_description_fragments: string[];
  /** Recording references (Volume/Page, Cabinet/Slide, Instrument #) */
  recording_references: string[];
  /** Physical features described */
  features: string[];
  /** Pin position (if visible in this tile) */
  pin_position: string | null;
  /** Buildings described */
  buildings: string[];
  /** Any other notable observations */
  notes: string;
}

export interface IterativeAnalysisResult {
  /** Merged findings across all passes */
  merged: MapTileData;
  /** Confidence from the full image pass */
  full_image_confidence: number;
  /** Average confidence from tile passes */
  tile_confidence: number;
  /** Final confidence after all passes and reconciliation */
  final_confidence: number;
  /** How many analysis passes were run */
  total_passes: number;
  /** Breakdown: which pass contributed what */
  passes: AnalysisPass[];
  /** Detailed tile analyses for debugging */
  tile_analyses: TileAnalysis[];
  /** Did the analysis use tiling? */
  used_tiling: boolean;
  /** Did it use deep (3×3) tiling? */
  used_deep_tiling: boolean;
  /** Final context-aware re-analysis result (if run) */
  final_synthesis: string | null;
}

export interface AnalysisPass {
  /** Pass type */
  type: 'full_image' | 'tile_2x2' | 'tile_3x3' | 'contextual_reanalysis';
  /** Number of API calls made in this pass */
  api_calls: number;
  /** Confidence from this pass */
  confidence: number;
  /** New data found in this pass that wasn't in prior passes */
  new_findings: string[];
}

export interface IterativeAnalysisOptions {
  /** The analysis prompt — instructs the AI what to look for */
  prompt: string;
  /** Image type context for logging */
  imageType: string;
  /** Address being researched (included in prompts for context) */
  address: string;
  /** Force tiling even if full-image confidence is high */
  forceTiling?: boolean;
  /** Skip the final contextual re-analysis (saves one API call) */
  skipFinalSynthesis?: boolean;
  /** Maximum tile grid to use (default: '3x3', can be '2x2' to limit cost) */
  maxTileGrid?: '2x2' | '3x3';
}

// ── Tile Position Labels ─────────────────────────────────────────────────────

function tileLabel(row: number, col: number, rows: number, cols: number): string {
  if (rows === 2 && cols === 2) {
    return ['top-left', 'top-right', 'bottom-left', 'bottom-right'][row * cols + col];
  }
  if (rows === 3 && cols === 3) {
    return [
      'top-left', 'top-center', 'top-right',
      'middle-left', 'center', 'middle-right',
      'bottom-left', 'bottom-center', 'bottom-right',
    ][row * cols + col];
  }
  return `row${row}-col${col}`;
}

// ── Image Tiling ─────────────────────────────────────────────────────────────

interface TileBuffer {
  buffer: Buffer;
  row: number;
  col: number;
  position: string;
}

/**
 * Split an image buffer into an N×M grid of tiles with overlap.
 * Requires `sharp` to be installed — returns null if unavailable.
 */
async function tileImage(
  imageBuffer: Buffer,
  rows: number,
  cols: number,
  logger?: PipelineLogger,
): Promise<TileBuffer[] | null> {
  let sharp: typeof import('sharp');
  try {
    sharp = (await import('sharp')).default;
  } catch {
    logger?.warn('lot_identify', 'sharp not available — cannot tile image');
    return null;
  }

  const meta = await sharp(imageBuffer).metadata();
  const imgW = meta.width ?? 0;
  const imgH = meta.height ?? 0;

  if (!imgW || !imgH) {
    logger?.warn('lot_identify', 'Cannot determine image dimensions for tiling');
    return null;
  }

  const overlapX = Math.floor(imgW * TILE_OVERLAP);
  const overlapY = Math.floor(imgH * TILE_OVERLAP);

  const tiles: TileBuffer[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const left = Math.max(0, Math.floor(col * imgW / cols) - overlapX);
      const top = Math.max(0, Math.floor(row * imgH / rows) - overlapY);
      const tileW = Math.floor(imgW / cols) + overlapX * 2;
      const tileH = Math.floor(imgH / rows) + overlapY * 2;
      const width = Math.min(tileW, imgW - left);
      const height = Math.min(tileH, imgH - top);

      if (width <= 0 || height <= 0) continue;

      try {
        const tileBuf = await sharp(imageBuffer)
          .extract({ left, top, width, height })
          .jpeg({ quality: JPEG_QUALITY })
          .toBuffer();

        tiles.push({
          buffer: tileBuf,
          row,
          col,
          position: tileLabel(row, col, rows, cols),
        });
      } catch (err) {
        logger?.warn('lot_identify', `Tile ${row}-${col} extraction failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return tiles.length > 0 ? tiles : null;
}

// ── Single Tile Analysis ─────────────────────────────────────────────────────

const TILE_ANALYSIS_PROMPT = (tilePosition: string, address: string, contextHint: string) => [
  `You are a Texas Registered Professional Land Surveyor performing a ZOOMED-IN analysis`,
  `of a specific section of a map, plat, deed, or document image.`,
  ``,
  `This is the ${tilePosition} section of the full image.`,
  `The address being researched is: "${address}"`,
  ``,
  `${contextHint}`,
  ``,
  `INSTRUCTIONS — READ EVERYTHING CAREFULLY:`,
  `  1. Read ALL text visible in this zoomed section — every label, number, name, bearing.`,
  `  2. If you see lot numbers, list EVERY one. Don't skip any.`,
  `  3. If you see bearings (e.g., N 45° 30' 15" E), transcribe them EXACTLY.`,
  `  4. If you see distances (e.g., 150.00'), transcribe them EXACTLY.`,
  `  5. If you see curve data (delta angles, radii, arc lengths, chord bearings), transcribe it ALL.`,
  `  6. If you see addresses (e.g., "123 Oak St"), list every one — these are CRITICAL for matching lots to addresses.`,
  `  7. If you see property IDs, owner names, acreage/area values, or recording references, capture them.`,
  `  8. If this appears to be a deed, extract ALL legal description fragments (metes & bounds calls, lot/block references).`,
  `  9. Note any pin markers, symbols, or highlights.`,
  `  10. Describe any physical features: buildings, fences, roads, boundaries.`,
  ``,
  `Because this is a zoomed-in section, you should be able to read text that might be`,
  `too small to read in the full image. Take advantage of this and read EVERYTHING.`,
  ``,
  `Respond with JSON (no markdown):`,
  `{`,
  `  "text_visible": ["every piece of text you can read"],`,
  `  "lot_numbers": ["7", "8"],`,
  `  "block_numbers": ["2"],`,
  `  "street_names": ["Oak Street"],`,
  `  "subdivision_names": ["Belton Heights"],`,
  `  "addresses_visible": ["123 Oak Street", "125 Oak Street"],`,
  `  "property_ids": ["R12345"],`,
  `  "owner_names": ["John Smith", "Jane Doe"],`,
  `  "bearings": ["N 45° 30' 15\" E"],`,
  `  "distances": ["150.00'"],`,
  `  "curve_data": ["Delta=12°30'00\", R=300.00', L=65.45', CB=N 51°45'15\" E"],`,
  `  "acreage_values": ["0.250 acres", "10,890 sq ft"],`,
  `  "legal_description_fragments": ["Being Lot 7, Block 2 of Belton Heights, a subdivision in Bell County, Texas"],`,
  `  "recording_references": ["Vol. 1234, Pg. 567", "Cabinet A, Slide 23", "Instrument #2020-12345"],`,
  `  "features": ["fence line along south boundary", "driveway on east side"],`,
  `  "pin_position": "Red pin visible in upper-left of this section" or null,`,
  `  "buildings": ["single-family residence, L-shaped, roof color brown"],`,
  `  "notes": "any other notable observations from this zoomed section",`,
  `  "confidence": 85`,
  `}`,
].join('\n');

async function analyzeTile(
  tile: TileBuffer,
  address: string,
  contextHint: string,
): Promise<TileAnalysis> {
  const prompt = TILE_ANALYSIS_PROMPT(tile.position, address, contextHint);
  const base64 = tile.buffer.toString('base64');

  try {
    const result = await callVision(
      base64,
      'image/jpeg',
      'AERIAL_IMAGE_ANALYZER' as PromptKey,
      prompt,
    );

    const data = result.response as Record<string, unknown>;

    return {
      position: tile.position,
      row: tile.row,
      col: tile.col,
      data: {
        text_visible: toStringArray(data.text_visible),
        lot_numbers: toStringArray(data.lot_numbers),
        block_numbers: toStringArray(data.block_numbers),
        street_names: toStringArray(data.street_names),
        subdivision_names: toStringArray(data.subdivision_names),
        addresses_visible: toStringArray(data.addresses_visible),
        property_ids: toStringArray(data.property_ids),
        owner_names: toStringArray(data.owner_names),
        bearings: toStringArray(data.bearings),
        distances: toStringArray(data.distances),
        curve_data: toStringArray(data.curve_data),
        acreage_values: toStringArray(data.acreage_values),
        legal_description_fragments: toStringArray(data.legal_description_fragments),
        recording_references: toStringArray(data.recording_references),
        features: toStringArray(data.features),
        pin_position: data.pin_position ? String(data.pin_position) : null,
        buildings: toStringArray(data.buildings),
        notes: data.notes ? String(data.notes) : '',
      },
      confidence: typeof data.confidence === 'number' ? data.confidence : 50,
      raw_response: data,
    };
  } catch {
    return {
      position: tile.position,
      row: tile.row,
      col: tile.col,
      data: emptyTileData(),
      confidence: 0,
      raw_response: {},
    };
  }
}

// ── Merge Logic ──────────────────────────────────────────────────────────────

/** Deduplicate arrays by normalizing whitespace and case */
function dedup(arr: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of arr) {
    const normalized = item.trim().toUpperCase();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(item.trim());
    }
  }
  return result;
}

function mergeTileData(base: MapTileData, additions: MapTileData[]): MapTileData {
  const collect = (field: keyof MapTileData) =>
    [base[field] as string[], ...additions.map(a => a[field] as string[])].flat();

  // Use the most specific pin position (prefer tile analyses that found one)
  let pinPosition = base.pin_position;
  for (const a of additions) {
    if (a.pin_position && (!pinPosition || a.pin_position.length > pinPosition.length)) {
      pinPosition = a.pin_position;
    }
  }

  const allNotes = [base.notes, ...additions.map(a => a.notes)].filter(Boolean);

  return {
    text_visible: dedup(collect('text_visible')),
    lot_numbers: dedup(collect('lot_numbers')),
    block_numbers: dedup(collect('block_numbers')),
    street_names: dedup(collect('street_names')),
    subdivision_names: dedup(collect('subdivision_names')),
    addresses_visible: dedup(collect('addresses_visible')),
    property_ids: dedup(collect('property_ids')),
    owner_names: dedup(collect('owner_names')),
    bearings: dedup(collect('bearings')),
    distances: dedup(collect('distances')),
    curve_data: dedup(collect('curve_data')),
    acreage_values: dedup(collect('acreage_values')),
    legal_description_fragments: dedup(collect('legal_description_fragments')),
    recording_references: dedup(collect('recording_references')),
    features: dedup(collect('features')),
    pin_position: pinPosition,
    buildings: dedup(collect('buildings')),
    notes: allNotes.join(' | '),
  };
}

/** Count new items found by additions that weren't in the base */
function countNewFindings(base: MapTileData, merged: MapTileData): string[] {
  const findings: string[] = [];

  const diffCount = (field: keyof MapTileData, label: string, showValues = true) => {
    const baseSet = new Set((base[field] as string[]).map(v => v.toUpperCase()));
    const newItems = (merged[field] as string[]).filter(v => !baseSet.has(v.toUpperCase()));
    if (newItems.length > 0) {
      findings.push(showValues
        ? `${newItems.length} new ${label}: ${newItems.join(', ')}`
        : `${newItems.length} new ${label}`);
    }
  };

  diffCount('lot_numbers', 'lot numbers');
  diffCount('block_numbers', 'block numbers');
  diffCount('street_names', 'street names');
  diffCount('subdivision_names', 'subdivisions');
  diffCount('addresses_visible', 'addresses');
  diffCount('property_ids', 'property IDs');
  diffCount('owner_names', 'owner names');
  diffCount('bearings', 'bearings', false);
  diffCount('distances', 'distances', false);
  diffCount('curve_data', 'curve data entries', false);
  diffCount('acreage_values', 'acreage values');
  diffCount('legal_description_fragments', 'legal description fragments', false);
  diffCount('recording_references', 'recording references');
  if (merged.pin_position && !base.pin_position) findings.push(`Pin position found: ${merged.pin_position}`);

  return findings;
}

// ── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Perform iterative deep analysis of an image.
 *
 * Pass 1: Full image analysis — overview.
 * Pass 2 (conditional): 2×2 tile analysis — zoom into quadrants for detail.
 * Pass 3 (conditional): 3×3 tile analysis — even finer detail if still not confident.
 * Pass 4 (optional): Contextual re-analysis — feed all findings back and re-examine.
 *
 * Each pass adds progressively more detail. The service automatically decides
 * whether tiling is needed based on confidence thresholds, or can be forced.
 */
export async function iterativeImageAnalysis(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg',
  options: IterativeAnalysisOptions,
  logger?: PipelineLogger,
): Promise<IterativeAnalysisResult> {
  const passes: AnalysisPass[] = [];
  const allTileAnalyses: TileAnalysis[] = [];
  let usedTiling = false;
  let usedDeepTiling = false;

  logger?.info('lot_identify', `[Iterative] Starting analysis for ${options.imageType}: ${options.address}`);

  // ── Pass 1: Full image analysis ────────────────────────────────────────

  logger?.info('lot_identify', `[Iterative] Pass 1: Full image analysis`);

  const fullResult = await analyzeFullImage(imageBase64, mediaType, options.prompt);

  const p1Findings = [
    `${fullResult.data.lot_numbers.length} lots`,
    `${fullResult.data.street_names.length} streets`,
    `${fullResult.data.block_numbers.length} blocks`,
    fullResult.data.addresses_visible.length > 0 ? `${fullResult.data.addresses_visible.length} addresses` : '',
    fullResult.data.bearings.length > 0 ? `${fullResult.data.bearings.length} bearings` : '',
    fullResult.data.legal_description_fragments.length > 0 ? `${fullResult.data.legal_description_fragments.length} legal desc fragments` : '',
  ].filter(Boolean);

  passes.push({
    type: 'full_image',
    api_calls: 1,
    confidence: fullResult.confidence,
    new_findings: p1Findings,
  });

  let currentMerged = fullResult.data;
  let currentConfidence = fullResult.confidence;

  logger?.info('lot_identify',
    `[Iterative] Pass 1 result: confidence=${fullResult.confidence}%, ` +
    `lots=${fullResult.data.lot_numbers.join(',') || 'none'}, ` +
    `blocks=${fullResult.data.block_numbers.join(',') || 'none'}, ` +
    `addresses=${fullResult.data.addresses_visible.join(',') || 'none'}`,
  );

  // ── Pass 2: 2×2 tile analysis (if needed) ──────────────────────────────

  const shouldTile = options.forceTiling || currentConfidence < TILE_CONFIDENCE_THRESHOLD;

  if (shouldTile) {
    logger?.info('lot_identify',
      `[Iterative] Pass 2: Tiling 2×2 (confidence ${currentConfidence}% < ${TILE_CONFIDENCE_THRESHOLD}% threshold${options.forceTiling ? ' or forced' : ''})`,
    );

    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const tiles = await tileImage(imageBuffer, 2, 2, logger);

    if (tiles && tiles.length > 0) {
      usedTiling = true;
      const contextHint = `Full image showed: ${fullResult.data.lot_numbers.length} lots, ${fullResult.data.street_names.length} streets. Look for ADDITIONAL detail in this zoomed section.`;

      // Analyze tiles in parallel (2 at a time to manage API rate limits)
      const tileResults: TileAnalysis[] = [];
      for (let i = 0; i < tiles.length; i += 2) {
        const batch = tiles.slice(i, i + 2);
        const results = await Promise.all(
          batch.map(t => analyzeTile(t, options.address, contextHint)),
        );
        tileResults.push(...results);
      }

      allTileAnalyses.push(...tileResults);
      const tileData = tileResults.map(t => t.data);
      const preMerge = { ...currentMerged };
      currentMerged = mergeTileData(currentMerged, tileData);
      const newFindings = countNewFindings(preMerge, currentMerged);

      // Update confidence — weighted average with tile results
      const tileConfidences = tileResults.map(t => t.confidence).filter(c => c > 0);
      if (tileConfidences.length > 0) {
        const avgTileConf = tileConfidences.reduce((a, b) => a + b, 0) / tileConfidences.length;
        // Tile results boost confidence because we've verified with more detail
        currentConfidence = Math.min(100, Math.round(
          fullResult.confidence * 0.4 + avgTileConf * 0.6,
        ));
      }

      passes.push({
        type: 'tile_2x2',
        api_calls: tileResults.length,
        confidence: currentConfidence,
        new_findings: newFindings,
      });

      logger?.info('lot_identify',
        `[Iterative] Pass 2 result: confidence=${currentConfidence}%, ` +
        `${newFindings.length > 0 ? `NEW: ${newFindings.join('; ')}` : 'no new findings'}`,
      );
    }
  }

  // ── Pass 3: 3×3 tile analysis (if still not confident) ────────────────

  const maxGrid = options.maxTileGrid ?? '3x3';
  const shouldDeepTile = maxGrid === '3x3' &&
    (currentConfidence < DEEP_TILE_CONFIDENCE_THRESHOLD) &&
    usedTiling; // Only do 3×3 if 2×2 was already done

  if (shouldDeepTile) {
    logger?.info('lot_identify',
      `[Iterative] Pass 3: Deep tiling 3×3 (confidence ${currentConfidence}% < ${DEEP_TILE_CONFIDENCE_THRESHOLD}% threshold)`,
    );

    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const tiles = await tileImage(imageBuffer, 3, 3, logger);

    if (tiles && tiles.length > 0) {
      usedDeepTiling = true;
      const contextHint = [
        `Previous analysis found: lots=[${currentMerged.lot_numbers.join(', ')}], blocks=[${currentMerged.block_numbers.join(', ')}].`,
        `This is a DEEPER zoom for maximum detail. Read EVERY character you can see.`,
      ].join(' ');

      // Analyze tiles 3 at a time
      const tileResults: TileAnalysis[] = [];
      for (let i = 0; i < tiles.length; i += 3) {
        const batch = tiles.slice(i, i + 3);
        const results = await Promise.all(
          batch.map(t => analyzeTile(t, options.address, contextHint)),
        );
        tileResults.push(...results);
      }

      allTileAnalyses.push(...tileResults);
      const tileData = tileResults.map(t => t.data);
      const preMerge = { ...currentMerged };
      currentMerged = mergeTileData(currentMerged, tileData);
      const newFindings = countNewFindings(preMerge, currentMerged);

      const tileConfidences = tileResults.map(t => t.confidence).filter(c => c > 0);
      if (tileConfidences.length > 0) {
        const avgTileConf = tileConfidences.reduce((a, b) => a + b, 0) / tileConfidences.length;
        currentConfidence = Math.min(100, Math.round(
          currentConfidence * 0.3 + avgTileConf * 0.7,
        ));
      }

      passes.push({
        type: 'tile_3x3',
        api_calls: tileResults.length,
        confidence: currentConfidence,
        new_findings: newFindings,
      });

      logger?.info('lot_identify',
        `[Iterative] Pass 3 result: confidence=${currentConfidence}%, ` +
        `${newFindings.length > 0 ? `NEW: ${newFindings.join('; ')}` : 'no new findings'}`,
      );
    }
  }

  // ── Pass 4: Contextual re-analysis (optional) ──────────────────────────
  // Feed all accumulated findings back and ask the AI to re-examine the full
  // image with that context. This often catches details that were missed
  // initially because the AI now knows what to look for.

  let finalSynthesis: string | null = null;

  if (!options.skipFinalSynthesis && usedTiling && currentMerged.lot_numbers.length > 0) {
    logger?.info('lot_identify', `[Iterative] Pass 4: Contextual re-analysis with accumulated findings`);

    try {
      const contextPrompt = [
        `You are a Texas Registered Professional Land Surveyor re-examining this image`,
        `with the benefit of detailed zoomed tile analysis. Your PRIMARY GOAL is to determine`,
        `which specific lot/parcel the address "${options.address}" belongs to.`,
        ``,
        `FINDINGS FROM ZOOMED TILE ANALYSIS:`,
        `  Lot numbers found: ${currentMerged.lot_numbers.join(', ') || 'none'}`,
        `  Block numbers found: ${currentMerged.block_numbers.join(', ') || 'none'}`,
        `  Street names found: ${currentMerged.street_names.join(', ') || 'none'}`,
        `  Subdivision names: ${currentMerged.subdivision_names.join(', ') || 'none'}`,
        `  Addresses visible: ${currentMerged.addresses_visible.join(', ') || 'none'}`,
        `  Property IDs: ${currentMerged.property_ids.join(', ') || 'none'}`,
        `  Owner names: ${currentMerged.owner_names.join(', ') || 'none'}`,
        `  Pin position: ${currentMerged.pin_position || 'not detected'}`,
        `  Buildings: ${currentMerged.buildings.join(', ') || 'none'}`,
        `  Physical features: ${currentMerged.features.join(', ') || 'none'}`,
        currentMerged.bearings.length > 0 ? `  Bearings: ${currentMerged.bearings.join(', ')}` : '',
        currentMerged.distances.length > 0 ? `  Distances: ${currentMerged.distances.join(', ')}` : '',
        currentMerged.curve_data.length > 0 ? `  Curve data: ${currentMerged.curve_data.join(', ')}` : '',
        currentMerged.acreage_values.length > 0 ? `  Acreage values: ${currentMerged.acreage_values.join(', ')}` : '',
        currentMerged.legal_description_fragments.length > 0 ? `  Legal description fragments: ${currentMerged.legal_description_fragments.join(' | ')}` : '',
        currentMerged.recording_references.length > 0 ? `  Recording references: ${currentMerged.recording_references.join(', ')}` : '',
        ``,
        `ADDRESS-TO-LOT MATCHING INSTRUCTIONS:`,
        `  1. Look at the addresses visible on the image. Which one matches "${options.address}"?`,
        `  2. The address might be on an ADJACENT lot — verify the address label is actually INSIDE the lot boundary, not just nearby.`,
        `  3. If you can see house numbers, match them to lot boundaries precisely.`,
        `  4. Consider: the target address might be lot N but the pin/label could appear near lot N+1 or N-1.`,
        `  5. If this is a deed, identify EXACTLY which lot/block/subdivision the legal description references.`,
        ``,
        `VERIFICATION INSTRUCTIONS:`,
        `  - Re-examine the full image with all the context above. Do any findings change?`,
        `  - Can you now see details you missed before? Are any findings WRONG?`,
        `  - Verify each lot number against what you can actually read in the image.`,
        `  - Confirm the pin position relative to lot boundaries.`,
        ``,
        `Respond with JSON:`,
        `{`,
        `  "verified_lot_numbers": ["lots you can confirm exist in the image"],`,
        `  "verified_block_numbers": ["blocks you can confirm"],`,
        `  "address_lot_mapping": {"123 Oak St": "Lot 7", "125 Oak St": "Lot 8"},`,
        `  "target_lot_for_address": "the specific lot number that ${options.address} falls on",`,
        `  "target_block_for_address": "the block number for the target lot",`,
        `  "target_subdivision": "the subdivision name",`,
        `  "corrections": ["any corrections to tile findings"],`,
        `  "additional_findings": ["anything new you now notice"],`,
        `  "confidence": 85,`,
        `  "synthesis": "detailed explanation of how you determined which lot belongs to the target address"`,
        `}`,
      ].filter(Boolean).join('\n');

      const result = await callVision(
        imageBase64,
        mediaType,
        'AERIAL_IMAGE_ANALYZER' as PromptKey,
        contextPrompt,
      );

      const data = result.response as Record<string, unknown>;
      finalSynthesis = data.synthesis ? String(data.synthesis) : null;

      // Apply any corrections
      const verifiedLots = toStringArray(data.verified_lot_numbers);
      const corrections = toStringArray(data.corrections);
      const additional = toStringArray(data.additional_findings);
      const finalConf = typeof data.confidence === 'number' ? data.confidence : currentConfidence;

      // If the re-analysis found a specific target lot, boost its significance
      if (data.target_lot_for_address) {
        const targetLot = String(data.target_lot_for_address);
        if (!currentMerged.lot_numbers.map(l => l.toUpperCase()).includes(targetLot.toUpperCase())) {
          currentMerged.lot_numbers.push(targetLot);
        }
      }

      currentConfidence = Math.round(currentConfidence * 0.4 + finalConf * 0.6);

      passes.push({
        type: 'contextual_reanalysis',
        api_calls: 1,
        confidence: currentConfidence,
        new_findings: [
          ...corrections.map(c => `CORRECTION: ${c}`),
          ...additional.map(a => `NEW: ${a}`),
          verifiedLots.length > 0 ? `Verified lots: ${verifiedLots.join(', ')}` : '',
        ].filter(Boolean),
      });

      logger?.info('lot_identify',
        `[Iterative] Pass 4 result: confidence=${currentConfidence}%, ` +
        `verified ${verifiedLots.length} lots, ${corrections.length} corrections`,
      );
    } catch (err) {
      logger?.warn('lot_identify',
        `[Iterative] Pass 4 failed (non-critical): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Build final result ─────────────────────────────────────────────────

  const totalApiCalls = passes.reduce((sum, p) => sum + p.api_calls, 0);
  logger?.info('lot_identify',
    `[Iterative] Complete: ${passes.length} passes, ${totalApiCalls} API calls, ` +
    `final confidence=${currentConfidence}%, ` +
    `lots=[${currentMerged.lot_numbers.join(', ')}], ` +
    `blocks=[${currentMerged.block_numbers.join(', ')}]`,
  );

  return {
    merged: currentMerged,
    full_image_confidence: fullResult.confidence,
    tile_confidence: allTileAnalyses.length > 0
      ? Math.round(allTileAnalyses.reduce((s, t) => s + t.confidence, 0) / allTileAnalyses.length)
      : fullResult.confidence,
    final_confidence: currentConfidence,
    total_passes: passes.length,
    passes,
    tile_analyses: allTileAnalyses,
    used_tiling: usedTiling,
    used_deep_tiling: usedDeepTiling,
    final_synthesis: finalSynthesis,
  };
}

// ── Full Image Analysis ──────────────────────────────────────────────────────

async function analyzeFullImage(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg',
  prompt: string,
): Promise<{ data: MapTileData; confidence: number; raw: Record<string, unknown> }> {
  try {
    const result = await callVision(
      imageBase64,
      mediaType,
      'AERIAL_IMAGE_ANALYZER' as PromptKey,
      prompt,
    );

    const data = result.response as Record<string, unknown>;

    return {
      data: {
        text_visible: toStringArray(data.text_visible),
        lot_numbers: toStringArray(data.lot_numbers_visible ?? data.lot_numbers),
        block_numbers: toStringArray(data.block_numbers_visible ?? data.block_numbers),
        street_names: toStringArray(data.streets_visible ?? data.street_names),
        subdivision_names: toStringArray(data.subdivision_names_visible ?? data.subdivision_names),
        addresses_visible: toStringArray(data.addresses_visible),
        property_ids: toStringArray(data.property_ids),
        owner_names: toStringArray(data.owner_names),
        bearings: toStringArray(data.bearings),
        distances: toStringArray(data.distances),
        curve_data: toStringArray(data.curve_data),
        acreage_values: toStringArray(data.acreage_values),
        legal_description_fragments: toStringArray(data.legal_description_fragments),
        recording_references: toStringArray(data.recording_references),
        features: toStringArray(data.features_near_pin ?? data.features),
        pin_position: data.pin_position ? String(data.pin_position) : null,
        buildings: toStringArray(data.buildings_near_pin ?? data.buildings),
        notes: data.notes ? String(data.notes) : '',
      },
      confidence: typeof data.confidence === 'number' ? data.confidence : 50,
      raw: data,
    };
  } catch {
    return { data: emptyTileData(), confidence: 0, raw: {} };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter(v => v != null && String(v).trim() !== '').map(String);
}

function emptyTileData(): MapTileData {
  return {
    text_visible: [],
    lot_numbers: [],
    block_numbers: [],
    street_names: [],
    subdivision_names: [],
    addresses_visible: [],
    property_ids: [],
    owner_names: [],
    bearings: [],
    distances: [],
    curve_data: [],
    acreage_values: [],
    legal_description_fragments: [],
    recording_references: [],
    features: [],
    pin_position: null,
    buildings: [],
    notes: '',
  };
}
