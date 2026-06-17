// __tests__/employee-pond/e13-activity-history.test.ts
//
// employee-pond Slice E13 — activity history schema + typed
// helpers. Locks the three new seeds' table shapes + the pure
// helpers (formatCents / formatHours / currentSalaryRow /
// sumBonusesSince + the ACTIVITY_TABLES constants).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ACTIVITY_TABLES,
  currentSalaryRow,
  formatCents,
  formatHours,
  sumBonusesSince,
  type EmployeeBonus,
  type EmployeeSalaryHistoryRow,
} from '@/lib/employee-pond/activity-history';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('ACTIVITY_TABLES — table-name constants', () => {
  it('exposes the three table names', () => {
    expect(ACTIVITY_TABLES).toEqual({
      bonuses: 'employee_bonuses',
      salary: 'employee_salary_history',
      payouts: 'employee_payouts',
    });
  });
});

describe('formatCents', () => {
  it('renders USD with thousands separator + two decimals', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(150)).toBe('$1.50');
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(100000000)).toBe('$1,000,000.00');
  });

  it('returns em-dash for null / undefined / NaN', () => {
    expect(formatCents(null)).toBe('—');
    expect(formatCents(undefined)).toBe('—');
    expect(formatCents(Number.NaN)).toBe('—');
  });

  it('handles negative cents (refunds / corrections)', () => {
    // toLocaleString uses an en-dash for negatives, but the dollar
    // is still present; just verify the value parses back.
    const result = formatCents(-500);
    expect(result).toMatch(/[-−]\$5\.00/);
  });
});

describe('formatHours', () => {
  it('singular vs plural', () => {
    expect(formatHours(1)).toBe('1 hr');
    expect(formatHours(0)).toBe('0 hrs');
    expect(formatHours(8.5)).toBe('8.5 hrs');
  });

  it("returns em-dash for null / undefined / NaN", () => {
    expect(formatHours(null)).toBe('—');
    expect(formatHours(undefined)).toBe('—');
    expect(formatHours(Number.NaN)).toBe('—');
  });
});

function makeSalary(over: Partial<EmployeeSalaryHistoryRow> = {}): EmployeeSalaryHistoryRow {
  return {
    id: 's-1',
    user_email: 'hank@example.com',
    base_hourly_rate_cents: 8500,
    base_annual_salary_cents: null,
    effective_from: '2020-01-01T00:00:00Z',
    effective_to: null,
    changed_by: 'admin@example.com',
    change_reason: 'initial',
    notes: null,
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2020-01-01T00:00:00Z',
    ...over,
  };
}

describe('currentSalaryRow', () => {
  it('returns null for empty input', () => {
    expect(currentSalaryRow([])).toBeNull();
  });

  it('returns the row with effective_to IS NULL when one exists', () => {
    const rows: EmployeeSalaryHistoryRow[] = [
      makeSalary({ id: 'a', effective_to: '2022-01-01T00:00:00Z' }),
      makeSalary({ id: 'b', effective_to: null }),
      makeSalary({ id: 'c', effective_to: '2023-01-01T00:00:00Z' }),
    ];
    expect(currentSalaryRow(rows)?.id).toBe('b');
  });

  it("falls back to the most recent row when every entry has an effective_to", () => {
    const rows: EmployeeSalaryHistoryRow[] = [
      makeSalary({ id: 'a', effective_from: '2020-01-01T00:00:00Z', effective_to: '2021-01-01T00:00:00Z' }),
      makeSalary({ id: 'b', effective_from: '2022-01-01T00:00:00Z', effective_to: '2023-01-01T00:00:00Z' }),
      makeSalary({ id: 'c', effective_from: '2021-01-01T00:00:00Z', effective_to: '2022-01-01T00:00:00Z' }),
    ];
    expect(currentSalaryRow(rows)?.id).toBe('b');
  });
});

function makeBonus(over: Partial<EmployeeBonus> = {}): EmployeeBonus {
  return {
    id: 'b-1',
    user_email: 'hank@example.com',
    amount_cents: 50000,
    reason: 'crew_lead',
    awarded_by: 'admin@example.com',
    awarded_at: '2026-06-01T00:00:00Z',
    related_job_id: null,
    notes: null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...over,
  };
}

