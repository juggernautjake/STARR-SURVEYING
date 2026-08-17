// __tests__/receipts/edit.test.ts — slice V4 of
// docs/planning/completed/RECEIPT_REVIEW_SLIDESHOW_2026-08-14.md
//
// Every case here is a way a hand-corrected receipt ends up holding a plausible wrong number
// instead of an error. None of them throws.

import { describe, it, expect } from 'vitest';
import {
  parseMoney, centsToInput, isoToDateTimeInput, dateTimeInputToIso, parseLast4,
  changedFields, checkTotals, confidenceFor, isLowConfidence, LOW_CONFIDENCE,
} from '@/lib/receipts/edit';

describe('typing an amount', () => {
  it('reads the ordinary shapes a person types', () => {
    expect(parseMoney('12.34').cents).toBe(1234);
    expect(parseMoney('$12.34').cents).toBe(1234);
    expect(parseMoney('1,234.50').cents).toBe(123450);
    expect(parseMoney(' 99 ').cents).toBe(9900);
    expect(parseMoney('0.05').cents).toBe(5);
  });

  it('refuses a second decimal point instead of silently truncating', () => {
    // `parseFloat('12.3.4')` is 12.3 — a fat-fingered total becomes a plausible one, and the person
    // has no way to know the number they are looking at is not the number they typed.
    const r = parseMoney('12.3.4');
    expect(r.cents).toBeNull();
    expect(r.error).toBeTruthy();
  });

  it('refuses letters rather than reading the leading digits', () => {
    // `parseFloat('12abc')` is 12.
    for (const bad of ['12abc', 'abc', '1e5', '12 34']) {
      expect(parseMoney(bad).cents, bad).toBeNull();
      expect(parseMoney(bad).error, bad).toBeTruthy();
    }
  });

  it('treats an empty field as "not known", not as zero', () => {
    // A receipt with no recorded tip and a receipt with a tip of exactly $0.00 are different facts.
    // Only one of them should be written back over an AI extraction.
    expect(parseMoney('').cents).toBeNull();
    expect(parseMoney('   ').cents).toBeNull();
    expect(parseMoney('').error).toBeNull();
    expect(parseMoney('0').cents).toBe(0);
  });

  it('does not lose a cent to binary floating point', () => {
    // 12.55 * 100 is 1254.9999999999998. A naive floor loses a cent on some values and not others,
    // which is the worst kind of arithmetic bug: it reconciles nine times out of ten.
    expect(parseMoney('12.55').cents).toBe(1255);
    expect(parseMoney('19.99').cents).toBe(1999);
    expect(parseMoney('0.29').cents).toBe(29);
    expect(parseMoney('1.005').cents).toBe(101);
  });

  it('refuses a negative amount', () => {
    expect(parseMoney('-5.00').cents).toBeNull();
  });

  it('refuses an implausibly large amount', () => {
    expect(parseMoney('99999999.99').cents).toBeNull();
  });

  it('round-trips through the input format', () => {
    for (const cents of [0, 5, 1234, 123450]) {
      expect(parseMoney(centsToInput(cents)).cents, String(cents)).toBe(cents);
    }
  });

  it('renders "not known" as an empty input', () => {
    expect(centsToInput(null)).toBe('');
    expect(centsToInput(undefined)).toBe('');
    expect(centsToInput(NaN)).toBe('');
  });
});

describe('the purchase date', () => {
  it('round-trips a real timestamp', () => {
    const iso = new Date(2026, 7, 11, 14, 26).toISOString();
    const back = dateTimeInputToIso(isoToDateTimeInput(iso));
    expect(new Date(back!).getTime()).toBe(new Date(iso).getTime());
  });

  it('shows an unread date as empty rather than as now', () => {
    // The AI genuinely fails to read a date on faded thermal paper. Defaulting that to "now" would
    // file the expense in the wrong period and look deliberate.
    expect(isoToDateTimeInput(null)).toBe('');
    expect(isoToDateTimeInput('not a date')).toBe('');
  });

  it('clearing the field clears the column', () => {
    expect(dateTimeInputToIso('')).toBeNull();
    expect(dateTimeInputToIso('   ')).toBeNull();
  });
});

