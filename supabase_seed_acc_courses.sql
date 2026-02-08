-- ============================================================================
-- STARR Surveying — ACC Course Modules Seed Data
-- ============================================================================
-- Austin Community College Geospatial Engineering courses:
--   SRVY 1301 - Introduction to Surveying (3 SCH)
--   SRVY 1335 - Land Surveying Applications Lab (3 SCH)
--   SRVY 1341 - Land Surveying (3 SCH)
--
-- ACC semesters are 16 weeks. Each module has:
--   - 14 weekly lessons (weeks without exams)
--   - 1 midterm exam (Week 8)
--   - 1 final exam (Week 16)
--   - Weekly quizzes (5 questions each, non-exam weeks)
--   - Weekly homework sets (tagged in question_bank)
--
-- Run AFTER supabase_schema.sql and supabase_seed_curriculum.sql
-- Safe to re-run (uses upserts and delete-then-insert patterns).
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: ACC COURSE MODULES (3 modules, order_index 29-31)
-- ============================================================================

INSERT INTO learning_modules (id, title, description, difficulty, estimated_hours, order_index, status, tags, created_at, updated_at)
VALUES
  ('acc00001-0000-0000-0000-000000000001',
   'ACC SRVY 1301 — Introduction to Surveying',
   'Austin Community College SRVY 1301 (3 SCH). An overview of the surveying profession covering the history of surveying and its impact on the world, review of mathematics used in surveying, introduction to basic surveying equipment with emphasis on horizontal and vertical measurements, instruction on surveying procedures and limitation of errors, and calculations to determine precision and error of closure. Topics include: units and significant figures, field notes, theory of errors, leveling theory and field procedures, distance measurement, angles/azimuths/bearings, total stations, traversing, traverse computations, coordinate geometry, area computation, and mapping surveys. Textbook: Elementary Surveying by Ghilani or Surveying Fundamentals by Nathanson. No prerequisites.',
   'beginner', 48.0, 29, 'published',
   ARRAY['acc','srvy-1301','introduction','surveying','college-course','semester'],
   now(), now()),

  ('acc00002-0000-0000-0000-000000000002',
   'ACC SRVY 1335 — Land Surveying Applications (Lab)',
   'Austin Community College SRVY 1335 (3 SCH). An intermediate lab course covering electronic distance measuring equipment, total stations, theodolites, and data collection methods. Includes monument and corner establishment. Students gain practical field experience with equipment, techniques, and hardware necessary to measure horizontal and vertical angles and distances used in surveying. This is the lab companion to SRVY 1341 and must be taken concurrently. Topics include: EDM equipment operation, total station setup and data recording, theodolite angular measurement, horizontal and vertical angle field procedures, traverse field work, differential leveling, profile and cross-section leveling, monument setting, and a comprehensive field survey project. Prerequisite: SRVY 1301. Corequisite: SRVY 1341.',
   'intermediate', 48.0, 30, 'published',
   ARRAY['acc','srvy-1335','lab','field-work','equipment','college-course','semester'],
   now(), now()),

  ('acc00003-0000-0000-0000-000000000003',
   'ACC SRVY 1341 — Land Surveying',
   'Austin Community College SRVY 1341 (3 SCH). A study of the measurement and determination of boundaries, areas, shapes, and location through traversing techniques. Instruction in a variety of adjustment methods using programmed and non-programmed hand-held calculators and computers. Methods of traversing and adjustment of errors according to prevailing and applicable professional standards and the standards of the Texas Board of Professional Engineers and Land Surveyors. Topics include: traverse types and planning, latitudes and departures, error of closure and precision ratios, compass rule and transit rule adjustments, coordinate geometry and inverse computations, area computation methods (coordinate and DMD), boundary determination and retracement principles, subdivision concepts, and professional standards compliance. Prerequisite: SRVY 1301. Corequisite: SRVY 1335.',
   'intermediate', 48.0, 31, 'published',
   ARRAY['acc','srvy-1341','land-surveying','traversing','boundaries','college-course','semester'],
   now(), now())

ON CONFLICT (id) DO UPDATE SET
  title           = EXCLUDED.title,
  description     = EXCLUDED.description,
  difficulty      = EXCLUDED.difficulty,
  estimated_hours = EXCLUDED.estimated_hours,
  order_index     = EXCLUDED.order_index,
  status          = EXCLUDED.status,
  tags            = EXCLUDED.tags,
  updated_at      = now();


-- ============================================================================
-- SECTION 2: SRVY 1301 LESSONS (16 weeks — 14 lessons + 2 exam weeks)
-- ============================================================================

