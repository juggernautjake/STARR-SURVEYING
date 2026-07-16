// __tests__/dnd/identity-size.test.ts — size / creature-type identity effects get a render home
// (Slice 11). An Enlarge potion makes you Large; a polymorph makes you a Beast. The ledger already
// resolves these identity targets; this gives them a line on the sheet (the mechanical size wiring —
// carrying capacity, grapple — is a follow-up, but the change must at least be visible).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

const COMBAT = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/CombatPanel.tsx'), 'utf8');

const potion: SheetEdit = {
  op: 'add_item',
  name: 'Potion of Enlarge',
  equipped: true,
  effects: [
    { target: 'size', operation: 'set', value: 'Large' },
    { target: 'creature_type', operation: 'set', value: 'Giant' },
  ],
} as SheetEdit;

describe('the ledger imposes size / creature type, sourced', () => {
  it('an equipped item makes you Large / Giant, base untouched', () => {
    const led = buildLedger(applySheetEdits(blankCharacter('Tumble'), [potion]));
    expect(led.identity('size')?.value).toBe('Large');
    expect(led.identity('size')?.source).toBe('Potion of Enlarge');
    expect(led.identity('creature_type')?.value).toBe('Giant');
  });

  it('nothing imposing size → identity() is null', () => {
    const led = buildLedger(blankCharacter('Plain'));
    expect(led.identity('size')).toBeNull();
    expect(led.identity('creature_type')).toBeNull();
  });

  it('unequipping removes the imposed size', () => {
    let out = applySheetEdits(blankCharacter('Tumble'), [potion]);
    out = applySheetEdits(out, [{ op: 'equip_item', name: 'Potion of Enlarge', value: false } as SheetEdit]);
    expect(buildLedger(out).identity('size')).toBeNull();
  });
});

describe('CombatPanel gives size / creature type a home', () => {
  it('reads identity() for both and shows them with their source', () => {
    expect(COMBAT).toContain("ledger.identity('size')");
    expect(COMBAT).toContain("ledger.identity('creature_type')");
    expect(COMBAT).toContain('Creature type');
  });
});
