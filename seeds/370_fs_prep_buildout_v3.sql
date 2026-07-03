-- seeds/370_fs_prep_buildout_v3.sql
-- SIT / FS exam-prep buildout v3 (2026-07-02) — more lesson figures + more
-- genre coverage (photogrammetry, boundary-legal incl. Texas varas/PLSS) and a
-- challenge (very_hard) tier. Continues the taxonomy from seed 369.

BEGIN;

CREATE OR REPLACE FUNCTION fs_add_figure(p_mod int, p_type text, p_fig text)
RETURNS void AS $fn$
DECLARE arr jsonb; i int; el jsonb;
BEGIN
  SELECT content_sections INTO arr FROM fs_study_modules WHERE module_number = p_mod;
  IF arr IS NULL THEN RETURN; END IF;
  FOR i IN 0 .. jsonb_array_length(arr) - 1 LOOP
    el := arr -> i;
    IF el ->> 'type' = p_type THEN
      IF position(p_fig IN coalesce(el ->> 'content', '')) = 0 THEN
        arr := jsonb_set(arr, ARRAY[i::text, 'content'],
                 to_jsonb((el ->> 'content') || E'\n\n' || p_fig));
      END IF;
    END IF;
  END LOOP;
  UPDATE fs_study_modules SET content_sections = arr WHERE module_number = p_mod;
END;
$fn$ LANGUAGE plpgsql;

-- Module 5 — Areas/Volumes/Curves: coordinate area + vertical curve
SELECT fs_add_figure(5, 'concepts',
  '![Area by the coordinate (shoelace) method: list station eastings/northings in order, cross-multiply, and take half the absolute value. 1 acre = 43,560 sq ft.](/lessons/fs/diagrams/coordinate-area.svg "Original diagram — Starr SIT Prep")');
SELECT fs_add_figure(5, 'concepts',
  '![Equal-tangent vertical curve (crest): BVC, PVI, EVC, entering grade g1 and exiting grade g2, length L, and the high point where the grade becomes zero at x = −g1·L/(g2−g1) from the BVC.](/lessons/fs/diagrams/vertical-curve.svg "Original diagram — Starr SIT Prep")');

-- Module 7 — Boundary Law & Public Lands: PLSS aliquot subdivision
SELECT fs_add_figure(7, 'concepts',
  '![PLSS aliquot parts: a section is 640 acres (1 mile square). A quarter section is 160 acres and a quarter-quarter is 40 acres. Aliquot descriptions read right-to-left (e.g., the NW¼ of the NE¼ = 40 ac).](/lessons/fs/diagrams/plss-section.svg "Original diagram — Starr SIT Prep")');

-- Module 8 — Photogrammetry & Construction: photo scale
SELECT fs_add_figure(8, 'concepts',
  '![Vertical aerial photo scale S = f / H′, where f is the camera focal length and H′ is the flying height above the ground being imaged. Ground distance = photo distance ÷ S.](/lessons/fs/diagrams/photo-scale.svg "Original diagram — Starr SIT Prep")');

-- ─── more problems ────────────────────────────────────────────────────────
INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
-- PHOTOGRAMMETRY -----------------------------------------------------------
('fb370000-0000-0000-0000-000000000001',
 'A vertical aerial photograph is taken with a 6-inch focal-length camera from a flying height of 6,000 ft above the ground. What is the scale denominator (i.e., 1 : ?)?',
 'numeric_input', '[]'::jsonb, '12000',
 'S = f/H = (6 in ÷ 12 = 0.5 ft) / 6000 ft = 1/12000, so the scale is 1:12,000.',
 'medium', 'f5000008-0000-0000-0000-000000000008', 'FS',
 ARRAY['fs-buildout-v3','genre:photogrammetry','fs-m8']::text[], true, 'approved',
 '[{"type":"module","id":"8","label":"Photogrammetry & Construction"}]'::jsonb, false, 1),

('fb370000-0000-0000-0000-000000000002',
 'On a 1:12,000 vertical photograph, a road segment measures 4.20 inches. What is its ground length (ft)?',
 'numeric_input', '[]'::jsonb, '4200',
 'Ground length = photo length × scale = 4.20 in × 12,000 = 50,400 in = 50,400 ÷ 12 = 4,200 ft.',
 'easy', 'f5000008-0000-0000-0000-000000000008', 'FS',
 ARRAY['fs-buildout-v3','genre:photogrammetry','fs-m8']::text[], true, 'approved',
 '[{"type":"module","id":"8","label":"Photogrammetry & Construction"}]'::jsonb, false, 1),

-- BOUNDARY / LEGAL (incl. Texas units) -------------------------------------
('fb370000-0000-0000-0000-000000000003',
 'Convert 10.00 chains (Gunter''s chain) to feet.',
 'numeric_input', '[]'::jsonb, '660',
 'One Gunter''s chain = 66 ft (= 4 rods = 100 links). 10.00 × 66 = 660 ft.',
 'easy', 'f5000007-0000-0000-0000-000000000007', 'FS',
 ARRAY['fs-buildout-v3','genre:boundary-legal','fs-m7']::text[], true, 'approved',
 '[{"type":"module","id":"7","label":"Boundary Law & Public Lands"}]'::jsonb, false, 0.5),

