// __tests__/dnd/ig-conditions.test.ts — the IG condition auto-fold (Area R2, IG). Folds active IG conditions
// into a roll of a given category: flat penalties (Shaken/Sickened) and disadvantage (Blind/Prone/Deaf/…).
import { describe, it, expect } from 'vitest';
import { igConditionMechanics, igConditionRollEffect } from '@/lib/dnd/conditions/intuitive-games';

describe('IG condition mechanics', () => {
  it('Shaken applies a −2 to any roll', () => {
    expect(igConditionRollEffect(['Shaken'], 'attack')).toEqual({ penalty: -2, disadvantage: false, sources: ['Shaken'] });
    expect(igConditionRollEffect(['Shaken'], 'will_save').penalty).toBe(-2);
  });

  it('Shaken + Sickened stack their flat penalties', () => {
    expect(igConditionRollEffect(['Shaken', 'Sickened'], 'attack').penalty).toBe(-4);
  });

  it('Blind gives disadvantage on attacks and reflex saves, but not fortitude saves', () => {
    expect(igConditionRollEffect(['Blind'], 'attack').disadvantage).toBe(true);
    expect(igConditionRollEffect(['Blind'], 'reflex_save').disadvantage).toBe(true);
    expect(igConditionRollEffect(['Blind'], 'fortitude_save').disadvantage).toBe(false);
  });

  it('Entangled only disadvantages STR/DEX checks', () => {
    expect(igConditionRollEffect(['Entangled'], 'str_dex_check').disadvantage).toBe(true);
    expect(igConditionRollEffect(['Entangled'], 'ability_check').disadvantage).toBe(false);
  });

  it('names every affecting source and is empty when nothing applies', () => {
    const e = igConditionRollEffect(['Blind', 'Shaken'], 'attack');
    expect(e.disadvantage).toBe(true);
    expect(e.penalty).toBe(-2);
    expect(e.sources.sort()).toEqual(['Blind', 'Shaken']);
    expect(igConditionRollEffect(['Grappled'], 'attack')).toEqual({ penalty: 0, disadvantage: false, sources: [] });
  });

  it('an unknown/behaviour-only condition folds nothing but is still described', () => {
    expect(igConditionMechanics('Paralyzed')?.note).toMatch(/cannot act/i);
    expect(igConditionRollEffect(['Paralyzed'], 'attack').sources).toEqual([]);
  });
});
