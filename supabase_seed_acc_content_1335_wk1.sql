-- ============================================================================
-- ACC SRVY 1335 — Week 1: Lab Safety, Equipment Overview, and Field Book Setup
-- Full lesson content, topics, quiz questions (15), and practice problems (8)
-- Module ID: acc00002-0000-0000-0000-000000000002
-- Lesson ID: acc02b01-0000-0000-0000-000000000001
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. UPDATE LESSON CONTENT
-- ────────────────────────────────────────────────────────────────────────────

UPDATE learning_lessons SET content = '
<h2>Welcome to the Surveying Lab</h2>

<p>SRVY 1335 is a <strong>hands-on lab course</strong> where you learn by doing. Every week you will handle precision instruments, work outdoors in central Texas weather, and produce field notes that could stand up in a court of law. Before you touch a single piece of equipment, you need to understand three things: how to keep yourself and others <strong>safe</strong>, what each piece of <strong>equipment</strong> does, and how to <strong>record</strong> your work properly.</p>

<p>This first lab session covers all three. Take these topics seriously — safety violations can cause injury, equipment damage can cost thousands of dollars, and poor field notes can invalidate an entire survey.</p>

<h2>Part 1: Lab and Field Safety</h2>

<h3>General Safety Principles</h3>

<p>Surveying is outdoor work performed near traffic, on uneven terrain, and often in extreme heat. The most important safety principle is <strong>situational awareness</strong> — always know what is around you.</p>

<ul>
<li><strong>Never turn your back on traffic.</strong> When working near roads, always face oncoming traffic. Use a spotter if you must focus on the instrument.</li>
<li><strong>Wear appropriate clothing.</strong> Closed-toe shoes (preferably boots), long pants, and a hat are mandatory for fieldwork. High-visibility vests are required when working near any roadway.</li>
<li><strong>Stay hydrated.</strong> Central Texas summers regularly exceed 100°F. Drink water <em>before</em> you feel thirsty. Know the signs of heat exhaustion: heavy sweating, weakness, cold/pale/clammy skin, nausea, fainting.</li>
<li><strong>Watch for wildlife.</strong> Fire ants, copperheads, rattlesnakes, and thorny brush are common in the Austin area. Look before you step, especially around tall grass, rock piles, and brush.</li>
<li><strong>Never look at the sun through any optical instrument.</strong> Levels, theodolites, and total stations can focus sunlight directly into your eye, causing instant and permanent retinal damage.</li>
</ul>

<h3>Equipment Safety</h3>

<ul>
<li><strong>Carry tripods vertically</strong> with the legs together and pointed down. Never carry a tripod over your shoulder pointed forward — you could strike someone.</li>
<li><strong>Never leave an instrument unattended on a tripod.</strong> Wind, people, or animals can knock it over. A dropped total station can cost $15,000–$40,000 to replace.</li>
<li><strong>Use lens caps</strong> when the instrument is not in active use. Scratched lenses degrade measurement accuracy.</li>
<li><strong>Tighten all clamps gently but firmly.</strong> Over-tightening damages threads and tangent screws. Under-tightening allows the instrument to drift.</li>
<li><strong>Level rods and prism poles</strong> should be carried vertically, not horizontally, when moving through the field.</li>
</ul>

<h3>ACC Lab-Specific Rules</h3>

<ol>
<li>All equipment must be <strong>checked out</strong> by the team leader and <strong>checked in</strong> by the same person at the end of each lab session.</li>
<li>Report any equipment damage <strong>immediately</strong> — do not attempt to repair instruments yourself.</li>
<li>No food or drinks near instruments or in the equipment storage room.</li>
<li>Field vehicles must have a designated driver who has completed the ACC defensive driving orientation.</li>
<li>First aid kits are located in the lab storage room and in each field vehicle. Know their location.</li>
</ol>

<h2>Part 2: Surveying Equipment Overview</h2>

<p>This section introduces the major categories of surveying equipment you will use throughout the semester. You do not need to master every instrument today — you will learn each one in depth during the labs that use it. Today is about recognition and basic handling.</p>

<h3>Levels</h3>

<p>A <strong>level</strong> establishes a horizontal line of sight for measuring differences in elevation. There are two main types you will encounter:</p>

<table>
<thead><tr><th>Type</th><th>Description</th><th>Typical Accuracy</th></tr></thead>
<tbody>
<tr><td><strong>Automatic (compensating) level</strong></td><td>Uses a pendulum compensator to maintain a level line of sight after rough leveling. The standard instrument for differential leveling.</td><td>±1–2 mm per km</td></tr>
<tr><td><strong>Digital level</strong></td><td>Reads a bar-coded rod electronically and records data digitally. Eliminates reading errors.</td><td>±0.3–1.0 mm per km</td></tr>
</tbody>
</table>

