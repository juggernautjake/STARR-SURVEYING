// __tests__/dnd/weapons.test.ts — weapons → attack entries (Phase C16).
import { describe, it, expect } from 'vitest';
import { buildAttack, attacksFromInventory, type AttackContext } from '@/app/dnd/_sheet/engine/weapons';
import type { EquipItem, WeaponSpec } from '@/app/dnd/_sheet/engine/equipment';

// Lazzuh-ish: STR +4, DEX +2, level 3 (PB 2), proficient with simple+martial.
const ctx: AttackContext = {
  mods: { str: 4, dex: 2, con: 2, int: 0, wis: 1, cha: 1 },
  proficiencyBonus: 2,
  proficientCategories: ['simple', 'martial'],
};

const weapon = (id: string, name: string, w: WeaponSpec, extra: Partial<EquipItem> = {}): EquipItem & { weapon: WeaponSpec } =>
  ({ id, name, kind: 'weapon', qty: 1, equipped: true, weapon: w, ...extra }) as EquipItem & { weapon: WeaponSpec };

describe('weapons: ability selection', () => {
  it('melee uses STR', () => {
    const a = buildAttack(weapon('g', 'Greatsword', { category: 'martial', damage: '2d6', damageType: 'slashing', properties: ['heavy', 'two-handed'] }), ctx);
    expect(a.ability).toBe('str');
    expect(a.toHit).toBe(6); // +4 STR + 2 PB
    expect(a.damageDice).toBe('2d6');
    expect(a.damageMod).toBe(4);
  });
  it('finesse uses the better of STR/DEX', () => {
    const a = buildAttack(weapon('r', 'Rapier', { category: 'martial', damage: '1d8', damageType: 'piercing', properties: ['finesse'] }), ctx);
    expect(a.ability).toBe('str'); // STR +4 > DEX +2
    const dexier = buildAttack(weapon('r', 'Rapier', { category: 'martial', damage: '1d8', damageType: 'piercing', properties: ['finesse'] }), { ...ctx, mods: { ...ctx.mods, dex: 5 } });
    expect(dexier.ability).toBe('dex');
  });
  it('ammunition weapons use DEX', () => {
    const a = buildAttack(weapon('b', 'Longbow', { category: 'martial', damage: '1d8', damageType: 'piercing', properties: ['ammunition', 'two-handed'], range: { normal: 150, long: 600 } }), ctx);
    expect(a.ability).toBe('dex');
    expect(a.toHit).toBe(4); // +2 DEX + 2 PB
    expect(a.range).toEqual({ normal: 150, long: 600 });
  });
});

describe('weapons: proficiency + versatile + bonuses', () => {
  it('omits PB when not proficient', () => {
    const a = buildAttack(weapon('c', 'Exotic Blade', { category: 'martial', damage: '1d8', damageType: 'slashing' }), { ...ctx, proficientCategories: ['simple'] });
    expect(a.proficient).toBe(false);
    expect(a.toHit).toBe(4); // +4 STR, no PB
  });
  it('versatile switches dice when two-handed', () => {
    const spec: WeaponSpec = { category: 'martial', damage: '1d8', damageType: 'slashing', properties: ['versatile'], versatileDamage: '1d10' };
    expect(buildAttack(weapon('l', 'Longsword', spec), ctx).damageDice).toBe('1d8');
    expect(buildAttack(weapon('l', 'Longsword', spec), { ...ctx, twoHanded: true }).damageDice).toBe('1d10');
  });
  it('a +1 weapon adds to hit and damage (scoped to the weapon)', () => {
    const a = buildAttack(weapon('m', 'Longsword +1', { category: 'martial', damage: '1d8', damageType: 'slashing', attackBonus: 1, damageBonus: 1 }), ctx);
    expect(a.toHit).toBe(7); // +4 +2 +1
    expect(a.damageMod).toBe(5); // +4 +1
  });
  it('general attack_and_damage effects apply to every attack', () => {
    const a = buildAttack(weapon('g', 'Greatsword', { category: 'martial', damage: '2d6', damageType: 'slashing' }), {
      ...ctx,
      effects: [{ target: 'attack_and_damage', operation: 'add', value: 1 }],
    });
    expect(a.toHit).toBe(7); // +4 +2 +1
    expect(a.damageMod).toBe(5); // +4 +1
  });
});

describe('weapons: attacksFromInventory', () => {
  it('generates one attack per EQUIPPED weapon only', () => {
    const items: EquipItem[] = [
      { id: 'g', name: 'Greatsword', kind: 'weapon', qty: 1, equipped: true, weapon: { category: 'martial', damage: '2d6', damageType: 'slashing' } },
      { id: 'd', name: 'Dagger (stowed)', kind: 'weapon', qty: 1, weapon: { category: 'simple', damage: '1d4', damageType: 'piercing' } },
      { id: 'p', name: 'Potion', kind: 'consumable', qty: 1, equipped: true },
    ];
    const attacks = attacksFromInventory(items, ctx);
    expect(attacks.map((a) => a.name)).toEqual(['Greatsword']);
  });
});
