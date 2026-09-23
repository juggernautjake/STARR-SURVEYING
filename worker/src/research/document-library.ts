// worker/src/research/document-library.ts — what the FIRM holds, not what one project holds.
//
// Owner, 2026-09-23: "if someone does a research run in bell county, it should search through all
// of the saved files in the database that relate to bell county, as well as search online."
//
// ── WHY THIS IS NOT A WIDER `ProjectLibrary` ────────────────────────────────────────────────────
//
// `ProjectLibrary` loads every row of a project into three in-memory maps and answers from them.
// That is right for a project: a few hundred rows, loaded once, consulted constantly, and updated
// as the run files things so a document arriving twice WITHIN a run is caught too.
//
// It is exactly wrong for a county. Bell alone is 8,077 plats before a single deed; loading them to
// answer one question would cost more than the fetch it saves, and `classify()`'s near-miss branch
// is a linear scan over everything loaded. So this asks the DATABASE a narrow question and keeps
// nothing. Two different jobs, two different shapes — sharing the class would have meant one of
// them doing the other's work badly.
//
// ── WHAT IT WILL NOT DO ─────────────────────────────────────────────────────────────────────────
//
// It never returns a document that is not `shareable`. A customer's own uploaded survey and a
// vendor purchase whose terms we have not checked both sit in `research_documents`, and neither may
// be handed to a different customer because they happen to be about the same parcel. The column
// defaults to false precisely so that silence means no — see seeds/658.

import { identityKey, type DocumentRef } from './document-identity.js';
import { normaliseSubdivisionName } from '../services/texasfile-rows.js';

/**
 * The county key this library is stored under.
 *
 * ── THREE NORMALISERS DISAGREED, WHICH IS TWO TOO MANY ────────────────────────────────────────
 *
 * `normaliseCounty()` in document-identity.ts strips " County" and UPPERCASES. `countyKey()` in
 * purchase-ledger.ts prefers 5-digit FIPS and otherwise LOWERCASES, and does not strip " County".
 * Seed 658's backfill strips " County" and lowercases.
 *
 * The first version of this file used `normaliseCounty`, so every lookup asked for `BELL` against a
 * column holding `bell` and the library would have matched nothing at all — silently, because a
 * library miss is indistinguishable from an empty library. Caught by a test that pinned the filter
 * rather than the result.
 *
 * So there is one function, and it has to agree with the seed and with the purchase ledger, because
 * the ledger and the library answering differently about the same document is worse than either
 * answering alone: FIPS digits when we have them, else the bare county name lower-cased.
 */
export function libraryCountyKey(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 4) return digits.padStart(5, '0');
  return s.replace(/\s+county\s*$/i, '').trim().toLowerCase();
}

/** A document the firm already holds and may re-use. */
export interface HeldDocument {
  id: string;
  label: string | null;
  documentType: string | null;
  countyFips: string | null;
  identityKey: string | null;
  contentSha256: string | null;
  storagePath: string | null;
  storageUrl: string | null;
  pagesPdfUrl: string | null;
  recordedDate: string | null;
  recordingInfo: string | null;
  pageCount: number | null;
  /** The project it was originally fetched for — provenance, not permission. */
  researchProjectId: string | null;
  provenance: string | null;
  sourceVendor: string | null;
}

/** The narrow Supabase surface this module needs. Declared rather than `any` so a new query has to
 *  be written down before it can be made — the same discipline `LibraryDb` keeps next door. */
export interface LibraryQueryDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (t: string) => any;
}

const COLUMNS =
  'id, document_label, document_type, county_fips, identity_key, content_sha256, storage_path, '
  + 'storage_url, pages_pdf_url, recorded_date, recording_info, page_count, research_project_id, '
  + 'provenance, source_vendor';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toHeld(row: any): HeldDocument {
  return {
    id: String(row.id),
    label: row.document_label ?? null,
    documentType: row.document_type ?? null,
    countyFips: row.county_fips ?? null,
    identityKey: row.identity_key ?? null,
    contentSha256: row.content_sha256 ?? null,
    storagePath: row.storage_path ?? null,
    storageUrl: row.storage_url ?? null,
    pagesPdfUrl: row.pages_pdf_url ?? null,
    recordedDate: row.recorded_date ?? null,
    recordingInfo: row.recording_info ?? null,
    pageCount: typeof row.page_count === 'number' ? row.page_count : null,
    researchProjectId: row.research_project_id ?? null,
    provenance: row.provenance ?? null,
    sourceVendor: row.source_vendor ?? null,
  };
}

