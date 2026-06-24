// lib/notifications/hours-decision.ts
//
// Slice 2 of hub-widget-excellence-03-notifications. Pure payload
// builder for the "your hours were approved/rejected" notification.
// Kept dependency-free (no supabase import) so it's trivially unit-
// testable; the route maps each payload through the `notify` primitive.
//
// One notification PER submitter (not per row) so a bulk approve of a
// whole week doesn't spam the worker with seven bells.

export interface TimeLogRow {
  user_email?: string | null;
  log_date?: string | null;
  hours?: number | null;
}

export interface HoursDecisionNotification {
  user_email: string;
  type: 'approval';
  title: string;
  body: string;
  icon: string;
  link: string;
  source_type: 'hours_decision';
}

/**
 * Group the updated time-log rows by submitter and build one
 * approval/rejection notification per submitter. Rows without a
 * `user_email` are skipped. `approved` selects the approve vs reject
 * copy/icon.
 */
export function buildHoursDecisionNotifications(
  rows: readonly TimeLogRow[],
  approved: boolean,
): HoursDecisionNotification[] {
  const byUser = new Map<string, { totalHours: number; dates: Set<string>; count: number }>();

  for (const row of rows) {
    const email = row.user_email?.trim();
    if (!email) continue;
    const entry = byUser.get(email) ?? { totalHours: 0, dates: new Set<string>(), count: 0 };
    entry.totalHours += typeof row.hours === 'number' && Number.isFinite(row.hours) ? row.hours : 0;
    if (row.log_date) entry.dates.add(row.log_date);
    entry.count += 1;
    byUser.set(email, entry);
  }

  const status = approved ? 'approved' : 'rejected';
  const statusTitle = approved ? 'Approved' : 'Rejected';
  const icon = approved ? '✅' : '❌';

  const out: HoursDecisionNotification[] = [];
  for (const [user_email, agg] of byUser) {
    const hoursLabel = formatHours(agg.totalHours);
    // One date → name it; multiple → "N entries".
    const span = agg.dates.size === 1
      ? [...agg.dates][0]
      : `${agg.count} ${agg.count === 1 ? 'entry' : 'entries'}`;
    out.push({
      user_email,
      type: 'approval',
      title: `${icon} Hours ${statusTitle}`,
      body: `${hoursLabel} (${span}) ${agg.count === 1 ? 'has' : 'have'} been ${status}.`,
      icon,
      link: '/admin/me?tab=hours',
      source_type: 'hours_decision',
    });
  }
  return out;
}

/**
 * Build the "a manager adjusted your hours" notification for a single
 * adjusted entry. Names the old→new hours and the reason so the worker
 * knows exactly what changed and why. Returns null without a user_email.
 */
export function buildHoursAdjustmentNotification(opts: {
  user_email?: string | null;
  log_date?: string | null;
  original_hours?: number | null;
  adjusted_hours?: number | null;
  reason?: string | null;
}): HoursDecisionNotification | null {
  const email = opts.user_email?.trim();
  if (!email) return null;

  const from = typeof opts.original_hours === 'number' && Number.isFinite(opts.original_hours)
    ? formatHours(opts.original_hours) : null;
  const to = typeof opts.adjusted_hours === 'number' && Number.isFinite(opts.adjusted_hours)
    ? formatHours(opts.adjusted_hours) : null;
  const change = from && to ? `${from} → ${to}` : to ? `to ${to}` : 'changed';
  const when = opts.log_date ? ` for ${opts.log_date}` : '';
  const reason = opts.reason && opts.reason.trim() ? ` Reason: ${opts.reason.trim()}` : '';

  return {
    user_email: email,
    type: 'approval',
    title: '✏️ Hours Adjusted',
    body: `A manager adjusted your hours${when} (${change}).${reason}`,
    icon: '✏️',
    link: '/admin/me?tab=hours',
    source_type: 'hours_decision',
  };
}

/** "8h" / "7.5h" — trims a trailing ".0". */
function formatHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return `${rounded}h`;
}
