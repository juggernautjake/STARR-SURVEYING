// worker/src/chain-of-title/chain-errands.ts — running the errands the gap list writes (plan R14).
//
// ── WHAT WAS LEFT ───────────────────────────────────────────────────────────────────────────────
//
// R14 shipped in three pieces and this is the last one.
//
//   chain-gaps.ts    says what the chain cites but does not contain — "the 1974 deed recites
//                    Volume 412, Page 88, which is not in this chain. Pull it."
//   chain-walker.ts  goes back to the clerk BY NAME: search the grantor as grantee, take the best
//                    match, repeat.
//   here             goes back to the clerk BY CITATION — the errands the gap list already wrote.
//
// The distinction matters because the two searches have completely different error profiles. A name
// search is a guess that needs scoring, disambiguation and a conservative "stop rather than pick
// wrong" rule, because the wrong link builds a chain for somebody else's land. A citation search is
// not a guess at all: the deed itself told us the volume and page. There is nothing to disambiguate,
// so no scoring appears in this file — and if a citation search returns two documents, that is a
// fact about the county's index rather than an ambiguity for us to resolve.
//
// ── THE FAILURE THIS FILE EXISTS TO AVOID ───────────────────────────────────────────────────────
//
// Several adapters deliberately THROW on `searchByVolumePage` rather than returning `[]`:
//
//     USLandRecords  "Book/volume/page search is NOT implemented — the portal's Book Search tab
//                     has not been driven. A missing capability, not an empty result."
//     Tyler Eagle    "The search form has no legal-description field … This is a missing
//                     capability, not an empty result."
//
// Those messages exist because a previous version of this platform turned exactly that throw into an
// empty array. Wrapping these calls in a `try { … } catch { return [] }` would undo all of it, and
// the damage is specific: the packet would say *"Volume 412, Page 88 — not found"* about a deed that
// is sitting in the courthouse, indexed, findable by anyone who walks in. The surveyor stops looking.
//
// So an errand has FIVE outcomes, not two, and only one of them is "we searched and it is not
// there":
//
//     resolved            found it
//     not_found           searched the county's index by that citation; it is not there
//     capability_missing  this county's portal cannot be searched that way AT ALL
//     search_failed       the search itself broke — network, session, timeout
//     skipped_budget      we ran out of searches before reaching it
//
// The last three are all still errands. `not_found` is the only one that is evidence about the land,
// and even it is evidence about the ONLINE index rather than about the record.

import type { ChainGap } from './chain-gaps.js';
import type { WalkCandidate } from './chain-walker.js';

// ── Turning gaps into errands ───────────────────────────────────────────────────────────────────

export interface Errand {
  /** Normalised, so the same citation written two ways is run once. */
  key: string;
  /** As the deed wrote it — what a person would search on at the courthouse. */
  raw: string;
  kind: 'volume_page' | 'instrument_number';
  /** Parsed for `volume_page`, so an adapter can be called without re-reading the prose. */
  volume?: string;
  page?: string;
  /** Parsed for `instrument_number`. */
  instrument?: string;
  /** Every link that cited it. Plural because several deeds commonly recite one ancestor, and the
   *  count is a signal — a citation three deeds agree on is worth more of the budget. */
  citedIn: string[];
}

/** `Volume 412, Page 88` → volume 412, page 88. Same shapes `citedInstruments` recognises. */
const VOL_PAGE_PARSE = /\b(?:vol(?:ume)?|book|bk)\.?\s*(\d{1,5})\s*,?\s*(?:pg|page|p)\.?\s*(\d{1,5})\b/i;
const INSTRUMENT_PARSE = /(\d{2,4}[-/]?\d{3,})/;

/** Read a raw citation back into the fields an adapter needs.
 *
 *  Returns null when it cannot be parsed. That is not a silent drop — `errandsFromGaps` keeps the
 *  gap, and `runErrands` reports it as unrunnable rather than as searched-and-absent. A citation we
 *  could not parse is still an errand for a human. */
export function parseCitation(raw: string): Pick<Errand, 'kind' | 'volume' | 'page' | 'instrument' | 'key'> | null {
  const vp = VOL_PAGE_PARSE.exec(raw);
  if (vp) {
    const volume = String(Number(vp[1]));
    const page = String(Number(vp[2]));
    return { kind: 'volume_page', volume, page, key: `VOL${volume}PG${page}` };
  }
  const inst = INSTRUMENT_PARSE.exec(raw);
  if (inst) {
    const instrument = inst[1]!;
    return { kind: 'instrument_number', instrument, key: instrument.replace(/[^0-9]/g, '') };
  }
  return null;
}

/** The worklist: every unfollowed citation, deduped, with its citing deeds merged.
 *
 *  Only `unfollowed_citation` gaps become errands. A `broken_link` names no instrument to fetch —
 *  it needs an index search for a conveyance nobody has cited, which is `walkBack`'s job — and an
 *  `undated_link` is a document we already hold, needing a date read off its image rather than
 *  another search. Running those here would spend the budget on searches that cannot succeed. */
