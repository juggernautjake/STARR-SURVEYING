// lib/jobs/job-ref.ts — resolve whatever a person typed into a real `jobs.id`.
//
// WHY THIS EXISTS
//
// `receipts.job_id` is a UUID with a foreign key to `jobs.id`. The receipt-capture page asked for a
// "Job number (optional)" as free text and posted whatever was typed straight into that column, so
// typing the thing the field actually asked for — `24-103` — produced a Postgres `invalid input
// syntax for type uuid` on insert, *after* the photo had already been written to the bucket. The
// field was not merely unhelpful; the only value it accepted was the one nobody knows by heart.
//
// So the resolver takes a REFERENCE — a UUID, a job number, or a name — and answers with the job,
// or with the near-misses that would help a person pick.
//
// AND: NOT-FOUND IS A NORMAL ANSWER, NOT AN ERROR
//
// Owner, 2026-08-11: *"it might be that we have not created a job yet on the backend, but that we
// are working on that job… it should prompt us if we want to create a new job to place that file or
// receipt into."* Crews work a job for days before the office types it in. A receipt that arrives
// first is not a mistake to reject — it is the earliest record of a real job. `not_found` therefore
// carries the parsed reference back, so callers can offer to create that job rather than making the
// person abandon the upload, go somewhere else, create a job, and come back with a photo they may
// no longer have.

import { supabaseAdmin } from '@/lib/supabase';

/** The columns any caller needs to name a job in the UI. */
export interface JobRefMatch {
  id: string;
  name: string;
  job_number: string | null;
  client_name?: string | null;
  address?: string | null;
  stage?: string | null;
}

export type JobRefResolution =
  | { status: 'empty' }
  | { status: 'resolved'; job: JobRefMatch }
  /** Nothing matched exactly. `suggestions` are fuzzy near-misses (may be empty), and
   *  `ref` is the cleaned-up text — the seed for a "create this job" offer. */
  | { status: 'not_found'; ref: string; suggestions: JobRefMatch[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function looksLikeUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

const SELECT_COLS = 'id, name, job_number, client_name, address, stage';

/**
 * PostgREST `.or()` splits its argument on commas and treats `%`, `(`, `)` and `,` structurally, so
 * a reference containing any of them can rewrite the filter tree rather than be matched by it.
 * Stripping them is safe here because none of them are meaningful inside a job number or name for
 * *search* purposes — and a search that silently returns nothing is a far better failure than one
 * that returns somebody else's jobs.
 */
function sanitiseForOr(value: string): string {
  return value.replace(/[,()%*\\]/g, ' ').trim();
}

/**
 * Resolve a typed reference to exactly one job.
 *
 * Match order is deliberate — most specific first, so a job NUMBER never loses to a job whose NAME
 * happens to contain the same digits:
 *   1. UUID (an id we were handed by a picker)
 *   2. exact job_number, case-insensitive
 *   3. exact name, case-insensitive
 *   4. a single unambiguous fuzzy hit
 *
 * Step 4 resolves only when there is exactly ONE candidate. Two candidates is not a resolution, it
 * is a question, and answering it by guessing would file a receipt against the wrong job — the one
 * error in this flow that nobody catches later, because the receipt looks perfectly filed.
 */
export async function resolveJobRef(rawRef: string | null | undefined): Promise<JobRefResolution> {
  const ref = (rawRef ?? '').trim();
  if (!ref) return { status: 'empty' };

  if (looksLikeUuid(ref)) {
    const { data } = await supabaseAdmin
      .from('jobs')
      .select(SELECT_COLS)
      .eq('id', ref)
      .is('deleted_at', null)
      .maybeSingle();
    if (data) return { status: 'resolved', job: data as JobRefMatch };
    // A UUID that resolves to nothing is a dangling id, not a job number somebody typed. Offering
    // to "create the job 3f2a…-…" would be nonsense, so no suggestions are hunted for it.
    return { status: 'not_found', ref, suggestions: [] };
  }

  const { data: byNumber } = await supabaseAdmin
    .from('jobs')
    .select(SELECT_COLS)
    .ilike('job_number', ref)
    .is('deleted_at', null)
    .limit(2);
  if (byNumber && byNumber.length === 1) {
    return { status: 'resolved', job: byNumber[0] as JobRefMatch };
  }

  const { data: byName } = await supabaseAdmin
    .from('jobs')
    .select(SELECT_COLS)
    .ilike('name', ref)
    .is('deleted_at', null)
    .limit(2);
  if (byName && byName.length === 1) {
    return { status: 'resolved', job: byName[0] as JobRefMatch };
  }

  const suggestions = await searchJobs(ref, 8);
  if (suggestions.length === 1) {
    return { status: 'resolved', job: suggestions[0] };
  }
  return { status: 'not_found', ref, suggestions };
}

/** Fuzzy search across number, name, client and address. Used for the picker's type-ahead and for
 *  the near-misses on a failed resolution. */
export async function searchJobs(term: string, limit = 20): Promise<JobRefMatch[]> {
  const clean = sanitiseForOr(term);
  if (!clean) return [];
  const { data } = await supabaseAdmin
    .from('jobs')
    .select(SELECT_COLS)
    .or(
      `job_number.ilike.%${clean}%,name.ilike.%${clean}%,client_name.ilike.%${clean}%,address.ilike.%${clean}%`,
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as JobRefMatch[];
}
