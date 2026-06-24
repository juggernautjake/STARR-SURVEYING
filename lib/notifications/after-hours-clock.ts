// lib/notifications/after-hours-clock.ts
//
// Pure payload builder for the "you're still clocked in" evening
// reminder (slice H7 of the hours-correction plan). Someone who forgets
// to clock out accrues bogus hours; this nudges them to clock out.
//
// Dependency-free so it's trivially unit-testable; the cron
// (app/api/cron/clocked-in-after-hours) queries open job_time_entries
// rows (end_time IS NULL), filters out anyone already reminded this
// evening, and maps each payload through `notify`.

export interface OpenClockEntry {
  user_email?: string | null;
  start_time?: string | null;
}

export interface ClockReminderNotification {
  user_email: string;
  type: 'reminder';
  title: string;
  body: string;
  icon: string;
  link: string;
  source_type: 'clock_reminder';
}

/** "8h 15m" / "45m" / "" for non-positive. */
export function formatElapsed(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/**
 * One reminder per still-clocked-in user. When a user has multiple open
 * entries the earliest start wins (longest elapsed). `nowMs` is the
 * current time in ms; elapsed is computed from the start.
 */
export function buildAfterHoursClockReminders(
  entries: readonly OpenClockEntry[],
  nowMs: number,
): ClockReminderNotification[] {
  // email → earliest valid start (ms). Falls back to nowMs if no parseable start.
  const earliestStart = new Map<string, number>();
  for (const e of entries) {
    const email = e.user_email?.trim();
    if (!email) continue;
    const start = e.start_time ? Date.parse(e.start_time) : NaN;
    const startMs = Number.isFinite(start) ? start : nowMs;
    const cur = earliestStart.get(email);
    if (cur === undefined || startMs < cur) earliestStart.set(email, startMs);
  }

  const out: ClockReminderNotification[] = [];
  for (const [user_email, startMs] of earliestStart) {
    const minutes = Math.max(0, Math.round((nowMs - startMs) / 60000));
    const elapsed = formatElapsed(minutes);
    out.push({
      user_email,
      type: 'reminder',
      title: '⏰ Still clocked in',
      body: `You're still clocked in${elapsed ? ` (${elapsed} so far)` : ''}. Don't forget to clock out when you're done for the day.`,
      icon: '⏰',
      link: '/admin/me?tab=hours',
      source_type: 'clock_reminder',
    });
  }
  return out;
}
