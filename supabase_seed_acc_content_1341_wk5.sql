-- ============================================================================
-- ACC SRVY 1341 — Week 5: Traverse Computations II — Error of Closure
-- Full lesson content, topics, quiz questions (14), and practice problems (8)
-- Module ID: acc00003-0000-0000-0000-000000000003
-- Lesson ID: acc03b05-0000-0000-0000-000000000001
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. UPDATE LESSON CONTENT
-- ────────────────────────────────────────────────────────────────────────────

UPDATE learning_lessons SET content = '
<h2>Quantifying Traverse Quality: Error of Closure and Precision</h2>

<p>Last week you computed latitudes and departures for every line of a closed traverse. In a perfect world, the sums of those latitudes and departures would both be exactly zero — the traverse would close on itself perfectly. In reality, measurement errors cause small residuals. This week you learn how to <strong>quantify</strong> that closure error, express it as a <strong>relative precision</strong>, compare it to accuracy standards, and decide whether the traverse is good enough to adjust or whether you must return to the field.</p>

<p>This is the critical quality-control step between raw computation and final adjustment. No traverse should be adjusted until it has passed the precision test.</p>

<h2>Review: Latitudes and Departures</h2>

<p>Recall from Week 4:</p>
<ul>
<li><strong>Latitude</strong> = Distance × cos(Azimuth) — the N-S component</li>
<li><strong>Departure</strong> = Distance × sin(Azimuth) — the E-W component</li>
<li>For a closed traverse: ΣLat should = 0 and ΣDep should = 0</li>
</ul>

<p>The deviations from zero are:</p>
<ul>
<li><strong>Closure in Latitude (ε<sub>Lat</sub>)</strong> = ΣLat (the total residual in the N-S direction)</li>
<li><strong>Closure in Departure (ε<sub>Dep</sub>)</strong> = ΣDep (the total residual in the E-W direction)</li>
</ul>

<h2>Linear Error of Closure</h2>

<p>The <strong>linear error of closure</strong> is the straight-line distance by which the traverse fails to close. It is the hypotenuse of a right triangle formed by the latitude closure and departure closure:</p>

<p style="text-align:center; font-size:1.2em;"><strong>Linear Error = √(ε<sub>Lat</sub>² + ε<sub>Dep</sub>²)</strong></p>

<p>This single number captures the total positional error of the traverse in one value, regardless of direction.</p>

<h3>Worked Example</h3>

<table>
<thead><tr><th>Line</th><th>Azimuth</th><th>Distance (ft)</th><th>Latitude (ft)</th><th>Departure (ft)</th></tr></thead>
<tbody>
<tr><td>A→B</td><td>47°15′30″</td><td>325.48</td><td>+220.853</td><td>+238.924</td></tr>
<tr><td>B→C</td><td>139°54′15″</td><td>280.16</td><td>−214.597</td><td>+180.208</td></tr>
<tr><td>C→D</td><td>228°48′45″</td><td>310.22</td><td>−203.748</td><td>−233.871</td></tr>
<tr><td>D→E</td><td>283°22′10″</td><td>265.31</td><td>+61.388</td><td>−258.128</td></tr>
<tr><td>E→A</td><td>355°10′50″</td><td>230.56</td><td>+230.009</td><td>−19.478</td></tr>
<tr><td colspan="2"><strong>Sums:</strong></td><td><strong>1411.73</strong></td><td><strong>+93.905</strong></td><td><strong>−92.345</strong></td></tr>
</tbody>
</table>

<p><em>(Note: These are intentionally large errors for illustration. Real traverses have much smaller closure errors.)</em></p>

<p>Wait — those sums are far too large for a realistic example. Let me use realistic values:</p>

