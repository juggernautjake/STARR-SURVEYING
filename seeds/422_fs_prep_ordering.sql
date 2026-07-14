-- 422_fs_prep_ordering.sql
-- FS Exam Alignment Buildout — Slice S2.
-- First "put in order" (ordering) questions. QuizRunner renders a reorderable
-- list (▲/▼ buttons, keyboard-accessible) and stores a JSON array of the items
-- in the student's chosen order; the quizzes route grades exact-sequence
-- equality (gradeOrdering) and the universal checkAnswer dispatches to
-- checkOrdering().
--
-- Convention: options = jsonb array of the items (stored scrambled; the UI also
-- shuffles on load); correct_answer = JSON array (text) of the items in the
-- CORRECT order (first → last). Idempotent: delete-by-tag then insert.

-- Widen the question_type CHECK constraint to admit the new interaction types
-- (ordering now; drag_label + hotspot in S3/S4). Idempotent drop-then-add.
ALTER TABLE question_bank DROP CONSTRAINT IF EXISTS question_bank_question_type_check;
ALTER TABLE question_bank ADD CONSTRAINT question_bank_question_type_check
  CHECK (question_type = ANY (ARRAY[
    'multiple_choice','true_false','short_answer','fill_blank','multi_select',
    'ordering','drag_label','hotspot','numeric_input','math_template','essay'
  ]::text[]));

DELETE FROM question_bank WHERE 'fs-ordering' = ANY(tags);

INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
-- Q32 mirror (Module 4 — Traversing): compass/transit-rule adjustment order.
('fa220000-0000-0000-0000-000000000001',
 'Using the compass (Bowditch) / transit rule to complete a traverse adjustment, put the steps in the correct order (first at top).',
 'ordering',
 '["Calculate departures and latitudes","Adjust the latitudes and departures for misclosure","Adjust the angles to fixed geometric conditions","Calculate the lengths and azimuths of the traverse lines after adjustment","Determine the azimuths of the traverse sides"]'::jsonb,
 '["Adjust the angles to fixed geometric conditions","Determine the azimuths of the traverse sides","Calculate departures and latitudes","Adjust the latitudes and departures for misclosure","Calculate the lengths and azimuths of the traverse lines after adjustment"]',
 'First balance the angles to the fixed geometric condition (interior angles sum to (n−2)·180°). Then compute azimuths/bearings of the sides from the adjusted angles, compute each side''s latitude and departure, distribute the misclosure across the latitudes and departures (compass/transit rule), and finally recompute the adjusted lengths and azimuths from the adjusted latitudes and departures.',
 'medium','f5000004-0000-0000-0000-000000000004','FS',
 ARRAY['fs-ordering','fs-exam-mirror','genre:traverse-cogo','fs-m4']::text[],true,'approved',
 '[{"type":"handbook","label":"Traverse computation & adjustment"}]'::jsonb,false,0.01),

-- Q21 mirror (Module 7 — Boundary): parts of a metes-and-bounds description.
('fa220000-0000-0000-0000-000000000002',
 'Put the parts of a metes-and-bounds legal description in their correct order of appearance (first at top).',
 'ordering',
 '["Qualifying clauses","Body","Augmenting clauses","Caption or heading"]'::jsonb,
 '["Caption or heading","Body","Qualifying clauses","Augmenting clauses"]',
 'A written land description runs: the caption/heading (general locators — state, county, subdivision), then the body (the actual metes-and-bounds courses), then qualifying clauses (exceptions, "subject to", "less and except"), then augmenting clauses ("together with" appurtenances/easements).',
 'medium','f5000007-0000-0000-0000-000000000007','FS',
 ARRAY['fs-ordering','fs-exam-mirror','genre:boundary-legal','fs-m7']::text[],true,'approved',
 '[{"type":"handbook","label":"Legal descriptions — structure"}]'::jsonb,false,0.01),

-- Q17 mirror (Module 7 — Boundary): priority of conflicting title elements.
('fa220000-0000-0000-0000-000000000003',
 'Rank these conflicting boundary/title elements from MOST important (top) to LEAST important (bottom).',
 'ordering',
 '["Area","Called-for monument","Distance","Senior rights","Right of possession"]'::jsonb,
 '["Right of possession","Senior rights","Called-for monument","Distance","Area"]',
 'In the NCEES ordering, right of possession ranks first, then senior rights, then called-for monuments, then distance, then area (quantity is least controlling). Note this places right of possession above senior rights — a deviation from the classic "senior rights first" hierarchy that is worth remembering for the exam. The lower rungs (monument > direction/distance > area) are the standard priority of calls.',
 'hard','f5000007-0000-0000-0000-000000000007','FS',
 ARRAY['fs-ordering','fs-exam-mirror','genre:boundary-legal','challenge','fs-m7']::text[],true,'approved',
 '[{"type":"handbook","label":"Priority of conflicting elements"}]'::jsonb,false,0.01);
