// __tests__/dnd/equip-conflict-dialog.test.ts — Area E1c. The conflict dialog + its wiring into the live
// equip path. Source-anchors the gate/flow in Inventory, and replicates the dialog's "which swaps to offer"
// logic against the pure core so we know it shows a per-conflict swap when one removal resolves it (dual-
// wield) and a single "unequip all" when a two-handed weapon needs both hands freed.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { equipConflicts, resolveEquipSwap, type EquipConflictItem } from '@/lib/dnd/equip-conflicts';

const inventory = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/Inventory.tsx'), 'utf8');
const dialog = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/EquipConflictDialog.tsx'), 'utf8');

// The dialog offers a single-swap button for each conflict whose removal ALONE leaves the target legal —
// tested by unequipping that candidate (target still NOT equipped) and seeing nothing else blocks it.
function singleSwaps(inv: EquipConflictItem[], targetId: string) {
  const withoutConflict = (cid: string) => inv.map((it) => (it.id === cid ? { ...it, equipped: false } : it));
  return equipConflicts(inv, targetId).filter((c) => equipConflicts(withoutConflict(c.id), targetId).length === 0);
}

describe('equip conflict dialog wiring (E1c)', () => {
  it('Inventory gates the check on enforced equip limits and raises the dialog on conflict', () => {
    expect(inventory).toContain("preferences.equipLimits.value === 'enforced'");
    expect(inventory).toContain('equipConflicts(nextInv, item.id)');
    expect(inventory).toContain('setEquipConflict(');
    expect(inventory).toContain('resolveEquipSwap(c.inventory, targetId, unequipIds)');
    expect(inventory).toContain('<EquipConflictDialog');
  });

  it('the dialog always offers Cancel and computes single-item swaps without equipping the target first', () => {
    expect(dialog).toContain('onCancel');
    expect(dialog).toContain('singleSwaps');
    expect(dialog).toContain('withoutConflict'); // tests removal WITHOUT equipping the target
  });
});

describe("the dialog shows the right choices (logic mirrors the component)", () => {
  const sword: EquipConflictItem = { id: 'sword', name: 'Longsword', kind: 'weapon', equipped: true, weapon: { properties: [] } };
  const shield: EquipConflictItem = { id: 'shield', name: 'Shield', kind: 'shield', equipped: true, armor: { category: 'shield' } };

  it('two-handed over sword+shield: no single swap resolves it → offer "unequip all"', () => {
    const axe: EquipConflictItem = { id: 'axe', name: 'Greataxe', kind: 'weapon', equipped: false, weapon: { properties: ['two-handed'] } };
    const inv = [sword, shield, axe];
    expect(singleSwaps(inv, 'axe')).toHaveLength(0); // → the component renders one "Unequip both & equip"
    // and the "unequip all + equip" action produces a legal state: axe equipped, sword & shield off.
    const resolved = resolveEquipSwap(inv, 'axe', ['sword', 'shield']);
    expect(resolved.find((i) => i.id === 'axe')!.equipped).toBe(true);
    expect(resolved.find((i) => i.id === 'sword')!.equipped).toBe(false);
    expect(resolved.find((i) => i.id === 'shield')!.equipped).toBe(false);
  });

  it('dual-wield: each conflict is a valid single swap → the player picks which', () => {
    const d1: EquipConflictItem = { id: 'd1', name: 'Dagger', kind: 'weapon', equipped: true, weapon: { properties: [] } };
    const d2: EquipConflictItem = { id: 'd2', name: 'Shortsword', kind: 'weapon', equipped: true, weapon: { properties: [] } };
    const d3: EquipConflictItem = { id: 'd3', name: 'Handaxe', kind: 'weapon', equipped: false, weapon: { properties: [] } };
    expect(singleSwaps([d1, d2, d3], 'd3').map((c) => c.id).sort()).toEqual(['d1', 'd2']);
  });
});
