// lib/receptionist/brain.ts — what the receptionist says next.
//
// One Claude call per caller utterance, through the same `callAi` wrapper every other AI feature
// uses (role `assistant`, so the model tier follows the deployment's config and its cost is
// recorded like the rest). The model gets the business facts, the conversation so far, and the
// facts already collected, and answers with a JSON envelope: what to say, whether the call is
// done, and any facts it learned. It never writes to the database itself; the route does that
// through `insertLeadFromForm`, the same path the website form uses.
//
// Why JSON-out rather than tools: a phone turn is one exchange, the caller is waiting on the line,
// and every extra round trip is dead air. One call, one envelope, one TwiML response.
import { callAi, aiConfigured } from '@/lib/ai/client';
import { PHONE_DISPLAY, EMAIL, OFFICE_STREET, OFFICE_CITY, OFFICE_REGION, OPENING_HOURS } from '@/lib/seo/business';
import type { CallFacts, CallState } from './state';

export interface BrainReply {
  say: string;
  /** continue: listen again. voicemail: record a message. done: say goodbye and hang up. */
  next: 'continue' | 'voicemail' | 'done';
  facts: CallFacts;
  /** true once name + phone + what they need are known; the route then saves a lead. */
  readyToSave: boolean;
  summary?: string;
}

const OWNER = process.env.RECEPTIONIST_OWNER_NAME || 'Hank';

/** The owner's cell, E.164. Calls to the business line ring this first. */
export function ownerPhone(env: Record<string, string | undefined> = process.env): string | null {
  const v = (env.RECEPTIONIST_OWNER_PHONE ?? '').trim();
  return /^\+1\d{10}$/.test(v) ? v : null;
}

/** Spoken before anything else on every call. The one line that makes recording lawful everywhere
 *  a caller might be standing (recorded-line design, 2026-08-14 §3). Not configurable on purpose. */
export const RECORDING_NOTICE = 'This call may be recorded for quality and record-keeping.';

export function greeting(): string {
  return `Hi, you've reached Starr Surveying. ${OWNER} can't come to the phone right now, but I can help. Are you calling about a survey, or is this something else?`;
}

const SERVICES = 'boundary surveys, topographic surveys, ALTA/NSPS land title surveys, construction staking, subdivision platting, and elevation certificates';
const COUNTIES = 'Bell, Williamson, Coryell, Falls, McLennan, Travis, Madison, Walker, and Montgomery counties, and anywhere within about 150 miles of Belton';

function hoursText(): string {
  const h = OPENING_HOURS[0];
  return h ? `${h.days[0]} through ${h.days[h.days.length - 1]}, ${h.opens} to ${h.closes}` : 'weekdays';
}

export function systemPrompt(): string {
  return `You are the phone receptionist for Starr Surveying, a licensed land surveying firm in ${OFFICE_CITY}, ${OFFICE_REGION}. The call reached you because ${OWNER}, the owner and Registered Professional Land Surveyor, could not pick up. This is ${OWNER}'s personal phone too, so callers may be family, friends, vendors, or customers.

Facts you may share: office at ${OFFICE_STREET}, ${OFFICE_CITY}, ${OFFICE_REGION}; phone ${PHONE_DISPLAY}; email ${EMAIL}; hours ${hoursText()}; services: ${SERVICES}; service area: ${COUNTIES}. Typical boundary surveys on residential lots are scheduled within one to two weeks; pricing depends on the property, so you never quote a price. You do not know ${OWNER}'s calendar.

How to handle the call:
- First figure out who is calling and why. If it is personal or not about surveying, be warm, take a short message, and wrap up. Do not interrogate a friend.
- If it is a potential customer: get their name, the best phone number to reach them, the property address or location, what they need (which service), and any timing. Ask one question at a time. Confirm the phone number by reading it back. Answer basic questions from the facts above; if you don't know, say ${OWNER} will call them back.
- If they ask to leave a voicemail at any point, do it.
- Keep every reply to one or two short sentences. Spoken aloud by a text-to-speech voice: no lists, no markdown, no emoji, no URLs.
- Never claim anything has been scheduled, priced, or promised.
- When you have what you need, or the caller is done, say a short goodbye and mark the call done.

Respond ONLY with a JSON object, no prose around it:
{"say": "what to say next", "next": "continue" | "voicemail" | "done", "facts": {"kind": "customer"|"personal"|"vendor"|"unknown", "name": "...", "phone": "...", "address": "...", "service": "...", "details": "..."}, "readyToSave": true|false, "summary": "one line for the owner's text message, written once next is done"}
Only include facts you actually learned. Set readyToSave to true only when kind is customer and you have at least a name and a phone number.`;
}

function transcript(state: CallState): string {
  return state.turns.map((t) => `${t.role === 'caller' ? 'Caller' : 'You'}: ${t.text}`).join('\n');
}

export function parseEnvelope(text: string): BrainReply | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Partial<BrainReply>;
    if (typeof j.say !== 'string') return null;
    return {
      say: j.say.trim(),
      next: j.next === 'voicemail' || j.next === 'done' ? j.next : 'continue',
      facts: typeof j.facts === 'object' && j.facts ? j.facts : {},
      readyToSave: Boolean(j.readyToSave),
      summary: typeof j.summary === 'string' ? j.summary : undefined,
    };
  } catch {
    return null;
  }
}

const FALLBACK: BrainReply = {
  say: `I'm having trouble on my end. Let me take a message for ${OWNER} instead. After the tone, please say your name, number, and what you need.`,
  next: 'voicemail',
  facts: {},
  readyToSave: false,
};

export async function nextReply(state: CallState, callerText: string, from: string): Promise<BrainReply> {
  if (!aiConfigured()) return FALLBACK;
  const known = Object.entries(state.facts).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('; ');
  const user = [
    `Caller ID: ${from || 'unknown'}.`,
    known ? `Facts already collected: ${known}.` : 'No facts collected yet.',
    state.turns.length ? `Conversation so far:\n${transcript(state)}` : 'This is the first thing the caller said.',
    `Caller just said: "${callerText}"`,
  ].join('\n\n');
  try {
    const r = await callAi({ role: 'assistant', surface: 'phone-receptionist', system: systemPrompt(), messages: [{ role: 'user', content: user }], maxTokens: 600 });
    return parseEnvelope(r.text) ?? FALLBACK;
  } catch (err) {
    console.error('[receptionist] AI call failed:', err);
    return FALLBACK;
  }
}
