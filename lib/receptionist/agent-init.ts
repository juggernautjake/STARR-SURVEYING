// lib/receptionist/agent-init.ts — what the conversational agent is told before it says hello.
//
// Owner, 2026-09-16: "Please try and wire up the call history and make it so that elevenlabs can
// recognize callers if possible. make it as intuitive and natural and robust as possible."
//
// The agent runs on ElevenLabs, so nothing in this process is in the conversation — but ElevenLabs
// will ASK us a question at the start of every call ("conversation initiation client data"): it
// posts the caller's number and waits for a small JSON object of dynamic variables, which it
// substitutes into the system prompt before the first word is spoken. That is the seam. The history
// the relay version gets from ./known-caller.ts now reaches the platform agent the same way, along
// with two other things a person at a front desk would simply know: what time it is and whether the
// office is open, and the number the caller is calling from.
//
// ── THE THREE RULES THIS FILE IS BUILT ON ──────────────────────────────────────────────────────
//
// 1. IT MUST NEVER COST A CALL. This runs in front of every live call. A slow database, a dropped
//    connection, a caller ID we cannot parse — none of them may stop the phone being answered. So
//    every lookup is raced against a short timeout, every failure resolves to the "new caller"
//    answer rather than an error, and the route around this always replies 200 with a usable body.
//    The worst outcome available to this code is an agent that does not know who is calling, which
//    is exactly what it knew yesterday.
//
// 2. IT RECOGNISES A NUMBER, NEVER A PERSON. A phone is not a person: they get lent, inherited,
//    reassigned and answered by spouses. So what goes over the wire is history plus the standing
//    order in `knownCallerLine` — ask who is speaking, do not greet them by name, and never mix an
//    old job into a new one. The agent is told the name so it can RECOGNISE it when the caller
//    offers it, not so it can lead with it.
//
// 3. THE ANSWER IS WRITTEN FOR A MODEL TO ACT ON, NOT FOR A HUMAN TO READ. Each variable reads as
//    an instruction with its facts attached, because a bare fact in a prompt gets treated as
//    something the caller said. "This number has called twice" becomes "…and you must still ask who
//    is speaking."
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { OPENING_HOURS } from '@/lib/seo/business';
import { OWNER_NAME } from './knowledge';
import { digitsOf, knownCallerLine, lookupKnownCaller } from './known-caller';

type Client = Pick<SupabaseClient, 'from'>;

/** What ElevenLabs posts to the initiation webhook. Everything is optional: a browser session has
 *  no caller id, and the field names have changed once already. */
export interface InitRequestBody {
  caller_id?: string | null;
  agent_id?: string | null;
  called_number?: string | null;
  call_sid?: string | null;
}

/** The variables the prompt reads. Names match the `{{placeholders}}` in ./agent-prompt.ts. */
export interface InitVariables {
  caller_history: string;
  caller_number: string;
  office_status: string;
}

/** What the agent is told when the number is not ours to recognise — a new caller, or no caller id
 *  at all (a browser test). Phrased so the agent does not ask a stranger whether they have called
 *  before, which is the thing the owner heard it do on real calls. */
export const NO_HISTORY =
  'CALLER HISTORY: this number has never reached us before, or the number is unknown. Treat this caller as brand new. Do not ask whether they have called before, do not guess a name, and do not refer to any previous call or job. Ask who you are speaking with the way you would ask anyone.';

export const NO_CALLER_NUMBER =
  'The number they are calling from is not available on this call, so ask for a callback number and read it back.';

/** A phone number the way a person says it out loud: "two five four, five five five, one two three
 *  four". The agent reads this back to confirm the callback number, which is the one detail a wrong
 *  digit makes worthless. */
