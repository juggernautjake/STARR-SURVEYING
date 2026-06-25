// G3 / Phase 2.3 — source-lock for the bank reconciliation helpers.
import { describe, it, expect } from 'vitest';
import {
  dollarsToCents,
  parsePncCsv,
  scoreMatch,
  bestMatches,
  importFingerprint,
  type BankTxnInput,
  type ReconCandidate,
} from '@/lib/payments/bank-reconcile';

describe('bank-reconcile: dollarsToCents', () => {
  it('parses currency formats incl. parens/negatives', () => {
    expect(dollarsToCents('$1,234.56')).toBe(123456);
    expect(dollarsToCents('(50.00)')).toBe(-5000);
    expect(dollarsToCents('-12.5')).toBe(-1250);
    expect(dollarsToCents('+3')).toBe(300);
    expect(dollarsToCents('0.00')).toBe(0);
  });
  it('returns null for junk/empty', () => {
    expect(dollarsToCents('')).toBeNull();
    expect(dollarsToCents('  ')).toBeNull();
    expect(dollarsToCents('abc')).toBeNull();
    expect(dollarsToCents(null)).toBeNull();
  });
});

describe('bank-reconcile: parsePncCsv', () => {
  it('parses a single signed Amount column (MM/DD/YYYY dates)', () => {
    const csv = [
      'Date,Description,Amount',
      '01/15/2026,"VENMO PAYMENT, MARY",-400.00',
      '01/16/2026,DEPOSIT INV SS-260115,1500.00',
      'bad,row,here',
    ].join('\n');
    const rows = parsePncCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ posted_at: '2026-01-15', amount_cents: -40000, description: 'VENMO PAYMENT, MARY' });
    expect(rows[1]).toEqual({ posted_at: '2026-01-16', amount_cents: 150000, description: 'DEPOSIT INV SS-260115' });
  });
  it('parses separate Withdrawals/Deposits columns', () => {
    const csv = [
      'Posting Date,Description,Withdrawals,Deposits',
      '2026-02-01,Fuel Bucees,55.10,',
      '2026-02-02,Customer payment,,1200.00',
    ].join('\n');
    const rows = parsePncCsv(csv);
    expect(rows[0]).toEqual({ posted_at: '2026-02-01', amount_cents: -5510, description: 'Fuel Bucees' });
    expect(rows[1]).toEqual({ posted_at: '2026-02-02', amount_cents: 120000, description: 'Customer payment' });
  });
  it('returns [] for empty/header-only input', () => {
    expect(parsePncCsv('')).toEqual([]);
    expect(parsePncCsv('Date,Description,Amount')).toEqual([]);
  });
});

const cand = (kind: ReconCandidate['kind'], amount_cents: number, at: string, id = 'x'): ReconCandidate => ({
  kind,
  id,
  amount_cents,
  at,
  label: kind,
});

describe('bank-reconcile: scoreMatch', () => {
  const debit: BankTxnInput = { posted_at: '2026-01-15', amount_cents: -40000, description: 'venmo mary' };
  const credit: BankTxnInput = { posted_at: '2026-01-15', amount_cents: 150000, description: 'deposit' };

  it('debit matches a same-amount payout/expense within the window', () => {
    expect(scoreMatch(debit, cand('payout', 40000, '2026-01-15'))).toBe(1);
    expect(scoreMatch(debit, cand('expense', 40000, '2026-01-14'))).toBeGreaterThan(0);
  });
  it('credit matches a same-amount payment', () => {
    expect(scoreMatch(credit, cand('payment', 150000, '2026-01-15'))).toBe(1);
  });
  it('rejects wrong direction, wrong amount, and out-of-window dates', () => {
    expect(scoreMatch(debit, cand('payment', 40000, '2026-01-15'))).toBe(0); // wrong direction
    expect(scoreMatch(debit, cand('payout', 39999, '2026-01-15'))).toBe(0); // wrong amount
    expect(scoreMatch(debit, cand('payout', 40000, '2026-01-25'))).toBe(0); // 10 days out (>5)
  });
  it('closer dates score higher', () => {
    const near = scoreMatch(debit, cand('payout', 40000, '2026-01-15'));
    const far = scoreMatch(debit, cand('payout', 40000, '2026-01-19'));
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });
});

describe('bank-reconcile: bestMatches', () => {
  it('returns viable matches best-first', () => {
    const debit: BankTxnInput = { posted_at: '2026-01-15', amount_cents: -40000, description: 'venmo' };
    const ranked = bestMatches(debit, [
      cand('payout', 40000, '2026-01-18', 'p-far'),
      cand('payment', 40000, '2026-01-15', 'wrong-dir'),
      cand('expense', 40000, '2026-01-15', 'e-near'),
      cand('payout', 99999, '2026-01-15', 'wrong-amt'),
    ]);
    expect(ranked.map((m) => m.candidate.id)).toEqual(['e-near', 'p-far']);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });
});

describe('bank-reconcile: importFingerprint', () => {
  it('is stable across whitespace/case in the description', () => {
    const a = importFingerprint({ posted_at: '2026-01-15', amount_cents: -40000, description: '  VENMO   Mary ' });
    const b = importFingerprint({ posted_at: '2026-01-15', amount_cents: -40000, description: 'venmo mary' });
    expect(a).toBe(b);
  });
});
