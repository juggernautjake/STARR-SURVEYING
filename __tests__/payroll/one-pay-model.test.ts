// __tests__/payroll/one-pay-model.test.ts
//
// ONE MODEL, AND IT STAYS ONE
// ═══════════════════════════
//
// The pay system held four independent implementations of "what does this hour cost", off three
// sets of tables, and they could not agree except by coincidence. They were retired into
// `lib/payroll/resolve-rate.ts` on 2026-08-04.
//
// Nothing about that consolidation is enforced by types or by any runtime check: a future edit can
// re-add a rate calculation to a route in five lines, and it will typecheck, lint and pass every
// other test in this repository. The symptom would be a person quietly paid the wrong amount.
//
// So these are source-level guards. They read the live route files and fail when a pay-carrying
// table is touched outside the one module that is allowed to touch it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\r\n/g, '\n');
}

/** Strip comments, so an explanation of what a file NO LONGER does cannot satisfy or trip a check. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

/** Every table that answers "what is this person paid". Only the pay modules may read them. */
const RATE_TABLES = [
  'work_type_rates',
  'role_tiers',
  'seniority_brackets',
  'credential_bonuses',
  'xp_pay_milestones',
  'pay_rate_standards',
  'role_pay_adjustments',
  'user_pay_overrides',
];

/** The modules that ARE the model. Everything else must go through them. */
const PAY_MODULES = [
  'lib/payroll/resolve-rate.ts',
  'lib/payroll/pay-context.ts',
  'lib/payroll/effective-rate.ts',
  'lib/payroll/pay-decision.ts',
  'lib/payroll/pay-stub.ts',
  'lib/payroll/tier-match.ts',
];

describe('the pay model has exactly one implementation', () => {
  it('the modules it lives in are all present', () => {
    // A guard whose subject has been renamed passes for the wrong reason. This is the control.
    for (const file of PAY_MODULES) {
      expect(fs.existsSync(path.join(ROOT, file)), `${file} is missing`).toBe(true);
    }
  });

  it('the routes that pay people read the model, not the rate tables', () => {
    // These three are where money is decided: hours submitted, a decision recorded, a stub cut.
    // Each previously had, or was one edit away from having, its own formula.
    //
    // `time-logs/rates/route.ts` is deliberately NOT in this list: it is the config-listing endpoint
    // and its whole job is to return those tables when asked for one by name. The test below pins
    // the part of it that matters — that the *prices* it hands out come from the model.
    const payingRoutes = [
      'app/api/admin/time-logs/route.ts',
      'app/api/admin/time-logs/pay-decision/route.ts',
      'app/api/admin/payroll/runs/route.ts',
    ];

    for (const route of payingRoutes) {
      const source = code(read(route));
      for (const table of RATE_TABLES) {
        expect(
          source.includes(`'${table}'`),
          `${route} reads ${table} directly. Rates come from lib/payroll — see the header of ` +
          `lib/payroll/resolve-rate.ts for why four copies of this formula disagreed.`,
        ).toBe(false);
      }
    }
  });

  it('the rates endpoint prices through the model even though it lists the raw tables', () => {
    const source = code(read('app/api/admin/time-logs/rates/route.ts'));
    expect(source).toContain('rateMenuFor');
    // No arithmetic on a rate anywhere in it — the numbers it returns are the model's, unmodified.
    expect(source.includes('base_rate *'), 'the rates endpoint is doing its own maths').toBe(false);
  });

  it('the payroll run pays from the hours ledger people actually write to', () => {
    // It read `job_time_entries`, which has never had a row, while every logged hour goes to
    // `daily_time_logs`. A run produced a 0-hour stub for everybody and reported success — an empty
    // result reading as a completed payroll.
    const source = code(read('app/api/admin/payroll/runs/route.ts'));
    expect(source).toContain("'daily_time_logs'");
    expect(source.includes("'job_time_entries'"), 'payroll must not read job_time_entries').toBe(false);
  });

  it('the payroll run pays only approved hours', () => {
    const source = code(read('app/api/admin/payroll/runs/route.ts'));
    expect(source).toContain("eq('status', 'approved')");
  });

  it('the payroll run honours the approver’s decision over the resolved rate', () => {
    const source = code(read('app/api/admin/payroll/runs/route.ts'));
    expect(source).toContain("'time_log_pay_decisions'");
  });
});

