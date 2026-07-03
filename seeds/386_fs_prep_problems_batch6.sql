-- seeds/386_fs_prep_problems_batch6.sql — sixth batch: topical breadth
-- (inverse direction, angular balancing, construction grade, riparian law,
-- reciprocal leveling). Answers node/spec-verified.
BEGIN;
INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
('fb386000-0000-0000-0000-000000000001',
 'Point A is (N 1000.00, E 1000.00) and point B is (N 1500.00, E 1500.00). What is the azimuth of line A→B, in decimal degrees?',
 'numeric_input','[]'::jsonb,'45',
 'ΔN = +500, ΔE = +500 (both positive → NE quadrant). Azimuth = atan2(ΔE, ΔN) = atan(500/500) = 45°.',
 'medium','f5000004-0000-0000-0000-000000000004','FS',
 ARRAY['fs-buildout-v8','genre:traverse-cogo','fs-m4']::text[],true,'approved',
 '[{"type":"module","id":"4","label":"Traversing & COGO"}]'::jsonb,false,0.05),
('fb386000-0000-0000-0000-000000000002',
 'A five-sided closed traverse has an angular misclosure of +2''30" (150 seconds). If the misclosure is distributed equally, what correction (in seconds) is applied to each angle? Give the signed value.',
 'numeric_input','[]'::jsonb,'-30',
 'Correction per angle = −(misclosure)/n = −150"/5 = −30" each (subtract because the measured sum is too large).',
 'hard','f5000004-0000-0000-0000-000000000004','FS',
 ARRAY['fs-buildout-v8','genre:traverse-cogo','fs-m4','challenge']::text[],true,'approved',
 '[{"type":"module","id":"4","label":"Traversing & COGO"}]'::jsonb,false,0.5),
('fb386000-0000-0000-0000-000000000003',
 'At a construction stake the finished (design) grade is 100.00 ft and the existing ground is 96.50 ft. What is the fill required, in feet?',
 'numeric_input','[]'::jsonb,'3.5',
 'Fill = finished grade − existing ground = 100.00 − 96.50 = 3.50 ft of fill (existing is below design). A negative result would mean cut.',
 'easy','f5000008-0000-0000-0000-000000000008','FS',
 ARRAY['fs-buildout-v8','genre:photogrammetry','fs-m8']::text[],true,'approved',
 '[{"type":"module","id":"8","label":"Photogrammetry, GIS and Construction"}]'::jsonb,false,0.02),
('fb386000-0000-0000-0000-000000000004',
 'Under common-law water-boundary doctrine, land gradually and imperceptibly added to a riparian parcel by the deposit of soil (accretion) generally belongs to whom?',
 'multiple_choice','["The upland (riparian) owner","The state","The adjoining downstream owner","It becomes unowned public land"]'::jsonb,
 'The upland (riparian) owner',
 'Accretion (slow deposition) and reliction (slow recession of water) accrue to the adjacent upland/riparian owner, whose boundary moves with the water. Avulsion (sudden change) does NOT move the boundary. Texas follows these common-law doctrines, with special rules for the gradient boundary on some streams.',
 'medium','f5000007-0000-0000-0000-000000000007','FS',
 ARRAY['fs-buildout-v8','genre:boundary-legal','fs-m7','texas']::text[],true,'approved',
 '[{"type":"module","id":"7","label":"Boundary Law & Public Lands"}]'::jsonb,false,0.01),
('fb386000-0000-0000-0000-000000000005',
 'Reciprocal leveling (observing across a wide river from both banks and averaging) is used primarily to eliminate which errors?',
 'multiple_choice','["Curvature, refraction, and collimation","Rod-reading blunders","Temperature of the tape","Magnetic declination"]'::jsonb,
 'Curvature, refraction, and collimation',
 'Reciprocal leveling averages foresights and backsights taken over an unequal, long sight distance from each bank, cancelling the systematic errors that depend on sight length — earth curvature, atmospheric refraction, and instrument collimation.',
 'hard','f5000002-0000-0000-0000-000000000002','FS',
 ARRAY['fs-buildout-v8','genre:leveling','fs-m2','challenge']::text[],true,'approved',
 '[{"type":"module","id":"2","label":"Leveling"}]'::jsonb,false,0.01)
ON CONFLICT (id) DO NOTHING;
COMMIT;
