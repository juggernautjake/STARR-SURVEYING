-- ============================================================================
-- ACC SRVY 1341 — Week 4: Instrument Care, Tripod Best Practices &
-- Maintenance Schedules
-- ============================================================================
-- Full lesson content, topics (4), quiz questions (16), practice problems (20),
-- and flashcards (25).
--
-- Module ID : acc00003-0000-0000-0000-000000000003
-- Lesson ID : acc03b04-0000-0000-0000-000000000001
--
-- Topic UUIDs:
--   acc03a04-0001  Instrument Transport and Handling
--   acc03a04-0002  Environmental Protection and Weather
--   acc03a04-0003  Tripod Care and Setup
--   acc03a04-0004  Maintenance Schedules and Field Calibration
--
-- Run AFTER supabase_seed_acc_courses.sql and wk1/wk2/wk3 seeds.
-- Safe to re-run (uses DELETE before INSERT).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. LESSON CONTENT (rich HTML)
-- ────────────────────────────────────────────────────────────────────────────

UPDATE learning_lessons SET

title = 'Week 4: Instrument Care, Tripod Best Practices & Maintenance Schedules',

description = 'A comprehensive guide to the care, handling, and maintenance of surveying instruments and tripods. Covers proper transport, environmental protection, lens care, tripod setup, climatization, electronic instrument precautions, and the minimum maintenance schedule every field crew must follow. Includes review of magnetic declination, smartphone compass apps, and field notekeeping from previous weeks.',

learning_objectives = ARRAY[
  'Demonstrate proper procedures for transporting surveying instruments between setups and in vehicles',
  'Explain why an empty instrument case must remain closed and the consequences of leaving it open',
  'Describe the correct method for attaching an instrument to a tripod and the proper grip technique',
  'List the rules for lens care and explain why optical coatings require special cleaning materials',
  'Apply environmental protection procedures for rain, humidity, temperature extremes, and salt air',
  'Calculate instrument acclimation time using the temperature-difference rule of thumb',
  'Set up a tripod with proper leg spread, firm penetration, and a horizontal head',
  'Identify the items on a minimum maintenance schedule and their required frequencies',
  'Describe the peg test procedure for level instruments and explain when it must be performed',
  'Explain the optical plummet check procedure and interpret its results'
],

estimated_minutes = 45,

content = '
<h2>Week 4: Instrument Care, Tripod Best Practices &amp; Maintenance Schedules</h2>

<img src="/lessons/cls4/cls4_01_compass_rose_title.svg" alt="Compass rose showing N, S, E, W cardinal directions" style="max-width:100%; margin:1rem 0;" />

<p>This week begins with a brief review of magnetic declination, smartphone compass applications, and field notekeeping from previous classes. The main topic is <strong>instrument care</strong> — the habits and procedures that keep your equipment accurate, reliable, and long-lived. A surveying instrument will perform properly only if it is in good condition, is properly calibrated, and is used according to procedures recommended by the manufacturer. Proper care and handling is easy to do, but it takes <strong>discipline</strong> on the part of the user.</p>

<div style="background:#f0f4f8; padding:1rem; border-left:4px solid #2563eb; margin:1rem 0; font-size:1.1em;">
  <strong>Rule #1:</strong> Always read the manual for your instruments. Every manufacturer provides specific care and calibration instructions. The guidelines below are universal best practices that apply to virtually all surveying equipment.
</div>

<hr/>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- TOPIC 1 — INSTRUMENT TRANSPORT AND HANDLING                       -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<h2>1. Instrument Transport and Handling</h2>

<h3>Transporting Surveying Instruments</h3>

<ul>
  <li><strong>Always transport the instrument in its case</strong> when moving from setup to setup</li>
  <li><strong>Always keep the instrument in its case</strong> when not in use</li>
  <li>Place the instrument case in a location in the vehicle that is <strong>safe from bouncing around and from vibrations</strong></li>
  <li><strong>Do not carry any instrument while it is attached to the tripod</strong> — this is one of the most common causes of instrument damage</li>
</ul>

<img src="/lessons/cls4/cls4_02_no_carry_on_tripod.svg" alt="WRONG: Carrying instrument attached to tripod with prohibition symbol" style="max-width:100%; margin:1rem 0;" />

<p>The correct method: carry the tripod over one shoulder and the instrument case separately in the other hand.</p>

<img src="/lessons/cls4/cls4_03_correct_carry_method.svg" alt="CORRECT: Surveyor carrying tripod on shoulder and instrument case in other hand" style="max-width:100%; margin:1rem 0;" />

<h3>Keep an Empty Case Closed</h3>

<p>Allowing an instrument case to be open while the instrument is in use on the tripod is a <strong>poor practice</strong> because the inside of the case will collect dust. Later, when the instrument is put in the case, it will be like a <em>dust storm</em> inside of the case while the instrument is being carried. Some of the dirt will eventually <strong>penetrate the bearing surfaces</strong> in the instrument, requiring an expensive cleaning and repair bill.</p>

<img src="/lessons/cls4/cls4_04_open_case_prohibited.svg" alt="Open instrument case with prohibition symbol — keep case closed while instrument is on tripod" style="max-width:100%; margin:1rem 0;" />

<h3>Attaching the Instrument to the Tripod</h3>

<p>Attach the instrument <strong>just snug enough</strong> so that it will not move, but <strong>not unnecessarily tight</strong> so that the tripod head or spring plate become warped.</p>

<img src="/lessons/cls4/cls4_05_attaching_instrument_to_tripod.svg" alt="Surveyor attaching instrument to tripod head with proper stance" style="max-width:100%; margin:1rem 0;" />

<h3>Grasping the Instrument</h3>

<ul>
  <li>Grasp the instrument by the <strong>standards and tribrach</strong> when placing it on the tripod — <em>not</em> by the telescope or other parts</li>
  <li><strong>Secure the instrument immediately</strong> to the tripod</li>
  <li>Do not allow it to sit on top of the tripod unclamped — even for a moment</li>
</ul>

<img src="/lessons/cls4/cls4_06_proper_grip_standards.svg" alt="Proper grip: hands on standards and tribrach, not on telescope" style="max-width:100%; margin:1rem 0;" />

<h3>Lens Care</h3>

<ul>
  <li><strong>Never touch the lenses</strong> with your fingers or a common cloth</li>
  <li>Use only <strong>lens cleaning tissues and fluids</strong> designed for optical instruments</li>
  <li>All lenses have <strong>optical coatings</strong> — using anything other than proper materials may scratch or damage these soft coatings</li>
  <li>Do not handle equipment with muddy, excessively dirty, or greasy hands or gloves</li>
  <li>Accumulations of dirt, dust, and foreign material will eventually <strong>penetrate into the motions and cause sticking</strong></li>
  <li>When possible, use the <strong>plastic hood</strong> for protection against dust when working in dusty conditions</li>
</ul>

<h3>Never Force Any Motion</h3>

<ul>
  <li>When using the motions of an instrument, the clamps should be <strong>just snug (not tight)</strong> — micrometer tight is appropriate</li>
  <li>The idea is to clamp the motion just snug enough so that rotation about the axis will not occur during slight pressure</li>
  <li>When rotating about an axis, <strong>be sure the clamp is loose first</strong></li>
  <li>Rotate gently with <strong>fingertips</strong>, not forcefully with a grip</li>
  <li>If screws operate too tightly, arrange for readjustment by <strong>qualified technicians</strong></li>
  <li><strong>Never remove any plate or make any adjustment</strong> without understanding thoroughly what you are doing beforehand</li>
</ul>

<hr/>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- TOPIC 2 — ENVIRONMENTAL PROTECTION AND WEATHER                    -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<h2>2. Environmental Protection and Weather</h2>

<h3>Keep Equipment Dry</h3>

<p>Weather conditions vary and keeping the equipment dry is practically impossible. With careful attention to weather and jobsite conditions, the instrument can be protected when moisture is present:</p>

<ul>
  <li>If caught in temporary showers where the instrument must be left set up, <strong>cover it with the plastic hood provided</strong></li>
  <li>Wipe the tripod completely dry later, but <strong>allow the instrument to air dry</strong> by leaving the hood off the case</li>
  <li>Don''t rub off the finish when an instrument is exposed to moisture or high humidity</li>
  <li><strong>Do not store in an air-tight case overnight</strong> when wet — moisture will condense on the inside of the instrument. Leave the case open so air can circulate</li>
</ul>

<img src="/lessons/cls4/cls4_07_rain_cover_on_instrument.svg" alt="Plastic rain hood covering instrument on tripod during weather" style="max-width:100%; margin:1rem 0;" />

