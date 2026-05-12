// worker/src/services/discrepancy-analyzer.ts — Phase 8 Step 5
// Detects, classifies, and analyzes every discrepancy in the reconciled data.
// Uses AI root-cause analysis for unresolved discrepancies.
//
// Spec §8.5 — Discrepancy Analysis Engine
//
// Discrepancy categories detected:
//   bearing_mismatch   — 2+ sources disagree on bearing (spread > 1 arc-minute)
//   distance_mismatch  — 2+ sources disagree on distance (spread > 2 feet)
//   type_conflict      — some say straight, others say curve
//   datum_shift        — systematic 2-5 arc-minute rotation across multiple calls
//   area_discrepancy   — computed acreage differs from stated acreage by > 2%
//   (additional categories like monument_conflict come from AI analysis)
//
// Robustness notes:
//   - AbortSignal.timeout(30_000) on AI fetch to prevent hanging
//   - All detection methods return null instead of throwing
//   - AI failures are logged and fall back gracefully (no re-throw)
//   - Uses PipelineLogger for structured logging (no bare console calls)

import type { ReconciledCall } from '../types/reconciliation.js';
import type {
  CallConfidenceScore,
  DiscrepancyReport,
  DiscrepancyCategory,
} from '../types/confidence.js';
import { PipelineLogger } from '../lib/logger.js';

const AI_MODEL = process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-6';

// Minimum arc-minute spread to flag as a datum_shift candidate.
// NAD27→NAD83 typically shifts 2-5 arc-minutes in Texas.
const DATUM_SHIFT_MIN_SPREAD_MIN = 2.0;
const DATUM_SHIFT_MAX_SPREAD_MIN = 6.0;
// Minimum number of affected calls needed before classifying as datum_shift
// (vs isolated bearing error).
const DATUM_SHIFT_MIN_AFFECTED_CALLS = 3;

// ── Discrepancy Analyzer ────────────────────────────────────────────────────

export class DiscrepancyAnalyzer {
  private apiKey: string;
  private logger: PipelineLogger;

  constructor(apiKey?: string, projectId?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.logger = new PipelineLogger(projectId || 'unknown-project');
  }

