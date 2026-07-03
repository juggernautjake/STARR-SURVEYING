-- seeds/392_fs_prep_problems_batch9.sql — ninth batch: problems drawn from
-- formulas confirmed in the official NCEES FS Reference Handbook v2.5
-- (relief displacement, angle between lines by slope, vertical-curve PVI offset).
BEGIN;
INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
('fb392100-0000-0000-0000-000000000001',
 'On a vertical photograph the flying height above the ground is 5,000 ft. An object 500 ft tall images at a radial distance of 3.00 in from the principal point. What is its relief displacement, in inches?',
 'numeric_input','[]'::jsonb,'0.3',
 'Relief displacement d = r·h / H = (3.00 × 500) / 5,000 = 0.30 in. (Displacement grows with object height and radial distance, and shrinks with flying height.)',
 'hard','f5000008-0000-0000-0000-000000000008','FS',
 ARRAY['fs-buildout-v8','genre:photogrammetry','fs-m8','challenge']::text[],true,'approved',
 '[{"type":"handbook","label":"FS Reference Handbook — Photogrammetry"}]'::jsonb,false,0.02),
('fb392100-0000-0000-0000-000000000002',
 'Two lines have slopes m1 = 0.50 and m2 = 2.00. Using θ = arctan[(m2 − m1)/(1 + m1·m2)], what is the acute angle between them, in degrees?',
 'numeric_input','[]'::jsonb,'36.87',
 'θ = arctan[(2.00 − 0.50)/(1 + 0.50·2.00)] = arctan(1.5/2.0) = arctan(0.75) = 36.87°.',
 'medium','f5000003-0000-0000-0000-000000000003','FS',
 ARRAY['fs-buildout-v8','genre:angles-directions','fs-m3']::text[],true,'approved',
 '[{"type":"handbook","label":"FS Reference Handbook — Straight Line"}]'::jsonb,false,0.05),
('fb392100-0000-0000-0000-000000000003',
 'An equal-tangent vertical curve has g1 = +3.00%, g2 = −3.00% (algebraic grade change A = 6.00%) and length L = 600 ft. Using the tangent offset at the PVI, e = A·L/800, what is e, in feet?',
 'numeric_input','[]'::jsonb,'4.5',
 'e = A·L/800 = (6.00 × 600)/800 = 3600/800 = 4.50 ft. This equals the vertical distance from the PVI down to the curve (the mid-curve offset).',
 'hard','f5000005-0000-0000-0000-000000000005','FS',
 ARRAY['fs-buildout-v8','genre:vertical-curves','fs-m5','challenge']::text[],true,'approved',
 '[{"type":"handbook","label":"FS Reference Handbook — Vertical Curve Formulas"}]'::jsonb,false,0.02)
ON CONFLICT (id) DO NOTHING;
COMMIT;
