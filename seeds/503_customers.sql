-- ============================================================================
-- 503_customers.sql
--
-- A3 of docs/planning/in-progress/LEAD_TO_CASH_ATTRIBUTION_AND_GOOGLE_ADS_2026-07-31.md.
-- (The doc claims seed 470; 470 was taken by the time this ran. Numbers in that
--  doc are stale — check `ls seeds/` before claiming one.)
--
-- WHY THIS TABLE EXISTS. The owner asked to "track reoccurring customers", and
-- today that question cannot be answered at all: client identity is free text
-- copied onto every row (`jobs.client_name/_email/_phone/_company`, and
-- `leads.name/email/phone`). Two jobs for the same landowner are two unrelated
-- strings. Repeat rate, lifetime value, and "is this lead actually new?" are
-- all downstream of giving a customer ONE row to be.
--
-- ── THE RULE THAT SHAPES THIS SCHEMA ────────────────────────────────────────
--
-- **Auto-merge only on an exact identifier. Everything weaker is a suggestion a
-- human confirms.** Silently merging two landowners because their names look
-- alike is far worse than leaving a duplicate: a duplicate is untidy and
-- reversible, whereas a wrong merge puts one person's job history, invoices and
-- balance under another person's name — and nobody discovers it until someone is
-- billed for a survey they never ordered.
--
-- That is why `email_sha256` / `phone_sha256` are UNIQUE (the auto-merge keys)
-- while name and address carry no constraint at all.
--
-- ── WHY THE HASHES ARE STORED HERE AND NOT COMPUTED AT UPLOAD ───────────────
--
-- They do double duty, and the second is the reason they live on the row:
--   1. Match key — exact-identity matching without scanning raw PII.
--   2. Enhanced Conversions — the value Google Ads needs at upload time.
-- Computing them at upload instead would mean a customer who later corrects
-- their email, or asks to be erased, becomes unattributable retroactively: the
-- conversion already reported would have no key to adjust. Storing the hash at
-- first contact keeps the historical upload addressable without keeping the
-- address itself.
--
-- Normalisation is `lib/integrations/google/hash.ts` — the SAME module the Ads
-- uploader uses, deliberately, so a customer's match key and their conversion
-- key can never be computed two different ways.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.customers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What the office calls them. Free text, no constraint: this is a label, never a key.
  display_name          TEXT NOT NULL,
  company               TEXT,

  -- The raw contact details, kept because the office needs to ring people.
  primary_email         TEXT,
  primary_phone         TEXT,

  -- The MATCH KEYS. Unique because they are the only things trusted to auto-merge.
  -- Nullable because a walk-in with neither is still a customer.
  email_sha256          TEXT UNIQUE,
  phone_sha256          TEXT UNIQUE,

  -- Rollups. Denormalised on purpose: "how many jobs has this person had" is asked on
  -- every lead-detail render, and it must not become a COUNT over jobs each time.
  -- Maintained by the identity module, and a mismatch is a bug worth a test, not a
  -- number to be trusted blindly.
  first_lead_at         TIMESTAMPTZ,
  job_count             INTEGER NOT NULL DEFAULT 0,
  lifetime_value_cents  BIGINT  NOT NULL DEFAULT 0,
  is_repeat             BOOLEAN NOT NULL DEFAULT FALSE,

  notes                 TEXT,
  org_id                UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.customers IS
  'One row per real person/organisation. Answers "recurring customer", repeat rate and lifetime value, none of which were answerable while identity was free text on every lead and job row.';
COMMENT ON COLUMN public.customers.email_sha256 IS
  'UNIQUE. Auto-merge key AND the Enhanced Conversions identifier. Normalised by lib/integrations/google/hash.ts — the same module the Ads uploader uses, so a match key and a conversion key can never be computed two different ways.';
COMMENT ON COLUMN public.customers.job_count IS
  'Denormalised rollup, maintained by lib/customers/identity.ts. Asked on every lead render; must not be a COUNT each time.';

-- The link. ON DELETE SET NULL rather than CASCADE: deleting a customer record must
-- never take their job history with it — the jobs are the business record, the customer
-- row is an index over them.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.jobs  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_customer ON public.leads(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_customer  ON public.jobs(customer_id)  WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_repeat ON public.customers(is_repeat) WHERE is_repeat = TRUE;

-- ── the suggested-merge queue ───────────────────────────────────────────────
-- A weaker match (same name, same property address) produces a ROW HERE, never a merge.
-- An admin confirms or dismisses it. This is the table that keeps the "auto-merge only on
-- an exact identifier" rule honest: without somewhere to put a suspicion, the pressure is
-- always to act on it.
CREATE TABLE IF NOT EXISTS public.customer_merge_suggestions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  candidate_id  UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  reason        TEXT NOT NULL,
  confidence    TEXT NOT NULL DEFAULT 'weak' CHECK (confidence IN ('weak', 'strong')),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'merged', 'dismissed')),
  decided_by    TEXT,
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One open suggestion per pair, whichever order it was noticed in.
  UNIQUE (customer_id, candidate_id)
);

COMMENT ON TABLE public.customer_merge_suggestions IS
  'Weak identity matches awaiting a human decision. Exists so that "auto-merge only on an exact identifier" has somewhere to put a suspicion — without it, the pressure is always to act on one.';

CREATE INDEX IF NOT EXISTS idx_merge_suggestions_open
  ON public.customer_merge_suggestions(created_at DESC) WHERE status = 'open';

COMMIT;

-- Verification:
--   SELECT count(*) FROM public.customers;                    -- 0 before backfill
--   SELECT count(*) FROM public.customer_merge_suggestions;   -- 0
--   -- the UNIQUE match keys are the safety net; prove one bites:
--   INSERT INTO public.customers (display_name, email_sha256) VALUES ('A', 'probe-hash');
--   INSERT INTO public.customers (display_name, email_sha256) VALUES ('B', 'probe-hash');
--   -- expect: duplicate key value violates unique constraint "customers_email_sha256_key"
--   DELETE FROM public.customers WHERE email_sha256 = 'probe-hash';
--   -- and the FKs exist:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name IN ('leads','jobs') AND column_name = 'customer_id';   -- 2 rows
