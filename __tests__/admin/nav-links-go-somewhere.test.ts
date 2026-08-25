// __tests__/admin/nav-links-go-somewhere.test.ts
//
// Owner, 2026-08-04: *"whenever I click on 'My Hours' in the nav menu, it takes me to the hub. It
// almost seems like every nav menu link routes back to the hub. It seems like routing is broken."*
//
// ── ROUTING WAS NOT BROKEN ──────────────────────────────────────────────────────────────────────
//
// Five entries in `ADMIN_ROUTES` pointed at `/admin/me?tab=…` — which **is** the Hub — and the `tab`
// parameter has meant nothing since Slice 189 retired the Hub's tab bar. So the menu offered five
// destinations that all landed on the same undifferentiated page.
//
// From the outside that is indistinguishable from a broken router, which is how it was reported. The
// registry is the single source for the icon rail, the ⌘K palette, the mobile drawer and the
// breadcrumb resolver, so one wrong `href` is wrong in four places at once — and nothing checked
// that a registered destination was a page rather than a query string.
//
// `MyHoursPanel`, `MyPayPanel` and `MyNotesPanel` were never deleted. Only their `page.tsx` files
// were, in the same consolidation that removed `/admin/profile`, and each was left reachable from
// nothing but the UX harness. Whole components that had lost their doors.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { ADMIN_ROUTES } from '@/lib/admin/route-registry';
import { LEGACY_REDIRECTS } from '@/lib/admin/legacy-redirects';

/** Routes with a dynamic segment cannot be checked for a literal file. */
const staticRoutes = ADMIN_ROUTES.filter((r) => !r.href.includes('['));

describe('every menu destination is a page', () => {
  it('the registry is big enough that this is worth checking', () => {
    // The floor was 100 and the registry has fallen through it — which is the consolidation plan
    // WORKING, not a regression: C1–C9 turned ~45 sidebar rows into nine portals, and §6 expects the
    // final number to be nearer 30 than 138.
    //
    // Kept rather than deleted, and lowered rather than removed, because the guard's real job is to
    // notice a registry that has collapsed to nothing — an import that silently returned `[]` would
    // make every assertion below pass while checking no routes at all.
    expect(ADMIN_ROUTES.length).toBeGreaterThan(50);
  });

  it('no registered route carries a query string', () => {
    // `/admin/me?tab=hours` is not a route, it is the Hub with a parameter nothing reads. A registry
    // entry that needs a query to mean anything is one whose meaning lives somewhere else.
    const withQuery = ADMIN_ROUTES.filter((r) => r.href.includes('?')).map((r) => `${r.label} → ${r.href}`);
    expect(
      withQuery,
      `These menu entries point at a query string rather than a page:\n  ${withQuery.join('\n  ')}`,
    ).toEqual([]);
  });

  it('every registered route has a page file behind it', () => {
    const missing = staticRoutes
      .filter((r) => !fs.existsSync(`app${r.href}/page.tsx`) && !fs.existsSync(`app${r.href}/page.ts`))
      .map((r) => `${r.label} → ${r.href}`);
    expect(
      missing,
      `Registered in the nav with no page to render:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('no registered route is one the middleware redirects away', () => {
    // The subtler version of the same bug: a page exists, the menu points at it, and middleware
    // sends the visitor somewhere else before it renders. That looks exactly like a dead link and is
    // harder to diagnose, because the page file is right there.
    const redirected = ADMIN_ROUTES
      .filter((r) => r.href in LEGACY_REDIRECTS)
      .map((r) => `${r.label} → ${r.href} → ${LEGACY_REDIRECTS[r.href]}`);
    expect(
      redirected,
      `These are offered in the menu and redirected away before they render:\n  ${redirected.join('\n  ')}`,
    ).toEqual([]);
  });

  it('every legacy redirect lands somewhere that exists', () => {
    // A redirect to a deleted page is a 404 with extra steps.
    const broken: string[] = [];
    for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
      const path = to.split('?')[0];
      if (!fs.existsSync(`app${path}/page.tsx`) && !fs.existsSync(`app${path}/page.ts`)) {
        broken.push(`${from} → ${to}`);
      }
    }
    expect(broken, `Redirects pointing at nothing:\n  ${broken.join('\n  ')}`).toEqual([]);
  });

  it('the personal pages that lost their routes have them back', () => {
    // Named individually because these are the five the owner actually clicked. A generic sweep
    // passing while "My Hours" still lands on the Hub would be the guard defending the wrong thing.
    for (const [label, href] of [
      // C4 (2026-08-25): the Hours portal absorbed `/admin/my-hours` as its `my-time` tab, and the
      // nav row is called 'Hours & Time' now. The thing this guard is about — the owner clicked
      // 'My Hours' and landed on the Hub — is unchanged: there is still exactly one nav row that
      // opens a timesheet, and 'my hours' is still one of its keywords so searching finds it.
      ['Hours & Time', '/admin/hours'],
      // C6: absorbed as the Pay portal's `my-pay` tab. Same guard, new row: there is still exactly
      // one nav entry that opens somebody's own pay, and 'my pay' is one of its keywords.
      ['Pay & Payouts', '/admin/pay'],
      ['My Notes', '/admin/my-notes'],
      // 'My Profile' and 'My Jobs' were FOLDED into entries that already served those pages rather
      // than repointed — two rows for one href is how a menu shows the same destination twice under
      // different names, and the uniqueness guard catches it. The old labels survive as keywords, so
      // searching either still finds the page.
      ['Profile & Settings', '/admin/profile'],
      ['Assignments', '/admin/assignments'],
    ] as const) {
      const route = ADMIN_ROUTES.find((r) => r.label === label);
      expect(route, `${label} is no longer in the nav at all`).toBeDefined();
      expect(route!.href, `${label} still points at the Hub`).toBe(href);
      expect(fs.existsSync(`app${href}/page.tsx`), `${href} has no page`).toBe(true);
    }

    // The folded labels must remain findable, or the fold quietly removed two things people search
    // for. This is the half a "no duplicates" rule would happily let you lose.
    const searchable = ADMIN_ROUTES.flatMap((r) => r.keywords ?? []);
    expect(searchable, 'searching "my profile" must still find something').toContain('my profile');
    expect(searchable, 'searching "my jobs" must still find something').toContain('my jobs');
  });
});
