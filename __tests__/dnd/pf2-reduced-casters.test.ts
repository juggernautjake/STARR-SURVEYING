// __tests__/dnd/pf2-reduced-casters.test.ts — Magus and Summoner get their real slots.
//
// THE BLOCKER WAS THE SHAPE OF THE QUESTION, not the availability of the data. This was recorded for weeks
// as needing "the published reduced-caster tables (Ground Rule 3)". Searching for that phrase finds nothing,
// because Paizo never publishes a "reduced-caster table" — it publishes two CLASS tables that happen to be
// identical, with the governing rule stated as prose above each:
//
//   Magus    — "you have no more than two spell slots of your highest level and, if you can cast 2nd-level
//               spells or higher, two spell slots of 1 level lower than your highest spell level."
//   Summoner — "you begin to lose lower-level spell slots once you reach 5th level. The maximum number of
//               spell slots you get from the summoner class is four, starting when you reach 4th level."
//
// Both captured from Archives of Nethys on 2026-07-27 and transcribed cell-for-cell.
import { describe, it, expect } from 'vitest';
import { pf2ReducedSlots, pf2IsReducedCaster } from '@/lib/dnd/systems/pathfinder2e/spell-counts';
import { pf2SpellCountsFor } from '@/lib/dnd/systems/pathfinder2e/spell-counts';
import { pf2Class } from '@/lib/dnd/systems/pathfinder2e/content';

describe('the table matches the source, cell for cell', () => {
  it('level 1 — one 1st-rank slot and five cantrips', () => {
    expect(pf2ReducedSlots('Magus', 1)).toEqual([5, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('level 4 — the two-and-two shape appears', () => {
    expect(pf2ReducedSlots('Magus', 4)).toEqual([5, 2, 2, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('level 5 — the 1st-rank slots are LOST, which is the whole point of the class', () => {
    // The rule a naive "full table minus some" model would get wrong: lower slots disappear entirely
    // rather than shrinking. A Magus at 5 has no 1st-rank slots at all.
    expect(pf2ReducedSlots('Magus', 5)).toEqual([5, 0, 2, 2, 0, 0, 0, 0, 0, 0]);
  });

  it('level 20 — two 8th and two 9th, and nothing below', () => {
    expect(pf2ReducedSlots('Summoner', 20)).toEqual([5, 0, 0, 0, 0, 0, 0, 0, 2, 2]);
  });

  it('never exceeds four levelled slots at any level, per the Summoner rule', () => {
    for (let lvl = 1; lvl <= 20; lvl++) {
      const row = pf2ReducedSlots('Summoner', lvl)!;
      const levelled = row.slice(1).reduce((a, b) => a + b, 0);
      expect(levelled, `level ${lvl}`).toBeLessThanOrEqual(4);
    }
  });

  it('and never more than two slots of any single rank, per the Magus rule', () => {
    for (let lvl = 1; lvl <= 20; lvl++) {
      for (const n of pf2ReducedSlots('Magus', lvl)!.slice(1)) expect(n).toBeLessThanOrEqual(2);
    }
  });

  it('cantrips are five at every level, for both', () => {
    for (let lvl = 1; lvl <= 20; lvl++) {
      expect(pf2ReducedSlots('Magus', lvl)![0]).toBe(5);
      expect(pf2ReducedSlots('Summoner', lvl)![0]).toBe(5);
    }
  });

  it('the two classes agree exactly — which is why one table serves both', () => {
    for (let lvl = 1; lvl <= 20; lvl++) {
      expect(pf2ReducedSlots('Magus', lvl), `level ${lvl}`).toEqual(pf2ReducedSlots('Summoner', lvl));
    }
  });
});

describe('scope — only these two classes are reduced', () => {
  it('recognises them case-insensitively', () => {
    expect(pf2IsReducedCaster('magus')).toBe(true);
    expect(pf2IsReducedCaster('  Summoner ')).toBe(true);
  });

  it('and nothing else is', () => {
    for (const c of ['Wizard', 'Cleric', 'Bard', 'Fighter', undefined]) {
      expect(pf2IsReducedCaster(c), String(c)).toBe(false);
      expect(pf2ReducedSlots(c, 5)).toBeNull();
    }
  });
});

describe('the bug this closes — a Magus had no countable slots at all', () => {
  // Commit 1d2ebad7 stopped a Magus being handed a FULL caster's slots (it printed "Rank 3: 3" while its own
  // rules reported a maximum castable rank of 0). The safe fallback was NONE, so from then on a Magus had
  // no countable slots whatsoever — correct, and still useless to the player. Now it has its real ones.
  it('pf2SpellCountsFor models a level-5 Magus', () => {
    const c = pf2SpellCountsFor('Magus', 5);
    expect(c.modelled).toBe(true);
    expect(c.slotsByRank[1], '1st-rank slots should be gone at level 5').toBe(0);
    expect(c.slotsByRank[2]).toBe(2);
    expect(c.slotsByRank[3]).toBe(2);
    expect(c.topRank).toBe(3);
    expect(c.cantrips).toBe(5);
  });

  it('and a full caster is untouched', () => {
    const w = pf2SpellCountsFor('Wizard', 5);
    expect(w.modelled).toBe(true);
    expect(w.slotsByRank[1], 'a wizard keeps its low ranks').toBeGreaterThan(0);
  });

  it('THE GAP IS CLOSED 2026-08-02: both are in the BUILD catalogue, and the prediction held', () => {
    // This test used to assert the opposite, and its comment said: "the builder already reads them via
    // `pf2ReducedSlots`, so the class works the moment it is catalogued". That turned out to be exactly
    // true — the owner decided the catalogue means ALL PUBLISHED, two `PF2ClassDef` entries went in, and
    // no other code changed. Landing the tables before the catalogue was the right order.
    expect(pf2Class('Magus')).toBeTruthy();
    expect(pf2Class('Summoner')).toBeTruthy();
  });

  it('and a built one now gets the reduced table rather than nothing', () => {
    // The cost of the gap, recorded in the plan: "a Magus has shown no spell slots at all". It shows
    // them now, and they are the REDUCED counts — neither empty nor a full caster's.
    const magus = pf2SpellCountsFor('Magus', 9);
    expect(magus.modelled).toBe(true);
    expect(magus.slotsByRank.some((n) => n > 0)).toBe(true);
    const wizard = pf2SpellCountsFor('Wizard', 9);
    expect(
      magus.slotsByRank.reduce((a, b) => a + b, 0),
      'a reduced caster has strictly fewer slots than a full one',
    ).toBeLessThan(wizard.slotsByRank.reduce((a, b) => a + b, 0));
  });
});
