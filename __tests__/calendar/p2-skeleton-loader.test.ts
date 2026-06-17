// __tests__/calendar/p2-skeleton-loader.test.ts
//
// calendar-polish Slice P2 — skeleton loader during fetch.
// Locks the page wiring + the CSS sweep + chip contract +
// reduced-motion fallback.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('/admin/calendar/page.tsx — P2 wiring', () => {
  const SRC = read('app/admin/calendar/page.tsx');

  it('page root carries data-fetching when loading is true', () => {
    expect(SRC).toMatch(/data-fetching=\{loading \? 'true' : undefined\}/);
  });

  it('renders an accessible loading chip with role="status" + aria-live', () => {
    expect(SRC).toMatch(/className="calendar-page__loading-chip"/);
    expect(SRC).toMatch(/data-testid="calendar-loading-chip"/);
    expect(SRC).toMatch(/role="status"/);
    expect(SRC).toMatch(/aria-live="polite"/);
  });

  it('chip text mirrors the loading state', () => {
    expect(SRC).toMatch(/\{loading \? 'Loading…' : ''\}/);
  });
});

describe('Calendar.css — P2 sweep overlay', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('declares the sweep keyframes', () => {
    expect(CSS).toMatch(/@keyframes calendar-shimmer-sweep \{[\s\S]*?from \{ transform: translateX\(-100%\);/);
  });

  it('overlay paints across every grid container while data-loading', () => {
    expect(CSS).toMatch(
      /\.calendar-month__grid\[data-loading='true'\]::after,\s*\n\s*\.calendar-week\[data-loading='true'\]::after,\s*\n\s*\.calendar-day\[data-loading='true'\]::after \{[\s\S]*?animation: calendar-shimmer-sweep/,
    );
  });

  it('overlay is pointer-events:none so users can still click events behind it', () => {
    expect(CSS).toMatch(/pointer-events: none/);
  });

  it('overlay tints with brand-navy at low alpha (no hard blocking veil)', () => {
    expect(CSS).toMatch(/rgba\(29, 48, 149, 0\.10\)/);
  });
});

describe('Calendar.css — P2 loading chip', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('declares the chip styling', () => {
    expect(CSS).toMatch(/\.calendar-page__loading-chip \{/);
  });

  it('chip opacity ramps via the page root data-fetching attribute', () => {
    expect(CSS).toMatch(
      /\.calendar-page\[data-fetching='true'\] \.calendar-page__loading-chip \{[\s\S]*?opacity: 1;/,
    );
  });

  it('chip carries a pulsing brand-navy dot via ::before', () => {
    expect(CSS).toMatch(
      /\.calendar-page__loading-chip::before \{[\s\S]*?background: var\(--color-brand-navy\);[\s\S]*?animation: calendar-shimmer-pulse/,
    );
  });

  it('declares the pulse keyframes', () => {
    expect(CSS).toMatch(/@keyframes calendar-shimmer-pulse \{/);
  });
});

describe('Calendar.css — P2 responsive + reduced-motion safety', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('phone breakpoint hides the sweep overlay (chip carries the signal alone)', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?calendar-month__grid\[data-loading='true'\]::after[\s\S]*?display: none/,
    );
  });

  it('reduced-motion pauses both sweep + pulse animations', () => {
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?calendar-month__grid\[data-loading='true'\]::after[\s\S]*?animation: none/,
    );
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.calendar-page__loading-chip::before \{[\s\S]*?animation: none/,
    );
  });
});
