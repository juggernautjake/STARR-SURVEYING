// __tests__/dnd/mechanics-defaults.test.ts — Area M4 consolidation. One place that pins the whole
// "vanilla is the platform default, and switching a mechanic's model changes the computed result" guarantee
// across every configurable mechanic, plus the resolved default preferences.
import { describe, it, expect } from 'vitest';
import { resolvePreferences, DEFAULT_CAMPAIGN_PREFERENCES } from '@/lib/dnd/preferences';
import { hitDiceAfterLongRest } from '@/lib/dnd/mechanics/long-rest';
import { exhaustionD20Effect } from '@/lib/dnd/mechanics/exhaustion';

describe('configurable mechanics — vanilla default + switching changes the result (M4)', () => {
  it('the resolved default preferences are all vanilla/standard', () => {
    const p = resolvePreferences(DEFAULT_CAMPAIGN_PREFERENCES);
    expect(p.exhaustionModel.value).toBe('vanilla');
    expect(p.longRestModel.value).toBe('vanilla');
    expect(p.autoMechanics.value).toBe(true);
    expect(p.equipLimits.value).toBe('enforced');
  });

  it('long rest: vanilla fully restores hit dice; a non-vanilla model yields a DIFFERENT result', () => {
    const vanilla = hitDiceAfterLongRest(8, 0, 'vanilla');
    const half = hitDiceAfterLongRest(8, 0, 'half-hit-dice');
    expect(vanilla).toBe(8);        // default = full restore
    expect(half).not.toBe(vanilla); // switching the model changes the number
    expect(half).toBe(4);
  });

  it('exhaustion: 2024 is always −2/level; in 2014 the model switches tiered-disadvantage ↔ flat penalty', () => {
    // 2024 uses the flat −2/level rule regardless of model (the modern default).
    expect(exhaustionD20Effect('check', 3, '2024', 'vanilla').penalty).toBe(-6);
    // In 2014, vanilla = the tiered DISADVANTAGE table; the flat model instead applies −2/level. Switching the
    // model on a 2014 character changes the computed result — the whole point of the selector.
    const v2014 = exhaustionD20Effect('check', 3, '2014', 'vanilla');
    const flat2014 = exhaustionD20Effect('check', 3, '2014', 'flat-2-per-level');
    expect(v2014).toEqual({ penalty: 0, disadvantage: true });
    expect(flat2014).toEqual({ penalty: -6, disadvantage: false });
    expect(flat2014).not.toEqual(v2014);
  });
});
