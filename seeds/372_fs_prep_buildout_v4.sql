-- seeds/372_fs_prep_buildout_v4.sql
-- SIT / FS exam-prep buildout v4 (2026-07-02) — GNSS height figure (module 6)
-- + a few more hand-verified problems to round out thin genres.

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

-- Module 6 — GNSS/GPS & Geodesy: ellipsoidal vs orthometric height
SELECT fs_add_figure(6, 'concepts',
  '![GNSS gives ellipsoidal height h (above the reference ellipsoid). Orthometric height H (the elevation used for design and drainage) is measured above the geoid, and the geoid separation N relates them: h = H + N, so H = h − N.](/lessons/fs/diagrams/gnss-heights.svg "Original diagram — Starr SIT Prep")');

INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
-- GNSS / GEODESY -----------------------------------------------------------
('fb372000-0000-0000-0000-000000000001',
 'A grid distance is 2,500.00 ft and the combined (grid) factor for the area is 0.99990. What is the corresponding ground distance (ft)?',
 'numeric_input', '[]'::jsonb, '2500.25',
 'Ground = Grid ÷ combined factor = 2500.00 ÷ 0.99990 = 2500.25 ft. (Divide grid by the combined factor to get ground; multiply ground by it to get grid.)',
 'hard', 'f5000006-0000-0000-0000-000000000006', 'FS',
 ARRAY['fs-buildout-v4','genre:gnss-geodesy','fs-m6','challenge']::text[], true, 'approved',
 '[{"type":"module","id":"6","label":"GNSS/GPS & Geodesy"}]'::jsonb, false, 0.05),

('fb372000-0000-0000-0000-000000000002',
 'At a station the GNSS-derived ellipsoidal height is h = 300.00 ft and a geoid model gives a geoid separation N = −25.00 ft. What is the orthometric height H (ft)?',
 'numeric_input', '[]'::jsonb, '325.00',
 'H = h − N = 300.00 − (−25.00) = 325.00 ft.',
 'easy', 'f5000006-0000-0000-0000-000000000006', 'FS',
 ARRAY['fs-buildout-v4','genre:gnss-geodesy','fs-m6']::text[], true, 'approved',
 '[{"type":"module","id":"6","label":"GNSS/GPS & Geodesy"}]'::jsonb, false, 0.02),

-- LEVELING challenge (circuit check) ---------------------------------------
('fb372000-0000-0000-0000-000000000003',
 'A differential leveling circuit starts on a benchmark of elevation 500.00 ft. The sum of all backsights is 12.45 ft and the sum of all foresights is 9.30 ft. What should the ending elevation be (ft)?',
 'numeric_input', '[]'::jsonb, '503.15',
 'Ending elevation = starting elevation + (ΣBS − ΣFS) = 500.00 + (12.45 − 9.30) = 500.00 + 3.15 = 503.15 ft. (This is the standard arithmetic check on a level circuit.)',
 'medium', 'f5000002-0000-0000-0000-000000000002', 'FS',
 ARRAY['fs-buildout-v4','genre:leveling','fs-m2']::text[], true, 'approved',
 '[{"type":"module","id":"2","label":"Leveling"}]'::jsonb, false, 0.01),

-- DISTANCE: stadia ---------------------------------------------------------
('fb372000-0000-0000-0000-000000000004',
 'Using a stadia instrument with a stadia interval factor K = 100 and a rod intercept of 3.20 ft on a horizontal sight, what is the horizontal distance (ft)?',
 'numeric_input', '[]'::jsonb, '320',
 'For a horizontal stadia sight, distance = K × (rod intercept) = 100 × 3.20 = 320 ft. (The instrument constant C is negligible for modern internal-focusing instruments.)',
 'easy', 'f5000003-0000-0000-0000-000000000003', 'FS',
 ARRAY['fs-buildout-v4','genre:distance-edm','fs-m3']::text[], true, 'approved',
 '[{"type":"module","id":"3","label":"Distance & Angle Measurement"}]'::jsonb, false, 0.5)

ON CONFLICT (id) DO NOTHING;

DROP FUNCTION IF EXISTS fs_add_figure(int, text, text);

COMMIT;
