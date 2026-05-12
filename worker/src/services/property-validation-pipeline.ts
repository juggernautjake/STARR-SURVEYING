// worker/src/services/property-validation-pipeline.ts
// Property Validation Pipeline — 7-Call Unified Orchestrator
//
// Implements the pipeline from Starr Software Spec v2.0 §7.
// Called AFTER the core 4-stage pipeline (address → ID → docs → extract → validate)
// to perform the deeper synthesis, cross-validation, and report generation.
//
// Calls 1-4 (image segmentation) are handled by adaptive-vision.ts during
// the extraction stage. This orchestrator handles calls 5-7:
//
//   CALL 5: Text extraction synthesis — combine all OCR passes into clean summary
//   CALL 6: Cross-validation & reconciliation — compare all sources, apply symbols
//   CALL 7: Final report generation — per-lot M&B, discrepancies, recommendations

import Anthropic from '@anthropic-ai/sdk';
import type {
  ExtractedBoundaryData,
  ValidationResult,
  ConfidenceRating,
} from '../types/index.js';
import type { ReconciliationResult, GeometryConflict } from './geo-reconcile.js';
import type { PipelineLogger } from '../lib/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdjacentProperty {
  ownerName: string;
  calledAcreage: string | null;
  recordingReference: string | null;
  direction: string | null;   // "north", "east", etc.
  sharedBoundaryCallSeqs: number[];  // which calls of the target property are shared
}

export interface RoadInfo {
  name: string;
  type: 'state_highway' | 'farm_to_market' | 'county_road' | 'private' | 'unknown';
  txdotClassification: string | null;
  estimatedRowWidth_ft: number | null;
  notes: string | null;
}

export interface EasementInfo {
  type: string;         // "utility", "drainage", "access", etc.
  width_ft: number | null;
  recordingReference: string | null;
  notes: string | null;
}

export interface DocumentPurchaseRecommendation {
  priority: number;
  documentDescription: string;
  source: string;        // "County Clerk", "TexasFile", "TxDOT RPAM"
  estimatedCostLow: number;
  estimatedCostHigh: number;
  expectedConfidenceBoost: string;  // e.g., "64% → 90%+"
  reasoning: string;
}

export interface PerCallConfidence {
  sequence: number;
  bearing: string | null;
  distance: string | null;
  rating: ConfidenceRating;
  sources: string[];
  /** Evidence quality per the 4-level scale from the cross-validation system */
  evidenceStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'CONTRADICTED' | null;
  conflictNote: string | null;
}

/** A single entry in the discrepancy log from CALL 7 */
export interface DiscrepancyLogEntry {
  item: string;
  sourceA: string;
  sourceB: string;
  severity: 'CRITICAL' | 'MODERATE' | 'MINOR';
  actionNeeded: string;
}

/** An action recommended to improve confidence, ordered by priority */
export interface TopAction {
  priority: number;
  action: string;
  expectedBenefit: string;
}

/** Adjacent property research order entry — which deeds to pull first */
export interface AdjacentResearchEntry {
  rank: number;
  ownerName: string;
  recordingRef: string | null;
  rationale: string;
}

export interface ValidationReport {
  // ── Property summary ──────────────────────────────────────────────
  propertyName: string | null;
  recordingReferences: string[];
  acreage: number | null;
  datum: string | null;
  pobDescription: string | null;

  // ── Per-call confidence ───────────────────────────────────────────
  perCallConfidence: PerCallConfidence[];

  // ── Adjacent properties / roads / easements ───────────────────────
  adjacentProperties: AdjacentProperty[];
  roads: RoadInfo[];
  easements: EasementInfo[];

  // ── Discrepancies ─────────────────────────────────────────────────
  discrepancies: Array<{
    callSequence: number | null;
    description: string;
    allReadings: string[];
    recommendation: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    resolvedValue: string | null;
  }>;

  // ── Confidence summary ────────────────────────────────────────────
  confidenceCounts: Record<string, number>;  // { CONFIRMED: 30, DEDUCED: 5, ... }
  overallConfidencePct: number;
  overallRating: ConfidenceRating;

  // ── Recommended actions (from CALL 7 Stage 6 structure) ──────────
  purchaseRecommendations: DocumentPurchaseRecommendation[];
  topActions: TopAction[];
  adjacentResearchOrder: AdjacentResearchEntry[];
  discrepancyLog: DiscrepancyLogEntry[];

  // ── Analysis limitations ──────────────────────────────────────────
  /** Limitations detected during analysis that the surveyor should know about */
  analysisLimitations: string[];

  // ── Meta ──────────────────────────────────────────────────────────
  generatedAt: string;
  totalApiCalls: number;
}

// ── Confidence rating helpers ─────────────────────────────────────────────────

const CONFIRMED_RATING:   ConfidenceRating = { symbol: 'CONFIRMED',   display: '✓',  label: 'CONFIRMED',   score: 90 };
const DEDUCED_RATING:     ConfidenceRating = { symbol: 'DEDUCED',     display: '~',  label: 'DEDUCED',     score: 70 };
const UNCONFIRMED_RATING: ConfidenceRating = { symbol: 'UNCONFIRMED', display: '?',  label: 'UNCONFIRMED', score: 50 };
const DISCREPANCY_RATING: ConfidenceRating = { symbol: 'DISCREPANCY', display: '✗',  label: 'DISCREPANCY', score: 25 };
const CRITICAL_RATING:    ConfidenceRating = { symbol: 'CRITICAL',    display: '✗✗', label: 'CRITICAL',    score: 5  };

