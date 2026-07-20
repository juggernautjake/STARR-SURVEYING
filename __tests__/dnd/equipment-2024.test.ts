// __tests__/dnd/equipment-2024.test.ts — the 2024 weapon and armour tables (S6).
// Weapon mastery is the 2024 headline and did not exist in 2014, so it is the single most
// likely thing for a carried-over assumption to silently omit.
import { describe, it, expect } from 'vitest';
import {
  WEAPONS_2024, ARMOR_2024, MASTERY_PROPERTIES,
  findWeapon2024, findArmor2024, masteryEffect, weaponPropertyLine, armorAcFor,
} from '@/lib/dnd/equipment/dnd5e-2024';

describe('weapon table', () => {
  it('has no duplicate weapons', () => {
    const names = WEAPONS_2024.map((w) => w.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives EVERY weapon a mastery property — the 2024 headline', () => {
    // A Greatsword without Graze is materially weaker than the rules give.
    const keys = MASTERY_PROPERTIES.map((m) => m.key);
    for (const w of WEAPONS_2024) expect(keys, w.name).toContain(w.mastery);
  });

  it('defines what all eight mastery properties do', () => {
    expect(MASTERY_PROPERTIES).toHaveLength(8);
    for (const m of MASTERY_PROPERTIES) expect(m.effect.length, m.key).toBeGreaterThan(40);
    expect(masteryEffect('Graze')).toContain('MISS');
    expect(masteryEffect('Vex')).toContain('advantage');
  });

  it('carries well-formed damage for every weapon', () => {
    for (const w of WEAPONS_2024) {
      // The Blowgun is the one flat-damage weapon in the table.
      expect(w.damage, w.name).toMatch(/^(\d+d\d+|1)$/);
      expect(['bludgeoning', 'piercing', 'slashing'], w.name).toContain(w.damageType);
    }
  });

  it('spot-checks the signature weapons', () => {
    expect(findWeapon2024('Greatsword')).toMatchObject({ damage: '2d6', mastery: 'Graze', category: 'martial' });
    expect(findWeapon2024('Longsword')).toMatchObject({ damage: '1d8', mastery: 'Sap' });
    expect(findWeapon2024('Rapier')).toMatchObject({ mastery: 'Vex' });
    expect(findWeapon2024('Greataxe')).toMatchObject({ damage: '1d12', mastery: 'Cleave' });
    expect(findWeapon2024('Dagger')).toMatchObject({ mastery: 'Nick' });
  });

  it('keeps ranged weapons out of the melee set and vice versa', () => {
    expect(findWeapon2024('Longbow')?.kind).toBe('ranged');
    expect(findWeapon2024('Longsword')?.kind).toBe('melee');
    // Every ranged weapon needs ammunition or thrown; none is a bare melee profile.
    for (const w of WEAPONS_2024.filter((x) => x.kind === 'ranged')) {
      expect(w.properties.some((p) => /Ammunition|Thrown/.test(p)), w.name).toBe(true);
    }
  });

  it('shows mastery in the display line, since it is easy to miss', () => {
    expect(weaponPropertyLine(findWeapon2024('Greatsword')!)).toContain('Mastery: Graze');
  });

  it('is case-insensitive on lookup and returns undefined for the unknown', () => {
    expect(findWeapon2024('GREATSWORD')?.name).toBe('Greatsword');
    expect(findWeapon2024('Lightsaber')).toBeUndefined();
  });
});

describe('armour table', () => {
  it('has no duplicates and covers all four categories', () => {
    const names = ARMOR_2024.map((x) => x.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(ARMOR_2024.map((x) => x.category))).toEqual(new Set(['light', 'medium', 'heavy', 'shield']));
  });

  it('caps DEX per category — the rule armour tables exist to encode', () => {
    expect(findArmor2024('Leather Armor')?.dexCap).toBeNull();   // light: uncapped
    expect(findArmor2024('Breastplate')?.dexCap).toBe(2);        // medium: +2
    expect(findArmor2024('Plate Armor')?.dexCap).toBe(0);        // heavy: none
  });

  it('computes AC against a character’s DEX, respecting the cap', () => {
    const dex4 = 4;
    expect(armorAcFor(findArmor2024('Leather Armor')!, dex4)).toBe(15);   // 11 + 4 uncapped
    expect(armorAcFor(findArmor2024('Breastplate')!, dex4)).toBe(16);     // 14 + min(4,2)
    expect(armorAcFor(findArmor2024('Plate Armor')!, dex4)).toBe(18);     // 18 + 0
  });

  it('treats a shield as a flat bonus, not a base', () => {
    // A shield ADDS to body armour; running it through the cap logic would be wrong.
    expect(armorAcFor(findArmor2024('Shield')!, 4)).toBe(2);
  });

  it('records strength requirements only on the heaviest armour', () => {
    expect(findArmor2024('Chain Mail')?.strengthReq).toBe(13);
    expect(findArmor2024('Plate Armor')?.strengthReq).toBe(15);
    expect(findArmor2024('Leather Armor')?.strengthReq).toBeNull();
  });

  it('flags stealth disadvantage where the table does', () => {
    expect(findArmor2024('Plate Armor')?.stealthDisadvantage).toBe(true);
    expect(findArmor2024('Leather Armor')?.stealthDisadvantage).toBe(false);
    expect(findArmor2024('Breastplate')?.stealthDisadvantage).toBe(false);
  });

  it('attributes everything to the 2024 PHB', () => {
    for (const x of [...WEAPONS_2024, ...ARMOR_2024]) expect(x.source, x.name).toBe('PHB 2024');
  });
});
