-- seeds/382_fs_prep_vc_easy.sql — complete the genre×difficulty matrix: add
-- foundational (easy) vertical-curve problems. Answers node-verified.
BEGIN;
INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
('fb382000-0000-0000-0000-000000000001',
 'An equal-tangent vertical curve is 800 ft long. Express its length in stations (1 station = 100 ft).',
 'numeric_input', '[]'::jsonb, '8',
 'Length in stations = 800 ÷ 100 = 8 stations. Vertical-curve computations are usually carried out in stations.',
 'easy', 'f5000005-0000-0000-0000-000000000005', 'FS',
 ARRAY['fs-buildout-v8','genre:vertical-curves','fs-m5']::text[], true, 'approved',
 '[{"type":"module","id":"5","label":"Areas, Volumes & Curves"}]'::jsonb, false, 0.01),
('fb382000-0000-0000-0000-000000000002',
 'A vertical curve begins (BVC) at station 10+00 and is 600 ft long. At what station is the end of the curve (EVC)? Give the station in feet.',
 'numeric_input', '[]'::jsonb, '1600',
 'EVC station = BVC station + L = 1000 ft (10+00) + 600 ft = 1600 ft, i.e., station 16+00.',
 'easy', 'f5000005-0000-0000-0000-000000000005', 'FS',
 ARRAY['fs-buildout-v8','genre:vertical-curves','fs-m5']::text[], true, 'approved',
 '[{"type":"module","id":"5","label":"Areas, Volumes & Curves"}]'::jsonb, false, 1)
ON CONFLICT (id) DO NOTHING;
COMMIT;
