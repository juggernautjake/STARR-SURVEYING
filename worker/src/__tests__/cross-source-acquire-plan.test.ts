import { describe, it, expect } from 'vitest';
import { planAcquisition, priorityTier, decideLegibilityRebuy } from '../research/cross-source-acquire-plan.js';
import type { DocumentCluster } from '../research/cross-source-match.js';
import type { ManifestEntry } from '../research/cross-source-discovery.js';

// Plan A3 — free-available documents are captured free; paid-exclusive ones are bought in priority
// order within the paid budget. Never buy what a free source already has.

function src(sourceId: string, kind: 'free' | 'paid', unitCostUsd = kind === 'paid' ? 3 : 0): ManifestEntry {
  return { sourceId, kind, docType: 'deed', unitCostUsd, canFreeCapture: kind === 'free', canPurchase: kind === 'paid' };
}
function cluster(docType: string, sources: ManifestEntry[], recordingDate?: string): DocumentCluster {
  return { docType, recordingDate, sources };
}

describe('priorityTier', () => {
  it('plats before deeds before easements before the rest', () => {
    expect(priorityTier('plat')).toBeLessThan(priorityTier('deed'));
    expect(priorityTier('deed')).toBeLessThan(priorityTier('easement'));
    expect(priorityTier('easement')).toBeLessThan(priorityTier('restriction'));
  });
});

describe('planAcquisition', () => {
  it('captures free when a free source has the document, never purchasing it', () => {
    const c = cluster('deed', [src('kofile', 'free'), src('texasfile', 'paid')]);
    const plan = planAcquisition([c], { paidBudgetUsd: 15 });
    const a0 = plan.actions[0];
    expect(a0.kind).toBe('free_capture');
    if (a0.kind === 'free_capture') expect(a0.source.sourceId).toBe('kofile');
    expect(plan.plannedPaidUsd).toBe(0);
  });

  it('purchases a paid-exclusive document within budget', () => {
    const c = cluster('deed', [src('texasfile', 'paid', 5)]);
    const plan = planAcquisition([c], { paidBudgetUsd: 15 });
    expect(plan.actions[0].kind).toBe('purchase');
    expect(plan.plannedPaidUsd).toBe(5);
  });

  it('buys plats before deeds and the most-recent deed before older ones', () => {
    const clusters = [
      cluster('deed', [src('tf', 'paid', 4)], '2015-01-01'),
      cluster('plat', [src('tf', 'paid', 4)]),
      cluster('deed', [src('tf', 'paid', 4)], '2024-01-01'),
    ];
    const plan = planAcquisition(clusters, { paidBudgetUsd: 12 });
    const bought = plan.actions.filter((a) => a.kind === 'purchase');
    expect(bought.map((a) => a.cluster.docType)).toEqual(['plat', 'deed', 'deed']);
    expect(bought[1].cluster.recordingDate).toBe('2024-01-01'); // most-recent deed before the 2015 one
  });

  it('skips paid-only documents once the budget is spent, in priority order', () => {
    const clusters = [
      cluster('plat', [src('tf', 'paid', 6)]),
      cluster('deed', [src('tf', 'paid', 6)], '2024-01-01'),
      cluster('deed', [src('tf', 'paid', 6)], '2010-01-01'),
    ];
    const plan = planAcquisition(clusters, { paidBudgetUsd: 12 }); // room for two, not three
    expect(plan.plannedPaidUsd).toBe(12);
    expect(plan.skippedOverBudget).toBe(1);
    const skipped = plan.actions.find((a) => a.kind === 'skip');
    expect(skipped?.cluster.recordingDate).toBe('2010-01-01'); // the oldest deed is dropped
    expect(skipped?.reason).toMatch(/over the \$12 budget/);
  });

  it('skips all paid-only documents when paid is off (free-only run)', () => {
    const c = cluster('deed', [src('texasfile', 'paid', 5)]);
    const plan = planAcquisition([c], { paidBudgetUsd: 15, paidEnabled: false });
    expect(plan.actions[0].kind).toBe('skip');
    expect(plan.actions[0].reason).toMatch(/paid documents are off/);
    expect(plan.plannedPaidUsd).toBe(0);
  });
});

// Plan A5 — the legibility override: buy the paid copy only when the free one is unreadable.

describe('decideLegibilityRebuy', () => {
  const bothSources = cluster('deed', [src('kofile', 'free'), src('texasfile', 'paid', 4)]);

  it('does not re-buy when the free copy is legible', () => {
    const d = decideLegibilityRebuy(bothSources, 0.9, { legibilityThreshold: 0.5, remainingBudgetUsd: 15 });
    expect(d.rebuy).toBe(false);
    expect(d.reason).toMatch(/legible/);
  });

  it('re-buys the paid copy when the free one is illegible and it fits the budget', () => {
    const d = decideLegibilityRebuy(bothSources, 0.2, { legibilityThreshold: 0.5, remainingBudgetUsd: 15 });
    expect(d.rebuy).toBe(true);
    expect(d.source?.sourceId).toBe('texasfile');
  });

  it('does not re-buy an illegible free copy when no paid source has it', () => {
    const freeOnly = cluster('deed', [src('kofile', 'free')]);
    expect(decideLegibilityRebuy(freeOnly, 0.1, { legibilityThreshold: 0.5, remainingBudgetUsd: 15 }).rebuy).toBe(false);
  });

  it('does not re-buy when the paid copy is over the remaining budget', () => {
    const d = decideLegibilityRebuy(bothSources, 0.1, { legibilityThreshold: 0.5, remainingBudgetUsd: 2 });
    expect(d.rebuy).toBe(false);
    expect(d.reason).toMatch(/over the remaining/);
  });
});
