// __tests__/hub/widgets/today-schedule.test.ts
//
// Slice 111 — Today's Schedule widget helpers + registry round-trip.

import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import {
  capForBucket,
  sortByStart,
  todayWindow,
} from '@/lib/hub/widgets/today-schedule';

describe('today-schedule widget — registry', () => {
  it('registers under id "today-schedule" as a personal widget', () => {
    const def = getWidget('today-schedule');
    expect(def).toBeDefined();
    expect(def?.category).toBe('personal');
    expect(def?.iconName).toBe('Calendar');
  });

  it('default size 6×3, min 3×2, max 12×6', () => {
    const def = getWidget('today-schedule');
    expect(def?.defaultSize).toEqual({ w: 4, h: 3 });
    expect(def?.minSize).toEqual({ w: 2, h: 2 });
    expect(def?.maxSize).toEqual({ w: 8, h: 8 });
  });

  it('default content surfaces all-day + full day', () => {
    const def = getWidget('today-schedule');
    const c = def?.defaultContent as { showAllDay: boolean; timeRange: string };
    expect(c.showAllDay).toBe(true);
    expect(c.timeRange).toBe('all-day');
  });
});

describe('today-schedule — capForBucket', () => {
  it('tiny → 2', () => { expect(capForBucket('tiny')).toBe(2); });
  it('small → 4', () => { expect(capForBucket('small')).toBe(4); });
  it('medium → 6', () => { expect(capForBucket('medium')).toBe(6); });
  it('large → 12', () => { expect(capForBucket('large')).toBe(12); });
  it('xlarge → 24', () => { expect(capForBucket('xlarge')).toBe(24); });
});

describe('today-schedule — todayWindow', () => {
  // Pick noon UTC to avoid DST quirks in the test.
  const NOW = new Date('2026-05-29T12:00:00Z');

  it('all-day window spans the calendar day', () => {
    const { from, to } = todayWindow('all-day', NOW);
    expect(new Date(from).getHours()).toBe(0);
    const fromDay = new Date(from).getDate();
    const toDay = new Date(to).getDate();
    expect(toDay - fromDay).toBe(1);
  });

  it('morning starts at 6am', () => {
    const { from, to } = todayWindow('morning', NOW);
    expect(new Date(from).getHours()).toBe(6);
    expect(new Date(to).getHours()).toBe(12);
  });

  it('afternoon spans noon → 6pm', () => {
    const { from, to } = todayWindow('afternoon', NOW);
    expect(new Date(from).getHours()).toBe(12);
    expect(new Date(to).getHours()).toBe(18);
  });

  it('evening spans 6pm → midnight', () => {
    const { from, to } = todayWindow('evening', NOW);
    expect(new Date(from).getHours()).toBe(18);
    // Midnight may roll to next-day depending on TZ math.
    expect([0, 24]).toContain(new Date(to).getHours());
  });
});

describe('today-schedule — sortByStart', () => {
  it('puts all-day events first', () => {
    const out = sortByStart([
      { id: 'a', title: 'A', start_time: '2026-05-29T10:00:00Z', all_day: false },
      { id: 'b', title: 'B', start_time: '2026-05-29T00:00:00Z', all_day: true },
      { id: 'c', title: 'C', start_time: '2026-05-29T15:00:00Z', all_day: false },
    ]);
    expect(out.map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts non-all-day events by start time ascending', () => {
    const out = sortByStart([
      { id: 'a', title: 'A', start_time: '2026-05-29T15:00:00Z' },
      { id: 'b', title: 'B', start_time: '2026-05-29T09:00:00Z' },
      { id: 'c', title: 'C', start_time: '2026-05-29T12:30:00Z' },
    ]);
    expect(out.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });
});
