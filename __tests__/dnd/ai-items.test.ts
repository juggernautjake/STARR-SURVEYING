// __tests__/dnd/ai-items.test.ts — the AI generates REAL items, not labels (Slice 14).
//
// The bug this closes: add_item took only name/desc/qty, so the model could emit "Belt of the Bear
// (+2 STR)" and the +2 lived only in prose — the sheet's STR never moved. add_item/update_item now
// carry a validated `effects` array that the ledger resolves. The end-to-end assertion is the one
// that matters: a described item round-trips to a changed number, and taking it off gives the
// character back exactly.
import { describe, it, expect } from 'vitest';
import { applySheetEdits, validateSheetEdits, cleanEffects, SHEET_EDIT_TOOL, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

function hero() {
  const c = blankCharacter('Rangor');
  c.abilities = { ...c.abilities, str: 16 };
  return c;
}

describe('add_item carries real effects that the ledger resolves', () => {
  it('a Belt of the Bear (set STR 19) actually changes STR — end to end', () => {
    const out = applySheetEdits(hero(), [
      { op: 'add_item', name: 'Belt of the Bear', desc: 'Warm.', kind: 'wondrous', equipped: true, effects: [{ target: 'ability_str', operation: 'set', value: 19 }] } as SheetEdit,
    ]);
    const belt = out.inventory.find((i) => i.name === 'Belt of the Bear')!;
    expect(belt.effects).toHaveLength(1);
    expect(belt.equipped).toBe(true);

    const led = buildLedger(out);
    expect(led.isModified('ability_str')).toBe(true);
    expect(led.value('ability_str')).toBe(19); // set 19 beats base 16
    expect(out.abilities.str).toBe(16); // ...and the BASE is untouched — effects are overlays
  });

  it('an unequipped item contributes nothing (effects apply only while worn)', () => {
    const out = applySheetEdits(hero(), [
      { op: 'add_item', name: 'Sheathed Belt', equipped: false, effects: [{ target: 'ability_str', operation: 'add', value: 2 }] } as SheetEdit,
    ]);
    expect(buildLedger(out).isModified('ability_str')).toBe(false);
  });

  it('a +1 AC ring stacks with an add, and a magic weapon does +N to hit and damage', () => {
    const out = applySheetEdits(hero(), [
      { op: 'add_item', name: 'Ring of Protection', equipped: true, effects: [{ target: 'ac', operation: 'add', value: 1 }] } as SheetEdit,
      { op: 'add_item', name: 'Flametongue', equipped: true, effects: [{ target: 'attack_and_damage', operation: 'add', value: 2 }] } as SheetEdit,
    ]);
    const led = buildLedger(out);
    expect(led.isModified('ac')).toBe(true);
    expect(led.isModified('attack_and_damage')).toBe(true);
  });
});

describe('invalid effects are REJECTED, not coerced', () => {
  it('an unknown target is dropped from the item and reported', () => {
    const edits: SheetEdit[] = [
      { op: 'add_item', name: 'Cursed Junk', equipped: true, effects: [
        { target: 'ability_str', operation: 'add', value: 2 }, // valid
        { target: 'make_me_win', operation: 'add', value: 99 }, // nonsense target
      ] } as SheetEdit,
    ];
    const out = applySheetEdits(hero(), edits);
    const item = out.inventory.find((i) => i.name === 'Cursed Junk')!;
    expect(item.effects).toHaveLength(1); // the nonsense one is gone, not coerced
    expect(item.effects![0].target).toBe('ability_str');

    const rejects = validateSheetEdits(edits);
    expect(rejects).toHaveLength(1);
    expect(rejects[0].reason).toMatch(/make_me_win/);
  });

  it('an illegal operation on a valid target is rejected too', () => {
    // `resistance` takes a damage type, not `advantage`.
    expect(cleanEffects([{ target: 'resistance', operation: 'advantage' }])).toHaveLength(0);
    expect(cleanEffects([{ target: 'resistance', operation: 'resistance', value: 'fire' }])).toHaveLength(1);
  });

  it('a numeric target given a non-number value is rejected (no NaN reaches the ledger)', () => {
    expect(cleanEffects([{ target: 'ability_str', operation: 'add', value: 'lots' }])).toHaveLength(0);
  });
});

describe('update_item and equip_item refine without rebuilding', () => {
  it('update_item merges fields and keeps the id and untouched fields', () => {
    let out = applySheetEdits(hero(), [
      { op: 'add_item', name: 'Plain Cloak', desc: 'Grey wool.', effects: [{ target: 'ability_dex', operation: 'add', value: 1 }] } as SheetEdit,
    ]);
    const id0 = out.inventory[0].id;
    out = applySheetEdits(out, [{ op: 'update_item', name: 'Plain Cloak', attuned: true, kind: 'wondrous' } as SheetEdit]);
    const cloak = out.inventory.find((i) => i.name === 'Plain Cloak')!;
    expect(cloak.id).toBe(id0); // same row, refined
    expect(cloak.attuned).toBe(true);
    expect(cloak.kind).toBe('wondrous');
    expect(cloak.desc).toBe('Grey wool.'); // untouched
    expect(cloak.effects).toHaveLength(1); // untouched
  });

  it('update_item on a missing item is a no-op (it never silently creates)', () => {
    const before = hero();
    const out = applySheetEdits(before, [{ op: 'update_item', name: 'Nonexistent', equipped: true } as SheetEdit]);
    expect(out.inventory).toHaveLength(before.inventory.length);
  });

  it('equip_item toggles whether the effects apply', () => {
    let out = applySheetEdits(hero(), [
      { op: 'add_item', name: 'Boots of Striding', equipped: false, effects: [{ target: 'speed_walk', operation: 'add', value: 10 }] } as SheetEdit,
    ]);
    expect(buildLedger(out).isModified('speed_walk')).toBe(false);
    out = applySheetEdits(out, [{ op: 'equip_item', name: 'Boots of Striding', value: true } as SheetEdit]);
    expect(out.inventory[0].equipped).toBe(true);
    expect(buildLedger(out).isModified('speed_walk')).toBe(true);
    out = applySheetEdits(out, [{ op: 'equip_item', name: 'Boots of Striding', value: false } as SheetEdit]);
    expect(buildLedger(out).isModified('speed_walk')).toBe(false);
  });
});

describe('the tool schema exposes the widened vocabulary to the model', () => {
  it('the enum offers add_item / update_item / equip_item and an effects field', () => {
    const props = (SHEET_EDIT_TOOL.input_schema as { properties: { edits: { items: { properties: Record<string, { enum?: string[] }> } } } }).properties.edits.items.properties;
    expect(props.op.enum).toContain('update_item');
    expect(props.op.enum).toContain('equip_item');
    expect(props.effects).toBeTruthy();
    expect(props.kind).toBeTruthy();
  });
});
