// __tests__/dnd/identity-overlay.test.ts — identity effects overlay the header (Slice 11, first cut).
//
// An effect can impose a different name/species/class while active — a pendant that makes you "Zul
// the Barbarian". Like every effect it's an OVERLAY: the display shows the imposed value, the base
// (char.meta.*) is untouched, and dropping the source restores exactly. This pins the ledger
// behaviour the header reads, plus the Hero wiring that reads it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

const HERO = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/Hero.tsx'), 'utf8');

function pendant(): SheetEdit {
  // An AI-authored item (Slice 14 plumbing) that renames + reclasses while worn.
  return {
    op: 'add_item',
    name: 'Pendant of Zul',
    equipped: true,
    effects: [
      { target: 'name', operation: 'set', value: 'Zul' },
      { target: 'class', operation: 'set', value: 'Barbarian' },
    ],
  } as SheetEdit;
}

describe('the ledger imposes an identity, over an untouched base', () => {
  it('a worn pendant renames + reclasses; the base stays exactly', () => {
    const base = blankCharacter('Wendol');
    base.meta = { ...base.meta, className: 'Wizard' };
    const out = applySheetEdits(base, [pendant()]);
    const led = buildLedger(out);

    expect(led.identity('name')?.value).toBe('Zul');
    expect(led.identity('name')?.source).toBe('Pendant of Zul');
    expect(led.identity('class')?.value).toBe('Barbarian');
    expect(led.isModified('name')).toBe(true);
    expect(led.isModified('class')).toBe(true);

    // The stored character never changed — dropping the source is a free, correct revert.
    expect(out.meta.name).toBe('Wendol');
    expect(out.meta.className).toBe('Wizard');
  });

  it('no identity effect → identity() is null → base name stands', () => {
    const led = buildLedger(blankCharacter('Plain'));
    expect(led.identity('name')).toBeNull();
    expect(led.isModified('name')).toBe(false);
  });

  it('unequipping removes the overlay entirely', () => {
    const base = blankCharacter('Wendol');
    let out = applySheetEdits(base, [pendant()]);
    out = applySheetEdits(out, [{ op: 'equip_item', name: 'Pendant of Zul', value: false } as SheetEdit]);
    const led = buildLedger(out);
    expect(led.identity('name')).toBeNull(); // gone the moment it's off
  });
});

describe('the Hero header renders the overlay, not the base, and stars it', () => {
  it('reads identity() for name/species/class/subclass', () => {
    expect(HERO).toContain("ledger.identity('name')?.value ?? char.meta.name");
    expect(HERO).toContain("ledger.identity('species')?.value ?? char.meta.species");
    expect(HERO).toContain("ledger.identity('class')?.value ?? char.meta.className");
    expect(HERO).toContain("ledger.identity('subclass')?.value ?? char.meta.subclass");
  });

  it('the editable name input still binds to the BASE (edit writes base, display shows overlay)', () => {
    expect(HERO).toContain('value={char.meta.name}');
    expect(HERO).toContain('{renderName(displayName)}');
  });

  it('the imposed identity fields carry the ★ marker', () => {
    expect(HERO).toContain('EffectStar');
    expect(HERO).toContain('target="name"');
    expect(HERO).toContain('target="species"');
    expect(HERO).toContain('target="class"');
    expect(HERO).toContain('target="subclass"');
  });
});
