-- ============================================================================
-- STARR SURVEYING — Consolidated Learning Platform Schema
-- ============================================================================
-- This is the SINGLE SOURCE OF TRUTH for all learning platform tables.
-- Replaces: supabase_schema.sql (v2), supabase_schema_v3.sql,
--           supabase_migration_v2_enhancements.sql,
--           supabase_migration_question_types.sql,
--           supabase_migration_xp_rewards_v1.sql,
--           supabase_migration_learning_credits_payouts.sql,
--           supabase_migration_error_reports.sql
--
-- RUN ORDER:
--   1. This file (schema + system seed data)
--   2. supabase_schema_jobs.sql (job management)
--   3. supabase_schema_messaging.sql (messaging)
--   4. supabase_schema_payroll.sql (payroll)
--   5. supabase_migration_assignments_notifications.sql
--   6. supabase_migration_time_payroll_v2.sql
--   7. supabase_seed_curriculum.sql (all educational content)
-- ============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- UTILITY FUNCTIONS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 1: CORE LEARNING TABLES
-- ══════════════════════════════════════════════════════════════════════════════

-- 1.1 Learning Modules
DROP TABLE IF EXISTS learning_modules CASCADE;
CREATE TABLE learning_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  difficulty TEXT CHECK (difficulty IN ('beginner','intermediate','advanced')) DEFAULT 'beginner',
  estimated_hours NUMERIC(4,1) DEFAULT 1.0,
  order_index INTEGER NOT NULL DEFAULT 0,
  status TEXT CHECK (status IN ('draft','published')) DEFAULT 'draft',
  tags TEXT[] DEFAULT '{}',
  xp_reward INTEGER DEFAULT 200,
  is_fs_required BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.2 Learning Lessons
DROP TABLE IF EXISTS learning_lessons CASCADE;
CREATE TABLE learning_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES learning_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  key_takeaways TEXT[] DEFAULT '{}',
  order_index INTEGER NOT NULL DEFAULT 0,
  estimated_minutes INTEGER DEFAULT 15,
  resources JSONB DEFAULT '[]',
  videos JSONB DEFAULT '[]',
  tags TEXT[] DEFAULT '{}',
  status TEXT CHECK (status IN ('draft','published')) DEFAULT 'draft',
  xp_reward INTEGER DEFAULT 50,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.3 Learning Topics (searchable subtopics within lessons)