/** Every library read starts here: shareable, live, not a duplicate of something else. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function base(db: LibraryQueryDb, county: string): any {
  return db.from('research_documents')
    .select(COLUMNS)
    .eq('county_fips', libraryCountyKey(county))
    .eq('shareable', true)
    .is('superseded_at', null)
    .is('duplicate_of', null);
}

/**
 * Does the firm already hold this exact document?
 *
 * Asked by citation, which is the only identity that survives crossing vendors: the same deed is
 * `2019-12345` on TexasFile and `V9251 P668` on the county portal, and only the normalised key
 * knows they are one document. `document-identity.ts` already builds that key and is already
 * county-keyed rather than project-keyed — it was written for exactly this and never used for it.
 */
export async function heldByCitation(
  db: LibraryQueryDb | null,
  ref: DocumentRef,
): Promise<HeldDocument | null> {
  if (!db) return null;
  const key = identityKey(ref);
  if (!key || !ref.county) return null;
  try {
    const { data } = await base(db, ref.county).eq('identity_key', key).limit(1);
    const row = (data ?? [])[0];
    return row ? toHeld(row) : null;
  } catch {
    // A library miss must never fail a run. The worst case is fetching something we already had,
    // which is the behaviour this function exists to improve on — not a reason to stop the run.
    return null;
  }
}

/**
 * Do we already hold these exact bytes?
 *
 * Cheaper and stronger than a citation match where it applies: two files with the same SHA-256 are
 * the same document however they are labelled. Used after a download to avoid storing a second copy
 * of something the firm already has under a different name.
 */
export async function heldByContent(
  db: LibraryQueryDb | null,
  county: string,
  sha256: string,
): Promise<HeldDocument | null> {
  if (!db || !sha256) return null;
  try {
    const { data } = await base(db, county).eq('content_sha256', sha256).limit(1);
    const row = (data ?? [])[0];
    return row ? toHeld(row) : null;
  } catch {
    return null;
  }
}

/**
 * A plat the firm holds for this subdivision, in this county, from any project.
 *
 * This is the one that changes what a run costs. `filedPlatLabel` asks the same question scoped to
 * ONE project, and it is consulted before the free portal and before the paid engine — so today a
 * run for 12 Oak Street re-fetches the subdivision plat that a run for 14 Oak Street downloaded
 * last week, because they are different projects. Same county, same subdivision, same file.
 *
 * Matched on the normalised subdivision name rather than the raw label, because the county writes
 * "GLENDALE ADDITION AMENDED" and the vendor writes "Glendale Add'n (Amended)".
 */
export async function heldPlatForSubdivision(
  db: LibraryQueryDb | null,
  county: string,
  subdivision: string | null | undefined,
): Promise<HeldDocument | null> {
  if (!db || !subdivision) return null;
  const key = normaliseSubdivisionName(subdivision).replace(/[%_]/g, '');
  if (!key || key.length < 3) return null;
  try {
    const { data } = await base(db, county)
      .in('document_type', ['plat', 'subdivision_plat'])
      .ilike('document_label', `%${key}%`)
      .limit(1);
    const row = (data ?? [])[0];
    return row ? toHeld(row) : null;
  } catch {
    return null;
  }
}

/** Everything the firm holds for a county, for the library view and for a run's opening survey. */
export async function heldForCounty(
  db: LibraryQueryDb | null,
  county: string,
  opts: { documentType?: string; limit?: number } = {},
): Promise<HeldDocument[]> {
  if (!db) return [];
  try {
    let q = base(db, county);
    if (opts.documentType) q = q.eq('document_type', opts.documentType);
    const { data } = await q.limit(opts.limit ?? 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((r: any) => toHeld(r));
  } catch {
    return [];
  }
}

/** What the firm holds for a county, counted by kind — the one line a run's log should carry. */
export async function countyHoldingsSummary(
  db: LibraryQueryDb | null,
  county: string,
): Promise<{ total: number; byType: Record<string, number>; sentence: string }> {
  const docs = await heldForCounty(db, county, { limit: 1000 });
  const byType: Record<string, number> = {};
  for (const d of docs) byType[d.documentType ?? 'other'] = (byType[d.documentType ?? 'other'] ?? 0) + 1;
  const parts = Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${t}`);
  return {
    total: docs.length,
    byType,
    sentence: docs.length === 0
      ? `Nothing held for ${county} yet.`
      : `The library holds ${docs.length} document(s) for ${county}${parts.length ? ` — ${parts.join(', ')}` : ''}.`,
  };
}
