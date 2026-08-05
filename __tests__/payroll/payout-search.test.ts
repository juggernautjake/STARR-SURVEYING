// __tests__/payroll/payout-search.test.ts
//
// "Track all payouts for everyone and find specific payouts."

import { describe, it, expect } from 'vitest';
import { filterPayouts } from '@/lib/payroll/payout-ledger';
import type { PayoutRecord } from '@/lib/payroll/payout-ledger';

const payout = (over: Partial<PayoutRecord> = {}): PayoutRecord => ({
  id: 'p1',
  user_email: 'jane@starr-surveying.com',
  user_name: 'Jane Doe',
  amount_cents: 19_000,
  hours_cents: 19_000,
  bonuses_cents: null,
  reimbursements_cents: null,
  adjustments_cents: null,
  method: 'check',
  reference: 'check 1041',
  status: 'paid',
  paid_at: '2026-08-01T00:00:00Z',
  period_start: null,
  period_end: null,
  notes: null,
  batch_id: 'b1',
  batch_label: 'Approved hours through 2026-08-01',
  batch_status: 'completed',
  created_at: '2026-08-01T00:00:00Z',
  ...over,
});

const LEDGER = [
  payout(),
  payout({ id: 'p2', user_email: 'hank@starr-surveying.com', user_name: 'Hank Maddux', method: 'venmo', reference: 'V-88231', amount_cents: 42_000 }),
  payout({ id: 'p3', user_name: 'Jane Doe', method: 'cash', reference: 'handed over at the office', amount_cents: 5_000, status: 'paid' }),
  payout({ id: 'p4', user_email: 'crew@starr-surveying.com', user_name: 'Sam Crew', method: 'ach', reference: 'TRACE-9911', amount_cents: 120_000, status: 'failed' }),
  // Its own reference, deliberately. The first draft of this fixture let p5 inherit the default
  // `check 1041`, and the "find it by check number" test then failed by returning BOTH — which was
  // the filter working correctly on a fixture that lied. Two payouts really carrying one cheque
  // number is a data problem worth surfacing, not a search to narrow.
  payout({ id: 'p5', user_email: 'crew@starr-surveying.com', user_name: 'Sam Crew', method: 'venmo', reference: 'V-11002', amount_cents: 8_000, status: 'pending', paid_at: null, batch_status: 'voided' }),
];

describe('finding one payout', () => {
  it('finds it by check number', () => {
    // The thing somebody actually does: a cheque comes back and they need the record.
    expect(filterPayouts(LEDGER, { text: '1041' }).map((p) => p.id)).toEqual(['p1']);
  });

  it('finds it by a Venmo reference', () => {
    expect(filterPayouts(LEDGER, { text: 'V-88231' }).map((p) => p.id)).toEqual(['p2']);
  });

  it('finds it by person', () => {
    expect(filterPayouts(LEDGER, { text: 'hank' }).map((p) => p.id)).toEqual(['p2']);
  });

  it('requires EVERY term, so two words narrow rather than widen', () => {
    // "jane check" must find Jane's cheque — not every payment to Jane plus every cheque to
    // anybody, which is what an OR would give and is useless on a ledger.
    expect(filterPayouts(LEDGER, { text: 'jane check' }).map((p) => p.id)).toEqual(['p1']);
  });

  it('is case-insensitive and ignores stray spacing', () => {
    expect(filterPayouts(LEDGER, { text: '  JANE   CHECK ' }).map((p) => p.id)).toEqual(['p1']);
  });

  it('searches the batch label too, so "how was that run paid" works', () => {
    expect(filterPayouts(LEDGER, { text: 'approved hours' }).length).toBe(LEDGER.length);
  });
});

describe('tracking everything', () => {
  it('an empty filter returns everything', () => {
    // "No criteria" means "show me all of them". A search page that opens blank because nothing was
    // typed is the absence-as-answer defect in miniature.
    expect(filterPayouts(LEDGER)).toHaveLength(LEDGER.length);
    expect(filterPayouts(LEDGER, {})).toHaveLength(LEDGER.length);
  });

  it('filters by method', () => {
    expect(filterPayouts(LEDGER, { method: 'venmo' }).map((p) => p.id)).toEqual(['p2', 'p5']);
  });

  it('filters by status, including the failures', () => {
    // A failed payment is information — somebody was not paid and still is owed.
    expect(filterPayouts(LEDGER, { status: 'failed' }).map((p) => p.id)).toEqual(['p4']);
  });

  it('filters by amount range', () => {
    expect(filterPayouts(LEDGER, { minCents: 10_000, maxCents: 50_000 }).map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('filters to one batch', () => {
    expect(filterPayouts(LEDGER, { batchId: 'b1' })).toHaveLength(LEDGER.length);
    expect(filterPayouts(LEDGER, { batchId: 'nope' })).toHaveLength(0);
  });

  it('combines filters', () => {
    expect(filterPayouts(LEDGER, { text: 'sam', method: 'venmo' }).map((p) => p.id)).toEqual(['p5']);
  });
});

describe('money that never reached anybody', () => {
  it('is visible by default, because a failed payment is a fact worth seeing', () => {
    const all = filterPayouts(LEDGER);
    expect(all.map((p) => p.id)).toContain('p4');   // failed
    expect(all.map((p) => p.id)).toContain('p5');   // voided batch
  });

  it('can be excluded when the question is "what have we actually committed"', () => {
    const committed = filterPayouts(LEDGER, { committedOnly: true }).map((p) => p.id);
    expect(committed).not.toContain('p4');   // failed item
    expect(committed).not.toContain('p5');   // voided batch
    expect(committed).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('nothing found is not the same as nothing there', () => {
  it('returns an empty list for a term that matches nothing', () => {
    // The caller distinguishes these; the filter's job is to not pretend.
    expect(filterPayouts(LEDGER, { text: 'zzzz' })).toEqual([]);
  });

  it('does not match a null field as though it were empty text', () => {
    // p5 has a null reference. Searching for a reference must not return it.
    const withNulls = [payout({ id: 'n1', reference: null, notes: null, user_name: null })];
    expect(filterPayouts(withNulls, { text: 'trace' })).toEqual([]);
  });
});
