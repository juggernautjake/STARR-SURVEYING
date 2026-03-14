// worker/src/services/geo-reconcile.ts
// Geometric Reconciliation Engine — 3-Phase System
//
// Implements the pipeline from Starr Software Spec v2.0 §6.
//
// Phase 1: VISUAL GEOMETRY — Claude Vision analyzes the plat drawing image,
//          measuring boundary line angles and distances using the north arrow
//          and scale bar, independent of the printed text labels.
//
// Phase 2: TEXT EXTRACTION — Handled externally by ai-extraction.ts.
//
// Phase 3: CROSS-REFERENCE RECONCILIATION — Compare Phase 1 visual measurements
//          against Phase 2 text extraction. Flag conflicts such as the spec's
//          documented L4 bearing conflict (three conflicting readings from
//          different passes: N86°, N36°, N56°).

import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedBoundaryData, BoundaryCall } from '../types/index.js';
import type { PipelineLogger } from '../lib/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VisualMeasurement {
  sequence: number;
  /** Visual bearing estimate, e.g. "N 45°30' E (estimated)" */
  visualBearing: string | null;
  /** Printed bearing label from the drawing */
  textLabel: string | null;
  /** Visual distance estimate in feet */
  visualDistance_ft: number | null;
  /** Printed distance label in feet */
  textLabelDistance_ft: number | null;
  /** Do visual and text measurements agree within tolerance? */
  agreement: boolean;
  conflictNote: string | null;
}

export interface GeometryConflict {
  sequence: number;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Multiple candidate values (e.g. when watermark obscures a digit) */
  candidates: string[];
}

export interface VisualGeometryAnalysis {
  /** Rotation of the north arrow from true vertical (positive = clockwise) */
  northArrowRotationDeg: number;
  /** Drawing scale in feet per inch */
  scaleFt_per_in: number | null;
  visualMeasurements: VisualMeasurement[];
  conflicts: GeometryConflict[];
  drawingQuality: 'high' | 'medium' | 'low' | 'unknown';
  northArrowPresent: boolean;
  scaleBarPresent: boolean;
  notes: string;
}

export interface ReconciliationResult {
  phase1Visual: VisualGeometryAnalysis | null;
  /** Summary of each call's reconciliation status */
  callReconciliations: CallReconciliation[];
  /** Agreements: calls where visual and text match within tolerance */
  agreementCount: number;
  /** Conflicts: calls where visual and text measurements disagree */
  conflictCount: number;
  /** Calls only visible in text extraction (not in plat drawing or no visual match) */
  textOnlyCount: number;
  /** Overall agreement percentage (0-100) */
  overallAgreementPct: number;
  /** Specific bearing conflicts found (spec §5: e.g. L4 = N86° vs N36° vs N56°) */
  bearingConflicts: GeometryConflict[];
  /** Recommended bearing value per conflicted call (AI's best guess) */
  recommendations: Array<{ sequence: number; recommendedValue: string; reasoning: string }>;
}

export interface CallReconciliation {
  sequence: number;
  textBearing: string | null;
  visualBearing: string | null;
  textDistance_ft: number | null;
  visualDistance_ft: number | null;
  bearingAgreement: boolean | null;
  distanceAgreement: boolean | null;
  status: 'confirmed' | 'conflict' | 'text_only' | 'unresolved';
  note: string | null;
}

// ── Tolerances ────────────────────────────────────────────────────────────────

/** Bearing difference (in degrees) below which visual and text are considered to agree */
const BEARING_TOLERANCE_DEG = 5;
/** Distance difference (as fraction of text value) below which they agree */
const DISTANCE_TOLERANCE_PCT = 0.05; // 5%

// ── Phase 1 System Prompt ─────────────────────────────────────────────────────

