// __tests__/calendar/m5-cheat-sheet-phone.test.ts
//
// calendar-mobile Slice M5 — cheat sheet mobile sizing. Locks the
// phone CSS contract (full-screen modal, safe-area insets, 44pt
// close button).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Calendar.css — M5 cheat sheet phone sizing', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('phone drops the backdrop padding so the modal can fill the screen', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-page__cheat-sheet-backdrop \{[\s\S]*?padding: 0;[\s\S]*?align-items: stretch/,
    );
  });

  it('phone inner panel is full-width + full-height with no border-radius', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-page__cheat-sheet \{[\s\S]*?width: 100%;[\s\S]*?max-height: none;[\s\S]*?min-height: 100%;[\s\S]*?border-radius: 0/,
    );
  });

  it('respects env(safe-area-inset-bottom) so iOS home indicator is honored', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?padding-bottom: calc\(var\(--space-5\) \+ env\(safe-area-inset-bottom, 0px\)\)/,
    );
  });

  it('respects env(safe-area-inset-top) so the iOS notch is honored in landscape', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?padding-top: calc\(var\(--space-5\) \+ env\(safe-area-inset-top, 0px\)\)/,
    );
  });
});

describe('Calendar.css — M5 close button 44pt + list spacing', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('phone bumps the close button to 44×44 (Apple HIG)', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-page__cheat-sheet-header button \{[\s\S]*?width: 44px;[\s\S]*?height: 44px/,
    );
  });

  it('phone widens the list row gap so shortcuts have breathing room', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-page__cheat-sheet-list \{[\s\S]*?gap: var\(--space-3\) var\(--space-4\)/,
    );
  });

  it('phone bumps the kbd chip min-width + font-size for readability', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-page__cheat-sheet-list kbd \{[\s\S]*?min-width: 32px;[\s\S]*?font-size: var\(--text-sm\)/,
    );
  });
});
