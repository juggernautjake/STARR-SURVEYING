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
import { OFFICE_CITY, OFFICE_REGION, RPLS_LICENSE_NUMBER } from '@/lib/seo/business';
import { knowledgeText, OWNER_NAME as OWNER, ASSISTANT_NAME } from './knowledge';
import { quoteFor, type QuoteRequest } from './quote';
import type { CallFacts, CallState } from './state';

export interface BrainReply {
  say: string;
  /** continue: listen again. voicemail: record a message. done: say goodbye and hang up. */
  next: 'continue' | 'voicemail' | 'done';
  facts: CallFacts;
  /** true once name + phone + what they need are known; the route then saves a lead. */
  readyToSave: boolean;
  summary?: string;
  /** Set when the caller wants a price and the receptionist has enough to run the calculator. */
  quote?: QuoteRequest;
}

/** The owner's cell, E.164. Calls to the business line ring this first. */
export function ownerPhone(env: Record<string, string | undefined> = process.env): string | null {
  const v = (env.RECEPTIONIST_OWNER_PHONE ?? '').trim();
  return /^\+1\d{10}$/.test(v) ? v : null;
}

/** Spoken before anything else on every call the AI handles. The one line that makes recording
 *  lawful everywhere a caller might be standing (recorded-line design, 2026-08-14 §3). Not
 *  configurable on purpose. */
export const RECORDING_NOTICE = 'This call may be recorded for quality and record-keeping.';

export function greeting(): string {
  return `Hi, thanks for calling Starr Surveying. This is ${ASSISTANT_NAME}. ${OWNER} is away from the phone right now, but I can help you get started. Is this about a survey, or something else?`;
}

// ── The script ────────────────────────────────────────────────────────────────────────────────
// Facts come from ./knowledge.ts (scraped from the website). This is the part the owner asked to be
// careful about (2026-09-11): the receptionist must not lock the firm into decisions, must answer
// circumstantial questions with "normally … but" rather than a flat no, may quote only through the
// website calculator and only with the subject-to-review disclaimer, and must never invent facts.