/**
 * Maximum characters of raw OCR text per document pass sent to Call 5 synthesis.
 * Keeps the synthesis prompt within Anthropic token limits while still providing
 * enough context to detect per-pass disagreements in bearings and distances.
 */
const MAX_OCR_TEXT_CHARS = 4000;

function ratingFromScore(score: number): ConfidenceRating {
  if (score >= 88) return CONFIRMED_RATING;
  if (score >= 65) return DEDUCED_RATING;
  if (score >= 45) return UNCONFIRMED_RATING;
  if (score >= 20) return DISCREPANCY_RATING;
  return CRITICAL_RATING;
}

function ratingFromSymbol(sym: string): ConfidenceRating {
  switch (sym) {
    case 'CONFIRMED':   return CONFIRMED_RATING;
    case 'DEDUCED':     return DEDUCED_RATING;
    case 'UNCONFIRMED': return UNCONFIRMED_RATING;
    case 'DISCREPANCY': return DISCREPANCY_RATING;
    case 'CRITICAL':    return CRITICAL_RATING;
    default:            return UNCONFIRMED_RATING;
  }
}

// ── Claude call helper ────────────────────────────────────────────────────────

async function callClaude(
  client: Anthropic,
  systemPrompt: string,
  userContent: string,
  label: string,
  logger: PipelineLogger,
  maxTokens = 8192,
): Promise<string | null> {
  const tracker = logger.startAttempt({
    layer: 'ValidationPipeline',
    source: 'Claude',
    method: label,
    input: `${userContent.length} chars`,
  });

  for (let attempt = 0; attempt <= 3; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt - 1)));
      tracker.step(`Retry ${attempt}/3`);
    }
    const attemptStart = Date.now();
    try {
      const response = await client.messages.create({
        model: process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      });
      const tb = response.content.find(c => c.type === 'text');
      const text = (tb?.type === 'text' ? tb.text : '') ?? '';
      const elapsed = ((Date.now() - attemptStart) / 1000).toFixed(1);
      const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
      const tokenInfo = usage
        ? ` | in=${usage.input_tokens ?? '?'} out=${usage.output_tokens ?? '?'} tokens`
        : '';
      tracker({ status: 'success', dataPointsFound: 1, details: `${elapsed}s, ${text.length} chars${tokenInfo}` });
      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      tracker.step(`Attempt ${attempt + 1} failed (${((Date.now() - attemptStart) / 1000).toFixed(1)}s): ${msg}`);
      if (typeof (err as { status?: number }).status === 'number') {
        const s = (err as { status: number }).status;
        if (s === 400 || s === 401 || s === 403) break;
      }
    }
  }

  tracker({ status: 'fail', error: 'All attempts exhausted' });
  return null;
}

function safeParseJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(cleaned) as Record<string, unknown>; } catch { /* */ }
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { /* */ } }
  return null;
}

// ── CALL 5: Text synthesis ────────────────────────────────────────────────────

const SYNTHESIS_SYSTEM = `You are an expert Texas RPLS analyzing property research results.

You will receive all extracted boundary data and OCR text from multiple analysis passes of a property document. Your job is to synthesize this into a clean, authoritative summary.

RULES:
- Never fabricate data. Only report what the source documents actually say.
- When OCR passes disagree, list ALL readings as candidates — never pick a winner.
- Note the most common reading and any statistical majority.
- Flag [UNCERTAIN] for any value where readings disagree.
- Flag [WATERMARK] when obscured text is a likely cause of disagreement.

Return JSON:
{
  "synthesizedCalls": [
    {
      "sequence": 1,
      "bearingReadings": ["N 45°28'15\\" E"],
      "distanceReadings": ["149.92"],
      "agreedBearing": "N 45°28'15\\" E",
      "agreedDistance": "149.92",
      "uncertainty": null
    }
  ],
  "adjacentProperties": [
    { "ownerName": "R.K. Gaines", "calledAcreage": "4.00 ac", "recordingReference": null, "direction": "north" }
  ],
  "roads": [
    { "name": "FM 436", "type": "farm_to_market", "estimatedRowWidth_ft": 60 }
  ],
  "easements": [
    { "type": "utility", "width_ft": 10, "recordingReference": null }
  ],
  "recordingReferences": ["Cab. A, Slide 123", "Vol. 123, Pg. 456"]
}`;

// ── CALL 6: Cross-validation ──────────────────────────────────────────────────

