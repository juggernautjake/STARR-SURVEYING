-- ============================================================================
-- 509_ad_spend_daily.sql
--
-- A11 of docs/planning/in-progress/LEAD_TO_CASH_ATTRIBUTION_AND_GOOGLE_ADS_2026-07-31.md.
-- (Doc says seed 474; taken. Its seed numbers are stale.)
--
-- ── THE OWNER ASKED FOR TRUE LEAD COSTS ─────────────────────────────────────
--
-- Without spend we have conversions and no denominator. "We got 14 leads" is
-- not a number anyone can act on; "we got 14 leads at $63 each and won 3 jobs
-- at $294 each" is.
--
-- ── WHY cost_micros AND NOT dollars ─────────────────────────────────────────
--
-- Because that is what the Google Ads API returns, and converting on the way in
-- means every future disagreement with the Ads UI is a rounding argument nobody
-- can settle. Stored exactly as reported; divided at the point of display.
--
-- ── WHY MANUAL ENTRY IS A FIRST-CLASS SOURCE, NOT A HACK ────────────────────
--
-- The API needs a developer token that has not arrived. A month with a spend
-- figure typed off the Ads invoice is a rough denominator; a month with no
-- figure at all makes every cost-per-lead number on the dashboard silently
-- wrong — it would divide by the spend we happen to have, which is not the
-- spend that happened.
--
-- So `source` is recorded per row and shown on the dashboard. A number you know
-- is approximate is usable. A number you believe is exact and is not, is worse
-- than nothing.
--
-- ── WHY platform IS NOT A CHECK CONSTRAINT ──────────────────────────────────
--
-- Facebook and Instagram spend land in the same table the day anyone runs an ad
-- there, and a CHECK would turn that into a migration. The dashboard groups by
-- whatever is present.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.ad_spend_daily (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spend_date     DATE        NOT NULL,
  platform       TEXT        NOT NULL DEFAULT 'google_ads',
  -- '' means account-level / no campaign, NOT unknown. Deliberately NOT NULL:
  -- NULLs never collide in a unique index, so a nullable campaign_id would let
  -- the same manual monthly total insert again on every run and silently double
  -- the spend. It also lets the upsert conflict on plain columns — PostgREST
  -- cannot target an expression index, so a COALESCE index would look right and
  -- fail at runtime.
  campaign_id    TEXT        NOT NULL DEFAULT '',
  campaign_name  TEXT,
  ad_group_id    TEXT        NOT NULL DEFAULT '',
  ad_group_name  TEXT,
  impressions    BIGINT      NOT NULL DEFAULT 0,
  clicks         BIGINT      NOT NULL DEFAULT 0,
  -- Exactly as Google reports it. $12.34 is 12_340_000.
  cost_micros    BIGINT      NOT NULL DEFAULT 0,
  -- GOOGLE'S conversion count, deliberately kept beside ours rather than
  -- replacing it. When the two disagree, that difference is the attribution
  -- coverage story A12 has to tell — collapsing them would erase the evidence.
  conversions    NUMERIC(12,2) NOT NULL DEFAULT 0,
  conversion_value_micros BIGINT NOT NULL DEFAULT 0,
  -- 'api' | 'manual'. Shown on the dashboard: a figure typed off an invoice is
  -- usable when you know it is approximate and misleading when you do not.
  source         TEXT        NOT NULL DEFAULT 'api'
                 CHECK (source IN ('api','manual')),
  entered_by     TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per day per campaign per ad group per platform.
--
-- A plain-column UNIQUE CONSTRAINT, not an expression index, because the nightly
-- import upserts through PostgREST and `on_conflict` can only name real columns.
-- An expression index would read as correct and fail at runtime.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_ad_spend_daily_grain'
  ) THEN
    ALTER TABLE public.ad_spend_daily
      ADD CONSTRAINT uq_ad_spend_daily_grain
      UNIQUE (spend_date, platform, campaign_id, ad_group_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ad_spend_date ON public.ad_spend_daily(spend_date DESC);
CREATE INDEX IF NOT EXISTS idx_ad_spend_campaign ON public.ad_spend_daily(campaign_id, spend_date DESC)
  WHERE campaign_id <> '';

COMMENT ON TABLE public.ad_spend_daily IS
  'Ad spend, so "cost per lead" has a denominator. cost_micros is stored exactly as the Ads API reports it — converting on the way in makes every later disagreement with the Ads UI a rounding argument nobody can settle.';
COMMENT ON COLUMN public.ad_spend_daily.source IS
  'api | manual. Surfaced on the dashboard: a spend figure typed off an invoice is usable when you know it is approximate, and misleading when you do not.';
COMMENT ON COLUMN public.ad_spend_daily.conversions IS
  'GOOGLE''S count, kept beside ours rather than replacing it. Where the two disagree, the difference IS the attribution-coverage story.';

COMMIT;

-- Verification:
--   SELECT count(*) FROM public.ad_spend_daily;  -- 0 until the first import or manual entry
--   SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_ad_spend_daily_grain';
