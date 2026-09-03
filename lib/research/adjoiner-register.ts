// lib/research/adjoiner-register.ts — the neighbours, ranked by what they are worth (plan R31/R32).
//
// ── WHAT WAS MISSING ────────────────────────────────────────────────────────────────────────────
//
// `AdjacentResearchOrchestrator` already runs inside the pipeline and writes a cross-validation
// report to `/tmp`. That file is wiped with the container, invisible to the app, and one blob rather
// than a row per neighbour — so a reviewer could not list the neighbours, could not see which had
// recent surveys on file, and could not ask for one to be researched properly.
//
// ── THREE CLAIMS, NOT ONE ───────────────────────────────────────────────────────────────────────
//
// A neighbour named in a DEED CALL, one found by GIS ADJACENCY, and one taken from a PLAT LOT are
// three different claims with three different failure modes:
//
//   deed_call     — names who the adjoiner was ON THE DAY THE DEED WAS WRITTEN, often decades ago
//                   and often no longer the owner. Excellent evidence of the LINE, weak evidence of
//                   the current owner.
//   gis_adjacency — current, but only as good as the county's parcel polygons, which are drafting
//                   aids and routinely off by feet. Good for "who is next door", useless for a line.
//   plat_lot      — exact where a plat governs (R15), and silent everywhere else.
//
// Flattening them into "adjoiner" loses the reason to trust or distrust each one, which is the whole
// basis on which a reviewer decides where to spend a 25-minute run.

export type IdentifiedBy = 'deed_call' | 'gis_adjacency' | 'plat_lot' | 'manual';
export type AdjoinerDepth = 'shallow' | 'requested' | 'researched' | 'declined';

export interface AdjoinerRow {
  id: string;
  parcel_id: string | null;
  owner_name: string | null;
  situs_address: string | null;
  acreage: number | string | null;
  identified_by: IdentifiedBy;
  adjoins_where: string | null;
  match_confidence: number | string | null;
  documents_found: number;
  /** NULL means unknown, NOT "never surveyed". */
  last_survey_date: string | null;
  last_survey_source: string | null;
  notes: string | null;
  /** The neighbour's page at its source — the appraisal district for a GIS-identified parcel.
   *  Null for rows written before seed 630 and for deed-call neighbours with no parcel. */
  source_url?: string | null;
  depth: AdjoinerDepth;
  deep_request_id: string | null;
  deep_project_id: string | null;
  requested_by: string | null;
  requested_at: string | null;
}

export const IDENTIFIED_BY_MEANING: Record<IdentifiedBy, string> = {
  deed_call:
    'Named in a deed call — strong evidence of where the line is, weak evidence of who owns it now: ' +
    'the name is whoever adjoined on the day that deed was written.',
  gis_adjacency:
    "Found by parcel adjacency in the county's GIS — current ownership, but county parcel polygons " +
    'are drafting aids and are routinely off by feet. Good for who is next door, not for a boundary.',
  plat_lot:
    'Taken from the governing plat — exact where the plat controls, and silent about anything it does not cover.',
  manual:
    'Added by hand by somebody who knew it belonged here — as good as the reason they had, which is ' +
    'worth asking for before treating it like a record.',
};

// ── Survey recency ──────────────────────────────────────────────────────────────────────────────

export interface SurveyRecency {
  /** Years since the survey, or null when we do not know there is one. */
  years: number | null;
  label: string;
  /** Rough usefulness of this neighbour's survey to the subject property. */
  band: 'recent' | 'dated' | 'old' | 'unknown';
  detail: string;
}

/** How much a neighbour's survey is worth.
 *
 *  The owner's reasoning, made explicit: a neighbour with a recent survey on file is likely to yield
 *  better and more current information, because a survey is a professional's measured opinion of a
 *  line this property shares. The bands are deliberately coarse — the difference between 2023 and
 *  2024 does not change what a reviewer does, but the difference between 2023 and 1978 does. */
export function surveyRecency(lastSurveyDate: string | null, today: Date): SurveyRecency {
  if (!lastSurveyDate) {
    return {
      years: null, band: 'unknown', label: 'no survey found',
      // The distinction that matters: we looked and found nothing recorded, which is not the same as
      // the tract never having been surveyed.
      detail: 'No survey or plat was found on file for this neighbour. That is not evidence that none exists.',
    };
  }
  const years = Math.max(0, (today.getTime() - Date.parse(lastSurveyDate)) / (365.25 * 24 * 3600 * 1000));
  const y = Math.floor(years);

  if (y <= 10) {
    return {
      years: y, band: 'recent', label: `surveyed ${lastSurveyDate.slice(0, 4)}`,
      detail: `A survey from ${lastSurveyDate.slice(0, 4)} is recent enough that its monuments are probably still findable and its basis of bearing is probably compatible with modern work.`,
    };
  }
  if (y <= 30) {
    return {
      years: y, band: 'dated', label: `surveyed ${lastSurveyDate.slice(0, 4)}`,
      detail: `A survey from ${lastSurveyDate.slice(0, 4)} is still useful, but check its basis of bearing before holding it against modern coordinates.`,
    };
  }
  return {
    years: y, band: 'old', label: `surveyed ${lastSurveyDate.slice(0, 4)}`,
    detail: `A survey from ${lastSurveyDate.slice(0, 4)} predates most modern control. Useful as evidence of the line as then monumented, not as a coordinate source.`,
  };
}

