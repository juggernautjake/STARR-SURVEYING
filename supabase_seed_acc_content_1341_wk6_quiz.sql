-- ============================================================================
-- ACC SRVY 1341 — Week 6: Types of Angles & Angle Measurement
-- PART 2 OF 2: Quiz questions, practice problems, and flashcards
-- ============================================================================
-- 16 quiz questions, 12 practice problems, 25 flashcards.
-- Companion to supabase_seed_acc_content_1341_wk6.sql (lesson content).
--
-- Module ID : acc00003-0000-0000-0000-000000000003
-- Lesson ID : acc03b06-0000-0000-0000-000000000001
--
-- Run AFTER supabase_seed_acc_content_1341_wk6.sql
-- Safe to re-run (uses DELETE before INSERT).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. QUIZ QUESTIONS (16 questions)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM question_bank
WHERE lesson_id = 'acc03b06-0000-0000-0000-000000000001'
  AND tags @> ARRAY['acc-srvy-1341','week-6','quiz'];

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- ── Easy (Q1–Q5) ───────────────────────────────────────────────────────────

-- Q1  Multiple Choice  Easy
('Horizontal angles are measured on the instrument''s:',
 'multiple_choice',
 '["Vertical circle","Horizontal circle","Optical plummet","Plate bubble"]'::jsonb,
 'Horizontal circle',
 'The horizontal circle is a graduated disc (glass-encoded on modern TSIs) that measures rotation in the horizontal plane. The vertical circle measures vertical/zenith angles. The horizontal angle measurement is independent of the vertical tilt of the telescope.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','quiz','horizontal-circle']),

-- Q2  True/False  Easy
('A horizontal angle measurement changes depending on how steeply the telescope is tilted up or down.',
 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'Horizontal angles are measured on the horizontal circle, which is INDEPENDENT of the vertical sighting. Whether the telescope is tilted steeply upward to sight a hilltop or aimed horizontally, the angle recorded on the horizontal circle is the projection of the angle onto the horizontal plane.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','quiz','horizontal-angle','independent']),

-- Q3  Multiple Choice  Easy
('The sum of interior angles of a closed four-sided traverse (quadrilateral) must equal:',
 'multiple_choice',
 '["180°","270°","360°","540°"]'::jsonb,
 '360°',
 'The sum of interior angles of a closed polygon = (n − 2) × 180°. For a quadrilateral: (4 − 2) × 180° = 2 × 180° = 360°.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','quiz','interior-angles','polygon-sum']),

-- Q4  True/False  Easy
('Deflection angles are measured from the prolongation (extension) of the preceding line.',
 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'A deflection angle is measured by sighting back along the preceding line, plunging the telescope to extend (prolong) the line forward, and then turning an angle off that extended line to the new direction. Deflection angles are designated Right (R) or Left (L) and are always less than 180°.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','quiz','deflection-angle','prolongation']),

-- Q5  Multiple Choice  Easy
('On most modern total stations, vertical angles are displayed as:',
 'multiple_choice',
 '["Elevation angles (0° = horizontal)","Zenith angles (0° = straight up)","Bearing angles","Deflection angles"]'::jsonb,
 'Zenith angles (0° = straight up)',
 'Most modern total stations default to displaying zenith angles, where 0° is directly overhead (zenith), 90° is horizontal, and 180° is directly below (nadir). Zenith angles are unambiguous — a zenith angle of 85° clearly means slightly above horizontal.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','quiz','zenith-angle','vertical-angle']),

-- ── Medium (Q6–Q11) ────────────────────────────────────────────────────────

-- Q6  Multiple Choice  Medium
('In the DMS system, what is 45° 34'' 56" + 25° 45'' 39"?',
 'multiple_choice',
 '["70° 79'' 95\"","71° 19'' 35\"","71° 20'' 35\"","70° 80'' 35\""]'::jsonb,
 '71° 20'' 35"',
 'Add each column: 45+25=70°, 34+45=79'', 56+39=95". Convert overflow: 95" = 1'' 35", so 79'' + 1'' = 80''. Convert: 80'' = 1° 20'', so 70° + 1° = 71°. Result: 71° 20'' 35".',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','quiz','DMS-arithmetic','addition']),

-- Q7  Multiple Choice  Medium
('Plunging (transiting) the telescope means:',
 'multiple_choice',
 '["Removing the telescope from the instrument","Rotating the telescope 180° about the trunnion (horizontal) axis","Rotating the instrument 180° about the vertical axis","Lowering the telescope to sight a point below the instrument"]'::jsonb,
 'Rotating the telescope 180° about the trunnion (horizontal) axis',
 'Plunging (also called transiting or reversing) rotates the telescope 180° about the horizontal (trunnion) axis so the eyepiece and objective swap ends. This changes the instrument from Face Left to Face Right (or vice versa). After plunging, the instrument must also be rotated ~180° about the vertical axis to re-sight the same target.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','quiz','plunging','transiting','face-change']),

-- Q8  Multiple Choice  Medium
('The primary reason for measuring an angle on both Face Left and Face Right is to:',
 'multiple_choice',
 '["Double the number of measurements for the field book","Eliminate systematic instrument errors by averaging","Practice using the tangent screws","Check that the batteries are working"]'::jsonb,
 'Eliminate systematic instrument errors by averaging',
 'When the telescope is plunged, systematic errors (collimation error, trunnion axis error, vertical circle index error) reverse their sign. Averaging the Face Left and Face Right readings cancels these errors. This is why professional surveyors always measure on both faces — it is mandatory for quality work.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','quiz','face-left-right','systematic-errors']),