const CROSS_VALIDATION_SYSTEM = `You are an expert Texas RPLS performing cross-validation of boundary survey data.

You will receive:
1. Synthesized OCR extractions from the target plat
2. Geometric reconciliation results (visual angle/distance estimates vs text labels)
3. Validation results (traverse closure, area checks)

Apply the 5-symbol confidence system to EVERY boundary call:
  ✓ CONFIRMED  — Multiple independent sources agree within tolerance
  ~ DEDUCED    — Single source, reasonable confidence, no conflicts
  ? UNCONFIRMED — Single OCR pass, no geometric validation
  ✗ DISCREPANCY — Sources actively disagree (must list all readings)
  ✗✗ CRITICAL  — Major conflict or impossible geometry

For each piece of evidence, rate it:
  STRONG      — Clearly visible, high-resolution scan, no watermark damage
  MODERATE    — Readable but some uncertainty (small text, slight watermark)
  WEAK        — Heavily obscured, estimated, or single-source only
  CONTRADICTED — Another source actively disagrees

EVIDENCE TYPES TO CONSIDER:
1. DEED EVIDENCE: What the parent deed says about each boundary call
   - Note: deed bearings may use a different epoch or datum (e.g., 1971 vs current NAD83)
     which will cause a small systematic rotation in all bearings — this is NORMAL and
     must not be flagged as a discrepancy unless the rotation is inconsistent
2. PLAT TEXT EVIDENCE: What the OCR extracted — watermark damage vs clear text
3. GEOMETRIC EVIDENCE: Visual protractor/ruler estimates from the drawing
   - A line that LOOKS like N 30° E but READS N 85° E is a real discrepancy, not an OCR error
4. ADJACENT PROPERTY EVIDENCE: The neighbor's deed/plat should describe the SAME shared
   boundary from their side — N 30° E in our deed should be S 30° W in the neighbor's deed
5. ROAD EVIDENCE: Public roads have TxDOT ROW plans that provide independent geometry;
   plat road bearings should be consistent with known road alignments

CARDINAL RULE: NEVER force reconciliation. When sources disagree, present ALL readings,
explain the conflict (datum difference? re-survey? OCR error? real discrepancy?),
and recommend specifically how to resolve it (pull adjacent deed instrument #, request
unwatermarked plat, field-check corner, etc.).

Return JSON:
{
  "perCallConfidence": [
    {
      "sequence": 1,
      "bearing": "N 45°28'15\\" E",
      "distance": "149.92",
      "symbol": "CONFIRMED",
      "sources": ["OCR pass 1", "OCR pass 2", "visual geometry"],
      "evidenceStrength": "STRONG",
      "conflictNote": null
    }
  ],
  "discrepancies": [
    {
      "callSequence": 4,
      "description": "L4 bearing conflict — three OCR readings disagree",
      "allReadings": ["N86°31'22\\"W", "N36°31'22\\"W", "N56°31'22\\"W"],
      "severity": "critical",
      "resolvedValue": null,
      "recommendation": "Geometric analysis needed; purchase unwatermarked plat to verify."
    }
  ],
  "overallConfidencePct": 64,
  "purchaseRecommendations": [
    {
      "priority": 1,
      "documentDescription": "Unwatermarked plat (instrument 2023032044)",
      "source": "County Clerk or TexasFile",
      "estimatedCostLow": 1,
      "estimatedCostHigh": 5,
      "expectedConfidenceBoost": "64% → 90%+",
      "reasoning": "Resolves all watermark-related OCR conflicts"
    }
  ]
}`;

// ── CALL 7: Report generation ─────────────────────────────────────────────────

const REPORT_SYSTEM = `You are an expert Texas RPLS generating a final property validation report.

CRITICAL RULES:
1. NEVER fabricate data. If a value is absent, write [MISSING].
2. NEVER force reconciliation. If sources disagree and you cannot determine why, write [DISCREPANCY].
3. If watermark damage obscured a digit but context makes the answer clear, mark as [DEDUCED] and explain.
4. If a clearly visible number contradicts geometry or an adjacent property, mark as [CRITICAL DISCREPANCY].
5. For values with only one source and no contradiction, mark as [UNCONFIRMED].

You will receive analysis results. Produce a comprehensive validation summary that covers:

1. DISCREPANCY RESOLUTION — For any unresolved discrepancies in the data, state what each
   source says, why they may disagree (datum shift, re-survey, OCR error, typo, real problem),
   and specifically what action would resolve it (pull instrument #X, field-check corner, etc.)

2. LOT-BY-LOT METES AND BOUNDS — For each lot, list:
   a) Starting point and monument
   b) Each call: bearing, distance, along what feature, monument at end
   c) Curve data where applicable
   d) Confidence tag on EVERY value (✓ ~ ? ✗ ✗✗)
   e) For DEDUCED: explain what was obscured and how you determined the value
   f) For DISCREPANCY: list what each source says and recommend next step

3. PERIMETER COMPARISON — Deed vs plat vs geometry for each perimeter segment in a table
   with a Status column using the confidence symbols

4. ADJACENT PROPERTY RECOMMENDATIONS — For each adjacent property:
   - What boundary they share
   - Their called acreage and recording reference
   - Whether pulling their deed would help validate a specific boundary
   - Priority: HIGH (would resolve a discrepancy), MEDIUM (confirms uncertain data), LOW (already confident)

5. COMPREHENSIVE DISCREPANCY LOG — Every conflict ordered by severity:
   | # | Item | Source A | Source B | Severity | Action Needed |
   Severity: CRITICAL (affects boundaries), MODERATE (affects precision), MINOR (cosmetic)

6. OVERALL ASSESSMENT — Total calls attempted, breakdown ✓/~/✗/✗✗, and whether data is
   sufficient for: preliminary boundary mapping, due diligence review, legal reliance

7. TOP ACTIONS — Top 3 specific actions to improve confidence
   (e.g., "Pull deed Inst# 2010034131", "Field-verify NE corner monument")

8. ADJACENT RESEARCH ORDER — Rank which adjacent property records to pull first, based on
   which shared boundaries have lowest confidence and which records are most likely to
   resolve open discrepancies

Return JSON:
{
  "propertyName": "...",
  "overallSummary": "One paragraph summary of findings",
  "keyFindings": ["Finding 1", "Finding 2"],
  "criticalIssues": ["Issue requiring immediate attention"],
  "fieldNotes": ["Note for field crew"],
  "topActions": [
    { "priority": 1, "action": "Pull deed Inst# ...", "expectedBenefit": "Resolves L4 bearing conflict" }
  ],
  "adjacentResearchOrder": [
    { "rank": 1, "ownerName": "...", "recordingRef": "...", "rationale": "..." }
  ],
  "discrepancyLog": [
    { "item": "L4 bearing", "sourceA": "N86°31'22\\"W", "sourceB": "N56°31'22\\"W",
      "severity": "CRITICAL", "actionNeeded": "Purchase unwatermarked plat" }
  ]
}`;

