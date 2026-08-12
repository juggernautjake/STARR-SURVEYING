// __tests__/marketing/date-range.test.ts
//
// The owner asked for one behaviour by name: *"it should switch on the first of the month to the new
// month every month."* That is a claim about what happens on a specific day, so the tests below
// stand on those days. It is the reason `lib/marketing/date-range.ts` takes the clock as an argument
// rather than reading it — a module that calls `new Date()` internally can only be tested on
// whatever day the suite happens to run, and the rollover is precisely the case you cannot reach.
//
// The emphasis is on boundaries, because the middle of a month is where this code is never wrong:
// month ends of different lengths, February in a leap year, the turn of the year, and the local-vs-
// UTC off-by-one that makes "today" render as yesterday for half of every day.

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_PRESET,
  customRange,
  fromIsoDate,
  granularityFor,
  monthRange,
  rangeFromParams,
  rangeToParams,
  resolvePreset,
  toIsoDate,
  yearRange,
} from '@/lib/marketing/date-range';

/** Local-time constructor, matching how the module builds dates. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

const params = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

describe('the default is the current month, and it rolls over', () => {
  it('shows the month you are in', () => {
    const r = resolvePreset('this-month', at(2026, 8, 11));
    expect(r).toMatchObject({ from: '2026-08-01', to: '2026-08-31', label: 'August 2026' });
  });

  it('switches on the 1st — the behaviour the owner asked for by name', () => {
    // 31 Aug, last moment of the month.
    expect(resolvePreset('this-month', at(2026, 8, 31, 23)).from).toBe('2026-08-01');
    // 1 Sep, first moment. Same code, different answer, no deploy in between.
    const sep = resolvePreset('this-month', at(2026, 9, 1, 0));
    expect(sep).toMatchObject({ from: '2026-09-01', to: '2026-09-30', label: 'September 2026' });
  });

  it('gets month lengths right without a table', () => {
    // Day 0 of the next month. February in a leap year is the one everybody's hand-rolled table
    // gets wrong.
    expect(resolvePreset('this-month', at(2024, 2, 10)).to).toBe('2024-02-29');
    expect(resolvePreset('this-month', at(2026, 2, 10)).to).toBe('2026-02-28');
    expect(resolvePreset('this-month', at(2026, 4, 10)).to).toBe('2026-04-30');
  });

  it('crosses the year boundary', () => {
    expect(resolvePreset('last-month', at(2026, 1, 5))).toMatchObject({
      from: '2025-12-01', to: '2025-12-31', label: 'December 2025',
    });
    expect(resolvePreset('this-year', at(2026, 1, 1)).from).toBe('2026-01-01');
    expect(resolvePreset('last-year', at(2026, 1, 1))).toMatchObject({
      from: '2025-01-01', to: '2025-12-31',
    });
  });
});

describe('narrower periods', () => {
  it('today is a single day', () => {
    const r = resolvePreset('today', at(2026, 8, 11));
    expect(r.from).toBe('2026-08-11');
    expect(r.to).toBe('2026-08-11');
  });

  it('yesterday crosses a month boundary backwards', () => {
    const r = resolvePreset('yesterday', at(2026, 9, 1));
    expect(r.from).toBe('2026-08-31');
  });

  it('weeks start on Monday', () => {
    // 2026-08-11 is a Tuesday; its week starts Monday the 10th.
    const r = resolvePreset('this-week', at(2026, 8, 11));
    expect(r.from).toBe('2026-08-10');
    expect(r.to).toBe('2026-08-16');
  });

  it('a Sunday belongs to the week that started the previous Monday', () => {
    // The off-by-one that a Sunday-start week produces: 2026-08-16 is a Sunday, and treating it as
    // the START of a week would split every Monday-to-Friday campaign across two buckets.
    const r = resolvePreset('this-week', at(2026, 8, 16));
    expect(r.from).toBe('2026-08-10');
  });

  it('last week is the seven days before this one', () => {
    expect(resolvePreset('last-week', at(2026, 8, 11))).toMatchObject({
      from: '2026-08-03', to: '2026-08-09',
    });
  });
});

describe('arbitrary months and years', () => {
  it('any month of any year', () => {
    expect(monthRange(2025, 3)).toMatchObject({
      from: '2025-03-01', to: '2025-03-31', label: 'March 2025',
    });
  });

  it('any year', () => {
    expect(yearRange(2024)).toMatchObject({ from: '2024-01-01', to: '2024-12-31' });
  });

  it('swaps a backwards custom range rather than rejecting it', () => {
    // Picking the end date first is not an error worth an error message.
    expect(customRange('2026-08-20', '2026-08-01')).toMatchObject({
      from: '2026-08-01', to: '2026-08-20',
    });
  });

  it('refuses input that is not a date', () => {
    expect(customRange('last tuesday', '2026-08-01')).toBeNull();
  });
});

describe('local dates, not UTC', () => {
  it('formats the local day, not the UTC one', () => {
    // 23:30 local on the 11th is already the 12th in UTC for anywhere west of Greenwich. Using
    // toISOString() here would render "today" as tomorrow — or, going the other way, as yesterday
    // for the first hours of every day in the Americas.
    expect(toIsoDate(new Date(2026, 7, 11, 23, 30))).toBe('2026-08-11');
    expect(toIsoDate(new Date(2026, 7, 11, 0, 15))).toBe('2026-08-11');
  });

  it('parses YYYY-MM-DD as a local date', () => {
    // `new Date('2026-08-01')` is UTC midnight, which is 31 July in every western timezone.
    const d = fromIsoDate('2026-08-01')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(1);
  });
});

describe('granularity follows the span', () => {
  it('one day is plotted by hour, not as a single bar', () => {
    expect(granularityFor(resolvePreset('today', at(2026, 8, 11)))).toBe('hour');
  });

  it('a month is plotted by day', () => {
    expect(granularityFor(resolvePreset('this-month', at(2026, 8, 11)))).toBe('day');
  });

  it('a year is plotted by month, not 365 unreadable bars', () => {
    expect(granularityFor(resolvePreset('this-year', at(2026, 8, 11)))).toBe('month');
  });

  it('a quarter-ish span falls to weeks', () => {
    expect(granularityFor(customRange('2026-01-01', '2026-04-30')!)).toBe('week');
  });
});

describe('the URL round-trip', () => {
  it('stores a preset by NAME so a bookmark keeps rolling over', () => {
    // The important one. `?preset=this-month` shows September in September; storing the resolved
    // dates instead would pin that bookmark to August for ever.
    const r = resolvePreset('last-month', at(2026, 8, 11));
    expect(rangeToParams(r)).toEqual({ preset: 'last-month' });
  });

  it('stores a custom range by its dates, because that is what it means', () => {
    expect(rangeToParams(customRange('2026-03-01', '2026-03-15')!)).toEqual({
      preset: 'custom', from: '2026-03-01', to: '2026-03-15',
    });
  });

  it('leaves the default out of the URL', () => {
    expect(rangeToParams(resolvePreset(DEFAULT_PRESET, at(2026, 8, 11)))).toEqual({});
  });

  it('reads a preset back and re-resolves it against the CURRENT clock', () => {
    const read = rangeFromParams(params({ preset: 'this-month' }), at(2026, 12, 5));
    expect(read.from).toBe('2026-12-01');
  });

  it('reads a custom range back verbatim', () => {
    const read = rangeFromParams(
      params({ preset: 'custom', from: '2025-06-01', to: '2025-06-30' }),
      at(2026, 8, 11),
    );
    expect(read).toMatchObject({ from: '2025-06-01', to: '2025-06-30', preset: 'custom' });
  });

  it('falls back to the default rather than rendering an empty page', () => {
    // A hand-edited or truncated link should land somewhere useful. An unresolvable range renders
    // as "no data", which is indistinguishable from a real empty month.
    for (const bad of [{}, { preset: 'nonsense' }, { preset: 'custom' }, { from: 'x', to: 'y' }]) {
      const read = rangeFromParams(params(bad as Record<string, string>), at(2026, 8, 11));
      expect(read.from).toBe('2026-08-01');
    }
  });
});
