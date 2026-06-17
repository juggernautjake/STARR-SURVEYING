// __tests__/calendar/p5-print-stylesheet.test.ts
//
// calendar-polish Slice P5 — print stylesheet + Print button.
// Locks the page wiring + the @media print contract so a future
// nav/legend refactor can't quietly leave a chrome row in the
// printout.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('/admin/calendar/page.tsx — P5 Print button', () => {
  const SRC = read('app/admin/calendar/page.tsx');

  it('renders a Print button with the right ARIA + data-action', () => {
    expect(SRC).toMatch(/data-action="print-calendar"/);
    expect(SRC).toMatch(/aria-label="Print calendar"/);
    expect(SRC).toMatch(/title="Print this view"/);
  });

  it('Print button calls window.print() guarded against SSR', () => {
    expect(SRC).toMatch(
      /onClick=\{\(\) => \{\s*\n\s*if \(typeof window !== 'undefined'\) window\.print\(\);/,
    );
  });
});

describe('Calendar.css — P5 @media print block', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('declares a @media print block', () => {
    expect(CSS).toMatch(/@media print \{/);
  });

  it('hides every on-screen-only surface (nav, legend, loading chip, cheat sheet, empty)', () => {
    const block = CSS.match(/@media print \{[\s\S]*?\}\s*\n\s*\/\*/);
    // Just lock that the selectors appear inside the block:
    expect(CSS).toMatch(
      /@media print \{[\s\S]*?\.calendar-page__nav,\s*\n\s*\.calendar-page__legend,\s*\n\s*\.calendar-page__loading-chip,\s*\n\s*\.calendar-page__cheat-sheet-backdrop,\s*\n\s*\.calendar-page__empty \{\s*\n\s*display: none !important;/,
    );
    expect(block).toBeTruthy();
  });

  it('hides the admin sidebar + topbar chrome', () => {
    expect(CSS).toMatch(
      /@media print \{[\s\S]*?\.admin-sidebar,\s*\n\s*\.admin-topbar \{\s*\n\s*display: none !important;/,
    );
  });

  it('resets the page background to white + text to black for paper', () => {
    expect(CSS).toMatch(
      /@media print \{[\s\S]*?\.calendar-page \{[\s\S]*?background: #FFFFFF !important;[\s\S]*?color: #000000 !important;/,
    );
  });

  it('allows page-break BETWEEN week rows but NEVER inside a cell', () => {
    expect(CSS).toMatch(
      /@media print \{[\s\S]*?\.calendar-month__cell \{[\s\S]*?page-break-inside: avoid;/,
    );
  });

  it('event pills keep the phase-color left border so color survives the printout', () => {
    expect(CSS).toMatch(
      /@media print \{[\s\S]*?\.calendar-event \{[\s\S]*?border-left: 3px solid var\(--phase-color, #000000\) !important;/,
    );
  });

  it('pauses every animation + transition so the printer snapshots stable layout', () => {
    expect(CSS).toMatch(
      /@media print \{[\s\S]*?\*::before,\s*\n\s*\*::after \{\s*\n\s*animation-duration: 0s !important;[\s\S]*?transition-duration: 0s !important;/,
    );
  });

  it('sets @page margins to 1cm so the grid breathes on letter / A4 paper', () => {
    expect(CSS).toMatch(/@media print \{[\s\S]*?@page \{[\s\S]*?margin: 1cm;/);
  });

  it("forces the big-screen mode to also print readable (not on top of host gradient)", () => {
    expect(CSS).toMatch(
      /@media print \{[\s\S]*?\.calendar-page\[data-display-mode='big-screen'\] \{[\s\S]*?background: #FFFFFF !important;/,
    );
  });

  it('surrounding-month days print faded so the focus is obvious', () => {
    expect(CSS).toMatch(
      /@media print \{[\s\S]*?\.calendar-month__cell\[data-in-month='false'\] \{[\s\S]*?color: #999999 !important;/,
    );
  });
});
