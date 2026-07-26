// __tests__/dnd/spell-counts.test.ts — how many spells a character gets (slot plan S7, first half).
//
// The counts were authored on thirteen class files and read by exactly one consumer: a progression DISPLAY
// table, which prints `cantripsKnown` and never prints `spellsKnown` at all. Nothing asked "may this
// character take another spell?" — so the sheet's picker let a level-1 Bard add all four Bard cantrips and
// thirty more, and `preparedCap` was a sheet field whose only value in the whole repo was hand-typed onto a
// demo character. Same defect as the feat lists before S1–S5: computed, displayed, then not used.
//
// FOUR 2024 CLASSES had their table trapped in an English sentence — Cleric, Druid, Paladin and Ranger
// carried "a fixed count from the X table: 4/5/6/…" in `preparedRule` and no array. Those are now
// transcribed, and the central test here compares each array against the digits in its OWN prose. That is
// the point: the sentence stays the source of truth, and a transcription slip cannot pass quietly.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spellCountsFor, preparedCapFor } from '@/lib/dnd/spells/counts';
import { classesForSystem } from '@/lib/dnd/classes/registry';
import { findClass } from '@/lib/dnd/classes/registry';

const SYSTEMS = ['dnd5e-2014', 'dnd5e-2024'] as const;

describe('the transcribed tables match the prose they came from', () => {
  // "…a fixed count from the Paladin table: 2/3/4/5/… at levels 1–20."
  const tableIn = (prose: string): number[] | null => {
    const m = prose.match(/(\d+(?:\/\d+){10,})/);
    return m ? m[1].split('/').map(Number) : null;
  };

  for (const system of SYSTEMS) {
    for (const cls of classesForSystem(system)) {
      const def = findClass(system, cls.key ?? cls.name);
      const prose = def?.spellcasting?.preparedRule;
      const table = typeof prose === 'string' ? tableIn(prose) : null;
      if (!table) continue;

      it(`${system} ${cls.name}: the array says what the sentence says`, () => {
        expect(table.length, 'the prose should list all 20 levels').toBe(20);
        for (let level = 1; level <= 20; level++) {
          expect(
            spellCountsFor(system, cls.key ?? cls.name, level).spellsKnown,
            `${cls.name} level ${level} — prose says ${table[level - 1]}`,
          ).toBe(table[level - 1]);
        }
      });
    }
  }
});

describe('the four classes whose table was only prose now have one', () => {
  for (const name of ['Cleric', 'Druid', 'Paladin', 'Ranger']) {
    it(`2024 ${name} reports a prepared count`, () => {
      const counts = spellCountsFor('dnd5e-2024', name, 5);
      expect(counts.spellsKnown, `${name} should have a number at level 5`).toBeGreaterThan(0);
      expect(counts.prepares).toBe(true);
    });
  }

  it('a half-caster has a prepared list at level 1, before it has any slots', () => {
    // The wrinkle both Paladin and Ranger state outright: Spellcasting from level 1, no slots until 2.
    // Transcribing 0 here would have been the "obvious" reading and would have been wrong.
    expect(spellCountsFor('dnd5e-2024', 'Paladin', 1).spellsKnown).toBe(2);
    expect(spellCountsFor('dnd5e-2024', 'Ranger', 1).spellsKnown).toBe(2);
  });
});

describe('reporting counts', () => {
  it('reads cantrips from the class table', () => {
    // 2024 Cleric: 3 at levels 1–3, 4 from 4, 5 from 10.
    expect(spellCountsFor('dnd5e-2024', 'Cleric', 1).cantripsKnown).toBe(3);
    expect(spellCountsFor('dnd5e-2024', 'Cleric', 4).cantripsKnown).toBe(4);
    expect(spellCountsFor('dnd5e-2024', 'Cleric', 10).cantripsKnown).toBe(5);
  });

  it('reads spells known for a class that KNOWS rather than prepares', () => {
    // 2014 Bard: 4 known at level 1, 5 at 2 — a genuine "known" list, not a prepared one.
    expect(spellCountsFor('dnd5e-2014', 'Bard', 1).spellsKnown).toBe(4);
    expect(spellCountsFor('dnd5e-2014', 'Bard', 2).spellsKnown).toBe(5);
  });

  it('returns NULL, not zero, for a class with no such progression', () => {
    // A Fighter is not a caster with zero spells, and a cap built on a zero that meant "unknown" would
    // block every pick — the worse failure of the two.
    const fighter = spellCountsFor('dnd5e-2024', 'Fighter', 5);
    expect(fighter.cantripsKnown).toBeNull();
    expect(fighter.spellsKnown).toBeNull();
  });

  it('returns nothing for an unknown class or a missing one, without throwing', () => {
    expect(() => spellCountsFor('dnd5e-2024', 'Not A Class', 5)).not.toThrow();
    expect(spellCountsFor('dnd5e-2024', undefined, 5).spellsKnown).toBeNull();
  });

  it('clamps a silly level instead of reading off the end of the table', () => {
    expect(spellCountsFor('dnd5e-2024', 'Cleric', 99).cantripsKnown).toBe(5);
    expect(spellCountsFor('dnd5e-2024', 'Cleric', 0).cantripsKnown).toBe(3);
    expect(spellCountsFor('dnd5e-2024', 'Cleric', NaN).cantripsKnown).toBe(3);
  });

  it('never paraphrases the class\'s own rule', () => {
    const counts = spellCountsFor('dnd5e-2024', 'Cleric', 1);
    expect(counts.preparedRule).toContain('Domain spells are always prepared');
  });
});

