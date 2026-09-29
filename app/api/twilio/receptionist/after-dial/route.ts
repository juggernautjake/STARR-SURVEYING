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
import { hangup, twiml, twimlResponse } from '@/lib/twilio/twiml';
import { getCallBySid, updateCall } from '@/lib/receptionist/calls';
import { notifyOwners } from '@/lib/receptionist/notify';
import { startCallRecording, twilioConfigured } from '@/lib/twilio/rest';
import { readLiveVersion } from '@/lib/receptionist/version-server';
import { machineStart } from '@/lib/receptionist/answering-machine';
import { elevenLabsDial, elevenLabsSipAuth, elevenLabsSipUri } from '@/lib/receptionist/elevenlabs';
import { callerIsGone, recordOutcome } from '@/lib/receptionist/call-outcome';

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
    // `provisional`: this summary is a placeholder and the transcript carries the real one minutes
    // later. The bell lights now; the email waits for something worth reading. See notify.ts.
    await notifyOwners({ from, facts: {}, summary: `Answered by Hank, ${duration ?? '?'} seconds. The recording and a summary follow once it is transcribed.`, callId: call?.id, answeredBy: 'owner', call, provisional: true });
    return twimlResponse(twiml(hangup()));
  }

  // ── THE CALLER HUNG UP WHILE HOLDING (2026-09-29) ─────────────────────────────────────────────
  //
  // Twilio posts this action even when it is the CALLER who hung up during the ring, and ignores
  // whatever we answer. Before this check the route went on as if they were still there: it stamped
  // the row `answered_by: 'ai'`, tried to start a recording on a finished call ("Requested resource
  // is not eligible for recording"), and dialled the agent for nobody. Four of the ten calls labelled
  // "Receptionist" in the week to 2026-09-29 were this — 11 to 27 seconds long, no recording, no
  // transcript, and never reported as missed because the row said somebody had answered.
  //
  // The row is left alone: `answered_by` stays empty, so the status callback (which fires once the
  // call is over, before or after this) closes it as missed and tells the owners, exactly as it does
  // for a caller who hangs up during the hold notice.
  if (callerIsGone(params)) {
    await recordOutcome(supabaseAdmin, callSid, 'hung-up-while-holding', { dialStatus: params.DialCallStatus ?? null, callStatus: params.CallStatus ?? null });
    return twimlResponse(twiml(hangup()));
  }

  const base = url.replace(/\/api\/twilio\/.*$/, '');

  // ── WHICH RECEPTIONIST (owner, 2026-09-15) ──────────────────────────────────────────────────
  // "For now the system uses the simple answering machine style AI that just records the caller's
  // message and bids them a good day." The full agent answers live calls only once it is switched
  // on at /admin/dev/receptionist; anything else — no setting, a bad setting, a failed read — is the
  // answering machine (lib/receptionist/version.ts). The machine leaves answered_by unset until the
  // caller actually leaves something, so a hang-up during the greeting still reaches the owners as missed.
  const live = await readLiveVersion(supabaseAdmin);
  const sip = live.version === 'elevenlabs' ? elevenLabsSipUri() : null;

  // ── THE CONVERSATIONAL AGENT ON A REAL CALL (owner, 2026-09-16) ─────────────────────────────
  // "Let's please make the conversational agent the active live version for calls for now so we can
  // test it in the real world." Twilio keeps the leg and dials the agent over SIP, so the recording,
  // the call row, the transcript, the analysis and the owner's text all work exactly as they do on
  // every other path — the only difference is who is talking. When the leg ends, `agent-ended`
  // wraps the call up; if the trunk cannot be reached at all, that route falls back to the machine
  // so a caller is never dropped, and so does this one if the SIP URI is missing from the deployment.
  if (live.version === 'elevenlabs' && sip) {
    await updateCall(supabaseAdmin, callSid, { status: 'in-progress', answered_by: 'ai' });
    return twimlResponse(twiml(elevenLabsDial(sip, {
      callerId: from,
      action: '/api/twilio/receptionist/agent-ended',
      recordingCallback: `${base}/api/twilio/recording`,
      auth: elevenLabsSipAuth(),
    })));
  }
  // ── EVERYTHING ELSE IS THE VOICEMAIL MESSAGE (owner, 2026-09-21) ─────────────────────────────
  //
  // "We need to be able to set the voicemail message version to the backup if the conversational
  //  version fails for some reason... These should be the only two options."
  //
  // There used to be a third branch here: the same receptionist over our own relay, or a <Gather>
  // loop if the relay was not configured. That was a TRANSPORT masquerading as a choice, and it
  // made the test bench offer three peers with one labelled LIVE NOW and another labelled the
  // fallback — which is exactly the confusion the owner asked to remove.
  //
  // So there is one fallback now and it is the one that cannot misbehave. A caller asked to leave a
  // message has still reached the firm; a caller handed to a half-configured second conversational
  // stack has reached something nobody chose. The SIP branch above is the conversational
  // receptionist; this is the voicemail message, and it answers whenever that one cannot.
  if (!sip && live.version === 'elevenlabs') {
    console.error('[after-dial] live version is conversational but no SIP URI is configured — answering with the voicemail message');
  }
  // Record the whole voicemail leg (dual channel), so the page has the greeting, the message and the
  // "anything else?" answers as one recording. Awaited, not fire-and-forget: on Vercel a promise left
  // running after the response can be frozen before the request is sent. The SIP branch above does
  // not need this — its <Dial> records the agent leg itself, and a second recording of the same audio
  // only raced it for the row and paid for a second transcript.
  if (twilioConfigured() && callSid && !existing?.recording_sid) {
    await startCallRecording(callSid, `${base}/api/twilio/recording`).catch((err) => console.error('[receptionist] could not start recording:', err));
  }
  await updateCall(supabaseAdmin, callSid, { status: 'in-progress' });
  return twimlResponse(machineStart(live.voice));
}
