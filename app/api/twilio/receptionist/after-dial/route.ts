// app/api/twilio/receptionist/after-dial/route.ts — the owner's leg ended; what now?
//
// <Dial> posts here with `DialCallStatus`. `completed` means a real conversation happened: record
// who answered and how long, tell the owners a call came in (it links to the recording once the
// recording callback lands), and hang up. `no-answer`, `busy`, `failed`, `canceled` mean the caller
// is still waiting, and the AI receptionist takes over: recording starts on the live call (the one
// legal requirement — the notice — is spoken first, recorded-line design 2026-08-14 §3), then the
// greeting, then listen.
//
// PUBLIC BY DESIGN: Twilio-signed, like the entry route.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validTwilioSignature, publicUrlOf, twilioParams } from '@/lib/twilio/signature';
import { gather, hangup, say, twiml, twimlResponse } from '@/lib/twilio/twiml';
import { emptyState, stateCookieHeader } from '@/lib/receptionist/state';
import { RECORDING_NOTICE, greeting } from '@/lib/receptionist/brain';
import { getCallBySid, updateCall } from '@/lib/receptionist/calls';
import { notifyOwners } from '@/lib/receptionist/notify';
import { startCallRecording, twilioConfigured } from '@/lib/twilio/rest';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const params = await twilioParams(request);
  const url = publicUrlOf(request);
  if (!validTwilioSignature(url, params, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const callSid = params.CallSid ?? '';
  const from = params.From ?? '';

  if (params.DialCallStatus === 'completed') {
    const duration = Number(params.DialCallDuration) || null;
    const call = await updateCall(supabaseAdmin, callSid, { status: 'completed', answered_by: 'owner', duration_seconds: duration, ended_at: new Date().toISOString(), kind: 'unknown' });
    await notifyOwners({ from, facts: { kind: 'unknown' }, summary: `answered by Hank, ${duration ?? '?'} seconds. Recording on its way.`, callId: call?.id, answeredBy: 'owner' });
    return twimlResponse(twiml(hangup()));
  }

  // The AI is answering. Record the live call (dual channel) so the page has audio for this leg too.
  const existing = await getCallBySid(supabaseAdmin, callSid);
  await updateCall(supabaseAdmin, callSid, { status: 'in-progress', answered_by: 'ai' });
  if (twilioConfigured() && callSid && !existing?.recording_sid) {
    const base = url.replace(/\/api\/twilio\/.*$/, '');
    startCallRecording(callSid, `${base}/api/twilio/recording`).catch((err) => console.error('[receptionist] could not start recording:', err));
  }
  const xml = twiml(say(RECORDING_NOTICE), gather('/api/twilio/receptionist/turn', greeting()));
  return twimlResponse(xml, { 'set-cookie': stateCookieHeader(emptyState()) });
}
