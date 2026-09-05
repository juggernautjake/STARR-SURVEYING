import { describe, it, expect } from 'vitest';
import {
  MIN_TEXASFILE_BUDGET_USD,
  MIN_OTHER_BUDGET_USD,
  gatherBudget,
  remainingTexasfileAllowance,
  remainingOtherAllowance,
  mayBuyFromTexasFile,
} from '../research/gather-budget.js';

// Plan GATHER_AND_REVIEW_SPLIT B2 — two independent METERED budgets: TexasFile (min $10, $1/page,
// ceiling only) and other-sources (min $2). These are the exact dollar rules the run and the UI key
// off, so a wrong boundary is a real over/under-charge — pin them.

describe('gatherBudget — two budgets with minimums', () => {
  it('floors the other-sources budget at $2', () => {
    expect(gatherBudget({ texasfileOn: false, otherBudgetUsd: 1 }).otherBudgetUsd).toBe(MIN_OTHER_BUDGET_USD);
    expect(gatherBudget({ texasfileOn: false }).otherBudgetUsd).toBe(2);
  });

  it('floors the TexasFile budget at $10 when on, and is $0 when off', () => {
    expect(gatherBudget({ texasfileOn: true, texasfileBudgetUsd: 3 }).texasfileBudgetUsd).toBe(MIN_TEXASFILE_BUDGET_USD);
    expect(gatherBudget({ texasfileOn: true }).texasfileBudgetUsd).toBe(10);
    expect(gatherBudget({ texasfileOn: false, texasfileBudgetUsd: 50 }).texasfileBudgetUsd).toBe(0);
  });

  it('keeps budgets above their minimums (both raisable)', () => {
    const b = gatherBudget({ texasfileOn: true, texasfileBudgetUsd: 40, otherBudgetUsd: 15 });
    expect(b.texasfileBudgetUsd).toBe(40);
    expect(b.otherBudgetUsd).toBe(15);
  });
});

describe('remaining allowances', () => {
  const budget = gatherBudget({ texasfileOn: true, texasfileBudgetUsd: 10, otherBudgetUsd: 5 });

  it('tracks what is left of each budget, never negative', () => {
    expect(remainingTexasfileAllowance(budget, 7)).toBe(3);
    expect(remainingTexasfileAllowance(budget, 12)).toBe(0);
    expect(remainingOtherAllowance(budget, 4)).toBe(1);
    expect(remainingOtherAllowance(budget, 9)).toBe(0);
  });
});

describe('mayBuyFromTexasFile — the metered cap', () => {
  const budget = gatherBudget({ texasfileOn: true, texasfileBudgetUsd: 10 });

  it('allows a buy that fits and refuses one that does not', () => {
    expect(mayBuyFromTexasFile(budget, 7, 3)).toBe(true);
    expect(mayBuyFromTexasFile(budget, 7, 4)).toBe(false);
    expect(mayBuyFromTexasFile(budget, 0, 10)).toBe(true);
    expect(mayBuyFromTexasFile(budget, 0, 11)).toBe(false);
  });

  it('refuses everything when TexasFile is off', () => {
    expect(mayBuyFromTexasFile(gatherBudget({ texasfileOn: false }), 0, 1)).toBe(false);
  });

  it('refuses a zero/unknown-cost document rather than buying blind', () => {
    expect(mayBuyFromTexasFile(budget, 0, 0)).toBe(false);
  });
});
