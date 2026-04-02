import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { UserRole } from '@/lib/auth';

// ── Route-level role enforcement ──
// Maps route prefixes to the roles allowed to access them.
// Admin always has access (checked in the helper below).
// If a route is not listed here, any authenticated user can access it.

const ROUTE_ROLES: { prefix: string; roles: UserRole[] }[] = [
  // Admin-only (settings, user management, payroll)
  { prefix: '/admin/settings', roles: ['admin'] },
  { prefix: '/admin/payroll', roles: ['admin'] },

  // User management: admin + tech_support (view-only enforced in page)
  { prefix: '/admin/users', roles: ['admin', 'tech_support'] },

  // Employees page: admin, developer, tech_support
  { prefix: '/admin/employees', roles: ['admin', 'developer', 'tech_support'] },

  // Error log
  { prefix: '/admin/error-log', roles: ['admin', 'developer', 'tech_support'] },

  // Work routes
  { prefix: '/admin/jobs/new', roles: ['admin'] },
  { prefix: '/admin/jobs/import', roles: ['admin'] },
  { prefix: '/admin/jobs', roles: ['admin', 'developer', 'field_crew', 'researcher'] },
  { prefix: '/admin/leads', roles: ['admin', 'developer'] },
  { prefix: '/admin/hours-approval', roles: ['admin', 'developer'] },

  // Teacher routes
  { prefix: '/admin/learn/manage', roles: ['admin', 'teacher', 'developer'] },
  { prefix: '/admin/learn/students', roles: ['admin', 'teacher', 'developer'] },

  // Research
  { prefix: '/admin/research/testing', roles: ['admin', 'developer'] },
  { prefix: '/admin/research', roles: ['admin', 'developer', 'researcher', 'drawer', 'field_crew', 'tech_support'] },

  // CAD
  { prefix: '/admin/cad', roles: ['admin', 'developer', 'drawer', 'researcher', 'field_crew', 'tech_support'] },

  // Company Notes
  { prefix: '/admin/notes', roles: ['admin', 'developer', 'tech_support'] },

  // Rewards admin
  { prefix: '/admin/rewards/admin', roles: ['admin', 'developer'] },
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

  // Check route-specific role restrictions
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