describe('the card digits', () => {
  it('keeps only the last four, however they were typed', () => {
    expect(parseLast4('4824')).toBe('4824');
    expect(parseLast4('**** **** **** 4824')).toBe('4824');
    expect(parseLast4('4111-1111-1111-4824')).toBe('4824');
  });

  it('clears on an empty field', () => {
    expect(parseLast4('')).toBeNull();
  });

  it('pads a short entry rather than storing two digits', () => {
    // The column is four characters by convention; '24' would sort and match unpredictably.
    expect(parseLast4('24')).toHaveLength(4);
  });
});

describe('only what changed is sent', () => {
  it('sends nothing when nothing changed', () => {
    const row = { vendor_name: 'Desert Sands', total_cents: 11637, notes: null };
    expect(changedFields(row, { ...row })).toEqual({});
  });

  it('sends only the touched fields', () => {
    const before = { vendor_name: 'DESERT SANDS HARDWARE', total_cents: 11637 };
    const after = { vendor_name: 'Desert Sands Hardware', total_cents: 11637 };
    expect(changedFields(before, after)).toEqual({ vendor_name: 'Desert Sands Hardware' });
  });

  it('treats undefined and null as the same absence', () => {
    // Otherwise every save would rewrite every unset column, and two people reviewing the same
    // queue would clobber each other's corrections.
    expect(changedFields({ tip_cents: null }, { tip_cents: undefined })).toEqual({});
  });

  it('sends a deliberate clear', () => {
    expect(changedFields({ notes: 'old' }, { notes: null })).toEqual({ notes: null });
  });

  it('never sends a field outside the allow-list', () => {
    const sneaky = { status: 'approved', approved_by: 'me' } as never;
    expect(changedFields({}, sneaky)).toEqual({});
  });
});

describe('does the receipt add up', () => {
  it('spots a total that disagrees with its parts', () => {
    const c = checkTotals({ subtotal_cents: 10744, tax_cents: 893, tip_cents: null, total_cents: 11637 });
    expect(c.mismatched).toBe(false);
    expect(c.expected).toBe(11637);
  });

  it('reports the difference when they disagree', () => {
    const c = checkTotals({ subtotal_cents: 1000, tax_cents: 100, tip_cents: null, total_cents: 1500 });
    expect(c.mismatched).toBe(true);
    expect(c.differenceCents).toBe(400);
  });

  it('tolerates a cent of rounding', () => {
    expect(checkTotals({ subtotal_cents: 1000, tax_cents: 83, total_cents: 1084 }).mismatched).toBe(false);
  });

  it('says nothing when it cannot know', () => {
    // A fuel slip with no subtotal is not a mismatched receipt, it is an unknown one — and flagging
    // it would put a warning on half the queue.
    expect(checkTotals({ total_cents: 5000 }).mismatched).toBe(false);
    expect(checkTotals({ subtotal_cents: 5000 }).expected).toBeNull();
  });
});

describe('how sure the AI was', () => {
  it('reads a confidence', () => {
    expect(confidenceFor({ total_cents: 0.42 }, 'total_cents')).toBe(0.42);
  });

  it('is null when the AI said nothing about that field', () => {
    expect(confidenceFor({}, 'total_cents')).toBeNull();
    expect(confidenceFor(null, 'total_cents')).toBeNull();
    expect(confidenceFor({ total_cents: 'high' }, 'total_cents')).toBeNull();
  });

  it('marks a field below the threshold', () => {
    expect(isLowConfidence({ vendor_name: LOW_CONFIDENCE - 0.01 }, 'vendor_name')).toBe(true);
    expect(isLowConfidence({ vendor_name: 1 }, 'vendor_name')).toBe(false);
  });

  it('does NOT mark a field the AI never scored', () => {
    // Absence of a score is not low confidence — marking it would highlight every field on every
    // receipt the extractor predates, and a panel where everything is highlighted highlights
    // nothing.
    expect(isLowConfidence({}, 'vendor_name')).toBe(false);
  });
});