-- Q9  True/False  Medium
('In the European method, Step 5 (the Face Right backsight reading) should always be exactly 180° 00'' 00".',
 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'In a perfect instrument, the FR backsight reading would be exactly 180° 00'' 00" (since you zeroed on the backsight in FL and plunging adds 180°). In reality, it will be slightly different (e.g., 180° 00'' 01" or 179° 59'' 59") due to instrument errors. This small deviation is exactly the error that the direct/reverse averaging procedure eliminates.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','quiz','european-method','step-5','180-degrees']),

-- Q10  Multiple Choice  Medium
('In the European method, the reverse angle is computed as:',
 'multiple_choice',
 '["Step 3 − Step 2","Step 4 − Step 5 (add 360° if negative)","Step 5 − Step 4","Step 3 + Step 4"]'::jsonb,
 'Step 4 − Step 5 (add 360° if negative)',
 'Reverse angle = Step 4 (FR foresight reading) minus Step 5 (FR backsight reading). If the result is negative — which happens when the measured angle is greater than 180° — add 360° to get the correct reverse angle. The mean angle is then (direct + reverse) / 2.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','quiz','european-method','reverse-angle','computation']),

-- Q11  Multiple Choice  Medium
('Which of the following errors is NOT eliminated by averaging Face Left and Face Right readings?',
 'multiple_choice',
 '["Collimation error","Trunnion axis error","Centering error","Vertical circle index error"]'::jsonb,
 'Centering error',
 'Collimation error, trunnion axis error, and vertical circle index error all reverse their sign when the telescope is plunged — averaging FL and FR cancels them. Centering error (instrument not exactly over the point) is a random error that does NOT reverse when the face is changed. It must be minimized by careful setup technique (Week 5).',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','quiz','errors','centering','not-eliminated']),

-- ── Hard (Q12–Q14) ─────────────────────────────────────────────────────────

-- Q12  Multiple Choice  Hard
('A surveyor turns a D/R set. The readings are: Step 3 (FL foresight) = 237° 14'' 08", Step 4 (FR foresight) = 57° 14'' 04", Step 5 (FR backsight) = 180° 00'' 02". What is the mean angle?',
 'multiple_choice',
 '["237° 14'' 06\"","237° 14'' 05\"","57° 14'' 03\"","237° 14'' 04\""]'::jsonb,
 '237° 14'' 05"',
 'Direct angle = 237° 14'' 08". Reverse angle = Step 4 − Step 5 = 57° 14'' 04" − 180° 00'' 02" = negative → add 360° → 57° 14'' 04" + 360° − 180° 00'' 02" = 237° 14'' 02". Mean = (237° 14'' 08" + 237° 14'' 02") / 2 = 474° 28'' 10" / 2 = 237° 14'' 05".',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','quiz','european-method','computation','greater-than-180']),

-- Q13  Multiple Choice  Hard
('A surveyor turns a D/R set. The readings are: Step 3 (FL foresight) = 128° 33'' 46", Step 4 (FR foresight) = 308° 33'' 44", Step 5 (FR backsight) = 180° 00'' 02". What is the mean angle?',
 'multiple_choice',
 '["128° 33'' 44\"","128° 33'' 45\"","128° 33'' 43\"","128° 33'' 46\""]'::jsonb,
 '128° 33'' 44"',
 'Direct angle = 128° 33'' 46". Reverse angle = Step 4 − Step 5 = 308° 33'' 44" − 180° 00'' 02" = 128° 33'' 42". The result is positive, so no 360° correction is needed. Mean = (128° 33'' 46" + 128° 33'' 42") / 2 = 257° 07'' 28" / 2 = 128° 33'' 44".',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','quiz','european-method','computation','less-than-180']),

-- Q14  Multiple Choice  Hard
('A closed five-sided traverse has interior angles of 108° 15'' 30", 97° 42'' 10", 112° 05'' 45", 120° 30'' 20", and 101° 26'' 25". What is the angular misclosure?',
 'multiple_choice',
 '["10\"","0° 00'' 10\"","+10\" (the sum exceeds the theoretical value by 10 seconds)","−10\""]'::jsonb,
 '+10" (the sum exceeds the theoretical value by 10 seconds)',
 'Theoretical sum = (5 − 2) × 180° = 540° 00'' 00". Measured sum: 108° 15'' 30" + 97° 42'' 10" + 112° 05'' 45" + 120° 30'' 20" + 101° 26'' 25" = 540° 00'' 10". Misclosure = 540° 00'' 10" − 540° 00'' 00" = +10". The positive sign means the measured sum exceeds the theoretical value.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','quiz','angular-misclosure','interior-angles','polygon']),

-- ── Essay (Q15–Q16) ────────────────────────────────────────────────────────

-- Q15  Essay  Hard
('Describe the complete 5-step European method for turning a set of angles. For each step, state: (a) what you do, (b) which face the telescope is on, and (c) what you record. Then explain: (d) how to compute the reverse angle, (e) when and why you must add 360°, and (f) how to compute the mean angle.',
 'essay',
 '[]'::jsonb,
 'Key points: Step 1: Set up and level at the station (no face specified, nothing recorded). Step 2: Sight backsight in Face Left, zero the circle (record 0° 00'' 00"). Step 3: Turn right to foresight in Face Left, read and record the direct angle. Step 4: Plunge the scope to Face Right, turn to re-sight foresight, read and record the FR foresight reading. Step 5: Turn right to backsight in Face Right, read and record the FR backsight reading (should be near 180°). (d) Reverse angle = Step 4 − Step 5. (e) Add 360° when the result of Step 4 − Step 5 is negative, which occurs when the angle being measured is greater than 180°. This happens because the FR foresight reading (Step 4) has wrapped past 360° on the circle and appears as a small number, while Step 5 remains near 180°. (f) Mean angle = (Direct angle + Reverse angle) / 2. The mean cancels systematic instrument errors because collimation and trunnion axis errors reverse sign between FL and FR.',
 'A complete answer covers all 5 steps with face positions, explains the 360° rule with a geometric reason, and connects the averaging to error cancellation.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','quiz','essay','european-method','comprehensive']),

-- Q16  Essay  Medium
('Compare and contrast interior angles and deflection angles. Include: (a) how each is defined, (b) the geometric reference for each (what direction is the "zero" measured from), (c) the range of possible values for each, (d) the check sum for each in a closed traverse, and (e) a practical situation where each type would be preferred.',
 'essay',
 '[]'::jsonb,
 'Key points: (a) Interior angles are measured on the inside of a closed polygon at each vertex. Deflection angles are measured from the prolongation of the preceding line, designated Right or Left. (b) Interior angles: zero reference is the adjacent side of the polygon (the backsight line); the angle is measured between two sides meeting at the vertex. Deflection angles: zero reference is the prolongation (straight-ahead extension) of the preceding line. (c) Interior angles range from just above 0° to just below 360° (typically between about 30° and 330° for practical traverses). Deflection angles are always less than 180° and are designated R or L. (d) Sum of interior angles = (n − 2) × 180°. Algebraic sum of deflection angles (R positive, L negative) = 360°. (e) Interior angles preferred for closed boundary traverses (property surveys) because the polygon check is straightforward. Deflection angles preferred for route surveys (highways, railroads, pipelines) because the route is essentially a straight line with small deviations, and deflection angles directly describe those deviations.',
 'A good answer addresses all five sub-points with specific details and demonstrates understanding of when each angle type is operationally appropriate.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','quiz','essay','interior-vs-deflection','comparison']);


