// worker/src/services/call-confidence-scorer.ts — Phase 8 Step 1
// Scores each boundary call on a 0-100 scale using a 4-factor model:
// sourceMultiplicity, sourceAgreement, sourceReliability, readingClarity.
//
// Spec §8.3 — Call-Level Confidence Scoring

import type { ReconciledCall } from '../types/reconciliation.js';
import type { CallConfidenceScore } from '../types/confidence.js';

// ── Reliability map — max per-factor contribution from each source type ────

const RELIABILITY_MAP: Record<string, number> = {
  txdot_row: 25,
  deed_extraction: 22,
  adjacent_reversed: 19,
  plat_segment: 16,
  subdivision_interior: 14,
  adjacent_chain: 10,
  plat_overview: 8,
  plat_geometric: 6,
  county_road_default: 4,
};

// ── Multiplicity score table ────────────────────────────────────────────────

const MULTIPLICITY_SCORES: Record<number, number> = {
  1: 5,
  2: 12,
  3: 18,
  4: 22,
  5: 25,
};

// ── Scorer ───────────────────────────────────────────────────────────────────

export class CallConfidenceScorer {

  scoreCall(reconciled: ReconciledCall): CallConfidenceScore {
    const sources = [...new Set(reconciled.readings.map((r) => r.source))];
    const sourceCount = sources.length;

    // Factor 1: Source Multiplicity (0-25)
    const sourceMultiplicity =
      MULTIPLICITY_SCORES[Math.min(sourceCount, 5)] || 25;

    // Factor 2: Source Agreement (0-25)
    let sourceAgreement = 0;
    if (sourceCount >= 2) {
      const bearingSpreadDeg = this.parseBearingSpread(
        reconciled.reconciliation.bearingSpread,
      );
      const distSpread = reconciled.reconciliation.distanceSpread;

      if (bearingSpreadDeg < 0.01 && distSpread < 0.5) sourceAgreement = 25;
      else if (bearingSpreadDeg < 0.05 && distSpread < 1.0)
        sourceAgreement = 20;
      else if (bearingSpreadDeg < 0.1 && distSpread < 2.0)
        sourceAgreement = 15;
      else if (bearingSpreadDeg < 0.5 && distSpread < 5.0)
        sourceAgreement = 8;
      else sourceAgreement = 3;
    }

    // Factor 3: Source Reliability (0-25)
    const bestReliability = Math.max(
      ...sources.map((s) => RELIABILITY_MAP[s] || 5),
    );
    const sourceReliability = bestReliability;

    // Factor 4: Reading Clarity (0-25)
    const maxReadingConfidence = Math.max(
      ...reconciled.readings.map((r) => r.confidence),
    );
    const readingClarity = Math.round(maxReadingConfidence / 4);

    // Composite score
    const raw =
      sourceMultiplicity + sourceAgreement + sourceReliability + readingClarity;
    const score = Math.min(98, Math.max(5, raw));

    // Grade
    const grade = scoreToGrade(score);

    // Agreement classification
    let agreement: CallConfidenceScore['agreement'] = 'n/a';
    if (sourceCount >= 2) {
      if (sourceAgreement >= 20) agreement = 'strong';
      else if (sourceAgreement >= 12) agreement = 'moderate';
      else agreement = 'weak';
    }

    // Risk level
    let riskLevel: CallConfidenceScore['riskLevel'];
    if (score >= 80) riskLevel = 'low';
    else if (score >= 60) riskLevel = 'medium';
    else if (score >= 40) riskLevel = 'high';
    else riskLevel = 'critical';

    // Notes for low-scoring calls
    let notes: string | null = null;
    if (sourceCount === 1) {
      notes = `Single source — ${sources[0]} only. No independent verification available.`;
    } else if (sourceAgreement <= 5 && sourceCount >= 2) {
      notes = `${sourceCount} sources present but significant disagreement. Likely datum shift or measurement error.`;
    } else if (readingClarity < 12) {
      notes = 'Low OCR clarity — watermark may be obscuring digits.';
    }

    return {
      callId: reconciled.callId,
      score,
      grade,
      sourceCount,
      sources,
      agreement,
      factors: {
        sourceMultiplicity,
        sourceAgreement,
        sourceReliability,
        readingClarity,
      },
      riskLevel,
      notes,
    };
  }

  scoreAllCalls(
    reconciledCalls: ReconciledCall[],
  ): Map<string, CallConfidenceScore> {
    const scores = new Map<string, CallConfidenceScore>();
    for (const call of reconciledCalls) {
      scores.set(call.callId, this.scoreCall(call));
    }
    return scores;
  }

  private parseBearingSpread(spread: string): number {
    if (spread === 'n/a' || spread === 'n/a (curve)') return 0;
    const m = spread.match(/(\d+)[°]\s*(\d+)['"]\s*(\d+)?/);
    if (!m) return 0;
    return (
      parseInt(m[1]) + parseInt(m[2]) / 60 + parseInt(m[3] || '0') / 3600
    );
  }
}

// ── Shared grade function ────────────────────────────────────────────────────

export function scoreToGrade(score: number): string {
  if (score >= 93) return 'A';
  if (score >= 88) return 'A-';
  if (score >= 83) return 'B+';
  if (score >= 78) return 'B';
  if (score >= 73) return 'B-';
  if (score >= 68) return 'C+';
  if (score >= 63) return 'C';
  if (score >= 58) return 'C-';
  if (score >= 53) return 'D+';
  if (score >= 48) return 'D';
  if (score >= 43) return 'D-';
  return 'F';
}
