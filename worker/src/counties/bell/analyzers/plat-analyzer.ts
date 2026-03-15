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

// ── Internal: AI Plat Image Analysis ─────────────────────────────────

async function analyzePlatImage(
  images: string[],
  apiKey: string,
): Promise<{ analysis: PlatAnalysis | null; usage: Partial<AiUsageSummary> }> {
  if (!apiKey || images.length === 0) return { analysis: null, usage: {} };

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const imageContent = images.slice(0, 3).map(img => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: 'image/png' as const,
        data: img,
      },
    }));

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `You are analyzing a property survey plat from Bell County, Texas.
Extract ALL of the following information in JSON format:

{
  "lotDimensions": ["list every dimension shown, e.g., 'North line: 150.00 ft'"],
  "bearingsAndDistances": ["list every bearing and distance call, e.g., 'N 45°30'15\" E, 200.50 ft'"],
  "monuments": ["list all monuments called: iron rods, pipes, concrete, stones, etc."],
  "easements": ["list all easements shown: utility, drainage, access, etc. with widths"],
  "curves": ["list all curve data: radius, arc length, chord, delta angle"],
  "rowWidths": ["list all right-of-way widths shown"],
  "adjacentReferences": ["list all adjacent lot/tract/owner references"],
  "changesFromPrevious": ["note any replat or amendment indicators"],
  "narrative": "A 3-5 sentence summary of the plat for a field surveyor, noting key dimensions, monuments to look for, and any unusual features"
}

Be thorough — every dimension, call, and monument matters for the survey.`,
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
