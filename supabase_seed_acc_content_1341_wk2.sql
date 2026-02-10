-- ============================================================================
-- SRVY 1341 — Week 2: Compass Surveying, DD/DMS Conversions & Chaining Review
-- ============================================================================
-- Covers compass types, bearings, azimuths, fore/back bearings, magnetic
-- declination, the SUUNTO KB-14/360, DD↔DMS conversions, and a brief
-- chaining-corrections review from Week 1.
--
-- Lesson UUID: acc03b02-0000-0000-0000-000000000001 (order_index 2)
-- Module UUID: acc00003-0000-0000-0000-000000000003
--
-- Topic UUIDs:
--   acc03a02-0001  Compass Survey Fundamentals
--   acc03a02-0002  Bearings, Azimuths & Fore/Back Bearings
--   acc03a02-0003  Magnetic Declination
--   acc03a02-0004  The SUUNTO KB-14/360
--   acc03a02-0005  DD and DMS Conversions
--   acc03a02-0006  Chaining Corrections Review
--
-- Run AFTER supabase_seed_acc_courses.sql and supabase_seed_acc_content_1341_wk1.sql
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. LESSON CONTENT (rich HTML)
-- ────────────────────────────────────────────────────────────────────────────

UPDATE learning_lessons SET

title = 'Week 2: Compass Surveying, DD/DMS Conversions & Chaining Review',

description = 'An introduction to the compass as a surveying instrument, bearing and azimuth notation, fore/back bearing relationships, magnetic declination, the SUUNTO KB-14/360, decimal-degree and degree-minute-second conversions with worked examples, and a brief review of the chaining correction formulas from Week 1.',

learning_objectives = ARRAY[
  'Identify the three main types of surveying compasses and their appropriate field uses',
  'Express directions using both bearing (N/S angle E/W) and azimuth (0°–360°) notation',
  'Convert bearings to azimuths and azimuths to bearings for all four quadrants',
  'Determine the back bearing or back azimuth of any given line',
  'Define magnetic declination and apply it to convert between magnetic and true bearings',
  'Convert angles from decimal degrees (DD) to degrees-minutes-seconds (DMS) and vice versa',
  'Describe the features and field use of the SUUNTO KB-14/360 hand-held compass',
  'Recall the three chaining correction formulas (Ct, Cp, Cs) from Week 1 and their sign conventions'
],

estimated_minutes = 45,

content = '
<h2>Week 2: Compass Surveying, DD/DMS Conversions &amp; Chaining Review</h2>

<p>Before the total station and GPS, the <strong>compass</strong> was one of the surveyor''s most important instruments. Even today, a compass remains essential for reconnaissance work, checking angles in the field, and forestry surveys. This week we study how a compass measures direction, the two systems used to express that direction (bearings and azimuths), the relationship between magnetic north and true north, and a hand-held instrument — the SUUNTO KB-14/360 — that every field surveyor should know how to use. We also cover the critically important skill of converting between <strong>decimal degrees (DD)</strong> and <strong>degrees-minutes-seconds (DMS)</strong>, and wrap up with a quick review of the chaining correction formulas from Week 1.</p>

<hr/>

<h3>1. Compass Survey Fundamentals</h3>

<p>A compass measures the horizontal angle between a line of sight and <strong>magnetic north</strong>. Compass surveys are used for:</p>
<ul>
  <li><strong>Reconnaissance</strong> — quickly sketching site conditions before a full instrument survey</li>
  <li><strong>Preliminary surveys</strong> — rough mapping for planning purposes</li>
  <li><strong>Checking angles</strong> — independent field verification of total station readings</li>
  <li><strong>Forestry and natural-resource work</strong> — where extreme precision is not required</li>
</ul>

<h4>Types of Surveying Compasses</h4>

<table>
<thead><tr><th>Type</th><th>Description</th><th>Typical Use</th></tr></thead>
<tbody>
<tr><td><strong>Surveyor''s Compass</strong></td><td>Mounted on a tripod with sighting vanes (slits). Reads bearings directly on a graduated circle. Historically used for boundary and land surveys in colonial America.</td><td>Historical / educational demonstrations</td></tr>
<tr><td><strong>Prismatic Compass</strong></td><td>Hand-held with a prism that lets the user read the bearing while simultaneously sighting the target. Common in military and geological fieldwork.</td><td>Military, geology, rough mapping</td></tr>
<tr><td><strong>Hand/Pocket Compass (e.g., SUUNTO KB-14/360)</strong></td><td>Small, portable, liquid-dampened capsule. Reads directly in 0°–360° (azimuth) or quadrant bearings. Accuracy typically ±0.5° to ±1°.</td><td>Reconnaissance, forestry, quick field checks</td></tr>
</tbody>
</table>

<p>All compasses share a limitation: they measure from <strong>magnetic north</strong>, which differs from <strong>true (geographic) north</strong> by an amount called <strong>declination</strong>. We will address this shortly.</p>

<hr/>

<h3>2. Bearings</h3>

<p>A <strong>bearing</strong> expresses the direction of a line as an acute angle measured from either north or south toward east or west. The format is always:</p>

<div style="background:#1a1a2e; padding:1rem; border-radius:8px; margin:1rem 0; text-align:center; font-size:1.1rem;">
  <strong>N/S &lt;angle&gt; E/W</strong>
</div>

<p>Rules:</p>
<ul>
  <li>The angle is always between <strong>0° and 90°</strong>.</li>
  <li>The first letter is always <strong>N</strong> or <strong>S</strong> (the reference meridian).</li>
  <li>The last letter is always <strong>E</strong> or <strong>W</strong> (the direction of rotation from the meridian).</li>
</ul>

<h4>Examples</h4>
<ul>
  <li>A line pointing northeast at 45° from north → <strong>N 45°00'' E</strong></li>
  <li>A line pointing south-southeast at 20° from south toward east → <strong>S 20°00'' E</strong></li>
  <li>Due east → <strong>N 90°00'' E</strong> (or equivalently S 90°00'' E)</li>
  <li>Due north → <strong>N 00°00'' E</strong> (or N 00°00'' W — the angle is zero)</li>
</ul>

<hr/>

<h3>3. Azimuths</h3>

<p>An <strong>azimuth</strong> is the direction of a line measured as a clockwise angle from north, ranging from <strong>0° to 360°</strong>. Azimuths are unambiguous — every direction has exactly one azimuth value.</p>

<div style="background:#1a1a2e; padding:1rem; border-radius:8px; margin:1rem 0; text-align:center; font-size:1.1rem;">
  <strong>Azimuth: 0° (North) → 90° (East) → 180° (South) → 270° (West) → 360°/0° (North)</strong>
</div>

<h4>Converting Bearing to Azimuth</h4>

<table>
<thead><tr><th>Quadrant</th><th>Bearing Format</th><th>Azimuth Formula</th><th>Example</th></tr></thead>
<tbody>
<tr><td><strong>NE</strong></td><td>N θ E</td><td>Az = θ</td><td>N 45°00'' E → Az = <strong>45°</strong></td></tr>
<tr><td><strong>SE</strong></td><td>S θ E</td><td>Az = 180° − θ</td><td>S 30°00'' E → Az = 180° − 30° = <strong>150°</strong></td></tr>
<tr><td><strong>SW</strong></td><td>S θ W</td><td>Az = 180° + θ</td><td>S 45°00'' W → Az = 180° + 45° = <strong>225°</strong></td></tr>
<tr><td><strong>NW</strong></td><td>N θ W</td><td>Az = 360° − θ</td><td>N 60°00'' W → Az = 360° − 60° = <strong>300°</strong></td></tr>
</tbody>
</table>

<h4>Converting Azimuth to Bearing</h4>
<ul>
  <li><strong>0°–90°</strong> (NE quadrant): Bearing = N (azimuth)° E. Example: Az 35° → N 35°00'' E</li>
  <li><strong>90°–180°</strong> (SE quadrant): Bearing = S (180° − azimuth)° E. Example: Az 150° → S 30°00'' E</li>
  <li><strong>180°–270°</strong> (SW quadrant): Bearing = S (azimuth − 180°)° W. Example: Az 225° → S 45°00'' W</li>
  <li><strong>270°–360°</strong> (NW quadrant): Bearing = N (360° − azimuth)° W. Example: Az 300° → N 60°00'' W</li>
