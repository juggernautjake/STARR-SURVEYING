// __tests__/hours/period-snapshot.test.ts
//
// The figure frozen into a lock row when somebody decides a week is finished. A closed period keeps
// moving — admins are exempt from locks, hours get adjusted, pay decisions get revised, days get
// added on somebody's behalf — so re-totalling it later answers a different question, and the
// number a payment was made against is unrecoverable without this.
//
// Everything here is about not writing a wrong number into a permanent record.
import { describe, it, expect } from 'vitest';
import { snapshotPeriod, describeSnapshot, type SnapshotEntry } from '@/lib/hours/period-snapshot';

const e = (over: Partial<SnapshotEntry> = {}): SnapshotEntry =>
  ({ user_email: 'a@x.com', hours: 8, status: 'approved', total_pay: 176, ...over });

describe('the total', () => {
  it('sums hours and money across people', () => {
    const s = snapshotPeriod([e(), e({ user_email: 'b@x.com', hours: 6, total_pay: 132 })]);
    expect(s.closed_hours).toBe(14);
    expect(s.closed_pay_cents).toBe(30800);
    expect(s.closed_people).toBe(2);
    expect(s.closed_entry_count).toBe(2);
  });

  it('counts a person once however many days they logged', () => {
    const s = snapshotPeriod([e(), e(), e({ user_email: 'A@X.com' })]);
    expect(s.closed_people).toBe(1);
    expect(s.closed_entry_count).toBe(3);
  });

  it('records money in cents, not dollars', () => {
    // The column is BIGINT. Dollars are a float, and a float frozen into a permanent record is a
    // rounding argument nobody can settle later.
    const s = snapshotPeriod([e({ total_pay: 176.55 })]);
    expect(s.closed_pay_cents).toBe(17655);
    expect(Number.isInteger(s.closed_pay_cents)).toBe(true);
  });
});

describe('the three rules it must not get wrong', () => {
  it('records the hours the approver ALLOWED, not the ones claimed', () => {
    const s = snapshotPeriod([e({ hours: 10, adjusted_hours: 8, status: 'adjusted' })]);
    expect(s.closed_hours).toBe(8);
  });

  it('records the pay a person DECIDED, over the rules’ figure', () => {
    const s = snapshotPeriod([e({ total_pay: 176, pay_decision: { total_pay: 200 } })]);
    expect(s.closed_pay_cents).toBe(20000);
  });

  it('honours a decision of exactly zero', () => {
    // A person deciding a day is worth nothing is a decision, and distinct from no decision.
    const s = snapshotPeriod([e({ total_pay: 176, pay_decision: { total_pay: 0 } })]);
    expect(s.closed_pay_cents).toBe(0);
  });

  it('leaves rejected hours out of the totals but keeps them in the count', () => {
    // Out of the money and the hours: not owed, never going to be paid. In the count: the entry
    // exists, and otherwise rejecting a day after the close would look identical to adding one.
    const s = snapshotPeriod([e(), e({ status: 'rejected', total_pay: null })]);
    expect(s.closed_hours).toBe(8);
    expect(s.closed_pay_cents).toBe(17600);
    expect(s.closed_entry_count).toBe(2);
  });
});

describe('hours with no rate', () => {
  it('add nothing to the money rather than zero', () => {
    // Recording $0 would freeze "worked for free" into a record nobody can correct afterwards.
    const s = snapshotPeriod([e(), e({ total_pay: null, pay_decision: null })]);
    expect(s.closed_hours).toBe(16);
    expect(s.closed_pay_cents).toBe(17600);
  });
});

describe('an empty period', () => {
  it('snapshots as all zeroes rather than nothing', () => {
    // A week that genuinely held nothing is a fact worth recording — it is how you later tell
    // "nobody worked" from "this was closed before we kept snapshots".
    expect(snapshotPeriod([])).toEqual({
      closed_hours: 0, closed_pay_cents: 0, closed_entry_count: 0, closed_people: 0,
    });
  });
});

describe('the sentence on the lock banner', () => {
  it('states what the period held when it closed', () => {
    const line = describeSnapshot(
      { closed_hours: 42, closed_pay_cents: 92400, closed_entry_count: 6, closed_people: 2 }, 6,
    );
    expect(line).toContain('42.0h');
    expect(line).toContain('$924.00');
    expect(line).toContain('2 people');
    expect(line).not.toMatch(/arrived since/);
  });

  it('says how many entries have arrived since', () => {
    const line = describeSnapshot(
      { closed_hours: 42, closed_pay_cents: 92400, closed_entry_count: 6, closed_people: 2 }, 9,
    );
    expect(line).toMatch(/3 entries have arrived since/);
  });

  it('reads correctly for a single late arrival', () => {
    const line = describeSnapshot({ closed_hours: 8, closed_pay_cents: 17600, closed_entry_count: 1, closed_people: 1 }, 2);
    expect(line).toMatch(/1 entry has arrived since/);
    expect(line).toContain('1 person');
  });

  it('says nothing at all for a period closed before snapshots existed', () => {
    // Every lock that already existed. Inventing a figure by re-totalling the week today is exactly
    // what this record exists to prevent.
    expect(describeSnapshot(null, 5)).toBeNull();
    expect(describeSnapshot({}, 5)).toBeNull();
  });

  it('does not report a negative when entries have been deleted since', () => {
    const line = describeSnapshot({ closed_hours: 8, closed_pay_cents: 17600, closed_entry_count: 4, closed_people: 1 }, 2);
    expect(line).not.toMatch(/-2|arrived since/);
  });
});
