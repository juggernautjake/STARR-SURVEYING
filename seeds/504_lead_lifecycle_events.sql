-- ============================================================================
-- 504_lead_lifecycle_events.sql
--
-- A4 of docs/planning/in-progress/LEAD_TO_CASH_ATTRIBUTION_AND_GOOGLE_ADS_2026-07-31.md.
-- (Doc claims seed 471; taken. Its seed numbers are stale — see the header note there.)
--
-- ── WHY ONE TABLE WHEN THE DATA ALREADY EXISTS ──────────────────────────────
--
-- The lifecycle IS already recorded. `jobs` carries eight `date_*` columns,
-- `job_stages_history` logs every transition, `leads.status` moves through six
-- values, and `customer_invoices.paid_at` marks the money. Nothing here is a new
-- fact about the business.
--
-- What does not exist is one place to ASK about it. Today "how long from enquiry
-- to payment, by campaign" is a six-way join across four tables with three
-- different notions of time, and every consumer that needs it — the Google
-- exporter, the funnel dashboard, the lead timeline — would have to re-derive
-- that join, identically, and drift.
--
-- Ground rule G2 of the plan: **every milestone appends here, and every consumer
-- reads THIS and nothing else.** The value of the table is not the data; it is
-- that there is exactly one definition of "quoted".
--
-- ── dedupe_key IS WHAT MAKES IT SAFE TO WRITE FROM EVERYWHERE ───────────────
--
-- Writers are scattered by design — the leads PATCH route, job creation, the
-- stage-change path, the invoice-paid path, and a backfill over historical rows.
-- Several of those can fire twice for one real event: a PATCH that sets the same
-- status again, a re-run of the backfill, a retried request. A UNIQUE key made
-- from (what happened, to which record) turns every one of those into a no-op at
-- the database level rather than a duplicate milestone.
--
-- It matters more here than in most outboxes: these rows become Google
-- conversions and cycle-time averages. A duplicated `job_created` is a job
-- counted twice in the revenue signal Smart Bidding trains on.
--
-- ── WHY value_cents AND NOT value ───────────────────────────────────────────
--
-- `jobs.quote_amount` and `final_amount` are NUMERIC dollars; money crossing
-- into an integrations layer becomes cents, because that is what Google, Stripe
-- and every other API take, and because converting once at the boundary beats
-- converting at four call sites that each round slightly differently.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.lead_lifecycle_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The vocabulary from the plan's "pipeline, named once" table. Deliberately NOT
  -- a CHECK constraint: milestones are a product decision that will grow, and a
  -- migration per milestone is how a stream stops being appended to. The writer
  -- (`lib/pipeline/events.ts`) owns the list, and a test pins it.
  milestone     TEXT        NOT NULL,

  -- All three are nullable, and each is normal on its own. An enquiry has a lead
  -- and no job; a job created in the office by hand has a job and no lead; a
  -- walk-in has neither a customer nor attribution. A NOT NULL here would reject
  -- exactly the events that most need recording.
  lead_id       UUID REFERENCES public.leads(id)     ON DELETE SET NULL,
  job_id        UUID REFERENCES public.jobs(id)      ON DELETE SET NULL,
  customer_id   UUID REFERENCES public.customers(id) ON DELETE SET NULL,

  -- WHEN IT HAPPENED, not when the row was written. A backfill inserts today and
  -- must still report last March, and Google reports conversions on this instant.
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Money in cents, null where the milestone has none (an enquiry has no value —
  -- and 0 would be a claim, not an absence).
  value_cents   BIGINT,

  -- Who/what caused it: an employee email, 'website-form', 'backfill', 'system'.
  actor         TEXT,

  -- Provenance. Which row in which table this was derived from, so a wrong
  -- milestone can be traced to its source instead of argued about.
  source_table  TEXT,
  source_id     UUID,

  metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- See the header. `<milestone>:<source_table>:<source_id>` in practice.
  dedupe_key    TEXT        NOT NULL UNIQUE,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lead_lifecycle_events IS
  'One append-only stream of pipeline milestones. G2: every consumer (Google exporter, funnel dashboard, lead timeline) reads THIS and never re-derives a stage by joining date columns. The value is that there is exactly one definition of "quoted".';
COMMENT ON COLUMN public.lead_lifecycle_events.dedupe_key IS
  'UNIQUE. Writers are scattered and several can fire twice for one real event (a PATCH re-setting the same status, a re-run backfill, a retry). This makes each of those a database no-op — and a duplicated job_created is a job counted twice in the revenue signal Smart Bidding trains on.';
COMMENT ON COLUMN public.lead_lifecycle_events.occurred_at IS
  'When it HAPPENED, not when the row was written. A backfill inserts today and must still report last March.';
COMMENT ON COLUMN public.lead_lifecycle_events.milestone IS
  'No CHECK constraint on purpose: milestones grow with the product, and a migration per milestone is how a stream stops being appended to. lib/pipeline/events.ts owns the list; a test pins it.';

-- The funnel query: milestones for one lead/job, in order.
CREATE INDEX IF NOT EXISTS idx_lifecycle_lead ON public.lead_lifecycle_events(lead_id, occurred_at) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lifecycle_job  ON public.lead_lifecycle_events(job_id, occurred_at)  WHERE job_id IS NOT NULL;
-- The dashboard query: everything of one kind over a window.
CREATE INDEX IF NOT EXISTS idx_lifecycle_milestone ON public.lead_lifecycle_events(milestone, occurred_at DESC);

COMMIT;

-- Verification:
--   SELECT count(*) FROM public.lead_lifecycle_events;   -- 0 before backfill
--   -- the dedupe key is the safety net; prove it bites:
--   INSERT INTO public.lead_lifecycle_events (milestone, dedupe_key) VALUES ('quoted','probe');
--   INSERT INTO public.lead_lifecycle_events (milestone, dedupe_key) VALUES ('quoted','probe');
--   -- expect: duplicate key value violates unique constraint
--   DELETE FROM public.lead_lifecycle_events WHERE dedupe_key = 'probe';
