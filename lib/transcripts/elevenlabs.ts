// lib/transcripts/elevenlabs.ts — send a video to ElevenLabs Scribe and get its words back. Server only.
//
// Owner, 2026-11-09: "what about elevenlabs or twilio? We already pay for those." ElevenLabs it is:
// Scribe takes MP4 / MOV as they are, fetches them itself from the signed URL (so a 400 MB drone
// clip never passes through this server), and times every word. Twilio's transcription takes WAV,
// MP3 or FLAC only, and its docs do not promise word times for an uploaded file.
//
// THE KEY needs the `speech_to_text` permission. The receptionist's key (ELEVENLABS_API_KEY) was made
// for voices and agents and is refused for this ("missing the permission speech_to_text", 2026-11-09),
// so a separate ELEVENLABS_STT_API_KEY is read first; without one the main key is tried.
//
// Survey key terms (lib/transcripts/model.ts SURVEY_KEYTERMS) are sent as `keyterms`, which ElevenLabs
// bills at +20% — the price of "guy wire" not coming back as "guy wear".

import { parseScribe, SURVEY_KEYTERMS, type Transcript } from './model';

const ENDPOINT = 'https://api.elevenlabs.io/v1/speech-to-text';
export const SCRIBE_MODEL = 'scribe_v2';

export function sttKey(): string | undefined {
  return process.env.ELEVENLABS_STT_API_KEY || process.env.ELEVENLABS_API_KEY || undefined;
}

export function transcriptionConfigured(): boolean {
  return Boolean(sttKey());
}

/** The request body: the video by URL, word timestamps, English, the key terms one field each. */
export function scribeForm(mediaUrl: string, keyterms: readonly string[] = SURVEY_KEYTERMS): FormData {
  const form = new FormData();
  form.append('model_id', SCRIBE_MODEL);
  form.append('source_url', mediaUrl);
  form.append('timestamps_granularity', 'word');
  form.append('language_code', 'en');
  form.append('tag_audio_events', 'false');
  for (const k of keyterms) form.append('keyterms', k);
  return form;
}

export async function transcribeUrl(mediaUrl: string, signal?: AbortSignal): Promise<Transcript> {
  const key = sttKey();
  if (!key) throw new Error('Transcription is not set up: no ElevenLabs key on the server.');
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'xi-api-key': key }, body: scribeForm(mediaUrl), signal });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = (json as { detail?: { message?: string; status?: string } | string } | null)?.detail;
    const message = typeof detail === 'string' ? detail : detail?.message;
    if (typeof detail === 'object' && detail?.status === 'missing_permissions') {
      throw new Error('The ElevenLabs key is not allowed to transcribe. In ElevenLabs, give the key the "Speech to Text" permission (or add a key that has it as ELEVENLABS_STT_API_KEY).');
    }
    throw new Error(`Transcription service error ${res.status}${message ? `: ${message}` : ''}`);
  }
  return parseScribe(json);
}
