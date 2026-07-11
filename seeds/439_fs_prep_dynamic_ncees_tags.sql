-- 439_fs_prep_dynamic_ncees_tags.sql
-- FS Exam Alignment follow-up — tag the DYNAMIC (template-linked) FS questions
-- with their NCEES knowledge area (ncees-cat:1..7) so the FS Exam Simulator's
-- blueprint sampler can include number-varying questions alongside the static
-- bank. Seed 437 only tagged is_dynamic=false rows; this covers is_dynamic=true.
--   1 Surveying Processes & Methods   2 Mapping Processes & Methods
--   3 Boundary Law & Real Property     4 Surveying Principles
--   5 Survey Computations & Comp Apps  6 Business Concepts
--   7 Applied Mathematics & Statistics
-- Idempotent: strip existing ncees-cat:* tags on dynamic rows first, then re-tag.

-- 0) strip existing ncees-cat tags on dynamic FS rows
UPDATE question_bank
   SET tags = (SELECT COALESCE(array_agg(t), ARRAY[]::text[]) FROM unnest(tags) t WHERE t NOT LIKE 'ncees-cat:%')
 WHERE exam_category = 'FS' AND is_dynamic = true
   AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'ncees-cat:%');

-- 1) applied-math/stats override first (spans modules) → Cat 7
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:7']
 WHERE exam_category='FS' AND is_dynamic=true AND 'fs-mathstat'=ANY(tags)
   AND NOT (tags && ARRAY['ncees-cat:1','ncees-cat:2','ncees-cat:3','ncees-cat:4','ncees-cat:5','ncees-cat:6','ncees-cat:7']);

-- 2) map by module (only rows not yet categorized)
--    M1/M2/M3 → Cat 1 ;  M4/M5/M9 → Cat 5 ;  M6 → Cat 4 ;  M7 → Cat 3 ;  M8 → Cat 2 ;  M11 → Cat 6
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:1'] WHERE exam_category='FS' AND is_dynamic=true AND right(module_id::text,2) IN ('01','02','03') AND NOT EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'ncees-cat:%');
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:5'] WHERE exam_category='FS' AND is_dynamic=true AND right(module_id::text,2) IN ('04','05','09') AND NOT EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'ncees-cat:%');
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:4'] WHERE exam_category='FS' AND is_dynamic=true AND right(module_id::text,2) = '06' AND NOT EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'ncees-cat:%');
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:3'] WHERE exam_category='FS' AND is_dynamic=true AND right(module_id::text,2) = '07' AND NOT EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'ncees-cat:%');
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:2'] WHERE exam_category='FS' AND is_dynamic=true AND right(module_id::text,2) = '08' AND NOT EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'ncees-cat:%');
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:6'] WHERE exam_category='FS' AND is_dynamic=true AND right(module_id::text,2) = '0b' AND NOT EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'ncees-cat:%');
