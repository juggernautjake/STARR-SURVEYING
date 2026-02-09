-- ============================================================================
-- ACC SRVY 1341 — Week 2: Traverse Types and Planning
-- Full lesson content, topics, quiz questions (14), and practice problems
-- Module ID: acc00003-0000-0000-0000-000000000003
-- Lesson ID: acc03b02-0000-0000-0000-000000000001
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. UPDATE LESSON CONTENT
-- ────────────────────────────────────────────────────────────────────────────

UPDATE learning_lessons SET content = '
<h2>Traversing: The Backbone of Land Surveying</h2>

<p>A <strong>traverse</strong> is a series of connected lines whose lengths and directions have been measured. It is the most common method of establishing horizontal control for boundary surveys, construction layout, topographic mapping, and route surveys. Nearly every land survey you will perform in your career — from a simple lot survey to a complex pipeline corridor — begins with a traverse.</p>

<p>The word "traverse" comes from the Latin <em>traversare</em>, meaning "to cross." In surveying, you are literally crossing from one control point to the next, building a framework of known positions upon which all other measurements hang. The quality of every coordinate, boundary line, and area computation downstream depends on the quality of the traverse that produced them.</p>

<p>This week we examine the three fundamental traverse configurations, learn how to plan a traverse for maximum efficiency and accuracy, and review the standards that govern how precise your work must be.</p>

<h2>What Is a Traverse?</h2>

<p>Formally, a traverse consists of:</p>
<ul>
<li>A series of <strong>stations</strong> (points on the ground, typically marked with monuments, nails, or hubs)</li>
<li><strong>Angles</strong> measured at each station (interior angles, deflection angles, or azimuths)</li>
<li><strong>Distances</strong> measured along each line connecting consecutive stations</li>
</ul>

<p>From these raw measurements, you compute <strong>coordinates</strong> (Northing, Easting) for every station. Those coordinates become the foundation for mapping, area calculations, and legal descriptions.</p>

<h2>The Three Types of Traverses</h2>

<h3>1. Open Traverse</h3>

<p>An open traverse starts at a known point and proceeds through a series of stations <em>without returning to the starting point or connecting to another known point</em>. It is essentially a one-way path.</p>

<table>
<thead><tr><th>Characteristic</th><th>Detail</th></tr></thead>
<tbody>
<tr><td>Configuration</td><td>Starts at a known point, ends at an unknown point</td></tr>
<tr><td>Closure check</td><td><strong>None</strong> — no way to verify angular or linear accuracy</td></tr>
<tr><td>When used</td><td>Preliminary route surveys, exploratory work, emergency situations</td></tr>
<tr><td>Risk</td><td>Errors accumulate undetected; results are unreliable for final work</td></tr>
</tbody>
</table>

<p><strong>Important:</strong> Open traverses provide <em>no mathematical check</em> on the work. A blunder in one angle or distance propagates through every subsequent station and you have no way to detect it. For this reason, open traverses should be <strong>avoided whenever possible</strong> and are never acceptable for boundary surveys in Texas.</p>

<h3>2. Closed Loop Traverse</h3>

<p>A closed loop traverse starts and ends at the <em>same</em> point, forming a polygon. This is the most common configuration for boundary surveys because the property being surveyed is itself a closed polygon.</p>

<table>
<thead><tr><th>Characteristic</th><th>Detail</th></tr></thead>
<tbody>
<tr><td>Configuration</td><td>Starts and ends at the same station, forming a closed polygon</td></tr>
<tr><td>Closure check</td><td><strong>Yes</strong> — angular sum and coordinate closure can both be verified</td></tr>
<tr><td>When used</td><td>Boundary surveys, property surveys, control networks</td></tr>
<tr><td>Angular check</td><td>Sum of interior angles = (n − 2) × 180°</td></tr>
<tr><td>Linear check</td><td>Computed return to the starting point; any gap is the linear misclosure</td></tr>
</tbody>
</table>

<p>Because the traverse returns to where it started, the sum of all latitudes should equal zero and the sum of all departures should equal zero. Any deviation from zero represents the <strong>error of closure</strong>, which we will compute in detail during Week 5.</p>

