import { describe, it, expect } from 'vitest';
import type { InvItem, TypedDamage, WeaponStats, ArmorStats, ConsumableStats } from '@/app/dnd/_sheet/types';

// Slice 1 of DND_ITEM_BUILDER: lock the extended InvItem shape. These are type-level
// guards — if the interfaces change incompatibly, this file stops compiling (and the
// runtime assertions double as a smoke test that the fields round-trip).

describe('item-builder data model', () => {
  it('models a weapon with primary + typed bonus damage (2d8 slashing + 1d6 poison)', () => {
    const weapon: WeaponStats = {
      ability: 'str',
      proficient: true,
      range: '5 ft (melee)',
      damage: { dice: '2d8', type: 'slashing' },
      bonus: [{ dice: '1d6', type: 'poison' }],
      properties: ['versatile'],
    };
    const item: InvItem = {
      id: 'w1', name: 'Venomfang Blade', desc: 'A wicked serrated sword.', qty: 1,
      tags: ['weapon', 'equipped'], kind: 'weapon', equipped: true, weapon,
      image: 'https://example.com/characters/x/item/blade.png',
    };
    expect(item.weapon?.damage.dice).toBe('2d8');
    expect(item.weapon?.bonus?.[0]).toEqual<TypedDamage>({ dice: '1d6', type: 'poison' });
    expect(item.image).toContain('blade.png');
  });

  it('models armor + a shield that affect AC', () => {
    const armor: ArmorStats = { category: 'medium', baseAC: 14, dexCap: 2, stealthDisadvantage: true };
    const shield: ArmorStats = { category: 'shield', baseAC: 2 };
    const body: InvItem = { id: 'a1', name: 'Breastplate', desc: '', qty: 1, tags: ['equipped'], kind: 'armor', equipped: true, armor };
    const shieldItem: InvItem = { id: 's1', name: 'Shield', desc: '', qty: 1, tags: ['equipped'], kind: 'shield', equipped: true, armor: shield };
    expect(body.armor?.category).toBe('medium');
    expect(shieldItem.armor?.baseAC).toBe(2);
  });

  it('models consumables — heal, a timed status, and a stat-setting buff', () => {
    const potion: ConsumableStats = { effect: { kind: 'heal', dice: '2d4+2' } };
    const consumable: InvItem = { id: 'c1', name: 'Wellness Shot', desc: '', qty: 3, tags: ['consumable'], kind: 'consumable', consumable: potion };

    // A potion that grants the Invisible condition for a set duration.
    const invis: InvItem = { id: 'c2', name: 'Potion of Invisibility', desc: '', qty: 1, tags: ['consumable'], kind: 'consumable',
      consumable: { effect: { kind: 'status', status: 'Invisible', duration: '1 hour' } } };
    expect(invis.consumable?.effect.status).toBe('Invisible');
    expect(invis.consumable?.effect.duration).toBe('1 hour');

    // A Potion of Giant Strength that SETS the drinker's STR score to 25 for a duration.
    const strPotion: InvItem = { id: 'c3', name: 'Potion of Storm Giant Strength', desc: '', qty: 1, tags: ['consumable'], kind: 'consumable',
      consumable: { effect: { kind: 'buff', duration: '1 hour', effects: [{ target: 'str_score', operation: 'set', value: 25, source: 'Potion of Storm Giant Strength' }] } } };
    expect(strPotion.consumable?.effect.effects?.[0]).toMatchObject({ target: 'str_score', operation: 'set', value: 25 });
    const ring: InvItem = {
      id: 'r1', name: 'Ring of Protection', desc: '', qty: 1, tags: ['equipped'], kind: 'wondrous', attuned: true,
      effects: [{ target: 'ac', operation: 'add', value: 1, condition: 'attuned', source: 'Ring of Protection' }],
    };
    expect(consumable.consumable?.effect.dice).toBe('2d4+2');
    expect(ring.effects?.[0].target).toBe('ac');
  });

  it('keeps legacy items (no builder fields) valid', () => {
    const legacy: InvItem = { id: 'l1', name: 'Rope', desc: '50 ft of hemp.', qty: 1, tags: ['flavor'] };
    expect(legacy.kind).toBeUndefined();
    expect(legacy.weapon).toBeUndefined();
  });
});
