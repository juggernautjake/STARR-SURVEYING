// __tests__/calendar/c2-week-day-views.test.ts
//
// job-calendar Slice C2 — week + day views + view switcher. Locks
// pure helpers + page wiring + the URL-persist contract.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildDayCell,
  buildWeekCells,
  eventGridPosition,
  FIRST_HOUR,
  HOUR_ROWS,
  LAST_HOUR,
  parseView,
  stepFocus,
  viewHeaderLabel,
  weekWindow,
} from '@/lib/calendar/week-grid';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('parseView — URL param coercion', () => {
  it('keeps a known view as-is', () => {
    expect(parseView('month')).toBe('month');
    expect(parseView('week')).toBe('week');
    expect(parseView('day')).toBe('day');
  });
  it('falls back to month for unknown / null / undefined', () => {
    expect(parseView(null)).toBe('month');
    expect(parseView(undefined)).toBe('month');
    expect(parseView('quarter')).toBe('month');
  });
});

describe('buildWeekCells', () => {
  it('returns 7 cells starting on Sunday for any focus', () => {
    const wed = new Date(2026, 5, 17); // Wednesday June 17, 2026
    const cells = buildWeekCells(wed);
    expect(cells.length).toBe(7);
    expect(cells[0].date.getDay()).toBe(0); // Sunday
    expect(cells[6].date.getDay()).toBe(6); // Saturday
  });
  it('marks today when the week contains it', () => {
    const cells = buildWeekCells(new Date());
    expect(cells.some((c) => c.isToday)).toBe(true);
  });
});

describe('buildDayCell', () => {
  it('returns a single cell at the focus date', () => {
    const focus = new Date(2026, 5, 17);
    const cell = buildDayCell(focus);
    expect(cell.day).toBe(17);
    expect(cell.weekday).toBe('Wed');
  });
});

describe('stepFocus — view-aware nav', () => {
  const focus = new Date(2026, 5, 17); // Wed Jun 17

  it('month step jumps a calendar month', () => {
    expect(stepFocus(focus, 'month', 1).getMonth()).toBe(6); // July
    expect(stepFocus(focus, 'month', -1).getMonth()).toBe(4); // May
  });

  it('week step jumps 7 days', () => {
    const next = stepFocus(focus, 'week', 1);
    expect(next.getDate()).toBe(24);
    const prev = stepFocus(focus, 'week', -1);
    expect(prev.getDate()).toBe(10);
  });

  it('day step jumps 1 day', () => {
    expect(stepFocus(focus, 'day', 1).getDate()).toBe(18);
    expect(stepFocus(focus, 'day', -1).getDate()).toBe(16);
  });
});

describe('weekWindow — API request bounds', () => {
  it('covers the full 7 days of a week view + padding', () => {
    const focus = new Date(2026, 5, 17);
    const cells = buildWeekCells(focus);
    const { fromIso, toIso } = weekWindow(focus, 'week');
    expect(new Date(fromIso).getTime()).toBeLessThan(cells[0].date.getTime());
    expect(new Date(toIso).getTime()).toBeGreaterThan(cells[6].date.getTime());
  });

  it('day view window is narrower than week', () => {
    const focus = new Date(2026, 5, 17);
    const weekW = weekWindow(focus, 'week');
    const dayW = weekWindow(focus, 'day');
    const weekSpan = new Date(weekW.toIso).getTime() - new Date(weekW.fromIso).getTime();
    const daySpan = new Date(dayW.toIso).getTime() - new Date(dayW.fromIso).getTime();
    expect(daySpan).toBeLessThan(weekSpan);
  });
});

describe('eventGridPosition', () => {
  it('returns 0% top + matching height for a window-aligned event', () => {
    const start = `2026-06-17T${String(FIRST_HOUR).padStart(2, '0')}:00:00`;
    const end = `2026-06-17T${String(FIRST_HOUR + 1).padStart(2, '0')}:00:00`;
    const pos = eventGridPosition(new Date(start).toISOString(), new Date(end).toISOString());
    expect(pos.topPct).toBeCloseTo(0, 1);
    expect(pos.heightPct).toBeGreaterThan(0);
    expect(pos.heightPct).toBeLessThan(20);
  });

  it('clamps events past the window to the visible edge', () => {
    const start = `2026-06-17T05:00:00`; // before FIRST_HOUR (6)
    const end = `2026-06-17T07:00:00`;
    const pos = eventGridPosition(new Date(start).toISOString(), new Date(end).toISOString());
    expect(pos.topPct).toBe(0); // clamped to top
  });

  it('floors the height at 2% so tiny events still render', () => {
    const start = `2026-06-17T08:00:00`;
    const end = `2026-06-17T08:00:00`;
    const pos = eventGridPosition(new Date(start).toISOString(), new Date(end).toISOString());
    expect(pos.heightPct).toBeGreaterThanOrEqual(2);
  });
});

