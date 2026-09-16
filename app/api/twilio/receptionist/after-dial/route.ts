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
import { readLiveVersion } from '@/lib/receptionist/version-server';
import { machineStart } from '@/lib/receptionist/answering-machine';
import { resolveVoice, sayVoiceFor } from '@/lib/receptionist/voices';
import { elevenLabsDial, elevenLabsSipAuth, elevenLabsSipUri } from '@/lib/receptionist/elevenlabs';

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

  const base = url.replace(/\/api\/twilio\/.*$/, '');
  // Hank did not take it. Record the live call (dual channel) so the page has audio for this leg too.
  if (twilioConfigured() && callSid && !existing?.recording_sid) {
    startCallRecording(callSid, `${base}/api/twilio/recording`).catch((err) => console.error('[receptionist] could not start recording:', err));
  }

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
  if (live.version === 'answering-machine' || (live.version === 'elevenlabs' && !sip)) {
    if (!sip && live.version === 'elevenlabs') console.error('[after-dial] live version is elevenlabs but no SIP URI is configured — answering with the machine');
    await updateCall(supabaseAdmin, callSid, { status: 'in-progress' });
    return twimlResponse(machineStart(live.voice));
  }

  // The relay/<Gather> agent is answering.
  await updateCall(supabaseAdmin, callSid, { status: 'in-progress', answered_by: 'ai' });
  // The caller already heard the recording notice before the phone rang (entry route), so the
  // receptionist goes straight to the greeting.
  //
  // Two transports for the same brain. With RECEPTIONIST_RELAY_URL set, the live call is handed to
  // ConversationRelay (streaming speech both ways, interruptible; see lib/receptionist/relay.ts).
  // Without it, or when the relay fails (relay-ended falls back here), the request-response
  // <Gather> loop below runs.
  const relay = relayConfig();
  const chosen = live.voice ? resolveVoice(live.voice) : null;
  if (relay) return twimlResponse(twiml(relayTwiml(relay, callSid, from, { voice: chosen ? { provider: chosen.provider, voice: chosen.relayVoice } : null })));
  const xml = twiml(gather('/api/twilio/receptionist/turn', greeting(), { voice: sayVoiceFor(live.voice) }));
  return twimlResponse(xml, { 'set-cookie': stateCookieHeader(emptyState()) });
}
