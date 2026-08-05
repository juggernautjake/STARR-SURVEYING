// __tests__/payroll/hours-submitted-notification.test.ts

import { describe, it, expect } from 'vitest';
import {
  buildHoursSubmittedNotifications,
  hoursApprovalLink,
  canDecideHours,
  approversWhoWantThis,
  type SubmittedHours,
} from '@/lib/notifications/hours-submitted';

const submission = (over: Partial<SubmittedHours> = {}): SubmittedHours => ({
  employeeEmail: 'crew@starr-surveying.com',
  employeeName: 'Jane Doe',
  logDate: '2026-08-04',
  totalHours: 8,
  totalPayDollars: 190,
  unpricedHours: 0,
  entryCount: 2,
  isResubmission: false,
  ...over,
});

const APPROVERS = ['boss@starr-surveying.com', 'office@starr-surveying.com'];

describe('who gets told', () => {
  it('tells every approver', () => {
    const n = buildHoursSubmittedNotifications(submission(), APPROVERS);
    expect(n.map((x) => x.user_email).sort()).toEqual(APPROVERS.slice().sort());
  });

  it('sends ONE notification per approver, not one per entry', () => {
    // A day submitted as four entries is one act by one person. Four bells is how a useful
    // notification becomes noise.
    const n = buildHoursSubmittedNotifications(submission({ entryCount: 4 }), ['boss@x.com']);
    expect(n).toHaveLength(1);
  });

  it('does not tell somebody their own timesheet arrived', () => {
    // The submitter may themselves be an admin. They already know.
    const n = buildHoursSubmittedNotifications(
      submission({ employeeEmail: 'boss@starr-surveying.com' }),
      APPROVERS,
    );
    expect(n.map((x) => x.user_email)).toEqual(['office@starr-surveying.com']);
  });

  it('deduplicates a repeated approver', () => {
    const n = buildHoursSubmittedNotifications(submission(), ['boss@x.com', 'boss@x.com']);
    expect(n).toHaveLength(1);
  });

  it('returns nothing rather than throwing when there is nobody to tell', () => {
    // A firm with no admin is a configuration problem, not a reason to fail a submission.
    expect(buildHoursSubmittedNotifications(submission(), [])).toEqual([]);
  });
});

describe('only people who can act', () => {
  it('admins can decide hours', () => {
    expect(canDecideHours(['employee', 'admin'])).toBe(true);
  });

  it('tech_support and developer cannot — every action gates on isAdmin', () => {
    // They can OPEN /admin/hours-approval; every button on it 403s. Notifying them about a decision
    // they are not permitted to make trains them to ignore the bell.
    expect(canDecideHours(['tech_support'])).toBe(false);
    expect(canDecideHours(['developer'])).toBe(false);
    expect(canDecideHours(['employee'])).toBe(false);
    expect(canDecideHours([])).toBe(false);
    expect(canDecideHours(null)).toBe(false);
  });
});

describe('what the notification says', () => {
  it('names the person, the hours and the day in the title', () => {
    const [n] = buildHoursSubmittedNotifications(submission(), ['boss@x.com']);
    expect(n.title).toBe('Jane Doe submitted 8h for 2026-08-04');
  });

  it('distinguishes an update from a first submission', () => {
    const [n] = buildHoursSubmittedNotifications(submission({ isResubmission: true }), ['boss@x.com']);
    expect(n.title).toContain('updated');
    expect(n.type).toBe('hours_resubmitted');
  });

  it('carries the money, so the decision is made with it in view', () => {
    const [n] = buildHoursSubmittedNotifications(submission(), ['boss@x.com']);
    expect(n.body).toContain('$190.00');
  });

  it('says plainly when nothing was priced', () => {
    const [n] = buildHoursSubmittedNotifications(
      submission({ totalPayDollars: null, unpricedHours: 8 }),
      ['boss@x.com'],
    );
    expect(n.body).toMatch(/No pay rate was attached — you decide/);
    expect(n.body).not.toContain('$');
  });

  it('says when only PART of it is unpriced', () => {
    // Different from the above: there is a figure, and it is short. An approver who misses this
    // approves hours worth less than the total suggests.
    const [n] = buildHoursSubmittedNotifications(
      submission({ totalHours: 8, totalPayDollars: 150, unpricedHours: 2 }),
      ['boss@x.com'],
    );
    expect(n.body).toContain('$150.00');
    expect(n.body).toMatch(/2h of that carry no rate/);
  });

  it('includes what is owed overall when that is known', () => {
    const [n] = buildHoursSubmittedNotifications(
      submission({ owedStatement: '$420.00 owed since the last payout on 2026-07-15.' }),
      ['boss@x.com'],
    );
    expect(n.body).toContain('$420.00 owed since');
  });

  it('falls back gracefully when the person has no name on file', () => {
    const [n] = buildHoursSubmittedNotifications(
      submission({ employeeName: null }),
      ['boss@x.com'],
    );
    expect(n.title).toContain('crew@starr-surveying.com');
  });

  it('ignores a submission with no hours rather than sending an empty bell', () => {
    expect(buildHoursSubmittedNotifications(submission({ totalHours: 0 }), APPROVERS)).toEqual([]);
  });
});

