// lib/receptionist/call-verdict.ts — what a finished call turned out to be.
//
// Owner, 2026-10-06: "we are getting a lot of spam callers and robo callers and people who don't
// answer at all … think through all of the types of unwanted calls and how we would recognize them,
// especially after the first call."
//
// Pure: a call row in, a verdict out. Every rule below was read off the live log (140 calls from 51
// numbers, Sep 12 – Oct 6 2026), and the tests replay those calls.
//
//   robocall  the CALLER's side of the line is a recording. The campaign that rang 40-odd times
//             from four rotating numbers always leaves the same fingerprints: "press 9 to opt out",
//             "to speak to an agent, press 2", a toll-free number read out digit by digit ("8 7 7
//             5 5 6 9 2 5 5"), or "your business is not showing correctly on Google".
//   silent    somebody answered — Hank or Ellie — and the caller said nothing at all, for ten
//             seconds or more. 23 such calls came from three numbers; not one ever spoke.
//   spam      a live person selling something (the analysis read it as spam and no recording
//             fingerprint was found).
//   person    a human said something: four or more words on the caller's channel or in a
//             voicemail, or the analysis recognised a customer, vendor or acquaintance.
//   hangup    hung up while it rang, or at the voicemail greeting. Real customers do this all the
//             time, so it counts against nobody.
//   blocked   refused at the door.
//   unknown   anything else — including every case where the evidence is thin. Unknown never
//             counts against a number. When in doubt this file says "unknown", because the cost of
//             wrongly calling a customer silent is a customer sent to voicemail.
//
// `ready` says whether the evidence is in. A call Hank answered is not judged until its transcript
// has arrived (or `final` is passed by the sweep, half an hour later): judging it from an empty
// transcript would make every call silent for the two minutes before the words come back.
import type { PhoneCall } from './calls';

export type CallerVerdict = 'person' | 'silent' | 'robocall' | 'spam' | 'hangup' | 'blocked' | 'unknown';

export interface VerdictResult {
  verdict: CallerVerdict;
  /** One sentence a person can read on the call page. */
  reason: string;
  /** False while the transcript or voicemail transcription is still on its way. */
  ready: boolean;
}

export type VerdictInput = Pick<PhoneCall,
  'answered_by' | 'transcript' | 'voicemail_text' | 'analysis' | 'duration_seconds' | 'recording_duration' | 'transcript_status'
> & { screened_as?: string | null; summary?: string | null; outcome?: string | null };

/** Outcomes where OUR side failed (lib/receptionist/call-outcome.ts) — the caller never had a chance. */
const AGENT_FAILED = new Set(['agent-no-connect', 'agent-ended-early', 'hung-up-before-agent', 'hung-up-while-holding']);

/** How long the answered conversation ran: the recording when there is one (it starts at the
 *  answer), otherwise the whole call. */
function talkSeconds(c: Pick<VerdictInput, 'recording_duration' | 'duration_seconds'>): number {
  return c.recording_duration ?? c.duration_seconds ?? 0;
}

// ── The recording fingerprints ──────────────────────────────────────────────────────────────────
const ROBO_PATTERNS: Array<[RegExp, string]> = [
  [/\bopt[\s-]?out\b/i, 'said "opt out"'],
  [/\bpress\s+(?:\d|one|two|three|nine|zero|star|pound)\b/i, 'said "press" and a key'],
  [/\bto (?:be removed|speak (?:to|with) (?:an? )?(?:agent|representative|live (?:agent|person)))\b/i, 'offered "an agent" or removal'],
  [/\bnot showing (?:up )?correctly on google\b|\bgoogle (?:my )?business (?:listing|profile)\b|\bverify your (?:business )?listing\b/i, 'the Google-listing script'],
  [/\bextended (?:car |auto |vehicle )?warranty\b|\bfinal (?:notice|attempt)\b|\bpre-?approved\b|\b(?:credit card|debt) relief\b/i, 'a known sales script'],
  [/\bthis is (?:a|an) (?:automated|recorded|pre-?recorded|courtesy) (?:call|message)\b/i, 'announced it was a recording'],
];

const NUMBER_WORD = /^(?:\d+|zero|oh|one|two|three|four|five|six|seven|eight|nine)$/i;
const PLEASANTRY = /^(?:thank|you|thanks|hello|hi|bye|goodbye|okay|ok)$/i;

/** The caller's own words: their transcript turns and their voicemail. Bracketed system notes such
 *  as "(Recorded message 1, 42 seconds.)" are the machine describing a recording, not words. */
export function callerWords(c: Pick<VerdictInput, 'transcript' | 'voicemail_text'>): string {
  const turns = (c.transcript ?? [])
    .filter((t) => t.role === 'caller' && t.text && !t.text.trim().startsWith('('))
    .map((t) => t.text.trim());
  return [...turns, (c.voicemail_text ?? '').trim()].filter(Boolean).join(' ');
}

function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9'\s-]+/g, ' ').split(/\s+/).filter(Boolean);
}

