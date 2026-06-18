// __tests__/admin/payment-payout-ad-hoc.test.ts
//
// P15 of payment-infrastructure-2026-06-18.md — locks the one-off
// bonus / reimbursement flow. The schema + the POST /runs endpoint
// already support `kind = 'ad_hoc'` (P11); this slice ships the
// focused single-employee form that wraps them.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('/admin/payouts/ad-hoc page — source-lock', () => {
  const SRC = read('app/admin/payouts/ad-hoc/page.tsx');

  it("offers three kinds: bonus / reimbursement / other", () => {
    expect(SRC).toMatch(/checked={form\.kind === 'bonus'}/);
    expect(SRC).toMatch(/checked={form\.kind === 'reimbursement'}/);
    expect(SRC).toMatch(/checked={form\.kind === 'other'}/);
  });

  it("requires employee email + positive amount + a reason memo", () => {
    expect(SRC).toMatch(/Employee email is required/);
    expect(SRC).toMatch(/Amount must be greater than zero/);
    expect(SRC).toMatch(/Please include a reason \/ memo/);
  });

  it("routes bonus + other → bonuses_cents; reimbursement → reimbursements_cents", () => {
    expect(SRC).toMatch(/if \(form\.kind === 'reimbursement'\) item\.reimbursements_cents = amountCents/);
    expect(SRC).toMatch(/else item\.bonuses_cents = amountCents/);
  });

  it("POSTs to /api/admin/payouts/runs with kind='ad_hoc' + a single item", () => {
    expect(SRC).toMatch(/fetch\('\/api\/admin\/payouts\/runs', \{\s*method: 'POST'/m);
    expect(SRC).toMatch(/kind: 'ad_hoc'/);
    expect(SRC).toMatch(/items: \[item\]/);
  });

  it("auto-labels the batch with the kind + email + amount", () => {
    expect(SRC).toMatch(/label: `\$\{form\.kind === 'bonus' \? 'Bonus' : form\.kind === 'reimbursement' \? 'Reimbursement' : 'Ad-hoc'\}/);
  });

  it("redirects to the detail page after creation", () => {
    expect(SRC).toMatch(/router\.push\(`\/admin\/payouts\/runs\/\$\{json\.batch\.id\}`\)/);
  });

  it("normalizes the email to lowercase", () => {
    expect(SRC).toMatch(/form\.user_email\.trim\(\)\.toLowerCase\(\)/);
  });

  it("renders the live preview total + recipient", () => {
    expect(SRC).toMatch(/data-testid="adhoc-preview-total"/);
  });

  it("renders an email / amount / method / handle / reason field", () => {
    expect(SRC).toMatch(/data-testid="adhoc-email"/);
    expect(SRC).toMatch(/data-testid="adhoc-amount"/);
    expect(SRC).toMatch(/data-testid="adhoc-method"/);
    expect(SRC).toMatch(/data-testid="adhoc-reason"/);
    expect(SRC).toMatch(/data-testid="adhoc-submit"/);
  });
});

describe('/admin/payouts/runs page wires the ad-hoc link', () => {
  const SRC = read('app/admin/payouts/runs/page.tsx');

  it("renders the 'One-off payout' link routed to /admin/payouts/ad-hoc", () => {
    expect(SRC).toMatch(/href="\/admin\/payouts\/ad-hoc"/);
    expect(SRC).toMatch(/data-testid="payouts-ad-hoc-link"/);
  });
});

describe('existing /api/admin/payouts/runs already supports ad_hoc (no schema work needed)', () => {
  const SRC = read('app/api/admin/payouts/runs/route.ts');

  it("still treats ad_hoc as a valid kind in the POST", () => {
    expect(SRC).toMatch(/body\.kind === 'ad_hoc'/);
  });

  it("does NOT require week_start / week_end for ad_hoc batches", () => {
    expect(SRC).toMatch(/kind === 'weekly' && \(!weekStart \|\| !weekEnd\)/);
  });
});

describe('P15 plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/completed/payment-infrastructure-2026-06-18.md');

  it("plan still references one-time bonuses + reimbursements scope", () => {
    expect(PLAN).toMatch(/One-time bonuses \+ reimbursements/);
  });
});
