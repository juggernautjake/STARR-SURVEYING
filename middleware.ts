import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { UserRole } from '@/lib/auth';
import { canAccessRoute, upgradePromptUrl, bundleForRoute } from '@/lib/saas/bundle-gate';
import type { BundleId } from '@/lib/saas/bundles';
// consolidation Slice 2 (2026-05-30) — legacy `my-*` + `/admin/profile`
// pages were 4-line `redirect()` calls per the 2024 hub redesign Phase
// 2 slice 2c. The page files are now deleted; these middleware-level
// redirects keep external bookmarks + saved notification deep-links
// working. Lives in lib/admin/ so the spec can import it without
// dragging in next-auth's `next/server` dependency.
import { LEGACY_REDIRECTS } from '@/lib/admin/legacy-redirects';

// ── Route-level role enforcement ──
// Maps route prefixes to the roles allowed to access them.
// Admin always bypasses (checked below). Developer has broad access.
// If a route is not listed here, any authenticated user can access it.
//
// IMPORTANT: More specific routes MUST appear before less specific ones.
// e.g. /admin/jobs/new before /admin/jobs, /admin/research/testing before /admin/research

const ROUTE_ROLES: { prefix: string; roles: UserRole[] }[] = [
  // ── Admin-only ──
  { prefix: '/admin/settings', roles: ['admin'] },
  { prefix: '/admin/payroll', roles: ['admin'] },

  // ── People / User Management ──
  { prefix: '/admin/users', roles: ['admin', 'tech_support'] },
  { prefix: '/admin/employees', roles: ['admin', 'developer', 'tech_support'] },

  // ── Work (specific before general) ──
  { prefix: '/admin/jobs/new', roles: ['admin'] },
  { prefix: '/admin/jobs/import', roles: ['admin'] },
  { prefix: '/admin/jobs', roles: ['admin', 'developer', 'field_crew', 'researcher', 'tech_support'] },
  // /admin/my-jobs + /admin/my-hours role-gates removed in
  // consolidation Slice 2 — the redirect at the top of the handler
  // takes the user to /admin/me?tab=… before we reach the role check.
  { prefix: '/admin/leads', roles: ['admin', 'developer', 'tech_support'] },
  { prefix: '/admin/hours-approval', roles: ['admin', 'developer', 'tech_support'] },
  { prefix: '/admin/assignments', roles: ['admin', 'developer', 'field_crew', 'tech_support'] },
  { prefix: '/admin/schedule', roles: ['admin', 'developer', 'field_crew', 'tech_support'] },

  // ── Learning (management routes before general) ──
  { prefix: '/admin/learn/manage', roles: ['admin', 'developer', 'teacher', 'tech_support'] },
  { prefix: '/admin/learn/students', roles: ['admin', 'developer', 'teacher', 'tech_support'] },
  // All other /admin/learn/* routes are open to any authenticated user

  // ── Research (specific before general) ──
  { prefix: '/admin/research/testing', roles: ['admin', 'developer', 'tech_support'] },
  { prefix: '/admin/research', roles: ['admin', 'developer', 'researcher', 'drawer', 'field_crew', 'tech_support'] },

  // ── CAD ──
  // Slice W4 (hub-cad-roles-polish-2026-06-18) — user spec: "If
  // a user does not have the drawing role and clicks the cad
  // button … they are still routed to the cad software. We
  // might change this in the future, but for now leave it."
  // The middleware role gate is widened to every UserRole so
  // any signed-in user lands on the CAD editor. Restore a
  // narrower list once permissions (W7) lands and the user
  // decides the long-term policy.
  { prefix: '/admin/cad', roles: ['admin', 'developer', 'drawer', 'researcher', 'field_crew', 'tech_support', 'equipment_manager', 'employee', 'teacher', 'student', 'guest'] },

  // ── Rewards & Pay ──
  { prefix: '/admin/rewards/admin', roles: ['admin', 'developer', 'tech_support'] },
  { prefix: '/admin/rewards', roles: ['admin', 'developer', 'field_crew', 'tech_support'] },
  { prefix: '/admin/pay-progression', roles: ['admin', 'developer', 'field_crew', 'tech_support'] },
  // /admin/my-pay role-gate removed in consolidation Slice 2 — handled
  // by the LEGACY_REDIRECTS table at the top of the handler.
  { prefix: '/admin/payout-log', roles: ['admin', 'developer', 'field_crew', 'tech_support'] },

  // ── Communication ──
  { prefix: '/admin/messages', roles: ['admin', 'developer', 'teacher', 'researcher', 'drawer', 'field_crew', 'tech_support'] },

  // ── Notes & Files ──
  { prefix: '/admin/notes', roles: ['admin', 'developer', 'tech_support'] },

  // ── Admin tools ──
  { prefix: '/admin/error-log', roles: ['admin', 'developer', 'tech_support'] },
  { prefix: '/admin/discussions', roles: ['admin', 'developer', 'teacher', 'researcher', 'drawer', 'field_crew', 'tech_support'] },
];

