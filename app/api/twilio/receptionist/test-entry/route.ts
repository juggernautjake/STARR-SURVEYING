// app/api/twilio/receptionist/test-entry/route.ts — the receptionist, straight away, for a test call.
//
// Owner, 2026-09-11: "can we build it into the website so that we can do a test version … it should
// work the same way … set to respond in the same way and at the same response time as the calls to
// my dad's phone, and all of the calls should be captured and able to be reviewed and transcribed."
//
// The only honest way to get the same response time is the same call. So the developer page places
// a REAL Twilio call — to the tester's own phone, or from the browser through a TwiML App — and
// Twilio runs this TwiML on it. From here on it is the exact production path (after-dial's SIP
// branch): recording started, the ElevenLabs agent over the trunk, the same wrap-up at agent-ended.
// The one difference is the flag on the row: is_test. That flag turns off the owner alerts and the
// lead insert everywhere downstream, and draws the "Test" badge on /admin/calls.
//
// Since 2026-09-22 the only caller is "Call my phone" — the browser-call card that also pointed
// here was deleted as redundant with the WebRTC conversation on the same page.
//
// PUBLIC BY DESIGN: Twilio-signed, like the other receptionist routes. Twilio calls it as the Url
// of an outbound call the admin API placed.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validTwilioSignature, publicUrlOf, twilioParams } from '@/lib/twilio/signature';
import { RECORDING_NOTICE } from '@/lib/receptionist/brain';
import { say, twiml, twimlResponse } from '@/lib/twilio/twiml';
import { startCall, updateCall } from '@/lib/receptionist/calls';
import { startCallRecording, twilioConfigured } from '@/lib/twilio/rest';
import { parseTestVersion } from '@/lib/receptionist/version';
import { elevenLabsDial, elevenLabsSipAuth, elevenLabsSipUri } from '@/lib/receptionist/elevenlabs';
import { machineOpening } from '@/lib/receptionist/answering-machine';
import { sayVoiceFor } from '@/lib/receptionist/voices';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const params = await twilioParams(request);
  const url = publicUrlOf(request);
  if (!validTwilioSignature(url, params, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const callSid = params.CallSid ?? '';
  // Outbound to a phone: Twilio's From is our number and To is the tester. From the browser:
  // From is "client:<identity>". Either way the row should name the tester.
  const outbound = (params.Direction ?? '').startsWith('outbound');
  const tester = outbound ? params.To ?? '' : params.From ?? '';
  const line = outbound ? params.From ?? '' : params.To ?? '';

  if (callSid) {
    await startCall(supabaseAdmin, { callSid, from: tester, to: line, isTest: true });
    await updateCall(supabaseAdmin, callSid, { status: 'in-progress', answered_by: 'ai', is_test: true });
    if (twilioConfigured()) {
      const base = url.replace(/\/api\/twilio\/.*$/, '');
      startCallRecording(callSid, `${base}/api/twilio/recording`).catch((err) => console.error('[test-entry] could not start recording:', err));
    }
  }

  // ── Which version to test (owner, 2026-09-15) ──
  // The test bench picks per call: the full agent (the default — it is the one being honed) or the
  // answering machine live callers get. From "Call my phone" it rides in the URL (?version=); from the
  // browser it is a Voice SDK connect parameter. Either way Twilio signed it.
  //
  // ── THE DEFAULT WAS 'agent', WHICH IS NOT A CHOICE ANY MORE (owner, 2026-09-22) ─────────────
  //
  // "The start call option just is the voicemail receptionist message."
  //
  // `parseTestVersion` returns one of the two real options or NULL, and null fell through to
  // `'agent'` — the relay, retired on 2026-09-21. So a request that did not carry a readable
  // version matched neither branch below and dropped out of the bottom of this route into the
  // relay/<Gather> fallback: not the conversational agent, and not what the page said it was
  // testing. It reached that state whenever the Voice SDK parameter did not survive the trip,
  // which is exactly the case the browser-call card hit.
  //
  // The default is the conversational receptionist now, because that is what this bench exists to
  // test, and 'agent' can no longer be named by anything.
  const version = parseTestVersion(new URL(url).searchParams.get('version') ?? params.version) ?? 'elevenlabs';
  // …and which voice to audition (owner, 2026-09-15: "I want more natural female voice options").
  const voiceId = (new URL(url).searchParams.get('voice') ?? params.voice ?? '').trim() || null;
  if (version === 'answering-machine') {
    return twimlResponse(twiml(say(RECORDING_NOTICE, sayVoiceFor(voiceId)), machineOpening(voiceId)));
  }

  // The ElevenLabs agent. Twilio keeps the leg, so the recording, the call row and the transcript
  // work exactly as they do for every other path. Since 2026-09-16 a live call takes this same road
  // (after-dial), and both ends at `agent-ended` — one wrap-up, one fallback, tested by both.
  const sip = elevenLabsSipUri();
  if (version === 'elevenlabs' && sip) {
    const base = url.replace(/\/api\/twilio\/.*$/, '');
    return twimlResponse(twiml(
      say(RECORDING_NOTICE, sayVoiceFor(voiceId)),
      elevenLabsDial(sip, { callerId: tester, action: '/api/twilio/receptionist/agent-ended', recordingCallback: `${base}/api/twilio/recording`, auth: elevenLabsSipAuth() }),
    ));
  }

  // ── AND OTHERWISE THE VOICEMAIL MESSAGE, LIKE A LIVE CALL ────────────────────────────────────
  //
  // Owner, 2026-09-21: "I either want the voicemail or the natural sounding conversational voice
  // model that elevenlabs provides." and "if Eleven labs is not working, then we should fallback to
  // the simple voicemail receptionist message."
  //
  // There were two more branches here — the receptionist over our own relay, then a <Gather> loop
  // if the relay was not configured. `after-dial` lost both on 2026-09-21; this route kept them,
  // so the TEST bench could still reach a version live callers no longer can, which is the one
  // thing a test bench must never do. A test that exercises a path production does not have is
  // worse than no test: it passes, and it is about something else.
  //
  // So the fallback here is the fallback there. A deployment with no SIP URI answers a test call
  // the same way it answers a real one.
  console.error('[test-entry] the conversational receptionist was asked for but no SIP URI is configured — answering with the voicemail message');
  return twimlResponse(twiml(say(RECORDING_NOTICE, sayVoiceFor(voiceId)), machineOpening(voiceId)));
}
