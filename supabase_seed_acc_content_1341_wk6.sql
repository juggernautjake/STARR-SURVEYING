-- ============================================================================
-- ACC SRVY 1341 — Week 6: Types of Angles & Angle Measurement
-- PART 1 OF 2: Lesson content, topics, and resource metadata
-- ============================================================================
-- Full lesson HTML, 4 searchable topics, videos, and key takeaways.
-- Quiz questions, practice problems, and flashcards are in the companion file:
--   supabase_seed_acc_content_1341_wk6_quiz.sql
--
-- Module ID : acc00003-0000-0000-0000-000000000003
-- Lesson ID : acc03b06-0000-0000-0000-000000000001
--
-- Topic UUIDs:
--   acc03a06-0001  Types of Angles
--   acc03a06-0002  Angle Measurement Fundamentals
--   acc03a06-0003  Direct and Reverse Angle Measurement
--   acc03a06-0004  Turning a Set of Angles (European Method)
--
-- Run AFTER supabase_seed_acc_courses.sql and wk0–wk5 seeds.
-- Safe to re-run (uses DELETE before INSERT, UPDATE with WHERE).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. LESSON CONTENT (rich HTML)
-- ────────────────────────────────────────────────────────────────────────────

UPDATE learning_lessons SET

title = 'Week 6: Types of Angles & Angle Measurement',

description = 'Introduction to horizontal, interior, deflection, and vertical angles. Fundamentals of the horizontal circle, DMS arithmetic, face left (direct) and face right (reverse) measurement positions. Complete procedures for measuring a direct angle and a reverse angle, including the European method for turning a set of angles with worked examples for angles less than and greater than 180 degrees.',

learning_objectives = ARRAY[
  'Define and distinguish horizontal, interior, deflection, and vertical angles',
  'Explain how the horizontal circle measures angles independent of vertical sighting',
  'Perform DMS (degrees-minutes-seconds) addition and subtraction with borrowing',
  'Describe the procedure for zeroing the instrument on a backsight and reading an angle to a foresight',
  'Define face left (direct) and face right (reverse) telescope positions',
  'Explain what plunging the telescope means and why measurements are taken on both faces',
  'List the systematic instrument errors eliminated by averaging direct and reverse readings',
  'Execute the 5-step European method for turning a set of angles',
  'Compute the mean angle from direct and reverse readings when the angle is less than 180 degrees',
  'Compute the mean angle from direct and reverse readings when the angle is greater than 180 degrees, including the 360-degree correction'
],

estimated_minutes = 50,

content = '
<h2>Week 6: Types of Angles &amp; Angle Measurement</h2>

<img src="/lessons/cls6/cls6_00_title_angle_measurement.svg" alt="[IMAGE NEEDED] Title graphic showing a total station at a traverse point with angle arcs drawn to backsight and foresight targets, illustrating a horizontal angle measurement" style="max-width:100%; margin:1rem 0;" />

<p>Last week you learned to <strong>level</strong> and <strong>set up</strong> a surveying instrument over a known point. This week we use that instrument to do what surveying is fundamentally about: <strong>measuring angles</strong>. Angles — combined with distances — are the raw observations from which all traverse coordinates, boundary lines, and map positions are computed.</p>

<p>We will cover the <strong>types of angles</strong> used in surveying, the <strong>fundamentals of angle measurement</strong> on a horizontal circle, and then the two key measurement techniques: the <strong>direct angle</strong> (face left) and the <strong>reverse angle</strong> (face right). Finally, you will learn the <strong>European method for turning a set of angles</strong> — a standard quality-control procedure that detects and cancels instrument errors.</p>

<div style="background:#f0f4f8; padding:1rem; border-left:4px solid #2563eb; margin:1rem 0; font-size:1.1em;">
  <strong>Class 6 Agenda:</strong> (1) Review — Instrument Leveling, (2) Review — Instrument Setup with Optical/Laser Plummet, (3) Types of Angles, (4) Angle Measurement, (5) Basics of Turning an Angle, (6) Measuring a Direct Angle, (7) Measuring a Reverse Angle.
</div>

<hr/>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- TOPIC 1 — TYPES OF ANGLES                                         -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<h2>1. Types of Angles</h2>

<h3>Horizontal Angles</h3>

<p><strong>Horizontal angles</strong> are measured in the <strong>horizontal plane</strong>. When measuring a horizontal angle with a transit, theodolite, or total station, the angle is measured between two points sighted from the instrument, which is set up over a point representing the <strong>vertex</strong> of the angle.</p>

<p>The basic procedure:</p>
<ol>
  <li>The telescope is sighted onto the first point (backsight) and the angle-measuring circle is <strong>set to zero</strong>.</li>
  <li>The telescope is then turned to the second point (foresight) and the angle is <strong>read from the circle</strong>.</li>
</ol>

<p>The critical concept: the horizontal angle measurement occurs on the <strong>horizontal circle</strong>, which is <strong>independent of the vertical sighting</strong>. Even if you tilt the telescope up or down to sight a target at a different elevation, the angle recorded on the horizontal circle is the projection of that angle onto the horizontal plane.</p>

