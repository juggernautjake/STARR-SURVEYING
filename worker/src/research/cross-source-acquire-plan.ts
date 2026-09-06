// worker/src/research/cross-source-acquire-plan.ts — cheapest-source-per-document decision (plan A3).
//
// Given the clustered manifest (A2 — one cluster per real document, with every source that offers it),
// decide HOW to get each document: free-capture it when any free source has it; purchase it only when
// it is paid-exclusive, and then only within the paid budget and in survey priority order
// (most-recent plat → most-recent deed → the rest). Every document gets an explicit decision + reason,
// which A6 surfaces as the "detailed analysis of what all the sources provide". Pure, unit-tested.

import { hasFreeSource, cheapestSource, type DocumentCluster } from './cross-source-match.js';
import type { ManifestEntry } from './cross-source-discovery.js';

export type AcquisitionAction =
  | { kind: 'free_capture'; cluster: DocumentCluster; source: ManifestEntry; costUsd: 0; reason: string }
  | { kind: 'purchase'; cluster: DocumentCluster; source: ManifestEntry; costUsd: number; reason: string }
  | { kind: 'skip'; cluster: DocumentCluster; costUsd: 0; reason: string };

export interface AcquisitionPlan {
  actions: AcquisitionAction[];
  /** Total planned paid spend, ≤ the paid budget. */
  plannedPaidUsd: number;
  /** Documents that would have been bought but did not fit the budget. */
  skippedOverBudget: number;
}

export interface AcquirePlanOptions {
  /** The paid (TexasFile) budget for this run. Purchases stop when it is exhausted. */
  paidBudgetUsd: number;
  /** When false, paid-exclusive documents are skipped, not bought (a free-only run). Default true. */
  paidEnabled?: boolean;
}

/** Survey priority tier: plats first, then deeds, then easements, then anything else. */
export function priorityTier(docType: string): number {
  const t = docType.toLowerCase();
  if (t.includes('plat')) return 0;
  if (t.includes('deed')) return 1;
  if (t.includes('easement')) return 2;
  return 3;
}

function dateVal(raw?: string): number {
  if (!raw) return -Infinity;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : -Infinity;
}

/** The cheapest PAID source for a cluster (used for a paid-exclusive document). */
export function cheapestPaidSource(c: DocumentCluster): ManifestEntry | null {
  const paid = c.sources.filter((s) => s.kind === 'paid' && s.canPurchase);
  if (paid.length === 0) return null;
  return [...paid].sort((a, b) => a.unitCostUsd - b.unitCostUsd)[0];
}

/** The cheapest FREE source for a cluster (used for a document a free source has). */
export function cheapestFreeSource(c: DocumentCluster): ManifestEntry | null {
  const free = c.sources.filter((s) => s.kind === 'free' && s.canFreeCapture);
  if (free.length === 0) return null;
  return [...free].sort((a, b) => a.unitCostUsd - b.unitCostUsd)[0];
}

export interface LegibilityRebuy {
  rebuy: boolean;
  source: ManifestEntry | null;
  reason: string;
}

/**
 * Legibility override (plan A5, owner 2026-09-05): after a document is captured FREE, decide whether
 * to buy the paid copy because the free one is unreadable. Re-buy only when the free capture scores
 * BELOW the legibility threshold AND a paid source in the cluster has the document AND its cost fits
 * the remaining paid budget. `freeReadability` is 0..1, higher = more legible.
 */
export function decideLegibilityRebuy(
  cluster: DocumentCluster,
  freeReadability: number,
  opts: { legibilityThreshold: number; remainingBudgetUsd: number },
): LegibilityRebuy {
  if (freeReadability >= opts.legibilityThreshold) {
    return { rebuy: false, source: null, reason: `free copy is legible (${freeReadability.toFixed(2)})` };
  }
  const paid = cheapestPaidSource(cluster);
  if (!paid) {
    return { rebuy: false, source: null, reason: 'free copy illegible, but no paid source has it' };
  }
  if (paid.unitCostUsd > opts.remainingBudgetUsd) {
    return {
      rebuy: false,
      source: null,
      reason: `free copy illegible, but the paid copy ($${paid.unitCostUsd} on ${paid.sourceId}) is over the remaining $${opts.remainingBudgetUsd.toFixed(2)} budget`,
    };
  }
  return {
    rebuy: true,
    source: paid,
    reason: `free copy illegible (${freeReadability.toFixed(2)} < ${opts.legibilityThreshold}) — buy the paid copy from ${paid.sourceId}`,
  };
}

/**
 * Decide the acquisition action for every clustered document. Free-available documents are captured
 * free; paid-exclusive documents are bought in priority order (plat → most-recent deed → rest) until
 * the paid budget is exhausted, after which the remaining paid-only documents are skipped with a
 * reason. Never plans a purchase for a document a free source already has.
 */
export function planAcquisition(clusters: DocumentCluster[], opts: AcquirePlanOptions): AcquisitionPlan {
  const paidEnabled = opts.paidEnabled !== false;
  const actions: AcquisitionAction[] = [];

  const freeAvailable = clusters.filter((c) => hasFreeSource(c));
  const paidOnly = clusters.filter((c) => !hasFreeSource(c));

  // Free-available documents: capture from the best free source. Cheapest overall is a free source
  // here (the cluster has one), so `cheapestSource` picks it.
  for (const c of freeAvailable) {
    const src = cheapestFreeSource(c) ?? cheapestSource(c)!;
    actions.push({
      kind: 'free_capture',
      cluster: c,
      source: src,
      costUsd: 0,
      reason: `free — available on ${src.sourceId}`,
    });
  }

  // Paid-exclusive documents: buy in priority order within the budget.
  const ranked = [...paidOnly].sort((a, b) => {
    const ta = priorityTier(a.docType);
    const tb = priorityTier(b.docType);
    if (ta !== tb) return ta - tb;
    return dateVal(b.recordingDate) - dateVal(a.recordingDate); // most-recent first within a tier
  });

  let spent = 0;
  let skippedOverBudget = 0;
  for (const c of ranked) {
    const src = cheapestPaidSource(c);
    if (!paidEnabled || !src) {
      actions.push({
        kind: 'skip',
        cluster: c,
        costUsd: 0,
        reason: !paidEnabled ? 'paid documents are off for this run' : 'no acquirable source',
      });
      continue;
    }
    if (spent + src.unitCostUsd > opts.paidBudgetUsd) {
      skippedOverBudget += 1;
      actions.push({
        kind: 'skip',
        cluster: c,
        costUsd: 0,
        reason: `paid-only ($${src.unitCostUsd} on ${src.sourceId}) — over the $${opts.paidBudgetUsd} budget`,
      });
      continue;
    }
    spent += src.unitCostUsd;
    actions.push({
      kind: 'purchase',
      cluster: c,
      source: src,
      costUsd: src.unitCostUsd,
      reason: `paid-only — buy from ${src.sourceId} ($${src.unitCostUsd})`,
    });
  }

  return { actions, plannedPaidUsd: spent, skippedOverBudget };
}
