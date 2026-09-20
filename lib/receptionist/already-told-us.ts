// lib/receptionist/already-told-us.ts — has the caller already said their piece?
//
// ── THE CALL THAT PROMPTED THIS (2026-09-21) ────────────────────────────────────────────────────
//
// Dana Whitfield rang and opened with everything: her name, spelled; her number; the address; the
// lot size; that there is a house on it; that she wants a privacy fence and needs her line found;
// and a request for a price. Ellie took all of it, confirmed it, got her email, asked about a
// deadline — and then said:
//
//     "Got it, I'll note that for Hank. I can take a message for him if you'd like."
//
// And Dana said: "Um, I think I kind of already left my message."
//
// She was right, and the owner's note was exact: "If the caller leaves a message, then it shouldn't
// ask them again."
//
// ── WHY THE PROMPT ALONE WAS NEVER GOING TO FIX IT ──────────────────────────────────────────────
//
// The rule said "Offer one on every call", and the model did what it was told. Softening the words
// to "offer one when appropriate" moves the judgement into the model on every single turn, where it
// is unreproducible and will drift the first time the prompt is edited for some other reason.
//
// So the judgement is made HERE, from the facts already collected, and the answer is handed to the
// model as a statement of fact about this call rather than as a thing for it to work out. The model
// is very good at phrasing; it should not be deciding what is true.
//
// ── A MESSAGE IS FOR SOMEBODY WHO HAS NOTHING TO SAY TO A MACHINE ───────────────────────────────
//
// That is the whole purpose of the offer. Somebody who opens with the job, or who has answered
// every question, has already left their message — it just did not arrive in one uninterrupted
// block. Offering them a slot afterwards asks them to do it again, and makes the assistant sound
// like it was filling in a form rather than listening.
//
// Pure. Tested in __tests__/twilio/already-told-us.test.ts.

import type { CallFacts } from './state';

/** What the caller has covered, and what the agent should therefore do about a message. */
export interface Coverage {
  /** Facts we hold, named the way the prompt should mention them. */
  given: string[];
  /** Enough to ring them back and know what about: they have effectively left their message. */
  bulkGiven: boolean;
  /** Enough to ring them back at all. */
  canCallBack: boolean;
  /** The line handed to the model this turn. Never empty. */
  instruction: string;
}

/** A fact counts as given when it is a real value rather than an empty string the model set. */
function has(v: unknown): boolean {
  return typeof v === 'number' ? Number.isFinite(v) : Boolean(typeof v === 'string' ? v.trim() : v);
}

/**
 * What the caller has already covered.
 *
 * `bulkGiven` is deliberately not "every field". It is the test a person would apply: could Hank
 * ring this caller back and know what the call was about? Name, a number, and either where the
 * property is or what they need — that is a message. Everything after it is detail.
 */
export function coverageOf(facts: CallFacts): Coverage {
  const given: string[] = [];
  if (has(facts.name)) given.push('their name');
  if (has(facts.phone)) given.push('a callback number');
  if (has(facts.email)) given.push('an email address');
  if (has(facts.address)) given.push('the property address');
  if (has(facts.acres)) given.push('the size of the property');
  if (has(facts.service)) given.push('what they need');
  if (has(facts.details)) given.push('the details of the job');
  if (has(facts.propertyId)) given.push('the property ID');

  const canCallBack = has(facts.name) && has(facts.phone);
  const knowWhatAbout = has(facts.address) || has(facts.service) || has(facts.details);
  const bulkGiven = canCallBack && knowWhatAbout;

  return { given, canCallBack, bulkGiven, instruction: instructionFor({ given, canCallBack, bulkGiven }) };
}

function instructionFor(c: Pick<Coverage, 'given' | 'canCallBack' | 'bulkGiven'>): string {
  if (c.bulkGiven) {
    return 'THE CALLER HAS ALREADY LEFT THEIR MESSAGE. They have given you '
      + `${c.given.join(', ')}. Do NOT offer to take a message — they have just left one, and asking `
      + 'again tells them you were not listening. Fill any genuine gap, then wrap the call up.';
  }
  if (c.canCallBack) {
    return 'You can reach this caller back, but you do not yet know what the call is about. '
      + 'Ask what they need rather than offering to take a message.';
  }
  return 'You do not yet have a name and number. Let them say why they rang first, in their own '
    + 'words — offering to take a message is for somebody who has nothing they want to talk through, '
    + 'not a step in a script.';
}

/**
 * Whether it is still appropriate to offer a message.
 *
 * Used by the test suite to state the rule in one place, and by anything that wants the decision
 * without the prose.
 */
export function shouldOfferMessage(facts: CallFacts): boolean {
  return !coverageOf(facts).bulkGiven;
}
