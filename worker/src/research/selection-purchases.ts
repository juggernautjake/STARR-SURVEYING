// worker/src/research/selection-purchases.ts — turn the checklist into TexasFile purchase targets (W2)
//
// The Gather run's checklist (S1/S2) says WHAT to fetch. This converts the PAID selection wants
// (plats/deeds/easements — the free map/GIS captures are excluded) into the `PurchaseRecommendation`
// shape the purchase orchestrator already buys, so the checklist DRIVES what TexasFile is asked for,
// instead of the run buying only what a discrepancy happened to flag. Plats/drawings are prioritised,
// then most-recent deeds — the owner's order.
//
// A want with a known instrument (a most-recent deed we already located) buys that document; a want
// with only a search (e.g. "most recent plat" by subdivision) carries `instrument: 'search_required'`
// and the search keys, which the TexasFile buyer resolves (W4). Pure so the mapping is unit-tested.

import { type SelectionWant, paidWants } from './selection-wants.js';
import { estimateItemCostUsd } from './gather-cost-estimate.js';
import { purchaseTier } from '../services/purchase-recommender.js';
import type { PurchaseRecommendation } from '../types/confidence.js';

export interface SelectionPurchaseContext {
  county?: string;
  /** Grantor/grantee or owner name to search TexasFile by. */
  ownerName?: string;
  subdivision?: string;
  lot?: string;
  /** Documents already located this run, so a "most recent X" want can buy the exact instrument. */
  knownDocuments?: Array<{ type: string; instrument?: string; book?: string; page?: string; recordingDate?: string }>;
}

/** The most-recent known document of a type (by recording date), for pinning a "recent" want. */
function mostRecentKnown(ctx: SelectionPurchaseContext, docType: string) {
  const matches = (ctx.knownDocuments ?? []).filter((d) => (d.type ?? '').toLowerCase().includes(docType));
  if (matches.length === 0) return undefined;
  return matches.reduce((best, d) => (dateVal(d.recordingDate) > dateVal(best.recordingDate) ? d : best));
}

function dateVal(raw?: string): number {
  if (!raw) return -Infinity;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : -Infinity;
}

/**
 * Convert the run's selection wants into TexasFile purchase recommendations, plats first. Only paid
 * wants (deed/easement/plat) become purchases; map/GIS wants are free captures handled elsewhere.
 */
export function wantsToPurchaseRecommendations(
  wants: SelectionWant[],
  ctx: SelectionPurchaseContext = {},
): PurchaseRecommendation[] {
  const recs: PurchaseRecommendation[] = [];
  for (const w of paidWants(wants)) {
    const docType = w.documentType; // 'deed' | 'easement' | 'plat'
    const known = w.scope === 'recent' ? mostRecentKnown(ctx, docType) : undefined;
    const est = estimateItemCostUsd(docType, w.scope, true);
    recs.push({
      documentType: (docType === 'plat' || docType === 'deed' || docType === 'easement' ? docType : 'deed'),
      // A located most-recent instrument buys that document; otherwise a search TexasFile must run.
      instrument: known?.instrument ?? 'search_required',
      source: 'texasfile',
      estimatedCost: `$${est}`,
      confidenceImpact: '',
      callsImproved: 0,
      reason: `Requested in this run's "what to find" list (${w.label}).`,
      // Plats/drawings before deeds before the rest — purchaseTier(0) for plats, 1 otherwise, then a
      // small nudge so a "most recent" want outranks an "all" sweep of the same type.
      priority: purchaseTier(docType) * 10 + (w.scope === 'recent' ? 0 : 1),
      roi: 1,
      county: ctx.county,
      book: known?.book,
      page: known?.page,
      recordingDate: known?.recordingDate,
    });
  }
  // Stable priority order (lower = sooner): plats, then deeds/easements; recent before all.
  return recs.sort((a, b) => a.priority - b.priority).map((r, i) => ({ ...r, priority: i + 1 }));
}
