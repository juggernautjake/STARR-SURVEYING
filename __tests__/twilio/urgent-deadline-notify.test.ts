/**
 * The receptionist promises on the call that Hank is told straight away. This is the code keeping it.
 *
 * `urgency` has been on the call analysis since it was written and changed nothing about the text
 * that got sent — so a caller with a closing on Friday produced a message indistinguishable from a
 * salesperson's. From 2026-09-21 the prompt ASKS every caller whether anything has a date on it and
 * says out loud that he is being told now, which turns a nice-to-have into a promise on a recorded
 * line.
 */

import { describe, it, expect } from 'vitest';
import { outcomeText } from '@/lib/receptionist/notify';

const base = {
  from: '+12545550100',
  facts: { kind: 'customer' as const, name: 'Dana Whitfield', address: '919 S 15th St, Temple' },
  summary: 'Dana Whitfield needs a boundary survey before closing.',
};

const withAnalysis = (urgency: string, deadline: string | null) => ({
  ...base,
  answeredBy: 'ai' as const,
  call: { is_test: false, analysis: { urgency, deadline, summary: base.summary } } as never,
});

describe('an urgent deadline reaches the top of the message', () => {
  it('leads with URGENT and the date the caller named', () => {
    const t = outcomeText(withAnalysis('high', 'closing Friday 26 Sep'));
    expect(t.startsWith('URGENT — closing Friday 26 Sep')).toBe(true);
    // The rest of the message still arrives.
    expect(t).toContain('Dana Whitfield');
    expect(t).toContain('919 S 15th St');
  });

  it('still says URGENT when the date could not be pinned down', () => {
    // Better a flag with no date than a date-shaped silence: the analysis is told to say what it
    // has even when it is vague.
    expect(outcomeText(withAnalysis('high', null)).startsWith('URGENT\n')).toBe(true);
    expect(outcomeText(withAnalysis('high', '   ')).startsWith('URGENT\n')).toBe(true);
  });

  it('says nothing extra on an ordinary call', () => {
    for (const u of ['normal', 'low']) {
      expect(outcomeText(withAnalysis(u, 'closing Friday')), u).not.toContain('URGENT');
    }
  });

  it('says nothing extra when there is no analysis at all', () => {
    // A voicemail notified before the transcript lands has no analysis yet. It must not claim
    // urgency it does not know about, and must not crash reaching for it.
    expect(outcomeText({ ...base, answeredBy: 'voicemail' as const })).not.toContain('URGENT');
  });
});
