// app/api/twilio/recording/route.ts — slice T1 of
// docs/planning/in-progress/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// Twilio calls this once the audio file exists. We fetch it and put a copy in our own bucket.
//
// ── WHY WE COPY IT AT ALL ───────────────────────────────────────────────────────────────────────
//
// Twilio hosts the recording and will happily serve it forever, which makes storing its URL look
// sufficient. It is not: recordings are deleted when an account lapses or a retention policy is set,
// the URL requires the account credentials to fetch, and a business record that evaporates with a
// subscription is not a business record. A voicemail from a customer disputing what was agreed is
// exactly the file you need three years later.
//
// The Twilio URL is kept alongside ours, so a copy that failed can be retried rather than lost.
//
// ── AND WHY THE HANDLER RETURNS BEFORE THE DOWNLOAD FINISHES ────────────────────────────────────
//
// Twilio times these out and retries on a non-2xx. A three-minute message is a few megabytes and the
// fetch-plus-upload can outlast the window, at which point Twilio retries and we download it twice.
// So the row is marked first, the response goes back immediately, and the copy proceeds after.
import { NextRequest, NextResponse } from 'next/server';
import { readTwilioWebhook } from '@/lib/phone/webhook';
import { updateCallBySid, recordingPath, CALL_RECORDING_BUCKET } from '@/lib/phone/calls';
import { twilioAuthHeader } from '@/lib/phone/config';
import { transcribeCall, canTranscribeInProcess } from '@/lib/phone/transcribe';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const result = await readTwilioWebhook(req, 'recording');
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });

  const { params, callSid } = result.data;
  const recordingUrl = params.RecordingUrl ?? null;
  const seconds = Number(params.RecordingDuration);

  if (!callSid || !recordingUrl) {
    return NextResponse.json({ ok: true, note: 'nothing to fetch' });
  }

  await updateCallBySid(callSid, {
    recording_seconds: Number.isFinite(seconds) ? Math.round(seconds) : null,
    provider_recording_url: recordingUrl,
    transcript_status: 'queued',
  }).catch(() => undefined);

  // Deliberately not awaited — see the header.
  void copyRecording(callSid, recordingUrl).catch((err) =>
    console.error('[twilio/recording] copy failed', err),
  );

  return NextResponse.json({ ok: true });
}

/**
 * Fetch the audio from Twilio and store it.
 *
 * `.mp3` is requested explicitly. Twilio's default is WAV, which is roughly ten times larger for
 * speech and is the difference between a voicemail list that loads on a phone in the field and one
 * that does not.
 */
async function copyRecording(callSid: string, recordingUrl: string): Promise<void> {
  const authHeader = twilioAuthHeader();
  if (!authHeader) return;

  // The callback URL has no extension; appending one selects the format.
  const mp3Url = recordingUrl.endsWith('.mp3') ? recordingUrl : `${recordingUrl}.mp3`;

  // The file is often not on the CDN the instant the webhook fires. A few spaced retries turn a
  // routine race into a non-event; without them a fraction of recordings are permanently missing
  // and the pattern looks random.
  let audio: ArrayBuffer | null = null;
  for (const waitMs of [0, 1500, 4000]) {
    if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
    const res = await fetch(mp3Url, { headers: { Authorization: authHeader } });
    if (res.ok) {
      audio = await res.arrayBuffer();
      break;
    }
    if (res.status !== 404) {
      console.error(`[twilio/recording] Twilio returned ${res.status} for ${callSid}`);
      break;
    }
  }
  if (!audio) {
    await updateCallBySid(callSid, { transcript_status: 'failed' });
    return;
  }

  const path = recordingPath(callSid);
  const { error } = await supabaseAdmin.storage
    .from(CALL_RECORDING_BUCKET)
    .upload(path, Buffer.from(audio), { contentType: 'audio/mpeg', upsert: true });

  if (error) {
    console.error('[twilio/recording] upload failed', error.message);
    await updateCallBySid(callSid, { transcript_status: 'failed' });
    return;
  }
  await updateCallBySid(callSid, { recording_path: path, transcript_status: 'queued' });

  // Transcribe now if this deployment can. When it cannot, the row stays `queued` with its
  // recording_path set — which is precisely what the worker polls for — so doing nothing here is
  // the correct behaviour rather than a gap. See the D2 amendment in the plan.
  if (canTranscribeInProcess()) {
    const { data } = await supabaseAdmin
      .from('calls')
      .select('id')
      .eq('provider_call_sid', callSid)
      .maybeSingle();
    const id = (data as { id: string } | null)?.id;
    if (id) {
      const result = await transcribeCall(id);
      if (result.status === 'failed') console.error(`[twilio/recording] transcription failed: ${result.detail}`);
    }
  }
}
