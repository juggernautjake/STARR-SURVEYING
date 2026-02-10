-- ============================================================================
-- ACC SRVY 1341 — Week 3: Traverse Field Procedures
-- Full lesson content, topics, quiz questions (14), and practice problems (8)
-- Module ID: acc00003-0000-0000-0000-000000000003
-- Lesson ID: acc03b03-0000-0000-0000-000000000001
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. UPDATE LESSON CONTENT
-- ────────────────────────────────────────────────────────────────────────────

UPDATE learning_lessons SET content = '
<h2>From Planning to Execution: Running a Traverse</h2>

<p>Last week you learned how to plan a traverse — selecting stations, choosing the traverse type, and identifying the accuracy standard. This week you step into the field. Every surveying career is built on the ability to set up an instrument, measure angles and distances accurately, and detect mistakes <em>before</em> leaving the site. These field procedures are the foundation of every coordinate, boundary, and map you will ever produce.</p>

<p>The procedures in this lesson apply to traversing with a <strong>total station</strong>, the instrument you will use most often in professional practice. While GNSS has supplemented traditional traversing for many tasks, total-station traverses remain essential for boundary surveys under tree canopy, in urban canyons, and anywhere satellite visibility is limited — which describes a large portion of Texas fieldwork.</p>

<h2>Setting Up at a Traverse Station</h2>

<p>Every measurement begins with a properly set-up instrument. The quality of your setup directly limits the quality of every angle and distance you measure from that station.</p>

<h3>Tripod Setup</h3>
<ol>
<li><strong>Spread the tripod legs</strong> to form a roughly equilateral triangle with the head approximately level and centered over the station mark.</li>
<li><strong>Push each leg firmly</strong> into the ground. On pavement, use a tripod pad or sandbags to prevent slipping.</li>
<li><strong>Check the height.</strong> The instrument eyepiece should be at a comfortable viewing height — too high or too low causes fatigue and body contact with the tripod.</li>
</ol>

<h3>Instrument Leveling</h3>
<p>Modern total stations use a <strong>dual-axis compensator</strong> that electronically corrects for small leveling errors. However, the compensator has a limited range (typically ±3′ to ±6′), so the instrument must first be <em>roughly</em> leveled using the circular (bull''s-eye) bubble, then <em>precisely</em> leveled using the plate bubble and leveling screws.</p>

<ol>
<li><strong>Rough level:</strong> Adjust the tripod legs until the circular bubble is centered.</li>
<li><strong>Optical plummet:</strong> Look through the optical plummet (or laser plummet) and shift the instrument on the tripod head until the crosshair (or laser dot) is centered on the station mark.</li>
<li><strong>Fine level:</strong> Use the three leveling screws and the plate bubble. Turn two adjacent screws simultaneously in opposite directions — the bubble follows the left thumb. Rotate 90° and level with the third screw. Repeat until the bubble stays centered in all directions.</li>
<li><strong>Re-check centering:</strong> Leveling may shift the instrument slightly off center. Loosen the centering clamp, re-center over the mark, and re-level. Iterate until the instrument is both level and centered.</li>
</ol>

<p><strong>Centering accuracy matters.</strong> If the instrument is 2 mm off-center over a 100 m sightline, the resulting angular error is about 4″. Over a 30 m sightline, the same offset produces about 14″ of error — enough to blow your angular closure on a high-accuracy survey.</p>

<h3>Measuring Instrument Height (HI)</h3>
<p>The <strong>height of instrument (HI)</strong> is the vertical distance from the station mark on the ground to the tilting axis (trunnion axis) of the total station. Measure it with a steel tape or the graduated mark on the tribrach. Measure to the nearest millimeter. Record it in your field notes immediately — a wrong HI is one of the most common field blunders.</p>

<h2>The Backsight / Foresight Procedure</h2>

<p>Traverse measurement at each station follows a systematic <strong>backsight–foresight</strong> sequence:</p>

<ol>
<li><strong>Sight the backsight</strong> (the station you came from). Point the instrument at the prism on the backsight station. Set the horizontal circle to 0°00′00″ or to the known azimuth of the backsight line.</li>
<li><strong>Turn to the foresight</strong> (the next station ahead). Carefully point at the prism on the foresight station and read the horizontal angle.</li>
<li><strong>Measure the distance</strong> to the foresight using the EDM (Electronic Distance Measurement) built into the total station.</li>
<li><strong>Record</strong> the horizontal angle, zenith angle, and slope distance in your field book or data collector.</li>
</ol>

<p>This backsight–foresight sequence is repeated at every traverse station. The measured horizontal angle is the angle between the backsight line and the foresight line, measured clockwise.</p>

<h2>Angle Measurement Methods</h2>

