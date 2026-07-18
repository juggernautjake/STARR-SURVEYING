// __tests__/dnd/exhaustion-2014-tiers.test.ts — Area M1c. The 2014 tiered table's SPEED + HP-max effects,
// as resolved through the ledger (a derived-number path, unlike the roll-time d20 penalty in
// exhaustion-d20.test.ts). Pins: 2024 keeps −5 ft/level and untouched HP; 2014 vanilla halves/zeroes Speed by
// tier and halves max HP at tier 4+; and switching the model back to flat restores the −5/level shape.
import { describe, it, expect } from 'vitest';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

function speed(level: number, system?: string, exhaustionModel?: 'vanilla' | 'flat-2-per-level') {
  const c = blankCharacter('E');
  c.combat.exhaustion = level;
  c.combat.speed = 30;
  return buildLedger(c, { system, exhaustionModel }).value('speed_walk', c.combat.speed);
}
function maxHp(level: number, system?: string, exhaustionModel?: 'vanilla' | 'flat-2-per-level') {
  const c = blankCharacter('E');
  c.combat.exhaustion = level;
  c.combat.maxHp = 40;
  return buildLedger(c, { system, exhaustionModel }).value('hp_max', c.combat.maxHp);
}

describe('exhaustion Speed by edition/model (M1c)', () => {
  it('2024 (default): −5 ft per level', () => {
    expect(speed(0)).toBe(30);
    expect(speed(3, 'dnd5e-2024')).toBe(15); // 30 − 15
  });

  it('2014 vanilla: full speed at tier 1, halved at tiers 2–4, zero at tier 5+', () => {
    expect(speed(1, 'dnd5e-2014')).toBe(30); // tier 1 = only disadvantage on checks, speed unchanged
    expect(speed(2, 'dnd5e-2014')).toBe(15); // halved
    expect(speed(4, 'dnd5e-2014')).toBe(15); // still halved
    expect(speed(5, 'dnd5e-2014')).toBe(0); // reduced to 0
  });

  it('2014 with the flat option selected: back to −5 ft/level (the option overrides the edition default)', () => {
    expect(speed(3, 'dnd5e-2014', 'flat-2-per-level')).toBe(15); // 30 − 15, not the halving factor
  });
});

describe('exhaustion max HP by edition/model (M1c)', () => {
  it('2024 never touches max HP', () => {
    expect(maxHp(6, 'dnd5e-2024')).toBe(40);
  });

  it('2014 vanilla halves max HP at tier 4+ only', () => {
    expect(maxHp(3, 'dnd5e-2014')).toBe(40); // below tier 4
    expect(maxHp(4, 'dnd5e-2014')).toBe(20); // halved
    expect(maxHp(5, 'dnd5e-2014')).toBe(20);
  });

  it('2014 with the flat option leaves max HP alone', () => {
    expect(maxHp(4, 'dnd5e-2014', 'flat-2-per-level')).toBe(40);
  });
});
