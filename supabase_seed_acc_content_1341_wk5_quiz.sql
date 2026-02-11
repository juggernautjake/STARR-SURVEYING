-- ============================================================================
-- ACC SRVY 1341 — Week 5: Instrument Leveling & Setup Over a Point
-- PART 2 OF 2: Quiz questions, practice problems, and flashcards
-- ============================================================================
-- 16 quiz questions, 12 practice problems, 25 flashcards.
-- Companion to supabase_seed_acc_content_1341_wk5.sql (lesson content).
--
-- Module ID : acc00003-0000-0000-0000-000000000003
-- Lesson ID : acc03b05-0000-0000-0000-000000000001
--
-- Run AFTER supabase_seed_acc_content_1341_wk5.sql
-- Safe to re-run (uses DELETE before INSERT).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. QUIZ QUESTIONS (16 questions)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM question_bank
WHERE lesson_id = 'acc03b05-0000-0000-0000-000000000001'
  AND tags @> ARRAY['acc-srvy-1341','week-5','quiz'];

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- ── Easy (Q1–Q5) ───────────────────────────────────────────────────────────

-- Q1  Multiple Choice  Easy
('When using two leveling screws simultaneously, the bubble moves in the direction of:',
 'multiple_choice',
 '["The right thumb","The left thumb","The screw that turns fastest","Whichever screw is tightened"]'::jsonb,
 'The left thumb',
 'The left thumb rule states that when two leveling screws are turned simultaneously in opposite directions, the bubble always moves in the direction the left thumb turns. This is the fundamental technique for efficient instrument leveling.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','left-thumb-rule']),

-- Q2  True/False  Easy
('The circular (bull''s-eye) bubble is more sensitive than the plate (tubular) bubble.',
 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'The plate (tubular) bubble is more sensitive and is used for precise leveling. The circular (bull''s-eye) bubble is less sensitive and is used only for rough leveling. The sequence is always: rough-level with the circular bubble first, then fine-level with the plate bubble.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','bubble-types','sensitivity']),

-- Q3  Multiple Choice  Easy
('Before beginning the leveling procedure, all three foot screws should be:',
 'multiple_choice',
 '["Fully tightened","Fully loosened","Set to mid-range (indexed)","Removed from the tribrach"]'::jsonb,
 'Set to mid-range (indexed)',
 'Indexing the screws — setting them to mid-range — ensures maximum adjustment range in both directions (up and down). The midpoint is typically marked by a line on the screw body. Starting at one extreme risks running out of travel before the bubble is centered.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','indexing','foot-screws']),

-- Q4  True/False  Easy
('An optical plummet requires battery power to operate.',
 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'An optical plummet is entirely optical/mechanical — it uses a small telescope with crosshairs that looks straight down through the vertical axis. It requires no power at all. A laser plummet, on the other hand, does require battery power to project its visible laser beam.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','optical-plummet','power']),

-- Q5  Multiple Choice  Easy
('When leveling a three-screw instrument, after centering the bubble over two screws (A and B), the next step is to:',
 'multiple_choice',
 '["Turn all three screws simultaneously","Rotate the instrument 90° toward the third screw","Rotate the instrument 180° and recheck","Tighten the attachment clamp"]'::jsonb,
 'Rotate the instrument 90° toward the third screw',
 'After centering the bubble over two screws, the instrument is rotated 90° so the bubble aligns toward the third screw (C). Then only screw C is adjusted to center the bubble in this new orientation. This two-position approach is the standard systematic procedure.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','leveling-procedure','rotate-90']),

-- ── Medium (Q6–Q11) ────────────────────────────────────────────────────────

-- Q6  Multiple Choice  Medium
('During Step 4 of the three-screw leveling procedure, which screws should you turn?',
 'multiple_choice',
 '["All three screws","Screws A and B only","Screw C only","Whichever screw is closest"]'::jsonb,
 'Screw C only',
 'After rotating 90° to align the bubble toward the third screw (C), you turn ONLY screw C to center the bubble. Touching screws A or B at this point would disturb the level you already established in the A–B direction.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','leveling-procedure','third-screw']),

-- Q7  True/False  Medium
('When sliding the tribrach on the tripod head to center over a point, it is acceptable to rotate the tribrach if needed.',
 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'You must NEVER rotate the tribrach when sliding it on the tripod head. The tripod head surface has minor imperfections. When you slide in a straight line, the base plate maintains approximately the same tilt. When you rotate, different parts of the base plate contact different surface areas, changing the tilt and destroying the established level. You would have to re-level from scratch.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','slide-not-rotate','tribrach']),

-- Q8  Multiple Choice  Medium
('A tribrach contains all of the following EXCEPT:',
 'multiple_choice',
 '["Three leveling foot screws","A circular (bull''s-eye) bubble","An EDM (electronic distance measurement) unit","An optical or laser plummet"]'::jsonb,
 'An EDM (electronic distance measurement) unit',
 'A tribrach contains three leveling foot screws, a circular bubble for rough leveling, an optical or laser plummet for centering, a locking clamp for the instrument, and a 5/8″-11 central mounting screw. The EDM unit is part of the total station instrument itself, not the tribrach.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','tribrach','components']),

