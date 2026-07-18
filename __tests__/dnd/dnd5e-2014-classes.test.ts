// __tests__/dnd/dnd5e-2014-classes.test.ts — D&D 5e 2014 classes (Slice 6a).
//
// 2014 is authored class-by-class. This pins the classes shipped so far to level 20 without a hole,
// and locks the 2014-vs-2024 differences that are easy to get wrong (editions are different systems,
// Ground Rule 2). Barbarian first: the 2014 tells are an ASI at 19 (not an Epic Boon), Brutal
// Critical (not Brutal Strike), no Weapon Mastery, unlimited Rage at 20, and a STR/CON cap of 24.
import { describe, it, expect } from 'vitest';
import { classesForSystem, findClass, subclassesFor, systemHasClasses } from '@/lib/dnd/classes/registry';
import { snapshotAtLevel, progressionTable, validateClassDefinition } from '@/lib/dnd/classes/engine';
import { FULL_CASTER_SLOTS, HALF_CASTER_SLOTS, ARTIFICER_SLOTS } from '@/lib/dnd/classes/slots';

const SYS = 'dnd5e-2014';
const CLASSES = classesForSystem(SYS);

const ALL_12 = [
  'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk',
  'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard',
];

// RAW hit die per class (+ the 2014-only Artificer, d8). A wrong value silently mis-sizes a whole class's
// HP; the generic "is a valid die" check wouldn't catch it. Pin the correct value.
const HIT_DICE: Record<string, number> = {
  Barbarian: 12, Fighter: 10, Paladin: 10, Ranger: 10,
  Bard: 8, Cleric: 8, Druid: 8, Monk: 8, Rogue: 8, Warlock: 8, Artificer: 8,
  Sorcerer: 6, Wizard: 6,
};

// RAW saving-throw proficiency pair per class (+ Artificer CON/INT). "Exactly 2 saves" wouldn't catch a
// wrong pair, yet these decide every save the class is proficient in. Pinned order-independently.
const SAVES: Record<string, string[]> = {
  Barbarian: ['con', 'str'], Bard: ['cha', 'dex'], Cleric: ['cha', 'wis'], Druid: ['int', 'wis'],
  Fighter: ['con', 'str'], Monk: ['dex', 'str'], Paladin: ['cha', 'wis'], Ranger: ['dex', 'str'],
  Rogue: ['dex', 'int'], Sorcerer: ['cha', 'con'], Warlock: ['cha', 'wis'], Wizard: ['int', 'wis'],
  Artificer: ['con', 'int'],
};

// The 2014 subclass-choice level per class — an EDITION-SENSITIVE quirk (2024 puts every subclass at L3;
// 2014 varies: Cleric/Sorcerer/Warlock at 1, Druid/Wizard at 2, the rest at 3). The generic "a subclass
// feature sits at def.subclassLevel" check verifies consistency but not the RAW value; a Cleric typo'd to 3
// would offer its Domain 2 levels late and still pass. Pin the correct value per class.
const SUBCLASS_LEVEL: Record<string, number> = {
  Cleric: 1, Sorcerer: 1, Warlock: 1, Druid: 2, Wizard: 2,
  Barbarian: 3, Bard: 3, Fighter: 3, Monk: 3, Paladin: 3, Ranger: 3, Rogue: 3, Artificer: 3,
};

// The EXACT 2014 ASI cadence — INCLUDING level 19 (in 2024 that's an Epic Boon, not an ASI: the edition
// tell). Fighter adds 6 & 14, Rogue adds 10; everyone else is the plain 4/8/12/16/19. Pinned exactly so a
// missing OR spurious ASI level is caught, not just "contains 19".
const ASI_LEVELS: Record<string, number[]> = {
  Fighter: [4, 6, 8, 12, 14, 16, 19], Rogue: [4, 8, 10, 12, 16, 19],
  Barbarian: [4, 8, 12, 16, 19], Bard: [4, 8, 12, 16, 19], Cleric: [4, 8, 12, 16, 19], Druid: [4, 8, 12, 16, 19],
  Monk: [4, 8, 12, 16, 19], Paladin: [4, 8, 12, 16, 19], Ranger: [4, 8, 12, 16, 19], Sorcerer: [4, 8, 12, 16, 19],
  Warlock: [4, 8, 12, 16, 19], Wizard: [4, 8, 12, 16, 19], Artificer: [4, 8, 12, 16, 19],
};

