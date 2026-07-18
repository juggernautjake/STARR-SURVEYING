// __tests__/dnd/equip-enforcement-gap.test.ts — the equip-enforcement gap is now CLOSED (Area E).
//
// Previously `canEquip`/`equipChecked` (engine/equipment.ts) only had a dead caller, so the live equip
// paths (the sheet's "Equipped" checkbox and the AI `equip_item` edit) could reach an illegal equipped
// state. Now both paths go through the pure equip-conflict core (lib/dnd/equip-conflicts.ts), gated on the
// campaign's `equipLimits` preference: the sheet raises a conflict dialog, and the AI auto-swaps to a legal
// state. These tests pin that enforcement + the off-switch, so a regression that dropped either fails here.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { InvItem } from '@/app/dnd/_sheet/types';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const armor = (id: string, name: string, equipped = false): InvItem =>
  ({ id, name, desc: '', qty: 1, tags: [], equipped, kind: 'armor', armor: { category: 'medium', baseAC: 14 } } as InvItem);

describe('equip enforcement is wired into the live paths (Area E)', () => {
  it('the AI equip_item path auto-swaps: equipping a second body armour unequips the first (enforced default)', () => {
    let c = blankCharacter('Tank');
    c.inventory = [armor('a', 'Plate', true), armor('b', 'Chain')];
    c = applySheetEdits(c, [{ op: 'equip_item', name: 'Chain', value: true } as SheetEdit]); // default = enforced
    const equipped = c.inventory.filter((i) => i.kind === 'armor' && i.equipped);
    expect(equipped).toHaveLength(1); // only one body armour worn
    expect(equipped[0].name).toBe('Chain'); // the newly-equipped one; Plate was auto-unequipped
  });

  it('with equipLimits OFF the AI equip stacks freely (the toggle the owner asked for)', () => {
    let c = blankCharacter('Tank');
    c.inventory = [armor('a', 'Plate', true), armor('b', 'Chain')];
    c = applySheetEdits(c, [{ op: 'equip_item', name: 'Chain', value: true } as SheetEdit], { equipLimits: 'off' });
    expect(c.inventory.filter((i) => i.kind === 'armor' && i.equipped)).toHaveLength(2);
  });

  it('both live equip surfaces now route through the equip-conflict core', () => {
    const edits = read('lib/dnd/sheet-edits.ts');
    expect(edits).toContain('equipConflicts');
    expect(edits).toContain('resolveEquipSwap'); // AI equip_item auto-swap
    const inv = read('app/dnd/_sheet/components/Inventory.tsx');
    expect(inv).toContain('equipConflicts'); // sheet checkbox → conflict dialog
    expect(inv).toContain('EquipConflictDialog');
  });
});
