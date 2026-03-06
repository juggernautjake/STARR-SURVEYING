// worker/src/services/traverse-closure.ts — Phase 7 Steps 4-5
// Computes traverse closure from reconciled calls and applies the
// Compass Rule (Bowditch) adjustment to distribute residual error.
//
// Spec §7.6 — Traverse Closure Computation & Compass Rule

import type {
  TraversePoint,
  ClosureResult,
  CompassRuleResult,
} from '../types/reconciliation.js';

// ── Traverse Input ──────────────────────────────────────────────────────────

export interface TraverseCall {
  callId: string;
  bearing: string | null;
  distance: number | null;
  type: 'straight' | 'curve';
  curve?: {
    chordBearing?: string;
    chordDistance?: number;
    arcLength?: number;
  };
}

// ── Traverse Computation ────────────────────────────────────────────────────

export class TraverseComputation {

  computeTraverse(
    calls: TraverseCall[],
    startNorthing: number = 0,
    startEasting: number = 0,
  ): ClosureResult {
    const points: TraversePoint[] = [];
    let N = startNorthing;
    let E = startEasting;
    let totalLength = 0;

    for (const call of calls) {
      let dN: number;
      let dE: number;

      if (
        call.type === 'curve' &&
        call.curve?.chordBearing &&
        call.curve?.chordDistance
      ) {
        // Use chord bearing and distance for traverse
        const azimuth = this.bearingToAzimuth(call.curve.chordBearing);
        const dist = call.curve.chordDistance;
        dN = dist * Math.cos(azimuth);
        dE = dist * Math.sin(azimuth);
        totalLength += call.curve.arcLength || call.curve.chordDistance;
      } else if (call.type === 'straight' && call.bearing && call.distance) {
        const azimuth = this.bearingToAzimuth(call.bearing);
        dN = call.distance * Math.cos(azimuth);
        dE = call.distance * Math.sin(azimuth);
        totalLength += call.distance;
      } else {
        continue; // Skip calls without enough data
      }

      N += dN;
      E += dE;

      points.push({
        pointId: `PT_${points.length + 1}`,
        callId: call.callId,
        northing: N,
        easting: E,
      });
    }

    // Closure error = difference between last point and start point
    const errorN = N - startNorthing;
    const errorE = E - startEasting;
    const errorDist = Math.sqrt(errorN * errorN + errorE * errorE);
    const ratio =
      totalLength > 0 && errorDist > 0
        ? Math.round(totalLength / errorDist)
        : Infinity;
    const ratioStr = ratio === Infinity ? '1:∞' : `1:${ratio}`;

    let status: ClosureResult['status'];
    if (ratio >= 50000 || ratio === Infinity) status = 'excellent';
    else if (ratio >= 15000) status = 'acceptable';
    else if (ratio >= 5000) status = 'marginal';
    else status = 'poor';

    return {
      errorNorthing: Math.round(errorN * 1000) / 1000,
      errorEasting: Math.round(errorE * 1000) / 1000,
      errorDistance: Math.round(errorDist * 1000) / 1000,
      closureRatio: ratioStr,
      status,
      perimeterLength: Math.round(totalLength * 100) / 100,
      points,
    };
  }

  // ── Compass Rule (Bowditch) Adjustment ──────────────────────────────────

  applyCompassRule(
    calls: TraverseCall[],
    closure: ClosureResult,
  ): CompassRuleResult {
    if (closure.perimeterLength === 0 || closure.errorDistance === 0) {
      return {
        ...closure,
        compassRuleApplied: false,
        adjustments: [],
        adjustedPoints: closure.points,
      };
    }

    const adjustments: { callId: string; dN: number; dE: number }[] = [];
    const adjustedPoints: TraversePoint[] = [];

    let cumLength = 0;
    let adjN = 0;
    let adjE = 0;

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const dist =
        call.type === 'curve'
          ? call.curve?.arcLength || call.curve?.chordDistance || 0
          : call.distance || 0;
      cumLength += dist;

      // Compass Rule: correction proportional to cumulative distance / total perimeter
      const proportion = cumLength / closure.perimeterLength;
      const corrN = -closure.errorNorthing * proportion;
      const corrE = -closure.errorEasting * proportion;

      const dN = corrN - adjN;
      const dE = corrE - adjE;
      adjN = corrN;
      adjE = corrE;

      adjustments.push({
        callId: call.callId,
        dN: Math.round(dN * 10000) / 10000,
        dE: Math.round(dE * 10000) / 10000,
      });

      if (closure.points[i]) {
        adjustedPoints.push({
          ...closure.points[i],
          adjustedNorthing:
            Math.round((closure.points[i].northing + corrN) * 1000) / 1000,
          adjustedEasting:
            Math.round((closure.points[i].easting + corrE) * 1000) / 1000,
        });
      }
    }

    return {
      ...closure,
      closureRatio: '1:∞',
      status: 'excellent',
      compassRuleApplied: true,
      adjustments,
      adjustedPoints,
    };
  }

  // ── Bearing to Azimuth ──────────────────────────────────────────────────

  private bearingToAzimuth(bearing: string): number {
    const m = bearing.match(
      /([NS])\s*(\d+)[°]\s*(\d+)['"]\s*(\d+)?['""]?\s*([EW])/i,
    );
    if (!m) return 0;

    const ns = m[1].toUpperCase();
    const ew = m[5].toUpperCase();
    const decimal =
      parseInt(m[2]) + parseInt(m[3]) / 60 + parseInt(m[4] || '0') / 3600;
    const decRad = (decimal * Math.PI) / 180;

    // Convert bearing to azimuth (north=0, clockwise)
    if (ns === 'N' && ew === 'E') return decRad;
    if (ns === 'S' && ew === 'E') return Math.PI - decRad;
    if (ns === 'S' && ew === 'W') return Math.PI + decRad;
    if (ns === 'N' && ew === 'W') return 2 * Math.PI - decRad;
    return 0;
  }
}
