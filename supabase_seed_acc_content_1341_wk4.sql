-- ============================================================================
-- ACC SRVY 1341 — Week 4: Traverse Computations I — Latitudes and Departures
-- Full lesson content, topics, quiz questions (14), and practice problems (8)
-- Module ID: acc00003-0000-0000-0000-000000000003
-- Lesson ID: acc03b04-0000-0000-0000-000000000001
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. UPDATE LESSON CONTENT
-- ────────────────────────────────────────────────────────────────────────────

UPDATE learning_lessons SET content = '
<h2>From Field Data to Coordinates: The Heart of Traverse Mathematics</h2>

<p>You have planned the traverse, measured the angles and distances in the field, and returned to the office with a full set of observations. Now the real computational work begins. This week you will learn the systematic process of converting raw field measurements into the <strong>latitudes</strong> and <strong>departures</strong> that form the basis of all coordinate computation, area calculation, and boundary description.</p>

<p>This process has been the backbone of land surveying for centuries. While modern software can perform these calculations instantly, every surveyor must understand the mathematics thoroughly — both because licensing exams test it extensively and because you cannot troubleshoot software output if you do not understand the underlying computation.</p>

<h2>Step 1: Angle Balancing (Adjusting the Angular Misclosure)</h2>

<p>Before computing anything, you must first <strong>balance the angles</strong>. Recall from Week 2 that the measured interior angles of a closed traverse should sum to (n − 2) × 180°. In practice, the measured sum will differ slightly from the theoretical sum. This difference is the <strong>angular misclosure</strong>.</p>

<h3>The Balancing Procedure</h3>

<ol>
<li><strong>Compute the theoretical sum:</strong> (n − 2) × 180°</li>
<li><strong>Sum the measured angles</strong> and find the misclosure (measured sum − theoretical sum)</li>
<li><strong>Check tolerance:</strong> Is the misclosure within the allowable limit (K × √n) for your accuracy standard? If not, return to the field.</li>
<li><strong>Distribute the correction:</strong> Divide the misclosure equally among all angles (simplest method) or apply larger corrections to angles measured under poorer conditions.</li>
</ol>

<h3>Equal Distribution Method</h3>

<p>The most common approach is to apply an <strong>equal correction</strong> to every measured angle:</p>

<p style="text-align:center; font-size:1.1em;"><strong>Correction per angle = −(misclosure) / n</strong></p>

<p><strong>Example:</strong> A 5-sided traverse has measured interior angles summing to 540°00′15″. The theoretical sum is 540°00′00″, so the misclosure is +15″. Correction per angle = −15″ / 5 = <strong>−3″</strong>. Subtract 3″ from each measured angle. The adjusted angles now sum to exactly 540°00′00″.</p>

<p><strong>Important:</strong> The correction is applied with the <em>opposite sign</em> of the misclosure. If the angles sum to more than the theoretical, each angle is reduced. If they sum to less, each angle is increased.</p>

<h3>Weighted Distribution</h3>

<p>If some angles were measured under better conditions than others (e.g., shorter sightlines, less wind, more repetitions), you may apply <strong>weighted corrections</strong> — larger corrections to less reliable angles. However, for most boundary surveys at third-order accuracy, the equal distribution method is standard and acceptable.</p>

<h2>Step 2: Computing Azimuths from Balanced Angles</h2>

<p>With balanced angles in hand, you can now compute the <strong>azimuth</strong> (direction from north, measured clockwise) of every traverse line. You need one known starting azimuth — either from a previous survey, a GPS observation, or an astronomic observation.</p>

<h3>The Azimuth Propagation Formula</h3>

<p>For interior angles measured on the left side of the traverse (the standard convention when proceeding clockwise around the polygon):</p>

<p style="text-align:center; font-size:1.1em;"><strong>Az<sub>forward</sub> = Az<sub>back</sub> + 180° + interior angle</strong></p>

<p>If the result exceeds 360°, subtract 360°. If negative, add 360°.</p>

<p>Where:</p>
<ul>
<li><strong>Az<sub>back</sub></strong> is the azimuth of the line you just came from (the back azimuth at your current station)</li>
<li><strong>Interior angle</strong> is the balanced interior angle at the current station</li>
</ul>

<p>The back azimuth is simply the forward azimuth ± 180°:</p>
<p style="text-align:center;"><strong>Az<sub>back</sub> = Az<sub>forward(previous line)</sub> + 180°</strong> (subtract 360° if > 360°)</p>

<h3>Worked Example: 4-Sided Traverse</h3>

<p>Given: Starting azimuth from A to B = 47°15′30″. Balanced interior angles at each station:</p>

