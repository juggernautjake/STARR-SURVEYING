// worker/src/services/original-survey.ts — the original land grant, from the state that issued it.
//
// RESEARCH_SOURCES_AND_PAID_ACCOUNTS S-6d. `GloLandGrantAdapter` was built in S-6, tested, and
// **driven live against 1,523 Bell grants** — and had no caller. S-6b found that the run was
// reporting `original_survey` as covered while nothing had ever queried GLO; S-6c stopped the run
// claiming it. This is the other half: making the claim true.
//
// ── THE REASON THIS IS A SERVICE AND NOT A LINE IN THE ORCHESTRATOR ─────────────────────────────
//
// The adapter's own docstring carries the warning that decides everything here: *"At least one
// criterion beyond county is strongly advised: Bell alone returns 1,523 grants, and GLO pages
// them."*
//
// So a county-only search is not a weaker search — it is a **useless one that costs 60 seconds of
// browser time and returns a phone book.** Worse, it would return `truncated: true` and a page of
// unrelated grants, which is exactly the shape of a result somebody downstream would treat as "the
// original survey for this property". A wrong grant attached to a survey is worse than no grant.
//
// This module therefore **refuses to search without an identifying criterion**, and says so in the
// same voice the rest of this platform uses for a gap: what was not done, and why, rather than an
// empty list that reads as "nothing was found".

import { GloLandGrantAdapter } from '../adapters/glo-land-grant-adapter.js';
import type { GloSearchReport, LandGrant } from '../adapters/glo-land-grant-adapter.js';

export interface OriginalSurveyInput {
  county: string;
  /** From the legal description or the appraisal record — "A-123", "123". */
  abstractNumber?: string | null;
  /** "John Smith Survey". Used as the grantee when no abstract is known: the survey is almost
   *  always named after the original grantee, which is the one field GLO indexes by name. */
  surveyName?: string | null;
}

export type OriginalSurveyOutcome =
  /** Searched, and GLO returned grants. */
  | 'found'
  /** Searched, and GLO has no matching grant. A real answer, not a failure. */
  | 'none'
  /** Not searched — nothing identified the property beyond its county. */
  | 'not_identified'
  /** Searched and the attempt failed. Distinct from `none`, which would claim the state has no
   *  record of a survey that may well exist. */
  | 'error';

export interface OriginalSurveyResult {
  outcome: OriginalSurveyOutcome;
  grants: LandGrant[];
  /** One sentence a surveyor can act on, always present, never an empty-list-shaped lie. */
  statement: string;
  /** GLO's own summary when a search ran. */
  searchReport?: GloSearchReport;
}

/** Strip the "A-" that appraisal districts print and GLO does not index. */
function normaliseAbstract(raw: string): string {
  return raw.trim().replace(/^A[-\s]*/i, '').trim();
}

/**
 * The grantee name GLO would hold, from a survey name.
 *
 * "JOHN SMITH SURVEY, ABSTRACT 123" → "JOHN SMITH". Returns null when nothing is left, because
 * searching GLO for an empty string is a county-only search wearing a criterion.
 */
export function granteeFromSurveyName(surveyName: string): string | null {
  const cleaned = surveyName
    .replace(/\b(abstract|abs\.?)\s*(no\.?|number|#)?\s*[-A]?\d+\b/gi, '')
    .replace(/\bsurvey\b/gi, '')
    .replace(/\bA-?\d+\b/g, '')
    .replace(/[,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 3 ? cleaned : null;
}

/**
 * Look up the original land grant, if we know enough to ask a useful question.
 *
 * Never throws. A research run that has already gathered deeds, plats and GIS must not be lost
 * because a free supplementary source timed out — but the failure is REPORTED rather than folded
 * into "no grant found", because those two mean opposite things to a surveyor tracing a boundary
 * back to its senior call.
 */
export async function findOriginalSurvey(input: OriginalSurveyInput): Promise<OriginalSurveyResult> {
  const county = input.county?.trim();
  if (!county) {
    return {
      outcome: 'not_identified',
      grants: [],
      statement: 'Original survey not searched: no county was resolved for this property.',
    };
  }

  const abstractNumber = input.abstractNumber ? normaliseAbstract(input.abstractNumber) : null;
  const originalGrantee = !abstractNumber && input.surveyName
    ? granteeFromSurveyName(input.surveyName)
    : null;

  if (!abstractNumber && !originalGrantee) {
    // The refusal this module exists for. See the header: a county-only GLO search returns the
    // county's entire grant index, truncated, and anything downstream would be reading noise.
    return {
      outcome: 'not_identified',
      grants: [],
      statement:
        `Original survey not searched: this property has no abstract number and no usable survey ` +
        `name, and a ${county} County search on its own returns the whole grant index rather than ` +
        `this property's grant. This is a gap in what we know about the property, NOT a finding ` +
        `that the State has no record of its original survey.`,
    };
  }

  const adapter = new GloLandGrantAdapter();
  try {
    const report = await adapter.search({
      county,
      ...(abstractNumber ? { abstractNumber } : {}),
      ...(originalGrantee ? { originalGrantee } : {}),
    });
    const asked = abstractNumber ? `abstract ${abstractNumber}` : `grantee "${originalGrantee}"`;
    if (report.grants.length === 0) {
      return {
        outcome: 'none',
        grants: [],
        searchReport: report,
        statement: `Texas GLO holds no land grant matching ${asked} in ${county} County.`,
        };
    }
    return {
      outcome: 'found',
      grants: report.grants,
      searchReport: report,
      statement: `Texas GLO: ${report.statement} (searched by ${asked})`,
    };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return {
      outcome: 'error',
      grants: [],
      // NOT 'none'. Reporting a failed lookup as "no grant exists" would tell a surveyor the State
      // has no record of a survey it may well hold — the single most damaging thing this module
      // could say.
      statement: `Texas GLO could not be searched (${why}). The original survey is UNKNOWN, not absent.`,
    };
  } finally {
    await adapter.destroySession().catch(() => undefined);
  }
}
