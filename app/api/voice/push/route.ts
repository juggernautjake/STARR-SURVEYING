// app/api/voice/push/route.ts — registering a phone to be rung.
//
// The delivery half of Web Push has existed since the notifications module was written
// (`deliverPush` in lib/voice/notifications.ts). This is the half that was missing: somewhere for a
// browser to hand over the subscription it just created. Without it, notifications collected in the
// studio and reached a locked phone never — which is the one place a notification is worth having.
//
// ── ON CONFLICT (endpoint) DO UPDATE, NOT INSERT ────────────────────────────────────────────────
//
// A push endpoint is stable per browser install: re-subscribing on the same device returns the same
// URL. Inserting blindly would give Andrew one row per app launch and, eventually, eleven copies of
// every notification on one phone. The unique index makes that impossible and the upsert makes
// re-subscribing — which happens routinely, because browsers rotate keys — a no-op instead of an
// error.
//
// The upsert also RE-ENABLES a row that had been disabled after three delivery failures: a device
// coming back and asking to be subscribed is the strongest possible evidence it works again.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVoiceSession } from '@/lib/voice/auth';

export const dynamic = 'force-dynamic';

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
}

/** A phone-friendly name for the device, guessed from its user agent. Only ever shown back to Andrew
 *  in "you will be notified on: iPhone, Windows PC", so a wrong guess costs nothing and a missing one
 *  leaves him unable to tell two rows apart. */
function labelFor(ua: string): string {
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android phone';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows PC';
  return 'This device';
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = getVoiceSession();
  if (!session) return unauthorized();

  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const endpoint = String(body.endpoint ?? '');
  const p256dh = String(body.keys?.p256dh ?? '');
  const auth = String(body.keys?.auth ?? '');

  // All three are required by the Web Push protocol; a subscription missing any of them cannot be
  // delivered to, so storing it would just produce a permanently failing row.
  if (!endpoint.startsWith('https://') || !p256dh || !auth) {
    return NextResponse.json({ error: 'That subscription is not usable.' }, { status: 400 });
  }

  const ua = request.headers.get('user-agent') ?? '';

  const { error } = await supabaseAdmin.from('va_push_subscriptions').upsert(
    {
      user_id: session.userId,
      endpoint: endpoint.slice(0, 2000),
      p256dh: p256dh.slice(0, 400),
      auth: auth.slice(0, 200),
      device_label: labelFor(ua),
      user_agent: ua.slice(0, 400),
      failure_count: 0,
      last_failure_at: null,
      disabled_at: null,
    },
    { onConflict: 'endpoint' },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Turning notifications off on THIS device. Deletes rather than disables: the row is recreated the
 *  moment he turns them back on, and a "disabled" row would make the settings list show a device he
 *  has explicitly removed. */
export async function DELETE(request: Request): Promise<NextResponse> {
  const session = getVoiceSession();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');
  if (!endpoint) return NextResponse.json({ error: 'Which device?' }, { status: 400 });

  // Scoped to the session's own user: one studio account may not unsubscribe another's phone.
  const { error } = await supabaseAdmin
    .from('va_push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', session.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
