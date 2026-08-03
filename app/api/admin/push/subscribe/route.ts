// app/api/admin/push/subscribe/route.ts
//
// PWA plan W4b — register (POST) or drop (DELETE) this browser's Web Push subscription for the
// business app.
//
// The pieces this joins were all already in place and unable to reach each other: W2 gave /admin/
// its own service worker, W4 made the sender scope-agnostic, and seed 571 added
// `admin_push_subscriptions`. Without this route a crew member had no way to say yes.
//
// SERVICE-ROLE ONLY, and that is the point of the deny-all RLS policy in 571: a subscription row
// carries the exact endpoint needed to push to someone's phone. Every read and write goes through
// here, after the session has been checked, so the browser never holds a credential that would let
// it enumerate anyone else's devices.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

/** Resolve the signed-in user's row id. The session carries an email; the FK wants a uuid. */
async function currentUserId(email: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('registered_users')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

export const POST = withErrorHandler(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as {
    endpoint?: string; keys?: { p256dh?: string; auth?: string }; deviceLabel?: string;
  } | null;

  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const authKey = body?.keys?.auth;
  // All three are required to send anything. Storing a partial subscription would mean a row that
  // looks like an enabled device and can never receive a notification — the user would believe
  // alerts are on and simply never get one, which is worse than a visible failure here.
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: 'endpoint, keys.p256dh and keys.auth are all required' }, { status: 400 });
  }

  const userId = await currentUserId(session.user.email);
  if (!userId) return NextResponse.json({ error: 'No such user' }, { status: 404 });

  // Upsert on `endpoint`, which is UNIQUE. Re-subscribing on the same device returns the same
  // endpoint, so without this a phone accumulates a row per app launch and the crew member gets one
  // copy of every alert per launch. It also re-arms a previously-disabled device: `disabled_at` and
  // `failure_count` reset, because the browser handing us a subscription is it telling us the
  // endpoint is live again.
  const { error } = await supabaseAdmin
    .from('admin_push_subscriptions')
    .upsert({
      user_id: userId,
      endpoint,
      p256dh,
      auth: authKey,
      device_label: body?.deviceLabel?.slice(0, 120) ?? null,
      user_agent: req.headers.get('user-agent')?.slice(0, 400) ?? null,
      failure_count: 0,
      last_failure_at: null,
      disabled_at: null,
    }, { onConflict: 'endpoint' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});

export const DELETE = withErrorHandler(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as { endpoint?: string } | null;
  if (!body?.endpoint) {
    return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });
  }

  const userId = await currentUserId(session.user.email);
  if (!userId) return NextResponse.json({ error: 'No such user' }, { status: 404 });

  // Scoped to user_id as well as endpoint. Endpoint alone would let any signed-in user unsubscribe
  // any device by guessing or replaying an endpoint string — a small hole, but a free one to close,
  // and the kind that is only free before it ships.
  const { error } = await supabaseAdmin
    .from('admin_push_subscriptions')
    .delete()
    .eq('endpoint', body.endpoint)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});