-- Q9  Multiple Choice  Medium
('In the 10-step setup procedure, after using the leveling screws to center the optical plummet on the point (Step 3), you should next:',
 'multiple_choice',
 '["Begin taking measurements","Tighten the attachment clamp","Adjust the tripod legs to center the circular bubble","Rotate the instrument 180°"]'::jsonb,
 'Adjust the tripod legs to center the circular bubble',
 'Step 3 intentionally uses the leveling screws to center the plummet, which throws the instrument out of level. Step 4 corrects this by adjusting tripod leg lengths (one at a time) to bring the circular bubble approximately to center. Leg adjustments move the instrument in an arc roughly centered on the ground mark, keeping the plummet close to the point.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','setup-procedure','step-4']),

-- Q10  Multiple Choice  Medium
('Which type of plummet may become difficult to see in bright direct sunlight on a light-colored surface?',
 'multiple_choice',
 '["Optical plummet","Laser plummet","Both are equally affected","Neither is affected by sunlight"]'::jsonb,
 'Laser plummet',
 'A laser plummet projects a visible dot (red or green) onto the ground. In bright direct sunlight, especially on light-colored concrete or rock, the laser dot can wash out and become difficult to see. An optical plummet uses a telescope looking down and actually benefits from ambient light to illuminate the ground mark.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','laser-plummet','sunlight','visibility']),

-- Q11  True/False  Medium
('When adjusting tripod legs to center the circular bubble (Step 4 of setup), you should adjust all three legs simultaneously for speed.',
 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'You must work with only ONE leg at a time. Adjusting multiple legs simultaneously makes it impossible to predict the combined effect on the bubble, and you are more likely to shift the instrument off the point. Adjusting one leg at a time is more controlled and actually faster because each adjustment is predictable.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','tripod-legs','one-at-a-time']),

-- ── Hard (Q12–Q14) ─────────────────────────────────────────────────────────

-- Q12  Multiple Choice  Hard
('After completing the three-screw leveling procedure, you rotate the instrument 180° and the plate bubble moves noticeably off center. What does this indicate?',
 'multiple_choice',
 '["The tripod is settling into the ground","The foot screws are indexed incorrectly","The plate level bubble vial itself is out of adjustment","The optical plummet is misaligned"]'::jsonb,
 'The plate level bubble vial itself is out of adjustment',
 'If the bubble moves off center when the instrument is rotated 180° after careful leveling, it indicates the plate bubble vial''s axis is not perpendicular to the instrument''s vertical axis. This is a permanent adjustment error in the vial, not a leveling error. Correction: bring the bubble halfway back with foot screws (principle of reversal), then use the capstan screws on the vial to center it fully.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','180-degree-check','vial-adjustment']),

-- Q13  Multiple Choice  Hard
('In the forced centering technique, what is the primary advantage of swapping instruments between tribrachs rather than setting up fresh at each station?',
 'multiple_choice',
 '["It eliminates the need for a tribrach","It reduces centering errors at previously occupied stations","It allows measurements in the dark","It eliminates the need for a plummet"]'::jsonb,
 'It reduces centering errors at previously occupied stations',
 'Forced centering exploits the tribrach''s locking clamp to swap instruments (total station and prism) without disturbing the tribrach''s centered and leveled position on the tripod. This eliminates the need to re-center over already-occupied points, saving time and reducing centering errors at the backsight and instrument stations. All tribrachs must be in proper adjustment for this to work.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','forced-centering','tribrach','advantage']),

-- Q14  Multiple Choice  Hard
('A surveyor completes the 180° check and finds the plate bubble has shifted 4 graduations to the left. To correct this, the surveyor should first:',
 'multiple_choice',
 '["Use the foot screws to bring the bubble all the way back to center","Use the foot screws to bring the bubble only 2 graduations (halfway) back toward center","Use the capstan screws to bring the bubble all the way back","Re-do the entire leveling procedure from Step 1"]'::jsonb,
 'Use the foot screws to bring the bubble only 2 graduations (halfway) back toward center',
 'The principle of reversal doubles the apparent error. When the instrument is rotated 180°, the 4-graduation displacement represents 2 graduations of actual leveling error and 2 graduations of vial maladjustment. By bringing the bubble only halfway back (2 graduations) with the foot screws, you correct the leveling error. Then the remaining 2 graduations are corrected using the capstan adjusting screws on the vial itself.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','principle-of-reversal','halfway','capstan']),

-- ── Essay (Q15–Q16) ────────────────────────────────────────────────────────