<p>Both require a <strong>tripod</strong> for mounting and a <strong>leveling rod</strong> (graduated staff) as the target.</p>

<h3>Total Stations</h3>

<p>A <strong>total station</strong> combines an electronic theodolite (for measuring horizontal and vertical angles) with an EDM (Electronic Distance Measurement device). It is the workhorse of modern surveying, used for traversing, boundary surveys, construction layout, and topographic mapping.</p>

<p>Key components:</p>
<ul>
<li><strong>Telescope</strong> — optical tube with crosshairs for precise aiming</li>
<li><strong>Horizontal circle</strong> — electronic encoder measuring horizontal angles</li>
<li><strong>Vertical circle</strong> — electronic encoder measuring zenith (vertical) angles</li>
<li><strong>EDM</strong> — infrared or laser distance measurement</li>
<li><strong>Display and keyboard</strong> — for entering data and reading measurements</li>
<li><strong>Tribrach</strong> — the leveling mount that attaches to the tripod</li>
</ul>

<p>Total station accuracy classes are defined by the standard deviation of a single angle measurement — for example, a "5-second" instrument has a stated angle accuracy of ±5″.</p>

<h3>Theodolites</h3>

<p>A <strong>theodolite</strong> measures horizontal and vertical angles but does <em>not</em> include an EDM. Modern total stations have largely replaced standalone theodolites, but you may encounter them for specific tasks (such as precise angle work) or in contexts where distance is measured separately by tape or GNSS.</p>

<h3>Distance Measurement Equipment</h3>

<table>
<thead><tr><th>Equipment</th><th>Description</th><th>When Used</th></tr></thead>
<tbody>
<tr><td><strong>Steel tape (30 m / 100 ft)</strong></td><td>Graduated metal tape for direct distance measurement</td><td>Short distances, boundary corners, construction layout</td></tr>
<tr><td><strong>EDM (in total station)</strong></td><td>Electronic distance measurement using infrared beam reflected from a prism</td><td>All traverse and control distances</td></tr>
<tr><td><strong>Prism and prism pole</strong></td><td>Glass retroreflector mounted on an adjustable-height pole — the EDM target</td><td>Used with total station for all electronic distance measurement</td></tr>
</tbody>
</table>

<h3>Leveling Rods</h3>

<p>A <strong>leveling rod</strong> (or level staff) is a graduated pole used as the target for leveling measurements. Standard rods are graduated in meters/centimeters or feet/hundredths of a foot. The rod must be held <strong>perfectly vertical</strong> — even a small tilt introduces error. Rod levels (circular bubble vials) are attached to the rod to help maintain plumb.</p>

<h3>Tripods</h3>

<p>All precision instruments (levels, total stations, theodolites) mount on a <strong>tripod</strong>. Surveying tripods have:</p>
<ul>
<li><strong>Adjustable legs</strong> with both extension and spread adjustment</li>
<li><strong>Metal or fiberglass legs</strong> (wood is traditional but heavier)</li>
<li><strong>A flat head</strong> with a 5/8″-11 threaded center bolt for attaching the tribrach or instrument directly</li>
<li><strong>Pointed feet</strong> for pushing into soft ground</li>
</ul>

<h3>Tribrachs</h3>

<p>A <strong>tribrach</strong> is the leveling adapter between the tripod and the instrument. It contains:</p>
<ul>
<li>Three <strong>leveling screws</strong> (foot screws) for precise leveling</li>
<li>A <strong>circular bubble</strong> (bull''s-eye) for rough leveling</li>
<li>An <strong>optical plummet</strong> (or laser plummet) for centering over a ground mark</li>
<li>A <strong>locking ring</strong> that accepts the instrument or prism adapter</li>
</ul>

<h3>Auxiliary Equipment</h3>

<ul>
<li><strong>Plumb bob</strong> — weighted cone on a string for vertical alignment over a point (backup to optical plummet)</li>
<li><strong>Range poles</strong> — bright red-and-white striped poles for sighting targets at a distance</li>
<li><strong>Chaining pins</strong> — steel stakes used to mark tape endpoints during taping</li>
<li><strong>Flagging tape</strong> — brightly colored plastic ribbon for marking points</li>
<li><strong>Field book and pencils</strong> — for recording measurements (more on this below)</li>
<li><strong>Hammer, lath, nails</strong> — for setting temporary points</li>
</ul>

<h2>Part 3: The Surveying Field Book</h2>

<p>The <strong>field book</strong> is the legal record of your survey observations. It is not a scratch pad — it is a <em>permanent document</em> that may be subpoenaed in court years or decades after the survey was performed. Every measurement, sketch, and note you record must follow professional standards.</p>

<h3>Field Book Format</h3>

