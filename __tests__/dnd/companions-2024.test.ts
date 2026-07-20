// __tests__/dnd/companions-2024.test.ts — 5e familiar / steed / companion rules.
// Structural integrity + the Ground Rule 2 honesty properties (never invented, absence
// reported rather than guessed).
import { describe, it, expect } from 'vitest';
import {
  COMPANION_RULE_SETS, FAMILIAR_FORMS, PRIMAL_COMPANION_FORMS, SPIRIT_TYPES,
  COMPANION_STATBLOCK_STATUS, companionRules2024, companionsForClass2024, companionForms2024,
} from '@/lib/dnd/companions/dnd5e-2024';

describe('companion rule sets are structurally sound', () => {
  it('covers the four 5e companion kinds exactly once each', () => {
    const kinds = COMPANION_RULE_SETS.map((r) => r.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds.sort()).toEqual(['familiar', 'primal-companion', 'steed', 'wild-shape']);
  });

  it('fills in every required field and attributes the source', () => {
    for (const r of COMPANION_RULE_SETS) {
      expect(r.name.length, r.kind).toBeGreaterThan(0);
      expect(r.grantedBy.length, r.kind).toBeGreaterThan(0);
      expect(r.classes.length, r.kind).toBeGreaterThan(0);
      expect(r.rules.length, r.kind).toBeGreaterThan(0);
      expect(r.source, r.kind).toBe('PHB 2024');
    }
  });

  it('keeps each rule a short paraphrased fact, not transcribed prose', () => {
    for (const r of COMPANION_RULE_SETS) {
      for (const line of r.rules) {
        expect(line.length, `${r.kind}: "${line.slice(0, 40)}…"`).toBeGreaterThan(0);
        expect(line.length, `${r.kind} rule is too long — paraphrase it`).toBeLessThan(240);
      }
    }
  });
});

describe('form option lists', () => {
  it('names every familiar form uniquely', () => {
    const names = FAMILIAR_FORMS.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThan(10);
  });

  it('offers the three Primal Companion shapes', () => {
    expect(PRIMAL_COMPANION_FORMS.map((f) => f.name)).toEqual([
      'Beast of the Land', 'Beast of the Sea', 'Beast of the Sky',
    ]);
  });

  it('records movement for the forms whose niche depends on it', () => {
    const owl = FAMILIAR_FORMS.find((f) => f.name === 'Owl');
    expect(owl?.movement).toBe('flying');
    const octopus = FAMILIAR_FORMS.find((f) => f.name === 'Octopus');
    expect(octopus?.movement).toBe('swimming');
  });

  it('returns [] for kinds with no fixed form list rather than inventing one', () => {
    expect(companionForms2024('steed')).toEqual([]);
    expect(companionForms2024('wild-shape')).toEqual([]);
    expect(companionForms2024('familiar').length).toBeGreaterThan(0);
  });
});

describe('lookups', () => {
  it('resolves rules by kind', () => {
    expect(companionRules2024('familiar')?.grantedBy).toContain('Find Familiar');
    expect(companionRules2024('steed')?.classes).toContain('Paladin');
  });

  it('maps classes to the companions they actually get', () => {
    expect(companionsForClass2024('Wizard').map((r) => r.kind)).toEqual(['familiar']);
    expect(companionsForClass2024('Ranger').map((r) => r.kind)).toEqual(['primal-companion']);
    expect(companionsForClass2024('Druid').map((r) => r.kind)).toEqual(['wild-shape']);
  });

  it('gives an unknown class nothing rather than a default companion', () => {
    expect(companionsForClass2024('Barbarian')).toEqual([]);
    expect(companionsForClass2024('')).toEqual([]);
  });
});

describe('2024 specifics and honest coverage', () => {
  it('models summoned spirits as Celestial/Fey/Fiend, not Beast', () => {
    expect(SPIRIT_TYPES).toEqual(['Celestial', 'Fey', 'Fiend']);
    expect(companionRules2024('familiar')?.rules.join(' ')).toContain('Celestial');
  });

  it('notes where 2024 diverges from 2014', () => {
    // These four all changed materially; a missing note is how a 2014 assumption survives.
    for (const kind of ['familiar', 'steed', 'primal-companion', 'wild-shape'] as const) {
      expect(companionRules2024(kind)?.editionNote, kind).toBeDefined();
    }
  });

  it('states plainly that statblock numbers are not catalogued', () => {
    // So a caller can say "not catalogued" instead of implying the creature has no stats.
    expect(COMPANION_STATBLOCK_STATUS.rulesComplete).toBe(true);
    expect(COMPANION_STATBLOCK_STATUS.statblocksComplete).toBe(false);
    expect(COMPANION_STATBLOCK_STATUS.note.length).toBeGreaterThan(0);
  });
});
