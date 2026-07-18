// __tests__/dnd/ig-rules.test.ts — the Intuitive Games rules math (full-sheet Slice 2). Worked examples
// grounded in the template's defaults + the system's rules: proficiency = level, three saves = rank + level
// + attribute, skill totals, attack/damage, degrees of success.
import { describe, it, expect } from 'vitest';
import { blankIGCharacter } from '@/lib/dnd/systems/intuitive-games/model';
import {
  igAbilityMod, igProficiency, igSaveTotal, igSaves, igSkillTotal, igAttackBonus, igDamageBonus,
  igResolveAttack, igDegreeOfSuccess, igMaxHp, igDerived,
} from '@/lib/dnd/systems/intuitive-games/rules';

describe('IG rules math (full-sheet Slice 2)', () => {
  it('ability modifier and proficiency-is-level', () => {
    expect(igAbilityMod(10)).toBe(0);
    expect(igAbilityMod(18)).toBe(4);
    expect(igAbilityMod(7)).toBe(-2);
    expect(igProficiency(1)).toBe(1);
    expect(igProficiency(7)).toBe(7);
  });

  it('the three saves default to 1 at level 1 (rank 0 + level 1 + mod 0), matching the template', () => {
    const c = blankIGCharacter('Test');
    const s = igSaves(c);
    expect(s).toEqual({ Fortitude: 1, Reflex: 1, Will: 1 });
    // raise level + a governing attribute and the save follows: rank 2 + level 5 + Con mod (+3)
    c.identity.level = 5; c.abilities.CON = 16; c.combat.saves.Fortitude.rank = 2;
    expect(igSaveTotal(c.combat.saves.Fortitude, c.identity.level, igAbilityMod(c.abilities.CON))).toBe(2 + 5 + 3);
    expect(igSaves(c).Fortitude).toBe(10);
  });

  it('skill total = ranks + (trained ? proficiency : 0) + misc + attribute', () => {
    // level 3, DEX 14 (+2), 2 ranks, trained (prof = level 3), +1 misc
    expect(igSkillTotal({ name: 'Stealth', ability: 'DEX', ranks: 2, proficient: true, misc: 1 }, 3, 2)).toBe(2 + 3 + 1 + 2);
    // untrained adds no proficiency
    expect(igSkillTotal({ name: 'Stealth', ability: 'DEX', ranks: 0, proficient: false, misc: 0 }, 3, 2)).toBe(2);
  });

  it('attack + damage: proficiency, Weapon Focus, Weapon Specialization, STR-melee', () => {
    const c = blankIGCharacter('Fighter'); c.identity.level = 4; c.abilities.STR = 18; // +4
    const atk = { id: 'a', name: 'Greatsword', weaponType: 'Two-Handed Slashing', properties: '', proficient: true, weaponFocus: true, weaponSpecialization: true, ability: 'STR' as const, bonusToHit: 0, bonusDamage: 0, damage: '2d6' };
    // to-hit = STR(+4) + proficiency(level 4) + Weapon Focus(+1) = 9
    expect(igAttackBonus(atk, c.identity.level, igAbilityMod(c.abilities.STR))).toBe(9);
    // damage bonus = STR melee(+4) + Weapon Specialization(+2) = +6
    expect(igDamageBonus(atk, igAbilityMod(c.abilities.STR))).toBe(6);
    c.combat.attacks = [atk];
    expect(igResolveAttack(c, atk).damage).toBe('2d6+6');
  });

  it('degrees of success (±10, nat 20 up / nat 1 down)', () => {
    expect(igDegreeOfSuccess(25, 15)).toBe('critical-success'); // beat by 10
    expect(igDegreeOfSuccess(16, 15)).toBe('success');
    expect(igDegreeOfSuccess(14, 15)).toBe('failure');
    expect(igDegreeOfSuccess(5, 15)).toBe('critical-failure'); // miss by 10
    expect(igDegreeOfSuccess(16, 15, 1)).toBe('failure');        // nat 1 knocks success → failure
    expect(igDegreeOfSuccess(14, 15, 20)).toBe('success');       // nat 20 lifts failure → success
  });

  it('a natural 20/1 shifts exactly ONE degree and CLAMPS at the ends (no out-of-bounds degree)', () => {
    // The step-shift ladder + its bounds — the crit-boundary clamps that a missing min(3,…)/max(0,…) would
    // break, indexing the degree array out of range to `undefined`. nat 20 lifts each rung but never past
    // critical-success; nat 1 drops each but never below critical-failure.
    expect(igDegreeOfSuccess(16, 15, 20)).toBe('critical-success'); // success → crit-success
    expect(igDegreeOfSuccess(25, 15, 20)).toBe('critical-success'); // already crit — clamps, not beyond
    expect(igDegreeOfSuccess(14, 15, 1)).toBe('critical-failure');  // failure → crit-failure
    expect(igDegreeOfSuccess(5, 15, 1)).toBe('critical-failure');   // already crit-fail — clamps at 0
    expect(igDegreeOfSuccess(15, 15, 20)).toBe('critical-success'); // exactly meets DC (success) → crit on nat 20
  });

  it('max HP = Class+Background HP + CON mod × level; derived summary is coherent', () => {
    const c = blankIGCharacter('Tank'); c.identity.level = 3; c.abilities.CON = 16; // +3
    c.combat.hitPoints.classBackgroundHp = 20;
    expect(igMaxHp(c)).toBe(20 + 3 * 3);
    const d = igDerived(c);
    expect(d.proficiency).toBe(3);
    expect(d.abilityMods.CON).toBe(3);
    expect(d.maxHp).toBe(29);
  });
});
