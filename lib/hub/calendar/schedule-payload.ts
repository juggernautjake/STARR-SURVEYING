// lib/hub/calendar/schedule-payload.ts
//
// Slice 3 of hub-widget-excellence-04-calendar. Pure validation +
// payload builder for the widget's inline "+ Add event" form. The
// widget POSTs the result to /api/admin/schedule. Dependency-free +
// unit-testable; datetimes are kept as local `YYYY-MM-DDTHH:MM` strings
// (the API accepts them) so the builder is deterministic in tests.

/** Slice S2 — visibility model. The DB column is constrained to
 *  these three values; the UI surfaces the same trio. */
export type EventVisibility = 'private' | 'specific_users' | 'all_users';

export const EVENT_VISIBILITIES: ReadonlyArray<EventVisibility> = [
  'private', 'specific_users', 'all_users',
];

export interface AddEventForm {
  title: string;
  /** 'YYYY-MM-DD' */
  date: string;
  allDay: boolean;
  /** 'HH:MM' (required when not all-day). */
  startTime?: string;
  endTime?: string;
  location?: string;
  eventType?: string;
  color?: string;
  /** Slice S2 — visibility model. Defaults to 'private' so a user
   *  who never opens the new selector ships a private event. */
  visibility?: EventVisibility;
  /** Slice S2 — comma- or newline-separated emails for
   *  'specific_users' mode. Parsed by parseViewerEmails. */
  viewerEmailsRaw?: string;
  /** Slice S3 — per-event reminder leads (in minutes). Empty list
   *  means "no reminders". Undefined falls through to the DB
   *  default `[60]`. The form surfaces the canonical
   *  REMINDER_LEAD_CHOICES picks via a checkbox group. */
  reminderMinutesBefore?: number[];
}

export interface SchedulePayload {
  title: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  event_type: string;
  location: string | null;
  color: string | null;
  /** Slice S2 — always echoed on POST/PATCH; defaults to 'private'. */
  visibility: EventVisibility;
  /** Slice S2 — empty for private + all_users modes; non-empty list
   *  for specific_users. */
  viewer_emails: string[];
  /** Slice S3 — sorted-asc, deduplicated, positive-only reminder
   *  leads. Empty array means "no reminders". The DB column is
   *  NOT NULL DEFAULT '{60}' so omitting it from the payload is
   *  also safe; the builder always includes it for clarity. */
  reminder_minutes_before: number[];
}

export type BuildScheduleResult =
  | { ok: true; payload: SchedulePayload }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// 00:00–23:59 only — a stray "25:99" must fail validation.
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Validate the add-event form and build the POST payload, or return a
 * human error. All-day events span 00:00–23:59 of the date; timed
 * events require start < end on the same day.
 */
export function buildSchedulePayload(form: AddEventForm): BuildScheduleResult {
  const title = form.title?.trim();
  if (!title) return { ok: false, error: 'Title is required.' };
  if (!form.date || !DATE_RE.test(form.date)) {
    return { ok: false, error: 'A valid date is required.' };
  }

  let start_time: string;
  let end_time: string;

  if (form.allDay) {
    start_time = `${form.date}T00:00`;
    end_time = `${form.date}T23:59`;
  } else {
    if (!form.startTime || !TIME_RE.test(form.startTime)) {
      return { ok: false, error: 'A valid start time is required.' };
    }
    if (!form.endTime || !TIME_RE.test(form.endTime)) {
      return { ok: false, error: 'A valid end time is required.' };
    }
    if (form.endTime <= form.startTime) {
      return { ok: false, error: 'End time must be after the start time.' };
    }
    start_time = `${form.date}T${form.startTime}`;
    end_time = `${form.date}T${form.endTime}`;
  }

  // Slice S2 — visibility + viewer_emails. Defaults to 'private'
  // so a caller that doesn't set the field still ships a safe
  // value (the DB column is NOT NULL DEFAULT 'private' too).
  const visibility: EventVisibility = form.visibility ?? 'private';
  if (!EVENT_VISIBILITIES.includes(visibility)) {
    return { ok: false, error: 'Visibility must be private, specific_users, or all_users.' };
  }
  const viewerEmails = visibility === 'specific_users'
    ? parseViewerEmails(form.viewerEmailsRaw ?? '')
    : [];
  if (visibility === 'specific_users' && viewerEmails.length === 0) {
    return { ok: false, error: 'Pick at least one viewer for a specific-users event.' };
  }

  // Slice S3 — clean up the reminder leads: drop anything
  // non-numeric or non-positive, dedupe, sort ascending so the
  // cron's per-lead loop produces stable test output. Default to
  // `[60]` when the caller omits the field, matching the DB
  // column's NOT NULL DEFAULT.
  const reminderMinutesBefore = normalizeReminderLeads(form.reminderMinutesBefore);

  return {
    ok: true,
    payload: {
      title,
      start_time,
      end_time,
      all_day: form.allDay,
      event_type: form.eventType?.trim() || 'other',
      location: form.location?.trim() || null,
      color: form.color?.trim() || null,
      visibility,
      viewer_emails: viewerEmails,
      reminder_minutes_before: reminderMinutesBefore,
    },
  };
}

/** Slice S3 — pure helper. Takes a possibly-undefined / messy
 *  array of reminder leads and returns a sorted, deduplicated,
 *  positive-only number[]. Undefined falls through to `[60]` so a
 *  caller that doesn't surface the picker still gets the
 *  legacy 1-hour reminder. Exported for direct testing. */
export function normalizeReminderLeads(input: number[] | undefined): number[] {
  if (input === undefined) return [60];
  const seen = new Set<number>();
  for (const v of input) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue;
    seen.add(Math.round(v));
  }
  return Array.from(seen).sort((a, b) => a - b);
}

/** Slice S2 — parse a raw textarea (comma- and/or newline-
 *  separated) into a clean list of lowercased, de-duplicated
 *  emails. Rejects entries that don't look like an email so a
 *  typo doesn't silently land in the database. Pure + exported
 *  so the test suite can pin the contract. */
export function parseViewerEmails(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(/[\s,]+/)) {
    const e = piece.trim().toLowerCase();
    if (!e) continue;
    // Liberal email check: one @ surrounded by non-empty text, then
    // a dot somewhere after. Enough to catch typos like "alice"
    // without rejecting valid emails the strict RFC would allow.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}
