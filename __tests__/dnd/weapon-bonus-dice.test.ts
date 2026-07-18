// __tests__/dnd/weapon-bonus-dice.test.ts — Slice 11 follow-on: effects can add bonus damage DICE to
// weapon attacks (Enlarge's +1d4, a flametongue's +1d6 fire), not just a flat number. A real rules
// mechanic `damage_roll` (a flat modifier) could not express. Covers the parser, the vocabulary
// target, the describe fix, and the store wiring.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseBonusDamageSegment, rollTyped } from '@/app/dnd/_sheet/lib/dice';
import { findTarget, validateEffect, describeEffect } from '@/lib/dnd/effects/targets';

describe('parseBonusDamageSegment', () => {
  it('splits an optional trailing damage type', () => {
    expect(parseBonusDamageSegment('1d6 fire')).toEqual({ dice: '1d6', type: 'fire' });
    expect(parseBonusDamageSegment('2d4 + 1 cold')).toEqual({ dice: '2d4 + 1', type: 'cold' });
  });
  it('leaves a bare dice expression untyped', () => {
    expect(parseBonusDamageSegment('1d4')).toEqual({ dice: '1d4', type: 'untyped' });
    expect(parseBonusDamageSegment('2d6')).toEqual({ dice: '2d6', type: 'untyped' });
  });
  it('does not mistake the die marker or a flat number for a type', () => {
    expect(parseBonusDamageSegment('1d8')).toEqual({ dice: '1d8', type: 'untyped' });
    expect(parseBonusDamageSegment('3')).toBeNull();       // no dice → skip, don't roll zero
  });
  it('returns null for blank / non-dice, so a malformed effect is skipped not zeroed', () => {
    expect(parseBonusDamageSegment('')).toBeNull();
    expect(parseBonusDamageSegment('   ')).toBeNull();
    expect(parseBonusDamageSegment('fire')).toBeNull();
  });
  it('the parsed segment rolls as its own typed part', () => {
    const seg = parseBonusDamageSegment('2d6 fire')!;
    const roll = rollTyped([{ dice: '1d8', type: 'slashing' }, seg]);
    expect(roll.parts.map((p) => p.type).sort()).toEqual(['fire', 'slashing']);
    expect(roll.total).toBeGreaterThanOrEqual(1 + 2); // min 1 slashing + 2 fire
  });
});

describe('weapon_bonus_dice is a first-class effect target', () => {
  it('exists as a dice-valued, add-only roll target with a home on the sheet', () => {
    const t = findTarget('weapon_bonus_dice');
    expect(t).toBeTruthy();
    expect(t!.valueType).toBe('dice');
    expect(t!.ops).toEqual(['add']);
    expect(t!.rendersAt).toMatch(/weapon damage/i);
  });
  it('validates a dice value and rejects an empty one', () => {
    expect(validateEffect({ target: 'weapon_bonus_dice', operation: 'add', value: '1d6 fire' })).toBeNull();
    expect(validateEffect({ target: 'weapon_bonus_dice', operation: 'add', value: '' })).not.toBeNull();
  });
  it('describes the dice, not a "+0" (the pre-existing dice-add prose bug)', () => {
    expect(describeEffect({ target: 'weapon_bonus_dice', operation: 'add', value: '1d6' })).toBe('+1d6 Weapon bonus damage dice');
    // same fix covers the other dice-add targets
    expect(describeEffect({ target: 'heal', operation: 'add', value: '2d4' })).toBe('+2d4 Heal');
  });
});

describe('the store rolls ledger bonus dice into weapon damage', () => {
  const STORE = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/state/store.tsx'), 'utf8');
  it('collects weapon_bonus_dice contributions and appends them to the segments', () => {
    expect(STORE).toContain("explain('weapon_bonus_dice')");
    expect(STORE).toContain('parseBonusDamageSegment');
    expect(STORE).toContain('...bonusDice');
  });
});
