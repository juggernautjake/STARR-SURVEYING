-- 437_fs_prep_ncees_category_tags.sql
-- FS Exam Alignment Buildout — Slice S24 (part 1).
-- Tag every static FS / FS-MOCK question with its NCEES knowledge area
-- (ncees-cat:1..7) so the exam simulator can sample a blueprint-balanced set.
--   1 Surveying Processes & Methods   2 Mapping Processes & Methods
--   3 Boundary Law & Real Property     4 Surveying Principles
--   5 Survey Computations & Comp Apps  6 Business Concepts
--   7 Applied Mathematics & Statistics
-- Idempotent: strip existing ncees-cat:* tags first, then re-tag.

-- 0) strip existing ncees-cat tags
UPDATE question_bank
   SET tags = (SELECT COALESCE(array_agg(t), ARRAY[]::text[]) FROM unnest(tags) t WHERE t NOT LIKE 'ncees-cat:%')
 WHERE exam_category IN ('FS','FS-MOCK') AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'ncees-cat:%');

-- 1) FS-MOCK: map the existing fs-mock-<area> tags
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:5'] WHERE exam_category='FS-MOCK' AND 'fs-mock-computations'=ANY(tags) AND NOT (tags && ARRAY['ncees-cat:5']);
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:4'] WHERE exam_category='FS-MOCK' AND 'fs-mock-principles'=ANY(tags)   AND NOT (tags && ARRAY['ncees-cat:4']);
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:3'] WHERE exam_category='FS-MOCK' AND 'fs-mock-boundary'=ANY(tags)     AND NOT (tags && ARRAY['ncees-cat:3']);
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:1'] WHERE exam_category='FS-MOCK' AND 'fs-mock-processes'=ANY(tags)    AND NOT (tags && ARRAY['ncees-cat:1']);
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:2'] WHERE exam_category='FS-MOCK' AND 'fs-mock-mapping'=ANY(tags)      AND NOT (tags && ARRAY['ncees-cat:2']);
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:7'] WHERE exam_category='FS-MOCK' AND 'fs-mock-math'=ANY(tags)         AND NOT (tags && ARRAY['ncees-cat:7']);
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:6'] WHERE exam_category='FS-MOCK' AND 'fs-mock-business'=ANY(tags)     AND NOT (tags && ARRAY['ncees-cat:6']);

-- 2) FS: applied-math/stats override first (spans modules) → Cat 7
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:7']
 WHERE exam_category='FS' AND is_dynamic=false AND 'fs-mathstat'=ANY(tags)
   AND NOT (tags && ARRAY['ncees-cat:1','ncees-cat:2','ncees-cat:3','ncees-cat:4','ncees-cat:5','ncees-cat:6','ncees-cat:7']);

-- 3) FS: map by module (only rows not yet categorized)
--    M1/M2/M3 → Cat 1 ;  M4/M5/M9 → Cat 5 ;  M6 → Cat 4 ;  M7 → Cat 3 ;  M8 → Cat 2 ;  M11 → Cat 6
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:1'] WHERE exam_category='FS' AND is_dynamic=false AND right(module_id::text,2) IN ('01','02','03') AND NOT EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'ncees-cat:%');
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:5'] WHERE exam_category='FS' AND is_dynamic=false AND right(module_id::text,2) IN ('04','05','09') AND NOT EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'ncees-cat:%');
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:4'] WHERE exam_category='FS' AND is_dynamic=false AND right(module_id::text,2) = '06' AND NOT EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'ncees-cat:%');
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:3'] WHERE exam_category='FS' AND is_dynamic=false AND right(module_id::text,2) = '07' AND NOT EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'ncees-cat:%');
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:2'] WHERE exam_category='FS' AND is_dynamic=false AND right(module_id::text,2) = '08' AND NOT EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'ncees-cat:%');
UPDATE question_bank SET tags = tags || ARRAY['ncees-cat:6'] WHERE exam_category='FS' AND is_dynamic=false AND right(module_id::text,2) = '0b' AND NOT EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE 'ncees-cat:%');
