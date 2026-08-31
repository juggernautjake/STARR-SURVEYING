-- ============================================================================
-- 621_research_documents_analysis_metadata.sql
--
-- Adds the column the full-extract route has been writing to since it was
-- written, and which has never existed.
--
-- ── WHAT WAS HAPPENING ─────────────────────────────────────────────────────
--
-- app/api/admin/research/[projectId]/documents/[docId]/full-extract/route.ts
-- runs the full extraction for one document and then does:
--
--     await supabaseAdmin
--       .from('research_documents')
--       .update({ analysis_metadata: { full_extraction_report: …,
--                                      extraction_atoms_count: …,
--                                      extraction_timestamp:   … } })
--       .eq('id', docId);
--
-- `analysis_metadata` is a column on **research_projects**, not on
-- research_documents. PostgREST rejects the update, and the call sits inside a
-- bare `try { … } catch { }` — so the extraction report has been discarded,
-- silently, every time. The route still returns 200 and the report still
-- reaches the caller in the response; what is lost is the persisted copy.
--
-- This is the `activity_log` defect again: that one wrote `action`/`details`
-- to a table whose columns are `action_type`/`metadata` and recorded NOTHING
-- for as long as it existed.
--
-- ── WHY ADD THE COLUMN RATHER THAN MOVE THE WRITE ──────────────────────────
--
-- The data is per-DOCUMENT: one extraction report, for one document, with that
-- document's atom count. `research_projects.analysis_metadata` is per-project,
-- so writing there would have each document overwrite the last — a second,
-- quieter bug in place of the first.
--
-- JSONB with a `'{}'` default, matching research_projects.analysis_metadata,
-- so the two read the same way.
-- ============================================================================

ALTER TABLE public.research_documents
  ADD COLUMN IF NOT EXISTS analysis_metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.research_documents.analysis_metadata IS
  'Per-document extraction metadata: full_extraction_report, extraction_atoms_count, '
  'extraction_timestamp. Written by the full-extract route. Added 2026-08-31 — the route '
  'had been writing to this name since it was authored, against a column that did not exist, '
  'inside a try/catch that swallowed the error.';
