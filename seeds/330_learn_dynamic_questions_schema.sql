-- ============================================================================
-- 330_learn_dynamic_questions_schema.sql
-- Schema repair + enablement for dynamic (templated, randomized) quiz questions
-- and for saving quiz attempts.
--
-- WHY (two live bugs this fixes, independent of the new Land Law course):
--   1. app/api/admin/learn/quizzes/route.ts (GET + POST) selects and writes the
--      columns question_bank.template_id / is_dynamic / tolerance. Those columns
--      were never created by any migration, so the grader's
--          select(... , template_id, is_dynamic, tolerance)
--      throws "column does not exist" and EVERY quiz submission 500s. Adding the
--      columns (idempotently) restores grading and unlocks template-linked,
--      per-attempt randomized questions (the engine in lib/problemEngine.ts).
--   2. quiz_attempts.org_id is NOT NULL with no default and no trigger, yet the
--      POST insert never sets it -> null-violation on every attempt save. Default
--      it to the Starr org so saves succeed (single-tenant in practice; a future
--      multi-tenant write can still pass an explicit org_id).
--
-- Safe + idempotent: ADD COLUMN IF NOT EXISTS / ALTER COLUMN SET DEFAULT only.
-- ============================================================================

BEGIN;

-- ── question_bank: dynamic-question support ──────────────────────────────────
ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS is_dynamic  boolean DEFAULT false;
ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS template_id uuid;
ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS tolerance   numeric DEFAULT 0.01;

-- FK to problem_templates (nullable; ON DELETE SET NULL so deleting a template
-- degrades the question to a static stub rather than cascading a delete).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'question_bank_template_id_fkey'
      AND table_name = 'question_bank'
  ) THEN
    ALTER TABLE question_bank
      ADD CONSTRAINT question_bank_template_id_fkey
      FOREIGN KEY (template_id) REFERENCES problem_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS question_bank_template_id_idx
  ON question_bank (template_id) WHERE template_id IS NOT NULL;

-- ── lesson_blocks: align block_type CHECK with the actual renderer ──────────
-- The renderer (app/admin/learn/modules/[id]/[lessonId]/page.tsx) supports far
-- more block types than the original CHECK allowed (it only permitted
-- text/image/video/slideshow/file/quiz/callout/divider/embed/table). Lessons
-- authored with the richer set (key_takeaways, equation, accordion,
-- link_reference, highlight, columns, tabs, html, popup_article, …) were being
-- rejected at insert even though they render fine. Widen the constraint to the
-- renderer's full vocabulary so structured lessons can be seeded/edited.
ALTER TABLE lesson_blocks DROP CONSTRAINT IF EXISTS lesson_blocks_block_type_check;
ALTER TABLE lesson_blocks ADD CONSTRAINT lesson_blocks_block_type_check
  CHECK (block_type = ANY (ARRAY[
    'text','html','image','video','audio','slideshow','file','quiz','callout',
    'highlight','key_takeaways','equation','divider','embed','table','tabs',
    'accordion','columns','link_reference','flashcard','popup_article',
    'backend_link','practice_problem'
  ]::text[]));

-- ── quiz_attempts: make org_id insert-safe ──────────────────────────────────
-- Starr Surveying tenant (see organizations: 00000000-0000-0000-0000-000000000001).
ALTER TABLE quiz_attempts
  ALTER COLUMN org_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- Backfill any rows that somehow lack it (defensive; table is normally populated).
UPDATE quiz_attempts SET org_id = '00000000-0000-0000-0000-000000000001'
  WHERE org_id IS NULL;

COMMIT;

SELECT 'question_bank dynamic columns + quiz_attempts org_id default ensured.' AS status;
