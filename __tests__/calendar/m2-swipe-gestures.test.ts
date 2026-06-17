// __tests__/calendar/m2-swipe-gestures.test.ts
//
// calendar-mobile Slice M2 — touch swipe gestures. Locks the page
// wiring (pointer events, threshold constants, direction → goPrev/
// goNext mapping, mouse skip, interactive-target skip, vertical
// scroll preservation) + the edge-ghost CSS contract.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('/admin/calendar/page.tsx — M2 swipe wiring', () => {
  const SRC = read('app/admin/calendar/page.tsx');

  it('declares a swipeDx state for the drag delta', () => {
    expect(SRC).toMatch(/const \[swipeDx, setSwipeDx\] = useState<number>\(0\)/);
  });

  it('attaches pointerdown / pointermove / pointerup / pointercancel to the root', () => {
    expect(SRC).toMatch(/root\.addEventListener\('pointerdown', onDown\)/);
    expect(SRC).toMatch(/root\.addEventListener\('pointermove', onMove\)/);
    expect(SRC).toMatch(/root\.addEventListener\('pointerup', onUp\)/);
    expect(SRC).toMatch(/root\.addEventListener\('pointercancel', onCancel\)/);
  });

  it('skips mouse pointer types (desktop UX stays unchanged)', () => {
    expect(SRC).toMatch(
      /if \(e\.pointerType !== 'touch' && e\.pointerType !== 'pen'\) return;/,
    );
  });

  it('skips gestures that begin on a button / link / input / select / textarea / dialog / swipe-skip surface', () => {
    // Slice M3 added [data-swipe-skip="true"] so the week view's
    // horizontal scroll doesn't double-fire the prev/next swipe.
    expect(SRC).toMatch(
      /target\.closest\(\s*\n\s*'button, a, input, select, textarea, \[role="dialog"\], \[data-swipe-skip="true"\]',\s*\n\s*\);/,
    );
  });

  it('threshold constants: 50 px horizontal, 300 ms duration, 20 px ghost reveal', () => {
    expect(SRC).toMatch(/const SWIPE_THRESHOLD_PX = 50;/);
    expect(SRC).toMatch(/const SWIPE_MAX_MS = 300;/);
    expect(SRC).toMatch(/const GHOST_REVEAL_PX = 20;/);
  });

  it('treats motion as horizontal only when |dx| > |dy| (vertical scroll preserved)', () => {
    // Lock the move handler check + the up handler check both
    // require horizontal dominance.
    expect(SRC).toMatch(
      /Math\.abs\(dx\) > GHOST_REVEAL_PX && Math\.abs\(dx\) > Math\.abs\(dy\)/,
    );
    expect(SRC).toMatch(
      /Math\.abs\(dx\) >= SWIPE_THRESHOLD_PX &&[\s\S]*?Math\.abs\(dx\) > Math\.abs\(dy\) &&[\s\S]*?dt < SWIPE_MAX_MS/,
    );
  });

  it("right swipe (positive dx) goes BACK in time; left swipe goes FORWARD", () => {
    expect(SRC).toMatch(/if \(dx < 0\) goNext\(\);\s*\n\s*else goPrev\(\);/);
  });

  it('depends on goPrev + goNext so the effect re-binds when view changes', () => {
    expect(SRC).toMatch(/\}, \[goPrev, goNext\]\);/);
  });
});

describe('/admin/calendar/page.tsx — M2 edge ghost indicators', () => {
  const SRC = read('app/admin/calendar/page.tsx');

  it('renders two ghost spans with stable testIDs', () => {
    expect(SRC).toMatch(/data-testid="calendar-swipe-ghost-left"/);
    expect(SRC).toMatch(/data-testid="calendar-swipe-ghost-right"/);
  });

  it('ghosts are aria-hidden (decorative gesture preview)', () => {
    expect(SRC).toMatch(
      /<span\s*\n\s*className="calendar-page__swipe-ghost calendar-page__swipe-ghost--left"[\s\S]*?aria-hidden/,
    );
    expect(SRC).toMatch(
      /<span\s*\n\s*className="calendar-page__swipe-ghost calendar-page__swipe-ghost--right"[\s\S]*?aria-hidden/,
    );
  });

  it('left ghost opacity ramps when dx > 20 (right swipe = back)', () => {
    expect(SRC).toMatch(/opacity: swipeDx > 20 \? Math\.min\(1, swipeDx \/ 100\) : 0/);
  });

  it('right ghost opacity ramps when dx < -20 (left swipe = forward)', () => {
    expect(SRC).toMatch(/opacity: swipeDx < -20 \? Math\.min\(1, -swipeDx \/ 100\) : 0/);
  });
});

describe('Calendar.css — M2 ghost styling', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('ghost is position:fixed with a brand-navy fill, 56px circle', () => {
    expect(CSS).toMatch(
      /\.calendar-page__swipe-ghost \{[\s\S]*?position: fixed;[\s\S]*?width: 56px;[\s\S]*?height: 56px;[\s\S]*?background: var\(--color-brand-navy\)/,
    );
  });

  it('desktop hides the ghosts by default (display: none)', () => {
    expect(CSS).toMatch(/\.calendar-page__swipe-ghost \{[\s\S]*?display: none;/);
  });

  it('phone reveals the ghosts (display: flex)', () => {
    expect(CSS).toMatch(
      /@media \(max-width: 768px\) \{[\s\S]*?\.calendar-page__swipe-ghost \{\s*\n\s*display: flex;/,
    );
  });

  it('ghost is pointer-events: none so it never blocks taps', () => {
    expect(CSS).toMatch(/pointer-events: none/);
  });

  it('reduced-motion removes the opacity transition', () => {
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.calendar-page__swipe-ghost \{\s*\n\s*transition: none/,
    );
  });

  it('print stylesheet hides the ghosts', () => {
    expect(CSS).toMatch(
      /@media print \{[\s\S]*?\.calendar-page__swipe-ghost \{\s*\n\s*display: none !important/,
    );
  });
});
