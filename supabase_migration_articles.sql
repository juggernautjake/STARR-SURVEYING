-- ============================================================================
-- MIGRATION: Required Reading Articles System
-- ============================================================================
-- Extends kb_articles with author/subtitle/images/estimated_minutes,
-- adds lesson_required_articles junction table and user_article_completions
-- tracking table for scroll-completion verification.
-- Run AFTER supabase_schema.sql
-- ============================================================================

-- Add new columns to kb_articles for richer article support
ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS author TEXT;
ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS subtitle TEXT;
ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]';
ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER DEFAULT 10;

-- Junction: which articles are required reading for which lessons
CREATE TABLE IF NOT EXISTS lesson_required_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES learning_lessons(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lesson_id, article_id)
);

-- User completions: who finished reading which article (scroll-to-bottom verified)
CREATE TABLE IF NOT EXISTS user_article_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  article_id UUID NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, article_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_req_articles_lesson ON lesson_required_articles(lesson_id);
CREATE INDEX IF NOT EXISTS idx_req_articles_article ON lesson_required_articles(article_id);
CREATE INDEX IF NOT EXISTS idx_article_completions_user ON user_article_completions(user_email);
CREATE INDEX IF NOT EXISTS idx_article_completions_article ON user_article_completions(article_id);

-- RLS policies
ALTER TABLE lesson_required_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_article_completions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_all" ON lesson_required_articles FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_all" ON user_article_completions FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
