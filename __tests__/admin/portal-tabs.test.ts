// __tests__/admin/portal-tabs.test.ts
//
// C2 of §8 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// *"Extract the shell as `lib/admin/portal/` … Everything after this is configuration."*
//
// ── THIS IS THE SLICE THE OTHER TWELVE STAND ON ─────────────────────────────────────────────────
//
// C3 through C12c are seventeen portals built on this. A mistake here is not one wrong page — it is
// the same wrong page seventeen times, discovered after they all exist. So the fallbacks get more
// attention than the happy path: every one of them is a real thing that happens, and every one of
// them fails by rendering something plausible rather than by throwing.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveTab, visibleTabs, canSeeTab, defaultTabFor, portalHref, tabToggleKey,
  type PortalSpec, type Viewer,
} from '@/lib/admin/portal/tabs';

const BILLING: PortalSpec = {
  route: '/admin/billing',
  tabs: [
    { id: 'overview', label: 'Overview' },
    { id: 'invoices', label: 'Invoices' },
    { id: 'history', label: 'Plan history' },
  ],
  defaultTab: 'overview',
};

/** §5's role split: a crew member lands on their own hours, a manager on the approval queue. */
const HOURS: PortalSpec = {
  route: '/admin/hours',
  tabs: [
    { id: 'mine', label: 'My hours' },
    { id: 'approvals', label: 'Approvals', roles: ['manager' as never, 'finance'] },
    { id: 'reports', label: 'Reports', requiredBundle: 'firm_suite' as never },
  ],
  defaultTab: (roles) => (roles.includes('finance') ? 'approvals' : 'mine'),
};

const viewer = (roles: string[], bundles: string[] = []): Viewer => ({ roles, bundles });

describe('which tab is showing', () => {
  it('the one the URL asks for', () => {
    expect(resolveTab(BILLING, 'invoices', viewer([]))).toBe('invoices');
  });

  it('the default when the URL says nothing', () => {
    expect(resolveTab(BILLING, null, viewer([]))).toBe('overview');
    expect(resolveTab(BILLING, '', viewer([]))).toBe('overview');
  });

  it('and the default when the URL asks for something that does not exist', () => {
    // A mistyped link, or a bookmark from before a tab was renamed. Both examples handle this and
    // both say why: a stale link should land somewhere useful, not on a blank panel.
    expect(resolveTab(BILLING, 'nonsense', viewer([]))).toBe('overview');
  });
});

describe('a tab this viewer may not see', () => {
  it('is not in the strip', () => {
    expect(visibleTabs(HOURS, viewer(['employee'])).map((t) => t.id)).toEqual(['mine']);
    expect(visibleTabs(HOURS, viewer(['finance'])).map((t) => t.id)).toEqual(['mine', 'approvals']);
  });

  it('and asking for it by URL lands on something they CAN see', () => {
    // The normal way this happens, not an edge case: somebody sends a link from an account with more
    // access. Rendering nothing would look like the portal being broken.
    expect(resolveTab(HOURS, 'approvals', viewer(['employee']))).toBe('mine');
  });

  it('an admin sees every tab of a portal they can reach', () => {
    // Same rule as `accessibleRoutes`, and worth stating rather than inheriting: a portal whose
    // approval tab was invisible to admins would be a portal nobody could administer.
    expect(visibleTabs(HOURS, viewer(['admin'])).map((t) => t.id)).toEqual(['mine', 'approvals']);
  });

  it('the bundle is a separate question from the role', () => {
    // Different remedies — buy the bundle vs. ask an admin — and one boolean for both makes "why is
    // this tab missing" unanswerable. An admin does NOT bypass a bundle: the firm has not paid.
    expect(canSeeTab(HOURS, HOURS.tabs[2], viewer(['admin']))).toBe(false);
    expect(canSeeTab(HOURS, HOURS.tabs[2], viewer(['employee'], ['firm_suite']))).toBe(true);
  });
});

describe('the firm switched a tab off', () => {
  it('§11 keys a tab as route#tab', () => {
    expect(tabToggleKey('/admin/pay', 'rewards')).toBe('/admin/pay#rewards');
  });

  it('and a switched-off tab leaves the strip', () => {
    const off = { '/admin/billing#invoices': false };
    expect(visibleTabs(BILLING, viewer(['admin']), off).map((t) => t.id)).toEqual(['overview', 'history']);
  });

  it('including for an admin, because an easier sidebar is the whole request', () => {
    expect(canSeeTab(BILLING, BILLING.tabs[1], viewer(['admin']), { '/admin/billing#invoices': false }))
      .toBe(false);
  });

  it('and switching off the PORTAL takes its tabs with it', () => {
    expect(visibleTabs(BILLING, viewer(['admin']), { '/admin/billing': false })).toEqual([]);
  });
});

