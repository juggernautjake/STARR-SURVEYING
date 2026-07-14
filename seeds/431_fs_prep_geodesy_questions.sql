-- 431_fs_prep_geodesy_questions.sql
-- FS Exam Alignment Buildout — Slice S15.
-- GNSS / Geodesy (NCEES Cat 4, Module 6) exam-mirror questions as concept
-- variant pools: Q2 antenna height, Q3 geoid limiting factor, Q4 ellipsoidal
-- heights, Q26 NGS control source, Q27 historical scale factor, Q30 Lambert,
-- Q31 SPCS "projected" + siblings. (Q28 geoid-height hotspot shipped in S4/S8.)
-- Idempotent: delete-by-tag then insert.

DELETE FROM question_bank WHERE 'fs-geodesy' = ANY(tags);

INSERT INTO question_bank
  (id, question_text, question_type, options, correct_answer, explanation, difficulty, module_id, exam_category, tags, is_published, review_status, study_references, is_dynamic, tolerance)
VALUES
-- Q2 mirror — most important GNSS measurement
('fa310000-0000-0000-0000-000000000001',
 'What is the most important field measurement in Global Navigation Satellite System (GNSS) survey procedures?',
 'multiple_choice','["Barometric pressure","Relative humidity","Antenna height","Distance between base and rover"]'::jsonb,'Antenna height',
 'The GNSS solution yields the position of the antenna phase center relative to the center of the earth; the surveyor must measure the antenna height accurately to reduce that position to the ground mark. A mis-measured antenna height is a leading source of GNSS blunders.',
 'easy','f5000006-0000-0000-0000-000000000006','FS',ARRAY['fs-geodesy','fs-m6','fs-exam-mirror','genre:gnss-geodesy']::text[],true,'approved','[{"type":"handbook","label":"GNSS field procedures"}]'::jsonb,false,0.01),
-- Q2 sibling
('fa310000-0000-0000-0000-000000000002',
 'Why is the antenna height such a critical measurement in GNSS surveying?',
 'multiple_choice','["It determines the satellite geometry","The position solution is for the antenna phase center and must be reduced to the ground mark","It sets the radio frequency","It calibrates the barometer"]'::jsonb,'The position solution is for the antenna phase center and must be reduced to the ground mark',
 'GNSS computes the position of the antenna phase center. To get the mark on the ground, that position must be reduced by the measured antenna (phase-center) height, so an error there propagates directly into the coordinate.',
 'medium','f5000006-0000-0000-0000-000000000006','FS',ARRAY['fs-geodesy','fs-m6','genre:gnss-geodesy']::text[],true,'approved','[]'::jsonb,false,0.01),
-- Q3 mirror — geoid limiting factor
('fa310000-0000-0000-0000-000000000003',
 'When orthometric elevations are produced for a survey project using GNSS, the limiting factor is a:',
 'multiple_choice','["clear line of sight","precise ellipsoid model","precise geoid model","precise gravimetric survey of the site"]'::jsonb,'precise geoid model',
 'GNSS yields ellipsoidal heights. Converting them to orthometric elevations (relative to the geoid) requires a geoid model, so the accuracy of that geoid model is the limiting factor for GNSS-derived elevations.',
 'medium','f5000006-0000-0000-0000-000000000006','FS',ARRAY['fs-geodesy','fs-m6','fs-exam-mirror','genre:gnss-geodesy']::text[],true,'approved','[{"type":"handbook","label":"Geodesy — height systems"}]'::jsonb,false,0.01),
-- Q4 mirror — geodetic heights = ellipsoid
('fa310000-0000-0000-0000-000000000004',
 'Geodetic heights obtained with satellite (GNSS) surveys are:',
 'multiple_choice','["presented in geocentric coordinates","presented in state plane coordinates","measured with respect to the geoid","measured with respect to the ellipsoid"]'::jsonb,'measured with respect to the ellipsoid',
 'A geodetic (ellipsoidal) height is measured from the reference ellipsoid. GNSS satellites orbit the earth''s center of mass and provide positions referenced to the ellipsoid, not the geoid.',
 'medium','f5000006-0000-0000-0000-000000000006','FS',ARRAY['fs-geodesy','fs-m6','fs-exam-mirror','genre:gnss-geodesy']::text[],true,'approved','[]'::jsonb,false,0.01),
