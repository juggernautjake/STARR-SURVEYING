// worker/src/research/cross-source-acquisition.ts — the cross-source engine driver (plan A7).
//
// Composes the whole engine into one call: DISCOVER what every free and paid source offers (A1) →
// MATCH the same document across sources (A2) → DECIDE the cheapest source per document (A3, free when
// available, buy only paid-exclusive within budget/priority) → EXECUTE (A4, free capture + real
// TexasFile buy). Fired EARLY (from `onPropertyIdentified`), so the paid buy happens before the run is
// cut short — while still never paying for what a free source already has (the C5 anti-waste rule,
// preserved per-document instead of globally). The per-source search and the capture/buy effects are
// injected, so the driver is unit-tested with fakes and wired to the real adapters in index.ts.

import { discoverAcrossSources, type SourceSearchFn, type DiscoveryTarget, type ManifestEntry, type SourceSearchOutcome } from './cross-source-discovery.js';
import { clusterEntries, type SamenessJudge } from './cross-source-match.js';
import { planAcquisition } from './cross-source-acquire-plan.js';
import { executeAcquisitionPlan, type FreeCaptureFn, type PurchaseFn, type AcquireResult } from './cross-source-acquire.js';
import type { SelectionWant } from './selection-wants.js';

export interface CrossSourceAcquisitionInput {
  county: string;
  /** The checklist wants (plats/deeds/easements) that scope which sources are searched. */
  wants: SelectionWant[];
  /** What the run knows to search each source by (owner, subdivision, instrument, vol/page, …). */
  target: DiscoveryTarget;
  /** Per-source search — dispatches on `source.source.id` to the right adapter. */
  search: SourceSearchFn;
  capture: FreeCaptureFn;
  purchase: PurchaseFn;
  paidBudgetUsd: number;
  paidEnabled?: boolean;
  judge?: SamenessJudge;
  log?: (message: string) => void;
}

export interface CrossSourceAcquisitionResult extends AcquireResult {
  /** Everything discovered, for the A6 source-comparison UI. */
  manifest: ManifestEntry[];
  /** Distinct documents after cross-source matching. */
  clusters: number;
  searched: SourceSearchOutcome[];
  /** Paid spend the plan intended (executor spend may differ on real page counts). */
  plannedPaidUsd: number;
}

/**
 * Run the whole cross-source engine end to end and return the acquisition outcome plus the manifest
 * the UI shows. Free-available documents are captured free; only paid-exclusive documents are bought,
 * in priority order within the paid budget.
 */
export async function runCrossSourceAcquisition(
  input: CrossSourceAcquisitionInput,
): Promise<CrossSourceAcquisitionResult> {
  const log = input.log ?? (() => {});

  const discovery = await discoverAcrossSources(input.county, input.wants, input.target, input.search, {
    paidEnabled: input.paidEnabled,
    log,
  });
  const clusters = await clusterEntries(discovery.entries, input.judge);
  const plan = planAcquisition(clusters, { paidBudgetUsd: input.paidBudgetUsd, paidEnabled: input.paidEnabled });

  const freePlanned = plan.actions.filter((a) => a.kind === 'free_capture').length;
  const paidPlanned = plan.actions.filter((a) => a.kind === 'purchase').length;
  log(`Cross-source: ${discovery.entries.length} listing(s) across ${discovery.searched.length} source(s) → ${clusters.length} document(s); plan: ${freePlanned} free, ${paidPlanned} paid ($${plan.plannedPaidUsd}), ${plan.skippedOverBudget} over budget.`);

  const result = await executeAcquisitionPlan(plan, {
    capture: input.capture,
    purchase: input.purchase,
    paidBudgetUsd: input.paidBudgetUsd,
    log,
  });

  return {
    ...result,
    manifest: discovery.entries,
    clusters: clusters.length,
    searched: discovery.searched,
    plannedPaidUsd: plan.plannedPaidUsd,
  };
}
