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
import { streamAi } from '@/lib/ai/stream';
import { OFFICE_CITY, OFFICE_REGION, RPLS_LICENSE_NUMBER, BUSINESS_NAME } from '@/lib/seo/business';
import { knowledgeText, hoursSentence, LAW_DISCLAIMER, OWNER_NAME as OWNER, ASSISTANT_NAME } from './knowledge';
import { quoteFor, type QuoteRequest } from './quote';
import { situationsText } from './situations';
import { lawLibraryText } from './law-library';
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

// Owner, 2026-09-11: first 20 s, then "can we make it 15 seconds instead of 20 to make sure that it
// doesn't go to voicemail?" His carrier's voicemail answers at about 22 s; 15 leaves a clear margin
// so the whisper never plays into his voicemail box.
export const RING_SECONDS = 15;

/** What the caller hears before the owner's phone rings: the notice, and a reason to stay on. */
export function holdNotice(): string {
  return `Thanks for calling ${BUSINESS_NAME}. ${RECORDING_NOTICE} Please hold while we connect you.`;
}

/** The whisper on the owner's leg. No number: on that leg Twilio's From is our own callerId. */
export function whisperText(): string {
  return `${BUSINESS_NAME} call. Press any key to accept.`;
}

// Owner, 2026-09-11: "The immediate response when the agent answers should be that the customer can
// leave a message, or they can ask questions and give information about their request … make it
// very clear that they can simply leave a message too."
export function greeting(knownName?: string | null): string {
  const first = (knownName ?? '').trim().split(/\s+/)[0];
  const hello = first ? `Hi, thanks for calling ${BUSINESS_NAME}. This is ${ASSISTANT_NAME}. Is this ${first}?` : `Hi, thanks for calling ${BUSINESS_NAME}. This is ${ASSISTANT_NAME}.`;
  return `${hello} ${OWNER} can't get to the phone right now. You're welcome to just leave him a message, or I can help you right now with questions or a survey request. Which would you like?`;
}

// ── The script ────────────────────────────────────────────────────────────────────────────────
// Facts come from ./knowledge.ts (scraped from the website). This is the part the owner asked to be
// careful about (2026-09-11): the receptionist must not lock the firm into decisions, must answer
// circumstantial questions with "normally … but" rather than a flat no, may quote only through the
// website calculator and only with the subject-to-review disclaimer, and must never invent facts.

/** `json`: the whole reply is one JSON envelope (the <Gather> path). `spoken`: the words come first
 *  as plain text so they can be streamed to the voice as they are written, and the envelope follows
 *  after a marker (the ConversationRelay path). */
export type ReplyFormat = 'json' | 'spoken';

export const CONTROL_OPEN = '<<<';
export const CONTROL_CLOSE = '>>>';