<table>
<thead><tr><th>Station</th><th>Balanced Angle</th></tr></thead>
<tbody>
<tr><td>A</td><td>87°12′15″</td></tr>
<tr><td>B</td><td>92°38′45″</td></tr>
<tr><td>C</td><td>88°54′30″</td></tr>
<tr><td>D</td><td>91°14′30″</td></tr>
<tr><td><strong>Sum</strong></td><td><strong>360°00′00″</strong> ✓</td></tr>
</tbody>
</table>

<p><strong>Azimuth A→B:</strong> 47°15′30″ (given)</p>

<p><strong>Azimuth B→C:</strong><br/>
Back azimuth at B (from A) = 47°15′30″ + 180° = 227°15′30″<br/>
Az(B→C) = 227°15′30″ + 180° + 92°38′45″ = 499°54′15″<br/>
Subtract 360°: <strong>139°54′15″</strong></p>

<p><strong>Azimuth C→D:</strong><br/>
Back azimuth at C (from B) = 139°54′15″ + 180° = 319°54′15″<br/>
Az(C→D) = 319°54′15″ + 180° + 88°54′30″ = 588°48′45″<br/>
Subtract 360°: <strong>228°48′45″</strong></p>

<p><strong>Azimuth D→A:</strong><br/>
Back azimuth at D (from C) = 228°48′45″ + 180° = 408°48′45″ − 360° = 48°48′45″<br/>
Az(D→A) = 48°48′45″ + 180° + 91°14′30″ = 320°03′15″</p>

<p><strong>Check:</strong> Az(A→B) from the last computation should match the given starting azimuth.<br/>
Back azimuth at A (from D) = 320°03′15″ + 180° = 500°03′15″ − 360° = 140°03′15″<br/>
Az(A→B) = 140°03′15″ + 180° + 87°12′15″ = 407°15′30″ − 360° = <strong>47°15′30″</strong> ✓</p>

<p>The computed azimuth matches the given starting azimuth, confirming that the angles are balanced correctly.</p>

<h2>Azimuths vs. Bearings</h2>

<p>While azimuths are measured clockwise from north (0° to 360°), <strong>bearings</strong> are expressed as angles from either north or south, toward east or west, and range from 0° to 90°. Bearings are commonly used in legal descriptions and deed calls.</p>

<table>
<thead><tr><th>Azimuth Range</th><th>Quadrant</th><th>Bearing Conversion</th><th>Example</th></tr></thead>
<tbody>
<tr><td>0° – 90°</td><td>NE</td><td>N (azimuth)° E</td><td>Az 47°15′30″ → N 47°15′30″ E</td></tr>
<tr><td>90° – 180°</td><td>SE</td><td>S (180° − azimuth)° E</td><td>Az 139°54′15″ → S 40°05′45″ E</td></tr>
<tr><td>180° – 270°</td><td>SW</td><td>S (azimuth − 180°)° W</td><td>Az 228°48′45″ → S 48°48′45″ W</td></tr>
<tr><td>270° – 360°</td><td>NW</td><td>N (360° − azimuth)° W</td><td>Az 320°03′15″ → N 39°56′45″ W</td></tr>
</tbody>
</table>

<h2>Step 3: Computing Latitudes and Departures</h2>

<p>With the azimuth and horizontal distance of every traverse line known, you can now decompose each line into its <strong>north-south component (latitude)</strong> and <strong>east-west component (departure)</strong>.</p>

<p style="text-align:center; font-size:1.1em;"><strong>Latitude = Distance × cos(Azimuth)</strong></p>
<p style="text-align:center; font-size:1.1em;"><strong>Departure = Distance × sin(Azimuth)</strong></p>

<h3>Sign Convention</h3>
<ul>
<li><strong>Latitude:</strong> Positive = North, Negative = South</li>
<li><strong>Departure:</strong> Positive = East, Negative = West</li>
</ul>

<p>The cosine and sine functions automatically produce the correct signs:</p>
<table>
<thead><tr><th>Quadrant</th><th>Azimuth</th><th>cos (Latitude)</th><th>sin (Departure)</th></tr></thead>
<tbody>
<tr><td>NE</td><td>0°–90°</td><td>+ (North)</td><td>+ (East)</td></tr>
<tr><td>SE</td><td>90°–180°</td><td>− (South)</td><td>+ (East)</td></tr>
<tr><td>SW</td><td>180°–270°</td><td>− (South)</td><td>− (West)</td></tr>
<tr><td>NW</td><td>270°–360°</td><td>+ (North)</td><td>− (West)</td></tr>
</tbody>
</table>

<h3>Worked Example: Computing Lat/Dep for Each Line</h3>

