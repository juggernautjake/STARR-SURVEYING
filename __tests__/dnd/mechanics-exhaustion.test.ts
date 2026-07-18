import { describe, it, expect } from 'vitest';
import {
  exhaustionD20Effect,
  exhaustionSpeedPenalty,
  exhaustionSpeedFactor,
  exhaustionHpMaxFactor,
  exhaustionIsDead,
} from '@/lib/dnd/mechanics/exhaustion';

// Phase 2 · M1a — exhaustion by edition + model. OWNER (2026-07-17): 2014 = the tiered table (main), flat
// −2/level = a selectable option, both fully hooked up.

describe('exhaustionD20Effect', () => {
  it('level 0 is always a no-op', () => {
    expect(exhaustionD20Effect('check', 0, '2014', 'vanilla')).toEqual({ penalty: 0, disadvantage: false });
    expect(exhaustionD20Effect('attack', 0, '2024', 'vanilla')).toEqual({ penalty: 0, disadvantage: false });
  });

  it('2024 vanilla = −2 per level on every kind of test, no disadvantage', () => {
    expect(exhaustionD20Effect('check', 3, '2024', 'vanilla')).toEqual({ penalty: -6, disadvantage: false });
    expect(exhaustionD20Effect('attack', 3, '2024', 'vanilla')).toEqual({ penalty: -6, disadvantage: false });
    expect(exhaustionD20Effect('save', 1, '2024', 'vanilla')).toEqual({ penalty: -2, disadvantage: false });
  });

  it('the flat option applies −2/level even on the 2014 edition (no disadvantage)', () => {
    expect(exhaustionD20Effect('check', 2, '2014', 'flat-2-per-level')).toEqual({ penalty: -4, disadvantage: false });
    expect(exhaustionD20Effect('save', 5, '2014', 'flat-2-per-level')).toEqual({ penalty: -10, disadvantage: false });
  });

  it('2014 vanilla = the tiered table: disadvantage, no flat penalty', () => {
    // Tier 1: ability checks only.
    expect(exhaustionD20Effect('check', 1, '2014', 'vanilla')).toEqual({ penalty: 0, disadvantage: true });
    expect(exhaustionD20Effect('attack', 1, '2014', 'vanilla')).toEqual({ penalty: 0, disadvantage: false });
    expect(exhaustionD20Effect('save', 2, '2014', 'vanilla')).toEqual({ penalty: 0, disadvantage: false });
    // Tier 3: attacks and saves join.
    expect(exhaustionD20Effect('attack', 3, '2014', 'vanilla')).toEqual({ penalty: 0, disadvantage: true });
    expect(exhaustionD20Effect('save', 3, '2014', 'vanilla')).toEqual({ penalty: 0, disadvantage: true });
    expect(exhaustionD20Effect('check', 3, '2014', 'vanilla')).toEqual({ penalty: 0, disadvantage: true });
  });

  it('clamps the level to 0–6', () => {
    expect(exhaustionD20Effect('check', 99, '2024', 'vanilla').penalty).toBe(-12); // capped at 6
    expect(exhaustionD20Effect('check', -3, '2024', 'vanilla')).toEqual({ penalty: 0, disadvantage: false });
  });
});

describe('exhaustion speed + HP tiers', () => {
  it('2024/flat speed penalty is −5 ft per level; 2014 uses a factor instead', () => {
    expect(exhaustionSpeedPenalty(3, '2024', 'vanilla')).toBe(-15);
    expect(exhaustionSpeedPenalty(3, '2014', 'flat-2-per-level')).toBe(-15);
    expect(exhaustionSpeedPenalty(3, '2014', 'vanilla')).toBe(0);
  });

  it('2014 speed factor: ×1 below tier 2, ×0.5 at 2–4, ×0 at 5+', () => {
    expect(exhaustionSpeedFactor(1, '2014', 'vanilla')).toBe(1);
    expect(exhaustionSpeedFactor(2, '2014', 'vanilla')).toBe(0.5);
    expect(exhaustionSpeedFactor(4, '2014', 'vanilla')).toBe(0.5);
    expect(exhaustionSpeedFactor(5, '2014', 'vanilla')).toBe(0);
    expect(exhaustionSpeedFactor(5, '2024', 'vanilla')).toBe(1); // 2024 uses the flat penalty, factor stays 1
  });

  it('2014 halves HP max at tier 4+; 2024/flat never touches HP max', () => {
    expect(exhaustionHpMaxFactor(3, '2014', 'vanilla')).toBe(1);
    expect(exhaustionHpMaxFactor(4, '2014', 'vanilla')).toBe(0.5);
    expect(exhaustionHpMaxFactor(6, '2024', 'vanilla')).toBe(1);
  });

  it('exhaustion 6 = death in both editions', () => {
    expect(exhaustionIsDead(5)).toBe(false);
    expect(exhaustionIsDead(6)).toBe(true);
    expect(exhaustionIsDead(99)).toBe(true);
  });
});
