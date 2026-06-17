// lib/calendar/week-grid.ts
//
// job-calendar Slice C2 — pure helpers for the week + day views.
// Same separation as month-grid.ts: date math here, React there.

import { isoOfDate } from './month-grid';

export type CalendarView = 'month' | 'week' | 'day';

/** Coerce an arbitrary string to a known view, falling back to month. */
export function parseView(raw: string | null | undefined): CalendarView {
  if (raw === 'week' || raw === 'day' || raw === 'month') return raw;
  return 'month';
}

export interface WeekCell {
  iso: string;
  date: Date;
  day: number;
  weekday: string;
  isToday: boolean;
}

/** Returns the 7 days starting on the Sunday on-or-before `focus`. */
export function buildWeekCells(focus: Date): WeekCell[] {
  const todayIso = isoOfDate(new Date());
  const startOffset = focus.getDay();
  const sunday = new Date(focus.getFullYear(), focus.getMonth(), focus.getDate() - startOffset);
  const out: WeekCell[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
    out.push({
      iso: isoOfDate(d),
      date: d,
      day: d.getDate(),
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()],
      isToday: isoOfDate(d) === todayIso,
    });
  }
  return out;
}

/** Day view = a single WeekCell-shaped object. */
export function buildDayCell(focus: Date): WeekCell {
  const todayIso = isoOfDate(new Date());
  return {
    iso: isoOfDate(focus),
    date: focus,
    day: focus.getDate(),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][focus.getDay()],
    isToday: isoOfDate(focus) === todayIso,
  };
}

/** Step the focused date by the view's unit. The calendar passes
 *  the current view + delta (+1 / -1) and gets the next focus date. */
export function stepFocus(
  focus: Date,
  view: CalendarView,
  delta: number,
): Date {
  const y = focus.getFullYear();
  const m = focus.getMonth();
  const d = focus.getDate();
  if (view === 'month') return new Date(y, m + delta, 1);
  if (view === 'week') return new Date(y, m, d + delta * 7);
  return new Date(y, m, d + delta);
}

/** Window the calendar fetches in week / day views. Always anchored
 *  to local-day boundaries; padded by ±1 day so a multi-day event
 *  spilling over the edges still surfaces. */
export function weekWindow(focus: Date, view: 'week' | 'day'): {
  fromIso: string;
  toIso: string;
} {
  const start =
    view === 'week'
      ? buildWeekCells(focus)[0].date
      : new Date(focus.getFullYear(), focus.getMonth(), focus.getDate());
  const days = view === 'week' ? 7 : 1;
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days);
  const fromDate = new Date(start);
  fromDate.setDate(fromDate.getDate() - 1);
  const toDate = new Date(end);
  toDate.setDate(toDate.getDate() + 1);
  return { fromIso: fromDate.toISOString(), toIso: toDate.toISOString() };
}

/** Hour-row labels for the week + day grids. Window keeps it
 *  workday-friendly (6am to 9pm) so the grid stays a sensible
 *  height; a wider window can be enabled later as a preference. */
export const HOUR_ROWS = [
  { hour: 6, label: '6 AM' },
  { hour: 7, label: '7 AM' },
  { hour: 8, label: '8 AM' },
  { hour: 9, label: '9 AM' },
  { hour: 10, label: '10 AM' },
  { hour: 11, label: '11 AM' },
  { hour: 12, label: '12 PM' },
  { hour: 13, label: '1 PM' },
  { hour: 14, label: '2 PM' },
  { hour: 15, label: '3 PM' },
  { hour: 16, label: '4 PM' },
  { hour: 17, label: '5 PM' },
  { hour: 18, label: '6 PM' },
  { hour: 19, label: '7 PM' },
  { hour: 20, label: '8 PM' },
  { hour: 21, label: '9 PM' },
] as const;

export const FIRST_HOUR = HOUR_ROWS[0].hour;
export const LAST_HOUR = HOUR_ROWS[HOUR_ROWS.length - 1].hour;

/** Position an event within the hour grid. Returns the top % + height
 *  % of the day column. Events outside the [FIRST_HOUR, LAST_HOUR+1)
 *  window clamp to the visible edges. */
export function eventGridPosition(
  startIso: string,
  endIso: string,
): { topPct: number; heightPct: number } {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  const windowStart = FIRST_HOUR * 60;
  const windowEnd = (LAST_HOUR + 1) * 60; // inclusive of last row
  const windowSpan = windowEnd - windowStart;
  const clampedStart = Math.max(windowStart, Math.min(windowEnd, startMin));
  const clampedEnd = Math.max(clampedStart, Math.min(windowEnd, endMin));
  const topPct = ((clampedStart - windowStart) / windowSpan) * 100;
  const heightPct = ((clampedEnd - clampedStart) / windowSpan) * 100;
  return { topPct, heightPct: Math.max(2, heightPct) }; // floor at 2% so a 5-min event is still visible
}

/** Pretty header label for the active view. */
export function viewHeaderLabel(focus: Date, view: CalendarView): string {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  if (view === 'month') return `${monthNames[focus.getMonth()]} ${focus.getFullYear()}`;
  if (view === 'day') {
    return focus.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/Chicago',
    });
  }
  // Week — "Jun 14 – Jun 20, 2026"
  const cells = buildWeekCells(focus);
  const start = cells[0].date;
  const end = cells[6].date;
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
}
