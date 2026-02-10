-- ============================================================================
-- ACC SRVY 1335 — Week 5: Horizontal Angle Measurement Lab
-- Full lesson content, topics, quiz questions (14), and practice problems (8)
-- Module ID: acc00002-0000-0000-0000-000000000002
-- Lesson ID: acc02b05-0000-0000-0000-000000000001
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. UPDATE LESSON CONTENT
-- ────────────────────────────────────────────────────────────────────────────

UPDATE learning_lessons SET content = '
<h2>Putting Angular Measurement into Practice</h2>

<p>Last week you learned the theory of angular measurement — angles to the right, deflection angles, interior angles, closing the horizon, and the repetition method. This week you take those methods into the field and execute them on a real multi-station figure. By the end of today, you will have measured a complete set of horizontal angles, computed angular closure, and evaluated whether your fieldwork meets accuracy standards.</p>

<p>This lab is the first exercise where you combine <strong>all</strong> of the skills from the previous weeks: instrument setup, orientation, angle turning, D&R measurement, field note recording, and quality control. The goal is not just to get numbers — it is to get <em>good</em> numbers and to <em>prove</em> that they are good by computing closure.</p>

<h2>Today''s Field Setup</h2>

<p>The instructor has established a <strong>multi-station figure</strong> on campus — typically a closed polygon with 4 to 6 stations marked by hubs and tacks or concrete monuments. You will occupy each station, measure the interior angle (or angle to the right) using the repetition method, and record everything in your field book.</p>

<h3>Crew Organization</h3>
<p>Each crew should have:</p>
<ul>
<li><strong>Instrument operator:</strong> Sets up the total station, levels, centers, measures angles</li>
<li><strong>Rod person(s):</strong> Holds the prism pole plumb over the backsight and foresight stations</li>
<li><strong>Recorder:</strong> Records all readings in the field book, computes running checks</li>
</ul>
<p>Rotate roles so every crew member gets time on the instrument. The recorder role is just as critical as the operator — a recording blunder wastes the operator''s careful measurement.</p>

<h2>Measurement Procedure at Each Station</h2>

<p>At every station in the figure, follow this procedure:</p>

<h3>Step 1: Set Up</h3>
<ol>
<li>Place the tripod over the station mark, mount the tribrach and total station</li>
<li>Rough-level with the circular bubble, center with the optical plummet</li>
<li>Fine-level with the plate bubble and leveling screws</li>
<li>Iterate centering and leveling until both are satisfied</li>
<li>Measure and record HI</li>
</ol>

<h3>Step 2: Orient and Measure — 2D + 2R Repetitions</h3>

<p>For this lab, you will measure each angle using <strong>2 Direct + 2 Reverse = 4 repetitions</strong>:</p>

<h4>Direct (Face Left) — 2 repetitions</h4>
<ol>
<li>Sight the <strong>backsight</strong>. Set the circle to 0°00′00″. Record the initial reading.</li>
<li>Turn clockwise to the <strong>foresight</strong>. Read and record the angle (e.g., 92°17′34″).</li>
<li>Release the <strong>lower clamp</strong>, swing back to the backsight <em>without</em> changing the circle reading.</li>
<li>Lock the lower clamp, fine-point on the backsight with the lower tangent screw.</li>
<li>Release the <strong>upper clamp</strong>, turn to the foresight again. The circle now accumulates: approximately 2 × 92°17′34″ = 184°35′08″. Record this accumulated reading.</li>
</ol>

<h4>Reverse (Face Right) — 2 repetitions</h4>
<ol>
<li><strong>Plunge the telescope</strong> (transit to Face Right).</li>
<li>Continue accumulating: return to backsight via lower clamp, turn to foresight via upper clamp. Two more repetitions.</li>
<li>After 4 total repetitions, read the final accumulated value (e.g., 369°10′12″).</li>
</ol>

