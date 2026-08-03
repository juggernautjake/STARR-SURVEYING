// worker/src/chain-of-title/chain-search-deps.ts — giving the chain walk something to search with.
//
// R14 shipped in four pieces: `chain-gaps` says what is missing, `chain-walker` goes back to the
// clerk by NAME, `chain-errands` goes back by CITATION, and `chain-builder` orchestrates all three.
// Every one of them is real, tested, and reached from `worker/src/index.ts`.
//
// And the whole backward re-query was **inert**, because the builder takes its searches as optional
// constructor dependencies and the only caller passed **none of them**:
//
//     new ChainOfTitleBuilder(maxDepth || 5, ANALYSIS_DIR)     // ← no opts argument at all
//
// So `searchAsGrantee` was undefined, `errandDeps` was undefined, and every run walked only the
// documents already harvested — exactly the behaviour R14 existed to replace. The modules each
// degrade honestly when their dependency is absent (that is why nothing failed and no test caught
// it), which is what made a completely inert feature look like a working one.
//
// This file is the missing argument.
//
// ── WHAT IT MUST NOT DO ─────────────────────────────────────────────────────────────────────────
//
// Several adapters deliberately THROW on `searchByVolumePage` rather than returning `[]`:
//
//     USLandRecords  "Book/volume/page search is NOT implemented — the portal's Book Search tab has
//                     not been driven. A missing capability, not an empty result."
//
// `chain-errands` depends on that distinction: it has five outcomes, and `capability_missing` is a
// different fact from `not_found`. Wrapping these calls in `try { … } catch { return [] }` would
// collapse the two and put *"Volume 412, Page 88 — not found"* in a packet about a deed sitting in
// the courthouse, indexed and findable by anyone who walks in. The surveyor stops looking.
//
// So **the throw is passed through on purpose.** Not an oversight, and not something to tidy up.

import type { ClerkAdapter, ClerkDocumentResult } from '../adapters/clerk-adapter.js';
import type { WalkCandidate } from './chain-walker.js';

/** The dependencies `ChainOfTitleBuilder` takes and the standalone endpoint never supplied. */
export interface ChainSearchDeps {
  searchAsGrantee?: (grantee: string, before: string) => Promise<WalkCandidate[]>;
  fetchByVolumePage?: (volume: string, page: string) => Promise<WalkCandidate[]>;
  fetchByInstrument?: (instrument: string) => Promise<WalkCandidate[]>;
}

/** A clerk result as the walk needs it.
 *
 *  Grantor and grantee are joined rather than truncated to the first name. A deed from three
 *  siblings to one buyer names three grantors, and dropping two of them breaks the next link of the
 *  walk — the following deed's grantee will be a name this one no longer mentions, and the chain
 *  reports a broken link that is only broken because we discarded the evidence.
 *
 *  No `score` is set. The adapters do not offer one, and inventing a confidence here would be
 *  scoring our own guess: `chain-walker` has its own matching rules and is the right place for it. */
export function toWalkCandidate(r: ClerkDocumentResult): WalkCandidate {
  return {
    instrument: r.instrumentNumber || (r.volumePage ? `Vol ${r.volumePage.volume} Pg ${r.volumePage.page}` : ''),
    grantor: (r.grantors ?? []).join('; '),
    grantee: (r.grantees ?? []).join('; '),
    recordingDate: r.recordingDate ?? '',
    documentType: r.documentType,
  };
}

/** Build the search dependencies from a county's clerk adapter.
 *
 *  Every method is optional on purpose. An adapter that cannot do one of these searches should
 *  surface that as its own error — see the file header — so the dependency is supplied whenever the
 *  adapter exists and the *adapter* decides what it can do. Omitting a dependency here because we
 *  guessed the portal could not do it would be us answering a question the portal answers. */
export function searchDepsFromAdapter(
  adapter: ClerkAdapter | null | undefined,
  opts: { maxResults?: number } = {},
): ChainSearchDeps {
  if (!adapter) return {};
  const maxResults = opts.maxResults ?? 25;

  return {
    // `before` is a date: the deed that conveyed TO this person was recorded before the deed that
    // conveyed FROM them. Passing it as `dateTo` is what keeps the walk going backwards rather than
    // finding the same conveyance again.
    searchAsGrantee: async (grantee, before) => {
      const rows = await adapter.searchByGranteeName(grantee, { dateTo: before, maxResults });
      return rows.map(toWalkCandidate);
    },
    fetchByVolumePage: async (volume, page) => {
      const rows = await adapter.searchByVolumePage(volume, page);
      return rows.map(toWalkCandidate);
    },
    fetchByInstrument: async (instrument) => {
      const rows = await adapter.searchByInstrumentNumber(instrument);
      return rows.map(toWalkCandidate);
    },
  };
}
