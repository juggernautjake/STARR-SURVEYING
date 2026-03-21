/**
 * Bell County Plat Analyzer
 *
 * Uses Claude Vision AI to analyze plat images and extract:
 *   - Lot dimensions (bearings, distances)
 *   - Monuments called
 *   - Easements shown on the plat
 *   - Curves and arc data
 *   - Right-of-way widths
 *   - Adjacent lot references
 *   - Changes from previous plats
 */

import type { PlatRecord, PlatAnalysis, PlatSection, AiUsageSummary } from '../types/research-result.js';
import { computeConfidence, SOURCE_RELIABILITY } from '../types/confidence.js';
import {
  accumulateUsage,
  buildUsageFromTokens,
  zeroUsage,
} from './ai-cost-helpers.js';

// ── Types ────────────────────────────────────────────────────────────

export interface PlatAnalysisInput {
  platRecords: PlatRecord[];
  /** Legal description for cross-validation */
  legalDescription: string | null;
  /** Deed-derived bearings/distances for comparison */
  deedCalls: string[];
}

export interface PlatAnalyzerProgress {
  phase: string;
  message: string;
  timestamp: string;
}

export interface PlatAnalysisResult {
  section: PlatSection;
  aiUsage: AiUsageSummary;
}

// ── Main Export ───────────────────────────────────────────────────────

/**
 * Analyze all plat records using AI vision.
 */
export async function analyzeBellPlats(
  input: PlatAnalysisInput,
  anthropicApiKey: string,
  onProgress: (p: PlatAnalyzerProgress) => void,
): Promise<PlatAnalysisResult> {
  const progress = (msg: string) => {
    onProgress({ phase: 'Plat Analysis', message: msg, timestamp: new Date().toISOString() });
  };

  const usage = zeroUsage();

  if (input.platRecords.length === 0) {
    progress('No plat records to analyze');
    return {
      section: {
        summary: 'No plat records were found during research.',
        plats: [],
        crossValidation: [],
        confidence: computeConfidence({
          sourceReliability: 0,
          dataUsefulness: 0,
          crossValidation: 0,
          sourceName: 'none',
          validatedBy: [],
          contradictedBy: [],
        }),
      },
      aiUsage: usage,
    };
  }

  progress(`Analyzing ${input.platRecords.length} plat record(s)...`);

  // ── Analyze each plat with AI vision ───────────────────────────────
  const analyzedPlats: PlatRecord[] = [];

  for (const plat of input.platRecords) {
    if (plat.images.length > 0) {
      progress(`Analyzing plat: ${plat.name}`);
      const { analysis, usage: callUsage } = await analyzePlatImage(plat.images, anthropicApiKey);
      accumulateUsage(usage, callUsage);
      analyzedPlats.push({ ...plat, aiAnalysis: analysis });
    } else {
      analyzedPlats.push(plat);
    }
  }

  // ── Cross-validate plat vs deed calls ──────────────────────────────
  progress('Cross-validating plat data against deed records...');
  const crossValidation = crossValidatePlatVsDeeds(analyzedPlats, input.deedCalls);

  // ── Generate summary ───────────────────────────────────────────────
  const summary = generatePlatSummary(analyzedPlats);

  // ── Compute confidence ─────────────────────────────────────────────
  const hasAnalysis = analyzedPlats.some(p => p.aiAnalysis !== null);
  const hasCrossVal = crossValidation.length > 0;

  return {
    section: {
      summary,
      plats: analyzedPlats,
      crossValidation,
      confidence: computeConfidence({
        sourceReliability: SOURCE_RELIABILITY['county-clerk-official'],
        dataUsefulness: hasAnalysis ? 30 : 10,
        crossValidation: hasCrossVal ? 20 : 5,
        sourceName: 'Bell County Plat Records',
        validatedBy: crossValidation.filter(cv => cv.startsWith('MATCH')),
        contradictedBy: crossValidation.filter(cv => cv.startsWith('MISMATCH')),
      }),
    },
    aiUsage: usage,
  };
}

// ── Image splitting & resize utilities ────────────────────────────────

const MAX_PLAT_DIMENSION = 7_900; // leave 100px margin below the hard 8000 limit
const MAX_PLAT_IMAGE_BYTES = 4_718_592; // 4.5 MiB safety margin