<h4>Compute the Mean</h4>
<ol>
<li>The circle has passed 360° once (since 4 × 92° ≈ 369°). True accumulated = 369°10′12″ (no need to add 360° since the accumulated ≈ 369° and expected ≈ 369°). Wait — 4 × 92°17′34″ = 369°10′16″. The display reads 369°10′12″, so the accumulated value is 369°10′12″.</li>
<li>Mean angle = 369°10′12″ / 4 = 92°17′33″</li>
</ol>

<p>Record the initial reading, intermediate readings (optional but recommended), final accumulated reading, number of repetitions, and computed mean.</p>

<h3>Step 3: Record and Move</h3>
<ol>
<li>Record all data in the field book (see recording format below)</li>
<li>Pack up the instrument and move to the next station</li>
<li>The rod persons move their poles to the new backsight and foresight positions</li>
</ol>

<h2>Angular Closure Computation</h2>

<p>After measuring angles at all stations, compute the angular closure <strong>in the field</strong> before leaving the site:</p>

<h3>For Interior Angles</h3>
<p style="text-align:center; font-size:1.1em;"><strong>Expected sum = (n − 2) × 180°</strong></p>
<p style="text-align:center;"><strong>Angular misclosure = Measured sum − Expected sum</strong></p>

<h3>Allowable Misclosure</h3>
<p style="text-align:center;"><strong>Allowable = K × √n</strong></p>
<p>where K depends on the accuracy standard and n is the number of angles.</p>

<p>For this lab exercise with a 5″ total station at third-order Class I (K = 5″):</p>

<table>
<thead><tr><th>Stations (n)</th><th>Expected Sum</th><th>Allowable Misclosure</th></tr></thead>
<tbody>
<tr><td>4</td><td>360°</td><td>5″ × √4 = 10″</td></tr>
<tr><td>5</td><td>540°</td><td>5″ × √5 = 11.2″</td></tr>
<tr><td>6</td><td>720°</td><td>5″ × √6 = 12.2″</td></tr>
</tbody>
</table>

<p>If your misclosure exceeds the allowable value, you must <strong>re-measure</strong> before leaving the field. Start with the angle measured under the worst conditions (longest sightlines, most wind, poorest visibility).</p>

<h2>Field Note Format for This Lab</h2>

<p>Your field book should contain the following for each station:</p>

<h3>Left Page (Data)</h3>
<table>
<thead><tr><th>Item</th><th>Example</th></tr></thead>
<tbody>
<tr><td>Station occupied</td><td>STA B</td></tr>
<tr><td>HI</td><td>1.523 m</td></tr>
<tr><td>Backsight</td><td>STA A</td></tr>
<tr><td>Foresight</td><td>STA C</td></tr>
<tr><td>Method</td><td>2D + 2R</td></tr>
<tr><td>Initial circle reading</td><td>0°00′00″</td></tr>
<tr><td>After 1st D rep</td><td>92°17′34″</td></tr>
<tr><td>After 2nd D rep</td><td>184°35′10″</td></tr>
<tr><td>After 1st R rep</td><td>276°52′42″</td></tr>
<tr><td>After 2nd R rep (final)</td><td>369°10′12″</td></tr>
<tr><td>Number of reps</td><td>4</td></tr>
<tr><td>Mean angle</td><td>92°17′33″</td></tr>
</tbody>
</table>

<h3>Right Page (Sketch)</h3>
<p>Draw a plan-view sketch of the entire figure showing:</p>
<ul>
<li>All station locations (labeled)</li>
<li>Traverse lines connecting stations</li>
<li>North arrow</li>
<li>Approximate angle values at each station</li>
<li>Reference features (buildings, roads, trees) for context</li>
</ul>

<h2>Quality Control Checklist</h2>

<p>Before leaving <strong>each station</strong>, verify:</p>
<ul>
<li>☐ D&R discrepancy is within instrument specification (the difference between Face Left and Face Right accumulated values, normalized, should be small)</li>
<li>☐ All intermediate readings are recorded</li>
<li>☐ Station ID, backsight, and foresight are correct</li>
<li>☐ HI is recorded</li>
</ul>

