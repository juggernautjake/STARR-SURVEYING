// __tests__/dnd/dnd5e-2024-classes.test.ts — the 12 official D&D 5e 2024 classes.
//
// These are authored data, so the tests are mostly about STRUCTURAL soundness (does the engine
// level every class, every subclass, to 20 without a hole?) plus the specific 2024-vs-2014
// differences that are easy to get wrong and expensive to ship wrong.
import { describe, it, expect } from 'vitest';
import { classesForSystem, findClass, subclassesFor, systemHasClasses, findSubclass } from '@/lib/dnd/classes/registry';
import { snapshotAtLevel, progressionTable, validateClassDefinition, proficiencyBonusFor } from '@/lib/dnd/classes/engine';
import { FULL_CASTER_SLOTS, HALF_CASTER_SLOTS, PACT_SLOTS } from '@/lib/dnd/classes/slots';

const SYS = 'dnd5e-2024';
const CLASSES = classesForSystem(SYS);

const EXPECTED = [
  'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk',
  'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard',
];

describe('the 2024 class roster', () => {
  it('registers all 12 PHB classes', () => {
    expect(CLASSES.map((c) => c.name).sort()).toEqual([...EXPECTED].sort());
    expect(systemHasClasses(SYS)).toBe(true);
  });

  it('reports no class data for systems that have none — rather than pretending', () => {
    expect(systemHasClasses('coc7e')).toBe(false);
    expect(classesForSystem('blades')).toEqual([]);
    expect(findClass('coc7e', 'Barbarian')).toBeNull();
  });

  it('finds a class by name or key, scoped to its system', () => {
    expect(findClass(SYS, 'Wizard')?.key).toBeTruthy();
    expect(findClass(SYS, 'wizard')?.name).toBe('Wizard');
    // Editions are different systems: the 2014 Wizard now exists too, but it is a DISTINCT object
    // scoped to dnd5e-2014 — the 2024 lookup never returns it, and vice versa.
    expect(findClass(SYS, 'Wizard')?.system).toBe(SYS);
    expect(findClass('dnd5e-2014', 'Wizard')?.system).toBe('dnd5e-2014');
    // A system with no such class still resolves to null, not a cross-system leak.
    expect(findClass('coc7e', 'Wizard')).toBeNull();
  });
});

