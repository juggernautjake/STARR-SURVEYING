-- ============================================================================
-- SRVY 1341 — Week 1: Distance Measurement — Chaining & Tape Corrections
-- ============================================================================
-- Based on lecture slides: chain/tape measurement procedures and
-- correction formulas (temperature, tension, sag).
--
-- Lesson UUID: acc03b01-0000-0000-0000-000000000001 (order_index 1)
-- Module UUID: acc00003-0000-0000-0000-000000000003
--
-- Topic UUIDs:
--   acc03a01-0001  Chain/Tape Measurement Principles
--   acc03a01-0002  Temperature Correction
--   acc03a01-0003  Tension (Pull) Correction
--   acc03a01-0004  Sag Correction
--   acc03a01-0005  Applying Multiple Corrections
--
-- Run AFTER supabase_seed_acc_courses.sql and supabase_seed_acc_content_1341_wk0.sql
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. LESSON CONTENT (rich HTML)
-- ────────────────────────────────────────────────────────────────────────────

UPDATE learning_lessons SET

title = 'Week 1: Distance Measurement — Chaining & Tape Corrections',

description = 'Field procedures for measuring with a steel chain or tape, and the three systematic corrections every surveyor must apply: temperature, tension, and sag. Includes the standard correction formulas, worked examples, and practice problems.',

learning_objectives = ARRAY[
  'Describe proper chain/tape measurement procedure including correct tension and forward/back measurement',
  'Apply the temperature correction formula Ct = 0.00000645 × (TF − 68) × L',
  'Apply the tension correction formula Cp = (P − Ps) × L / (A × E)',
  'Apply the sag correction formula Cs = −w² × L³ / (24 × P²)',
  'Determine the sign of each correction and explain its physical cause',
  'Compute corrected distances by combining all applicable corrections'
],

content = '
<h2>Week 1: Distance Measurement — Chaining &amp; Tape Corrections</h2>

<p>Accurate distance measurement is the foundation of every survey. Before electronic distance measurement (EDM) became standard, all distances were measured with <strong>steel chains</strong> or <strong>steel tapes</strong> — and even today, tape measurement remains a critical skill tested on licensing exams and used in short-range field checks.</p>

<p>A steel surveying tape is typically 100 feet or 30 meters long. It is manufactured to be exactly that length under <strong>standard conditions</strong>: a temperature of <strong>68°F (20°C)</strong>, a pull of <strong>10 to 20 pounds</strong> (depending on the tape), and full support along its length (no sag). When field conditions differ from these standards, the tape physically changes length, and the surveyor must apply <strong>corrections</strong> to obtain the true distance.</p>

<h3>Measuring with a Chain/Tape — Proper Procedure</h3>

<p>The fundamental rules of chain measurement have not changed in centuries:</p>

<ol>
  <li><strong>Apply Proper Tension:</strong> The tape must be pulled with the correct amount of force — typically <strong>20 to 25 pounds</strong> of tension (or whatever the tape was standardized at). Too little tension leaves slack; too much stretches the tape beyond its calibrated length. A spring balance (tension handle) should be used to ensure consistent pull.</li>

  <li><strong>Always Measure Distances Twice:</strong> Every distance is measured once <strong>forward</strong> and once <strong>back</strong> to catch mistakes. The two measurements should agree within the required tolerance. This is the surveyor''s equivalent of <em>"measure twice, cut once."</em> If forward and back measurements disagree beyond tolerance, the measurement must be repeated until they do.</li>

  <li><strong>Align the Tape:</strong> The tape must be held on line between the two points. Range poles or plumb bobs are used to keep the tape aligned over the correct ground points.</li>

  <li><strong>Read and Record Correctly:</strong> Read the tape at the correct graduation. Call out and independently record each reading. Transposed digits and misread graduations are the most common blunders in taping.</li>

  <li><strong>Keep the Tape Level (or Apply Slope Correction):</strong> If the tape is held level, horizontal distance is measured directly. If the terrain is sloped, either break the chain into level segments (''breaking chain'') or measure the slope distance and reduce it to horizontal using the slope angle or elevation difference.</li>
</ol>

<h3>Why Corrections Are Necessary</h3>

<p>A steel tape is a <strong>physical object</strong> — it expands and contracts with temperature, stretches under tension, and curves under its own weight. These are <strong>systematic errors</strong>: they always push the measurement in the same direction for the same conditions, and they can be mathematically corrected once the conditions are known.</p>

<p>The three primary chain corrections are:</p>
<ul>
  <li><strong>Temperature Correction (C<sub>t</sub>)</strong> — accounts for thermal expansion/contraction</li>
  <li><strong>Tension/Pull Correction (C<sub>p</sub>)</strong> — accounts for stretching beyond the standard pull</li>
  <li><strong>Sag Correction (C<sub>s</sub>)</strong> — accounts for the tape hanging in a catenary curve</li>
</ul>

<h3>Temperature Correction</h3>

<p>Steel expands when heated and contracts when cooled. The coefficient of thermal expansion for steel is approximately <strong>0.00000645 per °F</strong> (6.45 × 10<sup>−6</sup> /°F). Standard tapes are manufactured at <strong>68°F</strong>.</p>

<div style="background:#1a1a2e; padding:1rem; border-radius:8px; margin:1rem 0; text-align:center; font-size:1.1rem;">
  <strong>C<sub>t</sub> = 0.00000645 × (T<sub>F</sub> − 68) × L</strong>
</div>

<p>Where:</p>
<ul>
  <li><strong>C<sub>t</sub></strong> = correction in feet due to temperature</li>
  <li><strong>T<sub>F</sub></strong> = field temperature in °F</li>
  <li><strong>L</strong> = measured distance in feet</li>
  <li><strong>68°F</strong> = standard temperature at which the tape was calibrated</li>
</ul>

