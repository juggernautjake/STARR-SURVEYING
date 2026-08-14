// app/api/admin/phone/callback/route.ts — slice S3 of
// docs/planning/in-progress/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// Owner, 2026-08-14: *"I want a clean and easy way to call customers back from the app from the
// number from twilio on the app."*
//
// ── THE DIAL-ME-FIRST BRIDGE (decision D3) ──────────────────────────────────────────────────────
//
// Twilio rings the staff member's own phone; when they answer, Twilio dials the customer and joins
// the two. The customer sees the business number. No microphone permission, no WebRTC, no browser
// tab that must stay open — it works from a truck, which is where half of this firm works.
//
// ── THIS ROUTE SPENDS MONEY AND CAUSES A PHONE TO RING ──────────────────────────────────────────
//
// Which makes it the most abusable endpoint in the phone system, so it is the most constrained:
//
//   · admin only, like every other route here;
//   · the number to ring FIRST is taken from the configured forwarding list or the caller's own
//     stored number — never freely from the request body. Otherwise this is a service that dials
//     any two numbers an authenticated user names, which is a toll-fraud engine wearing a callback
//     button. That is the one restriction worth its inconvenience.
//   · the customer's number, which IS free-form, is normalised to E.164 and rejected if it is not
//     a dialable US number.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { readTwilioConfig, twilioApiBase, twilioAuthHeader, describeTwilioConfig } from '@/lib/phone/config';
import { loadPhoneHours } from '@/lib/phone/settings';
import { normalizePhone } from '@/lib/integrations/google/hash';
import { registerCall } from '@/lib/phone/calls';
import { bridgeTwiml } from '@/lib/phone/twiml';
import { webhookUrl } from '@/lib/phone/webhook';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const cfg = readTwilioConfig();
  const ready = describeTwilioConfig(cfg);
  if (!ready.canPlace) {
    return NextResponse.json(
      { error: `Calls cannot be placed from this deployment. Missing: ${ready.missing.join(', ') || 'configuration'}.`, code: 'not_configured' },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    to?: string; callId?: string; ringMe?: string; label?: string;
  };

  const customer = normalizePhone(body.to);
  if (!customer) {
    return NextResponse.json({ error: 'That is not a phone number we can dial.' }, { status: 400 });
  }

  // Which of OUR phones to ring first. Chosen from the configured list rather than taken from the
  // request — see the header.
  const hours = await loadPhoneHours();
  const allowed = hours.forwardTo.map((n) => normalizePhone(n)).filter((n): n is string => Boolean(n));
  if (allowed.length === 0) {
    return NextResponse.json(
      {
        error:
          'No staff numbers are configured, so there is nothing to ring first. Add one under phone settings.',
        code: 'no_staff_number',
      },
      { status: 400 },
    );
  }
  const requested = normalizePhone(body.ringMe);
  const ringFirst = requested && allowed.includes(requested) ? requested : allowed[0];
  if (requested && !allowed.includes(requested)) {
    return NextResponse.json(
      { error: 'That number is not one of the configured staff numbers.', code: 'not_a_staff_number' },
      { status: 400 },
    );
  }

  const base = twilioApiBase(cfg);
  const authHeader = twilioAuthHeader(cfg);
  if (!base || !authHeader) {
    return NextResponse.json({ error: 'Twilio is not configured.' }, { status: 503 });
  }

  // The TwiML for the second leg is sent inline rather than fetched from a webhook: it removes a
  // round trip, and more importantly it removes a URL that would have to be public and would then
  // need its own guard.
  const twiml = bridgeTwiml({
    customerNumber: customer,
    callerId: cfg.fromNumber!,
    label: body.label,
    recordingStatusCallback: webhookUrl('/api/twilio/recording') ?? undefined,
  });

  const form = new URLSearchParams({
    To: ringFirst,
    From: cfg.fromNumber!,
    Twiml: twiml,
  });
  const statusUrl = webhookUrl('/api/twilio/status');
  if (statusUrl) {
    form.set('StatusCallback', statusUrl);
    form.set('StatusCallbackEvent', 'completed');
  }

  const res = await fetch(`${base}/Calls.json`, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[phone/callback] Twilio rejected the call', res.status, detail.slice(0, 500));
    return NextResponse.json(
      { error: `Twilio could not place the call (${res.status}).`, detail: detail.slice(0, 300) },
      { status: 502 },
    );
  }

  const created = (await res.json()) as { sid?: string };
  if (created.sid) {
    await registerCall({
      callSid: created.sid,
      direction: 'outbound',
      from: cfg.fromNumber,
      to: customer,
      status: 'ringing',
    });
    await supabaseAdmin
      .from('calls')
      .update({ handled_by: session.user.email })
      .eq('provider_call_sid', created.sid);
  }

  return NextResponse.json({
    ok: true,
    callSid: created.sid ?? null,
    ringingFirst: ringFirst,
    then: customer,
  });
}, { routeName: 'admin/phone/callback' });
