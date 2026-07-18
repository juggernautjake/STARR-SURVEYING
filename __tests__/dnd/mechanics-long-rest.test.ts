import { describe, it, expect } from 'vitest';
import { hitDiceAfterLongRest } from '@/lib/dnd/mechanics/long-rest';

// Phase 2 · M2 — the swappable long-rest hit-dice models. Vanilla (default) is full restore; the 2014-RAW
// half model regains half your total (min 1) added to what's left; gritty/epic don't change the amount.

describe('hitDiceAfterLongRest', () => {
  it('vanilla restores ALL hit dice (platform default)', () => {
    expect(hitDiceAfterLongRest(8, 0, 'vanilla')).toBe(8);
    expect(hitDiceAfterLongRest(8, 3, 'vanilla')).toBe(8);
  });

  it('half-hit-dice (2014 RAW) regains half the total (min 1), added to what remained, clamped to total', () => {
    expect(hitDiceAfterLongRest(8, 0, 'half-hit-dice')).toBe(4); // 0 + floor(8/2)
    expect(hitDiceAfterLongRest(8, 5, 'half-hit-dice')).toBe(8); // 5 + 4 = 9 → clamp to 8
    expect(hitDiceAfterLongRest(1, 0, 'half-hit-dice')).toBe(1); // floor(1/2)=0 → min 1
    expect(hitDiceAfterLongRest(3, 0, 'half-hit-dice')).toBe(1); // floor(3/2)=1
  });

  it('gritty and epic restore the vanilla amount (they change rest TIME, not the amount)', () => {
    expect(hitDiceAfterLongRest(10, 2, 'gritty')).toBe(10);
    expect(hitDiceAfterLongRest(10, 2, 'epic')).toBe(10);
  });

  it('clamps ragged inputs (never exceeds total, never negative)', () => {
    expect(hitDiceAfterLongRest(6, 99, 'half-hit-dice')).toBe(6); // remaining over total clamps first
    expect(hitDiceAfterLongRest(0, 0, 'half-hit-dice')).toBe(0); // no dice → nothing to restore
    expect(hitDiceAfterLongRest(-4, -4, 'vanilla')).toBe(0);
  });
});
