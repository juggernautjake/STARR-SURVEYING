// __tests__/learn/streak.test.ts
//
// hub-widget-excellence-13 — streak-counter R1: the /api/admin/learn/
// streak endpoint was missing. Locks the pure streak calculator behind
// the new endpoint.

import { describe, it, expect } from 'vitest';
import { computeStreak } from '@/lib/learn/streak';

const NOW = Date.parse('2026-05-30T15:00:00Z'); // a Saturday

describe('computeStreak', () => {
  it('counts a run ending today as the current streak', () => {
    const r = computeStreak(['2026-05-28', '2026-05-29', '2026-05-30'], NOW);
    expect(r.current_days).toBe(3);
    expect(r.longest_days).toBe(3);
  });

  it('keeps the streak "current" when the last day was yesterday', () => {
    const r = computeStreak(['2026-05-28', '2026-05-29'], NOW);
    expect(r.current_days).toBe(2);
  });

  it('breaks the current streak when a full day is missed', () => {
    // last activity 2 days ago → no current streak
    const r = computeStreak(['2026-05-27', '2026-05-28'], NOW);
    expect(r.current_days).toBe(0);
    expect(r.longest_days).toBe(2);
  });

  it('dedupes same-day activity + ignores datetimes', () => {
    const r = computeStreak(
      ['2026-05-30T09:00:00Z', '2026-05-30T14:00:00Z', '2026-05-29T10:00:00Z'],
      NOW,
    );
    expect(r.current_days).toBe(2);
  });

  it('tracks the longest historical run separately from the current', () => {
    const r = computeStreak(
      ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-30'],
      NOW,
    );
    expect(r.longest_days).toBe(4);
    expect(r.current_days).toBe(1); // only today
  });

  it('is 0/0 for no activity + skips unparseable dates', () => {
    expect(computeStreak([], NOW)).toEqual({ current_days: 0, longest_days: 0 });
    expect(computeStreak(['not-a-date'], NOW)).toEqual({ current_days: 0, longest_days: 0 });
  });
});
