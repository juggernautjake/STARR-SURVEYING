-- ============================================================================
-- ACC SRVY 1335 — Week 2: Electronic Distance Measuring (EDM) Equipment
-- Full lesson content, topics, quiz questions (14), and practice problems (8)
-- Module ID: acc00002-0000-0000-0000-000000000002
-- Lesson ID: acc02b02-0000-0000-0000-000000000001
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. UPDATE LESSON CONTENT
-- ────────────────────────────────────────────────────────────────────────────

UPDATE learning_lessons SET content = '
<h2>Your First Hands-On Lab: Measuring Distances Electronically</h2>

<p>This week you move from the classroom to the field. You will set up a total station on a tripod, assemble a prism target, measure distances electronically, apply atmospheric corrections, and record everything in your field book. Electronic Distance Measurement (EDM) is the foundation of virtually all modern surveying — every traverse, boundary survey, and construction layout depends on accurate EDM distances.</p>

<p>By the end of this lab you should be able to set up, measure, correct, and record distances confidently and independently.</p>

<h2>How EDM Works</h2>

<p>An EDM measures distance by transmitting a <strong>modulated electromagnetic signal</strong> — typically infrared light — to a <strong>retroreflecting prism</strong> at the target point. The signal bounces back and the instrument measures the <strong>phase shift</strong> between the outgoing and returning waves. From the phase shift it computes the travel time and, knowing the speed of light in the atmosphere, derives the distance.</p>

<h3>The Measurement Process (Simplified)</h3>

<ol>
<li>The EDM transmits an infrared beam modulated at a known frequency</li>
<li>The beam travels to the prism and reflects directly back along the same path</li>
<li>The instrument compares the phase of the returned signal to the transmitted signal</li>
<li>The phase difference corresponds to a fraction of the modulation wavelength</li>
<li>Multiple modulation frequencies are used to resolve the total number of whole wavelengths (the "ambiguity")</li>
<li>The instrument reports the <strong>slope distance</strong> from the instrument to the prism</li>
</ol>

<p>Modern EDMs in total stations can measure distances up to several kilometers with a single prism, and shorter distances (up to ~200 m) in "reflectorless" mode using the return from a solid surface.</p>

<h3>EDM Accuracy Specification</h3>

<p>EDM accuracy is expressed as <strong>±(a mm + b ppm)</strong>, where:</p>
<ul>
<li><strong>a</strong> is the constant error (typically 1–3 mm) — independent of distance</li>
<li><strong>b</strong> is the proportional error (typically 1–3 ppm) — grows with distance</li>
</ul>

<p><strong>Example:</strong> An EDM rated at ±(2 mm + 2 ppm) measuring a distance of 500 m has an expected uncertainty of: 2 mm + (2 × 500/1,000,000 × 1,000,000 mm) = 2 mm + 1 mm = <strong>±3 mm</strong>.</p>

<p>For a 100 m distance: 2 mm + (2 × 0.1 mm) = <strong>±2.2 mm</strong>. The constant error dominates at short distances; the proportional error dominates at long distances.</p>

<h2>Setting Up the Equipment</h2>

<h3>Step 1: Tripod Setup</h3>

<p>You learned the tripod basics last week. Here is the full procedure you will execute today:</p>

<ol>
<li><strong>Position the tripod</strong> over the station mark. Spread the legs to form a stable triangle with the head roughly level.</li>
<li><strong>Push each leg</strong> firmly into the ground (or use a tripod pad on pavement). The instrument eyepiece should be at a comfortable viewing height.</li>
<li><strong>Check that the head is roughly level</strong> by eye before mounting the instrument.</li>
</ol>

<h3>Step 2: Mount the Tribrach and Instrument</h3>

<ol>
<li>Attach the <strong>tribrach</strong> to the tripod head using the center bolt.</li>
<li>Place the <strong>total station</strong> on the tribrach and engage the locking ring.</li>
<li><strong>Rough-level</strong> using the circular bubble — adjust the tripod legs until the bubble is approximately centered.</li>
<li><strong>Center over the mark</strong> using the optical plummet (or laser plummet). Look through the plummet eyepiece and slide the instrument on the tripod head until the crosshair is on the station mark.</li>
<li><strong>Fine-level</strong> using the plate bubble and three leveling screws:
  <ul>
  <li>Rotate the instrument so the plate bubble is parallel to two of the leveling screws</li>
  <li>Turn those two screws simultaneously in opposite directions until the bubble centers (the bubble follows your left thumb)</li>
  <li>Rotate 90° and center the bubble with the third screw</li>
  <li>Repeat until the bubble stays centered in all orientations</li>
  </ul>