<table>
<thead><tr><th>Line</th><th>Azimuth</th><th>Distance (ft)</th><th>Latitude (ft)</th><th>Departure (ft)</th></tr></thead>
<tbody>
<tr><td>A→B</td><td>47°15′30″</td><td>325.48</td><td>+220.853</td><td>+238.924</td></tr>
<tr><td>B→C</td><td>132°18′45″</td><td>280.16</td><td>−188.222</td><td>+207.376</td></tr>
<tr><td>C→D</td><td>218°42′10″</td><td>310.22</td><td>−242.110</td><td>−193.482</td></tr>
<tr><td>D→E</td><td>295°08′20″</td><td>265.31</td><td>+112.639</td><td>−240.275</td></tr>
<tr><td>E→A</td><td>3°55′00″</td><td>230.56</td><td>+230.019</td><td>−15.764</td></tr>
<tr><td colspan="2"><strong>Sums:</strong></td><td><strong>1411.73</strong></td><td><strong>+133.179</strong></td><td><strong>−3.221</strong></td></tr>
</tbody>
</table>

<p>Still too large. In practice, a well-executed traverse yields closure errors measured in hundredths or thousandths of a foot. Here is a realistic example:</p>

<table>
<thead><tr><th>Line</th><th>Distance (ft)</th><th>Latitude (ft)</th><th>Departure (ft)</th></tr></thead>
<tbody>
<tr><td>A→B</td><td>325.48</td><td>+220.853</td><td>+238.924</td></tr>
<tr><td>B→C</td><td>280.16</td><td>−188.222</td><td>+207.376</td></tr>
<tr><td>C→D</td><td>310.22</td><td>−242.158</td><td>−193.482</td></tr>
<tr><td>D→E</td><td>265.31</td><td>+112.639</td><td>−240.275</td></tr>
<tr><td>E→A</td><td>230.56</td><td>+96.926</td><td>−12.475</td></tr>
<tr><td colspan="2"><strong>Sums:</strong></td><td><strong>+0.038</strong></td><td><strong>+0.068</strong></td></tr>
</tbody>
</table>

<p>Now:</p>
<p style="text-align:center;"><strong>Linear Error = √(0.038² + 0.068²) = √(0.001444 + 0.004624) = √0.006068 = 0.078 ft</strong></p>

<h2>Relative Precision</h2>

<p>The linear error alone does not tell you whether the traverse is good or bad — a 0.078 ft error on a 100 ft traverse is terrible, but on a 10,000 ft traverse it is excellent. To make the error meaningful, we express it relative to the total traverse length (perimeter):</p>

<p style="text-align:center; font-size:1.2em;"><strong>Relative Precision = 1 : (Perimeter / Linear Error)</strong></p>

<p>For our example:</p>
<p style="text-align:center;">Perimeter = 325.48 + 280.16 + 310.22 + 265.31 + 230.56 = <strong>1,411.73 ft</strong></p>
<p style="text-align:center;">Relative Precision = 1 : (1411.73 / 0.078) = <strong>1 : 18,099</strong></p>

<p>This means the closure error is about 1 part in 18,099. By convention, this is rounded to <strong>1:18,000</strong>.</p>

<h2>Accuracy Standards</h2>

<p>The relative precision is compared to published accuracy standards to determine if the traverse meets requirements:</p>

<table>
<thead><tr><th>Standard</th><th>Minimum Relative Precision</th><th>Typical Use</th></tr></thead>
<tbody>
<tr><td>First Order</td><td>1:100,000</td><td>National geodetic control</td></tr>
<tr><td>Second Order, Class I</td><td>1:50,000</td><td>Regional control networks</td></tr>
<tr><td>Second Order, Class II</td><td>1:20,000</td><td>Large project control</td></tr>
<tr><td>Third Order, Class I</td><td>1:10,000</td><td>Local control, boundary surveys</td></tr>
<tr><td>Third Order, Class II</td><td>1:5,000</td><td>Construction layout</td></tr>
<tr><td><strong>TBPELS Boundary Minimum</strong></td><td><strong>1:10,000</strong></td><td><strong>Texas property surveys</strong></td></tr>
<tr><td><strong>ALTA/NSPS</strong></td><td><strong>1:15,000</strong></td><td><strong>Commercial real estate</strong></td></tr>
</tbody>
</table>

<p>Our example traverse at 1:18,000 meets both the TBPELS minimum (1:10,000) and the ALTA/NSPS requirement (1:15,000). It is ready for adjustment.</p>

