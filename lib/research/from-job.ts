// lib/research/from-job.ts — filling a research run in from the job that prompted it.
//
// Owner, 2026-09-20: "For the research button on the job page, it should inherit all of the
// information for the job such as any documents, address, property id, customer name, etc, and it
// should use that to auto fill info for the research run."
//
// ── WHY THIS IS A PURE MODULE AND NOT A FEW LINES IN THE ROUTE ──────────────────────────────────
//
// Because two of the mappings are not obvious, and both are the kind of wrong that never throws:
//
//   1. A JOB HAS NO OWNER. It has `client_name` — the person who hired us. On a boundary survey
//      that is usually the owner. On a survey ordered by a title company, a realtor, a developer or
//      a lender, it is emphatically not, and the firm already treats that distinction as important
//      enough to ask about on every phone call.
//
//      The research run feeds `owner_name` into a clerk grantor/grantee search. Handing it a
//      realtor's name produces an empty search, which is cheap. Handing it a realtor's name
//      WITHOUT SAYING SO produces a researcher who believes the property has no recorded
//      conveyance, which is not.
//
//      So the name travels, because it is the best signal available and usually right — and the
//      briefing says where it came from, in words, every time.
//
//   2. A JOB HAS NO PARCEL ID. `jobs` carries `abstract_number`, `lot_number` and `subdivision`.
//      Those are LEGAL DESCRIPTION parts. A parcel/property id is the county appraisal district's
//      own key and it is a different thing entirely. Writing an abstract number into `parcel_id`
//      would send the CAD lookup a number in the wrong namespace, and it would return nothing or,
//      worse, somebody else's parcel.
//
//      So `parcelId` comes back null and the legal parts are composed into a description summary
//      instead. The run asks for a parcel id; it does not get given a fake one.
//
// Everything in here is a pure function over a plain object, so both of those can be asserted in a
// test rather than discovered on a county website.

/** The subset of a `jobs` row this module reads. Loose on purpose — a caller passing the whole row
 *  is normal, and a null-heavy row is the common case rather than an error. */
export interface JobForResearch {
  id: string;
  job_number?: string | null;
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  county?: string | null;
  survey_type?: string | null;
  acreage?: number | string | null;
  lot_number?: string | null;
  subdivision?: string | null;
  abstract_number?: string | null;
  client_name?: string | null;
  client_company?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  project_id?: string | null;
  notes?: string | null;
  instructions?: string | null;
}

export interface ResearchPrefill {
  name: string;
  propertyAddress: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  county: string | null;
  /** Always null — see the header. A job does not carry one. */
  parcelId: null;
  /** The client, which is a best guess at the owner. `ownerIsAssumed` says so. */
  ownerName: string | null;
  /** True whenever `ownerName` came from the job's client field rather than a verified owner. */
  ownerIsAssumed: boolean;
  /** Composed from lot / block / subdivision / abstract, or null when the job says none of them. */
  legalDescriptionSummary: string | null;
  /** Prose for the operator and the AI briefing. States provenance, including the caveats above. */
  intakeNotes: string;
  projectId: string | null;
  jobIds: string[];
  /** Search hints — never treated as facts by the run. */
  supplemental: {
    ownerNames?: string[];
    subdivisions?: string[];
    abstracts?: string[];
    lots?: string[];
  };
  /** What could not be filled in, in words somebody can act on. Rendered on the confirm screen. */
  missing: string[];
}

const text = (v: unknown): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
};

/** "Lot 4, Block 2, Sunset Acres, A-123" — only the parts the job actually has. */
export function composeLegalSummary(job: JobForResearch): string | null {
  const bits: string[] = [];
  const lot = text(job.lot_number);
  const sub = text(job.subdivision);
  const abs = text(job.abstract_number);
  // "Lot 4" rather than "4" — a bare number in a legal description is unreadable, and the run
  // passes this string to a model that has to make sense of it.
  if (lot) bits.push(/^lot\b/i.test(lot) ? lot : `Lot ${lot}`);
  if (sub) bits.push(sub);
  if (abs) bits.push(/^a[-\s]?\d/i.test(abs) || /abstract/i.test(abs) ? abs : `Abstract ${abs}`);
  return bits.length ? bits.join(', ') : null;
}

