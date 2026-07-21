// __tests__/dnd/pf2-strike.test.ts — PF2 Strike resolution (S13b).
//
// Weapon traits were stored as strings and nothing consumed them, so a Rapier and a Shortsword
// critted identically despite `deadly` being the whole point of the Rapier. These tests pin the
// numbers, not the rendering.
//
// The headline risk this file guards: PF2 crits double the ENTIRE total (dice AND modifiers) and
// THEN add deadly/fatal dice. A 5e-style "roll the dice twice" implementation produces
// plausible-but-wrong numbers on every single critical hit.
import { describe, it, expect } from 'vitest';
import { pf2ResolveStrike, pf2Map, traitDie, STRIKING_DICE } from '@/lib/dnd/systems/pathfinder2e/strike';

const longsword = { name: 'Longsword', damageDie: '1d8', damageType: 'slashing', traits: ['versatile P'] };
const rapier = { name: 'Rapier', damageDie: '1d6', damageType: 'piercing', traits: ['deadly d8', 'disarm', 'finesse'] };
const shortsword = { name: 'Shortsword', damageDie: '1d6', damageType: 'piercing', traits: ['agile', 'finesse', 'versatile S'] };
const pick = { name: 'Pick', damageDie: '1d6', damageType: 'piercing', traits: ['fatal d10'] };
const longbow = { name: 'Longbow', damageDie: '1d8', damageType: 'piercing', traits: ['deadly d10', 'volley 30 ft'] };
const sling = { name: 'Sling', damageDie: '1d6', damageType: 'bludgeoning', traits: ['propulsive'] };

const base = { level: 5, attributes: { STR: 4, DEX: 2 }, proficiency: 9 };

describe('the multiple attack penalty', () => {
  it('is zero on the first Strike', () => {
    expect(pf2Map(0, [])).toBe(0);
  });

  it('is −5/−10 for a normal weapon', () => {
    expect(pf2Map(1, [])).toBe(-5);
    expect(pf2Map(2, [])).toBe(-10);
  });

  it('is −4/−8 for an agile one', () => {
    expect(pf2Map(1, ['agile'])).toBe(-4);
    expect(pf2Map(2, ['agile'])).toBe(-8);
  });

  it('stops growing after the third Strike', () => {
    // A fourth Strike is still −10, not −15.
    expect(pf2Map(3, [])).toBe(-10);
    expect(pf2Map(9, [])).toBe(-10);
  });
});

describe('attack totals', () => {
  it('adds attribute + proficiency + item bonus', () => {
    const r = pf2ResolveStrike(longsword, { ...base, itemBonus: 1 });
    expect(r.attack).toBe(4 + 9 + 1); // STR 4 + prof 9 + potency 1
  });

  it('applies the MAP to later Strikes', () => {
    expect(pf2ResolveStrike(longsword, { ...base, strikeIndex: 1 }).attack).toBe(4 + 9 - 5);
    expect(pf2ResolveStrike(shortsword, { ...base, strikeIndex: 1 }).attack).toBe(4 + 9 - 4);
  });

  it('finesse uses Dexterity only when it is actually better', () => {
    // STR 4 vs DEX 2 — finesse must NOT make the character worse.
    expect(pf2ResolveStrike(rapier, base).attack).toBe(4 + 9);
    const dexy = { ...base, attributes: { STR: 1, DEX: 5 } };
    expect(pf2ResolveStrike(rapier, dexy).attack).toBe(5 + 9);
  });

  it('folds in condition modifiers', () => {
    // Frightened 2 arrives as a resolved flat −2 from the conditions layer.
    expect(pf2ResolveStrike(longsword, { ...base, extraAttack: -2 }).attack).toBe(4 + 9 - 2);
  });
});

describe('damage on a normal hit', () => {
  it('melee adds Strength', () => {
    expect(pf2ResolveStrike(longsword, base).damage).toBe('1d8+4 slashing');
  });

  it('ranged adds nothing', () => {
    // A bow does not add Strength in PF2 — a rule 5e players get wrong constantly.
    expect(pf2ResolveStrike(longbow, { ...base, ranged: true }).damage).toBe('1d8 piercing');
    expect(pf2ResolveStrike(longbow, { ...base, ranged: true }).damageAttribute).toBeNull();
  });

  it('propulsive adds HALF Strength, rounded down', () => {
    expect(pf2ResolveStrike(sling, { ...base, ranged: true }).damage).toBe('1d6+2 bludgeoning'); // STR 4 → +2
  });

  it('propulsive adds nothing when Strength is negative', () => {
    // Half of a penalty is not applied — it simply does not apply.
    const weak = { ...base, ranged: true, attributes: { STR: -1, DEX: 3 } };
    expect(pf2ResolveStrike(sling, weak).damage).toBe('1d6 bludgeoning');
  });

  it('thrown melee weapons keep Strength at range', () => {
    const dagger = { name: 'Dagger', damageDie: '1d4', damageType: 'piercing', traits: ['agile', 'finesse', 'thrown 10 ft'] };
    expect(pf2ResolveStrike(dagger, { ...base, ranged: true }).damage).toBe('1d4+4 piercing');
  });
});

