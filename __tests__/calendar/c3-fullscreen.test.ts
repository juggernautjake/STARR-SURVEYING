// __tests__/calendar/c3-fullscreen.test.ts
//
// job-calendar Slice C3 — fullscreen / big-screen mode + auto-refresh
// + keyboard shortcuts + year/month picker.
//
// Source-lock by source-string read (the page is a 'use client'
// component that pulls in next/navigation; rendering it in vitest is
// overkill for what we need to lock here).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('/admin/calendar/page.tsx — C3 fullscreen wiring', () => {
  const SRC = read('app/admin/calendar/page.tsx');

  it('attaches a ref to the page root for requestFullscreen()', () => {
    expect(SRC).toMatch(/const rootRef = useRef<HTMLDivElement \| null>\(null\);/);
    expect(SRC).toMatch(/ref=\{rootRef\}/);
  });

  it('tracks fullscreen state via the browser fullscreenchange event', () => {
    expect(SRC).toMatch(/document\.addEventListener\('fullscreenchange', handler\)/);
    expect(SRC).toMatch(/document\.fullscreenElement === rootRef\.current/);
  });

  it('toggleFullscreen calls requestFullscreen / exitFullscreen', () => {
    expect(SRC).toMatch(/rootRef\.current\?\.requestFullscreen/);
    expect(SRC).toMatch(/document\.exitFullscreen\(\)/);
  });

  it('paints data-display-mode="big-screen" only when fullscreen', () => {
    expect(SRC).toMatch(/data-display-mode=\{isFullscreen \? 'big-screen' : undefined\}/);
  });

  it('renders a fullscreen toggle button with data-action="toggle-fullscreen"', () => {
    expect(SRC).toMatch(/data-action="toggle-fullscreen"/);
    expect(SRC).toMatch(/data-current=\{isFullscreen \? 'true' : undefined\}/);
  });
});

describe('/admin/calendar/page.tsx — C3 auto-refresh', () => {
  const SRC = read('app/admin/calendar/page.tsx');

  it('declares a 5-minute refresh constant', () => {
    expect(SRC).toMatch(/const AUTO_REFRESH_MS = 5 \* 60 \* 1000;/);
  });

  it('starts a setInterval ONLY when fullscreen is true', () => {
    // The effect body's first line must be a guard returning early when not fullscreen.
    expect(SRC).toMatch(/useEffect\(\(\) => \{\s*\n\s*if \(!isFullscreen\) return;[\s\S]*?setInterval/);
  });

  it('clears the interval on unmount / fullscreen exit', () => {
    expect(SRC).toMatch(/return \(\) => clearInterval\(id\);/);
  });
});

describe('/admin/calendar/page.tsx — C3 keyboard shortcuts', () => {
  const SRC = read('app/admin/calendar/page.tsx');

  it('registers a keydown listener on window', () => {
    expect(SRC).toMatch(/window\.addEventListener\('keydown', onKey\)/);
  });

  it('hands off arrow keys for prev / next', () => {
    expect(SRC).toMatch(/case 'ArrowLeft':\s*goPrev\(\);/);
    expect(SRC).toMatch(/case 'ArrowRight': goNext\(\);/);
  });

  it("'t' / 'T' jumps to today", () => {
    expect(SRC).toMatch(/case 't': case 'T': goToday\(\);/);
  });

  it("'f' / 'F' toggles fullscreen", () => {
    expect(SRC).toMatch(/case 'f': case 'F': void toggleFullscreen\(\);/);
  });

  it("'m' / 'w' / 'd' switch view without typing into the URL", () => {
    expect(SRC).toMatch(/case 'm': case 'M': setView\('month'\);/);
    expect(SRC).toMatch(/case 'w': case 'W': setView\('week'\);/);
    expect(SRC).toMatch(/case 'd': case 'D': setView\('day'\);/);
  });

  it("doesn't hijack arrow / shortcut keys while typing in an input", () => {
    expect(SRC).toMatch(/INPUT\|SELECT\|TEXTAREA/);
  });
});

describe('/admin/calendar/page.tsx — C3 year/month picker', () => {
  const SRC = read('app/admin/calendar/page.tsx');

  it('renders month + year select pickers with stable testIDs', () => {
    expect(SRC).toMatch(/data-testid="month-picker"/);
    expect(SRC).toMatch(/data-testid="year-picker"/);
  });

  it('expands the year window around the current focus', () => {
    expect(SRC).toMatch(/const min = Math\.min\(focusYear - 5, focusYear\);/);
    expect(SRC).toMatch(/const max = Math\.max\(focusYear \+ 5, focusYear\);/);
  });

  it('moving the month / year picker rebuilds the focus date', () => {
    expect(SRC).toMatch(/setFocus\(new Date\(focus\.getFullYear\(\), m, Math\.min\(focus\.getDate\(\), 28\)\)\);/);
    expect(SRC).toMatch(/setFocus\(new Date\(y, focus\.getMonth\(\), Math\.min\(focus\.getDate\(\), 28\)\)\);/);
  });
});

describe('Calendar.css — C3 fullscreen styling', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('declares year/month picker select styling', () => {
    expect(CSS).toMatch(/\.calendar-page__nav select \{/);
  });

  it("scales typography under data-display-mode='big-screen'", () => {
    expect(CSS).toMatch(/\.calendar-page\[data-display-mode='big-screen'\] \{/);
    expect(CSS).toMatch(/\.calendar-page\[data-display-mode='big-screen'\] \.calendar-page__title \{[\s\S]*?font-size: 2\.25rem/);
  });

  it('expands month cell padding in big-screen mode', () => {
    expect(CSS).toMatch(/\.calendar-page\[data-display-mode='big-screen'\] \.calendar-month__cell \{[\s\S]*?padding: var\(--space-3\)/);
  });

  it('uses the canonical app-background token (no drift)', () => {
    expect(CSS).toMatch(/var\(--color-bg-app, #F9FAFB\)/);
  });
});
