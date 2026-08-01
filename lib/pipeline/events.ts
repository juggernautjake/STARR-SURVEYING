// lib/pipeline/events.ts — the one writer for the lifecycle stream. A4.
//
// Ground rule G2 of LEAD_TO_CASH_ATTRIBUTION_AND_GOOGLE_ADS_2026-07-31: every milestone appends to
// `lead_lifecycle_events`, and every consumer — the Google exporter, the funnel dashboard, the lead
// timeline — reads that table and nothing else. **No consumer re-derives a stage by joining six date
// columns.**
//
// The value of this module is not that it writes rows. It is that there is exactly ONE definition of
// "quoted" in the codebase, and one place where the dedupe key is constructed. Both of those are things
// that go wrong quietly when each caller does it itself: one route says `quoted`, another `quote_sent`,
// and the funnel silently reports half the truth.
//
// ── WHY THE MILESTONE LIST LIVES HERE AND NOT IN A CHECK CONSTRAINT ────────────────────────────────
//
// Milestones grow with the product, and a migration per milestone is how a stream stops being appended
// to — the cost of adding one becomes high enough that people put the fact somewhere else instead. The
// list is code, a test pins it against the plan's vocabulary, and a typo is a type error rather than a
// runtime constraint violation on a live route.
//
// ── FAILURE IS SILENT, DELIBERATELY ────────────────────────────────────────────────────────────────
//
// `recordMilestone` never throws. The same reasoning as `insertLeadFromForm` and `upsertCustomer`: this
// is an ANALYTICS derivative of a business action, so a failure to record that a job was created must
// never stop the job being created. The business record is the `jobs` row; this table is how we ask
// questions about it.
//
// The consequence — a milestone can be missing and nothing will say so — is why the backfill exists and
// is re-runnable: it is also the repair tool.

import { supabaseAdmin } from '@/lib/supabase';

/**
 * The pipeline vocabulary, from the plan's "pipeline, named once" table.
 *
 * Ordered as the pipeline runs, because that order is used to render a timeline and to answer "how far
 * did this lead get" — putting them in any other order here would make those consumers invent their own.
 */
export const MILESTONES = [
  'inquiry_received',   // 1 — the form arrived
  'contacted',          // 2 — someone spoke to them
  'quoted',             // 3 — the official quote was recorded
  'quote_accepted',     // 4 — they said yes
  'job_created',        // 5 — the job exists. THE PRIMARY BIDDING CONVERSION.
  'research_started',   // 6
  'fieldwork_complete', // 7
  'deliverables_sent',  // 8
  'payment_received',   // 9 — the money landed
  'lost',               // ✗ — declined, lost, or abandoned
] as const;

export type Milestone = (typeof MILESTONES)[number];

/**
 * The four milestones that become Google conversion actions.
 *
 * Only four, because Google's bidding degrades when fed a dozen overlapping actions — and because 2, 6, 7
 * and 8 are cycle-time facts, not purchase intent. Exported so the exporter cannot invent a fifth.
 */
export const GOOGLE_MILESTONES: readonly Milestone[] = [
  'inquiry_received',
  'quoted',
  'job_created',
  'payment_received',
];

/**
 * The one primary bidding conversion.
 *
 * `job_created`, NOT `payment_received`, and the reason is the 90-day click window: a boundary survey
 * routinely runs quote → delivery → final payment past it, so a payment-keyed primary would silently
 * under-report the slowest jobs — which are usually the biggest. Payment is uploaded as an ADJUSTMENT
 * restating this one where the window allows.
 */
export const PRIMARY_BIDDING_MILESTONE: Milestone = 'job_created';

