-- seeds/391_fs_prep_cr_metric_note.sql
-- Currency alignment with the official NCEES FS Reference Handbook (v2.5), which
-- presents curvature & refraction in SI. Add the metric form to the C&R template
-- explanation so students recognize both. Imperial 0.0206·F² (F in thousands of
-- ft) == metric 0.0675·K² (K in km); 0.0675·0.3048² = 0.0206. Verified vs
-- Kavanagh, Surveying with Construction Applications, §2.3.
BEGIN;
UPDATE problem_templates
SET explanation_template =
  'C_R = 0.0206·F² with F in thousands of feet (imperial). The official FS Reference Handbook gives the SI form c + r = 0.0675·K² with K in kilometres — the same relation (0.0675·0.3048² = 0.0206). Earth curvature dominates; refraction offsets ~1/7 of it.'
WHERE id = 'a5000003-0000-0000-0000-000000000004';

UPDATE question_bank
SET explanation =
  'C_R = 0.0206·F² (F in thousands of ft). Equivalent SI form from the FS Reference Handbook: c + r = 0.0675·K² (K in km). For example, F = 3 → 0.0206·9 = 0.185 ft.'
WHERE id = 'fbd77000-0000-0000-0000-000000000004';
COMMIT;
