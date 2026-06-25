// G5 / Phase 2.1 — source-lock for the W-2 / 1099 classification helpers.
import { describe, it, expect } from 'vitest';
import {
  normalizeClassification,
  classificationLabel,
  is1099NecReportable,
  classifyTaxRows,
  NEC_1099_THRESHOLD_CENTS,
} from '@/lib/payouts/worker-classification';
import type { EmployeeTaxRow } from '@/lib/payouts/tax-report';

function row(email: string, total: number): EmployeeTaxRow {
  return {
    user_email: email,
    user_name: null,
    total_cents: total,
    by_method: { venmo: 0, cashapp: 0, zelle: 0, ach: 0, cash: 0, stripe: 0, other: 0 },
    payment_count: 1,
    first_paid_at: null,
    last_paid_at: null,
  };
}

describe('worker-classification: normalize + label', () => {
  it('coerces unknown / null to unclassified', () => {
    expect(normalizeClassification('w2')).toBe('w2');
    expect(normalizeClassification('contractor_1099')).toBe('contractor_1099');
    expect(normalizeClassification('nonsense')).toBe('unclassified');
    expect(normalizeClassification(null)).toBe('unclassified');
    expect(normalizeClassification(undefined)).toBe('unclassified');
  });
  it('labels each classification', () => {
    expect(classificationLabel('w2')).toMatch(/W-2/);
    expect(classificationLabel('contractor_1099')).toMatch(/1099/);
    expect(classificationLabel('unclassified')).toBe('Unclassified');
  });
});

describe('worker-classification: is1099NecReportable', () => {
  it('only flags 1099 contractors at/over $600', () => {
    expect(NEC_1099_THRESHOLD_CENTS).toBe(60000);
    expect(is1099NecReportable('contractor_1099', 60000)).toBe(true);
    expect(is1099NecReportable('contractor_1099', 60001)).toBe(true);
    expect(is1099NecReportable('contractor_1099', 59999)).toBe(false);
    expect(is1099NecReportable('w2', 1000000)).toBe(false);
    expect(is1099NecReportable('unclassified', 1000000)).toBe(false);
  });
});

describe('worker-classification: classifyTaxRows', () => {
  it('groups, totals, and lists NEC-reportables', () => {
    const rows = [row('a@x.com', 120000), row('b@x.com', 50000), row('c@x.com', 80000), row('d@x.com', 30000)];
    const cls = {
      'a@x.com': 'w2' as const,
      'b@x.com': 'contractor_1099' as const,
      'c@x.com': 'contractor_1099' as const,
      // d@x.com intentionally absent → unclassified
    };
    const out = classifyTaxRows(rows, cls);

    expect(out.by_classification.w2).toEqual({ count: 1, total_cents: 120000 });
    expect(out.by_classification.contractor_1099).toEqual({ count: 2, total_cents: 130000 });
    expect(out.by_classification.unclassified).toEqual({ count: 1, total_cents: 30000 });

    // b = $500 (under $600 → not reportable); c = $800 (reportable)
    expect(out.nec_reportable.map((r) => r.user_email)).toEqual(['c@x.com']);
    expect(out.rows.find((r) => r.user_email === 'b@x.com')?.nec_reportable).toBe(false);
    expect(out.rows.find((r) => r.user_email === 'c@x.com')?.nec_reportable).toBe(true);
  });

  it('matches the classification lookup case-insensitively', () => {
    const out = classifyTaxRows([row('Mixed@X.com', 70000)], { 'mixed@x.com': 'contractor_1099' });
    expect(out.rows[0].classification).toBe('contractor_1099');
    expect(out.rows[0].nec_reportable).toBe(true);
  });

  it('defaults to an empty lookup (everyone unclassified)', () => {
    const out = classifyTaxRows([row('a@x.com', 90000)]);
    expect(out.by_classification.unclassified.count).toBe(1);
    expect(out.nec_reportable).toEqual([]);
  });
});
