// worker/src/services/reconciliation-algorithm.ts — Phase 7 Step 3
// Selects the best bearing and distance for each call from weighted readings.
// Uses weighted consensus, authoritative override, or single-source fallback.
//
// Spec §7.5 — Reconciliation Algorithm

import type {
  ReadingSet,
  WeightedReading,
  ReconciledCall,
  ReconciliationMethod,
} from '../types/reconciliation.js';

// ── Reconciliation Algorithm ────────────────────────────────────────────────

export class ReconciliationAlgorithm {

  reconcileCall(
    set: ReadingSet,
    weightedReadings: WeightedReading[],
  ): ReconciledCall {
    const previousConfidence = this.computePreviousConfidence(set);

    // Step 1: Determine type (straight vs curve)
    const resolvedType = this.resolveType(weightedReadings);

    // Step 2: Handle curves separately
    if (resolvedType === 'curve') {
      return this.reconcileCurve(set, weightedReadings, previousConfidence);
    }

    // Step 3: Reconcile straight line — bearing and distance independently
    const straightReadings = weightedReadings.filter(
      (r) => r.type === 'straight' && r.bearing,
    );

    if (straightReadings.length === 0) {
      return this.buildUnresolvedCall(set, weightedReadings, previousConfidence);
    }

    if (straightReadings.length === 1) {
      return this.buildSingleSourceCall(
        set,
        straightReadings[0],
        previousConfidence,
      );
    }

    // Multiple readings — check for authoritative override
    const authoritative = straightReadings.filter(
      (r) => r.source === 'txdot_row',
    );
    if (authoritative.length > 0) {
      return this.buildAuthoritativeCall(
        set,
        authoritative[0],
        weightedReadings,
        previousConfidence,
      );
    }

    // Weighted consensus
    return this.buildConsensusCall(set, straightReadings, previousConfidence);
  }

  // ── Type Resolution ─────────────────────────────────────────────────────

  private resolveType(readings: WeightedReading[]): 'straight' | 'curve' {
    // Authoritative always wins
    const authType = readings.find((r) => r.source === 'txdot_row')?.type;
    if (authType) return authType;

    const curveWeight = readings
      .filter((r) => r.type === 'curve')
      .reduce((s, r) => s + r.weight, 0);
    const straightWeight = readings
      .filter((r) => r.type === 'straight')
      .reduce((s, r) => s + r.weight, 0);

    return curveWeight > straightWeight ? 'curve' : 'straight';
  }

  // ── Weighted Consensus ──────────────────────────────────────────────────

