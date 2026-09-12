// lib/receptionist/relay.ts — the real-time voice path: Twilio ConversationRelay.
//
// ── WHY ─────────────────────────────────────────────────────────────────────────────────────────
//
// Owner, 2026-09-11, after the first live calls: "the natural tone and speed of the AI agent's
// responses could be faster and more natural … I am mainly looking for a way to speed up the
// response time for the agent to take in the information from the user and respond back."
//
// The <Gather> path has a floor it cannot get under: Twilio waits for the caller to finish, posts
// the transcript, the model writes the WHOLE reply, the route returns TwiML, and only then does the
// voice start. Every stage is serial. ConversationRelay replaces the whole loop with one WebSocket:
// Twilio streams the caller's words as they are recognised (Deepgram, sub-second), our relay
// streams the model's words back as they are written, and Twilio speaks them as they arrive
// (ElevenLabs Flash, ~75 ms). The caller can talk over the assistant, and the assistant stops.
//
// ── SHAPE ───────────────────────────────────────────────────────────────────────────────────────
//
//   Twilio ──wss──▶ worker/relay (netcup box, Node)  ──https──▶ this app: /relay-turn (streams)
//                                                                         /relay-ended (Connect action)
//
// The relay is deliberately thin. It holds the per-call state in memory, validates the URL token,
// chunks text into sentences, and handles interruptions and silence. Everything that knows about
// surveying, leads, notifications and the database stays here, behind one authenticated streaming
// endpoint, so the relay never needs a Supabase key or the Anthropic key.
//
// ── SWITCH ──────────────────────────────────────────────────────────────────────────────────────
//
// RECEPTIONIST_RELAY_URL unset → the <Gather> path, unchanged. Set → ConversationRelay, with the
// <Gather> path as the fallback when the relay cannot be reached (see relay-ended). The two paths
// share the brain; only the transport differs.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { esc } from '@/lib/twilio/twiml';
import { greeting } from './brain';
import type { CallState } from './state';

export interface RelayConfig {
  /** wss://… the relay's WebSocket endpoint. */
  url: string;
  /** Shared with the relay: signs the per-call URL token and authenticates relay → app calls. */
  secret: string;
  ttsProvider: 'ElevenLabs' | 'Google' | 'Amazon';
  voice: string;
}

// Rachel (ElevenLabs premade): calm, even, a narrator's pace. Format is voiceId-model-speed_stability_similarity.
// Owner, 2026-09-11, after hearing Sarah at 1.0: "is there a different woman's voice that we can use that
// talks a bit more slowly?" Speed 0.9 (range 0.7–1.2); stability 0.6 keeps her steady on numbers and
// addresses. flash_v2_5 is the low-latency model.
// Override with RECEPTIONIST_RELAY_VOICE; for a Google voice set RECEPTIONIST_RELAY_TTS=Google and
// e.g. RECEPTIONIST_RELAY_VOICE=en-US-Chirp3-HD-Aoede.
export const DEFAULT_RELAY_VOICE = '21m00Tcm4TlvDq8ikWAM-flash_v2_5-0.9_0.6_0.8';

