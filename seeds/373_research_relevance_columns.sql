-- ============================================================================
-- 373_research_relevance_columns.sql
--
-- §10.3 (live-pipeline half) of
-- docs/planning/in-progress/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.
--
-- Adds `relevance` + `parcel_ref` + `relevance_classification` to the
-- existing `extracted_data_points` table (seeds/090) so the §10
-- helpers from slices 3 / 4 / 5 / 12 can stamp every extracted datum
-- with subject/adjoiner/unrelated/unknown tagging at write-time. The
-- existing route handlers can be updated to set these columns
-- without a follow-up migration.
--
-- The relevance values must match the RelevanceTag union from
-- lib/research/canonical-schema.ts (slice 1). A CHECK constraint
-- enforces the membership so a buggy writer can't sneak an unknown
-- value into the column.
--
-- Idempotent. Safe to re-apply on any environment.
-- ============================================================================

BEGIN;

-- ── §10.3 relevance columns ───────────────────────────────────────────────
ALTER TABLE public.extracted_data_points
  ADD COLUMN IF NOT EXISTS relevance TEXT;

ALTER TABLE public.extracted_data_points
  ADD COLUMN IF NOT EXISTS parcel_ref TEXT;

-- The full slice-3 RelevanceClassification result: { tag,
-- matched_parcel_ref, confidence, rationale }. Stored for audit so a
-- later "why was this dropped?" review reproduces the decision
-- without re-running extraction.
ALTER TABLE public.extracted_data_points
  ADD COLUMN IF NOT EXISTS relevance_classification JSONB;

-- ── Enum-style CHECK on the membership ────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.extracted_data_points
    ADD CONSTRAINT extracted_data_points_relevance_chk
    CHECK (relevance IS NULL OR relevance IN ('subject', 'adjoiner', 'unrelated', 'unknown'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Partial indexes for the §10.3 filter patterns ─────────────────────────
-- "Show me only subject + adjoiner data points for this project" is the
-- most-common read path on the §10 pipeline — drop everything else
-- before display.
CREATE INDEX IF NOT EXISTS idx_extracted_data_points_subject_adjoiner
  ON public.extracted_data_points(research_project_id, relevance)
  WHERE relevance IN ('subject', 'adjoiner');

-- "Show me everything dropped as unrelated" for the audit / review
-- view (so a human can confirm we're not over-dropping).
CREATE INDEX IF NOT EXISTS idx_extracted_data_points_unrelated_audit
  ON public.extracted_data_points(research_project_id, relevance)
  WHERE relevance = 'unrelated';

COMMENT ON COLUMN public.extracted_data_points.relevance IS
  '§10.3 — RelevanceTag {subject|adjoiner|unrelated|unknown} from lib/research/canonical-schema.ts. The slice-3 classifyRelevance() helper stamps this at extraction time.';

COMMENT ON COLUMN public.extracted_data_points.parcel_ref IS
  '§10.3 — Parcel id (subject or adjoiner) the datum belongs to. Lets the boundary builder cross-check against research_projects.subject_parcel_id without re-classifying.';

COMMENT ON COLUMN public.extracted_data_points.relevance_classification IS
  '§10.3 — Full slice-3 RelevanceClassification result (confidence + rationale + matched_parcel_ref). Stored for audit so a later review reproduces the decision without re-running extraction.';

COMMIT;
