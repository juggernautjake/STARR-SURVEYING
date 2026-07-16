// __tests__/dnd/spell-dc-ledger.test.ts — spell save DC / attack compose through the ledger (Slice 33).
//
// An item that grants +1 spell save DC (a Rod of the Pact Keeper) must land ON TOP of the caster's
// own 8 + PB + mod, not be ignored or replace it. This is exactly the derived-target case Slice 10
// fixed: value(target, callerBase) resolves against the base the caller passes, so the caster's DC
// is respected and the item's bonus stacks.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

const PANEL = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/SpellsPanel.tsx'), 'utf8');

describe('an item DC bonus composes with the caster base', () => {
  it('+1 spell_save_dc lands on top of the caller base (15 → 16), not replacing it', () => {
    const out = applySheetEdits(blankCharacter('Mage'), [
      { op: 'add_item', name: 'Rod of the Pact Keeper', equipped: true, effects: [{ target: 'spell_save_dc', operation: 'add', value: 1 }] } as SheetEdit,
    ]);
    const led = buildLedger(out);
    // caller passes its computed DC (say 15); the ledger adds the item's +1.
    expect(led.value('spell_save_dc', 15)).toBe(16);
    // spell attack composes the same way.
    const out2 = applySheetEdits(out, [
      { op: 'add_item', name: 'Wand of the War Mage', equipped: true, effects: [{ target: 'spell_attack', operation: 'add', value: 2 }] } as SheetEdit,
    ]);
    expect(buildLedger(out2).value('spell_attack', 7)).toBe(9);
  });

  it('an unmodified caster is unchanged — the base passes straight through', () => {
    const led = buildLedger(blankCharacter('Plain'));
    expect(led.value('spell_save_dc', 15)).toBe(15);
    expect(led.value('spell_attack', 7)).toBe(7);
  });
});

describe('SpellsPanel routes DC + attack through the ledger', () => {
  it('computes both via value(target, base) rather than a bare formula', () => {
    expect(PANEL).toContain("ledger.value('spell_save_dc'");
    expect(PANEL).toContain("ledger.value('spell_attack'");
    // the base still carries the caster override + 8+PB+mod.
    expect(PANEL).toContain('char.combat.saveDCOverride ?? 8 + pb + mod');
  });
});
