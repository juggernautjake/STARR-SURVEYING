// __tests__/dnd/background-apply.test.ts — rules-legal background application (Slice 4).
//
// The 2024 rule: a background grants either +2/+1 (two of its abilities) or +1/+1/+1 (all three), and
// nowhere else. This pins the validation + the grant, so the creation UI can only apply a legal spread.
import { describe, it, expect } from 'vitest';
import {
  validateAbilityAssignment,
  backgroundGrants,
  applyAbilityIncreases,
  reconcileBackgroundIncreases,
} from '@/lib/dnd/backgrounds/apply';
import { findBackground } from '@/lib/dnd/backgrounds/dnd5e-2024';

const soldier = findBackground('soldier')!; // STR, DEX, CON
const sage = findBackground('sage')!; // CON, INT, WIS — Magic Initiate (arcane)

describe('validateAbilityAssignment', () => {
  it('accepts a +2/+1 spread across two of the background abilities', () => {
    expect(validateAbilityAssignment(soldier, { str: 2, con: 1 }).ok).toBe(true);
  });

  it('accepts a +1/+1/+1 spread across all three', () => {
    expect(validateAbilityAssignment(soldier, { str: 1, dex: 1, con: 1 }).ok).toBe(true);
  });

  it('rejects points on an ability the background does not offer', () => {
    const r = validateAbilityAssignment(soldier, { str: 2, int: 1 }); // INT not a Soldier ability
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not one of Soldier/);
  });

  it('rejects the wrong total or an illegal spread', () => {
    expect(validateAbilityAssignment(soldier, { str: 2 }).ok).toBe(false); // only 2 points
    expect(validateAbilityAssignment(soldier, { str: 3 }).ok).toBe(false); // +3 to one — illegal
    expect(validateAbilityAssignment(soldier, { str: 1, dex: 2 }).ok).toBe(true); // 2/1 either order
    expect(validateAbilityAssignment(soldier, { str: 2, dex: 2 }).ok).toBe(false); // 4 points
  });
});

describe('backgroundGrants', () => {
  it('returns the ability increases, feat, skills, tool and spell list', () => {
    const g = backgroundGrants(sage, { int: 2, wis: 1 });
    expect(g.abilityIncreases).toEqual({ int: 2, wis: 1 });
    expect(g.originFeat).toBe('magic-initiate');
    expect(g.spellList).toBe('arcane');
    expect(g.skills).toEqual(['arcana', 'history']);
    expect(g.tool).toContain('Calligrapher');
  });

  it('throws on an illegal assignment rather than applying it', () => {
    expect(() => backgroundGrants(sage, { int: 3 })).toThrow();
  });
});

describe('applyAbilityIncreases', () => {
  it('adds the increases onto the base scores, capped at 20', () => {
    const base = { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 };
    const out = applyAbilityIncreases(base, { str: 2, con: 1 });
    expect(out.str).toBe(17);
    expect(out.con).toBe(15);
    expect(out.dex).toBe(13); // untouched
  });

  it('respects the cap', () => {
    const base = { str: 19, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
    expect(applyAbilityIncreases(base, { str: 2 }, 20).str).toBe(20);
  });
});

describe('reconcileBackgroundIncreases', () => {
  const base = { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 };

  it('applies a fresh spread when there was no prior one', () => {
    const out = reconcileBackgroundIncreases(base, undefined, { str: 2, con: 1 });
    expect(out.str).toBe(17);
    expect(out.con).toBe(15);
    expect(out.dex).toBe(13); // untouched
  });

  it('removes the old spread before adding the new when switching', () => {
    const withSoldier = reconcileBackgroundIncreases(base, undefined, { str: 2, con: 1 });
    const switched = reconcileBackgroundIncreases(withSoldier, { str: 2, con: 1 }, { int: 1, wis: 1, con: 1 });
    // Soldier's STR/CON are undone; Sage's +1/+1/+1 lands. CON: 14 +1(soldier) −1(undo) +1(sage) = 15.
    expect(switched.str).toBe(15); // back to base — the soldier +2 is gone
    expect(switched.con).toBe(15);
    expect(switched.int).toBe(11);
    expect(switched.wis).toBe(13);
  });

  it('round-trips exactly: A → B → A leaves the scores byte-identical (unclamped, reversible)', () => {
    const A = { str: 2, con: 1 };
    const B = { int: 1, wis: 1, cha: 1 };
    const withA = reconcileBackgroundIncreases(base, undefined, A);
    const withB = reconcileBackgroundIncreases(withA, A, B);
    const backToA = reconcileBackgroundIncreases(withB, B, A);
    expect(backToA).toEqual(withA);
  });

  it('undoes a spread entirely when next is {} (clearing the background)', () => {
    const withA = reconcileBackgroundIncreases(base, undefined, { str: 2, con: 1 });
    const cleared = reconcileBackgroundIncreases(withA, { str: 2, con: 1 }, {});
    expect(cleared).toEqual(base);
  });
});
