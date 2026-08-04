// app/api/admin/research/vendor-accounts/route.ts — where the owner sets the top-up limits.
//
// S-9 has been "blocked on the owner: amounts, ceiling" since the slice list was written. Some of
// that is a real decision. Part of it was self-inflicted: `research_vendor_accounts` shipped with
// its schema, its constraints, its service and its tests, and **nowhere to enter the numbers**. A
// blocker with no form behind it stays a blocker regardless of what the owner decides.
//
// So this is the form. It does not charge anything and cannot: the card flow (SetupIntent) and the
// charge execution are still the genuinely-blocked half of S-9. What it does is let the three
// numbers exist, which is what `decideTopup()` refuses to act without.
//
// ── WHAT THIS ROUTE WILL NOT ACCEPT ─────────────────────────────────────────────────────────────
//
// The database already refuses `auto_topup_enabled = TRUE` without all three limits, and refuses a
// target at or below its own trigger. Those constraints are the authority and are not duplicated
// here as logic — but a CHECK violation reaches a user as an opaque Postgres string, so the same
// conditions are named in plain language BEFORE the write. The database is what makes it true; this
// is what makes it legible.
//
// Nothing here touches a card number. `card_last4` and the Stripe payment-method id are set by the
// SetupIntent flow when it exists; a PATCH that tries to set them is rejected rather than ignored,
// because silently dropping a field a caller believed it set is how a card ends up half-configured.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
// The POLICY module, deliberately — not `vendor-accounts.ts`, which re-exports these but also
// reaches `pipeline.js` for a database handle and would drag the entire worker (Playwright adapters,
// clerk scrapers, AI extractors) into this route's bundle. That import failed the production build
// while `tsc` and the worker suite stayed green, which is why this line names the narrower file.
import {
  decideTopup,
  describeBalance,
  toVendorAccount,
  summariseTopups,
  type TopupRow,
} from '@/worker/src/services/vendor-accounts-policy';

export const runtime = 'nodejs';

/** Fields a person may set from this screen. Everything else on the row is set by machinery.
 *
 *  ⚠ **Two of those machines do not exist yet** (measured 2026-08-04, S-9e), and this comment used to
 *  describe all three as though they did:
 *
 *    · `card_last4` / `stripe_*` — set by the SetupIntent flow. **Not built** (S-9, owner-gated).
 *    · `last_topup_at` — set by the charge. **Not built** (same).
 *    · `balance_usd` / `balance_source` / `balance_checked_at` — "written by the balance reader".
 *      **There is no balance reader.** Nothing in this repo writes a vendor balance: the only
 *      `balance_usd` writers are in the Stripe webhook, against a different table keyed by
 *      `user_email`.
 *
 *  These fields are still rejected rather than accepted, and that is still right — a balance is a
 *  reading or an inference, never a typed-in figure. But the reason is now "nothing writes this yet",
 *  not "something else owns it", and those are different facts for whoever reads this next. */
const EDITABLE = [
  'account_status', 'account_identifier', 'credential_env_var',
  'auto_topup_enabled', 'low_water_usd', 'topup_to_usd', 'monthly_ceiling_usd',
  'min_topup_interval_mins',
] as const;

/** Fields a caller might plausibly try to set, and must not. Rejected loudly rather than stripped. */
const FORBIDDEN = [
  'card_last4', 'stripe_payment_method_id', 'stripe_customer_id',
  'balance_usd', 'balance_source', 'balance_checked_at', 'last_topup_at',
];

