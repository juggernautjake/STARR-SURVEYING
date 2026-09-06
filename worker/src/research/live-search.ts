// worker/src/research/live-search.ts — the live per-source search the engine dispatches (plan 1.2).
//
// `runCrossSourceAcquisition` (A7.1) takes ONE injected `SourceSearchFn`. This builds the real one:
// for TexasFile it runs the search-only login+search (1.1) and maps the results; for a FREE source it
// returns the documents the run already KNOWS are free — the CAD deed history — rather than paying for
// a second slow clerk crawl before the buy decision. That is what lets the engine compare free vs paid
// PER DOCUMENT and buy only paid-exclusive, EARLY, without slowing the run's start. The TexasFile search
// is injectable so the dispatch + mapping are unit-tested without a browser.

import type { SourceSearchFn, DiscoveryTarget, ManifestEntry } from './cross-source-discovery.js';
import type { AcquisitionSource } from './acquisition-sources.js';
import { texasFileResultToManifest, texasFilePlatResultToManifest } from './live-source-adapters.js';
import { searchTexasFileDocuments, searchTexasFilePlatsDocuments, type TexasFileBuyInput, type TexasFilePlatInput, type TexasFileResult } from './../services/texasfile-buy.js';

export interface LiveSearchConfig {
  county: string;
  /** When false, TexasFile is not searched (a free-only run). */
  texasfileEnabled: boolean;
  /** Documents the run already knows are free (the CAD deed history), as free manifest entries. The
   *  free-first comparison uses these instead of a second clerk crawl. */
  knownFreeDocuments?: ManifestEntry[];
  /** Injectable for tests; defaults to the real search-only TexasFile clerk-records call. */
  texasFileSearch?: (input: TexasFileBuyInput) => Promise<TexasFileResult[]>;
  /** Injectable for tests; defaults to the real search-only TexasFile PLAT call (plan 1.3). */
  texasFilePlatSearch?: (input: TexasFilePlatInput) => Promise<TexasFileResult[]>;
  log?: (message: string) => void;
}

/**
 * Assemble the `DiscoveryTarget` every source is searched by (plan 1.3): the owner name and
 * subdivision the run identified, plus the operator's supplemental identifiers (instrument numbers +
 * volume/page) and the instruments the CAD deed history already lists — so TexasFile is searched for
 * the exact documents the run cares about, not just the owner name. Duplicates removed.
 */
export function buildDiscoveryTarget(params: {
  county: string;
  ownerName?: string | null;
  subdivision?: string | null;
  lot?: string | null;
  supplemental?: {
    instrumentNumbers?: string[];
    volumePages?: Array<{ volume?: string; book?: string; page?: string }>;
  } | null;
  /** Instruments the CAD deed history lists — searched on TexasFile too (they may carry the plat). */
  knownInstruments?: string[];
}): DiscoveryTarget {
  const instruments = Array.from(new Set(
    [...(params.supplemental?.instrumentNumbers ?? []), ...(params.knownInstruments ?? [])]
      .map((s) => (s ?? '').trim())
      .filter((s) => s.length > 0),
  ));
  const bookPages = (params.supplemental?.volumePages ?? [])
    .map((vp) => ({ volume: (vp.volume ?? vp.book ?? '').trim(), page: (vp.page ?? '').trim() }))
    .filter((vp) => vp.volume && vp.page);
  return {
    county: params.county,
    ownerName: params.ownerName?.trim() || undefined,
    subdivision: params.subdivision?.trim() || undefined,
    lot: params.lot?.trim() || undefined,
    ...(instruments.length ? { instruments } : {}),
    ...(bookPages.length ? { bookPages } : {}),
  };
}

/** The TexasFile searches to run for a target: by owner name, by each volume/page, by each instrument.
 *  Each is a narrow query; the engine de-dups the union by GUID. */
