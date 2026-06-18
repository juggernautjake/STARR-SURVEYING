// __tests__/admin/payment-payout-tax-report.test.ts
//
// P16 of payment-infrastructure-2026-06-18.md — locks the annual /
// quarterly tax export.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  aggregateForTaxReport,
  buildTaxCsv,
  buildTaxCsvRow,
  describeRange,
  totalsAcrossRows,
} from '@/lib/payouts/tax-report';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('aggregateForTaxReport (pure)', () => {
  it("folds rows per employee + per method", () => {
    const out = aggregateForTaxReport([
      { user_email: 'mary@x.com', user_name: 'Mary', method: 'venmo', total_cents: 5000, paid_at: '2026-03-01' },
      { user_email: 'mary@x.com', user_name: 'Mary', method: 'cash',  total_cents: 2500, paid_at: '2026-04-05' },
      { user_email: 'bob@x.com',  user_name: 'Bob',  method: 'ach',   total_cents: 7500, paid_at: '2026-06-01' },
    ]);
    expect(out).toHaveLength(2);
    const mary = out.find((r) => r.user_email === 'mary@x.com')!;
    expect(mary.total_cents).toBe(7500);
    expect(mary.by_method.venmo).toBe(5000);
    expect(mary.by_method.cash).toBe(2500);
    expect(mary.first_paid_at).toBe('2026-03-01');
    expect(mary.last_paid_at).toBe('2026-04-05');
    expect(mary.payment_count).toBe(2);
  });

  it("normalizes unknown methods into the 'other' bucket", () => {
    const out = aggregateForTaxReport([
      { user_email: 'a@x.com', user_name: null, method: 'unknown', total_cents: 100, paid_at: null },
    ]);
    expect(out[0].by_method.other).toBe(100);
  });

  it("lowercases email + sorts descending by total", () => {
    const out = aggregateForTaxReport([
      { user_email: 'A@X.com', user_name: null, method: 'cash', total_cents: 100, paid_at: '2026-01-01' },
      { user_email: 'b@x.com', user_name: null, method: 'cash', total_cents: 200, paid_at: '2026-01-01' },
    ]);
    expect(out[0].user_email).toBe('b@x.com');
    expect(out[1].user_email).toBe('a@x.com');
  });

  it("handles negative / non-finite amounts as zero", () => {
    const out = aggregateForTaxReport([
      { user_email: 'a@x.com', user_name: null, method: 'cash', total_cents: -500, paid_at: null },
    ]);
    expect(out[0].total_cents).toBe(0);
  });
});

describe('totalsAcrossRows (pure)', () => {
  it("sums every employee's total + payment count", () => {
    const rows = aggregateForTaxReport([
      { user_email: 'a@x.com', user_name: null, method: 'cash', total_cents: 1000, paid_at: null },
      { user_email: 'b@x.com', user_name: null, method: 'cash', total_cents: 2000, paid_at: null },
      { user_email: 'a@x.com', user_name: null, method: 'cash', total_cents: 500, paid_at: null },
    ]);
    expect(totalsAcrossRows(rows)).toEqual({ total_cents: 3500, payment_count: 3 });
  });
});

describe('buildTaxCsv + buildTaxCsvRow (pure)', () => {
  it("emits the canonical 13-column header", () => {
    expect(buildTaxCsv([])).toBe(
      'user_email,user_name,payment_count,first_paid_at,last_paid_at,total_usd,venmo_usd,cashapp_usd,zelle_usd,ach_usd,cash_usd,stripe_usd,other_usd',
    );
  });

  it("emits dollars (not cents) on the totals + per-method columns", () => {
    const rows = aggregateForTaxReport([
      { user_email: 'mary@x.com', user_name: 'Mary', method: 'venmo', total_cents: 12500, paid_at: '2026-03-01' },
    ]);
    const line = buildTaxCsvRow(rows[0]);
    expect(line).toContain('125.00');
    expect(line).toContain('mary@x.com');
  });

  it("quotes fields with commas", () => {
    const rows = aggregateForTaxReport([
      { user_email: 'a@x.com', user_name: 'Smith, Mary', method: 'cash', total_cents: 100, paid_at: null },
    ]);
    expect(buildTaxCsvRow(rows[0])).toContain('"Smith, Mary"');
  });
});

