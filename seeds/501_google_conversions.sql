-- ============================================================================
-- 501_google_conversions.sql
--
-- G2-1 of docs/planning/in-progress/GOOGLE_INTEGRATION_2026-07-31.md.
--
-- The outbox for offline conversions. A row is written when the OFFICE does
-- something — a lead is accepted, an invoice is paid — and a cron drains it to
-- Google Ads later. Nothing here talks to Google; that is the point.
--
-- WHY A QUEUE AND NOT A DIRECT CALL. Marking a job secured must succeed whether
-- or not Google is reachable, so the upload cannot live inside the request. A
-- table also gives three things a fire-and-forget call cannot: a retry that is
-- safe, a record of what was actually sent, and an admin screen that can show
-- what failed. An integration nobody can inspect is one that gets switched off
-- the first time it is doubted.
--
-- `idempotency_key` IS THE WHOLE DESIGN. Google has no server-side dedupe for
-- click conversions: upload the same conversion twice and the account counts it
-- twice, and the revenue figure Smart Bidding trains on is wrong in the
-- direction that costs the most money. The UNIQUE constraint makes a repeated
-- enqueue a no-op at the database level rather than a matter of application
-- discipline — which is the only version that survives a retry loop, a double
-- click on a Save button, or two office staff acting at once.
--
-- WHY THE CLICK ID IS COPIED HERE rather than joined from `leads`. A conversion
-- must be uploaded with the identifiers as they were WHEN IT HAPPENED. If a lead
-- row is later edited, corrected, merged or re-imported, the historical upload
-- must not silently change meaning. This table is a ledger, not a view.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.google_conversion_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What happened, in our own vocabulary. Mapped to a Google conversion action
  -- by env var at upload time (G2-7) — the Ads resource names differ per
  -- account, and hardcoding them is how a staging test writes to the live one.
  action            TEXT NOT NULL
                    CHECK (action IN ('lead_submitted','job_secured','invoice_paid')),

  lead_id           UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  job_id            UUID REFERENCES public.jobs(id)  ON DELETE SET NULL,

  -- Money, as measured. `lead_submitted` carries 0: a form fill has no value
  -- and pretending otherwise is what teaches Smart Bidding to chase form fills.
  value             NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'USD',

  -- When the CONVERSION happened (not when the row was written). Google
  -- rejects a conversion whose click is outside its lookback window, and it
  -- reports on this timestamp, so a late upload of an old event still lands in
  -- the right day.
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The click, copied at enqueue time. All three, because gclid is absent for
  -- app journeys and those are the hardest to attribute in the first place.
  gclid             TEXT,
  gbraid            TEXT,
  wbraid            TEXT,

  -- Enhanced Conversions. SHA-256 of the normalized email/phone, computed by
  -- us; the raw values never travel. A row with neither a click id NOR a hash
  -- cannot be uploaded at all, which is what `status='skipped'` records.
  hashed_email      TEXT,
  hashed_phone      TEXT,

  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sent','failed','skipped')),
  attempts          INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  google_response   JSONB,
  sent_at           TIMESTAMPTZ,

  -- Stable across retries and across processes. See the header.
  idempotency_key   TEXT NOT NULL UNIQUE,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.google_conversion_events IS
  'Outbox of offline conversions for Google Ads. Written when the office changes a lead/job/invoice; drained by cron. Never written to directly by a UI.';
COMMENT ON COLUMN public.google_conversion_events.idempotency_key IS
  'UNIQUE. Google does not dedupe click conversions server-side, so a repeated upload counts twice and corrupts the revenue signal Smart Bidding trains on. This makes a repeat enqueue a database no-op rather than a matter of application discipline.';
COMMENT ON COLUMN public.google_conversion_events.occurred_at IS
  'When the CONVERSION happened, not when the row was written — Google reports on this, so a late upload still lands on the right day.';
COMMENT ON COLUMN public.google_conversion_events.status IS
  'pending → sent | failed | skipped. `skipped` means it can never be uploaded (no click id and no hashed identifier), which is a normal outcome for phone and walk-in leads and must not be retried forever.';

-- The cron's only query.
CREATE INDEX IF NOT EXISTS idx_gce_pending
  ON public.google_conversion_events(occurred_at)
  WHERE status = 'pending';
-- The admin screen's default view: newest first, whatever the state.
CREATE INDEX IF NOT EXISTS idx_gce_created ON public.google_conversion_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gce_lead    ON public.google_conversion_events(lead_id) WHERE lead_id IS NOT NULL;

COMMIT;

-- Verification:
--   SELECT count(*) FROM public.google_conversion_events;  -- 0
--   -- the UNIQUE key is the safety net; prove it bites:
--   INSERT INTO public.google_conversion_events (action, idempotency_key) VALUES ('lead_submitted','probe');
--   INSERT INTO public.google_conversion_events (action, idempotency_key) VALUES ('lead_submitted','probe');
--   -- expect: duplicate key value violates unique constraint
--   DELETE FROM public.google_conversion_events WHERE idempotency_key = 'probe';