<p>Using our 4-sided traverse with computed azimuths:</p>

<table>
<thead><tr><th>Line</th><th>Azimuth</th><th>Distance (ft)</th><th>Latitude (ft)</th><th>Departure (ft)</th></tr></thead>
<tbody>
<tr><td>A→B</td><td>47°15′30″</td><td>325.48</td><td>+220.853</td><td>+238.924</td></tr>
<tr><td>B→C</td><td>139°54′15″</td><td>280.16</td><td>−214.629</td><td>+180.187</td></tr>
<tr><td>C→D</td><td>228°48′45″</td><td>310.22</td><td>−203.748</td><td>−233.871</td></tr>
<tr><td>D→A</td><td>320°03′15″</td><td>295.87</td><td>+226.737</td><td>−190.053</td></tr>
<tr><td colspan="3"><strong>Sums:</strong></td><td><strong>+29.213</strong></td><td><strong>−4.813</strong></td></tr>
</tbody>
</table>

<p><em>(Note: These values are illustrative. The non-zero sums represent the linear misclosure, which will be adjusted in Week 5.)</em></p>

<h2>Understanding the Closure Error</h2>

<p>For a perfectly closed traverse, the sums of latitudes and departures should both be <strong>zero</strong> — the traverse returns exactly to its starting point. In practice, measurement errors cause small residuals:</p>

<ul>
<li><strong>Closure in latitude (ΣLat):</strong> The net north-south displacement error</li>
<li><strong>Closure in departure (ΣDep):</strong> The net east-west displacement error</li>
</ul>

<p>The <strong>linear error of closure</strong> is the total positional error:</p>

<p style="text-align:center; font-size:1.1em;"><strong>Linear Error = √(ΣLat² + ΣDep²)</strong></p>

<p>The <strong>relative precision</strong> expresses this error as a fraction of the total traverse perimeter:</p>

<p style="text-align:center; font-size:1.1em;"><strong>Relative Precision = Linear Error / Perimeter = 1 : (Perimeter / Linear Error)</strong></p>

<p>For our example: Linear Error = √(29.213² + 4.813²) = √(853.40 + 23.16) = √876.56 = 29.607 ft. Perimeter = 325.48 + 280.16 + 310.22 + 295.87 = 1211.73 ft. Relative Precision = 29.607 / 1211.73 = 1 : 40.9 — which would be terrible! (Remember, these are illustrative numbers, not real field data.)</p>

<p>In real surveys, the linear error is typically very small — fractions of a foot — giving relative precisions of 1:10,000 or better.</p>

<h2>The Complete Computation Workflow</h2>

<p>Here is the full workflow from field data to lat/dep, which you will use for every closed traverse:</p>

<ol>
<li><strong>Sum measured angles</strong> and compute the angular misclosure</li>
<li><strong>Check</strong> that the misclosure is within tolerance</li>
<li><strong>Balance angles</strong> by distributing the misclosure equally (or by weight)</li>
<li><strong>Compute azimuths</strong> for each traverse line using the azimuth propagation formula</li>
<li><strong>Verify</strong> the azimuth computation closes back to the starting azimuth</li>
<li><strong>Compute latitudes</strong> (Lat = Dist × cos Az) and <strong>departures</strong> (Dep = Dist × sin Az) for each line</li>
<li><strong>Sum latitudes and departures</strong> — the sums represent the closure error</li>
<li><strong>Compute linear error of closure</strong> and <strong>relative precision</strong></li>
<li><strong>Check</strong> that the relative precision meets the required standard</li>
</ol>

<p>Next week, you will learn <strong>Step 10</strong>: adjusting (balancing) the latitudes and departures using the Compass Rule and Transit Rule, then computing final coordinates for each station.</p>

<h2>Why This Matters: The Legal Connection</h2>

<p>Every <strong>metes and bounds</strong> legal description in Texas lists boundary lines as bearings and distances — for example, <em>"thence N 47°15′30″ E a distance of 325.48 feet."</em> These calls are directly derived from the traverse computations you are learning this week. If the latitudes and departures are wrong, the legal description is wrong, and the boundary is wrong. The mathematical chain from field angles → balanced angles → azimuths → latitudes/departures → coordinates → legal description is unbroken, and you must be able to perform and verify every step.</p>

<h2>Looking Ahead</h2>

<p>Next week we complete the traverse computation by <strong>adjusting</strong> the latitudes and departures to force exact closure, then computing <strong>final coordinates</strong> for each station. We will cover the <strong>Compass (Bowditch) Rule</strong> and the <strong>Transit Rule</strong>, the two most common adjustment methods, and discuss when each is appropriate.</p>
',