<p>Before leaving the <strong>field site</strong>:</p>
<ul>
<li>☐ Angles at all stations are measured</li>
<li>☐ Running sum of angles is computed</li>
<li>☐ Angular misclosure is computed and within tolerance</li>
<li>☐ If misclosure exceeds tolerance, suspect angle(s) have been re-measured</li>
<li>☐ Sketch is complete</li>
</ul>

<h2>Common Mistakes in This Lab</h2>

<table>
<thead><tr><th>Mistake</th><th>Consequence</th><th>Prevention</th></tr></thead>
<tbody>
<tr><td>Forgetting to use the lower clamp when returning to backsight</td><td>Circle resets — accumulated value is lost</td><td>Practice the lower-clamp/upper-clamp sequence before starting</td></tr>
<tr><td>Not plunging the telescope between D and R sets</td><td>Systematic errors not cancelled</td><td>Physically verify the vertical circle reads >180° in Face Right</td></tr>
<tr><td>Moving the prism pole before all measurements from a station are complete</td><td>Inconsistent backsight/foresight positions</td><td>Communicate clearly with rod person; finish all reps before signaling "move"</td></tr>
<tr><td>Recording the wrong accumulated reading</td><td>Mean angle is wrong</td><td>Have the recorder read back the value to the instrument operator</td></tr>
<tr><td>Not computing angular closure before leaving the field</td><td>Discovering a blown angle back at the office, requiring a return trip</td><td>Compute the running sum as you go; check closure at the last station</td></tr>
</tbody>
</table>

<h2>After the Lab: Computation</h2>

<p>Back at the desk (or in the field if time permits), complete the following computations:</p>

<ol>
<li><strong>Tabulate all mean angles</strong> from each station</li>
<li><strong>Sum the angles</strong> and compute the misclosure against (n − 2) × 180°</li>
<li><strong>Check the allowable misclosure</strong> for your accuracy standard</li>
<li><strong>If within tolerance:</strong> distribute the misclosure equally to balance the angles (this prepares them for azimuth computation in a future lab)</li>
<li><strong>Report:</strong> tabulated raw and balanced angles, misclosure, allowable, and pass/fail evaluation</li>
</ol>

<h2>Looking Ahead</h2>

<p>Next week you combine angle measurement with distance measurement for a complete <strong>traverse</strong> — measuring both angles and distances at every station of a closed figure. This week''s angle skills feed directly into that exercise. The better your angle technique, the better your traverse will close.</p>
',

resources = '[
  {"title":"Angular Measurement Field Procedures","url":"https://www.surveyingmath.com/angular-measurement","type":"reference"},
  {"title":"Repetition Method Step-by-Step","url":"https://www.surveyingmath.com/repetition-method","type":"reference"},
  {"title":"FGCS Standards for Horizontal Control","url":"https://www.ngs.noaa.gov/FGCS/tech_pub/1984-stds-specs-geodetic-control-networks.pdf","type":"pdf"}
]'::jsonb,

videos = '[
  {"title":"Field Exercise: Measuring Horizontal Angles at Multiple Stations","url":"https://www.youtube.com/watch?v=QXwYh9Vf1nM"},
  {"title":"Computing Angular Closure in the Field","url":"https://www.youtube.com/watch?v=h1_OLxNqK0E"}
]'::jsonb,

key_takeaways = ARRAY[
  'Execute a complete field exercise: set up at multiple stations and measure interior angles using 2D + 2R repetitions',
  'Use the lower clamp to preserve circle readings when returning to the backsight during repetitions',
  'Compute the mean angle from accumulated Direct and Reverse readings',
  'Calculate angular misclosure and compare to the allowable value (K × √n)',
  'Identify and re-measure suspect angles before leaving the field site',
  'Record all repetition data in proper field note format with left-page data and right-page sketch',
  'Distribute the angular misclosure to balance the angles for subsequent azimuth computation'
]