<h3>3. Closed Connecting Traverse</h3>

<p>A closed connecting traverse (also called a <strong>link traverse</strong>) starts at one known point with a known direction and ends at a <em>different</em> known point with a known direction. The "closure" comes from comparing your computed ending position with the known position of the endpoint.</p>

<table>
<thead><tr><th>Characteristic</th><th>Detail</th></tr></thead>
<tbody>
<tr><td>Configuration</td><td>Connects two separate known points/directions</td></tr>
<tr><td>Closure check</td><td><strong>Yes</strong> — both angular and positional checks available</td></tr>
<tr><td>When used</td><td>Route surveys, utility corridors, connecting control monuments</td></tr>
<tr><td>Angular check</td><td>Computed azimuth at endpoint must match the known azimuth</td></tr>
<tr><td>Linear check</td><td>Computed coordinates at endpoint must match known coordinates</td></tr>
</tbody>
</table>

<p>Connecting traverses are common in highway, pipeline, and utility surveying where you are following a linear corridor from one control point to another. They provide the same quality of closure checking as loop traverses.</p>

<h2>Comparing Traverse Types</h2>

<table>
<thead><tr><th>Feature</th><th>Open</th><th>Closed Loop</th><th>Closed Connecting</th></tr></thead>
<tbody>
<tr><td>Returns to known point?</td><td>No</td><td>Yes (same point)</td><td>Yes (different point)</td></tr>
<tr><td>Angular check?</td><td>No</td><td>Yes</td><td>Yes</td></tr>
<tr><td>Linear check?</td><td>No</td><td>Yes</td><td>Yes</td></tr>
<tr><td>Blunder detection?</td><td>No</td><td>Yes</td><td>Yes</td></tr>
<tr><td>Suitable for boundaries?</td><td>No</td><td>Yes</td><td>Yes (with care)</td></tr>
<tr><td>Adjustment possible?</td><td>No</td><td>Yes</td><td>Yes</td></tr>
</tbody>
</table>

<h2>Interior Angles and the Angle Sum Check</h2>

<p>For any closed polygon with <em>n</em> sides, the sum of the <strong>interior angles</strong> must equal:</p>

<p style="text-align:center; font-size:1.1em;"><strong>Σ Interior Angles = (n − 2) × 180°</strong></p>

<table>
<thead><tr><th>Sides (n)</th><th>Expected Sum</th></tr></thead>
<tbody>
<tr><td>3 (triangle)</td><td>180°</td></tr>
<tr><td>4 (quadrilateral)</td><td>360°</td></tr>
<tr><td>5 (pentagon)</td><td>540°</td></tr>
<tr><td>6 (hexagon)</td><td>720°</td></tr>
<tr><td>7 (heptagon)</td><td>900°</td></tr>
<tr><td>8 (octagon)</td><td>1080°</td></tr>
</tbody>
</table>

<p>The difference between the measured sum and the theoretical sum is the <strong>angular misclosure</strong>. If it exceeds the allowable tolerance, you must re-measure angles before proceeding to computations.</p>

<h3>Allowable Angular Misclosure</h3>

<p>The maximum acceptable angular misclosure depends on the accuracy standard being followed and the number of angles measured. A common formula is:</p>

<p style="text-align:center;"><strong>Allowable Misclosure = K × √n</strong></p>

<p>where <em>K</em> is a constant based on the accuracy standard and <em>n</em> is the number of angles. For example:</p>

<ul>
<li><strong>First-order:</strong> K = 1.0" (1 second per square root of n)</li>
<li><strong>Second-order, Class I:</strong> K = 1.5"</li>
<li><strong>Second-order, Class II:</strong> K = 3.0"</li>
<li><strong>Third-order, Class I:</strong> K = 5.0"</li>
<li><strong>Third-order, Class II:</strong> K = 10.0"</li>
<li><strong>Construction/local surveys:</strong> K = 15" to 30"</li>
</ul>

