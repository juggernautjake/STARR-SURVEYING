// worker/src/research/live-source-adapters.ts — map live source results into the engine's manifest (A7).
//
// The cross-source engine (A1) is fed by an injected per-source search that returns `ManifestEntry[]`.
// The live sources — TexasFile's search, the Bell county-clerk search — return their own shapes. These
// pure mappers turn each into a `ManifestEntry` (identifiers + cost + how to acquire), so the engine
// can match documents across sources and decide the cheapest one. Pure, so the mapping is unit-tested;
// the factories that run the live search wire these into the engine in index.ts.

import type { ManifestEntry } from './cross-source-discovery.js';
import type { TexasFileResult } from '../services/texasfile-buy.js';

/** Classify a source's free-text document type into the engine's doc types. */
export function classifyDocType(typeText?: string | null): string {
  const t = (typeText ?? '').toLowerCase();
  if (!t) return 'other';
  if (/(plat|subdivision|map of survey|survey|drawing)/.test(t)) return 'plat';
  if (/(deed of trust|deed|warranty|conveyance|grant)/.test(t)) return 'deed';
  if (/easement|right.?of.?way|row/.test(t)) return 'easement';
  if (/restrict|covenant|ccr/.test(t)) return 'restriction';
  return 'other';
}

/** Split TexasFile's `bookVolPage` ("Vol 5456 Pg 704", "V.5456/704") into a book/volume + page. */
export function splitBookVolPage(raw?: string | null): { book?: string; page?: string } {
  if (!raw) return {};
  const nums = raw.match(/\d+/g);
  if (!nums || nums.length === 0) return {};
  if (nums.length === 1) return { book: nums[0] };
  return { book: nums[0], page: nums[1] };
}

/**
 * One TexasFile search result → a paid `ManifestEntry`. TexasFile bills $1/page, so the per-document
 * cost is its page count (fallback $1). `previewRef` carries the GUID the buy step needs.
 */
export function texasFileResultToManifest(r: TexasFileResult, county: string): ManifestEntry {
  const bvp = splitBookVolPage(r.bookVolPage);
  const pageCount = r.pages ?? undefined;
  return {
    sourceId: 'texasfile',
    kind: 'paid',
    docType: classifyDocType(r.type),
    instrument: r.instrument ?? undefined,
    book: bvp.book,
    page: bvp.page,
    recordingDate: r.date ?? undefined,
    pageCount,
    unitCostUsd: pageCount && pageCount > 0 ? pageCount : 1, // $1/page, at least $1
    previewRef: r.guid,
    canFreeCapture: false,
    canPurchase: true,
  };
}

/** Map a whole TexasFile search into manifest entries. */
export function texasFileResultsToManifest(results: TexasFileResult[], county: string): ManifestEntry[] {
  return results.map((r) => texasFileResultToManifest(r, county));
}
