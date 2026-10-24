// __tests__/receipts/reading-v2.test.ts — the zoomed two-read reader, spending by item, and the
// audit gate (owner, 2026-10-07).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sameValue, disagreements, runChecks, fieldsForChecks, coerce, sectionCount, samplingFor, SOFT_FIELDS } from '@/lib/receipts/zoom-read';
import { allocate, bucketOf, buildSpendReport } from '@/lib/receipts/spending';
import { readingStillDoubtful } from '@/lib/receipts/audit-readiness';
import type { ExtractedReceipt } from '@/worker/src/services/receipt-extraction-core';

function receipt(p: Partial<ExtractedReceipt>): ExtractedReceipt {
  return {
    vendor_name: 'CEFCO', vendor_address: null, vendor_phone: null, transaction_at: '2026-10-05T08:52:54-05:00',
    subtotal_cents: 900, tax_cents: 0, tip_cents: null, service_charge_cents: null, discount_cents: null, total_cents: 900,
    currency: 'USD', payment_method: 'card', payment_last4: '5054', card_brand: null, card_holder_name: null,
    receipt_number: '385058', category: 'meals', tax_deductible_flag: 'full', ai_summary: null, review_flags: [],
    line_items: [
      { description: 'CASEYS WTR', amount_cents: 450, quantity: 1, category: 'meals' },
      { description: 'CASEYS WTR', amount_cents: 450, quantity: 1, category: 'meals' },
    ],
    confidence: {}, legibility: { quality: 'good', issues: [], fields_to_verify: [] },
    ...p,
  } as ExtractedReceipt;
}

describe('comparing two reads', () => {
  it('a store number or greeting is not a disagreement about the vendor', () => {
    expect(sameValue('vendor_name', 'Taco Bell 036308', 'Taco Bell')).toBe(true);
    expect(sameValue('vendor_name', 'CEFCO #18', 'CEFCO')).toBe(true);
    expect(sameValue('vendor_name', 'Welcome to CEFCO', 'CEFCO')).toBe(true);
    expect(sameValue('vendor_name', 'CEFCO', 'HEB')).toBe(false);
  });
  it('dates compare by day; money by the cent', () => {
    expect(sameValue('transaction_at', '2026-10-05T08:52:54-05:00', '2026-10-05')).toBe(true);
    expect(sameValue('total_cents', 900, 900)).toBe(true);
    expect(sameValue('total_cents', 900, 960)).toBe(false);
  });
  it('lists exactly the fields that differ', () => {
    expect(disagreements(receipt({}), receipt({ total_cents: 960, tax_cents: 60 }))).toEqual(['tax_cents', 'total_cents']);
    expect(disagreements(receipt({}), receipt({}))).toEqual([]);
  });
  it('which printed number is "the" receipt number never sends a receipt to review on its own', () => {
    expect(SOFT_FIELDS.has('receipt_number')).toBe(true);
  });
});

describe('the checks a reading must pass', () => {
  it('a clean receipt passes everything', () => {
    expect(runChecks(receipt({}), new Date('2026-10-07')).every((c) => c.ok)).toBe(true);
  });
  it('items that do not reach the subtotal fail, and point at the money', () => {
    const c = runChecks(receipt({ line_items: [{ description: 'A', amount_cents: 450, quantity: 1, category: 'meals' }] }), new Date('2026-10-07'));
    expect(c.find((x) => x.check === 'line items')?.ok).toBe(false);
    expect(fieldsForChecks(c)).toContain('subtotal_cents');
  });
  it('a missing total, a future date and bad card digits all fail', () => {
    const c = runChecks(receipt({ total_cents: null, transaction_at: '2027-05-01', payment_last4: '50S4' }), new Date('2026-10-07'));
    expect(c.filter((x) => !x.ok).map((x) => x.check).sort()).toEqual(['card', 'date', 'total']);
  });
  it('settled values are coerced to the shape of their field', () => {
    expect(coerce('total_cents', '903')).toBe(903);
    expect(coerce('payment_last4', '**** 5054')).toBe('5054');
    expect(coerce('payment_last4', '505')).toBeNull();
  });
});