const VISUAL_GEOMETRY_SYSTEM = `You are an expert Texas registered professional land surveyor (RPLS) with 30+ years experience reading plat drawings.

Your task is to VISUALLY MEASURE the boundary geometry from this plat drawing image. Do not just read the printed text labels — ANALYZE the geometric relationships of the drawn lines.

ANALYZE THE FOLLOWING:

1. NORTH ARROW: Find the north arrow. Is it pointing straight up (true north) or rotated? Estimate the rotation angle in degrees (positive = clockwise).

2. SCALE BAR: Find the scale bar. What is the scale (e.g., 1" = 50 feet)?

3. BOUNDARY LINES: For each line segment in the outer perimeter/boundary:
   - Visually estimate the bearing angle using the north arrow as your reference
   - Use the scale bar to visually estimate the distance in feet
   - Compare your visual estimate with the printed text label
   - Note any disagreement > 5 degrees or > 5%

4. CURVES: For each curve:
   - Estimate the radius (compare arc to scale bar)
   - Note the direction (left/right)
   - Compare with curve table if visible

5. CONFLICTS: Flag any case where your visual measurement meaningfully differs from the text label — especially where watermarks may be obscuring digits. A watermark that obscures the tens digit of a bearing (e.g., making N86° look like N36° or N56°) is a critical conflict.

Return ONLY valid JSON (no markdown fences):
{
  "northArrowRotationDeg": 0,
  "scaleFt_per_in": 50,
  "northArrowPresent": true,
  "scaleBarPresent": true,
  "drawingQuality": "high",
  "visualMeasurements": [
    {
      "sequence": 1,
      "visualBearing": "N 45°30' E (estimated)",
      "textLabel": "N 45°28'15\\" E",
      "visualDistance_ft": 150.0,
      "textLabelDistance_ft": 149.92,
      "agreement": true,
      "conflictNote": null
    }
  ],
  "conflicts": [
    {
      "sequence": 4,
      "description": "Label reads N86° but drawn line appears N36° — likely watermark obscuring the '8' in '86'",
      "severity": "high",
      "candidates": ["N 86°00'00\\" E", "N 36°00'00\\" E", "N 56°00'00\\" E"]
    }
  ],
  "notes": "any observations about drawing quality, datum notation, or missing elements"
}`;

// ── Phase 1: Visual geometry analysis ────────────────────────────────────────

/**
 * Phase 1: Send the plat image to Claude Vision with the geometric measurement
 * prompt. Returns a structured analysis of visually-measured bearings and
 * distances, independent of the printed text labels.
 *
 * @param imageBase64  Base64-encoded plat image
 * @param mediaType    Image MIME type
 * @param anthropicApiKey  Anthropic API key
 * @param logger       Pipeline logger
 * @param label        Human-readable label for log messages
 */