<h4>Sign Convention</h4>
<ul>
  <li><strong>Above 68°F:</strong> The tape is longer than standard → it spans more ground per graduation → readings are <strong>too short</strong> → correction is <strong>positive</strong> (add to measured distance)</li>
  <li><strong>Below 68°F:</strong> The tape is shorter than standard → it spans less ground → readings are <strong>too long</strong> → correction is <strong>negative</strong> (subtract from measured distance)</li>
</ul>

<h4>Example 1 — Hot Day</h4>
<p>Observed distance: <strong>357.22 ft</strong>, Field temperature: <strong>88°F</strong></p>
<p>C<sub>t</sub> = 0.00000645 × (88 − 68) × 357.22 = 0.00000645 × 20 × 357.22 = <strong>+0.046 ft</strong></p>
<p>Corrected distance = 357.22 + 0.046 = <strong>357.27 ft</strong></p>

<h4>Example 2 — Cold Day</h4>
<p>Observed distance: <strong>357.22 ft</strong>, Field temperature: <strong>48°F</strong></p>
<p>C<sub>t</sub> = 0.00000645 × (48 − 68) × 357.22 = 0.00000645 × (−20) × 357.22 = <strong>−0.046 ft</strong></p>
<p>Corrected distance = 357.22 + (−0.046) = <strong>357.17 ft</strong></p>

<p>Notice how the same tape, the same distance, but a 40°F temperature difference produces a total spread of 0.10 ft (about 1.2 inches). On a 1,000-foot traverse, this would be even larger. <strong>Temperature correction is never optional on precision work.</strong></p>

<h3>Tension (Pull) Correction</h3>

<p>If you pull the tape harder than the standard tension, it stretches; if you pull lighter, it sags more. The tension correction accounts for the elastic deformation of the tape:</p>

<div style="background:#1a1a2e; padding:1rem; border-radius:8px; margin:1rem 0; text-align:center; font-size:1.1rem;">
  <strong>C<sub>p</sub> = (P − P<sub>s</sub>) × L / (A × E)</strong>
</div>

<p>Where:</p>
<ul>
  <li><strong>C<sub>p</sub></strong> = correction in feet due to tension</li>
  <li><strong>P</strong> = applied tension in pounds</li>
  <li><strong>P<sub>s</sub></strong> = standard tension (from tape specifications) in pounds</li>
  <li><strong>L</strong> = measured distance in feet</li>
  <li><strong>A</strong> = cross-sectional area of the tape in square inches</li>
  <li><strong>E</strong> = modulus of elasticity of steel ≈ 29,000,000 psi (29 × 10<sup>6</sup> psi)</li>
</ul>

<h4>Sign Convention</h4>
<ul>
  <li><strong>P &gt; P<sub>s</sub>:</strong> Over-pulling stretches the tape → correction is <strong>positive</strong></li>
  <li><strong>P &lt; P<sub>s</sub>:</strong> Under-pulling means tape is too short → correction is <strong>negative</strong></li>
</ul>

<h4>Example — Tension Correction</h4>
<p>Standard tension P<sub>s</sub> = 10 lbs, Applied tension P = 25 lbs, Distance L = 500 ft, Cross-section A = 0.005 in², E = 29,000,000 psi</p>
<p>C<sub>p</sub> = (25 − 10) × 500 / (0.005 × 29,000,000) = 7,500 / 145,000 = <strong>+0.052 ft</strong></p>

<h3>Sag Correction</h3>

<p>When a tape is suspended between two supports (not lying on the ground), gravity pulls the middle downward into a <strong>catenary curve</strong>. The chord distance (straight line between endpoints) is always shorter than the tape reading. Sag correction is <strong>always negative</strong>.</p>

<div style="background:#1a1a2e; padding:1rem; border-radius:8px; margin:1rem 0; text-align:center; font-size:1.1rem;">
  <strong>C<sub>s</sub> = −w² × L³ / (24 × P²)</strong>
</div>

<p>Where:</p>
<ul>
  <li><strong>C<sub>s</sub></strong> = sag correction in feet (always negative)</li>
  <li><strong>w</strong> = weight of tape per foot (lbs/ft)</li>
  <li><strong>L</strong> = unsupported length in feet</li>
  <li><strong>P</strong> = applied tension in pounds</li>
</ul>

<h4>Why Sag Is Always Negative</h4>
<p>The tape sags into an arc. The arc is longer than the straight-line (chord) distance between the endpoints. Since the tape reading reflects the arc length, but you need the chord length, you must subtract the sag amount. Increasing tension reduces sag — there is a specific tension called the <strong>normal tension</strong> at which the sag correction exactly cancels the tension correction.</p>

<h4>Example — Sag Correction</h4>
<p>Tape weight w = 0.015 lbs/ft, Span L = 100 ft (unsupported), Tension P = 20 lbs</p>
<p>C<sub>s</sub> = −(0.015)² × (100)³ / (24 × (20)²) = −0.000225 × 1,000,000 / 9,600 = <strong>−0.023 ft</strong></p>

<h3>Applying All Corrections Together</h3>

<p>When field conditions require multiple corrections, simply add them all to the observed distance:</p>

<div style="background:#1a1a2e; padding:1rem; border-radius:8px; margin:1rem 0; text-align:center; font-size:1.1rem;">
  <strong>D<sub>corrected</sub> = D<sub>measured</sub> + C<sub>t</sub> + C<sub>p</sub> + C<sub>s</sub></strong>
</div>

<p>Each correction has its own sign (positive or negative). Compute each one separately, then sum. <strong>Always show your work</strong> — on licensing exams and in professional practice, a clearly documented correction sheet protects you from errors and challenges.</p>

<h4>Combined Example</h4>
<p>A surveyor measures 500.00 ft on a day when T = 95°F, using a 25-lb pull on a tape standardized at P<sub>s</sub> = 10 lbs, A = 0.005 in², w = 0.015 lbs/ft, fully supported (no sag).</p>
<ul>
  <li>C<sub>t</sub> = 0.00000645 × (95 − 68) × 500 = 0.00000645 × 27 × 500 = +0.087 ft</li>
  <li>C<sub>p</sub> = (25 − 10) × 500 / (0.005 × 29,000,000) = +0.052 ft</li>
  <li>C<sub>s</sub> = 0 (tape fully supported on ground)</li>
  <li><strong>D<sub>corrected</sub> = 500.00 + 0.087 + 0.052 + 0 = 500.14 ft</strong></li>
