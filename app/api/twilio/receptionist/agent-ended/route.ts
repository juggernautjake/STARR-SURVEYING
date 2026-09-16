// app/api/twilio/receptionist/agent-ended/route.ts — the ElevenLabs agent's leg ended.
//
// The <Dial> action for the SIP leg that carries a call to the conversational agent (after-dial for
// a live call, test-entry for a test one). Twilio posts here when that leg ends, for any reason,
// while OUR leg is still up — so this route decides what the caller hears next, and it is the only
// place that knows an agent call is over.
//
// Two outcomes:
//
//   the leg completed        the agent said goodbye or the caller hung up → wrap the call up
//                            (duration, status, analysis, and the owners' text) and hang up.
//   the leg never connected  busy, failed, no-answer, or a trunk that would not answer → the
//                            answering machine takes the call, so a caller is never dropped because
//                            a third party was down. This is the same instinct as the version
//                            switch: when something is wrong, fall back to the version that cannot
//                            misbehave.
//
// WHY NOT relay-ended: that route's no-handoff branch restarts the <Gather> receptionist, which is
// right for a ConversationRelay session that failed mid-call and wrong here — after the agent has
// said goodbye it would start a second, different receptionist talking to a caller who is done.
//
// WHAT TELLS THE OWNER. Nothing in this process hears the conversation: it happens between the
// caller and ElevenLabs. What Twilio keeps is the recording of both channels, and that is enough
// for everything downstream — /api/twilio/recording asks Voice Intelligence to transcribe an AI leg
// (it used to do that only for calls Hank answered), /api/twilio/transcript stores the turns, runs
// the analysis, and sends the summary. So the owner gets the same two messages as a call Hank
// misses: one now saying the agent took a call, one when the transcript and summary are ready.
//
// PUBLIC BY DESIGN: Twilio-signed, like the other receptionist routes.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validTwilioSignature, publicUrlOf, twilioParams } from '@/lib/twilio/signature';
import { hangup, twiml, twimlResponse } from '@/lib/twilio/twiml';
import { getCallBySid, isTestCall, updateCall } from '@/lib/receptionist/calls';
import { finishCall } from '@/lib/receptionist/finish';
import { machineStart } from '@/lib/receptionist/answering-machine';
import { readLiveVersion } from '@/lib/receptionist/version-server';
import { defer } from '@/lib/server/defer';

export const dynamic = 'force-dynamic';

/** Statuses that mean the caller never reached the agent. `completed` is a real conversation. */
const FAILED = new Set(['busy', 'failed', 'no-answer', 'canceled']);

export async function POST(request: Request): Promise<Response> {
  const params = await twilioParams(request);
  if (!validTwilioSignature(publicUrlOf(request), params, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const callSid = params.CallSid ?? '';
  const from = params.From ?? '';
  const status = (params.DialCallStatus ?? '').toLowerCase();
  const seconds = Number(params.DialCallDuration) || 0;

  // The agent never picked up. Hand the caller to the machine rather than to silence. A test call
  // is told the same way — a tester finding out the trunk is down is the point of a test call.
  if (FAILED.has(status) || (status === 'completed' && seconds === 0)) {
    console.error('[agent-ended] the agent leg did not connect:', { status, seconds, sip: params.DialSipResponseCode ?? null });
    const live = await readLiveVersion(supabaseAdmin);
    await updateCall(supabaseAdmin, callSid, { status: 'in-progress', answered_by: null });
    return twimlResponse(machineStart(live.voice));
  }

  const existing = await getCallBySid(supabaseAdmin, callSid);
  const isTest = existing?.is_test === true || (await isTestCall(supabaseAdmin, callSid));
  await updateCall(supabaseAdmin, callSid, {
    status: 'completed',
    answered_by: 'ai',
    duration_seconds: seconds || existing?.duration_seconds || null,
    ended_at: new Date().toISOString(),
  });

  // finishCall is the one place that notifies, and it refuses a test row. There are no turns to
  // summarise — the conversation was ElevenLabs' — so this says what is known now and promises the
  // rest; the transcript webhook sends the summary when Voice Intelligence is done with it.
  const summary = isTest
    ? `Test call to the conversational agent, ${seconds} seconds.`
    : `The conversational agent took a call, ${seconds} seconds. The recording and a summary follow once it is transcribed.`;
  defer(finishCall(callSid, from, { facts: {}, turns: [] }, summary), 'agent-ended wrap-up');
  return twimlResponse(twiml(hangup()));
}
