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
  conflictNote: string | null;
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

  // ── Recommended actions ───────────────────────────────────────────
  purchaseRecommendations: DocumentPurchaseRecommendation[];

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
    try {
      const response = await client.messages.create({
        model: process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929',
        max_tokens: maxTokens,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      });
      const tb = response.content.find(c => c.type === 'text');
      const text = (tb?.type === 'text' ? tb.text : '') ?? '';
      tracker({ status: 'success', dataPointsFound: 1, details: `${text.length} chars` });
      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      tracker.step(`Attempt ${attempt + 1} failed: ${msg}`);
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

CARDINAL RULE: NEVER force reconciliation. When sources disagree, present ALL readings, explain the conflict, and recommend how to resolve it.

Return JSON:
{
  "perCallConfidence": [
    {
      "sequence": 1,
      "bearing": "N 45°28'15\\" E",
      "distance": "149.92",
      "symbol": "CONFIRMED",
      "sources": ["OCR pass 1", "OCR pass 2", "visual geometry"],
      "conflictNote": null
    }
  ],
  "discrepancies": [
    {
      "callSequence": 4,
      "description": "L4 bearing conflict — three OCR readings disagree",
      "allReadings": ["N86°31'22\\"W", "N36°31'22\\"W", "N56°31'22\\"W"],
      "severity": "critical",
      "resolvedValue": "N56°31'22\\"W",
      "recommendation": "Geometric analysis confirms N56° reading. Purchase unwatermarked plat to verify."
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

You will receive all analysis results. Generate a comprehensive validation summary that a field surveyor can rely on.

Return JSON with this exact structure:
{
  "propertyName": "ASH FAMILY TRUST 12.358 ACRE ADDITION",
  "overallSummary": "One paragraph summary of findings",
  "keyFindings": ["Finding 1", "Finding 2"],
  "criticalIssues": ["Issue requiring immediate attention"],
  "fieldNotes": ["Note for field crew"]
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
  logger.info('ValidationPipeline', 'Call 5: Text synthesis...');
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

  // ── CALL 6: Cross-validation ────────────────────────────────────────────────
  logger.info('ValidationPipeline', 'Call 6: Cross-validation & confidence symbol assignment...');
  const crossValInput = JSON.stringify({
    extractedCalls:     callSummary,
    validationResult:   validationSummary,
    reconciliation:     reconcSummary,
    propertyMeta,
  });

  const crossValRaw = await callClaude(client, CROSS_VALIDATION_SYSTEM, crossValInput, 'call6-crossvalidation', logger);
  totalApiCalls++;
  const crossValData = crossValRaw ? safeParseJson(crossValRaw) : null;

  const perCallConfidence: PerCallConfidence[] = Array.isArray(crossValData?.perCallConfidence)
    ? (crossValData.perCallConfidence as unknown[]).map((pcc: unknown) => {
        const o = (pcc && typeof pcc === 'object' ? pcc : {}) as Record<string, unknown>;
        return {
          sequence:     Number(o.sequence ?? 0),
          bearing:      o.bearing    != null ? String(o.bearing)    : null,
          distance:     o.distance   != null ? String(o.distance)   : null,
          rating:       ratingFromSymbol(String(o.symbol ?? 'UNCONFIRMED')),
          sources:      Array.isArray(o.sources) ? (o.sources as unknown[]).map(String) : [],
          conflictNote: o.conflictNote != null ? String(o.conflictNote) : null,
        };
      })
    // Fallback: build from boundary calls when AI call failed
    : callSummary.map(c => ({
        sequence: c.seq,
        bearing:  c.bearing,
        distance: c.distance,
        rating:   ratingFromScore(c.conf * 100),
        sources:  ['text-extraction'],
        conflictNote: null,
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
  logger.info('ValidationPipeline', 'Call 7: Final report summary...');
  const reportInput = JSON.stringify({
    propertyMeta,
    discrepancyCount:  discrepancies.length,
    criticalCount:     discrepancies.filter(d => d.severity === 'critical').length,
    perCallSummary:    perCallConfidence.map(p => ({ seq: p.sequence, symbol: p.rating.symbol })),
    overallConfidencePct: crossValData?.overallConfidencePct ?? 0,
    topDiscrepancies:  discrepancies.slice(0, 3),
  });

  await callClaude(client, REPORT_SYSTEM, reportInput, 'call7-report', logger);
  totalApiCalls++;

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

  logger.info('ValidationPipeline',
    `Pipeline complete: ${overallConfidencePct}% overall (${overallRating.display} ${overallRating.label}), ` +
    `${discrepancies.length} discrepancies, ${totalApiCalls} API calls`);

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
    generatedAt,
    totalApiCalls,
  };
}
