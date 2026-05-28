// app/api/admin/google-calendar/callback/route.ts
//
// OAuth redirect target. Google sends ?code=…&state=<rand>:<email> back here;
// we exchange the code for tokens, persist the connection row, and bounce
// the user back to /admin/settings?tab=integrations.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { exchangeCodeForTokens } from '@/lib/integrations/google-calendar';

function redirectUri(req: NextRequest): string {
  const base = process.env.NEXTAUTH_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  return `${base.replace(/\/$/, '')}/api/admin/google-calendar/callback`;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.redirect(new URL('/login', req.url));

  const code = req.nextUrl.searchParams.get('code');
  const stateParam = req.nextUrl.searchParams.get('state') ?? '';
  const error = req.nextUrl.searchParams.get('error');
  if (error || !code) {
    const url = new URL('/admin/settings?tab=integrations&gcal=error', req.url);
    return NextResponse.redirect(url);
  }

  // Validate CSRF state.
  const [randPart, emailFromState] = stateParam.split(':');
  const cookieState = req.cookies.get('gcal_oauth_state')?.value;
  if (!randPart || !cookieState || randPart !== cookieState || emailFromState !== session.user.email) {
    return NextResponse.redirect(new URL('/admin/settings?tab=integrations&gcal=state-mismatch', req.url));
  }

  const tokens = await exchangeCodeForTokens(code, redirectUri(req));
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await supabaseAdmin.from('google_calendar_connections').upsert({
    user_email: session.user.email,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: expiresAt,
    calendar_id: 'primary',
    scope: tokens.scope,
    updated_at: new Date().toISOString(),
  });

  const res = NextResponse.redirect(new URL('/admin/settings?tab=integrations&gcal=connected', req.url));
  res.cookies.delete('gcal_oauth_state');
  return res;
}, { routeName: 'admin/google-calendar/callback' });
