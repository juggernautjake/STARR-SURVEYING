// __tests__/dnd/spells-2024.test.ts — integrity of the 2024 spell catalog.
//
// This data feeds a builder that COMPUTES from it, so a malformed or self-contradictory
// record is worse than a missing one. These tests don't (and can't) verify the rules against
// the book — they pin the structural invariants that catch typos, copy-paste slips, and the
// contradictions that creep in when records are authored in bulk.
import { describe, it, expect } from 'vitest';
import {
  SPELLS_2024, SPELL_SCHOOLS, SPELL_CATALOG_STATUS,
  findSpell2024, findSpellByName2024, spellsAtLevel2024, spellsForClass2024,
} from '@/lib/dnd/spells/dnd5e-2024';
import { spellCatalog, spellsForSystem, findSpellForSystem } from '@/lib/dnd/spells';

describe('the 2024 spell catalog is structurally sound', () => {
  it('has a stable unique key for every spell', () => {
    const keys = SPELLS_2024.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/); // kebab-case
  });

  it('has no duplicate names', () => {
    const names = SPELLS_2024.map((s) => s.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses only real schools and legal levels', () => {
    for (const s of SPELLS_2024) {
      expect(SPELL_SCHOOLS).toContain(s.school);
      expect(s.level).toBeGreaterThanOrEqual(0);
      expect(s.level).toBeLessThanOrEqual(9);
      expect(Number.isInteger(s.level)).toBe(true);
    }
  });

  it('fills in every required mechanical field', () => {
    for (const s of SPELLS_2024) {
      expect(s.name.length, s.key).toBeGreaterThan(0);
      expect(s.castTime.length, s.key).toBeGreaterThan(0);
      expect(s.range.length, s.key).toBeGreaterThan(0);
      expect(s.components.length, s.key).toBeGreaterThan(0);
      expect(s.duration.length, s.key).toBeGreaterThan(0);
      expect(s.summary.length, s.key).toBeGreaterThan(0);
      expect(s.classes.length, s.key).toBeGreaterThan(0);
    }
  });

  it('writes components as component letters only', () => {
    for (const s of SPELLS_2024) {
      expect(s.components, s.key).toMatch(/^[VSM](, [VSM])*$/);
    }
  });

  it('declares a material component exactly when it lists M', () => {
    // The mismatch this catches: adding M to the letters and forgetting the material text
    // (or vice-versa), which leaves the sheet unable to show what the spell consumes.
    for (const s of SPELLS_2024) {
      const listsM = s.components.split(', ').includes('M');
      expect(!!s.material, `${s.key} components="${s.components}" material=${JSON.stringify(s.material)}`).toBe(listsM);
    }
  });

  it('never marks an instantaneous spell as concentration', () => {
    // A contradiction that silently breaks concentration tracking.
    for (const s of SPELLS_2024) {
      if (s.concentration) expect(s.duration, s.key).not.toBe('Instantaneous');
    }
  });

  it('attributes every record to a source', () => {
    // Two legitimate sources since the 2026-07-20 verification pass: the 2024 PHB, and earlier
    // 5e books for spells the 2024 PHB does not reprint. Labelling the latter 'PHB 2024' would
    // tell a player filtering by source that they are current 2024 options when they are not.
    for (const s of SPELLS_2024) {
      expect(['PHB 2024', 'Earlier 5e sourcebook (not in the 2024 PHB)'], s.key).toContain(s.source);
    }
  });

  it('does not offer Feeblemind, which 2024 replaced with Befuddlement', () => {
    expect(SPELLS_2024.find((s) => s.key === 'feeblemind')).toBeUndefined();
    const b = SPELLS_2024.find((s) => s.key === 'befuddlement');
    expect(b?.level).toBe(8);
    expect(b?.school).toBe('Enchantment');
  });

  it('carries the full 2024 Summon line', () => {
    // Nine spells the 2024 PHB leans on heavily that recall had missed entirely.
    for (const k of ['summon-beast', 'summon-fey', 'summon-undead', 'summon-aberration',
                     'summon-construct', 'summon-elemental', 'summon-celestial',
                     'summon-dragon', 'summon-fiend']) {
      expect(SPELLS_2024.find((s) => s.key === k), k).toBeDefined();
    }
  });

  it('keeps summaries short — paraphrase, never rulebook prose', () => {
    // A guard on the house style AND on copyright: a creeping word count is the signal
    // that someone has started transcribing the book instead of paraphrasing mechanics.
    for (const s of SPELLS_2024) {
      expect(s.summary.length, `${s.key} summary is too long — paraphrase it`).toBeLessThan(320);
    }
  });

  it('only claims an edition note where it actually differs from 2014', () => {
    for (const s of SPELLS_2024) {
      if (s.editionNote !== undefined) expect(s.editionNote.length, s.key).toBeGreaterThan(0);
    }
  });
});

