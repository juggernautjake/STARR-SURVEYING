// __tests__/dnd/transform.test.ts — transform via an effect (Slice 18, tested core).
//
// "maybe a spell turns us into a bear… we would need to be able to end the effect and revert back."
// The tested-core-first piece: a `transform` effect on an item/spell IMPOSES a form, the ledger
// resolves it (`imposedTransform`/`ledger.transform()`), and that imposed form's own effects apply
// through the ledger — overlaying the character's base `activeFormId` WITHOUT writing it, so dropping
// the source reverts exactly (the anti-"permanent bear" guarantee). The full sheet-render of the form
// (strikeDie, form abilities, active highlight) rides on threading the effective form id into those
// components — a follow-up; this pins the resolution + the mechanical overlay.
import { describe, it, expect } from 'vitest';
import { buildLedger, imposedTransform } from '@/lib/dnd/effects/ledger';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character, CharForm } from '@/app/dnd/_sheet/types';

function druid(): Character {
  const c = blankCharacter('Keeper');
  c.abilities = { ...c.abilities, str: 10 };
  c.activeFormId = 'base';
  c.forms = [
    { id: 'base', name: 'Base', subtitle: '', cls: 'f-base', unlockLevel: 1, gating: 'held', flavor: '', bullets: [] },
    {
      id: 'bear', name: 'Brown Bear', subtitle: '', cls: 'f-bear', unlockLevel: 1, gating: 'surged', flavor: '', bullets: [],
      effects: [
        { target: 'ability_str', operation: 'set', value: 19 },
        { target: 'speed_walk', operation: 'add', value: 10 },
      ],
    },
  ] as CharForm[];
  return c;
}

// A Wild Shape potion: while worn, a transform effect imposes the bear form.
const potion: SheetEdit = {
  op: 'add_item',
  name: 'Wild Shape Focus',
  equipped: true,
  effects: [{ target: 'transform', operation: 'set', value: 'bear' }],
} as SheetEdit;

describe('a transform effect imposes a form, resolved by the ledger', () => {
  it('imposedTransform / ledger.transform() name the form and its source', () => {
    const out = applySheetEdits(druid(), [potion]);
    expect(imposedTransform(out)).toEqual({ value: 'bear', source: 'Wild Shape Focus' });
    expect(buildLedger(out).transform()).toEqual({ value: 'bear', source: 'Wild Shape Focus' });
  });

  it('the imposed form\'s OWN effects apply through the ledger (STR 19, +10 speed)', () => {
    const led = buildLedger(applySheetEdits(druid(), [potion]));
    expect(led.value('ability_str', 10)).toBe(19);
    expect(led.value('speed_walk', 30)).toBe(40);
  });

  it('the base is never written — activeFormId stays "base", STR stays 10 (anti-permanent-bear)', () => {
    const out = applySheetEdits(druid(), [potion]);
    expect(out.activeFormId).toBe('base'); // overlay, not mutation
    expect(out.abilities.str).toBe(10);
  });

  it('dropping the source reverts entirely — no bookkeeping', () => {
    let out = applySheetEdits(druid(), [potion]);
    expect(buildLedger(out).transform()).not.toBeNull();
    out = applySheetEdits(out, [{ op: 'equip_item', name: 'Wild Shape Focus', value: false } as SheetEdit]);
    expect(buildLedger(out).transform()).toBeNull();
    expect(buildLedger(out).isModified('ability_str')).toBe(false); // you are yourself again
  });

  it('with no transform effect, the character\'s own activeFormId still drives form effects', () => {
    const c = druid();
    c.activeFormId = 'bear'; // manually in bear form, no potion
    const led = buildLedger(c);
    expect(led.transform()).toBeNull();          // nothing IMPOSED it
    expect(led.value('ability_str', 10)).toBe(19); // ...but the active form still applies
  });
});
