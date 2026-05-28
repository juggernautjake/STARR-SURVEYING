// __tests__/schedule/recurrence.test.ts
//
// Unit tests for lib/schedule/recurrence.ts — the RRULE expander backing
// Slice 26's recurring schedule events. The hand-rolled parser supports
// only the subset of RFC 5545 that the schedule UI exposes, so the
// tests pin that subset.
//
// The expander has a few non-obvious correctness properties worth
// regression-pinning:
//   * The 366-occurrence hard cap (a stuck loop should never expand
//     forever).
//   * BYDAY weekly expansion: walks each calendar week and emits every
//     weekday named in BYDAY, regardless of which day the series
//     started on (so a Mon-start with BYDAY=MO,WE,FR still emits the
//     Wed + Fri of that first week).
//   * `recurrence_end` and `UNTIL` and the windowTo arg all clip the
//     expansion — the earliest of the three wins.
//   * The window is half-open: occurrences whose start is exactly
//     equal to windowTo are excluded (`>= stop`).

import { describe, it, expect } from 'vitest';
import { parseRRule, expandRecurrence } from '@/lib/schedule/recurrence';

describe('parseRRule', () => {
  it('parses a simple DAILY rule', () => {
    expect(parseRRule('FREQ=DAILY')).toEqual({ freq: 'DAILY', interval: 1 });
  });

  it('parses WEEKLY with INTERVAL', () => {
    expect(parseRRule('FREQ=WEEKLY;INTERVAL=2')).toEqual({
      freq: 'WEEKLY',
      interval: 2,
    });
  });

  it('parses WEEKLY with BYDAY MoWeFr → [1,3,5]', () => {
    const r = parseRRule('FREQ=WEEKLY;BYDAY=MO,WE,FR');
    expect(r).not.toBeNull();
    expect(r!.byDay).toEqual([1, 3, 5]);
  });

  it('parses COUNT', () => {
    const r = parseRRule('FREQ=DAILY;COUNT=10');
    expect(r!.count).toBe(10);
  });

  it('parses UNTIL in the YYYYMMDDTHHMMSSZ form', () => {
    const r = parseRRule('FREQ=DAILY;UNTIL=20260601T235959Z');
    expect(r!.until!.toISOString()).toBe('2026-06-01T23:59:59.000Z');
  });

  it('parses UNTIL in the shorter YYYYMMDD form (defaults to end-of-day)', () => {
    const r = parseRRule('FREQ=DAILY;UNTIL=20260601');
    expect(r!.until!.toISOString()).toBe('2026-06-01T23:59:59.000Z');
  });

  it('rejects an unknown FREQ', () => {
    expect(parseRRule('FREQ=YEARLY')).toBeNull();
  });

  it('rejects a malformed input (no FREQ)', () => {
    expect(parseRRule('INTERVAL=2;BYDAY=MO')).toBeNull();
  });

  it('clamps INTERVAL=0 to 1 (defensive: 0 would infinite-loop the expander)', () => {
    const r = parseRRule('FREQ=DAILY;INTERVAL=0');
    expect(r!.interval).toBe(1);
  });

  it('is case-insensitive on tokens', () => {
    expect(parseRRule('freq=daily;interval=3')).toEqual({
      freq: 'DAILY',
      interval: 3,
    });
  });
});

// Helper — builds the four-field input the expander needs.
const event = (start: string, end: string, rule: string | null, recurrenceEnd: string | null = null) => ({
  start_time: start,
  end_time: end,
  recurrence_rule: rule,
  recurrence_end: recurrenceEnd,
});

describe('expandRecurrence — DAILY', () => {
  it('returns empty when there is no recurrence rule', () => {
    const out = expandRecurrence(
      event('2026-06-01T09:00:00.000Z', '2026-06-01T10:00:00.000Z', null),
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-06-10T00:00:00.000Z'),
    );
    expect(out).toEqual([]);
  });

  it('emits one occurrence per day inside the window', () => {
    const out = expandRecurrence(
      event('2026-06-01T09:00:00.000Z', '2026-06-01T10:00:00.000Z', 'FREQ=DAILY'),
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-06-04T00:00:00.000Z'),
    );
    // Mon Jun 1, Tue Jun 2, Wed Jun 3 — windowTo is exclusive.
    expect(out).toHaveLength(3);
    expect(out[0].start_time).toBe('2026-06-01T09:00:00.000Z');
    expect(out[2].start_time).toBe('2026-06-03T09:00:00.000Z');
  });

  it('honors INTERVAL=2 (every other day)', () => {
    const out = expandRecurrence(
      event('2026-06-01T09:00:00.000Z', '2026-06-01T10:00:00.000Z', 'FREQ=DAILY;INTERVAL=2'),
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-06-08T00:00:00.000Z'),
    );
    // Jun 1, 3, 5, 7 — four occurrences.
    expect(out.map(o => o.start_time)).toEqual([
      '2026-06-01T09:00:00.000Z',
      '2026-06-03T09:00:00.000Z',
      '2026-06-05T09:00:00.000Z',
      '2026-06-07T09:00:00.000Z',
    ]);
  });

  it('honors COUNT', () => {
    const out = expandRecurrence(
      event('2026-06-01T09:00:00.000Z', '2026-06-01T10:00:00.000Z', 'FREQ=DAILY;COUNT=3'),
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-12-31T00:00:00.000Z'),
    );
    expect(out).toHaveLength(3);
  });

  it('honors UNTIL (clips earlier than windowTo)', () => {
    const out = expandRecurrence(
      event('2026-06-01T09:00:00.000Z', '2026-06-01T10:00:00.000Z', 'FREQ=DAILY;UNTIL=20260603'),
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-06-30T00:00:00.000Z'),
    );
    // Jun 1, 2, 3 — UNTIL ends 6/3 23:59:59 inclusive.
    expect(out).toHaveLength(3);
  });
});