-- Q15  Essay  Hard
('Describe the complete 10-step procedure for setting up a total station over a known ground point using an optical plummet. For each step, explain what you are doing and why. Include: (a) the relationship between centering and leveling, (b) why the process is iterative, (c) the critical rule about sliding vs. rotating the tribrach, and (d) what to check after the setup is complete.',
 'essay',
 '[]'::jsonb,
 'Key points: (1) Rough-set tripod over point with head horizontal. (2) Attach instrument, focus optical plummet on crosshairs then ground mark, use foot near point to locate it. (3) Use leveling screws to center plummet exactly on point (intentionally un-levels instrument). (4) Adjust tripod legs ONE AT A TIME to center circular bubble (moves instrument in arc centered on mark). (5) Confirm plummet still near point. (6) Use three-screw procedure to precisely center plate bubble. (7) Recheck plummet — likely slightly off. (8) Loosen central screw, SLIDE (not rotate!) to re-center plummet on point. (9) Tighten clamp, recheck plate level. (10) Re-level and repeat until exactly level AND over point. (a) Centering and leveling are interactive — adjusting one affects the other. (b) Iterative because of this interaction; usually 2–3 passes needed. (c) Never rotate the tribrach when sliding — rotation changes tilt because different base plate areas contact different tripod head surface imperfections. (d) Check frequently during use because legs settle on soft ground/hot asphalt.',
 'A complete answer covers all 10 steps with reasoning, addresses all four sub-points (a–d), and demonstrates understanding of the interactive nature of centering and leveling.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','essay','10-step-procedure','comprehensive']),

-- Q16  Essay  Medium
('Compare and contrast optical plummets and laser plummets. Include: (a) how each works, (b) the advantages and disadvantages of each, (c) at least one situation where each type would be preferred, and (d) why both types must be checked periodically for adjustment.',
 'essay',
 '[]'::jsonb,
 'Key points: (a) Optical plummet: small telescope with crosshairs looking straight down through vertical axis; requires focusing on both crosshairs and ground mark to remove parallax. Laser plummet: projects visible laser beam (red/green) downward; dot visible on ground without eyepiece. (b) Optical advantages: no batteries, very reliable, not affected by sunlight. Optical disadvantages: must bend to eyepiece, requires ambient light, parallax must be removed. Laser advantages: visible from any angle, second person can verify, no focusing needed. Laser disadvantages: requires battery, can wash out in bright sunlight on light surfaces, dependent on battery life. (c) Optical preferred: long days in bright sun where battery conservation matters; laser preferred: low-light conditions (early morning, tunnels, under dense canopy) or when frequent verification by a second person is needed. (d) Both must be checked because mechanical wear, temperature changes, and impacts can shift the plummet out of alignment. An out-of-adjustment plummet means the instrument appears centered but is actually offset from the point, introducing systematic position errors into all measurements.',
 'A good answer covers all four sub-points with specific details and demonstrates understanding of when each type is advantageous.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','essay','optical-vs-laser','comparison']);


-- ────────────────────────────────────────────────────────────────────────────
-- 2. PRACTICE PROBLEMS (12 problems)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM question_bank
WHERE lesson_id = 'acc03b05-0000-0000-0000-000000000001'
  AND tags @> ARRAY['acc-srvy-1341','week-5','practice'];

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- ── Instrument Leveling (6 problems) ────────────────────────────────────────

-- P1  Easy
('Practice: The plate bubble is displaced to the LEFT of center. Using the left thumb rule, which direction should you turn your left thumb to move the bubble back to center?',
 'multiple_choice',
 '["Turn left thumb to the left","Turn left thumb to the right","Turn left thumb up","It depends on which screws you are using"]'::jsonb,
 'Turn left thumb to the right',
 'The bubble follows the left thumb. Since the bubble needs to move to the right (back toward center), you turn your left thumb to the right. Your right thumb simultaneously turns in the opposite direction (to the left).',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','left-thumb-rule','direction']),

-- P2  Easy
('Practice: A new technician sets up the instrument and uses only the circular (bull''s-eye) bubble to level it, then begins taking angle measurements. What error has the technician made, and what should they have done?',
 'essay', '[]'::jsonb,
 'The circular bubble is a rough-leveling device that levels in two axes simultaneously but with low sensitivity. It is not precise enough for surveying measurements. After rough-leveling with the circular bubble, the technician must also fine-level using the plate (tubular) bubble and the three-screw leveling procedure. The plate bubble is much more sensitive and provides the precise level needed for accurate horizontal and vertical angle measurements.',
 'A good answer distinguishes the two bubble types, explains sensitivity differences, and describes the correct two-step sequence.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','bubble-types','mistake']),

-- P3  Medium
('Practice: A surveyor levels the instrument using the standard three-screw procedure. The bubble is centered in both the A–B and C positions. She rotates the instrument 180° and the bubble shifts 6 graduations to the right. (a) What does this indicate? (b) How many graduations should she correct with the foot screws? (c) How should the remaining error be corrected?',
 'essay', '[]'::jsonb,
 'Key points: (a) The 180° check reveals that the plate level vial is out of adjustment — its axis is not perpendicular to the instrument''s vertical axis. (b) She should use the foot screws to bring the bubble only 3 graduations (halfway) back toward center. The principle of reversal means the 6-graduation displacement represents 3 graduations of actual tilt error and 3 graduations of vial maladjustment. (c) The remaining 3 graduations should be corrected using the capstan adjusting screws on the bubble vial. Then repeat the 180° check to verify.',
 'A complete answer explains the principle of reversal, correctly states halfway (3 graduations), and identifies capstan screws for the vial correction.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','180-check','principle-of-reversal']),

