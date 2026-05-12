// worker/src/services/geo-reconcile.ts
// Geometric Reconciliation Engine — 3-Phase System
//
// Implements the pipeline from Starr Software Spec v2.0 §6 and the
// geo-reconcile.js reference script.
//
// Phase 1: VISUAL GEOMETRY — Claude Vision analyzes the plat drawing image,
//          measuring boundary line angles and distances using the north arrow
//          and scale bar, independent of the printed text labels.
//          Sub-phases (from geo-reconcile.js):
//            1A: Full overview — north arrow, scale, overall layout
//            1B: Survey data area crop — detailed line geometry
//            1C-top: Upper lots crop — individual lot boundary analysis
//            1C-bot: Lower lots crop — road curves, reserve boundaries
//
// Phase 2: TEXT EXTRACTION — Handled externally by ai-extraction.ts.
//
// Phase 3: CROSS-REFERENCE RECONCILIATION — Compare Phase 1 visual measurements
//          against Phase 2 text extraction. Flag conflicts such as the spec's
//          documented L4 bearing conflict (three conflicting readings from
//          different passes: N86°, N36°, N56°).
//
//          Phase 3A: Boundary map reconciliation — structured B1/B2.../I1/I2...
//          line map with [ESTIMATED]/[VERIFY]/[MISSING] confidence tags.

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

/** Multi-crop Phase 1 results from all four sub-analyses */
export interface MultiCropAnalysis {
  /** Phase 1A: Full-image overview (north arrow, scale, overall layout) */
  overviewText: string;
  /** Phase 1B: Survey data area crop — detailed line geometry */
  geometryText: string;
  /** Phase 1C-top: Upper lots crop */
  topLotsText: string;
  /** Phase 1C-bot: Lower lots crop */
  botLotsText: string;
  /** Number of API calls made (always 4 when successful) */
  apiCallCount: number;
}

/** Confidence tag summary derived from Phase 3A boundary map text */
export interface ConfidenceSummary {
  high: number;
  medium: number;
  low: number;
  /** Count of [ESTIMATED] tags — geometry-only values (no readable text source) */
  estimated: number;
  /**
   * Count of [DEDUCED] tags — values resolved from context clues
   * (e.g. watermark-obscured digit deduced from adjacent geometry or deed).
   * From geo-reconcile.js reference: distinct from ESTIMATED because the
   * analyst has evidence to determine the correct value, not just geometry.
   */
  deduced: number;
  verify: number;
  missing: number;
}

