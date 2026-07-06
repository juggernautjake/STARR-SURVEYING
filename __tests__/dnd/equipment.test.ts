// __tests__/dnd/equipment.test.ts — equipment core (Phase C14).
import { describe, it, expect } from 'vitest';
import {
  equip,
  unequip,
  attune,
  unattune,
  canAttune,
  attunedCount,
  totalWeight,
  coinWeight,
  carryingCapacity,
  encumbranceLevel,
  totalGold,
  collectItemEffects,
  ATTUNEMENT_CAP,
  type EquipItem,
  type Currency,
} from '@/app/dnd/_sheet/engine/equipment';
import { resolveNumeric } from '@/app/dnd/_sheet/engine/effects';

const item = (o: Partial<EquipItem> & { id: string; name: string }): EquipItem => ({
  kind: 'item',
  qty: 1,
  ...o,
});

describe('equipment: equip / unequip', () => {
  it('toggles equipped immutably', () => {
    const inv = [item({ id: 'a', name: 'Breastplate' })];
    const on = equip(inv, 'a');
    expect(on[0].equipped).toBe(true);
    expect(inv[0].equipped).toBeUndefined(); // original untouched
    expect(unequip(on, 'a')[0].equipped).toBe(false);
  });
});

describe('equipment: attunement (cap 3)', () => {
  const three: EquipItem[] = ['x', 'y', 'z'].map((id) =>
    item({ id, name: id, requiresAttunement: true, attuned: true }),
  );
  it('counts attuned items', () => {
    expect(attunedCount(three)).toBe(ATTUNEMENT_CAP);
  });
  it('refuses a 4th attunement', () => {
    const inv = [...three, item({ id: 'w', name: 'Cloak', requiresAttunement: true })];
    expect(canAttune(inv, 'w').ok).toBe(false);
    expect(attune(inv, 'w').find((i) => i.id === 'w')?.attuned).toBeFalsy();
  });
  it('refuses attunement on items that do not require it', () => {
    const inv = [item({ id: 'p', name: 'Torch' })];
    expect(canAttune(inv, 'p').ok).toBe(false);
    expect(attune(inv, 'p')[0].attuned).toBeFalsy();
  });
  it('attunes when under the cap, and unattunes', () => {
    const inv = [item({ id: 'p', name: 'Ring', requiresAttunement: true })];
    const on = attune(inv, 'p');
    expect(on[0].attuned).toBe(true);
    expect(unattune(on, 'p')[0].attuned).toBe(false);
  });
});

describe('equipment: weight, capacity, encumbrance, wealth', () => {
  const inv: EquipItem[] = [
    item({ id: 'a', name: 'Plate', weight: 65 }),
    item({ id: 'b', name: 'Rations', weight: 2, qty: 5 }),
  ];
  const purse: Currency = { cp: 0, sp: 0, ep: 0, gp: 100, pp: 0 };
  it('sums item + coin weight (50 coins/lb)', () => {
    expect(coinWeight(purse)).toBeCloseTo(2); // 100 gp
    expect(totalWeight(inv)).toBe(75); // 65 + 2*5
    expect(totalWeight(inv, purse)).toBeCloseTo(77);
  });
  it('carrying capacity is STR×15 and encumbrance uses the variant thresholds', () => {
    expect(carryingCapacity(15)).toBe(225);
    expect(encumbranceLevel(70, 15)).toBe('none'); // ≤ 75
    expect(encumbranceLevel(80, 15)).toBe('encumbered'); // > 75 (STR×5)
    expect(encumbranceLevel(160, 15)).toBe('heavily'); // > 150 (STR×10)
    expect(encumbranceLevel(230, 15)).toBe('over'); // > 225 (STR×15)
  });
  it('totals wealth in gp', () => {
    expect(totalGold({ cp: 100, sp: 10, ep: 2, gp: 5, pp: 1 })).toBeCloseTo(1 + 1 + 1 + 5 + 10);
  });
});

describe('equipment: item effects feed the resolver only when active', () => {
  const ring: EquipItem = item({
    id: 'r',
    name: 'Ring of Protection',
    kind: 'magic_item',
    requiresAttunement: true,
    effects: [{ target: 'ac', operation: 'add', value: 1, condition: 'attuned' }],
  });
  it('contributes nothing while unworn', () => {
    expect(collectItemEffects([ring])).toEqual([]);
    expect(resolveNumeric(collectItemEffects([ring]), 'ac', 15)).toBe(15);
  });
  it("applies the +1 AC once attuned, and tags the source", () => {
    const attuned = attune([ring], 'r');
    const effs = collectItemEffects(attuned);
    expect(effs).toHaveLength(1);
    expect(effs[0]).toMatchObject({ target: 'ac', operation: 'add', value: 1, source: 'Ring of Protection' });
    expect(effs[0].condition).toBeUndefined(); // item-relative condition resolved away
    expect(resolveNumeric(effs, 'ac', 15)).toBe(16);
  });
});
