-- ============================================================================
-- 000_reset.sql
-- RESETS ALL DATA in the STARR-SURVEYING database.
-- This TRUNCATES all tables (removes all rows) but keeps the schema intact.
-- Run this before re-seeding to get a clean slate.
-- Safely skips any tables that don't exist in your database.
--
-- Usage:  psql -f seeds/000_reset.sql
--   or:   Run via Supabase SQL Editor
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    -- User-generated data (progress, reviews, notes, etc.)
    'quiz_attempt_answers',
    'quiz_attempts',
    'flashcard_reviews',
    'user_flashcard_discovery',
    'user_flashcards',
    'user_progress',
    'user_lesson_progress',
    'user_bookmarks',
    'user_article_completions',
    'user_milestone_progress',
    'user_badges',
    'fieldbook_entry_categories',
    'fieldbook_notes',
    'fieldbook_categories',
    'practice_sessions',
    'fs_module_progress',
    'fs_mock_exam_attempts',
    'fs_weak_areas',
    'template_generation_log',

    -- XP, rewards, payroll
    'xp_transactions',
    'xp_balances',
    'xp_milestone_achievements',
    'rewards_purchases',
    'module_completions',
    'education_courses',
    'employee_learning_credits',
    'employee_threshold_achievements',
    'payout_log',
    'employee_role_history',
    'employee_profile_changes',
    'employee_earned_credentials',
    'daily_time_logs',
    'pay_advance_requests',
    'scheduled_bonuses',
    'weekly_pay_periods',

    -- Admin / system
    'assignments',
    'notifications',
    'admin_discussion_threads',
    'learning_assignments',
    'acc_course_enrollments',
    'activity_log',
    'error_reports',
    'recycle_bin',
    'media_library',

    -- Content data (blocks, templates, questions, flashcards)
    'lesson_blocks',
    'lesson_versions',
    'lesson_required_articles',
    'problem_templates',
    'block_templates',
    'question_bank',
    'flashcards',
    'learning_topics',
    'kb_articles',

    -- Structure (lessons, modules)
    'learning_lessons',
    'learning_modules',
    'fs_study_modules',
    'exam_prep_categories',
    'curriculum_milestones',

    -- System config (these will be re-seeded by 001_config.sql)
    'xp_pay_milestones',
    'badges',
    'rewards_catalog',
    'admin_alert_settings',
    'module_xp_config',
    'work_type_rates',
    'role_tiers',
    'seniority_brackets',
    'credential_bonuses',
    'pay_system_config',
    'credit_thresholds',
    'learning_credit_values'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('TRUNCATE TABLE public.%I CASCADE', tbl);
      RAISE NOTICE 'Truncated: %', tbl;
    ELSE
      RAISE NOTICE 'Skipped (not found): %', tbl;
    END IF;
  END LOOP;
END
$$;

-- ── Users (optional — uncomment block below to also wipe registered users) ──
-- DO $$ BEGIN
--   IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'registered_users') THEN
--     TRUNCATE TABLE public.registered_users CASCADE;
--   END IF;
-- END $$;

SELECT 'Reset complete. All tables truncated.' AS status;
