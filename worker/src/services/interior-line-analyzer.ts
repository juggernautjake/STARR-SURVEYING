// worker/src/services/interior-line-analyzer.ts — Phase 4 Step 4
// Verifies that every shared boundary between two lots is consistent from both sides.
// If Lot 1's southern call says S 04°37'58" E, 275.92' then Lot 2's northern call
// must be the reverse: N 04°37'58" W, 275.92'.
//
// Spec §4.5 — Interior Line Analysis

import type { BoundaryCall } from '../types/index.js';
import type { InteriorLine } from '../types/subdivision.js';

/** Minimal lot representation used for interior line analysis */
export interface AnalyzableLot {
  lotId: string;
  name: string;
  boundaryCalls: BoundaryCall[];
  curves: BoundaryCall[];
}

export class InteriorLineAnalyzer {

  analyzeInteriorLines(lots: AnalyzableLot[]): InteriorLine[] {
    const lines: InteriorLine[] = [];
    const processedPairs = new Set<string>();

    for (let i = 0; i < lots.length; i++) {
      for (let j = i + 1; j < lots.length; j++) {
        const lotA = lots[i];
        const lotB = lots[j];
        const pairKey = `${lotA.lotId}__${lotB.lotId}`;
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        const shared = this.findSharedCalls(lotA, lotB);
        for (const s of shared) {
          lines.push(s);
        }
      }
    }

    return lines;
  }

  private findSharedCalls(lotA: AnalyzableLot, lotB: AnalyzableLot): InteriorLine[] {
    const results: InteriorLine[] = [];
    const allCallsA = [...lotA.boundaryCalls, ...lotA.curves];
    const allCallsB = [...lotB.boundaryCalls, ...lotB.curves];

    // Strategy 1: Match by "along" descriptor referencing the other lot
    for (const callA of allCallsA) {
      if (!callA.along) continue;
      const alongUpper = callA.along.toUpperCase();

      const lotBNames = [lotB.name.toUpperCase(), lotB.lotId.toUpperCase()];
      const referencesB = lotBNames.some((n) => alongUpper.includes(n));

      if (referencesB) {
        const matchingCallB = this.findReverseCall(callA, allCallsB);
        results.push(this.buildInteriorLine(lotA.lotId, lotB.lotId, callA, matchingCallB));
      }
    }

    // Strategy 2: Match by reverse bearing + similar distance (only if strategy 1 found nothing)
    if (results.length === 0) {
      for (const callA of allCallsA) {
        if (!callA.bearing) continue;

        for (const callB of allCallsB) {
          if (!callB.bearing) continue;

          const isReverse = this.areBearingsReverse(
            callA.bearing.raw,
            callB.bearing.raw,
            1.0,
          );
          const distA = callA.distance?.value ?? 0;
          const distB = callB.distance?.value ?? 0;
          const isSimilarDist = Math.abs(distA - distB) < 2.0;

          if (isReverse && isSimilarDist) {
            const existingId = `${lotA.lotId}_${lotB.lotId}`;
            if (!results.some((r) => r.lineId.startsWith(existingId))) {
              results.push(this.buildInteriorLine(lotA.lotId, lotB.lotId, callA, callB));
            }
          }
        }
      }
    }

    return results;
  }

  private findReverseCall(
    targetCall: BoundaryCall,
    candidates: BoundaryCall[],
  ): BoundaryCall | null {
    for (const c of candidates) {
      if (!targetCall.bearing || !c.bearing) continue;

      const isReverse = this.areBearingsReverse(
        targetCall.bearing.raw,
        c.bearing.raw,
        1.0,
      );
      const distA = targetCall.distance?.value ?? 0;
      const distB = c.distance?.value ?? 0;
      const isSimilarDist = Math.abs(distA - distB) < 5.0;

      if (isReverse && isSimilarDist) return c;
    }
    return null;
  }