</ul>

<p>The true distance is about 1.7 inches longer than measured. On a multi-thousand-foot traverse, these corrections accumulate and become critical for meeting accuracy standards.</p>
',

resources = '[
  {"title":"Surveying Mathematics — Tape Correction Formulas","url":"https://www.surveyingmath.com/tape-corrections","type":"reference"},
  {"title":"Elementary Surveying (Ghilani) — Chapter on Distance Measurement","url":"https://www.pearson.com/","type":"reference"},
  {"title":"NOAA/NGS — Distance Measurement Standards","url":"https://www.ngs.noaa.gov/","type":"reference"}
]'::jsonb,

videos = '[
  {"title":"Steel Tape Measurement Procedure","url":"https://www.youtube.com/watch?v=3xLkVJrZjKI"},
  {"title":"Tape Corrections — Temperature, Tension, and Sag","url":"https://www.youtube.com/watch?v=QXwYh9Vf1nM"}
]'::jsonb,

key_takeaways = ARRAY[
  'Always apply 20–25 lbs of proper tension and measure every distance forward and back',
  'Temperature correction: Ct = 0.00000645 × (TF − 68) × L — positive above 68°F, negative below',
  'Tension correction: Cp = (P − Ps) × L / (A × E) — positive when over-pulling, negative when under-pulling',
  'Sag correction: Cs = −w² × L³ / (24 × P²) — always negative because the catenary arc is longer than the chord',
  'Combine all corrections: Dcorrected = Dmeasured + Ct + Cp + Cs',
  'Standard conditions: 68°F temperature, standard pull, full support (no sag)'
]

WHERE id = 'acc03b01-0000-0000-0000-000000000001';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. TOPICS
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM learning_topics WHERE lesson_id = 'acc03b01-0000-0000-0000-000000000001';

INSERT INTO learning_topics (id, lesson_id, title, content, order_index, keywords) VALUES

('acc03a01-0001-0000-0000-000000000001', 'acc03b01-0000-0000-0000-000000000001',
 'Chain/Tape Measurement Principles and Procedure',
 'A steel surveying tape is a precision instrument calibrated under standard conditions (68°F, standard pull, full support). Proper measurement procedure requires: (1) Apply the correct tension — typically 20 to 25 pounds, using a spring balance to ensure consistency. Too little tension leaves slack in the tape; too much stretches it beyond calibration. (2) Measure every distance twice — once forward and once back. Comparing forward and back measurements catches blunders such as miscounts, misreads, and misalignment. The two values should agree within the required accuracy standard. If they do not, remeasure. This is the surveyor''s version of "measure twice, cut once." (3) Align the tape on line between the two points using range poles or plumb bobs. An off-line tape reads longer than the true distance (since the hypotenuse of a right triangle is always longer than either leg). (4) Keep the tape horizontal or apply a slope correction. On sloped terrain, either "break chain" by measuring in short horizontal segments, or measure the full slope distance and reduce to horizontal using the formula H = S × cos(α) where α is the slope angle. (5) Read the tape carefully at the correct graduation. Call out each reading and record it independently. Transposed digits and misread graduations are the most common taping blunders in the field.',
 1,
 ARRAY['chain','tape','measurement','tension','forward and back','alignment','slope correction','plumb bob','range pole','field procedure']),

('acc03a01-0002-0000-0000-000000000001', 'acc03b01-0000-0000-0000-000000000001',
 'Temperature Correction',
 'Steel has a coefficient of thermal expansion of approximately 0.00000645 per °F (6.45 × 10⁻⁶/°F). A standard surveying tape is manufactured to be exactly its nominal length at 68°F (20°C). When the field temperature differs from 68°F, the tape physically changes length. The temperature correction formula is: Ct = 0.00000645 × (TF − 68) × L, where TF is the field temperature in Fahrenheit and L is the measured distance in feet. Sign convention: When TF > 68°F, the tape is physically longer than standard. It spans more ground per graduation mark, so each reading is shorter than reality. The correction is positive — add it to the measured distance. When TF < 68°F, the tape contracts. It spans less ground, so readings are longer than reality. The correction is negative — subtract it. Example: At 88°F, measuring 357.22 ft: Ct = 0.00000645 × (88-68) × 357.22 = +0.046 ft. Corrected distance = 357.27 ft. At 48°F with the same reading: Ct = 0.00000645 × (48-68) × 357.22 = -0.046 ft. Corrected distance = 357.17 ft. The 40°F temperature swing produces a 0.09 ft difference — significant for any precision survey. Temperature correction is always applied on professional work.',
 2,
 ARRAY['temperature correction','thermal expansion','coefficient','68 degrees','standard temperature','Ct','positive correction','negative correction','hot','cold','steel expansion']),

('acc03a01-0003-0000-0000-000000000001', 'acc03b01-0000-0000-0000-000000000001',
 'Tension (Pull) Correction',
 'When a tape is pulled with a force different from its standard tension (the tension at which it was calibrated), the tape undergoes elastic deformation — it stretches or relaxes according to Hooke''s Law. The tension correction formula is: Cp = (P − Ps) × L / (A × E), where P = applied tension (lbs), Ps = standard tension (lbs), L = measured distance (ft), A = cross-sectional area of tape (in²), and E = modulus of elasticity of steel ≈ 29,000,000 psi. Sign convention: When P > Ps (over-pulling), the tape stretches and spans more ground — correction is positive. When P < Ps (under-pulling), the tape is shorter — correction is negative. Example: If Ps = 10 lbs, P = 25 lbs, L = 500 ft, A = 0.005 in², E = 29×10⁶ psi: Cp = (25-10) × 500 / (0.005 × 29,000,000) = 15 × 500 / 145,000 = +0.052 ft. In practice, the cross-sectional area A of the tape is provided by the manufacturer or computed from the tape width and thickness (A = width × thickness). The modulus of elasticity E is a property of steel and is effectively constant at 29,000,000 psi for standard surveying tapes. Tension corrections are usually small for short distances but become significant on long measurements or when the applied tension differs greatly from standard.',
 3,
 ARRAY['tension correction','pull correction','Hooke''s law','elastic deformation','modulus of elasticity','cross-sectional area','standard tension','Cp','over-pulling','under-pulling','spring balance']),

