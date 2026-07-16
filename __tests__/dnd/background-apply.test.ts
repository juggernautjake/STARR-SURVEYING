// __tests__/dnd/background-apply.test.ts — rules-legal background application (Slice 4).
//
// The 2024 rule: a background grants either +2/+1 (two of its abilities) or +1/+1/+1 (all three), and
// nowhere else. This pins the validation + the grant, so the creation UI can only apply a legal spread.
import { describe, it, expect } from 'vitest';
import {
  validateAbilityAssignment,
  backgroundGrants,
  applyAbilityIncreases,
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
