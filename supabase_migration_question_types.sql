-- Migration: Add new question types to question_bank
-- Run this against your Supabase database to support:
--   fill_blank, multi_select, numeric_input, math_template

-- 1. Drop the old CHECK constraint and add the expanded one
ALTER TABLE question_bank
  DROP CONSTRAINT IF EXISTS question_bank_question_type_check;

ALTER TABLE question_bank
  ADD CONSTRAINT question_bank_question_type_check
  CHECK (question_type IN (
    'multiple_choice',
    'true_false',
    'short_answer',
    'fill_blank',
    'multi_select',
    'numeric_input',
    'math_template'
  ));

-- 2. Create quiz_attempt_answers table if it doesn't exist
--    (used by the quiz grading system to store per-question results)
CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
  user_answer TEXT,
  is_correct BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add indexes for quiz_attempt_answers
CREATE INDEX IF NOT EXISTS idx_quiz_attempt_answers_attempt
  ON quiz_attempt_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempt_answers_question
  ON quiz_attempt_answers(question_id);

-- 4. Enable RLS on quiz_attempt_answers (if not already)
ALTER TABLE quiz_attempt_answers ENABLE ROW LEVEL SECURITY;

-- 5. RLS policy: users can read their own attempt answers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'quiz_attempt_answers' AND policyname = 'Users can read own attempt answers'
  ) THEN
    CREATE POLICY "Users can read own attempt answers"
      ON quiz_attempt_answers FOR SELECT
      USING (
        attempt_id IN (
          SELECT id FROM quiz_attempts WHERE user_email = current_setting('request.jwt.claims')::json->>'email'
        )
      );
  END IF;
END $$;
