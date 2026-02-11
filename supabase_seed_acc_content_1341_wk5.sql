-- ============================================================================
-- ACC SRVY 1341 — Week 5: Instrument Leveling & Setup Over a Point
-- PART 1 OF 2: Lesson content, topics, and resource metadata
-- ============================================================================
-- Full lesson HTML, 4 searchable topics, videos, and key takeaways.
-- Quiz questions, practice problems, and flashcards are in the companion file:
--   supabase_seed_acc_content_1341_wk5_quiz.sql
--
-- Module ID : acc00003-0000-0000-0000-000000000003
-- Lesson ID : acc03b05-0000-0000-0000-000000000001
--
-- Topic UUIDs:
--   acc03a05-0001  Instrument Leveling Fundamentals
--   acc03a05-0002  Three-Screw Leveling Procedure
--   acc03a05-0003  Optical and Laser Plummets
--   acc03a05-0004  Instrument Setup Over a Point
--
-- Run AFTER supabase_seed_acc_courses.sql and wk0–wk4 seeds.
-- Safe to re-run (uses DELETE before INSERT, UPDATE with WHERE).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. LESSON CONTENT (rich HTML)
-- ────────────────────────────────────────────────────────────────────────────

UPDATE learning_lessons SET

title = 'Week 5: Instrument Leveling & Setup Over a Point',

description = 'Procedures for leveling a three-screw surveying instrument and setting up precisely over a ground point using an optical or laser plummet. Covers the left thumb rule, indexing screws, the complete leveling procedure, circular vs. plate bubbles, tribrach operation, and the 10-step setup procedure for centering and leveling over a known point. Follows the Week 4 instrument care review and Quiz 1.',

learning_objectives = ARRAY[
  'Explain the left thumb rule and demonstrate its use for centering a level bubble',
  'Describe why leveling screws should be turned equally and in opposite directions',
  'Define indexing the screws and explain why instruments should be stored with screws indexed',
  'Distinguish between the circular (bull''s-eye) bubble and the plate (tubular) bubble',
  'Perform the complete procedure for leveling a three-screw instrument',
  'Interpret the 180-degree verification check and identify when a plate bubble needs adjustment',
  'Compare and contrast optical plummets and laser plummets',
  'Identify the components and function of a tribrach',
  'Execute the 10-step procedure for setting up an instrument over a known point',
  'Explain why the tribrach must not be rotated when sliding to center over a point'
],

estimated_minutes = 45,

content = '
<h2>Week 5: Instrument Leveling &amp; Setup Over a Point</h2>

<img src="/lessons/cls5/cls5_00_title_instrument_setup.svg" alt="Title graphic showing a total station on a tripod set up over a survey monument with level bubbles centered" style="max-width:100%; margin:1rem 0;" />

<p>Last week you learned the rules of <strong>instrument care</strong> — how to transport, protect, and maintain your surveying equipment. This week we put those instruments to work. The two fundamental skills you will practice today are <strong>instrument leveling</strong> (making the instrument''s vertical axis truly vertical) and <strong>instrument setup over a point</strong> (centering the instrument directly above a known ground mark). These are the first things you do at every station in every traverse, and getting them right is essential to accurate measurements.</p>

<div style="background:#f0f4f8; padding:1rem; border-left:4px solid #2563eb; margin:1rem 0; font-size:1.1em;">
  <strong>Class 5 Agenda:</strong> (1) Review of Instrument Care from Week 4, (2) Quiz 1, (3) Instrument Leveling, (4) Instrument Setup with an Optical or Laser Plummet.
</div>

<hr/>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- TOPIC 1 — INSTRUMENT LEVELING FUNDAMENTALS                        -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<h2>1. Instrument Leveling</h2>

<p>Instrument leveling is <strong>quick and easy</strong> when a few guidelines are followed. Without these guidelines, beginners tend to use a random, trial-and-error method that takes much longer and produces inconsistent results. An experienced surveyor can level a three-screw instrument in <strong>less than two to three minutes</strong>.</p>

<h3>Guideline 1: The Head of the Tripod Should Be Horizontal</h3>

<p>Before you even touch the leveling screws, the <strong>tripod head must be approximately horizontal</strong>. As you learned in Week 4, a tilted tripod head forces the leveling screws to their extremes, making leveling difficult or impossible. Adjust the <strong>tripod leg lengths</strong> until the head is roughly parallel to the ground.</p>

<img src="/lessons/cls5/cls5_01_tripod_head_horizontal.svg" alt="[IMAGE NEEDED] Side-by-side comparison: LEFT shows a tripod with head severely tilted and leveling screws at their extremes (red X), RIGHT shows a tripod with head approximately horizontal and leveling screws near mid-range (green check)" style="max-width:100%; margin:1rem 0;" />

<h3>Guideline 2: The Bubble Follows the Left Thumb</h3>

