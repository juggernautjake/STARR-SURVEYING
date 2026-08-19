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
    // These three are where money is decided: hours submitted, a decision recorded, and the engine
    // that used to cut a stub. Each previously had, or was one edit away from having, its own
    // formula. `payroll/runs` stays on the list after its retirement (S9c) precisely because a
    // closed route is where a rate calculation could creep back unnoticed.
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

  it('the payout builder pays from the hours ledger people actually write to', () => {
    // The legacy run read `job_time_entries`, which has never had a row, while every logged hour
    // goes to `daily_time_logs`. A run produced a 0-hour stub for everybody and reported success —
    // an empty result reading as a completed payroll. That engine is closed now (S9c), so the check
    // moved to the one that survived: it reaches the hours through the shared loader, and
    // `owed-loader.ts` is what reads them.
    const source = code(read('app/api/admin/payroll/pay-owed/route.ts'));
    expect(source).toContain('loadOwed(');
    expect(source.includes("'job_time_entries'"), 'payroll must not read job_time_entries').toBe(false);
    expect(code(read('lib/payroll/owed-loader.ts'))).toContain("'daily_time_logs'");
  });

  it('it pays only approved hours', () => {
    expect(code(read('lib/payroll/owed-loader.ts'))).toContain("eq('status', 'approved')");
  });

  it('it honours the approver’s decision over the resolved rate', () => {
    expect(code(read('lib/payroll/owed-loader.ts'))).toContain("'time_log_pay_decisions'");
  });
});

