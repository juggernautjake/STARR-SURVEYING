// app/api/twilio/recording/route.ts — a recording is ready.
//
// Fires for the <Dial> leg (the human conversation, dual channel) and for the AI leg (started by
// REST in after-dial). The call row gets the recording sid/url/duration; the admin page plays it
// through /api/admin/calls/[id]/recording, which adds the account auth Twilio's URL needs.
//
// For calls a person answered there is no transcript yet. If a Voice Intelligence service is
// configured, one is requested here and /api/twilio/transcript stores it when it's done.
//
// PUBLIC BY DESIGN: Twilio-signed, like the receptionist routes.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validTwilioSignature, publicUrlOf, twilioParams } from '@/lib/twilio/signature';
import { getCallBySid, updateCall } from '@/lib/receptionist/calls';
import { createTranscript, intelligenceServiceSid } from '@/lib/twilio/rest';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const params = await twilioParams(request);
  if (!validTwilioSignature(publicUrlOf(request), params, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (params.RecordingStatus && params.RecordingStatus !== 'completed') return new Response('', { status: 204 });
  const callSid = params.CallSid ?? '';
  const call = await getCallBySid(supabaseAdmin, callSid);
  if (!call) return new Response('', { status: 204 });

  const patch: Parameters<typeof updateCall>[2] = {
    recording_sid: params.RecordingSid ?? null,
    recording_url: params.RecordingUrl ?? null,
    recording_duration: Number(params.RecordingDuration) || null,
    recording_source: call.answered_by === 'owner' ? 'dial' : 'ai',
  };
  if (call.answered_by === 'owner' && intelligenceServiceSid() && params.RecordingSid) {
    try {
      const t = await createTranscript(params.RecordingSid);
      patch.transcript_sid = t.sid;
      patch.transcript_status = t.status;
    } catch (err) {
      console.error('[recording] transcript request failed:', err);
      patch.transcript_status = 'unavailable';
    }
  }
  await updateCall(supabaseAdmin, callSid, patch);
  return new Response('', { status: 204 });
}
