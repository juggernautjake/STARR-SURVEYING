-- 631_research_documents_relevance.sql
-- The relevance verdict lives on the DOCUMENT row.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────────────────────
--
-- Seed 373 added `relevance` and `relevance_classification` to `extracted_data_points`. Plan E3
-- (2026-09-03) wired the generic pipeline's relevance pre-filter and wrote its verdict to
-- `research_documents.relevance` — a column that table never had. PostgREST answered PGRST204
-- ("Could not find the 'relevance' column of 'research_documents'"), the write sat inside a
-- discarded promise, and every "set aside as unrelated" mark was lost. Found by the 2026-09-03
-- review pass (merge-diff MD-1), the fifth "a write that cannot execute" in this schema.
--
-- The document is the right home: a reviewer decides whether a DEED belongs to the tract, and the
-- data points extracted from it inherit that answer. Same vocabulary as 373 so the two agree.

ALTER TABLE research_documents
  ADD COLUMN IF NOT EXISTS relevance TEXT;

ALTER TABLE research_documents
  ADD COLUMN IF NOT EXISTS relevance_classification JSONB;

ALTER TABLE research_documents
  DROP CONSTRAINT IF EXISTS research_documents_relevance_check;

ALTER TABLE research_documents
  ADD CONSTRAINT research_documents_relevance_check
  CHECK (relevance IS NULL OR relevance IN ('subject', 'adjoiner', 'unrelated', 'unknown'));

COMMENT ON COLUMN research_documents.relevance IS
  'Whether this document concerns the subject tract: subject / adjoiner / unrelated / unknown. Written by the relevance pre-filter (plan E3); a reviewer may overturn it. Same vocabulary as extracted_data_points.relevance (seed 373).';
COMMENT ON COLUMN research_documents.relevance_classification IS
  'How the relevance verdict was reached: { by, at, reason }. Seed 631.';
