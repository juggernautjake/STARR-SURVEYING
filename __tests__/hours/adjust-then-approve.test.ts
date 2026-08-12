// __tests__/hours/adjust-then-approve.test.ts
//
// Three defects reported by the owner on 2026-08-12, all on the hours-approval screen, and all the
// same shape: **the capability existed and the UI had no door to it.**
//
//   1. *"there is not a way to approve hours after they have been adjusted"* — `adjust` sets the status
//      to 'adjusted', which is not 'pending', so the row fell into the already-decided branch and lost
//      its Approve button. The approver could re-adjust forever and never finish. The API never had
//      this restriction.
//   2. *"if the employer adjusts hours, that should be represented in the total hours"* — the page
//      total, the per-employee total and the row headline all summed raw `hours`, so cutting a ten-hour
//      day to eight left the approver's own screen still reporting ten. The rule for this already
//      existed in four other modules, including one whose comment documents fixing this exact bug on
//      the EMPLOYEE's summary.
//   3. *"not letting me click on the users and set their positions"* — the position grid was inert
//      count cards; `job_title` has always been accepted by `PUT /api/admin/payroll/employees`.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { effectiveHours, computeHoursFlags } from '@/lib/hours/hours-flags';

/** Source with comments stripped — this file's own prose must not satisfy its assertions. */
const src = (p: string) =>
  fs.readFileSync(path.join(process.cwd(), p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/^\s*\/\/[^\n]*$/gm, '');

const APPROVAL = 'app/admin/hours-approval/page.tsx';
const PAYROLL = 'app/admin/payroll/page.tsx';

describe('effectiveHours — one definition of "the hours that count"', () => {
  it('prefers the approver’s adjustment over the submitted figure', () => {
    expect(effectiveHours({ hours: 10, adjusted_hours: 8 })).toBe(8);
  });

  it('falls back to the submitted hours when nothing was adjusted', () => {
    expect(effectiveHours({ hours: 10, adjusted_hours: null })).toBe(10);
  });

  it('treats an adjustment to zero as a real decision, not a missing one', () => {
    // `?? ` on a 0 would be correct, but `||` would not — an approver zeroing a day means zero, and
    // silently reverting to the submitted hours would pay for work that was explicitly disallowed.
    expect(effectiveHours({ hours: 10, adjusted_hours: 0 })).toBe(0);
  });

  it('ignores NaN and Infinity rather than propagating them into a total', () => {
    expect(effectiveHours({ hours: 10, adjusted_hours: Number.NaN })).toBe(10);
    expect(effectiveHours({ hours: 10, adjusted_hours: Number.POSITIVE_INFINITY })).toBe(10);
    expect(effectiveHours({ hours: Number.NaN, adjusted_hours: null })).toBe(0);
  });

  it('handles a missing entry shape without throwing', () => {
    expect(effectiveHours({})).toBe(0);
  });

  it('is the same rule the review flags already used', () => {
    // The flags counted an adjusted day correctly while the totals beside them did not — the two
    // disagreeing on one screen is what made this worth extracting rather than copying again.
    const flags = computeHoursFlags([{ log_date: '2026-08-10', hours: 20, adjusted_hours: 8, status: 'adjusted' }]);
    expect(flags.some((f) => f.kind === 'long_day'), 'an adjusted-down day is no longer a long day').toBe(false);
  });
});

describe('the approval page can finish what it started', () => {
  const s = src(APPROVAL);

  it('offers Approve on an entry that is not already approved', () => {
    // The bug: the already-decided branch offered only "Set pay" and "Adjust".
    expect(s, 'the decided-entry branch still has no Approve button').toMatch(
      /log\.status !== 'approved'[\s\S]{0,220}action[^\n]*'approve'|log\.status !== 'approved'[\s\S]{0,220}singleAction\(log\.id, 'approve'\)/,
    );
  });

  it('does not offer Approve on something already approved', () => {
    // Guard against "just always show it", which would put a no-op button on every settled row.
    expect(s).toMatch(/log\.status !== 'approved'/);
  });

  it('can adjust and approve in one click', () => {
    expect(s, 'no combined adjust-and-approve action').toMatch(/Adjust & approve/);
    expect(s, 'the adjust-only escape hatch was removed').toMatch(/Adjust only/);
    expect(s).toMatch(/submitAction\(true\)/);
    expect(s).toMatch(/submitAction\(false\)/);
  });

  it('only approves when the adjustment actually saved', () => {
    // Approving after a failed adjustment approves the ORIGINAL hours while the approver believes
    // they approved the corrected ones — the worst possible outcome of a convenience button.
    const fn = s.slice(s.indexOf('const submitAction'));
    const adjustBlock = fn.slice(0, 1800);
    expect(adjustBlock).toMatch(/if \(!res\.ok\)/);
    expect(adjustBlock).toMatch(/if \(thenApprove\)/);
    // The failure path must return before the approve call.
    expect(adjustBlock.indexOf('if (!res.ok)')).toBeLessThan(adjustBlock.indexOf('if (thenApprove)'));
  });
});

describe('an adjustment is reflected everywhere the hours are counted', () => {
  const s = src(APPROVAL);

  it('the page total uses the adjusted figure', () => {
    expect(s).toMatch(/logs\.reduce\(\(s, l\) => s \+ effectiveHours\(l\), 0\)/);
  });

  it('the per-employee total uses the adjusted figure', () => {
    expect(s).toMatch(/empLogs\.reduce\(\(s, l\) => s \+ effectiveHours\(l\), 0\)/);
  });

  it('no total sums raw hours any more', () => {
    // The precise regression: `s + l.hours` in a reduce.
    expect(s, 'a total is still summing raw hours, ignoring the adjustment').not.toMatch(/reduce\(\([^)]*\) => \w+ \+ l\.hours/);
  });

  it('the row headline shows the hours that count', () => {
    expect(s).toMatch(/effectiveHours\(log\)/);
  });

  it('still shows what the employee originally submitted', () => {
    // Replacing the number outright would erase the only on-screen evidence that a change was made,
    // and an approver reviewing their own past decision needs to see the claim as well as the ruling.
    expect(s).toMatch(/<s className="tl-approval-entry__hours-was"/);
    expect(s).toMatch(/Adjusted \{log\.hours\}h/);
  });

  it('imports the shared helper instead of redefining the rule', () => {
    expect(s).toMatch(/import \{[^}]*effectiveHours[^}]*\} from '@\/lib\/hours\/hours-flags'/);
  });
});