  private buildConsensusCall(
    set: ReadingSet,
    readings: WeightedReading[],
    previousConfidence: number,
  ): ReconciledCall {
    // Compute weighted average bearing (in decimal degrees, then convert back to DMS).
    // Guard against readings with no parseable bearing (e.g., interior lines
    // that only have a distance) — filter them out before computing the average.
    const bearingValues = readings
      .map((r) => ({
        decimal: this.bearingToDecimal(r.bearing!),
        weight: r.weight,
        parsed: this.parseBearing(r.bearing!),
      }))
      .filter((b) => b.parsed !== null && isFinite(b.decimal));

    // Use the dominant reading's quadrant as the output quadrant.
    // If no parseable bearing exists, fall back to 'NE' (will be flagged as unresolved).
    const quadrant =
      (bearingValues[0]?.parsed?.ns || 'N') +
      (bearingValues[0]?.parsed?.ew || 'E');

    // Weighted average of decimal bearing degrees.
    // Guard against division by zero when all weights are 0.
    const totalW = bearingValues.reduce((s, b) => s + b.weight, 0);
    const avgDecimal =
      totalW > 0
        ? bearingValues.reduce((s, b) => s + b.decimal * b.weight, 0) / totalW
        : null;

    // Convert back to DMS — null if we had no valid bearings
    const reconciledBearing =
      avgDecimal != null && isFinite(avgDecimal)
        ? this.decimalToBearingDMS(avgDecimal, quadrant)
        : null;

    // Weighted average distance (all readings already normalized to feet).
    const distReadings = readings.filter((r) => r.distance != null && isFinite(r.distance!));
    const totalDW = distReadings.reduce((s, r) => s + r.weight, 0);
    const avgDistance =
      totalDW > 0
        ? distReadings.reduce((s, r) => s + r.distance! * r.weight, 0) / totalDW
        : null;

    // Compute spreads — guard against empty arrays
    const bearingSpreadDeg =
      bearingValues.length > 1
        ? Math.max(...bearingValues.map((b) => b.decimal)) -
          Math.min(...bearingValues.map((b) => b.decimal))
        : 0;
    const distanceSpread =
      distReadings.length > 1
        ? Math.max(...distReadings.map((r) => r.distance!)) -
          Math.min(...distReadings.map((r) => r.distance!))
        : 0;

    // Determine agreement strength
    let agreement: 'strong' | 'moderate' | 'weak';
    if (bearingSpreadDeg < 0.01 && distanceSpread < 0.5) agreement = 'strong';
    else if (bearingSpreadDeg < 0.1 && distanceSpread < 2.0)
      agreement = 'moderate';
    else agreement = 'weak';

    // Dominant source = highest weight
    const dominant = [...readings].sort((a, b) => b.weight - a.weight)[0];

    // Final confidence: boosted by number of agreeing sources.
    // Use totalW for bearing readings since that's what we averaged over.
    const weightDenom = totalW > 0 ? totalW : 1;
    const sourceCount = new Set(readings.map((r) => r.source)).size;
    const agreementBonus = Math.min(25, sourceCount * 5);
    const finalConfidence = Math.min(
      98,
      Math.round(
        readings.reduce((s, r) => s + r.confidence * r.weight, 0) / weightDenom +
          agreementBonus,
      ),
    );

    return {
      callId: set.callId,
      reconciledBearing,
      reconciledDistance:
        avgDistance != null ? Math.round(avgDistance * 100) / 100 : null,
      unit: 'feet',
      type: 'straight',
      along: set.along,
      reconciliation: {
        method: 'weighted_consensus',
        bearingSpread: this.formatDMS(bearingSpreadDeg),
        distanceSpread: Math.round(distanceSpread * 100) / 100,
        dominantSource: dominant.source,
        agreement,
        notes: `${readings.length} readings from ${sourceCount} sources, spread: ${this.formatDMS(bearingSpreadDeg)} bearing, ${distanceSpread.toFixed(2)}' distance`,
      },
      readings,
      finalConfidence,
      previousConfidence,
      confidenceBoost: finalConfidence - previousConfidence,
      symbol: finalConfidence >= 85 ? '✓' : finalConfidence >= 65 ? '~' : '?',
    };
  }

  // ── Authoritative Override ──────────────────────────────────────────────

  private buildAuthoritativeCall(
    set: ReadingSet,
    auth: WeightedReading,
    allReadings: WeightedReading[],
    previousConfidence: number,
  ): ReconciledCall {
    const finalConfidence = Math.min(98, auth.confidence + 5);
    return {
      callId: set.callId,
      reconciledBearing: auth.bearing,
      reconciledDistance: auth.distance,
      unit: 'feet',
      type: auth.type,
      along: set.along,
      reconciledCurve: auth.curve
        ? {
            radius: auth.curve.radius,
            arcLength: auth.curve.arcLength,
            delta: auth.curve.delta,
            chordBearing: auth.curve.chordBearing,
            chordDistance: auth.curve.chordDistance,
            direction: auth.curve.direction,
          }
        : undefined,
      reconciliation: {
        method: 'authoritative_override',
        bearingSpread: 'n/a',
        distanceSpread: 0,
        dominantSource: auth.source,
        agreement: 'resolved_conflict',
        notes: `Authoritative source (${auth.sourceDetail}) overrides ${allReadings.length - 1} other readings`,
      },
      readings: allReadings,
      finalConfidence,
      previousConfidence,
      confidenceBoost: finalConfidence - previousConfidence,
      symbol: '✓',
    };
  }

  // ── Single Source ───────────────────────────────────────────────────────

