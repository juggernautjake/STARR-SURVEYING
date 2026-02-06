-- ============================================================================
-- STARR SURVEYING — Phase 3 Schema Additions
-- Run this AFTER the v2 schema (supabase_schema.sql)
-- Adds: lesson_blocks, lesson_versions, media_library, activity_log,
--        flashcard_reviews (spaced repetition)
-- ============================================================================

-- ============================================================================
-- 1. LESSON BLOCKS (block-based lesson content)
-- ============================================================================
CREATE TABLE IF NOT EXISTS lesson_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES learning_lessons(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL CHECK (block_type IN (
    'text', 'image', 'video', 'slideshow', 'file',
    'quiz', 'callout', 'divider', 'embed', 'table'
  )),
  content JSONB NOT NULL DEFAULT '{}',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 2. LESSON VERSIONS (version history for lessons)
-- ============================================================================
CREATE TABLE IF NOT EXISTS lesson_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES learning_lessons(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  blocks_snapshot JSONB NOT NULL DEFAULT '[]',
  saved_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 3. MEDIA LIBRARY (centralized file/media storage references)
-- ============================================================================
CREATE TABLE IF NOT EXISTS media_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER DEFAULT 0,
  bucket TEXT DEFAULT 'lesson-media',
  uploaded_by TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 4. ACTIVITY LOG (audit trail for all actions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 5. FLASHCARD REVIEWS (spaced repetition tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS flashcard_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  card_id UUID NOT NULL,
  card_source TEXT NOT NULL CHECK (card_source IN ('builtin', 'user')),
  ease_factor NUMERIC(4,2) DEFAULT 2.50,
  interval_days INTEGER DEFAULT 0,
  repetitions INTEGER DEFAULT 0,
  next_review_at TIMESTAMPTZ DEFAULT now(),
  last_rating TEXT CHECK (last_rating IN ('again', 'hard', 'good', 'easy')),
  times_reviewed INTEGER DEFAULT 0,
  times_correct INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, card_id, card_source)
);

-- ============================================================================
-- TRIGGERS
-- ============================================================================
CREATE TRIGGER trg_lesson_blocks_upd BEFORE UPDATE ON lesson_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_flashcard_reviews_upd BEFORE UPDATE ON flashcard_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE lesson_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_lesson_blocks" ON lesson_blocks FOR SELECT USING (true);
CREATE POLICY "rw_lesson_blocks_admin" ON lesson_blocks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "read_lesson_versions" ON lesson_versions FOR SELECT USING (true);
CREATE POLICY "rw_lesson_versions_admin" ON lesson_versions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "read_media" ON media_library FOR SELECT USING (true);
CREATE POLICY "rw_media_admin" ON media_library FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "read_activity" ON activity_log FOR SELECT USING (true);
CREATE POLICY "rw_activity" ON activity_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "rw_flashcard_reviews" ON flashcard_reviews FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_lb_lesson ON lesson_blocks(lesson_id);
CREATE INDEX idx_lb_order ON lesson_blocks(lesson_id, order_index);
CREATE INDEX idx_lv_lesson ON lesson_versions(lesson_id);
CREATE INDEX idx_ml_uploaded ON media_library(uploaded_by);
CREATE INDEX idx_ml_type ON media_library(file_type);
CREATE INDEX idx_al_user ON activity_log(user_email);
CREATE INDEX idx_al_action ON activity_log(action_type);
CREATE INDEX idx_al_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_al_created ON activity_log(created_at DESC);
CREATE INDEX idx_fr_user ON flashcard_reviews(user_email);
CREATE INDEX idx_fr_next ON flashcard_reviews(user_email, next_review_at);
CREATE INDEX idx_fr_card ON flashcard_reviews(card_id, card_source);

SELECT 'Phase 3 schema additions created successfully!' AS result;
