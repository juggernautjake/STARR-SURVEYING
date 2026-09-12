// app/api/twilio/receptionist/after-dial/route.ts — the owner's leg ended; what now?
//
// <Dial> posts here with `DialCallStatus`. The owner really took the call only when BOTH hold:
// the status is `completed` AND the whisper marked the row as accepted (a key was pressed). Then
// record who answered and how long, tell the owners a call came in (it links to the recording once
// the recording callback lands), and hang up.
//
// Everything else — `no-answer`, `busy`, `failed`, `canceled`, and the trap found on the first live
// test (2026-09-11): `completed` with NO key pressed, which is what Twilio reports when the owner's
// carrier voicemail answers, listens to the whisper, and the leg hangs up — means the caller is
// still waiting, and the AI receptionist takes over. Before the fix that case hung up on the caller
// ("nothing happened and the phone kept ringing for about 30 seconds and then it just hung up").
//
// PUBLIC BY DESIGN: Twilio-signed, like the entry route.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validTwilioSignature, publicUrlOf, twilioParams } from '@/lib/twilio/signature';
import { gather, hangup, twiml, twimlResponse } from '@/lib/twilio/twiml';
import { emptyState, stateCookieHeader } from '@/lib/receptionist/state';
import { greeting } from '@/lib/receptionist/brain';
import { getCallBySid, updateCall } from '@/lib/receptionist/calls';
import { notifyOwners } from '@/lib/receptionist/notify';
import { startCallRecording, twilioConfigured } from '@/lib/twilio/rest';
import { relayConfig, relayTwiml } from '@/lib/receptionist/relay';
import { lookupKnownCaller } from '@/lib/receptionist/known-caller';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const params = await twilioParams(request);
  const url = publicUrlOf(request);
  if (!validTwilioSignature(url, params, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const callSid = params.CallSid ?? '';
  const from = params.From ?? '';
  const existing = await getCallBySid(supabaseAdmin, callSid);
  const ownerAccepted = existing?.answered_by === 'owner';

  if (params.DialCallStatus === 'completed' && ownerAccepted) {
    const duration = Number(params.DialCallDuration) || null;
    const call = await updateCall(supabaseAdmin, callSid, { status: 'completed', answered_by: 'owner', duration_seconds: duration, ended_at: new Date().toISOString(), kind: 'unknown' });
    await notifyOwners({ from, facts: {}, summary: `Answered by Hank, ${duration ?? '?'} seconds. The recording and a summary follow once it is transcribed.`, callId: call?.id, answeredBy: 'owner', call });
    if (call) await updateCall(supabaseAdmin, callSid, { notified_at: new Date().toISOString() });
    return twimlResponse(twiml(hangup()));
  }

  // The AI is answering. Record the live call (dual channel) so the page has audio for this leg too.
  await updateCall(supabaseAdmin, callSid, { status: 'in-progress', answered_by: 'ai' });
  if (twilioConfigured() && callSid && !existing?.recording_sid) {
    const base = url.replace(/\/api\/twilio\/.*$/, '');
    startCallRecording(callSid, `${base}/api/twilio/recording`).catch((err) => console.error('[receptionist] could not start recording:', err));
  }
  // The caller already heard the recording notice before the phone rang (entry route), so the
  // receptionist goes straight to the greeting.
  //
  // Two transports for the same brain. With RECEPTIONIST_RELAY_URL set, the live call is handed to
  // ConversationRelay (streaming speech both ways, interruptible; see lib/receptionist/relay.ts).
  // Without it, or when the relay fails (relay-ended falls back here), the request-response
  // <Gather> loop below runs.
  const known = await lookupKnownCaller(supabaseAdmin, from);
  const relay = relayConfig();
  if (relay) return twimlResponse(twiml(relayTwiml(relay, callSid, from, { knownName: known?.name })));
  const xml = twiml(gather('/api/twilio/receptionist/turn', greeting(known?.name)));
  return twimlResponse(xml, { 'set-cookie': stateCookieHeader(emptyState()) });
}
