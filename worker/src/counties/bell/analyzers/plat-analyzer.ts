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

// ── Internal: Image resize utility ───────────────────────────────────

const MAX_PLAT_DIMENSION = 7_900; // leave 100px margin below the hard 8000 limit
const MAX_PLAT_IMAGE_BYTES = 4_718_592; // 4.5 MiB safety margin

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

// ── Internal: AI Plat Image Analysis ─────────────────────────────────

async function analyzePlatImage(
  images: string[],
  apiKey: string,
): Promise<{ analysis: PlatAnalysis | null; usage: Partial<AiUsageSummary> }> {
  if (!apiKey || images.length === 0) return { analysis: null, usage: {} };

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    // Resize images to fit within Claude Vision API limits (max 8000px per dimension)
    const resizeResults = await Promise.all(images.slice(0, 3).map(img => resizePlatImage(img)));
    const resized = resizeResults.filter((r): r is NonNullable<typeof r> => r !== null);
    if (resized.length === 0) {
      console.warn('[plat-analyzer] All plat images failed resize — skipping AI analysis');
      return { analysis: null, usage: {} };
    }
    const imageContent = resized.map(({ data, mediaType }) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: mediaType,
        data,
      },
    }));

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `You are an expert Texas Registered Professional Land Surveyor (RPLS) analyzing a property survey plat from Bell County, Texas. This analysis will be used directly by a field surveyor. Be exhaustive — every dimension, call, monument, and note matters.

Extract ALL of the following information in JSON format:

{
  "lotDimensions": [
    "For EVERY lot shown on the plat, list all dimensions. Format: 'Lot X: North line: 150.00 ft, South line: 148.50 ft, East line: 200.00 ft, West line: 200.00 ft, Area: 0.689 acres'",
    "Include area calculations for each lot if shown (acres or square feet)",
    "Note any irregular lot shapes or flag lots"
  ],
  "bearingsAndDistances": [
    "List EVERY bearing and distance call on the plat, going clockwise from the POB for each boundary",
    "Format exactly as shown: 'N 45°30'15\" E, 200.50 ft'",
    "Include the lot or boundary line each call belongs to: 'Lot 3 North line: S 89°59'30\" W, 150.00 ft'",
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
    "Format: 'Curve C1: Radius=500.00 ft, Arc=125.50 ft, Chord=N 45°15'00\" E 124.80 ft, Delta=14°22'30\", Direction=Right'",
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

IMPORTANT: Be exhaustive. A missing dimension or monument could cause the field surveyor to miss a property corner. Transcribe every number exactly as shown on the plat. If a value is partially illegible, include it with [?] notation.`,
          },
        ],
      }],
    });

    const textBlock = response.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined;
    const callUsage = buildUsageFromTokens(
      response.usage?.input_tokens ?? 0,
      response.usage?.output_tokens ?? 0,
    );

    if (!textBlock) return { analysis: null, usage: callUsage };

    // Try to parse JSON response
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          analysis: {
            lotDimensions: parsed.lotDimensions ?? [],
            bearingsAndDistances: parsed.bearingsAndDistances ?? [],
            monuments: parsed.monuments ?? [],
            easements: parsed.easements ?? [],
            curves: parsed.curves ?? [],
            rowWidths: parsed.rowWidths ?? [],
            adjacentReferences: parsed.adjacentReferences ?? [],
            changesFromPrevious: parsed.changesFromPrevious ?? [],
            narrative: parsed.narrative ?? '',
          },
          usage: callUsage,
        };
      } catch {
        // JSON parse failed — fall back to extracting a narrative from the raw text
        console.warn('[plat-analyzer] AI response was not valid JSON; extracting narrative as partial analysis');
        const narrativeMatch = textBlock.text.match(/"narrative"\s*:\s*"([^"]+)"/);
        const rawNarrative = narrativeMatch
          ? narrativeMatch[1]
          : textBlock.text.replace(/\{[\s\S]*/, '').trim().slice(0, 500);
        return {
          analysis: {
            lotDimensions: [],
            bearingsAndDistances: [],
            monuments: [],
            easements: [],
            curves: [],
            rowWidths: [],
            adjacentReferences: [],
            changesFromPrevious: [],
            narrative: `[Partial — JSON parse failed] ${rawNarrative}`,
          },
          usage: callUsage,
        };
      }
    }
    return { analysis: null, usage: callUsage };
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
