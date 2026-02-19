-- ============================================================================
-- 080_milestones.sql
-- Curriculum milestones (part completions, exam readiness, certifications)
-- and per-module XP configuration for all 28 core + 8 FS modules.
-- Depends on: 010_curriculum.sql, 030_fs_prep.sql (module IDs must exist)
-- ============================================================================

BEGIN;

-- ── Curriculum Milestones ─────────────────────────────────────────────────

DELETE FROM user_milestone_progress;
DELETE FROM curriculum_milestones;

INSERT INTO curriculum_milestones (milestone_key, title, description, milestone_type, part_number, required_modules, sort_order, icon, color)
VALUES
  -- Part completion milestones (9 parts)
  ('part_1_complete',
   'Part I Complete — Foundations',
   'Completed all foundation modules covering history, mathematics, and measurement theory.',
   'part_complete', 1,
   ARRAY[
     'c1000001-0000-0000-0000-000000000001',
     'c1000002-0000-0000-0000-000000000002',
     'c1000003-0000-0000-0000-000000000003'
   ]::uuid[],
   1, '🏗️', '#1D3095'),

  ('part_2_complete',
   'Part II Complete — Field Techniques',
   'Completed all field technique modules covering distance, angle, and leveling measurement.',
   'part_complete', 2,
   ARRAY[
     'c1000004-0000-0000-0000-000000000004',
     'c1000005-0000-0000-0000-000000000005',
     'c1000006-0000-0000-0000-000000000006'
   ]::uuid[],
   2, '🔭', '#7C3AED'),

  ('part_3_complete',
   'Part III Complete — Coordinates & Computations',
   'Completed all coordinate system and computation modules covering datums, traverses, and area/volume calculations.',
   'part_complete', 3,
   ARRAY[
     'c1000007-0000-0000-0000-000000000007',
     'c1000008-0000-0000-0000-000000000008',
     'c1000009-0000-0000-0000-000000000009'
   ]::uuid[],
   3, '📐', '#0891B2'),

  ('part_4_complete',
   'Part IV Complete — Modern Technology',
   'Completed all modern technology modules covering total stations, GPS/GNSS, and emerging technologies.',
   'part_complete', 4,
   ARRAY[
     'c100000a-0000-0000-0000-00000000000a',
     'c100000b-0000-0000-0000-00000000000b',
     'c100000c-0000-0000-0000-00000000000c'
   ]::uuid[],
   4, '📡', '#059669'),

  ('part_5_complete',
   'Part V Complete — Boundary & Legal',
   'Completed all boundary and legal surveying modules covering property law, metes and bounds, Texas titles, and retracement.',
   'part_complete', 5,
   ARRAY[
     'c100000d-0000-0000-0000-00000000000d',
     'c100000e-0000-0000-0000-00000000000e',
     'c100000f-0000-0000-0000-00000000000f',
     'c1000010-0000-0000-0000-000000000010'
   ]::uuid[],
   5, '⚖️', '#D97706'),

  ('part_6_complete',
   'Part VI Complete — Subdivision & Construction',
   'Completed all subdivision, construction, and topographic surveying modules.',
   'part_complete', 6,
   ARRAY[
     'c1000011-0000-0000-0000-000000000011',
     'c1000012-0000-0000-0000-000000000012',
     'c1000013-0000-0000-0000-000000000013'
   ]::uuid[],
   6, '🏗️', '#DC2626'),

  ('part_7_complete',
   'Part VII Complete — Specialized Surveying',
   'Completed all specialized surveying modules covering geodetic, hydrographic, and mining surveying.',
   'part_complete', 7,
   ARRAY[
     'c1000014-0000-0000-0000-000000000014',
     'c1000015-0000-0000-0000-000000000015',
     'c1000016-0000-0000-0000-000000000016'
   ]::uuid[],
   7, '🌊', '#4F46E5'),

  ('part_8_complete',
   'Part VIII Complete — Professional Practice',
   'Completed all professional practice modules covering business management and Texas surveying law.',
   'part_complete', 8,
   ARRAY[
     'c1000017-0000-0000-0000-000000000017',
     'c1000018-0000-0000-0000-000000000018'
   ]::uuid[],
   8, '💼', '#7C3AED'),

  ('part_9_complete',
   'Part IX Complete — Exam Prep',
   'Completed all exam preparation modules for both SIT and RPLS exams.',
   'part_complete', 9,
   ARRAY[
     'c1000019-0000-0000-0000-000000000019',
     'c100001a-0000-0000-0000-00000000001a',
     'c100001b-0000-0000-0000-00000000001b',
     'c100001c-0000-0000-0000-00000000001c'
   ]::uuid[],
   9, '🎯', '#10B981'),

  -- Exam readiness milestones
  ('sit_exam_ready',
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
   10, '🎓', '#F59E0B'),

  ('rpls_exam_ready',
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
   11, '🏆', '#BD1218'),

  -- Certification milestones
  ('fundamentals_mastered',
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
   12, '⭐', '#1D3095'),

  ('texas_surveying_expert',
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
   13, '🌟', '#BD1218');

