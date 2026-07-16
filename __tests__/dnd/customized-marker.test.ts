// __tests__/dnd/customized-marker.test.ts — the ✎ "hand-customized" marker (Slice 20).
//
// The user's ask, verbatim: "If the stats are edited, then there should be some kind of marker
// showing that the thing has been customized." So the signal is: edited-through-an-editor → ✎. The
// richer "differs from the OFFICIAL version + revert-to-official" needs a per-system content catalog
// to diff against and is its own slice. These tests pin the buildable core: the change-detection is
// correct (no false positives on a no-op save, sticky once set), it ignores the marker itself, and
// every in-place editor + render is wired.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { elementChanged, nextCustomized } from '@/app/dnd/_sheet/lib/customized';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

type El = { id: string; name: string; damage?: string; customized?: boolean };
const base: El = { id: 'a1', name: 'Longsword', damage: '1d8' };

describe('change detection is honest', () => {
  it('a real edit is a change', () => {
    expect(elementChanged(base, { ...base, damage: '2d6' })).toBe(true);
    expect(elementChanged(base, { ...base, name: 'Greatsword' })).toBe(true);
  });

  it('a no-op save is NOT a change (no false ✎ from opening + closing an editor)', () => {
    expect(elementChanged(base, { ...base })).toBe(false);
  });

  it('the marker field itself is ignored when comparing (else it would self-trigger)', () => {
    expect(elementChanged(base, { ...base, customized: true })).toBe(false);
  });
});

describe('nextCustomized: mark on edit, stay marked (never silently clears)', () => {
  it('an edited element becomes customized', () => {
    expect(nextCustomized(base, { ...base, damage: '2d6' })).toBe(true);
  });
  it('an untouched element stays as it was (no-op save keeps it un-customized)', () => {
    expect(nextCustomized(base, { ...base })).toBe(false);
  });
  it('an already-customized element stays customized even on a no-op save', () => {
    expect(nextCustomized({ ...base, customized: true }, { ...base, customized: true })).toBe(true);
  });
});

describe('every in-place editor sets the marker, and every render shows it', () => {
  it('the four editors compute nextCustomized on save', () => {
    for (const f of [
      'app/dnd/_sheet/components/ui/AttackEditor.tsx',
      'app/dnd/_sheet/components/ui/SpellEditor.tsx',
      'app/dnd/_sheet/components/ui/FeatureEditor.tsx',
      'app/dnd/_sheet/components/ItemBuilder.tsx',
    ]) {
      expect(read(f), `${f} sets customized`).toContain('nextCustomized(');
    }
  });

  it('the four tabs render the ✎ mark on the element', () => {
    expect(read('app/dnd/_sheet/components/Attacks.tsx')).toContain('<EditMark on={a.customized}');
    expect(read('app/dnd/_sheet/components/Inventory.tsx')).toContain('<EditMark on={it.customized}');
    expect(read('app/dnd/_sheet/components/Features.tsx')).toContain('<EditMark on={f.customized}');
    expect(read('app/dnd/_sheet/components/SpellsPanel.tsx')).toContain('<EditMark on={s.customized}');
  });

  it('✎ is a distinct marker from ★ (they never share a class)', () => {
    const mark = read('app/dnd/_sheet/components/ui/EditMark.tsx');
    expect(mark).toContain('edit-mark');
    expect(mark).not.toContain('mod-star');
  });
});

describe('the AI edit path marks ✎ too (same meaning whoever edited)', () => {
  function withElements(): Character {
    const c = blankCharacter('X');
    c.attacks = [{ id: 'a', name: 'Sword', ability: 'str', proficient: true, range: 'melee', damage: '1d8', damageType: 'slashing' }] as Character['attacks'];
    c.inventory = [{ id: 'i', name: 'Cloak', desc: '', qty: 1, tags: [] }] as Character['inventory'];
    c.features = [{ id: 'f', name: 'Rage', source: 'Class', body: ['angry'], unlockLevel: 1 }] as Character['features'];
    return c;
  }

  it('rename_attack / rename_item / rename_feature set customized', () => {
    const out = applySheetEdits(withElements(), [
      { op: 'rename_attack', name: 'Sword', to: 'Longsword' },
      { op: 'rename_item', name: 'Cloak', to: 'Cloak of Elvenkind' },
      { op: 'rename_feature', name: 'Rage', to: 'Fury' },
    ] as SheetEdit[]);
    expect(out.attacks[0].customized).toBe(true);
    expect(out.inventory[0].customized).toBe(true);
    expect(out.features[0].customized).toBe(true);
  });

  it('update_item marks the item customized', () => {
    const out = applySheetEdits(withElements(), [{ op: 'update_item', name: 'Cloak', desc: 'shimmering' } as SheetEdit]);
    expect(out.inventory[0].customized).toBe(true);
  });

  it('an untouched element stays un-customized after unrelated edits', () => {
    const out = applySheetEdits(withElements(), [{ op: 'rename_attack', name: 'Sword', to: 'Longsword' }] as SheetEdit[]);
    expect(out.features[0].customized).toBeUndefined(); // Rage wasn't touched
  });
});