<p>The <strong>left thumb rule</strong> is the single most important technique for efficient leveling. When you grip two leveling screws — one in each hand — and turn them simultaneously in opposite directions, <strong>the bubble always moves in the direction your left thumb turns</strong>.</p>

<img src="/lessons/cls5/cls5_02_left_thumb_rule_diagram.svg" alt="[IMAGE NEEDED] Top-down view of instrument base showing two hands gripping leveling screws A and B. Left thumb arrow points RIGHT; bubble in the vial moves RIGHT. Clear labels: LEFT HAND on screw A, RIGHT HAND on screw B, arrows showing opposite rotation, and the bubble movement matching the left thumb direction." style="max-width:100%; margin:1rem 0;" />

<p>This works because turning two opposite screws in opposite directions tilts the instrument in a predictable direction. The left thumb provides a reliable directional reference that eliminates guesswork. People who try to level without this rule tend to chase the bubble randomly, which takes much longer.</p>

<div style="background:#fffbeb; padding:1rem; border:1px solid #f59e0b; border-radius:6px; margin:1rem 0;">
  <strong>Memory Aid:</strong> "The bubble follows the LEFT THUMB." If the bubble is to the left of center and you need it to move right, turn your left thumb to the right. Both thumbs move in opposite directions simultaneously.
</div>

<h3>Guideline 3: Turn Leveling Screws Equally and in Opposite Directions</h3>

<p>When using two leveling screws together, <strong>rotate them the same amount, in opposite directions, at the same rate</strong>. Think of it as one thumb pushing toward you while the other pushes away — both moving at the same speed. Turning them unequal amounts shifts the instrument laterally on the tripod head, which affects your centering over the point.</p>

<img src="/lessons/cls5/cls5_03_equal_opposite_turns.svg" alt="[IMAGE NEEDED] Close-up of two hands on adjacent leveling screws. Curved arrows show equal rotation: left screw clockwise, right screw counterclockwise, same number of turns. A small inset shows the instrument staying centered when turns are equal vs. shifting sideways when they are unequal." style="max-width:100%; margin:1rem 0;" />

<h3>Guideline 4: Index the Screws</h3>

<p>On most instruments, the <strong>midpoint of the leveling screw''s travel</strong> is indicated by a <strong>line on the screw body</strong>. When the top of the knob aligns with this line, the screw is at its mid-range — meaning an equal number of turns can be made up or down.</p>

<img src="/lessons/cls5/cls5_04_index_line_on_screw.svg" alt="[IMAGE NEEDED] Close-up of a single leveling foot screw. The screw body has a horizontal index line engraved on it. The top of the knob is aligned with the index line. Arrows point up and down from the index line showing equal travel available in both directions. Label: INDEX MARK." style="max-width:100%; margin:1rem 0;" />

<ul>
  <li><strong>Before leveling:</strong> Set all three screws to their indexed (mid-range) position. This gives you maximum adjustment range in both directions.</li>
  <li><strong>After use:</strong> <strong>Store your instrument with all leveling screws indexed</strong> so the instrument is ready for the next use. This also reduces stress on the instrument base plate during storage and transport.</li>
</ul>

<h3>Circular (Bull''s-Eye) Bubble vs. Plate (Tubular) Bubble</h3>

<p>Most surveying instruments have <strong>two types of level bubbles</strong>. Understanding the difference is essential:</p>

<table>
<thead><tr><th>Feature</th><th>Circular (Bull''s-Eye) Bubble</th><th>Plate (Tubular) Bubble</th></tr></thead>
<tbody>
<tr><td><strong>Shape</strong></td><td>Round vial with a circular bubble</td><td>Elongated tube with an oblong bubble</td></tr>
<tr><td><strong>Sensitivity</strong></td><td>Lower — used for <strong>rough</strong> leveling</td><td>Higher — used for <strong>fine/precise</strong> leveling</td></tr>
<tr><td><strong>Dimensions Leveled</strong></td><td>Levels in <strong>two axes</strong> simultaneously</td><td>Levels in <strong>one axis</strong> only</td></tr>
<tr><td><strong>When Used</strong></td><td><strong>First</strong> — to get approximately level</td><td><strong>Second</strong> — to achieve precise level</td></tr>
<tr><td><strong>Adjusted By</strong></td><td>Tripod leg lengths (rough)</td><td>Leveling foot screws (fine)</td></tr>
</tbody>
</table>

<img src="/lessons/cls5/cls5_05_circular_vs_tubular_bubble.svg" alt="[IMAGE NEEDED] Side-by-side comparison: LEFT shows a circular/bull''s-eye bubble vial from above with the round bubble centered in the inner circle, labeled ROUGH LEVEL. RIGHT shows a tubular/plate bubble vial from the side with the elongated bubble centered between graduation lines, labeled PRECISE LEVEL. Arrows indicate the sequence: circular first, then tubular." style="max-width:100%; margin:1rem 0;" />

