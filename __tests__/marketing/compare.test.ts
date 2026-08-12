// __tests__/marketing/compare.test.ts — A5. What a KPI delta may compare itself against.
//
// Every case here fails as a CONFIDENT ARROW POINTING THE WRONG WAY, which is worse than a blank
// tile: a delta is one number with no visible working, and everybody reads it.

import { describe, it, expect } from 'vitest';
import { METRIC_DIRECTION, deltaOf, previousPeriod } from '@/lib/marketing/compare';

const on = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe('previousPeriod — a part-month is never compared against a whole one', () => {
  it('compares the elapsed days only, when the month is still running', () => {
    // THE bug this function exists to prevent. On the 12th, August has 12 days of spend. Fetching
    // all 31 days of July reports a 60% collapse that is purely the calendar — the tile invents a
    // crisis out of the fact that the month is not over.
    const p = previousPeriod({ from: '2026-08-01', to: '2026-08-31' }, on(2026, 8, 12))!;
    expect(p.from).toBe('2026-07-01');
    expect(p.to).toBe('2026-07-12');
    expect(p.partial).toBe(true);
    // And it says which July, rather than "vs last month" — a baseline nobody can check.
    expect(p.label).toBe('vs 1–12 Jul');
  });

  it('compares the whole month once the month is over', () => {
    // July, viewed in August: the predecessor is all of June — 30 days against 31, which is the
    // honest comparison for two finished months and exactly what "month over month" means.
    const p = previousPeriod({ from: '2026-07-01', to: '2026-07-31' }, on(2026, 8, 12))!;
    expect(p.from).toBe('2026-06-01');
    expect(p.to).toBe('2026-06-30');
    expect(p.partial).toBe(false);
  });

  it('has nothing to compare for a range entirely in the future', () => {
    // A delta on a period that cannot have data yet is a number about nothing.
    expect(previousPeriod({ from: '2027-01-01', to: '2027-01-31' }, on(2026, 8, 12))).toBeNull();
  });
});

describe('previousPeriod — it steps by the calendar, not by a day count', () => {
  it('steps March back to February, not to late January', () => {
    // Subtracting the range's 31-day length from 1 March lands on 29 January. A "month over month"
    // that compares March against 29 Jan – 28 Feb is wrong in a way nobody notices, because the
    // number it produces looks entirely reasonable.
    const p = previousPeriod({ from: '2026-03-01', to: '2026-03-31' }, on(2026, 4, 15))!;
    expect(p.from).toBe('2026-02-01');
    expect(p.to).toBe('2026-02-28');
  });

  it('does not ask February for a 31st', () => {
    // A full 31-day March compared against February must stop at the 28th rather than rolling
    // forward into March and comparing March with part of itself.
    const p = previousPeriod({ from: '2026-03-01', to: '2026-03-31' }, on(2026, 3, 31))!;
    expect(p.to).toBe('2026-02-28');
  });

  it('steps a whole year back a year', () => {
    // A finished year against the whole of the year before it.
    const p = previousPeriod({ from: '2025-01-01', to: '2025-12-31' }, on(2026, 8, 12))!;
    expect(p.from).toBe('2024-01-01');
    expect(p.to).toBe('2024-12-31');

    // And a year in progress against the same elapsed stretch of the previous one: on 12 Feb, 43
    // days of 2026 are compared with 1 Jan – 12 Feb 2025, not with all of it.
    const q = previousPeriod({ from: '2026-01-01', to: '2026-12-31' }, on(2026, 2, 12))!;
    expect(q.from).toBe('2025-01-01');
    expect(q.to).toBe('2025-02-12');
  });

  it('steps a week back by its own length', () => {
    // A week has no calendar identity to preserve, so length-stepping IS correct here.
    const p = previousPeriod({ from: '2026-08-03', to: '2026-08-09' }, on(2026, 8, 20))!;
    expect(p.from).toBe('2026-07-27');
    expect(p.to).toBe('2026-08-02');
  });

  it('steps a single day back one day', () => {
    const p = previousPeriod({ from: '2026-08-11', to: '2026-08-11' }, on(2026, 8, 12))!;
    expect(p.from).toBe('2026-08-10');
    expect(p.to).toBe('2026-08-10');
    expect(p.label).toBe('vs 10 Aug');
  });

  it('labels a comparison that crosses a month boundary with both months', () => {
    const p = previousPeriod({ from: '2026-01-05', to: '2026-01-11' }, on(2026, 2, 1))!;
    expect(p.label).toBe('vs 29 Dec – 4 Jan');
  });
});

