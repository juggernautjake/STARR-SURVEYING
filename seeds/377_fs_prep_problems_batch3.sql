-- seeds/377_fs_prep_problems_batch3.sql
-- SIT / FS exam-prep — third batch of hand-verified premade problems, deepening
-- volume + thin genres (leveling, boundary-legal incl. Texas, photogrammetry,
-- gnss/geodesy conversions, vertical curves, distance). All answers node-checked.

BEGIN;

INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
('fb377000-0000-0000-0000-000000000001',
 'A differential leveling loop is 4.0 miles long. If the allowable misclosure is C = 0.02·√(miles), what is the allowable misclosure (ft)?',
 'numeric_input', '[]'::jsonb, '0.04',
 'C = 0.02·√4 = 0.02 × 2 = 0.04 ft. (The allowable misclosure grows with the square root of the loop length.)',
 'hard', 'f5000002-0000-0000-0000-000000000002', 'FS',
 ARRAY['fs-buildout-v7','genre:leveling','fs-m2','challenge']::text[], true, 'approved',
 '[{"type":"module","id":"2","label":"Leveling"}]'::jsonb, false, 0.005),

('fb377000-0000-0000-0000-000000000002',
 'A square parcel from an old Texas grant measures 1,000 varas on each side. Using the Texas vara = 33 1/3 in, what is its area in acres?',
 'numeric_input', '[]'::jsonb, '177.14',
 'Side = 1000 × 2.77778 ft = 2777.78 ft. Area = 2777.78² = 7,716,049 sq ft ÷ 43,560 = 177.14 acres.',
 'hard', 'f5000007-0000-0000-0000-000000000007', 'FS',
 ARRAY['fs-buildout-v7','genre:boundary-legal','fs-m7','texas','challenge']::text[], true, 'approved',
 '[{"type":"module","id":"7","label":"Boundary Law & Public Lands"}]'::jsonb, false, 0.1),

('fb377000-0000-0000-0000-000000000003',
 'A vertical photograph has a scale of 1:6,000 and was taken with a 6-inch focal-length camera. What was the flying height above the ground (ft)?',
 'numeric_input', '[]'::jsonb, '3000',
 'S = f/H → H = f/S = (6 in ÷ 12 = 0.5 ft) × 6000 = 3000 ft.',
 'medium', 'f5000008-0000-0000-0000-000000000008', 'FS',
 ARRAY['fs-buildout-v7','genre:photogrammetry','fs-m8']::text[], true, 'approved',
 '[{"type":"module","id":"8","label":"Photogrammetry, GIS and Construction"}]'::jsonb, false, 1),

('fb377000-0000-0000-0000-000000000004',
 'A 9-inch-format vertical photograph is exposed at a scale of 1:12,000. What is the ground distance covered along one edge of the photo (ft)?',
 'numeric_input', '[]'::jsonb, '9000',
 'Ground = photo dimension × scale = 9 in × 12,000 = 108,000 in ÷ 12 = 9,000 ft.',
 'hard', 'f5000008-0000-0000-0000-000000000008', 'FS',
 ARRAY['fs-buildout-v7','genre:photogrammetry','fs-m8','challenge']::text[], true, 'approved',
 '[{"type":"module","id":"8","label":"Photogrammetry, GIS and Construction"}]'::jsonb, false, 1),

('fb377000-0000-0000-0000-000000000005',
 'Convert 5.00 acres to square feet.',
 'numeric_input', '[]'::jsonb, '217800',
 '1 acre = 43,560 sq ft, so 5.00 × 43,560 = 217,800 sq ft.',
 'easy', 'f5000005-0000-0000-0000-000000000005', 'FS',
 ARRAY['fs-buildout-v7','genre:areas-volumes','fs-m5']::text[], true, 'approved',
 '[{"type":"module","id":"5","label":"Areas, Volumes & Curves"}]'::jsonb, false, 1),

('fb377000-0000-0000-0000-000000000006',
 'Convert the angle 45°30''00" to decimal degrees.',
 'numeric_input', '[]'::jsonb, '45.5',
 'Decimal degrees = d + m/60 + s/3600 = 45 + 30/60 + 0/3600 = 45.5°.',
 'easy', 'f5000003-0000-0000-0000-000000000003', 'FS',
 ARRAY['fs-buildout-v7','genre:angles-directions','fs-m3']::text[], true, 'approved',
 '[{"type":"module","id":"3","label":"Distance & Angle Measurement"}]'::jsonb, false, 0.01),

('fb377000-0000-0000-0000-000000000007',
 'What is the theoretical sum of the interior angles of a closed eight-sided (octagonal) traverse?',
 'multiple_choice', '["1080°","900°","1260°","720°"]'::jsonb,
 '1080°',
 'Sum = (n − 2) × 180° = (8 − 2) × 180° = 1080°.',
 'easy', 'f5000004-0000-0000-0000-000000000004', 'FS',
 ARRAY['fs-buildout-v7','genre:traverse-cogo','fs-m4']::text[], true, 'approved',
 '[{"type":"module","id":"4","label":"Traversing & COGO"}]'::jsonb, false, 0.01),

('fb377000-0000-0000-0000-000000000008',
 'An equal-tangent vertical curve has g1 = +4.00%, g2 = −2.00%, and length L = 500 ft (5 full stations). What is the rate of grade change r, in percent per station?',
 'numeric_input', '[]'::jsonb, '-1.2',
 'r = (g2 − g1)/L(stations) = (−2 − 4)/5 = −6/5 = −1.20 %/station.',
 'medium', 'f5000005-0000-0000-0000-000000000005', 'FS',
 ARRAY['fs-buildout-v7','genre:vertical-curves','fs-m5']::text[], true, 'approved',
 '[{"type":"module","id":"5","label":"Areas, Volumes & Curves"}]'::jsonb, false, 0.02),

('fb377000-0000-0000-0000-000000000009',
 'A slope distance of 500.00 ft is measured between two points differing in elevation by 30.00 ft. What is the horizontal distance (ft)?',
 'numeric_input', '[]'::jsonb, '499.10',
 'H = √(S² − Δelev²) = √(500² − 30²) = √(250000 − 900) = √249100 = 499.10 ft.',
 'medium', 'f5000003-0000-0000-0000-000000000003', 'FS',
 ARRAY['fs-buildout-v7','genre:distance-edm','fs-m3']::text[], true, 'approved',
 '[{"type":"module","id":"3","label":"Distance & Angle Measurement"}]'::jsonb, false, 0.05)

ON CONFLICT (id) DO NOTHING;

COMMIT;