describe('prepares vs knows is an edition difference, not a field check', () => {
  it('the 2014 Bard KNOWS, even though it has a preparedRule', () => {
    // The trap: `prepares: !!preparedRule` was the obvious implementation and is wrong here — the Bard's
    // rule string literally reads "Spells KNOWN (a Bard does not prepare)". That field describes how the
    // class handles its list, including saying it doesn't prepare at all.
    const bard = spellCountsFor('dnd5e-2014', 'Bard', 1);
    expect(bard.preparedRule).toContain('does not prepare');
    expect(bard.prepares).toBe(false);
  });

  it('the 2014 Cleric PREPARES, and has no per-level table to give', () => {
    // 2014 preparers compute `level + ability modifier`, which cannot be tabled per level at all.
    const cleric = spellCountsFor('dnd5e-2014', 'Cleric', 5);
    expect(cleric.prepares).toBe(true);
    expect(cleric.spellsKnown).toBeNull();
  });

  it('every 2024 caster prepares — that edition has no known-spells casters', () => {
    for (const name of ['Wizard', 'Bard', 'Sorcerer', 'Warlock', 'Cleric', 'Druid', 'Paladin', 'Ranger']) {
      expect(spellCountsFor('dnd5e-2024', name, 5).prepares, `2024 ${name}`).toBe(true);
    }
  });
});

describe('the prepared cap the sheet displays is now a real number', () => {
  it('derives it for a 2024 preparer', () => {
    expect(preparedCapFor('dnd5e-2024', 'Cleric', 5)).toBe(9);
  });

  it('is null for a class that KNOWS its spells — it has no prepared cap to show', () => {
    // A 2014 Bard's four spells are known, not prepared; printing them against a "prepared" cap would be
    // a different claim about how the class works.
    expect(preparedCapFor('dnd5e-2014', 'Bard', 1)).toBeNull();
  });

  it('is null for a 2014 preparer, whose count needs an ability score this cannot see', () => {
    // Deliberate. Returning a number here would mean inventing one, and a wrong cap on the sheet is worse
    // than no cap — the player would believe it.
    expect(preparedCapFor('dnd5e-2014', 'Cleric', 5)).toBeNull();
  });

  it('is null for a non-caster', () => {
    expect(preparedCapFor('dnd5e-2024', 'Fighter', 5)).toBeNull();
  });
});

describe('the sheet actually shows it', () => {
  const PANEL = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/SpellsPanel.tsx'), 'utf8');

  it('derives the cap instead of only reading the stored field', () => {
    // `sc.preparedCap` has been rendered here since the panel was written, and the only place in the repo
    // that ever SET it is a hand-authored demo character — so every real caster showed a bare count against
    // nothing at all. Caught by the orphan-module guard, which is what a "authored but not wired" check is
    // for: the count source landed with no consumer.
    expect(PANEL).toContain('preparedCapFor(');
    expect(PANEL).toContain('const preparedCap = sc?.preparedCap');
  });

  it('still lets a stored cap win, for a DM override or a homebrew class', () => {
    expect(PANEL).toMatch(/sc\?\.preparedCap\s*\n?\s*\?\?/);
  });

  it('renders the derived value, not the stored one', () => {
    expect(PANEL).toContain('preparedCap ? `${preparedCount} / ${preparedCap}`');
    expect(PANEL).not.toContain('sc.preparedCap ? `${preparedCount}');
  });
});

describe('what this deliberately does NOT do yet', () => {
  it('caps nothing — enforcement is the second half of S7', () => {
    // Landing a count source that only REPORTS is safe on live characters; turning it into a cap is a
    // behaviour change that would start refusing picks players already made, and several demo characters
    // hold more spells than their class grants. Recorded so the gap is a decision on the record rather
    // than something half-built.
    const picker = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/ui/SpellPicker.tsx'), 'utf8');
    expect(picker).not.toContain('spellCountsFor');
    expect(picker).not.toContain('preparedCapFor');
  });
});
