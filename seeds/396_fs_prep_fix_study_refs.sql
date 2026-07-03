-- seeds/396_fs_prep_fix_study_refs.sql
-- Fix a defect in the buildout's study_references: QuizRunner renders type
-- 'module' refs as a link to /admin/learn/modules/{id}, but (a) FS modules live
-- in fs_study_modules viewed at a different route, and (b) our id was the module
-- NUMBER, not a UUID — so those links resolve to an empty page. The original FS
-- questions carry no study_references, so there's no canonical linking format.
-- Normalize every buildout ref to a safe label-only form (renders as "📚 label",
-- href='' — no broken navigation), prefixing module topics with "Review:".
BEGIN;
UPDATE question_bank q
SET study_references = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'type','handbook',
      'label', CASE WHEN e->>'type' = 'module'
                 THEN 'Review: ' || (e->>'label')
                 ELSE e->>'label' END))
  FROM jsonb_array_elements(q.study_references) e)
WHERE q.tags && ARRAY['fs-buildout-v2','fs-buildout-v3','fs-buildout-v4','fs-buildout-v5','fs-buildout-v6','fs-buildout-v7','fs-buildout-v8']::text[]
  AND q.study_references IS NOT NULL
  AND jsonb_array_length(q.study_references) > 0;
COMMIT;