<h3>Never Leave the Instrument Unattended</h3>

<p>Do not leave the instrument unattended — either while set up during a survey or while it is in unlocked vehicles. Surveying instruments are expensive (a modern robotic total station can cost $30,000–$60,000) and attractive targets for theft.</p>

<h3>Climatize the Instrument</h3>

<p>When the instrument is to be in continual use outside in very hot or very cold weather, <strong>store the instrument nightly in its closed case outside</strong> so there is no significant temperature change overnight. This helps prevent condensation from forming inside the instrument.</p>

<div style="background:#fffbeb; padding:1rem; border:1px solid #f59e0b; border-radius:6px; margin:1rem 0;">
  <strong>Acclimation Rule of Thumb:</strong> If transported inside a vehicle at a temperature different from the working temperature, allow <strong>at least one minute for each degree (°F) of temperature difference</strong> between the two environments.<br/><br/>
  <strong>Example:</strong> Inside truck = 70°F, outside working temperature = 40°F → difference = 30°F → allow <strong>30 minutes</strong> of acclimation time before taking precision measurements.
</div>

<h3>Electronic Instruments — Special Care</h3>

<p>In addition to mechanical parts and optics, electronic instruments contain <strong>contacts, wires, and computer chips</strong>. Hazards include humidity, rain, snow, cold, heat, and vibrations.</p>

<ul>
  <li><strong>Exposure to moisture should be avoided</strong> — electrical contacts are very susceptible to corrosion</li>
  <li>Humidity near sea water is especially dangerous — salt elements can penetrate an instrument</li>
  <li>Electronic instruments used around <strong>salt water areas</strong> should be taken to a repair shop to be conditioned for that exposure</li>
  <li>Protect from extreme temperature swings that can cause internal condensation on circuit boards</li>
</ul>

<hr/>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- TOPIC 3 — TRIPOD CARE AND SETUP                                   -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<h2>3. Tripod Care and Setup</h2>

<p>Tripods are often neglected but are actually a <strong>very important part of measuring accurately</strong>. A tripod provides a solid foundation for instrument setups. It consists of a <strong>head</strong> for attaching the instrument, <strong>wooden or metal legs</strong>, and <strong>metal points with foot pads</strong> to help force the leg points into the ground.</p>

<h3>Establish a Wide Foundation</h3>

<p>Always spread the tripod legs <strong>at least 36 inches evenly apart</strong>, and plant tips firmly when setting up the instrument, even temporarily. Never lean the tripod against vehicles, buildings, or trees, even when the instrument is unattached.</p>

<h3>Keep the Head Horizontal</h3>

<p>Place the head of the tripod in a <strong>horizontal position</strong>. Inexperienced users have a tendency to disregard the relative position of the tripod head when setting up — if the head is not parallel to the horizontal reference plane, the leveling screws in the instrument will be overextended, making it more difficult to level. <strong>If the instrument is not level, errors occur!</strong></p>

<img src="/lessons/cls4/cls4_08_tripod_head_horizontal.svg" alt="Tripod head must be horizontal — parallel to reference plane" style="max-width:100%; margin:1rem 0;" />

<h3>Position Tripod Legs Properly</h3>

<p>Push the legs into the ground <strong>just far enough for a firm setup</strong>, but do not exercise unnecessary force. Always push <strong>directly longitudinal to the leg</strong>, and do not push the leg so that it flexes.</p>

<img src="/lessons/cls4/cls4_09_tripod_leg_shallow_NO.svg" alt="NO: Tripod leg tip barely inserted into ground — insufficient penetration" style="max-width:100%; margin:1rem 0;" />

<img src="/lessons/cls4/cls4_10_tripod_leg_firm_YES.svg" alt="YES: Tripod leg tip firmly pushed into ground — proper penetration depth" style="max-width:100%; margin:1rem 0;" />

<h3>Ensure a Solid Setup</h3>

<ul>
  <li><strong>Firmly insert the tripod legs</strong> into the ground — setting the tripod gently invites settlement. As the instrument settles, it can shift out of level, affecting measurements.</li>
  <li>On smooth floors, use something to <strong>prevent the legs from slipping</strong>: chain, rope, a piece of carpet, or plywood cut in a triangular shape with holes at the points.</li>
  <li>Care should be taken on <strong>asphalt</strong> — the tripod will quickly sink on a hot day. Place a piece of <strong>lath or a brick</strong> under each point.</li>
</ul>

<h3>High Winds</h3>

<p>High winds can topple a tripod and instrument. Passing 18-wheelers can create wind gusts strong enough to knock an instrument to the ground. Use <strong>sandbags or weights on the tripod leg tips</strong> to weigh them down.</p>

<img src="/lessons/cls4/cls4_11_tripod_sandbags_wind.svg" alt="Sandbags attached to tripod leg tips to prevent toppling in high winds" style="max-width:100%; margin:1rem 0;" />

<h3>Keep Legs Tight</h3>

<ul>
  <li>Firmly attach the tripod legs to the head — <strong>tripods have adjustment screws that can loosen over time</strong></li>
  <li>Keep tension on the legs so they will fall slowly or swing freely</li>
  <li>If a leg extended straight out stays in that position, it is <strong>too tight</strong> and will wear excessively</li>
  <li>If a leg drops immediately, it is <strong>too loose</strong> — loose legs cause unintended rotation in the tripod head, producing angular alignment errors</li>
</ul>

<h3>Secure Adjustable Legs</h3>

<p>Be certain the clamps on adjustable-leg tripods hold the legs in position securely. Adjustable legs have a tendency to <strong>slip if they are not securely clamped</strong>.</p>

<h3>Lubrication</h3>

<p>Frequently lubricating joints will prevent excessive wear. Use a <strong>silicone-based lubricant</strong> (silicone spray) — it will not attract dirt like petroleum lubricants such as oil or grease. Silicone spray is also a great lubricant for <strong>prism poles and steel tapes</strong>.</p>

<ul>
  <li>Clean the tripod after use</li>
  <li>Carry cleaning cloths and a wire brush to remove dirt from leg points</li>
  <li>Mud and dirt cling to tripod points and should be wiped off between uses</li>
</ul>

<h3>Protect the Head</h3>

<p>If the tripod head is dented or scratched, the instrument may not fit accurately or securely. <strong>Avoid leaning tripods against anything</strong> — slight movements may cause the tripod to fall, damaging the head or other items.</p>

<h3>Transport Carefully</h3>

<p>Protect tripods from heavy objects when carrying them in vehicles. Carry tripods in a <strong>separate compartment</strong> from other equipment to avoid damage from vibration and rubbing.</p>

<hr/>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- TOPIC 4 — MAINTENANCE SCHEDULES AND FIELD CALIBRATION             -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<h2>4. Maintenance Schedules and Field Calibration</h2>

<h3>Minimum Maintenance Schedule</h3>

<img src="/lessons/cls4/cls4_12_maintenance_schedule_table.svg" alt="Minimum maintenance schedule table for surveying equipment" style="max-width:100%; margin:1rem 0;" />

<table>
<thead><tr><th>Maintenance Item</th><th>Daily</th><th>Weekly</th><th>Monthly</th><th>Yearly / Seasonal</th><th>New Job</th><th>When New</th></tr></thead>
<tbody>
<tr><td><strong>Wipe Clean</strong></td><td>Chain, Tripod, Level Rod, Prism Pole</td><td>All equipment</td><td></td><td></td><td>All</td><td></td></tr>
<tr><td><strong>Deep Clean</strong></td><td></td><td>Level Rod, Prism Pole</td><td>Tripod, Level Rod, Laser</td><td>All</td><td>All</td><td></td></tr>
<tr><td><strong>Lubricate (Dry Teflon/Silicone only)</strong></td><td></td><td></td><td>Tripod, Level Rod, Prism Pole</td><td></td><td></td><td></td></tr>
<tr><td><strong>Check &amp; Correct Calibration</strong></td><td>Prism Pole Bubble</td><td>Auto Level, Tribrach</td><td>Laser</td><td>Total Station, Transit/Theodolite</td><td>All</td><td>Chain, Level Rod &amp; ALL Instruments</td></tr>
<tr><td><strong>Check Instrument Constants</strong></td><td>Total Station, Digital Level, GPS</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td><strong>Lens Cleaning</strong></td><td colspan="6">As needed — <strong>Camera cleaning kit only!</strong></td></tr>
</tbody>
</table>

<h3>Measurement Stability and Acclimation</h3>

