// app/api/twilio/receptionist/voicemail/route.ts — a recorded message.
//
// Twilio calls this twice: once when the recording ends (RecordingUrl, RecordingDuration) — we
// thank the caller and hang up — and once more when its transcription is ready
// (TranscriptionText, TranscriptionStatus). The owners are texted on the second call so the message
// arrives with words in it; if transcription fails they still get the recording link.
//
// PUBLIC BY DESIGN: Twilio-signed, like the entry route.
import { NextResponse } from 'next/server';
import { validTwilioSignature, publicUrlOf, twilioParams } from '@/lib/twilio/signature';
import { hangup, say, twiml, twimlResponse } from '@/lib/twilio/twiml';
import { readStateCookie, clearStateCookieHeader } from '@/lib/receptionist/state';
import { notifyOwners } from '@/lib/receptionist/notify';

export const dynamic = 'force-dynamic';

const OWNER = process.env.RECEPTIONIST_OWNER_NAME || 'Hank';

export async function POST(request: Request): Promise<Response> {
  const params = await twilioParams(request);
  if (!validTwilioSignature(publicUrlOf(request), params, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const from = params.From ?? params.Caller ?? '';
  const state = readStateCookie(request);

  if ('TranscriptionStatus' in params || 'TranscriptionText' in params) {
    const transcript = params.TranscriptionStatus === 'completed' ? (params.TranscriptionText ?? '').trim() : '';
    await notifyOwners({
      from,
      facts: state.facts,
      summary: transcript ? `voicemail: ${transcript.slice(0, 120)}` : 'left a voicemail (no transcript)',
      recordingUrl: params.RecordingUrl ? `${params.RecordingUrl}.mp3` : undefined,
      transcript: transcript || undefined,
    });
    return new Response('', { status: 204 });
  }

  // Recording just finished. If transcription is off for some reason, still tell the owners now.
  if (!params.RecordingUrl) {
    await notifyOwners({ from, facts: state.facts, summary: 'called and hung up before leaving a message' });
  }
  return twimlResponse(twiml(say(`Got it. ${OWNER} will get your message. Goodbye.`), hangup()), { 'set-cookie': clearStateCookieHeader() });
}
