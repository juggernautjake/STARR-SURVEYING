// __tests__/dnd/weapon-properties-control.test.ts — a homebrew weapon's PROPERTIES are authorable.
//
// Found by auditing the plan doc's `[~]` partials rather than trusting them. "Weapon builder … properties,
// 2024 mastery" was filed as "builder UI not shipped", which overstated the gap in one direction and
// understated it in another: damage, type, ability, range, proficiency and bonus dice were all authorable
// already — but `properties` genuinely was not, and it is the one that CHANGES THE MATHS.
//
// The field has always existed on `WeaponStats`, and the engine has always read it:
//   · `weapon-items.ts` — `finesse` picks the better of STR/DEX; `ammunition` forces DEX and withholds
//     `strMelee` (so a bow is not eligible for Reckless Attack's advantage);
//   · `equip-conflicts.ts` — `two-handed` drives the hand-slot rules.
// So a homebrew rapier could not be finesse, and a homebrew greatbow could not stop being a STR melee
// weapon, purely because nothing rendered a control.
//
// Deliberately NOT added here: 2024 **mastery** and the armour **STR requirement**. Neither exists on the
// live models (`WeaponStats` / `ArmorStats`), so a control for either would persist a field nothing reads —
// the "authored but not wired" defect this repo keeps finding. Each needs a model field AND a consumer,
// which is a slice, not a control.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { attacksFromWeaponItems, weaponAbility } from '@/app/dnd/_sheet/engine/weapon-items';
import type { InvItem } from '@/app/dnd/_sheet/types';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const SRC = read('app/dnd/_sheet/components/ItemBuilder.tsx');
const MODS = { str: 1, dex: 4, con: 0, int: 0, wis: 0, cha: 0 };

describe('the control offers the ENGINE\'s vocabulary, not free text', () => {
  it('lists exactly the nine WeaponProperty values', () => {
    const engine = read('app/dnd/_sheet/engine/equipment.ts');
    const declared = [...engine.matchAll(/^\s*\|\s*'([a-z-]+)'/gm)].map((m) => m[1]);
    for (const p of ['finesse', 'versatile', 'two-handed', 'thrown', 'reach', 'light', 'heavy', 'loading', 'ammunition']) {
      expect(declared, `${p} should be a WeaponProperty`).toContain(p);
      expect(SRC, `${p} should be offered`).toContain(`'${p}'`);
    }
  });

  it('is a toggle list rather than a text input — a typo would derive the wrong ability', () => {
    expect(SRC).toContain('WEAPON_PROPERTIES.map');
    expect(SRC).toContain('properties: on ?');
  });

  it('explains what each property does, rather than assuming 5e fluency', () => {
    expect(SRC).toContain('PROPERTY_HINT');
    expect(SRC).toContain('Attack with the better of STR or DEX.');
  });
});

describe('what the player sets now reaches the maths', () => {
  const weapon = (properties: string[]): InvItem => ({
    id: 'w', name: 'Homebrew Blade', desc: '', qty: 1, tags: [], kind: 'weapon',
    weapon: { damage: { dice: '1d8', type: 'slashing' }, proficient: true, properties },
  } as InvItem);

  it('finesse switches the attack to the better ability', () => {
    // DEX +4 vs STR +1 — without the property this is a STR weapon.
    expect(weaponAbility({ damage: { dice: '1d8', type: 's' } }, MODS)).toBe('str');
    expect(weaponAbility({ damage: { dice: '1d8', type: 's' }, properties: ['finesse'] }, MODS)).toBe('dex');
  });

  it('a finesse weapon\'s ROW follows, end to end', () => {
    const [row] = attacksFromWeaponItems([weapon(['finesse'])], MODS);
    expect(row.atk.ability).toBe('dex');
  });

  it('ammunition makes it a ranged DEX attack and not STR-melee', () => {
    const [row] = attacksFromWeaponItems([weapon(['ammunition'])], MODS);
    expect(row.atk.ability).toBe('dex');
    expect(row.atk.strMelee).toBeUndefined();
  });

  it('two-handed is what the equip rules read for the hand slots', () => {
    expect(read('lib/dnd/equip-conflicts.ts')).toContain("'two-handed'");
  });
});

describe('what was deliberately left out, and why', () => {
  it('mastery is not offered, because the live model has no field for it', () => {
    const types = read('app/dnd/_sheet/types.ts');
    const weaponStats = types.slice(types.indexOf('export interface WeaponStats'), types.indexOf('export interface ArmorStats'));
    expect(weaponStats).not.toContain('mastery');
    expect(SRC).not.toContain('mastery');
  });

  it('the armour STR requirement is not offered, for the same reason', () => {
    const types = read('app/dnd/_sheet/types.ts');
    const armorStats = types.slice(types.indexOf('export interface ArmorStats'), types.indexOf('export interface ArmorStats') + 700);
    expect(armorStats).not.toMatch(/strReq|strengthRequirement/);
  });
});