describe('striking runes multiply weapon dice only', () => {
  it('striking gives two dice, greater three, major four', () => {
    expect(STRIKING_DICE).toEqual({ none: 1, striking: 2, greater: 3, major: 4 });
    expect(pf2ResolveStrike(longsword, { ...base, striking: 'striking' }).damage).toBe('2d8+4 slashing');
    expect(pf2ResolveStrike(longsword, { ...base, striking: 'greater' }).damage).toBe('3d8+4 slashing');
  });

  it('never multiplies the attribute modifier', () => {
    // +4 stays +4 across every rune step; only the dice count moves.
    for (const s of ['none', 'striking', 'greater', 'major'] as const) {
      expect(pf2ResolveStrike(longsword, { ...base, striking: s }).damage).toContain('+4');
    }
  });
});

describe('two-hand substitutes the die before striking multiplies it', () => {
  const bastard = { name: 'Bastard Sword', damageDie: '1d8', damageType: 'slashing', traits: ['two-hand d12'] };

  it('one-handed keeps the base die', () => {
    expect(pf2ResolveStrike(bastard, base).damage).toBe('1d8+4 slashing');
  });

  it('two-handed uses the larger die', () => {
    expect(pf2ResolveStrike(bastard, { ...base, twoHanded: true }).damage).toBe('1d12+4 slashing');
  });

  it('and striking then multiplies the SUBSTITUTED die', () => {
    // 2d12, not 2d8 — order of operations matters and is easy to get backwards.
    expect(pf2ResolveStrike(bastard, { ...base, twoHanded: true, striking: 'striking' }).damage).toBe('2d12+4 slashing');
  });
});

describe('critical hits double everything, THEN add trait dice', () => {
  it('doubles dice AND modifiers', () => {
    // The 5e instinct is 2d8+4. PF2 is 2d8+8 — the modifier doubles too.
    expect(pf2ResolveStrike(longsword, base).critDamage).toBe('2d8+8 slashing');
  });

  it('deadly adds its die on top, undoubled', () => {
    // 1d6+4 → doubled to 2d6+8, then +1d8 deadly. The deadly die is NOT doubled.
    expect(pf2ResolveStrike(rapier, base).critDamage).toBe('2d6+8 + 1d8 piercing');
  });

  it('deadly scales its dice COUNT with the striking rune line', () => {
    expect(pf2ResolveStrike(rapier, { ...base, striking: 'greater' }).critDamage).toContain('2d8');
    expect(pf2ResolveStrike(rapier, { ...base, striking: 'major' }).critDamage).toContain('3d8');
  });

  it('fatal replaces the die and adds one extra of the new size', () => {
    // Pick: 1d6 base → crit becomes 2d10 (doubled) + 1d10 (fatal extra) = 3d10, modifier doubled.
    expect(pf2ResolveStrike(pick, base).critDamage).toBe('3d10+8 piercing');
  });

  it('fatal and deadly never both apply', () => {
    // No PF2 weapon carries both, and stacking them would double-count the crit bonus.
    const r = pf2ResolveStrike(pick, base);
    expect(r.critDamage).not.toContain(' + ');
  });

  it('a negative modifier doubles too', () => {
    const r = pf2ResolveStrike(longsword, { ...base, attributes: { STR: -1 }, extraDamage: 0 });
    expect(r.critDamage).toBe('2d8-2 slashing');
  });
});

describe('the roller can show its work', () => {
  it('explains each trait that moved a number', () => {
    const r = pf2ResolveStrike(rapier, { ...base, strikeIndex: 1, striking: 'striking' });
    expect(r.notes.join(' ')).toContain('multiple attack penalty');
    expect(r.notes.join(' ')).toContain('deadly');
    expect(r.notes.join(' ')).toContain('striking');
  });

  it('stays silent about traits that did not apply', () => {
    // A first Strike with no runes should not narrate a penalty it never took.
    expect(pf2ResolveStrike(longsword, base).notes).toEqual([]);
  });
});

describe('trait parsing', () => {
  it('extracts a parameterised die', () => {
    expect(traitDie(['deadly d10'], 'deadly')).toBe('d10');
    expect(traitDie(['two-hand d12'], 'two-hand')).toBe('d12');
  });

  it('returns null rather than inventing one', () => {
    // A weapon without the trait must never be handed one by accident.
    expect(traitDie(['agile', 'finesse'], 'deadly')).toBeNull();
    expect(traitDie([], 'fatal')).toBeNull();
  });
});
