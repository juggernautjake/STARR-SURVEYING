import { describe, it, expect } from 'vitest';
import { deriveAc } from '@/app/dnd/_sheet/lib/derive-ac';
import type { InvItem, ArmorStats } from '@/app/dnd/_sheet/types';

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

  it('respects a CUSTOM (authored) DEX cap, not just the default 2 — the armor builder\'s output', () => {
    // The armor builder / AI lets an item declare its OWN dexCap; deriveAc reads `a.dexCap ?? 2`, so a
    // non-standard cap must flow through to the AC. A "simplify to min(dex, 2)" regression would silently
    // ignore an authored cap — this is the pure mechanic the armor builder (doc line ~1547) rests on.
    const cap3 = deriveAc([armor({ name: 'Half Plate+', kind: 'armor', equipped: true, armor: { category: 'medium', baseAC: 15, dexCap: 3 } })], 4, 10);
    expect(cap3.ac).toBe(18); // 15 + min(4, 3) = 18, NOT 15 + 2 = 17
    // A cap of 0 admits no DEX — and pins `?? 2` against a `|| 2` regression (0 || 2 would wrongly give 2).
    const cap0 = deriveAc([armor({ name: 'Rigid Carapace', kind: 'armor', equipped: true, armor: { category: 'medium', baseAC: 16, dexCap: 0 } })], 4, 10);
    expect(cap0.ac).toBe(16); // 16 + min(4, 0) = 16
  });

  it('a medium armor with NO declared dexCap falls back to the 2 default (the `?? 2`)', () => {
    const r = deriveAc([armor({ name: 'Scale Mail', kind: 'armor', equipped: true, armor: { category: 'medium', baseAC: 14 } })], 5, 10);
    expect(r.ac).toBe(16); // 14 + min(5, undefined→2) = 16
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
      // A worn Ring of Protection: equipped AND attuned. Under the unified rule (deriveAc now shares the
      // ledger's isItemActive), an attunement item must be equipped for its effects to count — the ring you
      // benefit from is one you're wearing.
      armor({ id: 'r', name: 'Ring of Protection', kind: 'wondrous', equipped: true, attuned: true, effects: [{ target: 'ac', operation: 'add', value: 1 }] }),
    ];
    const r = deriveAc(items, 3, 10);
    expect(r.ac).toBe(14 + 2 + 2 + 1); // base(14+min(3,2)=16) + shield 2 + ring 1 = 19
    expect(r.ac).toBe(19);
    expect(r.shield).toBe(2);
    expect(r.effectBonus).toBe(1);
  });

  it('applies only ONE body armor even if two are equipped ("one body armour at a time")', () => {
    // deriveAc selects a SINGLE body armor (.find), so two equipped armors do NOT sum their base ACs — a
    // regression to .filter/.reduce would silently double a character's armor. First-equipped wins.
    const r = deriveAc([
      armor({ name: 'Plate', kind: 'armor', equipped: true, armor: { category: 'heavy', baseAC: 18 } }),
      armor({ id: 'b', name: 'Breastplate', kind: 'armor', equipped: true, armor: { category: 'medium', baseAC: 14, dexCap: 2 } }),
    ], 4, 10);
    expect(r.ac).toBe(18);          // the first armor (Plate) only — NOT 18 + 14 stacked
    expect(r.base).toBe(18);
    expect(r.source).toContain('Plate');
    expect(r.source).not.toContain('Breastplate');
  });

  it('applies only ONE shield bonus even if two shields are equipped', () => {
    const r = deriveAc([
      armor({ name: 'Shield A', kind: 'shield', equipped: true, armor: { category: 'shield', baseAC: 2 } }),
      armor({ id: 's2', name: 'Shield B', kind: 'shield', equipped: true, armor: { category: 'shield', baseAC: 2 } }),
    ], 0, 10);
    expect(r.ac).toBe(12);          // manual 10 + one shield 2 — NOT 10 + 4
    expect(r.shield).toBe(2);
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

// Owner request 2026-07-19: pick the base AC *and* the modifier when building armor.
// The category still supplies the defaults; modAbility/modCap override them.
describe('deriveAc — chosen modifier', () => {
  const worn = (a: Partial<ArmorStats>): InvItem[] => [
    { id: 'a', name: 'Homebrew', desc: '', qty: 1, tags: [], kind: 'armor', equipped: true, armor: { category: 'light', ...a } },
  ];
  const mods = { str: 1, dex: 3, con: 2, int: 0, wis: 4, cha: -1 };

  it('scales off a non-dex ability when asked', () => {
    // A wisdom-keyed robe: 11 base + WIS 4 = 15, ignoring the dex 3 passed positionally.
    expect(deriveAc(worn({ baseAC: 11, modAbility: 'wis' }), 3, 10, undefined, true, mods).ac).toBe(15);
  });

  it('honours an explicit cap over the category default', () => {
    // Medium would cap at 2; modCap 1 wins.
    expect(deriveAc(worn({ category: 'medium', baseAC: 14, modCap: 1 }), 3, 10, undefined, true, mods).ac).toBe(15);
  });

  it('lets heavy armor allow a modifier when explicitly set', () => {
    expect(deriveAc(worn({ category: 'heavy', baseAC: 18, modAbility: 'dex', modCap: 1 }), 3, 10, undefined, true, mods).ac).toBe(19);
  });

  it("applies 'none' as a flat base with no modifier", () => {
    expect(deriveAc(worn({ baseAC: 16, modAbility: 'none' }), 5, 10, undefined, true, mods).ac).toBe(16);
  });

  it('keeps the old category defaults when no modifier is chosen', () => {
    expect(deriveAc(worn({ category: 'light', baseAC: 11 }), 3, 10).ac).toBe(14); // full dex
    expect(deriveAc(worn({ category: 'medium', baseAC: 14 }), 3, 10).ac).toBe(16); // dex capped at 2
    expect(deriveAc(worn({ category: 'heavy', baseAC: 18 }), 3, 10).ac).toBe(18); // none
  });

  it('still respects the legacy dexCap field on items saved before modCap existed', () => {
    expect(deriveAc(worn({ category: 'medium', baseAC: 14, dexCap: 3 }), 5, 10).ac).toBe(17);
  });

  it('applies nothing at all when the armor is not equipped', () => {
    const off = worn({ baseAC: 18, modAbility: 'wis' }).map((i) => ({ ...i, equipped: false }));
    expect(deriveAc(off, 3, 12, undefined, true, mods).ac).toBe(12);
  });
});