export async function analyzeVisualGeometry(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg',
  anthropicApiKey: string,
  logger: PipelineLogger,
  label = 'plat',
): Promise<VisualGeometryAnalysis | null> {
  const tracker = logger.startAttempt({
    layer: 'GeoReconcile-Phase1',
    source: 'Claude-Vision',
    method: 'visual-geometry',
    input: label,
  });

  // Resize image if it exceeds Claude's 5MB per-image limit (~6.4M base64 chars)
  let sendBase64 = imageBase64;
  let sendMediaType: 'image/png' | 'image/jpeg' = mediaType;
  const MAX_BASE64 = 6_400_000;
  if (imageBase64.length > MAX_BASE64) {
    tracker.step(`Image exceeds API limit (${(imageBase64.length / 1_000_000).toFixed(1)}M base64) — resizing...`);
    try {
      const { default: sharp } = await import('sharp') as { default: typeof import('sharp') };
      const buf = Buffer.from(imageBase64, 'base64');
      // Try JPEG q85 at max 4000px
      let resized = await sharp(buf)
        .resize({ width: 4000, height: 4000, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      let b64 = resized.toString('base64');
      if (b64.length > MAX_BASE64) {
        // More aggressive: JPEG q65 at 3000px
        resized = await sharp(buf)
          .resize({ width: 3000, height: 3000, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 65 })
          .toBuffer();
        b64 = resized.toString('base64');
      }
      sendBase64 = b64;
      sendMediaType = 'image/jpeg';
      tracker.step(`Resized: ${imageBase64.length} → ${b64.length} base64 chars`);
    } catch (resizeErr) {
      tracker.step(`Resize failed: ${resizeErr instanceof Error ? resizeErr.message : String(resizeErr)} — sending original`);
    }
  }

  tracker.step('Sending plat image to Claude Vision for geometric analysis...');

  try {
    const client = new Anthropic({ apiKey: anthropicApiKey });
    const response = await client.messages.create({
      model: process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      temperature: 0,
      system: VISUAL_GEOMETRY_SYSTEM,
      messages: [{
        role: 'user',
        content: [{
          type: 'image',
          source: { type: 'base64', media_type: sendMediaType, data: sendBase64 },
        }],
      }],
    });

    const textBlock = response.content.find(c => c.type === 'text');
    const raw = textBlock?.type === 'text' ? textBlock.text : '';

    if (!raw) {
      tracker({ status: 'fail', error: 'Empty response from Claude Vision' });
      return null;
    }

    // Parse the JSON response
    let parsed: Record<string, unknown> | null = null;
    try {
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      const objMatch = raw.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try { parsed = JSON.parse(objMatch[0]) as Record<string, unknown>; }
        catch { /* fall through */ }
      }
    }

    if (!parsed) {
      tracker({ status: 'fail', error: 'Failed to parse visual geometry JSON', details: raw.substring(0, 200) });
      return null;
    }

    const measurements = Array.isArray(parsed.visualMeasurements)
      ? (parsed.visualMeasurements as unknown[]).map((m: unknown) => {
          const obj = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
          return {
            sequence:             Number(obj.sequence          ?? 0),
            visualBearing:        obj.visualBearing       != null ? String(obj.visualBearing)       : null,
            textLabel:            obj.textLabel            != null ? String(obj.textLabel)            : null,
            visualDistance_ft:    obj.visualDistance_ft   != null ? Number(obj.visualDistance_ft)   : null,
            textLabelDistance_ft: obj.textLabelDistance_ft != null ? Number(obj.textLabelDistance_ft) : null,
            agreement:            Boolean(obj.agreement ?? true),
            conflictNote:         obj.conflictNote         != null ? String(obj.conflictNote)         : null,
          } satisfies VisualMeasurement;
        })
      : [];

    const conflicts = Array.isArray(parsed.conflicts)
      ? (parsed.conflicts as unknown[]).map((c: unknown) => {
          const obj = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
          const sev = String(obj.severity ?? 'medium');
          return {
            sequence:    Number(obj.sequence ?? 0),
            description: String(obj.description ?? ''),
            severity:    (['low', 'medium', 'high', 'critical'].includes(sev)
              ? sev : 'medium') as GeometryConflict['severity'],
            candidates:  Array.isArray(obj.candidates)
              ? (obj.candidates as unknown[]).map(String)
              : [],
          } satisfies GeometryConflict;
        })
      : [];

    const quality = String(parsed.drawingQuality ?? 'unknown');
    const result: VisualGeometryAnalysis = {
      northArrowRotationDeg: Number(parsed.northArrowRotationDeg ?? 0),
      scaleFt_per_in:        parsed.scaleFt_per_in != null ? Number(parsed.scaleFt_per_in) : null,
      visualMeasurements:    measurements,
      conflicts,
      drawingQuality: (['high', 'medium', 'low', 'unknown'].includes(quality)
        ? quality : 'unknown') as VisualGeometryAnalysis['drawingQuality'],
      northArrowPresent: Boolean(parsed.northArrowPresent ?? false),
      scaleBarPresent:   Boolean(parsed.scaleBarPresent   ?? false),
      notes: String(parsed.notes ?? ''),
    };

    tracker({
      status: 'success',
      dataPointsFound: measurements.length,
      details: `Visual measurements: ${measurements.length}, conflicts: ${conflicts.length}, quality: ${result.drawingQuality}`,
    });

    return result;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    tracker({ status: 'fail', error: msg });
    logger.warn('GeoReconcile', `Phase 1 failed: ${msg}`);
    return null;
  }
}

// ── Phase 3: Cross-reference reconciliation ───────────────────────────────────

/**
 * Parse a bearing string into decimal degrees for comparison.
 * Handles "N 45°30'15\" E" and similar formats.
 */
function parseBearingDeg(raw: string): number | null {
  const m = raw.match(/([NS])\s*(\d+)[°\s]\s*(\d+)?[''\s]?\s*(\d+(?:\.\d+)?)?[""']?\s*([EW])/i);
  if (!m) return null;

  const ns = m[1].toUpperCase();
  const ew = m[5].toUpperCase();
  const d  = parseFloat(m[2] ?? '0');
  const mi = parseFloat(m[3] ?? '0');
  const s  = parseFloat(m[4] ?? '0');
  const deg = d + mi / 60 + s / 3600;

  // Convert to azimuth for comparison
  if (ns === 'N' && ew === 'E') return deg;
  if (ns === 'S' && ew === 'E') return 180 - deg;
  if (ns === 'S' && ew === 'W') return 180 + deg;
  if (ns === 'N' && ew === 'W') return 360 - deg;
  return deg;
}

/**
 * Phase 3: Cross-reference visual geometry measurements against text-extracted
 * boundary data. Produces a reconciliation report flagging conflicts.
 *
 * @param visual  Phase 1 result (may be null if Phase 1 was skipped)
 * @param text    Phase 2 result from ai-extraction.ts
 * @param logger  Pipeline logger
 */
export function reconcileGeometry(
  visual: VisualGeometryAnalysis | null,
  text: ExtractedBoundaryData | null,
  logger: PipelineLogger,
): ReconciliationResult {
  logger.info('GeoReconcile-Phase3', '═══ Starting Phase 3: Cross-Reference Reconciliation ═══');

  // Index visual measurements by sequence for fast lookup
  const visualBySeq = new Map<number, VisualMeasurement>();
  for (const vm of (visual?.visualMeasurements ?? [])) {
    visualBySeq.set(vm.sequence, vm);
  }

  const callReconciliations: CallReconciliation[] = [];
  let agreementCount = 0;
  let conflictCount  = 0;
  let textOnlyCount  = 0;

  for (const call of (text?.calls ?? [])) {
    const seq = call.sequence;
    const vm  = visualBySeq.get(seq);

    const textBearing      = call.bearing?.raw ?? null;
    const textDistance_ft  = call.distance?.value ?? null;
    const visualBearing    = vm?.visualBearing    ?? null;
    const visualDistance_ft = vm?.visualDistance_ft ?? null;

    let bearingAgreement:  boolean | null = null;
    let distanceAgreement: boolean | null = null;

    if (textBearing && visualBearing) {
      const textDeg   = parseBearingDeg(textBearing);
      const visualDeg = parseBearingDeg(visualBearing);
      if (textDeg !== null && visualDeg !== null) {
        // Angular difference (smallest arc between two azimuths)
        const diff = Math.abs(((textDeg - visualDeg + 540) % 360) - 180);
        bearingAgreement = diff <= BEARING_TOLERANCE_DEG;
      }
    }

    if (textDistance_ft !== null && visualDistance_ft !== null && textDistance_ft > 0) {
      const pctDiff = Math.abs(visualDistance_ft - textDistance_ft) / textDistance_ft;
      distanceAgreement = pctDiff <= DISTANCE_TOLERANCE_PCT;
    }

    let status: CallReconciliation['status'];
    if (!vm) {
      status = 'text_only';
      textOnlyCount++;
    } else if (vm.agreement && (bearingAgreement !== false) && (distanceAgreement !== false)) {
      status = 'confirmed';
      agreementCount++;
    } else if (bearingAgreement === false || distanceAgreement === false || !vm.agreement) {
      status = 'conflict';
      conflictCount++;
    } else {
      status = 'unresolved';
    }

    callReconciliations.push({
      sequence: seq,
      textBearing,
      visualBearing,
      textDistance_ft,
      visualDistance_ft,
      bearingAgreement,
      distanceAgreement,
      status,
      note: vm?.conflictNote ?? null,
    });
  }

  const totalCalls = callReconciliations.length;
  const overallAgreementPct = totalCalls > 0
    ? Math.round((agreementCount / totalCalls) * 100)
    : 0;

  // Collect bearing conflicts from both Phase 1 and Phase 3
  const bearingConflicts: GeometryConflict[] = [
    ...(visual?.conflicts ?? []),
    ...callReconciliations
      .filter(r => r.status === 'conflict' && r.bearingAgreement === false)
      .map(r => ({
        sequence:    r.sequence,
        description: `Text reads "${r.textBearing ?? 'N/A'}" but visual estimate is "${r.visualBearing ?? 'N/A'}"`,
        severity:    'high' as const,
        candidates:  [r.textBearing, r.visualBearing].filter(Boolean) as string[],
      })),
  ];

  // AI recommendations for conflicted bearings — simple heuristic: prefer text if
  // visual uncertainty is flagged, otherwise flag for manual review
  const recommendations = callReconciliations
    .filter(r => r.status === 'conflict')
    .map(r => ({
      sequence:          r.sequence,
      recommendedValue:  r.textBearing ?? r.visualBearing ?? 'Unknown',
      reasoning:         r.bearingAgreement === false
        ? `Visual estimate (${r.visualBearing}) disagrees with text label (${r.textBearing}) by > ${BEARING_TOLERANCE_DEG}°. ` +
          `Verify against original plat — watermark may have obscured a digit.`
        : `Distance discrepancy detected (text: ${r.textDistance_ft?.toFixed(2)}ft, visual: ${r.visualDistance_ft?.toFixed(2)}ft). ` +
          `Check scale bar accuracy.`,
    }));

  logger.info('GeoReconcile-Phase3',
    `Reconciliation complete: ${totalCalls} calls, ${agreementCount} confirmed, ` +
    `${conflictCount} conflicts, ${textOnlyCount} text-only. ` +
    `Overall agreement: ${overallAgreementPct}%`);

  for (const conflict of bearingConflicts) {
    logger.warn('GeoReconcile-Phase3',
      `Bearing conflict [seq ${conflict.sequence}]: ${conflict.description} ` +
      `— candidates: ${conflict.candidates.join(', ')}`);
  }

  return {
    phase1Visual:        visual,
    callReconciliations,
    agreementCount,
    conflictCount,
    textOnlyCount,
    overallAgreementPct,
    bearingConflicts,
    recommendations,
  };
}

/**
 * Convenience function: run Phase 1 and Phase 3 together when the plat image
 * is available alongside the text extraction result.
 *
 * Returns null for phase1Visual if the image is not provided or Phase 1 fails.
 */
export async function runGeoReconcile(
  textExtraction: ExtractedBoundaryData | null,
  platImageBase64: string | null,
  platImageMediaType: 'image/png' | 'image/jpeg' | null,
  anthropicApiKey: string,
  logger: PipelineLogger,
  label = 'plat',
): Promise<ReconciliationResult> {
  let visual: VisualGeometryAnalysis | null = null;

  if (platImageBase64 && platImageMediaType) {
    visual = await analyzeVisualGeometry(
      platImageBase64, platImageMediaType,
      anthropicApiKey, logger, label,
    );
  } else {
    logger.info('GeoReconcile', 'No plat image provided — skipping Phase 1 visual analysis');
  }

  return reconcileGeometry(visual, textExtraction, logger);
}
