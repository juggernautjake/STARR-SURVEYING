// __tests__/admin/portal-tab-keyboard.test.ts — the shared tablist keyboard contract.
//
// ── WHAT WAS MEASURED ───────────────────────────────────────────────────────────────────────────
//
// 2026-08-31, across `app/admin/**/page.tsx`: **seventeen portals declare `role="tablist"`. Three
// implement no keyboard behaviour at all** — `marketing`, `notes`, and
// `employees/manage/[email]/history`. The other fourteen each hand-roll the same eight lines, and
// **not one of them handles Home or End.**
//
// Declaring that role is a promise about the keyboard. A screen reader announces "tab 2 of 7", the
// user reaches for an arrow key because that is what the role MEANS, and on those three nothing
// happens — while every tab is its own Tab stop, so reaching the panel behind a seven-tab bar takes
// eight presses. Worse than plain buttons: the markup states something untrue. `SegmentedTabs` had
// exactly this defect until Phase F1, which is what prompted the count.
//
// ── THERE IS NO DOM TEST ENVIRONMENT HERE, AND ONE WAS NOT ADDED ────────────────────────────────
//
// Checked, not assumed: no jsdom, no happy-dom, no linkedom. This repo renders with
// `react-dom/server` under `environment: 'node'` deliberately. So a keydown on a rendered bar
// cannot be asserted, and pulling in a DOM environment to cover eight lines would be a poor trade.
//
// Instead everything that can be wrong in an interesting way was moved into `tabMoveTarget`, which
// takes a plain list of ids and is tested here in full. What remains in the hook is a query and a
// `.focus()`, pinned by the source assertions at the bottom — which are weaker, and are labelled as
// such rather than dressed up as behaviour.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { tabMoveTarget } from '../../lib/admin/portal/tab-keyboard';

const BAR = ['projects', 'coverage', 'library', 'sites'];

describe('arrows step and wrap', () => {
  it('moves forward on ArrowRight and ArrowDown', () => {
    expect(tabMoveTarget('ArrowRight', BAR, 'projects')).toBe('coverage');
    expect(tabMoveTarget('ArrowDown', BAR, 'projects')).toBe('coverage');
  });

  it('moves back on ArrowLeft and ArrowUp', () => {
    expect(tabMoveTarget('ArrowLeft', BAR, 'library')).toBe('coverage');
    expect(tabMoveTarget('ArrowUp', BAR, 'library')).toBe('coverage');
  });

  it('wraps at the end', () => {
    expect(tabMoveTarget('ArrowRight', BAR, 'sites')).toBe('projects');
  });

  it('wraps at the start — no negative index', () => {
    // `(0 - 1) % 4` is -1 in JavaScript. `tabIds[-1]` is undefined, `.focus()` on it is a silent
    // no-op, and the symptom is "the left arrow does nothing on the first tab" — which reads as the
    // handler never having been wired at all.
    expect(tabMoveTarget('ArrowLeft', BAR, 'projects')).toBe('sites');
  });
});

describe('Home and End — the part all fourteen hand-rolled copies were missing', () => {
  it('Home goes to the first tab', () => {
    expect(tabMoveTarget('Home', BAR, 'library')).toBe('projects');
  });

  it('End goes to the last', () => {
    expect(tabMoveTarget('End', BAR, 'coverage')).toBe('sites');
  });

  it('both are stable when already there', () => {
    expect(tabMoveTarget('Home', BAR, 'projects')).toBe('projects');
    expect(tabMoveTarget('End', BAR, 'sites')).toBe('sites');
  });
});

describe('keys the bar must not swallow', () => {
  it('returns null for anything else, so focus can still leave the bar', () => {
    // The handler calls preventDefault() only on a non-null result. Returning the current id here
    // instead of null would trap focus inside the tab bar for ever — the accessibility fix becoming
    // a far worse bug than the one it replaced.
    for (const key of ['Tab', 'Enter', ' ', 'Escape', 'a', 'PageDown']) {
      expect(tabMoveTarget(key, BAR, 'coverage'), `${key} must not be handled`).toBeNull();
    }
  });
});

