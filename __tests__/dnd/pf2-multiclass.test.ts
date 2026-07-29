// PF2 archetype multiclassing — the dedication commitment rule (P5-3, audit finding C-4).
//
// PF2's multiclassing is not an optional add-on the way 5e's is: it IS archetype dedication feats taken at
// class-feat slots, and it comes with a rule that makes it a commitment —
//
//   "You can't select another dedication feat until you have gained two other feats from the archetype you
//    already have."
//
// Half of archetype support was already here: rule 5 required a Dedication before its archetype's feats.
// The missing half was this — nothing stopped a character collecting six Dedications and following through
// on none of them, which is exactly the buffet the rule exists to prevent.
import { describe, expect, it } from 'vitest';
import { pf2FeatEligibility, type PF2EligibilityContext } from '@/lib/dnd/systems/pathfinder2e/eligibility';
import { pf2ClassOrArchetypeFeat } from '@/lib/dnd/systems/pathfinder2e/data/feats-class';
import type { PF2FeatFull } from '@/lib/dnd/systems/pathfinder2e/defs';

const ded = (archetype: string): PF2FeatFull =>
  pf2ClassOrArchetypeFeat(`${archetype} Dedication`)!;

const ctx = (featNames: string[], over: Partial<PF2EligibilityContext> = {}): PF2EligibilityContext =>
  ({ className: 'Fighter', level: 20, featNames, ...over });

describe('the catalogue has what multiclassing needs', () => {
  it('dedications exist and are archetype-tracked', () => {
    const b = ded('Barbarian');
    expect(b, 'Barbarian Dedication should be catalogued').toBeTruthy();
    expect(b.track).toBe('archetype');
    expect(b.archetype).toBe('Barbarian');
  });

  it('and follow-up feats carry their archetype WITHOUT being named for it', () => {
    // This is why the rule cannot be implemented by matching on names: Barbarian Dedication's follow-ups
    // include "Basic Fury", which a name-prefix test would miss entirely.
    const fury = pf2ClassOrArchetypeFeat('Basic Fury');
    expect(fury?.archetype, 'Basic Fury should belong to the Barbarian archetype').toBe('Barbarian');
    expect(fury?.name.toLowerCase().startsWith('barbarian')).toBe(false);
  });
});

describe('a FIRST dedication is always allowed', () => {
  it('with no feats at all', () => {
    expect(pf2FeatEligibility(ded('Barbarian'), ctx([])).ok).toBe(true);
  });

  it('and alongside non-archetype feats', () => {
    expect(pf2FeatEligibility(ded('Barbarian'), ctx(['Power Attack', 'Sudden Charge'])).ok).toBe(true);
  });
});

describe('a SECOND dedication is refused until the first is followed through', () => {
  it('refused with the dedication alone', () => {
    const r = pf2FeatEligibility(ded('Rogue'), ctx(['Barbarian Dedication']));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/two more Barbarian feats/);
  });

  it('still refused with only ONE follow-up', () => {
    const r = pf2FeatEligibility(ded('Rogue'), ctx(['Barbarian Dedication', 'Basic Fury']));
    expect(r.ok).toBe(false);
  });

  it('ALLOWED once two follow-ups are held', () => {
    const two = ['Barbarian Dedication', 'Basic Fury', 'Barbarian Resiliency'];
    // Guard the fixture: if either follow-up stops being a Barbarian archetype feat, this test would pass
    // for the wrong reason.
    for (const f of two.slice(1)) {
      expect(pf2ClassOrArchetypeFeat(f)?.archetype, `${f} must be a Barbarian archetype feat`).toBe('Barbarian');
    }
    expect(pf2FeatEligibility(ded('Rogue'), ctx(two)).ok).toBe(true);
  });

  it('the dedication does NOT count toward its own two', () => {
    // Otherwise every archetype needs only one real follow-up, and the rule is half enforced.
    const r = pf2FeatEligibility(ded('Rogue'), ctx(['Barbarian Dedication', 'Basic Fury']));
    expect(r.ok).toBe(false);
  });

  it('and feats from ANOTHER archetype do not pay the debt', () => {
    const r = pf2FeatEligibility(ded('Wizard'), ctx(['Barbarian Dedication', 'Rogue Dedication']));
    expect(r.ok).toBe(false);
  });
});

describe('the rule only applies where it should', () => {
  it('a non-dedication archetype feat is governed by rule 5, not this one', () => {
    // Basic Fury needs Barbarian Dedication — the pre-existing rule — and must not be blocked by the
    // commitment rule, which is about starting a NEW archetype.
    const fury = pf2ClassOrArchetypeFeat('Basic Fury')!;
    expect(pf2FeatEligibility(fury, ctx(['Barbarian Dedication'])).ok).toBe(true);
    expect(pf2FeatEligibility(fury, ctx([])).ok, 'still needs its dedication first').toBe(false);
  });

  it('ordinary class feats are untouched', () => {
    const power = pf2ClassOrArchetypeFeat('Power Attack');
    if (power) {
      expect(pf2FeatEligibility(power, ctx(['Barbarian Dedication'], { className: power.className ?? 'Fighter' })).ok).toBe(true);
    }
  });

  it('and re-taking a dedication you already have is refused by the existing duplicate rule', () => {
    const r = pf2FeatEligibility(ded('Barbarian'), ctx(['Barbarian Dedication']));
    expect(r.ok).toBe(false);
    expect(r.reason, 'the duplicate rule should catch it, not the commitment rule').toMatch(/already taken/);
  });
});