// ── Main orchestrator ─────────────────────────────────────────────────────────

/**
 * Run the full property validation pipeline (calls 5-7) after the core
 * extraction pipeline has completed.
 *
 * @param boundary   Extracted boundary data from Stage 3
 * @param validation  Validation result from Stage 4
 * @param reconciliation  Geo-reconcile result from Stage 3.5 (may be null)
 * @param propertyMeta  Property metadata (name, acreage, references)
 * @param anthropicApiKey  Anthropic API key
 * @param logger  Pipeline logger
 * @param rawOcrTexts  (optional) Raw OCR text from each document — used by Call 5
 *                     synthesis to see the unstructured extraction output alongside
 *                     the structured boundary calls, improving cross-pass agreement.
 */
export async function runPropertyValidationPipeline(
  boundary: ExtractedBoundaryData | null,
  validation: ValidationResult | null,
  reconciliation: ReconciliationResult | null,
  propertyMeta: {
    ownerName: string | null;
    acreage: number | null;
    legalDescription: string | null;
    county: string;
  },
  anthropicApiKey: string,
  logger: PipelineLogger,
  rawOcrTexts?: string[],
): Promise<ValidationReport> {
  const generatedAt = new Date().toISOString();
  let totalApiCalls = 0;
  const client = new Anthropic({ apiKey: anthropicApiKey });

  // ── Build input summaries ───────────────────────────────────────────────────
  const callSummary = boundary?.calls.map(c => ({
    seq:      c.sequence,
    bearing:  c.bearing?.raw ?? null,
    distance: c.distance ? `${c.distance.value} ${c.distance.unit}` : null,
    curve:    c.curve ? `R=${c.curve.radius.value}ft` : null,
    conf:     c.confidence,
  })) ?? [];

  const validationSummary = validation ? {
    quality:      validation.overallQuality,
    closure_ft:   validation.closureError_ft,
    precision:    validation.precisionRatio,
    area_acres:   validation.computedArea_acres,
    cad_acres:    validation.cadAcreage,
    flags:        validation.flags,
    confidenceRating: validation.confidenceRating,
  } : null;

  const reconcSummary = reconciliation ? {
    agreementPct:    reconciliation.overallAgreementPct,
    conflicts:       reconciliation.bearingConflicts.length,
    phase1Quality:   reconciliation.phase1Visual?.drawingQuality ?? 'n/a',
    bearingConflicts: reconciliation.bearingConflicts.map(bc => ({
      seq:         bc.sequence,
      description: bc.description,
      candidates:  bc.candidates,
    })),
  } : null;

  // ── CALL 5: Text synthesis ──────────────────────────────────────────────────
  const call5Start = Date.now();
  logger.info('ValidationPipeline',
    `Call 5: Text synthesis (${callSummary.length} calls, ${rawOcrTexts?.length ?? 0} OCR pass(es))...`);
  const synthInput = JSON.stringify({
    extractedCalls:     callSummary,
    datum:              boundary?.datum,
    pob:                boundary?.pointOfBeginning?.description,
    area:               boundary?.area,
    references:         boundary?.references,
    legalDescription:   propertyMeta.legalDescription,
    warnings:           boundary?.warnings ?? [],
    // Raw OCR text from each document/page — gives the AI the full unstructured
    // output of the adaptive-vision passes so it can detect per-pass disagreements.
    rawOcrTexts:        rawOcrTexts && rawOcrTexts.length > 0
      ? rawOcrTexts.map((t, i) => ({
          pass: i + 1,
          text: t.length > MAX_OCR_TEXT_CHARS ? t.substring(0, MAX_OCR_TEXT_CHARS) : t,
        }))
      : undefined,
  });

  const synthRaw = await callClaude(client, SYNTHESIS_SYSTEM, synthInput, 'call5-synthesis', logger);
  totalApiCalls++;
  const synthData = synthRaw ? safeParseJson(synthRaw) : null;
  logger.info('ValidationPipeline', `  Call 5 done in ${((Date.now() - call5Start) / 1000).toFixed(1)}s${synthData ? '' : ' [no data]'}`);

  const adjacentProperties: AdjacentProperty[] = Array.isArray(synthData?.adjacentProperties)
    ? (synthData.adjacentProperties as unknown[]).map((ap: unknown) => {
        const o = (ap && typeof ap === 'object' ? ap : {}) as Record<string, unknown>;
        return {
          ownerName:               String(o.ownerName ?? 'Unknown'),
          calledAcreage:           o.calledAcreage   != null ? String(o.calledAcreage)   : null,
          recordingReference:      o.recordingReference != null ? String(o.recordingReference) : null,
          direction:               o.direction        != null ? String(o.direction)        : null,
          sharedBoundaryCallSeqs:  [],
        };
      })
    : [];

  const roads: RoadInfo[] = Array.isArray(synthData?.roads)
    ? (synthData.roads as unknown[]).map((r: unknown) => {
        const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
        const t = String(o.type ?? 'unknown');
        return {
          name:                 String(o.name ?? ''),
          type:                 (['state_highway','farm_to_market','county_road','private','unknown'].includes(t) ? t : 'unknown') as RoadInfo['type'],
          txdotClassification:  o.txdotClassification != null ? String(o.txdotClassification) : null,
          estimatedRowWidth_ft: o.estimatedRowWidth_ft != null ? Number(o.estimatedRowWidth_ft) : null,
          notes:                o.notes != null ? String(o.notes) : null,
        };
      })
    : [];

  const easements: EasementInfo[] = Array.isArray(synthData?.easements)
    ? (synthData.easements as unknown[]).map((e: unknown) => {
        const o = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
        return {
          type:               String(o.type ?? 'unknown'),
          width_ft:           o.width_ft != null ? Number(o.width_ft) : null,
          recordingReference: o.recordingReference != null ? String(o.recordingReference) : null,
          notes:              o.notes != null ? String(o.notes) : null,
        };
      })
    : [];

  const recordingReferences: string[] = Array.isArray(synthData?.recordingReferences)
    ? (synthData.recordingReferences as unknown[]).map(String)
    : (boundary?.references ?? []).map(r =>
        [r.instrumentNumber, r.volume && r.page ? `Vol.${r.volume} Pg.${r.page}` : null].filter(Boolean).join(' / ')
      ).filter(Boolean);

  // Log Call 5 synthesis results for user visibility
  logger.info('ValidationPipeline',
    `  Call 5 result: ${adjacentProperties.length} adjacent props, ${roads.length} roads, ${easements.length} easements, ${recordingReferences.length} recording refs`);
  for (const ap of adjacentProperties) {
    logger.info('ValidationPipeline',
      `    [adjacent] ${ap.ownerName}${ap.calledAcreage ? ` ${ap.calledAcreage}` : ''}${ap.direction ? ` (${ap.direction})` : ''}${ap.recordingReference ? ` — ${ap.recordingReference}` : ''}`);
  }
  for (const road of roads) {
    logger.info('ValidationPipeline',
      `    [road] ${road.name} (${road.type})${road.estimatedRowWidth_ft ? ` ROW=${road.estimatedRowWidth_ft}ft` : ''}`);
  }

  // ── CALL 6: Cross-validation ────────────────────────────────────────────────
  const call6Start = Date.now();
  logger.info('ValidationPipeline',
    `Call 6: Cross-validation & confidence symbol assignment (${callSummary.length} calls, ` +
    `${reconcSummary?.conflicts ?? 0} geo conflicts)...`);
  const crossValInput = JSON.stringify({
    extractedCalls:     callSummary,
    validationResult:   validationSummary,
    reconciliation:     reconcSummary,
    propertyMeta,
  });

  const crossValRaw = await callClaude(client, CROSS_VALIDATION_SYSTEM, crossValInput, 'call6-crossvalidation', logger);
  totalApiCalls++;
  const crossValData = crossValRaw ? safeParseJson(crossValRaw) : null;
  logger.info('ValidationPipeline', `  Call 6 done in ${((Date.now() - call6Start) / 1000).toFixed(1)}s${crossValData ? '' : ' [no data]'}`);

  const perCallConfidence: PerCallConfidence[] = Array.isArray(crossValData?.perCallConfidence)
    ? (crossValData.perCallConfidence as unknown[]).map((pcc: unknown) => {
        const o = (pcc && typeof pcc === 'object' ? pcc : {}) as Record<string, unknown>;
        const es = o.evidenceStrength != null ? String(o.evidenceStrength) : null;
        return {
          sequence:        Number(o.sequence ?? 0),
          bearing:         o.bearing    != null ? String(o.bearing)    : null,
          distance:        o.distance   != null ? String(o.distance)   : null,
          rating:          ratingFromSymbol(String(o.symbol ?? 'UNCONFIRMED')),
          sources:         Array.isArray(o.sources) ? (o.sources as unknown[]).map(String) : [],
          evidenceStrength: (['STRONG','MODERATE','WEAK','CONTRADICTED'].includes(es ?? '')
            ? es : null) as PerCallConfidence['evidenceStrength'],
          conflictNote:    o.conflictNote != null ? String(o.conflictNote) : null,
        };
      })
    // Fallback: build from boundary calls when AI call failed
    : callSummary.map(c => ({
        sequence:        c.seq,
        bearing:         c.bearing,
        distance:        c.distance,
        rating:          ratingFromScore(c.conf * 100),
        sources:         ['text-extraction'],
        evidenceStrength: null,
        conflictNote:    null,
      }));

  // Add geometry-conflict calls that the AI may have missed
  const geomConflictSeqs = new Set(reconciliation?.bearingConflicts.map((bc: GeometryConflict) => bc.sequence) ?? []);
  for (const pcc of perCallConfidence) {
    if (geomConflictSeqs.has(pcc.sequence) && pcc.rating.symbol !== 'CRITICAL') {
      pcc.rating = DISCREPANCY_RATING;
      pcc.conflictNote = reconciliation?.bearingConflicts
        .find((bc: GeometryConflict) => bc.sequence === pcc.sequence)?.description ?? pcc.conflictNote;
    }
  }

  const discrepancies = Array.isArray(crossValData?.discrepancies)
    ? (crossValData.discrepancies as unknown[]).map((d: unknown) => {
        const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
        const sev = String(o.severity ?? 'medium');
        return {
          callSequence:     o.callSequence != null ? Number(o.callSequence) : null,
          description:      String(o.description ?? ''),
          allReadings:      Array.isArray(o.allReadings) ? (o.allReadings as unknown[]).map(String) : [],
          recommendation:   String(o.recommendation ?? ''),
          severity:         (['critical','high','medium','low'].includes(sev) ? sev : 'medium') as 'critical'|'high'|'medium'|'low',
          resolvedValue:    o.resolvedValue != null ? String(o.resolvedValue) : null,
        };
      })
    : [];

  const purchaseRecommendations: DocumentPurchaseRecommendation[] = Array.isArray(crossValData?.purchaseRecommendations)
    ? (crossValData.purchaseRecommendations as unknown[]).map((pr: unknown) => {
        const o = (pr && typeof pr === 'object' ? pr : {}) as Record<string, unknown>;
        return {
          priority:                 Number(o.priority ?? 99),
          documentDescription:     String(o.documentDescription ?? ''),
          source:                   String(o.source ?? 'Unknown'),
          estimatedCostLow:         Number(o.estimatedCostLow ?? 0),
          estimatedCostHigh:        Number(o.estimatedCostHigh ?? 0),
          expectedConfidenceBoost:  String(o.expectedConfidenceBoost ?? 'Unknown'),
          reasoning:                String(o.reasoning ?? ''),
        };
      })
    : [];

  // ── CALL 7: Final report summary ────────────────────────────────────────────
  const call7Start = Date.now();
  const criticalCount = discrepancies.filter(d => d.severity === 'critical').length;
  const highCount = discrepancies.filter(d => d.severity === 'high').length;
  logger.info('ValidationPipeline',
    `Call 7: Final report summary (${discrepancies.length} discrepancies: ${criticalCount} critical, ${highCount} high)...`);
  const reportInput = JSON.stringify({
    propertyMeta,
    discrepancyCount:      discrepancies.length,
    criticalCount,
    highCount,
    perCallSummary:        perCallConfidence.map(p => ({
      seq: p.sequence, symbol: p.rating.symbol, evidenceStrength: p.evidenceStrength,
    })),
    overallConfidencePct:  crossValData?.overallConfidencePct ?? 0,
    allDiscrepancies:      discrepancies,
    adjacentProperties:    adjacentProperties.map(ap => ({
      ownerName:          ap.ownerName,
      calledAcreage:      ap.calledAcreage,
      recordingReference: ap.recordingReference,
      direction:          ap.direction,
    })),
  });

  const reportRaw = await callClaude(client, REPORT_SYSTEM, reportInput, 'call7-report', logger);
  totalApiCalls++;
  const reportData = reportRaw ? safeParseJson(reportRaw) : null;
  logger.info('ValidationPipeline', `  Call 7 done in ${((Date.now() - call7Start) / 1000).toFixed(1)}s${reportData ? '' : ' [no data]'}`);

  // Parse Call 7 structured fields (topActions, adjacentResearchOrder, discrepancyLog)
  const topActions: TopAction[] = Array.isArray(reportData?.topActions)
    ? (reportData.topActions as unknown[]).map((a: unknown) => {
        const o = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
        return {
          priority:        Number(o.priority ?? 99),
          action:          String(o.action ?? ''),
          expectedBenefit: String(o.expectedBenefit ?? ''),
        };
      }).sort((a, b) => a.priority - b.priority)
    : [];

  const adjacentResearchOrder: AdjacentResearchEntry[] = Array.isArray(reportData?.adjacentResearchOrder)
    ? (reportData.adjacentResearchOrder as unknown[]).map((e: unknown) => {
        const o = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
        return {
          rank:         Number(o.rank ?? 99),
          ownerName:    String(o.ownerName ?? ''),
          recordingRef: o.recordingRef != null ? String(o.recordingRef) : null,
          rationale:    String(o.rationale ?? ''),
        };
      }).sort((a, b) => a.rank - b.rank)
    : [];

  const discrepancyLog: DiscrepancyLogEntry[] = Array.isArray(reportData?.discrepancyLog)
    ? (reportData.discrepancyLog as unknown[]).map((d: unknown) => {
        const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
        const sev = String(o.severity ?? 'MODERATE');
        return {
          item:         String(o.item ?? ''),
          sourceA:      String(o.sourceA ?? ''),
          sourceB:      String(o.sourceB ?? ''),
          severity:     (['CRITICAL','MODERATE','MINOR'].includes(sev) ? sev : 'MODERATE') as DiscrepancyLogEntry['severity'],
          actionNeeded: String(o.actionNeeded ?? ''),
        };
      })
    : [];

  // ── Confidence summary ──────────────────────────────────────────────────────
  const confidenceCounts: Record<string, number> = {
    CONFIRMED: 0, DEDUCED: 0, UNCONFIRMED: 0, DISCREPANCY: 0, CRITICAL: 0,
  };
  for (const pcc of perCallConfidence) {
    confidenceCounts[pcc.rating.symbol] = (confidenceCounts[pcc.rating.symbol] ?? 0) + 1;
  }

  const overallConfidencePct = typeof crossValData?.overallConfidencePct === 'number'
    ? Number(crossValData.overallConfidencePct)
    : (perCallConfidence.length > 0
        ? Math.round(perCallConfidence.reduce((s, p) => s + p.rating.score, 0) / perCallConfidence.length)
        : 50);

  const overallRating = ratingFromScore(overallConfidencePct);

  // ── End-of-pipeline logging — confidence breakdown + adjacent priority list ──
  logger.info('ValidationPipeline',
    `Pipeline complete: ${overallConfidencePct}% overall (${overallRating.display} ${overallRating.label}), ` +
    `${discrepancies.length} discrepancies, ${totalApiCalls} API calls`);
  logger.info('ValidationPipeline',
    `  Confidence breakdown: ✓=${confidenceCounts.CONFIRMED} ~=${confidenceCounts.DEDUCED} ` +
    `?=${confidenceCounts.UNCONFIRMED} ✗=${confidenceCounts.DISCREPANCY} ✗✗=${confidenceCounts.CRITICAL}`);
  if (discrepancies.some(d => d.severity === 'critical')) {
    logger.warn('ValidationPipeline',
      `  CRITICAL discrepancies: ${discrepancies.filter(d => d.severity === 'critical').map(d => d.description).join('; ')}`);
  }
  logger.info('ValidationPipeline',
    `  Adjacent properties: ${adjacentProperties.length}, roads: ${roads.length}, easements: ${easements.length}`);

  // Log adjacent properties that have recording references (highest research priority)
  const highPriorityAdjacents = adjacentProperties.filter(
    ap => ap.recordingReference && ap.recordingReference.trim() !== ''
  );
  if (highPriorityAdjacents.length > 0) {
    logger.info('ValidationPipeline',
      `  Adjacent properties with recording refs to pull next (${highPriorityAdjacents.length}):`);
    for (const ap of highPriorityAdjacents) {
      logger.info('ValidationPipeline',
        `    → ${ap.ownerName} — ${ap.recordingReference}${ap.direction ? ` [${ap.direction}]` : ''}`);
    }
  }

  // Log top actions from Call 7
  if (topActions.length > 0) {
    logger.info('ValidationPipeline', `  Top actions to improve confidence:`);
    for (const a of topActions.slice(0, 3)) {
      logger.info('ValidationPipeline', `    ${a.priority}. ${a.action} — ${a.expectedBenefit}`);
    }
  }

  return {
    propertyName:         propertyMeta.ownerName,
    recordingReferences,
    acreage:              propertyMeta.acreage,
    datum:                boundary?.datum ?? null,
    pobDescription:       boundary?.pointOfBeginning?.description ?? null,
    perCallConfidence,
    adjacentProperties,
    roads,
    easements,
    discrepancies,
    confidenceCounts,
    overallConfidencePct,
    overallRating,
    purchaseRecommendations: purchaseRecommendations.sort((a, b) => a.priority - b.priority),
    topActions,
    adjacentResearchOrder,
    discrepancyLog,
    analysisLimitations: [],
    generatedAt,
    totalApiCalls,
  };
}

