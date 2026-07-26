// __tests__/dnd/weapon-item-attacks.test.ts — the `weapon` tag's promise is now kept (Slice 10/27 follow-up).
//
// `ITEM_TAGS.weapon` tells the player: "Can be attacked with — it shows up in your Attacks table with its
// own to-hit and damage." `RESERVED_TAGS` refuses to let a homebrew tag reuse the name BECAUSE "`weapon` is
// what puts an item in the Attacks table", and `InvItem.tags` says it a third time. Nothing implemented it:
// `Attacks.tsx` rendered stored attacks + `grantsAttack` only, so a weapon built in the ItemBuilder appeared
// nowhere. These pin the mapper AND the three statements of the contract, so the promise and the code can't
// drift apart again.
//
// Note on the plan doc's framing: it recorded this as `attacksFromInventory` being "UNCALLED". That function
// takes `EquipItem`/`WeaponSpec` (category + `range: {normal,long}`), not the live `InvItem`/`WeaponStats`
// (`ability`/`proficient`/`toHitBonus` + `range: string`), and its only caller is the dead `deriveCharacter`
// reducer — so it could not simply be called. `weapon-items.ts` maps the live model instead.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { attacksFromWeaponItems, weaponAbility, isWeaponItem } from '@/app/dnd/_sheet/engine/weapon-items';
import type { InvItem } from '@/app/dnd/_sheet/types';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const MODS = { str: 3, dex: 1, con: 2, int: 0, wis: 0, cha: 0 };

const weapon = (over: Partial<InvItem> & { name: string }): InvItem => ({
  id: over.id ?? over.name.toLowerCase(), desc: '', qty: 1, tags: [], kind: 'weapon',
  weapon: { damage: { dice: '1d8', type: 'slashing' }, ability: 'str', proficient: true },
  ...over,
} as InvItem);

describe('a weapon item becomes an Attacks row', () => {
  it('maps the item\'s own declared facts', () => {
    const rows = attacksFromWeaponItems([weapon({
      name: 'Longsword',
      weapon: { damage: { dice: '1d8', type: 'slashing' }, ability: 'str', proficient: true, toHitBonus: 1, range: '5 ft' },
    })], MODS);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('Longsword');
    expect(rows[0].atk).toMatchObject({
      name: 'Longsword', ability: 'str', proficient: true, damage: '1d8', damageType: 'slashing',
      bonusToHit: 1, range: '5 ft', strMelee: true,
    });
  });

  it('returns the weapon\'s INTRINSIC facts, never a computed to-hit', () => {
    // The row adds ability mod + proficiency + the ledger itself. A pre-folded `toHit` here would
    // double-count — which is exactly why the old engine\'s AttackEntry could not be used as a row.
    const [row] = attacksFromWeaponItems([weapon({ name: 'Club' })], MODS);
    expect(row.atk).not.toHaveProperty('toHit');
    expect(Object.keys(row.atk)).not.toContain('damageMod');
  });

  it('namespaces the id so it cannot collide with a stored attack', () => {
    const [row] = attacksFromWeaponItems([weapon({ id: 'x1', name: 'Dagger' })], MODS);
    expect(row.atk.id).toBe('witem-x1');
  });

  it('is not gated on equipped — the promise the player is shown is unconditional', () => {
    const rows = attacksFromWeaponItems([weapon({ name: 'Spare Dagger', equipped: false })], MODS);
    expect(rows).toHaveLength(1);
  });

  it('carries extra typed dice into notes rather than dropping them', () => {
    const [row] = attacksFromWeaponItems([weapon({
      name: 'Venom Blade',
      weapon: { damage: { dice: '1d6', type: 'piercing' }, ability: 'dex', proficient: true, bonus: [{ dice: '1d6', type: 'poison' }] },
    })], MODS);
    // `Attack` has one die string + a flat modifier, so a second damage TYPE has nowhere else to go.
    expect(row.atk.notes).toBe('+1d6 poison');
  });

  it('defaults defensively for a half-authored or imported item', () => {
    const [row] = attacksFromWeaponItems([{
      id: 'j', name: 'Junk', desc: '', qty: 1, tags: ['weapon'],
      weapon: { damage: { dice: '', type: '' } },
    } as InvItem], MODS);
    expect(row.atk.damage).toBe('1d4');
    expect(row.atk.proficient).toBe(false); // unticked means unticked; never assume proficiency
  });
});

