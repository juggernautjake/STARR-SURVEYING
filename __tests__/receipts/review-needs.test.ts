// "Which parts of this receipt should a person actually check?"
//
// Owner, 2026-08-16: *"If the AI is not certain about a name/number/etc for anything on the receipt,
// it should inform the viewer that they should review those parts of the receipt."*

import { describe, it, expect } from 'vitest';
import {
  LOW_CONFIDENCE, arithmeticIsOff, confidenceScore, reviewNeeds, reviewSummary,
  type ReviewableReceipt,
} from '@/lib/receipts/review-needs';

describe('a clean receipt says nothing', () => {
  it('no needs and no banner', () => {
    // A banner that is always there stops being read.
    const clean = {
      total_cents: 4218, subtotal_cents: 3900, tax_cents: 318,
      ai_confidence_per_field: { vendor_name: 0.98, total_cents: 0.99 },
      card_match_status: 'on_file',
    };
    expect(reviewNeeds(clean)).toEqual([]);
    expect(reviewSummary(clean)).toBeNull();
  });
});

describe('the four reasons a value is doubtful', () => {
  it('1. the model said so', () => {
    const r = reviewNeeds({ ai_confidence_per_field: { total_cents: 0.4 } });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ field: 'total_cents', reason: 'low_confidence' });
    expect(r[0].detail).toContain('40%');
  });

  it('2. the paper was hard to read', () => {
    // The case confidence could NOT express: a missing ink stroke produces a confident wrong answer.
    const r = reviewNeeds({
      ai_extras: { legibility: { quality: 'poor', fields_to_verify: ['transaction_at'] } },
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ field: 'transaction_at', reason: 'hard_to_read' });
  });

  it('3. the card is not on file', () => {
    const r = reviewNeeds({ card_match_status: 'not_on_file' });
    expect(r[0]).toMatchObject({ field: 'payment_last4', reason: 'card_not_on_file' });
    expect(r[0].detail).toMatch(/misread|not on a company card/i);
  });

  it('   …and "a card was used but we could not read the digits" is a different answer', () => {
    const r = reviewNeeds({ card_match_status: 'unknown' });
    expect(r[0].reason).toBe('card_unverifiable');
  });

  it('   …while a cash receipt raises nothing', () => {
    expect(reviewNeeds({ card_match_status: 'not_a_card' })).toEqual([]);
  });

  it('4. the arithmetic disagrees', () => {
    const r = reviewNeeds({ subtotal_cents: 3900, tax_cents: 318, total_cents: 9999 });
    expect(r[0]).toMatchObject({ field: 'total_cents', reason: 'arithmetic' });
  });
});

describe('arithmeticIsOff', () => {
  it('balances subtotal + tax + service + tip - discount against the total', () => {
    expect(arithmeticIsOff({
      subtotal_cents: 8500, tax_cents: 700, tip_cents: 1500, total_cents: 10700,
    })).toBe(false);
    expect(arithmeticIsOff({ subtotal_cents: 8500, tax_cents: 700, total_cents: 10700 })).toBe(true);
  });

  it('subtracts a discount', () => {
    expect(arithmeticIsOff({
      subtotal_cents: 5000, tax_cents: 400, total_cents: 4400, ai_extras: { discount_cents: 1000 },
    })).toBe(false);
  });

  it('says nothing when only the total is known — that receipt is complete, not broken', () => {
    // Flagging it would train people to ignore the flag.
    expect(arithmeticIsOff({ total_cents: 4218 })).toBe(false);
  });

  it('and nothing when there is no total at all', () => {
    expect(arithmeticIsOff({ subtotal_cents: 3900 })).toBe(false);
  });

  it('tolerates rounding on a percentage service charge', () => {
    expect(arithmeticIsOff({ subtotal_cents: 5000, tax_cents: 400, total_cents: 5450 })).toBe(false);
    expect(arithmeticIsOff({ subtotal_cents: 5000, tax_cents: 400, total_cents: 6000 })).toBe(true);
  });
});

describe('one entry per field, most serious first', () => {
  it('does not list the same field twice for two reasons', () => {
    // A total that is both low-confidence and part of failing arithmetic is ONE thing to check.
    const r = reviewNeeds({
      subtotal_cents: 3900, tax_cents: 318, total_cents: 9999,
      ai_confidence_per_field: { total_cents: 0.2 },
    });
    expect(r.filter((n) => n.field === 'total_cents')).toHaveLength(1);
    // Arithmetic outranks the model's own doubt.
    expect(r[0].reason).toBe('arithmetic');
  });

  it('ranks a hard-to-read field above everything else', () => {
    const r = reviewNeeds({
      card_match_status: 'not_on_file',
      ai_extras: { legibility: { fields_to_verify: ['transaction_at'] } },
      ai_confidence_per_field: { vendor_name: 0.1 },
    });
    expect(r.map((n) => n.reason)).toEqual(['hard_to_read', 'card_not_on_file', 'low_confidence']);
  });
});