WHERE id = 'acc02b05-0000-0000-0000-000000000001';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. TOPICS
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM learning_topics WHERE lesson_id = 'acc02b05-0000-0000-0000-000000000001';

INSERT INTO learning_topics (id, lesson_id, title, content, order_index, keywords) VALUES

('acc02a05-0001-0000-0000-000000000001', 'acc02b05-0000-0000-0000-000000000001',
 'Field Exercise Setup and Crew Organization',
 'The horizontal angle lab uses a multi-station closed figure (4–6 stations) established on campus with permanent or semi-permanent monuments. Crew roles: instrument operator (sets up, levels, centers, measures), rod person(s) (holds prism pole plumb over backsight and foresight marks), recorder (writes all readings in field book, computes running checks). Roles should rotate so every student operates the instrument. The recorder must read back recorded values to the operator to catch transcription errors. Before starting, the crew should walk the entire figure to identify each station and plan the measurement sequence. Equipment needed: total station, tribrach, tripod, two prism poles with prisms, field book, pencil.',
 1,
 ARRAY['field exercise','crew roles','instrument operator','rod person','recorder','station identification','multi-station','closed figure','rotation']),

('acc02a05-0002-0000-0000-000000000001', 'acc02b05-0000-0000-0000-000000000001',
 'Repetition Measurement Procedure: 2D + 2R',
 'At each station: set up, level, and center. Sight backsight and zero circle. Turn clockwise to foresight (1st Direct rep). Use lower clamp to return to backsight without changing reading, then upper clamp to turn to foresight again (2nd Direct rep). Plunge telescope for Reverse face. Continue accumulating two more repetitions via the same lower/upper clamp sequence (1st and 2nd Reverse reps). The final accumulated reading divided by 4 gives the mean angle. Record the initial reading, each intermediate accumulated value, the final value, and the computed mean. Common mistake: forgetting to use the lower clamp when returning to the backsight, which resets the accumulated reading. Practice: physically rehearse the clamp sequence before taking real measurements.',
 2,
 ARRAY['2D 2R','repetition','lower clamp','upper clamp','accumulated reading','mean angle','plunge','Face Left','Face Right','clamp sequence']),

('acc02a05-0003-0000-0000-000000000001', 'acc02b05-0000-0000-0000-000000000001',
 'Angular Closure Computation and Tolerance',
 'After measuring all stations, compute angular closure in the field before leaving. For interior angles: expected sum = (n−2)×180°. Misclosure = measured sum − expected sum. Allowable misclosure = K × √n, where K depends on accuracy standard (K = 5″ for third-order Class I with a 5″ instrument). For a 5-station figure: allowable = 5×√5 = 11.2″. If misclosure exceeds tolerance, identify the suspect angle (measured under worst conditions: longest sightlines, most wind, poorest centering) and re-measure before leaving. Computing closure in the field is critical — discovering a blown angle at the office requires an expensive return trip. The running sum should be tracked as you go, station by station.',
 3,
 ARRAY['angular closure','misclosure','allowable','K factor','square root n','tolerance','re-measure','running sum','field check','interior angle sum']),

('acc02a05-0004-0000-0000-000000000001', 'acc02b05-0000-0000-0000-000000000001',
 'Field Notes, Quality Control, and Post-Lab Computation',
 'Field note recording for repetition angles: left page contains station occupied, HI, backsight/foresight IDs, method (2D+2R), initial circle reading, each intermediate accumulated reading, final accumulated reading, number of reps, and computed mean. Right page contains a plan-view sketch of the entire figure with labeled stations, traverse lines, north arrow, approximate angle values, and reference features. Quality control checklists: at each station (D&R discrepancy within spec, all readings recorded, station IDs correct, HI recorded) and before leaving the site (all stations measured, running sum computed, misclosure within tolerance, sketch complete). Post-lab computation: tabulate mean angles, sum and compute misclosure, check allowable, distribute misclosure equally to balance angles.',
 4,
 ARRAY['field notes','recording','repetition format','sketch','quality control','checklist','D&R discrepancy','post-lab','angle balancing','misclosure distribution']);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. QUIZ QUESTIONS (14 questions)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM question_bank
