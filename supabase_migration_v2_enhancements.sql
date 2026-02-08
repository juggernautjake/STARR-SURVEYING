-- ============================================================================
-- Migration V2: Enhancements — Media Library, Recycle Bin, Practice Sessions,
-- Flashcard Spaced Repetition, and duplicate cleanup
-- ============================================================================

-- ============================================================================
-- 1. MEDIA LIBRARY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS media_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Untitled',
  caption TEXT,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'audio', 'document', 'url')),
  url TEXT NOT NULL,
  alt_text TEXT,
  link_url TEXT,
  is_clickable BOOLEAN DEFAULT false,
  resolution TEXT DEFAULT 'original',
  tags TEXT[] DEFAULT '{}',
  uploaded_by TEXT NOT NULL,
  source_context TEXT, -- e.g. 'lesson', 'article', 'question'
  source_id UUID,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_library_type ON media_library(media_type);
CREATE INDEX IF NOT EXISTS idx_media_library_deleted ON media_library(deleted_at);
CREATE INDEX IF NOT EXISTS idx_media_library_uploaded ON media_library(uploaded_by);

-- ============================================================================
-- 2. RECYCLE BIN TABLE (generic soft delete for any content type)
-- ============================================================================

CREATE TABLE IF NOT EXISTS recycle_bin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_table TEXT NOT NULL,
  original_id UUID NOT NULL,
  item_title TEXT,
  item_type TEXT, -- module, lesson, article, question, flashcard, media
  item_data JSONB NOT NULL, -- full serialized row
  deleted_by TEXT NOT NULL,
  deleted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '90 days')
);

CREATE INDEX IF NOT EXISTS idx_recycle_bin_table ON recycle_bin(original_table);
CREATE INDEX IF NOT EXISTS idx_recycle_bin_type ON recycle_bin(item_type);
CREATE INDEX IF NOT EXISTS idx_recycle_bin_deleted_by ON recycle_bin(deleted_by);

-- ============================================================================
-- 3. PRACTICE SESSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS practice_sessions (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  problems TEXT, -- JSON array of full problem data
  config TEXT, -- JSON config used to generate
  total_problems INTEGER DEFAULT 0,
  correct_answers INTEGER DEFAULT 0,
  score_percent NUMERIC DEFAULT 0,
  time_spent_seconds INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_user ON practice_sessions(user_email);

-- ============================================================================
-- 4. FLASHCARD LESSON DISCOVERY TRACKING
-- ============================================================================

-- Track which flashcards a user has "discovered" through lessons
CREATE TABLE IF NOT EXISTS user_flashcard_discovery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  card_id UUID NOT NULL,
  card_source TEXT DEFAULT 'builtin',
  lesson_id UUID,
  module_id UUID,
  discovered_at TIMESTAMPTZ DEFAULT now(),
  next_yearly_review_at TIMESTAMPTZ DEFAULT (now() + interval '365 days'),
  review_interval_days INTEGER DEFAULT 365,
  times_reviewed INTEGER DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ,
  UNIQUE(user_email, card_id)
);

CREATE INDEX IF NOT EXISTS idx_flashcard_discovery_user ON user_flashcard_discovery(user_email);
CREATE INDEX IF NOT EXISTS idx_flashcard_discovery_review ON user_flashcard_discovery(next_yearly_review_at);

-- Add lesson/module link columns to flashcards if not present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'flashcards' AND column_name = 'lesson_id') THEN
    ALTER TABLE flashcards ADD COLUMN lesson_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'flashcards' AND column_name = 'module_id') THEN
    ALTER TABLE flashcards ADD COLUMN module_id UUID;
  END IF;
END $$;

-- ============================================================================
-- 5. ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================================================

-- Add xp_reward to learning_lessons if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'learning_lessons' AND column_name = 'xp_reward') THEN
    ALTER TABLE learning_lessons ADD COLUMN xp_reward INTEGER DEFAULT 50;
  END IF;
END $$;

-- Add xp_reward to learning_modules if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'learning_modules' AND column_name = 'xp_reward') THEN
    ALTER TABLE learning_modules ADD COLUMN xp_reward INTEGER DEFAULT 200;
  END IF;
END $$;

-- Add is_fs_required flag to modules
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'learning_modules' AND column_name = 'is_fs_required') THEN
    ALTER TABLE learning_modules ADD COLUMN is_fs_required BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Add soft-delete columns to modules
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'learning_modules' AND column_name = 'deleted_at') THEN
    ALTER TABLE learning_modules ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add soft-delete columns to lessons
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'learning_lessons' AND column_name = 'deleted_at') THEN
    ALTER TABLE learning_lessons ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add soft-delete to question_bank
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'question_bank' AND column_name = 'deleted_at') THEN
    ALTER TABLE question_bank ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add soft-delete to flashcards
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'flashcards' AND column_name = 'deleted_at') THEN
    ALTER TABLE flashcards ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add soft-delete to kb_articles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kb_articles' AND column_name = 'deleted_at') THEN
    ALTER TABLE kb_articles ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add best_mock_score to statistics tracking
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fs_module_progress' AND column_name = 'best_mock_score') THEN
    ALTER TABLE fs_module_progress ADD COLUMN best_mock_score INTEGER DEFAULT 0;
  END IF;
END $$;

-- ============================================================================
-- 6. REMOVE DUPLICATE MODULES/LESSONS (keep the one with lowest id/oldest)
-- ============================================================================

-- Remove duplicate learning_modules (keep first inserted)
DELETE FROM learning_modules a
USING learning_modules b
WHERE a.title = b.title
  AND a.id > b.id
  AND a.deleted_at IS NULL
  AND b.deleted_at IS NULL;

-- Remove duplicate learning_lessons within the same module
DELETE FROM learning_lessons a
USING learning_lessons b
WHERE a.title = b.title
  AND a.module_id = b.module_id
  AND a.id > b.id
  AND a.deleted_at IS NULL
  AND b.deleted_at IS NULL;

-- Remove duplicate flashcards (keep first)
DELETE FROM flashcards a
USING flashcards b
WHERE a.term = b.term
  AND a.definition = b.definition
  AND a.id > b.id;

-- ============================================================================
-- 7. ADD PAGE TITLE MAPPINGS FOR NEW PAGES
-- ============================================================================
-- (Handled in AdminLayoutClient.tsx, not SQL)

-- Done!
