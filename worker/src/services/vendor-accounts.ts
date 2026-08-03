// worker/src/services/vendor-accounts.ts — do we have an account, and how much is in it (plan S-8).
//
// Schema and the reasoning behind each column: seeds/569_vendor_accounts.sql.
//
// ── THE ONE IDEA THIS MODULE IS BUILT AROUND ────────────────────────────────────────────────────
//
// **A balance we read from the vendor and a balance we worked out ourselves are different facts.**
//
// Both are numbers, both look equally confident in a report, and only one of them is true. If we
// have not read TexasFile's own page since three purchases ago, the figure we hold is an estimate
// derived from our ledger. It is usually close. Acting on it as if it were a reading is how an
// automatic payment loop either overspends or fails a purchase twenty minutes into a job — and the
// failure surfaces as "the vendor declined", which is a statement about the vendor standing in for a
// statement about our bookkeeping.
//
// So `BalanceSource` travels with every balance in this file, and no function returns a bare number.
// It is the same discipline the rest of this platform applies to search results: say which, and say
// what would settle it.
//
// ── AND AN UNKNOWN BALANCE IS NOT ZERO ──────────────────────────────────────────────────────────
//
// `balanceUsd` is nullable throughout. Defaulting it to 0 would mean "this account is empty", which
// is a claim — it would block purchases that should have gone through, and it would be
// indistinguishable from a genuinely drained account. Null means we do not know, and every consumer
// has to decide what to do about that rather than being handed a plausible-looking number.
//
// ── SECRETS ─────────────────────────────────────────────────────────────────────────────────────
//
// No password, card number or API key is read or written here. `credentialEnvVar` names the
// environment variable that holds the secret; the value never comes near the database.

import { getSupabase } from './pipeline.js';

export type BalanceSource = 'confirmed' | 'inferred' | 'unknown';
export type AccountStatus = 'none' | 'pending' | 'active' | 'suspended' | 'closed';

export interface VendorAccount {
  vendorId: string;
  displayName: string;
  accountStatus: AccountStatus;
  accountIdentifier: string | null;
  credentialEnvVar: string | null;
  accountVerifiedAt: string | null;
  /** Null means UNKNOWN, never zero. */
  balanceUsd: number | null;
  currency: string;
  balanceSource: BalanceSource;
  /** When the balance was last CONFIRMED. Null while it has only ever been inferred. */
  balanceCheckedAt: string | null;
  autoTopupEnabled: boolean;
  lowWaterUsd: number | null;
  topupToUsd: number | null;
  monthlyCeilingUsd: number | null;
  minTopupIntervalMins: number;
  lastTopupAt: string | null;
  coveredFips: string[];
  statewide: boolean;
  cardLast4: string | null;
}

/** How old a confirmed reading is allowed to get before it stops counting as confirmed.
 *
 *  Not a rule about vendors — a rule about us. A reading taken a fortnight and nine purchases ago is
 *  an estimate wearing a reading's clothes, and `describeBalance` says so. */
export const CONFIRMATION_STALE_AFTER_HOURS = 24;

// ── Reading ─────────────────────────────────────────────────────────────────────────────────────

/** The worker's Supabase client is typed from a schema predating this table, so its generated row
 *  type is `never`. Cast once at the boundary — the same treatment `purchase-ledger.ts` gives
 *  `research_document_purchases`. The shape is asserted by the seed test, not by the compiler. */
