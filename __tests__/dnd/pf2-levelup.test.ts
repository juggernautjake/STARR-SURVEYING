// __tests__/dnd/pf2-levelup.test.ts — the PF2 per-level progression breakdown (B8, first slice).
import { describe, it, expect } from 'vitest';
import { pf2LevelBreakdown } from '@/lib/dnd/systems/pathfinder2e/levelup';

describe('pf2LevelBreakdown', () => {
  it('returns one entry per level 1..N, clamped to 1–20', () => {
    expect(pf2LevelBreakdown('Fighter', 5).map((s) => s.level)).toEqual([1, 2, 3, 4, 5]);
    expect(pf2LevelBreakdown('Fighter', 99)).toHaveLength(20);
    expect(pf2LevelBreakdown('Fighter', 0)).toHaveLength(1); // clamps up to at least level 1
  });

  it('surfaces the class features gained at each level from the tested progression', () => {
    const steps = pf2LevelBreakdown('Barbarian', 5);
    const l1 = steps.find((s) => s.level === 1)!;
    // Barbarian gains Rage + Instinct at level 1 (see PF2_CLASS_PROGRESSIONS).
    const names = l1.features.map((f) => f.name);
    expect(names).toContain('Rage');
    expect(names).toContain('Instinct');
    // Each feature carries its effect text (not just a name).
    expect(l1.features.every((f) => typeof f.effect === 'string' && f.effect.length > 0)).toBe(true);
  });

  it('marks the feat slots owed each level from the universal schedule', () => {
    const steps = pf2LevelBreakdown('Fighter', 5);
    const at = (n: number) => steps.find((s) => s.level === n)!.featTracks;
    // Ancestry feats at 1/5/9/…; class feats even levels; skill feats even; general at 3/7/…
    expect(at(1)).toContain('ancestry');
    expect(at(2)).toContain('class');
    expect(at(2)).toContain('skill');
    expect(at(3)).toContain('general');
    expect(at(5)).toContain('ancestry');
  });

  it('flags the 4 free ability boosts at levels 5/10/15/20 (universal)', () => {
    const steps = pf2LevelBreakdown('Cleric', 20);
    const boostLevels = steps.filter((s) => s.abilityBoosts).map((s) => s.level);
    expect(boostLevels).toEqual([5, 10, 15, 20]);
    expect(steps.find((s) => s.level === 4)!.abilityBoosts).toBe(false);
  });

  it('an unknown class yields the feat schedule with no class features', () => {
    const steps = pf2LevelBreakdown('Not A Class', 3);
    expect(steps).toHaveLength(3);
    expect(steps.every((s) => s.features.length === 0)).toBe(true);
    expect(steps.find((s) => s.level === 1)!.featTracks).toContain('ancestry');
  });
});
