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
/**
 * The agent's inbound SIP address, with a transport it can actually be reached on.
 *
 * ── WHY THIS NORMALISES INSTEAD OF JUST VALIDATING ──────────────────────────────────────────────
 *
 * ElevenLabs' trunk listens on TCP (5060) and TLS (5061). It does NOT listen on UDP. Twilio
 * defaults a `sip:` URI with no `transport` parameter to UDP — so a URI that looks perfectly
 * well-formed, passes every check here, and is exactly what their own setup script printed, sends
 * every INVITE to a port with nothing behind it.
 *
 * The failure is invisible from our side. No SIP response comes back at all, so there is no error
 * code in Twilio to look up and no conversation on the ElevenLabs side to explain; the leg simply
 * fails in about a second, `agent-ended` hands the caller to the answering machine as designed, and
 * the only symptom is a customer leaving a voicemail. That ran for five days from 2026-09-16.
 *
 * So a plain `sip:` URI with no transport gets `;transport=tcp` rather than being accepted as-is or
 * rejected. Accepting it silently is what caused the outage; rejecting it would take the receptionist
 * off the air over a missing parameter we know the correct value of. A `sips:` URI is left alone —
 * that scheme already implies TLS — and so is any URI that states its own transport.
 */
export function elevenLabsSipUri(env: Record<string, string | undefined> = process.env): string | null {
  const raw = (env.ELEVENLABS_SIP_URI ?? '').trim();
  if (!/^sips?:[^\s@]+@[^\s]+$/i.test(raw)) return null;
  if (/;transport=/i.test(raw) || /^sips:/i.test(raw)) return raw;
  return `${raw};transport=tcp`;
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