('acc03a01-0004-0000-0000-000000000001', 'acc03b01-0000-0000-0000-000000000001',
 'Sag Correction',
 'When a tape is suspended between two supports rather than resting on the ground, gravity pulls the middle of the tape downward into a curve called a catenary. The length along the catenary (what the tape reads) is always greater than the straight-line chord distance between the endpoints. The sag correction formula is: Cs = −w² × L³ / (24 × P²), where w = weight of tape per unit length (lbs/ft), L = unsupported span length (ft), and P = applied tension (lbs). The sag correction is always negative because the curved tape reads longer than the true chord distance. Increasing tension reduces sag — the tape becomes straighter as you pull harder. There exists a specific tension called the "normal tension" at which the elongation due to tension exactly equals the shortening due to sag; at normal tension, the tape reads the correct distance even when unsupported. Normal tension is typically higher than standard tension. Example: w = 0.015 lbs/ft, L = 100 ft, P = 20 lbs: Cs = −(0.015)² × (100)³ / (24 × 20²) = −0.000225 × 1,000,000 / 9,600 = −0.023 ft. If the tape is supported on the ground (as in most land surveying), the sag correction is zero. Sag correction matters most on long suspended spans such as measurements across gullies, over fences, or in catenary-wire baseline measurements.',
 4,
 ARRAY['sag correction','catenary','chord distance','Cs','unsupported span','gravity','normal tension','tape weight','suspended tape','always negative']),

('acc03a01-0005-0000-0000-000000000001', 'acc03b01-0000-0000-0000-000000000001',
 'Applying Multiple Corrections — Combined Workflow',
 'In practice, multiple corrections may apply simultaneously. The corrected distance is: Dcorrected = Dmeasured + Ct + Cp + Cs. Each correction is computed independently and has its own sign. The workflow for a professional measurement is: (1) Record the observed distance and all field conditions (temperature, applied tension, support conditions, tape specifications). (2) Compute each applicable correction using the standard formulas. (3) Sum all corrections and add to the measured distance. (4) Document everything on the computation sheet — the observed value, each correction, and the final corrected distance. Clear documentation protects against errors and is required for professional certification standards. For example, a surveyor measures 500.00 ft at 95°F, pulling 25 lbs on a tape standardized at 10 lbs (A = 0.005 in²), with the tape fully supported. Ct = 0.00000645 × 27 × 500 = +0.087 ft. Cp = 15 × 500 / 145,000 = +0.052 ft. Cs = 0 (supported). Dcorrected = 500.00 + 0.087 + 0.052 = 500.14 ft. Always show your work on correction computations. On the SIT exam and in professional practice, partial credit is given for correct methodology even if arithmetic contains a minor error.',
 5,
 ARRAY['combined corrections','corrected distance','workflow','computation sheet','documentation','multiple corrections','sum','field conditions','professional practice']);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. QUIZ QUESTIONS (linked to topics via topic_id and study_references)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM question_bank
WHERE lesson_id = 'acc03b01-0000-0000-0000-000000000001'
  AND tags @> ARRAY['acc-srvy-1341','week-1','quiz'];

INSERT INTO question_bank (
  question_text, question_type, options, correct_answer, explanation, difficulty,
  module_id, lesson_id, topic_id, exam_category, tags, study_references
) VALUES

-- Q1: Measurement Procedure (Topic 1)
('When measuring with a chain or steel tape, what is the typical amount of tension that should be applied?',
 'multiple_choice',
 '["5 to 10 pounds","10 to 15 pounds","20 to 25 pounds","50 to 60 pounds"]'::jsonb,
 '20 to 25 pounds',
 'Standard field tension for a steel surveying tape is typically 20 to 25 pounds. This is sufficient to remove slack without overstretching the tape. A spring balance should be used to ensure consistent tension.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0001-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','measurement-procedure','tension'],
 '[{"type":"topic","id":"acc03a01-0001-0000-0000-000000000001","label":"Chain/Tape Measurement Principles and Procedure"}]'::jsonb),

-- Q2: Forward and Back (Topic 1)
('Why should every tape distance be measured both forward and back?',
 'multiple_choice',
 '["To average out temperature effects","To detect and eliminate blunders","To determine the slope angle","To calibrate the tape"]'::jsonb,
 'To detect and eliminate blunders',
 'Measuring forward and back provides an independent check on the measurement. If both values agree within tolerance, blunders (miscounts, misreads, misalignment) are unlikely. Temperature and other systematic errors affect both measurements equally and are corrected separately.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0001-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','forward-back','blunder-detection'],
 '[{"type":"topic","id":"acc03a01-0001-0000-0000-000000000001","label":"Chain/Tape Measurement Principles and Procedure"}]'::jsonb),

-- Q3: Standard Temperature (Topic 2)
('At what temperature are standard surveying steel tapes calibrated?',
 'multiple_choice',
 '["32°F","50°F","68°F","72°F"]'::jsonb,
 '68°F',
 'Standard steel tapes are manufactured and calibrated at 68°F (20°C). This is the reference temperature for the temperature correction formula. Any field temperature above or below 68°F requires a correction.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0002-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','standard-temperature','calibration'],
 '[{"type":"topic","id":"acc03a01-0002-0000-0000-000000000001","label":"Temperature Correction"}]'::jsonb),