<p>There are three common conventions for measuring traverse angles. The method you use depends on the type of traverse and the traditions of your firm or agency.</p>

<h3>1. Interior Angles</h3>
<p><strong>Interior angles</strong> are the angles measured <em>inside</em> the closed polygon formed by the traverse. At each station, the interior angle is the angle between the two adjacent traverse legs, measured on the inside of the figure.</p>

<ul>
<li>Used primarily for <strong>closed loop traverses</strong></li>
<li>The angular check is straightforward: the sum must equal (n − 2) × 180°</li>
<li>To measure: sight the backsight, set the circle to 0°, turn clockwise to the foresight. If the interior angle is to the left, turn counterclockwise instead (or use direct/reverse technique to get the correct angle)</li>
</ul>

<h3>2. Deflection Angles</h3>
<p><strong>Deflection angles</strong> are the angles turned from the extension of the previous line. The deflection is how far the new direction deviates from "straight ahead." Deflection angles are designated <strong>Right (R)</strong> or <strong>Left (L)</strong>.</p>

<ul>
<li>Used primarily for <strong>route surveys</strong> (highway, railroad, pipeline)</li>
<li>Angular check: the algebraic sum of all deflection angles equals 360° for a closed traverse (R is positive, L is negative)</li>
<li>To measure: sight the backsight with the telescope <em>inverted</em> (plunged), so the circle reads the back-azimuth. Then turn to the foresight in the normal (direct) position. The reading is the deflection angle.</li>
</ul>

<h3>3. Angles to the Right (Azimuths from Backsight)</h3>
<p><strong>Angles to the right</strong> are always measured clockwise from the backsight to the foresight, regardless of which side is "inside" the traverse. This is the most common convention for modern total station work because it is unambiguous — you always turn clockwise.</p>

<ul>
<li>Used for any traverse type: open, loop, or connecting</li>
<li>Eliminates confusion about left/right designation</li>
<li>To convert to azimuths: Azimuth of foresight = Azimuth of backsight + 180° + angle right. If the result exceeds 360°, subtract 360°.</li>
</ul>

<h2>Direct and Reverse (D&R) Measurement</h2>

<p>To eliminate systematic instrument errors, angles should be measured in <strong>both face positions</strong>:</p>

<ul>
<li><strong>Direct (Face Left / Position I):</strong> The vertical circle is on the left side of the telescope when you look through the eyepiece.</li>
<li><strong>Reverse (Face Right / Position II):</strong> Plunge (transit) the telescope and rotate 180° in azimuth so the vertical circle is now on the right side.</li>
</ul>

<p>Measuring in both positions and averaging the results eliminates:</p>
<ul>
<li><strong>Collimation error</strong> (line of sight not perpendicular to the horizontal axis)</li>
<li><strong>Trunnion axis tilt</strong> (horizontal axis not truly horizontal)</li>
<li><strong>Vertical circle index error</strong></li>
</ul>

<p>The difference between the direct and reverse readings (after accounting for the 180° offset) should be very small — typically less than the stated instrument accuracy. If the difference is large, it indicates a problem with the instrument or the sighting, and the measurement should be repeated.</p>

<h3>How D&R Works in Practice</h3>
<ol>
<li><strong>Face Left:</strong> Sight backsight, zero the circle, turn clockwise to foresight, read the angle (e.g., 87°14′22″)</li>
<li><strong>Face Right:</strong> Plunge the telescope, turn to the foresight in reverse, read the angle (e.g., 267°14′28″)</li>
<li><strong>Compute the mean:</strong> The reverse reading minus 180° gives 87°14′28″. The mean of 87°14′22″ and 87°14′28″ is <strong>87°14′25″</strong></li>
</ol>

<p>For critical surveys (second-order and above), angles may be measured in <strong>multiple sets</strong> — two, three, or more D&R pairs — with the initial circle setting advanced by 180°/n for each set to distribute graduation errors around the circle.</p>

<h2>Measuring Traverse Distances</h2>

<p>The total station''s <strong>EDM (Electronic Distance Measurement)</strong> measures the slope distance by timing the round trip of a modulated infrared or laser beam reflected from a prism at the target station.</p>

<h3>Distance Corrections</h3>
<p>The raw slope distance must be corrected for:</p>

