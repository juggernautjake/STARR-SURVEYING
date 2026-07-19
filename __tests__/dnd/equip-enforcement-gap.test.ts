// __tests__/dnd/equip-enforcement-gap.test.ts — the equip-enforcement gap is now CLOSED (Area E).
//
// Previously `canEquip`/`equipChecked` (engine/equipment.ts) only had a dead caller, so the live equip
// paths (the sheet's "Equipped" checkbox and the AI `equip_item` edit) could reach an illegal equipped
// state. Now both paths go through the pure equip-conflict core (lib/dnd/equip-conflicts.ts), gated on the
// campaign's `equipLimits` preference: the sheet raises a conflict dialog, and the AI auto-swaps to a legal
// state. These tests pin that enforcement + the off-switch, so a regression that dropped either fails here.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { InvItem } from '@/app/dnd/_sheet/types';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const armor = (id: string, name: string, equipped = false): InvItem =>
  ({ id, name, desc: '', qty: 1, tags: [], equipped, kind: 'armor', armor: { category: 'medium', baseAC: 14 } } as InvItem);
const weapon = (id: string, name: string, twoHanded = false, equipped = false): InvItem =>
  ({ id, name, desc: '', qty: 1, tags: ['weapon'], equipped, kind: 'weapon', weapon: { properties: twoHanded ? ['two-handed'] : [] } } as InvItem);
const shield = (id: string, name: string, equipped = false): InvItem =>
  ({ id, name, desc: '', qty: 1, tags: [], equipped, kind: 'shield', armor: { category: 'shield' } } as InvItem);

describe('equip enforcement is wired into the live paths (Area E)', () => {
  it('the AI equip_item path auto-swaps: equipping a second body armour unequips the first (enforced default)', () => {
    let c = blankCharacter('Tank');
    c.inventory = [armor('a', 'Plate', true), armor('b', 'Chain')];
    c = applySheetEdits(c, [{ op: 'equip_item', name: 'Chain', value: true } as SheetEdit]); // default = enforced
    const equipped = c.inventory.filter((i) => i.kind === 'armor' && i.equipped);
    expect(equipped).toHaveLength(1); // only one body armour worn
    expect(equipped[0].name).toBe('Chain'); // the newly-equipped one; Plate was auto-unequipped
  });

  it('with equipLimits OFF the AI equip stacks freely (the toggle the owner asked for)', () => {
    let c = blankCharacter('Tank');
    c.inventory = [armor('a', 'Plate', true), armor('b', 'Chain')];
    c = applySheetEdits(c, [{ op: 'equip_item', name: 'Chain', value: true } as SheetEdit], { equipLimits: 'off' });
    expect(c.inventory.filter((i) => i.kind === 'armor' && i.equipped)).toHaveLength(2);
  });

  it("the AI path enforces the HAND-SLOT model too: a two-handed weapon auto-frees BOTH a held weapon and shield (the owner's case)", () => {
    let c = blankCharacter('Duelist');
    c.inventory = [weapon('sw', 'Longsword', false, true), shield('sh', 'Kite Shield', true), weapon('ax', 'Greataxe', true)];
    c = applySheetEdits(c, [{ op: 'equip_item', name: 'Greataxe', value: true } as SheetEdit]); // enforced default
    const equipped = c.inventory.filter((i) => i.equipped).map((i) => i.name);
    // Both hands are needed by the two-hander, so BOTH the sword and the shield are auto-unequipped.
    expect(equipped).toEqual(['Greataxe']);
  });

  it('both live equip surfaces now route through the equip-conflict core', () => {
    const edits = read('lib/dnd/sheet-edits.ts');
    expect(edits).toContain('equipConflicts');
    expect(edits).toContain('resolveEquipSwap'); // AI equip_item auto-swap
    const inv = read('app/dnd/_sheet/components/Inventory.tsx');
    expect(inv).toContain('equipConflicts'); // sheet checkbox → conflict dialog
    expect(inv).toContain('EquipConflictDialog');
  });
});

// Owner 2026-07-19: equip/unequip moved onto the Gear rows themselves. The risk of a new
// equip path is that it writes `equipped` directly and skips the conflict rules the other
// two paths obey — these pin it to the same enforced route.
describe('the Gear-row equip toggle (Inventory)', () => {
  const src = read('app/dnd/_sheet/components/Inventory.tsx');

  it('routes equipping through upsert, so equip-limit enforcement still applies', () => {
    expect(src).toContain('function toggleEquip');
    // Both branches must go through upsert — a direct setChar here would bypass
    // equipConflicts and let an illegal loadout through.
    const body = src.slice(src.indexOf('function toggleEquip'), src.indexOf('function toggleAttune'));
    expect(body).toContain('upsert({ ...it, equipped: true })');
    expect(body).toContain('equipped: false');
    expect(body).not.toContain('setChar(');
  });

  it('strips the legacy equipped TAG when taking an item off', () => {
    // The ledger treats the tag as worn, so clearing only the flag would leave the item
    // silently still applying its effects.
    const body = src.slice(src.indexOf('function toggleEquip'), src.indexOf('function toggleAttune'));
    expect(body).toContain("filter((t) => t !== 'equipped')");
  });

  it('reads worn state with the same predicate as the ledger and deriveAc', () => {
    expect(src).toContain("it.equipped === true || it.tags?.includes('equipped') === true");
  });

  it('offers the toggle for equippable kinds and anything already worn', () => {
    expect(src).toContain("EQUIPPABLE = new Set(['armor', 'shield', 'weapon', 'wondrous'])");
    expect(src).toContain('EQUIPPABLE.has(it.kind ?? \'gear\') || isWorn(it)');
  });

  it('is gated on write access', () => {
    expect(src).toContain('canWrite && canEquip(it)');
  });
});