</ul>

<hr/>

<h3>4. Fore Bearings and Back Bearings</h3>

<p>Every survey line has two directions: the <strong>fore bearing</strong> (direction of travel) and the <strong>back bearing</strong> (the reverse direction). To find the back bearing from a fore bearing, simply reverse both letters:</p>

<div style="background:#1a1a2e; padding:1rem; border-radius:8px; margin:1rem 0; text-align:center; font-size:1.1rem;">
  <strong>Back Bearing: swap N↔S and E↔W</strong>
</div>

<h4>Examples</h4>
<ul>
  <li>Fore bearing = N 35°20'' E → Back bearing = <strong>S 35°20'' W</strong></li>
  <li>Fore bearing = S 72°45'' W → Back bearing = <strong>N 72°45'' E</strong></li>
</ul>

<p>For azimuths, the back azimuth is obtained by adding or subtracting 180°:</p>

<div style="background:#1a1a2e; padding:1rem; border-radius:8px; margin:1rem 0; text-align:center; font-size:1.1rem;">
  <strong>Back Azimuth = Azimuth ± 180°</strong><br/>
  (Add 180° if azimuth &lt; 180°; subtract 180° if azimuth ≥ 180°)
</div>

<p>Example: Az = 45° → Back Az = 45° + 180° = <strong>225°</strong>. Az = 300° → Back Az = 300° − 180° = <strong>120°</strong>.</p>

<hr/>

<h3>5. Magnetic Declination</h3>

<p><strong>Magnetic declination</strong> (also called <em>variation</em>) is the angle between <strong>true north</strong> (geographic north pole) and <strong>magnetic north</strong> (where the compass needle points). The Earth''s magnetic pole does not coincide with the geographic pole, and its position slowly changes over time.</p>

<ul>
  <li><strong>East declination</strong>: Magnetic north is <em>east</em> of true north. The compass needle points to the right of true north.</li>
  <li><strong>West declination</strong>: Magnetic north is <em>west</em> of true north. The compass needle points to the left of true north.</li>
</ul>

<h4>Correction Formula</h4>

<div style="background:#1a1a2e; padding:1rem; border-radius:8px; margin:1rem 0; text-align:center; font-size:1.1rem;">
  <strong>True Bearing = Magnetic Bearing + East Declination</strong><br/>
  <strong>True Bearing = Magnetic Bearing − West Declination</strong>
</div>

<p>Or more concisely: <strong>True = Magnetic + Declination</strong> (treating east as positive and west as negative).</p>

<h4>Example</h4>
<p>A compass reads N 40°00'' E. The local declination is 3° East.</p>
<p>True bearing = 40° + 3° = <strong>N 43°00'' E</strong>.</p>

<p>Lines connecting points of equal declination are called <strong>isogonic lines</strong>. The line where declination is zero is the <strong>agonic line</strong>. Texas currently has approximately <strong>2°–4° east declination</strong>, meaning magnetic north points slightly east of true north across most of the state.</p>

<hr/>

<h3>6. The SUUNTO KB-14/360</h3>

<p>The <strong>SUUNTO KB-14/360</strong> is a hand-held sighting compass widely used in forestry, reconnaissance surveying, and field checks. Key features:</p>

<ul>
  <li>Reads directly in <strong>degrees 0°–360°</strong> (azimuth format)</li>
  <li><strong>Liquid-dampened capsule</strong> — the needle settles quickly, even in windy conditions</li>
  <li>Accuracy: <strong>±0.5°</strong> (±30'')</li>
  <li>Compact and lightweight — fits in a shirt pocket</li>
  <li>Sighting through a notch/window while reading the bearing through a lens</li>
</ul>

<p>The KB-14/360 is not a precision instrument — it cannot replace a total station for boundary work — but it is invaluable for quick directional checks, reconnaissance, and confirming that your total station readings are in the correct quadrant.</p>

<hr/>

<h3>7. DD and DMS Conversions</h3>

<p>Angles can be expressed in two common formats:</p>
<ul>
  <li><strong>Decimal Degrees (DD)</strong>: e.g., 47.8° — used by calculators and software</li>
  <li><strong>Degrees-Minutes-Seconds (DMS)</strong>: e.g., 47°48''00" — used in field notes and legal descriptions</li>
</ul>

<p>There are 60 minutes in a degree and 60 seconds in a minute (just like hours on a clock).</p>

<h4>DD → DMS Conversion</h4>

<ol>
  <li>The whole-number part is the <strong>degrees</strong>.</li>
  <li>Multiply the decimal part by 60 — the whole-number result is the <strong>minutes</strong>.</li>
  <li>Multiply the remaining decimal of the minutes by 60 — the result is the <strong>seconds</strong>.</li>
</ol>

<h4>Worked Example 1: 47.8°</h4>
<ul>
  <li>Degrees = 47°</li>
  <li>0.8 × 60 = 48.0'' → Minutes = 48''</li>
  <li>0.0 × 60 = 0" → Seconds = 00"</li>
  <li><strong>Answer: 47°48''00"</strong></li>
</ul>

<h4>Worked Example 2: 345.678°</h4>
<ul>
  <li>Degrees = 345°</li>
  <li>0.678 × 60 = 40.68'' → Minutes = 40''</li>
  <li>0.68 × 60 = 40.8" → Seconds ≈ 41"</li>
  <li><strong>Answer: 345°40''41"</strong></li>
</ul>

<h4>DMS → DD Conversion</h4>

<div style="background:#1a1a2e; padding:1rem; border-radius:8px; margin:1rem 0; text-align:center; font-size:1.1rem;">
  <strong>DD = Degrees + Minutes/60 + Seconds/3600</strong>
</div>

<h4>Worked Example 3: 43°12''15"</h4>
<ul>
  <li>DD = 43 + 12/60 + 15/3600</li>
  <li>DD = 43 + 0.2000 + 0.004167</li>
  <li><strong>Answer: 43.2042°</strong></li>
</ul>

<h4>Worked Example 4: 128°45''30"</h4>
<ul>
  <li>DD = 128 + 45/60 + 30/3600</li>
  <li>DD = 128 + 0.7500 + 0.008333</li>
  <li><strong>Answer: 128.7583°</strong></li>
</ul>

<p><strong>Tip:</strong> Always sanity-check your conversion. If you start with 47.8° (less than 48°), your DMS result should be 47-something — never 48°. If you start with 43°12'', your DD should be between 43.2 and 43.3.</p>

<hr/>

<h3>8. Chaining Corrections Review</h3>

<p>From Week 1, recall the three systematic corrections applied to steel-tape measurements:</p>

<div style="background:#1a1a2e; padding:1rem; border-radius:8px; margin:1rem 0; text-align:center; font-size:1.1rem;">
  <strong>C<sub>t</sub> = 0.00000645 × (T<sub>F</sub> − 68) × L</strong> &nbsp; (Temperature)<br/><br/>
  <strong>C<sub>p</sub> = (P − P<sub>s</sub>) × L / (A × E)</strong> &nbsp; (Tension)<br/><br/>
  <strong>C<sub>s</sub> = −w² × L³ / (24 × P²)</strong> &nbsp; (Sag — always negative)
</div>

<p>Corrected distance = Measured + C<sub>t</sub> + C<sub>p</sub> + C<sub>s</sub>. Each correction has its own sign.</p>
<p>Key reminders: Temperature correction is positive above 68°F and negative below. Tension correction is positive when over-pulling. Sag correction is <strong>always negative</strong> because the catenary arc is longer than the chord.</p>
',

resources = '[
  {"title":"NOAA Magnetic Declination Calculator","url":"https://www.ngdc.noaa.gov/geomag/calculators/magcalc.shtml","type":"tool"},
  {"title":"Elementary Surveying (Ghilani) — Compass Surveying and Angle Measurement","url":"https://www.pearson.com/","type":"reference"},
  {"title":"SUUNTO KB-14/360 Product Specifications","url":"https://www.suunto.com/","type":"reference"}
]'::jsonb,

