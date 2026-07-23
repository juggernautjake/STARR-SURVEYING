// __tests__/dnd/multiclass-5e-model.test.ts — MC-5e-1: the 5e multiclass model + unified read path.
import { describe, it, expect } from 'vitest';
import { resolveClassLevels, totalClassLevel, isMulticlass, formatClassLevels } from '@/lib/dnd/classes/engine';

describe('5e multiclass model (MC-5e-1)', () => {
  it('a single-class character resolves to a one-element list (unchanged behaviour)', () => {
    const cl = resolveClassLevels({ classKey: 'fighter', subclassKey: 'champion', level: 5 });
    expect(cl).toEqual([{ classKey: 'fighter', subclassKey: 'champion', level: 5 }]);
    expect(totalClassLevel(cl)).toBe(5);
    expect(isMulticlass(cl)).toBe(false);
  });

  it('the multiclass array wins when present, and total level is the SUM', () => {
    const cl = resolveClassLevels(
      { classKey: 'fighter', level: 5 }, // single fields ignored once the array exists
      [{ classKey: 'fighter', subclassKey: 'champion', level: 3 }, { classKey: 'wizard', subclassKey: 'evocation', level: 2 }],
    );
    expect(cl.map((c) => c.classKey)).toEqual(['fighter', 'wizard']);
    expect(totalClassLevel(cl)).toBe(5);
    expect(isMulticlass(cl)).toBe(true);
  });

  it('filters invalid entries and clamps levels to whole numbers >= 1', () => {
    const cl = resolveClassLevels(
      { classKey: 'rogue', level: 1 },
      [{ classKey: 'rogue', level: 2.7 }, { classKey: '', level: 3 } as never, { classKey: 'cleric', level: 0 }],
    );
    expect(cl).toEqual([{ classKey: 'rogue', subclassKey: undefined, level: 2 }]); // 2.7→2; '' and level 0 dropped
  });

  it('an empty/classless character resolves to an empty list', () => {
    expect(resolveClassLevels({})).toEqual([]);
    expect(totalClassLevel([])).toBe(0);
  });

  it('formats the class split for display', () => {
    const name = (k: string) => ({ fighter: 'Fighter', wizard: 'Wizard' }[k] ?? k);
    expect(formatClassLevels([{ classKey: 'fighter', level: 3 }, { classKey: 'wizard', level: 2 }], name)).toBe('Fighter 3 / Wizard 2');
    expect(formatClassLevels([{ classKey: 'fighter', level: 5 }], name)).toBe('Fighter 5');
  });
});
