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


// ── The rules live next door ────────────────────────────────────────────────────────────────────
//
// Everything pure — the types, toVendorAccount, describeBalance, decideTopup, reconcile — moved to
// ./vendor-accounts-policy.ts, which imports nothing. It had to: this file reaches pipeline.js for
// a database handle, pipeline.js is the whole worker, and the admin route that now calls
// decideTopup() for its top-up dry run was therefore pulling Playwright adapters and AI extractors
// into the Next bundle. The production build failed on it while tsc and 1,497 worker tests passed.
//
// Re-exported so every existing importer of this module is untouched.
export * from './vendor-accounts-policy.js';

import { toVendorAccount, type VendorAccount, type AccountRow } from './vendor-accounts-policy.js';


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
  // Imported here rather than at the top so that merely importing this module does not construct
  // the pipeline. The policy split above is what keeps the Next bundle clean; this keeps the worker
  // from paying for a database handle it may never use.
  const { getSupabase } = await import('./pipeline.js');
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