<p><strong>Example:</strong> A 5-sided traverse measured to third-order, Class I standards. Allowable misclosure = 5" × √5 = 5" × 2.236 = <strong>11.2"</strong> (round to 11"). If your measured angles sum to 540°00''14", the misclosure is 14" which <em>exceeds</em> 11" — you would need to re-observe at least some angles.</p>

<h2>Traverse Planning</h2>

<p>Good traverse results begin with good planning. Before you set foot in the field, you should address the following:</p>

<h3>Station Selection</h3>
<ul>
<li><strong>Intervisibility:</strong> Every station must have a clear line of sight to the stations before and after it. Vegetation, buildings, and terrain can block sightlines.</li>
<li><strong>Stability:</strong> Stations must be on firm, stable ground. Avoid soft soil, areas prone to flooding, or active construction zones.</li>
<li><strong>Accessibility:</strong> You (and future surveyors) need to be able to reach each station. Consider vehicle access, permission, and safety.</li>
<li><strong>Geometry:</strong> Avoid very short traverse legs (difficult to center over) and very long legs (atmospheric refraction increases). Legs should be roughly equal in length when possible. Avoid very acute or very obtuse angles — angles near 180° or 0° are weak geometrically.</li>
<li><strong>Monumentation:</strong> Choose locations where you can set durable monuments that won''t be disturbed.</li>
</ul>

<h3>Accuracy Requirements</h3>
<p>Before starting fieldwork, determine which <strong>accuracy standard</strong> applies. In Texas, the <strong>Texas Board of Professional Land Surveying (TBPELS)</strong> sets minimum standards for boundary surveys. The Federal Geodetic Control Subcommittee (FGCS) standards apply to geodetic control work. Your accuracy standard determines:</p>
<ul>
<li>How many times you must measure each angle (repetitions)</li>
<li>The type of instrument required (total station accuracy class)</li>
<li>Allowable angular misclosure</li>
<li>Minimum relative precision ratio for linear closure</li>
</ul>

<h3>Control and Reference Points</h3>
<p>Identify existing control points (NGS monuments, county survey markers, previously established corners) near your project. Connecting your traverse to established control:</p>
<ul>
<li>Places your survey in the state coordinate system (Texas State Plane or UTM)</li>
<li>Allows future surveys to tie into your work</li>
<li>Provides an independent check on your results</li>
</ul>

<h3>Safety and Logistics</h3>
<ul>
<li>Obtain right-of-entry permissions for private land</li>
<li>Plan for traffic control on road corridors</li>
<li>Check weather forecasts — heavy heat shimmer, rain, and high winds degrade measurements</li>
<li>In Texas, be aware of <strong>heat-related illness</strong> risk during summer fieldwork (hydration, shade breaks, buddy system)</li>
<li>Watch for fire ants, snakes, and thorny brush — common hazards in central Texas</li>
</ul>

<h2>Texas-Specific Survey Standards</h2>

<p>The <strong>Texas Administrative Code, Title 22, Part 29</strong> (TBPELS rules) sets minimum standards for property surveys in Texas. Key points relevant to traversing:</p>

<ul>
<li>All surveys establishing or re-establishing property boundaries must meet at minimum a <strong>1:10,000 relative precision</strong> (equivalent to third-order accuracy).</li>
<li>ALTA/NSPS Land Title Surveys (used in commercial real estate transactions) require <strong>1:15,000 minimum relative precision</strong>.</li>
<li>Angular misclosure must be within tolerance before adjustment.</li>
<li>The surveyor must set monuments at all property corners found or established.</li>
<li>All traverse computations must be documented and available for review by TBPELS if requested.</li>
</ul>

<h2>Practical Example: Planning a Boundary Traverse</h2>

<p>Suppose you are hired to survey a 5-acre residential lot in Austin, TX. Here is how you would plan the traverse:</p>