describe('expandRecurrence — WEEKLY with BYDAY', () => {
  it('emits MoWeFr starting from a Monday', () => {
    // 2026-06-01 is a Monday.
    const out = expandRecurrence(
      event('2026-06-01T09:00:00.000Z', '2026-06-01T10:00:00.000Z', 'FREQ=WEEKLY;BYDAY=MO,WE,FR'),
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-06-08T00:00:00.000Z'),
    );
    // Mon 6/1, Wed 6/3, Fri 6/5 — three days that week.
    expect(out).toHaveLength(3);
    expect(out.map(o => o.start_time)).toEqual([
      '2026-06-01T09:00:00.000Z',
      '2026-06-03T09:00:00.000Z',
      '2026-06-05T09:00:00.000Z',
    ]);
  });

  it('does NOT emit days earlier in the start-week than the series start', () => {
    // 2026-06-03 is a Wednesday. BYDAY=MO,WE,FR should NOT back-fill Mon 6/1.
    const out = expandRecurrence(
      event('2026-06-03T09:00:00.000Z', '2026-06-03T10:00:00.000Z', 'FREQ=WEEKLY;BYDAY=MO,WE,FR'),
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-06-08T00:00:00.000Z'),
    );
    // Wed 6/3 + Fri 6/5 only (Mon 6/1 is excluded).
    expect(out.map(o => o.start_time)).toEqual([
      '2026-06-03T09:00:00.000Z',
      '2026-06-05T09:00:00.000Z',
    ]);
  });

  it('skips a week with INTERVAL=2', () => {
    const out = expandRecurrence(
      event('2026-06-01T09:00:00.000Z', '2026-06-01T10:00:00.000Z', 'FREQ=WEEKLY;BYDAY=MO;INTERVAL=2'),
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-06-22T00:00:00.000Z'),
    );
    // Mon 6/1, Mon 6/15 — 6/8 is skipped.
    expect(out.map(o => o.start_time)).toEqual([
      '2026-06-01T09:00:00.000Z',
      '2026-06-15T09:00:00.000Z',
    ]);
  });
});

describe('expandRecurrence — MONTHLY', () => {
  it('emits the same calendar-day each month', () => {
    const out = expandRecurrence(
      event('2026-06-15T09:00:00.000Z', '2026-06-15T10:00:00.000Z', 'FREQ=MONTHLY'),
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-09-01T00:00:00.000Z'),
    );
    expect(out.map(o => o.start_time)).toEqual([
      '2026-06-15T09:00:00.000Z',
      '2026-07-15T09:00:00.000Z',
      '2026-08-15T09:00:00.000Z',
    ]);
  });
});

describe('expandRecurrence — window + clip edges', () => {
  it('treats windowTo as exclusive (>=)', () => {
    // Window ends exactly when an occurrence starts → that occurrence is excluded.
    const out = expandRecurrence(
      event('2026-06-01T09:00:00.000Z', '2026-06-01T10:00:00.000Z', 'FREQ=DAILY'),
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-06-03T09:00:00.000Z'),
    );
    // Jun 1, Jun 2 only — Jun 3 09:00 is excluded.
    expect(out).toHaveLength(2);
  });

  it('caps at 366 occurrences (defensive against runaway expansion)', () => {
    // Two years of daily expansion should be hard-capped to 366.
    const out = expandRecurrence(
      event('2024-01-01T09:00:00.000Z', '2024-01-01T10:00:00.000Z', 'FREQ=DAILY'),
      new Date('2024-01-01T00:00:00.000Z'),
      new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(out).toHaveLength(366);
  });

  it('honors recurrence_end (column) when it is the tightest bound', () => {
    const out = expandRecurrence(
      event('2026-06-01T09:00:00.000Z', '2026-06-01T10:00:00.000Z', 'FREQ=DAILY', '2026-06-03T23:59:59.000Z'),
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-12-31T00:00:00.000Z'),
    );
    // recurrence_end clips at 6/3 — three occurrences.
    expect(out).toHaveLength(3);
  });
});
