// __tests__/twilio/intake-extract.test.ts — turning "how sure are you" into "do I need to ask".
//
// The model reads; `intake.ts` decides. This file tests the join between them, which is the part
// that has to be right for the interview to feel like it was listening.

import { describe, it, expect } from 'vitest';
import {
  mergeExtraction, outstanding, EXTRACT_TOOL, CONFIDENT, TOO_VAGUE, type Extraction,
} from '@/lib/receptionist/intake-extract';
import type { IntakeFacts } from '@/lib/receptionist/intake';

const NOTHING_SAID = '';

describe('the thresholds', () => {
  it('are ordered and inside 0..1', () => {
    expect(TOO_VAGUE).toBeGreaterThan(0);
    expect(TOO_VAGUE).toBeLessThan(CONFIDENT);
    expect(CONFIDENT).toBeLessThan(1);
  });
});

describe('merging what was heard', () => {
  it('takes a confident, ordinary value as known', () => {
    const facts = mergeExtraction({}, { phone: { value: '254 555 0100', confidence: 0.97 } }, NOTHING_SAID);
    expect(facts.phone).toEqual({ value: '254 555 0100', confidence: 'known', source: 'heard' });
  });

  it('marks a middling value as unsure, so it gets confirmed rather than re-asked', () => {
    const facts = mergeExtraction({}, { propertyAddress: { value: '12 Oak St', confidence: 0.6 } }, NOTHING_SAID);
    expect(facts.propertyAddress?.confidence).toBe('unsure');
  });

  it('DISCARDS a value too vague to read back', () => {
    // "Did you say Bachmann?" when they said something else wastes a turn and sounds like it was
    // not listening. Better to ask cleanly.
    const facts = mergeExtraction({}, { lastName: { value: 'Bachmann', confidence: 0.2 } }, NOTHING_SAID);
    expect(facts.lastName).toBeUndefined();
  });

  it('ignores a non-numeric or missing confidence rather than trusting it', () => {
    const bad = { phone: { value: '5551234', confidence: Number.NaN } } as unknown as Extraction;
    expect(mergeExtraction({}, bad, NOTHING_SAID).phone).toBeUndefined();
  });

  it('ignores an empty value', () => {
    expect(mergeExtraction({}, { email: { value: '   ', confidence: 0.99 } }, NOTHING_SAID).email).toBeUndefined();
  });
});

describe('names carry the spelling rule through from the extraction', () => {
  it('takes a confident ordinary name as known', () => {
    const facts = mergeExtraction({}, {
      firstName: { value: 'John', confidence: 0.96 },
      lastName: { value: 'Smith', confidence: 0.96 },
    }, NOTHING_SAID);
    expect(facts.firstName?.confidence).toBe('known');
    expect(facts.lastName?.confidence).toBe('known');
  });

  it("leaves an unusual surname unsure even when the model was certain — the owner's rule", () => {
    // "If their first name is 'John' and their last name is something weird, then the AI agent will
    // ask how they spell their last name." A clearly-heard unusual name is still a name nobody has
    // spelled, and the model cannot know how it is written.
    const facts = mergeExtraction({}, {
      firstName: { value: 'John', confidence: 0.98 },
      lastName: { value: 'Szczepanski', confidence: 0.98 },
    }, NOTHING_SAID);
    expect(facts.firstName?.confidence).toBe('known');
    expect(facts.lastName?.confidence).toBe('unsure');
  });

  it('always spells an email back unless the model was almost certain', () => {
    // One wrong character makes it undeliverable, and nobody finds out until the estimate never
    // arrives.
    const nearly = mergeExtraction({}, { email: { value: 'j.smith@example.com', confidence: 0.9 } }, NOTHING_SAID);
    expect(nearly.email?.confidence).toBe('unsure');
    const certain = mergeExtraction({}, { email: { value: 'j.smith@example.com', confidence: 0.97 } }, NOTHING_SAID);
    expect(certain.email?.confidence).toBe('known');
  });
});

describe('a later turn may improve a fact but never undo one', () => {
  it('upgrades an unsure value when they spell it out', () => {
    const before: IntakeFacts = { lastName: { value: 'Szczepanski', confidence: 'unsure' } };
    const after = mergeExtraction(before, { lastName: { value: 'Szczepanski', confidence: 0.99 } }, NOTHING_SAID);
    // Still unsure, because the name itself is unusual — which is correct: a confidence score is
    // not a spelling. It becomes `known` when the interview records their spelled answer.
    expect(after.lastName?.value).toBe('Szczepanski');
  });

  it('does NOT downgrade a known value because a later mumble scored low', () => {
    // A caller who has already confirmed their number must not be asked for it again.
    const before: IntakeFacts = { phone: { value: '254 555 0100', confidence: 'known' } };
    const after = mergeExtraction(before, { phone: { value: '999', confidence: 0.4 } }, NOTHING_SAID);
    expect(after.phone).toEqual({ value: '254 555 0100', confidence: 'known' });
  });

  it('does not reopen something they refused to give', () => {
    const before: IntakeFacts = { email: { confidence: 'refused' } };
    const after = mergeExtraction(before, { email: { value: 'guess@example.com', confidence: 0.99 } }, NOTHING_SAID);
    expect(after.email?.confidence).toBe('refused');
  });
});

describe('what their words settle on their own', () => {
  it("reads the owner's open lot as no structures", () => {
    const facts = mergeExtraction({}, {}, 'It is an open lot in Killeen, I need it surveyed.');
    expect(facts.structures).toEqual({ value: 'none', confidence: 'implied', source: 'open lot' });
  });

  it('lets an explicit answer beat an inference drawn from the same sentence', () => {
    // They said "open lot" and also stated there is a shed. The stated value wins.
    const facts = mergeExtraction({}, { structures: { value: 'a shed', confidence: 0.95 } },
      'It is an open lot but there is a shed at the back.');
    expect(facts.structures?.value).toBe('a shed');
    expect(facts.structures?.confidence).toBe('known');
  });

  it('records WHICH phrase settled it, so a wrong one can be traced', () => {
    const facts = mergeExtraction({}, {}, 'Just raw land out past the highway.');
    expect(facts.structures?.source).toBe('raw land');
  });
});

describe('outstanding', () => {
  it('lists what still needs asking and nothing that does not', () => {
    const facts: IntakeFacts = {
      firstName: { value: 'John', confidence: 'known' },
      lastName: { value: 'Szczepanski', confidence: 'unsure' },
      structures: { value: 'none', confidence: 'implied' },
      email: { confidence: 'refused' },
    };
    const open = outstanding(facts);
    expect(open).toContain('lastName');
    expect(open).not.toContain('firstName');
    expect(open).not.toContain('structures');
    expect(open).not.toContain('email');
  });
});

describe('the tool the model is given', () => {
  it('asks for a confidence alongside every value', () => {
    // A schema that returns values without confidence cannot drive this interview at all — the
    // decision downstream is "do I need to ask", not "what did they say".
    const props = EXTRACT_TOOL.input_schema.properties as Record<string, { required?: string[] }>;
    expect(Object.keys(props).length).toBeGreaterThanOrEqual(11);
    for (const [field, spec] of Object.entries(props)) {
      expect(spec.required, `${field} does not demand a confidence`).toEqual(['value', 'confidence']);
    }
  });

  it('tells the model not to guess', () => {
    // The single most damaging failure here is an invented value, because a missing field gets
    // asked and a wrong one goes on a quote.
    expect(EXTRACT_TOOL.description).toMatch(/do not guess/i);
  });
});
