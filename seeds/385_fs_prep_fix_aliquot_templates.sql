-- seeds/385_fs_prep_fix_aliquot_templates.sql
-- Fix two pre-existing invalid problem_templates: the aliquot/section-area
-- generators listed their computed divisors (d1/d2/d3, div) BOTH in
-- computed_vars (correct) AND as parameters of type 'computed' with no formula
-- (invalid — validateTemplate rejects them, and generation relied on
-- computed_vars overriding a NaN→0). Remove the redundant parameter entries so
-- the templates validate; behavior (answers) is unchanged.
BEGIN;

UPDATE problem_templates
SET parameters = '[
  {"name":"f1","type":"choice","choices":["half","quarter"]},
  {"name":"f2","type":"choice","choices":["half","quarter"]},
  {"name":"f3","type":"choice","choices":["half","quarter"]}
]'::jsonb
WHERE id = 'fb075000-0000-0000-0000-000000000001';

UPDATE problem_templates
SET parameters = '[
  {"name":"frac","type":"choice","choices":["a quarter section (e.g., the NE¼)","a half section (e.g., the N½)","a quarter-quarter (e.g., the NE¼ of the SW¼)","a half of a quarter (e.g., the N½ of the NW¼)"]}
]'::jsonb
WHERE id = 'fb075000-0000-0000-0000-000000000002';

COMMIT;
