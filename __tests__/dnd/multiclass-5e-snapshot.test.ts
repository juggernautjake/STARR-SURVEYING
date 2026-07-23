// __tests__/dnd/multiclass-5e-snapshot.test.ts — MC-5e-2: cross-class aggregation over REAL class data.
import { describe, it, expect } from 'vitest';
import { multiclassSnapshot } from '@/lib/dnd/classes/engine';
import { findClass } from '@/lib/dnd/classes/registry';
import type { ClassLevel } from '@/lib/dnd/classes/types';

const SYS = 'dnd5e-2014';
const lookup = (key: string) => {
  const def = findClass(SYS, key);
  return def ? { def, sub: null } : null;
};

describe('5e multiclass aggregation (MC-5e-2)', () => {
  it('a single-class list equals that one class (safe for every character)', () => {
    const single: ClassLevel[] = [{ classKey: 'fighter', level: 5 }];
    const ms = multiclassSnapshot(single, lookup);
    expect(ms.totalLevel).toBe(5);
    expect(ms.proficiencyBonus).toBe(3); // level 5
    expect(ms.perClass).toHaveLength(1);
    expect(ms.hitPointsBeforeCon).toBeGreaterThan(0);
  });

  it('Fighter 3 / Wizard 2: total level 5, prof by TOTAL, HP additive, features from BOTH classes', () => {
    const mc: ClassLevel[] = [{ classKey: 'fighter', level: 3 }, { classKey: 'wizard', level: 2 }];
    const ms = multiclassSnapshot(mc, lookup);
    expect(ms.totalLevel).toBe(5);
    expect(ms.proficiencyBonus).toBe(3); // +3 at total level 5, not each class's own
    // HP is the sum of each class's contribution.
    const fHp = multiclassSnapshot([{ classKey: 'fighter', level: 3 }], lookup).hitPointsBeforeCon;
    const wHp = multiclassSnapshot([{ classKey: 'wizard', level: 2 }], lookup).hitPointsBeforeCon;
    expect(ms.hitPointsBeforeCon).toBe(fHp + wHp);
    // Features are kept from both classes and tagged with their source.
    const sources = new Set(ms.features.map((f) => f.sourceClass));
    expect(sources.has('Fighter')).toBe(true);
    expect(sources.has('Wizard')).toBe(true);
    expect(ms.perClass.map((p) => p.classKey)).toEqual(['fighter', 'wizard']);
  });

  it('combined caster level counts only caster classes (Wizard full; Fighter contributes 0)', () => {
    const ms = multiclassSnapshot([{ classKey: 'fighter', level: 3 }, { classKey: 'wizard', level: 2 }], lookup);
    expect(ms.casterLevel).toBe(2); // wizard 2 (full) + fighter 0
    // A pure martial multiclass casts nothing.
    const martial = multiclassSnapshot([{ classKey: 'fighter', level: 3 }, { classKey: 'barbarian', level: 2 }], lookup);
    expect(martial.casterLevel).toBe(0);
  });

  it('skips unknown classes rather than throwing', () => {
    const ms = multiclassSnapshot([{ classKey: 'fighter', level: 2 }, { classKey: 'not-a-class', level: 3 }], lookup);
    expect(ms.perClass.map((p) => p.classKey)).toEqual(['fighter']);
    // totalClassLevel counts the DECLARED levels; the unknown class just contributes no snapshot data.
    expect(ms.totalLevel).toBe(5);
  });
});