export function errandsFromGaps(gaps: ChainGap[]): { errands: Errand[]; unparseable: ChainGap[] } {
  const byKey = new Map<string, Errand>();
  const unparseable: ChainGap[] = [];

  for (const gap of gaps) {
    if (gap.kind !== 'unfollowed_citation' || !gap.missing) continue;
    const parsed = parseCitation(gap.missing);
    if (!parsed) {
      unparseable.push(gap);
      continue;
    }
    const existing = byKey.get(parsed.key);
    if (existing) {
      if (!existing.citedIn.includes(gap.citedIn)) existing.citedIn.push(gap.citedIn);
      continue;
    }
    byKey.set(parsed.key, { ...parsed, raw: gap.missing, citedIn: [gap.citedIn] });
  }

  // Most-cited first: a citation three deeds agree on is more likely to be a real ancestor than one
  // appearing once, and it is the ordering that matters when the budget runs out mid-list.
  const errands = [...byKey.values()].sort((a, b) => b.citedIn.length - a.citedIn.length);
  return { errands, unparseable };
}

// ── Running them ────────────────────────────────────────────────────────────────────────────────

export type ErrandStatus =
  | 'resolved'
  | 'not_found'
  | 'capability_missing'
  | 'search_failed'
  | 'skipped_budget'
  | 'unparseable';

export interface ErrandOutcome {
  errand: Errand;
  status: ErrandStatus;
  /** The instrument, when we got it. Several when the index returned several. */
  found: WalkCandidate[];
  statement: string;
  nextStep: string;
}

export interface ErrandDeps {
  /** Search the clerk by book/volume and page. Absent means this county offers no such search. */
  fetchByVolumePage?: (volume: string, page: string) => Promise<WalkCandidate[]>;
  /** Search the clerk by instrument number. Absent means this county offers no such search. */
  fetchByInstrument?: (instrument: string) => Promise<WalkCandidate[]>;
  log?: (msg: string) => void;
}

export interface ErrandLimits {
  /** Hard ceiling on searches. Each errand is one clerk search and often a document fetch. */
  maxSearches?: number;
  /** Checked before each search; false stops the run. Lets the run budget (R5) end it. */
  mayContinue?: () => boolean;
}

export const DEFAULT_MAX_ERRANDS = 10;

/** Does this error mean "this county cannot be searched that way", or "the search broke"?
 *
 *  The adapters phrase the first deliberately — "a missing capability, not an empty result" — and
 *  the distinction survives into the packet, because one is a permanent fact about the county's
 *  portal and the other is worth retrying. Anything unrecognised is treated as a BREAKAGE rather
 *  than as a missing capability: a transient network error misfiled as "this county does not offer
 *  book/page search" would permanently stop us asking. */
export function classifyFetchError(message: string): 'capability_missing' | 'search_failed' {
  return /missing capability|not implemented|is not offered|no legal-description search|publishes no|has no .*(?:field|search)|not supported/i.test(message)
    ? 'capability_missing'
    : 'search_failed';
}

/** Go and get the instruments the chain says it is missing.
 *
 *  Never throws: an errand that fails is an outcome, because the caller's job is to report the whole
 *  worklist and one broken search must not discard the other nine results. */
