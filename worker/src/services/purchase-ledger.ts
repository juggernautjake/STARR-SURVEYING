// worker/src/services/purchase-ledger.ts — the document library, and never paying twice (plan R13).
//
// ── WHAT WAS WRONG ──────────────────────────────────────────────────────────────────────────────
//
// Purchases were tracked by BillingTracker in `/tmp/billing/<project>.json`. That directory lives
// inside the worker container: wiped on every restart, invisible to the app, and scoped to a single
// project. So nothing could answer the one question that saves money — "do we already own this?" —
// and a second run on the same property bought the same deed again at $1.00 a page.
//
// ── IDENTITY IS THE WHOLE PROBLEM ───────────────────────────────────────────────────────────────
//
// A document is identified by the COUNTY that recorded it and the instrument number. Not by the
// platform: the same deed bought from Tyler and from TexasFile is one document, and keying on the
// vendor would cheerfully buy it twice. Not by the project either — the library is firm-wide, and
// two jobs in the same subdivision routinely need the same governing plat.
//
// The instrument number itself is written a dozen ways: `2019-12345`, `201912345`, `2019/12345`,
// `Doc# 2019-12345`, with stray whitespace. Comparing those literally means paying twice for the
// same page, which is the failure this module exists to prevent.

import { getSupabase } from './pipeline.js';
import { recordUsage } from '../infra/usage.js';
import { notePaidPages } from '../infra/run-budget.js';

/** Normalise an instrument number to a comparison key.
 *
 *  Uppercase, strip everything that is not a letter or digit. Aggressive on purpose: within one
 *  county, instrument numbers follow one format, so the collision risk between `2019-1234` and
 *  `201-91234` is theoretical, while the cost of treating `2019-12345` and `201912345` as different
 *  documents is a duplicate charge on every single run.
 *
 *  The raw string is stored alongside so a human always sees what the county actually calls it. */