interface PatchBody {
  vendor_id?: string;
  [k: string]: unknown;
}

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('research_vendor_accounts')
    .select('*')
    .order('vendor_id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // S-9c — the top-up ledger, which S-9b's dry run declared and never read.
  //
  // A failed read is NOT treated as "no top-ups". `chargedThisMonthUsd: 0` from an unreadable ledger
  // is indistinguishable from a genuinely quiet month, and it silently disables the monthly ceiling
  // — the one rail whose failure is unbounded. When this query fails the dry run says so and every
  // decision is reported as blocked, the same direction `decideTopup` itself fails in.
  const { data: topupRows, error: topupError } = await supabaseAdmin
    .from('research_vendor_topups')
    .select('vendor_id, amount_usd, status, attempted_at')
    .order('attempted_at', { ascending: false });

  // S-9b — what auto top-up WOULD do right now, per account, charging nothing.
  //
  // `decideTopup()` shipped with every guard rail the spec asked for — ceiling, minimum interval,
  // refusal on an inferred or stale balance — and **no production caller**. The only mention of it
  // outside its own module and tests was the comment at the top of this file, describing behaviour
  // this route did not have. That is the authored-but-not-wired defect with a comment on top of it.
  //
  // It cannot be wired to an actual charge yet: the SetupIntent and the off-session PaymentIntent
  // are the genuinely owner-blocked half of S-9. But the DECISION is not blocked, and surfacing it
  // is what turns "amounts, ceiling — owner decides" from an abstract question into a concrete one:
  // the owner sees exactly what would be charged, and exactly which accounts are refusing to act and
  // why. A dry run is also the only honest way to test a payment loop before it can spend money.
  //
  // S-9c — the month-to-date figure and the unsettled flag now come from the ledger rather than
  // being hardcoded to 0 and omitted. Both are per-vendor: a ceiling summed across vendors would
  // let one account's spending block another's, and `hasUnsettledTopup` means "THIS vendor has a
  // charge whose outcome we do not know".
  const now = new Date();
  const ledgerReadable = !topupError;
  const rowsByVendor = new Map<string, TopupRow[]>();
  for (const r of (topupRows ?? []) as (TopupRow & { vendor_id: string })[]) {
    const list = rowsByVendor.get(r.vendor_id) ?? [];
    list.push(r);
    rowsByVendor.set(r.vendor_id, list);
  }

  type AccountRow = Parameters<typeof toVendorAccount>[0];
  const decisions = (data ?? []).map((row: AccountRow) => {
    const account = toVendorAccount(row);
    const ledger = summariseTopups(rowsByVendor.get(account.vendorId) ?? [], now);
    const decision = ledgerReadable
      ? decideTopup(account, { now, ...ledger })
      : {
          topUp: false,
          amountUsd: null,
          blocked: true,
          reason:
            `${account.vendorId}: the top-up ledger could not be read, so month-to-date spend and ` +
            `any unsettled charge are unknown. Refusing to decide rather than assuming $0 spent.`,
        };
    return {
      vendorId: account.vendorId,
      balance: describeBalance(account, now),
      wouldTopUp: decision.topUp,
      amountUsd: decision.amountUsd,
      reason: decision.reason,
      blocked: decision.blocked,
    };
  });

  // No secret ever leaves this route. `credential_env_var` is the NAME of an environment variable,
  // never its value — the value lives in the secret store and is not readable from here by design.
  return NextResponse.json({
    accounts: data ?? [],
    topupDryRun: {
      decisions,
      chargesNothing: true,
      // S-9c — no longer a fixed `false`. The ceiling is now tested against the real ledger, and
      // when the ledger cannot be read the dry run says the figure is unknown instead of quietly
      // reporting a decision made against an assumed $0.
      monthToDateKnown: ledgerReadable,
      note: ledgerReadable
        ? 'What auto top-up would decide right now, against the real top-up ledger. Nothing is ' +
          'charged — the card flow is not built. Month-to-date spend counts succeeded and ' +
          'attempted charges; an attempted charge of unknown outcome counts toward the ceiling ' +
          'because over-counting refuses a charge while under-counting permits a second one.'
        : 'The top-up ledger could not be read, so every decision below is reported as blocked. ' +
          'Month-to-date spend is UNKNOWN, not $0 — treating it as $0 would disable the monthly ' +
          'ceiling exactly when the data behind it is missing.',
    },
  });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as PatchBody;
  const vendorId = body.vendor_id;
  if (!vendorId) return NextResponse.json({ error: 'vendor_id is required.' }, { status: 400 });

  const offending = FORBIDDEN.filter((f) => f in body);
  if (offending.length > 0) {
    return NextResponse.json({
      error:
        `${offending.join(', ')} cannot be set from this screen. Balances are written by the balance ` +
        `reader and card details by the card-on-file flow; setting them by hand would make the row ` +
        `claim something nobody checked.`,
    }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const f of EDITABLE) if (f in body) patch[f] = body[f];
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  // Read the current row so the limits can be checked as they WILL BE after the patch, not as the
  // patch alone describes them. Enabling auto top-up in one request while the limits were set in a
  // previous one is the ordinary way a person fills in a form.
  const { data: current, error: readErr } = await supabaseAdmin
    .from('research_vendor_accounts')
    .select('*')
    .eq('vendor_id', vendorId)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!current) {
    return NextResponse.json({ error: `No vendor account row for '${vendorId}'.` }, { status: 404 });
  }

  const after = { ...(current as Record<string, unknown>), ...patch };
  const num = (k: string) => (after[k] == null ? null : Number(after[k]));
  const low = num('low_water_usd');
  const target = num('topup_to_usd');
  const ceiling = num('monthly_ceiling_usd');

  if (after.auto_topup_enabled === true && (low === null || target === null || ceiling === null)) {
    const missing = [
      low === null ? 'a low-water threshold' : null,
      target === null ? 'a top-up target' : null,
      ceiling === null ? 'a monthly ceiling' : null,
    ].filter(Boolean);
    return NextResponse.json({
      error:
        `Auto top-up cannot be switched on without ${missing.join(', ')}. Without all three there is ` +
        `no answer to when to charge, how much, or when to stop.`,
    }, { status: 400 });
  }

  if (low !== null && target !== null && target <= low) {
    return NextResponse.json({
      error:
        `The top-up target ($${target.toFixed(2)}) must be above the low-water threshold ` +
        `($${low.toFixed(2)}). A target at or below the trigger would top up to a balance that ` +
        `immediately triggers another top-up.`,
    }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('research_vendor_accounts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('vendor_id', vendorId)
    .select('*')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ account: data });
});