-- Q4: Temperature Correction Sign (Topic 2)
('When the field temperature is above 68°F, the temperature correction is:',
 'multiple_choice',
 '["Positive — add to measured distance","Negative — subtract from measured distance","Zero — no correction needed","It depends on the tape length"]'::jsonb,
 'Positive — add to measured distance',
 'Above 68°F, the tape expands and becomes physically longer than standard. Each graduation mark spans more ground, so the tape reads shorter than reality. The correction is positive — you must add it to get the true (longer) distance.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0002-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','temperature-correction','sign-convention'],
 '[{"type":"topic","id":"acc03a01-0002-0000-0000-000000000001","label":"Temperature Correction"}]'::jsonb),

-- Q5: Temperature Correction Calculation (Topic 2)
('A surveyor measures 357.22 ft with the tape at 88°F. What is the temperature correction?',
 'numeric_input',
 '[]'::jsonb,
 '0.046',
 'Ct = 0.00000645 × (88 − 68) × 357.22 = 0.00000645 × 20 × 357.22 = 0.0461 ft. Rounded to three decimal places: +0.046 ft. The correction is positive because 88°F > 68°F.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0002-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','temperature-correction','calculation'],
 '[{"type":"topic","id":"acc03a01-0002-0000-0000-000000000001","label":"Temperature Correction"}]'::jsonb),

-- Q6: Temperature Correction Cold
('The same tape measures 357.22 ft at 48°F. What is the corrected distance?',
 'numeric_input',
 '[]'::jsonb,
 '357.17',
 'Ct = 0.00000645 × (48 − 68) × 357.22 = 0.00000645 × (−20) × 357.22 = −0.046 ft. Corrected distance = 357.22 + (−0.046) = 357.174 ft ≈ 357.17 ft.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0002-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','temperature-correction','cold-day'],
 '[{"type":"topic","id":"acc03a01-0002-0000-0000-000000000001","label":"Temperature Correction"},{"type":"topic","id":"acc03a01-0005-0000-0000-000000000001","label":"Applying Multiple Corrections — Combined Workflow"}]'::jsonb),

-- Q7: Sag Direction (Topic 4)
('The sag correction for a suspended tape is always:',
 'multiple_choice',
 '["Positive","Negative","Zero","It depends on the temperature"]'::jsonb,
 'Negative',
 'A suspended tape hangs in a catenary curve, which is longer than the straight-line chord. Since the tape reads the arc length but the true distance is the shorter chord, you must subtract the sag amount. Sag correction is always negative.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0004-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','sag-correction','sign'],
 '[{"type":"topic","id":"acc03a01-0004-0000-0000-000000000001","label":"Sag Correction"}]'::jsonb),

-- Q8: Tension Correction Concept (Topic 3)
('If a tape is pulled with MORE tension than its standard, the tension correction is:',
 'multiple_choice',
 '["Positive — the tape stretches and reads short","Negative — the tape compresses and reads long","Zero — tension does not affect the tape","Depends on temperature"]'::jsonb,
 'Positive — the tape stretches and reads short',
 'Over-pulling stretches the tape beyond its calibrated length. The stretched tape spans more ground per mark, so readings are shorter than reality. Correction Cp is positive to compensate.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0003-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','tension-correction','over-pulling'],
 '[{"type":"topic","id":"acc03a01-0003-0000-0000-000000000001","label":"Tension (Pull) Correction"}]'::jsonb),

-- Q9: Tension Correction Calc (Topic 3)
('A tape has standard tension Ps = 10 lbs, cross-section A = 0.005 in², E = 29,000,000 psi. If pulled at 25 lbs over a distance of 500 ft, what is the tension correction?',
 'numeric_input',
 '[]'::jsonb,
 '0.052',
 'Cp = (P − Ps) × L / (A × E) = (25 − 10) × 500 / (0.005 × 29,000,000) = 15 × 500 / 145,000 = 7,500 / 145,000 = 0.0517 ft ≈ 0.052 ft. Positive because P > Ps.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0003-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','tension-correction','calculation'],
 '[{"type":"topic","id":"acc03a01-0003-0000-0000-000000000001","label":"Tension (Pull) Correction"}]'::jsonb),

-- Q10: Sag Correction Calc (Topic 4)
('A tape weighing 0.015 lbs/ft is suspended over a 100-ft span with 20 lbs of tension. What is the sag correction?',
 'numeric_input',
 '[]'::jsonb,
 '-0.023',
 'Cs = −w² × L³ / (24 × P²) = −(0.015)² × (100)³ / (24 × 20²) = −0.000225 × 1,000,000 / 9,600 = −225 / 9,600 = −0.0234 ft ≈ −0.023 ft.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0004-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','sag-correction','calculation'],
 '[{"type":"topic","id":"acc03a01-0004-0000-0000-000000000001","label":"Sag Correction"}]'::jsonb),

-- Q11: Combined Corrections (Topic 5)
('When applying chain corrections, the corrected distance equals:',
 'multiple_choice',
 '["Measured − Ct − Cp − Cs","Measured + Ct + Cp + Cs","Measured × Ct × Cp × Cs","Measured / (Ct + Cp + Cs)"]'::jsonb,
 'Measured + Ct + Cp + Cs',
 'Each correction has its own sign (positive or negative). You simply add all corrections to the measured distance: Dcorrected = Dmeasured + Ct + Cp + Cs. The signs of the individual corrections handle the direction automatically.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','combined-corrections','formula'],
 '[{"type":"topic","id":"acc03a01-0005-0000-0000-000000000001","label":"Applying Multiple Corrections — Combined Workflow"}]'::jsonb),

-- Q12: True/False — Sag on ground
('If the tape is fully supported on the ground, the sag correction is zero.',
 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'Sag occurs only when the tape is suspended between supports. When the tape rests on the ground, there is no catenary curve, so the sag correction is zero.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0004-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','sag-correction','supported-tape'],
 '[{"type":"topic","id":"acc03a01-0004-0000-0000-000000000001","label":"Sag Correction"}]'::jsonb),

