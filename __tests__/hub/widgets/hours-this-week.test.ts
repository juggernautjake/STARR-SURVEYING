// __tests__/hub/widgets/hours-this-week.test.ts
//
// Slice 113 — Hours This Week widget helpers + registry round-trip.

import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import {
  aggregateByJob,
  summarizeWeek,
  weekStartIso,
} from '@/lib/hub/widgets/hours-this-week';

describe('hours-this-week widget — registry', () => {
  it('registers in time-pay category', () => {
    const def = getWidget('hours-this-week');
    expect(def).toBeDefined();
    expect(def?.category).toBe('time-pay');
  });

  it('default size 4×2', () => {
    const def = getWidget('hours-this-week');
    expect(def?.defaultSize).toEqual({ w: 4, h: 2 });
  });
});

describe('hours-this-week — weekStartIso', () => {
  it('monday start: Wednesday → previous Monday', () => {
    const now = new Date('2026-05-27T12:00:00'); // Wed
    expect(weekStartIso('monday', now)).toBe('2026-05-25');
  });

  it('monday start: Sunday → previous Monday (6 days back)', () => {
    const now = new Date('2026-05-31T12:00:00'); // Sun
    expect(weekStartIso('monday', now)).toBe('2026-05-25');
  });

  it('sunday start: Tuesday → previous Sunday', () => {
    const now = new Date('2026-05-26T12:00:00'); // Tue
    expect(weekStartIso('sunday', now)).toBe('2026-05-24');
  });
});

describe('hours-this-week — summarizeWeek', () => {
  it('sums hours per day with Monday-first label order', () => {
    const logs = [
      { id: '1', user_email: 'a', log_date: '2026-05-25', hours: 8 }, // Mon
      { id: '2', user_email: 'a', log_date: '2026-05-26', hours: 4 }, // Tue
      { id: '3', user_email: 'a', log_date: '2026-05-26', hours: 2 }, // Tue (+)
      { id: '4', user_email: 'a', log_date: '2026-05-31', hours: 3 }, // Sun
    ];
    const out = summarizeWeek(logs, 'monday');
    expect(out.map((d) => d.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(out[0].hours).toBe(8);
    expect(out[1].hours).toBe(6);
    expect(out[6].hours).toBe(3);
  });

  it('sums hours per day with Sunday-first label order', () => {
    const logs = [
      { id: '1', user_email: 'a', log_date: '2026-05-24', hours: 8 }, // Sun
      { id: '2', user_email: 'a', log_date: '2026-05-25', hours: 4 }, // Mon
    ];
    const out = summarizeWeek(logs, 'sunday');
    expect(out.map((d) => d.label)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(out[0].hours).toBe(8);
    expect(out[1].hours).toBe(4);
  });
});

describe('hours-this-week — aggregateByJob', () => {
  it('aggregates by job_name + sorts descending', () => {
    const logs = [
      { id: '1', user_email: 'a', log_date: '2026-05-25', hours: 4, job_name: 'Survey A' },
      { id: '2', user_email: 'a', log_date: '2026-05-26', hours: 2, job_name: 'Survey B' },
      { id: '3', user_email: 'a', log_date: '2026-05-26', hours: 3, job_name: 'Survey A' },
    ];
    const out = aggregateByJob(logs);
    expect(out).toEqual([
      { label: 'Survey A', hours: 7 },
      { label: 'Survey B', hours: 2 },
    ]);
  });

  it('falls back to work_type, then "Other", when job_name missing', () => {
    const logs = [
      { id: '1', user_email: 'a', log_date: '2026-05-25', hours: 4, work_type: 'Field' },
      { id: '2', user_email: 'a', log_date: '2026-05-26', hours: 2 },
    ];
    const out = aggregateByJob(logs);
    expect(out).toEqual([
      { label: 'Field', hours: 4 },
      { label: 'Other', hours: 2 },
    ]);
  });
});