</li>
<li><strong>Re-check centering</strong> — fine-leveling often shifts the instrument slightly off center. Re-center over the mark and re-level. Iterate until both conditions are satisfied.</li>
<li><strong>Measure and record HI</strong> (Height of Instrument) — the vertical distance from the ground mark to the trunnion axis.</li>
</ol>

<h3>Step 3: Assemble the Prism Target</h3>

<ol>
<li><strong>Thread the prism</strong> onto the prism holder/adapter.</li>
<li><strong>Attach the prism holder</strong> to the top of the prism pole (range pole).</li>
<li><strong>Set the prism pole height</strong> to match the HI if possible (this simplifies vertical angle computations), or to a convenient fixed height. Record the <strong>HR</strong> (Height of Reflector/Rod).</li>
<li><strong>Check the prism constant</strong> label on the prism housing. Common values are 0 mm (Leica-style) or −30 mm (standard). Ensure the total station is set to the correct prism constant.</li>
<li><strong>Level the prism pole</strong> using the attached circular bubble. The rod person must hold the pole plumb over the target point during every measurement.</li>
</ol>

<h2>Measuring Distances</h2>

<h3>The Measurement Procedure</h3>

<ol>
<li><strong>Power on</strong> the total station and enter or verify settings: units (meters or feet), atmospheric corrections (temperature and pressure), and prism constant.</li>
<li><strong>Sight the prism.</strong> Use the sighting notch or red-dot finder on the instrument to roughly aim at the prism. Then look through the telescope and use the horizontal and vertical tangent screws to precisely center the crosshair on the prism.</li>
<li><strong>Press the "Measure" button</strong> (or "DIST" key). The EDM fires and returns the slope distance, horizontal distance, and vertical difference. Most instruments display all three.</li>
<li><strong>Record the reading</strong> in your field book: slope distance, horizontal distance, zenith angle, and any vertical difference.</li>
<li><strong>Take at least three readings</strong> and verify they agree within the instrument''s specification. If one reading disagrees significantly, discard it and re-measure.</li>
<li><strong>Compute the mean</strong> of the accepted readings.</li>
</ol>

<h3>What the Instrument Reports</h3>

<table>
<thead><tr><th>Value</th><th>Symbol</th><th>Description</th></tr></thead>
<tbody>
<tr><td>Slope Distance</td><td>SD</td><td>The straight-line distance from instrument to prism along the line of sight</td></tr>
<tr><td>Horizontal Distance</td><td>HD</td><td>The distance projected onto a horizontal plane: HD = SD × sin(zenith angle)</td></tr>
<tr><td>Vertical Difference</td><td>VD</td><td>The elevation difference: VD = SD × cos(zenith angle) + HI − HR</td></tr>
<tr><td>Zenith Angle</td><td>ZA</td><td>The vertical angle from straight up (0°) to the line of sight (90° = horizontal)</td></tr>
</tbody>
</table>

<h2>Atmospheric Corrections</h2>

<p>The EDM computes distance based on the speed of its signal through the atmosphere. The speed of light in air depends on <strong>temperature</strong>, <strong>atmospheric pressure</strong>, and <strong>humidity</strong>. If conditions differ from the instrument''s standard reference (typically 15°C and 760 mmHg / 1013.25 hPa), the measured distance will have a systematic error.</p>

<h3>Why It Matters in Texas</h3>

<p>In central Texas:</p>
<ul>
<li>Summer temperatures routinely reach <strong>38–42°C (100–108°F)</strong> — far above the 15°C standard</li>
<li>Winter temperatures can drop to <strong>−5°C (23°F)</strong> during cold fronts</li>
<li>Temperature swings of 20°C in a single day are common in spring and fall</li>
</ul>

<p>At 38°C and standard pressure, the atmospheric correction is approximately <strong>+12 ppm</strong> compared to standard conditions. For a 1,000 m distance, that is <strong>+12 mm</strong>. For a 100 m distance, it is <strong>+1.2 mm</strong>. The correction is always positive in hot weather (the signal travels faster in warm air, so the uncorrected distance reads short).</p>

<h3>Applying the Correction</h3>

<p>Most modern total stations apply atmospheric corrections automatically when you enter the current temperature and pressure. You should:</p>

<ol>
<li><strong>Measure temperature</strong> at the instrument with a thermometer. Do not use the forecast temperature — local conditions near the ground may differ significantly.</li>
<li><strong>Measure pressure</strong> with a barometer or use the pressure from a nearby weather station, adjusted for elevation difference if needed.</li>
<li><strong>Enter both values</strong> into the total station''s atmospheric correction settings.</li>
<li><strong>Update periodically</strong> during long sessions — conditions change throughout the day.</li>
</ol>

<h3>The Atmospheric Correction Formula</h3>

