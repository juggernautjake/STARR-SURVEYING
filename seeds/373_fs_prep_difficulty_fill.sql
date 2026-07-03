-- seeds/373_fs_prep_difficulty_fill.sql
-- SIT / FS exam-prep — fill difficulty gaps so genres span multiple levels.
-- All answers hand-verified against a computation. Continues seed 369/370/372.

BEGIN;

INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
-- measurement-error (hard) -------------------------------------------------
('fb373000-0000-0000-0000-000000000001',
 'Three distances are measured with independent standard errors of ±0.02, ±0.03, and ±0.04 ft. If the distances are added, what is the standard error of the sum (ft)?',
 'numeric_input', '[]'::jsonb, '0.05',
 'Errors of a sum/difference combine by the root-sum-of-squares (RSS): E = √(0.02² + 0.03² + 0.04²) = √(0.0004 + 0.0009 + 0.0016) = √0.0029 = 0.0539 ≈ 0.05 ft.',
 'hard', 'f5000001-0000-0000-0000-000000000001', 'FS',
 ARRAY['fs-buildout-v5','genre:measurement-error','fs-m1','challenge']::text[], true, 'approved',
 '[{"type":"module","id":"1","label":"Fundamentals of Surveying"}]'::jsonb, false, 0.005),

-- measurement-error (easy) -------------------------------------------------
('fb373000-0000-0000-0000-000000000002',
 'A distance of 400.00 ft is measured with an estimated error of ±0.02 ft. What is the relative precision, expressed as 1 : ? (whole-number denominator)?',
 'numeric_input', '[]'::jsonb, '20000',
 'Relative precision = error / distance = 0.02 / 400 = 1/20,000, i.e., 1:20,000.',
 'easy', 'f5000001-0000-0000-0000-000000000001', 'FS',
 ARRAY['fs-buildout-v5','genre:measurement-error','fs-m1']::text[], true, 'approved',
 '[{"type":"module","id":"1","label":"Fundamentals of Surveying"}]'::jsonb, false, 5),

-- angles-directions (hard) -------------------------------------------------
('fb373000-0000-0000-0000-000000000003',
 'The azimuth of line AB is 60°00''. At B the survey turns a deflection angle of 35°00'' to the LEFT. What is the azimuth of line BC?',
 'numeric_input', '[]'::jsonb, '25',
 'A left deflection subtracts from the forward azimuth: Az(BC) = Az(AB) − deflection = 60°00'' − 35°00'' = 25°00''.',
 'hard', 'f5000004-0000-0000-0000-000000000004', 'FS',
 ARRAY['fs-buildout-v5','genre:angles-directions','fs-m4','challenge']::text[], true, 'approved',
 '[{"type":"module","id":"4","label":"Traversing & COGO"}]'::jsonb, false, 0.02),

-- horizontal-curves (easy) -------------------------------------------------
('fb373000-0000-0000-0000-000000000004',
 'A circular curve has a radius of 1,000.00 ft. Using the arc definition, what is the degree of curve (decimal degrees)?',
 'numeric_input', '[]'::jsonb, '5.73',
 'Arc-definition degree of curve D = 5729.58 / R = 5729.58 / 1000 = 5.73° (the central angle subtended by a 100-ft arc).',
 'easy', 'f5000005-0000-0000-0000-000000000005', 'FS',
 ARRAY['fs-buildout-v5','genre:horizontal-curves','fs-m5']::text[], true, 'approved',
 '[{"type":"module","id":"5","label":"Areas, Volumes & Curves"}]'::jsonb, false, 0.02),

-- horizontal-curves (hard) -------------------------------------------------
('fb373000-0000-0000-0000-000000000005',
 'A circular curve has R = 500.00 ft and central angle Δ = 40°00''. What is the length of the long chord (ft)?',
 'numeric_input', '[]'::jsonb, '342.02',
 'Long chord LC = 2·R·sin(Δ/2) = 2 × 500 × sin(20°) = 1000 × 0.342020 = 342.02 ft.',
 'hard', 'f5000005-0000-0000-0000-000000000005', 'FS',
 ARRAY['fs-buildout-v5','genre:horizontal-curves','fs-m5','challenge']::text[], true, 'approved',
 '[{"type":"module","id":"5","label":"Areas, Volumes & Curves"}]'::jsonb, false, 0.05),

-- vertical-curves (medium) -------------------------------------------------
('fb373000-0000-0000-0000-000000000006',
 'An equal-tangent vertical curve has BVC elevation 850.00 ft, g1 = +3.00%, g2 = −1.00%, and length L = 600.00 ft. What is the curve elevation 300.00 ft past the BVC (ft)?',
 'numeric_input', '[]'::jsonb, '856.00',
 'r = (g2 − g1)/L = (−0.01 − 0.03)/600 = −6.667e−5 per ft. Elev = BVC + g1·x + (r/2)·x² = 850 + 0.03(300) + ½(−6.667e−5)(300²) = 850 + 9.00 − 3.00 = 856.00 ft.',
 'medium', 'f5000005-0000-0000-0000-000000000005', 'FS',
 ARRAY['fs-buildout-v5','genre:vertical-curves','fs-m5']::text[], true, 'approved',
 '[{"type":"module","id":"5","label":"Areas, Volumes & Curves"}]'::jsonb, false, 0.02),

-- distance-edm (hard: sag) -------------------------------------------------
('fb373000-0000-0000-0000-000000000007',
 'A steel tape weighs 0.02 lb/ft and is used in an unsupported span of 100.0 ft under 15.0 lb of tension. What is the sag correction (ft)? Give the signed value. Use Cs = −w²L³/(24P²).',
 'numeric_input', '[]'::jsonb, '-0.074',
 'Cs = −w²L³/(24P²) = −(0.02² × 100³)/(24 × 15²) = −(0.0004 × 1,000,000)/(24 × 225) = −400/5400 = −0.0741 ≈ −0.074 ft (sag always shortens the true horizontal distance, so it is negative).',
 'hard', 'f5000003-0000-0000-0000-000000000003', 'FS',
 ARRAY['fs-buildout-v5','genre:distance-edm','fs-m3','challenge']::text[], true, 'approved',
 '[{"type":"module","id":"3","label":"Distance & Angle Measurement"}]'::jsonb, false, 0.005)

ON CONFLICT (id) DO NOTHING;

COMMIT;
