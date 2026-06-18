// __tests__/admin/employee-profile-ep6.test.ts
//
// Slice EP6 — Compensation surface: salary history + bonuses +
// recent payouts behind a role gate.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fmtCents } from '../../app/admin/profile/ProfilePanel';
import { canSeeOthersPay } from '../../lib/employee-profile/pay-visibility';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('fmtCents (pure helper)', () => {
  it('formats whole dollars to "$X,XXX.XX"', () => {
    expect(fmtCents(1_500_000)).toBe('$15,000.00');
    expect(fmtCents(25_50)).toBe('$25.50');
    expect(fmtCents(0)).toBe('$0.00');
  });

  it("renders '—' for null / undefined / non-finite cents", () => {
    expect(fmtCents(null)).toBe('—');
    expect(fmtCents(undefined)).toBe('—');
    expect(fmtCents(Number.NaN)).toBe('—');
  });
});

describe('canSeeOthersPay (pure helper)', () => {
  it("false when no payroll role is present", () => {
    expect(canSeeOthersPay(['employee'])).toBe(false);
    expect(canSeeOthersPay([])).toBe(false);
    expect(canSeeOthersPay(null)).toBe(false);
  });

  it("true when admin / developer / tech_support is in the role list", () => {
    expect(canSeeOthersPay(['admin'])).toBe(true);
    expect(canSeeOthersPay(['developer'])).toBe(true);
    expect(canSeeOthersPay(['tech_support', 'employee'])).toBe(true);
  });
});

describe('API /api/admin/profile/compensation (EP6)', () => {
  const SRC = read('app/api/admin/profile/compensation/route.ts');

  it('imports canSeeOthersPay from the shared lib (Next.js bans non-route re-exports from a route file)', () => {
    expect(SRC).toMatch(/import \{ canSeeOthersPay \} from '@\/lib\/employee-profile\/pay-visibility'/);
    // Per Next.js App Router rules, route.ts may only export
    // HTTP-verb handlers. The route must NOT re-export the
    // predicate — downstream callers import directly from the
    // lib module.
    expect(SRC).not.toMatch(/export\s*\{\s*canSeeOthersPay\s*\}/);
  });

  it("self always passes the gate; others need a payroll role OR admin", () => {
    expect(SRC).toMatch(/isSelf \|\| canSeeOthersPay\(session\.user\.roles\) \|\| isAdmin\(session\.user\.roles\)/);
  });

  it('fans out 3 reads in parallel + sorts each by recency', () => {
    expect(SRC).toMatch(/Promise\.all\(\[[\s\S]*?employee_salary_history[\s\S]*?employee_bonuses[\s\S]*?employee_payouts/);
    expect(SRC).toMatch(/effective_from'?, \{ ascending: false \}/);
    expect(SRC).toMatch(/awarded_at'?, \{ ascending: false \}/);
    expect(SRC).toMatch(/paid_at'?, \{ ascending: false \}/);
  });

  it('caps bonus list at 50 + payout list at 12 so a long tenure still loads fast', () => {
    expect(SRC).toMatch(/employee_bonuses[\s\S]*?\.limit\(50\)/);
    expect(SRC).toMatch(/employee_payouts[\s\S]*?\.limit\(12\)/);
  });
});

describe('ProfilePanel — Compensation card (EP6)', () => {
  const SRC = read('app/admin/profile/ProfilePanel.tsx');

  it('declares the compensation + compensationLoading state + fetchCompensation', () => {
    expect(SRC).toMatch(/const \[compensation, setCompensation\] = useState/);
    expect(SRC).toMatch(/const \[compensationLoading, setCompensationLoading\] = useState/);
    expect(SRC).toMatch(/`\/api\/admin\/profile\/compensation\?email=\$\{encodeURIComponent\(email\)\}`/);
  });

  it('renders the card with a stable testid', () => {
    expect(SRC).toMatch(/data-testid="profile-compensation"/);
  });

  it('surfaces the current rate (hourly or annual fallback)', () => {
    expect(SRC).toMatch(/data-testid="profile-compensation-current"/);
    expect(SRC).toMatch(/fmtCents\(currentSalary\.base_hourly_rate_cents\)\}\s*\/ hr/);
    expect(SRC).toMatch(/fmtCents\(currentSalary\.base_annual_salary_cents\)\}\s*\/ yr/);
  });

  it('renders the salary history sub-section ONLY when there are 2+ rows', () => {
    expect(SRC).toMatch(/compensation\.salary_history\.length > 1 && \(/);
    expect(SRC).toMatch(/data-testid="profile-compensation-history"/);
  });

  it('renders the bonuses + payouts sub-sections with empty-state fallbacks', () => {
    expect(SRC).toMatch(/data-testid="profile-compensation-bonuses"/);
    expect(SRC).toMatch(/data-testid="profile-compensation-payouts"/);
    expect(SRC).toMatch(/None on file/);
    expect(SRC).toMatch(/No payouts logged yet/);
  });
});
