// __tests__/calendar/c1-month-grid.test.ts
//
// job-calendar Slice C1 — month-view grid + page shell. Locks the
// pure helpers' invariants + the page's data-attribute contract so
// the C2 view switcher + C3 fullscreen mode can extend the page
// without breaking the test surface.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildMonthGrid,
  groupEventsByDay,
  isoOfDate,
  eventDayIso,
  monthGridWindow,
  stepMonth,
  MONTH_NAMES,
  DAY_HEADERS,
  PHASE_COLORS,
  PHASE_LABELS,
} from '@/lib/calendar/month-grid';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('buildMonthGrid — pure helper', () => {
  it('always returns 42 cells regardless of month length', () => {
    expect(buildMonthGrid(2026, 0).length).toBe(42); // January (31 days)
    expect(buildMonthGrid(2026, 1).length).toBe(42); // February (28 days)
    expect(buildMonthGrid(2024, 1).length).toBe(42); // February leap year (29 days)
    expect(buildMonthGrid(2026, 5).length).toBe(42); // June (30 days)
  });

  it('always starts on a Sunday so the weekday header row aligns', () => {
    const cells = buildMonthGrid(2026, 5); // June 2026 — June 1 is a Monday
    expect(cells[0].date.getDay()).toBe(0); // Sunday
  });

  it('marks in-month vs surrounding-month days correctly', () => {
    const cells = buildMonthGrid(2026, 5); // June 2026
    // June 1, 2026 is a Monday; the leading Sunday is May 31.
    expect(cells[0].inMonth).toBe(false); // May 31
    expect(cells[1].inMonth).toBe(true);  // June 1
    expect(cells[1].day).toBe(1);
  });

  it('marks today when the grid covers the current date', () => {
    const today = new Date();
    const cells = buildMonthGrid(today.getFullYear(), today.getMonth());
    const todayCell = cells.find((c) => c.isToday);
    expect(todayCell).toBeDefined();
    expect(todayCell?.day).toBe(today.getDate());
  });

  it('marks no cell as today when the grid is far in the past', () => {
    const cells = buildMonthGrid(1999, 0);
    expect(cells.find((c) => c.isToday)).toBeUndefined();
  });
});

