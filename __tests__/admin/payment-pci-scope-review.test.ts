// __tests__/admin/payment-pci-scope-review.test.ts
//
// P19 of payment-infrastructure-2026-06-18.md — locks the PCI scope
// review. The doc is the deliverable; this spec ensures the key
// claims don't quietly disappear.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('docs/security/payments-pci-scope.md — P19 review pass', () => {
  const SRC = read('docs/security/payments-pci-scope.md');

  it("lists every payment method with its PCI scope classification", () => {
    expect(SRC).toMatch(/Stripe \(card \/ ACH\).*SAQ A/);
    expect(SRC).toMatch(/Venmo \/ CashApp \/ Zelle.*Out of scope/);
    expect(SRC).toMatch(/Cash \/ check.*Out of scope/);
    expect(SRC).toMatch(/ACH \(employee payouts\)/);
  });

  it("explicitly states no card numbers are stored", () => {
    expect(SRC).toMatch(/No card numbers are ever stored/);
  });

  it("publishes the storage boundary table (what we store vs. what Stripe stores)", () => {
    expect(SRC).toMatch(/What we store vs\. what Stripe stores/);
    expect(SRC).toMatch(/Full card number \(PAN\)/);
    expect(SRC).toMatch(/Card CVV \/ CVC/);
    expect(SRC).toMatch(/Stripe `payment_intent\.id`/);
  });

  it("links to the SAQ A eligibility checklist", () => {
    expect(SRC).toMatch(/saq-a-eligibility-checklist\.md/);
  });
});

describe('docs/security/saq-a-eligibility-checklist.md — P19 SAQ A audit', () => {
  const SRC = read('docs/security/saq-a-eligibility-checklist.md');

  it("documents the SAQ A header + Stripe Elements pattern", () => {
    expect(SRC).toMatch(/SAQ A eligibility/);
    expect(SRC).toMatch(/Stripe Elements/);
  });

  it("lists every outsourced-cardholder-data condition", () => {
    expect(SRC).toMatch(/Card-data fields are rendered by Stripe Elements/);
    expect(SRC).toMatch(/No raw card data ever transits our server/);
    expect(SRC).toMatch(/No raw card data is stored/);
  });

  it("references the live-money gate + the webhook signature guard", () => {
    expect(SRC).toMatch(/PAYMENTS_LIVE/);
    expect(SRC).toMatch(/stripe\.webhooks\.constructEvent/);
  });

  it("calls out replay protection via processed_webhook_events", () => {
    expect(SRC).toMatch(/processed_webhook_events/);
    expect(SRC).toMatch(/ON CONFLICT DO NOTHING/);
  });

  it("names the four non-Stripe paths as out of scope with their rationale", () => {
    expect(SRC).toMatch(/Venmo \/ Cash App \/ Zelle/);
    expect(SRC).toMatch(/Cash \+ check/);
    expect(SRC).toMatch(/ACH \(employee payouts\)/);
  });

  it("calls out the operational requirements (ASV scan, annual SAQ, IR runbook)", () => {
    expect(SRC).toMatch(/Quarterly external scan/);
    expect(SRC).toMatch(/Annual SAQ A attestation/);
    expect(SRC).toMatch(/Incident response runbook/);
  });

  it("lists the changes that would push us OUT of SAQ A", () => {
    expect(SRC).toMatch(/push us OUT of SAQ A/);
    expect(SRC).toMatch(/non-Stripe card capture/);
  });

  it("references the file paths the office can verify against", () => {
    // The checklist needs to be actionable — cite the actual code
    // files that implement each condition.
    expect(SRC).toMatch(/app\/pay\/\[invoice\]\/page\.tsx/);
    expect(SRC).toMatch(/app\/api\/public\/invoice\/\[number\]\/intent\/route\.ts/);
    expect(SRC).toMatch(/app\/api\/webhooks\/stripe\/route\.ts/);
    expect(SRC).toMatch(/lib\/payments\/secrets\.ts/);
  });
});

describe('P19 plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/completed/payment-infrastructure-2026-06-18.md');
  it("plan still references the PCI scope review", () => {
    expect(PLAN).toMatch(/PCI scope review/);
  });
});
