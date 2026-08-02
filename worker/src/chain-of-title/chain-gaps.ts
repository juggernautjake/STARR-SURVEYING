// worker/src/chain-of-title/chain-gaps.ts — why the chain stopped, and what is missing (plan R14).
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
//
// `traceChain()` walks backward and ends on `if (!link) break`. Four completely different endings
// produce the identical result — a chain of N links and nothing else:
//
//   • we reached the sovereignty grant and there IS nothing earlier
//   • we hit `maxDepth`, which defaults to 5 and silently truncates a 1900s chain
//   • the grantor's deed exists at the courthouse but was never harvested
//   • the current owner has no deed in the harvested set at all
//
// Only the first is a complete chain. The other three are a chain with a hole in it, and a surveyor
// reading the packet cannot tell which they are holding. That is this repo's recurring defect —
// rendering an unknown as an answer — applied to the document that decides where a boundary is.
//
// ── AND WHAT IS MISSING ─────────────────────────────────────────────────────────────────────────
//
// Deeds cite their own predecessors: "being the same land conveyed by deed recorded in Volume 412,
// Page 88". Every such citation that is NOT in the chain is a gap with a call number on it — not a
// vague "the chain may be incomplete" but "go pull Vol 412 Pg 88". That list is also the worklist
// for the exhaustive backward walk, which is why it is worth extracting before that walk exists.

import type { ChainLink } from '../types/expansion.js';

// ── Why the walk ended ──────────────────────────────────────────────────────────────────────────

export type TerminationReason =
  /** The grantor of the earliest link is the sovereign, or the clerk's index does not go back
   *  further. The chain is complete as far as the record allows. */
  | 'reached_earliest_available'
  /** Hit `maxDepth`. There is more chain; we chose not to walk it. */
  | 'max_depth'
  /** The next deed was not among the harvested documents. It may well exist at the courthouse. */
  | 'grantor_deed_not_found'
  /** No deed naming the current owner as grantee was found at all — the chain never started. */
  | 'no_starting_deed'
  /** A deed named the same party as grantor and grantee, so the walk would loop. */
  | 'circular_reference';

export interface Termination {
  reason: TerminationReason;
  /** Is the chain complete, as far as the public record goes? Only ONE reason means yes. */
  complete: boolean;
  /** A sentence for the packet, in the language a surveyor would use. */
  statement: string;
  /** What would extend it. Empty when the chain is complete. */
  nextStep: string;
}

/** The earliest date the county's grantor/grantee index covers, when we know it. Passing it turns a
 *  vague "we found nothing earlier" into "the clerk's index begins in 1902" — which is the
 *  difference between an unfinished job and a finished one. */
export interface IndexHorizon {
  countyName?: string;
  indexBeginsYear?: number;
}

export function describeTermination(
  reason: TerminationReason,
  chain: ChainLink[],
  horizon: IndexHorizon = {},
): Termination {
  const n = chain.length;
  const oldest = chain[n - 1];
  const oldestDate = oldest?.recordingDate ? oldest.recordingDate.slice(0, 10) : 'an unknown date';
  const where = horizon.countyName ? `${horizon.countyName} County` : 'the county';

  switch (reason) {
    case 'reached_earliest_available': {
      const horizonNote = horizon.indexBeginsYear
        ? ` ${where}'s grantor/grantee index begins in ${horizon.indexBeginsYear}.`
        : '';
      return {
        reason,
        complete: true,
        statement: `Chain traced to ${oldestDate} (${n} link${n === 1 ? '' : 's'}); no earlier instrument is available.${horizonNote}`,
        nextStep: '',
      };
    }
    case 'max_depth':
      return {
        reason,
        complete: false,
        // Named explicitly as OUR limit, not the record's. The distinction is the whole point.
        statement: `Chain stopped at ${n} links because the configured depth limit was reached, NOT because the record ends. Earlier conveyances exist.`,
        nextStep: `Raise the depth limit and re-run to continue back from ${oldest?.grantor || 'the earliest grantor'}.`,
      };
    case 'grantor_deed_not_found':
      return {
        reason,
        complete: false,
        statement:
          `Chain stopped at ${oldestDate}: no harvested deed shows how ${oldest?.grantor || 'the earliest grantor'} ` +
          `acquired the property. The instrument likely exists in ${where}'s records but was not retrieved.`,
        nextStep: `Search ${where}'s grantor/grantee index for ${oldest?.grantor || 'that grantor'} as GRANTEE, before ${oldestDate}.`,
      };
    case 'no_starting_deed':
      return {
        reason,
        complete: false,
        // The most dangerous one to render as an empty chain, which reads as "nothing to report".
        statement:
          'No chain could be built: no harvested deed names the current owner as grantee. ' +
          'This is a retrieval failure, not a finding about the property.',
        nextStep: `Confirm the owner name against the appraisal roll and search ${where}'s index for it as GRANTEE.`,
      };
    case 'circular_reference':
      return {
        reason,
        complete: false,
        statement:
          `Chain stopped at ${oldestDate}: a deed names the same party as both grantor and grantee ` +
          '(commonly a correction deed or a transfer into a trust), so the backward walk could not continue.',
        nextStep: 'Read that instrument directly — the true predecessor is usually recited in its body.',
      };
  }
}