WHERE lesson_id = 'acc02b05-0000-0000-0000-000000000001'
  AND tags @> ARRAY['acc-srvy-1335','week-5'];

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- Q1  Multiple Choice  Easy
('During repetition measurement, when returning to the backsight you should use:',
 'multiple_choice',
 '["The upper clamp only","The lower clamp — it allows the circle to rotate with the instrument without changing the accumulated reading","Both clamps simultaneously","Neither clamp — just swing freely"]'::jsonb,
 'The lower clamp — it allows the circle to rotate with the instrument without changing the accumulated reading',
 'The lower clamp controls the circle. Releasing it allows the entire instrument (including the circle) to rotate together, preserving the accumulated reading. Then you lock the lower clamp on the backsight and use the upper clamp to turn to the foresight, which adds the next angle to the accumulation.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','quiz','lower-clamp','repetition']),

-- Q2  True/False  Easy
('Angular closure should be computed in the field before leaving the site.',
 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'Computing closure in the field allows you to detect and fix problems (blown angles, recording errors) while you are still on site. Discovering a closure problem back at the office requires an expensive return trip. Always compute the running sum of angles before packing up.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','quiz','angular-closure','field-check']),

-- Q3  True/False  Easy
('The recorder should read back each recorded value to the instrument operator to catch transcription errors.',
 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'Read-back is a critical quality control step. The recorder states the value they wrote, and the operator confirms it matches the display. This simple practice catches transposed digits, the most common recording blunder in field surveying.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','quiz','read-back','blunder-prevention']),

-- Q4  Multiple Choice  Easy
('In a 2D + 2R repetition set, the total number of repetitions is:',
 'multiple_choice',
 '["2","3","4","6"]'::jsonb,
 '4',
 '2D + 2R = 2 Direct (Face Left) repetitions + 2 Reverse (Face Right) repetitions = 4 total repetitions. The accumulated reading is divided by 4 to get the mean angle.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','quiz','2D-2R','repetition-count']),

-- Q5  Numeric Input  Medium
('A 5-station closed figure is measured with a 5″ total station. Using K = 5″ for third-order Class I, what is the allowable angular misclosure? Round to 1 decimal place.',
 'numeric_input',
 '[]'::jsonb,
 '11.2',
 'Allowable = K × √n = 5″ × √5 = 5 × 2.236 = 11.2″.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','quiz','allowable-misclosure','computation']),

-- Q6  Numeric Input  Medium
('An angle is measured with 4 repetitions (2D + 2R). The accumulated circle reading is 534°28''16". The approximate single angle is 133°. How many times has the circle passed 360°?',
 'numeric_input',
 '[]'::jsonb,
 '1',
 '4 × 133° = 532°. Since 532° > 360° but < 720°, the circle has passed 360° exactly once. The true accumulated value = 360° + 174°28′16″ = 534°28′16″, which matches the reading (since 534° < 720°, only one wrap).',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','quiz','repetition','360-crossing']),

-- Q7  Numeric Input  Medium
('Using the data from Q6 (accumulated = 534°28''16", 4 repetitions), compute the mean angle. Give the degrees portion only.',
 'numeric_input',
 '[]'::jsonb,
 '133',
 'Mean = 534°28′16″ / 4. Convert to seconds: 534 × 3600 + 28 × 60 + 16 = 1,922,400 + 1,680 + 16 = 1,924,096″. Divide by 4: 481,024″. Convert: 481,024 / 3600 = 133° remainder 2224″. 2224 / 60 = 37′ remainder 4″. Mean = 133°37′04″. Degrees = 133.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','quiz','repetition','mean-angle','computation']),