<ol>
<li><strong>Research:</strong> Obtain the deed, prior survey plat, and any subdivision plat from the Travis County records. Identify called-for monuments and bearings/distances.</li>
<li><strong>Reconnaissance:</strong> Visit the site. Walk the property lines. Locate any existing monuments (iron rods, pipes, concrete monuments). Note obstructions that might affect sightlines.</li>
<li><strong>Design the traverse:</strong> For a roughly rectangular 5-acre lot, you might need 4–6 traverse stations at the property corners plus any angle points in the boundary. A closed loop traverse is appropriate.</li>
<li><strong>Select instruments:</strong> A 5" total station is sufficient for boundary work. You will need a prism and pole, tripod, tribrach, field book, and lath/flagging for marking points.</li>
<li><strong>Establish accuracy target:</strong> TBPELS minimum is 1:10,000. You aim for 1:15,000 to provide a safety margin (and to meet ALTA standards if the client later requests it).</li>
<li><strong>Compute allowable misclosure:</strong> For a 5-sided traverse at third-order Class I: angular = 5" × √5 ≈ 11". Linear = perimeter / 10,000.</li>
</ol>

<h2>Looking Ahead</h2>

<p>Next week we move from planning to execution — the specific <strong>field procedures</strong> for running a traverse. You will learn the direction method and repetition method for measuring angles, how to record traverse data in proper field note format, and how to perform on-site checks that catch blunders before you leave the field.</p>
',

resources = '[
  {"title":"FGCS Standards and Specifications for Geodetic Control Networks","url":"https://www.ngs.noaa.gov/FGCS/tech_pub/1984-stds-specs-geodetic-control-networks.pdf","type":"pdf"},
  {"title":"TBPELS Rules — Chapter 663 Standards of Practice","url":"https://www.txls.texas.gov/","type":"reference"},
  {"title":"Traverse Planning Checklist","url":"https://www.surveyingmath.com/traverse-planning","type":"reference"}
]'::jsonb,

videos = '[
  {"title":"Types of Traverses Explained — Open, Closed Loop, Connecting","url":"https://www.youtube.com/watch?v=_6bAkqj7KBk"},
  {"title":"How to Plan a Survey Traverse","url":"https://www.youtube.com/watch?v=h1_OLxNqK0E"}
]'::jsonb,

key_takeaways = ARRAY[
  'Define a traverse and explain its role as the foundation of horizontal control',
  'Describe the three types of traverses: open, closed loop, and closed connecting',
  'Explain why open traverses provide no accuracy checks and should be avoided for final surveys',
  'Compute the expected interior angle sum for any n-sided polygon using (n-2) × 180°',
  'Calculate allowable angular misclosure using K × √n for a given accuracy standard',
  'Identify key factors in traverse planning: intervisibility, stability, geometry, and accuracy standards',
  'Understand Texas TBPELS minimum standards for boundary survey precision (1:10,000)'
]

WHERE id = 'acc03b02-0000-0000-0000-000000000001';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. TOPICS
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM learning_topics WHERE lesson_id = 'acc03b02-0000-0000-0000-000000000001';

INSERT INTO learning_topics (id, lesson_id, title, content, order_index, keywords) VALUES

('acc03a02-0001-0000-0000-000000000001', 'acc03b02-0000-0000-0000-000000000001',
 'Open Traverses: Configuration and Limitations',
 'An open traverse begins at a known point and proceeds through a series of stations without closing on itself or on another known point. Because there is no return to a reference position, there is no mathematical check on the accumulated angles or distances. Any blunder — a misread angle, a transposed distance — propagates to every subsequent station and cannot be detected from the traverse data alone. Open traverses are used only when closure is physically impossible (such as a preliminary route survey through dense terrain) or when the work is exploratory and will be superseded by a closed traverse later. Under no circumstances should an open traverse be used for boundary determination or final control in Texas.',
 1,
 ARRAY['open traverse','no closure','blunder detection','route survey','preliminary','undetected error','limitation']),

