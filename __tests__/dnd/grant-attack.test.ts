// __tests__/dnd/grant-attack.test.ts — an item can grant a rollable attack (Slice 11 grant-half).
//
// Reuses the structured-sub-object shape proven by grantsResource: a full, rollable Attack rides on
// `grantsAttack` on the item, normalised on ingest, active only while equipped, and rendered through
// the SAME row logic as owned attacks (so to-hit/damage can't drift), badged and menu-less.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { isItemActive } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

const ATTACKS = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/Attacks.tsx'), 'utf8');

const sword: SheetEdit = {
  op: 'add_item',
  name: 'Flametongue',
  equipped: true,
  grantsAttack: { name: 'Flame Lash', ability: 'dex', damage: '2d6', damageType: 'fire', range: 'Melee' },
} as unknown as SheetEdit;

describe('add_item normalises a granted attack', () => {
  it('mints an id, keeps ability/damage/type', () => {
    const out = applySheetEdits(blankCharacter('Ember'), [sword]);
    const g = out.inventory.find((i) => i.name === 'Flametongue')!.grantsAttack!;
    expect(g.id).toBeTruthy();
    expect(g.ability).toBe('dex');
    expect(g.damage).toBe('2d6');
    expect(g.damageType).toBe('fire');
  });

  it('falls back to str + 1d6 when ability/damage are missing or bogus (no -NaN)', () => {
    const out = applySheetEdits(blankCharacter('Ember'), [
      { op: 'add_item', name: 'Junk Blade', equipped: true, grantsAttack: { name: 'Swing' } } as unknown as SheetEdit,
    ]);
    const g = out.inventory[0].grantsAttack!;
    expect(g.ability).toBe('str');
    expect(g.damage).toBe('1d6');
  });
});

describe('the granted attack is active only while the item is worn', () => {
  it('isItemActive gates it, and the attack survives unequip (hidden, not destroyed)', () => {
    const out = applySheetEdits(blankCharacter('Ember'), [sword]);
    expect(isItemActive(out.inventory[0])).toBe(true);
    const off = applySheetEdits(out, [{ op: 'equip_item', name: 'Flametongue', value: false } as SheetEdit]);
    expect(isItemActive(off.inventory[0])).toBe(false);
    expect(off.inventory[0].grantsAttack?.name).toBe('Flame Lash');
  });
});

describe('Attacks renders owned + granted through one row path', () => {
  it('builds a unified rows list and badges granted attacks without a ⋯ menu', () => {
    expect(ATTACKS).toContain('isItemActive');
    expect(ATTACKS).toContain('grantedAttacks');
    expect(ATTACKS).toContain('const rows:');
    expect(ATTACKS).toContain('rows.map(');
    // Granted branch shows a badge; the ElementMenu is on the owned branch only.
    expect(ATTACKS).toContain('granted ? (');
    expect(ATTACKS).toMatch(/granted · \{source\}|granted · /);
  });
});