// ── Prior-instrument citations ──────────────────────────────────────────────────────────────────

export interface InstrumentCitation {
  /** Normalised for comparison: `VOL412PG88`, `201912345`. */
  key: string;
  /** As the deed wrote it, for a human to search on. */
  raw: string;
  kind: 'volume_page' | 'instrument_number';
}

/** Volume-and-page: `Volume 412, Page 88`, `Vol. 412 Pg 88`, `Book 5, Page 100`.
 *  The comma and the period are both optional because deeds are typed by people. */
const VOL_PAGE = /\b(?:vol(?:ume)?|book|bk)\.?\s*(\d{1,5})\s*,?\s*(?:pg|page|p)\.?\s*(\d{1,5})\b/gi;

/** Instrument numbers: `Instrument No. 2019-12345`, `Doc# 201912345`, `Clerk's File No. 2019/12345`.
 *  Anchored on the LABEL rather than on the number shape — a bare `2019-12345` in a legal
 *  description is as likely to be a date range or a lot number as a citation, and a wrong citation
 *  sends somebody to the courthouse for nothing. */
const INSTRUMENT_REF =
  /\b(?:instrument|inst|document|doc|file|clerk'?s?\s+file)\s*(?:no\.?|number|#)?\s*[:#]?\s*(\d{2,4}[-/]?\d{3,})\b/gi;

/** Pull every prior instrument a deed points at. */
export function citedInstruments(text: string | null | undefined): InstrumentCitation[] {
  if (!text) return [];
  const out = new Map<string, InstrumentCitation>();

  for (const m of text.matchAll(VOL_PAGE)) {
    const raw = m[0].trim();
    const key = `VOL${Number(m[1])}PG${Number(m[2])}`;
    if (!out.has(key)) out.set(key, { key, raw, kind: 'volume_page' });
  }
  for (const m of text.matchAll(INSTRUMENT_REF)) {
    const raw = m[0].trim();
    const key = m[1]!.replace(/[^0-9]/g, '');
    if (!out.has(key)) out.set(key, { key, raw, kind: 'instrument_number' });
  }
  return [...out.values()];
}

/** The same normalisation applied to a link's own instrument, so a citation can be matched against
 *  the chain. `Vol 412 Pg 88` and `412/88` and `V.412 P.88` must all land on one key. */
export function linkInstrumentKeys(link: ChainLink): string[] {
  const raw = (link.instrument ?? '').toUpperCase();
  const keys = [raw.replace(/[^A-Z0-9]/g, '')];
  const vp = raw.match(/(\d{1,5})\s*[^0-9A-Z]{1,4}\s*(\d{1,5})/);
  if (vp) keys.push(`VOL${Number(vp[1])}PG${Number(vp[2])}`);
  for (const c of citedInstruments(link.instrument)) keys.push(c.key);
  return keys.filter(Boolean);
}

// ── Gaps ────────────────────────────────────────────────────────────────────────────────────────

export type GapKind = 'unfollowed_citation' | 'broken_link' | 'undated_link';

export interface ChainGap {
  kind: GapKind;
  /** The instrument whose reading produced this gap. */
  citedIn: string;
  /** The missing instrument, when the deed named one. */
  missing?: string;
  statement: string;
  nextStep: string;
}

/** Everything the chain points at but does not contain.
 *
 *  Deliberately NOT a confidence score. "87% complete" is unusable; "Vol 412 Pg 88 is cited by the
 *  1974 deed and is not in this chain" is something a person can act on in an afternoon. */
export function findGaps(chain: ChainLink[]): ChainGap[] {
  const gaps: ChainGap[] = [];
  const present = new Set(chain.flatMap(linkInstrumentKeys));

  for (const link of chain) {
    const date = link.recordingDate ? link.recordingDate.slice(0, 10) : 'undated';

    for (const cite of citedInstruments(link.legalDescription)) {
      if (present.has(cite.key)) continue;
      gaps.push({
        kind: 'unfollowed_citation',
        citedIn: link.instrument,
        missing: cite.raw,
        statement: `${link.instrument} (${date}) recites ${cite.raw}, which is not in this chain.`,
        nextStep: `Pull ${cite.raw} and read it — it is the deed this one claims to come from.`,
      });
    }

    if (!link.recordingDate) {
      // An undated link cannot be ordered, so every conclusion drawn from the chain's SEQUENCE is
      // unsupported at that point. Worth saying rather than sorting it to the end and moving on.
      gaps.push({
        kind: 'undated_link',
        citedIn: link.instrument,
        statement: `${link.instrument} has no recording date, so its position in the chain is assumed rather than established.`,
        nextStep: 'Read the recording stamp from the document image and correct the date.',
      });
    }
  }

  // Consecutive links must join: the grantor of the newer deed is the grantee of the older one.
  // Where they do not, an unrecorded or unharvested conveyance sits between them.
  for (let i = 0; i < chain.length - 1; i++) {
    const newer = chain[i]!;
    const older = chain[i + 1]!;
    if (!newer.grantor || !older.grantee) continue;
    if (!namesOverlap(newer.grantor, older.grantee)) {
      gaps.push({
        kind: 'broken_link',
        citedIn: newer.instrument,
        statement:
          `${newer.instrument} is granted by "${newer.grantor}", but the preceding deed ` +
          `${older.instrument} conveyed TO "${older.grantee}". The chain does not join here.`,
        nextStep:
          `Search the index for a conveyance from "${older.grantee}" to "${newer.grantor}" — ` +
          'commonly a probate, a divorce decree, or a name change.',
      });
    }
  }

  return gaps;
}

/** Do two party names plausibly refer to the same person or entity?
 *
 *  Token overlap, not string equality: "SMITH, JOHN A" and "John A. Smith" and "John Smith and wife
 *  Mary Smith" are one grantee written three ways, and treating them as different parties would
 *  report a break in every chain we build. Erring toward "same" is right here — a missed break is
 *  found by the human reading the deeds, while a false break in every chain trains people to ignore
 *  the gap list entirely. */
export function namesOverlap(a: string, b: string): boolean {
  const tokens = (s: string) =>
    new Set(
      s
        .toUpperCase()
        .replace(/[^A-Z\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 2 && !NAME_NOISE.has(t)),
    );
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return true; // nothing to disagree about
  for (const t of ta) if (tb.has(t)) return true;
  return false;
}

/** Words that appear in half of all deeds and prove nothing about identity.
 *
 *  Entity boilerplate matters as much as the marital kind: "Smith Family Trust" and "Jones Family
 *  Trust" share FAMILY and TRUST and are different parties, so leaving those in would suppress a
 *  real break — the failure mode opposite to the one `namesOverlap` mainly guards against, and the
 *  more dangerous of the two because it hides a gap instead of inventing one. */
const NAME_NOISE = new Set([
  'AND', 'THE', 'WIFE', 'HUSBAND', 'ETUX', 'ETVIR', 'ETAL', 'JR', 'SR', 'III',
  'TRUST', 'TRUSTEE', 'ESTATE', 'LLC', 'INC', 'LTD', 'COMPANY', 'CORP',
  'FAMILY', 'LIVING', 'REVOCABLE', 'PROPERTIES', 'HOLDINGS', 'PARTNERS',
  'PARTNERSHIP', 'INVESTMENTS', 'ENTERPRISES',
]);

// ── The summary a person reads first ────────────────────────────────────────────────────────────

export interface ChainCompleteness {
  complete: boolean;
  linkCount: number;
  gapCount: number;
  headline: string;
}

/** One honest sentence. A packet that opens with "12 documents" says nothing; one that opens with
 *  "chain is INCOMPLETE — 3 gaps, earliest link 1974" tells a surveyor what they are holding. */
export function summariseChain(
  chain: ChainLink[],
  termination: Termination,
  gaps: ChainGap[],
): ChainCompleteness {
  const complete = termination.complete && gaps.length === 0;
  const oldest = chain[chain.length - 1]?.recordingDate?.slice(0, 4);

  const headline = complete
    ? `Chain complete: ${chain.length} link${chain.length === 1 ? '' : 's'} back to ${oldest ?? 'the earliest record'}.`
    : `Chain INCOMPLETE: ${chain.length} link${chain.length === 1 ? '' : 's'}` +
      (oldest ? ` back to ${oldest}` : '') +
      `, ${gaps.length} gap${gaps.length === 1 ? '' : 's'}. ${termination.statement}`;

  return { complete, linkCount: chain.length, gapCount: gaps.length, headline };
}
