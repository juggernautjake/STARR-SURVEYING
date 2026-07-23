// __tests__/dnd/pf2-multiclass-archetypes.test.ts — MC-PF2.
//
// PF2 "multiclassing" is done via ARCHETYPE Dedication feats (PF2 has no class levels). This locks that the
// mechanism is really present: every base class has a catalogued Dedication feat, those feats are on the
// archetype track, and the eligibility gate makes a Dedication a prerequisite for that archetype's feats.
import { describe, it, expect } from 'vitest';
import { PF2_ALL_FEATS } from '@/lib/dnd/systems/pathfinder2e/data';
import { PF2_CLASSES } from '@/lib/dnd/systems/pathfinder2e/content';
import { pf2FeatEligibility } from '@/lib/dnd/systems/pathfinder2e/eligibility';

describe('PF2 multiclass via archetype Dedications (MC-PF2)', () => {
  const byName = new Map(PF2_ALL_FEATS.map((f) => [f.name, f]));

  // Oracle & Witch have NO catalogued feats at all — a DOCUMENTED gap (PF2_FEATS_CLASS_GAPS): their Remaster
  // subsystems (curses/mysteries, patrons/hexes) couldn't be confirmed, so nothing was authored rather than
  // invented. Every OTHER builder class must have a Dedication so you can multiclass into it.
  const DOCUMENTED_GAPS = new Set(['Oracle', 'Witch']);

  it('every builder class (bar the documented Oracle/Witch gap) has a "<Class> Dedication" archetype feat', () => {
    const missing = PF2_CLASSES.map((c) => c.name)
      .filter((n) => !DOCUMENTED_GAPS.has(n) && !byName.has(`${n} Dedication`));
    expect(missing, `classes with no Dedication feat: ${missing.join(', ')}`).toEqual([]);
    // And the gap classes really are absent (guards that the exclusion isn't hiding a regression).
    for (const g of DOCUMENTED_GAPS) expect(byName.has(`${g} Dedication`), `${g} unexpectedly gained a Dedication`).toBe(false);
  });

  it('a Dedication feat is on the archetype track and available at a class-feat level', () => {
    const fighter = byName.get('Fighter Dedication')!;
    expect(fighter).toBeTruthy();
    expect(fighter.track).toBe('archetype');
    expect(fighter.level).toBeLessThanOrEqual(2); // class-feat slots start at level 2
  });

  it('the Dedication gates the archetype: its other feats are refused until the Dedication is held', () => {
    const archetypeFeat = PF2_ALL_FEATS.find(
      (f) => f.track === 'archetype' && f.archetype === 'Fighter' && !/Dedication$/.test(f.name),
    );
    if (!archetypeFeat) return; // no non-dedication Fighter archetype feat catalogued yet — nothing to assert
    const without = pf2FeatEligibility(archetypeFeat, { className: 'Rogue', ancestry: 'Human', level: 12, featNames: [] });
    expect(without.ok).toBe(false);
    const withDed = pf2FeatEligibility(archetypeFeat, {
      className: 'Rogue', ancestry: 'Human', level: 12, featNames: ['Fighter Dedication'],
    });
    expect(withDed.ok).toBe(true);
  });
});
