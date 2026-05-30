// lib/notifications/assignment-reminders.ts
//
// Slice 3 of hub-widget-excellence-03-notifications. Pure classifier +
// payload builder for "assignment due soon / overdue" reminders. A
// daily cron walks pending assignments and fires these so students +
// workers get nudged. Dependency-free + unit-testable.
//
// Boundary-only firing keeps it spam-free: a due-soon reminder fires
// only when the days-until-due lands exactly on a boundary (default 3,
// 1, and 0/"today"), so a single cron run per day produces at most one
// reminder per assignment. Overdue items remind once per daily run.

export interface ReminderAssignment {
  id?: string | null;
  title?: string | null;
  assigned_to?: string | null;
  due_date?: string | null;
  status?: string | null;
}

export interface AssignmentReminderNotification {
  user_email: string;
  type: 'reminder';
  title: string;
  body: string;
  icon: string;
  link: string;
  source_type: 'assignment_due';
  source_id: string;
  escalation_level: 'high' | 'normal';
}

/** Default day-boundaries at which a not-yet-due assignment reminds. */
export const DUE_SOON_BOUNDARIES = [3, 1, 0];

/** Whole days from `nowMs` until `dueDate` (UTC-date math, so it's
 *  timezone-stable). Negative ⇒ overdue. Null when unparseable. */
export function daysUntilDue(dueDate: string | null | undefined, nowMs: number): number | null {
  const m = dueDate ? /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDate) : null;
  if (!m) return null;
  const dueUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date(nowMs);
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((dueUtc - nowUtc) / 86_400_000);
}

/**
 * Build the reminder payloads for a batch of assignments at `nowMs`.
 * Skips rows without an assignee/id/due-date, non-pending rows, and
 * any whose days-until-due isn't a boundary (and isn't overdue).
 */
export function buildAssignmentReminders(
  assignments: readonly ReminderAssignment[],
  nowMs: number,
  boundaries: readonly number[] = DUE_SOON_BOUNDARIES,
): AssignmentReminderNotification[] {
  const out: AssignmentReminderNotification[] = [];
  for (const a of assignments) {
    const user_email = a.assigned_to?.trim();
    const id = a.id?.trim();
    if (!user_email || !id) continue;
    if (a.status && a.status !== 'pending') continue;

    const days = daysUntilDue(a.due_date, nowMs);
    if (days == null) continue;

    const overdue = days < 0;
    if (!overdue && !boundaries.includes(days)) continue;

    const label = a.title?.trim() || 'an assignment';
    const when = overdue
      ? `overdue by ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'}`
      : days === 0
        ? 'due today'
        : `due in ${days} ${days === 1 ? 'day' : 'days'}`;
    const icon = overdue ? '🔴' : days === 0 ? '⏰' : '🗓️';

    out.push({
      user_email,
      type: 'reminder',
      title: `${icon} Assignment ${overdue ? 'overdue' : days === 0 ? 'due today' : 'due soon'}`,
      body: `"${label}" is ${when}.`,
      icon,
      link: '/admin/assignments',
      source_type: 'assignment_due',
      source_id: id,
      escalation_level: overdue || days === 0 ? 'high' : 'normal',
    });
  }
  return out;
}
