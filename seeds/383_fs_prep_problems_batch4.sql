-- seeds/383_fs_prep_problems_batch4.sql
-- SIT / FS exam-prep — fourth batch of hand-verified problems for volume +
-- variety, including current Texas-specific boundary law. Answers node-checked.

BEGIN;

INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
-- angles-directions --------------------------------------------------------
('fb383000-0000-0000-0000-000000000001',
 'The forward azimuth of a line is 75°00''. What is its back azimuth?',
 'numeric_input', '[]'::jsonb, '255',
 'Back azimuth = forward azimuth ± 180°. 75° + 180° = 255° (since the result is < 360°).',
 'easy', 'f5000003-0000-0000-0000-000000000003', 'FS',
 ARRAY['fs-buildout-v8','genre:angles-directions','fs-m3']::text[], true, 'approved',
 '[{"type":"module","id":"3","label":"Distance & Angle Measurement"}]'::jsonb, false, 0.01),

('fb383000-0000-0000-0000-000000000002',
 'Convert the bearing N 30°00'' W to an azimuth (clockwise from North).',
 'numeric_input', '[]'::jsonb, '330',
 'The bearing is in the NW quadrant, so Az = 360° − bearing = 360° − 30° = 330°.',
 'medium', 'f5000003-0000-0000-0000-000000000003', 'FS',
 ARRAY['fs-buildout-v8','genre:angles-directions','fs-m3']::text[], true, 'approved',
 '[{"type":"module","id":"3","label":"Distance & Angle Measurement"}]'::jsonb, false, 0.01),

-- distance-edm (EDM error spec) --------------------------------------------
('fb383000-0000-0000-0000-000000000003',
 'An EDM has a stated accuracy of ±(3 mm + 3 ppm). For a measured distance of 2,000 m, what is the total expected uncertainty, in millimeters?',
 'numeric_input', '[]'::jsonb, '9',
 'The ppm term = 3 ppm × 2,000 m = 3 × 2,000,000 mm ÷ 1,000,000 = 6 mm. Total = 3 mm (constant) + 6 mm = 9 mm.',
 'hard', 'f5000003-0000-0000-0000-000000000003', 'FS',
 ARRAY['fs-buildout-v8','genre:distance-edm','fs-m3','challenge']::text[], true, 'approved',
 '[{"type":"module","id":"3","label":"Distance & Angle Measurement"}]'::jsonb, false, 0.5),

-- areas-volumes (trapezoid) ------------------------------------------------
('fb383000-0000-0000-0000-000000000004',
 'A trapezoidal parcel has two parallel sides of 100.0 ft and 140.0 ft, separated by a perpendicular distance of 60.0 ft. What is its area, in square feet?',
 'numeric_input', '[]'::jsonb, '7200',
 'Trapezoid area = ½·(b1 + b2)·h = ½·(100 + 140)·60 = ½·240·60 = 7,200 sq ft.',
 'easy', 'f5000005-0000-0000-0000-000000000005', 'FS',
 ARRAY['fs-buildout-v8','genre:areas-volumes','fs-m5']::text[], true, 'approved',
 '[{"type":"module","id":"5","label":"Areas, Volumes & Curves"}]'::jsonb, false, 1),

-- measurement-error (68-95-99.7) -------------------------------------------
('fb383000-0000-0000-0000-000000000005',
 'For normally distributed random errors, approximately what percentage falls within ±2 standard deviations of the mean?',
 'multiple_choice', '["95.4%","68.3%","99.7%","90.0%"]'::jsonb,
 '95.4%',
 'The empirical (68–95–99.7) rule: about 68.3% within ±1σ, 95.4% within ±2σ, and 99.7% within ±3σ.',
 'medium', 'f5000001-0000-0000-0000-000000000001', 'FS',
 ARRAY['fs-buildout-v8','genre:measurement-error','fs-m1']::text[], true, 'approved',
 '[{"type":"module","id":"1","label":"Fundamentals of Surveying"}]'::jsonb, false, 0.01),