-- Q13: Combined Calculation (Topic 5)
('A surveyor measures 500.00 ft at 95°F with 25 lbs tension (Ps=10, A=0.005 in², tape fully supported). What is the corrected distance?',
 'numeric_input',
 '[]'::jsonb,
 '500.14',
 'Ct = 0.00000645 × (95-68) × 500 = +0.087 ft. Cp = (25-10) × 500 / (0.005 × 29,000,000) = +0.052 ft. Cs = 0. Dcorrected = 500.00 + 0.087 + 0.052 = 500.139 ≈ 500.14 ft.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','combined-corrections','full-calculation'],
 '[{"type":"topic","id":"acc03a01-0002-0000-0000-000000000001","label":"Temperature Correction"},{"type":"topic","id":"acc03a01-0003-0000-0000-000000000001","label":"Tension (Pull) Correction"},{"type":"topic","id":"acc03a01-0005-0000-0000-000000000001","label":"Applying Multiple Corrections — Combined Workflow"}]'::jsonb),

-- Q14: Systematic errors
('Chain corrections for temperature, tension, and sag correct what type of error?',
 'multiple_choice',
 '["Random errors","Systematic errors","Blunders","Probable errors"]'::jsonb,
 'Systematic errors',
 'Temperature, tension, and sag produce systematic errors — they push the measurement in a predictable direction that depends on measurable conditions. Because they are predictable, they can be mathematically corrected.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0001-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','quiz','systematic-error','correction-type'],
 '[{"type":"topic","id":"acc03a01-0001-0000-0000-000000000001","label":"Chain/Tape Measurement Principles and Procedure"}]'::jsonb);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. PRACTICE PROBLEMS
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM question_bank
WHERE lesson_id = 'acc03b01-0000-0000-0000-000000000001'
  AND tags @> ARRAY['acc-srvy-1341','week-1','practice'];

INSERT INTO question_bank (
  question_text, question_type, options, correct_answer, explanation, difficulty,
  module_id, lesson_id, topic_id, exam_category, tags, study_references
) VALUES

('A distance of 250.00 ft is measured at 100°F. Calculate the temperature correction.',
 'numeric_input', '[]'::jsonb, '0.052',
 'Ct = 0.00000645 × (100 − 68) × 250 = 0.00000645 × 32 × 250 = 0.0516 ft ≈ +0.052 ft.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0002-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','practice','temperature-correction'],
 '[{"type":"topic","id":"acc03a01-0002-0000-0000-000000000001","label":"Temperature Correction"}]'::jsonb),

('A distance of 800.00 ft is measured at 30°F. What is the corrected distance?',
 'numeric_input', '[]'::jsonb, '799.80',
 'Ct = 0.00000645 × (30 − 68) × 800 = 0.00000645 × (−38) × 800 = −0.196 ft. Corrected = 800.00 − 0.196 = 799.804 ft ≈ 799.80 ft.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0002-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','practice','temperature-correction','cold'],
 '[{"type":"topic","id":"acc03a01-0002-0000-0000-000000000001","label":"Temperature Correction"}]'::jsonb),

('A 300-ft distance is measured with 30 lbs tension. The tape standard tension is 15 lbs, A = 0.003 in², E = 29,000,000 psi. What is the tension correction?',
 'numeric_input', '[]'::jsonb, '0.052',
 'Cp = (30 − 15) × 300 / (0.003 × 29,000,000) = 4,500 / 87,000 = 0.0517 ft ≈ +0.052 ft.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0003-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','practice','tension-correction'],
 '[{"type":"topic","id":"acc03a01-0003-0000-0000-000000000001","label":"Tension (Pull) Correction"}]'::jsonb),

('A tape weighing 0.02 lbs/ft is suspended over a 100-ft span at 15 lbs tension. What is the sag correction?',
 'numeric_input', '[]'::jsonb, '-0.074',
 'Cs = −(0.02)² × (100)³ / (24 × 15²) = −0.0004 × 1,000,000 / 5,400 = −0.0741 ft ≈ −0.074 ft.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0004-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','practice','sag-correction'],
 '[{"type":"topic","id":"acc03a01-0004-0000-0000-000000000001","label":"Sag Correction"}]'::jsonb),

('A 600-ft distance is measured at 90°F, 20 lbs tension (Ps=10, A=0.005 in²), tape on ground. What is the corrected distance?',
 'numeric_input', '[]'::jsonb, '600.13',
 'Ct = 0.00000645 × 22 × 600 = +0.085 ft. Cp = 10 × 600 / 145,000 = +0.041 ft. Cs = 0. Dcorrected = 600.00 + 0.085 + 0.041 = 600.126 ≈ 600.13 ft.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','practice','combined-corrections'],
 '[{"type":"topic","id":"acc03a01-0002-0000-0000-000000000001","label":"Temperature Correction"},{"type":"topic","id":"acc03a01-0003-0000-0000-000000000001","label":"Tension (Pull) Correction"},{"type":"topic","id":"acc03a01-0005-0000-0000-000000000001","label":"Applying Multiple Corrections — Combined Workflow"}]'::jsonb),

('A temperature below 68°F causes the steel tape to expand, making readings too long.',
 'true_false', '["True","False"]'::jsonb, 'False',
 'Below 68°F, the tape contracts (gets shorter), not expands. The shortened tape reads LONGER than the true distance because its graduations are squeezed closer together. The correction is negative.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0002-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','practice','temperature-correction','sign'],
 '[{"type":"topic","id":"acc03a01-0002-0000-0000-000000000001","label":"Temperature Correction"}]'::jsonb),

