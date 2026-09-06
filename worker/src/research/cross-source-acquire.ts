// worker/src/research/cross-source-acquire.ts — execute the acquisition plan (plan A4).
//
// A3 decided, per document, whether to free-capture it or buy it. This executes those decisions: it
// walks the plan, calls the injected free-capture or purchase effect for each action, tracks real
// paid spend against the budget (the plan's estimate can be under the true page count), and returns a
// per-document outcome plus the running manifest A6 surfaces. Purchases fire here — early in the run,
// as each decision is reached — so a stall or the 60-min cap cannot rob the run of a buy it already
// decided on. One document's failure never sinks the rest. Pure orchestration; the real capture/buy
// effects are injected, so it is unit-tested with fakes.

import type { AcquisitionAction, AcquisitionPlan } from './cross-source-acquire-plan.js';

/** Result of a single free capture. `ref` is the stored file/page reference for filing to Review. */
export interface CaptureOutcome {
  ok: boolean;
  ref?: string;
  error?: string;
}

/** Result of a single purchase. `costUsd` is the ACTUAL charge (page count × unit), which may differ
 *  from the plan's estimate; `notAvailable` is a genuine "the source did not have it" (distinct from a
 *  technical failure) so the caller could fall back to another source. */
export interface PurchaseOutcome {
  ok: boolean;
  ref?: string;
  costUsd: number;
  notAvailable?: boolean;
  error?: string;
}

export type FreeCaptureFn = (action: Extract<AcquisitionAction, { kind: 'free_capture' }>) => Promise<CaptureOutcome>;
export type PurchaseFn = (action: Extract<AcquisitionAction, { kind: 'purchase' }>, remainingBudgetUsd: number) => Promise<PurchaseOutcome>;

export interface AcquiredDoc {
  docType: string;
  via: 'free' | 'paid' | 'skipped';
  sourceId: string | null;
  costUsd: number;
  ok: boolean;
  ref?: string;
  reason: string;
  error?: string;
}

export interface AcquireResult {
  acquired: AcquiredDoc[];
  spentUsd: number;
  freeCaptured: number;
  purchased: number;
  failed: number;
}

export interface ExecuteOptions {
  capture: FreeCaptureFn;
  purchase: PurchaseFn;
  /** Hard ceiling on real paid spend, independent of the plan's estimate. */
  paidBudgetUsd: number;
  log?: (message: string) => void;
}

/**
 * Execute the acquisition plan. Free captures run first (the plan lists them first); each purchase is
 * gated on the REAL remaining budget so wallet spend can never exceed `paidBudgetUsd` even if a
 * document turns out to have more pages than estimated. A capture/purchase that throws is recorded as
 * a failure and the walk continues.
 */
export async function executeAcquisitionPlan(plan: AcquisitionPlan, opts: ExecuteOptions): Promise<AcquireResult> {
  const log = opts.log ?? (() => {});
  const acquired: AcquiredDoc[] = [];
  let spentUsd = 0;
  let freeCaptured = 0;
  let purchased = 0;
  let failed = 0;

  for (const action of plan.actions) {
    if (action.kind === 'skip') {
      acquired.push({ docType: action.cluster.docType, via: 'skipped', sourceId: null, costUsd: 0, ok: false, reason: action.reason });
      continue;
    }

    if (action.kind === 'free_capture') {
      try {
        const out = await opts.capture(action);
        if (out.ok) freeCaptured += 1; else failed += 1;
        acquired.push({
          docType: action.cluster.docType, via: 'free', sourceId: action.source.sourceId,
          costUsd: 0, ok: out.ok, ref: out.ref, reason: action.reason, error: out.error,
        });
        log(`free ${action.cluster.docType} from ${action.source.sourceId}: ${out.ok ? 'captured' : `failed — ${out.error ?? '?'}`}`);
      } catch (e) {
        failed += 1;
        acquired.push({ docType: action.cluster.docType, via: 'free', sourceId: action.source.sourceId, costUsd: 0, ok: false, reason: action.reason, error: e instanceof Error ? e.message : String(e) });
      }
      continue;
    }

    // purchase — gate on the REAL remaining budget, not just the plan's estimate.
    const remaining = opts.paidBudgetUsd - spentUsd;
    if (action.source.unitCostUsd > remaining) {
      acquired.push({ docType: action.cluster.docType, via: 'skipped', sourceId: action.source.sourceId, costUsd: 0, ok: false, reason: `budget exhausted ($${remaining.toFixed(2)} left, needs $${action.source.unitCostUsd})` });
      log(`skip buy ${action.cluster.docType} from ${action.source.sourceId}: budget exhausted`);
      continue;
    }
    try {
      const out = await opts.purchase(action, remaining);
      if (out.ok) {
        spentUsd += out.costUsd;
        purchased += 1;
      } else {
        failed += 1;
      }
      acquired.push({
        docType: action.cluster.docType, via: 'paid', sourceId: action.source.sourceId,
        costUsd: out.ok ? out.costUsd : 0, ok: out.ok, ref: out.ref, reason: action.reason, error: out.error,
      });
      log(`buy ${action.cluster.docType} from ${action.source.sourceId}: ${out.ok ? `$${out.costUsd}` : `not bought — ${out.error ?? out.notAvailable ? 'not available' : '?'}`}`);
    } catch (e) {
      failed += 1;
      acquired.push({ docType: action.cluster.docType, via: 'paid', sourceId: action.source.sourceId, costUsd: 0, ok: false, reason: action.reason, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { acquired, spentUsd, freeCaptured, purchased, failed };
}
