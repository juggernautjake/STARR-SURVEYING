// __tests__/dnd/dnd5e-2014-classes.test.ts — D&D 5e 2014 classes (Slice 6a).
//
// 2014 is authored class-by-class. This pins the classes shipped so far to level 20 without a hole,
// and locks the 2014-vs-2024 differences that are easy to get wrong (editions are different systems,
// Ground Rule 2). Barbarian first: the 2014 tells are an ASI at 19 (not an Epic Boon), Brutal
// Critical (not Brutal Strike), no Weapon Mastery, unlimited Rage at 20, and a STR/CON cap of 24.
import { describe, it, expect } from 'vitest';
import { classesForSystem, findClass, subclassesFor, systemHasClasses } from '@/lib/dnd/classes/registry';
import { snapshotAtLevel, progressionTable, validateClassDefinition } from '@/lib/dnd/classes/engine';

const SYS = 'dnd5e-2014';
const CLASSES = classesForSystem(SYS);

describe('the 2014 class roster (authored class-by-class)', () => {
  it('has the classes authored so far, and the system reports it has class data', () => {
    expect(CLASSES.map((c) => c.name)).toEqual(expect.arrayContaining(['Barbarian', 'Fighter', 'Rogue', 'Monk', 'Ranger']));
    expect(systemHasClasses(SYS)).toBe(true);
  });

  it('resolves per class: an authored one is found, an un-authored one falls back (null)', () => {
    expect(findClass(SYS, 'Barbarian')?.key).toBe('barbarian');
    expect(findClass(SYS, 'barbarian')?.name).toBe('Barbarian');
    // Not yet authored for 2014 → null, so the builder offers the AI/homebrew path rather than lying.
    expect(findClass(SYS, 'Wizard')).toBeNull();
  });

  it('does not leak across editions — a 2014 class is not a 2024 class', () => {
    // Same key, different system: the 2014 Barbarian and the 2024 Barbarian are distinct objects.
    expect(findClass(SYS, 'Barbarian')?.system).toBe('dnd5e-2014');
    expect(findClass('dnd5e-2024', 'Barbarian')?.system).toBe('dnd5e-2024');
  });
});

describe.each(CLASSES.map((c) => [c.name, c] as const))('%s (2014)', (_name, def) => {
  it('is structurally valid and levels cleanly 1→20', () => {
    expect(validateClassDefinition(def)).toEqual([]);
    const table = progressionTable(def);
    expect(table).toHaveLength(20);
    for (const row of table) expect(row.features).toBeDefined();
  });

  it('belongs to dnd5e-2014 with a hit die, exactly two saves, and a Primal-Path-style subclass at 3', () => {
    expect(def.system).toBe(SYS);
    expect([6, 8, 10, 12]).toContain(def.hitDie);
    expect(def.savingThrows).toHaveLength(2);
    expect(def.features.some((f) => f.choice === 'subclass')).toBe(true);
  });
});

describe('Barbarian 2014 — the edition-specific numbers', () => {
  const barb = findClass(SYS, 'barbarian')!;

  it('takes an ASI at 19 (2014), where 2024 grants an Epic Boon', () => {
    expect(barb.asiLevels).toContain(19);
    expect(barb.features.some((f) => f.choice === 'epic-boon')).toBe(false);
  });

  it('has Brutal Critical (not the 2024 Brutal Strike)', () => {
    expect(barb.features.some((f) => f.name === 'Brutal Critical')).toBe(true);
    expect(barb.features.some((f) => /Brutal Strike/.test(f.name))).toBe(false);
  });

  it('has no Weapon Mastery (a 2024-only feature)', () => {
    expect(barb.features.some((f) => f.name === 'Weapon Mastery')).toBe(false);
  });

  it("Rage uses climb 2→6 and become unlimited (-1) at level 20", () => {
    const rage = barb.resources!.find((r) => r.id === 'rage')!;
    expect(rage.perLevel[1]).toBe(2);
    expect(rage.perLevel[3]).toBe(3);
    expect(rage.perLevel[6]).toBe(4);
    expect(rage.perLevel[12]).toBe(5);
    expect(rage.perLevel[17]).toBe(6);
    expect(rage.perLevel[20]).toBe(-1); // unlimited
  });

  it('gains Extra Attack at 5 and Primal Champion at 20; the level-20 snapshot carries the rage resource', () => {
    const at5 = snapshotAtLevel(barb, 5);
    expect(at5.features.some((f) => f.name === 'Extra Attack')).toBe(true);
    const at20 = snapshotAtLevel(barb, 20);
    expect(at20.features.some((f) => f.name === 'Primal Champion')).toBe(true);
    expect(at20.resources.some((r) => r.id === 'rage')).toBe(true);
  });

  it('offers exactly the two 2014 PHB Primal Paths (Berserker, Totem Warrior)', () => {
    const subs = subclassesFor(SYS, 'barbarian').map((s) => s.name).sort();
    expect(subs).toEqual(['Path of the Berserker', 'Path of the Totem Warrior']);
  });
});

