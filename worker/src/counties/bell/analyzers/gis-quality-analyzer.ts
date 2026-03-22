// worker/src/counties/bell/analyzers/gis-quality-analyzer.ts
// AI-powered quality analysis for GIS viewer screenshots.
//
// After each GIS screenshot is captured, this module uses Claude Vision to
// determine whether:
//   1. The zoom level is appropriate for the intended capture
//   2. The correct layers are visible (parcels, lot lines, aerial, etc.)
//   3. The target property is actually centered in the viewport
//   4. The map rendered properly (not blank, loading, or errored)
//
// Returns a quality assessment with actionable recommendations for each
// screenshot, logged to both worker console and frontend progress logs.

import type { ScreenshotCapture } from '../types/research-result.js';
import { buildUsageFromTokens, zeroUsage, accumulateUsage } from './ai-cost-helpers.js';
import type { AiUsageSummary } from '../types/research-result.js';

// ── Types ────────────────────────────────────────────────────────────

export type GisZoomAssessment = 'too_far' | 'correct' | 'too_close' | 'unknown';
export type GisLayerStatus = 'visible' | 'not_visible' | 'unknown';

export interface GisQualityCheck {
  /** Which screenshot label this applies to */
  label: string;
  /** Index in the screenshot array */
  index: number;
  /** Did the map actually render content? */
  mapRendered: boolean;
  /** Is the zoom level appropriate for the intended capture? */
  zoomAssessment: GisZoomAssessment;
  /** Are parcel/property boundary lines visible? */
  parcelLinesVisible: GisLayerStatus;
  /** Are lot dimension lines visible? */
  lotLinesVisible: GisLayerStatus;
  /** Is the basemap aerial/satellite? */
  aerialBasemapActive: GisLayerStatus;
  /** Is the target property visible/centered? */
  propertyVisible: boolean;
  /** Can individual lot shapes be distinguished? */
  lotsDistinguishable: boolean;
  /** Can property ID labels be read? */
  propertyIdsReadable: boolean;
  /** Overall quality score 0-100 */
  qualityScore: number;
  /** Human-readable summary of what the screenshot shows */
  whatIsShown: string;
  /** Specific recommendations for improvement */
  recommendations: string[];
}

export interface GisQualityReport {
  /** Per-screenshot assessments */
  checks: GisQualityCheck[];
  /** Overall summary for logging */
  summary: string;
  /** Actionable recommendations for the capture module */
  actionableAdjustments: string[];
  /** AI usage for all quality analysis calls */
  aiUsage: AiUsageSummary;
}

// ── Constants ─────────────────────────────────────────────────────────

/** Expected characteristics for each screenshot type (keyed by description pattern) */
const EXPECTED_CHARACTERISTICS: Array<{
  pattern: RegExp;
  expectAerial: boolean;
  expectParcelLines: boolean;
  expectLotLines: boolean;
  expectZoom: 'tight' | 'medium' | 'wide';
  description: string;
}> = [
  { pattern: /maximum detail/i, expectAerial: false, expectParcelLines: true, expectLotLines: true, expectZoom: 'tight', description: 'Maximum detail (tightest zoom on target lot)' },
  { pattern: /target parcel detail/i, expectAerial: false, expectParcelLines: true, expectLotLines: true, expectZoom: 'tight', description: 'Target parcel detail (lot lines visible)' },
  { pattern: /lot with neighbors/i, expectAerial: false, expectParcelLines: true, expectLotLines: true, expectZoom: 'medium', description: 'Lot with immediate neighbors' },
  { pattern: /subdivision overview/i, expectAerial: false, expectParcelLines: true, expectLotLines: true, expectZoom: 'wide', description: 'Subdivision overview (all lots)' },
  { pattern: /aerial.*tight.*with/i, expectAerial: true, expectParcelLines: true, expectLotLines: false, expectZoom: 'tight', description: 'Aerial eagle view (tight) with property lines' },
  { pattern: /aerial.*with property lines/i, expectAerial: true, expectParcelLines: true, expectLotLines: false, expectZoom: 'medium', description: 'Aerial eagle view with property lines' },
  { pattern: /aerial.*subdivision/i, expectAerial: true, expectParcelLines: true, expectLotLines: false, expectZoom: 'wide', description: 'Aerial subdivision overview' },
  { pattern: /aerial.*without/i, expectAerial: true, expectParcelLines: false, expectLotLines: false, expectZoom: 'medium', description: 'Clean aerial (no property lines)' },
  { pattern: /adjacent lot/i, expectAerial: false, expectParcelLines: true, expectLotLines: true, expectZoom: 'medium', description: 'Adjacent lot view' },
  { pattern: /lot lines only/i, expectAerial: false, expectParcelLines: false, expectLotLines: true, expectZoom: 'tight', description: 'Lot lines only (dimensions)' },
  { pattern: /aerial max zoom/i, expectAerial: true, expectParcelLines: false, expectLotLines: true, expectZoom: 'tight', description: 'Aerial max zoom with lot lines' },
  { pattern: /neighborhood.*streets/i, expectAerial: false, expectParcelLines: true, expectLotLines: true, expectZoom: 'wide', description: 'Neighborhood context (streets)' },
  { pattern: /aerial neighborhood/i, expectAerial: true, expectParcelLines: true, expectLotLines: true, expectZoom: 'wide', description: 'Aerial neighborhood context' },
];

