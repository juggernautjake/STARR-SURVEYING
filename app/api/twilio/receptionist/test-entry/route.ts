// app/api/twilio/receptionist/test-entry/route.ts — the receptionist, straight away, for a test call.
//
// Owner, 2026-09-11: "can we build it into the website so that we can do a test version … it should
// work the same way … set to respond in the same way and at the same response time as the calls to
// my dad's phone, and all of the calls should be captured and able to be reviewed and transcribed."
//
// The only honest way to get the same response time is the same call. So the developer page places
// a REAL Twilio call — to the tester's own phone, or from the browser through a TwiML App — and
// Twilio runs this TwiML on it. From here on it is the exact production path (after-dial's AI
// branch): recording started, ConversationRelay or <Gather>, the same brain, the same wrap-up.
// The one difference is the flag on the row: is_test. That flag turns off the owner alerts and the
// lead insert everywhere downstream, and draws the "Test" badge on /admin/calls.
//
// PUBLIC BY DESIGN: Twilio-signed, like the other receptionist routes. Twilio calls it either as
// the TwiML App's voice URL (browser calls) or as the Url of an outbound call the admin API placed.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validTwilioSignature, publicUrlOf, twilioParams } from '@/lib/twilio/signature';
import { gather, say, twiml, twimlResponse } from '@/lib/twilio/twiml';
import { emptyState, stateCookieHeader } from '@/lib/receptionist/state';
import { greeting, RECORDING_NOTICE } from '@/lib/receptionist/brain';
import { startCall, updateCall } from '@/lib/receptionist/calls';
import { relayConfig, relayTwiml } from '@/lib/receptionist/relay';
import { startCallRecording, twilioConfigured } from '@/lib/twilio/rest';
import { lookupKnownCaller } from '@/lib/receptionist/known-caller';
import { parseTestVersion } from '@/lib/receptionist/version';
import { elevenLabsDial, elevenLabsSipUri } from '@/lib/receptionist/elevenlabs';
import { machineOpening } from '@/lib/receptionist/answering-machine';
import { resolveVoice, sayVoiceFor } from '@/lib/receptionist/voices';

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
  const version = parseTestVersion(new URL(url).searchParams.get('version') ?? params.version) ?? 'agent';
  // …and which voice to audition (owner, 2026-09-15: "I want more natural female voice options").
  const voiceId = (new URL(url).searchParams.get('voice') ?? params.voice ?? '').trim() || null;
  const voice = voiceId ? resolveVoice(voiceId) : null;
  if (version === 'answering-machine') {
    return twimlResponse(twiml(say(RECORDING_NOTICE, sayVoiceFor(voiceId)), machineOpening(voiceId)));
  }

  // The ElevenLabs agent (2026-09-15), on a test call only. Twilio keeps the leg, so the recording,
  // the call row and the transcript work exactly as they do for every other path.
  const sip = elevenLabsSipUri();
  if (version === 'elevenlabs' && sip) {
    const base = url.replace(/\/api\/twilio\/.*$/, '');
    return twimlResponse(twiml(
      say(RECORDING_NOTICE, sayVoiceFor(voiceId)),
      elevenLabsDial(sip, { callerId: tester, action: '/api/twilio/receptionist/relay-ended', recordingCallback: `${base}/api/twilio/recording` }),
    ));
  }

  // Real callers hear the notice before the owner's phone rings; a test call never rings him, so
  // the notice is spoken here, then the receptionist exactly as in production.
  const known = await lookupKnownCaller(supabaseAdmin, tester);
  const relay = relayConfig();
  if (relay) {
    return twimlResponse(twiml(
      say(RECORDING_NOTICE, sayVoiceFor(voiceId)),
      relayTwiml(relay, callSid, tester, { test: true, knownName: known?.name, voice: voice ? { provider: voice.provider, voice: voice.relayVoice } : null }),
    ));
  }
  const state = { ...emptyState(), test: true };
  return twimlResponse(twiml(say(RECORDING_NOTICE, sayVoiceFor(voiceId)), gather('/api/twilio/receptionist/turn', greeting(known?.name), { voice: sayVoiceFor(voiceId) })), { 'set-cookie': stateCookieHeader(state) });
}
