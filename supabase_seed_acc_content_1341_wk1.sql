-- ============================================================================
-- ACC SRVY 1341 — Week 1: Course Introduction & SRVY 1301 Review
-- Full lesson content, topics, quiz questions (14), and practice problems
-- Module ID: acc00003-0000-0000-0000-000000000003
-- Lesson ID: acc03b01-0000-0000-0000-000000000001
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. UPDATE LESSON CONTENT
-- ────────────────────────────────────────────────────────────────────────────

UPDATE learning_lessons SET content = '
<h2>Welcome to SRVY 1341 — Land Surveying</h2>

<p>SRVY 1341 builds directly on the foundations you established in SRVY 1301: Introduction to Surveying. Where 1301 introduced the tools and basic techniques of the profession, this course focuses on the <strong>computational and analytical methods</strong> that transform raw field measurements into reliable coordinates, boundaries, and legal descriptions. Over the next 16 weeks you will master traverse computations, coordinate geometry, area calculations, boundary analysis, and adjustment techniques that every practicing land surveyor in Texas must know.</p>

<p>This first week serves two purposes: (1) orient you to the course structure, grading, and expectations, and (2) provide a thorough review of the SRVY 1301 concepts you will apply every week going forward. If any of these review topics feel rusty, now is the time to shore them up — every computation in this course depends on a solid grasp of measurement theory, leveling, distance measurement, and angular relationships.</p>

<h2>Course Structure and Objectives</h2>

<p>SRVY 1341 is the lecture companion to SRVY 1335 (Lab). While 1335 puts instruments in your hands, 1341 gives you the mathematical framework to <em>process, adjust, and verify</em> the data you collect. The major topic blocks are:</p>

<table>
<thead><tr><th>Weeks</th><th>Topic Block</th><th>Key Skills</th></tr></thead>
<tbody>
<tr><td>1</td><td>Review &amp; Orientation</td><td>Measurement theory, leveling, angles, distances</td></tr>
<tr><td>2–3</td><td>Traverse Types &amp; Field Procedures</td><td>Open/closed traverses, angle methods, field checks</td></tr>
<tr><td>4–7</td><td>Traverse Computations &amp; Adjustment</td><td>Lat/dep, closure, compass rule, transit rule, coordinates</td></tr>
<tr><td>8</td><td>Midterm Exam</td><td>Weeks 1–7 comprehensive</td></tr>
<tr><td>9–10</td><td>Coordinate Geometry &amp; Areas</td><td>Inverse, intersection, coordinate area, DMD</td></tr>
<tr><td>11–12</td><td>Boundary Surveying</td><td>Evidence, priority of calls, retracement, lost corners</td></tr>
<tr><td>13–14</td><td>Subdivisions, Curves &amp; Software</td><td>Platting, horizontal curves, COGO, spreadsheets</td></tr>
<tr><td>15</td><td>Standards &amp; Professional Practice</td><td>TBPELS rules, ALTA/NSPS standards, ethics</td></tr>
<tr><td>16</td><td>Final Exam</td><td>Comprehensive</td></tr>
</tbody>
</table>

<p><strong>Grading breakdown (typical):</strong> Homework 25 %, Quizzes 15 %, Midterm 25 %, Final 35 %. Your instructor may adjust these weights — always refer to the official syllabus.</p>

<h2>Review: Measurement Theory</h2>

<p>Every number a surveyor records is an <strong>observation</strong>, not an absolute truth. Understanding how errors behave is critical to knowing when your work is good enough — and when it is not.</p>

<h3>Types of Errors</h3>
<ul>
<li><strong>Systematic errors</strong> — follow a predictable pattern and can be corrected. Examples: a steel tape that is 0.02 ft too long, an instrument whose vertical axis is not truly vertical, atmospheric refraction. Systematic errors <em>accumulate</em> in one direction and do not cancel out.</li>
<li><strong>Random errors</strong> — small, unavoidable variations that follow a normal (bell-curve) distribution. They are equally likely to be positive or negative. Repeated observations reduce their effect. The <em>standard deviation</em> quantifies the spread of random errors.</li>
<li><strong>Blunders (mistakes)</strong> — large errors caused by human carelessness: reading the wrong graduation, transposing digits, occupying the wrong point. Blunders are detected by redundant measurements and field checks — they must be eliminated, not adjusted.</li>
</ul>

