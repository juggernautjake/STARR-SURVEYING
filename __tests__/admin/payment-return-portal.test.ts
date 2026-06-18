// __tests__/admin/payment-return-portal.test.ts
//
// P8 of payment-infrastructure-2026-06-18.md — locks the return-to-
// portal status view:
//   - lib/payments/invoice-public.ts gains describePaymentForReceipt,
//     maskPayerEmail, lastFour + the PublicPaymentSummary shape
//   - app/api/public/invoice/[number]/route.ts returns a `payments`
//     array on the response
//   - app/api/public/invoice/[number]/receipt/route.ts emails a
//     receipt copy to any address the customer types
//   - lib/payments/invoice-email.ts gains buildReceiptResend*
//   - app/pay/[invoice]/page.tsx's paid-card lists the cleared
//     payments and renders the "Email me a receipt" control

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  describePaymentForReceipt,
  lastFour,
  maskPayerEmail,
} from '@/lib/payments/invoice-public';
import {
  buildReceiptResendHtml,
  buildReceiptResendSubject,
  buildReceiptResendText,
} from '@/lib/payments/invoice-email';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('maskPayerEmail (pure)', () => {
  it("keeps the first char + masks the rest of the local part", () => {
    expect(maskPayerEmail('mary@example.com')).toBe('m***@example.com');
    expect(maskPayerEmail('a@b.com')).toBe('a*@b.com');
  });

  it("returns null for empty / non-string + leaves a non-email as-is", () => {
    expect(maskPayerEmail(null)).toBeNull();
    expect(maskPayerEmail('')).toBeNull();
    expect(maskPayerEmail(42 as unknown as string)).toBeNull();
    expect(maskPayerEmail('not-an-email')).toBe('not-an-email');
  });
});

describe('lastFour (pure)', () => {
  it("returns last 4 chars of a token", () => {
    expect(lastFour('pi_abc123XYZ')).toBe('3XYZ');
    expect(lastFour('SS-1234')).toBe('1234');
  });

  it("returns null for empty / non-string", () => {
    expect(lastFour(null)).toBeNull();
    expect(lastFour('')).toBeNull();
  });
});

describe('describePaymentForReceipt (pure)', () => {
  it("drops non-succeeded rows", () => {
    expect(describePaymentForReceipt({ status: 'pending', method: 'stripe', amount_cents: 100 })).toBeNull();
    expect(describePaymentForReceipt({ status: 'failed', method: 'stripe' })).toBeNull();
  });

  it("renders the method label + masks external_id + payer_email", () => {
    expect(describePaymentForReceipt({
      status: 'succeeded',
      method: 'stripe',
      amount_cents: 12500,
      cleared_at: '2026-06-18T12:00:00Z',
      external_id: 'pi_abc123XYZ',
      payer_email: 'mary@example.com',
    })).toEqual({
      amount_cents: 12500,
      method: 'stripe',
      method_label: 'Card or bank',
      cleared_at: '2026-06-18T12:00:00Z',
      external_id_tail: '3XYZ',
      payer_email_mask: 'm***@example.com',
    });
  });

  it("labels every method id from the P1 enum", () => {
    for (const m of ['stripe', 'venmo', 'cashapp', 'zelle', 'ach', 'cash', 'check', 'other']) {
      const s = describePaymentForReceipt({ status: 'succeeded', method: m });
      expect(s?.method_label).toBeTruthy();
      expect(s?.method_label).not.toBe(m === 'other' ? undefined : m);
    }
  });
});

describe('buildReceiptResend{Subject,Html,Text} (pure)', () => {
  const base = {
    invoice_number: 'SS-260618-A1B2',
    customer_name: 'Mary Smith',
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
    pay_link: 'https://starr-surveying.com/pay/ABCD1234XYZ56789',
  };

  it("subject mentions the invoice number", () => {
    expect(buildReceiptResendSubject({ invoice_number: 'SS-X' })).toBe('Receipt — Invoice SS-X');
  });

  it("html lists every payment row + the return-to-portal CTA", () => {
    const html = buildReceiptResendHtml(base);
    expect(html).toContain('Card or bank');
    expect(html).toContain('Venmo');
    expect(html).toContain('ending 3XYZ');
    expect(html).toContain('data-testid="receipt-link"');
    expect(html).toContain(base.pay_link);
  });

  it("HTML-escapes hostile customer names", () => {
    const html = buildReceiptResendHtml({ ...base, customer_name: '<img onerror=alert(1)>' });
    expect(html).not.toContain('<img onerror=alert(1)>');
  });

  it("text fallback contains the link + paid total", () => {
    const text = buildReceiptResendText(base);
    expect(text).toContain(base.pay_link);
    expect(text).toContain('Paid $1,250.00 of $1,250.00');
  });
});

