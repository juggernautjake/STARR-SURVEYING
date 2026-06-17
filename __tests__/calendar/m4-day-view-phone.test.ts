// __tests__/calendar/m4-day-view-phone.test.ts
//
// calendar-mobile Slice M4 — day view phone polish. Locks the
// sticky day header markup + the CSS that makes the hour rows
// fatter and the all-day strip horizontally scrollable on phone.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('/admin/calendar/page.tsx — M4 day-header markup', () => {
  const SRC = read('app/admin/calendar/page.tsx');

  it('renders a day header inside renderDay with stable testID', () => {
    expect(SRC).toMatch(
      /function renderDay\(\)[\s\S]*?className="calendar-day__day-header"[\s\S]*?data-testid="calendar-day-header"/,
    );
  });

  it('header carries a data-today flag mirroring dayCell.isToday', () => {
    expect(SRC).toMatch(/data-today=\{dayCell\.isToday \? 'true' : undefined\}/);
  });

  it('header shows weekday + date number', () => {
    expect(SRC).toMatch(/className="calendar-day__day-header-weekday">\{dayCell\.weekday\}/);
    expect(SRC).toMatch(/className="calendar-day__day-header-date">\{dayCell\.day\}/);
  });

  it("renders an explicit Today tag pill when the focus day is today", () => {
    expect(SRC).toMatch(/\{dayCell\.isToday && \(/);
    expect(SRC).toMatch(/className="calendar-day__day-header-today-tag"/);
  });
});

describe('Calendar.css — M4 sticky day header', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('declares the day header surface', () => {
    expect(CSS).toMatch(/\.calendar-day__day-header \{/);
  });

  it("brand-navy left border + brand-navy date when [data-today='true']", () => {
    expect(CSS).toMatch(
      /\.calendar-day__day-header\[data-today='true'\] \{[\s\S]*?border-left: 4px solid var\(--color-brand-navy\)/,
    );
    expect(CSS).toMatch(
      /\.calendar-day__day-header\[data-today='true'\] \.calendar-day__day-header-date \{[\s\S]*?color: var\(--color-brand-navy\)/,
    );
  });

  it('Today tag pill uses brand-navy bg + on-brand text', () => {
    expect(CSS).toMatch(
      /\.calendar-day__day-header-today-tag \{[\s\S]*?background: var\(--color-brand-navy\);[\s\S]*?color: var\(--color-text-on-brand\)/,
    );
  });

  it('phone makes the header position: sticky at top with a subtle shadow', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-day__day-header \{[\s\S]*?position: sticky;[\s\S]*?top: 0;[\s\S]*?box-shadow:/,
    );
  });

  it('phone bumps the date numeral to text-2xl', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-day__day-header-date \{[\s\S]*?font-size: var\(--text-2xl\)/,
    );
  });
});

describe('Calendar.css — M4 fat hour rows + scrollable all-day on phone', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('phone gives the day-view hour column 3.5rem min row height', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-day \.calendar-week__day-col \{[\s\S]*?grid-auto-rows: minmax\(3\.5rem, 1fr\)/,
    );
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-day \.calendar-week__hour-gutter \{[\s\S]*?grid-auto-rows: minmax\(3\.5rem, 1fr\)/,
    );
  });

  it('phone shrinks the hour gutter from 4rem to 3rem so events get more width', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-day__body \{[\s\S]*?grid-template-columns: 3rem 1fr/,
    );
  });

  it('all-day strip flips to a horizontally scrollable row on phone', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-day__all-day \.calendar-week__all-day-cell \{[\s\S]*?flex-direction: row;[\s\S]*?overflow-x: auto/,
    );
  });

  it("print resets the sticky header to static so it doesn't float on paper", () => {
    expect(CSS).toMatch(
      /@media print \{[\s\S]*?\.calendar-day__day-header \{[\s\S]*?position: static;/,
    );
  });

  it('still uses canonical tokens (no drift)', () => {
    expect(CSS).toMatch(/var\(--color-brand-navy\)/);
    expect(CSS).toMatch(/var\(--color-text-on-brand\)/);
    expect(CSS).not.toMatch(/var\(--color-primary[,)]/);
    expect(CSS).not.toMatch(/var\(--color-surface[,)]/);
  });
});
