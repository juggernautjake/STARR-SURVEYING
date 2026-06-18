// __tests__/admin/payment-payout-batches.test.ts
//
// P11 of payment-infrastructure-2026-06-18.md — locks the weekly
// payout batch UI:
//   - seeds/325 payout_batches + payout_batch_items
//   - lib/payouts/batch.ts pure helpers (totals, week snap, label)
//   - GET + POST /api/admin/payouts/runs
//   - /admin/payouts/runs page (wizard + history)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  batchItemTotalCents,
  batchTotalCents,
  buildBatchLabel,
  normalizeBatchItem,
  snapToWeekEnd,
  snapToWeekStart,
} from '@/lib/payouts/batch';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('batchItemTotalCents + batchTotalCents (pure)', () => {
  it("sums hours + bonuses + reimbursements (all ≥ 0) + adjustments (signed)", () => {
    expect(batchItemTotalCents({
      hours_cents: 100000, bonuses_cents: 5000, reimbursements_cents: 2500, adjustments_cents: -1000,
    })).toBe(106500);
  });

  it("clamps each positive column to 0 if NaN / negative", () => {
    expect(batchItemTotalCents({ hours_cents: -500, bonuses_cents: 1000 })).toBe(1000);
    expect(batchItemTotalCents({ hours_cents: Number.NaN, bonuses_cents: 1000 })).toBe(1000);
  });

  it("floors total at 0 (no negative payouts)", () => {
    expect(batchItemTotalCents({ hours_cents: 0, adjustments_cents: -500 })).toBe(0);
  });

  it("batchTotalCents sums every row", () => {
    expect(batchTotalCents([
      { hours_cents: 100000 },
      { bonuses_cents: 5000 },
      { reimbursements_cents: 2500 },
    ])).toBe(107500);
  });
});

describe('snapToWeekStart + snapToWeekEnd (pure)', () => {
  it("Monday stays as the week start", () => {
    expect(snapToWeekStart(new Date('2026-06-15T12:00:00Z')).toISOString().slice(0, 10))
      .toBe('2026-06-15');
  });

  it("snaps a Wednesday back to that Monday", () => {
    expect(snapToWeekStart(new Date('2026-06-17T12:00:00Z')).toISOString().slice(0, 10))
      .toBe('2026-06-15');
  });

  it("snaps a Sunday back to the prior Monday", () => {
    expect(snapToWeekStart(new Date('2026-06-21T12:00:00Z')).toISOString().slice(0, 10))
      .toBe('2026-06-15');
  });

  it("week end is the Sunday after the Monday start", () => {
    const start = snapToWeekStart(new Date('2026-06-18T12:00:00Z'));
    expect(snapToWeekEnd(start).toISOString().slice(0, 10)).toBe('2026-06-21');
  });
});

describe('buildBatchLabel (pure)', () => {
  it("formats as 'Week YYYY-MM-DD → YYYY-MM-DD'", () => {
    expect(buildBatchLabel(
      new Date('2026-06-15T00:00:00Z'),
      new Date('2026-06-21T00:00:00Z'),
    )).toBe('Week 2026-06-15 → 2026-06-21');
  });
});

describe('normalizeBatchItem (pure)', () => {
  it("drops rows missing user_email", () => {
    expect(normalizeBatchItem({ hours_cents: 1000 })).toBeNull();
  });

  it("drops rows where every column is zero", () => {
    expect(normalizeBatchItem({ user_email: 'mary@example.com' })).toBeNull();
  });

  it("normalizes email to lowercase + trimmed", () => {
    const row = normalizeBatchItem({ user_email: '  Mary@example.com  ', hours_cents: 100 });
    expect(row?.user_email).toBe('mary@example.com');
  });

  it("rejects unsupported method values (sets null)", () => {
    expect(normalizeBatchItem({
      user_email: 'a@b.com', hours_cents: 100, method: 'crypto',
    })?.method).toBeNull();
  });

  it("computes total via batchItemTotalCents", () => {
    expect(normalizeBatchItem({
      user_email: 'a@b.com', hours_cents: 1000, bonuses_cents: 500,
    })?.total_cents).toBe(1500);
  });
});

