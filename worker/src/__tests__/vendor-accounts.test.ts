// Account balances, and the difference between reading one and working one out (plan S-8).
//
// The assertions worth reading here are the ones about REFUSING to charge. Auto top-up is the only
// part of this platform that moves the owner's money without a human in the loop, and every failure
// mode it has is quiet: an overspend looks like a successful charge, a mis-read balance looks like a
// threshold breach, and a retry storm looks like enthusiasm.
//
// So the rule is the reverse of the document-purchase rule. There, an uncertain skip omits a
// document invisibly, so uncertainty means SPEND. Here, an uncertain charge is real money moved on a
// guess, so uncertainty means STOP AND SAY WHY. These tests pin that inversion, because the two
// rules sit two files apart and reading one after the other invites "making them consistent".

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CONFIRMATION_STALE_AFTER_HOURS,
  decideTopup,
  describeBalance,
  isConfirmationFresh,
  reconcile,
  type VendorAccount,
} from '../services/vendor-accounts.js';

const NOW = new Date('2026-08-03T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function account(over: Partial<VendorAccount> = {}): VendorAccount {
  return {
    vendorId: 'texasfile',
    displayName: 'TexasFile',
    accountStatus: 'active',
    accountIdentifier: 'starr-surveying',
    credentialEnvVar: 'TEXASFILE_PASSWORD',
    accountVerifiedAt: hoursAgo(1),
    balanceUsd: 10,
    currency: 'USD',
    balanceSource: 'confirmed',
    balanceCheckedAt: hoursAgo(1),
    autoTopupEnabled: true,
    lowWaterUsd: 25,
    topupToUsd: 100,
    monthlyCeilingUsd: 300,
    minTopupIntervalMins: 60,
    lastTopupAt: null,
    coveredFips: [],
    statewide: true,
    cardLast4: '4242',
    ...over,
  };
}

const ctx = (over: Partial<{ chargedThisMonthUsd: number; hasUnsettledTopup: boolean }> = {}) => ({
  now: NOW,
  chargedThisMonthUsd: 0,
  ...over,
});

describe('an inferred balance is not a reading', () => {
  it('tops up on a fresh confirmed balance below the threshold', () => {
    const d = decideTopup(account(), ctx());
    expect(d.topUp).toBe(true);
    expect(d.amountUsd).toBe(90);          // 100 target - 10 held
  });

  it('refuses to charge a card on an inferred balance', () => {
    // Same number, same threshold — the only difference is how we know it, and that is enough.
    const d = decideTopup(account({ balanceSource: 'inferred', balanceCheckedAt: null }), ctx());
    expect(d.topUp).toBe(false);
    expect(d.blocked).toBe(true);
    expect(d.reason).toContain('inferred from our ledger');
    expect(d.reason).toContain('Refusing to charge a card on an estimate');
  });

  it('refuses on a confirmed balance that has gone stale', () => {
    const d = decideTopup(account({ balanceCheckedAt: hoursAgo(CONFIRMATION_STALE_AFTER_HOURS + 1) }), ctx());
    expect(d.topUp).toBe(false);
    expect(d.blocked).toBe(true);
    expect(d.reason).toContain('confirmed too long ago to trust');
  });

  it('treats an unknown balance as unknown, not as zero', () => {
    // A zero would be BELOW the threshold and would trigger a charge — the exact wrong reading.
    const d = decideTopup(account({ balanceUsd: null, balanceSource: 'unknown', balanceCheckedAt: null }), ctx());
    expect(d.topUp).toBe(false);
    expect(d.blocked).toBe(true);
    expect(d.reason).toContain('balance is unknown');
  });

  it('knows when a confirmation is fresh', () => {
    expect(isConfirmationFresh(account(), NOW)).toBe(true);
    expect(isConfirmationFresh(account({ balanceCheckedAt: hoursAgo(48) }), NOW)).toBe(false);
    expect(isConfirmationFresh(account({ balanceSource: 'inferred' }), NOW)).toBe(false);
  });
});

describe('the guard rails refuse rather than improvise', () => {
  it('does nothing at all when auto top-up is off', () => {
    const d = decideTopup(account({ autoTopupEnabled: false }), ctx());
    expect(d.topUp).toBe(false);
    expect(d.blocked).toBe(false);        // not a problem — the default, and correct
  });

  it('refuses when the limits are not all set', () => {
    const d = decideTopup(account({ monthlyCeilingUsd: null }), ctx());
    expect(d.topUp).toBe(false);
    expect(d.blocked).toBe(true);
    expect(d.reason).toContain('limits are not all set');
  });

  it('stops at the monthly ceiling instead of charging a reduced amount', () => {
    // A partial top-up would leave the balance below its own threshold and trigger the same decision
    // next run — a loop that bills every time round.
    const d = decideTopup(account(), ctx({ chargedThisMonthUsd: 280 }));
    expect(d.topUp).toBe(false);
    expect(d.blocked).toBe(true);
    expect(d.reason).toContain('over the $300.00 ceiling');
    expect(d.reason).toContain('Stopping and asking');
  });

  it('refuses a second top-up inside the minimum interval', () => {
    const d = decideTopup(account({ lastTopupAt: hoursAgo(0.25) }), ctx());
    expect(d.topUp).toBe(false);
    expect(d.blocked).toBe(true);
    expect(d.reason).toContain('something is wrong; refusing the second');
  });

  it('allows one once the interval has passed', () => {
    expect(decideTopup(account({ lastTopupAt: hoursAgo(3) }), ctx()).topUp).toBe(true);
  });

  it('refuses while a previous charge is unsettled — it may have landed', () => {
    const d = decideTopup(account(), ctx({ hasUnsettledTopup: true }));
    expect(d.topUp).toBe(false);
    expect(d.blocked).toBe(true);
    expect(d.reason).toContain('may have succeeded');
  });

  it('refuses to fund an account we cannot spend from', () => {
    const d = decideTopup(account({ accountStatus: 'suspended' }), ctx());
    expect(d.topUp).toBe(false);
    expect(d.blocked).toBe(true);
  });

  it('refuses with no card on file', () => {
    expect(decideTopup(account({ cardLast4: null }), ctx()).blocked).toBe(true);
  });

  it('does nothing when the balance is healthy', () => {
    const d = decideTopup(account({ balanceUsd: 80 }), ctx());
    expect(d.topUp).toBe(false);
    expect(d.blocked).toBe(false);
    expect(d.reason).toContain('above the $25.00 threshold');
  });
});