('acc03a02-0002-0000-0000-000000000001', 'acc03b02-0000-0000-0000-000000000001',
 'Closed Traverses: Loop and Connecting Configurations',
 'A closed loop traverse forms a polygon by returning to the starting station. The angular check is the interior angle sum: (n−2)×180°. The positional check is that the computed coordinates must return to the starting coordinates — any discrepancy is the linear error of closure. A closed connecting (link) traverse starts at one known point/azimuth and ends at a different known point/azimuth. The angular check compares the computed final azimuth with the known value; the positional check compares computed and known ending coordinates. Both types allow blunder detection and enable mathematical adjustment of the traverse. Loop traverses are standard for property surveys; connecting traverses are standard for route and corridor surveys.',
 2,
 ARRAY['closed loop','closed connecting','link traverse','interior angle sum','error of closure','adjustment','polygon','corridor']),

('acc03a02-0003-0000-0000-000000000001', 'acc03b02-0000-0000-0000-000000000001',
 'Interior Angle Sum and Allowable Misclosure',
 'For a convex polygon with n sides, the sum of interior angles equals (n−2)×180°. This formula is the primary angular check for closed loop traverses. The angular misclosure is the difference between the measured angle sum and the theoretical sum. The allowable misclosure depends on the survey accuracy standard and the number of angles: Allowable = K × √n, where K is a constant (e.g., 1" for first order, 10" for third-order Class II, up to 30" for construction surveys). If the measured misclosure exceeds the allowable value, the surveyor must re-observe angles — typically starting with the angles measured under the poorest conditions (long sights, shimmer, wind). Only after the angular misclosure is within tolerance can the surveyor proceed to compute latitudes and departures.',
 3,
 ARRAY['interior angle','angle sum','misclosure','allowable','tolerance','FGCS','accuracy standard','re-observe','K factor','square root n']),

('acc03a02-0004-0000-0000-000000000001', 'acc03b02-0000-0000-0000-000000000001',
 'Traverse Planning and Texas Standards',
 'Effective traverse planning considers station intervisibility (clear sightlines between consecutive stations), ground stability, accessibility for current and future surveys, and geometric strength (avoiding very short legs or nearly straight angles). The surveyor must determine the applicable accuracy standard before fieldwork begins. In Texas, TBPELS requires a minimum relative precision of 1:10,000 for boundary surveys and 1:15,000 for ALTA/NSPS surveys. The FGCS publishes standards from first order through third order for geodetic control. Connecting to existing control (NGS monuments, county markers) places the survey on the state plane coordinate system and provides independent verification. Logistics include right-of-entry permissions, traffic control plans for road work, weather considerations (heat shimmer degrades EDM accuracy), and safety hazards common to Texas fieldwork (heat illness, venomous snakes, fire ants).',
 4,
 ARRAY['intervisibility','station selection','geometry','TBPELS','FGCS','relative precision','1:10000','ALTA','control','monument','Texas','safety']);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. QUIZ QUESTIONS (14 questions — mixed types and difficulties)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM question_bank
WHERE lesson_id = 'acc03b02-0000-0000-0000-000000000001'
  AND tags @> ARRAY['acc-srvy-1341','week-2'];

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- Q1  Multiple Choice  Easy
('Which type of traverse provides NO mathematical check on accuracy?',
 'multiple_choice',
 '["Closed loop traverse","Closed connecting traverse","Open traverse","Link traverse"]'::jsonb,
 'Open traverse',
 'An open traverse does not return to a known point, so there is no way to compute angular or linear closure. Errors and blunders accumulate undetected. Both closed loop and closed connecting (link) traverses provide closure checks.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','open-traverse','closure']),

-- Q2  Multiple Choice  Easy
('What is the expected sum of interior angles for a 4-sided closed traverse?',
 'multiple_choice',
 '["180°","270°","360°","540°"]'::jsonb,
 '360°',
 'Sum = (n − 2) × 180° = (4 − 2) × 180° = 2 × 180° = 360°.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','interior-angles','angle-sum']),

-- Q3  True/False  Easy
('A closed connecting traverse starts and ends at the same point.',
 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'A closed connecting (link) traverse starts at one known point and ends at a DIFFERENT known point. A closed LOOP traverse is the one that starts and ends at the same point. Both provide closure checks.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','connecting-traverse','loop-traverse']),

