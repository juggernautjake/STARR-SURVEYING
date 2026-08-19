// __tests__/payroll/balance-writers.test.ts
//
// WHO IS ALLOWED TO MOVE AN EMPLOYEE'S BALANCE
// ════════════════════════════════════════════
//
// `employee_profiles.available_balance` is what an employee can withdraw. It is a running total of
// `balance_transactions`, and `checkBalanceIntegrity` reports any figure that cannot be derived from
// those movements as unexplained.
//
// That invariant only holds if the set of writers stays small and each one writes a ledger row. This
// test is what keeps it small: a new route that credits a balance has to appear here, which makes it
// a decision somebody recorded rather than a line that slipped in.
//
// ── S5, ANSWERED (2026-08-12) ───────────────────────────────────────────────────────────────────
//
// The plan asked whether APPROVING a payout batch should credit the balance, ahead of dispatch. The
// answer is no, and the money model already implies it:
//
//   * `available_balance` means "we hold this for you and you can withdraw it".
//   * Approving a batch means "the firm agrees it owes this". Nothing has been sent, and the batch
//     can still be voided.
//
// Crediting at approval would let somebody withdraw money against a batch that was later cancelled —
// real money out of the door for a payment that never happened. The obligation only becomes "we hold
// this for you" when an `account`-method item is marked paid, which is where the credit lives.
//
// So S5 is closed by a decision plus this guard, not by new crediting code.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..');

/** Source with comments stripped — the explanations below necessarily name the very fields the
 *  assertions forbid, so matching the raw text would fail on correct code. */
const code = (rel: string): string =>
  fs.readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

/**
 * Every route permitted to write `available_balance`, and why.
 *
 * Adding to this list is a deliberate act. Each entry writes a `balance_transactions` row in the
 * same operation — that pairing is what makes the balance derivable.
 */
const SANCTIONED: Array<{ file: string; why: string }> = [
  {
    file: 'app/api/admin/payouts/runs/[id]/items/[itemId]/mark/route.ts',
    why: 'an `account`-method payout marked paid — the moment the obligation becomes "we hold this for you"',
  },
  {
    file: 'app/api/admin/payroll/runs/route.ts',
    why: 'completing a legacy payroll run — the engine is closed to new work (S9c) but an existing draft must still be finishable',
  },
  {
    file: 'app/api/admin/payroll/balance/route.ts',
    why: 'processing a withdrawal — the money leaving',
  },
];

describe('approving a payout does not credit anybody', () => {
  it('the approve route never touches a balance', () => {
    // The S5 answer, enforced. A credit here would let somebody withdraw against a batch that is
    // later voided — real money out for a payment that never happened.
    const src = code('app/api/admin/payouts/runs/[id]/approve/route.ts');
    expect(src).not.toContain('available_balance');
    expect(src).not.toContain('balance_transactions');
    expect(src).not.toContain('planAccountCredit');
  });

  it('nor does building a batch', () => {
    // A draft commits the money against `owed`; it does not hand it over.
    for (const file of ['app/api/admin/payroll/pay-owed/route.ts', 'app/api/cron/payout-prepare/route.ts']) {
      const src = code(file);
      expect(src, `${file} must not credit a balance`).not.toContain('available_balance');
    }
  });
});

describe('the balance is not an editable field', () => {
  it('the employee-profile route refuses to set it directly', () => {
    // It spreads `updates` into the row, so without this guard a PATCH could set any figure with no
    // movement behind it — exactly what `checkBalanceIntegrity` reports as unexplained, and an
    // employee can withdraw against it.
    const src = code('app/api/admin/payroll/employees/route.ts');
    expect(src).toContain('LEDGER_OWNED');
    expect(src).toMatch(/cannot be set directly/);
  });

  it('the self-edit path never had it, and still does not', () => {
    // Non-admins get an explicit allow-list rather than a spread. Worth pinning: the whole reason
    // the admin path needed a guard is that it does not have one of these.
    const src = code('app/api/admin/payroll/employees/route.ts');
    const allowList = src.slice(src.indexOf('const allowed = {'), src.indexOf('const allowed = {') + 700);
    expect(allowList).not.toContain('available_balance');
  });
});

describe('the writer set stays small', () => {
  it('only the sanctioned routes write a balance', () => {
    // A ratchet: a new crediting path has to be added here, which makes it a decision somebody
    // recorded rather than a line that slipped in.
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p));
        else if (e.name.endsWith('.ts')) out.push(p);
      }
      return out;
    };

    /**
     * Does this file WRITE the column, as opposed to mentioning it?
     *
     * A bare `/available_balance:/` is not enough: `employees/route.ts` builds a response object for
     * staff who have no profile row yet, and `available_balance: 0` there is a default in a payload
     * being SENT to the browser, not a value being stored. Flagging it would make this ratchet cry
     * wolf on its first run, which is how a guard gets an exception added and then ignored.
     *
     * So the column has to appear inside an `.update(` / `.upsert(` / `.insert(` call — the only
     * three ways a value reaches the table.
     */
    const writesBalance = (src: string): boolean => {
      const calls = /\.(update|upsert|insert)\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = calls.exec(src)) !== null) {
        // The payload of a Supabase write is the object literal that opens at the call. A fixed
        // window is enough here and avoids brace-matching a whole file.
        if (/available_balance\s*:/.test(src.slice(m.index, m.index + 600))) return true;
      }
      return false;
    };

    const writers = walk(path.join(ROOT, 'app', 'api'))
      .map((abs) => path.relative(ROOT, abs).replace(/\\/g, '/'))
      .filter((rel) => writesBalance(code(rel)));

    const allowed = new Set(SANCTIONED.map((s) => s.file));
    const unexpected = writers.filter((w) => !allowed.has(w));

    expect(
      unexpected,
      unexpected.length
        ? `These routes write available_balance and are not on the sanctioned list:\n  ${unexpected.join('\n  ')}\n\n`
          + 'Every writer must also write a balance_transactions row in the same operation, or the '
          + 'balance stops being derivable from its ledger. Add it to SANCTIONED with a reason, or '
          + 'move the credit into one of the existing paths.'
        : undefined,
    ).toEqual([]);
  });

  it('every sanctioned writer also writes a ledger row', () => {
    // The pairing IS the invariant. A credit with no movement behind it is the drift this whole
    // test file exists to prevent.
    for (const { file, why } of SANCTIONED) {
      const src = code(file);
      expect(src, `${file} (${why}) must write balance_transactions alongside the balance`)
        .toContain('balance_transactions');
    }
  });
});
