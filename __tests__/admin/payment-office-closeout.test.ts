// __tests__/admin/payment-office-closeout.test.ts
//
// P10 of payment-infrastructure-2026-06-18.md — locks the office
// close-out flow:
//   - GET  /api/admin/payment-attempts          list pending rows
//   - POST /api/admin/payment-attempts/[id]/clear  one-click clear
//   - /admin/payments/inbox page                queue + actions
//
// The clear endpoint INSERTs the payments row, UPDATEs the attempt
// (with confirmed_by + resulted_in_payment_id), UPDATEs the invoice
// via nextInvoiceStatusAfterPayment, and fires the receipt email.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('GET /api/admin/payment-attempts — source-lock', () => {
  const SRC = read('app/api/admin/payment-attempts/route.ts');

  it("gates GET behind admin auth", () => {
    expect(SRC).toMatch(/isAdmin\(session\.user\.roles\)/);
    expect(SRC).toMatch(/'Forbidden'/);
  });

  it("filters to pledged + pending_confirmation (the office-action queue)", () => {
    expect(SRC).toMatch(/\.in\('status', \['pledged', 'pending_confirmation'\]\)/);
  });

  it("orders newest-first + caps at 200", () => {
    expect(SRC).toMatch(/\.order\('created_at', \{ ascending: false \}\)/);
    expect(SRC).toMatch(/\.limit\(200\)/);
  });

  it("joins invoice context (number / customer / total) via a second query", () => {
    expect(SRC).toMatch(/\.from\('invoices'\)\s*\.select\('id, invoice_number, customer_name, customer_email, total_cents, status'\)/);
  });
});

describe('POST /api/admin/payment-attempts/[id]/clear — source-lock', () => {
  const SRC = read('app/api/admin/payment-attempts/[id]/clear/route.ts');

  it("gates the clear behind admin auth", () => {
    expect(SRC).toMatch(/isAdmin\(session\.user\.roles\)/);
  });

  it("rejects double-clear via resulted_in_payment_id check", () => {
    expect(SRC).toMatch(/attempt\.resulted_in_payment_id/);
    expect(SRC).toMatch(/Attempt already cleared/);
    expect(SRC).toMatch(/status: 409/);
  });

  it("rejects clearing succeeded / abandoned attempts", () => {
    expect(SRC).toMatch(/attempt\.status === 'succeeded' \|\| attempt\.status === 'abandoned'/);
  });

  it("defaults the payment amount to the attempt's intended_amount_cents", () => {
    expect(SRC).toMatch(/typeof body\.amount_cents === 'number'[\s\S]*attempt\.intended_amount_cents/);
  });

  it("INSERTs the payments row with method-derived external_provider + reconciled_by", () => {
    expect(SRC).toMatch(/method: attempt\.method/);
    expect(SRC).toMatch(/external_provider: attempt\.method === 'cash' \|\| attempt\.method === 'check' \? 'manual' : attempt\.method/);
    expect(SRC).toMatch(/reconciled_by: session\.user\.email/);
    expect(SRC).toMatch(/cleared_at: new Date\(\)\.toISOString\(\)/);
  });

  it("UPDATEs the attempt with confirmed_by + resulted_in_payment_id (audit trail)", () => {
    expect(SRC).toMatch(/confirmed_by: session\.user\.email/);
    expect(SRC).toMatch(/resulted_in_payment_id: payment\.id/);
  });

  it("UPDATEs the invoice status via nextInvoiceStatusAfterPayment", () => {
    expect(SRC).toMatch(/nextInvoiceStatusAfterPayment/);
    expect(SRC).toMatch(/status: nextStatus/);
    expect(SRC).toMatch(/paid_at: nextStatus === 'paid' \? new Date\(\)\.toISOString\(\) : null/);
  });

  it("fires the receipt email via the pure receipt builders + Resend HTTP API", () => {
    expect(SRC).toMatch(/buildReceiptResendSubject/);
    expect(SRC).toMatch(/buildReceiptResendHtml/);
    expect(SRC).toMatch(/buildReceiptResendText/);
    expect(SRC).toMatch(/fetch\('https:\/\/api\.resend\.com\/emails'/);
  });

  it("stamps a payment_receipts row per send for audit", () => {
    expect(SRC).toMatch(/\.from\('payment_receipts'\)\.insert\(/);
  });

  it("tolerates missing RESEND_API_KEY (dev mode) — still marks the payment cleared", () => {
    expect(SRC).toMatch(/\[clear\] DEV/);
  });
});

describe('/admin/payments/inbox page — source-lock', () => {
  const SRC = read('app/admin/payments/inbox/page.tsx');

  it("loads from /api/admin/payment-attempts on mount", () => {
    expect(SRC).toMatch(/fetch\('\/api\/admin\/payment-attempts'\)/);
  });

  it("renders pledged + pending_confirmation chips", () => {
    expect(SRC).toMatch(/inbox-card__chip--pledged/);
    expect(SRC).toMatch(/inbox-card__chip--pending/);
  });

  it("offers a one-click clear with an optional external ref field", () => {
    expect(SRC).toMatch(/data-testid={`payments-attempt-clear-/);
    expect(SRC).toMatch(/data-testid={`payments-attempt-ref-/);
  });

  it("POSTs to /api/admin/payment-attempts/<id>/clear with the typed ref", () => {
    expect(SRC).toMatch(/fetch\(`\/api\/admin\/payment-attempts\/\$\{attempt\.id\}\/clear`/);
    expect(SRC).toMatch(/external_ref: refs\[attempt\.id\]\?\.trim\(\) \|\| undefined/);
  });

  it("after clear, shows the new invoice status + the receipt recipient", () => {
    expect(SRC).toMatch(/data-testid={`payments-attempt-cleared-/);
    expect(SRC).toMatch(/Invoice is now <strong>/);
    expect(SRC).toMatch(/Receipt sent to <strong>/);
  });

  it("renders an empty state when the queue is clear", () => {
    expect(SRC).toMatch(/data-testid="payments-inbox-empty"/);
    expect(SRC).toMatch(/All caught up/);
  });
});

describe('AdminSidebar wires the inbox link', () => {
  const SRC = read('app/admin/components/AdminSidebar.tsx');

  it("adds a Payments Inbox entry routed to /admin/payments/inbox", () => {
    expect(SRC).toMatch(/href: '\/admin\/payments\/inbox', label: 'Payments Inbox'/);
  });
});

describe('P10 plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/in-progress/payment-infrastructure-2026-06-18.md');

  it("plan still references the office close-out tool scope", () => {
    expect(PLAN).toMatch(/Office close-out tool/);
  });
});