// ── identifyAdjacentsFromText ─────────────────────────────────────────────────

/**
 * Extended adjacent property record extracted by the dedicated identification pass.
 * Captures richer recording detail than the base AdjacentProperty type.
 */
export interface AdjacentPropertyExtracted {
  ownerName: string;
  /** Stated acreage from plat label, e.g. "4.00 ac" */
  calledAcres: string | null;
  /** "volume_page" | "instrument_number" — how the recording reference is stated */
  instrumentType: 'volume_page' | 'instrument_number' | 'unknown';
  volume: string | null;
  page: string | null;
  instrumentNumber: string | null;
  recordDate: string | null;
  /** Which boundary this neighbor shares with the subject property */
  sharedBoundary: string | null;
  /** Approximate length of shared boundary from plat data */
  estimatedSharedLength: string | null;
}

export interface RoadExtracted {
  name: string;
  /** "FM highway" | "county road" | "spur" | "state highway" | "private" | "unknown" */
  type: string;
  rowWidth: string | null;
  /** Which property boundary this road forms */
  boundaryPosition: string | null;
}

export interface EasementExtracted {
  holder: string | null;
  /** "utility" | "water" | "drainage" | "access" | "pipeline" | "unknown" */
  type: string;
  reference: string | null;
  date: string | null;
}

