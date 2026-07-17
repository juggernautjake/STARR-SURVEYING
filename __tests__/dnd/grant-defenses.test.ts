// __tests__/dnd/grant-defenses.test.ts — damage resistances/immunities/vulnerabilities get a home
// (Slice 11 grant-half). These were collectable by the ledger but rendered nowhere; the Defenses
// card now lists them, sourced, and they vanish on unequip.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

const COMBAT = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/CombatPanel.tsx'), 'utf8');

const cloak: SheetEdit = {
  op: 'add_item',
  name: 'Cloak of the Salamander',
  equipped: true,
  effects: [
    { target: 'resistance', operation: 'resistance', value: 'fire' },
    { target: 'immunity', operation: 'immunity', value: 'poison' },
    { target: 'vulnerability', operation: 'vulnerability', value: 'cold' },
    { target: 'grant_sense', operation: 'set', value: 'darkvision 60' },
  ],
} as SheetEdit;

describe('the ledger collects defenses with their source', () => {
  it('an equipped cloak grants resistance, immunity, and vulnerability', () => {
    const led = buildLedger(applySheetEdits(blankCharacter('Ash'), [cloak]));
    expect(led.collected('resistance').map((r) => r.value)).toContain('fire');
    expect(led.collected('immunity').map((r) => r.value)).toContain('poison');
    expect(led.collected('vulnerability').map((r) => r.value)).toContain('cold');
    expect(led.collected('resistance')[0].source).toBe('Cloak of the Salamander');
  });

  it('a granted sense (op set) is explained with its source', () => {
    const led = buildLedger(applySheetEdits(blankCharacter('Ash'), [cloak]));
    const senses = led.explain('grant_sense').filter((c) => !c.suppressed);
    expect(senses).toHaveLength(1);
    expect(senses[0].effect.value).toBe('darkvision 60');
    expect(senses[0].source).toBe('Cloak of the Salamander');
  });

  it('unequipping removes all three', () => {
    let out = applySheetEdits(blankCharacter('Ash'), [cloak]);
    out = applySheetEdits(out, [{ op: 'equip_item', name: 'Cloak of the Salamander', value: false } as SheetEdit]);
    const led = buildLedger(out);
    expect(led.collected('resistance')).toEqual([]);
    expect(led.collected('immunity')).toEqual([]);
    expect(led.collected('vulnerability')).toEqual([]);
  });
});

describe('CombatPanel renders the defenses as their home', () => {
  it('reads the ledger for all three and gates each on non-empty', () => {
    expect(COMBAT).toContain("ledger.collected('resistance')");
    expect(COMBAT).toContain("ledger.collected('vulnerability')");
    // Damage immunity is now collected by TARGET (explain), not by the shared 'immunity' operation.
    expect(COMBAT).toContain("ledger.explain('immunity')");
    expect(COMBAT).toContain('resistances.length > 0');
    expect(COMBAT).toContain('vulnerabilities.length > 0');
  });
});

describe('condition immunity is separated from damage immunity (shared op, distinct targets)', () => {
  const ward: SheetEdit = {
    op: 'add_item',
    name: 'Ward of the Steadfast',
    equipped: true,
    effects: [
      { target: 'immunity', operation: 'immunity', value: 'poison' }, // a DAMAGE immunity
      { target: 'condition_immunity', operation: 'immunity', value: 'Frightened' }, // a CONDITION immunity
    ],
  } as SheetEdit;

  it('the ledger keeps them on their own targets even though they share the immunity operation', () => {
    const led = buildLedger(applySheetEdits(blankCharacter('Ward'), [ward]));
    // explain(target) separates them; collected(op) would conflate them into one list.
    expect(led.explain('immunity').map((c) => c.effect.value)).toEqual(['poison']);
    expect(led.explain('condition_immunity').map((c) => c.effect.value)).toEqual(['Frightened']);
    expect(led.collected('immunity').map((r) => r.value).sort()).toEqual(['Frightened', 'poison']); // the conflation the panel must NOT show
  });

  it('the panel renders a distinct "Immune to conditions" line, so a condition immunity is not mislabeled as damage', () => {
    expect(COMBAT).toContain("ledger.explain('condition_immunity')");
    expect(COMBAT).toContain('Immune to conditions');
    expect(COMBAT).toContain('conditionImmunities.length > 0');
  });
});
