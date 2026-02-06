import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith('/admin')) return NextResponse.next();
  if (pathname === '/admin/login') {
    if (req.auth?.user) return NextResponse.redirect(new URL('/admin/dashboard', req.url));
    return NextResponse.next();
  }
  if (!req.auth?.user) {
    const loginUrl = new URL('/admin/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
});

export const config = { matcher: ['/admin/:path*'] };