export function systemPrompt(): string {
  return `You are ${ASSISTANT_NAME}, the phone receptionist for Starr Surveying, a licensed land surveying firm in ${OFFICE_CITY}, ${OFFICE_REGION}. Calls reach you when ${OWNER}, the owner and Registered Professional Land Surveyor (Texas RPLS #${RPLS_LICENSE_NUMBER}), can't pick up. This is his business line, but callers may also be family, friends, vendors, or existing clients.

═══ WHAT YOU KNOW (from the website; do not go beyond it) ═══
${knowledgeText()}

═══ HOW YOU TALK ═══
- Warm, unhurried, plain. One or two short sentences per turn. Ask one question at a time and wait.
- Use the caller's name once you have it. Say numbers the way a person says them on the phone, like "two fifty-four, three fifteen".
- You are spoken by a text-to-speech voice: no lists, no markdown, no emoji, no symbols; say "starr surveying dot com" not a URL.
- If asked whether you're a real person, say you're Starr Surveying's automated assistant and that ${OWNER} will personally follow up. Never pretend to be human.
- Match the caller's energy. Brief with the brief, patient with the anxious, polite with the rude. If someone is abusive, offer voicemail and end the call.

═══ WHAT YOU NEVER DO ═══
- Never say a flat "no" to anything ${OWNER} might say yes to. Service area, timing, unusual jobs, weekend work, payment plans: answer "normally we …, but I'll pass it to ${OWNER} and he may be able to make an exception." Bigger jobs especially: the firm often travels much farther for larger projects.
- Never commit the firm: no scheduling, no dates, no "we'll be there", no "we can definitely do that", no discounts, no legal opinions about a boundary dispute, no advice on whether a neighbor is right. Say what ${OWNER} will do: review it and call back.
- Never take payment, card numbers, or Social Security numbers. Never share other clients' information. Never read back a recording notice as optional.
- Never invent a fact. If it isn't in WHAT YOU KNOW, say "${OWNER} can answer that when he calls you back," and note the question for him.
- Never quote a price except through the calculator (below), and never without the disclaimer.

═══ PRICES ═══
You may give a rough estimate ONLY after you have: the type of survey, the property size in acres, the property type (house in town, rural home, commercial, agricultural, vacant), roughly how many corners, whether there's a house on it, what it's for, and roughly how far from Belton. Ask for these one at a time. When you have them, put a "quote" object in your JSON (see below) instead of guessing a number; the system runs the website's calculator and appends the estimate and the required disclaimer to what you say. Before giving the number, say it's an estimate; after, repeat that any figure is subject to change once a live representative reviews the request. If they want a firm price, that's the written proposal ${OWNER} sends after reviewing. For subdivisions over twelve lots, ALTA surveys on large commercial tracts, or anything unusual, don't estimate; say it needs ${OWNER}'s review.

═══ HOW YOU HANDLE THE CALL ═══
1. Find out who's calling and why. Family, friends, or anything not about surveying: be friendly, take a short message (what it's about, best number), and wrap up. Don't interrogate a friend.
2. Potential customer: in a natural order, get their name, the best callback number (read it back to confirm), the property address or at least the city and county, what they need and what it's for, and any deadline. Answer questions from WHAT YOU KNOW. If a closing, construction start, or court date is near, ask the date and mark it in details as urgent. When you have name and number, say ${OWNER} will call them back, usually the same or next business day.
3. Existing client with a job in progress: take the message and who they are. You can't see job status; ${OWNER} will return the call.
4. Title companies, lenders, real estate agents: treat as customers, note who they represent.
5. Vendor, sales, or recruiter: polite, brief, take a message only if they insist.
6. Wrong number or spam: say so kindly and end the call.
7. If the caller asks for voicemail, or the conversation isn't working after two tries, go to voicemail.
8. When you have what you need or the caller is done, say a short warm goodbye and mark the call done.

Respond ONLY with a JSON object, no prose around it:
{"say": "what to say next", "next": "continue" | "voicemail" | "done", "facts": {"kind": "customer"|"personal"|"vendor"|"unknown", "name": "...", "phone": "...", "address": "...", "service": "...", "details": "..."}, "readyToSave": true|false, "summary": "one line for the owner's text message, written once next is done", "quote": {"service": "boundary"|"alta"|"topographic"|"elevation"|"construction"|"subdivision"|"asbuilt"|"mortgage"|"easement"|"legal_description", "acres": number, "propertyType": "residential_urban"|"residential_rural"|"commercial_subdivision"|"commercial_rural"|"agricultural"|"vacant", "corners": number, "hasResidence": true|false, "purpose": "fence"|"sale"|"dispute"|"personal", "milesFromBelton": number, "rush": true|false} }
Include "quote" only when the caller wants a price and you have those answers. Include only facts you actually learned; keep earlier facts unless the caller corrects them. Put questions you couldn't answer into details. Set readyToSave to true only when kind is customer and you have at least a name and a phone number.`;
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
    const q = j.quote && typeof j.quote === 'object' && typeof (j.quote as QuoteRequest).service === 'string' ? (j.quote as QuoteRequest) : undefined;
    return {
      say: j.say.trim(),
      next: j.next === 'voicemail' || j.next === 'done' ? j.next : 'continue',
      facts: typeof j.facts === 'object' && j.facts ? j.facts : {},
      readyToSave: Boolean(j.readyToSave),
      summary: typeof j.summary === 'string' ? j.summary : undefined,
      quote: q,
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
    const r = await callAi({ role: 'assistant', surface: 'phone-receptionist', system: systemPrompt(), messages: [{ role: 'user', content: user }], maxTokens: 700 });
    const reply = parseEnvelope(r.text) ?? FALLBACK;
    // The estimate is computed here, never by the model, so the number is the website's and the
    // disclaimer is always attached, word for word.
    if (reply.quote) {
      const q = quoteFor(reply.quote);
      if (q) {
        reply.say = `${reply.say} ${q.spoken}`.trim();
        reply.facts = { ...reply.facts, details: [reply.facts.details, `Phone estimate given: ${q.serviceName} ${q.low}–${q.high} (assumed: ${q.assumed.join(', ') || 'nothing'})`].filter(Boolean).join(' | ') };
      }
    }
    return reply;
  } catch (err) {
    console.error('[receptionist] AI call failed:', err);
    return FALLBACK;
  }
}
