-- Migration: Add content_migrated flag to learning_lessons
-- Tracks which lessons have been converted from legacy HTML to structured lesson_blocks.
-- Run this BEFORE running the conversion script.

ALTER TABLE learning_lessons
  ADD COLUMN IF NOT EXISTS content_migrated BOOLEAN DEFAULT FALSE;

-- Index for quick filtering of unmigrated lessons
CREATE INDEX IF NOT EXISTS idx_lessons_content_migrated
  ON learning_lessons (content_migrated)
  WHERE content_migrated = FALSE;

-- Update any lessons that already have blocks in lesson_blocks to be marked as migrated
UPDATE learning_lessons SET content_migrated = TRUE
WHERE id IN (
  SELECT DISTINCT lesson_id FROM lesson_blocks
);
