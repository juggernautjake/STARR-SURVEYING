// lib/phone/webhook.ts — slice P0b/I2 of
// docs/planning/in-progress/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// The single door every `/api/twilio/*` route comes through. One function rather than a check
// copy-pasted into five handlers, because the failure mode of the copy-paste version is a route
// somebody adds next year that forgets it — and that route is indistinguishable from the others
// until it is the one being abused.
//
// ── WHY THE BODY IS READ AS TEXT ────────────────────────────────────────────────────────────────
//
// Twilio signs the raw form-encoded body. `req.formData()` parses it, and a parsed-then-reserialised
// body is not byte-identical — parameter order and encoding both drift. Reading text once and
// parsing it ourselves is the only way the signature can be checked at all, and a request body can
// only be read once, so this must happen before anything else touches it.
//
// ── AND WHY A REJECTED WEBHOOK IS STILL RECORDED ────────────────────────────────────────────────
//
// A failed signature is written to `call_events` with `signature_ok = false`. Discarding it would
// mean the only evidence of somebody probing the endpoint is a 403 in a log nobody reads. A burst of
// these rows is the alarm.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { readTwilioConfig } from './config';
import { validateTwilioSignature, candidateWebhookUrls, paramsFromFormBody } from './signature';

export interface TwilioWebhookRequest {
  params: Record<string, string>;
  callSid: string | null;
  signatureOk: boolean;
}

export interface TwilioWebhookRejection {
  response: NextResponse;
}

/**
 * Verify and parse a Twilio webhook, or return the response to send back.
 *
 * Returns a discriminated result rather than throwing, so the caller decides what a rejection
 * sounds like — for the voice webhook that is a polite hangup, not a bare 403.
 */
export async function readTwilioWebhook(
  req: NextRequest,
  kind: string,
): Promise<{ ok: true; data: TwilioWebhookRequest } | { ok: false; status: number; reason: string; params: Record<string, string> }> {
  const raw = await req.text();
  const params = paramsFromFormBody(raw);
  const cfg = readTwilioConfig();

  const check = validateTwilioSignature({
    authToken: cfg.authToken,
    signature: req.headers.get('x-twilio-signature'),
    candidateUrls: candidateWebhookUrls({
      requestUrl: req.url,
      forwardedProto: req.headers.get('x-forwarded-proto'),
      forwardedHost: req.headers.get('x-forwarded-host') ?? req.headers.get('host'),
      publicBaseUrl: cfg.publicBaseUrl,
    }),
    params,
  });

  const callSid = params.CallSid ?? null;
  await logCallEvent({ kind, params, callSid, signatureOk: check.valid });

  if (!check.valid) {
    console.warn(`[twilio/${kind}] rejected webhook: ${check.reason}`, { callSid });
    return { ok: false, status: 403, reason: check.reason ?? 'invalid', params };
  }
  return { ok: true, data: { params, callSid, signatureOk: true } };
}

/**
 * Append to the raw event log. Never throws — losing an audit row must not drop a live call.
 *
 * Resolving `call_id` is best-effort: the very first webhook for a call arrives before the `calls`
 * row exists, so the event is written with only the SID and joined by SID afterwards. Waiting for
 * the row would mean the first event — the most interesting one — is the one never recorded.
 */
export async function logCallEvent(opts: {
  kind: string;
  params: Record<string, string>;
  callSid: string | null;
  signatureOk: boolean;
  callId?: string | null;
}): Promise<void> {
  try {
    let callId = opts.callId ?? null;
    if (!callId && opts.callSid) {
      const { data } = await supabaseAdmin
        .from('calls')
        .select('id')
        .eq('provider_call_sid', opts.callSid)
        .maybeSingle();
      callId = (data as { id: string } | null)?.id ?? null;
    }
    await supabaseAdmin.from('call_events').insert({
      call_id: callId,
      provider_call_sid: opts.callSid,
      kind: opts.kind,
      payload: opts.params,
      signature_ok: opts.signatureOk,
    });
  } catch (err) {
    console.error('[twilio] could not write call_event', err);
  }
}

/** TwiML responses carry this content type or Twilio ignores them. */
export function twimlResponse(xml: string, status = 200): NextResponse {
  return new NextResponse(xml, {
    status,
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** The absolute URL of one of our own webhooks, for embedding in TwiML. */
export function webhookUrl(path: string): string | null {
  const base = readTwilioConfig().publicBaseUrl;
  return base ? `${base.replace(/\/+$/, '')}${path}` : null;
}