describe('describeRange (pure)', () => {
  it("labels Jan 1 → Dec 31 as 'Tax year YYYY'", () => {
    expect(describeRange('2026-01-01', '2026-12-31')).toBe('Tax year 2026');
  });

  it("labels Q1 / Q2 / Q3 / Q4 cleanly", () => {
    expect(describeRange('2026-01-01', '2026-03-31')).toBe('Q1 2026');
    expect(describeRange('2026-04-01', '2026-06-30')).toBe('Q2 2026');
    expect(describeRange('2026-07-01', '2026-09-30')).toBe('Q3 2026');
    expect(describeRange('2026-10-01', '2026-12-31')).toBe('Q4 2026');
  });

  it("falls back to from → to for arbitrary ranges", () => {
    expect(describeRange('2026-03-15', '2026-08-22')).toBe('2026-03-15 → 2026-08-22');
  });
});

describe('GET /api/admin/payouts/tax-report — source-lock', () => {
  const SRC = read('app/api/admin/payouts/tax-report/route.ts');

  it("gates by admin auth", () => {
    expect(SRC).toMatch(/isAdmin\(session\.user\.roles\)/);
  });

  it("validates from + to as YYYY-MM-DD + rejects reversed ranges", () => {
    expect(SRC).toMatch(/ISO_DATE = \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
    expect(SRC).toMatch(/from must be on or before to/);
  });

  it("filters payout_batch_items.status = 'paid' on paid_at", () => {
    expect(SRC).toMatch(/\.eq\('status', 'paid'\)/);
    expect(SRC).toMatch(/\.gte\('paid_at', fromTs\)/);
    expect(SRC).toMatch(/\.lte\('paid_at', toTs\)/);
  });

  it("respects ?format=csv with text/csv + attachment filename", () => {
    expect(SRC).toMatch(/\.get\('format'\) === 'csv'/);
    expect(SRC).toMatch(/'Content-Type': 'text\/csv; charset=utf-8'/);
    expect(SRC).toMatch(/'Content-Disposition': `attachment; filename="payouts_tax_/);
  });
});

describe('/admin/payouts/tax-report page — source-lock', () => {
  const SRC = read('app/admin/payouts/tax-report/page.tsx');

  it("renders the year + per-quarter quick-pins", () => {
    expect(SRC).toMatch(/data-testid="tax-quick-year"/);
    expect(SRC).toMatch(/data-testid="tax-quick-q1"/);
    expect(SRC).toMatch(/data-testid="tax-quick-q2"/);
    expect(SRC).toMatch(/data-testid="tax-quick-q3"/);
    expect(SRC).toMatch(/data-testid="tax-quick-q4"/);
  });

  it("Download CSV link hits the same endpoint with format=csv", () => {
    expect(SRC).toMatch(/data-testid="tax-download-csv"/);
    expect(SRC).toMatch(/format=csv/);
  });

  it("renders the grand total + per-employee table", () => {
    expect(SRC).toMatch(/data-testid="tax-grand-total"/);
    expect(SRC).toMatch(/data-testid="tax-table"/);
    expect(SRC).toMatch(/data-testid={`tax-row-/);
  });

  it("renders an empty state when no confirmed payouts in range", () => {
    expect(SRC).toMatch(/data-testid="tax-empty"/);
    expect(SRC).toMatch(/No confirmed payouts in this range/);
  });
});

describe('/admin/payouts/runs links to the tax report', () => {
  const SRC = read('app/admin/payouts/runs/page.tsx');
  it("renders the 'Tax report' link", () => {
    expect(SRC).toMatch(/href="\/admin\/payouts\/tax-report"/);
    expect(SRC).toMatch(/data-testid="payouts-tax-report-link"/);
  });
});

describe('P16 plan annotation locks the slice', () => {
  const PLAN = read('docs/planning/in-progress/payment-infrastructure-2026-06-18.md');
  it("plan still references the tax reporting prep scope", () => {
    expect(PLAN).toMatch(/Tax reporting prep/);
  });
});