function matchesRoute(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith('/admin')) return NextResponse.next();

  // consolidation Slice 2 (2026-05-30) — legacy URL redirects run
  // BEFORE auth so even a logged-out user hitting an old bookmark
  // lands on the right canonical URL (then the auth check below sends
  // them to /admin/login with the correct callbackUrl).
  const redirectTarget = LEGACY_REDIRECTS[pathname];
  if (redirectTarget) {
    return NextResponse.redirect(new URL(redirectTarget, req.url));
  }

  // Allow login and register pages
  if (pathname === '/admin/login' || pathname === '/admin/register') {
    if (req.auth?.user) return NextResponse.redirect(new URL('/admin/dashboard', req.url));
    return NextResponse.next();
  }

  // Require authentication
  if (!req.auth?.user) {
    const loginUrl = new URL('/admin/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If the JWT was marked as blocked (banned/unapproved), force sign-out
  if ((req.auth as any).blocked) {
    const loginUrl = new URL('/admin/login', req.url);
    loginUrl.searchParams.set('error', 'AccountBlocked');
    return NextResponse.redirect(loginUrl);
  }

  const userRoles: UserRole[] = (req.auth.user as any).roles || [(req.auth.user as any).role || 'employee'];

  // Admin bypasses all route restrictions
  if (userRoles.includes('admin')) return NextResponse.next();

  // Check route-specific role restrictions (first match wins — order matters)
  for (const route of ROUTE_ROLES) {
    if (matchesRoute(pathname, route.prefix)) {
      if (!route.roles.some(r => userRoles.includes(r))) {
        return NextResponse.redirect(new URL('/admin/dashboard', req.url));
      }
      break;
    }
  }

  // ── SaaS bundle gate (M-9b) ──
  // Runs after role gate passes. Operators bypass (Starr employees who
  // are also operator_users hit the operator console directly anyway).
  // Sessions without a memberships array (legacy JWTs minted before
  // M-9a's populateSaasContext) fall through unrestricted — they get
  // bundle-gated once the JWT refresh tick repopulates.
  const auth_user = req.auth.user as unknown as {
    isOperator?: boolean;
    memberships?: Array<{ orgId: string; bundles: BundleId[] }>;
    activeOrgId?: string | null;
  };
  const memberships = auth_user.memberships;
  if (!auth_user.isOperator && memberships && memberships.length > 0) {
    const requiredBundle = bundleForRoute(pathname);
    if (requiredBundle) {
      const active = memberships.find((m) => m.orgId === auth_user.activeOrgId) ?? memberships[0];
      const activeBundles = active?.bundles ?? [];
      if (!canAccessRoute({ pathname, bundles: activeBundles })) {
        return NextResponse.redirect(new URL(upgradePromptUrl(pathname, requiredBundle), req.url));
      }
    }
  }

  return NextResponse.next();
});

export const config = { matcher: ['/admin/:path*'] };