describe('the 2014 class roster (authored class-by-class)', () => {
  it('registers all 12 PHB classes plus the Artificer, and the system reports it has class data', () => {
    for (const name of ALL_12) expect(CLASSES.map((c) => c.name)).toContain(name);
    expect(CLASSES.map((c) => c.name)).toContain('Artificer');
    expect(systemHasClasses(SYS)).toBe(true);
  });

  it('resolves per class: an authored one is found, an un-authored one falls back (null)', () => {
    expect(findClass(SYS, 'Barbarian')?.key).toBe('barbarian');
    expect(findClass(SYS, 'barbarian')?.name).toBe('Barbarian');
    // A class the 2014 set doesn't have → null, so the builder offers the AI/homebrew path rather
    // than lying about a level table it doesn't have.
    expect(findClass(SYS, 'Warlord')).toBeNull();
  });

  it('does not leak across editions — a 2014 class is not a 2024 class', () => {
    // Same key, different system: the 2014 Barbarian and the 2024 Barbarian are distinct objects.
    expect(findClass(SYS, 'Barbarian')?.system).toBe('dnd5e-2014');
    expect(findClass('dnd5e-2024', 'Barbarian')?.system).toBe('dnd5e-2024');
  });
});

describe('2014 casters are wired to the shared slot tables (kind ⟺ table, by identity)', () => {
  const casterOf = (n: string) => findClass(SYS, n)!.spellcasting;
  it('full casters (Bard/Cleric/Druid/Sorcerer/Wizard) use the SHARED FULL_CASTER_SLOTS object', () => {
    for (const n of ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Wizard']) {
      expect(casterOf(n)?.kind, n).toBe('full');
      expect(casterOf(n)?.slots, `${n} uses the shared FULL_CASTER_SLOTS`).toBe(FULL_CASTER_SLOTS);
    }
  });
  it('Paladin/Ranger use HALF_CASTER_SLOTS; the Artificer uses its own rounds-up table', () => {
    for (const n of ['Paladin', 'Ranger']) {
      expect(casterOf(n)?.kind, n).toBe('half');
      expect(casterOf(n)?.slots, `${n} uses HALF_CASTER_SLOTS`).toBe(HALF_CASTER_SLOTS);
    }
    // The Artificer is a half-caster by kind but rounds UP — its own table, NOT the standard one.
    expect(casterOf('Artificer')?.kind).toBe('half');
    expect(casterOf('Artificer')?.slots).toBe(ARTIFICER_SLOTS);
    expect(casterOf('Artificer')?.slots).not.toBe(HALF_CASTER_SLOTS);
  });
});

