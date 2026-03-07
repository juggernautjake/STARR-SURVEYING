// worker/src/services/source-weighting.ts — Phase 7 Step 2
// Assigns reliability weights to each reading based on source type,
// per-reading confidence, and survey hierarchy rules.
//
// Spec §7.4 — Source Reliability Weighting

import type {
  BoundaryReading,
  ReadingSource,
  ReadingSet,
  WeightedReading,
} from '../types/reconciliation.js';

// ── Base Reliability Weights (relative — sum doesn't need to equal 1) ─────

const BASE_WEIGHTS: Record<ReadingSource, number> = {
  txdot_row: 0.95,           // Government authoritative — nearly conclusive for road boundaries
  deed_extraction: 0.80,     // Typed text from deed — clearest source for property boundaries
  adjacent_reversed: 0.75,   // Independent measurement from neighbor's deed
  plat_segment: 0.65,        // OCR from watermarked plat — good but watermark degrades
  subdivision_interior: 0.60, // Interior line from another lot in the subdivision
  adjacent_chain: 0.45,      // Historical deed — may use old datum or different monuments
  plat_overview: 0.40,       // Full-plat overview — less precise than segment
  plat_geometric: 0.30,      // AI visual measurement — useful tiebreaker but imprecise
  county_road_default: 0.20, // Generic assumption — last resort
};

// ── Source Weighter ─────────────────────────────────────────────────────────

export class SourceWeighter {

  weightReadings(set: ReadingSet): WeightedReading[] {
    const weighted: WeightedReading[] = [];

    for (const reading of set.readings) {
      const baseWeight = BASE_WEIGHTS[reading.source] || 0.30;
      const confMultiplier = reading.confidence / 100;
      const adjustments: string[] = [];
      let finalWeight = baseWeight * confMultiplier;

      // ── Special Adjustments ──────────────────────────────────────────

      // If TxDOT says curve and this reading says straight (or vice versa), reduce weight
      if (set.hasAuthoritative && set.hasConflictingTypes) {
        const authoritativeType = set.readings
          .filter((r) => r.source === 'txdot_row')
          .map((r) => r.type)[0];

        if (
          authoritativeType &&
          reading.type !== authoritativeType &&
          reading.source !== 'txdot_row'
        ) {
          finalWeight *= 0.1;
          adjustments.push(
            `Type conflicts with TxDOT authoritative (${authoritativeType}) — weight reduced 90%`,
          );
        }
      }

      // Deed readings get a boost when they agree with plat
      if (reading.source === 'deed_extraction') {
        const platReadings = set.readings.filter(
          (r) => r.source === 'plat_segment',
        );
        const agreesWithPlat = platReadings.some((pr) => {
          if (!pr.bearing || !reading.bearing) return false;
          const diff = this.bearingDiffDeg(pr.bearing, reading.bearing);
          return diff !== null && diff < 0.01;
        });
        if (agreesWithPlat) {
          finalWeight *= 1.15;
          adjustments.push('Deed agrees with plat — boosted 15%');
        }
      }

      // Adjacent reversed gets a boost when confidence is high
      if (reading.source === 'adjacent_reversed' && reading.confidence >= 85) {
        finalWeight *= 1.10;
        adjustments.push('High-confidence adjacent match — boosted 10%');
      }

      // Geometric readings are only useful as tiebreakers.
      // Demote when 3+ other readings exist (i.e., 4+ total including this one)
      // so that imprecise visual measurements don't dominate the consensus.
      if (reading.source === 'plat_geometric') {
        const otherCount = set.readings.filter((r) => r.source !== 'plat_geometric').length;
        if (otherCount >= 3) {
          finalWeight *= 0.5;
          adjustments.push(
            'Geometric reading demoted — 3+ better sources available',
          );
        } else if (otherCount >= 1) {
          finalWeight *= 0.7;
          adjustments.push(
            'Geometric reading demoted — better sources available',
          );
        } else {
          adjustments.push(
            'Geometric reading used as tiebreaker — few other sources',
          );
        }
      }

      // Historical chain readings get reduced weight for old surveys
      if (reading.source === 'adjacent_chain') {
        finalWeight *= 0.7;
        adjustments.push(
          'Historical chain deed — potential datum or monument changes',
        );
      }

      // Unit normalization penalty for varas (conversion introduces error)
      if (reading.unit === 'varas') {
        finalWeight *= 0.90;
        adjustments.push('Vara conversion applied — slight precision reduction');
      }

      weighted.push({
        ...reading,
        weight: Math.max(0.01, Math.min(1.0, finalWeight)),
        baseWeight,
        confidenceMultiplier: confMultiplier,
        specialAdjustments: adjustments,
      });
    }

    // Normalize weights so they sum to 1
    const totalWeight = weighted.reduce((s, r) => s + r.weight, 0);
    if (totalWeight > 0) {
      for (const r of weighted) {
        r.weight /= totalWeight;
      }
    }

    return weighted;
  }

  private bearingDiffDeg(a: string, b: string): number | null {
    const pA = a.match(
      /([NS])\s*(\d+)[°]\s*(\d+)['"]\s*(\d+)?['""]?\s*([EW])/i,
    );
    const pB = b.match(
      /([NS])\s*(\d+)[°]\s*(\d+)['"]\s*(\d+)?['""]?\s*([EW])/i,
    );
    if (!pA || !pB) return null;
    if (pA[1].toUpperCase() !== pB[1].toUpperCase()) return null;
    if (pA[5].toUpperCase() !== pB[5].toUpperCase()) return null;

    const decA =
      parseInt(pA[2]) + parseInt(pA[3]) / 60 + parseInt(pA[4] || '0') / 3600;
    const decB =
      parseInt(pB[2]) + parseInt(pB[3]) / 60 + parseInt(pB[4] || '0') / 3600;
    return Math.abs(decA - decB);
  }
}