<p>Standard surveying field books have a specific layout:</p>
<ul>
<li><strong>Left page:</strong> Tabular data — station names, angles, distances, rod readings, HI, HR</li>
<li><strong>Right page:</strong> Sketches — plan view of the site, showing station locations, traverse lines, reference objects, north arrow, and descriptive notes</li>
</ul>

<h3>Required Information on Every Page</h3>

<table>
<thead><tr><th>Item</th><th>Purpose</th></tr></thead>
<tbody>
<tr><td>Date</td><td>Establishes when the work was performed</td></tr>
<tr><td>Weather conditions</td><td>Temperature, wind, visibility affect measurement accuracy</td></tr>
<tr><td>Crew members and roles</td><td>Establishes who performed and checked the work</td></tr>
<tr><td>Project name / location</td><td>Ties the data to a specific job</td></tr>
<tr><td>Equipment used (ID numbers)</td><td>Allows tracing calibration records</td></tr>
<tr><td>Page number</td><td>Maintains data sequence</td></tr>
</tbody>
</table>

<h3>The Rules of Field Note Recording</h3>

<ol>
<li><strong>Use pencil only</strong> (HB or 2H) — ink smears in rain and humidity.</li>
<li><strong>Record measurements at the time of observation.</strong> Never rely on memory or scraps of paper.</li>
<li><strong>Never erase.</strong> If you make an error, draw a single horizontal line through the incorrect value so it remains legible, write the correct value adjacent to it, and initial the correction.</li>
<li><strong>Write legibly.</strong> If others cannot read your notes, the data is useless.</li>
<li><strong>Include sketches.</strong> A plan-view sketch of the site with labeled stations, traverse lines, and reference features is essential for anyone using the data later.</li>
<li><strong>Note unusual conditions</strong> — passing traffic that may have disturbed a setup, strong wind, heat shimmer, anything that might affect data quality.</li>
<li><strong>Check your work.</strong> Before leaving a station, review all recorded values for completeness and reasonableness.</li>
</ol>

<h3>Electronic Data Collection</h3>

<p>Many modern total stations connect to an electronic <strong>data collector</strong> (handheld computer) that records measurements automatically. While this reduces recording errors, you must still:</p>
<ul>
<li>Verify the data collector settings (units, coordinate system, atmospheric corrections)</li>
<li>Confirm point naming conventions before starting</li>
<li>Back up data at the end of every session</li>
<li>Maintain a paper field book as a backup record with sketches and notes that the data collector cannot capture</li>
</ul>

<h2>Part 4: Equipment Check-Out Procedures</h2>

<p>Proper equipment handling begins and ends with the check-out process:</p>

<h3>Checking Out Equipment</h3>
<ol>
<li>Sign the equipment log with your name, date, course section, and the serial numbers of all items checked out.</li>
<li><strong>Inspect each item</strong> before accepting it:
  <ul>
  <li>Tripod: legs extend and lock properly, feet are attached, head bolt is present</li>
  <li>Total station / level: lens is clean, display powers on, battery is charged</li>
  <li>Rod: sections extend and lock, graduations are readable, rod level bubble is intact</li>
  <li>Prism: glass is uncracked, prism constant label is visible, pole clamp works</li>
  </ul>
</li>
<li>Report any pre-existing damage to the instructor before leaving the storage room.</li>
</ol>

<h3>Returning Equipment</h3>
<ol>
<li>Clean all equipment — wipe down instruments with a soft cloth, remove dirt from tripod feet and rod base.</li>
<li>Return each item to its designated storage location (case, shelf, rack).</li>
<li>Sign the equipment back in on the log.</li>
<li>Report any damage or issues discovered during the lab session.</li>
<li>Ensure all batteries are placed on chargers if needed.</li>
</ol>

<h2>Looking Ahead</h2>

<p>Next week you will put this knowledge to work in your first hands-on lab: <strong>differential leveling</strong>. You will set up an automatic level, read a leveling rod, and run a simple level circuit to determine elevation differences between points. Bring your field book prepared with a fresh page, your pencil, and a hat — we will be outside.</p>
',

resources = '[
  {"title":"OSHA Construction Safety Standards — Surveying","url":"https://www.osha.gov/construction","type":"reference"},
  {"title":"ACC Lab Safety Manual","url":"https://www.austincc.edu/labsafety","type":"reference"},
  {"title":"Professional Surveying Field Notes Guide","url":"https://www.surveyingmath.com/field-notes","type":"reference"}
]'::jsonb,

videos = '[
  {"title":"Surveying Equipment Overview for Students","url":"https://www.youtube.com/watch?v=Zy4R3K8vWhk"},
  {"title":"How to Keep a Professional Surveying Field Book","url":"https://www.youtube.com/watch?v=JG0xTvPBYz4"}
]'::jsonb,

