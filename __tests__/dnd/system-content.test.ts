// __tests__/dnd/system-content.test.ts — the per-system bulk lists (classes/species/skills/
// conditions) are correct, self-consistent, and don't cross editions where they must differ.
import { describe, it, expect } from 'vitest';
import { rulesForSystem, systemSkills, systemClasses, systemSpecies, systemConditions, systemRulesBlock } from '@/lib/dnd/system-rules';
import { GAME_SYSTEMS } from '@/lib/dnd/systems';

describe('system content lists (Slice 2)', () => {
  // Floors that hold for EVERY system, including the non-d20 ones. They are lower than the
  // d20-fantasy numbers on purpose: Call of Cthulhu investigators are all human (1 "species"),
  // Blades has 7 playbooks, and Shadowrun has exactly 5 metatypes. Those are the real rules —
  // the richer d20 lists are asserted separately below so that coverage isn't lost.
  it('every system has non-empty, well-formed lists', () => {
    for (const s of GAME_SYSTEMS) {
      const r = rulesForSystem(s.key)!;
      expect(r.content.skills.length, `${s.key} skills`).toBeGreaterThanOrEqual(10);
      expect(r.content.classes.length, `${s.key} classes`).toBeGreaterThanOrEqual(6);
      expect(r.content.species.length, `${s.key} species`).toBeGreaterThanOrEqual(1);
      expect(r.content.conditions.length, `${s.key} conditions`).toBeGreaterThanOrEqual(8);
      // Every class references an ability the system defines.
      const abilities = new Set(r.ability.abilities);
      for (const c of r.content.classes) expect(abilities.has(c.keyAbility), `${s.key} ${c.name} keyAbility`).toBe(true);
      // Every skill's governing ability is one the system defines.
      for (const sk of r.content.skills) expect(abilities.has(sk.ability), `${s.key} ${sk.name}`).toBe(true);
    }
  });

  // The d20 fantasy systems keep the richer lists the original floors were written for.
  it('the d20 fantasy systems still carry full class/species/condition lists', () => {
    for (const key of ['dnd5e-2014', 'dnd5e-2024', 'pathfinder2e', 'pathfinder1e', 'starfinder1e']) {
      const r = rulesForSystem(key)!;
      expect(r.content.classes.length, `${key} classes`).toBeGreaterThan(8);
      expect(r.content.species.length, `${key} species`).toBeGreaterThan(5);
      expect(r.content.conditions.length, `${key} conditions`).toBeGreaterThan(10);
    }
  });

  // The point of adding non-d20 systems: prove the model can express them WITHOUT inventing
  // d20 scaffolding. These systems have no levels and no hit dice — that must be represented.
  it('the level-less systems declare no levels and no hit dice', () => {
    for (const key of ['coc7e', 'blades', 'cyberpunk-red', 'shadowrun6e']) {
      const r = rulesForSystem(key)!;
      expect(r.levelMin, `${key} levelMin`).toBe(1);
      expect(r.levelMax, `${key} levelMax`).toBe(1); // levelMin === levelMax === 1 ⇒ no levels
      expect(r.profBonusByLevel, `${key} has no proficiency bonus`).toBeNull();
      for (const c of r.content.classes) {
        expect(c.hitDie, `${key} ${c.name} hitDie`).toBeNull();
        expect(c.hpPerLevel, `${key} ${c.name} hpPerLevel`).toBeNull();
      }
    }
  });

  it('5e uses hit dice; PF2 uses HP-per-level (never a hit die)', () => {
    for (const c of systemClasses('dnd5e-2014')) { expect(c.hitDie).toBeTruthy(); expect(c.hpPerLevel).toBeNull(); }
    for (const c of systemClasses('pathfinder2e')) { expect(c.hitDie).toBeNull(); expect(c.hpPerLevel).toBeTruthy(); }
  });

  it('5e saves are ability-based; PF2 saves are Fortitude/Reflex/Will', () => {
    const fiveSaves = new Set(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']);
    for (const c of systemClasses('dnd5e-2024')) for (const s of c.saves) expect(fiveSaves.has(s)).toBe(true);
    const pf2Saves = new Set(['Fortitude', 'Reflex', 'Will']);
    for (const c of systemClasses('pathfinder2e')) for (const s of c.saves) expect(pf2Saves.has(s)).toBe(true);
  });

  it('the 2014 vs 2024 species lists differ as they really do (Half-Elf/Half-Orc vs Aasimar/Goliath/Orc)', () => {
    const s14 = new Set(systemSpecies('dnd5e-2014'));
    const s24 = new Set(systemSpecies('dnd5e-2024'));
    expect(s14.has('Half-Elf')).toBe(true);
    expect(s14.has('Half-Orc')).toBe(true);
    expect(s24.has('Half-Elf')).toBe(false); // 2024 dropped standalone half-races
    expect(s24.has('Aasimar')).toBe(true);
    expect(s24.has('Goliath')).toBe(true);
    expect(s24.has('Orc')).toBe(true);
  });

  it('PF2 skills and conditions are PF2-specific (not the 5e sets)', () => {
    const pfSkills = new Set(systemSkills('pathfinder2e').map((s) => s.name));
    expect(pfSkills.has('Thievery')).toBe(true);   // PF2-only
    expect(pfSkills.has('Occultism')).toBe(true);  // PF2-only
    expect(pfSkills.has('Investigation')).toBe(false); // 5e-only skill name
    const pfConds = new Set(systemConditions('pathfinder2e'));
    expect(pfConds.has('Off-Guard')).toBe(true);   // Remaster term
    expect(pfConds.has('Clumsy')).toBe(true);       // PF2 numeric condition
    expect(systemConditions('dnd5e-2014').includes('Off-Guard')).toBe(false);
  });

  it('the rules block lists the valid classes, species, and skills for the system', () => {
    const b = systemRulesBlock('pathfinder2e');
    expect(b).toMatch(/Valid classes.*Witch/s);
    expect(b).toMatch(/Valid species\/ancestries.*Leshy/s);
    expect(b).toMatch(/Thievery/);
  });
});