<p>The correction in parts per million (ppm) can be approximated by:</p>

<p style="text-align:center;"><strong>C<sub>atm</sub> ≈ 281.8 − (79.661 × P) / (273.15 + T)</strong></p>

<p>where T is temperature in °C and P is pressure in hPa. The corrected distance is:</p>

<p style="text-align:center;"><strong>D<sub>corrected</sub> = D<sub>measured</sub> × (1 + C<sub>atm</sub> / 1,000,000)</strong></p>

<p>You do not need to memorize this formula — the instrument handles it — but you should understand that the correction exists and can be significant in Texas conditions.</p>

<h2>The Prism Constant</h2>

<p>The EDM measures the distance to the <strong>optical center</strong> of the prism, not to the physical center of the prism pole. The difference between these two points is the <strong>prism constant</strong> (also called the prism offset).</p>

<table>
<thead><tr><th>Prism Type</th><th>Typical Constant</th><th>Notes</th></tr></thead>
<tbody>
<tr><td>Standard (most brands)</td><td>−30 mm</td><td>The optical center is 30 mm behind the physical face</td></tr>
<tr><td>Leica-style (360° prism)</td><td>0 mm</td><td>Designed for zero offset</td></tr>
<tr><td>Mini prism</td><td>−17.5 mm to 0 mm</td><td>Varies by model</td></tr>
</tbody>
</table>

<p><strong>Critical:</strong> The prism constant set in the total station must match the prism being used. If you use a standard −30 mm prism but the instrument is set to 0 mm, every distance will be <strong>30 mm too long</strong>. On a traverse with 10 legs, that is a cumulative error of 300 mm (about 1 foot) — enough to blow any precision requirement.</p>

<h2>Slope Distance vs. Horizontal Distance</h2>

<p>The EDM measures <strong>slope distance</strong> — the straight-line distance through the air from the instrument to the prism. For surveying computations, you almost always need the <strong>horizontal distance</strong>.</p>

<p>The conversion uses the zenith angle (ZA) measured by the vertical circle:</p>

<p style="text-align:center; font-size:1.1em;"><strong>HD = SD × sin(ZA)</strong></p>

<p>where ZA is measured from the zenith (straight up = 0°, horizontal = 90°). Most total stations compute and display HD automatically.</p>

<p><strong>Example:</strong> SD = 215.482 m, ZA = 87°24′10″</p>
<p>HD = 215.482 × sin(87.4028°) = 215.482 × 0.99896 = <strong>215.258 m</strong></p>

<p>The difference (0.224 m ≈ 9 inches) matters. On steep terrain, the difference between slope and horizontal distance can be much larger.</p>

<h2>Recording EDM Measurements</h2>

<p>In your field book, record the following for each distance measurement:</p>

<table>
<thead><tr><th>Item</th><th>Example</th><th>Why</th></tr></thead>
<tbody>
<tr><td>From station</td><td>STA 1</td><td>Identifies the instrument position</td></tr>
<tr><td>To station</td><td>STA 2</td><td>Identifies the prism position</td></tr>
<tr><td>HI</td><td>1.523 m</td><td>Needed for elevation computation</td></tr>
<tr><td>HR (prism height)</td><td>1.800 m</td><td>Needed for elevation computation</td></tr>
<tr><td>Prism constant</td><td>−30 mm</td><td>Confirms correct setting</td></tr>
<tr><td>Temperature</td><td>34°C</td><td>For verifying atmospheric correction</td></tr>
<tr><td>Pressure</td><td>1008 hPa</td><td>For verifying atmospheric correction</td></tr>
<tr><td>SD (slope distance) — 3 readings</td><td>215.481, 215.483, 215.482</td><td>Redundancy and blunder check</td></tr>
<tr><td>Mean SD</td><td>215.482 m</td><td>Accepted value</td></tr>
<tr><td>ZA (zenith angle)</td><td>87°24′10″</td><td>For slope-to-horizontal conversion</td></tr>
<tr><td>HD (horizontal distance)</td><td>215.258 m</td><td>Used in computations</td></tr>
</tbody>
</table>

<h2>Common EDM Errors and How to Avoid Them</h2>