-- P4  Medium
('Practice: Put the following leveling steps in the correct order: (A) Rotate 90° to third screw, (B) Center bubble using screws A and B, (C) Index all screws to mid-range, (D) Rough-level circular bubble with tripod legs, (E) Turn only screw C to center bubble, (F) Align plate bubble parallel to screws A and B.',
 'short_answer', '[]'::jsonb,
 'C, D, F, B, A, E',
 'Correct order: (C) Index screws to mid-range first. (D) Rough-level with the circular bubble by adjusting tripod legs. (F) Align the plate bubble parallel to the A–B line. (B) Center the bubble using both screws A and B with the left thumb rule. (A) Rotate 90° toward the third screw. (E) Turn only screw C to center the bubble. Then iterate steps F through E until stable.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','leveling-order','sequence']),

-- P5  Medium
('Practice: Why must leveling screws be turned in equal amounts in opposite directions? What happens if one screw is turned more than the other?',
 'essay', '[]'::jsonb,
 'Turning two screws equal amounts in opposite directions tilts the instrument about the line connecting those two screws while keeping the instrument approximately centered over the tripod head. If one screw is turned more than the other, the instrument is not only tilted but also shifted laterally on the tripod head. This lateral shift moves the instrument off-center from the point below, requiring additional centering corrections. Equal and opposite turns keep the leveling process efficient by changing only one variable (tilt) at a time.',
 'A good answer explains both the tilting effect and the lateral shift caused by unequal turns.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','equal-opposite','lateral-shift']),

-- P6  Hard
('Practice: An inexperienced surveyor is having extreme difficulty leveling the instrument. After 15 minutes of trying, the plate bubble still cannot be centered. The foot screws appear to be at the ends of their travel. Diagnose the most likely cause and describe what the surveyor should do.',
 'essay', '[]'::jsonb,
 'Most likely cause: The tripod head is not approximately horizontal. When the head is severely tilted, the foot screws must travel to their extremes to compensate, and they may run out of adjustment range before the bubble is centered. Solution: (1) Remove the instrument from the tripod. (2) Adjust the tripod leg lengths until the head is approximately horizontal (visually parallel to the ground). (3) Replace the instrument. (4) Index all three foot screws to mid-range. (5) Begin the leveling procedure again. Secondary possibility: the screws were not indexed to mid-range before starting, so they started near one extreme.',
 'A strong answer identifies the tilted tripod head as the root cause, describes the correction (adjust legs for horizontal head), and mentions indexing the screws.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','troubleshooting','tripod-head','cannot-level']),

-- ── Instrument Setup Over a Point (6 problems) ─────────────────────────────

-- P7  Easy
('Practice: During Step 2 of the setup procedure, the surveyor cannot locate the ground mark in the optical plummet. What practical tip can help locate the point?',
 'multiple_choice',
 '["Increase the magnification","Place your foot next to the point as a reference","Switch to a laser plummet","Ask another crew member to point at the mark from a distance"]'::jsonb,
 'Place your foot next to the point as a reference',
 'Placing your foot next to the ground mark provides a large, easily visible reference in the plummet''s field of view. You can use your boot as a guide to locate the much smaller nail or mark. This is a standard field technique taught to all new surveyors.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','locate-point','foot-tip']),

-- P8  Medium
('Practice: After completing Step 6 (fine-leveling the plate bubble), you check the optical plummet and find it is about 5 mm off the point. Describe the correct procedure to re-center without destroying your level.',
 'essay', '[]'::jsonb,
 'Key steps: (1) Loosen the central attachment clamp (5/8-inch mounting screw) slightly — just enough to allow the instrument to slide. (2) While looking through the optical plummet, slide the instrument in straight lines on the tripod head until the crosshairs are exactly on the point. CRITICAL: do not rotate the tribrach — only translate (slide) it. (3) Tighten the attachment clamp. (4) Recheck the plate bubble — sliding may have slightly disturbed the level. (5) If the level has shifted, re-adjust with foot screws and recheck the plummet. Iterate until both are correct.',
 'A complete answer includes: loosen clamp, slide (not rotate), tighten, and recheck both level and centering.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','re-center','slide','step-8']),

-- P9  Medium
('Practice: List the five main components found in a tribrach and briefly state the function of each.',
 'essay', '[]'::jsonb,
 'Five components: (1) Three leveling (foot) screws — provide precise tilt adjustment for fine-leveling the instrument. (2) Circular (bull''s-eye) bubble — indicates approximate level in two axes for rough leveling. (3) Optical or laser plummet — projects a vertical reference line to the ground for centering over a point. (4) Locking clamp — secures the instrument (or prism/target) to the tribrach; allows interchange of instruments without disturbing centering (basis of forced centering). (5) 5/8″-11 central mounting screw — attaches the tribrach to the tripod head; when loosened slightly, allows the tribrach to slide for fine centering.',
 'A complete answer names all five components and gives the function of each.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','tribrach','components','functions']),

