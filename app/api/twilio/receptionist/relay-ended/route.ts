// app/api/twilio/receptionist/relay-ended/route.ts — ConversationRelay handed the call back.
//
// The <Connect> action. Twilio posts here when the relay sends `end` (with our HandoffData), when
// the caller hangs up, or when the session could not be set up at all. Three outcomes:
//
//   handoff next=done       the assistant already said goodbye → wrap up in the background, hang up
//   handoff next=voicemail  the caller wants to leave a recording → the same <Record> the Gather path uses
//   no handoff, failed      the relay was unreachable (64102) or the session errored → the <Gather>
//                           path takes over with the same greeting, so a relay outage costs a second
//                           of silence rather than the call
//
// PUBLIC BY DESIGN: Twilio-signed, like the other receptionist routes.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validTwilioSignature, publicUrlOf, twilioParams } from '@/lib/twilio/signature';
import { gather, hangup, record, say, twiml, twimlResponse } from '@/lib/twilio/twiml';
import { emptyState, stateCookieHeader, type CallState } from '@/lib/receptionist/state';
import { greeting } from '@/lib/receptionist/brain';
import { OWNER_NAME as OWNER } from '@/lib/receptionist/knowledge';
import { finishCall, summaryFromTurns } from '@/lib/receptionist/finish';
import { parseHandoff } from '@/lib/receptionist/relay';
import { updateCall } from '@/lib/receptionist/calls';
import { defer } from '@/lib/server/defer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const params = await twilioParams(request);
  if (!validTwilioSignature(publicUrlOf(request), params, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const callSid = params.CallSid ?? '';
  const from = params.From ?? '';
  const handoff = parseHandoff(params.HandoffData);

  if (handoff) {
    const state: CallState = { ...emptyState(), facts: handoff.state?.facts ?? {}, turns: handoff.state?.turns ?? [], ...(params.test === '1' || handoff.test ? { test: true } : {}) };
    if (handoff.next === 'voicemail') {
      await updateCall(supabaseAdmin, callSid, { answered_by: 'voicemail' });
      return twimlResponse(
        twiml(say(`Please leave a message for ${OWNER} after the tone, with your name and number.`), record('/api/twilio/receptionist/voicemail', '/api/twilio/receptionist/voicemail')),
        { 'set-cookie': stateCookieHeader(state) },
      );
    }
    defer(finishCall(callSid, from, state, handoff.summary || summaryFromTurns(state)), 'relay-ended wrap-up');
    return twimlResponse(twiml(hangup()));
  }

  const status = (params.SessionStatus ?? '').toLowerCase();
  if (status === 'completed' || params.CallStatus === 'completed') {
    // The caller hung up. The relay's own "closed" event does the wrap-up; nothing to say to nobody.
    return twimlResponse(twiml(hangup()));
  }

  // The relay could not be reached or the session failed before a handoff. Fall back to the
  // request-response path so the caller still gets the receptionist.
  console.error('[relay-ended] session did not complete normally:', { status, error: params.ErrorMessage ?? params.ErrorCode ?? null });
  return twimlResponse(twiml(gather('/api/twilio/receptionist/turn', greeting())), { 'set-cookie': stateCookieHeader(emptyState()) });
}