-- Q4 sibling — h = H + N
('fa310000-0000-0000-0000-000000000005',
 'The orthometric height H, ellipsoidal height h, and geoid height N are related by:',
 'multiple_choice','["H = h + N","H = h − N","H = N − h","H = h × N"]'::jsonb,'H = h − N',
 'Ellipsoidal height h = orthometric height H + geoid height N, so H = h − N. GNSS gives h; a geoid model gives N; subtract to obtain the orthometric elevation H.',
 'medium','f5000006-0000-0000-0000-000000000006','FS',ARRAY['fs-geodesy','fs-m6','genre:gnss-geodesy']::text[],true,'approved','[]'::jsonb,false,0.01),
-- Q4 sibling 2 — GNSS gives which height
('fa310000-0000-0000-0000-000000000006',
 'GNSS positioning directly provides which type of height?',
 'multiple_choice','["Orthometric height","Ellipsoidal height","Dynamic height","Geopotential height"]'::jsonb,'Ellipsoidal height',
 'GNSS directly yields ellipsoidal (geodetic) height. Orthometric height requires applying a geoid model: H = h − N.',
 'easy','f5000006-0000-0000-0000-000000000006','FS',ARRAY['fs-geodesy','fs-m6','genre:gnss-geodesy']::text[],true,'approved','[]'::jsonb,false,0.01),
-- Q26 mirror — NGS control source
('fa310000-0000-0000-0000-000000000007',
 'A project must be referenced to the State Plane Coordinate System with directions to grid north. A list of control monuments and their published coordinates is obtained from the:',
 'multiple_choice','["National Society of Professional Surveyors","National Bureau of Standards","National Geodetic Survey","Bureau of Land Management"]'::jsonb,'National Geodetic Survey',
 'NOAA''s National Geodetic Survey (NGS) defines and maintains the National Spatial Reference System — the source for control monuments and published State Plane coordinates.',
 'easy','f5000006-0000-0000-0000-000000000006','FS',ARRAY['fs-geodesy','fs-m6','fs-exam-mirror','genre:gnss-geodesy']::text[],true,'approved','[{"type":"handbook","label":"Geodetic control (NGS)"}]'::jsonb,false,0.01),
-- Q26 sibling — NSRS
('fa310000-0000-0000-0000-000000000008',
 'Which agency defines and maintains the National Spatial Reference System (NSRS) in the United States?',
 'multiple_choice','["FEMA","The National Geodetic Survey (NOAA)","The Bureau of Land Management","The U.S. Army Corps of Engineers"]'::jsonb,'The National Geodetic Survey (NOAA)',
 'The National Geodetic Survey (part of NOAA) defines and maintains the NSRS — the national framework of geodetic control, datums, and tools (e.g., OPUS, geoid models).',
 'medium','f5000006-0000-0000-0000-000000000006','FS',ARRAY['fs-geodesy','fs-m6','genre:gnss-geodesy']::text[],true,'approved','[]'::jsonb,false,0.01),
-- Q27 mirror — historical scale factor
('fa310000-0000-0000-0000-000000000009',
 'Modern measurements may disagree with historical record distances because of the equipment and systematic errors of the original survey. Which allows a surveyor to relate the original record distances to resurvey measurements and to help find original monuments?',
 'multiple_choice','["Elevation factor","Grid factor","Scale factor","Zone constant"]'::jsonb,'Scale factor',
 'Measure between two found, undisturbed original monuments and divide the record distance by the measured distance; the resulting scale factor relates the old survey to the new one and helps predict where other original monuments should be.',
 'medium','f5000006-0000-0000-0000-000000000006','FS',ARRAY['fs-geodesy','fs-m6','fs-exam-mirror','genre:gnss-geodesy']::text[],true,'approved','[]'::jsonb,false,0.01),