describe('seed 325 — payout_batches schema', () => {
  const SRC = read('seeds/325_payout_batches.sql');

  it("creates payout_batches with the lifecycle status CHECK", () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.payout_batches/);
    expect(SRC).toMatch(
      /status\s+TEXT NOT NULL DEFAULT 'draft'\s+CHECK \(status IN \('draft', 'approved', 'dispatched', 'completed', 'voided'\)\)/,
    );
  });

  it("payout_batch_items has the cents component columns + dispatch method CHECK", () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS public\.payout_batch_items/);
    expect(SRC).toMatch(/hours_cents\s+INTEGER NOT NULL DEFAULT 0/);
    expect(SRC).toMatch(/bonuses_cents\s+INTEGER NOT NULL DEFAULT 0/);
    expect(SRC).toMatch(/reimbursements_cents\s+INTEGER NOT NULL DEFAULT 0/);
    expect(SRC).toMatch(/adjustments_cents\s+INTEGER NOT NULL DEFAULT 0/);
    expect(SRC).toMatch(
      /method\s+TEXT\s+CHECK \(method IN \('venmo', 'cashapp', 'zelle', 'ach', 'cash'\)\)/,
    );
  });

  it("enforces one row per (batch, employee)", () => {
    expect(SRC).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_batch_items_unique/);
    expect(SRC).toMatch(/ON public\.payout_batch_items \(batch_id, user_email\)/);
  });

  it("approval signature columns are present (approved_by + approval_ip + approved_at)", () => {
    expect(SRC).toMatch(/approved_by\s+TEXT/);
    expect(SRC).toMatch(/approval_ip\s+TEXT/);
    expect(SRC).toMatch(/approved_at\s+TIMESTAMPTZ/);
  });

  it("RLS + service-role policy + employee-self-read on items", () => {
    expect(SRC).toMatch(/ALTER TABLE public\.payout_batches\s+ENABLE ROW LEVEL SECURITY/);
    expect(SRC).toMatch(/ALTER TABLE public\.payout_batch_items\s+ENABLE ROW LEVEL SECURITY/);
    expect(SRC).toMatch(/CREATE POLICY service_role_full_access_payout_batches/);
    expect(SRC).toMatch(/CREATE POLICY employee_self_read_payout_batch_items/);
    expect(SRC).toMatch(/user_email = \(auth\.jwt\(\) ->> 'email'\)/);
  });

  it("reuses payments_set_updated_at trigger from seed 323", () => {
    expect(SRC).toMatch(/EXECUTE FUNCTION public\.payments_set_updated_at\(\)/);
  });
});

describe('GET + POST /api/admin/payouts/runs — source-lock', () => {
  const SRC = read('app/api/admin/payouts/runs/route.ts');

  it("gates both methods behind admin auth", () => {
    expect(SRC).toMatch(/isAdmin\(session\.user\.roles\)/);
  });

  it("rejects weekly batches without a week_start + week_end", () => {
    expect(SRC).toMatch(/week_start \+ week_end are required for weekly batches/);
  });

  it("rejects empty item arrays", () => {
    expect(SRC).toMatch(/At least one employee line with a positive total/);
  });

  it("INSERTs the batch with status='draft' + total from batchTotalCents", () => {
    expect(SRC).toMatch(/status: 'draft'/);
    expect(SRC).toMatch(/total_cents: total/);
  });

  it("rolls back the batch row when payout_batch_items insert fails", () => {
    expect(SRC).toMatch(/\.from\('payout_batches'\)\.delete\(\)\.eq\('id', batch\.id\)/);
  });
});

describe('/admin/payouts/runs page — source-lock', () => {
  const SRC = read('app/admin/payouts/runs/page.tsx');

  it("renders the wizard with week-start + week-end inputs + label preview", () => {
    expect(SRC).toMatch(/data-testid="payouts-week-start"/);
    expect(SRC).toMatch(/data-testid="payouts-week-end"/);
    expect(SRC).toMatch(/buildBatchLabel/);
  });

  it("defaults the wizard week to the most recent Monday → Sunday", () => {
    expect(SRC).toMatch(/snapToWeekStart/);
    expect(SRC).toMatch(/snapToWeekEnd/);
  });

  it("supports adding + removing employee rows", () => {
    expect(SRC).toMatch(/data-testid="payouts-add-row"/);
    expect(SRC).toMatch(/removeRow/);
  });

  it("computes grand total live via batchTotalCents", () => {
    expect(SRC).toMatch(/batchTotalCents\(itemsForTotal\)/);
    expect(SRC).toMatch(/data-testid="payouts-grand-total"/);
  });

  it("POSTs to /api/admin/payouts/runs with normalized items", () => {
    expect(SRC).toMatch(/fetch\('\/api\/admin\/payouts\/runs', \{\s*method: 'POST'/m);
    expect(SRC).toMatch(/kind: 'weekly'/);
  });

  it("shows the history list with status chips", () => {
    expect(SRC).toMatch(/data-testid="payouts-history"/);
    expect(SRC).toMatch(/payouts-chip--draft/);
    expect(SRC).toMatch(/payouts-chip--approved/);
    expect(SRC).toMatch(/payouts-chip--dispatched/);
  });
});

describe('AdminSidebar wires the Payout Runs link', () => {
  const SRC = read('app/admin/components/AdminSidebar.tsx');
  it("adds a Payout Runs entry routed to /admin/payouts/runs", () => {
    expect(SRC).toMatch(/href: '\/admin\/payouts\/runs', label: 'Payout Runs'/);
  });
});

describe('P11 plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/in-progress/payment-infrastructure-2026-06-18.md');

  it("plan still references the weekly payout batch UI scope", () => {
    expect(PLAN).toMatch(/Weekly payout batch UI/);
  });
});