<p>Optical total stations require sufficient time to adjust to the ambient temperature. The rule of thumb:</p>

<div style="background:#f0f4f8; padding:1rem; border-left:4px solid #2563eb; margin:1rem 0;">
  <strong>Temperature difference in °F = number of minutes required for acclimation</strong><br/>
  Example: inside truck = 70°F, outside = 40°F → 30°F difference → <strong>30 minutes</strong> acclimation before precision measurements.
</div>

<h3>Accuracy and Precision Guidelines</h3>

<ul>
  <li>Both accuracy <em>and</em> precision are key — with radial instruments there is little ability for redundant measurement checks</li>
  <li>The <strong>maximum layout and data collection distance</strong> with 5″ instruments shall be <strong>&lt; 600 feet</strong></li>
  <li>The <strong>resection function</strong> in data collectors shall use a minimum of <strong>3 points</strong> to provide a check</li>
  <li>Since elevation is always carried at the total station, always <strong>run a conventional level loop</strong> between control points after horizontal placement</li>
  <li>Horizontal and vertical control checks must be made at the <strong>beginning and ending of each new setup</strong> and throughout the day</li>
  <li>Always use a <strong>prism mounted on a tribrach and tripod</strong> as your backsight</li>
</ul>

<h3>Level Field Calibration — The Peg Test</h3>

<p>The <strong>peg test</strong> (also called the two-peg test) is the standard field calibration procedure for automatic (self-leveling) levels. It checks whether the line of sight is truly horizontal when the instrument is level.</p>

<ul>
  <li><strong>Weekly:</strong> Levels will be peg tested (and prior to starting a long bench circuit)</li>
  <li><strong>Yearly:</strong> Send in instrument to be cleaned and calibrated by a qualified shop</li>
  <li><strong>All field personnel</strong> must understand and be able to perform a peg test before being allowed to operate the level</li>
</ul>

<h3>Correction Schedule</h3>

<table>
<thead><tr><th>Frequency</th><th>Action</th></tr></thead>
<tbody>
<tr><td><strong>At each new occupation</strong></td><td>Check thermometer and enter temperature into the instrument (for atmospheric correction)</td></tr>
<tr><td><strong>Daily</strong></td><td>Check barometric pressure and verify it matches the chart for your local elevation (especially before long traverse legs)</td></tr>
<tr><td><strong>Weekly</strong></td><td>Check prism poles and bubbles for plumb; check extension sections for bends; verify Tru-plumb device if used</td></tr>
<tr><td><strong>Monthly</strong></td><td>Check the optical plummet (procedure below); occupy at least two known control monuments and make horizontal distance, vertical distance, and angular checks</td></tr>
<tr><td><strong>Yearly</strong></td><td>Send instrument and tribrachs to be cleaned and calibrated by a qualified repair shop</td></tr>
</tbody>
</table>

<h3>Optical Plummet Check Procedure</h3>

<ol>
  <li>Set up the instrument and level it over a ground mark so that the tripod height is about <strong>5.0 feet</strong></li>
  <li>Note the position of the inner circle of the optical plummet in relation to the ground mark</li>
  <li>Use a pencil and <strong>trace the outline of the tribrach base</strong> on top of the tripod</li>
  <li>Loosen the locking clamp and <strong>rotate the tribrach 120°</strong>; position it within the outline</li>
  <li>Level the instrument again, then <strong>mark a point on the ground</strong> with a dot. Repeat (another 120° rotation) and mark again</li>
  <li>If there is <strong>one point</strong> on the ground → the optical plummet is <strong>in adjustment</strong></li>
  <li>If there are <strong>three points</strong> on the ground → the tribrach must be <strong>sent in for cleaning and adjustment</strong></li>
</ol>

<hr/>

<h2>Keep it Clean — Daily Discipline</h2>

<ul>
  <li>Purchase a <strong>big-bristled, soft shaving brush</strong> and keep it in the instrument case</li>
  <li>Several times during the day, take out the brush and clean the instrument, then clean the brush before returning it to the case</li>
  <li><strong>Cans of compressed air</strong> can be used to remove dust</li>
  <li>If the instrument is splattered with mud or concrete, <strong>gently wipe it off with a damp rag as quickly as possible</strong></li>
  <li>Again — <strong>keep the case closed</strong></li>
</ul>

<hr/>

<h2>Looking Ahead</h2>

<p>Next week we move from instrument care to instrument <em>use</em> — specifically, the mathematics of traverse computation. You will learn how to convert raw field angles into azimuths, decompose traverse legs into latitudes and departures, and evaluate the error of closure. This is where the computational heart of land surveying begins.</p>
',

resources = '[
  {"title":"Trimble Total Station Care Guide","url":"https://www.trimble.com/support","type":"reference"},
  {"title":"Leica Instrument Maintenance Manual","url":"https://leica-geosystems.com/support","type":"reference"},
  {"title":"NOAA Magnetic Declination Calculator","url":"https://www.ngdc.noaa.gov/geomag/calculators/magcalc.shtml","type":"reference"},
  {"title":"TSPS Standards of Practice","url":"https://tsps.org","type":"reference"}
]'::jsonb,

videos = '[
  {"title":"Proper Surveying Instrument Care","url":"https://www.youtube.com/watch?v=survey_care_101"},
  {"title":"How to Perform a Peg Test on an Auto Level","url":"https://www.youtube.com/watch?v=peg_test_demo"},
  {"title":"Tripod Setup Best Practices","url":"https://www.youtube.com/watch?v=tripod_setup_best"}
]'::jsonb,

key_takeaways = ARRAY[
  'Always transport instruments in their case — never carry an instrument attached to the tripod',
  'Keep the empty instrument case closed to prevent dust accumulation that damages bearing surfaces',
  'Grasp instruments by the standards and tribrach, never by the telescope; secure to the tripod immediately',
  'Use only lens cleaning tissues and fluids — optical coatings scratch easily with common cloth',
  'Allow instruments to acclimate: 1 minute per degree Fahrenheit of temperature difference',
  'Use silicone-based lubricant on tripods and prism poles — petroleum lubricants attract dirt',
  'Spread tripod legs at least 36 inches apart, keep the head horizontal, and plant tips firmly',
  'Follow the minimum maintenance schedule: daily wipe-down, weekly calibration checks, yearly shop service',
  'Perform peg tests on levels weekly and before any long bench circuit',
  'Check the optical plummet monthly using the 120° rotation method'
]

WHERE id = 'acc03b04-0000-0000-0000-000000000001';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. TOPICS
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM learning_topics WHERE lesson_id = 'acc03b04-0000-0000-0000-000000000001';

INSERT INTO learning_topics (id, lesson_id, title, content, order_index, keywords) VALUES

('acc03a04-0001-0000-0000-000000000001', 'acc03b04-0000-0000-0000-000000000001',
 'Instrument Transport and Handling',
 'Surveying instruments must always be transported in their cases between setups and in vehicles. Never carry an instrument while it is attached to the tripod — this is the single most common cause of instrument damage. The correct method is tripod over one shoulder, case in the other hand. Empty cases must remain closed to prevent dust from accumulating inside; dust that collects in an open case will penetrate bearing surfaces when the instrument is returned, requiring expensive cleaning. When placing an instrument on the tripod, grasp it by the standards and tribrach — never by the telescope. Secure it immediately; do not allow it to sit unclamped even momentarily. Attach the instrument just snug enough to prevent movement but not so tight that the tripod head or spring plate warps. Lens care requires only proper cleaning tissues and fluids; all lenses have soft optical coatings that common cloths will scratch. Never force any instrument motion — clamps should be micrometer-snug, rotation should use fingertips, and if screws are too tight, a qualified technician should readjust them.',
 1,
 ARRAY['transport','case','tripod','grip','standards','tribrach','telescope','lens','optical coating','cleaning','motion','clamp','fingertips','dust','bearing surfaces']),

('acc03a04-0002-0000-0000-000000000001', 'acc03b04-0000-0000-0000-000000000001',
 'Environmental Protection and Weather',
 'Weather protection requires constant vigilance. In temporary showers, cover the instrument with the provided plastic hood. Wipe the tripod dry afterward but let the instrument air dry — do not rub the finish. Never store a wet instrument in an airtight case overnight; moisture will condense on internal surfaces. Leave the case open for air circulation. For continuous outdoor use in extreme temperatures, store the instrument overnight in its closed case outside to avoid temperature-change condensation. When transporting from a different temperature, allow acclimation time: at least one minute per degree Fahrenheit of temperature difference (e.g., 70°F truck to 40°F outside = 30 minutes). Electronic instruments require extra precautions because contacts, wires, and chips are susceptible to corrosion from humidity, especially salt-laden moisture near coastal areas. Instruments used near salt water should be professionally conditioned for that environment. Never leave instruments unattended — a modern robotic total station costs $30,000–$60,000 and is an attractive theft target.',
 2,
 ARRAY['weather','rain','moisture','plastic hood','condensation','air dry','acclimation','temperature','electronic','salt water','corrosion','contacts','theft','unattended']),