<img src="/lessons/cls6/cls6_01_horizontal_angle_basic.svg" alt="[IMAGE NEEDED] Plan view (top-down) showing an instrument at the vertex with two sight lines to backsight and foresight. The horizontal angle is shown as the arc between the two lines. A note indicates the vertical tilt of the telescope does not affect the horizontal reading." style="max-width:100%; margin:1rem 0;" />

<h3>Interior Angles</h3>

<p><strong>Interior angles</strong> are horizontal angles measured <strong>on the inside</strong> of a closed geometric figure (polygon). When the instrument is set up at a vertex of the figure, the interior angle is the angle between the two sides meeting at that vertex, measured inside the figure.</p>

<p>Interior angles are commonly used in closed traverse surveys. The fundamental check for a closed polygon is:</p>

<p style="text-align:center; font-size:1.2em;"><strong>Sum of Interior Angles = (n − 2) × 180°</strong></p>

<p>where <strong>n</strong> is the number of sides (vertices). Examples:</p>
<ul>
  <li>Triangle (n = 3): (3 − 2) × 180° = <strong>180°</strong></li>
  <li>Quadrilateral (n = 4): (4 − 2) × 180° = <strong>360°</strong></li>
  <li>Pentagon (n = 5): (5 − 2) × 180° = <strong>540°</strong></li>
</ul>

<p>At any vertex, the <strong>interior angle + exterior angle = 360°</strong>.</p>

<img src="/lessons/cls6/cls6_02_interior_angles_polygon.svg" alt="[IMAGE NEEDED] A five-sided closed traverse (polygon ABCDE) with all five interior angles labeled. The sum is shown as (5-2)×180° = 540°. One vertex shows both the interior and exterior angle, summing to 360°." style="max-width:100%; margin:1rem 0;" />

<h3>Deflection Angles</h3>

<p><strong>Deflection angles</strong> are horizontal angles measured from the <strong>prolongation (extension) of the preceding line</strong>. The procedure:</p>
<ol>
  <li>The instrument is set up on the end of a line and sighted <strong>back</strong> onto that line (backsight).</li>
  <li>The scope is then <strong>plunged</strong> (flipped 180° vertically), which extends the line forward in the opposite direction.</li>
  <li>If an angle is turned off of this extended line, it is called a <strong>deflection angle</strong>.</li>
</ol>

<p>Deflection angles are designated as <strong>Right (R)</strong> or <strong>Left (L)</strong> depending on the direction of turning from the prolongation. They are always <strong>less than 180°</strong> and are used extensively in <strong>route construction</strong> applications (highways, railroads, pipelines) where angles off a straight line are measured.</p>

<p>In a closed traverse, the algebraic sum of all deflection angles (with R as positive and L as negative) equals <strong>360°</strong>.</p>

<img src="/lessons/cls6/cls6_03_deflection_angles.svg" alt="[IMAGE NEEDED] A route survey showing three consecutive stations (A, B, C). At station B, the backsight line A→B is extended (prolonged) past B as a dashed line. The deflection angle is shown between this prolongation and the new direction B→C, labeled as a deflection right (R). A second example shows a deflection left (L)." style="max-width:100%; margin:1rem 0;" />

<h3>Vertical Angles</h3>

<p><strong>Vertical angles</strong> are measured in a <strong>vertical plane</strong> using the <strong>vertical circle</strong> of the instrument. Two conventions are used:</p>

<table>
<thead><tr><th>Convention</th><th>Zero Reference</th><th>Range</th><th>Notes</th></tr></thead>
<tbody>
<tr><td><strong>Zenith Angle</strong></td><td>Directly overhead (zenith)</td><td>0° to 360°</td><td>0° = straight up; 90° = horizontal; 180° = straight down</td></tr>
<tr><td><strong>Elevation Angle</strong></td><td>Horizontal plane</td><td>−90° to +90°</td><td>Positive = above horizontal; Negative = below horizontal</td></tr>
</tbody>
</table>

<p><strong>Conversion:</strong> Zenith Angle = 90° − Elevation Angle (for angles above horizontal).</p>

<p>Most modern total stations display <strong>zenith angles</strong> by default because they are unambiguous — a zenith angle of 85° clearly means "slightly above horizontal," while 275° clearly means "slightly above horizontal on the reverse face."</p>

<img src="/lessons/cls6/cls6_04_vertical_angles.svg" alt="[IMAGE NEEDED] Side view of an instrument showing the vertical circle. The zenith (0°) is at top, horizontal (90°) is to the right, nadir (180°) is at bottom. An elevation angle of +25° is shown with its equivalent zenith angle of 65°. Labels for zenith angle and elevation angle conventions are clearly marked." style="max-width:100%; margin:1rem 0;" />

<h3>Angles to the Right</h3>

<p>An <strong>angle to the right</strong> is a horizontal angle measured <strong>clockwise</strong> from the backsight to the foresight. This is the most common modern convention and is used by most data collectors and total station software. The angle always ranges from <strong>0° to 360°</strong>.</p>

<p>Using a uniform convention of always measuring angles to the right eliminates ambiguity about the direction of turning — a serious source of blunders if clockwise and counterclockwise angles are mixed.</p>