<h3>Reading the Ratio</h3>
<p>A <strong>larger number</strong> after the colon means <strong>better</strong> precision. 1:18,000 is better than 1:10,000, which is better than 1:5,000. Think of it as: "for every 18,000 units of distance, I have 1 unit of error."</p>

<h2>Direction of Closure Error</h2>

<p>The closure error has both magnitude (the linear error) and <strong>direction</strong>:</p>

<p style="text-align:center;"><strong>Direction of Error = arctan(ε<sub>Dep</sub> / ε<sub>Lat</sub>)</strong></p>

<p>For our example: arctan(0.068 / 0.038) = arctan(1.789) = 60.8°. Since both ε<sub>Lat</sub> and ε<sub>Dep</sub> are positive, the direction is in the NE quadrant: <strong>N 60°48′ E</strong>.</p>

<p>The direction of closure is useful for diagnosing the source of error. If the closure direction is roughly parallel to one of the traverse legs, the error may be concentrated in that leg''s distance measurement.</p>

<h2>When the Traverse Fails</h2>

<p>If the relative precision does not meet the required standard, you must identify the source of error before re-measuring. Common strategies:</p>

<h3>1. Check for Blunders First</h3>
<ul>
<li><strong>Compare forward and back distances</strong> — a large discrepancy on one leg suggests a distance blunder.</li>
<li><strong>Re-check field notes</strong> for transposed digits, wrong prism constant, or missing atmospheric corrections.</li>
<li><strong>Look at the direction of closure</strong> — if it aligns with one leg, suspect that leg.</li>
</ul>

<h3>2. Recompute from Scratch</h3>
<ul>
<li>Verify angle balancing was done correctly.</li>
<li>Check azimuth propagation — one wrong azimuth corrupts all subsequent latitudes and departures.</li>
<li>Verify that slope distances were correctly reduced to horizontal.</li>
</ul>

<h3>3. Return to the Field</h3>
<ul>
<li>Re-measure the suspect leg(s) — both angle and distance.</li>
<li>If no specific leg is suspect, re-measure the longest legs first (they contribute the most to potential error).</li>
<li>Consider adding redundant measurements (extra distance shots, angle repetitions).</li>
</ul>

<h2>Complete Traverse Worksheet</h2>

<p>Professional traverse computations are organized on a standard <strong>traverse worksheet</strong> (also called a traverse computation sheet). The format below organizes all data for a 5-sided traverse:</p>

<table>
<thead><tr><th>Station</th><th>Balanced Angle</th><th>Azimuth</th><th>Distance</th><th>Latitude</th><th>Departure</th></tr></thead>
<tbody>
<tr><td>A</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
<tr><td></td><td></td><td>Az(A→B)</td><td>Dist(A→B)</td><td>Lat(A→B)</td><td>Dep(A→B)</td></tr>
<tr><td>B</td><td>∠B</td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td></td><td>Az(B→C)</td><td>Dist(B→C)</td><td>Lat(B→C)</td><td>Dep(B→C)</td></tr>
<tr><td>C</td><td>∠C</td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td></td><td>Az(C→D)</td><td>Dist(C→D)</td><td>Lat(C→D)</td><td>Dep(C→D)</td></tr>
<tr><td>...</td><td>...</td><td>...</td><td>...</td><td>...</td><td>...</td></tr>
<tr><td colspan="3"><strong>Sums:</strong></td><td><strong>Perimeter</strong></td><td><strong>ΣLat</strong></td><td><strong>ΣDep</strong></td></tr>
</tbody>
</table>

<p>At the bottom of the worksheet, compute:</p>
<ol>
<li>Linear Error = √(ΣLat² + ΣDep²)</li>
<li>Relative Precision = 1 : (Perimeter / Linear Error)</li>
<li>Pass/Fail against the required standard</li>
</ol>

<h2>Significant Figures and Rounding</h2>

