// __tests__/dnd/grant-feature.test.ts — an item can grant a FEATURE (Slice 11, first heavy grant).
//
// The pendant that gives you a Barbarian feature from another class entirely. The granted feature
// appears in Features badged to its source and is gone when the item comes off. Its mechanics live
// in the item's other effects (already ledger-resolved); grant_feature is the human-readable card.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

const FEATURES = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/Features.tsx'), 'utf8');

const pendant: SheetEdit = {
  op: 'add_item',
  name: 'Pendant of the Wild',
  equipped: true,
  effects: [
    { target: 'grant_feature', operation: 'set', value: 'Rage' },
    { target: 'ability_str', operation: 'add', value: 2 }, // the mechanical half, separate
  ],
} as SheetEdit;

describe('the ledger surfaces a granted feature with its source', () => {
  it('an equipped pendant grants "Rage", sourced', () => {
    const led = buildLedger(applySheetEdits(blankCharacter('Wiz'), [pendant]));
    const granted = led.explain('grant_feature').filter((c) => !c.suppressed);
    expect(granted).toHaveLength(1);
    expect(granted[0].effect.value).toBe('Rage');
    expect(granted[0].source).toBe('Pendant of the Wild');
    // The mechanical half resolves independently.
    expect(led.value('ability_str', 10)).toBe(12);
  });

  it('the granted feature never mutates the stored features list (it is an overlay)', () => {
    const out = applySheetEdits(blankCharacter('Wiz'), [pendant]);
    expect(out.features.some((f) => f.name === 'Rage')).toBe(false); // not baked in
  });

  it('unequipping removes the grant', () => {
    let out = applySheetEdits(blankCharacter('Wiz'), [pendant]);
    out = applySheetEdits(out, [{ op: 'equip_item', name: 'Pendant of the Wild', value: false } as SheetEdit]);
    expect(buildLedger(out).explain('grant_feature').filter((c) => !c.suppressed)).toHaveLength(0);
  });
});

describe('Features renders granted features read-only and badged', () => {
  it("reads explain('grant_feature') and shows a sourced, menu-less card", () => {
    expect(FEATURES).toContain(".explain('grant_feature')");
    expect(FEATURES).toContain('grantedFeatures');
    expect(FEATURES).toContain('Granted by');
    // The character's own features have an ElementMenu; the granted card must NOT (it's on loan).
    // Assert the granted block appears after the owned-feature map and carries no ElementMenu.
    const grantedBlock = FEATURES.slice(FEATURES.indexOf('{grantedFeatures.map'));
    expect(grantedBlock).not.toContain('<ElementMenu');
  });
});
