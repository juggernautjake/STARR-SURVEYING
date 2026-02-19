-- ============================================================================
-- 000_reset.sql
-- RESETS ALL DATA in the STARR-SURVEYING database.
-- This TRUNCATES all tables (removes all rows) but keeps the schema intact.
-- Run this before re-seeding to get a clean slate.
-- Uses IF EXISTS so missing tables are silently skipped.
--
-- Usage:  psql -f seeds/000_reset.sql
--   or:   Run via Supabase SQL Editor
-- ============================================================================

BEGIN;

-- ── User-generated data (progress, reviews, notes, etc.) ──────────────────
TRUNCATE TABLE IF EXISTS quiz_attempt_answers CASCADE;
TRUNCATE TABLE IF EXISTS quiz_attempts CASCADE;
TRUNCATE TABLE IF EXISTS flashcard_reviews CASCADE;
TRUNCATE TABLE IF EXISTS user_flashcard_discovery CASCADE;
TRUNCATE TABLE IF EXISTS user_flashcards CASCADE;
TRUNCATE TABLE IF EXISTS user_progress CASCADE;
TRUNCATE TABLE IF EXISTS user_lesson_progress CASCADE;
TRUNCATE TABLE IF EXISTS user_bookmarks CASCADE;
TRUNCATE TABLE IF EXISTS user_article_completions CASCADE;
TRUNCATE TABLE IF EXISTS user_milestone_progress CASCADE;
TRUNCATE TABLE IF EXISTS user_badges CASCADE;
TRUNCATE TABLE IF EXISTS fieldbook_entry_categories CASCADE;
TRUNCATE TABLE IF EXISTS fieldbook_notes CASCADE;
TRUNCATE TABLE IF EXISTS fieldbook_categories CASCADE;
TRUNCATE TABLE IF EXISTS practice_sessions CASCADE;
TRUNCATE TABLE IF EXISTS fs_module_progress CASCADE;
TRUNCATE TABLE IF EXISTS fs_mock_exam_attempts CASCADE;
TRUNCATE TABLE IF EXISTS fs_weak_areas CASCADE;
TRUNCATE TABLE IF EXISTS template_generation_log CASCADE;

-- ── XP, rewards, payroll ──────────────────────────────────────────────────
TRUNCATE TABLE IF EXISTS xp_transactions CASCADE;
TRUNCATE TABLE IF EXISTS xp_balances CASCADE;
TRUNCATE TABLE IF EXISTS xp_milestone_achievements CASCADE;
TRUNCATE TABLE IF EXISTS rewards_purchases CASCADE;
TRUNCATE TABLE IF EXISTS module_completions CASCADE;
TRUNCATE TABLE IF EXISTS education_courses CASCADE;
TRUNCATE TABLE IF EXISTS employee_learning_credits CASCADE;
TRUNCATE TABLE IF EXISTS employee_threshold_achievements CASCADE;
TRUNCATE TABLE IF EXISTS payout_log CASCADE;
TRUNCATE TABLE IF EXISTS employee_role_history CASCADE;
TRUNCATE TABLE IF EXISTS employee_profile_changes CASCADE;
TRUNCATE TABLE IF EXISTS employee_earned_credentials CASCADE;
TRUNCATE TABLE IF EXISTS daily_time_logs CASCADE;
TRUNCATE TABLE IF EXISTS pay_advance_requests CASCADE;
TRUNCATE TABLE IF EXISTS scheduled_bonuses CASCADE;
TRUNCATE TABLE IF EXISTS weekly_pay_periods CASCADE;

-- ── Admin / system ────────────────────────────────────────────────────────
TRUNCATE TABLE IF EXISTS assignments CASCADE;
TRUNCATE TABLE IF EXISTS notifications CASCADE;
TRUNCATE TABLE IF EXISTS admin_discussion_threads CASCADE;
TRUNCATE TABLE IF EXISTS learning_assignments CASCADE;
TRUNCATE TABLE IF EXISTS acc_course_enrollments CASCADE;
TRUNCATE TABLE IF EXISTS activity_log CASCADE;
TRUNCATE TABLE IF EXISTS error_reports CASCADE;
TRUNCATE TABLE IF EXISTS recycle_bin CASCADE;
TRUNCATE TABLE IF EXISTS media_library CASCADE;

-- ── Content data (blocks, templates, questions, flashcards) ───────────────
TRUNCATE TABLE IF EXISTS lesson_blocks CASCADE;
TRUNCATE TABLE IF EXISTS lesson_versions CASCADE;
TRUNCATE TABLE IF EXISTS lesson_required_articles CASCADE;
TRUNCATE TABLE IF EXISTS problem_templates CASCADE;
TRUNCATE TABLE IF EXISTS block_templates CASCADE;
TRUNCATE TABLE IF EXISTS question_bank CASCADE;
TRUNCATE TABLE IF EXISTS flashcards CASCADE;
TRUNCATE TABLE IF EXISTS learning_topics CASCADE;
TRUNCATE TABLE IF EXISTS kb_articles CASCADE;

-- ── Structure (lessons, modules) ──────────────────────────────────────────
TRUNCATE TABLE IF EXISTS learning_lessons CASCADE;
TRUNCATE TABLE IF EXISTS learning_modules CASCADE;
TRUNCATE TABLE IF EXISTS fs_study_modules CASCADE;
TRUNCATE TABLE IF EXISTS exam_prep_categories CASCADE;
TRUNCATE TABLE IF EXISTS curriculum_milestones CASCADE;

-- ── System config (these will be re-seeded by 001_config.sql) ─────────────
TRUNCATE TABLE IF EXISTS xp_pay_milestones CASCADE;
TRUNCATE TABLE IF EXISTS badges CASCADE;
TRUNCATE TABLE IF EXISTS rewards_catalog CASCADE;
TRUNCATE TABLE IF EXISTS admin_alert_settings CASCADE;
TRUNCATE TABLE IF EXISTS module_xp_config CASCADE;
TRUNCATE TABLE IF EXISTS work_type_rates CASCADE;
TRUNCATE TABLE IF EXISTS role_tiers CASCADE;
TRUNCATE TABLE IF EXISTS seniority_brackets CASCADE;
TRUNCATE TABLE IF EXISTS credential_bonuses CASCADE;
TRUNCATE TABLE IF EXISTS pay_system_config CASCADE;
TRUNCATE TABLE IF EXISTS credit_thresholds CASCADE;
TRUNCATE TABLE IF EXISTS learning_credit_values CASCADE;

-- ── Users (optional — uncomment to also wipe registered users) ────────────
-- TRUNCATE TABLE IF EXISTS registered_users CASCADE;

COMMIT;

-- Verify everything is empty
SELECT 'Reset complete. All tables truncated.' AS status;
