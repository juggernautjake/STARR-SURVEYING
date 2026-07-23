// __tests__/dnd/multiclass-resolve.test.ts — MC-5e-5 foundation: the one multiclass-aware resolver.
import { describe, it, expect } from 'vitest';
import { characterMulticlass, classLookupFor, classDisplayFor } from '@/lib/dnd/classes/multiclass-resolve';

const SYS = 'dnd5e-2014';

describe('characterMulticlass resolver (MC-5e-5 foundation)', () => {
  it('resolves a single-class character from the legacy fields', () => {
    const { classes, snapshot } = characterMulticlass(SYS, { classKey: 'fighter', level: 5 });
    expect(classes).toEqual([{ classKey: 'fighter', subclassKey: undefined, level: 5 }]);
    expect(snapshot.totalLevel).toBe(5);
    expect(snapshot.proficiencyBonus).toBe(3);
  });

  it('resolves a multiclass character from meta.classes and aggregates it', () => {
    const { classes, snapshot } = characterMulticlass(
      SYS,
      { classKey: 'fighter', level: 5 },
      [{ classKey: 'fighter', level: 3 }, { classKey: 'wizard', level: 2 }],
    );
    expect(classes.map((c) => c.classKey)).toEqual(['fighter', 'wizard']);
    expect(snapshot.totalLevel).toBe(5);
    expect(snapshot.spellcastingClassCount).toBe(1); // only wizard is a leveled caster
    expect(new Set(snapshot.features.map((f) => f.sourceClass))).toEqual(new Set(['Fighter', 'Wizard']));
  });

  it('classLookupFor finds real classes and returns null for unknown ones', () => {
    const lookup = classLookupFor(SYS);
    expect(lookup('wizard')?.def.name).toBe('Wizard');
    expect(lookup('not-a-class')).toBeNull();
  });

  it('classDisplayFor: single-class shows class · subclass; multiclass shows the split (MC-5e-5)', () => {
    // Single class (no `classes` array) — unchanged from before.
    expect(classDisplayFor(SYS, { className: 'Fighter', subclass: 'Champion' })).toBe('Fighter · Champion');
    expect(classDisplayFor(SYS, { className: 'Wizard' })).toBe('Wizard');
    // Multiclass — the split by class NAME + level.
    expect(classDisplayFor(SYS, { className: 'Fighter', classes: [{ classKey: 'fighter', level: 3 }, { classKey: 'wizard', level: 2 }] })).toBe('Fighter 3 / Wizard 2');
  });
});
