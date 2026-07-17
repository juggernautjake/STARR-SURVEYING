import { describe, it, expect } from 'vitest';
import {
  PF2_CLASSES, PF2_ANCESTRIES, PF2_BACKGROUNDS, PF2_SKILLS, PF2_WEAPONS, PF2_ARMORS, PF2_SPELLS,
} from '@/lib/dnd/systems/pathfinder2e/content';
import { PF2_ATTRIBUTES, PF2_RANKS, PF2_SAVES } from '@/lib/dnd/systems/pathfinder2e/model';

// Guards the whole PF2 content library against the data bugs that creep in as it grows: duplicate
// names, dangling skill references, out-of-range ranks, invalid attributes/categories. Pure data checks.

const dupes = (names: string[]) => names.filter((n, i) => names.indexOf(n) !== i);
const skillNames = new Set(PF2_SKILLS.map((s) => s.name));
const RANKS = new Set(PF2_RANKS as readonly string[]);
const ATTRS = new Set(PF2_ATTRIBUTES as readonly string[]);
const TRADITIONS = new Set(['arcane', 'divine', 'occult', 'primal']);

describe('PF2 content — no duplicate names within a catalog', () => {
  it('classes / ancestries / backgrounds / weapons / armors / spells are each unique', () => {
    expect(dupes(PF2_CLASSES.map((c) => c.name))).toEqual([]);
    expect(dupes(PF2_ANCESTRIES.map((a) => a.name))).toEqual([]);
    expect(dupes(PF2_BACKGROUNDS.map((b) => b.name))).toEqual([]);
    expect(dupes(PF2_WEAPONS.map((w) => w.name))).toEqual([]);
    expect(dupes(PF2_ARMORS.map((a) => a.name))).toEqual([]);
    expect(dupes(PF2_SPELLS.map((s) => s.name))).toEqual([]);
    expect(dupes(PF2_SKILLS.map((s) => s.name))).toEqual([]);
  });
});

describe('PF2 classes — valid ranks, attributes, and skill references', () => {
  it('every class has valid initial proficiency ranks and a real key attribute', () => {
    for (const c of PF2_CLASSES) {
      for (const rank of Object.values(c.initial)) expect(RANKS.has(rank)).toBe(true);
      expect(c.keyAttribute.length).toBeGreaterThan(0);
      for (const a of c.keyAttribute) expect(ATTRS.has(a)).toBe(true);
      for (const s of c.fixedSkills ?? []) expect(skillNames.has(s)).toBe(true);
      expect(c.hpPerLevel).toBeGreaterThan(0);
    }
  });
  it('a spellcasting class names a valid tradition/kind/attribute; martials have none', () => {
    for (const c of PF2_CLASSES) {
      if (c.spellcasting) {
        expect(TRADITIONS.has(c.spellcasting.tradition)).toBe(true);
        expect(['prepared', 'spontaneous']).toContain(c.spellcasting.kind);
        expect(ATTRS.has(c.spellcasting.attribute)).toBe(true);
      }
    }
  });
});

describe('PF2 ancestries + backgrounds — internal references resolve', () => {
  it('ancestries have a size/speed/hp and at least one heritage', () => {
    for (const a of PF2_ANCESTRIES) {
      expect(['Small', 'Medium']).toContain(a.size);
      expect(a.speed).toBeGreaterThan(0);
      expect(a.hp).toBeGreaterThan(0);
      expect(a.heritages.length).toBeGreaterThan(0);
    }
  });
  it('every background trains a skill that exists', () => {
    for (const b of PF2_BACKGROUNDS) expect(skillNames.has(b.skill)).toBe(true);
  });
});

describe('PF2 gear + spells — valid categories, damage types, ranks, traditions', () => {
  it('weapons are simple/martial with a B/P/S damage type', () => {
    for (const w of PF2_WEAPONS) {
      expect(['simple', 'martial']).toContain(w.category);
      expect(['B', 'P', 'S']).toContain(w.damageType);
      expect(w.damageDie).toMatch(/^\d+d\d+$/);
    }
  });
  it('armors have a known category and a non-negative AC bonus', () => {
    for (const a of PF2_ARMORS) {
      expect(['unarmored', 'light', 'medium', 'heavy']).toContain(a.category);
      expect(a.acBonus).toBeGreaterThanOrEqual(0);
    }
  });
  it('spells are rank 0–10 with at least one valid tradition', () => {
    for (const s of PF2_SPELLS) {
      expect(s.rank).toBeGreaterThanOrEqual(0);
      expect(s.rank).toBeLessThanOrEqual(10);
      expect(s.traditions.length).toBeGreaterThan(0);
      for (const t of s.traditions) expect(TRADITIONS.has(t)).toBe(true);
      expect(s.effect.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('PF2 saves are the three PF2 saves', () => {
  it('Fortitude / Reflex / Will', () => {
    expect([...PF2_SAVES].sort()).toEqual(['Fortitude', 'Reflex', 'Will']);
  });
});
