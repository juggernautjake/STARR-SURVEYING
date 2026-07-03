-- seeds/395_fs_prep_revert_redundant_examples.sql
-- Revert seeds 393/394: on a quality spot-read, the examples sections of modules
-- 1/2/3 already contained 5–6 worked examples covering these exact topics (e.g.
-- M1 "Example 1 — Mean/SD/SEM", M3 "Example 2 — Slope → horizontal"). The low
-- char count was misleading (dense prose). Strip the redundant appended blocks
-- so the lessons don't carry duplicate examples.
BEGIN;
UPDATE fs_study_modules m
SET content_sections = (
  SELECT jsonb_agg(
    CASE WHEN cs->>'type' = 'examples'
      THEN jsonb_set(cs, '{content}',
             to_jsonb(regexp_replace(cs->>'content', E'\n\n### Worked example:.*$', '')))
      ELSE cs END)
  FROM jsonb_array_elements(m.content_sections) cs)
WHERE m.module_number IN (1,2,3);
COMMIT;