<img src="/lessons/cls6/cls6_05_angle_to_the_right.svg" alt="[IMAGE NEEDED] Top-down view of an instrument with a backsight and foresight. A clockwise arc from the backsight direction to the foresight direction is labeled ANGLE TO THE RIGHT. The arc shows the angle ranges from 0° to 360° in the clockwise direction." style="max-width:100%; margin:1rem 0;" />

<hr/>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- TOPIC 2 — ANGLE MEASUREMENT FUNDAMENTALS                          -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<h2>2. Angle Measurement Fundamentals</h2>

<h3>The Horizontal Circle</h3>

<p>Every transit, theodolite, and total station has a <strong>horizontal circle</strong> — a graduated disc that measures rotation in the horizontal plane. On modern total stations, this is an <strong>electronically encoded glass disc</strong> with an LED on one side and photodiodes on the other. The instrument reads the light pattern through the graduated disc to determine the rotation angle with extreme precision.</p>

<p>The key operations:</p>
<ul>
  <li><strong>Zeroing</strong> — Setting the circle reading to 0° 00'' 00" while sighted on the backsight. On a modern TSI, press the "0-SET" or "HOLD" button.</li>
  <li><strong>Reading</strong> — After turning to the foresight, the displayed value is the horizontal angle.</li>
  <li><strong>Holding</strong> — Freezing the display so it does not change as the instrument is rotated (used for repetition measurements).</li>
</ul>

<img src="/lessons/cls6/cls6_06_horizontal_circle_diagram.svg" alt="[IMAGE NEEDED] Exploded diagram of a total station showing the horizontal circle (glass disc) inside the instrument. Labels show the LED, photodiodes, and the graduated circle. An inset shows the digital angle display reading 71° 46'' 18''." style="max-width:100%; margin:1rem 0;" />

<h3>DMS (Degrees-Minutes-Seconds) Arithmetic</h3>

<p>Angles in surveying are expressed in <strong>degrees (°), minutes (''), and seconds ("")</strong>:</p>
<ul>
  <li>1 degree = 60 minutes</li>
  <li>1 minute = 60 seconds</li>
  <li>1 degree = 3,600 seconds</li>
</ul>

<p>You must be comfortable adding and subtracting in DMS format, including <strong>carrying</strong> and <strong>borrowing</strong>:</p>

<h4>Addition Example</h4>
<p>Add: 45° 34'' 56" + 25° 45'' 39"</p>
<ol>
  <li>Add each column: 70° 79'' 95"</li>
  <li>Convert overflow: 95" = 1'' 35", so 79'' + 1'' = 80''</li>
  <li>Convert: 80'' = 1° 20'', so 70° + 1° = 71°</li>
  <li>Result: <strong>71° 20'' 35"</strong></li>
</ol>

<h4>Subtraction Example (with borrowing)</h4>
<p>Subtract: 180° 00'' 00" − 113° 15'' 29"</p>
<ol>
  <li>Borrow: 180° 00'' 00" → 179° 59'' 60"</li>
  <li>Subtract: 179° − 113° = 66°, 59'' − 15'' = 44'', 60" − 29" = 31"</li>
  <li>Result: <strong>66° 44'' 31"</strong></li>
</ol>

<div style="background:#fffbeb; padding:1rem; border:1px solid #f59e0b; border-radius:6px; margin:1rem 0;">
  <strong>Tip:</strong> When subtracting and a column is too small, borrow from the next higher unit — just like borrowing in base-10 subtraction, but here 1° = 60'' and 1'' = 60".
</div>

<h3>Face Left (Direct) vs. Face Right (Reverse)</h3>

<p>When looking through the eyepiece of a theodolite or total station:</p>

<table>
<thead><tr><th>Position</th><th>Also Called</th><th>Vertical Circle Location</th><th>Description</th></tr></thead>
<tbody>
<tr><td><strong>Face Left (FL)</strong></td><td>Direct, Face 1, Normal</td><td>Left side of telescope</td><td>Telescope in normal position — this is the starting position</td></tr>
<tr><td><strong>Face Right (FR)</strong></td><td>Reverse, Face 2, Inverted</td><td>Right side of telescope</td><td>Telescope has been <strong>plunged</strong> (flipped 180° about horizontal axis)</td></tr>
</tbody>
</table>

<img src="/lessons/cls6/cls6_07_face_left_face_right.svg" alt="[IMAGE NEEDED] Two side-by-side views of a total station. LEFT: Face Left position — vertical circle on the left side, telescope in normal orientation, labeled DIRECT / FACE LEFT. RIGHT: Face Right position — telescope plunged, vertical circle now on the right side, labeled REVERSE / FACE RIGHT. An arrow between them shows the plunging action." style="max-width:100%; margin:1rem 0;" />

<h3>Plunging the Telescope</h3>

<p><strong>Plunging</strong> (also called <strong>transiting</strong> or <strong>reversing</strong>) is rotating the telescope <strong>180° about its horizontal (trunnion) axis</strong> so it points in the opposite direction. After plunging:</p>
<ul>
  <li>The eyepiece and objective swap ends</li>
  <li>The vertical circle moves from left to right (or vice versa)</li>
  <li>The instrument must also be rotated ~180° about the vertical axis to re-sight the same target</li>
</ul>

