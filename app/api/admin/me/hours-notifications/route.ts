// app/api/admin/me/hours-notifications/route.ts
//
// YOUR OWN HOURS-NOTIFICATION SETTING
// ═══════════════════════════════════
//
//   GET  — what you have chosen (or the default, said explicitly)
//   PUT  — change it
//
// Self-service only. This is a personal preference, not an administrative control: one admin
// silencing another's notifications about pay would be a quiet way to keep somebody out of a
// decision they are entitled to make.
//
// A **missing row means notified**. The default is stated in the GET response rather than implied,
// so the settings screen can say "you are notified (default)" instead of rendering an unchecked box
// that looks like you have opted out.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { canDecideHours } from '@/lib/notifications/hours-submitted';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabaseAdmin
    .from('hours_notification_preferences')
    .select('notify_on_submit, only_for_emails, updated_at')
    .eq('user_email', session.user.email)
    .maybeSingle();

  return NextResponse.json({
    // Whether the setting even applies to this person. Somebody who cannot decide hours never
    // receives these, and showing them a toggle that changes nothing is worse than hiding it.
    applies: canDecideHours(session.user.roles),
    notify_on_submit: data?.notify_on_submit ?? true,
    only_for_emails: data?.only_for_emails ?? null,
    /** True when no row exists — so the screen can say "default" rather than "you chose this". */
    isDefault: !data,
    updated_at: data?.updated_at ?? null,
  });
}, { routeName: 'me/hours-notifications' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const notify = body.notify_on_submit !== false;

  // NULL and [] are different and both are meaningful: null is "everybody", an empty array is
  // "nobody". Anything that is not an array becomes null rather than an empty array, because
  // defaulting to "nobody" would silently stop notifications somebody did not ask to stop.
  const only = Array.isArray(body.only_for_emails)
    ? body.only_for_emails.filter((e: unknown) => typeof e === 'string' && e.trim()).map((e: string) => e.trim())
    : null;

  const { data, error } = await supabaseAdmin
    .from('hours_notification_preferences')
    .upsert({
      user_email: session.user.email,
      notify_on_submit: notify,
      only_for_emails: only,
      updated_at: new Date().toISOString(),
      updated_by: session.user.email,
    }, { onConflict: 'user_email' })
    .select('notify_on_submit, only_for_emails')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ preference: data, isDefault: false });
}, { routeName: 'me/hours-notifications' });
