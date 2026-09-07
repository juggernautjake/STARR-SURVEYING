-- 632_research_documents_round.sql
-- Which research ROUND found each document.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────────────────────
--
-- The user-initiated research ⇄ analysis loop (plan ITERATIVE_RESEARCH_ANALYSIS_LOOP, 2026-09-06)
-- is round-based: research gathers, analysis compiles new leads, the user seeds ANOTHER research
-- pass with them. `research_projects.analysis_metadata.researchRound` says which round the project
-- is on; nothing said which round a given DOCUMENT arrived in, so a reviewer looking at a deed
-- could not tell whether it was the original find or what the follow-up added. Plan 3.4 deferred
-- exactly this column until per-document provenance was wanted; it is written now by the worker's
-- filing path (artifact-uploader → resilientInsertDocument) for every document a run files.
--
-- Nullable on purpose: documents filed before this seed, and user uploads, have no round.

ALTER TABLE research_documents
  ADD COLUMN IF NOT EXISTS research_round INTEGER;

ALTER TABLE research_documents
  DROP CONSTRAINT IF EXISTS research_documents_research_round_check;

ALTER TABLE research_documents
  ADD CONSTRAINT research_documents_research_round_check
  CHECK (research_round IS NULL OR research_round >= 1);

COMMENT ON COLUMN research_documents.research_round IS
  'The research round (1 = the first run; N = the (N-1)th user-initiated follow-up) whose run filed this document. Null for user uploads and for rows filed before seed 632. Mirrors research_projects.analysis_metadata.researchRound at filing time.';