<p>The sequence is always: <strong>rough-level with the circular bubble first</strong> (using tripod legs), then <strong>fine-level with the plate bubble</strong> (using foot screws and the left thumb rule).</p>

<hr/>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- TOPIC 2 — THREE-SCREW LEVELING PROCEDURE                         -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<h2>2. Procedure for Leveling a Three-Screw Instrument</h2>

<p>If a systematic procedure is followed, a three-screw instrument can be leveled in <strong>less than two to three minutes</strong>. Here is the standard procedure:</p>

<h3>Step 1: Align the Bubble Over Two Screws</h3>

<p>Stand between two of the leveling screws and rotate the instrument so the <strong>plate (tubular) level vial is aligned parallel to the line connecting those two screws</strong>.</p>

<img src="/lessons/cls5/cls5_06_step1_align_over_two_screws.svg" alt="[IMAGE NEEDED] Top-down diagram of the three leveling screws labeled A, B, and C arranged in a triangle. A dashed line connects screws A and B. The plate bubble vial is shown aligned parallel to this A–B line. The surveyor''s position is indicated standing between A and B. Screw C is opposite." style="max-width:100%; margin:1rem 0;" />

<h3>Step 2: Center the Bubble Using Two Screws</h3>

<p>Find where the bubble is (left or right of center). Using the <strong>left thumb rule</strong>, grip screws A and B and turn them <strong>equal amounts in opposite directions</strong> to move the bubble toward the center of the vial.</p>

<img src="/lessons/cls5/cls5_07_step2_center_with_two_screws.svg" alt="[IMAGE NEEDED] Close-up showing hands on screws A and B with rotation arrows. The plate bubble is shown in three stages: off-center left, moving, then centered. The left thumb arrow matches the bubble movement direction." style="max-width:100%; margin:1rem 0;" />

<h3>Step 3: Rotate 90 Degrees to the Third Screw</h3>

<p>Turn the instrument <strong>90 degrees</strong> so the plate bubble is now aligned toward the <strong>third leveling screw</strong> (screw C).</p>

<img src="/lessons/cls5/cls5_08_step3_rotate_90.svg" alt="[IMAGE NEEDED] Top-down view showing the instrument rotated 90° from the A–B line so the plate bubble vial now points toward screw C. A curved arrow shows the 90° rotation. The new alignment is clearly labeled." style="max-width:100%; margin:1rem 0;" />

<h3>Step 4: Center the Bubble Using Only the Third Screw</h3>

<p>Find the position of the bubble and, following the left thumb rule, <strong>turn only screw C</strong> to center the bubble. Do not touch the other two screws during this step.</p>

<img src="/lessons/cls5/cls5_09_step4_third_screw_only.svg" alt="[IMAGE NEEDED] Close-up of a single hand adjusting screw C with a rotation arrow. Screws A and B are shown grayed out with DO NOT TOUCH labels. The plate bubble moves toward center." style="max-width:100%; margin:1rem 0;" />

<h3>Step 5: Return to the Original Two Screws</h3>

<p>Rotate the instrument <strong>90 degrees back</strong> to align the bubble over the original two screws (A and B). Check whether the bubble is still centered. If not, re-center it using screws A and B.</p>

<h3>Step 6: Rotate Back to the Third Screw and Repeat</h3>

<p>Rotate 90 degrees again to check the bubble over screw C. Re-center if necessary. <strong>Repeat this process</strong> — alternating between the two positions — <strong>until the bubble stays centered as the instrument is rotated</strong>.</p>

<div style="background:#f0f4f8; padding:1rem; border-left:4px solid #2563eb; margin:1rem 0;">
  <strong>Why iteration is necessary:</strong> Adjusting screws A and B slightly affects the tilt in the C direction, and vice versa. The two axes interact. Each iteration reduces the residual error until the bubble remains centered in both orientations. Typically 2–3 iterations are sufficient.
</div>

<img src="/lessons/cls5/cls5_10_iteration_flowchart.svg" alt="[IMAGE NEEDED] Flowchart showing the iterative leveling process: Step 1 Align over A–B → Step 2 Center bubble → Step 3 Rotate 90° → Step 4 Center with C → Step 5 Check A–B → Step 6 Check C → Decision diamond: Bubble stays centered? YES → Done / NO → Return to Step 2." style="max-width:100%; margin:1rem 0;" />

<h3>The 180° Verification Check</h3>

<p>After the bubble stays centered in both the A–B and C positions, perform a final check: rotate the instrument <strong>180 degrees</strong> from its current position. If the bubble <strong>stays centered</strong>, the instrument is properly leveled and the vertical axis is truly vertical.</p>

<p>If the bubble <strong>moves off center</strong> when rotated 180°, the <strong>plate level bubble itself needs adjustment</strong>. This means the bubble vial''s axis is not perpendicular to the vertical axis of the instrument. The correction procedure is:</p>