describe('no balance is stated without saying how well it is known', () => {
  it('marks a confirmed balance as confirmed', () => {
    expect(describeBalance(account(), NOW)).toContain('CONFIRMED from the vendor');
  });

  it('marks an inferred balance as an estimate', () => {
    const s = describeBalance(account({ balanceSource: 'inferred', balanceCheckedAt: null }), NOW);
    expect(s).toContain('INFERRED');
    expect(s).toContain('Treat as an estimate');
  });

  it('says a stale confirmation is stale', () => {
    expect(describeBalance(account({ balanceCheckedAt: hoursAgo(72) }), NOW)).toContain('STALE');
  });

  it('never renders an unknown balance as $0.00', () => {
    const s = describeBalance(account({ balanceUsd: null, balanceSource: 'unknown', balanceCheckedAt: null }), NOW);
    expect(s).toContain('UNKNOWN');
    expect(s).toContain('Not zero');
    expect(s).not.toContain('$0.00');
  });

  it('distinguishes "no account" from "an account with no money"', () => {
    const s = describeBalance(account({ accountStatus: 'none' }), NOW);
    expect(s).toContain('no account');
    expect(s).toContain('not a balance of $0.00');
  });
});

describe('a divergence is a question, not a rounding error', () => {
  it('is silent when the vendor agrees with the ledger', () => {
    expect(reconcile('texasfile', 90, 100, 10)).toBeNull();
  });

  it('reports when the vendor took more than we recorded', () => {
    const d = reconcile('texasfile', 85, 100, 10);
    expect(d).not.toBeNull();
    expect(d!.differenceUsd).toBe(-5);
    expect(d!.statement).toContain('took $5.00 MORE than our ledger accounts for');
    expect(d!.statement).toContain('Reported, not corrected');
  });

  it('reports the other direction too', () => {
    const d = reconcile('texasfile', 95, 100, 10);
    expect(d!.differenceUsd).toBe(5);
    expect(d!.statement).toContain('our ledger accounts for $5.00 MORE');
  });

  it('tolerates sub-cent noise', () => {
    expect(reconcile('texasfile', 90.004, 100, 10)).toBeNull();
  });
});

describe('the schema says what the module assumes', () => {
  const seed = fs.readFileSync(
    path.join(process.cwd(), '../seeds/569_vendor_accounts.sql'),
    'utf8',
  );

  it('keeps the balance nullable, so unknown cannot be stored as zero', () => {
    // A `balance_usd DECIMAL(10,2) NOT NULL DEFAULT 0` would make every new account look drained.
    expect(seed).not.toMatch(/balance_usd\s+DECIMAL\([^)]*\)\s+NOT NULL/i);
  });

  it('records HOW the balance was learnt', () => {
    expect(seed).toMatch(/balance_source\s+TEXT NOT NULL/i);
    expect(seed).toContain("CHECK (balance_source IN ('confirmed','inferred','unknown'))");
  });

  it('will not let a confirmed balance be null, or an unknown one carry a number', () => {
    expect(seed).toContain('vendor_accounts_balance_coherent');
  });

  it('refuses to enable auto top-up without all three limits', () => {
    expect(seed).toContain('vendor_accounts_topup_needs_limits');
  });

  it('refuses a top-up target below its own trigger — that is a billable loop', () => {
    expect(seed).toContain('vendor_accounts_topup_target_above_trigger');
  });

  it('defaults auto top-up to OFF, so creating a row cannot charge a card', () => {
    expect(seed).toMatch(/auto_topup_enabled\s+BOOLEAN NOT NULL DEFAULT FALSE/i);
  });

  it('stores a card token and four digits, never a card number', () => {
    expect(seed).toContain('stripe_payment_method_id');
    expect(seed).toContain('card_last4');
    expect(seed).not.toMatch(/card_number|pan\s+TEXT|cvv|cvc/i);
  });

  it('stores the NAME of the env var holding a secret, never the secret', () => {
    expect(seed).toContain('credential_env_var');
    expect(seed).not.toMatch(/\bpassword\s+TEXT\b|\bapi_key\s+TEXT\b/i);
  });

  it('allows only one account row per vendor', () => {
    // Two rows for one vendor means one run reads a stale balance while another writes a fresh one.
    expect(seed).toContain('idx_vendor_accounts_vendor');
    expect(seed).toMatch(/CREATE UNIQUE INDEX[\s\S]*?idx_vendor_accounts_vendor/i);
  });

  it('can find a charge that was attempted but never settled', () => {
    expect(seed).toContain('idx_vendor_topups_unsettled');
  });
});
