-- ============================================================================
-- 010_curriculum.sql
-- Core Starr Surveying curriculum: 28 learning modules with lessons, topics,
-- flashcards, and quiz questions.
-- Depends on: 001_config.sql
-- ============================================================================
--
-- Contents:
--   1. 28 Learning Modules (Texas Land Surveying curriculum)
--   2. 160+ Learning Lessons (across all 28 modules)
--      - Welcome lesson has HTML content with content_migrated = TRUE
--   3. Learning Topics (for welcome lesson)
--   4. Flashcards (company/built-in cards linked to modules)
--   5. Article Quiz Questions (linked to kb_articles via slug lookup)
--
-- Excluded (handled by other seed files):
--   - kb_articles           -> 060_articles.sql
--   - curriculum_milestones -> 080_milestones.sql
--   - module_xp_config      -> 080_milestones.sql
--
-- This file is idempotent: uses ON CONFLICT DO NOTHING and
-- delete-then-insert patterns where appropriate.
-- ============================================================================

BEGIN;


-- ============================================================================
-- SECTION 1: LEARNING MODULES (28 modules)
-- ============================================================================


-- ---- Part I - Foundations of Land Surveying --------------------------------

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

-- ---- Part II - Field Surveying Techniques ----------------------------------

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

-- ---- Part III - Coordinate Systems & Computations --------------------------

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

-- ---- Part IV - Modern Survey Technology ------------------------------------

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

-- ---- Part V - Boundary & Legal Surveying -----------------------------------

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

-- ---- Part VI - Subdivision, Planning & Construction ------------------------

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

-- ---- Part VII - Specialized Surveying --------------------------------------

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

-- ---- Part VIII - Professional Practice -------------------------------------

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