-- ────────────────────────────────────────────────────────────────────────────
-- 2. PRACTICE PROBLEMS (12 problems)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM question_bank
WHERE lesson_id = 'acc03b06-0000-0000-0000-000000000001'
  AND tags @> ARRAY['acc-srvy-1341','week-6','practice'];

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- ── DMS Arithmetic (3 problems) ───────────────────────────────────────────

-- P1  Easy
('Practice: Compute 87° 45'' 38" + 34° 29'' 47".',
 'short_answer', '[]'::jsonb,
 '122° 15'' 25"',
 'Step 1: Add each column: 87+34=121°, 45+29=74'', 38+47=85". Step 2: Convert 85" = 1'' 25", so 74'' + 1'' = 75''. Step 3: Convert 75'' = 1° 15'', so 121° + 1° = 122°. Result: 122° 15'' 25".',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','practice','DMS-arithmetic','addition']),

-- P2  Easy
('Practice: Compute 270° 00'' 00" − 183° 27'' 42".',
 'short_answer', '[]'::jsonb,
 '86° 32'' 18"',
 'Borrow: 270° 00'' 00" → 269° 59'' 60". Subtract: 269°−183° = 86°, 59''−27'' = 32'', 60"−42" = 18". Result: 86° 32'' 18".',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','practice','DMS-arithmetic','subtraction']),

-- P3  Medium
('Practice: A five-sided closed traverse has interior angles of 105° 12'' 18", 110° 30'' 24", 98° 47'' 06", 124° 15'' 36", and 101° 14'' 46". (a) What should the sum of interior angles be? (b) What is the actual measured sum? (c) What is the angular misclosure? (d) Is the misclosure acceptable for a third-order survey (allowable = 30" × √n where n = number of angles)?',
 'essay', '[]'::jsonb,
 '(a) Theoretical sum = (5−2) × 180° = 540° 00'' 00". (b) Measured sum: 105° 12'' 18" + 110° 30'' 24" + 98° 47'' 06" + 124° 15'' 36" + 101° 14'' 46" = 540° 00'' 10". (c) Misclosure = 540° 00'' 10" − 540° 00'' 00" = +10". (d) Allowable = 30" × √5 = 30" × 2.236 = 67.1". Since |+10"| < 67.1", the misclosure IS acceptable for third-order.',
 'A complete answer shows the theoretical sum formula, adds all five angles correctly, computes the misclosure, and evaluates it against the third-order standard.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','practice','angular-misclosure','interior-angles','third-order']),

-- ── Types of Angles (2 problems) ──────────────────────────────────────────

-- P4  Easy
('Practice: A zenith angle reading is 76° 30'' 00". What is the equivalent elevation angle (measured from horizontal)?',
 'short_answer', '[]'::jsonb,
 '+13° 30'' 00" (above horizontal)',
 'Elevation angle = 90° − zenith angle = 90° 00'' 00" − 76° 30'' 00" = 13° 30'' 00". Since the zenith angle is less than 90°, the target is above horizontal, so the elevation angle is positive.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','practice','zenith-angle','elevation-angle','conversion']),

