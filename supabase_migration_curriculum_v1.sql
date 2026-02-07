-- ============================================================================
-- STARR Surveying — Texas Land Surveying Curriculum Seed Migration (v1)
-- ============================================================================
-- This migration seeds a complete 28-module Texas Land Surveying curriculum
-- into the existing learning_modules and learning_lessons tables, and creates
-- two new tables: curriculum_milestones and user_milestone_progress.
--
-- SAFE TO RE-RUN:
--   • Modules use INSERT ... ON CONFLICT (id) DO UPDATE (upsert).
--   • Lessons are DELETE + INSERT per module.
--   • Milestones are DELETE + INSERT.
--   • New tables use CREATE TABLE IF NOT EXISTS.
--
-- Module UUIDs are deterministic: c10000XX-0000-0000-0000-0000000000XX
-- where XX is the module number in hexadecimal (01–1c).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CREATE NEW TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS curriculum_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  milestone_type TEXT NOT NULL CHECK (milestone_type IN ('part_complete', 'exam_ready', 'certification')),
  part_number INTEGER,
  required_module_ids UUID[],
  order_index INTEGER NOT NULL,
  icon TEXT,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_milestone_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  milestone_id UUID NOT NULL REFERENCES curriculum_milestones(id) ON DELETE CASCADE,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_email, milestone_id)
);

-- ============================================================================
-- 2. UPSERT ALL 28 MODULES
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
-- 3. LESSONS — DELETE existing, then INSERT fresh per module
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
-- 4. CURRICULUM MILESTONES — DELETE existing, then INSERT fresh
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

COMMIT;