describe('the link goes to the submission, not to a queue', () => {
  it('carries the employee and the date', () => {
    const link = hoursApprovalLink('crew@starr-surveying.com', '2026-08-04');
    expect(link).toContain('/admin/hours-approval?');
    expect(link).toContain('employee=crew%40starr-surveying.com');
    expect(link).toContain('date=2026-08-04');
  });

  it('opens on what still needs deciding', () => {
    expect(hoursApprovalLink('a@b.com', '2026-08-04')).toContain('status=pending%2Cdisputed');
  });

  it('is the link actually put on the notification', () => {
    // A correct helper the notification does not use would be the built-but-unreachable defect.
    const [n] = buildHoursSubmittedNotifications(submission(), ['boss@x.com']);
    expect(n.link).toBe(hoursApprovalLink('crew@starr-surveying.com', '2026-08-04'));
  });
});

describe('who actually wants the bell', () => {
  const APPROVERS = ['hank@starr.com', 'jacob@starr.com', 'office@starr.com'];
  const CREW = 'crew@starr.com';

  it('notifies somebody with no preference row', () => {
    // OPT-OUT, NOT OPT-IN. An opt-in default would mean shipping this turns Hank's notifications
    // OFF until he finds a settings page, and the failure would look exactly like the feature not
    // working.
    expect(approversWhoWantThis(APPROVERS, CREW, [])).toEqual(APPROVERS);
  });

  it('respects somebody who turned them off', () => {
    const prefs = [{ user_email: 'office@starr.com', notify_on_submit: false, only_for_emails: null }];
    expect(approversWhoWantThis(APPROVERS, CREW, prefs)).toEqual(['hank@starr.com', 'jacob@starr.com']);
  });

  it('lets somebody follow only their own crew', () => {
    const prefs = [{ user_email: 'jacob@starr.com', notify_on_submit: true, only_for_emails: ['someone-else@starr.com'] }];
    expect(approversWhoWantThis(APPROVERS, CREW, prefs)).toEqual(['hank@starr.com', 'office@starr.com']);
  });

  it('notifies them when the submitter IS on their list', () => {
    const prefs = [{ user_email: 'jacob@starr.com', notify_on_submit: true, only_for_emails: [CREW] }];
    expect(approversWhoWantThis(APPROVERS, CREW, prefs)).toEqual(APPROVERS);
  });

  it('treats an EMPTY list as nobody, and null as everybody', () => {
    // Collapsing these would make "I only want my own crew" impossible to express, and would
    // silently notify somebody who asked for the opposite.
    const empty = [{ user_email: 'office@starr.com', notify_on_submit: true, only_for_emails: [] }];
    expect(approversWhoWantThis(APPROVERS, CREW, empty)).not.toContain('office@starr.com');

    const all = [{ user_email: 'office@starr.com', notify_on_submit: true, only_for_emails: null }];
    expect(approversWhoWantThis(APPROVERS, CREW, all)).toContain('office@starr.com');
  });

  it('matches emails case-insensitively', () => {
    const prefs = [{ user_email: 'OFFICE@starr.com', notify_on_submit: false, only_for_emails: null }];
    expect(approversWhoWantThis(APPROVERS, CREW, prefs)).not.toContain('office@starr.com');
  });

  it('ignores a preference row for somebody who is not an approver', () => {
    const prefs = [{ user_email: 'stranger@starr.com', notify_on_submit: false, only_for_emails: null }];
    expect(approversWhoWantThis(APPROVERS, CREW, prefs)).toEqual(APPROVERS);
  });
});