('acc03a04-0003-0000-0000-000000000001', 'acc03b04-0000-0000-0000-000000000001',
 'Tripod Care and Setup',
 'Tripods are often neglected but are critical to measurement accuracy. They consist of a head, wooden or metal legs, and metal points with foot pads. Setup rules: spread legs at least 36 inches evenly apart, keep the head horizontal (a tilted head overextends leveling screws and causes errors), and plant tips firmly by pushing directly longitudinal to each leg without flexing. On smooth floors, use chain, rope, carpet, or triangular plywood to prevent slipping. On hot asphalt, place lath or bricks under leg tips to prevent sinking. In high winds or near traffic, use sandbags or weights on the leg tips. Keep leg hinges properly tensioned — a leg extended horizontally should fall slowly, not stay rigid (too tight, causes wear) or drop immediately (too loose, causes angular errors). Secure adjustable-leg clamps to prevent slipping. Lubricate joints with silicone spray, never petroleum lubricants that attract dirt. Clean mud from leg points between uses with cloths and a wire brush. Protect the tripod head from dents and scratches that would prevent the instrument from fitting accurately. Transport tripods separately from other equipment.',
 3,
 ARRAY['tripod','legs','head','horizontal','36 inches','firm','asphalt','lath','sandbags','wind','tension','adjustable','clamp','silicone','lubricate','clean','head protection','transport']),

('acc03a04-0004-0000-0000-000000000001', 'acc03b04-0000-0000-0000-000000000001',
 'Maintenance Schedules and Field Calibration',
 'A minimum maintenance schedule governs all surveying equipment. Daily: wipe chain, tripod, level rod, and prism pole clean; check instrument constants on total station, digital level, and GPS; check prism pole bubble calibration. Weekly: deep clean level rod and prism pole; check auto level and tribrach calibration; perform peg test on levels (and before any long bench circuit). Monthly: deep clean tripod and laser; lubricate tripod, level rod, and prism pole with dry Teflon/silicone spray; check laser calibration; check the optical plummet using the 120° rotation method; occupy at least two known control monuments for distance, elevation, and angular checks. Yearly or at seasonal temperature changes: deep clean all equipment; check calibration on total station and transit/theodolite; send instruments and tribrachs to a qualified shop for professional cleaning and calibration. At the start of every new job: deep clean and calibrate all equipment. Lens cleaning is done as needed using a camera cleaning kit only. The acclimation rule requires one minute per degree Fahrenheit of temperature difference before precision measurements. Maximum shot distance with 5-inch instruments is 600 feet. The resection function requires a minimum of 3 points for a check.',
 4,
 ARRAY['maintenance schedule','daily','weekly','monthly','yearly','peg test','optical plummet','calibration','deep clean','lubricate','silicone','Teflon','instrument constants','acclimation','resection','600 feet','control monuments']);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. QUIZ QUESTIONS (16 questions)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM question_bank
WHERE lesson_id = 'acc03b04-0000-0000-0000-000000000001'
  AND tags @> ARRAY['acc-srvy-1341','week-4'];

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- Q1  Multiple Choice  Easy
('What is the correct way to move a surveying instrument between setups?',
 'multiple_choice',
 '["Carry the instrument on the tripod over your shoulder","Leave the instrument on the tripod and drive slowly","Carry the tripod on one shoulder and the instrument case in the other hand","Have two people carry the instrument on the tripod"]'::jsonb,
 'Carry the tripod on one shoulder and the instrument case in the other hand',
 'The instrument must always be transported in its case between setups. Never carry an instrument while it is attached to the tripod — this is the most common cause of instrument damage. The correct method is tripod over one shoulder, instrument case in the other hand.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','transport','case']),

-- Q2  True/False  Easy
('It is acceptable to leave the instrument case open while the instrument is set up on the tripod.',
 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'Leaving the case open allows dust to collect inside. When the instrument is returned to the case, the dust creates a storm-like environment inside, eventually penetrating bearing surfaces and requiring expensive cleaning and repair. Always keep the empty case closed.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','case','dust']),

-- Q3  Multiple Choice  Easy
('When placing a surveying instrument on the tripod, you should grasp it by the:',
 'multiple_choice',
 '["Telescope","Eyepiece and objective lens","Standards and tribrach","Horizontal clamp knob"]'::jsonb,
 'Standards and tribrach',
 'The standards (the upright supports) and the tribrach (the base) are the strongest structural parts of the instrument. Grasping the telescope risks bending it or disturbing the optical alignment. The instrument must be secured to the tripod immediately after placement — never leave it sitting unclamped.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','grip','standards','tribrach']),

-- Q4  True/False  Easy
('Common cloth is acceptable for cleaning surveying instrument lenses.',
 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'All surveying lenses have soft optical coatings that improve light transmission. Common cloth (or paper towels, tissues, etc.) can scratch these coatings. Only lens cleaning tissues and fluids designed for optical instruments should be used — essentially a camera cleaning kit.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','lens','optical-coating']),

-- Q5  Multiple Choice  Medium
('After an instrument gets wet in the field, you should:',
 'multiple_choice',
 '["Immediately seal it in its airtight case to protect it","Wipe it vigorously to remove all moisture quickly","Allow it to air dry with the case lid open for circulation","Place it in front of a heater to speed drying"]'::jsonb,
 'Allow it to air dry with the case lid open for circulation',
 'Sealing a wet instrument in an airtight case causes moisture to condense on internal surfaces. Vigorous wiping can damage the finish. Excessive heat can warp components or damage electronics. The correct procedure is to allow the instrument to air dry naturally with the case open so air can circulate around it.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','moisture','drying']),

-- Q6  Numeric Input  Medium
('The temperature inside a survey truck is 75°F. The outside working temperature is 35°F. Using the acclimation rule of thumb, how many minutes should you wait before taking precision measurements?',
 'numeric_input',
 '[]'::jsonb,
 '40',
 'Acclimation time = temperature difference in °F = 75 − 35 = 40°F = 40 minutes. This allows the optical components and mechanical parts to gradually adjust to the ambient temperature, preventing condensation and thermal distortion.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','acclimation','temperature','computation']),

-- Q7  Multiple Choice  Medium
('Which lubricant is recommended for tripod joints and prism poles?',
 'multiple_choice',
 '["Motor oil","WD-40","Silicone-based spray","Petroleum grease"]'::jsonb,
 'Silicone-based spray',
 'Silicone-based lubricant (silicone spray) is recommended because it does not attract dirt. Petroleum-based lubricants like oil, grease, and WD-40 attract and hold dust and grit, which accelerates wear on moving parts. Silicone spray also works well for prism poles and steel tapes.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','lubricant','silicone','tripod']),

-- Q8  Multiple Choice  Medium
('The minimum distance between tripod leg tips when setting up should be:',
 'multiple_choice',
 '["18 inches","24 inches","36 inches","48 inches"]'::jsonb,
 '36 inches',
 'Tripod legs must be spread at least 36 inches evenly apart to provide a stable foundation. This wide base resists tipping from wind, vibration, or accidental contact. The tips must be firmly planted, even for temporary setups.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','tripod','leg-spread','36-inches']),

-- Q9  True/False  Medium
('When setting up on hot asphalt, you should push the tripod legs directly into the surface for maximum stability.',
 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'On hot asphalt, the tripod legs will quickly sink into the softened surface, causing the instrument to settle and shift out of level during measurements. Instead, place a piece of lath or a brick under each leg tip to distribute the weight and prevent sinking.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','asphalt','tripod','setup']),

-- Q10  Multiple Choice  Medium
('How often should a peg test be performed on an automatic level?',
 'multiple_choice',
 '["Daily","Weekly and before long bench circuits","Monthly","Only when the instrument is new"]'::jsonb,
 'Weekly and before long bench circuits',
 'Levels must be peg tested weekly and prior to starting any long bench circuit. The peg test checks whether the line of sight is truly horizontal when the instrument is level. All field personnel must understand and be able to perform a peg test before being allowed to operate the level.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','peg-test','level','calibration']),

