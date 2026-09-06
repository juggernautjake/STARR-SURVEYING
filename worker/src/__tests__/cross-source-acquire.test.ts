import { describe, it, expect, vi } from 'vitest';
import { executeAcquisitionPlan, type FreeCaptureFn, type PurchaseFn } from '../research/cross-source-acquire.js';
import { planAcquisition } from '../research/cross-source-acquire-plan.js';
import type { DocumentCluster } from '../research/cross-source-match.js';
import type { ManifestEntry } from '../research/cross-source-discovery.js';

// Plan A4 — execute the A3 plan: free captures + real TexasFile buys, each purchase gated on the REAL
// remaining budget, one document's failure isolated.

function src(sourceId: string, kind: 'free' | 'paid', unitCostUsd = kind === 'paid' ? 3 : 0): ManifestEntry {
  return { sourceId, kind, docType: 'deed', unitCostUsd, canFreeCapture: kind === 'free', canPurchase: kind === 'paid' };
}
function cluster(docType: string, sources: ManifestEntry[], recordingDate?: string): DocumentCluster {
  return { docType, recordingDate, sources };
}

const okCapture: FreeCaptureFn = async () => ({ ok: true, ref: 'file://x' });
const okPurchase: PurchaseFn = async (a) => ({ ok: true, ref: 'file://y', costUsd: a.source.unitCostUsd });

describe('executeAcquisitionPlan', () => {
  it('captures free and buys paid, tallying spend', async () => {
    const plan = planAcquisition([
      cluster('deed', [src('kofile', 'free')]),
      cluster('plat', [src('texasfile', 'paid', 5)]),
    ], { paidBudgetUsd: 15 });
    const res = await executeAcquisitionPlan(plan, { capture: okCapture, purchase: okPurchase, paidBudgetUsd: 15 });
    expect(res.freeCaptured).toBe(1);
    expect(res.purchased).toBe(1);
    expect(res.spentUsd).toBe(5);
    expect(res.acquired.find((a) => a.via === 'free')?.ok).toBe(true);
  });

  it('never spends past the REAL budget even if the plan under-estimated', async () => {
    const plan = planAcquisition([
      cluster('plat', [src('tf', 'paid', 5)]),
      cluster('deed', [src('tf', 'paid', 5)], '2024-01-01'),
    ], { paidBudgetUsd: 15 });
    // The first purchase actually costs 12 (more pages than estimated) — the second must be skipped.
    const purchase: PurchaseFn = vi.fn(async (a) => ({ ok: true, ref: 'r', costUsd: a.cluster.docType === 'plat' ? 12 : 5 }));
    const res = await executeAcquisitionPlan(plan, { capture: okCapture, purchase, paidBudgetUsd: 15 });
    expect(res.spentUsd).toBe(12);          // only the plat's real 12 was charged
    expect(res.purchased).toBe(1);
    expect(res.acquired.some((a) => a.via === 'skipped' && /budget exhausted/.test(a.reason))).toBe(true);
  });

  it('isolates a failing capture — the purchase still runs', async () => {
    const plan = planAcquisition([
      cluster('deed', [src('kofile', 'free')]),
      cluster('plat', [src('tf', 'paid', 5)]),
    ], { paidBudgetUsd: 15 });
    const capture: FreeCaptureFn = async () => { throw new Error('egress blocked'); };
    const res = await executeAcquisitionPlan(plan, { capture, purchase: okPurchase, paidBudgetUsd: 15 });
    expect(res.failed).toBe(1);
    expect(res.purchased).toBe(1);
    expect(res.acquired.find((a) => a.via === 'free')?.error).toMatch(/egress blocked/);
  });

  it('records skips from the plan without calling any effect', async () => {
    const plan = planAcquisition([cluster('deed', [src('tf', 'paid', 5)])], { paidBudgetUsd: 15, paidEnabled: false });
    const purchase = vi.fn<PurchaseFn>(async () => ({ ok: true, costUsd: 0 }));
    const res = await executeAcquisitionPlan(plan, { capture: okCapture, purchase, paidBudgetUsd: 15 });
    expect(purchase).not.toHaveBeenCalled();
    expect(res.acquired[0].via).toBe('skipped');
  });
});