key_takeaways = ARRAY[
  'Follow all safety protocols for lab and field surveying, including traffic awareness, heat illness prevention, and wildlife hazards',
  'Identify and describe the purpose of all major surveying equipment: levels, total stations, EDM, tripods, tribrachs, rods, prisms, tapes',
  'Distinguish between an automatic level, a total station, and a theodolite',
  'Set up a surveying field book with proper header information and page layout',
  'Apply the rules of field note recording: pencil only, no erasing, immediate recording, include sketches',
  'Execute proper equipment check-out and return procedures',
  'Explain why field notes are considered legal documents'
]

WHERE id = 'acc02b01-0000-0000-0000-000000000001';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. TOPICS
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM learning_topics WHERE lesson_id = 'acc02b01-0000-0000-0000-000000000001';

INSERT INTO learning_topics (id, lesson_id, title, content, order_index, keywords) VALUES

('acc02a01-0001-0000-0000-000000000001', 'acc02b01-0000-0000-0000-000000000001',
 'Lab and Field Safety Procedures',
 'Surveying fieldwork requires constant situational awareness. Primary hazards include vehicular traffic (always face oncoming traffic, wear high-visibility vests), heat illness (hydrate before thirst, recognize symptoms of heat exhaustion and heat stroke), wildlife (fire ants, copperheads, rattlesnakes — scan before stepping in tall grass or brush), and optical hazards (never aim an instrument at the sun — focused sunlight causes instant permanent retinal damage). Equipment-specific safety includes carrying tripods vertically with points down, never leaving instruments unattended on tripods (a toppled total station costs $15,000–$40,000), and carrying rods and prism poles vertically when moving. ACC lab rules require a designated team leader for equipment check-out/check-in, immediate reporting of any damage, and first aid kit awareness.',
 1,
 ARRAY['safety','traffic','heat illness','hydration','wildlife','fire ants','rattlesnake','optical hazard','sun','high-visibility','tripod carrying','ACC lab rules']),

('acc02a01-0002-0000-0000-000000000001', 'acc02b01-0000-0000-0000-000000000001',
 'Surveying Equipment Identification and Handling',
 'Major surveying equipment categories: (1) Levels — automatic (compensating) levels use a pendulum compensator for self-leveling; digital levels read bar-coded rods electronically. Used for differential leveling. (2) Total stations — combine an electronic theodolite and EDM in one instrument for measuring angles and distances; classified by angle accuracy (e.g., 5-second). (3) Theodolites — angle-measuring instruments without EDM; largely replaced by total stations. (4) Distance measurement — steel tapes (30m/100ft) for short distances, EDM for all traverse work, prisms as EDM reflectors. (5) Leveling rods — graduated staffs held vertical at target points, with rod levels for plumb. (6) Tripods — adjustable-leg mounts with 5/8-11 threaded head for tribrach attachment. (7) Tribrachs — leveling adapters with three foot screws, circular bubble, optical/laser plummet, and locking ring. (8) Auxiliary: plumb bobs, range poles, chaining pins, flagging tape, field books.',
 2,
 ARRAY['level','automatic level','digital level','total station','theodolite','EDM','prism','leveling rod','tripod','tribrach','optical plummet','plumb bob','range pole','steel tape','chaining pin']),

('acc02a01-0003-0000-0000-000000000001', 'acc02b01-0000-0000-0000-000000000001',
 'Field Book Setup and Professional Note-Keeping',
 'The surveying field book is a permanent legal document that may be subpoenaed in court. Standard layout: left page for tabular data (station names, angles, distances, rod readings, HI, HR), right page for sketches (plan view of site with labeled stations, traverse lines, north arrow, reference objects). Every page requires: date, weather conditions, crew members and roles, project name/location, equipment serial numbers, and page number. Recording rules: use pencil only (ink smears in rain), record measurements at the time of observation (never from memory), never erase (draw a single line through errors, write correct value adjacent, initial the correction), write legibly, include sketches, note unusual conditions (traffic, wind, shimmer). Electronic data collectors reduce recording errors but paper backup with sketches remains mandatory.',
 3,
 ARRAY['field book','field notes','legal document','left page','right page','sketch','pencil','no erase','single line','correction','data collector','backup','recording rules']),

('acc02a01-0004-0000-0000-000000000001', 'acc02b01-0000-0000-0000-000000000001',
 'Equipment Check-Out and Care Procedures',
 'Proper equipment handling extends instrument life and ensures measurement reliability. Check-out procedure: sign the equipment log with name, date, section, and serial numbers; inspect each item before accepting (tripod legs lock, instrument powers on, battery charged, lens clean, rod sections lock, prism uncracked); report pre-existing damage before leaving storage. Return procedure: clean all equipment (wipe instruments with soft cloth, remove dirt from tripod feet and rod base), return to designated storage location, sign equipment back in, report any damage or issues, place batteries on chargers. Key care practices: use lens caps when instrument is not in active use, tighten clamps gently but firmly (over-tightening damages threads), never force a stuck clamp or screw, protect instruments from rain and direct sun exposure.',
 4,
 ARRAY['check-out','check-in','equipment log','serial number','inspection','cleaning','battery','lens cap','clamp','care','storage','damage report']);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. QUIZ QUESTIONS (15 questions — mixed types and difficulties)
