-- ============================================================================
-- Migration: Add study_references JSONB column to question_bank
-- ============================================================================
-- Adds a JSONB column for linking questions to study materials (topics, lessons,
-- modules). When a student misses a question, the system can recommend specific
-- study material with direct links.
--
-- Format: array of objects, each with:
--   { "type": "topic"|"lesson"|"module", "id": "uuid", "label": "Title" }
--
-- Run AFTER supabase_schema.sql
-- Safe to re-run.
-- ============================================================================

-- Add study_references column if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'question_bank' AND column_name = 'study_references'
  ) THEN
    ALTER TABLE question_bank ADD COLUMN study_references JSONB DEFAULT '[]';
    COMMENT ON COLUMN question_bank.study_references IS 'Array of study material links: [{"type":"topic|lesson|module","id":"uuid","label":"Title"}]';
  END IF;
END $$;
