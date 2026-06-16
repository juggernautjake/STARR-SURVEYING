// __tests__/calendar/p3-empty-states.test.ts
//
// calendar-polish Slice P3 — per-view empty states. Locks the page
// derivation logic + the CSS contract.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('/admin/calendar/page.tsx — P3 derivation', () => {
  const SRC = read('app/admin/calendar/page.tsx');

  it("distinguishes 'no-events' from 'all-hidden'", () => {
    expect(SRC).toMatch(/const noFetchedEvents = !loading && events\.length === 0;/);
    expect(SRC).toMatch(
      /const allEventsHidden = !loading && events\.length > 0 && visibleEvents\.length === 0;/,
    );
    expect(SRC).toMatch(/emptyKind:[\s\S]*?'no-events' \| 'all-hidden' \| null/);
  });

  it('emptyMessage swaps copy per view word in the no-events case', () => {
    expect(SRC).toMatch(
      /const viewWord = view === 'month' \? 'month' : view === 'week' \? 'week' : 'day';/,
    );
    expect(SRC).toMatch(/No scheduled phases this \$\{viewWord\}\./);
  });

  it('all-hidden message names the legend so the user knows where to fix it', () => {
    expect(SRC).toMatch(/All phases hidden by the legend filters\./);
  });

  it('renders the empty state above the grid, not in place of it', () => {
    expect(SRC).toMatch(
      /\{emptyKind && \(\s*\n\s*<div\s*\n\s*className="calendar-page__empty"/,
    );
    // Grid still renders after the banner.
    expect(SRC).toMatch(/\{view === 'month' && renderMonth\(\)\}/);
  });

  it('banner is accessible via role="status" + aria-live', () => {
    expect(SRC).toMatch(/data-testid="calendar-empty-state"/);
    expect(SRC).toMatch(/role="status"/);
    expect(SRC).toMatch(/aria-live="polite"/);
  });

  it('CTA only renders for the no-events case (not all-hidden — there is no jobs link to fix that)', () => {
    expect(SRC).toMatch(
      /\{emptyKind === 'no-events' && \(\s*\n\s*<Link\s*\n\s*href="\/admin\/jobs"/,
    );
  });

  it('CTA carries data-action so e2e + analytics can target it', () => {
    expect(SRC).toMatch(/data-action="open-jobs-from-empty"/);
  });

  it("data-empty-kind reflects the active kind for the styling hook", () => {
    expect(SRC).toMatch(/data-empty-kind=\{emptyKind\}/);
  });
});

describe('Calendar.css — P3 banner styling', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('declares the banner + brand-navy left border on the default flavour', () => {
    expect(CSS).toMatch(
      /\.calendar-page__empty \{[\s\S]*?border-left: 4px solid var\(--color-brand-navy\)/,
    );
  });

  it("flips the left border to amber/warning when all-hidden", () => {
    expect(CSS).toMatch(
      /\.calendar-page__empty\[data-empty-kind='all-hidden'\] \{[\s\S]*?border-left-color: var\(--color-warning, #F59E0B\)/,
    );
  });

  it('CTA inverts on hover (brand-navy bg + on-brand text)', () => {
    expect(CSS).toMatch(
      /\.calendar-page__empty-cta:hover \{[\s\S]*?background: var\(--color-brand-navy\);[\s\S]*?color: var\(--color-text-on-brand\);/,
    );
  });

  it('fade-in keyframes named so DevTools introspection works', () => {
    expect(CSS).toMatch(/@keyframes calendar-empty-fade-in \{/);
    expect(CSS).toMatch(
      /\.calendar-page__empty \{[\s\S]*?animation: calendar-empty-fade-in 200ms ease both/,
    );
  });

  it('phone breakpoint stacks the CTA below the message', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-page__empty \{[\s\S]*?flex-direction: column/,
    );
  });

  it('reduced-motion disables the fade-in animation', () => {
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.calendar-page__empty \{[\s\S]*?animation: none/,
    );
  });

  it('still uses canonical tokens (no drift)', () => {
    expect(CSS).toMatch(/var\(--color-bg-subtle\)/);
    expect(CSS).toMatch(/var\(--color-text-on-brand\)/);
    expect(CSS).not.toMatch(/var\(--color-primary[,)]/);
    expect(CSS).not.toMatch(/var\(--color-surface[,)]/);
  });
});