describe.each(CLASSES.map((c) => [c.name, c] as const))('%s', (_name, def) => {
  it('is structurally valid', () => {
    expect(validateClassDefinition(def)).toEqual([]);
  });

  it('belongs to dnd5e-2024 and has a hit die, 2 saves and a description', () => {
    expect(def.system).toBe(SYS);
    expect([6, 8, 10, 12]).toContain(def.hitDie);
    expect(def.savingThrows.length).toBe(2);
    expect(def.description.trim().length).toBeGreaterThan(20);
  });

  it('chooses its subclass at level 3 (the 2024 standard)', () => {
    expect(def.subclassLevel).toBe(3);
    expect(def.features.some((f) => f.level === 3 && f.choice === 'subclass')).toBe(true);
  });

  it('has ASIs at 4/8/12/16 and an Epic Boon at 19 — never an ASI at 19', () => {
    for (const lv of [4, 8, 12, 16]) expect(def.asiLevels).toContain(lv);
    expect(def.asiLevels).not.toContain(19);
    expect(def.features.some((f) => f.level === 19 && f.choice === 'epic-boon')).toBe(true);
    expect(def.features.some((f) => f.level === 19 && f.choice === 'asi')).toBe(false);
  });

  it('every feature has real rules text at a legal level', () => {
    expect(def.features.length).toBeGreaterThan(5);
    for (const f of def.features) {
      expect(f.level, `${f.name} level`).toBeGreaterThanOrEqual(1);
      expect(f.level, `${f.name} level`).toBeLessThanOrEqual(20);
      expect(f.body.trim().length, `${f.name} body`).toBeGreaterThan(20);
    }
  });

  it('is playable end to end — a level-1 feature, and a capstone at 20 from the class OR its subclass', () => {
    expect(def.features.some((f) => f.level === 1), 'level 1').toBe(true);
    // Not every class puts its capstone on the base class: the 2024 Paladin's level-20 feature
    // comes from its Oath (subclass features run 3/7/15/20). So the capstone is satisfied by
    // either — which is what a character actually experiences at 20.
    const baseCapstone = def.features.some((f) => f.level === 20);
    const subCapstone = subclassesFor(SYS, def.key).some((s) => s.features.some((f) => f.level === 20));
    expect(baseCapstone || subCapstone, 'a capstone at level 20 from the class or a subclass').toBe(true);
  });

  it('the engine levels it 1→20 with no hole', () => {
    const table = progressionTable(def);
    expect(table.length).toBe(20);
    for (let i = 0; i < 20; i++) {
      expect(table[i].level).toBe(i + 1);
      expect(table[i].proficiencyBonus).toBe(proficiencyBonusFor(i + 1));
      if (i > 0) expect(table[i].features.length).toBeGreaterThanOrEqual(table[i - 1].features.length);
    }
  });

  it('has at least 3 subclasses, each levelling cleanly to 20', () => {
    const subs = subclassesFor(SYS, def.key);
    expect(subs.length).toBeGreaterThanOrEqual(3);
    for (const s of subs) {
      expect(s.classKey, `${s.name} classKey`).toBe(def.key);
      expect(s.system).toBe(SYS);
      expect(s.features.length, `${s.name} features`).toBeGreaterThan(0);
      // Subclass features never arrive before the subclass is chosen.
      for (const f of s.features) expect(f.level, `${s.name} → ${f.name}`).toBeGreaterThanOrEqual(def.subclassLevel);
      const snap = snapshotAtLevel(def, 20, s);
      expect(snap.features.some((f) => f.subclass)).toBe(true);
    }
  });

  it('resource tables are indexed 1–20', () => {
    for (const r of def.resources ?? []) {
      expect(r.perLevel.length, `${r.name}`).toBe(21);
      expect(['short', 'long']).toContain(r.resetOn);
    }
  });
});

describe('spellcasting is wired to the shared tables', () => {
  const casterOf = (n: string) => findClass(SYS, n)!.spellcasting;

  it('full casters read the full table', () => {
    for (const n of ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Wizard']) {
      expect(casterOf(n)?.kind, n).toBe('full');
      // "wired to the shared table" means the SAME object — an off-by-one copy or a mis-imported table
      // would pass a cell-value check but fail this. Also keeps kind and slots from silently desyncing.
      expect(casterOf(n)?.slots, `${n} uses the shared FULL_CASTER_SLOTS`).toBe(FULL_CASTER_SLOTS);
    }
  });

  it('Paladin and Ranger are HALF casters', () => {
    for (const n of ['Paladin', 'Ranger']) {
      expect(casterOf(n)?.kind, n).toBe('half');
      expect(casterOf(n)?.slots, `${n} uses the shared HALF_CASTER_SLOTS`).toBe(HALF_CASTER_SLOTS);
    }
  });

  it('Warlock is a PACT caster — not a full caster with a small table', () => {
    const w = casterOf('Warlock');
    expect(w?.kind).toBe('pact');
    expect(w?.slots).toBeUndefined();
    expect(w?.pactSlots?.[1]).toBe(PACT_SLOTS[1]);
    expect(snapshotAtLevel(findClass(SYS, 'Warlock')!, 11).pact).toEqual({ slots: 3, rank: 5 });
  });

  it('the martials are non-casters at the base class', () => {
    for (const n of ['Barbarian', 'Fighter', 'Monk', 'Rogue']) {
      expect(casterOf(n)?.kind ?? 'none', n).toBe('none');
    }
  });

  it('casters use the right ability', () => {
    expect(casterOf('Wizard')?.ability).toBe('int');
    expect(casterOf('Cleric')?.ability).toBe('wis');
    expect(casterOf('Druid')?.ability).toBe('wis');
    expect(casterOf('Ranger')?.ability).toBe('wis');
    expect(casterOf('Bard')?.ability).toBe('cha');
    expect(casterOf('Sorcerer')?.ability).toBe('cha');
    expect(casterOf('Warlock')?.ability).toBe('cha');
    expect(casterOf('Paladin')?.ability).toBe('cha');
  });
});

