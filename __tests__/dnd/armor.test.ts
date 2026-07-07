// __tests__/dnd/armor.test.ts — armor → computed AC (Phase C15).
import { describe, it, expect } from 'vitest';
import { computeAC, armorBaseAC } from '@/app/dnd/_sheet/engine/armor';
import { collectItemEffects, attune, type EquipItem } from '@/app/dnd/_sheet/engine/equipment';

const it_ = (o: Partial<EquipItem> & { id: string; name: string }): EquipItem => ({ kind: 'armor', qty: 1, ...o });

describe('armor: base AC by type', () => {
  it('light adds full DEX', () => {
    expect(armorBaseAC({ armorType: 'light', baseAC: 11 }, 3)).toBe(14);
  });
  it('medium caps DEX at 2 by default', () => {
    expect(armorBaseAC({ armorType: 'medium', baseAC: 13 }, 3)).toBe(15); // +2 cap
    expect(armorBaseAC({ armorType: 'medium', baseAC: 13 }, 1)).toBe(14); // under cap
  });
  it('heavy ignores DEX', () => {
    expect(armorBaseAC({ armorType: 'heavy', baseAC: 18 }, 3)).toBe(18);
  });
});

describe('computeAC: worn armor', () => {
  it('unarmored is 10 + DEX', () => {
    expect(computeAC({ items: [], dexMod: 2 }).ac).toBe(12);
  });
  it('uses class Unarmored Defense when better', () => {
    // Barbarian 10 + DEX(2) + CON(2) = 14
    const r = computeAC({ items: [], dexMod: 2, unarmoredBaseAC: 14 });
    expect(r.ac).toBe(14);
    expect(r.source).toBe('Unarmored Defense');
  });
  it('worn plate: 18, no DEX, stealth disadvantage', () => {
    const plate = it_({ id: 'p', name: 'Plate', equipped: true, armor: { armorType: 'heavy', baseAC: 18, stealthDisadvantage: true } });
    const r = computeAC({ items: [plate], dexMod: 3 });
    expect(r.ac).toBe(18);
    expect(r.stealthDisadvantage).toBe(true);
    expect(r.source).toBe('Plate');
  });
  it('unequipped armor does not count', () => {
    const plate = it_({ id: 'p', name: 'Plate', armor: { armorType: 'heavy', baseAC: 18 } });
    expect(computeAC({ items: [plate], dexMod: 2 }).ac).toBe(12); // falls back to unarmored
  });
});

describe('computeAC: shield + effects stack', () => {
  const plate = it_({ id: 'p', name: 'Plate', equipped: true, armor: { armorType: 'heavy', baseAC: 18 } });
  const shield = it_({ id: 's', name: 'Shield', kind: 'shield', equipped: true, armor: { armorType: 'shield', baseAC: 2 } });
  const ring = it_({
    id: 'r', name: 'Ring of Protection', kind: 'magic_item', requiresAttunement: true,
    effects: [{ target: 'ac', operation: 'add', value: 1, condition: 'attuned' }],
  });
  it('plate + shield = 20', () => {
    expect(computeAC({ items: [plate, shield], dexMod: 3 }).ac).toBe(20);
  });
  it('plate + shield + attuned ring = 21 (effect stacks on top)', () => {
    const items = attune([plate, shield, ring], 'r');
    const effects = collectItemEffects(items);
    expect(computeAC({ items, dexMod: 3, effects }).ac).toBe(21);
  });
  it('the ring alone (unattuned) contributes nothing', () => {
    const items = [plate, shield, ring];
    expect(computeAC({ items, dexMod: 3, effects: collectItemEffects(items) }).ac).toBe(20);
  });
});
