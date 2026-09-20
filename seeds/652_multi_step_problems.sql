-- seeds/652_multi_step_problems.sql — problems you solve a part at a time, and marks that survive.
--
-- Owner, 2026-09-19: "There should be problems that require use to solve the different parts of the
-- problem so that it can check each step of our process … It should be able to grade each part and
-- should be able to show how to fully solve the problem and each part … We would want different
-- levels of difficulty, so that problems have one step, or multiple steps that build on each other
-- as we solve the problem."
--
-- ── TWO THINGS, AND THE SECOND IS A BUG ─────────────────────────────────────────────────────────
--
-- 1. `question_bank.steps` — the parts of a problem, and the givens they work from.
-- 2. `quiz_attempt_answers.partial_score` — which SHOULD have existed already.
--
-- The second one is worth stating plainly. `lib/learn/questionDelivery.ts` has computed partial
-- credit for fill_blank, multi_select and ordering since it was written; `QuizRunner` renders it as
-- an "N% credit" badge. But there was nowhere to put it, and `quiz_attempts.score_percent` is
-- computed from `is_correct` alone — so the badge a student saw was cosmetic, and a paper where
-- they got three blanks of four right scored the same as one where they got none. Multi-step
-- grading would have inherited exactly that, so the column comes first.
--
-- ── WHY `steps` LIVES ON question_bank ──────────────────────────────────────────────────────────
--
-- Not a new `practice_problems` table. A multi-step problem IS a question: it belongs to a module,
-- it has a difficulty, it is answered in an attempt, it needs `times_answered` like every other. A
-- separate table would need its own copy of all of that, plus a second delivery path, a second
-- attempts table and a second set of statistics — and the exam would then have two kinds of
-- question that behave differently for no reason a student could see.
--
-- ── THE SHAPE, AND WHY THE FORMULAS ARE STORED RATHER THAN THE ANSWERS ──────────────────────────
--
-- steps = [
--   { "id":"dN",   "prompt":"Compute ΔN",       "formula":"bN - aN",            "unit":"ft" },
--   { "id":"dE",   "prompt":"Compute ΔE",       "formula":"bE - aE",            "unit":"ft" },
--   { "id":"dist", "prompt":"Compute the distance",
--                  "formula":"sqrt(dN*dN + dE*dE)", "unit":"ft", "tolerance":0.05,
--                  "explanation":"Pythagoras on the latitude and departure." }
-- ]
-- given_vars = { "aN":1000, "aE":2000, "bN":1300, "bE":2400 }
--
-- A step's `id` is a variable later steps compute with. That is what makes carry-forward grading
-- possible: the marker evaluates step 3 twice — once from the true figures and once from the
-- numbers the student actually entered — and credits the step when their arithmetic is right given
-- their own inputs. Storing fixed answers instead would make that impossible, because there would
-- be nothing to re-evaluate. See lib/learn/gradeSteps.ts.

BEGIN;

-- ── 1. the marks ────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.quiz_attempt_answers
  -- 0..1. NULL for a question that is simply right or wrong, so "no partial credit here" and
  -- "scored zero" stay different facts.
  ADD COLUMN IF NOT EXISTS partial_score numeric(4,3),
  -- What the student entered for each part, and how each was marked. Kept so a worked solution can
  -- be shown again later — "you had 424.26, carried from your ΔE" is not reconstructible from a
  -- score.
  ADD COLUMN IF NOT EXISTS step_results jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quiz_attempt_answers_partial_score_check') THEN
    ALTER TABLE public.quiz_attempt_answers
      ADD CONSTRAINT quiz_attempt_answers_partial_score_check
      CHECK (partial_score IS NULL OR (partial_score >= 0 AND partial_score <= 1));
  END IF;
END $$;

COMMENT ON COLUMN public.quiz_attempt_answers.partial_score IS
  'Share of a question earned, 0..1, for question types that can be partly right (fill_blank, multi_select, ordering, multi_step). NULL when the type is all-or-nothing. Computed by lib/learn/questionDelivery.ts and lib/learn/gradeSteps.ts. See seeds/652.';

-- ── 2. the problems ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.question_bank
  -- The parts, in order. NULL for every ordinary question.
  ADD COLUMN IF NOT EXISTS steps jsonb,
  -- The numbers printed in the question, which the step formulas compute from.
  ADD COLUMN IF NOT EXISTS given_vars jsonb;

-- `multi_step` joins the eleven existing types. Rebuilt rather than added to, because the original
-- CHECK names them inline and there is no way to extend one in place.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'question_bank_question_type_check') THEN
    ALTER TABLE public.question_bank DROP CONSTRAINT question_bank_question_type_check;
  END IF;
  ALTER TABLE public.question_bank
    ADD CONSTRAINT question_bank_question_type_check
    CHECK (question_type = ANY (ARRAY[
      'multiple_choice', 'true_false', 'short_answer', 'fill_blank', 'multi_select',
      'ordering', 'drag_label', 'hotspot', 'numeric_input', 'math_template', 'essay',
      'multi_step'
    ]));
END $$;

-- A multi-step question must actually have steps. Without this a row could claim the type, deliver
-- an empty ladder, and be marked 0/0 — which `gradeMultiStep` reports as a score of zero and a
-- student reads as "I got everything wrong".
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'question_bank_multi_step_has_steps') THEN
    ALTER TABLE public.question_bank
      ADD CONSTRAINT question_bank_multi_step_has_steps
      CHECK (question_type <> 'multi_step' OR (steps IS NOT NULL AND jsonb_array_length(steps) > 0));
  END IF;
END $$;

COMMENT ON COLUMN public.question_bank.steps IS
  'Ordered parts of a multi-step problem: [{id, prompt, formula, unit, tolerance, explanation}]. A step id is a variable later steps compute with, which is what makes carry-forward grading possible — see lib/learn/gradeSteps.ts and seeds/652.';

-- The practice panel's question: which multi-step problems does this module have, by difficulty?
CREATE INDEX IF NOT EXISTS idx_question_bank_multi_step
  ON public.question_bank (module_id, difficulty)
  WHERE question_type = 'multi_step' AND deleted_at IS NULL;

COMMIT;