export function buildTexasFileSearchInputs(target: DiscoveryTarget, county: string): TexasFileBuyInput[] {
  const inputs: TexasFileBuyInput[] = [];
  if (target.ownerName?.trim()) inputs.push({ county, name: target.ownerName.trim() });
  for (const bp of target.bookPages ?? []) {
    const vol = (bp.volume ?? bp.book ?? '').trim();
    const pg = (bp.page ?? '').trim();
    if (vol && pg) inputs.push({ county, volume: vol, page: pg });
  }
  // Plan 2 — NO instrument-number query. The live mapping recorded that TexasFile's clerk search
  // returns EMPTY for a county instrument number (`searchTexasFile` ignores it too), so emitting one
  // only wastes a login + navigation per run. Deeds are found by owner name + volume/page; the
  // instrument still rides on the DiscoveryTarget for the free clerk search + result matching.
  return inputs;
}

/**
 * The TexasFile PLAT searches to run for a target (plan 1.3). A subdivision name is the usual key — the
 * one the run's CAD adapter already extracts — plus, when the operator gave a plat cabinet/slide as a
 * volume/page, a pinpoint query. Empty when the parcel is not in a named subdivision AND has no cabinet
 * reference (Phase 3 adds the abstract/survey path for those).
 */
export function buildTexasFilePlatInputs(target: DiscoveryTarget, county: string): TexasFilePlatInput[] {
  const inputs: TexasFilePlatInput[] = [];
  if (target.subdivision?.trim()) inputs.push({ county, subdivision: target.subdivision.trim() });
  for (const bp of target.bookPages ?? []) {
    const vol = (bp.volume ?? bp.book ?? '').trim();
    const pg = (bp.page ?? '').trim();
    // A cabinet/slide reference is a plat coordinate; try it as a plat query too (cheap, de-duped by GUID).
    if (vol && pg) inputs.push({ county, volume: vol, page: pg });
  }
  return inputs;
}

function dedupeByGuid(results: TexasFileResult[]): TexasFileResult[] {
  const seen = new Set<string>();
  return results.filter((r) => (r.guid && !seen.has(r.guid) ? (seen.add(r.guid), true) : false));
}

/**
 * Build the `SourceSearchFn` the engine calls per source. TexasFile → live search (all the target's
 * queries, de-duped, mapped to paid manifest entries); any free source → the run's known-free documents.
 */
export function makeSourceSearch(cfg: LiveSearchConfig): SourceSearchFn {
  const log = cfg.log ?? (() => {});
  const search = cfg.texasFileSearch ?? ((input: TexasFileBuyInput) => searchTexasFileDocuments(input));
  const platSearch = cfg.texasFilePlatSearch ?? ((input: TexasFilePlatInput) => searchTexasFilePlatsDocuments(input));

  return async (source: AcquisitionSource, target: DiscoveryTarget): Promise<ManifestEntry[]> => {
    if (source.source.id === 'texasfile') {
      if (!cfg.texasfileEnabled) return [];
      // 1) The deed/clerk records (name / vol-page).
      const inputs = buildTexasFileSearchInputs(target, cfg.county);
      const all: TexasFileResult[] = [];
      for (const input of inputs) {
        try {
          all.push(...(await search(input)));
        } catch (e) {
          log(`TexasFile search failed for one query: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      const deedEntries = dedupeByGuid(all).map((r) => texasFileResultToManifest(r, cfg.county));
      // 2) The PLAT records (plan 1.3) — the gap the 1401 North East St run exposed. A subdivision (or a
      //    cabinet/slide reference) drives a plat search the deed search never covered; plats are $10 flat.
      const platInputs = buildTexasFilePlatInputs(target, cfg.county);
      const platResults: TexasFileResult[] = [];
      for (const input of platInputs) {
        try {
          platResults.push(...(await platSearch(input)));
        } catch (e) {
          log(`TexasFile plat search failed for one query: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      const platEntries = dedupeByGuid(platResults).map((r) => texasFilePlatResultToManifest(r, cfg.county));
      const entries = [...deedEntries, ...platEntries];
      if (entries.length === 0 && inputs.length === 0 && platInputs.length === 0) return [];
      log(`TexasFile: ${deedEntries.length} deed doc(s) across ${inputs.length} quer(y/ies) + ${platEntries.length} plat(s) across ${platInputs.length} quer(y/ies).`);
      return entries;
    }
    // Free source — the run already knows what the free clerk holds (CAD deed history).
    return cfg.knownFreeDocuments ?? [];
  };
}