DROP TABLE IF EXISTS learning_topics CASCADE;
CREATE TABLE learning_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES learning_lessons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  keywords TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.4 Knowledge Base Articles
DROP TABLE IF EXISTS kb_articles CASCADE;
CREATE TABLE kb_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  content TEXT NOT NULL,
  excerpt TEXT,
  status TEXT CHECK (status IN ('draft','published')) DEFAULT 'draft',
  module_id UUID REFERENCES learning_modules(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES learning_lessons(id) ON DELETE SET NULL,
  xp_reward INTEGER DEFAULT 0,  -- 0 unless article has a quiz
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.5 Question Bank (supports article quizzes, lesson quizzes, exam prep)
DROP TABLE IF EXISTS question_bank CASCADE;
CREATE TABLE question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text TEXT NOT NULL,
  question_type TEXT CHECK (question_type IN (
    'multiple_choice','true_false','short_answer',
    'fill_blank','multi_select','numeric_input','math_template'
  )) DEFAULT 'multiple_choice',
  options JSONB DEFAULT '[]',
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  difficulty TEXT CHECK (difficulty IN ('easy','medium','hard')) DEFAULT 'medium',
  module_id UUID,          -- learning_modules or fs_study_modules UUID (no FK — polymorphic)
  lesson_id UUID REFERENCES learning_lessons(id) ON DELETE SET NULL,
  topic_id UUID REFERENCES learning_topics(id) ON DELETE SET NULL,
  article_id UUID REFERENCES kb_articles(id) ON DELETE SET NULL,
  exam_category TEXT,      -- 'FS', 'FS-MOCK', 'article-quiz', etc.
  tags TEXT[] DEFAULT '{}',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.6 Quiz Attempts
DROP TABLE IF EXISTS quiz_attempts CASCADE;
CREATE TABLE quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  attempt_type TEXT CHECK (attempt_type IN ('lesson_quiz','module_test','exam_prep','article_quiz')) NOT NULL,
  module_id UUID REFERENCES learning_modules(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES learning_lessons(id) ON DELETE SET NULL,
  article_id UUID REFERENCES kb_articles(id) ON DELETE SET NULL,
  exam_category TEXT,
  total_questions INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  score_percent NUMERIC(5,2) DEFAULT 0,
  time_spent_seconds INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.7 Quiz Attempt Answers
DROP TABLE IF EXISTS quiz_attempt_answers CASCADE;
CREATE TABLE quiz_attempt_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
  user_answer TEXT,
  is_correct BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.8 Exam Prep Categories
DROP TABLE IF EXISTS exam_prep_categories CASCADE;
CREATE TABLE exam_prep_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_type TEXT NOT NULL CHECK (exam_type IN ('SIT','RPLS')),
  category_name TEXT NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 2: FLASHCARDS & SPACED REPETITION
-- ══════════════════════════════════════════════════════════════════════════════

-- 2.1 Built-in Flashcards (admin-created, discovered via lessons)
DROP TABLE IF EXISTS flashcards CASCADE;
CREATE TABLE flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  hint_1 TEXT,
  hint_2 TEXT,
  hint_3 TEXT,
  module_id UUID REFERENCES learning_modules(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES learning_lessons(id) ON DELETE SET NULL,
  keywords TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  category TEXT DEFAULT 'general',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2.2 User-Created Flashcards (any employee can create)
DROP TABLE IF EXISTS user_flashcards CASCADE;
CREATE TABLE user_flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  hint_1 TEXT,
  hint_2 TEXT,
  hint_3 TEXT,
  keywords TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  module_id UUID REFERENCES learning_modules(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES learning_lessons(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2.3 Flashcard Reviews (SM-2 spaced repetition tracking)
DROP TABLE IF EXISTS flashcard_reviews CASCADE;
CREATE TABLE flashcard_reviews (
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

-- 2.4 Flashcard Discovery (tracks which cards user unlocked via lessons)
DROP TABLE IF EXISTS user_flashcard_discovery CASCADE;
CREATE TABLE user_flashcard_discovery (
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

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 3: USER PROGRESS & NOTES
-- ══════════════════════════════════════════════════════════════════════════════

-- 3.1 User Progress (lesson completion tracking)
DROP TABLE IF EXISTS user_progress CASCADE;
CREATE TABLE user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  module_id UUID REFERENCES learning_modules(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES learning_lessons(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, lesson_id)
);

-- 3.2 User Bookmarks
DROP TABLE IF EXISTS user_bookmarks CASCADE;
CREATE TABLE user_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  article_id UUID REFERENCES kb_articles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, article_id)
);

-- 3.3 Fieldbook Notes (personal notes by any employee)
DROP TABLE IF EXISTS fieldbook_notes CASCADE;
CREATE TABLE fieldbook_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  title TEXT DEFAULT 'Untitled Note',
  content TEXT NOT NULL,
  page_context TEXT,
  page_url TEXT,
  module_id UUID REFERENCES learning_modules(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES learning_lessons(id) ON DELETE SET NULL,
  topic_id UUID REFERENCES learning_topics(id) ON DELETE SET NULL,
  article_id UUID REFERENCES kb_articles(id) ON DELETE SET NULL,
  context_type TEXT,
  context_label TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 4: LESSON BUILDER (block-based content)
-- ══════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS lesson_blocks CASCADE;
CREATE TABLE lesson_blocks (
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

DROP TABLE IF EXISTS lesson_versions CASCADE;
CREATE TABLE lesson_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES learning_lessons(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  blocks_snapshot JSONB NOT NULL DEFAULT '[]',
  saved_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 5: FS EXAM PREP SYSTEM
-- ══════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS fs_study_modules CASCADE;
CREATE TABLE fs_study_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_number INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  week_range TEXT,
  exam_weight_percent INTEGER DEFAULT 0,
  key_topics TEXT[] DEFAULT '{}',
  key_formulas JSONB DEFAULT '[]',
  content_sections JSONB DEFAULT '[]',
  prerequisite_module INTEGER,
  passing_score INTEGER DEFAULT 70,
  question_count INTEGER DEFAULT 20,
  icon TEXT DEFAULT '📚',
  xp_reward INTEGER DEFAULT 500,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS fs_module_progress CASCADE;
CREATE TABLE fs_module_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  module_id UUID NOT NULL REFERENCES fs_study_modules(id) ON DELETE CASCADE,
  best_score INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  study_time_minutes INTEGER DEFAULT 0,
  last_studied_at TIMESTAMPTZ,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  best_mock_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, module_id)
);

DROP TABLE IF EXISTS fs_mock_exam_attempts CASCADE;
CREATE TABLE fs_mock_exam_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  total_questions INTEGER NOT NULL DEFAULT 110,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  score_percent NUMERIC(5,2) DEFAULT 0,
  time_spent_minutes INTEGER DEFAULT 0,
  category_scores JSONB DEFAULT '{}',
  passed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS fs_weak_areas CASCADE;
CREATE TABLE fs_weak_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  topic TEXT NOT NULL,
  module_number INTEGER,
  miss_count INTEGER DEFAULT 1,
  last_missed_at TIMESTAMPTZ DEFAULT now(),
  resolved BOOLEAN DEFAULT false,
  UNIQUE(user_email, topic)
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 6: XP & REWARDS SYSTEM
-- ══════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS xp_transactions CASCADE;
CREATE TABLE xp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  amount INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'module_complete','quiz_pass','exam_prep_complete','mock_exam_pass',
    'credential_earned','course_pass','badge_earned','store_purchase',
    'admin_adjustment','module_retake'
  )),
  source_type TEXT,
  source_id TEXT,
  description TEXT NOT NULL,
  balance_after INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS xp_balances (
  user_email TEXT PRIMARY KEY,
  current_balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS xp_pay_milestones CASCADE;
CREATE TABLE xp_pay_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xp_threshold INTEGER NOT NULL UNIQUE,
  bonus_per_hour NUMERIC(6,2) NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS xp_milestone_achievements CASCADE;
CREATE TABLE xp_milestone_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  milestone_id UUID NOT NULL REFERENCES xp_pay_milestones(id),
  achieved_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, milestone_id)
);

DROP TABLE IF EXISTS rewards_catalog CASCADE;
CREATE TABLE rewards_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('apparel','gear','gift_cards','accessories','cash_bonus','other')),
  xp_cost INTEGER NOT NULL,
  image_url TEXT,
  tier TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze','silver','gold','platinum','diamond')),
  stock_quantity INTEGER DEFAULT -1,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS rewards_purchases CASCADE;
CREATE TABLE rewards_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  item_id UUID NOT NULL REFERENCES rewards_catalog(id),
  xp_spent INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','fulfilled','cancelled')),
  fulfilled_by TEXT,
  fulfilled_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS badges CASCADE;
CREATE TABLE badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '🏆',
  category TEXT NOT NULL CHECK (category IN ('certification','achievement','milestone','special')),
  xp_reward INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS user_badges CASCADE;
CREATE TABLE user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  badge_id UUID NOT NULL REFERENCES badges(id),
  earned_at TIMESTAMPTZ DEFAULT now(),
  awarded_by TEXT,
  UNIQUE(user_email, badge_id)
);

DROP TABLE IF EXISTS module_completions CASCADE;
CREATE TABLE module_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  module_type TEXT NOT NULL,
  module_id UUID NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  xp_earned INTEGER DEFAULT 0,
  is_current BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS module_xp_config CASCADE;
CREATE TABLE module_xp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_type TEXT NOT NULL,
  module_id UUID,
  xp_value INTEGER NOT NULL DEFAULT 500,
  expiry_months INTEGER DEFAULT 18,
  difficulty_rating INTEGER DEFAULT 3 CHECK (difficulty_rating BETWEEN 1 AND 5),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS education_courses CASCADE;
CREATE TABLE education_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  course_name TEXT NOT NULL,
  institution TEXT,
  course_type TEXT NOT NULL CHECK (course_type IN ('college_surveying','college_other','certification_prep','continuing_ed','online_course')),
  semester TEXT,
  cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  passed BOOLEAN,
  grade TEXT,
  company_pays_percent INTEGER DEFAULT 100,
  company_pays_amount NUMERIC(10,2) DEFAULT 0,
  employee_pays_amount NUMERIC(10,2) DEFAULT 0,
  reimbursement_status TEXT DEFAULT 'pending' CHECK (reimbursement_status IN ('pending','approved','paid','denied')),
  xp_earned INTEGER DEFAULT 0,
  pay_raise_amount NUMERIC(6,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS admin_alert_settings CASCADE;
CREATE TABLE admin_alert_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL UNIQUE CHECK (alert_type IN (
    'module_complete','milestone_reached','store_purchase','exam_passed',
    'badge_earned','credential_added','pay_raise_triggered','course_complete'
  )),
  enabled BOOLEAN DEFAULT true,
  notify_admins BOOLEAN DEFAULT true,
  notify_employee BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 7: LEARNING CREDITS & PAYOUTS
-- ══════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS learning_credit_values CASCADE;
CREATE TABLE learning_credit_values (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('module','lesson','quiz_pass','exam_prep_pass','flashcard_mastery')),
  entity_id UUID,
  entity_label TEXT,
  credit_points INT NOT NULL DEFAULT 0 CHECK (credit_points >= 0),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS employee_learning_credits CASCADE;
CREATE TABLE employee_learning_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  credit_value_id UUID REFERENCES learning_credit_values(id),
  entity_type TEXT NOT NULL,
  entity_id UUID,
  entity_label TEXT,
  points_earned INT NOT NULL DEFAULT 0,
  earned_at TIMESTAMPTZ DEFAULT now(),
  source_type TEXT,
  source_id UUID,
  awarded_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS credit_thresholds CASCADE;
CREATE TABLE credit_thresholds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  threshold_name TEXT NOT NULL,
  points_required INT NOT NULL CHECK (points_required > 0),
  reward_type TEXT NOT NULL CHECK (reward_type IN ('pay_raise','one_time_bonus','credential_unlock')),
  raise_amount DECIMAL(10,2) DEFAULT 0,
  bonus_amount DECIMAL(10,2) DEFAULT 0,
  credential_key TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  is_repeatable BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS employee_threshold_achievements CASCADE;
CREATE TABLE employee_threshold_achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  threshold_id UUID NOT NULL REFERENCES credit_thresholds(id),
  achieved_at TIMESTAMPTZ DEFAULT now(),
  points_at_achievement INT NOT NULL,
  action_taken TEXT,
  action_by TEXT,
  action_at TIMESTAMPTZ,
  payout_log_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, threshold_id)
);