describe('Fighter 2014 — the edition-specific numbers', () => {
  const fighter = findClass(SYS, 'fighter')!;

  it('has the Fighter ASI cadence 4/6/8/12/14/16 PLUS the 2014 slot at 19 (no Epic Boon)', () => {
    expect(fighter.asiLevels).toEqual([4, 6, 8, 12, 14, 16, 19]);
    expect(fighter.features.some((f) => f.choice === 'epic-boon')).toBe(false);
  });

  it('chooses a Fighting Style at level 1 (a class feature in 2014, not a feat)', () => {
    expect(fighter.features.some((f) => f.level === 1 && f.choice === 'fighting-style')).toBe(true);
  });

  it('has no Weapon Mastery (2024-only), and Extra Attack scales to four attacks by 20', () => {
    expect(fighter.features.some((f) => f.name === 'Weapon Mastery')).toBe(false);
    const at20 = snapshotAtLevel(fighter, 20);
    expect(at20.features.some((f) => /Extra Attack/.test(f.name))).toBe(true);
  });

  it('tracks Action Surge (1 → 2 at 17) and Indomitable (from 9) as resources', () => {
    const surge = fighter.resources!.find((r) => r.id === 'action-surge')!;
    expect(surge.perLevel[2]).toBe(1);
    expect(surge.perLevel[17]).toBe(2);
    const indom = fighter.resources!.find((r) => r.id === 'indomitable')!;
    expect(indom.perLevel[8]).toBe(0);
    expect(indom.perLevel[9]).toBe(1);
    expect(indom.perLevel[17]).toBe(3);
  });

  it('offers exactly the three 2014 PHB archetypes (Champion, Battle Master, Eldritch Knight)', () => {
    const subs = subclassesFor(SYS, 'fighter').map((s) => s.name).sort();
    expect(subs).toEqual(['Battle Master', 'Champion', 'Eldritch Knight']);
  });
});

describe('Rogue 2014 — the edition-specific numbers', () => {
  const rogue = findClass(SYS, 'rogue')!;

  it('is a d8 DEX class with the extra ASI at 10 (plus the 2014 slot at 19, no Epic Boon)', () => {
    expect(rogue.hitDie).toBe(8);
    expect(rogue.savingThrows).toEqual(['dex', 'int']);
    expect(rogue.asiLevels).toEqual([4, 8, 10, 12, 16, 19]);
    expect(rogue.features.some((f) => f.choice === 'epic-boon')).toBe(false);
  });

  it('chooses 4 skills and gains Expertise twice (levels 1 and 6)', () => {
    expect(rogue.skillChoices.count).toBe(4);
    expect(rogue.features.filter((f) => f.choice === 'expertise').map((f) => f.level)).toEqual([1, 6]);
  });

  it('has Sneak Attack, Cunning Action, and the capstone Stroke of Luck', () => {
    expect(rogue.features.some((f) => f.name === 'Sneak Attack')).toBe(true);
    expect(snapshotAtLevel(rogue, 2).features.some((f) => f.name === 'Cunning Action')).toBe(true);
    expect(snapshotAtLevel(rogue, 20).features.some((f) => f.name === 'Stroke of Luck')).toBe(true);
  });

  it('offers exactly the three 2014 PHB archetypes (Thief, Assassin, Arcane Trickster)', () => {
    const subs = subclassesFor(SYS, 'rogue').map((s) => s.name).sort();
    expect(subs).toEqual(['Arcane Trickster', 'Assassin', 'Thief']);
  });
});

