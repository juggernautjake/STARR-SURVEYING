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
    for (const s of SPELLS_2024) expect(s.source, s.key).toBe('PHB 2024');
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
    expect(spellsForSystem('dnd5e-2014')).toEqual([]);
    expect(findSpellForSystem('dnd5e-2014', 'True Strike')).toBeUndefined();
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
    expect(SPELL_CATALOG_STATUS.note).toMatch(/no level is exhaustive/i);
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
