// __tests__/dnd/pf2-spell-gaps.test.ts — the `PF2_*_GAPS` convention, extended to spells (P8-4, E-3).
//
// The DATA layer has been honest about this from the start. Both spell status blocks say it outright: "a
// missing spell here means 'not catalogued yet', NEVER 'does not exist in Pathfinder 2e'." Nobody using
// the app could learn that. The picker's empty state said **"Nothing matches that search."** — which is a
// claim about Pathfinder, not about us, and it is the opposite of what the catalogue itself knows.
//
// So the assertions here come in two halves: the numbers must be DERIVED (a hand-kept coverage summary is
// wrong the week after it is written and reads authoritative while being wrong), and the honesty must
// actually REACH the screen.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  pf2SpellCoverage, pf2SpellGaps, pf2SpellSearchMiss, PF2_SPELL_GAPS, PF2_SPELL_STATUS, PF2_TRADITIONS,
} from '@/lib/dnd/systems/pathfinder2e/data/spell-gaps';
import { PF2_ALL_SPELLS, PF2_FOCUS_SPELLS } from '@/lib/dnd/systems/pathfinder2e/data';
import { PF2_CLASS_PROGRESSIONS } from '@/lib/dnd/systems/pathfinder2e/data/classes';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('the coverage numbers are COUNTED, not recorded', () => {
  const c = pf2SpellCoverage();

  it('the total equals the catalogue', () => {
    expect(c.total).toBe(PF2_ALL_SPELLS.length);
    expect(c.slotCast + c.focus).toBe(c.total);
    expect(c.focus).toBe(PF2_FOCUS_SPELLS.length);
  });

  it('and the per-rank counts sum to the SLOT-CAST total, not the whole catalogue', () => {
    // Focus spells are excluded from byRank on purpose, and the first version did not exclude them: most
    // focus spells are rank 1, so rank 1 read 125 against rank 2's 12 — a number that looks like superb
    // first-rank coverage and is nothing of the sort. A derived figure still misleads if it derives the
    // wrong thing. This sum is what would catch it coming back.
    expect(Object.values(c.byRank).reduce((a, b) => a + b, 0)).toBe(c.slotCast);
    expect(c.byRank[1]).toBeLessThan(c.slotCast);
  });

  it('every rank 0–10 has an entry, even the empty ones', () => {
    // An absent key and a zero mean different things to a reader: "we did not look" vs "there are none".
    for (let r = 0; r <= 10; r++) expect(c.byRank[r], `rank ${r}`).toBeTypeOf('number');
  });

  it('tradition counts are real and never exceed the slot-cast total', () => {
    // A spell can belong to several traditions, so the sum may exceed the total — but no single
    // tradition can, and one that did would mean the counter was double-counting.
    for (const t of PF2_TRADITIONS) {
      expect(c.byTradition[t], t).toBeGreaterThan(0);
      expect(c.byTradition[t], t).toBeLessThanOrEqual(c.slotCast);
    }
  });

  it('every SPELLCASTING class is accounted for, one way or the other', () => {
    const named = new Set([...c.focusClasses, ...c.castersWithoutFocusSpells].map((s) => s.toLowerCase()));
    for (const cls of PF2_CLASS_PROGRESSIONS) {
      if (cls.spellcasting) expect(named.has(cls.className.toLowerCase()), cls.className).toBe(true);
    }
  });

  it('and it reads the FULL class list, not content.ts’s 14', () => {
    // The bug this pins: filtering content.ts's short list produced "Every spellcasting class has
    // catalogued focus spells", which is flatly false — the Magus, Summoner, Psychic and Thaumaturge are
    // exactly the ones missing, and the catalogue's own status note has said so all along. A derived
    // claim is only as honest as the set it derives over.
    expect(c.castersWithoutFocusSpells.length).toBeGreaterThan(0);
    for (const cls of c.castersWithoutFocusSpells) {
      const prog = PF2_CLASS_PROGRESSIONS.find((p) => p.className === cls)!;
      expect(prog, cls).toBeTruthy();
      expect(prog.spellcasting, `${cls} must actually be a caster`).toBeTruthy();
    }
    // …and a non-caster is never named. Alchemist, Barbarian, Fighter and Rogue have no focus spells to
    // be missing; listing them would teach a reader to distrust the rest of the list.
    for (const n of ['Alchemist', 'Barbarian', 'Fighter', 'Rogue']) {
      expect(c.castersWithoutFocusSpells, n).not.toContain(n);
    }
  });

  it('and it never claims to be complete', () => {
    expect(c.complete).toBe(false);
    expect(PF2_SPELL_STATUS.ranks0to3.complete).toBe(false);
    expect(PF2_SPELL_STATUS.ranks4to10.complete).toBe(false);
  });
});