  private buildSingleSourceCall(
    set: ReadingSet,
    reading: WeightedReading,
    previousConfidence: number,
  ): ReconciledCall {
    return {
      callId: set.callId,
      reconciledBearing: reading.bearing,
      reconciledDistance: reading.distance,
      unit: 'feet',
      type: reading.type,
      along: set.along,
      reconciledCurve: reading.curve
        ? {
            radius: reading.curve.radius,
            arcLength: reading.curve.arcLength,
            delta: reading.curve.delta,
            chordBearing: reading.curve.chordBearing,
            chordDistance: reading.curve.chordDistance,
            direction: reading.curve.direction,
          }
        : undefined,
      reconciliation: {
        method: 'single_source',
        bearingSpread: 'n/a',
        distanceSpread: 0,
        dominantSource: reading.source,
        agreement: 'weak',
        notes: `Only one source available: ${reading.sourceDetail}`,
      },
      readings: [reading],
      finalConfidence: reading.confidence,
      previousConfidence,
      confidenceBoost: reading.confidence - previousConfidence,
      symbol:
        reading.confidence >= 85
          ? '✓'
          : reading.confidence >= 65
            ? '~'
            : '?',
    };
  }

  // ── Unresolved ──────────────────────────────────────────────────────────

  private buildUnresolvedCall(
    set: ReadingSet,
    readings: WeightedReading[],
    previousConfidence: number,
  ): ReconciledCall {
    return {
      callId: set.callId,
      reconciledBearing: null,
      reconciledDistance: null,
      unit: 'feet',
      type: 'straight',
      along: set.along,
      reconciliation: {
        method: 'unresolved',
        bearingSpread: 'n/a',
        distanceSpread: 0,
        dominantSource: 'none',
        agreement: 'weak',
        notes: `Cannot reconcile ${readings.length} readings — conflicting types or insufficient data`,
      },
      readings,
      finalConfidence: 20,
      previousConfidence,
      confidenceBoost: 20 - previousConfidence,
      symbol: '✗',
    };
  }

  // ── Curve Reconciliation ────────────────────────────────────────────────

  private reconcileCurve(
    set: ReadingSet,
    readings: WeightedReading[],
    previousConfidence: number,
  ): ReconciledCall {
    const curveReadings = readings.filter(
      (r) => r.type === 'curve' && r.curve,
    );

    const best = [...curveReadings].sort((a, b) => b.weight - a.weight)[0];
    if (!best) {
      return this.buildUnresolvedCall(set, readings, previousConfidence);
    }

    // Cross-reference: if TxDOT confirms radius, use that
    const txdotCurve = curveReadings.find((r) => r.source === 'txdot_row');
    const platCurve = curveReadings.find((r) => r.source === 'plat_segment');

    const reconciledCurve = {
      radius:
        txdotCurve?.curve?.radius ||
        platCurve?.curve?.radius ||
        best.curve!.radius,
      arcLength:
        platCurve?.curve?.arcLength || best.curve?.arcLength,
      delta: platCurve?.curve?.delta || best.curve?.delta,
      chordBearing:
        platCurve?.curve?.chordBearing || best.curve?.chordBearing,
      chordDistance:
        platCurve?.curve?.chordDistance || best.curve?.chordDistance,
      direction: best.curve?.direction,
    };

    // Compute missing curve parameters
    this.fillCurveParameters(reconciledCurve);

    const sourceCount = new Set(curveReadings.map((r) => r.source)).size;
    const finalConfidence = Math.min(
      98,
      best.confidence + (sourceCount > 1 ? 10 : 0),
    );

    return {
      callId: set.callId,
      reconciledBearing: reconciledCurve.chordBearing || null,
      reconciledDistance: reconciledCurve.chordDistance || null,
      unit: 'feet',
      type: 'curve',
      along: set.along,
      reconciledCurve,
      reconciliation: {
        method: txdotCurve ? 'authoritative_override' : 'weighted_consensus',
        bearingSpread: 'n/a (curve)',
        distanceSpread: 0,
        dominantSource: txdotCurve?.source || best.source,
        agreement: txdotCurve
          ? 'resolved_conflict'
          : sourceCount > 1
            ? 'moderate'
            : 'weak',
        notes: `Curve reconciled from ${sourceCount} sources. R=${reconciledCurve.radius}', L=${reconciledCurve.arcLength || '?'}'`,
      },
      readings,
      finalConfidence,
      previousConfidence,
      confidenceBoost: finalConfidence - previousConfidence,
      symbol: finalConfidence >= 85 ? '✓' : '~',
    };
  }

