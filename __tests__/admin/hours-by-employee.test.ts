// The approvals queue, arranged by person.
//
// Owner, 2026-09-19: "I want it so that the employees with pending hours are listed first, with the
// employee with the most recently clocked hours being at the top … underneath there names it will
// show how many hours they have clocked that are in need of approval … How many hours have been
// logged for that week, how many have been approved, how many have been paid."
import { describe, it, expect } from 'vitest';
import { groupByEmployee, payableHours, formatLunch, nameFromEmail } from '@/lib/hours/by-employee';

const log = (o: Partial<Parameters<typeof groupByEmployee>[0][number]> & { id: string }) => ({
  user_email: 'john@starr.com',
  log_date: '2026-09-16',
  hours: 8,
  status: 'pending',
  created_at: '2026-09-16T17:00:00Z',
  ...o,
});

describe('which hours count', () => {
  it('uses what was clocked', () => {
    expect(payableHours({ id: '1', user_email: 'a', log_date: '2026-09-16', hours: 8 })).toBe(8);
  });

  it('prefers what the approver decided', () => {
    // How an approver says "you clocked nine, I am paying eight" — including when the reason is a
    // lunch break, which is never subtracted automatically.
    expect(payableHours({ id: '1', user_email: 'a', log_date: '2026-09-16', hours: 9, adjusted_hours: 8 })).toBe(8);
  });

  it('survives the numbers arriving as strings', () => {
    // `numeric` columns come back from the driver as strings often enough that a silent NaN here
    // would zero somebody's week.
    expect(payableHours({ id: '1', user_email: 'a', log_date: '2026-09-16', hours: '7.5' })).toBe(7.5);
    expect(payableHours({ id: '1', user_email: 'a', log_date: '2026-09-16', hours: null })).toBe(0);
    expect(payableHours({ id: '1', user_email: 'a', log_date: '2026-09-16', hours: 'abc' })).toBe(0);
  });
});

