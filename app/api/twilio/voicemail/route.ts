// app/api/twilio/voicemail/route.ts — slice I3 of
// docs/planning/in-progress/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// Where `<Record action="…">` posts the moment the caller stops talking. Its job is to thank them
// and hang up — nothing slow, because the caller is still on the line listening to silence while
// this runs.
//
// The recording itself is NOT fetched here. That happens in /api/twilio/recording, which Twilio
// calls separately once the audio file actually exists. Downloading a few megabytes of audio inside
// this handler would leave the caller waiting, and the file is frequently not ready yet anyway.
import { NextRequest } from 'next/server';
import { readTwilioWebhook, twimlResponse } from '@/lib/phone/webhook';
import { voicemailThanksTwiml, twimlDocument } from '@/lib/phone/twiml';
import { updateCallBySid } from '@/lib/phone/calls';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const result = await readTwilioWebhook(req, 'voicemail');
  if (!result.ok) return twimlResponse(twimlDocument('<Hangup/>'), 200);

  const { params, callSid } = result.data;
  const seconds = Number(params.RecordingDuration);

  if (callSid) {
    void updateCallBySid(callSid, {
      is_voicemail: true,
      recording_seconds: Number.isFinite(seconds) ? Math.round(seconds) : null,
      // 'queued' rather than 'pending': the audio exists, so this row is now work waiting to be
      // picked up rather than a call that may never produce any.
      transcript_status: 'queued',
    }).catch((err) => console.error('[twilio/voicemail] update failed', err));
  }

  return twimlResponse(voicemailThanksTwiml());
}
