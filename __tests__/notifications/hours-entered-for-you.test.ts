// __tests__/notifications/hours-entered-for-you.test.ts
//
// The first write to a person's timesheet that they did not make.
//
// It arrives already approved, so there is no decision coming and no queue anybody will look at. If
// this notification does not fire, eight hours and a rate land on somebody's pay with nothing
// anywhere recording that it happened — and the person most likely to spot that it is wrong is the
// one who worked the day.
import { describe, it, expect } from 'vitest';
import { buildHoursEnteredForYouNotification } from '@/lib/notifications/hours-entered-for-you';

describe('telling an employee the office entered their hours', () => {
  it('names the hours, the day, who entered it, and the pay', () => {
    const n = buildHoursEnteredForYouNotification({
      employeeEmail: 'jack@x.com',
      enteredBy: 'jacob@x.com',
      logDate: '2026-08-11',
      hours: 6,
      payDollars: 132,
    });
    expect(n).not.toBeNull();
    expect(n!.user_email).toBe('jack@x.com');
    expect(n!.body).toContain('6h');
    expect(n!.body).toContain('2026-08-11');
    // Somebody to ask. A notification about money with no author is a dead end.
    expect(n!.body).toContain('jacob@x.com');
    expect(n!.body).toContain('$132.00');
    expect(n!.link).toBe('/admin/my-hours');
  });

  it('says the entry is already approved', () => {
    // It changes what the person should do: no decision is coming, so saying it is wrong NOW is the
    // only remaining step.
    const n = buildHoursEnteredForYouNotification({
      employeeEmail: 'jack@x.com', logDate: '2026-08-11', hours: 6, payDollars: 132,
    });
    expect(n!.body).toMatch(/approved/i);
  });

  it('says the pay is undecided rather than printing $0.00', () => {
    // No rate set is real and ordinary — unpriced work, or a person with no agreed rate. A zero
    // would tell somebody they worked for free.
    const n = buildHoursEnteredForYouNotification({
      employeeEmail: 'jack@x.com', logDate: '2026-08-11', hours: 6, payDollars: null,
    });
    expect(n!.body).not.toContain('$0.00');
    expect(n!.body).toMatch(/not decided/i);
  });

  it('still reports a genuine zero-dollar day as $0.00', () => {
    // Distinct from the case above: nothing owed is a decision; no rate is the absence of one.
    const n = buildHoursEnteredForYouNotification({
      employeeEmail: 'jack@x.com', logDate: '2026-08-11', hours: 6, payDollars: 0,
    });
    expect(n!.body).toContain('$0.00');
  });

  it('falls back to an entry count when the hours are unreadable', () => {
    const n = buildHoursEnteredForYouNotification({
      employeeEmail: 'jack@x.com', logDate: '2026-08-11', hours: null, entryCount: 3,
    });
    expect(n!.body).toContain('3 entries');
  });

  it('reads correctly for one entry and for several', () => {
    const one = buildHoursEnteredForYouNotification({ employeeEmail: 'j@x.com', hours: 8, entryCount: 1 })!;
    const many = buildHoursEnteredForYouNotification({ employeeEmail: 'j@x.com', hours: 8, entryCount: 2 })!;
    expect(one.body).toContain('was entered');
    expect(many.body).toContain('were entered');
  });

  it('returns null with nobody to tell, rather than throwing', () => {
    // This runs after the hours are already saved. A missing email must not turn a filed timesheet
    // into a 500.
    expect(buildHoursEnteredForYouNotification({ employeeEmail: null, hours: 8 })).toBeNull();
    expect(buildHoursEnteredForYouNotification({ employeeEmail: '  ', hours: 8 })).toBeNull();
  });
});
