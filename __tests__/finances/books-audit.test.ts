// __tests__/finances/books-audit.test.ts
//
// Owner ask: *"run an AI audit of all receipts and expenditures and invoices for a given period to
// make sure they are all correct and make sense."*
//
// Everything asserted here is the DETERMINISTIC half. It is the half that matters most: a
// hallucinated discrepancy costs somebody an afternoon hunting for money that was never missing, and
// after that happens once nobody runs the audit again. So every number in the report is computed
// here, and the model only ever sees these findings.
//
// The recurring theme below is restraint. An auditor that flags everything is an auditor nobody
// reads, so several tests assert that ordinary bookkeeping produces NO finding.

import { describe, it, expect } from 'vitest';
import { auditBooks, type AuditInput, type AuditReceipt, type AuditInvoice } from '@/lib/finances/books-audit';

const NOW = Date.parse('2026-08-08T12:00:00Z');

const receipt = (o: Partial<AuditReceipt> & { id: string }): AuditReceipt => ({
  vendor_name: 'Chevron', category: 'fuel', tax_deductible_flag: 'full',
  total_cents: 5_000, status: 'approved',
  transaction_at: '2026-07-10T10:00:00Z', created_at: '2026-07-10T18:00:00Z', ...o,
});

const invoice = (o: Partial<AuditInvoice> & { id: string }): AuditInvoice => ({
  invoice_number: 'SS-1', status: 'paid', customer_name: 'A Customer',
  total_cents: 100_000, issued_at: '2026-07-01T10:00:00Z',
  due_at: '2026-07-31T10:00:00Z', paid_at: '2026-07-15T10:00:00Z', ...o,
});

const run = (o: Partial<AuditInput> = {}) =>
  auditBooks({
    from: '2026-07-01', to: '2026-07-31',
    receipts: [], invoices: [], payments: [], adSpendCents: 0, now: NOW, ...o,
  });

const cat = (r: ReturnType<typeof run>, c: string) => r.findings.filter((f) => f.category === c);

describe('a clean set of books', () => {
  it('produces no findings at all', () => {
    // The most important test here. An auditor that always finds something is an auditor nobody runs.
    const out = run({
      receipts: [receipt({ id: 'r1' }), receipt({ id: 'r2', total_cents: 6_100 })],
      invoices: [invoice({ id: 'i1' })],
      payments: [{ invoice_id: 'i1', amount_cents: 100_000, status: 'succeeded' }],
    });
    expect(out.findings).toEqual([]);
    expect(out.questioned_cents).toBe(0);
  });

  it('still reports the totals it checked', () => {
    // A report that says "nothing wrong" without saying what it looked at is not evidence.
    const out = run({
      receipts: [receipt({ id: 'r1', total_cents: 5_000 })],
      invoices: [invoice({ id: 'i1', total_cents: 100_000 })],
      payments: [{ invoice_id: 'i1', amount_cents: 100_000, status: 'succeeded' }],
      adSpendCents: 84_000,
    });
    expect(out.totals).toMatchObject({
      receipt_count: 1, receipt_cents: 5_000,
      invoice_count: 1, invoiced_cents: 100_000,
      paid_cents: 100_000, ad_spend_cents: 84_000,
    });
  });
});

describe('receipt checks', () => {
  it('flags a missing vendor as unauditable', () => {
    const out = run({ receipts: [receipt({ id: 'r1', vendor_name: null })] });
    expect(cat(out, 'receipt.no-vendor')).toHaveLength(1);
  });

  it('flags a missing category, which breaks the Schedule C mapping', () => {
    const out = run({ receipts: [receipt({ id: 'r1', category: null })] });
    expect(cat(out, 'receipt.uncategorised')).toHaveLength(1);
  });

  it('flags deductibility left on "review"', () => {
    // The tax summary treats 'review' as 0% deductible, so this silently forfeits the deduction
    // rather than claiming it wrongly — a loss that never announces itself.
    const out = run({ receipts: [receipt({ id: 'r1', tax_deductible_flag: 'review' })] });
    expect(cat(out, 'receipt.unreviewed-deductibility')).toHaveLength(1);
  });

  it('treats a zero or negative total as high severity', () => {
    const out = run({ receipts: [receipt({ id: 'r1', total_cents: 0 })] });
    const f = cat(out, 'receipt.non-positive-total');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('high');
  });

  it('flags an outlier against its own category, not against everything', () => {
    // A big survey is normal; fuel at 20x the usual is not. Comparing across categories would flag
    // every large legitimate expense and miss the small anomalous one.
    const fuel = Array.from({ length: 6 }, (_, i) =>
      receipt({ id: `f${i}`, category: 'fuel', total_cents: 5_000, vendor_name: `Station ${i}` }));
    const out = run({ receipts: [...fuel, receipt({ id: 'big', category: 'fuel', total_cents: 90_000, vendor_name: 'Odd Station' })] });
    const f = cat(out, 'receipt.amount-outlier');
    expect(f).toHaveLength(1);
    expect(f[0].ids).toEqual(['big']);
  });

  it('does not call anything an outlier in a thin category', () => {
    // With two receipts the larger is always "5x the median", so the check would fire on every new
    // category the firm starts using.
    const out = run({
      receipts: [
        receipt({ id: 'a', category: 'lodging', total_cents: 5_000, vendor_name: 'Motel A' }),
        receipt({ id: 'b', category: 'lodging', total_cents: 90_000, vendor_name: 'Motel B' }),
      ],
    });
    expect(cat(out, 'receipt.amount-outlier')).toEqual([]);
  });

  it('flags a receipt filed long after the purchase', () => {
    const out = run({
      receipts: [receipt({ id: 'r1', transaction_at: '2026-05-01T10:00:00Z', created_at: '2026-07-30T10:00:00Z' })],
    });
    expect(cat(out, 'receipt.filed-late')).toHaveLength(1);
  });

  it('does not flag same-day filing', () => {
    const out = run({ receipts: [receipt({ id: 'r1' })] });
    expect(cat(out, 'receipt.filed-late')).toEqual([]);
  });
});