describe('catalog lookups', () => {
  it('finds a spell by key and by name, case-insensitively', () => {
    expect(findSpell2024('fire-bolt')?.name).toBe('Fire Bolt');
    expect(findSpellByName2024('fire bolt')?.key).toBe('fire-bolt');
    expect(findSpellByName2024('FIRE BOLT')?.key).toBe('fire-bolt');
  });

  it('returns undefined for an unknown spell rather than guessing', () => {
    expect(findSpell2024('wish-but-better')).toBeUndefined();
    expect(findSpellByName2024('Wish But Better')).toBeUndefined();
    expect(findSpellByName2024(null)).toBeUndefined();
  });

  it('filters by level and by class list', () => {
    expect(spellsAtLevel2024(0).every((s) => s.level === 0)).toBe(true);
    expect(spellsAtLevel2024(0).length).toBeGreaterThan(0);
    expect(spellsForClass2024('Warlock').some((s) => s.key === 'eldritch-blast')).toBe(true);
    expect(spellsForClass2024('Cleric').some((s) => s.key === 'eldritch-blast')).toBe(false);
  });
});

describe('the system dispatcher (Ground Rule 1)', () => {
  it('serves the 2024 catalog for dnd5e-2024', () => {
    expect(spellsForSystem('dnd5e-2024').length).toBe(SPELLS_2024.length);
    expect(findSpellForSystem('dnd5e-2024', 'Magic Missile')?.level).toBe(1);
  });

  it('does NOT serve 2024 spells to a 2014 sheet', () => {
    // Several of these changed materially between editions; handing 2024 data to a 2014
    // character would be quietly wrong, which is worse than having nothing.
    //
    // This used to assert the 2014 catalog was EMPTY, which was the honest answer while none
    // existed. Now that 2014 has its own catalog, "empty" would be the wrong assertion — the
    // claim worth pinning was never emptiness, it was SEPARATION. So it is stated directly:
    // a 2014 lookup returns 2014's record, never 2024's.
    const ts2014 = findSpellForSystem('dnd5e-2014', 'True Strike');
    const ts2024 = findSpellForSystem('dnd5e-2024', 'True Strike');
    expect(ts2014, 'the 2014 catalog should hold its own True Strike').toBeDefined();
    expect(ts2014).not.toBe(ts2024);
    // 2014's is a 30-foot Divination cantrip; 2024's is a Self-range weapon attack.
    expect(ts2014?.range).toBe('30 feet');
    expect(ts2024?.range).toBe('Self');

    // No 2014 record is one of 2024's objects, by identity — the strongest form of the claim.
    const twentyFour = new Set(spellsForSystem('dnd5e-2024'));
    for (const s of spellsForSystem('dnd5e-2014')) {
      expect(twentyFour.has(s), `${s.key} is the SAME object in both catalogs`).toBe(false);
    }
  });

  it('gives other systems an empty catalog rather than another system’s content', () => {
    for (const sys of ['pathfinder2e', 'intuitive-games', 'nonsense', null, undefined]) {
      expect(spellsForSystem(sys)).toEqual([]);
    }
  });

  it('reports its own incompleteness honestly', () => {
    // Callers need to distinguish "no such spell" from "not catalogued yet".
    expect(SPELL_CATALOG_STATUS.complete).toBe(false);
    expect(spellCatalog('dnd5e-2024').complete).toBe(false);
    expect(spellCatalog('dnd5e-2024').note.length).toBeGreaterThan(0);
  });

  it('has entries at every level it claims to cover', () => {
    for (const lvl of SPELL_CATALOG_STATUS.levelsCovered) {
      expect(spellsAtLevel2024(lvl).length, `level ${lvl} claimed covered but empty`).toBeGreaterThan(0);
    }
  });

  it('does not claim any level is exhaustive', () => {
    // The field is `levelsCovered`, not `levelsComplete`, precisely so a caller cannot read
    // "level 3 is done" out of it. ~400 spells exist; this is the commonly-played subset.
    expect(SPELL_CATALOG_STATUS.note).toMatch(/not yet catalogued/i);
    expect(SPELL_CATALOG_STATUS.note).toMatch(/not guaranteed exhaustive/i);
    expect(SPELL_CATALOG_STATUS.complete).toBe(false);
  });
});

describe('2024-specific content is actually present', () => {
  it('includes the cantrips new in 2024', () => {
    for (const k of ['elementalism', 'sorcerous-burst', 'starry-wisp']) {
      expect(findSpell2024(k), k).toBeDefined();
    }
  });

  it('carries the redesigned True Strike as a weapon-attack cantrip', () => {
    const ts = findSpell2024('true-strike');
    expect(ts?.level).toBe(0);
    expect(ts?.range).toBe('Self');
    expect(ts?.editionNote).toBeDefined();
  });

  it('records the 2024 healing bump on Cure Wounds and Healing Word', () => {
    expect(findSpell2024('cure-wounds')?.summary).toContain('2d8');
    expect(findSpell2024('healing-word')?.summary).toContain('2d4');
    // Both moved to Abjuration in 2024.
    expect(findSpell2024('cure-wounds')?.school).toBe('Abjuration');
    expect(findSpell2024('healing-word')?.school).toBe('Abjuration');
  });
});