<h3>Precision vs. Accuracy</h3>
<p><strong>Precision</strong> describes the repeatability of measurements — how closely repeated observations agree with each other. <strong>Accuracy</strong> describes how close a measurement is to the true (or accepted) value. A set of measurements can be precise but inaccurate (e.g., a mis-calibrated tape gives consistent but wrong distances). The goal is always both high precision <em>and</em> high accuracy.</p>

<p>Key formulas from SRVY 1301:</p>
<ul>
<li><strong>Most probable value (mean):</strong> x&#772; = &Sigma;x<sub>i</sub> / n</li>
<li><strong>Standard deviation:</strong> s = &radic;[&Sigma;(x<sub>i</sub> &minus; x&#772;)&sup2; / (n &minus; 1)]</li>
<li><strong>Standard error of the mean:</strong> s<sub>x&#772;</sub> = s / &radic;n</li>
</ul>

<h2>Review: Leveling</h2>

<p>Differential leveling determines <strong>elevation differences</strong> between points using a level instrument and a graduated rod. It is the most precise method of establishing vertical control.</p>

<h3>The HI Method</h3>
<ol>
<li>Set up the level roughly midway between the benchmark (BM) and the point of interest.</li>
<li>Read a <strong>backsight (BS)</strong> on the rod held on the BM.</li>
<li>Compute the <strong>Height of Instrument (HI)</strong>: HI = Elev<sub>BM</sub> + BS</li>
<li>Turn the instrument toward the unknown point and read the <strong>foresight (FS)</strong>.</li>
<li>Compute the point''s elevation: Elev = HI &minus; FS</li>
</ol>

<p><strong>Example:</strong> BM elevation = 512.34 ft, BS = 6.78 ft, FS = 3.45 ft.</p>
<ul>
<li>HI = 512.34 + 6.78 = <strong>519.12 ft</strong></li>
<li>Elevation of new point = 519.12 &minus; 3.45 = <strong>515.67 ft</strong></li>
</ul>

<p>When the distance is too great for a single setup, you use <strong>turning points (TPs)</strong>. At each TP the rod stays in place while you read a FS, move the instrument, then read a BS on the same TP before continuing forward.</p>

<h3>Leveling Checks</h3>
<p>A level circuit that returns to the starting BM should close. The <strong>misclosure</strong> is the difference between the known BM elevation and the computed return elevation. Allowable misclosure depends on the order of survey:</p>
<table>
<thead><tr><th>Order</th><th>Allowable Misclosure</th></tr></thead>
<tbody>
<tr><td>First Order, Class I</td><td>&plusmn; 0.5 mm &times; &radic;K</td></tr>
<tr><td>Second Order, Class I</td><td>&plusmn; 6 mm &times; &radic;K</td></tr>
<tr><td>Third Order</td><td>&plusmn; 12 mm &times; &radic;K</td></tr>
</tbody>
</table>
<p>where K is the total leveling distance in kilometers.</p>

<h2>Review: Distance Measurement</h2>

<h3>Taping</h3>
<p>Steel tapes are still used for short, precise measurements. Three corrections commonly applied:</p>
<ul>
<li><strong>Temperature correction:</strong> C<sub>t</sub> = &alpha; &times; L &times; (T &minus; T<sub>s</sub>), where &alpha; = 0.00000645 per &deg;F for steel, L is the measured length, T is the field temperature, and T<sub>s</sub> is the standardization temperature (usually 68 &deg;F).</li>
<li><strong>Tension correction:</strong> C<sub>p</sub> = (P &minus; P<sub>s</sub>) &times; L / (A &times; E), where P is applied tension, P<sub>s</sub> is standard tension, A is cross-sectional area, and E is the modulus of elasticity.</li>
<li><strong>Sag correction:</strong> C<sub>s</sub> = &minus;w&sup2; &times; L&sup3; / (24 &times; P&sup2;), always negative (the tape hangs below a straight line).</li>
</ul>

<h3>Electronic Distance Measurement (EDM)</h3>
<p>Modern EDMs use modulated infrared or laser signals reflected by a prism. The instrument measures the phase difference of the returned signal to compute distance. EDMs are affected by <strong>atmospheric conditions</strong> — temperature and pressure change the speed of light through air, requiring a parts-per-million (ppm) correction. Most instruments let you key in temperature and pressure for automatic correction.</p>

<p><strong>Slope to horizontal:</strong> When an EDM measures a slope distance (SD), you convert to horizontal distance (HD) using the vertical angle (&alpha;):</p>
<p>HD = SD &times; cos(&alpha;)</p>

<h2>Review: Angles and Directions</h2>

<h3>Azimuths</h3>
<p>An <strong>azimuth</strong> is a direction measured clockwise from north, ranging from 0&deg; to 360&deg;. Azimuths are unambiguous — every direction has exactly one azimuth value.</p>

<h3>Bearings</h3>
<p>A <strong>bearing</strong> is a direction expressed as an angle east or west of the north-south line. Format: N 45&deg;30''00" E. Bearings range from 0&deg; to 90&deg; and require a quadrant designation (NE, SE, SW, NW).</p>

<h3>Converting Between Azimuths and Bearings</h3>
<table>
<thead><tr><th>Quadrant</th><th>Azimuth Range</th><th>Bearing Formula</th><th>Example</th></tr></thead>
<tbody>
<tr><td>NE</td><td>0&deg; – 90&deg;</td><td>Bearing = Azimuth</td><td>Az 45&deg; &rarr; N 45&deg;00''00" E</td></tr>
<tr><td>SE</td><td>90&deg; – 180&deg;</td><td>Bearing = 180&deg; &minus; Azimuth</td><td>Az 135&deg; &rarr; S 45&deg;00''00" E</td></tr>
<tr><td>SW</td><td>180&deg; – 270&deg;</td><td>Bearing = Azimuth &minus; 180&deg;</td><td>Az 225&deg; &rarr; S 45&deg;00''00" W</td></tr>
<tr><td>NW</td><td>270&deg; – 360&deg;</td><td>Bearing = 360&deg; &minus; Azimuth</td><td>Az 315&deg; &rarr; N 45&deg;00''00" W</td></tr>
</tbody>
</table>

<h3>Interior Angles</h3>
<p>For a closed polygon traverse with <em>n</em> sides, the sum of interior angles must equal:</p>
<p><strong>&Sigma; Interior Angles = (n &minus; 2) &times; 180&deg;</strong></p>
<p>Examples: triangle (3 sides) = 180&deg;, quadrilateral (4) = 360&deg;, pentagon (5) = 540&deg;, hexagon (6) = 720&deg;.</p>

<h3>DMS Arithmetic</h3>
<p>Surveyors work in degrees-minutes-seconds (DMS). When adding or subtracting:</p>
<ul>
<li>Add/subtract seconds first. If seconds &ge; 60, carry 1 minute.</li>
<li>Add/subtract minutes. If minutes &ge; 60, carry 1 degree.</li>
<li>Add/subtract degrees.</li>
</ul>
<p><strong>Example:</strong> 47&deg;38''45" + 85&deg;42''30" = 133&deg;21''15"</p>
<p>45" + 30" = 75" = 1''15" (carry 1 minute). 38'' + 42'' + 1'' = 81'' = 1&deg;21'' (carry 1 degree). 47&deg; + 85&deg; + 1&deg; = 133&deg;. Result: 133&deg;21''15".</p>

<h2>The Surveying Workflow</h2>

<p>Every survey project follows a general workflow that connects field work to final deliverables:</p>
<ol>
<li><strong>Project planning</strong> — research deeds, plats, and control; define scope and accuracy requirements.</li>
<li><strong>Reconnaissance</strong> — visit the site; locate monuments, access routes, and hazards.</li>
<li><strong>Control establishment</strong> — set or verify horizontal and vertical control points.</li>
<li><strong>Data collection</strong> — measure angles, distances, and elevations in the field.</li>
<li><strong>Computation &amp; adjustment</strong> — compute coordinates, adjust for closure, verify accuracy.</li>
<li><strong>Mapping &amp; deliverables</strong> — produce plats, descriptions, reports, and digital data.</li>
</ol>

<p>SRVY 1341 focuses primarily on steps 5 and 6 — turning raw measurements into reliable, adjusted results. The lab course (SRVY 1335) handles steps 2–4.</p>

<h2>Looking Ahead</h2>

<p>Starting next week, we dive into <strong>traverse types and planning</strong>. A traverse is the backbone of nearly every boundary and control survey. Understanding the different traverse configurations — and when each is appropriate — will set the stage for the computation methods that follow in weeks 4–7. Make sure your calculator is set to <strong>degrees</strong> mode (not radians) and that you are comfortable with trigonometric functions (sin, cos, tan) and inverse trig functions (arctan, atan2).</p>
',

resources = '[
  {"title":"Surveying Mathematics Review Sheet","url":"https://www.e-education.psu.edu/geog862/node/1725","type":"reference"},
  {"title":"SRVY 1301 Formula Reference Card","url":"https://www.surveyingmath.com/formulas","type":"pdf"},
  {"title":"DMS Calculator (Online)","url":"https://www.calculator.net/angle-calculator.html","type":"tool"}
]'::jsonb,

videos = '[
  {"title":"Precision vs Accuracy Explained for Surveyors","url":"https://www.youtube.com/watch?v=hRAFPdDppzs"},
  {"title":"Differential Leveling Step by Step","url":"https://www.youtube.com/watch?v=oc_AdMmLOqk"}
]'::jsonb,

