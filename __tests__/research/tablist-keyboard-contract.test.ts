// __tests__/research/tablist-keyboard-contract.test.ts — Phase F1.
//
// ── THE PROMISE THE ROLE MAKES ──────────────────────────────────────────────────────────────────
//
// `SegmentedTabs` shipped in A2 with `role="tablist"` and `role="tab"` and none of the keyboard
// behaviour those roles promise. That is worse than plain buttons would have been. A screen reader
// announces "tab 2 of 5", so the user reaches for an arrow key — because that is what the role
// MEANS — and nothing happened. Meanwhile every tab was its own Tab stop, so reaching the panel
// behind a five-tab bar took six presses.
//
// Nothing rendered wrong, nothing errored, and no existing test could have noticed: the defect was
// entirely in what the markup CLAIMED versus what it did.
//
// ── WHY THIS FILE TESTS A FUNCTION AND NOT A RENDER ─────────────────────────────────────────────
//
// There is no @testing-library/react in this repo (checked, not assumed — it is not in
// package.json), so a keydown on a rendered tablist cannot be asserted here. Rather than settle for
// a regex confirming the source string "ArrowRight" appears somewhere, the part with actual logic —
// the wrap at both ends, Home/End, the one-tab bar — was extracted into `nextTabIndex` and is
// tested directly. The wiring that cannot be extracted is pinned by source assertions below, which
// are honestly weaker and are marked as such.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { nextTabIndex } from '../../app/admin/research/components/ui/index';

describe('arrow keys move selection', () => {
  it('right and down go forward', () => {
    expect(nextTabIndex('ArrowRight', 0, 5)).toBe(1);
    expect(nextTabIndex('ArrowDown', 0, 5)).toBe(1);
  });

  it('left and up go back', () => {
    expect(nextTabIndex('ArrowLeft', 3, 5)).toBe(2);
    expect(nextTabIndex('ArrowUp', 3, 5)).toBe(2);
  });

  it('wraps at the end', () => {
    // Stopping dead at the last tab is the commonest half-implementation of this pattern.
    expect(nextTabIndex('ArrowRight', 4, 5)).toBe(0);
  });

  it('wraps at the start — no negative index', () => {
    // `(0 - 1) % 5` is -1 in JavaScript, which would focus nothing and throw no error.
    expect(nextTabIndex('ArrowLeft', 0, 5)).toBe(4);
  });

  it('Home and End jump to the ends', () => {
    expect(nextTabIndex('Home', 3, 5)).toBe(0);
    expect(nextTabIndex('End', 1, 5)).toBe(4);
  });
});

describe('keys the bar must not swallow', () => {
  it('returns null for anything else, so Tab still leaves the bar', () => {
    // The handler calls preventDefault() only on a non-null result. Returning 0 here instead of
    // null would trap focus inside the tab bar — the accessibility fix becoming the worse bug.
    for (const key of ['Tab', 'Enter', ' ', 'a', 'Escape', 'PageDown']) {
      expect(nextTabIndex(key, 2, 5), `${key} must not be handled`).toBeNull();
    }
  });

  it('handles a one-tab bar without dividing by zero or moving', () => {
    expect(nextTabIndex('ArrowRight', 0, 1)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, 1)).toBe(0);
    expect(nextTabIndex('End', 0, 1)).toBe(0);
  });

  it('returns null for an empty bar rather than NaN', () => {
    // `% 0` is NaN, and `refs.current[NaN]?.focus()` is a silent no-op — it would look like the
    // arrow keys simply were not wired.
    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
      expect(nextTabIndex(key, 0, 0)).toBeNull();
    }
  });
});

describe('the wiring the resolver cannot cover', () => {
  // Weaker than the tests above by design: these are source assertions, and a source assertion can
  // only prove the text is present, not that it works. They are here because roving tabindex and
  // focus-follows-selection have no extractable logic to test — they are one attribute and one
  // .focus() call.
  const src = fs.readFileSync(
    path.join(process.cwd(), 'app/admin/research/components/ui/index.tsx'),
    'utf8',
  );

  it('puts exactly one tab in the tab order', () => {
    expect(src).toMatch(/tabIndex=\{active \? 0 : -1\}/);
  });

  it('moves focus with selection', () => {
    // Without this the ring stays on the tab you left and the reader announces a tab you are no
    // longer on, which is a worse experience than no arrow support at all.
    expect(src).toMatch(/refs\.current\[wrapped\]\?\.focus\(\)/);
  });

  it('lets a caller point aria-controls at a real panel', () => {
    expect(src).toContain('aria-controls={t.panelId}');
  });
});

describe('every focusable primitive draws a visible ring', () => {
  const css = fs.readFileSync(
    path.join(process.cwd(), 'app/admin/research/components/ui/primitives.css'),
    'utf8',
  );

  it('accordion trigger, tab, and toggle each have :focus-visible', () => {
    // The toggle was the gap: a native checkbox inherits the UA ring, which differs per browser and
    // vanishes under some forced-colour settings, so the ring changed shape halfway down a form.
    for (const sel of [
      '.rui-accordion__trigger:focus-visible',
      '.rui-tabs__tab:focus-visible',
      '.rui-toggle__input:focus-visible',
    ]) {
      expect(css, `${sel} is missing`).toContain(sel);
    }
  });

  it('never removes an outline without replacing it', () => {
    // `outline: none` with nothing after it is how focus rings disappear in a "tidy-up" commit.
    expect(css).not.toMatch(/outline:\s*(none|0)\s*;/);
  });
});
