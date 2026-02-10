-- Migration: Add description and learning_objectives columns to learning_lessons
-- Required by: wk0–wk4 seed files that SET these columns
-- Run this BEFORE running any supabase_seed_acc_content_1341_wk*.sql files

ALTER TABLE learning_lessons
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS learning_objectives TEXT[] DEFAULT '{}';
