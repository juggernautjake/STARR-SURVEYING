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
  const price = typeof r.priceUsd === 'number' && r.priceUsd > 0 ? r.priceUsd : undefined;
  return {
    sourceId: 'texasfile',
    kind: 'paid',
    docType: classifyDocType(r.type ?? r.countyType),
    instrument: r.instrument ?? undefined,
    // Parsed by column since 2026-09-07: the Volume/Page cells outrank a digits-only split.
    book: r.volume ?? bvp.book,
    page: r.page ?? bvp.page,
    recordingDate: r.date ?? undefined,
    grantor: r.grantor ?? undefined,
    grantee: r.grantee ?? undefined,
    // The location signals the same-document matcher and the relevance ranking compare on — a name
    // search's 39 rows span every lot the owner ever held; these say which row is the subject's.
    legalDescription: r.legal ?? undefined,
    subdivision: r.subdivision ?? undefined,
    lot: r.lots?.[0],
    block: r.block ?? undefined,
    pageCount,
    // Owned already → $0 (re-opened, never re-bought; and the planner then prefers it over a
    // duplicate row of the same document). Else the stated price, else $1/page, at least $1.
    unitCostUsd: r.owned ? 0 : (price ?? (pageCount && pageCount > 0 ? pageCount : 1)),
    previewRef: r.guid,
    canFreeCapture: false,
    canPurchase: true,
  };
}

/** Map a whole TexasFile search into manifest entries. */
export function texasFileResultsToManifest(results: TexasFileResult[], county: string): ManifestEntry[] {
  return results.map((r) => texasFileResultToManifest(r, county));
}

/**
 * Map a TexasFile PLAT search result (plan 1.3). Plats are a FLAT $10 on TexasFile regardless of page
 * count — NOT $1/page like a deed — so this fixes the cost and the docType rather than reusing the deed
 * mapper. `bookVolPage` here carries the cabinet/slide the plat search parsed.
 */
export function texasFilePlatResultToManifest(r: TexasFileResult, _county: string, subdivision?: string): ManifestEntry {
  const bvp = splitBookVolPage(r.bookVolPage);
  // A plat cabinet is often a letter ("A") and a slide "166A" — a digits-only split loses both, so the
  // parsed cells win. Two rows in the same cabinet/slide cluster into ONE plat to buy, not two $10s.
  const book = r.volume ?? bvp.book;
  const page = r.page ?? bvp.page;
  // The recorded name ("WINNIE MAE ADD", normalised) says which subdivision this plat IS; the query
  // that found it is the fallback, and what the buy re-runs to open a purchase session.
  const name = r.name ?? r.subdivision ?? subdivision;
  return {
    sourceId: 'texasfile',
    kind: 'paid',
    docType: 'plat',
    instrument: r.instrument ?? undefined,
    book,
    page,
    ...(name ? { subdivision: name } : {}),
    recordingDate: r.date ?? undefined,
    unitCostUsd: r.owned ? 0 : 10, // all TexasFile plats are $10 flat, any page count; $0 once owned
    previewRef: r.guid,
    canFreeCapture: false,
    canPurchase: true,
  };
}

/** The shape a free county-clerk search returns (Bell clerk, Kofile, …) — any subset present. */
export interface ClerkDocLike {
  instrumentNumber?: string | null;
  recordingDate?: string | null;
  grantors?: string | null;
  grantees?: string | null;
  documentType?: string | null;
  book?: string | null;
  volume?: string | null;
  page?: string | null;
  pages?: number | null;
  /** The page/details URL — the origin the free capture (and the operator's "Source ↗") uses. */
  url?: string | null;
}

/**
 * One free county-clerk document → a FREE `ManifestEntry`. Carries the grantor/grantee names and the
 * recording date so the cross-source matcher can line it up against a paid copy on names+date even
 * when the instrument number differs in format. `unitCostUsd` is 0 (free capture).
 */
export function clerkDocToManifest(doc: ClerkDocLike, sourceId: string, _county: string): ManifestEntry {
  return {
    sourceId,
    kind: 'free',
    docType: classifyDocType(doc.documentType),
    instrument: doc.instrumentNumber ?? undefined,
    book: (doc.book ?? doc.volume) ?? undefined,
    page: doc.page ?? undefined,
    recordingDate: doc.recordingDate ?? undefined,
    grantor: doc.grantors ?? undefined,
    grantee: doc.grantees ?? undefined,
    pageCount: doc.pages ?? undefined,
    unitCostUsd: 0,
    previewRef: doc.url ?? undefined,
    canFreeCapture: true,
    canPurchase: false,
  };
}
