-- 421_fs_prep_multi_select.sql
-- FS Exam Alignment Buildout — Slice S1.
-- First "select all that apply" (multi_select) questions. The type is already
-- wired end-to-end: QuizRunner stores the chosen option *strings* as a JSON
-- array; the quizzes route grades with set-equality (gradeMultiSelect) and the
-- universal checkAnswer() now dispatches multi_select to checkMultiSelect().
--
-- Convention: options = jsonb array of option strings; correct_answer = JSON
-- array (text) of the EXACT correct option strings (must match options entries).
-- Idempotent: delete-by-tag then insert.

DELETE FROM question_bank WHERE 'fs-multi-select' = ANY(tags);

INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
-- Q1 mirror (Module 2 — Leveling): curvature & refraction over long sights.
('fa210000-0000-0000-0000-000000000001',
 'When running differential levels over long sightlines, which effects must be accounted for to keep the results accurate? Select all that apply.',
 'multi_select',
 '["Curvature of the earth","Atmospheric refraction","Focal length of the telescope","Latitude of the setup","Earth''s magnetic declination"]'::jsonb,
 '["Curvature of the earth","Atmospheric refraction"]',
 'Over long sights the level line of sight departs from a truly level surface because of the curvature of the earth, and it is bent by atmospheric refraction. The two are handled together as the combined curvature-and-refraction correction (balancing backsight and foresight distances cancels most of it). Telescope focal length, setup latitude, and magnetic declination do not affect a level line of sight.',
 'medium','f5000002-0000-0000-0000-000000000002','FS',
 ARRAY['fs-multi-select','fs-exam-mirror','genre:leveling','fs-m2']::text[],true,'approved',
 '[{"type":"handbook","label":"Leveling — curvature & refraction"}]'::jsonb,false,0.01),

-- Module 1 — Fundamentals: classify systematic errors.
('fa210000-0000-0000-0000-000000000002',
 'Which of the following are systematic errors (as opposed to random errors or blunders)? Select all that apply.',
 'multi_select',
 '["Using a tape that is actually 100.02 ft long as if it were exactly 100.00 ft","Thermal expansion of a steel tape on a hot day","Transposing digits when recording a field measurement","Small, unpredictable variation in pointing the crosshairs","An uncorrected EDM instrument (prism) constant"]'::jsonb,
 '["Using a tape that is actually 100.02 ft long as if it were exactly 100.00 ft","Thermal expansion of a steel tape on a hot day","An uncorrected EDM instrument (prism) constant"]',
 'Systematic errors follow a physical law and repeat with the same sign and magnitude under the same conditions, so they accumulate and can be corrected: a tape-length (standardization) error, thermal expansion, and an instrument/prism constant are all systematic. Transposing digits is a blunder (mistake); the small unpredictable variation in pointing is a random error.',
 'medium','f5000001-0000-0000-0000-000000000001','FS',
 ARRAY['fs-multi-select','fs-exam-mirror','genre:measurement-error','fs-m1']::text[],true,'approved',
 '[{"type":"handbook","label":"Types of errors"}]'::jsonb,false,0.01),

-- Module 3 — Distance & Angle: steel-taping corrections.
('fa210000-0000-0000-0000-000000000003',
 'Which corrections are commonly applied to a steel-tape distance measurement? Select all that apply.',
 'multi_select',
 '["Temperature correction","Tension (pull) correction","Sag correction","Correction for the Earth''s rotation","Slope (grade) correction"]'::jsonb,
 '["Temperature correction","Tension (pull) correction","Sag correction","Slope (grade) correction"]',
 'The standard steel-taping corrections are temperature, tension (pull), sag, and slope (plus tape standardization). The Earth''s rotation has no effect on a taped distance.',
 'medium','f5000003-0000-0000-0000-000000000003','FS',
 ARRAY['fs-multi-select','fs-exam-mirror','genre:distance-edm','fs-m3']::text[],true,'approved',
 '[{"type":"handbook","label":"Distance measurement — taping corrections"}]'::jsonb,false,0.01);