describe('how a receipt is cut and read', () => {
  it('a long receipt gets more sections than a short one', () => {
    expect(sectionCount(888, 2720)).toBeGreaterThan(sectionCount(1000, 1200));
    expect(sectionCount(1000, 1000)).toBeGreaterThanOrEqual(2);
    expect(sectionCount(500, 20000)).toBeLessThanOrEqual(6);
  });
  it('temperature is only sent to models that accept it', () => {
    expect(samplingFor('claude-sonnet-4-5-20250929')).toEqual({ temperature: 0 });
    expect(samplingFor('claude-sonnet-5-5')).toEqual({});
  });
  it('every upload is read this way, and PDFs are no longer refused', () => {
    const src = readFileSync('lib/receipts/extract.ts', 'utf8');
    expect(src).toContain('await zoomRead(');
    expect(src).not.toContain('PDF receipts are stored but not yet read by the AI');
  });
});

describe('spending by kind of item', () => {
  it('a mixed receipt splits by its items, tax spread so the parts equal what was paid', () => {
    const items = [
      { receipt_id: 'r', description: 'Diesel', amount_cents: 6000, category: 'fuel' },
      { receipt_id: 'r', description: 'Water', amount_cents: 300, category: 'meals' },
      { receipt_id: 'r', description: 'Zip ties', amount_cents: 700, category: 'supplies' },
    ];
    const split = allocate(7350, items, 'fuel');
    expect(Object.values(split).reduce((a, b) => a + b, 0)).toBe(7350);
    expect(split.fuel).toBeGreaterThan(split.supplies);
    expect(Object.keys(split).sort()).toEqual(['fuel', 'meals', 'supplies']);
  });
  it('a receipt with no items counts toward its own category', () => {
    expect(allocate(1500, [], 'tolls')).toEqual({ tolls: 1500 });
  });
  it('buckets by Central-time day, Monday week, month, quarter, half and year', () => {
    const late = '2026-10-06T03:30:00Z'; // 10:30 PM Monday Oct 5 in Texas
    expect(bucketOf(late, 'day').key).toBe('2026-10-05');
    expect(bucketOf(late, 'week').key).toBe('2026-10-05');
    expect(bucketOf(late, 'month').key).toBe('2026-10');
    expect(bucketOf(late, 'quarter').key).toBe('2026-Q4');
    expect(bucketOf(late, 'half').key).toBe('2026-H2');
    expect(bucketOf(late, 'year').key).toBe('2026');
  });
  it('never counts a rejected receipt or the second slip of a purchase already counted', () => {
    const rep = buildSpendReport([
      { id: 'a', transaction_at: '2026-10-01T15:00:00Z', total_cents: 1000, category: 'meals', status: 'approved' },
      { id: 'b', transaction_at: '2026-10-01T15:00:00Z', total_cents: 1000, category: 'meals', status: 'rejected' },
      { id: 'c', transaction_at: '2026-10-01T15:00:00Z', total_cents: 1000, category: 'meals', status: 'pending', superseded_by_receipt_id: 'a' },
    ], [], { period: 'month' });
    expect(rep.total).toBe(1000);
    expect(rep.excluded).toMatchObject({ rejected: 1, secondSlip: 1 });
  });
  it('filtering to one kind of item counts only that kind', () => {
    const rep = buildSpendReport(
      [{ id: 'r', transaction_at: '2026-10-01T15:00:00Z', total_cents: 1000, category: 'fuel', status: 'pending' }],
      [{ receipt_id: 'r', description: 'Gas', amount_cents: 800, category: 'fuel' }, { receipt_id: 'r', description: 'Chips', amount_cents: 200, category: 'meals' }],
      { period: 'month', category: 'meals' },
    );
    expect(rep.total).toBe(200);
    expect(rep.topItems.map((t) => t.description)).toEqual(['Chips']);
  });
});

describe('the audit gate', () => {
  const base = { read_status: 'needs_review', read_at: '2026-10-07T10:00:00Z', user_reviewed_at: null, approved_at: null, status: 'pending' };
  it('an unconfirmed reading blocks until a person approves or reviews it after it was read', () => {
    expect(readingStillDoubtful(base)).toBe(true);
    expect(readingStillDoubtful({ ...base, status: 'approved' })).toBe(false);
    expect(readingStillDoubtful({ ...base, user_reviewed_at: '2026-10-07T11:00:00Z' })).toBe(false);
    expect(readingStillDoubtful({ ...base, user_reviewed_at: '2026-10-06T11:00:00Z' })).toBe(true);
    expect(readingStillDoubtful({ ...base, read_status: 'agreed' })).toBe(false);
  });
  it('locking a period refuses while duplicates or unconfirmed readings remain', () => {
    const src = readFileSync('app/api/admin/finances/mark-exported/route.ts', 'utf8');
    expect(src).toContain('await auditBlockers(window.fromIso, window.toIso)');
    expect(src).toContain('status: 409');
  });
});
