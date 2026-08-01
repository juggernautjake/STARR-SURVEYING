// __tests__/leads/quotes.test.ts — the official quote, versioned (A5).
//
// What this protects is INFORMATION, not correctness of arithmetic. Before this slice, `leads.quote_amount`
// was one nullable number and a revision overwrote it — so the original figure, the discount, and every
// decline reason were lost the moment anyone typed over them. The pure rules below are the ones that stop
// that happening again.
import { describe, it, expect } from 'vitest';
import {
  DECIDED_QUOTE_STATUSES, OPEN_QUOTE_STATUSES,
  deriveMirror, nextVersion, validateQuoteInput, type QuoteStatus,
} from '@/lib/leads/quotes';

const q = (version: number, amount_cents: number, status: QuoteStatus) => ({ version, amount_cents, status });

describe('nextVersion — a revision is a NEW version, never an edit', () => {
  it('starts at 1, because versions are shown to people', () => {
    expect(nextVersion([])).toBe(1);
  });

  it('increments past the highest, not the count', () => {
    // Counting would collide after a deletion and silently overwrite history — which is the exact failure
    // this table exists to prevent.
    expect(nextVersion([{ version: 1 }, { version: 2 }])).toBe(3);
    expect(nextVersion([{ version: 5 }])).toBe(6);
    expect(nextVersion([{ version: 3 }, { version: 1 }])).toBe(4);
  });
});

describe('validateQuoteInput', () => {
  it('requires an amount', () => {
    expect(validateQuoteInput({ status: 'sent' }).amount).toBeTruthy();
    expect(validateQuoteInput({ amountCents: NaN, status: 'sent' }).amount).toBeTruthy();
  });

  it('refuses a negative quote', () => {
    expect(validateQuoteInput({ amountCents: -1, status: 'sent' }).amount).toBeTruthy();
  });

  it('ALLOWS zero — a no-charge survey is a real thing', () => {
    // A favour, a warranty revisit, a goodwill callback. Rejecting zero pushes the office into typing a
    // fake number, which is worse than the zero.
    expect(validateQuoteInput({ amountCents: 0, status: 'sent' }).amount).toBeUndefined();
  });

  it('REFUSES a decline with no reason', () => {
    // The only moment the reason is knowable. Accepting a blank would produce a "why we lose" report full
    // of empty strings, which reads as data and is not.
    expect(validateQuoteInput({ status: 'declined' }).declineReason).toBeTruthy();
    expect(validateQuoteInput({ status: 'declined', declineReason: '   ' }).declineReason).toBeTruthy();
    expect(validateQuoteInput({ status: 'declined', declineReason: 'Went with a cheaper firm' }).declineReason)
      .toBeUndefined();
  });

  it('does not demand an amount when declining', () => {
    // A decline is about the outcome, not the number — the number is already on the quote being declined.
    expect(validateQuoteInput({ status: 'declined', declineReason: 'Too expensive' }).amount).toBeUndefined();
  });

  it('reports every problem at once', () => {
    // A form that reveals its objections one at a time is a form people fight with.
    const errors = validateQuoteInput({ status: 'declined', amountCents: -5 });
    expect(Object.keys(errors)).toContain('declineReason');
  });
});

describe('deriveMirror — what leads.quote_amount shows', () => {
  it('is null with no quotes', () => {
    expect(deriveMirror([])).toBeNull();
  });

  it('shows the live quote', () => {
    expect(deriveMirror([q(1, 150000, 'sent')])).toBe(1500);
  });

  it('prefers the ACCEPTED quote over a later live one', () => {
    // The accepted figure is what the job will be built from.
    expect(deriveMirror([q(1, 150000, 'accepted'), q(2, 120000, 'sent')])).toBe(1500);
  });

  it('shows the newest live quote after a revision', () => {
    expect(deriveMirror([q(1, 150000, 'superseded'), q(2, 120000, 'sent')])).toBe(1200);
  });

  it('goes NULL when the only quote was declined', () => {
    // Leaving the declined figure in the mirror would display a number nobody is offering — and it is the
    // number the leads board would then show as this lead's value.
    expect(deriveMirror([q(1, 150000, 'declined')])).toBeNull();
  });

  it('ignores superseded and expired versions', () => {
    expect(deriveMirror([q(1, 999900, 'superseded'), q(2, 888800, 'expired')])).toBeNull();
  });

  it('returns DOLLARS, because that is what the mirrored column stores', () => {
    // `lead_quotes.amount_cents` is cents; `leads.quote_amount` is NUMERIC dollars. Getting this backwards
    // would multiply every quote on the board by a hundred.
    expect(deriveMirror([q(1, 123456, 'sent')])).toBe(1234.56);
  });
});

describe('the status vocabulary', () => {
  it('splits cleanly into live and decided, with nothing in both', () => {
    for (const s of OPEN_QUOTE_STATUSES) expect(DECIDED_QUOTE_STATUSES).not.toContain(s);
    for (const s of DECIDED_QUOTE_STATUSES) expect(OPEN_QUOTE_STATUSES).not.toContain(s);
  });

  it('counts a draft as live, so recording a revision supersedes it', () => {
    // A draft nobody superseded would leave two quotes a customer could believe were current.
    expect(OPEN_QUOTE_STATUSES).toContain('draft');
    expect(OPEN_QUOTE_STATUSES).toContain('sent');
  });
});