resources = ''[
  {"title":"Traverse Computation Step-by-Step Guide","url":"https://www.surveyingmath.com/traverse-computation","type":"reference"},
  {"title":"Azimuth and Bearing Conversion Table","url":"https://www.surveyingmath.com/azimuth-bearing","type":"reference"},
  {"title":"FGCS Standards for Geodetic Control Networks","url":"https://www.ngs.noaa.gov/FGCS/tech_pub/1984-stds-specs-geodetic-control-networks.pdf","type":"pdf"}
]''::jsonb,

videos = ''[
  {"title":"Computing Azimuths from Interior Angles","url":"https://www.youtube.com/watch?v=DqEm1JZr_6c"},
  {"title":"Latitudes and Departures — Full Worked Example","url":"https://www.youtube.com/watch?v=KZmBsTN4a_s"}
]''::jsonb,

key_takeaways = ARRAY[
  ''Balance the angular misclosure by distributing the correction equally among all measured angles'',
  ''Propagate azimuths through the traverse using Az_forward = Az_back + 180° + interior angle'',
  ''Convert between azimuths (0°–360° from north) and bearings (N/S angle E/W) in all four quadrants'',
  ''Compute latitude (Dist × cos Az) and departure (Dist × sin Az) for each traverse line'',
  ''Determine the sign of latitude and departure from the azimuth quadrant'',
  ''Compute the linear error of closure from ΣLat and ΣDep'',
  ''Calculate relative precision and compare it to the required accuracy standard''
]

WHERE id = ''acc03b04-0000-0000-0000-000000000001'';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. TOPICS
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM learning_topics WHERE lesson_id = ''acc03b04-0000-0000-0000-000000000001'';

INSERT INTO learning_topics (id, lesson_id, title, content, order_index, keywords) VALUES

(''acc03a04-0001-0000-0000-000000000001'', ''acc03b04-0000-0000-0000-000000000001'',
 ''Angle Balancing: Distributing the Angular Misclosure'',
 ''Before any coordinate computation, the angular misclosure must be distributed among the measured angles so they sum to the theoretical value (n−2)×180°. The equal distribution method divides the total misclosure by the number of angles and applies the correction (with opposite sign) to each angle. For example, a +15″ misclosure over 5 angles yields a −3″ correction per angle. Weighted distribution applies larger corrections to less reliable angles (measured under poorer conditions). The equal distribution method is standard for third-order boundary surveys. Only after balancing are the angles suitable for azimuth computation — using unbalanced angles propagates the error through every subsequent azimuth and coordinate.'',
 1,
 ARRAY[''angle balancing'',''angular misclosure'',''equal distribution'',''weighted correction'',''interior angles'',''theoretical sum'',''adjustment'']),

(''acc03a04-0002-0000-0000-000000000001'', ''acc03b04-0000-0000-0000-000000000001'',
 ''Azimuth Propagation and Bearing Conversion'',
 ''Azimuths are computed sequentially through the traverse using the formula: Az_forward = Az_back + 180° + interior_angle (subtract 360° if result exceeds 360°). The process requires one known starting azimuth and the balanced interior angles. A critical check is that the azimuth computation closes — the final computed azimuth back to the starting line must match the known starting azimuth. Azimuths (measured clockwise from north, 0°–360°) can be converted to bearings (angle from N or S toward E or W, 0°–90°) for use in legal descriptions: NE quadrant = N(az)°E, SE = S(180−az)°E, SW = S(az−180)°W, NW = N(360−az)°W. Texas deed calls traditionally use the bearing format.'',
 2,
 ARRAY[''azimuth'',''bearing'',''propagation'',''back azimuth'',''forward azimuth'',''quadrant'',''NE'',''SE'',''SW'',''NW'',''legal description'',''deed call'']),

(''acc03a04-0003-0000-0000-000000000001'', ''acc03b04-0000-0000-0000-000000000001'',
 ''Latitude and Departure Computation'',
 ''Latitude is the north-south component of a traverse line: Lat = Distance × cos(Azimuth). Departure is the east-west component: Dep = Distance × sin(Azimuth). The trigonometric functions automatically produce correct signs: cosine is positive for azimuths 0°–90° and 270°–360° (northward), negative for 90°–180° and 180°–270° (southward). Sine is positive for 0°–180° (eastward), negative for 180°–360° (westward). For a perfectly closed traverse, ΣLat = 0 and ΣDep = 0. Nonzero sums represent the closure error in latitude and departure. This decomposition into orthogonal components is the mathematical bridge between polar measurements (angle and distance) and rectangular coordinates (N, E).'',
 3,
 ARRAY[''latitude'',''departure'',''cosine'',''sine'',''north-south'',''east-west'',''polar to rectangular'',''sign convention'',''coordinate component'']),