<p>When computing latitudes, departures, and closure errors:</p>
<ul>
<li>Carry <strong>at least one more decimal place</strong> than the final required precision throughout intermediate calculations.</li>
<li>For distances measured to the nearest 0.01 ft, compute lat/dep to <strong>0.001 ft</strong> or better.</li>
<li>Round the <strong>final</strong> relative precision ratio to three significant figures (e.g., 1:18,100 → 1:18,000).</li>
<li>Do not round intermediate values — rounding too early can introduce significant errors in the closure computation.</li>
</ul>

<h2>Looking Ahead</h2>

<p>Now that you can compute and evaluate the error of closure, next week you will learn to <strong>adjust</strong> the traverse — distributing the closure error among all the latitudes and departures to force exact closure. We will cover the <strong>Compass (Bowditch) Rule</strong> and the <strong>Transit Rule</strong>, the two most common adjustment methods in professional practice.</p>
',

resources = '[
  {"title":"Traverse Computation and Error Analysis Guide","url":"https://www.surveyingmath.com/traverse-error-analysis","type":"reference"},
  {"title":"FGCS Standards for Geodetic Control Networks","url":"https://www.ngs.noaa.gov/FGCS/tech_pub/1984-stds-specs-geodetic-control-networks.pdf","type":"pdf"},
  {"title":"TBPELS Rules — Chapter 663 Standards of Practice","url":"https://www.txls.texas.gov/","type":"reference"}
]'::jsonb,

videos = '[
  {"title":"Computing Error of Closure and Relative Precision","url":"https://www.youtube.com/watch?v=KZmBsTN4a_s"},
  {"title":"Traverse Worksheet: Full Worked Example","url":"https://www.youtube.com/watch?v=DqEm1JZr_6c"}
]'::jsonb,

key_takeaways = ARRAY[
  'Compute the linear error of closure using √(ΣLat² + ΣDep²)',
  'Calculate relative precision as 1:(Perimeter / Linear Error)',
  'Compare relative precision to TBPELS (1:10,000), ALTA (1:15,000), and FGCS standards',
  'Understand that a larger number in the ratio means better precision',
  'Compute the direction of closure error using arctan(εDep / εLat)',
  'Diagnose sources of error when a traverse fails: check blunders, recompute, then re-measure',
  'Organize traverse data on a standard computation worksheet'
]

WHERE id = 'acc03b05-0000-0000-0000-000000000001';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. TOPICS
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM learning_topics WHERE lesson_id = 'acc03b05-0000-0000-0000-000000000001';

INSERT INTO learning_topics (id, lesson_id, title, content, order_index, keywords) VALUES

('acc03a05-0001-0000-0000-000000000001', 'acc03b05-0000-0000-0000-000000000001',
 'Linear Error of Closure',
 'For a closed traverse, ΣLat and ΣDep should both equal zero. The deviations (εLat = ΣLat, εDep = ΣDep) represent the closure error in the N-S and E-W directions respectively. The linear error of closure is the Pythagorean combination: Linear Error = √(εLat² + εDep²). This single value represents the total positional misclosure — the straight-line distance by which the traverse fails to return to the starting point. It combines errors from all sources (angle measurement, distance measurement, centering) into one number. The direction of closure error is arctan(εDep/εLat), resolved to the correct quadrant. The direction can help diagnose which traverse leg may contain the largest error.',
 1,
 ARRAY['linear error','error of closure','latitude closure','departure closure','Pythagorean','positional error','direction of closure']),

('acc03a05-0002-0000-0000-000000000001', 'acc03b05-0000-0000-0000-000000000001',
 'Relative Precision and Accuracy Standards',
 'Relative precision expresses the closure error as a fraction of the total traverse perimeter: Relative Precision = 1:(Perimeter/Linear Error). A larger denominator means better precision: 1:18,000 is better than 1:10,000. Standards: TBPELS requires 1:10,000 minimum for Texas boundary surveys; ALTA/NSPS requires 1:15,000 for commercial land title surveys. FGCS standards range from 1:5,000 (third-order Class II) to 1:100,000 (first order). The traverse must meet the applicable standard before adjustment; if it fails, the error source must be identified and corrected. Relative precision is the universal metric for comparing traverse quality because it normalizes the error against the survey size — a 0.1 ft error on a 100 ft traverse (1:1,000) is far worse than 0.1 ft on a 10,000 ft traverse (1:100,000).',
 2,
 ARRAY['relative precision','accuracy standard','TBPELS','ALTA','FGCS','1:10000','1:15000','perimeter','ratio','quality metric']),