videos = '[
  {"title":"Bearings and Azimuths Explained","url":"https://www.youtube.com/watch?v=5qTOlz7bBHY"},
  {"title":"DD to DMS and DMS to DD Conversions — Step by Step","url":"https://www.youtube.com/watch?v=hjI_0KB5ms4"}
]'::jsonb,

key_takeaways = ARRAY[
  'A compass measures the angle between a line and magnetic north — used for reconnaissance, preliminary surveys, and field checks',
  'Bearings use the format N/S angle E/W with angles from 0° to 90°; azimuths are measured 0°–360° clockwise from north',
  'To convert bearing to azimuth: NE = θ, SE = 180° − θ, SW = 180° + θ, NW = 360° − θ',
  'Back bearing reverses N↔S and E↔W; back azimuth = azimuth ± 180°',
  'True bearing = magnetic bearing + east declination (or − west declination); Texas has ~2°–4° east declination',
  'DD→DMS: multiply decimal part by 60 for minutes, then decimal of minutes by 60 for seconds; DMS→DD: D + M/60 + S/3600',
  'The SUUNTO KB-14/360 is a hand-held sighting compass accurate to ±0.5°, reading 0°–360° with a liquid-dampened capsule'
]

WHERE id = 'acc03b02-0000-0000-0000-000000000001';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. TOPICS
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM learning_topics WHERE lesson_id = 'acc03b02-0000-0000-0000-000000000001';

INSERT INTO learning_topics (id, lesson_id, title, content, order_index, keywords) VALUES

('acc03a02-0001-0000-0000-000000000001', 'acc03b02-0000-0000-0000-000000000001',
 'Compass Survey Fundamentals',
 'A compass measures the horizontal angle between a line of sight and magnetic north. Three main types exist: (1) The surveyor''s compass — a tripod-mounted instrument with sighting vanes that reads bearings directly from a graduated circle; historically used for boundary surveys in colonial America. (2) The prismatic compass — a hand-held instrument with a prism allowing the user to sight a target and read the bearing simultaneously; common in military and geological work. (3) The hand/pocket compass such as the SUUNTO KB-14/360 — small, portable, liquid-dampened, reading 0°–360° with accuracy of about ±0.5°; used for reconnaissance, forestry, and quick field checks. Compass surveys are appropriate for reconnaissance, preliminary surveys, checking total station readings, and forestry/natural-resource work. All compasses read magnetic north rather than true north, so declination corrections are required for precise work. Compass accuracy (typically ±0.5° to ±1°) is far below that of a total station (±1" to ±5"), making compasses unsuitable for final boundary or control surveys.',
 1,
 ARRAY['compass','surveyor''s compass','prismatic compass','pocket compass','SUUNTO','reconnaissance','magnetic north','sighting','field check']),

('acc03a02-0002-0000-0000-000000000001', 'acc03b02-0000-0000-0000-000000000001',
 'Bearings, Azimuths & Fore/Back Bearings',
 'A bearing expresses direction as an acute angle (0°–90°) measured from north or south toward east or west: the format is N/S angle E/W. For example, N 45°00'' E means 45° measured clockwise from north toward east. An azimuth expresses direction as a single angle measured 0°–360° clockwise from north: 0° = north, 90° = east, 180° = south, 270° = west. Converting bearing to azimuth by quadrant: NE → Az = θ; SE → Az = 180° − θ; SW → Az = 180° + θ; NW → Az = 360° − θ. Converting azimuth to bearing: 0°–90° → N Az° E; 90°–180° → S (180°−Az)° E; 180°–270° → S (Az−180°)° W; 270°–360° → N (360°−Az)° W. Every line has a fore bearing (direction of travel) and a back bearing (reverse). To find the back bearing, swap N↔S and E↔W — the angle stays the same. For azimuths, back azimuth = azimuth ± 180° (add if < 180°, subtract if ≥ 180°). Examples: Fore N 35°20'' E → Back S 35°20'' W. Fore Az 45° → Back Az 225°. Fore Az 300° → Back Az 120°.',
 2,
 ARRAY['bearing','azimuth','fore bearing','back bearing','quadrant','NE','SE','SW','NW','direction','clockwise','conversion']),

('acc03a02-0003-0000-0000-000000000001', 'acc03b02-0000-0000-0000-000000000001',
 'Magnetic Declination',
 'Magnetic declination (also called variation) is the angle between true north (geographic north) and magnetic north (where a compass needle points). The Earth''s magnetic pole does not coincide with the geographic pole, and it drifts slowly over time. East declination means magnetic north is east of true north; west declination means magnetic north is west of true north. To convert between magnetic and true bearings: True Bearing = Magnetic Bearing + East Declination, or True Bearing = Magnetic Bearing − West Declination. More concisely: True = Magnetic + Declination, where east declination is positive and west is negative. Example: Compass reads N 40°00'' E with 3° east declination → True bearing = N 43°00'' E. Lines of equal declination are called isogonic lines. The line of zero declination is the agonic line. Texas currently has approximately 2°–4° east declination, meaning the compass needle points slightly east of true north. Declination changes slowly over time (secular variation) and also exhibits daily oscillation. Historical deeds may reference magnetic bearings from decades or centuries ago — to reestablish those boundaries, the surveyor must determine the declination that existed at the time the deed was written.',
 3,
 ARRAY['declination','magnetic north','true north','east declination','west declination','isogonic','agonic','variation','secular variation','Texas declination']),

('acc03a02-0004-0000-0000-000000000001', 'acc03b02-0000-0000-0000-000000000001',
 'The SUUNTO KB-14/360',
 'The SUUNTO KB-14/360 is a hand-held sighting compass popular among surveyors, foresters, and field engineers. It reads directly in degrees from 0° to 360° (azimuth format). Key features: (1) Liquid-dampened capsule — the needle settles quickly, reducing wait time even in windy conditions. (2) Accuracy of ±0.5° (±30 minutes of arc), which is adequate for reconnaissance and field checks but not for boundary surveys. (3) Compact and lightweight — fits in a shirt pocket or hangs from a lanyard. (4) The user sights through a notch or window while reading the azimuth through a magnifying lens at the same time. (5) Some models include an adjustable declination correction ring. The KB-14/360 is not a precision instrument and cannot replace a total station for boundary or control work. Its role is rapid directional checks: confirming that total station readings are in the correct quadrant, taking quick bearings during reconnaissance walks, and providing backup directions when electronic equipment fails. Every field surveyor should know how to read and use a hand-held compass.',
 4,
 ARRAY['SUUNTO','KB-14','compass','hand-held','liquid-dampened','accuracy','reconnaissance','azimuth','sighting','forestry']),

('acc03a02-0005-0000-0000-000000000001', 'acc03b02-0000-0000-0000-000000000001',
 'DD and DMS Conversions',
 'Angles in surveying are expressed in two common formats: Decimal Degrees (DD) such as 47.8°, and Degrees-Minutes-Seconds (DMS) such as 47°48''00". There are 60 minutes in a degree and 60 seconds in a minute. DD to DMS conversion: (1) The whole number is the degrees. (2) Multiply the decimal fraction by 60 — the whole part is minutes. (3) Multiply the remaining decimal of minutes by 60 — the result is seconds. Example: 345.678° → Degrees = 345°. 0.678 × 60 = 40.68'' → Minutes = 40''. 0.68 × 60 = 40.8" ≈ 41" → Answer: 345°40''41". DMS to DD conversion: DD = Degrees + Minutes/60 + Seconds/3600. Example: 43°12''15" → 43 + 12/60 + 15/3600 = 43 + 0.2000 + 0.004167 = 43.2042°. For negative angles (south or west), convert the absolute value and then reattach the negative sign. Always sanity-check your result: the DD value should be between the degree value and degree+1 if there are non-zero minutes/seconds. Practice is the only way to master these conversions — they appear constantly in surveying computations, legal descriptions, and licensing exams.',
 5,
 ARRAY['decimal degrees','DD','degrees minutes seconds','DMS','conversion','minutes','seconds','angle format','calculator']),