-- Q4  True/False  Easy
('Open traverses are acceptable for final boundary surveys in Texas.',
 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'Open traverses provide no closure checks and cannot detect blunders. TBPELS standards require that boundary surveys have verifiable accuracy, which means a closed traverse (loop or connecting) is required. Open traverses are only used for preliminary or exploratory work.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','open-traverse','Texas','TBPELS']),

-- Q5  Numeric Input  Medium
('A closed traverse has 7 sides. What should the interior angles sum to in degrees?',
 'numeric_input',
 '[]'::jsonb,
 '900',
 '(n − 2) × 180° = (7 − 2) × 180° = 5 × 180° = 900°.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','interior-angles','computation']),

-- Q6  Multiple Choice  Medium
('Which factor is MOST important when selecting traverse station locations?',
 'multiple_choice',
 '["Proximity to the office","Intervisibility between consecutive stations","The station being on public land","Availability of cell phone signal"]'::jsonb,
 'Intervisibility between consecutive stations',
 'The instrument at each station must have a clear line of sight to the adjacent stations for angle and distance measurements. Without intervisibility, the traverse cannot be measured. While accessibility and land permissions matter, intervisibility is the fundamental geometric requirement.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','station-selection','planning']),

-- Q7  Multiple Choice  Medium
('The minimum relative precision required by TBPELS for boundary surveys in Texas is:',
 'multiple_choice',
 '["1:5,000","1:10,000","1:15,000","1:20,000"]'::jsonb,
 '1:10,000',
 'TBPELS rules require a minimum relative precision of 1:10,000 for property boundary surveys. ALTA/NSPS surveys require 1:15,000. Higher-order geodetic control surveys have even stricter requirements.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','TBPELS','precision','standards']),

-- Q8  Numeric Input  Medium (Allowable misclosure calculation)
('A 6-sided traverse is being measured to third-order, Class I standards (K = 5"). What is the allowable angular misclosure in seconds? (Round to 1 decimal place)',
 'numeric_input',
 '[]'::jsonb,
 '12.2',
 'Allowable misclosure = K × √n = 5" × √6 = 5" × 2.449 = 12.2" (rounded to 1 decimal).',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','allowable-misclosure','computation']),

-- Q9  Multiple Choice  Medium
('A closed connecting traverse differs from a closed loop traverse because it:',
 'multiple_choice',
 '["Has no angular closure check","Ends at a different known point than it started","Uses only EDM for distance measurement","Cannot be adjusted"]'::jsonb,
 'Ends at a different known point than it started',
 'A connecting (link) traverse starts at one known point/direction and ends at a different known point/direction. It still provides both angular and positional closure checks, can be adjusted, and can use any distance measurement method. The key distinction is the two separate known endpoints.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','connecting-traverse','comparison']),

-- Q10  Numeric Input  Hard (Multi-step: check if misclosure is within tolerance)
('A surveyor measures the interior angles of a 5-sided closed traverse and gets a sum of 540°00''18". The survey is being performed to second-order, Class II standards (K = 3"). (a) What is the angular misclosure in seconds? (b) What is the allowable misclosure? Give ONLY the allowable misclosure in seconds, rounded to 1 decimal place.',
 'numeric_input',
 '[]'::jsonb,
 '6.7',
 'Theoretical sum = (5 − 2) × 180° = 540°. Measured sum = 540°00''18". (a) Angular misclosure = 18". (b) Allowable = K × √n = 3" × √5 = 3" × 2.236 = 6.7". Since the measured misclosure (18") exceeds the allowable (6.7"), the surveyor must re-observe angles.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','misclosure','tolerance','multi-step']),

