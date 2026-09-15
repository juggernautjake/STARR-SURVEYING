// lib/receptionist/answering-machine.ts — the simple version of the receptionist (owner, 2026-09-15).
//
// "Our voice AI agent is pretty bad. For now I want there to be two versions … one that works simply
//  like an answering machine where it answers and asks the caller to leave a message with their name
//  and number and that we will get back to them as soon as possible. Then they can leave their message
//  and it will be recorded, and then the AI agent will ask if there is anything else, and if not it
//  will tell them to have a good day and goodbye."
//
// No model anywhere in this path, on purpose: every word is fixed, so it cannot say anything weird.
// The one decision it makes — did the caller answer "anything else?" with no, yes, or something they
// want passed along — is a plain word match (`classifyAnythingElse`), tested line by line.
//
//   greeting ─▶ <Record> message ─▶ "Is there anything else?" ─┬─ no / silence ─▶ goodbye, hang up
//                                                              ├─ yes ─▶ "go ahead after the tone" ─▶ <Record> …
//                                                              └─ anything else they said ─▶ noted ─▶ "anything else?"
//
// The steps are one route (app/api/twilio/receptionist/machine) told where it is by the query string:
// `n` = messages recorded so far, `ask` = how many times "anything else?" has been asked. Recordings
// are transcribed and the owners told through the existing voicemail route (`?part=`), exactly as a
// voicemail always was.
import { BUSINESS_NAME } from '@/lib/seo/business';
import { gather, hangup, record, say, twiml } from '@/lib/twilio/twiml';
import { sayVoiceFor } from './voices';

/** At most this many recorded messages on one call; the next "yes" is thanked and ended. */
export const MACHINE_MAX_MESSAGES = 3;
/** At most this many "anything else?" questions on one call. */
export const MACHINE_MAX_ASKS = 4;
/** Longest single message, in seconds. Twilio's transcription covers up to two minutes. */
export const MACHINE_MESSAGE_SECONDS = 120;

export const MACHINE_PATH = '/api/twilio/receptionist/machine';

// ── What it says ────────────────────────────────────────────────────────────────────────────────
export const MACHINE_LINES = {
  greeting: `Hi, thanks for calling ${BUSINESS_NAME}. We can't get to the phone right now. Please leave a message with your name and phone number after the tone, and we'll get back to you as soon as possible.`,
  anythingElse: 'Thank you. Is there anything else?',
  noMessageHeard: "I didn't hear a message. Would you like to leave one?",
  goAhead: 'Okay, go ahead after the tone.',
  noted: "Got it, I'll pass that along. Is there anything else?",
  goodbye: `Thank you for calling ${BUSINESS_NAME}. Have a good day. Goodbye.`,
  enough: `We have your messages, and we'll get back to you as soon as possible. Thank you for calling ${BUSINESS_NAME}. Have a good day. Goodbye.`,
} as const;

// ── "Is there anything else?" ───────────────────────────────────────────────────────────────────
export type AnythingElse = 'no' | 'yes' | 'more';

const normalize = (s: string): string =>
  s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Whole-answer matches only, after trailing pleasantries are removed — so "no, but also my address is…"