<ol>
  <li>Using the <strong>leveling screws</strong>, bring the bubble <strong>halfway</strong> back toward center. (The other half of the error is in the bubble tube itself — this is the <em>principle of reversal</em>.)</li>
  <li>Using the <strong>capstan adjusting screws</strong> on the bubble tube, adjust the tube until the bubble is fully centered.</li>
  <li>Repeat the 180° test until the bubble stays centered through a full rotation.</li>
</ol>

<img src="/lessons/cls5/cls5_11_180_degree_check.svg" alt="[IMAGE NEEDED] Two diagrams side by side: LEFT shows the bubble centered before rotation (labeled PASS); RIGHT shows the bubble displaced after 180° rotation (labeled FAIL — bubble needs adjustment). An arrow shows the 180° rotation between the two positions." style="max-width:100%; margin:1rem 0;" />

<p><em>Note: If you are not trained in capstan screw adjustment, report the condition to your party chief. Do not attempt adjustments you do not fully understand.</em></p>

<hr/>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- TOPIC 3 — OPTICAL AND LASER PLUMMETS                              -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<h2>3. Optical and Laser Plummets</h2>

<p>Setting up over a known point requires a way to see — or project — a <strong>vertical line</strong> from the instrument down to the ground mark. Two technologies are used:</p>

<p>An <strong>optical plummet</strong> is a small telescope built into the tribrach or instrument that looks straight down through the vertical axis. When the instrument is level, the plummet projects a truly vertical line of sight to the ground, allowing you to see whether the instrument is centered exactly over a ground mark.</p>

<p>A <strong>laser plummet</strong> does the same thing but projects a visible <strong>laser beam</strong> (typically red or green) downward instead of using a telescope. The laser dot is visible on the ground without looking through an eyepiece.</p>

<img src="/lessons/cls5/cls5_12_optical_plummet_cutaway.svg" alt="[IMAGE NEEDED] Cutaway diagram of an optical plummet inside a tribrach, showing the internal optics: an eyepiece at the top, a 90° reflecting prism, and the line of sight going straight down through the vertical axis to a ground mark below. Label each optical component." style="max-width:100%; margin:1rem 0;" />

<img src="/lessons/cls5/cls5_13_laser_plummet_beam.svg" alt="[IMAGE NEEDED] Side view of an instrument on a tripod with a laser plummet projecting a visible red dot downward to a ground mark (PK nail). The laser beam path is shown as a dashed red line. A person can see the dot from standing height without bending down." style="max-width:100%; margin:1rem 0;" />

<table>
<thead><tr><th>Feature</th><th>Optical Plummet</th><th>Laser Plummet</th></tr></thead>
<tbody>
<tr><td><strong>How It Works</strong></td><td>Small telescope with crosshairs looking straight down</td><td>Projects a visible laser dot downward</td></tr>
<tr><td><strong>Power Required</strong></td><td>None — entirely optical</td><td>Yes — requires battery</td></tr>
<tr><td><strong>Visibility</strong></td><td>Requires light to see the ground mark through the eyepiece</td><td>Visible in low light; may wash out in bright sunlight</td></tr>
<tr><td><strong>Ease of Use</strong></td><td>Must bend down and look through eyepiece</td><td>Laser dot visible from any angle; a second person can verify</td></tr>
<tr><td><strong>Reliability</strong></td><td>Very reliable — no batteries to fail</td><td>Dependent on battery life</td></tr>
<tr><td><strong>Focusing</strong></td><td>Must focus on crosshairs AND on the ground mark to remove parallax</td><td>No focusing required</td></tr>
<tr><td><strong>Accuracy</strong></td><td>Very high — limited by telescope magnification</td><td>Very high — limited by dot size (~1–2 mm at 1.5 m height)</td></tr>
</tbody>
</table>

<h3>The Tribrach</h3>

<p>A <strong>tribrach</strong> is the precision mounting plate that connects a surveying instrument to the tripod. The name comes from the Greek words for "three" and "arm," referring to its three leveling screws. The tribrach is a critical component because it provides both <strong>centering</strong> (over a point) and <strong>leveling</strong> (making the horizontal plane truly horizontal).</p>

<p>A tribrach contains:</p>
<ul>
  <li><strong>Three leveling (foot) screws</strong> — for precise leveling of the instrument</li>
  <li>A <strong>circular (bull''s-eye) bubble</strong> — for rough leveling</li>
  <li>An <strong>optical or laser plummet</strong> — for centering over a ground point</li>
  <li>A <strong>locking clamp</strong> — for securing the instrument (or prism/target) to the tribrach</li>
  <li>A <strong>5/8-inch-11 central mounting screw</strong> — for attaching the tribrach to the tripod head</li>
</ul>