key_takeaways = ARRAY[
  'Review key concepts from SRVY 1301 including measurement theory, leveling, distances, and angles',
  'Distinguish between systematic errors, random errors, and blunders',
  'Compute elevations using the HI method for differential leveling',
  'Convert between azimuths and bearings in all four quadrants',
  'Perform DMS (degrees-minutes-seconds) arithmetic correctly',
  'Understand the surveying workflow from planning through deliverables'
]

WHERE id = 'acc03b01-0000-0000-0000-000000000001';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. TOPICS
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM learning_topics WHERE lesson_id = 'acc03b01-0000-0000-0000-000000000001';

INSERT INTO learning_topics (id, lesson_id, title, content, order_index, keywords) VALUES

('acc03a01-0001-0000-0000-000000000001', 'acc03b01-0000-0000-0000-000000000001',
 'Measurement Theory: Errors, Precision & Accuracy',
 'Every surveying measurement contains some degree of error. Systematic errors are predictable and correctable — a steel tape calibrated at 68°F that is used at 95°F will consistently read too short, and a temperature correction formula removes the bias. Random errors are the small, unpredictable fluctuations that remain after all systematic corrections are applied; they follow a normal distribution and are reduced (but never eliminated) by taking multiple observations and averaging. Blunders are gross mistakes — reading 278 instead of 287, occupying the wrong point — that must be detected through redundancy (extra measurements) and eliminated entirely. Precision measures how tightly grouped your repeated measurements are (low standard deviation = high precision). Accuracy measures how close the mean of your measurements is to the true value. A survey can be precise but inaccurate if a systematic error biases all readings in the same direction.',
 1,
 ARRAY['systematic error','random error','blunder','precision','accuracy','standard deviation','most probable value','normal distribution','redundancy','calibration']),

