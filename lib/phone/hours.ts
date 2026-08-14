// lib/phone/hours.ts — slice I1 of
// docs/planning/in-progress/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// Owner, 2026-08-14: *"I want to be able to set the hours for calling and if calls come outside of
// the specified hours, they go to voice mail."*
//
// The whole feature turns on one question — is the office open right now — and every way of getting
// that wrong is silent. A caller does not know they reached voicemail at 4:58pm because a comparison
// was `>=` instead of `>`; they know nobody picked up. So this is a pure function over stored
// settings, and the tests are the specification.
//
// ── WHY NOT `new Date().getHours()` ─────────────────────────────────────────────────────────────
//
// Which is what the existing `AFTER_HOUR = 18` cron does. On Vercel the server runs in UTC, so
// `getHours()` is UTC hours, and the office is in Central. That constant closes the office at 1pm in
// summer and noon in winter — and the winter/summer difference is the tell that this is a real bug
// and not a defensible approximation.
//
// The hours are therefore stored with an explicit IANA zone and read through `Intl`, which is the
// only thing in the platform that knows when the US changes its clocks. `America/Chicago` is not
// UTC-6; it is UTC-6 for part of the year.
//
// ── AND WHY CLOSE IS EXCLUSIVE ──────────────────────────────────────────────────────────────────
//
// "We close at 5" means a call at 17:00:00 goes to voicemail. Making it inclusive keeps the office
// open for one more minute, which sounds harmless until the person who set 08:00–17:00 finds calls
// ringing an empty office at 17:00 and concludes the setting does not work.

export interface HoursWindow {
  /** "HH:MM", 24-hour, in the configured zone. */
  open: string;
  close: string;
}

export interface PhoneHours {
  /** IANA zone. Everything is evaluated in this zone, never the server's. */
  timeZone: string;
  /** Index 0 = Sunday, matching `Date.prototype.getDay`. An empty array means closed that day. */
  days: HoursWindow[][];
  /** "YYYY-MM-DD" dates the office is closed regardless of the weekday. */
  holidays: string[];
  /** Numbers to ring during hours, in order. */
  forwardTo: string[];
  /** How long to ring before falling through to voicemail. */
  ringSeconds: number;
  greeting: string;
  afterHoursGreeting: string;
  /** When false, every call goes to voicemail — the "we are closed today" switch. */
  enabled: boolean;
}

export const DEFAULT_PHONE_HOURS: PhoneHours = {
  timeZone: 'America/Chicago',
  days: [
    [], // Sunday
    [{ open: '08:00', close: '17:00' }],
    [{ open: '08:00', close: '17:00' }],
    [{ open: '08:00', close: '17:00' }],
    [{ open: '08:00', close: '17:00' }],
    [{ open: '08:00', close: '17:00' }],
    [], // Saturday
  ],
  holidays: [],
  forwardTo: [],
  ringSeconds: 20,
  greeting: 'Thank you for calling Starr Surveying.',
  afterHoursGreeting:
    'Thank you for calling Starr Surveying. Our office is closed right now. ' +
    'Please leave your name, number, and a short message after the tone, and we will call you back.',
  enabled: true,
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Minutes past local midnight for "HH:MM", or null when it is not a time. */
export function parseClock(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min)) return null;
  // 24:00 is a real way to spell "midnight at the end of the day" and is accepted as the close of a
  // window; anything past it is not a time.
  if (h < 0 || h > 24 || min < 0 || min > 59) return null;
  if (h === 24 && min !== 0) return null;
  return h * 60 + min;
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface LocalMoment {
  /** 0 = Sunday. */
  weekday: number;
  /** Minutes past local midnight. */
  minutes: number;
  /** "YYYY-MM-DD" in the configured zone. */
  date: string;
}

/**
 * The wall-clock moment in `timeZone` for an absolute instant.
 *
 * `Intl.DateTimeFormat` with an explicit zone is the only DST-correct way to do this without a
 * dependency. An unknown zone throws inside `Intl`, and throwing here would mean an inbound call
 * gets a 500 instead of a greeting, so an unusable zone falls back to UTC and says so through
 * `describeHours` rather than taking the phone line down.
 */