('acc03a02-0006-0000-0000-000000000001', 'acc03b02-0000-0000-0000-000000000001',
 'Chaining Corrections Review',
 'A brief review of the three systematic corrections for steel-tape measurement from Week 1: (1) Temperature correction: Ct = 0.00000645 × (TF − 68) × L. The coefficient of thermal expansion for steel is 6.45 × 10⁻⁶ per °F. Standard temperature is 68°F. Positive above 68°F (tape expands, reads short), negative below (tape contracts, reads long). (2) Tension (pull) correction: Cp = (P − Ps) × L / (A × E). P = applied tension, Ps = standard tension, A = cross-sectional area, E = modulus of elasticity ≈ 29,000,000 psi. Positive when over-pulling, negative when under-pulling. (3) Sag correction: Cs = −w² × L³ / (24 × P²). w = weight per foot, L = unsupported span, P = applied tension. Always negative because the catenary arc is longer than the chord. Corrected distance = Measured + Ct + Cp + Cs. Normal tension is the specific pull at which Cp + Cs = 0, allowing a suspended tape to read correctly without corrections.',
 6,
 ARRAY['temperature correction','tension correction','sag correction','Ct','Cp','Cs','chaining','steel tape','review','normal tension','catenary']);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. QUIZ QUESTIONS (16 questions — linked to topics via topic_id and study_references)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM question_bank
WHERE lesson_id = 'acc03b02-0000-0000-0000-000000000001'
  AND tags @> ARRAY['acc-srvy-1341','week-2','quiz'];

INSERT INTO question_bank (
  question_text, question_type, options, correct_answer, explanation, difficulty,
  module_id, lesson_id, topic_id, exam_category, tags, study_references
) VALUES

-- Q1: Compass types (easy)
('Which type of compass is mounted on a tripod and uses sighting vanes to read bearings directly?',
 'multiple_choice',
 '["Prismatic compass","Surveyor''s compass","SUUNTO KB-14/360","Lensatic compass"]'::jsonb,
 'Surveyor''s compass',
 'The surveyor''s compass is the traditional tripod-mounted instrument with sighting vanes (slits) that reads bearings directly on a graduated circle. Prismatic compasses and hand compasses like the SUUNTO KB-14 are hand-held instruments.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0001-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','compass-types'],
 '[{"type":"topic","id":"acc03a02-0001-0000-0000-000000000001","label":"Compass Survey Fundamentals"}]'::jsonb),

-- Q2: Bearing format (easy)
('A surveying bearing is always expressed as an angle between:',
 'multiple_choice',
 '["0° and 360°","0° and 90°, measured from N or S toward E or W","0° and 180°, measured from east","0° and 90°, measured from E or W toward N or S"]'::jsonb,
 '0° and 90°, measured from N or S toward E or W',
 'Bearings use the format N/S angle E/W. The angle is always between 0° and 90°, measured from the north or south meridian toward east or west. This distinguishes bearings from azimuths, which range 0°–360°.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0002-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','bearing-format'],
 '[{"type":"topic","id":"acc03a02-0002-0000-0000-000000000001","label":"Bearings, Azimuths & Fore/Back Bearings"}]'::jsonb),

-- Q3: Azimuth definition (easy)
('An azimuth is measured:',
 'multiple_choice',
 '["Counterclockwise from south, 0° to 360°","Clockwise from north, 0° to 360°","From east or west, 0° to 90°","Counterclockwise from north, 0° to 180°"]'::jsonb,
 'Clockwise from north, 0° to 360°',
 'Azimuths are measured clockwise from north through the full 360°. North = 0° (or 360°), East = 90°, South = 180°, West = 270°. Every direction has a unique azimuth value.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0002-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','azimuth-definition'],
 '[{"type":"topic","id":"acc03a02-0002-0000-0000-000000000001","label":"Bearings, Azimuths & Fore/Back Bearings"}]'::jsonb),

-- Q4: Bearing-to-azimuth conversion (medium)
('Convert the bearing S 30°00'' E to an azimuth.',
 'numeric_input',
 '[]'::jsonb,
 '150',
 'S 30° E is in the SE quadrant. Azimuth = 180° − 30° = 150°. In the SE quadrant, the formula is Az = 180° − bearing angle.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0002-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','bearing-to-azimuth','conversion'],
 '[{"type":"topic","id":"acc03a02-0002-0000-0000-000000000001","label":"Bearings, Azimuths & Fore/Back Bearings"}]'::jsonb),

-- Q5: Azimuth-to-bearing conversion (medium)
('Convert azimuth 225° to a bearing.',
 'multiple_choice',
 '["N 45°00'' W","S 45°00'' E","S 45°00'' W","N 45°00'' E"]'::jsonb,
 'S 45°00'' W',
 'Azimuth 225° is in the SW quadrant (180°–270°). Bearing angle = 225° − 180° = 45°. Direction is S … W. Therefore the bearing is S 45°00'' W.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0002-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','azimuth-to-bearing','conversion'],
 '[{"type":"topic","id":"acc03a02-0002-0000-0000-000000000001","label":"Bearings, Azimuths & Fore/Back Bearings"}]'::jsonb),

-- Q6: Back bearing calculation (medium)
('The fore bearing of a line is N 52°30'' E. What is the back bearing?',
 'multiple_choice',
 '["N 52°30'' W","S 52°30'' E","S 52°30'' W","S 37°30'' W"]'::jsonb,
 'S 52°30'' W',
 'To find the back bearing, swap N↔S and E↔W. The angle stays the same. N 52°30'' E becomes S 52°30'' W.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0002-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','back-bearing','fore-bearing'],
 '[{"type":"topic","id":"acc03a02-0002-0000-0000-000000000001","label":"Bearings, Azimuths & Fore/Back Bearings"}]'::jsonb),

-- Q7: Magnetic declination concept (easy)
('Magnetic declination is defined as the angle between:',
 'multiple_choice',
 '["True north and the equator","Magnetic north and true north","The compass needle and the horizontal plane","Grid north and magnetic south"]'::jsonb,
 'Magnetic north and true north',
 'Magnetic declination is the angular difference between true (geographic) north and magnetic north. It varies by location and changes slowly over time. In Texas, the current declination is approximately 2°–4° east.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0003-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','declination-concept'],
 '[{"type":"topic","id":"acc03a02-0003-0000-0000-000000000001","label":"Magnetic Declination"}]'::jsonb),

-- Q8: Declination correction calculation (medium)
('A compass reads N 40°00'' E at a location with 3° east declination. What is the true bearing?',
 'multiple_choice',
 '["N 37°00'' E","N 40°00'' E","N 43°00'' E","N 46°00'' E"]'::jsonb,
 'N 43°00'' E',
 'True bearing = Magnetic bearing + East declination = 40° + 3° = 43°. The true bearing is N 43°00'' E. East declination is added because magnetic north is east of true north, so the compass under-reads the true angle from true north.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0003-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','declination-correction','calculation'],
 '[{"type":"topic","id":"acc03a02-0003-0000-0000-000000000001","label":"Magnetic Declination"}]'::jsonb),

