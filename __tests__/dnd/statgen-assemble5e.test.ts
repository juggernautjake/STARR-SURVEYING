// __tests__/dnd/statgen-assemble5e.test.ts — the 5e picks → character-patch assembler (MB-2b).
//
// Runs against the real class catalog, so it proves the KEY→label + primary-ability mapping the sheet reads.
import { describe, it, expect } from 'vitest';
import { assembleDnd5e } from '@/lib/dnd/statgen/assemble5e';
import { classesForSystem, subclassesFor } from '@/lib/dnd/classes/registry';

const abilities = { str: 17, dex: 14, con: 14, int: 8, wis: 12, cha: 10 };

describe('assembleDnd5e', () => {
  it('resolves the class KEY to its display label and pulls primary abilities', () => {
    const fighter = classesForSystem('dnd5e-2024').find((c) => c.name === 'Fighter')!;
    const out = assembleDnd5e({ system: 'dnd5e-2024', level: 5, className: fighter.key, abilities });
    expect(out.meta.className).toBe('Fighter');
    expect(out.primaryAbilities).toEqual(fighter.primaryAbility);
    expect(out.meta.level).toBe(5);
    expect(out.abilities).toEqual(abilities);
  });

  it('resolves the subclass KEY to its label', () => {
    const fighter = classesForSystem('dnd5e-2024').find((c) => c.name === 'Fighter')!;
    const sub = subclassesFor('dnd5e-2024', fighter.key)[0];
    const out = assembleDnd5e({ system: 'dnd5e-2024', level: 3, className: fighter.key, subclass: sub.key, abilities });
    expect(out.meta.subclass).toBe(sub.name);
  });

  it('keeps the 2024 background + its spread for reversibility', () => {
    const out = assembleDnd5e({
      system: 'dnd5e-2024', level: 1, className: 'fighter', abilities,
      background: 'Soldier', backgroundAbilities: { str: 2, con: 1 },
    });
    expect(out.meta.background).toBe('Soldier');
    expect(out.meta.backgroundAbilities).toEqual({ str: 2, con: 1 });
  });

  it('records chosen feats as sheet features', () => {
    const out = assembleDnd5e({ system: 'dnd5e-2024', level: 4, className: 'fighter', abilities, feats: ['Alert', 'Tough'] });
    expect(out.feats.map((f) => f.name)).toEqual(['Alert', 'Tough']);
  });

  it('clamps the level to 1–20 and defaults the name', () => {
    expect(assembleDnd5e({ system: 'dnd5e-2024', level: 99, abilities }).meta.level).toBe(20);
    expect(assembleDnd5e({ system: 'dnd5e-2024', level: 0, abilities }).meta.level).toBe(1);
    expect(assembleDnd5e({ system: 'dnd5e-2024', level: 1, abilities }).meta.name).toBe('New character');
  });

  it('falls back to the raw key for an unknown class rather than losing it', () => {
    const out = assembleDnd5e({ system: 'dnd5e-2024', level: 1, className: 'homebrew-thing', abilities });
    expect(out.meta.className).toBe('homebrew-thing');
    expect(out.primaryAbilities).toEqual([]);
  });
});

// ── The class-derived combat facts (final-QA walkthrough, slice 10) ─────────────────────────────────
// Building a level-8 Battle Master through the real builder produced a sheet showing **1 hit point**,
// **AC 10** and **no save proficiencies**. The module header promises "the sheet derives the MECHANICS
// (HP, AC, proficiency, class features by level, saves) from those choices" — and proficiency bonus does
// derive correctly — but HP does not: the sheet only recomputes it when the level changes through its own
// setter, reading `combat.hitDiceSize`, which a straight-to-level-8 build never sets. So the character kept
// the blank template's d8 and `maxHp: 1`.
describe('assembleDnd5e writes the combat facts only the class knows', () => {
  const fighter8 = () => assembleDnd5e({
    system: 'dnd5e-2024', level: 8, className: 'fighter', name: 'T',
    abilities: { str: 17, dex: 14, con: 14, int: 12, wis: 10, cha: 8 },
  });

  it('uses the class hit die, not the blank default', () => {
    expect(fighter8().combat.hitDiceSize).toBe(10);   // Fighter is d10; the blank character is d8
    expect(fighter8().combat.hitDiceTotal).toBe(8);
    expect(fighter8().combat.hitDiceRemaining).toBe(8);
  });

  it('computes max HP with the SHEET’s own formula, so a built and a levelled character agree', () => {
    // d10 + CON, then 7 more levels of (avg 6 + CON 2) = 12 + 56.
    expect(fighter8().combat.maxHp).toBe(68);
    expect(fighter8().combat.currentHp).toBe(68);
  });

  it('seeds unarmored AC as 10 + DEX', () => {
    // `deriveAc` treats combat.ac as the "unarmored / manual" base and never adds Dexterity itself, so a
    // DEX-14 character left at the default rendered AC 10 instead of 12.
    expect(fighter8().combat.ac).toBe(12);
  });

  it('records the class’s saving-throw proficiencies', () => {
    const s = fighter8().saves;
    expect(s.str?.proficient).toBe(true);
    expect(s.con?.proficient).toBe(true);
    for (const k of ['dex', 'int', 'wis', 'cha'] as const) expect(s[k]?.proficient).toBeFalsy();
  });

  it('scales with the class, not just the Fighter it was found on', () => {
    const wizard5 = assembleDnd5e({
      system: 'dnd5e-2024', level: 5, className: 'wizard', name: 'W',
      abilities: { str: 8, dex: 14, con: 12, int: 17, wis: 12, cha: 10 },
    });
    expect(wizard5.combat.hitDiceSize).toBe(6);            // d6
    expect(wizard5.combat.maxHp).toBe(6 + 1 + 4 * (4 + 1)); // 27
    expect(wizard5.saves.int?.proficient).toBe(true);
    expect(wizard5.saves.wis?.proficient).toBe(true);
    expect(wizard5.saves.str?.proficient).toBeFalsy();
  });

  it('an unknown class falls back to the blank d8 rather than throwing', () => {
    const odd = assembleDnd5e({
      system: 'dnd5e-2024', level: 3, className: 'not-a-class', name: 'X',
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    });
    expect(odd.combat.hitDiceSize).toBe(8);
    expect(odd.saves).toEqual({});
  });
});

