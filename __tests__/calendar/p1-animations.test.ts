// __tests__/calendar/p1-animations.test.ts
//
// calendar-polish Slice P1 — animations + transitions. Source-lock
// the CSS contract so a future refactor doesn't quietly drop the
// vestibular-safe motion-reduction block or the today pulse.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Calendar.css — P1 hover + transitions', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('event pills declare a transform / transition baseline', () => {
    expect(CSS).toMatch(/\.calendar-event \{[\s\S]*?transition:[\s\S]*?transform 120ms ease/);
  });

  it('clickable event pills lift 1px on hover with a soft shadow', () => {
    expect(CSS).toMatch(
      /\.calendar-event--has-link:hover \{[\s\S]*?transform: translateY\(-1px\)[\s\S]*?box-shadow:/,
    );
  });

  it('month cells get a transition on hover', () => {
    expect(CSS).toMatch(
      /\.calendar-month__cell \{[\s\S]*?transition: box-shadow[\s\S]*?\.calendar-month__cell:hover/,
    );
  });
});

describe('Calendar.css — P1 view-switch fade + today pulse', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('declares calendar-view-fade-in keyframes', () => {
    expect(CSS).toMatch(/@keyframes calendar-view-fade-in \{[\s\S]*?from \{ opacity: 0;/);
  });

  it('applies the fade-in to every grid container', () => {
    expect(CSS).toMatch(
      /\.calendar-month__grid,\s*\n\s*\.calendar-week,\s*\n\s*\.calendar-day \{\s*\n\s*animation: calendar-view-fade-in 180ms ease both;/,
    );
  });

  it('declares calendar-today-pulse keyframes', () => {
    expect(CSS).toMatch(/@keyframes calendar-today-pulse \{/);
  });

  it('today pulse is applied to BOTH month cell + week day col', () => {
    expect(CSS).toMatch(
      /\.calendar-month__cell\[data-today='true'\] \{[\s\S]*?animation: calendar-today-pulse 4s ease-in-out infinite;/,
    );
    expect(CSS).toMatch(
      /\.calendar-week__day-col\[data-today='true'\] \{[\s\S]*?animation: calendar-today-pulse 4s ease-in-out infinite;/,
    );
  });

  it('big-screen mode slows the pulse to 6s', () => {
    expect(CSS).toMatch(
      /\.calendar-page\[data-display-mode='big-screen'\][\s\S]*?animation-duration: 6s/,
    );
  });
});

describe('Calendar.css — P1 legend chip transition + focus rings', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('legend chip transition covers opacity + line-through fade', () => {
    expect(CSS).toMatch(
      /\.calendar-page__legend-chip \{[\s\S]*?transition:[\s\S]*?opacity 160ms ease[\s\S]*?text-decoration-color 200ms ease/,
    );
  });

  it('every nav-row interactive gets a brand-navy :focus-visible ring', () => {
    expect(CSS).toMatch(/\.calendar-page__nav button:focus-visible/);
    expect(CSS).toMatch(/\.calendar-page__nav select:focus-visible/);
    expect(CSS).toMatch(/\.calendar-page__view-switcher button:focus-visible/);
    expect(CSS).toMatch(/\.calendar-page__legend-chip:focus-visible/);
    expect(CSS).toMatch(
      /:focus-visible[\s\S]*?outline: 2px solid var\(--color-brand-navy\);[\s\S]*?outline-offset: 2px;/,
    );
  });
});

describe('Calendar.css — P1 prefers-reduced-motion safety', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('declares a @media (prefers-reduced-motion: reduce) block', () => {
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\) \{/);
  });

  it('the reduced-motion block collapses transitions + animations', () => {
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?transition-duration: 0\.01ms !important;[\s\S]*?animation-duration: 0\.01ms !important;/,
    );
  });

  it('the reduced-motion block disables the hover lift transform', () => {
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.calendar-event--has-link:hover \{\s*\n\s*transform: none;/,
    );
  });

  it('still uses canonical brand tokens (no drift names)', () => {
    expect(CSS).toMatch(/var\(--color-brand-navy\)/);
    expect(CSS).not.toMatch(/var\(--color-primary[,)]/);
    expect(CSS).not.toMatch(/var\(--color-surface[,)]/);
  });
});