-- Q11  Numeric Input  Hard (Word problem: angle sum and misclosure)
('A surveyor runs a closed loop traverse around a property with 9 sides. The measured interior angles are: 147°12''05", 136°28''42", 148°03''18", 155°40''10", 122°15''33", 141°52''47", 138°44''22", 129°08''55", and 140°34''15". What is the angular misclosure in seconds? (Give the absolute value.)',
 'numeric_input',
 '[]'::jsonb,
 '7',
 'Theoretical sum = (9 − 2) × 180° = 1260°00''00". Add the measured angles: Sum the seconds: 05+42+18+10+33+47+22+55+15 = 247" = 4''07". Sum the minutes: 12+28+03+40+15+52+44+08+34 + 4(carried) = 240'' = 4°00''. Sum the degrees: 147+136+148+155+122+141+138+129+140 + 4(carried) = 1260°. Total = 1260°00''07". Misclosure = |1260°00''07" − 1260°00''00"| = 7".',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','angle-sum','misclosure','9-sided','word-problem']),

-- Q12  Essay  Hard
('Compare and contrast the three types of traverses (open, closed loop, and closed connecting). For each type, describe: (a) its configuration, (b) what closure checks are available, (c) a real-world situation where it would be used, and (d) its limitations. Explain why open traverses are generally unacceptable for boundary surveys.',
 'essay',
 '[]'::jsonb,
 'Key points: (1) Open: starts at known point, no return, zero closure checks, used only for preliminary/exploratory work, unacceptable for boundaries because blunders go undetected. (2) Closed loop: forms polygon, angular check via (n-2)×180°, linear check via coordinate closure, standard for property/boundary surveys, limitation is that it does not connect to external control unless tied to known monuments. (3) Closed connecting: links two known points, angular check via final azimuth comparison, linear check via endpoint coordinates, used for route/corridor surveys, requires two known control points. All should emphasize that open traverses have NO ability to detect errors or blunders.',
 'A strong answer describes all three types with correct technical details, provides realistic field examples, discusses both angular and linear closure checks for closed traverses, and clearly explains why the lack of any check makes open traverses unsuitable for legal boundary work.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','essay','traverse-types','comparison']),

-- Q13  Essay  Medium
('You are planning a boundary survey of a 10-acre rural property in central Texas. Describe at least five factors you would consider when planning your traverse, and explain why each factor matters.',
 'essay',
 '[]'::jsonb,
 'Key points should include: (1) Intervisibility — clear sightlines needed between stations for measurement. (2) Station stability — firm ground to prevent monument movement. (3) Accuracy standard — TBPELS requires 1:10,000 minimum; determines instrument and methods. (4) Existing control — tying to NGS or county monuments for coordinate system reference. (5) Safety — heat illness prevention, snake awareness, right-of-entry permissions. (6) Geometry — avoid short legs and near-straight angles. (7) Monumentation — durable markers at corners.',
 'A complete answer identifies at least five planning factors with explanations of why each matters for survey quality and safety. Bonus for mentioning Texas-specific concerns (TBPELS standards, heat, wildlife).',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','essay','planning','Texas']),

-- Q14  Multiple Choice  Hard
('A 10-sided traverse is being measured to first-order standards (K = 1"). The measured angle sum is 1440°00''04". Which statement is correct?',
 'multiple_choice',
 '["The misclosure is within tolerance — proceed with computations","The misclosure exceeds tolerance — re-observe angles","The theoretical sum is 1440° so there is no misclosure","First-order surveys do not require angular closure checks"]'::jsonb,
 'The misclosure exceeds tolerance — re-observe angles',
 'Theoretical sum = (10 − 2) × 180° = 1440°. Misclosure = 4". Allowable = K × √n = 1" × √10 = 3.16". Since 4" > 3.16", the misclosure exceeds tolerance and angles must be re-observed. First-order surveys absolutely require angular closure checks — they have the strictest requirements.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','first-order','misclosure','tolerance']);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. PRACTICE PROBLEMS
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- Practice 1: Basic angle sum
('Practice: What is the sum of interior angles for a closed traverse with 12 sides?',
 'numeric_input', '[]'::jsonb,
 '1800',
 '(n − 2) × 180° = (12 − 2) × 180° = 10 × 180° = 1800°.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','angle-sum']),