describe('the per-role default', () => {
  it('sends different people to different front doors', () => {
    // §5: "one portal, several views". A crew member lands on their own hours and a manager on the
    // approval queue — one portal with two front doors rather than two portals.
    expect(resolveTab(HOURS, null, viewer(['employee']))).toBe('mine');
    expect(resolveTab(HOURS, null, viewer(['finance']))).toBe('approvals');
  });

  it('and a default nobody can open falls through instead of rendering empty', () => {
    // A per-role default pointed at a gated tab would otherwise render the portal blank for exactly
    // the people it was defaulted FOR — the worst possible audience for that bug.
    const spec: PortalSpec = { ...HOURS, defaultTab: 'approvals' };
    expect(resolveTab(spec, null, viewer(['employee']))).toBe('mine');
  });
});

describe('a viewer who can see no tab at all', () => {
  it('gets null, not a guess', () => {
    // Every tab switched off, or all of them role-gated away. A real state, and the caller has to
    // say something rather than draw a strip with nothing in it.
    expect(resolveTab(BILLING, 'overview', viewer([]), { '/admin/billing': false })).toBeNull();
    expect(resolveTab({ ...BILLING, tabs: [] }, null, viewer(['admin']))).toBeNull();
  });
});

// ── THE URL ─────────────────────────────────────────────────────────────────────────────────────

describe('what a tab\'s URL looks like', () => {
  it('the default tab has no ?tab= at all', () => {
    // Both examples do this and both are right: a portal whose front door is `?tab=overview` has two
    // URLs for one page, and the one people paste is the ugly one.
    expect(portalHref(BILLING, 'overview', viewer([]))).toBe('/admin/billing');
    expect(portalHref(BILLING, 'invoices', viewer([]))).toBe('/admin/billing?tab=invoices');
  });

  it('and the default is the VIEWER\'s default, not the spec\'s first tab', () => {
    // With a per-role default, `/admin/hours` means different things to different people — and each
    // of them should get the clean URL for their own front door.
    expect(portalHref(HOURS, 'approvals', viewer(['finance']))).toBe('/admin/hours');
    expect(portalHref(HOURS, 'approvals', viewer(['employee']))).toBe('/admin/hours?tab=approvals');
  });

  it('keeps the OTHER parameters a portal owns', () => {
    // ── THE ONE THING THE TWO EXAMPLES DISAGREED ABOUT ────────────────────────────────────────
    //
    // `/admin/marketing` carries a date range beside the tab and has one writer for the whole query
    // string, because changing the tab used to drop the period — the exact bug it was consolidated
    // to fix. A shell that owned `?tab=` alone would have re-created it inside the thing extracted
    // from it, in every portal that later grew a second parameter.
    const MKT: PortalSpec = { route: '/admin/marketing', tabs: [{ id: 'overview', label: 'O' }, { id: 'spend', label: 'S' }], defaultTab: 'overview' };
    expect(portalHref(MKT, 'spend', viewer([]), { preset: 'this-month' }))
      .toBe('/admin/marketing?tab=spend&preset=this-month');
    // …and on the default tab, where there is no `?tab=` to hang them off.
    expect(portalHref(MKT, 'overview', viewer([]), { preset: 'this-month' }))
      .toBe('/admin/marketing?preset=this-month');
  });

  it('and drops an empty one rather than writing a trailing &preset=', () => {
    // The kind of thing that survives a copy-paste and then fails to parse on the way back in.
    const MKT: PortalSpec = { route: '/admin/marketing', tabs: [{ id: 'overview', label: 'O' }], defaultTab: 'overview' };
    expect(portalHref(MKT, 'overview', viewer([]), { preset: '', from: '2026-01-01' }))
      .toBe('/admin/marketing?from=2026-01-01');
  });
});

describe('defaultTabFor', () => {
  it('takes a constant or a function', () => {
    expect(defaultTabFor(BILLING, viewer([]))).toBe('overview');
    expect(defaultTabFor(HOURS, viewer(['finance']))).toBe('approvals');
  });
});

// ── WHAT THE SHELL IS AND IS NOT ────────────────────────────────────────────────────────────────

describe('the shell decides visibility and never permission', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'lib/admin/portal/tabs.ts'), 'utf8',
  );
  /** Comments stripped: three assertions this session failed against files that were correct,
   *  because the thing they asserted was absent from the code and present in the comment saying so. */
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('is pure — no router, no session, no fetch', () => {
    // Which tab is showing, who may see what, and what URL a tab has are three questions with exact
    // answers, and they are where the mistakes live. Testing them through a rendered component would
    // mean standing up a router, a session and a DOM to assert a string comparison.
    expect(code).not.toMatch(/next\/navigation/);
    expect(code).not.toMatch(/useState|useEffect/);
    expect(code).not.toMatch(/fetch\(/);
  });

  it('and hiding a tab is never why a request is refused', () => {
    // §11.5 in a second costume. The APIs behind a tab keep every check they have; a tab hidden from
    // somebody who could call its endpoint directly is a filter, not a lock, and believing otherwise
    // is how a visibility control becomes a security hole with a friendly name.
    expect(code).not.toMatch(/40[13]/);
    expect(code).not.toMatch(/throw new Error/);
  });
});
