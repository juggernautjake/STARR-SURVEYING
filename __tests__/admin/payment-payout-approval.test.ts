// __tests__/admin/payment-payout-approval.test.ts
//
// P12 of payment-infrastructure-2026-06-18.md — locks the payout-
// admin approval flow:
//   - lib/payouts/approval.ts: env-driven allowlist + role
//     fallback + request-IP extractor (pure helpers)
//   - GET  /api/admin/payouts/runs/[id]            detail view
//   - POST /api/admin/payouts/runs/[id]/approve    flip → approved
//   - POST /api/admin/payouts/runs/[id]/void       flip → voided
//   - /admin/payouts/runs/[id] page renders + approve / void wired
//   - history list links to detail

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  canApprovePayoutBatch,
  extractRequestIp,
  isInPayoutAdminAllowlist,
} from '@/lib/payouts/approval';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('isInPayoutAdminAllowlist (pure)', () => {
  it("matches by lowercased + trimmed email", () => {
    const env = { PAYOUT_ADMIN_EMAILS: 'Hank@starr.com , daddy@starr.com' } as unknown as NodeJS.ProcessEnv;
    expect(isInPayoutAdminAllowlist('hank@starr.com', env)).toBe(true);
    expect(isInPayoutAdminAllowlist('DADDY@starr.com', env)).toBe(true);
    expect(isInPayoutAdminAllowlist('  hank@starr.com  ', env)).toBe(true);
  });

  it("returns false for empty / missing env + non-matching emails", () => {
    expect(isInPayoutAdminAllowlist('x@y.com', { } as NodeJS.ProcessEnv)).toBe(false);
    expect(isInPayoutAdminAllowlist('x@y.com', { PAYOUT_ADMIN_EMAILS: '' } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isInPayoutAdminAllowlist(null, { PAYOUT_ADMIN_EMAILS: 'a@b.com' } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe('canApprovePayoutBatch (pure)', () => {
  const isAdmin = (roles?: string[] | null) => Array.isArray(roles) && roles.includes('admin');

  it("env allowlist hit wins regardless of role", () => {
    const env = { PAYOUT_ADMIN_EMAILS: 'hank@starr.com' } as unknown as NodeJS.ProcessEnv;
    expect(canApprovePayoutBatch({ email: 'hank@starr.com', roles: [] }, isAdmin, env)).toBe(true);
  });

  it("falls back to isAdmin when no env allowlist is configured", () => {
    expect(canApprovePayoutBatch({ email: 'x@y.com', roles: ['admin'] }, isAdmin, {} as NodeJS.ProcessEnv)).toBe(true);
    expect(canApprovePayoutBatch({ email: 'x@y.com', roles: [] }, isAdmin, {} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("returns false when there's no signed-in user", () => {
    expect(canApprovePayoutBatch(null, isAdmin, {} as NodeJS.ProcessEnv)).toBe(false);
    expect(canApprovePayoutBatch({}, isAdmin, {} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe('extractRequestIp (pure)', () => {
  it("prefers x-forwarded-for first entry", () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.42, 70.0.0.1' });
    expect(extractRequestIp(h)).toBe('203.0.113.42');
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    expect(extractRequestIp(new Headers({ 'x-real-ip': '203.0.113.99' }))).toBe('203.0.113.99');
  });

  it("returns null when neither header is present", () => {
    expect(extractRequestIp(new Headers())).toBeNull();
  });
});

describe('GET /api/admin/payouts/runs/[id] — source-lock', () => {
  const SRC = read('app/api/admin/payouts/runs/[id]/route.ts');

  it("gates by admin auth", () => {
    expect(SRC).toMatch(/isAdmin\(session\.user\.roles\)/);
  });

  it("returns both the header + items", () => {
    expect(SRC).toMatch(/\.from\('payout_batches'\)/);
    expect(SRC).toMatch(/\.from\('payout_batch_items'\)/);
    expect(SRC).toMatch(/\.eq\('batch_id', id\)/);
  });
});

describe('POST /api/admin/payouts/runs/[id]/approve — source-lock', () => {
  const SRC = read('app/api/admin/payouts/runs/[id]/approve/route.ts');

  it("gates by canApprovePayoutBatch (env allowlist OR isAdmin)", () => {
    expect(SRC).toMatch(/canApprovePayoutBatch\(session\?\.user, isAdmin\)/);
    expect(SRC).toMatch(/Only the designated payout admin/);
  });

  it("refuses to re-approve a non-draft batch with 409", () => {
    expect(SRC).toMatch(/batch\.status !== 'draft'/);
    expect(SRC).toMatch(/Cannot approve a batch in status/);
  });

  it("blocks self-approval (creator can't approve own batch) unless PAYOUT_ADMIN_SELF_APPROVE", () => {
    expect(SRC).toMatch(/batch\.created_by === approver/);
    expect(SRC).toMatch(/PAYOUT_ADMIN_SELF_APPROVE/);
  });

  it("stamps the approval signature (approved_by + approved_at + approval_ip)", () => {
    expect(SRC).toMatch(/approved_by: approver/);
    expect(SRC).toMatch(/approved_at: new Date\(\)\.toISOString\(\)/);
    expect(SRC).toMatch(/approval_ip: extractRequestIp\(req\.headers\)/);
  });
});

describe('POST /api/admin/payouts/runs/[id]/void — source-lock', () => {
  const SRC = read('app/api/admin/payouts/runs/[id]/void/route.ts');

  it("only voids draft + approved batches (dispatched / completed → 409)", () => {
    expect(SRC).toMatch(/batch\.status !== 'draft' && batch\.status !== 'approved'/);
    expect(SRC).toMatch(/status: 409/);
  });

  it("stitches the void reason into notes (audit trail)", () => {
    expect(SRC).toMatch(/Voided: \$\{reason\}/);
  });

  it("stamps voided_at + voided_by + status='voided'", () => {
    expect(SRC).toMatch(/status: 'voided'/);
    expect(SRC).toMatch(/voided_at: new Date\(\)\.toISOString\(\)/);
    expect(SRC).toMatch(/voided_by: session\.user\.email/);
  });
});

describe('/admin/payouts/runs/[id] page — source-lock', () => {
  const SRC = read('app/admin/payouts/runs/[id]/page.tsx');

  it("loads detail from /api/admin/payouts/runs/<id> on mount", () => {
    expect(SRC).toMatch(/fetch\(`\/api\/admin\/payouts\/runs\/\$\{id\}`\)/);
  });

  it("renders the status chip + approval signature when approved", () => {
    expect(SRC).toMatch(/data-testid="batch-status-chip"/);
    expect(SRC).toMatch(/data-testid="batch-approval-sig"/);
  });

  it("approve button POSTs to /<id>/approve (only visible on draft)", () => {
    expect(SRC).toMatch(/fetch\(`\/api\/admin\/payouts\/runs\/\$\{batch\.id\}\/approve`/);
    expect(SRC).toMatch(/data-testid="batch-approve"/);
    expect(SRC).toMatch(/batch\.status === 'draft'/);
  });

  it("void prompt POSTs reason to /<id>/void", () => {
    expect(SRC).toMatch(/fetch\(`\/api\/admin\/payouts\/runs\/\$\{batch\.id\}\/void`/);
    expect(SRC).toMatch(/data-testid="batch-void-prompt"/);
    expect(SRC).toMatch(/reason: voidReason\.trim\(\) \|\| undefined/);
  });

  it("renders one row per line item with all four cents columns", () => {
    expect(SRC).toMatch(/it\.hours_cents/);
    expect(SRC).toMatch(/it\.bonuses_cents/);
    expect(SRC).toMatch(/it\.reimbursements_cents/);
    expect(SRC).toMatch(/it\.adjustments_cents/);
    expect(SRC).toMatch(/data-testid={`batch-item-/);
  });
});

describe('history list links to detail', () => {
  const SRC = read('app/admin/payouts/runs/page.tsx');
  it("each history row wraps in a Link to /admin/payouts/runs/<id>", () => {
    expect(SRC).toMatch(/Link href={`\/admin\/payouts\/runs\/\$\{b\.id\}`}/);
  });
});

describe('P12 plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/completed/payment-infrastructure-2026-06-18.md');

  it("plan still references the approval flow scope", () => {
    expect(PLAN).toMatch(/Approval flow/);
  });

  it("plan still pins the approval signature (admin email + timestamp + IP)", () => {
    expect(PLAN).toMatch(/Approval signature stored \(admin email \+ timestamp \+ IP\)/);
  });
});