export interface ReconciliationResult {
  phase1Visual: VisualGeometryAnalysis | null;
  /**
   * Multi-crop Phase 1 narrative results (Phase 1A-1C from geo-reconcile.js).
   * Populated when a plat image + sharp are available.
   */
  multiCropAnalysis: MultiCropAnalysis | null;
  /**
   * Phase 3A: Structured boundary map produced by Claude, combining
   * multi-crop geometry and text extraction. Contains B1/B2/I1/I2 line IDs,
   * reconciled bearings/distances, and [ESTIMATED]/[VERIFY]/[MISSING] tags.
   */
  boundaryMap: string | null;
  /** Confidence tag counts derived from the Phase 3A boundary map text */
  confidenceSummary: ConfidenceSummary | null;
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

/** API pixel limit for Claude Vision — images above this must be resized */
const API_MAX_PX = 7999;

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

// ── Phase 1A Prompt: Overview analysis ───────────────────────────────────────

const OVERVIEW_PROMPT = `You are a professional land surveyor analyzing a subdivision plat drawing.

TASK: Analyze the GEOMETRY of this drawing — not just the text, but the visual elements.

1. NORTH ARROW: Where is it? What direction does it point relative to the page?
   - Estimate rotation in degrees from page-up (0° = north is straight up)

2. SCALE BAR: Find the scale bar or scale notation.
   - What is the stated scale? (e.g., 1" = 100')

3. OVERALL LAYOUT: Describe the spatial arrangement of lots.
   - How many lots? Where is each relative to the others?
   - Which lots are along which roads?
   - General shape of the subdivision

4. ROADS: Identify all roads shown — names, orientations, curves.

5. LOT TOPOLOGY: For each lot, describe:
   - Approximate shape
   - Which lots/roads/features border each side
   - Approximate orientation of each boundary line

Answer with precise geometric observations. This is for survey-grade analysis.`;

// ── Shared "do not reconcile" rule injected into all Phase 1 geometry prompts ─
// From geo-reconcile.js reference script: disagreements between visual geometry
// and printed text are diagnostic findings, not errors to be silently corrected.

const NO_RECONCILE_RULE = `CRITICAL RULE: Report your VISUAL ESTIMATE and the PRINTED TEXT SEPARATELY for every line.
DO NOT adjust your visual estimate to match the printed text, and do not suppress disagreements.
A disagreement between visual geometry and printed text is a meaningful diagnostic finding.`;

// ── Phase 1B Prompt: Detailed line geometry ───────────────────────────────────

const GEOMETRY_PROMPT = (subdivName: string) => `You are a professional land surveyor performing GEOMETRIC ANALYSIS of a subdivision plat.

Your job is to analyze the VISUAL GEOMETRY — the angles, lengths, and topology of lines — NOT just read text. Think of yourself as measuring the drawing with a protractor and ruler.

CONTEXT: This is ${subdivName} in Bell County, Texas.

For EVERY boundary line visible in the drawing, provide:

1. LINE IDENTIFICATION: Which two features does this line separate?
2. VISUAL BEARING ESTIMATE: Using the north arrow, estimate the bearing in N/S ##°##' E/W format. Explain your reasoning.
3. VISUAL LENGTH ESTIMATE: Using the scale bar, estimate the length in feet.
4. LINE TYPE: Straight line or curve? If curve, which direction and approximate radius?
5. MONUMENTS: What monument symbols are at each end?
6. PRINTED TEXT: Read any bearing/distance text along the line EXACTLY as shown.

${NO_RECONCILE_RULE}

Work systematically around the subdivision boundary first, then interior lot lines.

Also identify: POB location, scale bar, north arrow orientation, setback lines, easement corridors.

Be extremely precise with angle estimates. Account for north arrow rotation.`;

// ── Phase 1C-top Prompt: Upper lots ─────────────────────────────────────────

const TOP_LOTS_PROMPT = `You are a surveyor measuring angles and distances on a plat drawing with a protractor.

This shows the UPPER portion of the subdivision plat. For each line segment:

1. IDENTIFY: "Line between [Feature A] and [Feature B]"
2. MEASURE THE ANGLE: Using north arrow, estimate bearing in N/S ##° E/W format. Show your work.
3. ESTIMATE LENGTH: Using scale, estimate in feet (round to nearest 10)
4. CURVE OR STRAIGHT: If curve, describe direction and approximate radius
5. ENDPOINT MONUMENTS: Survey markers at each end
6. TEXT NEAR LINE: Exact bearing/distance text printed along the line

${NO_RECONCILE_RULE}
A bearing that looks like ~N 40° E but has text reading N 85° E is a meaningful finding, not an error.
Work systematically from the most clearly visible lines to the harder ones.`;

// ── Phase 1C-bot Prompt: Lower lots ──────────────────────────────────────────

const BOT_LOTS_PROMPT = `You are a surveyor measuring angles and distances on a plat drawing with a protractor.

This shows the LOWER portion of the subdivision plat. For each line segment:

1. IDENTIFY: "Line between [Feature A] and [Feature B]"
2. MEASURE THE ANGLE: Using north arrow, estimate bearing. Show reasoning.
3. ESTIMATE LENGTH: Using scale, estimate in feet
4. CURVE OR STRAIGHT: If curve, describe direction and approximate radius
5. ENDPOINT MONUMENTS: Survey markers at each end
6. TEXT NEAR LINE: Exact bearing/distance text printed along the line

${NO_RECONCILE_RULE}
A watermark-obscured digit produces a different type of uncertainty than a clearly-printed value
that contradicts the geometry — both are meaningful and neither should be silently reconciled.

Pay special attention to road curves, reserve boundaries, and road frontage.`;

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Call Claude Vision with a base64 image and text prompt, return raw text.
 *
 * Retries up to 3 times with exponential back-off on transient errors (5xx,
 * overloaded).  Uses the `logger.attempt()` tracker pattern so every call
 * appears as a structured entry in the pipeline log stream.
 *
 * Token usage (input_tokens + output_tokens) is logged when available.
 */
async function callClaudeVision(
  client: Anthropic,
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg',
  prompt: string,
  logger: PipelineLogger,
  stepLabel: string,
  maxTokens = 8000,
): Promise<string> {
  const tracker = logger.attempt(
    'GeoReconcile',
    'claude-vision',
    stepLabel,
    `${Math.round(imageBase64.length / 1024)}KB ${mediaType}`,
  );

  const MAX_ATTEMPTS = 4;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const delayMs = 2000 * Math.pow(2, attempt - 1);
      tracker.step(`Retry ${attempt}/${MAX_ATTEMPTS - 1} — waiting ${delayMs}ms`);
      await new Promise(r => setTimeout(r, delayMs));
    }

