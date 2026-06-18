// __tests__/admin/payment-payout-dispatch.test.ts
//
// P13 of payment-infrastructure-2026-06-18.md — locks the per-method
// dispatch flow:
//   - lib/payouts/dispatch.ts: groupItemsByMethod, buildPayoutDeepLink,
//     batchStatusFromItems, buildAchCsv (pure)
//   - POST /api/admin/payouts/runs/[id]/items/[itemId]/mark
//   - GET  /api/admin/payouts/runs/[id]/ach-csv
//   - /admin/payouts/runs/[id]/dispatch page

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  batchStatusFromItems,
  buildAchCsv,
  buildAchCsvLine,
  buildPayoutDeepLink,
  buildPayoutNote,
  groupItemsByMethod,
  type DispatchItem,
} from '@/lib/payouts/dispatch';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const mkItem = (overrides: Partial<DispatchItem> = {}): DispatchItem => ({
  id: 'i1', user_email: 'mary@starr.com', user_name: 'Mary Smith',
  total_cents: 50000, method: 'venmo', method_handle: 'maryvenmo',
  status: 'pending', ...overrides,
});

describe('groupItemsByMethod (pure)', () => {
  it("buckets by method + collects unassigned rows", () => {
    const out = groupItemsByMethod([
      mkItem({ id: 'a', method: 'venmo' }),
      mkItem({ id: 'b', method: 'cash' }),
      mkItem({ id: 'c', method: null }),
      mkItem({ id: 'd', method: 'venmo' }),
    ]);
    expect(out.venmo.map((i) => i.id)).toEqual(['a', 'd']);
    expect(out.cash.map((i) => i.id)).toEqual(['b']);
    expect(out.unassigned.map((i) => i.id)).toEqual(['c']);
  });
});

describe('buildPayoutNote (pure)', () => {
  it("composes the canonical memo", () => {
    expect(buildPayoutNote('Week 2026-06-15 → 2026-06-21', { user_email: 'mary@starr.com' }))
      .toBe('Starr Surveying payout — Week 2026-06-15 → 2026-06-21 — mary@starr.com');
  });
});

describe('buildPayoutDeepLink (pure)', () => {
  it("fills the Venmo template; strips leading @ off the handle", () => {
    const link = buildPayoutDeepLink(
      mkItem({ method: 'venmo', method_handle: '@maryvenmo', total_cents: 12345 }),
      'Week X',
    );
    expect(link).toContain('venmo://paycharge');
    expect(link).toContain('recipients=maryvenmo');
    expect(link).toContain('amount=123.45');
  });

  it("fills the Cash App template; strips leading $", () => {
    expect(buildPayoutDeepLink(
      mkItem({ method: 'cashapp', method_handle: '$marycash', total_cents: 7500 }),
      'Week X',
    )).toBe('https://cash.app/$marycash/75.00');
  });

  it("Zelle falls back to mailto: with the memo prefilled", () => {
    const link = buildPayoutDeepLink(
      mkItem({ method: 'zelle', method_handle: 'mary@bank.com', total_cents: 5000 }),
      'Week X',
    );
    expect(link).toMatch(/^mailto:mary@bank\.com\?/);
    expect(link).toContain('Zelle%20payout');
  });

  it("cash + ach return null (no link to follow)", () => {
    expect(buildPayoutDeepLink(mkItem({ method: 'cash' }), 'Week X')).toBeNull();
    expect(buildPayoutDeepLink(mkItem({ method: 'ach' }), 'Week X')).toBeNull();
  });

  it("returns null when the method has no handle on file", () => {
    expect(buildPayoutDeepLink(mkItem({ method: 'venmo', method_handle: null }), 'Week X')).toBeNull();
  });
});

describe('batchStatusFromItems (pure)', () => {
  it("all items paid → completed", () => {
    expect(batchStatusFromItems(
      [{ status: 'paid' }, { status: 'paid' }, { status: 'paid' }],
      'dispatched',
    )).toBe('completed');
  });

  it("mix of sent + paid → dispatched", () => {
    expect(batchStatusFromItems([{ status: 'sent' }, { status: 'paid' }], 'approved')).toBe('dispatched');
  });

  it("some still pending → stays approved", () => {
    expect(batchStatusFromItems([{ status: 'pending' }, { status: 'sent' }], 'approved')).toBe('dispatched');
    expect(batchStatusFromItems([{ status: 'pending' }, { status: 'pending' }], 'approved')).toBe('approved');
  });

  it("any non-pending failed → dispatched (don't regress)", () => {
    expect(batchStatusFromItems([{ status: 'failed' }, { status: 'paid' }], 'dispatched')).toBe('dispatched');
  });

  it("voided / draft passes through unchanged", () => {
    expect(batchStatusFromItems([{ status: 'paid' }], 'voided')).toBe('voided');
    expect(batchStatusFromItems([{ status: 'paid' }], 'draft')).toBe('draft');
  });
});