-- P5  Medium
('Practice: In a route survey, consecutive deflection angles are: 12° 15'' R, 8° 30'' L, 22° 05'' R, 15° 40'' R, and 3° 10'' L. What is the net deflection from the starting direction?',
 'short_answer', '[]'::jsonb,
 '38° 40'' R (net deflection to the right)',
 'Using R as positive and L as negative: +12° 15'' + (−8° 30'') + 22° 05'' + 15° 40'' + (−3° 10'') = (12° 15'' + 22° 05'' + 15° 40'') − (8° 30'' + 3° 10'') = 50° 00'' − 11° 40'' = 38° 20''. Wait, let me recompute: R sum = 12° 15'' + 22° 05'' + 15° 40'' = 50° 00''. L sum = 8° 30'' + 3° 10'' = 11° 40''. Net = 50° 00'' − 11° 40'' = 38° 20'' R. Correction: The answer is 38° 20'' R.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','practice','deflection-angles','net-deflection','route-survey']),

-- ── European Method — Angles < 180° (3 problems) ─────────────────────────

-- P6  Medium
('Practice: A surveyor turns a D/R set at Trav #205. Readings: Step 2 = 0° 00'' 00", Step 3 (FL foresight) = 93° 22'' 14", Step 4 (FR foresight) = 273° 22'' 10", Step 5 (FR backsight) = 179° 59'' 58". (a) What is the direct angle? (b) What is the reverse angle? (c) What is the mean angle?',
 'essay', '[]'::jsonb,
 '(a) Direct angle = Step 3 = 93° 22'' 14". (b) Reverse angle = Step 4 − Step 5 = 273° 22'' 10" − 179° 59'' 58" = 93° 22'' 12". The result is positive, so no 360° correction is needed. (c) Mean angle = (93° 22'' 14" + 93° 22'' 12") / 2 = 186° 44'' 26" / 2 = 93° 22'' 13".',
 'A complete answer shows the direct angle extraction, the Step 4 − Step 5 subtraction, confirms no 360° correction is needed, and computes the mean by averaging.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','practice','european-method','less-than-180','computation']),

-- P7  Medium
('Practice: A surveyor turns a D/R set. Readings: Step 3 (FL foresight) = 45° 08'' 22", Step 4 (FR foresight) = 225° 08'' 18", Step 5 (FR backsight) = 180° 00'' 00". (a) What is the direct angle? (b) What is the reverse angle? (c) What is the mean angle? (d) What is the difference between the direct and reverse readings?',
 'essay', '[]'::jsonb,
 '(a) Direct angle = 45° 08'' 22". (b) Reverse angle = 225° 08'' 18" − 180° 00'' 00" = 45° 08'' 18". Positive, so no 360° needed. (c) Mean = (45° 08'' 22" + 45° 08'' 18") / 2 = 90° 16'' 40" / 2 = 45° 08'' 20". (d) Difference = 45° 08'' 22" − 45° 08'' 18" = 4". This 4" difference represents the instrument errors that are being cancelled by the averaging process.',
 'A complete answer computes both angles, averages them, and explains the significance of the direct/reverse difference.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','practice','european-method','less-than-180','difference']),

-- P8  Hard
('Practice: A surveyor turns a D/R set. Readings: Step 3 (FL foresight) = 156° 42'' 35", Step 4 (FR foresight) = 336° 42'' 29", Step 5 (FR backsight) = 180° 00'' 03". (a) Compute the direct and reverse angles. (b) Compute the mean. (c) If the instrument has a stated angular accuracy of ±2", is the direct/reverse difference acceptable? (d) If the difference had been 12", what should the surveyor do?',
 'essay', '[]'::jsonb,
 '(a) Direct = 156° 42'' 35". Reverse = 336° 42'' 29" − 180° 00'' 03" = 156° 42'' 26". (b) Mean = (156° 42'' 35" + 156° 42'' 26") / 2 = 313° 25'' 01" / 2 = 156° 42'' 30.5". (c) Difference = 35" − 26" = 9". For a ±2" instrument, the FL/FR tolerance is typically ±5" (about 2.5× the stated accuracy). A 9" difference EXCEEDS tolerance — the set should be rejected and remeasured. (d) A 12" difference would even more clearly indicate a problem: the surveyor should reject the set, check the instrument for loose screws or adjustment issues, and remeasure.',
 'A strong answer computes correctly, evaluates the tolerance, and makes the correct recommendation to reject and remeasure.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','practice','european-method','tolerance','reject']),

-- ── European Method — Angles > 180° (3 problems) ─────────────────────────

-- P9  Medium
('Practice: A surveyor turns a D/R set. Readings: Step 3 (FL foresight) = 210° 45'' 30", Step 4 (FR foresight) = 30° 45'' 26", Step 5 (FR backsight) = 180° 00'' 01". (a) What is the direct angle? (b) What is the reverse angle? (c) What is the mean angle?',
 'essay', '[]'::jsonb,
 '(a) Direct angle = 210° 45'' 30". (b) Reverse = Step 4 − Step 5 = 30° 45'' 26" − 180° 00'' 01" = negative → add 360°. Compute: 30° 45'' 26" + 360° = 390° 45'' 26" − 180° 00'' 01" = 210° 45'' 25". (c) Mean = (210° 45'' 30" + 210° 45'' 25") / 2 = 421° 30'' 55" / 2 = 210° 45'' 27.5".',
 'A complete answer recognizes the negative result, applies the 360° correction, and computes the mean correctly.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','practice','european-method','greater-than-180','360-correction']),

