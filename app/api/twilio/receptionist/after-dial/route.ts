// app/api/twilio/receptionist/after-dial/route.ts — the owner didn't pick up.
//
// <Dial> posts here when the owner's leg ends. `DialCallStatus` says how: `completed` means a real
// conversation happened and we simply hang up. `no-answer`, `busy`, `failed`, `canceled` mean the
// caller is still on the line waiting, and the AI receptionist takes over: recording notice first
// (the one legal requirement, recorded-line design 2026-08-14 §3), then the greeting, then listen.
//
// PUBLIC BY DESIGN: Twilio-signed, like the entry route.
import { NextResponse } from 'next/server';
import { validTwilioSignature, publicUrlOf, twilioParams } from '@/lib/twilio/signature';
import { gather, hangup, say, twiml, twimlResponse } from '@/lib/twilio/twiml';
import { emptyState, stateCookieHeader } from '@/lib/receptionist/state';
import { RECORDING_NOTICE, greeting } from '@/lib/receptionist/brain';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const params = await twilioParams(request);
  if (!validTwilioSignature(publicUrlOf(request), params, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (params.DialCallStatus === 'completed') {
    return twimlResponse(twiml(hangup()));
  }
  const xml = twiml(say(RECORDING_NOTICE), gather('/api/twilio/receptionist/turn', greeting()));
  return twimlResponse(xml, { 'set-cookie': stateCookieHeader(emptyState()) });
}