export function spokenNumber(phone: string | null | undefined): string | null {
  const ten = digitsOf(phone);
  if (ten.length !== 10) return null;
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const say = (part: string) => part.split('').map((d) => words[Number(d)]).join(' ');
  return `${say(ten.slice(0, 3))}, ${say(ten.slice(3, 6))}, ${say(ten.slice(6))}`;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Central time, because the office is in Belton and the caller almost always is too. */
function centralNow(now: Date): { day: number; minutes: number; clock: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true, hourCycle: 'h12',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const h12 = Number(get('hour'));
  const minute = Number(get('minute'));
  const pm = get('dayPeriod').toLowerCase().startsWith('p');
  const hour24 = (h12 % 12) + (pm ? 12 : 0);
  return { day, minutes: hour24 * 60 + minute, clock: `${h12}:${String(minute).padStart(2, '0')} ${pm ? 'p.m.' : 'a.m.'}` };
}

/** Whether the office is open right now, and what to say about it. A receptionist who does not know
 *  it is Saturday evening promises things that cannot happen. */
export function officeStatus(now: Date = new Date()): string {
  const { day, minutes, clock } = centralNow(now);
  const hours = OPENING_HOURS[0];
  const open = hours ? Number(hours.opens.split(':')[0]) * 60 + Number(hours.opens.split(':')[1] ?? 0) : 9 * 60;
  const close = hours ? Number(hours.closes.split(':')[0]) * 60 + Number(hours.closes.split(':')[1] ?? 0) : 17 * 60;
  const weekday = day >= 1 && day <= 5;
  const isOpen = weekday && minutes >= open && minutes < close;
  const when = `It is ${DAYS[day]}, ${clock} Central.`;
  if (isOpen) {
    return `${when} The office is OPEN right now. ${OWNER_NAME} is out on a job or on another line, and returns calls as soon as he can — usually the same or next business day. Never promise a time.`;
  }
  const tomorrowIsWorkday = day >= 0 && day <= 4;
  const next = day === 5 || day === 6 ? 'Monday morning' : tomorrowIsWorkday && minutes >= close ? 'tomorrow morning' : 'this morning when the office opens';
  return `${when} The office is CLOSED right now (open weekdays, nine to five Central). Say so naturally if it comes up, and that ${OWNER_NAME} will get back to them ${next}. Never promise a time. If it is urgent — a closing tomorrow, a crew on site now — take the message and say you are marking it urgent for him.`;
}

/** One lookup, raced against the clock. A caller is not kept waiting on our database. */
async function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Everything the agent is told before the call, from a caller id we may or may not have. Never
 *  throws: the caller gets answered even when nothing else works. */
export async function initVariables(client: Client, body: InitRequestBody, now: Date = new Date()): Promise<InitVariables> {
  const callerId = (body.caller_id ?? '').trim();
  const spoken = spokenNumber(callerId);
  let history = NO_HISTORY;
  if (digitsOf(callerId).length === 10) {
    try {
      // `since: now` keeps the call being answered out of its own history — the row for it was
      // written when Twilio dialled us, seconds ago (see ./known-caller.ts).
      const known = await withTimeout(
        lookupKnownCaller(client, callerId, { currentCallSid: body.call_sid ?? null, since: now.toISOString() }),
        2500,
        null,
      );
      history = knownCallerLine(known) ?? NO_HISTORY;
    } catch (err) {
      console.error('[agent-init] caller lookup failed, answering as a new caller:', err);
    }
  }
  return {
    caller_history: history,
    caller_number: spoken
      ? `They are calling from ${spoken}. Use it only to confirm a callback number they have already agreed to — "he'll see the number you're calling from" — never to guess who they are.`
      : NO_CALLER_NUMBER,
    office_status: officeStatus(now),
  };
}

/** The body ElevenLabs expects back. Anything it does not recognise is ignored, so the shape is
 *  kept to exactly what is documented. */
export function initPayload(vars: InitVariables) {
  return { type: 'conversation_initiation_client_data', dynamic_variables: vars };
}

/** The defaults baked into the agent, for a conversation that arrives without the webhook at all —
 *  the browser test bench, or a webhook ElevenLabs could not reach. Without these a missing
 *  variable renders as literal `{{caller_history}}` in the prompt, which is worse than silence. */
export const INIT_PLACEHOLDERS: InitVariables = {
  caller_history: NO_HISTORY,
  caller_number: NO_CALLER_NUMBER,
  office_status: `Office hours are weekdays, nine to five Central. If the caller asks whether you are open, say what the hours are rather than guessing at the time. ${OWNER_NAME} returns calls as soon as he can.`,
};

// ── Who is allowed to ask ────────────────────────────────────────────────────────────────────────
// The answer names people and the properties they called about, so the endpoint cannot be open: a
// stranger could otherwise type numbers into it and learn who has called a surveyor and about what.
//
// The token is DERIVED from a secret this deployment already has, so nothing has to be added to
// Vercel for it to work, and it is a hash rather than the secret itself — reading it out of the
// ElevenLabs configuration tells you nothing you could use anywhere else.
//
// WHY THE TWILIO TOKEN AND NOT CRON_SECRET, which would read better: the token has to be computed
// identically in two places — here, on the server, and in scripts/elevenlabs-agent.mjs, which runs
// on the owner's machine to configure the agent. CRON_SECRET lives in Vercel but not in the local
// .env.local, so the script would derive a different token from the one the route expects, every
// call would arrive unauthenticated, and the agent would quietly treat every caller as new. A
// mismatch that degrades silently is worse than no feature. TWILIO_AUTH_TOKEN is in both places
// because both sides already verify Twilio signatures with it.
const INIT_SALT = 'elevenlabs-conversation-init:v1';

export function initToken(env: Record<string, string | undefined> = process.env): string | null {
  const secret = (env.TWILIO_AUTH_TOKEN ?? '').trim();
  if (!secret) return null;
  return createHash('sha256').update(`${secret}:${INIT_SALT}`).digest('hex').slice(0, 32);
}

export function validInitToken(given: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  const want = initToken(env);
  const got = (given ?? '').trim();
  if (!want || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
