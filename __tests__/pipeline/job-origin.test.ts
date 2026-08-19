// __tests__/pipeline/job-origin.test.ts — the conversion carries its origin forward (A6).
//
// Source locks, because the failure mode here is a chain with one link missing and no error anywhere:
// the lead API stops selecting `customer_id`, or the conversion page stops sending `origin_lead_id`, and
// jobs silently start arriving with no origin. Nothing breaks. The funnel just quietly loses its front
// half, and the Google exporter starts skipping conversions it cannot key.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

const JOBS_API = read('app/api/admin/jobs/route.ts');
const NEW_JOB_PAGE = read('app/admin/jobs/new/page.tsx');
const ORIGIN_LEAD = read('app/api/admin/jobs/[id]/origin-lead/route.ts');
const LEAD_TO_JOB = read('lib/calendar/lead-to-job.ts');
const SEED = read('seeds/506_job_origin_links.sql');

describe('the conversion carries the link forward', () => {
  it('the new-job page sends origin_lead_id and customer_id when converting', () => {
    expect(NEW_JOB_PAGE).toMatch(/origin_lead_id: prefilledLead\.id/);
    expect(NEW_JOB_PAGE).toMatch(/customer_id: prefilledLead\.customer_id/);
  });

  it('the shared lead type carries customer_id, or the page could not send it', () => {
    // The link that would break silently: the page reads `prefilledLead.customer_id`, and if the type
    // and the API disagree it is simply `undefined` forever.
    expect(LEAD_TO_JOB).toMatch(/customer_id\?: string \| null/);
  });

  it('the jobs API accepts and stores all three', () => {
    expect(JOBS_API).toMatch(/origin_lead_id, customer_id, accepted_quote_id,/);
    expect(JOBS_API).toMatch(/origin_lead_id: origin_lead_id \|\| null/);
    expect(JOBS_API).toMatch(/accepted_quote_id: accepted_quote_id \|\| null/);
  });

  // ── `customer_id` MOVED, and this is the assertion that says so (2026-08-19) ──────────────────
  //
  // Projects landed, and `customer_id` became one of the fields a job inherits from its project.
  // The old line `customer_id: customer_id || null` had to GO, and not for tidiness: it sat after
  // the inheritance spread, so it overwrote the project's customer with `null` on every job created
  // without one — which is most of them.
  //
  // The chain this file exists to protect is unchanged in behaviour, because inheritance fills
  // BLANKS ONLY: a conversion that sends the lead's `customer_id` still wins over the project's.
  // That is the property worth locking, so it is locked here rather than the literal line.
  it('the lead’s customer_id still reaches the job, now via inheritance', () => {
    // It is handed to `inheritFromProject` as a caller-supplied value…
    expect(JOBS_API).toMatch(/inheritFromProject\(/);
    expect(JOBS_API).toMatch(/customer_id: customer_id \|\| null,/);
    // …and is NOT re-assigned afterwards, which is what would clobber it.
    expect(JOBS_API).toMatch(/NOT re-set here: `customer_id` is one of the inherited fields/);
  });

  it('inheritance fills blanks only, so a supplied value is never overwritten', () => {
    // The guarantee the assertion above depends on. If this ever changes, a lead conversion would
    // silently adopt the project's customer instead of the one the lead actually named.
    const MODEL = read('lib/projects/model.ts');
    expect(MODEL).toMatch(/if \(present\(out\[field\]\)\) continue;/);
  });

  it('a job with no lead is still a valid job', () => {
    // A job typed straight into the office has no lead, no customer and no quote behind it. `|| null`
    // rather than a required field is what keeps that an ordinary job instead of a rejected one.
    expect(JOBS_API).toMatch(/All optional: a job typed straight into the office/);
  });
});

describe('milestone 5 — the primary bidding conversion', () => {
  it('is emitted the moment the job exists', () => {
    expect(JOBS_API).toMatch(/milestone: 'job_created'/);
    expect(JOBS_API).toMatch(/import \{ recordMilestone, toCents \}/);
  });

  it('is valued at the quote', () => {
    // What the customer agreed to. The final invoice may differ and is an adjustment (A9), not a
    // restatement of this event.
    expect(JOBS_API).toMatch(/valueCents: toCents\(/);
  });

  it('prefers date_accepted over "now"', () => {
    // The event worth attributing is when the customer said yes, not when someone typed it in — and
    // Google reports on the conversion's own timestamp.
    expect(JOBS_API).toMatch(/occurredAt: date_accepted \|\| undefined/);
  });
});

describe('the link is fast in BOTH directions', () => {
  it('origin-lead uses the forward key lookup first', () => {
    expect(ORIGIN_LEAD).toMatch(/\.from\('jobs'\)[\s\S]{0,120}origin_lead_id/);
    expect(ORIGIN_LEAD).toMatch(/originLeadId\s*\n?\s*\?\s*await query\.eq\('id', originLeadId\)/);
  });

  it('and KEEPS the reverse scan as a fallback', () => {
    // Deleting it would make the route correct only for rows the backfill reached. "Works for new data"
    // is the failure nobody notices until an old job's origin card is mysteriously empty.
    expect(ORIGIN_LEAD).toMatch(/\.eq\('converted_job_id', jobId\)/);
  });

  it('the seed indexes the reverse column that never had one', () => {
    // Measured before writing the seed: pg_indexes returned nothing for leads.converted_job_id, so every
    // job page was sequentially scanning leads.
    expect(SEED).toMatch(/CREATE INDEX IF NOT EXISTS idx_leads_converted_job/);
    expect(SEED).toMatch(/CREATE INDEX IF NOT EXISTS idx_jobs_origin_lead/);
  });

  it('and backfills the forward link from the reverse one', () => {
    // Otherwise the fast path would only ever apply to jobs created after today.
    expect(SEED).toMatch(/UPDATE public\.jobs j[\s\S]{0,200}SET origin_lead_id = l\.id/);
  });
});