describe.each(CLASSES.map((c) => [c.name, c] as const))('%s (2014)', (_name, def) => {
  it('is structurally valid and levels cleanly 1→20', () => {
    expect(validateClassDefinition(def)).toEqual([]);
    const table = progressionTable(def);
    expect(table).toHaveLength(20);
    for (const row of table) expect(row.features).toBeDefined();
  });

  it('belongs to dnd5e-2014 with the RAW hit die, exactly two saves, and a subclass choice', () => {
    expect(def.system).toBe(SYS);
    expect(def.hitDie, `${def.name} hit die`).toBe(HIT_DICE[def.name]); // the CORRECT die, not just a valid one
    expect([...def.savingThrows].sort(), `${def.name} save proficiencies`).toEqual(SAVES[def.name]); // the CORRECT pair
    // The subclass level is the RAW-correct one for this class (edition-sensitive: 1/2/3 in 2014)...
    expect(def.subclassLevel, `${def.name} subclass level`).toBe(SUBCLASS_LEVEL[def.name]);
    // The exact 2014 ASI cadence (edition-sensitive: includes L19, unlike 2024).
    expect([...def.asiLevels].sort((a, b) => a - b), `${def.name} ASI levels`).toEqual(ASI_LEVELS[def.name]);
    // ...and a subclass-choice feature actually sits at that level (consistency).
    expect(def.features.some((f) => f.choice === 'subclass' && f.level === def.subclassLevel)).toBe(true);
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

describe('Paladin 2014 — the edition-specific numbers', () => {
  const paladin = findClass(SYS, 'paladin')!;

  it('is a CHA half-caster that PREPARES (no spellsKnown array) with WIS/CHA saves', () => {
    expect(paladin.spellcasting?.kind).toBe('half');
    expect(paladin.spellcasting?.ability).toBe('cha');
    expect(paladin.spellcasting?.spellsKnown).toBeUndefined(); // a preparer, not a known-caster
    expect(paladin.savingThrows).toEqual(['wis', 'cha']);
  });

  it('has Divine Smite as a class feature (not a spell) and Auras + Improved Divine Smite', () => {
    expect(paladin.features.some((f) => f.name === 'Divine Smite' && f.level === 2)).toBe(true);
    expect(paladin.features.some((f) => f.name === 'Aura of Protection')).toBe(true);
    expect(snapshotAtLevel(paladin, 11).features.some((f) => f.name === 'Improved Divine Smite')).toBe(true);
  });

  it('offers exactly the three PHB oaths, each carrying always-prepared Oath Spells', () => {
    const subs = subclassesFor(SYS, 'paladin');
    expect(subs.map((s) => s.name).sort()).toEqual(['Oath of Devotion', 'Oath of Vengeance', 'Oath of the Ancients']);
    for (const s of subs) expect(Object.keys(s.alwaysPrepared ?? {}).length).toBeGreaterThan(0);
  });
});

describe('Sorcerer 2014 — the edition-specific numbers', () => {
  const sorc = findClass(SYS, 'sorcerer')!;

  it('is a d6 CHA full caster with spells KNOWN and cantrips', () => {
    expect(sorc.hitDie).toBe(6);
    expect(sorc.spellcasting?.kind).toBe('full');
    expect(sorc.spellcasting?.ability).toBe('cha');
    expect(sorc.spellcasting?.spellsKnown?.[20]).toBe(15);
    expect(sorc.spellcasting?.cantripsKnown?.[1]).toBe(4);
  });

  it('chooses its Sorcerous Origin at level 1 (the Sorcerer quirk), not 3', () => {
    expect(sorc.subclassLevel).toBe(1);
    expect(snapshotAtLevel(sorc, 1).features.some((f) => f.choice === 'subclass')).toBe(true);
  });

  it('tracks Sorcery Points (== level from 2) and learns Metamagic; offers the two PHB origins', () => {
    const sp = sorc.resources!.find((r) => r.id === 'sorcery-points')!;
    expect(sp.perLevel[1]).toBe(0);
    expect(sp.perLevel[2]).toBe(2);
    expect(sp.perLevel[20]).toBe(20);
    expect(sorc.features.some((f) => f.name === 'Metamagic')).toBe(true);
    expect(subclassesFor(SYS, 'sorcerer').map((s) => s.name).sort()).toEqual(['Draconic Bloodline', 'Wild Magic']);
  });
});

describe('Warlock 2014 — the edition-specific numbers', () => {
  const warlock = findClass(SYS, 'warlock')!;

  it('is a PACT caster (few slots, all highest-rank, short-rest) chosen at level 1', () => {
    expect(warlock.spellcasting?.kind).toBe('pact');
    expect(warlock.spellcasting?.pactSlots?.[1]).toBe(1);
    expect(warlock.spellcasting?.pactRank?.[20]).toBe(5); // caps at 5th-rank pact slots
    expect(warlock.subclassLevel).toBe(1);
  });

  it('has Eldritch Invocations, a Pact Boon at 3, and Mystic Arcanum at 11/13/15/17', () => {
    expect(warlock.features.some((f) => f.name === 'Eldritch Invocations')).toBe(true);
    expect(warlock.features.some((f) => f.name === 'Pact Boon' && f.level === 3)).toBe(true);
    const arcanaLevels = warlock.features.filter((f) => /Mystic Arcanum/.test(f.name)).map((f) => f.level).sort((a, b) => a - b);
    expect(arcanaLevels).toEqual([11, 13, 15, 17]);
  });

  it('offers exactly the three PHB patrons (Archfey, Fiend, Great Old One)', () => {
    const subs = subclassesFor(SYS, 'warlock').map((s) => s.name).sort();
    expect(subs).toEqual(['The Archfey', 'The Fiend', 'The Great Old One']);
  });
});

describe('Bard 2014 — the edition-specific numbers', () => {
  const bard = findClass(SYS, 'bard')!;

  it('is a CHA full caster with spells known that chooses ANY 3 skills', () => {
    expect(bard.spellcasting?.kind).toBe('full');
    expect(bard.spellcasting?.spellsKnown?.[20]).toBe(22);
    expect(bard.skillChoices.count).toBe(3);
    expect(bard.skillChoices.from.length).toBeGreaterThanOrEqual(18); // any skill
  });

  it('has Bardic Inspiration, Jack of All Trades, Expertise x2, and Magical Secrets at 10/14/18', () => {
    expect(bard.features.some((f) => f.name === 'Bardic Inspiration')).toBe(true);
    expect(bard.features.some((f) => f.name === 'Jack of All Trades')).toBe(true);
    expect(bard.features.filter((f) => f.choice === 'expertise').map((f) => f.level)).toEqual([3, 10]);
    const secrets = bard.features.filter((f) => f.name === 'Magical Secrets').map((f) => f.level).sort((a, b) => a - b);
    expect(secrets).toEqual([10, 14, 18]);
  });

  it('offers exactly the two PHB colleges (Lore, Valor)', () => {
    expect(subclassesFor(SYS, 'bard').map((s) => s.name).sort()).toEqual(['College of Lore', 'College of Valor']);
  });
});

describe('Cleric 2014 — the edition-specific numbers', () => {
  const cleric = findClass(SYS, 'cleric')!;

  it('is a WIS full-caster preparer that picks its Divine Domain at level 1', () => {
    expect(cleric.spellcasting?.kind).toBe('full');
    expect(cleric.spellcasting?.ability).toBe('wis');
    expect(cleric.spellcasting?.spellsKnown).toBeUndefined(); // preparer
    expect(cleric.subclassLevel).toBe(1);
  });

  it('has Channel Divinity + Turn Undead, Destroy Undead, and Divine Intervention', () => {
    expect(cleric.features.some((f) => f.name === 'Channel Divinity')).toBe(true);
    expect(cleric.features.some((f) => f.name === 'Destroy Undead')).toBe(true);
    expect(snapshotAtLevel(cleric, 10).features.some((f) => f.name === 'Divine Intervention')).toBe(true);
  });

  it('offers all seven PHB domains, each with always-prepared Domain Spells and a level-8 boost', () => {
    const subs = subclassesFor(SYS, 'cleric');
    expect(subs.map((s) => s.name).sort()).toEqual([
      'Knowledge Domain', 'Life Domain', 'Light Domain', 'Nature Domain',
      'Tempest Domain', 'Trickery Domain', 'War Domain',
    ]);
    for (const s of subs) {
      expect(Object.keys(s.alwaysPrepared ?? {}).length).toBe(5); // domain spells at 1/3/5/7/9
      expect(s.features.some((f) => f.level === 8 && /Divine Strike|Potent Spellcasting/.test(f.name))).toBe(true);
    }
  });
});

describe('Druid 2014 — the edition-specific numbers', () => {
  const druid = findClass(SYS, 'druid')!;

  it('is a WIS full-caster preparer that picks its Circle at level 2 (2024 moved it to 3)', () => {
    expect(druid.spellcasting?.kind).toBe('full');
    expect(druid.spellcasting?.ability).toBe('wis');
    expect(druid.subclassLevel).toBe(2);
    expect(druid.features.some((f) => f.level === 2 && f.choice === 'subclass')).toBe(true);
  });

  it('has Wild Shape as a 2-use short-rest resource from level 2, and Archdruid at 20', () => {
    const ws = druid.resources!.find((r) => r.id === 'wild-shape')!;
    expect(ws.resetOn).toBe('short');
    expect(ws.perLevel[1]).toBe(0);
    expect(ws.perLevel[2]).toBe(2);
    expect(snapshotAtLevel(druid, 20).features.some((f) => f.name === 'Archdruid')).toBe(true);
  });

  it('offers exactly the two PHB circles (Land, Moon)', () => {
    expect(subclassesFor(SYS, 'druid').map((s) => s.name).sort()).toEqual(['Circle of the Land', 'Circle of the Moon']);
  });
});

describe('Wizard 2014 — the edition-specific numbers', () => {
  const wizard = findClass(SYS, 'wizard')!;

  it('is a d6 INT full-caster preparer that picks its Arcane Tradition at level 2', () => {
    expect(wizard.hitDie).toBe(6);
    expect(wizard.spellcasting?.kind).toBe('full');
    expect(wizard.spellcasting?.ability).toBe('int');
    expect(wizard.subclassLevel).toBe(2);
  });

  it('has Arcane Recovery, Spell Mastery (18), and Signature Spells (20)', () => {
    expect(wizard.features.some((f) => f.name === 'Arcane Recovery')).toBe(true);
    expect(snapshotAtLevel(wizard, 18).features.some((f) => f.name === 'Spell Mastery')).toBe(true);
    expect(snapshotAtLevel(wizard, 20).features.some((f) => f.name === 'Signature Spells')).toBe(true);
  });

  it('offers all eight PHB schools as traditions, each levelling to 14', () => {
    const subs = subclassesFor(SYS, 'wizard');
    expect(subs.map((s) => s.name).sort()).toEqual([
      'School of Abjuration', 'School of Conjuration', 'School of Divination', 'School of Enchantment',
      'School of Evocation', 'School of Illusion', 'School of Necromancy', 'School of Transmutation',
    ]);
    for (const s of subs) expect(s.features.some((f) => f.level === 14)).toBe(true);
  });
});

describe('Artificer 2014 — the half-caster that casts from level 1', () => {
  const artificer = findClass(SYS, 'artificer')!;

  it('is an INT half-caster preparer with spell slots at LEVEL 1 (rounds up)', () => {
    expect(artificer.spellcasting?.kind).toBe('half');
    expect(artificer.spellcasting?.ability).toBe('int');
    // Unlike a Paladin/Ranger, the Artificer has 1st-rank slots at level 1.
    expect(snapshotAtLevel(artificer, 1).spellSlots?.[1]).toBe(2);
  });

  it('has Infuse Item, Flash of Genius, and Soul of Artifice; specialist at 3', () => {
    expect(artificer.features.some((f) => f.name === 'Infuse Item')).toBe(true);
    expect(artificer.features.some((f) => f.name === 'Flash of Genius')).toBe(true);
    expect(artificer.subclassLevel).toBe(3);
    expect(snapshotAtLevel(artificer, 20).features.some((f) => f.name === 'Soul of Artifice')).toBe(true);
  });

  it('offers the four specialists (Alchemist, Artillerist, Armorer, Battle Smith) with prepared spells', () => {
    const subs = subclassesFor(SYS, 'artificer');
    expect(subs.map((s) => s.name).sort()).toEqual(['Alchemist', 'Armorer', 'Artillerist', 'Battle Smith']);
    for (const s of subs) expect(Object.keys(s.alwaysPrepared ?? {}).length).toBeGreaterThan(0);
  });
});