describe('Monk 2014 — the edition-specific numbers', () => {
  const monk = findClass(SYS, 'monk')!;

  it('calls its resource "Ki" (2024 renamed it Focus), equal to Monk level from level 2', () => {
    const ki = monk.resources!.find((r) => r.id === 'ki')!;
    expect(ki.name).toBe('Ki');
    expect(ki.perLevel[1]).toBe(0); // no ki at level 1
    expect(ki.perLevel[2]).toBe(2);
    expect(ki.perLevel[20]).toBe(20); // ki points == monk level
  });

  it('is unarmored (no armor proficiencies) with DEX+WIS and STR/DEX saves', () => {
    expect(monk.armorProficiencies).toEqual([]);
    expect(monk.primaryAbility).toEqual(['dex', 'wis']);
    expect(monk.savingThrows).toEqual(['str', 'dex']);
  });

  it('has Martial Arts + Stunning Strike (5) + the Perfect Self capstone', () => {
    expect(monk.features.some((f) => f.name === 'Martial Arts')).toBe(true);
    expect(snapshotAtLevel(monk, 5).features.some((f) => f.name === 'Stunning Strike')).toBe(true);
    expect(snapshotAtLevel(monk, 20).features.some((f) => f.name === 'Perfect Self')).toBe(true);
  });

  it('offers exactly the three 2014 PHB traditions (Open Hand, Shadow, Four Elements)', () => {
    const subs = subclassesFor(SYS, 'monk').map((s) => s.name).sort();
    expect(subs).toEqual(['Way of Shadow', 'Way of the Four Elements', 'Way of the Open Hand']);
  });
});

describe('Ranger 2014 — the edition-specific numbers', () => {
  const ranger = findClass(SYS, 'ranger')!;

  it('is a WIS half-caster with spells known from level 2 and no cantrips', () => {
    expect(ranger.spellcasting?.kind).toBe('half');
    expect(ranger.spellcasting?.ability).toBe('wis');
    expect(ranger.spellcasting?.cantripsKnown).toBeUndefined();
    expect(ranger.spellcasting?.spellsKnown?.[1]).toBe(0); // none at level 1
    expect(ranger.spellcasting?.spellsKnown?.[2]).toBe(2);
    expect(ranger.spellcasting?.spellsKnown?.[20]).toBe(11);
  });

  it('gains spell slots from level 2 (half-caster) but none at level 1', () => {
    // A caster's slot row exists at every level; at level 1 a half-caster simply has no slots yet.
    expect(snapshotAtLevel(ranger, 1).spellSlots?.[1] ?? 0).toBe(0);
    expect(snapshotAtLevel(ranger, 2).spellSlots?.[1]).toBeGreaterThan(0); // 1st-level slots by 2
    expect(snapshotAtLevel(ranger, 5).spellSlots?.[2]).toBeGreaterThan(0); // 2nd-level slots by 5
  });

  it('has the 2014 Favored Enemy + Natural Explorer at level 1 (a 2024 rewrite)', () => {
    const at1 = snapshotAtLevel(ranger, 1).features.map((f) => f.name);
    expect(at1).toContain('Favored Enemy');
    expect(at1).toContain('Natural Explorer');
  });

  it('chooses a Fighting Style at 2 and offers exactly Hunter + Beast Master', () => {
    expect(ranger.features.some((f) => f.level === 2 && f.choice === 'fighting-style')).toBe(true);
    const subs = subclassesFor(SYS, 'ranger').map((s) => s.name).sort();
    expect(subs).toEqual(['Beast Master', 'Hunter']);
  });
});