describe('payroll positions can be set from where they are shown', () => {
  const s = src(PAYROLL);

  it('the position card is a control, not an inert div', () => {
    expect(s).toMatch(/payroll-overview__position-card--link/);
    expect(s).toMatch(/<button[\s\S]{0,400}payroll-overview__position-card/);
  });

  it('clicking a position takes you to that list rather than nowhere', () => {
    expect(s).toMatch(/setActiveTab\('employees'\);\s*setSearch\(key\)/);
  });

  it('names the people, since “who holds this” is the actual question', () => {
    expect(s).toMatch(/payroll-overview__position-people/);
    expect(s).toMatch(/holders\.slice\(0, 4\)/);
  });

  it('each name opens the page where the position is actually changed', () => {
    expect(s).toMatch(/router\.push\(`\/admin\/payroll\/\$\{encodeURIComponent\(emp\.user_email\)\}`\)/);
  });

  it('a name click does not also trigger the card', () => {
    // Nested interactive targets with different destinations: without stopPropagation, clicking a
    // person would filter the list AND navigate, and the navigation would win confusingly.
    expect(s).toMatch(/e\.stopPropagation\(\)/);
  });

  it('a name is reachable by keyboard', () => {
    expect(s).toMatch(/onKeyDown/);
    expect(s).toMatch(/tabIndex=\{0\}/);
  });

  it('the API has always accepted job_title, so only the UI needed fixing', () => {
    // Recorded because it is the reason this was a small fix and not a feature: nothing server-side
    // changed. If this ever stops being true the assertion should fail loudly.
    const api = src('app/api/admin/payroll/employees/route.ts');
    expect(api).toMatch(/payFields\s*=\s*\[[^\]]*'job_title'/);
  });
});