-- P10  Hard
('Practice: Explain why the centering and leveling adjustments are described as "interactive." Give a specific example of how adjusting one affects the other during the setup procedure.',
 'essay', '[]'::jsonb,
 'Centering and leveling are interactive because the instrument sits on a spherical surface (the tripod head/foot screw geometry). Changing the tilt (leveling) slightly shifts the position of the vertical axis at ground level, moving the plummet off the point. Conversely, sliding the instrument to re-center it can slightly change the effective tilt because the tripod head is not perfectly flat. Specific example: In Step 6, you use the foot screws to precisely center the plate bubble (leveling). This tilts the instrument body, which causes the optical plummet''s line of sight to shift. When you check the plummet in Step 7, it is slightly off the point — typically by a few millimeters. You then must slide to re-center (Step 8) and re-level (Step 10), iterating until both conditions are simultaneously satisfied.',
 'A strong answer explains the geometric relationship between tilt and position, gives a concrete step-by-step example, and uses the word "iterate" or describes the iterative process.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','interactive','centering-leveling','iterative']),

-- P11  Hard
('Practice: A crew is running a traverse. At the second station, the instrument person notices the optical plummet traces a small circle (about 3 mm diameter) on the ground as the instrument is rotated 360°. The plummet does not stay on the point. (a) What does this indicate? (b) Should the crew continue the traverse? (c) What should be done?',
 'essay', '[]'::jsonb,
 'Key points: (a) The optical plummet is out of adjustment — it is not aligned with the true vertical axis of the instrument. When the instrument rotates, the plummet traces a circle because its line of sight is offset from the rotation axis. (b) The crew should NOT continue the traverse with an out-of-adjustment plummet. Every setup will have a centering error equal to half the circle diameter (~1.5 mm), and this error is systematic and will accumulate through the traverse. (c) The tribrach or instrument should be sent for professional calibration. As a temporary field workaround, the surveyor can find the center of the circle (the average position) and set up over that point, but this is less precise than a properly adjusted plummet.',
 'A complete answer identifies the plummet maladjustment, recommends stopping the traverse, and suggests calibration with an optional field workaround.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','plummet-circle','out-of-adjustment','360-check']),

-- P12  Hard
('Practice: Describe the complete sequence of events from the moment you arrive at a traverse station with your equipment to the moment you are ready to take your first measurement. Include equipment handling, setup, leveling, and centering.',
 'essay', '[]'::jsonb,
 'Complete sequence: (1) Arrive at station; identify the ground mark. (2) Set the tripod over the mark — spread legs 36+ inches, head approximately horizontal, tips firmly planted. (3) Remove the instrument from its case (keep case closed). (4) Grasp the instrument by the standards and tribrach, place on tripod head, secure immediately with the attachment clamp. (5) Index all three foot screws to mid-range. (6) Look through optical plummet; focus crosshairs, then ground mark. Place foot near mark to locate it. (7) Use foot screws to center plummet on the point. (8) Adjust tripod legs (one at a time) to center the circular bubble. (9) Confirm plummet is still near the point. (10) Perform three-screw leveling procedure: align plate bubble over two screws, center with left thumb rule, rotate 90°, center with third screw, iterate until stable. (11) Check plummet — probably slightly off. (12) Loosen central screw, slide (not rotate!) to re-center plummet. (13) Tighten clamp, recheck plate level. (14) Iterate centering/leveling until both are exactly right. (15) Power on the instrument, check instrument constants, set up the data collector, and you are ready for the first measurement.',
 'An excellent answer integrates instrument care habits from Week 4 (case handling, grip), the complete 10-step setup procedure from Week 5, and pre-measurement instrument checks.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','essay','complete-sequence','comprehensive']);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. FLASHCARDS (25)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM flashcards WHERE lesson_id = 'acc03b05-0000-0000-0000-000000000001';

INSERT INTO flashcards (id, term, definition, hint_1, hint_2, hint_3, module_id, lesson_id, keywords, tags, category) VALUES

-- ── Instrument Leveling ─────────────────────────────────────────────────────

('fc050001-0000-0000-0000-000000000001',
 'Left Thumb Rule',
 'When two leveling screws are gripped (one in each hand) and turned simultaneously in opposite directions, the bubble always moves in the direction the left thumb turns. This is the fundamental technique for efficient instrument leveling.',
 'The bubble follows one specific thumb',
 'Both thumbs turn in opposite directions',
 'Left thumb points right → bubble moves right',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['left thumb','rule','bubble','leveling','direction','screws'],
 ARRAY['acc-srvy-1341','week-5','leveling'], 'surveying'),

('fc050002-0000-0000-0000-000000000001',
 'Indexing the Screws',
 'Setting all three leveling foot screws to their mid-range position before beginning the leveling procedure. The midpoint is marked by a line on the screw body. Indexing ensures maximum adjustment range in both directions. Instruments should also be stored with screws indexed.',
 'Look for the line on the screw body',
 'Mid-range = equal turns available up and down',
 'Do this BEFORE leveling and BEFORE storing',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['indexing','mid-range','foot screws','line','storage','adjustment range'],
 ARRAY['acc-srvy-1341','week-5','leveling'], 'surveying'),

