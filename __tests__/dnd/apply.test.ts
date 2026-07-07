// __tests__/dnd/apply.test.ts — magic items change the math (Phase C17).
import { describe, it, expect } from 'vitest';
import { derive, type DeriveBase } from '@/app/dnd/_sheet/engine/derive';
import { applyEffectsToDerived } from '@/app/dnd/_sheet/engine/apply';
import { collectItemEffects, attune, type EquipItem } from '@/app/dnd/_sheet/engine/equipment';
import { computeAC } from '@/app/dnd/_sheet/engine/armor';

const base: DeriveBase = {
  abilities: { str: 19, dex: 14, con: 15, int: 11, wis: 13, cha: 13 },
  level: 3,
  saveProficiencies: ['str', 'con'],
  skillProficiencies: { athletics: 'proficient' },
  spellcastingAbility: 'wis',
};

const cloak: EquipItem = {
  id: 'cloak',
  name: 'Cloak of Protection',
  kind: 'magic_item',
  qty: 1,
  requiresAttunement: true,
  effects: [
    { target: 'ac', operation: 'add', value: 1, condition: 'attuned' },
    { target: 'saves', operation: 'add', value: 1, condition: 'attuned' },
  ],
};

describe('C17: magic item is inert until attuned', () => {
  it('unattuned cloak changes nothing', () => {
    const d = applyEffectsToDerived(derive(base), collectItemEffects([cloak]));
    expect(d.saves.dex.mod).toBe(2); // unchanged
    expect(computeAC({ items: [cloak], dexMod: 2 }).ac).toBe(12); // 10 + DEX
  });
});

describe('C17: attuned +1 item moves every connected number', () => {
  const effects = collectItemEffects(attune([cloak], 'cloak'));
  const d = applyEffectsToDerived(derive(base), effects);
  it('lifts all saving throws by +1', () => {
    expect(d.saves.dex.mod).toBe(3); // +2 -> +3
    expect(d.saves.str.mod).toBe(7); // +6 (prof) -> +7
    expect(d.saves.con.mod).toBe(5); // +4 -> +5
  });
  it('lifts AC by +1 (via the armor path)', () => {
    expect(computeAC({ items: attune([cloak], 'cloak'), dexMod: 2, effects }).ac).toBe(13);
  });
});

describe('C17: targeted save + resistance + spell DC items', () => {
  it('a Ring of Evasion grants advantage-agnostic +2 DEX saves only', () => {
    const ring: EquipItem = {
      id: 'r', name: 'Ring of DEX', kind: 'magic_item', qty: 1, requiresAttunement: true,
      effects: [{ target: 'dex_saves', operation: 'add', value: 2, condition: 'attuned' }],
    };
    const d = applyEffectsToDerived(derive(base), collectItemEffects(attune([ring], 'r')));
    expect(d.saves.dex.mod).toBe(4); // +2 -> +4
    expect(d.saves.str.mod).toBe(6); // untouched
  });
  it('a fire-resistance amulet + a +1 DC rod change resistances and spell DC', () => {
    const items: EquipItem[] = [
      { id: 'a', name: 'Amulet', kind: 'magic_item', qty: 1, requiresAttunement: true, effects: [{ target: 'resistance', operation: 'resistance', value: 'fire', condition: 'attuned' }] },
      { id: 'rod', name: 'Rod of the Pact Keeper', kind: 'magic_item', qty: 1, requiresAttunement: true, effects: [{ target: 'spell_save_dc', operation: 'add', value: 1, condition: 'attuned' }] },
    ];
    const attuned = items.reduce((acc, it) => attune(acc, it.id), items);
    const d = applyEffectsToDerived(derive(base), collectItemEffects(attuned));
    expect(d.resistances).toEqual(['fire']);
    // base spell DC = 8 + PB 2 + WIS 1 = 11; +1 -> 12
    expect(d.spell?.saveDC).toBe(12);
  });
});
