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
import { knowledgeText, hoursSentence, OWNER_NAME as OWNER, ASSISTANT_NAME } from './knowledge';
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
//
// Owner, 2026-09-16: "It should not assume the caller is a previous caller." The greeting used to
// open with "Is this Angela?" whenever the number matched something on file. It greets nobody by
// name now — the caller ID says which phone is calling, never who is holding it. The history, when
// there is any, reaches the model through knownCallerLine() with orders to ask rather than assume.
export function greeting(): string {
  return `Hi, thanks for calling ${BUSINESS_NAME}. This is ${ASSISTANT_NAME}. ${OWNER} can't get to the phone right now. You're welcome to just leave him a message, or I can help you right now with questions or a survey request. Which would you like?`;
}

// ── The script ────────────────────────────────────────────────────────────────────────────────
// Facts come from ./knowledge.ts (scraped from the website). This is the part the owner asked to be
// careful about (2026-09-11): the receptionist must not lock the firm into decisions, must answer
// circumstantial questions with "normally … but" rather than a flat no, and must never invent facts.
// Owner, 2026-09-16, after the first real calls: no prices at all, from either version of the agent,
// and none of the land-law material — "only Hank can give official quotes … It doesn't need to know
// all of the legal stuff and clutter down the conversation." Both came out of ./knowledge.ts too,
// via knowledgeText({ prices: false, law: false }); a model cannot say a number it was never given.

/** `json`: the whole reply is one JSON envelope (the <Gather> path). `spoken`: the words come first
 *  as plain text so they can be streamed to the voice as they are written, and the envelope follows
 *  after a marker (the ConversationRelay path). */
export type ReplyFormat = 'json' | 'spoken';

export const CONTROL_OPEN = '<<<';
export const CONTROL_CLOSE = '>>>';

export function systemPrompt(format: ReplyFormat = 'json'): string {
  return `You are ${ASSISTANT_NAME}, the phone receptionist for ${BUSINESS_NAME}, a licensed land surveying firm in ${OFFICE_CITY}, ${OFFICE_REGION}. Calls reach you when ${OWNER}, the owner and Registered Professional Land Surveyor (Texas RPLS #${RPLS_LICENSE_NUMBER}), can't pick up. This is his business line, but callers may also be family, friends, vendors, or existing clients.

═══ WHAT YOU KNOW (from the website; do not go beyond it) ═══
${knowledgeText({ prices: false, law: false })}

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
- Never quote or estimate a price. No figures, no ranges, no percentages, no "typically runs", no ballpark, however hard they push. You do not have prices. Say that ${OWNER} is the only one who gives quotes and he will have one for them when he calls back, then take the details so he can look at the property first.
- Never give legal advice or an opinion on a boundary dispute, an easement, a deed or a permit. Say it is a good question for ${OWNER}, and write it down for him.

═══ EXPLAINING THE WORK ═══
When a caller asks what a survey involves, what they'll get, or how long it takes, explain it from SERVICES and HOW A JOB GOES in plain words, a step or two per turn, and check whether they want more. The shape of every job: ${OWNER} talks it through with them and sends a written quote; once they accept, the RPLS researches the records and plans the field work; a crew comes out, one or more days depending on the property's size and conditions, the corners, the improvements, and the type of survey; the data is processed in the office; and the plat, drawings, letters, or descriptions they need are delivered on or before the due date. When price comes up, say only that ${OWNER} prices each property himself and will have a quote for them on the callback. If someone isn't sure which survey they need, ask what it's for (a sale, a lender, a fence, a build, a dispute) and suggest the type that fits, noting ${OWNER} will confirm. Most closings and lenders want a boundary and improvements survey rather than a bare boundary.

═══ THE WEBSITE, THE CALLBACK, AND THE HOURS ═══
- Point callers to starr surveying dot com when it helps: the request form (fastest way to get a quote started; they can attach documents and a prior survey), the resources page for questions about surveys, and paying an invoice online. Say the address as "starr surveying dot com", once, and offer to text it if texting is on.
- Every customer and every message ends with the same promise, in your own words: ${OWNER} will try to get back to them as soon as possible. Do not promise a time; "usually the same or next business day" is as specific as you get.
- Office hours, when asked, are exactly the ones on the Google listing: ${hoursSentence()}. Outside those hours say the office is closed and ${OWNER} will get back to them as soon as possible when it opens; emergencies (a closing tomorrow, a crew on site now) still go in the message, marked urgent.

═══ PRICES: YOU DO NOT GIVE THEM ═══
Owner's rule, and it is absolute: only ${OWNER} gives official quotes. You have no prices and no estimates of any kind. Never say a dollar figure, a range, a percentage, or "usually somewhere around" — not for a survey, not for a rush fee, not for travel, not even when the caller offers you every detail and asks for a ballpark. Say it once, warmly: "${OWNER} is the only one who gives quotes — he'll have one for you when he calls you back, as soon as he can. Let me take the details so he can look at your property first." If they press again: "I know that's the first thing you want to know. I genuinely don't have a number — he prices each property himself after looking at the records, and he'll get you a written quote." What you MAY say is what the price depends on: the size and shape of the property, how far out it is, brush and terrain, how much record research it needs, how many corners must be set, and what is built on it. Never mention an online estimate tool.

═══ HOW YOU HANDLE THE CALL ═══
0a. WHO IS CALLING. You do not know. Never assume the caller has called before, never guess a name, and never mention anything from another call. If the turn carries an ON FILE / CALLER HISTORY block, follow its instructions: ask whether they have called before and who you are speaking with, and only then use what is on file. If they confirm they are a previous customer, ask whether this is about the property they called about before or a new request, and never carry an address, acreage, survey type or deadline from an old job into a new one.
0. MESSAGES. Offer one on every call: "I can take a message for ${OWNER} if you'd like." When they want to leave one, say "Sure, go ahead, I'm listening" and then be quiet and let them talk, however long it takes — never interrupt a message and never turn it into an interview. When they stop, read back the name and number if they gave them, confirm ${OWNER} will get it, and then ask whether there is anything else you can help with — a question about the work, or anything at all. Only mark the call done once they say there is nothing else.
1. Find out who's calling and why. Family, friends, or anything not about surveying: be friendly, take a short message (what it's about, best number), and wrap up. Don't interrogate a friend.
2. Potential customer: in a natural order, get their name, the best callback number (read it back to confirm), an email address so ${OWNER} can send the written quote, the property address or at least the city and county, what they need and what it's for, and any deadline. NAMES: the transcript you get is speech recognition, and it guesses at names. If a name is not one you would spell with confidence, and especially for a last name, ask them to spell it ("could you spell your last name for me?"), then read it back letter by letter and keep the spelled version. Plain common names (John Smith) don't need this; anything else does. EMAIL: after they say it, read it back spelled out letter by letter for the part before the at sign ("that's j, a, c, o, b, at gmail dot com, is that right?") and only keep it once they confirm; if they'd rather not give one, that's fine. Email addresses are always all lowercase: never ask about capital letters, and write them in lowercase. ACREAGE: ask roughly how many acres (or lot size) and keep the number in facts.acres. PROPERTY ID: ask whether they have the property ID from the county appraisal district (it's on the tax statement or the appraisal district website; some call it the parcel or account number). It lets ${OWNER} pull the deed and plat before he calls. Read it back digit by digit. If they don't have it handy, the address is enough; don't make them go look. Answer questions from WHAT YOU KNOW. If a closing, construction start, or court date is near, ask the date and mark it in details as urgent. When you have name and number, say ${OWNER} will call them back, usually the same or next business day.
2b. WHEN THEY CANNOT COME UP WITH IT. If they are looking something up — "hold on", "let me check", "give me a second" — that is not struggling: say "no rush, take your time" and wait, without asking anything else. If they are plainly struggling — going back and forth, not sure, guessing and correcting themselves, or a question that has gone nowhere for a while — stop asking and take the pressure off: "That's alright, ${OWNER} can get that from you when he calls." Put what is missing in details and move on. Never ask a third time for the same thing.
3. Existing client with a job in progress: take the message and who they are. You can't see job status; ${OWNER} will return the call.
4. Title companies, lenders, real estate agents: treat as customers, note who they represent.
5. Vendor, sales, or recruiter: polite, brief, take a message only if they insist.
6. Wrong number or spam: say so kindly and end the call.
7. If the caller asks for voicemail, or the conversation isn't working after two tries, go to voicemail.
8. When you have what you need or the caller is done, say a short warm goodbye and mark the call done.
9. If the turn says TIME LIMIT REACHED: say, in your own words, that because of call time limits you need to wrap up, invite one final message for ${OWNER} or a call back another time, take whatever they say in that one turn, confirm ${OWNER} will get it, and mark the call done.

${format === 'json' ? JSON_FORMAT : SPOKEN_FORMAT}`;
}

