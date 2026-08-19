-- seeds/603_job_money_history.sql — what we bid, what changed it, and why we walked away
--
-- Owner, 2026-08-19: *"sometimes we get down payments. We need to be able to record if we have
-- already received money for a job. Also, sometimes we change the price of the job as well, and we
-- need to be able to record the history of when payments are made and when price changes are made.
-- Sometimes we reject a job altogether after having started it. We need to be able to record the
-- cancellation of a job and the reason why."*
--
-- ── WHAT ALREADY EXISTED, MEASURED BEFORE WRITING THIS ──────────────────────────────────────────
--
--   `job_payments`  EXISTS — id, job_id, amount, payment_type, payment_method, reference_number,
--                   notes, paid_at, recorded_by. Down payments already have a home; what they
--                   lacked was a named type and a place on screen.
--   `jobs.result` / `result_reason` / `result_set_at`  EXIST — a cancellation reason has somewhere
--                   to live.
--   price history   DOES NOT EXIST. `jobs.quote_amount` and `jobs.final_amount` are single values
--                   that get overwritten. Change a quote from $4,200 to $5,600 and the $4,200 is
--                   gone — with no record that it was ever quoted, when it changed, who changed it
--                   or why. That is the gap.
--
-- ── WHY A PRICE CHANGE IS NOT AN EDIT ───────────────────────────────────────────────────────────
--
-- A quote that moves is a commercial event. "We bid 4,200, then the client added the topo, so it
-- went to 5,600 on the 14th" is the sentence somebody has to be able to reconstruct months later,
-- usually while being asked why the invoice does not match the proposal. An UPDATE cannot answer it.
--
-- So every change to either money column is appended here, with the old value, the new value, who
-- and why. The `jobs` columns stay authoritative for "what is it now" — this table is the audit,
-- not a second source of truth, and nothing reads a current price from it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.job_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,

  -- 'quote' or 'final'. Two different promises: what we said it would cost, and what we billed.
  -- Kept apart because a quote moving is a negotiation and a final moving is a correction.
  field text NOT NULL CHECK (field IN ('quote', 'final')),

  old_amount numeric,
  new_amount numeric,
  -- Free text. A price change with no reason is the entry people find useless later, so the UI asks
  -- for one — but it is not NOT NULL, because refusing to record a change because somebody could
  -- not phrase it would lose the change as well as the reason.
  reason text,

  changed_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_price_history_job_idx
  ON public.job_price_history (job_id, created_at DESC);

COMMENT ON TABLE public.job_price_history IS
  'Append-only record of every change to a job''s quote or final amount. `jobs.quote_amount` / `jobs.final_amount` remain authoritative for the current value — this is the audit trail, never read as a price.';

-- ── The cancellation, which needs one column it did not have ───────────────────────────────────
--
-- `result` already records won / lost / abandoned with a `result_reason`. What was missing is the
-- money question that always follows a cancellation: was anything already received, and is any of
-- it being kept? A job cancelled after a $1,500 deposit is a different row from one cancelled
-- before any money moved, and the difference is what the accountant needs.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS amount_retained numeric;

COMMENT ON COLUMN public.jobs.cancelled_at IS
  'When the job was cancelled. Distinct from stage_changed_at, which moves for every transition.';
COMMENT ON COLUMN public.jobs.amount_retained IS
  'Of the money already received, how much the firm is keeping on a cancelled job. NULL means not yet decided; 0 means it is all being refunded.';

-- Seed the first history row for any job that already carries a price, so a job priced before this
-- table existed does not read as "never quoted". Marked as the opening figure rather than a change.
INSERT INTO public.job_price_history (job_id, field, old_amount, new_amount, reason, changed_by, created_at)
SELECT j.id, 'quote', NULL, j.quote_amount,
       'Opening quote, recorded when price history was introduced.',
       COALESCE(j.created_by, 'system'), COALESCE(j.created_at, now())
FROM public.jobs j
WHERE j.quote_amount IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.job_price_history h WHERE h.job_id = j.id AND h.field = 'quote');

COMMIT;