DROP TABLE IF EXISTS payout_log CASCADE;
CREATE TABLE payout_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  payout_type TEXT NOT NULL CHECK (payout_type IN (
    'weekly_payroll','pay_raise','bonus','advance','advance_repayment',
    'adjustment','credential_bonus','education_bonus','promotion_raise',
    'performance_bonus','holiday_bonus','referral_bonus','retention_bonus',
    'spot_bonus','completion_bonus'
  )),
  amount DECIMAL(10,2) NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  old_rate DECIMAL(10,2),
  new_rate DECIMAL(10,2),
  old_role TEXT,
  new_role TEXT,
  source_type TEXT,
  source_id UUID,
  processed_by TEXT,
  processed_at TIMESTAMPTZ DEFAULT now(),
  pay_period_start DATE,
  pay_period_end DATE,
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending','completed','cancelled','reversed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS employee_role_history CASCADE;
CREATE TABLE employee_role_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  old_role TEXT,
  new_role TEXT NOT NULL,
  old_tier TEXT,
  new_tier TEXT,
  reason TEXT NOT NULL,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  changed_by TEXT NOT NULL,
  pay_impact DECIMAL(10,2) DEFAULT 0,
  payout_log_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS employee_profile_changes CASCADE;
CREATE TABLE employee_profile_changes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN (
    'role_change','pay_raise','credential_added','credential_removed',
    'bonus_awarded','profile_updated','tier_change','seniority_update',
    'note_added','status_change'
  )),
  title TEXT NOT NULL,
  description TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 8: CURRICULUM MILESTONES