<img src="/lessons/cls5/cls5_14_tribrach_labeled.svg" alt="[IMAGE NEEDED] Annotated photograph or technical drawing of a tribrach viewed from a 3/4 angle. Callout lines identify: (1) three leveling foot screws, (2) circular bubble, (3) optical plummet eyepiece, (4) locking clamp lever, (5) 5/8-inch central mounting screw on the bottom. Each label is numbered and clearly connected to the part." style="max-width:100%; margin:1rem 0;" />

<p>The tribrach''s locking clamp can accept <strong>interchangeable instruments</strong> — you can swap a total station for a prism target without disturbing the tribrach''s position on the tripod. This is the basis of <strong>forced centering</strong>, an advanced traverse technique that speeds up fieldwork and reduces centering errors. You will learn forced centering later in the lab course (SRVY 1335).</p>

<hr/>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- TOPIC 4 — INSTRUMENT SETUP OVER A POINT                           -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<h2>4. Instrument Setup Over a Point Using an Optical or Laser Plummet</h2>

<p>Setting up over a known ground point (such as a PK nail, hub and tack, or survey monument) requires both <strong>precise centering</strong> and <strong>precise leveling</strong> simultaneously. These two adjustments are <em>interactive</em> — adjusting one slightly affects the other — so the process is iterative. With practice, the complete setup takes <strong>less than five minutes</strong>.</p>

<h3>Step 1: Rough-Set the Tripod</h3>

<p>Rough-set the tripod over the ground point by positioning the legs around the mark. A practical technique:</p>
<ul>
  <li>Hold two legs and place the <strong>third leg past the point</strong>.</li>
  <li>Move the two you are holding until the <strong>head of the tripod is approximately over the point</strong> and is <strong>horizontal</strong>.</li>
  <li>Press all three leg tips firmly into the ground.</li>
</ul>

<img src="/lessons/cls5/cls5_15_rough_set_tripod.svg" alt="[IMAGE NEEDED] Overhead view showing a surveyor''s hands holding two tripod legs while the third is already planted past the ground mark (shown as a red dot). Arrows show the two held legs being positioned to center the tripod head over the mark. The tripod head is shown approximately horizontal." style="max-width:100%; margin:1rem 0;" />

<h3>Step 2: Attach the Instrument and Adjust</h3>

<p>Mount the instrument (or tribrach with instrument) on the tripod head. Look through the <strong>optical plummet</strong>:</p>
<ol>
  <li>First, <strong>focus onto the crosshairs</strong> (turn the eyepiece ring).</li>
  <li>Then <strong>focus onto the ground mark</strong> (turn the objective focus).</li>
  <li><strong>Tip:</strong> Place your foot next to the point to help locate it in the plummet''s field of view.</li>
</ol>
<p>While holding up two of the legs nearest you, adjust the location of the tripod if necessary to make the point visible in the optical plummet.</p>

<img src="/lessons/cls5/cls5_16_look_through_plummet.svg" alt="[IMAGE NEEDED] A surveyor bending to look through the optical plummet eyepiece on the tribrach. A circular inset shows the plummet''s field of view: crosshairs visible with a PK nail nearby but not yet centered. A boot is visible next to the nail for reference." style="max-width:100%; margin:1rem 0;" />

<h3>Step 3: Center the Optical Plummet on the Point</h3>

<p>When the point is visible in the optical plummet, use the <strong>instrument''s leveling screws</strong> to move the crosshairs until they are <strong>exactly centered on the point</strong>.</p>

<img src="/lessons/cls5/cls5_17_center_plummet_on_point.svg" alt="[IMAGE NEEDED] Two circular plummet views side by side: LEFT shows crosshairs offset from the nail (labeled BEFORE), RIGHT shows crosshairs perfectly centered on the nail (labeled AFTER). Arrows indicate the leveling screws were adjusted to achieve centering." style="max-width:100%; margin:1rem 0;" />

<div style="background:#fffbeb; padding:1rem; border:1px solid #f59e0b; border-radius:6px; margin:1rem 0;">
  <strong>Important:</strong> Using the leveling screws to center the plummet intentionally throws the instrument out of level. That is OK at this stage — you will level it properly in the next steps. The goal right now is to get the plummet centered on the point.
</div>

<h3>Step 4: Adjust the Tripod Legs to Level</h3>

<p>Now focus on the <strong>bull''s-eye (circular) bubble</strong>. Adjust the <strong>tripod legs up or down</strong> — extending or shortening them — to center the circular bubble. <strong>Work with only one leg at a time!</strong></p>

<p>Extending or shortening a leg moves the instrument in an arc roughly centered on the ground mark, so the plummet should remain close to the point.</p>

<img src="/lessons/cls5/cls5_18_adjust_legs_for_level.svg" alt="[IMAGE NEEDED] Side view showing one tripod leg being extended (arrow pointing down at the foot). The circular bubble on the tribrach is shown moving toward center. Bold label: ONE LEG AT A TIME. The other two legs are shown anchored." style="max-width:100%; margin:1rem 0;" />

