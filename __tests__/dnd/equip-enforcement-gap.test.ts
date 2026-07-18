// __tests__/dnd/equip-enforcement-gap.test.ts — TRACKS a real gap so it can't silently grow or be forgotten.
//
// `engine/equipment.ts` `canEquip`/`equipChecked` correctly refuse a second body armour, a second shield,
// and a shield-with-a-two-handed-weapon (both directions) — `equipment.test.ts` covers that RULE. BUT the
// only caller of `equipChecked` is `engine/character.ts`, the dead `deriveCharacter` reducer no live surface
// imports. The LIVE equip paths — the `ItemBuilder` "Equipped" checkbox and the AI `equip_item` edit — do
// NOT call `canEquip`, so a player/AI CAN reach an illegal equipped state (bounded: `deriveAc` still picks
// one armour for AC, but item EFFECTS stack). Wiring `canEquip` into the live paths needs a UX/refusal
// decision (owner/QA-gated). Until then, these tests pin the current reality: when the wiring lands, they
// flip and get updated — the gap can only shrink, never silently expand.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { InvItem } from '@/app/dnd/_sheet/types';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const armor = (id: string, name: string, equipped = false): InvItem =>
  ({ id, name, desc: '', qty: 1, tags: [], equipped, kind: 'armor', armor: { category: 'medium', baseAC: 14 } } as InvItem);

describe('KNOWN GAP (tracked): equip validation is correct but not wired to the live paths', () => {
  it('the AI equip_item path equips a SECOND body armour — the illegal state canEquip WOULD refuse', () => {
    let c = blankCharacter('Tank');
    c.inventory = [armor('a', 'Plate', true), armor('b', 'Chain')];
    c = applySheetEdits(c, [{ op: 'equip_item', name: 'Chain', value: true } as SheetEdit]);
    const equippedArmors = c.inventory.filter((i) => i.kind === 'armor' && i.equipped);
    // TODO(equip-wiring): when canEquip is wired into equip_item, this becomes 1 (Chain refused). Update then.
    expect(equippedArmors).toHaveLength(2);
  });

  it('neither live equip surface references canEquip yet — only the dead engine reducer enforces it', () => {
    expect(read('lib/dnd/sheet-edits.ts')).not.toContain('canEquip');            // AI equip_item path
    expect(read('app/dnd/_sheet/components/ItemBuilder.tsx')).not.toContain('canEquip'); // live sheet checkbox
    // the enforcement genuinely exists — but only in engine/character.ts, which no live surface imports.
    expect(read('app/dnd/_sheet/engine/character.ts')).toContain('equipChecked');
  });
});
