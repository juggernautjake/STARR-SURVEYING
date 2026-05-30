// __tests__/hub/calendar-grid.test.tsx
//
// Slice 2 of hub-widget-excellence-04-calendar. Locks the read-only
// CalendarGrid render + the today-schedule fetch-window-by-view helper.

import { describe, it, expect } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import CalendarGrid, { type CalendarGridEvent } from '@/lib/hub/calendar/CalendarGrid';
import { scheduleWindow } from '@/lib/hub/widgets/today-schedule';

const EVENTS: CalendarGridEvent[] = [
  { id: 'e1', title: 'Site visit', color: '#15803d', start_time: '2026-05-30T09:00:00Z', end_time: '2026-05-30T10:00:00Z' },
  { id: 'e2', title: 'Crew meeting', color: null, start_time: '2026-05-30T11:00:00Z', end_time: '2026-05-30T12:00:00Z' },
  { id: 'e3', title: 'Deadline', color: '#dc2626', start_time: '2026-05-15T00:00:00Z', end_time: '2026-05-15T23:59:00Z' },
];

function render(props: React.ComponentProps<typeof CalendarGrid>): string {
  return ReactDOMServer.renderToStaticMarkup(<CalendarGrid {...props} />);
}

describe('CalendarGrid', () => {
  it('renders the 7 weekday headers + a month of day cells', () => {
    const html = render({ year: 2026, month: 5, events: EVENTS });
    for (const wd of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      expect(html).toContain(`>${wd}<`);
    }
    expect(html).toContain('data-iso="2026-05-01"');
    expect(html).toContain('data-iso="2026-05-31"');
    expect(html).toContain('role="grid"');
  });

  it('renders events as colored chips on their day', () => {
    const html = render({ year: 2026, month: 5, events: EVENTS });
    expect(html).toContain('data-event="e1"');
    expect(html).toContain('Site visit');
    expect(html).toMatch(/data-event="e1"[^>]*style="[^"]*background:\s*#15803d/i);
    expect(html).toContain('data-event="e3"');
  });

  it('falls back to the accent color when an event has no color', () => {
    const html = render({ year: 2026, month: 5, events: EVENTS });
    expect(html).toMatch(/data-event="e2"[^>]*style="[^"]*background:\s*var\(--theme-accent/i);
  });

  it('collapses overflow beyond maxChipsPerDay to "+N"', () => {
    const many: CalendarGridEvent[] = [1, 2, 3, 4].map((n) => ({
      id: `m${n}`, title: `Event ${n}`, color: null,
      start_time: '2026-05-20T09:00:00Z', end_time: '2026-05-20T10:00:00Z',
    }));
    const html = render({ year: 2026, month: 5, events: many, maxChipsPerDay: 2 });
    expect(html).toContain('+2');
  });

  it('highlights today + dims out-of-month days', () => {
    const html = render({ year: 2026, month: 5, events: EVENTS, todayIso: '2026-05-30' });
    expect(html).toMatch(/data-iso="2026-05-30"[^>]*aria-current="date"/);
    // April 26 2026 is a leading out-of-month cell.
    expect(html).toMatch(/data-iso="2026-04-26"[^>]*data-in-month="false"/);
    expect(html).toMatch(/data-iso="2026-05-30"[^>]*data-in-month="true"/);
  });
});

describe('scheduleWindow — fetch window follows the view', () => {
  const NOW = new Date('2026-05-15T12:00:00Z');

  it('grid view fetches (around) the whole month', () => {
    const { from, to } = scheduleWindow('grid', 'all-day', NOW);
    // padded a week each side of May 2026
    expect(from <= '2026-05-01').toBe(true);
    expect(to >= '2026-06-01').toBe(true);
  });

  it('agenda-wide fetches three days', () => {
    const { from, to } = scheduleWindow('agenda-wide', 'all-day', NOW);
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    expect(Math.round(days)).toBe(3);
  });

  it('agenda fetches the single day', () => {
    const { from, to } = scheduleWindow('agenda', 'all-day', NOW);
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    expect(Math.round(days)).toBe(1);
  });
});
