// __tests__/dnd/built-sheet-complete.test.ts — a built character must arrive PLAYABLE, in every system.
//
// Slices 10–11 of the final-QA walkthrough found that a 5e character built through the manual builder
// rendered with **1 hit point, AC 10, no save proficiencies and no class features**. Nothing caught it,
// because every existing test asked "did assembly return the right identity?" and none asked "is the
// resulting sheet playable?".
//
// This is that missing question, asked of all three built systems at once. It is deliberately about
// COHERENCE rather than exact numbers — the per-system suites already pin the arithmetic — so it stays
// meaningful as the rules data grows, and it fails loudly for the specific shape of the bug it exists for:
// a character whose derived stats were never populated and silently kept the blank template's defaults.
import { describe, it, expect } from 'vitest';
import { assembleDnd5e } from '@/lib/dnd/statgen/assemble5e';
import { assemblePF2VanillaCharacter } from '@/lib/dnd/systems/pathfinder2e/builder';
import { assembleIGVanillaCharacter } from '@/lib/dnd/systems/intuitive-games/builder';
import { findClass } from '@/lib/dnd/classes/registry';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

describe('D&D 5e — a built sheet is playable, not a blank template', () => {
  const LEVEL = 8;
  const abilities = { str: 17, dex: 14, con: 14, int: 12, wis: 10, cha: 8 } as const;
  const built = (className: string, subclass?: string) =>
    assembleDnd5e({ system: 'dnd5e-2024', level: LEVEL, className, subclass, name: 'T', abilities: { ...abilities } });

  const blank = blankCharacter('blank');

  it.each(['fighter', 'wizard', 'rogue', 'cleric'])('%s: hit die comes from the class, not the blank default', (key) => {
    const a = built(key);
    expect(a.combat.hitDiceSize).toBe(findClass('dnd5e-2024', key)!.hitDie);
    expect(a.combat.hitDiceTotal).toBe(LEVEL);
  });

  it.each(['fighter', 'wizard', 'rogue', 'cleric'])('%s: HP is a real level-8 total, not the template 1', (key) => {
    const a = built(key);
    expect(a.combat.maxHp).toBeGreaterThan(blank.combat.maxHp);
    // Sanity band rather than an exact figure: at least the hit die per level at minimum rolls, and never
    // more than the maximum roll per level plus a generous CON.
    expect(a.combat.maxHp).toBeGreaterThanOrEqual(LEVEL * 2);
    expect(a.combat.maxHp).toBeLessThanOrEqual(LEVEL * (a.combat.hitDiceSize + 5));
    expect(a.combat.currentHp).toBe(a.combat.maxHp);
  });

  it.each(['fighter', 'wizard', 'rogue', 'cleric'])('%s: has exactly the class’s save proficiencies', (key) => {
    const a = built(key);
    const proficient = Object.entries(a.saves).filter(([, v]) => v?.proficient).map(([k]) => k).sort();
    expect(proficient).toEqual([...findClass('dnd5e-2024', key)!.savingThrows].sort());
  });

  it.each(['fighter', 'wizard', 'rogue', 'cleric'])('%s: arrives with its class features', (key) => {
    const a = built(key);
    expect(a.classFeatures.length, `${key} has no class features`).toBeGreaterThan(0);
    for (const f of a.classFeatures) {
      expect(f.unlockLevel).toBeLessThanOrEqual(LEVEL);
      expect(f.body.join('').length, `${f.name} has no rules text`).toBeGreaterThan(0);
    }
  });

  it('unarmored AC reflects Dexterity rather than a bare 10', () => {
    expect(built('fighter').combat.ac).toBe(12);           // DEX 14
    const nimble = assembleDnd5e({ system: 'dnd5e-2024', level: 1, className: 'rogue', name: 'T',
      abilities: { ...abilities, dex: 18 } });
    expect(nimble.combat.ac).toBe(14);
  });
});

describe('Pathfinder 2e — the bespoke build already applies its progression', () => {
  // Checked as part of the same sweep and found healthy; pinned so it stays that way.
  const c = assemblePF2VanillaCharacter({ className: 'Fighter', ancestry: 'Human', background: 'Warrior', level: 8, name: 'P' } as never);

  it('carries real hit points from ancestry + class + level', () => {
    expect(c.pf2e.combat.ancestryHp).toBeGreaterThan(0);
    expect(c.pf2e.combat.classHpPerLevel).toBeGreaterThan(0);
    expect(c.pf2e.combat.currentHp).toBeGreaterThan(8);
  });

  it('advances proficiency ranks off the class progression, not a flat default', () => {
    const ranks = [c.pf2e.perception.rank, c.pf2e.saves.Fortitude.rank, c.pf2e.combat.classDcRank];
    expect(ranks.every((r) => typeof r === 'string' && r.length > 0)).toBe(true);
    // A level-8 Fighter is past its first advances — something must be better than trained.
    expect(ranks.some((r) => r === 'expert' || r === 'master' || r === 'legendary')).toBe(true);
  });

  it('keeps the shared meta in step with the sidecar', () => {
    expect(c.meta.level).toBe(c.pf2e.identity.level);
    expect(c.meta.className).toBe(c.pf2e.identity.className);
  });
});

describe('Intuitive Games — the bespoke build produces a coherent sheet', () => {
  const c = assembleIGVanillaCharacter({ subclass: 'Freebooter', ancestry: 'Human', background: 'Soldier', level: 6, name: 'I' } as never);

  it('records the identity the IG sheet reads', () => {
    expect(c.ig.identity.level).toBe(6);
    expect(c.ig.identity.subclass).toBe('Freebooter');
    expect(c.meta.level).toBe(c.ig.identity.level);
  });

  it('has the combat block the IG sheet renders from', () => {
    for (const k of ['hitPoints', 'saves', 'stances', 'defensivePower']) {
      expect(c.ig.combat, `IG combat is missing ${k}`).toHaveProperty(k);
    }
  });
});
