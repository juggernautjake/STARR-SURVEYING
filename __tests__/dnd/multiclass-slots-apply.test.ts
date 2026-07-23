// __tests__/dnd/multiclass-slots-apply.test.ts — MC-5e-5 stat layer: the level manager applies the
// rules-correct multiclass spell slots (the PHB combined caster-level table), preserving spent pips.
import { describe, it, expect } from 'vitest';
import { applyMulticlassSlots, characterMulticlass, type SlotBlock } from '@/lib/dnd/classes/multiclass-resolve';
import { multiclassSpellSlots } from '@/lib/dnd/classes/engine';

describe('applyMulticlassSlots — rules-correct slots, spent pips preserved (MC-5e-5)', () => {
  it('a non-caster row (undefined) leaves the block untouched → null', () => {
    expect(applyMulticlassSlots(undefined, { 1: { max: 2, current: 1 } })).toBeNull();
  });

  it('builds the block from the row, a fresh rank starts full', () => {
    const row = multiclassSpellSlots(5); // caster level 5: 4/3/2 for ranks 1/2/3
    const out = applyMulticlassSlots(row, undefined)!;
    expect(out[1]).toEqual({ max: 4, current: 4 });
    expect(out[2]).toEqual({ max: 3, current: 3 });
    expect(out[3]).toEqual({ max: 2, current: 2 });
    expect(out[4]).toBeUndefined();
  });

  it('preserves how many are SPENT: old current is clamped to the new max, not refilled', () => {
    // Player had spent 2 of their rank-1 slots (2 of 4 left). Level-up grows rank-1 max; the 2 spent stay spent.
    const prev: SlotBlock = { 1: { max: 4, current: 2 }, 2: { max: 3, current: 0 } };
    const out = applyMulticlassSlots(multiclassSpellSlots(9), prev)!; // CL9: 4/3/3/3/1
    expect(out[1]).toEqual({ max: 4, current: 2 }); // still 2 spent, not refilled to 4
    expect(out[2]).toEqual({ max: 3, current: 0 }); // still all spent
    expect(out[5]).toEqual({ max: 1, current: 1 }); // brand-new rank 5 → full
  });

  it('shrinking a rank (respec down) clamps current so it never exceeds the new max', () => {
    const prev: SlotBlock = { 3: { max: 3, current: 3 } };
    const out = applyMulticlassSlots(multiclassSpellSlots(5), prev)!; // CL5 rank-3 max is 2
    expect(out[3]).toEqual({ max: 2, current: 2 });
  });

  it('end-to-end: Cleric 3 / Wizard 2 uses the multiclass table (CL5), not either class alone', () => {
    const { snapshot } = characterMulticlass(
      'dnd5e-2014',
      { classKey: 'cleric', level: 3 },
      [{ classKey: 'cleric', level: 3 }, { classKey: 'wizard', level: 2 }],
    );
    expect(snapshot.spellcastingClassCount).toBe(2);
    const out = applyMulticlassSlots(snapshot.spellSlots, undefined)!;
    // CL5 multiclass table: 4/3/2 — more than Cleric-3 alone (4/2) or Wizard-2 alone (3).
    expect(out[1]?.max).toBe(4);
    expect(out[2]?.max).toBe(3);
    expect(out[3]?.max).toBe(2);
  });
});
