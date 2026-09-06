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
/**
 * Pull the original survey name + abstract number out of a metes-and-bounds legal description (plan 3),
 * e.g. "A0488 WILLIAM HARTRICK SURVEY, 12.358 ACRES" → { surveyName: 'WILLIAM HARTRICK SURVEY',
 * abstractNumber: '488' }. Returns empty for a subdivision legal ("LOT 5, WINNIE MAE ADDITION"), which
 * the subdivision path already handles. Pure, so it is unit-tested without a browser.
 */
export function extractSurveyAbstract(legalDescription?: string | null): { surveyName?: string; abstractNumber?: string } {
  const s = (legalDescription ?? '').toUpperCase();
  if (!s.trim()) return {};
  const out: { surveyName?: string; abstractNumber?: string } = {};
  // Abstract: "ABSTRACT 488", "ABST 488", "A-488", "A0488".
  const abs = s.match(/\bABSTRACT\s*(?:NO\.?\s*)?(\d{1,5})\b/) || s.match(/\bABST\.?\s*(\d{1,5})\b/) || s.match(/\bA[-\s]?0*(\d{2,5})\b/);
  if (abs) out.abstractNumber = abs[1];
  // Survey: a name immediately before "SURVEY" (letters, spaces, &, .), trimmed.
  const surv = s.match(/([A-Z][A-Z&.\s]{2,40}?SURVEY)\b/);
  if (surv) out.surveyName = surv[1].replace(/^A0*\d+\s+/, '').replace(/\s+/g, ' ').trim();
  return out;
}

export function buildDiscoveryTarget(params: {
  county: string;
  ownerName?: string | null;
  subdivision?: string | null;
  lot?: string | null;
  /** The parcel's legal description — for a non-subdivision tract, the survey + abstract are pulled from it. */
  legalDescription?: string | null;
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
  // Plan 3 — only bother extracting a survey/abstract when the parcel is NOT in a named subdivision;
  // the subdivision path already covers the residential case and is the stronger key.
  const sa = params.subdivision?.trim() ? {} : extractSurveyAbstract(params.legalDescription);
  return {
    county: params.county,
    ownerName: params.ownerName?.trim() || undefined,
    subdivision: params.subdivision?.trim() || undefined,
    lot: params.lot?.trim() || undefined,
    ...(sa.surveyName ? { surveyName: sa.surveyName } : {}),
    ...(sa.abstractNumber ? { abstractNumber: sa.abstractNumber } : {}),
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
  // Plan 3 — a non-subdivision tract: search the plat "Subdivision or Name" field by the SURVEY name, so a
  // recorded map/survey filed for the tract is found even though it is not in a named subdivision. Skipped
  // when it duplicates the subdivision query.
  const survey = target.surveyName?.trim();
  if (survey && survey.toUpperCase() !== target.subdivision?.trim().toUpperCase()) {
    inputs.push({ county, subdivision: survey });
  }
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
      // Which query found each plat — the buy needs it to re-open a plat search session by GUID.
      const platQueryFor = new Map<string, string | undefined>();
      for (const input of platInputs) {
        try {
          const found = await platSearch(input);
          for (const r of found) if (!platQueryFor.has(r.guid)) platQueryFor.set(r.guid, input.subdivision);
          platResults.push(...found);
        } catch (e) {
          log(`TexasFile plat search failed for one query: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      const platEntries = dedupeByGuid(platResults).map((r) => texasFilePlatResultToManifest(r, cfg.county, platQueryFor.get(r.guid)));
      const entries = [...deedEntries, ...platEntries];
      if (entries.length === 0 && inputs.length === 0 && platInputs.length === 0) return [];
      log(`TexasFile: ${deedEntries.length} deed doc(s) across ${inputs.length} quer(y/ies) + ${platEntries.length} plat(s) across ${platInputs.length} quer(y/ies).`);
      return entries;
    }
    // Free source — the run already knows what the free clerk holds (CAD deed history).
    return cfg.knownFreeDocuments ?? [];
  };
}