-- Q30 mirror — Lambert equal-distance lines
('fa310000-0000-0000-0000-00000000000a',
 'In a Lambert (conformal conic) projection, the lines that are an equal distance apart are the:',
 'multiple_choice','["straight lines","standard parallels","central meridians","meridians"]'::jsonb,'standard parallels',
 'Per the NCEES answer, the standard parallels are the equal-distance lines; the meridians of a Lambert conic converge to a central point (apex), so they are not equal distance apart. (Note: this item is worded ambiguously on the exam.)',
 'hard','f5000006-0000-0000-0000-000000000006','FS',ARRAY['fs-geodesy','fs-m6','fs-exam-mirror','genre:gnss-geodesy']::text[],true,'approved','[{"type":"handbook","label":"Map projections"}]'::jsonb,false,0.01),
-- Q31 mirror — SPCS projected
('fa310000-0000-0000-0000-00000000000b',
 'The term "projected" as it relates to the State Plane Coordinate System means that the:',
 'multiple_choice','["survey is inaccurate and needs correction","found-monument coordinates need a unit conversion","handwritten coordinates are entered into software","earth''s curvature is taken into account for the survey calculations"]'::jsonb,'earth''s curvature is taken into account for the survey calculations',
 'SPCS uses a map projection to transform the curved earth surface onto a flat plane, so "projected" means the earth''s curvature has been accounted for in the coordinate system.',
 'medium','f5000006-0000-0000-0000-000000000006','FS',ARRAY['fs-geodesy','fs-m6','fs-exam-mirror','genre:gnss-geodesy']::text[],true,'approved','[]'::jsonb,false,0.01),
-- SPCS projections sibling
('fa310000-0000-0000-0000-00000000000c',
 'State Plane Coordinate System zones are based on which map projections?',
 'multiple_choice','["Only the transverse Mercator","Lambert conformal conic (E–W zones) and transverse Mercator (N–S zones)","Only the Lambert conformal conic","The UTM grid only"]'::jsonb,'Lambert conformal conic (E–W zones) and transverse Mercator (N–S zones)',
 'SPCS uses the Lambert conformal conic for zones that are long east–west and the transverse Mercator for zones that are long north–south (with an oblique Mercator for the Alaska panhandle).',
 'medium','f5000006-0000-0000-0000-000000000006','FS',ARRAY['fs-geodesy','fs-m6','genre:gnss-geodesy']::text[],true,'approved','[]'::jsonb,false,0.01),
-- datum sibling
('fa310000-0000-0000-0000-00000000000d',
 'Which pair correctly identifies a common horizontal datum and vertical datum used in the United States?',
 'multiple_choice','["NAD83 (horizontal) and NAVD88 (vertical)","WGS84 (horizontal) and NGVD29 (vertical) only","State Plane (horizontal) and MSL (vertical)","UTM (horizontal) and the ellipsoid (vertical)"]'::jsonb,'NAD83 (horizontal) and NAVD88 (vertical)',
 'NAD83 is the standard horizontal datum and NAVD88 the standard orthometric (vertical) datum for the conterminous US. WGS84 is the GNSS/GPS datum, very close to NAD83 but not identical.',
 'medium','f5000006-0000-0000-0000-000000000006','FS',ARRAY['fs-geodesy','fs-m6','genre:gnss-geodesy']::text[],true,'approved','[]'::jsonb,false,0.01),
-- combined factor sibling
('fa310000-0000-0000-0000-00000000000e',
 'The combined (grid) factor used to reduce a ground distance to a State Plane grid distance is the product of the:',
 'multiple_choice','["scale factor and the elevation (sea-level) factor","latitude and the longitude","backsight and the foresight","temperature and the tension corrections"]'::jsonb,'scale factor and the elevation (sea-level) factor',
 'Combined factor = grid scale factor × elevation (sea-level) factor. Multiply a ground distance by the combined factor to get the grid distance (or divide to go from grid to ground).',
 'medium','f5000006-0000-0000-0000-000000000006','FS',ARRAY['fs-geodesy','fs-m6','genre:gnss-geodesy']::text[],true,'approved','[]'::jsonb,false,0.01);
