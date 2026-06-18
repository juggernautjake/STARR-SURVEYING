// __tests__/admin/payment-receipt-pdf.test.ts
//
// P9 of payment-infrastructure-2026-06-18.md — locks the receipt-
// PDF pipeline:
//   - lib/payments/receipt-pdf.ts: pure buildReceiptModel +
//     renderReceiptPdf (pdfkit-backed Buffer)
//   - app/api/public/invoice/[number]/receipt/pdf/route.ts: GET
//     returns application/pdf with the right Content-Disposition

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildReceiptModel, renderReceiptPdf } from '@/lib/payments/receipt-pdf';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const baseInput = {
  invoice_number: 'SS-260618-A1B2',
  customer_name: 'Mary Smith',
  customer_email: 'mary@example.com',
  total_cents: 125000,
  paid_cents: 125000,
  payments: [
    {
      amount_cents: 100000,
      method_label: 'Card or bank',
      cleared_at: '2026-06-18T12:00:00Z',
      external_id_tail: '3XYZ',
    },
    {
      amount_cents: 25000,
      method_label: 'Venmo',
      cleared_at: '2026-06-19T12:00:00Z',
      external_id_tail: null,
    },
  ],
  office_address_line1: '3779 W FM 436',
  office_address_line2: 'Belton, TX 76513',
  office_phone: '(936) 662-0077',
  pay_link: 'https://starr-surveying.com/pay/ABCD1234XYZ56789',
};

describe('buildReceiptModel (pure)', () => {
  it("greets with the customer name when present", () => {
    expect(buildReceiptModel(baseInput).greeting).toBe('Receipt for Mary Smith');
    expect(buildReceiptModel({ ...baseInput, customer_name: null }).greeting).toBe('Receipt');
  });

  it("summarizes paid / total in dollars", () => {
    expect(buildReceiptModel(baseInput).paid_summary).toBe('Paid $1,250.00 of $1,250.00');
  });

  it("renders one row per payment with 'ending XXXX' annotation when present", () => {
    const m = buildReceiptModel(baseInput);
    expect(m.payment_rows).toHaveLength(2);
    expect(m.payment_rows[0].method).toBe('Card or bank (ending 3XYZ)');
    expect(m.payment_rows[1].method).toBe('Venmo');
    expect(m.payment_rows[0].amount).toBe('$1,000.00');
    expect(m.payment_rows[1].amount).toBe('$250.00');
  });

  it("packs the office footer + portal return text", () => {
    const m = buildReceiptModel(baseInput);
    expect(m.office_lines).toEqual([
      'Starr Surveying',
      '3779 W FM 436',
      'Belton, TX 76513',
      '(936) 662-0077',
    ]);
    expect(m.return_to_portal_text).toBe('View your invoice anytime: https://starr-surveying.com/pay/ABCD1234XYZ56789');
  });

  it("uses the injected `generated_at` for deterministic snapshots", () => {
    const m = buildReceiptModel({ ...baseInput, generated_at: new Date('2026-06-18T00:00:00Z') });
    expect(m.generated_at_label).toMatch(/Generated /);
  });
});

describe('renderReceiptPdf (smoke)', () => {
  it("returns a valid PDF buffer (starts with the %PDF magic)", async () => {
    const model = buildReceiptModel(baseInput);
    const buf = await renderReceiptPdf(model);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });

  it("contains the invoice number text somewhere in the binary stream", async () => {
    const model = buildReceiptModel(baseInput);
    const buf = await renderReceiptPdf(model);
    // PDFs aren't plain text but pdfkit stores text strings literally
    // in the content stream (not encrypted, not compressed by default
    // for short docs).
    expect(buf.includes(Buffer.from(baseInput.invoice_number, 'latin1'))).toBe(true);
  });
});

describe('public receipt PDF route — source-lock', () => {
  const SRC = read('app/api/public/invoice/[number]/receipt/pdf/route.ts');

  it("exports GET wrapped by withErrorHandler", () => {
    expect(SRC).toMatch(/export const GET = withErrorHandler/);
  });

  it("looks up by invoice_number OR public_slug, blocks drafts/voided", () => {
    expect(SRC).toMatch(/invoice_number\.eq\.\$\{upper\},public_slug\.eq\.\$\{rawKey\}/);
    expect(SRC).toMatch(/PUBLIC_BLOCKED_STATUSES\.has\(invoice\.status\)/);
  });

  it("refuses unpaid invoices with 409 (no receipt to render)", () => {
    expect(SRC).toMatch(/No cleared payments yet/);
    expect(SRC).toMatch(/status: 409/);
  });

  it("builds the model then calls the PDF renderer", () => {
    expect(SRC).toMatch(/buildReceiptModel\(/);
    expect(SRC).toMatch(/renderReceiptPdf\(model\)/);
  });

  it("returns application/pdf with an inline filename", () => {
    expect(SRC).toMatch(/'Content-Type': 'application\/pdf'/);
    expect(SRC).toMatch(/'Content-Disposition': `inline; filename="Receipt_\$\{invoice\.invoice_number\}\.pdf"`/);
    expect(SRC).toMatch(/'Cache-Control': 'private, max-age=0, must-revalidate'/);
  });

  it("uses office mailing address constants (single source of truth)", () => {
    expect(SRC).toMatch(/OFFICE_ADDRESS_LINE1/);
    expect(SRC).toMatch(/OFFICE_ADDRESS_LINE2/);
  });
});

describe('P9 plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/completed/payment-infrastructure-2026-06-18.md');

  it("plan still references the receipt PDF scope", () => {
    expect(PLAN).toMatch(/Receipt PDF/);
  });
});