-- ══════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS curriculum_milestones CASCADE;
CREATE TABLE curriculum_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  milestone_type TEXT NOT NULL CHECK (milestone_type IN ('part_complete','exam_ready','certification','special')),
  part_number INTEGER,
  required_modules UUID[] DEFAULT '{}',
  required_count INTEGER DEFAULT 0,
  icon TEXT DEFAULT '🏆',
  color TEXT DEFAULT '#1D3095',
  xp_reward INTEGER DEFAULT 500,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS user_milestone_progress CASCADE;
CREATE TABLE user_milestone_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  milestone_id UUID NOT NULL REFERENCES curriculum_milestones(id),
  achieved BOOLEAN DEFAULT false,
  achieved_at TIMESTAMPTZ,
  progress_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, milestone_id)
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 9: MEDIA, PRACTICE, RECYCLE BIN, ACTIVITY
-- ══════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS media_library CASCADE;
CREATE TABLE media_library (
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
  source_context TEXT,
  source_id UUID,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS recycle_bin CASCADE;
CREATE TABLE recycle_bin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_table TEXT NOT NULL,
  original_id UUID NOT NULL,
  item_title TEXT,
  item_type TEXT,
  item_data JSONB NOT NULL,
  deleted_by TEXT NOT NULL,
  deleted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '90 days')
);

