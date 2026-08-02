// worker/src/chain-of-title/chain-walker.ts — going back for the deeds we do not have (plan R14).
//
// ── WHAT R14 LEFT ───────────────────────────────────────────────────────────────────────────────
//
// R14 made the chain honest: it says why it stopped, and it lists the instruments it cites but does
// not contain. What it could not do is FETCH them — `traceChain()` walks only the documents already
// harvested, so `grantor_deed_not_found` was reported as a gap rather than closed.
//
// This is the walk. It takes the gap list as its worklist and goes back to the clerk: search the
// grantor as GRANTEE before the date we have, take the best match, extract its parties, repeat.
//
// ── WHY IT MUST STOP, AND SAY SO ────────────────────────────────────────────────────────────────
//
// Every iteration is a clerk search and usually a document fetch — minutes and, on a paid platform,
// money. A walk that runs until it finds nothing is a walk that spends the whole run budget on one
// property's 1890s history while the rest of the research does not happen. So it stops on a stated
// condition, every time, and the caller is told which one — the same discipline R5 applied to the
// run as a whole.
//
// ── THE LOOP THAT IS NOT A LOOP ─────────────────────────────────────────────────────────────────
//
// Chains genuinely revisit names: land goes into a trust and back out, a widow reconveys to herself
// and a new spouse, a company deeds to its own subsidiary. Stopping at the first repeated name would
// truncate real chains. Stopping only on a repeated INSTRUMENT is correct — the same instrument
// twice means we are going round.

export type WalkStop =
  | 'reached_earliest_available'
  | 'max_links'
  | 'no_match_found'
  | 'ambiguous_match'
  | 'budget_exhausted'
  | 'index_horizon'
  | 'circular_instrument';

export interface WalkCandidate {
  instrument: string;
  grantor: string;
  grantee: string;
  recordingDate: string;
  documentType?: string;
  /** Adapter's own confidence in the match, 0–1, when it offers one. */
  score?: number;
}

export interface WalkStep {
  /** Who we searched for, as grantee. */
  searchedFor: string;
  /** The date we searched before. */
  before: string;
  candidates: number;
  chosen: WalkCandidate | null;
  /** Why this one, or why none. Ends up in the packet beside the link. */
  reason: string;
}

export interface WalkResult {
  links: WalkCandidate[];
  steps: WalkStep[];
  stop: WalkStop;
  statement: string;
  /** What a person should do to take it further, or '' when it is genuinely finished. */
  nextStep: string;
  searchesMade: number;
}

export interface WalkLimits {
  /** Hard ceiling on links added by this walk. */
  maxLinks?: number;
  /** Hard ceiling on clerk searches, which is the real cost. */
  maxSearches?: number;
  /** Earliest year the county's index covers. Reaching it is a COMPLETE chain, not a failure. */
  indexBeginsYear?: number;
  /** Called before each search; false stops the walk. Lets the run budget (R5) end it. */
  mayContinue?: () => boolean;
}

export const DEFAULT_MAX_LINKS = 12;
export const DEFAULT_MAX_SEARCHES = 25;

/** Normalise a party name for comparison — same reasoning as R14's `namesOverlap`. */
function tokens(name: string): Set<string> {
  return new Set(
    name.toUpperCase().replace(/[^A-Z\s]/g, ' ').split(/\s+/)
      .filter((t) => t.length > 2 && !NOISE.has(t)),
  );
}
const NOISE = new Set([
  'AND', 'THE', 'WIFE', 'HUSBAND', 'ETUX', 'ETVIR', 'ETAL', 'JR', 'SR', 'III',
  'TRUST', 'TRUSTEE', 'ESTATE', 'LLC', 'INC', 'LTD', 'COMPANY', 'CORP',
  'FAMILY', 'LIVING', 'REVOCABLE', 'PROPERTIES', 'HOLDINGS', 'PARTNERS',
]);

/** Score how well a candidate answers "how did NAME acquire this?".
 *
 *  Deliberately conservative. A wrong link does not produce a slightly wrong chain — it produces a
 *  chain for somebody else's land, and every conclusion after it is about the wrong tract. */