<table>
<thead><tr><th>Correction</th><th>Source</th><th>Magnitude</th></tr></thead>
<tbody>
<tr><td>Atmospheric (temperature &amp; pressure)</td><td>Actual conditions differ from standard (15°C, 760 mmHg)</td><td>1–10 ppm typical; in Texas summer heat, can reach 15+ ppm</td></tr>
<tr><td>Prism constant</td><td>Offset between the optical center of the prism and the physical center of the target</td><td>−30 to 0 mm depending on prism type</td></tr>
<tr><td>Slope to horizontal</td><td>The EDM measures slope distance; you need horizontal distance</td><td>H = S × cos(zenith angle − 90°) or H = S × sin(zenith angle)</td></tr>
<tr><td>Sea-level / grid scale</td><td>Reduce to the datum surface; apply grid scale factor for state plane</td><td>Variable; typically < 100 ppm in Texas</td></tr>
</tbody>
</table>

<p>Most modern total stations apply the atmospheric correction automatically if you enter the temperature and pressure. The prism constant is set in the instrument for the specific prism type you are using. Slope-to-horizontal reduction is computed internally from the measured zenith angle. However, <strong>it is your responsibility</strong> to verify that these corrections are being applied and that the input values are correct.</p>

<h3>Multiple Distance Measurements</h3>
<p>Best practice is to take <strong>at least three distance readings</strong> to each foresight and verify they agree within the instrument''s stated precision (typically ±(2 mm + 2 ppm)). If one reading disagrees significantly, discard it and re-measure. Record the mean distance in your field notes.</p>

<h2>Field Checks: Catching Blunders Before You Leave</h2>

<p>The most expensive blunder in surveying is one discovered after you leave the field. Return trips are costly in time, fuel, and reputation. Use these field checks to catch mistakes while you can still fix them:</p>

<h3>1. Angle Closure Check</h3>
<p>At the last station before closing the traverse, compute the running sum of all measured angles. Compare with the expected sum ((n − 2) × 180° for interior angles). If the misclosure exceeds tolerance, identify which angle is suspect and re-measure it before packing up.</p>

<h3>2. Distance Check</h3>
<p>Measure every traverse distance in <strong>both directions</strong> (forward and back) when possible. The forward and back distances should agree within the EDM''s stated accuracy. A large discrepancy suggests a centering error, wrong prism height, or atmospheric anomaly.</p>

<h3>3. Closing the Loop</h3>
<p>For a closed loop traverse, the final foresight shot returns to the starting station. This provides an immediate field check: the computed coordinates should return to (0, 0) relative to the start. Many data collectors can compute a preliminary closure in the field, giving you a rough precision ratio before you leave.</p>

<h3>4. Field Note Review</h3>
<p>Before leaving each station, review your recorded data:</p>
<ul>
<li>Is the station ID correct?</li>
<li>Is the HI (height of instrument) recorded?</li>
<li>Is the prism height (HR) recorded for the target station?</li>
<li>Do the D&R angles agree within tolerance?</li>
<li>Do multiple distance readings agree?</li>
<li>Are all shots accounted for (backsight, foresight, any sideshots)?</li>
</ul>

<h2>Recording Traverse Data</h2>

<p>Whether using a paper field book or an electronic data collector, your traverse record should include at each station:</p>

<table>
<thead><tr><th>Item</th><th>Example</th></tr></thead>
<tbody>
<tr><td>Station occupied</td><td>STA 3</td></tr>
<tr><td>Backsight station</td><td>STA 2</td></tr>
<tr><td>Foresight station</td><td>STA 4</td></tr>
<tr><td>HI (instrument height)</td><td>1.523 m</td></tr>
<tr><td>HR (prism/target height)</td><td>1.800 m</td></tr>
<tr><td>Horizontal angle (D&R mean)</td><td>92°17′34″</td></tr>
<tr><td>Zenith angle (D&R mean)</td><td>89°42′15″</td></tr>
<tr><td>Slope distance (mean of 3+)</td><td>187.342 m</td></tr>
<tr><td>Temperature</td><td>32°C</td></tr>
<tr><td>Pressure</td><td>1010 hPa</td></tr>
<tr><td>Date, time, weather notes</td><td>2024-09-15 10:22 AM, clear, light wind</td></tr>
</tbody>
</table>

<p><strong>Golden rule of field notes:</strong> Record everything at the time of measurement. Never rely on memory. Never erase — if you make an error, draw a single line through it and write the correct value beside it. Field notes are legal documents that may be subpoenaed in court.</p>

<h2>Common Field Blunders and How to Avoid Them</h2>