DELETE FROM learning_lessons WHERE module_id = 'acc00001-0000-0000-0000-000000000001';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  -- Week 1
  ('acc01b01-0000-0000-0000-000000000001', 'acc00001-0000-0000-0000-000000000001',
   'Week 1: Introduction to Surveying',
   'Overview of the surveying profession, its history from ancient Egypt and Rome through modern GNSS technology, the role of surveying in society, types of surveys (boundary, topographic, construction, geodetic, hydrographic), and the surveying method. Introduction to the course structure and expectations.',
   ARRAY['Define surveying and explain its importance','Identify major types of surveys','Describe the historical development of surveying','Understand the surveying method and workflow'],
   1, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1301','week-1','introduction','history'], 'published'),

  -- Week 2
  ('acc01b02-0000-0000-0000-000000000001', 'acc00001-0000-0000-0000-000000000001',
   'Week 2: Units, Significant Figures, and Field Notes',
   'Systems of units used in surveying (US Survey foot, International foot, metric), significant figures and rounding rules, recording field notes properly, types of field books and note-keeping standards, sketches and tabulations.',
   ARRAY['Convert between US Survey foot and metric units','Apply significant figure rules to computations','Properly record and organize field notes','Understand the difference between US Survey foot and International foot'],
   2, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1301','week-2','units','field-notes','significant-figures'], 'published'),

  -- Week 3
  ('acc01b03-0000-0000-0000-000000000001', 'acc00001-0000-0000-0000-000000000001',
   'Week 3: Theory of Errors in Observation',
   'Types of errors: systematic, random, and blunders. Precision vs accuracy. The normal distribution. Standard deviation, standard error of the mean, most probable value, error propagation, relative precision, and confidence intervals. The 68-95-99.7 rule.',
   ARRAY['Distinguish between systematic, random, and gross errors','Calculate standard deviation and standard error of the mean','Apply error propagation formulas','Compute relative precision ratios'],
   3, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1301','week-3','errors','statistics','precision','accuracy'], 'published'),

  -- Week 4
  ('acc01b04-0000-0000-0000-000000000001', 'acc00001-0000-0000-0000-000000000001',
   'Week 4: Leveling — Theory, Methods, and Equipment',
   'Principles of leveling: the geoid, level surfaces, and datum planes. Types of levels: dumpy, automatic, digital. Level rods and their graduations. The leveling equation: HI = Elev + BS; Elev = HI - FS. Curvature and refraction corrections.',
   ARRAY['Explain the leveling principle and the role of a datum','Identify parts of an automatic level and level rod','Calculate HI and unknown elevations','Apply curvature and refraction correction formula'],
   4, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1301','week-4','leveling','theory','equipment'], 'published'),

  -- Week 5
  ('acc01b05-0000-0000-0000-000000000001', 'acc00001-0000-0000-0000-000000000001',
   'Week 5: Leveling — Field Procedures and Computations',
   'Differential leveling procedures: turning points, benchmarks, level circuits. Profile leveling and cross-sections. Level loop closure, allowable misclosure standards, and distributing closure error. Three-wire leveling. Reciprocal leveling. The two-peg test for collimation error.',
   ARRAY['Perform differential leveling computations','Calculate and distribute leveling misclosure','Explain the purpose of the two-peg test','Compute profile elevations and plot profiles'],
   5, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1301','week-5','leveling','field-procedures','closure'], 'published'),

  -- Week 6
  ('acc01b06-0000-0000-0000-000000000001', 'acc00001-0000-0000-0000-000000000001',
   'Week 6: Distance Measurement',
   'Methods of measuring distances: pacing, odometer, stadia, taping, and electronic distance measurement (EDM). Taping equipment and procedures, tape corrections (temperature, tension, sag, slope). EDM principles, prism constants. Total station distance measurement.',
   ARRAY['Apply tape corrections for temperature, tension, and sag','Explain how EDM instruments measure distance','Convert slope distance to horizontal distance','Calculate corrected distances using standard formulas'],
   6, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1301','week-6','distance','measurement','EDM','taping'], 'published'),

  -- Week 7
  ('acc01b07-0000-0000-0000-000000000001', 'acc00001-0000-0000-0000-000000000001',
   'Week 7: Angles, Azimuths, and Bearings',
   'Types of angles: horizontal, vertical, zenith. Bearings and azimuths: definition, conversion between them. Magnetic declination. Interior angles, deflection angles, and angles to the right. DMS format arithmetic: adding and subtracting angles in degrees, minutes, seconds.',
   ARRAY['Convert between bearings and azimuths','Perform DMS angle arithmetic','Apply magnetic declination corrections','Compute bearings from azimuths and vice versa'],
   7, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1301','week-7','angles','bearings','azimuths','directions'], 'published'),

  -- Week 8: MIDTERM EXAM (no lesson content — exam only)
  ('acc01b08-0000-0000-0000-000000000001', 'acc00001-0000-0000-0000-000000000001',
   'Week 8: Midterm Exam',
   'Midterm examination covering Weeks 1–7: Introduction to surveying, units and field notes, theory of errors, leveling theory and procedures, distance measurement, and angles/bearings/azimuths. Review all homework and quiz material.',
   ARRAY['Review all concepts from Weeks 1-7','Practice computation problems','Review key formulas and definitions'],
   8, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1301','week-8','midterm','exam'], 'published'),

  -- Week 9
  ('acc01b09-0000-0000-0000-000000000001', 'acc00001-0000-0000-0000-000000000001',
   'Week 9: Total Station Instruments and Angle Observations',
   'Total station components and operation. Electronic angle measurement. Setting up over a point: forced centering. Measuring angles by repetition and direction methods. Closing the horizon. Sources of error in angle measurement.',
   ARRAY['Describe the components of a total station','Explain forced centering and its advantages','Measure angles using repetition and direction methods','Identify and minimize sources of angular error'],
   9, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1301','week-9','total-station','angle-measurement'], 'published'),

  -- Week 10
  ('acc01b10-0000-0000-0000-000000000001', 'acc00001-0000-0000-0000-000000000001',
   'Week 10: Traversing',
   'Types of traverses: open, closed (loop and connecting). Traverse stations, planning, and procedures. Traverse angles and distances. Field procedures for running a traverse. Traverse sketches and field notes.',
   ARRAY['Distinguish between open and closed traverses','Plan and execute a traverse survey','Record proper traverse field notes','Identify sources of error in traverse surveys'],
   10, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1301','week-10','traversing','field-procedures'], 'published'),

  -- Week 11
  ('acc01b11-0000-0000-0000-000000000001', 'acc00001-0000-0000-0000-000000000001',
   'Week 11: Traverse Computations',
   'Balancing angles in a closed traverse. Computing azimuths/bearings from angles. Latitudes and departures. Error of closure and relative precision. The compass rule (Bowditch) adjustment. Transit rule. Adjusted coordinates.',
   ARRAY['Balance traverse angles','Compute latitudes and departures','Calculate error of closure and relative precision','Apply the compass rule to adjust a traverse'],
   11, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1301','week-11','traverse-computations','adjustment','compass-rule'], 'published'),

  -- Week 12
  ('acc01b12-0000-0000-0000-000000000001', 'acc00001-0000-0000-0000-000000000001',
   'Week 12: Coordinate Geometry in Surveying',
   'Rectangular coordinate systems. Inversing between points (distance and direction from coordinates). Intersection problems. Coordinate transformations. Using coordinates for survey computations.',
   ARRAY['Compute distance and direction between coordinate pairs','Solve intersection problems using coordinates','Apply coordinate geometry to survey problems','Understand the relationship between COGO and traverse work'],
   12, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1301','week-12','coordinate-geometry','COGO','inversing'], 'published'),

  -- Week 13
  ('acc01b13-0000-0000-0000-000000000001', 'acc00001-0000-0000-0000-000000000001',
   'Week 13: Area Computation',
   'Methods of area computation: coordinate method, double meridian distance (DMD) method, planimeter, and graphical methods. Area by coordinates formula. Area of irregular tracts. Partitioning land.',
   ARRAY['Compute area using the coordinate method','Apply the DMD method for area calculation','Understand when to use different area methods','Partition a tract into specified areas'],
   13, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1301','week-13','area','computation','DMD','coordinates'], 'published'),

  -- Week 14
  ('acc01b14-0000-0000-0000-000000000001', 'acc00001-0000-0000-0000-000000000001',
   'Week 14: Mapping Surveys and Map Drafting',
   'Topographic mapping principles. Contour lines and contour intervals. Planimetric vs topographic maps. Map scales, symbols, and legends. Digital mapping and GIS introduction. CAD and mapping software overview.',
   ARRAY['Interpret and draw contour lines','Explain map scale and common map symbols','Describe the difference between planimetric and topographic maps','Understand basic digital mapping concepts'],
   14, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1301','week-14','mapping','contours','topographic'], 'published'),

  -- Week 15
  ('acc01b15-0000-0000-0000-000000000001', 'acc00001-0000-0000-0000-000000000001',
   'Week 15: Boundary Surveys and Public Lands',
   'Introduction to boundary surveys and property descriptions. The US Public Land Survey System (PLSS): townships, ranges, sections. Texas land grants and the Spanish/Mexican land system. Metes and bounds descriptions. Subdivision plats. Review for final exam.',
   ARRAY['Describe the PLSS and locate land by section/township/range','Interpret a metes and bounds description','Explain how Texas land grants differ from PLSS','Identify key elements of a subdivision plat'],
   15, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1301','week-15','boundary','public-lands','PLSS','legal-descriptions'], 'published'),

  -- Week 16: FINAL EXAM
  ('acc01b16-0000-0000-0000-000000000001', 'acc00001-0000-0000-0000-000000000001',
   'Week 16: Final Exam',
   'Comprehensive final examination covering all course material from Weeks 1–15. Emphasis on computation problems involving leveling, distance corrections, traverse adjustment, coordinate geometry, area computation, and direction/bearing conversions.',
   ARRAY['Review all course concepts','Practice comprehensive computation problems','Focus on weak areas identified during the semester'],
   16, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1301','week-16','final','exam'], 'published');


-- ============================================================================
-- SECTION 3: SRVY 1335 LESSONS (16 weeks — 14 lessons + 2 exam weeks)
-- ============================================================================

DELETE FROM learning_lessons WHERE module_id = 'acc00002-0000-0000-0000-000000000002';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  -- Week 1
  ('acc02b01-0000-0000-0000-000000000001', 'acc00002-0000-0000-0000-000000000002',
   'Week 1: Lab Safety, Equipment Overview, and Field Book Setup',
   'Lab safety procedures and protocols. Overview of surveying equipment available: levels, total stations, EDM, theodolites, rods, tripods, tapes, plumb bobs. Introduction to field book setup, note-keeping standards, and lab expectations. Equipment check-out procedures.',
   ARRAY['Follow proper lab and field safety procedures','Identify all major surveying equipment','Set up and organize a surveying field book','Understand equipment care and check-out procedures'],
   1, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1335','week-1','safety','equipment','field-book'], 'published'),

  -- Week 2
  ('acc02b02-0000-0000-0000-000000000001', 'acc00002-0000-0000-0000-000000000002',
   'Week 2: Electronic Distance Measuring (EDM) Equipment',
   'EDM principles review. Setting up EDM equipment: tripod setup, instrument leveling, prism assembly. Measuring distances with EDM. Atmospheric corrections. Recording EDM measurements. Hands-on practice measuring known distances.',
   ARRAY['Set up and level an EDM instrument on a tripod','Assemble and position a prism/target','Measure distances and apply atmospheric corrections','Record EDM measurements properly in a field book'],
   2, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1335','week-2','EDM','setup','distance-measurement'], 'published'),

  -- Week 3
  ('acc02b03-0000-0000-0000-000000000001', 'acc00002-0000-0000-0000-000000000002',
   'Week 3: Total Station Setup and Operation',
   'Total station components and controls. Setting up over a point: tripod placement, optical plummet, leveling with tribrach. Turning the instrument on, configuring settings. Backsight setup and orientation. Measuring angles and distances simultaneously.',
   ARRAY['Set up a total station over a known point','Use the optical plummet for precise centering','Configure instrument settings for a survey','Take simultaneous angle and distance measurements'],
   3, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1335','week-3','total-station','setup','operation'], 'published'),

  -- Week 4
  ('acc02b04-0000-0000-0000-000000000001', 'acc00002-0000-0000-0000-000000000002',
   'Week 4: Theodolite Operation and Angular Measurement',
   'Theodolite vs total station differences. Reading horizontal and vertical circles. Turning horizontal angles: angle right, deflection angles. Closing the horizon. Repetition method for improved angle accuracy. Hands-on practice turning angles.',
   ARRAY['Operate a theodolite to measure horizontal angles','Read horizontal and vertical circles correctly','Use the repetition method to improve angle accuracy','Close the horizon and check angular measurements'],
   4, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1335','week-4','theodolite','angular-measurement'], 'published'),

  -- Week 5
  ('acc02b05-0000-0000-0000-000000000001', 'acc00002-0000-0000-0000-000000000002',
   'Week 5: Horizontal Angle Measurement Lab',
   'Field exercise: measure a complete set of horizontal angles around a multi-station figure. Practice turning angles by repetition (2D and 4D sets). Record all measurements in standard field note format. Compute angular closure.',
   ARRAY['Measure angles at multiple stations in the field','Turn angles by repetition for improved accuracy','Record angular measurements in proper field note format','Compute and evaluate angular closure'],
   5, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1335','week-5','horizontal-angles','field-exercise'], 'published'),

  -- Week 6
  ('acc02b06-0000-0000-0000-000000000001', 'acc00002-0000-0000-0000-000000000002',
   'Week 6: Vertical Angle Measurement and Zenith Angles',
   'Measuring vertical angles and zenith angles with total stations and theodolites. Trigonometric leveling using vertical angles. Computing elevation differences from zenith angles and slope distances. Index error and its correction.',
   ARRAY['Measure vertical and zenith angles accurately','Compute elevation differences using trigonometric leveling','Identify and correct for index error','Apply vertical angle measurements to real scenarios'],
   6, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1335','week-6','vertical-angles','zenith','trigonometric-leveling'], 'published'),

  -- Week 7
  ('acc02b07-0000-0000-0000-000000000001', 'acc00002-0000-0000-0000-000000000002',
   'Week 7: Distance Measurement Techniques — Taping and EDM Comparison',
   'Field exercise comparing steel tape and EDM measurements over the same courses. Tape corrections applied in the field (temperature, slope, tension). EDM measurements and atmospheric corrections. Comparison of precision achieved by each method.',
   ARRAY['Measure distances using both taping and EDM methods','Apply field corrections to tape measurements','Compare precision between taping and EDM','Document measurement comparisons in field notes'],
   7, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1335','week-7','taping','EDM','comparison','field-exercise'], 'published'),

  -- Week 8: MIDTERM PRACTICAL EXAM
  ('acc02b08-0000-0000-0000-000000000001', 'acc00002-0000-0000-0000-000000000002',
   'Week 8: Midterm Practical Exam',
   'Midterm practical examination covering Weeks 1–7. Students demonstrate proficiency in: instrument setup (total station and level), measuring angles by repetition, measuring distances with EDM, recording proper field notes, and basic field computations.',
   ARRAY['Demonstrate proper instrument setup procedures','Accurately measure angles and distances','Maintain proper field notes under exam conditions','Complete field computations correctly'],
   8, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1335','week-8','midterm','practical-exam'], 'published'),

  -- Week 9
  ('acc02b09-0000-0000-0000-000000000001', 'acc00002-0000-0000-0000-000000000002',
   'Week 9: Open Traverse Field Procedures',
   'Planning and executing an open traverse. Station selection and marking. Measuring traverse angles and distances. Forward azimuths from backsight orientation. Field notes for traverse surveys. Understanding limitations of open traverses.',
   ARRAY['Plan traverse station locations in the field','Execute an open traverse measuring angles and distances','Maintain proper traverse field notes','Understand why open traverses lack closure checks'],
   9, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1335','week-9','open-traverse','field-procedures'], 'published'),

  -- Week 10
  ('acc02b10-0000-0000-0000-000000000001', 'acc00002-0000-0000-0000-000000000002',
   'Week 10: Closed Traverse Field Procedures',
   'Planning and executing a closed (loop) traverse. Setting up at each station, measuring interior angles and distances. Closing back to the starting point. Computing angular closure in the field. Reobservation if closure exceeds tolerance.',
   ARRAY['Execute a closed loop traverse in the field','Measure all interior angles and side distances','Compute angular closure on-site','Determine if reobservation is needed based on closure tolerance'],
   10, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1335','week-10','closed-traverse','field-procedures'], 'published'),

  -- Week 11
  ('acc02b11-0000-0000-0000-000000000001', 'acc00002-0000-0000-0000-000000000002',
   'Week 11: Data Collection Methods and Electronic Recording',
   'Electronic data collection with total stations. Data collector/controller operation. Coding systems for field features. Downloading data to computer. Data file formats and management. Comparison with manual field notes.',
   ARRAY['Use a data collector with a total station','Apply proper coding for field features','Download and manage electronic survey data','Compare electronic and manual data collection methods'],
   11, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1335','week-11','data-collection','electronic','data-management'], 'published'),

  -- Week 12
  ('acc02b12-0000-0000-0000-000000000001', 'acc00002-0000-0000-0000-000000000002',
   'Week 12: Differential Leveling Field Lab',
   'Complete differential leveling exercise: run a level circuit from a benchmark, through multiple turning points, and close back to the benchmark. Record all BS, HI, FS readings. Compute misclosure and distribute error. Practice three-wire leveling.',
   ARRAY['Run a complete differential leveling circuit','Record proper leveling notes with all BS/HI/FS values','Compute misclosure and distribute error','Perform three-wire leveling for improved accuracy'],
   12, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1335','week-12','differential-leveling','field-lab'], 'published'),

  -- Week 13
  ('acc02b13-0000-0000-0000-000000000001', 'acc00002-0000-0000-0000-000000000002',
   'Week 13: Monument and Corner Establishment',
   'Types of survey monuments: iron rods, pipes, concrete, caps, nails. Setting monuments in the field. Corner accessories and reference ties. Establishing property corners from deed descriptions. Monument documentation and perpetuation.',
   ARRAY['Identify different types of survey monuments','Set a survey monument in the field','Establish reference ties to monuments','Document monument information properly'],
   13, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1335','week-13','monuments','corners','establishment'], 'published'),

  -- Week 14
  ('acc02b14-0000-0000-0000-000000000001', 'acc00002-0000-0000-0000-000000000002',
   'Week 14: Profile and Cross-Section Leveling',
   'Field exercise: run a profile level along a route centerline. Take cross-section levels at regular intervals. Record and organize profile and cross-section data. Plot a profile in the field book. Compute cut and fill estimates.',
   ARRAY['Run a profile level along a centerline','Take cross-section readings at station intervals','Plot a field profile','Understand cut and fill estimation from cross-sections'],
   14, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1335','week-14','profile-leveling','cross-sections'], 'published'),

  -- Week 15
  ('acc02b15-0000-0000-0000-000000000001', 'acc00002-0000-0000-0000-000000000002',
   'Week 15: Comprehensive Field Survey Project',
   'Final field project: complete a boundary-style survey including setting up control, running a closed traverse, measuring all angles and distances, running differential levels, setting monuments, and preparing field notes. This project integrates all skills from the semester.',
   ARRAY['Plan and execute a complete field survey','Integrate traversing, leveling, and monument setting','Produce professional-quality field notes','Demonstrate all lab skills learned during the semester'],
   15, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1335','week-15','field-project','comprehensive'], 'published'),

  -- Week 16: FINAL PRACTICAL EXAM
  ('acc02b16-0000-0000-0000-000000000001', 'acc00002-0000-0000-0000-000000000002',
   'Week 16: Final Practical Exam',
   'Comprehensive final practical examination. Students demonstrate mastery of all field procedures: instrument setup, traversing, leveling, angle measurement, distance measurement, data recording, and field computations. Exam may include unknown point determination.',
   ARRAY['Demonstrate mastery of all instrument setup procedures','Execute traverse and leveling tasks under exam conditions','Produce accurate measurements and proper field notes','Complete all field computations correctly'],
   16, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1335','week-16','final','practical-exam'], 'published');


-- ============================================================================
-- SECTION 4: SRVY 1341 LESSONS (16 weeks — 14 lessons + 2 exam weeks)
-- ============================================================================

DELETE FROM learning_lessons WHERE module_id = 'acc00003-0000-0000-0000-000000000003';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  -- Week 1
  ('acc03b01-0000-0000-0000-000000000001', 'acc00003-0000-0000-0000-000000000003',
   'Week 1: Course Introduction and SRVY 1301 Review',
   'Course overview and expectations. Comprehensive review of SRVY 1301 fundamentals: measurement theory, leveling, distance measurement, angles and directions. Introduction to the focus of SRVY 1341: traversing, boundaries, areas, and adjustment methods.',
   ARRAY['Review key concepts from SRVY 1301','Understand the scope and objectives of SRVY 1341','Identify the relationship between 1341 lecture and 1335 lab','Preview major topics: traversing, boundaries, areas, adjustment'],
   1, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1341','week-1','review','introduction'], 'published'),

  -- Week 2
  ('acc03b02-0000-0000-0000-000000000001', 'acc00003-0000-0000-0000-000000000003',
   'Week 2: Traversing Fundamentals — Types and Planning',
   'Detailed study of traverse types: open, closed loop, closed connecting. When to use each type. Traverse planning: station selection, intervisibility, access. Traverse specifications and accuracy standards for different survey orders.',
   ARRAY['Describe the three types of traverses and their applications','Plan traverse station locations for optimal results','Understand accuracy standards for different traverse orders','Explain why closed traverses are preferred over open traverses'],
   2, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1341','week-2','traversing','types','planning'], 'published'),

  -- Week 3
  ('acc03b03-0000-0000-0000-000000000001', 'acc00003-0000-0000-0000-000000000003',
   'Week 3: Traverse Field Procedures',
   'Detailed traverse field procedures. Setting up at traverse stations. Backsight/foresight procedures. Measuring traverse angles: interior angles, deflection angles, angles to the right. Measuring traverse distances. Error checks in the field.',
   ARRAY['Execute proper traverse field procedures step by step','Choose appropriate angle measurement method for the survey','Perform field checks to detect blunders','Record traverse measurements in standard field note format'],
   3, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1341','week-3','traverse','field-procedures','angles','distances'], 'published'),

  -- Week 4
  ('acc03b04-0000-0000-0000-000000000001', 'acc00003-0000-0000-0000-000000000003',
   'Week 4: Traverse Computations I — Latitudes and Departures',
   'Computing adjusted angles for a closed traverse. Determining azimuths or bearings from adjusted angles. Calculating latitudes (N/S component) and departures (E/W component) for each traverse leg. Latitude = distance × cos(azimuth), Departure = distance × sin(azimuth).',
   ARRAY['Balance angles in a closed traverse','Compute azimuths/bearings from balanced angles','Calculate latitudes and departures for each traverse leg','Understand the relationship between lat/dep and coordinate differences'],
   4, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1341','week-4','latitudes','departures','traverse-computations'], 'published'),

  -- Week 5
  ('acc03b05-0000-0000-0000-000000000001', 'acc00003-0000-0000-0000-000000000003',
   'Week 5: Traverse Computations II — Error of Closure',
   'Sum of latitudes and departures for a closed traverse. Linear error of closure = sqrt(sum_lat^2 + sum_dep^2). Relative precision = error/perimeter. Precision standards and when resurvey is needed. Example computations with full traverse worksheets.',
   ARRAY['Compute the linear error of closure for a traverse','Calculate relative precision ratios','Compare precision to survey order standards','Determine if a traverse meets accuracy requirements'],
   5, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1341','week-5','error-of-closure','precision','traverse-computations'], 'published'),

  -- Week 6
  ('acc03b06-0000-0000-0000-000000000001', 'acc00003-0000-0000-0000-000000000003',
   'Week 6: Compass Rule (Bowditch) Adjustment',
   'The compass rule (Bowditch method) for adjusting traverse latitudes and departures. Correction formula: correction = -(misclosure × leg_distance / total_perimeter). Computing adjusted latitudes and departures. Calculating final adjusted coordinates.',
   ARRAY['Apply the compass rule to adjust traverse latitudes and departures','Compute corrections for each traverse leg','Calculate adjusted coordinates from adjusted lat/dep','Verify the adjustment by checking that sums are zero'],
   6, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1341','week-6','compass-rule','Bowditch','adjustment'], 'published'),

  -- Week 7
  ('acc03b07-0000-0000-0000-000000000001', 'acc00003-0000-0000-0000-000000000003',
   'Week 7: Transit Rule and Other Adjustment Methods',
   'The transit rule adjustment method: corrections proportional to lat/dep magnitude. Comparison of compass rule vs transit rule. Introduction to Crandall method and least squares adjustment concepts. When to use each method. Calculator and spreadsheet techniques.',
   ARRAY['Apply the transit rule adjustment method','Compare results between compass and transit rules','Understand the concept of least squares adjustment','Use calculators and spreadsheets for traverse adjustment'],
   7, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1341','week-7','transit-rule','Crandall','least-squares','adjustment'], 'published'),

  -- Week 8: MIDTERM EXAM
  ('acc03b08-0000-0000-0000-000000000001', 'acc00003-0000-0000-0000-000000000003',
   'Week 8: Midterm Exam',
   'Midterm examination covering Weeks 1–7: traverse types and planning, field procedures, latitudes and departures, error of closure, relative precision, compass rule adjustment, and transit rule adjustment. Heavy emphasis on computation problems.',
   ARRAY['Review all traverse computation procedures','Practice complete traverse adjustment problems','Review key formulas: lat/dep, error of closure, compass rule, transit rule','Review adjustment verification techniques'],
   8, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1341','week-8','midterm','exam'], 'published'),

  -- Week 9
  ('acc03b09-0000-0000-0000-000000000001', 'acc00003-0000-0000-0000-000000000003',
   'Week 9: Coordinate Geometry — Inversing and Intersections',
   'Inverse computations: computing distance and direction between two coordinate pairs. Intersection problems: finding a point from two directions (direction-direction), two distances (distance-distance), or one of each. Resection. Practical applications.',
   ARRAY['Compute inverse (distance and azimuth) from coordinates','Solve direction-direction intersection problems','Solve distance-distance intersection problems','Apply COGO computations to survey problems'],
   9, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1341','week-9','coordinate-geometry','inverse','intersection'], 'published'),

  -- Week 10
  ('acc03b10-0000-0000-0000-000000000001', 'acc00003-0000-0000-0000-000000000003',
   'Week 10: Area Computation — Coordinate and DMD Methods',
   'Area by coordinate method: the cross-multiply formula. Area by double meridian distance (DMD) method. Double parallel distance (DPD) method. Comparison of methods. Area units and conversions (sq ft, acres, hectares). Worked examples.',
   ARRAY['Compute area using the coordinate method (cross-multiply)','Compute area using the DMD method','Convert between square feet, acres, and hectares','Verify area calculations using multiple methods'],
   10, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1341','week-10','area','coordinate-method','DMD','computation'], 'published'),

  -- Week 11
  ('acc03b11-0000-0000-0000-000000000001', 'acc00003-0000-0000-0000-000000000003',
   'Week 11: Boundary Determination I — Evidence and Monuments',
   'Introduction to boundary surveys. Types of boundary evidence: monuments, fences, occupation, deed records. Priority of calls: natural monuments, artificial monuments, distances, areas, directions. Original vs retracement surveys. The role of intent.',
   ARRAY['Identify the types of boundary evidence','Explain the priority of calls in resolving conflicts','Distinguish between original and retracement surveys','Understand the legal concept of original surveyor intent'],
   11, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1341','week-11','boundary','evidence','monuments','priority-of-calls'], 'published'),

  -- Week 12
  ('acc03b12-0000-0000-0000-000000000001', 'acc00003-0000-0000-0000-000000000003',
   'Week 12: Boundary Determination II — Retracement Principles',
   'Retracement survey principles: follow in the footsteps of the original surveyor. Proportioning. Lost and obliterated corners. Deed interpretation basics. Senior vs junior rights. Adverse possession overview. Practical boundary problems.',
   ARRAY['Apply retracement principles to boundary surveys','Distinguish between lost and obliterated corners','Understand proportioning methods for lost corners','Explain senior vs junior rights concepts'],
   12, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1341','week-12','boundary','retracement','lost-corners','deed-interpretation'], 'published'),

  -- Week 13
  ('acc03b13-0000-0000-0000-000000000001', 'acc00003-0000-0000-0000-000000000003',
   'Week 13: Subdivision Concepts and Curve Data',
   'Subdivision planning and platting. Lot layout and design. Introduction to horizontal curves: simple curves, curve terminology (radius, delta, tangent, length, chord). Basic curve computation formulas. Curves in boundary descriptions.',
   ARRAY['Understand subdivision planning principles','Identify horizontal curve elements and terminology','Compute basic curve data (T, L, C, E, M from R and delta)','Interpret curve data in boundary descriptions'],
   13, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1341','week-13','subdivision','curves','platting'], 'published'),

  -- Week 14
  ('acc03b14-0000-0000-0000-000000000001', 'acc00003-0000-0000-0000-000000000003',
   'Week 14: Computer Applications in Traverse Adjustment',
   'Using surveying software and spreadsheets for traverse computations. Calculator programs for lat/dep, adjustment, and area. Introduction to COGO software. Automating repetitive computations. Checking computer results against hand calculations.',
   ARRAY['Use spreadsheets to perform traverse adjustments','Program a calculator for surveying computations','Understand the role of COGO software','Verify computer results with manual calculations'],
   14, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1341','week-14','computer','software','spreadsheets','COGO'], 'published'),

  -- Week 15
  ('acc03b15-0000-0000-0000-000000000001', 'acc00003-0000-0000-0000-000000000003',
   'Week 15: Professional Standards and Comprehensive Review',
   'Texas Board of Professional Land Surveying standards and specifications. Minimum standards for boundary surveys. ALTA/NSPS land title survey standards overview. Ethics and professional responsibility. Comprehensive review for the final exam.',
   ARRAY['Understand Texas minimum standards for surveys','Describe ALTA/NSPS survey requirements','Apply professional ethics to surveying scenarios','Review all course material for the final exam'],
   15, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1341','week-15','standards','TBPELS','ALTA','review'], 'published'),

  -- Week 16: FINAL EXAM
  ('acc03b16-0000-0000-0000-000000000001', 'acc00003-0000-0000-0000-000000000003',
   'Week 16: Final Exam',
   'Comprehensive final examination covering all course material from Weeks 1–15. Heavy emphasis on traverse adjustment computations, coordinate geometry, area computation, and boundary determination concepts. Both computation and conceptual questions.',
   ARRAY['Review all computation procedures thoroughly','Practice full traverse adjustment problems end-to-end','Review boundary determination concepts and priority of calls','Focus on weak areas identified during the semester'],
   16, 180, '[]'::jsonb, '[]'::jsonb,
   ARRAY['acc','srvy-1341','week-16','final','exam'], 'published');


-- ============================================================================
-- SECTION 5: QUESTION BANK — SRVY 1301 (Weekly quizzes + Midterm + Final)
-- ============================================================================
-- Each non-exam week has 5 quiz questions + 3 homework problems = 8 questions
-- Midterm: 15 questions covering weeks 1-7
-- Final: 20 questions comprehensive
-- Total: 14 weeks × 8 + 15 + 20 = 147 questions

DELETE FROM question_bank WHERE tags @> ARRAY['acc-srvy-1301'];

-- Week 1 Quiz & Homework
INSERT INTO question_bank (question_text, question_type, options, correct_answer, explanation, difficulty, module_id, lesson_id, exam_category, tags) VALUES
('What is the primary purpose of a boundary survey?', 'multiple_choice', '["To create a topographic map","To establish or retrace property lines and corners","To design a road alignment","To measure elevations for drainage"]'::jsonb, 'To establish or retrace property lines and corners', 'A boundary survey (also called cadastral survey) is specifically designed to establish, retrace, or reestablish property lines and corners based on deed descriptions and survey evidence.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b01-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-1','quiz','survey-types']),
('Which ancient civilization is credited with some of the earliest known surveying, using it to re-establish farm boundaries after Nile floods?', 'multiple_choice', '["Roman Empire","Ancient Greece","Ancient Egypt","Mesopotamia"]'::jsonb, 'Ancient Egypt', 'Ancient Egyptians (called harpedonaptae or rope-stretchers) are credited with early surveying to re-establish land boundaries after annual Nile floods washed away markers. They used ropes, plumb bobs, and right-angle triangles.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b01-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-1','quiz','history']),
('A geodetic survey differs from a plane survey primarily because it:', 'multiple_choice', '["Uses more expensive equipment","Accounts for the curvature of the earth","Is performed only by government agencies","Measures only horizontal distances"]'::jsonb, 'Accounts for the curvature of the earth', 'Geodetic surveys account for the curvature of the earth and operate over large areas where the flat-earth assumption of plane surveying introduces unacceptable errors. Plane surveys treat the earth as flat, which is adequate for smaller areas.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b01-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-1','quiz','geodetic','survey-types']),
('A construction survey is also commonly referred to as:', 'multiple_choice', '["A cadastral survey","A layout or stakeout survey","A geodetic survey","A hydrographic survey"]'::jsonb, 'A layout or stakeout survey', 'Construction surveys involve laying out (staking out) planned structures, roads, and utilities in the field so that construction crews know exactly where to build. They are commonly called layout surveys or stakeout surveys.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b01-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-1','quiz','construction','survey-types']),
('GNSS stands for Global Navigation Satellite System.', 'true_false', '["True","False"]'::jsonb, 'True', 'GNSS is the umbrella term for all satellite navigation systems including GPS (US), GLONASS (Russia), Galileo (EU), and BeiDou (China).', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b01-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-1','quiz','gnss']),
('List and describe three different types of surveys discussed in this lesson.', 'short_answer', '[]'::jsonb, 'Boundary, topographic, construction, geodetic, or hydrographic surveys', 'Common types include: boundary/cadastral (property lines), topographic (terrain and features), construction/layout (staking structures), geodetic (large-area with earth curvature), and hydrographic (water boundaries and depths).', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b01-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-1','homework','survey-types']),
('In Texas, what professional license allows a person to practice land surveying independently?', 'short_answer', '[]'::jsonb, 'RPLS (Registered Professional Land Surveyor)', 'In Texas, the RPLS (Registered Professional Land Surveyor) license, issued by TBPELS (Texas Board of Professional Engineers and Land Surveyors), authorizes independent practice of land surveying. The SIT (Surveyor Intern) is the intermediate step.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b01-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-1','homework','licensing','texas']),
('Explain the general steps involved in the "surveying method" from project planning through final deliverables.', 'short_answer', '[]'::jsonb, 'Research, reconnaissance, planning, field measurement, computation/adjustment, mapping/deliverables', 'The surveying method generally includes: (1) research existing records, (2) reconnaissance of the site, (3) plan the survey approach, (4) perform field measurements, (5) compute and adjust observations, (6) prepare maps, plats, or other deliverables.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b01-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-1','homework','surveying-method']),

-- Week 2 Quiz & Homework
('How many significant figures are in the measurement 0.00450?', 'multiple_choice', '["5","4","3","2"]'::jsonb, '3', 'Leading zeros are never significant — they only indicate decimal position. The significant figures are 4, 5, and the trailing 0 (trailing zeros after a decimal point and nonzero digit are significant). So 0.00450 has 3 significant figures.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b02-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-2','quiz','significant-figures']),
('The US Survey foot is defined as exactly:', 'multiple_choice', '["0.3048 meters","1200/3937 meters","0.30480061 meters","12/39.37 meters"]'::jsonb, '1200/3937 meters', 'The US Survey foot = 1200/3937 meters ≈ 0.30480061 m. This differs slightly from the International foot (exactly 0.3048 m). The difference is about 2 ppm, which matters over large distances.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b02-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-2','quiz','units','us-survey-foot']),
('Field notes should be recorded in pencil so that mistakes can be erased and corrected cleanly.', 'true_false', '["True","False"]'::jsonb, 'False', 'Field notes should NEVER be erased. Mistakes should be crossed out with a single line so the original value remains legible, and the correct value written nearby. Erasing destroys the record and is considered unprofessional.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b02-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-2','quiz','field-notes']),
('Convert 45°30''15" to decimal degrees.', 'numeric_input', '[]'::jsonb, '45.5042', 'Decimal degrees = 45 + 30/60 + 15/3600 = 45 + 0.5 + 0.00417 = 45.50417, rounded to 45.5042°.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b02-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-2','quiz','DMS-conversion']),
('When adding angles in DMS format, 47°35''48" + 22°38''25" equals:', 'multiple_choice', '["70°14''13\"","69°74''73\"","70°13''13\"","70°14''73\""]'::jsonb, '70°14''13"', 'Add each column: 48"+25"=73" → 1''13"; 35''+38''+1''=74'' → 1°14''; 47°+22°+1°=70°. Result: 70°14''13".', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b02-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-2','quiz','DMS-arithmetic']),
('Convert 1,250.00 US Survey feet to meters. Show your work.', 'short_answer', '[]'::jsonb, '381.001 meters', '1,250.00 × (1200/3937) = 1,250.00 × 0.30480061 = 381.0008 m ≈ 381.001 m. Using US Survey foot definition.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b02-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-2','homework','unit-conversion']),
('Round 3456.7851 to 4 significant figures and explain your reasoning.', 'short_answer', '[]'::jsonb, '3457', 'The 4th significant digit is 6. The next digit (7) is ≥ 5, so round up: 3456.7851 → 3457 (4 sig figs). When rounding, look at the digit immediately after your last significant figure.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b02-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-2','homework','significant-figures','rounding']),
('What information should be included on the first page of a surveying field book?', 'short_answer', '[]'::jsonb, 'Project name, date, crew members, weather, equipment, location', 'A properly started field book includes: project name/number, date, crew members and their roles, weather conditions, equipment used (with serial numbers), location/description of work area, and a general project sketch or reference.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b02-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-2','homework','field-notes']),

-- Week 3 Quiz & Homework
('Which type of error follows a consistent pattern and can be eliminated by calibration or proper procedures?', 'multiple_choice', '["Random errors","Systematic errors","Blunders","Probable errors"]'::jsonb, 'Systematic errors', 'Systematic errors are consistent in sign and/or magnitude. They can be eliminated through calibration, applying corrections, and proper field procedures. Random errors cannot be eliminated but can be reduced.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b03-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-3','quiz','errors','systematic']),
('Four measurements of a distance are: 200.45, 200.47, 200.43, and 200.46 ft. The most probable value is:', 'numeric_input', '[]'::jsonb, '200.4525', 'MPV = mean = (200.45 + 200.47 + 200.43 + 200.46) / 4 = 801.81 / 4 = 200.4525 ft.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b03-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-3','quiz','statistics','most-probable-value']),
('Two independent errors of ±0.03 ft and ±0.04 ft propagate to a combined error of:', 'numeric_input', '[]'::jsonb, '0.05', 'Error propagation: E = sqrt(0.03² + 0.04²) = sqrt(0.0009 + 0.0016) = sqrt(0.0025) = 0.05 ft. Classic 3-4-5 relationship.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b03-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-3','quiz','error-propagation']),
('A distance of 800.00 ft is measured with an uncertainty of ±0.02 ft. The relative precision is:', 'multiple_choice', '["1:4,000","1:40,000","1:400","1:400,000"]'::jsonb, '1:40,000', 'Relative precision = error/distance = 0.02/800 = 1/40,000 = 1:40,000.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b03-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-3','quiz','precision','relative-precision']),
('Averaging many measurements will eliminate systematic errors.', 'true_false', '["True","False"]'::jsonb, 'False', 'Averaging reduces random errors but does NOT eliminate systematic errors, which affect every measurement consistently. Systematic errors require calibration or correction.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b03-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-3','quiz','errors','averaging']),
('Five measurements of an angle are: 45°12''10", 45°12''14", 45°12''08", 45°12''16", 45°12''12". Calculate the most probable value and the standard deviation.', 'short_answer', '[]'::jsonb, 'MPV = 45°12''12", std dev ≈ 3.2"', 'MPV = mean of seconds: (10+14+8+16+12)/5 = 60/5 = 12". So MPV = 45°12''12". Residuals: -2, +2, -4, +4, 0. Sum v² = 4+4+16+16+0 = 40. σ = sqrt(40/4) = sqrt(10) ≈ 3.16" ≈ 3.2".', 'hard', 'acc00001-0000-0000-0000-000000000001', 'acc01b03-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-3','homework','statistics','standard-deviation']),
('Three independent measurements contribute errors of ±0.02, ±0.03, and ±0.04 ft. What is the total propagated error?', 'numeric_input', '[]'::jsonb, '0.054', 'E = sqrt(0.02² + 0.03² + 0.04²) = sqrt(0.0004 + 0.0009 + 0.0016) = sqrt(0.0029) = 0.0539 ≈ 0.054 ft.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b03-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-3','homework','error-propagation']),
('Explain the difference between precision and accuracy with a surveying example.', 'short_answer', '[]'::jsonb, 'Precision = repeatability; Accuracy = closeness to true value', 'Precision is how closely repeated measurements agree with each other (e.g., five distance measurements all within 0.01 ft). Accuracy is how close measurements are to the true value. A miscalibrated tape could give precise but inaccurate measurements if all readings are consistently offset.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b03-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-3','homework','precision','accuracy']),

-- Week 4 Quiz & Homework
('In differential leveling, the Height of Instrument (HI) is computed as:', 'multiple_choice', '["BM elevation minus backsight","BM elevation plus backsight","BM elevation plus foresight","BM elevation minus foresight"]'::jsonb, 'BM elevation plus backsight', 'HI = Known Elevation + Backsight (BS). The backsight on a known point, added to that point''s elevation, gives the height of the instrument''s line of sight.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b04-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-4','quiz','leveling','HI']),
('A BM has elevation 352.45 ft. BS = 5.67 ft, FS = 3.21 ft. The new point elevation is:', 'numeric_input', '[]'::jsonb, '354.91', 'HI = 352.45 + 5.67 = 358.12 ft. New Elev = 358.12 - 3.21 = 354.91 ft.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b04-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-4','quiz','leveling','computation']),
('The combined curvature and refraction correction formula is C&R = 0.0206F² where F is in:', 'multiple_choice', '["Feet","Miles","Thousands of feet","Meters"]'::jsonb, 'Thousands of feet', 'The formula C&R = 0.0206 × F² uses F in thousands of feet. For example, at 3,000 ft: F = 3.0, C&R = 0.0206 × 9 = 0.185 ft.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b04-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-4','quiz','curvature-refraction']),
('An automatic level maintains a horizontal line of sight using:', 'multiple_choice', '["A spirit bubble vial","A pendulum compensator","Manual adjustment screws","A laser reference"]'::jsonb, 'A pendulum compensator', 'Automatic levels use a pendulum-type compensator that automatically adjusts the line of sight to horizontal after the instrument is approximately leveled. This eliminates the need to precisely center a bubble.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b04-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-4','quiz','level-instruments']),
('In leveling, a foresight reading is subtracted from the HI to determine the elevation of the target point.', 'true_false', '["True","False"]'::jsonb, 'True', 'Elevation = HI - FS. The foresight reading on the rod, subtracted from the Height of Instrument, gives the elevation of the point where the rod is held.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b04-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-4','quiz','leveling','foresight']),
('Given: BM1 elev = 500.00 ft. From Setup 1: BS on BM1 = 8.35, FS on TP1 = 4.12. From Setup 2: BS on TP1 = 6.78, FS on TP2 = 2.95. What is the elevation of TP2?', 'numeric_input', '[]'::jsonb, '508.06', 'Setup 1: HI = 500.00 + 8.35 = 508.35. TP1 elev = 508.35 - 4.12 = 504.23. Setup 2: HI = 504.23 + 6.78 = 511.01. TP2 elev = 511.01 - 2.95 = 508.06 ft.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b04-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-4','homework','leveling','computation']),
('What is the combined curvature and refraction correction for a sight distance of 5,000 ft?', 'numeric_input', '[]'::jsonb, '0.515', 'C&R = 0.0206 × F² = 0.0206 × (5.0)² = 0.0206 × 25 = 0.515 ft.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b04-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-4','homework','curvature-refraction']),
('Explain why keeping backsight and foresight distances equal at each setup eliminates collimation error.', 'short_answer', '[]'::jsonb, 'Equal distances cause equal collimation errors in BS and FS that cancel when computing elevation difference', 'If the line of sight is tilted (collimation error), each reading has an error proportional to sight distance. When BS and FS distances are equal, both readings are affected by the same amount. Since we compute elevation difference as BS - FS, the equal errors cancel out.', 'hard', 'acc00001-0000-0000-0000-000000000001', 'acc01b04-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-4','homework','collimation','leveling']),

-- Week 5 Quiz & Homework
('For a level circuit of 6 miles with k = 0.035 ft/√mi, the allowable misclosure is:', 'numeric_input', '[]'::jsonb, '0.086', 'Allowable = k × √(miles) = 0.035 × √6 = 0.035 × 2.449 = 0.0857 ≈ 0.086 ft.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b05-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-5','quiz','leveling-closure']),
('The two-peg test is used to check for:', 'multiple_choice', '["Curvature and refraction","Collimation error in the level","Rod calibration errors","Temperature effects"]'::jsonb, 'Collimation error in the level', 'The two-peg test determines if the level''s line of sight is truly horizontal by comparing readings from the midpoint (errors cancel) to readings from one end (errors don''t cancel).', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b05-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-5','quiz','two-peg-test']),
('Reciprocal leveling is used primarily when:', 'multiple_choice', '["Speed is needed","Leveling across a wide obstacle like a river","The rod is too short","No benchmark is available"]'::jsonb, 'Leveling across a wide obstacle like a river', 'Reciprocal leveling is used when you cannot place the level midway between two points (e.g., across a river). Readings from both sides are averaged to cancel curvature, refraction, and collimation errors.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b05-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-5','quiz','reciprocal-leveling']),
('Profile leveling is used to determine elevations along a:', 'multiple_choice', '["Property boundary","Route centerline","Building foundation","Geodetic control network"]'::jsonb, 'Route centerline', 'Profile leveling determines ground elevations at intervals along a route (road, pipeline, channel). Results are plotted as a profile graph showing the ground surface along the alignment.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b05-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-5','quiz','profile-leveling']),
('Turning points in differential leveling must be stable and well-defined.', 'true_false', '["True","False"]'::jsonb, 'True', 'Turning points serve as temporary benchmarks. They must be stable (won''t settle or move between readings) and well-defined so the rod is placed in exactly the same spot for both the foresight and the subsequent backsight.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b05-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-5','quiz','turning-points']),
('A level loop starts at BM (elev 100.000) and returns. The computed return elevation is 100.024 ft over 3 miles. Is this acceptable for second-order leveling (k=0.035)?', 'short_answer', '[]'::jsonb, 'Yes, 0.024 ft < allowable 0.061 ft', 'Misclosure = |100.024 - 100.000| = 0.024 ft. Allowable = 0.035 × √3 = 0.035 × 1.732 = 0.061 ft. Since 0.024 < 0.061, the closure is acceptable.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b05-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-5','homework','leveling-closure']),
('In a closed level circuit, the sum of all backsights minus the sum of all foresights should equal:', 'multiple_choice', '["The total distance","Zero","The benchmark elevation","The misclosure"]'::jsonb, 'Zero', 'For a closed level loop returning to the starting BM, the net elevation change is zero, so ΣBS - ΣFS = 0 (theoretically). Any nonzero value is the misclosure.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b05-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-5','homework','leveling','closure-check']),
('Describe the procedure for distributing leveling misclosure proportionally based on distance.', 'short_answer', '[]'::jsonb, 'Correction at each point = -(misclosure × cumulative distance / total distance)', 'The correction at each intermediate point equals: correction = -(misclosure × cumulative distance to that point / total circuit distance). Points farther from the start receive larger corrections. This assumes errors accumulate uniformly with distance.', 'hard', 'acc00001-0000-0000-0000-000000000001', 'acc01b05-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-5','homework','adjustment','leveling']),

-- Week 6 Quiz & Homework
('A steel tape was standardized at 68°F. If used at 95°F to measure 300.00 ft, what is the temperature correction? (Coefficient of expansion = 0.00000645 per °F)', 'numeric_input', '[]'::jsonb, '0.052', 'Ct = 0.00000645 × (95 - 68) × 300 = 0.00000645 × 27 × 300 = 0.0522 ft ≈ 0.052 ft. Tape expanded, so measured distance is too short — add correction.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b06-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-6','quiz','tape-correction','temperature']),
('EDM instruments measure distance by:', 'multiple_choice', '["Counting the number of tape lengths","Timing the travel of electromagnetic waves","Using GPS satellites","Measuring air pressure changes"]'::jsonb, 'Timing the travel of electromagnetic waves', 'EDM instruments emit electromagnetic waves (infrared or laser) and measure the time for the signal to travel to a reflector and back. The distance is computed from the speed of light and the phase shift or travel time.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b06-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-6','quiz','EDM']),
('A slope distance of 500.00 ft measured at a vertical angle of 5°00'' has a horizontal distance of:', 'numeric_input', '[]'::jsonb, '498.10', 'HD = SD × cos(vertical angle) = 500.00 × cos(5°) = 500.00 × 0.99619 = 498.10 ft.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b06-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-6','quiz','slope-distance','horizontal-distance']),
('Stadia is a method of distance measurement that uses:', 'multiple_choice', '["A steel tape only","GPS signals","The stadia hairs in a telescope and a graduated rod","A measuring wheel"]'::jsonb, 'The stadia hairs in a telescope and a graduated rod', 'Stadia uses the upper and lower stadia hairs in the telescope. The rod intercept (difference between upper and lower readings) multiplied by the stadia constant (usually 100) gives the distance. Accuracy is typically 1:300 to 1:500.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b06-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-6','quiz','stadia']),
('A tape correction for sag always makes the measured distance shorter than the true distance.', 'true_false', '["True","False"]'::jsonb, 'True', 'When a tape sags between supports, the catenary curve is longer than the straight-line distance. Therefore the tape reading is too long, and the sag correction is always negative (subtracted from the measured distance).', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b06-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-6','quiz','sag-correction']),
('A 100-ft tape is standardized at 68°F and 12 lbs tension. In the field, temperature is 40°F and tension is 20 lbs. Cross-section area = 0.003 sq in, E = 29,000,000 psi, coefficient = 0.00000645/°F. Compute the total correction per tape length.', 'short_answer', '[]'::jsonb, 'Temp correction = -0.018 ft, Tension correction = +0.009 ft, Total ≈ -0.009 ft', 'Ct = 0.00000645 × (40-68) × 100 = -0.0181 ft. Cp = (20-12) × 100 / (0.003 × 29,000,000) = 800/87,000 = +0.0092 ft. Total = -0.0181 + 0.0092 = -0.009 ft.', 'hard', 'acc00001-0000-0000-0000-000000000001', 'acc01b06-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-6','homework','tape-corrections']),
('Convert a slope distance of 750.00 ft measured at a zenith angle of 86°30'' to horizontal distance.', 'numeric_input', '[]'::jsonb, '748.60', 'Vertical angle = 90° - 86°30'' = 3°30''. HD = 750.00 × cos(3.5°) = 750.00 × 0.99813 = 748.60 ft. Or equivalently: HD = 750 × sin(86°30'') = 748.60 ft.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b06-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-6','homework','slope-to-horizontal']),
('Compare the accuracy of taping, EDM, and stadia methods for measuring distances.', 'short_answer', '[]'::jsonb, 'Stadia: 1:300–1:500; Taping: 1:3,000–1:10,000; EDM: 1:10,000–1:100,000+', 'Stadia is least precise (1:300 to 1:500), suitable for topography. Taping with corrections achieves 1:3,000 to 1:10,000. EDM is most precise at 1:10,000 to 1:100,000 or better, and is the standard for modern surveys.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b06-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-6','homework','distance-methods-comparison']),

-- Week 7 Quiz & Homework
('An azimuth of 225° corresponds to a bearing of:', 'multiple_choice', '["N 45° E","S 45° W","S 45° E","N 45° W"]'::jsonb, 'S 45° W', 'Azimuths 180°-270° are in the SW quadrant. Bearing = S (azimuth - 180°) W = S (225-180)° W = S 45° W.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b07-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-7','quiz','azimuth-to-bearing']),
('A bearing of N 60°30'' E corresponds to an azimuth of:', 'numeric_input', '[]'::jsonb, '60.5', 'N 60°30'' E is in the NE quadrant. Azimuth = bearing angle = 60°30'' = 60.5°.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b07-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-7','quiz','bearing-to-azimuth']),
('Magnetic declination is the angular difference between:', 'multiple_choice', '["True north and grid north","True north and magnetic north","Grid north and magnetic north","Map north and geodetic north"]'::jsonb, 'True north and magnetic north', 'Magnetic declination (or variation) is the angle between true (geographic) north and magnetic north at a given location. It varies with location and changes over time.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b07-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-7','quiz','declination']),
('Subtract: 180°00''00" - 45°38''25" = ?', 'multiple_choice', '["134°21''35\"","135°38''25\"","134°22''35\"","135°21''35\""]'::jsonb, '134°21''35"', '180°00''00" - 45°38''25": Borrow: 179°59''60" - 45°38''25" = 134°21''35".', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b07-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-7','quiz','DMS-arithmetic']),
('A deflection angle is measured from the extension of the back line.', 'true_false', '["True","False"]'::jsonb, 'True', 'A deflection angle is measured from the prolongation (extension) of the preceding line to the next line. It is designated as right (R) or left (L) and cannot exceed 180°.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b07-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-7','quiz','deflection-angles']),
('Convert the following bearings to azimuths: (a) N 35°20'' E, (b) S 72°45'' E, (c) S 15°10'' W, (d) N 80°00'' W.', 'short_answer', '[]'::jsonb, '(a) 35°20'', (b) 107°15'', (c) 195°10'', (d) 280°00''', '(a) NE quadrant: Az = 35°20''. (b) SE: Az = 180° - 72°45'' = 107°15''. (c) SW: Az = 180° + 15°10'' = 195°10''. (d) NW: Az = 360° - 80°00'' = 280°00''.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b07-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-7','homework','bearing-azimuth-conversion']),
('At a location the magnetic declination is 8°30'' East. A compass bearing reads N 45°30'' E. What is the true bearing?', 'short_answer', '[]'::jsonb, 'N 54°00'' E', 'With east declination, magnetic north is east of true north. True bearing = magnetic bearing + declination (for NE bearings) = 45°30'' + 8°30'' = N 54°00'' E.', 'hard', 'acc00001-0000-0000-0000-000000000001', 'acc01b07-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-7','homework','declination','correction']),
('A five-sided closed traverse has interior angles measured as: 98°15'', 110°30'', 122°45'', 88°10'', and 120°25''. What is the angular misclosure?', 'short_answer', '[]'::jsonb, '5'' misclosure', 'Sum of interior angles for 5-sided polygon = (5-2) × 180° = 540°00''00". Measured sum = 98°15'' + 110°30'' + 122°45'' + 88°10'' + 120°25'' = 540°05''. Misclosure = 540°05'' - 540°00'' = +5''.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b07-0000-0000-0000-000000000001', 'ACC-1301', ARRAY['acc-srvy-1301','week-7','homework','angular-closure','traverse']);

-- Weeks 9-15 quiz and homework questions will be populated as the course progresses.
-- The structure is established and ready for content to be added lesson by lesson.

-- SRVY 1301 Midterm Exam (15 questions covering Weeks 1-7)
INSERT INTO question_bank (question_text, question_type, options, correct_answer, explanation, difficulty, module_id, lesson_id, exam_category, tags) VALUES
('Which of the following is NOT a type of survey?', 'multiple_choice', '["Boundary survey","Topographic survey","Arithmetic survey","Construction survey"]'::jsonb, 'Arithmetic survey', 'Arithmetic survey is not a recognized survey type. Common types include boundary, topographic, construction, geodetic, hydrographic, route, and ALTA/NSPS surveys.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b08-0000-0000-0000-000000000001', 'ACC-1301-MIDTERM', ARRAY['acc-srvy-1301','midterm','survey-types']),
('The most probable value of a set of equally weighted measurements is the:', 'multiple_choice', '["Median","Mode","Arithmetic mean","Largest value"]'::jsonb, 'Arithmetic mean', 'For equally weighted measurements with only random errors, the arithmetic mean is the most probable value (MPV). It minimizes the sum of squared residuals.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b08-0000-0000-0000-000000000001', 'ACC-1301-MIDTERM', ARRAY['acc-srvy-1301','midterm','statistics']),
('BM elevation = 245.67 ft, BS = 7.89 ft, FS = 5.12 ft. Point elevation = ?', 'numeric_input', '[]'::jsonb, '248.44', 'HI = 245.67 + 7.89 = 253.56. Elev = 253.56 - 5.12 = 248.44 ft.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b08-0000-0000-0000-000000000001', 'ACC-1301-MIDTERM', ARRAY['acc-srvy-1301','midterm','leveling']),
('A slope distance of 400.00 ft at zenith angle 88° has a horizontal distance of:', 'numeric_input', '[]'::jsonb, '399.76', 'Vert angle = 90° - 88° = 2°. HD = 400 × cos(2°) = 400 × 0.99939 = 399.76 ft.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b08-0000-0000-0000-000000000001', 'ACC-1301-MIDTERM', ARRAY['acc-srvy-1301','midterm','distance']),
('An azimuth of 315°00'' corresponds to bearing:', 'multiple_choice', '["N 45° E","N 45° W","S 45° E","S 45° W"]'::jsonb, 'N 45° W', 'Azimuths 270°-360° are in the NW quadrant. Bearing = N (360° - 315°) W = N 45° W.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b08-0000-0000-0000-000000000001', 'ACC-1301-MIDTERM', ARRAY['acc-srvy-1301','midterm','bearings-azimuths']),
('Systematic errors in surveying can be detected by averaging multiple measurements.', 'true_false', '["True","False"]'::jsonb, 'False', 'Averaging reduces random errors but does NOT detect or eliminate systematic errors. Systematic errors must be found through calibration, different measurement methods, or applying known corrections.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b08-0000-0000-0000-000000000001', 'ACC-1301-MIDTERM', ARRAY['acc-srvy-1301','midterm','errors']),
('How many significant figures are in 10,500?', 'multiple_choice', '["3","4","5","Ambiguous without more context"]'::jsonb, 'Ambiguous without more context', 'The number 10,500 is ambiguous: it could have 3, 4, or 5 significant figures depending on whether the trailing zeros are significant. Using scientific notation resolves this: 1.05 × 10⁴ (3 sig figs) vs 1.050 × 10⁴ (4 sig figs).', 'hard', 'acc00001-0000-0000-0000-000000000001', 'acc01b08-0000-0000-0000-000000000001', 'ACC-1301-MIDTERM', ARRAY['acc-srvy-1301','midterm','significant-figures']),
('What is the tape temperature correction for measuring 250.00 ft at 32°F if the tape is standardized at 68°F? (coeff = 0.00000645/°F)', 'numeric_input', '[]'::jsonb, '-0.058', 'Ct = 0.00000645 × (32-68) × 250 = 0.00000645 × (-36) × 250 = -0.0581 ≈ -0.058 ft. Negative because tape contracted in cold.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b08-0000-0000-0000-000000000001', 'ACC-1301-MIDTERM', ARRAY['acc-srvy-1301','midterm','tape-correction']),
('The formula for relative precision is:', 'multiple_choice', '["Error × distance","Error / distance","Distance / error","Error + distance"]'::jsonb, 'Error / distance', 'Relative precision = linear error of closure / total distance. Often expressed as a ratio like 1:10,000.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b08-0000-0000-0000-000000000001', 'ACC-1301-MIDTERM', ARRAY['acc-srvy-1301','midterm','precision']),
('The International foot equals exactly 0.3048 meters.', 'true_false', '["True","False"]'::jsonb, 'True', 'The International foot is defined as exactly 0.3048 meters (25.4 mm per inch). This differs slightly from the US Survey foot (1200/3937 m).', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b08-0000-0000-0000-000000000001', 'ACC-1301-MIDTERM', ARRAY['acc-srvy-1301','midterm','units']),
('C&R correction at 2,500 ft is:', 'numeric_input', '[]'::jsonb, '0.129', 'C&R = 0.0206 × (2.5)² = 0.0206 × 6.25 = 0.12875 ≈ 0.129 ft.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b08-0000-0000-0000-000000000001', 'ACC-1301-MIDTERM', ARRAY['acc-srvy-1301','midterm','curvature-refraction']),
('A four-sided closed traverse should have interior angles summing to:', 'multiple_choice', '["180°","360°","540°","720°"]'::jsonb, '360°', 'Sum of interior angles = (n-2) × 180° = (4-2) × 180° = 360°.', 'easy', 'acc00001-0000-0000-0000-000000000001', 'acc01b08-0000-0000-0000-000000000001', 'ACC-1301-MIDTERM', ARRAY['acc-srvy-1301','midterm','traverse','angles']),
('Three propagated errors of ±0.01, ±0.02, and ±0.03 ft combine to:', 'numeric_input', '[]'::jsonb, '0.037', 'E = sqrt(0.01² + 0.02² + 0.03²) = sqrt(0.0001+0.0004+0.0009) = sqrt(0.0014) = 0.0374 ≈ 0.037 ft.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b08-0000-0000-0000-000000000001', 'ACC-1301-MIDTERM', ARRAY['acc-srvy-1301','midterm','error-propagation']),
('Convert S 28°45'' W to an azimuth.', 'numeric_input', '[]'::jsonb, '208.75', 'SW quadrant: Az = 180° + 28°45'' = 208°45'' = 208.75°.', 'medium', 'acc00001-0000-0000-0000-000000000001', 'acc01b08-0000-0000-0000-000000000001', 'ACC-1301-MIDTERM', ARRAY['acc-srvy-1301','midterm','bearing-to-azimuth']),
('What leveling order uses k = 0.050 ft/√mi for allowable closure?', 'multiple_choice', '["First order","Second order","Third order","Fourth order"]'::jsonb, 'Third order', 'k values: first-order ≈ 0.017, second-order ≈ 0.035, third-order ≈ 0.050. Third-order leveling allows 0.050 × √(miles).', 'hard', 'acc00001-0000-0000-0000-000000000001', 'acc01b08-0000-0000-0000-000000000001', 'ACC-1301-MIDTERM', ARRAY['acc-srvy-1301','midterm','leveling-standards']);


-- ============================================================================
-- SECTION 6: QUESTION BANK — SRVY 1341 (Select questions for weeks 2-7)
-- ============================================================================

DELETE FROM question_bank WHERE tags @> ARRAY['acc-srvy-1341'];

-- Week 2 Quiz
INSERT INTO question_bank (question_text, question_type, options, correct_answer, explanation, difficulty, module_id, lesson_id, exam_category, tags) VALUES
('Which type of traverse starts and ends at different known points?', 'multiple_choice', '["Closed loop traverse","Open traverse","Closed connecting traverse","Radial traverse"]'::jsonb, 'Closed connecting traverse', 'A closed connecting traverse starts at one known control point and ends at a different known control point, providing checks on both angular and linear closure.', 'easy', 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001', 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','traverse-types']),
('An open traverse provides no mathematical check on the accuracy of the work.', 'true_false', '["True","False"]'::jsonb, 'True', 'An open traverse does not return to a known point, so there is no way to compute closure and check accuracy. Open traverses should be avoided whenever possible.', 'easy', 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001', 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','open-traverse']),
('The sum of interior angles for an n-sided closed traverse is:', 'multiple_choice', '["n × 180°","(n-1) × 180°","(n-2) × 180°","(n+2) × 180°"]'::jsonb, '(n-2) × 180°', 'Sum of interior angles = (n-2) × 180°. For a 4-sided traverse: (4-2) × 180° = 360°. For 5 sides: 540°. For 6 sides: 720°.', 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001', 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','interior-angles']),
('When planning traverse stations, intervisibility between adjacent stations is:', 'multiple_choice', '["Optional","Required","Only needed for GPS traverses","Only needed at the first station"]'::jsonb, 'Required', 'Adjacent traverse stations must be intervisible so that angle and distance measurements can be made between them. Station locations should be selected to ensure clear lines of sight.', 'easy', 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001', 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','traverse-planning']),
('A traverse with 6 sides should have interior angles summing to:', 'numeric_input', '[]'::jsonb, '720', '(6-2) × 180° = 4 × 180° = 720°.', 'easy', 'acc00003-0000-0000-0000-000000000003', 'acc03b02-0000-0000-0000-000000000001', 'ACC-1341', ARRAY['acc-srvy-1341','week-2','quiz','interior-angles']),

-- Week 4 Quiz (Latitudes and Departures)
('Latitude is computed as distance times:', 'multiple_choice', '["sin(azimuth)","cos(azimuth)","tan(azimuth)","1/cos(azimuth)"]'::jsonb, 'cos(azimuth)', 'Latitude = Distance × cos(azimuth). Latitude is the N-S component. Departure = Distance × sin(azimuth) is the E-W component.', 'easy', 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001', 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','latitudes']),
('Departure is computed as distance times:', 'multiple_choice', '["cos(azimuth)","sin(azimuth)","tan(azimuth)","sec(azimuth)"]'::jsonb, 'sin(azimuth)', 'Departure = Distance × sin(azimuth). Departure is the E-W component of a traverse line. Positive departures go east, negative go west.', 'easy', 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001', 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','departures']),
('A traverse line has azimuth 135°00'' and distance 200.00 ft. Its latitude is:', 'numeric_input', '[]'::jsonb, '-141.42', 'Lat = 200 × cos(135°) = 200 × (-0.7071) = -141.42 ft. Negative because azimuth is in the SE quadrant (southward component).', 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001', 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','latitude-computation']),
('The same line (Az 135°, dist 200.00 ft) has a departure of:', 'numeric_input', '[]'::jsonb, '141.42', 'Dep = 200 × sin(135°) = 200 × 0.7071 = +141.42 ft. Positive because the line goes east.', 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001', 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','departure-computation']),
('In a perfectly closed traverse, the sum of all latitudes should equal zero.', 'true_false', '["True","False"]'::jsonb, 'True', 'For a closed traverse returning to the starting point, the net N-S displacement is zero, so ΣLatitudes = 0. Similarly ΣDepartures = 0. Any nonzero sums represent the misclosure.', 'easy', 'acc00003-0000-0000-0000-000000000003', 'acc03b04-0000-0000-0000-000000000001', 'ACC-1341', ARRAY['acc-srvy-1341','week-4','quiz','closure']),