interface LooseFrom {
  select: (cols: string) => {
    eq: (col: string, val: unknown) => {
      limit: (n: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
}
const loose = (db: unknown, table: string): LooseFrom =>
  (db as { from: (t: string) => LooseFrom }).from(table);

interface AccountRow {
  vendor_id: string;
  display_name: string;
  account_status: AccountStatus;
  account_identifier: string | null;
  credential_env_var: string | null;
  account_verified_at: string | null;
  balance_usd: number | string | null;
  currency: string;
  balance_source: BalanceSource;
  balance_checked_at: string | null;
  auto_topup_enabled: boolean;
  low_water_usd: number | string | null;
  topup_to_usd: number | string | null;
  monthly_ceiling_usd: number | string | null;
  min_topup_interval_mins: number;
  last_topup_at: string | null;
  covered_fips: unknown;
  statewide: boolean;
  card_last4: string | null;
}

const num = (v: number | string | null): number | null => (v === null || v === undefined ? null : Number(v));

export function toVendorAccount(row: AccountRow): VendorAccount {
  return {
    vendorId: row.vendor_id,
    displayName: row.display_name,
    accountStatus: row.account_status,
    accountIdentifier: row.account_identifier,
    credentialEnvVar: row.credential_env_var,
    accountVerifiedAt: row.account_verified_at,
    balanceUsd: num(row.balance_usd),
    currency: row.currency,
    balanceSource: row.balance_source,
    balanceCheckedAt: row.balance_checked_at,
    autoTopupEnabled: row.auto_topup_enabled,
    lowWaterUsd: num(row.low_water_usd),
    topupToUsd: num(row.topup_to_usd),
    monthlyCeilingUsd: num(row.monthly_ceiling_usd),
    minTopupIntervalMins: row.min_topup_interval_mins,
    lastTopupAt: row.last_topup_at,
    coveredFips: Array.isArray(row.covered_fips) ? (row.covered_fips as string[]) : [],
    statewide: row.statewide,
    cardLast4: row.card_last4,
  };
}

/** Look up one vendor's account.
 *
 *  Returns `{ account: null, lookupFailed: true }` when the database could not be read. That is NOT
 *  the same as "no account exists", and the two must not be collapsed: the first should stop a
 *  spending decision, the second should trigger one. `findOwned` in the purchase ledger makes the
 *  opposite trade — proceed on failure — because a duplicate dollar is cheaper than a stalled run.
 *  Here the failure mode is charging a card, so this one fails closed. */
export async function findVendorAccount(
  vendorId: string,
): Promise<{ account: VendorAccount | null; lookupFailed: boolean }> {
  const supabase = await getSupabase();
  if (!supabase) return { account: null, lookupFailed: true };

  try {
    const { data, error } = await loose(supabase, 'research_vendor_accounts')
      .select('*')
      .eq('vendor_id', vendorId)
      .limit(1);
    if (error) return { account: null, lookupFailed: true };
    const row = (data ?? [])[0] as AccountRow | undefined;
    return { account: row ? toVendorAccount(row) : null, lookupFailed: false };
  } catch {
    return { account: null, lookupFailed: true };
  }
}

// ── Describing a balance honestly ───────────────────────────────────────────────────────────────

/** Is a confirmed reading recent enough to still be treated as one? */
export function isConfirmationFresh(
  account: Pick<VendorAccount, 'balanceSource' | 'balanceCheckedAt'>,
  now: Date,
  staleAfterHours = CONFIRMATION_STALE_AFTER_HOURS,
): boolean {
  if (account.balanceSource !== 'confirmed' || !account.balanceCheckedAt) return false;
  const age = now.getTime() - new Date(account.balanceCheckedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age <= staleAfterHours * 3_600_000;
}

/** A sentence a run, a report or a log line can use — which never states a number without stating
 *  how well it is known. */
export function describeBalance(account: VendorAccount, now: Date): string {
  const name = account.displayName || account.vendorId;

  if (account.accountStatus === 'none') {
    return `${name}: no account. Nothing can be purchased here until one is opened — this is not a balance of $0.00.`;
  }
  if (account.balanceSource === 'unknown' || account.balanceUsd === null) {
    return `${name}: balance UNKNOWN — never established. Not zero, and not spendable until it is read from the vendor.`;
  }

  const amount = `$${account.balanceUsd.toFixed(2)}`;
  if (account.balanceSource === 'inferred') {
    return (
      `${name}: ~${amount} INFERRED from our own purchase ledger, not read from the vendor. ` +
      `Treat as an estimate — a top-up decision made on it can overspend or fail a purchase mid-run.`
    );
  }
  if (!isConfirmationFresh(account, now)) {
    const when = account.balanceCheckedAt ? new Date(account.balanceCheckedAt).toISOString().slice(0, 10) : 'unknown date';
    return (
      `${name}: ${amount} confirmed on ${when}, which is now STALE. Purchases since then are not ` +
      `reflected, so treat it as an estimate until it is re-read.`
    );
  }
  return `${name}: ${amount} CONFIRMED from the vendor at ${account.balanceCheckedAt}.`;
}

// ── The top-up decision ─────────────────────────────────────────────────────────────────────────

export interface TopupDecision {
  topUp: boolean;
  /** Amount to charge, when topping up. */
  amountUsd: number | null;
  reason: string;
  /** True when we are declining because we cannot safely decide, rather than because all is well. */
  blocked: boolean;
}

export interface TopupContext {
  now: Date;
  /** Total already charged this calendar month, from the top-up ledger. */
  chargedThisMonthUsd: number;
  /** True when a top-up row is sitting at 'attempted' — a charge that may or may not have landed. */
  hasUnsettledTopup?: boolean;
}

/** Should we charge the card?
 *
 *  Every branch that cannot answer confidently returns `topUp: false, blocked: true` rather than
 *  charging. This is the OPPOSITE of the document-purchase rule, and deliberately so: there, an
 *  uncertain skip omits a document invisibly, so the safe direction is to spend. Here an uncertain
 *  charge is real money moved on a guess, and the safe direction is to stop and say why. The two
 *  rules point in opposite directions because their failure modes do. */
export function decideTopup(account: VendorAccount, ctx: TopupContext): TopupDecision {
  const no = (reason: string, blocked = false): TopupDecision => ({ topUp: false, amountUsd: null, reason, blocked });

  if (!account.autoTopupEnabled) {
    return no(`${account.vendorId}: auto top-up is off. Nothing charges a card until the owner enables it.`);
  }
  if (account.accountStatus !== 'active') {
    return no(`${account.vendorId}: account is '${account.accountStatus}', not active — topping it up would move money into an account we cannot spend from.`, true);
  }
  if (account.lowWaterUsd === null || account.topupToUsd === null || account.monthlyCeilingUsd === null) {
    return no(`${account.vendorId}: auto top-up is enabled but its limits are not all set. Refusing to charge without a threshold, a target and a ceiling.`, true);
  }
  if (!account.cardLast4) {
    return no(`${account.vendorId}: no card on file.`, true);
  }

  // An unsettled attempt means a previous charge may have gone through. Charging again on top of
  // that is exactly the silent double-spend the ledger's write-before-attempt ordering exists to
  // make visible — so make it visible rather than racing it.
  if (ctx.hasUnsettledTopup) {
    return no(`${account.vendorId}: a previous top-up is still unsettled — it may have succeeded. Refusing to charge again until it is resolved.`, true);
  }

  if (account.balanceUsd === null || account.balanceSource === 'unknown') {
    return no(`${account.vendorId}: balance is unknown, so there is nothing to compare against the threshold. Read it from the vendor first.`, true);
  }

  // An INFERRED balance is not grounds for moving money. It is grounds for going and looking.
  if (!isConfirmationFresh(account, ctx.now)) {
    const how = account.balanceSource === 'inferred' ? 'inferred from our ledger' : 'confirmed too long ago to trust';
    return no(
      `${account.vendorId}: balance is ${how}, not a fresh reading. Refusing to charge a card on an estimate — ` +
        `re-read the vendor's balance, then decide.`,
      true,
    );
  }

  if (account.balanceUsd > account.lowWaterUsd) {
    return no(`${account.vendorId}: $${account.balanceUsd.toFixed(2)} is above the $${account.lowWaterUsd.toFixed(2)} threshold.`);
  }

  // Minimum interval. Two top-ups in quick succession means something is wrong — a mis-read balance,
  // a retry storm — and the second should be refused, not honoured.
  if (account.lastTopupAt) {
    const minsSince = (ctx.now.getTime() - new Date(account.lastTopupAt).getTime()) / 60_000;
    if (Number.isFinite(minsSince) && minsSince < account.minTopupIntervalMins) {
      return no(
        `${account.vendorId}: last top-up was ${Math.round(minsSince)} min ago, inside the ${account.minTopupIntervalMins} min minimum. ` +
          `Two top-ups this close together means something is wrong; refusing the second.`,
        true,
      );
    }
  }

  const amount = Math.round((account.topupToUsd - account.balanceUsd) * 100) / 100;
  if (amount <= 0) {
    return no(`${account.vendorId}: balance already at or above the $${account.topupToUsd.toFixed(2)} target.`);
  }

  // Monthly ceiling. Stops rather than charging a reduced amount: a partial top-up would leave the
  // account below its own threshold and trigger the same decision again on the next run, which is a
  // loop that bills every time round.
  if (ctx.chargedThisMonthUsd + amount > account.monthlyCeilingUsd) {
    return no(
      `${account.vendorId}: $${amount.toFixed(2)} would take this month to ` +
        `$${(ctx.chargedThisMonthUsd + amount).toFixed(2)}, over the $${account.monthlyCeilingUsd.toFixed(2)} ceiling. ` +
        `Stopping and asking rather than charging past it.`,
      true,
    );
  }

  return {
    topUp: true,
    amountUsd: amount,
    blocked: false,
    reason:
      `${account.vendorId}: $${account.balanceUsd.toFixed(2)} is at or below the $${account.lowWaterUsd.toFixed(2)} threshold ` +
      `(confirmed reading). Charging $${amount.toFixed(2)} to reach $${account.topupToUsd.toFixed(2)}.`,
  };
}

// ── Reconciliation (the input to S-10) ──────────────────────────────────────────────────────────

export interface Divergence {
  vendorId: string;
  confirmedUsd: number;
  expectedUsd: number;
  differenceUsd: number;
  /** Reported, never silently corrected. */
  statement: string;
}

/** Compare what the vendor says it took against what our ledger says we spent.
 *
 *  A divergence is a QUESTION, not a rounding error to absorb. Quietly writing the vendor's number
 *  over ours would destroy the only evidence that the two ever disagreed — and a ledger that silently
 *  agrees with the vendor is not a check on anything. */
export function reconcile(
  vendorId: string,
  confirmedUsd: number,
  previousConfirmedUsd: number,
  ledgerSpendSinceUsd: number,
  toleranceUsd = 0.01,
): Divergence | null {
  const expected = Math.round((previousConfirmedUsd - ledgerSpendSinceUsd) * 100) / 100;
  const difference = Math.round((confirmedUsd - expected) * 100) / 100;
  if (Math.abs(difference) <= toleranceUsd) return null;

  const direction = difference < 0
    ? `the vendor took $${Math.abs(difference).toFixed(2)} MORE than our ledger accounts for`
    : `our ledger accounts for $${difference.toFixed(2)} MORE than the vendor took`;

  return {
    vendorId,
    confirmedUsd,
    expectedUsd: expected,
    differenceUsd: difference,
    statement:
      `${vendorId}: expected $${expected.toFixed(2)} (last confirmed $${previousConfirmedUsd.toFixed(2)} ` +
      `less $${ledgerSpendSinceUsd.toFixed(2)} of recorded spend) but the vendor reports ` +
      `$${confirmedUsd.toFixed(2)} — ${direction}. Reported, not corrected: the difference is the finding.`,
  };
}
