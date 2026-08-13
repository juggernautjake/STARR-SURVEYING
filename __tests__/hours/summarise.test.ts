// __tests__/hours/summarise.test.ts
//
// Totals by day, week, month and year — the owner's *"review their hours by day, week, month, and
// year."*
//
// Three of these tests exist because the obvious implementation is wrong in a way that only shows up
// on somebody's pay:
//
//   * summing `hours` reports what the employee CLAIMED, not what the approver allowed;
//   * summing `total_pay` reports what the rules priced, not what a person decided;
//   * parsing '2026-08-01' into a Date puts it in July for anybody west of Greenwich.
import { describe, it, expect } from 'vitest';
import { summariseHours, totalOf, labelFor, decidedPay, type SummarisableLog } from '@/lib/hours/summarise';

const log = (over: Partial<SummarisableLog> = {}): SummarisableLog => ({
  log_date: '2026-08-11', hours: 8, status: 'approved', total_pay: 176, ...over,
});

describe('grouping', () => {
  const logs = [
    log({ log_date: '2026-08-10' }),
    log({ log_date: '2026-08-11' }),
    log({ log_date: '2026-08-17' }),
    log({ log_date: '2026-09-01' }),
    log({ log_date: '2025-12-31' }),
  ];

  it('gives every day its own bucket', () => {
    expect(summariseHours(logs, 'day')).toHaveLength(5);
  });

  it('groups a week onto its Monday', () => {
    // 10 and 11 August 2026 are Monday and Tuesday; the 17th is the next Monday.
    const weeks = summariseHours(logs, 'week');
    const w = weeks.find((b) => b.key === '2026-08-10')!;
    expect(w.entries).toBe(2);
    expect(w.from).toBe('2026-08-10');
    expect(w.to).toBe('2026-08-16');
  });

  it('groups by month and reports the month’s real last day', () => {
    const months = summariseHours(logs, 'month');
    const aug = months.find((b) => b.key === '2026-08')!;
    expect(aug.entries).toBe(3);
    expect(aug.from).toBe('2026-08-01');
    expect(aug.to).toBe('2026-08-31');
    expect(months.find((b) => b.key === '2026-09')!.to).toBe('2026-09-30');
  });

  it('gets February right in a leap year', () => {
    const [feb] = summariseHours([log({ log_date: '2028-02-15' })], 'month');
    expect(feb.to).toBe('2028-02-29');
  });

  it('groups by year', () => {
    const years = summariseHours(logs, 'year');
    expect(years.map((b) => b.key)).toEqual(['2026', '2025']);
    expect(years[0].entries).toBe(4);
  });

  it('returns the most recent period first', () => {
    const days = summariseHours(logs, 'day');
    expect(days[0].key).toBe('2026-09-01');
    expect(days[days.length - 1].key).toBe('2025-12-31');
  });
});

describe('the timezone trap', () => {
  it('keeps the first of the month in that month', () => {
    // `new Date('2026-08-01')` is midnight UTC — 31 July locally anywhere west of Greenwich. A day
    // landing in the wrong month is not a rounding error on a payroll screen.
    const [b] = summariseHours([log({ log_date: '2026-08-01' })], 'month');
    expect(b.key).toBe('2026-08');
  });

  it('keeps New Year’s Day in the right year', () => {
    const [b] = summariseHours([log({ log_date: '2026-01-01' })], 'year');
    expect(b.key).toBe('2026');
  });

  it('puts a Sunday in the week that began the previous Monday', () => {
    // 16 August 2026 is a Sunday. A Sunday-based week would file it with the following Monday and
    // split somebody's weekend across two pay weeks.
    const [b] = summariseHours([log({ log_date: '2026-08-16' })], 'week');
    expect(b.key).toBe('2026-08-10');
  });
});

describe('an adjusted entry counts as adjusted', () => {
  it('totals the allowed hours, not the claimed ones', () => {
    // The approver cut 10h to 8h. Summing `hours` would report the claim as though it had been
    // agreed — the same defect already fixed on the approval page's totals.
    const [b] = summariseHours([log({ hours: 10, adjusted_hours: 8, status: 'adjusted' })], 'day');
    expect(b.hours).toBe(8);
  });
});