('What is "normal tension" in the context of tape measurement?',
 'multiple_choice',
 '["The standard tension printed on the tape","The tension at which sag correction equals tension correction","The maximum safe tension for the tape","The tension used in EDM measurement"]'::jsonb,
 'The tension at which sag correction equals tension correction',
 'Normal tension is the specific pull at which the positive elongation from tension exactly cancels the negative shortening from sag. At normal tension, the tape reads the correct distance even when unsupported.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0004-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','practice','normal-tension','sag'],
 '[{"type":"topic","id":"acc03a01-0004-0000-0000-000000000001","label":"Sag Correction"},{"type":"topic","id":"acc03a01-0003-0000-0000-000000000001","label":"Tension (Pull) Correction"}]'::jsonb),

('Explain why a professional surveyor must apply chain corrections rather than just accepting the raw tape reading. Describe each of the three main corrections and when each is most significant.',
 'essay', '[]'::jsonb,
 'A professional surveyor must apply chain corrections because a steel tape is a physical object that changes length with conditions. The three corrections are: (1) Temperature correction — steel expands/contracts with temperature; significant on hot or cold days and long measurements. (2) Tension correction — applying more or less pull than standard stretches or relaxes the tape; significant when applied tension differs greatly from standard. (3) Sag correction — a suspended tape forms a catenary curve longer than the chord; significant on long unsupported spans. Uncorrected systematic errors accumulate over a traverse and can cause the survey to fail accuracy standards.',
  'A strong answer should name all three corrections (temperature, tension, sag), explain when each matters most, and note that uncorrected systematic errors accumulate over long traverses.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 'acc03a01-0005-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-1','practice','essay','all-corrections'],
 '[{"type":"topic","id":"acc03a01-0001-0000-0000-000000000001","label":"Chain/Tape Measurement Principles and Procedure"},{"type":"topic","id":"acc03a01-0002-0000-0000-000000000001","label":"Temperature Correction"},{"type":"topic","id":"acc03a01-0003-0000-0000-000000000001","label":"Tension (Pull) Correction"},{"type":"topic","id":"acc03a01-0004-0000-0000-000000000001","label":"Sag Correction"},{"type":"topic","id":"acc03a01-0005-0000-0000-000000000001","label":"Applying Multiple Corrections — Combined Workflow"}]'::jsonb);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. FLASHCARDS (auto-discovered when lesson is completed)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM flashcards
WHERE lesson_id = 'acc03b01-0000-0000-0000-000000000001';

INSERT INTO flashcards (id, term, definition, hint_1, hint_2, hint_3, module_id, lesson_id, keywords, tags, category) VALUES

('fc010001-0000-0000-0000-000000000001',
 'Standard Temperature for Steel Tape',
 '68°F (20°C). Steel surveying tapes are manufactured and calibrated at this temperature. Any field temperature above or below 68°F requires a temperature correction.',
 'It is the same as "room temperature" in many standards',
 'The formula uses (TF - ?) in the temperature correction',
 'Sixty-eight degrees Fahrenheit',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 ARRAY['standard temperature','68°F','20°C','calibration','steel tape'],
 ARRAY['acc-srvy-1341','week-1','chaining'], 'surveying'),

('fc010002-0000-0000-0000-000000000001',
 'Temperature Correction Formula (Ct)',
 'Ct = 0.00000645 × (TF − 68) × L, where TF is field temperature in °F, L is measured distance in feet, and 0.00000645 is the coefficient of thermal expansion for steel per °F.',
 'The coefficient is approximately 6.45 × 10⁻⁶',
 'Positive when hot (above 68°F), negative when cold',
 'Ct = α × ΔT × L',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 ARRAY['temperature correction','Ct','thermal expansion','coefficient','formula'],
 ARRAY['acc-srvy-1341','week-1','chaining','formula'], 'surveying'),

('fc010003-0000-0000-0000-000000000001',
 'Tension (Pull) Correction Formula (Cp)',
 'Cp = (P − Ps) × L / (A × E), where P = applied tension, Ps = standard tension, L = distance, A = cross-sectional area of tape, E = modulus of elasticity of steel (≈ 29,000,000 psi).',
 'Based on Hooke''s Law of elastic deformation',
 'Positive when over-pulling (P > Ps)',
 'The modulus of elasticity E for steel is about 29 million psi',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 ARRAY['tension correction','pull correction','Cp','Hooke''s law','modulus of elasticity'],
 ARRAY['acc-srvy-1341','week-1','chaining','formula'], 'surveying'),

('fc010004-0000-0000-0000-000000000001',
 'Sag Correction Formula (Cs)',
 'Cs = −w² × L³ / (24 × P²), where w = weight of tape per foot (lbs/ft), L = unsupported span (ft), P = applied tension (lbs). Always negative because the catenary arc is longer than the chord.',
 'This correction is ALWAYS negative',
 'Applies only when the tape is suspended, not when lying on the ground',
 'Increasing tension reduces sag',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 ARRAY['sag correction','Cs','catenary','chord','suspended tape','always negative'],
 ARRAY['acc-srvy-1341','week-1','chaining','formula'], 'surveying'),

('fc010005-0000-0000-0000-000000000001',
 'Corrected Distance Formula',
 'Dcorrected = Dmeasured + Ct + Cp + Cs. Each correction has its own sign (positive or negative). Simply add all corrections to the measured distance.',
 'Sum all corrections — do not multiply them',
 'Each correction''s sign handles the direction automatically',
 'Think of it as Measured + Temperature + Tension + Sag',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 ARRAY['corrected distance','combined corrections','formula','Dcorrected'],
 ARRAY['acc-srvy-1341','week-1','chaining','formula'], 'surveying'),

('fc010006-0000-0000-0000-000000000001',
 'Why Measure Forward and Back?',
 'Measuring every distance forward and back detects and eliminates blunders such as miscounts, misreads, and misalignment. If both values agree within tolerance, the measurement is accepted. This is the surveyor''s "measure twice, cut once."',
 'It catches mistakes, not systematic errors',
 'Temperature affects both measurements equally',
 'The two values should agree within the required tolerance',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 ARRAY['forward and back','blunder detection','measurement procedure','quality control'],
 ARRAY['acc-srvy-1341','week-1','chaining'], 'surveying'),