interface PlatImageRegion {
  data: string;        // base64
  mediaType: 'image/png' | 'image/jpeg';
  label: string;
  regionIndex: number;
  totalRegions: number;
}

/**
 * Split a plat image into overlapping regions for thorough OCR analysis.
 * Plats are typically large, detailed drawings — splitting extracts fine detail
 * that would be lost when the image is downsized to fit API limits.
 *
 * Strategy: full image + 2 halves = up to 3 regions with 15% overlap.
 */
async function splitPlatImageIntoRegions(base64Img: string): Promise<PlatImageRegion[]> {
  try {
    const { default: sharp } = await import('sharp') as { default: typeof import('sharp') };
    const buf = Buffer.from(base64Img, 'base64');
    const meta = await sharp(buf).metadata();
    const { width, height } = meta;
    if (!width || !height) return [];

    const OVERLAP = 0.15;
    const regions: PlatImageRegion[] = [];

    async function cropRegion(
      left: number, top: number, w: number, h: number, label: string,
    ): Promise<PlatImageRegion | null> {
      try {
        const cl = Math.max(0, Math.round(left));
        const ct = Math.max(0, Math.round(top));
        const cw = Math.min(Math.round(w), width! - cl);
        const ch = Math.min(Math.round(h), height! - ct);
        if (cw < 50 || ch < 50) return null;

        let cropped = await sharp(buf).extract({ left: cl, top: ct, width: cw, height: ch }).toBuffer();
        const cropMeta = await sharp(cropped).metadata();
        let mediaType: 'image/png' | 'image/jpeg' = 'image/png';

        if ((cropMeta.width ?? 0) > MAX_PLAT_DIMENSION || (cropMeta.height ?? 0) > MAX_PLAT_DIMENSION) {
          const scale = MAX_PLAT_DIMENSION / Math.max(cropMeta.width ?? 1, cropMeta.height ?? 1);
          cropped = await sharp(cropped)
            .resize(Math.round((cropMeta.width ?? 1) * scale), Math.round((cropMeta.height ?? 1) * scale), { fit: 'inside', withoutEnlargement: true })
            .png().toBuffer();
        }
        if (cropped.length > MAX_PLAT_IMAGE_BYTES) {
          cropped = await sharp(cropped).jpeg({ quality: 80 }).toBuffer();
          mediaType = 'image/jpeg';
        }
        if (cropped.length > MAX_PLAT_IMAGE_BYTES) {
          cropped = await sharp(cropped).jpeg({ quality: 60 }).toBuffer();
          mediaType = 'image/jpeg';
        }
        if (cropped.length > MAX_PLAT_IMAGE_BYTES) return null;

        return { data: cropped.toString('base64'), mediaType, label, regionIndex: 0, totalRegions: 0 };
      } catch { return null; }
    }

    const halfH = height / 2;
    const overlapH = height * OVERLAP;

    // Full image (resized)
    const fullResized = await resizePlatImage(base64Img);
    if (fullResized) {
      regions.push({ ...fullResized, label: 'full image (overview)', regionIndex: 0, totalRegions: 0 });
    }

    // Top half (with overlap into bottom)
    const topHalf = await cropRegion(0, 0, width, halfH + overlapH, 'top half');
    if (topHalf) regions.push(topHalf);

    // Bottom half (with overlap into top)
    const bottomHalf = await cropRegion(0, halfH - overlapH, width, halfH + overlapH, 'bottom half');
    if (bottomHalf) regions.push(bottomHalf);

    for (let i = 0; i < regions.length; i++) {
      regions[i].regionIndex = i + 1;
      regions[i].totalRegions = regions.length;
    }

    console.log(`[plat-analyzer] Split ${width}x${height} plat image into ${regions.length} regions`);
    return regions;
  } catch (err) {
    console.warn(`[plat-analyzer] Image splitting failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Resizes a base64-encoded image so neither dimension exceeds 7 900 px
 * and the byte size stays below 4.5 MB. Returns the resized base64 string.
 */
async function resizePlatImage(base64Img: string): Promise<{ data: string; mediaType: 'image/png' | 'image/jpeg' } | null> {
  try {
    const { default: sharp } = await import('sharp') as { default: typeof import('sharp') };
    let buf: any = Buffer.from(base64Img, 'base64');
    const meta = await sharp(buf).metadata();
    const { width, height } = meta;
    if (!width || !height) return { data: base64Img, mediaType: 'image/png' };

    let mediaType: 'image/png' | 'image/jpeg' = 'image/png';

    // Step 1: pixel dimension resize
    if (width > MAX_PLAT_DIMENSION || height > MAX_PLAT_DIMENSION) {
      const scale = MAX_PLAT_DIMENSION / Math.max(width, height);
      const nw = Math.round(width * scale);
      const nh = Math.round(height * scale);
      console.log(`[plat-analyzer] Resizing plat image from ${width}x${height} to ${nw}x${nh}`);
      buf = await sharp(buf).resize(nw, nh, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    }

    // Step 2: byte-size compression — JPEG quality=80
    if (buf.length > MAX_PLAT_IMAGE_BYTES) {
      console.log(`[plat-analyzer] Compressing plat image (${buf.length} bytes) — JPEG q80`);
      buf = await sharp(buf).jpeg({ quality: 80 }).toBuffer();
      mediaType = 'image/jpeg';
    }

    // Step 3: byte-size compression — JPEG quality=60 (last resort)
    if (buf.length > MAX_PLAT_IMAGE_BYTES) {
      console.log(`[plat-analyzer] Re-compressing plat image (${buf.length} bytes) — JPEG q60`);
      buf = await sharp(buf).jpeg({ quality: 60 }).toBuffer();
      mediaType = 'image/jpeg';
    }

    return { data: buf.toString('base64'), mediaType };
  } catch (err) {
    // Check if the original image exceeds Claude's 8000px limit
    // If sharp isn't available, we can still check raw size via base64 header
    const rawBytes = Buffer.from(base64Img, 'base64');
    console.warn(`[plat-analyzer] Image resize failed (${rawBytes.length} bytes), checking if original is safe:`, err instanceof Error ? err.message : String(err));
    // Return null to signal the caller to skip this image rather than send an oversized one
    return null;
  }
}

// ── Internal: AI Plat Image Analysis (multi-region) ──────────────────

/** Prompt for analyzing a single plat region */
const PLAT_REGION_PROMPT = `You are an expert Texas Registered Professional Land Surveyor (RPLS) analyzing a property survey plat from Bell County, Texas. This analysis will be used directly by a field surveyor. Be exhaustive — every dimension, call, monument, and note matters.

Extract ALL of the following information in JSON format:

{
  "lotDimensions": [
    "For EVERY lot shown on the plat, list all dimensions. Format: 'Lot X: North line: 150.00 ft, South line: 148.50 ft, East line: 200.00 ft, West line: 200.00 ft, Area: 0.689 acres'",
    "Include area calculations for each lot if shown (acres or square feet)",
    "Note any irregular lot shapes or flag lots"
  ],
  "bearingsAndDistances": [
    "List EVERY bearing and distance call on the plat, going clockwise from the POB for each boundary",
    "Format exactly as shown: 'N 45°30'15\\" E, 200.50 ft'",
    "Include the lot or boundary line each call belongs to: 'Lot 3 North line: S 89°59'30\\" W, 150.00 ft'",
    "Transcribe calls along ROW, common lot lines, and outer boundary separately"
  ],
  "monuments": [
    "List ALL monuments shown: iron rods (IRF = iron rod found, IRS = iron rod set), iron pipes, concrete monuments, PK nails, railroad spikes, caps",
    "Include the RPLS number stamped on any caps: 'IRF w/ cap RPLS 5432'",
    "Note 'found' vs 'set' for each monument",
    "Include the location: 'IRS at NE corner of Lot 5'"
  ],
  "easements": [
    "List ALL easements shown with FULL details",
    "Format: 'Type: 10-ft utility easement along east line of Lots 1-5, beneficiary: Oncor Electric'",
    "Include: utility (electric, gas, water, sewer, telecom), drainage, access, pipeline, conservation",
    "Note centerline vs. edge-of-lot easements",
    "Include any blanket easements, building setback lines, and no-build zones"
  ],
  "curves": [
    "List ALL curve data with complete parameters",
    "Format: 'Curve C1: Radius=500.00 ft, Arc=125.50 ft, Chord=N 45°15'00\\" E 124.80 ft, Delta=14°22'30\\", Direction=Right'",
    "Include the associated lot line or ROW each curve belongs to"
  ],
  "rowWidths": [
    "List ALL right-of-way widths shown",
    "Format: 'FM 436: 100 ft ROW (50 ft from centerline)', 'Local Road: 60 ft ROW'",
    "Note variable-width ROW sections",
    "Include any ROW dedication notes"
  ],
  "adjacentReferences": [
    "List ALL adjacent lot, tract, owner, and survey references",
    "Format: 'North: Lot 12, Block A, Smith Addition (Vol. 200, Pg. 15)'",
    "Include abstract/survey references for adjacent tracts",
    "Note any called-for adjacent owners by name"
  ],
  "changesFromPrevious": [
    "Note any replat or amendment indicators",
    "Reference to the original plat being amended",
    "Lot line adjustments, new lot configurations",
    "Any notes about variances or exceptions granted"
  ],
  "narrative": "Write a detailed 5-10 sentence summary for a field surveyor who will be staking this property. Include: (1) the subdivision name and filing info, (2) total number of lots and reserves, (3) overall dimensions and area, (4) key monuments to search for (what type, where), (5) any unusual features (flag lots, irregular shapes, cul-de-sacs), (6) the surveyor of record (name and RPLS number), (7) the datum and coordinate system used, (8) any notes or certifications shown on the plat, (9) drainage patterns or detention areas, (10) setback or building line requirements. This narrative should give the surveyor a complete picture before going to the field."
}

IMPORTANT: Be exhaustive. A missing dimension or monument could cause the field surveyor to miss a property corner. Transcribe every number exactly as shown on the plat. If a value is partially illegible, include it with [?] notation.`;

/**
 * Analyze a single plat image region.
 */
async function analyzePlatRegion(
  client: InstanceType<typeof import('@anthropic-ai/sdk').default>,
  region: PlatImageRegion,
  imageLabel: string,
): Promise<{ text: string; usage: Partial<AiUsageSummary> }> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 10000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: region.mediaType, data: region.data },
        },
        {
          type: 'text',
          text: `You are analyzing REGION ${region.regionIndex} of ${region.totalRegions} (${region.label}) from ${imageLabel}.

${PLAT_REGION_PROMPT}

IMPORTANT: This is a cropped region of a larger plat. Extract everything visible — lot dimensions, monuments, bearings, curves, text labels, notes, certification blocks. If anything is cut off at the edges, note where it is cut off so adjacent overlapping regions can complete the data.`,
        },
      ],
    }],
  });

  const textBlock = response.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined;
  return {
    text: textBlock?.text ?? '',
    usage: buildUsageFromTokens(response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0),
  };
}

/**
 * Deep reconciliation: merge all region analyses into one authoritative plat analysis.
 */
async function reconcilePlatRegionAnalyses(
  client: InstanceType<typeof import('@anthropic-ai/sdk').default>,
  regionResults: { label: string; text: string }[],
): Promise<{ text: string; usage: Partial<AiUsageSummary> }> {
  const regionTexts = regionResults
    .map((r, i) => `══════ REGION ${i + 1}: ${r.label} ══════\n${r.text}`)
    .join('\n\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    messages: [{
      role: 'user',
      content: `You are a senior Texas Registered Professional Land Surveyor (RPLS) performing a DEEP RECONCILIATION of multiple OCR analyses of the same plat document.

The plat was split into overlapping regions and each region was analyzed independently. Your job is to:

1. **MERGE** all region analyses into ONE comprehensive, authoritative JSON result
2. **DEDUPLICATE** — the same lot, monument, or call may appear in multiple overlapping regions. Merge them into single entries.
3. **CROSS-REFERENCE** — where two regions captured the same dimension or bearing, verify they agree. Use the higher-confidence reading for conflicts.
4. **RECONSTRUCT** — reassemble any labels, dimensions, or notes split across region boundaries
5. **COMPLETE** — ensure every lot has complete dimensions (north, south, east, west lines). If a dimension appears in only one region, include it. If a lot has partial data from multiple regions, merge them.
6. **VERIFY** — check that all lots form a consistent layout:
   - Do shared lot lines have matching dimensions?
   - Do adjacent lot bearings agree where they share a common line?
   - Is the overall boundary closed?
7. **DEEP ANALYSIS** — with the complete picture:
   - Identify any lot dimension inconsistencies
   - Flag any missing monuments at critical corners
   - Note any easements that affect multiple lots
   - Check that curve data is complete (all 5 parameters)
   - Verify ROW widths are consistent with road classifications

Take all the space needed. This is the FINAL authoritative analysis.

${regionTexts}

Produce the final merged result as a single JSON object with the same schema: lotDimensions, bearingsAndDistances, monuments, easements, curves, rowWidths, adjacentReferences, changesFromPrevious, narrative. The narrative should be a comprehensive 10-15 sentence summary incorporating insights from all regions. Include a final paragraph noting what the multi-region analysis revealed that a single-pass review would have missed.`,
    }],
  });

  const textBlock = response.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined;
  return {
    text: textBlock?.text ?? '',
    usage: buildUsageFromTokens(response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0),
  };
}

/**
 * Parse a plat AI response (JSON or raw text) into a PlatAnalysis object.
 */
function parsePlatResponse(text: string): PlatAnalysis | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        lotDimensions: parsed.lotDimensions ?? [],
        bearingsAndDistances: parsed.bearingsAndDistances ?? [],
        monuments: parsed.monuments ?? [],
        easements: parsed.easements ?? [],
        curves: parsed.curves ?? [],
        rowWidths: parsed.rowWidths ?? [],
        adjacentReferences: parsed.adjacentReferences ?? [],
        changesFromPrevious: parsed.changesFromPrevious ?? [],
        narrative: parsed.narrative ?? '',
      };
    } catch {
      console.warn('[plat-analyzer] JSON parse failed in reconciled response');
    }
  }
  // Fall back to narrative extraction
  const narrativeMatch = text.match(/"narrative"\s*:\s*"([^"]+)"/);
  const rawNarrative = narrativeMatch
    ? narrativeMatch[1]
    : text.replace(/\{[\s\S]*/, '').trim().slice(0, 1000);
  if (rawNarrative.length > 0) {
    return {
      lotDimensions: [],
      bearingsAndDistances: [],
      monuments: [],
      easements: [],
      curves: [],
      rowWidths: [],
      adjacentReferences: [],
      changesFromPrevious: [],
      narrative: `[Partial — JSON parse failed] ${rawNarrative}`,
    };
  }
  return null;
}

async function analyzePlatImage(
  images: string[],
  apiKey: string,
): Promise<{ analysis: PlatAnalysis | null; usage: Partial<AiUsageSummary> }> {
  if (!apiKey || images.length === 0) return { analysis: null, usage: {} };

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const totalUsage = zeroUsage();
    const allRegionResults: { label: string; text: string }[] = [];

    // Process each plat image with region splitting
    for (let imgIdx = 0; imgIdx < Math.min(images.length, 3); imgIdx++) {
      const img = images[imgIdx];
      const imageLabel = `plat image ${imgIdx + 1} of ${Math.min(images.length, 3)}`;

      console.log(`[plat-analyzer] Splitting ${imageLabel} into regions for deep analysis...`);
      const regions = await splitPlatImageIntoRegions(img);

      if (regions.length === 0) {
        // Fallback: analyze full image without splitting
        const resized = await resizePlatImage(img);
        if (!resized) continue;
        regions.push({
          data: resized.data,
          mediaType: resized.mediaType,
          label: 'full image (unsplit)',
          regionIndex: 1,
          totalRegions: 1,
        });
      }

      console.log(`[plat-analyzer] Analyzing ${regions.length} regions for ${imageLabel}...`);

      for (const region of regions) {
        console.log(`[plat-analyzer]   → Region ${region.regionIndex}/${region.totalRegions}: ${region.label}`);
        const { text, usage } = await analyzePlatRegion(client, region, imageLabel);
        accumulateUsage(totalUsage, usage);
        if (text.length > 0) {
          allRegionResults.push({ label: `${imageLabel} — ${region.label}`, text });
        }
      }
    }

    if (allRegionResults.length === 0) {
      console.warn('[plat-analyzer] No region analyses produced results');
      return { analysis: null, usage: totalUsage };
    }

    // Single region — parse directly
    if (allRegionResults.length === 1) {
      return { analysis: parsePlatResponse(allRegionResults[0].text), usage: totalUsage };
    }

    // Deep reconciliation across all regions
    console.log(`[plat-analyzer] Running deep reconciliation across ${allRegionResults.length} region analyses...`);
    const { text: reconciledText, usage: reconUsage } = await reconcilePlatRegionAnalyses(
      client, allRegionResults,
    );
    accumulateUsage(totalUsage, reconUsage);

    const analysis = parsePlatResponse(reconciledText);
    if (analysis) return { analysis, usage: totalUsage };

    // Last resort: try to parse from first region
    return { analysis: parsePlatResponse(allRegionResults[0].text), usage: totalUsage };
  } catch (err) {
    console.warn(
      `[plat-analyzer] AI plat image analysis failed: ` +
      `${err instanceof Error ? err.message : String(err)}`,
    );
    return { analysis: null, usage: {} };
  }
}

// ── Internal: Cross-Validation ───────────────────────────────────────

function crossValidatePlatVsDeeds(
  plats: PlatRecord[],
  deedCalls: string[],
): string[] {
  const notes: string[] = [];

  const hasAnalysis = plats.some(p => p.aiAnalysis !== null);
  const hasDeedCalls = deedCalls.length > 0;

  if (!hasDeedCalls && !hasAnalysis) {
    notes.push(
      'Cross-validation skipped: no deed bearing/distance calls and no plat AI analysis available. ' +
      'Provide deed images (for AI extraction) and fetch plat images to enable cross-validation.',
    );
    return notes;
  }
  if (!hasDeedCalls) {
    notes.push(
      'Cross-validation skipped: no bearing/distance calls extracted from deed legal descriptions. ' +
      'Metes-and-bounds calls in the deed legal descriptions are required for cross-validation.',
    );
    return notes;
  }
  if (!hasAnalysis) {
    notes.push(
      'Cross-validation skipped: no plat AI analysis available. ' +
      'Plat images must be fetched and analyzed by AI before cross-validation can run.',
    );
    return notes;
  }

  for (const plat of plats) {
    if (!plat.aiAnalysis) continue;

    // Compare bearing/distance calls
    for (const platCall of plat.aiAnalysis.bearingsAndDistances) {
      const normalized = normalizeCall(platCall);
      const matchingDeed = deedCalls.find(dc => normalizeCall(dc) === normalized);

      if (matchingDeed) {
        notes.push(`MATCH: Plat call "${platCall}" confirmed by deed`);
      }
    }

    // Check for plat calls not in deeds
    const platCallsNotInDeeds = plat.aiAnalysis.bearingsAndDistances.filter(pc => {
      const normalized = normalizeCall(pc);
      return !deedCalls.some(dc => normalizeCall(dc) === normalized);
    });

    if (platCallsNotInDeeds.length > 0) {
      notes.push(`NOTE: ${platCallsNotInDeeds.length} plat call(s) not found in deed records — may be from adjacent boundaries or easements`);
    }
  }

  return notes;
}

function normalizeCall(call: string): string {
  // Remove whitespace, normalize degree symbols, round to nearest second
  return call
    .replace(/\s+/g, '')
    .replace(/[°˚]/g, 'd')
    .replace(/[''′]/g, 'm')
    .replace(/[""″]/g, 's')
    .toLowerCase();
}

// ── Internal: Summary ────────────────────────────────────────────────

function generatePlatSummary(plats: PlatRecord[]): string {
  if (plats.length === 0) return 'No plats found.';

  const withAnalysis    = plats.filter(p => p.aiAnalysis);
  const withoutAnalysis = plats.filter(p => !p.aiAnalysis);

  const totalDimensions = withAnalysis.reduce((n, p) => n + (p.aiAnalysis?.lotDimensions.length ?? 0), 0);
  const totalMonuments  = withAnalysis.reduce((n, p) => n + (p.aiAnalysis?.monuments.length ?? 0), 0);
  const totalEasements  = withAnalysis.reduce((n, p) => n + (p.aiAnalysis?.easements.length ?? 0), 0);

  const narratives = withAnalysis.map(p => p.aiAnalysis?.narrative).filter(Boolean);

  let summary = `Found ${plats.length} plat record(s). `;

  if (withoutAnalysis.length > 0) {
    const names = withoutAnalysis.map(p => p.name).join(', ');
    summary += `Plat(s) without AI analysis (images not fetched): ${names}. `;
  }
  if (withAnalysis.length > 0) {
    summary += `AI analysis extracted ${totalDimensions} dimension(s), ${totalMonuments} monument(s), and ${totalEasements} easement(s). `;
  }
  if (narratives.length > 0) {
    summary += narratives[0];
  }

  return summary;
}
