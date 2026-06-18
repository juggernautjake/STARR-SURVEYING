// __tests__/admin/payment-admin-styling.test.ts
//
// P21 of payment-infrastructure-2026-06-18.md — three styling passes
// across the office surfaces. Same polish bar as the customer
// portal: shared focus rings, sr-only helper, reduced-motion
// suspension, role=alert on every error, aria-busy on every loading
// state.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const ADMIN_PAYMENT_PAGES = [
  'app/admin/invoices/new/page.tsx',
  'app/admin/payments/inbox/page.tsx',
  'app/admin/payouts/runs/page.tsx',
  'app/admin/payouts/runs/[id]/page.tsx',
  'app/admin/payouts/runs/[id]/dispatch/page.tsx',
  'app/admin/payouts/ad-hoc/page.tsx',
  'app/admin/payouts/tax-report/page.tsx',
];

describe('shared admin stylesheet — payments-admin.css', () => {
  const SRC = read('app/admin/payments-admin.css');

  it("publishes a universal :focus-visible 3px navy ring scoped by data-payments-admin", () => {
    expect(SRC).toMatch(/\[data-payments-admin\] :focus-visible/);
    expect(SRC).toMatch(/outline: 3px solid #1D3095/);
  });

  it("ships a .visually-hidden sr-only helper", () => {
    expect(SRC).toMatch(/\.visually-hidden/);
    expect(SRC).toMatch(/clip: rect\(0, 0, 0, 0\)/);
  });

  it("suspends animations under prefers-reduced-motion", () => {
    expect(SRC).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(SRC).toMatch(/animation-duration: 0\.01ms !important/);
  });
});

describe('every payment-admin page imports the shared stylesheet', () => {
  for (const rel of ADMIN_PAYMENT_PAGES) {
    it(`${rel} imports payments-admin.css`, () => {
      expect(read(rel)).toMatch(/import .*payments-admin\.css/);
    });
  }
});

describe('every payment-admin page stamps data-payments-admin on its main', () => {
  for (const rel of ADMIN_PAYMENT_PAGES) {
    it(`${rel} marks the main element with data-payments-admin`, () => {
      expect(read(rel)).toMatch(/data-payments-admin/);
    });
  }
});

describe('every visible error message uses role=alert', () => {
  // Walk each page; whenever an error <p> is shown, it must have
  // role=alert so screen readers announce it.
  for (const rel of ADMIN_PAYMENT_PAGES) {
    it(`${rel} stamps role="alert" on every error <p>`, () => {
      const SRC = read(rel);
      // Match `data-testid="...-error"` -> the same line includes role="alert".
      const errorLines = SRC.split('\n').filter((line) =>
        /data-testid="[^"]*-error"/.test(line) ||
        /data-testid="[^"]*-warning"/.test(line),
      );
      for (const line of errorLines) {
        expect(line).toMatch(/role="alert"/);
      }
    });
  }
});

describe('loading states publish aria-busy + aria-live', () => {
  const inbox = read('app/admin/payments/inbox/page.tsx');
  it("payments inbox loading <p> is aria-busy + role=status + polite live", () => {
    expect(inbox).toMatch(/data-testid="payments-inbox-loading"[\s\S]{0,200}role="status"/);
    expect(inbox).toMatch(/aria-busy="true"/);
    expect(inbox).toMatch(/aria-live="polite"/);
  });
});

describe('P21 plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/in-progress/payment-infrastructure-2026-06-18.md');
  it("plan still references the admin portal styling pass scope", () => {
    expect(PLAN).toMatch(/Admin portal styling pass/);
  });
});
