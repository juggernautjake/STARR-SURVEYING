// app/api/admin/marketing/google-ads/callback/route.ts
//
// Where Google sends the browser after the account owner clicks "Allow".
//
// Everything lands here as query parameters, so nothing is trusted: the state nonce is checked
// against the cookie set when the flow started, the email is checked against the live session, and
// the granted scope is checked against what we asked for. Any mismatch bounces back to the uploads
// page with a reason in the URL rather than installing a connection.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { ADS_OAUTH_COOKIE, adsRedirectUri, exchangeAdsCode, grantedAdsScope } from '@/lib/integrations/google-ads/oauth';

const LANDING = '/admin/marketing/uploads';

function back(req: NextRequest, status: string): NextResponse {
  const res = NextResponse.redirect(new URL(`${LANDING}?gads=${status}`, req.url));
  res.cookies.delete(ADS_OAUTH_COOKIE);
  return res;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.redirect(new URL('/admin/login', req.url));
  if (!isAdmin(session.user.roles)) return back(req, 'forbidden');

  const params = req.nextUrl.searchParams;
  const code = params.get('code');
  const stateParam = params.get('state') ?? '';

  // The user pressed Cancel, or Google refused. Not an error worth a stack trace.
  if (params.get('error') || !code) return back(req, 'cancelled');

  const [nonce, emailFromState, customerId] = stateParam.split(':');
  const cookieNonce = req.cookies.get(ADS_OAUTH_COOKIE)?.value;
  if (
    !nonce || !cookieNonce || nonce !== cookieNonce ||
    emailFromState !== session.user.email ||
    !/^\d{10}$/.test(customerId ?? '')
  ) {
    return back(req, 'state-mismatch');
  }

  const base = process.env.NEXTAUTH_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const tokens = await exchangeAdsCode(code, adsRedirectUri(base));

  // Approving a subset is possible on Google's consent screen. Storing this connection would give a
  // green badge and a nightly 403.
  if (!grantedAdsScope(tokens.scope)) return back(req, 'scope-denied');

  // No refresh token means no renewal: it would work for an hour and fail every night after. We ask
  // with `prompt=consent` precisely to avoid this, so if it still happens, say so rather than
  // storing a connection that is quietly temporary.
  if (!tokens.refresh_token) return back(req, 'no-refresh-token');

  await supabaseAdmin.from('google_ads_connections').upsert({
    customer_id: customerId,
    login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || null,
    user_email: session.user.email,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    scope: tokens.scope,
    // A previous failure must not stick to a fresh connection.
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'customer_id' });

  return back(req, 'connected');
}, { routeName: 'admin/marketing/google-ads/callback' });