export function localMoment(at: Date, timeZone: string): LocalMoment {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(at);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(at);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekdayShort = get('weekday');
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayShort);
  // `hour12: false` renders midnight as "24" in some ICU versions, which would put a 00:15 call on
  // the wrong side of every window.
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  return {
    weekday: weekday < 0 ? at.getUTCDay() : weekday,
    minutes: hour * 60 + minute,
    date: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

export type ClosedReason = 'disabled' | 'holiday' | 'day_closed' | 'outside_hours';

export interface OpenCheck {
  open: boolean;
  reason: ClosedReason | null;
  /** The window that was matched, when open. */
  window: HoursWindow | null;
  local: LocalMoment;
}

/**
 * Is the office open at this instant?
 *
 * `open` is inclusive, `close` is exclusive — see the header.
 */
export function isOpenAt(at: Date, hours: PhoneHours = DEFAULT_PHONE_HOURS): OpenCheck {
  const local = localMoment(at, hours.timeZone);
  const closed = (reason: ClosedReason): OpenCheck => ({ open: false, reason, window: null, local });

  if (!hours.enabled) return closed('disabled');
  if (hours.holidays.includes(local.date)) return closed('holiday');

  const windows = hours.days[local.weekday] ?? [];
  if (windows.length === 0) return closed('day_closed');

  for (const w of windows) {
    const open = parseClock(w.open);
    const close = parseClock(w.close);
    // A malformed or backwards window is skipped rather than spanning midnight. Treating
    // close < open as an overnight shift would quietly hold the line open all night for what is
    // almost always a typo (17:00–08:00 instead of 08:00–17:00).
    if (open === null || close === null || close <= open) continue;
    if (local.minutes >= open && local.minutes < close) {
      return { open: true, reason: null, window: w, local };
    }
  }
  return closed('outside_hours');
}

/** Human-readable summary for the settings screen and the health probe. */
export function describeHours(hours: PhoneHours): string[] {
  const out: string[] = [];
  if (!hours.enabled) out.push('Calls are set to go straight to voicemail.');
  for (let d = 0; d < 7; d++) {
    const windows = (hours.days[d] ?? []).filter(
      (w) => parseClock(w.open) !== null && parseClock(w.close) !== null,
    );
    out.push(
      windows.length === 0
        ? `${DAY_NAMES[d]}: closed`
        : `${DAY_NAMES[d]}: ${windows.map((w) => `${w.open}–${w.close}`).join(', ')}`,
    );
  }
  if (hours.holidays.length > 0) out.push(`Closed on: ${hours.holidays.join(', ')}`);
  return out;
}

/**
 * Coerce whatever is in `app_settings` into usable hours.
 *
 * Settings JSON is written by a UI today and by a person with `psql` tomorrow, so every field is
 * validated and falls back individually — a bad `ringSeconds` must not discard the opening times.
 */
export function parsePhoneHours(raw: unknown): PhoneHours {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PHONE_HOURS;

  const days: HoursWindow[][] = [];
  const rawDays = Array.isArray(src.days) ? src.days : null;
  for (let i = 0; i < 7; i++) {
    const day = rawDays?.[i];
    if (!Array.isArray(day)) {
      days.push(rawDays ? [] : d.days[i]);
      continue;
    }
    days.push(
      day
        .filter((w): w is HoursWindow =>
          Boolean(w) && typeof w === 'object' &&
          parseClock((w as HoursWindow).open) !== null &&
          parseClock((w as HoursWindow).close) !== null)
        .map((w) => ({ open: w.open, close: w.close })),
    );
  }

  const str = (v: unknown, fallback: string) =>
    typeof v === 'string' && v.trim() ? v.trim() : fallback;

  return {
    timeZone: str(src.timeZone, d.timeZone),
    days,
    holidays: Array.isArray(src.holidays)
      ? src.holidays.filter((h): h is string => typeof h === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h))
      : [],
    forwardTo: Array.isArray(src.forwardTo)
      ? src.forwardTo.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
      : [],
    ringSeconds:
      typeof src.ringSeconds === 'number' && Number.isFinite(src.ringSeconds)
        ? Math.min(120, Math.max(5, Math.round(src.ringSeconds)))
        : d.ringSeconds,
    greeting: str(src.greeting, d.greeting),
    afterHoursGreeting: str(src.afterHoursGreeting, d.afterHoursGreeting),
    enabled: typeof src.enabled === 'boolean' ? src.enabled : d.enabled,
  };
}