DROP TABLE IF EXISTS practice_sessions CASCADE;
CREATE TABLE practice_sessions (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  problems TEXT,
  config TEXT,
  total_problems INTEGER DEFAULT 0,
  correct_answers INTEGER DEFAULT 0,
  score_percent NUMERIC DEFAULT 0,
  time_spent_seconds INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS activity_log CASCADE;
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTION 10: ERROR REPORTS
-- ══════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS error_reports CASCADE;
CREATE TABLE error_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  error_type TEXT NOT NULL DEFAULT 'unknown',
  error_code TEXT,
  component_name TEXT,
  element_selector TEXT,
  page_url TEXT NOT NULL,
  page_title TEXT,
  route_path TEXT,
  api_endpoint TEXT,
  request_method TEXT,
  request_body JSONB,
  user_email TEXT NOT NULL,
  user_name TEXT,
  user_role TEXT,
  user_notes TEXT,
  user_expected TEXT,
  user_cause_guess TEXT,
  severity TEXT DEFAULT 'medium',
  browser_info TEXT,
  screen_size TEXT,
  viewport_size TEXT,
  connection_type TEXT,
  memory_usage TEXT,
  session_duration_ms INTEGER,
  console_logs JSONB,
  breadcrumbs JSONB,
  status TEXT DEFAULT 'new',
  assigned_to TEXT,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  occurred_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TRIGGER trg_modules_upd BEFORE UPDATE ON learning_modules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_lessons_upd BEFORE UPDATE ON learning_lessons FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_topics_upd BEFORE UPDATE ON learning_topics FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_articles_upd BEFORE UPDATE ON kb_articles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_questions_upd BEFORE UPDATE ON question_bank FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_flashcards_upd BEFORE UPDATE ON flashcards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_uflashcards_upd BEFORE UPDATE ON user_flashcards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_fieldbook_upd BEFORE UPDATE ON fieldbook_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_lesson_blocks_upd BEFORE UPDATE ON lesson_blocks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_flashcard_reviews_upd BEFORE UPDATE ON flashcard_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_error_reports_upd BEFORE UPDATE ON error_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE learning_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempt_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_flashcard_discovery ENABLE ROW LEVEL SECURITY;
ALTER TABLE fieldbook_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_prep_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_credit_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_learning_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_threshold_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_role_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_profile_changes ENABLE ROW LEVEL SECURITY;

-- Service role (supabaseAdmin) bypasses RLS — used by all API routes
-- These policies allow full access via service role key
CREATE POLICY "service_all" ON learning_modules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON learning_lessons FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON learning_topics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON kb_articles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON question_bank FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON quiz_attempts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON quiz_attempt_answers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON flashcards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON user_flashcards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON flashcard_reviews FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON user_flashcard_discovery FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON fieldbook_notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON user_progress FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON user_bookmarks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON exam_prep_categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON lesson_blocks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON lesson_versions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON media_library FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON activity_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON error_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON learning_credit_values FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON employee_learning_credits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON credit_thresholds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON employee_threshold_achievements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON payout_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON employee_role_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON employee_profile_changes FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════════════════════════════════════════════

-- Core learning
CREATE INDEX idx_lessons_module ON learning_lessons(module_id);
CREATE INDEX idx_topics_lesson ON learning_topics(lesson_id);
CREATE INDEX idx_topics_kw ON learning_topics USING GIN(keywords);
CREATE INDEX idx_articles_slug ON kb_articles(slug);
CREATE INDEX idx_articles_cat ON kb_articles(category);
CREATE INDEX idx_articles_tags ON kb_articles USING GIN(tags);
CREATE INDEX idx_articles_module ON kb_articles(module_id);
CREATE INDEX idx_q_module ON question_bank(module_id);
CREATE INDEX idx_q_lesson ON question_bank(lesson_id);
CREATE INDEX idx_q_article ON question_bank(article_id);
CREATE INDEX idx_q_exam ON question_bank(exam_category);
CREATE INDEX idx_q_tags ON question_bank USING GIN(tags);

-- Flashcards
CREATE INDEX idx_fc_module ON flashcards(module_id);
CREATE INDEX idx_fc_lesson ON flashcards(lesson_id);
CREATE INDEX idx_fc_kw ON flashcards USING GIN(keywords);
CREATE INDEX idx_fc_tags ON flashcards USING GIN(tags);
CREATE INDEX idx_ufc_email ON user_flashcards(user_email);
CREATE INDEX idx_fr_user ON flashcard_reviews(user_email);
CREATE INDEX idx_fr_next ON flashcard_reviews(user_email, next_review_at);
CREATE INDEX idx_fr_card ON flashcard_reviews(card_id, card_source);
CREATE INDEX idx_fd_user ON user_flashcard_discovery(user_email);
CREATE INDEX idx_fd_review ON user_flashcard_discovery(next_yearly_review_at);

-- User progress
CREATE INDEX idx_fn_email ON fieldbook_notes(user_email);
CREATE INDEX idx_up_email ON user_progress(user_email);
CREATE INDEX idx_qa_email ON quiz_attempts(user_email);

-- Lesson builder
CREATE INDEX idx_lb_lesson ON lesson_blocks(lesson_id);
CREATE INDEX idx_lb_order ON lesson_blocks(lesson_id, order_index);
CREATE INDEX idx_lv_lesson ON lesson_versions(lesson_id);

-- Media
CREATE INDEX idx_ml_type ON media_library(media_type);
CREATE INDEX idx_ml_uploaded ON media_library(uploaded_by);
CREATE INDEX idx_ml_deleted ON media_library(deleted_at);

-- Activity
CREATE INDEX idx_al_user ON activity_log(user_email);
CREATE INDEX idx_al_action ON activity_log(action_type);
CREATE INDEX idx_al_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_al_created ON activity_log(created_at DESC);

-- Practice
CREATE INDEX idx_ps_user ON practice_sessions(user_email);

-- Recycle bin
CREATE INDEX idx_rb_table ON recycle_bin(original_table);
CREATE INDEX idx_rb_type ON recycle_bin(item_type);
CREATE INDEX idx_rb_deleted_by ON recycle_bin(deleted_by);

-- XP & rewards
CREATE INDEX idx_xt_user ON xp_transactions(user_email);
CREATE INDEX idx_xt_type ON xp_transactions(transaction_type);
CREATE INDEX idx_rp_user ON rewards_purchases(user_email);
CREATE INDEX idx_ub_user ON user_badges(user_email);
CREATE INDEX idx_mc_user ON module_completions(user_email);
CREATE INDEX idx_ec_user ON education_courses(user_email);

-- Credits & payouts
CREATE INDEX idx_lcv_entity ON learning_credit_values(entity_type, entity_id);
CREATE INDEX idx_elc_email ON employee_learning_credits(user_email);
CREATE INDEX idx_elc_earned ON employee_learning_credits(earned_at);
CREATE UNIQUE INDEX idx_elc_unique ON employee_learning_credits(user_email, entity_type, entity_id, source_id);
CREATE INDEX idx_eta_email ON employee_threshold_achievements(user_email);
CREATE INDEX idx_pl_email ON payout_log(user_email);
CREATE INDEX idx_pl_type ON payout_log(payout_type);
CREATE INDEX idx_pl_date ON payout_log(processed_at);
CREATE INDEX idx_erh_email ON employee_role_history(user_email);
CREATE INDEX idx_epc_email ON employee_profile_changes(user_email);
CREATE INDEX idx_epc_unread ON employee_profile_changes(user_email, is_read);

-- Error reports
CREATE INDEX idx_er_user ON error_reports(user_email);
CREATE INDEX idx_er_status ON error_reports(status);
CREATE INDEX idx_er_type ON error_reports(error_type);
CREATE INDEX idx_er_created ON error_reports(created_at DESC);
CREATE INDEX idx_er_severity ON error_reports(severity);

-- Full-text search
CREATE INDEX idx_fts_modules ON learning_modules USING GIN(to_tsvector('english', coalesce(title,'')||' '||coalesce(description,'')));
CREATE INDEX idx_fts_lessons ON learning_lessons USING GIN(to_tsvector('english', coalesce(title,'')||' '||coalesce(content,'')));
CREATE INDEX idx_fts_topics ON learning_topics USING GIN(to_tsvector('english', coalesce(title,'')||' '||coalesce(content,'')));
CREATE INDEX idx_fts_articles ON kb_articles USING GIN(to_tsvector('english', coalesce(title,'')||' '||coalesce(content,'')));
CREATE INDEX idx_fts_flashcards ON flashcards USING GIN(to_tsvector('english', coalesce(term,'')||' '||coalesce(definition,'')));

-- ══════════════════════════════════════════════════════════════════════════════
-- SYSTEM SEED DATA (non-content configuration)
-- ══════════════════════════════════════════════════════════════════════════════

-- XP Pay Milestones
INSERT INTO xp_pay_milestones (xp_threshold, bonus_per_hour, label, description) VALUES
(5000, 0.25, 'XP Apprentice', 'First 5,000 XP earned'),
(10000, 0.50, 'XP Journeyman', '10,000 total XP'),
(20000, 1.00, 'XP Craftsman', '20,000 total XP'),
(30000, 1.50, 'XP Expert', '30,000 total XP'),
(50000, 2.50, 'XP Master', '50,000 total XP'),
(75000, 3.75, 'XP Grand Master', '75,000 total XP'),
(100000, 5.00, 'XP Legend', '100,000 total XP')
ON CONFLICT (xp_threshold) DO NOTHING;

-- Badges
INSERT INTO badges (badge_key, name, description, icon, category, xp_reward, sort_order) VALUES
('fs_ready', 'FS Exam Ready', 'Completed all 8 FS prep modules and passed mock exam 70%+', '🎯', 'certification', 3500, 1),
('fs_all_modules', 'FS Scholar', 'Completed all 8 FS study modules', '📚', 'achievement', 1000, 2),
('fs_perfect_mock', 'FS Ace', 'Scored 90%+ on the FS mock exam', '⭐', 'achievement', 2000, 3),
('first_module', 'First Steps', 'Completed your first learning module', '👣', 'milestone', 100, 10),
('five_modules', 'Knowledge Seeker', 'Completed 5 learning modules', '🔍', 'milestone', 250, 11),
('ten_modules', 'Dedicated Learner', 'Completed 10 learning modules', '📖', 'milestone', 500, 12),
('twenty_modules', 'Module Master', 'Completed 20 learning modules', '🏅', 'milestone', 1000, 13),
('first_quiz_pass', 'Quiz Champion', 'Passed your first quiz 70%+', '✅', 'milestone', 50, 20),
('perfect_quiz', 'Perfect Score', 'Scored 100% on any quiz', '💯', 'achievement', 500, 21),
('sit_certified', 'SIT Certified', 'Passed the Surveyor Intern Test', '📋', 'certification', 5000, 30),
('rpls_certified', 'RPLS Licensed', 'RPLS license earned', '⚖️', 'certification', 5000, 31),
('one_year', 'One Year Strong', '1 year with the company', '🗓️', 'milestone', 500, 40),
('three_years', 'Three Year Veteran', '3 years with the company', '🌟', 'milestone', 1000, 41),
('five_years', 'Five Year Legend', '5 years with the company', '🏆', 'milestone', 2000, 42),
('xp_5k', 'XP Apprentice', 'Earned 5,000 total XP', '🔰', 'milestone', 0, 50),
('xp_10k', 'XP Journeyman', 'Earned 10,000 total XP', '⚡', 'milestone', 0, 51),
('xp_25k', 'XP Expert', 'Earned 25,000 total XP', '🌊', 'milestone', 0, 52),
('xp_50k', 'XP Master', 'Earned 50,000 total XP', '🔥', 'milestone', 0, 53)
ON CONFLICT (badge_key) DO NOTHING;

-- Rewards Catalog
INSERT INTO rewards_catalog (name, description, category, xp_cost, tier, sort_order) VALUES
('Company Sticker Pack', '5 vinyl stickers', 'accessories', 500, 'bronze', 1),
('Company Decal', 'Window/bumper decal', 'accessories', 750, 'bronze', 2),
('Company Koozie', 'Insulated drink koozie', 'accessories', 500, 'bronze', 3),
('$5 Gift Card', '$5 restaurant gift card', 'gift_cards', 500, 'bronze', 4),
('Company Pen Set', 'Pen and mechanical pencil set', 'accessories', 600, 'bronze', 5),
('Company T-Shirt', 'Crew neck t-shirt', 'apparel', 2000, 'silver', 10),
('Company Hat', 'Snapback cap', 'apparel', 2000, 'silver', 11),
('$10 Gift Card', 'Gift card', 'gift_cards', 1000, 'silver', 12),
('Company Water Bottle', '32oz insulated bottle', 'gear', 1500, 'silver', 13),
('Phone Charger', 'Portable battery pack', 'gear', 2500, 'silver', 14),
('$20 Gift Card', 'Gift card', 'gift_cards', 2000, 'silver', 15),
('$50 Academy Gift Card', 'Academy Sports gift card', 'gift_cards', 5000, 'gold', 20),
('$50 Steakhouse Gift Card', 'Steakhouse gift card', 'gift_cards', 5000, 'gold', 21),
('Company Polo Shirt', 'Premium polo', 'apparel', 4000, 'gold', 22),
('$10 Cash Bonus', 'Added to paycheck', 'cash_bonus', 1000, 'gold', 23),
('Leatherman Multi-Tool', 'Leatherman Wingman', 'gear', 7500, 'gold', 24),
('$25 Cash Bonus', 'Added to paycheck', 'cash_bonus', 2500, 'gold', 25),
('Work Boots', 'Up to $150 value', 'gear', 10000, 'platinum', 30),
('Quality Pocket Knife', 'Benchmade or Kershaw', 'gear', 10000, 'platinum', 31),
('$50 Cash Bonus', 'Added to paycheck', 'cash_bonus', 5000, 'platinum', 32),
('Bluetooth Speaker', 'JBL Flip or equivalent', 'gear', 12000, 'platinum', 33),
('Yeti Tumbler Set', 'Set of 2 Yeti Ramblers', 'gear', 8000, 'platinum', 34),
('Carhartt Jacket', 'Detroit jacket or equivalent', 'apparel', 20000, 'diamond', 40),
('$100 Cash Bonus', 'Added to paycheck', 'cash_bonus', 10000, 'diamond', 41),
('Premium Cooler', 'Yeti Roadie or RTIC 20', 'gear', 25000, 'diamond', 42),
('$200 Academy Gift Card', 'Academy Sports', 'gift_cards', 20000, 'diamond', 43),
('Custom Embroidered Jacket', 'Your name + STARR logo', 'apparel', 15000, 'diamond', 44)
ON CONFLICT DO NOTHING;

-- Admin Alert Settings
INSERT INTO admin_alert_settings (alert_type, enabled, notify_admins, notify_employee) VALUES
('module_complete', true, true, true),
('milestone_reached', true, true, true),
('store_purchase', true, true, true),
('exam_passed', true, true, true),
('badge_earned', true, true, true),
('credential_added', true, true, false),
('pay_raise_triggered', true, true, true),
('course_complete', true, true, true)
ON CONFLICT (alert_type) DO NOTHING;

-- Default XP config
INSERT INTO module_xp_config (module_type, module_id, xp_value, expiry_months, difficulty_rating) VALUES
('learning_module', NULL, 500, 18, 3),
('fs_module', NULL, 500, 24, 4)
ON CONFLICT DO NOTHING;

SELECT 'Schema created successfully. Run supabase_seed_curriculum.sql next.' AS result;