-- Q9: DD to DMS conversion (medium)
('Convert 47.8° to degrees-minutes-seconds (DMS).',
 'multiple_choice',
 '["47°08''00\"","47°48''00\"","47°80''00\"","48°48''00\""]'::jsonb,
 '47°48''00"',
 'Degrees = 47°. Decimal part: 0.8 × 60 = 48.0'' → 48 minutes. Remaining decimal: 0.0 × 60 = 0" → 0 seconds. Answer: 47°48''00".',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','DD-to-DMS','conversion'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

-- Q10: DMS to DD conversion (medium)
('Convert 43°12''15" to decimal degrees. Round to four decimal places.',
 'numeric_input',
 '[]'::jsonb,
 '43.2042',
 'DD = 43 + 12/60 + 15/3600 = 43 + 0.2000 + 0.004167 = 43.2042°.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','DMS-to-DD','conversion'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

-- Q11: SUUNTO KB-14 features (easy)
('The SUUNTO KB-14/360 hand-held compass has an accuracy of approximately:',
 'multiple_choice',
 '["±0.01°","±0.1°","±0.5°","±5°"]'::jsonb,
 '±0.5°',
 'The SUUNTO KB-14/360 is accurate to ±0.5° (±30 minutes of arc). This is adequate for reconnaissance and field checks but not for boundary or control survey work, which requires total station accuracy of ±1" to ±5".',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0004-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','SUUNTO','accuracy'],
 '[{"type":"topic","id":"acc03a02-0004-0000-0000-000000000001","label":"The SUUNTO KB-14/360"}]'::jsonb),

-- Q12: Temperature correction sign (medium, review from Week 1)
('When the field temperature is BELOW 68°F, the temperature correction for a steel tape is:',
 'multiple_choice',
 '["Positive — add to measured distance","Negative — subtract from measured distance","Zero — temperature has no effect below 68°F","It depends on the tape length"]'::jsonb,
 'Negative — subtract from measured distance',
 'Below 68°F, the steel tape contracts and becomes shorter than standard. The shortened tape''s graduation marks are closer together, so it reads longer than the true distance. The correction Ct = 0.00000645 × (TF − 68) × L produces a negative value when TF < 68, which is subtracted from the measured distance.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0006-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','temperature-correction','sign','review'],
 '[{"type":"topic","id":"acc03a02-0006-0000-0000-000000000001","label":"Chaining Corrections Review"}]'::jsonb),

-- Q13: Combined bearing + declination problem (hard)
('A surveyor uses a compass to measure a bearing of S 55°00'' W at a location with 4° east declination. What is the true azimuth of the line?',
 'numeric_input',
 '[]'::jsonb,
 '239',
 'Step 1: Convert the magnetic bearing to a magnetic azimuth. S 55° W is in the SW quadrant: magnetic azimuth = 180° + 55° = 235°. Step 2: Apply east declination (add): True azimuth = 235° + 4° = 239°. The true azimuth is 239°.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0003-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','bearing-declination','combined','hard'],
 '[{"type":"topic","id":"acc03a02-0002-0000-0000-000000000001","label":"Bearings, Azimuths & Fore/Back Bearings"},{"type":"topic","id":"acc03a02-0003-0000-0000-000000000001","label":"Magnetic Declination"}]'::jsonb),

-- Q14: Complex DD/DMS conversion (hard)
('Convert 256.789° to DMS. Which is correct?',
 'multiple_choice',
 '["256°47''20\"","256°78''54\"","256°47''34\"","256°07''89\""]'::jsonb,
 '256°47''20"',
 'Degrees = 256°. 0.789 × 60 = 47.34'' → Minutes = 47''. 0.34 × 60 = 20.4" ≈ 20" → Seconds = 20". Answer: 256°47''20". Note that minutes and seconds can never exceed 59 — any answer with 78'' or 89" is automatically wrong.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','DD-to-DMS','hard','conversion'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

-- Q15: Article question — Gunter's chain (easy)
('Edmund Gunter designed his surveying chain in 1620. How long was the Gunter''s chain?',
 'multiple_choice',
 '["33 feet","50 feet","66 feet","100 feet"]'::jsonb,
 '66 feet',
 'Gunter''s chain was 66 feet long (4 rods or poles). It contained 100 links, each 0.66 feet (7.92 inches) long. The chain''s length was chosen so that 80 chains = 1 mile and 10 square chains = 1 acre, making area and distance calculations convenient in the English system.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0001-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','gunter-chain','history','article'],
 '[{"type":"topic","id":"acc03a02-0001-0000-0000-000000000001","label":"Compass Survey Fundamentals"}]'::jsonb),

-- Q16: Sag correction always negative T/F (easy, review)
('The sag correction for a suspended steel tape is always negative.',
 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'A suspended tape hangs in a catenary curve. The arc length (what the tape reads) is always greater than the straight-line chord distance between endpoints. Since we need the shorter chord distance, the sag correction Cs = −w²L³/(24P²) is always negative.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0006-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','sag-correction','always-negative','review'],
 '[{"type":"topic","id":"acc03a02-0006-0000-0000-000000000001","label":"Chaining Corrections Review"}]'::jsonb);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. PRACTICE PROBLEMS (45 total)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM question_bank
WHERE lesson_id = 'acc03b02-0000-0000-0000-000000000001'
  AND tags @> ARRAY['acc-srvy-1341','week-2','practice'];

INSERT INTO question_bank (
  question_text, question_type, options, correct_answer, explanation, difficulty,
  module_id, lesson_id, topic_id, exam_category, tags, study_references
) VALUES

-- ═══════════════════════════════════════════════════════════════════════════
-- Section 1: DD → DMS (10 problems)
-- ═══════════════════════════════════════════════════════════════════════════

