// lib/twilio/rest.ts — the handful of Twilio REST calls the phone system makes. No SDK, same as
// lib/saas/notifications/sms.ts.
const SID = () => process.env.TWILIO_ACCOUNT_SID ?? '';
const TOKEN = () => process.env.TWILIO_AUTH_TOKEN ?? '';

export function twilioConfigured(): boolean {
  return Boolean(SID() && TOKEN());
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${SID()}:${TOKEN()}`).toString('base64')}`;
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { authorization: authHeader(), ...(init.headers ?? {}) } });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(json.message || `Twilio ${res.status}`);
  return json;
}

/** Start recording a live call (used for the AI leg, which <Dial> cannot record). Dual channel. */
export async function startCallRecording(callSid: string, statusCallback: string): Promise<{ sid: string }> {
  return call<{ sid: string }>(`https://api.twilio.com/2010-04-01/Accounts/${SID()}/Calls/${callSid}/Recordings.json`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ RecordingChannels: 'dual', RecordingStatusCallback: statusCallback, RecordingStatusCallbackMethod: 'POST', RecordingStatusCallbackEvent: 'completed', Trim: 'trim-silence' }),
  });
}

/** Stream a recording's audio. Twilio recording URLs need account auth; the admin route proxies them. */
export async function fetchRecording(recordingUrl: string, format: 'mp3' | 'wav' = 'mp3'): Promise<Response> {
  const url = recordingUrl.replace(/\.(mp3|wav|json)$/, '') + `.${format}`;
  return fetch(url, { headers: { authorization: authHeader() } });
}

// ── Voice Intelligence (transcribes calls a person answered) ─────────────────────────────────────
// Optional. Set VOICE_INTELLIGENCE_SERVICE_SID (a GA… sid from Console → Voice Intelligence →
// Services, with its webhook pointed at /api/twilio/transcript) and recordings of calls Hank
// answered get transcribed; without it, those calls keep the recording only.

export function intelligenceServiceSid(): string | null {
  const v = (process.env.VOICE_INTELLIGENCE_SERVICE_SID ?? '').trim();
  return /^GA[0-9a-f]{32}$/i.test(v) ? v : null;
}

export async function createTranscript(recordingSid: string): Promise<{ sid: string; status: string }> {
  const service = intelligenceServiceSid();
  if (!service) throw new Error('VOICE_INTELLIGENCE_SERVICE_SID not set');
  return call<{ sid: string; status: string }>('https://intelligence.twilio.com/v2/Transcripts', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ServiceSid: service, Channel: JSON.stringify({ media_properties: { source_sid: recordingSid } }) }),
  });
}

export interface TranscriptSentence { media_channel: number; transcript: string; start_time?: number; end_time?: number }

export async function getTranscript(transcriptSid: string): Promise<{ sid: string; status: string; channel?: { media_properties?: { source_sid?: string } } }> {
  return call(`https://intelligence.twilio.com/v2/Transcripts/${transcriptSid}`);
}

export async function getTranscriptSentences(transcriptSid: string): Promise<TranscriptSentence[]> {
  const out: TranscriptSentence[] = [];
  let url: string | null = `https://intelligence.twilio.com/v2/Transcripts/${transcriptSid}/Sentences?PageSize=500`;
  for (let i = 0; url && i < 10; i++) {
    const page: { sentences?: TranscriptSentence[]; meta?: { next_page_url?: string | null } } = await call(url);
    out.push(...(page.sentences ?? []));
    url = page.meta?.next_page_url ?? null;
  }
  return out;
}
