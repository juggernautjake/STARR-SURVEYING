// __tests__/dnd/grant-spell.test.ts — an item can grant a spell (Slice 11, last grant target).
//
// A wand of Fireball grants a spell even to a non-caster. It rides on `grantsSpell?: Spell` (the
// same structured shape as grantsAttack/grantsResource), normalised on ingest, active only while
// equipped, and rendered read-only + badged in the Spells tab — which now shows for a non-caster
// when there's a grant (it used to early-return past them).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { isItemActive } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

const PANEL = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/SpellsPanel.tsx'), 'utf8');

const wand: SheetEdit = {
  op: 'add_item',
  name: 'Wand of Fireball',
  equipped: true,
  grantsSpell: { name: 'Fireball', level: 3, school: 'Evocation', description: 'A bright streak flashes.' },
} as unknown as SheetEdit;

describe('add_item normalises a granted spell', () => {
  it('mints an id, clamps the level, marks it prepared', () => {
    const out = applySheetEdits(blankCharacter('Rook'), [wand]);
    const g = out.inventory.find((i) => i.name === 'Wand of Fireball')!.grantsSpell!;
    expect(g.id).toBeTruthy();
    expect(g.level).toBe(3);
    expect(g.prepared).toBe(true);
    expect(g.name).toBe('Fireball');
  });

  it('clamps an out-of-range level into 0..9', () => {
    const out = applySheetEdits(blankCharacter('Rook'), [
      { op: 'add_item', name: 'Overspell', equipped: true, grantsSpell: { name: 'X', level: 42 } } as unknown as SheetEdit,
    ]);
    expect(out.inventory[0].grantsSpell!.level).toBe(9);
  });
});

describe('the grant is active only while equipped', () => {
  it('isItemActive gates it; the spell survives unequip (hidden, not destroyed)', () => {
    const out = applySheetEdits(blankCharacter('Rook'), [wand]);
    expect(isItemActive(out.inventory[0])).toBe(true);
    const off = applySheetEdits(out, [{ op: 'equip_item', name: 'Wand of Fireball', value: false } as SheetEdit]);
    expect(isItemActive(off.inventory[0])).toBe(false);
    expect(off.inventory[0].grantsSpell?.name).toBe('Fireball');
  });
});

describe('SpellsPanel shows granted spells even for a non-caster', () => {
  it('no longer early-returns when there are only granted spells', () => {
    // The old guard bailed on any non-caster; it must now also consider grantedSpells.
    expect(PANEL).toContain('grantedSpells');
    expect(PANEL).toContain('(!sc || spells.length === 0) && grantedSpells.length === 0');
    expect(PANEL).toContain('Granted Spells');
    // The caster header is guarded so it never dereferences a missing `sc`.
    expect(PANEL).toContain('{sc && spells.length > 0 && (');
  });
});
