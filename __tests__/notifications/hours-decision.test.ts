// __tests__/notifications/hours-decision.test.ts
//
// Slice 2 of hub-widget-excellence-03-notifications. Locks the pure
// hours-decision notification builder: one notification per submitter,
// correct approve/reject copy, hour-summing, date vs "N entries"
// labeling, and the skip-rows-without-email guard.

import { describe, it, expect } from 'vitest';
import {
  buildHoursDecisionNotifications,
  buildHoursAdjustmentNotification,
  type TimeLogRow,
} from '@/lib/notifications/hours-decision';

describe('buildHoursDecisionNotifications', () => {
  it('builds one approval notification for a single submitter/day', () => {
    const rows: TimeLogRow[] = [{ user_email: 'a@x.com', log_date: '2026-05-30', hours: 8 }];
    const out = buildHoursDecisionNotifications(rows, true);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      user_email: 'a@x.com',
      type: 'approval',
      icon: '✅',
      link: '/admin/hours?tab=my-time',
      source_type: 'hours_decision',
    });
    expect(out[0].title).toContain('Approved');
    expect(out[0].body).toContain('8h');
    expect(out[0].body).toContain('2026-05-30');
    expect(out[0].body).toContain('approved');
  });

  it('uses rejection copy + icon when not approved', () => {
    const out = buildHoursDecisionNotifications(
      [{ user_email: 'a@x.com', log_date: '2026-05-30', hours: 4 }],
      false,
    );
    expect(out[0].icon).toBe('❌');
    expect(out[0].title).toContain('Rejected');
    expect(out[0].body).toContain('rejected');
  });

  it('groups multiple rows per submitter into ONE notification (sums hours, "N entries")', () => {
    const rows: TimeLogRow[] = [
      { user_email: 'a@x.com', log_date: '2026-05-28', hours: 8 },
      { user_email: 'a@x.com', log_date: '2026-05-29', hours: 7.5 },
      { user_email: 'b@x.com', log_date: '2026-05-29', hours: 6 },
    ];
    const out = buildHoursDecisionNotifications(rows, true);
    expect(out).toHaveLength(2);
    const a = out.find((n) => n.user_email === 'a@x.com')!;
    expect(a.body).toContain('15.5h');
    expect(a.body).toContain('2 entries');
    expect(a.body).toContain('have been');
    const b = out.find((n) => n.user_email === 'b@x.com')!;
    expect(b.body).toContain('6h');
    expect(b.body).toContain('2026-05-29');
    expect(b.body).toContain('has been');
  });

  it('skips rows without a user_email and tolerates missing hours', () => {
    const rows: TimeLogRow[] = [
      { user_email: null, log_date: '2026-05-30', hours: 8 },
      { user_email: '  ', log_date: '2026-05-30', hours: 8 },
      { user_email: 'a@x.com', log_date: '2026-05-30', hours: null },
    ];
    const out = buildHoursDecisionNotifications(rows, true);
    expect(out).toHaveLength(1);
    expect(out[0].user_email).toBe('a@x.com');
    expect(out[0].body).toContain('0h');
  });

  it('returns an empty array for no rows', () => {
    expect(buildHoursDecisionNotifications([], true)).toEqual([]);
  });
});

// ── The reason reaches the person it is about ──────────────────────────────────────────────────
//
// Owner, 2026-08-12: *"reject the hours with a reason (required) and the employee is notified."*
// The reason was required, stored and shown to the ADMIN, and the employee got "8h (2026-08-04) has
// been rejected." with no way to find out why except to ask.
describe('a rejection says why', () => {
  it('carries the reason into the body', () => {
    const out = buildHoursDecisionNotifications(
      [{ user_email: 'a@x.com', log_date: '2026-08-04', hours: 8, rejection_reason: 'No job number on the entry' }],
      false,
    );
    expect(out[0].body).toContain('No job number on the entry');
    expect(out[0].body).toContain('Reason:');
  });

  it('states one shared reason once across a bulk rejection', () => {
    // Rejecting a whole week is nearly always one reason repeated seven times. Printing it seven
    // times would bury it.
    const rows: TimeLogRow[] = ['2026-08-03', '2026-08-04', '2026-08-05'].map((d) => ({
      user_email: 'a@x.com', log_date: d, hours: 8, rejection_reason: 'Submit against a job',
    }));
    const out = buildHoursDecisionNotifications(rows, false);
    expect(out).toHaveLength(1);
    expect(out[0].body.match(/Submit against a job/g)).toHaveLength(1);
  });

  it('lists every distinct reason when the days were rejected for different things', () => {
    // Each belongs to a different day and the employee has to fix each of them, so collapsing to
    // the first would hide work they still have to do.
    const out = buildHoursDecisionNotifications(
      [
        { user_email: 'a@x.com', log_date: '2026-08-03', hours: 8, rejection_reason: 'Wrong job' },
        { user_email: 'a@x.com', log_date: '2026-08-04', hours: 8, rejection_reason: 'Hours look high' },
      ],
      false,
    );
    expect(out[0].body).toContain('Wrong job');
    expect(out[0].body).toContain('Hours look high');
    expect(out[0].body).toContain('Reasons:');
  });

  it('does not leave a dangling "Reason:" when none was recorded', () => {
    const out = buildHoursDecisionNotifications(
      [{ user_email: 'a@x.com', log_date: '2026-08-04', hours: 8 }],
      false,
    );
    expect(out[0].body).not.toMatch(/Reasons?:/);
  });

  it('never appends a reason to an approval', () => {
    // The approve path collects no reason, and a stale one from a previous rejection is still on the
    // row. "Approved. Reason: hours look high" would be nonsense at best.
    const out = buildHoursDecisionNotifications(
      [{ user_email: 'a@x.com', log_date: '2026-08-04', hours: 8, rejection_reason: 'Hours look high' }],
      true,
    );
    expect(out[0].body).not.toMatch(/Reasons?:/);
    expect(out[0].body).not.toContain('Hours look high');
  });
});

describe('buildHoursAdjustmentNotification', () => {
  it('names the old→new hours, the date, and the reason', () => {
    const n = buildHoursAdjustmentNotification({
      user_email: 'a@x.com',
      log_date: '2026-06-22',
      original_hours: 8,
      adjusted_hours: 6.5,
      reason: 'Lunch break not counted',
    });
    expect(n).not.toBeNull();
    expect(n!).toMatchObject({
      user_email: 'a@x.com',
      type: 'approval',
      icon: '✏️',
      link: '/admin/hours?tab=my-time',
      source_type: 'hours_decision',
    });
    expect(n!.title).toContain('Adjusted');
    expect(n!.body).toContain('8h → 6.5h');
    expect(n!.body).toContain('2026-06-22');
    expect(n!.body).toContain('Lunch break not counted');
  });

  it('handles a missing original (just states the new value) and no reason', () => {
    const n = buildHoursAdjustmentNotification({
      user_email: 'a@x.com',
      adjusted_hours: 5,
    });
    expect(n!.body).toContain('to 5h');
    expect(n!.body).not.toContain('Reason:');
  });

  it('returns null without a user_email', () => {
    expect(buildHoursAdjustmentNotification({ user_email: '  ', adjusted_hours: 5 })).toBeNull();
    expect(buildHoursAdjustmentNotification({ user_email: null, adjusted_hours: 5 })).toBeNull();
  });
});
