// __tests__/notifications/time-off-decision.test.ts
//
// Slice 2b of hub-widget-excellence-03-notifications. Locks the pure
// time-off decision notification builder.

import { describe, it, expect } from 'vitest';
import {
  buildTimeOffDecisionNotification,
  type TimeOffRequestRow,
} from '@/lib/notifications/time-off-decision';

const REQ: TimeOffRequestRow = {
  assigned_to: 'a@x.com',
  title: 'Time off — Alice',
  start_time: '2026-06-01T00:00:00.000Z',
  end_time: '2026-06-03T23:59:00.000Z',
};

describe('buildTimeOffDecisionNotification', () => {
  it('builds an approval notice addressed to the requester', () => {
    const n = buildTimeOffDecisionNotification(REQ, true)!;
    expect(n).toMatchObject({
      user_email: 'a@x.com',
      type: 'approval',
      icon: '✅',
      link: '/admin/time-off',
      source_type: 'time_off_decision',
    });
    expect(n.title).toContain('Approved');
    expect(n.body).toContain('approved');
    expect(n.body).toContain('2026-06-01 – 2026-06-03');
  });

  it('uses denial copy + icon when not approved', () => {
    const n = buildTimeOffDecisionNotification(REQ, false)!;
    expect(n.icon).toBe('🚫');
    expect(n.title).toContain('Denied');
    expect(n.body).toContain('denied');
  });

  it('collapses a single-day request to one date', () => {
    const n = buildTimeOffDecisionNotification(
      { ...REQ, start_time: '2026-06-01T08:00:00Z', end_time: '2026-06-01T17:00:00Z' },
      true,
    )!;
    expect(n.body).toContain('for 2026-06-01 was');
    expect(n.body).not.toContain('–');
  });

  it('omits the range when start_time is missing', () => {
    const n = buildTimeOffDecisionNotification({ ...REQ, start_time: null, end_time: null }, true)!;
    expect(n.body).toBe('Your time-off request was approved.');
  });

  it('returns null when there is no requester to notify', () => {
    expect(buildTimeOffDecisionNotification({ ...REQ, assigned_to: null }, true)).toBeNull();
    expect(buildTimeOffDecisionNotification({ ...REQ, assigned_to: '  ' }, true)).toBeNull();
  });
});