-- Q8  Multiple Choice  Medium
('Your angular misclosure exceeds the allowable tolerance. What should you do FIRST?',
 'multiple_choice',
 '["Adjust the angles equally and move on","Re-measure the angle at the station with the worst measurement conditions","Discard all data and start over","Add more repetitions at the last station"]'::jsonb,
 'Re-measure the angle at the station with the worst measurement conditions',
 'When the misclosure exceeds tolerance, the most likely cause is a single blown angle — probably at the station with the longest sightlines, most wind, poorest centering, or weakest geometry. Re-measure that angle first. If the new measurement brings closure within tolerance, proceed. If not, investigate further. Never adjust angles that exceed tolerance — adjustment cannot fix bad measurements.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','quiz','exceeded-tolerance','re-measure']),

-- Q9  Numeric Input  Hard
('A 4-station closed figure has measured interior angles: 87°15''22", 93°42''16", 88°30''28", 90°31''58". What is the angular misclosure in seconds?',
 'numeric_input',
 '[]'::jsonb,
 '4',
 'Expected sum = (4−2) × 180° = 360°. Measured sum: Seconds: 22+16+28+58 = 124″ = 2′04″. Minutes: 15+42+30+31+2 = 120′ = 2°00′. Degrees: 87+93+88+90+2 = 360°. Total = 360°00′04″. Misclosure = +4″.',
 'hard',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','quiz','angular-misclosure','DMS-addition']),

-- Q10  Numeric Input  Hard
('Using the angles from Q9, the misclosure is +4″ over 4 angles. What correction is applied to each angle using equal distribution?',
 'numeric_input',
 '[]'::jsonb,
 '-1',
 'Correction per angle = −misclosure / n = −4″ / 4 = −1″ per angle. Each measured angle is reduced by 1″.',
 'hard',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','quiz','angle-balancing','equal-distribution']),

-- Q11  Multiple Choice  Hard
('During your repetition measurements, you accidentally release the upper clamp instead of the lower clamp when returning to the backsight. What happens?',
 'multiple_choice',
 '["Nothing — the clamps are interchangeable","The accumulated reading is preserved but the telescope swings freely relative to the circle, losing the backsight","The circle resets to zero","The instrument automatically compensates"]'::jsonb,
 'The accumulated reading is preserved but the telescope swings freely relative to the circle, losing the backsight',
 'The upper clamp controls the telescope relative to the circle. Releasing it while you should release the lower clamp means the telescope moves but the circle stays fixed. You lose your pointing on the backsight while the accumulated reading is preserved. However, you cannot properly re-point to the backsight this way. You must re-lock the upper clamp, release the lower clamp to swing to the backsight, then proceed correctly.',
 'hard',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','quiz','clamp-error','troubleshooting']),

-- Q12  Numeric Input  Hard
('A 6-station closed figure is measured with a 5″ instrument (K = 5″). The measured angles sum to 720°00''15". (a) What is the misclosure? (b) What is the allowable? (c) Is it within tolerance? Give 1 for yes, 0 for no.',
 'numeric_input',
 '[]'::jsonb,
 '0',
 'Expected = (6−2)×180° = 720°. Misclosure = 15″. Allowable = 5″ × √6 = 12.2″. Since 15″ > 12.2″, the misclosure is NOT within tolerance. Answer = 0 (No).',
 'hard',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','quiz','tolerance-check','6-sided']),

-- Q13  Essay  Hard
('Describe the complete field procedure for measuring one interior angle at a traverse station using 2D + 2R repetitions. Include: (a) instrument setup, (b) the sequence of clamp operations for each repetition, (c) the transition from Direct to Reverse, (d) how to compute the mean angle, and (e) what to record in the field book.',
 'essay',
 '[]'::jsonb,
 'Key points: (a) Place tripod over mark, mount tribrach/instrument, rough-level, center with plummet, fine-level with plate bubble, iterate, measure HI. (b) Rep 1: sight BS, zero circle, release upper clamp, turn CW to FS, read accumulated. Rep 2: release lower clamp, swing to BS (circle preserved), lock lower, release upper clamp, turn to FS, read accumulated. (c) After 2D reps: plunge telescope (transit to Face Right). (d) Continue same clamp sequence for 2 more reps in Face Right. Final accumulated / 4 = mean angle. If accumulated passed 360°, add 360° × (number of passes) before dividing. (e) Record: station ID, HI, BS/FS IDs, method (2D+2R), initial reading, each intermediate accumulated reading, final accumulated reading, number of reps, computed mean.',
 'A thorough answer walks through the clamp sequence step by step, distinguishes the roles of upper and lower clamps, and includes the Face Right transition.',
 'hard',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','quiz','essay','repetition-procedure','comprehensive']),

-- Q14  Essay  Medium
('Why is it critical to compute angular closure in the field rather than waiting until you return to the office? Describe what information you need, how you compute closure, and what you do if the closure exceeds the allowable tolerance.',
 'essay',
 '[]'::jsonb,
 'Key points: Computing closure in the field allows detection and correction of angular blunders while still on site. Waiting until the office means any blown angle requires an expensive return trip — crew time, equipment, travel, and project delay. Information needed: all measured mean angles and the number of stations (n). Computation: sum all interior angles and compare to (n−2)×180°. The difference is the misclosure. Compare to allowable = K×√n. If within tolerance: angles can be balanced later. If exceeded: identify the suspect angle (worst conditions — longest sightlines, wind, poor centering) and re-measure. If re-measuring one angle does not fix the closure, consider re-measuring additional angles or all angles.',
 'A good answer emphasizes the cost of return trips, shows the closure formula, and describes a practical strategy for identifying and re-measuring suspect angles.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','quiz','essay','field-closure','cost-benefit']);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. PRACTICE PROBLEMS
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- Practice 1: Allowable misclosure
('Practice: Compute the allowable angular misclosure for a 4-station closed figure measured with a 5″ instrument (K = 5″). Round to 1 decimal.',
 'numeric_input', '[]'::jsonb,
 '10.0',
 'Allowable = K × √n = 5″ × √4 = 5 × 2.0 = 10.0″.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','practice','allowable-misclosure']),

-- Practice 2: Repetition mean (no wrap)
('Practice: An angle is measured with 4 repetitions (2D+2R). The accumulated reading is 349°44''20". Compute the mean angle. Give the minutes portion only.',
 'numeric_input', '[]'::jsonb,
 '26',
 'Mean = 349°44′20″ / 4. Convert to seconds: 349×3600 + 44×60 + 20 = 1,256,400 + 2,640 + 20 = 1,259,060″. Divide by 4: 314,765″. Convert: 314,765/3600 = 87° remainder 1565″. 1565/60 = 26′ remainder 5″. Mean = 87°26′05″. Minutes = 26.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','practice','repetition','mean-angle']),

-- Practice 3: Angular misclosure computation
('Practice: A 5-station figure has measured interior angles: 108°12''34", 112°45''18", 96°33''42", 110°28''22", 111°59''50". What is the angular misclosure in seconds?',
 'numeric_input', '[]'::jsonb,
 '-14',
 'Expected = (5−2)×180° = 540°. Seconds: 34+18+42+22+50 = 166″ = 2′46″. Minutes: 12+45+33+28+59 + 2(carry) = 179′ = 2°59′. Degrees: 108+112+96+110+111 + 2(carry) = 539°. Total = 539°59′46″. Misclosure = 539°59′46″ − 540°00′00″ = −14″.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','practice','angular-misclosure','DMS-addition']),

-- Practice 4: Pass/fail check
('Practice: A 5-station figure measured with a 5″ instrument has a misclosure of −14″. The allowable misclosure is 5″ × √5 = 11.2″. Does the misclosure exceed tolerance?',
 'multiple_choice',
 '["No — 14″ is close enough to 11.2″","Yes — |−14″| = 14″ exceeds 11.2″; the suspect angle must be re-measured","Cannot determine without more information","Only if the misclosure is positive"]'::jsonb,
 'Yes — |−14″| = 14″ exceeds 11.2″; the suspect angle must be re-measured',
 'The absolute value of the misclosure (14″) exceeds the allowable (11.2″). The sign does not matter — positive or negative misclosure is equally bad. The surveyor must identify the suspect angle and re-measure before leaving the field.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','practice','tolerance-check','re-measure']),