-- Practice 2: Allowable misclosure
('Practice: Compute the allowable angular misclosure for an 8-sided traverse measured to third-order, Class II standards (K = 10"). Round to 1 decimal place.',
 'numeric_input', '[]'::jsonb,
 '28.3',
 'Allowable = K × √n = 10" × √8 = 10" × 2.828 = 28.3".',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','allowable-misclosure']),

-- Practice 3: Is the misclosure acceptable?
('Practice: A 4-sided traverse measured to second-order Class I standards (K = 1.5") yields angle measurements summing to 360°00''04". Is the misclosure within tolerance? Answer "Yes" or "No" and show your work.',
 'short_answer', '[]'::jsonb,
 'No',
 'Theoretical sum = 360°. Misclosure = 4". Allowable = 1.5" × √4 = 1.5" × 2 = 3.0". Since 4" > 3.0", the misclosure is NOT within tolerance. The surveyor must re-observe angles.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','misclosure','tolerance-check']),

-- Practice 4: Identify traverse type
('Practice: A survey crew starts at NGS monument "Alpha" (known coordinates and azimuth), measures through 6 intermediate stations, and ends at NGS monument "Beta" (known coordinates and azimuth). What type of traverse is this?',
 'multiple_choice',
 '["Open traverse","Closed loop traverse","Closed connecting traverse","Radial traverse"]'::jsonb,
 'Closed connecting traverse',
 'The traverse starts at one known point and ends at a different known point — this is a closed connecting (link) traverse. It provides both angular and positional closure checks even though it does not return to the starting point.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','traverse-type','identification']),

-- Practice 5: Word problem — determine number of sides from angle sum
('Practice: A surveyor measures the interior angles of a closed traverse and expects them to sum to 1080°. How many sides does the traverse have?',
 'numeric_input', '[]'::jsonb,
 '8',
 'Using (n − 2) × 180° = 1080°: n − 2 = 1080 / 180 = 6, so n = 8 sides.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','angle-sum','reverse-computation']),

-- Practice 6: Relative precision concept
('Practice: A traverse has a perimeter of 3,500 ft and a linear error of closure of 0.25 ft. What is the relative precision ratio? Express as 1:X where X is a whole number.',
 'numeric_input', '[]'::jsonb,
 '14000',
 'Relative precision = error / perimeter = 0.25 / 3500 = 1 / 14,000. So the ratio is 1:14,000. This exceeds the TBPELS minimum of 1:10,000 and therefore passes.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','relative-precision','word-problem']),

-- Practice 7: Multi-step word problem
('Practice: You are planning a boundary traverse of a hexagonal (6-sided) property. You will use a 5" total station and measure to third-order Class I standards (K = 5"). (a) What is the theoretical interior angle sum? (b) What is the maximum allowable angular misclosure? (c) If your measured angles sum to 720°00''10", should you re-observe? Give your answer to part (b) only, rounded to 1 decimal.',
 'numeric_input', '[]'::jsonb,
 '12.2',
 '(a) Sum = (6 − 2) × 180° = 720°. (b) Allowable = 5" × √6 = 5 × 2.449 = 12.2". (c) Misclosure = 10". Since 10" < 12.2", the misclosure is within tolerance — no need to re-observe.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','multi-step','planning','word-problem']),

-- Practice 8: Essay — traverse type selection
('Practice: A client asks you to survey a pipeline easement that runs 2 miles from an existing county road monument to a wellhead marked by a state plane coordinate monument. (a) What type of traverse would you use and why? (b) What closure checks would be available? (c) Name two factors that would affect your choice of accuracy standard.',
 'essay', '[]'::jsonb,
 'Key points: (a) Closed connecting traverse — it starts at one known monument and ends at another, which is ideal for a linear corridor. (b) Angular closure: compare computed final azimuth with known azimuth at the wellhead monument. Positional closure: compare computed coordinates at the endpoint with known state plane coordinates. (c) Factors: the legal purpose of the survey (easement establishment = boundary-level accuracy), the client requirements, TBPELS minimum standards (1:10,000), and whether the client wants ALTA-level precision (1:15,000).',
 'A good answer selects the connecting traverse with correct reasoning, describes both angular and positional closure checks, and identifies at least two factors influencing accuracy (legal purpose, standards, client needs, terrain, equipment).',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','essay','traverse-selection','pipeline']);
