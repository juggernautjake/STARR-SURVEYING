// app/api/twilio/receptionist/screen/route.ts — the whisper on the owner's leg.
//
// Twilio fetches this when the owner's phone answers, BEFORE bridging the caller. If a person
// answered, they hear who is calling and press a key; the empty <Response/> we return then lets
// the bridge happen. If the owner's own carrier voicemail answered, nothing presses a key, the
// <Gather> times out, the <Hangup/> drops this leg, and the parent <Dial> reports no-answer — which
// is exactly what sends the caller to the AI instead of into a personal voicemail box.
//
// PUBLIC BY DESIGN: Twilio-signed, like the entry route.
import { NextResponse } from 'next/server';
import { validTwilioSignature, publicUrlOf, twilioParams } from '@/lib/twilio/signature';
import { hangup, say, twiml, twimlResponse } from '@/lib/twilio/twiml';

export const dynamic = 'force-dynamic';

function spokenNumber(e164: string): string {
  const d = e164.replace(/\D/g, '').slice(-10);
  return d ? d.split('').join(' ') : 'an unknown number';
}

export async function POST(request: Request): Promise<Response> {
  const params = await twilioParams(request);
  if (!validTwilioSignature(publicUrlOf(request), params, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (params.Digits) return twimlResponse(twiml());
  const caller = params.From ?? '';
  const xml = twiml(
    `<Gather numDigits="1" timeout="6" actionOnEmptyResult="false">${say(`Starr Surveying call from ${spokenNumber(caller)}. Press any key to accept.`)}</Gather>`,
    hangup(),
  );
  return twimlResponse(xml);
}
