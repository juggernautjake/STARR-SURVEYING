// lib/dnd/session-reminder.ts — decide which sessions are worth a reminder right now (P10-4b).
//
// The second half of P10-4. Rolls already mirror into Discord; this is the other thing a table actually
// wants from a bot — "we play tomorrow, four of you have said yes, two haven't answered".
//
// PURE ON PURPOSE. The cron does the fetching and the sending; every decision — which sessions, which
// bucket, what the message says — is here, where it can be tested against a fixed clock instead of by
// waiting a day. Same split as `roll-publish.ts`: the sending is deliberately unobservable, so the
// deciding must not be.
import { summarizeRsvps, type RsvpTally } from './rsvp';

/** Which reminder a session has earned. */
export type ReminderBucket = 'tomorrow' | 'today';

export interface ReminderSession {
  id: string;
  campaign_id: string;
  title: string;
  scheduled_at: string | null;
  status?: string | null;
}

export interface SessionReminder {
  sessionId: string;
  campaignId: string;
  bucket: ReminderBucket;
  title: string;
  scheduledAt: string;
}

/**
 * The table's own timezone.
 *
 * "Tomorrow" is a calendar word, not a 24-hour interval: a session at 7pm Friday is "tomorrow" from any
 * time on Thursday, including 11pm. Comparing timestamps would call that 20 hours and put it in the wrong
 * bucket. Fixed to America/Chicago to match the other crons in this repo rather than invented per-campaign
 * — a per-table timezone is a real feature and a column this schema does not have, and guessing one from
 * the DM's browser is worse than a documented default.
 */
export const REMINDER_TIMEZONE = 'America/Chicago';

/** `2026-07-29` in the reminder timezone. */
export function localDay(iso: string | Date, timeZone = REMINDER_TIMEZONE): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  // `en-CA` because it formats as YYYY-MM-DD, which sorts and compares as a string.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** The local day `offset` days from `now`. */
function dayOffset(now: Date, offset: number, timeZone: string): string {
  return localDay(new Date(now.getTime() + offset * 24 * 3600 * 1000), timeZone);
}

/**
 * Which of these sessions deserves a reminder, given the clock.
 *
 * A session is reminded the day BEFORE and again on the day itself. Sessions marked `done` are skipped —
 * a session that already happened does not need announcing — and one with no `scheduled_at` cannot be
 * reminded about at all, because there is nothing to say.
 *
 * IDEMPOTENCY IS THE CRON'S SCHEDULE, not a stored flag. Running twice in one day sends two reminders,
 * exactly like `phase-reminders`, which this mirrors. That is a real constraint and it is written down
 * here rather than left to be discovered: adding a `reminded_at` column would make it robust, and until
 * something needs that, one daily entry in `vercel.json` is the whole mechanism.
 */
export function sessionsToRemind(
  sessions: readonly ReminderSession[],
  now: Date,
  timeZone = REMINDER_TIMEZONE,
): SessionReminder[] {
  const today = localDay(now, timeZone);
  const tomorrow = dayOffset(now, 1, timeZone);
  const out: SessionReminder[] = [];

  for (const s of sessions ?? []) {
    if (!s?.scheduled_at) continue;
    if (s.status === 'done') continue;
    const day = localDay(s.scheduled_at, timeZone);
    if (!day) continue;
    const bucket: ReminderBucket | null = day === today ? 'today' : day === tomorrow ? 'tomorrow' : null;
    if (!bucket) continue;
    out.push({
      sessionId: s.id,
      campaignId: s.campaign_id,
      bucket,
      title: (s.title || 'Session').trim(),
      scheduledAt: s.scheduled_at,
    });
  }
  // Today's reminders first — the more urgent of the two — then by clock time.
  return out.sort(
    (a, b) => (a.bucket === b.bucket ? a.scheduledAt.localeCompare(b.scheduledAt) : a.bucket === 'today' ? -1 : 1),
  );
}

/** `7:00 PM` in the reminder timezone. */
export function localTime(iso: string, timeZone = REMINDER_TIMEZONE): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(d);
}

/**
 * The Discord message for one reminder.
 *
 * The RSVP line is the reason to send this at all — "we play tomorrow" is a calendar's job, "two of you
 * haven't answered" is what actually gets a reply. It is omitted rather than faked when the tally is
 * unavailable (seed 460 not applied, or a campaign with no members), because "0 yes" would read as
 * nobody coming.
 */
export function reminderToDiscordMessage(
  reminder: SessionReminder,
  opts: { campaignName?: string | null; tally?: RsvpTally | null; timeZone?: string } = {},
): { content: string } {
  const tz = opts.timeZone ?? REMINDER_TIMEZONE;
  const when = reminder.bucket === 'today' ? 'Today' : 'Tomorrow';
  const time = localTime(reminder.scheduledAt, tz);
  const campaign = opts.campaignName ? ` · ${opts.campaignName}` : '';
  const rsvp = opts.tally && opts.tally.members ? `\n${summarizeRsvps(opts.tally)}` : '';
  return { content: `📅 **${when}${time ? ` at ${time}` : ''}** — ${reminder.title}${campaign}${rsvp}` };
}