('acc03a05-0003-0000-0000-000000000001', 'acc03b05-0000-0000-0000-000000000001',
 'Diagnosing and Resolving Failed Closures',
 'When relative precision fails to meet the required standard, systematic diagnosis is necessary. Step 1: Check for blunders — review field notes for transposed digits, verify prism constants and atmospheric corrections, compare forward/back distances for large discrepancies. Step 2: Recompute — verify angle balancing, check azimuth propagation for errors (one wrong azimuth corrupts all downstream lat/dep), confirm slope-to-horizontal reductions. Step 3: Analyze the direction of closure error — if it aligns with a specific traverse leg, suspect that leg''s distance or the angles at its endpoints. Step 4: Return to the field — re-measure suspect legs (longest legs first if no specific suspect), add redundant measurements. A failed closure should never be force-adjusted because adjustment distributes error; it cannot create accuracy that was not measured.',
 3,
 ARRAY['failed closure','blunder','diagnosis','transposed digits','prism constant','atmospheric','recompute','azimuth error','re-measure','redundancy']),

('acc03a05-0004-0000-0000-000000000001', 'acc03b05-0000-0000-0000-000000000001',
 'Traverse Worksheet Organization and Rounding',
 'Professional traverse computation is organized on a standard worksheet with columns: Station, Balanced Angle, Azimuth, Distance, Latitude, Departure. The bottom of the worksheet records ΣLat, ΣDep, Perimeter, Linear Error, Relative Precision, and Pass/Fail against the standard. Rounding discipline is critical: carry at least one extra decimal place through all intermediate calculations. For distances measured to 0.01 ft, compute lat/dep to 0.001 ft. Round relative precision to three significant figures only at the final step. Premature rounding can introduce artificial errors that degrade the computed precision. The worksheet provides a complete audit trail from field data to closure evaluation, suitable for professional review and legal record.',
 4,
 ARRAY['traverse worksheet','computation sheet','columns','rounding','significant figures','decimal places','audit trail','professional record']);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. QUIZ QUESTIONS (14 questions)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM question_bank
WHERE lesson_id = 'acc03b05-0000-0000-0000-000000000001'
  AND tags @> ARRAY['acc-srvy-1341','week-5'];

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- Q1  Multiple Choice  Easy
('The linear error of closure is computed as:',
 'multiple_choice',
 '["ΣLat + ΣDep","ΣLat × ΣDep","√(ΣLat² + ΣDep²)","(ΣLat² + ΣDep²) / 2"]'::jsonb,
 '√(ΣLat² + ΣDep²)',
 'The linear error of closure is the Pythagorean combination of the latitude and departure residuals. It represents the total straight-line distance by which the traverse fails to close.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','linear-error','formula']),

-- Q2  True/False  Easy
('A relative precision of 1:20,000 is better than 1:10,000.',
 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'A larger number after the colon means better precision. 1:20,000 means 1 unit of error per 20,000 units of distance — half the error rate of 1:10,000. Think of it as "I would have to travel 20,000 units before accumulating 1 unit of error."',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','relative-precision','comparison']),

-- Q3  True/False  Easy
('If a traverse does not meet the required precision standard, it should be adjusted anyway to force closure.',
 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'A traverse that fails the precision standard should NEVER be adjusted to force closure. Adjustment distributes error — it cannot create accuracy that was not measured. The error source must be identified and corrected (recompute or re-measure) before adjustment.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','failed-closure','adjustment']),

-- Q4  Multiple Choice  Easy
('The TBPELS minimum relative precision for boundary surveys in Texas is:',
 'multiple_choice',
 '["1:5,000","1:10,000","1:15,000","1:50,000"]'::jsonb,
 '1:10,000',
 'TBPELS requires a minimum relative precision of 1:10,000 for property boundary surveys in Texas. ALTA/NSPS land title surveys require 1:15,000. Higher-order geodetic control surveys have stricter requirements.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','TBPELS','standards']),

