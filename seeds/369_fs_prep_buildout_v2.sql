-- seeds/369_fs_prep_buildout_v2.sql
-- SIT / FS exam-prep buildout v2 (2026-07-02)
--
-- 1) Injects authored SVG diagrams into the study modules' lesson content
--    (rendered via the ![caption](url "credit") markdown the SIT module page
--    now supports). Every figure carries a caption + credit reference.
-- 2) Adds a batch of hand-verified premade problems to question_bank across a
--    clean GENRE x DIFFICULTY taxonomy, each with an explanation, study
--    reference, genre + difficulty tags, and exam_category 'FS'.
--
-- GENRE x DIFFICULTY taxonomy (tags: genre:<slug> + difficulty column):
--   Genres: measurement-error, distance-edm, angles-directions, leveling,
--           traverse-cogo, areas-volumes, horizontal-curves, vertical-curves,
--           gnss-geodesy, photogrammetry, boundary-legal.
--   Difficulty levels per genre (question_bank.difficulty enum):
--           easy = Foundational, medium = Standard(exam), hard = Challenge.
-- Texas note: the Texas SIT designation is earned by passing the NCEES
-- Fundamentals of Surveying (FS) exam; content aligns to the current NCEES FS
-- specification and standard US-survey-foot practice used in Texas.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- Part 1 — inject lesson figures (idempotent: skips if the URL is already in
-- the section). Appends the figure markdown to the named content section.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fs_add_figure(p_mod int, p_type text, p_fig text)
RETURNS void AS $fn$
DECLARE
  arr jsonb;
  i   int;
  el  jsonb;
BEGIN
  SELECT content_sections INTO arr FROM fs_study_modules WHERE module_number = p_mod;
  IF arr IS NULL THEN RETURN; END IF;
  FOR i IN 0 .. jsonb_array_length(arr) - 1 LOOP
    el := arr -> i;
    IF el ->> 'type' = p_type THEN
      IF position(p_fig IN coalesce(el ->> 'content', '')) = 0 THEN
        arr := jsonb_set(
          arr,
          ARRAY[i::text, 'content'],
          to_jsonb((el ->> 'content') || E'\n\n' || p_fig)
        );
      END IF;
    END IF;
  END LOOP;
  UPDATE fs_study_modules SET content_sections = arr WHERE module_number = p_mod;
END;
$fn$ LANGUAGE plpgsql;

-- Module 2 — Leveling
SELECT fs_add_figure(2, 'concepts',
  '![Differential leveling: a backsight (BS) on a benchmark establishes the Height of Instrument (HI = Elev + BS); a foresight (FS) on the turning point gives its elevation (Elev = HI − FS).](/lessons/fs/diagrams/differential-leveling.svg "Original diagram — Starr SIT Prep")');

-- Module 3 — Distance & Angle Measurement (bearings/azimuths)
SELECT fs_add_figure(3, 'concepts',
  '![Bearings versus azimuths. Azimuths run clockwise from North (0°–360°); bearings are measured ≤ 90° from N or S toward E or W. The quadrant fixes the conversion.](/lessons/fs/diagrams/bearings-azimuths.svg "Original diagram — Starr SIT Prep")');

-- Module 4 — Traversing & COGO (latitude/departure)
SELECT fs_add_figure(4, 'concepts',
  '![Latitude and departure are the N–S and E–W components of a traverse leg: Latitude = D·cos(Az), Departure = D·sin(Az). A closed traverse must sum to ΣLat = 0 and ΣDep = 0.](/lessons/fs/diagrams/latitude-departure.svg "Original diagram — Starr SIT Prep")');

-- Module 5 — Areas, Volumes & Curves (horizontal curve)
SELECT fs_add_figure(5, 'concepts',
  '![Simple circular curve elements: PC, PI, PT, radius R, tangent T = R·tan(Δ/2), arc length L = R·Δ·π/180, external E and middle ordinate M.](/lessons/fs/diagrams/horizontal-curve.svg "Original diagram — Starr SIT Prep")');

