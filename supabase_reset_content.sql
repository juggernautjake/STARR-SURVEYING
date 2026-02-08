-- ============================================================================
-- STARR SURVEYING — Full Database Reset Script
-- ============================================================================
-- This script DROPS ALL application tables, triggers, and functions so you
-- can rebuild everything from scratch by running the schema/migration/seed
-- SQL files in order.
--
-- Run order after reset:
--   1. supabase_schema.sql
--   2. supabase_schema_jobs.sql
--   3. supabase_schema_messaging.sql
--   4. supabase_schema_payroll.sql
--   5. supabase_migration_assignments_notifications.sql
--   6. supabase_migration_time_payroll_v2.sql
--   7. supabase_migration_v3_features.sql
--   8. supabase_migration_v4_fieldbook.sql
--   9. supabase_seed_curriculum.sql
--  10. supabase_seed_fs_prep.sql
--  11. supabase_seed_acc_courses.sql
--
-- WARNING: This is IRREVERSIBLE. Back up your data first!
-- ============================================================================

-- ==========================================================================
-- 0. Drop pay caps tables (supabase_migration_v5_pay_caps.sql)
-- ==========================================================================
DROP TABLE IF EXISTS pay_system_config CASCADE;

-- ==========================================================================
-- 1. Drop fieldbook tables (supabase_migration_v4_fieldbook.sql)
-- ==========================================================================
DROP TABLE IF EXISTS fieldbook_entry_categories CASCADE;
DROP TABLE IF EXISTS fieldbook_categories CASCADE;

-- ==========================================================================
-- 2. Drop v3 feature tables (supabase_migration_v3_features.sql)
-- ==========================================================================
DROP TABLE IF EXISTS user_presence CASCADE;
DROP TABLE IF EXISTS typing_indicators CASCADE;
DROP TABLE IF EXISTS admin_discussion_threads CASCADE;

-- ==========================================================================
-- 3. Drop time/payroll v2 tables (supabase_migration_time_payroll_v2.sql)
-- ==========================================================================
DROP TABLE IF EXISTS weekly_pay_periods CASCADE;
DROP TABLE IF EXISTS scheduled_bonuses CASCADE;
DROP TABLE IF EXISTS pay_advance_requests CASCADE;
DROP TABLE IF EXISTS daily_time_logs CASCADE;
DROP TABLE IF EXISTS employee_earned_credentials CASCADE;
DROP TABLE IF EXISTS credential_bonuses CASCADE;
DROP TABLE IF EXISTS seniority_brackets CASCADE;
DROP TABLE IF EXISTS role_tiers CASCADE;
DROP TABLE IF EXISTS work_type_rates CASCADE;

-- ==========================================================================
-- 4. Drop assignment/notification tables
--    (supabase_migration_assignments_notifications.sql)
-- ==========================================================================
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS assignments CASCADE;

-- ==========================================================================
-- 5. Drop payroll tables (supabase_schema_payroll.sql)
-- ==========================================================================
DROP TABLE IF EXISTS job_payment_allocations CASCADE;
DROP TABLE IF EXISTS withdrawal_requests CASCADE;
DROP TABLE IF EXISTS balance_transactions CASCADE;
DROP TABLE IF EXISTS pay_stubs CASCADE;
DROP TABLE IF EXISTS payroll_runs CASCADE;
DROP TABLE IF EXISTS role_pay_adjustments CASCADE;
DROP TABLE IF EXISTS pay_raises CASCADE;
DROP TABLE IF EXISTS pay_rate_standards CASCADE;
DROP TABLE IF EXISTS employee_certifications CASCADE;
DROP TABLE IF EXISTS employee_profiles CASCADE;

-- ==========================================================================
-- 6. Drop messaging tables (supabase_schema_messaging.sql)
-- ==========================================================================
DROP TABLE IF EXISTS pinned_messages CASCADE;
DROP TABLE IF EXISTS messaging_preferences CASCADE;
DROP TABLE IF EXISTS message_reactions CASCADE;
DROP TABLE IF EXISTS message_read_receipts CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversation_participants CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;

-- ==========================================================================
-- 7. Drop job management tables (supabase_schema_jobs.sql)
-- ==========================================================================
DROP TABLE IF EXISTS equipment_inventory CASCADE;
DROP TABLE IF EXISTS job_checklists CASCADE;
DROP TABLE IF EXISTS job_field_data CASCADE;
DROP TABLE IF EXISTS job_payments CASCADE;
DROP TABLE IF EXISTS job_time_entries CASCADE;
DROP TABLE IF EXISTS job_stages_history CASCADE;
DROP TABLE IF EXISTS job_research CASCADE;
DROP TABLE IF EXISTS job_files CASCADE;
DROP TABLE IF EXISTS job_equipment CASCADE;
DROP TABLE IF EXISTS job_team CASCADE;
DROP TABLE IF EXISTS job_tags CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;

