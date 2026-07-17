import { describe, it, expect } from 'vitest';
import { deriveAc } from '@/app/dnd/_sheet/lib/derive-ac';
import type { InvItem } from '@/app/dnd/_sheet/types';

// Slice 5 of DND_ITEM_BUILDER: equipped armor/shield/effects → AC.
const armor = (over: Partial<InvItem>): InvItem => ({ id: 'x', name: 'Item', desc: '', qty: 1, tags: [], ...over });

describe('deriveAc', () => {
  it('falls back to the manual AC when nothing is equipped', () => {
    const r = deriveAc([], 3, 16);
    expect(r.ac).toBe(16);
    expect(r.fromEquipment).toBe(false);
  });

  it('light armor adds full DEX', () => {
    const r = deriveAc([armor({ name: 'Leather', kind: 'armor', equipped: true, armor: { category: 'light', baseAC: 11 } })], 3, 10);
    expect(r.ac).toBe(14); // 11 + 3
    expect(r.fromEquipment).toBe(true);
    expect(r.source).toContain('Leather');
  });

  it('medium armor caps DEX at 2', () => {
    const r = deriveAc([armor({ name: 'Breastplate', kind: 'armor', equipped: true, armor: { category: 'medium', baseAC: 14, dexCap: 2 } })], 4, 10);
    expect(r.ac).toBe(16); // 14 + min(4,2)
  });

  it('heavy armor ignores DEX', () => {
    const r = deriveAc([armor({ name: 'Plate', kind: 'armor', equipped: true, armor: { category: 'heavy', baseAC: 18 } })], 4, 10);
    expect(r.ac).toBe(18);
  });

  it('a NEGATIVE DEX modifier still penalizes light + medium AC (the cap is not a floor)', () => {
    // A DEX-8 (mod −1) character: the "max 2" cap bounds only the upper side — a negative mod still applies,
    // so light/medium AC drops. A Math.max(0, …) "fix" would silently break this.
    const light = deriveAc([armor({ name: 'Leather', kind: 'armor', equipped: true, armor: { category: 'light', baseAC: 11 } })], -1, 10);
    expect(light.ac).toBe(10); // 11 + (−1)
    const medium = deriveAc([armor({ name: 'Breastplate', kind: 'armor', equipped: true, armor: { category: 'medium', baseAC: 14, dexCap: 2 } })], -1, 10);
    expect(medium.ac).toBe(13); // 14 + min(−1, 2) = 14 − 1
    const heavy = deriveAc([armor({ name: 'Plate', kind: 'armor', equipped: true, armor: { category: 'heavy', baseAC: 18 } })], -1, 10);
    expect(heavy.ac).toBe(18); // heavy ignores DEX, so a negative mod can't hurt it
  });

  it('adds a shield bonus and stacking +ac item effects', () => {
    const items: InvItem[] = [
      armor({ name: 'Breastplate', kind: 'armor', equipped: true, armor: { category: 'medium', baseAC: 14, dexCap: 2 } }),
      armor({ id: 's', name: 'Shield', kind: 'shield', equipped: true, armor: { category: 'shield', baseAC: 2 } }),
      armor({ id: 'r', name: 'Ring of Protection', kind: 'wondrous', attuned: true, effects: [{ target: 'ac', operation: 'add', value: 1 }] }),
    ];
    const r = deriveAc(items, 3, 10);
    expect(r.ac).toBe(14 + 2 + 2 + 1); // base(14+min(3,2)=16) + shield 2 + ring 1 = 19
    expect(r.ac).toBe(19);
    expect(r.shield).toBe(2);
    expect(r.effectBonus).toBe(1);
  });

  it('honors the "equipped" TAG (not just the flag) when selecting the body armor + shield base', () => {
    // The ledger's isEquipped treats the 'equipped' TAG as equipped, and acEffectBonus already honored it
    // for +ac effects — but the armor/shield BASE selection only checked the flag, so a tag-equipped armor
    // showed the unarmored AC. Base AND effects must agree on what "equipped" means.
    const items: InvItem[] = [
      armor({ name: 'Breastplate', kind: 'armor', tags: ['equipped'], armor: { category: 'medium', baseAC: 14, dexCap: 2 } }),
      armor({ id: 's', name: 'Shield', kind: 'shield', tags: ['equipped'], armor: { category: 'shield', baseAC: 2 } }),
    ];
    const r = deriveAc(items, 4, 10);
    expect(r.ac).toBe(14 + 2 + 2); // base 14 + min(4,2)=2, + shield 2 = 18 — not the manual 10
    expect(r.fromEquipment).toBe(true);
    expect(r.source).toContain('Breastplate');
  });

  it('ignores AC effects from unequipped items', () => {
    const r = deriveAc([armor({ name: 'Ring', kind: 'wondrous', equipped: false, attuned: false, effects: [{ target: 'ac', operation: 'add', value: 5 }] })], 2, 12);
    expect(r.ac).toBe(12);
  });

  it('counts +ac from a consumed active buff', () => {
    const r = deriveAc([], 2, 15, [{ id: 'a1', label: 'Shield of Faith', effects: [{ target: 'ac', operation: 'add', value: 2 }], duration: '10 min' }]);
    expect(r.ac).toBe(17);
    expect(r.effectBonus).toBe(2);
    expect(r.source).toContain('Shield of Faith');
  });
});
