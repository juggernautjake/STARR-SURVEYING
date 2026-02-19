-- ============================================================================
-- 000_reset.sql
-- RESETS ALL DATA in the STARR-SURVEYING database.
-- This TRUNCATES all tables (removes all rows) but keeps the schema intact.
-- Run this before re-seeding to get a clean slate.
--
-- Usage:  psql -f seeds/000_reset.sql
--   or:   Run via Supabase SQL Editor
-- ============================================================================

BEGIN;

-- ── User-generated data (progress, reviews, notes, etc.) ──────────────────
TRUNCATE TABLE quiz_attempt_answers CASCADE;
TRUNCATE TABLE quiz_attempts CASCADE;
TRUNCATE TABLE flashcard_reviews CASCADE;
TRUNCATE TABLE user_flashcard_discovery CASCADE;
TRUNCATE TABLE user_flashcards CASCADE;
TRUNCATE TABLE user_progress CASCADE;
TRUNCATE TABLE user_lesson_progress CASCADE;
TRUNCATE TABLE user_bookmarks CASCADE;
TRUNCATE TABLE user_article_completions CASCADE;
TRUNCATE TABLE user_milestone_progress CASCADE;
TRUNCATE TABLE user_badges CASCADE;
TRUNCATE TABLE fieldbook_entry_categories CASCADE;
TRUNCATE TABLE fieldbook_notes CASCADE;
TRUNCATE TABLE fieldbook_categories CASCADE;
TRUNCATE TABLE practice_sessions CASCADE;
TRUNCATE TABLE fs_module_progress CASCADE;
TRUNCATE TABLE fs_mock_exam_attempts CASCADE;
TRUNCATE TABLE fs_weak_areas CASCADE;
TRUNCATE TABLE template_generation_log CASCADE;

-- ── XP, rewards, payroll ──────────────────────────────────────────────────
TRUNCATE TABLE xp_transactions CASCADE;
TRUNCATE TABLE xp_balances CASCADE;
TRUNCATE TABLE xp_milestone_achievements CASCADE;
TRUNCATE TABLE rewards_purchases CASCADE;
TRUNCATE TABLE module_completions CASCADE;
TRUNCATE TABLE education_courses CASCADE;
TRUNCATE TABLE employee_learning_credits CASCADE;
TRUNCATE TABLE employee_threshold_achievements CASCADE;
TRUNCATE TABLE payout_log CASCADE;
TRUNCATE TABLE employee_role_history CASCADE;
TRUNCATE TABLE employee_profile_changes CASCADE;
TRUNCATE TABLE employee_earned_credentials CASCADE;
TRUNCATE TABLE daily_time_logs CASCADE;
TRUNCATE TABLE pay_advance_requests CASCADE;
TRUNCATE TABLE scheduled_bonuses CASCADE;
TRUNCATE TABLE weekly_pay_periods CASCADE;

-- ── Admin / system ────────────────────────────────────────────────────────
TRUNCATE TABLE assignments CASCADE;
TRUNCATE TABLE notifications CASCADE;
TRUNCATE TABLE admin_discussion_threads CASCADE;
TRUNCATE TABLE learning_assignments CASCADE;
TRUNCATE TABLE acc_course_enrollments CASCADE;
TRUNCATE TABLE activity_log CASCADE;
TRUNCATE TABLE error_reports CASCADE;
TRUNCATE TABLE recycle_bin CASCADE;
TRUNCATE TABLE media_library CASCADE;

-- ── Content data (blocks, templates, questions, flashcards) ───────────────
TRUNCATE TABLE lesson_blocks CASCADE;
TRUNCATE TABLE lesson_versions CASCADE;
TRUNCATE TABLE lesson_required_articles CASCADE;
TRUNCATE TABLE problem_templates CASCADE;
TRUNCATE TABLE block_templates CASCADE;
TRUNCATE TABLE question_bank CASCADE;
TRUNCATE TABLE flashcards CASCADE;
TRUNCATE TABLE learning_topics CASCADE;
TRUNCATE TABLE kb_articles CASCADE;

-- ── Structure (lessons, modules) ──────────────────────────────────────────
TRUNCATE TABLE learning_lessons CASCADE;
TRUNCATE TABLE learning_modules CASCADE;
TRUNCATE TABLE fs_study_modules CASCADE;
TRUNCATE TABLE exam_prep_categories CASCADE;
TRUNCATE TABLE curriculum_milestones CASCADE;

-- ── System config (these will be re-seeded by 001_config.sql) ─────────────
TRUNCATE TABLE xp_pay_milestones CASCADE;
TRUNCATE TABLE badges CASCADE;
TRUNCATE TABLE rewards_catalog CASCADE;
TRUNCATE TABLE admin_alert_settings CASCADE;
TRUNCATE TABLE module_xp_config CASCADE;
TRUNCATE TABLE work_type_rates CASCADE;
TRUNCATE TABLE role_tiers CASCADE;
TRUNCATE TABLE seniority_brackets CASCADE;
TRUNCATE TABLE credential_bonuses CASCADE;
TRUNCATE TABLE pay_system_config CASCADE;
TRUNCATE TABLE credit_thresholds CASCADE;
TRUNCATE TABLE learning_credit_values CASCADE;

-- ── Users (optional — uncomment to also wipe registered users) ────────────
-- TRUNCATE TABLE registered_users CASCADE;

COMMIT;

-- Verify everything is empty
SELECT 'Reset complete. All tables truncated.' AS status;
