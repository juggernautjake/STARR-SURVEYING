// worker/src/services/discrepancy-analyzer.ts — Phase 8 Step 5
// Detects, classifies, and analyzes every discrepancy in the reconciled data.
// Uses AI root-cause analysis for unresolved discrepancies.
//
// Spec §8.5 — Discrepancy Analysis Engine

import type { ReconciledCall } from '../types/reconciliation.js';
import type {
  CallConfidenceScore,
  DiscrepancyReport,
  DiscrepancyCategory,
} from '../types/confidence.js';

const AI_MODEL = process.env.RESEARCH_AI_MODEL ?? 'claude-sonnet-4-5-20250929';

// ── Discrepancy Analyzer ────────────────────────────────────────────────────

export class DiscrepancyAnalyzer {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
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

    // AI root-cause analysis for unresolved discrepancies
    const unresolved = reports.filter((r) => r.status === 'unresolved');
    if (unresolved.length > 0 && this.apiKey) {
      try {
        await this.aiRootCauseAnalysis(unresolved, propertyContext);
        aiCalls++;
      } catch (e) {
        console.warn('[Discrepancy] AI root-cause analysis failed:', e);
      }
    }

    // Sort by priority
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

  // ── AI Root-Cause Analysis ─────────────────────────────────────────────

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
      console.warn('[Discrepancy] AI root-cause analysis parse failed:', e);
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