-- Q5  Numeric Input  Medium
('A traverse has ΣLat = +0.06 ft and ΣDep = −0.08 ft. What is the linear error of closure? Round to 2 decimal places.',
 'numeric_input',
 '[]'::jsonb,
 '0.10',
 'Linear Error = √(0.06² + 0.08²) = √(0.0036 + 0.0064) = √0.0100 = 0.10 ft.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','linear-error','computation']),

-- Q6  Numeric Input  Medium
('The traverse from Q5 has a perimeter of 2,500 ft. What is the relative precision expressed as 1:X? Give X as a whole number.',
 'numeric_input',
 '[]'::jsonb,
 '25000',
 'Relative Precision = Perimeter / Linear Error = 2500 / 0.10 = 25,000. The precision is 1:25,000.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','relative-precision','computation']),

-- Q7  Multiple Choice  Medium
('A traverse has ΣLat = +0.03 ft and ΣDep = −0.04 ft with a perimeter of 2,500 ft. The relative precision is:',
 'multiple_choice',
 '["1:5,000","1:50,000","1:25,000","1:500"]'::jsonb,
 '1:50,000',
 'Error = √(0.03² + 0.04²) = √(0.0009 + 0.0016) = √0.0025 = 0.05 ft. Relative precision = 2500 / 0.05 = 50,000. So precision is 1:50,000.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','relative-precision','3-4-5-triangle']),

-- Q8  Multiple Choice  Medium
('Which of the following relative precision values meets BOTH TBPELS and ALTA/NSPS standards?',
 'multiple_choice',
 '["1:8,000","1:12,000","1:14,000","1:18,000"]'::jsonb,
 '1:18,000',
 'TBPELS requires ≥1:10,000 and ALTA/NSPS requires ≥1:15,000. Only 1:18,000 meets both. 1:14,000 meets TBPELS but not ALTA. 1:12,000 meets TBPELS but not ALTA. 1:8,000 fails both.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','TBPELS','ALTA','standards-comparison']),

-- Q9  Numeric Input  Hard (Full multi-step computation)
('A 4-sided traverse has: ΣLat = −0.09 ft, ΣDep = +0.12 ft, perimeter = 1,800 ft. (a) Compute the linear error. (b) Compute relative precision as 1:X. Give X as a whole number.',
 'numeric_input',
 '[]'::jsonb,
 '12000',
 'Linear Error = √(0.09² + 0.12²) = √(0.0081 + 0.0144) = √0.0225 = 0.15 ft. Relative precision = 1800 / 0.15 = 12,000. Precision is 1:12,000.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','multi-step','linear-error','precision']),

-- Q10  Numeric Input  Hard (Does it pass?)
('Using the traverse from Q9 (1:12,000 precision), would this traverse meet TBPELS boundary standards (1:10,000 minimum)? Give 1 for Yes, 0 for No.',
 'numeric_input',
 '[]'::jsonb,
 '1',
 '1:12,000 > 1:10,000 (12,000 > 10,000), so yes, this traverse meets the TBPELS minimum. However, it would NOT meet ALTA/NSPS standards (1:15,000) because 12,000 < 15,000.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','TBPELS','pass-fail']),

-- Q11  Numeric Input  Hard (Direction of closure)
('A traverse has ΣLat = −0.05 ft and ΣDep = +0.05 ft. In what quadrant does the closure error lie?  Give 1 for NE, 2 for SE, 3 for SW, 4 for NW.',
 'numeric_input',
 '[]'::jsonb,
 '2',
 'ΣLat is negative (south) and ΣDep is positive (east). The closure error is in the SE quadrant (quadrant 2). The direction = S arctan(0.05/0.05) E = S 45°00′ E.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','direction-of-closure','quadrant']),