<table>
<thead><tr><th>Blunder</th><th>Effect</th><th>Prevention</th></tr></thead>
<tbody>
<tr><td>Wrong backsight station</td><td>Entire angle is wrong</td><td>Always confirm backsight visually and by station ID before zeroing circle</td></tr>
<tr><td>Instrument or prism not centered</td><td>Angular and distance errors proportional to offset</td><td>Re-check optical plummet after leveling; use tribrachs with forced centering</td></tr>
<tr><td>Wrong prism height (HR)</td><td>Zenith angle and elevation errors</td><td>Measure HR at every setup; have rod person confirm height verbally</td></tr>
<tr><td>Wrong atmospheric corrections</td><td>Distance error of 1–15+ ppm</td><td>Measure temperature and pressure at the instrument; update in total station</td></tr>
<tr><td>Transposed numbers in recording</td><td>Incorrect angle or distance</td><td>Read back recorded values; use electronic data collectors when possible</td></tr>
<tr><td>Sighting wrong target</td><td>Entire measurement is invalid</td><td>Use clear prism/target identification; communicate with rod person via radio</td></tr>
</tbody>
</table>

<h2>Forced Centering: Eliminating Setup Error</h2>

<p><strong>Forced centering</strong> (also called <em>three-tripod traversing</em>) is a technique that eliminates the centering error at intermediate stations. Instead of setting up one tripod, you use <strong>three tripods and tribrachs</strong>:</p>

<ol>
<li>Tripod A is at the backsight with a prism in its tribrach</li>
<li>Tripod B is at the occupied station with the total station in its tribrach</li>
<li>Tripod C is at the foresight with a prism in its tribrach</li>
</ol>

<p>After measuring from station B, you advance: the instrument moves from B to C (swapping with the prism), the prism from A moves to a new foresight station D. Because the tribrachs never move, the centering is preserved, and the only centering error is at the first and last stations.</p>

<p>Forced centering is standard practice for high-order traverses and is strongly recommended for any boundary survey where accuracy matters.</p>

<h2>Looking Ahead</h2>

<p>Next week we take the raw field data — angles and distances from every station — and turn them into coordinates. You will learn how to compute <strong>azimuths</strong> from the measured angles, convert slope distances to horizontal, compute <strong>latitudes and departures</strong>, and quantify the traverse''s <strong>error of closure</strong>. This is where the mathematics of traversing truly begins.</p>
',

resources = ''[
  {"title":"FGCS Specifications for Horizontal Control Surveys","url":"https://www.ngs.noaa.gov/FGCS/tech_pub/1984-stds-specs-geodetic-control-networks.pdf","type":"pdf"},
  {"title":"Total Station Setup and Leveling Procedures","url":"https://www.surveyingmath.com/total-station-setup","type":"reference"},
  {"title":"Forced Centering Technique Explained","url":"https://www.surveyingmath.com/forced-centering","type":"reference"}
]''::jsonb,

videos = ''[
  {"title":"Setting Up a Total Station Over a Point","url":"https://www.youtube.com/watch?v=3xLkVJrZjKI"},
  {"title":"Measuring Traverse Angles: Direct and Reverse","url":"https://www.youtube.com/watch?v=QXwYh9Vf1nM"}
]''::jsonb,

key_takeaways = ARRAY[
  ''Set up a total station over a point: tripod placement, leveling, centering, and HI measurement'',
  ''Execute the backsight–foresight measurement sequence at each traverse station'',
  ''Distinguish between interior angles, deflection angles, and angles to the right'',
  ''Perform direct and reverse (D&R) angle measurement and compute the mean'',
  ''Apply atmospheric, prism constant, and slope corrections to EDM distances'',
  ''Use field checks (angle closure, forward/back distances, note review) to catch blunders'',
  ''Describe the forced centering technique and explain when it should be used''
]

WHERE id = 'acc03b03-0000-0000-0000-000000000001';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. TOPICS
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM learning_topics WHERE lesson_id = 'acc03b03-0000-0000-0000-000000000001';

INSERT INTO learning_topics (id, lesson_id, title, content, order_index, keywords) VALUES

('acc03a03-0001-0000-0000-000000000001', 'acc03b03-0000-0000-0000-000000000001',
 'Instrument Setup: Tripod, Leveling, and Centering',
 'Setting up at a traverse station involves three interdependent steps: placing the tripod with the head roughly level and centered over the mark, leveling the instrument using the circular bubble and plate bubble with leveling screws, and centering over the station mark using the optical or laser plummet. These steps are iterative — leveling may shift centering and vice versa — so the surveyor alternates until both conditions are met simultaneously. The height of instrument (HI) is measured from the station mark to the trunnion axis and recorded immediately. A centering error of 2 mm over a 30 m sightline produces approximately 14 seconds of angular error, demonstrating why precise centering is critical for short traverse legs.',
 1,
 ARRAY['tripod','leveling','centering','optical plummet','plate bubble','circular bubble','height of instrument','HI','leveling screws','setup']),