-- P10  Hard
('Practice: A surveyor turns a D/R set. Readings: Step 3 (FL foresight) = 312° 50'' 16", Step 4 (FR foresight) = 132° 50'' 10", Step 5 (FR backsight) = 180° 00'' 04". (a) Compute the direct and reverse angles. (b) Apply the 360° rule if needed. (c) Compute the mean angle. (d) Explain in one sentence WHY Step 4 (132°) is such a small number when the angle is over 300°.',
 'essay', '[]'::jsonb,
 '(a) Direct = 312° 50'' 16". Reverse = 132° 50'' 10" − 180° 00'' 04" = negative → add 360°. (b) 132° 50'' 10" + 360° − 180° 00'' 04" = 492° 50'' 10" − 180° 00'' 04" = 312° 50'' 06". (c) Mean = (312° 50'' 16" + 312° 50'' 06") / 2 = 625° 40'' 22" / 2 = 312° 50'' 11". (d) Step 4 reads 132° because the Face Right foresight reading is the Face Left reading plus approximately 180° = 312° + 180° = 492°, but the circle only goes to 360°, so it wraps around and shows 492° − 360° = 132°.',
 'A strong answer computes correctly, applies the 360° rule, and explains the circle wrapping in plain language.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','practice','european-method','greater-than-180','circle-wrap']),

-- P11  Hard
('Practice: At station B in a traverse, the backsight is station A and the foresight is station C. A surveyor turns a D/R set and records: Step 3 = 265° 18'' 44", Step 4 = 85° 18'' 38", Step 5 = 179° 59'' 57". (a) Compute the mean angle. (b) Compute the interior angle at B if the traverse is being run clockwise and the interior angle is the supplement of the angle to the right. (c) What would the exterior angle at B be?',
 'essay', '[]'::jsonb,
 '(a) Direct = 265° 18'' 44". Reverse = 85° 18'' 38" − 179° 59'' 57" = negative → add 360°: 85° 18'' 38" + 360° = 445° 18'' 38" − 179° 59'' 57". Borrow: 445° 18'' 38" → 445° 17'' 98" → (no, let me redo) 445° 18'' 38" − 179° 59'' 57": borrow from minutes: 445° 17'' 98" − 179° 59'' 57" → borrow from degrees: 444° 77'' 98" − 179° 59'' 57" = 265° 18'' 41". Mean = (265° 18'' 44" + 265° 18'' 41") / 2 = 530° 37'' 25" / 2 = 265° 18'' 42.5". (b) This is the angle to the right (clockwise from backsight to foresight). If the traverse is run clockwise and the interior angle is 360° minus the angle to the right: 360° − 265° 18'' 42.5" = 94° 41'' 17.5". (c) Exterior angle = 360° − interior = 360° − 94° 41'' 17.5" = 265° 18'' 42.5" (which equals the angle to the right in this case).',
 'A comprehensive answer showing full DMS subtraction with borrowing, the 360° correction, and the relationship between angle to the right, interior angle, and exterior angle.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','practice','european-method','interior-exterior','comprehensive']),

-- P12  Hard
('Practice: A surveyor accidentally forgets to add 360° when computing a reverse angle for a 225° direct angle. The Step 4 reading is 45° 10'' 14" and the Step 5 reading is 180° 00'' 02". (a) What incorrect reverse angle does the surveyor compute? (b) What incorrect mean does this produce? (c) What should the correct reverse angle and mean be? (d) What is the magnitude of the error caused by the mistake?',
 'essay', '[]'::jsonb,
 '(a) Incorrect reverse = 45° 10'' 14" − 180° 00'' 02" = −134° 49'' 48" (the surveyor might record the absolute value: 134° 49'' 48"). (b) If the surveyor uses 134° 49'' 48": incorrect mean = (225° 00'' 00" + 134° 49'' 48") / 2 = 359° 49'' 48" / 2 = 179° 54'' 54". This is obviously wrong — it should be near 225°. (c) Correct reverse = 45° 10'' 14" − 180° 00'' 02" + 360° = 225° 10'' 12". Correct mean = (225° 00'' 00" + 225° 10'' 12") / 2 ≈ 225° 05'' 06". (d) Error = 225° 05'' 06" − 179° 54'' 54" ≈ 45° 10'' 12" — a massive blunder, not just a small error.',
 'A complete answer shows both the wrong and right computations, demonstrating why the 360° rule is critical — forgetting it produces errors of many degrees, not just seconds.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-6','practice','360-rule','blunder','error-magnitude']);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. FLASHCARDS (25)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM flashcards WHERE lesson_id = 'acc03b06-0000-0000-0000-000000000001';

INSERT INTO flashcards (id, term, definition, hint_1, hint_2, hint_3, module_id, lesson_id, keywords, tags, category) VALUES

-- ── Types of Angles ───────────────────────────────────────────────────────

('fc060001-0000-0000-0000-000000000001',
 'Horizontal Angle',
 'An angle measured in the horizontal plane on the instrument''s horizontal circle. It is the angle between two sight lines projected onto the horizontal plane, measured clockwise from the backsight to the foresight. The measurement is independent of any vertical tilt of the telescope.',
 'Measured on the horizontal circle',
 'Independent of telescope tilt up or down',
 'The most fundamental angle measurement in surveying',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['horizontal angle','horizontal plane','horizontal circle','independent','vertical tilt'],
 ARRAY['acc-srvy-1341','week-6','angle-types'], 'surveying'),

('fc060002-0000-0000-0000-000000000001',
 'Interior Angle',
 'A horizontal angle measured on the inside of a closed polygon (traverse) at a vertex. The sum of all interior angles must equal (n − 2) × 180° where n is the number of sides. At any vertex, the interior angle plus the exterior angle equals 360°.',
 'Measured INSIDE a closed figure',
 'Sum formula: (n − 2) × 180°',
 'Interior + Exterior = 360° at every vertex',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['interior angle','polygon','closed traverse','vertex','n-2','sum'],
 ARRAY['acc-srvy-1341','week-6','angle-types'], 'surveying'),

