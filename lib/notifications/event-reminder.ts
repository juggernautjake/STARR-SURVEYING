// lib/notifications/event-reminder.ts
//
// Slice 4 of hub-widget-excellence-04-calendar. Pure builder + window
// check for "your event starts soon" reminders. An hourly cron
// (schedule-event-reminders) scans events whose start falls in the next
// look-ahead window and fires these to the assignee. Dependency-free +
// unit-testable.
//
// The hourly cadence + a 60-minute look-ahead means each event lands in
// exactly one hourly window, so it reminds once without needing a
// per-event "already reminded" column. (A future migration could add a
// per-event `remind_minutes` for a user-chosen lead; deferred to keep
// this slice infra-free per the doc guardrail.)

export const REMINDER_LOOKAHEAD_MIN = 60;

/** Slice S3 (calendar-day-create-and-alerts-2026-06-17) — the
 *  lead-time options the user can pick from in the create-event
 *  modal. The cron understands any positive minute count, but
 *  the UI keeps a small fixed set of common picks. */
export const REMINDER_LEAD_CHOICES = [5, 15, 60, 1440] as const;
export type ReminderLead = typeof REMINDER_LEAD_CHOICES[number];

/** How far ahead the hourly cron scans (max picker option + the
 *  cron's own hourly window). A 1-day lead on an event 25 hours
 *  out still lands inside this scan. */
export const REMINDER_SCAN_AHEAD_MIN = 1440 + 60;

export interface ReminderEvent {
  id?: string | null;
  title?: string | null;
  assigned_to?: string | null;
  start_time?: string | null;
  all_day?: boolean | null;
  location?: string | null;
  /** Slice S3 — per-event reminder leads. Null / undefined / empty
   *  array means no reminders for this event. Older rows default
   *  to `[60]` via the migration so behavior is unchanged. */
  reminder_minutes_before?: number[] | null;
}

export interface EventReminderNotification {
  user_email: string;
  type: 'reminder';
  title: string;
  body: string;
  icon: string;
  link: string;
  source_type: 'event_reminder';
  source_id: string;
}

/** Whole minutes until the event starts (may be fractional), or null
 *  when the start is missing/unparseable. */
export function minutesUntilStart(event: ReminderEvent, nowMs: number): number | null {
  if (!event.start_time) return null;
  const t = Date.parse(event.start_time);
  if (!Number.isFinite(t)) return null;
  return (t - nowMs) / 60_000;
}

/** True when the event starts within the look-ahead window (and hasn't
 *  already started). All-day events are excluded — they have no
 *  meaningful "starts soon" moment. */
export function isInReminderWindow(
  event: ReminderEvent,
  nowMs: number,
  windowMin: number = REMINDER_LOOKAHEAD_MIN,
): boolean {
  if (event.all_day) return false;
  const mins = minutesUntilStart(event, nowMs);
  if (mins == null) return false;
  return mins > 0 && mins <= windowMin;
}

/** Slice S3 — given an event + the current hour's window, return
 *  every configured lead whose "ready to fire" moment
 *  (start_time - lead) falls in [nowMs, nowMs + windowMin]. The
 *  cron iterates these and emits one notification per due lead.
 *
 *  A 5-min lead on a 9:05 event running through a cron at 9:00
 *  fires now. A 1-day lead on a 9:30-tomorrow event running
 *  through a cron at 9:00 today also fires now.
 *
 *  Pure + total: invalid leads (≤ 0, non-finite) are silently
 *  skipped; all-day events return an empty list. */
export function dueReminderLeads(
  event: ReminderEvent,
  nowMs: number,
  windowMin: number = REMINDER_LOOKAHEAD_MIN,
): number[] {
  if (event.all_day) return [];
  if (!event.start_time) return [];
  const startMs = Date.parse(event.start_time);
  if (!Number.isFinite(startMs)) return [];
  const leads = event.reminder_minutes_before ?? [60];
  const due: number[] = [];
  for (const lead of leads) {
    if (typeof lead !== 'number' || !Number.isFinite(lead) || lead <= 0) continue;
    const fireMs = startMs - lead * 60_000;
    if (fireMs >= nowMs && fireMs < nowMs + windowMin * 60_000) {
      due.push(lead);
    }
  }
  return due;
}

/**
 * Build the reminder payload for the event's assignee, or null when
 * there's no assignee / id / start. Caller is expected to have already
 * filtered to the reminder window (the cron does this in SQL), but the
 * builder is safe to call on anything.
 */
export function buildEventReminder(
  event: ReminderEvent,
  nowMs: number,
): EventReminderNotification | null {
  const user_email = event.assigned_to?.trim();
  const id = event.id?.trim();
  if (!user_email || !id) return null;
  const mins = minutesUntilStart(event, nowMs);
  if (mins == null || mins <= 0) return null;

  const title = event.title?.trim() || 'an event';
  const rounded = Math.max(1, Math.round(mins));
  const where = event.location?.trim() ? ` at ${event.location.trim()}` : '';

  return {
    user_email,
    type: 'reminder',
    title: `⏰ Starting soon: ${title}`,
    body: `"${title}" starts in ${rounded} ${rounded === 1 ? 'minute' : 'minutes'}${where}.`,
    icon: '⏰',
    link: '/admin/schedule',
    source_type: 'event_reminder',
    source_id: id,
  };
}
