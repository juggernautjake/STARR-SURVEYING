-- =============================================================================
-- STARR SURVEYING — V3 Feature Migration
-- =============================================================================
-- Adds:
--   1. Admin discussion threads (content issue tracking with escalation)
--   2. Notification escalation/urgency levels
--   3. Job messaging auto-linking (job_team ↔ conversation sync)
--   4. Additional learning content columns for future features
--   5. Conversation type expansion for admin/job threads
--
-- Run AFTER: supabase_schema.sql, supabase_schema_messaging.sql,
--            supabase_schema_jobs.sql, supabase_migration_assignments_notifications.sql
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ADMIN DISCUSSION THREADS
-- ─────────────────────────────────────────────────────────────────────────────
-- Tracks content issues, factual errors, and improvement suggestions.
-- Each thread links to a conversation (for messages) and a specific page.

CREATE TABLE IF NOT EXISTS admin_discussion_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Thread metadata
  title TEXT NOT NULL,
  description TEXT,
  thread_type TEXT NOT NULL DEFAULT 'general'
    CHECK (thread_type IN (
      'factual_error',    -- incorrect information in content
      'improvement',      -- suggestion for better content
      'bug',              -- something broken / not working
      'content_review',   -- general content review needed
      'compliance',       -- legal or regulatory concern
      'general'           -- catch-all
    )),

  -- Escalation / urgency
  escalation_level TEXT NOT NULL DEFAULT 'low'
    CHECK (escalation_level IN ('low', 'medium', 'high', 'critical')),

  -- Page context: where the issue was found
  page_path TEXT,             -- e.g. "/admin/learn/modules/abc-123/lessons/def-456"
  page_title TEXT,            -- human-readable page name
  content_type TEXT,          -- 'module', 'lesson', 'article', 'quiz', 'flashcard', 'fs_module'
  content_id UUID,            -- ID of the specific content item

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'wont_fix')),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,           -- email of the admin who resolved it
  resolution_notes TEXT,

  -- Linked conversation for discussion messages
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,

  -- Audit
  created_by TEXT NOT NULL,   -- email of the admin who created the thread
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discussion_threads_status ON admin_discussion_threads(status);
CREATE INDEX IF NOT EXISTS idx_discussion_threads_escalation ON admin_discussion_threads(escalation_level);
CREATE INDEX IF NOT EXISTS idx_discussion_threads_type ON admin_discussion_threads(thread_type);
CREATE INDEX IF NOT EXISTS idx_discussion_threads_content ON admin_discussion_threads(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_discussion_threads_created_by ON admin_discussion_threads(created_by);
CREATE INDEX IF NOT EXISTS idx_discussion_threads_page ON admin_discussion_threads(page_path);

ALTER TABLE admin_discussion_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "discussion_threads_service" ON admin_discussion_threads
  FOR ALL USING (true) WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. NOTIFICATION ESCALATION / URGENCY LEVELS
-- ─────────────────────────────────────────────────────────────────────────────
-- Add escalation_level column to the existing notifications table.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS escalation_level TEXT DEFAULT 'normal'
    CHECK (escalation_level IN ('low', 'normal', 'high', 'urgent', 'critical'));

-- Add a column to link notifications to discussion threads
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES admin_discussion_threads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_escalation ON notifications(escalation_level);
CREATE INDEX IF NOT EXISTS idx_notifications_thread ON notifications(thread_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CONVERSATION TYPE EXPANSION
-- ─────────────────────────────────────────────────────────────────────────────
-- Allow 'job_thread' and 'admin_discussion' as conversation types.

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_type_check;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_type_check
    CHECK (type IN ('direct', 'group', 'announcement', 'job_thread', 'admin_discussion'));


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. JOB MESSAGING — Auto-linking helpers
-- ─────────────────────────────────────────────────────────────────────────────
-- The jobs table already has conversation_id. We add a function that can be
-- called from the API to create a job thread and sync team members.

-- Helper function: create a job conversation if one doesn't exist
CREATE OR REPLACE FUNCTION ensure_job_conversation(
  p_job_id UUID,
  p_job_number TEXT,
  p_job_name TEXT,
  p_created_by TEXT
) RETURNS UUID AS $$
DECLARE
  v_conv_id UUID;
BEGIN
  -- Check if job already has a conversation
  SELECT conversation_id INTO v_conv_id FROM jobs WHERE id = p_job_id;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- Create a new job_thread conversation
  INSERT INTO conversations (title, type, created_by, metadata)
  VALUES (
    p_job_number || ' — ' || p_job_name,
    'job_thread',
    p_created_by,
    jsonb_build_object('job_id', p_job_id, 'job_number', p_job_number)
  )
  RETURNING id INTO v_conv_id;

  -- Link it to the job
  UPDATE jobs SET conversation_id = v_conv_id WHERE id = p_job_id;

  -- Add creator as owner of conversation
  INSERT INTO conversation_participants (conversation_id, user_email, role)
  VALUES (v_conv_id, p_created_by, 'owner')
  ON CONFLICT (conversation_id, user_email) DO NOTHING;

  -- Add all current team members
  INSERT INTO conversation_participants (conversation_id, user_email, role)
  SELECT v_conv_id, jt.user_email, 'member'
  FROM job_team jt
  WHERE jt.job_id = p_job_id AND jt.removed_at IS NULL AND jt.user_email != p_created_by
  ON CONFLICT (conversation_id, user_email) DO NOTHING;

  RETURN v_conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Helper function: sync job team ↔ conversation participants
-- Call this when a team member is added or removed from a job.
CREATE OR REPLACE FUNCTION sync_job_team_to_conversation(
  p_job_id UUID,
  p_user_email TEXT,
  p_action TEXT  -- 'add' or 'remove'
) RETURNS void AS $$
DECLARE
  v_conv_id UUID;
BEGIN
  SELECT conversation_id INTO v_conv_id FROM jobs WHERE id = p_job_id;

  IF v_conv_id IS NULL THEN
    RETURN; -- no conversation linked, nothing to do
  END IF;

  IF p_action = 'add' THEN
    INSERT INTO conversation_participants (conversation_id, user_email, role)
    VALUES (v_conv_id, p_user_email, 'member')
    ON CONFLICT (conversation_id, user_email) DO UPDATE SET left_at = NULL;
  ELSIF p_action = 'remove' THEN
    UPDATE conversation_participants
    SET left_at = now()
    WHERE conversation_id = v_conv_id AND user_email = p_user_email;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ADDITIONAL LEARNING CONTENT COLUMNS
-- ─────────────────────────────────────────────────────────────────────────────
-- Enhance existing tables with useful attributes for future features.

-- learning_modules: add difficulty, estimated time, tags, version tracking
ALTER TABLE learning_modules
  ADD COLUMN IF NOT EXISTS difficulty_level TEXT DEFAULT 'beginner'
    CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER DEFAULT 60,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'approved'
    CHECK (review_status IN ('draft', 'pending_review', 'approved', 'needs_revision')),
  ADD COLUMN IF NOT EXISTS last_reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;

-- learning_lessons: add estimated time, prerequisite, content format metadata
ALTER TABLE learning_lessons
  ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS difficulty_level TEXT DEFAULT 'beginner'
    CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'approved'
    CHECK (review_status IN ('draft', 'pending_review', 'approved', 'needs_revision')),
  ADD COLUMN IF NOT EXISTS content_format TEXT DEFAULT 'rich_text'
    CHECK (content_format IN ('rich_text', 'markdown', 'video', 'interactive', 'mixed')),
  ADD COLUMN IF NOT EXISTS prerequisite_lesson_id UUID REFERENCES learning_lessons(id) ON DELETE SET NULL;

-- kb_articles: add view count, helpful ratings, tags
ALTER TABLE kb_articles
  ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS helpful_yes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS helpful_no INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'approved'
    CHECK (review_status IN ('draft', 'pending_review', 'approved', 'needs_revision')),
  ADD COLUMN IF NOT EXISTS last_reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;

-- flashcards: add difficulty, times shown, success rate tracking
ALTER TABLE flashcards
  ADD COLUMN IF NOT EXISTS difficulty_level TEXT DEFAULT 'beginner'
    CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  ADD COLUMN IF NOT EXISTS times_shown INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS times_correct INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'approved'
    CHECK (review_status IN ('draft', 'pending_review', 'approved', 'needs_revision'));

-- question_bank: add explanation, difficulty tracking, report count
ALTER TABLE question_bank
  ADD COLUMN IF NOT EXISTS explanation TEXT,
  ADD COLUMN IF NOT EXISTS times_answered INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS times_correct INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS report_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'approved'
    CHECK (review_status IN ('draft', 'pending_review', 'approved', 'needs_revision'));

-- user_progress: add streak tracking, time spent
ALTER TABLE user_progress
  ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_time_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- fs_study_modules: add review status tracking
ALTER TABLE fs_study_modules
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'approved'
    CHECK (review_status IN ('draft', 'pending_review', 'approved', 'needs_revision')),
  ADD COLUMN IF NOT EXISTS last_reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. TRIGGERS FOR NEW TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- Auto-update updated_at on admin_discussion_threads
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_discussion_threads_updated') THEN
    CREATE TRIGGER trg_discussion_threads_updated
      BEFORE UPDATE ON admin_discussion_threads
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. MESSAGING SYSTEM ENHANCEMENTS
-- ─────────────────────────────────────────────────────────────────────────────
-- Enhance the existing messaging schema with additional fields for rich features.

-- Add rich text / formatting support flag to messages
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS content_format TEXT DEFAULT 'text'
    CHECK (content_format IN ('text', 'rich_text', 'markdown')),
  ADD COLUMN IF NOT EXISTS link_preview JSONB DEFAULT NULL;

-- Add typing indicator tracking (ephemeral, cleaned up periodically)
CREATE TABLE IF NOT EXISTS typing_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(conversation_id, user_email)
);

-- User online/presence tracking
CREATE TABLE IF NOT EXISTS user_presence (
  user_email TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'offline'
    CHECK (status IN ('online', 'away', 'busy', 'offline')),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Fieldbook enhancements: support rich text, media, and more
ALTER TABLE fieldbook_notes
  ADD COLUMN IF NOT EXISTS content_format TEXT DEFAULT 'text'
    CHECK (content_format IN ('text', 'rich_text', 'markdown')),
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- RLS for new tables
ALTER TABLE typing_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "typing_service" ON typing_indicators FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "presence_service" ON user_presence FOR ALL USING (true) WITH CHECK (true);

-- Index for presence lookups
CREATE INDEX IF NOT EXISTS idx_user_presence_status ON user_presence(status);
CREATE INDEX IF NOT EXISTS idx_typing_conv ON typing_indicators(conversation_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. NOTIFICATION PREFERENCES TABLE (if not in messaging schema)
-- ─────────────────────────────────────────────────────────────────────────────
-- Extend notification preferences for the full notification system
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- Add notification category index
CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(category);


COMMIT;

SELECT 'V3 feature migration complete: discussion threads, notification escalation, job messaging, messaging enhancements, learning content enhancements.' AS result;
