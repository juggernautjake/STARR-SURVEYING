// lib/notifications/job-prefs.ts — slice N4 of
// docs/planning/in-progress/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// ── THE RULE N3 CANNOT SHIP WITHOUT ─────────────────────────────────────────────────────────────
//
// N3 makes twelve job mutations notify. Every one of them is something the owner explicitly asked to
// be told about, and delivering all twelve at full volume produces a phone that gets muted — which
// loses the briefing that says the gate code changed along with the fourth photo of a fence corner.
//
// The distinction that makes this work is not "important vs unimportant". It is:
//
//   · does this change what I have to DO?         → immediate
//   · is this a record of somebody working?       → digest
//
// A stage change, a schedule move, a posted briefing, a sealed deliverable: all of those change
// somebody's day. A file upload, a photo, a linked receipt: those are the log. Nothing is dropped by
// default — a digested event is delivered in one message at the end of the day, with its link.
//
// ── WHY THE DEFAULTS LIVE IN CODE AND NOT IN THE TABLE ──────────────────────────────────────────
//
// `job_notification_prefs.channels` is a sparse map. An absent key falls through to here, so:
//   · improving a default improves it for everyone who never opened the settings page;
//   · an event kind added next month has a sensible setting the day it ships, rather than being
//     unconfigured for everybody until somebody remembers to backfill a column.

import type { JobEventKind } from './job-event';

export type JobEventChannel = 'immediate' | 'digest' | 'off';

/** What each event does by default. See the header for the rule that decided each line. */
export const DEFAULT_JOB_EVENT_CHANNELS: Record<JobEventKind, JobEventChannel> = {
  // Changes what you have to do.
  stage_changed: 'immediate',
  schedule_changed: 'immediate',
  instructions_changed: 'immediate',
  briefing_published: 'immediate',
  team_changed: 'immediate',
  deliverable_sealed: 'immediate',
  deliverable_issued: 'immediate',
  payment_recorded: 'immediate',
  // The log of somebody working. Real, worth knowing, not worth interrupting for — and these are
  // the ones that arrive four at a time.
  file_uploaded: 'digest',
  photo_uploaded: 'digest',
  receipt_linked: 'digest',
  deliverable_created: 'digest',
  briefing_appended: 'digest',
};

/** A row of `job_notification_prefs`, narrowed to what routing needs. */
export interface JobNotificationPrefRow {
  user_email: string;
  channels?: Record<string, string> | null;
  digest_hour?: number | null;
}

/**
 * How this event reaches this person.
 *
 * An unrecognised stored value resolves to the default rather than to `off`. Deliberate: a typo, a
 * half-written migration or a client sending `"Immediate"` must never silence somebody — failing
 * closed here means a person stops being told and nobody finds out, which is the exact failure this
 * whole group of slices exists to fix.
 */
export function channelFor(
  kind: JobEventKind | string,
  prefs: JobNotificationPrefRow | null | undefined,
): JobEventChannel {
  const fallback = DEFAULT_JOB_EVENT_CHANNELS[kind as JobEventKind] ?? 'immediate';
  const stored = prefs?.channels?.[kind];
  if (stored === 'immediate' || stored === 'digest' || stored === 'off') return stored;
  return fallback;
}

export interface RoutedRecipients {
  /** Told now. */
  immediate: string[];
  /** Queued for the daily digest. */
  digest: string[];
  /** Told nothing, because they asked not to be. Returned rather than discarded so a caller can
   *  report an honest count — "notified 6" when two of them switched this event off is a number
   *  that makes the notification system look like it is lying. */
  off: string[];
}

/**
 * Split the people on a job by how each of them wants to hear about this event.
 *
 * Pure: the preference read is the caller's. Matching is case-insensitive on the email because
 * `job_team` and a settings page written months apart do not agree about capitalisation, and a
 * preference that silently fails to apply reads as the setting being ignored.
 */
export function routeRecipients(
  recipients: readonly string[],
  kind: JobEventKind | string,
  prefsByEmail: ReadonlyMap<string, JobNotificationPrefRow>,
): RoutedRecipients {
  const out: RoutedRecipients = { immediate: [], digest: [], off: [] };
  for (const email of recipients) {
    out[channelFor(kind, prefsByEmail.get(email.trim().toLowerCase()))].push(email);
  }
  return out;
}

/** Index preference rows by lower-cased email, ready for `routeRecipients`. */
export function indexPrefs(rows: readonly JobNotificationPrefRow[]): Map<string, JobNotificationPrefRow> {
  return new Map(rows.map((r) => [r.user_email.trim().toLowerCase(), r]));
}

export interface DigestLine {
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
  created_at: string;
}

export interface ComposedDigest {
  title: string;
  body: string;
  /** Where the digest itself links. The single most recent event, so tapping the banner lands
   *  somewhere real rather than on a list page — a digest whose link goes nowhere in particular is
   *  a digest people read and then have to go hunting from. */
  link: string | null;
}

/**
 * Fold a day of queued events into one message.
 *
 * Grouped by job, because "3 things happened" across three jobs and "3 things happened" on one job
 * are different situations and the reader is deciding whether to open the phone at all.
 */
export function composeDigest(lines: readonly DigestLine[]): ComposedDigest | null {
  if (lines.length === 0) return null;

  const ordered = lines.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  // `title` already reads "<number> · <name> — <what happened>" (see notifyJobEvent), so the job is
  // whatever precedes the em dash. Splitting the rendered title rather than carrying a separate job
  // name keeps one definition of how a job is named in a notification.
  const byJob = new Map<string, DigestLine[]>();
  for (const l of ordered) {
    const job = l.title.includes(' — ') ? l.title.slice(0, l.title.indexOf(' — ')) : 'Your jobs';
    byJob.set(job, [...(byJob.get(job) ?? []), l]);
  }

  const jobCount = byJob.size;
  const title = jobCount === 1
    ? `${[...byJob.keys()][0]} — ${lines.length} update${lines.length === 1 ? '' : 's'} today`
    : `${lines.length} updates on ${jobCount} jobs today`;

  const body = [...byJob.entries()]
    .map(([job, entries]) => {
      const detail = entries
        .map((e) => `· ${e.title.includes(' — ') ? e.title.slice(e.title.indexOf(' — ') + 3) : e.title}`)
        .join('\n');
      return jobCount === 1 ? detail : `${job}\n${detail}`;
    })
    .join('\n\n');

  return { title, body, link: ordered[ordered.length - 1]?.link ?? null };
}

/**
 * Is it this user's digest hour?
 *
 * The cron runs hourly and asks this per user rather than each user owning a schedule. `nowHour` is
 * the caller's — passed in so the timezone conversion happens once, at the edge, instead of being
 * re-derived (differently) here.
 */
export function isDigestHour(nowHour: number, prefs: JobNotificationPrefRow | null | undefined): boolean {
  const hour = prefs?.digest_hour;
  return (typeof hour === 'number' && hour >= 0 && hour <= 23 ? hour : 17) === nowHour;
}