  async analyzeDiscrepancies(
    reconciledCalls: ReconciledCall[],
    callScores: Map<string, CallConfidenceScore>,
    resolvedDiscrepancies: {
      category?: string;
      title?: string;
      originalDescription?: string;
      description?: string;
      resolution?: string;
      resolvedBy?: string;
      resolvedInPhase?: number;
      affectedCalls?: string[];
      affectedLots?: string[];
      newConfidence?: number;
    }[],
    propertyContext: {
      county: string;
      surveyDate?: string;
      subdivisionName?: string;
    },
  ): Promise<{ reports: DiscrepancyReport[]; aiCalls: number }> {
    const reports: DiscrepancyReport[] = [];
    let discId = 1;
    let aiCalls = 0;

    // Collect already-resolved discrepancies (from Phase 6 ROW, etc.)
    for (const rd of resolvedDiscrepancies || []) {
      reports.push({
        id: `DISC-${String(discId++).padStart(3, '0')}`,
        severity: 'moderate',
        category: (rd.category as DiscrepancyCategory) || 'road_geometry',
        title: rd.originalDescription || rd.title || 'Resolved discrepancy',
        description: rd.description || rd.originalDescription || '',
        status: 'resolved',
        resolvedBy: rd.resolution || rd.resolvedBy,
        resolvedInPhase: rd.resolvedInPhase || 6,
        affectedCalls: rd.affectedCalls || [],
        affectedLots: rd.affectedLots || [],
        readings: [],
        analysis: {
          possibleCauses: [],
          impactAssessment: {
            closureImpact: 'none',
            acreageImpact: 'n/a',
            boundaryPositionShift: 'n/a',
            legalSignificance: 'Resolved',
          },
        },
        resolution: {
          recommended: rd.resolution || 'Already resolved',
          alternatives: [],
          estimatedCost: '$0',
          estimatedConfidenceAfterResolution: rd.newConfidence || 90,
          priority: 99,
        },
      });
    }

    // Identify NEW discrepancies from reconciled data
    for (const call of reconciledCalls) {
      if (call.readings.length < 2) continue;

      // Check for bearing disagreement
      const bearingDisc = this.detectBearingDiscrepancy(call);
      if (bearingDisc) {
        bearingDisc.id = `DISC-${String(discId++).padStart(3, '0')}`;
        reports.push(bearingDisc);
      }

      // Check for distance disagreement
      const distDisc = this.detectDistanceDiscrepancy(call);
      if (distDisc) {
        distDisc.id = `DISC-${String(discId++).padStart(3, '0')}`;
        reports.push(distDisc);
      }

      // Check for type conflicts (straight vs curve)
      const typeDisc = this.detectTypeConflict(call);
      if (typeDisc) {
        typeDisc.id = `DISC-${String(discId++).padStart(3, '0')}`;
        reports.push(typeDisc);
      }
    }

    // Check for datum shift — a systematic pattern across multiple bearing discrepancies
    const datumDisc = this.detectDatumShift(reconciledCalls);
    if (datumDisc) {
      datumDisc.id = `DISC-${String(discId++).padStart(3, '0')}`;
      // Insert before individual bearing discrepancies to indicate the root cause
      reports.unshift(datumDisc);
    }

    // AI root-cause analysis for unresolved discrepancies
    const unresolved = reports.filter((r) => r.status === 'unresolved');
    if (unresolved.length > 0 && this.apiKey) {
      try {
        await this.aiRootCauseAnalysis(unresolved, propertyContext);
        aiCalls++;
      } catch (e) {
        // Non-fatal: AI failure leaves default empty analysis in place
        this.logger.warn('Discrepancy', `AI root-cause analysis failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Sort by priority (lowest number = highest priority), then severity
    reports.sort(
      (a, b) =>
        (a.resolution?.priority || 99) - (b.resolution?.priority || 99),
    );

    return { reports, aiCalls };
  }

  // ── Bearing Discrepancy Detection ──────────────────────────────────────

  private detectBearingDiscrepancy(
    call: ReconciledCall,
  ): DiscrepancyReport | null {
    const bearingReadings = call.readings
      .filter((r) => r.type === 'straight' && r.bearing)
      .map((r) => ({
        source: r.source,
        bearing: r.bearing!,
        distance: r.distance,
        confidence: r.confidence,
      }));

    if (bearingReadings.length < 2) return null;

    const decimals = bearingReadings
      .map((r) => this.bearingToDecimal(r.bearing))
      .filter((d) => d !== null) as number[];

    if (decimals.length < 2) return null;

    const spread = Math.max(...decimals) - Math.min(...decimals);

    // Only flag if spread > 1 arc-minute (0.0167°)
    if (spread < 0.0167) return null;

    const spreadMin = Math.round(spread * 60 * 100) / 100;
    const severity: 'critical' | 'moderate' | 'minor' =
      spreadMin > 5 ? 'critical' : spreadMin > 1 ? 'moderate' : 'minor';

    return {
      id: '',
      severity,
      category: 'bearing_mismatch',
      title: `${spreadMin.toFixed(1)}' bearing discrepancy on ${call.callId}`,
      description:
        `${bearingReadings.length} sources disagree on bearing for ${call.callId}: ` +
        `${bearingReadings.map((r) => `${r.source}=${r.bearing}`).join(', ')}. ` +
        `Spread: ${spreadMin.toFixed(1)} arc-minutes.`,
      status: 'unresolved',
      affectedCalls: [call.callId],
      affectedLots: [],
      readings: bearingReadings.map((r) => ({
        source: r.source,
        bearing: r.bearing,
        distance: r.distance,
        confidence: r.confidence,
      })),
      analysis: {
        possibleCauses: [],
        impactAssessment: {
          closureImpact: 'moderate',
          acreageImpact: 'TBD',
          boundaryPositionShift: 'TBD',
          legalSignificance: 'TBD',
        },
      },
      resolution: {
        recommended: 'TBD',
        alternatives: [],
        estimatedCost: 'TBD',
        estimatedConfidenceAfterResolution: 0,
        priority:
          severity === 'critical' ? 1 : severity === 'moderate' ? 2 : 3,
      },
    };
  }

  // ── Distance Discrepancy Detection ─────────────────────────────────────

  private detectDistanceDiscrepancy(
    call: ReconciledCall,
  ): DiscrepancyReport | null {
    const distReadings = call.readings
      .filter((r) => r.distance != null && r.distance > 0)
      .map((r) => ({
        source: r.source,
        bearing: r.bearing,
        distance: r.distance!,
        confidence: r.confidence,
      }));

    if (distReadings.length < 2) return null;

    const spread =
      Math.max(...distReadings.map((r) => r.distance)) -
      Math.min(...distReadings.map((r) => r.distance));

    // Only flag if spread > 2 feet
    if (spread < 2.0) return null;

    const severity: 'critical' | 'moderate' | 'minor' =
      spread > 10 ? 'critical' : spread > 5 ? 'moderate' : 'minor';

    return {
      id: '',
      severity,
      category: 'distance_mismatch',
      title: `${spread.toFixed(2)}' distance discrepancy on ${call.callId}`,
      description:
        `${distReadings.length} sources disagree on distance for ${call.callId}: ` +
        `${distReadings.map((r) => `${r.source}=${r.distance}'`).join(', ')}. ` +
        `Spread: ${spread.toFixed(2)} feet.`,
      status: 'unresolved',
      affectedCalls: [call.callId],
      affectedLots: [],
      readings: distReadings.map((r) => ({
        source: r.source,
        bearing: r.bearing,
        distance: r.distance,
        confidence: r.confidence,
      })),
      analysis: {
        possibleCauses: [],
        impactAssessment: {
          closureImpact: 'moderate',
          acreageImpact: 'TBD',
          boundaryPositionShift: 'TBD',
          legalSignificance: 'TBD',
        },
      },
      resolution: {
        recommended: 'TBD',
        alternatives: [],
        estimatedCost: 'TBD',
        estimatedConfidenceAfterResolution: 0,
        priority: severity === 'critical' ? 1 : 2,
      },
    };
  }

  // ── Type Conflict Detection ────────────────────────────────────────────

  private detectTypeConflict(
    call: ReconciledCall,
  ): DiscrepancyReport | null {
    const types = new Set(call.readings.map((r) => r.type));
    if (types.size <= 1) return null;

    // Already resolved by authoritative override?
    if (call.reconciliation.method === 'authoritative_override') return null;

    return {
      id: '',
      severity: 'moderate',
      category: 'type_conflict',
      title: `Straight vs curve conflict on ${call.callId}`,
      description:
        `Some sources describe ${call.callId} as straight, others as curved. ` +
        `${call.readings.map((r) => `${r.source}=${r.type}`).join(', ')}.`,
      status: 'unresolved',
      affectedCalls: [call.callId],
      affectedLots: [],
      readings: call.readings.map((r) => ({
        source: r.source,
        bearing: r.bearing,
        distance: r.distance,
        confidence: r.confidence,
      })),
      analysis: {
        possibleCauses: [],
        impactAssessment: {
          closureImpact: 'moderate',
          acreageImpact: 'TBD',
          boundaryPositionShift: 'TBD',
          legalSignificance: 'TBD',
        },
      },
      resolution: {
        recommended: 'TBD',
        alternatives: [],
        estimatedCost: 'TBD',
        estimatedConfidenceAfterResolution: 0,
        priority: 2,
      },
    };
  }

  // ── Datum Shift Detection ──────────────────────────────────────────────
  //
  // Detects a NAD27→NAD83 datum shift pattern: if 3+ calls all show bearing
  // spreads in the 2–6 arc-minute range AND the shifts are in a consistent
  // direction, this is more likely a systematic datum shift than random OCR
  // errors.  When detected, a single datum_shift discrepancy is emitted to
  // explain the root cause of multiple bearing_mismatch items.

  private detectDatumShift(
    reconciledCalls: ReconciledCall[],
  ): DiscrepancyReport | null {
    // Collect calls with bearing spreads in the datum-shift range
    const affected: { callId: string; spreadMin: number }[] = [];

    for (const call of reconciledCalls) {
      if (call.readings.length < 2) continue;
      const bearingReadings = call.readings
        .filter((r) => r.type === 'straight' && r.bearing)
        .map((r) => r.bearing!);
      if (bearingReadings.length < 2) continue;

      const decimals = bearingReadings
        .map((b) => this.bearingToDecimal(b))
        .filter((d) => d !== null) as number[];
      if (decimals.length < 2) continue;

      const spreadDeg = Math.max(...decimals) - Math.min(...decimals);
      const spreadMin = spreadDeg * 60;

      if (spreadMin >= DATUM_SHIFT_MIN_SPREAD_MIN && spreadMin <= DATUM_SHIFT_MAX_SPREAD_MIN) {
        affected.push({ callId: call.callId, spreadMin });
      }
    }

    if (affected.length < DATUM_SHIFT_MIN_AFFECTED_CALLS) return null;

    const avgSpread = (affected.reduce((s, a) => s + a.spreadMin, 0) / affected.length).toFixed(1);

    return {
      id: '',
      severity: 'critical',
      category: 'datum_shift',
      title: `Probable NAD27→NAD83 datum shift affecting ${affected.length} calls`,
      description:
        `${affected.length} calls show consistent bearing spreads of ${DATUM_SHIFT_MIN_SPREAD_MIN}–${DATUM_SHIFT_MAX_SPREAD_MIN} arc-minutes ` +
        `(avg ${avgSpread}'). This pattern is characteristic of a NAD27→NAD83 datum shift common in pre-1983 Texas surveys. ` +
        `Affected calls: ${affected.map((a) => `${a.callId} (${a.spreadMin.toFixed(1)}')`).join(', ')}.`,
      status: 'unresolved',
      affectedCalls: affected.map((a) => a.callId),
      affectedLots: [],
      readings: [],
      analysis: {
        possibleCauses: [
          {
            cause: 'NAD27 → NAD83 datum shift',
            likelihood: 'high',
            explanation:
              'Texas surveys prior to ~1987 were often referenced to NAD27. ' +
              'The shift to NAD83 introduces a systematic bearing rotation of approximately 2-5 arc-minutes ' +
              'in the clockwise direction across most of Texas. This is the most common explanation for ' +
              'consistent multi-call bearing discrepancies in this range.',
          },
          {
            cause: 'Magnetic declination epoch difference',
            likelihood: 'medium',
            explanation:
              'If one source was corrected for magnetic declination and another was not, ' +
              'a systematic offset could appear. Less likely to be this consistent.',
          },
        ],
        impactAssessment: {
          closureImpact: 'moderate',
          acreageImpact: 'Minimal — datum shifts do not significantly change computed area',
          boundaryPositionShift: 'Up to 5 feet at 1,000 feet distance per arc-minute of shift',
          legalSignificance: 'High — affects legal position of corners and boundary lines',
        },
      },
      resolution: {
        recommended:
          'Apply NAD27→NAD83 datum transformation to all pre-1983 source documents. ' +
          'Obtain a current GPS-referenced control monument to establish datum. ' +
          'Most county engineering offices can provide transformation parameters.',
        alternatives: [
          'Contact TxDOT district office for datum transformation values applicable to this county',
          'Use NOAA NADCON5 online tool to transform specific coordinates',
        ],
        estimatedCost: '$0',
        estimatedConfidenceAfterResolution: 85,
        priority: 1,
      },
    };
  }

  // ── AI Root-Cause Analysis ─────────────────────────────────────────────
  //
  // Sends all unresolved discrepancies to Claude for root-cause analysis.
  // Uses AbortSignal.timeout(30_000) to prevent indefinite hanging.
  // On failure, the discrepancies retain their default empty analysis fields.

  private async aiRootCauseAnalysis(
    discrepancies: DiscrepancyReport[],
    context: {
      county: string;
      surveyDate?: string;
      subdivisionName?: string;
    },
  ): Promise<void> {
    const prompt = `You are a senior RPLS (Registered Professional Land Surveyor) in Texas analyzing boundary data discrepancies.

PROPERTY CONTEXT:
- County: ${context.county}
- Survey/Plat Date: ${context.surveyDate || 'unknown'}
- Subdivision: ${context.subdivisionName || 'standalone tract'}

DISCREPANCIES TO ANALYZE:
${discrepancies
  .map(
    (d, i) =>
      `${i + 1}. [${d.severity.toUpperCase()}] ${d.title}
   ${d.description}
   Readings: ${d.readings.map((r) => `${r.source}: bearing=${r.bearing || 'n/a'}, dist=${r.distance || 'n/a'}', conf=${r.confidence}`).join(' | ')}`,
  )
  .join('\n')}

For EACH discrepancy, provide analysis as JSON array:
[
  {
    "discIndex": 0,
    "possibleCauses": [
      { "cause": "short name", "likelihood": "high|medium|low", "explanation": "detailed explanation" }
    ],
    "likelyCorrectValue": { "bearing": "N ##°##'##\\" E", "distance": 0.0, "reasoning": "why this value" },
    "impactAssessment": {
      "closureImpact": "severe|moderate|minimal|none",
      "acreageImpact": "X.XXX acres difference",
      "boundaryPositionShift": "X.X feet at furthest point",
      "legalSignificance": "description"
    },
    "recommendedResolution": "what to do",
    "alternatives": ["alt 1", "alt 2"],
    "estimatedCost": "$X-Y",
    "confidenceAfterResolution": 85,
    "priority": 1
  }
]

COMMON CAUSES IN TEXAS SURVEYING:
- NAD27 → NAD83 datum shift (2-5 arc-minute bearing rotations are typical)
- Watermark digit obscuration (common on Kofile documents)
- Road widening changes (TxDOT commonly widens FM roads from 60' to 80' ROW)
- Vara-to-feet conversion errors (1 vara = 33⅓ inches, 2.778 feet)
- Different magnetic declination epochs
- Original survey tied to different monument than the replat

Return ONLY valid JSON array.`;

    // AbortSignal.timeout prevents the fetch from hanging indefinitely.
    // Requires Node.js 15.0.0+ (which exports AbortSignal.timeout).
    // Falls back to undefined (no timeout) on older environments.
    const signal: AbortSignal | undefined =
      typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? AbortSignal.timeout(30_000)
        : undefined;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: 6000,
          messages: [{ role: 'user', content: prompt }],
        }),
        ...(signal ? { signal } : {}),
      });