describe('HOUR_ROWS', () => {
  it('first / last hour bounds match the exported constants', () => {
    expect(HOUR_ROWS[0].hour).toBe(FIRST_HOUR);
    expect(HOUR_ROWS[HOUR_ROWS.length - 1].hour).toBe(LAST_HOUR);
  });
  it('every row has a label string', () => {
    for (const r of HOUR_ROWS) expect(r.label.length).toBeGreaterThan(0);
  });
});

describe('viewHeaderLabel', () => {
  it('month view: "June 2026"', () => {
    expect(viewHeaderLabel(new Date(2026, 5, 17), 'month')).toBe('June 2026');
  });

  it('week view: a Jun 14 – Jun 20, 2026 style range', () => {
    const label = viewHeaderLabel(new Date(2026, 5, 17), 'week');
    expect(label).toMatch(/–/);
    expect(label).toContain('2026');
  });

  it('day view: a long-form weekday + date label', () => {
    const label = viewHeaderLabel(new Date(2026, 5, 17), 'day');
    expect(label).toMatch(/2026/);
  });
});

describe('/admin/calendar/page.tsx — Slice C2 wiring', () => {
  const SRC = read('app/admin/calendar/page.tsx');

  it('imports the week-grid helpers', () => {
    expect(SRC).toMatch(/from '@\/lib\/calendar\/week-grid'/);
  });

  it('reads the view from ?view= via useSearchParams + parseView', () => {
    expect(SRC).toMatch(/useSearchParams\(\)/);
    expect(SRC).toMatch(/parseView\(searchParams\?\.get\('view'\) \?\? null\)/);
  });

  it('writes the view to the URL via router.replace (no history pollution)', () => {
    expect(SRC).toMatch(/router\.replace\(`\$\{url\.pathname\}\$\{url\.search\}`, \{ scroll: false \}\)/);
  });

  it('renders three view-switcher buttons with data-action="view-<v>"', () => {
    expect(SRC).toMatch(/data-action=\{`view-\$\{v\}`\}/);
  });

  it("marks the current view button via data-current='true'", () => {
    expect(SRC).toMatch(/data-current=\{view === v \? 'true' : undefined\}/);
  });

  it('renders the right subtree per view', () => {
    expect(SRC).toMatch(/\{view === 'month' && renderMonth\(\)\}/);
    expect(SRC).toMatch(/\{view === 'week' && renderWeek\(\)\}/);
    expect(SRC).toMatch(/\{view === 'day' && renderDay\(\)\}/);
  });

  it('prev / next nav buttons carry the active view in data-action', () => {
    expect(SRC).toMatch(/data-action=\{`prev-\$\{navLabel\}`\}/);
    expect(SRC).toMatch(/data-action=\{`next-\$\{navLabel\}`\}/);
  });

  it('week + day grids expose stable testIDs', () => {
    expect(SRC).toMatch(/data-testid="calendar-week-grid"/);
    expect(SRC).toMatch(/data-testid="calendar-day-grid"/);
  });

  it('events with job_id render as clickable links in both timed + all-day variants', () => {
    expect(SRC).toMatch(/href=\{`\/admin\/jobs\/\$\{ev\.job_id\}`\}/);
  });

  it('the page data-view attribute reflects the active view (not hard-coded month)', () => {
    expect(SRC).toMatch(/data-view=\{view\}/);
  });
});

describe('Calendar.css — Slice C2 contract', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('declares the view switcher', () => {
    expect(CSS).toMatch(/\.calendar-page__view-switcher \{/);
  });

  it('declares the week + day grid bodies with a 4rem gutter + day columns', () => {
    expect(CSS).toMatch(/\.calendar-week__body,\s*\n\s*\.calendar-day__body \{[\s\S]*?grid-template-columns: 4rem repeat\(7, 1fr\)/);
    expect(CSS).toMatch(/\.calendar-day__body \{\s*\n\s*grid-template-columns: 4rem 1fr/);
  });

  it('timed events use absolute positioning + a phase-color left border', () => {
    expect(CSS).toMatch(/\.calendar-event--timed \{[\s\S]*?position: absolute/);
    expect(CSS).toMatch(/border-left-color: var\(--phase-color/);
  });

  it("today's day column gets outlined in brand navy", () => {
    expect(CSS).toMatch(/\.calendar-week__day-col\[data-today='true'\] \{[\s\S]*?outline: 2px solid var\(--color-brand-navy\)/);
  });

  it('uses canonical brand-navy + bg-card tokens (no drift)', () => {
    expect(CSS).toMatch(/var\(--color-brand-navy\)/);
    expect(CSS).toMatch(/var\(--color-bg-card\)/);
    expect(CSS).not.toMatch(/var\(--color-primary[,)]/);
    expect(CSS).not.toMatch(/var\(--color-surface[,)]/);
  });
});