('acc03a03-0002-0000-0000-000000000001', 'acc03b03-0000-0000-0000-000000000001',
 'Angle Measurement: Methods, D&R, and Conventions',
 'Three conventions exist for measuring traverse angles. Interior angles are measured inside the traverse polygon and checked against (n−2)×180°. Deflection angles measure the deviation from the prolongation of the previous line and are designated right or left; their algebraic sum equals 360° for a closed traverse. Angles to the right are always measured clockwise from backsight to foresight, eliminating right/left ambiguity. All angles should be measured in both direct and reverse face positions to cancel collimation error, trunnion axis tilt, and vertical circle index error. The mean of D&R readings is the accepted value. For high-order work, multiple sets of D&R are taken with the initial circle advanced by 180°/n per set to distribute graduation errors.',
 2,
 ARRAY['interior angle','deflection angle','angle right','direct and reverse','D&R','face left','face right','collimation','trunnion axis','multiple sets','graduation error']),

('acc03a03-0003-0000-0000-000000000001', 'acc03b03-0000-0000-0000-000000000001',
 'Distance Measurement: EDM Corrections and Best Practices',
 'The total station EDM measures slope distance by timing the round trip of a modulated infrared beam reflected from a prism. Raw slope distances must be corrected for atmospheric refraction (temperature and pressure deviations from standard conditions — significant in Texas summers where temperatures routinely exceed 38°C), prism constant offset (−30 to 0 mm depending on prism type), and slope-to-horizontal reduction using the measured zenith angle. Most instruments apply these corrections automatically given correct inputs. Best practice requires at least three distance readings per foresight, checked for agreement within the EDM specification (typically ±(2 mm + 2 ppm)). Forward-and-back distance measurement provides an additional blunder check.',
 3,
 ARRAY['EDM','slope distance','atmospheric correction','prism constant','horizontal distance','zenith angle','temperature','pressure','ppm','forward and back']),

('acc03a03-0004-0000-0000-000000000001', 'acc03b03-0000-0000-0000-000000000001',
 'Field Checks, Blunder Prevention, and Forced Centering',
 'Effective field procedures include in-progress angle closure checks (running sum of angles compared to theoretical), forward-and-back distance agreement, and systematic review of recorded data at each station (station ID, HI, HR, D&R agreement, distance agreement, completeness). Common blunders include sighting the wrong backsight, incorrect centering, wrong prism height, stale atmospheric corrections, and transposed numbers. Forced centering (three-tripod traversing) eliminates centering error at intermediate stations by keeping tribrachs fixed on tripods and swapping only the instrument and prisms between setups. It is standard practice for high-accuracy traverses and strongly recommended for boundary surveys.',
 4,
 ARRAY['field check','blunder','closure check','forward and back','forced centering','three-tripod','tribrach','prism height','HR','data review','quality control']);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. QUIZ QUESTIONS (14 questions — mixed types and difficulties)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM question_bank
WHERE lesson_id = 'acc03b03-0000-0000-0000-000000000001'
  AND tags @> ARRAY['acc-srvy-1341','week-3'];

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- Q1  Multiple Choice  Easy
('What is the correct order for setting up a total station at a traverse station?',
 'multiple_choice',
 '["Level, center, measure distance","Place tripod, rough level, center with plummet, fine level, re-check centering","Center with plummet, place tripod, level, measure HI","Measure HI, place tripod, level, center"]'::jsonb,
 'Place tripod, rough level, center with plummet, fine level, re-check centering',
 'The setup sequence is: (1) place and push in the tripod legs with the head roughly level and over the mark, (2) rough-level using the circular bubble, (3) center over the station mark using the optical or laser plummet, (4) fine-level using the plate bubble and leveling screws, and (5) re-check centering since leveling may shift it. Iterate until both conditions are met.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','setup','leveling','centering']),

-- Q2  Multiple Choice  Easy
('The height of instrument (HI) is the vertical distance from:',
 'multiple_choice',
 '["The ground surface to the eyepiece","The station mark to the trunnion axis of the instrument","The tripod head to the top of the instrument","The benchmark to the instrument"]'::jsonb,
 'The station mark to the trunnion axis of the instrument',
 'HI is measured from the station mark (monument, nail, or hub) on the ground to the trunnion axis (tilting axis) of the total station. It must be measured at every setup and recorded immediately in the field notes.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','HI','instrument-height']),

-- Q3  True/False  Easy
('When measuring angles to the right, you always turn clockwise from the backsight to the foresight.',
 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'Angles to the right are by definition measured clockwise from the backsight direction to the foresight direction. This convention eliminates the ambiguity of left/right designations used in deflection angle measurement and is the most common convention for modern total station traversing.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','angles-right','clockwise']),

-- Q4  True/False  Easy
('Measuring angles in both direct and reverse face positions eliminates collimation error.',
 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'Direct and reverse (D&R) measurement cancels three systematic instrument errors: collimation error (line of sight not perpendicular to the horizontal axis), trunnion axis tilt, and vertical circle index error. The mean of D&R readings is free of these errors.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','D&R','collimation','systematic-error']),