<table>
<thead><tr><th>Error</th><th>Cause</th><th>Prevention</th></tr></thead>
<tbody>
<tr><td>Wrong prism constant</td><td>Constant set for different prism type</td><td>Check the prism label and verify the total station setting before first measurement</td></tr>
<tr><td>Wrong atmospheric correction</td><td>Default values left in instrument; conditions changed</td><td>Measure and enter actual temperature and pressure; update during the day</td></tr>
<tr><td>Prism not plumb</td><td>Rod person not holding pole vertical</td><td>Use rod-level bubble; instrument operator should watch for leaning</td></tr>
<tr><td>Sighting wrong target</td><td>Multiple prisms in the area; reflective surfaces</td><td>Communicate with rod person; use only designated prism targets</td></tr>
<tr><td>Multipath interference</td><td>EDM beam reflects off nearby surfaces (vehicles, walls)</td><td>Ensure clear sightline; move instrument if readings are erratic</td></tr>
<tr><td>Heat shimmer</td><td>Atmospheric turbulence near hot ground surfaces</td><td>Raise sightline above ground; avoid low shots over pavement in afternoon</td></tr>
</tbody>
</table>

<h2>Today''s Lab Exercise</h2>

<p>You will measure a series of <strong>known distances</strong> on the campus baseline course — a set of permanently monumented points whose distances have been precisely determined by calibration. This allows you to:</p>

<ol>
<li>Practice the complete setup and measurement procedure</li>
<li>Verify that your instrument is reading correctly</li>
<li>Experience the effect of atmospheric corrections firsthand</li>
<li>Compare your measured distances to the known values</li>
</ol>

<p>Your goal is to measure each baseline distance within <strong>±5 mm</strong> of the known value. If your measurements are consistently off by a similar amount, check your prism constant and atmospheric correction settings first.</p>

<h2>Looking Ahead</h2>

<p>Next week you will learn <strong>differential leveling</strong> — using an automatic level and leveling rod to determine elevation differences between points. EDM distances are horizontal; leveling gives you the vertical component. Together, they define three-dimensional positions.</p>
',

resources = '[
  {"title":"EDM Principles and Atmospheric Corrections","url":"https://www.surveyingmath.com/edm-principles","type":"reference"},
  {"title":"Prism Constants Explained","url":"https://www.surveyingmath.com/prism-constant","type":"reference"},
  {"title":"Total Station Setup Guide","url":"https://www.surveyingmath.com/total-station-setup","type":"reference"}
]'::jsonb,

videos = '[
  {"title":"Setting Up a Total Station and Prism — Step by Step","url":"https://www.youtube.com/watch?v=3xLkVJrZjKI"},
  {"title":"EDM Measurement: How Electronic Distance Measurement Works","url":"https://www.youtube.com/watch?v=BGjg4vCpfrs"}
]'::jsonb,

key_takeaways = ARRAY[
  'Explain how EDM measures distance using phase-shift comparison of a modulated infrared beam',
  'Set up a total station on a tripod: mount tribrach, rough-level, center, fine-level, measure HI',
  'Assemble a prism target on a pole, set the correct height (HR), and verify the prism constant',
  'Take multiple distance readings and compute the mean for a reliable measurement',
  'Apply atmospheric corrections by entering actual temperature and pressure into the instrument',
  'Distinguish between slope distance and horizontal distance and convert between them using HD = SD × sin(ZA)',
  'Record all required EDM data in a field book including HI, HR, prism constant, atmospheric conditions, and multiple readings'
]

WHERE id = 'acc02b02-0000-0000-0000-000000000001';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. TOPICS
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM learning_topics WHERE lesson_id = 'acc02b02-0000-0000-0000-000000000001';

INSERT INTO learning_topics (id, lesson_id, title, content, order_index, keywords) VALUES

('acc02a02-0001-0000-0000-000000000001', 'acc02b02-0000-0000-0000-000000000001',
 'EDM Principles: Phase-Shift Measurement',
 'Electronic Distance Measurement works by transmitting a modulated infrared beam to a retroreflecting prism and measuring the phase shift of the returned signal. The phase difference reveals the fractional wavelength of the travel path; multiple modulation frequencies resolve the total number of whole wavelengths (the ambiguity), yielding the full distance. The result is a slope distance from the instrument trunnion axis to the prism optical center. EDM accuracy is specified as ±(a mm + b ppm): the constant error (a) dominates at short distances and the proportional error (b) dominates at long distances. For a ±(2 mm + 2 ppm) instrument measuring 500 m, the uncertainty is ±3 mm. Modern total stations integrate the EDM with the angle-measuring system, automatically computing horizontal distance and vertical difference from the slope distance and zenith angle.',
 1,
 ARRAY['EDM','electronic distance measurement','phase shift','modulation','infrared','prism','retroreflector','slope distance','constant error','proportional error','ppm','accuracy specification']),