describe('the threshold', () => {
  it('is one constant, so the banner and the field marker cannot disagree', () => {
    expect(LOW_CONFIDENCE).toBe(0.75);
    expect(reviewNeeds({ ai_confidence_per_field: { total_cents: LOW_CONFIDENCE } })).toEqual([]);
    expect(reviewNeeds({ ai_confidence_per_field: { total_cents: LOW_CONFIDENCE - 0.01 } })).toHaveLength(1);
  });
});

describe('the summary line', () => {
  it('escalates when the paper itself is poor', () => {
    const s = reviewSummary({
      ai_extras: { legibility: { quality: 'poor', fields_to_verify: ['transaction_at'] } },
    });
    expect(s?.severity).toBe('poor');
    expect(s?.text).toMatch(/hard to read/i);
    expect(s?.text).toContain('Date');
  });

  it('warns about poor print even when no single field was nominated', () => {
    const s = reviewSummary({ ai_extras: { legibility: { quality: 'poor' } } });
    expect(s?.severity).toBe('poor');
  });

  it('names up to three fields and then counts the rest', () => {
    const s = reviewSummary({
      ai_confidence_per_field: {
        vendor_name: 0.1, total_cents: 0.1, tax_cents: 0.1, tip_cents: 0.1, subtotal_cents: 0.1,
      },
    });
    expect(s?.severity).toBe('warn');
    expect(s?.text).toMatch(/2 more/);
  });
});

// ── THE CONFIDENCE SCORE (owner, 2026-08-17) ────────────────────────────────────────────────────
//
// *"generate receipt confidence scores … If the confidence score is lower than 100, then the
// reason(s) should be simply and prominently displayed."*
//
// That contains a requirement it is easy to miss: a score below 100 must ALWAYS have a reason to
// show. So the score is derived from `reviewNeeds()` rather than computed alongside it — an
// independent average would land at 94 with nothing to display, and the screen would either print
// an empty list or invent one.

describe('confidenceScore', () => {
  it('is exactly 100 when there is nothing to review', () => {
    const clean = {
      total_cents: 4218, subtotal_cents: 3900, tax_cents: 318,
      ai_confidence_per_field: { vendor_name: 0.98, total_cents: 0.99 },
      card_match_status: 'on_file',
    };
    expect(reviewNeeds(clean)).toEqual([]);
    expect(confidenceScore(clean)).toBe(100);
  });

  it('is NEVER 100 when there is a reason — the two can never disagree', () => {
    // The invariant the display depends on, checked across every reason type.
    const cases: ReviewableReceipt[] = [
      { ai_extras: { legibility: { fields_to_verify: ['transaction_at'] } } },
      { card_match_status: 'not_on_file' },
      { card_match_status: 'unknown' },
      { subtotal_cents: 3900, tax_cents: 318, total_cents: 9999 },
      { ai_confidence_per_field: { total_cents: 0.4 } },
    ];
    for (const r of cases) {
      expect(reviewNeeds(r).length, JSON.stringify(r)).toBeGreaterThan(0);
      expect(confidenceScore(r), JSON.stringify(r)).toBeLessThan(100);
    }
  });

  it('weights a confidently-wrong reading above a merely uncertain one', () => {
    // Faded ink produces a confident WRONG answer — the failure you cannot catch by re-reading.
    const faded = confidenceScore({ ai_extras: { legibility: { fields_to_verify: ['transaction_at'] } } });
    const unsure = confidenceScore({ ai_confidence_per_field: { transaction_at: 0.5 } });
    expect(faded).toBeLessThan(unsure);
  });

  it('scales the low-confidence penalty by how unsure the model actually was', () => {
    const barely = confidenceScore({ ai_confidence_per_field: { total_cents: 0.74 } });
    const wildGuess = confidenceScore({ ai_confidence_per_field: { total_cents: 0.05 } });
    expect(barely).toBeGreaterThan(wildGuess);
  });

  it('treats "could not check the card" as lighter than "the card does not match"', () => {
    // Absence of evidence is not evidence of error.
    expect(confidenceScore({ card_match_status: 'unknown' }))
      .toBeGreaterThan(confidenceScore({ card_match_status: 'not_on_file' }));
  });

  it('floors at 5, never 0', () => {
    // A receipt is a photograph of a real purchase; the vendor and total are usually still legible.
    // "0%" reads as "ignore this", which is the opposite of the intent.
    const awful = {
      subtotal_cents: 1, tax_cents: 1, total_cents: 99999,
      card_match_status: 'not_on_file',
      ai_extras: { legibility: { quality: 'poor', fields_to_verify: ['transaction_at', 'payment_last4', 'total_cents'] } },
      ai_confidence_per_field: { vendor_name: 0.01, tax_cents: 0.01, subtotal_cents: 0.01 },
    } as ReviewableReceipt;
    expect(confidenceScore(awful)).toBe(5);
  });

  it('and caps at 99 below perfect, so 100 means genuinely nothing to check', () => {
    // A single trivial doubt must not round back up to a clean bill of health.
    const oneTinyDoubt = { ai_confidence_per_field: { vendor_name: 0.7499 } };
    expect(confidenceScore(oneTinyDoubt)).toBeLessThanOrEqual(99);
  });
});
