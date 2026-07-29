// Per-field AI assist (P6-15).
//
// The owner's ask has TWO halves and both are requirements: *"AI can help with each step of the build
// process if the user wants it to, but also … the user can fully build everything from scratch, regardless
// of system."* So the assertions here are as much about what assist must NOT do — never auto-apply, never
// be required — as about it working.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fieldAcceptsAssist, isAssistableField, assistUserPrompt, cleanAssistText, ASSIST_SYSTEM_PROMPT,
} from '@/lib/dnd/homebrew/assist';
import { fieldsForKind } from '@/lib/dnd/homebrew/kinds';
import { HOMEBREW_KINDS } from '@/lib/dnd/homebrew/model';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const route = read('app/api/dnd/homebrew/assist/route.ts');
const builder = read('app/dnd/_ui/ContentBuilder.tsx');

describe('which fields accept help', () => {
  it('prose fields do', () => {
    const desc = fieldsForKind('feat').find((f) => f.key === 'description')!;
    expect(fieldAcceptsAssist(desc)).toBe(true);
  });

  it('numbers, dropdowns and structured editors do NOT', () => {
    // A number or a dropdown is faster to type than to review; an assist button on every field turns a
    // form into a slot machine.
    for (const kind of HOMEBREW_KINDS) {
      for (const f of fieldsForKind(kind)) {
        if (['number', 'select', 'statblock', 'levels', 'effects', 'list', 'image'].includes(f.type)) {
          expect(fieldAcceptsAssist(f), `${kind}.${f.key} (${f.type}) should not offer assist`).toBe(false);
        }
      }
    }
  });

  it('every kind has at least one assistable field, or the feature is invisible there', () => {
    for (const kind of HOMEBREW_KINDS) {
      expect(fieldsForKind(kind).some(fieldAcceptsAssist), `${kind} offers no assist at all`).toBe(true);
    }
  });

  it('and an unknown field name is refused', () => {
    expect(isAssistableField('feat', 'not_a_field')).toBe(false);
    expect(isAssistableField('feat', 'description')).toBe(true);
  });
});

describe('the prompt carries what the author has already written', () => {
  it('includes other prose fields, so a summary matches its own rules text', () => {
    // The whole reason assist beats a blank prompt: a summary written against existing rules text is
    // useful; one written against nothing is a fortune cookie.
    const p = assistUserPrompt('feat', 'dnd5e-2024', 'summary', {
      name: 'Iron Jaw', description: 'You shrug off a blow once per rest.',
    });
    expect(p).toContain('Iron Jaw');
    expect(p).toContain('You shrug off a blow');
  });

  it('does not send the field it is being asked to write', () => {
    const p = assistUserPrompt('feat', 'dnd5e-2024', 'description', { description: 'OLD TEXT' });
    expect(p).not.toContain('OLD TEXT');
  });

  it('says so plainly when the form is empty', () => {
    expect(assistUserPrompt('feat', 'dnd5e-2024', 'summary', {})).toMatch(/have not written anything else yet/);
  });

  it('tells it to write mechanics in prose when the system cannot compute them', () => {
    expect(assistUserPrompt('rule', 'dnd5e-2024', 'description', {})).toMatch(/nothing will compute them/);
  });
});

describe('the prompt refuses to invent rules', () => {
  it('says to describe an effect rather than name a rule it is unsure of', () => {
    expect(ASSIST_SYSTEM_PROMPT).toMatch(/write the effect in plain language instead of naming a rule/i);
  });

  it('and to match what the author has already written', () => {
    expect(ASSIST_SYSTEM_PROMPT).toMatch(/their tone, their fiction, their power level/);
  });

  it('asks for the field text only', () => {
    expect(ASSIST_SYSTEM_PROMPT).toMatch(/No preamble/);
    expect(ASSIST_SYSTEM_PROMPT).toMatch(/Return the field text and nothing else/);
  });
});

describe('cleanAssistText', () => {
  it('strips a conversational opener', () => {
    expect(cleanAssistText("Sure! Here's the summary:\nA brawler who never falls."))
      .toBe('A brawler who never falls.');
  });

  it('strips code fences', () => {
    expect(cleanAssistText('```\nsome text\n```')).toBe('some text');
  });

  it('unwraps quotes only when they wrap the WHOLE thing', () => {
    expect(cleanAssistText('"A brawler."')).toBe('A brawler.');
    // A quoted phrase inside the text is the author's content and must survive.
    expect(cleanAssistText('They call it "the jaw".')).toBe('They call it "the jaw".');
  });

  it('and caps the length', () => {
    expect(cleanAssistText('x'.repeat(9000)).length).toBe(4000);
  });
});

describe('assist never applies itself', () => {
  it('the route WRITES nothing', () => {
    // "Never auto-applies" is true at the API level, not only in the component.
    expect(route).not.toContain('.update(');
    expect(route).not.toContain('.insert(');
  });

  it('proposals are held outside the form values', () => {
    // A proposal living in `values` is one refresh away from becoming the author's own text.
    expect(builder).toMatch(/const \[proposals, setProposals\]/);
    expect(builder).toMatch(/Held OUTSIDE `values`/);
  });

  it('and the author picks what happens to it', () => {
    for (const action of ['Use it', 'Replace mine', 'Add to mine', 'Another', 'Dismiss']) {
      expect(builder, `the proposal is missing "${action}"`).toContain(action);
    }
  });
});

describe('everything stays buildable with the AI off', () => {
  it('the buttons are HIDDEN, not disabled', () => {
    // A disabled button says "you are missing something"; an absent one says "this form is complete".
    expect(builder).toMatch(/\{aiConfigured && fieldAcceptsAssist\(f\) && \(/);
  });

  it('and the route validates the field against the registry, not against the client', () => {
    // Otherwise `field` is an arbitrary string interpolated into a prompt whenever the UI misbehaves.
    expect(route).toContain('isAssistableField');
  });

  it('is rate-limited like every other AI route', () => {
    // P2-2: the hourly-only check became enforceAiLimits, which applies the hourly AND daily windows.
    expect(route).toContain('await enforceAiLimits(');
  });
});