('Convert 47.8° to DMS.',
 'multiple_choice',
 '["47°48''00\"","47°08''00\"","47°80''00\"","48°48''00\""]'::jsonb,
 '47°48''00"',
 'Degrees = 47°. 0.8 × 60 = 48.0'' → 48 minutes. 0.0 × 60 = 0" → 0 seconds. Answer: 47°48''00".',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DD-to-DMS'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 168.35° to DMS.',
 'multiple_choice',
 '["168°21''00\"","168°35''00\"","168°03''30\"","168°02''06\""]'::jsonb,
 '168°21''00"',
 'Degrees = 168°. 0.35 × 60 = 21.0'' → 21 minutes. 0.0 × 60 = 0" → 0 seconds. Answer: 168°21''00".',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DD-to-DMS'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 7.21° to DMS.',
 'multiple_choice',
 '["7°12''36\"","7°21''00\"","7°02''06\"","7°12''06\""]'::jsonb,
 '7°12''36"',
 'Degrees = 7°. 0.21 × 60 = 12.6'' → 12 minutes. 0.6 × 60 = 36" → 36 seconds. Answer: 7°12''36".',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DD-to-DMS'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 345.678° to DMS.',
 'multiple_choice',
 '["345°40''41\"","345°67''48\"","345°40''68\"","345°06''47\""]'::jsonb,
 '345°40''41"',
 'Degrees = 345°. 0.678 × 60 = 40.68'' → 40 minutes. 0.68 × 60 = 40.8" ≈ 41 seconds. Answer: 345°40''41".',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DD-to-DMS'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert -22.5° to DMS.',
 'multiple_choice',
 '["-22°30''00\"","-22°05''00\"","-22°50''00\"","-22°03''00\""]'::jsonb,
 '-22°30''00"',
 'Work with the absolute value: 22.5°. Degrees = 22°. 0.5 × 60 = 30.0'' → 30 minutes. 0.0 × 60 = 0" → 0 seconds. Reattach the negative sign. Answer: -22°30''00".',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DD-to-DMS','negative'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 0.0125° to DMS.',
 'multiple_choice',
 '["0°00''45\"","0°01''25\"","0°00''08\"","0°12''30\""]'::jsonb,
 '0°00''45"',
 'Degrees = 0°. 0.0125 × 60 = 0.75'' → 0 minutes. 0.75 × 60 = 45" → 45 seconds. Answer: 0°00''45".',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DD-to-DMS','small-angle'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 100.99° to DMS.',
 'multiple_choice',
 '["100°59''24\"","100°99''00\"","100°59''40\"","101°00''36\""]'::jsonb,
 '100°59''24"',
 'Degrees = 100°. 0.99 × 60 = 59.4'' → 59 minutes. 0.4 × 60 = 24" → 24 seconds. Answer: 100°59''24". Note that 99 minutes is impossible — minutes max at 59.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DD-to-DMS'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 256.789° to DMS.',
 'multiple_choice',
 '["256°47''20\"","256°78''54\"","256°47''34\"","256°07''89\""]'::jsonb,
 '256°47''20"',
 'Degrees = 256°. 0.789 × 60 = 47.34'' → 47 minutes. 0.34 × 60 = 20.4" ≈ 20 seconds. Answer: 256°47''20".',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DD-to-DMS'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert -88.125° to DMS.',
 'multiple_choice',
 '["-88°07''30\"","-88°12''30\"","-88°12''50\"","-88°01''25\""]'::jsonb,
 '-88°07''30"',
 'Work with absolute value: 88.125°. Degrees = 88°. 0.125 × 60 = 7.5'' → 7 minutes. 0.5 × 60 = 30" → 30 seconds. Reattach negative. Answer: -88°07''30".',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DD-to-DMS','negative'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 300.007° to DMS.',
 'multiple_choice',
 '["300°00''25\"","300°00''42\"","300°07''00\"","300°00''07\""]'::jsonb,
 '300°00''25"',
 'Degrees = 300°. 0.007 × 60 = 0.42'' → 0 minutes. 0.42 × 60 = 25.2" ≈ 25 seconds. Answer: 300°00''25".',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DD-to-DMS','small-decimal'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

-- ═══════════════════════════════════════════════════════════════════════════
-- Section 2: DMS → DD (10 problems)
-- ═══════════════════════════════════════════════════════════════════════════

('Convert 43°12''15" to decimal degrees. Round to 4 decimal places.',
 'numeric_input', '[]'::jsonb,
 '43.2042',
 'DD = 43 + 12/60 + 15/3600 = 43 + 0.2000 + 0.004167 = 43.2042°.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DMS-to-DD'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 128°45''30" to decimal degrees. Round to 4 decimal places.',
 'numeric_input', '[]'::jsonb,
 '128.7583',
 'DD = 128 + 45/60 + 30/3600 = 128 + 0.7500 + 0.008333 = 128.7583°.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DMS-to-DD'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 6°05''45" to decimal degrees. Round to 4 decimal places.',
 'numeric_input', '[]'::jsonb,
 '6.0958',
 'DD = 6 + 5/60 + 45/3600 = 6 + 0.08333 + 0.01250 = 6.0958°.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DMS-to-DD'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 359°59''59" to decimal degrees. Round to 4 decimal places.',
 'numeric_input', '[]'::jsonb,
 '359.9997',
 'DD = 359 + 59/60 + 59/3600 = 359 + 0.98333 + 0.01639 = 359.9997°.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DMS-to-DD'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert -15°30''00" to decimal degrees. Round to 4 decimal places.',
 'numeric_input', '[]'::jsonb,
 '-15.5000',
 'Work with absolute value: DD = 15 + 30/60 + 0/3600 = 15 + 0.5 = 15.5. Reattach negative: -15.5000°.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DMS-to-DD','negative'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 0°00''45" to decimal degrees. Round to 4 decimal places.',
 'numeric_input', '[]'::jsonb,
 '0.0125',
 'DD = 0 + 0/60 + 45/3600 = 0 + 0 + 0.0125 = 0.0125°.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DMS-to-DD','small-angle'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 90°15''20" to decimal degrees. Round to 4 decimal places.',
 'numeric_input', '[]'::jsonb,
 '90.2556',
 'DD = 90 + 15/60 + 20/3600 = 90 + 0.2500 + 0.005556 = 90.2556°.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DMS-to-DD'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 270°30''40" to decimal degrees. Round to 4 decimal places.',
 'numeric_input', '[]'::jsonb,
 '270.5111',
 'DD = 270 + 30/60 + 40/3600 = 270 + 0.5000 + 0.01111 = 270.5111°.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DMS-to-DD'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert -67°42''36" to decimal degrees. Round to 4 decimal places.',
 'numeric_input', '[]'::jsonb,
 '-67.7100',
 'Work with absolute value: DD = 67 + 42/60 + 36/3600 = 67 + 0.7000 + 0.0100 = 67.7100. Reattach negative: -67.7100°.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DMS-to-DD','negative'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 180°00''01" to decimal degrees. Round to 4 decimal places.',
 'numeric_input', '[]'::jsonb,
 '180.0003',
 'DD = 180 + 0/60 + 1/3600 = 180 + 0 + 0.000278 = 180.0003°.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DMS-to-DD','small-seconds'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

-- ═══════════════════════════════════════════════════════════════════════════
-- Section 3: Mixed DD↔DMS (10 problems)
-- ═══════════════════════════════════════════════════════════════════════════

('Convert 22.75° to DMS.',
 'multiple_choice',
 '["22°45''00\"","22°75''00\"","22°07''30\"","23°15''00\""]'::jsonb,
 '22°45''00"',
 'Degrees = 22°. 0.75 × 60 = 45.0'' → 45 minutes. 0.0 × 60 = 0" → 0 seconds. Answer: 22°45''00".',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DD-to-DMS','mixed'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 56°18''54" to decimal degrees. Round to 4 decimal places.',
 'numeric_input', '[]'::jsonb,
 '56.3150',
 'DD = 56 + 18/60 + 54/3600 = 56 + 0.3000 + 0.0150 = 56.3150°.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DMS-to-DD','mixed'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 333.005° to DMS.',
 'multiple_choice',
 '["333°00''18\"","333°00''30\"","333°05''00\"","333°00''05\""]'::jsonb,
 '333°00''18"',
 'Degrees = 333°. 0.005 × 60 = 0.3'' → 0 minutes. 0.3 × 60 = 18" → 18 seconds. Answer: 333°00''18".',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DD-to-DMS','mixed','small-decimal'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 89°59''60" to decimal degrees. Round to 4 decimal places.',
 'numeric_input', '[]'::jsonb,
 '90.0000',
 'DD = 89 + 59/60 + 60/3600 = 89 + 0.98333 + 0.01667 = 90.0000°. Note: 60 seconds = 1 minute, so 89°59''60" is exactly 90°00''00".',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DMS-to-DD','mixed','edge-case'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert -45.875° to DMS.',
 'multiple_choice',
 '["-45°52''30\"","-45°87''30\"","-45°52''50\"","-45°08''75\""]'::jsonb,
 '-45°52''30"',
 'Work with absolute value: 45.875°. Degrees = 45°. 0.875 × 60 = 52.5'' → 52 minutes. 0.5 × 60 = 30" → 30 seconds. Reattach negative. Answer: -45°52''30".',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DD-to-DMS','mixed','negative'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 0°30''30" to decimal degrees. Round to 4 decimal places.',
 'numeric_input', '[]'::jsonb,
 '0.5083',
 'DD = 0 + 30/60 + 30/3600 = 0 + 0.5000 + 0.008333 = 0.5083°.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DMS-to-DD','mixed'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 199.999° to DMS.',
 'multiple_choice',
 '["199°59''56\"","199°99''54\"","200°00''04\"","199°59''94\""]'::jsonb,
 '199°59''56"',
 'Degrees = 199°. 0.999 × 60 = 59.94'' → 59 minutes. 0.94 × 60 = 56.4" ≈ 56 seconds. Answer: 199°59''56".',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DD-to-DMS','mixed','near-boundary'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 270°15''45" to decimal degrees. Round to 4 decimal places.',
 'numeric_input', '[]'::jsonb,
 '270.2625',
 'DD = 270 + 15/60 + 45/3600 = 270 + 0.2500 + 0.0125 = 270.2625°.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DMS-to-DD','mixed'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert -0.125° to DMS.',
 'multiple_choice',
 '["-0°07''30\"","-0°12''30\"","-0°01''25\"","-0°00''08\""]'::jsonb,
 '-0°07''30"',
 'Work with absolute value: 0.125°. Degrees = 0°. 0.125 × 60 = 7.5'' → 7 minutes. 0.5 × 60 = 30" → 30 seconds. Reattach negative. Answer: -0°07''30".',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DD-to-DMS','mixed','negative'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

('Convert 360°00''00" to decimal degrees.',
 'numeric_input', '[]'::jsonb,
 '360.0000',
 'DD = 360 + 0/60 + 0/3600 = 360.0000°. This represents a full circle and is equivalent to 0°.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','DMS-to-DD','mixed','full-circle'],
 '[{"type":"topic","id":"acc03a02-0005-0000-0000-000000000001","label":"DD and DMS Conversions"}]'::jsonb),

-- ═══════════════════════════════════════════════════════════════════════════
-- Section 4: Compass / Bearing / Declination (5 problems)
-- ═══════════════════════════════════════════════════════════════════════════

('Convert the bearing N 35°20'' E to an azimuth.',
 'numeric_input', '[]'::jsonb,
 '35.333',
 'N 35°20'' E is in the NE quadrant. Azimuth = bearing angle = 35°20''. In decimal degrees: 35 + 20/60 = 35.333°. (As a DMS azimuth, it is simply 35°20''.)',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0002-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','bearing-to-azimuth','compass'],
 '[{"type":"topic","id":"acc03a02-0002-0000-0000-000000000001","label":"Bearings, Azimuths & Fore/Back Bearings"}]'::jsonb),

('Convert azimuth 210°15'' to a bearing.',
 'multiple_choice',
 '["S 30°15'' W","N 30°15'' W","S 30°15'' E","N 30°15'' E"]'::jsonb,
 'S 30°15'' W',
 'Azimuth 210°15'' is in the SW quadrant (180°–270°). Bearing angle = 210°15'' − 180° = 30°15''. Direction is S … W. Bearing = S 30°15'' W.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0002-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','azimuth-to-bearing','compass'],
 '[{"type":"topic","id":"acc03a02-0002-0000-0000-000000000001","label":"Bearings, Azimuths & Fore/Back Bearings"}]'::jsonb),

('What is the back bearing of N 72°45'' E?',
 'multiple_choice',
 '["S 72°45'' W","N 72°45'' W","S 72°45'' E","S 17°15'' W"]'::jsonb,
 'S 72°45'' W',
 'To find the back bearing, swap N↔S and E↔W while keeping the angle the same. N 72°45'' E → S 72°45'' W.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0002-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','back-bearing','compass'],
 '[{"type":"topic","id":"acc03a02-0002-0000-0000-000000000001","label":"Bearings, Azimuths & Fore/Back Bearings"}]'::jsonb),