('acc02a02-0002-0000-0000-000000000001', 'acc02b02-0000-0000-0000-000000000001',
 'Instrument and Prism Setup Procedures',
 'Total station setup sequence: place tripod over mark with head roughly level, mount tribrach, place instrument, rough-level with circular bubble, center over mark with optical or laser plummet, fine-level with plate bubble and three leveling screws (bubble follows left thumb), re-check centering, iterate until both conditions met. Measure and record HI. Prism setup: thread prism onto holder, attach to pole, set and record HR (prism height), verify prism constant label (−30 mm standard or 0 mm Leica-style), enter correct constant in total station. Rod person levels pole with circular bubble during every measurement. A mismatched prism constant introduces a systematic distance error equal to the constant difference on every single reading.',
 2,
 ARRAY['setup','tripod','tribrach','leveling','centering','optical plummet','HI','prism','prism pole','HR','prism constant','rod level','systematic error']),

('acc02a02-0003-0000-0000-000000000001', 'acc02b02-0000-0000-0000-000000000001',
 'Atmospheric Corrections and Slope-to-Horizontal Conversion',
 'EDM accuracy depends on knowing the speed of the signal through the atmosphere, which varies with temperature and pressure. Standard conditions are 15°C and 1013.25 hPa. In Texas summers (38°C+), the correction reaches +12 ppm or more — the signal travels faster in warm air, so uncorrected distances read short. Modern instruments apply corrections automatically from entered temperature and pressure values. The surveyor must measure actual conditions at the instrument and update during long sessions. Slope-to-horizontal conversion: HD = SD × sin(ZA), where ZA is the zenith angle. On flat terrain the difference is small; on steep terrain it can be substantial. The total station typically computes and displays both slope and horizontal distances.',
 3,
 ARRAY['atmospheric correction','temperature','pressure','ppm','standard conditions','Texas heat','slope distance','horizontal distance','zenith angle','conversion','HD = SD sin ZA']),

('acc02a02-0004-0000-0000-000000000001', 'acc02b02-0000-0000-0000-000000000001',
 'Measurement Procedure, Recording, and Error Prevention',
 'Standard EDM measurement procedure: power on and verify settings (units, atmospheric corrections, prism constant), sight prism using finder then crosshairs, press measure, record slope distance and zenith angle, take at least three readings and verify agreement within instrument specification, compute mean. Record in field book: from/to stations, HI, HR, prism constant, temperature, pressure, all individual readings, mean slope distance, zenith angle, horizontal distance. Common errors: wrong prism constant (±30 mm systematic), stale atmospheric correction (1–15 ppm), prism not plumb (distance and angle error), sighting wrong target, multipath from reflective surfaces, heat shimmer over hot pavement. Prevention: check prism label before first shot, enter actual T and P, watch rod person for tilt, communicate by radio, avoid low sightlines over pavement.',
 4,
 ARRAY['measurement procedure','multiple readings','mean','field book','recording','prism constant error','atmospheric error','plumb','multipath','heat shimmer','blunder prevention']);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. QUIZ QUESTIONS (14 questions — mixed types and difficulties)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM question_bank
WHERE lesson_id = 'acc02b02-0000-0000-0000-000000000001'
  AND tags @> ARRAY['acc-srvy-1335','week-2'];

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- Q1  Multiple Choice  Easy
('An EDM measures distance by:',
 'multiple_choice',
 '["Counting the number of tape lengths","Timing a laser pulse and dividing by 2","Comparing the phase of a returned modulated signal to the transmitted signal","Triangulating from two known points"]'::jsonb,
 'Comparing the phase of a returned modulated signal to the transmitted signal',
 'EDM works by transmitting a modulated infrared beam to a prism and measuring the phase shift of the returned signal. The phase difference, combined with multiple modulation frequencies, yields the total distance. Pulse-timing is used by some rangefinders but phase-comparison is the standard EDM method for surveying instruments.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','quiz','EDM','principle']),

-- Q2  Multiple Choice  Easy
('The slope distance measured by an EDM is the distance from:',
 'multiple_choice',
 '["The ground at the instrument to the ground at the prism","The tripod head to the prism pole tip","The instrument trunnion axis to the optical center of the prism","The instrument eyepiece to the prism face"]'::jsonb,
 'The instrument trunnion axis to the optical center of the prism',
 'The EDM measures the distance from its internal reference point (aligned with the trunnion axis) to the optical center of the prism. This is why both HI (height of instrument above the ground mark) and the prism constant (offset of optical center from physical center) must be known.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','quiz','slope-distance','reference-points']),

-- Q3  True/False  Easy
('Horizontal distance equals the slope distance multiplied by the sine of the zenith angle.',
 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'HD = SD × sin(ZA), where ZA is the zenith angle (0° = straight up, 90° = horizontal). When the sightline is nearly horizontal (ZA ≈ 90°), sin(ZA) ≈ 1 and HD ≈ SD. On steep terrain the difference is significant.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','quiz','horizontal-distance','zenith-angle']),

