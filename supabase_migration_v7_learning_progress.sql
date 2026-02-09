-- =============================================================================
-- Migration V7: Learning Progress, Assignments, ACC Enrollment, Content Tracking
-- =============================================================================
-- Run this in the Supabase SQL editor after all previous migrations.
-- =============================================================================

-- 1. Granular per-lesson progress tracking
CREATE TABLE IF NOT EXISTS user_lesson_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  module_id UUID NOT NULL,
  lesson_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','completed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  quiz_unlocked BOOLEAN DEFAULT false,
  content_interactions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, lesson_id)
);

ALTER TABLE user_lesson_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_ulp" ON user_lesson_progress FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ulp_user ON user_lesson_progress(user_email);
CREATE INDEX IF NOT EXISTS idx_ulp_module ON user_lesson_progress(module_id);
CREATE INDEX IF NOT EXISTS idx_ulp_status ON user_lesson_progress(user_email, status);

CREATE OR REPLACE TRIGGER update_ulp_updated_at
  BEFORE UPDATE ON user_lesson_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. Admin learning assignments
CREATE TABLE IF NOT EXISTS learning_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assigned_to TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  module_id UUID,
  lesson_id UUID,
  unlock_next BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','cancelled')),
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE learning_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_la" ON learning_assignments FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_la_assigned_to ON learning_assignments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_la_status ON learning_assignments(status);
CREATE INDEX IF NOT EXISTS idx_la_module ON learning_assignments(module_id);

CREATE OR REPLACE TRIGGER update_la_updated_at
  BEFORE UPDATE ON learning_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. ACC course enrollment gating
CREATE TABLE IF NOT EXISTS acc_course_enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  course_id TEXT NOT NULL,
  enrolled_by TEXT NOT NULL,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, course_id)
);

ALTER TABLE acc_course_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_ace" ON acc_course_enrollments FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ace_user ON acc_course_enrollments(user_email);

-- 4. Add ACC course linking and academic flag to learning_modules
ALTER TABLE learning_modules ADD COLUMN IF NOT EXISTS acc_course_id TEXT;
ALTER TABLE learning_modules ADD COLUMN IF NOT EXISTS is_academic BOOLEAN DEFAULT false;

-- 5. Add refresh_months to module_xp_config for custom refresh cycles
ALTER TABLE module_xp_config ADD COLUMN IF NOT EXISTS refresh_months INTEGER;

-- 6. Activity log cleanup: delete entries older than 4 weeks
-- Call this periodically (e.g., via cron or Supabase Edge Function)
CREATE OR REPLACE FUNCTION cleanup_old_activity_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM activity_log
  WHERE created_at < now() - INTERVAL '4 weeks';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 7. View: Module status summary per user
-- Joins modules with completion and lesson progress data
CREATE OR REPLACE VIEW user_module_status AS
SELECT
  lm.id AS module_id,
  lm.title,
  lm.order_index,
  lm.difficulty,
  lm.status AS module_status,
  lm.acc_course_id,
  lm.is_academic,
  mc.user_email,
  mc.is_current AS has_current_completion,
  mc.expires_at,
  mc.completed_at AS module_completed_at,
  CASE
    WHEN mc.is_current = true AND mc.expires_at > now() THEN 'completed'
    WHEN mc.is_current = true AND mc.expires_at <= now() THEN 'due'
    WHEN mc.completed_at IS NOT NULL AND (mc.is_current = false OR mc.expires_at <= now()) THEN 'needs_refreshing'
    ELSE NULL
  END AS completion_status
FROM learning_modules lm
LEFT JOIN module_completions mc ON mc.module_id = lm.id AND mc.module_type = 'learning_module';
