// worker/src/__tests__/topup-ledger-summary.test.ts
//
// S-9c — the two facts `decideTopup` asks the ledger for, and which statuses feed them.
//
// `TopupContext` has always required `chargedThisMonthUsd` and `hasUnsettledTopup`. Nothing read
// them: S-9b's dry run passed `0` and omitted the second, so the **monthly ceiling** and the
// **crash-mid-charge guard** — two of the three rails S-4 specifies — were declared and never
// exercised. A guard rail nothing feeds is decoration.
//
// The status rules are the part most likely to be got wrong later, because each is defensible in
// isolation and only the asymmetry is correct. They are asserted individually so a change has to
// argue with a named test rather than with a comment.

import { describe, it, expect } from 'vitest';
import { summariseTopups, decideTopup, type TopupRow, type VendorAccount } from '../services/vendor-accounts-policy.js';

const NOW = new Date('2026-08-04T12:00:00Z');
const row = (over: Partial<TopupRow> = {}): TopupRow => ({
  amount_usd: 100,
  status: 'succeeded',
  attempted_at: '2026-08-02T09:00:00Z',
  ...over,
});

describe('summariseTopups — what counts toward the ceiling', () => {
  it('counts a succeeded charge', () => {
    expect(summariseTopups([row()], NOW).chargedThisMonthUsd).toBe(100);
  });

  it('counts an ATTEMPTED charge, because we do not know whether it landed', () => {
    // The asymmetry that matters. Over-counting refuses a charge that might have been fine;
    // under-counting permits a SECOND charge on top of one that already went through. The first is
    // an inconvenience, the second is the runaway loop the ceiling exists to stop.
    expect(summariseTopups([row({ status: 'attempted' })], NOW).chargedThisMonthUsd).toBe(100);
  });

  it('does NOT count a failed charge', () => {
    // The vendor said no; nothing left the card. Counting declines would let one outage exhaust a
    // budget that was never spent and turn it into a month of refusals.
    expect(summariseTopups([row({ status: 'failed' })], NOW).chargedThisMonthUsd).toBe(0);
  });

  it('does NOT count a refunded charge', () => {
    // The money came back, so net spend is zero — and a refund is a deliberate act by a person,
    // not an ambiguous machine state. Counting it would let a correctly-reversed charge keep
    // blocking the account it was reversed on.
    expect(summariseTopups([row({ status: 'refunded' })], NOW).chargedThisMonthUsd).toBe(0);
  });

  it('ignores charges from a previous month', () => {
    expect(summariseTopups([row({ attempted_at: '2026-07-31T23:59:00Z' })], NOW).chargedThisMonthUsd).toBe(0);
  });

  it('includes a charge from the first instant of this month', () => {
    // The boundary in the direction that matters: excluding it would silently reset the ceiling a
    // day late every month.
    expect(summariseTopups([row({ attempted_at: '2026-08-01T00:00:00Z' })], NOW).chargedThisMonthUsd).toBe(100);
  });

  it('sums to two decimals rather than accumulating float error', () => {
    const rows = [row({ amount_usd: 0.1 }), row({ amount_usd: 0.2 })];
    expect(summariseTopups(rows, NOW).chargedThisMonthUsd).toBe(0.3);
  });

  it('reads a decimal that arrives as a string, which is how the driver returns NUMERIC', () => {
    expect(summariseTopups([row({ amount_usd: '75.50' })], NOW).chargedThisMonthUsd).toBe(75.5);
  });

  it('survives an unparseable timestamp instead of counting it as now', () => {
    expect(summariseTopups([row({ attempted_at: 'not a date' })], NOW).chargedThisMonthUsd).toBe(0);
  });
});

describe('summariseTopups — the unsettled flag', () => {
  it('is false when every row settled', () => {
    expect(summariseTopups([row(), row({ status: 'failed' })], NOW).hasUnsettledTopup).toBe(false);
  });

  it('is true for a row still at attempted', () => {
    expect(summariseTopups([row({ status: 'attempted' })], NOW).hasUnsettledTopup).toBe(true);
  });

  it('is STILL true for an ancient attempted row', () => {
    // Deliberately not aged out. The seed calls a long-stale `attempted` row "the crash-mid-charge
    // case, and it is meant to be visible" — an unresolved charge is exactly when a person should
    // look before the machine charges again. Ageing them out restores the double-spend this rail
    // was written to prevent.
    const ancient = row({ status: 'attempted', attempted_at: '2025-01-01T00:00:00Z' });
    expect(summariseTopups([ancient], NOW).hasUnsettledTopup).toBe(true);
  });

  it('is false for an empty ledger', () => {
    expect(summariseTopups([], NOW)).toEqual({ chargedThisMonthUsd: 0, hasUnsettledTopup: false });
  });
});

describe('the summary actually drives decideTopup', () => {
  const account = (): VendorAccount => ({
    vendorId: 'texasfile', displayName: 'TexasFile', accountStatus: 'active',
    accountIdentifier: null, credentialEnvVar: null, accountVerifiedAt: null,
    balanceUsd: 10, currency: 'USD', balanceSource: 'confirmed',
    balanceCheckedAt: NOW.toISOString(),
    autoTopupEnabled: true, lowWaterUsd: 25, topupToUsd: 100, monthlyCeilingUsd: 200,
    // `cardLast4` must be set: `decideTopup` refuses outright with "no card on file", which is a
    // fourth guard rail beyond the three S-4 names. The first version of this fixture left it null
    // and the refusal was mistaken for a ceiling result — the code was right and the test was wrong.
    minTopupIntervalMins: 60, lastTopupAt: null, coveredFips: [], statewide: true, cardLast4: '4242',
  });

  it('tops up when the ledger is quiet', () => {
    const d = decideTopup(account(), { now: NOW, ...summariseTopups([], NOW) });
    expect(d.topUp).toBe(true);
  });

  it('refuses once the month-to-date total would breach the ceiling', () => {
    // $150 already charged + $90 to reach the $100 target = $240 against a $200 ceiling.
    const rows = [row({ amount_usd: 150 })];
    const d = decideTopup(account(), { now: NOW, ...summariseTopups(rows, NOW) });
    expect(d.topUp).toBe(false);
    expect(d.reason).toMatch(/ceiling/i);
  });

  it('refuses while a charge of unknown outcome is outstanding', () => {
    const rows = [row({ status: 'attempted', amount_usd: 1 })];
    const d = decideTopup(account(), { now: NOW, ...summariseTopups(rows, NOW) });
    expect(d.topUp).toBe(false);
    expect(d.blocked, 'an unresolved charge is a refusal to decide, not an all-clear').toBe(true);
  });
});