-- Q4  True/False  Easy
('You should take only one EDM reading per target to save time.',
 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'Best practice requires at least three EDM readings per target, checked for agreement within the instrument specification. Multiple readings provide redundancy and allow detection of blunders (an outlier reading). The mean of accepted readings is the reported distance.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','quiz','multiple-readings','blunder-check']),

-- Q5  Multiple Choice  Medium
('An EDM has an accuracy specification of ±(2 mm + 2 ppm). When measuring a distance of 1,000 m, the expected uncertainty is:',
 'multiple_choice',
 '["±2 mm","±4 mm","±2.002 mm","±20 mm"]'::jsonb,
 '±4 mm',
 'Uncertainty = constant + proportional = 2 mm + (2 ppm × 1000 m) = 2 mm + 2 mm = ±4 mm. The constant error (2 mm) is independent of distance; the proportional error (2 ppm = 2 mm per km) grows linearly with distance.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','quiz','accuracy-specification','ppm']),

-- Q6  Multiple Choice  Medium
('A standard survey prism has a prism constant of −30 mm. If the total station is incorrectly set to a constant of 0 mm, each measured distance will be:',
 'multiple_choice',
 '["30 mm too short","30 mm too long","Unaffected — the constant cancels out","Variable depending on temperature"]'::jsonb,
 '30 mm too long',
 'With a −30 mm constant, the instrument should subtract 30 mm from the raw measurement (because the optical center is 30 mm behind the prism face). If the constant is set to 0 mm, this subtraction does not occur, so every distance is reported 30 mm too long. This is a systematic error that affects every single measurement identically.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','quiz','prism-constant','systematic-error']),

-- Q7  Multiple Choice  Medium
('On a hot Texas summer day (38°C), compared to standard conditions (15°C), the atmospheric correction for EDM distances is approximately:',
 'multiple_choice',
 '["−12 ppm (distances read too long)","0 ppm (no effect)","+12 ppm (distances read too short)","Impossible to determine without pressure"]'::jsonb,
 '+12 ppm (distances read too short)',
 'At 38°C the air is less dense than at 15°C, so the EDM signal travels faster. The instrument (calibrated for 15°C) computes a distance that is slightly too short. The atmospheric correction adds approximately +12 ppm. For a 500 m distance, this is about +6 mm.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','quiz','atmospheric-correction','Texas-heat']),

-- Q8  Multiple Choice  Medium
('Why must the prism pole be held perfectly vertical (plumb) during an EDM measurement?',
 'multiple_choice',
 '["To keep the prism facing the instrument","Because a tilted pole changes the prism height (HR) and the horizontal position of the reflector","To prevent the pole from falling","Because the prism constant changes with tilt angle"]'::jsonb,
 'Because a tilted pole changes the prism height (HR) and the horizontal position of the reflector',
 'If the prism pole is tilted, the prism is no longer directly above the ground mark. This introduces errors in both the horizontal distance and the vertical difference. The further the prism is from plumb, the larger the positional error. A rod-level bubble helps the rod person maintain the pole vertical.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','quiz','plumb','rod-level','prism-position']),

-- Q9  Numeric Input  Medium
('An EDM measures a slope distance of 350.000 m at a zenith angle of 86°00''00". What is the horizontal distance? Use HD = SD × sin(ZA). Round to 3 decimal places.',
 'numeric_input',
 '[]'::jsonb,
 '349.146',
 'HD = 350.000 × sin(86°) = 350.000 × 0.99756 = 349.146 m.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','quiz','slope-to-horizontal','computation']),

-- Q10  Numeric Input  Medium
('An EDM rated at ±(3 mm + 2 ppm) measures a distance of 250 m. What is the expected uncertainty in millimeters? Round to 1 decimal place.',
 'numeric_input',
 '[]'::jsonb,
 '3.5',
 'Uncertainty = 3 mm + (2 ppm × 250 m) = 3 mm + (2 × 250/1,000,000 × 1,000,000 mm) = 3 mm + 0.5 mm = 3.5 mm.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','quiz','accuracy-specification','computation']),

