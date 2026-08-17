// Correcting what the AI read off the paper.
//
// Owner, 2026-08-16: *"I uploaded a receipt that had the date 8/12/2016, but because the ink quality
// was poor when the receipt was printed, it looked like 8/2/2026."* Until this module existed there
// was nowhere in the product to put the right answer.

import { describe, it, expect } from 'vitest';
import {
  EDITABLE_KEYS, applyReceiptEdits, clearConfidenceFor, parseTransactionAt,
} from '@/lib/receipts/edit-fields';

describe('the fields a person may correct', () => {
  it('covers everything the extractor reads off the paper', () => {
    // The nine the route accepted before were all decisions ABOUT the receipt, not what it says.
    for (const key of [
      'vendor_name', 'transaction_at', 'subtotal_cents', 'tax_cents', 'tip_cents',
      'service_charge_cents', 'total_cents', 'payment_method', 'payment_last4',
      'card_brand', 'card_holder_name', 'receipt_number', 'discount_cents',
    ]) {
      expect(EDITABLE_KEYS.has(key), `${key} should be correctable`).toBe(true);
    }
  });

  it('does NOT cover the fields with side effects, which the route still owns', () => {
    // Naming a card stamps a confirmation; a status change stamps an approver. Moving those into a
    // declarative table would have meant reproducing the side effects inside it.
    for (const key of ['status', 'payment_card_id', 'category', 'job_id']) {
      expect(EDITABLE_KEYS.has(key), `${key} must stay with the route`).toBe(false);
    }
  });
});

describe('the date — the field this exists for', () => {
  it('accepts a plain date and anchors it at local noon', () => {
    const r = parseTransactionAt('2016-08-12');
    expect(r.ok).toBe(true);
    if (r.ok && r.value) {
      // Anchored at noon so it can never cross a day boundary in either direction. `new
      // Date('2016-08-12')` is UTC midnight, which is 11 August in any western timezone — on a form
      // about a misread date, that would be its own bug.
      expect(new Date(r.value).getFullYear()).toBe(2016);
      expect(new Date(r.value).getMonth()).toBe(7);
      expect(new Date(r.value).getDate()).toBe(12);
    }
  });

  it('refuses a future date, because that is always a misread year', () => {
    const r = parseTransactionAt('2099-01-01');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/future/i);
  });

  it('refuses an implausibly old one', () => {
    expect(parseTransactionAt('1889-01-01').ok).toBe(false);
  });

  it('refuses nonsense rather than storing an Invalid Date', () => {
    expect(parseTransactionAt('not a date').ok).toBe(false);
  });

  it('clearing the date is allowed — null is honest', () => {
    expect(parseTransactionAt('')).toEqual({ ok: true, value: null });
    expect(parseTransactionAt(null)).toEqual({ ok: true, value: null });
  });
});

describe('money', () => {
  const apply = (patch: Record<string, unknown>) => applyReceiptEdits({}, patch);

  it('takes whole cents', () => {
    expect(apply({ total_cents: 4218 }).columnUpdate.total_cents).toBe(4218);
  });

  it('REFUSES a float instead of rounding it', () => {
    // A caller sending 42.18 means dollars. Storing 42 cents would turn a $42.18 lunch into 42¢ —
    // wrong in a way that still looks like a number.
    const r = apply({ total_cents: 42.18 });
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toMatch(/whole cents/i);
    expect(r.columnUpdate.total_cents).toBeUndefined();
  });

  it('allows a negative total — a refund slip is a real receipt', () => {
    expect(apply({ total_cents: -1500 }).columnUpdate.total_cents).toBe(-1500);
  });

  it('refuses an absurd amount', () => {
    expect(apply({ total_cents: 999_999_999 }).errors.length).toBe(1);
  });
});

describe('the last four', () => {
  it('must be exactly four digits', () => {
    expect(applyReceiptEdits({}, { payment_last4: '4054' }).columnUpdate.payment_last4).toBe('4054');
    for (const bad of ['405', '40544', '40a4', 'visa']) {
      expect(applyReceiptEdits({}, { payment_last4: bad }).errors.length, bad).toBe(1);
    }
  });
});

describe('applyReceiptEdits', () => {
  const current = {
    vendor_name: 'LOWES',
    total_cents: 4218,
    transaction_at: '2026-08-02T12:00:00.000Z',
    ai_extras: { card_brand: 'visa', receipt_number: 'A-1' },
  };

  it('routes column fields and ai_extras fields to different places', () => {
    const r = applyReceiptEdits(current, { vendor_name: 'Lowe’s #1234', card_brand: 'mastercard' });
    expect(r.columnUpdate.vendor_name).toBe('Lowe’s #1234');
    expect(r.aiExtrasUpdate.card_brand).toBe('mastercard');
    expect(r.columnUpdate.card_brand).toBeUndefined();
  });

  it('records what each value changed FROM', () => {
    // A correction log with only the new value cannot answer "what does the AI keep getting wrong".
    const r = applyReceiptEdits(current, { vendor_name: 'Home Depot' });
    expect(r.changed.vendor_name).toEqual({ from: 'LOWES', to: 'Home Depot' });
  });

  it('ignores a no-op, so opening the form and saving changes nothing', () => {
    // Without this, saving would stamp every field as human-corrected and wipe the AI's confidence
    // for fields nobody touched.
    const r = applyReceiptEdits(current, { vendor_name: 'LOWES', total_cents: 4218 });
    expect(r.changed).toEqual({});
    expect(r.columnUpdate).toEqual({});
  });

  it('treats the same instant written differently as a no-op', () => {
    const r = applyReceiptEdits(current, { transaction_at: '2026-08-02T12:00:00Z' });
    expect(r.changed).toEqual({});
  });

  it('ignores keys that are not editable', () => {
    const r = applyReceiptEdits(current, { status: 'approved', id: 'x' });
    expect(r.columnUpdate).toEqual({});
    expect(r.changed).toEqual({});
  });

  it('collects every error rather than stopping at the first', () => {
    const r = applyReceiptEdits(current, { total_cents: 1.5, payment_last4: 'nope' });
    expect(r.errors.length).toBe(2);
  });
});

describe('clearConfidenceFor', () => {
  it('drops the AI score for a field a human corrected', () => {
    // Otherwise the page keeps drawing "the AI was 30% sure of this" beside a figure somebody read
    // off the paper themselves.
    const next = clearConfidenceFor({ total_cents: 0.3, vendor_name: 0.9 }, ['total_cents']);
    expect(next).toEqual({ vendor_name: 0.9 });
  });

  it('leaves everything else alone and tolerates a missing map', () => {
    expect(clearConfidenceFor(null, ['total_cents'])).toEqual({});
    expect(clearConfidenceFor({ a: 1 }, [])).toEqual({ a: 1 });
  });
});
