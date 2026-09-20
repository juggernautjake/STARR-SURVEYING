// __tests__/twilio/already-told-us.test.ts — the Dana Whitfield regression.
//
// On 2026-09-21 a test call went like this. Dana opened with her name (spelled), her number, her
// address, the lot size, that there is a house on it, that she wants a privacy fence and needs her
// line found, and a request for a price. Ellie took all of it, confirmed it, got her email, asked
// about a deadline — and then said:
//
//     "Got it, I'll note that for Hank. I can take a message for him if you'd like."
//
//     "Um, I think I kind of already left my message."
//
// She was right. The prompt said "Offer one on every call" and the model did as it was told.
//
// The judgement now lives in code, so it is the same on every call and a test can hold it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { coverageOf, shouldOfferMessage } from '@/lib/receptionist/already-told-us';
import type { CallFacts } from '@/lib/receptionist/state';

const ROOT = process.cwd();

/** What Ellie held by the time she offered Dana a message slot. */
const DANA: CallFacts = {
  kind: 'customer',
  name: 'Dana Whitfield',
  phone: '2545550188',
  email: 'dwhitfield@gmail.com',
  address: '2117 Pecan Hollow Drive, Harker Heights',
  acres: 0.25,
  service: 'boundary survey',
  details: 'Privacy fence in the back; wants the property line. Would like it in the next couple of weeks.',
};

describe('THE REGRESSION — Dana had already left her message', () => {
  it('does not offer one', () => {
    expect(shouldOfferMessage(DANA)).toBe(false);
  });

  it('says so plainly to the model, naming what she gave', () => {
    const c = coverageOf(DANA);
    expect(c.bulkGiven).toBe(true);
    expect(c.instruction).toMatch(/ALREADY LEFT THEIR MESSAGE/);
    expect(c.instruction).toMatch(/Do NOT offer to take a message/);
    expect(c.instruction).toContain('their name');
    expect(c.instruction).toContain('the property address');
  });

  it('is already true at the point she finished her opening sentence', () => {
    // Everything in her first breath, before the email and the deadline. The offer was wrong from
    // that moment, not only at the end.
    const opening: CallFacts = {
      name: 'Dana Whitfield',
      phone: '2545550188',
      address: '2117 Pecan Hollow Drive, Harker Heights',
      service: 'boundary survey',
    };
    expect(shouldOfferMessage(opening)).toBe(false);
  });
});

describe('when a message IS still the right thing to offer', () => {
  it('offers one when nothing at all is known', () => {
    expect(shouldOfferMessage({})).toBe(true);
    expect(coverageOf({}).instruction).toMatch(/let them say why they rang first/i);
  });

  it('offers one when there is a name and number but no idea what about', () => {
    const facts: CallFacts = { name: 'Marcus Webb', phone: '2545550133' };
    expect(shouldOfferMessage(facts)).toBe(true);
    // And tells the model to ASK rather than to offer, which is the better move here.
    expect(coverageOf(facts).instruction).toMatch(/Ask what they need/);
  });

  it('offers one when they said what they need but left no way to reach them', () => {
    // "I need a survey" and nothing else is not a message anybody can act on.
    expect(shouldOfferMessage({ service: 'boundary survey' })).toBe(true);
  });
});

describe('what counts as having said your piece', () => {
  it('needs a way to ring back AND some idea what it is about', () => {
    expect(coverageOf({ name: 'A', phone: '1' }).bulkGiven).toBe(false);
    expect(coverageOf({ name: 'A', phone: '1', address: 'somewhere' }).bulkGiven).toBe(true);
    expect(coverageOf({ name: 'A', phone: '1', service: 'boundary' }).bulkGiven).toBe(true);
    expect(coverageOf({ name: 'A', phone: '1', details: 'fence dispute' }).bulkGiven).toBe(true);
  });

  it('does not count a field the model set to an empty string', () => {
    // The envelope sometimes carries `"name": ""`, and a blank is not an answer.
    expect(coverageOf({ name: '', phone: '  ', address: '' }).given).toEqual([]);
    expect(coverageOf({ name: 'A', phone: '1', address: '   ' }).bulkGiven).toBe(false);
  });

  it('counts a numeric acreage, including one that is legitimately small', () => {
    // `acres: 0.25` is falsy arithmetic and a real answer.
    expect(coverageOf({ acres: 0.25 }).given).toContain('the size of the property');
    expect(coverageOf({ acres: 0 }).given).toContain('the size of the property');
  });

  it('never returns an empty instruction', () => {
    for (const facts of [{}, DANA, { name: 'x' }, { phone: '1' }] as CallFacts[]) {
      expect(coverageOf(facts).instruction.length).toBeGreaterThan(40);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// The prompts are the other half of this. A perfect helper is no use if the prompt still contains
// the sentence that caused the bug.
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('the prompts no longer tell the agent to offer a message every time', () => {
  const brain = fs.readFileSync(path.join(ROOT, 'lib/receptionist/brain.ts'), 'utf8');
  const agent = fs.readFileSync(path.join(ROOT, 'lib/receptionist/agent-prompt.ts'), 'utf8');

  /** Prompt text only — the header comments discuss the old rule on purpose. */
  const promptOf = (src: string) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

  it('neither prompt says to offer one on every call', () => {
    expect(promptOf(brain)).not.toMatch(/Offer one on every call/i);
    expect(promptOf(agent)).not.toMatch(/on every call, plainly/i);
  });

  it('both tell it that a caller who has spoken has already left their message', () => {
    expect(promptOf(brain)).toMatch(/ALREADY LEFT THEIR MESSAGE/);
    expect(promptOf(agent)).toMatch(/ALREADY LEFT THEIR MESSAGE/);
  });

  it('both open by letting the caller talk rather than by interviewing', () => {
    expect(promptOf(brain)).toMatch(/let them (talk|say)/i);
    expect(promptOf(agent)).toMatch(/Let them talk first/i);
  });

  it('the turn carries the MESSAGE line, so the model is told rather than left to judge', () => {
    // Without this the helper exists and nothing consults it.
    expect(brain).toMatch(/MESSAGE: \$\{coverageOf\(state\.facts\)\.instruction\}/);
  });
});

describe('the prompts stopped demanding a yes or a no', () => {
  const agent = fs.readFileSync(path.join(ROOT, 'lib/receptionist/agent-prompt.ts'), 'utf8');
  const brain = fs.readFileSync(path.join(ROOT, 'lib/receptionist/brain.ts'), 'utf8');

  it('no longer instructs the stilted email confirmation', () => {
    // The agent said "is that right, yes or no?" on the test call because the prompt told it to,
    // word for word.
    expect(agent).not.toMatch(/Close with a yes-or-no/i);
    expect(agent).not.toMatch(/is that right, yes or no\?"/);
  });

  it('says explicitly not to', () => {
    expect(agent).toMatch(/NEVER say "yes or no"/);
    expect(brain).toMatch(/Never demand a yes or a no/);
  });
});