describe('2024-specific rules that are wrong if you use the 2014 book', () => {
  it('the Ranger has no Natural Explorer FEATURE, and its Favored Enemy is Hunter’s Mark', () => {
    const r = findClass(SYS, 'Ranger')!;
    // Checked on feature NAMES, not a prose scan: the bodies legitimately explain that the 2014
    // features are gone, and a substring search would match those denials.
    const names = r.features.map((f) => f.name.toLowerCase());
    expect(names.some((n) => n.includes('natural explorer'))).toBe(false);
    // Favored Enemy exists in name only — it grants free Hunter's Mark casts.
    const favored = r.features.filter((f) => /favored enemy/i.test(f.name));
    expect(favored.length).toBeGreaterThan(0);
    expect(favored.some((f) => /hunter'?’?s mark/i.test(f.body))).toBe(true);
    // There is no creature type to choose — that is the 2014 version.
    expect(r.features.some((f) => /favored enemy/i.test(f.name) && f.choice === 'other')).toBe(false);
  });

  it('the Paladin gets Spellcasting at level 1 (2014 gave it at 2)', () => {
    const p = findClass(SYS, 'Paladin')!;
    expect(p.features.some((f) => f.level === 1 && /spellcasting/i.test(f.name))).toBe(true);
  });

  it('Weapon Mastery exists on the martials and NOT on the Monk', () => {
    for (const n of ['Barbarian', 'Fighter', 'Rogue']) {
      expect(findClass(SYS, n)!.features.some((f) => /weapon mastery/i.test(f.name)), n).toBe(true);
    }
    expect(findClass(SYS, 'Monk')!.features.some((f) => /weapon mastery/i.test(f.name))).toBe(false);
  });

  it('the Fighter gets its extra ASIs at 6 and 14, the Rogue at 10', () => {
    expect(findClass(SYS, 'Fighter')!.asiLevels).toEqual(expect.arrayContaining([4, 6, 8, 12, 14, 16]));
    expect(findClass(SYS, 'Rogue')!.asiLevels).toEqual(expect.arrayContaining([4, 8, 10, 12, 16]));
  });

  it('the Barbarian’s Rage is a long-rest resource that grows to 6', () => {
    const rage = findClass(SYS, 'Barbarian')!.resources?.find((r) => /rage/i.test(r.name));
    expect(rage).toBeTruthy();
    expect(rage!.perLevel[1]).toBe(2);
    expect(rage!.perLevel[20]).toBe(6);
    expect(rage!.resetOn).toBe('long');
  });

  it('the Monk’s Focus resets on a SHORT rest and equals its level', () => {
    const focus = findClass(SYS, 'Monk')!.resources?.find((r) => /focus/i.test(r.name));
    expect(focus).toBeTruthy();
    expect(focus!.resetOn).toBe('short');
    expect(focus!.perLevel[10]).toBe(10);
  });

  it('subclasses resolve by key and belong to the right class', () => {
    const battleMaster = findSubclass(SYS, 'battle-master') ?? subclassesFor(SYS, findClass(SYS, 'Fighter')!.key).find((s) => /battle master/i.test(s.name));
    expect(battleMaster).toBeTruthy();
    expect(battleMaster!.classKey).toBe(findClass(SYS, 'Fighter')!.key);
  });
});
