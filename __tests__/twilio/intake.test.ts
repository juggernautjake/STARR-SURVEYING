// __tests__/twilio/intake.test.ts — what the intake agent asks, and what it knows not to.
//
// The owner's own example is the acceptance test for this whole module:
//
//   "if the customer says it is an open lot in Killeen, then that means we have the area, and we
//    know that there are no structures on it, so the AI agent would not ask if there are structures
//    on it, but it might ask for the address in killeen."
//
// And the name rule:
//
//   "If their first name is 'John' and their last name is something weird, then the AI agent will
//    ask how they spell their last name."
//
// Both are asserted below against the real module.

import { describe, it, expect, beforeAll } from 'vitest';
import {
  FIELDS, needsSpelling, nameSpellingQuestion, impliedFrom, openFields, nextStep,
  configureIntakeLines, intakeLines, elapsedMs, shouldWindDown, isOverBudget,
  CALL_BUDGET_MS, WIND_DOWN_MS, COMMON_FIRST_NAMES, COMMON_LAST_NAMES,
  type IntakeState, type IntakeFacts, type FieldId,
} from '@/lib/receptionist/intake';

beforeAll(() => {
  configureIntakeLines({
    business: 'Starr Surveying',
    owner: 'Hank',
    email: 'hank@example.com',
    website: 'starr-surveying.com',
  });
});

const T0 = 1_700_000_000_000;

function state(facts: IntakeFacts = {}, over: Partial<IntakeState> = {}): IntakeState {
  return { phase: 'interview', facts, startedAt: T0, asked: [], ...over };
}

const known = (value: string) => ({ value, confidence: 'known' as const });
const unsure = (value: string) => ({ value, confidence: 'unsure' as const });

// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('the field list', () => {
  it('asks for everything the owner listed', () => {
    // Named one by one rather than counted, so dropping one is a failure and not a silent shrink.
    const wanted: FieldId[] = [
      'firstName', 'lastName', 'phone', 'email', 'callerRole',
      'propertyAddress', 'acreage', 'structures', 'surveyType', 'surveyPurpose', 'documents',
    ];
    for (const id of wanted) expect(FIELDS[id], `no field '${id}'`).toBeTruthy();
  });

  it('puts contact details before job details', () => {
    // A call that ends early is still useful if we can ring back, and useless if we cannot.
    const contact = Math.min(FIELDS.firstName.priority, FIELDS.phone.priority);
    const job = Math.max(FIELDS.acreage.priority, FIELDS.structures.priority, FIELDS.documents.priority);
    expect(contact).toBeGreaterThan(job);
  });

  it('every question reads as something a person would say out loud', () => {
    for (const f of Object.values(FIELDS)) {
      expect(f.ask.length, `${f.id} has no question`).toBeGreaterThan(12);
      expect(f.ask.endsWith('?'), `${f.id} does not ask anything: "${f.ask}"`).toBe(true);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('spelling — asking about the right half of the name', () => {
  it('leaves an ordinary name alone when the transcript was confident', () => {
    expect(needsSpelling('John', true, COMMON_FIRST_NAMES)).toBe(false);
    expect(needsSpelling('Smith', true, COMMON_LAST_NAMES)).toBe(false);
  });

  it('asks about an unusual name even when the transcript was confident', () => {
    expect(needsSpelling('Szczepanski', true, COMMON_LAST_NAMES)).toBe(true);
    expect(needsSpelling('Siobhan', true, COMMON_FIRST_NAMES)).toBe(true);
  });

  it('asks about any name when the transcript was not confident', () => {
    expect(needsSpelling('John', false, COMMON_FIRST_NAMES)).toBe(true);
  });

  it('asks about a hyphenated or two-part name even when both halves are ordinary', () => {
    // "Mary-Jo", "Mary Jo" and "Maryjo" are three different people on a quote.
    expect(needsSpelling('Mary-Jo', true, COMMON_FIRST_NAMES)).toBe(true);
    expect(needsSpelling("O'Brien", true, COMMON_LAST_NAMES)).toBe(true);
  });

  it('says nothing about a name that was never heard', () => {
    // Nothing heard is `missing`, which is a different question — "what is your name" rather than
    // "how do you spell it".
    expect(needsSpelling(undefined, false, COMMON_FIRST_NAMES)).toBe(false);
    expect(needsSpelling('', false, COMMON_FIRST_NAMES)).toBe(false);
  });

  it("asks only about the LAST name when that is the doubtful half — the owner's John example", () => {
    const q = nameSpellingQuestion({ firstName: known('John'), lastName: unsure('Szczepanski') });
    expect(q).toContain('Szczepanski');
    expect(q).not.toContain('John');
    expect(q).toMatch(/spell/i);
  });

  it('asks only about the first name when that is the doubtful half', () => {
    const q = nameSpellingQuestion({ firstName: unsure('Siobhan'), lastName: known('Smith') });
    expect(q).toContain('Siobhan');
    expect(q).not.toContain('Smith');
  });

  it('asks about the whole name as ONE question when both halves are doubtful', () => {
    // Two questions where one will do is a real cost on a seven-minute budget.
    const q = nameSpellingQuestion({ firstName: unsure('Siobhan'), lastName: unsure('Szczepanski') });
    expect(q).toContain('Siobhan Szczepanski');
    expect(q).toMatch(/spell/i);
  });

  it('asks nothing when both halves are understood', () => {
    expect(nameSpellingQuestion({ firstName: known('John'), lastName: known('Smith') })).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('what one answer settles about another', () => {
  it("reads 'open lot' as no structures — the owner's Killeen example", () => {
    const implied = impliedFrom('It is an open lot in Killeen off Stan Schlueter.');
    expect(implied).toContainEqual({ field: 'structures', value: 'none', because: 'open lot' });
  });

  it('reads vacant land the same way', () => {
    for (const phrase of ['vacant lot', 'raw land', 'nothing on it', 'undeveloped', 'just land']) {
      const implied = impliedFrom(`It is ${phrase} out past the highway.`);
      expect(implied.some((i) => i.field === 'structures' && i.value === 'none'), phrase).toBe(true);
    }
  });

  it('reads a mentioned building as there being structures', () => {
    const implied = impliedFrom('I need the corners marked around the house and the barn.');
    expect(implied.some((i) => i.field === 'structures' && i.value !== 'none')).toBe(true);
  });

  it('reads past a negated mention to the real one', () => {
    // "There is no house on it but there is an old barn" mentions a house and does not have one.
    // Taking the first match settles the field as "house" — the opposite of what was said, and
    // settled confidently enough that nobody is ever asked. The barn is the answer.
    const implied = impliedFrom('There is no house on it but there is an old barn.');
    const structures = implied.find((i) => i.field === 'structures');
    expect(structures?.value).toBe('barn');
  });

  it('claims nothing when vacant and built are BOTH asserted', () => {
    // "a vacant lot with a shed on it" is doing something this cannot read. A wrong implication
    // reaches the estimate; a redundant question costs eight seconds.
    const implied = impliedFrom('It is a vacant lot with a shed on it.');
    expect(implied.filter((i) => i.field === 'structures')).toEqual([]);
  });

  it('does not treat a merely empty thing as vacant land', () => {
    // An empty house is empty.
    const implied = impliedFrom('The house is empty at the moment.');
    expect(implied.some((i) => i.field === 'structures' && i.value === 'none')).toBe(false);
  });

  it('says nothing about a message that mentions neither', () => {
    expect(impliedFrom('I need a quote for a survey please, call me back.')).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('choosing the next question', () => {
  it('never asks about something already known', () => {
    const open = openFields(state({ firstName: known('John'), phone: known('2545550100') }));
    expect(open.map((f) => f.id)).not.toContain('firstName');
    expect(open.map((f) => f.id)).not.toContain('phone');
  });

  it('never asks about something implied', () => {
    const open = openFields(state({ structures: { value: 'none', confidence: 'implied', source: 'open lot' } }));
    expect(open.map((f) => f.id)).not.toContain('structures');
  });

  it('never asks twice, even when the answer did not land', () => {
    // Pressing somebody twice for the same thing is how a helpful call becomes an interrogation.
    const open = openFields(state({}, { asked: ['email'] }));
    expect(open.map((f) => f.id)).not.toContain('email');
  });

  it('never asks about something they refused', () => {
    const open = openFields(state({ email: { confidence: 'refused' } }));
    expect(open.map((f) => f.id)).not.toContain('email');
  });

  it('asks the most valuable open field first', () => {
    const open = openFields(state({}));
    expect(open[0].id).toBe('firstName');
  });

  it('confirms a doubtful value rather than asking for it again', () => {
    const step = nextStep(state({
      firstName: known('John'), lastName: known('Smith'),
      phone: unsure('254 555 0100'),
    }), T0);
    expect(step.field).toBe('phone');
    expect(step.say).toContain('254 555 0100');
  });

  it('handles the doubtful name before anything else', () => {
    const step = nextStep(state({ lastName: unsure('Szczepanski') }), T0);
    expect(step.say).toMatch(/spell/i);
    expect(step.say).toContain('Szczepanski');
  });

  it("moves to the documents line once there is nothing left to ask", () => {
    const facts: IntakeFacts = {};
    for (const id of Object.keys(FIELDS) as FieldId[]) facts[id] = known('x');
    const step = nextStep(state(facts), T0);
    expect(step.phase).toBe('documents');
    expect(step.say).toMatch(/email|upload/i);
  });

  it('offers to receive documents when they said they have some', () => {
    const facts: IntakeFacts = {};
    for (const id of Object.keys(FIELDS) as FieldId[]) facts[id] = known('x');
    facts.documents = known('I have the plat from when we bought it');
    expect(nextStep(state(facts), T0).say).toBe(intakeLines().documentsHave);
  });

  it('says something different when they have no paperwork', () => {
    // "That's no problem" rather than a request they have already answered.
    const facts: IntakeFacts = {};
    for (const id of Object.keys(FIELDS) as FieldId[]) facts[id] = known('x');
    facts.documents = known('No, I do not have anything');
    expect(nextStep(state(facts), T0).say).toBe(intakeLines().documentsNone);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('the shape of the call', () => {
  it('greets, then takes a message, then asks permission', () => {
    const greet = nextStep(state({}, { phase: 'greeting' }), T0);
    expect(greet.phase).toBe('message');
    expect(greet.say).toMatch(/leave a message/i);
    // The owner was specific that the caller is asked to STAY ON THE LINE in the greeting.
    expect(greet.say).toMatch(/stay on the line/i);

    const after = nextStep(state({}, { phase: 'message' }), T0);
    expect(after.phase).toBe('consent');
    // Reassurance BEFORE the questions, so somebody who hangs up here has still been told what
    // happens next.
    expect(after.say).toMatch(/get back to you/i);
    expect(after.say).toMatch(/\?$/);
  });

  it('ends kindly when they decline the questions', () => {
    const step = nextStep(state({}, { phase: 'consent', declined: true }), T0);
    expect(step.end).toBe(true);
    expect(step.say).toMatch(/no problem/i);
    expect(step.say).not.toMatch(/\?/);
  });

  it('invites their questions after the documents line, then says goodbye', () => {
    expect(nextStep(state({}, { phase: 'documents' }), T0).phase).toBe('questions');
    const bye = nextStep(state({}, { phase: 'questions' }), T0);
    expect(bye.end).toBe(true);
    expect(bye.say).toMatch(/have a good day/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('the seven-minute budget', () => {
  it('is seven minutes', () => {
    expect(CALL_BUDGET_MS).toBe(7 * 60 * 1000);
  });

  it('starts winding down before the cap, not at it', () => {
    // A wind-down that begins at the cap is a hang-up: the goodbye itself takes time.
    expect(WIND_DOWN_MS).toBeLessThan(CALL_BUDGET_MS);
    expect(CALL_BUDGET_MS - WIND_DOWN_MS).toBeGreaterThanOrEqual(60_000);
  });

  it('measures elapsed time from when the call was answered', () => {
    expect(elapsedMs(state(), T0 + 5_000)).toBe(5_000);
    // A clock that has gone backwards must not produce a negative age.
    expect(elapsedMs(state(), T0 - 5_000)).toBe(0);
  });

  it('winds down instead of asking another question', () => {
    const step = nextStep(state({}, { phase: 'interview' }), T0 + WIND_DOWN_MS);
    expect(step.end).toBe(true);
    expect(step.say).toMatch(/respectful of your time/i);
    expect(step.say).toMatch(/Hank/);
  });

  it('ends at the cap from ANY phase, including mid-question', () => {
    // Checked before the phase machine rather than inside it, so no path through the interview can
    // outrun the budget.
    for (const phase of ['greeting', 'message', 'consent', 'interview', 'documents', 'questions'] as const) {
      const step = nextStep(state({}, { phase }), T0 + CALL_BUDGET_MS);
      expect(step.end, `phase ${phase} did not end at the cap`).toBe(true);
      expect(step.phase).toBe('ended');
    }
  });

  it('reports the two thresholds independently', () => {
    const s = state();
    expect(shouldWindDown(s, T0)).toBe(false);
    expect(shouldWindDown(s, T0 + WIND_DOWN_MS)).toBe(true);
    expect(isOverBudget(s, T0 + WIND_DOWN_MS)).toBe(false);
    expect(isOverBudget(s, T0 + CALL_BUDGET_MS)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('the fixed lines', () => {
  it('name the business, the owner, the email and the website', () => {
    const lines = intakeLines();
    expect(lines.greeting).toContain('Starr Surveying');
    expect(lines.goodbye).toContain('Hank');
    expect(lines.documentsHave).toContain('hank@example.com');
    expect(lines.documentsHave).toContain('starr-surveying.com');
  });

  it('leave no placeholder unfilled', () => {
    for (const [name, line] of Object.entries(intakeLines())) {
      expect(line, `${name} has an unfilled placeholder: ${line}`).not.toMatch(/\{\w+\}/);
    }
  });

  it('never promise a call back at a particular time', () => {
    // "Someone will call you within 24 hours" is a promise the agent cannot keep and nobody
    // authorised it to make.
    for (const [name, line] of Object.entries(intakeLines())) {
      expect(line, `${name} promises a timeframe`).not.toMatch(/\b(24 hours|today|tomorrow|within an hour|this afternoon)\b/i);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
describe("the owner's Killeen call, end to end", () => {
  it('never asks about structures, and does ask for the address', () => {
    // "if the customer says it is an open lot in Killeen … we know that there are no structures on
    // it, so the AI agent would not ask if there are structures on it, but it might ask for the
    // address in killeen."
    const message = 'Hi, this is John Smith, 254 555 0100. I have an open lot in Killeen and I need '
      + 'a boundary survey for a fence. Give me a call back.';

    const facts: IntakeFacts = {
      firstName: known('John'),
      lastName: known('Smith'),
      phone: known('254 555 0100'),
      surveyType: known('boundary survey'),
      surveyPurpose: known('putting up a fence'),
    };
    for (const imp of impliedFrom(message)) {
      facts[imp.field] = { value: imp.value, confidence: 'implied', source: imp.because };
    }

    const asked: FieldId[] = [];
    let s = state(facts, { phase: 'interview', asked });
    for (let i = 0; i < 12; i += 1) {
      const step = nextStep(s, T0);
      if (step.phase !== 'interview') break;
      if (step.field) asked.push(step.field);
      s = { ...s, asked: [...asked] };
    }

    expect(asked, 'it asked about structures on an open lot').not.toContain('structures');
    expect(asked, 'it never asked where the property is').toContain('propertyAddress');
    expect(asked).not.toContain('firstName');
    expect(asked).not.toContain('phone');
    expect(asked).not.toContain('surveyType');
  });
});