    const attemptStart = Date.now();
    try {
      const response = await client.messages.create({
        model: process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        temperature: 0,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: prompt },
          ],
        }],
      });

      const text = response.content.map(c => c.type === 'text' ? c.text : '').join('\n');
      const elapsed = ((Date.now() - attemptStart) / 1000).toFixed(1);
      const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
      const tokenInfo = usage
        ? ` | in=${usage.input_tokens ?? '?'} out=${usage.output_tokens ?? '?'} tokens`
        : '';
      const lines = text.split('\n').length;
      tracker.success(lines, `${elapsed}s, ${lines} lines, ${text.length} chars${tokenInfo}`);
      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      tracker.step(`Attempt ${attempt + 1} failed (${((Date.now() - attemptStart) / 1000).toFixed(1)}s): ${msg}`);

      // Non-retriable errors: bad request, auth, forbidden
      if (typeof (err as { status?: number }).status === 'number') {
        const s = (err as { status: number }).status;
        if (s === 400 || s === 401 || s === 403) {
          tracker.fail(`Non-retriable error (HTTP ${s}): ${msg}`);
          throw err;
        }
      }

      // On the final attempt throw unconditionally — no fallback after the loop
      if (attempt >= MAX_ATTEMPTS - 1) {
        tracker.fail(`All ${MAX_ATTEMPTS} attempts exhausted: ${msg}`);
        throw err;
      }
      // Otherwise continue to next iteration
    }
  }

  // TypeScript requires a return/throw after the loop even though the final-attempt
  // branch always throws above.  This line is never reached at runtime.
  throw new Error(`${stepLabel}: retry loop exited without result`);
}

/**
 * Resize a base64-encoded PNG to fit within API_MAX_PX on the longest dimension.
 * Uses sharp if available; returns the original if already within limits or sharp unavailable.
 */
async function resizeIfNeeded(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg',
  logger: PipelineLogger,
): Promise<{ base64: string; mediaType: 'image/png' | 'image/jpeg'; resized: boolean }> {
  let sharpLib: typeof import('sharp') | null = null;
  try { sharpLib = (await import('sharp')).default; } catch { /* sharp unavailable */ }
  if (!sharpLib) return { base64: imageBase64, mediaType, resized: false };

  const buf = Buffer.from(imageBase64, 'base64');
  const meta = await sharpLib(buf).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const maxDim = Math.max(w, h);

  if (maxDim <= API_MAX_PX) return { base64: imageBase64, mediaType, resized: false };

  const scale = API_MAX_PX / maxDim;
  const nw = Math.round(w * scale);
  const nh = Math.round(h * scale);
  logger.info('GeoReconcile', `  resizeIfNeeded: ${w}×${h} → ${nw}×${nh} (scale ${scale.toFixed(3)})`);

  const resizedBuf = await sharpLib(buf).resize(nw, nh).png().toBuffer();
  return { base64: resizedBuf.toString('base64'), mediaType: 'image/png', resized: true };
}

/**
 * Crop a region from a base64-encoded image using sharp.
 * Returns null if sharp is unavailable.
 */