  private buildInteriorLine(
    lotAId: string,
    lotBId: string,
    callA: BoundaryCall,
    callB: BoundaryCall | null,
  ): InteriorLine {
    const lineId = `${lotAId}_${lotBId}_shared_${callA.sequence}`;

    let bearingComparison: InteriorLine['bearingComparison'] = null;
    let distanceComparison: InteriorLine['distanceComparison'] = null;
    let overallStatus: InteriorLine['overallStatus'] = 'missing';
    const notes: string[] = [];

    if (callA.bearing && callB?.bearing) {
      const reversedB = this.reverseBearing(callB.bearing.raw);
      const angularDiff = this.bearingDifferenceDeg(callA.bearing.raw, reversedB);

      let bearingStatus: 'match' | 'close' | 'marginal' | 'discrepancy';
      if (angularDiff <= 0.00833) bearingStatus = 'match';           // ≤ 30 seconds
      else if (angularDiff <= 0.0833) bearingStatus = 'close';       // ≤ 5 minutes
      else if (angularDiff <= 0.5) bearingStatus = 'marginal';       // ≤ 30 minutes
      else bearingStatus = 'discrepancy';

      bearingComparison = {
        fromA: callA.bearing.raw,
        fromB: callB.bearing.raw,
        fromBReversed: reversedB,
        angularDifference: angularDiff,
        status: bearingStatus,
      };

      const distA = callA.distance?.value ?? 0;
      const distB = callB.distance?.value ?? 0;
      const distDiff = Math.abs(distA - distB);

      let distStatus: 'match' | 'close' | 'marginal' | 'discrepancy';
      if (distDiff <= 0.05) distStatus = 'match';
      else if (distDiff <= 0.5) distStatus = 'close';
      else if (distDiff <= 2.0) distStatus = 'marginal';
      else distStatus = 'discrepancy';

      distanceComparison = {
        fromA: distA,
        fromB: distB,
        difference: distDiff,
        status: distStatus,
      };

      // Determine overall status
      if (bearingStatus === 'match' && distStatus === 'match') overallStatus = 'verified';
      else if (bearingStatus !== 'discrepancy' && distStatus !== 'discrepancy') overallStatus = 'close_match';
      else if (bearingStatus === 'discrepancy' || distStatus === 'discrepancy') overallStatus = 'discrepancy';
      else overallStatus = 'marginal';

      if (overallStatus === 'discrepancy') {
        notes.push(
          `Interior line discrepancy: Lot A says ${callA.bearing.raw} ${distA}', ` +
          `Lot B says ${callB.bearing.raw} ${distB}' (reversed: ${reversedB}). ` +
          `Angular diff: ${(angularDiff * 60).toFixed(1)} minutes, ` +
          `distance diff: ${distDiff.toFixed(2)}'`,
        );
      }
    } else if (callA.bearing && !callB) {
      overallStatus = 'one_sided';
      notes.push(`Only one side has data for this shared boundary (from ${lotAId})`);
    }

    return {
      lineId,
      lotA: lotAId,
      lotB: lotBId,
      callFromA: callA,
      callFromB: callB ?? undefined,
      bearingComparison,
      distanceComparison,
      overallStatus,
      notes,
    };
  }

  // ═══════════════════════ BEARING MATH ═══════════════════════

  parseBearing(bearing: string): {
    quadrant: string;
    degrees: number;
    minutes: number;
    seconds: number;
    decimal: number;
  } | null {
    const match = bearing.match(
      /([NS])\s*(\d+)[°]\s*(\d+)['"]\s*(\d+)?['""]?\s*([EW])/i,
    );
    if (!match) return null;

    const deg = parseInt(match[2]);
    const min = parseInt(match[3]);
    const sec = parseInt(match[4] || '0');
    const decimal = deg + min / 60 + sec / 3600;

    return {
      quadrant: `${match[1].toUpperCase()}${match[5].toUpperCase()}`,
      degrees: deg,
      minutes: min,
      seconds: sec,
      decimal,
    };
  }

  reverseBearing(bearing: string): string {
    const parsed = this.parseBearing(bearing);
    if (!parsed) return bearing;

    const reverseNS = parsed.quadrant[0] === 'N' ? 'S' : 'N';
    const reverseEW = parsed.quadrant[1] === 'E' ? 'W' : 'E';

    return `${reverseNS} ${String(parsed.degrees).padStart(2, '0')}°${String(parsed.minutes).padStart(2, '0')}'${String(parsed.seconds).padStart(2, '0')}" ${reverseEW}`;
  }

  areBearingsReverse(a: string, b: string, toleranceDeg: number): boolean {
    const parsedA = this.parseBearing(a);
    const parsedB = this.parseBearing(b);
    if (!parsedA || !parsedB) return false;

    // Check quadrant is opposite
    const aQuad = parsedA.quadrant;
    const bQuad = parsedB.quadrant;
    const isOppositeNS = aQuad[0] !== bQuad[0];
    const isOppositeEW = aQuad[1] !== bQuad[1];
    if (!isOppositeNS || !isOppositeEW) return false;

    // Check angular values are similar
    const diff = Math.abs(parsedA.decimal - parsedB.decimal);
    return diff <= toleranceDeg;
  }

  bearingDifferenceDeg(a: string, b: string): number {
    const parsedA = this.parseBearing(a);
    const parsedB = this.parseBearing(b);
    if (!parsedA || !parsedB) return 999;
    return Math.abs(parsedA.decimal - parsedB.decimal);
  }
}
