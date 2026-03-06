// worker/src/services/watermark-comparison.ts — Phase 9 §9.5
// Compares watermarked (Phase 3) readings against official (purchased) readings
// to identify every change caused by watermark obstruction.
//
// This is the core value proposition of Phase 9: proving what the watermark hid.
//
// Spec §9.5 — Watermarked vs Official Comparison Engine

import type {
  ReadingComparison,
  ComparisonReport,
} from '../types/purchase.js';

// ── Input Types ─────────────────────────────────────────────────────────────

export interface ExtractedCall {
  callId: string;
  bearing: string;
  distance: number;
  confidence: number;
  curve?: {
    radius?: number;
    arcLength?: number;
    delta?: string;
    chordBearing?: string;
    chordDistance?: number;
  };
}

// ── Watermark Comparison Engine ─────────────────────────────────────────────

export class WatermarkComparison {

  compare(
    watermarkedCalls: ExtractedCall[],
    officialCalls: ExtractedCall[],
  ): ComparisonReport {
    const comparisons: ReadingComparison[] = [];
    let totalConfidenceGain = 0;
    let changedCount = 0;

    for (const official of officialCalls) {
      // Find the corresponding watermarked call
      const watermarked = this.findMatch(official, watermarkedCalls);
      if (!watermarked) continue;

      // ── Compare bearing ──────────────────────────────────────────────
      const bearingChanged = official.bearing !== watermarked.bearing;
      comparisons.push({
        callId: official.callId,
        field: 'bearing',
        watermarkedValue: watermarked.bearing,
        officialValue: official.bearing,
        changed: bearingChanged,
        watermarkedConfidence: watermarked.confidence,
        officialConfidence: official.confidence,
        confidenceGain: official.confidence - watermarked.confidence,
        notes: bearingChanged
          ? `Bearing changed from ${watermarked.bearing} to ${official.bearing}. Watermark was obscuring digits.`
          : null,
      });

      // ── Compare distance ─────────────────────────────────────────────
      const distChanged =
        Math.abs(official.distance - watermarked.distance) > 0.01;
      comparisons.push({
        callId: official.callId,
        field: 'distance',
        watermarkedValue: watermarked.distance,
        officialValue: official.distance,
        changed: distChanged,
        watermarkedConfidence: watermarked.confidence,
        officialConfidence: official.confidence,
        confidenceGain: official.confidence - watermarked.confidence,
        notes: distChanged
          ? `Distance changed from ${watermarked.distance}' to ${official.distance}'. Difference: ${Math.abs(official.distance - watermarked.distance).toFixed(2)}'.`
          : null,
      });

      // ── Compare curve parameters if present ──────────────────────────
      if (official.curve && watermarked.curve) {
        if (official.curve.radius && watermarked.curve.radius) {
          const radiusChanged =
            Math.abs(official.curve.radius - watermarked.curve.radius) > 0.01;
          if (radiusChanged) {
            comparisons.push({
              callId: official.callId,
              field: 'curve_radius',
              watermarkedValue: watermarked.curve.radius,
              officialValue: official.curve.radius,
              changed: true,
              watermarkedConfidence: watermarked.confidence,
              officialConfidence: official.confidence,
              confidenceGain: official.confidence - watermarked.confidence,
              notes: `Curve radius changed from ${watermarked.curve.radius}' to ${official.curve.radius}'.`,
            });
          }
        }

        if (official.curve.arcLength && watermarked.curve.arcLength) {
          const arcChanged =
            Math.abs(official.curve.arcLength - watermarked.curve.arcLength) >
            0.01;
          if (arcChanged) {
            comparisons.push({
              callId: official.callId,
              field: 'curve_arc',
              watermarkedValue: watermarked.curve.arcLength,
              officialValue: official.curve.arcLength,
              changed: true,
              watermarkedConfidence: watermarked.confidence,
              officialConfidence: official.confidence,
              confidenceGain: official.confidence - watermarked.confidence,
              notes: `Arc length changed from ${watermarked.curve.arcLength}' to ${official.curve.arcLength}'.`,
            });
          }
        }

        if (official.curve.delta && watermarked.curve.delta) {
          const deltaChanged = official.curve.delta !== watermarked.curve.delta;
          if (deltaChanged) {
            comparisons.push({
              callId: official.callId,
              field: 'curve_delta',
              watermarkedValue: watermarked.curve.delta,
              officialValue: official.curve.delta,
              changed: true,
              watermarkedConfidence: watermarked.confidence,
              officialConfidence: official.confidence,
              confidenceGain: official.confidence - watermarked.confidence,
              notes: `Delta angle changed from ${watermarked.curve.delta} to ${official.curve.delta}.`,
            });
          }
        }
      }

      if (bearingChanged || distChanged) changedCount++;
      totalConfidenceGain += official.confidence - watermarked.confidence;
    }

    const significantChanges = comparisons.filter((c) => c.changed);

    return {
      documentInstrument: '',
      documentType: '',
      totalCallsCompared: officialCalls.length,
      callsChanged: changedCount,
      callsConfirmed: officialCalls.length - changedCount,
      averageConfidenceGain:
        officialCalls.length > 0
          ? Math.round(totalConfidenceGain / officialCalls.length)
          : 0,
      comparisons,
      significantChanges,
    };
  }

  // ── Call Matching ───────────────────────────────────────────────────────

  private findMatch(
    official: ExtractedCall,
    watermarked: ExtractedCall[],
  ): ExtractedCall | null {
    // Exact callId match
    const exact = watermarked.find((w) => w.callId === official.callId);
    if (exact) return exact;

    // Fuzzy match by bearing quadrant + distance proximity
    for (const w of watermarked) {
      const bearingSimilar = this.bearingSimilar(
        w.bearing,
        official.bearing,
        5.0,
      );
      const distSimilar = Math.abs(w.distance - official.distance) < 10.0;
      if (bearingSimilar && distSimilar) return w;
    }

    return null;
  }

  private bearingSimilar(
    a: string,
    b: string,
    toleranceDeg: number,
  ): boolean {
    const pA = this.parseBearing(a);
    const pB = this.parseBearing(b);
    if (!pA || !pB) return false;
    if (pA.ns !== pB.ns || pA.ew !== pB.ew) return false;
    return Math.abs(pA.decimal - pB.decimal) < toleranceDeg;
  }

  private parseBearing(
    bearing: string,
  ): { ns: string; ew: string; decimal: number } | null {
    const m = bearing?.match(
      /([NS])\s*(\d+)[°]\s*(\d+)['"]\s*(\d+)?['""]?\s*([EW])/i,
    );
    if (!m) return null;
    return {
      ns: m[1],
      ew: m[5],
      decimal:
        parseInt(m[2]) + parseInt(m[3]) / 60 + parseInt(m[4] || '0') / 3600,
    };
  }
}