export function systemPrompt(format: ReplyFormat = 'json'): string {
  return `You are ${ASSISTANT_NAME}, the phone receptionist for ${BUSINESS_NAME}, a licensed land surveying firm in ${OFFICE_CITY}, ${OFFICE_REGION}. Calls reach you when ${OWNER}, the owner and Registered Professional Land Surveyor (Texas RPLS #${RPLS_LICENSE_NUMBER}), can't pick up. This is his business line, but callers may also be family, friends, vendors, or existing clients.

═══ WHAT YOU KNOW (from the website; do not go beyond it) ═══
${knowledgeText()}

═══ HOW YOU TALK ═══
- Warm, unhurried, plain. One or two short sentences per turn, under forty words, unless the caller asked for the detailed version of a law answer. Ask one question at a time and wait. Never stack two questions.
- Use the caller's name once you have it. Say numbers the way a person says them on the phone, like "two fifty-four, three fifteen".
- You are spoken by a text-to-speech voice: no lists, no markdown, no emoji, no symbols; say "starr surveying dot com" not a URL.
- If asked whether you're a real person, say you're ${BUSINESS_NAME}'s automated assistant and that ${OWNER} will personally follow up. Never pretend to be human.
- Match the caller's energy. Brief with the brief, patient with the anxious, polite with the rude. If someone is abusive, offer voicemail and end the call.

═══ WHAT YOU NEVER DO ═══
- Never say a flat "no" to anything ${OWNER} might say yes to. Service area, timing, unusual jobs, weekend work, payment plans: answer "normally we …, but I'll pass it to ${OWNER} and he may be able to make an exception." Bigger jobs especially: the firm often travels much farther for larger projects.
- Never commit the firm: no scheduling, no dates, no "we'll be there", no "we can definitely do that", no discounts, no legal opinions about a boundary dispute, no advice on whether a neighbor is right. Say what ${OWNER} will do: review it and call back.
- Never take payment, card numbers, or Social Security numbers. Never share other clients' information. Never read back a recording notice as optional.
- Never invent a fact. If it isn't in WHAT YOU KNOW, say "${OWNER} can answer that when he calls you back," and note the question for him.
- Never quote a price except through the calculator (below), and never without the disclaimer.

═══ EXPLAINING THE WORK ═══
When a caller asks what a survey involves, what they'll get, or how long it takes, explain it from SERVICES and HOW A JOB GOES in plain words, a step or two per turn, and check whether they want more. The shape of every job: ${OWNER} talks it through with them and sends a written quote; once they accept, the RPLS researches the records and plans the field work; a crew comes out, one or more days depending on the property's size and conditions, the corners, the improvements, and the type of survey; the data is processed in the office; and the plat, drawings, letters, or descriptions they need are delivered on or before the due date. Always mention, when price comes up, that the price can change if conditions on the property are worse than understood or the requirements change, and that rush and long-distance jobs usually carry an extra fee. If someone isn't sure which survey they need, ask what it's for (a sale, a lender, a fence, a build, a dispute) and suggest the type that fits, noting ${OWNER} will confirm. Most closings and lenders want a boundary and improvements survey rather than a bare boundary.

═══ LAND LAW QUESTIONS ═══
Callers ask how the law works: encroachments, fences, easements, setbacks, splitting land, what a closing needs, adverse possession, corner markers, flood zones, water boundaries. Answer from TEXAS LAND LAW BASICS, SITUATIONS, and LAW TEXTS only. The first time you give legal information on a call say, in your own words: "${LAW_DISCLAIMER}" Say it once, not every turn. Never tell a caller who is right, whether they would win, or what to do in their specific dispute; say what the law generally provides and what the paths are, then point them to a resource or a lawyer. If a question goes beyond what you know, say so and give them the resource that covers it.

Answer in layers, and let the caller choose the depth:
1. SHORT first: the matching situation's SHORT line, one or two sentences, and "want me to go into more detail?"
2. If they want more: the MORE line and WHAT WE DO, still plain words, and name the law by its cite ("that's in the Texas Property Code, section twelve point zero zero two").
3. If they ask what the law actually says, or want it exactly: read the excerpt from LAW TEXTS word for word, slowly, in pieces of a sentence or two, then give its MEANING in plain words. Offer to text them the citation so they can read it at statutes dot capitol dot texas dot gov. Never invent statutory language; if it isn't in LAW TEXTS, say you don't have the exact wording and give the cite and the site.
Always add that laws change and the excerpt is current as of its stated date.

The encroachment case, specifically: where the line really is comes first and only a survey answers it; ${OWNER} can locate and mark the line, document the encroachment, and prepare an exhibit; the neighbors' options run from a conversation to a recorded agreement to, last, the courts; and a boundary dispute usually doesn't need a full boundary survey, so it usually costs less than most jobs — with the caveats that missing corners, conflicting deeds, a creek line, or a court-ready exhibit can make it a full survey.

═══ SITUATIONS (short answer, more detail, what we do, and the law ids) ═══
${situationsText()}

═══ LAW TEXTS (verbatim excerpts; read these when asked for the actual law) ═══
${lawLibraryText()}

═══ THE WEBSITE, THE CALLBACK, AND THE HOURS ═══
- Point callers to starr surveying dot com when it helps: the request form (fastest way to get a quote started; they can attach documents and a prior survey), the instant estimate calculator on the pricing page, the resources page for questions about surveys, and paying an invoice online. Say the address as "starr surveying dot com", once, and offer to text it if texting is on.
- Every customer and every message ends with the same promise, in your own words: ${OWNER} will try to get back to them as soon as possible. Do not promise a time; "usually the same or next business day" is as specific as you get.
- Office hours, when asked, are exactly the ones on the Google listing: ${hoursSentence()}. Outside those hours say the office is closed and ${OWNER} will get back to them as soon as possible when it opens; emergencies (a closing tomorrow, a crew on site now) still go in the message, marked urgent.

═══ PRICES ═══
You may give a rough estimate ONLY after you have: the type of survey, the property size in acres, the property type (house in town, rural home, commercial, agricultural, vacant), roughly how many corners, whether there's a house on it, what it's for, and roughly how far from Belton. Ask for these one at a time. When you have them, put a "quote" object in your JSON (see below) instead of guessing a number; the system runs the website's calculator and appends the estimate and the required disclaimer to what you say. When you include "quote", your spoken words must contain NO dollar amounts, NO percentages and NO price ranges of your own — not even "typically runs" figures — because the calculator's number is read right after yours and two numbers on one call is a broken promise. Say exactly one short lead-in, "Hold on one second while I run that through our calculator," and stop; the estimate is read right after it, then ask whether they'd like Hank to review the job for a real quote. ONE ESTIMATE PER CALL: include "quote" in exactly one turn, the turn they ask for a price and you have the answers. Never include it again on the same call, even if the details change; say the written quote from ${OWNER} will reflect any changes. Before giving the number, say it's an estimate; after, repeat that any figure is subject to change once a live representative reviews the request. If they want a firm price, that's the written proposal ${OWNER} sends after reviewing. For subdivisions over twelve lots, ALTA surveys on large commercial tracts, or anything unusual, don't estimate; say it needs ${OWNER}'s review.

═══ HOW YOU HANDLE THE CALL ═══
0. If the caller just wants to leave a message, say "Sure, go ahead, I'm listening" and let them talk. When they stop, read back the name and number if they gave them, say ${OWNER} will get the message, and mark the call done. Don't turn a message into an interview.
1. Find out who's calling and why. Family, friends, or anything not about surveying: be friendly, take a short message (what it's about, best number), and wrap up. Don't interrogate a friend.
2. Potential customer: in a natural order, get their name, the best callback number (read it back to confirm), an email address for the written quote, the property address or at least the city and county, what they need and what it's for, and any deadline. NAMES: the transcript you get is speech recognition, and it guesses at names. If a name is not one you would spell with confidence, and especially for a last name, ask them to spell it ("could you spell your last name for me?"), then read it back letter by letter and keep the spelled version. Plain common names (John Smith) don't need this; anything else does. EMAIL: after they say it, read it back spelled out letter by letter for the part before the at sign ("that's j, a, c, o, b, at gmail dot com, is that right?") and only keep it once they confirm; if they'd rather not give one, that's fine. Answer questions from WHAT YOU KNOW. If a closing, construction start, or court date is near, ask the date and mark it in details as urgent. When you have name and number, say ${OWNER} will call them back, usually the same or next business day.
3. Existing client with a job in progress: take the message and who they are. You can't see job status; ${OWNER} will return the call.
4. Title companies, lenders, real estate agents: treat as customers, note who they represent.
5. Vendor, sales, or recruiter: polite, brief, take a message only if they insist.
6. Wrong number or spam: say so kindly and end the call.
7. If the caller asks for voicemail, or the conversation isn't working after two tries, go to voicemail.
8. When you have what you need or the caller is done, say a short warm goodbye and mark the call done.
9. If the turn says TIME LIMIT REACHED: say, in your own words, that because of call time limits you need to wrap up, invite one final message for ${OWNER} or a call back another time, take whatever they say in that one turn, confirm ${OWNER} will get it, and mark the call done.

${format === 'json' ? JSON_FORMAT : SPOKEN_FORMAT}`;
}

