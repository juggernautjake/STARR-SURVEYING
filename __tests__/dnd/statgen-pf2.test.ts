// __tests__/dnd/statgen-pf2.test.ts — the PF2 attribute-boost allocator (SG-2).
//
// PF2 attribute generation is staged boosts + a flaw with two fiddly rules: distinct-per-set, and the +4
// partial boost. These pin both, plus the flaw application the old builder skipped, and the exact
// background "one-of-two + one-free" shape.
import { describe, it, expect } from 'vitest';
import {
  pf2ResolveAttributes,
  pf2ValidateAllocation,
  pf2AncestrySet,
  pf2BackgroundSet,
  pf2ClassSet,
  pf2FreeSet,
  pf2StandardSets,
  pf2ModToScore,
} from '@/lib/dnd/statgen/pf2';

describe('pf2ResolveAttributes', () => {
  it('applies fixed + chosen boosts from every set, in order (a full Elf build)', () => {
    // Elf: ancestry boosts DEX/INT + one free, flaw CON. Background: choose STR (from STR/CHA) + one free CHA.
    // Class key STR (fixed). Four free boosts: CON, DEX, INT, WIS.
    const { sets, flaw } = pf2StandardSets({
      ancestryBoosts: ['DEX', 'INT', 'free'],
      ancestryFlaw: 'CON',
      backgroundChoice: ['STR', 'CHA'],
      classKeyOptions: ['STR'],
    });
    expect(flaw).toBe('CON');
    const a = pf2ResolveAttributes(
      sets,
      {
        ancestry: ['WIS'], // the one free ancestry boost
        background: ['STR', 'CHA'], // choice STR, free CHA
        class: [], // key STR is fixed
        free: ['CON', 'DEX', 'INT', 'WIS'],
      },
      flaw,
    );
    expect(a.STR).toBe(2); // background choice + class key
    expect(a.DEX).toBe(2); // ancestry fixed + free
    expect(a.INT).toBe(2); // ancestry fixed + free
    expect(a.WIS).toBe(2); // ancestry free + free
    expect(a.CHA).toBe(1); // background free
    expect(a.CON).toBe(0); // −1 flaw + 1 free
  });

  it('applies the ancestry flaw as −1 to the modifier (−2 score)', () => {
    const { set, flaw } = pf2AncestrySet(['CON', 'WIS', 'free'], 'CHA', false);
    const a = pf2ResolveAttributes([set], { ancestry: ['INT'] }, flaw);
    expect(a.CHA).toBe(-1); // the flaw
    expect(a.CON).toBe(1);
    expect(a.WIS).toBe(1);
    expect(a.INT).toBe(1); // the free pick
  });

  it('honors the +4 partial boost rule (two boosts past +4 = +1)', () => {
    // A contrived set that boosts STR five times: +1,+1,+1,+1 to reach +4, then the 5th is a partial (no gain
    // until a 6th). So five STR boosts → +4, six → +5.
    const five: { key: string; label: string; fixed: import('@/lib/dnd/statgen/pf2').PF2AttributeKey[]; slots: null[] } = {
      key: 'x', label: 'x', fixed: ['STR', 'STR', 'STR', 'STR', 'STR'], slots: [],
    };
    expect(pf2ResolveAttributes([five], {}).STR).toBe(4);
    const six = { ...five, fixed: [...five.fixed, 'STR'] as typeof five.fixed };
    expect(pf2ResolveAttributes([six], {}).STR).toBe(5);
  });

  it('the alternate ancestry option is two free boosts and no flaw', () => {
    const { set, flaw } = pf2AncestrySet(['DEX', 'INT', 'free'], 'CON', true);
    expect(flaw).toBeNull();
    expect(set.slots).toHaveLength(2);
    expect(set.fixed).toEqual([]);
  });

  it('pf2ModToScore presents a modifier as a score', () => {
    expect(pf2ModToScore(0)).toBe(10);
    expect(pf2ModToScore(2)).toBe(14);
    expect(pf2ModToScore(-1)).toBe(8);
  });
});

describe('pf2ValidateAllocation', () => {
  const sets = pf2StandardSets({
    ancestryBoosts: ['DEX', 'INT', 'free'],
    ancestryFlaw: 'CON',
    backgroundChoice: ['STR', 'CHA'],
    classKeyOptions: ['STR'],
  }).sets;

  it('passes a well-formed allocation', () => {
    const v = pf2ValidateAllocation(sets, {
      ancestry: ['WIS'],
      background: ['STR', 'DEX'],
      class: [],
      free: ['CON', 'DEX', 'WIS', 'CHA'],
    });
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it('flags an unfilled slot', () => {
    const v = pf2ValidateAllocation(sets, { ancestry: [], background: ['STR', 'DEX'], class: [], free: ['CON', 'DEX', 'WIS', 'CHA'] });
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => /Ancestry: choose 1 boost/.test(e))).toBe(true);
  });

  it('flags a duplicate within a set (ancestry free == ancestry fixed)', () => {
    const v = pf2ValidateAllocation(sets, { ancestry: ['DEX'], background: ['STR', 'WIS'], class: [], free: ['CON', 'DEX', 'WIS', 'CHA'] });
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => /different attribute \(DEX/.test(e))).toBe(true);
  });

  it('flags a background choice outside its allowed pair', () => {
    const v = pf2ValidateAllocation(sets, { ancestry: ['WIS'], background: ['DEX', 'WIS'], class: [], free: ['CON', 'DEX', 'WIS', 'CHA'] });
    expect(v.valid).toBe(false); // DEX isn't in [STR, CHA]
    expect(v.errors.some((e) => /isn't an allowed choice/.test(e))).toBe(true);
  });

  it('a single-key class set is fixed (no slots to fill), a choice class has one restricted slot', () => {
    expect(pf2ClassSet(['STR']).slots).toEqual([]);
    expect(pf2ClassSet(['STR']).fixed).toEqual(['STR']);
    expect(pf2ClassSet(['STR', 'DEX']).slots).toEqual([['STR', 'DEX']]);
    expect(pf2FreeSet().slots).toHaveLength(4);
    expect(pf2BackgroundSet(['STR', 'CHA']).slots).toEqual([['STR', 'CHA'], null]);
  });
});