-- ────────────────────────────────────────────────────────────────────────────

-- Remove any existing week-1 quiz/practice questions for this lesson
DELETE FROM question_bank
WHERE lesson_id = 'acc02b01-0000-0000-0000-000000000001'
  AND tags @> ARRAY['acc-srvy-1335','week-1'];

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- Q1  Multiple Choice  Easy
('When working near a roadway during a field survey, you should:',
 'multiple_choice',
 '["Turn your back to traffic so you can focus on the instrument","Always face oncoming traffic and wear a high-visibility vest","Only use the sidewalk","Survey only at night when traffic is lighter"]'::jsonb,
 'Always face oncoming traffic and wear a high-visibility vest',
 'Traffic is one of the greatest hazards in surveying. You must always face oncoming traffic to see approaching vehicles, and high-visibility vests are required when working near any roadway. A spotter should be used when the instrument operator must focus away from traffic.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','quiz','safety','traffic']),

-- Q2  True/False  Easy
('It is safe to briefly look at the sun through a total station to check its position.',
 'true_false',
 '["True","False"]'::jsonb,
 'False',
 'NEVER look at the sun through any optical instrument. Levels, theodolites, and total stations focus sunlight directly into the eye, causing instant and permanent retinal damage. There is no safe duration — even a brief glance can cause irreversible harm.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','quiz','safety','optical-hazard']),

-- Q3  Multiple Choice  Easy
('How should a tripod be carried when moving between stations?',
 'multiple_choice',
 '["Over the shoulder with legs pointed forward","Horizontally under one arm","Vertically with legs together and pointed down","Dragged along the ground"]'::jsonb,
 'Vertically with legs together and pointed down',
 'Tripods should be carried vertically with the legs together and pointed downward. Carrying a tripod over the shoulder with legs pointed forward is dangerous — you could strike someone or damage the instrument head. Dragging damages the tripod feet.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','quiz','safety','tripod','equipment-handling']),

-- Q4  Multiple Choice  Easy
('Which instrument combines an electronic theodolite and an EDM in a single unit?',
 'multiple_choice',
 '["Automatic level","Total station","Digital level","Plumb bob"]'::jsonb,
 'Total station',
 'A total station integrates an electronic theodolite (for measuring horizontal and vertical angles) with an Electronic Distance Measurement (EDM) device. It is the primary instrument for traversing, boundary surveys, and construction layout.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','quiz','total-station','equipment-identification']),

-- Q5  True/False  Easy
('An automatic level uses a pendulum compensator to maintain a level line of sight.',
 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'An automatic (self-leveling or compensating) level contains a pendulum compensator that uses gravity to keep the line of sight horizontal after the instrument has been roughly leveled using the circular bubble. This is the standard instrument for differential leveling.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','quiz','automatic-level','compensator']),

-- Q6  True/False  Easy
('Forced centering allows instrument and target interchange without re-centering over the point.',
 'true_false',
 '["True","False"]'::jsonb,
 'True',
 'Forced centering uses standardized tribrachs that remain fixed on the tripod. The instrument and prisms can be swapped between tribrachs without disturbing the centering over the ground mark. This saves time and reduces centering errors in traverse work.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','quiz','forced-centering','tribrach']),

-- Q7  Multiple Choice  Medium
('Which of the following is NOT a standard component of a tribrach?',
 'multiple_choice',
 '["Three leveling screws","Optical or laser plummet","EDM transmitter","Circular bubble"]'::jsonb,
 'EDM transmitter',
 'A tribrach contains three leveling screws (foot screws), a circular bubble for rough leveling, an optical or laser plummet for centering over a ground mark, and a locking ring for attaching instruments. The EDM is part of the total station, not the tribrach.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','quiz','tribrach','components']),

-- Q8  Multiple Choice  Medium
('A "5-second" total station refers to:',
 'multiple_choice',
 '["The time it takes to measure a distance","The standard deviation of a single angle measurement","The minimum distance it can measure","The battery life in hours"]'::jsonb,
 'The standard deviation of a single angle measurement',
 'Total station accuracy is classified by the standard deviation of a single angle measurement. A 5-second total station has a stated angular accuracy of ±5″ (5 seconds of arc). Higher-precision instruments may be rated at 1″ or 2″.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','quiz','total-station','accuracy-class']),