describe('which items count', () => {
  it('takes kind: weapon OR the weapon tag', () => {
    expect(isWeaponItem(weapon({ name: 'A' }))).toBe(true);
    expect(isWeaponItem({ ...weapon({ name: 'B' }), kind: 'gear', tags: ['weapon'] } as InvItem)).toBe(true);
  });

  it('ignores an item with no weapon stats, whatever it is tagged', () => {
    expect(isWeaponItem({ id: 'r', name: 'Rope', desc: '', qty: 1, tags: ['weapon'] } as InvItem)).toBe(false);
    expect(attacksFromWeaponItems([{ id: 'r', name: 'Rope', desc: '', qty: 1, tags: ['weapon'] } as InvItem], MODS)).toEqual([]);
  });

  it('handles an empty or absent inventory', () => {
    expect(attacksFromWeaponItems(undefined, MODS)).toEqual([]);
    expect(attacksFromWeaponItems([], MODS)).toEqual([]);
  });
});

describe('no duplicate rows for a weapon the player already wrote up by hand', () => {
  it('skips a weapon whose name a stored attack already uses', () => {
    const rows = attacksFromWeaponItems([weapon({ name: 'Longsword' }), weapon({ id: 'b', name: 'Handaxe' })], MODS, ['longsword']);
    expect(rows.map((r) => r.atk.name)).toEqual(['Handaxe']);
  });

  it('matches case- and whitespace-insensitively', () => {
    expect(attacksFromWeaponItems([weapon({ name: '  LongSword ' })], MODS, ['Longsword'])).toEqual([]);
  });
});

describe('the ability rule matches engine/weapons.ts rather than inventing a second one', () => {
  it('uses what the item declares, when it declares one', () => {
    expect(weaponAbility({ damage: { dice: '1d8', type: 's' }, ability: 'cha' }, MODS)).toBe('cha');
  });

  it('finesse takes the better of STR/DEX', () => {
    expect(weaponAbility({ damage: { dice: '1d8', type: 's' }, properties: ['finesse'] }, MODS)).toBe('str');
    expect(weaponAbility({ damage: { dice: '1d8', type: 's' }, properties: ['finesse'] }, { str: 0, dex: 4 })).toBe('dex');
  });

  it('ammunition is DEX, and is not STR melee', () => {
    expect(weaponAbility({ damage: { dice: '1d8', type: 'p' }, properties: ['ammunition'] }, MODS)).toBe('dex');
    const [row] = attacksFromWeaponItems([weapon({
      name: 'Longbow', weapon: { damage: { dice: '1d8', type: 'piercing' }, properties: ['ammunition'], proficient: true },
    })], MODS);
    expect(row.atk.strMelee).toBeUndefined();
  });

  it('everything else is STR', () => {
    expect(weaponAbility({ damage: { dice: '1d8', type: 'b' } }, MODS)).toBe('str');
  });
});

describe('the contract is stated in three places and now implemented in one', () => {
  it('the Attacks table calls the mapper', () => {
    const src = read('app/dnd/_sheet/components/Attacks.tsx');
    expect(src).toContain('attacksFromWeaponItems');
    // Fed MODS, not scores — the finesse tie-break differs between them.
    expect(src).toContain('abilityMod(abilities[k])');
    // Deduped against stored attacks, or a hand-written row would be doubled.
    expect(src).toContain('char.attacks.map((a) => a.name)');
  });

  it('the player-facing tag text still promises exactly this', () => {
    // If someone rewrites the promise, they should see this and keep the two in step.
    const tags = read('app/dnd/_sheet/components/ui/tagInfo.ts');
    expect(tags).toContain('it shows up in your Attacks table');
    expect(tags).toContain("RESERVED_TAGS: readonly string[] = ['weapon', 'consumable', 'equipped']");
  });
});