export function instrumentKey(instrument: string): string {
  return instrument
    .toUpperCase()
    // Drop the LABEL the page printed beside the number — `Doc# 2019-12345` and `2019-12345` are the
    // same instrument, and a scraped results table supplies the label about half the time. Only this
    // known list is stripped: a blanket "remove leading letters" would destroy `V123P456`, where the
    // letters ARE the volume-and-page identity.
    .replace(/^\s*(?:DOCUMENT|DOC|INSTRUMENT|INST|FILE|CLERK'?S?)\s*(?:NO\.?|NUMBER|#)?\s*[:#]?\s*/i, '')
    .replace(/[^A-Z0-9]/g, '');
}

/** County identity, normalised to 5-digit FIPS where possible.
 *
 *  A county arriving as `48027` and as `Bell` are the same county, and mixing them in the key would
 *  split the library in two. Callers should pass FIPS; a name falls back to a stable lowercase form
 *  rather than being silently dropped. */
export function countyKey(countyFips: string): string {
  const digits = countyFips.replace(/\D/g, '');
  return digits.length >= 4 ? digits.padStart(5, '0') : countyFips.trim().toLowerCase();
}

/** The worker's Supabase client is typed from a schema that predates this table, so its generated
 *  row type is `never`. Cast at the boundary, once, rather than weakening the client everywhere —
 *  the same treatment `usage.ts` gives `research_usage_events`. The shape is asserted by the seed
 *  test instead of by the compiler. */
interface LooseTable {
  insert: (row: unknown) => Promise<{ error: { message: string; code?: string } | null }>;
  select: (cols: string) => {
    eq: (col: string, val: unknown) => {
      eq: (col: string, val: unknown) => {
        eq: (col: string, val: unknown) => {
          limit: (n: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
}
const loose = (db: unknown, table: string): LooseTable =>
  (db as { from: (t: string) => LooseTable }).from(table);

export interface OwnedDocument {
  id: string;
  countyFips: string;
  instrumentRaw: string;
  documentType: string | null;
  platformId: string;
  pages: number;
  costUsd: number;
  storagePaths: string[];
  purchasedAt: string;
  /** Which project paid for it. Shown when a run reuses another job's document. */
  projectId: string | null;
}

export interface PurchaseRecord {
  projectId: string;
  runId?: string | null;
  countyFips: string;
  instrument: string;
  documentType?: string | null;
  platformId: string;
  pages: number;
  costUsd: number;
  transactionId?: string | null;
  storagePaths?: string[];
  receipt?: Record<string, unknown>;
}

interface PurchaseRow {
  id: string;
  county_fips: string;
  instrument_raw: string;
  document_type: string | null;
  platform_id: string;
  pages: number;
  cost_usd: number | string;
  storage_paths: unknown;
  purchased_at: string;
  research_project_id: string | null;
}

function toOwned(row: PurchaseRow): OwnedDocument {
  return {
    id: row.id,
    countyFips: row.county_fips,
    instrumentRaw: row.instrument_raw,
    documentType: row.document_type,
    platformId: row.platform_id,
    pages: row.pages,
    costUsd: Number(row.cost_usd),
    storagePaths: Array.isArray(row.storage_paths) ? (row.storage_paths as string[]) : [],
    purchasedAt: row.purchased_at,
    projectId: row.research_project_id,
  };
}

/** Do we already own this document?
 *
 *  Returns the existing purchase, or null. A LOOKUP FAILURE ALSO RETURNS NULL — and that asymmetry
 *  is deliberate but dangerous, so it is stated: if the ledger cannot be read, the run proceeds and
 *  may buy a document twice. The alternative is refusing to buy anything whenever the database
 *  hiccups, which stalls a 25-minute run over a transient error. A duplicate dollar is the cheaper
 *  failure, and `lookupFailed` lets a caller say so out loud rather than reporting a clean miss. */
export async function findOwned(
  countyFips: string,
  instrument: string,
): Promise<{ owned: OwnedDocument | null; lookupFailed: boolean }> {
  const supabase = await getSupabase();
  if (!supabase) return { owned: null, lookupFailed: true };

  const { data, error } = await loose(supabase, 'research_document_purchases')
    .select('id, county_fips, instrument_raw, document_type, platform_id, pages, cost_usd, storage_paths, purchased_at, research_project_id')
    .eq('county_fips', countyKey(countyFips))
    .eq('instrument_key', instrumentKey(instrument))
    .eq('status', 'completed')
    .limit(1);

  if (error) return { owned: null, lookupFailed: true };
  const row = (data ?? [])[0] as PurchaseRow | undefined;
  return { owned: row ? toOwned(row) : null, lookupFailed: false };
}

export interface RecordResult {
  saved: boolean;
  /** Set when the unique index rejected the insert: another run bought it first. */
  duplicateOf?: OwnedDocument | null;
  error?: string;
}

/** Write a completed purchase to the ledger AND to the usage stream.
 *
 *  Both, not either: the ledger answers "do we own it", the usage event answers "what has this run
 *  spent". R4 made model spend visible; a $1.00 page that never reached `research_usage_events` was
 *  money the cost view could not see, so a run's reported spend was quietly wrong. */
/** Every completed purchase THIS run made (by `run_id`), oldest first — what a later pass in the same
 *  run must not buy again (2026-09-07: the early plats-first pass and the final checklist pass could
 *  not see each other). Empty on any error: a lookup that fails must not stop a run from buying. */
export async function listRunPurchases(
  projectId: string,
  runId: string,
): Promise<Array<{ instrumentRaw: string; documentType: string; platformId: string; pages: number; costUsd: number; purchasedAt: string }>> {
  const supabase = await getSupabase();
  if (!supabase) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('research_document_purchases')
    .select('instrument_raw, document_type, platform_id, pages, cost_usd, purchased_at, status')
    .eq('research_project_id', projectId)
    .eq('run_id', runId)
    .eq('status', 'completed')
    .order('purchased_at', { ascending: true });
  if (error || !Array.isArray(data)) return [];
  return (data as Array<Record<string, unknown>>).map((row) => ({
    instrumentRaw: String(row.instrument_raw ?? ''),
    documentType: String(row.document_type ?? 'deed'),
    platformId: String(row.platform_id ?? ''),
    pages: Number(row.pages ?? 0),
    costUsd: Number(row.cost_usd ?? 0),
    purchasedAt: String(row.purchased_at ?? ''),
  })).filter((p) => p.instrumentRaw);
}

// ── OFFERS: FOUND, PRICED, AND DELIBERATELY NOT BOUGHT ──────────────────────────────────────────
//
// Owner, 2026-09-21: "we will find all of the relevant items that can be purchased, and we will
// list them when the research run is done, and next to them we will have a purchase button."
//
// This lives in the ledger with its siblings rather than beside its caller, and that is the whole
// point of moving it here. The first version was written inline in `index.ts` with its own cast and
// its own row literal, and it got two things wrong that no sibling in this file gets wrong:
// `instrument_key` was never set and `instrument_raw` was allowed to be null, both NOT NULL since
// seed 531. Every insert failed 23502, the failure was a `console.warn`, and the table stayed empty
// — the same shape of bug seed 629 records for `paid_disabled`, one table over, a year apart.
//
// A row written through `instrumentKey`/`countyKey` is a row the library can match against. An
// offer keyed differently from the purchases it becomes is an offer that cannot tell it has already
// been bought.

export interface PurchaseOffer {
  projectId: string;
  runId?: string | null;
  countyFips: string;
  /** What the county calls it. May be absent — see `offerIdentity`. */
  instrument?: string | null;
  book?: string | null;
  page?: string | null;
  documentType?: string | null;
  platformId: string;
  /** Best estimate. 0 when the vendor prices per page and the count is not known yet. */
  costUsd: number;
  /** The vendor's own id for this document — TexasFile's search GUID. What the purchase button
   *  buys a day later, instead of re-running the search and taking the first hit. */
  vendorRef?: string | null;
  /** One line for the operator: why it was found and not bought. */
  note?: string | null;
}

/**
 * How an offer identifies its document, in the order the identity is worth having.
 *
 * `instrument_raw` is NOT NULL and it is also what a person reads, so an offer with no instrument
 * number still has to say something true. A book and page IS the identity in the older volumes,
 * where instrument numbers did not exist. Failing both, the vendor's own id is the only handle that
 * still buys the right document — prefixed so nobody mistakes it for a county reference.
 *
 * Returns null when there is no handle at all, and such an offer is dropped rather than stored:
 * a purchase button with nothing to buy is worse than a document nobody was told about.
 */
export function offerIdentity(offer: PurchaseOffer): string | null {
  const instrument = (offer.instrument ?? '').trim();
  if (instrument) return instrument;
  const book = (offer.book ?? '').trim();
  const page = (offer.page ?? '').trim();
  if (book && page) return `V${book} P${page}`;
  const ref = (offer.vendorRef ?? '').trim();
  if (ref) return `REF:${ref}`;
  return null;
}

/**
 * Record what the run found and chose not to buy.
 *
 * Never throws and never spends. Returns how many landed so the caller can say so — a silent
 * partial write is what this function exists to stop being possible.
 */
export async function recordOffers(
  offers: readonly PurchaseOffer[],
): Promise<{ recorded: number; dropped: number; error: string | null }> {
  if (offers.length === 0) return { recorded: 0, dropped: 0, error: null };

  const supabase = await getSupabase();
  if (!supabase) return { recorded: 0, dropped: offers.length, error: 'no database connection' };

  const now = new Date().toISOString();
  const payload: Array<Record<string, unknown>> = [];
  let dropped = 0;
  for (const offer of offers) {
    const identity = offerIdentity(offer);
    if (!identity) { dropped++; continue; }
    payload.push({
      research_project_id: offer.projectId,
      run_id: offer.runId ?? null,
      county_fips: countyKey(offer.countyFips),
      instrument_key: instrumentKey(identity),
      instrument_raw: identity,
      document_type: offer.documentType ?? null,
      platform_id: offer.platformId,
      pages: 0,
      cost_usd: Number(offer.costUsd) || 0,
      status: 'offered',
      vendor_ref: offer.vendorRef ?? null,
      offered_at: now,
      failure_reason: (offer.note ?? 'Found behind a paywall; offered rather than bought.').slice(0, 500),
    });
  }
  if (payload.length === 0) return { recorded: 0, dropped, error: null };

  try {
    const { error } = await loose(supabase, 'research_document_purchases').insert(payload);
    if (error) return { recorded: 0, dropped, error: error.message };
    return { recorded: payload.length, dropped, error: null };
  } catch (err) {
    return { recorded: 0, dropped, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function recordPurchase(rec: PurchaseRecord): Promise<RecordResult> {
  // The run's paid-page ceiling counts what THIS function records, or it counts nothing.
  // `notePaidPages` was the only thing that advanced `paidPages` and it had no caller, so
  // `maxPaidPages` was printed on every run card as a limit and could never trip, and
  // `research_runs.paid_pages` was always 0. Found by the 2026-09-03 platform audit (RL-4/PD-4).
  // A no-op when the run is not registered (Testing Lab purchases have no run).
  notePaidPages(rec.projectId, rec.pages);

  // Usage FIRST, for the same reason recordUsage accumulates before it inserts: the money left the
  // account whether or not our bookkeeping row saves.
  await recordUsage({
    projectId: rec.projectId,
    eventType: 'document_purchase',
    costUsd: rec.costUsd,
    metadata: {
      county_fips: countyKey(rec.countyFips),
      instrument: rec.instrument,
      platform: rec.platformId,
      pages: rec.pages,
      document_type: rec.documentType ?? null,
      transaction_id: rec.transactionId ?? null,
    },
  });

  const supabase = await getSupabase();
  if (!supabase) return { saved: false, error: 'no database connection' };

  const { error } = await loose(supabase, 'research_document_purchases').insert({
    research_project_id: rec.projectId,
    run_id: rec.runId ?? null,
    county_fips: countyKey(rec.countyFips),
    instrument_key: instrumentKey(rec.instrument),
    instrument_raw: rec.instrument,
    document_type: rec.documentType ?? null,
    platform_id: rec.platformId,
    pages: rec.pages,
    cost_usd: rec.costUsd,
    transaction_id: rec.transactionId ?? null,
    storage_paths: rec.storagePaths ?? [],
    receipt: rec.receipt ?? {},
    status: 'completed',
  });

  if (error) {
    // 23505 = unique violation. Two runs raced for the same document and both paid; the index
    // stopped the second row, not the second charge. Surfacing the winner beats a bare error,
    // because the caller can still USE the file rather than treating its purchase as lost.
    if ((error as { code?: string }).code === '23505') {
      const { owned } = await findOwned(rec.countyFips, rec.instrument);
      return { saved: false, duplicateOf: owned, error: 'already in the library' };
    }
    return { saved: false, error: error.message };
  }
  return { saved: true };
}

/** Record an attempt that failed. Not an ownership claim — the partial unique index ignores these,
 *  so a failure never blocks a retry. It exists so a county that always fails to sell us documents
 *  is visible as a pattern instead of as an empty library. */
export async function recordFailedPurchase(
  rec: Omit<PurchaseRecord, 'costUsd'> & { costUsd?: number },
  reason: string,
): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) return;
  await loose(supabase, 'research_document_purchases').insert({
    research_project_id: rec.projectId,
    run_id: rec.runId ?? null,
    county_fips: countyKey(rec.countyFips),
    instrument_key: instrumentKey(rec.instrument),
    instrument_raw: rec.instrument,
    document_type: rec.documentType ?? null,
    platform_id: rec.platformId,
    pages: rec.pages,
    cost_usd: rec.costUsd ?? 0,
    status: 'failed',
    failure_reason: reason.slice(0, 500),
  });
}

/**
 * Record the documents a run did NOT buy, and why — B3.
 *
 * These rows are the only evidence that a skip happened. Without them the product cannot distinguish
 * "this county holds no such record" from "we were told not to look", and it was not distinguishing
 * them: `research_document_purchases` held 0 rows of any kind, the analyze route counts rows with a
 * skip status to size its notice, and `paidDocumentsNotice()` returns null at a count of zero. So
 * the explanation existed at both ends and nothing joined them.
 *
 * No usage event, deliberately — `recordPurchase` writes one because money moved. Nothing moved
 * here, and a $0.00 usage event would put a row in the cost stream for a purchase that never
 * happened.
 *
 * Never throws. A run that skipped documents correctly must not fail because it could not write the
 * note saying so; the count comes back so the caller can say how much of it landed.
 */
export async function recordSkippedPurchases(
  rows: Array<Omit<PurchaseRecord, 'costUsd'> & { costUsd?: number }>,
  status: string,
  reason: string,
): Promise<{ recorded: number; error: string | null }> {
  if (rows.length === 0) return { recorded: 0, error: null };

  const supabase = await getSupabase();
  if (!supabase) return { recorded: 0, error: 'no database connection' };

  const payload = rows.map((rec) => ({
    research_project_id: rec.projectId,
    run_id: rec.runId ?? null,
    county_fips: countyKey(rec.countyFips),
    instrument_key: instrumentKey(rec.instrument),
    instrument_raw: rec.instrument,
    document_type: rec.documentType ?? null,
    platform_id: rec.platformId,
    pages: rec.pages,
    cost_usd: 0,
    status,
    failure_reason: reason.slice(0, 500),
  }));

  try {
    const { error } = await loose(supabase, 'research_document_purchases').insert(payload);
    if (error) return { recorded: 0, error: error.message };
    return { recorded: payload.length, error: null };
  } catch (err) {
    return { recorded: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface LibrarySavings {
  reused: number;
  savedUsd: number;
}

/** What the library saved this run. Reported on the run card, because "we did not spend $14" is
 *  invisible otherwise — and an invisible saving is one nobody defends when someone proposes
 *  turning the cache off. */
export function summariseSavings(reuses: OwnedDocument[]): LibrarySavings {
  return {
    reused: reuses.length,
    savedUsd: Number(reuses.reduce((sum, d) => sum + d.costUsd, 0).toFixed(2)),
  };
}
