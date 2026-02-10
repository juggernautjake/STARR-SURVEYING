-- ============================================================================
-- STARR Surveying — ACC Course Final Exam Questions
-- ============================================================================
-- Final exam questions for all three ACC course modules:
--   SRVY 1301 — Introduction to Surveying (20 questions)
--   SRVY 1335 — Land Surveying Applications Lab (20 questions)
--   SRVY 1341 — Land Surveying (20 questions)
--
-- Each final exam targets the existing Week 16 lesson for that module.
-- Run AFTER supabase_seed_acc_courses.sql
-- Safe to re-run (delete-then-insert on final exam tags).
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: SRVY 1301 FINAL EXAM (20 questions, comprehensive)
-- ============================================================================
-- Lesson ID: acc01b16-0000-0000-0000-000000000001 (Week 16: Final Exam)
-- Module ID: acc00001-0000-0000-0000-000000000001

DELETE FROM question_bank WHERE tags @> ARRAY['acc-srvy-1301','final-exam'];

INSERT INTO question_bank (question_text, question_type, options, correct_answer, explanation, difficulty, module_id, lesson_id, exam_category, tags) VALUES
-- F1
('The US Survey foot is defined as exactly:', 'multiple_choice',
 '["0.3048 meters","1200/3937 meters","12/39.37 meters","0.30480061 meters"]'::jsonb,
 '1200/3937 meters',
 'The US Survey foot = 1200/3937 meters ≈ 0.30480061 m. The International foot = exactly 0.3048 m. The difference (~2 ppm) matters for large-scale surveys.',
 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','units']),

-- F2
('A geodetic survey differs from a plane survey primarily because a geodetic survey:', 'multiple_choice',
 '["Uses less expensive equipment","Is always performed by the government","Accounts for the curvature of the earth","Only measures distances"]'::jsonb,
 'Accounts for the curvature of the earth',
 'Geodetic surveys account for earth curvature and operate over large areas where the flat-earth assumption of plane surveying introduces unacceptable errors.',
 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','geodetic']),

-- F3
('BM elevation = 412.56 ft, BS = 6.34 ft, FS = 3.89 ft. The unknown point elevation is:', 'numeric_input',
 '[]'::jsonb,
 '415.01',
 'HI = 412.56 + 6.34 = 418.90. Elevation = 418.90 - 3.89 = 415.01 ft.',
 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','leveling']),

-- F4
('Five measurements of a line: 250.43, 250.47, 250.41, 250.45, 250.44 ft. The standard deviation is approximately:', 'numeric_input',
 '[]'::jsonb,
 '0.022',
 'Mean = (250.43+250.47+250.41+250.45+250.44)/5 = 1252.20/5 = 250.44. Residuals: -0.01, +0.03, -0.03, +0.01, 0.00. Σv² = 0.0001+0.0009+0.0009+0.0001+0 = 0.0020. σ = sqrt(0.0020/4) = sqrt(0.0005) = 0.0224 ≈ 0.022 ft.',
 'hard', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','statistics']),

-- F5
('The combined curvature and refraction correction for a 4,000-ft sight distance is:', 'numeric_input',
 '[]'::jsonb,
 '0.330',
 'C&R = 0.0206 × F² = 0.0206 × (4.0)² = 0.0206 × 16 = 0.3296 ≈ 0.330 ft.',
 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','curvature-refraction']),

-- F6
('An azimuth of 248°30'' corresponds to a bearing of:', 'multiple_choice',
 '["S 68°30'' W","N 68°30'' W","S 68°30'' E","N 68°30'' E"]'::jsonb,
 'S 68°30'' W',
 'Azimuths between 180° and 270° are in the SW quadrant. Bearing = S (248°30'' - 180°) W = S 68°30'' W.',
 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','bearings-azimuths']),

-- F7
('A slope distance of 620.00 ft is measured at a zenith angle of 85°15''. The horizontal distance is:', 'numeric_input',
 '[]'::jsonb,
 '617.87',
 'Vertical angle = 90° - 85°15'' = 4°45'' = 4.75°. HD = 620.00 × cos(4.75°) = 620.00 × 0.99656 = 617.87 ft. Equivalently: HD = SD × sin(zenith) = 620 × sin(85°15'') = 617.87 ft.',
 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','slope-distance']),

-- F8
('A four-sided closed traverse should have interior angles summing to:', 'multiple_choice',
 '["180°","360°","540°","720°"]'::jsonb,
 '360°',
 'Sum of interior angles = (n-2) × 180° = (4-2) × 180° = 2 × 180° = 360°.',
 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','interior-angles']),

-- F9
('A distance of 1,500 ft is measured with an uncertainty of ±0.06 ft. The relative precision is:', 'multiple_choice',
 '["1:250","1:2,500","1:25,000","1:250,000"]'::jsonb,
 '1:25,000',
 'Relative precision = 0.06 / 1,500 = 1/25,000.',
 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','relative-precision']),

-- F10
('The tape temperature correction formula is Ct = α × (T - Ts) × L. If α = 0.00000645/°F, T = 100°F, Ts = 68°F, and L = 200 ft, the correction is:', 'numeric_input',
 '[]'::jsonb,
 '0.041',
 'Ct = 0.00000645 × (100 - 68) × 200 = 0.00000645 × 32 × 200 = 0.04128 ≈ 0.041 ft. Positive because the tape expanded (used distance is too short).',
 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','tape-correction']),

-- F11
('Three independent error sources of ±0.02, ±0.03, and ±0.05 ft propagate to a combined error of:', 'numeric_input',
 '[]'::jsonb,
 '0.062',
 'E = sqrt(0.02² + 0.03² + 0.05²) = sqrt(0.0004 + 0.0009 + 0.0025) = sqrt(0.0038) = 0.0616 ≈ 0.062 ft.',
 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','error-propagation']),

-- F12
('For a level circuit of 4 miles with k = 0.035 ft/√mi, the allowable misclosure is:', 'numeric_input',
 '[]'::jsonb,
 '0.070',
 'Allowable = 0.035 × √4 = 0.035 × 2.0 = 0.070 ft.',
 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','leveling-closure']),

-- F13
('In a stadia reading, the rod intercept between the upper and lower stadia hairs is 3.45 ft. Using a stadia constant of 100, the distance is:', 'numeric_input',
 '[]'::jsonb,
 '345',
 'Distance = stadia constant × intercept = 100 × 3.45 = 345 ft. Stadia distances are typically accurate to about 1:300 to 1:500.',
 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','stadia']),

-- F14
('Convert the bearing S 52°15'' W to an azimuth.', 'numeric_input',
 '[]'::jsonb,
 '232.25',
 'SW quadrant: Azimuth = 180° + 52°15'' = 232°15'' = 232.25°.',
 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','bearing-to-azimuth']),

-- F15
('A traverse line has azimuth 210°00'' and distance 300.00 ft. Its latitude is:', 'numeric_input',
 '[]'::jsonb,
 '-259.81',
 'Lat = 300 × cos(210°) = 300 × (-0.86603) = -259.81 ft. Negative because the line has a southward component.',
 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','latitude']),

-- F16
('The same traverse line (Az 210°, dist 300 ft) has a departure of:', 'numeric_input',
 '[]'::jsonb,
 '-150.00',
 'Dep = 300 × sin(210°) = 300 × (-0.5) = -150.00 ft. Negative because the line has a westward component.',
 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','departure']),

-- F17
('In the compass rule adjustment, corrections are proportional to:', 'multiple_choice',
 '["The angle at each station","The length of each traverse leg","The number of stations","The latitude of each leg"]'::jsonb,
 'The length of each traverse leg',
 'The compass rule (Bowditch) distributes corrections proportional to each leg''s length relative to the total perimeter: correction = -(misclosure × leg_distance / total_perimeter).',
 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','compass-rule']),

-- F18
('A contour line connects points of:', 'multiple_choice',
 '["Equal distance from a boundary","Equal elevation","Equal latitude","Equal slope"]'::jsonb,
 'Equal elevation',
 'Contour lines connect points of equal elevation on a topographic map. The spacing between contour lines indicates slope — closely spaced lines represent steep terrain.',
 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','contours']),

-- F19
('In Texas, the professional license that authorizes independent practice of land surveying is:', 'multiple_choice',
 '["PE (Professional Engineer)","RPLS (Registered Professional Land Surveyor)","SIT (Surveyor Intern)","GIS Professional"]'::jsonb,
 'RPLS (Registered Professional Land Surveyor)',
 'The RPLS license, issued by the Texas Board of Professional Engineers and Land Surveyors (TBPELS), authorizes independent practice of land surveying in Texas. A PE license does not authorize surveying practice.',
 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','licensing']),

-- F20
('Explain the complete process of differential leveling, including how to calculate elevations and distribute misclosure in a level circuit. Include all key formulas.', 'essay',
 '[]'::jsonb,
 'Key concepts: HI = known elev + BS; new elev = HI - FS; misclosure = computed return elev - known elev; correction = -(misclosure × cumulative distance / total distance)',
 'Differential leveling determines elevations using a level instrument and rod. Process: (1) Set up level between known benchmark (BM) and first unknown point. (2) Take backsight (BS) on BM: HI = BM elevation + BS. (3) Take foresight (FS) on turning point (TP): TP elevation = HI - FS. (4) Move level ahead, backsight on TP, foresight on next TP, repeat. (5) Close back to known BM. (6) Misclosure = computed return elevation - known BM elevation. (7) Check against allowable: k × √(miles). (8) Distribute correction proportionally by cumulative distance: correction at each TP = -(misclosure × cumulative distance to that TP / total circuit distance).',
 'hard', 'acc00001-0000-0000-0000-000000000001', 'acc01b16-0000-0000-0000-000000000001', 'ACC-1301-FINAL', ARRAY['acc-srvy-1301','final-exam','leveling','essay']);


-- ============================================================================
-- SECTION 2: SRVY 1335 FINAL EXAM (20 questions, practical focus)
-- ============================================================================
-- Lesson ID: acc02b16-0000-0000-0000-000000000001 (Week 16: Final Practical Exam)
-- Module ID: acc00002-0000-0000-0000-000000000002

DELETE FROM question_bank WHERE tags @> ARRAY['acc-srvy-1335','final-exam'];

INSERT INTO question_bank (question_text, question_type, options, correct_answer, explanation, difficulty, module_id, lesson_id, exam_category, tags) VALUES
-- F1
('The first thing you should do when arriving at a survey field site is:', 'multiple_choice',
 '["Set up the total station","Check for safety hazards","Open the field book","Measure a distance"]'::jsonb,
 'Check for safety hazards',
 'Safety is always the first priority. Before any equipment setup, assess the site for hazards: traffic, overhead power lines, unstable ground, wildlife, weather conditions, and heat exposure.',
 'easy', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','safety']),

-- F2
('A tribrach serves to:', 'multiple_choice',
 '["Measure distances electronically","Level and center an instrument over a survey point","Record field data","Calculate areas"]'::jsonb,
 'Level and center an instrument over a survey point',
 'A tribrach attaches to the tripod head and provides leveling screws and an optical plummet for precise centering over a point. It also enables forced centering (swapping instruments without re-centering).',
 'easy', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','tribrach']),

-- F3
('The proper setup procedure for a total station over a point is:', 'multiple_choice',
 '["Turn on, measure, level","Center roughly, level, fine-center, re-level, verify","Level, then measure immediately","Set tripod anywhere and begin measuring"]'::jsonb,
 'Center roughly, level, fine-center, re-level, verify',
 'Setup involves: (1) plant tripod roughly centered over point, (2) rough centering using plumb bob or optical plummet, (3) level using leveling screws, (4) fine-center using the optical plummet and slide on tripod head, (5) re-check level, iterate until both centered and level.',
 'medium', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','setup-procedure']),

-- F4
('EDM instruments measure distance by:', 'multiple_choice',
 '["Counting mechanical clicks","Measuring the phase shift of electromagnetic waves reflected from a prism","Reading a graduated tape","Using GPS satellites"]'::jsonb,
 'Measuring the phase shift of electromagnetic waves reflected from a prism',
 'EDM (Electronic Distance Measuring) instruments emit infrared or laser waves to a prism reflector and determine distance from the phase shift of the returned signal. The carrier wavelength and modulation pattern allow precise distance computation.',
 'medium', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','EDM']),

-- F5
('The atmospheric correction for EDM measurements accounts for:', 'multiple_choice',
 '["Wind speed","Temperature and pressure effects on the speed of light","Magnetic declination","Gravity variations"]'::jsonb,
 'Temperature and pressure effects on the speed of light',
 'Temperature and atmospheric pressure affect the speed of electromagnetic waves through air. EDM instruments use a standard atmosphere for their internal calculations; actual conditions are entered so the instrument can correct the measured distance.',
 'medium', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','atmospheric-correction']),

-- F6
('When measuring angles by repetition with 4D (4 direct measurements), the mean angle is found by dividing the accumulated reading by:', 'multiple_choice',
 '["2","4","8","16"]'::jsonb,
 '4',
 'In 4D repetitions, the horizontal angle is accumulated 4 times on the direct reading. Dividing the final accumulated reading by 4 gives the mean angle, reducing random errors by a factor of √4 = 2.',
 'easy', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','repetition-method']),

-- F7
('The purpose of measuring angles in both direct (D) and reverse (R) positions is to:', 'multiple_choice',
 '["Double the measurement speed","Eliminate systematic instrument errors like collimation","Measure vertical angles","Read the horizontal circle only"]'::jsonb,
 'Eliminate systematic instrument errors like collimation',
 'Direct and reverse (face left/face right) measurements cancel systematic errors: horizontal collimation, vertical index error, trunnion axis tilt, and circle graduation errors. The mean of D and R is free from these instrument errors.',
 'medium', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','direct-reverse']),

-- F8
('Forced centering reduces errors because it:', 'multiple_choice',
 '["Eliminates the need for a tripod","Allows instrument and target to be swapped without re-centering over the point","Increases measurement speed only","Forces the instrument to auto-level"]'::jsonb,
 'Allows instrument and target to be swapped without re-centering over the point',
 'With forced centering, the tribrach stays locked on the tripod over the point while the instrument or target is swapped. This eliminates centering errors that would occur if the instrument had to be re-centered at each station.',
 'medium', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','forced-centering']),

-- F9
('In differential leveling, the Height of Instrument (HI) is computed as:', 'multiple_choice',
 '["Known elevation minus backsight","Known elevation plus backsight","Known elevation plus foresight","Known elevation minus foresight"]'::jsonb,
 'Known elevation plus backsight',
 'HI = Known Elevation + Backsight (BS). The backsight on a known point, added to that point''s elevation, gives the height of the instrument''s line of sight.',
 'easy', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','leveling-HI']),

-- F10
('A closed traverse in the field must have angular closure checked before leaving the site because:', 'multiple_choice',
 '["The professor requires it","Unacceptable closure means angles must be remeasured, and the site may not be accessible later","It is faster to check later in the office","Angular closure does not matter for closed traverses"]'::jsonb,
 'Unacceptable closure means angles must be remeasured, and the site may not be accessible later',
 'Checking angular closure on-site is critical quality control. If misclosure exceeds the allowable tolerance, angles must be remeasured immediately. Discovering this in the office after leaving the site would require a costly return trip.',
 'medium', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','field-closure']),

-- F11
('An EDM has a stated accuracy of ±(3 mm + 2 ppm). For a measured distance of 500 m, the expected error is:', 'numeric_input',
 '[]'::jsonb,
 '4.0',
 'Error = 3 mm + (2 × 500,000 mm / 1,000,000) = 3 mm + 1.0 mm = 4.0 mm. The constant part (3 mm) dominates at short distances; the ppm part grows with distance.',
 'medium', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','EDM-accuracy']),

-- F12
('A prism constant is:', 'multiple_choice',
 '["The weight of the prism","An offset correction for the distance the signal travels inside the prism glass","The serial number of the prism","The reflectivity of the prism surface"]'::jsonb,
 'An offset correction for the distance the signal travels inside the prism glass',
 'The EDM signal reflects inside the prism and the effective reflection point is behind the prism center. The prism constant (typically 0 mm or -30 mm depending on the system) corrects for this offset. It must match the instrument''s setting.',
 'medium', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','prism-constant']),

-- F13
('When taking a slope distance of 450.00 ft at a vertical angle of 3°20'', the horizontal distance is:', 'numeric_input',
 '[]'::jsonb,
 '449.24',
 'HD = 450.00 × cos(3°20'') = 450.00 × cos(3.3333°) = 450.00 × 0.99831 = 449.24 ft.',
 'medium', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','slope-to-horizontal']),

-- F14
('Field notes should never be erased. Mistakes should be:', 'multiple_choice',
 '["Erased cleanly and rewritten","Crossed out with a single line so the original remains legible","Covered with correction fluid","Torn out and rewritten on a new page"]'::jsonb,
 'Crossed out with a single line so the original remains legible',
 'Mistakes in field notes are corrected by drawing a single line through the error (keeping it legible) and writing the correct value nearby. Erasures destroy the record and can raise questions about data integrity.',
 'easy', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','field-notes']),

-- F15
('The theodolite''s vertical circle reads 90°00''00" when the telescope is horizontal. This angle is called:', 'multiple_choice',
 '["A bearing","A zenith angle","An azimuth","A deflection angle"]'::jsonb,
 'A zenith angle',
 'A zenith angle is measured from the vertical (zenith) direction. When the telescope is horizontal, the zenith angle is 90°. Zenith angles are the standard vertical circle reading system on modern instruments.',
 'easy', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','zenith-angle']),

-- F16
('The two-peg test is used to detect:', 'multiple_choice',
 '["Horizontal circle eccentricity","Collimation error in a level instrument","Prism constant error","Tape calibration error"]'::jsonb,
 'Collimation error in a level instrument',
 'The two-peg test determines if the level''s line of sight is truly horizontal. By comparing readings from the midpoint (where errors cancel) to readings from near one end, the collimation error can be quantified and adjusted.',
 'medium', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','two-peg-test']),

-- F17
('Profile leveling determines elevations along a:', 'multiple_choice',
 '["Property boundary","Route centerline at regular station intervals","Single benchmark","Random selection of points"]'::jsonb,
 'Route centerline at regular station intervals',
 'Profile leveling determines ground elevations at regular intervals (stations) along a route centerline. The results are plotted as a profile graph showing the ground surface along the alignment for design purposes.',
 'easy', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','profile-leveling']),

-- F18
('A survey monument serves as:', 'multiple_choice',
 '["A temporary reference only","A permanent marker defining a boundary corner or control point","A decorative site feature","An equipment storage point"]'::jsonb,
 'A permanent marker defining a boundary corner or control point',
 'Survey monuments are permanent markers set in the ground to define property corners, control points, or other survey positions. Common types include iron rods, iron pipes, concrete monuments, and brass caps.',
 'easy', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','monuments']),

-- F19
('Cross-section leveling is used to determine:', 'multiple_choice',
 '["Property boundaries","Ground elevations perpendicular to a route centerline","The height of buildings","Atmospheric pressure"]'::jsonb,
 'Ground elevations perpendicular to a route centerline',
 'Cross-sections are taken at regular station intervals perpendicular to the centerline. They show the terrain shape across the route and are essential for computing earthwork (cut and fill) quantities.',
 'easy', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','cross-sections']),

-- F20
('Describe the complete step-by-step procedure for setting up a total station over a known point and orienting to a backsight. Include leveling, centering, and backsight orientation.', 'essay',
 '[]'::jsonb,
 'Key steps: tripod placement, rough centering, leveling, fine centering, re-leveling, power on, backsight setup, set zero or known azimuth',
 'Complete procedure: (1) Extend and plant tripod legs over the point, checking that the tripod head is roughly level and centered. (2) Attach tribrach and instrument. (3) Look through optical plummet — adjust tripod legs to rough-center over the point. (4) Level the circular bubble using leveling screws. (5) Fine-center using optical plummet — slide instrument on tripod head. (6) Re-check level, re-center; iterate until both are achieved. (7) Power on instrument. (8) Set backsight: sight the prism on the backsight point. (9) Set the horizontal angle to 0°00''00" (or enter the known azimuth to the backsight). (10) Verify by re-sighting the backsight after several measurements.',
 'hard', 'acc00002-0000-0000-0000-000000000002', 'acc02b16-0000-0000-0000-000000000001', 'ACC-1335-FINAL', ARRAY['acc-srvy-1335','final-exam','setup','essay']);


-- ============================================================================
-- SECTION 3: SRVY 1341 FINAL EXAM (20 questions, computation-heavy)
-- ============================================================================
-- Lesson ID: acc03b16-0000-0000-0000-000000000001 (Week 16: Final Exam)
-- Module ID: acc00003-0000-0000-0000-000000000003

DELETE FROM question_bank WHERE tags @> ARRAY['acc-srvy-1341','final-exam'];

INSERT INTO question_bank (question_text, question_type, options, correct_answer, explanation, difficulty, module_id, lesson_id, exam_category, tags) VALUES
-- F1
('A closed traverse with 5 sides should have interior angles summing to:', 'numeric_input',
 '[]'::jsonb,
 '540',
 'Sum = (n-2) × 180° = (5-2) × 180° = 3 × 180° = 540°.',
 'easy', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','interior-angles']),

-- F2
('An open traverse provides no mathematical check on accuracy.', 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'An open traverse does not close on a known point, so there is no way to compute closure and verify accuracy. Open traverses should be avoided unless absolutely necessary.',
 'easy', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','open-traverse']),

-- F3
('A traverse line has azimuth 155°00'' and distance 350.00 ft. The latitude is:', 'numeric_input',
 '[]'::jsonb,
 '-317.21',
 'Lat = 350 × cos(155°) = 350 × (-0.90631) = -317.21 ft. Negative because the line trends south.',
 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','latitude']),

-- F4
('The same line (Az 155°, dist 350 ft) has a departure of:', 'numeric_input',
 '[]'::jsonb,
 '147.92',
 'Dep = 350 × sin(155°) = 350 × sin(25°) = 350 × 0.42262 = 147.92 ft. Positive because azimuth 155° is in the SE quadrant (eastward departure).',
 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','departure']),

-- F5
('A traverse has ΣLat = +0.05 ft and ΣDep = -0.12 ft, with a total perimeter of 3,000 ft. The linear error of closure is:', 'numeric_input',
 '[]'::jsonb,
 '0.13',
 'Error = sqrt(0.05² + 0.12²) = sqrt(0.0025 + 0.0144) = sqrt(0.0169) = 0.13 ft.',
 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','error-of-closure']),

-- F6
('For the same traverse (error 0.13 ft, perimeter 3,000 ft), the relative precision is:', 'multiple_choice',
 '["1:300","1:2,308","1:23,077","1:230,769"]'::jsonb,
 '1:23,077',
 'Relative precision = 0.13 / 3,000 = 1/23,077 ≈ 1:23,077. This exceeds the 1:15,000 requirement for urban surveys.',
 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','relative-precision']),

-- F7
('In the compass rule (Bowditch), the latitude correction for a leg is computed as:', 'multiple_choice',
 '["-(ΣLat × leg_distance / perimeter)","-(ΣLat × leg_latitude / ΣLatitudes)","ΣLat / number_of_legs","leg_distance × cos(azimuth)"]'::jsonb,
 '-(ΣLat × leg_distance / perimeter)',
 'Compass rule: C_lat = -(ΣLat × D_leg / D_total). Each leg''s correction is proportional to its distance relative to the total perimeter. Departure corrections use the same formula with ΣDep.',
 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','compass-rule']),

-- F8
('After applying the compass rule, the sum of adjusted latitudes should equal:', 'multiple_choice',
 '["The original sum","The misclosure","Zero","The total perimeter"]'::jsonb,
 'Zero',
 'After adjustment, ΣAdjusted Latitudes = 0 and ΣAdjusted Departures = 0. This is the verification check that the adjustment was performed correctly.',
 'easy', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','adjustment-check']),

-- F9
('The transit rule distributes corrections proportional to:', 'multiple_choice',
 '["The length of each leg","The absolute value of latitude (or departure) of each leg","The angle at each station","The number of sides"]'::jsonb,
 'The absolute value of latitude (or departure) of each leg',
 'The transit rule distributes latitude corrections proportional to |lat| and departure corrections proportional to |dep| of each leg. It is used when angles are measured more precisely than distances.',
 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','transit-rule']),

-- F10
('Given two points: A (N:1000.00, E:2000.00) and B (N:1200.00, E:2300.00). The distance A→B is:', 'numeric_input',
 '[]'::jsonb,
 '360.56',
 'ΔN = 1200 - 1000 = 200.00, ΔE = 2300 - 2000 = 300.00. Distance = sqrt(200² + 300²) = sqrt(40,000 + 90,000) = sqrt(130,000) = 360.56 ft.',
 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','inverse-distance']),

-- F11
('The azimuth from A to B (using the coordinates above) is:', 'numeric_input',
 '[]'::jsonb,
 '56.31',
 'Azimuth = arctan(ΔE / ΔN) = arctan(300 / 200) = arctan(1.5) = 56.31°. NE quadrant so no adjustment needed.',
 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','inverse-azimuth']),

-- F12
('The area of a triangle with coordinates A(0,0), B(400,0), C(400,300) computed by the coordinate method is:', 'numeric_input',
 '[]'::jsonb,
 '60000',
 'Area = ½|Σ(Xi(Yi+1 - Yi-1))| = ½|0(0-300) + 400(300-0) + 400(0-0)| = ½|0 + 120,000 + 0| = 60,000 sq ft. Or: base × height / 2 = 400 × 300 / 2 = 60,000 sq ft.',
 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','area-coordinate']),

-- F13
('One acre equals:', 'multiple_choice',
 '["4,840 square yards","43,560 square feet","Both A and B are correct","10,000 square meters"]'::jsonb,
 'Both A and B are correct',
 'One acre = 43,560 sq ft = 4,840 sq yd. For reference: 10,000 sq meters = 1 hectare ≈ 2.471 acres.',
 'easy', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','area-units']),

-- F14
('In boundary retracement, the highest priority of calls is given to:', 'multiple_choice',
 '["Area","Distance","Natural monuments","Bearings and directions"]'::jsonb,
 'Natural monuments',
 'Priority of calls (highest to lowest): (1) natural monuments, (2) artificial monuments, (3) adjoiners/boundaries, (4) distances, (5) directions/bearings, (6) area. Natural monuments (rivers, ridges, trees) are the most reliable evidence.',
 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','priority-of-calls']),

-- F15
('An obliterated corner differs from a lost corner because an obliterated corner:', 'multiple_choice',
 '["No longer exists in any form","Can be recovered from evidence and witnesses","Was never set","Is always a natural monument"]'::jsonb,
 'Can be recovered from evidence and witnesses',
 'An obliterated corner is one whose physical monument has been destroyed but whose position can be recovered from evidence (witness marks, measurements to accessories, testimony). A lost corner cannot be recovered by any evidence and must be re-established by proportioning or other methods.',
 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','obliterated-corner']),

-- F16
('The horizontal curve element "T" (tangent distance) is computed as:', 'multiple_choice',
 '["R × sin(Δ/2)","R × tan(Δ/2)","R × cos(Δ/2)","R × Δ / 360"]'::jsonb,
 'R × tan(Δ/2)',
 'Tangent distance T = R × tan(Δ/2), where R is the radius and Δ is the central angle. This is the distance from the PC (or PT) to the PI along the tangent line.',
 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','horizontal-curves']),

-- F17
('A horizontal curve has R = 500 ft and Δ = 40°. The arc length L is:', 'numeric_input',
 '[]'::jsonb,
 '349.07',
 'L = R × Δ (in radians) = 500 × (40 × π/180) = 500 × 0.69813 = 349.07 ft. Or: L = (Δ/360°) × 2πR = (40/360) × 2π(500) = 0.11111 × 3141.59 = 349.07 ft.',
 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','curve-length']),

-- F18
('The TBPELS minimum standard for a Category 1A boundary survey requires a relative precision of at least:', 'multiple_choice',
 '["1:5,000","1:10,000","1:15,000","1:50,000"]'::jsonb,
 '1:10,000',
 'TBPELS Category 1A (most land surveys in rural areas) requires 1:10,000 minimum precision. Category 1B (urban) requires 1:15,000. Higher categories (2, 3, 4) have progressively stricter requirements.',
 'hard', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','TBPELS-standards']),

-- F19
('A retracement survey follows the principle of:', 'multiple_choice',
 '["Creating a new boundary layout","Following in the footsteps of the original surveyor","Ignoring all existing monuments","Using only GPS measurements"]'::jsonb,
 'Following in the footsteps of the original surveyor',
 'In a retracement survey, the surveyor''s role is to recover and re-establish the original boundary as it was laid out by the original surveyor. The retracing surveyor should follow the same procedures and seek the same evidence the original surveyor used.',
 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','retracement']),

-- F20
('Perform a complete compass rule adjustment for a 3-sided traverse with the following data after angle balancing: Side AB: Azimuth 45°, Distance 400 ft; Side BC: Azimuth 135°, Distance 300 ft; Side CA: Azimuth 255°, Distance 500 ft. Compute latitudes, departures, error of closure, relative precision, and adjusted coordinates starting from A(5000, 5000).', 'essay',
 '[]'::jsonb,
 'Lat/Dep for each side, compute ΣLat and ΣDep, error of closure, relative precision, compass rule corrections, adjusted coordinates',
 'AB: Lat = 400cos45° = 282.84, Dep = 400sin45° = 282.84. BC: Lat = 300cos135° = -212.13, Dep = 300sin135° = 212.13. CA: Lat = 500cos255° = -129.41, Dep = 500sin255° = -482.96. ΣLat = 282.84 - 212.13 - 129.41 = -58.70 (misclosure). ΣDep = 282.84 + 212.13 - 482.96 = 12.01. Error = sqrt(58.70² + 12.01²). Note: This problem is designed to test the complete process. Students should compute all latitudes and departures, find the misclosure, compute error of closure and relative precision, apply compass rule corrections proportional to leg distance, and derive adjusted coordinates from A(5000, 5000).',
 'hard', 'acc00003-0000-0000-0000-000000000003', 'acc03b16-0000-0000-0000-000000000001', 'ACC-1341-FINAL', ARRAY['acc-srvy-1341','final-exam','traverse-adjustment','essay']);


COMMIT;
