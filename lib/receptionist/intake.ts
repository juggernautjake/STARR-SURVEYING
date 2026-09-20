// lib/receptionist/intake.ts — deciding what still needs asking, after the caller has spoken.
//
// Owner, 2026-09-21: "caller calls, Hank doesn't answer, it goes to voice mail, the custom AI voice
// mail agent takes the call, greets the caller in a friendly manner, apologizes that no one could
// take the call, and asks the caller to leave a message and to stay on the line after for a few
// short questions about their call. Then they leave their message, the AI takes down any useful
// information and then determines what information is still needed."
//
// And, on the thing that makes this worth building rather than a form read aloud:
//
//   "the AI should pick up as much of this info from the caller's message as possible to avoid
//    redundancy … Like, if the customer says it is an open lot in Killeen, then that means we have
//    the area, and we know that there are no structures on it, so the AI agent would not ask if
//    there are structures on it, but it might ask for the address in killeen."
//
// ── THE WHOLE VALUE IS IN WHAT IT DOES NOT ASK ──────────────────────────────────────────────────
//
// Anyone can read a list of twelve questions down a phone. The caller who just explained, in their
// own words, that they need a boundary survey on a vacant lot off Stan Schlueter in Killeen will
// hang up on question four, and they will be right to. Every question this asks has to be one they
// have not already answered.
//
// So each field carries a CONFIDENCE, not just a value, and three of them are different situations:
//
//   known    they said it and it was understood — never ask
//   unsure   they said it and it might have been misheard — ask them to confirm or spell it
//   missing  they never said it — ask for it
//
// A field can also be `implied`: settled by something else they said rather than by being asked.
// "Open lot" settles `structures`. That is the mechanism behind the owner's Killeen example, and it
// is deliberately conservative — an implication that is wrong is worse than a question that is
// redundant, because the wrong one ends up in the estimate.
//
// ── WHY NAMES GET THEIR OWN TREATMENT ───────────────────────────────────────────────────────────
//
// "If it is not confident that it understood their first and last name, then it will ask them to
// respell the name that it is not sure about. If their first name is 'John' and their last name is
// something weird, then the AI agent will ask how they spell their last name. If it is not sure how
// they spell their entire name, then it will ask them to spell their entire name."
//
// So first and last name are separate fields with separate confidence, and the question that gets
// asked depends on WHICH of the two is doubtful. Asking a John Smith to spell "John" is the kind of
// small insult that makes somebody decide the machine is stupid.
//
// Pure. No model, no network, no clock of its own. Tested in __tests__/twilio/intake.test.ts.

// ════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT WE WANT TO KNOW
// ════════════════════════════════════════════════════════════════════════════════════════════════

export type FieldId =
  | 'firstName' | 'lastName' | 'phone' | 'email'
  | 'callerRole' | 'propertyAddress' | 'acreage' | 'structures'
  | 'surveyType' | 'surveyPurpose' | 'documents';

export type Confidence = 'known' | 'unsure' | 'missing' | 'implied' | 'refused';

export interface FieldValue {
  value?: string;
  confidence: Confidence;
  /** Where it came from, for the call record. `implied` says which phrase settled it. */
  source?: string;
}

export type IntakeFacts = Partial<Record<FieldId, FieldValue>>;

/**
 * The order questions are asked in, and what each one is worth.
 *
 * Contact details come first because a call that ends early is still useful if we can ring back,
 * and useless if we cannot. Everything after that is about the job.
 */
export interface FieldSpec {
  id: FieldId;
  /** Higher is asked sooner. */
  priority: number;
  /** Asked when the field is missing entirely. */
  ask: string;
  /** Asked when we have something but might have misheard it. `{value}` is what we think we heard. */
  confirm?: string;
  /** True when losing this field would cost us the ability to follow up at all. */
  essential?: boolean;
}