-- Week 5 Quiz (Error of Closure)
('The linear error of closure for a traverse is computed as:', 'multiple_choice', '["Sum of latitudes + sum of departures","sqrt(sum_lat² + sum_dep²)","Sum of all distances","Sum of latitudes × sum of departures"]'::jsonb, 'sqrt(sum_lat² + sum_dep²)', 'Linear error of closure = sqrt(ΣLat² + ΣDep²). This is the straight-line distance between the computed ending position and the known ending position.', 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001', 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','error-of-closure']),
('A traverse has ΣLat = +0.03, ΣDep = -0.04, perimeter = 2,500 ft. Relative precision is:', 'multiple_choice', '["1:5,000","1:50,000","1:25,000","1:500"]'::jsonb, '1:50,000', 'Error = sqrt(0.03² + 0.04²) = sqrt(0.0025) = 0.05 ft. Rel precision = 0.05/2500 = 1/50,000.', 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b05-0000-0000-0000-000000000001', 'ACC-1341', ARRAY['acc-srvy-1341','week-5','quiz','relative-precision']),

-- Week 6 Quiz (Compass Rule)
('In the compass rule adjustment, corrections are proportional to:', 'multiple_choice', '["The angle at each station","The length of each leg","The latitude of each leg","The number of stations"]'::jsonb, 'The length of each leg', 'The compass rule (Bowditch method) distributes corrections proportional to the leg distance: correction_lat = -(ΣLat × leg_distance / perimeter).', 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001', 'ACC-1341', ARRAY['acc-srvy-1341','week-6','quiz','compass-rule']),
('After compass rule adjustment, the sum of adjusted latitudes should equal:', 'multiple_choice', '["The misclosure","Zero","The total distance","The original sum"]'::jsonb, 'Zero', 'After adjustment, ΣAdjusted Latitudes = 0 and ΣAdjusted Departures = 0. This is the mathematical verification that the adjustment was performed correctly.', 'easy', 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001', 'ACC-1341', ARRAY['acc-srvy-1341','week-6','quiz','adjustment-verification']),
('The compass rule latitude correction formula is: correction = -(misclosure_lat × leg_dist / perimeter).', 'true_false', '["True","False"]'::jsonb, 'True', 'The compass rule (Bowditch) formula for latitude correction is: C_lat = -(ΣLat × D_leg / D_total). Each leg gets a correction proportional to its length relative to the total perimeter.', 'medium', 'acc00003-0000-0000-0000-000000000003', 'acc03b06-0000-0000-0000-000000000001', 'ACC-1341', ARRAY['acc-srvy-1341','week-6','quiz','compass-rule-formula']);


-- ============================================================================
-- SECTION 7: QUESTION BANK — SRVY 1335 (Select lab questions)
-- ============================================================================

DELETE FROM question_bank WHERE tags @> ARRAY['acc-srvy-1335'];

INSERT INTO question_bank (question_text, question_type, options, correct_answer, explanation, difficulty, module_id, lesson_id, exam_category, tags) VALUES
-- Week 1
('What is the first thing you should do when arriving at a survey field site?', 'multiple_choice', '["Set up the total station","Check for safety hazards","Start measuring distances","Open the field book"]'::jsonb, 'Check for safety hazards', 'Safety is always the first priority. Before setting up any equipment, survey the site for hazards: traffic, overhead power lines, unstable ground, wildlife, weather conditions, etc.', 'easy', 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001', 'ACC-1335', ARRAY['acc-srvy-1335','week-1','quiz','safety']),
('A tribrach is used to:', 'multiple_choice', '["Measure distances","Level and center an instrument over a point","Record field notes","Calculate areas"]'::jsonb, 'Level and center an instrument over a point', 'A tribrach attaches to the tripod head and allows precise leveling (using screws and a bubble) and centering (using an optical plummet) of the instrument over a survey point.', 'easy', 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001', 'ACC-1335', ARRAY['acc-srvy-1335','week-1','quiz','equipment','tribrach']),
('Forced centering allows instrument and target interchange without re-centering over the point.', 'true_false', '["True","False"]'::jsonb, 'True', 'Forced centering uses a standardized tribrach so instruments and targets can be swapped without disturbing the centering. This saves time and reduces centering errors.', 'easy', 'acc00002-0000-0000-0000-000000000002', 'acc02b01-0000-0000-0000-000000000001', 'ACC-1335', ARRAY['acc-srvy-1335','week-1','quiz','forced-centering']),

-- Week 3
('The optical plummet on a total station is used to:', 'multiple_choice', '["Measure distances","Center the instrument precisely over a point","Level the instrument","Read the horizontal circle"]'::jsonb, 'Center the instrument precisely over a point', 'The optical plummet provides a line of sight straight down through the instrument, allowing precise centering over a ground point. Laser plummets serve the same purpose using a laser beam.', 'easy', 'acc00002-0000-0000-0000-000000000002', 'acc02b03-0000-0000-0000-000000000001', 'ACC-1335', ARRAY['acc-srvy-1335','week-3','quiz','optical-plummet']),
('When setting up a total station, the correct order is:', 'multiple_choice', '["Level, center, measure","Center roughly, level, fine-center, re-level","Measure, then set up","Turn on, backsight, measure"]'::jsonb, 'Center roughly, level, fine-center, re-level', 'Setup procedure: (1) set tripod roughly over point, (2) roughly center using plumb bob or optical plummet, (3) level using leveling screws, (4) fine-center using optical plummet, (5) re-check level. Iterate until both centered and level.', 'medium', 'acc00002-0000-0000-0000-000000000002', 'acc02b03-0000-0000-0000-000000000001', 'ACC-1335', ARRAY['acc-srvy-1335','week-3','quiz','setup-procedure']),

-- Week 5
('When measuring angles by repetition (4D), the final angle is found by dividing the accumulated angle by:', 'multiple_choice', '["2","4","8","The number of setups"]'::jsonb, '4', 'In 4D (four direct) repetitions, the angle is accumulated 4 times. The final mean angle = accumulated reading / 4. This improves accuracy by averaging random errors.', 'medium', 'acc00002-0000-0000-0000-000000000002', 'acc02b05-0000-0000-0000-000000000001', 'ACC-1335', ARRAY['acc-srvy-1335','week-5','quiz','repetition-method']),

-- Week 10
('After completing a closed traverse in the field, you should compute the angular closure before leaving the site.', 'true_false', '["True","False"]'::jsonb, 'True', 'Computing angular closure on-site allows you to detect blunders and remeasure angles if the closure is unacceptable. Leaving the site without checking closure risks having to return for remeasurement.', 'easy', 'acc00002-0000-0000-0000-000000000002', 'acc02b10-0000-0000-0000-000000000001', 'ACC-1335', ARRAY['acc-srvy-1335','week-10','quiz','field-closure-check']),

-- Week 12
('In differential leveling, what reading establishes the Height of Instrument?', 'multiple_choice', '["Foresight on a turning point","Backsight on a known elevation","Intermediate foresight","Stadia reading"]'::jsonb, 'Backsight on a known elevation', 'HI = Known Elevation + Backsight. The backsight on a point of known elevation establishes the height of the instrument''s line of sight above the datum.', 'easy', 'acc00002-0000-0000-0000-000000000002', 'acc02b12-0000-0000-0000-000000000001', 'ACC-1335', ARRAY['acc-srvy-1335','week-12','quiz','differential-leveling']);


-- ============================================================================
-- SECTION 8: XP CONFIGURATION FOR ACC MODULES
-- ============================================================================

INSERT INTO learning_modules (id, title, description, difficulty, estimated_hours, order_index, status, tags, xp_reward, created_at, updated_at)
VALUES
  ('acc00001-0000-0000-0000-000000000001', 'ACC SRVY 1301 — Introduction to Surveying', '', 'beginner', 48.0, 29, 'published', ARRAY['acc'], 500, now(), now()),
  ('acc00002-0000-0000-0000-000000000002', 'ACC SRVY 1335 — Land Surveying Applications (Lab)', '', 'intermediate', 48.0, 30, 'published', ARRAY['acc'], 500, now(), now()),
  ('acc00003-0000-0000-0000-000000000003', 'ACC SRVY 1341 — Land Surveying', '', 'intermediate', 48.0, 31, 'published', ARRAY['acc'], 500, now(), now())
ON CONFLICT (id) DO UPDATE SET
  xp_reward = EXCLUDED.xp_reward,
  updated_at = now();


COMMIT;