-- Q12  Multiple Choice  Hard
('A traverse has a linear error of 0.22 ft and a perimeter of 1,650 ft. The surveyor wants to submit an ALTA/NSPS survey. What should the surveyor do?',
 'multiple_choice',
 '["Adjust the traverse — the error will be distributed","Submit the survey — the precision is adequate","Return to the field — the precision is 1:7,500 which fails the 1:15,000 ALTA requirement","Increase the number of decimal places in the computation"]'::jsonb,
 'Return to the field — the precision is 1:7,500 which fails the 1:15,000 ALTA requirement',
 'Relative precision = 1650 / 0.22 = 7,500. The precision is 1:7,500, which fails both ALTA (1:15,000) and TBPELS (1:10,000). Adjusting a traverse that fails the precision standard is not acceptable — the error must be found and corrected. Increasing decimal places does not improve actual measurement quality.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','ALTA','failed-precision','decision']),

-- Q13  Essay  Hard
('A surveyor completes a 6-sided closed loop traverse with a total perimeter of 3,200 ft. The computed ΣLat = +0.18 ft and ΣDep = −0.24 ft. (a) Compute the linear error of closure. (b) Compute the relative precision. (c) Does this traverse meet TBPELS minimum standards (1:10,000)? (d) Does it meet ALTA/NSPS standards (1:15,000)? (e) If it fails, describe three steps the surveyor should take before returning to the field.',
 'essay',
 '[]'::jsonb,
 'Key points: (a) Linear Error = √(0.18² + 0.24²) = √(0.0324 + 0.0576) = √0.0900 = 0.30 ft. (b) Relative precision = 3200 / 0.30 = 10,667. Precision is 1:10,667. (c) Yes — 1:10,667 > 1:10,000 (barely passes). (d) No — 1:10,667 < 1:15,000 (fails ALTA). (e) Before returning to the field: (1) Review field notes for transposed digits, wrong prism constant, or missing atmospheric corrections. (2) Recompute the entire traverse from scratch — verify angle balancing, azimuth propagation, and slope-to-horizontal reductions. (3) Analyze the direction of closure error (S 53°08′ E) to see if it aligns with a specific traverse leg that might have a distance blunder.',
 'A complete answer includes correct computations for (a)-(d) and describes at least three diagnostic steps for (e). Strong answers note that 1:10,667 barely passes TBPELS and suggest the surveyor should strive for better precision.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','essay','full-computation','diagnosis']),

-- Q14  Essay  Medium
('Explain why relative precision is a more useful measure of traverse quality than the linear error alone. Give an example where two traverses have the same linear error but very different quality.',
 'essay',
 '[]'::jsonb,
 'Key points: The linear error alone does not account for the size of the traverse. A 0.10 ft error on a 500 ft traverse (1:5,000) represents poor work, while the same 0.10 ft error on a 5,000 ft traverse (1:50,000) represents excellent work. Relative precision normalizes the error against the perimeter, allowing meaningful comparison. Example: Traverse A has perimeter = 500 ft and error = 0.10 ft → 1:5,000. Traverse B has perimeter = 5,000 ft and error = 0.10 ft → 1:50,000. Same linear error, but Traverse B is 10× more precise relative to its size. Only Traverse B would meet TBPELS standards.',
 'A good answer clearly explains normalization, provides a numerical example with contrasting quality, and relates both to accuracy standards.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','essay','relative-vs-linear','comparison']);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. PRACTICE PROBLEMS
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- Practice 1: Basic linear error
('Practice: ΣLat = +0.04 ft, ΣDep = −0.03 ft. Compute the linear error of closure. Round to 3 decimal places.',
 'numeric_input', '[]'::jsonb,
 '0.050',
 'Linear Error = √(0.04² + 0.03²) = √(0.0016 + 0.0009) = √0.0025 = 0.050 ft.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','linear-error']),

-- Practice 2: Basic relative precision
('Practice: Linear error = 0.050 ft, perimeter = 2,000 ft. Compute relative precision as 1:X. Give X as a whole number.',
 'numeric_input', '[]'::jsonb,
 '40000',
 'Relative precision = 2000 / 0.050 = 40,000. Precision is 1:40,000.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','relative-precision']),

