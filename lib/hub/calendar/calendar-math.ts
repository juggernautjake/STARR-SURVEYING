// lib/hub/calendar/calendar-math.ts
//
// Slice 1 of hub-widget-excellence-04-calendar. Pure, DOM-free date
// math behind the size-adaptive schedule widget. All UTC-based so it's
// deterministic + timezone-stable in tests and on the server.
//
// Schedule API contract (audited 2026-05-30, app/api/admin/schedule):
//   GET  ?from=&to=  → { events: Event[] } with recurrence expanded
//                      (lib/schedule/recurrence.expandRecurrence); a
//                      recurring occurrence's id is `${seriesId}:${date}`.
//   POST { title, start_time, end_time, event_type, all_day, location,
//          notes, job_id, color, recurrence_rule, recurrence_end,
//          status } → created row (with conflict pre-check).
//   PATCH { id, ...fields } → updates; id is split on ':' so a
//          recurrence-instance id edits the series row.
//   DELETE { id } → removes.
//   SELECT cols: id, title, event_type, start_time, end_time, all_day,
//   location, notes, job_id, assigned_to, assigned_by, color,
//   created_at, recurrence_rule, recurrence_end, series_id, status.

import type { SizeBucket } from '@/lib/hub/size-bucket';

/** The three presentations the widget switches between by size. */
export type CalendarView = 'agenda' | 'agenda-wide' | 'grid';

/** One cell in a month/week grid. `month` is 1-indexed (1 = January). */
export interface CalendarDay {
  iso: string;       // 'YYYY-MM-DD'
  year: number;
  month: number;     // 1-12
  day: number;       // 1-31
  weekday: number;   // 0 = Sunday … 6 = Saturday
  /** True when this cell belongs to the grid's focus month (vs. a
   *  leading/trailing day from an adjacent month). */
  inMonth: boolean;
}

/** Minimal event shape the math needs (a subset of the API event). */
export interface CalendarEvent {
  start_time?: string | null;
  end_time?: string | null;
}

const DAY_MS = 86_400_000;

function pad2(n: number): number | string {
  return n < 10 ? `0${n}` : n;
}

function isoOf(utcMs: number): string {
  const d = new Date(utcMs);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function dayFromUtc(utcMs: number, focusMonth: number, focusYear: number): CalendarDay {
  const d = new Date(utcMs);
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear();
  return {
    iso: isoOf(utcMs),
    year,
    month,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    inMonth: month === focusMonth && year === focusYear,
  };
}

/** The ISO date portion of an ISO datetime (or '' when absent). */
export function datePart(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m ? m[1] : '';
}

/** True when two ISO datetimes/dates fall on the same calendar day. */
export function isSameDay(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = datePart(a);
  return da !== '' && da === datePart(b);
}

/**
 * Month grid (weeks × 7 days) for a 1-indexed month, padded with the
 * leading/trailing days needed to fill whole weeks. `weekStartsOn`
 * defaults to Sunday (0).
 */
export function monthGrid(year: number, month: number, weekStartsOn = 0): CalendarDay[][] {
  const firstUtc = Date.UTC(year, month - 1, 1);
  const firstWeekday = new Date(firstUtc).getUTCDay();
  const lead = (firstWeekday - weekStartsOn + 7) % 7;
  const startUtc = firstUtc - lead * DAY_MS;

  const lastUtc = Date.UTC(year, month, 0); // day 0 of next month = last day
  const lastWeekday = new Date(lastUtc).getUTCDay();
  const trail = (weekStartsOn + 6 - lastWeekday + 7) % 7;
  const endUtc = lastUtc + trail * DAY_MS;

  const weeks: CalendarDay[][] = [];
  let current: CalendarDay[] = [];
  for (let t = startUtc; t <= endUtc; t += DAY_MS) {
    current.push(dayFromUtc(t, month, year));
    if (current.length === 7) {
      weeks.push(current);
      current = [];
    }
  }
  return weeks;
}

/** The 7 days of the week containing `iso` (a date or datetime). */
export function weekDays(iso: string, weekStartsOn = 0): CalendarDay[] {
  const base = datePart(iso);
  const [y, m, d] = base.split('-').map(Number);
  const baseUtc = Date.UTC(y, m - 1, d);
  const weekday = new Date(baseUtc).getUTCDay();
  const lead = (weekday - weekStartsOn + 7) % 7;
  const startUtc = baseUtc - lead * DAY_MS;
  const out: CalendarDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    out.push(dayFromUtc(startUtc + i * DAY_MS, m, y));
  }
  return out;
}

/**
 * Events that touch `dayIso` — start date ≤ day ≤ end date (date-only),
 * so multi-day events appear on every day they span. Events without a
 * start are skipped; a missing end defaults to the start.
 */
export function eventsForDay<T extends CalendarEvent>(events: readonly T[], dayIso: string): T[] {
  const day = datePart(dayIso);
  if (!day) return [];
  return events.filter((e) => {
    const start = datePart(e.start_time);
    if (!start) return false;
    const end = datePart(e.end_time) || start;
    return start <= day && day <= end;
  });
}

/**
 * Clamp an event to a given day for chip rendering: the in-day start/end
 * datetimes plus flags for whether it continues beyond the day.
 */
export function clampEventToDay(
  event: CalendarEvent,
  dayIso: string,
): { start: string; end: string; continuesBefore: boolean; continuesAfter: boolean } {
  const day = datePart(dayIso);
  const dayStart = `${day}T00:00:00.000Z`;
  const dayEnd = `${day}T23:59:59.999Z`;
  const evStart = event.start_time ?? dayStart;
  const evEnd = event.end_time ?? evStart;
  const continuesBefore = datePart(evStart) < day;
  const continuesAfter = datePart(evEnd) > day;
  return {
    start: continuesBefore ? dayStart : evStart,
    end: continuesAfter ? dayEnd : evEnd,
    continuesBefore,
    continuesAfter,
  };
}

/** Which presentation a given size bucket should render. */
export function bucketToView(bucket: SizeBucket): CalendarView {
  switch (bucket) {
    case 'tiny':
    case 'small':
      return 'agenda';
    case 'medium':
      return 'agenda-wide';
    case 'large':
    case 'xlarge':
    default:
      return 'grid';
  }
}
