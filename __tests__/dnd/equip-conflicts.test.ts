import { describe, it, expect } from 'vitest';
import { equipConflicts, resolveEquipSwap, handsToFree, type EquipConflictItem } from '@/lib/dnd/equip-conflicts';

// Phase 2 · E1a — equip-slot conflict detection + swap on the live inventory model. The owner's example:
// holding a sword + shield, trying to equip an axe (two-handed) → the axe conflicts with the shield, and the
// dialog offers to unequip it.

const sword: EquipConflictItem = { id: 'sword', name: 'Longsword', kind: 'weapon', equipped: true, weapon: { properties: [] } };
const shield: EquipConflictItem = { id: 'shield', name: 'Kite Shield', kind: 'shield', equipped: true, armor: { category: 'shield' } };
const axe: EquipConflictItem = { id: 'axe', name: 'Greataxe', kind: 'weapon', equipped: false, weapon: { properties: ['two-handed'] } };
const plate: EquipConflictItem = { id: 'plate', name: 'Plate', kind: 'armor', equipped: false, armor: { category: 'heavy' } };
const chain: EquipConflictItem = { id: 'chain', name: 'Chain Mail', kind: 'armor', equipped: true, armor: { category: 'heavy' } };

describe('equipConflicts', () => {
  it("the owner's case: a two-handed axe needs both hands, so it conflicts with BOTH the sword and the shield", () => {
    const conflicts = equipConflicts([sword, shield, axe], 'axe');
    expect(conflicts.map((c) => c.id).sort()).toEqual(['shield', 'sword']);
    expect(conflicts.every((c) => /both hands/i.test(c.reason))).toBe(true);
    // Both must be freed (a two-handed weapon needs 2 hands, and both are occupied).
    expect(handsToFree([sword, shield, axe], 'axe')).toBe(2);
  });

  it('dual-wield: equipping a third one-handed weapon needs only ONE hand freed (player picks which)', () => {
    const dagger = { id: 'dagger', name: 'Dagger', kind: 'weapon', equipped: true, weapon: { properties: [] } };
    const short = { id: 'short', name: 'Shortsword', kind: 'weapon', equipped: true, weapon: { properties: [] } };
    const third = { id: 'third', name: 'Handaxe', kind: 'weapon', equipped: false, weapon: { properties: [] } };
    const conflicts = equipConflicts([dagger, short, third], 'third');
    expect(conflicts.map((c) => c.id).sort()).toEqual(['dagger', 'short']); // both are candidates
    expect(handsToFree([dagger, short, third], 'third')).toBe(1); // but freeing either one suffices
  });

  it('equipping a shield conflicts with an equipped shield AND an equipped two-handed weapon', () => {
    const twoH = { ...axe, equipped: true };
    const newShield: EquipConflictItem = { id: 'buckler', name: 'Buckler', kind: 'shield', equipped: false, armor: { category: 'shield' } };
    const conflicts = equipConflicts([shield, twoH, newShield], 'buckler');
    expect(conflicts.map((c) => c.id).sort()).toEqual(['axe', 'shield']);
  });

  it('a second body armor conflicts with the worn one', () => {
    const conflicts = equipConflicts([chain, plate], 'plate');
    expect(conflicts.map((c) => c.id)).toEqual(['chain']);
    expect(conflicts[0].reason).toMatch(/body armor/i);
  });

  it('no conflict when the slot is free, re-equipping, or the id is unknown', () => {
    expect(equipConflicts([sword, plate], 'plate')).toEqual([]); // sword doesn't block armor
    expect(equipConflicts([shield], 'shield')).toEqual([]); // already equipped
    expect(equipConflicts([sword], 'ghost')).toEqual([]); // unknown id
  });
});

describe('resolveEquipSwap', () => {
  it('unequips the chosen conflictor(s) and equips the target — immutably', () => {
    const items = [sword, shield, axe];
    const next = resolveEquipSwap(items, 'axe', ['shield']);
    expect(next.find((i) => i.id === 'axe')!.equipped).toBe(true);
    expect(next.find((i) => i.id === 'shield')!.equipped).toBe(false);
    expect(next.find((i) => i.id === 'sword')!.equipped).toBe(true); // untouched
    // input not mutated
    expect(shield.equipped).toBe(true);
  });

  it('an empty unequip list simply equips the target (no conflict / limits off)', () => {
    const next = resolveEquipSwap([plate], 'plate', []);
    expect(next[0].equipped).toBe(true);
  });
});
