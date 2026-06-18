// __tests__/admin/payment-qa-findings.test.ts
//
// P22 of payment-infrastructure-2026-06-18.md — full QA + bug
// review pass. Locks the three bugs found during the audit:
//   Bug #1: zero-amount invoice falsely renders "Paid in full"
//   Bug #2: paid_at overwrite on re-mark of a payout item
//   Bug #3: duplicate external_ref on /clear could double-count
//
// Also pins the QA findings doc so the rationale survives.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Bug #1 fix — zero-amount invoice no longer claims "Paid in full"', () => {
  const SRC = read('app/pay/[invoice]/page.tsx');

  it("isPaid requires total > 0 AND balance === 0 (not just balance === 0)", () => {
    expect(SRC).toMatch(/const isPaid = invoice\.balance_cents === 0 && invoice\.total_cents > 0/);
  });

  it("zero-dollar invoice renders its own card (testid pay-zero-dollar)", () => {
    expect(SRC).toMatch(/data-testid="pay-zero-dollar"/);
    expect(SRC).toMatch(/No balance due/);
  });

  it("method picker is hidden on zero-dollar invoices", () => {
    expect(SRC).toMatch(/!isPaid && !isZeroDollar/);
  });
});

describe('Bug #2 fix — paid_at preserved on re-mark', () => {
  const SRC = read('app/api/admin/payouts/runs/[id]/items/[itemId]/mark/route.ts');

  it("fetches the current paid_at alongside attempted_at", () => {
    expect(SRC).toMatch(/\.select\('attempted_at, paid_at, status'\)/);
  });

  it("only stamps paid_at when the row hadn't already cleared", () => {
    expect(SRC).toMatch(/if \(body\.status === 'paid'\) \{[\s\S]{0,400}if \(!currentItem\?\.paid_at\)/);
  });

  it("reopen-to-pending still clears paid_at so a retry stamps fresh", () => {
    expect(SRC).toMatch(/if \(body\.status === 'pending'\) \{[\s\S]{0,400}updates\.paid_at = null/);
  });
});

describe('Bug #3 fix — /clear refuses duplicate external_ref on same invoice', () => {
  const SRC = read('app/api/admin/payment-attempts/[id]/clear/route.ts');

  it("queries payments by (invoice_id, external_id, succeeded) before INSERT", () => {
    expect(SRC).toMatch(/\.from\('payments'\)\s*\.select\('id'\)\s*\.eq\('invoice_id', invoice\.id\)\s*\.eq\('external_id', externalRef\)\s*\.eq\('status', 'succeeded'\)/);
  });

  it("returns 409 with a clear message when the ref already exists", () => {
    expect(SRC).toMatch(/A payment with reference "\$\{externalRef\}" was already recorded/);
    expect(SRC).toMatch(/status: 409/);
  });

  it("uses the trimmed externalRef for the INSERT (no untrimmed value leaks past the dedup)", () => {
    expect(SRC).toMatch(/external_id: externalRef\?\.slice\(0, 200\) \?\? null/);
  });
});

describe('docs/security/payment-qa-findings.md', () => {
  const SRC = read('docs/security/payment-qa-findings.md');

  it("documents all three bugs found in the QA pass", () => {
    expect(SRC).toMatch(/Bug #1 — zero-amount invoice/);
    expect(SRC).toMatch(/Bug #2 — `paid_at` overwrite/);
    expect(SRC).toMatch(/Bug #3 — duplicate `external_ref`/);
  });

  it("documents the deferred items with rationale", () => {
    expect(SRC).toMatch(/Refunds[\s\S]{0,200}Out of scope per the plan/);
    expect(SRC).toMatch(/Stripe Connect \/ Treasury/);
    expect(SRC).toMatch(/Bounced ACH/);
    expect(SRC).toMatch(/Two-admin approval race/);
  });

  it("passes the edge cases the plan specifically called out", () => {
    expect(SRC).toMatch(/Partial payments[\s\S]{0,200}✓/);
    expect(SRC).toMatch(/Voided invoices[\s\S]{0,200}✓/);
    expect(SRC).toMatch(/Double-clicked Pay button[\s\S]{0,200}✓/);
    expect(SRC).toMatch(/Hostile customer names[\s\S]{0,400}✓/);
  });
});

describe('P22 plan annotation locks the slice', () => {
  // After this slice, the plan moves to docs/planning/completed/.
  // Look there.
  const completedPath = 'docs/planning/completed/payment-infrastructure-2026-06-18.md';
  const inProgressPath = 'docs/planning/completed/payment-infrastructure-2026-06-18.md';
  const PLAN = fs.existsSync(path.join(repoRoot, completedPath))
    ? read(completedPath)
    : read(inProgressPath);

  it("plan still references the full QA + bug review scope", () => {
    expect(PLAN).toMatch(/Full QA \+ bug review/);
  });
});
