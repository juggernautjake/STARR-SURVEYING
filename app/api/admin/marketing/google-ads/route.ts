// app/api/admin/marketing/google-ads/route.ts
//
// Connect / disconnect the firm's Google Ads account.
//
// GET    → { connected, customerId, connectedBy, scopeOk }
// POST   { action: 'connect', customerId } → { url } to send the browser to
// DELETE → forget the connection
//
// Admin-only: authorising an upload path into the firm's ad account is not a general-staff action.
//
// Spec: docs/planning/completed/GOOGLE_ADS_ACTIVATION_CHECKLIST_2026-08-06.md §3.

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { ADS_OAUTH_COOKIE, adsRedirectUri, buildAdsAuthUrl, grantedAdsScope, normaliseCustomerId } from '@/lib/integrations/google-ads/oauth';

function baseUrl(req: NextRequest): string {
  return process.env.NEXTAUTH_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;
}

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data } = await supabaseAdmin
    .from('google_ads_connections')
    .select('customer_id, user_email, scope, refresh_token')
    .limit(1)
    .maybeSingle();

  const row = data as { customer_id?: string; user_email?: string; scope?: string; refresh_token?: string } | null;
  return NextResponse.json({
    // A row without a refresh token cannot renew, so it is not a connection.
    connected: !!row?.refresh_token,
    customerId: row?.customer_id ?? null,
    connectedBy: row?.user_email ?? null,
    scopeOk: grantedAdsScope(row?.scope),
    hasOauthClient: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  });
}, { routeName: 'admin/marketing/google-ads' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { action?: string; customerId?: string };
  if (body.action !== 'connect') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'No Google OAuth client configured. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set before an account can be connected.' },
      { status: 400 },
    );
  }

  // The customer id is captured HERE rather than read from env, because it is the one piece of this
  // the person clicking the button actually knows — it is on screen in the Ads UI. It is an account
  // number, not a secret.
  const customerId = normaliseCustomerId(body.customerId ?? '');
  if (customerId.length !== 10) {
    return NextResponse.json(
      { error: 'Google Ads customer id must be the 10-digit number shown at the top right of the Ads UI. Dashes are fine — they are stripped.' },
      { status: 400 },
    );
  }

  // CSRF + identity binding. The callback checks all three parts against this cookie, so a consent
  // redirect that did not originate here cannot install a connection.
  const nonce = randomBytes(24).toString('hex');
  const state = `${nonce}:${session.user.email}:${customerId}`;
  const url = buildAdsAuthUrl(adsRedirectUri(baseUrl(req)), state);

  const res = NextResponse.json({ url });
  res.cookies.set(ADS_OAUTH_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}, { routeName: 'admin/marketing/google-ads' });

export const DELETE = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Clear the tokens, keep the row's upload history intact — `conversion_upload_log` references what
  // was sent and must survive a reconnect, or a re-connect would re-upload everything.
  await supabaseAdmin
    .from('google_ads_connections')
    .update({ access_token: null, refresh_token: null, token_expires_at: null, scope: null, updated_at: new Date().toISOString() })
    .not('customer_id', 'is', null);

  return NextResponse.json({ success: true });
}, { routeName: 'admin/marketing/google-ads' });