// ── Main Export ──────────────────────────────────────────────────────

/**
 * Analyze GIS viewer screenshots for quality, zoom correctness, and layer visibility.
 * Sends each screenshot to Claude Vision for evaluation against expected characteristics.
 *
 * @param screenshots - GIS viewer screenshots to analyze
 * @param anthropicApiKey - API key for Claude
 * @param propertyId - Target property ID for context
 * @param onProgress - Progress callback for logging
 * @returns Quality report with per-screenshot assessments and recommendations
 */
export async function analyzeGisScreenshotQuality(
  screenshots: ScreenshotCapture[],
  anthropicApiKey: string,
  propertyId: string | null,
  onProgress: (msg: string) => void,
): Promise<GisQualityReport> {
  const usage = zeroUsage();
  const checks: GisQualityCheck[] = [];

  if (screenshots.length === 0 || !anthropicApiKey) {
    return {
      checks: [],
      summary: 'No GIS screenshots to analyze',
      actionableAdjustments: [],
      aiUsage: usage,
    };
  }

  onProgress(`Analyzing ${screenshots.length} GIS screenshot(s) for quality...`);

  // Process in batches of 3 to keep token usage manageable
  const BATCH_SIZE = 3;
  for (let i = 0; i < screenshots.length; i += BATCH_SIZE) {
    const batch = screenshots.slice(i, i + BATCH_SIZE);
    const batchIndices = batch.map((_, j) => i + j);

    try {
      const batchResults = await analyzeGisBatch(
        batch,
        batchIndices,
        anthropicApiKey,
        propertyId,
      );
      checks.push(...batchResults.checks);
      accumulateUsage(usage, batchResults.usage);

      // Log each result as we go
      for (const check of batchResults.checks) {
        const icon = check.qualityScore >= 70 ? '✓' : check.qualityScore >= 40 ? '⚠' : '✗';
        onProgress(`  ${icon} [${check.qualityScore}/100] ${check.label}: ${check.whatIsShown}`);
        for (const rec of check.recommendations) {
          onProgress(`    → ${rec}`);
        }
      }
    } catch (err) {
      console.warn(`[gis-quality] Batch analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      // Mark batch screenshots as unknown quality
      for (let j = 0; j < batch.length; j++) {
        checks.push(createUnknownCheck(batch[j].description, i + j));
      }
    }
  }

  // Build summary
  const avgScore = checks.length > 0
    ? Math.round(checks.reduce((sum, c) => sum + c.qualityScore, 0) / checks.length)
    : 0;
  const goodCount = checks.filter(c => c.qualityScore >= 70).length;
  const warnCount = checks.filter(c => c.qualityScore >= 40 && c.qualityScore < 70).length;
  const poorCount = checks.filter(c => c.qualityScore < 40).length;

  const summary = `GIS Quality: ${avgScore}/100 avg — ${goodCount} good, ${warnCount} fair, ${poorCount} poor out of ${checks.length} screenshots`;
  onProgress(summary);

  // Collect all unique recommendations
  const allRecs = new Set<string>();
  for (const check of checks) {
    for (const rec of check.recommendations) {
      allRecs.add(rec);
    }
  }

  // Build actionable adjustments
  const actionableAdjustments = buildActionableAdjustments(checks);

  if (actionableAdjustments.length > 0) {
    onProgress('Recommended adjustments for future captures:');
    for (const adj of actionableAdjustments) {
      onProgress(`  • ${adj}`);
    }
  }

  return {
    checks,
    summary,
    actionableAdjustments,
    aiUsage: usage,
  };
}

// ── Internal: Batch Analysis via Claude Vision ───────────────────────

async function analyzeGisBatch(
  batch: ScreenshotCapture[],
  indices: number[],
  apiKey: string,
  propertyId: string | null,
): Promise<{ checks: GisQualityCheck[]; usage: AiUsageSummary }> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });
  const batchUsage = zeroUsage();

  // Build the content array with all screenshots in the batch
  const content: Array<{ type: string; source?: unknown; text?: string }> = [];

  for (let j = 0; j < batch.length; j++) {
    const ss = batch[j];
    const expected = findExpectedCharacteristics(ss.description);

    content.push({
      type: 'text',
      text: `Screenshot ${j + 1} of ${batch.length} (index ${indices[j]}):
Description: "${ss.description}"
Expected: ${expected ? expected.description : 'General GIS map view'}
Expected zoom: ${expected?.expectZoom ?? 'unknown'}
Expected aerial basemap: ${expected?.expectAerial ?? false}
Expected parcel lines: ${expected?.expectParcelLines ?? true}
Expected lot lines: ${expected?.expectLotLines ?? false}
Target property ID: ${propertyId ?? 'unknown'}`,
    });

    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: ss.imageBase64,
      },
    });
  }

  content.push({
    type: 'text',
    text: GIS_QUALITY_PROMPT,
  });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: content as never }],
  });

  // Extract usage
  const tokUsage = buildUsageFromTokens(
    (response.usage as { input_tokens?: number })?.input_tokens ?? 0,
    (response.usage as { output_tokens?: number })?.output_tokens ?? 0,
  );
  accumulateUsage(batchUsage, tokUsage);

  // Parse JSON response
  const responseText = response.content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { type: string; text?: string }) => b.text ?? '')
    .join('');

  const checks = parseQualityResponse(responseText, batch, indices);

  return { checks, usage: batchUsage };
}

// ── Prompt ───────────────────────────────────────────────────────────

const GIS_QUALITY_PROMPT = `You are analyzing GIS (Geographic Information System) map screenshots from a county property viewer.

For EACH screenshot above, evaluate:

1. **mapRendered**: Did the map actually render content (not blank, loading spinner, error)?
2. **zoomAssessment**: Is the zoom level appropriate?
   - "too_far" = showing a whole city/county when we need lots
   - "correct" = showing the expected level of detail
   - "too_close" = zoomed in too far, can't see meaningful context
3. **parcelLinesVisible**: Can you see property boundary lines drawn on the map? ("visible", "not_visible", "unknown")
4. **lotLinesVisible**: Can you see lot dimension/measurement lines? ("visible", "not_visible", "unknown")
5. **aerialBasemapActive**: Is the basemap aerial/satellite imagery vs a street/vector map? ("visible" for aerial, "not_visible" for streets/vector, "unknown")
6. **propertyVisible**: Is a specific property parcel visible and roughly centered?
7. **lotsDistinguishable**: Can you distinguish individual lot shapes/boundaries?
8. **propertyIdsReadable**: Can you read property ID labels on the map?
9. **qualityScore**: 0-100 overall quality rating considering all factors vs expected characteristics
10. **whatIsShown**: One sentence describing what the screenshot actually shows
11. **recommendations**: Array of specific improvement suggestions. Consider:
    - If zoom is wrong, recommend specific zoom adjustment (e.g., "Zoom in 3-4 more levels to see individual lots")
    - If layers are missing, recommend toggling specific layers
    - If basemap is wrong, recommend switching basemaps
    - If property isn't centered, recommend re-centering
    - If map didn't render, recommend waiting longer or retrying

Respond with ONLY a JSON array (one object per screenshot), no markdown fences:
[
  {
    "mapRendered": true,
    "zoomAssessment": "correct",
    "parcelLinesVisible": "visible",
    "lotLinesVisible": "visible",
    "aerialBasemapActive": "not_visible",
    "propertyVisible": true,
    "lotsDistinguishable": true,
    "propertyIdsReadable": true,
    "qualityScore": 85,
    "whatIsShown": "Street map showing individual lots in a subdivision with property boundaries and ID labels",
    "recommendations": ["Zoom in 1 more level for better dimension readability"]
  }
]`;

// ── Response Parsing ────────────────────────────────────────────────

function parseQualityResponse(
  text: string,
  batch: ScreenshotCapture[],
  indices: number[],
): GisQualityCheck[] {
  const checks: GisQualityCheck[] = [];

  try {
    // Try to find JSON array in response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('[gis-quality] No JSON array found in response');
      return batch.map((ss, j) => createUnknownCheck(ss.description, indices[j]));
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      return batch.map((ss, j) => createUnknownCheck(ss.description, indices[j]));
    }

    for (let j = 0; j < batch.length; j++) {
      const item = parsed[j];
      if (!item) {
        checks.push(createUnknownCheck(batch[j].description, indices[j]));
        continue;
      }

      checks.push({
        label: batch[j].description,
        index: indices[j],
        mapRendered: item.mapRendered ?? false,
        zoomAssessment: validateZoomAssessment(item.zoomAssessment),
        parcelLinesVisible: validateLayerStatus(item.parcelLinesVisible),
        lotLinesVisible: validateLayerStatus(item.lotLinesVisible),
        aerialBasemapActive: validateLayerStatus(item.aerialBasemapActive),
        propertyVisible: item.propertyVisible ?? false,
        lotsDistinguishable: item.lotsDistinguishable ?? false,
        propertyIdsReadable: item.propertyIdsReadable ?? false,
        qualityScore: Math.max(0, Math.min(100, item.qualityScore ?? 0)),
        whatIsShown: item.whatIsShown ?? 'Unknown content',
        recommendations: Array.isArray(item.recommendations) ? item.recommendations : [],
      });
    }
  } catch (err) {
    console.warn(`[gis-quality] Failed to parse response: ${err instanceof Error ? err.message : String(err)}`);
    return batch.map((ss, j) => createUnknownCheck(ss.description, indices[j]));
  }

  return checks;
}

function validateZoomAssessment(val: unknown): GisZoomAssessment {
  if (val === 'too_far' || val === 'correct' || val === 'too_close') return val;
  return 'unknown';
}

function validateLayerStatus(val: unknown): GisLayerStatus {
  if (val === 'visible' || val === 'not_visible') return val;
  return 'unknown';
}

function createUnknownCheck(label: string, index: number): GisQualityCheck {
  return {
    label,
    index,
    mapRendered: false,
    zoomAssessment: 'unknown',
    parcelLinesVisible: 'unknown',
    lotLinesVisible: 'unknown',
    aerialBasemapActive: 'unknown',
    propertyVisible: false,
    lotsDistinguishable: false,
    propertyIdsReadable: false,
    qualityScore: 0,
    whatIsShown: 'Could not analyze — AI review failed',
    recommendations: ['Retry quality analysis'],
  };
}

function findExpectedCharacteristics(description: string) {
  for (const ec of EXPECTED_CHARACTERISTICS) {
    if (ec.pattern.test(description)) return ec;
  }
  return null;
}

// ── Actionable Adjustments ──────────────────────────────────────────

function buildActionableAdjustments(checks: GisQualityCheck[]): string[] {
  const adjustments: string[] = [];

  // Check for systemic zoom issues
  const tooFarCount = checks.filter(c => c.zoomAssessment === 'too_far').length;
  const tooCloseCount = checks.filter(c => c.zoomAssessment === 'too_close').length;
  if (tooFarCount > checks.length / 3) {
    adjustments.push(`${tooFarCount} screenshots are zoomed too far out — increase initial zoom level or add more zoom-in clicks`);
  }
  if (tooCloseCount > checks.length / 3) {
    adjustments.push(`${tooCloseCount} screenshots are zoomed too close — reduce zoom-in clicks`);
  }

  // Check for unrendered maps
  const notRendered = checks.filter(c => !c.mapRendered).length;
  if (notRendered > 0) {
    adjustments.push(`${notRendered} screenshot(s) show a blank or loading map — increase MAP_SETTLE_WAIT or verify GIS URL`);
  }

  // Check for missing layers
  const missingParcels = checks.filter(c =>
    c.parcelLinesVisible === 'not_visible' && findExpectedCharacteristics(c.label)?.expectParcelLines,
  ).length;
  if (missingParcels > 0) {
    adjustments.push(`${missingParcels} screenshot(s) expected parcel lines but they were not visible — check toggleParcelLayer()`);
  }

  const missingLotLines = checks.filter(c =>
    c.lotLinesVisible === 'not_visible' && findExpectedCharacteristics(c.label)?.expectLotLines,
  ).length;
  if (missingLotLines > 0) {
    adjustments.push(`${missingLotLines} screenshot(s) expected lot lines but they were not visible — check toggleLotLineLayer()`);
  }

  // Check for wrong basemap
  const wrongBasemap = checks.filter(c => {
    const expected = findExpectedCharacteristics(c.label);
    if (!expected) return false;
    if (expected.expectAerial && c.aerialBasemapActive === 'not_visible') return true;
    if (!expected.expectAerial && c.aerialBasemapActive === 'visible') return true;
    return false;
  }).length;
  if (wrongBasemap > 0) {
    adjustments.push(`${wrongBasemap} screenshot(s) have the wrong basemap — check switchToAerialBasemap()/switchToStreetsBasemap()`);
  }

  // Check for target property visibility
  const notVisible = checks.filter(c => !c.propertyVisible).length;
  if (notVisible > checks.length / 3) {
    adjustments.push(`${notVisible} screenshot(s) don't show the target property — verify zoomToParcel() is centering correctly`);
  }

  return adjustments;
}
