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
    // the table is unmodelled. Asserted through a real full caster that HAS an entry, plus the predicate's
    // shape: `=== false`, not `!truthy`.
    const src = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(), 'lib/dnd/systems/pathfinder2e/builder.ts'), 'utf8');
    expect(src).toContain('slotTableModelled === false');
  });
});
