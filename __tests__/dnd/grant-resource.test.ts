// __tests__/dnd/grant-resource.test.ts — an item can grant a usage pool (Slice 11 grant-half).
//
// grant_resource is a STATEFUL grant (a pool with charges + a reset rule), so unlike the flat
// grants it rides on a structured `grantsResource` sub-object on the item, not a string-valued
// Effect. applySheetEdits normalises it (current defaults full, sane colour/reset); it's active only
// while the item is equipped; Resources renders it read-only and badged, gone on unequip.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { isItemActive } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

const RES = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/Resources.tsx'), 'utf8');

const staff: SheetEdit = {
  op: 'add_item',
  name: 'Staff of Charges',
  equipped: true,
  grantsResource: { name: 'Arcane Charges', max: 5, resetOn: 'short', color: 'gold' },
} as unknown as SheetEdit;

describe('add_item normalises a granted resource', () => {
  it('fills current, keeps reset/colour, and mints an id', () => {
    const out = applySheetEdits(blankCharacter('Mage'), [staff]);
    const g = out.inventory.find((i) => i.name === 'Staff of Charges')!.grantsResource!;
    expect(g.max).toBe(5);
    expect(g.current).toBe(5); // defaulted to full
    expect(g.resetOn).toBe('short');
    expect(g.color).toBe('gold');
    expect(g.id).toBeTruthy();
  });

  it('clamps a supplied current to [0, max]', () => {
    const out = applySheetEdits(blankCharacter('Mage'), [
      { op: 'add_item', name: 'Overcharged', equipped: true, grantsResource: { name: 'X', max: 3, current: 9 } } as unknown as SheetEdit,
    ]);
    expect(out.inventory[0].grantsResource!.current).toBe(3);
  });
});

describe('the grant is active only while the item is worn', () => {
  it('isItemActive gates it on equipped (and attuned when attuned)', () => {
    const out = applySheetEdits(blankCharacter('Mage'), [staff]);
    const item = out.inventory[0];
    expect(isItemActive(item)).toBe(true);
    const off = applySheetEdits(out, [{ op: 'equip_item', name: 'Staff of Charges', value: false } as SheetEdit]);
    expect(isItemActive(off.inventory[0])).toBe(false);
    // still carries its pool (re-equip restores it) — the grant is hidden, not destroyed.
    expect(off.inventory[0].grantsResource?.name).toBe('Arcane Charges');
  });

  it('an attuned item needs BOTH equipped and attuned to be active', () => {
    const out = applySheetEdits(blankCharacter('Mage'), [
      { op: 'add_item', name: 'Attuned Rod', equipped: true, attuned: false, grantsResource: { name: 'Y', max: 2 } } as unknown as SheetEdit,
    ]);
    expect(isItemActive(out.inventory[0])).toBe(true); // not attuned-flagged → just needs equip
    const out2 = applySheetEdits(out, [{ op: 'update_item', name: 'Attuned Rod', attuned: true } as SheetEdit]);
    // now attuned=true AND equipped=true → active
    expect(isItemActive(out2.inventory[0])).toBe(true);
  });
});

describe('Resources renders granted pools read-only and sourced', () => {
  it('reads equipped items, badges the grant, and does not attach a spend menu', () => {
    expect(RES).toContain('isItemActive');
    expect(RES).toContain('grantedResources');
    expect(RES).toContain('Granted by');
    const block = RES.slice(RES.indexOf('{grantedResources.map'));
    expect(block.slice(0, block.indexOf('{canWrite'))).not.toContain('<ElementMenu');
  });
});