-- Q11  Numeric Input  Hard
('A surveyor stores the total station in an office at 72°F overnight. The morning field temperature is 28°F. How many minutes of acclimation time are needed? After acclimation, the maximum shot distance with a 5-second instrument is how many feet? Give the acclimation time only.',
 'numeric_input',
 '[]'::jsonb,
 '44',
 'Acclimation time = |72 − 28| = 44°F = 44 minutes. The maximum shot distance with a 5-second instrument is 600 feet. Both of these values are standard operating parameters that must be observed for precision measurements.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','acclimation','600-feet','hard']),

-- Q12  Multiple Choice  Hard
('During the optical plummet check procedure, the tribrach is rotated in increments of:',
 'multiple_choice',
 '["45°","90°","120°","180°"]'::jsonb,
 '120°',
 'The optical plummet check uses three positions: the original, then two rotations of 120° each (for a total of 360°). At each position, the instrument is leveled and a point is marked on the ground. If all three marks coincide (one point), the plummet is in adjustment. If there are three distinct points, the tribrach must be sent for cleaning and adjustment.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','optical-plummet','120-degrees','calibration']),

-- Q13  Multiple Choice  Hard
('Electronic surveying instruments used near salt water require what special precaution?',
 'multiple_choice',
 '["They should be wrapped in plastic during use","They should be taken to a repair shop to be conditioned for salt air exposure","They only need extra lens cleaning","No special precaution is needed with modern instruments"]'::jsonb,
 'They should be taken to a repair shop to be conditioned for salt air exposure',
 'Salt-laden humidity near sea water can penetrate an instrument and corrode electrical contacts, wires, and circuit boards. Electronic instruments that will be used in coastal or maritime environments should be taken to a qualified repair shop to be professionally conditioned for that specific exposure.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','electronic','salt-water','corrosion']),

-- Q14  Essay  Hard
('Describe the complete procedure for checking an optical plummet. Include: (a) the initial setup requirements, (b) the rotation increments and what is done at each position, (c) how to interpret the results, and (d) what action to take if the plummet is out of adjustment.',
 'essay',
 '[]'::jsonb,
 'Key points: (a) Set up the instrument and level it over a ground mark with tripod height approximately 5.0 feet. Note the position of the optical plummet inner circle relative to the ground mark. (b) Trace the outline of the tribrach base on the tripod head with a pencil. Loosen the locking clamp and rotate the tribrach 120°, position within the outline, level the instrument exactly, then mark a point on the ground directly below the plummet. Repeat for another 120° rotation (total 240° from original). (c) If there is one point on the ground (all three marks coincide), the optical plummet is in adjustment. If there are three distinct points, the plummet is out of adjustment. (d) If out of adjustment, the tribrach must be sent to a qualified repair shop for cleaning and adjustment — do not attempt field adjustment of the optical plummet.',
 'A complete answer covers all four parts with specific details about the 120° rotation, the tribrach outline tracing, the leveling at each position, and the pass/fail interpretation.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','essay','optical-plummet','procedure']),

-- Q15  Essay  Medium
('Explain why the tripod head must be set up in a horizontal position. What happens if it is significantly tilted, and how does this affect measurements?',
 'essay',
 '[]'::jsonb,
 'Key points: The tripod head must be approximately horizontal so that the leveling screws on the instrument (or tribrach) operate within their designed range. If the head is significantly tilted, the leveling screws must be overextended to compensate — they may reach the end of their travel before the instrument is truly level, or the instrument may appear level but actually have residual tilt beyond the compensator range. An unlevel instrument produces systematic errors in both horizontal angles and vertical angles/elevations. The dual-axis compensator in modern total stations has a limited range (typically ±3 to ±6 minutes); if the instrument tilt exceeds this range, the compensator cannot correct it and all measurements will contain errors.',
 'A good answer explains the mechanical limitation of leveling screws, the compensator range, and the resulting measurement errors.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','essay','tripod','horizontal','leveling']),

-- Q16  True/False  Hard
('When storing a surveying instrument overnight for continuous outdoor field use in cold weather, you should bring it inside to a warm building to protect it.',
 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'For continuous outdoor use in extreme temperatures, the instrument should be stored overnight in its closed case OUTSIDE so there is no significant temperature change. Bringing it inside creates a large temperature differential — when taken back outside, condensation will form inside the instrument. If the instrument is wet, leave the case open for air circulation.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','climatize','storage','condensation']);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. PRACTICE PROBLEMS (20 problems)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- ── Transport & Handling (5 problems) ─────────────────────────────────────

-- P1
('Practice: A new field technician is about to carry the total station from the truck to the first setup point. They pick up the instrument (still on the tripod) and start walking. What should you tell them, and why?',
 'essay', '[]'::jsonb,
 'Stop immediately. Never carry an instrument while it is attached to the tripod. This is the most common cause of instrument damage because (1) the combined weight is awkward and increases the risk of dropping, (2) vibrations from walking stress the instrument connections, (3) branches or doorframes can strike the telescope. The correct method: remove the instrument from the tripod, place it in its case, carry the tripod over one shoulder and the case in the other hand.',
 'A good answer identifies the specific danger, explains why, and describes the correct procedure.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','transport','safety']),

-- P2
('Practice: You notice the instrument case is sitting open on the ground while the total station is set up on the tripod nearby. The party chief asks you to close it. Explain why this matters.',
 'essay', '[]'::jsonb,
 'An open case collects dust, dirt, and debris from the field environment. When the instrument is later returned to the case and carried, the accumulated material creates a dust storm inside the closed case. Over time, fine particles penetrate the bearing surfaces, horizontal and vertical motion assemblies, and optical elements of the instrument, causing sticking motions and degraded performance. The result is an expensive professional cleaning and repair bill. Keeping the empty case closed at all times is a simple habit that prevents significant long-term damage.',
 'A complete answer explains the dust accumulation mechanism, the damage to bearing surfaces, and the cost consequence.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','case','dust','bearing']),

-- P3
('Practice: A technician is having difficulty rotating the horizontal tangent screw on the total station. It feels very stiff. What should they do?',
 'multiple_choice',
 '["Apply WD-40 to the screw","Force it with pliers","Check that the horizontal clamp is loosened first; if still stiff, arrange for readjustment by a qualified technician","Remove the plate and lubricate the internal mechanism"]'::jsonb,
 'Check that the horizontal clamp is loosened first; if still stiff, arrange for readjustment by a qualified technician',
 'The most common reason for stiff rotation is that the clamp is still engaged. If the clamp is loose and the motion is still stiff, the instrument needs professional attention. Never force any instrument motion, never apply petroleum lubricants to precision mechanisms, and never remove plates or make internal adjustments without thorough understanding.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','motion','clamp','technician']),

-- P4
('Practice: What type of cleaning supplies should be kept in every instrument case? List at least three items.',
 'essay', '[]'::jsonb,
 'Every instrument case should contain: (1) A big-bristled, soft shaving brush for dusting the instrument several times daily (clean the brush before returning it to the case). (2) Lens cleaning tissues designed for optical instruments (not regular tissues). (3) Lens cleaning fluid formulated for optical coatings. (4) Optionally: a can of compressed air for removing dust from hard-to-reach areas. (5) A soft, lint-free cloth for exterior wiping. These are essentially the components of a camera cleaning kit adapted for surveying instruments.',
 'A good answer lists at least three items and explains why specialized optical supplies are required.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','cleaning','supplies','brush']),

-- P5
('Practice: Identify three things that are WRONG in this scenario: A surveyor grabs the total station by the telescope, sets it on top of the tripod without clamping it, then reaches for the leveling screws while the instrument sits unsecured.',
 'essay', '[]'::jsonb,
 'Three errors: (1) Grasping by the telescope — should grasp by the standards and tribrach. The telescope is a precision optical assembly that can be bent or misaligned by handling. (2) Setting on tripod without immediately securing — the instrument must be clamped to the tripod the instant it is placed on the head. An unsecured instrument can slide off and fall. (3) Reaching for leveling screws while instrument is unclamped — any movement near the tripod could bump the unsecured instrument off the head. Correct sequence: grasp by standards/tribrach, place on tripod, immediately tighten the centering screw to secure it, THEN proceed with leveling.',
 'A complete answer identifies all three errors and explains the correct procedure.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','handling','errors','grip']),

-- ── Environmental Protection (5 problems) ─────────────────────────────────