export interface AdjacentIdentificationResult {
  adjacentProperties: AdjacentPropertyExtracted[];
  roads: RoadExtracted[];
  easements: EasementExtracted[];
}

// Prompt mirrored from the property-research-pipeline.js reference script.
// Kept at module scope (alongside SYNTHESIS_SYSTEM, CROSS_VALIDATION_SYSTEM, REPORT_SYSTEM)
// so all prompt constants are co-located for easy review and versioning.
const IDENTIFY_ADJACENTS_PROMPT = `From the plat extraction data below, identify EVERY adjacent property owner and their recording information.

PLAT EXTRACTION:
{TEXT}

For each adjacent property, extract:
1. OWNER NAME (exactly as shown on plat)
2. CALLED ACREAGE (the acreage stated on the plat)
3. RECORDING REFERENCE:
   - Volume/Page if deed records
   - Instrument number if official public records
4. RECORDING DATE
5. WHICH BOUNDARY they share with the subject property (north, south, east, west, or specific description)
6. APPROXIMATE LENGTH of shared boundary (if estimable from plat data)

Also identify:
- ALL ROADS with their names and any ROW references
- ANY EASEMENT holders with recording references
- ANY UTILITY or DISTRICT references

Return your response as JSON only. No markdown fences, no explanation.
{
  "adjacentProperties": [
    {
      "ownerName": "...",
      "calledAcres": "...",
      "instrumentType": "volume_page" or "instrument_number",
      "volume": "..." or null,
      "page": "..." or null,
      "instrumentNumber": "..." or null,
      "recordDate": "...",
      "sharedBoundary": "...",
      "estimatedSharedLength": "..."
    }
  ],
  "roads": [
    {
      "name": "...",
      "type": "FM highway" or "county road" or "spur" or "state highway" or "private" or "unknown",
      "rowWidth": "...",
      "boundaryPosition": "..."
    }
  ],
  "easements": [
    {
      "holder": "...",
      "type": "utility" or "water" or "drainage" or "access" or "pipeline" or "unknown",
      "reference": "...",
      "date": "..."
    }
  ]
}`;

