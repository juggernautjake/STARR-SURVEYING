/**
 * Does this index row belong to THIS parcel?
 *
 * ── WHY A NAME SEARCH NEEDS THIS AND A BOOK/PAGE SEARCH DOES NOT ────────────────────────────────
 *
 * A book/page citation names one recorded document, so anything it returns is about this parcel by
 * construction. A NAME search names a person or a company, and companies own more than one thing.
 *
 * Williamson's clerk answered "AMH 2015-2 BORROWER LLC" with ten documents on 2026-09-21. Two were
 * the parcel's own vesting deed and its deed of trust. The rest were the same landlord's other
 * houses:
 *
 *     LOT 20, BLOCK M, HUTTO PARKE SECTION 3
 *     LOT 20, BLOCK B, GEORGETOWN CROSSING PHASE 1
 *     LOT 7,  BLOCK F, MALLARD PARK, PHASE 2
 *
 * Filing those against a SOUTH CREEK parcel would put three other people's houses in a survey
 * report — worse than missing the deed, because it looks like evidence.
 *
 * ── THE RULE, AND WHY IT IS DELIBERATELY TIMID ──────────────────────────────────────────────────
 *
 * A row is dropped only when its legal description NAMES A SUBDIVISION THAT IS NOT OURS. A row
 * with no legal description is KEPT, because a portfolio conveyance that moves two hundred houses
 * in one instrument carries no single description — and that is exactly the shape of the 2015 deed
 * that vests the current owner. Keeping an occasional extra is recoverable; silently dropping the
 * controlling deed is not.
 *
 * Matching is by token prefix rather than equality because this index abbreviates without any
 * system at all. One subdivision, four spellings, all live:
 *
 *     SOUTH CREEK SEC 16 AMENDED   (the appraisal district)
 *     SOUTH CK 16                  SOUTHCREEK S-16A AMND        SOUTHCK 16
 */

/**
 * Words that describe a parcel's position rather than name its subdivision.
 *
 * These carry no identity: every legal description in the county has some of them, so leaving them
 * in would make every row match every parcel.
 */
const POSITION_WORDS = new Set([
  'LOT', 'LOTS', 'LT', 'LTS', 'BLOCK', 'BLK', 'BK', 'SEC', 'SECTION', 'PHASE', 'PH', 'UNIT',
  'AMENDED', 'AMND', 'AMD', 'AMEND', 'SUB', 'SUBD', 'SUBDIVISION', 'ADDITION', 'ADDN', 'ADD',
  'REPLAT', 'RESUB', 'RESUBDIVISION', 'THE', 'OF', 'AND', 'AC', 'ACRE', 'ACRES', 'TRACT', 'TR',
  'PT', 'PART', 'ABST', 'ABSTRACT', 'NO', 'EXEMPT', 'CAB', 'CABINET', 'SLIDE', 'PG', 'PAGE',
]);

/**
 * The words in a legal description that actually name a place.
 *
 * Anything containing a digit is discarded: those are lot numbers, section numbers and the
 * county's internal parcel codes (`000F02280010`), none of which identify a subdivision, and all
 * of which would match across unrelated parcels.
 */
export function placeTokens(legal: string): string[] {
  return (legal || '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length >= 3)
    .filter((t) => !/\d/.test(t))
    .filter((t) => !POSITION_WORDS.has(t));
}

/** Two names for the same place, allowing for this index's abbreviations. */
function sharePrefix(a: string, b: string, n = 4): boolean {
  if (a === b) return true;
  const len = Math.min(a.length, b.length);
  if (len < n) return false;
  return a.slice(0, n) === b.slice(0, n);
}

export interface ParcelMatch {
  keep: boolean;
  /** Plain-language reason, written for a run log a surveyor may read. */
  why: string;
}

/**
 * Decide whether a name-search row can be about this parcel.
 *
 * `parcelLegal` is the appraisal district's legal description — the authority on which subdivision
 * this is. `rowLegal` is whatever the clerk's index row carried, which is frequently nothing.
 */
export function rowCouldBeThisParcel(
  rowLegal: string | null | undefined,
  parcelLegal: string | null | undefined,
): ParcelMatch {
  const ours = placeTokens(parcelLegal ?? '');
  if (ours.length === 0) {
    return {
      keep: true,
      why: 'the appraisal district gives no subdivision to compare against, so nothing can be ruled out',
    };
  }

  const theirs = placeTokens(rowLegal ?? '');
  if (theirs.length === 0) {
    return {
      keep: true,
      why: 'the row names no subdivision — common on a portfolio conveyance, and not grounds to drop it',
    };
  }

  for (const t of theirs) {
    for (const o of ours) {
      if (sharePrefix(t, o)) return { keep: true, why: `"${t}" matches "${o}"` };
    }
  }

  return {
    keep: false,
    why: `names ${theirs.slice(0, 3).join(' ')}, which is not ${ours.slice(0, 3).join(' ')}`,
  };
}