-- P6
('Practice: It is a July afternoon in Houston (95°F, high humidity). The survey truck''s air conditioning keeps the cab at 68°F. How many minutes should the crew wait after removing the total station from the truck before taking precision measurements?',
 'numeric_input', '[]'::jsonb,
 '27',
 'Acclimation time = |95 − 68| = 27°F = 27 minutes. In Houston''s humidity, it is especially important to allow full acclimation because moisture can condense on cold optical surfaces when a cold instrument is exposed to warm, humid air.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','acclimation','temperature']),

-- P7
('Practice: A sudden rainstorm hits while the total station is set up over a control point. The crew cannot move the instrument immediately. What should they do to protect it?',
 'multiple_choice',
 '["Quickly disassemble and put in the case","Cover it with the plastic rain hood provided with the instrument","Hold an umbrella over it while continuing to work","Do nothing — modern instruments are waterproof"]'::jsonb,
 'Cover it with the plastic rain hood provided with the instrument',
 'The plastic rain hood is specifically designed to protect the instrument while it remains on the tripod. It shields the optics, electronics, and mechanical parts from rain while allowing the setup to be preserved. After the rain, wipe the tripod dry but allow the instrument to air dry naturally — do not store it wet in a sealed case.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','rain','hood','protection']),

-- P8
('Practice: A survey crew is working on a bridge project along the Texas Gulf Coast. What special precaution must they take with their electronic total station?',
 'essay', '[]'::jsonb,
 'Electronic instruments used near salt water require professional conditioning. The salt elements in coastal humidity can penetrate the instrument and corrode electrical contacts, wires, circuit boards, and other electronic components. Before deploying to a salt-water environment, the instrument should be taken to a local repair shop to be conditioned for the salt air exposure. Additional daily precautions include wiping the instrument dry after each use, avoiding leaving it exposed to salt spray, and storing it in a controlled environment whenever possible.',
 'A complete answer mentions professional conditioning, identifies salt corrosion of electronics, and suggests daily protective measures.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','salt-water','electronic','corrosion']),

-- P9
('Practice: It is January in North Texas. Overnight low was 25°F. The crew stored the total station in the heated office (70°F) overnight. They arrive at the site at 7:00 AM with a field temperature of 30°F. (a) How many minutes of acclimation? (b) What is the earliest time they can begin precision measurements?',
 'short_answer', '[]'::jsonb,
 '(a) 40 minutes; (b) 7:40 AM',
 'Acclimation = |70 − 30| = 40°F = 40 minutes. If they arrive at 7:00 AM and begin acclimation immediately, precision measurements can begin at 7:40 AM. For continuous cold-weather work, the better practice is to store the instrument overnight in its case OUTSIDE to avoid this delay entirely.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','acclimation','cold-weather','time']),

-- P10
('Practice: Why should you NOT store a wet instrument in a sealed, airtight case overnight?',
 'essay', '[]'::jsonb,
 'A sealed case traps the moisture. As temperatures change overnight, the moisture will condense on the internal surfaces of the instrument — on lenses, circuit boards, mechanical bearings, and optical components. This internal condensation can cause: (1) fog on lenses that impairs sighting, (2) corrosion of electrical contacts and circuits, (3) moisture in bearing surfaces that attracts dirt and causes sticking. The correct procedure is to leave the case open overnight so air can circulate around the instrument and allow it to dry naturally.',
 'A good answer explains the condensation mechanism and identifies at least two types of damage.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','moisture','condensation','storage']),

-- ── Tripod Care & Setup (5 problems) ──────────────────────────────────────

-- P11
('Practice: You are setting up a total station on a smooth concrete warehouse floor. What should you use to prevent the tripod legs from slipping?',
 'multiple_choice',
 '["Push the legs harder into the floor","Use rubber-tipped tripod legs only","Use chain, rope, carpet pieces, or triangular plywood with holes at the points","Tape the legs to the floor"]'::jsonb,
 'Use chain, rope, carpet pieces, or triangular plywood with holes at the points',
 'On smooth floors, metal tripod tips have nothing to grip. A chain or rope connecting the three leg tips prevents them from spreading. Carpet pieces or triangular plywood (with holes at the vertices for the leg tips) provide friction. These simple devices prevent the tripod from slipping, which could damage the instrument.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','tripod','smooth-floor','slipping']),

-- P12
('Practice: A new crew member sets up the tripod with the head severely tilted to one side. The instrument operator then spends 10 minutes trying to level the instrument. Explain the problem and the correct approach.',
 'essay', '[]'::jsonb,
 'When the tripod head is not approximately horizontal, the leveling screws must be overextended to compensate. This may exceed their travel range, making it impossible to achieve a true level. Even if the instrument appears level, the compensator may be operating near the edge of its range (typically ±3'' to ±6''), reducing accuracy. The correct approach: before placing the instrument, adjust the tripod legs so the head is approximately horizontal (visually parallel to the ground). This keeps the leveling screws near their mid-range, allowing fine adjustment to achieve a precise level quickly.',
 'A complete answer explains the overextension of leveling screws, compensator range, and the correct tripod head positioning.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','tripod','horizontal','leveling']),

-- P13
('Practice: You are surveying along a busy highway. An 18-wheeler passes and the instrument vibrates noticeably. What setup modification should be made to prevent the instrument from toppling?',
 'multiple_choice',
 '["Move further from the road","Use sandbags or weights on the tripod leg tips","Set the tripod legs closer together for stability","Hold the tripod during measurements"]'::jsonb,
 'Use sandbags or weights on the tripod leg tips',
 'High winds and traffic gusts (especially from large trucks) can topple a tripod and destroy an expensive instrument. Sandbags or weights attached to each tripod leg tip add mass at the base, dramatically increasing stability. Moving further from the road is also helpful if possible, but sandbags provide direct protection regardless of distance.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','wind','sandbags','highway']),

-- P14
('Practice: How can you test whether a tripod''s leg hinges are properly tensioned? Describe the test and what the correct, too-tight, and too-loose results look like.',
 'essay', '[]'::jsonb,
 'Test: Extend one leg straight out from the tripod head horizontally. Release it and observe. Correct tension: the leg falls slowly or swings gently to the ground — the hinge provides controlled resistance. Too tight: the leg stays horizontal or nearly so — this causes excessive wear on the hinge. Too loose: the leg drops immediately — loose legs allow unintended rotation in the tripod head, producing angular alignment errors in measurements. Adjustment screws on the hinges should be tightened or loosened to achieve the correct tension.',
 'A good answer describes the horizontal extension test and correctly identifies all three outcomes.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','tripod','tension','hinges']),

-- P15
('Practice: It is a hot August day in Austin (105°F) and you need to set up on an asphalt parking lot. What problem will you encounter and how do you solve it?',
 'short_answer', '[]'::jsonb,
 'The tripod legs will sink into the softened asphalt, causing settlement and level changes during measurements. Solution: place a piece of lath or a brick under each tripod leg tip to distribute weight and prevent sinking.',
 'A correct answer identifies asphalt softening and the lath/brick solution.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','asphalt','hot','lath']),

-- ── Maintenance & Calibration (5 problems) ────────────────────────────────

-- P16
('Practice: According to the minimum maintenance schedule, how often should the prism pole bubble be checked for calibration?',
 'multiple_choice',
 '["Weekly","Monthly","Daily","Only when new"]'::jsonb,
 'Daily',
 'The prism pole bubble must be checked daily because it determines whether the prism is held truly vertical over the point. A misaligned bubble means the prism is tilted, introducing position errors proportional to the pole height and the tilt angle. This is a quick check that takes only seconds.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','prism-pole','bubble','daily']),

-- P17
('Practice: List the maintenance items that should be performed WEEKLY according to the minimum maintenance schedule.',
 'essay', '[]'::jsonb,
 'Weekly maintenance items: (1) Wipe clean — all equipment. (2) Deep clean — level rod and prism pole. (3) Check and correct calibration — auto level and tribrach. (4) Perform a peg test on all levels (also required before starting any long bench circuit). These weekly tasks catch calibration drift before it affects multiple days of work.',
 'A complete answer lists all four weekly items from the maintenance schedule.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','maintenance','weekly','schedule']),

-- P18
('Practice: During the optical plummet check, you end up with three distinct points on the ground after the three positions. What does this mean and what must you do?',
 'short_answer', '[]'::jsonb,
 'Three distinct points mean the optical plummet is out of adjustment — it does not point directly below the instrument when leveled. The tribrach must be sent to a qualified repair shop for cleaning and adjustment. Do not attempt field repair.',
 'A correct answer identifies the out-of-adjustment condition and the need for professional repair.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','optical-plummet','three-points']),

