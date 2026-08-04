// Somewhere to enter the numbers S-9 is blocked on.
//
// S-9 has read "blocked on the owner: amounts, ceiling" since the slice list was written. Part of
// that was a real decision and part of it was self-inflicted: `research_vendor_accounts` shipped
// with a schema, database CHECK constraints, a service, and tests — and **no route and no screen**.
// The owner had nowhere to put the three numbers, so the blocker would have survived the decision.
//
// These are source-level assertions. Driving the real path needs Supabase and a session; what is
// pinned here is the set of choices that are easy to undo by accident, and every one of them is
// about money moving.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dryRunTone, type DryRunDecision } from '@/app/admin/research/components/VendorAccountsPanel';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const route = read('app/api/admin/research/vendor-accounts/route.ts');
const panel = read('app/admin/research/components/VendorAccountsPanel.tsx');
const billing = read('app/admin/research/billing/page.tsx');

describe('no screen in this app can set a card number', () => {
  it('rejects card and Stripe fields rather than stripping them', () => {
    // Silently dropping a field the caller believed it set is how a card ends up half-configured —
    // the UI says saved, the row says no card, and the next top-up fails for a reason nobody sees.
    expect(route).toContain("'card_last4', 'stripe_payment_method_id', 'stripe_customer_id'");
    expect(route).toContain('cannot be set from this screen');
  });

  it('refuses hand-written balances too', () => {
    // A balance is a reading or an inference, never a typed-in figure — `describeBalance` exists to
    // keep the provenance attached, and a hand-set number has none.
    expect(route).toMatch(/'balance_usd', 'balance_source', 'balance_checked_at'/);
  });

  it('only allows the fields a person is meant to decide', () => {
    expect(route).toContain("'auto_topup_enabled', 'low_water_usd', 'topup_to_usd', 'monthly_ceiling_usd'");
  });

  it('never returns a secret — only the NAME of the variable holding one', () => {
    expect(route).toContain('never its value');
    expect(panel).toContain('credential_env_var');
    expect(panel).toContain('never a secret');
  });
});

describe('the three-number rule is enforced where a person can read it', () => {
  it('refuses to enable auto top-up without all three limits', () => {
    // The database CHECK is the authority; this exists because a CHECK violation reaches a user as
    // an opaque Postgres string.
    expect(route).toContain('Auto top-up cannot be switched on without');
    expect(route).toContain('no answer to when to charge, how much, or when to stop');
  });

  it('refuses a target at or below its own trigger', () => {
    expect(route).toContain('must be above the low-water threshold');
    expect(route).toContain('immediately triggers another top-up');
  });

  it('checks the row as it WILL BE, not as the patch alone describes it', () => {
    // Enabling the toggle in one request after setting limits in another is the ordinary way a
    // person fills in a form; validating the patch in isolation would reject it.
    expect(route).toMatch(/const after = \{ \.\.\.\(current as Record<string, unknown>\), \.\.\.patch \}/);
  });
});

describe('an empty field stays unset rather than becoming zero', () => {
  it('sends null for a blank limit', () => {
    // An unset ceiling and a ceiling of $0 are different instructions: zero would forbid every
    // top-up while the row looked fully configured.
    expect(panel).toContain("draft.monthly_ceiling_usd === '' ? null : Number(draft.monthly_ceiling_usd)");
    expect(panel).toContain('different instructions');
  });
});

describe('a balance is never shown as a bare number', () => {
  it('says UNKNOWN rather than showing zero', () => {
    expect(panel).toContain('Balance UNKNOWN');
    expect(panel).toContain('Not zero');
  });

  it('marks an inferred balance as an estimate', () => {
    expect(panel).toContain('INFERRED from our own purchase ledger');
  });

  it('distinguishes "no account" from "no money"', () => {
    expect(panel).toContain('this is not a balance of $0.00');
  });

  it('says when auto top-up is on but no card can be charged', () => {
    // Otherwise the row reads as configured and idle, and the failure only surfaces mid-run.
    expect(panel).toContain('NO CARD ON FILE');
  });

  it('distinguishes "off with limits set" from "off and unconfigured"', () => {
    expect(panel).toContain('The limits are set; nothing will charge until it is switched on');
    expect(panel).toContain('is not configured to charge');
  });
});