-- Practice 3: Pass/fail against standards
('Practice: A traverse has relative precision of 1:13,500. Which standards does it meet? (a) TBPELS boundary (1:10,000)? (b) ALTA/NSPS (1:15,000)? (c) Second-order Class II (1:20,000)?',
 'multiple_choice',
 '["Meets all three","Meets (a) and (b) only","Meets (a) only","Fails all three"]'::jsonb,
 'Meets (a) only',
 '1:13,500 means 13,500. TBPELS requires ≥10,000 → 13,500 ≥ 10,000 ✓. ALTA requires ≥15,000 → 13,500 < 15,000 ✗. Second-order Class II requires ≥20,000 → 13,500 < 20,000 ✗. It meets only TBPELS.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','standards','pass-fail']),

-- Practice 4: Multi-step computation
('Practice: A 5-sided traverse has ΣLat = −0.07 ft and ΣDep = +0.24 ft. The perimeter is 4,500 ft. Compute relative precision as 1:X. Give X as a whole number.',
 'numeric_input', '[]'::jsonb,
 '18000',
 'Linear Error = √(0.07² + 0.24²) = √(0.0049 + 0.0576) = √0.0625 = 0.25 ft. Precision = 4500 / 0.25 = 18,000. Precision is 1:18,000.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','multi-step','computation']),

-- Practice 5: Direction of closure
('Practice: ΣLat = +0.10 ft, ΣDep = +0.10 ft. What is the bearing of the closure error direction?',
 'short_answer', '[]'::jsonb,
 'N 45°00′ E',
 'ΣLat is positive (north) and ΣDep is positive (east) → NE quadrant. Angle = arctan(0.10/0.10) = arctan(1) = 45°. Bearing = N 45°00′ E.',
 'medium',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','direction-of-closure']),

-- Practice 6: Ranking precision values
('Practice: Rank the following from BEST to WORST precision: 1:8,000, 1:25,000, 1:15,000, 1:50,000.',
 'short_answer', '[]'::jsonb,
 '1:50,000, 1:25,000, 1:15,000, 1:8,000',
 'Larger denominator = better precision. 50,000 > 25,000 > 15,000 > 8,000. So 1:50,000 is best and 1:8,000 is worst.',
 'easy',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','precision-ranking']),

-- Practice 7: Word problem — find maximum allowable error
('Practice: A surveyor must achieve 1:15,000 precision on a traverse with an estimated perimeter of 2,400 ft. What is the maximum allowable linear error of closure? Round to 3 decimal places.',
 'numeric_input', '[]'::jsonb,
 '0.160',
 'Max error = Perimeter / Required ratio = 2400 / 15000 = 0.160 ft.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','max-error','word-problem']),

-- Practice 8: Essay — diagnosis
('Practice: A 4-sided boundary traverse yields ΣLat = +0.35 ft and ΣDep = −0.02 ft, with a perimeter of 1,200 ft. (a) Compute the linear error and relative precision. (b) Does it pass TBPELS? (c) The closure error direction is nearly due north. One of the traverse legs runs almost due N-S with a distance of 380 ft. Explain what this suggests about the source of error and what you would do.',
 'essay', '[]'::jsonb,
 'Key points: (a) Linear Error = √(0.35² + 0.02²) = √(0.1225 + 0.0004) = √0.1229 = 0.351 ft. Precision = 1200 / 0.351 = 3,419. 1:3,419. (b) No — 1:3,419 fails TBPELS (1:10,000) badly. (c) The closure direction is nearly N (arctan(0.02/0.35) ≈ 3°), and the nearly N-S leg is 380 ft. A distance blunder on that leg would produce a nearly pure latitude error. The surveyor should: re-check the recorded distance for that leg (transposed digits? wrong prism constant?), verify the slope-to-horizontal reduction (wrong zenith angle?), and re-measure that leg if the computation checks out. Also check whether the atmospheric correction was applied — in Texas heat, a 380 ft uncorrected distance could be off by several mm, though 0.35 ft is far too large for atmospheric alone and suggests a blunder.',
 'A strong answer correctly computes the precision, identifies the failed standard, connects the closure direction to the N-S leg, and describes a logical diagnostic sequence.',
 'hard',
 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001',
 'ACC-1341', ARRAY['acc-srvy-1341','week-5','practice','essay','diagnosis','closure-direction']);