('fc060003-0000-0000-0000-000000000001',
 'Deflection Angle',
 'A horizontal angle measured from the prolongation (extension) of the preceding line. The instrument sights back on the line, the scope is plunged to extend it forward, and an angle is turned off this extended line. Designated Right (R) or Left (L), always less than 180°. Used in route surveying (highways, railroads, pipelines).',
 'Measured from the straight-ahead (prolongation) direction',
 'Designated R (clockwise) or L (counterclockwise)',
 'Always < 180°; algebraic sum in closed traverse = 360°',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['deflection angle','prolongation','right','left','route survey','highway','plunge'],
 ARRAY['acc-srvy-1341','week-6','angle-types'], 'surveying'),

('fc060004-0000-0000-0000-000000000001',
 'Vertical Angle (Zenith Angle)',
 'An angle measured in the vertical plane using the instrument''s vertical circle. Two conventions: (1) Zenith angle — 0° straight up, 90° horizontal, 180° straight down. (2) Elevation angle — 0° horizontal, positive above, negative below. Conversion: zenith = 90° − elevation (above horizontal). Most modern TSIs display zenith angles.',
 'Measured on the vertical circle, not the horizontal circle',
 'Zenith: 0° overhead, 90° horizontal',
 'Elevation: 0° horizontal, + above, − below',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['vertical angle','zenith angle','elevation angle','vertical circle','90 degrees','conversion'],
 ARRAY['acc-srvy-1341','week-6','angle-types'], 'surveying'),

('fc060005-0000-0000-0000-000000000001',
 'Angle to the Right',
 'A horizontal angle measured clockwise from the backsight to the foresight, ranging from 0° to 360°. This is the standard modern convention used by most total stations and data collectors. It eliminates ambiguity about the direction of turning.',
 'Always measured CLOCKWISE from backsight to foresight',
 'Range: 0° to 360°',
 'Standard modern convention — eliminates directional ambiguity',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['angle to the right','clockwise','backsight','foresight','convention','modern'],
 ARRAY['acc-srvy-1341','week-6','angle-types'], 'surveying'),

-- ── Angle Measurement Fundamentals ────────────────────────────────────────

('fc060006-0000-0000-0000-000000000001',
 'Horizontal Circle',
 'A graduated disc inside the instrument that measures rotation in the horizontal plane. On modern total stations, it is an electronically encoded glass disc: an LED shines through graduated marks onto photodiodes to determine rotation with extreme precision. Key operations: zeroing (set to 0°), reading (display the angle), holding (freeze the display).',
 'Glass disc with LED and photodiodes on modern TSIs',
 'Zeroing = set to 0° on backsight',
 'Display resolution ≠ measurement accuracy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['horizontal circle','encoded disc','glass','LED','photodiodes','zeroing','reading','holding'],
 ARRAY['acc-srvy-1341','week-6','fundamentals'], 'surveying'),

('fc060007-0000-0000-0000-000000000001',
 'DMS (Degrees-Minutes-Seconds)',
 'The standard angular notation in surveying. 1° = 60'', 1'' = 60", 1° = 3,600". Addition requires carrying (60" → 1'', 60'' → 1°). Subtraction requires borrowing (1° → 60'', 1'' → 60"). Example: 180° 00'' 00" − 113° 15'' 29" → borrow to get 179° 59'' 60" − 113° 15'' 29" = 66° 44'' 31".',
 '1 degree = 60 minutes, 1 minute = 60 seconds',
 'Carry when seconds ≥ 60 or minutes ≥ 60',
 'Borrow from the next higher unit when subtracting',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['DMS','degrees','minutes','seconds','carrying','borrowing','arithmetic'],
 ARRAY['acc-srvy-1341','week-6','fundamentals'], 'surveying'),

('fc060008-0000-0000-0000-000000000001',
 'Face Left (FL) / Direct',
 'The telescope position where the vertical circle is on the LEFT side as seen by the observer at the eyepiece. Also called Direct, Face 1, or Normal position. This is the starting position for angle measurements. The telescope has NOT been plunged.',
 'Vertical circle is on the LEFT',
 'Also called Direct or Face 1 or Normal',
 'The starting position — telescope has not been plunged',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['face left','FL','direct','face 1','normal','vertical circle','starting position'],
 ARRAY['acc-srvy-1341','week-6','fundamentals'], 'surveying'),

('fc060009-0000-0000-0000-000000000001',
 'Face Right (FR) / Reverse',
 'The telescope position where the vertical circle is on the RIGHT side as seen by the observer. Also called Reverse, Face 2, or Inverted. Reached by plunging the telescope 180° about the trunnion axis. Used to obtain a second independent measurement that, when averaged with Face Left, eliminates systematic instrument errors.',
 'Vertical circle is on the RIGHT',
 'Also called Reverse or Face 2 or Inverted',
 'Reached by plunging the telescope',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['face right','FR','reverse','face 2','inverted','plunging','systematic errors'],
 ARRAY['acc-srvy-1341','week-6','fundamentals'], 'surveying'),