-- Q9  Multiple Choice  Medium
('When you make an error in a field book, the correct procedure is to:',
 'multiple_choice',
 '["Erase the error and write the correct value","White-out the error and rewrite","Draw a single line through the error, write the correct value adjacent, and initial the correction","Tear out the page and start over"]'::jsonb,
 'Draw a single line through the error, write the correct value adjacent, and initial the correction',
 'Field notes are legal documents. Never erase, white out, or remove pages. A single line through the error keeps the original value legible (which may be needed later), and the initials establish who made the correction and when. This is the universal standard in professional surveying.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','quiz','field-notes','error-correction']),

-- Q10  Multiple Choice  Medium
('The standard field book layout uses the left page for:',
 'multiple_choice',
 '["Sketches and diagrams","Tabular data: station names, angles, distances, rod readings","Personal notes and reminders","Equipment maintenance logs"]'::jsonb,
 'Tabular data: station names, angles, distances, rod readings',
 'The standard surveying field book has tabular data on the left page (station names, angles, distances, rod readings, HI, HR) and sketches on the right page (plan view of the site with labeled stations, traverse lines, north arrow, and reference objects).',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','quiz','field-book','layout']),

-- Q11  Multiple Choice  Medium
('Why must a leveling rod be held perfectly vertical during a reading?',
 'multiple_choice',
 '["A tilted rod is harder to see through the instrument","A tilted rod gives a reading that is too HIGH — the shortest (correct) reading is when the rod is vertical","A tilted rod will fall over","The rod level bubble will not center"]'::jsonb,
 'A tilted rod gives a reading that is too HIGH — the shortest (correct) reading is when the rod is vertical',
 'When a rod is tilted, the crosshair intercepts the graduated face at a higher point than the true vertical distance. The minimum (correct) reading occurs when the rod is perfectly plumb. This is why rod levels (circular bubble vials) are attached to leveling rods — to help the rod person maintain plumb.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','quiz','leveling-rod','vertical','error']),

