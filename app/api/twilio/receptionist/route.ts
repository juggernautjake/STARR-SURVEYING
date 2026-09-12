// app/api/twilio/receptionist/route.ts — the business line rings.
//
// Owner, 2026-09-11: "for the website and google and facebook and everywhere online for Starr
// Surveying, we have the twilio number. when they call that number, they will be routed to my
// dad's number, and if he doesn't pick up, then the AI voice agent will handle the call."
//
// So: the call row is opened, the caller hears the recording notice (owner, 2026-09-11: "the caller
// should also hear that the call may be recorded"), and the call is dialled through to the owner's
// cell, recorded from the moment he answers. His leg gets a short whisper ("press any key to
// accept", see ./screen), which is what makes this work when HIS carrier voicemail answers instead
// of him: nobody presses a key, the leg is dropped, and ./after-dial hands the caller to the AI.
//
// The notice is spoken BEFORE the dial because that is the only moment the caller's leg is ours:
// once <Dial> bridges, both people are talking and nothing can be played to one without the other.
// It doubles as the "please hold" that stops a caller hanging up during 15 seconds of ringing.
//
// PUBLIC BY DESIGN: the Twilio signature is the credential. A request without a valid
// X-Twilio-Signature for this exact URL is refused before any TwiML is produced.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validTwilioSignature, publicUrlOf, twilioParams } from '@/lib/twilio/signature';
import { dial, hangup, say, twiml, twimlResponse } from '@/lib/twilio/twiml';
import { RING_SECONDS, holdNotice, ownerPhone } from '@/lib/receptionist/brain';
import { startCall } from '@/lib/receptionist/calls';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const params = await twilioParams(request);
  if (!validTwilioSignature(publicUrlOf(request), params, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const callSid = params.CallSid ?? '';
  if (callSid) await startCall(supabaseAdmin, { callSid, from: params.From ?? '', to: params.To ?? '' });

  const owner = ownerPhone();
  if (!owner) {
    // No owner phone configured: go straight to the receptionist rather than dropping the call.
    return twimlResponse(twiml(`<Redirect method="POST">/api/twilio/receptionist/after-dial</Redirect>`));
  }
  const xml = twiml(
    say(holdNotice()),
    dial(owner, {
      timeout: RING_SECONDS,
      callerId: params.To ?? '',
      action: '/api/twilio/receptionist/after-dial',
      // The whisper runs on the owner's leg, where Twilio's From is OUR number, not the caller's.
      // The parent call sid travels in the query so the whisper can mark the right row as accepted.
      screenUrl: `/api/twilio/receptionist/screen?parent=${encodeURIComponent(callSid)}`,
      recordingCallback: '/api/twilio/recording',
    }),
    // Reached only if <Dial> returns without an action redirect, which it does not; kept as a safety net.
    say('One moment.'),
    hangup(),
  );
  return twimlResponse(xml);
}