export interface MilestoneInput {
  milestone: Milestone;
  leadId?: string | null;
  jobId?: string | null;
  customerId?: string | null;
  /** When it HAPPENED. Defaults to now, but a backfill passes the historical instant. */
  occurredAt?: string | Date | null;
  /** Money in cents, or null where the milestone has none. `0` is a claim; null is an absence. */
  valueCents?: number | null;
  actor?: string | null;
  /** Where this was derived from, so a wrong milestone can be traced rather than argued about. */
  sourceTable?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * The dedupe key: what happened, to which record.
 *
 * PURE and exported, because it is the part that must be identical between the live writers and the
 * backfill. If the backfill built its keys differently, a re-run would duplicate every historical
 * milestone instead of being the no-op it is designed to be — and a duplicated `job_created` is a job
 * counted twice in the revenue signal Smart Bidding trains on.
 *
 * Falls back to the lead/job id when there is no explicit source, so a key is always derivable.
 */
export function dedupeKeyFor(input: MilestoneInput): string {
  const table = input.sourceTable ?? (input.jobId ? 'jobs' : 'leads');
  const id = input.sourceId ?? input.jobId ?? input.leadId ?? 'unknown';
  return `${input.milestone}:${table}:${id}`;
}

/** Dollars → cents, or null. One conversion at the boundary rather than four call sites rounding slightly
 *  differently. `null`/`undefined`/NaN stay null: a milestone with no value must not become £0.00. */
export function toCents(amount: number | null | undefined): number | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

/**
 * Append a milestone. Idempotent on the dedupe key; never throws.
 *
 * Returns true when a row was written, false when it was a duplicate or the write failed — so a caller
 * that cares (the backfill, which counts) can tell, while a caller that does not (a route) can ignore it.
 */
export async function recordMilestone(input: MilestoneInput): Promise<boolean> {
  try {
    const occurred = input.occurredAt
      ? new Date(input.occurredAt).toISOString()
      : new Date().toISOString();

    const { error } = await supabaseAdmin
      .from('lead_lifecycle_events')
      .insert({
        milestone: input.milestone,
        lead_id: input.leadId ?? null,
        job_id: input.jobId ?? null,
        customer_id: input.customerId ?? null,
        occurred_at: occurred,
        value_cents: input.valueCents ?? null,
        actor: input.actor ?? null,
        source_table: input.sourceTable ?? null,
        source_id: input.sourceId ?? null,
        metadata: input.metadata ?? {},
        dedupe_key: dedupeKeyFor(input),
      });

    if (error) {
      // 23505 is a unique violation — the dedupe key doing its job. That is the DESIGNED path for a
      // repeated PATCH or a re-run backfill, not a fault, so it must not be logged as one: a log full of
      // "errors" that are normal is a log nobody reads when something is actually wrong.
      if (error.code === '23505') return false;
      console.warn('[pipeline] milestone not recorded:', input.milestone, error.message);
      return false;
    }
    return true;
  } catch (e) {
    // See the header: an analytics derivative must never break the business action that triggered it.
    console.warn('[pipeline] milestone threw:', e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Map a `leads.status` to the milestone it represents, or null where it has none.
 *
 * Exported and pure so the leads PATCH route, the backfill and any test agree — the alternative is a
 * `switch` copied into each, which is how `contacted` ends up recorded by one path and not another.
 *
 * `new` maps to nothing on purpose: the enquiry milestone is written at INSERT, and mapping the status
 * would record it a second time every time someone reverted a lead to new.
 */
export function milestoneForLeadStatus(status: string): Milestone | null {
  switch (status) {
    case 'contacted': return 'contacted';
    case 'quoted': return 'quoted';
    case 'accepted': return 'quote_accepted';
    case 'declined':
    case 'lost': return 'lost';
    default: return null;
  }
}

/** Map a `jobs.stage` to its milestone, or null. Stages that are not pipeline milestones (`quote`,
 *  `on_hold`, `cancelled`) return null rather than being forced into the vocabulary. */
export function milestoneForJobStage(stage: string): Milestone | null {
  switch (stage) {
    case 'research': return 'research_started';
    case 'drawing': return 'fieldwork_complete'; // reaching drawing means the fieldwork finished
    case 'delivery': return 'deliverables_sent';
    default: return null;
  }
}