('A compass reads a magnetic bearing of N 40°00'' E. The local declination is 3° East. What is the true bearing?',
 'multiple_choice',
 '["N 37°00'' E","N 40°00'' E","N 43°00'' E","N 46°00'' E"]'::jsonb,
 'N 43°00'' E',
 'True bearing = Magnetic bearing + East declination = 40° + 3° = 43°. True bearing = N 43°00'' E.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0003-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','declination','compass'],
 '[{"type":"topic","id":"acc03a02-0003-0000-0000-000000000001","label":"Magnetic Declination"}]'::jsonb),

('Convert azimuth 315°30'' to a bearing.',
 'multiple_choice',
 '["N 44°30'' W","N 45°30'' W","S 44°30'' E","N 44°30'' E"]'::jsonb,
 'N 44°30'' W',
 'Azimuth 315°30'' is in the NW quadrant (270°–360°). Bearing angle = 360° − 315°30'' = 44°30''. Direction is N … W. Bearing = N 44°30'' W.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 'acc03a02-0002-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-2','practice','azimuth-to-bearing','compass'],
 '[{"type":"topic","id":"acc03a02-0002-0000-0000-000000000001","label":"Bearings, Azimuths & Fore/Back Bearings"}]'::jsonb);


-- ────────────────────────────────────────────────────────────────────────────
-- 5. FLASHCARDS (20 — auto-discovered when lesson is completed)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM flashcards
WHERE lesson_id = 'acc03b02-0000-0000-0000-000000000001';

INSERT INTO flashcards (id, term, definition, hint_1, hint_2, hint_3, module_id, lesson_id, keywords, tags, category) VALUES

('fc020001-0000-0000-0000-000000000001',
 'Bearing (Surveying Direction)',
 'A direction expressed as an acute angle (0°–90°) measured from north or south toward east or west. Format: N/S angle E/W. Example: N 45°00'' E means 45° clockwise from north toward east.',
 'The angle is always between 0° and 90°',
 'The first letter is N or S, the last is E or W',
 'N 45° E is a bearing; 45° is an azimuth',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['bearing','direction','N/S','E/W','quadrant','acute angle'],
 ARRAY['acc-srvy-1341','week-2','compass'], 'surveying'),

('fc020002-0000-0000-0000-000000000001',
 'Azimuth',
 'A direction measured as a clockwise angle from north, ranging from 0° to 360°. North = 0°, East = 90°, South = 180°, West = 270°. Every direction has exactly one azimuth value.',
 'Always measured clockwise from north',
 'Range: 0° to 360° — never negative',
 'North can be 0° or 360°',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['azimuth','direction','clockwise','360 degrees','north reference'],
 ARRAY['acc-srvy-1341','week-2','compass'], 'surveying'),

('fc020003-0000-0000-0000-000000000001',
 'DD to DMS Conversion Steps',
 'To convert decimal degrees to degrees-minutes-seconds: (1) Whole part = degrees. (2) Multiply decimal × 60 → whole part = minutes. (3) Multiply remaining decimal × 60 → seconds. Example: 47.8° → 47° + (0.8 × 60 = 48'') + (0.0 × 60 = 00") = 47°48''00".',
 'Multiply by 60 twice — first for minutes, then for seconds',
 'Minutes and seconds can never exceed 59',
 'Start by separating the whole degrees from the decimal',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['DD','DMS','conversion','decimal degrees','minutes','seconds'],
 ARRAY['acc-srvy-1341','week-2','conversion','formula'], 'surveying'),

('fc020004-0000-0000-0000-000000000001',
 'DMS to DD Formula',
 'Decimal Degrees = Degrees + Minutes/60 + Seconds/3600. Example: 43°12''15" = 43 + 12/60 + 15/3600 = 43 + 0.2000 + 0.004167 = 43.2042°.',
 'Divide minutes by 60 and seconds by 3600',
 'There are 60 minutes in a degree and 60 seconds in a minute',
 'DD = D + M/60 + S/3600',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['DMS','DD','formula','conversion','degrees','minutes','seconds'],
 ARRAY['acc-srvy-1341','week-2','conversion','formula'], 'surveying'),

('fc020005-0000-0000-0000-000000000001',
 'Fore and Back Bearing Rule',
 'To find the back bearing from a fore bearing, swap N↔S and E↔W while keeping the angle the same. Example: Fore = N 35°20'' E → Back = S 35°20'' W. For azimuths, back azimuth = azimuth ± 180°.',
 'Reverse both letters, keep the angle',
 'For azimuths, add 180° if < 180°, subtract 180° if ≥ 180°',
 'Fore N 35°20'' E → Back S 35°20'' W',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['fore bearing','back bearing','reverse','back azimuth','direction'],
 ARRAY['acc-srvy-1341','week-2','compass'], 'surveying'),

('fc020006-0000-0000-0000-000000000001',
 'Magnetic Declination',
 'The angle between true (geographic) north and magnetic north at a given location. East declination means magnetic north is east of true north; west declination means it is west. Declination varies by location and changes slowly over time.',
 'Also called "variation" in older texts',
 'True north ≠ magnetic north',
 'Texas has approximately 2°–4° east declination',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['declination','magnetic north','true north','variation','angle'],
 ARRAY['acc-srvy-1341','week-2','compass'], 'surveying'),

('fc020007-0000-0000-0000-000000000001',
 'East vs. West Declination',
 'East declination: magnetic north is east of true north — the compass needle points to the right of true north. West declination: magnetic north is west of true north — the compass needle points to the left of true north.',
 'East: needle points right of true north',
 'West: needle points left of true north',
 'Most of Texas has east declination',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['east declination','west declination','compass needle','direction'],
 ARRAY['acc-srvy-1341','week-2','compass'], 'surveying'),

('fc020008-0000-0000-0000-000000000001',
 'True Bearing Formula (Declination Correction)',
 'True Bearing = Magnetic Bearing + East Declination, or True Bearing = Magnetic Bearing − West Declination. Concisely: True = Magnetic + Declination (east positive, west negative).',
 'East declination is added, west is subtracted',
 'Think: "East is positive, west is negative"',
 'Example: Magnetic N 40° E + 3° East declination = True N 43° E',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['true bearing','magnetic bearing','declination correction','formula','east','west'],
 ARRAY['acc-srvy-1341','week-2','compass','formula'], 'surveying'),