<h3>Step 5: Confirm the Position</h3>

<p>Check to confirm that the optical plummet is <strong>still on or very close to the point</strong>. The leg adjustments in Step 4 may have shifted the centering slightly.</p>

<h3>Step 6: Center the Plate Bubble</h3>

<p>Return to the <strong>leveling screws</strong> and use the full three-screw leveling procedure (Section 2 above) to <strong>precisely center the plate (tubular) bubble</strong>. The plate bubble should remain centered when the instrument is rotated about its vertical axis.</p>

<h3>Step 7: Check the Optical Plummet</h3>

<p>Look through the optical plummet again and check its position relative to the point. <strong>It will probably be slightly off the point</strong> — this is normal because fine-leveling with the foot screws shifts the instrument''s position slightly.</p>

<h3>Step 8: Center the Instrument Over the Point</h3>

<p>Loosen the <strong>instrument attachment clamp on the tripod</strong> slightly (the central 5/8-inch mounting screw). While looking through the optical plummet, <strong>slide the instrument on the tripod head</strong> until the crosshairs are exactly on the point.</p>

<div style="background:#fee2e2; padding:1rem; border:1px solid #ef4444; border-radius:6px; margin:1rem 0;">
  <strong>Critical Rule: Do NOT rotate the tribrach!</strong> Slide it in straight lines only — toward/away and left/right. The tripod head surface has minor imperfections. When you <em>slide</em>, the base plate maintains approximately the same tilt. When you <em>rotate</em>, different parts of the base plate contact different areas of the head surface, changing the tilt and destroying your established level. If you rotate, you must re-level from scratch.
</div>

<img src="/lessons/cls5/cls5_19_slide_not_rotate.svg" alt="[IMAGE NEEDED] Top-down view of the tribrach on the tripod head. LEFT side shows straight-line sliding arrows (green, labeled CORRECT — Slide). RIGHT side shows a curved rotation arrow (red, labeled WRONG — Do Not Rotate). Clear visual distinction between the two motions." style="max-width:100%; margin:1rem 0;" />

<h3>Step 9: Tighten the Attachment Clamp</h3>

<p>Tighten the attachment clamp (central mounting screw) and <strong>recheck the plate level</strong>. Sliding the instrument may have slightly disturbed the level.</p>

<h3>Step 10: Re-Level and Repeat</h3>

<p>Re-level using the foot screws and repeat the centering check if necessary until the instrument is <strong>exactly level AND directly over the point simultaneously</strong>.</p>

<p>When both conditions are achieved, <strong>check the instrument frequently during use</strong> to ensure it remains level and over the point. Tripod legs can settle, especially on soft ground, hot asphalt, or in warm temperatures.</p>

<img src="/lessons/cls5/cls5_20_final_setup_complete.svg" alt="[IMAGE NEEDED] A properly set up total station on a tripod over a survey monument. Callout labels confirm: (1) plate bubble centered, (2) optical plummet on the mark, (3) attachment clamp tight, (4) tripod legs firmly planted. A green checkmark indicates setup is complete." style="max-width:100%; margin:1rem 0;" />

<hr/>

<h2>Common Mistakes to Avoid</h2>

<img src="/lessons/cls5/cls5_21_common_mistakes.svg" alt="[IMAGE NEEDED] Infographic showing 6 common setup mistakes with icons: (1) tilted tripod head, (2) random screw turning, (3) screws not indexed, (4) rotating tribrach, (5) over-tightened screws, (6) skipping iteration. Each has a brief label and a prohibition symbol." style="max-width:100%; margin:1rem 0;" />

<ul>
  <li><strong>Skipping the rough-level step</strong> — trying to level entirely with foot screws when the tripod head is severely tilted</li>
  <li><strong>Leveling without a system</strong> — randomly turning screws instead of following the left thumb rule and the two-position procedure</li>
  <li><strong>Not indexing screws before starting</strong> — running out of adjustment range mid-procedure</li>
  <li><strong>Rotating the tribrach when sliding to center</strong> — this destroys the established level and forces you to start over</li>
  <li><strong>Over-tightening the foot screws</strong> — this warps the base plate and can damage the instrument</li>
  <li><strong>Not iterating between centering and leveling</strong> — a single pass is rarely sufficient because the adjustments interact</li>
  <li><strong>Confusing the circular and plate bubbles</strong> — using only the circular bubble and assuming the instrument is precisely level</li>
  <li><strong>Not rechecking during extended use</strong> — the instrument can settle out of level over time, especially on soft ground</li>
</ul>

<hr/>

<h2>Video Resources</h2>