describe('invoice checks', () => {
  it('flags an invoice marked paid with no payment behind it', () => {
    // The shape that makes revenue look real when no money arrived — and it survives because the
    // invoice list and the bank statement each look fine on their own.
    const out = run({ invoices: [invoice({ id: 'i1' })], payments: [] });
    const f = cat(out, 'invoice.paid-without-payment');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('high');
    expect(f[0].amount_cents).toBe(100_000);
  });

  it('accepts an invoice with a succeeded payment', () => {
    const out = run({
      invoices: [invoice({ id: 'i1' })],
      payments: [{ invoice_id: 'i1', amount_cents: 100_000, status: 'succeeded' }],
    });
    expect(cat(out, 'invoice.paid-without-payment')).toEqual([]);
  });

  it('does not count a failed payment as payment', () => {
    const out = run({
      invoices: [invoice({ id: 'i1' })],
      payments: [{ invoice_id: 'i1', amount_cents: 100_000, status: 'failed' }],
    });
    expect(cat(out, 'invoice.paid-without-payment')).toHaveLength(1);
  });

  it('flags an unpaid invoice past its due date', () => {
    const out = run({
      invoices: [invoice({ id: 'i1', status: 'sent', paid_at: null, due_at: '2026-07-01T10:00:00Z' })],
    });
    expect(cat(out, 'invoice.overdue')).toHaveLength(1);
  });

  it('does not call an unpaid invoice overdue before its due date', () => {
    const out = run({
      invoices: [invoice({ id: 'i1', status: 'sent', paid_at: null, due_at: '2026-12-01T10:00:00Z' })],
    });
    expect(cat(out, 'invoice.overdue')).toEqual([]);
  });

  it('flags inverted timestamps', () => {
    const out = run({
      invoices: [invoice({ id: 'i1', issued_at: '2026-07-20T10:00:00Z', paid_at: '2026-07-10T10:00:00Z' })],
      payments: [{ invoice_id: 'i1', amount_cents: 100_000, status: 'succeeded' }],
    });
    expect(cat(out, 'invoice.paid-before-issued')).toHaveLength(1);
  });

  it('flags an overpayment and reports only the excess', () => {
    const out = run({
      invoices: [invoice({ id: 'i1', total_cents: 100_000 })],
      payments: [{ invoice_id: 'i1', amount_cents: 150_000, status: 'succeeded' }],
    });
    const f = cat(out, 'invoice.overpaid');
    expect(f).toHaveLength(1);
    expect(f[0].amount_cents).toBe(50_000);
  });
});

describe('the report itself', () => {
  it('puts high severity first, then the largest amount', () => {
    const out = run({
      receipts: [receipt({ id: 'r1', category: null, total_cents: 1_000 })],
      invoices: [invoice({ id: 'i1', total_cents: 500_000 })],
    });
    expect(out.findings[0].severity).toBe('high');
  });

  it('reuses the shared duplicate detector rather than a second definition', () => {
    // Three definitions of "counted twice" is how three screens disagree about one situation.
    const out = run({
      receipts: [
        receipt({ id: 'a', vendor_name: 'Home Depot', total_cents: 12_000, category: 'supplies', transaction_at: '2026-07-10T10:00:00Z' }),
        receipt({ id: 'b', vendor_name: 'Home Depot', total_cents: 12_000, category: 'supplies', transaction_at: '2026-07-11T10:00:00Z' }),
      ],
    });
    const dupes = out.findings.filter((f) => f.category.startsWith('duplicate.'));
    expect(dupes).toHaveLength(1);
    expect(dupes[0].severity).toBe('high');
  });

  it('sums what it is questioning', () => {
    const out = run({ invoices: [invoice({ id: 'i1', total_cents: 100_000 })] });
    expect(out.questioned_cents).toBe(100_000);
  });
});
