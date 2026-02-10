-- ============================================================================
-- SRVY 1341 — Lesson 0: Course Introduction
-- ============================================================================
-- A no-quiz introductory lesson providing course description, syllabus
-- overview, prerequisite expectations, and useful resources/links.
--
-- Lesson UUID: acc03b00-0000-0000-0000-000000000001 (order_index 0)
-- Module UUID: acc00003-0000-0000-0000-000000000003
--
-- Run AFTER supabase_seed_acc_courses.sql
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 0. INSERT LESSON (order_index 0 — before all weekly lessons)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO learning_lessons (
  id, module_id, title, description, learning_objectives,
  order_index, estimated_minutes, resources, videos, tags, status
)
VALUES (
  'acc03b00-0000-0000-0000-000000000001',
  'acc00003-0000-0000-0000-000000000003',
  'Welcome to SRVY 1341 — Land Surveying',
  'Course introduction and orientation. Review the course description, semester schedule, grading policies, prerequisite expectations, and helpful resources before diving into the content.',
  ARRAY[
    'Understand the scope and objectives of SRVY 1341',
    'Review the 16-week semester schedule and major milestones',
    'Identify prerequisite knowledge from SRVY 1301',
    'Locate course resources, reference materials, and tools'
  ],
  0, 15,
  '[
    {"title":"Austin Community College — SRVY 1341 Course Catalog","url":"https://www.austincc.edu/","type":"reference"},
    {"title":"Elementary Surveying (Ghilani) — Textbook","url":"https://www.pearson.com/","type":"reference"},
    {"title":"Texas Board of Professional Land Surveying (TBPLS)","url":"https://www.txls.texas.gov/","type":"reference"},
    {"title":"National Geodetic Survey (NGS)","url":"https://www.ngs.noaa.gov/","type":"reference"},
    {"title":"Surveying Mathematics — Free Online Reference","url":"https://www.surveyingmath.com/","type":"reference"}
  ]'::jsonb,
  '[
    {"title":"What is Land Surveying? — Introduction","url":"https://www.youtube.com/watch?v=5sRPnMD6KYE"},
    {"title":"Career Paths in Land Surveying","url":"https://www.youtube.com/watch?v=LnhXzOaEIHo"}
  ]'::jsonb,
  ARRAY['acc','srvy-1341','introduction','syllabus','orientation'],
  'published'
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  learning_objectives = EXCLUDED.learning_objectives,
  order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes,
  resources = EXCLUDED.resources,
  videos = EXCLUDED.videos,
  tags = EXCLUDED.tags,
  status = EXCLUDED.status,
  updated_at = now();


-- ────────────────────────────────────────────────────────────────────────────
-- 1. LESSON CONTENT (rich HTML)
-- ────────────────────────────────────────────────────────────────────────────

UPDATE learning_lessons SET content = '
<h2>Welcome to SRVY 1341 — Land Surveying</h2>

<p>Welcome to <strong>SRVY 1341: Land Surveying</strong> at Austin Community College. This course is the core lecture companion to <em>SRVY 1335 (Land Surveying Applications Lab)</em>, and together they form the foundation of your traversing, boundary, and adjustment skills.</p>

<h3>Course Description</h3>
<p>A study of the measurement and determination of boundaries, areas, shapes, and location through traversing techniques. Instruction in a variety of adjustment methods using programmed and non-programmed hand-held calculators and computers. Methods of traversing and adjustment of errors according to prevailing and applicable professional standards and the standards of the Texas Board of Professional Engineers and Land Surveyors.</p>

<h3>Prerequisites &amp; Corequisites</h3>
<table style="width:100%; border-collapse:collapse; margin:1rem 0;">
  <thead><tr style="border-bottom:2px solid #374151;">
    <th style="text-align:left; padding:0.5rem;">Requirement</th>
    <th style="text-align:left; padding:0.5rem;">Course</th>
    <th style="text-align:left; padding:0.5rem;">Notes</th>
  </tr></thead>
  <tbody>
    <tr style="border-bottom:1px solid #4B5563;">
      <td style="padding:0.5rem;"><strong>Prerequisite</strong></td>
      <td style="padding:0.5rem;">SRVY 1301 — Introduction to Surveying</td>
      <td style="padding:0.5rem;">Must be completed before enrolling</td>
    </tr>
    <tr style="border-bottom:1px solid #4B5563;">
      <td style="padding:0.5rem;"><strong>Corequisite</strong></td>
      <td style="padding:0.5rem;">SRVY 1335 — Land Surveying Applications (Lab)</td>
      <td style="padding:0.5rem;">Must be taken concurrently</td>
    </tr>
  </tbody>