-- Q12  Multiple Choice  Hard
('A survey crew is working in an open field in Austin, TX in July. The temperature is 102°F. One crew member reports dizziness, nausea, and heavy sweating. What is the most likely condition and the correct immediate response?',
 'multiple_choice',
 '["Sunburn — apply sunscreen and continue work","Heat exhaustion — move to shade, loosen clothing, provide cool water, rest; seek medical attention if symptoms worsen","Heat stroke — continue working but drink more water","Dehydration — give the crew member a caffeinated drink"]'::jsonb,
 'Heat exhaustion — move to shade, loosen clothing, provide cool water, rest; seek medical attention if symptoms worsen',
 'Dizziness, nausea, and heavy sweating are classic symptoms of heat exhaustion. The correct response is to move the person to shade immediately, loosen clothing, provide cool (not ice-cold) water, and rest. If symptoms worsen or the person stops sweating (a sign of heat stroke), call 911. Heat stroke is a medical emergency with symptoms of confusion, hot/dry skin, and loss of consciousness.',
 'hard',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','quiz','safety','heat-illness','Texas']),

-- Q13  Essay  Hard
('You are the team leader for a surveying lab session. Before heading to the field, list all the steps you must complete during equipment check-out and describe what you inspect on each item. Then explain the return procedure. Why is the check-out/check-in log important from both a practical and legal perspective?',
 'essay',
 '[]'::jsonb,
 'Key points: Check-out: (1) Sign the log with name, date, section, serial numbers. (2) Inspect tripod — legs extend/lock, feet attached, head bolt present. (3) Inspect total station or level — lens clean, display powers on, battery charged. (4) Inspect rod — sections extend/lock, graduations readable, rod level bubble intact. (5) Inspect prism — glass uncracked, constant label visible, pole clamp works. (6) Report pre-existing damage before leaving. Return: (1) Clean all equipment. (2) Return to designated storage. (3) Sign back in on log. (4) Report damage/issues. (5) Charge batteries. Legal/practical importance: The log creates an accountability chain — it documents who had which equipment and when. If equipment is damaged, the log identifies which crew used it last. From a legal perspective, instrument serial numbers tie to calibration records, which may be needed to verify measurement accuracy in court proceedings.',
 'A thorough answer covers the full check-out and return procedures with specific inspection items, and explains both practical (accountability, maintenance tracking) and legal (calibration records, court evidence) reasons for the log.',
 'hard',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','quiz','essay','equipment','check-out','procedure']),

-- Q14  Essay  Medium
('Explain why surveying field notes are considered legal documents. In your answer, describe at least five pieces of information that must appear on every field book page, and explain the "never erase" rule — what should you do instead, and why?',
 'essay',
 '[]'::jsonb,
 'Key points: Field notes are legal documents because they are the original record of survey measurements and observations. They may be subpoenaed as evidence in boundary disputes, property litigation, condemnation proceedings, or professional board investigations. They establish the chain of evidence for all survey work. Every page must include: (1) date, (2) weather conditions (affect measurement accuracy), (3) crew members and roles, (4) project name/location, (5) equipment used with serial/ID numbers (for calibration traceability), (6) page number. The never-erase rule: draw a single horizontal line through the error so the original value remains legible, write the correct value beside it, and initial and date the correction. Erasing destroys evidence and raises questions about data integrity in legal proceedings. The original value may be needed later for error analysis or to resolve disputes about what was actually measured.',
 'A complete answer explains the legal significance, lists at least five header items with reasons, and correctly describes the correction procedure with its rationale.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','quiz','essay','field-notes','legal-document']),

-- Q15  Multiple Choice  Hard
('You are about to check out a total station for fieldwork. During inspection you notice that the battery shows 15% charge and the objective lens has a small scratch. What should you do?',
 'multiple_choice',
 '["Take the instrument — 15% is enough for a short lab and the scratch is minor","Report both issues to the instructor, request a different instrument or a fully charged battery, and note the scratch on the equipment log","Just swap the battery and ignore the scratch","Refuse to do the lab"]'::jsonb,
 'Report both issues to the instructor, request a different instrument or a fully charged battery, and note the scratch on the equipment log',
 'A 15% battery may die during fieldwork, wasting the entire lab session. A scratched lens degrades measurement accuracy. Both issues should be reported to the instructor and logged. You should request a replacement or at minimum a fully charged battery, and the scratch must be documented so that the current crew is not blamed for pre-existing damage.',
 'hard',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','quiz','equipment','inspection','problem-solving']);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. PRACTICE PROBLEMS
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO question_bank
  (question_text, question_type, options, correct_answer, explanation, difficulty,
   module_id, lesson_id, exam_category, tags)
VALUES

-- Practice 1: Equipment identification
('Practice: Match each description to the correct equipment: (a) Establishes a horizontal line of sight using a pendulum compensator. (b) Measures horizontal and vertical angles plus distances electronically. (c) A glass retroreflector mounted on a pole that serves as an EDM target. (d) A graduated staff held vertical at a target point.',
 'multiple_choice',
 '["(a) Total station, (b) Theodolite, (c) Plumb bob, (d) Range pole","(a) Automatic level, (b) Total station, (c) Prism, (d) Leveling rod","(a) Digital level, (b) Prism, (c) Tripod, (d) Chaining pin","(a) Theodolite, (b) Automatic level, (c) Tribrach, (d) Flagging tape"]'::jsonb,
 '(a) Automatic level, (b) Total station, (c) Prism, (d) Leveling rod',
 '(a) The automatic (compensating) level uses a pendulum compensator for a horizontal line of sight. (b) The total station combines an electronic theodolite and EDM. (c) A prism (retroreflector) on a pole is the standard EDM target. (d) A leveling rod is a graduated staff held vertical for level readings.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','practice','equipment-identification']),

-- Practice 2: Safety scenario
('Practice: Identify at least THREE safety hazards in the following scenario: A surveying crew is working along a county road in July. The crew is wearing shorts and sneakers. The instrument operator has her back to traffic. No high-visibility vests are worn. The crew has been working for 3 hours without a water break. A tripod is lying horizontally on the ground with an instrument still mounted.',
 'essay', '[]'::jsonb,
 'Hazards: (1) Working near road without high-visibility vests — risk of vehicle strike. (2) Instrument operator has back to traffic — cannot see approaching vehicles. (3) Shorts and sneakers — inadequate protection from brush, snakes, fire ants, and terrain hazards; closed-toe shoes/boots and long pants required. (4) Three hours without water in July Texas heat — serious risk of heat exhaustion or heat stroke. (5) Tripod lying on ground with instrument mounted — instrument can be stepped on, rolled, or damaged; instruments must never be left unsupported on the ground. At least 5 clear hazards are present.',
 'A good answer identifies at least three distinct hazards with specific safety violations and explains the risk associated with each.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','practice','safety','hazard-identification']),

-- Practice 3: Tribrach components
('Practice: Name the four main components of a tribrach and describe what each one does.',
 'essay', '[]'::jsonb,
 'Four components: (1) Three leveling screws (foot screws) — used for precise leveling of the instrument by adjusting until the plate bubble is centered. (2) Circular bubble (bull''s-eye level) — provides rough leveling indication; centered when the tribrach is approximately level. (3) Optical plummet (or laser plummet) — provides a vertical sightline downward for centering the instrument directly over a ground mark. (4) Locking ring (clamp) — secures the instrument or prism adapter to the tribrach; allows interchange of instruments without disturbing the leveling and centering (forced centering).',
 'A complete answer names all four components with a clear description of each one''s function.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','practice','tribrach','components']),

