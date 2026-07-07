// __tests__/dnd/character.test.ts — engine capstone + structured edits (Phase C20).
import { describe, it, expect } from 'vitest';
import { deriveCharacter, applyModelEdit, applyModelEdits, type EngineCharacter } from '@/app/dnd/_sheet/engine/character';
import type { EquipItem } from '@/app/dnd/_sheet/engine/equipment';

const greatsword: EquipItem = {
  id: 'gs', name: 'Greatsword', kind: 'weapon', qty: 1, equipped: true,
  weapon: { category: 'martial', damage: '2d6', damageType: 'slashing', properties: ['heavy', 'two-handed'] },
};

const barb: EngineCharacter = {
  abilities: { str: 19, dex: 14, con: 15, int: 11, wis: 13, cha: 13 },
  level: 3,
  saveProficiencies: ['str', 'con'],
  skillProficiencies: { athletics: 'proficient' },
  unarmoredBaseAC: 14, // 10 + DEX 2 + CON 2
  proficientCategories: ['simple', 'martial'],
  items: [greatsword],
};

describe('deriveCharacter: composes the whole engine', () => {
  const d = deriveCharacter(barb);
  it('derives core numbers, AC (Unarmored Defense), and the weapon attack', () => {
    expect(d.mods.str).toBe(4);
    expect(d.saves.str.mod).toBe(6); // +4 + PB 2
    expect(d.ac.ac).toBe(14); // Unarmored Defense
    expect(d.attacks).toHaveLength(1);
    expect(d.attacks[0]).toMatchObject({ name: 'Greatsword', toHit: 6, damageMod: 4, damageDice: '2d6' });
  });
});

describe('C20: a structured edit recomputes every connected number', () => {
  it('set_ability STR 19→20 lifts mod, STR save, and the attack', () => {
    const edited = applyModelEdit(barb, { op: 'set_ability', ability: 'str', value: 20 });
    const d = deriveCharacter(edited);
    expect(d.mods.str).toBe(5);
    expect(d.saves.str.mod).toBe(7); // +5 + PB 2
    expect(d.skills.athletics.mod).toBe(7); // +5 + PB 2
    expect(d.attacks[0].toHit).toBe(7); // +5 + PB 2
    expect(d.attacks[0].damageMod).toBe(5);
    // original model untouched (pure)
    expect(deriveCharacter(barb).mods.str).toBe(4);
  });

  it('adding + attuning a Cloak of Protection lifts AC and all saves at once', () => {
    const cloak: EquipItem = {
      id: 'cloak', name: 'Cloak of Protection', kind: 'magic_item', qty: 1, requiresAttunement: true,
      effects: [
        { target: 'ac', operation: 'add', value: 1, condition: 'attuned' },
        { target: 'saves', operation: 'add', value: 1, condition: 'attuned' },
      ],
    };
    const edited = applyModelEdits(barb, [
      { op: 'add_item', item: cloak },
      { op: 'attune', id: 'cloak', attuned: true },
    ]);
    const d = deriveCharacter(edited);
    expect(d.ac.ac).toBe(15); // 14 + 1
    expect(d.saves.dex.mod).toBe(3); // +2 + 1
    expect(d.saves.str.mod).toBe(7); // +6 + 1
  });

  it('a conditional feature (Rage: +2 melee damage) only applies while raging', () => {
    // model the surge/rage damage as a general damage effect gated on 'raging'
    const raged = applyModelEdits(barb, [
      { op: 'add_feature', effect: { target: 'damage', operation: 'add', value: 2, condition: 'raging' } },
      { op: 'set_condition', condition: 'raging', active: true },
    ]);
    expect(deriveCharacter(raged).attacks[0].damageMod).toBe(6); // +4 STR + 2 rage

    const calm = applyModelEdit(raged, { op: 'set_condition', condition: 'raging', active: false });
    expect(deriveCharacter(calm).attacks[0].damageMod).toBe(4); // rage off
  });

  it('attunement cap is enforced through the edit surface', () => {
    const withThree = applyModelEdits(barb, [1, 2, 3].map((n) => ({
      op: 'add_item' as const,
      item: { id: `m${n}`, name: `Item ${n}`, kind: 'magic_item' as const, qty: 1, requiresAttunement: true, attuned: true },
    })));
    const tryFourth = applyModelEdits(withThree, [
      { op: 'add_item', item: { id: 'm4', name: 'Item 4', kind: 'magic_item', qty: 1, requiresAttunement: true } },
      { op: 'attune', id: 'm4', attuned: true },
    ]);
    expect(tryFourth.items.find((i) => i.id === 'm4')?.attuned).toBeFalsy();
  });
});
