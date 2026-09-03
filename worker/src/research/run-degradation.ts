// worker/src/research/run-degradation.ts — a run without its primary source says so.
//
// ── THE 163-MINUTE RUN THAT NEVER MENTIONED ITS OWN BLIND SPOT ──────────────────────────────────
//
// On 2026-09-03 `esearch.bellcad.org` was unreachable for the whole of a Bell County run. The
// appraisal record is what confirms WHICH parcel a run is about — its owner of record, its legal
// description, its acreage. Without it:
//
//   · no property record, so nothing to check findings against;
//   · no coordinates from the parcel, and the geocoders missed the rural FM address too;
//   · so no aerial, no GIS, no flood zone, no ROW — all skipped for want of a location;
//   · and the run fell through to searching the clerk index by OWNER NAME for 163 minutes.
//
// It found 16 deeds that way, and they are probably the right deeds. Probably is the problem. Every
// one was matched on a person's name with no appraisal record to confirm the person owns THIS
// parcel, and the finished report said nothing about that. This codebase already refuses to guess a
// county from a city because "a wrong county routes to the wrong clerk and returns a confident
// report about somebody else's land". Attributing sixteen deeds to a parcel we could not confirm is
// the same hazard arriving by a different road.
//
// ── WHY THIS DOES NOT SIMPLY STOP THE RUN ───────────────────────────────────────────────────────
//
// The obvious response — "primary source dead, abort" — was checked against the actual run and is
// wrong. That project carried `parcel_id: 42156`. A parcel ID identifies one parcel exactly; it is
// the strongest input the system takes. Stopping would have discarded 16 real deeds over an outage
// that did not prevent the run from knowing which property it was about.
//
// So the response is graded by what is actually known, not by what failed:
//
//   ok                 the appraisal record answered. Nothing to say.
//   degraded           it did not, but a parcel ID or coordinates still identify the property.
//                      Continue — and mark every finding as unconfirmed against the record, because
//                      that is exactly what it is.
//   cannot_attribute   it did not, and NOTHING else identifies the property either. Stop. Anything
//                      found now would be attached to a parcel nobody can name, which is worse than
//                      an empty result — an empty result is honest.

export type DegradationLevel = 'ok' | 'degraded' | 'cannot_attribute';

export interface DegradationInput {
  /** Did the county appraisal district answer at all? */
  cadReachable: boolean;
  /** Did it return a property record for this search? Reachable-but-no-match is a real finding. */
  cadRecordFound: boolean;
  /** Latitude AND longitude resolved, from any source. */
  hasCoordinates: boolean;
  /** The operator's or the CAD's parcel identifier. */
  parcelId?: string | null;
  /** The county, for the sentences. */
  county?: string | null;
}

export interface Degradation {
  level: DegradationLevel;
  /** Should the run keep going? */
  canContinue: boolean;
  /** One line for the run card and the report header. Empty when `ok`. */
  headline: string;
  /** What it means for the findings, in the operator's terms. Empty when `ok`. */
  detail: string;
}

const clean = (v: string | null | undefined): string => (v ?? '').trim();

/**
 * How much of this run can be trusted, given what answered and what did not.
 *
 * Pure and injected rather than reaching for the dead-host registry itself, so the decision is
 * testable without a network and so the caller stays responsible for saying what it observed.
 */
export function assessDegradation(input: DegradationInput): Degradation {
  const county = clean(input.county) || 'the county';
  const parcel = clean(input.parcelId);

  // The appraisal record answered. Whether it found a match is a different question, and one the
  // rest of the pipeline already reports.
  if (input.cadReachable && input.cadRecordFound) {
    return { level: 'ok', canContinue: true, headline: '', detail: '' };
  }

  const identified = Boolean(parcel) || input.hasCoordinates;

  if (!identified) {
    return {
      level: 'cannot_attribute',
      canContinue: false,
      headline: `Stopped early: nothing identifies this property.`,
      detail:
        `The ${county} appraisal district ${input.cadReachable ? 'returned no record' : 'could not be reached'}, ` +
        `no coordinates could be resolved, and no Property ID was supplied. Nothing left in this run ` +
        `could be attached to a specific parcel — a document found by owner name would be attributed ` +
        `to a property nobody can name. Add a Property ID, or try again when the appraisal district ` +
        `is back up.`,
    };
  }

  return {
    level: 'degraded',
    canContinue: true,
    headline: `Ran without the ${county} appraisal record — findings are unconfirmed.`,
    detail:
      `The ${county} appraisal district ${input.cadReachable ? 'returned no record for this search' : 'could not be reached'}, ` +
      `so there was nothing to check results against. The run continued because ` +
      `${parcel ? `Property ID ${parcel} identifies the parcel` : 'coordinates identify the parcel'}, ` +
      `and what it found is real — but no document here has been confirmed against the appraisal ` +
      `record's owner, legal description or acreage. Re-run when the district is reachable to ` +
      `confirm them.` +
      (input.hasCoordinates ? '' : ' Aerial, GIS and flood-zone lookups were skipped for want of coordinates.'),
  };
}

/** The one-line badge for the run card. Null when there is nothing to flag. */
export function degradationBadge(d: Degradation): string | null {
  switch (d.level) {
    case 'ok': return null;
    case 'degraded': return 'Unconfirmed — no appraisal record';
    case 'cannot_attribute': return 'Stopped — property could not be identified';
  }
}