// is NOT a no, and "nope, thanks, bye" is.
const TRAILING = /(?:\s+(?:thank you|thanks|thank you very much|thanks a lot|bye|goodbye|bye bye|have a good (?:day|one|night)|you too|ma'am|sir|appreciate it))+$/;
const NO = new Set([
  'no', 'nope', 'nah', 'no no', 'no thank you', 'no thanks', 'no sir', "no ma'am", 'not really', 'no that is it',
  "no that's it", "no that's all", 'no that is all', "that's it", 'that is it', "that's all", 'that is all',
  'nothing', 'nothing else', 'no nothing else', "i'm good", 'i am good', "i'm fine", "i'm all set", "i'm set",
  'all set', 'all good', "we're good", "that's everything", 'that is everything', 'no i think that is it',
  "no i think that's it", "i think that's it", "i think that's all", "no i'm good", "no that's everything",
  'thank you', 'thanks', 'goodbye', 'bye', 'bye bye', 'okay', 'ok', 'okay thank you', 'alright', 'all right',
  "no that'll do", "that'll do", 'uh no', 'um no', 'no not at all', 'nope that is it', "nope that's it",
]);
const YES = new Set([
  'yes', 'yeah', 'yep', 'yup', 'sure', 'uh huh', 'mhm', 'mm hmm', 'yes please', 'yes i do', 'yeah i do', 'i do',
  'one more thing', 'yes one more thing', 'yeah one more thing', 'actually yes', 'actually yeah', 'yes sir', "yes ma'am",
  'i have another message', 'another message', 'can i leave another message', 'yes i would', 'yeah i would',
  'i would', 'i would like to', "i'd like to", 'yes i would like to', "yes i'd like to", 'oh yes', 'oh yeah',
  'hold on', 'wait', 'yes wait', 'one more', 'real quick', 'yes real quick',
]);

/** How the caller answered "is there anything else?": done, wants to record again, or said the thing. */
export function classifyAnythingElse(heard: string | null | undefined): AnythingElse {
  const t = normalize(heard ?? '');
  if (!t) return 'no';
  const core = t.replace(TRAILING, '').trim() || t;
  if (NO.has(core) || NO.has(t)) return 'no';
  if (YES.has(core) || YES.has(t)) return 'yes';
  return 'more';
}

// ── The TwiML for each step ─────────────────────────────────────────────────────────────────────
function stepUrl(step: 'recorded' | 'else', n: number, ask: number, voiceId?: string | null): string {
  // The voice rides in the step URLs, so a test call keeps the voice it was started with without a
  // settings read on every step (and Twilio signs the query, so it cannot be tampered with).
  return `${MACHINE_PATH}?step=${step}&n=${n}&ask=${ask}${voiceId ? `&v=${encodeURIComponent(voiceId)}` : ''}`;
}

/** Record message number `n + 1`. Its transcript lands on the voicemail route as `part=n+1`. */
export function recordMessage(n: number, ask: number, voiceId?: string | null): string {
  return record(stepUrl('recorded', n, ask, voiceId), `/api/twilio/receptionist/voicemail?part=${n + 1}`, MACHINE_MESSAGE_SECONDS);
}

/** The greeting and the first recording, as TwiML verbs (a test call puts the recording notice first). */
export function machineOpening(voiceId?: string | null): string {
  return say(MACHINE_LINES.greeting, sayVoiceFor(voiceId)) + recordMessage(0, 0, voiceId);
}

/** What a caller hears when the answering machine picks up. */
export function machineStart(voiceId?: string | null): string {
  return twiml(machineOpening(voiceId));
}

/** After a recording ends: ask "anything else?" (or say nothing was heard and offer again). */
export function afterRecording(savedCount: number, heardSomething: boolean, ask: number, voiceId?: string | null): string {
  const prompt = heardSomething ? MACHINE_LINES.anythingElse : MACHINE_LINES.noMessageHeard;
  // A caller who says nothing to "anything else?" is done: Gather posts an empty result, which ends the call.
  return twiml(gather(stepUrl('else', savedCount, ask + 1, voiceId), prompt, { timeout: 5, voice: sayVoiceFor(voiceId) }));
}

export type ElseOutcome =
  | { kind: 'goodbye'; line: string; twiml: string }
  | { kind: 'record'; line: string; twiml: string }
  | { kind: 'noted'; line: string; twiml: string };

/** The answer to "anything else?" → what happens next. Pure, so every branch is tested. */
export function afterAnythingElse(heard: string | null | undefined, n: number, ask: number, voiceId?: string | null): ElseOutcome {
  const answer = classifyAnythingElse(heard);
  const voice = sayVoiceFor(voiceId);
  if (answer === 'no' || ask >= MACHINE_MAX_ASKS) {
    const line = answer !== 'no' && n > 0 ? MACHINE_LINES.enough : MACHINE_LINES.goodbye;
    return { kind: 'goodbye', line, twiml: twiml(say(line, voice), hangup()) };
  }
  if (answer === 'yes') {
    if (n >= MACHINE_MAX_MESSAGES) return { kind: 'goodbye', line: MACHINE_LINES.enough, twiml: twiml(say(MACHINE_LINES.enough, voice), hangup()) };
    return { kind: 'record', line: MACHINE_LINES.goAhead, twiml: twiml(say(MACHINE_LINES.goAhead, voice), recordMessage(n, ask, voiceId)) };
  }
  // They said the extra thing out loud instead of saying yes: keep it (the route writes it to the
  // call's transcript) and ask again.
  return { kind: 'noted', line: MACHINE_LINES.noted, twiml: twiml(gather(stepUrl('else', n, ask + 1, voiceId), MACHINE_LINES.noted, { timeout: 5, voice })) };
}
