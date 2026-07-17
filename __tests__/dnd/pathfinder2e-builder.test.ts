import { describe, it, expect } from 'vitest';
import { buildPF2Character, pf2ApplyBoosts, pf2ComputeAttributes } from '@/lib/dnd/systems/pathfinder2e/builder';
import { pf2MaxHp, pf2ArmorClass, pf2ClassDc, pf2Derived } from '@/lib/dnd/systems/pathfinder2e/rules';
import { PF2_CLASSES, PF2_ANCESTRIES, PF2_BACKGROUNDS, PF2_SKILLS } from '@/lib/dnd/systems/pathfinder2e/content';
import { pf2Catalog, pf2CatalogCount } from '@/lib/dnd/systems/pathfinder2e/catalog';

describe('pf2 content library', () => {
  it('has the 14 Remaster classes', () => {
    expect(PF2_CLASSES.map((c) => c.name).sort()).toEqual([
      'Alchemist', 'Barbarian', 'Bard', 'Champion', 'Cleric', 'Druid', 'Fighter',
      'Monk', 'Oracle', 'Ranger', 'Rogue', 'Sorcerer', 'Witch', 'Wizard',
    ]);
  });
  it('has the 8 core ancestries and 16 skills', () => {
    expect(PF2_ANCESTRIES).toHaveLength(8);
    expect(PF2_SKILLS).toHaveLength(16);
  });
  it('only the Fighter starts Expert in attacks', () => {
    for (const c of PF2_CLASSES) {
      expect(c.initial.attacks).toBe(c.name === 'Fighter' ? 'expert' : 'trained');
    }
  });
  it('every spellcasting class names a tradition + kind', () => {
    const casters = PF2_CLASSES.filter((c) => c.spellcasting);
    expect(casters.map((c) => c.name).sort()).toEqual(['Bard', 'Cleric', 'Druid', 'Oracle', 'Sorcerer', 'Witch', 'Wizard']);
  });
  it('backgrounds each grant a skill that exists', () => {
    const skillNames = new Set(PF2_SKILLS.map((s) => s.name));
    for (const b of PF2_BACKGROUNDS) expect(skillNames.has(b.skill)).toBe(true);
  });
  it('every class declares subclassOptions; only Fighter and Monk (no formal subclass) are empty', () => {
    const empty = PF2_CLASSES.filter((c) => c.subclassOptions.length === 0).map((c) => c.name).sort();
    expect(empty).toEqual(['Fighter', 'Monk']);
    // Spot-check a few well-known Remaster line-ups.
    expect(PF2_CLASSES.find((c) => c.name === 'Barbarian')!.subclassOptions).toEqual(['Animal', 'Dragon', 'Fury', 'Giant', 'Spirit']);
    expect(PF2_CLASSES.find((c) => c.name === 'Rogue')!.subclassOptions).toContain('Thief');
    expect(PF2_CLASSES.find((c) => c.name === 'Cleric')!.subclassOptions).toEqual(['Cloistered Cleric', 'Warpriest']);
    // No blank or duplicate options anywhere.
    for (const c of PF2_CLASSES) {
      expect(c.subclassOptions.every((o) => o.trim().length > 0)).toBe(true);
      expect(new Set(c.subclassOptions).size).toBe(c.subclassOptions.length);
    }
  });
});

describe('pf2 attribute boosts', () => {
  it('a boost gives +1 below +4, half above (partials pair up within a boost set)', () => {
    const base = { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 };
    // Four boosts take STR 0→4; the 5th is a lone partial (no gain); the 6th completes it → +5.
    expect(pf2ApplyBoosts(base, ['STR', 'STR', 'STR', 'STR']).STR).toBe(4);
    expect(pf2ApplyBoosts(base, ['STR', 'STR', 'STR', 'STR', 'STR']).STR).toBe(4);
    expect(pf2ApplyBoosts(base, ['STR', 'STR', 'STR', 'STR', 'STR', 'STR']).STR).toBe(5);
  });
});