-- ── Per-Module XP Configuration ───────────────────────────────────────────

-- Part I – Foundations (beginner)
INSERT INTO module_xp_config (module_type, module_id, xp_value, expiry_months, difficulty_rating) VALUES
('learning_module', 'c1000001-0000-0000-0000-000000000001', 400, 20, 2),
('learning_module', 'c1000002-0000-0000-0000-000000000002', 450, 20, 2),
('learning_module', 'c1000003-0000-0000-0000-000000000003', 400, 20, 2),
('learning_module', 'c1000004-0000-0000-0000-000000000004', 400, 20, 2),
-- Part II – Field Techniques (intermediate)
('learning_module', 'c1000005-0000-0000-0000-000000000005', 500, 18, 3),
('learning_module', 'c1000006-0000-0000-0000-000000000006', 500, 18, 3),
-- Part III – Coordinate Systems (intermediate)
('learning_module', 'c1000007-0000-0000-0000-000000000007', 550, 18, 3),
('learning_module', 'c1000008-0000-0000-0000-000000000008', 550, 18, 3),
('learning_module', 'c1000009-0000-0000-0000-000000000009', 500, 18, 3),
-- Part IV – Modern Technology (intermediate/advanced)
('learning_module', 'c100000a-0000-0000-0000-00000000000a', 500, 18, 3),
('learning_module', 'c100000b-0000-0000-0000-00000000000b', 600, 15, 4),
('learning_module', 'c100000c-0000-0000-0000-00000000000c', 600, 15, 4),
-- Part V – Boundary & Legal (intermediate/advanced)
('learning_module', 'c100000d-0000-0000-0000-00000000000d', 550, 18, 3),
('learning_module', 'c100000e-0000-0000-0000-00000000000e', 500, 18, 3),
('learning_module', 'c100000f-0000-0000-0000-00000000000f', 550, 18, 3),
('learning_module', 'c1000010-0000-0000-0000-000000000010', 600, 15, 4),
-- Part VI – Subdivision & Construction (intermediate)
('learning_module', 'c1000011-0000-0000-0000-000000000011', 500, 18, 3),
('learning_module', 'c1000012-0000-0000-0000-000000000012', 500, 18, 3),
('learning_module', 'c1000013-0000-0000-0000-000000000013', 500, 18, 3),
-- Part VII – Specialized (advanced)
('learning_module', 'c1000014-0000-0000-0000-000000000014', 600, 15, 4),
('learning_module', 'c1000015-0000-0000-0000-000000000015', 600, 15, 4),
('learning_module', 'c1000016-0000-0000-0000-000000000016', 550, 15, 4),
-- Part VIII – Professional Practice (advanced)
('learning_module', 'c1000017-0000-0000-0000-000000000017', 550, 15, 4),
('learning_module', 'c1000018-0000-0000-0000-000000000018', 600, 15, 4),
-- Part IX – Exam Preparation
('learning_module', 'c1000019-0000-0000-0000-000000000019', 550, 12, 4),
('learning_module', 'c100001a-0000-0000-0000-00000000001a', 550, 12, 4),
('learning_module', 'c100001b-0000-0000-0000-00000000001b', 600, 12, 5),
('learning_module', 'c100001c-0000-0000-0000-00000000001c', 600, 12, 5)
ON CONFLICT DO NOTHING;

-- FS module XP config
INSERT INTO module_xp_config (module_type, module_id, xp_value, expiry_months, difficulty_rating) VALUES
('fs_module', 'f5000001-0000-0000-0000-000000000001', 450, 24, 3),
('fs_module', 'f5000002-0000-0000-0000-000000000002', 500, 24, 4),
('fs_module', 'f5000003-0000-0000-0000-000000000003', 500, 24, 4),
('fs_module', 'f5000004-0000-0000-0000-000000000004', 500, 24, 4),
('fs_module', 'f5000005-0000-0000-0000-000000000005', 500, 24, 4),
('fs_module', 'f5000006-0000-0000-0000-000000000006', 550, 24, 4),
('fs_module', 'f5000007-0000-0000-0000-000000000007', 500, 24, 4),
('fs_module', 'f5000008-0000-0000-0000-000000000008', 500, 24, 4)
ON CONFLICT DO NOTHING;

COMMIT;

SELECT 'Milestones and XP config seeded successfully.' AS status;
