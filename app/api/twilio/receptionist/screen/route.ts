// app/api/twilio/receptionist/screen/route.ts — the whisper on the owner's leg.
//
// Twilio fetches this when the owner's phone answers, BEFORE bridging the caller. If a person
// answered, they hear that it is a business call and press a key; the call row is marked as
// accepted by the owner and the empty <Response/> we return lets the bridge happen. If the owner's
// own carrier voicemail answered, nothing presses a key, the <Gather> times out, the <Hangup/> drops
// this leg, and ./after-dial — seeing no acceptance on the row — sends the caller to the AI instead
// of into a personal voicemail box.
//
// WHY NO NUMBER IS READ OUT. First live test, 2026-09-11: the whisper read "call from 833 842 6971",
// the business's own number, because on this leg Twilio's `From` is the callerId we dialled with,
// not the person calling. The owner: "It might make sense if it just says that the call is Starr
// Surveying related and doesn't say the number at all." So it does.
//
// PUBLIC BY DESIGN: Twilio-signed, like the entry route.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validTwilioSignature, publicUrlOf, twilioParams } from '@/lib/twilio/signature';
import { hangup, say, twiml, twimlResponse } from '@/lib/twilio/twiml';
import { updateCall } from '@/lib/receptionist/calls';
import { whisperText } from '@/lib/receptionist/brain';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const params = await twilioParams(request);
  const url = publicUrlOf(request);
  if (!validTwilioSignature(url, params, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (params.Digits) {
    // A person pressed a key. Record it on the PARENT call (the caller's leg), which is the row the
    // entry route opened; Twilio sends ParentCallSid on child legs, and the entry route also put it
    // in the query as a belt-and-braces.
    const parent = params.ParentCallSid || new URL(url).searchParams.get('parent') || '';
    if (parent) await updateCall(supabaseAdmin, parent, { status: 'in-progress', answered_by: 'owner' });
    return twimlResponse(twiml());
  }
  const xml = twiml(
    `<Gather numDigits="1" timeout="6" actionOnEmptyResult="false">${say(whisperText())}</Gather>`,
    hangup(),
  );
  return twimlResponse(xml);
}