describe('buildPF2Character (level-1 Dwarf Fighter)', () => {
  const char = buildPF2Character({
    name: 'Durgan', level: 1, ancestry: 'Dwarf', heritage: 'Rock', background: 'Warrior',
    className: 'Fighter', keyAttribute: 'STR', trainedSkills: ['Intimidation'],
    attributes: { STR: 4, DEX: 1, CON: 3, INT: 0, WIS: 1, CHA: 0 },
  });
  it('sets identity from the picks', () => {
    expect(char.identity.ancestry).toBe('Dwarf');
    expect(char.identity.className).toBe('Fighter');
    expect(char.identity.size).toBe('Medium');
  });
  it('applies Fighter level-1 proficiencies (Expert attacks, Expert Fort/Reflex, Trained Will)', () => {
    expect(char.combat.attackRank).toBe('expert');
    expect(char.saves.Fortitude.rank).toBe('expert');
    expect(char.saves.Reflex.rank).toBe('expert');
    expect(char.saves.Will.rank).toBe('trained');
  });
  it('HP = Dwarf 10 + (Fighter 10 + CON 3) × 1 = 23', () => {
    expect(pf2MaxHp(char)).toBe(10 + (10 + 3) * 1);
  });
  it('trains Athletics? no — Fighter has no fixed skill; background Warrior trains Athletics + free pick', () => {
    const trained = char.skills.filter((s) => s.rank === 'trained').map((s) => s.name).sort();
    expect(trained).toContain('Athletics');      // from Warrior background
    expect(trained).toContain('Intimidation');   // free pick
  });
  it('class DC uses STR + trained proficiency', () => {
    expect(pf2ClassDc(char)).toBe(10 + 4 + (2 + 1)); // 17
  });
  it('a martial (non-caster) has no spellcasting', () => {
    expect(char.spellcasting.kind).toBe('none');
  });
  it('has a default unarmed Strike', () => {
    expect(char.attacks[0].name).toBe('Fist');
  });
});

describe('buildPF2Character (level-1 Elf Wizard)', () => {
  const char = buildPF2Character({
    ancestry: 'Elf', background: 'Scholar', className: 'Wizard', keyAttribute: 'INT',
    attributes: { STR: 0, DEX: 2, CON: 1, INT: 4, WIS: 1, CHA: 0 },
  });
  it('is an arcane prepared caster', () => {
    expect(char.spellcasting.tradition).toBe('arcane');
    expect(char.spellcasting.kind).toBe('prepared');
    expect(char.spellcasting.attribute).toBe('INT');
  });
  it('HP = Elf 6 + (Wizard 6 + CON 1) × 1 = 13', () => {
    expect(pf2MaxHp(char)).toBe(6 + (6 + 1) * 1);
  });
  it('trains Arcana (class fixed skill)', () => {
    expect(char.skills.find((s) => s.name === 'Arcana')!.rank).toBe('trained');
  });
});

describe('pf2ComputeAttributes derives boosts when no final map given', () => {
  it('stacks ancestry + class key + free boosts', () => {
    const cls = PF2_CLASSES.find((c) => c.name === 'Barbarian')!;
    const anc = PF2_ANCESTRIES.find((a) => a.name === 'Orc')!;
    const a = pf2ComputeAttributes(cls, anc, { className: 'Barbarian', ancestry: 'Orc', keyAttribute: 'STR', freeBoosts: ['CON', 'DEX'] });
    // Orc: STR (fixed) ; Barbarian key: STR ; free: CON, DEX
    expect(a.STR).toBe(2); // ancestry STR + class key STR
    expect(a.CON).toBe(1);
    expect(a.DEX).toBe(1);
  });
});

describe('pf2 catalog', () => {
  it('renders grouped and counts every entry', () => {
    const groups = pf2Catalog();
    expect(groups.map((g) => g.title)).toContain('Classes');
    expect(pf2CatalogCount()).toBeGreaterThanOrEqual(14 + 8 + PF2_BACKGROUNDS.length + 16);
  });
});