describe('the gaps list', () => {
  const gaps = pf2SpellGaps();

  it('follows the convention — a flat list of plain sentences', () => {
    expect(Array.isArray(PF2_SPELL_GAPS)).toBe(true);
    expect(gaps.length).toBeGreaterThan(3);
    for (const g of gaps) {
      expect(typeof g).toBe('string');
      expect(g.trim().length).toBeGreaterThan(20);
    }
  });

  it('says outright that absence is OURS, not Pathfinder’s', () => {
    // The single sentence this whole item exists to make reachable.
    expect(gaps.join(' ')).toMatch(/not a claim that the spell does not exist/i);
  });

  it('names the TRADITION risk, which is the one that fails invisibly', () => {
    // A wrong tradition breaks the eligibility gate while the sheet still looks correct — worse than an
    // absent spell, and the reason the catalogue is deliberately narrow.
    expect(gaps.join(' ')).toMatch(/tradition/i);
  });

  it('and the focus-spell hole names the actual classes, so it cannot go stale', () => {
    const c = pf2SpellCoverage();
    const line = gaps.find((g) => /focus spells/i.test(g))!;
    expect(line).toBeTruthy();
    if (c.castersWithoutFocusSpells.length) {
      for (const cls of c.castersWithoutFocusSpells) expect(line, cls).toContain(cls);
      // …and never names a class that DOES have them.
      for (const cls of c.focusClasses) expect(line, cls).not.toContain(`, ${cls},`);
    }
  });

  it('drops empty lines rather than emitting blanks', () => {
    expect(gaps.some((g) => !g.trim())).toBe(false);
  });
});

describe('pf2SpellSearchMiss says something we can actually stand behind', () => {
  it('quotes the query and blames the catalogue, not the game', () => {
    const m = pf2SpellSearchMiss('Heal');
    expect(m).toContain('Heal');
    expect(m).toMatch(/have not added yet|not catalogued/i);
    expect(m).toMatch(/rather than one that does not exist/i);
  });

  it('and never uses the phrase it replaced', () => {
    expect(pf2SpellSearchMiss('Heal')).not.toMatch(/nothing matches/i);
  });

  it('an empty query gets the count, not an empty quotation', () => {
    expect(pf2SpellSearchMiss('   ')).toMatch(/spells catalogued so far/);
    expect(pf2SpellSearchMiss('')).not.toContain('“”');
  });

  it('carries the real number', () => {
    expect(pf2SpellSearchMiss('x')).toContain(String(pf2SpellCoverage().total));
  });
});

describe('IT REACHES THE SCREEN — otherwise this is a comment in a file nobody opens', () => {
  const picker = read('app/dnd/_ui/PF2ContentPicker.tsx');

  it('the empty state no longer says "Nothing matches that search."', () => {
    // That string was the entire defect: the catalogue knew it was partial, and the one place a user
    // could discover it said the opposite.
    expect(picker).not.toContain('Nothing matches that search.');
  });

  it('spells use pf2SpellSearchMiss, and feats get the same treatment', () => {
    expect(picker).toContain('pf2SpellSearchMiss(q)');
    expect(picker).toMatch(/No catalogued feat matches/);
  });

  it('and the gaps list is reachable from the picker itself', () => {
    // The feat/ancestry/class gaps lists have existed since those catalogues were written and were
    // reachable only by reading the source.
    expect(picker).toContain('PF2_SPELL_GAPS');
    expect(picker).toMatch(/what’s missing\?/);
  });

  it('behind a disclosure, so the picker stays a picker', () => {
    expect(picker).toContain('showGaps');
    expect(picker).toContain('useState(false)');
  });
});