describe('deltaOf — a rise from zero is not a percentage', () => {
  it('returns a null ratio rather than +18000%', () => {
    // The silliest number on real dashboards. $0 → $180 is "up from nothing", not a percentage,
    // and printing one makes every other figure on the page look unconsidered.
    const d = deltaOf(180, 0, 'up');
    expect(d.ratio).toBeNull();
    expect(d.absolute).toBe(180);
  });

  it('computes an ordinary change against the previous value', () => {
    expect(deltaOf(120, 100, 'up').ratio).toBeCloseTo(0.2);
    expect(deltaOf(80, 100, 'up').ratio).toBeCloseTo(-0.2);
  });
});

describe('deltaOf — direction belongs to the metric', () => {
  it('calls more clicks good and fewer clicks bad', () => {
    expect(deltaOf(120, 100, 'up').tone).toBe('good');
    expect(deltaOf(80, 100, 'up').tone).toBe('bad');
  });

  it('inverts for a cost metric', () => {
    // A rising cost per click is bad news wearing a rising number. A page that colours every
    // increase green congratulates the account for getting more expensive.
    expect(deltaOf(1.2, 1.0, 'down').tone).toBe('bad');
    expect(deltaOf(0.8, 1.0, 'down').tone).toBe('good');
  });

  it('has NO opinion about spend', () => {
    // Spending more is what happens when you scale a campaign that works. Spending less is what
    // happens when the card expires. Green and red both lie, so neither is used.
    expect(METRIC_DIRECTION.spend).toBe('neutral');
    expect(deltaOf(500, 100, 'neutral').tone).toBe('neutral');
    expect(deltaOf(100, 500, 'neutral').tone).toBe('neutral');
  });

  it('has no tone for no change', () => {
    // Colouring a flat month green because "up is good" claims an improvement that did not happen.
    expect(deltaOf(100, 100, 'up').tone).toBe('neutral');
  });
});

describe('previousPeriod — a FINISHED period gets the whole previous one', () => {
  // Found by the leap-year case while writing these. Doing everything by elapsed days looks tidier
  // and silently drops days whenever the two periods differ in length — and nothing surfaces it,
  // because the comparison still returns a plausible number.

  it('gives a finished year ALL of the previous year, leap day included', () => {
    // 2025 has 365 days, 2024 has 366. Stepping by elapsed length would compare against
    // 1 Jan – 30 Dec 2024 and quietly discard 31 December.
    const p = previousPeriod({ from: '2025-01-01', to: '2025-12-31' }, new Date(2026, 5, 1))!;
    expect(p.from).toBe('2024-01-01');
    expect(p.to).toBe('2024-12-31');
  });

  it('gives a finished 30-day month ALL of a 31-day predecessor', () => {
    // June against May: 30 elapsed days would take 1–30 May and drop the 31st.
    const p = previousPeriod({ from: '2026-06-01', to: '2026-06-30' }, new Date(2026, 7, 1))!;
    expect(p.from).toBe('2026-05-01');
    expect(p.to).toBe('2026-05-31');
  });

  it('still truncates February for a finished 31-day month', () => {
    // The other direction: the previous period is SHORTER, and asking it for a 31st rolls into
    // March and compares a month against part of itself.
    const p = previousPeriod({ from: '2026-03-01', to: '2026-03-31' }, new Date(2026, 5, 1))!;
    expect(p.to).toBe('2026-02-28');
  });
});
