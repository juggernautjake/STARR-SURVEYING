// worker/src/services/purchase-recommender.ts — Phase 8 Step 6
// Computes document purchase ROI based on confidence impact per dollar
// and generates a prioritized purchase list.
//
// Spec §8.6 — Document Purchase ROI Calculator

import type {
  DiscrepancyReport,
  CallConfidenceScore,
  PurchaseRecommendation,
} from '../types/confidence.js';

// ── Purchase Recommender ────────────────────────────────────────────────────

export class PurchaseRecommender {

  recommend(
    discrepancies: DiscrepancyReport[],
    callScores: Map<string, CallConfidenceScore>,
    knownDocuments: {
      instrument: string;
      type: string;
      source: string;
      pages: number;
    }[],
    currentOverallConfidence: number,
  ): PurchaseRecommendation[] {
    const recs: PurchaseRecommendation[] = [];

    // Rule 1: Unwatermarked plat is almost always the highest-ROI purchase
    const platDoc = knownDocuments.find((d) => d.type === 'plat');
    if (platDoc) {
      // Count how many calls are plat_segment with confidence < 80
      const lowConfPlatCalls = [...callScores.values()].filter(
        (cs) => cs.sources.includes('plat_segment') && cs.score < 80,
      );
      const pages = platDoc.pages || 2;
      const estCost = pages * 2; // ~$1-2 per page typical Kofile
      const confGain = Math.min(15, lowConfPlatCalls.length * 2);

      if (lowConfPlatCalls.length > 0) {
        recs.push({
          documentType: 'plat',
          instrument: platDoc.instrument,
          source: platDoc.source,
          estimatedCost: `$${estCost}-${estCost * 2}`,
          confidenceImpact: `+${confGain} overall`,
          callsImproved: lowConfPlatCalls.length,
          reason:
            'Unwatermarked plat resolves ALL watermark-ambiguous readings at once. Highest ROI purchase.',
          priority: 1,
          roi:
            lowConfPlatCalls.length > 0
              ? Math.round((confGain / estCost) * 10) / 10
              : 0,
        });
      }
    }

    // Rule 2: Adjacent deeds that resolve specific discrepancies
    const unresolvedDisc = discrepancies.filter(
      (d) => d.status === 'unresolved',
    );
    for (const disc of unresolvedDisc) {
      // Check if an adjacent deed purchase would help
      const adjacentSources = disc.readings.filter(
        (r) => r.source === 'adjacent_reversed',
      );
      if (adjacentSources.length === 0) {
        // No adjacent data yet — purchasing the adjacent deed would help
        const estCost = 6; // ~$4-8 typical
        const confGain =
          disc.severity === 'critical'
            ? 8
            : disc.severity === 'moderate'
              ? 5
              : 2;

        recs.push({
          documentType: 'deed',
          instrument: 'search_required',
          source: 'County Clerk',
          estimatedCost: '$4-8',
          confidenceImpact: `+${confGain} overall`,
          callsImproved: disc.affectedCalls.length,
          reason: `Resolves ${disc.severity} discrepancy: ${disc.title}`,
          // Priority derived from severity: critical=1, moderate=2, minor=3
          priority: disc.severity === 'critical' ? 1 : disc.severity === 'moderate' ? 2 : 3,
          roi: Math.round((confGain / estCost) * 10) / 10,
        });
      }
    }

    // Rule 3: Deed of trust / original deed if deed_extraction is missing
    const callsWithoutDeed = [...callScores.values()].filter(
      (cs) =>
        !cs.sources.includes('deed_extraction') && cs.score < 70,
    );
    if (callsWithoutDeed.length >= 3) {
      const estCost = 6;
      const confGain = Math.min(10, callsWithoutDeed.length);
      recs.push({
        documentType: 'deed',
        instrument: 'search_required',
        source: 'County Clerk',
        estimatedCost: '$4-8',
        confidenceImpact: `+${confGain} overall`,
        callsImproved: callsWithoutDeed.length,
        reason:
          'Subject property deed provides independent metes & bounds description for cross-validation.',
        priority: 3,
        roi: Math.round((confGain / estCost) * 10) / 10,
      });
    }

    // Sort by ROI (highest first)
    recs.sort((a, b) => b.roi - a.roi);

    // Re-assign priorities based on ROI
    for (let i = 0; i < recs.length; i++) {
      recs[i].priority = i + 1;
    }

    // De-duplicate by instrument (keep highest ROI)
    const seen = new Set<string>();
    const deduped: PurchaseRecommendation[] = [];
    for (const rec of recs) {
      const key = `${rec.documentType}:${rec.instrument}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(rec);
      }
    }

    return deduped;
  }
}