describe('grouping a queue by person', () => {
  it('puts anybody with pending hours above anybody without', () => {
    const out = groupByEmployee([
      log({ id: '1', user_email: 'settled@starr.com', status: 'approved', created_at: '2026-09-19T17:00:00Z' }),
      log({ id: '2', user_email: 'waiting@starr.com', status: 'pending', created_at: '2026-09-16T17:00:00Z' }),
    ]);
    // Even though `settled` clocked more recently: approving is the job of this page.
    expect(out.map((g) => g.email)).toEqual(['waiting@starr.com', 'settled@starr.com']);
  });

  it('orders by who clocked most recently within each half', () => {
    const out = groupByEmployee([
      log({ id: '1', user_email: 'older@starr.com', created_at: '2026-09-14T17:00:00Z' }),
      log({ id: '2', user_email: 'newest@starr.com', created_at: '2026-09-19T08:00:00Z' }),
      log({ id: '3', user_email: 'middle@starr.com', created_at: '2026-09-17T17:00:00Z' }),
    ]);
    expect(out.map((g) => g.email)).toEqual(['newest@starr.com', 'middle@starr.com', 'older@starr.com']);
  });

  it('measures recency by when the row arrived, not when it was touched', () => {
    // An approver editing a three-week-old entry must not vault that person to the top of a queue
    // ordered by who worked most recently.
    const out = groupByEmployee([
      log({ id: '1', user_email: 'a@starr.com', created_at: '2026-09-01T09:00:00Z', updated_at: '2026-09-19T23:00:00Z' }),
      log({ id: '2', user_email: 'b@starr.com', created_at: '2026-09-18T09:00:00Z' }),
    ]);
    expect(out[0]!.email).toBe('b@starr.com');
  });

  it('counts the four figures the header shows', () => {
    const out = groupByEmployee([
      log({ id: '1', hours: 8, status: 'pending' }),
      log({ id: '2', hours: 6, status: 'approved' }),
      log({ id: '3', hours: 4, status: 'approved' }),
      log({ id: '4', hours: 2, status: 'rejected' }),
    ], { isPaid: (l) => l.id === '2' });
    const g = out[0]!;
    expect(g.loggedHours, 'everything on the timesheet, whatever its state').toBe(20);
    expect(g.pendingHours).toBe(8);
    expect(g.pendingCount).toBe(1);
    expect(g.approvedHours).toBe(10);
    expect(g.paidHours).toBe(6);
  });

  it('counts an adjusted day as decided, not as waiting', () => {
    // An approver changed the number and accepted it. That is a decision, and a row that showed up
    // as still-pending afterwards would make the queue never empty.
    const out = groupByEmployee([log({ id: '1', hours: 9, adjusted_hours: 8, status: 'adjusted' })]);
    expect(out[0]!.pendingCount).toBe(0);
    expect(out[0]!.approvedHours, 'and at the adjusted figure').toBe(8);
  });

  it('keeps somebody with nothing pending, because the stats are the point by then', () => {
    const out = groupByEmployee([log({ id: '1', status: 'approved' })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.pendingCount).toBe(0);
  });

  it('never invents a person for a row with no email', () => {
    const out = groupByEmployee([log({ id: '1', user_email: null }), log({ id: '2', user_email: '  ' })]);
    expect(out).toEqual([]);
  });

  it('treats one person written two ways as one person', () => {
    const out = groupByEmployee([
      log({ id: '1', user_email: 'John@Starr.com' }),
      log({ id: '2', user_email: 'john@starr.com ' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.logs).toHaveLength(2);
  });

  it('shows a person’s own days newest first', () => {
    const out = groupByEmployee([
      log({ id: 'old', created_at: '2026-09-14T09:00:00Z' }),
      log({ id: 'new', created_at: '2026-09-18T09:00:00Z' }),
    ]);
    expect(out[0]!.logs.map((l) => l.id)).toEqual(['new', 'old']);
  });

  it('is stable when two people are equally recent', () => {
    // Otherwise the rows reorder between renders depending on what the database happened to return
    // first, and a list that moves under the cursor is a list you misclick.
    const same = '2026-09-18T09:00:00Z';
    const out = groupByEmployee([
      log({ id: '1', user_email: 'zoe@starr.com', created_at: same }),
      log({ id: '2', user_email: 'adam@starr.com', created_at: same }),
    ]);
    expect(out.map((g) => g.email)).toEqual(['adam@starr.com', 'zoe@starr.com']);
  });
});

describe('lunch on a timesheet', () => {
  it('adds up the minutes and counts the days that reported one', () => {
    const out = groupByEmployee([
      log({ id: '1', lunch_minutes: 30 }),
      log({ id: '2', lunch_minutes: 45 }),
      log({ id: '3' }),
    ]);
    expect(out[0]!.lunchMinutes).toBe(75);
    expect(out[0]!.lunchDays, 'the third day was never asked').toBe(2);
  });

  it('tells "no lunch taken" apart from "never asked"', () => {
    // 0 is an answer somebody gave; null is a question nobody put to them. An approver reading a
    // timesheet needs to know which of those they are looking at.
    const out = groupByEmployee([log({ id: '1', lunch_minutes: 0 }), log({ id: '2', lunch_minutes: null })]);
    expect(out[0]!.lunchDays).toBe(1);
    expect(out[0]!.lunchMinutes).toBe(0);
  });

  it('never subtracts lunch from the hours', () => {
    // Confirmed with the owner: recorded, not deducted. The approver decides, and `adjusted_hours`
    // is the column that moves when they do.
    const out = groupByEmployee([log({ id: '1', hours: 9, lunch_minutes: 60 })]);
    expect(out[0]!.loggedHours).toBe(9);
  });

  it('reads as time, not as a decimal', () => {
    expect(formatLunch(45)).toBe('45m');
    expect(formatLunch(60)).toBe('1h');
    expect(formatLunch(105)).toBe('1h 45m');
    expect(formatLunch(0)).toBe('—');
    expect(formatLunch(Number.NaN)).toBe('—');
  });
});

describe('putting a name to an address', () => {
  it('reads a name out of the local part', () => {
    expect(nameFromEmail('john.smith@starr.com')).toBe('John Smith');
    expect(nameFromEmail('jacob_maddux@starr.com')).toBe('Jacob Maddux');
    expect(nameFromEmail('john@starr.com')).toBe('John');
  });

  it('falls back to the address rather than to nothing', () => {
    expect(nameFromEmail('@starr.com')).toBe('@starr.com');
    expect(nameFromEmail('')).toBe('');
  });
});
