-- ============================================================================
-- Migration: Enhance lesson_blocks with new block types and style support
-- ============================================================================
-- Adds: html, audio, link_reference, flashcard, popup_article, backend_link block types
-- Adds: style JSONB column for per-block visual customization
-- Run AFTER supabase_schema.sql. Safe to re-run.
-- ============================================================================

-- 1. Update block_type CHECK constraint to include new types
-- Drop the old constraint and add a new one
DO $$
BEGIN
  -- Drop existing constraint (name may vary)
  BEGIN
    ALTER TABLE lesson_blocks DROP CONSTRAINT IF EXISTS lesson_blocks_block_type_check;
  EXCEPTION WHEN undefined_object THEN
    -- Constraint doesn't exist, that's fine
  END;

  -- Add updated constraint with new block types
  ALTER TABLE lesson_blocks ADD CONSTRAINT lesson_blocks_block_type_check
    CHECK (block_type IN (
      'text', 'image', 'video', 'slideshow', 'file',
      'quiz', 'callout', 'divider', 'embed', 'table',
      'html', 'audio', 'link_reference',
      'flashcard', 'popup_article', 'backend_link'
    ));
END $$;

-- 2. Add style JSONB column for per-block visual customization
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lesson_blocks' AND column_name = 'style'
  ) THEN
    ALTER TABLE lesson_blocks ADD COLUMN style JSONB DEFAULT NULL;
    COMMENT ON COLUMN lesson_blocks.style IS 'Per-block visual styling: {backgroundColor, borderColor, borderWidth, borderRadius, boxShadow, width, collapsible, collapsedLabel, hidden, hiddenLabel}';
  END IF;
END $$;
