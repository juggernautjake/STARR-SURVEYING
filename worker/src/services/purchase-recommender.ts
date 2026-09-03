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

/**
 * Which tier of the owner's requested order a document type belongs to — lower buys first.
 *
 * The same order `research/run-order.ts` states for the free work, applied to the money: drawings
 * and plats, then anything else. Kept as a function rather than a lookup so an unrecognised type
 * lands in the general tier instead of vanishing.
 */
export function purchaseTier(documentType: string): number {
  const t = (documentType ?? '').toLowerCase();
  // A plat, a recorded survey or a map of survey is the visual the rest of the research is read
  // against. `map of survey` is in here because the clerk classifier files it as `other` and it is
  // the single most useful document a surveyor can find — see `research/drawing-hunt.ts`.
  if (/\b(plat|survey|drawing|map)\b/.test(t)) return 0;
  return 1;
}

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
      /** Citation, carried through so the purchase step can tell whether we already hold this
       *  document under some other vendor's numbering (plan S-13). Optional because older callers
       *  do not supply it; a recommendation without it is bought rather than skipped. */
      county?: string;
      recordingDate?: string;
      book?: string;
      page?: string;
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
          // Rule 1 is the only rule with a real document behind it, so it is the only one that can
          // carry a citation. Rules 2 and 3 recommend a SEARCH, and a search has nothing to dedupe.
          county: platDoc.county,
          recordingDate: platDoc.recordingDate,
          book: platDoc.book,
          page: platDoc.page,
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

    // ── THE ORDER MONEY IS SPENT IN, WHEN THERE IS NOT ENOUGH OF IT (plan C4) ─────────────────
    //
    // > "Whenever we have the payment option turned on for kofile and texasfile or anything else,
    // >  I want the pipeline to start there and look for documents about the property, espeically
    // >  the drawings/cad maps/plats etc. Something visual to go off of"
    //
    // This sorted by ROI alone and then OVERWROTE `priority` with the ROI rank — so Rule 1's
    // `priority: 1` on the unwatermarked plat, written deliberately because "an unwatermarked plat
    // is almost always the highest-ROI purchase", was discarded two lines later by a number that
    // did not know what a plat was.
    //
    // That ordering is not academic. `DocumentPurchaseOrchestrator` spends in `priority` order and
    // stops at the ceiling, recording everything past it as `budget_exceeded`. So on a run whose
    // $25 could buy two documents, a deed with a marginally better computed ROI took the money and
    // the plat was skipped — the exact inverse of what the owner asked for, decided by a ratio
    // rather than by a judgement anyone made.
    //
    // Tiered now: the visual documents lead, and ROI orders WITHIN a tier. ROI still decides
    // between two plats and between two deeds; it no longer decides between a plat and a deed.
    recs.sort((a, b) => {
      const tierDiff = purchaseTier(a.documentType) - purchaseTier(b.documentType);
      if (tierDiff !== 0) return tierDiff;
      return b.roi - a.roi;
    });

    // Re-assign priorities to the order they will actually be bought in, so the number an operator
    // reads is the number the orchestrator obeys.
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