-- ─────────────────────────────────────────────────────────────────────────
-- Part 2 — premade problems (hand-verified). exam_category 'FS', published,
-- approved. Tags encode genre + module + buildout batch. Difficulty column
-- carries the per-genre level (easy/medium/hard).
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
-- ANGLES & DIRECTIONS ------------------------------------------------------
('fb369000-0000-0000-0000-000000000001',
 'Convert the bearing S 32°15'' E to an azimuth (measured clockwise from North).',
 'multiple_choice', '["147°45''","212°15''","32°15''","327°45''"]'::jsonb,
 '147°45''',
 'The bearing is in the SE quadrant, so Az = 180° − bearing = 180°00'' − 32°15'' = 147°45''.',
 'easy', 'f5000003-0000-0000-0000-000000000003', 'FS',
 ARRAY['fs-buildout-v2','genre:angles-directions','fs-m3']::text[], true, 'approved',
 '[{"type":"module","id":"3","label":"Distance & Angle Measurement"}]'::jsonb, false, 0.01),

('fb369000-0000-0000-0000-000000000002',
 'A line has an azimuth of 205°30''. Express its bearing in quadrant form.',
 'multiple_choice', '["S 25°30'' W","N 25°30'' E","S 25°30'' E","N 25°30'' W"]'::jsonb,
 'S 25°30'' W',
 'Azimuth 205°30'' falls between 180° and 270° (SW quadrant). Bearing angle = Az − 180° = 25°30'', so S 25°30'' W.',
 'medium', 'f5000003-0000-0000-0000-000000000003', 'FS',
 ARRAY['fs-buildout-v2','genre:angles-directions','fs-m3']::text[], true, 'approved',
 '[{"type":"module","id":"3","label":"Distance & Angle Measurement"}]'::jsonb, false, 0.01),

-- LEVELING -----------------------------------------------------------------
('fb369000-0000-0000-0000-000000000003',
 'A benchmark has elevation 512.40 ft. The backsight rod reading is 4.28 ft. What is the Height of Instrument (HI)?',
 'numeric_input', '[]'::jsonb, '516.68',
 'HI = Elevation(BM) + BS = 512.40 + 4.28 = 516.68 ft.',
 'easy', 'f5000002-0000-0000-0000-000000000002', 'FS',
 ARRAY['fs-buildout-v2','genre:leveling','fs-m2']::text[], true, 'approved',
 '[{"type":"module","id":"2","label":"Leveling"}]'::jsonb, false, 0.01),

('fb369000-0000-0000-0000-000000000004',
 'The Height of Instrument is 516.68 ft. A foresight of 7.15 ft is taken on a turning point. What is the turning point elevation (ft)?',
 'numeric_input', '[]'::jsonb, '509.53',
 'Elev(TP) = HI − FS = 516.68 − 7.15 = 509.53 ft.',
 'easy', 'f5000002-0000-0000-0000-000000000002', 'FS',
 ARRAY['fs-buildout-v2','genre:leveling','fs-m2']::text[], true, 'approved',
 '[{"type":"module","id":"2","label":"Leveling"}]'::jsonb, false, 0.01),

('fb369000-0000-0000-0000-000000000005',
 'Compute the combined curvature-and-refraction correction for a sight distance of 2,500 ft. Use C_R = 0.0206·F² with F in thousands of feet. Answer in feet.',
 'numeric_input', '[]'::jsonb, '0.13',
 'F = 2.5 (thousands of feet). C_R = 0.0206 × 2.5² = 0.0206 × 6.25 = 0.1288 ≈ 0.13 ft.',
 'medium', 'f5000002-0000-0000-0000-000000000002', 'FS',
 ARRAY['fs-buildout-v2','genre:leveling','fs-m2']::text[], true, 'approved',
 '[{"type":"module","id":"2","label":"Leveling"}]'::jsonb, false, 0.02),

-- DISTANCE / EDM / TAPING --------------------------------------------------
('fb369000-0000-0000-0000-000000000006',
 'A 200.00 ft distance is measured with a steel tape at a field temperature of 41°F. The tape is standardized at 68°F and α = 0.00000645/°F. What is the temperature correction (ft)? Give the signed value.',
 'numeric_input', '[]'::jsonb, '-0.035',
 'Ct = α·L·(T − T0) = 0.00000645 × 200 × (41 − 68) = 0.00000645 × 200 × (−27) = −0.0348 ≈ −0.035 ft (the cold tape is short, so the correction is negative).',
 'medium', 'f5000003-0000-0000-0000-000000000003', 'FS',
 ARRAY['fs-buildout-v2','genre:distance-edm','fs-m3']::text[], true, 'approved',
 '[{"type":"module","id":"3","label":"Distance & Angle Measurement"}]'::jsonb, false, 0.005),