describe('isoOfDate / eventDayIso — local-tz contract', () => {
  it('returns YYYY-MM-DD zero-padded', () => {
    expect(isoOfDate(new Date(2026, 0, 3))).toBe('2026-01-03'); // Jan 3
    expect(isoOfDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('eventDayIso anchors to the local day of the start time', () => {
    // 2026-06-16T14:00:00Z = local 9am CDT (UTC-5)
    expect(eventDayIso('2026-06-16T14:00:00Z')).toBe('2026-06-16');
  });
});

describe('groupEventsByDay — multi-day fan-out', () => {
  it('attaches a single-day event to its start day only', () => {
    const events = [
      { id: 'e1', start_time: '2026-06-16T14:00:00Z', end_time: '2026-06-16T22:00:00Z' },
    ];
    const grouped = groupEventsByDay(events);
    expect(grouped.get('2026-06-16')).toEqual([events[0]]);
    expect(grouped.size).toBe(1);
  });

  it('attaches a 3-day event to every day it spans', () => {
    const events = [
      // Use noon local each day so the date math is unambiguous regardless of TZ offset.
      { id: 'e1', start_time: '2026-06-16T17:00:00Z', end_time: '2026-06-18T22:00:00Z' },
    ];
    const grouped = groupEventsByDay(events);
    expect(grouped.size).toBe(3);
    expect(grouped.has('2026-06-16')).toBe(true);
    expect(grouped.has('2026-06-17')).toBe(true);
    expect(grouped.has('2026-06-18')).toBe(true);
  });

  it('caps fan-out at 42 days so a pathological row never blows the map', () => {
    const events = [
      { id: 'e1', start_time: '2026-01-01T00:00:00Z', end_time: '2027-01-01T00:00:00Z' },
    ];
    const grouped = groupEventsByDay(events);
    expect(grouped.size).toBeLessThanOrEqual(42);
  });
});

describe('monthGridWindow — API request window', () => {
  it('returns a window that strictly covers all 42 grid cells', () => {
    const { fromIso, toIso } = monthGridWindow(2026, 5); // June 2026
    const cells = buildMonthGrid(2026, 5);
    const firstDayMs = cells[0].date.getTime();
    const lastDayMs = cells[cells.length - 1].date.getTime();
    expect(new Date(fromIso).getTime()).toBeLessThan(firstDayMs);
    expect(new Date(toIso).getTime()).toBeGreaterThan(lastDayMs);
  });
});

describe('stepMonth — prev/next nav math', () => {
  it('rolls forward into the next month', () => {
    expect(stepMonth(2026, 5, 1)).toEqual({ year: 2026, monthZeroIdx: 6 });
  });

  it('rolls past December into the next year', () => {
    expect(stepMonth(2026, 11, 1)).toEqual({ year: 2027, monthZeroIdx: 0 });
  });

  it('rolls past January into the previous year', () => {
    expect(stepMonth(2026, 0, -1)).toEqual({ year: 2025, monthZeroIdx: 11 });
  });
});

describe('PHASE_COLORS / PHASE_LABELS — three required phases + fallback', () => {
  it('declares colors for research / field_work / drawing_deliverables + other', () => {
    expect(PHASE_COLORS.research).toBeTruthy();
    expect(PHASE_COLORS.field_work).toBeTruthy();
    expect(PHASE_COLORS.drawing_deliverables).toBeTruthy();
    expect(PHASE_COLORS.other).toBeTruthy();
  });

  it('declares labels for the three phases', () => {
    expect(PHASE_LABELS.research).toBe('Research');
    expect(PHASE_LABELS.field_work).toBe('Field Work');
    expect(PHASE_LABELS.drawing_deliverables).toBe('Drawing & Deliverables');
  });
});

describe('MONTH_NAMES + DAY_HEADERS', () => {
  it('twelve month names in calendar order', () => {
    expect(MONTH_NAMES.length).toBe(12);
    expect(MONTH_NAMES[0]).toBe('January');
    expect(MONTH_NAMES[11]).toBe('December');
  });
  it('seven day headers, starts on Sunday', () => {
    expect(DAY_HEADERS).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  });
});

describe('/admin/calendar/page.tsx — Slice C1 wiring', () => {
  const SRC = read('app/admin/calendar/page.tsx');

  it('declares use client', () => {
    expect(SRC).toMatch(/'use client';/);
  });

  it('imports the helpers from lib/calendar/month-grid', () => {
    expect(SRC).toMatch(/from '@\/lib\/calendar\/month-grid'/);
  });

  it('reads schedule events via the existing /api/admin/schedule endpoint', () => {
    expect(SRC).toMatch(/\/api\/admin\/schedule\?\$\{params\}/);
  });

  it('renders a 42-cell month grid via cells.map', () => {
    expect(SRC).toMatch(/cells\.map\(\(cell\)/);
    expect(SRC).toMatch(/data-testid="calendar-month-grid"/);
  });

  it('each event with a job_id renders as a Link to /admin/jobs/<id>', () => {
    expect(SRC).toMatch(/href=\{`\/admin\/jobs\/\$\{ev\.job_id\}`\}/);
  });

  it('non-job events render as a plain span (no link)', () => {
    expect(SRC).toMatch(/<span[\s\S]*?className="calendar-event"/);
  });

  it('exposes prev / today / next nav buttons', () => {
    expect(SRC).toMatch(/data-action="prev-month"/);
    expect(SRC).toMatch(/data-action="today"/);
    expect(SRC).toMatch(/data-action="next-month"/);
  });

  it('admin-gates the page', () => {
    expect(SRC).toMatch(/const isAdminUser = session\?\.user\?\.roles\?\.includes\('admin'\) \?\? false;/);
  });

  it('exposes a `data-view="month"` attribute so C2 view switcher can extend it', () => {
    expect(SRC).toMatch(/data-view="month"/);
  });

  it('imports the Calendar.css stylesheet', () => {
    expect(SRC).toMatch(/import '\.\.\/styles\/Calendar\.css'/);
  });
});

describe('Calendar.css — C1 contract', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('declares the month grid', () => {
    expect(CSS).toMatch(/\.calendar-month__grid \{[\s\S]*?grid-template-columns: repeat\(7, 1fr\)/);
  });

  it('marks today via [data-today]', () => {
    expect(CSS).toMatch(/\.calendar-month__cell\[data-today='true'\] \{[\s\S]*?outline: 2px solid/);
  });

  it("makes the per-day event list scrollable", () => {
    expect(CSS).toMatch(/\.calendar-month__events \{[\s\S]*?overflow-y: auto/);
  });

  it('phone breakpoint collapses to a stacked day-list', () => {
    expect(CSS).toMatch(/@media \(max-width: 768px\) \{[\s\S]*?\.calendar-month__grid \{[\s\S]*?grid-template-columns: 1fr/);
  });

  it('uses canonical brand-navy + bg-card tokens (no drift names)', () => {
    expect(CSS).toMatch(/var\(--color-brand-navy\)/);
    expect(CSS).toMatch(/var\(--color-bg-card\)/);
    // No drift from the admin styling contract.
    expect(CSS).not.toMatch(/var\(--color-primary[,)]/);
    expect(CSS).not.toMatch(/var\(--color-surface[,)]/);
  });
});