describe('the panel is actually reachable', () => {
  it('is mounted on the research billing page', () => {
    expect(billing).toContain('import VendorAccountsPanel');
    expect(billing).toContain('<VendorAccountsPanel />');
  });

  it('sits above the purchase log, because it decides whether the NEXT purchase can happen', () => {
    const mount = billing.indexOf('<VendorAccountsPanel />');
    const log = billing.indexOf('No document purchases yet');
    expect(mount).toBeGreaterThan(-1);
    expect(log).toBeGreaterThan(-1);
    expect(mount).toBeLessThan(log);
  });

  it('the panel talks to the route', () => {
    expect(panel).toContain("'/api/admin/research/vendor-accounts'");
  });

  it('requires a session on both verbs', () => {
    expect(route.match(/if \(!session\?\.user\?\.email\)/g)?.length).toBe(2);
  });
});

// ── S-9d — the dry run reaches the screen ───────────────────────────────────────────────────────
//
// `decideTopup()` shipped with no caller (S-9b wired it into the route). The route then returned
// `topupDryRun` for two slices and **nothing rendered it** — the decision engine was wired to an API
// that answered into the void, which is the authored-but-not-wired defect one layer up from where
// this program usually finds it.
//
// The tone function is the risky part and is tested directly. A source-text check that the file
// contains the word "blocked" proves nothing about which branch produces it, and this is a screen
// about spending money.

describe('S-9d — what auto top-up would do, on screen', () => {
  const decision = (over: Partial<DryRunDecision> = {}): DryRunDecision => ({
    vendorId: 'texasfile',
    wouldTopUp: false,
    amountUsd: null,
    reason: 'above the threshold.',
    blocked: false,
    ...over,
  });

  it('separates "nothing to do" from "cannot tell"', () => {
    // The distinction the whole panel turns on. Collapsing `blocked` into "no" is what would make
    // this screen lie: a quiet row and an unreadable one look identical and mean opposite things.
    expect(dryRunTone(decision())).toBe('idle');
    expect(dryRunTone(decision({ blocked: true, reason: 'balance is unknown.' }))).toBe('blocked');
  });

  it('reports a pending charge as its own state, not as "idle"', () => {
    expect(dryRunTone(decision({ wouldTopUp: true, amountUsd: 90 }))).toBe('would-charge');
  });

  it('treats blocked as blocked even if something also set wouldTopUp', () => {
    // Defensive: `decideTopup` never returns both, but if a future change did, the safe reading is
    // the refusal. A screen that says "would charge $90" over a decision the engine refused to make
    // is worse than one that says nothing.
    expect(dryRunTone(decision({ wouldTopUp: true, amountUsd: 90, blocked: true }))).toBe('blocked');
  });

  it('the panel renders the dry run rather than deriving its own verdict', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', 'app/admin/research/components/VendorAccountsPanel.tsx'),
      'utf8',
    );
    expect(src).toContain('topupDryRun');
    expect(src).toContain('dryRunTone(');
    // A second opinion about spending money is how the two come to differ.
    expect(src, 'the panel is deciding for itself whether to top up').not.toMatch(/lowWaterUsd|low_water_usd\s*[<>]/);
  });

  it('says once, at the top, when the ledger could not be read', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', 'app/admin/research/components/VendorAccountsPanel.tsx'),
      'utf8',
    );
    // Otherwise eleven rows each say "blocked" and it reads as eleven configuration problems
    // instead of one missing table.
    expect(src).toMatch(/monthToDateKnown/);
  });
});