-- Q11  Numeric Input  Hard
('A surveyor takes five EDM slope distance readings: 428.341, 428.343, 428.340, 428.342, and 428.395 m. The instrument spec is ±(2 mm + 2 ppm). (a) Identify and discard the blunder. (b) Compute the mean of the remaining four readings. Round to 3 decimal places.',
 'numeric_input',
 '[]'::jsonb,
 '428.342',
 'The fifth reading (428.395 m) differs from the others by ~54 mm — clearly a blunder. Discarding it: mean = (428.341 + 428.343 + 428.340 + 428.342) / 4 = 1713.366 / 4 = 428.3415 ≈ 428.342 m. The remaining readings agree within 3 mm, consistent with the instrument spec.',
 'hard',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','quiz','blunder-detection','mean','computation']),

-- Q12  Numeric Input  Hard (Multi-step: effect of wrong prism constant over a traverse)
('A surveyor runs a 6-leg traverse using a standard prism (constant = −30 mm) but the total station is set to 0 mm. By how many millimeters will the total traverse distance be in error?',
 'numeric_input',
 '[]'::jsonb,
 '180',
 'Each leg will be 30 mm too long. Over 6 legs: 6 × 30 mm = 180 mm. This 180 mm systematic error (0.180 m) would devastate the traverse closure. For a 1,200 m perimeter, the relative precision due to this error alone would be 1:(1200/0.180) = 1:6,667 — failing the TBPELS minimum of 1:10,000.',
 'hard',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','quiz','prism-constant','traverse-error','multi-step']),

-- Q13  Essay  Hard
('Describe the complete procedure for setting up a total station and prism, measuring a distance, and recording the results. Include: (a) tripod and instrument setup (at least 5 steps), (b) prism assembly and what to verify, (c) the measurement procedure including how many readings to take, and (d) what to record in the field book (at least 8 items).',
 'essay',
 '[]'::jsonb,
 'Key points: (a) Setup: (1) Position tripod over mark, legs spread, head roughly level. (2) Mount tribrach and instrument. (3) Rough-level with circular bubble. (4) Center over mark with optical/laser plummet. (5) Fine-level with plate bubble and three leveling screws. (6) Re-check centering and iterate. (7) Measure and record HI. (b) Prism: Thread prism onto holder, attach to pole, set and record HR, verify prism constant label matches instrument setting, level pole with circular bubble. (c) Measurement: Power on, verify settings (units, atmospheric corrections, prism constant), sight prism with finder then crosshairs, press measure, take at least 3 readings, verify agreement within spec, compute mean. (d) Record: from station, to station, HI, HR, prism constant, temperature, pressure, individual SD readings, mean SD, zenith angle, horizontal distance.',
 'A complete answer covers all four parts with correct sequencing and terminology. Strong answers explain why each step matters (e.g., re-checking centering because leveling shifts position, multiple readings for blunder detection).',
 'hard',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','quiz','essay','setup-procedure','recording','comprehensive']),

-- Q14  Essay  Medium
('Explain why atmospheric corrections are especially important for surveying in Texas. Describe what happens to EDM measurements when the temperature is much higher than standard (15°C), and explain what a surveyor must do to ensure correct distances.',
 'essay',
 '[]'::jsonb,
 'Key points: Texas summer temperatures (38–42°C) are far above the standard 15°C. In warm air, the EDM signal travels faster because air density is lower. The instrument, calibrated for standard conditions, computes a distance that is too short. The atmospheric correction (approximately +12 ppm at 38°C) must be added. For a 500 m distance, the error is ~6 mm; for a 1,000 m distance, ~12 mm. The surveyor must: (1) measure actual temperature at the instrument with a thermometer (not forecast temperature), (2) measure or obtain barometric pressure, (3) enter both values into the total station''s atmospheric correction settings, (4) update the values periodically during long sessions as conditions change. Failure to apply corrections systematically degrades traverse closure and can cause a survey to fail precision requirements.',
 'A good answer explains the physics (warm air = faster signal = short reading), quantifies the magnitude (10–15 ppm in Texas summer), and describes the practical steps to apply corrections.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','quiz','essay','atmospheric-correction','Texas']);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. PRACTICE PROBLEMS
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- Practice 1: EDM accuracy calculation
('Practice: An EDM is rated at ±(2 mm + 3 ppm). What is the expected uncertainty for a measured distance of 800 m? Give your answer in millimeters to 1 decimal place.',
 'numeric_input', '[]'::jsonb,
 '4.4',
 'Uncertainty = 2 mm + (3 ppm × 800 m) = 2 mm + (3 × 0.8 mm) = 2 mm + 2.4 mm = 4.4 mm.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','practice','accuracy','ppm']),

-- Practice 2: EDM accuracy — short distance
('Practice: Using the same ±(2 mm + 3 ppm) EDM, what is the expected uncertainty for a 50 m distance? Give your answer in mm to 2 decimal places.',
 'numeric_input', '[]'::jsonb,
 '2.15',
 'Uncertainty = 2 mm + (3 ppm × 50 m) = 2 mm + (3 × 0.05 mm) = 2 mm + 0.15 mm = 2.15 mm. At short distances, the constant error (2 mm) dominates.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','practice','accuracy','short-distance']),