export async function runErrands(
  errands: Errand[],
  deps: ErrandDeps,
  limits: ErrandLimits = {},
  unparseable: ChainGap[] = [],
): Promise<ErrandRunResult> {
  const maxSearches = limits.maxSearches ?? DEFAULT_MAX_ERRANDS;
  const log = deps.log ?? (() => {});
  const outcomes: ErrandOutcome[] = [];
  let searches = 0;

  for (const gap of unparseable) {
    outcomes.push({
      errand: { key: '', raw: gap.missing ?? '', kind: 'instrument_number', citedIn: [gap.citedIn] },
      status: 'unparseable',
      found: [],
      statement: `${gap.citedIn} recites "${gap.missing}", which could not be read as a volume/page or instrument number.`,
      nextStep: `Read the citation off the document image and search for it by hand — this is NOT a statement that the instrument does not exist.`,
    });
  }

  for (const errand of errands) {
    const cited = errand.citedIn.join(', ');

    if (searches >= maxSearches || (limits.mayContinue && !limits.mayContinue())) {
      outcomes.push({
        errand,
        status: 'skipped_budget',
        found: [],
        statement: `${errand.raw} (cited by ${cited}) was not searched — the chain search budget was used up first.`,
        nextStep: `Re-run with a larger chain budget, or pull ${errand.raw} by hand.`,
      });
      continue;
    }

    const fetcher =
      errand.kind === 'volume_page'
        ? deps.fetchByVolumePage && (() => deps.fetchByVolumePage!(errand.volume!, errand.page!))
        : deps.fetchByInstrument && (() => deps.fetchByInstrument!(errand.instrument!));

    if (!fetcher) {
      // No search of this kind is wired for this county. NOT "not found".
      outcomes.push({
        errand,
        status: 'capability_missing',
        found: [],
        statement:
          `${errand.raw} (cited by ${cited}) could not be searched: this county's portal offers no ` +
          `${errand.kind === 'volume_page' ? 'book/volume/page' : 'instrument number'} search. ` +
          `This says nothing about whether the instrument exists.`,
        nextStep: `Pull ${errand.raw} at the courthouse, or from a platform that indexes it.`,
      });
      continue;
    }

    searches++;
    try {
      const found = await fetcher();
      if (found.length === 0) {
        outcomes.push({
          errand,
          status: 'not_found',
          found: [],
          statement:
            `${errand.raw} (cited by ${cited}) was searched in the county's ONLINE index and is not ` +
            `there. The citation may be misread, or the instrument may predate what is online.`,
          nextStep: `Check the citation against the document image, then look for ${errand.raw} in the paper index.`,
        });
        log(`[Chain errands] ${errand.raw}: not in the online index`);
        continue;
      }

      outcomes.push({
        errand,
        status: 'resolved',
        found,
        statement:
          found.length === 1
            ? `${errand.raw} (cited by ${cited}) → ${found[0]!.instrument}, ${found[0]!.recordingDate.slice(0, 10)}, ` +
              `${found[0]!.grantor} to ${found[0]!.grantee}.`
            : `${errand.raw} (cited by ${cited}) returned ${found.length} instruments. The citation is ` +
              `not unique in this county's index — all ${found.length} are recorded rather than one being chosen.`,
        nextStep: found.length === 1 ? '' : `Read all ${found.length} and keep the one this chain actually descends from.`,
      });
      log(`[Chain errands] ${errand.raw}: ${found.length} result(s)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = classifyFetchError(message);
      outcomes.push({
        errand,
        status,
        found: [],
        statement:
          status === 'capability_missing'
            ? `${errand.raw} (cited by ${cited}) could not be searched — ${message} This says nothing about whether the instrument exists.`
            : `${errand.raw} (cited by ${cited}) — the search itself failed: ${message}`,
        nextStep:
          status === 'capability_missing'
            ? `Pull ${errand.raw} at the courthouse, or from a platform that indexes it.`
            : `Retry; if it keeps failing, pull ${errand.raw} by hand.`,
      });
      log(`[Chain errands] ${errand.raw}: ${status} — ${message}`);
    }
  }

  return summariseErrands(outcomes, searches);
}

/** A retrieved instrument, carrying the citation it was retrieved FOR.
 *
 *  The pairing has to survive: the citation `VOL412PG88` comes back as instrument `V412P88`, and
 *  re-deriving one from the other is exactly the round trip that does not hold. Keeping the key here
 *  is what lets the chain record that this gap is closed. */
export interface ResolvedErrand {
  citationKey: string;
  citationRaw: string;
  link: WalkCandidate;
}

export interface ErrandRunResult {
  outcomes: ErrandOutcome[];
  /** Instruments actually retrieved, each with the citation that asked for it. */
  resolved: ResolvedErrand[];
  searchesMade: number;
  /** Counts by status, so a report does not have to re-derive them. */
  counts: Record<ErrandStatus, number>;
  /** One paragraph for the packet. */
  statement: string;
}

export function summariseErrands(outcomes: ErrandOutcome[], searchesMade: number): ErrandRunResult {
  const counts: Record<ErrandStatus, number> = {
    resolved: 0, not_found: 0, capability_missing: 0, search_failed: 0, skipped_budget: 0, unparseable: 0,
  };
  for (const o of outcomes) counts[o.status]++;

  // Only unambiguous retrievals join the chain. A citation matching several instruments is reported
  // for a person to choose between — picking one would build the chain for possibly the wrong land.
  const resolved: ResolvedErrand[] = outcomes
    .filter((o) => o.status === 'resolved' && o.found.length === 1)
    .map((o) => ({ citationKey: o.errand.key, citationRaw: o.errand.raw, link: o.found[0]! }));

  const parts: string[] = [];
  if (outcomes.length === 0) {
    parts.push('The chain cites no instruments it does not already contain.');
  } else {
    parts.push(`${outcomes.length} cited instrument(s) were missing from the chain; ${counts.resolved} retrieved.`);
  }

  // The unresolved reasons are listed separately and never totalled together, because they mean
  // different things and a single "8 unresolved" would flatten the one distinction that matters.
  if (counts.not_found > 0) {
    parts.push(`${counts.not_found} searched and NOT in the county's online index — check the citation, then the paper index.`);
  }
  if (counts.capability_missing > 0) {
    parts.push(
      `${counts.capability_missing} could NOT BE SEARCHED — this county's portal offers no such search. ` +
        `These are unknown, not absent.`,
    );
  }
  if (counts.search_failed > 0) {
    parts.push(`${counts.search_failed} failed with a search error and are worth retrying.`);
  }
  if (counts.skipped_budget > 0) {
    parts.push(`${counts.skipped_budget} were never reached — the search budget ran out first.`);
  }
  if (counts.unparseable > 0) {
    parts.push(`${counts.unparseable} had a citation that could not be read; pull them by hand.`);
  }

  const multi = outcomes.filter((o) => o.status === 'resolved' && o.found.length > 1).length;
  if (multi > 0) {
    parts.push(`${multi} citation(s) matched more than one instrument and were left for a person to choose between.`);
  }

  return { outcomes, resolved, searchesMade, counts, statement: parts.join(' ') };
}