export function scoreCandidate(candidate: WalkCandidate, seekingGrantee: string, before: string): number {
  const want = tokens(seekingGrantee);
  const got = tokens(candidate.grantee);
  if (want.size === 0 || got.size === 0) return 0;

  let shared = 0;
  for (const t of want) if (got.has(t)) shared++;
  if (shared === 0) return 0;

  // Fraction of the sought name matched, so "SMITH" matching "SMITH, JOHN A" scores lower than a
  // full match — a surname alone is not an identification.
  //
  // This is a NAME score only. Date is handled separately and deliberately: mixing the two produced
  // a scorer that called two deeds to the same person "ambiguous" merely because one was 5 years
  // before the subject deed and the other 25 — when in fact that is the normal case, and the answer
  // is the one immediately before, exactly as a surveyor would take it.
  let score = shared / want.size;

  // Must predate the deed it conveys into. A later instrument is a subsequent conveyance, not the
  // acquisition we are looking for.
  const cd = Date.parse(candidate.recordingDate);
  const bd = Date.parse(before);
  if (Number.isFinite(cd) && Number.isFinite(bd)) {
    if (cd >= bd) return 0;
  } else {
    // An undated candidate cannot be shown to precede anything, so it can never be a confident match.
    score *= 0.5;
  }

  if (candidate.documentType && /deed/i.test(candidate.documentType)) score = Math.min(1, score + 0.05);
  return score;
}

/** How much better the best candidate must be before we accept it.
 *
 *  Two plausible deeds for one name is the situation where guessing is worst: taking either builds a
 *  chain that looks complete and may be somebody else's land. Ambiguity stops the walk and asks. */
export const AMBIGUITY_MARGIN = 0.15;
/** Two-thirds of the sought name's distinctive tokens must match.
 *
 *  At 0.5 a bare surname clears the bar — "SMITH, WILLIAM T" would be accepted as the acquisition of
 *  "SMITH, JOHN A", and every link after it belongs to the wrong family. Two-thirds means a
 *  two-token name needs both tokens, which is the weakest match that is still an identification. */
export const MIN_ACCEPTABLE_SCORE = 0.66;

export interface Choice {
  chosen: WalkCandidate | null;
  reason: string;
  ambiguous: boolean;
}

export function chooseCandidate(
  candidates: WalkCandidate[],
  seekingGrantee: string,
  before: string,
): Choice {
  if (candidates.length === 0) {
    return { chosen: null, ambiguous: false, reason: 'No instrument was returned for that name and date range.' };
  }

  // Name match first, then date. The acquisition is the most recent conveyance INTO that party
  // before the deed we hold — a person who bought, sold and bought again has several, and the one
  // immediately before is the right one.
  const viable = candidates
    .map((c) => ({ c, s: scoreCandidate(c, seekingGrantee, before) }))
    .filter((x) => x.s >= MIN_ACCEPTABLE_SCORE)
    .sort((a, b) => {
      const byDate = Date.parse(b.c.recordingDate) - Date.parse(a.c.recordingDate);
      return Number.isFinite(byDate) && byDate !== 0 ? byDate : b.s - a.s;
    });

  if (viable.length === 0) {
    // An undated instrument cannot be shown to precede the deed we hold, so it can never be a
    // confident link. Saying that specifically beats "no good match" — it tells a person the record
    // may well be the right one and only its date is missing.
    const undated = candidates.filter((c) => !Number.isFinite(Date.parse(c.recordingDate))).length;
    return {
      chosen: null, ambiguous: false,
      reason:
        `${candidates.length} instrument(s) came back but none matches "${seekingGrantee}" well enough ` +
        'to build a chain on. A partial name match is not an identification.' +
        (undated > 0
          ? ` ${undated} of them carry no usable recording date, so they cannot be shown to precede this deed — read them by hand.`
          : ''),
    };
  }

  const best = viable[0]!;
  const runnerUp = viable[1];

  // Genuine ambiguity is not being able to tell WHICH PARTY, or which of two instruments recorded
  // the same day came first. Two deeds to one person years apart are not ambiguous.
  const sameDay = runnerUp && best.c.recordingDate.slice(0, 10) === runnerUp.c.recordingDate.slice(0, 10);
  if (runnerUp && sameDay && Math.abs(best.s - runnerUp.s) < AMBIGUITY_MARGIN) {
    return {
      chosen: null, ambiguous: true,
      reason:
        `${best.c.instrument} and ${runnerUp.c.instrument} both match "${seekingGrantee}" and cannot be ` +
        'ordered by date. Taking either would build a chain that looks complete and may be for ' +
        "somebody else's land — a person has to read both.",
    };
  }

  const alsoSeen = viable.length > 1
    ? ` (${viable.length - 1} earlier conveyance(s) to the same party were passed over as predecessors, not this acquisition.)`
    : '';

  return {
    chosen: best.c, ambiguous: false,
    reason:
      `${best.c.instrument} (${best.c.recordingDate.slice(0, 10)}) conveys to "${best.c.grantee}", ` +
      `matching "${seekingGrantee}" — the most recent conveyance into that party before this deed.${alsoSeen}`,
  };
}

