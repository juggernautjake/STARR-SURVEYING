import { describe, it, expect } from 'vitest';
import { resolveD20Roll, fourStepDegree, clampNatural } from '@/lib/dnd/roll';

// Phase 2 · R1 — the shared, pure d20 roll-resolution engine. It takes the natural face as input, so the same
// resolution serves auto rolls, typed manual rolls, and recorded IRL rolls. Degrees for IG/PF2; success/fail
// for the rest.

describe('resolveD20Roll — totals, crits, fumbles', () => {
  it('adds the modifier and flags natural 20 / 1', () => {
    const r = resolveD20Roll({ natural: 20, modifier: 5 });
    expect(r.total).toBe(25);
    expect(r.critical).toBe(true);
    expect(r.fumble).toBe(false);
    const f = resolveD20Roll({ natural: 1, modifier: 5 });
    expect(f.fumble).toBe(true);
    expect(f.total).toBe(6);
  });

  it('no DC ⇒ no success/degree, just the total', () => {
    const r = resolveD20Roll({ natural: 10, modifier: 3 });
    expect(r.success).toBeUndefined();
    expect(r.degree).toBeUndefined();
    expect(r.total).toBe(13);
  });
});

describe('degree systems (IG, PF2) resolve the four-step ladder', () => {
  it('IG/PF2: crit success at +10, success at meet, failure, crit failure at −10', () => {
    expect(resolveD20Roll({ natural: 15, modifier: 10, dc: 15, system: 'intuitive-games' }).degree).toBe('critical-success'); // 25 vs 15
    expect(resolveD20Roll({ natural: 8, modifier: 7, dc: 15, system: 'pathfinder2e' }).degree).toBe('success'); // 15 = meet
    expect(resolveD20Roll({ natural: 5, modifier: 0, dc: 15, system: 'intuitive-games' }).degree).toBe('critical-failure'); // 5 ≤ dc−10
    expect(resolveD20Roll({ natural: 9, modifier: 5, dc: 15, system: 'pathfinder2e' }).degree).toBe('failure'); // 14
  });

  it('success is true on success OR critical success', () => {
    expect(resolveD20Roll({ natural: 15, modifier: 10, dc: 15, system: 'intuitive-games' }).success).toBe(true);
    expect(resolveD20Roll({ natural: 9, modifier: 5, dc: 15, system: 'pathfinder2e' }).success).toBe(false);
  });

  it('a natural 20 bumps the degree up one step, a natural 1 down one (clamped)', () => {
    expect(resolveD20Roll({ natural: 20, modifier: -10, dc: 15, system: 'intuitive-games' }).degree).toBe('success'); // 10 = failure → nat20 → success
    expect(resolveD20Roll({ natural: 1, modifier: 24, dc: 15, system: 'pathfinder2e' }).degree).toBe('success'); // 25 = crit → nat1 → success
  });
});

describe('non-degree systems use meet-or-beat success', () => {
  it('5e-style: success when total ≥ DC, no degree', () => {
    const hit = resolveD20Roll({ natural: 12, modifier: 5, dc: 15, system: 'dnd5e-2024' });
    expect(hit.success).toBe(true);
    expect(hit.degree).toBeUndefined();
    expect(resolveD20Roll({ natural: 3, modifier: 5, dc: 15, system: 'dnd5e-2014' }).success).toBe(false);
  });
});

describe('input hygiene', () => {
  it('clamps the natural face to 1–20', () => {
    expect(clampNatural(0)).toBe(1);
    expect(clampNatural(25)).toBe(20);
    expect(clampNatural(13)).toBe(13);
    // a typed 99 can never produce an out-of-range roll
    expect(resolveD20Roll({ natural: 99, modifier: 0 }).natural).toBe(20);
  });

  it('fourStepDegree is exposed for direct use and matches the resolver', () => {
    expect(fourStepDegree(25, 15)).toBe('critical-success');
    expect(fourStepDegree(15, 15)).toBe('success');
  });
});

import { parseDiceExpr, rollDiceExpr } from '@/lib/dnd/roll';

describe('dice-expression rolls (damage/healing)', () => {
  it('parses single + multi-die + flat expressions', () => {
    expect(parseDiceExpr('2d6+6')).toEqual({ dice: [{ count: 2, sides: 6, sign: 1 }], modifier: 6 });
    expect(parseDiceExpr('1d8')).toEqual({ dice: [{ count: 1, sides: 8, sign: 1 }], modifier: 0 });
    expect(parseDiceExpr('1d8+1d6+2')).toEqual({ dice: [{ count: 1, sides: 8, sign: 1 }, { count: 1, sides: 6, sign: 1 }], modifier: 2 });
    expect(parseDiceExpr('1d10-1')).toEqual({ dice: [{ count: 1, sides: 10, sign: 1 }], modifier: -1 });
    expect(parseDiceExpr('8')).toEqual({ dice: [], modifier: 8 });
    expect(parseDiceExpr('')).toBeNull();
    expect(parseDiceExpr('nonsense')).toBeNull();
  });

  it('rolls with a seeded RNG deterministically (max faces here)', () => {
    const max = () => 0.999; // always the top face
    const r = rollDiceExpr('2d6+6', max);
    expect(r.total).toBe(18); // 6 + 6 + 6
    expect(r.breakdown).toContain('2d6[6,6]');
    expect(r.breakdown).toContain('= 18');
  });

  it('clamps a negative total to 0 and handles a bad expression', () => {
    const min = () => 0; // always face 1
    expect(rollDiceExpr('1d4-10', min).total).toBe(0); // 1 − 10 → clamp 0
    expect(rollDiceExpr('junk').total).toBe(0);
  });
});

import { degreeLabel } from '@/lib/dnd/roll';
describe('degreeLabel', () => {
  it('gives human labels for each degree', () => {
    expect(degreeLabel('critical-success')).toBe('Critical Success');
    expect(degreeLabel('success')).toBe('Success');
    expect(degreeLabel('failure')).toBe('Failure');
    expect(degreeLabel('critical-failure')).toBe('Critical Failure');
  });
});
