// __tests__/dnd/ig-content.test.ts — the Intuitive Games vanilla content library is well-formed and
// covers the system's content (IG builder Slice 1). It is the recognition key for provenance flagging.
import { describe, it, expect } from 'vitest';
import {
  IG_STANCES, IG_STANCE_DEFS, IG_STANCE_RULES, IG_FEATS, IG_POWERS, IG_DEFENSIVE_POWERS, IG_WEAPON_TYPES,
  IG_MOVEMENT_TYPES, IG_CONDITIONS, IG_ANCESTRIES, IG_ANCESTRY_TRAIT_RULES,
  igIsVanilla, igVanillaNames, igContentSummary,
} from '@/lib/dnd/systems/intuitive-games/content';
import { IG_GENERAL_FEATS, igAllFeats } from '@/lib/dnd/systems/intuitive-games/feats';
import { systemRulesBlock, systemConditions, systemSpecies } from '@/lib/dnd/system-rules';

describe('Intuitive Games vanilla content library (Slice 1)', () => {
  it('has the 10 stances, each with an effect', () => {
    expect(IG_STANCES).toHaveLength(10);
    for (const s of IG_STANCES) { expect(s.name).toBeTruthy(); expect(s.effect).toBeTruthy(); }
    expect(IG_STANCES.map((s) => s.name)).toEqual(expect.arrayContaining(['Offensive', 'Defensive', 'Precise', 'Menacing']));
  });

  it('has structured Basic/Advanced stance defs (verbatim from the site) that back the NamedEntry list', () => {
    expect(IG_STANCE_DEFS).toHaveLength(10);
    for (const s of IG_STANCE_DEFS) {
      expect(s.name).toBeTruthy();
      expect(s.basic.length).toBeGreaterThan(5);
      expect(s.advanced.length).toBeGreaterThan(5);
    }
    // IG_STANCES must be derived from the defs (names line up, effect carries both tiers).
    expect(IG_STANCES.map((s) => s.name)).toEqual(IG_STANCE_DEFS.map((s) => s.name));
    const offensive = IG_STANCE_DEFS.find((s) => s.name === 'Offensive')!;
    expect(offensive.basic).toMatch(/advantage on all attack rolls/i);
    expect(offensive.advanced).toMatch(/half your level/i);
    const defensive = IG_STANCE_DEFS.find((s) => s.name === 'Defensive')!;
    expect(defensive.advanced).toMatch(/Damage Reduction/i);
    // The general rules are captured (one at a time, action to enter, Basic below L5 / Advanced at L5+).
    expect(IG_STANCE_RULES).toMatch(/Only one stance can be active/i);
    expect(IG_STANCE_RULES).toMatch(/below Level 5/i);
  });

  it('has the powers grouped by school and the defensive powers', () => {
    expect(IG_POWERS.length).toBeGreaterThan(30);
    const schools = new Set(IG_POWERS.map((p) => p.category));
    expect(schools).toEqual(new Set(['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Transmutation']));
    expect(IG_POWERS.map((p) => p.name)).toEqual(expect.arrayContaining(['Elemental Blast', 'Mirror Image', 'Teleportation']));
    expect(IG_DEFENSIVE_POWERS.map((d) => d.name)).toEqual(expect.arrayContaining(['Redirect', 'Sidestep', 'Counterattack']));
  });

  it('generates the 15-entry weapon-type taxonomy and the movement types', () => {
    expect(IG_WEAPON_TYPES).toHaveLength(15); // 5 classes × 3 damage types
    expect(IG_WEAPON_TYPES).toEqual(expect.arrayContaining(['Light Slashing', 'Heavy Bludgeoning', 'Ranged Piercing']));
    expect(IG_MOVEMENT_TYPES).toEqual(expect.arrayContaining(['Fast', 'Fly 30', 'Burrow 10', 'Swim 20']));
    expect(IG_FEATS.length).toBeGreaterThan(15);
  });

  it('igIsVanilla recognizes real content (case/space-insensitive) and rejects invented content', () => {
    expect(igIsVanilla('stance', 'Offensive')).toBe(true);
    expect(igIsVanilla('stance', '  offensive ')).toBe(true);
    expect(igIsVanilla('power', 'Mirror Image')).toBe(true);
    expect(igIsVanilla('weapon-type', 'Light Slashing')).toBe(true);
    expect(igIsVanilla('feat', 'Toughness')).toBe(true);
    // Invented content is not vanilla.
    expect(igIsVanilla('stance', 'Berserker Fury')).toBe(false);
    expect(igIsVanilla('power', 'Fireball Supreme')).toBe(false);
    expect(igIsVanilla('feat', 'My Homebrew Feat')).toBe(false);
    expect(igVanillaNames('spell')).toEqual(igVanillaNames('power')); // spell is an alias for power
  });

  it('has all 18 conditions with full mechanical text, matching the system condition list (no drift)', () => {
    expect(IG_CONDITIONS).toHaveLength(18);
    for (const c of IG_CONDITIONS) {
      expect(c.name).toBeTruthy();
      expect(c.effect && c.effect.length).toBeGreaterThan(20); // a real body, not a stub
    }
    // The names must exactly match systemConditions() so the classifier/tracker and the library agree.
    expect(IG_CONDITIONS.map((c) => c.name)).toEqual(systemConditions('intuitive-games'));
    // Spot-check a couple of verbatim mechanics from intuitivegames.net/conditions.
    const grappled = IG_CONDITIONS.find((c) => c.name === 'Grappled');
    expect(grappled?.effect).toMatch(/flat-footed/i);
    expect(grappled?.effect).toMatch(/cannot take any actions which require two hands/i);
    const flatFooted = IG_CONDITIONS.find((c) => c.name === 'Flat-Footed');
    expect(flatFooted?.effect).toMatch(/until they take an action in combat/i);
  });

  it('has all 10 ancestries, each with two verbatim traits, matching the system species list (no drift)', () => {
    expect(IG_ANCESTRIES).toHaveLength(10);
    for (const a of IG_ANCESTRIES) {
      expect(a.name).toBeTruthy();
      expect(a.blurb.length).toBeGreaterThan(10);
      expect(a.traits).toHaveLength(2);
      for (const t of a.traits) { expect(t.name).toBeTruthy(); expect(t.text.length).toBeGreaterThan(15); }
    }
    // Names must match systemSpecies() so the builder/classifier and the library agree.
    expect(IG_ANCESTRIES.map((a) => a.name)).toEqual(systemSpecies('intuitive-games'));
    // Spot-check verbatim mechanics.
    const dwarf = IG_ANCESTRIES.find((a) => a.name === 'Dwarf')!;
    expect(dwarf.traits.find((t) => t.name === 'Cave Vision')?.text).toMatch(/darkvision out to a range of 30 feet/i);
    const leshonki = IG_ANCESTRIES.find((a) => a.name === 'Leshonki')!;
    expect(leshonki.traits.find((t) => t.name === 'Barkskin')?.text).toMatch(/DR 2, which stacks/i);
    expect(IG_ANCESTRY_TRAIT_RULES).toMatch(/cannot be retrained/i);
  });

  it('has the full general-feats catalog (83) with prerequisites + effect, and the classifier knows them', () => {
    expect(IG_GENERAL_FEATS.length).toBeGreaterThanOrEqual(83);
    for (const f of IG_GENERAL_FEATS) {
      expect(f.name).toBeTruthy();
      expect(f.category).toBe('General');
      expect(f.effect.length).toBeGreaterThan(15);
      expect(['General', 'Skill', 'Special', 'Ability']).toContain(f.group);
    }
    // The previously-"suspect" names ARE real site feats (Special/Ability sections) — must be present.
    for (const real of ['Boundless Stamina', 'Daring Quickness', 'Inspiring Insight', 'Fleet', 'Toughness']) {
      expect(IG_GENERAL_FEATS.some((f) => f.name === real)).toBe(true);
    }
    // The provenance classifier recognizes every authored feat (so a real feat isn't flagged custom).
    expect(igIsVanilla('feat', 'Fleet')).toBe(true);
    expect(igIsVanilla('feat', 'Quick Caster')).toBe(true);
    expect(igIsVanilla('feat', 'My Invented Feat')).toBe(false);
    expect(igAllFeats().length).toBe(IG_GENERAL_FEATS.length);
  });

  it('the content summary exposes every kind and grounding lists the vanilla options', () => {
    const summary = igContentSummary();
    expect(Object.keys(summary)).toEqual(expect.arrayContaining(['stance', 'power', 'feat', 'defensive-power', 'weapon-type', 'movement-type']));
    const block = systemRulesBlock('intuitive-games');
    expect(block).toMatch(/Stances \(adopt one/);
    expect(block).toMatch(/Elemental Blast/);
    expect(block).toMatch(/Defensive Powers: /);
  });

  it('the AI grounding block carries the FULL IG rules text (so the AI explains/edits from IG source only)', () => {
    const block = systemRulesBlock('intuitive-games');
    // Stances: full Basic/Advanced text, not just names.
    expect(block).toMatch(/Defensive Stance: Basic \(below Lv 5\)/);
    expect(block).toMatch(/Damage Reduction equal to half your level/i);
    // Conditions: the exact IG effect, flagged as IG-specific (never another system's version).
    expect(block).toMatch(/use these EXACT Intuitive Games effects/i);
    expect(block).toMatch(/Grappled: .*two hands/i);
    // Ancestries: each with its two traits' full text.
    expect(block).toMatch(/Dwarf: Cave Vision — Gain darkvision/i);
    expect(block).toMatch(/Barkskin — You always have DR 2/i);
  });
});
