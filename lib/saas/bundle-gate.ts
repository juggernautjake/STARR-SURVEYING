// lib/saas/bundle-gate.ts
//
// Resolves the bundle required for a given admin route — the source
// of truth the middleware (Phase D-5) consults to gate a customer
// who lacks the bundle's subscription.
//
// Hybrid model per docs/planning/in-progress/CUSTOMER_PORTAL.md §3.6:
//   - workspace default applies to most routes within the workspace
//   - per-route `requiredBundle` on AdminRoute overrides the default
//   - research-cad workspace has no default (its routes split across
//     Recon / Draft / operator-only)
//   - operator-only routes (no customer bundle gate) return null
//     and are gated by isOperator instead
//
// Pure logic — no React, no I/O. Tested in __tests__/saas/bundle-gate.test.ts.

import {
  findRoute,
  workspaceOf,
  type Workspace,
} from '@/lib/admin/route-registry';
import type { BundleId } from './bundles';
import { hasBundle } from './bundles';

/** Workspace → default bundle. null means routes in this workspace
 *  must declare requiredBundle individually (or are always-available). */
export const WORKSPACE_DEFAULT_BUNDLE: Record<Workspace, BundleId | null> = {
  hub: null,                  // Hub + personal tabs — always available
  work: 'office',
  equipment: 'office',
  'research-cad': null,       // split: research → recon, cad → draft
  knowledge: 'academy',
  office: 'office',
};

/** Explicit overrides for routes whose required bundle differs from
 *  their workspace's default. Keep this map small — most routes follow
 *  the workspace default. Each entry is documented so a reader knows
 *  why it diverged. */
export const ROUTE_BUNDLE_OVERRIDES: Record<string, BundleId | null> = {
  // research-cad workspace splits across bundles:
  '/admin/research-cad':           null,      // landing — always available
  '/admin/research':               'recon',
  '/admin/research/coverage':      'recon',
  '/admin/research/library':       'recon',
  '/admin/cad':                    'draft',

  // Operator-only routes within research-cad (no customer bundle gate;
  // gated by isOperator + role at the middleware level):
  '/admin/research/testing':       null,
  '/admin/research/pipeline':      null,
  '/admin/research/billing':       null,

  // Hub workspace's personal-tab routes that redirect to /admin/me
  // — they're behind no bundle gate (the Hub itself is always
  // available; bundle gates apply at the tab body's component level
  // if the tab content needs a bundle, e.g. Hours requires Office).
  '/admin/me':                     null,

  // Workspace landings — always available so users without the gate
  // bundle can still see the bundle directory + upgrade prompt:
  '/admin/work':                   null,
  '/admin/office':                 null,

  // Always-available customer-portal surfaces (per CUSTOMER_PORTAL):
  '/admin/billing':                null,
  '/admin/support':                null,
  '/admin/announcements':          null,
  '/admin/audit':                  null,
  '/admin/users':                  null,
  '/admin/settings':               null,
  '/admin/profile':                null,
  '/admin/error-log':              null,
};

/** Returns the bundle required to access this route, or null when no
 *  bundle gate applies (always-available routes, operator-only routes,
 *  unknown routes). */
export function bundleForRoute(pathname: string): BundleId | null {
  // Explicit override wins (this is the per-route control).
  if (pathname in ROUTE_BUNDLE_OVERRIDES) {
    return ROUTE_BUNDLE_OVERRIDES[pathname];
  }

  // Check the AdminRoute.requiredBundle field if set in the registry.
  const route = findRoute(pathname);
  if (route?.requiredBundle !== undefined) {
    return route.requiredBundle ?? null;
  }

  // Fall back to workspace default.
  if (route) {
    return WORKSPACE_DEFAULT_BUNDLE[route.workspace];
  }

  // Unknown route — also check by deepest-prefix workspace match for
  // nested routes (/admin/jobs/abc-123 inherits /admin/jobs' workspace,
  // hence its workspace default).
  const ws = workspaceOf(pathname);
  if (ws) return WORKSPACE_DEFAULT_BUNDLE[ws];

  return null;
}

/** Convenience: does this org's expanded-bundle set grant access to
 *  this route? Used by middleware (Phase D-5) + future UI gate widgets. */
export function canAccessRoute(opts: {
  pathname: string;
  bundles: BundleId[];
}): boolean {
  const required = bundleForRoute(opts.pathname);
  return hasBundle(opts.bundles, required);
}

/** Returns the upgrade-prompt URL a middleware should redirect to when
 *  the user lacks the required bundle. Encodes both the missing bundle
 *  and the original return path. */
export function upgradePromptUrl(pathname: string, requiredBundle: BundleId): string {
  const params = new URLSearchParams({
    requiredBundle,
    returnTo: pathname,
  });
  return `/admin/billing/upgrade?${params.toString()}`;
}