describe('the pay a person decided outranks the pay the rules computed', () => {
  it('uses the decision when there is one', () => {
    const [b] = summariseHours([log({ total_pay: 176, pay_decision: { total_pay: 200 } })], 'day');
    expect(b.pay).toBe(200);
  });

  it('falls back to the rules when nobody has decided', () => {
    expect(summariseHours([log({ total_pay: 176, pay_decision: null })], 'day')[0].pay).toBe(176);
  });

  it('honours a decision of exactly zero', () => {
    // A person deciding a day is worth nothing is a decision. Treating 0 as "no decision" would
    // silently pay it at the rules' rate instead.
    expect(decidedPay(log({ total_pay: 176, pay_decision: { total_pay: 0 } }))).toBe(0);
  });
});

describe('hours with no rate are not hours worth $0', () => {
  it('counts them separately rather than as zero pay', () => {
    // An hour with no rate is waiting on somebody to say what it is worth. An hour priced at zero is
    // a decision that it is worth nothing. A screen that cannot tell them apart reports unpaid work
    // as settled.
    const [b] = summariseHours([
      log({ total_pay: 176 }),
      log({ total_pay: null, pay_decision: null }),
    ], 'day');
    expect(b.pay).toBe(176);
    expect(b.unpricedHours).toBe(8);
    expect(b.hours).toBe(16);
  });
});

describe('statuses', () => {
  const mixed = [
    log({ status: 'approved' }),
    log({ status: 'pending' }),
    log({ status: 'disputed' }),
    log({ status: 'rejected' }),
    log({ status: 'adjusted', hours: 10, adjusted_hours: 6 }),
  ];

  it('keeps rejected hours out of the total', () => {
    // Rejected hours are not worth anything and are not owed. Including them would overstate both
    // the work done and the money due.
    const [b] = summariseHours(mixed, 'day');
    expect(b.rejectedHours).toBe(8);
    expect(b.hours).toBe(8 + 8 + 8 + 6);
  });

  it('splits what is settled from what is still waiting on somebody', () => {
    const [b] = summariseHours(mixed, 'day');
    expect(b.awaitingHours).toBe(16);   // pending + disputed
    expect(b.settledHours).toBe(14);    // approved + adjusted(6)
    expect(b.awaitingHours + b.settledHours).toBe(b.hours);
  });

  it('counts every entry, including the rejected one', () => {
    expect(summariseHours(mixed, 'day')[0].entries).toBe(5);
  });
});

describe('robustness', () => {
  it('drops a row with an unusable date rather than guessing at one', () => {
    // A day appearing in the wrong period is worse than one missing from a total that says how many
    // entries it counted.
    const out = summariseHours([log(), log({ log_date: '' }), log({ log_date: 'yesterday' })], 'day');
    expect(out).toHaveLength(1);
    expect(out[0].entries).toBe(1);
  });

  it('returns nothing for no logs', () => {
    expect(summariseHours([], 'month')).toEqual([]);
  });

  it('does not accumulate floating-point dust across a year', () => {
    const logs = Array.from({ length: 30 }, () => log({ hours: 7.35, total_pay: 161.7 }));
    const [b] = summariseHours(logs, 'year');
    expect(b.hours).toBe(220.5);
    expect(b.pay).toBe(4851);
  });
});

describe('the line at the top of the screen', () => {
  it('sums the buckets and spans their whole range', () => {
    const buckets = summariseHours([
      log({ log_date: '2026-08-03' }),
      log({ log_date: '2026-08-11' }),
    ], 'week');
    const t = totalOf(buckets);
    expect(t.hours).toBe(16);
    expect(t.pay).toBe(352);
    expect(t.entries).toBe(2);
    expect(t.from).toBe('2026-08-03');
    expect(t.to).toBe('2026-08-16');
  });

  it('is all zeroes for nothing', () => {
    expect(totalOf([])).toMatchObject({ hours: 0, pay: 0, entries: 0 });
  });
});

describe('labels', () => {
  it('names each grain in a way a person reads', () => {
    const [d] = summariseHours([log({ log_date: '2026-08-11' })], 'day');
    expect(labelFor(d, 'day')).toContain('2026');
    const [m] = summariseHours([log({ log_date: '2026-08-11' })], 'month');
    expect(labelFor(m, 'month')).toMatch(/August 2026/);
    const [y] = summariseHours([log({ log_date: '2026-08-11' })], 'year');
    expect(labelFor(y, 'year')).toBe('2026');
  });

  it('shows a week as the span it covers', () => {
    const [w] = summariseHours([log({ log_date: '2026-08-11' })], 'week');
    expect(labelFor(w, 'week')).toContain('–');
  });
});
