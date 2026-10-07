// app/api/twilio/receptionist/agent-ended/route.ts — the ElevenLabs agent's leg ended.
//
// The <Dial> action for the SIP leg that carries a call to the conversational agent (after-dial for
// a live call, test-entry for a test one). Twilio posts here when that leg ends, for any reason,
// while OUR leg is still up — so this route decides what the caller hears next, and it is the only
// place that knows an agent call is over.
//
// The outcomes (the caller's own leg status, `CallStatus`, says whether they are still there):
//
//   the leg completed        the agent said goodbye or the caller hung up → wrap the call up
//                            (duration, status, analysis, and the owners' text) and hang up. A
//                            caller who left within seconds is summarised as exactly that.
//   the leg never connected  busy, failed, no-answer, or a trunk that would not answer → the
//                            answering machine takes the call, so a caller is never dropped because
//                            a third party was down. This is the same instinct as the version
//                            switch: when something is wrong, fall back to the version that cannot
//                            misbehave.
//   the leg ended early      connected, but over within AGENT_EARLY_END_SECONDS while the caller is
//                            still on the line → the same voicemail fallback, with an apology first.
//   the caller is gone       hung up before the agent answered → closed as missed, and the owners
//                            are told, because the status callback may already have come and gone.
//
// Every branch writes its outcome and Twilio's codes through recordOutcome (call-outcome.ts).
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
import { FALLBACK_APOLOGY, machineStart } from '@/lib/receptionist/answering-machine';
import { readLiveVersion } from '@/lib/receptionist/version-server';
import { defer } from '@/lib/server/defer';
import { agentEndedEarly, callerIsGone, recordOutcome, AGENT_EARLY_END_SECONDS } from '@/lib/receptionist/call-outcome';
import { startCallRecording, twilioConfigured } from '@/lib/twilio/rest';
import { notifyOwners } from '@/lib/receptionist/notify';

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
  const gone = callerIsGone(params);
  const detail = { dialStatus: status || null, dialSeconds: seconds, callStatus: params.CallStatus ?? null, sipResponseCode: params.DialSipResponseCode ?? null, errorCode: params.ErrorCode ?? null };
  const connected = !(FAILED.has(status) || (status === 'completed' && seconds === 0));

  // ── THE CALLER HUNG UP BEFORE THE AGENT ANSWERED (2026-09-29) ────────────────────────────────
  // Nothing we say will be heard. Close the row as missed here, because the status callback may
  // already have run and seen the `ai` that after-dial wrote — and then nobody would be told.
  if (!connected && gone) {
    await recordOutcome(supabaseAdmin, callSid, 'hung-up-before-agent', detail);
    const row = await updateCall(supabaseAdmin, callSid, { status: 'completed', answered_by: 'none', ended_at: new Date().toISOString() });
    if (row && !row.notified_at && !row.is_test) {
      defer((async () => {
        await notifyOwners({ from, facts: {}, summary: 'Hung up before anyone answered.', callId: row.id, answeredBy: 'none', call: row });
      })(), 'agent-ended missed notice');
    }
    return twimlResponse(twiml(hangup()));
  }

  // ── THE AGENT FAILED, AND THE CALLER IS STILL THERE ──────────────────────────────────────────
  // Either the leg never connected (the trunk refused it, as it did every call from 09-16 to 09-21)
  // or it connected and ended within seconds without a conversation — a dropped stream, a crash on
  // the platform, an agent that ran out of credit. Both mean the same thing to the caller: they are
  // still holding and nobody is talking. The voicemail message takes them, with a line saying so,
  // so a message is never lost to a third party being down.
  const endedEarly = connected && !gone && agentEndedEarly(seconds);
  if (!connected || endedEarly) {
    console.error('[agent-ended] the agent leg failed; falling back to the voicemail message:', { status, seconds, sip: params.DialSipResponseCode ?? null });
    await recordOutcome(supabaseAdmin, callSid, connected ? 'agent-ended-early' : 'agent-no-connect', detail);
    const live = await readLiveVersion(supabaseAdmin);
    // The agent leg's own recording (if any) is only seconds long. Record the voicemail leg too, so
    // the message is on the call page; the recording route keeps whichever is longer.
    if (twilioConfigured() && callSid) {
      const base = publicUrlOf(request).replace(/\/api\/twilio\/.*$/, '');
      await startCallRecording(callSid, `${base}/api/twilio/recording`).catch((err) => console.error('[agent-ended] could not start the voicemail recording:', err));
    }
    await updateCall(supabaseAdmin, callSid, { status: 'in-progress', answered_by: null });
    return twimlResponse(machineStart(live.voice, connected ? FALLBACK_APOLOGY : null));
  }

  const existing = await getCallBySid(supabaseAdmin, callSid);
  const isTest = existing?.is_test === true || (await isTestCall(supabaseAdmin, callSid));
  await updateCall(supabaseAdmin, callSid, {
    status: 'completed',
    answered_by: 'ai',
    duration_seconds: seconds || existing?.duration_seconds || null,
    ended_at: new Date().toISOString(),
  });
  // A caller who hangs up within seconds of her answering did not have a conversation, and the
  // summary should not say they did. This is the pattern behind "nobody is talking to her".
  const leftEarly = gone && seconds < AGENT_EARLY_END_SECONDS;
  await recordOutcome(supabaseAdmin, callSid, leftEarly ? 'caller-left-agent-early' : 'agent-completed', detail);

  // finishCall is the one place that notifies, and it refuses a test row. There are no turns to
  // summarise — the conversation was ElevenLabs' — so this says what is known now and promises the
  // rest; the transcript webhook sends the summary when Voice Intelligence is done with it.
  const summary = isTest
    ? `Test call to the conversational agent, ${seconds} seconds.`
    : leftEarly
      ? `Hung up ${seconds} seconds after the receptionist answered, without leaving a message.`
      : `The conversational agent took a call, ${seconds} seconds. The recording and a summary follow once it is transcribed.`;
  defer(finishCall(callSid, from, { facts: {}, turns: [] }, summary), 'agent-ended wrap-up');
  return twimlResponse(twiml(hangup()));
}