export interface WalkDeps {
  /** Search the clerk for instruments conveying TO `grantee`, recorded before `before`. */
  searchAsGrantee: (grantee: string, before: string) => Promise<WalkCandidate[]>;
  log?: (msg: string) => void;
}

/** Walk backwards from a known link until a stated condition stops it. */
export async function walkBack(
  from: { grantor: string; recordingDate: string },
  deps: WalkDeps,
  limits: WalkLimits = {},
): Promise<WalkResult> {
  const maxLinks = limits.maxLinks ?? DEFAULT_MAX_LINKS;
  const maxSearches = limits.maxSearches ?? DEFAULT_MAX_SEARCHES;
  const log = deps.log ?? (() => {});

  const links: WalkCandidate[] = [];
  const steps: WalkStep[] = [];
  const seenInstruments = new Set<string>();

  let seeking = from.grantor;
  let before = from.recordingDate;
  let searches = 0;
  let stop: WalkStop = 'max_links';

  while (links.length < maxLinks) {
    if (searches >= maxSearches) { stop = 'budget_exhausted'; break; }
    if (limits.mayContinue && !limits.mayContinue()) { stop = 'budget_exhausted'; break; }
    if (!seeking.trim()) { stop = 'reached_earliest_available'; break; }

    // Reaching the index horizon is a COMPLETE chain — the record genuinely ends there.
    const beforeYear = new Date(Date.parse(before)).getUTCFullYear();
    if (limits.indexBeginsYear && Number.isFinite(beforeYear) && beforeYear <= limits.indexBeginsYear) {
      stop = 'index_horizon';
      break;
    }

    searches++;
    const candidates = await deps.searchAsGrantee(seeking, before);
    const choice = chooseCandidate(candidates, seeking, before);
    steps.push({ searchedFor: seeking, before, candidates: candidates.length, chosen: choice.chosen, reason: choice.reason });
    log(`[Chain] ${seeking} before ${before.slice(0, 10)}: ${choice.reason}`);

    if (!choice.chosen) { stop = choice.ambiguous ? 'ambiguous_match' : 'no_match_found'; break; }

    // The same instrument twice means we are going round. Repeated NAMES are normal — land goes into
    // a trust and back out — so only the instrument ends the walk.
    if (seenInstruments.has(choice.chosen.instrument)) { stop = 'circular_instrument'; break; }
    seenInstruments.add(choice.chosen.instrument);

    links.push(choice.chosen);
    seeking = choice.chosen.grantor;
    before = choice.chosen.recordingDate;
  }

  return { links, steps, stop, searchesMade: searches, ...describeStop(stop, links, limits) };
}

function describeStop(
  stop: WalkStop,
  links: WalkCandidate[],
  limits: WalkLimits,
): { statement: string; nextStep: string } {
  const n = links.length;
  const oldest = links[n - 1];
  const oldestDate = oldest?.recordingDate?.slice(0, 10) ?? 'an unknown date';

  switch (stop) {
    case 'index_horizon':
      return {
        statement: `Walked back ${n} further link(s) to ${oldestDate}, which reaches the earliest year the county's index covers (${limits.indexBeginsYear}). The chain is complete as far as the record goes.`,
        nextStep: '',
      };
    case 'reached_earliest_available':
      return {
        statement: `Walked back ${n} further link(s) to ${oldestDate}; the earliest instrument names no grantor, which is usually the sovereignty grant.`,
        nextStep: '',
      };
    case 'no_match_found':
      return {
        statement: `Walked back ${n} further link(s) to ${oldestDate}. The clerk's index returned nothing usable for the next grantor.`,
        nextStep: 'Search the index by hand — the name may be indexed under a spelling the search did not try.',
      };
    case 'ambiguous_match':
      return {
        statement: `Walked back ${n} further link(s) to ${oldestDate}, then stopped: two instruments matched the next grantor about equally well.`,
        // The one case where continuing automatically is worse than stopping.
        nextStep: 'Read both instruments and pick the right one. Guessing here builds a chain for somebody else\'s land.',
      };
    case 'circular_instrument':
      return {
        statement: `Walked back ${n} further link(s) to ${oldestDate}, then reached an instrument already in the chain.`,
        nextStep: 'Read that instrument directly — a correction deed or a transfer into a trust usually recites the true predecessor.',
      };
    case 'budget_exhausted':
      return {
        statement: `Walked back ${n} further link(s) to ${oldestDate} before the search budget for this run was used up. The record continues.`,
        nextStep: 'Re-run with a larger chain budget to continue from there.',
      };
    case 'max_links':
    default:
      return {
        statement: `Walked back ${n} link(s) to ${oldestDate} and stopped at the configured depth limit, NOT at the end of the record.`,
        nextStep: 'Raise the chain depth limit and re-run to continue.',
      };
  }
}
