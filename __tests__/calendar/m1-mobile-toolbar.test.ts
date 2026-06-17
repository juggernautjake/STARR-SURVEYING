// __tests__/calendar/m1-mobile-toolbar.test.ts
//
// calendar-mobile Slice M1 — phone toolbar reorganization + 44pt
// touch targets. Locks the CSS @media block so a future polish
// pass can't accidentally drop the 44pt floor or re-introduce the
// 11-element row on phone.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Calendar.css — M1 toolbar reflow', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('phone header stacks vertically', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-page__header \{\s*\n\s*flex-direction: column;\s*\n\s*align-items: stretch;/,
    );
  });

  it('phone nav row is full-width with space-between for edge-anchored thumb targets', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-page__nav \{[\s\S]*?width: 100%;[\s\S]*?justify-content: space-between/,
    );
  });

  it('view switcher takes its own row above the nav buttons', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-page__view-switcher \{[\s\S]*?flex: 1 1 100%/,
    );
  });

  it('view switcher buttons each hit 44pt min so a phone tap lands', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-page__view-switcher button \{[\s\S]*?min-height: 44px/,
    );
  });

  it('drops the month + year pickers on phone (prev/next is the better gesture)', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-page__nav select \{\s*\n\s*display: none/,
    );
  });
});

describe('Calendar.css — M1 touch target sizes', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it("every nav button forces 44pt min-height + min-width on phone", () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-page__nav button \{[\s\S]*?min-height: 44px;[\s\S]*?min-width: 44px/,
    );
  });

  it('trailing action icon-only buttons (fullscreen + print + cheat sheet) are 44x44 squares', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?data-action='toggle-fullscreen'[\s\S]*?data-action='print-calendar'[\s\S]*?data-action='toggle-cheat-sheet'[\s\S]*?flex: 0 0 44px/,
    );
  });

  it('prev / today / next buttons flex-fill the row, anchored to edges', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?data-action\$='-month'[\s\S]*?data-action='today'[\s\S]*?flex: 1 1 auto/,
    );
  });
});
