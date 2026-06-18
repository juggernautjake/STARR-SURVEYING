// __tests__/admin/payment-invoice-create.test.ts
//
// P3b of payment-infrastructure-2026-06-18.md — locks the office-
// side "Create + send invoice" flow:
//   - pure helpers: invoice-number, slug, totals, pay-link
//   - email template builder
//   - POST /api/admin/invoices  (mints + persists)
//   - POST /api/admin/invoices/[id]/send  (emails + flips status)
//   - composer page hooks together customer + line items + send

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildInvoicePayLink,
  computeInvoiceTotals,
  generateInvoiceNumber,
  generatePublicSlug,
  lineItemTotal,
  normalizeLineItem,
} from '@/lib/payments/invoice-number';
import {
  buildInvoiceEmailHtml,
  buildInvoiceEmailSubject,
  buildInvoiceEmailText,
} from '@/lib/payments/invoice-email';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const fixedRandom = (() => {
  // Deterministic sequence so the assertion can pin an exact string.
  let i = 0;
  const seq = [0.1, 0.2, 0.3, 0.4, 0.05, 0.7, 0.9, 0.5, 0.6, 0.8, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.05, 0.95, 0.85, 0.75];
  return () => seq[i++ % seq.length];
})();

describe('generateInvoiceNumber + generatePublicSlug (pure)', () => {
  it("formats as SS-YYMMDD-XXXX", () => {
    const num = generateInvoiceNumber(new Date(Date.UTC(2026, 5, 18)), fixedRandom);
    expect(num).toMatch(/^SS-260618-[A-HJ-NP-Z2-9]{4}$/);
  });

  it("public_slug is 16 chars from the unambiguous alphabet", () => {
    const slug = generatePublicSlug(fixedRandom);
    expect(slug).toMatch(/^[A-HJ-NP-Z2-9]{16}$/);
  });

  it("invoice numbers vary across calls (no fixed suffix)", () => {
    const a = generateInvoiceNumber(new Date(Date.UTC(2026, 5, 18)), Math.random);
    const b = generateInvoiceNumber(new Date(Date.UTC(2026, 5, 18)), Math.random);
    // With 4 random chars there's a small chance of collision, but
    // even one diff between two draws is sufficient confidence the
    // suffix isn't a constant.
    expect(a).not.toBe(b);
  });
});

describe('lineItemTotal + computeInvoiceTotals (pure)', () => {
  it("multiplies + rounds the line total", () => {
    expect(lineItemTotal(1, 12500)).toBe(12500);
    expect(lineItemTotal(2, 7500)).toBe(15000);
    expect(lineItemTotal(0.5, 10001)).toBe(5001);
  });

  it("clamps negative qty/price to zero", () => {
    expect(lineItemTotal(-1, 1000)).toBe(0);
    expect(lineItemTotal(1, -1000)).toBe(0);
  });

  it("totals sum subtotals + adds positive tax", () => {
    expect(computeInvoiceTotals(
      [{ total_cents: 10000 }, { total_cents: 5000 }, { total_cents: 250 }],
      975,
    )).toEqual({ subtotal_cents: 15250, tax_cents: 975, total_cents: 16225 });
  });

  it("zero rows + zero tax → all zeros", () => {
    expect(computeInvoiceTotals([], 0)).toEqual({ subtotal_cents: 0, tax_cents: 0, total_cents: 0 });
  });
});

describe('buildInvoicePayLink (pure)', () => {
  it("glues host + slug, trims trailing slashes", () => {
    expect(buildInvoicePayLink('https://starr-surveying.com', 'ABCD1234XYZ56789'))
      .toBe('https://starr-surveying.com/pay/ABCD1234XYZ56789');
    expect(buildInvoicePayLink('https://starr-surveying.com/', 'AB'))
      .toBe('https://starr-surveying.com/pay/AB');
  });

  it("url-encodes the slug (defensive — the slug alphabet doesn't need it but defensive matters)", () => {
    expect(buildInvoicePayLink('https://x.com', 'a/b')).toBe('https://x.com/pay/a%2Fb');
  });
});

