// __tests__/admin/payment-portal-landing.test.ts
//
// P4 of payment-infrastructure-2026-06-18.md — locks the customer
// portal landing surface:
//   - lib/payments/live.ts: PAYMENT_METHODS catalog + helpers
//   - app/api/public/invoice/[number]/route.ts: read-only lookup
//   - app/pay/page.tsx: landing form
//   - app/pay/[invoice]/page.tsx: invoice detail + methods picker

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  PAYMENT_METHODS,
  STARR_VENMO_HANDLE,
  STARR_CASHAPP_HANDLE,
  STARR_ZELLE_EMAIL,
  buildDeepLink,
  describeInvoiceStatus,
  formatDollars,
  paymentsAreLive,
} from '@/lib/payments/live';
import { sanitizeLineItems, sumSucceededPayments } from '@/lib/payments/invoice-public';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('lib/payments/live — PAYMENT_METHODS catalog', () => {
  it("exposes Stripe, Venmo, CashApp, Zelle, cash, check (six methods)", () => {
    const ids = PAYMENT_METHODS.map((m) => m.id);
    expect(ids).toEqual(['stripe', 'venmo', 'cashapp', 'zelle', 'cash', 'check']);
  });

  it("each method ids match the P1 enum (no drift)", () => {
    const allowed = new Set(['stripe', 'venmo', 'cashapp', 'zelle', 'ach', 'cash', 'check']);
    for (const m of PAYMENT_METHODS) {
      expect(allowed.has(m.id)).toBe(true);
    }
  });

  it("publishes the company handles surveyors handed out to customers", () => {
    expect(STARR_VENMO_HANDLE).toBe('@StarrSurveying');
    expect(STARR_CASHAPP_HANDLE).toBe('$StarrSurveying');
    expect(STARR_ZELLE_EMAIL).toBe('info@starr-surveying.com');
  });

  it("paymentsAreLive defaults to false (never live unless explicit)", () => {
    expect(paymentsAreLive({} as NodeJS.ProcessEnv)).toBe(false);
    expect(paymentsAreLive({ PAYMENTS_LIVE: 'false' } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(paymentsAreLive({ PAYMENTS_LIVE: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });
});

describe('lib/payments/live — buildDeepLink', () => {
  it("fills the Venmo template with dollars + note", () => {
    const venmo = PAYMENT_METHODS.find((m) => m.id === 'venmo')!;
    const link = buildDeepLink(venmo, 'SS-260618-A1B2', 12345);
    expect(link).toContain('amount=123.45');
    expect(link).toContain('Invoice%20SS-260618-A1B2');
    expect(link).toContain('Starr%20Surveying');
  });

  it("fills the Cash App template with dollars only", () => {
    const cashapp = PAYMENT_METHODS.find((m) => m.id === 'cashapp')!;
    expect(buildDeepLink(cashapp, 'SS-XXX', 5000)).toBe('https://cash.app/$StarrSurveying/50.00');
  });

  it("returns null for methods without a template (Stripe / cash / check / Zelle)", () => {
    expect(buildDeepLink(PAYMENT_METHODS.find((m) => m.id === 'stripe')!, 'X', 100)).toBeNull();
    expect(buildDeepLink(PAYMENT_METHODS.find((m) => m.id === 'cash')!, 'X', 100)).toBeNull();
    expect(buildDeepLink(PAYMENT_METHODS.find((m) => m.id === 'check')!, 'X', 100)).toBeNull();
    expect(buildDeepLink(PAYMENT_METHODS.find((m) => m.id === 'zelle')!, 'X', 100)).toBeNull();
  });

  it("clamps negative cents to zero so the template never shows -$X.XX", () => {
    const venmo = PAYMENT_METHODS.find((m) => m.id === 'venmo')!;
    expect(buildDeepLink(venmo, 'X', -100)).toContain('amount=0.00');
  });
});

describe('lib/payments/live — formatDollars + describeInvoiceStatus', () => {
  it("formatDollars renders cents as USD", () => {
    expect(formatDollars(0)).toBe('$0.00');
    expect(formatDollars(12345)).toBe('$123.45');
    expect(formatDollars(null)).toBe('$0.00');
    expect(formatDollars(undefined)).toBe('$0.00');
    expect(formatDollars(Number.NaN)).toBe('$0.00');
  });

  it("describeInvoiceStatus maps every P1 status to a label + tone", () => {
    expect(describeInvoiceStatus('paid')).toEqual({ label: 'Paid in full', tone: 'success' });
    expect(describeInvoiceStatus('partial')).toEqual({ label: 'Partially paid', tone: 'warn' });
    expect(describeInvoiceStatus('overdue')).toEqual({ label: 'Overdue', tone: 'danger' });
    expect(describeInvoiceStatus('voided')).toEqual({ label: 'Voided', tone: 'info' });
    expect(describeInvoiceStatus('refunded')).toEqual({ label: 'Refunded', tone: 'info' });
    expect(describeInvoiceStatus('issued')).toEqual({ label: 'Awaiting payment', tone: 'info' });
    expect(describeInvoiceStatus('draft')).toEqual({ label: 'Draft', tone: 'info' });
  });

  it("describeInvoiceStatus tolerates unknown / null statuses", () => {
    expect(describeInvoiceStatus(null).label).toBe('Unknown');
    expect(describeInvoiceStatus('weird-status').label).toBe('weird-status');
  });
});

describe('api/public/invoice/[number] — pure helpers', () => {
  it("sanitizeLineItems strips non-object rows + missing fields", () => {
    expect(sanitizeLineItems([
      { description: 'Boundary survey', quantity: 1, unit_price_cents: 125000, total_cents: 125000 },
      null,
      'not an object',
      { description: 'Travel', total_cents: 5000 },
    ])).toEqual([
      { description: 'Boundary survey', quantity: 1, unit_price_cents: 125000, total_cents: 125000 },
      { description: 'Travel', quantity: 1, unit_price_cents: 0, total_cents: 5000 },
    ]);
    expect(sanitizeLineItems(null)).toEqual([]);
    expect(sanitizeLineItems(undefined)).toEqual([]);
  });

  it("sumSucceededPayments only counts succeeded rows", () => {
    expect(sumSucceededPayments([
      { amount_cents: 10000, status: 'succeeded' },
      { amount_cents: 5000, status: 'pending' },
      { amount_cents: 2500, status: 'succeeded' },
      { amount_cents: 1000, status: 'failed' },
    ])).toBe(12500);
    expect(sumSucceededPayments([])).toBe(0);
  });
});

describe('api/public/invoice/[number] — source-lock', () => {
  const SRC = read('app/api/public/invoice/[number]/route.ts');

  it("exports GET wrapped by withErrorHandler", () => {
    expect(SRC).toMatch(/export const GET = withErrorHandler/);
  });

  it("looks up by invoice_number OR public_slug (case-insensitive on the number)", () => {
    expect(SRC).toMatch(/\.or\(`invoice_number\.eq\.\$\{upper\},public_slug\.eq\.\$\{rawKey\}`\)/);
  });

  it("blocks draft + voided invoices from the public surface", () => {
    expect(SRC).toMatch(/PUBLIC_BLOCKED_STATUSES/);
    expect(SRC).toMatch(/status: 410/);
  });

  it("returns balance_cents = total_cents - sum(succeeded payments)", () => {
    expect(SRC).toMatch(/sumSucceededPayments/);
    expect(SRC).toMatch(/balance = Math\.max\(0, total - paid\)/);
  });

  it("explicitly selects only the public columns (no SELECT * leak)", () => {
    // The .select() call enumerates exactly the columns the customer
    // gets — no org_id, no billing_address, no customer email, etc.
    expect(SRC).toMatch(
      /\.select\('invoice_number, public_slug, status, customer_name, subtotal_cents, tax_cents, total_cents, issued_at, due_at, paid_at, line_items'\)/,
    );
    // PublicInvoice TS type also excludes the sensitive columns.
    expect(SRC).not.toMatch(/customer_email:/);
    expect(SRC).not.toMatch(/customer_phone:/);
    expect(SRC).not.toMatch(/billing_address:/);
  });
});

describe('app/pay/page.tsx — landing form', () => {
  const SRC = read('app/pay/page.tsx');

  it("renders the invoice-number input + submit", () => {
    expect(SRC).toMatch(/data-testid="pay-invoice-input"/);
    expect(SRC).toMatch(/data-testid="pay-invoice-submit"/);
  });

  it("calls /api/public/invoice/<number> before navigating", () => {
    expect(SRC).toMatch(/fetch\(`\/api\/public\/invoice\/\$\{encodeURIComponent\(trimmed\)\}`\)/);
    expect(SRC).toMatch(/router\.push\(`\/pay\/\$\{encodeURIComponent\(trimmed\)\}`\)/);
  });

  it("surfaces 404 + 410 with customer-friendly copy", () => {
    expect(SRC).toMatch(/res\.status === 404/);
    expect(SRC).toMatch(/res\.status === 410/);
  });

  it("uses the brand stylesheet (Inter + Sora via Pay.css)", () => {
    expect(SRC).toMatch(/import '\.\.\/styles\/Pay\.css'/);
  });
});

describe('app/pay/[invoice]/page.tsx — invoice detail + methods picker', () => {
  const SRC = read('app/pay/[invoice]/page.tsx');

  it("loads the invoice from the public API on mount", () => {
    expect(SRC).toMatch(/fetch\(`\/api\/public\/invoice\/\$\{encodeURIComponent\(invoiceKey\)\}`\)/);
  });

  it("renders a method card for every method in the PAYMENT_METHODS catalog", () => {
    expect(SRC).toMatch(/PAYMENT_METHODS\.map\(\(method\) =>/);
    expect(SRC).toMatch(/data-testid={`pay-method-\$\{method\.id\}`}/);
  });

  it("shows the not-yet-wired toast on method click (P4 stub per the user ask)", () => {
    expect(SRC).toMatch(/data-testid="pay-methods-toast"/);
    expect(SRC).toMatch(/setPendingMethod/);
  });

  it("renders a Paid-in-full card when balance is zero", () => {
    expect(SRC).toMatch(/data-testid="pay-paid-card"/);
    expect(SRC).toMatch(/Paid in full/);
  });

  it("uses describeInvoiceStatus for the status pill", () => {
    expect(SRC).toMatch(/describeInvoiceStatus/);
    expect(SRC).toMatch(/data-testid="pay-status-pill"/);
  });

  it("uses formatDollars + buildDeepLink for the money + tap-to-open", () => {
    expect(SRC).toMatch(/formatDollars/);
    expect(SRC).toMatch(/buildDeepLink/);
  });
});

describe('P4 plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/completed/payment-infrastructure-2026-06-18.md');

  it("plan still references the /pay landing + invoice lookup scope", () => {
    expect(PLAN).toMatch(/`\/pay` landing \+ invoice lookup/);
  });

  it("plan still pins PAYMENTS_LIVE as the not-yet-wired gate", () => {
    expect(PLAN).toMatch(/PAYMENTS_LIVE=true/);
  });
});