('fc050003-0000-0000-0000-000000000001',
 'Circular (Bull''s-Eye) Bubble',
 'A round level vial that indicates approximate level in two axes simultaneously. Used for rough leveling only. Adjusted by changing tripod leg lengths. Less sensitive than the plate bubble. Always used FIRST in the leveling sequence.',
 'Round shape, levels in two dimensions at once',
 'Adjusted by tripod legs, not foot screws',
 'Used for rough leveling only — not precise enough for measurements',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['circular bubble','bull''s-eye','rough leveling','two axes','tripod legs'],
 ARRAY['acc-srvy-1341','week-5','leveling'], 'surveying'),

('fc050004-0000-0000-0000-000000000001',
 'Plate (Tubular) Bubble',
 'An elongated tube-shaped level vial that indicates precise level in one axis only. More sensitive than the circular bubble. Used for fine leveling with the foot screws and the left thumb rule. Must be checked in two positions 90° apart.',
 'Elongated tube shape — levels in one direction only',
 'More sensitive = used for precise/final leveling',
 'Adjusted by foot screws, checked at 90° intervals',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['plate bubble','tubular','precise leveling','one axis','foot screws','sensitive'],
 ARRAY['acc-srvy-1341','week-5','leveling'], 'surveying'),

('fc050005-0000-0000-0000-000000000001',
 'Three-Screw Leveling — Step Summary',
 'Step 1: Align plate bubble over two screws (A–B). Step 2: Center bubble using A and B (left thumb rule, equal opposite turns). Step 3: Rotate 90° toward screw C. Step 4: Center bubble using ONLY screw C. Steps 5–6: Repeat until bubble stays centered in both positions.',
 '6 steps total, alternating between two positions',
 'Only use ONE screw (C) when aligned toward it',
 'Iterate 2–3 times because the axes interact',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['three-screw','procedure','steps','rotate 90','iterate','A-B','C'],
 ARRAY['acc-srvy-1341','week-5','leveling'], 'surveying'),

('fc050006-0000-0000-0000-000000000001',
 'Equal and Opposite Screw Turns',
 'When using two leveling screws together, they must be rotated the same amount in opposite directions at the same rate. Unequal turns shift the instrument laterally on the tripod head, displacing it from the point below.',
 'Same amount, opposite directions, same speed',
 'One thumb toward you, one away — matching pace',
 'Unequal turns = lateral shift = centering error',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['equal','opposite','turns','lateral shift','centering','foot screws'],
 ARRAY['acc-srvy-1341','week-5','leveling'], 'surveying'),

('fc050007-0000-0000-0000-000000000001',
 '180° Verification Check',
 'After leveling is complete, rotate the instrument 180°. If the plate bubble stays centered: the instrument is properly leveled. If the bubble moves off center: the plate bubble vial itself is out of adjustment and needs correction using the principle of reversal and capstan screws.',
 'Final test after the iterative leveling procedure',
 'Bubble stays = PASS; bubble moves = vial needs adjustment',
 'If it fails: halfway back with foot screws, then capstan screws',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['180 degrees','verification','check','vial','adjustment','pass','fail'],
 ARRAY['acc-srvy-1341','week-5','leveling'], 'surveying'),

('fc050008-0000-0000-0000-000000000001',
 'Principle of Reversal',
 'When an instrument is rotated 180° and the bubble shifts, the total displacement represents DOUBLE the actual error — half from tilt and half from vial maladjustment. Correct by bringing the bubble only halfway back with foot screws, then adjust the vial with capstan screws.',
 'The 180° rotation doubles the apparent error',
 'Halfway back with foot screws corrects the tilt portion',
 'Capstan screws correct the vial portion',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['principle of reversal','double error','halfway','capstan screws','vial','180 degrees'],
 ARRAY['acc-srvy-1341','week-5','leveling'], 'surveying'),

('fc050009-0000-0000-0000-000000000001',
 'Capstan Adjusting Screws',
 'Small screws on the plate bubble vial that allow the vial to be repositioned relative to the instrument. Used to correct a maladjusted bubble vial after the principle of reversal identifies the error. Should only be adjusted by trained personnel.',
 'Located on the bubble vial itself, not the tribrach',
 'Used AFTER foot screws bring the bubble halfway back',
 'Do not attempt if you are not trained in this adjustment',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['capstan','adjusting screws','bubble vial','maladjustment','correction','trained'],
 ARRAY['acc-srvy-1341','week-5','leveling'], 'surveying'),

-- ── Plummets and Tribrach ───────────────────────────────────────────────────

('fc050010-0000-0000-0000-000000000001',
 'Optical Plummet',
 'A small telescope built into the tribrach or instrument that looks straight down through the vertical axis to the ground. Uses crosshairs to center on a ground mark. Requires no power (entirely optical). Must focus on both crosshairs and the ground mark to remove parallax.',
 'A telescope that looks DOWN, not forward',
 'No batteries needed — purely optical',
 'Must focus crosshairs AND ground mark separately',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['optical plummet','telescope','crosshairs','vertical axis','no power','parallax','focus'],
 ARRAY['acc-srvy-1341','week-5','plummet'], 'surveying'),