-- ==========================================================================
-- 8. Drop core schema tables (supabase_schema.sql)
--    Order: child tables first, then parent tables
-- ==========================================================================

-- Error reports
DROP TABLE IF EXISTS error_reports CASCADE;

-- Activity & recycle bin
DROP TABLE IF EXISTS activity_log CASCADE;
DROP TABLE IF EXISTS recycle_bin CASCADE;
DROP TABLE IF EXISTS practice_sessions CASCADE;
DROP TABLE IF EXISTS media_library CASCADE;

-- User milestone/progress tracking
DROP TABLE IF EXISTS user_milestone_progress CASCADE;
DROP TABLE IF EXISTS curriculum_milestones CASCADE;

-- Employee profile changes & role history
DROP TABLE IF EXISTS employee_profile_changes CASCADE;
DROP TABLE IF EXISTS employee_role_history CASCADE;

-- Payout log
DROP TABLE IF EXISTS payout_log CASCADE;

-- Credit system
DROP TABLE IF EXISTS employee_threshold_achievements CASCADE;
DROP TABLE IF EXISTS credit_thresholds CASCADE;
DROP TABLE IF EXISTS employee_learning_credits CASCADE;
DROP TABLE IF EXISTS learning_credit_values CASCADE;

-- Admin alert settings
DROP TABLE IF EXISTS admin_alert_settings CASCADE;

-- Education courses
DROP TABLE IF EXISTS education_courses CASCADE;

-- Module completions & XP config
DROP TABLE IF EXISTS module_completions CASCADE;
DROP TABLE IF EXISTS module_xp_config CASCADE;

-- Badges & rewards
DROP TABLE IF EXISTS user_badges CASCADE;
DROP TABLE IF EXISTS badges CASCADE;
DROP TABLE IF EXISTS rewards_purchases CASCADE;
DROP TABLE IF EXISTS rewards_catalog CASCADE;

-- XP system
DROP TABLE IF EXISTS xp_milestone_achievements CASCADE;
DROP TABLE IF EXISTS xp_pay_milestones CASCADE;
DROP TABLE IF EXISTS xp_balances CASCADE;
DROP TABLE IF EXISTS xp_transactions CASCADE;

-- FS exam prep
DROP TABLE IF EXISTS fs_weak_areas CASCADE;
DROP TABLE IF EXISTS fs_mock_exam_attempts CASCADE;
DROP TABLE IF EXISTS fs_module_progress CASCADE;
DROP TABLE IF EXISTS fs_study_modules CASCADE;

-- Fieldbook notes
DROP TABLE IF EXISTS fieldbook_notes CASCADE;

-- Bookmarks & user progress
DROP TABLE IF EXISTS user_bookmarks CASCADE;
DROP TABLE IF EXISTS user_progress CASCADE;

-- Flashcards
DROP TABLE IF EXISTS flashcard_reviews CASCADE;
DROP TABLE IF EXISTS user_flashcard_discovery CASCADE;
DROP TABLE IF EXISTS user_flashcards CASCADE;
DROP TABLE IF EXISTS flashcards CASCADE;

-- Quiz system
DROP TABLE IF EXISTS quiz_attempt_answers CASCADE;
DROP TABLE IF EXISTS quiz_attempts CASCADE;

-- Question bank & exam prep categories
DROP TABLE IF EXISTS question_bank CASCADE;
DROP TABLE IF EXISTS exam_prep_categories CASCADE;

-- Lessons & lesson content
DROP TABLE IF EXISTS lesson_blocks CASCADE;
DROP TABLE IF EXISTS lesson_versions CASCADE;
DROP TABLE IF EXISTS learning_topics CASCADE;
DROP TABLE IF EXISTS learning_lessons CASCADE;

-- KB articles
DROP TABLE IF EXISTS kb_articles CASCADE;

-- Learning modules (parent of lessons)
DROP TABLE IF EXISTS learning_modules CASCADE;

-- ==========================================================================
-- 9. Drop shared triggers and functions
-- ==========================================================================
DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
DROP TRIGGER IF EXISTS update_job_research_updated_at ON job_research;
DROP TRIGGER IF EXISTS update_equipment_updated_at ON equipment_inventory;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- ==========================================================================
-- Done!
-- ==========================================================================
SELECT 'All tables have been dropped. Run schema and seed files in order to rebuild.' AS result;
