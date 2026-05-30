// lib/notifications/daily-briefing.ts
//
// notifications-completeness-pass Slice 4 — pure composer for the
// "Good morning, {firstName}" briefing notification fired by the
// `/api/cron/daily-briefing` cron each weekday morning.
//
// The briefing condenses what the daily-briefing widget already pulls
// — today's schedule events + tasks due today and through the next 5
// business days + unread mentions/admin notes from the last 24h —
// into a single bell payload so the surveyor sees one summary even if
// the hub canvas isn't open. Returns null when the day is truly empty
// (no spam on a quiet day).
//
// Dependency-free → unit-tested in node.

export interface BriefingEvent {
  title?: string | null;
  start_time?: string | null;
  all_day?: boolean | null;
}

export interface BriefingTask {
  title?: string | null;
  due_date?: string | null;
}

export interface BriefingMention {
  author_email?: string | null;
  body_preview?: string | null;
}

export interface BriefingInput {
  user_email: string;
  first_name: string;
  today_events: readonly BriefingEvent[];
  /** Tasks due today and through the next 5 business days. */
  upcoming_tasks: readonly BriefingTask[];
  /** Admin notes / @-mentions from the last 24h (boss / coworker / teacher). */
  recent_notes: readonly BriefingMention[];
}

export interface DailyBriefingNotification {
  user_email: string;
  type: 'briefing';
  source_type: 'daily_briefing';
  title: string;
  body: string;
  icon: string;
  link: '/admin/me';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Compose the bell payload, or null when there's nothing worth
 *  surfacing (no events, no tasks, no notes). */
export function buildDailyBriefingNotification(
  input: BriefingInput,
): DailyBriefingNotification | null {
  const email = input.user_email?.trim().toLowerCase();
  if (!email) return null;

  const events = input.today_events.filter((e) => !!e.title?.trim());
  const tasks = input.upcoming_tasks.filter((t) => !!t.title?.trim());
  const notes = input.recent_notes.filter((n) => !!n.body_preview?.trim());

  if (events.length === 0 && tasks.length === 0 && notes.length === 0) {
    return null;
  }

  const parts: string[] = [];
  if (events.length > 0) {
    const titles = events.slice(0, 2).map((e) => e.title!.trim()).join(', ');
    const more = events.length > 2 ? ` +${events.length - 2} more` : '';
    parts.push(`${plural(events.length, 'event')} today: ${titles}${more}.`);
  }
  if (tasks.length > 0) {
    const titles = tasks.slice(0, 2).map((t) => t.title!.trim()).join(', ');
    const more = tasks.length > 2 ? ` +${tasks.length - 2} more` : '';
    parts.push(`${plural(tasks.length, 'task')} due this week: ${titles}${more}.`);
  }
  if (notes.length > 0) {
    const authors = uniqueAuthors(notes).slice(0, 2).join(', ');
    parts.push(`${plural(notes.length, 'note')} from ${authors}.`);
  }

  const name = input.first_name?.trim() || 'there';

  return {
    user_email: email,
    type: 'briefing',
    source_type: 'daily_briefing',
    title: `🌅 Good morning, ${name}`,
    body: parts.join(' '),
    icon: '🌅',
    link: '/admin/me',
  };
}

/** Distinct, non-empty author handles in first-seen order. */
function uniqueAuthors(notes: readonly BriefingMention[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of notes) {
    const a = n.author_email?.trim();
    if (!a || seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
}

/** The 5-business-day window starting at `now` (UTC days, inclusive of
 *  today + the next 4 weekdays, hitting at most 7 calendar days). */
export function fiveBusinessDayWindow(
  now: Date,
): { fromIso: string; toIso: string; days: number } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let weekdays = 0;
  let calendarDays = 0;
  while (weekdays < 5) {
    const probe = new Date(start.getTime() + calendarDays * 86_400_000);
    const dow = probe.getUTCDay();
    if (dow !== 0 && dow !== 6) weekdays += 1;
    calendarDays += 1;
  }
  const end = new Date(start.getTime() + calendarDays * 86_400_000);
  return {
    fromIso: start.toISOString(),
    toIso: end.toISOString(),
    days: calendarDays,
  };
}
