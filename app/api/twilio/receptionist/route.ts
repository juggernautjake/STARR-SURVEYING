// app/api/twilio/receptionist/route.ts — the business line rings.
//
// Owner, 2026-09-11: "for the website and google and facebook and everywhere online for Starr
// Surveying, we have the twilio number. when they call that number, they will be routed to my
// dad's number, and if he doesn't pick up, then the AI voice agent will handle the call."
//
// So: the call row is opened, then every call is dialled straight through to the owner's cell,
// recorded from the moment he answers. His leg gets a short whisper ("press any key to accept",
// see ./screen), which is what makes this work when HIS carrier voicemail answers instead of him:
// nobody presses a key, the leg is dropped, and Twilio reports no-answer. ./after-dial decides what
// happens next: a completed call just ends; anything else hands the caller to the AI receptionist.
//
// PUBLIC BY DESIGN: the Twilio signature is the credential. A request without a valid
// X-Twilio-Signature for this exact URL is refused before any TwiML is produced.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validTwilioSignature, publicUrlOf, twilioParams } from '@/lib/twilio/signature';
import { dial, hangup, say, twiml, twimlResponse } from '@/lib/twilio/twiml';
import { ownerPhone } from '@/lib/receptionist/brain';
import { startCall } from '@/lib/receptionist/calls';

export const dynamic = 'force-dynamic';

const RING_SECONDS = 25;

export async function POST(request: Request): Promise<Response> {
  const params = await twilioParams(request);
  if (!validTwilioSignature(publicUrlOf(request), params, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (params.CallSid) await startCall(supabaseAdmin, { callSid: params.CallSid, from: params.From ?? '', to: params.To ?? '' });

  const owner = ownerPhone();
  if (!owner) {
    // No owner phone configured: go straight to the receptionist rather than dropping the call.
    return twimlResponse(twiml(`<Redirect method="POST">/api/twilio/receptionist/after-dial</Redirect>`));
  }
  const xml = twiml(
    dial(owner, {
      timeout: RING_SECONDS,
      callerId: params.To ?? '',
      action: '/api/twilio/receptionist/after-dial',
      screenUrl: '/api/twilio/receptionist/screen',
      recordingCallback: '/api/twilio/recording',
    }),
    // Reached only if <Dial> returns without an action redirect, which it does not; kept as a safety net.
    say('One moment.'),
    hangup(),
  );
  return twimlResponse(xml);
}
