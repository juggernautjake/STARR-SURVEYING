-- ============================================================================
-- 505_lead_quotes.sql
--
-- A5 of docs/planning/in-progress/LEAD_TO_CASH_ATTRIBUTION_AND_GOOGLE_ADS_2026-07-31.md.
-- (Doc claims 472; taken. Its seed numbers are stale.)
--
-- ── WHAT IS WRONG TODAY ─────────────────────────────────────────────────────
--
-- The owner names this step explicitly — *"he can give the official quote, which
-- he will record"* — and today it is `leads.quote_amount`: ONE NULLABLE NUMBER.
-- Revising a quote overwrites it. The moment a customer says "can you do it for
-- less?", the original number is gone, and with it:
--
--   · what we first asked for, versus what we settled at;
--   · how often we discount, and by how much;
--   · why we lose — because a declined quote leaves no trace at all;
--   · which quote Google should be told about, when a job is finally won.
--
-- A quote is an OBJECT with a version and an outcome, not a column.
--
-- ── VERSIONS ARE APPEND-ONLY ────────────────────────────────────────────────
--
-- A revision is a NEW ROW, never an edit. `(lead_id, version)` is unique, so the
-- history cannot be quietly rewritten — which is the entire point of the table.
-- The old row's status becomes `superseded`; it does not disappear.
--
-- ── `leads.quote_amount` STAYS, AS A MIRROR ─────────────────────────────────
--
-- It is read by the leads board, the lead detail page, the conversion flow and
-- at least one report. Removing it would be a wide, risky change for no benefit,
-- so it becomes a DERIVED MIRROR of the current quote, maintained by
-- `lib/leads/quotes.ts`. Nothing existing breaks, and there is one writer.
--
-- The risk of a mirror is that it drifts. That is a real cost, accepted knowingly
-- because the alternative — touching every reader — is a bigger one. The mirror
-- is written in the same function that writes the quote, never anywhere else.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.lead_quotes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,

  -- 1, 2, 3… A revision is a new version, and the pair is UNIQUE so two people
  -- quoting at once cannot both claim version 2.
  version        INTEGER NOT NULL,

  -- Cents. `leads.quote_amount` is NUMERIC dollars; money that will cross into
  -- Google/Stripe is stored in the unit those take, converted once at the edge.
  amount_cents   BIGINT NOT NULL CHECK (amount_cents >= 0),

  -- What was actually being quoted for. Without it, a revision is a number with
  -- no explanation, and "why is v2 lower" becomes an archaeology exercise.
  scope_notes    TEXT,

  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','sent','accepted','declined','expired','superseded')),

  -- WHY WE LOSE. The plan calls this out as a report of its own, and it only
  -- exists if the reason is captured at the moment of the decline — nobody
  -- reconstructs it a month later.
  decline_reason TEXT,

  quoted_by      TEXT,
  quoted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at        TIMESTAMPTZ,
  decided_at     TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (lead_id, version)
);

COMMENT ON TABLE public.lead_quotes IS
  'Every official quote, versioned and append-only. Replaces the single overwritable leads.quote_amount, which lost the original figure the moment anyone revised it — and with it the discount rate, the decline reasons, and which quote a won job should report to Google.';
COMMENT ON COLUMN public.lead_quotes.version IS
  'A revision is a NEW ROW, never an edit. UNIQUE with lead_id so history cannot be quietly rewritten and two people cannot both claim version 2.';
COMMENT ON COLUMN public.lead_quotes.decline_reason IS
  'Captured at the moment of the decline. This is the "why we lose" report; nobody reconstructs it a month later.';
COMMENT ON COLUMN public.lead_quotes.status IS
  'superseded is set on the previous version when a revision is recorded — the old row stays, it does not disappear.';

CREATE INDEX IF NOT EXISTS idx_lead_quotes_lead ON public.lead_quotes(lead_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_lead_quotes_status ON public.lead_quotes(status, quoted_at DESC);
-- The "why we lose" report reads only declines.
CREATE INDEX IF NOT EXISTS idx_lead_quotes_declined
  ON public.lead_quotes(decided_at DESC) WHERE status = 'declined';

COMMIT;

-- Verification:
--   SELECT count(*) FROM public.lead_quotes;   -- 0
--   -- the version pair is what keeps history honest; prove it bites:
--   -- (uses any real lead id)
--   -- INSERT INTO public.lead_quotes (lead_id, version, amount_cents) VALUES ('<id>', 1, 100000);
--   -- INSERT INTO public.lead_quotes (lead_id, version, amount_cents) VALUES ('<id>', 1, 90000);
--   -- expect: duplicate key value violates unique constraint "lead_quotes_lead_id_version_key"
