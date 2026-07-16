// __tests__/dnd/grant-speeds.test.ts — movement is not one number (Slice 11). Fly/swim/climb/burrow
// are each their own target with their own base; a potion of flying is a fly speed, not "+30 speed".
// This pins the ledger behaviour and the Defenses speeds-block render home.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

const COMBAT = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/CombatPanel.tsx'), 'utf8');

const wings: SheetEdit = {
  op: 'add_item',
  name: 'Winged Boots',
  equipped: true,
  effects: [{ target: 'speed_fly', operation: 'set', value: 30 }],
} as SheetEdit;

describe('extra movement modes resolve independently of walk speed', () => {
  it('a fly speed exists on its own target, sourced', () => {
    const led = buildLedger(applySheetEdits(blankCharacter('Sky'), [wings]));
    expect(led.value('speed_fly', 0)).toBe(30);
    expect(led.isModified('speed_fly')).toBe(true);
    // ...and it did NOT bleed into walk speed.
    expect(led.isModified('speed_swim')).toBe(false);
    expect(led.explain('speed_fly')[0].source).toBe('Winged Boots');
  });

  it('with nothing granting flight, the fly target is unmodified (block stays hidden)', () => {
    const led = buildLedger(blankCharacter('Ground'));
    expect(led.isModified('speed_fly')).toBe(false);
    expect(led.value('speed_fly', 0)).toBe(0);
  });

  it('unequipping removes the fly speed', () => {
    let out = applySheetEdits(blankCharacter('Sky'), [wings]);
    out = applySheetEdits(out, [{ op: 'equip_item', name: 'Winged Boots', value: false } as SheetEdit]);
    expect(buildLedger(out).isModified('speed_fly')).toBe(false);
  });
});

describe('CombatPanel renders the speeds block', () => {
  it('reads each movement target and shows only granted modes, starred', () => {
    expect(COMBAT).toContain("'speed_fly'");
    expect(COMBAT).toContain("'speed_burrow'");
    expect(COMBAT).toContain('extraSpeeds');
    expect(COMBAT).toContain('s.value > 0 || s.modified');
    expect(COMBAT).toContain('target={s.key}');
  });
});
