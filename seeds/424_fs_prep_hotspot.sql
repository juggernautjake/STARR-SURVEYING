-- 424_fs_prep_hotspot.sql
-- FS Exam Alignment Buildout — Slice S4.
-- First "select the element" (hotspot) question. QuizRunner shows the figure
-- (when a generated diagram is attached) plus a labeled list of the selectable
-- regions; the student picks the region that answers the prompt. The answer is
-- the chosen region id; grading is a plain string match (like multiple_choice).
--
-- Convention for hotspot:
--   options       = jsonb OBJECT { "regions":[{"id":"..","label":".."}, ...] }
--   correct_answer= the correct region id (text)
-- Idempotent: delete-by-tag then insert.

DELETE FROM question_bank WHERE 'fs-hotspot' = ANY(tags);

INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
-- Q28 mirror (Module 6 — GNSS/Geodesy): identify the geoid height (h = H + N).
-- (A matching generated figure attaches in S8 when renderHeightRelations exists.)
('fa240000-0000-0000-0000-000000000001',
 'On the elevation diagram of terrain, geoid, and ellipsoid, which element is the geoid height (geoid undulation)?',
 'hotspot',
 '{"regions":[{"id":"h","label":"h — ellipsoidal height, measured from the ellipsoid up to the ground point"},{"id":"H","label":"H — orthometric height, measured from the geoid up to the ground point"},{"id":"N","label":"N — the separation between the ellipsoid and the geoid"},{"id":"r","label":"r — geocentric radius, from the center of the earth to the ellipsoid"}]}'::jsonb,
 'N',
 'The geoid height (geoid undulation) N is the separation between the ellipsoid and the geoid. It relates the two height systems by h = H + N: ellipsoidal height (h, from GNSS) equals orthometric height (H, relative to the geoid) plus the geoid height (N).',
 'medium','f5000006-0000-0000-0000-000000000006','FS',
 ARRAY['fs-hotspot','fs-exam-mirror','genre:gnss-geodesy','fs-m6']::text[],true,'approved',
 '[{"type":"handbook","label":"Geodesy — height systems (h = H + N)"}]'::jsonb,false,0.01);