describe('sumBonusesSince', () => {
  it('sums every bonus on or after the cutoff (inclusive)', () => {
    const bonuses = [
      makeBonus({ id: 'a', amount_cents: 50000, awarded_at: '2025-12-31T00:00:00Z' }),
      makeBonus({ id: 'b', amount_cents: 75000, awarded_at: '2026-01-01T00:00:00Z' }),
      makeBonus({ id: 'c', amount_cents: 25000, awarded_at: '2026-06-15T00:00:00Z' }),
    ];
    expect(sumBonusesSince(bonuses, '2026-01-01T00:00:00Z')).toBe(75000 + 25000);
  });

  it("returns 0 when no bonuses are after the cutoff", () => {
    expect(sumBonusesSince([makeBonus()], '2099-01-01T00:00:00Z')).toBe(0);
  });

  it('returns 0 for an empty list', () => {
    expect(sumBonusesSince([], '2026-01-01T00:00:00Z')).toBe(0);
  });
});

describe('seeds/296_employee_bonuses.sql', () => {
  const SQL = read('seeds/296_employee_bonuses.sql');

  it('creates the employee_bonuses table with the documented columns', () => {
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS public\.employee_bonuses/);
    expect(SQL).toMatch(/user_email[\s\S]*?NOT NULL/);
    expect(SQL).toMatch(/amount_cents[\s\S]*?BIGINT NOT NULL/);
    expect(SQL).toMatch(/reason[\s\S]*?NOT NULL/);
    expect(SQL).toMatch(/awarded_at[\s\S]*?NOT NULL DEFAULT now\(\)/);
    expect(SQL).toMatch(/related_job_id[\s\S]*?REFERENCES public\.jobs\(id\)/);
  });

  it('has an index on (user_email, awarded_at DESC) for the activity list', () => {
    expect(SQL).toMatch(/idx_employee_bonuses_user_email_awarded_at[\s\S]*?\(user_email, awarded_at DESC\)/);
  });
});

describe('seeds/297_employee_salary_history.sql', () => {
  const SQL = read('seeds/297_employee_salary_history.sql');

  it('requires at least one rate (CHECK constraint)', () => {
    expect(SQL).toMatch(
      /employee_salary_history_some_rate[\s\S]*?CHECK \(base_hourly_rate_cents IS NOT NULL OR base_annual_salary_cents IS NOT NULL\)/,
    );
  });

  it("enforces effective_from <= effective_to when both set", () => {
    expect(SQL).toMatch(
      /employee_salary_history_effective_window[\s\S]*?CHECK \(effective_to IS NULL OR effective_from <= effective_to\)/,
    );
  });

  it("has a partial index for the 'current compensation' row (effective_to IS NULL)", () => {
    expect(SQL).toMatch(
      /idx_employee_salary_history_current[\s\S]*?WHERE effective_to IS NULL/,
    );
  });
});

describe('seeds/298_employee_payouts.sql', () => {
  const SQL = read('seeds/298_employee_payouts.sql');

  it('declares the period + gross/net amount columns', () => {
    expect(SQL).toMatch(/period_start[\s\S]*?DATE NOT NULL/);
    expect(SQL).toMatch(/period_end[\s\S]*?DATE NOT NULL/);
    expect(SQL).toMatch(/gross_cents[\s\S]*?BIGINT NOT NULL/);
    expect(SQL).toMatch(/net_cents[\s\S]*?BIGINT NOT NULL/);
  });

  it("declares items as JSONB so the line-item shape can evolve without migrations", () => {
    expect(SQL).toMatch(/items[\s\S]*?JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
  });

  it("CHECK constraint enforces sane amounts (net <= gross, both >= 0)", () => {
    expect(SQL).toMatch(
      /employee_payouts_amounts_sane[\s\S]*?CHECK \(gross_cents >= 0 AND net_cents >= 0 AND net_cents <= gross_cents\)/,
    );
  });

  it("declares a default method = 'direct_deposit'", () => {
    expect(SQL).toMatch(/method[\s\S]*?DEFAULT 'direct_deposit'/);
  });

  it("has an index on (user_email, paid_at DESC) for the activity list", () => {
    expect(SQL).toMatch(/idx_employee_payouts_user_email_paid_at[\s\S]*?\(user_email, paid_at DESC\)/);
  });
});
