// __tests__/dnd/hp-fold.test.ts — max HP folds through the ledger (Slice 15, the deferred piece).
//
// An item that grants +max HP (a Belt of Hill Giant vitality, an Aid buff) now raises the shown max
// AND the heal ceiling, as an overlay: the stored base maxHp is never written, so dropping the item
// re-derives you, and currentHp is displayed clamped so a dropped item can't leave you "over max".
// The clamp entanglement that deferred this is solved by clamping to the LEDGER value everywhere.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

function withVitalityBelt(): Character {
  const c = blankCharacter('Grond');
  c.combat = { ...c.combat, maxHp: 68, currentHp: 68 } as Character['combat'];
  return applySheetEdits(c, [
    { op: 'add_item', name: 'Belt of Vitality', equipped: true, effects: [{ target: 'hp_max', operation: 'add', value: 10 }] } as SheetEdit,
  ]);
}

describe('hp_max folds through the ledger, base untouched', () => {
  it('the effective max is 78 while worn, base stays 68', () => {
    const out = withVitalityBelt();
    expect(buildLedger(out).value('hp_max', out.combat.maxHp)).toBe(78);
    expect(out.combat.maxHp).toBe(68); // overlay — base not written
  });
  it('dropping the belt reverts the max to 68', () => {
    let out = withVitalityBelt();
    out = applySheetEdits(out, [{ op: 'equip_item', name: 'Belt of Vitality', value: false } as SheetEdit]);
    expect(buildLedger(out).value('hp_max', out.combat.maxHp)).toBe(68);
    expect(buildLedger(out).isModified('hp_max')).toBe(false);
  });
});

describe('the store clamps heal to the EFFECTIVE max, and the panel shows it', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
  it('every heal clamp uses effMaxHp (base + hp_max effect), not the raw base', () => {
    const store = read('app/dnd/_sheet/state/store.tsx');
    expect(store).toContain("const effMaxHp = (c: Character) => buildLedger(c).value('hp_max', c.combat.maxHp)");
    // no heal clamp still points at the raw stored max.
    expect(store).not.toContain('Math.min(c.combat.maxHp, cur + delta)');
    expect(store).not.toContain('Math.min(c.combat.maxHp, c.combat.currentHp + total)');
  });
  it('CombatPanel shows the effective max (starred) and clamps the displayed current', () => {
    const panel = read('app/dnd/_sheet/components/CombatPanel.tsx');
    expect(panel).toContain("ledger.value('hp_max', combat.maxHp)");
    expect(panel).toContain('const shownHp = Math.min(combat.currentHp, effMaxHp)');
    expect(panel).toContain('target="hp_max"');
  });
});
