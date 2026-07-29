// lib/dnd/session-schedule.ts — when is the next session? (P1-5, audit B-5).
//
// `dnd_sessions.scheduled_at` has existed in the schema and sat in the PATCH route's `WRITABLE` list for a
// long time. Nothing ever set it and nothing ever rendered it — a column that was ready and unreachable,
// the same shape as the currency fields in P1-2 and `FEATS_2014_STATUS` in P1-3.
//
// Everything here is PURE so the timezone handling — the part that is genuinely easy to get wrong — is
// testable without a browser. The rule the whole file follows: **store UTC, render local.** The database
// holds an ISO instant; `<input type="datetime-local">` speaks the viewer's wall clock and carries no zone
// at all, so the two conversions below are where that gap is bridged, once.

export interface ScheduledSession {
  id: string;
  title: string;
  status: string;
  scheduled_at?: string | null;
}

/** A valid Date, or null — the single guard every function here goes through. */
function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * An ISO instant → the `YYYY-MM-DDTHH:mm` a `datetime-local` input expects, in the VIEWER's zone.
 *
 * `toISOString()` is deliberately not used: it would render the UTC wall clock, so a session at 19:00 in
 * London would populate the box as 18:00 in summer and nobody would notice until someone showed up an hour
 * early. The local getters are the whole point of this function.
 */
export function toLocalInputValue(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * A `datetime-local` value → the ISO instant to store, or null when the field was cleared.
 *
 * `new Date('2026-08-01T19:00')` — no zone suffix — is interpreted as LOCAL time by every engine, which is
 * exactly what the input means. Returning null for an empty string is what lets a DM unschedule.
 */
export function fromLocalInputValue(value: string): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Render an instant in the viewer's locale and zone. Empty string when unset, so callers can `||` it. */
export function formatSessionTime(iso: string | null | undefined, locale?: string): string {
  const d = parse(iso);
  if (!d) return '';
  return d.toLocaleString(locale, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/**
 * The NEXT session: the soonest one scheduled at or after `now` that is not already finished.
 *
 * Three decisions, each of which would be a plausible-looking bug the other way:
 *  · `done` sessions are excluded even if their timestamp is in the future — a session someone marked
 *    finished early is not the next thing the party is doing.
 *  · A `live` session in the past still counts. That is the session happening RIGHT NOW, and hiding it the
 *    moment its start time passes is precisely when the banner is most useful.
 *  · Unscheduled sessions never win. A campaign that schedules nothing shows no banner rather than
 *    nominating an arbitrary row.
 */
export function nextSession<T extends ScheduledSession>(sessions: readonly T[], now: Date = new Date()): T | null {
  let best: T | null = null;
  let bestTime = Infinity;
  for (const s of sessions ?? []) {
    if (s.status === 'done') continue;
    const d = parse(s.scheduled_at);
    if (!d) continue;
    const t = d.getTime();
    if (s.status !== 'live' && t < now.getTime()) continue;
    if (t < bestTime) { best = s; bestTime = t; }
  }
  return best;
}

/**
 * "in 3 days" / "in 2 hours" / "now" / "started 40 minutes ago" — the relative half of the banner.
 *
 * Uses `Intl.RelativeTimeFormat` rather than hand-rolled arithmetic so it localises properly. The unit is
 * chosen by magnitude: minutes under an hour, hours under a day, then days.
 */
export function relativeSessionTime(iso: string | null | undefined, now: Date = new Date(), locale?: string): string {
  const d = parse(iso);
  if (!d) return '';
  const diffMs = d.getTime() - now.getTime();
  const mins = Math.round(diffMs / 60000);
  if (Math.abs(mins) < 1) return 'now';
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
}