('fc010007-0000-0000-0000-000000000001',
 'Standard Field Tension',
 'Typically 20 to 25 pounds of pull. This is the amount of tension applied to a steel tape during field measurement. A spring balance (tension handle) should be used to ensure consistent pull.',
 'Not too much (stretches tape), not too little (causes slack)',
 'A spring balance is used to verify the tension',
 'Twenty to twenty-five pounds',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 ARRAY['field tension','20 pounds','25 pounds','spring balance','tension handle'],
 ARRAY['acc-srvy-1341','week-1','chaining'], 'surveying'),

('fc010008-0000-0000-0000-000000000001',
 'Systematic Error vs. Random Error vs. Blunder',
 'Systematic errors are predictable and always push measurements in the same direction (temperature, tension, sag) — they can be corrected mathematically. Random errors are unpredictable small variations that follow a normal distribution. Blunders are gross mistakes (misreading, miscounting) caught by redundant measurements.',
 'Temperature, tension, and sag are all systematic errors',
 'Measuring forward and back catches blunders',
 'Systematic = correctable, Random = unavoidable, Blunder = mistake',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 ARRAY['systematic error','random error','blunder','error types','correction'],
 ARRAY['acc-srvy-1341','week-1','chaining'], 'surveying'),

('fc010009-0000-0000-0000-000000000001',
 'Normal Tension',
 'The specific tension at which the positive elongation from over-pulling exactly cancels the negative shortening from sag. At normal tension, a suspended tape reads the correct distance without any corrections. Normal tension is typically higher than standard tension.',
 'It is where sag correction equals tension correction (in magnitude)',
 'Higher than the standard tension printed on the tape',
 'At this tension, Cp + Cs = 0',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 ARRAY['normal tension','sag','tension','equilibrium','suspended tape'],
 ARRAY['acc-srvy-1341','week-1','chaining'], 'surveying'),

('fc010010-0000-0000-0000-000000000001',
 'Catenary Curve',
 'The natural curve formed by a flexible chain or tape hanging under its own weight between two support points. The length along the catenary is always greater than the straight-line chord distance, which is why sag correction is always negative.',
 'Named from the Latin word "catena" meaning chain',
 'This is why sag correction subtracts from the measured distance',
 'Think of a clothesline sagging between two poles',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 ARRAY['catenary','sag','curve','chain','suspended','gravity'],
 ARRAY['acc-srvy-1341','week-1','chaining'], 'surveying'),

('fc010011-0000-0000-0000-000000000001',
 'Breaking Chain',
 'A technique for measuring on sloped terrain by holding the tape level and measuring in short horizontal segments. Each segment is marked with a plumb bob, and the partial measurements are summed. This avoids the need for slope corrections.',
 'Used on steep terrain instead of measuring along the slope',
 'A plumb bob marks each segment''s endpoint on the ground',
 'The alternative is to measure the slope distance and apply a slope correction',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 ARRAY['breaking chain','slope','horizontal measurement','plumb bob','terrain'],
 ARRAY['acc-srvy-1341','week-1','chaining'], 'surveying'),

('fc010012-0000-0000-0000-000000000001',
 'Modulus of Elasticity (E) for Steel',
 'Approximately 29,000,000 psi (29 × 10⁶ psi). This is a material property of steel that measures its stiffness — how much it resists elastic deformation. Used in the tension correction formula: Cp = (P − Ps) × L / (A × E).',
 'About 29 million pounds per square inch',
 'It appears in the denominator of the tension correction formula',
 'A higher E means the material is stiffer and deforms less under tension',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 ARRAY['modulus of elasticity','29000000 psi','steel','stiffness','tension correction'],
 ARRAY['acc-srvy-1341','week-1','chaining','formula'], 'surveying'),

('fc010013-0000-0000-0000-000000000001',
 'Temperature Correction Sign Convention',
 'Above 68°F → tape expands → reads short → correction is POSITIVE (add). Below 68°F → tape contracts → reads long → correction is NEGATIVE (subtract). The formula''s sign handles this automatically via (TF − 68).',
 'Hot = tape longer = reads short = add correction',
 'Cold = tape shorter = reads long = subtract correction',
 'The sign comes naturally from (TF - 68) in the formula',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 ARRAY['temperature correction','sign convention','positive','negative','hot','cold'],
 ARRAY['acc-srvy-1341','week-1','chaining'], 'surveying'),

('fc010014-0000-0000-0000-000000000001',
 'Coefficient of Thermal Expansion for Steel',
 '0.00000645 per °F (6.45 × 10⁻⁶ /°F). This means that for every degree Fahrenheit above or below the standard temperature, each foot of steel changes length by 0.00000645 feet.',
 'About 6.45 millionths per degree Fahrenheit',
 'The same value used in the temperature correction formula',
 'For a 100-ft tape at 20°F above standard: 100 × 0.00000645 × 20 = 0.013 ft change',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 ARRAY['thermal expansion coefficient','0.00000645','steel','temperature'],
 ARRAY['acc-srvy-1341','week-1','chaining','formula'], 'surveying'),

('fc010015-0000-0000-0000-000000000001',
 'Cross-Sectional Area of a Tape (A)',
 'The cross-sectional area of the steel tape in square inches, computed as width × thickness. Used in the tension correction formula: Cp = (P − Ps) × L / (A × E). Typical values range from 0.003 to 0.006 in². Provided by the manufacturer or measured directly.',
 'Computed as tape width times tape thickness',
 'Appears in the denominator of the tension correction formula',
 'A thicker tape has a larger A and deforms less under the same tension',
 'acc00003-0000-0000-0000-000000000003', 'acc03b01-0000-0000-0000-000000000001',
 ARRAY['cross-sectional area','tape','width','thickness','tension correction'],
 ARRAY['acc-srvy-1341','week-1','chaining'], 'surveying');

COMMIT;
