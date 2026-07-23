// __tests__/dnd/statgen-ig.test.ts — the Intuitive Games ability-boost allocator (SG-3).
//
// IG's method: start 10, eight +2 boosts, creation cap 14 (two boosts max per ability), + separate ancestry
// adjustments. These pin the rule so the manual builder can enforce it.
import { describe, it, expect } from 'vitest';
import {
  IG_ABILITIES,
  IG_START,
  IG_BOOST_COUNT,
  IG_CREATION_CAP,
  IG_MAX_BOOSTS_PER_ABILITY,
  igAbilityMod,
  igBlankAllocation,
  igBoostsSpent,
  igResolveScores,
  igValidateAllocation,
} from '@/lib/dnd/statgen/ig';

describe('constants + modifier', () => {
  it('start 10, eight boosts, cap 14, two boosts max per ability', () => {
    expect(IG_START).toBe(10);
    expect(IG_BOOST_COUNT).toBe(8);
    expect(IG_CREATION_CAP).toBe(14);
    expect(IG_MAX_BOOSTS_PER_ABILITY).toBe(2);
    expect(IG_ABILITIES).toEqual(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']);
  });
  it('modifier is floor((score-10)/2)', () => {
    expect(igAbilityMod(10)).toBe(0);
    expect(igAbilityMod(14)).toBe(2);
    expect(igAbilityMod(8)).toBe(-1);
  });
  it('blank allocation is all zero and every score starts at 10', () => {
    const blank = igBlankAllocation();
    expect(igBoostsSpent(blank)).toBe(0);
    const scores = igResolveScores(blank);
    for (const a of IG_ABILITIES) expect(scores[a]).toBe(10);
  });
});

describe('igResolveScores', () => {
  it('10 + 2·boosts, capped at 14', () => {
    const scores = igResolveScores({ STR: 2, DEX: 2, CON: 2, INT: 1, WIS: 1, CHA: 0 });
    expect(scores.STR).toBe(14); // two boosts
    expect(scores.INT).toBe(12); // one boost
    expect(scores.CHA).toBe(10); // none
  });
  it('never exceeds the two-boost cap even if a bad allocation asks for more', () => {
    expect(igResolveScores({ STR: 5, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 }).STR).toBe(14);
  });
  it('applies ancestry adjustments on top of the boosts (Gnome +DEX / −STR)', () => {
    const scores = igResolveScores({ STR: 2, DEX: 2, CON: 2, INT: 1, WIS: 1, CHA: 0 }, { DEX: 2, STR: -2 });
    expect(scores.DEX).toBe(16); // 14 + 2 racial
    expect(scores.STR).toBe(12); // 14 − 2 racial
  });
});

describe('igValidateAllocation', () => {
  it('passes exactly eight boosts within the cap', () => {
    const v = igValidateAllocation({ STR: 2, DEX: 2, CON: 2, INT: 1, WIS: 1, CHA: 0 }); // 2+2+2+1+1 = 8
    expect(v.valid).toBe(true);
    expect(v.spent).toBe(8);
    expect(v.remaining).toBe(0);
  });
  it('flags under/over-spending the eight boosts', () => {
    expect(igValidateAllocation({ STR: 2, DEX: 2, CON: 2, INT: 0, WIS: 0, CHA: 0 }).valid).toBe(false); // 6
    const over = igValidateAllocation({ STR: 2, DEX: 2, CON: 2, INT: 2, WIS: 2, CHA: 0 }); // 10
    expect(over.valid).toBe(false);
    expect(over.errors.some((e) => /Spend all 8/.test(e))).toBe(true);
  });
  it('flags an ability over the creation cap (more than two boosts)', () => {
    const v = igValidateAllocation({ STR: 3, DEX: 2, CON: 2, INT: 1, WIS: 0, CHA: 0 }); // STR 3 boosts, 8 total
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => /exceed the creation cap/.test(e))).toBe(true);
  });
});
