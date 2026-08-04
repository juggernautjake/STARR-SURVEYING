// lib/finance/missing-table.ts — "the table is not there yet" told apart from "the query failed".
//
// FINANCE_TAX_AND_INTAKE F1b/F2b. Both screens make the same distinction, and it is the reason they
// could be built before their seeds were applied: **"no rows" and "no table" are different
// sentences.** An empty list invites a bookkeeper to register a card, or file a pass-through cost,
// that cannot be saved — and reads as a claim ("nothing is on file") that nobody checked.
//
// ── WHY THIS IS A MODULE AND NOT `error.code === '42P01'` INLINE ────────────────────────────────
//
// F1b shipped with exactly that check, on the reasonable belief that Postgres answers a query
// against a missing relation with **42P01**. Postgres does. **We do not talk to Postgres.**
//
// Every one of these reads goes through PostgREST, which validates the table name against its own
// schema cache before any SQL is generated, and answers:
//
//     404  {"code":"PGRST205","message":"Could not find the table 'public.payment_cards' in the
//           schema cache","hint":"Perhaps you meant the table 'public.payment_receipts'"}
//
// So the 42P01 branch was unreachable against the live database, and the careful message it guarded
// would never have rendered — the screen would have shown a raw schema-cache string as a 500. The
// distinction was designed correctly and detected wrongly, which is the harder half to notice,
// because the code reads as though it works.
//
// Verified against the live project rather than reasoned about: `payment_cards`, `cost_recoveries`
// and a table invented for the purpose all answer 404/PGRST205 today.
//
// **42P01 is still checked**, because it is what comes back from the paths that do reach Postgres
// directly — `scripts/apply-seeds.mjs` and anything using node-pg with `SUPABASE_DB_URL` — and a
// helper that is right in one caller and wrong in the next is worse than no helper.

/** Postgres, when SQL actually reaches it: `relation "…" does not exist`. */
const UNDEFINED_TABLE = '42P01';

/** PostgREST ≥ v12, which never gets that far: the name is not in its schema cache. */
const SCHEMA_CACHE_MISS = 'PGRST205';

/** The shape both supabase-js and node-pg errors satisfy. Deliberately structural — accepting
 *  `unknown` and narrowing here means a caller cannot cast a wrong shape past the check. */
interface CodedError {
  code?: string | null;
  message?: string | null;
}

/**
 * True when the failure means *the table has not been created yet* — not that it is empty, and not
 * that something else went wrong.
 *
 * Anything else is a real error and must keep surfacing as one: reporting a permission failure or a
 * dropped connection as "run the seeds" would send someone to fix the wrong thing.
 */
export function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as CodedError;
  return e.code === UNDEFINED_TABLE || e.code === SCHEMA_CACHE_MISS;
}

/**
 * What to tell the person looking at the screen.
 *
 * Names the seed and the command, because "the table does not exist" is a fact about our
 * deployment and not something the reader did — and ends with the sentence that is the entire
 * point of the distinction.
 */
export function missingTableMessage(what: string, seeds: string): string {
  return (
    `The ${what} table has not been created yet. ${seeds} — written and verified, but not yet ` +
    'applied to this database. Run `node scripts/apply-seeds.mjs`. Until then nothing can be ' +
    'recorded here, and this is NOT a statement that there is nothing to show.'
  );
}
