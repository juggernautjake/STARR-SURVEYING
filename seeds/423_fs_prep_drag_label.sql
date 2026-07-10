-- 423_fs_prep_drag_label.sql
-- FS Exam Alignment Buildout — Slice S3.
-- First "drag/assign label to target" (drag_label) question. QuizRunner shows a
-- pool of term chips and a set of target boxes; tap a term then tap its box.
-- Answer is stored as a JSON array parallel to the targets (the placed term per
-- target); grading is position-wise (gradeOrdering / checkOrdering).
--
-- Convention for drag_label:
--   options       = jsonb OBJECT { "terms":[...], "targets":[...] }  (client-visible)
--   correct_answer= JSON array parallel to targets — the correct term per target
-- The question_type CHECK constraint was already widened in seed 422.
-- Idempotent: delete-by-tag then insert.

DELETE FROM question_bank WHERE 'fs-drag-label' = ANY(tags);

INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
-- Q13 mirror (Module 8 — Photogrammetry): tilted-photograph / nadir geometry.
-- (A matching generated figure will be attached in S8 when renderTiltedPhoto exists.)
('fa230000-0000-0000-0000-000000000001',
 'Tilted aerial photograph geometry: match each element of the nadir diagram to its description.',
 'drag_label',
 '{"terms":["Principal line","Optical axis","Tilted photo","Plumb line"],"targets":["The vertical line from the exposure station (lens) down to the ground nadir point","The line from the lens perpendicular to the photo plane, passing through the principal point","The plane of the photograph itself (shown as the tilted parallelogram)","The line in the photo plane joining the principal point and the photo nadir point"]}'::jsonb,
 '["Plumb line","Optical axis","Tilted photo","Principal line"]',
 'Plumb line = the true vertical from the exposure station to the ground nadir. Optical axis = the camera axis, perpendicular to the photo plane through the principal point. Tilted photo = the photograph plane (tilted from horizontal). Principal line = the line in the photo through the principal point and the photo nadir point (the trace of the principal plane).',
 'medium','f5000008-0000-0000-0000-000000000008','FS',
 ARRAY['fs-drag-label','fs-exam-mirror','genre:photogrammetry','fs-m8']::text[],true,'approved',
 '[{"type":"handbook","label":"Photogrammetry — tilted photograph geometry"}]'::jsonb,false,0.01);