</table>

<h3>What You Will Learn</h3>
<p>Over the next 16 weeks, you will master the following major topic areas:</p>
<ul>
  <li><strong>Distance Measurement &amp; Corrections</strong> — Chain/tape measurement, temperature, tension, and sag corrections; EDM principles</li>
  <li><strong>Traverse Types &amp; Planning</strong> — Open, closed-loop, and connecting traverses; station selection; accuracy standards</li>
  <li><strong>Traverse Field Procedures</strong> — Angle measurement, total station operation, field notes, direct &amp; reverse readings</li>
  <li><strong>Traverse Computations</strong> — Azimuth propagation, latitude &amp; departure calculation, linear error of closure, relative precision</li>
  <li><strong>Traverse Adjustment</strong> — Compass (Bowditch) rule, transit rule, coordinate adjustment</li>
  <li><strong>Coordinate Geometry (COGO)</strong> — Inverse computations, intersections, coordinate transformations</li>
  <li><strong>Area Computation</strong> — Coordinate method, DMD/DPD method, area by coordinates</li>
  <li><strong>Boundary Surveying</strong> — Retracement principles, deed interpretation, monument hierarchy</li>
  <li><strong>Professional Standards</strong> — TBPELS rules, ALTA/NSPS standards, accuracy requirements</li>
</ul>

<h3>16-Week Semester Overview</h3>
<table style="width:100%; border-collapse:collapse; margin:1rem 0;">
  <thead><tr style="border-bottom:2px solid #374151;">
    <th style="text-align:left; padding:0.5rem;">Week</th>
    <th style="text-align:left; padding:0.5rem;">Topic</th>
  </tr></thead>
  <tbody>
    <tr style="border-bottom:1px solid #4B5563;"><td style="padding:0.4rem;">0</td><td style="padding:0.4rem;">Course Introduction (this lesson)</td></tr>
    <tr style="border-bottom:1px solid #4B5563;"><td style="padding:0.4rem;">1</td><td style="padding:0.4rem;">Distance Measurement — Chaining &amp; Tape Corrections</td></tr>
    <tr style="border-bottom:1px solid #4B5563;"><td style="padding:0.4rem;">2</td><td style="padding:0.4rem;">Traversing Fundamentals — Types &amp; Planning</td></tr>
    <tr style="border-bottom:1px solid #4B5563;"><td style="padding:0.4rem;">3</td><td style="padding:0.4rem;">Traverse Field Procedures — Angles &amp; Instruments</td></tr>
    <tr style="border-bottom:1px solid #4B5563;"><td style="padding:0.4rem;">4</td><td style="padding:0.4rem;">Traverse Computations — Azimuths, Latitudes &amp; Departures</td></tr>
    <tr style="border-bottom:1px solid #4B5563;"><td style="padding:0.4rem;">5</td><td style="padding:0.4rem;">Error of Closure &amp; Relative Precision</td></tr>
    <tr style="border-bottom:1px solid #4B5563;"><td style="padding:0.4rem;">6</td><td style="padding:0.4rem;">Traverse Adjustment — Compass Rule</td></tr>
    <tr style="border-bottom:1px solid #4B5563;"><td style="padding:0.4rem;">7</td><td style="padding:0.4rem;">Traverse Adjustment — Transit Rule &amp; Comparison</td></tr>
    <tr style="border-bottom:1px solid #4B5563;"><td style="padding:0.4rem;">8</td><td style="padding:0.4rem;"><strong>Midterm Exam</strong></td></tr>
    <tr style="border-bottom:1px solid #4B5563;"><td style="padding:0.4rem;">9</td><td style="padding:0.4rem;">Coordinate Geometry — Inverse Computations</td></tr>
    <tr style="border-bottom:1px solid #4B5563;"><td style="padding:0.4rem;">10</td><td style="padding:0.4rem;">Coordinate Geometry — Intersections</td></tr>
    <tr style="border-bottom:1px solid #4B5563;"><td style="padding:0.4rem;">11</td><td style="padding:0.4rem;">Area Computation Methods</td></tr>
    <tr style="border-bottom:1px solid #4B5563;"><td style="padding:0.4rem;">12</td><td style="padding:0.4rem;">Boundary Determination &amp; Retracement</td></tr>
    <tr style="border-bottom:1px solid #4B5563;"><td style="padding:0.4rem;">13</td><td style="padding:0.4rem;">Subdivision &amp; Legal Descriptions</td></tr>
    <tr style="border-bottom:1px solid #4B5563;"><td style="padding:0.4rem;">14</td><td style="padding:0.4rem;">Professional Standards &amp; TBPELS Compliance</td></tr>
    <tr style="border-bottom:1px solid #4B5563;"><td style="padding:0.4rem;">15</td><td style="padding:0.4rem;">Review &amp; Exam Preparation</td></tr>
    <tr><td style="padding:0.4rem;">16</td><td style="padding:0.4rem;"><strong>Final Exam</strong></td></tr>
  </tbody>
