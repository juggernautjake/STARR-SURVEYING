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

export const runtime = 'nodejs';

/** Fields a person may set from this screen. Everything else on the row is set by machinery —
 *  balances by the reader, card details by the SetupIntent flow, `last_topup_at` by the charge. */
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

  // No secret ever leaves this route. `credential_env_var` is the NAME of an environment variable,
  // never its value — the value lives in the secret store and is not readable from here by design.
  return NextResponse.json({ accounts: data ?? [] });
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
