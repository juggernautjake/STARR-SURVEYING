// __tests__/notifications/assignment.test.ts
//
// Slice 2e of hub-widget-excellence-03-notifications. Locks the pure
// assignment notification builder (priority + due date + escalation).

import { describe, it, expect } from 'vitest';
import {
  buildAssignmentNotification,
  type AssignmentRow,
} from '@/lib/notifications/assignment';

const ROW: AssignmentRow = {
  id: 'as-1',
  title: 'Stake the north boundary',
  priority: 'high',
  due_date: '2026-06-05',
  assigned_to: 'crew@x.com',
};

describe('buildAssignmentNotification', () => {
  it('addresses the assignee with priority + due date in the body', () => {
    const n = buildAssignmentNotification(ROW)!;
    expect(n).toMatchObject({
      user_email: 'crew@x.com',
      type: 'assignment',
      icon: '📋',
      link: '/admin/assignments',
      source_type: 'task_assignment',
      source_id: 'as-1',
      escalation_level: 'high',
    });
    expect(n.title).toBe('📋 New Assignment: Stake the north boundary');
    expect(n.body).toBe('Priority: high · Due 2026-06-05');
  });

  it('escalates urgent + defaults normal', () => {
    expect(buildAssignmentNotification({ ...ROW, priority: 'urgent' })!.escalation_level).toBe('urgent');
    expect(buildAssignmentNotification({ ...ROW, priority: null })!.escalation_level).toBe('normal');
    expect(buildAssignmentNotification({ ...ROW, priority: null })!.body).toContain('Priority: normal');
  });

  it('omits the due date when absent', () => {
    const n = buildAssignmentNotification({ ...ROW, due_date: null })!;
    expect(n.body).toBe('Priority: high');
  });

  it('returns null without an assignee or title', () => {
    expect(buildAssignmentNotification({ ...ROW, assigned_to: null })).toBeNull();
    expect(buildAssignmentNotification({ ...ROW, title: '  ' })).toBeNull();
  });
});