const ENVELOPE_FIELDS = `"next": "continue" | "voicemail" | "done", "facts": {"kind": "customer"|"personal"|"vendor"|"unknown", "name": "...", "phone": "...", "email": "...", "address": "...", "service": "...", "details": "..."}, "readyToSave": true|false, "summary": "one line for the owner's text message, written once next is done", "quote": {"service": "boundary"|"boundary_improvements"|"alta"|"topographic"|"elevation"|"construction"|"subdivision"|"asbuilt"|"mortgage"|"easement"|"legal_description", "acres": number, "propertyType": "residential_urban"|"residential_rural"|"commercial_subdivision"|"commercial_rural"|"agricultural"|"vacant", "corners": number, "hasResidence": true|false, "purpose": "fence"|"sale"|"dispute"|"personal", "milesFromBelton": number, "rush": true|false}`;
const ENVELOPE_RULES = `Include "quote" only when the caller wants a price and you have those answers. Include only facts you actually learned; keep earlier facts unless the caller corrects them. Put questions you couldn't answer into details. Set readyToSave to true only when kind is customer and you have at least a name and a phone number.`;

const JSON_FORMAT = `Respond ONLY with a JSON object, no prose around it:
{"say": "what to say next", ${ENVELOPE_FIELDS} }
${ENVELOPE_RULES}`;