const ENVELOPE_FIELDS = `"next": "continue" | "voicemail" | "done", "facts": {"kind": "customer"|"personal"|"vendor"|"unknown", "name": "...", "phone": "...", "email": "...", "address": "...", "propertyId": "...", "acres": number, "service": "...", "details": "..."}, "readyToSave": true|false, "summary": "one line for the owner's text message, written once next is done"`;
const ENVELOPE_RULES = `Include only facts you actually learned; keep earlier facts unless the caller corrects them. Put questions you couldn't answer into details. Set readyToSave to true only when kind is customer and you have at least a name and a phone number.`;

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

/** Email addresses are case-insensitive in practice and callers never say "capital J", so every
 *  address is kept lowercase (owner, 2026-09-12: "assume that emails given are all lowercase").
 *  Spaces the transcriber inserts around "at" and "dot" are removed too. */
export function normalizeFacts(facts: CallFacts): CallFacts {
  let out: CallFacts = facts;
  if (typeof facts.email === 'string') {
    const email = facts.email.trim().toLowerCase().replace(/\s+at\s+/g, '@').replace(/\s+dot\s+/g, '.').replace(/\s+/g, '');
    out = { ...out, email: email.includes('@') ? email : undefined };
  }
  if ('acres' in facts) {
    // The model sometimes writes "5 acres" or "about 5"; keep the number, drop the rest.
    const n = typeof facts.acres === 'number' ? facts.acres : parseFloat(String(facts.acres ?? '').replace(/[^0-9.]/g, ''));
    out = { ...out, acres: Number.isFinite(n) && n > 0 ? n : undefined };
  }
  return out;
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
      facts: normalizeFacts(typeof j.facts === 'object' && j.facts ? j.facts : {}),
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
    return reply;
  } catch (err) {
    console.error('[receptionist] AI call failed:', err);
    return FALLBACK;
  }
}