(''acc03a04-0004-0000-0000-000000000001'', ''acc03b04-0000-0000-0000-000000000001'',
 ''Linear Error of Closure and Relative Precision'',
 ''The linear error of closure is the Pythagorean combination of the latitude and departure misclosures: Error = √(ΣLat² + ΣDep²). It represents the distance by which the traverse fails to close on itself. Relative precision expresses the error as a ratio of the total perimeter: 1:(Perimeter/Error). This ratio is the standard measure of traverse quality. TBPELS requires a minimum of 1:10,000 for boundary surveys (i.e., the closure error must be less than 1/10,000 of the perimeter). ALTA/NSPS surveys require 1:15,000. If the relative precision does not meet the standard, the surveyor must identify the source of error — often a distance or angle blunder on a specific leg — and re-measure before proceeding to traverse adjustment.'',
 4,
 ARRAY[''linear error'',''error of closure'',''relative precision'',''perimeter'',''Pythagorean'',''1:10000'',''TBPELS'',''ALTA'',''closure ratio'',''quality check'']);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. QUIZ QUESTIONS (14 questions — mixed types and difficulties)
-- ────────────────────────────────────────────────────────────────────────────

-- Remove any existing week-4 quiz/practice questions for this lesson
DELETE FROM question_bank
WHERE lesson_id = ''acc03b04-0000-0000-0000-000000000001''
  AND tags @> ARRAY[''acc-srvy-1341'',''week-4''];

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- Q1  Multiple Choice  Easy
(''Latitude is computed as:'',
 ''multiple_choice'',
 ''["Distance × sin(azimuth)","Distance × cos(azimuth)","Distance × tan(azimuth)","Distance / cos(azimuth)"]''::jsonb,
 ''Distance × cos(azimuth)'',
 ''Latitude (the N-S component) = Distance × cos(Azimuth). Departure (the E-W component) = Distance × sin(Azimuth). Remember: "Lat = D cos A" — the cosine gives the component along the north-south axis.'',
 ''easy'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''quiz'',''latitude'',''formula'']),

-- Q2  Multiple Choice  Easy
(''Departure is computed as:'',
 ''multiple_choice'',
 ''["Distance × cos(azimuth)","Distance × sin(azimuth)","Distance × tan(azimuth)","Distance / sin(azimuth)"]''::jsonb,
 ''Distance × sin(azimuth)'',
 ''Departure (the E-W component) = Distance × sin(Azimuth). Positive departures indicate movement east; negative departures indicate movement west.'',
 ''easy'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''quiz'',''departure'',''formula'']),

-- Q3  True/False  Easy
(''In a perfectly closed traverse, the sum of all latitudes should equal zero.'',
 ''true_false'',
 ''["True","False"]''::jsonb,
 ''True'',
 ''For a closed traverse that returns to the starting point, the net north-south displacement is zero, so ΣLatitudes = 0. Similarly, ΣDepartures = 0. Any nonzero sums represent the linear misclosure caused by measurement errors.'',
 ''easy'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''quiz'',''closure'',''latitude-sum'']),

-- Q4  True/False  Easy
(''The angular misclosure must be distributed among the measured angles before computing azimuths.'',
 ''true_false'',
 ''["True","False"]''::jsonb,
 ''True'',
 ''Using unbalanced angles to compute azimuths propagates the angular error through every subsequent azimuth and, consequently, through every latitude and departure. The angles must be balanced first so that they sum to the correct theoretical value before azimuth propagation begins.'',
 ''easy'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''quiz'',''angle-balancing'',''azimuth'']),

-- Q5  Numeric Input  Medium
(''A traverse line has an azimuth of 135°00′00″ and a distance of 200.00 ft. What is its latitude? Round to 2 decimal places.'',
 ''numeric_input'',
 ''[]''::jsonb,
 ''-141.42'',
 ''Lat = 200.00 × cos(135°) = 200.00 × (−0.70711) = −141.42 ft. The negative sign indicates a southward component, which is correct — an azimuth of 135° is in the SE quadrant.'',
 ''medium'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''quiz'',''latitude'',''computation'',''SE-quadrant'']),

-- Q6  Numeric Input  Medium
(''The same traverse line (azimuth 135°, distance 200.00 ft) has a departure of what value? Round to 2 decimal places.'',
 ''numeric_input'',
 ''[]''::jsonb,
 ''141.42'',
 ''Dep = 200.00 × sin(135°) = 200.00 × 0.70711 = +141.42 ft. Positive departure means the line goes eastward.'',
 ''medium'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''quiz'',''departure'',''computation'']),

-- Q7  Multiple Choice  Medium
(''An azimuth of 228°45′00″ falls in which quadrant, and what is the equivalent bearing?'',
 ''multiple_choice'',
 ''["NE quadrant — N 48°45′00″ E","SE quadrant — S 48°45′00″ E","SW quadrant — S 48°45′00″ W","NW quadrant — N 48°45′00″ W"]''::jsonb,
 ''SW quadrant — S 48°45′00″ W'',
 ''Azimuths from 180° to 270° are in the SW quadrant. Bearing = S (azimuth − 180°) W = S (228°45′ − 180°) W = S 48°45′00″ W.'',
 ''medium'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''quiz'',''azimuth'',''bearing'',''quadrant-conversion'']),

-- Q8  Multiple Choice  Medium
(''A 5-sided traverse has measured interior angles summing to 540°00′20″. Using equal distribution, the correction applied to each angle is:'',
 ''multiple_choice'',
 ''["+4″ to each angle","−4″ to each angle","+20″ to one angle","−20″ to one angle"]''::jsonb,
 ''−4″ to each angle'',
 ''Theoretical sum = (5−2)×180° = 540°. Misclosure = 540°00′20″ − 540°00′00″ = +20″. Correction per angle = −20″ / 5 = −4″. The correction has the opposite sign of the misclosure.'',
 ''medium'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''quiz'',''angle-balancing'',''equal-distribution'']),

-- Q9  Numeric Input  Medium
(''The azimuth from Station P to Station Q is 312°30′00″. What is the back azimuth (azimuth from Q to P)?'',
 ''numeric_input'',
 ''[]''::jsonb,
 ''132.5'',
 ''Back azimuth = forward azimuth − 180° = 312°30′ − 180° = 132°30′ = 132.5° (in decimal degrees). Since the forward azimuth was > 180°, we subtract 180°. If it had been < 180°, we would add 180°.'',
 ''medium'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''quiz'',''back-azimuth'',''computation'']),

-- Q10  Numeric Input  Hard (Multi-step: lat/dep and closure)
(''A traverse has the following latitude and departure sums: ΣLat = +0.12 ft, ΣDep = −0.16 ft, and a perimeter of 2,400 ft. What is the relative precision expressed as 1:X? Give X as a whole number.'',
 ''numeric_input'',
 ''[]''::jsonb,
 ''12000'',
 ''Linear error = √(0.12² + 0.16²) = √(0.0144 + 0.0256) = √0.0400 = 0.20 ft. Relative precision = Perimeter / Error = 2400 / 0.20 = 12,000. So the precision is 1:12,000, which meets the TBPELS minimum of 1:10,000.'',
 ''hard'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''quiz'',''linear-error'',''relative-precision'',''multi-step'']),

-- Q11  Numeric Input  Hard (Azimuth propagation)
(''The azimuth from Station 1 to Station 2 is 65°20′00″. The balanced interior angle at Station 2 is 105°40′00″. Using the formula Az_forward = Az_back + 180° + interior_angle, what is the azimuth from Station 2 to Station 3? Give your answer in decimal degrees to 2 decimal places.'',
 ''numeric_input'',
 ''[]''::jsonb,
 ''351.00'',
 ''Az(2→3) = Az(1→2) + 180° + interior_angle_at_2 = 65°20′ + 180° + 105°40′ = 351°00′ = 351.00°. Since the result is less than 360°, no subtraction is needed.'',
 ''hard'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''quiz'',''azimuth-propagation'',''computation'']),

-- Q12  Numeric Input  Hard (Full lat/dep computation for one line)
(''A traverse line runs from Station A to Station B with an azimuth of 247°18′00″ and a horizontal distance of 412.56 ft. Compute the departure of this line. Round to 2 decimal places.'',
 ''numeric_input'',
 ''[]''::jsonb,
 ''-380.12'',
 ''Dep = 412.56 × sin(247°18′) = 412.56 × sin(247.3°) = 412.56 × (−0.9214) = −380.12 ft. The negative departure indicates the line runs westward, which is expected for an azimuth in the SW quadrant (180°–270°).'',
 ''hard'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''quiz'',''departure'',''SW-quadrant'',''computation'']),

-- Q13  Essay  Hard
(''A surveyor completes a 6-sided closed loop traverse. The measured interior angles sum to 720°00′24″. The surveyor balances the angles, computes azimuths, and then computes latitudes and departures. The sums are ΣLat = −0.08 ft and ΣDep = +0.06 ft. The perimeter is 1,850 ft. (a) Show how the angles would be balanced using equal distribution. (b) Compute the linear error of closure. (c) Compute the relative precision. (d) Does this traverse meet TBPELS minimum standards for a boundary survey? Explain.'',
 ''essay'',
 ''[]''::jsonb,
 ''Key points: (a) Theoretical sum = (6−2)×180° = 720°. Misclosure = +24″. Correction per angle = −24/6 = −4″ per angle. Subtract 4″ from each measured angle. (b) Linear error = √(0.08² + 0.06²) = √(0.0064 + 0.0036) = √0.0100 = 0.10 ft. (c) Relative precision = 1:(1850/0.10) = 1:18,500. (d) Yes — TBPELS minimum for boundary surveys is 1:10,000. This traverse at 1:18,500 exceeds the minimum by a comfortable margin. It also meets the ALTA/NSPS standard of 1:15,000.'',
 ''A complete answer correctly balances angles (−4″ each), computes the linear error (0.10 ft), derives relative precision (1:18,500), and correctly compares to TBPELS (1:10,000) and optionally ALTA (1:15,000) standards with a clear pass/fail determination.'',
 ''hard'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''quiz'',''essay'',''angle-balancing'',''closure'',''precision'',''multi-step'']),

-- Q14  Essay  Medium
(''Explain the difference between an azimuth and a bearing. Convert the following azimuths to bearings: (a) 52°30′, (b) 168°15′, (c) 243°00′, (d) 315°45′. Then explain why Texas deed descriptions typically use bearings rather than azimuths.'',
 ''essay'',
 ''[]''::jsonb,
 ''Key points: An azimuth is measured clockwise from north, ranging 0°–360°. A bearing is measured from either N or S toward E or W, ranging 0°–90°. Conversions: (a) 52°30′ → N 52°30′ E (NE quadrant). (b) 168°15′ → S 11°45′ E (SE: 180−168.25=11.75°=11°45′). (c) 243°00′ → S 63°00′ W (SW: 243−180=63°). (d) 315°45′ → N 44°15′ W (NW: 360−315.75=44.25°=44°15′). Texas deeds use bearings because they explicitly indicate direction (N/S/E/W), making them more intuitive for non-surveyors reading legal descriptions, and they follow the traditional metes-and-bounds format inherited from English common law.'',
 ''A good answer clearly defines both terms, correctly converts all four examples, and explains the practical/legal reason for bearing usage in Texas deed descriptions.'',
 ''medium'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''quiz'',''essay'',''azimuth'',''bearing'',''conversion'',''legal-description'']);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. PRACTICE PROBLEMS
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- Practice 1: Angle balancing
(''Practice: A 4-sided traverse has measured interior angles of 89°15′08″, 91°42′16″, 88°30′24″, and 90°32′20″. (a) What is the angular misclosure? (b) Apply equal distribution to balance the angles. Give the correction per angle in seconds.'',
 ''numeric_input'', ''[]''::jsonb,
 ''-2'',
 ''Theoretical sum = (4−2)×180° = 360°. Measured sum: 89°15′08″ + 91°42′16″ + 88°30′24″ + 90°32′20″. Seconds: 8+16+24+20 = 68″ = 1′08″. Minutes: 15+42+30+32+1 = 120′ = 2°00′. Degrees: 89+91+88+90+2 = 360°. Total = 360°00′08″. Misclosure = +8″. Correction per angle = −8″/4 = −2″.'',
 ''medium'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''practice'',''angle-balancing'']),

-- Practice 2: Azimuth to bearing
(''Practice: Convert the following azimuth to a bearing: 297°14′30″.'',
 ''short_answer'', ''[]''::jsonb,
 ''N 62°45′30″ W'',
 ''Azimuth 297°14′30″ is in the NW quadrant (270°–360°). Bearing = N (360° − 297°14′30″) W = N 62°45′30″ W.'',
 ''easy'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''practice'',''bearing'',''conversion'']),

-- Practice 3: Bearing to azimuth
(''Practice: Convert the bearing S 37°22′00″ E to an azimuth.'',
 ''numeric_input'', ''[]''::jsonb,
 ''142.63'',
 ''S xx° E is in the SE quadrant. Azimuth = 180° − 37°22′ = 142°38′. In decimal: 142 + 38/60 = 142.633° ≈ 142.63°.'',
 ''easy'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''practice'',''azimuth'',''conversion'']),

-- Practice 4: Lat/dep for a single line
(''Practice: A traverse line has an azimuth of 72°30′00″ and a distance of 185.64 ft. Compute (a) the latitude and (b) the departure. Round each to 2 decimal places. Give the latitude only.'',
 ''numeric_input'', ''[]''::jsonb,
 ''55.81'',
 ''Lat = 185.64 × cos(72°30′) = 185.64 × cos(72.5°) = 185.64 × 0.30071 = 55.81 ft (positive — northward). Dep = 185.64 × sin(72.5°) = 185.64 × 0.95372 = 177.04 ft (positive — eastward).'',
 ''medium'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''practice'',''latitude'',''departure'',''computation'']),

-- Practice 5: Linear error of closure
(''Practice: A closed traverse has ΣLat = −0.05 ft and ΣDep = +0.12 ft, with a total perimeter of 3,200 ft. (a) What is the linear error of closure? (b) What is the relative precision (as 1:X)? Give X as a whole number.'',
 ''numeric_input'', ''[]''::jsonb,
 ''24615'',
 ''Linear error = √(0.05² + 0.12²) = √(0.0025 + 0.0144) = √0.0169 = 0.13 ft. Relative precision = 3200 / 0.13 = 24,615. So the precision is 1:24,615.'',
 ''hard'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''practice'',''linear-error'',''relative-precision'',''word-problem'']),

-- Practice 6: Azimuth propagation
(''Practice: The azimuth from Station A to Station B is 130°15′00″. The balanced interior angle at Station B is 78°50′00″. What is the azimuth from Station B to Station C? Use Az_forward = Az_previous + 180° + interior_angle (subtract 360° if needed). Give your answer in decimal degrees to 2 decimal places.'',
 ''numeric_input'', ''[]''::jsonb,
 ''29.08'',
 ''Az(B→C) = Az(A→B) + 180° + angle_at_B = 130°15′ + 180° + 78°50′ = 389°05′. Subtract 360°: 29°05′ = 29.083° ≈ 29.08°.'',
 ''hard'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''practice'',''azimuth-propagation'',''computation'']),

-- Practice 7: Multi-step word problem — complete lat/dep for two lines
(''Practice: A 3-sided traverse (triangle) has the following data after angle balancing. Starting azimuth A→B = 40°00′00″. Interior angle at B = 120°00′00″. Distance B→C = 250.00 ft. (a) Compute the azimuth from B to C using Az_forward = Az_previous + 180° + interior_angle. (b) Compute the latitude of line B→C. Round latitude to 2 decimal places. Give the latitude only.'',
 ''numeric_input'', ''[]''::jsonb,
 ''234.92'',
 ''Az(B→C) = Az(A→B) + 180° + angle_at_B = 40° + 180° + 120° = 340°. Since 340° < 360°, no subtraction needed. Lat(B→C) = 250 × cos(340°) = 250 × 0.93969 = 234.92 ft. The positive latitude means the line goes northward, consistent with azimuth 340° being in the NW quadrant.'',
 ''hard'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''practice'',''azimuth-propagation'',''latitude'',''multi-step'']),

-- Practice 8: Essay — full workflow
(''Practice: Describe the complete workflow for computing latitudes and departures from raw traverse field data. Your answer should cover: (a) angle balancing — what it is, why it is necessary, and how corrections are distributed; (b) azimuth propagation — the formula used and the closure check; (c) latitude and departure formulas with sign conventions; (d) how to compute the linear error of closure and relative precision; (e) what to do if the relative precision does not meet the required accuracy standard.'',
 ''essay'', ''[]''::jsonb,
 ''Key points: (a) Angular misclosure = measured sum − (n−2)×180°. Must be within tolerance before proceeding. Equal distribution: correction = −misclosure/n applied to each angle. (b) Az_forward = Az_back + 180° + interior_angle; subtract 360° if >360°. Closure check: final computed azimuth must match starting azimuth. (c) Lat = D × cos(Az), Dep = D × sin(Az). Positive lat = north, negative = south; positive dep = east, negative = west. (d) Linear error = √(ΣLat² + ΣDep²). Relative precision = 1:(Perimeter/Error). (e) If precision is insufficient, review field data for blunders (large residuals on specific legs), check for recording errors, and re-measure suspect distances or angles. Do not proceed to adjustment until the raw traverse meets the minimum precision standard.'',
 ''A thorough answer covers all five parts with correct formulas and logical reasoning. Strong answers include the sign convention table, mention the azimuth closure check, and discuss blunder hunting for failed precision checks.'',
 ''medium'',
 ''acc00003-0000-0000-0000-000000000003'', ''acc03b04-0000-0000-0000-000000000001'',
 ''ACC-1341'', ARRAY[''acc-srvy-1341'',''week-4'',''practice'',''essay'',''workflow'',''lat-dep'',''comprehensive'']);