-- Practice 4: Field book page setup
('Practice: You are starting a new lab session. List ALL the information you must record at the top of your field book page before making any measurements.',
 'essay', '[]'::jsonb,
 'Required header information: (1) Date of the lab session. (2) Weather conditions (temperature, wind, cloud cover, visibility). (3) Crew members and their assigned roles (instrument operator, rod person, recorder, etc.). (4) Project name and location (e.g., "ACC SRVY 1335, Lab 3 — Differential Leveling, ACC Riverside Campus"). (5) Equipment used with serial or ID numbers (for calibration traceability). (6) Page number (maintains data sequence across the field book).',
 'A complete answer lists all six items. Strong answers explain why each item matters (e.g., equipment IDs for calibration records, weather for understanding measurement conditions).',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','practice','field-book','setup']),

-- Practice 5: Equipment comparison
('Practice: Compare an automatic level and a total station. For each instrument, describe: (a) what it measures, (b) what target it requires, and (c) one typical application.',
 'essay', '[]'::jsonb,
 'Automatic level: (a) Measures differences in elevation using a horizontal line of sight. (b) Requires a leveling rod (graduated staff) as the target. (c) Typical application: differential leveling, establishing benchmarks, checking building floor levels. Total station: (a) Measures horizontal angles, vertical (zenith) angles, and slope distances. (b) Requires a prism (retroreflector) on a prism pole as the EDM target. (c) Typical application: running a traverse, boundary survey, construction layout, topographic mapping.',
 'A complete answer clearly distinguishes the two instruments across all three criteria with correct details.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','practice','level-vs-total-station','comparison']),

-- Practice 6: Error correction simulation
('Practice: You are recording traverse data in your field book. You write the distance to Station 4 as "187.532" but immediately realize the correct value is "178.532." Describe exactly what you should do to correct this error. What should the corrected entry look like?',
 'essay', '[]'::jsonb,
 'Procedure: Draw a single horizontal line through "187.532" so it remains legible. Write "178.532" directly adjacent to (next to or above) the lined-out value. Initial and date the correction. The entry should look like: 1̶8̶7̶.̶5̶3̶2̶ 178.532 [JM 9/15]. Never erase, white out, or overwrite. The original value must remain readable because (a) it may be needed for error analysis, (b) field notes are legal documents and erasures destroy evidence integrity, and (c) the correction chain must be transparent.',
 'A correct answer describes the single-line, write-adjacent, initial procedure and explains why erasing is not allowed.',
 'easy',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','practice','field-notes','error-correction']),

-- Practice 7: Instrument cost awareness
('Practice: A total station costs approximately $15,000–$40,000. If the instrument is left unattended on its tripod and is knocked over by wind, the replacement cost comes from the department budget — reducing funding available for future lab equipment. Assuming a mid-range replacement cost of $25,000 and the department''s annual equipment budget is $50,000, what percentage of the annual budget would be consumed by one dropped total station?',
 'numeric_input', '[]'::jsonb,
 '50',
 '$25,000 / $50,000 × 100 = 50%. One dropped total station would consume half the department''s annual equipment budget. This illustrates why the rule "never leave an instrument unattended on a tripod" exists — the financial consequences of equipment damage are severe.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','practice','equipment-cost','word-problem']),

-- Practice 8: Comprehensive safety and equipment essay
('Practice: You are training a new crew member who has never done fieldwork before. Write a brief safety orientation covering: (a) the three most important personal safety rules for outdoor surveying in Texas, (b) two rules for handling instruments safely, and (c) what to do if equipment is damaged during the lab.',
 'essay', '[]'::jsonb,
 'Key points: (a) Personal safety: (1) Always face oncoming traffic and wear high-visibility vests near roads. (2) Stay hydrated — drink water before feeling thirsty, take shade breaks, and watch for symptoms of heat exhaustion (Texas heat is a constant hazard). (3) Watch for wildlife — scan for fire ants, snakes, and thorny brush before stepping into tall grass. Additional valid answers include closed-toe shoes/boots, sunscreen, never looking at the sun through an instrument. (b) Instrument handling: (1) Never leave an instrument unattended on a tripod — wind, people, or animals can topple it. (2) Carry tripods vertically with points down; carry rods and prism poles vertically. Other valid answers: use lens caps, tighten clamps gently, protect from rain. (c) If equipment is damaged: report the damage to the instructor immediately, do not attempt to repair it yourself, and document the damage on the equipment log.',
 'A strong answer provides clear, actionable safety guidance with Texas-specific concerns (heat, wildlife, traffic) and correct equipment handling rules.',
 'medium',
 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001',
 'ACC-1335', ARRAY['acc-srvy-1335','week-1','practice','essay','safety','orientation','comprehensive']);
