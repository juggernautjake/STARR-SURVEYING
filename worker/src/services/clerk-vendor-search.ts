// worker/src/services/clerk-vendor-search.ts — a clerk source for the counties that are not Kofile.
//
// ── WHAT THIS CLOSES ────────────────────────────────────────────────────────────────────────────
//
// The generic pipeline's clerk search is `bell-clerk.ts`, which is Kofile-only and reads its own
// table. It never calls `getClerkAdapter`. So every piece of vendor routing in
// `services/clerk-registry.ts` — eDocTec, Tyler, USLandRecords, Aumentum, iDocket, Fidlar,
// TexasFile — governs chain-of-title, the document-access orchestrator and the Testing Lab, and
// governs NOTHING in a normal run.
//
// Measured on 2026-09-02: of the 72 counties `KOFILE_CONFIGS` claimed, 43 pointed at hosts that do
// not resolve. Those are now in `KOFILE_UNREACHABLE`. Which leaves 29 counties with a working clerk
// search and every other county in Texas with none at all — a run there reports "no clerk records"
// having never contacted a clerk.
//
// This is the bridge: when a county has no Kofile portal, ask the registry which vendor it actually
// uses and search that.
//
// ── WHY THE RESULTS ARE MARKED WITH THEIR VENDOR ────────────────────────────────────────────────
//
// `source` carries the adapter that answered. A deed found through eDocTec and one found through
// Kofile are the same deed, but "which vendor did we reach" is the first question when a county
// starts returning nothing — and it is unanswerable after the fact if every result says "clerk".

import { getClerkAdapter, getClerkSystem } from './clerk-registry.js';
import type { ClerkDocumentResult } from '../adapters/clerk-adapter.js';
import type { DocumentResult } from '../types/index.js';
import type { PipelineLogger } from '../lib/logger.js';

/** Map a vendor adapter's result onto the shape the pipeline carries. */
export function toDocumentResult(r: ClerkDocumentResult, vendor: string): DocumentResult {
  return {
    ref: {
      instrumentNumber: r.instrumentNumber || null,
      volume: r.volumePage?.volume || null,
      page: r.volumePage?.page || null,
      documentType: r.documentType || 'Unknown',
      recordingDate: r.recordingDate || null,
      grantors: r.grantors ?? [],
      grantees: r.grantees ?? [],
      // The vendor, not just "clerk". See the header.
      source: r.source || vendor,
      url: null,
    },
    textContent: null,
    ocrText: null,
    extractedData: null,
  };
}

export interface VendorSearchOutcome {
  documents: DocumentResult[];
  /** The vendor that was asked. Null when the county routes nowhere usable. */
  vendor: string | null;
  /** A sentence for the run log. Never "no records" when nothing was searched. */
  statement: string;
  /**
   * C3 — what the vendor actually let us see.
   *
   * `TexasFileAdapter` has set `lastAccess` on every search since it was written and NOTHING read
   * it, so "5,000 records exist here and we cannot open them" reached a `console.warn` and stopped.
   * That is the single most decision-shaped fact a run can produce about a county — it is the
   * difference between buying a subscription and looking somewhere else — and it never left the
   * adapter.
   */
  paywall: { recordCount: number | null; statement: string } | null;
}

/**
 * Search a county's real clerk vendor for an owner's documents.
 *
 * Returns a STATEMENT as well as the documents, because the two failure modes must not read alike:
 * "this vendor holds nothing for that name" is a finding about the property, and "we could not
 * reach a vendor" is a finding about us. Every caller of this used to receive `[]` for both.
 *
 * Never throws. A vendor that is down must not fail a run that has already found a boundary.
 */
export async function searchClerkByVendor(
  county: string,
  countyFIPS: string,
  ownerName: string,
  logger: PipelineLogger,
): Promise<VendorSearchOutcome> {
  if (!countyFIPS) {
    return {
      documents: [],
      paywall: null,
      vendor: null,
      statement:
        `No FIPS code could be resolved for ${county} County, so no clerk vendor could be selected. ` +
        `That is a gap in our county table, not a finding about the property.`,
    };
  }

  const vendor = getClerkSystem(countyFIPS);
  let adapter;
  try {
    adapter = getClerkAdapter(countyFIPS, county);
  } catch (err) {
    return {
      documents: [],
      paywall: null,
      vendor,
      statement:
        `${county} County routes to ${vendor}, and that adapter could not be created ` +
        `(${err instanceof Error ? err.message : String(err)}). No clerk search ran.`,
    };
  }

  const seen = new Set<string>();
  const documents: DocumentResult[] = [];

  try {
    await adapter.initSession();

    // Grantor and grantee are different questions and a property needs both: the owner appears as
    // grantee on the deed that gave it to them and as grantor on anything they have since conveyed.
    for (const role of ['grantee', 'grantor'] as const) {
      let results: ClerkDocumentResult[] = [];
      try {
        results = role === 'grantee'
          ? await adapter.searchByGranteeName(ownerName)
          : await adapter.searchByGrantorName(ownerName);
      } catch (err) {
        logger.warn(
          'Stage2',
          `${vendor} ${role} search failed for "${ownerName}" in ${county}: ` +
          `${err instanceof Error ? err.message : String(err)}. This is an error, NOT an empty index.`,
        );
        continue;
      }

      for (const r of results) {
        const key = `${r.instrumentNumber}|${r.recordingDate}`;
        if (seen.has(key)) continue;
        seen.add(key);
        documents.push(toDocumentResult(r, vendor));
      }
    }
  } catch (err) {
    return {
      documents,
      paywall: null,
      vendor,
      statement:
        `${county} County routes to ${vendor}, and the session could not be opened ` +
        `(${err instanceof Error ? err.message : String(err)}). ` +
        `${documents.length} document(s) were retrieved before that.`,
    };
  } finally {
    try {
      await adapter.destroySession();
    } catch { /* a browser that will not close must not fail the search that already ran */ }
  }

  // The adapter's own verdict on what it was allowed to see. Structural, because only the
  // TexasFile adapter has one — the others either return records or throw.
  const access = (adapter as unknown as {
    lastAccess?: { state?: string; recordCount?: number | null; statement?: string } | null;
  }).lastAccess ?? null;
  const paywall = access?.state === 'paywalled'
    ? { recordCount: access.recordCount ?? null, statement: access.statement ?? '' }
    : null;

  if (paywall) {
    // Said in the run log, not just returned. A count behind a paywall is a purchasing decision;
    // an empty result is a wrong answer about someone's property.
    logger.warn('Stage2', paywall.statement);
  }

  return {
    documents,
    paywall,
    vendor,
    statement: documents.length > 0
      ? `${documents.length} document(s) found for "${ownerName}" via ${vendor} in ${county} County.`
      : paywall
      ? `${vendor} reports ${paywall.recordCount ?? 'an unknown number of'} record(s) for ` +
        `"${ownerName}" in ${county} County and will not show them without a subscription. ` +
        `The records EXIST — this is the absence of access, not of documents.`
      : `${vendor} returned no documents for "${ownerName}" in ${county} County. The search ran and ` +
        `the index answered — this is a finding about the name, not a gap in coverage.`,
  };
}