-- ---- Part IX - Exam Preparation --------------------------------------------

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
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c1000001-0000-0000-0000-000000000001' AND id <> ALL (ARRAY['22222222-2222-2222-2222-222222222200', '4bf81c35-abfe-4431-9a09-6941789520cb', '0d4cdb00-24c3-4f32-895c-8979d6babe3d', 'f1457d76-60f4-4152-ab1b-d4751101acac', '05a5c66e-807e-4635-a20d-7cd116d829c4', '10a4dc63-93e3-4ba5-b6bb-d420617b01de', '68cfb0d8-ffa2-429a-8a66-01c6d3264403']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('4bf81c35-abfe-4431-9a09-6941789520cb', 'c1000001-0000-0000-0000-000000000001', 'What Is Land Surveying?', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','history','profession'], 'published'),
  ('0d4cdb00-24c3-4f32-895c-8979d6babe3d', 'c1000001-0000-0000-0000-000000000001', 'Brief History of Surveying (Ancient to Modern)', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','history','profession'], 'published'),
  ('f1457d76-60f4-4152-ab1b-d4751101acac', 'c1000001-0000-0000-0000-000000000001', 'The Role of the Modern Land Surveyor', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','history','profession'], 'published'),
  ('05a5c66e-807e-4635-a20d-7cd116d829c4', 'c1000001-0000-0000-0000-000000000001', 'Land Surveying in Texas — Overview', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','history','profession'], 'published'),
  ('10a4dc63-93e3-4ba5-b6bb-d420617b01de', 'c1000001-0000-0000-0000-000000000001', 'Licensing Path: SIT → RPLS', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','history','profession'], 'published'),
  ('68cfb0d8-ffa2-429a-8a66-01c6d3264403', 'c1000001-0000-0000-0000-000000000001', 'Ethics and Professional Responsibility', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','history','profession'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 2: Mathematics for Surveyors (8 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c1000002-0000-0000-0000-000000000002' AND id <> ALL (ARRAY['02ce6947-ebfd-40ed-8ee9-30aae4331968', '24f0890d-d4b8-4d6c-b287-009d76f7502d', 'f3f20b2d-c28f-46d7-a20b-bea06201b1fc', '7dbd1cd4-2b1b-4d8d-850a-9c338ac3587a', '8339b9ef-a60e-4fd7-9ffd-220e2250bb7e', '068b86a9-cc98-457b-8479-2ab60d011ad1', '392e4287-7043-44e7-8bc0-b81d423c933b', '7669b3eb-ea77-478b-9d58-d2eff6eb4302']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('02ce6947-ebfd-40ed-8ee9-30aae4331968', 'c1000002-0000-0000-0000-000000000002', 'Review of Algebra and Geometry Basics', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','math','trigonometry'], 'published'),
  ('24f0890d-d4b8-4d6c-b287-009d76f7502d', 'c1000002-0000-0000-0000-000000000002', 'Trigonometric Functions and Identities', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','math','trigonometry'], 'published'),
  ('f3f20b2d-c28f-46d7-a20b-bea06201b1fc', 'c1000002-0000-0000-0000-000000000002', 'Right Triangle Solutions in Surveying', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','math','trigonometry'], 'published'),
  ('7dbd1cd4-2b1b-4d8d-850a-9c338ac3587a', 'c1000002-0000-0000-0000-000000000002', 'Oblique Triangle Solutions', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','math','trigonometry'], 'published'),
  ('8339b9ef-a60e-4fd7-9ffd-220e2250bb7e', 'c1000002-0000-0000-0000-000000000002', 'Coordinate Geometry (COGO) Fundamentals', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','math','trigonometry'], 'published'),
  ('068b86a9-cc98-457b-8479-2ab60d011ad1', 'c1000002-0000-0000-0000-000000000002', 'Unit Conversions (Feet, Meters, Chains, Varas)', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','math','trigonometry'], 'published'),
  ('392e4287-7043-44e7-8bc0-b81d423c933b', 'c1000002-0000-0000-0000-000000000002', 'Area Computation Methods', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','math','trigonometry'], 'published'),
  ('7669b3eb-ea77-478b-9d58-d2eff6eb4302', 'c1000002-0000-0000-0000-000000000002', 'Practical Math Problem Sets', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','math','trigonometry'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 3: Surveying Measurements & Error Theory (7 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c1000003-0000-0000-0000-000000000003' AND id <> ALL (ARRAY['5e9763a8-6772-4fcf-866f-5c61b1d525cf', '9442daa4-8a0c-4b34-90f7-80304ebb0e20', 'b1466895-7138-43f6-8f99-8565d7b42962', 'eafbffa3-948b-4bf6-a2d8-8d7effc3bcf7', '190ebc35-c5e8-4479-8f39-77c6e490d034', '703631b0-5d21-4272-b25a-9577c8a3bc05', '4ae68562-9fd5-4869-8dca-f3c50cc77f9d']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('5e9763a8-6772-4fcf-866f-5c61b1d525cf', 'c1000003-0000-0000-0000-000000000003', 'Principles of Measurement', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','measurements','errors'], 'published'),
  ('9442daa4-8a0c-4b34-90f7-80304ebb0e20', 'c1000003-0000-0000-0000-000000000003', 'Types of Errors (Systematic, Random, Blunders)', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','measurements','errors'], 'published'),
  ('b1466895-7138-43f6-8f99-8565d7b42962', 'c1000003-0000-0000-0000-000000000003', 'Precision vs. Accuracy', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','measurements','errors'], 'published'),
  ('eafbffa3-948b-4bf6-a2d8-8d7effc3bcf7', 'c1000003-0000-0000-0000-000000000003', 'Significant Figures and Rounding', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','measurements','errors'], 'published'),
  ('190ebc35-c5e8-4479-8f39-77c6e490d034', 'c1000003-0000-0000-0000-000000000003', 'Error Propagation', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','measurements','errors'], 'published'),
  ('703631b0-5d21-4272-b25a-9577c8a3bc05', 'c1000003-0000-0000-0000-000000000003', 'Least Squares Concepts (Intro)', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','measurements','errors'], 'published'),
  ('4ae68562-9fd5-4869-8dca-f3c50cc77f9d', 'c1000003-0000-0000-0000-000000000003', 'Field Procedures to Minimize Error', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['foundations','measurements','errors'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 4: Distance Measurement (6 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c1000004-0000-0000-0000-000000000004' AND id <> ALL (ARRAY['dd80fdee-9e6a-4c38-96a9-6ec37a904f1f', '7d61396a-75c3-44f8-930a-e6f2ac1f41c6', 'f1bf8489-e37f-4890-ae22-325b45c620a5', '783b9d3b-5780-4407-9509-c3bcde73befa', '15429f36-9c5d-4644-9cf4-1e66d0a7c08d', '7e79f9a9-1002-4a2f-a3cd-cd05220b8349']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('dd80fdee-9e6a-4c38-96a9-6ec37a904f1f', 'c1000004-0000-0000-0000-000000000004', 'Taping and Chaining', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','distance','measurement'], 'published'),
  ('7d61396a-75c3-44f8-930a-e6f2ac1f41c6', 'c1000004-0000-0000-0000-000000000004', 'Electronic Distance Measurement (EDM)', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','distance','measurement'], 'published'),
  ('f1bf8489-e37f-4890-ae22-325b45c620a5', 'c1000004-0000-0000-0000-000000000004', 'Total Station Distance Measurement', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','distance','measurement'], 'published'),
  ('783b9d3b-5780-4407-9509-c3bcde73befa', 'c1000004-0000-0000-0000-000000000004', 'Slope, Horizontal, and Vertical Distances', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','distance','measurement'], 'published'),
  ('15429f36-9c5d-4644-9cf4-1e66d0a7c08d', 'c1000004-0000-0000-0000-000000000004', 'Distance Corrections (Temperature, Sag, Tension)', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','distance','measurement'], 'published'),
  ('7e79f9a9-1002-4a2f-a3cd-cd05220b8349', 'c1000004-0000-0000-0000-000000000004', 'Practical Distance Measurement Exercises', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','distance','measurement'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 5: Angle and Direction Measurement (7 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c1000005-0000-0000-0000-000000000005' AND id <> ALL (ARRAY['2e7ffe0e-8ca6-4c6b-a6db-c27bbc115164', 'c0abf49c-78a1-497a-b4f4-427c90319178', '133cf579-5d6e-49f3-bdc0-11f5de4b16ac', '83899224-d0dd-440a-a695-522f4c8e3d7a', 'fbe8386b-52f3-468e-a894-7b3a566b2b5a', '3f2a6213-5906-470f-870f-434dabb90125', '007fdc47-4461-4e9f-92e5-de7e1228c23f']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('2e7ffe0e-8ca6-4c6b-a6db-c27bbc115164', 'c1000005-0000-0000-0000-000000000005', 'Horizontal Angle Measurement', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','angles','directions','bearings'], 'published'),
  ('c0abf49c-78a1-497a-b4f4-427c90319178', 'c1000005-0000-0000-0000-000000000005', 'Vertical Angle Measurement', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','angles','directions','bearings'], 'published'),
  ('133cf579-5d6e-49f3-bdc0-11f5de4b16ac', 'c1000005-0000-0000-0000-000000000005', 'Bearings and Azimuths', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','angles','directions','bearings'], 'published'),
  ('83899224-d0dd-440a-a695-522f4c8e3d7a', 'c1000005-0000-0000-0000-000000000005', 'Compass and Magnetic Declination', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','angles','directions','bearings'], 'published'),
  ('fbe8386b-52f3-468e-a894-7b3a566b2b5a', 'c1000005-0000-0000-0000-000000000005', 'Deflection Angles and Interior Angles', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','angles','directions','bearings'], 'published'),
  ('3f2a6213-5906-470f-870f-434dabb90125', 'c1000005-0000-0000-0000-000000000005', 'Angle Balancing and Adjustment', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','angles','directions','bearings'], 'published'),
  ('007fdc47-4461-4e9f-92e5-de7e1228c23f', 'c1000005-0000-0000-0000-000000000005', 'Direction Computation Exercises', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','angles','directions','bearings'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 6: Leveling and Vertical Control (7 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c1000006-0000-0000-0000-000000000006' AND id <> ALL (ARRAY['757aea26-6c36-463a-9fa7-67243b0cdf5b', '26c31d15-d0aa-495a-b954-79e07133f0d2', '23b640e3-b819-4f1b-88de-49b8fb3003be', 'fd4b3508-a1ac-46ec-9210-632757407f8e', '0ca1c9a9-5739-4c26-9694-9c93de7311ef', '1e3bdc32-d674-4349-908e-41b96cf04b04', '911b6af8-808a-4c04-9bd2-7deffb3be294']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('757aea26-6c36-463a-9fa7-67243b0cdf5b', 'c1000006-0000-0000-0000-000000000006', 'Principles of Leveling', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','leveling','elevation'], 'published'),
  ('26c31d15-d0aa-495a-b954-79e07133f0d2', 'c1000006-0000-0000-0000-000000000006', 'Differential Leveling Procedures', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','leveling','elevation'], 'published'),
  ('23b640e3-b819-4f1b-88de-49b8fb3003be', 'c1000006-0000-0000-0000-000000000006', 'Profile and Cross-Section Leveling', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','leveling','elevation'], 'published'),
  ('fd4b3508-a1ac-46ec-9210-632757407f8e', 'c1000006-0000-0000-0000-000000000006', 'Trigonometric Leveling', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','leveling','elevation'], 'published'),
  ('0ca1c9a9-5739-4c26-9694-9c93de7311ef', 'c1000006-0000-0000-0000-000000000006', 'Level Instrument Adjustments', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','leveling','elevation'], 'published'),
  ('1e3bdc32-d674-4349-908e-41b96cf04b04', 'c1000006-0000-0000-0000-000000000006', 'Benchmark Networks and Vertical Datums', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','leveling','elevation'], 'published'),
  ('911b6af8-808a-4c04-9bd2-7deffb3be294', 'c1000006-0000-0000-0000-000000000006', 'Leveling Field Exercises', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['field-techniques','leveling','elevation'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 7: Coordinate Systems and Datums (8 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c1000007-0000-0000-0000-000000000007' AND id <> ALL (ARRAY['925ac734-f4af-4719-99a4-8268b809fd84', '12ef8155-8bce-4a93-bd86-386bac2dfefd', '00673bd7-2c56-4e1a-b903-e29a73a3192f', '96ac4e17-4461-44dc-a19d-2e2701b4c825', '8d65dbcc-385a-444b-966a-fa8ac010f265', '138e3bc0-24f3-4c29-8982-e5523dbc7464', '86fbc83d-6376-4eb6-bfc5-fd9f3639fa2a', '004219c9-fffc-40af-a680-2320513bc530']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('925ac734-f4af-4719-99a4-8268b809fd84', 'c1000007-0000-0000-0000-000000000007', 'Geographic Coordinate Systems (Latitude/Longitude)', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','datums','projections','geodesy'], 'published'),
  ('12ef8155-8bce-4a93-bd86-386bac2dfefd', 'c1000007-0000-0000-0000-000000000007', 'Geodetic Datums (NAD 27, NAD 83, WGS 84)', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','datums','projections','geodesy'], 'published'),
  ('00673bd7-2c56-4e1a-b903-e29a73a3192f', 'c1000007-0000-0000-0000-000000000007', 'Map Projections Overview', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','datums','projections','geodesy'], 'published'),
  ('96ac4e17-4461-44dc-a19d-2e2701b4c825', 'c1000007-0000-0000-0000-000000000007', 'State Plane Coordinate System (SPCS)', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','datums','projections','geodesy'], 'published'),
  ('8d65dbcc-385a-444b-966a-fa8ac010f265', 'c1000007-0000-0000-0000-000000000007', 'Texas State Plane Zones', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','datums','projections','geodesy'], 'published'),
  ('138e3bc0-24f3-4c29-8982-e5523dbc7464', 'c1000007-0000-0000-0000-000000000007', 'UTM Coordinate System', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','datums','projections','geodesy'], 'published'),
  ('86fbc83d-6376-4eb6-bfc5-fd9f3639fa2a', 'c1000007-0000-0000-0000-000000000007', 'Datum Transformations', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','datums','projections','geodesy'], 'published'),
  ('004219c9-fffc-40af-a680-2320513bc530', 'c1000007-0000-0000-0000-000000000007', 'Practical Coordinate Conversions', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','datums','projections','geodesy'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 8: Traverse Computations (8 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c1000008-0000-0000-0000-000000000008' AND id <> ALL (ARRAY['4ea6aa56-31e3-4b33-a7e2-ab2dc6d7723e', 'c053d4ff-74a7-4594-a8d1-d0c401307e02', '61c4b9a9-e00e-4b80-99da-c15edf192c6e', '3dd698ce-6ccc-4a03-a8d7-f19a53f40a16', '24eb9a48-b37f-4615-ac1b-db880aa3480c', '2e258399-f9ef-432f-a67c-b6e624269e55', 'd597ed54-edfa-42b1-97b7-1064d9acc5f1', '1085aa13-7c9d-4929-84c8-bc9f7d50448b']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('4ea6aa56-31e3-4b33-a7e2-ab2dc6d7723e', 'c1000008-0000-0000-0000-000000000008', 'Traverse Types (Open, Closed, Link)', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','traverse','closure','adjustment'], 'published'),
  ('c053d4ff-74a7-4594-a8d1-d0c401307e02', 'c1000008-0000-0000-0000-000000000008', 'Traverse Field Procedures', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','traverse','closure','adjustment'], 'published'),
  ('61c4b9a9-e00e-4b80-99da-c15edf192c6e', 'c1000008-0000-0000-0000-000000000008', 'Latitude and Departure Calculations', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','traverse','closure','adjustment'], 'published'),
  ('3dd698ce-6ccc-4a03-a8d7-f19a53f40a16', 'c1000008-0000-0000-0000-000000000008', 'Closure Error and Ratio of Closure', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','traverse','closure','adjustment'], 'published'),
  ('24eb9a48-b37f-4615-ac1b-db880aa3480c', 'c1000008-0000-0000-0000-000000000008', 'Compass Rule Adjustment', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','traverse','closure','adjustment'], 'published'),
  ('2e258399-f9ef-432f-a67c-b6e624269e55', 'c1000008-0000-0000-0000-000000000008', 'Transit Rule Adjustment', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','traverse','closure','adjustment'], 'published'),
  ('d597ed54-edfa-42b1-97b7-1064d9acc5f1', 'c1000008-0000-0000-0000-000000000008', 'Coordinate Calculation from Traverse Data', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','traverse','closure','adjustment'], 'published'),
  ('1085aa13-7c9d-4929-84c8-bc9f7d50448b', 'c1000008-0000-0000-0000-000000000008', 'Traverse Computation Problem Sets', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','traverse','closure','adjustment'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 9: Area and Volume Computations (6 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c1000009-0000-0000-0000-000000000009' AND id <> ALL (ARRAY['429a1bdd-bc34-4723-bb7d-daf1db4d2665', 'a9daa1c2-b0ae-40ab-ac31-c0295afe69b0', '704310c8-fb7a-49e1-8912-62f081890afa', 'de47d43a-6820-4784-96d0-40a3cfaa4621', '133e303e-b95a-45de-8d33-b39ce8eb2d40', 'df466917-ac9e-4799-a168-8475631ca487']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('429a1bdd-bc34-4723-bb7d-daf1db4d2665', 'c1000009-0000-0000-0000-000000000009', 'Area by Coordinates (Double Meridian Distance)', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','area','volume','calculations'], 'published'),
  ('a9daa1c2-b0ae-40ab-ac31-c0295afe69b0', 'c1000009-0000-0000-0000-000000000009', 'Area by Triangulation', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','area','volume','calculations'], 'published'),
  ('704310c8-fb7a-49e1-8912-62f081890afa', 'c1000009-0000-0000-0000-000000000009', 'Area Partitioning and Division', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','area','volume','calculations'], 'published'),
  ('de47d43a-6820-4784-96d0-40a3cfaa4621', 'c1000009-0000-0000-0000-000000000009', 'Volume by Cross-Sections', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','area','volume','calculations'], 'published'),
  ('133e303e-b95a-45de-8d33-b39ce8eb2d40', 'c1000009-0000-0000-0000-000000000009', 'Volume by Contour Methods', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','area','volume','calculations'], 'published'),
  ('df466917-ac9e-4799-a168-8475631ca487', 'c1000009-0000-0000-0000-000000000009', 'Earthwork Computation Exercises', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['coordinates','area','volume','calculations'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 10: Total Stations and Electronic Surveying (7 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c100000a-0000-0000-0000-00000000000a' AND id <> ALL (ARRAY['15139528-33df-4856-94bb-dff559fa6688', 'ff0b9ea1-bbb1-47f0-a2c1-e197d00b2c83', '400ac37c-79e7-4b0e-ac08-0e51b69706ec', 'ea97aaff-e1e2-408a-8019-f9a1ca7e49f3', '7c3a5f58-fcb3-4105-92cf-4db5055d91ea', 'd8e1362b-c24e-438e-842c-73064b2b656e', '549ace82-2dbd-4aef-84f1-6d48afc86d79']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('15139528-33df-4856-94bb-dff559fa6688', 'c100000a-0000-0000-0000-00000000000a', 'Total Station Components and Setup', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','total-station','electronic'], 'published'),
  ('ff0b9ea1-bbb1-47f0-a2c1-e197d00b2c83', 'c100000a-0000-0000-0000-00000000000a', 'Electronic Angle and Distance Measurement', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','total-station','electronic'], 'published'),
  ('400ac37c-79e7-4b0e-ac08-0e51b69706ec', 'c100000a-0000-0000-0000-00000000000a', 'Data Collectors and Field Software', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','total-station','electronic'], 'published'),
  ('ea97aaff-e1e2-408a-8019-f9a1ca7e49f3', 'c100000a-0000-0000-0000-00000000000a', 'Stakeout Procedures', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','total-station','electronic'], 'published'),
  ('7c3a5f58-fcb3-4105-92cf-4db5055d91ea', 'c100000a-0000-0000-0000-00000000000a', 'Reflectorless Measurement', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','total-station','electronic'], 'published'),
  ('d8e1362b-c24e-438e-842c-73064b2b656e', 'c100000a-0000-0000-0000-00000000000a', 'Field-to-Office Data Transfer', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','total-station','electronic'], 'published'),
  ('549ace82-2dbd-4aef-84f1-6d48afc86d79', 'c100000a-0000-0000-0000-00000000000a', 'Total Station Calibration and Care', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','total-station','electronic'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 11: GPS/GNSS Surveying (9 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c100000b-0000-0000-0000-00000000000b' AND id <> ALL (ARRAY['dc0422fa-cbeb-434c-aee0-2e0e8914bcad', 'e702897d-97dc-46bb-b473-c364fb27a420', '3e13d01b-282e-419d-8204-e75e67537775', 'dfc1c937-bd48-4033-8cb1-004ac5872e5e', '28e3e9ec-70e5-43ba-bf60-0e554e32e613', 'e0b5a381-0a8a-4663-9c8b-0816e62c44f9', '46586422-2833-4eb7-a4f0-f43afa0daae8', 'fbe7132a-2992-4500-b21e-33f4f5dc5d69', 'db07fb79-9728-47d7-8fc0-228e3e527bbf']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('dc0422fa-cbeb-434c-aee0-2e0e8914bcad', 'c100000b-0000-0000-0000-00000000000b', 'GPS/GNSS Fundamentals', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','gps','gnss','satellite'], 'published'),
  ('e702897d-97dc-46bb-b473-c364fb27a420', 'c100000b-0000-0000-0000-00000000000b', 'Satellite Constellations (GPS, GLONASS, Galileo)', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','gps','gnss','satellite'], 'published'),
  ('3e13d01b-282e-419d-8204-e75e67537775', 'c100000b-0000-0000-0000-00000000000b', 'GPS Signal Structure and Measurement', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','gps','gnss','satellite'], 'published'),
  ('dfc1c937-bd48-4033-8cb1-004ac5872e5e', 'c100000b-0000-0000-0000-00000000000b', 'Static GPS Surveying', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','gps','gnss','satellite'], 'published'),
  ('28e3e9ec-70e5-43ba-bf60-0e554e32e613', 'c100000b-0000-0000-0000-00000000000b', 'Real-Time Kinematic (RTK) Methods', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','gps','gnss','satellite'], 'published'),
  ('e0b5a381-0a8a-4663-9c8b-0816e62c44f9', 'c100000b-0000-0000-0000-00000000000b', 'Network RTK and CORS', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','gps','gnss','satellite'], 'published'),
  ('46586422-2833-4eb7-a4f0-f43afa0daae8', 'c100000b-0000-0000-0000-00000000000b', 'GPS Data Processing and Adjustment', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','gps','gnss','satellite'], 'published'),
  ('fbe7132a-2992-4500-b21e-33f4f5dc5d69', 'c100000b-0000-0000-0000-00000000000b', 'GPS Error Sources and Mitigation', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','gps','gnss','satellite'], 'published'),
  ('db07fb79-9728-47d7-8fc0-228e3e527bbf', 'c100000b-0000-0000-0000-00000000000b', 'Integrating GPS with Conventional Surveys', '', ARRAY[]::text[], 9, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','gps','gnss','satellite'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 12: Robotic, Scanning, and UAS Technology (6 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c100000c-0000-0000-0000-00000000000c' AND id <> ALL (ARRAY['01481882-ccd3-4374-8d8d-7b5d72b9b37e', '9d92655f-bc09-401c-a2eb-d30fd3e28545', '8fe92114-8460-42b3-a5df-7ea0b49f8e7d', '991f9023-ca4c-41b4-92b9-29d4e39aaa2c', 'd4ce5cc5-421a-46d9-9194-636ce782c5ac', '2659a29f-3f98-4733-a026-754fa0d58782']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('01481882-ccd3-4374-8d8d-7b5d72b9b37e', 'c100000c-0000-0000-0000-00000000000c', 'Robotic Total Stations', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','lidar','uas','scanning','drones'], 'published'),
  ('9d92655f-bc09-401c-a2eb-d30fd3e28545', 'c100000c-0000-0000-0000-00000000000c', '3D Laser Scanning (Terrestrial LiDAR)', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','lidar','uas','scanning','drones'], 'published'),
  ('8fe92114-8460-42b3-a5df-7ea0b49f8e7d', 'c100000c-0000-0000-0000-00000000000c', 'Point Cloud Processing', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','lidar','uas','scanning','drones'], 'published'),
  ('991f9023-ca4c-41b4-92b9-29d4e39aaa2c', 'c100000c-0000-0000-0000-00000000000c', 'Unmanned Aerial Systems (Drones) in Surveying', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','lidar','uas','scanning','drones'], 'published'),
  ('d4ce5cc5-421a-46d9-9194-636ce782c5ac', 'c100000c-0000-0000-0000-00000000000c', 'Photogrammetry from UAS', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','lidar','uas','scanning','drones'], 'published'),
  ('2659a29f-3f98-4733-a026-754fa0d58782', 'c100000c-0000-0000-0000-00000000000c', 'Technology Integration and Best Practices', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['technology','lidar','uas','scanning','drones'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 13: Boundary Law Principles (8 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c100000d-0000-0000-0000-00000000000d' AND id <> ALL (ARRAY['7609d69d-4e47-41af-ba52-4fb43c7bd30b', 'd9dce125-bcb4-4b45-ba8d-9b158330f19a', '2f9cc34d-ae8a-4d64-85d8-fa127e99c3af', 'adab54df-2ed0-4b42-84a3-b5dc747ee7ab', 'b6e53f76-c210-49f5-bc00-e863acdb4a26', '62544af0-961b-47ed-be48-62be4f3c7721', '7d2f4cce-bb4a-48ab-b9c4-61cd49b2951a', '149f728d-c46e-4060-80b4-442d34c58bc6']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('7609d69d-4e47-41af-ba52-4fb43c7bd30b', 'c100000d-0000-0000-0000-00000000000d', 'Introduction to Property Law', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','legal','law','property'], 'published'),
  ('d9dce125-bcb4-4b45-ba8d-9b158330f19a', 'c100000d-0000-0000-0000-00000000000d', 'Types of Property (Real vs. Personal)', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','legal','law','property'], 'published'),
  ('2f9cc34d-ae8a-4d64-85d8-fa127e99c3af', 'c100000d-0000-0000-0000-00000000000d', 'Estates and Interests in Land', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','legal','law','property'], 'published'),
  ('adab54df-2ed0-4b42-84a3-b5dc747ee7ab', 'c100000d-0000-0000-0000-00000000000d', 'Legal Descriptions Overview', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','legal','law','property'], 'published'),
  ('b6e53f76-c210-49f5-bc00-e863acdb4a26', 'c100000d-0000-0000-0000-00000000000d', 'Rules of Construction for Deeds', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','legal','law','property'], 'published'),
  ('62544af0-961b-47ed-be48-62be4f3c7721', 'c100000d-0000-0000-0000-00000000000d', 'Riparian and Littoral Rights', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','legal','law','property'], 'published'),
  ('7d2f4cce-bb4a-48ab-b9c4-61cd49b2951a', 'c100000d-0000-0000-0000-00000000000d', 'Adverse Possession and Acquiescence', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','legal','law','property'], 'published'),
  ('149f728d-c46e-4060-80b4-442d34c58bc6', 'c100000d-0000-0000-0000-00000000000d', 'Easements and Rights-of-Way', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','legal','law','property'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 14: Metes and Bounds Descriptions (7 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c100000e-0000-0000-0000-00000000000e' AND id <> ALL (ARRAY['ac63566a-d49c-47db-97c5-cc9186fdee08', '5c4cda74-f4e2-45d8-bfdd-373702f28d14', '89312e01-b753-4286-ac10-c7096c77357e', 'da65db00-054e-419d-9988-24d97953ca1e', '9fc9e9f1-25b9-4c57-b4f2-e6e3b3a4de29', '42792d8e-0f3a-46d9-95c4-2add696124cf', '1112f7a8-b60d-43db-aac0-c02cc1ce39cf']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('ac63566a-d49c-47db-97c5-cc9186fdee08', 'c100000e-0000-0000-0000-00000000000e', 'Components of a Metes and Bounds Description', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','metes-bounds','descriptions','legal'], 'published'),
  ('5c4cda74-f4e2-45d8-bfdd-373702f28d14', 'c100000e-0000-0000-0000-00000000000e', 'Beginning Points and Monuments', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','metes-bounds','descriptions','legal'], 'published'),
  ('89312e01-b753-4286-ac10-c7096c77357e', 'c100000e-0000-0000-0000-00000000000e', 'Course and Distance Calls', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','metes-bounds','descriptions','legal'], 'published'),
  ('da65db00-054e-419d-9988-24d97953ca1e', 'c100000e-0000-0000-0000-00000000000e', 'Natural and Artificial Monuments', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','metes-bounds','descriptions','legal'], 'published'),
  ('9fc9e9f1-25b9-4c57-b4f2-e6e3b3a4de29', 'c100000e-0000-0000-0000-00000000000e', 'Senior vs. Junior Rights', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','metes-bounds','descriptions','legal'], 'published'),
  ('42792d8e-0f3a-46d9-95c4-2add696124cf', 'c100000e-0000-0000-0000-00000000000e', 'Resolving Conflicting Calls', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','metes-bounds','descriptions','legal'], 'published'),
  ('1112f7a8-b60d-43db-aac0-c02cc1ce39cf', 'c100000e-0000-0000-0000-00000000000e', 'Writing Legal Descriptions', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','metes-bounds','descriptions','legal'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 15: Texas Land Titles and Records (8 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c100000f-0000-0000-0000-00000000000f' AND id <> ALL (ARRAY['6dc25256-cb35-42e0-b8ec-90b29f6c7085', '5ea5e4f0-f3c6-48af-a855-054e9110356e', '184ab3e2-3b90-48ae-b9a1-be10d4e85a55', 'e5580ef9-dc1d-436a-80df-6e83e08e5a71', 'f0ebedbb-846c-4687-bac9-e799499718b8', 'a1904e23-948b-4673-8fc9-cf711ada59a0', '768c4969-7fca-4dfe-a552-3a375e926869', 'd12cd2e7-2324-47e0-b1f5-ae908b7963e2']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('6dc25256-cb35-42e0-b8ec-90b29f6c7085', 'c100000f-0000-0000-0000-00000000000f', 'History of Texas Land Grants', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','texas','titles','records','history'], 'published'),
  ('5ea5e4f0-f3c6-48af-a855-054e9110356e', 'c100000f-0000-0000-0000-00000000000f', 'Spanish and Mexican Land Grants', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','texas','titles','records','history'], 'published'),
  ('184ab3e2-3b90-48ae-b9a1-be10d4e85a55', 'c100000f-0000-0000-0000-00000000000f', 'Republic of Texas Grants', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','texas','titles','records','history'], 'published'),
  ('e5580ef9-dc1d-436a-80df-6e83e08e5a71', 'c100000f-0000-0000-0000-00000000000f', 'Texas General Land Office (GLO)', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','texas','titles','records','history'], 'published'),
  ('f0ebedbb-846c-4687-bac9-e799499718b8', 'c100000f-0000-0000-0000-00000000000f', 'Abstract of Title and Title Insurance', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','texas','titles','records','history'], 'published'),
  ('a1904e23-948b-4673-8fc9-cf711ada59a0', 'c100000f-0000-0000-0000-00000000000f', 'County Clerk Records Research', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','texas','titles','records','history'], 'published'),
  ('768c4969-7fca-4dfe-a552-3a375e926869', 'c100000f-0000-0000-0000-00000000000f', 'Deed Interpretation', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','texas','titles','records','history'], 'published'),
  ('d12cd2e7-2324-47e0-b1f5-ae908b7963e2', 'c100000f-0000-0000-0000-00000000000f', 'Texas Land Title Practice Exercises', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','texas','titles','records','history'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 16: Boundary Retracement and Resolution (8 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c1000010-0000-0000-0000-000000000010' AND id <> ALL (ARRAY['88e2e8b2-1b43-44cb-9f84-69b4287c1bd5', '0e44ee50-808d-40e0-9fac-d92394584cb5', 'b5bf81bd-43fb-4104-bf00-21500875b87d', '3557faa5-147f-430a-bc6b-57c4260d5653', '5dfc9628-8f23-417d-97b6-192f68ce2c10', '30169341-4a73-4d9b-84e7-0700156b62af', '20950896-59ec-45d2-9dbc-eb3e020232b6', 'bf1c4700-19c2-40c1-8477-19d8a2150348']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('88e2e8b2-1b43-44cb-9f84-69b4287c1bd5', 'c1000010-0000-0000-0000-000000000010', 'Retracement Survey Principles', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','retracement','resolution','field'], 'published'),
  ('0e44ee50-808d-40e0-9fac-d92394584cb5', 'c1000010-0000-0000-0000-000000000010', 'Original Survey vs. Retracement', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','retracement','resolution','field'], 'published'),
  ('b5bf81bd-43fb-4104-bf00-21500875b87d', 'c1000010-0000-0000-0000-000000000010', 'Evidence Collection and Analysis', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','retracement','resolution','field'], 'published'),
  ('3557faa5-147f-430a-bc6b-57c4260d5653', 'c1000010-0000-0000-0000-000000000010', 'Lost and Obliterated Corners', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','retracement','resolution','field'], 'published'),
  ('5dfc9628-8f23-417d-97b6-192f68ce2c10', 'c1000010-0000-0000-0000-000000000010', 'Proportionate Measurement', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','retracement','resolution','field'], 'published'),
  ('30169341-4a73-4d9b-84e7-0700156b62af', 'c1000010-0000-0000-0000-000000000010', 'Agreement Lines and Boundary Agreements', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','retracement','resolution','field'], 'published'),
  ('20950896-59ec-45d2-9dbc-eb3e020232b6', 'c1000010-0000-0000-0000-000000000010', 'Expert Witness and Court Procedures', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','retracement','resolution','field'], 'published'),
  ('bf1c4700-19c2-40c1-8477-19d8a2150348', 'c1000010-0000-0000-0000-000000000010', 'Boundary Retracement Case Studies', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['boundary','retracement','resolution','field'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 17: Subdivision Design and Platting (7 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c1000011-0000-0000-0000-000000000011' AND id <> ALL (ARRAY['9f32004f-0308-4c54-a042-702b4d241d33', 'cff08476-3c98-44ca-a59d-c35063701abe', 'c0d8bd65-e438-4a66-a932-ea7e76ddea3e', 'd5b60839-89a1-49ff-a054-4deea97c0a79', '6387002b-9d9f-4f4e-bcb3-fdb1926273f1', '09e7d13c-12bb-4019-b55c-d6139667ec4e', '3f3ce9de-e506-4257-b268-04d349f5b2bf']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('9f32004f-0308-4c54-a042-702b4d241d33', 'c1000011-0000-0000-0000-000000000011', 'Subdivision Design Principles', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['subdivision','platting','design','planning'], 'published'),
  ('cff08476-3c98-44ca-a59d-c35063701abe', 'c1000011-0000-0000-0000-000000000011', 'Texas Subdivision Regulations', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['subdivision','platting','design','planning'], 'published'),
  ('c0d8bd65-e438-4a66-a932-ea7e76ddea3e', 'c1000011-0000-0000-0000-000000000011', 'Plat Requirements and Standards', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['subdivision','platting','design','planning'], 'published'),
  ('d5b60839-89a1-49ff-a054-4deea97c0a79', 'c1000011-0000-0000-0000-000000000011', 'Lot and Block Design', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['subdivision','platting','design','planning'], 'published'),
  ('6387002b-9d9f-4f4e-bcb3-fdb1926273f1', 'c1000011-0000-0000-0000-000000000011', 'Street and Utility Layout', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['subdivision','platting','design','planning'], 'published'),
  ('09e7d13c-12bb-4019-b55c-d6139667ec4e', 'c1000011-0000-0000-0000-000000000011', 'Filing and Recording Plats', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['subdivision','platting','design','planning'], 'published'),
  ('3f3ce9de-e506-4257-b268-04d349f5b2bf', 'c1000011-0000-0000-0000-000000000011', 'Subdivision Case Studies', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['subdivision','platting','design','planning'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 18: Construction Surveying (7 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c1000012-0000-0000-0000-000000000012' AND id <> ALL (ARRAY['b93d5b7a-89ef-48ac-9881-fb45b9bbde16', '08b9b9bd-4eea-48c8-b3f9-072479e48189', '6de831fc-aa76-4fe2-9fe4-13e90e2301a6', '1682393e-399c-419e-93a7-1b373316c483', '47a67367-9553-4fd4-b1cb-8d96d58dacfb', '85201c11-56a6-4644-a1f9-5e866fb71fc8', '2eb63ef7-f13a-44cc-8ae4-943f5a44ede3']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('b93d5b7a-89ef-48ac-9881-fb45b9bbde16', 'c1000012-0000-0000-0000-000000000012', 'Construction Survey Fundamentals', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['construction','layout','stakeout','building'], 'published'),
  ('08b9b9bd-4eea-48c8-b3f9-072479e48189', 'c1000012-0000-0000-0000-000000000012', 'Building Layout and Control', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['construction','layout','stakeout','building'], 'published'),
  ('6de831fc-aa76-4fe2-9fe4-13e90e2301a6', 'c1000012-0000-0000-0000-000000000012', 'Road and Highway Stakeout', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['construction','layout','stakeout','building'], 'published'),
  ('1682393e-399c-419e-93a7-1b373316c483', 'c1000012-0000-0000-0000-000000000012', 'Utility and Pipeline Surveys', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['construction','layout','stakeout','building'], 'published'),
  ('47a67367-9553-4fd4-b1cb-8d96d58dacfb', 'c1000012-0000-0000-0000-000000000012', 'Earthwork and Grading Surveys', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['construction','layout','stakeout','building'], 'published'),
  ('85201c11-56a6-4644-a1f9-5e866fb71fc8', 'c1000012-0000-0000-0000-000000000012', 'As-Built Surveys', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['construction','layout','stakeout','building'], 'published'),
  ('2eb63ef7-f13a-44cc-8ae4-943f5a44ede3', 'c1000012-0000-0000-0000-000000000012', 'Construction Survey Problems', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['construction','layout','stakeout','building'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 19: Topographic and Mapping Surveys (6 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c1000013-0000-0000-0000-000000000013' AND id <> ALL (ARRAY['f154fdbd-1aec-4c41-a6a8-a7f67b40a53a', '99ca2a92-e87b-493f-bb7c-1cae6d4dd950', '09a9602d-40c0-42c4-a2ad-bba213dcc715', '384ced07-ed6b-46b9-88b7-b262a9524398', 'be27f689-8827-43fc-8fdd-f015d2d8b369', '4c291d33-27fd-44ec-aa26-a2af9ed63b8b']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('f154fdbd-1aec-4c41-a6a8-a7f67b40a53a', 'c1000013-0000-0000-0000-000000000013', 'Topographic Survey Methods', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['topographic','mapping','contours','GIS'], 'published'),
  ('99ca2a92-e87b-493f-bb7c-1cae6d4dd950', 'c1000013-0000-0000-0000-000000000013', 'Contour Lines and Mapping', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['topographic','mapping','contours','GIS'], 'published'),
  ('09a9602d-40c0-42c4-a2ad-bba213dcc715', 'c1000013-0000-0000-0000-000000000013', 'Digital Terrain Models (DTM/DEM)', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['topographic','mapping','contours','GIS'], 'published'),
  ('384ced07-ed6b-46b9-88b7-b262a9524398', 'c1000013-0000-0000-0000-000000000013', 'Feature Collection and Coding', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['topographic','mapping','contours','GIS'], 'published'),
  ('be27f689-8827-43fc-8fdd-f015d2d8b369', 'c1000013-0000-0000-0000-000000000013', 'Map Standards and Symbology', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['topographic','mapping','contours','GIS'], 'published'),
  ('4c291d33-27fd-44ec-aa26-a2af9ed63b8b', 'c1000013-0000-0000-0000-000000000013', 'GIS Integration for Surveyors', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['topographic','mapping','contours','GIS'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 20: Geodetic and Control Surveying (8 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c1000014-0000-0000-0000-000000000014' AND id <> ALL (ARRAY['8652bc9b-f476-4bb5-8c6b-ff3115c9e1bd', '69ba0fb0-8d53-4f11-851e-bbebdb463c9d', '96d52571-8a69-4dfc-b47b-59359e7d7006', '4476d8e4-a0c0-4db6-bf06-87d7a5f606b8', 'b3d6d0b7-f004-4e46-a866-f6dac0100dfb', '6b6461d5-b98e-4c1a-8b2b-24be1885df04', 'b7aff6de-674b-458a-82e7-04f87a658a96', '7ab732c3-dbd7-4cea-8b37-6df092933dce']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('8652bc9b-f476-4bb5-8c6b-ff3115c9e1bd', 'c1000014-0000-0000-0000-000000000014', 'Geodetic Survey Concepts', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['geodetic','control','networks','precision'], 'published'),
  ('69ba0fb0-8d53-4f11-851e-bbebdb463c9d', 'c1000014-0000-0000-0000-000000000014', 'Horizontal Control Networks', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['geodetic','control','networks','precision'], 'published'),
  ('96d52571-8a69-4dfc-b47b-59359e7d7006', 'c1000014-0000-0000-0000-000000000014', 'Vertical Control Networks', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['geodetic','control','networks','precision'], 'published'),
  ('4476d8e4-a0c0-4db6-bf06-87d7a5f606b8', 'c1000014-0000-0000-0000-000000000014', 'Geodetic Computations on the Ellipsoid', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['geodetic','control','networks','precision'], 'published'),
  ('b3d6d0b7-f004-4e46-a866-f6dac0100dfb', 'c1000014-0000-0000-0000-000000000014', 'Geoid Models and Orthometric Heights', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['geodetic','control','networks','precision'], 'published'),
  ('6b6461d5-b98e-4c1a-8b2b-24be1885df04', 'c1000014-0000-0000-0000-000000000014', 'NGS Standards and Specifications', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['geodetic','control','networks','precision'], 'published'),
  ('b7aff6de-674b-458a-82e7-04f87a658a96', 'c1000014-0000-0000-0000-000000000014', 'CORS and OPUS', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['geodetic','control','networks','precision'], 'published'),
  ('7ab732c3-dbd7-4cea-8b37-6df092933dce', 'c1000014-0000-0000-0000-000000000014', 'Control Network Design and Adjustment', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['geodetic','control','networks','precision'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 21: Hydrographic and Coastal Surveying (6 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c1000015-0000-0000-0000-000000000015' AND id <> ALL (ARRAY['cd6e08f5-2b80-471a-83f6-c8772f984e59', '8efb96e2-80b3-4ac3-9ab6-2aaf48ad7a46', '6ca85832-a702-4401-bd79-f70b989ddd1e', '823b0a39-0438-4e0b-9544-e5782e6e7a8a', '52f79f9d-0221-4ca2-a4b0-8748463e791e', '7829ced8-18ca-452d-9a24-dcf687354ea7']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('cd6e08f5-2b80-471a-83f6-c8772f984e59', 'c1000015-0000-0000-0000-000000000015', 'Hydrographic Survey Fundamentals', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['hydrographic','coastal','water','boundaries'], 'published'),
  ('8efb96e2-80b3-4ac3-9ab6-2aaf48ad7a46', 'c1000015-0000-0000-0000-000000000015', 'Tidal Datums and Water Level Measurement', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['hydrographic','coastal','water','boundaries'], 'published'),
  ('6ca85832-a702-4401-bd79-f70b989ddd1e', 'c1000015-0000-0000-0000-000000000015', 'Bathymetric Survey Methods', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['hydrographic','coastal','water','boundaries'], 'published'),
  ('823b0a39-0438-4e0b-9544-e5782e6e7a8a', 'c1000015-0000-0000-0000-000000000015', 'Coastal Boundary Determination', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['hydrographic','coastal','water','boundaries'], 'published'),
  ('52f79f9d-0221-4ca2-a4b0-8748463e791e', 'c1000015-0000-0000-0000-000000000015', 'Navigable Waterways and Riparian Surveys', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['hydrographic','coastal','water','boundaries'], 'published'),
  ('7829ced8-18ca-452d-9a24-dcf687354ea7', 'c1000015-0000-0000-0000-000000000015', 'Environmental and Regulatory Considerations', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['hydrographic','coastal','water','boundaries'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 22: Mining and Industrial Surveying (5 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c1000016-0000-0000-0000-000000000016' AND id <> ALL (ARRAY['7a245639-e051-4c8c-9bf3-24aaea257ab1', '5068d3ab-7f1e-41d8-ba6e-cbc1864c54e3', '2a2f13a3-eaf6-424f-a469-c84dfae6951b', '1842b5e3-a8d9-43d7-9972-5b585eff182c', 'da502306-8208-4fd7-9910-5bbf852044ba']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('7a245639-e051-4c8c-9bf3-24aaea257ab1', 'c1000016-0000-0000-0000-000000000016', 'Mine Surveying Fundamentals', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['mining','industrial','specialized','underground'], 'published'),
  ('5068d3ab-7f1e-41d8-ba6e-cbc1864c54e3', 'c1000016-0000-0000-0000-000000000016', 'Underground Survey Methods', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['mining','industrial','specialized','underground'], 'published'),
  ('2a2f13a3-eaf6-424f-a469-c84dfae6951b', 'c1000016-0000-0000-0000-000000000016', 'Surface and Subsidence Monitoring', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['mining','industrial','specialized','underground'], 'published'),
  ('1842b5e3-a8d9-43d7-9972-5b585eff182c', 'c1000016-0000-0000-0000-000000000016', 'Industrial and Optical Alignment', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['mining','industrial','specialized','underground'], 'published'),
  ('da502306-8208-4fd7-9910-5bbf852044ba', 'c1000016-0000-0000-0000-000000000016', 'Deformation Monitoring Techniques', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['mining','industrial','specialized','underground'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 23: Survey Business and Professional Practice (7 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c1000017-0000-0000-0000-000000000017' AND id <> ALL (ARRAY['792b860f-091e-4501-8941-addcebb7b0ea', '838bbaf5-e775-4e91-bbc1-46981bd9818b', '07ba0d76-807c-48fe-86c0-f9137439a19a', '93eba08c-7e61-4f50-8d26-2f5f6fc96083', '4d77040e-7139-4ba1-8eba-dc939ce32306', '853d5851-55d4-4f6e-8e8c-afbca633727a', '2e7fcc24-6072-455f-a161-927c628d4514']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('792b860f-091e-4501-8941-addcebb7b0ea', 'c1000017-0000-0000-0000-000000000017', 'Starting and Running a Survey Business', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','business','practice','management'], 'published'),
  ('838bbaf5-e775-4e91-bbc1-46981bd9818b', 'c1000017-0000-0000-0000-000000000017', 'Project Management for Surveyors', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','business','practice','management'], 'published'),
  ('07ba0d76-807c-48fe-86c0-f9137439a19a', 'c1000017-0000-0000-0000-000000000017', 'Client Relations and Communication', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','business','practice','management'], 'published'),
  ('93eba08c-7e61-4f50-8d26-2f5f6fc96083', 'c1000017-0000-0000-0000-000000000017', 'Proposal Writing and Fee Estimation', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','business','practice','management'], 'published'),
  ('4d77040e-7139-4ba1-8eba-dc939ce32306', 'c1000017-0000-0000-0000-000000000017', 'Insurance and Liability', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','business','practice','management'], 'published'),
  ('853d5851-55d4-4f6e-8e8c-afbca633727a', 'c1000017-0000-0000-0000-000000000017', 'Quality Assurance and Quality Control', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','business','practice','management'], 'published'),
  ('2e7fcc24-6072-455f-a161-927c628d4514', 'c1000017-0000-0000-0000-000000000017', 'Professional Development and Continuing Education', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','business','practice','management'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 24: Texas Surveying Law and Regulations (8 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c1000018-0000-0000-0000-000000000018' AND id <> ALL (ARRAY['4ee6b9bd-40a2-4a27-9bf5-e2a25d4195ca', '16f6fb48-114c-4670-8be8-bb211da888a8', '8a8a6ec2-fee2-48a5-9676-71e947c1e640', 'aea6fe59-0955-42ca-87cd-a20323dd7c45', '4cf7696b-094d-47d1-bc5b-a68c9bb7f21b', '5d0e6d5b-5066-449e-80a8-5c48cb705009', 'd254ce3d-221e-465e-a28a-d04e6429193b', '947241dc-10a7-4ace-b235-6451665b5d16']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('4ee6b9bd-40a2-4a27-9bf5-e2a25d4195ca', 'c1000018-0000-0000-0000-000000000018', 'Texas Board of Professional Engineers and Land Surveyors (TBPELS)', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','texas-law','regulations','TBPELS'], 'published'),
  ('16f6fb48-114c-4670-8be8-bb211da888a8', 'c1000018-0000-0000-0000-000000000018', 'Texas Professional Land Surveying Practices Act', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','texas-law','regulations','TBPELS'], 'published'),
  ('8a8a6ec2-fee2-48a5-9676-71e947c1e640', 'c1000018-0000-0000-0000-000000000018', 'TBPELS Rules and Regulations', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','texas-law','regulations','TBPELS'], 'published'),
  ('aea6fe59-0955-42ca-87cd-a20323dd7c45', 'c1000018-0000-0000-0000-000000000018', 'Texas Standards and Specifications for Land Surveying', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','texas-law','regulations','TBPELS'], 'published'),
  ('4cf7696b-094d-47d1-bc5b-a68c9bb7f21b', 'c1000018-0000-0000-0000-000000000018', 'Texas Natural Resources Code — Surveying Sections', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','texas-law','regulations','TBPELS'], 'published'),
  ('5d0e6d5b-5066-449e-80a8-5c48cb705009', 'c1000018-0000-0000-0000-000000000018', 'Texas Property Code — Relevant Sections', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','texas-law','regulations','TBPELS'], 'published'),
  ('d254ce3d-221e-465e-a28a-d04e6429193b', 'c1000018-0000-0000-0000-000000000018', 'Ethics Complaints and Disciplinary Process', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','texas-law','regulations','TBPELS'], 'published'),
  ('947241dc-10a7-4ace-b235-6451665b5d16', 'c1000018-0000-0000-0000-000000000018', 'Regulatory Compliance Case Studies', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['professional','texas-law','regulations','TBPELS'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 25: SIT Exam Review - Fundamentals (10 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c1000019-0000-0000-0000-000000000019' AND id <> ALL (ARRAY['153e57a7-df0b-4b30-a4e8-cbfe125785ec', '74470d18-37e1-4928-a697-46927b811835', 'fb89ec38-209b-4125-9acf-7de4d88465bc', '6e515c6d-3835-4681-84ca-7ce2215b7c28', 'b546fea7-83b5-4940-a51b-f02529e30b46', '0fe093eb-d7ed-43a7-9511-fdaf7f6b0f12', 'abf146f7-f77e-4d6c-a065-6de160ac604b', 'e079ffe6-6bd0-499c-a406-a86b351ad5c2', '249bd04d-b9d0-455d-b416-023af3efc6b4', 'cd8225a2-c6f3-4e3c-a8df-5b8278d6cf97']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('153e57a7-df0b-4b30-a4e8-cbfe125785ec', 'c1000019-0000-0000-0000-000000000019', 'SIT Exam Format and Study Strategy', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published'),
  ('74470d18-37e1-4928-a697-46927b811835', 'c1000019-0000-0000-0000-000000000019', 'Mathematics Review for SIT', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published'),
  ('fb89ec38-209b-4125-9acf-7de4d88465bc', 'c1000019-0000-0000-0000-000000000019', 'Measurement and Error Theory Review', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published'),
  ('6e515c6d-3835-4681-84ca-7ce2215b7c28', 'c1000019-0000-0000-0000-000000000019', 'Distance and Angle Measurement Review', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published'),
  ('b546fea7-83b5-4940-a51b-f02529e30b46', 'c1000019-0000-0000-0000-000000000019', 'Leveling Review', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published'),
  ('0fe093eb-d7ed-43a7-9511-fdaf7f6b0f12', 'c1000019-0000-0000-0000-000000000019', 'Coordinate Systems Review', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published'),
  ('abf146f7-f77e-4d6c-a065-6de160ac604b', 'c1000019-0000-0000-0000-000000000019', 'Traverse Computations Review', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published'),
  ('e079ffe6-6bd0-499c-a406-a86b351ad5c2', 'c1000019-0000-0000-0000-000000000019', 'Area and Volume Review', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published'),
  ('249bd04d-b9d0-455d-b416-023af3efc6b4', 'c1000019-0000-0000-0000-000000000019', 'GPS/GNSS Concepts Review', '', ARRAY[]::text[], 9, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published'),
  ('cd8225a2-c6f3-4e3c-a8df-5b8278d6cf97', 'c1000019-0000-0000-0000-000000000019', 'SIT Practice Problems — Set 1', '', ARRAY[]::text[], 10, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','fundamentals','review'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 26: SIT Exam Review - Advanced Topics (9 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c100001a-0000-0000-0000-00000000001a' AND id <> ALL (ARRAY['a3c8c160-0a68-4aa4-9155-4ddcd1183a53', '00e59f6c-81a9-46d7-8e06-9e98efec29a8', 'c3bca439-c78e-42ce-9416-f7313d08680e', '6c0db991-2c1f-469c-83d2-4c3eb7f8f5de', '3a122889-17da-40cf-bf70-4e9fca9f0f31', 'd9587b1a-eff4-4db8-88be-f3175623aa03', 'beb9522e-1bab-425c-9d43-4c4d0696d9d3', '7487b90f-db5e-4144-ae61-de244ccc6ef1', 'cc4a39c2-d573-4a23-be15-0b43ebd31774']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('a3c8c160-0a68-4aa4-9155-4ddcd1183a53', 'c100001a-0000-0000-0000-00000000001a', 'Boundary Law Principles Review', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','advanced','review'], 'published'),
  ('00e59f6c-81a9-46d7-8e06-9e98efec29a8', 'c100001a-0000-0000-0000-00000000001a', 'Legal Descriptions Review', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','advanced','review'], 'published'),
  ('c3bca439-c78e-42ce-9416-f7313d08680e', 'c100001a-0000-0000-0000-00000000001a', 'Texas Land Records Review', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','advanced','review'], 'published'),
  ('6c0db991-2c1f-469c-83d2-4c3eb7f8f5de', 'c100001a-0000-0000-0000-00000000001a', 'Construction Surveying Review', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','advanced','review'], 'published'),
  ('3a122889-17da-40cf-bf70-4e9fca9f0f31', 'c100001a-0000-0000-0000-00000000001a', 'Topographic Surveying Review', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','advanced','review'], 'published'),
  ('d9587b1a-eff4-4db8-88be-f3175623aa03', 'c100001a-0000-0000-0000-00000000001a', 'Professional Practice Review', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','advanced','review'], 'published'),
  ('beb9522e-1bab-425c-9d43-4c4d0696d9d3', 'c100001a-0000-0000-0000-00000000001a', 'Texas Law and Regulations Review', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','advanced','review'], 'published'),
  ('7487b90f-db5e-4144-ae61-de244ccc6ef1', 'c100001a-0000-0000-0000-00000000001a', 'SIT Practice Problems — Set 2', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','advanced','review'], 'published'),
  ('cc4a39c2-d573-4a23-be15-0b43ebd31774', 'c100001a-0000-0000-0000-00000000001a', 'SIT Full-Length Practice Exam Tips', '', ARRAY[]::text[], 9, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','SIT','advanced','review'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 27: RPLS Exam Review - Texas Jurisprudence (8 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c100001b-0000-0000-0000-00000000001b' AND id <> ALL (ARRAY['1052e7fe-064f-403d-84b4-7e24ae80d40d', '52180e80-d9ea-49a2-b1b2-a61b50c8bdaa', '99060678-cdfc-4ba4-b275-97290a274ce9', '34aa0a43-89e1-4f66-9a3e-e4cafba0b02e', '070eff40-b441-4f1d-b3c8-c7204f7e71d4', '19f2d785-c19e-417e-8674-6cf19964ed34', '765a3fcb-bb30-46cf-a47d-9a9ff3673879', 'b9fc342a-0136-47aa-9f15-5dd8fcdac51b']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('1052e7fe-064f-403d-84b4-7e24ae80d40d', 'c100001b-0000-0000-0000-00000000001b', 'RPLS Exam Format and Study Strategy', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','jurisprudence','texas-law'], 'published'),
  ('52180e80-d9ea-49a2-b1b2-a61b50c8bdaa', 'c100001b-0000-0000-0000-00000000001b', 'Texas Land Grant History — Deep Review', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','jurisprudence','texas-law'], 'published'),
  ('99060678-cdfc-4ba4-b275-97290a274ce9', 'c100001b-0000-0000-0000-00000000001b', 'Property Law and Estates Review', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','jurisprudence','texas-law'], 'published'),
  ('34aa0a43-89e1-4f66-9a3e-e4cafba0b02e', 'c100001b-0000-0000-0000-00000000001b', 'Boundary Retracement and Resolution Review', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','jurisprudence','texas-law'], 'published'),
  ('070eff40-b441-4f1d-b3c8-c7204f7e71d4', 'c100001b-0000-0000-0000-00000000001b', 'Riparian and Water Rights Review', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','jurisprudence','texas-law'], 'published'),
  ('19f2d785-c19e-417e-8674-6cf19964ed34', 'c100001b-0000-0000-0000-00000000001b', 'Texas Surveying Statutes — Deep Review', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','jurisprudence','texas-law'], 'published'),
  ('765a3fcb-bb30-46cf-a47d-9a9ff3673879', 'c100001b-0000-0000-0000-00000000001b', 'RPLS Practice Problems — Jurisprudence', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','jurisprudence','texas-law'], 'published'),
  ('b9fc342a-0136-47aa-9f15-5dd8fcdac51b', 'c100001b-0000-0000-0000-00000000001b', 'RPLS Jurisprudence Practice Exam Tips', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','jurisprudence','texas-law'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;

-- --------------------------------------------------------------------------
-- Module 28: RPLS Exam Review - Practical Surveying (10 lessons)
-- --------------------------------------------------------------------------
-- Only STRAY lessons are removed. The canonical lessons below are upserted, never
-- deleted, so lesson_blocks and user_progress (both FK ON DELETE CASCADE) survive a re-run.
DELETE FROM learning_lessons WHERE module_id = 'c100001c-0000-0000-0000-00000000001c' AND id <> ALL (ARRAY['0c8c3b20-547c-40ac-9a95-f3864a116b2b', 'ca5cbe08-3766-4389-be5b-513e17479be8', '2aa90c7c-c09a-4dc0-9c2c-bd14f4f9c365', 'f3aa8c68-5638-4f0c-9fb7-aed7fb503220', '370abca8-6a2f-4e77-8c73-9615d592af9a', 'da06cbbe-3ed2-42aa-9e15-14807265501c', '42f97e15-6fd1-44a9-aedb-9e67438340eb', '366b16ac-30f6-4400-b7c7-051edd5bf873', '7c610f13-f9d4-454f-b989-9103f108ef0a', '2a4b0b8a-b0d9-4ccb-a718-ef836cee7547']::uuid[]);
INSERT INTO learning_lessons (id, module_id, title, content, key_takeaways, order_index, estimated_minutes, resources, videos, tags, status)
VALUES
  ('0c8c3b20-547c-40ac-9a95-f3864a116b2b', 'c100001c-0000-0000-0000-00000000001c', 'Advanced Coordinate Computations', '', ARRAY[]::text[], 1, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published'),
  ('ca5cbe08-3766-4389-be5b-513e17479be8', 'c100001c-0000-0000-0000-00000000001c', 'Geodetic Concepts for RPLS', '', ARRAY[]::text[], 2, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published'),
  ('2aa90c7c-c09a-4dc0-9c2c-bd14f4f9c365', 'c100001c-0000-0000-0000-00000000001c', 'Boundary Analysis and Evidence Evaluation', '', ARRAY[]::text[], 3, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published'),
  ('f3aa8c68-5638-4f0c-9fb7-aed7fb503220', 'c100001c-0000-0000-0000-00000000001c', 'Complex Traverse Problems', '', ARRAY[]::text[], 4, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published'),
  ('370abca8-6a2f-4e77-8c73-9615d592af9a', 'c100001c-0000-0000-0000-00000000001c', 'Area Computation and Land Division', '', ARRAY[]::text[], 5, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published'),
  ('da06cbbe-3ed2-42aa-9e15-14807265501c', 'c100001c-0000-0000-0000-00000000001c', 'Construction Layout and Design Problems', '', ARRAY[]::text[], 6, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published'),
  ('42f97e15-6fd1-44a9-aedb-9e67438340eb', 'c100001c-0000-0000-0000-00000000001c', 'GPS Integration and Modern Methods', '', ARRAY[]::text[], 7, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published'),
  ('366b16ac-30f6-4400-b7c7-051edd5bf873', 'c100001c-0000-0000-0000-00000000001c', 'Survey Standards Compliance', '', ARRAY[]::text[], 8, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published'),
  ('7c610f13-f9d4-454f-b989-9103f108ef0a', 'c100001c-0000-0000-0000-00000000001c', 'RPLS Practice Problems — Practical', '', ARRAY[]::text[], 9, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published'),
  ('2a4b0b8a-b0d9-4ccb-a718-ef836cee7547', 'c100001c-0000-0000-0000-00000000001c', 'RPLS Full-Length Practice Exam Tips', '', ARRAY[]::text[], 10, 30, '[]'::jsonb, '[]'::jsonb, ARRAY['exam-prep','RPLS','practical','review'], 'published')
ON CONFLICT (id) DO UPDATE SET
  module_id = EXCLUDED.module_id, title = EXCLUDED.title, order_index = EXCLUDED.order_index,
  estimated_minutes = EXCLUDED.estimated_minutes, tags = EXCLUDED.tags, status = EXCLUDED.status;


-- --------------------------------------------------------------------------
-- Welcome Lesson (has HTML content as fallback; real content in lesson_blocks)
-- content_migrated flag is set by 011_curriculum_blocks.sql
-- --------------------------------------------------------------------------
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
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- SECTION 3: LEARNING TOPICS
-- ============================================================================

-- Topics for Welcome lesson
INSERT INTO learning_topics (lesson_id, title, content, order_index, keywords) VALUES
('22222222-2222-2222-2222-222222222200', 'Learning Hub Overview', 'The Starr Surveying Learning Hub contains modules, lessons, flashcards, quizzes, and a knowledge base. Each module focuses on a topic area and contains multiple lessons.', 1, ARRAY['learning hub','overview','modules']),
('22222222-2222-2222-2222-222222222200', 'Study Tools Available', 'Flashcards use SM-2 spaced repetition to optimize your review schedule. Quizzes test your knowledge. The Field Notebook lets you record observations. The Knowledge Base provides in-depth articles.', 2, ARRAY['flashcards','quizzes','notebook','knowledge base']),
('22222222-2222-2222-2222-222222222200', 'Career Paths in Surveying', 'In Texas, the licensing path goes: Surveyor Intern (SIT) then Registered Professional Land Surveyor (RPLS). The SIT exam tests fundamental knowledge, while the RPLS exam covers Texas law and advanced practice.', 3, ARRAY['SIT','RPLS','licensing','career'])
ON CONFLICT DO NOTHING;


-- ============================================================================
-- SECTION 4: FLASHCARDS (Company-wide built-in cards)
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

('Control Point', 'A survey point with precisely known coordinates used as a reference for other measurements.', 'A precisely known location that other measurements are based on', 'Often a brass disk set in concrete', 'C _ _ _ _ _ _ P _ _ _ _ (reference location)', 'c1000001-0000-0000-0000-000000000001', ARRAY['control point','reference','coordinates'], ARRAY['fieldwork','measurement'], 'fieldwork')

ON CONFLICT DO NOTHING;

-- The flashcard INSERT above supplies no `id` (so one is generated) and there is no unique
-- constraint on (module_id, term) — which means its `ON CONFLICT DO NOTHING` can never fire
-- and every run of this file inserted ANOTHER copy of all ~200 module-level cards. Re-runs had
-- silently built up to ~10 copies of terms like "RPLS".
--
-- Collapse them here, keeping the OLDEST row per (module_id, term) so any existing
-- user_flashcards references (FK on flashcard_id) stay pointed at the row they already know.
-- Scoped to lesson_id IS NULL: these module-level cards are never lesson-linked, whereas the
-- buildout seeds' cards are — so this can't touch them. Idempotent + self-healing: a re-run
-- inserts duplicates and this immediately removes them again.
DELETE FROM flashcards f
USING flashcards keep
WHERE f.lesson_id IS NULL
  AND keep.lesson_id IS NULL
  AND f.module_id IS NOT NULL
  AND f.module_id = keep.module_id
  AND f.term = keep.term
  AND (f.created_at, f.id) > (keep.created_at, keep.id);


-- Note: Article quiz questions are in 060_articles.sql (not duplicated here)

COMMIT;