</table>

<h3>What You Need</h3>
<ul>
  <li><strong>Textbook:</strong> <em>Elementary Surveying</em> by Ghilani (or <em>Surveying Fundamentals</em> by Nathanson)</li>
  <li><strong>Calculator:</strong> Scientific calculator with trigonometric functions (TI-30X or similar)</li>
  <li><strong>Supplies:</strong> Engineering field notebook, pencils, protractor</li>
</ul>

<h3>Grading Overview</h3>
<ul>
  <li>Weekly Quizzes: 20%</li>
  <li>Homework &amp; Practice Problems: 20%</li>
  <li>Midterm Exam: 25%</li>
  <li>Final Exam: 35%</li>
</ul>

<p>Review the resources and videos below to get oriented, then click <strong>Continue to Next Lesson</strong> to begin Week 1: Distance Measurement.</p>
'

WHERE id = 'acc03b00-0000-0000-0000-000000000001';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. TOPICS (informational — no quiz for this lesson)
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM learning_topics WHERE lesson_id = 'acc03b00-0000-0000-0000-000000000001';

INSERT INTO learning_topics (id, lesson_id, title, content, order_index, keywords) VALUES

('acc03a00-0001-0000-0000-000000000001', 'acc03b00-0000-0000-0000-000000000001',
 'Course Scope and Objectives',
 'SRVY 1341 focuses on traversing — the process of measuring a series of connected lines to establish control points and boundaries. Unlike SRVY 1301, which introduced the full breadth of surveying, this course goes deep into the mathematics and field procedures of traverse work: computing azimuths and bearings, calculating latitudes and departures, evaluating closure, adjusting traverse networks, and ultimately computing coordinates and areas. By the end of this course, you will be able to run a complete traverse from field measurement through final adjusted coordinates — the core skill of every professional land surveyor.',
 1,
 ARRAY['course objectives','traversing','SRVY 1341','land surveying','boundaries','adjustment']),

('acc03a00-0002-0000-0000-000000000001', 'acc03b00-0000-0000-0000-000000000001',
 'Prerequisite Review: What You Should Already Know',
 'This course assumes you have completed SRVY 1301 and are comfortable with: measurement theory (systematic vs. random errors, precision vs. accuracy), basic leveling (differential leveling, HI method, turning points), distance measurement fundamentals (steel tape, EDM basics), angles and directions (azimuths 0°-360°, bearings N/S angle E/W, DMS arithmetic), and basic trigonometry (sine, cosine, tangent). If any of these topics feel unfamiliar, review the SRVY 1301 module on this platform before proceeding.',
 2,
 ARRAY['prerequisites','SRVY 1301','review','measurement theory','leveling','angles','trigonometry']),

('acc03a00-0003-0000-0000-000000000001', 'acc03b00-0000-0000-0000-000000000001',
 'Relationship Between SRVY 1341 and SRVY 1335',
 'SRVY 1341 (this course) is the lecture component. SRVY 1335 (Lab) is the hands-on companion taken concurrently. In lecture, you learn the theory, formulas, and computation procedures. In lab, you operate the instruments (total stations, levels, tapes) and collect the field data that you will compute in this class. The two courses reinforce each other: what you compute in 1341, you measure in 1335. Attending both is essential — you cannot fully understand adjustment without having measured the raw data yourself.',
 3,
 ARRAY['SRVY 1335','lab','corequisite','field work','lecture','theory and practice']);


-- No quiz questions for lesson 0 (intro lesson — completed via "Continue" button)

COMMIT;
