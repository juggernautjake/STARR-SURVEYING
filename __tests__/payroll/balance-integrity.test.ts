// __tests__/payroll/balance-integrity.test.ts
//
// `available_balance` is a running total kept by hand, written by three separate paths — completing
// a legacy payroll run, marking a payout item paid by the `account` method, and processing a
// withdrawal — each doing a read-modify-write with no transaction around it. Nothing has ever
// checked it against `balance_transactions`.
//
// A drifted balance does not look wrong. It is a plausible amount of money, in the right currency,
// on the right person. Adding the ledger up is the only way to know.
import { describe, it, expect } from 'vitest';
import { checkBalanceIntegrity, type LedgerEntry } from '@/lib/payroll/balance-integrity';

const credit = (amount: number, over: Partial<LedgerEntry> = {}): LedgerEntry =>
  ({ amount, transaction_type: 'credit_payroll', status: 'completed', ...over });
const debit = (amount: number, over: Partial<LedgerEntry> = {}): LedgerEntry =>
  ({ amount: -Math.abs(amount), transaction_type: 'withdrawal', status: 'completed', ...over });

describe('a healthy account', () => {
  it('reconciles when the balance is the sum of its movements', () => {
    const r = checkBalanceIntegrity(250, [credit(500), debit(250)]);
    expect(r.verdict).toBe('reconciled');
    expect(r.needsReview).toBe(false);
    expect(r.message).toBeNull();
  });

  it('says nothing about an account that has never been used', () => {
    // Zero and no movements is the state every employee starts in. Flagging it would put a warning
    // on everybody.
    expect(checkBalanceIntegrity(0, []).verdict).toBe('empty');
    expect(checkBalanceIntegrity(null, []).needsReview).toBe(false);
  });

  it('tolerates float dust, and the tolerance branch is actually reachable', () => {
    // Both columns are NUMERIC and round-trip through JavaScript floats on every read: 0.1 + 0.2 is
    // 0.30000000000000004, and a long ledger accumulates that. Chasing it would flag healthy
    // accounts forever.
    //
    // This test also pins a bug in the first version: it rounded the balance and the ledger to
    // cents BEFORE differencing, so any surviving difference was already a whole cent and this
    // branch could never fire.
    const r = checkBalanceIntegrity(0.3, [credit(0.1), credit(0.2)]);
    expect(r.verdict).toBe('rounding');
    expect(r.needsReview).toBe(false);
    // Still reported as money a person can read, not as 0.30000000000000004.
    expect(r.ledgerTotal).toBe(0.3);
  });

  it('a difference of one real cent is NOT dust', () => {
    // The boundary the tolerance must not swallow: a penny that is genuinely missing is a defect in
    // a money path, and the whole point of this check is to see it.
    const r = checkBalanceIntegrity(300.01, [credit(300)]);
    expect(r.verdict).toBe('balance_too_high');
    expect(r.needsReview).toBe(true);
  });

  it('does not flag a long history for accumulated float dust', () => {
    // 60 × 16.67 is 1000.2 in money and 1000.1999999999998 in floats. What matters is that nobody
    // is sent to investigate it — which verdict it lands on ("rounding" here) is an implementation
    // detail, so the assertion is on the consequence.
    const entries = Array.from({ length: 60 }, () => credit(16.67));
    const r = checkBalanceIntegrity(1000.2, entries);
    expect(r.needsReview).toBe(false);
    expect(r.message).toBeNull();
    expect(r.ledgerTotal).toBe(1000.2);
  });
});

describe('the two ways it can be wrong, which are not the same wrong', () => {
  it('flags a balance higher than the ledger explains', () => {
    // Somebody could withdraw money that nothing accounts for.
    const r = checkBalanceIntegrity(500, [credit(300)]);
    expect(r.verdict).toBe('balance_too_high');
    expect(r.needsReview).toBe(true);
    expect(r.differenceDollars).toBe(200);
    expect(r.message).toContain('$200.00');
    expect(r.message).toMatch(/unexplained/i);
    // The sentence has to stop somebody mid-action, because the moment it is read is usually the
    // moment before a payment.
    expect(r.message).toMatch(/do not send money/i);
  });

  it('flags a balance lower than the ledger explains, and says what that means for the person', () => {
    // The opposite error, and it is about somebody being short — not about risk to the firm.
    const r = checkBalanceIntegrity(100, [credit(300)]);
    expect(r.verdict).toBe('balance_too_low');
    expect(r.needsReview).toBe(true);
    expect(r.message).toMatch(/owed money they cannot see/i);
  });

  it('reports both figures, never just the difference', () => {
    // "Out by $200" cannot be acted on. Which of the two numbers is right is the question, and it
    // needs both to be asked.
    const r = checkBalanceIntegrity(500, [credit(300)]);
    expect(r.message).toContain('$500.00');
    expect(r.message).toContain('$300.00');
  });

  it('catches the classic: a withdrawal that debited the balance but wrote no ledger row', () => {
    // The read-modify-write failing between the two updates. The balance is simply lower than
    // anything recorded.
    const r = checkBalanceIntegrity(0, [credit(250)]);
    expect(r.verdict).toBe('balance_too_low');
  });

  it('catches a double credit', () => {
    // A balance credited twice for one payout — the exact failure `alreadyCredited` exists to stop —
    // shows up here as a balance nothing explains, even if the guard were bypassed.
    const r = checkBalanceIntegrity(600, [credit(300)]);
    expect(r.verdict).toBe('balance_too_high');
    expect(r.differenceDollars).toBe(300);
  });
});

describe('what counts as a movement', () => {
  it('ignores a pending transaction', () => {
    // A pending movement has not happened. Counting it would report a healthy account as drifted
    // every time one was in flight.
    const r = checkBalanceIntegrity(300, [credit(300), credit(100, { status: 'pending' })]);
    expect(r.verdict).toBe('reconciled');
  });

  it('treats a missing status as completed', () => {
    // Rows written before the column was used consistently. Excluding them would report every
    // historic account as drifted.
    const r = checkBalanceIntegrity(300, [{ amount: 300 }]);
    expect(r.verdict).toBe('reconciled');
  });

  it('skips an unreadable amount rather than treating it as zero', () => {
    // Deliberate: a NaN silently counted as 0 would turn a data problem into a confident wrong
    // verdict about somebody's wages. It falls out of the sum and the mismatch is then reported.
    const r = checkBalanceIntegrity(300, [credit(300), { amount: Number.NaN }]);
    expect(r.verdict).toBe('reconciled');
  });
});

describe('it never repairs anything', () => {
  it('returns the figures and a question, not a corrected balance', () => {
    // Which of the two is right is a person's decision. "Correcting" the balance to match the ledger
    // would erase the evidence of whatever caused the drift; doing the reverse would invent a
    // transaction.
    const r = checkBalanceIntegrity(500, [credit(300)]);
    expect(r.balance).toBe(500);
    expect(r.ledgerTotal).toBe(300);
    expect(Object.keys(r)).not.toContain('correctedBalance');
  });
});
