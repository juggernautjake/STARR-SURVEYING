// __tests__/dnd/effects.test.ts — the effects system (Phase C13).
import { describe, it, expect } from 'vitest';
import {
  activeEffects,
  resolveNumeric,
  rollFlagsFor,
  resistances,
  grantedProficiencies,
  type Effect,
} from '@/app/dnd/_sheet/engine/effects';

describe('effects: conditional filtering', () => {
  const effects: Effect[] = [
    { target: 'attack', operation: 'add', value: 2, condition: 'equipped' },
    { target: 'spell_save_dc', operation: 'add', value: 1 }, // unconditional
    { target: 'speed', operation: 'add', value: 10, condition: 'raging' },
  ];
  it('keeps unconditional + met-condition effects only', () => {
    const active = activeEffects(effects, { active: ['equipped'] });
    expect(active.map((e) => e.target).sort()).toEqual(['attack', 'spell_save_dc']);
  });
  it('an effect changes its target only when its condition is active', () => {
    expect(resolveNumeric(activeEffects(effects, { active: [] }), 'attack', 5)).toBe(5); // unequipped
    expect(resolveNumeric(activeEffects(effects, { active: ['equipped'] }), 'attack', 5)).toBe(7); // +2
    expect(resolveNumeric(activeEffects(effects, { active: ['raging'] }), 'speed', 30)).toBe(40); // +10
  });
});

describe('effects: numeric resolution (stack + override)', () => {
  it('stacks all add bonuses', () => {
    const effects: Effect[] = [
      { target: 'attack', operation: 'add', value: 1 },
      { target: 'attack', operation: 'add', value: 2 },
    ];
    expect(resolveNumeric(effects, 'attack', 0)).toBe(3);
  });
  it('set_base takes the best base, then adds stack on top', () => {
    const effects: Effect[] = [
      { target: 'ac', operation: 'set_base', value: 16 },
      { target: 'ac', operation: 'add', value: 1 },
    ];
    expect(resolveNumeric(effects, 'ac', 12)).toBe(17); // max(12,16) + 1
    // a lower set_base never worsens the base
    expect(resolveNumeric([{ target: 'ac', operation: 'set_base', value: 10 }], 'ac', 15)).toBe(15);
  });
  it('ignores effects for other targets', () => {
    const effects: Effect[] = [{ target: 'damage', operation: 'add', value: 5 }];
    expect(resolveNumeric(effects, 'attack', 0)).toBe(0);
  });
});

describe('effects: advantage / resistance / proficiency collectors', () => {
  const effects: Effect[] = [
    { target: 'dex_saves', operation: 'advantage' },
    { target: 'resistance', operation: 'resistance', value: 'fire' },
    { target: 'resistance', operation: 'resistance', value: 'cold' },
    { target: 'resistance', operation: 'resistance', value: 'fire' }, // dup
    { target: 'proficiency', operation: 'grant_proficiency', value: 'longswords' },
  ];
  it('reports advantage for the right target', () => {
    expect(rollFlagsFor(effects, 'dex_saves')).toEqual({ advantage: true, disadvantage: false });
    expect(rollFlagsFor(effects, 'str_saves')).toEqual({ advantage: false, disadvantage: false });
  });
  it('advantage + disadvantage on the same target both report (caller cancels)', () => {
    const both: Effect[] = [
      { target: 'attack', operation: 'advantage' },
      { target: 'attack', operation: 'disadvantage' },
    ];
    expect(rollFlagsFor(both, 'attack')).toEqual({ advantage: true, disadvantage: true });
  });
  it('collects distinct resistances and granted proficiencies', () => {
    expect(resistances(effects).sort()).toEqual(['cold', 'fire']);
    expect(grantedProficiencies(effects)).toEqual(['longswords']);
  });
});
