// lib/receptionist/elevenlabs.ts — handing a call to the ElevenLabs agent (owner, 2026-09-15).
//
// The research recommendation: ElevenLabs Agents with Expressive Mode (eleven_v3_conversational),
// which ConversationRelay cannot reach — it only supports four ElevenLabs models, none of them the
// expressive one. The way to use it WITHOUT giving up this number or the ring-Hank-first flow is SIP:
// the call stays a Twilio call, and Twilio dials the agent as a SIP endpoint.
//
//   caller → Twilio toll-free → <Dial> Hank's cell → (no answer) → <Dial><Sip> the ElevenLabs agent
//
// Twilio keeps the leg, so the recording, the call row and the transcript still work the way they do
// for every other path. Set ELEVENLABS_SIP_URI once the number is registered
// (`node scripts/elevenlabs-agent.mjs --sip +1…`); unset, every caller here answers null and the
// callers fall back to the paths that already exist.
import { esc } from '@/lib/twilio/twiml';

/** `sip:+18338426971@sip.rtc.elevenlabs.io:5060`, or null when it is not configured. */
export function elevenLabsSipUri(env: Record<string, string | undefined> = process.env): string | null {
  const raw = (env.ELEVENLABS_SIP_URI ?? '').trim();
  return /^sips?:[^\s@]+@[^\s]+$/i.test(raw) ? raw : null;
}

export const elevenLabsConfigured = (env: Record<string, string | undefined> = process.env): boolean =>
  elevenLabsSipUri(env) !== null;

/** SIP digest credentials, when the agent's inbound trunk is locked to them. Sent on the <Sip> noun,
 *  so a stranger who finds the SIP address cannot open a session and spend the firm's minutes. */
export function elevenLabsSipAuth(env: Record<string, string | undefined> = process.env): { username: string; password: string } | null {
  const username = (env.ELEVENLABS_SIP_USERNAME ?? '').trim();
  const password = (env.ELEVENLABS_SIP_PASSWORD ?? '').trim();
  return username && password ? { username, password } : null;
}

/**
 * Dial the agent. `callerId` is the caller's own number so the agent can greet a known caller, and
 * the recording callback is the same one every other path uses, so a call answered by ElevenLabs is
 * reviewed on /admin/calls like any other.
 */
export function elevenLabsDial(uri: string, opts: { callerId: string; action: string; recordingCallback?: string; auth?: { username: string; password: string } | null }): string {
  const attrs = [
    `action="${esc(opts.action)}"`,
    'method="POST"',
    'timeout="20"',
    opts.callerId ? `callerId="${esc(opts.callerId)}"` : '',
    opts.recordingCallback ? `record="record-from-answer-dual" recordingStatusCallback="${esc(opts.recordingCallback)}" recordingStatusCallbackMethod="POST"` : '',
  ].filter(Boolean).join(' ');
  const auth = opts.auth ? ` username="${esc(opts.auth.username)}" password="${esc(opts.auth.password)}"` : '';
  return `<Dial ${attrs}><Sip${auth}>${esc(uri)}</Sip></Dial>`;
}
