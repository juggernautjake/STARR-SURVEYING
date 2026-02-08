-- ============================================================================
-- STARR Surveying — Consolidated Curriculum Seed Data
-- ============================================================================
-- Run AFTER supabase_schema.sql to populate all educational content.
-- This file is SAFE TO RE-RUN (uses upserts and delete-then-insert patterns).
--
-- Contents:
--   1. 28 Learning Modules (Texas Land Surveying curriculum)
--   2. 160+ Learning Lessons (across all 28 modules)
--   3. Curriculum Milestones
--   4. Per-Module XP Configuration
--   5. Flashcards (company/built-in cards linked to modules)
--   6. Knowledge Base Articles (with module links)
--   7. Welcome Lesson + Topics
--
-- Run order:
--   1. supabase_schema.sql          (tables, indexes, RLS, system seed data)
--   2. supabase_seed_curriculum.sql  (THIS FILE — modules, lessons, flashcards, articles)
--   3. supabase_seed_fs_prep.sql    (FS exam prep modules + 270 questions)
-- ============================================================================

BEGIN;


-- ============================================================================
-- SECTION 1: LEARNING MODULES (28 modules)
-- ============================================================================


-- ---- Part I – Foundations of Land Surveying --------------------------------

INSERT INTO learning_modules (id, title, description, difficulty, estimated_hours, order_index, status, tags, created_at, updated_at)
VALUES
  ('c1000001-0000-0000-0000-000000000001',
   'Introduction to Land Surveying',
   'History, purpose, and scope of the land surveying profession in the United States and Texas.',
   'beginner', 3.0, 1, 'published',
   ARRAY['foundations','history','profession'],
   now(), now()),

  ('c1000002-0000-0000-0000-000000000002',
   'Mathematics for Surveyors',
   'Essential math skills including trigonometry, coordinate geometry, and unit conversions used daily in surveying.',
   'beginner', 4.0, 2, 'published',
   ARRAY['foundations','math','trigonometry'],
   now(), now()),

  ('c1000003-0000-0000-0000-000000000003',
   'Surveying Measurements & Error Theory',
   'Principles of measurement, types of errors, precision vs. accuracy, and how to minimize error in field observations.',
   'beginner', 3.5, 3, 'published',
   ARRAY['foundations','measurements','errors'],
   now(), now()),

-- ---- Part II – Field Surveying Techniques ----------------------------------

  ('c1000004-0000-0000-0000-000000000004',
   'Distance Measurement',
   'Methods of measuring distances including taping, EDM, and modern total station techniques with corrections.',
   'beginner', 3.0, 4, 'published',
   ARRAY['field-techniques','distance','measurement'],
   now(), now()),

  ('c1000005-0000-0000-0000-000000000005',
   'Angle and Direction Measurement',
   'Measuring horizontal and vertical angles, understanding bearings, azimuths, and compass work.',
   'intermediate', 3.5, 5, 'published',
   ARRAY['field-techniques','angles','directions','bearings'],
   now(), now()),

  ('c1000006-0000-0000-0000-000000000006',
   'Leveling and Vertical Control',
   'Differential leveling, trigonometric leveling, profile leveling, and establishing vertical control.',
   'intermediate', 3.5, 6, 'published',
   ARRAY['field-techniques','leveling','elevation'],
   now(), now()),

-- ---- Part III – Coordinate Systems & Computations --------------------------

  ('c1000007-0000-0000-0000-000000000007',
   'Coordinate Systems and Datums',
   'Geographic and plane coordinate systems, map projections, and geodetic vs. local datums.',
   'intermediate', 4.0, 7, 'published',
   ARRAY['coordinates','datums','projections','geodesy'],
   now(), now()),

  ('c1000008-0000-0000-0000-000000000008',
   'Traverse Computations',
   'Open and closed traverse computations, closure calculations, and traverse adjustment methods.',
   'intermediate', 4.0, 8, 'published',
   ARRAY['coordinates','traverse','closure','adjustment'],
   now(), now()),

  ('c1000009-0000-0000-0000-000000000009',
   'Area and Volume Computations',
   'Methods for computing areas of parcels and volumes for earthwork using coordinate and cross-section methods.',
   'intermediate', 3.0, 9, 'published',
   ARRAY['coordinates','area','volume','calculations'],
   now(), now()),

-- ---- Part IV – Modern Survey Technology ------------------------------------

  ('c100000a-0000-0000-0000-00000000000a',
   'Total Stations and Electronic Surveying',
   'Operation and application of total stations, data collectors, and field-to-office workflows.',
   'intermediate', 3.5, 10, 'published',
   ARRAY['technology','total-station','electronic'],
   now(), now()),

  ('c100000b-0000-0000-0000-00000000000b',
   'GPS/GNSS Surveying',
   'Principles and methods of Global Navigation Satellite System surveying, RTK, and post-processing.',
   'advanced', 4.5, 11, 'published',
   ARRAY['technology','gps','gnss','satellite'],
   now(), now()),

  ('c100000c-0000-0000-0000-00000000000c',
   'Robotic, Scanning, and UAS Technology',
   'Emerging technologies: robotic total stations, 3D laser scanning, and unmanned aerial systems in surveying.',
   'advanced', 3.0, 12, 'published',
   ARRAY['technology','lidar','uas','scanning','drones'],
   now(), now()),

-- ---- Part V – Boundary & Legal Surveying -----------------------------------

  ('c100000d-0000-0000-0000-00000000000d',
   'Boundary Law Principles',
   'Legal principles of boundary determination including riparian rights, adverse possession, and rules of construction.',
   'intermediate', 4.0, 13, 'published',
   ARRAY['boundary','legal','law','property'],
   now(), now()),

  ('c100000e-0000-0000-0000-00000000000e',
   'Metes and Bounds Descriptions',
   'Writing and interpreting metes and bounds legal descriptions, understanding calls, and resolving conflicts.',
   'intermediate', 3.5, 14, 'published',
   ARRAY['boundary','metes-bounds','descriptions','legal'],
   now(), now()),

  ('c100000f-0000-0000-0000-00000000000f',
   'Texas Land Titles and Records',
   'Texas land title history from Spanish grants through present, abstract of title, and county records research.',
   'intermediate', 4.0, 15, 'published',
   ARRAY['boundary','texas','titles','records','history'],
   now(), now()),

  ('c1000010-0000-0000-0000-000000000010',
   'Boundary Retracement and Resolution',
   'Procedures for retracing existing boundaries, resolving discrepancies, and re-establishing lost or obliterated corners.',
   'advanced', 4.0, 16, 'published',
   ARRAY['boundary','retracement','resolution','field'],
   now(), now()),

-- ---- Part VI – Subdivision, Planning & Construction ------------------------

  ('c1000011-0000-0000-0000-000000000011',
   'Subdivision Design and Platting',
   'Design principles for subdivisions, platting requirements in Texas, and regulatory compliance.',
   'intermediate', 3.5, 17, 'published',
   ARRAY['subdivision','platting','design','planning'],
   now(), now()),

  ('c1000012-0000-0000-0000-000000000012',
   'Construction Surveying',
   'Layout, stakeout, and control surveys for building, road, and infrastructure construction projects.',
   'intermediate', 3.5, 18, 'published',
   ARRAY['construction','layout','stakeout','building'],
   now(), now()),

  ('c1000013-0000-0000-0000-000000000013',
   'Topographic and Mapping Surveys',
   'Topographic survey methods, contour mapping, digital terrain models, and integration with GIS.',
   'intermediate', 3.0, 19, 'published',
   ARRAY['topographic','mapping','contours','GIS'],
   now(), now()),

-- ---- Part VII – Specialized Surveying --------------------------------------

  ('c1000014-0000-0000-0000-000000000014',
   'Geodetic and Control Surveying',
   'High-precision control networks, geodetic computations, and national geodetic survey standards.',
   'advanced', 4.0, 20, 'published',
   ARRAY['geodetic','control','networks','precision'],
   now(), now()),

  ('c1000015-0000-0000-0000-000000000015',
   'Hydrographic and Coastal Surveying',
   'Surveying water boundaries, tidal datums, bathymetric surveys, and coastal zone management.',
   'advanced', 3.0, 21, 'published',
   ARRAY['hydrographic','coastal','water','boundaries'],
   now(), now()),

  ('c1000016-0000-0000-0000-000000000016',
   'Mining and Industrial Surveying',
   'Specialized surveying techniques for mining, tunneling, and industrial measurement applications.',
   'advanced', 2.5, 22, 'published',
   ARRAY['mining','industrial','specialized','underground'],
   now(), now()),

-- ---- Part VIII – Professional Practice -------------------------------------

  ('c1000017-0000-0000-0000-000000000017',
   'Survey Business and Professional Practice',
   'Business management, client relations, project management, and professional standards for surveying firms.',
   'advanced', 3.5, 23, 'published',
   ARRAY['professional','business','practice','management'],
   now(), now()),

  ('c1000018-0000-0000-0000-000000000018',
   'Texas Surveying Law and Regulations',
   'Texas-specific laws, TBPELS rules, Standards and Specifications, and regulatory compliance for surveyors.',
   'advanced', 4.0, 24, 'published',
   ARRAY['professional','texas-law','regulations','TBPELS'],
   now(), now()),

