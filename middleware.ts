import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

// ── Route-level role enforcement ──
// Routes that require specific roles. If a route is not listed here,
// any authenticated user can access it.
const ADMIN_ONLY_ROUTES = [
  '/admin/jobs/new',
  '/admin/jobs/import',
  '/admin/jobs',
  '/admin/leads',
  '/admin/hours-approval',
  '/admin/employees',
  '/admin/payroll',
  '/admin/users',
  '/admin/settings',
  '/admin/error-log',
  '/admin/notes',           // Company Notes
  '/admin/rewards/admin',   // Manage Rewards
];

const TEACHER_ROUTES = [
  '/admin/learn/manage',    // Manage Content, lesson builder, article editor
  '/admin/learn/students',  // Student Progress
];

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

  const userRole = (req.auth.user as any).role as string || 'employee';
  const userRoles: string[] = (req.auth.user as any).roles || [userRole];

  // Admin-only routes
  if (ADMIN_ONLY_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    if (!userRoles.includes('admin')) {
      return NextResponse.redirect(new URL('/admin/dashboard', req.url));
    }
  }

  // Teacher routes: admin or teacher can access
  if (TEACHER_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    if (!userRoles.includes('admin') && !userRoles.includes('teacher')) {
      return NextResponse.redirect(new URL('/admin/learn', req.url));
    }
  }

  return NextResponse.next();
});

export const config = { matcher: ['/admin/:path*'] };
