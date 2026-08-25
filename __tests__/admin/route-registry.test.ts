// __tests__/admin/route-registry.test.ts
//
// Phase 1 slice 1a — locks the data shape, role-gate parity, and Cmd+K
// ranker behavior in the registry before the palette UI consumes it.
//
// Spec: docs/planning/completed/ADMIN_NAVIGATION_REDESIGN.md §7 + §12.

import { describe, expect, it } from 'vitest';

import {
  ADMIN_ROUTES,
  WORKSPACES,
  WORKSPACE_ORDER,
  accessibleRoutes,
  breadcrumbTrail,
  findRoute,
  parentCrumb,
  rankRoutes,
  routeLabel,
  routesForWorkspace,
  scoreRoute,
  workspaceOf,
} from '@/lib/admin/route-registry';
import type { AdminRoute, Workspace } from '@/lib/admin/route-registry';

describe('route-registry — shape + uniqueness', () => {
  it('every WORKSPACE_ORDER entry has a WORKSPACES metadata entry', () => {
    for (const ws of WORKSPACE_ORDER) {
      expect(WORKSPACES[ws]).toBeDefined();
      expect(WORKSPACES[ws].id).toBe(ws);
    }
  });

  it('every AdminRoute references a workspace that exists in WORKSPACES', () => {
    const validWorkspaces = new Set<Workspace>(WORKSPACE_ORDER);
    for (const route of ADMIN_ROUTES) {
      expect(validWorkspaces.has(route.workspace)).toBe(true);
    }
  });

  it('every AdminRoute href is unique', () => {
    const hrefs = ADMIN_ROUTES.map((r) => r.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('every AdminRoute href starts with /admin', () => {
    for (const route of ADMIN_ROUTES) {
      expect(route.href.startsWith('/admin')).toBe(true);
    }
  });
});

describe('route-registry — lookups', () => {
  it('findRoute returns the route for a known href', () => {
    const route = findRoute('/admin/receipts');
    expect(route).toBeDefined();
    expect(route?.label).toBe('Receipts & Spending');
    // Receipts moved Office → Money in platform audit item 7 (§2.2): it is money going out.
    expect(route?.workspace).toBe('money');
  });

  it('findRoute returns undefined for an unknown href', () => {
    expect(findRoute('/admin/does-not-exist')).toBeUndefined();
  });

  it('workspaceOf resolves a registered href to its workspace', () => {
    expect(workspaceOf('/admin/jobs')).toBe('work');
    expect(workspaceOf('/admin/cad')).toBe('research-cad');
    expect(workspaceOf('/admin/receipts')).toBe('money');
  });

  it('workspaceOf picks the deepest-prefix match for nested paths', () => {
    // /admin/research and /admin/research/testing both register; a
    // pathname under /admin/research/testing/foo must resolve to the
    // testing-lab workspace, not bubble up to /admin/research.
    expect(workspaceOf('/admin/research/testing/run-42')).toBe('research-cad');
    expect(workspaceOf('/admin/jobs/abc-123/edit')).toBe('work');
  });

  it('workspaceOf returns null when no prefix matches', () => {
    expect(workspaceOf('/marketing/about')).toBeNull();
  });

  it('routesForWorkspace returns only that workspace\'s routes', () => {
    const work = routesForWorkspace('work');
    expect(work.length).toBeGreaterThan(0);
    for (const route of work) expect(route.workspace).toBe('work');
  });
});

describe('route-registry — breadcrumb trail (F1)', () => {
  it('returns [] for non-admin paths', () => {
    expect(breadcrumbTrail('/marketing/about')).toEqual([]);
    expect(breadcrumbTrail('/ux-harness')).toEqual([]);
  });

  it('a registered hub page reads Hub › <page> with the page current', () => {
    // Was `/admin/dashboard`, which platform audit item 6 deleted — and which kept passing anyway,
    // because `breadcrumbTrail` falls back to the Hub workspace for an unregistered path and derives
    // the label from the segment. A test that passes identically whether or not the route exists is
    // not testing the registry, so this uses a route that is genuinely registered under Hub.
    const trail = breadcrumbTrail('/admin/assignments');
    expect(trail.map((c) => c.label)).toEqual(['Hub', 'Assignments']);
    expect(trail[0].href).toBe('/admin/me');
    expect(trail[trail.length - 1].isCurrent).toBe(true);
    expect(trail[0].isCurrent).toBe(false);
  });

  it('a detail/[id] page gets a derived leaf + a clickable list ancestor', () => {
    const trail = breadcrumbTrail('/admin/jobs/9f8e7d6c-5b4a-3210-1234-567890abcdef');
    expect(trail.map((c) => c.label)).toEqual(['Work', 'All Jobs', 'Job Detail']);
    // the list ancestor is a real, clickable route (not current)
    const list = trail.find((c) => c.href === '/admin/jobs');
    expect(list?.isCurrent).toBe(false);
    // only the final crumb is current
    expect(trail.filter((c) => c.isCurrent)).toHaveLength(1);
    expect(trail[trail.length - 1].isCurrent).toBe(true);
  });

  it('the deepest registered prefix becomes a mid-trail crumb', () => {
    const trail = breadcrumbTrail('/admin/research/testing/run-42');
    const hrefs = trail.map((c) => c.href);
    expect(hrefs).toContain('/admin/research/testing');
    expect(trail[trail.length - 1].isCurrent).toBe(true);
  });

  it('every registered route resolves to a non-empty trail ending in itself', () => {
    for (const route of ADMIN_ROUTES) {
      const trail = breadcrumbTrail(route.href);
      expect(trail.length, `no trail for ${route.href}`).toBeGreaterThan(0);
      expect(trail[trail.length - 1].href).toBe(route.href.split('?')[0]);
      expect(trail[trail.length - 1].isCurrent).toBe(true);
    }
  });

  it('parentCrumb is null at a workspace root and a clickable list elsewhere', () => {
    expect(parentCrumb('/admin/me')).toBeNull();
    const p = parentCrumb('/admin/jobs/9f8e7d6c-5b4a-3210-1234-567890abcdef');
    expect(p?.href).toBe('/admin/jobs');
    expect(p?.label).toBe('All Jobs');
  });

  it('routeLabel uses the registry label for registered routes', () => {
    expect(routeLabel('/admin/jobs')).toBe('All Jobs');
    expect(routeLabel('/admin/research/testing')).toBe('Testing Lab');
  });

  it('routeLabel derives readable labels for unregistered leaves', () => {
    expect(routeLabel('/admin/jobs/9f8e7d6c5b4a3210')).toBe('Job Detail'); // id leaf
    expect(routeLabel('/admin/some/plan-history')).toBe('Plan History'); // title-cased segment
    // A SYNTHETIC path, deliberately. This used `/admin/equipment/templates/new`, which was genuinely
    // unregistered when the test was written and is now a real registry entry (§1.4, 2026-08-01) — so
    // the test failed for the best possible reason and was testing the wrong thing either way. A route
    // that exists cannot demonstrate the fallback for routes that do not.
    expect(routeLabel('/admin/some/new')).toBe('New'); // unregistered word segment
  });
});

describe('route-registry — access filtering', () => {
  it('admin sees every route that is not parked', () => {
    const visible = accessibleRoutes({ roles: ['admin'], isCompanyUser: true });
    expect(visible.length).toBe(ADMIN_ROUTES.filter((r) => !r.parked).length);
  });

  it('parked routes are hidden from admins too — that is what parked means', () => {
    // A parked feature is deliberately out of circulation. Exempting admins would put it back in
    // circulation for exactly the people who decide what the firm uses.
    const parked = ADMIN_ROUTES.filter((r) => r.parked);
    const visible = accessibleRoutes({ roles: ['admin'], isCompanyUser: true });
    for (const route of parked) {
      expect(visible.some((r) => r.href === route.href), `${route.href} should be hidden`).toBe(false);
    }
  });

  it('a parked route still resolves, so bookmarks and breadcrumbs keep working', () => {
    // Parked is not deleted. The distinction matters: the pay-progression pages are wanted back
    // later, and a 404 in the meantime would look like data loss.
    for (const route of ADMIN_ROUTES.filter((r) => r.parked)) {
      expect(findRoute(route.href)).toBeTruthy();
    }
  });

  it('non-company users never see internalOnly routes', () => {
    const visible = accessibleRoutes({ roles: ['admin'], isCompanyUser: false });
    for (const route of visible) expect(route.internalOnly).not.toBe(true);
  });

  it('roleless route is visible to everyone (e.g. guest, no company email)', () => {
    const visible = accessibleRoutes({ roles: ['guest'], isCompanyUser: false });
    // Routes without `roles` and without `internalOnly` should appear. This asserted on
    // `/admin/dashboard` until platform audit Phase 1 item 6 deleted it; `/admin/me` is the Hub, and
    // it has been the roleless route this rule is really about all along.
    const hub = visible.find((r) => r.href === '/admin/me');
    expect(hub).toBeDefined();
  });

  it('role gates are honored for non-admin users', () => {
    // A pure student should NOT see admin-only routes like Settings.
    const visible = accessibleRoutes({ roles: ['student'], isCompanyUser: false });
    const settings = visible.find((r) => r.href === '/admin/settings');
    expect(settings).toBeUndefined();
  });

  it('equipment_manager hat unlocks the Equipment workspace gates', () => {
    const visible = accessibleRoutes({ roles: ['equipment_manager'], isCompanyUser: true });
    // C3 (2026-08-25): the sample moved, the invariant did not. This asserted
    // `/admin/equipment/maintenance`, which is a TAB of the Equipment portal now and no longer a
    // registry row — the consolidation is the change, not a regression in who may see what.
    //
    // Deliberately re-pointed at the portal rather than deleted: the thing being guarded is that an
    // `equipment_manager` reaches the Equipment workspace at all, and after C3 that is one route.
    const equipment = visible.find((r) => r.href === '/admin/equipment');
    expect(equipment).toBeDefined();
    // …without leaking admin-only routes like Settings.
    expect(visible.find((r) => r.href === '/admin/settings')).toBeUndefined();
  });
});

describe('route-registry — Cmd+K ranker', () => {
  it('typing "rec" surfaces Receipts as the top result (§12 acceptance)', () => {
    const ranked = rankRoutes(ADMIN_ROUTES, 'rec');
    expect(ranked[0]?.href).toBe('/admin/receipts');
  });

  it('exact label match outscores partial matches', () => {
    const ranked = rankRoutes(ADMIN_ROUTES, 'Office');
    expect(ranked[0]?.label).toBe('Office');
  });

  it('keyword hits route the user past synonyms (e.g. paycheck → Pay & Payouts)', () => {
    // C6 (2026-08-25): 'Payroll' is a TAB now and its keywords moved to the portal row. The property
    // this guards — typing a word nobody labelled a page with still finds the page — is exactly why
    // those keywords were carried across rather than dropped, and is asserted on the row that
    // survived. Somebody typing 'paycheck' who got nothing would read it as the feature being gone.
    const ranked = rankRoutes(ADMIN_ROUTES, 'paycheck');
    const labels = ranked.map((r) => r.label);
    expect(labels).toContain('Pay & Payouts');
  });

  it('empty query returns the original list unchanged', () => {
    const ranked = rankRoutes(ADMIN_ROUTES, '');
    expect(ranked.length).toBe(ADMIN_ROUTES.length);
    expect(ranked[0]?.href).toBe(ADMIN_ROUTES[0].href);
  });

  it('non-matching query yields an empty list', () => {
    expect(rankRoutes(ADMIN_ROUTES, '~~zzzz~~')).toEqual([]);
  });

  it('scoring is case-insensitive', () => {
    const upper = scoreRoute(findRoute('/admin/receipts')!, 'RECEIPTS');
    const lower = scoreRoute(findRoute('/admin/receipts')!, 'receipts');
    expect(upper).toBe(lower);
    expect(upper).toBeGreaterThan(0);
  });

  it('stable sort: equal-score routes keep their registry order', () => {
    // Two routes with identical labels would tie; instead we test that
    // a deterministic input yields a deterministic output across calls.
    const a = rankRoutes(ADMIN_ROUTES, 'admin');
    const b = rankRoutes(ADMIN_ROUTES, 'admin');
    expect(a.map((r) => r.href)).toEqual(b.map((r) => r.href));
  });

  it('recentRoutes boosts a matching route over an equally-scoring fresh one (§8 Phase 6)', () => {
    // Rewritten 2026-08-01. It used to boost the WORST match for "admin" and expect it to reach the
    // top, which held only while the corpus was small enough for the worst match to sit within the
    // boost of the best. Registering 35 orphan routes (§1.4) widened that range and it stopped — for a
    // reason that says nothing about recency: the boost is +25 and the gap had simply grown past it.
    //
    // The property in the test's own title is "over an EQUALLY-SCORING one", and the only honest way to
    // test that is to construct the tie. Even the runner-up in the real registry does not work: the gap
    // between an exact-label match and the next hit is larger than the +25 boost, which is CORRECT — a
    // route you visited yesterday should not outrank the thing you literally just typed the name of.
    //
    // So this uses two synthetic routes that score identically, which is the only configuration where
    // recency is the deciding factor. It also makes the test independent of how many routes exist,
    // which is what broke it twice.
    const twins: AdminRoute[] = [
      { href: '/admin/twin-a', label: 'Twin', workspace: 'office', iconName: 'Circle', description: 'A twin.' },
      { href: '/admin/twin-b', label: 'Twin', workspace: 'office', iconName: 'Circle', description: 'A twin.' },
    ];
    // Ties break on registry order, so A leads with no recency.
    expect(rankRoutes(twins, 'Twin')[0].href).toBe('/admin/twin-a');
    // …and B leads once it is the recent one.
    expect(rankRoutes(twins, 'Twin', { recentRoutes: ['/admin/twin-b'] })[0].href).toBe('/admin/twin-b');
  });

  it('but recency does NOT outrank a much better match', () => {
    // The other half of the same rule, and the reason the boost is small: typing an exact label must
    // win over something you happened to open yesterday. Without this, the palette would start
    // second-guessing what you just typed.
    const routes: AdminRoute[] = [
      { href: '/admin/exact', label: 'Reconcile', workspace: 'office', iconName: 'Circle', description: 'Exact.' },
      { href: '/admin/loose', label: 'Something else', workspace: 'office', iconName: 'Circle', description: 'Mentions reconcile in passing.' },
    ];
    const ranked = rankRoutes(routes, 'Reconcile', { recentRoutes: ['/admin/loose'] });
    expect(ranked[0].href).toBe('/admin/exact');
  });

  it('recencyBoost never surfaces a non-matching route', () => {
    const ranked = rankRoutes(ADMIN_ROUTES, '~~zzzz~~', {
      recentRoutes: ['/admin/receipts', '/admin/cad'],
    });
    expect(ranked).toEqual([]);
  });
});