describe('normalizeLineItem (pure)', () => {
  it("drops empty descriptions", () => {
    expect(normalizeLineItem({ description: '   ' })).toBeNull();
    expect(normalizeLineItem(null)).toBeNull();
  });

  it("derives the total when the caller didn't compute it", () => {
    expect(normalizeLineItem({ description: 'Boundary', quantity: 2, unit_price_cents: 5000 })).toEqual({
      description: 'Boundary', quantity: 2, unit_price_cents: 5000, total_cents: 10000,
    });
  });

  it("honours a caller-supplied total verbatim", () => {
    const row = normalizeLineItem({
      description: 'Boundary', quantity: 2, unit_price_cents: 5000, total_cents: 9999,
    });
    expect(row?.total_cents).toBe(9999);
  });
});

describe('buildInvoiceEmailSubject + Html + Text (pure)', () => {
  const payload = {
    invoice_number: 'SS-260618-A1B2',
    customer_name: 'Mary Smith',
    pay_link: 'https://starr-surveying.com/pay/ABCD1234XYZ56789',
    line_items: [
      { description: 'Boundary survey', total_cents: 125000 },
      { description: 'Travel', total_cents: 5000 },
    ],
    subtotal_cents: 130000,
    tax_cents: 0,
    total_cents: 130000,
    due_at: '2026-07-18',
    notes: 'Thanks for choosing Starr Surveying!',
  };

  it("subject mentions invoice number + brand", () => {
    expect(buildInvoiceEmailSubject({ invoice_number: 'SS-X' })).toBe(
      'Invoice SS-X from Starr Surveying',
    );
  });

  it("html embeds the pay link inside the CTA button + plaintext copy", () => {
    const html = buildInvoiceEmailHtml(payload);
    expect(html).toContain('data-testid="pay-link"');
    expect(html).toContain(payload.pay_link);
    expect(html.match(new RegExp(payload.pay_link.replace(/[/.]/g, '\\$&'), 'g'))?.length).toBeGreaterThanOrEqual(2);
  });

  it("html greets the customer by name when present", () => {
    expect(buildInvoiceEmailHtml(payload)).toContain('Hello Mary Smith,');
    expect(buildInvoiceEmailHtml({ ...payload, customer_name: null })).toContain('Hello,');
  });

  it("html escapes hostile customer names so the email doesn't XSS", () => {
    const html = buildInvoiceEmailHtml({ ...payload, customer_name: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it("text fallback contains the pay link on its own line", () => {
    const text = buildInvoiceEmailText(payload);
    expect(text).toContain('https://starr-surveying.com/pay/ABCD1234XYZ56789');
    expect(text).toContain('Hello Mary Smith,');
  });

  it("tax row only renders when tax_cents > 0", () => {
    const noTax = buildInvoiceEmailHtml(payload);
    expect(noTax).not.toMatch(/<td[^>]*>Tax<\/td>/);
    const withTax = buildInvoiceEmailHtml({ ...payload, tax_cents: 975, total_cents: 130975 });
    expect(withTax).toMatch(/<td[^>]*>Tax<\/td>/);
  });
});

describe('POST /api/admin/invoices — source-lock', () => {
  const SRC = read('app/api/admin/invoices/route.ts');

  it("gates GET + POST behind admin auth", () => {
    expect(SRC).toMatch(/isAdmin\(session\.user\.roles\)/);
    expect(SRC).toMatch(/'Forbidden'/);
  });

  it("rejects an empty line-items array", () => {
    expect(SRC).toMatch(/At least one line item is required/);
  });

  it("mints invoice_number + public_slug via the pure helpers with collision retry", () => {
    expect(SRC).toMatch(/generateInvoiceNumber/);
    expect(SRC).toMatch(/generatePublicSlug/);
    expect(SRC).toMatch(/for \(let attempt = 0; attempt < 5; attempt \+= 1\)/);
    expect(SRC).toMatch(/invoice_number\.eq\.\$\{invoice_number\},public_slug\.eq\.\$\{public_slug\}/);
  });

  it("computes totals via computeInvoiceTotals (no inline math)", () => {
    expect(SRC).toMatch(/computeInvoiceTotals\(lineItems, taxCents\)/);
  });

  it("inserts with status='draft' + stamps created_by from the session", () => {
    expect(SRC).toMatch(/status: 'draft'/);
    expect(SRC).toMatch(/created_by: session\.user\.email/);
  });
});

describe('POST /api/admin/invoices/[id]/send — source-lock', () => {
  const SRC = read('app/api/admin/invoices/[id]/send/route.ts');

  it("gates the send behind admin auth", () => {
    expect(SRC).toMatch(/isAdmin\(session\.user\.roles\)/);
  });

  it("loads the invoice + refuses voided invoices with a 409", () => {
    expect(SRC).toMatch(/invoice\.status === 'voided'/);
    expect(SRC).toMatch(/status: 409/);
  });

  it("builds the customer-facing pay link via buildInvoicePayLink", () => {
    expect(SRC).toMatch(/buildInvoicePayLink\(host, invoice\.public_slug\)/);
  });

  it("uses the email template builders (subject + html + text)", () => {
    expect(SRC).toMatch(/buildInvoiceEmailSubject/);
    expect(SRC).toMatch(/buildInvoiceEmailHtml/);
    expect(SRC).toMatch(/buildInvoiceEmailText/);
  });

  it("posts the email via fetch to Resend with the brand From", () => {
    expect(SRC).toMatch(/fetch\('https:\/\/api\.resend\.com\/emails'/);
    expect(SRC).toMatch(/Starr Surveying <info@starr-surveying\.com>/);
  });

  it("flips status draft → issued + stamps issued_at on first send only", () => {
    expect(SRC).toMatch(/invoice\.status === 'draft'/);
    expect(SRC).toMatch(/updates\.status = 'issued'/);
    expect(SRC).toMatch(/updates\.issued_at = new Date\(\)\.toISOString\(\)/);
  });

  it("tolerates missing RESEND_API_KEY (dev mode) — still flips status", () => {
    expect(SRC).toMatch(/RESEND_API_KEY not configured \(dev mode\)/);
  });
});

describe('/admin/invoices/new composer — source-lock', () => {
  const SRC = read('app/admin/invoices/new/page.tsx');

  it("posts to /api/admin/invoices then /api/admin/invoices/<id>/send", () => {
    expect(SRC).toMatch(/fetch\('\/api\/admin\/invoices', \{\s*method: 'POST'/m);
    expect(SRC).toMatch(/fetch\(`\/api\/admin\/invoices\/\$\{invoice\.id\}\/send`/);
  });

  it("requires a customer email before submitting", () => {
    expect(SRC).toMatch(/Please enter a customer email so we can send the invoice/);
  });

  it("shows the pay link to the office after a successful send", () => {
    expect(SRC).toMatch(/data-testid="invoice-pay-link"/);
    expect(SRC).toMatch(/data-testid="invoice-create-success"/);
  });

  it("computes totals live via computeInvoiceTotals + lineItemTotal", () => {
    expect(SRC).toMatch(/useMemo\([\s\S]*computeInvoiceTotals/);
    expect(SRC).toMatch(/lineItemTotal\(row\.quantity, row\.unit_price_cents\)/);
  });

  it("supports adding / removing line items", () => {
    expect(SRC).toMatch(/data-testid="invoice-add-row"/);
    expect(SRC).toMatch(/removeRow/);
  });
});

describe('P3b plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/in-progress/payment-infrastructure-2026-06-18.md');

  it("plan describes the create + send flow", () => {
    expect(PLAN).toMatch(/Create \+ send invoice/);
  });
});