-- Practice 5: Equal distribution
('Practice: A 6-station figure has a misclosure of +18″. Using equal distribution, what correction is applied to each angle?',
 'numeric_input', '[]'::jsonb,
 '-3',
 'Correction = −misclosure / n = −18″ / 6 = −3″ per angle.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','practice','equal-distribution','balancing']),

-- Practice 6: Repetition with 360° wrap
('Practice: An angle of approximately 95° is measured with 4 repetitions. The circle reads 20°14''48". Since 4 × 95° = 380° > 360°, the circle has passed 360° once. What is the mean angle? Give the full answer in degrees (degrees portion only).',
 'numeric_input', '[]'::jsonb,
 '95',
 'True accumulated = 360° + 20°14′48″ = 380°14′48″. Mean = 380°14′48″ / 4. Convert: 380×3600 + 14×60 + 48 = 1,368,000 + 840 + 48 = 1,368,888″. Divide by 4: 342,222″. Convert: 342,222/3600 = 95° remainder 222″. 222/60 = 3′ remainder 42″. Mean = 95°03′42″. Degrees = 95.',
 'hard',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','practice','repetition','360-wrap']),

-- Practice 7: Crew role scenario
('Practice: During the lab, the rod person at the foresight station moves the prism pole 2 inches to the side to avoid standing on an ant mound, without telling the instrument operator. How would this error most likely appear in the data?',
 'multiple_choice',
 '["The distance would be wrong but the angle correct","The angle would be wrong because the target is no longer over the station mark","Both angle and distance would be correct — 2 inches is negligible","The leveling would be affected"]'::jsonb,
 'The angle would be wrong because the target is no longer over the station mark',
 'Moving the prism 2 inches (~50 mm) off the station mark means the instrument is pointing at the wrong position. Over a short sightline (e.g., 30 m), 50 mm of offset produces about 344″ (~5.7′) of angular error — catastrophic. Over 100 m, it produces about 103″. The rod person must hold the pole exactly over the mark and communicate any problems to the crew.',
 'hard',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','practice','prism-offset','crew-communication']),

-- Practice 8: Post-lab report essay
('Practice: After completing the field exercise, you must write a lab report. Describe what should be included: (a) the tabulated raw mean angles, (b) the angular misclosure computation, (c) the allowable misclosure check, (d) the balanced angles, and (e) a sketch of the figure with all angles labeled.',
 'essay', '[]'::jsonb,
 'Key points: (a) Table with columns: Station, Backsight, Foresight, Mean Angle (from repetitions). One row per station. (b) Sum all mean angles. Compute expected sum = (n−2)×180°. Misclosure = measured sum − expected sum. Show the arithmetic. (c) Compute allowable = K×√n for the instrument and accuracy standard used. State pass/fail: |misclosure| ≤ allowable? (d) Correction per angle = −misclosure/n. Table showing original angle and balanced angle for each station. Verify balanced angles sum to exactly (n−2)×180°. (e) Plan-view sketch showing station positions, traverse lines, north arrow, balanced angle values at each station, and reference features from the field. The sketch should match what was drawn in the field book.',
 'A complete answer describes all five components with correct formulas and formatting expectations.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-5','practice','essay','lab-report','post-lab']);