('fc020009-0000-0000-0000-000000000001',
 'SUUNTO KB-14/360',
 'A hand-held sighting compass that reads 0°–360° (azimuth format) with a liquid-dampened capsule. Accuracy: ±0.5°. Used for reconnaissance, forestry, and quick field checks. Not precise enough for boundary or control surveys.',
 'Reads directly in degrees 0°–360°',
 'Accuracy is ±0.5° (±30 minutes)',
 'Liquid-dampened means the needle settles quickly',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['SUUNTO','KB-14','compass','hand-held','liquid-dampened','azimuth','reconnaissance'],
 ARRAY['acc-srvy-1341','week-2','compass'], 'surveying'),

('fc020010-0000-0000-0000-000000000001',
 'Surveyor''s Compass',
 'A tripod-mounted compass with sighting vanes (slits) that reads bearings directly from a graduated circle. Historically used for boundary and land surveys in colonial America. Now primarily used for educational purposes and historical reenactments.',
 'Mounted on a tripod, unlike hand-held compasses',
 'Uses sighting vanes to align with the target',
 'The instrument that George Washington used for his surveys',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['surveyor''s compass','tripod','sighting vanes','bearing','graduated circle','historical'],
 ARRAY['acc-srvy-1341','week-2','compass'], 'surveying'),

('fc020011-0000-0000-0000-000000000001',
 'Compass Errors and Limitations',
 'Compasses are subject to: (1) Declination error — difference between magnetic and true north. (2) Local attraction — nearby magnetic materials (iron, steel, power lines) deflect the needle. (3) Instrument error — pivot friction, bent needle. (4) Reading error — parallax, incorrect sighting. Accuracy is typically ±0.5° to ±1°, far below total station precision.',
 'Local attraction is caused by nearby magnetic materials',
 'Accuracy is typically ±0.5° to ±1°',
 'Total stations are accurate to ±1" to ±5" — far more precise',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['compass error','local attraction','declination','instrument error','reading error','limitations'],
 ARRAY['acc-srvy-1341','week-2','compass'], 'surveying'),

('fc020012-0000-0000-0000-000000000001',
 'Local Attraction',
 'Deflection of a compass needle caused by nearby magnetic materials such as iron pipes, steel structures, vehicles, power lines, or mineral deposits. Local attraction causes the compass to read an incorrect bearing. Detected by comparing fore and back bearings — if they don''t differ by exactly 180° (as azimuths), local attraction is present at one or both stations.',
 'Nearby iron, steel, or power lines cause it',
 'Detected by comparing fore and back bearings',
 'If fore and back bearings are inconsistent, suspect local attraction',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['local attraction','magnetic','interference','iron','steel','compass error','fore bearing','back bearing'],
 ARRAY['acc-srvy-1341','week-2','compass'], 'surveying'),

('fc020013-0000-0000-0000-000000000001',
 'Bearing Quadrants',
 'The four bearing quadrants correspond to compass directions: NE (N angle E, azimuth 0°–90°), SE (S angle E, azimuth 90°–180°), SW (S angle W, azimuth 180°–270°), NW (N angle W, azimuth 270°–360°). The bearing angle is always 0°–90° regardless of quadrant.',
 'NE: N θ E; SE: S θ E; SW: S θ W; NW: N θ W',
 'First letter tells you which end of the meridian; last letter tells direction of rotation',
 'The bearing angle never exceeds 90°',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['quadrant','NE','SE','SW','NW','bearing','azimuth','compass'],
 ARRAY['acc-srvy-1341','week-2','compass'], 'surveying'),

('fc020014-0000-0000-0000-000000000001',
 'Azimuth Range',
 'Azimuths range from 0° to 360°, measured clockwise from north. Key values: North = 0° (or 360°), East = 90°, South = 180°, West = 270°. Unlike bearings, azimuths are unambiguous — every direction has exactly one azimuth value.',
 '0° = North, 90° = East, 180° = South, 270° = West',
 'Always clockwise from north',
 'No letters needed — the number alone defines the direction',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['azimuth','range','0 to 360','clockwise','north','east','south','west'],
 ARRAY['acc-srvy-1341','week-2','compass'], 'surveying'),

('fc020015-0000-0000-0000-000000000001',
 'Temperature Correction Formula (Ct)',
 'Ct = 0.00000645 × (TF − 68) × L. TF = field temperature in °F, L = measured distance in feet, 68°F = standard temperature. Positive above 68°F (tape expands, reads short), negative below 68°F (tape contracts, reads long).',
 'The coefficient is 6.45 × 10⁻⁶ per °F',
 'Standard temperature is 68°F (20°C)',
 'Hot day → positive correction; cold day → negative correction',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['temperature correction','Ct','formula','68°F','thermal expansion','chaining'],
 ARRAY['acc-srvy-1341','week-2','chaining','review','formula'], 'surveying'),

('fc020016-0000-0000-0000-000000000001',
 'Sag Correction Is Always Negative',
 'The sag correction Cs = −w²L³/(24P²) is always negative because a suspended tape hangs in a catenary curve that is longer than the straight-line chord distance. The tape reads the arc length, but the true distance is the shorter chord — so you must subtract the sag amount.',
 'The catenary arc is always longer than the chord',
 'The formula has a negative sign built in',
 'If the tape is supported on the ground, sag correction = 0',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['sag correction','Cs','always negative','catenary','chord','suspended tape'],
 ARRAY['acc-srvy-1341','week-2','chaining','review'], 'surveying'),

('fc020017-0000-0000-0000-000000000001',
 'Gunter''s Chain Length',
 'Edmund Gunter''s surveying chain (designed 1620) was 66 feet long, consisting of 100 links each 0.66 feet (7.92 inches) long. Its length was chosen so that 80 chains = 1 mile and 10 square chains = 1 acre, making English-system calculations convenient.',
 '66 feet — the same as 4 rods or poles',
 '80 chains make 1 mile; 10 square chains make 1 acre',
 'Each link is 7.92 inches (0.66 ft)',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['Gunter''s chain','66 feet','100 links','Edmund Gunter','1620','chain','acre','mile'],
 ARRAY['acc-srvy-1341','week-2','history'], 'surveying'),

('fc020018-0000-0000-0000-000000000001',
 'Compass Accuracy Limitations',
 'Typical compass accuracy is ±0.5° to ±1° (±30'' to ±60''). A total station reads to ±1" to ±5" — hundreds of times more precise. Compasses are adequate for reconnaissance, rough mapping, and field checks, but never for final boundary or control surveys.',
 'Compasses: ±0.5° to ±1°; Total stations: ±1" to ±5"',
 'Compass accuracy is measured in degrees; total station accuracy in seconds',
 'One degree = 3600 seconds — that is the scale of the difference',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['compass accuracy','total station','precision','limitations','field check'],
 ARRAY['acc-srvy-1341','week-2','compass'], 'surveying'),

('fc020019-0000-0000-0000-000000000001',
 'Normal Tension',
 'The specific tension at which the positive elongation from over-pulling exactly cancels the negative shortening from sag. At normal tension, a suspended tape reads the correct distance without corrections (Cp + Cs = 0). Normal tension is typically higher than standard tension.',
 'It is where sag correction equals tension correction in magnitude',
 'Higher than the standard tension printed on the tape',
 'At this tension, Cp + Cs = 0',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['normal tension','sag','tension','equilibrium','suspended tape','chaining'],
 ARRAY['acc-srvy-1341','week-2','chaining','review'], 'surveying'),

('fc020020-0000-0000-0000-000000000001',
 'Isogonic Lines',
 'Lines on a map connecting points of equal magnetic declination. The agonic line connects points where declination is zero (magnetic north = true north). Isogonic charts are published by NOAA and updated periodically as the Earth''s magnetic field changes.',
 'Iso = equal, gonic = angle',
 'The agonic line is where declination equals zero',
 'Published by NOAA; updated as the magnetic field drifts',
 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001',
 ARRAY['isogonic lines','agonic line','declination','map','NOAA','magnetic field'],
 ARRAY['acc-srvy-1341','week-2','compass'], 'surveying');

COMMIT;