-- ---- Part IX – Exam Preparation --------------------------------------------

  ('c1000019-0000-0000-0000-000000000019',
   'SIT Exam Review — Fundamentals',
   'Comprehensive review of fundamental surveying concepts tested on the Texas Surveyor Intern Test (SIT).',
   'intermediate', 5.0, 25, 'published',
   ARRAY['exam-prep','SIT','fundamentals','review'],
   now(), now()),

  ('c100001a-0000-0000-0000-00000000001a',
   'SIT Exam Review — Advanced Topics',
   'Advanced topics and practice for the SIT exam including boundary law, legal descriptions, and construction surveying.',
   'intermediate', 4.5, 26, 'published',
   ARRAY['exam-prep','SIT','advanced','review'],
   now(), now()),

  ('c100001b-0000-0000-0000-00000000001b',
   'RPLS Exam Review — Texas Jurisprudence',
   'In-depth review of Texas land law, title history, and jurisprudence topics tested on the RPLS exam.',
   'advanced', 4.0, 27, 'published',
   ARRAY['exam-prep','RPLS','jurisprudence','texas-law'],
   now(), now()),

  ('c100001c-0000-0000-0000-00000000001c',
   'RPLS Exam Review — Practical Surveying',
   'Practical surveying review and problem-solving for the RPLS exam including computation-heavy topics.',
   'advanced', 5.0, 28, 'published',
   ARRAY['exam-prep','RPLS','practical','review'],
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
-- SECTION 2: LEARNING LESSONS (160+ lessons across 28 modules)
-- ============================================================================


-- --------------------------------------------------------------------------
-- Module 1: Introduction to Land Surveying (6 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c1000001-0000-0000-0000-000000000001';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c1000001-0000-0000-0000-000000000001', 'What Is Land Surveying?', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','history','profession'], 'published'),
  (gen_random_uuid(), 'c1000001-0000-0000-0000-000000000001', 'Brief History of Surveying (Ancient to Modern)', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','history','profession'], 'published'),
  (gen_random_uuid(), 'c1000001-0000-0000-0000-000000000001', 'The Role of the Modern Land Surveyor', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','history','profession'], 'published'),
  (gen_random_uuid(), 'c1000001-0000-0000-0000-000000000001', 'Land Surveying in Texas — Overview', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','history','profession'], 'published'),
  (gen_random_uuid(), 'c1000001-0000-0000-0000-000000000001', 'Licensing Path: SIT → RPLS', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','history','profession'], 'published'),
  (gen_random_uuid(), 'c1000001-0000-0000-0000-000000000001', 'Ethics and Professional Responsibility', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','history','profession'], 'published');

-- --------------------------------------------------------------------------
-- Module 2: Mathematics for Surveyors (8 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c1000002-0000-0000-0000-000000000002';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c1000002-0000-0000-0000-000000000002', 'Review of Algebra and Geometry Basics', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','math','trigonometry'], 'published'),
  (gen_random_uuid(), 'c1000002-0000-0000-0000-000000000002', 'Trigonometric Functions and Identities', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','math','trigonometry'], 'published'),
  (gen_random_uuid(), 'c1000002-0000-0000-0000-000000000002', 'Right Triangle Solutions in Surveying', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','math','trigonometry'], 'published'),
  (gen_random_uuid(), 'c1000002-0000-0000-0000-000000000002', 'Oblique Triangle Solutions', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','math','trigonometry'], 'published'),
  (gen_random_uuid(), 'c1000002-0000-0000-0000-000000000002', 'Coordinate Geometry (COGO) Fundamentals', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','math','trigonometry'], 'published'),
  (gen_random_uuid(), 'c1000002-0000-0000-0000-000000000002', 'Unit Conversions (Feet, Meters, Chains, Varas)', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','math','trigonometry'], 'published'),
  (gen_random_uuid(), 'c1000002-0000-0000-0000-000000000002', 'Area Computation Methods', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','math','trigonometry'], 'published'),
  (gen_random_uuid(), 'c1000002-0000-0000-0000-000000000002', 'Practical Math Problem Sets', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','math','trigonometry'], 'published');

-- --------------------------------------------------------------------------
-- Module 3: Surveying Measurements & Error Theory (7 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c1000003-0000-0000-0000-000000000003';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c1000003-0000-0000-0000-000000000003', 'Principles of Measurement', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','measurements','errors'], 'published'),
  (gen_random_uuid(), 'c1000003-0000-0000-0000-000000000003', 'Types of Errors (Systematic, Random, Blunders)', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','measurements','errors'], 'published'),
  (gen_random_uuid(), 'c1000003-0000-0000-0000-000000000003', 'Precision vs. Accuracy', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','measurements','errors'], 'published'),
  (gen_random_uuid(), 'c1000003-0000-0000-0000-000000000003', 'Significant Figures and Rounding', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','measurements','errors'], 'published'),
  (gen_random_uuid(), 'c1000003-0000-0000-0000-000000000003', 'Error Propagation', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','measurements','errors'], 'published'),
  (gen_random_uuid(), 'c1000003-0000-0000-0000-000000000003', 'Least Squares Concepts (Intro)', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','measurements','errors'], 'published'),
  (gen_random_uuid(), 'c1000003-0000-0000-0000-000000000003', 'Field Procedures to Minimize Error', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','measurements','errors'], 'published');

-- --------------------------------------------------------------------------
-- Module 4: Distance Measurement (6 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c1000004-0000-0000-0000-000000000004';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c1000004-0000-0000-0000-000000000004', 'Taping and Chaining', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','distance','measurement'], 'published'),
  (gen_random_uuid(), 'c1000004-0000-0000-0000-000000000004', 'Electronic Distance Measurement (EDM)', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','distance','measurement'], 'published'),
  (gen_random_uuid(), 'c1000004-0000-0000-0000-000000000004', 'Total Station Distance Measurement', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','distance','measurement'], 'published'),
  (gen_random_uuid(), 'c1000004-0000-0000-0000-000000000004', 'Slope, Horizontal, and Vertical Distances', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','distance','measurement'], 'published'),
  (gen_random_uuid(), 'c1000004-0000-0000-0000-000000000004', 'Distance Corrections (Temperature, Sag, Tension)', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','distance','measurement'], 'published'),
  (gen_random_uuid(), 'c1000004-0000-0000-0000-000000000004', 'Practical Distance Measurement Exercises', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','distance','measurement'], 'published');

-- --------------------------------------------------------------------------
-- Module 5: Angle and Direction Measurement (7 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c1000005-0000-0000-0000-000000000005';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c1000005-0000-0000-0000-000000000005', 'Horizontal Angle Measurement', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','angles','directions','bearings'], 'published'),
  (gen_random_uuid(), 'c1000005-0000-0000-0000-000000000005', 'Vertical Angle Measurement', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','angles','directions','bearings'], 'published'),
  (gen_random_uuid(), 'c1000005-0000-0000-0000-000000000005', 'Bearings and Azimuths', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','angles','directions','bearings'], 'published'),
  (gen_random_uuid(), 'c1000005-0000-0000-0000-000000000005', 'Compass and Magnetic Declination', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','angles','directions','bearings'], 'published'),
  (gen_random_uuid(), 'c1000005-0000-0000-0000-000000000005', 'Deflection Angles and Interior Angles', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','angles','directions','bearings'], 'published'),
  (gen_random_uuid(), 'c1000005-0000-0000-0000-000000000005', 'Angle Balancing and Adjustment', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','angles','directions','bearings'], 'published'),
  (gen_random_uuid(), 'c1000005-0000-0000-0000-000000000005', 'Direction Computation Exercises', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','angles','directions','bearings'], 'published');

-- --------------------------------------------------------------------------
-- Module 6: Leveling and Vertical Control (7 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c1000006-0000-0000-0000-000000000006';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c1000006-0000-0000-0000-000000000006', 'Principles of Leveling', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','leveling','elevation'], 'published'),
  (gen_random_uuid(), 'c1000006-0000-0000-0000-000000000006', 'Differential Leveling Procedures', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','leveling','elevation'], 'published'),
  (gen_random_uuid(), 'c1000006-0000-0000-0000-000000000006', 'Profile and Cross-Section Leveling', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','leveling','elevation'], 'published'),
  (gen_random_uuid(), 'c1000006-0000-0000-0000-000000000006', 'Trigonometric Leveling', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','leveling','elevation'], 'published'),
  (gen_random_uuid(), 'c1000006-0000-0000-0000-000000000006', 'Level Instrument Adjustments', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','leveling','elevation'], 'published'),
  (gen_random_uuid(), 'c1000006-0000-0000-0000-000000000006', 'Benchmark Networks and Vertical Datums', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','leveling','elevation'], 'published'),
  (gen_random_uuid(), 'c1000006-0000-0000-0000-000000000006', 'Leveling Field Exercises', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','leveling','elevation'], 'published');

-- --------------------------------------------------------------------------
-- Module 7: Coordinate Systems and Datums (8 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c1000007-0000-0000-0000-000000000007';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c1000007-0000-0000-0000-000000000007', 'Geographic Coordinate Systems (Latitude/Longitude)', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','datums','projections','geodesy'], 'published'),
  (gen_random_uuid(), 'c1000007-0000-0000-0000-000000000007', 'Geodetic Datums (NAD 27, NAD 83, WGS 84)', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','datums','projections','geodesy'], 'published'),
  (gen_random_uuid(), 'c1000007-0000-0000-0000-000000000007', 'Map Projections Overview', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','datums','projections','geodesy'], 'published'),
  (gen_random_uuid(), 'c1000007-0000-0000-0000-000000000007', 'State Plane Coordinate System (SPCS)', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','datums','projections','geodesy'], 'published'),
  (gen_random_uuid(), 'c1000007-0000-0000-0000-000000000007', 'Texas State Plane Zones', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','datums','projections','geodesy'], 'published'),
  (gen_random_uuid(), 'c1000007-0000-0000-0000-000000000007', 'UTM Coordinate System', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','datums','projections','geodesy'], 'published'),
  (gen_random_uuid(), 'c1000007-0000-0000-0000-000000000007', 'Datum Transformations', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','datums','projections','geodesy'], 'published'),
  (gen_random_uuid(), 'c1000007-0000-0000-0000-000000000007', 'Practical Coordinate Conversions', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','datums','projections','geodesy'], 'published');

-- --------------------------------------------------------------------------
-- Module 8: Traverse Computations (8 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c1000008-0000-0000-0000-000000000008';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c1000008-0000-0000-0000-000000000008', 'Traverse Types (Open, Closed, Link)', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','traverse','closure','adjustment'], 'published'),
  (gen_random_uuid(), 'c1000008-0000-0000-0000-000000000008', 'Traverse Field Procedures', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','traverse','closure','adjustment'], 'published'),
  (gen_random_uuid(), 'c1000008-0000-0000-0000-000000000008', 'Latitude and Departure Calculations', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','traverse','closure','adjustment'], 'published'),
  (gen_random_uuid(), 'c1000008-0000-0000-0000-000000000008', 'Closure Error and Ratio of Closure', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','traverse','closure','adjustment'], 'published'),
  (gen_random_uuid(), 'c1000008-0000-0000-0000-000000000008', 'Compass Rule Adjustment', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','traverse','closure','adjustment'], 'published'),
  (gen_random_uuid(), 'c1000008-0000-0000-0000-000000000008', 'Transit Rule Adjustment', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','traverse','closure','adjustment'], 'published'),
  (gen_random_uuid(), 'c1000008-0000-0000-0000-000000000008', 'Coordinate Calculation from Traverse Data', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','traverse','closure','adjustment'], 'published'),
  (gen_random_uuid(), 'c1000008-0000-0000-0000-000000000008', 'Traverse Computation Problem Sets', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','traverse','closure','adjustment'], 'published');

-- --------------------------------------------------------------------------
-- Module 9: Area and Volume Computations (6 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c1000009-0000-0000-0000-000000000009';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c1000009-0000-0000-0000-000000000009', 'Area by Coordinates (Double Meridian Distance)', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','area','volume','calculations'], 'published'),
  (gen_random_uuid(), 'c1000009-0000-0000-0000-000000000009', 'Area by Triangulation', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','area','volume','calculations'], 'published'),
  (gen_random_uuid(), 'c1000009-0000-0000-0000-000000000009', 'Area Partitioning and Division', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','area','volume','calculations'], 'published'),
  (gen_random_uuid(), 'c1000009-0000-0000-0000-000000000009', 'Volume by Cross-Sections', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','area','volume','calculations'], 'published'),
  (gen_random_uuid(), 'c1000009-0000-0000-0000-000000000009', 'Volume by Contour Methods', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','area','volume','calculations'], 'published'),
  (gen_random_uuid(), 'c1000009-0000-0000-0000-000000000009', 'Earthwork Computation Exercises', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','area','volume','calculations'], 'published');

-- --------------------------------------------------------------------------
-- Module 10: Total Stations and Electronic Surveying (7 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c100000a-0000-0000-0000-00000000000a';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c100000a-0000-0000-0000-00000000000a', 'Total Station Components and Setup', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','total-station','electronic'], 'published'),
  (gen_random_uuid(), 'c100000a-0000-0000-0000-00000000000a', 'Electronic Angle and Distance Measurement', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','total-station','electronic'], 'published'),
  (gen_random_uuid(), 'c100000a-0000-0000-0000-00000000000a', 'Data Collectors and Field Software', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','total-station','electronic'], 'published'),
  (gen_random_uuid(), 'c100000a-0000-0000-0000-00000000000a', 'Stakeout Procedures', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','total-station','electronic'], 'published'),
  (gen_random_uuid(), 'c100000a-0000-0000-0000-00000000000a', 'Reflectorless Measurement', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','total-station','electronic'], 'published'),
  (gen_random_uuid(), 'c100000a-0000-0000-0000-00000000000a', 'Field-to-Office Data Transfer', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','total-station','electronic'], 'published'),
  (gen_random_uuid(), 'c100000a-0000-0000-0000-00000000000a', 'Total Station Calibration and Care', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','total-station','electronic'], 'published');

-- --------------------------------------------------------------------------
-- Module 11: GPS/GNSS Surveying (9 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c100000b-0000-0000-0000-00000000000b';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c100000b-0000-0000-0000-00000000000b', 'GPS/GNSS Fundamentals', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','gps','gnss','satellite'], 'published'),
  (gen_random_uuid(), 'c100000b-0000-0000-0000-00000000000b', 'Satellite Constellations (GPS, GLONASS, Galileo)', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','gps','gnss','satellite'], 'published'),
  (gen_random_uuid(), 'c100000b-0000-0000-0000-00000000000b', 'GPS Signal Structure and Measurement', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','gps','gnss','satellite'], 'published'),
  (gen_random_uuid(), 'c100000b-0000-0000-0000-00000000000b', 'Static GPS Surveying', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','gps','gnss','satellite'], 'published'),
  (gen_random_uuid(), 'c100000b-0000-0000-0000-00000000000b', 'Real-Time Kinematic (RTK) Methods', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','gps','gnss','satellite'], 'published'),
  (gen_random_uuid(), 'c100000b-0000-0000-0000-00000000000b', 'Network RTK and CORS', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','gps','gnss','satellite'], 'published'),
  (gen_random_uuid(), 'c100000b-0000-0000-0000-00000000000b', 'GPS Data Processing and Adjustment', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','gps','gnss','satellite'], 'published'),
  (gen_random_uuid(), 'c100000b-0000-0000-0000-00000000000b', 'GPS Error Sources and Mitigation', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','gps','gnss','satellite'], 'published'),
  (gen_random_uuid(), 'c100000b-0000-0000-0000-00000000000b', 'Integrating GPS with Conventional Surveys', '', ARRAY[]::text[], 9, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','gps','gnss','satellite'], 'published');

-- --------------------------------------------------------------------------
-- Module 12: Robotic, Scanning, and UAS Technology (6 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c100000c-0000-0000-0000-00000000000c';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c100000c-0000-0000-0000-00000000000c', 'Robotic Total Stations', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','lidar','uas','scanning','drones'], 'published'),
  (gen_random_uuid(), 'c100000c-0000-0000-0000-00000000000c', '3D Laser Scanning (Terrestrial LiDAR)', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','lidar','uas','scanning','drones'], 'published'),
  (gen_random_uuid(), 'c100000c-0000-0000-0000-00000000000c', 'Point Cloud Processing', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','lidar','uas','scanning','drones'], 'published'),
  (gen_random_uuid(), 'c100000c-0000-0000-0000-00000000000c', 'Unmanned Aerial Systems (Drones) in Surveying', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','lidar','uas','scanning','drones'], 'published'),
  (gen_random_uuid(), 'c100000c-0000-0000-0000-00000000000c', 'Photogrammetry from UAS', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','lidar','uas','scanning','drones'], 'published'),
  (gen_random_uuid(), 'c100000c-0000-0000-0000-00000000000c', 'Technology Integration and Best Practices', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','lidar','uas','scanning','drones'], 'published');

-- --------------------------------------------------------------------------
-- Module 13: Boundary Law Principles (8 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c100000d-0000-0000-0000-00000000000d';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c100000d-0000-0000-0000-00000000000d', 'Introduction to Property Law', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','legal','law','property'], 'published'),
  (gen_random_uuid(), 'c100000d-0000-0000-0000-00000000000d', 'Types of Property (Real vs. Personal)', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','legal','law','property'], 'published'),
  (gen_random_uuid(), 'c100000d-0000-0000-0000-00000000000d', 'Estates and Interests in Land', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','legal','law','property'], 'published'),
  (gen_random_uuid(), 'c100000d-0000-0000-0000-00000000000d', 'Legal Descriptions Overview', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','legal','law','property'], 'published'),
  (gen_random_uuid(), 'c100000d-0000-0000-0000-00000000000d', 'Rules of Construction for Deeds', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','legal','law','property'], 'published'),
  (gen_random_uuid(), 'c100000d-0000-0000-0000-00000000000d', 'Riparian and Littoral Rights', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','legal','law','property'], 'published'),
  (gen_random_uuid(), 'c100000d-0000-0000-0000-00000000000d', 'Adverse Possession and Acquiescence', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','legal','law','property'], 'published'),
  (gen_random_uuid(), 'c100000d-0000-0000-0000-00000000000d', 'Easements and Rights-of-Way', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','legal','law','property'], 'published');

-- --------------------------------------------------------------------------
-- Module 14: Metes and Bounds Descriptions (7 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c100000e-0000-0000-0000-00000000000e';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c100000e-0000-0000-0000-00000000000e', 'Components of a Metes and Bounds Description', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','metes-bounds','descriptions','legal'], 'published'),
  (gen_random_uuid(), 'c100000e-0000-0000-0000-00000000000e', 'Beginning Points and Monuments', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','metes-bounds','descriptions','legal'], 'published'),
  (gen_random_uuid(), 'c100000e-0000-0000-0000-00000000000e', 'Course and Distance Calls', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','metes-bounds','descriptions','legal'], 'published'),
  (gen_random_uuid(), 'c100000e-0000-0000-0000-00000000000e', 'Natural and Artificial Monuments', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','metes-bounds','descriptions','legal'], 'published'),
  (gen_random_uuid(), 'c100000e-0000-0000-0000-00000000000e', 'Senior vs. Junior Rights', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','metes-bounds','descriptions','legal'], 'published'),
  (gen_random_uuid(), 'c100000e-0000-0000-0000-00000000000e', 'Resolving Conflicting Calls', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','metes-bounds','descriptions','legal'], 'published'),
  (gen_random_uuid(), 'c100000e-0000-0000-0000-00000000000e', 'Writing Legal Descriptions', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','metes-bounds','descriptions','legal'], 'published');

-- --------------------------------------------------------------------------
-- Module 15: Texas Land Titles and Records (8 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c100000f-0000-0000-0000-00000000000f';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c100000f-0000-0000-0000-00000000000f', 'History of Texas Land Grants', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','texas','titles','records','history'], 'published'),
  (gen_random_uuid(), 'c100000f-0000-0000-0000-00000000000f', 'Spanish and Mexican Land Grants', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','texas','titles','records','history'], 'published'),
  (gen_random_uuid(), 'c100000f-0000-0000-0000-00000000000f', 'Republic of Texas Grants', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','texas','titles','records','history'], 'published'),
  (gen_random_uuid(), 'c100000f-0000-0000-0000-00000000000f', 'Texas General Land Office (GLO)', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','texas','titles','records','history'], 'published'),
  (gen_random_uuid(), 'c100000f-0000-0000-0000-00000000000f', 'Abstract of Title and Title Insurance', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','texas','titles','records','history'], 'published'),
  (gen_random_uuid(), 'c100000f-0000-0000-0000-00000000000f', 'County Clerk Records Research', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','texas','titles','records','history'], 'published'),
  (gen_random_uuid(), 'c100000f-0000-0000-0000-00000000000f', 'Deed Interpretation', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','texas','titles','records','history'], 'published'),
  (gen_random_uuid(), 'c100000f-0000-0000-0000-00000000000f', 'Texas Land Title Practice Exercises', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','texas','titles','records','history'], 'published');

-- --------------------------------------------------------------------------
-- Module 16: Boundary Retracement and Resolution (8 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c1000010-0000-0000-0000-000000000010';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c1000010-0000-0000-0000-000000000010', 'Retracement Survey Principles', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','retracement','resolution','field'], 'published'),
  (gen_random_uuid(), 'c1000010-0000-0000-0000-000000000010', 'Original Survey vs. Retracement', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','retracement','resolution','field'], 'published'),
  (gen_random_uuid(), 'c1000010-0000-0000-0000-000000000010', 'Evidence Collection and Analysis', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','retracement','resolution','field'], 'published'),
  (gen_random_uuid(), 'c1000010-0000-0000-0000-000000000010', 'Lost and Obliterated Corners', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','retracement','resolution','field'], 'published'),
  (gen_random_uuid(), 'c1000010-0000-0000-0000-000000000010', 'Proportionate Measurement', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','retracement','resolution','field'], 'published'),
  (gen_random_uuid(), 'c1000010-0000-0000-0000-000000000010', 'Agreement Lines and Boundary Agreements', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','retracement','resolution','field'], 'published'),
  (gen_random_uuid(), 'c1000010-0000-0000-0000-000000000010', 'Expert Witness and Court Procedures', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','retracement','resolution','field'], 'published'),
  (gen_random_uuid(), 'c1000010-0000-0000-0000-000000000010', 'Boundary Retracement Case Studies', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','retracement','resolution','field'], 'published');

-- --------------------------------------------------------------------------
-- Module 17: Subdivision Design and Platting (7 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c1000011-0000-0000-0000-000000000011';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c1000011-0000-0000-0000-000000000011', 'Subdivision Design Principles', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['subdivision','platting','design','planning'], 'published'),
  (gen_random_uuid(), 'c1000011-0000-0000-0000-000000000011', 'Texas Subdivision Regulations', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['subdivision','platting','design','planning'], 'published'),
  (gen_random_uuid(), 'c1000011-0000-0000-0000-000000000011', 'Plat Requirements and Standards', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['subdivision','platting','design','planning'], 'published'),
  (gen_random_uuid(), 'c1000011-0000-0000-0000-000000000011', 'Lot and Block Design', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['subdivision','platting','design','planning'], 'published'),
  (gen_random_uuid(), 'c1000011-0000-0000-0000-000000000011', 'Street and Utility Layout', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['subdivision','platting','design','planning'], 'published'),
  (gen_random_uuid(), 'c1000011-0000-0000-0000-000000000011', 'Filing and Recording Plats', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['subdivision','platting','design','planning'], 'published'),
  (gen_random_uuid(), 'c1000011-0000-0000-0000-000000000011', 'Subdivision Case Studies', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['subdivision','platting','design','planning'], 'published');

-- --------------------------------------------------------------------------
-- Module 18: Construction Surveying (7 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c1000012-0000-0000-0000-000000000012';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c1000012-0000-0000-0000-000000000012', 'Construction Survey Fundamentals', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['construction','layout','stakeout','building'], 'published'),
  (gen_random_uuid(), 'c1000012-0000-0000-0000-000000000012', 'Building Layout and Control', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['construction','layout','stakeout','building'], 'published'),
  (gen_random_uuid(), 'c1000012-0000-0000-0000-000000000012', 'Road and Highway Stakeout', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['construction','layout','stakeout','building'], 'published'),
  (gen_random_uuid(), 'c1000012-0000-0000-0000-000000000012', 'Utility and Pipeline Surveys', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['construction','layout','stakeout','building'], 'published'),
  (gen_random_uuid(), 'c1000012-0000-0000-0000-000000000012', 'Earthwork and Grading Surveys', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['construction','layout','stakeout','building'], 'published'),
  (gen_random_uuid(), 'c1000012-0000-0000-0000-000000000012', 'As-Built Surveys', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['construction','layout','stakeout','building'], 'published'),
  (gen_random_uuid(), 'c1000012-0000-0000-0000-000000000012', 'Construction Survey Problems', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['construction','layout','stakeout','building'], 'published');

-- --------------------------------------------------------------------------
-- Module 19: Topographic and Mapping Surveys (6 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c1000013-0000-0000-0000-000000000013';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c1000013-0000-0000-0000-000000000013', 'Topographic Survey Methods', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['topographic','mapping','contours','GIS'], 'published'),
  (gen_random_uuid(), 'c1000013-0000-0000-0000-000000000013', 'Contour Lines and Mapping', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['topographic','mapping','contours','GIS'], 'published'),
  (gen_random_uuid(), 'c1000013-0000-0000-0000-000000000013', 'Digital Terrain Models (DTM/DEM)', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['topographic','mapping','contours','GIS'], 'published'),
  (gen_random_uuid(), 'c1000013-0000-0000-0000-000000000013', 'Feature Collection and Coding', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['topographic','mapping','contours','GIS'], 'published'),
  (gen_random_uuid(), 'c1000013-0000-0000-0000-000000000013', 'Map Standards and Symbology', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['topographic','mapping','contours','GIS'], 'published'),
  (gen_random_uuid(), 'c1000013-0000-0000-0000-000000000013', 'GIS Integration for Surveyors', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['topographic','mapping','contours','GIS'], 'published');

-- --------------------------------------------------------------------------
-- Module 20: Geodetic and Control Surveying (8 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c1000014-0000-0000-0000-000000000014';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c1000014-0000-0000-0000-000000000014', 'Geodetic Survey Concepts', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['geodetic','control','networks','precision'], 'published'),
  (gen_random_uuid(), 'c1000014-0000-0000-0000-000000000014', 'Horizontal Control Networks', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['geodetic','control','networks','precision'], 'published'),
  (gen_random_uuid(), 'c1000014-0000-0000-0000-000000000014', 'Vertical Control Networks', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['geodetic','control','networks','precision'], 'published'),
  (gen_random_uuid(), 'c1000014-0000-0000-0000-000000000014', 'Geodetic Computations on the Ellipsoid', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['geodetic','control','networks','precision'], 'published'),
  (gen_random_uuid(), 'c1000014-0000-0000-0000-000000000014', 'Geoid Models and Orthometric Heights', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['geodetic','control','networks','precision'], 'published'),
  (gen_random_uuid(), 'c1000014-0000-0000-0000-000000000014', 'NGS Standards and Specifications', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['geodetic','control','networks','precision'], 'published'),
  (gen_random_uuid(), 'c1000014-0000-0000-0000-000000000014', 'CORS and OPUS', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['geodetic','control','networks','precision'], 'published'),
  (gen_random_uuid(), 'c1000014-0000-0000-0000-000000000014', 'Control Network Design and Adjustment', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['geodetic','control','networks','precision'], 'published');

-- --------------------------------------------------------------------------
-- Module 21: Hydrographic and Coastal Surveying (6 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c1000015-0000-0000-0000-000000000015';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c1000015-0000-0000-0000-000000000015', 'Hydrographic Survey Fundamentals', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['hydrographic','coastal','water','boundaries'], 'published'),
  (gen_random_uuid(), 'c1000015-0000-0000-0000-000000000015', 'Tidal Datums and Water Level Measurement', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['hydrographic','coastal','water','boundaries'], 'published'),
  (gen_random_uuid(), 'c1000015-0000-0000-0000-000000000015', 'Bathymetric Survey Methods', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['hydrographic','coastal','water','boundaries'], 'published'),
  (gen_random_uuid(), 'c1000015-0000-0000-0000-000000000015', 'Coastal Boundary Determination', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['hydrographic','coastal','water','boundaries'], 'published'),
  (gen_random_uuid(), 'c1000015-0000-0000-0000-000000000015', 'Navigable Waterways and Riparian Surveys', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['hydrographic','coastal','water','boundaries'], 'published'),
  (gen_random_uuid(), 'c1000015-0000-0000-0000-000000000015', 'Environmental and Regulatory Considerations', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['hydrographic','coastal','water','boundaries'], 'published');

-- --------------------------------------------------------------------------
-- Module 22: Mining and Industrial Surveying (5 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c1000016-0000-0000-0000-000000000016';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c1000016-0000-0000-0000-000000000016', 'Mine Surveying Fundamentals', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['mining','industrial','specialized','underground'], 'published'),
  (gen_random_uuid(), 'c1000016-0000-0000-0000-000000000016', 'Underground Survey Methods', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['mining','industrial','specialized','underground'], 'published'),
  (gen_random_uuid(), 'c1000016-0000-0000-0000-000000000016', 'Surface and Subsidence Monitoring', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['mining','industrial','specialized','underground'], 'published'),
  (gen_random_uuid(), 'c1000016-0000-0000-0000-000000000016', 'Industrial and Optical Alignment', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['mining','industrial','specialized','underground'], 'published'),
  (gen_random_uuid(), 'c1000016-0000-0000-0000-000000000016', 'Deformation Monitoring Techniques', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['mining','industrial','specialized','underground'], 'published');

-- --------------------------------------------------------------------------
-- Module 23: Survey Business and Professional Practice (7 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c1000017-0000-0000-0000-000000000017';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c1000017-0000-0000-0000-000000000017', 'Starting and Running a Survey Business', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','business','practice','management'], 'published'),
  (gen_random_uuid(), 'c1000017-0000-0000-0000-000000000017', 'Project Management for Surveyors', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','business','practice','management'], 'published'),
  (gen_random_uuid(), 'c1000017-0000-0000-0000-000000000017', 'Client Relations and Communication', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','business','practice','management'], 'published'),
  (gen_random_uuid(), 'c1000017-0000-0000-0000-000000000017', 'Proposal Writing and Fee Estimation', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','business','practice','management'], 'published'),
  (gen_random_uuid(), 'c1000017-0000-0000-0000-000000000017', 'Insurance and Liability', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','business','practice','management'], 'published'),
  (gen_random_uuid(), 'c1000017-0000-0000-0000-000000000017', 'Quality Assurance and Quality Control', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','business','practice','management'], 'published'),
  (gen_random_uuid(), 'c1000017-0000-0000-0000-000000000017', 'Professional Development and Continuing Education', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','business','practice','management'], 'published');

-- --------------------------------------------------------------------------
-- Module 24: Texas Surveying Law and Regulations (8 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c1000018-0000-0000-0000-000000000018';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c1000018-0000-0000-0000-000000000018', 'Texas Board of Professional Engineers and Land Surveyors (TBPELS)', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','texas-law','regulations','TBPELS'], 'published'),
  (gen_random_uuid(), 'c1000018-0000-0000-0000-000000000018', 'Texas Professional Land Surveying Practices Act', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','texas-law','regulations','TBPELS'], 'published'),
  (gen_random_uuid(), 'c1000018-0000-0000-0000-000000000018', 'TBPELS Rules and Regulations', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','texas-law','regulations','TBPELS'], 'published'),
  (gen_random_uuid(), 'c1000018-0000-0000-0000-000000000018', 'Texas Standards and Specifications for Land Surveying', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','texas-law','regulations','TBPELS'], 'published'),
  (gen_random_uuid(), 'c1000018-0000-0000-0000-000000000018', 'Texas Natural Resources Code — Surveying Sections', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','texas-law','regulations','TBPELS'], 'published'),
  (gen_random_uuid(), 'c1000018-0000-0000-0000-000000000018', 'Texas Property Code — Relevant Sections', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','texas-law','regulations','TBPELS'], 'published'),
  (gen_random_uuid(), 'c1000018-0000-0000-0000-000000000018', 'Ethics Complaints and Disciplinary Process', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','texas-law','regulations','TBPELS'], 'published'),
  (gen_random_uuid(), 'c1000018-0000-0000-0000-000000000018', 'Regulatory Compliance Case Studies', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','texas-law','regulations','TBPELS'], 'published');

-- --------------------------------------------------------------------------
-- Module 25: SIT Exam Review — Fundamentals (10 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c1000019-0000-0000-0000-000000000019';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c1000019-0000-0000-0000-000000000019', 'SIT Exam Format and Study Strategy', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published'),
  (gen_random_uuid(), 'c1000019-0000-0000-0000-000000000019', 'Mathematics Review for SIT', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published'),
  (gen_random_uuid(), 'c1000019-0000-0000-0000-000000000019', 'Measurement and Error Theory Review', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published'),
  (gen_random_uuid(), 'c1000019-0000-0000-0000-000000000019', 'Distance and Angle Measurement Review', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published'),
  (gen_random_uuid(), 'c1000019-0000-0000-0000-000000000019', 'Leveling Review', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published'),
  (gen_random_uuid(), 'c1000019-0000-0000-0000-000000000019', 'Coordinate Systems Review', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published'),
  (gen_random_uuid(), 'c1000019-0000-0000-0000-000000000019', 'Traverse Computations Review', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published'),
  (gen_random_uuid(), 'c1000019-0000-0000-0000-000000000019', 'Area and Volume Review', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published'),
  (gen_random_uuid(), 'c1000019-0000-0000-0000-000000000019', 'GPS/GNSS Concepts Review', '', ARRAY[]::text[], 9, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published'),
  (gen_random_uuid(), 'c1000019-0000-0000-0000-000000000019', 'SIT Practice Problems — Set 1', '', ARRAY[]::text[], 10, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published');

-- --------------------------------------------------------------------------
-- Module 26: SIT Exam Review — Advanced Topics (9 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c100001a-0000-0000-0000-00000000001a';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c100001a-0000-0000-0000-00000000001a', 'Boundary Law Principles Review', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','advanced','review'], 'published'),
  (gen_random_uuid(), 'c100001a-0000-0000-0000-00000000001a', 'Legal Descriptions Review', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','advanced','review'], 'published'),
  (gen_random_uuid(), 'c100001a-0000-0000-0000-00000000001a', 'Texas Land Records Review', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','advanced','review'], 'published'),
  (gen_random_uuid(), 'c100001a-0000-0000-0000-00000000001a', 'Construction Surveying Review', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','advanced','review'], 'published'),
  (gen_random_uuid(), 'c100001a-0000-0000-0000-00000000001a', 'Topographic Surveying Review', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','advanced','review'], 'published'),
  (gen_random_uuid(), 'c100001a-0000-0000-0000-00000000001a', 'Professional Practice Review', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','advanced','review'], 'published'),
  (gen_random_uuid(), 'c100001a-0000-0000-0000-00000000001a', 'Texas Law and Regulations Review', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','advanced','review'], 'published'),
  (gen_random_uuid(), 'c100001a-0000-0000-0000-00000000001a', 'SIT Practice Problems — Set 2', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','advanced','review'], 'published'),
  (gen_random_uuid(), 'c100001a-0000-0000-0000-00000000001a', 'SIT Full-Length Practice Exam Tips', '', ARRAY[]::text[], 9, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','advanced','review'], 'published');

-- --------------------------------------------------------------------------
-- Module 27: RPLS Exam Review — Texas Jurisprudence (8 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c100001b-0000-0000-0000-00000000001b';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c100001b-0000-0000-0000-00000000001b', 'RPLS Exam Format and Study Strategy', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','jurisprudence','texas-law'], 'published'),
  (gen_random_uuid(), 'c100001b-0000-0000-0000-00000000001b', 'Texas Land Grant History — Deep Review', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','jurisprudence','texas-law'], 'published'),
  (gen_random_uuid(), 'c100001b-0000-0000-0000-00000000001b', 'Property Law and Estates Review', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','jurisprudence','texas-law'], 'published'),
  (gen_random_uuid(), 'c100001b-0000-0000-0000-00000000001b', 'Boundary Retracement and Resolution Review', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','jurisprudence','texas-law'], 'published'),
  (gen_random_uuid(), 'c100001b-0000-0000-0000-00000000001b', 'Riparian and Water Rights Review', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','jurisprudence','texas-law'], 'published'),
  (gen_random_uuid(), 'c100001b-0000-0000-0000-00000000001b', 'Texas Surveying Statutes — Deep Review', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','jurisprudence','texas-law'], 'published'),
  (gen_random_uuid(), 'c100001b-0000-0000-0000-00000000001b', 'RPLS Practice Problems — Jurisprudence', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','jurisprudence','texas-law'], 'published'),
  (gen_random_uuid(), 'c100001b-0000-0000-0000-00000000001b', 'RPLS Jurisprudence Practice Exam Tips', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','jurisprudence','texas-law'], 'published');

-- --------------------------------------------------------------------------
-- Module 28: RPLS Exam Review — Practical Surveying (10 lessons)
-- --------------------------------------------------------------------------
DELETE FROM learning_lessons WHERE module_id = 'c100001c-0000-0000-0000-00000000001c';
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  (gen_random_uuid(), 'c100001c-0000-0000-0000-00000000001c', 'Advanced Coordinate Computations', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published'),
  (gen_random_uuid(), 'c100001c-0000-0000-0000-00000000001c', 'Geodetic Concepts for RPLS', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published'),
  (gen_random_uuid(), 'c100001c-0000-0000-0000-00000000001c', 'Boundary Analysis and Evidence Evaluation', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published'),
  (gen_random_uuid(), 'c100001c-0000-0000-0000-00000000001c', 'Complex Traverse Problems', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published'),
  (gen_random_uuid(), 'c100001c-0000-0000-0000-00000000001c', 'Area Computation and Land Division', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published'),
  (gen_random_uuid(), 'c100001c-0000-0000-0000-00000000001c', 'Construction Layout and Design Problems', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published'),
  (gen_random_uuid(), 'c100001c-0000-0000-0000-00000000001c', 'GPS Integration and Modern Methods', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published'),
  (gen_random_uuid(), 'c100001c-0000-0000-0000-00000000001c', 'Survey Standards Compliance', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published'),
  (gen_random_uuid(), 'c100001c-0000-0000-0000-00000000001c', 'RPLS Practice Problems — Practical', '', ARRAY[]::text[], 9, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published'),
  (gen_random_uuid(), 'c100001c-0000-0000-0000-00000000001c', 'RPLS Full-Length Practice Exam Tips', '', ARRAY[]::text[], 10, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published');

-- ============================================================================
-- SECTION 3: CURRICULUM MILESTONES
-- ============================================================================

DELETE FROM user_milestone_progress;
DELETE FROM curriculum_milestones;

INSERT INTO curriculum_milestones (id, title, description, milestone_type, part_number, required_module_ids, order_index, icon, color, created_at)
VALUES
  -- Part completion milestones
  (gen_random_uuid(),
   'Part I Complete — Foundations',
   'Completed all foundation modules covering history, mathematics, and measurement theory.',
   'part_complete', 1,
   ARRAY[
     'c1000001-0000-0000-0000-000000000001',
     'c1000002-0000-0000-0000-000000000002',
     'c1000003-0000-0000-0000-000000000003'
   ]::uuid[],
   1, '🏗️', '#1D3095', now()),

  (gen_random_uuid(),
   'Part II Complete — Field Techniques',
   'Completed all field technique modules covering distance, angle, and leveling measurement.',
   'part_complete', 2,
   ARRAY[
     'c1000004-0000-0000-0000-000000000004',
     'c1000005-0000-0000-0000-000000000005',
     'c1000006-0000-0000-0000-000000000006'
   ]::uuid[],
   2, '🔭', '#7C3AED', now()),

  (gen_random_uuid(),
   'Part III Complete — Coordinates & Computations',
   'Completed all coordinate system and computation modules covering datums, traverses, and area/volume calculations.',
   'part_complete', 3,
   ARRAY[
     'c1000007-0000-0000-0000-000000000007',
     'c1000008-0000-0000-0000-000000000008',
     'c1000009-0000-0000-0000-000000000009'
   ]::uuid[],
   3, '📐', '#0891B2', now()),

  (gen_random_uuid(),
   'Part IV Complete — Modern Technology',
   'Completed all modern technology modules covering total stations, GPS/GNSS, and emerging technologies.',
   'part_complete', 4,
   ARRAY[
     'c100000a-0000-0000-0000-00000000000a',
     'c100000b-0000-0000-0000-00000000000b',
     'c100000c-0000-0000-0000-00000000000c'
   ]::uuid[],
   4, '📡', '#059669', now()),

  (gen_random_uuid(),
   'Part V Complete — Boundary & Legal',
   'Completed all boundary and legal surveying modules covering property law, metes and bounds, Texas titles, and retracement.',
   'part_complete', 5,
   ARRAY[
     'c100000d-0000-0000-0000-00000000000d',
     'c100000e-0000-0000-0000-00000000000e',
     'c100000f-0000-0000-0000-00000000000f',
     'c1000010-0000-0000-0000-000000000010'
   ]::uuid[],
   5, '⚖️', '#D97706', now()),

  (gen_random_uuid(),
   'Part VI Complete — Subdivision & Construction',
   'Completed all subdivision, construction, and topographic surveying modules.',
   'part_complete', 6,
   ARRAY[
     'c1000011-0000-0000-0000-000000000011',
     'c1000012-0000-0000-0000-000000000012',
     'c1000013-0000-0000-0000-000000000013'
   ]::uuid[],
   6, '🏗️', '#DC2626', now()),

  (gen_random_uuid(),
   'Part VII Complete — Specialized Surveying',
   'Completed all specialized surveying modules covering geodetic, hydrographic, and mining surveying.',
   'part_complete', 7,
   ARRAY[
     'c1000014-0000-0000-0000-000000000014',
     'c1000015-0000-0000-0000-000000000015',
     'c1000016-0000-0000-0000-000000000016'
   ]::uuid[],
   7, '🌊', '#4F46E5', now()),

  (gen_random_uuid(),
   'Part VIII Complete — Professional Practice',
   'Completed all professional practice modules covering business management and Texas surveying law.',
   'part_complete', 8,
   ARRAY[
     'c1000017-0000-0000-0000-000000000017',
     'c1000018-0000-0000-0000-000000000018'
   ]::uuid[],
   8, '💼', '#7C3AED', now()),

  (gen_random_uuid(),
   'Part IX Complete — Exam Prep',
   'Completed all exam preparation modules for both SIT and RPLS exams.',
   'part_complete', 9,
   ARRAY[
     'c1000019-0000-0000-0000-000000000019',
     'c100001a-0000-0000-0000-00000000001a',
     'c100001b-0000-0000-0000-00000000001b',
     'c100001c-0000-0000-0000-00000000001c'
   ]::uuid[],
   9, '🎯', '#10B981', now()),

  -- Exam readiness milestones
  (gen_random_uuid(),
   'SIT Exam Ready',
   'Completed all modules required to sit for the Texas Surveyor Intern Test (SIT) — foundations through modern technology plus SIT exam review.',
   'exam_ready', NULL,
   ARRAY[
     'c1000001-0000-0000-0000-000000000001',
     'c1000002-0000-0000-0000-000000000002',
     'c1000003-0000-0000-0000-000000000003',
     'c1000004-0000-0000-0000-000000000004',
     'c1000005-0000-0000-0000-000000000005',
     'c1000006-0000-0000-0000-000000000006',
     'c1000007-0000-0000-0000-000000000007',
     'c1000008-0000-0000-0000-000000000008',
     'c1000009-0000-0000-0000-000000000009',
     'c100000a-0000-0000-0000-00000000000a',
     'c100000b-0000-0000-0000-00000000000b',
     'c100000c-0000-0000-0000-00000000000c',
     'c1000019-0000-0000-0000-000000000019',
     'c100001a-0000-0000-0000-00000000001a'
   ]::uuid[],
   10, '🎓', '#F59E0B', now()),

  (gen_random_uuid(),
   'RPLS Exam Ready',
   'Completed the entire curriculum — all 28 modules — and is fully prepared for the Registered Professional Land Surveyor (RPLS) exam.',
   'exam_ready', NULL,
   ARRAY[
     'c1000001-0000-0000-0000-000000000001',
     'c1000002-0000-0000-0000-000000000002',
     'c1000003-0000-0000-0000-000000000003',
     'c1000004-0000-0000-0000-000000000004',
     'c1000005-0000-0000-0000-000000000005',
     'c1000006-0000-0000-0000-000000000006',
     'c1000007-0000-0000-0000-000000000007',
     'c1000008-0000-0000-0000-000000000008',
     'c1000009-0000-0000-0000-000000000009',
     'c100000a-0000-0000-0000-00000000000a',
     'c100000b-0000-0000-0000-00000000000b',
     'c100000c-0000-0000-0000-00000000000c',
     'c100000d-0000-0000-0000-00000000000d',
     'c100000e-0000-0000-0000-00000000000e',
     'c100000f-0000-0000-0000-00000000000f',
     'c1000010-0000-0000-0000-000000000010',
     'c1000011-0000-0000-0000-000000000011',
     'c1000012-0000-0000-0000-000000000012',
     'c1000013-0000-0000-0000-000000000013',
     'c1000014-0000-0000-0000-000000000014',
     'c1000015-0000-0000-0000-000000000015',
     'c1000016-0000-0000-0000-000000000016',
     'c1000017-0000-0000-0000-000000000017',
     'c1000018-0000-0000-0000-000000000018',
     'c1000019-0000-0000-0000-000000000019',
     'c100001a-0000-0000-0000-00000000001a',
     'c100001b-0000-0000-0000-00000000001b',
     'c100001c-0000-0000-0000-00000000001c'
   ]::uuid[],
   11, '🏆', '#BD1218', now()),

  -- Certification milestones
  (gen_random_uuid(),
   'Fundamentals Mastered',
   'Mastered all fundamental surveying knowledge — Parts I through III covering foundations, field techniques, and coordinate computations.',
   'certification', NULL,
   ARRAY[
     'c1000001-0000-0000-0000-000000000001',
     'c1000002-0000-0000-0000-000000000002',
     'c1000003-0000-0000-0000-000000000003',
     'c1000004-0000-0000-0000-000000000004',
     'c1000005-0000-0000-0000-000000000005',
     'c1000006-0000-0000-0000-000000000006',
     'c1000007-0000-0000-0000-000000000007',
     'c1000008-0000-0000-0000-000000000008',
     'c1000009-0000-0000-0000-000000000009'
   ]::uuid[],
   12, '⭐', '#1D3095', now()),

  (gen_random_uuid(),
   'Texas Surveying Expert',
   'Completed the entire Texas Land Surveying curriculum — all 28 modules across all 9 parts. Full mastery achieved.',
   'certification', NULL,
   ARRAY[
     'c1000001-0000-0000-0000-000000000001',
     'c1000002-0000-0000-0000-000000000002',
     'c1000003-0000-0000-0000-000000000003',
     'c1000004-0000-0000-0000-000000000004',
     'c1000005-0000-0000-0000-000000000005',
     'c1000006-0000-0000-0000-000000000006',
     'c1000007-0000-0000-0000-000000000007',
     'c1000008-0000-0000-0000-000000000008',
     'c1000009-0000-0000-0000-000000000009',
     'c100000a-0000-0000-0000-00000000000a',
     'c100000b-0000-0000-0000-00000000000b',
     'c100000c-0000-0000-0000-00000000000c',
     'c100000d-0000-0000-0000-00000000000d',
     'c100000e-0000-0000-0000-00000000000e',
     'c100000f-0000-0000-0000-00000000000f',
     'c1000010-0000-0000-0000-000000000010',
     'c1000011-0000-0000-0000-000000000011',
     'c1000012-0000-0000-0000-000000000012',
     'c1000013-0000-0000-0000-000000000013',
     'c1000014-0000-0000-0000-000000000014',
     'c1000015-0000-0000-0000-000000000015',
     'c1000016-0000-0000-0000-000000000016',
     'c1000017-0000-0000-0000-000000000017',
     'c1000018-0000-0000-0000-000000000018',
     'c1000019-0000-0000-0000-000000000019',
     'c100001a-0000-0000-0000-00000000001a',
     'c100001b-0000-0000-0000-00000000001b',
     'c100001c-0000-0000-0000-00000000001c'
   ]::uuid[],
   13, '🌟', '#BD1218', now());


-- ============================================================================
-- SECTION 4: PER-MODULE XP CONFIGURATION
-- ============================================================================

-- ============================================
-- SEED DATA: Module XP Config defaults
-- ============================================

-- Default XP values for learning modules by difficulty
INSERT INTO module_xp_config (module_type, module_id, xp_value, expiry_months, difficulty_rating) VALUES
('learning_module', NULL, 500, 18, 3), -- default for any learning module
('fs_module', NULL, 500, 24, 4) -- default for FS prep modules
ON CONFLICT DO NOTHING;

-- ============================================
-- SEED DATA: Per-Module XP Config (all 28 curriculum modules)
-- Beginner = 400 XP, 20-month expiry, rating 2
-- Intermediate = 500 XP, 18-month expiry, rating 3
-- Advanced = 600 XP, 15-month expiry, rating 4
-- Exam Prep = 550 XP, 12-month expiry, rating 4
-- ============================================

-- Part I – Foundations (beginner)
INSERT INTO module_xp_config (module_type, module_id, xp_value, expiry_months, difficulty_rating) VALUES
('learning_module', 'c1000001-0000-0000-0000-000000000001', 400, 20, 2), -- Introduction to Land Surveying
('learning_module', 'c1000002-0000-0000-0000-000000000002', 450, 20, 2), -- Mathematics for Surveyors (higher due to math)
('learning_module', 'c1000003-0000-0000-0000-000000000003', 400, 20, 2), -- Measurements & Error Theory
('learning_module', 'c1000004-0000-0000-0000-000000000004', 400, 20, 2), -- Distance Measurement

-- Part II – Field Techniques (intermediate)
('learning_module', 'c1000005-0000-0000-0000-000000000005', 500, 18, 3), -- Angle and Direction Measurement
('learning_module', 'c1000006-0000-0000-0000-000000000006', 500, 18, 3), -- Leveling and Vertical Control

-- Part III – Coordinate Systems (intermediate)
('learning_module', 'c1000007-0000-0000-0000-000000000007', 550, 18, 3), -- Coordinate Systems and Datums
('learning_module', 'c1000008-0000-0000-0000-000000000008', 550, 18, 3), -- Traverse Computations
('learning_module', 'c1000009-0000-0000-0000-000000000009', 500, 18, 3), -- Area and Volume Computations

-- Part IV – Modern Technology (intermediate/advanced)
('learning_module', 'c100000a-0000-0000-0000-00000000000a', 500, 18, 3), -- Total Stations
('learning_module', 'c100000b-0000-0000-0000-00000000000b', 600, 15, 4), -- GPS/GNSS Surveying
('learning_module', 'c100000c-0000-0000-0000-00000000000c', 600, 15, 4), -- Robotic, Scanning, and UAS

-- Part V – Boundary & Legal (intermediate/advanced)
('learning_module', 'c100000d-0000-0000-0000-00000000000d', 550, 18, 3), -- Boundary Law Principles
('learning_module', 'c100000e-0000-0000-0000-00000000000e', 500, 18, 3), -- Metes and Bounds Descriptions
('learning_module', 'c100000f-0000-0000-0000-00000000000f', 550, 18, 3), -- Texas Land Titles and Records
('learning_module', 'c1000010-0000-0000-0000-000000000010', 600, 15, 4), -- Boundary Retracement and Resolution

-- Part VI – Subdivision, Planning & Construction (intermediate)
('learning_module', 'c1000011-0000-0000-0000-000000000011', 500, 18, 3), -- Subdivision Design and Platting
('learning_module', 'c1000012-0000-0000-0000-000000000012', 500, 18, 3), -- Construction Surveying
('learning_module', 'c1000013-0000-0000-0000-000000000013', 500, 18, 3), -- Topographic and Mapping Surveys

-- Part VII – Specialized (advanced)
('learning_module', 'c1000014-0000-0000-0000-000000000014', 600, 15, 4), -- Geodetic and Control Surveying
('learning_module', 'c1000015-0000-0000-0000-000000000015', 600, 15, 4), -- Hydrographic and Coastal
('learning_module', 'c1000016-0000-0000-0000-000000000016', 550, 15, 4), -- Mining and Industrial

-- Part VIII – Professional Practice (advanced)
('learning_module', 'c1000017-0000-0000-0000-000000000017', 550, 15, 4), -- Survey Business
('learning_module', 'c1000018-0000-0000-0000-000000000018', 600, 15, 4), -- Texas Surveying Law

-- Part IX – Exam Preparation
('learning_module', 'c1000019-0000-0000-0000-000000000019', 550, 12, 4), -- SIT Exam Review — Fundamentals
('learning_module', 'c100001a-0000-0000-0000-00000000001a', 550, 12, 4), -- SIT Exam Review — Advanced
('learning_module', 'c100001b-0000-0000-0000-00000000001b', 600, 12, 5), -- RPLS Review — Jurisprudence
('learning_module', 'c100001c-0000-0000-0000-00000000001c', 600, 12, 5)  -- RPLS Review — Practical
ON CONFLICT DO NOTHING;

-- ============================================
-- SEED DATA: FS Prep Module XP Config (8 modules)
-- All FS prep modules = 500 XP each, 24-month expiry
-- ============================================

INSERT INTO module_xp_config (module_type, module_id, xp_value, expiry_months, difficulty_rating) VALUES
('fs_module', 'f5000001-0000-0000-0000-000000000001', 450, 24, 3), -- FS Module 1
('fs_module', 'f5000002-0000-0000-0000-000000000002', 500, 24, 4), -- FS Module 2
('fs_module', 'f5000003-0000-0000-0000-000000000003', 500, 24, 4), -- FS Module 3
('fs_module', 'f5000004-0000-0000-0000-000000000004', 500, 24, 4), -- FS Module 4
('fs_module', 'f5000005-0000-0000-0000-000000000005', 500, 24, 4), -- FS Module 5
('fs_module', 'f5000006-0000-0000-0000-000000000006', 550, 24, 4), -- FS Module 6
('fs_module', 'f5000007-0000-0000-0000-000000000007', 500, 24, 4), -- FS Module 7
('fs_module', 'f5000008-0000-0000-0000-000000000008', 500, 24, 4)  -- FS Module 8
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 5: WELCOME LESSON
-- ============================================================================

INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, status, tags, resources, videos) VALUES
('22222222-2222-2222-2222-222222222200',
 'c1000001-0000-0000-0000-000000000001',
 'Welcome to Starr Surveying',
 '<h2>Welcome to the Starr Surveying Learning Hub</h2>
<p>Welcome to the team! Whether you''re a brand-new surveying intern (SIT) or a seasoned field veteran joining our company, this learning platform is designed to help you grow your skills, prepare for licensing exams, and stay up-to-date with best practices.</p>

<h3>What You''ll Learn Here</h3>
<p>This platform covers everything you need to succeed as a surveyor at Starr Surveying:</p>
<ul>
  <li><strong>Fundamentals of Land Surveying</strong> — History, terminology, types of surveys, and core concepts</li>
  <li><strong>Equipment & Technology</strong> — Total stations, GNSS/GPS, data collectors, and modern tools</li>
  <li><strong>Texas-Specific Knowledge</strong> — Texas property law, the vara, GLO records, and state regulations</li>
  <li><strong>Field Procedures</strong> — How we conduct boundary surveys, topographic surveys, and construction layout</li>
  <li><strong>Exam Preparation</strong> — Practice questions for the SIT and RPLS licensing exams</li>
</ul>

<h3>How This Works</h3>
<p>Each module contains <strong>lessons</strong> you can read through at your own pace. After each lesson, you can:</p>
<ul>
  <li><strong>Take a Quiz</strong> — Test your understanding of the material</li>
  <li><strong>Study Flashcards</strong> — Review key terms with our spaced repetition system that adapts to how well you know each term</li>
  <li><strong>Read Knowledge Base Articles</strong> — Dive deeper into specific topics</li>
  <li><strong>Take Notes</strong> — Use your Field Notebook to jot down observations and reminders</li>
</ul>

<h3>Getting Started</h3>
<p>Start with the next lesson, <strong>"What is Land Surveying?"</strong>, to learn the basics. If you already have surveying experience, feel free to jump ahead to the topics that interest you or go straight to the flashcards and quiz sections.</p>

<h3>About Starr Surveying</h3>
<p>Starr Surveying is committed to providing accurate, professional land surveying services. Our team uses the latest technology — including Trimble instruments, GNSS receivers, and CAD software — to deliver high-quality results. We believe in continuous learning and professional development, which is why we built this platform for our team.</p>

<p><strong>Let''s get started!</strong></p>',
 ARRAY[
   'The Learning Hub covers fundamentals, equipment, Texas law, field procedures, and exam prep',
   'Use flashcards with spaced repetition to master surveying terminology',
   'Quiz yourself after each lesson to test your understanding',
   'Take notes in your Field Notebook as you learn'
 ],
 0, 10, 'published',
 ARRAY['welcome','introduction','getting started'],
 '[]', '[]'
);

-- Topics for Welcome lesson
INSERT INTO learning_topics (lesson_id, title, content, order_index, keywords) VALUES
('22222222-2222-2222-2222-222222222200', 'Learning Hub Overview', 'The Starr Surveying Learning Hub contains modules, lessons, flashcards, quizzes, and a knowledge base. Each module focuses on a topic area and contains multiple lessons.', 1, ARRAY['learning hub','overview','modules']),
('22222222-2222-2222-2222-222222222200', 'Study Tools Available', 'Flashcards use SM-2 spaced repetition to optimize your review schedule. Quizzes test your knowledge. The Field Notebook lets you record observations. The Knowledge Base provides in-depth articles.', 2, ARRAY['flashcards','quizzes','notebook','knowledge base']),
('22222222-2222-2222-2222-222222222200', 'Career Paths in Surveying', 'In Texas, the licensing path goes: Surveyor Intern (SIT) then Registered Professional Land Surveyor (RPLS). The SIT exam tests fundamental knowledge, while the RPLS exam covers Texas law and advanced practice.', 3, ARRAY['SIT','RPLS','licensing','career']);

-- ============================================================================
-- SECTION 6: FLASHCARDS (Company-wide built-in cards)
-- ============================================================================

INSERT INTO flashcards (term, definition, hint_1, hint_2, hint_3, module_id, keywords, tags, category) VALUES

-- Legal & Property Terms
('Deed', 'A legal document that transfers ownership of real property from one party to another. In Texas, deeds are recorded at the county clerk''s office.', 'This document proves who owns a piece of land', 'Rhymes with "need" and "speed"', 'D _ _ _ (4 letters, transfers property)', 'c1000001-0000-0000-0000-000000000001', ARRAY['deed','property','legal'], ARRAY['legal','property law'], 'legal'),

('Easement', 'A legal right to use another person''s land for a specific purpose, such as utility lines, drainage, or access.', 'Utility companies often need these to run power lines', 'Think of it as permission to "ease" through someone''s property', 'E _ _ _ _ _ _ _ (8 letters, a right to use land)', 'c1000001-0000-0000-0000-000000000001', ARRAY['easement','legal','access'], ARRAY['legal','easements'], 'legal'),

('Monument', 'A physical marker placed at a survey point, such as an iron rod, concrete marker, or natural feature like a tree or rock.', 'Something permanent placed in the ground at a corner', 'Could be an iron rod, a stone, or even a large tree', 'M _ _ _ _ _ _ _ (8 letters, a physical marker)', 'c1000001-0000-0000-0000-000000000001', ARRAY['monument','marker','corner'], ARRAY['fieldwork','boundary'], 'fieldwork'),

('Chain of Title', 'The sequence of historical transfers of title (ownership) to a property, from the original grant to the current owner.', 'Like a family tree, but for land ownership', 'Traces who owned a property and when it changed hands', 'C _ _ _ _ of T _ _ _ _ (ownership history)', 'c1000001-0000-0000-0000-000000000001', ARRAY['chain of title','ownership','deed'], ARRAY['legal','property law'], 'legal'),

('Encroachment', 'When a structure, fence, or improvement extends onto an adjacent property without permission.', 'When something crosses over a property line that shouldn''t', 'A fence built 2 feet into your neighbor''s yard is this', 'E _ _ _ _ _ _ _ _ _ _ _ (12 letters, crossing boundary)', 'c1000001-0000-0000-0000-000000000001', ARRAY['encroachment','boundary','dispute'], ARRAY['legal','boundary'], 'legal'),

-- Measurement & Math Terms
('Bearing', 'A direction expressed as an angle from North or South, like N 45° E. Always starts with N or S and ends with E or W.', 'A way to describe compass direction with an angle', 'Always measured from North or South toward East or West', 'B _ _ _ _ _ _ (7 letters, N 45° E is an example)', 'c1000001-0000-0000-0000-000000000001', ARRAY['bearing','direction','angle'], ARRAY['measurement','navigation'], 'measurement'),

('Traverse', 'A series of connected survey lines whose lengths and directions are measured. Used to establish control networks.', 'A path of connected survey points forming a network', 'Think of it as connecting the dots from point to point', 'T _ _ _ _ _ _ _ (8 letters, connected survey lines)', 'c1000001-0000-0000-0000-000000000001', ARRAY['traverse','control','measurement'], ARRAY['measurement','fieldwork'], 'measurement'),

('Closure', 'The degree to which a traverse returns to its starting point. Good closure means the survey is accurate.', 'How close a survey loop comes back to where it started', 'If you walk in a loop and end up exactly where you began', 'C _ _ _ _ _ _ (7 letters, traverse accuracy check)', 'c1000001-0000-0000-0000-000000000001', ARRAY['closure','traverse','accuracy'], ARRAY['measurement','quality'], 'measurement'),

('Elevation', 'The vertical height of a point above a reference datum, typically mean sea level (NAVD88 in the US).', 'How high something is above sea level', 'Mountains have high ones, valleys have low ones', 'E _ _ _ _ _ _ _ _ (9 letters, height above datum)', 'c1000001-0000-0000-0000-000000000001', ARRAY['elevation','height','datum'], ARRAY['measurement','vertical'], 'measurement'),

('Datum', 'A reference system used for measuring positions on the earth. Common datums include NAD83 (horizontal) and NAVD88 (vertical).', 'The baseline reference that all measurements are compared to', 'NAD83 and NAVD88 are common examples in the US', 'D _ _ _ _ (5 letters, a reference system)', 'c1000001-0000-0000-0000-000000000001', ARRAY['datum','reference','NAD83','NAVD88'], ARRAY['measurement','geodesy'], 'measurement'),

-- Equipment Terms
('Prism', 'A glass reflector used with total stations. It reflects the EDM signal back to the instrument for distance measurement.', 'A glass device that bounces a signal back to the total station', 'Usually mounted on a pole held by the rod person', 'P _ _ _ _ (5 letters, reflects EDM signal)', 'c1000001-0000-0000-0000-000000000001', ARRAY['prism','EDM','total station','reflector'], ARRAY['equipment'], 'equipment'),

('RTK', 'Real-Time Kinematic — a GPS/GNSS technique that provides centimeter-level accuracy using corrections from a base station.', 'A technique that makes GPS super accurate in real-time', 'Uses a base station to correct the rover''s position', 'R _ _ (3 letters, centimeter GPS accuracy)', 'c1000001-0000-0000-0000-000000000001', ARRAY['RTK','GPS','GNSS','accuracy'], ARRAY['technology','equipment'], 'technology'),

('EDM', 'Electronic Distance Measurement — technology that measures distance using electromagnetic waves (infrared or laser).', 'Measures distance by sending a signal and timing the return', 'Built into every total station', 'E _ _ (3 letters, electronic distance tool)', 'c1000001-0000-0000-0000-000000000001', ARRAY['EDM','distance','electronic'], ARRAY['equipment','technology'], 'equipment'),

('Level', 'A surveying instrument used to establish a horizontal line of sight, primarily for determining elevation differences between points.', 'Creates a perfectly horizontal line for measuring height differences', 'Used with a level rod to measure elevations', 'L _ _ _ _ (5 letters, measures elevation differences)', 'c1000001-0000-0000-0000-000000000001', ARRAY['level','elevation','horizontal'], ARRAY['equipment'], 'equipment'),

('Theodolite', 'A precision instrument for measuring horizontal and vertical angles. Modern electronic versions are part of total stations.', 'Measures angles both horizontally and vertically', 'The angle-measuring part of a total station', 'T _ _ _ _ _ _ _ _ _ (10 letters, measures angles)', 'c1000001-0000-0000-0000-000000000001', ARRAY['theodolite','angles','instrument'], ARRAY['equipment'], 'equipment'),

-- Texas-Specific Terms
('GLO', 'The Texas General Land Office — the oldest state agency in Texas (est. 1836). Manages public lands and maintains historical survey records.', 'The oldest state agency in Texas, manages land records', 'Their archives have original Spanish and Mexican land grants', 'G _ _ (3 letters, Texas land office)', 'c1000001-0000-0000-0000-000000000001', ARRAY['GLO','Texas','land office','records'], ARRAY['texas','legal'], 'texas'),

('Abstract', 'In Texas, a numbered land grant parcel originating from the original surveys. Each county has its own abstract numbering.', 'A numbered parcel from the original Texas land grants', 'Each county has its own numbering system for these', 'A _ _ _ _ _ _ _ (8 letters, Texas land grant parcel)', 'c1000001-0000-0000-0000-000000000001', ARRAY['abstract','Texas','land grant','parcel'], ARRAY['texas','legal'], 'texas'),

('RPLS', 'Registered Professional Land Surveyor — the Texas license required to practice land surveying and certify surveys.', 'The license you need to sign and seal survey documents in Texas', 'Requires passing an exam and getting experience hours', 'R _ _ _ (4 letters, Texas surveyor license)', 'c1000001-0000-0000-0000-000000000001', ARRAY['RPLS','license','Texas','professional'], ARRAY['licensing','texas'], 'licensing'),

('SIT', 'Surveyor Intern in Texas — the first step toward becoming a Registered Professional Land Surveyor (RPLS).', 'The first surveying license step in Texas, before RPLS', 'You need to pass an exam to get this designation', 'S _ _ (3 letters, surveyor intern title)', 'c1000001-0000-0000-0000-000000000001', ARRAY['SIT','intern','Texas','licensing'], ARRAY['licensing','texas'], 'licensing'),

-- Fieldwork Terms
('Backsight', 'A survey observation made to a previously established point. Used to orient the instrument before taking new measurements.', 'Looking back at a known point to set up your instrument', 'You do this first to orient the total station', 'B _ _ _ _ _ _ _ _ (9 letters, sighting a known point)', 'c1000001-0000-0000-0000-000000000001', ARRAY['backsight','orientation','total station'], ARRAY['fieldwork','procedure'], 'fieldwork'),

('Foresight', 'A survey observation made to an unknown point you want to measure. Taken after orienting with a backsight.', 'Looking forward to a new point you want to measure', 'The opposite of a backsight', 'F _ _ _ _ _ _ _ _ (9 letters, measuring a new point)', 'c1000001-0000-0000-0000-000000000001', ARRAY['foresight','measurement','total station'], ARRAY['fieldwork','procedure'], 'fieldwork'),

('Stakeout', 'The process of marking planned positions in the field, such as building corners, road centerlines, or lot corners.', 'Putting marks in the ground where things should be built', 'Construction crews need this to know where to build', 'S _ _ _ _ _ _ _ (8 letters, marking planned points)', 'c1000001-0000-0000-0000-000000000001', ARRAY['stakeout','construction','layout'], ARRAY['fieldwork','construction'], 'fieldwork'),

('Control Point', 'A survey point with precisely known coordinates used as a reference for other measurements.', 'A precisely known location that other measurements are based on', 'Often a brass disk set in concrete', 'C _ _ _ _ _ _ P _ _ _ _ (reference location)', 'c1000001-0000-0000-0000-000000000001', ARRAY['control point','reference','coordinates'], ARRAY['fieldwork','measurement'], 'fieldwork');

-- ============================================================================
-- SECTION 7: KNOWLEDGE BASE ARTICLES (with module links)
-- ============================================================================

-- Articles now include module_id and xp_reward for linking to curriculum
INSERT INTO kb_articles (title, slug, category, tags, content, excerpt, status, module_id, xp_reward) VALUES

('Understanding Bearings and Azimuths', 'bearings-and-azimuths', 'Measurement & Calculations', ARRAY['bearing','azimuth','direction','angles'],
'<h2>Bearings vs. Azimuths</h2>
<p>Both bearings and azimuths describe horizontal directions, but they use different reference systems.</p>
<h3>Azimuths</h3>
<p>An <strong>azimuth</strong> is measured clockwise from north, ranging from 0° to 360°. For example, due East is 90°, due South is 180°, due West is 270°.</p>
<h3>Bearings</h3>
<p>A <strong>bearing</strong> is expressed as an angle from either North or South, toward East or West. The format is: N/S [angle] E/W. For example:</p>
<ul>
<li>N 45° E = Azimuth 45°</li>
<li>S 30° E = Azimuth 150°</li>
<li>S 60° W = Azimuth 240°</li>
<li>N 80° W = Azimuth 280°</li>
</ul>
<h3>Converting Between Them</h3>
<p><strong>NE quadrant:</strong> Azimuth = Bearing angle<br/>
<strong>SE quadrant:</strong> Azimuth = 180° - Bearing angle<br/>
<strong>SW quadrant:</strong> Azimuth = 180° + Bearing angle<br/>
<strong>NW quadrant:</strong> Azimuth = 360° - Bearing angle</p>',
'Learn the difference between bearings and azimuths, two systems for describing horizontal direction.', 'published',
'c1000005-0000-0000-0000-000000000005', 25),

('What is a Boundary Survey?', 'what-is-a-boundary-survey', 'Survey Types', ARRAY['boundary','survey','property lines','corners'],
'<h2>Boundary Surveys</h2>
<p>A <strong>boundary survey</strong> determines the legal boundary lines and corners of a parcel of land. It is the most common type of survey performed.</p>
<h3>When You Need One</h3>
<ul>
<li>Buying or selling property</li>
<li>Building a fence along property lines</li>
<li>Resolving a boundary dispute with a neighbor</li>
<li>Subdividing a parcel</li>
<li>Building near the property line (setback verification)</li>
</ul>
<h3>What''s Involved</h3>
<p>The surveyor will:</p>
<ol>
<li><strong>Research</strong> — Examine deeds, plats, and prior surveys at the county courthouse</li>
<li><strong>Fieldwork</strong> — Locate existing monuments, measure distances and angles</li>
<li><strong>Analysis</strong> — Compare field evidence with legal descriptions</li>
<li><strong>Set Corners</strong> — Place new iron rods or caps where needed</li>
<li><strong>Prepare Plat</strong> — Draw the survey map showing all findings</li>
</ol>',
'A boundary survey determines legal property lines and corners. Learn when you need one and what''s involved.', 'published',
'c100000d-0000-0000-0000-00000000000d', 25),

('Introduction to GNSS/GPS for Surveyors', 'gnss-gps-for-surveyors', 'Technology', ARRAY['GNSS','GPS','RTK','satellite','technology'],
'<h2>GNSS for Land Surveyors</h2>
<p><strong>GNSS</strong> (Global Navigation Satellite System) encompasses multiple satellite constellations:</p>
<ul>
<li><strong>GPS</strong> (USA) — 31 satellites</li>
<li><strong>GLONASS</strong> (Russia) — 24 satellites</li>
<li><strong>Galileo</strong> (European Union) — 30 satellites</li>
<li><strong>BeiDou</strong> (China) — 35+ satellites</li>
</ul>
<h3>How RTK Works</h3>
<p><strong>RTK</strong> (Real-Time Kinematic) is the primary GNSS technique for surveying because it provides centimeter-level accuracy:</p>
<ol>
<li>A <strong>base station</strong> sits on a known point and calculates correction data</li>
<li>Corrections are sent to the <strong>rover</strong> via radio or cellular network</li>
<li>The rover applies corrections to achieve 1-2 cm accuracy</li>
</ol>
<h3>When to Use GNSS vs Total Station</h3>
<p>Use GNSS when you have open sky and need to cover large areas. Use a total station when working under trees, near buildings, or when you need sub-centimeter accuracy.</p>',
'Learn how GNSS satellite systems work for surveying and when to use RTK vs total stations.', 'published',
'c100000b-0000-0000-0000-00000000000b', 25);

-- ============================================================================
-- SECTION 8: ARTICLE QUIZ QUESTIONS
-- (Questions linked to KB articles via article_id for earning article XP)
-- ============================================================================

-- Link quiz questions to articles so students earn XP by reading + passing quiz
-- These reference the KB articles created above by slug lookup

-- Questions for "Understanding Bearings and Azimuths"
INSERT INTO question_bank (question_text, question_type, options, correct_answer, explanation, difficulty, exam_category, tags,
  article_id)
SELECT
  q.question_text, q.question_type, q.options::jsonb, q.correct_answer, q.explanation, q.difficulty, 'article-quiz', q.tags,
  a.id
FROM (VALUES
  ('What is the azimuth equivalent of the bearing S 60° W?', 'multiple_choice',
   '["120°","240°","300°","60°"]', '240°',
   'For SW quadrant: Azimuth = 180° + Bearing angle = 180° + 60° = 240°.',
   'easy', ARRAY['bearing','azimuth','conversion']),
  ('An azimuth of 315° corresponds to which bearing?', 'multiple_choice',
   '["N 45° W","S 45° W","N 45° E","S 45° E"]', 'N 45° W',
   'Azimuth 315° is in the NW quadrant (270-360). Bearing = 360° - 315° = 45° from North toward West = N 45° W.',
   'easy', ARRAY['bearing','azimuth','conversion']),
  ('Bearings are always measured from which reference line?', 'multiple_choice',
   '["The East-West line","The North or South line","Any convenient line","The magnetic declination line"]', 'The North or South line',
   'Bearings are always measured from the North or South line toward East or West. The maximum bearing angle is 90°.',
   'easy', ARRAY['bearing','direction'])
) AS q(question_text, question_type, options, correct_answer, explanation, difficulty, tags)
CROSS JOIN kb_articles a WHERE a.slug = 'bearings-and-azimuths';

-- Questions for "What is a Boundary Survey?"
INSERT INTO question_bank (question_text, question_type, options, correct_answer, explanation, difficulty, exam_category, tags,
  article_id)
SELECT
  q.question_text, q.question_type, q.options::jsonb, q.correct_answer, q.explanation, q.difficulty, 'article-quiz', q.tags,
  a.id
FROM (VALUES
  ('Which of these is NOT a typical reason for needing a boundary survey?', 'multiple_choice',
   '["Buying property","Building a fence on the property line","Checking soil composition","Resolving a boundary dispute"]',
   'Checking soil composition',
   'Soil composition testing is done by geotechnical engineers, not boundary surveyors. Boundary surveys establish legal property lines.',
   'easy', ARRAY['boundary','survey-types']),
  ('What is the correct order of steps in a boundary survey?', 'multiple_choice',
   '["Fieldwork, Research, Analysis, Set Corners","Research, Fieldwork, Analysis, Set Corners","Set Corners, Fieldwork, Research, Analysis","Analysis, Research, Fieldwork, Set Corners"]',
   'Research, Fieldwork, Analysis, Set Corners',
   'A boundary survey begins with research (deeds, plats), then fieldwork (measurements), analysis (comparing evidence), and finally setting corners.',
   'medium', ARRAY['boundary','procedure'])
) AS q(question_text, question_type, options, correct_answer, explanation, difficulty, tags)
CROSS JOIN kb_articles a WHERE a.slug = 'what-is-a-boundary-survey';

-- Questions for "Introduction to GNSS/GPS for Surveyors"
INSERT INTO question_bank (question_text, question_type, options, correct_answer, explanation, difficulty, exam_category, tags,
  article_id)
SELECT
  q.question_text, q.question_type, q.options::jsonb, q.correct_answer, q.explanation, q.difficulty, 'article-quiz', q.tags,
  a.id
FROM (VALUES
  ('Which GNSS constellation is operated by the European Union?', 'multiple_choice',
   '["GPS","GLONASS","Galileo","BeiDou"]', 'Galileo',
   'Galileo is the EU GNSS. GPS is US, GLONASS is Russia, BeiDou is China.',
   'easy', ARRAY['GNSS','constellation']),
  ('RTK surveying achieves approximately what level of accuracy?', 'multiple_choice',
   '["1-2 meters","1-2 centimeters","1-2 millimeters","10-20 centimeters"]', '1-2 centimeters',
   'RTK (Real-Time Kinematic) provides centimeter-level accuracy (1-2 cm) using real-time corrections from a base station.',
   'easy', ARRAY['RTK','accuracy']),
  ('When should you use a total station instead of GNSS?', 'multiple_choice',
   '["In open fields","When covering large areas","Under tree canopy or near buildings","When working alone"]',
   'Under tree canopy or near buildings',
   'GNSS requires clear sky view to satellites. Under trees, near buildings, or in urban canyons, a total station is preferred.',
   'medium', ARRAY['GNSS','total-station','equipment'])
) AS q(question_text, question_type, options, correct_answer, explanation, difficulty, tags)
CROSS JOIN kb_articles a WHERE a.slug = 'gnss-gps-for-surveyors';

COMMIT;
