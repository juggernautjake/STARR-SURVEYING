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
  /** Bearings and distances (for plats) */
  bearings: string[];
  distances: string[];
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
  `of a specific section of a map or document image.`,
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
  `  5. Note any pin markers, symbols, or highlights.`,
  `  6. Describe any physical features: buildings, fences, roads, boundaries.`,
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
  `  "bearings": ["N 45° 30' 15\" E"],`,
  `  "distances": ["150.00'"],`,
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
        bearings: toStringArray(data.bearings),
        distances: toStringArray(data.distances),
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
  const allTextVisible = [base.text_visible, ...additions.map(a => a.text_visible)].flat();
  const allLots = [base.lot_numbers, ...additions.map(a => a.lot_numbers)].flat();
  const allBlocks = [base.block_numbers, ...additions.map(a => a.block_numbers)].flat();
  const allStreets = [base.street_names, ...additions.map(a => a.street_names)].flat();
  const allSubdivs = [base.subdivision_names, ...additions.map(a => a.subdivision_names)].flat();
  const allBearings = [base.bearings, ...additions.map(a => a.bearings)].flat();
  const allDistances = [base.distances, ...additions.map(a => a.distances)].flat();
  const allFeatures = [base.features, ...additions.map(a => a.features)].flat();
  const allBuildings = [base.buildings, ...additions.map(a => a.buildings)].flat();

  // Use the most specific pin position (prefer tile analyses that found one)
  let pinPosition = base.pin_position;
  for (const a of additions) {
    if (a.pin_position && (!pinPosition || a.pin_position.length > pinPosition.length)) {
      pinPosition = a.pin_position;
    }
  }

  const allNotes = [base.notes, ...additions.map(a => a.notes)].filter(Boolean);

  return {
    text_visible: dedup(allTextVisible),
    lot_numbers: dedup(allLots),
    block_numbers: dedup(allBlocks),
    street_names: dedup(allStreets),
    subdivision_names: dedup(allSubdivs),
    bearings: dedup(allBearings),
    distances: dedup(allDistances),
    features: dedup(allFeatures),
    pin_position: pinPosition,
    buildings: dedup(allBuildings),
    notes: allNotes.join(' | '),
  };
}

/** Count new items found by additions that weren't in the base */
function countNewFindings(base: MapTileData, merged: MapTileData): string[] {
  const findings: string[] = [];
  const newLots = merged.lot_numbers.filter(l => !base.lot_numbers.map(b => b.toUpperCase()).includes(l.toUpperCase()));
  const newBlocks = merged.block_numbers.filter(b => !base.block_numbers.map(x => x.toUpperCase()).includes(b.toUpperCase()));
  const newStreets = merged.street_names.filter(s => !base.street_names.map(x => x.toUpperCase()).includes(s.toUpperCase()));
  const newSubdivs = merged.subdivision_names.filter(s => !base.subdivision_names.map(x => x.toUpperCase()).includes(s.toUpperCase()));
  const newBearings = merged.bearings.filter(b => !base.bearings.includes(b));

  if (newLots.length > 0) findings.push(`${newLots.length} new lot numbers: ${newLots.join(', ')}`);
  if (newBlocks.length > 0) findings.push(`${newBlocks.length} new block numbers: ${newBlocks.join(', ')}`);
  if (newStreets.length > 0) findings.push(`${newStreets.length} new street names: ${newStreets.join(', ')}`);
  if (newSubdivs.length > 0) findings.push(`${newSubdivs.length} new subdivisions: ${newSubdivs.join(', ')}`);
  if (newBearings.length > 0) findings.push(`${newBearings.length} new bearings found`);
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

  passes.push({
    type: 'full_image',
    api_calls: 1,
    confidence: fullResult.confidence,
    new_findings: [
      `${fullResult.data.lot_numbers.length} lots`,
      `${fullResult.data.street_names.length} streets`,
      `${fullResult.data.block_numbers.length} blocks`,
    ],
  });

  let currentMerged = fullResult.data;
  let currentConfidence = fullResult.confidence;

  logger?.info('lot_identify',
    `[Iterative] Pass 1 result: confidence=${fullResult.confidence}%, ` +
    `lots=${fullResult.data.lot_numbers.join(',') || 'none'}, ` +
    `blocks=${fullResult.data.block_numbers.join(',') || 'none'}`,
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
        `You are re-examining this image with the benefit of detailed tile analysis.`,
        `The address being researched is: "${options.address}"`,
        ``,
        `FINDINGS FROM ZOOMED TILE ANALYSIS:`,
        `  Lot numbers found: ${currentMerged.lot_numbers.join(', ') || 'none'}`,
        `  Block numbers found: ${currentMerged.block_numbers.join(', ') || 'none'}`,
        `  Street names found: ${currentMerged.street_names.join(', ') || 'none'}`,
        `  Subdivision names: ${currentMerged.subdivision_names.join(', ') || 'none'}`,
        `  Pin position: ${currentMerged.pin_position || 'not detected'}`,
        `  Buildings: ${currentMerged.buildings.join(', ') || 'none'}`,
        `  Physical features: ${currentMerged.features.join(', ') || 'none'}`,
        currentMerged.bearings.length > 0 ? `  Bearings: ${currentMerged.bearings.join(', ')}` : '',
        currentMerged.distances.length > 0 ? `  Distances: ${currentMerged.distances.join(', ')}` : '',
        ``,
        `NOW: Re-examine the full image with this context. Do any of these findings change?`,
        `Can you now see details you missed before? Are any of these findings WRONG?`,
        ``,
        `CRITICAL: Verify each lot number. Confirm the pin position relative to lots.`,
        `If you disagree with any tile finding, explain why.`,
        ``,
        `Respond with JSON:`,
        `{`,
        `  "verified_lot_numbers": ["lots you can confirm"],`,
        `  "verified_block_numbers": ["blocks you can confirm"],`,
        `  "corrections": ["any corrections to the tile findings"],`,
        `  "additional_findings": ["anything new you now notice"],`,
        `  "target_lot_for_address": "which specific lot the address falls on",`,
        `  "confidence": 85,`,
        `  "synthesis": "detailed explanation of your final assessment"`,
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
        bearings: toStringArray(data.bearings),
        distances: toStringArray(data.distances),
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
    bearings: [],
    distances: [],
    features: [],
    pin_position: null,
    buildings: [],
    notes: '',
  };
}
