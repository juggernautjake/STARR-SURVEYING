import { describe, it, expect, vi } from 'vitest';
import { runGatherAcquisition, type FreeResolveResult, type TexasBuyResult } from '../research/gather-orchestrator.js';
import { gatherBudget } from '../research/gather-budget.js';
import type { Want } from '../research/acquisition-wantlist.js';

// Plan GATHER_AND_REVIEW_SPLIT G4+G5 — the gather engine. It must: try free first, only hit
// TexasFile for gaps, never exceed the TexasFile budget, and stop once it is spent.
// Fakes stand in for the two side effects so the LOGIC is what is tested.

const budgetOn = gatherBudget({ texasfileOn: true, texasfileBudgetUsd: 10 });
const budgetOff = gatherBudget({ texasfileOn: false });

const twoAdjoiners = {
  subject: { ownerName: 'SMITH' },
  adjoiners: [{ id: 'A1', ownerName: 'JONES' }],
};

const freeNone = async (): Promise<FreeResolveResult> => ({ found: false });
const freeAll = async (): Promise<FreeResolveResult> => ({ found: true, source: 'county-site' });
const buyNever = async (): Promise<TexasBuyResult> => ({ bought: false, costUsd: 0, reason: 'not found' });
// A realistic buyer: refuses (reason 'budget') when the doc costs more than the maxUsd it's given,
// exactly as buyDocument does via its maxUsd guard. Otherwise buys at `cost`.
const buyPerPage = (cost: number) => async (_w: Want, maxUsd: number): Promise<TexasBuyResult> =>
  cost > maxUsd ? { bought: false, costUsd: 0, reason: 'budget' } : { bought: true, costUsd: cost };

describe('free-first', () => {
  it('never calls TexasFile when free sources satisfy every want', async () => {
    const buy = vi.fn(buyNever);
    const r = await runGatherAcquisition({ ...twoAdjoiners, budget: budgetOn, resolveFree: freeAll, buyFromTexasFile: buy });
    expect(buy).not.toHaveBeenCalled();
    expect(r.results.every((x) => x.outcome === 'free')).toBe(true);
    expect(r.texasFileSpend).toBe(0);
  });

  it('only asks TexasFile for the wants free sources missed', async () => {
    // free finds the subject plat only; everything else is a gap.
    const resolveFree = async (w: Want): Promise<FreeResolveResult> =>
      w.target === 'subject' && w.kind === 'plat' ? { found: true, source: 'county-site' } : { found: false };
    const buy = vi.fn(buyPerPage(1));
    const r = await runGatherAcquisition({ ...twoAdjoiners, budget: budgetOn, resolveFree, buyFromTexasFile: buy });
    // 4 wants total (subject plat+deed, adjoiner plat+deed); subject plat is free → 3 TexasFile buys.
    expect(buy).toHaveBeenCalledTimes(3);
    expect(r.results.filter((x) => x.outcome === 'free')).toHaveLength(1);
    expect(r.results.filter((x) => x.outcome === 'texasfile')).toHaveLength(3);
  });
});

describe('the TexasFile budget cap', () => {
  it('stops buying once the earmark is spent, marking the rest skipped_budget (TexasFile budget)', async () => {
    // Each buy costs $4; with $10 only two fit ($8), the third+ are skipped.
    const r = await runGatherAcquisition({ ...twoAdjoiners, budget: budgetOn, resolveFree: freeNone, buyFromTexasFile: buyPerPage(4) });
    expect(r.texasFileFilesFound).toBe(2);
    expect(r.texasFileSpend).toBe(8);
    expect(r.results.filter((x) => x.outcome === 'skipped_budget').length).toBeGreaterThanOrEqual(1);
    expect(r.texasFileFilesFound).toBeGreaterThan(0); // something bought
  });

  it('passes the remaining allowance as the per-buy maxUsd', async () => {
    const seen: number[] = [];
    const buy = async (_w: Want, maxUsd: number): Promise<TexasBuyResult> => {
      seen.push(maxUsd);
      return { bought: true, costUsd: 3 };
    };
    await runGatherAcquisition({ ...twoAdjoiners, budget: budgetOn, resolveFree: freeNone, buyFromTexasFile: buy });
    // first buy sees $10 left, then $7, then $4 …
    expect(seen[0]).toBe(10);
    expect(seen[1]).toBe(7);
    expect(seen[2]).toBe(4);
  });
});

describe('TexasFile off', () => {
  it('marks unmet wants skipped_off and never buys', async () => {
    const buy = vi.fn(buyPerPage(1));
    const r = await runGatherAcquisition({ ...twoAdjoiners, budget: budgetOff, resolveFree: freeNone, buyFromTexasFile: buy });
    expect(buy).not.toHaveBeenCalled();
    expect(r.results.every((x) => x.outcome === 'skipped_off')).toBe(true);
    expect(r.texasFileFilesFound).toBe(0); // TexasFile off
  });
});

describe('hard stops (cost cap / 1-hour wall clock)', () => {
  it('stops attempting wants the instant the signal aborts, marking the rest stopped', async () => {
    const ac = new AbortController();
    // Abort partway: the first buy succeeds, then the watchdog fires before the second.
    let calls = 0;
    const buy = async (): Promise<TexasBuyResult> => {
      calls += 1;
      if (calls === 1) { ac.abort(); return { bought: true, costUsd: 1 }; }
      return { bought: true, costUsd: 1 };
    };
    const r = await runGatherAcquisition({
      ...twoAdjoiners, budget: budgetOn, resolveFree: freeNone, buyFromTexasFile: buy, signal: ac.signal,
    });
    expect(calls).toBe(1); // never opened a second buy after the abort
    expect(r.results.filter((x) => x.outcome === 'stopped').length).toBeGreaterThan(0);
  });

  it('does not even start the free lookup once already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const free = vi.fn(freeNone);
    const buy = vi.fn(buyNever);
    const r = await runGatherAcquisition({
      ...twoAdjoiners, budget: budgetOn, resolveFree: free, buyFromTexasFile: buy, signal: ac.signal,
    });
    expect(free).not.toHaveBeenCalled();
    expect(buy).not.toHaveBeenCalled();
    expect(r.results.every((x) => x.outcome === 'stopped')).toBe(true);
  });
});

describe('resilience', () => {
  it('records a want as missing when the buyer throws, and keeps going', async () => {
    let calls = 0;
    const buy = async (): Promise<TexasBuyResult> => {
      calls += 1;
      if (calls === 1) throw new Error('network');
      return { bought: true, costUsd: 1 };
    };
    const r = await runGatherAcquisition({ ...twoAdjoiners, budget: budgetOn, resolveFree: freeNone, buyFromTexasFile: buy });
    expect(r.results[0].outcome).toBe('missing');
    expect(r.results.filter((x) => x.outcome === 'texasfile').length).toBeGreaterThan(0);
  });
});
