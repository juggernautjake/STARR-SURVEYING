-- ============================================================================
-- 508_conversion_adjustments.sql
--
-- A9 of docs/planning/in-progress/LEAD_TO_CASH_ATTRIBUTION_AND_GOOGLE_ADS_2026-07-31.md.
--
-- ── WHY A `kind` COLUMN RATHER THAN A SECOND TABLE ──────────────────────────
--
-- A conversion upload and an adjustment upload fail the same way (a
-- `partial_failure` inside an HTTP 200), carry the same error text, and are
-- read by the same person on the same screen. Two tables would mean two
-- queries, two renderers, and a real chance the adjustment log is the one
-- nobody remembers to look at.
--
-- But they must stay TELLABLE APART, because "3 rejected" means different
-- things: a rejected conversion is revenue Google never heard about; a rejected
-- adjustment is revenue Google heard about at the WRONG NUMBER — the estimate
-- is still in there, still being bid on.
--
-- ── WHY THE DEFAULT IS 'conversion' ─────────────────────────────────────────
--
-- Every row written before this seed was a click-conversion upload. Backfilling
-- them as anything else would be inventing history.
-- ============================================================================

BEGIN;

ALTER TABLE public.conversion_upload_log
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'conversion';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversion_upload_log_kind_check'
  ) THEN
    ALTER TABLE public.conversion_upload_log
      ADD CONSTRAINT conversion_upload_log_kind_check
      CHECK (kind IN ('conversion','adjustment'));
  END IF;
END $$;

-- RESTATEMENT / RETRACTION. Null for a plain conversion row, which is why it is
-- nullable rather than defaulted — a conversion has no adjustment type, and
-- writing one in would be a small lie the admin screen would then have to undo.
ALTER TABLE public.conversion_upload_log
  ADD COLUMN IF NOT EXISTS adjustment_type TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversion_upload_log_adj_type_check'
  ) THEN
    ALTER TABLE public.conversion_upload_log
      ADD CONSTRAINT conversion_upload_log_adj_type_check
      CHECK (adjustment_type IS NULL OR adjustment_type IN ('RESTATEMENT','RETRACTION'));
  END IF;
END $$;

COMMENT ON COLUMN public.conversion_upload_log.kind IS
  'conversion | adjustment. A rejected conversion is revenue Google never heard about; a rejected adjustment is revenue Google heard about at the WRONG number — the estimate is still in the account, still being bid on.';

CREATE INDEX IF NOT EXISTS idx_upload_log_kind ON public.conversion_upload_log(kind, created_at DESC);

COMMIT;

-- Verification:
--   SELECT kind, adjustment_type, count(*) FROM public.conversion_upload_log GROUP BY 1,2;
--   \d public.conversion_upload_log