('fc050011-0000-0000-0000-000000000001',
 'Laser Plummet',
 'Projects a visible laser beam (red or green) straight down from the instrument''s vertical axis to the ground. The dot is visible without bending to an eyepiece. Requires battery power. May wash out in bright sunlight on light-colored surfaces.',
 'Visible dot on the ground — no eyepiece needed',
 'Requires batteries (unlike optical plummet)',
 'Can be hard to see in bright direct sunlight',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['laser plummet','red dot','green dot','battery','sunlight','visible beam'],
 ARRAY['acc-srvy-1341','week-5','plummet'], 'surveying'),

('fc050012-0000-0000-0000-000000000001',
 'Tribrach',
 'The precision mounting plate connecting a surveying instrument to the tripod. Contains: three leveling foot screws, a circular bubble, an optical/laser plummet, a locking clamp for interchangeable instruments, and a 5/8″-11 central mounting screw. Named from Greek: "three arms."',
 'The interface between instrument and tripod',
 'Three foot screws + bubble + plummet + clamp',
 'Accepts interchangeable instruments (basis of forced centering)',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['tribrach','three arms','mounting plate','foot screws','bubble','plummet','clamp'],
 ARRAY['acc-srvy-1341','week-5','plummet'], 'surveying'),

('fc050013-0000-0000-0000-000000000001',
 'Locking Clamp (Tribrach)',
 'The mechanism on the tribrach that secures the instrument, prism, or target in place. When released, allows interchanging of instruments without disturbing the tribrach''s centered and leveled position — this is the basis of forced centering.',
 'Holds the instrument to the tribrach',
 'Release it to swap instrument for prism (or vice versa)',
 'Key to forced centering technique',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['locking clamp','tribrach','interchange','swap','forced centering','secure'],
 ARRAY['acc-srvy-1341','week-5','plummet'], 'surveying'),

('fc050014-0000-0000-0000-000000000001',
 'Central Mounting Screw (5/8″-11)',
 'The large threaded bolt that attaches the tribrach to the tripod head. Standard thread size is 5/8-inch-11 UNC. When loosened slightly, allows the tribrach to slide on the tripod head for fine centering. When tightened, locks the tribrach in position.',
 'Connects tribrach to tripod — standard 5/8″ thread',
 'Loosen to slide for centering; tighten to lock',
 'The universal tripod thread for surveying instruments',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['mounting screw','5/8 inch','tripod head','slide','centering','tighten','lock'],
 ARRAY['acc-srvy-1341','week-5','plummet'], 'surveying'),

('fc050015-0000-0000-0000-000000000001',
 'Forced Centering',
 'An advanced traverse technique that exploits the tribrach''s interchangeable instrument capability. The instrument and prism/target are swapped between tribrachs at consecutive traverse stations without disturbing the centered/leveled tribrachs. Reduces centering errors and speeds up fieldwork.',
 'Swap instrument and prism between tribrachs',
 'Tribrachs stay centered — instruments are exchanged',
 'Requires all tribrachs to be in proper adjustment',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['forced centering','leapfrog','tribrach','interchange','swap','traverse','centering error'],
 ARRAY['acc-srvy-1341','week-5','plummet'], 'surveying'),

('fc050016-0000-0000-0000-000000000001',
 'Parallax (Optical Plummet)',
 'An apparent shift in the crosshair position relative to the ground mark when your eye moves. Caused by the crosshairs and the ground mark not being in the same focal plane. Removed by focusing the eyepiece on the crosshairs first, then the objective on the ground mark, until both are sharp simultaneously.',
 'Crosshairs seem to move when you shift your eye position',
 'Means the two images are not in the same focal plane',
 'Fix: focus crosshairs first, then focus on the ground mark',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['parallax','focus','crosshairs','eyepiece','objective','focal plane','optical plummet'],
 ARRAY['acc-srvy-1341','week-5','plummet'], 'surveying'),

-- ── Setup Over a Point ──────────────────────────────────────────────────────

('fc050017-0000-0000-0000-000000000001',
 'Slide — Do Not Rotate',
 'When re-centering the instrument over a point (Step 8), loosen the central screw and SLIDE the tribrach in straight lines on the tripod head. NEVER rotate it. Rotation changes which parts of the base plate contact the tripod head surface, altering the tilt and destroying the established level.',
 'Straight-line motion ONLY on the tripod head',
 'Rotation changes the tilt because the surfaces are not perfectly flat',
 'If you rotate, you must re-level from scratch',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['slide','do not rotate','tribrach','tripod head','tilt','straight line','re-level'],
 ARRAY['acc-srvy-1341','week-5','setup'], 'surveying'),