describe('pay advances come back out', () => {
  // An advance that is never recovered is a gift. Nothing about the recovery is enforced by types:
  // deleting the call leaves a payout builder that typechecks, passes, and silently writes off every
  // advance the firm has made.
  const runs = () => code(read('app/api/admin/payroll/runs/route.ts'));

  // ── AND IT MUST COME OUT OF THE SURVIVING ENGINE TOO (D2, 2026-08-12) ─────────────────────────
  //
  // Every assertion below this point used to apply only to `payroll/runs`, and that was the whole
  // problem: `planAdvanceRecovery` was called in exactly ONE place in the codebase, and retiring
  // that engine — which D2 decided to do — would have silently stopped the firm ever recovering an
  // advance again. Nothing would have failed. The money would just have stopped coming back.
  //
  // Caught by trying the retirement and watching seven tests go red. These are the checks that make
  // the retirement safe when it finally happens.
  const payOwed = () => code(read('app/api/admin/payroll/pay-owed/route.ts'));
  const cron = () => code(read('app/api/cron/payout-prepare/route.ts'));

  it('the hand-built payout batch recovers outstanding advances', () => {
    expect(payOwed()).toContain('planAdvanceRecovery({');
    expect(payOwed()).toContain("'pay_advances_outstanding'");
  });

  it('the SCHEDULED payout batch recovers them too', () => {
    // The worst place to skip it: nobody is watching when a cron runs.
    expect(cron()).toContain('planAdvanceRecovery({');
    expect(cron()).toContain("'pay_advances_outstanding'");
  });

  it('both write a repayment row linked to the payout item that took it', () => {
    for (const src of [payOwed(), cron()]) {
      expect(src).toContain("'pay_advance_repayments'");
      expect(src).toContain('payout_batch_item_id');
    }
  });

  it('neither nets the recovery into total_cents', () => {
    // The one mistake that cannot be seen once made. `lib/payroll/owed.ts` counts `total_cents` as
    // paid, so a netted total leaves the person owed the advance for ever and the firm hands it
    // straight back. It is withheld via `recovered_cents` instead.
    for (const src of [payOwed(), cron()]) {
      expect(src).toContain('recovered_cents');
      expect(
        /total_cents:\s*[^,\n]*-\s*recover/i.test(src),
        'total_cents must be the settled figure, never net of the recovery',
      ).toBe(false);
    }
  });

  it('the money that actually leaves is the disbursed figure, everywhere it leaves', () => {
    // A bank file or a Venmo deep link built from `total_cents` would hand back the advance the
    // batch just withheld, and the only evidence would be a balance that never goes down.
    const dispatch = code(read('lib/payouts/dispatch.ts'));
    expect(dispatch).toContain('disbursedCents(item)');
    expect(
      /const (amount|dollars) = \(Math\.max\(0, item\.total_cents\)/.test(dispatch),
      'dispatch must not send total_cents',
    ).toBe(false);
  });

  it('it recovers only against advances that were actually PAID OUT', () => {
    // The view filters to status 'paid'. Reading `pay_advance_requests` directly would recover
    // against approved-but-unpaid advances — taking back money never handed over.
    for (const src of [payOwed(), cron()]) {
      expect(src).toContain("'pay_advances_outstanding'");
      expect(
        /from\('pay_advance_requests'\)[\s\S]{0,80}select\('id, user_email, outstanding/.test(src),
        'the payout builder must read the outstanding view, not the raw request table',
      ).toBe(false);
    }
  });

  it('the retired engine is not still quietly doing it too', () => {
    // Why the checks above moved off `payroll/runs`: `planAdvanceRecovery` was called in exactly ONE
    // place and it was that handler, which is why retiring it first would have stopped recovery
    // dead. Now that the batch path owns it, the legacy engine must NOT also be recovering — two
    // engines taking the same advance would take it back twice, and the only evidence of that is a
    // payment somebody says is short.
    expect(runs().includes('planAdvanceRecovery({'), 'the retired engine still recovers advances').toBe(false);
  });
});

describe('the retired payroll engine is closed to new work (S9c)', () => {
  // D2 (2026-08-12) decided `payout_batches` survives and `payroll_runs` + `pay_stubs` becomes
  // read-only history. Nothing about "read-only" is enforced by types: re-adding the creation body
  // would typecheck, lint, and hand the firm back two engines that can each settle the same week —
  // the single most dangerous thing this subsystem ever had.
  const RUNS = 'app/api/admin/payroll/runs/route.ts';
  const runs = () => code(read(RUNS));

  it('POST refuses with a 410 and names where payroll happens now', () => {
    // 410, not 404: the route existed and is deliberately retired, where a 404 reads as a typo or a
    // broken deploy. And an error that only says "no" leaves somebody with wages to pay this week
    // nowhere to go, so it names the surviving path.
    expect(runs()).toMatch(/status: 410/);
    expect(runs()).toContain('/admin/payouts');
  });

  it('it creates neither a run nor a stub', () => {
    // The assertion that actually matters. A 410 somewhere in the file proves a branch exists, not
    // that the creation body is gone.
    expect(
      /from\('payroll_runs'\)[\s\S]{0,60}\.insert\(/.test(runs()),
      'the retired engine still inserts a payroll run',
    ).toBe(false);
    expect(
      /from\('pay_stubs'\)[\s\S]{0,60}\.insert\(/.test(runs()),
      'the retired engine still inserts a pay stub',
    ).toBe(false);
  });

  it('a run with no stubs cannot be COMPLETED, only cancelled', () => {
    // Found in a browser, not in the code: the one payroll run in the live database is a draft over
    // a 2019 period reading "2 employees · Gross $200.00 · Net $160.70" with ZERO `pay_stubs` rows
    // behind it. Completing it would have credited nobody — the crediting loop had nothing to
    // iterate — and left a row that reads everywhere as a payroll of $160.70 that was paid.
    //
    // POST already refused to CREATE an empty run. Nothing refused to complete one, and the last
    // write path on a retired engine is exactly where nobody would look again.
    expect(runs()).toMatch(/status: 409/);
    expect(runs()).toContain('has no pay stubs');
  });

  it('and the refusal reaches the person who pressed the button', () => {
    // The panel discarded the PUT response entirely, so a 409 arrived as nothing at all: the list
    // reloaded, the badge still said Draft, and the only available reading was "the button is
    // broken". A refusal nobody is shown is the same as no refusal.
    const panel = code(read('app/admin/components/payroll/PayrollRunPanel.tsx'));
    expect(panel).toMatch(/if \(!res\.ok\)/);
    expect(panel).toContain('setError(');
    // And the class it renders with must live in the stylesheet this page imports — a rule declared
    // elsewhere renders the failure as unstyled body text, which has happened here before.
    expect(code(read('app/admin/styles/AdminPayroll.css'))).toContain('.payroll-runs__error');
  });

  it('GET and PUT survive — the history is real, and a draft must still be finishable', () => {
    // Historical runs record payments actually made and `pay_stubs` rows are documents employees are
    // entitled to. Retiring the engine must not delete the record of what it paid.
    expect(runs()).toContain('export const GET');
    expect(runs()).toContain('export const PUT');
  });

  it('nothing in the app asks it to create one', () => {
    // A button whose only possible outcome is an error dialog is worse than no button: somebody
    // presses it, reads a refusal, and still has payroll to run.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const found of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const relative = `${dir}/${found.name}`;
        if (found.isDirectory()) { walk(relative); continue; }
        if (!/\.tsx?$/.test(found.name)) continue;
        const src = code(read(relative));
        if (src.includes('/api/admin/payroll/runs') && /method:\s*'POST'/.test(src)) offenders.push(relative);
      }
    };
    walk('app');
    walk('lib');

    expect(
      offenders,
      `${offenders.join(', ')} still POSTs to the retired payroll engine. Prepare a payout instead.`,
    ).toEqual([]);
  });

  it('the two-engine overlap guard retired with it', () => {
    // `lib/payroll/engine-overlap.ts` existed for one reason: while BOTH engines could settle a
    // period, a week paid on Friday by a batch could be paid again on Monday by a run. With the
    // legacy engine closed there is no second settler, and the surviving one is balance-driven —
    // `loadOwed` is approved earnings minus everything already committed, so a second batch for the
    // same week finds nothing owed. Deleted rather than left as an uncalled module still claiming to
    // guard something.
    expect(fs.existsSync(path.join(ROOT, 'lib/payroll/engine-overlap.ts'))).toBe(false);
    expect(runs().includes('findPeriodOverlap'), 'the retired overlap check is back').toBe(false);
  });

  it('the stub maths is kept, and stays uncalled', () => {
    // `pay-stub.ts` is NOT dead code to delete: if an accountant says the firm must withhold, stub
    // generation moves onto the batch path and this is the arithmetic. But it must have no caller
    // until then, because its withholding is a flat ESTIMATE (12% / 6.2% / 1.45%) while the
    // surviving engine pays GROSS. A stub whose net does not equal the payment is worse than no
    // stub: it is wrong, and the reader has no way to tell which number to believe. See S9b.
    expect(fs.existsSync(path.join(ROOT, 'lib/payroll/pay-stub.ts'))).toBe(true);
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const found of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const relative = `${dir}/${found.name}`;
        if (found.isDirectory()) { walk(relative); continue; }
        if (!/\.tsx?$/.test(found.name)) continue;
        if (relative.startsWith('lib/payroll/')) continue;
        if (code(read(relative)).includes('buildStubTotals(')) callers.push(relative);
      }
    };
    walk('app');
    walk('lib');

    expect(
      callers,
      `${callers.join(', ')} generates pay stubs. Its tax lines are estimates and the batch path ` +
      'pays gross — see S9b before wiring this back up.',
    ).toEqual([]);
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

describe('there is one vocabulary for how a payment was made', () => {
  // Three definitions existed and disagreed: the API accepted eight methods (including `stripe`,
  // which no rail can send), the dispatch module typed five with neither `check` nor `other`, and
  // the history module declared a fourth set under the same type NAME with a `direct_deposit` that
  // exists in no database row.
  //
  // The consequence was not cosmetic: a payout recorded as `check` was valid to create and
  // invisible to the dispatch grouping, so it fell into `unassigned` and the office saw a payment
  // with no method.
  const METHOD_FILE = 'lib/payouts/methods.ts';

  it('the vocabulary module exists and defines the list', () => {
    expect(fs.existsSync(path.join(ROOT, METHOD_FILE))).toBe(true);
    expect(code(read(METHOD_FILE))).toContain('export const PAYOUT_METHODS');
  });

  it('nothing else declares its own PayoutMethod union', () => {
    // A second `type PayoutMethod = 'a' | 'b'` anywhere is the defect coming back. Re-exporting the
    // one type is fine and is how the other two modules now work.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const found of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const relative = `${dir}/${found.name}`;
        if (found.isDirectory()) { walk(relative); continue; }
        if (!/\.tsx?$/.test(found.name)) continue;
        if (relative === METHOD_FILE) continue;
        // A UNION declaration, not a re-export.
        if (/type\s+PayoutMethod\s*=\s*'/.test(code(read(relative)))) offenders.push(relative);
      }
    };
    walk('app');
    walk('lib');

    expect(
      offenders,
      `${offenders.join(', ')} declares its own payment-method union. Import it from ${METHOD_FILE}.`,
    ).toEqual([]);
  });

  it('the API validates against that list rather than a private copy', () => {
    const route = code(read('app/api/admin/payouts/route.ts'));
    expect(route).toContain('PAYOUT_METHODS');
    // `stripe` was on the private list and has no rail behind it.
    expect(route.includes("'stripe'"), 'stripe is offerable again').toBe(false);
  });

  it('the dispatch screen has a column for every method that can be recorded', () => {
    // This is what the compiler caught when the vocabulary was consolidated: `check` and `other`
    // were recordable and had nowhere to render, so they showed as "Method not assigned".
    const screen = code(read('app/admin/payouts/runs/[id]/dispatch/page.tsx'));
    for (const method of ['cash', 'check', 'venmo', 'cashapp', 'zelle', 'ach', 'other']) {
      expect(screen, `the dispatch screen has no column for ${method}`).toContain(`${method}:`);
    }
  });
});

describe('paying what is owed reads the same balance the screen shows', () => {
  // The pay formula reached FOUR independent implementations before anybody noticed. "What is this
  // person owed" is exactly the kind of question that grows a second, slightly-different answer —
  // and if it did, the firm would pay an amount nobody was shown.
  it('both the balance endpoint and the payout builder use the one loader', () => {
    expect(code(read('app/api/admin/payroll/owed/route.ts'))).toContain('loadOwed(');
    expect(code(read('app/api/admin/payroll/pay-owed/route.ts'))).toContain('loadOwed(');
  });

  it('neither re-derives the balance itself', () => {
    // A direct read of the hours or the ledger in either route is the second implementation
    // starting. Both must go through the loader.
    for (const route of ['app/api/admin/payroll/owed/route.ts', 'app/api/admin/payroll/pay-owed/route.ts']) {
      const src = code(read(route));
      expect(src.includes("from('daily_time_logs')"), `${route} reads hours directly`).toBe(false);
      expect(src.includes("from('time_log_pay_decisions')"), `${route} reads decisions directly`).toBe(false);
    }
  });

  it('a batch is refused rather than built from a balance that could not be read', () => {
    // Building from a partial balance pays wrong amounts, and a payout is much harder to take back
    // than to not make.
    const src = code(read('app/api/admin/payroll/pay-owed/route.ts'));
    expect(src).toContain('No payout was created');
  });

  it('an empty batch is a refusal, not a success', () => {
    // A 200 with no lines reads as "paid". It must say which of "everyone is paid up" and "everyone
    // was excluded" actually happened.
    const src = code(read('app/api/admin/payroll/pay-owed/route.ts'));
    expect(src).toMatch(/status: 409/);
    expect(src).toContain('skipped');
  });

  it('the employee is told their pay is QUEUED, not paid', () => {
    // A draft batch has sent nothing. Saying "paid" before the money moves is a promise the
    // platform cannot keep — every method in the vocabulary carries sendsItself: false.
    const src = code(read('app/api/admin/payroll/pay-owed/route.ts'));
    expect(src).toContain('payout_queued');
    expect(src.includes("title: `$${(line.total_cents / 100).toFixed(2)} paid`"), 'claims paid').toBe(false);
  });
});

describe('the employee sees the same numbers the boss does', () => {
  // The approval queue and My Pay must not disagree about what somebody is owed. They read the
  // same endpoints for exactly that reason.
  const MY_PAY = 'app/admin/components/payroll/MyOwedAndPayouts.tsx';

  it('My Pay reads the shared balance endpoint, not a private calculation', () => {
    const src = code(read(MY_PAY));
    expect(src).toContain('/api/admin/payroll/owed');
    expect(src).toContain('/api/admin/payouts/search');
  });

  it('it is actually mounted', () => {
    // A correct component nobody renders is this codebase's most common defect.
    expect(code(read('app/admin/my-pay/MyPayPanel.tsx'))).toContain('<MyOwedAndPayouts');
  });

  it('a failed balance is never rendered as zero', () => {
    // "We could not work out your balance" and "you are owed nothing" must never look the same on
    // somebody's pay screen.
    expect(code(read(MY_PAY))).toContain('could not be worked out');
  });

  it('a payout that has not gone out does not read as one that has', () => {
    const src = code(read(MY_PAY));
    expect(src).toContain('not sent yet');
    expect(src).toMatch(/voided|failed/);
  });

  it('the stale profile field no longer claims to be what is owed', () => {
    // `employee_profiles.available_balance` is written only by the old payroll-run engine, which
    // pay no longer flows through. Somebody with forty approved unpaid hours saw $0.00 under a
    // label that reads as "you are paid up".
    const panel = code(read('app/admin/my-pay/MyPayPanel.tsx'));
    expect(panel.includes('>Available Balance<'), 'the misleading label is back').toBe(false);
    expect(panel).toContain('Withdrawal balance');
  });
});

describe('notification preferences are opt-OUT', () => {
  // Five admins means five bells for one crew member's Tuesday. But an opt-IN default would mean
  // shipping this turns everybody's notifications off until they find a settings page, and the
  // failure would look exactly like the feature not working.
  it('the submit path filters approvers through their preference', () => {
    expect(code(read('app/api/admin/time-logs/route.ts'))).toContain('approversWhoWantThis(');
  });

  it('a missing preference row means notified', () => {
    const src = code(read('lib/notifications/hours-submitted.ts'));
    // The line that makes it opt-out. If this inverts, everybody goes quiet at once.
    expect(src).toMatch(/if \(!pref\) return true;/);
  });

  it('the setting is reachable, not just storable', () => {
    // A preference table nobody can edit is a column, not a feature.
    expect(fs.existsSync(path.join(ROOT, 'app/api/admin/me/hours-notifications/route.ts'))).toBe(true);
    expect(code(read('app/admin/settings/page.tsx'))).toContain('<HoursNotificationSetting');
  });

  it('only the person themselves can change it', () => {
    // One admin silencing another's notifications about pay would be a quiet way to keep somebody
    // out of a decision they are entitled to make.
    const src = code(read('app/api/admin/me/hours-notifications/route.ts'));
    expect(src).toContain('session.user.email');
    expect(src.includes("searchParams.get('email')"), 'accepts somebody else’s email').toBe(false);
  });
});

describe('the scheduled payout prepares, it does not pay', () => {
  // There is no bank integration — the rail is an ACH CSV a human uploads. A cron that claimed to
  // have paid people would be the worst version of the defect this codebase keeps finding: a screen
  // saying money moved when it did not.
  const CRON = 'app/api/cron/payout-prepare/route.ts';

  it('exists and is scheduled', () => {
    expect(fs.existsSync(path.join(ROOT, CRON))).toBe(true);
    // A cron route nobody schedules never runs, which is this repo's most common defect wearing a
    // config file.
    expect(read('vercel.json')).toContain('/api/cron/payout-prepare');
  });

  it('creates a DRAFT, never a completed batch', () => {
    const src = code(read(CRON));
    expect(src).toContain("status: 'draft'");
    expect(src.includes("status: 'completed'"), 'the cron marks batches complete').toBe(false);
    expect(src.includes("status: 'paid'"), 'the cron marks money paid').toBe(false);
  });

  it('tells the admins it is PREPARED, not paid', () => {
    const src = code(read(CRON));
    expect(src).toContain('payout_prepared');
    expect(src).toMatch(/Nothing has been sent yet/);
  });

  it('reuses the shared balance rather than computing its own', () => {
    // A scheduled payout and a hand-pressed one differ only in what triggered them. A second
    // implementation is exactly how the pay formula reached four copies.
    const src = code(read(CRON));
    expect(src).toContain('loadOwed(');
    expect(src.includes("from('daily_time_logs')"), 'the cron reads hours directly').toBe(false);
  });

  it('refuses to build a batch from a balance it could not read', () => {
    // On a timer, with nobody watching, a partial balance pays wrong amounts silently.
    expect(code(read(CRON))).toContain('No batch prepared');
  });

  it('is gated by CRON_SECRET', () => {
    const src = code(read(CRON));
    expect(src).toContain('CRON_SECRET');
    expect(src).toMatch(/status: 401/);
  });
});

describe('employee money accounts are actually credited', () => {
  // The account machinery already existed — available_balance, balance_transactions, a withdrawal
  // flow. Nothing ever credited it, so the balance was permanently $0.00. An account nobody can put
  // money into is a table, not a feature.
  it('marking an account payout paid credits the balance', () => {
    const src = code(read('app/api/admin/payouts/runs/[id]/items/[itemId]/mark/route.ts'));
    expect(src).toContain('planAccountCredit(');
    expect(src).toContain("'balance_transactions'");
  });

  it('the credit is keyed to the payout item, so a repeat call cannot double it', () => {
    // This route is called again whenever the office updates an external reference on a paid row.
    const src = code(read('app/api/admin/payouts/runs/[id]/items/[itemId]/mark/route.ts'));
    expect(src).toContain("reference_type: 'payout_batch_item'");
    expect(src).toContain('reference_id: itemId');
  });

  it('only the account method credits — the others left the firm', () => {
    const src = code(read('lib/payroll/account-credit.ts'));
    expect(src).toMatch(/method !== 'account'/);
  });

  it('the account method exists and does not claim to send itself', () => {
    // Money credited to an account has NOT left the firm. It leaves when they withdraw it.
    const src = code(read('lib/payouts/methods.ts'));
    expect(src).toContain("'account'");
    expect(src).toMatch(/account: \{[\s\S]*?sendsItself: false/);
  });
});