-- boundary-legal (Texas adverse possession) --------------------------------
('fb383000-0000-0000-0000-000000000006',
 'Under Texas law, the general "bare possession" adverse-possession statute (no color of title, no registered deed, no payment of taxes) requires how many years of continuous, adverse possession?',
 'multiple_choice', '["10 years","3 years","5 years","25 years"]'::jsonb,
 '10 years',
 'Texas has a ladder of adverse-possession statutes (Tex. Civ. Prac. & Rem. Code ch. 16): a 3-year statute (color of title), a 5-year statute (registered deed + taxes), the general 10-year statute (bare possession, capped acreage), and 25-year statutes. The general residual period for bare possession is 10 years.',
 'hard', 'f5000007-0000-0000-0000-000000000007', 'FS',
 ARRAY['fs-buildout-v8','genre:boundary-legal','fs-m7','texas','challenge']::text[], true, 'approved',
 '[{"type":"module","id":"7","label":"Boundary Law & Public Lands"}]'::jsonb, false, 0.01),

-- boundary-legal (priority of calls) ---------------------------------------
('fb383000-0000-0000-0000-000000000007',
 'In boundary retracement, when calls in a deed conflict, which class of evidence generally has the HIGHEST priority?',
 'multiple_choice', '["Natural monuments","Bearings","Distances","Area (quantity)"]'::jsonb,
 'Natural monuments',
 'The usual priority of conflicting calls is: senior rights, then written intentions, then natural monuments, then artificial monuments, then control lines/adjoiners, then courses (bearings), then distances, then area — with area (quantity) the lowest. Natural monuments outrank courses, distances, and area.',
 'medium', 'f5000007-0000-0000-0000-000000000007', 'FS',
 ARRAY['fs-buildout-v8','genre:boundary-legal','fs-m7']::text[], true, 'approved',
 '[{"type":"module","id":"7","label":"Boundary Law & Public Lands"}]'::jsonb, false, 0.01),

-- gnss-geodesy (conceptual) ------------------------------------------------
('fb383000-0000-0000-0000-000000000008',
 'In GNSS positioning, a LOWER value of PDOP (Position Dilution of Precision) indicates what about the expected position quality?',
 'multiple_choice', '["Better geometry / higher precision","Worse geometry / lower precision","No effect on precision","Fewer satellites tracked"]'::jsonb,
 'Better geometry / higher precision',
 'DOP scales the effect of ranging errors by satellite geometry. A lower PDOP means the tracked satellites are well distributed, so the same ranging error yields a smaller position error — better precision. High PDOP (satellites clustered) degrades the solution.',
 'easy', 'f5000006-0000-0000-0000-000000000006', 'FS',
 ARRAY['fs-buildout-v8','genre:gnss-geodesy','fs-m6']::text[], true, 'approved',
 '[{"type":"module","id":"6","label":"GNSS/GPS & Geodesy"}]'::jsonb, false, 0.01),

-- leveling (two-setup HI) --------------------------------------------------
('fb383000-0000-0000-0000-000000000009',
 'From a benchmark at elevation 300.00 ft, a backsight of 5.50 ft is taken, then a foresight of 2.10 ft to a turning point (TP1). From TP1 a backsight of 8.20 ft is taken, then a foresight of 4.30 ft to point B. What is the elevation of B, in ft?',
 'numeric_input', '[]'::jsonb, '307.30',
 'HI1 = 300.00 + 5.50 = 305.50; Elev(TP1) = 305.50 − 2.10 = 303.40. HI2 = 303.40 + 8.20 = 311.60; Elev(B) = 311.60 − 4.30 = 307.30 ft. (Check: ΣBS − ΣFS = 13.70 − 6.40 = 7.30 = 307.30 − 300.00.)',
 'medium', 'f5000002-0000-0000-0000-000000000002', 'FS',
 ARRAY['fs-buildout-v8','genre:leveling','fs-m2']::text[], true, 'approved',
 '[{"type":"module","id":"2","label":"Leveling"}]'::jsonb, false, 0.02),

-- photogrammetry (stereo/overlap) ------------------------------------------
('fb383000-0000-0000-0000-00000000000a',
 'For stereoscopic coverage in aerial mapping, what is the typical MINIMUM forward (end) overlap between successive photographs along a flight line?',
 'multiple_choice', '["60%","20%","90%","10%"]'::jsonb,
 '60%',
 'Standard aerial mapping uses about 60% forward (end) overlap so every ground point appears on at least two successive photos for stereo viewing, with roughly 30% side overlap between adjacent flight lines.',
 'medium', 'f5000008-0000-0000-0000-000000000008', 'FS',
 ARRAY['fs-buildout-v8','genre:photogrammetry','fs-m8']::text[], true, 'approved',
 '[{"type":"module","id":"8","label":"Photogrammetry, GIS and Construction"}]'::jsonb, false, 0.01)

ON CONFLICT (id) DO NOTHING;

COMMIT;
