// __tests__/payroll/account-credit.test.ts
//
// Employee money accounts. The account machinery already existed and nothing ever credited it, so
// the balance was permanently $0.00 — an account nobody can put money into is a table, not a
// feature. These are the cases where getting it wrong costs somebody real money.

import { describe, it, expect } from 'vitest';
import { planAccountCredit, alreadyCredited, type BalanceTransaction } from '@/lib/payroll/account-credit';

const base = {
  method: 'account',
  amountCents: 19_000,
  payoutItemId: 'item-1',
  currentBalanceDollars: 50,
  existingTransactions: [] as BalanceTransaction[],
};

describe('an account payout credits the balance', () => {
  it('adds the payout to what they already hold', () => {
    const plan = planAccountCredit(base);
    expect(plan.credit).toBe(true);
    expect(plan.amountDollars).toBe(190);
    expect(plan.balanceBefore).toBe(50);
    expect(plan.balanceAfter).toBe(240);
  });

  it('converts cents to dollars, since the two tables disagree on units', () => {
    // `payout_batch_items.total_cents` is cents; `balance_transactions.amount` is dollars. Getting
    // this backwards is a 100x error in whichever direction nobody checks.
    expect(planAccountCredit({ ...base, amountCents: 4_250 }).amountDollars).toBe(42.5);
  });

  it('names the batch so the ledger line is readable later', () => {
    const plan = planAccountCredit({ ...base, batchLabel: 'Approved hours through 2026-08-05' });
    expect(plan.description).toContain('Approved hours through 2026-08-05');
  });

  it('starts from zero when the profile has no balance yet', () => {
    const plan = planAccountCredit({ ...base, currentBalanceDollars: Number.NaN });
    expect(plan.balanceBefore).toBe(0);
    expect(plan.balanceAfter).toBe(190);
  });
});

describe('every other method credits nothing', () => {
  it('does not credit a cash payout', () => {
    // The money was handed over. Crediting an account for it would pay somebody twice.
    const plan = planAccountCredit({ ...base, method: 'cash' });
    expect(plan.credit).toBe(false);
    expect(plan.reason).toMatch(/went out, not in/);
  });

  it('does not credit venmo, check or ach either', () => {
    for (const method of ['venmo', 'check', 'ach', 'other', null]) {
      expect(planAccountCredit({ ...base, method }).credit, `${method} must not credit`).toBe(false);
    }
  });
});

describe('crediting twice is the real risk', () => {
  // The mark-paid route can be called repeatedly — the office updates an external reference on a
  // row that is already paid. Crediting each time inflates the balance by the payout amount, and
  // nothing about the number looks wrong: it is just too big.
  const credited: BalanceTransaction[] = [
    { reference_type: 'payout_batch_item', reference_id: 'item-1', amount: 190 },
  ];

  it('refuses a second credit for the same payout', () => {
    const plan = planAccountCredit({ ...base, existingTransactions: credited });
    expect(plan.credit).toBe(false);
    expect(plan.reason).toMatch(/Already credited/);
  });

  it('still credits a DIFFERENT payout to the same person', () => {
    // The key is the item, not the person — otherwise the first payout would block every later one.
    const plan = planAccountCredit({ ...base, payoutItemId: 'item-2', existingTransactions: credited });
    expect(plan.credit).toBe(true);
  });

  it('is keyed on the item, not the batch', () => {
    // A per-batch key would credit the first person in a batch and consider everybody else done.
    expect(alreadyCredited(credited, 'item-1')).toBe(true);
    expect(alreadyCredited(credited, 'item-2')).toBe(false);
  });

  it('ignores unrelated ledger rows', () => {
    const other: BalanceTransaction[] = [
      { reference_type: 'payroll_run', reference_id: 'item-1', amount: 500 },
      { reference_type: 'withdrawal', reference_id: 'item-1', amount: -100 },
    ];
    // Same id, different kind of row. Matching on the id alone would block a legitimate credit.
    expect(alreadyCredited(other, 'item-1')).toBe(false);
  });
});

describe('bad input credits nothing rather than something wrong', () => {
  it('refuses a zero or negative amount', () => {
    expect(planAccountCredit({ ...base, amountCents: 0 }).credit).toBe(false);
    expect(planAccountCredit({ ...base, amountCents: -500 }).credit).toBe(false);
  });

  it('refuses a NaN amount rather than producing a NaN balance', () => {
    const plan = planAccountCredit({ ...base, amountCents: Number.NaN });
    expect(plan.credit).toBe(false);
    expect(plan.balanceAfter).toBe(50);
  });

  it('always says why nothing was credited', () => {
    // Silence here is how somebody spends an afternoon working out why a balance did not move.
    for (const bad of [{ method: 'cash' }, { amountCents: 0 }, { existingTransactions: [{ reference_type: 'payout_batch_item', reference_id: 'item-1', amount: 1 }] }]) {
      const plan = planAccountCredit({ ...base, ...bad } as Parameters<typeof planAccountCredit>[0]);
      expect(plan.credit).toBe(false);
      expect(plan.reason, JSON.stringify(bad)).toBeTruthy();
    }
  });
});
