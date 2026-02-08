-- ============================================================================
-- STARR SURVEYING — Content Reset Script
-- ============================================================================
-- This script removes ALL educational content (modules, lessons, articles,
-- questions, flashcards, progress, etc.) while preserving table structures.
--
-- After running this, run supabase_seed_curriculum.sql to repopulate content.
--
-- WARNING: This is IRREVERSIBLE. Back up your data first.
-- ============================================================================

BEGIN;

-- 1. Clear user progress & activity data
DELETE FROM user_milestone_progress;
DELETE FROM module_completions;
DELETE FROM xp_milestone_achievements;
DELETE FROM user_badges;
DELETE FROM rewards_purchases;
DELETE FROM xp_transactions;
DELETE FROM employee_learning_credits;
DELETE FROM employee_threshold_achievements;
DELETE FROM practice_sessions;
DELETE FROM flashcard_reviews;
DELETE FROM user_flashcard_discovery;
DELETE FROM quiz_attempt_answers;
DELETE FROM quiz_attempts;
DELETE FROM user_progress;
DELETE FROM user_bookmarks;
DELETE FROM fieldbook_notes;
DELETE FROM activity_log;
DELETE FROM fs_mock_exam_attempts;
DELETE FROM fs_module_progress;
DELETE FROM fs_weak_areas;
DELETE FROM recycle_bin;

-- 2. Clear content tables (order matters due to FK constraints)
DELETE FROM lesson_blocks;
DELETE FROM lesson_versions;
DELETE FROM learning_topics;
DELETE FROM question_bank;
DELETE FROM user_flashcards;
DELETE FROM flashcards;
DELETE FROM learning_lessons;
DELETE FROM kb_articles;
DELETE FROM learning_modules;
DELETE FROM fs_study_modules;
DELETE FROM exam_prep_categories;
DELETE FROM curriculum_milestones;
DELETE FROM media_library;

-- 3. Clear XP and reward configuration
DELETE FROM module_xp_config;
DELETE FROM badges;
DELETE FROM rewards_catalog;
DELETE FROM xp_pay_milestones;
DELETE FROM credit_thresholds;
DELETE FROM learning_credit_values;

-- 4. Reset XP balances to zero (don't delete rows—they're per-user)
UPDATE xp_balances SET current_balance = 0, total_earned = 0, total_spent = 0;

COMMIT;

SELECT 'All educational content has been cleared. Run supabase_seed_curriculum.sql to repopulate.' AS result;
