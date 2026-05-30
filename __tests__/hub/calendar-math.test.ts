// __tests__/hub/calendar-math.test.ts
//
// Slice 1 of hub-widget-excellence-04-calendar. Locks the pure calendar
// date math: month-grid generation (leading/trailing days), week days,
// per-day event bucketing, clamping, same-day, and the bucket→view map.

import { describe, it, expect } from 'vitest';
import {
  monthGrid,
  weekDays,
  eventsForDay,
  clampEventToDay,
  isSameDay,
  datePart,
  bucketToView,
} from '@/lib/hub/calendar/calendar-math';

describe('monthGrid', () => {
  // May 2026: May 1 is a Friday; May 31 is a Sunday.
  const grid = monthGrid(2026, 5);

  it('returns whole weeks of 7 days', () => {
    expect(grid.length).toBeGreaterThanOrEqual(5);
    for (const week of grid) expect(week).toHaveLength(7);
  });

  it('starts on the Sunday on/before the 1st and ends on the Saturday on/after the last', () => {
    expect(grid[0][0].weekday).toBe(0);
    const lastWeek = grid[grid.length - 1];
    expect(lastWeek[6].weekday).toBe(6);
    // April 26 2026 is the Sunday before May 1.
    expect(grid[0][0].iso).toBe('2026-04-26');
  });

  it('flags leading/trailing days as out-of-month', () => {
    expect(grid[0][0].inMonth).toBe(false); // 2026-04-26
    const may1 = grid.flat().find((d) => d.iso === '2026-05-01')!;
    expect(may1.inMonth).toBe(true);
    expect(may1.weekday).toBe(5); // Friday
    const jun1 = grid.flat().find((d) => d.iso === '2026-06-01');
    if (jun1) expect(jun1.inMonth).toBe(false);
  });

  it('includes every day of the focus month exactly once', () => {
    const inMonth = grid.flat().filter((d) => d.inMonth);
    expect(inMonth).toHaveLength(31); // May has 31 days
    expect(new Set(inMonth.map((d) => d.iso)).size).toBe(31);
  });
});

describe('weekDays', () => {
  it('returns the Sun–Sat week containing the date', () => {
    const wk = weekDays('2026-05-30'); // Saturday
    expect(wk).toHaveLength(7);
    expect(wk[0].iso).toBe('2026-05-24'); // Sunday
    expect(wk[6].iso).toBe('2026-05-30'); // Saturday
  });
});

describe('eventsForDay', () => {
  const events = [
    { id: 'a', start_time: '2026-05-30T09:00:00Z', end_time: '2026-05-30T10:00:00Z' },
    { id: 'b', start_time: '2026-05-29T08:00:00Z', end_time: '2026-06-01T17:00:00Z' }, // multi-day
    { id: 'c', start_time: '2026-05-28T08:00:00Z', end_time: '2026-05-28T09:00:00Z' },
    { id: 'd', start_time: null, end_time: null },
  ];

  it('returns same-day events', () => {
    expect(eventsForDay(events, '2026-05-30').map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('includes multi-day events on every spanned day', () => {
    expect(eventsForDay(events, '2026-05-31').map((e) => e.id)).toEqual(['b']);
  });

  it('excludes events outside the day + events without a start', () => {
    expect(eventsForDay(events, '2026-05-27').map((e) => e.id)).toEqual([]);
  });
});

describe('clampEventToDay', () => {
  it('flags continuation + clamps a multi-day event to the day bounds', () => {
    const c = clampEventToDay(
      { start_time: '2026-05-29T08:00:00Z', end_time: '2026-06-01T17:00:00Z' },
      '2026-05-30',
    );
    expect(c.continuesBefore).toBe(true);
    expect(c.continuesAfter).toBe(true);
    expect(c.start).toBe('2026-05-30T00:00:00.000Z');
    expect(c.end).toBe('2026-05-30T23:59:59.999Z');
  });

  it('keeps a within-day event untouched', () => {
    const c = clampEventToDay(
      { start_time: '2026-05-30T09:00:00Z', end_time: '2026-05-30T10:00:00Z' },
      '2026-05-30',
    );
    expect(c.continuesBefore).toBe(false);
    expect(c.continuesAfter).toBe(false);
    expect(c.start).toBe('2026-05-30T09:00:00Z');
  });
});

describe('isSameDay + datePart', () => {
  it('datePart extracts the YYYY-MM-DD prefix', () => {
    expect(datePart('2026-05-30T09:00:00Z')).toBe('2026-05-30');
    expect(datePart(null)).toBe('');
  });

  it('isSameDay compares the date portion', () => {
    expect(isSameDay('2026-05-30T09:00Z', '2026-05-30T22:00Z')).toBe(true);
    expect(isSameDay('2026-05-30', '2026-05-31')).toBe(false);
    expect(isSameDay(null, '2026-05-30')).toBe(false);
  });
});

describe('bucketToView', () => {
  it('maps size buckets to the right presentation', () => {
    expect(bucketToView('tiny')).toBe('agenda');
    expect(bucketToView('small')).toBe('agenda');
    expect(bucketToView('medium')).toBe('agenda-wide');
    expect(bucketToView('large')).toBe('grid');
    expect(bucketToView('xlarge')).toBe('grid');
  });
});
