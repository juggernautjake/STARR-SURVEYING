// __tests__/admin/payment-payout-audit-trail.test.ts
//
// P14 of payment-infrastructure-2026-06-18.md — locks the per-payout
// audit trail surface:
//   - seeds/326 adds attempted_at + the user-level index
//   - mark route stamps attempted_at on FIRST non-pending transition;
//     reopen-to-pending clears it
//   - GET /api/admin/employees/[email]/payouts returns per-employee
//     payout history (admin or self only)
//   - employee profile page renders the EmployeePayoutHistory card

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('seed 326 — attempted_at + per-user index', () => {
  const SRC = read('seeds/326_payout_attempted_at.sql');

  it("adds the attempted_at column idempotently", () => {
    expect(SRC).toMatch(/ALTER TABLE public\.payout_batch_items[\s\S]*ADD COLUMN IF NOT EXISTS attempted_at TIMESTAMPTZ/);
  });

  it("indexes (user_email, attempted_at DESC) for the per-employee lookup", () => {
    expect(SRC).toMatch(/CREATE INDEX IF NOT EXISTS idx_payout_batch_items_user_attempted/);
    expect(SRC).toMatch(/\(user_email, attempted_at DESC\)/);
  });
});

describe('mark route — attempted_at stamping', () => {
  const SRC = read('app/api/admin/payouts/runs/[id]/items/[itemId]/mark/route.ts');

  it("only stamps attempted_at on the FIRST non-pending transition", () => {
    expect(SRC).toMatch(/if \(!currentItem\?\.attempted_at\)/);
    expect(SRC).toMatch(/updates\.attempted_at = nowIso/);
  });

  it("stamps attempted_at on sent, paid, AND failed transitions", () => {
    expect(SRC).toMatch(/body\.status === 'sent' \|\| body\.status === 'paid' \|\| body\.status === 'failed'/);
  });

  it("clears attempted_at on reopen-to-pending so a retry stamps fresh", () => {
    expect(SRC).toMatch(/if \(body\.status === 'pending'\) \{[\s\S]{0,200}updates\.attempted_at = null/);
  });
});

describe('GET /api/admin/employees/[email]/payouts — source-lock', () => {
  const SRC = read('app/api/admin/employees/[email]/payouts/route.ts');

  it("requires a session", () => {
    expect(SRC).toMatch(/if \(!session\?\.user\) \{[\s\S]{0,100}status: 401/);
  });

  it("allows admin OR self-view", () => {
    expect(SRC).toMatch(/viewer !== targetEmail && !isAdmin\(session\.user\.roles\)/);
    expect(SRC).toMatch(/status: 403/);
  });

  it("filters payout_batch_items by user_email + caps at 100 newest-first", () => {
    expect(SRC).toMatch(/\.eq\('user_email', targetEmail\)/);
    expect(SRC).toMatch(/\.order\('created_at', \{ ascending: false \}\)/);
    expect(SRC).toMatch(/\.limit\(100\)/);
  });

  it("selects attempted_at so the audit trail has the dispatch timestamp", () => {
    expect(SRC).toMatch(/attempted_at/);
  });

  it("joins payout_batches for the batch label + range", () => {
    expect(SRC).toMatch(/\.from\('payout_batches'\)\s*\.select\('id, label, kind, week_start, week_end, status'\)/);
  });

  it("normalizes the URL email to lowercase (case-insensitive lookup)", () => {
    expect(SRC).toMatch(/\.toLowerCase\(\)/);
  });
});

describe('EmployeePayoutHistory component — source-lock', () => {
  const SRC = read('app/admin/employees/[email]/EmployeePayoutHistory.tsx');

  it("fetches from /api/admin/employees/<email>/payouts", () => {
    expect(SRC).toMatch(/fetch\(`\/api\/admin\/employees\/\$\{encodeURIComponent\(email\)\}\/payouts`\)/);
  });

  it("renders status chips for pending / sent / paid / failed", () => {
    expect(SRC).toMatch(/emp-payouts__chip--pending/);
    expect(SRC).toMatch(/emp-payouts__chip--sent/);
    expect(SRC).toMatch(/emp-payouts__chip--paid/);
    expect(SRC).toMatch(/emp-payouts__chip--failed/);
  });

  it("renders the four audit-trail timestamps + the external ref", () => {
    expect(SRC).toMatch(/r\.attempted_at/);
    expect(SRC).toMatch(/r\.paid_at/);
    expect(SRC).toMatch(/r\.external_ref/);
    expect(SRC).toMatch(/r\.method/);
  });

  it("surfaces failure_reason + notes when present", () => {
    expect(SRC).toMatch(/r\.failure_reason && /);
    expect(SRC).toMatch(/r\.notes && /);
  });

  it("renders an empty state when no payouts are on file", () => {
    expect(SRC).toMatch(/data-testid="employee-payouts-empty"/);
    expect(SRC).toMatch(/No payouts on file yet/);
  });
});

describe('employee profile page wires the payout history card', () => {
  const SRC = read('app/admin/employees/[email]/page.tsx');

  it("imports EmployeePayoutHistory", () => {
    expect(SRC).toMatch(/import EmployeePayoutHistory from '\.\/EmployeePayoutHistory'/);
  });

  it("renders <EmployeePayoutHistory email={email} />", () => {
    expect(SRC).toMatch(/<EmployeePayoutHistory email={email} \/>/);
  });
});

describe('P14 plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/in-progress/payment-infrastructure-2026-06-18.md');

  it("plan still references the per-payout audit trail scope", () => {
    expect(PLAN).toMatch(/Per-payout audit trail/);
  });
});
