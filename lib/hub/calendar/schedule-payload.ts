// lib/hub/calendar/schedule-payload.ts
//
// Slice 3 of hub-widget-excellence-04-calendar. Pure validation +
// payload builder for the widget's inline "+ Add event" form. The
// widget POSTs the result to /api/admin/schedule. Dependency-free +
// unit-testable; datetimes are kept as local `YYYY-MM-DDTHH:MM` strings
// (the API accepts them) so the builder is deterministic in tests.

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
}

export interface SchedulePayload {
  title: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  event_type: string;
  location: string | null;
  color: string | null;
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
    },
  };
}
