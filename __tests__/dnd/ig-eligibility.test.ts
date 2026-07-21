// __tests__/dnd/ig-eligibility.test.ts — the IG eligibility core (IG S1).
//
// The 5e work closed four routes; surveying the other systems found IG has structured class→power
// data and no gate at all. This is the pure decision. Its scope is deliberately narrow, and the
// omissions are tested as decisions rather than left to look like oversights.
import { describe, it, expect } from 'vitest';
import {
  igPowerEligibility, igSpecializationEligibility, specializationName, hasDabbler,
} from '@/lib/dnd/systems/intuitive-games/eligibility';
import * as igEligibility from '@/lib/dnd/systems/intuitive-games/eligibility';
import { IG_CLASS_DETAILS, IG_STANCE_DEFS } from '@/lib/dnd/systems/intuitive-games/content';

// Real content, so a data change breaks the test rather than the test hiding it.
const arcanist = { className: 'Wizard', subclass: 'Arcanist', level: 1 };
const freebooter = { className: 'Fighter', subclass: 'Freebooter', level: 4 };

describe('powers are scoped to the class that grants them', () => {
  it('an Arcanist may take an Arcanist power', () => {
    expect(igPowerEligibility('Elemental Strike', arcanist).ok).toBe(true);
  });

  it('an Arcanist may NOT take a Druid power', () => {
    const v = igPowerEligibility('Entangle', arcanist);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('Arcanist');
  });

  it('the parent class’s starting power is inherited', () => {
    // The site says so outright — Arcanist's startingPower reads "Elemental Blast (inherited from
    // Wizard)". A gate that refused it would refuse the class's signature ability.
    expect(igPowerEligibility('Elemental Blast', arcanist).ok).toBe(true);
  });

  it('a power already on the sheet stays legal on the next look', () => {
    // Whatever granted it was legitimate; the sheet must not start rejecting its own contents.
    expect(igPowerEligibility('Entangle', { ...arcanist, knownPowers: ['Entangle'] }).ok).toBe(true);
  });

  it('an unnamed power is refused', () => {
    expect(igPowerEligibility('   ', arcanist).ok).toBe(false);
  });
});

describe('Dabbler is a rule, not a loophole', () => {
  // The Freebooter specialization reads, verbatim, "gain subclass powers from other classes".
  // A Dabbler holding off-list powers is playing correctly — this is IG's direct analogue of a
  // 5e subclass expanded list, and refusing it would be the worse kind of wrong.
  const dabbler = { ...freebooter, specializations: ['Dabbler (gain subclass powers from other classes)'] };

  it('is detected through its prose gloss', () => {
    expect(hasDabbler(dabbler)).toBe(true);
    expect(hasDabbler(freebooter)).toBe(false);
  });

  it('lets a Freebooter take another class’s power', () => {
    expect(igPowerEligibility('Entangle', freebooter).ok).toBe(false);
    expect(igPowerEligibility('Entangle', dabbler).ok).toBe(true);
  });

  it('but does NOT make anything at all legal', () => {
    // It widens the set to every class's powers; it doesn't remove the check.
    expect(igPowerEligibility('Blorpwave Cascade', dabbler).ok).toBe(false);
  });
});

describe('specializations are level-gated at 4', () => {
  it('are refused below level 4, with the level named', () => {
    const v = igSpecializationEligibility('Sniper', { className: 'Fighter', subclass: 'Marksman', level: 3 });
    expect(v.ok).toBe(false);
    expect(v.reason).toContain('level 4');
  });

  it('are allowed at level 4 when they belong to the class', () => {
    expect(igSpecializationEligibility('Sniper', { className: 'Fighter', subclass: 'Marksman', level: 4 }).ok).toBe(true);
  });

  it('are refused when they belong to another class', () => {
    expect(igSpecializationEligibility('Sniper', { className: 'Wizard', subclass: 'Arcanist', level: 8 }).ok).toBe(false);
  });

  it('match on the NAME, not the prose gloss stored alongside it', () => {
    // Stored as "Sniper (double weapon range, bonus damage)" — matching whole strings would
    // refuse every specialization ever passed in by name.
    expect(specializationName('Dabbler (gain subclass powers from other classes)')).toBe('Dabbler');
    expect(specializationName('Sniper')).toBe('Sniper');
    expect(igSpecializationEligibility('Sniper (double weapon range, bonus damage)',
      { className: 'Fighter', subclass: 'Marksman', level: 4 }).ok).toBe(true);
  });
});

describe('it fails OPEN where IG has no data — the opposite of the 5e core, on purpose', () => {
  it('a parent class with no power list blocks nothing', () => {
    // Fighter and Conduit genuinely carry no `powers` — the site documents specifics on the
    // subclasses. Failing closed would block every power for anyone who hasn't picked a subclass,
    // which is worse than the permissiveness this exists to remove.
    const fighter = IG_CLASS_DETAILS.find((c) => c.name === 'Fighter')!;
    expect(fighter.powers).toBeUndefined();
    expect(igPowerEligibility('Weapon Training', { className: 'Fighter', level: 1 }).ok).toBe(true);
  });

  it('an unknown class blocks nothing', () => {
    expect(igPowerEligibility('Anything At All', { className: 'Homebrew Class', level: 1 }).ok).toBe(true);
  });

  it('an empty class blocks nothing', () => {
    expect(igPowerEligibility('Anything At All', { className: '', level: 1 }).ok).toBe(true);
  });
});

describe('what is deliberately NOT gated', () => {
  it('stances have no eligibility function, because they are not class-locked', () => {
    // IG_LEVEL_1 lists a trait option as "…or a new stance", so a character legitimately holds
    // stances beyond their class's grantedStance. This test exists so the omission reads as a
    // decision: if someone later adds igStanceEligibility, they have to delete this and explain.
    expect('igStanceEligibility' in igEligibility).toBe(false);
    expect(IG_STANCE_DEFS.length).toBeGreaterThan(0); // stances exist; they are simply not gated
  });

  it('feat prerequisites are prose, so no feat gate is claimed either', () => {
    expect('igFeatEligibility' in igEligibility).toBe(false);
  });
});