export const FIELDS: Record<FieldId, FieldSpec> = {
  // ── being able to reach them back ────────────────────────────────────────────────────────────
  firstName: {
    id: 'firstName', priority: 100, essential: true,
    ask: 'Can I get your first name?',
    confirm: 'I have your first name as {value} — did I get that right?',
  },
  lastName: {
    id: 'lastName', priority: 95, essential: true,
    ask: 'And your last name?',
    confirm: 'And your last name, I heard {value} — could you spell that for me?',
  },
  phone: {
    id: 'phone', priority: 90, essential: true,
    ask: "What's the best number to reach you on?",
    confirm: 'Is {value} the best number to reach you on?',
  },
  email: {
    id: 'email', priority: 85,
    ask: 'Is there a good email address we can send the estimate to?',
    confirm: 'I have your email as {value} — could you spell that out for me, just so I have it right?',
  },

  // ── the property ─────────────────────────────────────────────────────────────────────────────
  propertyAddress: {
    id: 'propertyAddress', priority: 80, essential: true,
    ask: "What's the address of the property?",
    confirm: 'The property is at {value} — is that right?',
  },
  acreage: {
    id: 'acreage', priority: 60,
    ask: 'Roughly how big is the property?',
  },
  structures: {
    id: 'structures', priority: 50,
    ask: 'Are there any structures on the property?',
  },

  // ── the work ─────────────────────────────────────────────────────────────────────────────────
  surveyType: {
    id: 'surveyType', priority: 75,
    ask: 'Do you know what kind of survey you need?',
    confirm: 'So that would be a {value} — is that right?',
  },
  surveyPurpose: {
    id: 'surveyPurpose', priority: 70,
    ask: 'And what do you need the survey for?',
  },
  callerRole: {
    id: 'callerRole', priority: 65,
    ask: 'And are you the property owner, or are you calling on behalf of someone — a title company, a realtor, something like that?',
  },
  documents: {
    id: 'documents', priority: 55,
    ask: 'Do you have any paperwork for the property — a plat, a deed, a previous survey?',
  },
};

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SPELLING: WHEN TO ASK, AND FOR WHICH PART
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Names common enough that a speech transcript of them is almost certainly right.
 *
 * Not a completeness list and not meant to be — it exists only to STOP a question. A name that is
 * not here is not unusual, it is merely not on a short list, so the worst case is one extra polite
 * question. A name that IS here is one we will not ask about, so everything on it has to be a name
 * where mishearing is genuinely unlikely.
 *
 * The asymmetry is the point: being absent costs a question, being wrongly present costs a wrong
 * name on a quote.
 */
export const COMMON_FIRST_NAMES = new Set([
  'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph', 'thomas', 'charles',
  'christopher', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua',
  'kenneth', 'kevin', 'brian', 'george', 'timothy', 'ronald', 'jason', 'edward', 'jeffrey', 'ryan',
  'jacob', 'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon',
  'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica', 'sarah', 'karen',
  'lisa', 'nancy', 'betty', 'margaret', 'sandra', 'ashley', 'kimberly', 'emily', 'donna', 'michelle',
  'carol', 'amanda', 'dorothy', 'melissa', 'deborah', 'stephanie', 'rebecca', 'laura', 'sharon', 'cynthia',
  'amy', 'kathleen', 'angela', 'shirley', 'anna', 'brenda', 'pamela', 'nicole', 'emma', 'samantha',
  'katherine', 'christine', 'helen', 'debra', 'rachel', 'carolyn', 'janet', 'catherine', 'maria', 'heather',
  'bob', 'bill', 'jim', 'mike', 'dave', 'steve', 'tom', 'joe', 'dan', 'chris', 'matt', 'rob', 'rick', 'ken',
]);

/** Surnames common enough not to need spelling. Same asymmetry as the first names. */
export const COMMON_LAST_NAMES = new Set([
  'smith', 'johnson', 'williams', 'brown', 'jones', 'garcia', 'miller', 'davis', 'rodriguez', 'martinez',
  'hernandez', 'lopez', 'gonzalez', 'wilson', 'anderson', 'thomas', 'taylor', 'moore', 'jackson', 'martin',
  'lee', 'perez', 'thompson', 'white', 'harris', 'sanchez', 'clark', 'ramirez', 'lewis', 'robinson',
  'walker', 'young', 'allen', 'king', 'wright', 'scott', 'torres', 'nguyen', 'hill', 'flores',
  'green', 'adams', 'nelson', 'baker', 'hall', 'rivera', 'campbell', 'mitchell', 'carter', 'roberts',
]);