/** Why this text is a recording, or null. */
export function roboFingerprint(text: string): string | null {
  if (!text.trim()) return null;
  for (const [re, why] of ROBO_PATTERNS) if (re.test(text)) return why;
  // A phone number read out digit by digit and nothing else of substance: the tail of the
  // opt-out line ("…9 2 5 5. Thank you."), which is often all the recording catches.
  const t = tokens(text);
  const digits = t.filter((w) => NUMBER_WORD.test(w)).length;
  const other = t.filter((w) => !NUMBER_WORD.test(w) && !PLEASANTRY.test(w)).length;
  if (digits >= 4 && other === 0) return 'read out a phone number and nothing else';
  return null;
}

const PERSON_TYPES = new Set(['customer', 'existing_client', 'vendor', 'personal']);

/** Words that are not pleasantries. "Hello? Hello?" is a person who could not hear; it is not a message. */
function substantiveCount(text: string): number {
  return tokens(text).filter((w) => !PLEASANTRY.test(w) && w !== 'uh' && w !== 'um').length;
}

export function judgeCall(c: VerdictInput, opts: { final?: boolean } = {}): VerdictResult {
  const final = opts.final === true;
  if (c.screened_as === 'blocked' || c.answered_by === 'blocked') {
    return { verdict: 'blocked', reason: 'Refused at the door by a block rule.', ready: true };
  }

  const words = callerWords(c);
  const robo = roboFingerprint(words);
  if (robo) return { verdict: 'robocall', reason: `A recording, not a person: the caller's side ${robo}.`, ready: true };

  const type = c.analysis?.caller_type;
  const summary = `${c.analysis?.summary ?? ''} ${c.summary ?? ''}`;
  if (type === 'spam' && /\brobo|\bautomated|\bpre-?recorded|\brecorded (?:message|recording)/i.test(summary)) {
    return { verdict: 'robocall', reason: 'The analysis heard an automated recording.', ready: true };
  }

  const substantive = substantiveCount(words);
  if (type && PERSON_TYPES.has(type)) {
    return { verdict: 'person', reason: `The analysis recognised a ${type.replace('_', ' ')}.`, ready: true };
  }
  if (type === 'spam') return { verdict: 'spam', reason: 'A live sales or nuisance call, by the analysis.', ready: true };
  if (substantive >= 4) {
    return { verdict: 'person', reason: c.voicemail_text ? 'Left a voicemail with real words in it.' : 'The caller spoke.', ready: true };
  }

  const how = c.answered_by;
  const seconds = talkSeconds(c);
  if (how === 'none' || how === null || how === undefined) {
    return { verdict: 'hangup', reason: 'Hung up before anyone answered.', ready: true };
  }
  if (how === 'voicemail') {
    // The words of a voicemail arrive a minute after the call, from Twilio's transcription.
    const recorded = (c.transcript ?? []).some((t) => t.role === 'caller' && /^\(Recorded message/.test(t.text));
    if (recorded && !c.voicemail_text && !final) return { verdict: 'unknown', reason: 'Waiting for the voicemail transcription.', ready: false };
    if (recorded && substantive === 0 && !c.voicemail_text) return { verdict: 'unknown', reason: 'Left a recording that could not be transcribed — listen to it.', ready: true };
    return { verdict: 'hangup', reason: 'Reached the voicemail greeting and left no message.', ready: true };
  }

  // Hank or Ellie answered. Wait for the transcript before calling anybody silent.
  const transcribed = c.transcript_status === 'completed' || (c.transcript ?? []).some((t) => t.role !== 'caller');
  if (!transcribed && !final) return { verdict: 'unknown', reason: 'Waiting for the transcript.', ready: false };
  if (!transcribed) return { verdict: 'unknown', reason: 'No transcript arrived, so there is nothing to judge.', ready: true };
  // ── SILENT, AND ONLY WHEN THE CALLER HAD EVERY CHANCE (fail-safe) ──────────────────────────────
  //
  // Found in the live log while building this: a real customer (254-217-0985, a half-acre plat in
  // Belton) has a "silent" call on Sep 30 — Ellie's leg dropped eight seconds into her greeting,
  // the week the agent was failing. Judged naively, a brand-new customer hitting that bug would be
  // sent to voicemail next time. So silent needs all three: our side did not fail, whoever answered
  // spoke at least twice (a greeting and a "hello?"), and twelve seconds or more went by. Every
  // genuinely silent call in the log clears that easily — they run 17 to 37 seconds of Hank or
  // Ellie asking "hello?" into nothing.
  const answererTurns = (c.transcript ?? []).filter((t) => t.role !== 'caller').length;
  if (c.outcome && AGENT_FAILED.has(c.outcome)) {
    return { verdict: 'unknown', reason: 'Our side of the call failed, so the caller never had a chance.', ready: true };
  }
  // Not one word: "Hi. Hello?" is a person on a bad line, and a person is never screened as silent.
  if (tokens(words).length === 0 && seconds >= 12 && answererTurns >= 2) {
    const who = how === 'owner' ? 'Hank' : 'The receptionist';
    return { verdict: 'silent', reason: `${who} answered and the caller never said a word in ${seconds} seconds.`, ready: true };
  }
  return { verdict: 'unknown', reason: 'Too little was said to tell.', ready: true };
}