('fb369000-0000-0000-0000-000000000007',
 'A slope distance of 150.00 ft is measured along a line with a vertical angle of 4°00''. What is the horizontal distance (ft)?',
 'numeric_input', '[]'::jsonb, '149.63',
 'H = S·cos(vertical angle) = 150.00 × cos(4°) = 150.00 × 0.997564 = 149.63 ft.',
 'easy', 'f5000003-0000-0000-0000-000000000003', 'FS',
 ARRAY['fs-buildout-v2','genre:distance-edm','fs-m3']::text[], true, 'approved',
 '[{"type":"module","id":"3","label":"Distance & Angle Measurement"}]'::jsonb, false, 0.02),

-- TRAVERSE & COGO ----------------------------------------------------------
('fb369000-0000-0000-0000-000000000008',
 'A traverse leg has azimuth 120°00'' and length 400.00 ft. What is its latitude (ft)? Give the signed value.',
 'numeric_input', '[]'::jsonb, '-200.00',
 'Latitude = D·cos(Az) = 400.00 × cos(120°) = 400.00 × (−0.5) = −200.00 ft (southerly, hence negative).',
 'medium', 'f5000004-0000-0000-0000-000000000004', 'FS',
 ARRAY['fs-buildout-v2','genre:traverse-cogo','fs-m4']::text[], true, 'approved',
 '[{"type":"module","id":"4","label":"Traversing & COGO"}]'::jsonb, false, 0.02),

('fb369000-0000-0000-0000-000000000009',
 'For the same leg (azimuth 120°00'', length 400.00 ft), what is the departure (ft)?',
 'numeric_input', '[]'::jsonb, '346.41',
 'Departure = D·sin(Az) = 400.00 × sin(120°) = 400.00 × 0.866025 = 346.41 ft (easterly, positive).',
 'medium', 'f5000004-0000-0000-0000-000000000004', 'FS',
 ARRAY['fs-buildout-v2','genre:traverse-cogo','fs-m4']::text[], true, 'approved',
 '[{"type":"module","id":"4","label":"Traversing & COGO"}]'::jsonb, false, 0.02),

('fb369000-0000-0000-0000-00000000000a',
 'Point A is (N 1000.00, E 5000.00) and point B is (N 1300.00, E 5400.00). What is the horizontal distance A→B (ft)?',
 'numeric_input', '[]'::jsonb, '500.00',
 'ΔN = 1300 − 1000 = 300; ΔE = 5400 − 5000 = 400. Distance = √(ΔN² + ΔE²) = √(300² + 400²) = √250000 = 500.00 ft.',
 'medium', 'f5000004-0000-0000-0000-000000000004', 'FS',
 ARRAY['fs-buildout-v2','genre:traverse-cogo','fs-m4']::text[], true, 'approved',
 '[{"type":"module","id":"4","label":"Traversing & COGO"}]'::jsonb, false, 0.02),

('fb369000-0000-0000-0000-00000000000b',
 'What is the theoretical sum of the interior angles of a closed six-sided (hexagonal) traverse?',
 'multiple_choice', '["720°","540°","900°","1080°"]'::jsonb,
 '720°',
 'Sum of interior angles = (n − 2) × 180° = (6 − 2) × 180° = 4 × 180° = 720°.',
 'easy', 'f5000004-0000-0000-0000-000000000004', 'FS',
 ARRAY['fs-buildout-v2','genre:traverse-cogo','fs-m4']::text[], true, 'approved',
 '[{"type":"module","id":"4","label":"Traversing & COGO"}]'::jsonb, false, 0.01),

-- AREAS & VOLUMES ----------------------------------------------------------
('fb369000-0000-0000-0000-00000000000c',
 'A triangular parcel has corners A(E 0.00, N 0.00), B(E 400.00, N 0.00), C(E 400.00, N 300.00). Using the coordinate (shoelace) method, what is its area in square feet?',
 'numeric_input', '[]'::jsonb, '60000',
 'Area = ½·|xA(yB − yC) + xB(yC − yA) + xC(yA − yB)| = ½·|0(0−300) + 400(300−0) + 400(0−0)| = ½·|120000| = 60,000 sq ft (≈ 1.377 acres).',
 'hard', 'f5000005-0000-0000-0000-000000000005', 'FS',
 ARRAY['fs-buildout-v2','genre:areas-volumes','fs-m5']::text[], true, 'approved',
 '[{"type":"module","id":"5","label":"Areas, Volumes & Curves"}]'::jsonb, false, 1),