-- P19
('Practice: What is the maximum distance at which measurements should be taken with a 5-second total station for layout and data collection? Why is this limit important?',
 'short_answer', '[]'::jsonb,
 '600 feet. At distances beyond 600 feet, the angular uncertainty of a 5-second instrument produces position errors that may exceed acceptable tolerances. A 5-second angular error at 600 feet produces a lateral offset of about 0.015 feet (5 × sin(1") × 600 ≈ 0.015 ft), which is near the limit for many layout applications.',
 'A correct answer states 600 feet and explains the relationship between angular accuracy and distance.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','600-feet','5-second','distance']),

-- P20
('Practice: A crew is about to start a new boundary survey project. According to the maintenance schedule, what must be done to ALL equipment before beginning work?',
 'essay', '[]'::jsonb,
 'At the start of a new job, ALL equipment must receive: (1) Wipe clean — every piece of equipment. (2) Deep clean — all equipment. (3) Check and correct calibration — all instruments, chains, level rods, tribrachs, prism poles, and accessories. This ensures that no calibration drift or damage from the previous project carries over. It is essentially a complete reset of all equipment to known-good condition. Additionally, any new chain, level rod, or instrument must be calibrated before first use.',
 'A complete answer lists deep cleaning and full calibration of all equipment at the start of a new job.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-4','practice','new-job','calibration','maintenance']);


-- ────────────────────────────────────────────────────────────────────────────
-- 5. FLASHCARDS (25)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM flashcards WHERE lesson_id = 'acc03b04-0000-0000-0000-000000000001';

INSERT INTO flashcards (id, term, definition, hint_1, hint_2, hint_3, module_id, lesson_id, keywords, tags, category) VALUES

('fc040001-0000-0000-0000-000000000001',
 'Never Carry Instrument on Tripod',
 'Never carry a surveying instrument while it is attached to the tripod. This is the most common cause of instrument damage. The correct method: remove the instrument, place it in its case, carry the tripod on one shoulder and the case in the other hand.',
 'The instrument should always be in its case during transport',
 'Walking vibrations and obstacles (branches, doorframes) can damage an attached instrument',
 'Two separate carries: tripod + case, never combined',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['transport','carry','tripod','case','damage'],
 ARRAY['acc-srvy-1341','week-4','instrument-care'], 'surveying'),

('fc040002-0000-0000-0000-000000000001',
 'Keep Empty Case Closed',
 'Always keep the instrument case closed when the instrument is on the tripod. An open case collects dust that later penetrates bearing surfaces when the instrument is returned, causing sticking and requiring expensive cleaning.',
 'Dust in an open case = dust storm when you put the instrument back',
 'Dirt penetrates bearing surfaces and motions',
 'Simple habit that prevents expensive repairs',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['case','closed','dust','bearing surfaces','cleaning'],
 ARRAY['acc-srvy-1341','week-4','instrument-care'], 'surveying'),

('fc040003-0000-0000-0000-000000000001',
 'Grasp by Standards and Tribrach',
 'When placing an instrument on the tripod, grasp it by the standards (upright supports) and tribrach (base) — never by the telescope or other parts. Secure it to the tripod immediately; never leave it sitting unclamped.',
 'Standards and tribrach are the strongest structural parts',
 'Grasping the telescope can bend or misalign it',
 'Clamp it the instant it touches the tripod head',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['grip','standards','tribrach','telescope','secure','clamp'],
 ARRAY['acc-srvy-1341','week-4','instrument-care'], 'surveying'),

('fc040004-0000-0000-0000-000000000001',
 'Lens Care — Optical Coatings',
 'Never touch lenses with fingers or common cloth. Use only lens cleaning tissues and fluids designed for optical instruments. All surveying lenses have soft optical coatings that improve light transmission — common materials will scratch them.',
 'Think of it as a camera lens — same care required',
 'Fingerprints leave oils that degrade coatings over time',
 'Essentially a camera cleaning kit: tissues + fluid only',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['lens','optical coating','cleaning','tissues','fluid','camera kit'],
 ARRAY['acc-srvy-1341','week-4','instrument-care'], 'surveying'),

('fc040005-0000-0000-0000-000000000001',
 'Never Force Any Motion',
 'Instrument clamps should be just snug (micrometer tight), not overtightened. When rotating, ensure the clamp is loose first. Rotate gently with fingertips, not forcefully with a grip. If screws are too tight, have a qualified technician readjust.',
 'Micrometer-snug: just enough to prevent unwanted rotation',
 'Fingertips for rotation, never a forceful grip',
 'Stiff screws = technician, not more force',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['clamp','snug','micrometer','fingertips','force','technician','motion'],
 ARRAY['acc-srvy-1341','week-4','instrument-care'], 'surveying'),

('fc040006-0000-0000-0000-000000000001',
 'Acclimation Rule of Thumb',
 'When transporting an instrument between environments of different temperatures, allow at least one minute per degree Fahrenheit of temperature difference before taking precision measurements. Example: 70°F truck to 40°F field = 30 minutes acclimation.',
 '1 minute per 1°F of temperature difference',
 'Prevents condensation and thermal distortion of optics',
 '70°F inside, 40°F outside = 30 minutes wait',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['acclimation','temperature','minutes','degrees','condensation','thermal'],
 ARRAY['acc-srvy-1341','week-4','instrument-care'], 'surveying'),

('fc040007-0000-0000-0000-000000000001',
 'Wet Instrument Storage',
 'Never store a wet instrument in a sealed, airtight case. Moisture will condense on internal lenses, circuits, and bearings overnight. Instead, leave the case open so air can circulate and the instrument can dry naturally.',
 'Sealed case + moisture = internal condensation',
 'Condensation fogs lenses and corrodes electronics',
 'Open case = air circulation = natural drying',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['wet','storage','condensation','sealed case','air dry','open case'],
 ARRAY['acc-srvy-1341','week-4','instrument-care'], 'surveying'),

('fc040008-0000-0000-0000-000000000001',
 'Climatize for Outdoor Use',
 'For continuous outdoor work in extreme temperatures, store the instrument overnight in its closed case OUTSIDE. This prevents a large temperature differential when taken to the field, avoiding condensation. Exception: if the instrument is wet, leave the case open for air circulation.',
 'Keep the instrument at the working temperature overnight',
 'Bringing it inside creates the condensation problem you''re trying to avoid',
 'Wet instrument = open case; dry instrument = closed case outside',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['climatize','overnight','outdoor','temperature','condensation','storage'],
 ARRAY['acc-srvy-1341','week-4','instrument-care'], 'surveying'),

('fc040009-0000-0000-0000-000000000001',
 'Electronic Instruments — Salt Water',
 'Electronic instruments near salt water must be professionally conditioned by a repair shop. Salt-laden coastal humidity penetrates the instrument and corrodes electrical contacts, wires, and circuit boards. Standard weatherproofing is not sufficient for salt air.',
 'Salt air corrodes electrical contacts',
 'Professional conditioning is required BEFORE deployment',
 'This applies to total stations, GPS receivers, and digital levels',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['electronic','salt water','corrosion','contacts','conditioning','coastal'],
 ARRAY['acc-srvy-1341','week-4','instrument-care'], 'surveying'),

('fc040010-0000-0000-0000-000000000001',
 'Tripod Leg Spread — 36 Inches Minimum',
 'Always spread tripod legs at least 36 inches evenly apart and plant tips firmly, even for temporary setups. Never lean a tripod against vehicles, buildings, or trees. A wide, stable base prevents tipping from wind, vibration, or accidental contact.',
 '36 inches minimum between leg tips',
 'Even for "just a moment" setups — always spread and plant',
 'Leaning a tripod invites falls that damage the head',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['tripod','36 inches','spread','legs','firm','stable','lean'],
 ARRAY['acc-srvy-1341','week-4','tripod'], 'surveying'),

('fc040011-0000-0000-0000-000000000001',
 'Tripod Head Must Be Horizontal',
 'Place the tripod head in an approximately horizontal position before mounting the instrument. A tilted head overextends the leveling screws, making it harder (or impossible) to level the instrument. If the instrument is not level, measurement errors occur.',
 'Adjust leg lengths to level the head BEFORE placing the instrument',
 'A tilted head forces leveling screws to their limits',
 'If the compensator is out of range, all measurements have errors',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['tripod','head','horizontal','leveling screws','compensator','level'],
 ARRAY['acc-srvy-1341','week-4','tripod'], 'surveying'),