export function relayConfig(env: Record<string, string | undefined> = process.env): RelayConfig | null {
  const url = (env.RECEPTIONIST_RELAY_URL ?? '').trim();
  const secret = (env.RECEPTIONIST_RELAY_SECRET ?? '').trim();
  if (!/^wss:\/\//.test(url) || secret.length < 16) return null;
  const tts = env.RECEPTIONIST_RELAY_TTS === 'Google' || env.RECEPTIONIST_RELAY_TTS === 'Amazon' ? env.RECEPTIONIST_RELAY_TTS : 'ElevenLabs';
  return { url, secret, ttsProvider: tts, voice: (env.RECEPTIONIST_RELAY_VOICE ?? '').trim() || (tts === 'ElevenLabs' ? DEFAULT_RELAY_VOICE : 'en-US-Chirp3-HD-Aoede') };
}

// ── The URL token ───────────────────────────────────────────────────────────────────────────────
// Twilio opens the WebSocket with whatever URL we put in the TwiML. A stranger who finds the relay's
// address must not be able to open a session and run up model time, so the URL carries a token:
// HMAC-SHA256 over "callSid.expiry", keyed with the shared secret, good for two hours. The relay
// checks it (same function, in worker/relay/server.mjs) before it will speak to anyone.
export function relayToken(callSid: string, exp: number, secret: string): string {
  return createHmac('sha256', secret).update(`${callSid}.${exp}`).digest('hex');
}

export function validRelayToken(callSid: string, exp: number, token: string, secret: string, now = Date.now()): boolean {
  if (!callSid || !Number.isFinite(exp) || exp * 1000 < now) return false;
  const expected = Buffer.from(relayToken(callSid, exp, secret));
  const given = Buffer.from(token || '');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function relaySocketUrl(cfg: RelayConfig, callSid: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + 2 * 60 * 60;
  const u = new URL(cfg.url);
  u.searchParams.set('call', callSid);
  u.searchParams.set('exp', String(exp));
  u.searchParams.set('t', relayToken(callSid, exp, cfg.secret));
  return u.toString();
}

/** Words the transcriber should expect. Proper nouns and trade terms that a general model would
 *  otherwise hear as something else ("all the survey" for ALTA). */
export const RELAY_HINTS = [
  'Starr Surveying', 'Hank', 'Ellie', 'boundary survey', 'boundary and improvements', 'ALTA survey', 'topographic survey',
  'elevation certificate', 'construction staking', 'subdivision plat', 'easement', 'encroachment', 'acres', 'RPLS',
  'Belton', 'Temple', 'Killeen', 'Salado', 'Harker Heights', 'Copperas Cove', 'Waco', 'Georgetown', 'Bell County', 'Coryell County', 'Williamson County',
].join(', ');

/** The TwiML that hands the live call to the relay. Returned by after-dial when the owner did not pick up. */
export function relayTwiml(cfg: RelayConfig, callSid: string, from: string, opts: { test?: boolean; actionPath?: string; knownName?: string | null } = {}): string {
  const actionPath = opts.actionPath ?? '/api/twilio/receptionist/relay-ended';
  const attrs = [
    `url="${esc(relaySocketUrl(cfg, callSid))}"`,
    `welcomeGreeting="${esc(greeting(opts.knownName))}"`,
    // A caller who starts talking over the greeting is answered, not talked over.
    'welcomeGreetingInterruptible="speech"',
    'interruptible="speech"',
    `ttsProvider="${cfg.ttsProvider}"`,
    `voice="${esc(cfg.voice)}"`,
    'language="en-US"',
    'transcriptionProvider="Deepgram"',
    'speechModel="nova-3-general"',
    cfg.ttsProvider === 'ElevenLabs' ? 'elevenlabsTextNormalization="on"' : '',
    `hints="${esc(RELAY_HINTS)}"`,
    'dtmfDetection="false"',
  ].filter(Boolean).join(' ');
  return `<Connect action="${esc(actionPath)}" method="POST"><ConversationRelay ${attrs}><Parameter name="from" value="${esc(from)}"/>${opts.test ? '<Parameter name="test" value="1"/>' : ''}</ConversationRelay></Connect>`;
}

// ── relay → app protocol ────────────────────────────────────────────────────────────────────────
// POST /api/twilio/receptionist/relay-turn with header x-relay-secret. Body is one of:
//   { event: 'turn',      callSid, from, heard, state }  → streams text/plain: the words, then RS + JSON envelope
//   { event: 'interrupt', callSid, said }                → the caller cut in; the transcript keeps what was heard
//   { event: 'closed',    callSid, from, state }         → socket closed without an 'end'; wrap the call up
/** ASCII record separator: ends the spoken text in a streamed relay-turn response; JSON follows. */
export const RELAY_RS = '';

export interface RelayTurnRequest { event: 'turn'; callSid: string; from: string; heard: string; state: CallState; test?: boolean }
export interface RelayInterruptRequest { event: 'interrupt'; callSid: string; said: string }
export interface RelayClosedRequest { event: 'closed'; callSid: string; from: string; state: CallState; summary?: string; test?: boolean }
export type RelayRequest = RelayTurnRequest | RelayInterruptRequest | RelayClosedRequest;

export function validRelaySecret(header: string | null | undefined, secret: string): boolean {
  if (!header || !secret) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** What the relay sends back to Twilio in `end`, and what relay-ended reads out of HandoffData. */
export interface RelayHandoff {
  next: 'done' | 'voicemail';
  summary?: string;
  test?: boolean;
  state?: Pick<CallState, 'facts' | 'turns'>;
}

export function parseHandoff(raw: string | undefined | null): RelayHandoff | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Partial<RelayHandoff>;
    if (j.next !== 'done' && j.next !== 'voicemail') return null;
    return { next: j.next, summary: typeof j.summary === 'string' ? j.summary : undefined, test: j.test === true, state: j.state && typeof j.state === 'object' ? { facts: j.state.facts ?? {}, turns: Array.isArray(j.state.turns) ? j.state.turns : [] } : undefined };
  } catch {
    return null;
  }
}
