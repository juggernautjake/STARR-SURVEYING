import { describe, it, expect } from 'vitest';
import {
  MIN_GATHER_BUDGET_USD,
  TEXASFILE_ADDON_USD,
  gatherBudget,
  remainingTexasfileAllowance,
  mayBuyFromTexasFile,
  settleTexasfileAddon,
} from '../research/gather-budget.js';

// Plan GATHER_AND_REVIEW_SPLIT G2 — the Gather-run budget model:
// base budget (floor $7) + an optional flat $10 TexasFile add-on that is charged only if TexasFile
// finds a file, and refunded otherwise. These are the exact dollar rules the run and the UI both key
// off, so a wrong boundary here is a real over/under-charge — pin them.

describe('gatherBudget — base floor + optional $10 add-on', () => {
  it('floors the base budget at $7', () => {
    expect(gatherBudget({ baseCap: 3, texasfileOn: false }).baseCap).toBe(MIN_GATHER_BUDGET_USD);
    expect(gatherBudget({ baseCap: 0, texasfileOn: false }).baseCap).toBe(7);
  });

  it('keeps a base above the floor', () => {
    expect(gatherBudget({ baseCap: 25, texasfileOn: false }).baseCap).toBe(25);
  });

  it('adds a flat $10 when TexasFile is on, nothing when off', () => {
    const on = gatherBudget({ baseCap: 20, texasfileOn: true });
    expect(on.texasfileAddon).toBe(TEXASFILE_ADDON_USD);
    expect(on.maxTotal).toBe(30);
    const off = gatherBudget({ baseCap: 20, texasfileOn: false });
    expect(off.texasfileAddon).toBe(0);
    expect(off.maxTotal).toBe(20);
  });
});

describe('remainingTexasfileAllowance + mayBuyFromTexasFile — the $10 cap', () => {
  const budget = gatherBudget({ baseCap: 10, texasfileOn: true });

  it('tracks what is left of the $10', () => {
    expect(remainingTexasfileAllowance(budget, 0)).toBe(10);
    expect(remainingTexasfileAllowance(budget, 7)).toBe(3);
    expect(remainingTexasfileAllowance(budget, 10)).toBe(0);
    expect(remainingTexasfileAllowance(budget, 12)).toBe(0); // never negative
  });

  it('allows a buy that fits the remaining allowance and refuses one that does not', () => {
    expect(mayBuyFromTexasFile(budget, 7, 3)).toBe(true); // $3 doc, $3 left → ok
    expect(mayBuyFromTexasFile(budget, 7, 4)).toBe(false); // $4 doc, $3 left → no
    expect(mayBuyFromTexasFile(budget, 0, 10)).toBe(true); // exactly $10 → ok
    expect(mayBuyFromTexasFile(budget, 0, 11)).toBe(false); // over the cap
  });

  it('refuses everything when TexasFile is off', () => {
    const off = gatherBudget({ baseCap: 10, texasfileOn: false });
    expect(mayBuyFromTexasFile(off, 0, 1)).toBe(false);
  });

  it('refuses a zero/unknown-cost document rather than buying blind', () => {
    expect(mayBuyFromTexasFile(budget, 0, 0)).toBe(false);
  });
});

describe('settleTexasfileAddon — refund unless a file was found', () => {
  it('charges the full $10 when at least one file was obtained', () => {
    expect(settleTexasfileAddon({ filesFound: 1 })).toEqual({ charged: 10, refunded: 0 });
    expect(settleTexasfileAddon({ filesFound: 5 })).toEqual({ charged: 10, refunded: 0 });
  });

  it('refunds the full $10 when nothing was found', () => {
    expect(settleTexasfileAddon({ filesFound: 0 })).toEqual({ charged: 0, refunded: 10 });
  });

  it('honours a non-default add-on amount', () => {
    expect(settleTexasfileAddon({ filesFound: 0, addon: 6 })).toEqual({ charged: 0, refunded: 6 });
    expect(settleTexasfileAddon({ filesFound: 2, addon: 6 })).toEqual({ charged: 6, refunded: 0 });
  });
});