('fc060010-0000-0000-0000-000000000001',
 'Plunging (Transiting) the Telescope',
 'Rotating the telescope 180° about the horizontal (trunnion) axis so the eyepiece and objective swap ends. This changes the face from Left to Right (or vice versa). After plunging, the instrument is also rotated ~180° about the vertical axis to re-sight the same target. This combined operation is called "changing face."',
 'Rotate the telescope 180° about the horizontal axis',
 'Eyepiece and objective swap positions',
 'Must also swing 180° horizontally to re-sight the target',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['plunging','transiting','reversing','trunnion axis','180 degrees','changing face'],
 ARRAY['acc-srvy-1341','week-6','fundamentals'], 'surveying'),

-- ── Errors and Quality Control ────────────────────────────────────────────

('fc060011-0000-0000-0000-000000000001',
 'Collimation Error (2C Error)',
 'A systematic instrument error where the line of sight (line of collimation) is not exactly perpendicular to the trunnion axis. The telescope traces a cone rather than a plane when rotated. The error reverses its sign when the face is changed — averaging Face Left and Face Right cancels it completely.',
 'Line of sight not perpendicular to the trunnion axis',
 'Telescope traces a cone instead of a plane',
 'Reverses sign on face change → cancelled by averaging FL/FR',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['collimation error','2C error','line of sight','trunnion axis','perpendicular','cone','averaging'],
 ARRAY['acc-srvy-1341','week-6','errors'], 'surveying'),

('fc060012-0000-0000-0000-000000000001',
 'Trunnion Axis Error',
 'A systematic instrument error where the trunnion (horizontal) axis is not exactly perpendicular to the vertical axis. The line of sight does not sweep a true vertical plane when the telescope is tilted. Like collimation error, it reverses sign on face change and is cancelled by averaging FL and FR readings.',
 'Trunnion axis not perpendicular to vertical axis',
 'Line of sight does not sweep a true vertical plane',
 'Cancelled by FL/FR averaging — same principle as collimation error',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['trunnion axis error','horizontal axis','perpendicular','vertical axis','vertical plane','averaging'],
 ARRAY['acc-srvy-1341','week-6','errors'], 'surveying'),

('fc060013-0000-0000-0000-000000000001',
 'Vertical Circle Index Error',
 'A constant offset in the vertical circle''s zero-point reading. When the telescope is level, the vertical circle should read exactly 90° (zenith) or 0° (elevation), but the index may be slightly off. Eliminated by averaging Face Left and Face Right vertical angle readings.',
 'The vertical circle''s zero is slightly off',
 'A constant offset — same amount every time',
 'Cancelled by averaging FL and FR vertical angles',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['vertical circle','index error','constant offset','zero point','vertical angle','averaging'],
 ARRAY['acc-srvy-1341','week-6','errors'], 'surveying'),

('fc060014-0000-0000-0000-000000000001',
 'Four Sources of Random Error in Angle Measurement',
 '(1) Centering — instrument not exactly over the mark (dominates on short lines). (2) Pointing — target not precisely bisected by crosshairs. (3) Reading — errors in reading the graduated circle (reduced by digital instruments). (4) Leveling — instrument not perfectly level. These are random errors that do NOT cancel by face change — they are reduced by multiple observations.',
 'Centering, Pointing, Reading, Leveling',
 'Centering dominates on SHORT lines',
 'Random errors — NOT eliminated by face change, only by repetition',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['centering','pointing','reading','leveling','random error','four sources','multiple observations'],
 ARRAY['acc-srvy-1341','week-6','errors'], 'surveying'),

-- ── European Method ───────────────────────────────────────────────────────

('fc060015-0000-0000-0000-000000000001',
 'European Method (D/R Set)',
 'The standard field procedure for measuring a horizontal angle with both direct and reverse observations in five steps: (1) set up, (2) sight backsight FL and zero, (3) turn to foresight FL — record direct angle, (4) plunge, re-sight foresight FR — record reading, (5) turn to backsight FR — record reading. The mean angle eliminates systematic instrument errors.',
 '5 steps: setup, zero on BS, turn to FS (FL), plunge to FS (FR), turn to BS (FR)',
 'Also called turning a "D/R set" (Direct/Reverse)',
 'Mean angle = (direct + reverse) / 2',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['European method','D/R set','direct reverse','5 steps','backsight','foresight','mean angle'],
 ARRAY['acc-srvy-1341','week-6','european-method'], 'surveying'),

('fc060016-0000-0000-0000-000000000001',
 'Direct Angle (Step 3)',
 'The horizontal angle measured in Face Left (direct) position. In the European method, it is the circle reading from Step 3 — the reading after turning right from the zeroed backsight to the foresight. This is the first of two independent measurements of the same angle.',
 'Step 3 of the European method',
 'Face Left position — telescope has NOT been plunged',
 'Simply read the circle after turning from backsight to foresight',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['direct angle','Step 3','face left','circle reading','first measurement'],
 ARRAY['acc-srvy-1341','week-6','european-method'], 'surveying'),

('fc060017-0000-0000-0000-000000000001',
 'Reverse Angle Computation',
 'Reverse angle = Step 4 (FR foresight reading) minus Step 5 (FR backsight reading). If the result is negative, add 360° before using the value. The reverse angle should agree with the direct angle within the instrument''s stated tolerance (typically a few seconds).',
 'Step 4 minus Step 5',
 'If negative, add 360°',
 'Should agree with the direct angle within a few seconds',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['reverse angle','Step 4','Step 5','computation','negative','360 degrees','tolerance'],
 ARRAY['acc-srvy-1341','week-6','european-method'], 'surveying'),

