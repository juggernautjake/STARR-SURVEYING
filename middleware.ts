import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { UserRole } from '@/lib/auth';

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
  { prefix: '/admin/my-jobs', roles: ['admin', 'developer', 'field_crew', 'researcher', 'tech_support'] },
  { prefix: '/admin/my-hours', roles: ['admin', 'developer', 'field_crew', 'tech_support'] },
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
  { prefix: '/admin/cad', roles: ['admin', 'developer', 'drawer', 'researcher', 'field_crew', 'tech_support'] },

  // ── Rewards & Pay ──
  { prefix: '/admin/rewards/admin', roles: ['admin', 'developer', 'tech_support'] },
  { prefix: '/admin/rewards', roles: ['admin', 'developer', 'field_crew', 'tech_support'] },
  { prefix: '/admin/pay-progression', roles: ['admin', 'developer', 'field_crew', 'tech_support'] },
  { prefix: '/admin/my-pay', roles: ['admin', 'developer', 'field_crew', 'tech_support'] },
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

  return NextResponse.next();
});

export const config = { matcher: ['/admin/:path*'] };
