// __tests__/employee-pond/e14-history-page.test.ts
//
// employee-pond Slice E14 — activity-history API endpoint + admin
// "everything" page. Locks the API's visibility-helper handoff
// + the page's tab structure + the admin-only gating of the
// Salary / Payouts sections.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('/api/admin/employees/[email]/history — GET route', () => {
  const SRC = read('app/api/admin/employees/[email]/history/route.ts');

  it('auth-gates on signed-in user', () => {
    expect(SRC).toMatch(/if \(!session\?\.user\?\.email\)/);
    expect(SRC).toMatch(/Unauthorized/);
  });

  it('hydrates the target user privacy row up-front so visibility decisions read consistently', () => {
    expect(SRC).toMatch(/hydrateEmployeePrivacy\(/);
  });

  it('viewerSeesEverything gate decides whether salary + payouts ever leave the server', () => {
    expect(SRC).toMatch(/const seesEverything = viewerSeesEverything\(viewer, targetEmail\)/);
    expect(SRC).toMatch(/if \(seesEverything\) \{/);
  });

  it("non-admin viewer only gets bonuses when the target's show_bonuses_to_employees is true", () => {
    expect(SRC).toMatch(
      /if \(seesEverything \|\| privacy\.show_bonuses_to_employees\)/,
    );
  });

  it("salary_history + payouts are NEVER returned to a non-admin (always-admin-only)", () => {
    // The `if (seesEverything)` block is the ONLY path that
    // populates salaryHistory + payouts in the response.
    expect(SRC).toMatch(/let salaryHistory: unknown\[\] = \[\];[\s\S]*?let payouts: unknown\[\] = \[\];/);
    expect(SRC).toMatch(/from\('employee_salary_history'\)/);
    expect(SRC).toMatch(/from\('employee_payouts'\)/);
  });

  it("response shape carries viewer_sees_everything + target_email so the page knows what's been gated", () => {
    expect(SRC).toMatch(
      /return NextResponse\.json\(\{\s*\n\s*target_email: targetEmailLower,\s*\n\s*viewer_sees_everything: seesEverything,[\s\S]*?bonuses,[\s\S]*?salary_history: salaryHistory,[\s\S]*?payouts,/,
    );
  });

  it("parses the email param off the URL pathname (withErrorHandler is single-arg)", () => {
    expect(SRC).toMatch(/new URL\(req\.url\)\.pathname/);
    expect(SRC).toMatch(/segments\[segments\.length - 2\]/);
  });
});

describe('/admin/employees/manage/[email]/history page', () => {
  const SRC = read('app/admin/employees/manage/[email]/history/page.tsx');

  it("declares 'use client' so React hooks land", () => {
    expect(SRC).toMatch(/'use client';/);
  });

  it("fetches /api/admin/employees/<encoded>/history on mount", () => {
    expect(SRC).toMatch(/`\/api\/admin\/employees\/\$\{encodeURIComponent\(email\)\}\/history`/);
  });

  it('renders the four tabs (Overview / Bonuses / Salary / Payouts)', () => {
    expect(SRC).toMatch(/'overview', 'bonuses', 'salary', 'payouts'/);
  });

  it("salary + payouts tabs only render when viewer_sees_everything is true", () => {
    expect(SRC).toMatch(/const isAdminOnly = t === 'salary' \|\| t === 'payouts';\s*\n\s*if \(isAdminOnly && !seesAll\) return null;/);
  });

  it("overview shows YTD bonus total via sumBonusesSince + a privacy notice for limited viewers", () => {
    expect(SRC).toMatch(/sumBonusesSince\(data\.bonuses, ytdCutoff\)/);
    expect(SRC).toMatch(/data-testid="overview-ytd-bonuses"/);
    expect(SRC).toMatch(/Salary \+ payouts are admin-only/);
  });

  it("overview shows current salary only when viewer is admin", () => {
    expect(SRC).toMatch(/data-testid="overview-current-salary"/);
    expect(SRC).toMatch(/\{seesAll && \(\s*\n\s*<>/);
  });

  it("bonus / salary / payout rows have stable testIDs for e2e selection", () => {
    expect(SRC).toMatch(/data-testid="bonus-row"/);
    expect(SRC).toMatch(/data-testid="salary-row"/);
    expect(SRC).toMatch(/data-testid="payout-row"/);
  });

  it('back link goes to the existing employee profile (manage page)', () => {
    expect(SRC).toMatch(/href=\{`\/admin\/employees\/manage\?email=\$\{encodeURIComponent\(email\)\}`\}/);
  });

  it('uses the canonical formatters from the E13 helper', () => {
    expect(SRC).toMatch(/from '@\/lib\/employee-pond\/activity-history'/);
    expect(SRC).toMatch(/formatCents/);
    expect(SRC).toMatch(/currentSalaryRow/);
  });
});