('acc03a01-0002-0000-0000-000000000001', 'acc03b01-0000-0000-0000-000000000001',
 'Differential Leveling Review',
 'Differential leveling is the most accurate method for determining elevation differences. The instrument (an automatic or digital level) is set up midway between a known benchmark (BM) and the point whose elevation is needed. A backsight (BS) reading on the BM rod gives the Height of Instrument: HI = Elev_BM + BS. A foresight (FS) reading on the unknown point gives its elevation: Elev = HI − FS. For long circuits, turning points (TPs) act as temporary benchmarks — the rod stays on the TP while the instrument leapfrogs forward. A properly closed level loop returns to the starting BM; the difference between the known and computed elevation is the misclosure. Acceptable misclosure depends on the survey order (First, Second, Third) and the total distance leveled. Error is distributed proportionally among the TPs when the misclosure is within tolerance.',
 2,
 ARRAY['differential leveling','backsight','foresight','height of instrument','HI method','turning point','benchmark','misclosure','level circuit','rod reading','automatic level']),

('acc03a01-0003-0000-0000-000000000001', 'acc03b01-0000-0000-0000-000000000001',
 'Distance Measurement: Taping & EDM',
 'Steel taping remains relevant for short precise measurements and serves as a check on electronic methods. Three standard corrections apply: temperature (steel expands/contracts with heat), tension (pulling harder stretches the tape), and sag (an unsupported tape droops below a straight line, making the measured distance too long). EDM instruments (Electronic Distance Measurement) use modulated infrared or laser signals reflected by a prism or reflectorless surface. The instrument measures the phase shift of the return signal to compute slope distance, then uses the measured vertical angle to reduce to horizontal distance: HD = SD × cos(α). Atmospheric corrections account for the fact that temperature and barometric pressure alter the speed of light through air, introducing a parts-per-million error. Most modern total stations accept field-entered T and P values and apply the correction automatically.',
 3,
 ARRAY['steel tape','temperature correction','tension correction','sag correction','EDM','slope distance','horizontal distance','atmospheric correction','prism','reflectorless','phase shift']),