// ── Class features (final-QA walkthrough, slice 11) ─────────────────────────────────────────────────
// Slice 10 deferred this as "the same open question as ASI-slot ownership". That was WRONG, and worth
// recording why: an ASI is a player CHOICE, so two surfaces collecting it would double-ask — which is the
// real blocker there. Class features are automatic GRANTS. Nothing else asks for them, and nothing under
// `_sheet/` reads the class registry at all (the Features panel renders `char.features` and nothing else),
// so a level-8 Battle Master simply had no Second Wind, Action Surge or Extra Attack anywhere.
describe('assembleDnd5e writes the class + subclass features for the level', () => {
  const bm8 = () => assembleDnd5e({
    system: 'dnd5e-2024', level: 8, className: 'fighter', subclass: 'battle-master', name: 'T',
    abilities: { str: 17, dex: 14, con: 14, int: 12, wis: 10, cha: 8 },
  });

  it('includes the base class features up to that level', () => {
    const names = bm8().classFeatures.map((f) => f.name);
    for (const n of ['Fighting Style', 'Second Wind', 'Action Surge', 'Extra Attack']) {
      expect(names, `missing ${n}`).toContain(n);
    }
  });

  it('includes the SUBCLASS features, attributed to the subclass', () => {
    const cs = bm8().classFeatures.find((f) => f.name === 'Combat Superiority');
    expect(cs, 'Battle Master should grant Combat Superiority').toBeTruthy();
    expect(cs!.source).toBe('Fighter (Battle Master)');
    expect(cs!.unlockLevel).toBe(3);
  });

  it('grants nothing from above the character’s level', () => {
    for (const f of bm8().classFeatures) expect(f.unlockLevel, f.name).toBeLessThanOrEqual(8);
    // Level 9's Indomitable is a Fighter feature the level-8 build must not have.
    expect(bm8().classFeatures.map((f) => f.name)).not.toContain('Indomitable');
  });

  it('scales with level — a level-1 Fighter has the level-1 set and no more', () => {
    const l1 = assembleDnd5e({
      system: 'dnd5e-2024', level: 1, className: 'fighter', name: 'T',
      abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 8 },
    }).classFeatures;
    expect(l1.map((f) => f.name)).toContain('Second Wind');
    expect(l1.map((f) => f.name)).not.toContain('Action Surge');   // level 2
    expect(l1.every((f) => f.unlockLevel === 1)).toBe(true);
  });

  it('tags every feature with an id the rebuild can replace, and the class as its source', () => {
    // The route strips `cls-` ids on rebuild so re-classing removes the old class's features instead of
    // leaving a Fighter's Action Surge on a Wizard. A feature the PLAYER added has no such prefix.
    for (const f of bm8().classFeatures) {
      expect(f.id.startsWith('cls-'), f.name).toBe(true);
      expect(f.source.startsWith('Fighter'), f.name).toBe(true);
      expect(f.body.join('').length, `${f.name} has no rules text`).toBeGreaterThan(0);
    }
  });

  it('an unknown class contributes no features rather than throwing', () => {
    expect(assembleDnd5e({
      system: 'dnd5e-2024', level: 5, className: 'not-a-class', name: 'X',
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    }).classFeatures).toEqual([]);
  });
});