('fc050018-0000-0000-0000-000000000001',
 'Rough-Set the Tripod (Step 1)',
 'Position the tripod over the ground mark: hold two legs, place the third past the point, move the two held legs until the head is approximately over the point and horizontal, then press all three tips firmly into the ground.',
 'Third leg goes past the point first',
 'Two held legs are adjusted to center the head',
 'Head must be approximately horizontal before mounting the instrument',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['rough-set','tripod','third leg','horizontal','ground mark','position'],
 ARRAY['acc-srvy-1341','week-5','setup'], 'surveying'),

('fc050019-0000-0000-0000-000000000001',
 'One Leg at a Time (Step 4)',
 'When adjusting tripod legs to center the circular bubble, work with only ONE leg at a time. Extending/shortening a leg moves the instrument in an arc roughly centered on the ground mark, keeping the plummet close to the point. Adjusting multiple legs simultaneously creates unpredictable movement.',
 'Only adjust one tripod leg at a time for leveling',
 'Leg movement creates an arc centered on the ground mark',
 'Multiple legs = unpredictable = slower, not faster',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['one leg','tripod','circular bubble','arc','predictable','adjust'],
 ARRAY['acc-srvy-1341','week-5','setup'], 'surveying'),

('fc050020-0000-0000-0000-000000000001',
 'Interactive Centering and Leveling',
 'Centering (over the point) and leveling (making the instrument horizontal) are interactive adjustments — changing one slightly affects the other. This is why the setup procedure is iterative: you must alternate between centering and leveling checks until both are satisfied simultaneously.',
 'Adjusting level shifts the plummet off the point slightly',
 'Sliding to re-center can slightly change the tilt',
 'Iterate: center → level → re-check center → re-check level → done',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['interactive','centering','leveling','iterative','simultaneous','shift'],
 ARRAY['acc-srvy-1341','week-5','setup'], 'surveying'),

('fc050021-0000-0000-0000-000000000001',
 '10-Step Setup Procedure Summary',
 '(1) Rough-set tripod. (2) Attach instrument, find point in plummet. (3) Center plummet with foot screws. (4) Adjust legs for circular bubble (one at a time). (5) Confirm plummet near point. (6) Fine-level with plate bubble. (7) Recheck plummet. (8) Slide to re-center (no rotation!). (9) Tighten clamp, recheck level. (10) Re-level and repeat until both conditions met.',
 '10 steps total — centering and leveling alternate',
 'Steps 3 and 8 are the two centering steps',
 'Steps 4 and 6 are the two leveling steps',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['10-step','setup','procedure','summary','centering','leveling','iterate'],
 ARRAY['acc-srvy-1341','week-5','setup'], 'surveying'),

('fc050022-0000-0000-0000-000000000001',
 'Foot Near the Point (Setup Tip)',
 'When first looking through the optical plummet, place your foot next to the ground mark. Your boot provides a large, easily visible reference in the plummet''s field of view, helping you locate the much smaller nail or mark.',
 'A practical field trick for finding the mark in the plummet',
 'Your boot is much larger and easier to spot than a PK nail',
 'Step 2 of the setup procedure',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['foot','boot','locate','PK nail','optical plummet','field tip','reference'],
 ARRAY['acc-srvy-1341','week-5','setup'], 'surveying'),

-- ── Common Mistakes ─────────────────────────────────────────────────────────

('fc050023-0000-0000-0000-000000000001',
 'Over-Tightening Foot Screws',
 'Foot screws should be just snug enough to hold — never overtightened. Excessive force warps the tribrach base plate and can permanently damage the leveling mechanism. Clamps should be "micrometer-snug."',
 'Just snug — not tight',
 'Excessive force warps the base plate',
 'Same principle as instrument clamps from Week 4',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['over-tighten','foot screws','warp','base plate','damage','snug'],
 ARRAY['acc-srvy-1341','week-5','mistakes'], 'surveying'),

('fc050024-0000-0000-0000-000000000001',
 'Recheck During Extended Use',
 'After setup is complete, check the instrument frequently to ensure it remains level and centered over the point. Tripod legs settle over time — especially on soft ground, hot asphalt, loose fill, or when heavy vehicles pass nearby.',
 'Setup is not a one-time event — recheck periodically',
 'Soft ground and hot asphalt cause settling',
 'Traffic vibrations can also shift the instrument',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['recheck','settle','soft ground','asphalt','vibration','periodic','level','centered'],
 ARRAY['acc-srvy-1341','week-5','mistakes'], 'surveying'),

('fc050025-0000-0000-0000-000000000001',
 'Experienced Setup Time',
 'An experienced surveyor can level a three-screw instrument in under 2–3 minutes and complete the full setup over a point (centering + leveling) in under 5 minutes. Beginners may take 10–15 minutes initially; with practice, this comes down within a few weeks.',
 'Leveling alone: under 3 minutes for an experienced surveyor',
 'Full setup over a point: under 5 minutes',
 'Speed comes from following the systematic procedure, not from rushing',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 ARRAY['time','minutes','experienced','beginner','speed','systematic','practice'],
 ARRAY['acc-srvy-1341','week-5','general'], 'surveying');


COMMIT;
