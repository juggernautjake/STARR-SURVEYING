// worker/src/services/lot-confidence-scorer.ts — Phase 8 Steps 2-3
// Scores each lot and each boundary side based on call-level scores,
// closure quality, acreage cross-check, and weakest-call penalty.
//
// Spec §8.4 — Lot-Level and Boundary-Side Confidence

import type { ReconciledCall } from '../types/reconciliation.js';
import type {
  CallConfidenceScore,
  LotConfidenceScore,
  BoundarySideConfidence,
} from '../types/confidence.js';
import { scoreToGrade } from './call-confidence-scorer.js';

// ── Lot Confidence Scorer ────────────────────────────────────────────────────

export class LotConfidenceScorer {

  scoreLot(
    lotId: string,
    lotName: string,
    lotCalls: ReconciledCall[],
    callScores: Map<string, CallConfidenceScore>,
    closureRatio: string,
    closureStatus: string,
    statedAcreage: number,
    computedAcreage: number,
  ): LotConfidenceScore {
    const scores: number[] = [];
    let weakest: { callId: string; score: number; reason: string } | null =
      null;

    for (const call of lotCalls) {
      const cs = callScores.get(call.callId);
      const score = cs?.score || 50;
      scores.push(score);

      if (!weakest || score < weakest.score) {
        weakest = {
          callId: call.callId,
          score,
          reason: cs?.notes || 'No details',
        };
      }
    }

    // Base: weighted average of call scores (weighted by boundary length)
    let totalWeight = 0;
    let weightedSum = 0;
    for (let i = 0; i < lotCalls.length; i++) {
      const dist = lotCalls[i].reconciledDistance || 100;
      weightedSum += scores[i] * dist;
      totalWeight += dist;
    }
    let lotScore = totalWeight > 0 ? weightedSum / totalWeight : 50;

    // Closure factor: good closure boosts score, bad closure penalizes
    lotScore += this.closureBonus(closureRatio);

    // Acreage cross-check: if computed acreage matches stated, boost
    if (statedAcreage > 0 && computedAcreage > 0) {
      const pctDiff =
        (Math.abs(statedAcreage - computedAcreage) / statedAcreage) * 100;
      if (pctDiff < 0.5) lotScore += 5;
      else if (pctDiff < 2.0) lotScore += 2;
      else if (pctDiff > 5.0) lotScore -= 5;
    }

    // Weakest-call penalty: lot is only as strong as its weakest link
    if (weakest && weakest.score < 40) {
      lotScore -= 5;
    }

    lotScore = Math.min(98, Math.max(5, Math.round(lotScore)));

    return {
      lotId,
      name: lotName,
      score: lotScore,
      grade: scoreToGrade(lotScore),
      callScores: scores,
      weakestCall: weakest,
      closureStatus,
      closureRatio,
      acreageConfidence: this.acreageConfidence(statedAcreage, computedAcreage),
      riskLevel:
        lotScore >= 80
          ? 'low'
          : lotScore >= 60
            ? 'medium'
            : lotScore >= 40
              ? 'high'
              : 'critical',
    };
  }

  scoreBoundarySides(
    callScores: Map<string, CallConfidenceScore>,
    callDirections: Map<string, string>,
  ): BoundarySideConfidence[] {
    const sides = new Map<string, number[]>();

    for (const [callId, direction] of callDirections) {
      const score = callScores.get(callId)?.score || 50;
      if (!sides.has(direction)) sides.set(direction, []);
      sides.get(direction)!.push(score);
    }

    const results: BoundarySideConfidence[] = [];
    for (const [side, sideScores] of sides) {
      const avg =
        sideScores.reduce((s, v) => s + v, 0) / sideScores.length;
      const rounded = Math.round(avg);
      results.push({
        side,
        score: rounded,
        grade: scoreToGrade(rounded),
        calls: sideScores.length,
        avgCallScore: rounded,
        risk:
          rounded < 60
            ? `Low confidence on ${side} boundary — additional research recommended`
            : undefined,
      });
    }

    return results.sort((a, b) => {
      const order: Record<string, number> = {
        north: 0,
        east: 1,
        south: 2,
        west: 3,
      };
      return (order[a.side] ?? 4) - (order[b.side] ?? 4);
    });
  }

  private closureBonus(ratio: string): number {
    if (ratio === '1:∞') return 8;
    const m = ratio.match(/1:(\d+)/);
    if (!m) return 0;
    const r = parseInt(m[1]);
    if (r >= 50000) return 8;
    if (r >= 20000) return 5;
    if (r >= 10000) return 2;
    if (r >= 5000) return 0;
    return -5;
  }

  private acreageConfidence(stated: number, computed: number): number {
    if (!stated || !computed) return 50;
    const pct = (Math.abs(stated - computed) / stated) * 100;
    if (pct < 0.1) return 98;
    if (pct < 0.5) return 90;
    if (pct < 1.0) return 80;
    if (pct < 2.0) return 65;
    if (pct < 5.0) return 45;
    return 25;
  }
}
