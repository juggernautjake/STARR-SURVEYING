// __tests__/dnd/derive.test.ts — the base→derived pipeline (Phase C12).
import { describe, it, expect } from 'vitest';
import { derive, type DeriveBase } from '@/app/dnd/_sheet/engine/derive';

// Lazzuh Gun's base scores (STR 19, DEX 14, CON 15, INT 11, WIS 13, CHA 13), a
// level-3 Barbarian (STR/CON save proficiency, Athletics proficient).
const lazzuhBase: DeriveBase = {
  abilities: { str: 19, dex: 14, con: 15, int: 11, wis: 13, cha: 13 },
  level: 3,
  saveProficiencies: ['str', 'con'],
  skillProficiencies: { athletics: 'proficient', intimidation: 'proficient' },
};

describe('derive: ability modifiers', () => {
  it('computes mods with floor((score-10)/2)', () => {
    const d = derive(lazzuhBase);
    expect(d.mods).toEqual({ str: 4, dex: 2, con: 2, int: 0, wis: 1, cha: 1 });
  });
});

describe('derive: proficiency bonus', () => {
  it('follows the level table', () => {
    expect(derive({ ...lazzuhBase, level: 1 }).proficiencyBonus).toBe(2);
    expect(derive({ ...lazzuhBase, level: 4 }).proficiencyBonus).toBe(2);
    expect(derive({ ...lazzuhBase, level: 5 }).proficiencyBonus).toBe(3);
    expect(derive({ ...lazzuhBase, level: 17 }).proficiencyBonus).toBe(6);
  });
});

describe('derive: saves', () => {
  it('adds PB only to proficient saves', () => {
    const d = derive(lazzuhBase); // pb 2
    expect(d.saves.str).toEqual({ mod: 6, proficient: true }); // +4 +2
    expect(d.saves.con).toEqual({ mod: 4, proficient: true }); // +2 +2
    expect(d.saves.dex).toEqual({ mod: 2, proficient: false }); // +2, no pb
  });
});

describe('derive: skills + passives', () => {
  it('applies proficiency and expertise', () => {
    const d = derive(lazzuhBase); // pb 2
    expect(d.skills.athletics.mod).toBe(6); // STR +4 + pb 2
    expect(d.skills.stealth.mod).toBe(2); // DEX +2, no prof
    const exp = derive({ ...lazzuhBase, skillProficiencies: { athletics: 'expertise' } });
    expect(exp.skills.athletics.mod).toBe(8); // +4 + 2*pb
  });
  it('passive perception = 10 + perception mod', () => {
    expect(derive(lazzuhBase).passives.perception).toBe(11); // WIS +1, not proficient
    expect(derive({ ...lazzuhBase, skillProficiencies: { perception: 'proficient' } }).passives.perception).toBe(13);
  });
});

describe('derive: initiative + spellcasting', () => {
  it('initiative is the DEX mod', () => {
    expect(derive(lazzuhBase).initiative).toBe(2);
  });
  it('no spell block for a non-caster; correct DC/attack for a caster', () => {
    expect(derive(lazzuhBase).spell).toBeNull();
    const caster = derive({ ...lazzuhBase, spellcastingAbility: 'wis' }); // pb 2, WIS +1
    expect(caster.spell).toEqual({ ability: 'wis', saveDC: 11, attack: 3 }); // 8+2+1, 2+1
  });
});

describe('derive: recompute-on-change (the whole point)', () => {
  it('changing a base score/level recomputes everything downstream', () => {
    const before = derive(lazzuhBase);
    // bump STR 19 -> 20 and level 3 -> 5
    const after = derive({ ...lazzuhBase, abilities: { ...lazzuhBase.abilities, str: 20 }, level: 5 });
    expect(after.mods.str).toBe(5); // 19->20 : +4 -> +5
    expect(after.proficiencyBonus).toBe(3); // level 5
    expect(after.saves.str.mod).toBe(8); // +5 + pb 3
    expect(after.skills.athletics.mod).toBe(8); // +5 + pb 3
    // the original object is untouched (pure)
    expect(before.mods.str).toBe(4);
    expect(before.proficiencyBonus).toBe(2);
  });
});
