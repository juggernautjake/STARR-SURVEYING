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

export interface ReminderEvent {
  id?: string | null;
  title?: string | null;
  assigned_to?: string | null;
  start_time?: string | null;
  all_day?: boolean | null;
  location?: string | null;
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