/**
 * Whether a heard name should be spelled back.
 *
 * A name is left alone when the transcript was confident AND the name is one a transcriber gets
 * right. Either condition failing is enough to ask, because the two failure modes compound: an
 * unusual name is exactly the one a low-confidence transcript gets wrong.
 */
export function needsSpelling(
  name: string | undefined,
  transcriptConfident: boolean,
  common: Set<string>,
): boolean {
  const n = (name ?? '').trim().toLowerCase();
  if (!n) return false;                       // nothing heard: that is `missing`, not `unsure`
  if (!transcriptConfident) return true;
  // A hyphenated or two-part name is a spelling question even when both halves are ordinary:
  // "Mary-Jo" and "Mary Jo" and "Maryjo" are three different people on a quote.
  if (/[\s'\-]/.test(n)) return true;
  return !common.has(n);
}

/**
 * The one question that covers both halves of a name, when both are doubtful.
 *
 * Asking "how do you spell your first name?" and then "how do you spell your last name?" is two
 * questions where one will do, and on a seven-minute budget that matters.
 */
export function nameSpellingQuestion(facts: IntakeFacts): string | null {
  const first = facts.firstName;
  const last = facts.lastName;
  const firstDoubtful = first?.confidence === 'unsure';
  const lastDoubtful = last?.confidence === 'unsure';

  if (firstDoubtful && lastDoubtful) {
    const whole = [first?.value, last?.value].filter(Boolean).join(' ');
    return whole
      ? `I want to make sure I have your name right — I heard ${whole}. Could you spell that out for me?`
      : 'Could you spell your name out for me?';
  }
  if (lastDoubtful) {
    return last?.value
      ? `I have your last name as ${last.value} — could you spell that for me?`
      : 'Could you spell your last name for me?';
  }
  if (firstDoubtful) {
    return first?.value
      ? `I have your first name as ${first.value} — could you spell that for me?`
      : 'Could you spell your first name for me?';
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT ONE ANSWER SETTLES ABOUT ANOTHER
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Phrases that settle `structures` without anyone being asked.
 *
 * The owner's example: "if the customer says it is an open lot in Killeen … we know that there are
 * no structures on it, so the AI agent would not ask if there are structures on it".
 *
 * Kept narrow on purpose. "Vacant land" means no structures. "Empty" on its own does not — an empty
 * house is empty. An implication that is wrong reaches the estimate, which is worse than a question
 * that is merely redundant, so anything ambiguous is left to be asked.
 */
const VACANT_PHRASES = [
  'open lot', 'empty lot', 'vacant lot', 'vacant land', 'raw land', 'bare land', 'undeveloped',
  'nothing on it', 'nothing built', 'no structures', 'no buildings', 'nothing on the property',
  'unimproved', 'just land', 'only land', 'bare lot',
];

/** Phrases that say there IS something on it, which also settles the field. */
const IMPROVED_PHRASES = [
  'house', 'home', 'barn', 'shed', 'garage', 'building', 'structure', 'mobile home', 'trailer',
  'shop', 'carport', 'fence line', 'driveway', 'apartment', 'duplex', 'warehouse',
];

export interface Implication {
  field: FieldId;
  value: string;
  /** The phrase that settled it, quoted back in the call record so a wrong one can be traced. */
  because: string;
}

/**
 * What the caller's own words already settle.
 *
 * Runs over the voicemail transcript and over every later answer, because "it's just a field behind
 * my house" settles `structures` just as well on question six as it would have in the message.
 */
/**
 * Whether the word at `at` is inside a negation.
 *
 * "There is no house on it but there is an old barn" mentions a house and does not have one. Without
 * this the first match wins and the field is settled as "house" — the exact opposite of what was
 * said, and settled confidently enough that nobody is ever asked.
 *
 * Only the few words immediately before are considered. A negation further away than that usually
 * belongs to a different clause, and reaching for it produces the opposite error.
 */
function negated(haystack: string, at: number): boolean {
  const before = haystack.slice(Math.max(0, at - 24), at);
  return /\b(no|not|non|never|without|isn't|aren't|wasn't|weren't|don't|doesn't)\s+(\w+\s+){0,2}$/.test(before);
}

export function impliedFrom(text: string): Implication[] {
  const t = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  const out: Implication[] = [];

  const vacant = VACANT_PHRASES.find((p) => t.includes(p));

  // Every mention is looked at, not just the first, and a negated one does not count. That is what
  // lets "no house but there is an old barn" settle on the barn rather than on the house.
  let improved: string | undefined;
  for (const phrase of IMPROVED_PHRASES) {
    const at = t.indexOf(` ${phrase}`);
    if (at >= 0 && !negated(t, at + 1)) { improved = phrase; break; }
  }

  // Both present means the sentence is doing something this function cannot read — "a vacant lot
  // with a shed on it" — so neither is claimed and the question gets asked. A wrong implication
  // reaches the estimate; a redundant question costs eight seconds.
  if (vacant && !improved) out.push({ field: 'structures', value: 'none', because: vacant });
  else if (improved && !vacant) out.push({ field: 'structures', value: improved, because: improved });

  return out;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE SHAPE OF THE CALL
// ════════════════════════════════════════════════════════════════════════════════════════════════

export type Phase =
  | 'greeting'     // hello, sorry we missed you, leave a message and stay on the line
  | 'message'      // they are leaving it
  | 'consent'      // thank you, someone will call back — would you answer a few questions?
  | 'interview'    // the questions, one at a time
  | 'documents'    // where to send a plat or deed
  | 'questions'    // anything you want to ask us?
  | 'goodbye'
  | 'ended';

/** The whole call's budget. Owner: "Calls should last no more than 7 minutes." */
export const CALL_BUDGET_MS = 7 * 60 * 1000;

/**
 * When to start winding down.
 *
 * Ninety seconds before the cap, not at it. Owner: "If we get to the 7 minute mark on a call, the
 * AI should try to wind the call down and say goodbye in a friendly way" — and a wind-down that
 * begins at the cap is a hang-up, because the goodbye itself takes time and the caller may be
 * mid-sentence. Starting early is what makes the ending friendly rather than abrupt.
 */
export const WIND_DOWN_MS = CALL_BUDGET_MS - 90 * 1000;

export interface IntakeState {
  phase: Phase;
  facts: IntakeFacts;
  /** Epoch ms when the call was answered. */
  startedAt: number;
  /** Fields already asked about, so nothing is asked twice even if the answer did not land. */
  asked: FieldId[];
  /** They said no to the questions. Everything after consent is skipped. */
  declined?: boolean;
  /** Their own questions have been invited. */
  invitedQuestions?: boolean;
}

export function elapsedMs(state: IntakeState, now: number): number {
  return Math.max(0, now - state.startedAt);
}

export function shouldWindDown(state: IntakeState, now: number): boolean {
  return elapsedMs(state, now) >= WIND_DOWN_MS;
}

export function isOverBudget(state: IntakeState, now: number): boolean {
  return elapsedMs(state, now) >= CALL_BUDGET_MS;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT TO SAY NEXT
// ════════════════════════════════════════════════════════════════════════════════════════════════

export interface NextStep {
  /** What the agent should say. */
  say: string;
  /** The phase the call moves into once it has been said. */
  phase: Phase;
  /** The field this question is about, when it is one. */
  field?: FieldId;
  /** True when the call should hang up after speaking. */
  end?: boolean;
}

/** Fields worth asking about, most valuable first, excluding anything already settled or asked. */
export function openFields(state: IntakeState): FieldSpec[] {
  return Object.values(FIELDS)
    .filter((f) => {
      const got = state.facts[f.id];
      if (got && (got.confidence === 'known' || got.confidence === 'implied' || got.confidence === 'refused')) return false;
      // A field already asked about is not asked again, even if the answer did not land. Pressing
      // somebody twice for the same thing is how a helpful call turns into an interrogation.
      if (state.asked.includes(f.id)) return false;
      return true;
    })
    .sort((a, b) => b.priority - a.priority);
}

/**
 * The next thing to say.
 *
 * `now` is passed in rather than read from the clock so the whole call is a pure function of its
 * inputs, and a seven-minute wind-down is something a test can reach in a millisecond.
 */
export function nextStep(state: IntakeState, now: number): NextStep {
  // ── the clock wins over everything ──────────────────────────────────────────────────────────
  //
  // Checked before the phase machine, not inside it, so there is no path through the interview
  // that can outrun the budget. An agent that is mid-question when the cap arrives still ends.
  if (state.phase !== 'ended' && isOverBudget(state, now)) {
    return { say: OVER_BUDGET_LINE, phase: 'ended', end: true };
  }

  switch (state.phase) {
    case 'greeting':
      return { say: GREETING, phase: 'message' };

    case 'message':
      // They have left it. Thank them, promise the call back, then ask permission for the rest —
      // the owner was specific that the reassurance comes BEFORE the questions, so somebody who
      // hangs up here has still been told what happens next.
      return { say: AFTER_MESSAGE, phase: 'consent' };

    case 'consent': {
      if (state.declined) return { say: DECLINED_GOODBYE, phase: 'ended', end: true };
      if (shouldWindDown(state, now)) return { say: WIND_DOWN_LINE, phase: 'ended', end: true };
      return firstQuestion(state, now);
    }

    case 'interview': {
      if (shouldWindDown(state, now)) return { say: WIND_DOWN_LINE, phase: 'ended', end: true };
      return firstQuestion(state, now);
    }

    case 'documents':
      if (shouldWindDown(state, now)) return { say: WIND_DOWN_LINE, phase: 'ended', end: true };
      return { say: ANY_QUESTIONS, phase: 'questions' };

    case 'questions':
      return { say: GOODBYE, phase: 'ended', end: true };

    case 'goodbye':
    case 'ended':
    default:
      return { say: GOODBYE, phase: 'ended', end: true };
  }
}

/** The next open question, or the move to the documents step when there are none left. */
function firstQuestion(state: IntakeState, _now: number): NextStep {
  // A doubtful name is handled before anything else, and as ONE question covering both halves.
  const spelling = nameSpellingQuestion(state.facts);
  if (spelling && !state.asked.includes('lastName')) {
    const field: FieldId = state.facts.lastName?.confidence === 'unsure' ? 'lastName' : 'firstName';
    return { say: spelling, phase: 'interview', field };
  }

  const open = openFields(state);
  if (open.length === 0) return { say: documentsLine(state), phase: 'documents' };

  const spec = open[0];
  const got = state.facts[spec.id];
  if (got?.confidence === 'unsure' && spec.confirm && got.value) {
    return { say: spec.confirm.replace('{value}', got.value), phase: 'interview', field: spec.id };
  }
  return { say: spec.ask, phase: 'interview', field: spec.id };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE FIXED LINES
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// Written out here rather than generated, because these are the sentences every caller hears and
// they should be reviewable in one place by somebody who does not read code. Business name, email
// and website are substituted at the edge (see `intakeLines`), so this module stays pure.

export const GREETING_TEMPLATE =
  "Hi, thanks for calling {business}. I'm sorry, nobody's able to pick up right now. "
  + "If you'd like to leave a message, go ahead after the tone — and if you can stay on the line "
  + "afterwards, I have a few short questions that'll help us get back to you faster.";

export const AFTER_MESSAGE_TEMPLATE =
  "Thank you — I've got that, and someone will get back to you as soon as they can. "
  + "Would you mind if I asked you a few quick questions about the job?";

export const DOCUMENTS_TEMPLATE =
  'If you have a plat, a deed, or a previous survey, emailing it to {email} — or uploading it on '
  + '{website} — will let us give you a much more accurate estimate.';

export const NO_DOCUMENTS_TEMPLATE =
  "That's no problem. If you do come across a plat or a deed later, you can email it to {email} "
  + 'or upload it at {website}, and we can tighten up the estimate.';

export const ANY_QUESTIONS = 'Is there anything you wanted to ask me before I let you go?';

export const GOODBYE_TEMPLATE =
  "Thanks again for calling {business}. I'll get all of this to {owner}, and someone will be in "
  + 'touch soon. Have a good day.';

export const DECLINED_GOODBYE_TEMPLATE =
  "That's no problem at all. I've got your message and someone will get back to you soon. "
  + 'Have a good day.';

export const WIND_DOWN_TEMPLATE =
  "I want to be respectful of your time, so I'll stop there. I'll get everything you've told me to "
  + '{owner}, and someone will be in touch soon. Have a good day.';

export const OVER_BUDGET_TEMPLATE =
  "I've taken up enough of your time — I'll get all of this to {owner} and someone will be in touch. "
  + 'Have a good day.';

// Filled in by `intakeLines` at the call edge. Defaults keep this module usable on its own.
let GREETING = GREETING_TEMPLATE;
let AFTER_MESSAGE = AFTER_MESSAGE_TEMPLATE;
let ANY_QUESTIONS_LINE = ANY_QUESTIONS;
let GOODBYE = GOODBYE_TEMPLATE;
let DECLINED_GOODBYE = DECLINED_GOODBYE_TEMPLATE;
let WIND_DOWN_LINE = WIND_DOWN_TEMPLATE;
let OVER_BUDGET_LINE = OVER_BUDGET_TEMPLATE;
let DOCUMENTS_HAVE = DOCUMENTS_TEMPLATE;
let DOCUMENTS_NONE = NO_DOCUMENTS_TEMPLATE;

export interface IntakeVocabulary {
  business: string;
  owner: string;
  email: string;
  website: string;
}

/** Substitute the business's own details into every fixed line. Called once, at the edge. */
export function configureIntakeLines(v: IntakeVocabulary): void {
  const fill = (t: string) => t
    .replace(/\{business\}/g, v.business)
    .replace(/\{owner\}/g, v.owner)
    .replace(/\{email\}/g, v.email)
    .replace(/\{website\}/g, v.website);
  GREETING = fill(GREETING_TEMPLATE);
  AFTER_MESSAGE = fill(AFTER_MESSAGE_TEMPLATE);
  ANY_QUESTIONS_LINE = fill(ANY_QUESTIONS);
  GOODBYE = fill(GOODBYE_TEMPLATE);
  DECLINED_GOODBYE = fill(DECLINED_GOODBYE_TEMPLATE);
  WIND_DOWN_LINE = fill(WIND_DOWN_TEMPLATE);
  OVER_BUDGET_LINE = fill(OVER_BUDGET_TEMPLATE);
  DOCUMENTS_HAVE = fill(DOCUMENTS_TEMPLATE);
  DOCUMENTS_NONE = fill(NO_DOCUMENTS_TEMPLATE);
}

/** The current line set, for a UI that wants to show what the agent will say. */
export function intakeLines(): Record<string, string> {
  return {
    greeting: GREETING,
    afterMessage: AFTER_MESSAGE,
    anyQuestions: ANY_QUESTIONS_LINE,
    goodbye: GOODBYE,
    declinedGoodbye: DECLINED_GOODBYE,
    windDown: WIND_DOWN_LINE,
    overBudget: OVER_BUDGET_LINE,
    documentsHave: DOCUMENTS_HAVE,
    documentsNone: DOCUMENTS_NONE,
  };
}

/** Which version of the documents line applies, given what they said about paperwork. */
function documentsLine(state: IntakeState): string {
  const docs = state.facts.documents;
  const saidNo = docs?.value && /^(no|none|nothing|don'?t have)/i.test(docs.value.trim());
  return saidNo ? DOCUMENTS_NONE : DOCUMENTS_HAVE;
}