('acc03a01-0004-0000-0000-000000000001', 'acc03b01-0000-0000-0000-000000000001',
 'Angles and Directions: Azimuths, Bearings & DMS Math',
 'Directions in surveying are expressed as either azimuths or bearings. An azimuth is measured clockwise from north and ranges from 0° to 360° — it is unambiguous and convenient for computation. A bearing is measured from the north or south line toward east or west, ranges from 0° to 90°, and requires a quadrant label (e.g., N 45°30''00" E). Converting between them requires knowing which quadrant the direction falls in: NE quadrant bearing equals the azimuth; SE bearing = 180° − azimuth; SW bearing = azimuth − 180°; NW bearing = 360° − azimuth. Interior angles of a closed polygon sum to (n−2)×180°. Surveyors perform arithmetic in degrees-minutes-seconds (DMS): add or subtract seconds first (carry 60" = 1''), then minutes (carry 60'' = 1°), then degrees. Mastery of DMS arithmetic is essential — nearly every computation in this course uses it.',
 4,
 ARRAY['azimuth','bearing','quadrant','north','clockwise','interior angle','DMS','degrees minutes seconds','conversion','polygon','direction']);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. QUIZ QUESTIONS (14 questions — mixed types and difficulties)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM question_bank
WHERE lesson_id = 'acc03b01-0000-0000-0000-000000000001'
  AND tags @> ARRAY['acc-srvy-1341','week-1'];

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- Q1  Multiple Choice  Easy
('Which type of error follows a predictable pattern and can be mathematically corrected?',
 'multiple_choice',
 '["Random error","Systematic error","Blunder","Probable error"]'::jsonb,
 'Systematic error',
 'Systematic errors are predictable — they always push the measurement in the same direction (e.g., a tape that is 0.01 ft too long). Because the pattern is known, a correction formula can remove the bias. Random errors are unpredictable, and blunders are gross mistakes.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','measurement-theory','errors']),

-- Q2  Multiple Choice  Easy
('An azimuth of 225° falls in which quadrant?',
 'multiple_choice',
 '["Northeast","Southeast","Southwest","Northwest"]'::jsonb,
 'Southwest',
 'Azimuths are measured clockwise from north. 0°–90° = NE, 90°–180° = SE, 180°–270° = SW, 270°–360° = NW. Since 225° is between 180° and 270°, it falls in the southwest quadrant.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','azimuths','quadrant']),

-- Q3  True/False  Easy
('Precision and accuracy mean the same thing in surveying.',
 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'Precision refers to how closely repeated measurements agree with each other (repeatability). Accuracy refers to how close measurements are to the true value. A set of measurements can be precise but inaccurate if a systematic error shifts all values in the same direction.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','precision','accuracy']),

-- Q4  True/False  Easy
('In differential leveling, the Height of Instrument (HI) equals the benchmark elevation plus the backsight reading.',
 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'HI = Elevation_BM + BS. The backsight reading on the rod held at the benchmark is added to the known BM elevation to get the height of the instrument''s line of sight above the datum.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','leveling','HI-method']),