/**
 * Dedicated adjacent-property identification pass.
 *
 * Parses a plat OCR text extraction to find all neighboring property owners,
 * their recording references (instrument number OR volume/page), and associated
 * roads and easements. The structured output feeds into the adjacent research
 * workflow and provides richer recording detail than the general Call 5 synthesis.
 *
 * @param ocrText         Raw OCR text from the plat document
 * @param anthropicApiKey Anthropic API key
 * @param logger          Pipeline logger
 */
export async function identifyAdjacentsFromText(
  ocrText: string,
  anthropicApiKey: string,
  logger: PipelineLogger,
): Promise<AdjacentIdentificationResult> {
  logger.info('IdentifyAdjacents', '═══ Adjacent Property Identification ═══');
  logger.info('IdentifyAdjacents', `  Input OCR text: ${ocrText.length} chars, ${ocrText.split('\n').length} lines`);

  const client = new Anthropic({ apiKey: anthropicApiKey });
  const prompt = IDENTIFY_ADJACENTS_PROMPT.replace('{TEXT}', ocrText);
  const startMs = Date.now();

  const raw = await callClaude(client,
    'You are a professional land surveyor assistant. Extract structured data from plat OCR text. Return only valid JSON, no markdown.',
    prompt, 'identify-adjacents', logger);
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

  if (!raw) {
    logger.warn('IdentifyAdjacents', '  Claude returned empty response — returning empty result');
    return { adjacentProperties: [], roads: [], easements: [] };
  }

  logger.info('IdentifyAdjacents', `  Claude response: ${raw.length} chars in ${elapsed}s`);

  const parsed = safeParseJson(raw);
  if (!parsed) {
    logger.warn('IdentifyAdjacents',
      '  Could not parse adjacent data as JSON — returning empty result. ' +
      `First 200 chars: ${raw.substring(0, 200)}`);
    return { adjacentProperties: [], roads: [], easements: [] };
  }

  const adjacentProperties: AdjacentPropertyExtracted[] = Array.isArray(parsed.adjacentProperties)
    ? (parsed.adjacentProperties as unknown[]).map((p: unknown) => {
        const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
        const instrType = String(o.instrumentType ?? 'unknown');
        return {
          ownerName:             String(o.ownerName ?? 'Unknown'),
          calledAcres:           o.calledAcres      != null ? String(o.calledAcres)      : null,
          instrumentType:        (['volume_page','instrument_number'].includes(instrType)
            ? instrType : 'unknown') as AdjacentPropertyExtracted['instrumentType'],
          volume:                o.volume           != null ? String(o.volume)           : null,
          page:                  o.page             != null ? String(o.page)             : null,
          instrumentNumber:      o.instrumentNumber != null ? String(o.instrumentNumber) : null,
          recordDate:            o.recordDate       != null ? String(o.recordDate)       : null,
          sharedBoundary:        o.sharedBoundary   != null ? String(o.sharedBoundary)   : null,
          estimatedSharedLength: o.estimatedSharedLength != null ? String(o.estimatedSharedLength) : null,
        };
      })
    : [];

  const roads: RoadExtracted[] = Array.isArray(parsed.roads)
    ? (parsed.roads as unknown[]).map((r: unknown) => {
        const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
        return {
          name:             String(o.name ?? ''),
          type:             String(o.type ?? 'unknown'),
          rowWidth:         o.rowWidth         != null ? String(o.rowWidth)         : null,
          boundaryPosition: o.boundaryPosition != null ? String(o.boundaryPosition) : null,
        };
      })
    : [];

  const easements: EasementExtracted[] = Array.isArray(parsed.easements)
    ? (parsed.easements as unknown[]).map((e: unknown) => {
        const o = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
        return {
          holder:    o.holder    != null ? String(o.holder)    : null,
          type:      String(o.type ?? 'unknown'),
          reference: o.reference != null ? String(o.reference) : null,
          date:      o.date      != null ? String(o.date)      : null,
        };
      })
    : [];

  // ── Detailed logging (every adjacent property, road, and easement) ──────────
  logger.info('IdentifyAdjacents',
    `  Found ${adjacentProperties.length} adjacent properties, ${roads.length} roads, ${easements.length} easements`);

  for (const p of adjacentProperties) {
    const ref = p.instrumentType === 'instrument_number'
      ? (p.instrumentNumber ?? 'no instrument#')
      : p.volume && p.page
        ? `Vol ${p.volume} Pg ${p.page}`
        : 'no recording ref';
    logger.info('IdentifyAdjacents',
      `    [adjacent] ${p.ownerName}: ${p.calledAcres ?? '?'} ac — ${ref} — ${p.sharedBoundary ?? 'boundary unknown'}`);
  }

  for (const r of roads) {
    logger.info('IdentifyAdjacents',
      `    [road] ${r.name} (${r.type})${r.rowWidth ? ` ROW=${r.rowWidth}` : ''}${r.boundaryPosition ? ` @ ${r.boundaryPosition}` : ''}`);
  }

  for (const e of easements) {
    logger.info('IdentifyAdjacents',
      `    [easement] ${e.type}${e.holder ? ` holder=${e.holder}` : ''}${e.reference ? ` ref=${e.reference}` : ''}`);
  }

  logger.info('IdentifyAdjacents',
    `═══ Adjacent identification complete in ${elapsed}s ═══`);

  return { adjacentProperties, roads, easements };
}
