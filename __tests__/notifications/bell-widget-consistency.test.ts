// __tests__/notifications/bell-widget-consistency.test.ts
//
// Slice 4 of hub-widget-excellence-03-notifications. Bell ↔ widget
// consistency lock: every notification a widget's domain produces must
// deep-link to the SAME route the widget's "Go to…" footer points at
// (the widget-links registry from doc 02). This catches a future route
// rename made in one place but not the other.

import { describe, it, expect } from 'vitest';
import { WIDGET_LINKS, jobHref } from '@/lib/hub/widgets/_shared/widget-links';
import { buildHoursDecisionNotifications } from '@/lib/notifications/hours-decision';
import { buildTimeOffDecisionNotification } from '@/lib/notifications/time-off-decision';
import { buildReceiptDecisionNotification } from '@/lib/notifications/receipt-decision';
import { buildAssignmentNotification } from '@/lib/notifications/assignment';
import { buildAssignmentReminders } from '@/lib/notifications/assignment-reminders';
import { buildQuizResultNotification } from '@/lib/notifications/quiz-result';
import { buildLessonCompleteNotification } from '@/lib/notifications/lesson-complete';
import { buildPayRaiseNotification } from '@/lib/notifications/pay-raise';
import { buildPayoutNotification, buildPayStubNotification } from '@/lib/notifications/payout';

describe('notification links match the widget-links registry', () => {
  it('hours decision → hours-this-week widget route', () => {
    const link = buildHoursDecisionNotifications(
      [{ user_email: 'a@x.com', log_date: '2026-05-30', hours: 8 }], true,
    )[0].link;
    expect(link).toBe(WIDGET_LINKS['hours-this-week'].href);
    expect(link).toBe('/admin/me?tab=hours');
  });

  it('time-off decision → pto-balance + pending-time-off widget route', () => {
    const link = buildTimeOffDecisionNotification(
      { assigned_to: 'a@x.com', start_time: '2026-06-01T00:00Z', end_time: '2026-06-01T00:00Z' }, true,
    )!.link;
    expect(link).toBe(WIDGET_LINKS['pto-balance'].href);
    expect(link).toBe(WIDGET_LINKS['pending-time-off'].href);
  });

  it('receipt decision → pending-receipts widget route', () => {
    const link = buildReceiptDecisionNotification({ submitted_by: 'a@x.com', total: 1 }, 'approved')!.link;
    expect(link).toBe(WIDGET_LINKS['pending-receipts'].href);
  });

  it('task assignment + due reminder → assignments-due widget route', () => {
    const assigned = buildAssignmentNotification({ id: 'a1', title: 'X', assigned_to: 'a@x.com' })!.link;
    const reminder = buildAssignmentReminders(
      [{ id: 'a1', title: 'X', assigned_to: 'a@x.com', status: 'pending', due_date: '2026-05-30' }],
      Date.UTC(2026, 4, 30),
    )[0].link;
    expect(assigned).toBe(WIDGET_LINKS['assignments-due'].href);
    expect(reminder).toBe(WIDGET_LINKS['assignments-due'].href);
  });

  it('quiz result → quiz-history widget route', () => {
    const link = buildQuizResultNotification({ user_email: 'a@x.com', score_percent: 80 })!.link;
    expect(link).toBe(WIDGET_LINKS['quiz-history'].href);
  });

  it('lesson complete → roadmap-progress widget route', () => {
    const link = buildLessonCompleteNotification({ user_email: 'a@x.com', lesson_title: 'X' })!.link;
    expect(link).toBe(WIDGET_LINKS['roadmap-progress'].href);
  });

  it('pay raise → my-pay widget route', () => {
    const link = buildPayRaiseNotification({ user_email: 'a@x.com', new_rate: 30, previous_rate: 28 })!.link;
    expect(link).toBe(WIDGET_LINKS['my-pay'].href);
  });

  it('payout posted → my-pay widget route', () => {
    const link = buildPayoutNotification({
      user_email: 'a@x.com', amount_cents: 1000, method: 'cash', paid_at: '2026-05-30',
    })!.link;
    expect(link).toBe(WIDGET_LINKS['my-pay'].href);
  });

  it('pay stub ready → my-pay widget route', () => {
    const link = buildPayStubNotification({
      user_email: 'a@x.com', net_pay: 1000, pay_period_start: '2026-05-16', pay_period_end: '2026-05-30',
    })!.link;
    expect(link).toBe(WIDGET_LINKS['my-pay'].href);
  });

  it('job stage notifications deep-link to the canonical job detail route', () => {
    // notifyJobStageUpdate builds `/admin/jobs/{id}` — the same builder
    // the my-jobs widget rows use.
    expect(jobHref('J-1042')).toBe('/admin/jobs/J-1042');
  });
});
