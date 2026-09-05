import { describe, it, expect, vi } from 'vitest';
import {
  runGatherPipeline,
  gatherBudgetForSettings,
  texasfileEnabledFor,
} from '../research/run-gather-pipeline.js';
import type { FreeResolveResult, TexasBuyResult } from '../research/gather-orchestrator.js';
import type { Want } from '../research/acquisition-wantlist.js';

// Plan GATHER_AND_REVIEW_SPLIT — the gather entrypoint composes the budget model, the want-list, the
// free-first engine, the real buyer and the hard stops into one runnable pass with NO AI. This pins
// the composition: the settings → budget mapping, the TexasFile toggle, and the analyze-run guard.

const subject = { ownerName: 'SMITH' };
const adjoiners = [{ id: 'A1', ownerName: 'JONES' }];
const freeNone = async (): Promise<FreeResolveResult> => ({ found: false });

describe('texasfileEnabledFor', () => {
  it('is on when paid documents are permitted', () => {
    expect(texasfileEnabledFor({ maxCostUsd: 10 })).toBe(true);
  });
  it('is off when the paid switch is off, the cost is $0, or the run is free mode', () => {
    expect(texasfileEnabledFor({ allowPaidDocuments: false })).toBe(false);
    expect(texasfileEnabledFor({ maxCostUsd: 0 })).toBe(false);
    expect(texasfileEnabledFor({ mode: 'free' })).toBe(false);
  });
});

describe('gatherBudgetForSettings — two metered budgets', () => {
  it('floors the TexasFile budget at $10 and other-sources at $2 when TexasFile is on', () => {
    const b = gatherBudgetForSettings({ maxCostUsd: 3 });
    expect(b.texasfileOn).toBe(true);
    expect(b.texasfileBudgetUsd).toBe(10);
    expect(b.otherBudgetUsd).toBe(2);
  });
  it('raises the TexasFile budget to the requested cap', () => {
    expect(gatherBudgetForSettings({ maxCostUsd: 25 }).texasfileBudgetUsd).toBe(25);
  });
  it('has a $0 TexasFile budget when TexasFile is off', () => {
    const b = gatherBudgetForSettings({ maxCostUsd: 20, allowPaidDocuments: false });
    expect(b.texasfileOn).toBe(false);
    expect(b.texasfileBudgetUsd).toBe(0);
    expect(b.otherBudgetUsd).toBe(2);
  });
});

describe('runGatherPipeline', () => {
  it("walks the want-list with the injected effects and reports spend", async () => {
    const buy = vi.fn(async (): Promise<TexasBuyResult> => ({ bought: true, costUsd: 2 }));
    const r = await runGatherPipeline({
      projectId: 'p1', county: 'Bell', subject, adjoiners,
      settings: { maxCostUsd: 10 }, resolveFree: freeNone, buyFromTexasFile: buy,
    });
    // 4 wants, all gaps → 4 TexasFile buys, metered spend $8.
    expect(buy).toHaveBeenCalledTimes(4);
    expect(r.texasFileFilesFound).toBe(4);
    expect(r.texasFileSpend).toBe(8);
    expect(r.texasfileOn).toBe(true);
  });

  it('never buys when TexasFile is off', async () => {
    const buy = vi.fn(async (): Promise<TexasBuyResult> => ({ bought: true, costUsd: 2 }));
    const r = await runGatherPipeline({
      projectId: 'p1', county: 'Bell', subject,
      settings: { allowPaidDocuments: false }, resolveFree: freeNone, buyFromTexasFile: buy,
    });
    expect(buy).not.toHaveBeenCalled();
    expect(r.texasfileOn).toBe(false);
    expect(r.texasFileSpend).toBe(0);
  });

  it('gathers nothing for an analyze run', async () => {
    const resolveFree = vi.fn(freeNone);
    const buy = vi.fn(async (): Promise<TexasBuyResult> => ({ bought: true, costUsd: 1 }));
    const r = await runGatherPipeline({
      projectId: 'p1', county: 'Bell', subject,
      settings: { phase: 'analyze', maxCostUsd: 10 }, resolveFree, buyFromTexasFile: buy,
    });
    expect(resolveFree).not.toHaveBeenCalled();
    expect(buy).not.toHaveBeenCalled();
    expect(r.results).toHaveLength(0);
  });

  it('honours the hard-stop signal', async () => {
    const ac = new AbortController();
    ac.abort();
    const buy = vi.fn(async (): Promise<TexasBuyResult> => ({ bought: true, costUsd: 1 }));
    const r = await runGatherPipeline({
      projectId: 'p1', county: 'Bell', subject, adjoiners,
      settings: { maxCostUsd: 10 }, resolveFree: freeNone, buyFromTexasFile: buy, signal: ac.signal,
    });
    expect(buy).not.toHaveBeenCalled();
    expect(r.results.every((x) => x.outcome === 'stopped')).toBe(true);
  });
});

// W1 — the dedicated two budgets flow from settings into the gather budget.
import { normaliseRunSettings } from '../research/run-settings.js';
describe('dedicated TexasFile + other budgets (W1)', () => {
  it('parses texasfileBudgetUsd + otherBudgetUsd off the request', () => {
    const s = normaliseRunSettings({ texasfileBudgetUsd: 15, otherBudgetUsd: 5 });
    expect(s.texasfileBudgetUsd).toBe(15);
    expect(s.otherBudgetUsd).toBe(5);
  });
  it('gatherBudgetForSettings uses the dedicated TexasFile budget over maxCostUsd', () => {
    const b = gatherBudgetForSettings({ texasfileBudgetUsd: 15, otherBudgetUsd: 5, maxCostUsd: 2 });
    expect(b.texasfileBudgetUsd).toBe(15);
    expect(b.otherBudgetUsd).toBe(5);
  });
});