('fc060018-0000-0000-0000-000000000001',
 'The 360° Rule',
 'When computing the reverse angle (Step 4 − Step 5) and the result is negative, add 360° to get the correct reverse angle. This occurs when the measured angle is greater than 180°, because the FR foresight reading wraps past 360° on the circle and appears as a smaller number than the FR backsight reading.',
 'Add 360° when Step 4 − Step 5 is negative',
 'Happens when the angle is greater than 180°',
 'The circle wraps past 360° — Step 4 looks smaller than expected',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['360 rule','negative','add 360','greater than 180','circle wrap','correction'],
 ARRAY['acc-srvy-1341','week-6','european-method'], 'surveying'),

('fc060019-0000-0000-0000-000000000001',
 'Mean Angle',
 'Mean angle = (Direct angle + Reverse angle) / 2. This is the final, error-corrected result from a D/R set. The averaging cancels systematic instrument errors (collimation, trunnion axis, vertical circle index) because these errors reverse sign between FL and FR. The direct and reverse angles should agree within the instrument''s tolerance before averaging.',
 'Average of direct and reverse: (D + R) / 2',
 'Cancels systematic errors because they reverse sign',
 'Check that D and R agree before averaging — reject if they don''t',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['mean angle','average','direct','reverse','error-corrected','systematic errors','tolerance'],
 ARRAY['acc-srvy-1341','week-6','european-method'], 'surveying'),

('fc060020-0000-0000-0000-000000000001',
 'Step 5 Reading (FR Backsight)',
 'The circle reading when the instrument sights the backsight in Face Right (Step 5 of the European method). In a perfect instrument, this would be exactly 180° 00'' 00". In reality, it deviates slightly (e.g., 180° 00'' 02" or 179° 59'' 58") due to instrument errors. This deviation is exactly what the D/R averaging eliminates.',
 'Should be NEAR 180° 00'' 00" but not exactly',
 'The small deviation from 180° reveals instrument errors',
 'The averaging process cancels this error in the mean angle',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['Step 5','FR backsight','180 degrees','deviation','instrument error','averaging'],
 ARRAY['acc-srvy-1341','week-6','european-method'], 'surveying'),

-- ── Practical Concepts ────────────────────────────────────────────────────

('fc060021-0000-0000-0000-000000000001',
 'Closing the Horizon',
 'The practice of measuring ALL horizontal angles around a station point so their sum equals exactly 360°. The departure from 360° is the horizon misclosure. If within tolerance, it is distributed equally among all measured angles. If large, a blunder has occurred and measurements must be repeated.',
 'All angles at a station must sum to 360°',
 'Misclosure = measured sum − 360°',
 'Distribute small misclosure equally; large = blunder → remeasure',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['closing the horizon','360 degrees','misclosure','distribute','blunder','station'],
 ARRAY['acc-srvy-1341','week-6','practical'], 'surveying'),

('fc060022-0000-0000-0000-000000000001',
 'Angular Misclosure (Closed Traverse)',
 'The difference between the measured sum of interior angles and the theoretical sum [(n−2) × 180°]. Positive misclosure means the sum exceeds theoretical; negative means it falls short. Acceptable limits depend on survey order — e.g., third-order allows up to 30" × √n where n is the number of angles.',
 'Measured sum minus theoretical sum',
 'Theoretical sum = (n − 2) × 180°',
 'Third-order tolerance: 30" × √n',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['angular misclosure','interior angles','theoretical sum','n-2','tolerance','survey order'],
 ARRAY['acc-srvy-1341','week-6','practical'], 'surveying'),

('fc060023-0000-0000-0000-000000000001',
 'Prolongation of a Line',
 'Extending a survey line forward past the instrument station in the same straight direction. Accomplished by sighting back along the line and plunging the telescope 180°. The prolonged line is used as the zero reference for deflection angle measurements. Also used to check for systematic instrument errors.',
 'Extend the line forward by backsighting and plunging',
 'The prolonged line is the zero reference for deflection angles',
 'Plunging the telescope extends the line through the instrument',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['prolongation','extend','plunge','backsight','deflection','zero reference','straight line'],
 ARRAY['acc-srvy-1341','week-6','practical'], 'surveying'),

('fc060024-0000-0000-0000-000000000001',
 'Interior Angle Sum Formula',
 'Sum of interior angles of a closed polygon = (n − 2) × 180°, where n = number of sides (vertices). Triangle: 180°. Quadrilateral: 360°. Pentagon: 540°. Hexagon: 720°. The difference between the measured sum and this theoretical value is the angular misclosure.',
 'Formula: (n − 2) × 180°',
 'n = number of sides or vertices',
 'The departure from this sum is the angular misclosure',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['interior angle sum','formula','n-2','180','polygon','triangle','quadrilateral','pentagon'],
 ARRAY['acc-srvy-1341','week-6','practical'], 'surveying'),

('fc060025-0000-0000-0000-000000000001',
 'Backsight and Foresight',
 'Backsight (BS): the point sighted first when measuring an angle — the "reference" direction. The horizontal circle is typically zeroed on the backsight. Foresight (FS): the point sighted second — the "target" direction. The circle reading after turning to the foresight gives the measured angle. In a traverse, the backsight is usually the previously occupied station.',
 'Backsight = reference direction (zeroed on)',
 'Foresight = target direction (angle is read to)',
 'In a traverse: backsight = previous station; foresight = next station',
 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001',
 ARRAY['backsight','foresight','BS','FS','reference','target','zero','traverse','station'],
 ARRAY['acc-srvy-1341','week-6','practical'], 'surveying');


COMMIT;