-- Q5  Multiple Choice  Medium
('Which instrument errors are eliminated by averaging direct and reverse face measurements?',
 'multiple_choice',
 '["Only collimation error","Collimation error and trunnion axis tilt only","Collimation error, trunnion axis tilt, and vertical circle index error","All random errors"]'::jsonb,
 'Collimation error, trunnion axis tilt, and vertical circle index error',
 'D&R averaging eliminates three systematic errors: collimation (line of sight not perpendicular to horizontal axis), trunnion axis tilt (horizontal axis not truly horizontal), and vertical circle index error. It does NOT eliminate random errors — those are reduced by taking multiple sets of measurements.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','D&R','systematic-errors','instrument']),

-- Q6  Multiple Choice  Medium
('Deflection angles are measured from:',
 'multiple_choice',
 '["North","The backsight direction","The prolongation (extension) of the previous traverse line","The foresight direction"]'::jsonb,
 'The prolongation (extension) of the previous traverse line',
 'A deflection angle is the angle between the extension of the incoming line (straight ahead) and the outgoing line. It measures how much the new direction deviates from continuing straight. Deflection angles are designated Right (R) or Left (L). They are commonly used in route surveys.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','deflection-angle','route-survey']),

-- Q7  Multiple Choice  Medium
('What is the primary purpose of forced centering (three-tripod traversing)?',
 'multiple_choice',
 '["To speed up the traverse","To eliminate centering error at intermediate stations","To avoid measuring HI","To allow traversing without a backsight"]'::jsonb,
 'To eliminate centering error at intermediate stations',
 'In forced centering, three tripods with tribrachs remain in place while the instrument and prisms are swapped between them as the traverse advances. Because the tribrachs are never moved from the tripods, the centering established at each setup is preserved, eliminating centering error at all intermediate stations. Only the first and last stations have centering error.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','forced-centering','three-tripod']),