-- Practice 3: Slope to horizontal
('Practice: A total station measures a slope distance of 187.654 m at a zenith angle of 83°15''00". Compute the horizontal distance using HD = SD × sin(ZA). Round to 3 decimal places.',
 'numeric_input', '[]'::jsonb,
 '186.305',
 'HD = 187.654 × sin(83°15′) = 187.654 × sin(83.25°) = 187.654 × 0.99281 = 186.305 m.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','practice','slope-to-horizontal','computation']),

-- Practice 4: Prism constant error
('Practice: A surveyor measures 10 traverse legs using a prism with a constant of −30 mm, but the total station is set to −17.5 mm (the value for a mini prism). Each distance is affected by a systematic error. (a) Is each distance too long or too short? (b) What is the systematic error per measurement in mm?',
 'numeric_input', '[]'::jsonb,
 '12.5',
 'The instrument subtracts 17.5 mm when it should subtract 30 mm. Each distance is therefore 30 − 17.5 = 12.5 mm too long. Over 10 legs, the cumulative error is 125 mm.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','practice','prism-constant','systematic-error']),

-- Practice 5: Multiple readings — identify blunder and compute mean
('Practice: Four EDM readings to a target: 256.781, 256.784, 256.782, and 256.831 m. The instrument spec is ±(2 mm + 2 ppm). Which reading is a blunder? What is the mean of the remaining three? Round to 3 decimal places.',
 'numeric_input', '[]'::jsonb,
 '256.782',
 'The fourth reading (256.831) differs from the others by ~49 mm — a clear blunder. Mean of remaining: (256.781 + 256.784 + 256.782) / 3 = 770.347 / 3 = 256.782 m.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','practice','blunder','mean-computation']),

-- Practice 6: Atmospheric correction magnitude
('Practice: The atmospheric correction at 38°C and standard pressure is approximately +12 ppm. A surveyor measures a distance of 750 m under these conditions. How much would the corrected distance increase compared to the uncorrected reading? Give your answer in mm.',
 'numeric_input', '[]'::jsonb,
 '9',
 'Correction = 12 ppm × 750 m = 12 × 0.75 mm = 9 mm. The corrected distance is 9 mm longer than the raw reading because the signal traveled faster in the warm air.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','practice','atmospheric-correction','magnitude']),

-- Practice 7: Word problem — setup and measurement checklist
('Practice: You are setting up for your first EDM measurement of the day. The temperature is 36°C, pressure is 1010 hPa. You are using a standard prism (constant = −30 mm) on a 2.000 m prism pole. List, in order, every setting you must verify or enter on the total station before pressing the "Measure" button.',
 'essay', '[]'::jsonb,
 'Settings to verify/enter (in order): (1) Units — confirm meters or feet match your project requirements. (2) Atmospheric corrections — enter temperature: 36°C and pressure: 1010 hPa. (3) Prism constant — set to −30 mm to match the standard prism. (4) HR (height of reflector) — enter 2.000 m to match the prism pole setting. (5) HI (height of instrument) — enter the measured value from the ground mark to the trunnion axis. Additional valid items: verify the coordinate system/datum if storing points, confirm the point naming convention, check battery level.',
 'A complete answer lists at least the four critical settings (units, atmospheric corrections, prism constant, HR/HI) in a logical order and uses the specific values given in the problem.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','practice','essay','setup-checklist']),

-- Practice 8: Comprehensive error analysis
('Practice: After a day of fieldwork, you discover that your EDM measurements are consistently 15 mm longer than the known baseline distances. List at least three possible causes for this systematic error and describe how you would diagnose which cause is responsible.',
 'essay', '[]'::jsonb,
 'Possible causes: (1) Wrong prism constant — if the instrument is set to 0 mm but the prism is −30 mm, distances are 30 mm too long (but the error here is 15 mm, so perhaps the prism constant is set to −15 mm instead of −30 mm, or a different mismatch). Check: compare the prism label to the instrument setting. (2) Wrong atmospheric correction — if standard conditions are entered but actual conditions are significantly different. Check: compare entered temperature and pressure to actual measured values. (3) Incorrect prism being used — a mini prism with a different constant than what was entered. Check: verify the prism model and its documented constant. (4) EDM calibration drift — the instrument''s internal reference has shifted. Check: measure a known baseline and compare to certified value. Diagnosis approach: systematically check each setting, measure a known baseline distance, and compare the measured vs. known value while toggling each correction.',
 'A strong answer identifies at least three specific causes with clear diagnostic procedures. The best answers prioritize checking the simplest things first (prism constant, atmospheric settings) before suspecting instrument calibration.',
 'hard',
 'acc00002-0000-0000-0000-000000000002', 'acc02b02-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-2','practice','essay','error-analysis','troubleshooting']);
