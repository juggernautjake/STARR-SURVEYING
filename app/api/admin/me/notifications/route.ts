// app/api/admin/me/notifications/route.ts
//
// WHICH BROADCAST NOTIFICATIONS YOU GET
// ═════════════════════════════════════
//
//   GET — every kind you are eligible for, and whether it is on
//   PUT — turn one on or off  { kind, enabled }
//
// Self-service only, the same rule `me/hours-notifications` states: a personal preference, not an
// administrative control. One admin silencing another's bell about customer calls would be a quiet
// way to keep somebody out of the business.
//
// ── ONLY THE KINDS THAT APPLY TO YOU ────────────────────────────────────────────────────────────
//
// The list is filtered by the roles you hold, because a toggle that changes nothing is worse than
// no toggle: it tells you that you are in control of something you are not. Somebody without
// `admin` sees no phone-call switch, because turning it on would not give them phone calls.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { preferencesFor, setPreference } from '@/lib/notifications/notification-preferences';
import { broadcastKind } from '@/lib/notifications/audience';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const prefs = await preferencesFor(supabaseAdmin, session.user.email, session.user.roles ?? []);
  return NextResponse.json({
    kinds: prefs,
    // Said out loud rather than implied by an unchecked box: absence of a row means notified, and a
    // screen that cannot tell "default on" from "you turned this off" is a screen that misreports.
    defaultIsOn: true,
  });
}, { routeName: 'me/notifications' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { kind?: string; enabled?: boolean };
  const kind = (body.kind ?? '').trim();
  if (!broadcastKind(kind)) {
    return NextResponse.json({ error: `"${kind}" is not a notification you can change.` }, { status: 400 });
  }
  // Eligibility is checked as well as validity: without it, a person could store an opt-out for a
  // kind they never receive, and the settings page would then show them a switch they cannot see.
  const mine = await preferencesFor(supabaseAdmin, session.user.email, session.user.roles ?? []);
  if (!mine.some((k) => k.id === kind)) {
    return NextResponse.json({ error: 'That notification does not apply to your roles.' }, { status: 403 });
  }

  const ok = await setPreference(supabaseAdmin, session.user.email, kind, body.enabled !== false, session.user.email);
  if (!ok) return NextResponse.json({ error: 'Could not save that setting.' }, { status: 400 });
  return NextResponse.json({ ok: true, kind, enabled: body.enabled !== false });
}, { routeName: 'me/notifications' });
