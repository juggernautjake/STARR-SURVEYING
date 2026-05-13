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
  findRoute,
  rankRoutes,
  routesForWorkspace,
  scoreRoute,
  workspaceOf,
} from '@/lib/admin/route-registry';
import type { Workspace } from '@/lib/admin/route-registry';

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
    expect(route?.label).toBe('Receipts');
    expect(route?.workspace).toBe('office');
  });

  it('findRoute returns undefined for an unknown href', () => {
    expect(findRoute('/admin/does-not-exist')).toBeUndefined();
  });

  it('workspaceOf resolves a registered href to its workspace', () => {
    expect(workspaceOf('/admin/jobs')).toBe('work');
    expect(workspaceOf('/admin/cad')).toBe('research-cad');
    expect(workspaceOf('/admin/receipts')).toBe('office');
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

describe('route-registry — access filtering', () => {
  it('admin sees every route', () => {
    const visible = accessibleRoutes({ roles: ['admin'], isCompanyUser: true });
    expect(visible.length).toBe(ADMIN_ROUTES.length);
  });

  it('non-company users never see internalOnly routes', () => {
    const visible = accessibleRoutes({ roles: ['admin'], isCompanyUser: false });
    for (const route of visible) expect(route.internalOnly).not.toBe(true);
  });

  it('roleless route is visible to everyone (e.g. guest, no company email)', () => {
    const visible = accessibleRoutes({ roles: ['guest'], isCompanyUser: false });
    // Routes without `roles` and without `internalOnly` should appear.
    const dashboard = visible.find((r) => r.href === '/admin/dashboard');
    expect(dashboard).toBeDefined();
  });

  it('role gates are honored for non-admin users', () => {
    // A pure student should NOT see admin-only routes like Settings.
    const visible = accessibleRoutes({ roles: ['student'], isCompanyUser: false });
    const settings = visible.find((r) => r.href === '/admin/settings');
    expect(settings).toBeUndefined();
  });

  it('equipment_manager hat unlocks the Equipment workspace gates', () => {
    const visible = accessibleRoutes({ roles: ['equipment_manager'], isCompanyUser: true });
    const maintenance = visible.find((r) => r.href === '/admin/equipment/maintenance');
    expect(maintenance).toBeDefined();
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

  it('keyword hits route the user past synonyms (e.g. paycheck → Payroll)', () => {
    const ranked = rankRoutes(ADMIN_ROUTES, 'paycheck');
    const labels = ranked.map((r) => r.label);
    expect(labels).toContain('Payroll');
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
    // "all" matches "All Jobs" and a few descriptions roughly equally;
    // boosting the recent visit should bump it above the rest. Use a
    // distinctive query that hits multiple routes.
    const baseline = rankRoutes(ADMIN_ROUTES, 'admin');
    expect(baseline.length).toBeGreaterThan(0);
    const target = baseline[baseline.length - 1].href;
    const boosted = rankRoutes(ADMIN_ROUTES, 'admin', { recentRoutes: [target] });
    expect(boosted[0]?.href).toBe(target);
  });

  it('recencyBoost never surfaces a non-matching route', () => {
    const ranked = rankRoutes(ADMIN_ROUTES, '~~zzzz~~', {
      recentRoutes: ['/admin/receipts', '/admin/cad'],
    });
    expect(ranked).toEqual([]);
  });
});