-- Q8  Numeric Input  Medium
('An instrument is centered 3 mm off the station mark. The sightline to the foresight is 50 m long. What is the approximate angular error in seconds caused by this centering offset? Use the formula: error (radians) = offset / distance, then convert to seconds (1 radian = 206265"). Round to 1 decimal place.',
 'numeric_input',
 '[]'::jsonb,
 '12.4',
 'Error = offset / distance = 0.003 m / 50 m = 0.00006 radians. Convert to seconds: 0.00006 × 206265 = 12.4".',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','centering-error','angular-error','computation']),

-- Q9  Numeric Input  Medium
('A total station measures a slope distance of 215.482 m at a zenith angle of 87°24''10". What is the horizontal distance? Use H = S × sin(zenith angle). Round to 3 decimal places.',
 'numeric_input',
 '[]'::jsonb,
 '215.257',
 'H = S × sin(z) = 215.482 × sin(87°24''10") = 215.482 × sin(87.4028°) = 215.482 × 0.99896 = 215.257 m. (The zenith angle is close to 90° so the horizontal distance is close to the slope distance.)',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','slope-distance','horizontal-distance','zenith-angle']),

-- Q10  Numeric Input  Hard (D&R averaging)
('A surveyor measures an angle in direct (Face Left) as 142°38''14" and in reverse (Face Right) as 322°38''20". Compute the mean angle from the D&R pair. Give your answer in decimal seconds for just the seconds component (i.e., the seconds part of the DMS result).',
 'numeric_input',
 '[]'::jsonb,
 '17',
 'The reverse reading minus 180° = 322°38''20" − 180° = 142°38''20". Mean = average of 142°38''14" and 142°38''20" = 142°38''17". The seconds component is 17".',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','D&R','mean-angle','computation']),

-- Q11  Numeric Input  Hard (Multi-step word problem: centering error + closure impact)
('A 4-station closed loop traverse has legs averaging 40 m. At each station, the instrument is centered within 2 mm of the mark. What is the maximum possible angular error (in seconds) that centering alone could contribute at a SINGLE station? Use error = offset/distance × 206265". Round to 1 decimal.',
 'numeric_input',
 '[]'::jsonb,
 '10.3',
 'Maximum centering error at one station: the instrument can be 2 mm off center, AND the backsight prism can be 2 mm off center. But the question asks for the error at a single station from the instrument centering only. Error = 0.002 / 40 × 206265 = 10.3". (If both instrument and target centering were combined, it could be up to about 20.6", but the question specifies centering at one station.)',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','centering-error','word-problem','computation']),

-- Q12  Multiple Choice  Hard
('A surveyor plunges the telescope and rotates 180° to sight the foresight in reverse position. The Face Left reading was 205°17''42" and the Face Right reading is 25°17''54". What does the 12-second discrepancy between the two face positions most likely indicate?',
 'multiple_choice',
 '["Random error only — this is normal","A collimation error or trunnion axis tilt that D&R averaging will eliminate","A blunder in recording one of the readings","The instrument compensator has failed"]'::jsonb,
 'A collimation error or trunnion axis tilt that D&R averaging will eliminate',
 'The Face Right reading (25°17''54") + 180° = 205°17''54", which differs from the Face Left reading (205°17''42") by 12". A small consistent discrepancy between face positions indicates systematic instrumental errors (collimation and/or trunnion axis tilt) that are precisely what D&R averaging is designed to eliminate. The mean would be 205°17''48". If the discrepancy were much larger than the instrument''s stated accuracy, it might indicate a more serious problem.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','D&R','discrepancy','collimation','hard']),

-- Q13  Essay  Hard
('Describe the complete procedure for measuring a traverse angle at an intermediate station using the direct and reverse method. Include: (a) how you set up and orient to the backsight, (b) how you turn to the foresight in the direct position, (c) how you transition to the reverse position and re-measure, (d) how you compute the final accepted angle, and (e) what instrument errors this procedure eliminates.',
 'essay',
 '[]'::jsonb,
 'Key points: (a) Set up over station, level and center, sight backsight prism, zero the horizontal circle (or set to known azimuth). (b) Release horizontal clamp, turn clockwise to foresight, read angle in Face Left (e.g., 92°15''18"). (c) Plunge telescope (rotate vertical 180°), rotate 180° in azimuth to re-sight foresight in Face Right, read angle (e.g., 272°15''24"). (d) Subtract 180° from Face Right reading (= 92°15''24"), average with Face Left (= 92°15''21"). (e) Eliminates collimation error (line of sight not perpendicular to trunnion axis), trunnion axis tilt (horizontal axis not truly horizontal), and vertical circle index error.',
 'A complete answer walks through all five parts in logical order with correct terminology. Strong answers include specific DMS values to illustrate the computation and correctly identify all three systematic errors eliminated by D&R.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','essay','D&R','procedure','systematic-errors']),

-- Q14  Essay  Medium
('Explain why field notes are considered legal documents in surveying. Describe at least five items that must be recorded at each traverse station, and explain the "golden rule" for correcting errors in field notes.',
 'essay',
 '[]'::jsonb,
 'Key points: Field notes are the original record of measurements and may be subpoenaed as evidence in boundary disputes, property litigation, or professional board investigations. They establish the chain of evidence for survey work. At each station, record: (1) station occupied and backsight/foresight IDs, (2) HI (height of instrument), (3) HR (prism/target height), (4) horizontal angle (D&R mean), (5) zenith angle, (6) slope distance (mean of multiple readings), (7) temperature and pressure for atmospheric correction, (8) date, time, and weather conditions. The golden rule: never erase — draw a single line through the error so it remains legible, write the correct value beside it, and initial the correction. This preserves the integrity of the legal record.',
 'A good answer explains the legal significance of field notes, lists at least five recorded items with their purpose, and correctly states the no-erase correction rule with reasoning.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','quiz','essay','field-notes','legal','recording']);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. PRACTICE PROBLEMS
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- Practice 1: Slope to horizontal distance
('Practice: A total station measures a slope distance of 328.917 m at a zenith angle of 85°42''30". Compute the horizontal distance. Use H = S × sin(zenith angle). Round to 3 decimal places.',
 'numeric_input', '[]'::jsonb,
 '327.995',
 'H = S × sin(z) = 328.917 × sin(85°42''30") = 328.917 × sin(85.7083°) = 328.917 × 0.99720 = 327.995 m.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','slope-distance','horizontal-distance']),