('fc040012-0000-0000-0000-000000000001',
 'Hot Asphalt Setup',
 'On hot days, tripod legs sink into softened asphalt, causing the instrument to settle and shift out of level. Solution: place a piece of lath or a brick under each leg tip to distribute weight and prevent sinking.',
 'Texas summers + asphalt = sinking tripod',
 'Lath or bricks under each leg tip',
 'Settlement causes level changes mid-measurement',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['asphalt','hot','sinking','lath','brick','settlement','level'],
 ARRAY['acc-srvy-1341','week-4','tripod'], 'surveying'),

('fc040013-0000-0000-0000-000000000001',
 'Sandbags for Wind Protection',
 'In high winds or near busy roads (18-wheelers), use sandbags or weights on tripod leg tips to prevent the instrument from toppling. A single wind gust can knock a $30,000+ total station to the ground.',
 'Sandbags on each of the three leg tips',
 'Truck wind gusts are sudden and powerful',
 'The cost of sandbags vs. the cost of a destroyed total station: no contest',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['sandbags','wind','18-wheeler','topple','weights','protection'],
 ARRAY['acc-srvy-1341','week-4','tripod'], 'surveying'),

('fc040014-0000-0000-0000-000000000001',
 'Tripod Leg Tension Test',
 'Extend a leg straight out horizontally from the tripod head. Correct tension: leg falls slowly to the ground. Too tight: leg stays horizontal (causes excessive wear). Too loose: leg drops immediately (causes angular alignment errors from rotation in the head).',
 'Horizontal extension test — watch how the leg falls',
 'Slow fall = correct; stays up = too tight; drops fast = too loose',
 'Loose legs = angular errors; tight legs = premature wear',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['tension','leg','hinge','test','horizontal','angular error','wear'],
 ARRAY['acc-srvy-1341','week-4','tripod'], 'surveying'),

('fc040015-0000-0000-0000-000000000001',
 'Silicone Lubricant for Tripods',
 'Use silicone-based lubricant (silicone spray) on tripod joints, prism poles, and steel tapes. Silicone does not attract dirt like petroleum lubricants (oil, grease, WD-40). It prevents wear, keeps adjustable legs from sticking, and maintains smooth operation.',
 'Silicone = good; Petroleum = attracts dirt',
 'Also great for prism poles and steel tapes',
 'WD-40 is a petroleum product — not recommended for precision equipment',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['silicone','lubricant','petroleum','WD-40','tripod','prism pole','steel tape'],
 ARRAY['acc-srvy-1341','week-4','tripod'], 'surveying'),

('fc040016-0000-0000-0000-000000000001',
 'Smooth Floor Setup',
 'On smooth concrete or tile floors, tripod legs will slip. Solutions: chain or rope connecting the three leg tips, carpet pieces under each tip, or triangular plywood with holes at the vertices for the leg tips. These devices prevent spreading and potential instrument falls.',
 'Chain, rope, carpet, or triangular plywood',
 'Metal tips on smooth floors = guaranteed slipping',
 'Slipping can send the instrument crashing to the floor',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['smooth floor','concrete','slip','chain','rope','carpet','plywood'],
 ARRAY['acc-srvy-1341','week-4','tripod'], 'surveying'),

('fc040017-0000-0000-0000-000000000001',
 'Peg Test (Two-Peg Test)',
 'The standard field calibration for automatic levels. Checks whether the line of sight is truly horizontal when the instrument is level. Must be performed weekly, before long bench circuits, and by all personnel before they are allowed to operate a level.',
 'Weekly calibration check for levels',
 'Required before starting any long bench (leveling) circuit',
 'All field personnel must know how to do this',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['peg test','two-peg test','level','calibration','weekly','bench circuit','line of sight'],
 ARRAY['acc-srvy-1341','week-4','calibration'], 'surveying'),

('fc040018-0000-0000-0000-000000000001',
 'Optical Plummet Check — 120° Method',
 'Monthly check: set up over a ground mark at ~5 ft height. Trace the tribrach outline. Rotate the tribrach 120°, level, mark a ground point. Repeat (another 120°). One point = in adjustment. Three points = send tribrach for repair.',
 'Three positions at 120° intervals (3 × 120° = 360°)',
 'One ground point = good; three ground points = bad',
 'Trace the tribrach outline to maintain consistent positioning',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['optical plummet','120 degrees','tribrach','rotation','check','adjustment','monthly'],
 ARRAY['acc-srvy-1341','week-4','calibration'], 'surveying'),

('fc040019-0000-0000-0000-000000000001',
 'Maximum Shot Distance — 600 Feet',
 'With 5-second total stations, the maximum layout and data collection distance should be less than 600 feet. Beyond this distance, the angular uncertainty produces position errors that may exceed acceptable tolerances for survey work.',
 '600 feet is the limit for 5-second instruments',
 'Angular error × distance = position error',
 'For longer distances, use higher-precision instruments or multiple setups',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['600 feet','maximum distance','5-second','angular error','position error','layout'],
 ARRAY['acc-srvy-1341','week-4','calibration'], 'surveying'),

('fc040020-0000-0000-0000-000000000001',
 'Resection — Minimum 3 Points',
 'The resection function in data collectors must use a minimum of 3 known points. Using only 2 points provides no redundancy and no check on the solution. Three points allow the software to compute a position and verify its consistency.',
 'Minimum 3 points for a valid resection',
 'Two points = no check; three points = built-in verification',
 'More points = better geometry and higher confidence',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['resection','3 points','data collector','redundancy','check','position'],
 ARRAY['acc-srvy-1341','week-4','calibration'], 'surveying'),

('fc040021-0000-0000-0000-000000000001',
 'Daily Maintenance Items',
 'Daily: wipe clean chain, tripod, level rod, and prism pole. Check prism pole bubble calibration. Check instrument constants on total station, digital level, and GPS. Clean lenses as needed with camera cleaning kit.',
 'Daily wipe-down of chain, tripod, rod, and pole',
 'Prism pole bubble = daily calibration check',
 'Instrument constants = checked at every power-on',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['daily','maintenance','wipe','prism pole','bubble','instrument constants'],
 ARRAY['acc-srvy-1341','week-4','maintenance'], 'surveying'),

('fc040022-0000-0000-0000-000000000001',
 'Weekly Maintenance Items',
 'Weekly: wipe clean all equipment. Deep clean level rod and prism pole. Check and correct calibration of auto level and tribrach. Perform peg test on all levels.',
 'ALL equipment gets a wipe-down weekly',
 'Auto level and tribrach calibration = weekly',
 'Peg test = weekly (and before long bench circuits)',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['weekly','maintenance','deep clean','auto level','tribrach','peg test'],
 ARRAY['acc-srvy-1341','week-4','maintenance'], 'surveying'),

('fc040023-0000-0000-0000-000000000001',
 'Monthly Maintenance Items',
 'Monthly: deep clean tripod, level rod, and laser. Lubricate tripod, level rod, and prism pole with silicone/Teflon spray. Check laser calibration. Check optical plummet (120° method). Occupy two known control monuments for distance, elevation, and angular checks.',
 'Monthly = lubrication month (silicone/Teflon only)',
 'Optical plummet check is a monthly task',
 'Control monument checks verify the instrument against known values',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['monthly','maintenance','lubricate','silicone','Teflon','optical plummet','control monuments'],
 ARRAY['acc-srvy-1341','week-4','maintenance'], 'surveying'),

('fc040024-0000-0000-0000-000000000001',
 'Yearly Maintenance',
 'Yearly or at seasonal temperature changes: deep clean ALL equipment. Check and correct calibration on total station and transit/theodolite. Send instruments and tribrachs to a qualified repair shop for professional cleaning and calibration.',
 'Yearly = professional shop service',
 'Seasonal temperature changes can shift instrument calibration',
 'Both the instrument AND tribrachs go to the shop',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['yearly','maintenance','professional','shop','calibration','seasonal','total station'],
 ARRAY['acc-srvy-1341','week-4','maintenance'], 'surveying'),

('fc040025-0000-0000-0000-000000000001',
 'New Job Maintenance Protocol',
 'At the start of every new job: deep clean ALL equipment and check/correct calibration on ALL instruments. This ensures no calibration drift or damage from the previous project carries over. New equipment (chain, level rod, instruments) must also be calibrated before first use.',
 'New job = full reset of all equipment',
 'Prevents problems from the last project affecting the new one',
 'New equipment is NOT assumed to be calibrated — always check',
 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001',
 ARRAY['new job','deep clean','calibration','all equipment','reset','new instruments'],
 ARRAY['acc-srvy-1341','week-4','maintenance'], 'surveying');

COMMIT;
