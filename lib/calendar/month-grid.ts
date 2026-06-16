// lib/calendar/month-grid.ts
//
// job-calendar Slice C1 — pure helpers for the month view. Keeps the
// date math testable without React. The calendar page consumes these
// to build the 42-day grid + figure out which day owns which event.

export interface MonthCell {
  /** YYYY-MM-DD in America/Chicago — the canonical key the React side
   *  uses to group events into squares. */
  iso: string;
  /** JS Date at midnight Central. Use only for display / formatting; for
   *  comparisons + storage prefer `iso`. */
  date: Date;
  /** Day-of-month number (1–31). */
  day: number;
  /** True when this cell falls inside the focused month (the surrounding
   *  6×7 grid leaks into the prior + next month for layout). */
  inMonth: boolean;
  /** True when this cell is today in America/Chicago. */
  isToday: boolean;
}

/** Returns the 42-day window covering the given year + month — always
 *  starts on a Sunday, always 6 rows × 7 cols. Stable layout so the
 *  page never reflows when navigating between months. */
export function buildMonthGrid(year: number, monthZeroIdx: number): MonthCell[] {
  const firstOfMonth = new Date(year, monthZeroIdx, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sunday
  const gridStart = new Date(year, monthZeroIdx, 1 - startOffset);
  const todayIso = isoOfDate(new Date());
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    cells.push({
      iso: isoOfDate(d),
      date: d,
      day: d.getDate(),
      inMonth: d.getMonth() === monthZeroIdx && d.getFullYear() === year,
      isToday: isoOfDate(d) === todayIso,
    });
  }
  return cells;
}

/** YYYY-MM-DD for the local calendar date of `d`. Using local-tz here
 *  intentionally — the user lives in America/Chicago and a future
 *  surveyor in another TZ would expect calendar squares to match THEIR
 *  local day, not UTC. */
export function isoOfDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ISO of the day an event's `start_time` falls on, in local tz. */
export function eventDayIso(startTime: string): string {
  return isoOfDate(new Date(startTime));
}

/** Window the calendar fetches — slightly wider than the grid so events
 *  that started yesterday + end tomorrow still surface on today's cell. */
export function monthGridWindow(year: number, monthZeroIdx: number): {
  fromIso: string;
  toIso: string;
} {
  const cells = buildMonthGrid(year, monthZeroIdx);
  const firstCell = cells[0];
  const lastCell = cells[cells.length - 1];
  // Pad by ±1 day on both ends so a multi-day event that straddles the
  // window edges still renders correctly.
  const fromDate = new Date(firstCell.date);
  fromDate.setDate(fromDate.getDate() - 1);
  const toDate = new Date(lastCell.date);
  toDate.setDate(toDate.getDate() + 2);
  return {
    fromIso: fromDate.toISOString(),
    toIso: toDate.toISOString(),
  };
}

/** Group events by their start-day local ISO. Multi-day events are
 *  attached to every day in their range (capped at 42 days to match
 *  grid). The calendar renders each appearance as its own pill so a
 *  3-day field-work stint shows on all three squares. */
export function groupEventsByDay<T extends { start_time: string; end_time: string }>(
  events: T[],
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const ev of events) {
    const startDay = new Date(ev.start_time);
    const endDay = new Date(ev.end_time);
    // Walk by 24h steps from start-of-day(startDay) → start-of-day(endDay).
    const cur = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate());
    const endOfRange = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate());
    let guard = 0;
    while (cur.getTime() <= endOfRange.getTime() && guard < 42) {
      const iso = isoOfDate(cur);
      const arr = out.get(iso) ?? [];
      arr.push(ev);
      out.set(iso, arr);
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
  }
  return out;
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Visual color for the three job phases. The calendar reads this to
 *  paint the accent strip on each event pill. Tokens land in G1; today
 *  this is a literal map so C1 ships without a tokens dependency. */
export const PHASE_COLORS: Record<string, string> = {
  research: '#0D9488',           // teal
  field_work: '#D97706',         // amber (matches the warningCallout family)
  drawing_deliverables: '#7C3AED', // violet
  // Fallback for non-phase events that happen to land in this view.
  other: '#6B7280',
};

/** Human label for the three phases + safe fallback. */
export const PHASE_LABELS: Record<string, string> = {
  research: 'Research',
  field_work: 'Field Work',
  drawing_deliverables: 'Drawing & Deliverables',
  other: 'Other',
};

/** Step the focused month by `delta` months and return the new
 *  (year, monthZeroIdx) pair. Used by prev/next nav. */
export function stepMonth(
  year: number,
  monthZeroIdx: number,
  delta: number,
): { year: number; monthZeroIdx: number } {
  const d = new Date(year, monthZeroIdx + delta, 1);
  return { year: d.getFullYear(), monthZeroIdx: d.getMonth() };
}
