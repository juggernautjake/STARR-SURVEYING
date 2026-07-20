// __tests__/dnd/spell-eligibility.test.ts — can this character legally take this spell? (S1)
//
// The bug that prompted this: a level-4 vanilla Wizard could add Wish. The picker warned and
// nothing blocked; the grant path and the AI op checked nothing at all.
import { describe, it, expect } from 'vitest';
import { spellEligibility, maxSpellLevelFor, onClassList, eligibleSpells, annotateEligibility } from '@/lib/dnd/spells/eligibility';
import { findSpell2024, SPELLS_2024 } from '@/lib/dnd/spells/dnd5e-2024';

const wizard4 = { system: 'dnd5e-2024', className: 'Wizard', level: 4 };
const spell = (k: string) => findSpell2024(k)!;

describe('maxSpellLevelFor reads the real slot table', () => {
  it('gives a full caster the expected ceiling', () => {
    expect(maxSpellLevelFor('dnd5e-2024', 'Wizard', 1)).toBe(1);
    expect(maxSpellLevelFor('dnd5e-2024', 'Wizard', 4)).toBe(2);
    expect(maxSpellLevelFor('dnd5e-2024', 'Wizard', 5)).toBe(3);
    expect(maxSpellLevelFor('dnd5e-2024', 'Wizard', 17)).toBe(9);
  });

  it('does NOT use level ÷ 2 — half casters progress differently', () => {
    // A Paladin at level 4 has 1st-level slots only, not 2nd. The arithmetic shortcut would
    // have said 2, which is exactly the kind of quiet wrongness this reads the table to avoid.
    const pal4 = maxSpellLevelFor('dnd5e-2024', 'Paladin', 4);
    expect(pal4).toBe(1);
    expect(pal4).not.toBe(2);
  });

  it('handles the Warlock, whose pact slots are their own schedule', () => {
    const w1 = maxSpellLevelFor('dnd5e-2024', 'Warlock', 1);
    const w9 = maxSpellLevelFor('dnd5e-2024', 'Warlock', 9);
    expect(w1).toBe(1);
    expect(w9).toBeGreaterThanOrEqual(5);
  });

  it('returns 0 for a non-caster', () => {
    expect(maxSpellLevelFor('dnd5e-2024', 'Barbarian', 10)).toBe(0);
    expect(maxSpellLevelFor('dnd5e-2024', 'Fighter', 1)).toBe(0);
  });

  it('returns 0 for an unknown class rather than guessing', () => {
    expect(maxSpellLevelFor('dnd5e-2024', 'Nonsense', 10)).toBe(0);
  });
});

describe('the reported bug is fixed', () => {
  it('a level-4 Wizard CANNOT take Wish', () => {
    const r = spellEligibility(spell('wish'), wizard4);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('level-9');
  });

  it('a level-4 Wizard CANNOT take a Cleric-only spell', () => {
    const r = spellEligibility(spell('sacred-flame'), wizard4);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('not on the Wizard spell list');
  });

  it('a level-4 Wizard CAN take a level-1 and level-2 Wizard spell', () => {
    expect(spellEligibility(spell('magic-missile'), wizard4).ok).toBe(true);
    expect(spellEligibility(spell('misty-step'), wizard4).ok).toBe(true);
  });

  it('a level-4 Wizard cannot yet take a level-3 spell', () => {
    expect(spellEligibility(spell('fireball'), wizard4).ok).toBe(false);
    expect(spellEligibility(spell('fireball'), { ...wizard4, level: 5 }).ok).toBe(true);
  });
});

describe('cantrips', () => {
  it('are never slot-gated', () => {
    // A level-1 Wizard has no 9th-level slots but can always cast a cantrip they know.
    expect(spellEligibility(spell('fire-bolt'), { ...wizard4, level: 1 }).ok).toBe(true);
  });

  it('are still class-gated', () => {
    // Sacred Flame is a cantrip, but a Cleric one.
    const r = spellEligibility(spell('sacred-flame'), wizard4);
    expect(r.ok).toBe(false);
  });
});

describe('legitimate exceptions', () => {
  it('an explicitly granted spell is legal even off-list', () => {
    // A subclass expanded list, a pact boon, a feat — the grant IS the permission.
    const r = spellEligibility(spell('sacred-flame'), { ...wizard4, extraSpells: ['Sacred Flame'] });
    expect(r.ok).toBe(true);
  });

  it('a granted spell is still bound by the slot ceiling', () => {
    // Being handed a 9th-level spell does not give a level-4 character 9th-level slots.
    const r = spellEligibility(spell('wish'), { ...wizard4, extraSpells: ['Wish'] });
    expect(r.ok).toBe(false);
  });

  it('honours an explicit maxSpellLevel override for multiclass or DM-adjusted sheets', () => {
    expect(spellEligibility(spell('fireball'), { ...wizard4, maxSpellLevel: 3 }).ok).toBe(true);
  });

  it('matches granted spells case-insensitively', () => {
    expect(spellEligibility(spell('sacred-flame'), { ...wizard4, extraSpells: ['sacred flame'] }).ok).toBe(true);
  });
});

describe('non-casters and missing data', () => {
  it('a Barbarian cannot take a levelled spell', () => {
    const r = spellEligibility(spell('magic-missile'), { system: 'dnd5e-2024', className: 'Barbarian', level: 10 });
    expect(r.ok).toBe(false);
  });

  it('refuses when no class is set, rather than allowing everything', () => {
    // Failing OPEN here would silently restore the original bug for any sheet missing a class.
    const r = spellEligibility(spell('wish'), { system: 'dnd5e-2024', className: '', level: 20 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('no class set');
  });

  it('always gives a reason when it refuses', () => {
    for (const s of [spell('wish'), spell('sacred-flame'), spell('fireball')]) {
      const r = spellEligibility(s, wizard4);
      if (!r.ok) expect((r.reason ?? '').length).toBeGreaterThan(10);
    }
  });
});

describe('helpers', () => {
  it('onClassList is case-insensitive', () => {
    expect(onClassList(spell('fireball'), 'wizard')).toBe(true);
    expect(onClassList(spell('fireball'), 'WIZARD')).toBe(true);
    expect(onClassList(spell('fireball'), 'Cleric')).toBe(false);
  });

  it('eligibleSpells narrows a pool to legal picks only', () => {
    const legal = eligibleSpells(SPELLS_2024, wizard4);
    expect(legal.length).toBeGreaterThan(0);
    expect(legal.every((s) => s.level <= 2)).toBe(true);
    expect(legal.every((s) => onClassList(s, 'Wizard'))).toBe(true);
  });

  it('annotateEligibility KEEPS ineligible spells so they can be shown with a reason', () => {
    // Hiding them would make the list look arbitrary — "why isn't Fireball here?"
    const all = annotateEligibility(SPELLS_2024, wizard4);
    expect(all.length).toBe(SPELLS_2024.length);
    const fb = all.find((x) => x.spell.key === 'fireball')!;
    expect(fb.eligibility.ok).toBe(false);
    expect(fb.eligibility.reason).toBeTruthy();
  });
});
