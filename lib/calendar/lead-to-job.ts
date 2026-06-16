// lib/calendar/lead-to-job.ts
//
// job-calendar Slice C6 — pure mapper for the lead → job conversion.
// Closes the loop with the previous customer-query plan: a customer
// query lands in `/admin/leads`, an admin opens the detail page,
// taps "Convert to job", lands on `/admin/jobs/new` with every
// field they can pre-fill already populated. Saves daddy the
// re-typing that was the explicit pain point.

/** The subset of `leads` columns the prefill consumes. Stays loose-
 *  typed (no Lead import from the route) so this helper stays portable
 *  to the lead-detail page + a future bulk-convert path. */
export interface LeadForConversion {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  property_address?: string | null;
  city?: string | null;
  state?: string | null;
  survey_type?: string | null;
  estimated_acreage?: number | null;
  quote_amount?: number | null;
  notes?: string | null;
}

/** Shape the new-job form expects. Mirrors the form's `useState`
 *  initial — exported here so a future drift in the form gets
 *  caught by the source-lock test. */
export interface JobDraft {
  name: string;
  description: string;
  survey_type: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  acreage: string;
  lot_number: string;
  subdivision: string;
  abstract_number: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  client_company: string;
  client_address: string;
  lead_rpls_email: string;
  deadline: string;
  quote_amount: string;
  notes: string;
  tags: string;
  is_priority: boolean;
  is_legacy: boolean;
  stage: string;
}

/** Default empty draft — mirrors the form's `useState` initial so a
 *  caller can spread + override per-lead values without losing the
 *  defaults the form depends on (e.g. `survey_type: 'boundary'`,
 *  `state: 'TX'`, `stage: 'quote'`). */
export const EMPTY_JOB_DRAFT: JobDraft = {
  name: '',
  description: '',
  survey_type: 'boundary',
  address: '',
  city: '',
  state: 'TX',
  zip: '',
  county: '',
  acreage: '',
  lot_number: '',
  subdivision: '',
  abstract_number: '',
  client_name: '',
  client_email: '',
  client_phone: '',
  client_company: '',
  client_address: '',
  lead_rpls_email: '',
  deadline: '',
  quote_amount: '',
  notes: '',
  tags: '',
  is_priority: false,
  is_legacy: false,
  stage: 'quote',
};

/** Map the schema's free-text `survey_type` ("Boundary Survey",
 *  "ALTA / NSPS", "Topographic", …) onto the new-job form's enum
 *  values (boundary, alta, topo, …). Falls back to 'boundary' for
 *  unknown inputs so the form still renders. Conservative — adding
 *  a new survey type means extending both this table AND the new-job
 *  form's `<select>`. */
const SURVEY_TYPE_MAP: Record<string, string> = {
  boundary: 'boundary',
  alta: 'alta',
  'alta/nsps': 'alta',
  topographic: 'topo',
  topo: 'topo',
  topo_survey: 'topo',
  construction: 'construction',
  subdivision: 'subdivision',
  asbuilt: 'asbuilt',
  'as-built': 'asbuilt',
};

function mapSurveyType(raw: string | null | undefined): string {
  if (!raw) return 'boundary';
  const key = raw.toLowerCase().trim().replace(/\s+/g, '_');
  return SURVEY_TYPE_MAP[key] ?? SURVEY_TYPE_MAP[raw.toLowerCase().trim()] ?? 'boundary';
}

function cleanString(v: string | null | undefined): string {
  return (v ?? '').trim();
}

/** Returns a JobDraft with every prefillable field populated from the
 *  lead. Fields with no obvious mapping (zip, lot_number, …) stay at
 *  their defaults so daddy fills them in once. Pure — no Supabase,
 *  no router; the form / button wires call this and feed the output
 *  into `useState`. */
export function buildJobDraftFromLead(lead: LeadForConversion): JobDraft {
  const name = cleanString(lead.name);
  const company = cleanString(lead.company);
  const propertyAddress = cleanString(lead.property_address);
  const previousNotes = cleanString(lead.notes);
  // Tack a stable provenance marker on so a future search ("which
  // jobs came from leads?") works without a new column.
  const provenance = `Converted from lead ${lead.id}.`;
  const mergedNotes = [previousNotes, provenance]
    .filter((s) => s.length > 0)
    .join('\n\n');
  return {
    ...EMPTY_JOB_DRAFT,
    // Job name: "<Customer> Boundary Survey" (or similar). Acceptable
    // default; daddy renames if he wants.
    name: name ? `${name} Survey` : '',
    survey_type: mapSurveyType(lead.survey_type ?? ''),
    address: propertyAddress,
    city: cleanString(lead.city),
    state: cleanString(lead.state) || 'TX',
    acreage:
      typeof lead.estimated_acreage === 'number' && Number.isFinite(lead.estimated_acreage)
        ? String(lead.estimated_acreage)
        : '',
    client_name: name,
    client_email: cleanString(lead.email),
    client_phone: cleanString(lead.phone),
    client_company: company,
    quote_amount:
      typeof lead.quote_amount === 'number' && Number.isFinite(lead.quote_amount)
        ? String(lead.quote_amount)
        : '',
    notes: mergedNotes,
  };
}