  // ── Curve Parameter Fill ────────────────────────────────────────────────

  private fillCurveParameters(curve: {
    radius: number;
    arcLength?: number;
    delta?: string;
    chordBearing?: string;
    chordDistance?: number;
    direction?: string;
  }): void {
    const R = curve.radius;
    if (!R || R <= 0) return;

    // Given R + delta → compute L and chord
    if (curve.delta && !curve.arcLength) {
      const deltaRad = this.dmsToRadians(curve.delta);
      if (deltaRad) {
        curve.arcLength = Math.round(R * deltaRad * 100) / 100;
        curve.chordDistance =
          Math.round(2 * R * Math.sin(deltaRad / 2) * 100) / 100;
      }
    }

    // Given R + L → compute delta and chord
    if (curve.arcLength && !curve.delta) {
      const deltaRad = curve.arcLength / R;
      curve.delta = this.radiansToDMS(deltaRad);
      curve.chordDistance =
        Math.round(2 * R * Math.sin(deltaRad / 2) * 100) / 100;
    }

    // Given R + chord → compute delta and L
    if (curve.chordDistance && !curve.delta) {
      const halfDelta = Math.asin(curve.chordDistance / (2 * R));
      const deltaRad = 2 * halfDelta;
      curve.delta = this.radiansToDMS(deltaRad);
      curve.arcLength = Math.round(R * deltaRad * 100) / 100;
    }
  }

  // ── Bearing Math ────────────────────────────────────────────────────────

  private parseBearing(
    bearing: string,
  ): { ns: string; ew: string; deg: number; min: number; sec: number; decimal: number } | null {
    const m = bearing.match(
      /([NS])\s*(\d+)[°]\s*(\d+)['"]\s*(\d+)?['""]?\s*([EW])/i,
    );
    if (!m) return null;
    const deg = parseInt(m[2]);
    const min = parseInt(m[3]);
    const sec = parseInt(m[4] || '0');
    return {
      ns: m[1].toUpperCase(),
      ew: m[5].toUpperCase(),
      deg,
      min,
      sec,
      decimal: deg + min / 60 + sec / 3600,
    };
  }

  private bearingToDecimal(bearing: string): number {
    const p = this.parseBearing(bearing);
    return p ? p.decimal : 0;
  }

  private decimalToBearingDMS(decimal: number, quadrant: string): string {
    const deg = Math.floor(decimal);
    const minF = (decimal - deg) * 60;
    const min = Math.floor(minF);
    const sec = Math.round((minF - min) * 60);
    return `${quadrant[0]} ${String(deg).padStart(2, '0')}°${String(min).padStart(2, '0')}'${String(sec).padStart(2, '0')}" ${quadrant[1]}`;
  }

  private formatDMS(decDeg: number): string {
    const deg = Math.floor(decDeg);
    const minF = (decDeg - deg) * 60;
    const min = Math.floor(minF);
    const sec = Math.round((minF - min) * 60);
    return `${deg}°${String(min).padStart(2, '0')}'${String(sec).padStart(2, '0')}"`;
  }

  private dmsToRadians(dms: string): number | null {
    const m = dms.match(/(\d+)[°]\s*(\d+)['"]\s*(\d+)?/);
    if (!m) return null;
    const decimal =
      parseInt(m[1]) + parseInt(m[2]) / 60 + parseInt(m[3] || '0') / 3600;
    return (decimal * Math.PI) / 180;
  }

  private radiansToDMS(rad: number): string {
    const decDeg = (rad * 180) / Math.PI;
    return this.formatDMS(decDeg);
  }

  private computePreviousConfidence(set: ReadingSet): number {
    const platSegment = set.readings.find(
      (r) => r.source === 'plat_segment',
    );
    return platSegment?.confidence || 50;
  }
}