describe('buildAchCsv + buildAchCsvLine (pure)', () => {
  it("emits one header + one row per item, comma-quote safe", () => {
    const csv = buildAchCsv(
      [mkItem({ user_email: 'a@b.com', user_name: 'A B', method_handle: '123-456', total_cents: 5000, method: 'ach' })],
      'Week X',
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe('email,name,account,amount,memo');
    expect(lines[1]).toMatch(/^a@b\.com,A B,123-456,50\.00,/);
  });

  it("quotes fields with commas", () => {
    const line = buildAchCsvLine(
      mkItem({ user_email: 'a@b.com', user_name: 'Smith, Mary', total_cents: 100, method: 'ach' }),
      'Week X',
    );
    expect(line).toContain('"Smith, Mary"');
  });

  it("returns just the header row when there are no items", () => {
    expect(buildAchCsv([], 'Week X')).toBe('email,name,account,amount,memo');
  });
});

describe('POST mark item — source-lock', () => {
  const SRC = read('app/api/admin/payouts/runs/[id]/items/[itemId]/mark/route.ts');

  it("gates by admin auth + rejects bad statuses", () => {
    expect(SRC).toMatch(/isAdmin\(session\.user\.roles\)/);
    expect(SRC).toMatch(/'Unsupported status'/);
  });

  it("refuses to mark items on a draft / voided batch", () => {
    expect(SRC).toMatch(/batch\.status !== 'approved' && batch\.status !== 'dispatched'/);
    expect(SRC).toMatch(/status: 409/);
  });

  it("clears external_ref + failure_reason + paid_at on a re-open to pending", () => {
    expect(SRC).toMatch(/external_ref = null/);
    expect(SRC).toMatch(/failure_reason = null/);
    expect(SRC).toMatch(/paid_at = null/);
  });

  it("rolls the batch status forward via batchStatusFromItems", () => {
    expect(SRC).toMatch(/batchStatusFromItems/);
    expect(SRC).toMatch(/dispatched_at = new Date\(\)\.toISOString\(\)/);
    expect(SRC).toMatch(/completed_at = new Date\(\)\.toISOString\(\)/);
  });
});

describe('GET ACH CSV — source-lock', () => {
  const SRC = read('app/api/admin/payouts/runs/[id]/ach-csv/route.ts');

  it("only serves CSV for approved / dispatched batches", () => {
    expect(SRC).toMatch(/batch\.status !== 'approved' && batch\.status !== 'dispatched'/);
  });

  it("filters payout_batch_items to method='ach'", () => {
    expect(SRC).toMatch(/\.eq\('method', 'ach'\)/);
  });

  it("returns text/csv with an attachment filename", () => {
    expect(SRC).toMatch(/'Content-Type': 'text\/csv; charset=utf-8'/);
    expect(SRC).toMatch(/'Content-Disposition': `attachment; filename="ach_/);
  });
});

describe('/admin/payouts/runs/[id]/dispatch page — source-lock', () => {
  const SRC = read('app/admin/payouts/runs/[id]/dispatch/page.tsx');

  it("blocks the page when batch is draft / voided", () => {
    expect(SRC).toMatch(/data-testid="dispatch-blocked"/);
  });

  it("renders a section per method via groupItemsByMethod", () => {
    expect(SRC).toMatch(/groupItemsByMethod\(items\)/);
    expect(SRC).toMatch(/data-testid={`dispatch-bucket-/);
  });

  it("ACH bucket shows the Download CSV button", () => {
    expect(SRC).toMatch(/data-testid="dispatch-ach-csv"/);
    expect(SRC).toMatch(/ach-csv/);
  });

  it("per row: deep-link Open button, ref input, Mark sent / paid / failed", () => {
    expect(SRC).toMatch(/data-testid={`dispatch-link-/);
    expect(SRC).toMatch(/data-testid={`dispatch-ref-/);
    expect(SRC).toMatch(/data-testid={`dispatch-mark-sent-/);
    expect(SRC).toMatch(/data-testid={`dispatch-mark-paid-/);
    expect(SRC).toMatch(/data-testid={`dispatch-mark-failed-/);
  });

  it("calls the mark route with the typed ref", () => {
    expect(SRC).toMatch(/fetch\(`\/api\/admin\/payouts\/runs\/\$\{batch\.id\}\/items\/\$\{item\.id\}\/mark`/);
    expect(SRC).toMatch(/external_ref: refs\[item\.id\]\?\.trim\(\) \|\| undefined/);
  });
});

describe('detail page links to dispatch', () => {
  const SRC = read('app/admin/payouts/runs/[id]/page.tsx');
  it("shows the Open dispatch link for approved + dispatched batches", () => {
    expect(SRC).toMatch(/batch\.status === 'approved' \|\| batch\.status === 'dispatched'/);
    expect(SRC).toMatch(/data-testid="batch-open-dispatch"/);
  });
});

describe('P13 plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/in-progress/payment-infrastructure-2026-06-18.md');
  it("plan still references the per-method dispatch scope", () => {
    expect(PLAN).toMatch(/Outbound dispatch — per-method/);
  });
});