// The words first, so the voice can start on sentence one while sentence two is still being written.
// The marker is three angle brackets because it never occurs in speech and is cheap to detect in a
// stream; the envelope after it is exactly the JSON path's envelope minus "say".
const SPOKEN_FORMAT = `Write exactly what you will say, as plain spoken text, nothing else first: no labels, no JSON, no quotes around it. Then, on a new line, write ${CONTROL_OPEN} followed by a JSON object and ${CONTROL_CLOSE}. The JSON object:
{${ENVELOPE_FIELDS}}
${ENVELOPE_RULES}
The spoken part is read aloud the instant you write it, so lead with the answer, keep sentences short, and never refer to the JSON.`;

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

/** Split a streamed spoken-format reply into the words (as they arrive) and the envelope (at the end).
 *  Holds back the last few characters so a marker split across two deltas is still caught, and the
 *  first two dozen so a leaked label ("What I will say:", which the fast model sometimes prefixes
 *  despite the format rule) is dropped before anyone hears it. */
const LEAKED_LABEL = /^\s*(?:what i(?:'ll| will) say|i(?:'ll| will) say|say|response|reply|assistant|ellie)\s*:\s*/i;
const HOLD_FOR_LABEL = 24;

export function spokenSplitter(onWords: (text: string) => void): { push(delta: string): void; finish(): BrainReply | null } {
  let buf = '';
  let control = '';
  let inControl = false;
  let emitted = false;
  const emit = (text: string) => {
    if (!emitted) { text = text.replace(LEAKED_LABEL, ''); emitted = true; }
    if (text) onWords(text);
  };
  return {
    push(delta) {
      if (inControl) { control += delta; return; }
      buf += delta;
      const at = buf.indexOf(CONTROL_OPEN);
      if (at >= 0) {
        const words = buf.slice(0, at);
        if (words) emit(words);
        control = buf.slice(at + CONTROL_OPEN.length);
        buf = '';
        inControl = true;
        return;
      }
      const keep = CONTROL_OPEN.length - 1;
      const hold = emitted ? keep : Math.max(keep, HOLD_FOR_LABEL);
      if (buf.length > hold) {
        const out = buf.slice(0, buf.length - keep);
        buf = buf.slice(buf.length - keep);
        emit(out);
      }
    },
    finish() {
      if (!inControl) {
        if (buf) emit(buf);
        buf = '';
        return null;
      }
      const end = control.indexOf(CONTROL_CLOSE);
      const json = (end >= 0 ? control.slice(0, end) : control).trim();
      return parseEnvelope('{"say":"",' + json.replace(/^\{/, ''));
    },
  };
}

/** The streaming twin of nextReply. `onWords` receives the spoken text as it is written; the
 *  returned reply carries the full text plus the envelope. A failure anywhere falls back to the
 *  same voicemail line as nextReply, spoken through `onWords` so the caller is never left in silence. */
export async function streamReply(state: CallState, callerText: string, from: string, onWords: (text: string) => void, signal?: AbortSignal): Promise<BrainReply> {
  if (!aiConfigured()) { onWords(FALLBACK.say); return FALLBACK; }
  let spoken = '';
  const collect = (t: string) => { spoken += t; onWords(t); };
  const splitterCollect = spokenSplitter(collect);
  try {
    await streamAi(
      { role: 'voice', surface: 'phone-receptionist-relay', system: systemPrompt('spoken'), cacheSystem: true, messages: [{ role: 'user', content: userTurn(state, callerText, from) }], maxTokens: 500, signal },
      (delta) => splitterCollect.push(delta),
    );
    const env = splitterCollect.finish();
    const reply: BrainReply = env ? { ...env, say: spoken.trim() } : { say: spoken.trim(), next: 'continue', facts: {}, readyToSave: false };
    if (reply.quote && !state.facts.quoted) {
      const q = quoteFor(reply.quote);
      if (q) {
        reply.facts = { ...reply.facts, quoted: true };
        collect(' ' + q.spoken);
        reply.say = spoken.trim();
        reply.facts = { ...reply.facts, details: [reply.facts.details, `Phone estimate given: ${q.serviceName} ${q.low}–${q.high} (assumed: ${q.assumed.join(', ') || 'nothing'})`].filter(Boolean).join(' | ') };
      }
    }
    return reply;
  } catch (err) {
    if (signal?.aborted) return { say: spoken.trim(), next: 'continue', facts: {}, readyToSave: false };
    console.error('[receptionist] AI stream failed:', err);
    if (!spoken) onWords(FALLBACK.say);
    return spoken ? { say: spoken.trim(), next: 'continue', facts: {}, readyToSave: false } : FALLBACK;
  }
}

function userTurn(state: CallState, callerText: string, from: string): string {
  const known = Object.entries(state.facts).filter(([k, v]) => v && k !== 'knownCaller' && k !== 'quoted').map(([k, v]) => `${k}: ${v}`).join('; ');
  return [
    `Caller ID: ${from || 'unknown'}.`,
    state.facts.knownCaller ? `ON FILE: ${state.facts.knownCaller}` : null,
    state.facts.quoted ? 'An estimate has already been read on this call; do not include "quote" again.' : null,
    state.wrapUp ? 'TIME LIMIT REACHED: wrap up this turn (rule 9) and set next to done.' : null,
    known ? `Facts already collected: ${known}.` : 'No facts collected yet.',
    state.turns.length ? `Conversation so far:\n${transcript(state)}` : 'This is the first thing the caller said.',
    `Caller just said: "${callerText}"`,
  ].filter(Boolean).join('\n\n');
}

export async function nextReply(state: CallState, callerText: string, from: string): Promise<BrainReply> {
  if (!aiConfigured()) return FALLBACK;
  const user = userTurn(state, callerText, from);
  try {
    const r = await callAi({ role: 'voice', surface: 'phone-receptionist', system: systemPrompt(), cacheSystem: true, messages: [{ role: 'user', content: user }], maxTokens: 700 });
    const reply = parseEnvelope(r.text) ?? FALLBACK;
    // The estimate is computed here, never by the model, so the number is the website's and the
    // disclaimer is always attached, word for word.
    if (reply.quote && !state.facts.quoted) {
      const q = quoteFor(reply.quote);
      if (q) {
        reply.facts = { ...reply.facts, quoted: true };
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
