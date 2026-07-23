// __tests__/dnd/pf2-conditions.test.ts — the PF2 condition penalty model + the non-stacking fold, and the
// set_condition edit op that makes it real on the sheet.
import { describe, it, expect } from 'vitest';
import { pf2ConditionRollEffect, pf2ConditionMechanics } from '@/lib/dnd/conditions/pathfinder2e';
import { applyPf2Edit, parsePf2Edit } from '@/lib/dnd/systems/pathfinder2e/edit';
import type { PF2Character } from '@/lib/dnd/systems/pathfinder2e/model';

describe('PF2 condition penalty model (non-stacking)', () => {
  it('Frightened applies its value as a status penalty to any roll', () => {
    expect(pf2ConditionRollEffect([{ name: 'Frightened', value: 2 }], 'attack')).toEqual({ penalty: -2, sources: ['Frightened 2'] });
    expect(pf2ConditionRollEffect([{ name: 'Frightened', value: 2 }], 'will').penalty).toBe(-2);
  });

  it('two STATUS penalties do NOT stack — only the worst applies', () => {
    const e = pf2ConditionRollEffect([{ name: 'Frightened', value: 2 }, { name: 'Sickened', value: 1 }], 'reflex');
    expect(e.penalty).toBe(-2); // worst of −2 / −1, not −3
    expect(e.sources).toEqual(['Frightened 2']);
  });

  it('a STATUS and a CIRCUMSTANCE penalty DO stack', () => {
    const e = pf2ConditionRollEffect([{ name: 'Frightened', value: 2 }, { name: 'Prone' }], 'attack');
    expect(e.penalty).toBe(-4); // −2 status + −2 circumstance
    expect(e.sources.sort()).toEqual(['Frightened 2', 'Prone']);
  });

  it('Prone only penalizes attacks (a circumstance −2), not saves', () => {
    expect(pf2ConditionRollEffect([{ name: 'Prone' }], 'attack').penalty).toBe(-2);
    expect(pf2ConditionRollEffect([{ name: 'Prone' }], 'will').penalty).toBe(0);
  });

  it('Clumsy hits Reflex but not Fortitude', () => {
    expect(pf2ConditionRollEffect([{ name: 'Clumsy', value: 1 }], 'reflex').penalty).toBe(-1);
    expect(pf2ConditionRollEffect([{ name: 'Clumsy', value: 1 }], 'fortitude').penalty).toBe(0);
  });

  it('describes each condition', () => {
    expect(pf2ConditionMechanics('Frightened')?.note).toMatch(/status penalty/i);
  });
});

function fighter(): PF2Character {
  return {
    identity: { name: 'D', level: 5, ancestry: 'Dwarf', heritage: '', background: 'Warrior', className: 'Fighter', subclass: '', deity: '', size: 'Medium', alignment: '', bio: '', photoUrl: '' } as PF2Character['identity'],
    attributes: { STR: 4, DEX: 1, CON: 3, INT: 0, WIS: 2, CHA: 0 },
    perception: { rank: 'expert' },
    saves: { Fortitude: { rank: 'expert', itemBonus: 0 }, Reflex: { rank: 'trained', itemBonus: 0 }, Will: { rank: 'expert', itemBonus: 0 } },
    skills: [], combat: { ancestryHp: 10, classHpPerLevel: 10, currentHp: 0, tempHp: 0, dyingValue: 0, woundedValue: 0, heroPoints: 1, speed: 20, armorRank: 'trained', dexCap: 0, acItemBonus: 0, attackRank: 'expert', classDcRank: 'expert', classDcAttribute: 'STR', conditions: [] } as PF2Character['combat'],
    attacks: [], spellcasting: { tradition: 'none', kind: 'none', attribute: 'INT', rank: 'untrained', slots: [] }, feats: [], languages: [],
  };
}

describe('set_condition edit op', () => {
  const base = fighter();

  it('parses and upserts a condition, and value 0 clears it', () => {
    const parsed = parsePf2Edit({ op: 'set_condition', name: 'Frightened', value: 2 });
    expect('edit' in parsed).toBe(true);
    const withCond = applyPf2Edit(base, { op: 'set_condition', name: 'Frightened', value: 2 });
    expect(withCond.combat.conditions).toEqual([{ name: 'Frightened', value: 2 }]);
    // re-setting replaces (no duplicate), value 0 removes
    const bumped = applyPf2Edit(withCond, { op: 'set_condition', name: 'Frightened', value: 3 });
    expect(bumped.combat.conditions).toEqual([{ name: 'Frightened', value: 3 }]);
    const cleared = applyPf2Edit(bumped, { op: 'set_condition', name: 'Frightened', value: 0 });
    expect(cleared.combat.conditions).toEqual([]);
  });

  it('rejects a nameless condition', () => {
    expect(parsePf2Edit({ op: 'set_condition', value: 1 })).toHaveProperty('error');
  });
});
