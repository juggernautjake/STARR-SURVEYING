// __tests__/calendar/m3-week-view-phone.test.ts
//
// calendar-mobile Slice M3 — week view phone optimization. Locks
// the page wiring (data-swipe-skip on the week wrapper + M2
// handler accepts the new selector) + the CSS that drives the
// horizontal scroll-snap, sticky hour gutter, and fat hour rows.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('/admin/calendar/page.tsx — M3 wiring', () => {
  const SRC = read('app/admin/calendar/page.tsx');

  it("week wrapper carries data-swipe-skip='true'", () => {
    // Look for the literal "data-swipe-skip=" attribute inside
    // renderWeek (week wrapper is the first className="calendar-week").
    expect(SRC).toMatch(/className="calendar-week"[\s\S]*?data-swipe-skip="true"/);
  });

  it('M2 handler skips [data-swipe-skip="true"] surfaces (so horizontal scroll doesn\'t double-fire prev/next)', () => {
    expect(SRC).toMatch(/\[data-swipe-skip="true"\]/);
  });
});

describe('Calendar.css — M3 horizontal scroll-snap on phone', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('phone makes .calendar-week the horizontal scroll container with x-mandatory snap', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-week \{[\s\S]*?overflow-x: auto;[\s\S]*?scroll-snap-type: x mandatory/,
    );
  });

  it('all three inner sections share the same column template so they scroll together', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-week__header,\s*\n\s*\.calendar-week__all-day,\s*\n\s*\.calendar-week__body \{[\s\S]*?grid-template-columns: 4rem repeat\(7, 30vw\)/,
    );
  });

  it('inner sections get `width: max-content` so the grid actually overflows for scrolling', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-week__header,\s*\n\s*\.calendar-week__all-day,\s*\n\s*\.calendar-week__body \{[\s\S]*?width: max-content/,
    );
  });

  it("hour gutter is position: sticky left:0 with opaque bg-card so it stays anchored", () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-week__hour-gutter \{[\s\S]*?position: sticky;[\s\S]*?left: 0;[\s\S]*?background: var\(--color-bg-card\)/,
    );
  });

  it('day headers, day cols, and all-day cells all snap to start', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-week__day-header,\s*\n\s*\.calendar-week__day-col,\s*\n\s*\.calendar-week__all-day-cell \{\s*\n\s*scroll-snap-align: start/,
    );
  });

  it('hour rows get a minmax(3rem, 1fr) floor on phone for thumb-friendly timed events', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-week__body \{[\s\S]*?grid-auto-rows: minmax\(3rem, 1fr\)/,
    );
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-week__day-col \{[\s\S]*?grid-auto-rows: minmax\(3rem, 1fr\)/,
    );
  });

  it("today's day-col outline stays visible inside the scroll via outline-offset: -3px", () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-week__day-col\[data-today='true'\] \{[\s\S]*?outline-offset: -3px/,
    );
  });
});

describe('Calendar.css — M3 print resets', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('print resets the horizontal scroll so all 7 days show side-by-side', () => {
    expect(CSS).toMatch(
      /@media print \{[\s\S]*?\.calendar-week \{\s*\n\s*overflow-x: visible !important/,
    );
  });

  it('print resets the section column template to 7 fluid cols', () => {
    expect(CSS).toMatch(
      /@media print \{[\s\S]*?\.calendar-week__header,\s*\n\s*\.calendar-week__all-day,\s*\n\s*\.calendar-week__body \{[\s\S]*?grid-template-columns: 4rem repeat\(7, 1fr\) !important/,
    );
  });

  it('print drops sticky positioning on the hour gutter so it sits inline', () => {
    expect(CSS).toMatch(
      /@media print \{[\s\S]*?\.calendar-week__hour-gutter \{\s*\n\s*position: static !important/,
    );
  });
});
