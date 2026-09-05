import { describe, it, expect, vi } from 'vitest';
import {
  runGatherPipeline,
  gatherBudgetForSettings,
  texasfileEnabledFor,
  DEFAULT_GATHER_BASE_USD,
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

describe('gatherBudgetForSettings', () => {
  it('floors the base at $7 and adds the $10 earmark when TexasFile is on', () => {
    const b = gatherBudgetForSettings({ maxCostUsd: 3 });
    expect(b.baseCap).toBe(7);
    expect(b.texasfileAddon).toBe(10);
    expect(b.maxTotal).toBe(17);
  });
  it('adds no earmark when TexasFile is off', () => {
    const b = gatherBudgetForSettings({ maxCostUsd: 20, allowPaidDocuments: false });
    expect(b.texasfileAddon).toBe(0);
    expect(b.maxTotal).toBe(20);
  });
  it('defaults the base to $7 when no cost cap was set', () => {
    expect(gatherBudgetForSettings({}).baseCap).toBe(DEFAULT_GATHER_BASE_USD);
  });
});

describe('runGatherPipeline', () => {
  it('walks the want-list with the injected effects and returns the settlement', async () => {
    const buy = vi.fn(async (): Promise<TexasBuyResult> => ({ bought: true, costUsd: 2 }));
    const r = await runGatherPipeline({
      projectId: 'p1', county: 'Bell', subject, adjoiners,
      settings: { maxCostUsd: 10 }, resolveFree: freeNone, buyFromTexasFile: buy,
    });
    // 4 wants, all gaps → 4 TexasFile buys; something bought → $10 add-on charged.
    expect(buy).toHaveBeenCalledTimes(4);
    expect(r.texasFileFilesFound).toBe(4);
    expect(r.settlement).toEqual({ charged: 10, refunded: 0 });
    expect(r.texasfileOn).toBe(true);
  });

  it('never buys when TexasFile is off, and refunds nothing (no earmark)', async () => {
    const buy = vi.fn(async (): Promise<TexasBuyResult> => ({ bought: true, costUsd: 2 }));
    const r = await runGatherPipeline({
      projectId: 'p1', county: 'Bell', subject,
      settings: { allowPaidDocuments: false }, resolveFree: freeNone, buyFromTexasFile: buy,
    });
    expect(buy).not.toHaveBeenCalled();
    expect(r.texasfileOn).toBe(false);
    expect(r.settlement).toEqual({ charged: 0, refunded: 0 });
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