-- Q5  Multiple Choice  Medium
('A bearing of S 52°15''00" E corresponds to what azimuth?',
 'multiple_choice',
 '["52°15''00\"","127°45''00\"","232°15''00\"","307°45''00\""]'::jsonb,
 '127°45''00"',
 'A SE bearing converts to azimuth by: Az = 180° − bearing angle. Az = 180°00''00" − 52°15''00" = 127°45''00". In the SE quadrant, azimuths range from 90° to 180°.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','bearing','azimuth','conversion']),

-- Q6  Multiple Choice  Medium
('Which correction is always negative (makes the corrected distance shorter than the measured distance)?',
 'multiple_choice',
 '["Temperature correction","Sag correction","Tension correction","Atmospheric correction"]'::jsonb,
 'Sag correction',
 'A tape supported only at its ends sags below a straight line, making the distance measured along the catenary longer than the true straight-line distance. The sag correction C_s = −w²L³/(24P²) is therefore always negative. Temperature and tension corrections can be positive or negative depending on field conditions vs. standard conditions.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','taping','sag-correction']),

-- Q7  Numeric Input  Medium (Leveling computation)
('A benchmark has an elevation of 487.52 ft. The backsight reading is 8.34 ft and the foresight reading to an unknown point is 5.17 ft. What is the elevation of the unknown point? (Answer in feet, round to 2 decimal places)',
 'numeric_input',
 '[]'::jsonb,
 '490.69',
 'Step 1: HI = BM elevation + BS = 487.52 + 8.34 = 495.86 ft. Step 2: Elevation = HI − FS = 495.86 − 5.17 = 490.69 ft.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','leveling','computation','HI-method']),

-- Q8  Numeric Input  Medium (DMS arithmetic)
('Add the following two angles: 67°48''35" + 54°23''48". Express your answer in decimal degrees rounded to 4 decimal places. (Hint: 122°12''23" = 122.2064°)',
 'numeric_input',
 '[]'::jsonb,
 '122.2064',
 'Step 1: Add seconds: 35" + 48" = 83" = 1''23" (carry 1 minute). Step 2: Add minutes: 48'' + 23'' + 1'' = 72'' = 1°12'' (carry 1 degree). Step 3: Add degrees: 67° + 54° + 1° = 122°. Result: 122°12''23". Converting to decimal: 122 + 12/60 + 23/3600 = 122 + 0.2000 + 0.006389 = 122.2064°.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','DMS','arithmetic','angle-addition']),

-- Q9  Multiple Choice  Medium
('In the surveying workflow, which step comes immediately after data collection?',
 'multiple_choice',
 '["Reconnaissance","Computation and adjustment","Project planning","Mapping and deliverables"]'::jsonb,
 'Computation and adjustment',
 'The standard surveying workflow is: (1) Project planning, (2) Reconnaissance, (3) Control establishment, (4) Data collection, (5) Computation & adjustment, (6) Mapping & deliverables. Computation and adjustment transforms raw field data into reliable coordinates.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','workflow','surveying-process']),

-- Q10  Numeric Input  Hard (Multi-step leveling word problem)
('A surveyor runs a level circuit from BM Alpha (elev 325.18 ft) through three turning points to BM Beta. The readings are: BS₁ = 7.62, FS₁ = 4.31 (TP1); BS₂ = 9.15, FS₂ = 6.88 (TP2); BS₃ = 5.44, FS₃ = 8.07 (BM Beta). What is the computed elevation of BM Beta? (Round to 2 decimal places)',
 'numeric_input',
 '[]'::jsonb,
 '328.13',
 'HI₁ = 325.18 + 7.62 = 332.80; Elev_TP1 = 332.80 − 4.31 = 328.49. HI₂ = 328.49 + 9.15 = 337.64; Elev_TP2 = 337.64 − 6.88 = 330.76. HI₃ = 330.76 + 5.44 = 336.20; Elev_BM_Beta = 336.20 − 8.07 = 328.13 ft.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','leveling','turning-points','multi-step']),

