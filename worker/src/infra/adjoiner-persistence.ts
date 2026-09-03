// worker/src/infra/adjoiner-persistence.ts — the neighbours, written down (plan R31).
//
// ── WHAT THIS CLOSES ────────────────────────────────────────────────────────────────────────────
//
// `AdjacentResearchOrchestrator` already identifies the neighbours, searches for their deeds and
// plats, and writes a cross-validation report to `/tmp/analysis/<project>/`. That file is wiped with
// the container, invisible to the app, and one blob rather than a row per neighbour — so a reviewer
// could not list them, could not see which had recent surveys on file, and could not ask for one to
// be researched properly.
//
// This writes the register the app reads (`research_adjoiners`, seed 539). It runs at the END of the
// adjacent phase, from data already gathered — it does not fetch anything, so it cannot slow a run
// or fail it.
//
// ── THE SURVEY DATE IS THE FIELD THE OWNER ASKED FOR ────────────────────────────────────────────
//
// A neighbour with a recent survey on file is worth more than five with nothing, because a survey is
// a professional's measured opinion of a line this property shares. It is taken from the newest PLAT
// or SURVEY document found for that neighbour — and left NULL when there is none, because "we found
// no survey" and "this tract has never been surveyed" are different answers and only one of them is
// a finding.

export interface AdjoinerDocumentLite {
  type: string;
  date: string;
  instrumentNumber?: string;
}

export interface AdjoinerInput {
  owner: string;
  parcelId?: string | null;
  situsAddress?: string | null;
  legalDescription?: string | null;
  acreage?: number | null;
  identifiedBy: 'deed_call' | 'gis_adjacency' | 'plat_lot' | 'manual';
  adjoinsWhere?: string | null;
  matchConfidence?: number | null;
  documents: AdjoinerDocumentLite[];
  researchStatus?: string;
  /** The page a reviewer can open to see this neighbour at its source (seed 630). */
  sourceUrl?: string | null;
}

export interface AdjoinerRecord {
  research_project_id: string;
  parcel_id: string | null;
  owner_name: string | null;
  situs_address: string | null;
  legal_description: string | null;
  acreage: number | null;
  identified_by: string;
  adjoins_where: string | null;
  match_confidence: number | null;
  documents_found: number;
  last_survey_date: string | null;
  last_survey_source: string | null;
  notes: string | null;
  source_url: string | null;
}

/** Document types that count as a survey of the tract.
 *
 *  A DEED is not one. It describes a boundary somebody else measured, often decades earlier and
 *  often copied forward without re-measurement — treating it as a survey would make every neighbour
 *  look recently surveyed and destroy the signal the owner asked for. */
const SURVEY_TYPES = /\b(survey|plat|replat|amended[- ]plat|as[- ]built|boundary)\b/i;

/** The newest survey or plat on file for this neighbour, and where it came from.
 *
 *  Returns nulls when there is none. Callers must not substitute a deed date. */
export function newestSurvey(documents: AdjoinerDocumentLite[]): { date: string | null; source: string | null } {
  const surveys = documents
    .filter((d) => SURVEY_TYPES.test(d.type))
    .filter((d) => !Number.isNaN(Date.parse(d.date)))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  const newest = surveys[0];
  if (!newest) return { date: null, source: null };
  return {
    date: new Date(Date.parse(newest.date)).toISOString().slice(0, 10),
    source: newest.instrumentNumber ? `${newest.type} ${newest.instrumentNumber}` : newest.type,
  };
}

/** Turn what the adjacent phase gathered into rows the app can list. */
export function toRecords(projectId: string, inputs: AdjoinerInput[]): AdjoinerRecord[] {
  return inputs.map((a) => {
    const survey = newestSurvey(a.documents);
    return {
      research_project_id: projectId,
      parcel_id: a.parcelId?.trim() || null,
      // A neighbour with no name is still worth recording — the parcel id is how you find it later,
      // and dropping it would silently shrink the list a reviewer is choosing from.
      owner_name: a.owner?.trim() || null,
      situs_address: a.situsAddress?.trim() || null,
      legal_description: a.legalDescription?.trim() || null,
      acreage: a.acreage ?? null,
      identified_by: a.identifiedBy,
      adjoins_where: a.adjoinsWhere?.trim() || null,
      match_confidence: a.matchConfidence ?? null,
      documents_found: a.documents.length,
      last_survey_date: survey.date,
      last_survey_source: survey.source,
      source_url: a.sourceUrl?.trim() || null,
      notes: a.researchStatus && a.researchStatus !== 'complete'
        // Recorded, because "we could not find anything for this neighbour" is a fact about the
        // shallow pass rather than about the neighbour, and a reviewer deciding where to spend a run
        // needs to know which it is.
        ? `Shallow pass finished as "${a.researchStatus}" — the absence of documents here may be a retrieval gap.`
        : null,
    };
  });
}

export interface PersistResult {
  written: number;
  errors: string[];
}

/** Write the register.
 *
 *  Upsert on the same key as the unique index, so re-running a project updates its neighbours rather
 *  than duplicating them — and deliberately does NOT touch `depth`, `deep_request_id` or
 *  `requested_by`: a reviewer's decision to research a neighbour must survive a re-run of the
 *  subject property. Losing that would silently discard a queued run somebody paid for. */
export async function persistAdjoiners(
  supabase: unknown,
  projectId: string,
  inputs: AdjoinerInput[],
): Promise<PersistResult> {
  const records = toRecords(projectId, inputs);
  if (records.length === 0) return { written: 0, errors: [] };

  const db = supabase as {
    from: (t: string) => {
      upsert: (rows: unknown[], opts: { onConflict: string }) => Promise<{ error: { message: string } | null }>;
    };
  };

  // ── THE CONFLICT TARGET THAT DID NOT EXIST ─────────────────────────────────────────────────
  //
  // This named `parcel_id` and `owner_name`, and seed 539's unique index is on
  // `COALESCE(parcel_id, '')` and `COALESCE(owner_name, '')`. Postgres matches an inference target
  // against an index's EXPRESSIONS, so no index matched and every call raised 42P10 — "there is no
  // unique or exclusion constraint matching the ON CONFLICT specification".
  //
  // Not a duplicate-key warning. The whole statement failed, every time, so `research_adjoiners`
  // has never held a row — while `describePersist` below reported "0 neighbour(s) recorded" as
  // though the research had found none. A fact about our SQL, rendered as a finding about the
  // property, which is precisely what this register's own header warns against.
  //
  // Seed 628 adds `parcel_key` and `owner_key` — the same COALESCE, stored — so the deduplication
  // rule survives and the target is nameable.
  const { error } = await db.from('research_adjoiners').upsert(records, {
    onConflict: 'research_project_id,parcel_key,owner_key,identified_by',
  });

  if (error) return { written: 0, errors: [error.message] };
  return { written: records.length, errors: [] };
}

/** One line for the run log, so a run that identified nobody says so rather than being silent. */
export function describePersist(result: PersistResult, inputs: AdjoinerInput[]): string {
  if (result.errors.length > 0) {
    return `[Adjoiners] Could not write the neighbour register: ${result.errors.join('; ')}`;
  }
  if (inputs.length === 0) {
    return '[Adjoiners] No neighbouring properties were identified. That is a gap in this run, not a finding about the property.';
  }
  const withSurvey = inputs.filter((a) => newestSurvey(a.documents).date).length;
  return `[Adjoiners] ${result.written} neighbour(s) recorded, ${withSurvey} with a survey or plat on file.`;
}