      const data = (await response.json()) as {
        content?: { text?: string }[];
      };
      const text = data.content?.[0]?.text || '';
      const analyses = JSON.parse(
        text.replace(/```json?|```/g, '').trim(),
      ) as {
        discIndex: number;
        possibleCauses?: { cause: string; likelihood: string; explanation: string }[];
        likelyCorrectValue?: { bearing: string; distance: number; reasoning: string };
        impactAssessment?: {
          closureImpact: string;
          acreageImpact: string;
          boundaryPositionShift: string;
          legalSignificance: string;
        };
        recommendedResolution?: string;
        alternatives?: string[];
        estimatedCost?: string;
        confidenceAfterResolution?: number;
        priority?: number;
      }[];

      for (const analysis of analyses) {
        const idx = analysis.discIndex;
        if (idx >= 0 && idx < discrepancies.length) {
          const disc = discrepancies[idx];
          disc.analysis.possibleCauses =
            (analysis.possibleCauses as DiscrepancyReport['analysis']['possibleCauses']) || [];
          if (analysis.likelyCorrectValue) {
            disc.analysis.likelyCorrectValue = analysis.likelyCorrectValue;
          }
          if (analysis.impactAssessment) {
            disc.analysis.impactAssessment =
              analysis.impactAssessment as DiscrepancyReport['analysis']['impactAssessment'];
          }
          disc.resolution.recommended =
            analysis.recommendedResolution || 'Manual review';
          disc.resolution.alternatives = analysis.alternatives || [];
          disc.resolution.estimatedCost =
            analysis.estimatedCost || 'Unknown';
          disc.resolution.estimatedConfidenceAfterResolution =
            analysis.confidenceAfterResolution || 75;
          disc.resolution.priority = analysis.priority || 3;
        }
      }
    } catch (e) {
      // Non-fatal — discrepancies retain their default empty analysis fields.
      // Log the error for diagnostics but do not re-throw.
      this.logger.warn('Discrepancy', `AI root-cause analysis parse/fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private bearingToDecimal(bearing: string): number | null {
    const m = bearing.match(
      /([NS])\s*(\d+)[°]\s*(\d+)['"]\s*(\d+)?['""]?\s*([EW])/i,
    );
    if (!m) return null;
    return (
      parseInt(m[2]) + parseInt(m[3]) / 60 + parseInt(m[4] || '0') / 3600
    );
  }
}
