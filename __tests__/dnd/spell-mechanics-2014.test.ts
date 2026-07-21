// __tests__/dnd/spell-mechanics-2014.test.ts — the 2014-edition "how spellcasting works" explainers.
//
// Mirrors spell-mechanics.test.ts (the 2024 set) for structure, and then adds the tests that only
// matter because there are now TWO sets: that the dispatcher hands each system its own, that an
// unknown system gets nothing rather than somebody else's rules, and — the Ground Rule 2 test that
// actually earns its keep — that no 2024-ism has leaked into the 2014 file. Emanation is the
// canary: it is a 2024 area shape that does not exist in 2014, so if it ever appears here, the two
// files have been synced by someone who did not read the headers.
import { describe, it, expect } from 'vitest';
import { SPELL_MECHANICS_2014 } from '@/lib/dnd/spells/mechanics-2014';
import { SPELL_MECHANICS, MECHANIC_TOPICS, spellMechanicsFor } from '@/lib/dnd/spells/mechanics';

const ALLOWED_SOURCES = ['SRD 5.1', 'Basic Rules 2014'];

describe('2014 spell mechanics explainers', () => {
  it('has a unique key for every entry', () => {
    const keys = SPELL_MECHANICS_2014.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('pairs every rule with a concrete worked example', () => {
    for (const m of SPELL_MECHANICS_2014) {
      expect(m.rule.length, m.key).toBeGreaterThan(20);
      expect(m.example.length, `${m.key} needs a worked example`).toBeGreaterThan(40);
    }
  });

  it('uses concrete numbers in every example', () => {
    // "You take some damage and might lose it" helps nobody; "22 damage, so DC 11" does.
    for (const m of SPELL_MECHANICS_2014) {
      expect(/\d/.test(m.example), `${m.key} has no numbers in its example`).toBe(true);
    }
  });

  it('uses only declared topics, and every topic has at least one 2014 entry', () => {
    for (const m of SPELL_MECHANICS_2014) expect(MECHANIC_TOPICS, m.key).toContain(m.topic);
    for (const t of MECHANIC_TOPICS) {
      const hits = SPELL_MECHANICS_2014.filter((m) => m.topic === t);
      expect(hits.length, `topic ${t} has no 2014 entries`).toBeGreaterThan(0);
    }
  });

  it('covers the mechanics players actually get wrong', () => {
    const keys = new Set(SPELL_MECHANICS_2014.map((m) => m.key));
    for (const k of [
      'concentration-save-2014', 'upcasting-2014', 'cantrip-scaling-2014', 'spell-save-dc-2014',
      'save-for-half-2014', 'costly-materials-2014', 'ritual-casting-2014', 'prepared-vs-known-2014',
      'areas-of-effect-2014',
    ]) {
      expect(keys.has(k), `missing ${k}`).toBe(true);
    }
  });

  it('gets the 2014 concentration save DC rule right', () => {
    const c = SPELL_MECHANICS_2014.find((m) => m.key === 'concentration-save-2014');
    expect(c?.rule).toContain('Constitution');
    // DC 10 or half the damage, whichever is HIGHER — identical to 2024, and verified as such
    // rather than assumed, which is why it gets its own 2014 example.
    expect(c?.rule.toLowerCase()).toContain('higher');
    expect(c?.example).toContain('22');
  });

  it('separates cantrip scaling from slot-based upcasting', () => {
    expect(SPELL_MECHANICS_2014.find((m) => m.key === 'cantrip-scaling-2014')?.rule).toMatch(/character/i);
    expect(SPELL_MECHANICS_2014.find((m) => m.key === 'upcasting-2014')?.rule).toMatch(/slot/i);
  });
});

describe('2014 entries carry no 2024 content (Ground Rule 2)', () => {
  it('never mentions Emanation — a 2024 area shape that does not exist in 2014', () => {
    for (const m of SPELL_MECHANICS_2014) {
      const blob = `${m.title} ${m.rule} ${m.example} ${(m.gotchas ?? []).join(' ')}`;
      expect(/emanation/i.test(blob), `${m.key} mentions Emanation`).toBe(false);
    }
  });

  it('names exactly the five 2014 area shapes', () => {
    const aoe = SPELL_MECHANICS_2014.find((m) => m.key === 'areas-of-effect-2014');
    expect(aoe).toBeDefined();
    for (const shape of ['cone', 'cube', 'cylinder', 'line', 'sphere']) {
      expect(aoe!.rule.toLowerCase(), `rule omits ${shape}`).toContain(shape);
    }
  });

  it('attributes every entry to a 2014 source, never a 2024 one', () => {
    for (const m of SPELL_MECHANICS_2014) {
      expect(ALLOWED_SOURCES, m.key).toContain(m.source);
      expect(/2024/.test(m.source), `${m.key} carries a 2024 source`).toBe(false);
    }
  });

  it('shares no worked example with the 2024 set', () => {
    // The 2014 entries were written fresh, not copied and lightly edited.
    const examples2024 = new Set(SPELL_MECHANICS.map((m) => m.example));
    for (const m of SPELL_MECHANICS_2014) {
      expect(examples2024.has(m.example), `${m.key} reuses a 2024 example`).toBe(false);
    }
  });

  it('gets the 2014 prepared/known split right', () => {
    const p = SPELL_MECHANICS_2014.find((m) => m.key === 'prepared-vs-known-2014');
    const blob = `${p?.rule} ${(p?.gotchas ?? []).join(' ')}`;
    // Prepared in 2014: Cleric, Druid, Paladin, Wizard. Known: Bard, Ranger, Sorcerer, Warlock.
    for (const cls of ['Cleric', 'Druid', 'Paladin', 'Wizard', 'Bard', 'Ranger', 'Sorcerer', 'Warlock']) {
      expect(blob, `prepared-vs-known omits ${cls}`).toContain(cls);
    }
  });

  it('keeps the 2014 per-class ritual patchwork rather than flattening it', () => {
    const r = SPELL_MECHANICS_2014.find((m) => m.key === 'ritual-casting-2014');
    const blob = `${r?.rule} ${r?.example} ${(r?.gotchas ?? []).join(' ')}`;
    // The Wizard rituals from the spellbook WITHOUT preparing; the Cleric must have it prepared.
    expect(blob).toMatch(/spellbook/i);
    expect(blob).toMatch(/prepared/i);
  });

  it('marks a divergence only where one was confirmed, phrased as a contrast', () => {
    const noted = SPELL_MECHANICS_2014.filter((m) => m.editionNote);
    expect(noted.length).toBeGreaterThan(0);
    for (const m of noted) {
      // An editionNote is a claim the editions differ, so it must actually name 2024.
      expect(m.editionNote, `${m.key} editionNote must contrast with 2024`).toMatch(/2024/);
    }
  });
});

describe('spellMechanicsFor dispatcher', () => {
  it('serves the 2024 set to a 2024 system', () => {
    expect(spellMechanicsFor('dnd5e-2024')).toBe(SPELL_MECHANICS);
  });

  it('serves the 2014 set to a 2014 system', () => {
    expect(spellMechanicsFor('dnd5e-2014')).toBe(SPELL_MECHANICS_2014);
  });

  it('never serves one edition to the other', () => {
    const k2024 = new Set(spellMechanicsFor('dnd5e-2024').map((m) => m.key));
    for (const m of spellMechanicsFor('dnd5e-2014')) {
      expect(k2024.has(m.key), `${m.key} appears in both editions`).toBe(false);
    }
  });

  it('returns [] for an unknown or unmodelled system rather than another system\'s rules', () => {
    for (const s of ['pathfinder2e', 'intuitive-games', 'not-a-system', '', null, undefined]) {
      expect(spellMechanicsFor(s), `${s} should get []`).toEqual([]);
    }
  });
});