/** A name for the research project. The address is what a person recognises; the job number is what
 *  makes two surveys on the same street distinguishable in a list. */
export function composeProjectName(job: JobForResearch): string {
  const addr = text(job.address);
  const num = text(job.job_number);
  const nm = text(job.name);
  const head = addr ?? nm ?? 'Property research';
  return num ? `${head} (Job ${num})` : head;
}

/**
 * Turn a job into everything a research run needs, and say what is still missing.
 *
 * `missing` is not decoration. A run started with no address and no parcel id will fail the
 * readiness gate in the pipeline route, and the operator should find that out on the job page
 * rather than three clicks later.
 */
export function researchPrefillFromJob(job: JobForResearch): ResearchPrefill {
  const address = text(job.address);
  const county = text(job.county);
  const city = text(job.city);
  const zip = text(job.zip);

  // The client is the owner more often than not, and is the only name a job carries.
  const client = text(job.client_name);
  const company = text(job.client_company);
  const ownerName = client ?? company;

  const legal = composeLegalSummary(job);

  const missing: string[] = [];
  if (!address) missing.push('a street address — the run needs one, or a parcel id, to start');
  if (!county) missing.push('a county — without it the run cannot pick a clerk or an appraisal district');
  // Always named, because a job never has one and the operator should be told rather than left to
  // wonder why the field is blank.
  missing.push('a parcel / property id — a job does not record one, so add it if you have it');
  if (!ownerName) missing.push('an owner or client name for the grantor/grantee search');

  const lines: string[] = [];
  lines.push(
    `Started from job ${text(job.job_number) ?? job.id}${text(job.name) ? ` — ${text(job.name)}` : ''}.`,
  );
  if (ownerName) {
    // The caveat from the header, in the briefing itself, every time.
    lines.push(
      `Name on the job: ${ownerName}${company && company !== ownerName ? ` (${company})` : ''}. ` +
      'This is the CLIENT who ordered the survey, which is not necessarily the record owner — it ' +
      'may be a title company, a realtor, a lender or a developer. Treat it as a lead for the ' +
      'grantor/grantee search, not as an established fact.',
    );
  }
  const surveyType = text(job.survey_type);
  const acreage = text(job.acreage);
  if (surveyType) lines.push(`Survey type: ${surveyType}.`);
  if (acreage) lines.push(`Acreage on the job: ${acreage}.`);
  if (legal) lines.push(`Legal description parts recorded on the job: ${legal}.`);
  const jobNotes = text(job.notes) ?? text(job.instructions);
  if (jobNotes) lines.push(`Notes from the job: ${jobNotes}`);

  const supplemental: ResearchPrefill['supplemental'] = {};
  if (ownerName) supplemental.ownerNames = [ownerName];
  if (text(job.subdivision)) supplemental.subdivisions = [text(job.subdivision)!];
  if (text(job.abstract_number)) supplemental.abstracts = [text(job.abstract_number)!];
  if (text(job.lot_number)) supplemental.lots = [text(job.lot_number)!];

  return {
    name: composeProjectName(job),
    propertyAddress: address,
    city,
    // Texas, like every other default in the research create route. This firm works in Texas and a
    // null state makes the county lookup ambiguous.
    state: text(job.state) ?? 'TX',
    zip,
    county,
    parcelId: null,
    ownerName,
    ownerIsAssumed: ownerName !== null,
    legalDescriptionSummary: legal,
    intakeNotes: lines.join('\n'),
    projectId: text(job.project_id),
    jobIds: [job.id],
    supplemental,
    missing,
  };
}

/**
 * The body to POST to `/api/admin/research`.
 *
 * Kept next to the prefill so the two cannot drift: a field added above and forgotten here would be
 * collected, displayed on the confirm screen, and then silently dropped on the way to the database.
 */
export function researchCreateBody(p: ResearchPrefill): Record<string, unknown> {
  return {
    name: p.name,
    property_address: p.propertyAddress,
    city: p.city,
    state: p.state,
    zip: p.zip,
    county: p.county,
    parcel_id: null,
    owner_name: p.ownerName,
    intake_notes: p.intakeNotes,
    project_id: p.projectId,
    job_ids: p.jobIds,
    job_id: p.jobIds[0] ?? null,
    supplemental: p.supplemental,
  };
}