<img src="/lessons/cls6/cls6_08_plunging_telescope.svg" alt="[IMAGE NEEDED] Sequence of three images showing plunging: (1) telescope in Face Left pointing at target, (2) telescope rotating 180° about the trunnion axis (shown with curved arrow), (3) telescope in Face Right position with the instrument then rotated 180° horizontally to re-point at the target." style="max-width:100%; margin:1rem 0;" />

<hr/>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- TOPIC 3 — DIRECT AND REVERSE ANGLE MEASUREMENT                    -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<h2>3. Measuring a Direct Angle</h2>

<p>A <strong>direct</strong> (face left) angle measurement is the most basic angle observation. The telescope is in its normal position throughout.</p>

<h3>Procedure</h3>
<ol>
  <li><strong>Set up and level</strong> the instrument over the station point (use the Week 5 procedure).</li>
  <li>Ensure the instrument is in <strong>Face Left</strong> (normal/direct) position.</li>
  <li>Sight the <strong>backsight</strong> point — use the horizontal clamp and tangent screw for precise bisection of the target.</li>
  <li><strong>Zero the horizontal circle</strong> (set to 0° 00'' 00"). On a modern TSI, press the "0-SET" button.</li>
  <li>Release the horizontal clamp and rotate the telescope <strong>clockwise</strong> (to the right) toward the <strong>foresight</strong> point.</li>
  <li>Lock the horizontal clamp and use the tangent screw for precise bisection of the foresight target.</li>
  <li><strong>Read and record</strong> the horizontal circle. This reading is the <strong>direct angle</strong>.</li>
</ol>

<img src="/lessons/cls6/cls6_09_direct_angle_procedure.svg" alt="[IMAGE NEEDED] Two-panel diagram: LEFT panel shows the telescope sighted on the backsight with circle reading 0° 00'' 00''. RIGHT panel shows the telescope turned clockwise to the foresight with circle reading showing the measured angle (e.g., 71° 46'' 18''). An arc between the two positions shows the direct angle." style="max-width:100%; margin:1rem 0;" />

<hr/>

<h2>4. Measuring a Reverse Angle</h2>

<p>A <strong>reverse</strong> (face right) angle measurement is taken with the telescope <strong>plunged</strong>. The purpose is to obtain a second, independent measurement of the same angle from a different instrument position. When averaged with the direct measurement, <strong>systematic instrument errors cancel out</strong>.</p>

<h3>Why Measure on Both Faces?</h3>

<p>By averaging face left and face right readings, the following <strong>systematic errors are eliminated</strong>:</p>

<table>
<thead><tr><th>Error</th><th>What It Is</th><th>Why It Cancels</th></tr></thead>
<tbody>
<tr><td><strong>Collimation Error (Line of Sight / 2C Error)</strong></td><td>The line of sight is not exactly perpendicular to the trunnion axis</td><td>The error reverses its sign when the face is changed — averaging FL and FR cancels it</td></tr>
<tr><td><strong>Trunnion Axis Error</strong></td><td>The trunnion axis is not exactly perpendicular to the vertical axis</td><td>Also reverses sign on face change — averaging cancels it</td></tr>
<tr><td><strong>Vertical Circle Index Error</strong></td><td>A constant offset in the vertical circle zero point</td><td>Averaging FL and FR vertical angle readings cancels the offset</td></tr>
</tbody>
</table>

<img src="/lessons/cls6/cls6_10_errors_eliminated_by_face_change.svg" alt="[IMAGE NEEDED] Diagram showing collimation error: a telescope traces a cone instead of a plane when rotated. On Face Left, the error displaces the reading in one direction (+e). On Face Right, the error displaces in the opposite direction (−e). The average (FL + FR) / 2 eliminates the error." style="max-width:100%; margin:1rem 0;" />

<div style="background:#f0f4f8; padding:1rem; border-left:4px solid #2563eb; margin:1rem 0;">
  <strong>Key Principle:</strong> Systematic instrument errors reverse their sign when the telescope is plunged. Averaging direct and reverse readings cancels these errors. This is why professional surveyors <em>always</em> measure on both faces — it is not optional for quality work.
</div>

<hr/>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- TOPIC 4 — TURNING A SET OF ANGLES (EUROPEAN METHOD)               -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<h2>5. Turning a Set of Angles — The European Method</h2>

<p>The <strong>European method</strong> (also called turning a <strong>set of angles</strong> or a <strong>D/R set</strong>) is the standard field procedure for measuring a single horizontal angle with both direct and reverse observations. The result is a <strong>mean angle</strong> that is free of systematic instrument errors.</p>

<p>We will work through the complete 5-step procedure using a real-world traverse example, then demonstrate the calculations for both cases: angles <strong>less than 180°</strong> and angles <strong>greater than 180°</strong>.</p>

<h3>The Setup</h3>

<p>The instrument is at <strong>Traverse Point #102</strong>. We are measuring the angle from backsight <strong>Trav #101</strong> to foresight <strong>Trav #103</strong>, turned to the right (clockwise).</p>

<img src="/lessons/cls6/cls6_11_traverse_setup_overview.svg" alt="[IMAGE NEEDED] Plan view showing three traverse points: Trav #101 (backsight, upper right), Trav #102 (instrument station, center), and Trav #103 (foresight, lower right for Example 1 / upper left for Example 2). Labeled as the European method setup." style="max-width:100%; margin:1rem 0;" />

<h3>The 5-Step Procedure</h3>

<table>
<thead><tr><th>Step</th><th>Action</th><th>Face</th><th>What You Record</th></tr></thead>
<tbody>
<tr><td><strong>1</strong></td><td>Set up and level at Trav #102</td><td>—</td><td>—</td></tr>
<tr><td><strong>2</strong></td><td>Sight <strong>backsight</strong> (Trav #101) and <strong>zero the circle</strong> (0° 00'' 00")</td><td>Face Left</td><td>Initial reading: 0° 00'' 00"</td></tr>
<tr><td><strong>3</strong></td><td>Turn <strong>right</strong> to <strong>foresight</strong> (Trav #103) — read and record the angle</td><td>Face Left</td><td><strong>Direct angle</strong></td></tr>
<tr><td><strong>4</strong></td><td><strong>Plunge</strong> the scope, turn to re-sight <strong>foresight</strong> (Trav #103) — read and record</td><td>Face Right</td><td><strong>Reverse foresight reading</strong></td></tr>
<tr><td><strong>5</strong></td><td>Turn <strong>right</strong> to <strong>backsight</strong> (Trav #101) — read and record</td><td>Face Right</td><td><strong>Reverse backsight reading</strong></td></tr>
</tbody>
</table>

<img src="/lessons/cls6/cls6_12_five_step_procedure_diagram.svg" alt="[IMAGE NEEDED] Flowchart or numbered diagram showing the 5 steps: (1) Setup at #102, (2) Sight #101, zero circle (FL), (3) Turn right to #103, read direct angle (FL), (4) Plunge, sight #103 again, read reverse foresight (FR), (5) Turn right to #101, read reverse backsight (FR). Arrows show the telescope movement between steps." style="max-width:100%; margin:1rem 0;" />

<h3>The Computation</h3>

<p>After recording all five steps, the mean angle is computed as follows:</p>

<ol>
  <li><strong>Direct angle</strong> = Step 3 reading (the face-left angle from backsight to foresight)</li>
  <li><strong>Reverse angle</strong> = Step 4 reading − Step 5 reading (face-right foresight minus face-right backsight)</li>
  <li>If the reverse angle is <strong>negative</strong> (Step 4 &lt; Step 5), <strong>add 360°</strong></li>
  <li><strong>Mean angle</strong> = (Direct angle + Reverse angle) / 2</li>
</ol>

<div style="background:#f0f4f8; padding:1rem; border-left:4px solid #2563eb; margin:1rem 0;">
  <strong>Why Step 5 is not exactly 180° 00'' 00":</strong> In a perfect instrument, the face-right backsight reading would be exactly 180° 00'' 00" (since you zeroed on the backsight in face left, and plunging adds 180°). In reality, it will be off by a small amount due to instrument errors. This small deviation is exactly the error that averaging the direct and reverse angles eliminates.
</div>

<hr/>

<h3>Worked Example 1: Angle Less Than 180°</h3>

<img src="/lessons/cls6/cls6_13_example1_site_sketch.svg" alt="[IMAGE NEEDED] Field book site sketch showing Trav #102 (instrument) at center, Trav #101 (backsight) to the upper right, and Trav #103 (foresight) to the lower right. The angle turned right from #101 to #103 is approximately 72° — clearly less than 180°. Labeled: EXAMPLE 1 — ANGLE &lt; 180°." style="max-width:100%; margin:1rem 0;" />

<table>
<thead><tr><th>Step</th><th>Action</th><th>Circle Reading</th></tr></thead>
<tbody>
<tr><td>2</td><td>Sight backsight #101 (FL), zero circle</td><td>0° 00'' 00"</td></tr>
<tr><td>3</td><td>Turn right to foresight #103 (FL)</td><td><strong>71° 46'' 18"</strong></td></tr>
<tr><td>4</td><td>Plunge; re-sight foresight #103 (FR)</td><td><strong>251° 46'' 18"</strong></td></tr>
<tr><td>5</td><td>Turn right to backsight #101 (FR)</td><td><strong>180° 00'' 01"</strong></td></tr>
</tbody>
</table>

<h4>Computation</h4>

<p><strong>Direct angle</strong> = Step 3 = <strong>71° 46'' 18"</strong></p>

<p><strong>Reverse angle</strong> = Step 4 − Step 5:</p>
<p style="text-align:center;">251° 46'' 18" − 180° 00'' 01" = <strong>71° 46'' 17"</strong></p>

<p><strong>Mean angle</strong> = (71° 46'' 18" + 71° 46'' 17") / 2:</p>
<p style="text-align:center;">= 143° 32'' 35" / 2 = <strong>71° 46'' 17.5"</strong></p>

<img src="/lessons/cls6/cls6_14_example1_field_book.svg" alt="[IMAGE NEEDED] Reproduction of a field book entry showing the data from Example 1 in proper field book format: columns for Step, Target, Face, Circle Reading, and computed angles. The direct angle, reverse angle, and mean are clearly shown at the bottom." style="max-width:100%; margin:1rem 0;" />

<div style="background:#ecfdf5; padding:1rem; border:1px solid #10b981; border-radius:6px; margin:1rem 0;">
  <strong>Notice:</strong> The direct angle (71° 46'' 18") and reverse angle (71° 46'' 17") differ by only <strong>1 second</strong>. This small difference is expected and confirms the observations are consistent. If the difference exceeded the instrument''s stated tolerance (e.g., more than 5" for a 2" instrument), the set should be rejected and remeasured.
</div>

<hr/>

<h3>Worked Example 2: Angle Greater Than 180°</h3>

<img src="/lessons/cls6/cls6_15_example2_site_sketch.svg" alt="[IMAGE NEEDED] Field book site sketch showing Trav #102 (instrument) at center, Trav #101 (backsight) to the upper right, and Trav #103 (foresight) to the upper LEFT. The angle turned right from #101 to #103 exceeds 180° — the foresight is on the left side of the backsight line. Labeled: EXAMPLE 2 — ANGLE &gt; 180°." style="max-width:100%; margin:1rem 0;" />

<table>
<thead><tr><th>Step</th><th>Action</th><th>Circle Reading</th></tr></thead>
<tbody>
<tr><td>2</td><td>Sight backsight #101 (FL), zero circle</td><td>0° 00'' 00"</td></tr>
<tr><td>3</td><td>Turn right to foresight #103 (FL)</td><td><strong>189° 09'' 14"</strong></td></tr>
<tr><td>4</td><td>Plunge; re-sight foresight #103 (FR)</td><td><strong>9° 09'' 13"</strong></td></tr>
<tr><td>5</td><td>Turn right to backsight #101 (FR)</td><td><strong>180° 00'' 02"</strong></td></tr>
</tbody>
</table>

<h4>Computation</h4>

<p><strong>Direct angle</strong> = Step 3 = <strong>189° 09'' 14"</strong></p>

<p><strong>Reverse angle</strong> = Step 4 − Step 5:</p>
<p style="text-align:center;">9° 09'' 13" − 180° 00'' 02" = <strong>negative result!</strong></p>

<div style="background:#fee2e2; padding:1rem; border:1px solid #ef4444; border-radius:6px; margin:1rem 0;">
  <strong>The 360° Rule:</strong> When Step 4 minus Step 5 gives a <strong>negative number</strong>, you must <strong>add 360°</strong> before proceeding. This happens whenever the measured angle is greater than 180°.
</div>

<p>Apply the 360° correction:</p>
<p style="text-align:center;">9° 09'' 13" − 180° 00'' 02" + 360° 00'' 00" = <strong>189° 09'' 11"</strong></p>

<p>Let''s verify this step by step:</p>
<ol>
  <li>Add 360° to Step 4: 9° 09'' 13" + 360° = 369° 09'' 13"</li>
  <li>Subtract Step 5: 369° 09'' 13" − 180° 00'' 02" = <strong>189° 09'' 11"</strong></li>
</ol>

<p><strong>Mean angle</strong> = (189° 09'' 14" + 189° 09'' 11") / 2:</p>
<p style="text-align:center;">= 378° 18'' 25" / 2 = <strong>189° 09'' 12.5"</strong></p>

<img src="/lessons/cls6/cls6_16_example2_field_book.svg" alt="[IMAGE NEEDED] Reproduction of a field book entry showing the data from Example 2 in proper field book format. The negative intermediate result is shown crossed out, the +360° correction is shown, and the final direct angle, reverse angle, and mean are displayed at the bottom." style="max-width:100%; margin:1rem 0;" />

<h3>How to Know When to Add 360°</h3>

<p>The rule is simple: <strong>if Step 4 − Step 5 gives a negative number, add 360°</strong>. In practice, this happens whenever the <strong>measured angle is greater than 180°</strong>. You can also check by comparing the reverse angle to the direct angle — they should agree within a few seconds. If the reverse angle is wildly different from the direct angle, either you forgot the 360° correction or a blunder occurred.</p>

<img src="/lessons/cls6/cls6_17_decision_flowchart_360.svg" alt="[IMAGE NEEDED] Simple decision flowchart: Start → Compute Step 4 − Step 5 → Is result positive? YES → Use as reverse angle. NO → Add 360° to result → Use as reverse angle. Then → Compute mean = (direct + reverse) / 2." style="max-width:100%; margin:1rem 0;" />

<hr/>

<h2>Sources of Error in Angle Measurement</h2>

<p>The four primary sources of error in angle measurement are:</p>

<table>
<thead><tr><th>Error Source</th><th>Description</th><th>Mitigation</th></tr></thead>
<tbody>
<tr><td><strong>Centering</strong></td><td>Instrument not exactly over the station mark</td><td>Careful setup with optical plummet (Week 5); dominates on short lines</td></tr>
<tr><td><strong>Pointing</strong></td><td>Target not precisely bisected by crosshairs</td><td>Use well-defined targets; multiple observations</td></tr>
<tr><td><strong>Reading</strong></td><td>Errors in reading the graduated circle</td><td>Multiple repetitions; digital instruments reduce this</td></tr>
<tr><td><strong>Leveling</strong></td><td>Instrument not perfectly level</td><td>Careful plate bubble checks; compensator monitoring</td></tr>
</tbody>
</table>

<p><strong>Systematic errors</strong> (collimation, trunnion axis) are eliminated by measuring on both faces, as demonstrated in the European method above.</p>

<hr/>

<h2>Video Resources</h2>

<ul>
  <li><a href="https://www.youtube.com/watch?v=xHFt-fkvfrg" target="_blank">Instrument Setup Over a Point</a> (12:42 min) — Review from Week 5</li>
  <li>Search YouTube for: <strong>"angle measurement by repetition method surveying"</strong> — multiple demonstration videos available</li>
  <li>Search YouTube for: <strong>"face left face right total station"</strong> — shows the plunging and face change procedure</li>
  <li>Search YouTube for: <strong>"turning angles European method surveying"</strong> — demonstrations of the D/R set procedure</li>
</ul>

<p><strong>Homework:</strong> Practice DMS arithmetic problems. Find and watch videos demonstrating angle measurement. Be prepared to turn angles in the lab next week.</p>

<hr/>

<h2>Looking Ahead</h2>

<p>Now that you understand how to measure angles accurately using the direct and reverse method, you have the complete set of fundamental field skills: <strong>instrument care</strong> (Week 4), <strong>leveling and setup</strong> (Week 5), and <strong>angle measurement</strong> (this week). Next week we will combine angles with distances to begin <strong>traverse computations</strong> — converting field observations into coordinates.</p>
',

resources = '[
  {"title":"Elementary Surveying (Ghilani) — Ch. 7: Angles, Azimuths, and Bearings; Ch. 8: Total Station Instruments","url":"https://www.pearson.com/en-us/subject-catalog/p/elementary-surveying-an-introduction-to-geomatics/P200000003437","type":"reference"},
  {"title":"Jerry Mahun''s Open Access Surveying Library — Horizontal Angles","url":"https://jerrymahun.com/index.php/home/open-access/31-i-basic/88-i-g-horizontal-angles","type":"reference"},
  {"title":"Jerry Mahun''s Open Access Surveying Library — Measuring Horizontal Angles with TSI","url":"https://www.jerrymahun.com/index.php/home/open-access/14-total-station-instruments/214-tsi-chap-d-2","type":"reference"},
  {"title":"TxDOT Survey Manual — Surveying Procedures","url":"https://onlinemanuals.txdot.gov/TxDOTOnlineManuals/TxDOTManuals/ess/surveying_procedures.htm","type":"reference"},
  {"title":"FGCS Standards and Specifications for Geodetic Control Networks (1984)","url":"https://www.ngs.noaa.gov/FGCS/tech_pub/1984-stds-specs-geodetic-control-networks.pdf","type":"pdf"}
]'::jsonb,

videos = '[
  {"title":"Instrument Setup Over a Point — Review from Week 5 (12:42)","url":"https://www.youtube.com/watch?v=xHFt-fkvfrg"},
  {"title":"Total Station Setup and Leveling Demonstration — Review from Week 5 (9:02)","url":"https://www.youtube.com/watch?v=iAQgFFHBiPo"}
]'::jsonb,

key_takeaways = ARRAY[
  'Horizontal angles are measured on the horizontal circle, independent of vertical telescope tilt',
  'Interior angles of a closed polygon sum to (n-2) × 180°',
  'Deflection angles are measured from the prolongation of the preceding line and designated R or L',
  'Vertical angles use either zenith (0° overhead) or elevation (0° horizontal) convention; most TSIs display zenith angles',
  'Angles to the right (clockwise from backsight) are the standard modern convention',
  'DMS arithmetic requires carrying (60" = 1'') and borrowing (1° = 60'') across columns',
  'Face Left (direct) and Face Right (reverse) are the two telescope positions',
  'Plunging rotates the telescope 180° about the trunnion axis to change faces',
  'Averaging FL and FR readings eliminates collimation error, trunnion axis error, and vertical circle index error',
  'The European method (5-step D/R set): zero on backsight, turn to foresight (FL), plunge and re-sight foresight (FR), turn to backsight (FR)',
  'Reverse angle = Step 4 − Step 5; if negative, add 360° (this occurs when the angle exceeds 180°)',
  'Mean angle = (direct angle + reverse angle) / 2 — this is the final, error-corrected result'
]

WHERE id = 'acc03b06-0000-0000-0000-000000000001';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. TOPICS
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM learning_topics WHERE lesson_id = 'acc03b06-0000-0000-0000-000000000001';

INSERT INTO learning_topics (id, lesson_id, title, content, order_index, keywords) VALUES

('acc03a06-0001-0000-0000-000000000001', 'acc03b06-0000-0000-0000-000000000001',
 'Types of Angles',
 'Surveying uses four main types of angles. (1) Horizontal angles are measured in the horizontal plane on the instrument''s horizontal circle, independent of vertical telescope tilt. The telescope is sighted on a backsight, the circle is zeroed, and then the telescope is turned to a foresight — the circle reading is the horizontal angle. (2) Interior angles are horizontal angles measured on the inside of a closed polygon (traverse). The sum of interior angles must equal (n−2)×180° where n is the number of sides. At any vertex, interior + exterior = 360°. (3) Deflection angles are measured from the prolongation (extension) of the preceding line. The scope is sighted back on the line, plunged to extend it forward, and then turned to the new direction. Deflection angles are designated Right (R, clockwise) or Left (L, counterclockwise) and are always less than 180°. They are used in route surveying (highways, railroads). The algebraic sum of deflection angles in a closed traverse equals 360°. (4) Vertical angles are measured in the vertical plane using the vertical circle. Two conventions: zenith angles (0° = straight up, 90° = horizontal) and elevation angles (0° = horizontal, positive above, negative below). Modern TSIs default to zenith angles. (5) Angles to the right are horizontal angles measured clockwise from backsight to foresight (0° to 360°) — the standard modern convention that eliminates directional ambiguity.',
 1,
 ARRAY['horizontal angle','interior angle','deflection angle','vertical angle','zenith angle','elevation angle','angle to the right','polygon','prolongation','route survey','clockwise']),

('acc03a06-0002-0000-0000-000000000001', 'acc03b06-0000-0000-0000-000000000001',
 'Angle Measurement Fundamentals',
 'The horizontal circle is an electronically encoded glass disc in modern total stations (TSIs) — an LED shines through graduated marks onto photodiodes to determine rotation with extreme precision. Key operations: zeroing (setting the circle to 0° 00'' 00" while sighted on the backsight), reading (the displayed value after turning to the foresight), and holding (freezing the display for repetition measurements). Angles are expressed in DMS format (degrees-minutes-seconds) where 1° = 60'' and 1'' = 60". DMS arithmetic requires carrying (95" = 1'' 35") and borrowing (1° = 60''; 180° 00'' 00" = 179° 59'' 60"). The two telescope positions are Face Left / Direct (vertical circle on the left, normal position) and Face Right / Reverse (vertical circle on the right, after plunging). Plunging (transiting) is rotating the telescope 180° about the trunnion (horizontal) axis; after plunging, the instrument is also rotated ~180° horizontally to re-sight the same target. The instrument''s angle display resolution (e.g., 1") does not equal its accuracy specification — a TSI displaying to 1" may have a 2", 3", or 5" accuracy rating.',
 2,
 ARRAY['horizontal circle','encoded disc','zeroing','DMS','degrees minutes seconds','face left','face right','direct','reverse','plunging','transiting','trunnion axis','accuracy','resolution']),

('acc03a06-0003-0000-0000-000000000001', 'acc03b06-0000-0000-0000-000000000001',
 'Direct and Reverse Angle Measurement',
 'A direct (face left) angle measurement uses the telescope in its normal position: set up, sight backsight, zero circle, turn clockwise to foresight, read and record. A reverse (face right) measurement repeats the observation with the telescope plunged. Averaging FL and FR readings eliminates three systematic instrument errors: (1) Collimation error (line of sight not perpendicular to trunnion axis) — the telescope traces a cone rather than a plane; the error reverses sign on face change and cancels when averaged. (2) Trunnion axis error (trunnion axis not perpendicular to vertical axis) — the line of sight does not sweep a true vertical plane; also reverses and cancels. (3) Vertical circle index error — a constant offset in the vertical circle zero point cancels when FL and FR readings are averaged. The four primary sources of random error are centering (instrument not exactly over the mark — dominates on short lines), pointing (target not precisely bisected), reading (errors in reading the circle), and leveling (instrument not perfectly level). Professional surveyors always measure on both faces because eliminating systematic errors is mandatory for quality work.',
 3,
 ARRAY['direct angle','reverse angle','face left','face right','collimation error','trunnion axis error','vertical circle index error','systematic error','averaging','centering error','pointing error','reading error','leveling error','quality control']),

('acc03a06-0004-0000-0000-000000000001', 'acc03b06-0000-0000-0000-000000000001',
 'Turning a Set of Angles (European Method)',
 'The European method (D/R set) is the standard field procedure for measuring a horizontal angle with both direct and reverse observations. The 5-step procedure at instrument station #102: (1) Set up and level. (2) Sight backsight #101 in Face Left, zero the circle. (3) Turn right to foresight #103 (FL), read and record the direct angle. (4) Plunge the telescope, turn to re-sight foresight #103 (FR), read and record the reverse foresight reading. (5) Turn right to backsight #101 (FR), read and record the reverse backsight reading. Computation: Direct angle = Step 3. Reverse angle = Step 4 − Step 5. If the result is negative (occurs when the angle > 180°), add 360°. Mean angle = (Direct + Reverse) / 2. Example for angle < 180°: Steps 3/4/5 = 71°46''18" / 251°46''18" / 180°00''01". Reverse = 251°46''18" − 180°00''01" = 71°46''17". Mean = (71°46''18" + 71°46''17")/2 = 71°46''17.5". Example for angle > 180°: Steps 3/4/5 = 189°09''14" / 9°09''13" / 180°00''02". Reverse = 9°09''13" − 180°00''02" = negative → add 360° → 189°09''11". Mean = (189°09''14" + 189°09''11")/2 = 189°09''12.5". Step 5 is not exactly 180° because instrument errors cause a small deviation — this is precisely what the averaging procedure eliminates.',
 4,
 ARRAY['European method','D/R set','direct reverse','5-step procedure','backsight','foresight','plunge','zero circle','360 degree correction','mean angle','double angle','less than 180','greater than 180','field book','traverse']);


COMMIT;
