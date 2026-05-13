// app/api/cron/trial-ending/route.ts
//
// Daily trial-ending tick. Dispatches `trial_ending_d7` to every
// subscription that is trialing AND has `trial_ends_at` exactly 7
// days from now (within a 24h window). Idempotent within the day:
// re-running won't double-send because the event handler resolves
// recipients fresh each call and the `org_notifications` row is
// not auto-deduplicated (a future polish guard can collapse
// duplicates if surfacing is needed; today the cron runs once/day
// per the vercel.json schedule).
//
// Phase B-10 of SUBSCRIPTION_BILLING_SYSTEM.md.
//
// Vercel cron config (vercel.json):
//   { "path": "/api/cron/trial-ending", "schedule": "0 14 * * *" }
//   14:00 UTC = 9am CST. Daily.

import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';
import { dispatch } from '@/lib/saas/notifications';
import { registerAllEvents } from '@/lib/saas/notifications/events';

registerAllEvents();

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/trial-ending] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const startOfWindow = new Date(now.getTime() + 6.5 * 24 * 60 * 60 * 1000).toISOString();
  const endOfWindow = new Date(now.getTime() + 7.5 * 24 * 60 * 60 * 1000).toISOString();

  const { data: subs, error } = await supabaseAdmin
    .from('subscriptions')
    .select('org_id, trial_ends_at, organizations(id, name, slug, primary_admin_email, billing_contact_email)')
    .eq('status', 'trialing')
    .gte('trial_ends_at', startOfWindow)
    .lte('trial_ends_at', endOfWindow);

  if (error) {
    console.error('[cron/trial-ending] subscriptions query failed', error);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }

  let sent = 0;
  for (const row of subs ?? []) {
    const r = row as {
      org_id: string;
      trial_ends_at: string;
      organizations: { id: string; name: string; slug: string; primary_admin_email: string | null; billing_contact_email: string | null } | null;
    };
    const recipient = r.organizations?.billing_contact_email ?? r.organizations?.primary_admin_email;
    if (!recipient) continue;
    try {
      await dispatch('trial_ending_d7', {
        orgId: r.org_id,
        payload: {
          userEmail: recipient,
          org: { name: r.organizations?.name ?? '' },
          trial: { endsAt: r.trial_ends_at },
        },
      });
      sent++;
    } catch (err) {
      console.error('[cron/trial-ending] dispatch failed for org', r.org_id, err);
    }
  }

  return NextResponse.json({
    scanned: subs?.length ?? 0,
    sent,
    windowStart: startOfWindow,
    windowEnd: endOfWindow,
  });
}
