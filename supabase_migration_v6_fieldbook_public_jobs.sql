-- =============================================================================
-- STARR SURVEYING — Fieldbook Public/Private & Job Notes Migration
-- =============================================================================
-- Adds is_public flag, job association fields to fieldbook_notes.
-- Run AFTER supabase_migration_v4_fieldbook.sql.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ADD PUBLIC/PRIVATE AND JOB FIELDS TO fieldbook_notes
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fieldbook_notes
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS job_id UUID,
  ADD COLUMN IF NOT EXISTS job_name TEXT,
  ADD COLUMN IF NOT EXISTS job_number TEXT;

-- Index for filtering public notes and job-linked notes
CREATE INDEX IF NOT EXISTS idx_fn_public ON fieldbook_notes(user_email, is_public)
  WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_fn_job ON fieldbook_notes(job_id)
  WHERE job_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. VIEW: All public job notes (across all users for job collaboration)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public_job_notes AS
SELECT
  fn.id,
  fn.user_email,
  fn.title,
  fn.content,
  fn.job_id,
  fn.job_name,
  fn.job_number,
  fn.media,
  fn.tags,
  fn.created_at,
  fn.updated_at
FROM fieldbook_notes fn
WHERE fn.is_public = true
  AND fn.job_id IS NOT NULL
ORDER BY fn.created_at DESC;


COMMIT;

SELECT 'Fieldbook public/job notes migration complete.' AS result;