('fb370000-0000-0000-0000-000000000004',
 'A Texas land grant calls a line of 100.0 varas. Using the Texas vara of 33 1/3 inches, what is the length in feet?',
 'numeric_input', '[]'::jsonb, '277.78',
 'The Texas vara = 33 1/3 in = 2.77778 ft. 100.0 varas × 2.77778 = 277.78 ft. (The vara is the fundamental unit of Spanish/Mexican-era Texas land grants and still appears in many Texas deeds.)',
 'medium', 'f5000007-0000-0000-0000-000000000007', 'FS',
 ARRAY['fs-buildout-v3','genre:boundary-legal','fs-m7','texas']::text[], true, 'approved',
 '[{"type":"module","id":"7","label":"Boundary Law & Public Lands"}]'::jsonb, false, 0.05),

('fb370000-0000-0000-0000-000000000005',
 'In the U.S. Public Land Survey System, how many acres are in the NW 1/4 of the NE 1/4 of a standard section?',
 'multiple_choice', '["40 acres","80 acres","160 acres","10 acres"]'::jsonb,
 '40 acres',
 'A standard section is 640 acres. A quarter-quarter (quarter of a quarter) = 640 ÷ 16 = 40 acres.',
 'easy', 'f5000007-0000-0000-0000-000000000007', 'FS',
 ARRAY['fs-buildout-v3','genre:boundary-legal','fs-m7']::text[], true, 'approved',
 '[{"type":"module","id":"7","label":"Boundary Law & Public Lands"}]'::jsonb, false, 0.01),

('fb370000-0000-0000-0000-000000000006',
 'How many acres are in the S 1/2 of the SW 1/4 of a standard section?',
 'multiple_choice', '["80 acres","40 acres","160 acres","20 acres"]'::jsonb,
 '80 acres',
 'The SW 1/4 = 160 acres. Its S 1/2 = 160 ÷ 2 = 80 acres.',
 'medium', 'f5000007-0000-0000-0000-000000000007', 'FS',
 ARRAY['fs-buildout-v3','genre:boundary-legal','fs-m7']::text[], true, 'approved',
 '[{"type":"module","id":"7","label":"Boundary Law & Public Lands"}]'::jsonb, false, 0.01),

-- AREAS: unit conversion ---------------------------------------------------
('fb370000-0000-0000-0000-000000000007',
 'A parcel contains 60,000 square feet. What is its area in acres (to two decimals)?',
 'numeric_input', '[]'::jsonb, '1.38',
 'Acres = square feet ÷ 43,560 = 60,000 ÷ 43,560 = 1.3774 ≈ 1.38 acres.',
 'medium', 'f5000005-0000-0000-0000-000000000005', 'FS',
 ARRAY['fs-buildout-v3','genre:areas-volumes','fs-m5']::text[], true, 'approved',
 '[{"type":"module","id":"5","label":"Areas, Volumes & Curves"}]'::jsonb, false, 0.01),

-- ANGLES: deflection -------------------------------------------------------
('fb370000-0000-0000-0000-000000000008',
 'The azimuth of line AB is 45°00'' and the azimuth of the next line BC is 100°00''. What is the deflection angle at B?',
 'multiple_choice', '["55° right","55° left","145° right","35° right"]'::jsonb,
 '55° right',
 'The deflection angle is the change in direction from the extension of the previous line: 100° − 45° = 55°, and because the azimuth increases (turns clockwise), it is 55° to the right (R).',
 'medium', 'f5000004-0000-0000-0000-000000000004', 'FS',
 ARRAY['fs-buildout-v3','genre:angles-directions','fs-m4']::text[], true, 'approved',
 '[{"type":"module","id":"4","label":"Traversing & COGO"}]'::jsonb, false, 0.01),

-- TRAVERSE: challenge (compass rule + precision) ---------------------------
('fb370000-0000-0000-0000-000000000009',
 'A closed traverse has a total departure misclosure of +0.12 ft over a perimeter of 1,800 ft. Using the Compass (Bowditch) Rule, what is the departure correction (ft) applied to a 450-ft leg? Give the signed value.',
 'numeric_input', '[]'::jsonb, '-0.03',
 'Compass Rule: correction to a leg''s departure = −(total departure error) × (leg length ÷ perimeter) = −(0.12) × (450 ÷ 1800) = −0.12 × 0.25 = −0.03 ft.',
 'hard', 'f5000004-0000-0000-0000-000000000004', 'FS',
 ARRAY['fs-buildout-v3','genre:traverse-cogo','fs-m4','challenge']::text[], true, 'approved',
 '[{"type":"module","id":"4","label":"Traversing & COGO"}]'::jsonb, false, 0.005),

('fb370000-0000-0000-0000-00000000000a',
 'A closed traverse has a perimeter of 2,500.0 ft and a linear misclosure of 0.10 ft. What is the precision expressed as 1 : ? (round the denominator to the nearest whole number)?',
 'numeric_input', '[]'::jsonb, '25000',
 'Precision = linear misclosure / perimeter = 0.10 / 2500 = 1/25,000, i.e., 1:25,000.',
 'hard', 'f5000004-0000-0000-0000-000000000004', 'FS',
 ARRAY['fs-buildout-v3','genre:traverse-cogo','fs-m4','challenge']::text[], true, 'approved',
 '[{"type":"module","id":"4","label":"Traversing & COGO"}]'::jsonb, false, 5)

ON CONFLICT (id) DO NOTHING;

DROP FUNCTION IF EXISTS fs_add_figure(int, text, text);

COMMIT;
