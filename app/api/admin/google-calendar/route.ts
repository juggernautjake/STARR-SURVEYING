// app/api/admin/google-calendar/route.ts
//
// Connection management for the per-user Google Calendar sync.
//
// GET    /api/admin/google-calendar  — { connected, calendar_id, last_synced_at } for the caller
// POST   /api/admin/google-calendar  — { action: 'connect' } returns the OAuth URL to redirect to
// DELETE /api/admin/google-calendar  — disconnect (drops tokens + event links)
//
// Spec: docs/planning/completed/backend-audit-and-improvements-2026-05-27.md
//       Slice 29 (deferred from Slice 12).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { buildAuthUrl, loadConnection } from '@/lib/integrations/google-calendar';
import { randomBytes } from 'node:crypto';

function redirectUri(req: NextRequest): string {
  const base = process.env.NEXTAUTH_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  return `${base.replace(/\/$/, '')}/api/admin/google-calendar/callback`;
}

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const conn = await loadConnection(session.user.email);
  return NextResponse.json({
    connected: !!conn,
    calendar_id: conn?.calendar_id ?? null,
    last_synced_at: conn?.last_synced_at ?? null,
  });
}, { routeName: 'admin/google-calendar' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { action?: string };
  if (body.action !== 'connect') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  // CSRF + session-binding state. Stored in a short-lived cookie the callback
  // reads to confirm the redirect came from us.
  const state = randomBytes(24).toString('hex');
  const url = buildAuthUrl(redirectUri(req), `${state}:${session.user.email}`);
  const res = NextResponse.json({ url });
  res.cookies.set('gcal_oauth_state', state, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', path: '/', maxAge: 600,
  });
  return res;
}, { routeName: 'admin/google-calendar' });

export const DELETE = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await supabaseAdmin.from('google_calendar_connections').delete().eq('user_email', session.user.email);
  await supabaseAdmin.from('google_calendar_event_links').delete().eq('user_email', session.user.email);
  return NextResponse.json({ success: true });
}, { routeName: 'admin/google-calendar' });