<ul>
  <li><a href="https://www.youtube.com/watch?v=xHFt-fkvfrg" target="_blank">Instrument Setup Over a Point — Complete Procedure</a> (12:42 min)</li>
  <li><a href="https://www.youtube.com/watch?v=iAQgFFHBiPo" target="_blank">Total Station Setup and Leveling Demonstration</a> (9:02 min) <strong>*Recommended</strong></li>
</ul>

<p><strong>Homework:</strong> Find and watch additional videos on instrument leveling and setup on the internet. Share any videos you find that are especially clear or helpful with me, please.</p>

<hr/>

<h2>Looking Ahead</h2>

<p>Now that you can properly care for, level, and set up a surveying instrument over a point, you are ready to begin the computational core of the course. Next week we move to <strong>traverse computations</strong> — converting raw field angles into azimuths and decomposing traverse legs into latitudes and departures. This is where the math meets the fieldwork.</p>
',

resources = '[
  {"title":"Elementary Surveying: An Introduction to Geomatics (Ghilani) — Chapters on Leveling and Instrument Setup","url":"https://www.pearson.com/en-us/subject-catalog/p/elementary-surveying-an-introduction-to-geomatics/P200000003437","type":"reference"},
  {"title":"Jerry Mahun''s Open Access Surveying Library — TSI Setup Procedures","url":"https://www.jerrymahun.com/index.php/home/open-access/14-total-station-instruments/213-tsi-chap-c-2","type":"reference"},
  {"title":"Surveying with Construction Applications (Kavanagh & Slattery) — Instrument Operations","url":"https://www.pearson.com/en-us/subject-catalog/p/surveying-with-construction-applications/P200000003285","type":"reference"},
  {"title":"Trimble Total Station Support — Setup Guides","url":"https://www.trimble.com/support","type":"reference"},
  {"title":"Leica Geosystems — Instrument Setup Procedures","url":"https://leica-geosystems.com/support","type":"reference"}
]'::jsonb,

videos = '[
  {"title":"Instrument Setup Over a Point — Complete Procedure (12:42)","url":"https://www.youtube.com/watch?v=xHFt-fkvfrg"},
  {"title":"Total Station Setup and Leveling Demonstration (9:02)","url":"https://www.youtube.com/watch?v=iAQgFFHBiPo"}
]'::jsonb,

key_takeaways = ARRAY[
  'The tripod head must be approximately horizontal before you begin leveling with the foot screws',
  'The left thumb rule: the bubble always moves in the direction your left thumb turns',
  'Turn leveling screws equally and in opposite directions to avoid shifting the instrument laterally',
  'Index all leveling screws to mid-range before leveling and before storing the instrument',
  'Use the circular (bull''s-eye) bubble for rough leveling, then the plate (tubular) bubble for fine leveling',
  'The three-screw procedure: align over two screws, center, rotate 90°, center with third screw only, repeat until stable',
  'If the bubble moves off center at 180° rotation, the plate bubble vial itself needs adjustment — use the principle of reversal',
  'Optical plummets use a telescope looking down; laser plummets project a visible dot — both center you over a ground mark',
  'A tribrach provides three leveling screws, a circular bubble, and an optical/laser plummet in one mounting plate',
  'The 10-step setup: rough-set tripod, center plummet, adjust legs for level, fine-level with foot screws, slide to re-center, iterate',
  'NEVER rotate the tribrach when sliding to center — slide in straight lines only',
  'Check the instrument frequently during use to ensure it remains level and centered over the point'
]

WHERE id = 'acc03b05-0000-0000-0000-000000000001';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. TOPICS
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM learning_topics WHERE lesson_id = 'acc03b05-0000-0000-0000-000000000001';

INSERT INTO learning_topics (id, lesson_id, title, content, order_index, keywords) VALUES

('acc03a05-0001-0000-0000-000000000001', 'acc03b05-0000-0000-0000-000000000001',
 'Instrument Leveling Fundamentals',
 'Instrument leveling makes the vertical axis of the instrument truly vertical so that horizontal angles are measured in a horizontal plane and vertical angles are referenced correctly. Four guidelines make the process fast and reliable. (1) The tripod head must be approximately horizontal before leveling — a tilted head forces foot screws to their extremes and may exceed the compensator range (typically ±3′ to ±6′). (2) The left thumb rule: when gripping two foot screws and turning them simultaneously in opposite directions, the bubble always moves in the direction the left thumb turns. This eliminates guesswork and is the single most efficient leveling technique. (3) Turn screws equally and in opposite directions at the same rate; unequal turns shift the instrument laterally on the tripod head, affecting centering. (4) Index the screws — set them to mid-range (marked by a line on the screw body) before leveling to ensure maximum adjustment range in both directions, and store the instrument with screws indexed. Two types of level bubbles are used: the circular (bull''s-eye) bubble for rough two-axis leveling (adjusted by tripod leg lengths), followed by the more sensitive plate (tubular) bubble for precise single-axis leveling (adjusted by foot screws using the left thumb rule).',
 1,
 ARRAY['leveling','left thumb rule','foot screws','indexing','circular bubble','plate bubble','tubular bubble','bull''s-eye','tripod head','horizontal','compensator','vertical axis']),

