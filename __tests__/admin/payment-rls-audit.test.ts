// __tests__/admin/payment-rls-audit.test.ts
//
// P18 of payment-infrastructure-2026-06-18.md — static RLS audit
// across every payment-domain seed.
//
// Two complementary checks:
//   1. lib/payments/rls-allowlist.ts publishes the canonical list +
//      pure helper for expected policy names.
//   2. For every (table, seed) pair in the allowlist, the seed file
//      contains the ENABLE-ROW-LEVEL-SECURITY + the right policies.
//
// Runtime audit is `scripts/audit-payment-rls.sql` — that catches
// drift after a manual schema edit; this spec catches drift in the
// version-controlled seeds before deploy.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  PAYMENT_RLS_ALLOWLIST,
  expectedPolicyNamesForTable,
} from '@/lib/payments/rls-allowlist';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('PAYMENT_RLS_ALLOWLIST shape', () => {
  it("covers every shipped payment-domain table", () => {
    const tables = PAYMENT_RLS_ALLOWLIST.map((r) => r.table).sort();
    expect(tables).toEqual([
      'employee_payment_methods',
      'invoices',
      'payment_attempts',
      'payment_intents',
      'payment_receipts',
      'payment_secret_reads',
      'payments',
      'payout_batch_items',
      'payout_batches',
    ]);
  });

  it("flags only employee_payment_methods + payout_batch_items as employee-self-read", () => {
    const selfRead = PAYMENT_RLS_ALLOWLIST
      .filter((r) => r.employee_self_read === 'by_user_email')
      .map((r) => r.table)
      .sort();
    expect(selfRead).toEqual(['employee_payment_methods', 'payout_batch_items']);
  });

  it("never sets employee_self_read on customer-facing tables (no enumeration risk)", () => {
    const customerFacing = ['invoices', 'payments', 'payment_intents', 'payment_attempts', 'payment_receipts'];
    for (const t of customerFacing) {
      const row = PAYMENT_RLS_ALLOWLIST.find((r) => r.table === t)!;
      expect(row.employee_self_read).toBe('none');
    }
  });
});

describe('expectedPolicyNamesForTable (pure)', () => {
  it("returns the service-role policy for every table", () => {
    for (const row of PAYMENT_RLS_ALLOWLIST) {
      expect(expectedPolicyNamesForTable(row.table)).toContain(`service_role_full_access_${row.table}`);
    }
  });

  it("includes the employee-self-read policy name for self-read tables", () => {
    expect(expectedPolicyNamesForTable('employee_payment_methods'))
      .toContain('employee_self_read_payment_methods'); // pre-convention name
    expect(expectedPolicyNamesForTable('payout_batch_items'))
      .toContain('employee_self_read_payout_batch_items');
  });

  it("does NOT include the employee-self-read policy for service-only tables", () => {
    expect(expectedPolicyNamesForTable('invoices').some((n) => n.startsWith('employee_self_read'))).toBe(false);
    expect(expectedPolicyNamesForTable('payment_secret_reads').some((n) => n.startsWith('employee_self_read'))).toBe(false);
  });
});

describe('every seed enables RLS + ships the expected policies', () => {
  for (const row of PAYMENT_RLS_ALLOWLIST) {
    describe(`${row.table} (${row.seed})`, () => {
      const SRC = read(`seeds/${row.seed}`);

      it("enables row-level security on the table", () => {
        // Some seeds use 2 spaces after table name, some use a tab;
        // \s+ tolerates both.
        const re = new RegExp(`ALTER TABLE public\\.${row.table}\\s+ENABLE ROW LEVEL SECURITY`);
        expect(SRC).toMatch(re);
      });

      it("creates a service-role full-access policy", () => {
        const re = new RegExp(`CREATE POLICY service_role_full_access_${row.table}`);
        expect(SRC).toMatch(re);
      });

      if (row.employee_self_read === 'by_user_email') {
        it("creates an employee-self-read policy gated by auth.jwt() email", () => {
          // Accept either the table-name convention or the pre-
          // convention name (employee_payment_methods).
          const tableName = new RegExp(`CREATE POLICY employee_self_read_${row.table}`);
          const preConvention = /CREATE POLICY employee_self_read_payment_methods/;
          const matchesName = tableName.test(SRC) || preConvention.test(SRC);
          expect(matchesName).toBe(true);
          expect(SRC).toMatch(/user_email = \(auth\.jwt\(\) ->> 'email'\)/);
        });
      }
    });
  }
});

describe('runtime audit query — scripts/audit-payment-rls.sql', () => {
  const SRC = read('scripts/audit-payment-rls.sql');

  it("enumerates every payment-domain table in the WITH expected(...) CTE", () => {
    for (const row of PAYMENT_RLS_ALLOWLIST) {
      expect(SRC).toMatch(new RegExp(`'${row.table}'`));
    }
  });

  it("checks pg_class.relrowsecurity for RLS enabled", () => {
    expect(SRC).toMatch(/c\.relrowsecurity/);
  });

  it("checks pg_policies for both the service-role + employee-self-read policies", () => {
    expect(SRC).toMatch(/p\.policyname LIKE 'service_role_full_access_%'/);
    expect(SRC).toMatch(/p\.policyname LIKE 'employee_self_read_%'/);
  });

  it("publishes a pass / fail boolean column for quick filtering", () => {
    expect(SRC).toMatch(/AS pass/);
    expect(SRC).toMatch(/WHERE pass = FALSE/);
  });
});

describe('PCI doc references the audit query', () => {
  const SRC = read('docs/security/payments-pci-scope.md');

  it("links the audit script as the runbook", () => {
    // After P18 lands the doc should mention the script + the
    // allowlist file. Soft assertion — only checks the link target.
    expect(SRC).toMatch(/audit-payment-rls\.sql/);
  });
});

describe('P18 plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/in-progress/payment-infrastructure-2026-06-18.md');
  it("plan still references the RLS audit scope", () => {
    expect(PLAN).toMatch(/RLS audit/);
  });
});