-- Q11  Numeric Input  Hard (Slope-to-horizontal reduction)
('An EDM measures a slope distance of 412.85 ft at a vertical angle of 6°15''00" above horizontal. What is the horizontal distance? (Round to 2 decimal places)',
 'numeric_input',
 '[]'::jsonb,
 '410.40',
 'HD = SD × cos(vertical angle). First convert 6°15''00" to decimal: 6 + 15/60 = 6.25°. HD = 412.85 × cos(6.25°) = 412.85 × 0.99406 = 410.40 ft.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','EDM','slope-distance','horizontal-distance']),

-- Q12  Essay  Hard
('Explain the difference between systematic errors, random errors, and blunders in surveying. For each type, give one specific field example and describe how a surveyor should handle it.',
 'essay',
 '[]'::jsonb,
 'Key points: (1) Systematic errors are predictable, accumulate in one direction, and are removed by applying corrections (example: temperature correction for a steel tape used in heat). (2) Random errors are small, unpredictable, follow a normal distribution, and are reduced by averaging multiple observations (example: slight variations in reading a level rod). (3) Blunders are gross mistakes that must be detected through redundant measurements and eliminated — they cannot be adjusted away (example: reading 5.42 instead of 4.52 on a rod, or setting up over the wrong point). A complete answer discusses all three types with clear examples and appropriate remediation strategies.',
 'A strong answer will: define all three error types clearly; provide a realistic field example for each; explain the correct handling method (correction formula for systematic, averaging/statistics for random, redundancy/re-measurement for blunders); and note that blunders must be eliminated before any adjustment is performed.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','essay','measurement-theory','errors']),

-- Q13  Essay  Medium
('Describe the complete procedure for running a differential leveling circuit from a known benchmark to an unknown point and back. Include the purpose of turning points and how you would check your work.',
 'essay',
 '[]'::jsonb,
 'Key points: (1) Set up level midway between BM and first point. (2) Read BS on BM, compute HI = Elev_BM + BS. (3) Read FS on turning point or target, compute Elev = HI − FS. (4) Move instrument forward, use TP as new reference with a BS. (5) Repeat until reaching the unknown point. (6) To check: continue the circuit back to the original BM. (7) Compare computed return elevation to known BM elevation — the difference is the misclosure. (8) If misclosure is within tolerance, distribute error proportionally among TPs.',
 'A complete answer covers: the HI method formula, the role of turning points for extending the circuit, the concept of closing the loop back to the starting BM, computing misclosure, and evaluating whether the misclosure meets the required accuracy standard.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','essay','leveling','procedure']),

-- Q14  Multiple Choice  Hard (Azimuth/bearing conversion requiring careful math)
('An azimuth of 312°27''15" converts to which bearing?',
 'multiple_choice',
 '["N 47°32''45\" W","S 47°32''45\" W","N 42°27''15\" W","S 42°27''15\" E"]'::jsonb,
 'N 47°32''45" W',
 'An azimuth between 270° and 360° is in the NW quadrant. Bearing = 360°00''00" − 312°27''15". Subtract: 360°00''00" − 312°27''15" → 59''60" − 27''15" = 32''45", 359° − 312° = 47°. Bearing = N 47°32''45" W.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','bearing','azimuth','conversion','DMS']);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. PRACTICE PROBLEMS (tagged separately from quiz questions)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- Practice 1: Simple leveling
('Practice: BM elevation = 256.91 ft, BS = 5.43 ft, FS = 9.12 ft. What is the elevation of the foresight point?',
 'numeric_input', '[]'::jsonb,
 '253.22',
 'HI = 256.91 + 5.43 = 262.34. Elevation = 262.34 − 9.12 = 253.22 ft. Note that the FS is larger than the BS, so the new point is lower than the benchmark.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','practice','leveling']),

-- Practice 2: Azimuth to bearing
('Practice: Convert an azimuth of 158°30''00" to a bearing.',
 'multiple_choice',
 '["S 21°30''00\" E","N 21°30''00\" E","S 58°30''00\" E","N 158°30''00\" W"]'::jsonb,
 'S 21°30''00" E',
 'Az 158°30'' is in the SE quadrant (90°–180°). Bearing = 180° − 158°30'' = 21°30''. Direction: S 21°30''00" E.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','practice','azimuth','bearing']),