-- Practice 2: Centering error calculation
('Practice: Your optical plummet shows the instrument is 1.5 mm off center. The shortest sightline from this station is 25 m. What angular error (in seconds) could this centering offset cause? Use error = (offset / distance) × 206265". Round to 1 decimal.',
 'numeric_input', '[]'::jsonb,
 '12.4',
 'Error = (0.0015 m / 25 m) × 206265" = 0.00006 × 206265 = 12.4".',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','centering-error','computation']),

-- Practice 3: D&R mean angle
('Practice: A traverse angle is measured as 118°52''06" in Face Left and 298°52''14" in Face Right. Compute the mean angle.',
 'short_answer', '[]'::jsonb,
 '118°52''10"',
 'Face Right − 180° = 298°52''14" − 180° = 118°52''14". Mean of 118°52''06" and 118°52''14" = 118°52''10".',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','D&R','mean-angle']),

-- Practice 4: Identify angle measurement method
('Practice: At each station, the surveyor sights the backsight with the telescope inverted, then turns to the foresight in the normal position. The measured angle is designated "15°32''R". What type of angle measurement is being used?',
 'multiple_choice',
 '["Interior angle","Deflection angle","Angle to the right","Azimuth"]'::jsonb,
 'Deflection angle',
 'Sighting the backsight with the telescope inverted (plunged) sets the direction of the prolongation of the incoming line. The angle turned to the foresight is the deflection from that prolongation. The "R" designation indicates a right deflection. This is the standard technique for measuring deflection angles, commonly used in route surveys.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','deflection-angle','identification']),

-- Practice 5: Atmospheric correction concept
('Practice: The standard conditions for EDM measurement are 15°C and 760 mmHg. On a July day in Austin, the temperature is 38°C and the pressure is 1005 hPa (≈ 754 mmHg). Would you expect the atmospheric correction to make the measured distance longer or shorter than the raw reading?',
 'multiple_choice',
 '["Longer — the corrected distance is greater than the raw distance","Shorter — the corrected distance is less than the raw distance","No change — atmospheric correction is negligible","It depends on the prism constant"]'::jsonb,
 'Longer — the corrected distance is greater than the raw distance',
 'Higher temperatures cause the air to be less dense, which increases the speed of the EDM signal. The instrument, calibrated for standard conditions, underestimates the distance. The atmospheric correction adds to the raw distance. In Texas summer conditions (38°C), the correction can reach 10–15 ppm, meaning a 1,000 m distance could be off by 10–15 mm if uncorrected.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','atmospheric-correction','EDM','Texas']),

-- Practice 6: Word problem — multiple distance readings
('Practice: A surveyor takes five EDM readings to a foresight: 187.342, 187.345, 187.341, 187.398, and 187.344 m. The instrument specification is ±(2 mm + 2 ppm). (a) Which reading appears to be a blunder? (b) What is the mean of the remaining four readings? Round to 3 decimal places.',
 'numeric_input', '[]'::jsonb,
 '187.343',
 'The fourth reading (187.398 m) is 56 mm away from the others — clearly a blunder (likely a prism that was bumped or an incorrect atmospheric reading). Discarding it: mean of 187.342, 187.345, 187.341, 187.344 = (187.342 + 187.345 + 187.341 + 187.344) / 4 = 749.372 / 4 = 187.343 m.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','EDM','blunder-detection','mean','word-problem']),

-- Practice 7: Azimuth from angle right
('Practice: The azimuth from Station A to Station B is 47°15''30". At Station B, the angle to the right (clockwise from backsight A to foresight C) is measured as 132°48''20". What is the azimuth from Station B to Station C? (Remember: Az(BC) = Az(BA) + angle right, where Az(BA) = Az(AB) + 180°. If result > 360°, subtract 360°.)',
 'short_answer', '[]'::jsonb,
 '0°03''50"',
 'Az(BA) = Az(AB) + 180° = 47°15''30" + 180° = 227°15''30". Az(BC) = Az(BA) + angle right = 227°15''30" + 132°48''20" = 360°03''50". Since this exceeds 360°, subtract 360°: 0°03''50".',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','azimuth','angle-right','computation']),

-- Practice 8: Essay — field blunder prevention
('Practice: You are the party chief on a 6-station boundary traverse. After returning to the office, you discover that the angular misclosure is 45" — far exceeding the allowable 12" for your accuracy standard. (a) List at least three possible sources of this large error. (b) For each source, describe what field procedure would have caught it before you left the site. (c) Explain why the cost of field checks is far less than the cost of a return trip.',
 'essay', '[]'::jsonb,
 'Key points: (a) Possible sources: (1) Wrong backsight at one station — sighting the wrong point gives a completely wrong angle. (2) Poor centering at one or more stations — especially on short legs, centering error causes large angular error. (3) Recording blunder — transposed digits when writing an angle. (4) Not averaging D&R — using only one face position allows systematic errors to persist. (5) Instrument not properly leveled — compensator out of range. (b) Prevention: (1) Confirm backsight station ID before every measurement. (2) Re-check optical plummet after leveling. (3) Read back recorded values; use data collector. (4) Always measure D&R and compare. (5) Check circular and plate bubbles before each angle. (c) Field checks cost minutes; a return trip costs hours of travel, equipment mobilization, crew time, and potentially a missed deadline. An undetected blunder could also lead to an incorrect survey that creates legal liability.',
 'A strong answer identifies at least three specific error sources, matches each with a preventive field procedure, and discusses the time/cost/liability implications of undetected blunders.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b03-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-3','practice','essay','blunder-prevention','field-checks','word-problem']);
