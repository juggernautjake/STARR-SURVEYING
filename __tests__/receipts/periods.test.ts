// "A given day, week, month, year" — the calendar arithmetic behind the preset row and the arrows.
//
// Owner, 2026-08-17: *"review the receipts for a given day, week, month, year in a carousel …
// arrows for navigating forward and backward"*.

import { describe, it, expect } from 'vitest';
import {
  describePeriod, detectPeriod, isCurrentPeriod, periodRange, shiftPeriod, startOfWeek, todayIso,
} from '@/lib/receipts/periods';

describe('periodRange', () => {
  it('a day is itself', () => {
    expect(periodRange('day', '2026-08-17')).toEqual({ from: '2026-08-17', to: '2026-08-17' });
  });

  it('a week runs Monday to Sunday, matching the hours week', () => {
    // 2026-08-17 is a Monday.
    expect(periodRange('week', '2026-08-17')).toEqual({ from: '2026-08-17', to: '2026-08-23' });
    // From mid-week you still get that same week…
    expect(periodRange('week', '2026-08-20')).toEqual({ from: '2026-08-17', to: '2026-08-23' });
  });

  it('and SUNDAY belongs to the week that started six days earlier, not the one starting tomorrow', () => {
    // The off-by-one that a Sunday-start convention would introduce, and the reason Sunday's fuel
    // must land in the same week as Sunday's hours.
    expect(periodRange('week', '2026-08-23')).toEqual({ from: '2026-08-17', to: '2026-08-23' });
  });

  it('a month ends on its real last day — 30, 31 and February all', () => {
    expect(periodRange('month', '2026-08-17').to).toBe('2026-08-31');
    expect(periodRange('month', '2026-04-05').to).toBe('2026-04-30');
    expect(periodRange('month', '2026-02-14').to).toBe('2026-02-28');
    // 2028 is a leap year; a hardcoded 28 would be wrong here and right everywhere else, which is
    // how that bug survives three years.
    expect(periodRange('month', '2028-02-14').to).toBe('2028-02-29');
  });

  it('a year is January to December', () => {
    expect(periodRange('year', '2026-08-17')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
});

describe('shiftPeriod — the arrows', () => {
  it('steps a day, a week and a year', () => {
    expect(shiftPeriod('day', '2026-08-17', -1)).toBe('2026-08-16');
    expect(shiftPeriod('week', '2026-08-20', -1)).toBe('2026-08-10');
    expect(shiftPeriod('year', '2026-08-17', 1)).toBe('2027-01-01');
  });

  it('does NOT skip February when stepping forward from the 31st', () => {
    // The classic: 31 Jan + 1 month = 31 Feb, which JS rolls to 3 March, so "next" twice lands in
    // March and February is never shown. Normalising to the 1st before shifting is what prevents it.
    const feb = shiftPeriod('month', '2026-01-31', 1);
    expect(periodRange('month', feb)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    const mar = shiftPeriod('month', feb, 1);
    expect(periodRange('month', mar).from).toBe('2026-03-01');
  });

  it('crosses a year boundary in both directions', () => {
    expect(shiftPeriod('month', '2026-01-15', -1)).toBe('2025-12-01');
    expect(shiftPeriod('month', '2026-12-15', 1)).toBe('2027-01-01');
    expect(shiftPeriod('day', '2027-01-01', -1)).toBe('2026-12-31');
  });

  it('leaves a custom range alone rather than guessing what a step means', () => {
    expect(shiftPeriod('custom', '2026-08-17', 1)).toBe('2026-08-17');
  });
});

describe('detectPeriod — the buttons follow the dates, not the other way round', () => {
  it('recognises a hand-typed range that happens to be a real month', () => {
    // Somebody typing 1–31 August should get the Month button lit and working arrows, not "custom".
    expect(detectPeriod('2026-08-01', '2026-08-31')).toBe('month');
  });

  it('recognises day, week and year', () => {
    expect(detectPeriod('2026-08-17', '2026-08-17')).toBe('day');
    expect(detectPeriod('2026-08-17', '2026-08-23')).toBe('week');
    expect(detectPeriod('2026-01-01', '2026-12-31')).toBe('year');
  });

  it('calls anything else custom, including a nearly-right month', () => {
    expect(detectPeriod('2026-08-01', '2026-08-30')).toBe('custom');
    expect(detectPeriod('2026-08-02', '2026-08-31')).toBe('custom');
    expect(detectPeriod('', '')).toBe('custom');
  });

  it('round-trips with periodRange for every preset', () => {
    for (const p of ['day', 'week', 'month', 'year'] as const) {
      const r = periodRange(p, '2026-08-17');
      expect(detectPeriod(r.from, r.to)).toBe(p);
    }
  });
});

describe('describePeriod', () => {
  const now = new Date('2026-08-17T12:00:00Z');

  it('says Today and Yesterday rather than making anyone read a date', () => {
    expect(describePeriod('day', todayIso(now), now)).toBe('Today');
    expect(describePeriod('day', '2026-08-16', now)).toBe('Yesterday');
  });

  it('names a month and a year plainly', () => {
    expect(describePeriod('month', '2026-03-04', now)).toBe('March 2026');
    expect(describePeriod('year', '2025-06-01', now)).toBe('2025');
  });

  it('marks the period containing today', () => {
    expect(describePeriod('month', '2026-08-01', now)).toMatch(/^This month · August 2026/);
    expect(describePeriod('year', '2026-01-01', now)).toMatch(/^This year · 2026/);
  });

  it('collapses a week that sits inside one month, and spells out one that does not', () => {
    expect(describePeriod('week', '2026-08-10', now)).toBe('Aug 10–16, 2026');
    // 31 Aug – 6 Sep needs both month names or it reads as 31–6.
    expect(describePeriod('week', '2026-08-31', now)).toBe('Aug 31–Sep 6, 2026');
  });
});

describe('isCurrentPeriod', () => {
  const now = new Date('2026-08-17T12:00:00Z');

  it('is true for the period holding today and false for its neighbours', () => {
    expect(isCurrentPeriod('month', '2026-08-31', now)).toBe(true);
    expect(isCurrentPeriod('month', '2026-07-31', now)).toBe(false);
    expect(isCurrentPeriod('day', '2026-08-17', now)).toBe(true);
  });
});

describe('startOfWeek', () => {
  it('is idempotent — a Monday is its own week start', () => {
    expect(startOfWeek('2026-08-17')).toBe('2026-08-17');
    expect(startOfWeek(startOfWeek('2026-08-20'))).toBe(startOfWeek('2026-08-20'));
  });
});
