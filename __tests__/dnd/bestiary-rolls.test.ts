// __tests__/dnd/bestiary-rolls.test.ts — rolling a creature's actions (P13-8).
//
// "The dice roller needs to work with creatures and stuff too." These are the parses that make a stat
// block rollable, and they exist as two short fields rather than prose because P13-1 kept `toHit` and
// `damage` out of `body` for exactly this.
import { describe, it, expect } from 'vitest';
import { parseDice, parseModifier, rollDice, rollAttack, formatSpec, explainRoll } from '@/lib/dnd/bestiary/rolls';

describe('parseDice', () => {
  it('reads the shapes real stat blocks use', () => {
    expect(parseDice('2d10 + 8')).toEqual({ count: 2, sides: 10, modifier: 8 });
    expect(parseDice('2d10+8')).toEqual({ count: 2, sides: 10, modifier: 8 });
    expect(parseDice('1d6')).toEqual({ count: 1, sides: 6, modifier: 0 });
    expect(parseDice('d20')).toEqual({ count: 1, sides: 20, modifier: 0 });
    expect(parseDice('7 (2d6)')).toEqual({ count: 2, sides: 6, modifier: 0 });
    expect(parseDice('1d8 - 1')).toEqual({ count: 1, sides: 8, modifier: -1 });
  });

  it('returns null when there are no dice, which is normal and not an error', () => {
    // "half the target's current hit points" is a real damage line. Inventing dice for it would be worse
    // than leaving the DM to read the sentence.
    expect(parseDice("half the target's current hit points")).toBeNull();
    expect(parseDice('')).toBeNull();
    expect(parseDice(undefined)).toBeNull();
  });

  it('refuses absurd counts rather than rolling them', () => {
    expect(parseDice('999d6')).toBeNull();
    expect(parseDice('2d1')).toBeNull();
  });
});

describe('parseModifier', () => {
  it('reads a signed or bare modifier', () => {
    expect(parseModifier('+14')).toBe(14);
    expect(parseModifier('-1')).toBe(-1);
    expect(parseModifier('14')).toBe(14);
  });

  it('returns null for anything malformed, so no button is offered', () => {
    // A button that rolls a lie is worse than no button.
    expect(parseModifier('+')).toBeNull();
    expect(parseModifier('see below')).toBeNull();
    expect(parseModifier(undefined)).toBeNull();
  });
});

describe('rolling', () => {
  // Pinned RNG: the only way to assert a modifier is actually ADDED rather than merely looking plausible.
  const max = () => 0.999999;
  const min = () => 0;

  it('adds the modifier', () => {
    expect(rollDice({ count: 2, sides: 10, modifier: 8 }, max).total).toBe(28); // 10 + 10 + 8
    expect(rollDice({ count: 2, sides: 10, modifier: 8 }, min).total).toBe(10); // 1 + 1 + 8
  });

  it('rolls each die and keeps the faces', () => {
    const r = rollDice({ count: 3, sides: 6, modifier: 0 }, max);
    expect(r.dice).toEqual([6, 6, 6]);
  });

  it('an attack is always ONE d20 at the modifier', () => {
    // Encoding it here stops "+14" ever being rolled as anything but d20+14.
    const r = rollAttack(14, max);
    expect(r.spec).toEqual({ count: 1, sides: 20, modifier: 14 });
    expect(r.total).toBe(34);
    expect(rollAttack(14, min).total).toBe(15);
  });

  it('never rolls a 0 or exceeds the die', () => {
    for (const rng of [min, max, () => 0.5]) {
      for (const d of rollDice({ count: 5, sides: 8, modifier: 0 }, rng).dice) {
        expect(d).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe('display', () => {
  it('normalises the spec', () => {
    expect(formatSpec({ count: 2, sides: 10, modifier: 8 })).toBe('2d10 + 8');
    expect(formatSpec({ count: 1, sides: 6, modifier: 0 })).toBe('1d6');
    expect(formatSpec({ count: 1, sides: 8, modifier: -1 })).toBe('1d8 − 1');
  });

  it('shows the parts, not just the total', () => {
    // A number nobody can check is a number nobody trusts at a table.
    expect(explainRoll(rollDice({ count: 2, sides: 10, modifier: 8 }, () => 0.999999))).toBe('28 = 10 + 10 + 8');
    expect(explainRoll(rollDice({ count: 1, sides: 20, modifier: 0 }, () => 0.999999))).toBe('20');
  });
});
