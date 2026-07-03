-- seeds/379_fs_prep_review_chart.sql
-- SIT / FS exam-prep — study-priority chart in the Comprehensive Review module.
-- NOTE (data): fs_study_modules.exam_weight_percent for modules 1–8 currently
-- sums to 121, not 100. The chart is therefore framed as *relative/approximate*
-- emphasis (ranking), not a literal "% of exam". The office should reconcile
-- the stored weights against the current official NCEES FS specification.
BEGIN;
CREATE OR REPLACE FUNCTION fs_add_figure(p_mod int, p_type text, p_fig text)
RETURNS void AS $fn$
DECLARE arr jsonb; i int; el jsonb;
BEGIN
  SELECT content_sections INTO arr FROM fs_study_modules WHERE module_number = p_mod;
  IF arr IS NULL THEN RETURN; END IF;
  FOR i IN 0 .. jsonb_array_length(arr) - 1 LOOP
    el := arr -> i;
    IF el ->> 'type' = p_type THEN
      IF position(p_fig IN coalesce(el ->> 'content', '')) = 0 THEN
        arr := jsonb_set(arr, ARRAY[i::text, 'content'], to_jsonb((el ->> 'content') || E'\n\n' || p_fig));
      END IF;
    END IF;
  END LOOP;
  UPDATE fs_study_modules SET content_sections = arr WHERE module_number = p_mod;
END;
$fn$ LANGUAGE plpgsql;
SELECT fs_add_figure(10, 'overview',
  '![Approximate exam emphasis by topic, ranked. Traversing/COGO and Boundary Law carry the most weight — prioritize them. Figures are relative/approximate; confirm the current split on the official NCEES FS specification before exam day.](/lessons/fs/diagrams/exam-emphasis.svg "Original diagram — Starr SIT Prep")');
DROP FUNCTION IF EXISTS fs_add_figure(int, text, text);
COMMIT;
