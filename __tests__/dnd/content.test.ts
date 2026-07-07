// __tests__/dnd/content.test.ts — custom content → engine (Phase C19).
import { describe, it, expect } from 'vitest';
import { contentToEquipItem, contentEffects, isEquippable, type ContentRow } from '@/app/dnd/_sheet/engine/content';
import { buildAttack, type AttackContext } from '@/app/dnd/_sheet/engine/weapons';
import { collectItemEffects, attune, type EquipItem } from '@/app/dnd/_sheet/engine/equipment';
import { computeAC } from '@/app/dnd/_sheet/engine/armor';

const ctx: AttackContext = {
  mods: { str: 4, dex: 2, con: 2, int: 0, wis: 1, cha: 1 },
  proficiencyBonus: 2,
  proficientCategories: ['martial'],
};

describe('content: kind classification', () => {
  it('knows which kinds are equippable', () => {
    expect(isEquippable('weapon')).toBe(true);
    expect(isEquippable('magic_item')).toBe(true);
    expect(isEquippable('feat')).toBe(false);
    expect(isEquippable('spell')).toBe(false);
  });
  it('refuses to make an item out of a non-equippable kind', () => {
    expect(() => contentToEquipItem({ id: 'f', name: 'Tough', kind: 'feat' })).toThrow();
  });
});

describe('content: a homebrew weapon affects attacks', () => {
  it('a homebrew +2 Vicious Handaxe raises to-hit and damage', () => {
    const row: ContentRow = {
      id: 'axe', name: 'Vicious Handaxe +2', kind: 'weapon',
      data: { weapon: { category: 'martial', damage: '1d6', damageType: 'slashing', attackBonus: 2, damageBonus: 2, properties: ['light', 'thrown'] } },
    };
    const item = { ...contentToEquipItem(row), equipped: true } as EquipItem & { weapon: NonNullable<EquipItem['weapon']> };
    const atk = buildAttack(item, ctx);
    expect(atk.toHit).toBe(8); // +4 STR + 2 PB + 2 weapon
    expect(atk.damageMod).toBe(6); // +4 STR + 2 weapon
    expect(atk.damageDice).toBe('1d6');
  });
});

describe('content: a homebrew magic item affects the sheet', () => {
  const ring: ContentRow = {
    id: 'ring', name: 'Homebrew Ring of Warding', kind: 'magic_item', requires_attunement: true,
    data: { effects: [{ target: 'ac', operation: 'add', value: 2, condition: 'attuned' }] },
  };
  it('carries attunement + effects through the converter', () => {
    const item = contentToEquipItem(ring);
    expect(item.requiresAttunement).toBe(true);
    expect(contentEffects(ring)).toHaveLength(1);
  });
  it('changes AC only once attuned', () => {
    const item = contentToEquipItem(ring);
    expect(computeAC({ items: [item], dexMod: 2, effects: collectItemEffects([item]) }).ac).toBe(12); // inert
    const attuned = attune([item], item.id);
    expect(computeAC({ items: attuned, dexMod: 2, effects: collectItemEffects(attuned) }).ac).toBe(14); // +2
  });
});

describe('content: homebrew armor', () => {
  it('a homebrew mithral plate converts and computes AC', () => {
    const row: ContentRow = {
      id: 'mp', name: 'Mithral Plate', kind: 'armor',
      data: { armor: { armorType: 'heavy', baseAC: 18 }, weight: 40 }, // mithral: no stealth disadvantage
    };
    const item = { ...contentToEquipItem(row), equipped: true };
    expect(item.weight).toBe(40);
    expect(computeAC({ items: [item], dexMod: 3 }).ac).toBe(18);
  });
});