-- Practice 3: Bearing to azimuth
('Practice: Convert a bearing of S 73°45''20" W to an azimuth.',
 'numeric_input', '[]'::jsonb,
 '253.7556',
 'SW quadrant: Az = 180° + bearing angle = 180° + 73°45''20". In decimal: 73 + 45/60 + 20/3600 = 73.7556°. Az = 180 + 73.7556 = 253.7556°. (Or in DMS: 253°45''20".)',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','practice','bearing','azimuth']),

-- Practice 4: Interior angle sum
('Practice: A closed traverse has 8 sides. What should the interior angles sum to?',
 'numeric_input', '[]'::jsonb,
 '1080',
 '(n − 2) × 180° = (8 − 2) × 180° = 6 × 180° = 1080°.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','practice','interior-angles']),

-- Practice 5: DMS subtraction
('Practice: Subtract 38°52''17" from 125°15''04". Express your answer in DMS format as decimal degrees rounded to 4 places.',
 'numeric_input', '[]'::jsonb,
 '86.3797',
 'Seconds: 04" − 17" → borrow: 64" − 17" = 47" (subtract 1 from minutes). Minutes: 14'' − 52'' → borrow: 74'' − 52'' = 22'' (subtract 1 from degrees). Degrees: 124° − 38° = 86°. Result: 86°22''47". Decimal: 86 + 22/60 + 47/3600 = 86 + 0.3667 + 0.01306 = 86.3797°.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','practice','DMS','subtraction']),

-- Practice 6: Multi-step level circuit (word problem)
('Practice: A surveyor levels from BM Oak (elev 401.55 ft) to point X using two turning points. Readings: BS₁=6.21, FS₁=3.89 (TP1); BS₂=7.33, FS₂=10.14 (Point X). Part (a): What is the elevation of TP1? Part (b): What is the elevation of Point X? Give your answer for Part (b) only.',
 'numeric_input', '[]'::jsonb,
 '401.06',
 'Part (a): HI₁ = 401.55 + 6.21 = 407.76; Elev_TP1 = 407.76 − 3.89 = 403.87 ft. Part (b): HI₂ = 403.87 + 7.33 = 411.20; Elev_X = 411.20 − 10.14 = 401.06 ft.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','practice','leveling','multi-step','word-problem']),

-- Practice 7: Slope distance to horizontal
('Practice: A total station measures a slope distance of 285.67 ft at a zenith angle of 86°30''00". What is the horizontal distance? (Remember: vertical angle = 90° − zenith angle). Round to 2 decimal places.',
 'numeric_input', '[]'::jsonb,
 '285.14',
 'Vertical angle from horizontal = 90° − 86°30'' = 3°30'' = 3.5°. HD = 285.67 × cos(3.5°) = 285.67 × 0.99813 = 285.14 ft. (Alternatively, HD = SD × sin(zenith) = 285.67 × sin(86.5°) = 285.67 × 0.99813 = 285.14 ft.)',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','practice','slope-distance','zenith-angle','trigonometry']),

-- Practice 8: Conceptual essay practice
('Practice: A survey crew measures the same distance five times and gets: 325.42, 325.44, 325.41, 325.43, 325.42 ft. (a) What is the most probable value? (b) Are these measurements more likely affected by random error or systematic error? Explain your reasoning.',
 'essay', '[]'::jsonb,
 'Key points: (a) Most probable value = mean = (325.42+325.44+325.41+325.43+325.42)/5 = 325.424 ft. (b) The measurements cluster tightly (range of 0.03 ft) suggesting high precision. The small variations are characteristic of random error — each measurement differs slightly and unpredictably from the mean. If a systematic error were present, all values would be shifted in the same direction, but we cannot detect that from internal evidence alone (we would need to compare to a known true distance).',
 'A good answer computes the mean correctly, identifies the small spread as evidence of random error, and notes that systematic error cannot be detected from repeated measurements alone — it requires comparison to an independent standard.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','practice','essay','statistics','error-analysis']);