describe('bars that are not the happy case', () => {
  it('a one-tab bar does not move and does not divide by zero', () => {
    expect(tabMoveTarget('ArrowRight', ['only'], 'only')).toBe('only');
    expect(tabMoveTarget('End', ['only'], 'only')).toBe('only');
  });

  it('an empty bar returns null rather than undefined', () => {
    // `% 0` is NaN, and `tabIds[NaN]` is undefined — which would be passed to `select()` and
    // navigate to `?tab=undefined`.
    expect(tabMoveTarget('ArrowRight', [], 'nothing')).toBeNull();
  });

  it('an unknown current id does not move at all', () => {
    // The caller and the DOM disagreeing. Moving from a guessed position lands somewhere arbitrary,
    // which is worse than not moving: the user presses Right and arrives two tabs away.
    expect(tabMoveTarget('ArrowRight', BAR, 'not-a-tab')).toBeNull();
    expect(tabMoveTarget('Home', BAR, '')).toBeNull();
  });

  it('role-filtered bars work — the ids are whatever this viewer can SEE', () => {
    // Portal tabs are filtered by role and feature toggles before they are drawn, so the list is
    // per-viewer. Indexing into the full spec instead would skip past hidden tabs onto ones that
    // are not on screen.
    const visible = ['projects', 'billing'];
    expect(tabMoveTarget('ArrowRight', visible, 'projects')).toBe('billing');
    expect(tabMoveTarget('ArrowRight', visible, 'billing')).toBe('projects');
  });
});

describe('the wiring the resolver cannot cover', () => {
  // Weaker than everything above, deliberately: source assertions prove text is present, not that
  // it works. They are here because a DOM query and a .focus() have no extractable logic left.
  const hook = fs.readFileSync('lib/admin/portal/usePortalTabs.ts', 'utf8');
  const kbd = fs.readFileSync('lib/admin/portal/tab-keyboard.ts', 'utf8');

  it('the hook finds the bar in the DOM rather than assuming an id convention', () => {
    // An id lookup that drifts focuses NOTHING, which looks exactly like arrow keys never having
    // been wired. The seventeen portals do not share an id scheme; several have no ids at all.
    expect(hook).toContain('siblingTabs(el)');
    expect(hook).toContain("getAttribute('data-tab-id')");
  });

  it('focus follows selection', () => {
    expect(hook).toContain('?.focus()');
  });

  it('the bar query is scoped to the bar, not the document', () => {
    // A page can hold two tablists — a portal strip and a strip inside the panel it shows. A
    // document-wide query would make End on the outer bar jump focus into the inner one.
    expect(kbd).toContain(':scope > [role="tab"]');
    expect(kbd).toContain("closest('[role=\"tablist\"]')");
  });

  it('the research portal uses the shared handler and marks its tabs', () => {
    const page = fs.readFileSync('app/admin/research/page.tsx', 'utf8');
    expect(page).toContain('onKeyDown={tabKeyDown}');
    expect(page, 'the handler reads this attribute to know where it is')
      .toContain('data-tab-id={t.id}');
    expect(page, 'the inline copy should be gone').not.toContain("e.key === 'ArrowRight' ? 1 : -1");
  });

  it('there is ONE implementation — the research primitive re-exports rather than copies', () => {
    // Two copies of a keyboard contract is precisely how one of them ends up without Home/End,
    // which is what had happened across all seventeen bars.
    const ui = fs.readFileSync('app/admin/research/components/ui/index.tsx', 'utf8');
    expect(ui).toContain("from '@/lib/admin/portal/tab-keyboard'");
    expect(ui, 'the primitive must not carry its own copy of the switch')
      .not.toContain("case 'Home':");
  });
});