// ── Ranking ─────────────────────────────────────────────────────────────────────────────────────

export interface RankedAdjoiner {
  row: AdjoinerRow;
  recency: SurveyRecency;
  /** Higher first. */
  score: number;
  /** One line a reviewer can act on. */
  description: string;
  /** Why it is worth (or not worth) spending a run on. */
  worthDeepening: string;
}

/** Order the neighbours by how likely they are to help.
 *
 *  Deliberately NOT by proximity or by acreage: the question a reviewer is answering is "where
 *  should I spend a 25-minute run", and the answer is driven by what is on file, not by geometry. A
 *  neighbour with a 2023 survey outranks a bigger one with nothing. */
export function rankAdjoiners(rows: AdjoinerRow[], today: Date): RankedAdjoiner[] {
  return rows
    .map((row) => {
      const recency = surveyRecency(row.last_survey_date, today);

      // A recent survey is the strongest signal by far — it is the reason the owner asked for this
      // field at all.
      let score =
        recency.band === 'recent' ? 100 :
        recency.band === 'dated' ? 60 :
        recency.band === 'old' ? 30 : 0;

      // Documents already found mean a deeper run has somewhere to start.
      score += Math.min(row.documents_found, 10) * 2;
      // A deed call is evidence about the shared LINE, which is what a boundary retracement needs.
      if (row.identified_by === 'deed_call') score += 15;
      if (row.identified_by === 'plat_lot') score += 10;
      // Already done, or explicitly passed over — sink both, for different reasons.
      if (row.depth === 'researched') score -= 50;
      if (row.depth === 'declined') score -= 80;

      const acreage = row.acreage != null ? `${Number(row.acreage).toFixed(2)} ac` : 'acreage unknown';
      const who = row.owner_name || 'owner not recorded';
      const where = row.adjoins_where ? ` on the ${row.adjoins_where}` : '';
      const description =
        `${who}${where} — ${acreage}` +
        `${row.parcel_id ? `, parcel ${row.parcel_id}` : ', no parcel id'}` +
        `. ${row.documents_found} document(s) found. ${recency.label}.`;

      const worthDeepening =
        row.depth === 'researched' ? 'Already researched in full.'
        : row.depth === 'requested' ? 'A full run has been requested and is queued or running.'
        : row.depth === 'declined' ? 'Passed over by a reviewer.'
        : recency.band === 'recent'
          ? 'Worth deepening: a recent survey on this neighbour is a measured opinion of a line you share.'
          : row.identified_by === 'deed_call'
            ? 'Worth considering: this neighbour is named in the deed calls, so its own deed describes the same line from the other side.'
            : row.documents_found > 0
              ? 'Some documents were found; a full run would read them properly.'
              : 'Nothing found on the shallow pass. A full run may still turn something up, but there is no signal here yet.';

      return { row, recency, score, description, worthDeepening };
    })
    .sort((a, b) => b.score - a.score);
}

export interface AdjoinerSummary {
  total: number;
  withRecentSurvey: number;
  deepened: number;
  headline: string;
}

/** Leads with the neighbours worth spending money on, because that is the decision this list exists
 *  to support — not with the total, which is just a count of who is next door. */
export function summariseAdjoiners(ranked: RankedAdjoiner[]): AdjoinerSummary {
  const withRecentSurvey = ranked.filter((r) => r.recency.band === 'recent').length;
  const deepened = ranked.filter((r) => r.row.depth === 'researched' || r.row.depth === 'requested').length;

  const headline = ranked.length === 0
    ? 'No neighbouring properties have been identified yet. That is a gap in the research, not a finding about the property.'
    : withRecentSurvey > 0
      ? `${ranked.length} neighbour(s) identified — ${withRecentSurvey} with a survey on file from the last ten years. Those are the ones most likely to be worth a full run.`
      : `${ranked.length} neighbour(s) identified, none with a recent survey on file. Deepening one is a judgement call rather than an obvious win.`;

  return { total: ranked.length, withRecentSurvey, deepened, headline };
}
