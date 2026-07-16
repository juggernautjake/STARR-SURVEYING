// __tests__/dnd/grant-proficiency.test.ts — granted proficiencies get a home (Slice 11 grant-half).
//
// The doc's rule: every effect target must render somewhere or it's a lie. grant_proficiency was
// collectable by the ledger but appeared nowhere on the sheet. Now an item that grants longsword
// proficiency lists it, sourced, under Skills — and it's gone the moment the item comes off.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

const SAVES = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/SavesSkills.tsx'), 'utf8');

const gauntlets: SheetEdit = {
  op: 'add_item',
  name: 'Gauntlets of the Legion',
  equipped: true,
  effects: [
    { target: 'proficiency', operation: 'grant_proficiency', value: 'longswords' },
    { target: 'grant_language', operation: 'grant_proficiency', value: 'Giant' },
  ],
} as SheetEdit;

describe('the ledger collects granted proficiencies with their source', () => {
  it('an equipped item grants longsword proficiency + a language, sourced', () => {
    const out = applySheetEdits(blankCharacter('Ren'), [gauntlets]);
    const granted = buildLedger(out).collected('grant_proficiency');
    const values = granted.map((g) => g.value);
    expect(values).toContain('longswords');
    expect(values).toContain('Giant');
    expect(granted.find((g) => g.value === 'longswords')?.source).toBe('Gauntlets of the Legion');
  });

  it('nothing granted → an empty list (no phantom rows)', () => {
    expect(buildLedger(blankCharacter('Plain')).collected('grant_proficiency')).toEqual([]);
  });

  it('unequipping removes the grant entirely', () => {
    let out = applySheetEdits(blankCharacter('Ren'), [gauntlets]);
    out = applySheetEdits(out, [{ op: 'equip_item', name: 'Gauntlets of the Legion', value: false } as SheetEdit]);
    expect(buildLedger(out).collected('grant_proficiency')).toEqual([]);
  });
});

describe('SavesSkills renders granted proficiencies as their home', () => {
  it('reads collected() and shows each with its source', () => {
    expect(SAVES).toContain("ledger.collected('grant_proficiency')");
    expect(SAVES).toContain('Granted Proficiencies');
    expect(SAVES).toContain('from {g.source}');
    // ...and only when there's something to show.
    expect(SAVES).toContain('grantedProfs.length > 0');
  });
});
