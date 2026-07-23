// __tests__/dnd/statgen-dnd5e.test.ts — 5e ability GENERATION (SG-1).
//
// The three vanilla methods (standard array, point buy, 4d6-drop-lowest) as pure functions, with dice
// injected so rolling is deterministic. These pin the cost curve + the rules a manual builder enforces.
import { describe, it, expect } from 'vitest';
import {
  ABILITIES_5E,
  abilityMod5e,
  STANDARD_ARRAY_5E,
  validateStandardArray,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  pointBuyCostOf,
  pointBuySpent,
  validatePointBuy,
  roll4d6DropLowest,
  scoreFourDice,
  rollAbilityScores,
  applyAbilityIncreases5e,
  blankPointBuy,
} from '@/lib/dnd/statgen/dnd5e';

const A = (str: number, dex: number, con: number, int: number, wis: number, cha: number) => ({ str, dex, con, int, wis, cha });

describe('modifier', () => {
  it('is floor((score-10)/2)', () => {
    expect(abilityMod5e(10)).toBe(0);
    expect(abilityMod5e(8)).toBe(-1);
    expect(abilityMod5e(15)).toBe(2);
    expect(abilityMod5e(20)).toBe(5);
  });
});

describe('standard array', () => {
  it('accepts a permutation of 15/14/13/12/10/8', () => {
    expect(validateStandardArray(A(15, 14, 13, 12, 10, 8)).valid).toBe(true);
    expect(validateStandardArray(A(8, 10, 12, 13, 14, 15)).valid).toBe(true); // any assignment of the six
  });
  it('rejects a set that is not the array', () => {
    expect(validateStandardArray(A(16, 14, 13, 12, 10, 8)).valid).toBe(false); // 16 not in the array
    expect(validateStandardArray(A(15, 15, 13, 12, 10, 8)).valid).toBe(false); // duplicate 15, missing 14
  });
  it('exposes the canonical array', () => {
    expect([...STANDARD_ARRAY_5E]).toEqual([15, 14, 13, 12, 10, 8]);
  });
});

describe('point buy', () => {
  it('has the canonical cost curve and 27-point budget', () => {
    expect(POINT_BUY_BUDGET).toBe(27);
    expect(POINT_BUY_COST).toEqual({ 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 });
    expect(pointBuyCostOf(14)).toBe(7);
    expect(pointBuyCostOf(15)).toBe(9);
    expect(pointBuyCostOf(7)).toBeNull(); // below the floor — not purchasable
    expect(pointBuyCostOf(16)).toBeNull(); // above the ceiling
  });

  it('a classic 15/15/15/8/8/8 spread costs exactly 27', () => {
    const spread = A(15, 15, 15, 8, 8, 8);
    expect(pointBuySpent(spread)).toBe(27);
    const v = validatePointBuy(spread);
    expect(v.valid).toBe(true);
    expect(v.remaining).toBe(0);
  });

  it('flags over-budget and out-of-range scores', () => {
    const over = validatePointBuy(A(15, 15, 15, 15, 8, 8)); // 9+9+9+9 = 36 > 27
    expect(over.valid).toBe(false);
    expect(over.errors.some((e) => /over budget/i.test(e))).toBe(true);
    const oob = validatePointBuy(A(16, 8, 8, 8, 8, 8));
    expect(oob.valid).toBe(false);
    expect(oob.errors.some((e) => /outside point-buy range/i.test(e))).toBe(true);
  });

  it('blankPointBuy is all-8s and costs 0', () => {
    const blank = blankPointBuy();
    expect(pointBuySpent(blank)).toBe(0);
    expect(validatePointBuy(blank).remaining).toBe(27);
  });
});

describe('rolling 4d6 drop lowest', () => {
  it('drops the lowest of four and totals the top three', () => {
    // Feed 6,5,4,1 → drops the 1, totals 15.
    const r = scoreFourDice(6, 5, 4, 1);
    expect(r.dropped).toBe(1);
    expect(r.total).toBe(15);
    expect(r.dice).toEqual([6, 5, 4, 1]); // descending, dropped last
  });

  it('drops only ONE lowest when the low value is tied', () => {
    const r = scoreFourDice(1, 1, 6, 6); // drops a single 1, keeps 6+6+1 = 13
    expect(r.dropped).toBe(1);
    expect(r.total).toBe(13);
  });

  it('is deterministic with an injected roll', () => {
    const seq = [3, 3, 3, 3];
    let i = 0;
    const r = roll4d6DropLowest(() => seq[i++]);
    expect(r.total).toBe(9); // three 3s
    expect(r.dropped).toBe(3);
  });

  it('rollAbilityScores produces six results', () => {
    const faces = [4, 4, 4, 4]; // every roll the same, for a stable count check
    let i = 0;
    const rolls = rollAbilityScores(() => faces[i++ % 4]);
    expect(rolls).toHaveLength(6);
    for (const r of rolls) expect(r.total).toBe(12);
  });
});

describe('applying increases', () => {
  it('adds racial/background increases, clamped to the creation cap of 20', () => {
    const base = A(15, 14, 13, 12, 10, 8);
    const out = applyAbilityIncreases5e(base, { str: 2, con: 1 });
    expect(out.str).toBe(17);
    expect(out.con).toBe(14);
    expect(out.dex).toBe(14); // untouched
  });
  it('does not exceed 20', () => {
    const out = applyAbilityIncreases5e(A(19, 8, 8, 8, 8, 8), { str: 2 });
    expect(out.str).toBe(20);
  });
  it('covers all six ability keys', () => {
    expect(ABILITIES_5E).toEqual(['str', 'dex', 'con', 'int', 'wis', 'cha']);
  });
});
