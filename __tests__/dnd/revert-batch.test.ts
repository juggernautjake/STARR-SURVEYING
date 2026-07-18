import { describe, it, expect } from 'vitest';
import { applySheetEdits, revertBatch, editOldValue, type SheetEdit, type AuditedEdit } from '@/lib/dnd/sheet-edits';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

// history/undo B1 — revertBatch undoes an entire AI request as a unit. This is the "I asked it to make
// my character all-powerful, now put it back" round-trip: apply a batch capturing each edit's old_value
// exactly as the route does, then revertBatch must restore the pre-batch sheet byte-for-byte.

/** Apply `edits` to `char`, capturing old_value BEFORE each edit (as the audit trail does). */
function applyWithAudit(char: Character, edits: SheetEdit[]): { after: Character; batch: AuditedEdit[] } {
  const batch: AuditedEdit[] = [];
  let c = char;
  for (const e of edits) {
    batch.push({ edit: e, oldValue: editOldValue(c, e) ?? null });
    c = applySheetEdits(c, [e]);
  }
  return { after: c, batch };
}

describe('revertBatch — undo a whole AI request', () => {
  it('restores the exact pre-batch sheet after an "all-powerful" edit', () => {
    const base = blankCharacter('Nadia');
    const opEdits: SheetEdit[] = [
      { op: 'set_level', value: 20 },
      { op: 'set_ability', ability: 'str', value: 30 },
      { op: 'set_combat', field: 'maxHp', value: 500 },
      { op: 'add_feature', name: 'Godslayer', body: ['Ignore all resistances.'] },
      { op: 'add_item', name: 'Vorpal Sword', kind: 'weapon' },
      { op: 'add_spell', name: 'Wish', level: 9, description: 'Anything.' },
    ];
    const { after, batch } = applyWithAudit(base, opEdits);
    // The op character is genuinely changed.
    expect(after.meta.level).toBe(20);
    expect(after.abilities.str).toBe(30);
    expect(after.features.some((f) => f.name === 'Godslayer')).toBe(true);

    const back = revertBatch(after, batch);
    expect(back.meta.level).toBe(base.meta.level);
    expect(back.abilities.str).toBe(base.abilities.str);
    expect(back.combat.maxHp).toBe(base.combat.maxHp);
    expect(back.features.some((f) => f.name === 'Godslayer')).toBe(false);
    expect(back.inventory.some((i) => i.name === 'Vorpal Sword')).toBe(false);
    expect((back.spells ?? []).some((s) => s.name === 'Wish')).toBe(false);
  });

  it('handles add-then-retune within one batch (reverse order matters)', () => {
    const base = blankCharacter('Rook');
    const edits: SheetEdit[] = [
      { op: 'add_item', name: 'Cloak', kind: 'wondrous' },
      { op: 'update_item', name: 'Cloak', desc: 'Now +3 to stealth.' },
      { op: 'rename_item', name: 'Cloak', to: 'Cloak of Shadows' } as SheetEdit,
    ];
    const { after, batch } = applyWithAudit(base, edits);
    expect(after.inventory.some((i) => i.name === 'Cloak of Shadows')).toBe(true);
    const back = revertBatch(after, batch);
    // Every trace of the batch is gone — the item never existed pre-batch.
    expect(back.inventory.some((i) => /Cloak/.test(i.name))).toBe(false);
    expect(back.inventory.length).toBe(base.inventory.length);
  });

  it('an empty batch is a no-op', () => {
    const base = blankCharacter('Still');
    expect(revertBatch(base, [])).toEqual(base);
  });

  it('does not mutate its input — reverting produces a NEW sheet, the post-batch one stays intact', () => {
    // revertBatch deep-clones its input (structuredClone), so a DM's undo can't corrupt the live sheet it
    // reads. The tests above only inspect the returned `back`; this pins that `after` survives the revert
    // untouched (the apply+revert pair to the applySheetEdits non-mutation guard).
    const base = blankCharacter('Vera');
    const { after, batch } = applyWithAudit(base, [
      { op: 'set_level', value: 20 },
      { op: 'add_item', name: 'Vorpal Sword', kind: 'weapon' },
      { op: 'add_feature', name: 'Godslayer', body: ['x'] },
    ]);
    const before = structuredClone(after);
    revertBatch(after, batch);
    expect(after).toEqual(before); // the input post-batch sheet is untouched by the revert
  });
});