('acc03a05-0002-0000-0000-000000000001', 'acc03b05-0000-0000-0000-000000000001',
 'Three-Screw Leveling Procedure',
 'The standard procedure for leveling a three-screw instrument takes less than two to three minutes when performed systematically. Step 1: Align the plate bubble parallel to the line connecting two of the three foot screws (A and B). Step 2: Using the left thumb rule, grip screws A and B and turn them equal amounts in opposite directions to center the bubble. Step 3: Rotate the instrument 90° so the bubble aligns toward the third screw (C). Step 4: Turn only screw C to center the bubble — do not touch A or B. Step 5: Rotate back to the A–B alignment and recheck. Step 6: Rotate to screw C and recheck. Repeat (iterate) until the bubble stays centered in both orientations. Typically 2–3 iterations are sufficient because adjusting one axis slightly affects the other. Final verification: rotate the instrument 180°. If the bubble stays centered, the instrument is level. If the bubble moves off center at 180°, the plate bubble vial itself needs adjustment: bring the bubble halfway back with the foot screws (the other half is the vial error — the principle of reversal), then use the capstan adjusting screws on the vial to center it fully. Repeat until the bubble remains centered through a full rotation.',
 2,
 ARRAY['three-screw','procedure','step-by-step','align','rotate 90','iterate','180 degree check','principle of reversal','capstan screws','vial adjustment','systematic']),

('acc03a05-0003-0000-0000-000000000001', 'acc03b05-0000-0000-0000-000000000001',
 'Optical and Laser Plummets',
 'An optical plummet is a small telescope built into the tribrach or instrument body that looks straight down through the vertical axis. It has crosshairs that the surveyor centers on the ground mark by looking through an eyepiece. The surveyor must focus both the crosshairs and the ground mark to remove parallax. Optical plummets require no power and are very reliable. A laser plummet projects a visible laser beam (red or green) downward from the vertical axis to the ground. The dot is visible without bending to an eyepiece, and a second person can verify centering. However, laser plummets require battery power and may wash out in bright sunlight on light surfaces. Both types can be built into the tribrach or the instrument. When the plummet is in the instrument, it rotates with the telescope, which allows the 360° rotation check to verify its adjustment. A tribrach is the precision mounting plate connecting instrument to tripod. It contains three leveling (foot) screws, a circular bubble, an optical or laser plummet, a locking clamp for interchangeable instruments, and a 5/8″-11 central mounting screw for attaching to the tripod head. The tribrach''s ability to accept interchangeable instruments is the basis of forced centering — an advanced traverse technique where the instrument and prism are swapped between tribrachs without disturbing their centering, speeding up fieldwork and reducing centering errors.',
 3,
 ARRAY['optical plummet','laser plummet','tribrach','crosshairs','focus','parallax','vertical axis','locking clamp','mounting screw','forced centering','interchangeable','red dot','eyepiece','5/8 inch']),

('acc03a05-0004-0000-0000-000000000001', 'acc03b05-0000-0000-0000-000000000001',
 'Instrument Setup Over a Point',
 'Setting up over a known ground point (PK nail, hub and tack, survey monument) requires simultaneous precise centering and leveling. The two adjustments interact — adjusting one slightly affects the other — so the process is iterative. The 10-step procedure: (1) Rough-set the tripod — hold two legs, place the third past the point, position the head approximately over the point and horizontal, press all tips firmly into the ground. (2) Attach the instrument; look through the optical plummet; focus on crosshairs then on the ground mark; place your foot near the point to locate it. (3) Use the leveling screws to center the plummet crosshairs exactly on the point (this intentionally un-levels the instrument). (4) Adjust tripod legs up or down ONE AT A TIME to center the circular bubble; leg changes move the instrument in an arc roughly centered on the ground mark. (5) Confirm the plummet is still near the point. (6) Use the three-screw leveling procedure to precisely center the plate bubble. (7) Recheck the optical plummet — it will probably be slightly off the point. (8) Loosen the central mounting screw slightly and SLIDE (do not rotate!) the instrument on the tripod head until the plummet is exactly on the point. Do not rotate because different parts of the base plate contacting different areas of the tripod head surface change the tilt. (9) Tighten the clamp and recheck the plate level. (10) Re-level and repeat if necessary until both conditions — exactly level and directly over the point — are satisfied simultaneously. Check frequently during use because tripod legs settle, especially on soft ground or hot asphalt.',
 4,
 ARRAY['setup over a point','10-step procedure','PK nail','hub and tack','monument','rough-set','optical plummet','centering','leveling','circular bubble','plate bubble','slide','do not rotate','attachment clamp','mounting screw','iterate','settle','interactive']);


COMMIT;