describe('pay advances come back out', () => {
  // An advance that is never recovered is a gift. Nothing about the recovery is enforced by types:
  // deleting the call leaves a payroll run that typechecks, passes, and silently writes off every
  // advance the firm has made.
  const runs = () => code(read('app/api/admin/payroll/runs/route.ts'));

  it('the payroll run recovers outstanding advances', () => {
    // The CALL, not the identifier. Matching the bare name passes on the import line alone, so
    // deleting the invocation would have left this test green — a check that cannot fail for the
    // reason it claims. Found by breaking it and watching it pass.
    expect(runs()).toContain('planAdvanceRecovery({');
    expect(runs()).toContain('recovery.recoveries');
  });

  it('it recovers only against advances that were actually PAID OUT', () => {
    // The view filters to status 'paid'. Reading `pay_advance_requests` directly would recover
    // against approved-but-unpaid advances — taking back money never handed over.
    expect(runs()).toContain("'pay_advances_outstanding'");
    expect(
      runs().includes("from('pay_advance_requests')\n    .select('id, user_email, outstanding"),
      'payroll must read the outstanding view, not the raw request table',
    ).toBe(false);
  });

  it('every recovery is written as its own row, linked to the stub it came out of', () => {
    // A running total alone cannot answer "which pay period took this", and cannot be reversed when
    // a run is voided.
    expect(runs()).toContain("'pay_advance_repayments'");
    expect(runs()).toContain('pay_stub_id');
  });

  it('the recovery comes out of net pay, not gross', () => {
    // An advance is money already handed over, not a pre-tax deduction. Taking it from gross would
    // reduce the tax withheld on wages the person genuinely earned.
    expect(runs()).toContain('net_pay: recovery.netAfterRecovery');
  });
});

describe('there is one record of money paid to a person', () => {
  // `employee_payouts` was a second, strictly weaker copy of `payout_batch_items`: no batch, no
  // approval, no status, no failure handling. Five routes read it; ten read the real ledger; the two
  // sets shared no rows. Retired 2026-08-04 into `lib/payroll/payout-ledger.ts`.
  //
  // Nothing stops it being reintroduced. A single `.from('employee_payouts')` in a new route would
  // typecheck, lint, and split the ledger again — and the split is invisible until somebody compares
  // a payout report against the bank file.
  it('no route reads or writes the retired employee_payouts table', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const found of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const relative = `${dir}/${found.name}`;
        if (found.isDirectory()) { walk(relative); continue; }
        if (!/\.tsx?$/.test(found.name)) continue;
        // `lib/saas/org-scope.ts` is a schema inventory of every org-scoped table, not a read. The
        // table still exists — it is retired, not dropped — so removing it from that list would
        // make the org-scoping test stop checking a table that is still there.
        if (relative === 'lib/saas/org-scope.ts') continue;
        if (code(read(relative)).includes("'employee_payouts'")) offenders.push(relative);
      }
    };
    walk('app');
    walk('lib');

    expect(
      offenders,
      `${offenders.join(', ')} reads employee_payouts. Payouts live in payout_batch_items — ` +
      'use lib/payroll/payout-ledger.ts.',
    ).toEqual([]);
  });

  it('the ledger module is the one that knows the payout tables', () => {
    const ledger = code(read('lib/payroll/payout-ledger.ts'));
    expect(ledger).toContain("'payout_batch_items'");
    expect(ledger).toContain("'payout_batches'");
  });

  it('a one-off payout is recorded in the same ledger as every other payment', () => {
    // Recording it anywhere else is what produced two records of the same event: a payment made
    // through this route would be invisible to the ACH export, the tax report and the finance
    // overview.
    const route = code(read('app/api/admin/payouts/route.ts'));
    expect(route).toContain("from('payout_batch_items')");
    expect(route).toContain("from('payout_batches')");
  });

  it('leaves payout_log alone — it is an audit trail, not a payout ledger', () => {
    // Checked before assuming, because "these look similar" is how a working table gets deleted.
    // Its columns are old_rate / new_rate / old_role / new_role: it records employee CHANGES, and
    // `employees/manage` uses it as one.
    expect(code(read('app/api/admin/employees/manage/route.ts'))).toContain("'payout_log'");
  });
});

describe('the parked progression system stays parked', () => {
  it('nothing in the live pay path stacks grade, seniority, credentials or XP', () => {
    // Parked at the owner's request, 2026-08-04: base pay plus a handful of set activity rates.
    // `effective-rate.ts` keeps the graduated formula and its tests so restoring it is wiring, but
    // it must have no caller until somebody decides to restore it.
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const found of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const relative = `${dir}/${found.name}`;
        if (found.isDirectory()) { walk(relative); continue; }
        if (!/\.tsx?$/.test(found.name)) continue;
        if (relative.startsWith('lib/payroll/')) continue;   // the module itself
        if (code(read(relative)).includes('computeEffectiveRate')) callers.push(relative);
      }
    };
    walk('app');
    walk('lib');

    // The pay-progression pages are the parked feature itself; they are unreachable from any menu
    // or search (`parked: true` in the route registry). Any OTHER caller means the graduated model
    // has crept back into something people use.
    const unexpected = callers.filter((c) => !c.startsWith('app/admin/pay-progression/'));
    expect(unexpected, `computeEffectiveRate is being called from ${unexpected.join(', ')}`).toEqual([]);
  });

  it('the pay-progression route is marked parked in the registry', () => {
    const registry = code(read('lib/admin/route-registry.ts'));
    const line = registry.split('\n').find((l) => l.includes("'/admin/pay-progression'"));
    expect(line, 'the pay-progression route is gone from the registry entirely').toBeTruthy();
    expect(line).toContain('parked: true');
  });
});
