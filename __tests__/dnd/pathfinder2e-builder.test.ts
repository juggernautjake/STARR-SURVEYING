import { describe, it, expect } from 'vitest';
import { buildPF2Character, pf2ApplyBoosts, pf2ComputeAttributes, pf2WeaponStrike } from '@/lib/dnd/systems/pathfinder2e/builder';
import { PF2_WEAPONS, pf2Weapon } from '@/lib/dnd/systems/pathfinder2e/content';
import { pf2MaxHp, pf2ArmorClass, pf2ClassDc, pf2Derived, pf2SkillTotal, pf2AttackBonus } from '@/lib/dnd/systems/pathfinder2e/rules';
import { PF2_CLASSES, PF2_ANCESTRIES, PF2_BACKGROUNDS, PF2_SKILLS, PF2_ARMORS } from '@/lib/dnd/systems/pathfinder2e/content';
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

  it('every class has its Player Core key attribute + HP/level (drives class DC + max HP)', () => {
    // Only Fighter/Wizard HP was exercised (via the HP-formula tests). A wrong key attribute (Barbarian
    // CHA?) mis-computes the class DC and spell attribute; a wrong HP/level mis-sizes every level. Pin all 14.
    const GOLDEN: Record<string, { key: string[]; hp: number }> = {
      Alchemist: { key: ['INT'], hp: 8 }, Barbarian: { key: ['STR'], hp: 12 }, Bard: { key: ['CHA'], hp: 8 },
      Champion: { key: ['STR', 'DEX'], hp: 10 }, Cleric: { key: ['WIS'], hp: 8 }, Druid: { key: ['WIS'], hp: 8 },
      Fighter: { key: ['STR', 'DEX'], hp: 10 }, Monk: { key: ['STR', 'DEX'], hp: 10 }, Oracle: { key: ['CHA'], hp: 8 },
      Ranger: { key: ['STR', 'DEX'], hp: 10 }, Rogue: { key: ['DEX'], hp: 8 }, Sorcerer: { key: ['CHA'], hp: 6 },
      Witch: { key: ['INT'], hp: 6 }, Wizard: { key: ['INT'], hp: 6 },
    };
    for (const cls of PF2_CLASSES) {
      const g = GOLDEN[cls.name];
      expect(g, `no golden entry for class "${cls.name}"`).toBeDefined();
      expect(cls.keyAttribute, `${cls.name} key attribute`).toEqual(g.key);
      expect(cls.hpPerLevel, `${cls.name} HP/level`).toBe(g.hp);
    }
  });

  it('every ancestry has its Player Core HP / size / speed / boosts (not just the spot-checked few)', () => {
    // Only Dwarf/Elf HP + Dwarf speed were exercised (via the HP formula / armor tests). Pin all 8 —
    // the distinctive values a typo would hit are Dwarf speed 20 and Elf speed 30 (the rest 25), the
    // 6/8/10 HP tiers, and the boost patterns (Human = two free, Orc = STR + two free).
    const GOLDEN: Record<string, { hp: number; size: string; speed: number; boosts: string[] }> = {
      Dwarf: { hp: 10, size: 'Medium', speed: 20, boosts: ['CON', 'WIS', 'free'] },
      Elf: { hp: 6, size: 'Medium', speed: 30, boosts: ['DEX', 'INT', 'free'] },
      Gnome: { hp: 8, size: 'Small', speed: 25, boosts: ['CON', 'CHA', 'free'] },
      Goblin: { hp: 6, size: 'Small', speed: 25, boosts: ['DEX', 'CHA', 'free'] },
      Halfling: { hp: 6, size: 'Small', speed: 25, boosts: ['DEX', 'WIS', 'free'] },
      Human: { hp: 8, size: 'Medium', speed: 25, boosts: ['free', 'free'] },
      Leshy: { hp: 8, size: 'Small', speed: 25, boosts: ['CON', 'WIS', 'free'] },
      Orc: { hp: 10, size: 'Medium', speed: 25, boosts: ['STR', 'free', 'free'] },
    };
    for (const anc of PF2_ANCESTRIES) {
      const g = GOLDEN[anc.name];
      expect(g, `no golden entry for ancestry "${anc.name}"`).toBeDefined();
      expect(anc.hp, `${anc.name} HP`).toBe(g.hp);
      expect(anc.size, `${anc.name} size`).toBe(g.size);
      expect(anc.speed, `${anc.name} speed`).toBe(g.speed);
      expect(anc.boosts, `${anc.name} boosts`).toEqual(g.boosts);
    }
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
  it('gets level-appropriate spell slots (level 1 → 5 cantrips + two 1st-rank)', () => {
    expect(char.spellcasting.slots).toEqual([5, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('buildPF2Character threads higher-level spell slots', () => {
  it('a level-9 Sorcerer gets slots up to 5th rank', () => {
    const c = buildPF2Character({ ancestry: 'Human', className: 'Sorcerer', level: 9, attributes: { CHA: 4 } });
    expect(c.spellcasting.slots).toEqual([5, 3, 3, 3, 3, 2, 0, 0, 0, 0, 0]);
  });
});

describe('PF2 armor drives AC, Dex cap, and speed', () => {
  it('has the four categories with a sane Unarmored default', () => {
    expect(PF2_ARMORS[0].name).toBe('Unarmored');
    expect(PF2_ARMORS[0].dexCap).toBeNull();
    expect(new Set(PF2_ARMORS.map((a) => a.category))).toEqual(new Set(['unarmored', 'light', 'medium', 'heavy']));
  });
  it('unarmored AC is uncapped: 10 + full Dex + trained', () => {
    const c = buildPF2Character({ className: 'Monk', ancestry: 'Elf', level: 1, attributes: { DEX: 4 }, armor: 'Unarmored' });
    expect(c.combat.dexCap).toBeNull();
    expect(pf2ArmorClass(c)).toBe(10 + 4 + (2 + 1)); // 17
  });
  it('full plate caps Dex at 0 and adds +6: a Fighter with high Dex still gets the capped AC', () => {
    const c = buildPF2Character({ className: 'Fighter', ancestry: 'Dwarf', level: 1, attributes: { DEX: 3, STR: 4 }, armor: 'Full Plate' });
    expect(c.combat.dexCap).toBe(0);
    expect(c.combat.acItemBonus).toBe(6);
    expect(pf2ArmorClass(c)).toBe(10 + 0 + (2 + 1) + 6); // 19 (Dex capped away)
  });
  it('meeting the armor Strength requirement reduces the speed penalty (heavy −10 → −5; met → −5)', () => {
    // Dwarf speed 20. Full Plate str req 4, speed penalty -10.
    const met = buildPF2Character({ className: 'Fighter', ancestry: 'Dwarf', level: 1, attributes: { STR: 4 }, armor: 'Full Plate' });
    expect(met.combat.speed).toBe(20 - 5);   // Strength met → penalty reduced by 5
    const unmet = buildPF2Character({ className: 'Fighter', ancestry: 'Dwarf', level: 1, attributes: { STR: 1 }, armor: 'Full Plate' });
    expect(unmet.combat.speed).toBe(20 - 10); // full penalty
  });
  it('records the worn armor name for display', () => {
    const c = buildPF2Character({ className: 'Cleric', ancestry: 'Human', armor: 'Breastplate' });
    expect(c.combat.armorName).toBe('Breastplate');
  });
  it('applies the armor CHECK penalty only to the 4 armor skills, and only when Strength is unmet', () => {
    // Full Plate check penalty -3, Str req 4. Unmet (STR 0) → penalty bites Athletics/Stealth etc.
    const unmet = buildPF2Character({ className: 'Fighter', ancestry: 'Human', level: 1, attributes: { STR: 0, DEX: 2 }, armor: 'Full Plate', trainedSkills: ['Athletics', 'Arcana'] });
    expect(unmet.combat.armorCheckPenalty).toBe(-3);
    const athletics = unmet.skills.find((s) => s.name === 'Athletics')!; // STR skill, armor-penalized
    const arcana = unmet.skills.find((s) => s.name === 'Arcana')!;        // INT skill, NOT penalized
    expect(pf2SkillTotal(athletics, 1, unmet.attributes, unmet.combat.armorCheckPenalty)).toBe(0 + (2 + 1) - 3); // 0
    expect(pf2SkillTotal(arcana, 1, unmet.attributes, unmet.combat.armorCheckPenalty)).toBe(0 + (2 + 1));         // 3 (no penalty)
    // Meeting the requirement waives the check penalty entirely.
    const met = buildPF2Character({ className: 'Fighter', ancestry: 'Human', level: 1, attributes: { STR: 4 }, armor: 'Full Plate', trainedSkills: ['Athletics'] });
    expect(met.combat.armorCheckPenalty).toBe(0);
    const metAth = met.skills.find((s) => s.name === 'Athletics')!;
    expect(pf2SkillTotal(metAth, 1, met.attributes, met.combat.armorCheckPenalty)).toBe(4 + (2 + 1)); // 7, no penalty
  });
  it('flags exactly the four armor-check skills', () => {
    const c = buildPF2Character({ className: 'Rogue', ancestry: 'Elf' });
    const flagged = c.skills.filter((s) => s.armorPenalty).map((s) => s.name).sort();
    expect(flagged).toEqual(['Acrobatics', 'Athletics', 'Stealth', 'Thievery']);
  });
});

describe('PF2 ancestry senses reach the character', () => {
  it('a Dwarf carries Darkvision; an Elf carries Low-light vision', () => {
    expect(buildPF2Character({ ancestry: 'Dwarf', className: 'Fighter' }).senses).toEqual(['Darkvision']);
    expect(buildPF2Character({ ancestry: 'Elf', className: 'Wizard' }).senses).toEqual(['Low-light vision']);
  });
  it('an ancestry with no special sense (Human) has none', () => {
    expect(buildPF2Character({ ancestry: 'Human', className: 'Fighter' }).senses).toEqual([]);
  });
});

describe('PF2 weapons become real Strikes', () => {
  it('has simple + martial weapons and a lookup', () => {
    expect(PF2_WEAPONS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(PF2_WEAPONS.map((w) => w.category))).toEqual(new Set(['simple', 'martial']));
    expect(pf2Weapon('longsword')!.damageDie).toBe('1d8');
  });
  it('a melee Strike uses STR and adds STR to damage', () => {
    const s = pf2WeaponStrike(pf2Weapon('Longsword')!, { STR: 4, DEX: 1, CON: 0, INT: 0, WIS: 0, CHA: 0 }, 'expert');
    expect(s.attribute).toBe('STR');
    expect(s.damage).toBe('1d8+4 slashing');
  });
  it('a finesse melee weapon uses DEX when it beats STR', () => {
    const s = pf2WeaponStrike(pf2Weapon('Rapier')!, { STR: 1, DEX: 4, CON: 0, INT: 0, WIS: 0, CHA: 0 }, 'trained');
    expect(s.attribute).toBe('DEX');
  });
  it('a ranged weapon uses DEX and shows the die without a STR bonus', () => {
    const s = pf2WeaponStrike(pf2Weapon('Longbow')!, { STR: 4, DEX: 3, CON: 0, INT: 0, WIS: 0, CHA: 0 }, 'trained');
    expect(s.attribute).toBe('DEX');
    expect(s.damage).toBe('1d8 piercing');
  });
  it('the builder adds the weapon Strike before the Fist, at the class attack rank', () => {
    const c = buildPF2Character({ className: 'Fighter', ancestry: 'Human', level: 1, attributes: { STR: 4 }, weapon: 'Greatsword' });
    expect(c.attacks[0].name).toBe('Greatsword');
    expect(c.attacks[0].rank).toBe('expert');                 // Fighter attack proficiency
    expect(c.attacks[c.attacks.length - 1].name).toBe('Fist'); // Fist still present
    expect(pf2AttackBonus(c.attacks[0], 1, c.attributes)).toBe(4 + (4 + 1)); // STR + expert prof
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
  it('includes the gear/spell/subclass catalogs so an AI build can reference real ones', () => {
    const titles = pf2Catalog().map((g) => g.title);
    expect(titles).toEqual(expect.arrayContaining(['Weapons', 'Armor', 'Spells', 'Subclasses']));
    const spells = pf2Catalog().find((g) => g.title === 'Spells')!;
    expect(spells.entries.some((e) => e.name === 'Fireball')).toBe(true);
  });
});
