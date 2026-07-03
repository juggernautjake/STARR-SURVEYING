-- seeds/388_fs_prep_problems_batch7.sql — seventh batch: more exam scenarios
-- (tape standardization, linear misclosure, degree of curve, GNSS baseline,
-- azimuth→bearing). Answers node-verified.
BEGIN;
INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
('fb388000-0000-0000-0000-000000000001',
 'A nominal 100-ft steel tape is actually 100.02 ft long when standardized. Using this tape, a line is recorded as 500.00 ft. What is the corrected (true) distance, in ft?',
 'numeric_input','[]'::jsonb,'500.10',
 'A tape that is too long makes the recorded distance too short, so multiply by the ratio of actual to nominal length: 500.00 × (100.02/100.00) = 500.10 ft.',
 'medium','f5000003-0000-0000-0000-000000000003','FS',
 ARRAY['fs-buildout-v8','genre:distance-edm','fs-m3']::text[],true,'approved',
 '[{"type":"module","id":"3","label":"Distance & Angle Measurement"}]'::jsonb,false,0.02),
('fb388000-0000-0000-0000-000000000002',
 'A closed traverse has a total latitude misclosure of +0.08 ft and a total departure misclosure of −0.06 ft. What is the linear misclosure, in ft?',
 'numeric_input','[]'::jsonb,'0.10',
 'Linear misclosure = √(ΣLat_err² + ΣDep_err²) = √(0.08² + 0.06²) = √(0.0064 + 0.0036) = √0.01 = 0.10 ft.',
 'medium','f5000004-0000-0000-0000-000000000004','FS',
 ARRAY['fs-buildout-v8','genre:traverse-cogo','fs-m4']::text[],true,'approved',
 '[{"type":"module","id":"4","label":"Traversing & COGO"}]'::jsonb,false,0.005),
('fb388000-0000-0000-0000-000000000003',
 'Using the arc definition (D is the central angle subtended by a 100-ft arc), what is the radius of a 2°00'' curve, in ft?',
 'numeric_input','[]'::jsonb,'2864.79',
 'R = 5729.58 / D = 5729.58 / 2 = 2864.79 ft. (The constant 5729.58 = 100·180/π.)',
 'hard','f5000005-0000-0000-0000-000000000005','FS',
 ARRAY['fs-buildout-v8','genre:horizontal-curves','fs-m5','challenge']::text[],true,'approved',
 '[{"type":"module","id":"5","label":"Areas, Volumes & Curves"}]'::jsonb,false,0.1),
('fb388000-0000-0000-0000-000000000004',
 'A GNSS baseline vector has components ΔN = 300.00 ft, ΔE = 400.00 ft, and ΔU = 0.00 ft. What is the baseline length, in ft?',
 'numeric_input','[]'::jsonb,'500',
 'Length = √(ΔN² + ΔE² + ΔU²) = √(300² + 400² + 0²) = √250000 = 500.00 ft.',
 'medium','f5000006-0000-0000-0000-000000000006','FS',
 ARRAY['fs-buildout-v8','genre:gnss-geodesy','fs-m6']::text[],true,'approved',
 '[{"type":"module","id":"6","label":"GNSS/GPS & Geodesy"}]'::jsonb,false,0.02),
('fb388000-0000-0000-0000-000000000005',
 'A line has an azimuth of 315°00''. Express its direction as a quadrant bearing.',
 'multiple_choice','["N 45° W","N 45° E","S 45° W","S 45° E"]'::jsonb,
 'N 45° W',
 'Azimuth 315° is between 270° and 360° (NW quadrant). Bearing angle = 360° − 315° = 45°, so N 45° W.',
 'easy','f5000003-0000-0000-0000-000000000003','FS',
 ARRAY['fs-buildout-v8','genre:angles-directions','fs-m3']::text[],true,'approved',
 '[{"type":"module","id":"3","label":"Distance & Angle Measurement"}]'::jsonb,false,0.01)
ON CONFLICT (id) DO NOTHING;
COMMIT;