-- HORIZONTAL CURVES --------------------------------------------------------
('fb369000-0000-0000-0000-00000000000d',
 'A circular curve has radius R = 500.00 ft and central angle Δ = 40°00''. What is the tangent distance T (ft)?',
 'numeric_input', '[]'::jsonb, '181.99',
 'T = R·tan(Δ/2) = 500 × tan(20°) = 500 × 0.363970 = 181.99 ft.',
 'medium', 'f5000005-0000-0000-0000-000000000005', 'FS',
 ARRAY['fs-buildout-v2','genre:horizontal-curves','fs-m5']::text[], true, 'approved',
 '[{"type":"module","id":"5","label":"Areas, Volumes & Curves"}]'::jsonb, false, 0.05),

('fb369000-0000-0000-0000-00000000000e',
 'For the same curve (R = 500.00 ft, Δ = 40°00''), what is the arc length L (ft)?',
 'numeric_input', '[]'::jsonb, '349.07',
 'L = R·Δ·π/180 = 500 × 40 × 0.0174533 = 349.07 ft.',
 'medium', 'f5000005-0000-0000-0000-000000000005', 'FS',
 ARRAY['fs-buildout-v2','genre:horizontal-curves','fs-m5']::text[], true, 'approved',
 '[{"type":"module","id":"5","label":"Areas, Volumes & Curves"}]'::jsonb, false, 0.05),

-- VERTICAL CURVES ----------------------------------------------------------
('fb369000-0000-0000-0000-00000000000f',
 'An equal-tangent vertical curve has g1 = +3.00%, g2 = −2.00%, and length L = 400.00 ft. How far (ft) from the BVC does the high point occur?',
 'numeric_input', '[]'::jsonb, '240.00',
 'x = −g1·L/(g2 − g1) = −(3)(400)/(−2 − 3) = −1200/−5 = 240.00 ft from the BVC (a crest curve, so the high point is where the grade becomes zero).',
 'hard', 'f5000005-0000-0000-0000-000000000005', 'FS',
 ARRAY['fs-buildout-v2','genre:vertical-curves','fs-m5']::text[], true, 'approved',
 '[{"type":"module","id":"5","label":"Areas, Volumes & Curves"}]'::jsonb, false, 0.1),

-- MEASUREMENT & ERROR ------------------------------------------------------
('fb369000-0000-0000-0000-000000000010',
 'Four independent measurements of a distance are 100.02, 100.05, 100.03, and 100.06 ft. What is the most probable value (ft)?',
 'numeric_input', '[]'::jsonb, '100.04',
 'The most probable value of equally-weighted observations is the arithmetic mean: (100.02 + 100.05 + 100.03 + 100.06)/4 = 400.16/4 = 100.04 ft.',
 'easy', 'f5000001-0000-0000-0000-000000000001', 'FS',
 ARRAY['fs-buildout-v2','genre:measurement-error','fs-m1']::text[], true, 'approved',
 '[{"type":"module","id":"1","label":"Fundamentals of Surveying"}]'::jsonb, false, 0.01),

('fb369000-0000-0000-0000-000000000011',
 'A set of observations has a standard deviation of 0.06 ft based on n = 9 observations. What is the standard error of the mean (ft)?',
 'numeric_input', '[]'::jsonb, '0.02',
 'σ_m = σ/√n = 0.06/√9 = 0.06/3 = 0.02 ft.',
 'medium', 'f5000001-0000-0000-0000-000000000001', 'FS',
 ARRAY['fs-buildout-v2','genre:measurement-error','fs-m1']::text[], true, 'approved',
 '[{"type":"module","id":"1","label":"Fundamentals of Surveying"}]'::jsonb, false, 0.005),

-- GNSS / GEODESY -----------------------------------------------------------
('fb369000-0000-0000-0000-000000000012',
 'At a GNSS station the ellipsoidal height is h = 250.00 ft and the geoid separation is N = −27.50 ft. What is the orthometric height H (ft)?',
 'numeric_input', '[]'::jsonb, '277.50',
 'H = h − N = 250.00 − (−27.50) = 277.50 ft. (Orthometric height is height above the geoid; the geoid separation is subtracted.)',
 'medium', 'f5000006-0000-0000-0000-000000000006', 'FS',
 ARRAY['fs-buildout-v2','genre:gnss-geodesy','fs-m6']::text[], true, 'approved',
 '[{"type":"module","id":"6","label":"GNSS/GPS & Geodesy"}]'::jsonb, false, 0.02)

ON CONFLICT (id) DO NOTHING;

DROP FUNCTION IF EXISTS fs_add_figure(int, text, text);

COMMIT;