async function cropRegion(
  imageBase64: string,
  region: { left: number; top: number; width: number; height: number },
  logger: PipelineLogger,
  label: string,
): Promise<string | null> {
  let sharpLib: typeof import('sharp') | null = null;
  try { sharpLib = (await import('sharp')).default; } catch { return null; }

  const buf = Buffer.from(imageBase64, 'base64');
  const cropped = await sharpLib(buf)
    .extract(region)
    .png()
    .toBuffer();

  logger.info('GeoReconcile',
    `  crop [${label}]: (${region.left},${region.top}) ${region.width}×${region.height}px → ${(cropped.length / 1024).toFixed(1)}KB`);
  return cropped.toString('base64');
}

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

  tracker.step('Sending plat image to Claude Vision for geometric analysis...');

  try {
    const client = new Anthropic({ apiKey: anthropicApiKey });
    const response = await client.messages.create({
      model: process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 8192,
      temperature: 0,
      system: VISUAL_GEOMETRY_SYSTEM,
      messages: [{
        role: 'user',
        content: [{
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: imageBase64 },
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

// ── Phase 1 multi-crop: four targeted sub-analyses ────────────────────────────

/**
 * Phase 1 multi-crop analysis (from geo-reconcile.js):
 *   1A — Full overview: north arrow, scale, overall layout
 *   1B — Survey data area crop (right 70% × top 55%): detailed line geometry
 *   1C-top — Upper lots crop (right 65% × top 32%): individual lot boundaries
 *   1C-bot — Lower lots crop (right 70% × rows 25-57%): road curves and reserves
 *
 * Falls back gracefully if sharp is unavailable (returns null crops for 1B/1C).
 *
 * @param imageBase64  Base64-encoded plat image
 * @param mediaType    Image MIME type
 * @param subdivName   Subdivision name for contextual prompts
 * @param anthropicApiKey  Anthropic API key
 * @param logger       Pipeline logger
 * @param label        Human-readable label for log messages
 */
export async function analyzeVisualGeometryMultiCrop(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg',
  subdivName: string,
  anthropicApiKey: string,
  logger: PipelineLogger,
  label = 'plat',
): Promise<MultiCropAnalysis> {
  logger.info('GeoReconcile', '═══ Phase 1: Multi-Crop Geometric Analysis ═══');
  logger.info('GeoReconcile', `  Label: ${label}  Subdivision: ${subdivName}`);

  const client = new Anthropic({ apiKey: anthropicApiKey });
  let apiCallCount = 0;

  // ── Determine image dimensions for crop calculations ─────────────────────
  let imgWidth = 0;
  let imgHeight = 0;
  let sharpLib: typeof import('sharp') | null = null;
  try {
    sharpLib = (await import('sharp')).default;
    const buf = Buffer.from(imageBase64, 'base64');
    const meta = await sharpLib(buf).metadata();
    imgWidth  = meta.width  ?? 0;
    imgHeight = meta.height ?? 0;
    logger.info('GeoReconcile', `  Image dimensions: ${imgWidth}×${imgHeight}px`);
  } catch {
    logger.warn('GeoReconcile', '  sharp unavailable — will use full image for all sub-analyses');
  }

  // ── Phase 1A: Full overview (resize if needed) ────────────────────────────
  logger.info('GeoReconcile', '--- 1A: Overview analysis (north arrow, scale, layout) ---');
  const { base64: overviewB64, mediaType: overviewMt } =
    await resizeIfNeeded(imageBase64, mediaType, logger);

  const overviewText = await callClaudeVision(
    client, overviewB64, overviewMt, OVERVIEW_PROMPT, logger, '1A-overview',
  );
  apiCallCount++;
  logger.info('GeoReconcile', `  Phase 1A complete — ${overviewText.split('\n').length} lines`);

  // ── Phase 1B: Survey data area (right 70% × top 55%) ─────────────────────
  logger.info('GeoReconcile', '--- 1B: Detailed line geometry (survey data area) ---');
  let geometryText = '';
  if (sharpLib && imgWidth > 0 && imgHeight > 0) {
    const saX = Math.round(imgWidth  * 0.30);
    const saY = 0;
    const saW = imgWidth - saX;
    const saH = Math.round(imgHeight * 0.55);
    const saCropped = await cropRegion(imageBase64, { left: saX, top: saY, width: saW, height: saH }, logger, '1B-survey-area');
    if (saCropped) {
      const { base64: saB64, mediaType: saMt } = await resizeIfNeeded(saCropped, 'image/png', logger);
      geometryText = await callClaudeVision(
        client, saB64, saMt, GEOMETRY_PROMPT(subdivName), logger, '1B-geometry',
      );
      apiCallCount++;
      logger.info('GeoReconcile', `  Phase 1B complete — ${geometryText.split('\n').length} lines`);
    } else {
      logger.warn('GeoReconcile', '  Phase 1B skipped: crop failed');
    }
  } else {
    // Fallback: use full image
    logger.info('GeoReconcile', '  Phase 1B: using full image (no sharp / no dims)');
    geometryText = await callClaudeVision(
      client, overviewB64, overviewMt, GEOMETRY_PROMPT(subdivName), logger, '1B-geometry-full',
    );
    apiCallCount++;
    logger.info('GeoReconcile', `  Phase 1B complete — ${geometryText.split('\n').length} lines`);
  }

  // ── Phase 1C-top: Upper lots (right 65% × top 32%) ───────────────────────
  logger.info('GeoReconcile', '--- 1C-top: Individual lot boundary analysis (upper) ---');
  let topLotsText = '';
  if (sharpLib && imgWidth > 0 && imgHeight > 0) {
    const topX = Math.round(imgWidth  * 0.35);
    const topY = 0;
    const topW = Math.round(imgWidth  * 0.65);
    const topH = Math.round(imgHeight * 0.32);
    const topCropped = await cropRegion(imageBase64, { left: topX, top: topY, width: topW, height: topH }, logger, '1C-top-lots');
    if (topCropped) {
      const { base64: topB64, mediaType: topMt } = await resizeIfNeeded(topCropped, 'image/png', logger);
      topLotsText = await callClaudeVision(
        client, topB64, topMt, TOP_LOTS_PROMPT, logger, '1C-top-lots',
      );
      apiCallCount++;
      logger.info('GeoReconcile', `  Phase 1C-top complete — ${topLotsText.split('\n').length} lines`);
    } else {
      logger.warn('GeoReconcile', '  Phase 1C-top skipped: crop failed');
    }
  } else {
    logger.info('GeoReconcile', '  Phase 1C-top skipped (no sharp)');
  }

  // ── Phase 1C-bot: Lower lots (right 70% × rows 25-57%) ───────────────────
  logger.info('GeoReconcile', '--- 1C-bot: Individual lot boundary analysis (lower) ---');
  let botLotsText = '';
  if (sharpLib && imgWidth > 0 && imgHeight > 0) {
    const botX = Math.round(imgWidth  * 0.30);
    const botY = Math.round(imgHeight * 0.25);
    const botW = Math.round(imgWidth  * 0.70);
    const botH = Math.round(imgHeight * 0.32);
    const botCropped = await cropRegion(imageBase64, { left: botX, top: botY, width: botW, height: botH }, logger, '1C-bot-lots');
    if (botCropped) {
      const { base64: botB64, mediaType: botMt } = await resizeIfNeeded(botCropped, 'image/png', logger);
      botLotsText = await callClaudeVision(
        client, botB64, botMt, BOT_LOTS_PROMPT, logger, '1C-bot-lots',
      );
      apiCallCount++;
      logger.info('GeoReconcile', `  Phase 1C-bot complete — ${botLotsText.split('\n').length} lines`);
    } else {
      logger.warn('GeoReconcile', '  Phase 1C-bot skipped: crop failed');
    }
  } else {
    logger.info('GeoReconcile', '  Phase 1C-bot skipped (no sharp)');
  }

  logger.info('GeoReconcile',
    `═══ Phase 1 multi-crop complete: ${apiCallCount} API calls ═══`);

  return {
    overviewText,
    geometryText,
    topLotsText,
    botLotsText,
    apiCallCount,
  };
}

// ── Phase 3A: Boundary map reconciliation ─────────────────────────────────────

/**
 * Phase 3A: Call Claude to build a structured boundary map by cross-referencing
 * Phase 1 multi-crop geometry with Phase 2 text extraction and (optionally)
 * deed metes-and-bounds data.
 *
 * Returns a narrative report containing:
 * - B1/B2... perimeter lines and I1/I2... interior lines
 * - Per-line reconciled bearing, distance, type, monuments, confidence
 * - [ESTIMATED] / [DEDUCED] / [VERIFY] / [MISSING] confidence tags
 * - Watermark damage resolution using geometric estimates
 * - Discrepancy report
 *
 * @param multiCrop  Phase 1 multi-crop results
 * @param textData   Phase 2 OCR text extraction (may be empty)
 * @param subdivName Subdivision name
 * @param anthropicApiKey  Anthropic API key
 * @param logger     Pipeline logger
 * @param deedData   Optional deed metes-and-bounds text (3rd source from
 *                   geo-reconcile.js ref — provides legal baseline for perimeter)
 */
export async function buildBoundaryMap(
  multiCrop: MultiCropAnalysis,
  textData: string,
  subdivName: string,
  anthropicApiKey: string,
  logger: PipelineLogger,
  deedData?: string,
): Promise<string> {
  logger.info('GeoReconcile', '--- 3A: Building lot boundary map ---');
  if (deedData) {
    logger.info('GeoReconcile', `  3A: Deed data provided (${deedData.length} chars, ${deedData.split('\n').length} lines) — using as 3rd source`);
  }

  const geoSections = [
    multiCrop.overviewText && `=== PHASE 1A: OVERVIEW ===\n${multiCrop.overviewText}`,
    multiCrop.geometryText && `=== PHASE 1B: DETAILED LINE GEOMETRY ===\n${multiCrop.geometryText}`,
    multiCrop.topLotsText  && `=== PHASE 1C-TOP: UPPER LOTS ===\n${multiCrop.topLotsText}`,
    multiCrop.botLotsText  && `=== PHASE 1C-BOT: LOWER LOTS ===\n${multiCrop.botLotsText}`,
  ].filter(Boolean).join('\n\n---\n\n');

  const client = new Anthropic({ apiKey: anthropicApiKey });

  const inputKb  = Math.round(geoSections.length / 1024);
  const textKb   = Math.round(textData.length / 1024);
  const deedKb   = deedData ? Math.round(deedData.length / 1024) : 0;
  const sourceCount = deedData ? 'THREE' : 'TWO';

  logger.info('GeoReconcile',
    `  3A: ${inputKb}KB geo + ${textKb}KB text${deedData ? ` + ${deedKb}KB deed` : ''} → Claude (max 16K tokens)`);

  // Build the deed section for the prompt when deed data is available.
  // The deed provides the legal perimeter baseline (typically an older survey),
  // which can differ from the plat due to re-survey adjustments or datum changes.
  const deedSection = deedData
    ? `\nSOURCE 3 — DEED DATA (legal parent-tract metes and bounds):\n` +
      `NOTE: Deed bearings may use an older datum / epoch (e.g. 1971) while plat uses NAD83. ` +
      `Systematic bearing rotation between sources is expected and is NOT a discrepancy.\n` +
      deedData
    : '';

  const promptContent = `You are a professional land surveyor performing a GEOMETRIC RECONCILIATION.

You have ${sourceCount} independent data sources:

SOURCE 1 — GEOMETRIC ANALYSIS (visual analysis of the drawing):
${geoSections || '(no geometric analysis available)'}

SOURCE 2 — TEXT EXTRACTION (OCR of numbers/text from zoomed scans):
${textData || '(no text extraction available)'}
${deedSection}
YOUR TASK: Create a COMPLETE LOT BOUNDARY MAP for ${subdivName}.

CRITICAL RULE: Report EACH source separately for every line.
DO NOT silently reconcile disagreements. A disagreement between sources
is a meaningful diagnostic finding — flag it, do not resolve it silently.

STEP 1: LIST ALL BOUNDARY LINES
Go around the entire subdivision perimeter first, then interior lot lines.
Assign IDs: B1, B2... for boundary, I1, I2... for interior.

STEP 2: FOR EACH LINE, RECONCILE:
- Feature A / Feature B (what it separates)
- Text-extracted bearing vs geometry-estimated bearing${deedData ? ' vs deed bearing' : ''}
- Text-extracted distance vs geometry-estimated distance${deedData ? ' vs deed distance' : ''}
- Line type (straight/curve)
- Monuments at endpoints
- RECONCILED bearing and distance (best determination)
- Confidence (HIGH/MEDIUM/LOW)
- Notes on discrepancies

STEP 3: RESOLVE WATERMARK DAMAGE
Where OCR shows [?] or conflicting readings, use geometric estimate to determine correct reading.
Mark as [DEDUCED FROM GEOMETRY] with explanation of how the value was determined.

STEP 4: PAIR LINE TABLE and CURVE TABLE entries to specific boundary lines.

STEP 5: VERIFY LOT CLOSURES — do bearings/distances form closed figures?

STEP 6: DISCREPANCY REPORT — every conflict between sources.
For each discrepancy: describe what each source says, explain why they might disagree
(re-survey, typo, OCR error, datum rotation, real problem), and recommend next action.

Tags:
- [ESTIMATED] = derived from geometric analysis only (no readable text)
- [DEDUCED FROM GEOMETRY] = watermark-obscured value resolved using geometric context
- [VERIFY] = conflicting readings between sources that cannot be resolved
- [MISSING] = data not available from any source

Format as a structured report for surveyor review.`;

  // Retry up to 3 times with exponential back-off
  const tracker = logger.attempt('GeoReconcile', 'claude-text', '3A-boundary-map', `${subdivName} (${sourceCount} sources)`);
  const MAX_ATTEMPTS = 4;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const delayMs = 2000 * Math.pow(2, attempt - 1);
      tracker.step(`Retry ${attempt}/${MAX_ATTEMPTS - 1} — waiting ${delayMs}ms`);
      await new Promise(r => setTimeout(r, delayMs));
    }

    const attemptStart = Date.now();
    try {
      const response = await client.messages.create({
        model: process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-6',
        max_tokens: 16000,
        temperature: 0,
        messages: [{ role: 'user', content: promptContent }],
      });

      const mapText = response.content.map(c => c.type === 'text' ? c.text : '').join('\n');
      const elapsed = ((Date.now() - attemptStart) / 1000).toFixed(1);
      const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
      const tokenInfo = usage
        ? ` | in=${usage.input_tokens ?? '?'} out=${usage.output_tokens ?? '?'} tokens`
        : '';
      const lines = mapText.split('\n').length;
      tracker.success(lines, `${elapsed}s, ${lines} lines, ${mapText.length} chars${tokenInfo}`);
      return mapText;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      tracker.step(`Attempt ${attempt + 1} failed (${((Date.now() - attemptStart) / 1000).toFixed(1)}s): ${msg}`);

      if (typeof (err as { status?: number }).status === 'number') {
        const s = (err as { status: number }).status;
        if (s === 400 || s === 401 || s === 403) {
          tracker.fail(`Non-retriable error (HTTP ${s}): ${msg}`);
          throw err;
        }
      }

      // On the final attempt throw unconditionally — no fallback after the loop
      if (attempt >= MAX_ATTEMPTS - 1) {
        tracker.fail(`All ${MAX_ATTEMPTS} attempts exhausted: ${msg}`);
        throw err;
      }
      // Otherwise continue to next iteration
    }
  }

  // TypeScript requires a return/throw after the loop even though the final-attempt
  // branch always throws above.  This line is never reached at runtime.
  throw new Error('3A-boundary-map: retry loop exited without result');
}

// ── Confidence summary ────────────────────────────────────────────────────────

/**
 * Count confidence tags in Phase 3A boundary map text.
 * Matches [ESTIMATED], [DEDUCED...], [VERIFY], [MISSING], HIGH, MEDIUM, LOW (case-insensitive).
 *
 * [DEDUCED] is counted separately from [ESTIMATED] (from geo-reconcile.js reference):
 * - [ESTIMATED] = geometry-only value with no readable text source
 * - [DEDUCED]   = value resolved from context clues (geometry, adjacent, deed)
 */
export function extractConfidenceSummary(text: string): ConfidenceSummary {
  return {
    high:      (text.match(/\bHIGH\b/gi)         || []).length,
    medium:    (text.match(/\bMEDIUM\b/gi)        || []).length,
    low:       (text.match(/\bLOW\b/gi)           || []).length,
    estimated: (text.match(/\[ESTIMATED\]/gi)      || []).length,
    deduced:   (text.match(/\[DEDUCED/gi)          || []).length,
    verify:    (text.match(/\[VERIFY\]/gi)         || []).length,
    missing:   (text.match(/\[MISSING\]/gi)        || []).length,
  };
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
): Omit<ReconciliationResult, 'multiCropAnalysis' | 'boundaryMap' | 'confidenceSummary'> {
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
 * Convenience function: run Phase 1 (multi-crop), Phase 3 cross-reference, and
 * optionally Phase 3A boundary map when the plat image is available.
 *
 * Returns null for phase1Visual if the image is not provided or Phase 1 fails.
 * Returns null for multiCropAnalysis if sharp is unavailable.
 * Returns null for boundaryMap if multiCropAnalysis is null.
 *
 * @param deedData  Optional deed metes-and-bounds text passed through to Phase 3A
 *                  as a third independent source (from geo-reconcile.js reference).
 */
export async function runGeoReconcile(
  textExtraction: ExtractedBoundaryData | null,
  platImageBase64: string | null,
  platImageMediaType: 'image/png' | 'image/jpeg' | null,
  anthropicApiKey: string,
  logger: PipelineLogger,
  label = 'plat',
  subdivName?: string,
  deedData?: string,
): Promise<ReconciliationResult> {
  logger.info('GeoReconcile', '╔══════════════════════════════════════════════════════╗');
  logger.info('GeoReconcile', '║  GEOMETRIC RECONCILIATION ENGINE                    ║');
  logger.info('GeoReconcile', '║  Phase 1: Multi-crop visual analysis                ║');
  logger.info('GeoReconcile', '║  Phase 3: Cross-reference reconciliation            ║');
  logger.info('GeoReconcile', '╚══════════════════════════════════════════════════════╝');
  logger.info('GeoReconcile', `  Label: ${label}  Subdivision: ${subdivName ?? '(unnamed)'}`);

  // Log text extraction details with both char and line counts (from geo-reconcile.js ref)
  if (textExtraction) {
    const textRaw = textExtraction.calls.map((c: BoundaryCall) =>
      `Call ${c.sequence}: bearing=${c.bearing?.raw ?? 'N/A'} dist=${c.distance?.value ?? 'N/A'}ft ${c.along ?? c.toPoint ?? ''}`
    ).join('\n');
    logger.info('GeoReconcile',
      `  Text extraction: ${textExtraction.calls.length} calls, ` +
      `${textRaw.length} chars (${textRaw.split('\n').length} lines)`);
  } else {
    logger.info('GeoReconcile', '  Text extraction: none');
  }

  if (deedData) {
    logger.info('GeoReconcile',
      `  Deed data: ${deedData.length} chars (${deedData.split('\n').length} lines)`);
  }

  logger.info('GeoReconcile', `  Plat image: ${platImageBase64 ? `${Math.round(platImageBase64.length / 1024)}KB base64` : 'none'}`);

  const startMs = Date.now();

  let visual: VisualGeometryAnalysis | null = null;
  let multiCropAnalysis: MultiCropAnalysis | null = null;

  if (platImageBase64 && platImageMediaType) {
    // Phase 1 — multi-crop visual analysis (all 4 sub-analyses)
    logger.info('GeoReconcile', '═══ PHASE 1: Visual Geometry Analysis ═══');
    try {
      multiCropAnalysis = await analyzeVisualGeometryMultiCrop(
        platImageBase64, platImageMediaType,
        subdivName ?? label,
        anthropicApiKey, logger, label,
      );
    } catch (err) {
      logger.warn('GeoReconcile', `Phase 1 multi-crop failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    }

    // Also run the structured JSON-format analysis for Phase 3 data alignment
    logger.info('GeoReconcile', '═══ PHASE 1 (structured): Visual Geometry JSON ═══');
    try {
      visual = await analyzeVisualGeometry(
        platImageBase64, platImageMediaType,
        anthropicApiKey, logger, label,
      );
      if (visual) {
        logger.info('GeoReconcile',
          `  Structured analysis: ${visual.visualMeasurements.length} measurements, ` +
          `${visual.conflicts.length} conflicts, quality=${visual.drawingQuality}`);
      }
    } catch (err) {
      logger.warn('GeoReconcile', `Phase 1 structured analysis failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    logger.info('GeoReconcile', 'No plat image provided — skipping Phase 1 visual analysis');
  }

  // Phase 3 — cross-reference reconciliation (pure logic, no API calls)
  logger.info('GeoReconcile', '═══ PHASE 3: Cross-Reference Reconciliation ═══');
  const phase3 = reconcileGeometry(visual, textExtraction, logger);

  // Phase 3A — boundary map (Claude API call combining geo + text + optional deed)
  let boundaryMap: string | null = null;
  let confidenceSummary: ConfidenceSummary | null = null;

  if (multiCropAnalysis && anthropicApiKey) {
    logger.info('GeoReconcile', '═══ PHASE 3A: Boundary Map Reconciliation ═══');
    try {
      // Build text data string for Phase 3A from text extraction
      const textData = textExtraction
        ? textExtraction.calls.map((c: BoundaryCall) =>
            `Call ${c.sequence}: bearing=${c.bearing?.raw ?? 'N/A'} dist=${c.distance?.value ?? 'N/A'}ft ${c.along ?? c.toPoint ?? ''}`
          ).join('\n')
        : '';

      boundaryMap = await buildBoundaryMap(
        multiCropAnalysis, textData,
        subdivName ?? label,
        anthropicApiKey, logger,
        deedData,
      );

      confidenceSummary = extractConfidenceSummary(boundaryMap);
      logger.info('GeoReconcile',
        `  Confidence summary: HIGH=${confidenceSummary.high} MEDIUM=${confidenceSummary.medium} LOW=${confidenceSummary.low} ` +
        `[ESTIMATED]=${confidenceSummary.estimated} [DEDUCED]=${confidenceSummary.deduced} ` +
        `[VERIFY]=${confidenceSummary.verify} [MISSING]=${confidenceSummary.missing}`);

      // Log high-confidence rate (from geo-reconcile.js reference script)
      const totalRated = confidenceSummary.high + confidenceSummary.medium + confidenceSummary.low;
      if (totalRated > 0) {
        const highRatePct = Math.round((confidenceSummary.high / totalRated) * 100);
        logger.info('GeoReconcile',
          `  High-confidence rate: ${highRatePct}% of ${totalRated} rated calls`);
      }
    } catch (err) {
      logger.warn('GeoReconcile', `Phase 3A boundary map failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    }
  } else if (!multiCropAnalysis) {
    logger.info('GeoReconcile', 'Phase 3A skipped — no multi-crop analysis available');
  }

  const durationSec = ((Date.now() - startMs) / 1000).toFixed(1);
  const totalApiCalls = (multiCropAnalysis?.apiCallCount ?? 0) + (visual ? 1 : 0) + (boundaryMap ? 1 : 0);
  logger.info('GeoReconcile',
    `═══ GeoReconcile complete in ${durationSec}s — ${totalApiCalls} total API calls ═══`);
  logger.info('GeoReconcile',
    `  Agreement: ${phase3.overallAgreementPct}% ` +
    `(${phase3.agreementCount} confirmed, ${phase3.conflictCount} conflicts, ${phase3.textOnlyCount} text-only)`);

  return {
    ...phase3,
    multiCropAnalysis,
    boundaryMap,
    confidenceSummary,
  };
}

