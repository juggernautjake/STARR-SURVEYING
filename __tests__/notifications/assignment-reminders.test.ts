// __tests__/notifications/assignment-reminders.test.ts
//
// Slice 3 of hub-widget-excellence-03-notifications. Locks the pure
// assignment due/overdue reminder classifier + payload builder, incl.
// the boundary-only firing that keeps it spam-free.

import { describe, it, expect } from 'vitest';
import {
  daysUntilDue,
  buildAssignmentReminders,
  DUE_SOON_BOUNDARIES,
  type ReminderAssignment,
} from '@/lib/notifications/assignment-reminders';

const NOW = Date.UTC(2026, 4, 30, 15, 0, 0); // 2026-05-30T15:00Z

function dateInDays(n: number): string {
  return new Date(Date.UTC(2026, 4, 30) + n * 86_400_000).toISOString().slice(0, 10);
}

describe('daysUntilDue', () => {
  it('computes whole-day differences (UTC, timezone-stable)', () => {
    expect(daysUntilDue('2026-05-30', NOW)).toBe(0);
    expect(daysUntilDue('2026-06-02', NOW)).toBe(3);
    expect(daysUntilDue('2026-05-28', NOW)).toBe(-2);
  });

  it('returns null for a missing/unparseable date', () => {
    expect(daysUntilDue(null, NOW)).toBeNull();
    expect(daysUntilDue('nope', NOW)).toBeNull();
  });
});

describe('buildAssignmentReminders — boundary-only firing', () => {
  function make(due: number, over: Partial<ReminderAssignment> = {}): ReminderAssignment {
    return { id: `a-${due}`, title: 'Stake corners', assigned_to: 'crew@x.com', status: 'pending', due_date: dateInDays(due), ...over };
  }

  it('fires at each due-soon boundary (3, 1, 0) but not between', () => {
    const rows = [make(3), make(2), make(1), make(0)];
    const out = buildAssignmentReminders(rows, NOW);
    const days = out.map((n) => n.source_id);
    expect(days).toContain('a-3');
    expect(days).toContain('a-1');
    expect(days).toContain('a-0');
    expect(days).not.toContain('a-2'); // 2 isn't a boundary
    expect(DUE_SOON_BOUNDARIES).toEqual([3, 1, 0]);
  });

  it('does not fire for items further out than the largest boundary', () => {
    expect(buildAssignmentReminders([make(5)], NOW)).toHaveLength(0);
  });

  it('labels due-today / due-soon / overdue + sets escalation', () => {
    const today = buildAssignmentReminders([make(0)], NOW)[0];
    expect(today.body).toContain('due today');
    expect(today.escalation_level).toBe('high');

    const soon = buildAssignmentReminders([make(3)], NOW)[0];
    expect(soon.body).toContain('due in 3 days');
    expect(soon.escalation_level).toBe('normal');

    const overdue = buildAssignmentReminders([make(-2)], NOW)[0];
    expect(overdue.body).toContain('overdue by 2 days');
    expect(overdue.icon).toBe('🔴');
    expect(overdue.escalation_level).toBe('high');
  });

  it('singularizes "1 day"', () => {
    expect(buildAssignmentReminders([make(1)], NOW)[0].body).toContain('due in 1 day');
    expect(buildAssignmentReminders([make(-1)], NOW)[0].body).toContain('overdue by 1 day');
  });

  it('addresses the assignee + links to assignments + carries source_id', () => {
    const n = buildAssignmentReminders([make(0)], NOW)[0];
    expect(n).toMatchObject({
      user_email: 'crew@x.com',
      type: 'reminder',
      link: '/admin/assignments',
      source_type: 'assignment_due',
      source_id: 'a-0',
    });
  });

  it('skips non-pending, no-assignee, no-id, and dateless rows', () => {
    const rows: ReminderAssignment[] = [
      make(0, { status: 'completed' }),
      make(0, { assigned_to: null }),
      make(0, { id: null }),
      { id: 'x', title: 'no date', assigned_to: 'a@x.com', status: 'pending', due_date: null },
    ];
    expect(buildAssignmentReminders(rows, NOW)).toHaveLength(0);
  });
});
