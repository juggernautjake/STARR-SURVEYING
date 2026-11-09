// lib/transcripts/deepgram.ts — send a video to Deepgram and get its words back. Server only.
//
// Deepgram fetches the media itself from the signed URL, so a 400 MB drone clip never passes through
// this server — the reason it was chosen (owner, 2026-11-09). Nova-3, with smart formatting (numbers,
// punctuation) and the survey key terms (lib/transcripts/model.ts SURVEY_KEYTERMS).
//
// The key is DEEPGRAM_API_KEY. Without it, transcription reports that it is not set up rather than
// failing somewhere less clear.

import { parseDeepgram, SURVEY_KEYTERMS, type Transcript } from './model';

const ENDPOINT = 'https://api.deepgram.com/v1/listen';
export const DEEPGRAM_MODEL = 'nova-3';

export function deepgramConfigured(): boolean {
  return Boolean(process.env.DEEPGRAM_API_KEY);
}

export function deepgramUrl(keyterms: readonly string[] = SURVEY_KEYTERMS): string {
  const p = new URLSearchParams({ model: DEEPGRAM_MODEL, smart_format: 'true', punctuate: 'true', language: 'en' });
  for (const k of keyterms) p.append('keyterm', k);
  return `${ENDPOINT}?${p.toString()}`;
}

export async function transcribeUrl(mediaUrl: string, signal?: AbortSignal): Promise<Transcript> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error('Transcription is not set up: DEEPGRAM_API_KEY is missing.');
  const res = await fetch(deepgramUrl(), {
    method: 'POST',
    headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: mediaUrl }),
    signal,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (json as { err_msg?: string; message?: string } | null)?.err_msg ?? (json as { message?: string } | null)?.message;
    throw new Error(`Transcription service error ${res.status}${msg ? `: ${msg}` : ''}`);
  }
  return parseDeepgram(json);
}
