// __tests__/dnd/pf2-reduced-caster-slots.test.ts — a reduced caster is not handed a full caster's slots.
//
// THE DEFECT: `buildPF2Character` assigned `slots: pf2SpellSlots(level)` — the FULL-caster table — to every
// class carrying a spellcasting block. `data/classes.ts` marks Magus and Summoner `slotTableModelled: false`
// precisely so nothing would invent one for them, and says so in its own header: *"reduced casters carry
// `slotTableModelled: false` rather than a plausible table"*. `pf2MaxSpellRank` honours it and returns a
// spell-rank ceiling of 0.
//
// So a built Magus contradicted itself on its own sheet: the spells panel printed slot pills reading
// "Rank 3: 3" from these counts, beside rules saying its maximum castable rank was 0.
//
// The same shape this session keeps turning up: a flag authored to PREVENT an error, honoured in one place
// and ignored in another. `pf2MaxSpellRank`'s own comment had already made the call for the ceiling — "a
// refused legal spell is visible and fixable; a silently over-generous ceiling is neither" — and this is
// that decision applied to the counts.
import { describe, it, expect } from 'vitest';
import { buildPF2Character } from '@/lib/dnd/systems/pathfinder2e/builder';
import { pf2MaxSpellRank } from '@/lib/dnd/systems/pathfinder2e/eligibility';
import { PF2_CLASS_PROGRESSIONS } from '@/lib/dnd/systems/pathfinder2e/data/classes';
import { pf2SlotTableModelled, pf2SpellCountsFor } from '@/lib/dnd/systems/pathfinder2e/spell-counts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The classes the data deliberately leaves unmodelled — read from the source, not restated. */
const UNMODELLED = PF2_CLASS_PROGRESSIONS
  .filter((p) => p.spellcasting?.slotTableModelled === false)
  .map((p) => p.className);

const build = (className: string, level: number) =>
  buildPF2Character({ className, ancestry: 'Human', background: 'Scholar', level } as never);

describe('the data still marks reduced casters unmodelled', () => {
  it('finds them, so this suite cannot pass by matching nothing', () => {
    expect(UNMODELLED.length).toBeGreaterThan(0);
    // Both are reduced casters per the file's own gap note.
    expect(UNMODELLED.join(',').toLowerCase()).toMatch(/magus|summoner/);
  });
});

describe('a reduced caster gets NO fabricated slot table', () => {
  for (const className of UNMODELLED) {
    it(`${className} at level 9 has empty slots, not a full caster's`, () => {
      const c = build(className, 9);
      expect(c.spellcasting.slots).toEqual([]);
    });

    it(`${className} does not contradict its own spell-rank ceiling`, () => {
      // The contradiction that made this a bug rather than a cosmetic issue: eligibility says 0, so the
      // sheet must not simultaneously advertise ranked slots.
      const c = build(className, 9);
      const ceiling = pf2MaxSpellRank(className, 9);
      const highestSlot = c.spellcasting.slots.reduce((hi, n, r) => (n > 0 && r > hi ? r : hi), 0);
      expect(highestSlot).toBeLessThanOrEqual(ceiling);
    });
  }
});

describe('FULL casters are untouched — the risk this fix had to avoid', () => {
  // Reading the flag off `pf2Class` (a thin level-1 projection with no such field) made it `undefined` for
  // every class and emptied EVERY caster's slots. Two existing tests caught that; these keep it caught.
  it('a level-1 Wizard still gets 5 cantrips and two 1st-rank slots', () => {
    const c = build('Wizard', 1);
    expect(c.spellcasting.slots[0]).toBe(5);
    expect(c.spellcasting.slots[1]).toBe(2);
  });

  it('a level-9 Sorcerer still reaches 5th rank', () => {
    const c = build('Sorcerer', 9);
    expect(c.spellcasting.slots[5]).toBeGreaterThan(0);
  });

  it('and a non-caster still has none', () => {
    expect(build('Fighter', 9).spellcasting.slots).toEqual([]);
  });
});

describe('the suppression is explicit, never inferred', () => {
  it('only a literal `false` suppresses — an unknown class keeps the previous behaviour', () => {
    // A class with no progression entry must not be silently emptied; absence of data is not a claim that
    // the table is unmodelled. The predicate's shape carries that: `!== false`, not `!truthy`.
    expect(pf2SlotTableModelled('Wizard')).toBe(true);
    expect(pf2SlotTableModelled('Magus')).toBe(false);
    // A class the progressions do not cover at all keeps the previous behaviour rather than being emptied.
    expect(pf2SlotTableModelled('Not A Real Class')).toBe(true);
    expect(pf2SlotTableModelled(undefined)).toBe(true);
  });

  it('the count source now reports the REAL table, captured 2026-07-27', () => {
    // This asserted `modelled: false` and an empty table, which was the correct answer while the real one
    // was uncaptured — the failure it guarded was a caller substituting the FULL table for the missing one.
    // Both tables have since been read off Archives of Nethys, so the honest answer changed. The guard that
    // still matters is below: a Magus must never be handed a full caster's numbers.
    const magus = pf2SpellCountsFor('Magus', 9);
    expect(magus.modelled).toBe(true);
    expect(magus.slotsByRank[4]).toBe(2);
    expect(magus.slotsByRank[5]).toBe(2);
    expect(magus.slotsByRank[1], 'low ranks are LOST, not merely fewer').toBe(0);
    expect(magus.topRank).toBe(5);
    // …while still reporting what IS known, so a caller can say "prepared caster, counts unmodelled".
    expect(magus.kind).toBe('prepared');
  });

  it('and reports real counts for a full caster, which is what S7c said did not exist', () => {
    // PF2's full casters share one table by design, so this IS the per-class count for them.
    const wiz = pf2SpellCountsFor('Wizard', 9);
    expect(wiz.modelled).toBe(true);
    expect(wiz.cantrips).toBe(5);
    expect(wiz.topRank).toBe(5);
    expect(wiz.slotsByRank[5]).toBeGreaterThan(0);
    expect(wiz.slotsByRank[6]).toBe(0);
  });

  it('reports the CASTING KIND, because that is where a cap belongs', () => {
    // 5e's S7b lesson, carried over: a prepared caster's sheet list is not their prepared count, so
    // enforcement must aim differently for the two. The source reports the distinction and caps nothing.
    expect(pf2SpellCountsFor('Wizard', 5).kind).toBe('prepared');
    expect(pf2SpellCountsFor('Sorcerer', 5).kind).toBe('spontaneous');
  });

  it('a non-caster gets a clean zero, not a crash', () => {
    const f = pf2SpellCountsFor('Fighter', 9);
    expect(f).toMatchObject({ modelled: false, kind: null, cantrips: 0, topRank: 0 });
  });

  it('the decision lives in ONE place, so the builder cannot drift from a future cap', () => {
    // It began as a private helper inside `builder.ts`. Any enforcement added later must ask the same
    // question, and two copies of "is this table modelled?" is how the original bug existed at all —
    // `pf2MaxSpellRank` honoured the flag while the builder ignored it.
    const builder = readFileSync(join(process.cwd(), 'lib/dnd/systems/pathfinder2e/builder.ts'), 'utf8');
    expect(builder).toContain("from './spell-counts'");
    expect(builder).not.toContain('slotTableModelled === false');
  });
});