describe('public invoice route — P8 payments array', () => {
  const SRC = read('app/api/public/invoice/[number]/route.ts');

  it("selects the receipt columns (method / cleared_at / external_id / payer_email)", () => {
    expect(SRC).toMatch(/\.select\('amount_cents, method, status, cleared_at, external_id, payer_email'\)/);
  });

  it("maps to PublicPaymentSummary via describePaymentForReceipt", () => {
    expect(SRC).toMatch(/describePaymentForReceipt/);
    expect(SRC).toMatch(/payments: paymentSummaries/);
  });

  it("payments column is sorted newest-first so the latest clearance is on top", () => {
    expect(SRC).toMatch(/\.order\('cleared_at', \{ ascending: false \}\)/);
  });
});

describe('receipt resend route — source-lock', () => {
  const SRC = read('app/api/public/invoice/[number]/receipt/route.ts');

  it("validates `to` is a non-empty email", () => {
    expect(SRC).toMatch(/!to\.includes\('@'\)/);
    expect(SRC).toMatch(/Please enter a valid email address/);
  });

  it("refuses unpaid invoices with 409", () => {
    expect(SRC).toMatch(/No cleared payments yet/);
    expect(SRC).toMatch(/status: 409/);
  });

  it("uses the pure receipt builders for the email body", () => {
    expect(SRC).toMatch(/buildReceiptResendSubject/);
    expect(SRC).toMatch(/buildReceiptResendHtml/);
    expect(SRC).toMatch(/buildReceiptResendText/);
  });

  it("stamps a payment_receipts row (audit trail of every resend)", () => {
    expect(SRC).toMatch(/\.from\('payment_receipts'\)\.insert\(/);
    expect(SRC).toMatch(/sent_to_email: to/);
  });

  it("Resend HTTP API + brand From + dev-mode tolerant", () => {
    expect(SRC).toMatch(/fetch\('https:\/\/api\.resend\.com\/emails'/);
    expect(SRC).toMatch(/Starr Surveying <info@starr-surveying\.com>/);
    expect(SRC).toMatch(/\[receipt-resend\] DEV/);
  });
});

describe('app/pay/[invoice]/page.tsx — P8 paid-card extras', () => {
  const SRC = read('app/pay/[invoice]/page.tsx');

  it("renders the cleared-payment list with method + amount + ref tail", () => {
    expect(SRC).toMatch(/data-testid="pay-paid-payments"/);
    expect(SRC).toMatch(/method_label/);
    expect(SRC).toMatch(/external_id_tail/);
  });

  it("renders the email-receipt control inside the paid card", () => {
    expect(SRC).toMatch(/data-testid="pay-paid-receipt"/);
    expect(SRC).toMatch(/data-testid="pay-paid-receipt-input"/);
    expect(SRC).toMatch(/data-testid="pay-paid-receipt-submit"/);
  });

  it("POSTs to /api/public/invoice/<n>/receipt with the typed email", () => {
    expect(SRC).toMatch(/fetch\(`\/api\/public\/invoice\/\$\{encodeURIComponent\(invoice\.invoice_number\)\}\/receipt`/);
    expect(SRC).toMatch(/body: JSON\.stringify\(\{ to \}\)/);
  });

  it("flips to a sent state after the resend succeeds", () => {
    expect(SRC).toMatch(/setReceiptStatus\('sent'\)/);
    expect(SRC).toMatch(/data-testid="pay-paid-receipt-sent"/);
  });
});

describe('P8 plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/completed/payment-infrastructure-2026-06-18.md');

  it("plan still references the return-to-portal status view scope", () => {
    expect(PLAN).toMatch(/Return-to-portal status view/);
  });
});
